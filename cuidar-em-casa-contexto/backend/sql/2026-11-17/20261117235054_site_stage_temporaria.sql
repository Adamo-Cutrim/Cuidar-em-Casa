-- TEMPORARIA: guarda os arquivos do site para o build da Vercel baixar. Sera apagada apos o deploy.
create table public.site_stage (
  name text not null,
  part int not null,
  body text not null,
  primary key (name, part)
);
alter table public.site_stage enable row level security;
revoke all on table public.site_stage from public, anon, authenticated;
grant select on table public.site_stage to anon;
create policy site_stage_leitura on public.site_stage for select to anon using (true);
