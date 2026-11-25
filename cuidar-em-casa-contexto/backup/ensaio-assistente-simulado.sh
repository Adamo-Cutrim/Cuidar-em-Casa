#!/usr/bin/env bash
# Simula o assistente (assistente-backup.sh) com um 'gh', um 'age' e uma area de transferencia FALSOS, numa pasta descartavel.
# Nao toca no GitHub, no Supabase nem na sua pasta pessoal. Confere o caminho dos segredos: onde eles entram e onde NAO podem aparecer.
# Uso: backup/ensaio-assistente-simulado.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
SANDBOX="$(mktemp -d)"; trap 'rm -rf "$SANDBOX"' EXIT
BIN="$SANDBOX/bin"; ESTADO="$SANDBOX/estado"; HOME_FAKE="$SANDBOX/home"; ORIGEM="$SANDBOX/origem.git"
mkdir -p "$BIN" "$ESTADO" "$HOME_FAKE"
LOG="$ESTADO/chamadas.log"; SEGREDOS="$ESTADO/segredos.log"; CLIP="$ESTADO/areadetransferencia.log"; : > "$LOG"; : > "$SEGREDOS"; : > "$CLIP"
OK=0; FALHA=0
verifica() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then OK=$((OK+1)); printf '  \033[32mOK\033[0m     %s\n' "$d"; else FALHA=$((FALHA+1)); printf '  \033[31mFALHA\033[0m  %s\n' "$d"; fi; }
git init -q --bare "$ORIGEM"

# ---- ferramentas falsas (o PATH da simulacao NAO inclui o gh, o docker nem o age de verdade) ----
cat > "$BIN/gh" <<'EOF'
#!/usr/bin/env bash
echo "gh $*" >> "$FAKE_LOG"
case "$1 $2" in
  "auth status") exit 0 ;;
  "api user") echo "Adamo-Cutrim" ;;
  "repo view")
     if [[ "$*" == *isPrivate* ]]; then [[ "${FAKE_PUBLICO:-0}" == "1" ]] && echo false || echo true
     elif [[ "$*" == *nameWithOwner* ]]; then echo "Adamo-Cutrim/cuidar-em-casa-backups"
     else [[ -f "$FAKE_ESTADO/repo_criado" ]]; fi ;;
  "repo create") touch "$FAKE_ESTADO/repo_criado" ;;
  "repo clone") git clone -q "$FAKE_ORIGEM" "$4" ;;
  "secret set") v="$(cat)"; echo "secret $3 = $v" >> "$FAKE_SEGREDOS" ;;
  "variable set") echo "var $3 = $5" >> "$FAKE_SEGREDOS" ;;
  "workflow run") touch "$FAKE_ESTADO/disparou" ;;
  "run list") [[ -f "$FAKE_ESTADO/disparou" ]] && echo 123 || echo 0 ;;
  "run watch") exit 0 ;;
  "run download") mkdir -p "$5/backup-123"; cp "$FAKE_ESTADO/exemplo.age" "$5/backup-123/cuidar-em-casa-20261125-053000.tar.gz.age" ;;
  *) echo "gh falso: comando nao previsto: $*" >&2; exit 9 ;;
