-- Migracao: remove_segredo_do_aparelho (25/11/2026). O uso sem internet (v20a/v20b) foi DESFEITO por decisao do usuario
-- (seguranca e estabilidade). Remove o que a migracao 2026-11-25_segredo_do_aparelho.sql criou.
--
-- Ordem: aplicar DEPOIS de publicar o app sem a v20b (o app antigo chamaria a funcao; o novo nao chama).
-- Aplicar: no SQL Editor do Supabase (o conector recusa DROP). Os segredos so serviam para abrir as copias cifradas
-- nos aparelhos, que o app novo apaga ao abrir; sem o segredo, uma copia que sobrar fica ilegivel sem o PIN.
-- Backups antigos ainda tem a tabela: o restaurar.sh trata a tabela e a funcao como opcionais (funciona com ou sem).

drop function if exists public.segredo_do_aparelho();
drop table if exists public.segredos_aparelho;

-- Conferencia (deve dar: true | true):
-- select to_regprocedure('public.segredo_do_aparelho()') is null, to_regclass('public.segredos_aparelho') is null;
