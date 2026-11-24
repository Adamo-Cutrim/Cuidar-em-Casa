# Cuidar em Casa: base de estrutura e planejamento

Última atualização: 18/11/2026 · Versão analisada: v14 (16/11/2026 22:59) · Status: **documento-base da frente de estrutura e planejamento**

> Leia este arquivo antes de qualquer mudança de estrutura, organização de código, nova funcionalidade ou refatoração. Ele não substitui os outros documentos: aponta para eles e diz em que ordem mexer.
>
> Convenções: **[Fato]** vem do código v14 ou dos documentos do projeto. **[Proposta]** é sugestão deste documento, ainda sem aprovação do usuário. **[Decisão]** foi aprovada pelo usuário (com data).

---

## 1. Mapa dos documentos do projeto

| Arquivo | Papel | Quando ler |
|---|---|---|
| `planejamento/ESTRUTURA_BASE.md` (este) | Estrutura do código, roteiro, regras de trabalho | Antes de qualquer mudança |
| `backend/BACKEND.md` | Referência de back-end: modelo de dados, regras de negócio, esquema Supabase, migração | Antes de mexer em dados, login, banco ou hospedagem |
| `backend/sql/2026-11-18_migracoes_aplicadas.sql` | Registro do SQL aplicado no Supabase de testes | Ao criar nova migração (não rodar de novo) |
| `deploy/PLANO_SUPABASE.md` | Plano em fases A a I | Para saber a fase atual e a próxima |
| `seguranca/AUDITORIA_2026-11-16.md` | Auditoria da v14 (itens A a K) | Antes de publicar ou mexer em segurança |
| `versoes/INDICE.md` + `versoes/vNN_*.html` | Histórico e cópias completas do app | Para partir da última versão e registrar a nova |

**Fonte da verdade do código:** a versão mais recente em `versoes/` (hoje a **v14**). A v15 citada no `BACKEND.md` ainda não existe no índice.

---

## 2. Estado atual em uma tela

- **[Fato]** Um único arquivo HTML (~1.900 linhas) com CSS e JS inline, sem bibliotecas, rodando **dentro do Claude** (`window.claude.use('db' | 'user' | 'downloads')`).
- **[Fato]** Dados num documento único por usuário (limite 256 KiB) + cópia em texto puro no `localStorage`.
- **[Fato]** Login é trava local (PBKDF2 no navegador), não é segurança real.
- **[Fato]** Supabase de testes com esquema normalizado, RLS e testes de isolamento, **vazio e ainda não ligado ao app**.
- **[Fato]** Sem repositório, sem testes automatizados, sem host escolhido.
- **[Atualização 18/11/2026]** Os itens acima descrevem a v14. Desde então: repositório `Adamo-Cutrim/cuidar-em-casa` no GitHub; v15 (site independente) ligada ao Supabase Auth e ao esquema normalizado; testes de navegador em `fonte-e-ferramentas/testes/`; publicado na **Vercel** em https://cuidar-em-casa-three.vercel.app com deploy automático a cada merge na `main`.
- **Fase do plano:** B concluída no banco de testes; **A (v15 + organização do código) ainda pendente**, e ela é pré-requisito para C e D.

---

## 3. Anatomia do código v14

O arquivo já está dividido em blocos comentados. Este é o mapa para quem for mexer ou separar em módulos.

### 3.1 Blocos do JavaScript (na ordem do arquivo)

