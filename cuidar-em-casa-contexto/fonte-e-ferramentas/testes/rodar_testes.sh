#!/usr/bin/env bash
# Roda os testes de navegador do site contra o Supabase simulado.
# Uso: fonte-e-ferramentas/testes/rodar_testes.sh   (precisa de Python 3 e playwright)
# Funciona no Linux, no macOS e no Windows (Git Bash).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
# No Windows (Git Bash) o Python precisa de caminhos no formato C:/...
AQUI_PY="$(cd "$AQUI" && (pwd -W 2>/dev/null || pwd))"
# No Windows o comando python3 costuma ser um atalho da Microsoft Store que não roda; testa de verdade.
PY=python3; python3 -c '' 2>/dev/null || PY=python
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1
TMP_ABS="${TMPDIR:-${TEMP:-/tmp}}"
export SITE_DIR="$AQUI_PY/site_test" SHOT_DIR="${SHOT_DIR:-$TMP_ABS/}"
rm -rf "$AQUI/site_test"; cp -r "$AQUI/../../site" "$AQUI/site_test"
# O site de teste fala com o mock local em vez do Supabase real.
sed -i "s#https://ynbqblvdtgwabczbssfp.supabase.co#http://127.0.0.1:8766#g" "$AQUI/site_test/app.js" "$AQUI/site_test/vercel.json"
# CSP_ESTRITA=1: testa com style-src sem 'unsafe-inline' (como ficaria a producao depois da E3).
if [ -n "${CSP_ESTRITA:-}" ]; then
  sed -i "s/style-src 'self' 'unsafe-inline'/style-src 'self'/" "$AQUI/site_test/vercel.json"
  if grep -q "unsafe-inline" "$AQUI/site_test/vercel.json"; then echo "CSP estrita nao aplicada"; exit 1; fi
  echo "(CSP estrita ativa: sem unsafe-inline em style-src)"
fi
$PY "$AQUI/harness.py" mock & M=$!
$PY "$AQUI/harness.py" static & S=$!
trap 'kill $M $S 2>/dev/null; rm -rf "$AQUI/site_test"' EXIT
sleep 1
$PY "$AQUI/t1.py"
$PY "$AQUI/t2.py" | tee "$SHOT_DIR/t2_saida.txt"
grep -q ' 0 falhas' "$SHOT_DIR/t2_saida.txt"
