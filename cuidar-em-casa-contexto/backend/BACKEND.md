# Cuidar em Casa: referência de Back-end

Última atualização: 18/11/2026 · Versão do app analisada: v14 (16/11/2026 22:59) · Status: **documento-base da frente de back-end**

> Este arquivo é a base para todas as alterações de back-end do projeto. Antes de mexer em banco, login, API, migração ou hospedagem, leia-o; depois de qualquer mudança, atualize a seção 13 (histórico) e as seções afetadas.
>
> Convenções: **[Fato]** vem do código v14 ou dos documentos do projeto. **[Plano]** foi proposto em `deploy/PLANO_SUPABASE.md` e ainda não foi executado. **[Proposta]** é sugestão nova deste documento, ainda sem aprovação. Não sou advogado: os itens de LGPD são roteiro técnico, não parecer jurídico.

---

## 1. Resumo do estado atual

- **[Fato]** O app é um arquivo HTML único (~1.900 linhas, JS e CSS inline, zero bibliotecas de terceiros). Roda hoje **dentro do Claude** (usa `window.claude.use('db' | 'user' | 'downloads')`). Não existe servidor próprio, banco próprio nem deploy fora do Claude.
- **[Fato]** O login atual é uma trava local no navegador (hash de senha guardado no próprio aparelho/conta Claude). Não é segurança real (ver seção 6).
- **[Fato]** Todos os dados ficam num **único documento** (`dados`) por usuário, limitado a 256 KiB, com cópia em texto puro no `localStorage`.
- **[Decisão do usuário]** Quer hospedar o app no **Supabase** e fechar os pontos da auditoria. O plano de execução está em `deploy/PLANO_SUPABASE.md`.
- **[Fato, aplicado em 18/11/2026]** Existe um projeto Supabase de testes (`cuidar-em-casa-teste`, São Paulo) com o **esquema normalizado** da fase B aplicado (tabelas tipadas, chaves estrangeiras compostas, RLS, constraints, índices), **vazio** (0 usuários, 0 linhas). Testado: isolamento entre usuários, cascatas e constraints. Detalhes na **seção 9**; SQL em `backend/sql/2026-11-18_migracoes_aplicadas.sql`. Havia um esquema anterior (jsonb por linha, de 17/11), substituído por decisão do usuário.
- **[Fato]** Continuam sem registro: repositório, host estático escolhido, login Google, a v15 (Exportar/Importar backup + fontes locais, que não consta em `versoes/INDICE.md`; a última versão salva é a 14) e qualquer ligação do app ao Supabase (o app ainda usa `window.claude.use('db')`).
- **Ferramentas desta sessão:** conectores Supabase e Vercel disponíveis. O Supabase foi usado (migrações e testes, seção 9). O Vercel não foi usado.

### Documentos do projeto relacionados

| Arquivo | Para que serve |
|---|---|
| `deploy/PLANO_SUPABASE.md` | Plano em fases A a I para migrar para Supabase |
| `seguranca/AUDITORIA_2026-11-16.md` | Auditoria da v14 (itens A a K) |
| `versoes/INDICE.md` | Histórico de versões do app |
| `versoes/v14_2026-11-16_2259.html` | Código completo mais recente (fonte da seção 4) |

---

## 2. Decisões e restrições já registradas

| Tema | Decisão | Origem |
|---|---|---|
| Provedor de back-end | Supabase (Postgres + Auth + API + RLS) | Pedido do usuário |
| Ambientes | `cuidar-staging` (Free) e `cuidar-prod` (Pro), ambos em São Paulo (`sa-east-1`) | [Plano] |
| Dados reais de pacientes | Somente no plano Pro (Free não tem backup e pausa após 1 semana sem uso) | [Plano] |
| Segurança de dados | RLS em todas as tabelas, `user_id uuid not null default auth.uid()`, `revoke all ... from anon` | [Plano] |
| Chave `service_role` | Nunca vai ao navegador; no navegador só URL + chave pública | [Plano] |
| Login | Supabase Auth: e-mail/senha (com confirmação de e-mail) e Google; 2FA TOTP opcional | [Plano] |
| Modelo de visitas | Uma linha por atendimento, consultada por mês (some o limite de 256 KiB) | [Plano] |
| Validação | No servidor (constraints), substituindo o `normalize()` do navegador como proteção real | [Plano] |
| Host do site | Host estático com HTTPS (Cloudflare Pages, Netlify, Vercel ou GitHub Pages); Supabase não hospeda o site | [Plano] |
| Fontes | Hospedar junto do app (remove Google Fonts) | [Plano] |
| Segredos | Só em variáveis do host, nunca no repositório | [Plano] |

Restrição da frente visual (não de back-end): qualquer alteração visual deve usar a skill `frontend-design`. A cada mudança importante do app, salvar cópia em `versoes/` com número, data e hora, e atualizar `versoes/INDICE.md`.

---

## 3. Como os dados são guardados hoje

### 3.1 Chaves e locais

