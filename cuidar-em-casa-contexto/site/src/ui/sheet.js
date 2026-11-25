/* Janelas (folha de baixo), aviso rápido, copiar, confirmações. */
import {st} from '../app/store.js';
import {LONG,SHORT} from '../core/limits.js';
import {esc} from '../core/text.js';
import {$,ic} from './dom.js';
function setInert(on){
  ['#app','#fab','#tabbar'].forEach(function(s){const e=$(s);if(e){if(on) e.setAttribute('inert','');else e.removeAttribute('inert');}});
  document.body.style.overflow=on?'hidden':'';
}
const LONG_FIELDS=['ref','condicoes','alergias','medicamentos','obs'];
function applyLimits(root){
  Array.prototype.forEach.call(root.querySelectorAll('input[name],textarea[name]'),function(el){
    if(el.hasAttribute('maxlength')||el.dataset.kind==='date'||el.dataset.kind==='time'||el.type==='checkbox'||el.type==='hidden'||el.type==='password') return;
    el.setAttribute('maxlength',LONG_FIELDS.indexOf(el.name)>-1?LONG:(el.name==='valor'||el.name==='valorPadrao'?'20':SHORT));
  });
}
export function openSheet(title,body){
  if($('#sheet-root').firstChild) closeSheet(true);
  else st.lastFocus=document.activeElement;
  $('#sheet-root').innerHTML='<div class="scrim" data-action="close-sheet"></div><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title" tabindex="-1">'+esc(title)+'</h2><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">'+ic('x')+'</button></div><div class="sheet-body">'+body+'</div></section>';
  applyLimits($('#sheet-root'));
  setInert(true);
  const h=$('#sheet-title');if(h) h.focus();
}
export function closeSheet(keep){
  $('#sheet-root').innerHTML='';
  setInert(false);
  if(!keep&&st.lastFocus&&document.contains(st.lastFocus)){try{st.lastFocus.focus();}catch(e){}}
}
let toastT=null;
export function toast(msg){
  const t=$('#toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('show');},2600);
}
export function copyText(txt){
  const done=function(){toast('Copiado.');};
  const fail=function(){toast('Não foi possível copiar. Selecione o texto e copie.');};
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,fail);
    else fail();
  }catch(e){fail();}
}
export function moveBlock(){
  return '<div class="confirm" id="move-confirm" role="alert" hidden><p id="move-msg"></p><div class="two"><button type="button" class="btn danger" data-action="confirm-move">Confirmar mudança</button><button type="button" class="btn" data-action="cancel-move">Voltar</button></div></div>';
}
export function askMove(f,html){
  const c=f.querySelector('#move-confirm'),a=f.querySelector('.sheet-actions');
  f.querySelector('#move-msg').innerHTML=html;
  c.hidden=false;if(a) a.hidden=true;
  const e=f.querySelector('#f-err');if(e) e.textContent='';
  const b=c.querySelector('[data-action="confirm-move"]');
  c.scrollIntoView({block:'nearest'});if(b) b.focus({preventScroll:true});
}
export function clearMove(f){
  const c=f.querySelector('#move-confirm'),a=f.querySelector('.sheet-actions');
  if(c) c.hidden=true;if(a) a.hidden=false;delete f.dataset.moveOk;
}
export function askBlock(id,msg,action,dataId,label='Excluir'){
  return '<button type="button" class="btn danger" id="ask-'+id+'" data-action="ask" data-confirm="cf-'+id+'">'+label+'</button>'+
    '<div class="confirm" id="cf-'+id+'" hidden><p>'+msg+'</p><div class="two"><button type="button" class="btn danger" data-action="'+action+'" data-id="'+dataId+'">'+label+'</button><button type="button" class="btn" data-action="unask" data-confirm="cf-'+id+'" data-ask="ask-'+id+'">Manter</button></div></div>';
}
export function kv(label,html,extra){
  return '<div><div class="grow"><span class="k">'+label+'</span><div class="v">'+html+'</div>'+(extra||'')+'</div></div>';
}
function copyBtn(txt,label){
  return '<button type="button" class="icon-btn sm" data-action="copy" data-text="'+esc(txt)+'" aria-label="'+esc(label)+'">'+ic('copy')+'</button>';
}
export function kvCopy(label,txt,extra,copyLabel){
  return '<div><div class="grow"><span class="k">'+label+'</span><div class="v">'+esc(txt)+'</div>'+(extra||'')+'</div>'+copyBtn(txt,copyLabel||('Copiar '+label.toLowerCase()))+'</div>';
}
