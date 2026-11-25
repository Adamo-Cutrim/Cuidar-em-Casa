#!/usr/bin/env bash
# Ensaio da migracao 2026-11-25_segredo_do_aparelho.sql num PostgreSQL 17 descartavel (Docker), com as migracoes reais do projeto.
# Nao toca no Supabase. Confere: cada conta recebe o PROPRIO segredo, estavel; ninguem le a tabela direto; anonimo nao chama;
# excluir a conta apaga o segredo.
# Uso: fonte-e-ferramentas/testes/ensaio-segredo-aparelho.sh   (precisa do Docker)
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; SQL="$AQUI/../../backend/sql"
C="ensaio-segredo-$$"; OK=0; FALHA=0
trap 'docker rm -f "$C" >/dev/null 2>&1 || true' EXIT
verifica() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then OK=$((OK+1)); echo "  OK     $d"; else FALHA=$((FALHA+1)); echo "  FALHA  $d"; fi; }
q() { docker exec -i "$C" psql -U postgres -X -At -v ON_ERROR_STOP=1 "$@"; }
falha() { ! "$@"; }
docker run -d --name "$C" -e POSTGRES_PASSWORD=ensaio postgres:17 >/dev/null
for _ in $(seq 1 40); do q -c "select 1" >/dev/null 2>&1 && break; sleep 1; done

q -q <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema if not exists extensions; create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
SQL
for f in "$SQL"/2026-11-17/2026*.sql "$SQL/2026-11-18_migracoes_aplicadas.sql" "$SQL/2026-11-18_remove_site_stage.sql" "$SQL/2026-11-24_valor_snapshot.sql" "$SQL/2026-11-24_tipo_ligado.sql" "$SQL/2026-11-24_permissoes_minimas_e_datas_protegidas.sql" "$SQL/2026-11-25_limite_de_registros_por_conta.sql" "$SQL/2026-11-25_excluir_minha_conta.sql" "$SQL/2026-11-25_segredo_do_aparelho.sql"; do
  q -q < "$f" >/dev/null || { echo "ERRO ao aplicar $(basename "$f")"; exit 1; }
done
A=aaaaaaaa-0000-4000-8000-00000000000a; B=bbbbbbbb-0000-4000-8000-00000000000b
q -q -c "insert into auth.users (id, email) values ('$A','ana@ensaio.test'), ('$B','bia@ensaio.test')"
como() { q -c "set role $1; select set_config('request.jwt.claims', '$2', false) is null; $3" | tail -1; }
claims() { printf '{"sub":"%s","role":"authenticated","amr":[{"method":"password","timestamp":%s}]}' "$1" "$(date +%s)"; }

echo "== segredo"
SA1=$(como authenticated "$(claims $A)" "select public.segredo_do_aparelho()")
SA2=$(como authenticated "$(claims $A)" "select public.segredo_do_aparelho()")
SB1=$(como authenticated "$(claims $B)" "select public.segredo_do_aparelho()")
verifica "a Ana recebe um segredo longo (64 caracteres hexadecimais)" bash -c "[[ '$SA1' =~ ^[0-9a-f]{64}$ ]]"
verifica "o segredo da Ana e estavel (a segunda chamada devolve o mesmo)" test "$SA1" = "$SA2"
verifica "a Bia recebe outro segredo" test -n "$SB1" -a "$SA1" != "$SB1"
verifica "anonimo NAO pode chamar" falha como anon '{"role":"anon"}' "select public.segredo_do_aparelho()"
verifica "sem login (sem sub) recusa" falha como authenticated '{"role":"authenticated"}' "select public.segredo_do_aparelho()"
verifica "usuario logado NAO le a tabela direto" falha como authenticated "$(claims $A)" "select segredo from public.segredos_aparelho"
verifica "usuario logado NAO grava na tabela direto" falha como authenticated "$(claims $A)" "update public.segredos_aparelho set segredo = repeat('0', 64)"
verifica "a funcao nao aceita parametro (nao da para pedir o segredo de outra conta)" falha q -c "select public.segredo_do_aparelho('$B'::uuid)"
verifica "permissoes: security definer, anon sem execucao, logado com execucao, tabela fechada com RLS" test "$(q -c "select p.prosecdef, has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'), has_table_privilege('authenticated', 'public.segredos_aparelho', 'select'), c.relrowsecurity from pg_proc p, pg_class c where p.oid = 'public.segredo_do_aparelho()'::regprocedure and c.oid = 'public.segredos_aparelho'::regclass")" = "t|f|t|f|t"

echo "== exclusao da conta"
verifica "excluir a conta da Ana (excluir_minha_conta) funciona com a tabela nova" como authenticated "$(claims $A)" "select public.excluir_minha_conta()"
verifica "o segredo da Ana sumiu junto; o da Bia ficou" test "$(q -c "select string_agg(user_id::text, ',') from public.segredos_aparelho")" = "$B"
echo; echo "== Resultado: $OK OK, $FALHA falhas"
[[ "$FALHA" == "0" ]]