| Onde | Chave / caminho | Conteúdo |
|---|---|---|
| Banco da conta Claude | coleção `data/users/{userId}`, doc `dados` | Estado completo (`S`) |
| Banco da conta Claude | coleção `data/users/{userId}`, doc `conta` | Registro de conta local (nome, e-mail, salt, hash) |
| `localStorage` | `cuidar-em-casa:v1` | **Cópia em texto puro** de todo o estado; permanece após "Sair" |
| `localStorage` | `cuidar-em-casa:conta` | Cópia da conta local |
| `localStorage` | `cuidar-em-casa:ocultar-valores` | Preferência de ocultar valores (`'1'`/`'0'`), só do aparelho |
| `localStorage` | `cuidar-em-casa:manter` | "Manter conectado" |
| `localStorage` | `cuidar-em-casa:tent` | Contador de tentativas de senha e bloqueio |
| `sessionStorage` | `cuidar-em-casa:sessao` | Marcador de sessão (`'1'`) |

### 3.2 Sincronização

- Gravação com atraso de 400 ms (`scheduleSave`), regravando se houver alteração durante a escrita.
- **Última gravação vence:** o contador `rev` sobe a cada `commit()`. Ao receber snapshot remoto, o app só adota o remoto se `remote.rev > S.rev`. Dois aparelhos editando ao mesmo tempo (ou um offline) podem sobrescrever alterações um do outro. Nunca foi testado com o banco real.
- Limites: `DOC_LIMIT` = 240 KiB (o limite real do documento é 256 KiB); aviso na tela a partir de 190 KiB; acima do limite o app deixa de sincronizar e mantém só no aparelho.
- Medições da auditoria: ~565 bytes por paciente e ~161 bytes por atendimento. Com ~25 atendimentos por semana, cerca de 200 KiB/ano só de atendimentos (limite atingido em pouco mais de um ano).
- Se não houver `window.claude`, o app funciona só com `localStorage` (modo "local").
- Sem dados salvos, o app carrega **dados de exemplo** (registros com `ex: true`, ids `ex-...`), que o usuário pode apagar pelo botão "Apagar exemplos".

---

## 4. Modelo de dados (fonte: código v14)

Estado raiz `S`:

```
S = { patients[], companies[], visits[], rev, perfil{}, tipos[], persisted }
```

`persisted` e `rev` são controle do cliente. Datas são strings locais `YYYY-MM-DD` e horas `HH:MM`, **sem fuso horário**. Valores monetários são números em reais com 2 casas.

Regras gerais de validação (`normalize()`): ids só com `[A-Za-z0-9_-]`, até 64 caracteres (começar com `__` ganha prefixo `i`); texto curto até **300** caracteres (`SHORT`); texto longo até **5.000** (`LONG`); datas precisam existir de fato (ex.: 31/02 é rejeitado); horas de 00:00 a 23:59; ids duplicados são regerados; registros inválidos são descartados ou reparados. O normalizador ainda preserva campos extras desconhecidos (strings até 5.000, números e booleanos), exceto `__proto__`, `constructor` e `prototype`.

### 4.1 Paciente (`patients[]`)

| Campo | Tipo | Limite / regra | Observação |
|---|---|---|---|
| `id` | string | id seguro | gerado com `crypto.getRandomValues` |
| `nome` | texto | 300; obrigatório no formulário | |
| `nasc` | data ISO ou `''` | data válida | idade calculada (0 a 129) |
| `tel` | texto | 60 | |
| `respNome` | texto | 300 | responsável (nome e parentesco) |
| `respTel` | texto | 60 | |
| `endereco` | texto | 300 | rua e número |
| `bairro` | texto | 300 | |
| `ref` | texto | 5.000 | como chegar e acessar |
| `empresaId` | id ou `''` | `''` = particular | referência a `companies[].id` |
| `valor` | número ou `null` | 0 a < 1e9, 2 casas | valor **por atendimento** |
| `condicoes` | texto | 5.000 | **dado de saúde** |
| `alergias` | texto | 5.000 | **dado de saúde** |
| `medicamentos` | texto | 5.000 | **dado de saúde** |
| `obs` | texto | 5.000 | pode conter dado de saúde |
| `rec` | objeto, opcional | ver 4.4 | atendimento recorrente semanal |
| `recExc` | lista de datas ISO | até 5.000 | exceções da recorrência (ocorrências excluídas) |
| `ex` | booleano | só `true` | marca dado de exemplo; **não deve ir para o banco real** |

### 4.2 Empresa (`companies[]`)

| Campo | Tipo | Limite / regra |
|---|---|---|
| `id` | string | id seguro |
| `nome` | texto | 300; obrigatório no formulário |
| `tipo` | texto | 300; opções do formulário: Operadora de saúde, Clínica, Hospital, Empresa de home care, Particular ou outro |
| `contato` | texto | 300 |
| `valorPadrao` | número ou `null` | 0 a < 1e9; **só sugestão** ao vincular paciente com valor vazio |
| `pagamento` | texto | 300 (ex.: "Pagamento até o dia 10") |
| `obs` | texto | 5.000 |
| `cor` | inteiro | 0 a 999; a tela usa `cor % 6` (6 paletas) |
| `ex` | booleano | dado de exemplo |

### 4.3 Atendimento (`visits[]`)