| Bloco no código | Responsabilidade | Funções principais | Depende de |
|---|---|---|---|
| utilidades | Formatação, datas, ids, escape | `esc`, `uid`, `iso`, `fromIso`, `addDays`, `startOfWeek`, `parseMoney`, `age`, `norm`, `ic` | nada |
| campo de data / hora | Campos digitáveis + calendário + roda de rolagem | `dateField`, `maskDate`, `brToIso`, `timeField`, `maskTime`, `parseTime`, `cal*`, `wheel*`, `time*` | utilidades |
| estado e armazenamento | Estado `S`, validação, exemplos, gravação | `normalize` (+ `normPatient/Company/Visit/Rec`), `makeDemo`, `initState`, `commit`, `flush`, `initDb`, `statusText` | utilidades, `window.claude` |
| relatório de faturamento | Totais, agrupamentos, CSV, resumo | `repData`, `repRender`, `repCsv`, `repText`, `repInit` | consultas, recorrência |
| conta e acesso | Cadastro, entrada, bloqueio, senha, menu, perfil | `hashPw`, `makeConta`, `doEntrar`, `doCriar`, `doReset`, `doSenha`, `lock*`, `renderGate`, `openMenu`, `openProfile` | estado, janelas |
| consultas | Busca e formatação de entidades, tipos de atendimento | `findPatient`, `findCompany`, `pValue`, `money`, `chip`, `avatar`, `tiposList`, `addTipo`, `renameTipo`, `deleteTipo` | estado |
| recorrência (dentro de consultas) | Ocorrências virtuais e materialização | `recOccurs`, `virtualOf`, `visitsBetween`, `visitById`, `resolveVisit`, `closeRecurrence`, `recSig`, `recText` | estado |
| telas | Cabeçalho, abas, botão flutuante, listas | `renderAll`, `renderTop`, `renderTabs`, `renderFab`, `renderView`, `viewAgenda`, `viewPacientes`, `renderPatientList`, `viewTipos`, `viewEmpresas` | consultas, recorrência |
| janelas | Folha de baixo, confirmação, toast, cópia | `openSheet`, `closeSheet`, `setInert`, `toast`, `copyText`, `askBlock`, `askMove`, `kv`, `kvCopy` | utilidades |
| detalhes | Fichas de atendimento, paciente, empresa | `openVisit`, `openPatient`, `openCompany` | consultas, janelas |
| formulários | Cadastro e edição + gravação | `patientForm`, `companyForm`, `visitForm`, `tipoForm`, `linkForm`, `save*`, `readForm`, `fail` | tudo acima |
| ações | Tabela `A` de `data-action` + ouvintes globais (click, submit, input, change, keydown) | `A[...]` | tudo acima |
| início | Inicialização | `initState`, `decideGate`, `initDb` | tudo |

**Padrões que valem manter:** delegação de eventos por `data-action` (sem `onclick` inline); todo texto passa por `esc()` antes de entrar no HTML; tudo que vem de fora passa por `normalize()`; ids só `[A-Za-z0-9_-]`.

**Pontos frágeis para quem refatorar:**
- Estado global mutável (`S`, `ui`, `auth`, `hide`) acessado de todos os blocos.
- Telas re-renderizadas por `innerHTML` inteiro: perde foco e rolagem (o relatório já compensa à mão).
- A regra de recorrência (BACKEND §5.1) é a parte mais arriscada de mudar. **Desde a v17 parte 2 vive em `site/src/domain/recurrence.js`** (era 8 funções espalhadas no `app.js`), com 17 testes unitários de regra.
- Id da ocorrência virtual (`r-{pacienteId}-{data}`) é decodificado por posição (`slice(2,-11)`): funciona com uuid, mas qualquer mudança de formato quebra.
- Gravação e camada de dados (`commit`/`flush`/`initDb`) estão acopladas ao `window.claude`. Trocar por Supabase hoje exige mexer no meio do arquivo.

### 3.2 CSS

- Tokens em `:root` (cores, 6 paletas de empresa `c0`..`c5`, fontes, coluna de 520px). Visual claro, mobile, com safe-area.
- Blocos: cabeçalho, botões, semana, rota do dia, etiquetas, listas, navegação, formulários, janela, entrada e conta, relatório, detalhes, campos de data/hora.

### 3.3 Problemas encontrados nesta análise (**E1 a E5 corrigidos em 23/11/2026, v16 parte 1**)

