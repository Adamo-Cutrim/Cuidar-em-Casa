# Plano: hospedar o "Cuidar em Casa" no Supabase e fechar os pontos da auditoria

Data: 2026-11-17 · Base: `seguranca/AUDITORIA_2026-11-16.md` · App atual: v14

> Aviso: não sou advogado. Os itens de LGPD abaixo são um roteiro técnico; a validação final deve ser feita por profissional de proteção de dados.

## 0. Como as peças se encaixam

- **Supabase** entrega: banco Postgres, login (e-mail/senha e Google), API e regras de acesso por linha (RLS).
- **O site em si** (HTML/JS) precisa de um host estático com HTTPS: Cloudflare Pages, Netlify, Vercel ou GitHub Pages (pelo que sei, o Supabase não hospeda sites estáticos; confirmar ao escolher).
- **A chave pública (anon/publishable) vai no navegador de qualquer jeito.** Quem protege os dados é a RLS no banco, não o código do app. A chave `service_role` nunca vai para o navegador.

## 1. Custos e limites que mudam a decisão (fonte: página de preços do Supabase)

| | Free | Pro |
|---|---|---|
| Preço | US$ 0 | a partir de US$ 25/mês |
| Banco | 500 MB | 8 GB |
| Pausa por inatividade | pausa após 1 semana sem uso | nunca pausa |
| Backups | **não incluídos** | diários, guardados 7 dias |
| SOC2 / HIPAA | não | não (SOC2 é do plano Team; HIPAA é add-on pago em Team/Enterprise) |

Recomendação: **Free apenas para desenvolvimento/teste. Dados reais de pacientes só no Pro** (sem backup e com pausa semanal, o Free não serve para dados de saúde). Região: **São Paulo (`sa-east-1`)**.

## 2. Passo a passo

### Fase A — Preparar (você + eu)
1. Criar conta no Supabase (com 2FA ligado na sua conta) e dois projetos: `cuidar-staging` (Free) e `cuidar-prod` (Pro), ambos em São Paulo.
2. Criar repositório no GitHub (privado) para o código.
3. Escolher o host estático e, se quiser, um domínio próprio.
4. **Eu faço:** exportar o app atual para uma estrutura de projeto (`index.html`, `src/*.js`, `styles.css`), com fontes hospedadas junto (tira o Google Fonts e o vazamento de IP).
5. **Eu faço no app atual (v15), antes de migrar:** botão **Exportar backup (JSON)** e **Importar backup**, para levar os dados de hoje para o Supabase sem perda.

### Fase B — Banco de dados com RLS (eu escrevo, você executa no SQL Editor)
Tabelas: `profiles`, `companies`, `patients`, `service_types`, `visits`, `recurrences`, `recurrence_exceptions`, `settings`. **Cada tabela com `user_id uuid not null default auth.uid()`**.

Regras para TODAS as tabelas:
```sql
alter table public.patients enable row level security;
revoke all on public.patients from anon;          -- anônimo não acessa nada
create policy "patients_select_own" on public.patients
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "patients_insert_own" on public.patients
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "patients_update_own" on public.patients
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "patients_delete_own" on public.patients
  for delete to authenticated using ((select auth.uid()) = user_id);
```
Mais: `check` constraints (tamanho de texto, datas, status válidos), índice em `(user_id, data)` para consultar visitas por mês, e FKs com `on delete` coerente. Isso substitui o `normalize()` do navegador por validação **no servidor**, que é a que vale.

**Teste obrigatório:** criar 2 usuários de teste e provar que o usuário B não lê, não altera e não apaga nada do A (pgTAP ou script). Sem esse teste, não publicar.

### Fase C — Login de verdade (substitui hash/lockout locais)
1. **E-mail e senha:** ativar confirmação de e-mail, senha mínima forte e proteção de vazamento de senhas, limites de tentativa do próprio Supabase.
2. **Google:** no Google Cloud criar OAuth client "Web application" → origem JS autorizada = seu domínio; URI de redirecionamento = a *callback URL* mostrada no painel do Supabase (Authentication → Providers → Google) → colar Client ID/Secret no Supabase → cadastrar Site URL e Redirect URLs. No app: `supabase.auth.signInWithOAuth({ provider: 'google' })`.
3. **2FA (TOTP)** opcional para o profissional (o básico já está incluído nos dois planos).
4. Recuperar senha por e-mail de verdade (resolve a falha "reset só pedindo o e-mail").
5. Remover do app: `hashPw`, lockout local, `cuidar-em-casa:conta`.