| Campo | Tipo | Limite / regra |
|---|---|---|
| `id` | string | id seguro |
| `pacienteId` | id | referência a `patients[].id` |
| `date` | data ISO | **obrigatória**; registro sem data válida é descartado |
| `hora` | `HH:MM` | padrão `08:00` se inválida |
| `tipo` | texto | 100; **texto livre**, não é chave estrangeira para `tipos` |
| `obs` | texto | 5.000 |
| `status` | `agendado` \| `feito` \| `cancelado` | qualquer outro valor vira `agendado` |
| `serie` | id do paciente | preenchido quando nasceu de uma recorrência |
| `serieData` | data ISO | data da ocorrência na série |
| `manual` | booleano | `true` quando o usuário remarcou/editou à mão |
| `ex` | booleano | dado de exemplo |

### 4.4 Recorrência (`patient.rec`)

| Campo | Tipo | Regra |
|---|---|---|
| `ativo` | booleano | só é `true` se houver pelo menos 1 dia |
| `dias` | lista de inteiros 0 a 6 | 0 = domingo; sem repetidos |
| `hora` | `HH:MM` | padrão `08:00` |
| `tipo` | texto | 100 |
| `inicio` | data ISO | obrigatória no formulário |
| `fim` | data ISO ou `''` | opcional; precisa ser ≥ `inicio` |

### 4.5 Perfil e tipos

- `perfil`: `tel` (60), `profissao` (100), `registro` (60, ex.: COREN), `cidade` (100). O nome e o e-mail vêm da conta local. O e-mail não pode ser alterado no app.
- `tipos[]`: lista de nomes de tipos de atendimento (até 60 caracteres cada, até 200 itens, sem duplicados). Se o usuário nunca criou a lista (`tipos` indefinido), o app mostra os padrões (Consulta, Curativo, Aplicação de medicação, Fisioterapia, Coleta de exame, Avaliação) mais os tipos já usados. Renomear um tipo atualiza visitas e recorrências que o usam; excluir **não** altera os atendimentos já registrados.

### 4.6 Conta local (será substituída pelo Supabase Auth)

`{ v:1, nome, email, salt (base64), it (iterações), hash (base64), at (timestamp) }` com PBKDF2-SHA256, 600 mil iterações. Contas antigas (150 mil) são atualizadas no próximo login.

---

## 5. Regras de negócio que o back-end precisa preservar

### 5.1 Recorrência semanal (a regra mais delicada)

- Atendimentos recorrentes **não são gravados um a um**: aparecem na agenda a partir do cadastro do paciente ("virtuais", id `r-{pacienteId}-{data}`).
- Uma ocorrência acontece em `date` se: `rec.ativo`; o dia da semana está em `rec.dias`; `inicio ≤ date ≤ fim` (fim vazio = sem fim); `date` não está em `recExc`; e **não existe** visita materializada com `serie = paciente` e `serieData = date`.
- Uma ocorrência vira registro real ("materializa") quando o usuário marca como feito, cancela, edita/remarca ou exclui. Excluir uma ocorrência adiciona a data em `recExc` (e remove a visita materializada, se houver).
- Ao **mudar a regra** (dias, hora, tipo, início ou fim), `closeRecurrence`: materializa o passado recente (até 120 dias atrás, só até hoje) para preservar o histórico; apaga as visitas futuras `agendado` com `serie` desse paciente que **não** foram mexidas à mão (`manual` falso); descarta exceções futuras.
- Há também o "Repetir" ao agendar um atendimento avulso: 1, 4, 8 ou 12 semanas, criando N visitas **reais** (sem `serie`).
- Implicação: o banco precisa de unicidade `(paciente, serie_data)` para visitas materializadas, e a expansão das ocorrências virtuais precisa existir em um lugar só (cliente ou função no servidor), com a mesma regra acima.

### 5.2 Faturamento e relatórios

- Valor de cada atendimento = `valor` **atual** do paciente (`pValue`), sem histórico. Mudar o valor do paciente muda retroativamente os relatórios (**[Proposta]** guardar o valor no atendimento ao marcar como feito; ver seção 11).
- `feito` entra em **Realizado**; `agendado` entra em **Previsto**; `cancelado` não entra. Atendimento com data/hora passada ainda `agendado` continua em Previsto e gera aviso.
- Paciente sem valor soma 0 e gera aviso de quantos atendimentos ficaram de fora.
- Agrupamento por paciente ou por empresa; filtros por empresa (todas, particulares, uma específica) e por paciente. "Particular" = sem empresa ou com `empresaId` que não existe mais.
- Período: por mês ou personalizado, **máximo 2 anos** (731 dias). Totais incluem ocorrências virtuais ainda não materializadas.
- Exportação CSV (separador `;`, BOM UTF-8, vírgula decimal; células que começam com `= + - @ tab CR` recebem apóstrofo para evitar injeção de fórmula) e "Copiar resumo". **Mesmo com valores ocultos na tela, o CSV e o resumo trazem os valores reais** (decisão deliberada, avisada na tela).

### 5.3 Integridade e exclusões

