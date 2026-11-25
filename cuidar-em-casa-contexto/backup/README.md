# Backup automático do Cuidar em Casa (sem plano pago)

Decisão do usuário (24/11/2026): o profissional **não** precisa fazer backup à mão. Este guia descreve o backup que roda sozinho, de graça, e como restaurá-lo.
O levantamento que levou a este desenho está em [`../backend/BACKUP_SEM_PLANO_PAGO.md`](../backend/BACKUP_SEM_PLANO_PAGO.md).

## Como funciona

```
Todo dia 02:30 (Brasília)
GitHub Actions, num repositório PRIVADO ──► lê o banco com uma role SÓ DE LEITURA (backup_ro, pelo Session pooler)
                                        ──► copia o schema public (estrutura + dados) e a lista de usuários
                                        ──► confere que a cópia está inteira (copia vazia ou truncada FALHA e nada é guardado)
                                        ──► CIFRA com a chave pública (age)  ──► guarda como artefato por 30 dias
```

- **Só quem tem a chave privada abre o arquivo.** O GitHub só vê texto cifrado. A chave privada não está no GitHub nem no Supabase.
- **Custo: R$ 0.** Usa 1 a 2 minutos por dia dos 2.000 que o plano gratuito do GitHub inclui.
- **O repositório do projeto é PÚBLICO e por isso o backup mora em OUTRO repositório, PRIVADO.** Os arquivos desta pasta `backup/repositorio-privado/` são o **modelo** que o assistente copia para lá; o fluxo daqui **não** roda no repositório público (o GitHub só executa fluxos que estão na raiz `.github/`).

## O que você faz (uma vez, uns 20 minutos)

No Git Bash, dentro da pasta do projeto:

```bash
bash cuidar-em-casa-contexto/backup/assistente-backup.sh
```

O assistente tem 9 etapas e te diz exatamente o que clicar em cada uma: confere as ferramentas, cria o repositório privado, gera a **chave de restauração**, cria a role de leitura no Supabase, guarda os segredos no GitHub, dispara o primeiro backup, confirma que a sua chave o abre e (recomendado) faz um **ensaio de restauração** num projeto descartável.

> **A chave de restauração é a parte mais importante.** Se ela se perder, **todos os backups ficam inúteis**. O assistente só continua depois que você declara tê-la guardado em **dois lugares** (gerenciador de senhas + papel). Nunca no GitHub, nunca por e-mail.
> **A senha do banco nunca passa por mim nem por arquivo:** o assistente gera uma senha aleatória, cola o comando SQL na sua área de transferência e a guarda só como segredo do GitHub.

## Segurança em uma página

| Risco | Como é tratado |
|---|---|
| Backup num repositório público | O assistente **recusa** se o repositório não for privado. |
| Credencial com poder demais | Role `backup_ro`: lê tudo (precisa ignorar a RLS), **não escreve, não apaga, não cria**, não lê `auth.users` direto (só a view `backup.usuarios`, que a API pública do Supabase não enxerga). Testado no banco real. |
| Vazamento do arquivo | Cifrado com `age` antes de sair do runner. Teste automático: o arquivo cifrado **não** contém nome, e-mail nem remédio. |
| Senha do banco no log ou no disco | Nunca é impressa; só existe como segredo do GitHub. Teste automático: não aparece no log, na tela, nem em arquivo. |
| Backup vazio ou truncado, sem ninguém notar | O script confere o tamanho e que **toda tabela** tem dados na cópia; senão falha e nada é guardado. |
| Agendador desligado por inatividade | Cada execução registra um pequeno `ultimo-backup.txt` (só contagens) no repositório privado, o que conta como atividade. |

**LGPD:** dado de saúde é sensível. O arquivo cifrado vai para o GitHub (infraestrutura majoritariamente fora do Brasil), o que pode configurar transferência internacional (art. 33). Estar cifrado reduz o risco mas não elimina a obrigação. Levar a um profissional de proteção de dados: quem guarda a chave, por quanto tempo se retém, como atender pedido de exclusão (a cópia antiga ainda contém o paciente até expirar). Isto não é aconselhamento jurídico.

## Restaurar (desastre: perdi o projeto, apaguei por engano)

1. Crie um projeto Supabase **novo e vazio**.
2. Baixe o backup mais recente: no repositório privado, **Actions → execução → Artifacts**.
3. Com a sua chave privada, rode (precisa de PostgreSQL 17 e do `age`, ou do Docker):
   ```bash
   scripts/restaurar.sh ARQUIVO.tar.gz.age CHAVE_PRIVADA.txt "URL_DO_PROJETO_NOVO"
   ```
   O script **nunca sobrescreve**: recusa um destino que já tenha tabelas. Ele recria as contas (mesmos ids e e-mails), restaura as tabelas e **confere as contagens**.
   Depois **reaplica as permissões** (o backup não leva permissões: sem isso as tabelas voltariam abertas demais ou o app receberia `permission denied`) e confere que `anon` não lê nada e que o usuário logado só tem select/insert/update/delete.