| # | Problema | Efeito | Onde |
|---|---|---|---|
| E1 ✅ | A classe `.route` é definida duas vezes: na rota do dia (`ol.route`, `margin:0`) e na arte da tela de entrada (`background: accent-soft`, `padding`, `margin-bottom:24px`). A segunda vence. | A lista de atendimentos da agenda herda fundo verde-claro, borda arredondada e espaçamento da arte do login. **Verificado na tela e corrigido:** a arte do login agora usa `.gate-art`. | CSS "Rota do dia" × "Entrada e conta" |
| E2 ✅ | `maxlength` dos campos diferente do limite do validador/banco: tipo de atendimento 40 (limite 60), telefone do perfil 30 (limite 60), nome 80. | Sem perda de dado, mas regra duplicada e inconsistente. Corrigido: constante `LIM` em `app.js` usada pelo validador e pelos campos (tipo 60, telefone 60, registro 60, profissão 100, cidade 100, nome 80). | `tipoField`, `tipoForm`, `openProfile` |
| E3 ✅ | Estilos inline (`style="..."`) em perfil, menu, rótulos de busca e dicas. | Impede CSP sem `unsafe-inline` (auditoria C). Corrigido: classes no CSS, zero `style="` no app. O `vercel.json` ainda tem `'unsafe-inline'` em `style-src`; removê-lo é um passo à parte. | `openMenu`, `openProfile`, `viewPacientes`, `linkForm`, `viewTipos` |
| E4 ✅ | Classe utilitária `sr` usada mas não definida no CSS (o efeito vem do `style` inline). | Mesma causa de E3. | `viewPacientes` |
| E5 ✅ | Parâmetro sem uso `keepOffset` em `setWeek`. | Só limpeza. Removido. | ações |
| E6 | `parseMoney` trata o ponto como decimal quando não há vírgula: `"1.234"` vira 1,23 e `"1.5"` vira 1,5; o sinal de menos é descartado (`"-5"` vira 5). | Quem digita mil duzentos e trinta e quatro como `1.234` grava R$ 1,23 sem aviso. Achado pelos testes da v17 (`unit/core.test.mjs`); **não corrigido** (v17 não muda comportamento). | `core/money.js` |
| E7 | `keepExtra` copia texto, número e booleano que o validador não tratou, então valor inválido de campo conhecido passa como "extra": `serieData: "2026-02-30"`, `ex: "sim"`, `rec: "x"`. `serieData` inválida chega a `serie_data` (app.js, pushAll) e o Postgres recusa, travando as gravações da conta. | Só com backup adulterado ou corrompido (a v16 abriu esse caminho com o restaurar). **Candidato a PR de correção próprio**, com teste. | `domain/validation.js` |

---

## 4. Estrutura alvo do projeto **[Proposta]**

Objetivo: separar **regras de negócio** (testáveis, sem tela) de **tela** e de **onde os dados moram**, para que trocar `window.claude` por Supabase seja trocar um arquivo, não reescrever o app.

