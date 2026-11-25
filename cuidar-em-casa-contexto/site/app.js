/* Cuidar em Casa: ponto de entrada (v17). O código está em src/: core e domain (regras puras), data (Supabase), app (estado e gravação) e ui (telas). */
import './src/ui/dom.js';
import './src/app/catalog.js';
import './src/ui/fields.js';
import './src/app/state.js';
import './src/app/persistence.js';
import './src/app/session.js';
import './src/ui/report.js';
import './src/ui/account.js';
import './src/app/model.js';
import './src/ui/bits.js';
import './src/ui/views.js';
import './src/ui/sheet.js';
import './src/ui/details.js';
import './src/ui/forms.js';
import './src/ui/actions.js';
import {boot} from './src/ui/account.js';
/* ---------- início ---------- */
boot();
/* O uso sem internet (v20a/v20b) foi desfeito em 25/11/2026: apaga o que ele deixou neste aparelho
   (service worker, arquivos guardados e a cópia cifrada do PIN). Manter por alguns meses, junto com o sw.js de limpeza. */
(function limparUsoSemInternet(){
  try{if(navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});}catch(e){}
  try{if(window.caches) caches.keys().then(function(ks){ks.forEach(function(k){if(k.indexOf('cuidar-em-casa')===0) caches.delete(k);});}).catch(function(){});}catch(e){}
  try{if(window.indexedDB) indexedDB.deleteDatabase('cuidar-em-casa');}catch(e){}
})();
