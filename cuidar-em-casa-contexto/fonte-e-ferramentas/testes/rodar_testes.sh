#!/usr/bin/env bash
# Roda os testes de navegador do site contra o Supabase simulado.
# Uso: fonte-e-ferramentas/testes/rodar_testes.sh   (precisa de python3 e playwright)
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
SITE="$AQUI/../../site"
export SITE_DIR="$AQUI/site_test" SHOT_DIR="${SHOT_DIR:-${TMPDIR:-/tmp}/}"
rm -rf "$SITE_DIR"; cp -r "$SITE" "$SITE_DIR"
# O site de teste fala com o mock local em vez do Supabase real.
sed -i "s#https://ynbqblvdtgwabczbssfp.supabase.co#http://127.0.0.1:8766#g" "$SITE_DIR/app.js" "$SITE_DIR/vercel.json"
python3 "$AQUI/harness.py" mock & M=$!
python3 "$AQUI/harness.py" static & S=$!
trap 'kill $M $S 2>/dev/null; rm -rf "$SITE_DIR"' EXIT
sleep 1
python3 "$AQUI/t1.py"
python3 "$AQUI/t2.py" | tee "$SHOT_DIR/t2_saida.txt"
grep -q ' 0 falhas' "$SHOT_DIR/t2_saida.txt"