- Excluir **paciente**: apaga também todos os atendimentos dele (cascata).
- Excluir **empresa**: os pacientes ficam como particulares (`empresaId = ''`), com confirmação mostrando quantos serão desvinculados.
- Desvincular/mover paciente de empresa exige confirmação; atendimentos já agendados e valores continuam como estão.
- Vincular paciente a empresa pode sugerir o `valorPadrao` da empresa **apenas se** o valor do paciente estiver vazio.
- Visita cujo paciente não existe aparece como "Paciente removido" (hoje só ocorre com dado importado/corrompido; o `normalize()` não remove órfãos).

### 5.4 Interface que depende do dado

- "Ocultar valores" é preferência **só do aparelho** e não aparece na agenda; os valores só aparecem nas informações do paciente, empresa e relatório.
- "Próximo" atendimento do dia: primeiro `agendado` com hora ≥ agora (hora local do aparelho).
- Datas e horas são digitadas ou escolhidas em calendário/roda de rolagem; sempre gravadas como ISO / `HH:MM`.

---

## 6. Autenticação e conta (estado atual × alvo)

**Hoje [Fato]**
- Cadastro: nome, e-mail, senha (mínimo 8 caracteres). Login Google **não** é possível dentro do app Claude.
- Entrar: compara hash PBKDF2; "Manter conectado" usa `localStorage`; sessão usa `sessionStorage`.
- Bloqueio: 5 erros seguidos bloqueiam por 30 s, dobrando a cada rodada até 15 min; persiste ao recarregar e vale também para trocar a senha.
- Redefinir senha: basta digitar o e-mail da conta (sem verificação), pois não há servidor de e-mail.
- Qualquer pessoa com as ferramentas do navegador consegue pular a tela ou ler os dados (auditoria, itens A e B).

**Alvo [Plano, fase C]**
1. E-mail + senha com confirmação de e-mail, senha forte, proteção contra senhas vazadas e limites de tentativa do Supabase.
2. Google: OAuth client "Web application" no Google Cloud; origem JS = domínio do app; URI de redirecionamento = *callback URL* do painel do Supabase; Client ID/Secret no Supabase; Site URL e Redirect URLs cadastradas; no app `supabase.auth.signInWithOAuth({ provider: 'google' })`.
3. 2FA (TOTP) opcional.
4. Recuperação de senha por e-mail real.
5. Remover do app: `hashPw`, bloqueio local, `cuidar-em-casa:conta`, `cuidar-em-casa:tent`, `cuidar-em-casa:manter`.
6. Bloqueio da tela por inatividade (5 a 10 min) e ao ir para segundo plano.

---

## 7. Segurança e LGPD: pendências que pertencem ao back-end

Mapeamento da auditoria (itens A a K) para o que fecha cada ponto, conforme o plano:

| Item | Problema | Como fecha | Fase |
|---|---|---|---|
| A | Login só no navegador, burlável | Supabase Auth + RLS | C, B |
| B | Cópia em texto puro no `localStorage` após sair | Dados no servidor; sem espelho (ou cifrado); limpar tudo ao sair | D |
| C | Sem CSP/cabeçalhos; depende de scripts e estilos inline | Separar JS/CSS em arquivos; CSP sem `unsafe-inline`, HSTS, nosniff, Referrer-Policy, frame-ancestors | E |
| D | Google Fonts vaza IP | Fontes hospedadas junto | A |
| E | Limite de 256 KiB por documento | Visitas em linhas, consulta por mês | B, D |
| F | Conflito entre aparelhos (última gravação vence) | `updated_at` por linha | D |
| G | Reset de senha sem verificação | Reset por e-mail real | C |
| H | CSV/resumo com valores reais mesmo ocultos | Decisão de produto (mantida, avisada) | n/a |
| I | Faltam inatividade, backup/importação, apagar meus dados, registro de acessos, consentimento, política | Fases A (backup), D, H | A, D, H |
| J | LGPD: dados de saúde são sensíveis | Base legal, minimização, contrato com provedor, criptografia, backup, plano de vazamento | H |
| K | Arquivo único, sem testes | Estrutura de projeto + CI | A, G |

Pontos de LGPD do plano (fase H): política de privacidade e termo de consentimento no cadastro; telas "Exportar meus dados" e "Excluir minha conta e dados"; revisar DPA/termo de tratamento do Supabase e localização dos dados; tabela de auditoria de acessos/alterações e alertas de login suspeito; teste de restauração de backup trimestral; plano de resposta a incidente; definir se os pacientes são dados do profissional ou de uma empresa/clínica (muda quem é o "controlador").

Observação de custos/limites do plano (conforme o plano de 17/11/2026, que cita a página de preços do Supabase; **confirmar na página antes de contratar**): Free = banco de 500 MB, pausa após 1 semana sem uso, sem backups; Pro = a partir de US$ 25/mês, 8 GB, sem pausa, backups diários guardados por 7 dias. SOC2 não está no Pro (é do Team) e HIPAA é add-on pago em Team/Enterprise.

---

## 8. Arquitetura alvo

