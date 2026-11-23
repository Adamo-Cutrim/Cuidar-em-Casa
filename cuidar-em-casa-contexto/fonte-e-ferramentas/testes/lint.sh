#!/usr/bin/env bash
# Procura nomes nao definidos em site/app.js e site/src (um import esquecido so quebraria quando alguem tocasse aquela tela).
# Instala o ESLint numa pasta temporaria: nada entra no projeto. Precisa de node e npm. Sai com erro se achar no-undef.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cd "$T"; echo '{"name":"lint-tmp","private":true,"version":"0.0.0"}' > package.json
npm install --no-audit --no-fund --silent eslint@9.17.0 globals@15.14.0
cp "$AQUI/eslint.config.mjs" .; cp -r "$AQUI/../../site/app.js" "$AQUI/../../site/src" .
npx eslint -c eslint.config.mjs app.js src
