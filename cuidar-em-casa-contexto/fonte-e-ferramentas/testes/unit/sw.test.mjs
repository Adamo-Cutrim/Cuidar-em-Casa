/* v20a: o service worker guarda os arquivos do site para o app abrir sem internet.
   Se um arquivo do site ficar fora da lista, o app quebra offline; se a lista citar um arquivo que não existe,
   a instalação inteira falha (cache.addAll é tudo ou nada). Este teste mantém a lista igual à pasta do site. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const SITE = fileURLToPath(new URL('../../../site/', import.meta.url));
const FORA = new Set(['vercel.json', 'sw.js', 'fonts/LICENCAS.txt']);   // config do host, o próprio SW e texto de licença
function arquivos(d) {
  return readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? arquivos(p) : [relative(SITE, p).split(sep).join('/')]; });
}
const sw = () => readFileSync(join(SITE, 'sw.js'), 'utf8');
function lista() {
  const m = sw().match(/const ARQUIVOS=\[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js precisa declarar const ARQUIVOS=[...]');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

test('a lista do service worker tem todos os arquivos do site (e só eles)', () => {
  const esperado = arquivos(SITE).filter(f => !FORA.has(f)).map(f => f === 'index.html' ? '/' : '/' + f).sort();
  assert.deepEqual([...lista()].sort(), esperado);
});
test('a lista não repete arquivo', () => {
  const l = lista(); assert.equal(new Set(l).size, l.length);
});
test('a página entra como "/" (o host redireciona /index.html para /, e resposta redirecionada não serve offline)', () => {
  assert.ok(lista().includes('/')); assert.ok(!lista().includes('/index.html'));
});
test('o service worker nunca guarda pedidos de outro endereço (os dados vêm do Supabase)', () => {
  assert.match(sw(), /u\.origin!==self\.location\.origin\) return;/);
  assert.doesNotMatch(sw(), /supabase\.co/);
});
test('o app registra o service worker', () => {
  assert.match(readFileSync(join(SITE, 'app.js'), 'utf8'), /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
});
test('o host manda o navegador revalidar o sw.js (senão uma versão nova demora a chegar)', () => {
  const v = JSON.parse(readFileSync(join(SITE, 'vercel.json'), 'utf8'));
  const h = v.headers.find(x => x.source === '/sw.js');
  assert.ok(h && h.headers.some(x => x.key === 'Cache-Control' && /no-cache/.test(x.value)));
});
test('a política de segurança deixa o app buscar os próprios arquivos (sem isso o service worker não instala)', () => {
  const v = JSON.parse(readFileSync(join(SITE, 'vercel.json'), 'utf8'));
  const csp = v.headers[0].headers.find(x => x.key === 'Content-Security-Policy').value;
  const cs = csp.split(';').map(s => s.trim()).find(s => s.startsWith('connect-src'));
  assert.deepEqual(cs.split(/\s+/).slice(1).sort(), ["'self'", 'https://ynbqblvdtgwabczbssfp.supabase.co'].sort());
});
