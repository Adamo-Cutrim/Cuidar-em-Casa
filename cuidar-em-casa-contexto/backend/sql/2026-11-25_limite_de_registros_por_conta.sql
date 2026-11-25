-- Cuidar em Casa: limite de registros por conta (item 2 da verificacao de seguranca de 24/11/2026)
-- Projeto: cuidar-em-casa-teste (ynbqblvdtgwabczbssfp)
-- Nome da migracao: limite_de_registros_por_conta
-- STATUS: APLICADA em 25/11/2026 pelo conector (migracao registrada no historico do Supabase). Nao rode de novo.
--         Testado em transacao desfeita: conta com 200 tipos nao cria o 201o (erro 23514) e ainda reenvia um existente.
--
-- Por que: o cadastro e aberto e a API aceita qualquer volume. Uma conta (ou robo) poderia encher o banco do plano
-- Free (500 MB) e derrubar o app para todos. O limite fica no banco, porque o do navegador nao protege a API.
--
-- Limites (bem acima do uso real de um profissional; o app le ate 200.000 linhas por tabela):
--   companies 500 | patients 3.000 | recurrences 3.000 (um por paciente) | visits 60.000 |
--   recurrence_exceptions 20.000 | service_types 200 (o app ja corta em 200)
--
-- Regra: so conta quando a linha e NOVA. Reenviar uma linha que ja existe (o app faz upsert em lotes) nunca e
-- bloqueado, mesmo que a conta esteja no limite. Erro devolvido: 23514 com a mensagem "limite_de_registros:<tabela>".
-- security invoker: a contagem passa pela RLS e so enxerga as linhas do proprio usuario, que e o que se quer limitar.
-- Efeito no app: nenhum para uso normal. Se um dia precisar de mais, e so alterar o numero na linha do gatilho.

create function public.limit_rows_per_user() returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  max_rows int := tg_argv[0]::int;
  ja_existe boolean;
  total bigint;
begin
  -- a linha ja existe? (upsert reenviando a mesma linha)
  if tg_table_name = 'recurrences' then
    select exists (select 1 from public.recurrences where patient_id = new.patient_id) into ja_existe;
  elsif tg_table_name = 'recurrence_exceptions' then
    select exists (select 1 from public.recurrence_exceptions where patient_id = new.patient_id and data = new.data) into ja_existe;
  else
    execute format('select exists (select 1 from public.%I where id = $1)', tg_table_name) into ja_existe using new.id;
  end if;
  if ja_existe then
    return new;
  end if;

  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into total using new.user_id;
  if total >= max_rows then
    raise exception 'limite_de_registros:%', tg_table_name using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.limit_rows_per_user() from public, anon, authenticated;

create trigger companies_limit             before insert on public.companies             for each row execute function public.limit_rows_per_user(500);
create trigger patients_limit              before insert on public.patients              for each row execute function public.limit_rows_per_user(3000);
create trigger recurrences_limit           before insert on public.recurrences           for each row execute function public.limit_rows_per_user(3000);
create trigger visits_limit                before insert on public.visits                for each row execute function public.limit_rows_per_user(60000);
create trigger recurrence_exceptions_limit before insert on public.recurrence_exceptions for each row execute function public.limit_rows_per_user(20000);
create trigger service_types_limit         before insert on public.service_types         for each row execute function public.limit_rows_per_user(200);

-- Verificacao depois de aplicar (so leitura; esperado: 6):
-- select count(*) from information_schema.triggers where trigger_schema='public' and trigger_name like '%\_limit' and event_manipulation='INSERT';
