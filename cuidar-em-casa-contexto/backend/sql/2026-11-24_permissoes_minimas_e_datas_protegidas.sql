-- Cuidar em Casa: permissoes minimas e datas protegidas (item 5 da verificacao de seguranca de 24/11/2026)
-- Projeto: cuidar-em-casa-teste (ynbqblvdtgwabczbssfp), sa-east-1
-- Nome da migracao: permissoes_minimas_e_datas_protegidas
-- STATUS: APLICADA em 24/11/2026 pelo usuario no SQL Editor (o conector recusou duas vezes, provavelmente por causa
--         do DROP TRIGGER). Por isso NAO aparece em supabase_migrations.schema_migrations. Nao rode de novo.
--         Complemento aplicado pelo conector logo depois: migracao funcoes_novas_sem_execute_publico (parte 5, no fim).
--         Verificado depois (so leitura + transacao desfeita): resultado false, false, false, true, 12.
--
-- Por que:
--   * O usuario logado (authenticated) tinha TRUNCATE, TRIGGER, REFERENCES e MAINTAIN nas 6 tabelas do esquema
--     de 18/11. O app nao usa nenhuma delas; TRUNCATE e LOCK (via MAINTAIN) ignoram a RLS. Nao ha caminho pela API
--     hoje, mas e privilegio sobrando.
--   * Vinham das regras padrao do schema public: toda tabela nova nascia com tudo para anon e authenticated, e
--     toda funcao nova com EXECUTE para anon. O Supabase recomenda desligar isso ("Securing your API").
--   * created_at podia ser escrito pelo cliente; updated_at tambem, no insert.
--
-- Efeito no app: nenhum. Ele so usa select/insert/update/delete e nunca envia created_at/updated_at.
-- Atencao para migracoes futuras: tabela ou funcao nova no public precisa de GRANT explicito na propria migracao
-- (junto da RLS), senao a API responde 42501 "permission denied".

-- 1) Tabelas atuais: usuario logado fica so com select/insert/update/delete (o que o app usa); anon sem nada.
--    REFERENCES nao afeta as chaves estrangeiras existentes (sao conferidas com as permissoes do dono da tabela).
do $$
declare t text;
begin
  foreach t in array array['profiles','companies','patients','visits','recurrences','recurrence_exceptions','service_types'] loop
    execute format('revoke truncate, references, trigger, maintain on table public.%I from authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

-- 2) Objetos novos no schema public deixam de nascer acessiveis pela API (recomendacao do Supabase, "Securing your API").
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- 3) created_at e definido pelo banco: no insert vale agora; no update fica o valor antigo (o cliente nao consegue alterar).
create function public.lock_created_at() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke all on function public.lock_created_at() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['companies','patients','visits','recurrences','recurrence_exceptions','service_types'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.lock_created_at()', t || '_lock_created_at', t);
  end loop;
end $$;

-- 4) updated_at tambem e definido pelo banco no insert (antes so no update).
--    Os gatilhos *_touch sao recriados (drop + create) so para passar a disparar tambem no insert.
do $$
declare t text;
begin
  foreach t in array array['profiles','companies','patients','visits','recurrences'] loop
    execute format('drop trigger %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- 5) Migracao separada funcoes_novas_sem_execute_publico (registrada no historico do Supabase).
--    A ultima linha da parte 2 (com IN SCHEMA) NAO basta: o Postgres da EXECUTE a PUBLIC de forma global e uma regra
--    por schema nao desfaz uma global. Testado em transacao desfeita: sem esta linha, funcao nova ficava executavel
--    por anon; com ela, nao (o dono continua executando).
-- alter default privileges for role postgres revoke execute on functions from public;

-- Verificacao depois de aplicar (so leitura; esperado: false, false, false, true, 12):
-- select has_table_privilege('authenticated','public.visits','truncate'),
--        has_table_privilege('authenticated','public.visits','maintain'),
--        has_table_privilege('anon','public.patients','select'),
--        has_table_privilege('authenticated','public.patients','update'),
--        (select count(*) from information_schema.triggers where trigger_schema='public' and trigger_name like '%_lock_created_at');
-- (o ultimo da 12: 6 tabelas x 2 eventos, insert e update)
