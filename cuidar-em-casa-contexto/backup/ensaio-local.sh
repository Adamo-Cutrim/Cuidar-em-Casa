#!/usr/bin/env bash
# ENSAIO LOCAL do backup: roda o backup e a restauracao de ponta a ponta com um PostgreSQL 17 de verdade, no Docker, com dados ficticios.
# Nao toca no seu banco real nem na internet (so baixa as imagens). Use depois de mexer nos scripts, e como treino de restauracao.
# Precisa de: Docker em execucao. Uso: backup/ensaio-local.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1      # Git Bash no Windows: nao "traduzir" caminhos dentro dos comandos do docker

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
SQL="$RAIZ/backend/sql"
caminho_docker() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }   # C:/... no Windows, caminho normal no Linux/macOS

ID="$$"; REDE="bk-rede-$ID"; ORIGEM="bk-origem-$ID"; DESTINO="bk-destino-$ID"; IMG_CLIENTE="bk-cliente:17"
SENHA_PG="ensaio-postgres"; SENHA_BK="ensaio-leitura-$ID"
WORK="$(mktemp -d)"
OK=0; FALHA=0
limpar() { docker rm -f "$ORIGEM" "$DESTINO" >/dev/null 2>&1 || true; docker network rm "$REDE" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap limpar EXIT

verifica() { # verifica "descricao" comando...   (passa se o comando sair com 0)
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then OK=$((OK+1)); printf '  \033[32mOK\033[0m     %s\n' "$d"; else FALHA=$((FALHA+1)); printf '  \033[31mFALHA\033[0m  %s\n' "$d"; fi
}
deve_falhar() { # deve_falhar "descricao" comando...   (passa se o comando SAIR com erro)
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then FALHA=$((FALHA+1)); printf '  \033[31mFALHA\033[0m  %s (era para recusar)\n' "$d"; else OK=$((OK+1)); printf '  \033[32mOK\033[0m     %s (recusou, como deve)\n' "$d"; fi
}
psql_em() { local c="$1"; shift; docker exec -i "$c" psql -U postgres -X -At -v ON_ERROR_STOP=1 "$@"; }
cliente() { docker run --rm --network "$REDE" -v "$(caminho_docker "$WORK"):/work" -w /work "$IMG_CLIENTE" "$@"; }

echo "== 1. Preparando: rede, imagem de ferramentas (PostgreSQL 17 + age) e dois bancos vazios"
docker info >/dev/null 2>&1 || { echo "O Docker nao esta em execucao. Abra o Docker Desktop e tente de novo."; exit 2; }
docker network create "$REDE" >/dev/null
docker build -q -t "$IMG_CLIENTE" - >/dev/null <<'DOCKERFILE'
FROM postgres:17
RUN apt-get update -qq && apt-get install -y -qq age >/dev/null && rm -rf /var/lib/apt/lists/*
DOCKERFILE
for c in "$ORIGEM" "$DESTINO"; do docker run -d --name "$c" --network "$REDE" -e POSTGRES_PASSWORD="$SENHA_PG" postgres:17 >/dev/null; done
for c in "$ORIGEM" "$DESTINO"; do for _ in $(seq 1 60); do docker exec "$c" pg_isready -U postgres -q 2>/dev/null && break; sleep 1; done; done
sleep 2
for c in "$ORIGEM" "$DESTINO"; do for _ in $(seq 1 30); do psql_em "$c" -c "select 1" >/dev/null 2>&1 && break; sleep 1; done; done

echo "== 2. Montando o banco de ORIGEM: esqueleto do Supabase + as migracoes reais do projeto + dados ficticios"
psql_em "$ORIGEM" -q < "$AQUI/ensaio/esqueleto-supabase.sql"
psql_em "$DESTINO" -q < "$AQUI/ensaio/esqueleto-supabase.sql"
for f in "$SQL"/2026-11-17/2026*.sql "$SQL/2026-11-18_migracoes_aplicadas.sql" "$SQL/2026-11-18_remove_site_stage.sql" "$SQL/2026-11-24_valor_snapshot.sql" "$SQL/2026-11-24_tipo_ligado.sql"; do
  psql_em "$ORIGEM" -q < "$f" >/dev/null || { echo "ERRO ao aplicar $f"; exit 1; }
done
psql_em "$ORIGEM" -q < "$AQUI/ensaio/dados-de-exemplo.sql" >/dev/null
sed "s/__SENHA__/$SENHA_BK/g" "$AQUI/sql/backup_ro.sql" | psql_em "$ORIGEM" -q >/dev/null
echo "   origem: $(psql_em "$ORIGEM" -c "select count(*) from public.patients") pacientes, $(psql_em "$ORIGEM" -c "select count(*) from public.visits") atendimentos, $(psql_em "$ORIGEM" -c "select count(*) from auth.users") usuarios"
verifica "o esquema real foi montado (6 tabelas do app + profiles)" test "$(psql_em "$ORIGEM" -c "select count(*) from pg_tables where schemaname='public'")" = "7"

echo "== 3. Chaves de cifragem (como o assistente faz) e o BACKUP"
mkdir -p "$WORK/scripts" "$WORK/saida"
cp "$AQUI/repositorio-privado/scripts/"*.sh "$WORK/scripts/"
cliente bash -c "age-keygen -o chave-privada.txt 2>chave-publica-saida.txt && sed -n 's/^Public key: //p' chave-publica-saida.txt > chave-publica.txt && age-keygen -o chave-errada.txt 2>/dev/null"
PUB="$(tr -d '\r\n' < "$WORK/chave-publica.txt")"
URL_BK="postgresql://backup_ro:$SENHA_BK@$ORIGEM:5432/postgres"
cliente env DB_URL="$URL_BK" AGE_PUBLIC_KEY="$PUB" bash scripts/fazer-backup.sh > "$WORK/log-backup.txt" 2>&1 && R=0 || R=$?
sed 's/^/   | /' "$WORK/log-backup.txt" | tail -22
verifica "o backup terminou sem erro" test "$R" = "0"
ARQ="$(ls "$WORK"/saida/*.age 2>/dev/null | head -1 || true)"
verifica "gerou o arquivo cifrado .age" test -s "$ARQ"
verifica "na pasta de saida so ha o .age e o resumo (nenhum dado em claro)" test "$(find "$WORK/saida" -type f | wc -l)" = "2"
verifica "o arquivo cifrado NAO contem texto de paciente (cifragem de verdade)" bash -c "! grep -aq 'Ávila\|Zeferina\|Dipirona\|ana@ensaio' '$ARQ'"
verifica "o resumo NAO contem nome, e-mail nem endereco" bash -c "! grep -aqi 'Ávila\|Zeferina\|ana@\|Acácias' '$WORK/saida/resumo.txt'"
verifica "o resumo traz as contagens" grep -q 'patients|3' "$WORK/saida/resumo.txt"
verifica "o log do backup NAO mostra a senha do banco" bash -c "! grep -q '$SENHA_BK' '$WORK/log-backup.txt'"

echo "== 4. Recusas (o backup tem de falhar de proposito nestes casos)"
deve_falhar "usuario administrador (postgres) em vez da role de leitura" cliente env DB_URL="postgresql://postgres:$SENHA_PG@$ORIGEM:5432/postgres" AGE_PUBLIC_KEY="$PUB" SAIDA=/work/saida-adm bash scripts/fazer-backup.sh
deve_falhar "chave PRIVADA colada no lugar da publica" cliente env DB_URL="$URL_BK" AGE_PUBLIC_KEY="$(grep -o 'AGE-SECRET-KEY-[A-Z0-9]*' "$WORK/chave-privada.txt")" SAIDA=/work/saida-x bash scripts/fazer-backup.sh
deve_falhar "senha do banco errada" cliente env DB_URL="postgresql://backup_ro:errada@$ORIGEM:5432/postgres" AGE_PUBLIC_KEY="$PUB" SAIDA=/work/saida-y bash scripts/fazer-backup.sh
deve_falhar "sem a chave publica" cliente env DB_URL="$URL_BK" SAIDA=/work/saida-z bash scripts/fazer-backup.sh
deve_falhar "a role de leitura NAO consegue escrever" psql_em "$ORIGEM" -c "set role backup_ro; insert into public.patients (user_id, nome) values ('aaaaaaaa-0000-4000-8000-00000000000a','x')"
deve_falhar "a role de leitura NAO le auth.users direto" psql_em "$ORIGEM" -c "set role backup_ro; select * from auth.users"

echo "== 5. RESTAURACAO num banco novo e vazio"
cliente bash scripts/restaurar.sh "/work/saida/$(basename "$ARQ")" /work/chave-privada.txt "postgresql://postgres:$SENHA_PG@$DESTINO:5432/postgres" > "$WORK/log-restaura.txt" 2>&1 && R=0 || R=$?
sed 's/^/   | /' "$WORK/log-restaura.txt" | tail -24
verifica "a restauracao terminou sem erro (e as contagens batem)" test "$R" = "0"
deve_falhar "chave ERRADA nao abre o backup" cliente bash scripts/restaurar.sh "/work/saida/$(basename "$ARQ")" /work/chave-errada.txt "postgresql://postgres:$SENHA_PG@$DESTINO:5432/postgres"
cp "$ARQ" "$WORK/saida/adulterado.age"; printf 'X' | dd of="$WORK/saida/adulterado.age" bs=1 seek=300 conv=notrunc 2>/dev/null
deve_falhar "arquivo ADULTERADO nao e aceito" cliente bash scripts/restaurar.sh /work/saida/adulterado.age /work/chave-privada.txt "postgresql://postgres:$SENHA_PG@$DESTINO:5432/postgres"
deve_falhar "restaurar em destino que NAO esta vazio e recusado (nunca sobrescreve)" cliente bash scripts/restaurar.sh "/work/saida/$(basename "$ARQ")" /work/chave-privada.txt "postgresql://postgres:$SENHA_PG@$DESTINO:5432/postgres"

echo "== 6. Comparando origem x destino (conteudo, nao so contagem)"
for t in $(psql_em "$ORIGEM" -c "select tablename from pg_tables where schemaname='public' order by 1"); do
  A="$(psql_em "$ORIGEM"  -c "select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.$t x" 2>/dev/null)" || A="erro-na-origem"
  B="$(psql_em "$DESTINO" -c "select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.$t x" 2>/dev/null)" || B="erro-no-destino"
  verifica "tabela $t: as linhas sao identicas (md5 ${A:0:8})" test "$A" = "$B"
done
estrutura="select (select count(*) from pg_policies where schemaname='public')||'/'||(select count(*) from pg_indexes where schemaname='public')||'/'||(select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public')||'/'||(select count(*) from pg_trigger t join pg_class k on k.oid=t.tgrelid join pg_namespace n on n.oid=k.relnamespace where n.nspname='public' and not t.tgisinternal)"
verifica "estrutura igual (politicas RLS / indices / restricoes / gatilhos)" test "$(psql_em "$ORIGEM" -c "$estrutura")" = "$(psql_em "$DESTINO" -c "$estrutura")"
verifica "permissoes reaplicadas no destino (anon sem acesso; usuario logado sem TRUNCATE e com UPDATE)" test "$(psql_em "$DESTINO" -c "select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'truncate') or not has_table_privilege('authenticated', c.oid, 'update'))")" = "0"
verifica "RLS continua ligada em todas as tabelas do destino" test "$(psql_em "$DESTINO" -c "select count(*) from pg_tables where schemaname='public' and not rowsecurity")" = "0"
verifica "contas recriadas com os mesmos ids e e-mails" test "$(psql_em "$ORIGEM" -c "select string_agg(id||email, ',' order by id) from auth.users")" = "$(psql_em "$DESTINO" -c "select string_agg(id||email, ',' order by id) from auth.users")"
verifica "cada conta tem identidade de e-mail (para o 'Esqueci a senha')" test "$(psql_em "$DESTINO" -c "select count(*) from auth.users u where not exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='email')")" = "0"
verifica "o destino nao ficou com a role de backup nem o schema backup" test "$(psql_em "$DESTINO" -c "select (select count(*) from pg_roles where rolname='backup_ro')+(select count(*) from pg_namespace where nspname='backup')")" = "0"

echo
printf '== Resultado do ensaio: %s verificacoes OK, %s falhas\n' "$OK" "$FALHA"
[[ "$FALHA" == "0" ]]