### Fase D — Trocar a camada de dados do app
1. Trocar `claude.use('db')` por `supabase-js` (versão fixada, instalada via npm no seu computador).
2. **Visitas viram linhas, consultadas por mês** → some o limite de 256 KiB do documento único.
3. **Remover o espelho em texto puro no localStorage** (ou cifrar). Ao sair, limpar tudo.
4. Travar a tela após inatividade (ex.: 5–10 min) e ao sair do app em segundo plano.
5. Offline (opcional, depois): fila local cifrada que sincroniza ao voltar a rede.
6. Conflito entre aparelhos: usar `updated_at` por linha (hoje é "última gravação vence" no documento inteiro).

### Fase E — Cabeçalhos de segurança no host
`Content-Security-Policy` (sem `unsafe-inline` depois que o JS/CSS saírem do HTML), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `frame-ancestors 'none'`. Verificar com securityheaders.com e Mozilla Observatory.

### Fase F — Migrar os dados de hoje
1. No app v15: Exportar backup (JSON).
2. Importar no app novo (mesmas regras do `normalize()`, agora também validadas pelo banco).
3. Conferir contagens (pacientes, empresas, visitas) e valores totais por mês antes de apagar qualquer coisa do app antigo.

### Fase G — Publicar
1. Segredos só em variáveis do host (nunca no repositório); no navegador vai apenas URL + chave pública.
2. Deploy primeiro no **staging**; testar fluxo completo no celular real.
3. `npm audit`, ESLint e testes automáticos no GitHub Actions a cada alteração.
4. Deploy em **produção** (Pro, São Paulo), domínio com HTTPS.

### Fase H — LGPD e operação (dados de saúde são "sensíveis")
- Política de privacidade e termo de uso/consentimento na tela de cadastro.
- Telas "Exportar meus dados" e "Excluir minha conta e dados".
- Verificar o DPA/termo de tratamento de dados do Supabase e a localização dos dados.
- Log de acesso/alterações (tabela de auditoria) e alertas de login suspeito.
- Teste de restauração de backup (trimestral) e plano de resposta a incidente (quem avisar e em quanto tempo).
- Decidir se os pacientes são dados do profissional ou de uma empresa/clínica (muda quem é o "controlador").

### Fase I — Opcional
PWA instalável e offline; notificações push (Menu → Notificações); empacotar com Capacitor para Play Store/App Store.

## 3. Mapa: ponto da auditoria → como fecha

| Ponto da auditoria | Fase |
|---|---|
| Login só no navegador, burlável | C (Supabase Auth) + B (RLS) |
| Espelho local em texto puro após sair | D |
| Sem CSP/cabeçalhos próprios | E |
| Google Fonts (vaza IP) | A |
| Limite de 256 KiB no documento único | B + D |
| Última gravação vence entre aparelhos | D |
| Reset de senha só pelo e-mail digitado | C |
| Sem bloqueio por inatividade | D |
| Sem backup/importar | A (v15) + plano Pro |
| Sem excluir/exportar meus dados, sem política | H |
| Arquivo único grande, sem testes | A + G |

## 4. O que eu consigo e o que não consigo fazer daqui

**Consigo:** reorganizar o código, escrever o SQL (tabelas, RLS, constraints), os testes de isolamento, o código de login Google/e-mail, a importação do backup, os cabeçalhos de segurança, a política de privacidade (rascunho) e os testes no navegador.

**Não consigo daqui:** criar suas contas (Supabase, Google Cloud, host, domínio), pagar o plano, rodar `npm`/Supabase CLI e testar contra um Supabase real (meu ambiente não tem acesso externo para isso). Essas partes ficam com você ou com o Claude Code no seu computador, usando os arquivos que eu preparar.

## 5. Ordem sugerida

1. **v15 agora:** Exportar/Importar backup + fontes locais (nenhum risco, já protege seus dados).
2. Organizar o projeto em arquivos + repositório.
3. Criar o projeto `staging`, rodar o SQL e o teste de isolamento.
4. Ligar login e dados no app; testar no celular.
5. Cabeçalhos, CI, migração dos dados, produção.

## Fontes
- Preços e limites: https://supabase.com/pricing
- Faturamento/planos: https://supabase.com/docs/guides/platform/billing-faq
- Regiões (São Paulo = sa-east-1): https://supabase.com/docs/guides/platform/regions
- RLS: https://supabase.com/docs/guides/database/row-level-security
- Login com Google: https://supabase.com/docs/guides/auth/social-login/auth-google
