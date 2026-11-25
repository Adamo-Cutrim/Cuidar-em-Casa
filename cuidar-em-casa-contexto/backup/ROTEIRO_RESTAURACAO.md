# Roteiro: ensaio de restauração do backup (direto, sem repetir o assistente)

Objetivo: provar que o backup do GitHub recria o banco do zero, inclusive as contas. Um backup que nunca foi restaurado não é garantia.
Tempo: uns 15 minutos. Custo: zero (projeto gratuito, apagado no fim). **Não toca no projeto principal `cuidar-em-casa-teste`.**

Pré-requisitos: Docker Desktop ligado; Git Bash (não PowerShell); o assistente já foi rodado até a etapa 7 (existe a pasta `~/cuidar-em-casa-backups` e o arquivo `~/cuidar-em-casa-chave-privada-backup.txt`).

## 1. Criar o projeto de teste no Supabase
1. Abra https://supabase.com/dashboard/new/qxsjlvdouxqatlkixbvf
2. Nome: `cuidar-em-casa-restauracao-teste`. Região: **South America (São Paulo)**. Plano gratuito.
3. Escolha uma senha do banco e **guarde no gerenciador de senhas** (você vai precisar dela no passo 2).
4. Espere o projeto ficar pronto (uns 2 minutos, até sair "Setting up project").
   O plano gratuito permite 2 projetos ativos: hoje você só tem o `cuidar-em-casa-teste`.

## 2. Pegar a URL de conexão do projeto de TESTE
No projeto **novo**: botão **Connect** → aba **Session pooler** → copie a URL. Ela parece com
`postgresql://postgres.CODIGODOTESTE:[YOUR-DATABASE-PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`.
Troque `[YOUR-DATABASE-PASSWORD]` pela senha do passo 1.1 (sem colchetes). Mantenha a URL na área de transferência; não cole em lugar nenhum além do terminal.
Confira: o código depois de `postgres.` deve ser **diferente** de `ynbqblvdtgwabczbssfp` (esse é o projeto principal).

## 3. Preparar o backup no terminal (Git Bash)
**Use uma única janela do terminal do passo 3 ao 5.** As variáveis `ARQ` e `DESTINO_URL` só existem nela; numa janela nova elas vêm vazias e o passo 5 falha com `scripts/restaurar.sh: No such file or directory` (o prompt deve mostrar `~/cuidar-em-casa-backups`, não só `~`). Se abrir outra janela, recomece deste passo.
```bash
cd ~/cuidar-em-casa-backups
git pull -q
ID=$(gh run list --workflow backup.yml --status success --limit 1 --json databaseId -q '.[0].databaseId')
rm -rf recebido && gh run download "$ID" -D recebido
ARQ=$(find recebido -name '*.age' | head -n1)
echo "Backup: $ARQ"
```
Esperado: uma linha `Backup: recebido/backup-.../cuidar-em-casa-AAAAMMDD-HHMMSS.tar.gz.age`.

## 3b. Conferir que o arquivo da chave existe (não pule)
O assistente oferece apagar a chave do computador no final. Se você aceitou, ela **não está mais aqui** e o passo 5 falha com `ERRO: nao achei a chave /chave/chave.txt`. Pior: se o arquivo não existir, o Docker cria uma **pasta** com o nome dele. Confira:
```bash
f=~/cuidar-em-casa-chave-privada-backup.txt; [ -f "$f" ] && echo "chave: OK (arquivo)" || echo "chave: FALTA (recrie abaixo)"
```
Se faltar, recrie o arquivo a partir da cópia do gerenciador de senhas (ou do papel). Cole o bloco, espere o cursor parar, cole **só a linha** `AGE-SECRET-KEY-...` e Enter (nada aparece, é de propósito):
```bash
[ -d ~/cuidar-em-casa-chave-privada-backup.txt ] && rmdir ~/cuidar-em-casa-chave-privada-backup.txt
read -rs -p "Cole a linha AGE-SECRET-KEY-... e tecle Enter: " K; echo
case "$K" in AGE-SECRET-KEY-*) printf '%s
' "$K" > ~/cuidar-em-casa-chave-privada-backup.txt; chmod 600 ~/cuidar-em-casa-chave-privada-backup.txt; echo "chave gravada";; *) echo "Isso nao parece uma chave AGE-SECRET-KEY-";; esac; unset K
```
Depois do ensaio, apague o arquivo de novo (`rm ~/cuidar-em-casa-chave-privada-backup.txt`): a cópia que vale é a do gerenciador de senhas e a do papel.

## 4. Colar a URL do projeto de teste (a senha fica oculta)
**Onde colar: no próprio Git Bash, no mesmo terminal do passo 3** (não feche a janela: a variável `ARQ` só existe nele).
Cole o bloco abaixo; o terminal mostra `Cole a URL do projeto de TESTE e tecle Enter:` e espera. Cole a URL (botão direito do mouse ou Shift+Insert) e aperte Enter. **Nada aparece na tela enquanto você cola: é de propósito.**
**Erro comum:** colar a URL direto no terminal, **antes** de rodar o bloco abaixo. O Bash tenta executar a URL como se fosse um comando (`No such file or directory`) e a senha fica na tela e no histórico. Rode primeiro o bloco; só quando ele ficar esperando, cole a URL. Se isso acontecer: troque a senha do projeto de teste e rode `sed -i '/postgresql:\/\/postgres\./d' ~/.bash_history`.
Monte a URL antes num Bloco de Notas (troque `[YOUR-DATABASE-PASSWORD]` pela senha, sem colchetes), copie, cole no terminal e depois apague o Bloco de Notas sem salvar.
```bash
read -rs -p "Cole a URL do projeto de TESTE e tecle Enter: " DESTINO_URL; echo
DESTINO_URL="${DESTINO_URL//$'\e[200~'/}"; DESTINO_URL="${DESTINO_URL//$'\e[201~'/}"; DESTINO_URL="$(printf '%s' "$DESTINO_URL" | tr -d '[:space:]')"
case "$DESTINO_URL" in postgresql://*) ;; *) echo "Isto nao parece uma URL postgresql://"; unset DESTINO_URL;; esac
case "${DESTINO_URL:-}" in *ynbqblvdtgwabczbssfp*) echo "PARE: essa URL e do projeto PRINCIPAL"; unset DESTINO_URL;; esac
export DESTINO_URL
[ -n "${DESTINO_URL:-}" ] && echo "URL aceita" || echo "URL RECUSADA: refaca o passo 4"
```
Só siga se aparecer **URL aceita**.

