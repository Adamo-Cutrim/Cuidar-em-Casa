# Cuidar em Casa: passagem de contexto para o Claude Code

Gerado em 18/11/2026. Esta pasta reúne tudo o que existe do projeto "APP para HomeCare" fora do Claude.ai.

## O que é o app
"Cuidar em Casa": app mobile-first (estilo PWA) para profissionais de saúde que atendem em domicílio. Tem agenda semanal, pacientes, empresas, valores por atendimento (ocultáveis), atendimentos recorrentes semanais, relatório de faturamento (CSV), menu (Perfil, Configurações, Notificações, Atendimentos) e login.

## Leia nesta ordem
1. `planejamento/ESTRUTURA_BASE.md`: mapa do código, regras de trabalho, roteiro v15 a v20.
2. `backend/BACKEND.md`: modelo de dados, regras de negócio, esquema Supabase, migração.
3. `deploy/PLANO_SUPABASE.md` e `seguranca/AUDITORIA_2026-11-16.md`.
4. `versoes/INDICE.md` e `versoes/v12`, `v13`, `v14` (v14 = código-fonte original rodando dentro do Claude).

## Regras do projeto (instruções do Project)
- Antes de mudar estrutura ou funcionalidade, ler `planejamento/ESTRUTURA_BASE.md` e atualizar o histórico dele ao terminar.
- Mudança visual: skill `frontend-design`.
- Back-end: `backend/BACKEND.md` + skills `supabase:supabase` e `supabase:supabase-postgres-best-practices` para banco, login, RLS ou migração.
- Mudança grande: `mattpocock-skills:grill-with-docs` e depois `mattpocock-skills:to-tickets`.
- Regras de recorrência, faturamento, validação ou importação: `mattpocock-skills:tdd`.
- Erro ou lentidão: `mattpocock-skills:diagnosing-bugs`.
- Não misturar refatoração e mudança de comportamento na mesma versão.
- A cada mudança importante, salvar cópia em `versoes/` (número, data, hora) e atualizar `versoes/INDICE.md`.

## Conteúdo da pasta
| Pasta | O que tem |
|---|---|
| `planejamento/`, `backend/`, `deploy/`, `seguranca/`, `versoes/` | Documentos do Project, iguais aos do claude.ai (v12 a v14 inclusas). |
| `site/` | **Versão independente do app, pronta para hospedagem** (sem `window.claude`; desde a v17 o código está em `site/src/`, ver Pendências): `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `icon.svg`, `vercel.json` (CSP e cabeçalhos de segurança). Fala direto com o Supabase por login real e sincronização por linha. |
| `fonte-e-ferramentas/` | `cuidar-em-casa.html` (v14 original), `build_site.py` (gera `site/` a partir do v14), `testes/` (mock do Supabase `harness.py` e testes de navegador `t1.py`, `t2.py`, 37 verificações), `stage-chunks/` (pedaços usados na tentativa de publicar via banco; não veio para o repositório). |

## Supabase (projeto de testes)
- Nome `cuidar-em-casa-teste`, ref `ynbqblvdtgwabczbssfp`, região `sa-east-1`, URL `https://ynbqblvdtgwabczbssfp.supabase.co`.
- Chave pública (publishable), pode ficar no navegador: `sb_publishable_Tuay0Raxi1UIqQLi1pNrcA_hqdThXOV`.
- **Nunca** colocar a chave `service_role` nem senhas em arquivos. Não há segredos nesta pasta.
- Esquema normalizado com RLS: `profiles`, `companies`, `patients`, `visits`, `recurrences`, `recurrence_exceptions`, `service_types`. SQL em `backend/sql/2026-11-18_migracoes_aplicadas.sql` (registro, não rodar de novo). Advisors de segurança limpos.
- A tabela temporária `public.site_stage` (restos da tentativa de publicar o site pelo banco) foi **apagada em 18/11/2026** depois do deploy (migração `20261118195029_remove_site_stage`, SQL em `backend/sql/2026-11-18_remove_site_stage.sql`).
- Plano Free: sem backup automático e pausa após 1 semana sem uso. Dados reais de pacientes só no plano Pro.