```
Navegador / PWA (HTML + JS + CSS em arquivos, fontes locais)
   │  HTTPS, CSP estrita
   │  supabase-js (versão fixada): URL + chave pública (anon/publishable)
   ▼
Supabase (sa-east-1)
   ├─ Auth: e-mail/senha + Google (+ TOTP opcional)
   ├─ Postgres: tabelas com user_id e RLS em todas
   └─ (opcional) funções/Edge Functions: exportar dados, excluir conta, expandir recorrências
Host estático (Cloudflare Pages / Netlify / Vercel / GitHub Pages) servindo o site com cabeçalhos de segurança
```

Princípios: a chave pública fica no navegador de qualquer jeito; **quem protege os dados é a RLS**, não o código do app; `service_role` nunca sai do servidor; validação vale no banco.

### Fases do plano (resumo)

| Fase | O que entrega | Quem executa |
|---|---|---|
| A | Contas, repositório privado, host; exportar o app para `index.html` + `src/*.js` + `styles.css`; fontes locais; **v15 com Exportar/Importar backup (JSON)** | Usuário (contas) + Claude (código) |
| B | Tabelas, RLS, constraints, índices; **teste obrigatório com 2 usuários** provando isolamento | Claude escreve SQL; usuário (ou conector) executa |
| C | Login real (seção 6) | Ambos |
| D | Trocar `claude.use('db')` por `supabase-js`; visitas por mês; remover espelho em texto puro; bloqueio por inatividade; `updated_at` por linha; offline opcional | Claude |
| E | Cabeçalhos de segurança no host; verificar em securityheaders.com e Mozilla Observatory | Ambos |
| F | Migrar dados atuais (backup JSON → importação) e conferir contagens e totais por mês antes de apagar o app antigo | Ambos |
| G | Segredos no host, deploy em staging, teste em celular real, `npm audit`, ESLint e testes no GitHub Actions, depois produção | Ambos |
| H | LGPD e operação (seção 7) | Usuário + profissional de proteção de dados |
| I | PWA, push, Capacitor (Play Store/App Store) | Opcional |

Ordem sugerida: v15 (backup + fontes locais) → organizar em arquivos + repositório → projeto `staging` com SQL e teste de isolamento → ligar login e dados no app → cabeçalhos, CI, migração e produção.

---

## 9. Esquema do banco (aplicado no Supabase de testes em 18/11/2026)

### 9.1 Projeto e histórico de migrações

**Projeto:** `cuidar-em-casa-teste` · ref `ynbqblvdtgwabczbssfp` · organização "Adamo-Cutrim's Org" · região `sa-east-1` (São Paulo) · Postgres 17 · criado em 12/11/2026 · URL da API `https://ynbqblvdtgwabczbssfp.supabase.co`. O plano contratado (Free ou Pro) **não foi verificado**. É o ambiente de testes (o plano o chamava de `cuidar-staging`); o projeto de produção ainda não existe.

| Versão | Nome | O que fez |
|---|---|---|
| 20261117185016 | `schema_inicial_com_rls` | Primeiro esquema (jsonb por linha). **Substituído em 18/11.** Autoria não registrada. |
| 20261117234214 | `profiles_iniciado` | Coluna `profiles.iniciado boolean` (finalidade não verificada) |
| 20261117235054 | `site_stage_temporaria` | Tabela `site_stage` (JS do app em pedaços) com leitura pública. Fechada em 18/11. |
| 20261118172655 | `fecha_leitura_publica_site_stage` | Removeu política e permissões de `anon`/`authenticated` da `site_stage` |
| 20261118172825 | `esquema_normalizado` | Esquema normalizado desta seção (com trava que aborta se as tabelas antigas tivessem dados) |
| 20261118172908 | `indice_recurrences_user_patient` | Índice apontado pelo advisor de performance |

O SQL das migrações de 18/11 está guardado em `backend/sql/2026-11-18_migracoes_aplicadas.sql` (registro; não rodar de novo no mesmo banco).

**Decisões do usuário em 18/11/2026:** migrar do jsonb por linha para o **esquema normalizado** (as tabelas antigas estavam vazias, nada foi perdido) e **fechar a leitura pública** de `site_stage`.

### 9.2 Tabelas

Todas as tabelas de dados têm `user_id uuid not null default auth.uid()` com FK para `auth.users(id) on delete cascade` (excluir a conta apaga os dados do usuário). Chaves primárias `uuid` (`gen_random_uuid()`), exceto onde indicado.

