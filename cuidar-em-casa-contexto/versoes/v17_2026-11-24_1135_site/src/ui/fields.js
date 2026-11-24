/* Campos de data e hora: digitar, calendário e roda de rolagem; rótulos da semana e do dia. */
import {ui} from '../app/state.js';
import {MON,WD,WDL,addDays,brToIso,fromIso,iso,isoToBr,pad} from '../core/dates.js';
import {esc} from '../core/text.js';
import {$,ic} from './dom.js';
export function weekLabel(){
  const a=fromIso(ui.weekStart),b=addDays(a,6);
  if(a.getMonth()===b.getMonth()) return a.getDate()+' a '+b.getDate()+' de '+MON[b.getMonth()];
  return a.getDate()+' de '+MON[a.getMonth()].slice(0,3)+'. a '+b.getDate()+' de '+MON[b.getMonth()].slice(0,3)+'.';
}
export const dayTitle=d=>WDL[d.getDay()]+', '+d.getDate()+' de '+MON[d.getMonth()];

export function dateField(id,name,value,opt){
  opt=opt||{};
  return '<div class="datef"><div class="datef-row"><input id="'+id+'" name="'+name+'" type="text" data-kind="date" inputmode="numeric" autocomplete="off" placeholder="dd/mm/aaaa" maxlength="10" value="'+esc(isoToBr(value))+'">'+
    '<button type="button" class="datef-btn" data-action="open-cal" aria-label="Abrir calendário" aria-expanded="false" aria-controls="cal-'+id+'">'+ic('down')+'</button></div>'+
    '<div class="cal" id="cal-'+id+'" role="group" aria-label="Escolher data" hidden>'+
    '<div class="cal-head"><button type="button" class="icon-btn sm" data-action="cal-nav" data-dir="-1" aria-label="Mês anterior">'+ic('left')+'</button><span class="cal-title" aria-live="polite"></span><button type="button" class="icon-btn sm" data-action="cal-nav" data-dir="1" aria-label="Próximo mês">'+ic('right')+'</button></div>'+
    '<div class="cal-grid"></div>'+
    '<div class="cal-foot"><button type="button" class="btn small ghost" data-action="cal-today">Hoje</button>'+(opt.clear?'<button type="button" class="btn small ghost" data-action="cal-clear">Limpar</button>':'')+'</div></div></div>';
}
export function maskDate(el){
  let v=el.value;
  if(/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) v=isoToBr(v.trim());
  const pos=el.selectionStart==null?v.length:el.selectionStart;
  const before=v.slice(0,pos).replace(/\D/g,'').length;
  const d=v.replace(/\D/g,'').slice(0,8);
  const out=d.length>4?d.slice(0,2)+'/'+d.slice(2,4)+'/'+d.slice(4):d.length>2?d.slice(0,2)+'/'+d.slice(2):d;
  if(out!==el.value){
    el.value=out;
    let c=0,n=0;
    while(c<out.length&&n<before){if(/\d/.test(out.charAt(c))) n++;c++;}
    try{el.setSelectionRange(c,c);}catch(e){}
  }
}
export function parseTime(t){
  const m=/^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if(!m) return null;
  const h=+m[1],mi=+m[2];
  if(h>23||mi>59) return null;
  return pad(h)+':'+pad(mi);
}
export function timeField(id,name,value){
  const items=n=>Array.from({length:n},(_,i)=>'<div class="wi" role="option" aria-selected="false" data-action="wheel-pick">'+pad(i)+'</div>').join('');
  const wheel=(label,n)=>'<div class="wheel" role="listbox" tabindex="0" aria-label="'+label+'"><div class="wsp" aria-hidden="true"></div>'+items(n)+'<div class="wsp" aria-hidden="true"></div></div>';
  return '<div class="datef"><div class="datef-row"><input id="'+id+'" name="'+name+'" type="text" data-kind="time" inputmode="numeric" autocomplete="off" placeholder="hh:mm" maxlength="5" value="'+esc(value||'')+'">'+
    '<button type="button" class="datef-btn" data-action="open-time" aria-label="Abrir seletor de horário" aria-expanded="false" aria-controls="tp-'+id+'">'+ic('down')+'</button></div>'+
    '<div class="cal" id="tp-'+id+'" role="group" aria-label="Escolher horário" hidden><div class="wheels"><div class="wheel-band" aria-hidden="true"></div>'+wheel('Horas',24)+'<span class="wheel-sep" aria-hidden="true">:</span>'+wheel('Minutos',60)+'</div>'+
    '<div class="cal-foot"><button type="button" class="btn small ghost" data-action="time-done">Concluir</button></div></div></div>';
}
export function maskTime(el){
  const raw=el.value;
  const pos=el.selectionStart==null?raw.length:el.selectionStart;
  let before=raw.slice(0,pos).replace(/\D/g,'').length;
  let d=raw.replace(/\D/g,'').slice(0,4);
  if(d.length&&d.charAt(0)>'2'){d=('0'+d).slice(0,4);before=Math.min(before+1,4);}
  const out=d.length>2?d.slice(0,2)+':'+d.slice(2):d;
  if(out!==el.value){
    el.value=out;
    let c=0,n=0;
    while(c<out.length&&n<before){if(/\d/.test(out.charAt(c))) n++;c++;}
    try{el.setSelectionRange(c,c);}catch(e){}
  }
}
/* Seletor em rolagem: cada roda tem itens de 44px que encaixam no centro; o número do meio é o escolhido. */
const WH=44;
export const wheelIdx=wh=>Math.max(0,Math.min(wh.querySelectorAll('.wi').length-1,Math.round(wh.scrollTop/WH)));
function wheelMark(wh){
  const i=wheelIdx(wh);
  wh.querySelectorAll('.wi').forEach(function(e,k){
    const on=k===i;
    if(e.classList.contains('sel')!==on){e.classList.toggle('sel',on);e.setAttribute('aria-selected',on?'true':'false');}
  });
}
export function wheelGo(wh,i,instant){
  const n=wh.querySelectorAll('.wi').length;
  wh.scrollTo({top:Math.max(0,Math.min(n-1,i))*WH,behavior:instant?'auto':'smooth'});
}
export function timeApply(w){
  const ws=w.querySelectorAll('.wheel');
  $('input',w).value=pad(wheelIdx(ws[0]))+':'+pad(wheelIdx(ws[1]));
  const e=$('#f-err');if(e) e.textContent='';
}
export function timeSync(w){
  const t=parseTime($('input',w).value)||'09:00';
  const ws=w.querySelectorAll('.wheel');
  [+t.slice(0,2),+t.slice(3)].forEach(function(v,k){
    const wh=ws[k];
    wh.dataset.lock='1';wh.scrollTop=v*WH;wheelMark(wh);
    setTimeout(function(){delete wh.dataset.lock;},250);
  });
}
export function timeOpen(w){
  document.querySelectorAll('.datef').forEach(function(o){if(o!==w&&!$('.cal',o).hidden) calClose(o,false);});
  const cal=$('.cal',w);
  cal.hidden=false;$('.datef-btn',w).setAttribute('aria-expanded','true');
  timeSync(w);
  cal.scrollIntoView({block:'nearest'});
}
document.addEventListener('scroll',function(e){
  const wh=e.target;
  if(!wh||!wh.classList||!wh.classList.contains('wheel')) return;
  wheelMark(wh);
  if(wh.dataset.lock) return;
  clearTimeout(wh._t);
  wh._t=setTimeout(function(){timeApply(wh.closest('.datef'));},120);
},true);
export function calRender(w){
  const cal=$('.cal',w),inp=$('input',w);
  const y=+cal.dataset.y,m=+cal.dataset.m;
  const sel=brToIso(inp.value),today=iso(new Date());
  const t=MON[m]+' de '+y;
  $('.cal-title',cal).textContent=t.charAt(0).toUpperCase()+t.slice(1);
  let h=WD.map(x=>'<span class="cal-wd" aria-hidden="true">'+x+'</span>').join('');
  for(let i=0;i<new Date(y,m,1).getDay();i++) h+='<span></span>';
  const n=new Date(y,m+1,0).getDate();
  for(let d=1;d<=n;d++){
    const k=y+'-'+pad(m+1)+'-'+pad(d);
    h+='<button type="button" class="cal-day'+(k===sel?' sel':'')+(k===today?' today':'')+'" data-action="cal-pick" data-iso="'+k+'" aria-label="'+esc(dayTitle(new Date(y,m,d))+' de '+y)+'"'+(k===sel?' aria-pressed="true"':'')+(k===today?' aria-current="date"':'')+'>'+d+'</button>';
  }
  $('.cal-grid',cal).innerHTML=h;
}
export function calClose(w,focusBtn){
  const cal=$('.cal',w),b=$('.datef-btn',w);
  cal.hidden=true;b.setAttribute('aria-expanded','false');
  if(focusBtn) b.focus();
}
export function calOpen(w){
  document.querySelectorAll('.datef').forEach(function(o){if(o!==w&&!$('.cal',o).hidden) calClose(o,false);});
  const cal=$('.cal',w),inp=$('input',w);
  const d=fromIso(brToIso(inp.value)||iso(new Date()));
  cal.dataset.y=d.getFullYear();cal.dataset.m=d.getMonth();
  cal.hidden=false;$('.datef-btn',w).setAttribute('aria-expanded','true');
  calRender(w);
  const f=$('.cal-day.sel',cal)||$('.cal-day.today',cal)||$('.cal-day',cal);
  if(f) f.focus();
  cal.scrollIntoView({block:'nearest'});
}
export function calSet(w,isoVal){
  $('input',w).value=isoToBr(isoVal);
  const e=$('#f-err');if(e) e.textContent='';
  calClose(w,true);
}