## Estado do deploy (pedido principal do usuário: testar no celular)
**Concluído em 18/11/2026.** Detalhes abaixo. Histórico: em 18/11/2026 (Claude Code) o `site/` foi adaptado ao esquema normalizado do banco (v15): a versão anterior gravava no esquema antigo em jsonb e falharia contra o banco atual. Agora passa em 57 de 57 verificações contra um mock que reproduz o esquema real, e as gravações foram conferidas em SQL no banco real (transação desfeita).

**No ar:** https://cuidar-em-casa-three.vercel.app

**Deploy automático restabelecido em 23/11/2026.** Entre o PR #2 e o #7 a ligação Git da Vercel estava quebrada: os merges não geraram deploy e a v16 foi publicada por redeploy manual (`dpl_HxDxeXKWrwaJ6RcB4ummKp57fpkX`). O usuário reconectou o repositório e o merge do PR #8 gerou sozinho o deploy `dpl_AUTC244iuSGUhEQ6rRkT2GMWtCix` (o GitHub passou a mostrar o status `Vercel`). Se voltar a falhar: conferir Settings → Git no painel da Vercel e, para publicar na hora, usar o conector (`create_deployment` com `deploymentId` do último deploy, `withLatestCommit: true`, `target: production`) ou `vercel --prod`. Depois de publicar, conferir o hash de `app.js`/`styles.css` no ar contra a `main`, a CSP e `/fonts/`.

- Projeto Vercel `cuidar-em-casa` (`prj_CTGMLSAzqRuUiyhAnDexkAOs3boB`), time `team_5JcllrpkR3M3EK72I0E7TOLf`, ligado ao GitHub `Adamo-Cutrim/cuidar-em-casa`. Pasta publicada: `cuidar-em-casa-contexto/site`, sem framework e sem build. **Cada merge na `main` publica sozinho.**
- Proteção de login da Vercel desligada (o site é estático; quem protege os dados é a RLS). Cabeçalhos do `vercel.json` (CSP, HSTS etc.) conferidos no ar.
- Supabase Auth: Site URL e Redirect URLs (`https://cuidar-em-casa-three.vercel.app/**`) configuradas pelo usuário.
- Teste do usuário no celular, com o próprio e-mail: conta criada e confirmada, empresa e paciente com recorrência cadastrados, app instalado na tela inicial. Registros do Supabase sem nenhum erro 4xx/5xx.

Passos que estavam pendentes (todos feitos):
1. Publicar `site/` na Vercel (conta pessoal, team `team_5JcllrpkR3M3EK72I0E7TOLf`). O ambiente do Claude.ai não alcança vercel.com nem GitHub. **Caminho mais simples no Claude Code:** na pasta `site/`, rodar `vercel --prod` (ou ligar um repositório GitHub). Projeto sem framework, sem build, pasta de saída = a própria pasta.
2. Garantir que a URL de produção seja pública (desligar Vercel Authentication/SSO protection do projeto, se estiver ligada).
3. No painel do Supabase (Authentication, URL Configuration): colocar a URL da Vercel em **Site URL** e em **Redirect URLs**; decidir sobre "Confirm email"; ligar proteção contra senhas vazadas. O SMTP embutido tem teto de 2 e-mails por hora (a restrição a membros da organização não se confirmou em 25/11/2026).
4. Testar no celular: criar conta, cadastrar paciente, agendar, recarregar, sair e entrar.
5. Rodar de novo `fonte-e-ferramentas/testes/rodar_testes.sh` contra a versão final de `site/` (sobe o mock e troca o `SB_URL` sozinho).
6. Apagar `site_stage`; salvar `versoes/v15_...` e atualizar `INDICE.md` e o histórico de `ESTRUTURA_BASE.md`.

