// Usado por lint.sh. Procura nomes nao definidos (no-undef) e declaracoes repetidas em site/app.js e site/src.
import globals from 'globals';
export default [{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
  rules: { 'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
}];