```
cuidar-em-casa/
├─ index.html                  # só a casca: <header>, <main>, <nav>, raízes de janela
├─ styles/
│  ├─ tokens.css               # :root (cores, fontes, paletas de empresa)
│  ├─ base.css                 # reset, tipografia, foco, formulários
│  └─ components.css           # botões, listas, janela, agenda, relatório, campos
├─ fonts/                      # Bricolage Grotesque + Figtree locais (auditoria D)
├─ src/
│  ├─ main.js                  # inicialização
│  ├─ core/                    # sem DOM, sem dados
│  │  ├─ dates.js              # iso, fromIso, addDays, brToIso, parseTime, age
│  │  ├─ money.js              # parseMoney, BRL
│  │  ├─ text.js               # esc, norm, cleanName, initials
│  │  └─ limits.js             # SHORT, LONG e limites por campo (fonte única: resolve E2)
│  ├─ domain/                  # regras de negócio puras (alvo dos testes)
│  │  ├─ validation.js         # normalize e normPatient/Company/Visit/Rec
│  │  ├─ recurrence.js         # recOccurs, expandir período, materializar, closeRecurrence
│  │  ├─ billing.js            # repData, CSV, resumo
│  │  └─ service-types.js      # lista, criar, renomear, excluir tipos
│  ├─ data/                    # ONDE os dados moram (interface única)
│  │  ├─ repository.js         # contrato: listar/gravar/excluir por entidade e por mês
│  │  ├─ repo-claude.js        # implementação atual (documento único) — temporária
│  │  ├─ repo-supabase.js      # implementação nova (fase D)
│  │  └─ backup.js             # exportar/importar JSON (v15, fase A/F)
│  ├─ auth/
│  │  ├─ auth-local.js         # trava atual — será removida na fase C
│  │  └─ auth-supabase.js      # login real (fase C)
│  └─ ui/
│     ├─ state.js              # estado da tela (aba, semana, dia, filtros)
│     ├─ actions.js            # tabela data-action + ouvintes globais
│     ├─ sheet.js, toast.js
│     ├─ fields/               # date.js, time.js, tipo.js
│     └─ views/                # agenda.js, pacientes.js, empresas.js, tipos.js,
│                              # paciente.js, empresa.js, atendimento.js, relatorio.js,
│                              # menu.js, perfil.js, entrada.js
├─ tests/
│  ├─ recurrence.test.js       # a regra mais delicada (BACKEND §5.1)
│  ├─ billing.test.js          # totais realizado/previsto, sem valor, particulares
│  └─ validation.test.js       # dados hostis da auditoria
├─ supabase/
│  ├─ migrations/              # SQL versionado (hoje em backend/sql/)
│  └─ tests/rls_isolamento.sql # teste de 2 usuários
└─ docs/
   ├─ CONTEXT.md               # glossário do domínio (paciente, atendimento, série, ocorrência…)
   └─ adr/                     # uma decisão por arquivo (ex.: 0001-esquema-normalizado.md)
```

**Como continuar entregando um HTML único** enquanto o app roda no Claude: **[Proposta]** usar um empacotador (ex.: Vite com plugin de arquivo único, ou esbuild) que junta tudo num `index.html` para salvar em `versoes/`. Quando sair do Claude, o mesmo código é publicado separado, o que permite a CSP estrita. Ferramenta a confirmar quando o repositório existir.

**Ordem de extração (do mais seguro ao mais arriscado):** `core` → `domain/validation` → `domain/billing` → `domain/recurrence` (com testes antes) → `data/repository` + `repo-claude` → `ui/*` → `auth`.

---

## 5. Roteiro de mudanças **[Proposta]**

Cada etapa termina com uma versão salva em `versoes/` e o índice atualizado.

| Etapa | Entrega | Fecha | Depende de |
|---|---|---|---|
| **v15** | Exportar/Importar backup (JSON), fontes locais, correção de E1 a E5 | Auditoria D, I (backup); plano fase A | nada |
| **v16** | Código reorganizado nos módulos da seção 4, sem mudar comportamento; testes de recorrência, faturamento e validação | Auditoria K | v15; repositório criado pelo usuário |
| **v17** | Camada `data/repository` com `repo-claude` (mesmo comportamento) | prepara fase D | v16 |
| **v18** | Login Supabase (`auth-supabase`), remoção da trava local | Auditoria A, G; fase C | decisões 13 do BACKEND §11; config. do Auth no painel |
| **v19** | `repo-supabase`: visitas por mês, `updated_at`, sem espelho em texto puro, bloqueio por inatividade | Auditoria B, E, F, I; fase D | v17, v18 |
| **v20** | Importação do backup no Supabase com conferência de contagens e totais | fase F | v19 |
| Publicação | Host estático, cabeçalhos de segurança, CI, staging → produção | Auditoria C; fases E, G | v20; host escolhido |
| Depois | LGPD (política, consentimento, exportar/excluir conta, auditoria de acessos), PWA, notificações | Auditoria J; fases H, I | publicação |

Regra de ouro: **não mudar comportamento e estrutura na mesma versão.** Refatoração entra sozinha e é conferida contra a versão anterior.

---

## 6. Decisões em aberto que afetam a estrutura

Lista completa em `backend/BACKEND.md` §11. As que mudam a forma do código:

