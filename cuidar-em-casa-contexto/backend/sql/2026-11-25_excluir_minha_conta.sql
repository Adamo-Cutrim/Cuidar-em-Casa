-- Migracao: excluir_minha_conta (25/11/2026). Configuracoes > Excluir minha conta (LGPD: direito de eliminacao).
--
-- O que faz: cria a funcao public.excluir_minha_conta(), que apaga a conta de QUEM CHAMA (auth.uid()) em auth.users.
-- Todas as tabelas do app tem user_id ... references auth.users on delete cascade, entao perfil, empresas, pacientes,
-- atendimentos, recorrencias, excecoes e tipos somem junto, na mesma transacao. As sessoes do Auth tambem (cascata do Supabase).
--
-- Seguranca:
--   * So apaga a propria conta: nao recebe parametro nenhum; o alvo e sempre auth.uid().
--   * Exige login COM SENHA nos ultimos 10 minutos (claim amr do JWT, entrada method=password). O app pede a senha de novo
--     antes de chamar; um token roubado/antigo, ou uma sessao aberta por link de recuperacao, nao basta.
--   * security definer com search_path vazio (todos os nomes qualificados); execucao so para authenticated.
--
-- Efeito em quem nao usa: nenhum. Nao muda tabela, coluna nem politica.
-- Desfazer: drop function public.excluir_minha_conta();
-- Aplicar: no SQL Editor do Supabase (o conector recusa SQL com DELETE). SEMPRE antes de publicar o app que chama a funcao;
-- sem ela o app mostra "Nada foi apagado" e nao exclui nada.
-- Ensaio local (Docker): fonte-e-ferramentas/testes/ensaio-excluir-conta.sh

create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := auth.uid();
  login_senha bigint;
begin
  if quem is null then
    raise exception 'excluir_minha_conta: sem usuario logado' using errcode = '42501';
  end if;

  select max((a ->> 'timestamp')::bigint) into login_senha
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as a
   where a ->> 'method' = 'password';

  if login_senha is null or login_senha < extract(epoch from now())::bigint - 600 then
    raise exception 'excluir_minha_conta: confirme a senha de novo' using errcode = '42501', hint = 'reautenticacao';
  end if;

  delete from auth.users where id = quem;
end;
$$;

revoke all on function public.excluir_minha_conta() from public, anon, authenticated;
grant execute on function public.excluir_minha_conta() to authenticated;

-- Conferencia (deve dar: true | false | true):
-- select p.prosecdef, has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute')
--   from pg_proc p where p.oid = 'public.excluir_minha_conta()'::regprocedure;
