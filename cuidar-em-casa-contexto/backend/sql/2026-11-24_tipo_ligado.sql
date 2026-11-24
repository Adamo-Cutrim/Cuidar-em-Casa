-- v18b (24/11/2026): atendimentos e recorrencias passam a apontar para o tipo da lista (service_types).
-- Migracao aditiva e compativel com o app antigo: as colunas aceitam nulo e o texto "tipo" continua onde esta
-- (o atendimento guarda o nome mesmo se o tipo for excluido; o app antigo segue funcionando so com o texto).
-- ORDEM DE PUBLICACAO: aplicar esta migracao ANTES de publicar o app novo (o app novo pede a coluna ao carregar).
-- Desfazer (se preciso): alter table public.visits drop column service_type_id; alter table public.recurrences drop column service_type_id;
--                        alter table public.service_types drop constraint service_types_user_id_id_key;
-- Aplicada no projeto de testes (ynbqblvdtgwabczbssfp) como a migracao "tipo_ligado_a_lista".

-- 1) Alvo das chaves estrangeiras compostas (impede ligar a tipo de outro usuario), como em companies e patients.
alter table public.service_types
  add constraint service_types_user_id_id_key unique (user_id, id);

-- 2) Colunas.
alter table public.visits      add column service_type_id uuid;
alter table public.recurrences add column service_type_id uuid;

-- 3) Chaves estrangeiras compostas. Ao excluir um tipo, so a ligacao e solta (o texto "tipo" fica no atendimento).
alter table public.visits
  add constraint visits_service_type_fk
  foreign key (user_id, service_type_id) references public.service_types (user_id, id)
  on delete set null (service_type_id);
alter table public.recurrences
  add constraint recurrences_service_type_fk
  foreign key (user_id, service_type_id) references public.service_types (user_id, id)
  on delete set null (service_type_id);

-- 4) Indices das chaves estrangeiras (exclusao do tipo e consultas por tipo).
create index visits_service_type_idx      on public.visits      (user_id, service_type_id);
create index recurrences_service_type_idx on public.recurrences (user_id, service_type_id);

comment on column public.visits.service_type_id      is 'Tipo do atendimento (service_types). Nulo: sem tipo, ou o tipo foi excluido (o nome continua no texto "tipo").';
comment on column public.recurrences.service_type_id is 'Tipo da recorrencia (service_types). Nulo: sem tipo, ou o tipo foi excluido (o nome continua no texto "tipo").';

-- 5) Dados que ja existem: cria os tipos que faltam a partir do texto usado e liga tudo pelo nome
--    (sem diferenciar maiuscula nem espacos nas pontas, a mesma regra do indice unico service_types_nome_unico).
--    Nomes com mais de 60 caracteres (limite de service_types.nome) ficam so com o texto.
insert into public.service_types (user_id, nome)
select distinct on (u.user_id, lower(btrim(u.tipo))) u.user_id, btrim(u.tipo)
  from (select user_id, tipo from public.visits union all select user_id, tipo from public.recurrences) u
 where btrim(u.tipo) <> '' and char_length(btrim(u.tipo)) <= 60
 order by u.user_id, lower(btrim(u.tipo)), btrim(u.tipo)
on conflict (user_id, (lower(btrim(nome)))) do nothing;

update public.visits v
   set service_type_id = s.id
  from public.service_types s
 where v.service_type_id is null and btrim(v.tipo) <> ''
   and s.user_id = v.user_id and lower(btrim(s.nome)) = lower(btrim(v.tipo));

update public.recurrences r
   set service_type_id = s.id
  from public.service_types s
 where r.service_type_id is null and btrim(r.tipo) <> ''
   and s.user_id = r.user_id and lower(btrim(s.nome)) = lower(btrim(r.tipo));
