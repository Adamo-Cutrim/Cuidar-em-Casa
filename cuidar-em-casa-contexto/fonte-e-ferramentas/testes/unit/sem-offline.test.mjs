/* O uso sem internet (v20a/v20b) foi desfeito em 25/11/2026. Estes testes impedem que ele volte pela metade:
   o app não registra service worker, o sw.js só se desinstala, e a política de segurança volta a falar só com o Supabase. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const SITE = fileURLToPath(new URL('../../../site/', import.meta.url));
const ler = f => readFileSync(join(SITE, f), 'utf8');

test('o app não registra service worker', () => {
  assert.doesNotMatch(ler('app.js'), /serviceWorker\.register/);
});
test('o app apaga o que a versão sem internet deixou (service worker, cache e cópia do PIN)', () => {
  const a = ler('app.js');
  assert.match(a, /getRegistrations\(\)/); assert.match(a, /\.unregister\(\)/);
  assert.match(a, /caches\.delete/); assert.match(a, /indexedDB\.deleteDatabase\('cuidar-em-casa'\)/);
});
test('o sw.js que fica no ar só se desinstala: não guarda nem responde nada', () => {
  const s = ler('sw.js');
  assert.match(s, /self\.registration\.unregister\(\)/);
  assert.match(s, /caches\.delete/);
  assert.doesNotMatch(s, /addEventListener\('fetch'/);
  assert.doesNotMatch(s, /caches\.open|\.put\(|addAll/);
});
test('a política de segurança volta a permitir conexão só com o Supabase', () => {
  const v = JSON.parse(ler('vercel.json'));
  const csp = v.headers[0].headers.find(x => x.key === 'Content-Security-Policy').value;
  const cs = csp.split(';').map(s => s.trim()).find(s => s.startsWith('connect-src'));
  assert.equal(cs, 'connect-src https://ynbqblvdtgwabczbssfp.supabase.co');
});
test('o host manda revalidar o sw.js (para a limpeza chegar logo aos aparelhos)', () => {
  const v = JSON.parse(ler('vercel.json'));
  const h = v.headers.find(x => x.source === '/sw.js');
  assert.ok(h && h.headers.some(x => x.key === 'Cache-Control' && /no-cache/.test(x.value)));
});
test('os módulos da versão sem internet não existem mais', () => {
  for (const f of ['src/data/cofre.js', 'src/app/aparelho.js']) assert.equal(existsSync(join(SITE, f)), false, f);
});