## 5. Restaurar
```bash
docker build -q -t bk-cliente:17 - >/dev/null <<'DOCKERFILE'
FROM postgres:17
RUN apt-get update -qq && apt-get install -y -qq age >/dev/null && rm -rf /var/lib/apt/lists/*
DOCKERFILE
MSYS_NO_PATHCONV=1 docker run --rm -e DESTINO_URL \
  -v "$(pwd -W):/work" \
  -v "$(cd ~ && pwd -W)/cuidar-em-casa-chave-privada-backup.txt:/chave/chave.txt:ro" \
  -w /work bk-cliente:17 \
  bash -c 'bash scripts/restaurar.sh "$0" "/chave/chave.txt" "$DESTINO_URL"' "/work/$ARQ"
```
O script mostra 7 etapas. Passou quando:
- **2/7** não reclama (o destino precisa estar vazio; é o projeto novo);
- **5/7** mostra todas as tabelas com `ok` (companies, patients, profiles, recurrence_exceptions, recurrences, service_types, visits);
- **6/7** termina com `permissoes conferidas: anon sem acesso, usuario logado so com select/insert/update/delete.`;
- **7/7 Pronto.**

## 6. Conferir no painel do projeto de teste
- **Table Editor**: `patients` com 3 linhas, `service_types` com 16, `visits` com 1 (os números do backup de 25/11/2026; mudam se você usou o app depois).
- **Authentication → Users**: as mesmas 2 contas (mesmos e-mails). As senhas **não** vão no backup: cada pessoa entra por "Esqueci a senha".
- **Opcional (mais forte):** apontar o app para o projeto de teste e testar "Esqueci a senha". Só se quiser; exige trocar URL e chave no código.

## 7. Limpar (sempre)
```bash
unset DESTINO_URL; rm -rf recebido
```
- Supabase: projeto de teste → Settings → General → **Delete project** (ele guarda uma cópia dos dados).
- Windows: Win+V → **Limpar tudo** (a URL do banco passou pela área de transferência).
- Gerenciador de senhas: apague a senha do projeto de teste.
- Atualize `BACKEND.md` (seção 9.1 ou 12) com a data do ensaio e o resultado.

## Em caso de desastre de verdade (não é ensaio)
Este roteiro vale também para uma perda real, com estas diferenças:
- **O projeto novo não é descartável:** crie-o no passo 1 com o plano e a região definitivos e **não o apague** no passo 7. Pule as limpezas do projeto.
- **O backup não leva configurações do Supabase Auth.** Refaça no painel do projeto novo: política de senha (8 caracteres, maiúsculas, minúsculas, números e símbolos), URL Configuration (Site URL e Redirect URLs), limites de taxa e SMTP próprio. Sem isso, o cadastro e a recuperação de senha não se comportam como antes.
- **Aponte o app para o projeto novo:** URL e chave pública em `site/src/app/state.js` (e a URL na CSP de `site/vercel.json`), depois publique na Vercel.
- **As senhas não vão no backup:** cada pessoa entra por "Esqueci a senha".
- **A chave privada precisa existir** (gerenciador de senhas ou papel). Sem ela, não há como abrir nenhum backup.
- **Depois:** rode de novo o assistente (`bash cuidar-em-casa-contexto/backup/assistente-backup.sh`) apontando para o projeto novo, para o backup diário voltar a funcionar, e registre o ocorrido no `BACKEND.md`.

## Ensaio periódico
Repita este roteiro a cada 3 meses (próximo: até 25/02/2027) e depois de qualquer mudança no `restaurar.sh`, no `fazer-backup.sh` ou no esquema do banco. Registre a data e o resultado no `BACKEND.md`.

## Se falhar
| Mensagem | Causa provável | O que fazer |
|---|---|---|
| `nao consegui abrir. Chave errada, ou o arquivo esta corrompido` | A chave do arquivo não é a do backup | Confira se `~/cuidar-em-casa-chave-privada-backup.txt` é a chave criada no assistente. Se você a trocou depois do backup, baixe um backup novo (rode o fluxo em Actions → Run workflow) |
| `o destino ja tem N tabela(s) em public` | URL de um projeto que não está vazio | Use o projeto novo. **Não** apague tabelas de nenhum projeto para "dar certo" |
| `Tenant or user not found` / falha de senha | URL do pooler errada ou senha do banco errada | Refaça os passos 2 e 4; a senha é a do passo 1.1 |
| `DIFERENTE` nas contagens | Alguém gravou durante a cópia | Rode um backup novo e repita |
| Erro em `auth.users` / `auth.identities` | O esquema do Supabase mudou | **Me mande a mensagem** (sem URL nem senha): o script de restauração precisa ser ajustado |

**Nunca cole a URL com senha, a senha do banco ou o conteúdo da chave privada em conversa, e-mail ou arquivo do projeto.**
