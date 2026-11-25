-- Usuario de LEITURA para o backup automatico (v19). Rodar UMA vez no SQL Editor do Supabase (o assistente faz isso com voce).
-- Pode rodar de novo (idempotente): serve tambem para trocar a senha. __SENHA__ e trocada pelo assistente; nunca a coloque no Git.
--
-- O que esta role PODE: ler (SELECT) todas as tabelas do schema public, de todos os usuarios (precisa ignorar a RLS, senao o backup sairia vazio),
--                       e ler a view backup.usuarios (id, e-mail, data de criacao e metadados dos usuarios).
-- O que NAO pode:       escrever em nada (a transacao ja nasce somente-leitura), ler auth.users direto (so a view acima), ver senhas.
-- Nao e exposta pela API: o schema "backup" nao esta na lista de schemas da API do Supabase.
-- Desfazer:             drop owned by backup_ro; drop role backup_ro; drop schema backup cascade;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_ro') then
    create role backup_ro login bypassrls password '__SENHA__';
  else
    alter role backup_ro login bypassrls password '__SENHA__';
  end if;
end $$;

alter role backup_ro set default_transaction_read_only = on;   -- mesmo que alguem tente escrever, o banco recusa
alter role backup_ro set statement_timeout = '10min';
alter role backup_ro connection limit 3;

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create or replace view backup.usuarios as
  select id, email, created_at, raw_user_meta_data from auth.users;
revoke all on backup.usuarios from public, anon, authenticated;
grant usage  on schema backup           to backup_ro;
grant select on backup.usuarios         to backup_ro;

grant usage  on schema public                    to backup_ro;
grant select on all tables    in schema public    to backup_ro;
grant select on all sequences in schema public    to backup_ro;
alter default privileges in schema public grant select on tables    to backup_ro;   -- tabelas criadas nas proximas versoes
alter default privileges in schema public grant select on sequences to backup_ro;