| Tabela | Colunas principais | Regras no banco |
|---|---|---|
| `profiles` | `user_id` (PK, FK `auth.users`), `nome`, `tel`, `profissao`, `registro`, `cidade`, `iniciado`, `updated_at` | Tamanhos máximos (80/60/100/60/100). Criada em 17/11; só perdeu a coluna `tipos`. O e-mail vem do Auth. |
| `companies` | `id`, `nome`, `tipo`, `contato`, `valor_padrao numeric(11,2)`, `pagamento`, `obs`, `cor smallint`, `created_at`, `updated_at` | `nome` 1 a 300; textos até 300/5.000; `valor_padrao >= 0`; `cor` 0 a 999; `unique (user_id, id)` |
| `patients` | `id`, `company_id`, `nome`, `nasc date`, `tel`, `resp_nome`, `resp_tel`, `endereco`, `bairro`, `ref`, `valor numeric(11,2)`, `condicoes`, `alergias`, `medicamentos`, `obs`, timestamps | `nome` 1 a 300 (sem só espaços); `nasc` entre 1900 e 2100; `valor >= 0`; limites 60/300/5.000 por campo; `unique (user_id, id)` |
| `visits` | `id`, `patient_id`, `data date`, `hora time`, `tipo`, `obs`, `status`, `serie_data date`, `manual boolean`, timestamps | `status` em (agendado, feito, cancelado); `hora` só com minutos (sem segundos); `data` entre 1900 e 2100; `tipo` até 100 (texto livre); `unique (user_id, id)` |
| `recurrences` | `patient_id` (PK), `ativo`, `dias smallint[]`, `hora`, `tipo`, `inicio`, `fim`, timestamps | uma regra por paciente; `dias` só de 0 a 6; se `ativo`, precisa de pelo menos 1 dia; `fim >= inicio` |
| `recurrence_exceptions` | PK `(patient_id, data)`, `created_at` | ocorrências excluídas de uma recorrência |
| `service_types` | `id`, `nome`, `created_at` | `nome` 1 a 60; único por usuário sem diferenciar maiúsculas/espaços nas pontas |
| `site_stage` | PK `(name, part)`, `body` | Tabela temporária com `app.js` em 2 partes. Ver 9.5. |

### 9.3 Relações, cascatas, índices, segurança

- **Chaves estrangeiras compostas com `user_id`**: `(user_id, company_id)`, `(user_id, patient_id)`. Uma FK comum ignora a RLS e deixaria um usuário apontar para o id de outro; com a composta isso é impossível (testado).
- **Excluir empresa**: `patients.company_id` vira `null` (paciente particular), o paciente fica. **Excluir paciente**: apaga `visits`, `recurrences` e `recurrence_exceptions` dele. **Excluir usuário**: apaga tudo dele (declarado nas FKs; não testado).
- **Série**: índice único parcial `visits (user_id, patient_id, serie_data) where serie_data is not null`: a mesma ocorrência de uma recorrência não materializa duas vezes.
- **Índices:** `patients (user_id, company_id)`, `patients (user_id, nome)`, `visits (user_id, data)` (consulta por mês), `visits (user_id, patient_id, data)`, `recurrences (user_id, patient_id)`, `recurrence_exceptions (user_id, patient_id)`, `service_types (user_id, lower(btrim(nome)))` único.
- **`updated_at` automático** (gatilho antes de update) em `companies`, `patients`, `visits`, `recurrences` e `profiles`, usando `set_updated_at()` (`search_path` vazio, sem `security definer`). Serve para resolver conflito entre aparelhos; **o app ainda não usa**.
- **RLS ligada em todas as tabelas**; para cada tabela de dados, 4 políticas (select, insert, update, delete) `TO authenticated` com `(select auth.uid()) = user_id`, e update com `using` e `with check`. `anon` sem nenhuma permissão nelas. `authenticated` com select/insert/update/delete.

### 9.4 Testes executados em 18/11/2026 (transação desfeita; conferido depois: 0 linhas e 0 usuários de teste)

- **Gravação e leitura** do dono em todas as tabelas.
- **Isolamento:** usuário B vê 0 linhas de A em todas as tabelas; alterar e apagar dados de A afeta 0 linhas; B inserir em nome de A é bloqueado pela RLS; A mudar o `user_id` de uma linha para B é bloqueado.
- **FKs compostas:** B apontar para empresa de A ou criar visita em paciente de A é bloqueado.
- **Cascatas:** apagar a empresa mantém o paciente como particular; apagar o paciente leva visitas, recorrência e exceções.
- **Constraints:** série duplicada, tipo de atendimento duplicado (caixa/espaços), status inválido, valor negativo, nome só com espaços, hora com segundos, data fora de 1900 a 2100, dia da semana 7, recorrência ativa sem dias, fim antes do início e empresa inexistente: todos bloqueados.
- **`anon`:** ler `patients`, `visits`, `recurrences` e `site_stage`: bloqueado.
- **Advisors:** segurança: apenas um aviso informativo esperado (`site_stage` com RLS e sem política, de propósito). Performance: só "índice não usado", normal em banco vazio.

### 9.5 Lacunas e pontos do esquema a ter em mente

- `site_stage`: **leitura pública fechada** em 18/11 (decisão do usuário). O conteúdo (2 linhas) foi preservado. Se alguma versão do site ou fluxo de publicação lia essa tabela pela chave pública, **vai deixar de funcionar**; finalidade não confirmada.
- **Não impedido pelo banco:** dias repetidos em `recurrences.dias` (ex.: `{1,1}`); mais de 200 tipos por usuário; limite de 5.000 exceções por paciente; texto vazio de `visits.tipo` ou outros textos.
- **Não criados (decisões em aberto, seção 11):** `valor_snapshot` em `visits` (item 1), FK de `visits.tipo` para `service_types` (item 3), tabela `settings` (preferência de ocultar valores continua só no aparelho) e tabela de auditoria de acessos (fase H).
- `profiles.iniciado`: coluna herdada do esquema de 17/11, finalidade não confirmada; mantida.
- Ids agora são `uuid`: a migração do backup precisa remapear (seção 10).
- A regra de expansão das recorrências (seção 5.1) continua só no app; o banco guarda `recurrences`, `recurrence_exceptions` e as visitas materializadas, mas não gera ocorrências.