1. **Onde expandir recorrências** (cliente ou servidor) → define se `domain/recurrence.js` é a única implementação ou se vira função no Supabase.
2. **Valor no histórico** (`valor_snapshot` ao marcar feito) → muda `domain/billing.js` e a tabela `visits`.
3. **Tipo de atendimento como texto livre ou referência** → muda `service-types.js` e renomear tipos.
4. **Offline na primeira versão?** → se sim, `data/` ganha fila local cifrada.
5. **Empacotador e repositório** (GitHub privado? Vite/esbuild?) → necessário para a v16.
6. **Host estático** → define cabeçalhos e deploy (se for Vercel, há conector e skills disponíveis).

---

## 7. Regras de trabalho do projeto

1. Antes de mudar: ler este arquivo e o documento da frente (`BACKEND.md` para dados).
2. Mudança visual: usar a skill `frontend-design` (instrução do projeto).
3. Mudança de banco: nova migração em arquivo próprio, nunca editar a já aplicada; rodar os advisors e o teste de isolamento de 2 usuários.
4. Partir sempre da última versão de `versoes/`.
5. Toda mudança importante: salvar `versoes/vNN_AAAA-MM-DD_HHMM.html` e uma linha em `versoes/INDICE.md`.
6. Mexeu na regra de recorrência ou de faturamento: conferir os casos de BACKEND §5 (de preferência com teste automatizado).
7. Nada de estilo ou script inline novo (prepara a CSP).
8. Limites de campo vêm de um lugar só e batem com o banco.
9. Dados de exemplo (`ex: true`) nunca vão para o banco real.
10. Atualizar o histórico (seção 10) deste arquivo e as seções afetadas.

---

## 8. Skills recomendadas para as instruções do projeto

Disponíveis nesta conta (verificado em 18/11/2026). O catálogo extra de skills não retornou nada específico de segurança, LGPD ou PWA.

| Skill | Para quê neste projeto | Quando usar |
|---|---|---|
| `frontend-design` | Direção visual (já está nas instruções) | Qualquer mudança visual |
| `supabase:supabase` | Auth, RLS, supabase-js, Edge Functions, logs e erros do Supabase | Fases C, D, F e qualquer problema com o banco |
| `supabase:supabase-postgres-best-practices` | Tabelas, tipos de coluna, migrações, RLS e testes, índices | Toda nova migração ou mudança de esquema |
| `mattpocock-skills:grill-with-docs` | Entrevista para fechar um plano e já gerar `CONTEXT.md` e ADRs | Antes de cada etapa grande e para resolver a seção 6 |
| `mattpocock-skills:domain-modeling` | Manter o glossário (`CONTEXT.md`) e registrar decisões (ADR) | Quando surgir termo novo ou decisão |
| `mattpocock-skills:improve-codebase-architecture` | Varre o código e aponta onde separar módulos (relatório HTML) | Preparação da v16 |
| `mattpocock-skills:codebase-design` | Vocabulário de "módulos profundos" e interfaces | Desenho de `data/repository` e `domain/*` |
| `mattpocock-skills:tdd` | Testes antes do código | Recorrência, faturamento, validação, importação |
| `mattpocock-skills:diagnosing-bugs` | Investigação de bugs e lentidão | Quando algo quebrar |
| `mattpocock-skills:to-tickets` | Quebrar uma etapa em tarefas com dependências | Início de cada versão |
| `mattpocock-skills:code-review` | Revisão contra padrões e contra o pedido | Antes de salvar versão (precisa de repositório git) |
| `dataviz` | Gráficos consistentes | Se o relatório de faturamento ganhar gráficos |
| `vercel:deploy`, `vercel:env-vars`, `vercel:vercel-firewall` | Publicação, segredos, proteção | Só se o host escolhido for a Vercel |

Observação: várias skills `mattpocock-skills:*` assumem um repositório git e, algumas, um rastreador de tarefas (`setup-matt-pocock-skills` configura isso uma vez). Até o repositório existir, elas funcionam parcialmente (entrevista e documentos sim; revisão por diff não).

### Texto sugerido para colar nas instruções do projeto

