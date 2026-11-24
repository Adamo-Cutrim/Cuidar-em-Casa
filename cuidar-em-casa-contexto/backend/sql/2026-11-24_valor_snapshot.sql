-- v18a (24/11/2026): o valor do atendimento e guardado no momento em que ele e marcado como feito.
-- Migracao aditiva e compativel com o app antigo: a coluna aceita nulo e o app antigo simplesmente nao a envia.
-- ORDEM DE PUBLICACAO: aplicar esta migracao ANTES de publicar o app novo (o app novo pede a coluna ao carregar e nao abre sem ela).
-- Desfazer (se preciso): alter table public.visits drop column valor_snapshot;
-- Aplicada no projeto de testes (ynbqblvdtgwabczbssfp) como a migracao "valor_snapshot_em_visits".

alter table public.visits
  add column valor_snapshot numeric(11,2)
  check (valor_snapshot is null or (valor_snapshot >= 0 and valor_snapshot < 1000000000));

comment on column public.visits.valor_snapshot is
  'Valor do atendimento guardado ao marcar como feito (v18a). Nulo: nao e "feito" ou o paciente nao tinha valor naquele momento. So tem sentido quando status = feito.';

-- Atendimentos que ja estavam feitos recebem o valor atual do paciente: preserva os relatorios de hoje.
-- Paciente sem valor continua sem valor (nulo). Nao sobrescreve valor ja preenchido.
update public.visits v
   set valor_snapshot = p.valor
  from public.patients p
 where v.status = 'feito'
   and v.valor_snapshot is null
   and p.id = v.patient_id
   and p.user_id = v.user_id
   and p.valor is not null;
