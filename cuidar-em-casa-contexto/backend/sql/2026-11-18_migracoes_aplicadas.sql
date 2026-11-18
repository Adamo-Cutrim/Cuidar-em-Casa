-- Cuidar em Casa: migracoes aplicadas em 18/11/2026 no Supabase de testes
-- Projeto: cuidar-em-casa-teste (ynbqblvdtgwabczbssfp), sa-east-1
-- Ordem de aplicacao (versoes registradas no Supabase):
--   20261118172655  fecha_leitura_publica_site_stage   (bloco A)
--   20261118172825  esquema_normalizado                (bloco B)
--   20261118172908  indice_recurrences_user_patient    (bloco C)
-- Este arquivo e REGISTRO do que foi aplicado; nao rode de novo no mesmo banco.
-- Decisoes do usuario em 18/11/2026: migrar para o esquema normalizado; fechar a leitura publica de site_stage.

-- ===== BLOCO A: fecha_leitura_publica_site_stage =====
-- site_stage era legivel por qualquer pessoa com a chave publica. Mantem a tabela e a RLS; sem politica, so papeis com bypass de RLS leem.
drop policy if exists site_stage_leitura on public.site_stage;
revoke all on table public.site_stage from anon;
revoke all on table public.site_stage from authenticated;

-- ===== BLOCO B: esquema_normalizado (substitui o esquema jsonb por linha de 17/11/2026) =====

-- 1) Trava: aborta se as tabelas antigas tiverem dados (nada pode ser perdido em silencio)
do $$
begin
  if exists (select 1 from public.patients)
     or exists (select 1 from public.companies)
     or exists (select 1 from public.visits)
     or exists (select 1 from public.profiles where tipos is not null) then
    raise exception 'Tabelas antigas contem dados; migracao abortada para nao perder informacao.';
  end if;
end $$;

-- 2) Remove o modelo antigo
drop table public.visits;
drop table public.patients;
drop table public.companies;
alter table public.profiles drop column tipos;  -- passa a viver em service_types

-- 3) Tabelas
create table public.companies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome         text not null check (char_length(btrim(nome)) between 1 and 300),
  tipo         text not null default '' check (char_length(tipo) <= 300),
  contato      text not null default '' check (char_length(contato) <= 300),
  valor_padrao numeric(11,2) check (valor_padrao >= 0),
  pagamento    text not null default '' check (char_length(pagamento) <= 300),
  obs          text not null default '' check (char_length(obs) <= 5000),
  cor          smallint not null default 0 check (cor between 0 and 999),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, id)   -- alvo das chaves estrangeiras compostas (impede referencia a dados de outro usuario)
);

create table public.patients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_id   uuid,
  nome         text not null check (char_length(btrim(nome)) between 1 and 300),
  nasc         date check (nasc between date '1900-01-01' and date '2100-12-31'),
  tel          text not null default '' check (char_length(tel) <= 60),
  resp_nome    text not null default '' check (char_length(resp_nome) <= 300),
  resp_tel     text not null default '' check (char_length(resp_tel) <= 60),
  endereco     text not null default '' check (char_length(endereco) <= 300),
  bairro       text not null default '' check (char_length(bairro) <= 300),
  ref          text not null default '' check (char_length(ref) <= 5000),
  valor        numeric(11,2) check (valor >= 0),
  condicoes    text not null default '' check (char_length(condicoes) <= 5000),
  alergias     text not null default '' check (char_length(alergias) <= 5000),
  medicamentos text not null default '' check (char_length(medicamentos) <= 5000),
  obs          text not null default '' check (char_length(obs) <= 5000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, id),
  -- excluir a empresa deixa o paciente como particular (company_id = null)
  foreign key (user_id, company_id) references public.companies (user_id, id) on delete set null (company_id)
);

create table public.visits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id uuid not null,
  data       date not null check (data between date '1900-01-01' and date '2100-12-31'),
  hora       time not null default time '08:00' check (hora = date_trunc('minute', hora)),
  tipo       text not null default '' check (char_length(tipo) <= 100),  -- texto livre, como no app (decisao 3 em aberto)
  obs        text not null default '' check (char_length(obs) <= 5000),
  status     text not null default 'agendado' check (status in ('agendado', 'feito', 'cancelado')),
  serie_data date,                       -- preenchido quando a visita nasceu de uma recorrencia (data da ocorrencia)
  manual     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  -- excluir o paciente apaga os atendimentos dele
  foreign key (user_id, patient_id) references public.patients (user_id, id) on delete cascade
);

create table public.recurrences (
  patient_id uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ativo      boolean not null default true,
  dias       smallint[] not null default '{}' check (dias <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(dias) <= 7),
  hora       time not null default time '08:00' check (hora = date_trunc('minute', hora)),
  tipo       text not null default '' check (char_length(tipo) <= 100),
  inicio     date not null check (inicio between date '1900-01-01' and date '2100-12-31'),
  fim        date check (fim is null or fim >= inicio),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not ativo or cardinality(dias) > 0),
  foreign key (user_id, patient_id) references public.patients (user_id, id) on delete cascade
);

create table public.recurrence_exceptions (
  patient_id uuid not null,
  data       date not null check (data between date '1900-01-01' and date '2100-12-31'),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (patient_id, data),
  foreign key (user_id, patient_id) references public.patients (user_id, id) on delete cascade
);

create table public.service_types (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome       text not null check (char_length(btrim(nome)) between 1 and 60),
  created_at timestamptz not null default now()
);

-- 4) Indices (colunas de FK e consultas por mes)
create index patients_user_company_idx   on public.patients (user_id, company_id);
create index patients_user_nome_idx      on public.patients (user_id, nome);
create index visits_user_data_idx        on public.visits (user_id, data);
create index visits_user_patient_idx     on public.visits (user_id, patient_id, data);
-- a mesma ocorrencia de uma serie nao pode ser materializada duas vezes
create unique index visits_serie_unica   on public.visits (user_id, patient_id, serie_data) where serie_data is not null;
create unique index service_types_nome_unico on public.service_types (user_id, lower(btrim(nome)));
create index recurrence_exceptions_user_idx on public.recurrence_exceptions (user_id, patient_id);

-- 5) updated_at por linha (funcao ja existente, search_path vazio, sem security definer)
create trigger companies_touch    before update on public.companies    for each row execute function public.set_updated_at();
create trigger patients_touch     before update on public.patients     for each row execute function public.set_updated_at();
create trigger visits_touch       before update on public.visits       for each row execute function public.set_updated_at();
create trigger recurrences_touch  before update on public.recurrences  for each row execute function public.set_updated_at();

-- 6) RLS e permissoes: so o dono, so usuario autenticado, nada para anon
do $$
declare t text;
begin
  foreach t in array array['companies','patients','visits','recurrences','recurrence_exceptions','service_types'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end $$;

-- ===== BLOCO C: indice_recurrences_user_patient (apontado pelo advisor de performance) =====
create index recurrences_user_patient_idx on public.recurrences (user_id, patient_id);