```
- Antes de qualquer mudança de estrutura ou funcionalidade, leia planejamento/ESTRUTURA_BASE.md; ao terminar, atualize o histórico dele.
- Ao desenvolver ou alterar a parte visual, use sempre a skill frontend-design.
- Para back-end, use backend/BACKEND.md como base e as skills supabase:supabase e supabase:supabase-postgres-best-practices em qualquer mudança de banco, login, RLS ou migração.
- Antes de uma mudança grande, use mattpocock-skills:grill-with-docs para fechar o plano e registrar decisões; depois mattpocock-skills:to-tickets para dividir em tarefas.
- Mudanças nas regras de recorrência, faturamento, validação ou importação: use mattpocock-skills:tdd.
- Ao investigar erro ou lentidão, use mattpocock-skills:diagnosing-bugs.
- Não misture refatoração e mudança de comportamento na mesma versão.
- A cada mudança importante, salve a cópia em versoes/ com número, data e hora e atualize versoes/INDICE.md.
```

---

## 9. Riscos e limitações conhecidos

- A auditoria v14 usou banco simulado: gravação real, dois aparelhos e celular real **não foram testados**.
- ~~O app ainda não fala com o Supabase~~ (resolvido na v15, publicada e testada pelo usuário no celular em 18/11/2026). Dois aparelhos ao mesmo tempo continuam sem teste.
- Os problemas E1 a E5 vêm de leitura do código; E1 precisa ser conferido visualmente.
- Sem repositório, não há histórico de diff: a única cópia de segurança do código são as versões em `versoes/`.
- LGPD: dados de saúde são sensíveis; validar com profissional de proteção de dados antes de publicar (não sou advogado).

---

## 10. Histórico deste documento