4. Aponte o app para o projeto novo (URL e chave pública) e peça às pessoas que entrem por **"Esqueci a senha"**: **as senhas não vão no backup**.

**Rotina:** teste a restauração a cada 3 meses num projeto descartável. Um backup que nunca foi restaurado não é garantia.

## Revisão de 25/11/2026 (correções aplicadas)

- **Permissões na restauração:** `restaurar.sh` ganhou o passo 6/7 (reaplica e confere as permissões). O SQL foi ensaiado no banco de testes, numa transação desfeita: de 7 tabelas abertas para `anon`/`authenticated` passou a 0 com permissão errada.
- **Contagens consistentes:** `fazer-backup.sh` só aceita a cópia se as contagens de antes e depois do `pg_dump` forem iguais (até 3 tentativas, com 20 s entre elas); se o banco não ficar quieto, falha sem guardar nada. Ensaiado com ferramentas simuladas (estável: guarda; instável: falha após 3 tentativas). Ensaiado também com PostgreSQL de verdade (ver item seguinte).
- **Ensaio completo com PostgreSQL 17 de verdade (Docker), 25/11/2026: 31 verificações OK, 0 falhas**, incluindo a conferência independente das permissões no destino. O ensaio achou um defeito na conferência de permissões do `restaurar.sh` (a consulta por nome de tabela falhava em tabelas do sistema); corrigido para usar o identificador da tabela.
- **Ações do GitHub presas ao commit** (`checkout` v4.4.0 e `upload-artifact` v4.6.2), para uma atualização maliciosa não rodar com os segredos do banco. Atualizar de tempos em tempos, escolhendo o commit da versão nova.
- **Acompanhar na hora:** limpar o histórico da área de transferência do Windows (Win+V) depois da etapa do usuário de leitura; olhar o `ultimo-backup.txt` do repositório privado de vez em quando (não há alerta de "backup parado"); a recriação das contas ainda não foi testada num Supabase real (cobre o teste de restauração obrigatório).

## O que foi verificado e o que NÃO foi

Verificado (testes que rodam no seu computador):
- `bash backup/ensaio-local.sh` (precisa do Docker): backup → cifrar → decifrar → restaurar num PostgreSQL 17 de verdade, com **as migrações reais do projeto** e dados fictícios com acento, aspas, `;` e quebra de linha. **30 verificações**: conteúdo idêntico (md5 de cada tabela), RLS e estrutura iguais, contas recriadas, e as **recusas** (usuário administrador, chave errada, arquivo adulterado, destino que não está vazio, senha errada).
- `bash backup/ensaio-assistente-simulado.sh`: roda o assistente inteiro com `gh`, `age` e área de transferência falsos e confere **onde os segredos entram e onde não podem aparecer**. **29 verificações.**
- Os scripts e o fluxo passam no `shellcheck` e no `actionlint`.
- A role `backup_ro` foi testada **no banco real** (numa transação desfeita): lê tudo e recusa escrita.
- Controles de sabotagem: uma tabela omitida do backup, identidades esquecidas na restauração e o defeito do `.env` foram **detectados** pelos ensaios.

**Verificado em 25/11/2026 (primeira execução real):** a conexão do GitHub ao Supabase pelo Session pooler e o `pg_dump 17` por ele; o primeiro backup no GitHub Actions (cifrado, 9 KB, sem senha no log); e a **restauração completa num projeto Supabase de verdade** (`cuidar-em-casa-restauracao-teste`, depois apagado), com as contas recriadas. O roteiro está em [`ROTEIRO_RESTAURACAO.md`](ROTEIRO_RESTAURACAO.md).

**Ainda NÃO verificado:**
- O backup agendado das 02:30 rodando sozinho (conferir na aba Actions do repositório privado no dia seguinte).
- O limite de retenção de artefatos para repositórios privados (padrão 90 dias; usamos 30).
- Que uma conta restaurada consiga entrar pelo "Esqueci a senha" no app apontado para o projeto novo (o ensaio conferiu as contas no painel, não o login).

## Quando algo muda

- **Nova tabela no app:** entra no backup sozinha (a role recebe leitura das tabelas futuras).
- **Supabase subir para PostgreSQL 18:** o `pg_dump 17` do fluxo vai **falhar de propósito** (versão do cliente menor que a do servidor). Trocar `postgresql-client-17` por `-18` em `repositorio-privado/.github/workflows/backup.yml`.
- **Suspeita sobre a senha do backup:** rode o assistente de novo; ele gera outra senha e atualiza a role e o segredo.
- **O backup falhou:** o GitHub avisa por e-mail. Veja a aba Actions do repositório privado.
