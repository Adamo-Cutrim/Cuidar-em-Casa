# Migrações de 17/11/2026

Exportadas de `supabase_migrations.schema_migrations` do projeto `cuidar-em-casa-teste` em 18/11/2026. São registro do que já foi aplicado; não rode de novo no mesmo banco.

Elas completam `../2026-11-18_migracoes_aplicadas.sql`. Para recriar o banco do zero, aplique na ordem:

1. `20261117185016_schema_inicial_com_rls.sql`: cria `set_updated_at()` e `profiles`. As tabelas jsonb criadas aqui foram substituídas em 18/11.
2. `20261117234214_profiles_iniciado.sql`
3. `20261117235054_site_stage_temporaria.sql`: tabela temporária; pode ser pulada num banco novo.
4. `../2026-11-18_migracoes_aplicadas.sql`, blocos A, B e C. Num banco novo sem `site_stage`, pule o bloco A.