## Pendências conhecidas
- ~~Google Fonts~~ hospedado junto com o site em 23/11/2026 (`site/fonts/`, licença OFL em `fonts/LICENCAS.txt`; CSP sem domínios de terceiros em `style-src` e `font-src`). Auditoria D fechada.
- ~~Problemas E1 a E5~~, ~~fontes locais~~ e ~~backup JSON (baixar e restaurar)~~ prontos em 23/11/2026: **v16 fechada**. **v17 fechada em 24/11/2026** (`versoes/v17_2026-11-24_1135_site/`): só reorganização; `site/app.js` (só a entrada) e `site/src/`: **core/** (datas, texto, dinheiro, ids, limites), **domain/** (validação, consultas, recorrência, faturamento), **data/** (cliente do Supabase e sessão, mapa estado ↔ linhas, envio), **app/** (estado compartilhado `st`, estado da tela, carregar/gravar, catálogo e exemplos) e **ui/** (campos de data/hora, janelas, telas, fichas, formulários, ações, conta, relatório, backup).
- ~~**E7**~~ **corrigido em 24/11/2026**: backup adulterado (ex.: `serieData` `2026-02-30`, `ex: "sim"`) não trava mais a gravação; o valor inválido é descartado na validação.
- ~~**E6**~~ **corrigido em 24/11/2026**: `1.234` vale mil duzentos e trinta e quatro; valor negativo pede correção.
- **Troca de deploy:** por alguns segundos, durante a troca, a CDN pode servir o `app.js` novo com um módulo antigo ou ainda ausente (visto em 24/11: `supabase.js` deu 404 logo após o deploy, depois 200). Melhoria possível: versionar os caminhos dos módulos.
- **v18 feita (24/11/2026)** (`versoes/v18_2026-11-24_1909_site/`): **v18a** o valor do atendimento é guardado ao marcar como feito (`visits.valor_snapshot`); **v18b** atendimento e recorrência ligados ao tipo da lista (`service_type_id`). Migrações aplicadas. **v19 (código pronto, 24/11/2026):** backup automático em `backup/` (leia `backup/README.md`); o usuário precisa rodar `bash cuidar-em-casa-contexto/backup/assistente-backup.sh` e fazer o ensaio de restauração. Próxima: v20 (offline).
- **Configurações, parte 1 (25/11/2026):** Menu > Configurações tem "Esconder dados de saúde" (só neste aparelho; o aviso de alergia continua) e "Apagar dados de exemplo". Teste `t6.py`. **Parte 2:** "Excluir minha conta" (`t7.py`, migração `2026-11-25_excluir_minha_conta.sql`, que só funciona com senha confirmada há menos de 10 minutos; aplicar no SQL Editor antes do app).
- **v20a (25/11/2026):** o app abre sem internet (`site/sw.js`, só arquivos do site; nenhum dado guardado). **Arquivo novo no site? Acrescente na lista `ARQUIVOS` do `sw.js` e troque a versão do cache** (o teste `unit/sw.test.mjs` acusa). Próximas: v20b (dados no aparelho, aguarda decisão do usuário sobre segurança) e v20c (registrar sem rede).
- **Decisões de 24/11/2026** (BACKEND §11): valor do atendimento guardado ao marcar como feito; tipo de atendimento ligado à lista de tipos; **uso offline é necessário**; backup automático sem plano pago. Roteiro na ESTRUTURA_BASE seção 5b. **Atenção:** o repositório do projeto é **público**; nunca guardar backup, chave ou dado de paciente nele. Levantamento do backup: `backend/BACKUP_SEM_PLANO_PAGO.md`.
- Testes: `fonte-e-ferramentas/testes/rodar_testes.sh` roda 172 testes unitários (Node, `testes/unit`) e 142 de navegador (`t2` a `t5`); roda também no Windows (Git Bash + Python 3 + Playwright). `testes/lint.sh` procura nomes sem import (ESLint `no-undef`). Eles **não detectam** violações de CSP; para isso há a opção `CSP_ESTRITA=1` (só aplica o cabeçalho, a conferência é por console/estilo calculado).
- **Antes de abrir o app a outras pessoas:** configurar SMTP próprio no Supabase Auth (hoje o envio embutido permite só 2 e-mails por hora para o projeto todo; entregou para um e-mail de fora da organização no teste de 25/11/2026, mas é serviço de teste). Adiado em 25/11/2026 por falta de domínio e poucos usuários de teste. Plano e comparação Brevo × Resend: `BACKEND.md` seção 11, item 18. Também pendentes para o lançamento: CAPTCHA no cadastro (`BACKEND.md` 11), backup criptografado e senhas vazadas (exige plano Pro).
- Decisões em aberto: `BACKEND.md` seção 11.
- LGPD: dados de saúde são sensíveis; validar com profissional de proteção de dados antes de usar dados reais.

## Integridade
`site/app.js` sha256 `a061989814d6d77af1100aa42f14435b88cdd882fdcf8ff0a35cd648b0f7350e` (v19, só a entrada; os módulos estão em `versoes/v19_2026-11-25_1900_site/src/`)
`site/styles.css` sha256 `357215275ac657665fdec71c9fcc8a5de9e2fb7b31167336bda34c60502bc7ba`