| Data | Mudança |
|---|---|
| 24/11/2026 | (Claude Code) **v17 parte 3b** (sem mudar comportamento): `site/src/data/supabase.js` (`createClient`, `errMsg`, `readHashSession`, `nowSec`): login, sessão e renovação do token fora do `app.js` (1607 → 1505 linhas; eram 1953 no início da v17). `fetch`, armazenamento e relógio entram como argumento. A sessão passa a morar no cliente: no `app.js`, `ses` virou `SB.ses` (leitura) e `SB.setSession(...)` (as 2 atribuições do fluxo de entrada por link/sessão guardada); o lint (`no-undef`) confere que nenhum uso ficou para trás. +22 unitários (total 131); 21 mutações, todas detectadas. Verificação extra, não commitada: 600 roteiros aleatórios, 6965 comparações antigo × novo (2139 chamadas de rede, 446 renovações de token, 1099 sessões encerradas, falhas de rede e de armazenamento), 0 diferenças; controle (limite de renovação 59 s em vez de 60): 41. O primeiro controle não pegava a fronteira de 60 s: roteiros foram refeitos para começar a sessão perto dela. **A parte 4 (telas e `main.js`) é a última da v17.** |
| 24/11/2026 | (Claude Code) **v17 parte 3a** (sem mudar comportamento): `site/src/data/rows.js` (estado ↔ linhas do Supabase: `desiredRows`, `rowsToRaw`, `dbId`, `profRow`) e `site/src/data/sync.js` (`planSync`, `pushAll`, lotes e ordem de envio) extraídos do `app.js` (1721 → 1607 linhas); no `app.js` ficam wrappers que ligam ao `S`, à sessão e à `api`. +29 unitários (total 109), com teste de **ida e volta** (estado → linhas → estado, 200 estados) e de falha no meio do envio; 21 mutações, todas detectadas. Verificação extra, não commitada: 300 estados, 4414 comparações antigo × novo (inclui 1932 chamadas de rede, 107 falhas injetadas e retomada, 22 934 linhas carregadas com paginação), 0 diferenças; controle com o antigo estragado: 570. **Falta a 3b** (cliente HTTP e sessão, hoje atribuída de fora em `entrarComSessao`/recuperação de senha) e a parte 4 (telas). |
| 24/11/2026 | (Claude Code) **v17 parte 2** (sem mudar comportamento): `domain/queries.js`, `domain/recurrence.js` e `domain/billing.js` extraídos do `app.js` (1829 → 1721 linhas). As funções passam a receber o estado (`S`) e o "agora" como argumento; no `app.js` ficam *wrappers* finos que só ligam ao `S` e ao `ui`, então nenhum ponto de chamada mudou. `nowKey` aceita data opcional; `pl` foi para `core/text.js` (o `plural` duplicado do backup saiu). Testes: +36 unitários (`recurrence.test.mjs`, `billing.test.mjs`; total 80), escritos antes do código e conferidos por mutação (as 17 mutações reais derrubam teste; o único sobrevivente é equivalente). Verificação extra, não commitada: 600 estados aleatórios, 65 593 comparações entre o código de `afc427a` e o novo, 0 diferenças (controle com o antigo estragado: 544). Falta: `data/` e `ui/` (partes 3 e 4). |
| 23/11/2026 | (Claude Code) **v17 parte 1** (só reorganização, sem mudar comportamento): `app.js` vira módulo ES (`<script type="module">`) e perde 1 camada (IIFE); nascem `site/src/core/{limits,dates,text,money,ids}.js` e `site/src/domain/validation.js`, recortados sem reescrever. Testes: 44 unitários (`testes/unit`, `node --test`, conferidos por mutação) + 101 de navegador, todos passando; `testes/lint.sh` (ESLint `no-undef`) pega import esquecido. Achados E6 e E7 na seção 3.3. Próximas partes: recurrence+billing, data, ui. |
| 23/11/2026 19:10 | (Claude Code) Deploy automático **voltou** (usuário reconectou o Git na Vercel; o merge do PR #8 gerou deploy sozinho). A correção de 18:30 abaixo vale só para o período PR #2 a #7. |
| 23/11/2026 18:30 | (Claude Code) v16 publicada em produção por redeploy manual. **Correção:** a frase "deploy automático a cada merge na `main`" (seções 2 e histórico de 18/11) não se confirmou; ver `LEIA-ME_HANDOFF.md`. |
| 23/11/2026 17:54 | (Claude Code) **v16 fechada** (`versoes/v16_2026-11-23_1754_site/`). Parte 3: restaurar backup JSON no Perfil (`planImport`/`applyImport` em `app.js`), com ids calculados por conta, contagem de itens ignorados/ajustados/descartados antes de confirmar, e baixar backup sem exemplos. Testes novos em `testes/t3.py` (44 verificações). Próxima etapa do roteiro: v17 (reorganizar em módulos, sem mudar comportamento). |
| 23/11/2026 | (Claude Code) v16 parte 2: fontes Bricolage Grotesque e Figtree hospedadas em `site/fonts/` (latin e latin-ext, woff2, 138 KB no total); removidos os links do Google Fonts; CSP `font-src 'self'`, sem `fonts.googleapis.com`; cache longo em `/fonts/`. Fecha a auditoria D. Falta o backup JSON para fechar a v16. |
| 23/11/2026 | (Claude Code) v16 parte 1: E1 a E5 corrigidos no `site/` (edição direta; `build_site.py` não é mais a fonte). Testes de navegador rodam no Windows. Fontes locais e backup JSON entraram nas partes 2 e 3. |
| 18/11/2026 16:51 | (Claude Code) Host escolhido: Vercel, ligada ao GitHub (deploy automático da `main`). Site no ar e testado pelo usuário no celular. Seção 2 atualizada. |
| 18/11/2026 16:13 | (Claude Code) v15 salva como pasta `versoes/v15_2026-11-18_1613_site/`: site independente com Supabase Auth e dados no esquema normalizado. A numeração do roteiro (seção 5) passa a contar a partir da v16. Testes em `fonte-e-ferramentas/testes/` (rodar com `rodar_testes.sh`). |
| 18/11/2026 14:38 | Criação a partir de `BACKEND.md`, `PLANO_SUPABASE.md`, `AUDITORIA_2026-11-16.md`, `INDICE.md`, SQL de 18/11 e código da v14. Mapa do código, problemas E1–E5, estrutura alvo, roteiro v15–v20, regras de trabalho e skills recomendadas. |