### 9.6 Mapa app → banco

| App (v14) | Banco |
|---|---|
| `patients[]`: `nome`, `nasc`, `tel`, `respNome`, `respTel`, `endereco`, `bairro`, `ref`, `valor`, `condicoes`, `alergias`, `medicamentos`, `obs` | `patients`: `nome`, `nasc`, `tel`, `resp_nome`, `resp_tel`, `endereco`, `bairro`, `ref`, `valor`, `condicoes`, `alergias`, `medicamentos`, `obs` |
| `patients[].empresaId` (`''` = particular) | `patients.company_id` (`null` = particular) |
| `patients[].rec` | `recurrences` (1 linha por paciente; `fim` vazio vira `null`) |
| `patients[].recExc` | `recurrence_exceptions` (1 linha por data) |
| `companies[]`: `nome`, `tipo`, `contato`, `valorPadrao`, `pagamento`, `obs`, `cor` | `companies`: `nome`, `tipo`, `contato`, `valor_padrao`, `pagamento`, `obs`, `cor` |
| `visits[]`: `pacienteId`, `date`, `hora`, `tipo`, `obs`, `status`, `manual` | `visits`: `patient_id`, `data`, `hora`, `tipo`, `obs`, `status`, `manual` |
| `visits[].serie` + `serieData` | `visits.serie_data` (a série é o próprio `patient_id`) |
| `S.tipos` | `service_types` (1 linha por tipo) |
| `S.perfil` + nome da conta | `profiles` (`tel`, `profissao`, `registro`, `cidade`, `nome`) |
| `rev`, `persisted`, `ex` (dados de exemplo), campos extras desconhecidos | não são migrados |

---

## 10. Migração dos dados atuais

1. No app v15: **Exportar backup (JSON)**. (A v15 ainda precisa ser feita.)
2. Importar no app novo com as mesmas regras do `normalize()` e validação do banco.
3. Ao importar (mapa campo a campo na seção 9.6): descartar tudo que tiver `ex: true` (dados de exemplo); gerar `uuid` novos e **remapear** `empresaId` → `company_id` e `pacienteId` → `patient_id` (os ids atuais são strings curtas, não UUID); importar **na ordem** empresas, pacientes, depois visitas, recorrências e exceções (as FKs exigem); `empresaId` vazio ou apontando para empresa que não existe vira `company_id = null`; visitas cujo paciente não existe são descartadas e contadas no relatório da importação; `fim` vazio vira `null`; `serie`/`serieData` viram só `serie_data`; `S.tipos` vira linhas de `service_types`; ignorar `rev` e `persisted`; campos extras desconhecidos que o `normalize()` preserva são descartados.
4. Conferir contagens (pacientes, empresas, visitas) e o total de valores por mês **antes** de apagar qualquer coisa do app antigo.

---

## 11. Pontos em aberto (decidir antes de implementar)

1. **Valor no histórico:** o relatório usa o valor atual do paciente. Guardar `valor_snapshot` no atendimento ao marcar como feito evitaria alterar relatórios passados quando o valor mudar. Precisa de decisão do usuário.
2. **Onde expandir recorrências:** no cliente (como hoje, consultando por mês) ou em função do servidor? Impacta a consulta por mês e os relatórios de faturamento.
3. **Tipo de atendimento:** manter `visits.tipo` como texto livre (como hoje) ou passar a referenciar `service_types` (renomear passa a ser uma atualização única)?
4. **Quem é o controlador dos dados** (profissional ou empresa/clínica) e se algum dia haverá compartilhamento de pacientes entre profissionais. Hoje o modelo é um usuário = seus próprios dados (`user_id`).
5. **Proteção extra para campos de saúde** (`condicoes`, `alergias`, `medicamentos`, `obs`): suficiente com RLS + criptografia em repouso do provedor, ou exigir cifra por campo? Validar com profissional de proteção de dados.
6. **Offline:** necessário na primeira versão? O plano o marca como opcional e posterior (fila local cifrada).
7. **Host estático e domínio:** ainda não escolhidos.
8. **Plano Free × Pro:** confirmar valores e limites atuais na página do Supabase no momento da contratação.
9. **Exclusão de conta:** apagar de imediato ou manter por período para recuperação? Definir junto com a política de privacidade.
10. ~~Esquema: jsonb por linha ou normalizado?~~ **Decidido em 18/11/2026: normalizado** (aplicado, seção 9).
11. **`site_stage`:** a leitura pública foi fechada em 18/11 (decisão do usuário). Falta confirmar para que servia, se algo dependia dela e quando apagar a tabela de vez.
12. **Plano do projeto de testes** (Free ou Pro) e quem aplicou as migrações de 17/11, para registrar aqui.
13. **Configurações do Auth no painel** (confirmação de e-mail, política de senha, proteção contra senhas vazadas, Google): não visíveis pelas ferramentas; conferir e registrar.
14. **Tabela `settings`** (ocultar valores sincronizado entre aparelhos) e **tabela de auditoria de acessos**: criar agora ou só na fase H?
15. ~~Finalidade de `profiles.iniciado`~~ **Esclarecido em 18/11/2026:** marca que a conta já passou da primeira abertura. Com ela `true` e sem dados, o app não volta a mostrar os dados de exemplo. Mantida.
16. **Tipos de exemplo:** se a pessoa grava algo sem apagar os exemplos, a lista de tipos da demonstração (ex.: "Curativo pós-cirúrgico") vai para `service_types`. São só nomes, sem dado de paciente; decidir se a v16 deve filtrá-los.
17. **Lista de tipos vazia:** sem linhas em `service_types` o app mostra os tipos padrão. Quem apagar todos os tipos verá os padrões de novo ao recarregar.

