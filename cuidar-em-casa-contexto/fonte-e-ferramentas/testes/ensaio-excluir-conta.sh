#!/usr/bin/env bash
# Ensaio da migracao 2026-11-25_excluir_minha_conta.sql num PostgreSQL 17 descartavel (Docker), com as migracoes reais do projeto.
# Nao toca no Supabase. Confere: apaga so a conta de quem chama, com todos os dados (cascata); recusa sem login recente com senha;
# recusa anonimo; a outra conta fica intacta.
# Uso: fonte-e-ferramentas/testes/ensaio-excluir-conta.sh   (precisa do Docker)
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; SQL="$AQUI/../../backend/sql"
C="ensaio-excluir-$$"; OK=0; FALHA=0
trap 'docker rm -f "$C" >/dev/null 2>&1 || true' EXIT
verifica() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then OK=$((OK+1)); echo "  OK     $d"; else FALHA=$((FALHA+1)); echo "  FALHA  $d"; fi; }
q() { docker exec -i "$C" psql -U postgres -X -At -v ON_ERROR_STOP=1 "$@"; }
docker run -d --name "$C" -e POSTGRES_PASSWORD=ensaio postgres:17 >/dev/null
for _ in $(seq 1 40); do q -c "select 1" >/dev/null 2>&1 && break; sleep 1; done

# Esqueleto minimo do Supabase: papeis, auth.users e as funcoes auth.uid() / auth.jwt() lendo request.jwt.claims (como o PostgREST).
q -q <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema if not exists extensions; create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
SQL
for f in "$SQL"/2026-11-17/2026*.sql "$SQL/2026-11-18_migracoes_aplicadas.sql" "$SQL/2026-11-18_remove_site_stage.sql" "$SQL/2026-11-24_valor_snapshot.sql" "$SQL/2026-11-24_tipo_ligado.sql" "$SQL/2026-11-24_permissoes_minimas_e_datas_protegidas.sql" "$SQL/2026-11-25_limite_de_registros_por_conta.sql" "$SQL/2026-11-25_excluir_minha_conta.sql"; do
  q -q < "$f" >/dev/null || { echo "ERRO ao aplicar $(basename "$f")"; exit 1; }
done

A=aaaaaaaa-0000-4000-8000-00000000000a; B=bbbbbbbb-0000-4000-8000-00000000000b
q -q <<SQL
insert into auth.users (id, email) values ('$A','ana@ensaio.test'), ('$B','bia@ensaio.test');
insert into auth.sessions (user_id) values ('$A'), ('$B');
insert into public.profiles (user_id, nome) values ('$A','Ana'), ('$B','Bia');
insert into public.companies (id, user_id, nome) values ('c0000000-0000-4000-8000-00000000000a','$A','Emp A'), ('c0000000-0000-4000-8000-00000000000b','$B','Emp B');
insert into public.service_types (user_id, nome) values ('$A','Curativo'), ('$B','Curativo');
insert into public.patients (id, user_id, company_id, nome) values ('d0000000-0000-4000-8000-00000000000a','$A','c0000000-0000-4000-8000-00000000000a','Pac A'), ('d0000000-0000-4000-8000-00000000000b','$B','c0000000-0000-4000-8000-00000000000b','Pac B');
insert into public.visits (user_id, patient_id, data) values ('$A','d0000000-0000-4000-8000-00000000000a', current_date), ('$B','d0000000-0000-4000-8000-00000000000b', current_date);
insert into public.recurrences (user_id, patient_id, dias, inicio) values ('$A','d0000000-0000-4000-8000-00000000000a','{1}', current_date), ('$B','d0000000-0000-4000-8000-00000000000b','{1}', current_date);
insert into public.recurrence_exceptions (user_id, patient_id, data) values ('$A','d0000000-0000-4000-8000-00000000000a', current_date), ('$B','d0000000-0000-4000-8000-00000000000b', current_date);
SQL
total() { q -c "select (select count(*) from auth.users where id='$1')+(select count(*) from auth.sessions where user_id='$1')+(select count(*) from public.profiles where user_id='$1')+(select count(*) from public.companies where user_id='$1')+(select count(*) from public.service_types where user_id='$1')+(select count(*) from public.patients where user_id='$1')+(select count(*) from public.visits where user_id='$1')+(select count(*) from public.recurrences where user_id='$1')+(select count(*) from public.recurrence_exceptions where user_id='$1')"; }
agora=$(q -c "select extract(epoch from now())::bigint")
claims() { printf '{"sub":"%s","role":"authenticated","amr":%s}' "$1" "$2"; }
chama() { q -c "set role $1; select set_config('request.jwt.claims', '$2', false); select public.excluir_minha_conta();"; }
falha() { ! "$@"; }

echo "== recusas"
verifica "as duas contas comecam com 9 linhas cada (conta, sessao e 7 tabelas)" test "$(total $A)$(total $B)" = "99"
verifica "anonimo NAO pode chamar" falha chama anon "$(claims $A "[{\"method\":\"password\",\"timestamp\":$agora}]")"
verifica "sem login (sem sub) recusa" falha chama authenticated '{"role":"authenticated"}'
verifica "login com senha ha 1 hora recusa (precisa confirmar a senha de novo)" falha chama authenticated "$(claims $A "[{\"method\":\"password\",\"timestamp\":$((agora-3600))}]")"
verifica "sessao aberta por link de recuperacao (sem senha) recusa" falha chama authenticated "$(claims $A "[{\"method\":\"recovery\",\"timestamp\":$agora}]")"
verifica "sem amr recusa" falha chama authenticated "{\"sub\":\"$A\",\"role\":\"authenticated\"}"
verifica "depois das recusas nada foi apagado" test "$(total $A)$(total $B)" = "99"

echo "== exclusao"
verifica "com senha confirmada agora, a Ana exclui a propria conta" chama authenticated "$(claims $A "[{\"method\":\"token_refresh\",\"timestamp\":$agora},{\"method\":\"password\",\"timestamp\":$((agora-60))}]")"
verifica "conta, sessoes e TODOS os dados da Ana sumiram" test "$(total $A)" = "0"
verifica "a conta e os dados da Bia continuam intactos" test "$(total $B)" = "9"
verifica "a funcao nao aceita parametro (nao da para apontar outra conta)" falha q -c "select public.excluir_minha_conta('$B'::uuid)"
verifica "permissoes: security definer, anon sem execucao, authenticated com execucao" test "$(q -c "select p.prosecdef, has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.oid = 'public.excluir_minha_conta()'::regprocedure")" = "t|f|t"
echo; echo "== Resultado: $OK OK, $FALHA falhas"
[[ "$FALHA" == "0" ]]
