# Backup automático sem o plano pago do Supabase

Levantamento de 24/11/2026. Pedido do usuário: o profissional não deve precisar fazer backup; achar uma automação que gere backups de tempo em tempo **sem** ativar o plano pago. Nada aqui foi implementado ainda.

## 1. O que foi verificado (fatos)

| Fato | Fonte |
|---|---|
| A organização do projeto está no plano **free**. | `get_organization` (Supabase MCP), 24/11/2026 |
| Backups diários automáticos existem só nos planos **Pro, Team e Enterprise** (7, 14 e 30 dias). PITR é um complemento pago (cerca de US$ 100/mês para 7 dias; exige computação Small ou maior). | [Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups) |
| Para projetos **Free** a própria documentação recomenda: *exportar regularmente com `supabase db dump` e manter cópias fora do Supabase*. | mesma página |
| Os backups do banco **não incluem** arquivos do Storage (só os metadados). Este app não usa Storage. | mesma página |
| Apagar o projeto apaga também todos os backups guardados nele. | mesma página |
| A conexão direta ao banco é **IPv6** no plano Free. O pooler compartilhado (Supavisor), em modo sessão ou transação, é **IPv4** em qualquer plano. | [Supabase: Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) |
| **GitHub Actions só aceita IPv4** (lista da própria documentação do Supabase). Logo, de lá só o pooler funciona. | [Supabase: IPv4 address](https://supabase.com/docs/guides/platform/ipv4-address) |
| Neste projeto estão **disponíveis** (não instaladas) `pg_cron`, `pg_net` e `http`. Instaladas: `pgcrypto`, `supabase_vault`. | `list_extensions`, 24/11/2026 |
| GitHub Free: **2.000 minutos/mês** de Actions e **500 MB** de armazenamento de artefatos. Fluxos agendados são desligados após 60 dias sem atividade no repositório (a documentação oficial cita repositórios públicos; para privados a fonte não deixa claro, então vamos tratar como possível). | [GitHub: billing de Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) e [discussões da comunidade](https://github.com/orgs/community/discussions/184653) |
| Retenção padrão de artefatos: 90 dias, configurável; o teto exato para repositório privado não ficou confirmado (as fontes divergem). | [upload-artifact](https://github.com/actions/upload-artifact/blob/main/action.yml) |
| **O repositório atual do projeto (`Adamo-Cutrim/Cuidar-em-Casa`) é PÚBLICO.** | `gh repo view`, 24/11/2026 |

**Consequência direta do último item:** nenhum backup, nem cifrado, deve ser guardado no repositório do projeto nem como artefato dele. Em repositório público, artefatos e commits ficam acessíveis a qualquer pessoa. O backup precisa de um repositório **privado separado**.

## 2. Opções

| | A. GitHub Actions + `pg_dump` cifrado (repositório privado separado) | B. Dentro do Supabase: `pg_cron` + função que grava num bucket/tabela | C. Plano Pro (US$ 25/mês) | D. Exportar JSON pelo app (já existe) |
|---|---|---|---|---|
| Custo | R$ 0 (job de 1 a 2 min por dia, contra 2.000 min/mês) | R$ 0 | ~US$ 25/mês + computação | R$ 0 |
| Automático | Sim, diário | Sim | Sim | **Não**: depende da pessoa |
| Fora do Supabase | **Sim** | **Não** (mesmo projeto: apagar ou pausar leva tudo) | Não (S3 do Supabase) | Sim (arquivo no aparelho) |
| Protege contra erro do app (apagar sem querer) | Sim | Sim | Sim | Só se a pessoa lembrar |
| Protege contra perder o projeto/conta | **Sim** | Não | Parcial | Parcial |
| Risco | Segredos no GitHub; chave de restauração | Projeto Free pausa por inatividade e o agendador para | Custo | Esquecimento |
| Esforço | Médio | Baixo | Nenhum | Já pronto |

**Recomendação: A** como backup real. **B** pode entrar depois como uma camada extra barata de "desfazer" (cópia diária dentro do projeto, 7 dias), útil contra bugs do próprio app, mas não é backup de desastre.

## 3. Desenho recomendado (A)

1. **Repositório privado novo**, só para isso (ex.: `cuidar-em-casa-backups`), na conta do usuário. O fluxo agendado mora nele.
2. **Credencial mínima:** uma *role* do Postgres só de leitura criada para o backup, em vez da senha do `postgres`. Ponto técnico **a testar**: o `pg_dump` precisa ler as linhas de todos os usuários, o que exige ignorar a RLS (`BYPASSRLS`); ainda não sabemos se o Supabase permite criar essa role no plano Free. Se não permitir, usa-se a senha do `postgres` guardada só como segredo do GitHub.
3. **Conexão pelo pooler em modo sessão** (IPv4), pois o GitHub Actions não alcança o IPv6. Ponto a testar: se `pg_dump` funciona bem por esse pooler.
4. **Cifrar antes de guardar**, no próprio fluxo, com uma chave pública (`age`). O GitHub só vê texto cifrado. A **chave privada** fica só com o usuário (gerenciador de senhas + cópia em papel). **Perdeu a chave, o backup não abre**: este é o maior risco do desenho e é uma decisão do usuário (seção 5).
5. **Guardar como artefato** com retenção de 30 dias (configurável) e rodar diariamente de madrugada. Para o agendador não ser desligado por falta de atividade, o fluxo pode registrar um commit pequeno por semana.
6. **Aviso de falha:** o GitHub envia e-mail ao dono quando um fluxo falha; acrescentar uma checagem semanal de que existe backup recente.
7. **Teste de restauração obrigatório antes de confiar:** restaurar um backup em um projeto Supabase descartável e conferir contagens e totais. Backup que nunca foi restaurado não conta como backup.
8. **Ponto técnico em aberto: contas de usuário.** As tabelas do app apontam para `auth.users`. Para restaurar em outro projeto é preciso recriar esses usuários (dump do esquema `auth`, que contém hashes de senha, aceitável porque o arquivo é cifrado) ou refazer as contas e remapear os ids. Decidir no teste de restauração.

Efeito colateral a **verificar** (não afirmar): uma conexão diária ao banco pode contar como atividade e ajudar a evitar a pausa do plano Free por inatividade. Não está documentado; testar.

## 4. LGPD

Dados de saúde são sensíveis. Pontos para levar a um profissional de proteção de dados:
- O backup sai do Supabase (região `sa-east-1`, São Paulo) para o GitHub (infraestrutura majoritariamente fora do Brasil): pode configurar **transferência internacional** (LGPD, art. 33). Estar cifrado reduz o risco, mas dado cifrado reversível continua sendo dado pessoal.
- Definir **quem guarda a chave**, por quanto tempo se retém cada cópia e como atender um pedido de **exclusão** de um paciente (a cópia antiga ainda o contém até expirar).
- Registrar o GitHub como operador no inventário de tratamento.

Isto não é aconselhamento jurídico.

## 5. Decisões do usuário necessárias antes de implementar

1. **Destino:** repositório privado no GitHub (opção A) está bom, ou há preferência por outro destino sob controle do usuário?
2. **Chave de restauração:** quem guarda a chave privada e onde (e uma segunda cópia)?
3. **Retenção:** 30 dias de cópias diárias é suficiente para o início?
4. **Passos que só o usuário pode fazer** (eu preparo um roteiro passo a passo): criar o repositório privado, gerar a chave, e colocar a senha do banco e a chave pública como segredos do GitHub. **A senha do banco não deve ser enviada a mim.**

## 6. Plano de execução (quando aprovado)

1. Roteiro guiado para os passos do usuário.
2. Fluxo agendado + teste manual de uma execução.
3. **Teste de restauração** em projeto descartável; ajustar o item 8 da seção 3.
4. Documentar o procedimento de restauração e agendar um teste de restauração periódico.
