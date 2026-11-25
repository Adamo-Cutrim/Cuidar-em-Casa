/* O uso sem internet (v20a/v20b) foi DESFEITO em 25/11/2026, por segurança e estabilidade.
   Este arquivo existe só para limpar os aparelhos que instalaram a versão antiga: o navegador busca o sw.js novo,
   instala este, que apaga os arquivos guardados e se desinstala. Ele não guarda nem responde nada.
   Pode ser removido daqui a alguns meses (o app.js também limpa ao abrir). */
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys()
    .then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));})
    .then(function(){return self.registration.unregister();}));
});
