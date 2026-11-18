-- Cuidar em Casa: migração aplicada em 18/11/2026 no Supabase de testes (cuidar-em-casa-teste).
-- Versão registrada no Supabase: 20261118195029  remove_site_stage
-- Este arquivo é REGISTRO do que foi aplicado; não rode de novo no mesmo banco.
-- Decisão do usuário em 18/11/2026, depois do deploy do site na Vercel.

-- site_stage guardava pedaços do app.js para uma tentativa antiga de publicar o site pelo banco.
-- O site agora é publicado pela Vercel a partir do GitHub; nada lê esta tabela (sem views nem FKs).
drop table public.site_stage;
