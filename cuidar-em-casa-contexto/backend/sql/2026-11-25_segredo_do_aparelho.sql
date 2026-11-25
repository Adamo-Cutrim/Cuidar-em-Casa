-- Migracao: segredo_do_aparelho (25/11/2026). v20b: copia cifrada dos dados no aparelho para usar sem internet.
--
-- O que faz: cria a tabela public.segredos_aparelho (um segredo aleatorio por conta) e a funcao public.segredo_do_aparelho(),
-- que devolve o segredo de QUEM CHAMA (criando na primeira vez). O app usa esse segredo para destrancar a copia cifrada
-- do aparelho quando esta com internet (sem pedir o PIN) e para trocar o PIN esquecido. Sem login, o segredo nao vem.
--
-- Seguranca:
--   * A tabela fica fechada: RLS ligada, sem politica nenhuma, e sem permissao para anon/authenticated. So a funcao le.
--   * A funcao nao recebe parametro: o alvo e sempre auth.uid(). security definer com search_path vazio.
--   * Segredo com 244 bits aleatorios (dois gen_random_uuid, que usam o gerador forte do Postgres).
--   * Excluir a conta apaga o segredo junto (cascata), e a copia de qualquer aparelho fica sem como ser aberta com internet.
--
-- Efeito em quem nao usa: nenhum. Desfazer: drop function public.segredo_do_aparelho(); drop table public.segredos_aparelho;
-- Aplicar: SEMPRE antes de publicar o app que chama a funcao. Ensaio local (Docker): fonte-e-ferramentas/testes/ensaio-segredo-aparelho.sh
-- Restauracao (backup): o restaurar.sh precisa devolver EXECUTE desta funcao ao usuario logado e manter a tabela fechada.

create table if not exists public.segredos_aparelho (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  segredo    text not null check (length(segredo) >= 32),
  created_at timestamptz not null default now()
);
alter table public.segredos_aparelho enable row level security;
revoke all on table public.segredos_aparelho from public, anon, authenticated;

create or replace function public.segredo_do_aparelho()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := auth.uid();
  s text;
begin
  if quem is null then
    raise exception 'segredo_do_aparelho: sem usuario logado' using errcode = '42501';
  end if;
  insert into public.segredos_aparelho (user_id, segredo)
    values (quem, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    on conflict (user_id) do nothing;
  select segredo into s from public.segredos_aparelho where user_id = quem;
  return s;
end;
$$;

revoke all on function public.segredo_do_aparelho() from public, anon, authenticated;
grant execute on function public.segredo_do_aparelho() to authenticated;

-- Conferencia (deve dar: true | false | true | false | true):
-- select p.prosecdef, has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
--        has_table_privilege('authenticated', 'public.segredos_aparelho', 'select'), c.relrowsecurity
--   from pg_proc p, pg_class c where p.oid = 'public.segredo_do_aparelho()'::regprocedure and c.oid = 'public.segredos_aparelho'::regclass;
