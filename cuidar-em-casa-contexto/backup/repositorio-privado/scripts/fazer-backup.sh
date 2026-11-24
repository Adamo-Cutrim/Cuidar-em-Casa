#!/usr/bin/env bash
# Backup do banco do Cuidar em Casa. Copia o schema public (estrutura + dados de todos os usuarios) e a lista de usuarios,
# e CIFRA tudo antes de qualquer arquivo sair desta maquina. Roda no GitHub Actions (repositorio PRIVADO) e tambem local (ensaio).
#
# Variaveis:  DB_URL          (obrigatoria)  URL do banco com a role de leitura backup_ro. NUNCA e impressa.
#             AGE_PUBLIC_KEY  (obrigatoria)  chave PUBLICA age (age1...). So ela cifra; a privada fica com o usuario.
#             SAIDA           (opcional)     pasta de saida (padrao: saida). Recebe SO o arquivo .age e o resumo.
set -euo pipefail
set +x   # a URL do banco tem senha: nunca mostrar comandos

DB_URL="${DB_URL:?faltou DB_URL (URL do banco com a role backup_ro)}"
AGE_PUBLIC_KEY="${AGE_PUBLIC_KEY:?faltou AGE_PUBLIC_KEY (chave publica age1...)}"
SAIDA="${SAIDA:-saida}"
MIN_BYTES=2000

erro() { printf 'ERRO: %s\n' "$1" >&2; exit 1; }

[[ "$AGE_PUBLIC_KEY" =~ ^age1[0-9a-z]{58}$ ]] || erro "AGE_PUBLIC_KEY nao parece uma chave publica age (age1 + 58 caracteres). Voce colou a chave PRIVADA por engano?"
for c in pg_dump pg_restore psql age tar sha256sum; do command -v "$c" >/dev/null 2>&1 || erro "falta a ferramenta: $c"; done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$SAIDA"
rm -f "$SAIDA"/*.age "$SAIDA"/resumo.txt

echo "1/6 Conferindo a conexao e o usuario do banco..."
IFS='|' read -r usuario superusuario versao < <(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select current_user, (select rolsuper from pg_roles where rolname = current_user), current_setting('server_version')")
if [[ "$usuario" == "postgres" || "$superusuario" == "t" ]] && [[ "${PERMITIR_USUARIO_ADMIN:-0}" != "1" ]]; then
  erro "o backup esta usando o usuario '$usuario' (administrador). Use a role de leitura backup_ro (veja backup/README.md)."
fi
echo "    usuario: $usuario | PostgreSQL do servidor: $versao"

echo "2/6 Copiando o schema public (estrutura e dados)..."
pg_dump "$DB_URL" --schema=public --no-owner --no-privileges --format=custom --file="$TMP/public.dump"

echo "3/6 Copiando a lista de usuarios (para recriar as contas na restauracao)..."
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "\\copy (select id, email, created_at, raw_user_meta_data from backup.usuarios order by created_at, id) to '$TMP/usuarios.csv' csv header"

echo "4/6 Contando as linhas de cada tabela (para conferir na restauracao)..."
psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 > "$TMP/contagens.txt" <<'SQL'
select format('select %L, count(*) from public.%I', tablename, tablename) from pg_tables where schemaname = 'public' order by tablename
\gexec
SQL

echo "5/6 Conferindo se a copia esta inteira (copia vazia ou truncada falha de proposito)..."
tamanho=$(wc -c < "$TMP/public.dump")
(( tamanho >= MIN_BYTES )) || erro "a copia ficou com $tamanho bytes (esperado pelo menos $MIN_BYTES). Algo esta errado; nada foi guardado."
tabelas=$(wc -l < "$TMP/contagens.txt")
(( tabelas >= 1 )) || erro "nenhuma tabela encontrada no schema public"
dados=$(pg_restore --list "$TMP/public.dump" | grep -c 'TABLE DATA' || true)
(( dados == tabelas )) || erro "a copia tem dados de $dados tabela(s), mas o banco tem $tabelas. Nada foi guardado."
grep -Eq '^[a-z_]+\|[0-9]+$' "$TMP/contagens.txt" || erro "arquivo de contagens em formato inesperado"
[[ "$(grep -c . "$TMP/usuarios.csv")" -ge 2 ]] || erro "a lista de usuarios veio vazia"

echo "6/6 Cifrando (so a chave PRIVADA, que esta com voce, abre este arquivo)..."
carimbo="$(date -u +%Y%m%d-%H%M%S)"
tar -C "$TMP" -czf "$TMP/pacote.tar.gz" public.dump usuarios.csv contagens.txt
arquivo="$SAIDA/cuidar-em-casa-$carimbo.tar.gz.age"
age -r "$AGE_PUBLIC_KEY" -o "$arquivo" "$TMP/pacote.tar.gz"
[[ -s "$arquivo" ]] || erro "o arquivo cifrado ficou vazio"

# O resumo NAO tem dado pessoal: so datas, tamanhos, impressao digital do arquivo cifrado e CONTAGENS de linhas por tabela.
{
  echo "data_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "arquivo: $(basename "$arquivo")"
  echo "tamanho_cifrado_bytes: $(wc -c < "$arquivo")"
  echo "sha256_do_arquivo_cifrado: $(sha256sum "$arquivo" | cut -d' ' -f1)"
  echo "postgresql_do_servidor: $versao"
  echo "usuarios: $(( $(grep -c . "$TMP/usuarios.csv") - 1 ))"
  echo "contagens:"; sed 's/^/  /' "$TMP/contagens.txt"
} > "$SAIDA/resumo.txt"

# Trava final: na pasta de saida so pode haver o arquivo .age e o resumo (nunca dado em claro).
sobra=$(find "$SAIDA" -type f ! -name '*.age' ! -name 'resumo.txt' | wc -l)
(( sobra == 0 )) || erro "ha arquivo inesperado em $SAIDA (possivel dado em claro). Abortando."
echo "OK: $(basename "$arquivo") ($(wc -c < "$arquivo") bytes cifrados)"
cat "$SAIDA/resumo.txt"