esac
EOF
cat > "$BIN/age-keygen" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "-o" ]]; then printf '# created: 2026-11-25\n# public key: age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nAGE-SECRET-KEY-1CHAVEDEMENTIRA\n' > "$2"; echo "Public key: age1..." >&2
elif [[ "$1" == "-y" ]]; then echo "age1$(printf 'q%.0s' $(seq 1 58))"; fi
EOF
cat > "$BIN/age" <<'EOF'
#!/usr/bin/env bash
cat "$FAKE_ESTADO/pacote.tar.gz"
EOF
for f in clip.exe; do printf '#!/usr/bin/env bash\ncat >> "$FAKE_CLIP"; echo "<<fim>>" >> "$FAKE_CLIP"\n' > "$BIN/$f"; done
for f in explorer.exe notepad; do printf '#!/usr/bin/env bash\necho "abriu: $*" >> "$FAKE_LOG"\n' > "$BIN/$f"; done
chmod +x "$BIN"/*
# um "backup" de mentira para as etapas 7 e 8
( cd "$ESTADO" && printf 'companies|2\npatients|3\nvisits|121\n' > contagens.txt && tar -czf pacote.tar.gz contagens.txt && cp pacote.tar.gz exemplo.age )

rodar() { # rodar "respostas separadas por barra-n"  -> roda o assistente e devolve o codigo de saida
  ( cd "$SANDBOX" && env -i HOME="$HOME_FAKE" PATH="$BIN:/usr/bin:/bin:/ucrt64/bin:/mingw64/bin" \
      FAKE_LOG="$LOG" FAKE_SEGREDOS="$SEGREDOS" FAKE_CLIP="$CLIP" FAKE_ESTADO="$ESTADO" FAKE_ORIGEM="$ORIGEM" FAKE_PUBLICO="${FAKE_PUBLICO:-0}" \
      bash "$AQUI/assistente-backup.sh" < <(printf '%b' "$1") > "$ESTADO/saida.txt" 2>&1 )
}

echo "== A. Caminho feliz: as 9 etapas, com o ensaio de restauracao adiado"
# respostas: banner, etapa1, nome do repo (padrao), criar? sim, enter, abrir bloco de notas? nao, frase da chave, projeto (padrao), rodou sem erro? sim, host, retencao (padrao), ensaio? nao, apagar chave? nao
RESP='\n\n\ny\n\nn\nguardei em dois lugares\n\ny\naws-0-sa-east-1.pooler.supabase.com\n\nn\nn\n'
rodar "$RESP" && R=0 || R=$?
verifica "o assistente terminou com sucesso (codigo $R)" test "$R" = "0"
PASTA="$HOME_FAKE/cuidar-em-casa-backups"
verifica "o repositorio privado foi criado (gh repo create --private)" grep -q "repo create Adamo-Cutrim/cuidar-em-casa-backups --private" "$LOG"
verifica "a pasta do repositorio fica na pasta pessoal, FORA do repositorio do projeto" test -d "$PASTA/.git"
verifica "o agendador chegou ao repositorio privado (workflow + scripts + .gitignore)" bash -c "cd '$PASTA' && git ls-files | sort | tr '\n' ' ' | grep -q '.github/workflows/backup.yml.*scripts/fazer-backup.sh.*scripts/restaurar.sh'"
verifica "o envio (push) chegou na origem" bash -c "git --git-dir='$ORIGEM' log --oneline | grep -q 'Agendador do backup'"
verifica "o .gitignore do repositorio privado bloqueia chaves e saidas" bash -c "grep -q 'AGE-SECRET-KEY' '$PASTA/.gitignore' && grep -q '^saida/' '$PASTA/.gitignore' && grep -q '^\.env' '$PASTA/.gitignore'"
verifica "gravou o segredo BACKUP_AGE_PUBLIC_KEY (chave PUBLICA age1...)" grep -Eq '^secret BACKUP_AGE_PUBLIC_KEY = age1[0-9a-z]{58}$' "$SEGREDOS"
verifica "gravou BACKUP_DB_URL no formato certo (role backup_ro, pooler, ssl)" grep -Eq '^secret BACKUP_DB_URL = postgresql://backup_ro\.ynbqblvdtgwabczbssfp:[0-9a-f]{48}@aws-0-sa-east-1\.pooler\.supabase\.com:5432/postgres\?sslmode=require$' "$SEGREDOS"
verifica "gravou a retencao (30 dias) como variavel, nao como segredo" grep -q '^var BACKUP_RETENCAO_DIAS = 30$' "$SEGREDOS"
SENHA="$(grep -oE 'backup_ro\.ynbqblvdtgwabczbssfp:[0-9a-f]{48}' "$SEGREDOS" | head -1 | cut -d: -f2)"
verifica "a senha gerada tem 48 caracteres hexadecimais" test "${#SENHA}" = "48"
verifica "a MESMA senha foi para o comando SQL copiado (area de transferencia)" grep -q "password '$SENHA'" "$CLIP"
verifica "a area de transferencia foi LIMPA no fim da etapa" bash -c "tail -2 '$CLIP' | head -1 | grep -qv password"
verifica "a senha NAO aparece nas chamadas do gh (nem na linha de comando)" bash -c "! grep -q '$SENHA' '$LOG'"
verifica "a senha NAO aparece na tela do assistente" bash -c "! grep -q '$SENHA' '$ESTADO/saida.txt'"
verifica "a senha NAO foi gravada em nenhum arquivo (so no segredo do GitHub)" bash -c "! grep -rq '$SENHA' '$HOME_FAKE' '$ORIGEM'"
verifica "a chave PRIVADA existe so na pasta pessoal, nunca no repositorio" bash -c "test -f '$HOME_FAKE/cuidar-em-casa-chave-privada-backup.txt' && ! grep -rq 'AGE-SECRET-KEY-1CHAVEDEMENTIRA' '$PASTA' '$ORIGEM'"
verifica "o arquivo de valores (nao secretos) so tem repo, projeto e host" bash -c "sort '$HOME_FAKE/.cuidar-em-casa-backup.env' | tr '\n' ' ' | grep -q '^DB_HOST=aws-0-sa-east-1.pooler.supabase.com PROJECT_REF=ynbqblvdtgwabczbssfp REPO_NOME=cuidar-em-casa-backups $'"
verifica "NAO criou .env na pasta onde o assistente foi executado nem no repositorio privado" bash -c "test ! -e '$SANDBOX/.env' && test ! -e '$PASTA/.env'"
verifica "abriu o painel do Supabase no editor SQL e no Connect" bash -c "grep -q 'dashboard/project/ynbqblvdtgwabczbssfp/sql/new' '$LOG' && grep -q 'showConnect=true&method=session' '$LOG'"
verifica "disparou o fluxo e baixou o arquivo cifrado" bash -c "grep -q 'workflow run backup.yml' '$LOG' && grep -q 'run download 123' '$LOG'"
verifica "a etapa 8 abriu o backup com a chave e mostrou as contagens" grep -q 'patients|3' "$ESTADO/saida.txt"
verifica "avisa no fim que o ensaio de restauracao ficou pendente" grep -q 'ensaio de restauração' "$ESTADO/saida.txt"

echo "== B. Repositorio PUBLICO: o assistente tem de parar antes de qualquer segredo"
rm -rf "$HOME_FAKE"/* "$HOME_FAKE"/.cuidar* "$ESTADO/repo_criado" "$ESTADO/disparou"; : > "$SEGREDOS"; : > "$CLIP"
FAKE_PUBLICO=1 rodar "$RESP" && R=0 || R=$?
verifica "recusou (codigo diferente de 0)" test "$R" != "0"
verifica "nao gravou nenhum segredo" test ! -s "$SEGREDOS"
verifica "nao gerou chave nem comando SQL" bash -c "test ! -e '$HOME_FAKE/cuidar-em-casa-chave-privada-backup.txt' && test ! -s '$CLIP'"
verifica "explicou o motivo" grep -q 'NÃO é privado' "$ESTADO/saida.txt"

echo "== C. Endereco do banco invalido: para antes de gravar o segredo do banco"
rm -rf "$HOME_FAKE"/* "$HOME_FAKE"/.cuidar* "$ESTADO/repo_criado" "$ESTADO/disparou"; : > "$SEGREDOS"; : > "$CLIP"
RESP_RUIM='\n\n\ny\n\nn\nguardei em dois lugares\n\ny\nexemplo.com.br\n'
rodar "$RESP_RUIM" && R=0 || R=$?
verifica "recusou o endereco (codigo diferente de 0)" test "$R" != "0"
verifica "NAO gravou BACKUP_DB_URL" bash -c "! grep -q 'BACKUP_DB_URL' '$SEGREDOS'"
verifica "mas a chave publica ja estava gravada (etapa 3 e anterior)" grep -q 'BACKUP_AGE_PUBLIC_KEY' "$SEGREDOS"

echo; printf '== Resultado: %s verificacoes OK, %s falhas\n' "$OK" "$FALHA"
[[ "$FALHA" == "0" ]]