---

## 12. Limitações de ambiente (para não repetir tentativas)

- O conector Supabase desta sessão funciona (leitura de esquema, SQL e advisors) e foi usado em 18/11/2026. Criar contas (Google Cloud, host, domínio), pagar planos e criar o projeto de produção continuam dependendo do usuário; criar projeto Supabase exige confirmar a organização e o custo antes.
- A auditoria v14 usou um banco simulado: gravação real pelo app, dois aparelhos ao mesmo tempo, toque/rolagem em celular real e produção fora do Claude **não foram verificados**.
- O app **ainda não foi ligado** ao Supabase: o esquema está pronto e testado só por SQL. Gravar e ler pelo app, o login real e dois aparelhos ao mesmo tempo continuam sem teste.
- Configurações do Auth do projeto (e-mail, Google, política de senha) não são visíveis pelas ferramentas desta sessão: conferir no painel.

---

## 9.7 Camada de dados do site (v15)

- **[Fato]** `site/app.js` (gerado por `fonte-e-ferramentas/build_site.py`) fala com o Supabase só com `fetch` (Auth + PostgREST), sem biblioteca de terceiros.
- O estado `S` continua no formato da v14 (seção 4). `desiredRows()` traduz `S` para as linhas de cada tabela pelo mapa da seção 9.6; `loadAll()` faz o caminho de volta.
- Gravação incremental: compara com a última foto (`snap`) e envia só o que mudou. Ordem: apaga filhos (exceções, recorrências, atendimentos, tipos), grava pais antes de filhos (empresas, pacientes, atendimentos, recorrências, exceções, tipos) e por fim apaga pacientes e empresas. Upsert com `on_conflict` na chave de cada tabela.
- Ids: `uid()` gera uuid v4. Id que não é uuid (a ocorrência recorrente que vira registro, `r-{paciente}-{data}`) recebe um uuid fixo calculado do id e do usuário (`hashUuid`).
- Dados de exemplo (`ex: true`) não vão para o banco; paciente real ligado a empresa de exemplo grava `company_id = null`.
- Verificado em 18/11/2026: 57 verificações de navegador contra o mock `testes/harness.py` (que reproduz colunas, uuid, constraints, FKs compostas, cascatas e RLS) e as mesmas gravações em SQL no banco real, como usuário autenticado, numa transação desfeita (0 linhas e 0 usuários depois).

## 13. Histórico deste documento

| Data | Mudança |
|---|---|
| 18/11/2026 | Criação a partir de `PLANO_SUPABASE.md`, `AUDITORIA_2026-11-16.md`, `INDICE.md` e do código da v14. Sessão dedicada à frente de back-end. |
| 18/11/2026 | Descoberto o projeto Supabase de testes já existente, com esquema jsonb por linha (RLS, vazio) e a tabela `site_stage` com leitura pública. Verificado e testado o isolamento entre 2 usuários (desfeito). |
| 18/11/2026 16:13 | (Claude Code) v15: camada de dados do site adaptada ao esquema normalizado (seção 9.7). Mock e testes reescritos para o esquema real. SQL das migrações de 17/11 exportado para `backend/sql/2026-11-17/`. Ponto 15 esclarecido; pontos 16 e 17 novos. |
| 18/11/2026 | Por decisão do usuário: (1) leitura pública de `site_stage` fechada; (2) migração para o **esquema normalizado** (companies, patients, visits, recurrences, recurrence_exceptions, service_types; FKs compostas com `user_id`, cascatas, constraints, índices, RLS), com trava contra perda de dados. Testes de isolamento, FKs, cascatas e constraints passaram (desfeitos). Índice adicional em `recurrences` após advisor. SQL salvo em `backend/sql/2026-11-18_migracoes_aplicadas.sql`. Seção 9 reescrita; seção 10 atualizada; pontos em aberto 10 a 15. |

---

## Referências

- Plano: `deploy/PLANO_SUPABASE.md` (fontes citadas nele: preços https://supabase.com/pricing · planos https://supabase.com/docs/guides/platform/billing-faq · regiões https://supabase.com/docs/guides/platform/regions · RLS https://supabase.com/docs/guides/database/row-level-security · login Google https://supabase.com/docs/guides/auth/social-login/auth-google)
- Auditoria: `seguranca/AUDITORIA_2026-11-16.md`
- Código: `versoes/v14_2026-11-16_2259.html`
- SQL aplicado em 18/11/2026: `backend/sql/2026-11-18_migracoes_aplicadas.sql`
