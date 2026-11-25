/* Service worker (v20a): o app ABRE sem internet.
   Guarda SÓ os arquivos do próprio site (código, estilos, fontes, ícone). NUNCA guarda dados: os pedidos ao Supabase
   são de outro endereço e passam direto, sem cache (guardar dados no aparelho é a v20b).
   Com internet, sempre busca a versão nova e atualiza o guardado; o guardado só é usado quando a rede falha.
   A lista abaixo tem de bater com os arquivos do site (teste: fonte-e-ferramentas/testes/unit/sw.test.mjs).
   Mudou a lista? Troque também o número da versão. */
const CACHE='cuidar-em-casa-app-v1';
const ARQUIVOS=['/','/app.js','/fonts/bricolage-latin-ext.woff2','/fonts/bricolage-latin.woff2','/fonts/figtree-latin-ext.woff2','/fonts/figtree-latin.woff2','/icon.svg','/manifest.webmanifest','/src/app/catalog.js','/src/app/model.js','/src/app/persistence.js','/src/app/session.js','/src/app/state.js','/src/app/store.js','/src/core/dates.js','/src/core/ids.js','/src/core/limits.js','/src/core/money.js','/src/core/text.js','/src/data/rows.js','/src/data/supabase.js','/src/data/sync.js','/src/domain/billing.js','/src/domain/queries.js','/src/domain/recurrence.js','/src/domain/tipos.js','/src/domain/validation.js','/src/domain/visit.js','/src/ui/account.js','/src/ui/actions.js','/src/ui/bits.js','/src/ui/details.js','/src/ui/dom.js','/src/ui/fields.js','/src/ui/forms.js','/src/ui/report.js','/src/ui/sheet.js','/src/ui/views.js','/styles.css'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ARQUIVOS);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==self.location.origin) return;
  e.respondWith(daRedeOuGuardado(r,u.pathname,r.mode==='navigate'));
});
async function daRedeOuGuardado(r,chave,navegacao){
  const c=await caches.open(CACHE);
  try{
    const resp=await fetch(r);
    if(resp.ok&&resp.type==='basic'&&!resp.redirected) c.put(chave,resp.clone());
    return resp;
  }catch(err){
    const guardado=(await c.match(chave))||(navegacao?await c.match('/'):undefined);   /* sem rede, qualquer navegação abre o app */
    if(guardado) return guardado;
    throw err;
  }
}
