#!/usr/bin/env bash
# Restaura um backup do Cuidar em Casa num banco Supabase NOVO E VAZIO (nunca sobrescreve nada existente).
#
# Uso:  restaurar.sh ARQUIVO.tar.gz.age  CHAVE_PRIVADA.txt  URL_DO_BANCO_DESTINO
#   - URL do destino: a do projeto NOVO (usuario postgres), do painel Connect. Precisa de PostgreSQL client 17 e do age.
#   - Faca isto primeiro num projeto de TESTE: um backup que nunca foi restaurado nao conta como backup.
set -euo pipefail
set +x
ARQUIVO="${1:?uso: restaurar.sh ARQUIVO.tar.gz.age CHAVE_PRIVADA.txt URL_DESTINO}"
CHAVE="${2:?falta o arquivo da chave privada}"
DESTINO="${3:?falta a URL do banco de destino}"
erro() { printf 'ERRO: %s\n' "$1" >&2; exit 1; }
for c in age psql pg_restore tar; do command -v "$c" >/dev/null 2>&1 || erro "falta a ferramenta: $c"; done
[[ -f "$ARQUIVO" ]] || erro "nao achei $ARQUIVO"
[[ -f "$CHAVE" ]]   || erro "nao achei a chave $CHAVE"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "1/6 Abrindo o backup (decifrando)..."
age -d -i "$CHAVE" "$ARQUIVO" | tar -xz -C "$TMP" || erro "nao consegui abrir. Chave errada, ou o arquivo esta corrompido."
for f in public.dump usuarios.csv contagens.txt; do [[ -s "$TMP/$f" ]] || erro "o backup nao tem $f"; done
echo "    conteudo (contagens de quando o backup foi feito):"; sed 's/^/      /' "$TMP/contagens.txt"

echo "2/6 Conferindo que o destino esta VAZIO (este script nunca sobrescreve)..."
existentes=$(psql "$DESTINO" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")
[[ "$existentes" == "0" ]] || erro "o destino ja tem $existentes tabela(s) em public. Use um projeto novo e vazio."

echo "3/6 Recriando as contas (mesmos ids e e-mails; as senhas NAO vao no backup)..."
psql "$DESTINO" -X -v ON_ERROR_STOP=1 <<SQL
create temp table _usuarios (id uuid, email text, created_at timestamptz, raw_user_meta_data jsonb);
\\copy _usuarios from '$TMP/usuarios.csv' csv header
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
         '{"provider":"email","providers":["email"]}'::jsonb, coalesce(raw_user_meta_data, '{}'::jsonb), created_at, now()
    from _usuarios on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true, 'phone_verified', false), 'email', created_at, now()
    from _usuarios u where not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');
SQL

echo "4/6 Restaurando as tabelas e os dados do schema public..."
# O schema public JA EXISTE no destino (e traz as permissoes da API do Supabase): nao o recriamos nem o apagamos (nada de --clean).
pg_restore --list "$TMP/public.dump" | grep -vE '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public |COMMENT - SCHEMA public' > "$TMP/lista.txt"
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --use-list="$TMP/lista.txt" -d "$DESTINO" "$TMP/public.dump"

echo "5/6 Conferindo as contagens (backup x destino)..."
diferencas=0
while IFS='|' read -r tabela esperado; do
  obtido=$(psql "$DESTINO" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.\"$tabela\"")
  if [[ "$obtido" == "$esperado" ]]; then printf '      %-24s %6s  ok\n' "$tabela" "$obtido"
  else printf '      %-24s esperado %s, restaurado %s  <-- DIFERENTE\n' "$tabela" "$esperado" "$obtido"; diferencas=$((diferencas+1)); fi
done < "$TMP/contagens.txt"
(( diferencas == 0 )) || erro "$diferencas tabela(s) com contagem diferente. (Pode ser so gravacao durante a copia; confira.)"

echo "6/6 Pronto."
echo "    Proximos passos: (1) aponte o app para este projeto (URL e chave publica novas);"
echo "                     (2) cada pessoa entra por 'Esqueci a senha' (as senhas nao vao no backup);"
echo "                     (3) no painel do Supabase, confira Authentication > Users."
