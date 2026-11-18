-- Cuidar em Casa: schema inicial. Cada linha pertence a um usuario (user_id) e so ele a enxerga (RLS).

create function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nome text not null default '' check (char_length(nome) <= 80),
  tel text not null default '' check (char_length(tel) <= 60),
  profissao text not null default '' check (char_length(profissao) <= 100),
  registro text not null default '' check (char_length(registro) <= 60),
  cidade text not null default '' check (char_length(cidade) <= 100),
  tipos jsonb check (tipos is null or (jsonb_typeof(tipos) = 'array' and jsonb_array_length(tipos) <= 200 and octet_length(tipos::text) <= 30000)),
  updated_at timestamptz not null default now()
);

create table public.companies (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.patients (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 120000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.visits (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  date date not null,
  status text not null check (status in ('agendado', 'feito', 'cancelado')),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index visits_user_date_idx on public.visits (user_id, date);

create trigger profiles_touch before update on public.profiles for each row execute function public.set_updated_at();
create trigger companies_touch before update on public.companies for each row execute function public.set_updated_at();
create trigger patients_touch before update on public.patients for each row execute function public.set_updated_at();
create trigger visits_touch before update on public.visits for each row execute function public.set_updated_at();

-- Acesso: anonimo nao acessa nada; usuario logado so passa pelas politicas abaixo.
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.patients enable row level security;
alter table public.visits enable row level security;

revoke all on table public.profiles, public.companies, public.patients, public.visits from public, anon, authenticated;
grant select, insert, update, delete on table public.profiles, public.companies, public.patients, public.visits to authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles','companies','patients','visits'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end $$;
