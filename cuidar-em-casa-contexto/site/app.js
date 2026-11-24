/* Cuidar em Casa: ponto de entrada. Os modulos de src/ guardam o que nao depende de tela nem de estado (v17). */
import {SHORT,LONG,LIM} from './src/core/limits.js';
import {pad,iso,fromIso,addDays,startOfWeek,WD,WDL,MON,nowKey,age,isoToBr,brToIso} from './src/core/dates.js';
import {esc,norm,initials,hashN,cleanName,pl} from './src/core/text.js';
import {BRL,parseMoney} from './src/core/money.js';
import {uid,hashUuid} from './src/core/ids.js';
import {okDate,normalize} from './src/domain/validation.js';
import * as Q from './src/domain/queries.js';
import * as Rec from './src/domain/recurrence.js';
import * as Bill from './src/domain/billing.js';
import {dbId as rowDbId,tipoKey,desiredRows,profRow,rowsToRaw} from './src/data/rows.js';
import {emptySnap,snapshotOf,pushAll as syncPush} from './src/data/sync.js';
/* ---------- utilidades ---------- */
const $=(s,r)=>(r||document).querySelector(s);
const ic=n=>'<svg class="i" aria-hidden="true"><use href="#i-'+n+'"/></svg>';
const TIPOS_EMPRESA=['Operadora de saúde','Clínica','Hospital','Empresa de home care','Particular ou outro'];
const TIPOS_ATEND=['Consulta','Curativo','Aplicação de medicação','Fisioterapia','Coleta de exame','Avaliação'];

function weekLabel(){
  const a=fromIso(ui.weekStart),b=addDays(a,6);
  if(a.getMonth()===b.getMonth()) return a.getDate()+' a '+b.getDate()+' de '+MON[b.getMonth()];
  return a.getDate()+' de '+MON[a.getMonth()].slice(0,3)+'. a '+b.getDate()+' de '+MON[b.getMonth()].slice(0,3)+'.';
}
const dayTitle=d=>WDL[d.getDay()]+', '+d.getDate()+' de '+MON[d.getMonth()];

function dateField(id,name,value,opt){
  opt=opt||{};
  return '<div class="datef"><div class="datef-row"><input id="'+id+'" name="'+name+'" type="text" data-kind="date" inputmode="numeric" autocomplete="off" placeholder="dd/mm/aaaa" maxlength="10" value="'+esc(isoToBr(value))+'">'+
    '<button type="button" class="datef-btn" data-action="open-cal" aria-label="Abrir calendário" aria-expanded="false" aria-controls="cal-'+id+'">'+ic('down')+'</button></div>'+
    '<div class="cal" id="cal-'+id+'" role="group" aria-label="Escolher data" hidden>'+
    '<div class="cal-head"><button type="button" class="icon-btn sm" data-action="cal-nav" data-dir="-1" aria-label="Mês anterior">'+ic('left')+'</button><span class="cal-title" aria-live="polite"></span><button type="button" class="icon-btn sm" data-action="cal-nav" data-dir="1" aria-label="Próximo mês">'+ic('right')+'</button></div>'+
    '<div class="cal-grid"></div>'+
    '<div class="cal-foot"><button type="button" class="btn small ghost" data-action="cal-today">Hoje</button>'+(opt.clear?'<button type="button" class="btn small ghost" data-action="cal-clear">Limpar</button>':'')+'</div></div></div>';
}
function maskDate(el){
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
function parseTime(t){
  const m=/^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if(!m) return null;
  const h=+m[1],mi=+m[2];
  if(h>23||mi>59) return null;
  return pad(h)+':'+pad(mi);
}
function timeField(id,name,value){
  const items=n=>Array.from({length:n},(_,i)=>'<div class="wi" role="option" aria-selected="false" data-action="wheel-pick">'+pad(i)+'</div>').join('');
  const wheel=(label,n)=>'<div class="wheel" role="listbox" tabindex="0" aria-label="'+label+'"><div class="wsp" aria-hidden="true"></div>'+items(n)+'<div class="wsp" aria-hidden="true"></div></div>';
  return '<div class="datef"><div class="datef-row"><input id="'+id+'" name="'+name+'" type="text" data-kind="time" inputmode="numeric" autocomplete="off" placeholder="hh:mm" maxlength="5" value="'+esc(value||'')+'">'+
    '<button type="button" class="datef-btn" data-action="open-time" aria-label="Abrir seletor de horário" aria-expanded="false" aria-controls="tp-'+id+'">'+ic('down')+'</button></div>'+
    '<div class="cal" id="tp-'+id+'" role="group" aria-label="Escolher horário" hidden><div class="wheels"><div class="wheel-band" aria-hidden="true"></div>'+wheel('Horas',24)+'<span class="wheel-sep" aria-hidden="true">:</span>'+wheel('Minutos',60)+'</div>'+
    '<div class="cal-foot"><button type="button" class="btn small ghost" data-action="time-done">Concluir</button></div></div></div>';
}
function maskTime(el){
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
const wheelIdx=wh=>Math.max(0,Math.min(wh.querySelectorAll('.wi').length-1,Math.round(wh.scrollTop/WH)));
function wheelMark(wh){
  const i=wheelIdx(wh);
  wh.querySelectorAll('.wi').forEach(function(e,k){
    const on=k===i;
    if(e.classList.contains('sel')!==on){e.classList.toggle('sel',on);e.setAttribute('aria-selected',on?'true':'false');}
  });
}
function wheelGo(wh,i,instant){
  const n=wh.querySelectorAll('.wi').length;
  wh.scrollTo({top:Math.max(0,Math.min(n-1,i))*WH,behavior:instant?'auto':'smooth'});
}
function timeApply(w){
  const ws=w.querySelectorAll('.wheel');
  $('input',w).value=pad(wheelIdx(ws[0]))+':'+pad(wheelIdx(ws[1]));
  const e=$('#f-err');if(e) e.textContent='';
}
function timeSync(w){
  const t=parseTime($('input',w).value)||'09:00';
  const ws=w.querySelectorAll('.wheel');
  [+t.slice(0,2),+t.slice(3)].forEach(function(v,k){
    const wh=ws[k];
    wh.dataset.lock='1';wh.scrollTop=v*WH;wheelMark(wh);
    setTimeout(function(){delete wh.dataset.lock;},250);
  });
}
function timeOpen(w){
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
function calRender(w){
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
function calClose(w,focusBtn){
  const cal=$('.cal',w),b=$('.datef-btn',w);
  cal.hidden=true;b.setAttribute('aria-expanded','false');
  if(focusBtn) b.focus();
}
function calOpen(w){
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
function calSet(w,isoVal){
  $('input',w).value=isoToBr(isoVal);
  const e=$('#f-err');if(e) e.textContent='';
  calClose(w,true);
}

/* ---------- estado e armazenamento ---------- */
const HIDE_KEY='cuidar-em-casa:ocultar-valores';
const SB_URL='https://ynbqblvdtgwabczbssfp.supabase.co', SB_KEY='sb_publishable_Tuay0Raxi1UIqQLi1pNrcA_hqdThXOV', SB_SES='cuidar-em-casa:sb';
let S=null, hide=false, saveTimer=null, retryTimer=null, retryN=0, failToast=false, writing=false, dirty=false, dbMode='conta', lastLoad=0;
const ui={tab:'agenda',weekStart:iso(startOfWeek(new Date())),day:iso(new Date()),q:'',fcomp:'all'};
const auth={conta:null,logged:false,mode:'',msg:'',email:''};
function readSess(k){try{return sessionStorage.getItem(k);}catch(e){return null;}}
function writeSess(k,v){try{sessionStorage.setItem(k,v);}catch(e){}}
function delLocal(k){try{localStorage.removeItem(k);}catch(e){}}
function delSess(k){try{sessionStorage.removeItem(k);}catch(e){}}
function readLocal(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function writeLocal(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function makeDemo(){
  const comps=[
    {id:'ex-c1',nome:'Vida Plena Saúde',tipo:'Operadora de saúde',contato:'Marcos, (00) 3000-0101',valorPadrao:180,pagamento:'Pagamento até o dia 10',obs:'',cor:0,ex:true},
    {id:'ex-c2',nome:'Clínica Aurora',tipo:'Clínica',contato:'Dra. Paula, (00) 3000-0202',valorPadrao:150,pagamento:'Pagamento quinzenal',obs:'',cor:1,ex:true},
    {id:'ex-c3',nome:'Cuidar+ Home Care',tipo:'Empresa de home care',contato:'Renata, (00) 3000-0303',valorPadrao:220,pagamento:'Pagamento no dia 5 do mês seguinte',obs:'Enviar relatório mensal por e-mail.',cor:2,ex:true}
  ];
  const pats=[
    {id:'ex-p1',nome:'Helena Prado',nasc:'1944-03-12',tel:'(00) 90000-0101',respNome:'Rita (filha)',respTel:'(00) 90000-0102',endereco:'Rua das Acácias, 128',bairro:'Bela Vista',ref:'Portão azul. O interfone não funciona, ligar ao chegar.',empresaId:'ex-c1',valor:180,condicoes:'Hipertensão e diabetes tipo 2. Úlcera venosa na perna esquerda.',alergias:'Dipirona',medicamentos:'Losartana 50 mg, metformina 850 mg',obs:'Rita acompanha às terças. Trocar o curativo e medir a glicemia.',ex:true},
    {id:'ex-p2',nome:'Antônio Ribeiro',nasc:'1950-08-02',tel:'(00) 90000-0201',respNome:'Marta (esposa)',respTel:'(00) 90000-0202',endereco:'Av. Primavera, 540, apto 32',bairro:'Centro',ref:'Prédio sem elevador, 3º andar.',empresaId:'ex-c1',valor:150,condicoes:'Pós-AVC com fraqueza do lado direito.',alergias:'',medicamentos:'AAS 100 mg, sinvastatina 20 mg',obs:'Prefere atendimento depois do almoço.',ex:true},
    {id:'ex-p3',nome:'Maria das Graças Lima',nasc:'1957-01-20',tel:'(00) 90000-0301',respNome:'',respTel:'',endereco:'Rua dos Ipês, 77',bairro:'Jardim das Flores',ref:'Casa de esquina, muro branco.',empresaId:'ex-c2',valor:150,condicoes:'Artrose de joelho. Em reabilitação.',alergias:'Látex',medicamentos:'Paracetamol se houver dor',obs:'Usar luvas sem látex.',ex:true},
    {id:'ex-p4',nome:'Carlos Eduardo Nunes',nasc:'1972-05-30',tel:'(00) 90000-0401',respNome:'Fernanda (esposa)',respTel:'(00) 90000-0402',endereco:'Rua do Sol, 903',bairro:'Parque Real',ref:'Cachorro no quintal, bater palmas.',empresaId:'ex-c3',valor:220,condicoes:'Pós-operatório de hérnia, ferida em cicatrização.',alergias:'',medicamentos:'Cefalexina até o dia 20',obs:'Fotografar a ferida a cada visita.',ex:true},
    {id:'ex-p5',nome:'Josefa Barbosa',nasc:'1938-09-14',tel:'',respNome:'Joana (cuidadora)',respTel:'(00) 90000-0502',endereco:'Travessa Bom Jesus, 15',bairro:'Vila Nova',ref:'Casa de fundos, entrada pelo corredor.',empresaId:'ex-c3',valor:200,condicoes:'Insuficiência cardíaca. Acamada.',alergias:'Penicilina',medicamentos:'Furosemida 40 mg, carvedilol 6,25 mg',obs:'Medir pressão e peso. Avisar a família se houver inchaço.',ex:true}
  ];
  const ws0=startOfWeek(new Date());
  const recs={'ex-p1':{dias:[1,3,5],hora:'08:30',tipo:'Curativo'},'ex-p3':{dias:[2,4],hora:'11:00',tipo:'Fisioterapia'},'ex-p5':{dias:[1,3,5],hora:'10:00',tipo:'Avaliação e sinais vitais'}};
  pats.forEach(function(p){const r=recs[p.id];if(r) p.rec={ativo:true,dias:r.dias,hora:r.hora,tipo:r.tipo,inicio:iso(ws0),fim:''};});
  const tipos={'ex-p1':'Curativo','ex-p2':'Aplicação de medicação','ex-p3':'Fisioterapia','ex-p4':'Curativo pós-cirúrgico','ex-p5':'Avaliação e sinais vitais'};
  const plan=[[0,2,'15:30'],[1,4,'14:00'],[2,2,'09:00'],[2,4,'15:00'],[3,2,'14:30'],[4,4,'09:30'],[5,2,'10:30']];
  const ws=startOfWeek(new Date()),key=nowKey(),visits=[];
  let n=0;
  [0,7].forEach(function(w){
    plan.forEach(function(p){
      const date=iso(addDays(ws,w+p[0])),pid='ex-p'+p[1];
      visits.push({id:'ex-v'+(++n),pacienteId:pid,date:date,hora:p[2],tipo:tipos[pid],obs:'',status:(date+' '+p[2])<key?'feito':'agendado',ex:true});
    });
  });
  return {patients:pats,companies:comps,visits:visits,rev:0,tipos:Array.from(new Set(TIPOS_ATEND.concat(Object.keys(tipos).map(k=>tipos[k]),Object.keys(recs).map(k=>recs[k].tipo)))),persisted:false};
}
function initState(){
  hide=readLocal(HIDE_KEY)==='1';
  S=makeDemo();
}
const pending=()=>!!(saveTimer||writing||dirty);
function setMode(m){
  dbMode=m;
  const f=$('#foot');if(f) f.textContent=statusText();
}
function statusText(){
  if(!S||!S.persisted) return 'Dados de exemplo. Nada foi salvo ainda.';
  if(dbMode==='salvando') return 'Salvando…';
  if(dbMode==='erro') return 'Não foi possível salvar agora. Tentando de novo…';
  if(dbMode==='recusado') return 'O servidor recusou salvar um dado. Revise o último campo editado.';
  return 'Dados privados, salvos na sua conta.';
}

/* ---------- conexão com o Supabase ----------
   Cliente próprio, só com fetch: nenhum código de terceiros roda nesta página.
   A chave abaixo é a chave PÚBLICA do projeto. Quem protege os dados é o banco (RLS):
   cada linha só pode ser lida e alterada pelo usuário dono dela. */
let ses=null, refreshing=null;
const nowSec=()=>Math.floor(Date.now()/1000);
function readSes(){
  const list=[[sessionStorage,false],[localStorage,true]];
  for(let i=0;i<list.length;i++){
    try{
      const o=JSON.parse(list[i][0].getItem(SB_SES)||'null');
      if(o&&typeof o.access_token==='string'&&typeof o.refresh_token==='string'&&o.user&&typeof o.user.id==='string'){o.persist=list[i][1];return o;}
    }catch(e){}
  }
  return null;
}
function storeSes(d,persist){
  const u=d.user||(ses?{id:ses.user.id,email:ses.user.email,user_metadata:{nome:ses.user.nome}}:null);
  if(!u||typeof d.access_token!=='string') throw {code:'bad_session'};
  const md=(u.user_metadata&&typeof u.user_metadata==='object')?u.user_metadata:{};
  ses={access_token:d.access_token,refresh_token:String(d.refresh_token||''),expires_at:Number(d.expires_at)||(nowSec()+(Number(d.expires_in)||3600)),
    user:{id:String(u.id||''),email:String(u.email||'').slice(0,200),nome:typeof md.nome==='string'?md.nome.slice(0,80):''},persist:!!persist};
  try{
    (persist?localStorage:sessionStorage).setItem(SB_SES,JSON.stringify(ses));
    (persist?sessionStorage:localStorage).removeItem(SB_SES);
  }catch(e){}
}
function clearSes(){
  ses=null;
  try{sessionStorage.removeItem(SB_SES);}catch(e){}
  try{localStorage.removeItem(SB_SES);}catch(e){}
}
async function api(path,o){
  o=o||{};
  const useAuth=o.auth!==false;
  if(useAuth){
    if(!ses) throw {code:'expired'};
    if(ses.expires_at-nowSec()<60) await refreshSes();
  }
  const h={apikey:SB_KEY};
  if(o.body!==undefined) h['Content-Type']='application/json';
  if(useAuth) h.Authorization='Bearer '+ses.access_token;
  if(o.prefer) h.Prefer=o.prefer;
  let r,t;
  try{
    r=await fetch(SB_URL+path,{method:o.method||'GET',headers:h,body:o.body===undefined?undefined:JSON.stringify(o.body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    t=await r.text();
  }catch(e){throw {code:'network'};}
  let d=null;
  if(t){try{d=JSON.parse(t);}catch(e){}}
  if(r.status===401&&useAuth&&!o.again){
    await refreshSes();
    return api(path,Object.assign({},o,{again:true}));
  }
  if(!r.ok) throw {code:'http',status:r.status,data:d};
  return d;
}
function refreshSes(){
  if(!ses) return Promise.reject({code:'expired'});
  if(refreshing) return refreshing;
  refreshing=(async function(){
    try{
      const d=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:ses.refresh_token}});
      storeSes(d,ses.persist);
    }catch(e){
      if(e&&e.code==='http'&&(e.status===400||e.status===401||e.status===403)){clearSes();throw {code:'expired'};}
      throw e;
    }finally{refreshing=null;}
  })();
  return refreshing;
}
const SB_ERR={
  invalid_credentials:'E-mail ou senha incorretos.',
  email_not_confirmed:'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  weak_password:'Essa senha é fraca demais. Use uma senha mais longa e menos comum.',
  over_request_rate_limit:'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  over_email_send_rate_limit:'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  signup_disabled:'Novos cadastros estão desativados.',
  same_password:'A nova senha precisa ser diferente da atual.',
  user_banned:'Esta conta está bloqueada.'
};
function errMsg(e,fallback){
  if(e&&e.code==='network') return 'Sem conexão com a internet. Verifique a rede e tente de novo.';
  if(e&&e.code==='http'){
    const d=(e.data&&typeof e.data==='object')?e.data:{};
    let c=typeof d.error_code==='string'?d.error_code:'';
    if(!c&&/invalid login credentials/i.test(String(d.error_description||d.msg||''))) c='invalid_credentials';
    if(SB_ERR[c]) return SB_ERR[c];
    if(e.status===429) return SB_ERR.over_request_rate_limit;
    if(e.status>=500) return 'O servidor está indisponível no momento. Tente de novo em instantes.';
  }
  return fallback;
}
async function sbSignIn(email,pw,persist){
  const d=await api('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:email,password:pw}});
  storeSes(d,persist);
}
async function sbSignUp(nome,email,pw,persist){
  const d=await api('/auth/v1/signup',{method:'POST',auth:false,body:{email:email,password:pw,data:{nome:nome}}});
  if(d&&typeof d.access_token==='string'){storeSes(d,persist);return true;}
  return false;
}
function readHashSession(){
  const h=location.hash.replace(/^#/,'');
  if(!h) return null;
  const p=new URLSearchParams(h);
  if(!p.has('access_token')&&!p.has('error')) return null;
  try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
  if(p.has('error')) return {error:String(p.get('error_description')||p.get('error')).slice(0,200)};
  return {access_token:p.get('access_token'),refresh_token:p.get('refresh_token')||'',expires_in:p.get('expires_in'),expires_at:p.get('expires_at'),type:p.get('type')};
}

/* Mapeamento estado <-> linhas e envio ficam em src/data/ (v17). Aqui só ligam ao estado da tela (S), à sessão (ses) e à rede (api). */
function dbId(id){return rowDbId(ses.user.id,id);}
function takeSnap(){snap=snapshotOf(desiredRows(S,ses.user.id,tipoIds),profRow(S.perfil));}
function pushAll(){return syncPush(api,ses.user.id,S,snap,tipoIds);}
let snap=emptySnap(), tipoIds=new Map();
async function fetchAll(table,cols,order){
  let out=[],from=0;const page=1000;
  for(;;){
    const rows=await api('/rest/v1/'+table+'?select='+cols+'&order='+order+'&limit='+page+'&offset='+from);
    if(!Array.isArray(rows)) throw {code:'bad_data'};
    out=out.concat(rows);
    if(rows.length<page||out.length>=200000) break;
    from+=page;
  }
  return out;
}
async function loadAll(){
  const r=await Promise.all([
    api('/rest/v1/profiles?select=nome,tel,profissao,registro,cidade,iniciado&limit=1'),
    fetchAll('companies','id,nome,tipo,contato,valor_padrao,pagamento,obs,cor','id'),
    fetchAll('patients','id,company_id,nome,nasc,tel,resp_nome,resp_tel,endereco,bairro,ref,valor,condicoes,alergias,medicamentos,obs','id'),
    fetchAll('visits','id,patient_id,data,hora,tipo,obs,status,serie_data,manual','data,id'),
    fetchAll('recurrences','patient_id,ativo,dias,hora,tipo,inicio,fim','patient_id'),
    fetchAll('recurrence_exceptions','patient_id,data','patient_id,data'),
    fetchAll('service_types','id,nome','created_at,id')
  ]);
  const conv=rowsToRaw({profile:r[0],companies:r[1],patients:r[2],visits:r[3],recurrences:r[4],exceptions:r[5],serviceTypes:r[6]});
  const raw=conv.raw,p=conv.p;tipoIds=conv.tipoIds;
  const semDados=!raw.companies.length&&!raw.patients.length&&!raw.visits.length;
  snap=emptySnap();
  if(semDados&&!(p&&p.iniciado)){
    S=makeDemo();S.perfil={nome:'',tel:'',profissao:'',registro:'',cidade:''};
  }else{
    S=normalize(raw);
    takeSnap();
  }
  if(!S.perfil.nome) S.perfil.nome=cleanName(ses.user.nome)||ses.user.email.split('@')[0];
  auth.conta={nome:S.perfil.nome,email:ses.user.email};
  lastLoad=Date.now();
}
function commit(){
  S.persisted=true;S.rev=(S.rev||0)+1;
  setMode('salvando');
  scheduleSave();
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(flush,400);}
async function flush(){
  saveTimer=null;
  if(!auth.logged||!S||!S.persisted||!ses) return;
  if(writing){dirty=true;return;}
  writing=true;
  try{
    do{dirty=false;await pushAll();}while(dirty);
    retryN=0;failToast=false;clearTimeout(retryTimer);
    setMode('conta');
  }catch(e){
    if(e&&e.code==='expired'){writing=false;sair('Sua sessão expirou. Entre de novo. As últimas alterações podem não ter sido salvas.',true);return;}
    const permanente=e&&e.code==='http'&&e.status>=400&&e.status<500&&e.status!==408&&e.status!==429;
    if(permanente){
      setMode('recusado');
      toast('O servidor recusou salvar. Revise o último dado editado.');
    }else{
      setMode('erro');
      if(!failToast){failToast=true;toast('Não foi possível salvar. Vamos tentar de novo.');}
      clearTimeout(retryTimer);
      retryTimer=setTimeout(scheduleSave,Math.min(30000,2000*Math.pow(2,retryN++)));
    }
  }
  writing=false;
}
async function esperaGravar(){
  for(let i=0;i<50&&writing;i++) await new Promise(function(r){setTimeout(r,100);});
  if(saveTimer){clearTimeout(saveTimer);await flush();}
}
async function refreshData(){
  try{await loadAll();renderAll();}
  catch(e){if(e&&e.code==='expired') sair('Sua sessão expirou. Entre de novo.',true);}
}
document.addEventListener('visibilitychange',function(){
  if(!auth.logged) return;
  if(document.visibilityState==='hidden'){if(saveTimer){clearTimeout(saveTimer);flush();}return;}
  if(Date.now()-lastLoad>30000&&!pending()&&!$('#sheet-root').firstChild) refreshData();
});
window.addEventListener('online',function(){if(auth.logged&&dbMode==='erro') scheduleSave();});
window.addEventListener('beforeunload',function(e){if(auth.logged&&pending()){e.preventDefault();e.returnValue='';}});

/* Quem não escolheu "manter conectado" sai sozinho depois de 15 minutos sem uso. */
let idleT=null;const IDLE_MS=15*60*1000;
function bumpIdle(){
  clearTimeout(idleT);
  if(!auth.logged||!ses||ses.persist) return;
  idleT=setTimeout(function(){
    if(pending()){bumpIdle();return;}
    sair('Você saiu por inatividade. Entre de novo para continuar.');
  },IDLE_MS);
}
['pointerdown','keydown','touchstart','scroll'].forEach(function(ev){document.addEventListener(ev,bumpIdle,{passive:true,capture:true});});

function dlFile(name,text,mime){
  const b=new Blob([text],{type:mime+';charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');
  a.href=u;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();
  setTimeout(function(){a.remove();URL.revokeObjectURL(u);},2000);
}

/* ---------- backup: baixar e restaurar ----------
   Arquivo JSON {app,versao,exportadoEm,perfil,tipos,empresas,pacientes,atendimentos}.
   Dados de exemplo (ex:true) nunca entram no arquivo nem voltam dele.
   Restaurar só ACRESCENTA: o que já existe (mesmo id) fica como está; nada é apagado nem sobrescrito.
   Regras de BACKEND.md seção 10: paciente de empresa que não está no arquivo vira particular;
   atendimento sem paciente é descartado. Tudo é contado e mostrado antes de confirmar. */
const BKP_MAX=5*1024*1024;
let pendingImport=null;
function backupObject(){
  const real=x=>!x.ex;
  return {app:'cuidar-em-casa',versao:1,exportadoEm:new Date().toISOString(),perfil:S.perfil,tipos:S.tipos||null,
    empresas:S.companies.filter(real),pacientes:S.patients.filter(real),atendimentos:S.visits.filter(real)};
}
/* Ids do arquivo -> ids desta conta. A chave primária do banco é o id sozinho: importar o id de OUTRA conta
   bateria numa linha que não é sua e travaria a gravação. Então cada item do arquivo ganha um uuid calculado
   do id original e do usuário: sempre o mesmo para a mesma conta (importar duas vezes não duplica) e diferente
   entre contas. O que já existe aqui, com o id original ou com o calculado, é reconhecido e mantido. */
const bkpUuid=id=>hashUuid(ses.user.id+'|bkp|'+id);
const wasThere=(have,id)=>have.has(id)||have.has(dbId(id))||have.has(bkpUuid(id));
function mapId(have,id){if(have.has(id)) return id;const d=dbId(id);return have.has(d)?d:bkpUuid(id);}
function planImport(o){
  if(!o||typeof o!=='object'||Array.isArray(o)||o.app!=='cuidar-em-casa') return {erro:'Este arquivo não é um backup do Cuidar em Casa.'};
  if(o.versao!==1) return {erro:'Este backup é de uma versão que o app não conhece.'};
  if(!ses||!ses.user) return {erro:'Entre na sua conta para restaurar um backup.'};
  const n=normalize({companies:o.empresas,patients:o.pacientes,visits:o.atendimentos,tipos:o.tipos});
  const realIds=l=>new Set(l.filter(x=>!x.ex).map(x=>x.id));
  const haveC=realIds(S.companies),haveP=realIds(S.patients),haveV=realIds(S.visits);
  const fileC=n.companies.filter(x=>!x.ex),fileP=n.patients.filter(x=>!x.ex),fileV=n.visits.filter(x=>!x.ex);
  const inC=new Set(fileC.map(x=>x.id)),inP=new Set(fileP.map(x=>x.id));
  const r={companies:[],patients:[],visits:[],tipoNovos:[],jaTinha:0,semEmpresa:0,semPaciente:0,
    data:okDate(String(o.exportadoEm||'').slice(0,10))?String(o.exportadoEm).slice(0,10):''};
  fileC.forEach(function(c){
    if(wasThere(haveC,c.id)){r.jaTinha++;return;}
    c.id=mapId(haveC,c.id);r.companies.push(c);
  });
  fileP.forEach(function(p){
    if(wasThere(haveP,p.id)){r.jaTinha++;return;}
    p.id=mapId(haveP,p.id);
    if(p.empresaId){
      if(inC.has(p.empresaId)||wasThere(haveC,p.empresaId)) p.empresaId=mapId(haveC,p.empresaId);
      else{p.empresaId='';r.semEmpresa++;}
    }
    r.patients.push(p);
  });
  fileV.forEach(function(v){
    if(wasThere(haveV,v.id)){r.jaTinha++;return;}
    if(!(inP.has(v.pacienteId)||wasThere(haveP,v.pacienteId))){r.semPaciente++;return;}
    v.id=mapId(haveV,v.id);v.pacienteId=mapId(haveP,v.pacienteId);
    if(v.serie) v.serie=mapId(haveP,v.serie);
    r.visits.push(v);
  });
  if(Array.isArray(n.tipos)){
    const have=new Set(tiposList().map(tipoKey));
    n.tipos.forEach(function(t){if(!have.has(tipoKey(t))){have.add(tipoKey(t));r.tipoNovos.push(t);}});
  }
  r.nada=!r.companies.length&&!r.patients.length&&!r.visits.length&&!r.tipoNovos.length;
  return r;
}
function openImport(p){
  pendingImport=p.nada?null:p;
  let b;
  if(p.nada) b='<p>Nada novo neste arquivo: tudo o que ele tem já está no app.</p>'+(p.semPaciente?'<p class="hint">'+pl(p.semPaciente,'atendimento foi ignorado porque o paciente dele não está no arquivo.','atendimentos foram ignorados porque o paciente deles não está no arquivo.')+'</p>':'')+
    '<div class="sheet-actions"><button type="button" class="btn primary" data-action="close-sheet">Fechar</button></div>';
  else{
    let li='<li>Serão adicionados: <strong>'+pl(p.companies.length,'empresa','empresas')+'</strong>, <strong>'+pl(p.patients.length,'paciente','pacientes')+'</strong> e <strong>'+pl(p.visits.length,'atendimento','atendimentos')+'</strong>.</li>';
    if(p.tipoNovos.length) li+='<li>'+pl(p.tipoNovos.length,'tipo de atendimento novo.','tipos de atendimento novos.')+'</li>';
    if(p.jaTinha) li+='<li>'+pl(p.jaTinha,'item já existe no app e fica como está.','itens já existem no app e ficam como estão.')+'</li>';
    if(p.semEmpresa) li+='<li>'+pl(p.semEmpresa,'paciente estava ligado a uma empresa que não está no arquivo e entra como particular.','pacientes estavam ligados a uma empresa que não está no arquivo e entram como particulares.')+'</li>';
    if(p.semPaciente) li+='<li>'+pl(p.semPaciente,'atendimento será descartado porque o paciente dele não está no arquivo.','atendimentos serão descartados porque o paciente deles não está no arquivo.')+'</li>';
    if(hasExamples()) li+='<li>Os dados de exemplo serão apagados.</li>';
    b=(p.data?'<p>Backup de '+esc(isoToBr(p.data))+'.</p>':'')+'<ul class="imp-sum">'+li+'</ul><p class="hint">Seus dados atuais não são alterados nem apagados.</p>'+
      '<div class="sheet-actions"><button type="button" class="btn primary" data-action="import-confirm">Restaurar</button><button type="button" class="btn ghost" data-action="close-sheet">Cancelar</button></div>';
  }
  openSheet('Restaurar backup',b);
}
function applyImport(){
  const p=pendingImport;pendingImport=null;
  if(!p) return;
  S.patients=S.patients.filter(x=>!x.ex).concat(p.patients);
  S.companies=S.companies.filter(x=>!x.ex).concat(p.companies);
  S.visits=S.visits.filter(x=>!x.ex).concat(p.visits);
  if(p.tipoNovos.length){ensureTipos();S.tipos=S.tipos.concat(p.tipoNovos).slice(0,200);}
  if(ui.fcomp!=='all'&&ui.fcomp!=='none'&&!findCompany(ui.fcomp)) ui.fcomp='all';
  commit();closeSheet();renderAll();
  toast('Backup restaurado: '+pl(p.patients.length,'paciente','pacientes')+' e '+pl(p.visits.length,'atendimento','atendimentos')+'.');
}
function readBackupFile(file){
  if(!file) return;
  if(file.size>BKP_MAX){toast('Arquivo grande demais para ser um backup.');return;}
  file.text().then(function(txt){
    let o;try{o=JSON.parse(txt);}catch(e){toast('Não foi possível ler este arquivo.');return;}
    const p=planImport(o);
    if(p.erro){toast(p.erro);return;}
    openImport(p);
  },function(){toast('Não foi possível ler este arquivo.');});
}

/* ---------- relatório de faturamento ----------
   Valor de cada atendimento = valor cadastrado no paciente. Feito = realizado. Agendado = previsto.
   Cancelados não entram. Atendimentos recorrentes ainda não registrados contam como agendados. */
let dlRef={save:function(o){dlFile(o.filename,o.data,'text/csv');return Promise.resolve();}};
const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);
function repInit(o){
  const n=new Date(),r=monthRange(n.getFullYear(),n.getMonth());
  ui.rep={by:o.by==='empresa'?'empresa':'paciente',emp:o.emp||'all',pac:o.pac||'all',mode:'mes',y:r.y,m:r.m,from:r.from,to:r.to};
}
function repSetMonth(y,m){const r=monthRange(y,m);ui.rep.y=r.y;ui.rep.m=r.m;ui.rep.from=r.from;ui.rep.to=r.to;}
function openReport(){
  openSheet('Faturamento','<div id="rep-root"></div>');
  repRender();
}
function repRender(focusId){
  const root=$('#rep-root');if(!root) return;
  const sc=root.closest('.sheet-body'),y=sc?sc.scrollTop:0;
  const r=ui.rep,d=repData();
  const seg=(items,cur,action,key,label)=>'<div class="seg" role="group" aria-label="'+label+'">'+items.map(i=>'<button type="button" data-action="'+action+'" data-'+key+'="'+i[0]+'" aria-pressed="'+(cur===i[0])+'">'+i[1]+'</button>').join('')+'</div>';
  let h=seg([['mes','Por mês'],['custom','Outro período']],r.mode,'rep-mode','mode','Tipo de período');
  if(r.mode==='mes'){
    h+='<div class="monthnav"><button type="button" class="icon-btn sm" data-action="rep-month" data-dir="-1" aria-label="Mês anterior">'+ic('left')+'</button><span class="mn-t" aria-live="polite">'+cap(MON[r.m])+' de '+r.y+'</span><button type="button" class="icon-btn sm" data-action="rep-month" data-dir="1" aria-label="Próximo mês">'+ic('right')+'</button></div>';
  }else{
    h+='<div class="rep-custom"><label for="r-de">De</label>'+dateField('r-de','de',r.from)+'<label for="r-ate">Até</label>'+dateField('r-ate','ate',r.to)+'<button type="button" class="btn small" data-action="rep-apply">Aplicar período</button><p class="err" id="r-err" role="alert"></p></div>';
  }
  h+='<div class="rep-tiles"><div class="tile real"><span class="tl">Realizado</span><strong class="tv">'+money(d.tot.real)+'</strong><span class="ts">'+pl(d.tot.feitos,'atendimento feito','atendimentos feitos')+'</span></div>'+
     '<div class="tile prev"><span class="tl">Previsto</span><strong class="tv">'+money(d.tot.prev)+'</strong><span class="ts">'+pl(d.tot.ag,'agendado','agendados')+'</span></div></div>';
  h+=seg([['paciente','Por paciente'],['empresa','Por empresa']],r.by,'rep-by','by','Agrupar por');
  const emps='<option value="all"'+(r.emp==='all'?' selected':'')+'>Todas</option><option value="none"'+(r.emp==='none'?' selected':'')+'>Particulares</option>'+S.companies.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=>'<option value="'+esc(c.id)+'"'+(r.emp===c.id?' selected':'')+'>'+esc(c.nome)+'</option>').join('');
  const pacs='<option value="all">Todos</option>'+S.patients.filter(function(p){return r.emp==='all'||(r.emp==='none'?noCompany(p):p.empresaId===r.emp);}).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(p=>'<option value="'+esc(p.id)+'"'+(r.pac===p.id?' selected':'')+'>'+esc(p.nome)+'</option>').join('');
  h+='<div class="rep-filters"><div><label for="r-emp">Empresa</label><select id="r-emp" data-role="rep-emp">'+emps+'</select></div><div><label for="r-pac">Paciente</label><select id="r-pac" data-role="rep-pac">'+pacs+'</select></div></div>';
  if(!d.rows.length){
    h+='<div class="empty"><p>Nenhum atendimento neste período e com estes filtros.</p></div>';
  }else{
    h+='<ul class="group rep-list">'+d.rows.map(function(x){
      const np=Object.keys(x.pacs).length;
      const sub=(r.by==='empresa'?pl(np,'paciente','pacientes'):esc(x.empresa))+' · '+pl(x.feitos,'feito','feitos')+' · '+pl(x.ag,'agendado','agendados');
      return '<li class="rrow"><span class="rr-main"><span class="row-name">'+esc(x.nome)+'</span><span class="row-sub">'+sub+'</span></span><span class="rr-vals"><span class="rr-real">'+money(x.real)+'</span>'+(x.ag?'<span class="rr-prev">+ '+money(x.prev)+' previsto</span>':'')+'</span></li>';
    }).join('')+'<li class="rrow total"><span class="rr-main"><span class="row-name">Total</span><span class="row-sub">'+pl(d.tot.feitos+d.tot.ag,'atendimento','atendimentos')+'</span></span><span class="rr-vals"><span class="rr-real">'+money(d.tot.real+d.tot.prev)+'</span><span class="rr-prev">realizado + previsto</span></span></li></ul>';
  }
  if(d.semValor) h+='<p class="hint">'+pl(d.semValor,'atendimento de paciente sem valor cadastrado não entrou','atendimentos de pacientes sem valor cadastrado não entraram')+' na soma.</p>';
  if(d.pend) h+='<p class="hint">'+pl(d.pend,'atendimento de data passada ainda não foi marcado como feito e está','atendimentos de datas passadas ainda não foram marcados como feitos e estão')+' em Previsto. Marque como feito na agenda para entrar em Realizado.</p>';
  if(hide) h+='<p class="hint">Os valores estão ocultos. O arquivo baixado e o resumo copiado trazem os valores reais.</p><div class="sheet-actions"><button type="button" class="btn" data-action="rep-hide">'+ic('eye')+'Mostrar valores</button></div>';
  h+='<div class="sheet-actions">';
  if(d.rows.length){
    if(dlRef) h+='<button type="button" class="btn primary" data-action="rep-csv">'+ic('download')+'Baixar planilha (CSV)</button>';
    h+='<button type="button" class="btn'+(dlRef?'':' primary')+'" data-action="rep-copy">'+ic('copy')+'Copiar resumo</button>';
  }
  h+='<button type="button" class="btn ghost" data-action="close-sheet">Fechar</button></div>';
  root.innerHTML=h;
  if(sc) sc.scrollTop=y;
  if(focusId){const e=document.getElementById(focusId);if(e) try{e.focus({preventScroll:true});}catch(x){}}
}

/* ---------- conta e acesso ----------
   O login é do Supabase Auth: a senha nunca fica neste aparelho nem neste código. */
const normEmail=v=>String(v||'').trim().toLowerCase();
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)&&v.length<=200;
function setBusy(f,on){const b=f.querySelector('button[type=submit]');if(b){b.disabled=on;if(on){b.dataset.t=b.textContent;b.textContent='Aguarde…';}else if(b.dataset.t) b.textContent=b.dataset.t;}}
const fv=(f,n)=>f.elements[n]?f.elements[n].value:'';
function pwField(id,name,label,auto){
  return '<label for="'+id+'">'+label+'</label><div class="pwf"><input id="'+id+'" name="'+name+'" type="password" autocomplete="'+auto+'" autocapitalize="off" spellcheck="false"><button type="button" data-action="pw-toggle" aria-pressed="false" aria-label="Mostrar '+label.toLowerCase()+'">Mostrar</button></div>';
}
function routeArt(){
  return '<div class="gate-art" aria-hidden="true"><svg viewBox="0 0 320 104" xmlns="http://www.w3.org/2000/svg">'+
    '<path class="rt-line" d="M26 70 C 66 70, 86 30, 132 30 S 204 64, 236 62 S 270 34, 292 34"/>'+
    '<circle class="rt-stop" cx="26" cy="70" r="8"/><circle class="rt-stop" cx="132" cy="30" r="8"/><circle class="rt-stop" cx="236" cy="62" r="8"/>'+
    '<text class="rt-t" x="26" y="96" text-anchor="middle">08:30</text><text class="rt-t" x="132" y="58" text-anchor="middle">10:00</text><text class="rt-t" x="236" y="90" text-anchor="middle">14:30</text>'+
    '<rect x="276" y="18" width="32" height="32" rx="10" fill="var(--accent)"/><use href="#i-home" x="281" y="23" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'+
    '</svg></div>';
}

function renderGate(){
  const g=$('#gate'),m=auth.mode;
  document.body.classList.add('locked');g.hidden=false;
  const msg=auth.msg?'<p class="gate-msg" role="status">'+esc(auth.msg)+'</p>':'';
  let h='<div class="gate-in"><div class="brand"><span class="mark">'+ic('home')+'</span><span class="bn">Cuidar em Casa</span></div>'+routeArt();
  if(m==='wait'){
    h+='<h1 id="gate-h" tabindex="-1">Abrindo o app</h1><div class="wait" role="status"><span class="spin"></span>Carregando seus dados…</div>';
  }else if(m==='erro'){
    h+='<h1 id="gate-h" tabindex="-1">Sem conexão</h1><p class="sub">Não foi possível abrir seus dados agora.</p>'+msg+
      '<div class="sheet-actions"><button type="button" class="btn primary" data-action="auth-retry">Tentar de novo</button><button type="button" class="btn" data-action="logout">Sair</button></div>';
  }else if(m==='confirma'){
    h+='<h1 id="gate-h" tabindex="-1">Confirme seu e-mail</h1><p class="sub">Enviamos um link para <strong>'+esc(auth.email)+'</strong>. Abra o e-mail, toque no link e depois entre aqui. Olhe também a caixa de spam.</p>'+
      '<div class="sheet-actions"><button type="button" class="btn primary" data-action="auth-back">Ir para o login</button></div>';
  }else if(m==='nova'){
    h+='<h1 id="gate-h" tabindex="-1">Nova senha</h1><p class="sub">Crie a nova senha da sua conta.</p>'+
      '<form id="f-nova" class="gate-form" novalidate>'+pwField('a-senha','senha','Nova senha','new-password')+'<p class="hint">Use pelo menos 8 caracteres.</p>'+pwField('a-conf','conf','Repita a nova senha','new-password')+
      '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Salvar nova senha</button></div></form>';
  }else if(m==='criar'){
    h+='<h1 id="gate-h" tabindex="-1">Criar conta</h1><p class="sub">Crie uma conta para guardar os dados dos seus pacientes com segurança.</p>'+
      '<form id="f-criar" class="gate-form" novalidate><label for="a-nome">Seu nome</label><input id="a-nome" name="nome" autocomplete="name" maxlength="80">'+
      '<label for="a-email">E-mail</label><input id="a-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" maxlength="120">'+
      pwField('a-senha','senha','Senha','new-password')+'<p class="hint">Use pelo menos 8 caracteres.</p>'+
      pwField('a-conf','conf','Repita a senha','new-password')+
      '<label class="check" for="a-manter"><input id="a-manter" name="manter" type="checkbox"><span>Manter conectado neste aparelho</span></label>'+
      '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Criar conta</button><button type="button" class="btn" data-action="auth-back">Já tenho conta</button></div></form>'+
      '<p class="fine">Sua senha é protegida pelo serviço de login e nunca aparece em texto.</p>';
  }else if(m==='reset'){
    h+='<h1 id="gate-h" tabindex="-1">Redefinir senha</h1><p class="sub">Informe o e-mail da conta. Enviaremos um link para você criar uma nova senha. Seus pacientes e atendimentos não são apagados.</p>'+
      '<form id="f-reset" class="gate-form" novalidate><label for="a-email">E-mail da conta</label><input id="a-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" maxlength="120">'+
      '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Enviar link</button><button type="button" class="btn" data-action="auth-back">Voltar</button></div></form>';
  }else{
    h+='<h1 id="gate-h" tabindex="-1">Entrar</h1><p class="sub">Entre para ver sua agenda e seus pacientes.</p>'+msg+
      '<form id="f-entrar" class="gate-form" novalidate><label for="a-email">E-mail</label><input id="a-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" maxlength="120">'+
      pwField('a-senha','senha','Senha','current-password')+
      '<label class="check" for="a-manter"><input id="a-manter" name="manter" type="checkbox"><span>Manter conectado neste aparelho</span></label>'+
      '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Entrar</button><button type="button" class="btn" data-action="auth-create">Criar conta</button><button type="button" class="btn ghost" data-action="auth-forgot">Esqueci a senha</button></div></form>';
    auth.msg='';
  }
  g.innerHTML=h+'</div>';
}
function showGate(mode){
  const changed=auth.mode!==mode;
  auth.mode=mode;renderGate();
  if(changed&&mode!=='wait'){const f=$('#gate form');const i=f&&f.querySelector('input');if(i) try{i.focus({preventScroll:true});}catch(e){}}
}

function unlock(){
  auth.logged=true;auth.mode='';
  document.body.classList.remove('locked');
  const g=$('#gate');g.innerHTML='';g.hidden=true;
  renderAll();
  const v=$('#view');if(v) try{v.focus({preventScroll:true});}catch(e){}
}

async function entrarComSessao(){
  showGate('wait');
  try{await loadAll();}
  catch(e){
    if(e&&e.code==='expired'){clearSes();auth.msg='Sua sessão expirou. Entre de novo.';return showGate('entrar');}
    auth.msg=errMsg(e,'Não foi possível carregar seus dados. Tente de novo.');
    return showGate('erro');
  }
  unlock();bumpIdle();
}
async function boot(){
  initState();
  showGate('wait');
  const hs=readHashSession();
  try{
    if(hs&&hs.error){auth.msg='O link não é mais válido. Peça um novo ou entre com sua senha.';}
    else if(hs&&hs.access_token){
      ses={access_token:hs.access_token,refresh_token:hs.refresh_token,expires_at:Number(hs.expires_at)||(nowSec()+(Number(hs.expires_in)||3600)),user:{id:'',email:'',nome:''},persist:false};
      const u=await api('/auth/v1/user');
      storeSes({access_token:ses.access_token,refresh_token:ses.refresh_token,expires_at:ses.expires_at,user:u},false);
      if(hs.type==='recovery'){showGate('nova');return;}
    }else{
      const r=readSes();
      if(r) ses=r;
    }
    if(ses){await entrarComSessao();return;}
  }catch(e){
    if(e&&e.code==='network'){auth.msg=errMsg(e);return showGate('erro');}
    clearSes();
  }
  showGate('entrar');
}
async function sair(msg,semGravar){
  closeSheet(true);
  clearTimeout(idleT);clearTimeout(retryTimer);
  if(!semGravar&&auth.logged&&ses){try{await esperaGravar();}catch(e){}}
  clearTimeout(saveTimer);saveTimer=null;
  if(ses){try{await api('/auth/v1/logout?scope=local',{method:'POST'});}catch(e){}}
  clearSes();
  auth.logged=false;auth.mode='';auth.conta=null;auth.msg=typeof msg==='string'?msg:'';
  S=makeDemo();snap=emptySnap();
  ui.tab='agenda';ui.q='';ui.fcomp='all';
  ['#top','#view','#tabs','#fab'].forEach(function(s){const e=$(s);if(e) e.innerHTML='';});
  showGate('entrar');
}
function senhaRegra(s1,s2){
  if(s1.length<8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if(s1!==s2) return 'As duas senhas não são iguais.';
  return '';
}

async function doEntrar(f){
  const email=normEmail(fv(f,'email')),pw=fv(f,'senha');
  if(!email) return fail(f,'Informe o e-mail da sua conta.','email');
  if(!pw) return fail(f,'Informe a senha.','senha');
  setBusy(f,true);
  try{await sbSignIn(email,pw,!!(f.elements.manter&&f.elements.manter.checked));}
  catch(e){setBusy(f,false);return fail(f,errMsg(e,'Não foi possível entrar. Tente de novo.'),'senha');}
  await entrarComSessao();
}
async function doCriar(f){
  const nome=cleanName(fv(f,'nome')).slice(0,80),email=normEmail(fv(f,'email')),s1=fv(f,'senha'),s2=fv(f,'conf');
  if(!nome) return fail(f,'Informe seu nome.','nome');
  if(!emailOk(email)) return fail(f,'Informe um e-mail válido, como nome@exemplo.com.','email');
  const r=senhaRegra(s1,s2);if(r) return fail(f,r,'senha');
  setBusy(f,true);
  let logou=false;
  try{logou=await sbSignUp(nome,email,s1,!!(f.elements.manter&&f.elements.manter.checked));}
  catch(e){setBusy(f,false);return fail(f,errMsg(e,'Não foi possível criar a conta. Tente de novo.'),'email');}
  if(logou) return entrarComSessao();
  auth.email=email;showGate('confirma');
}
async function doReset(f){
  const email=normEmail(fv(f,'email'));
  if(!emailOk(email)) return fail(f,'Informe um e-mail válido, como nome@exemplo.com.','email');
  setBusy(f,true);
  try{
    await api('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+'/'),{method:'POST',auth:false,body:{email:email}});
  }catch(e){setBusy(f,false);return fail(f,errMsg(e,'Não foi possível enviar o link. Tente de novo.'),'email');}
  auth.msg='Se esse e-mail tiver uma conta, enviamos um link para criar uma nova senha. Olhe também a caixa de spam.';
  showGate('entrar');
}
async function doNova(f){
  const s1=fv(f,'senha'),s2=fv(f,'conf');
  const r=senhaRegra(s1,s2);if(r) return fail(f,r,'senha');
  setBusy(f,true);
  try{await api('/auth/v1/user',{method:'PUT',body:{password:s1}});}
  catch(e){setBusy(f,false);return fail(f,errMsg(e,'Não foi possível salvar a nova senha. Peça um novo link.'),'senha');}
  await entrarComSessao();
  toast('Senha redefinida.');
}
function openMenu(){
  const c=auth.conta,nt=tiposList().length;
  const row=(go,icon,nome,sub)=>'<li><button type="button" class="row" data-action="menu-go" data-go="'+go+'"><span class="mi">'+ic(icon)+'</span><span class="row-main"><span class="row-name">'+nome+'</span><span class="row-sub">'+sub+'</span></span><span class="go">'+ic('right')+'</span></button></li>';
  const b=(c?'<div class="sum"><span class="av c0" aria-hidden="true">'+esc(initials(c.nome))+'</span><div><h3 class="sum-name">'+esc(c.nome)+'</h3><p class="sub sum-sub">'+esc(c.email)+'</p></div></div>':'')+
    '<ul class="group">'+
    row('perfil','user','Perfil','Seus dados pessoais e profissionais')+
    row('config','gear','Configurações','Preferências do app')+
    row('notif','bell','Notificações','Avisos e lembretes')+
    row('atend','list','Atendimentos',nt+(nt===1?' tipo cadastrado':' tipos cadastrados'))+
    '</ul>';
  openSheet('Menu',b);
}
function openProfile(){
  const c=auth.conta||{nome:'',email:''},pf=S.perfil||{};
  const b='<div class="sum"><span class="av lg c0" aria-hidden="true">'+esc(initials(c.nome))+'</span><div><h3 class="sum-name">'+esc(c.nome)+'</h3><p class="sub sum-sub">'+esc(c.email)+'</p></div></div>'+
    '<form id="f-perfil" novalidate>'+
    '<label for="pf-nome">Nome</label><input id="pf-nome" name="nome" autocomplete="name" maxlength="'+LIM.nome+'" value="'+val(c.nome)+'">'+
    '<label for="pf-email">E-mail</label><input id="pf-email" type="email" value="'+val(c.email)+'" readonly aria-describedby="pf-email-h"><p class="hint" id="pf-email-h">É o e-mail que você usa para entrar. Ele não pode ser alterado aqui.</p>'+
    '<label for="pf-tel">Telefone</label><input id="pf-tel" name="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="'+LIM.tel+'" value="'+val(pf.tel)+'">'+
    '<label for="pf-prof">Profissão</label><input id="pf-prof" name="profissao" list="pf-profs" maxlength="'+LIM.profissao+'" placeholder="Ex.: Enfermeira" value="'+val(pf.profissao)+'"><datalist id="pf-profs">'+['Enfermeiro(a)','Técnico(a) de enfermagem','Fisioterapeuta','Médico(a)','Fonoaudiólogo(a)','Nutricionista','Psicólogo(a)','Terapeuta ocupacional','Cuidador(a)'].map(x=>'<option value="'+esc(x)+'"></option>').join('')+'</datalist>'+
    '<label for="pf-reg">Registro profissional</label><input id="pf-reg" name="registro" maxlength="'+LIM.registro+'" placeholder="Ex.: COREN 000000" value="'+val(pf.registro)+'">'+
    '<label for="pf-cid">Cidade ou região de atuação</label><input id="pf-cid" name="cidade" maxlength="'+LIM.cidade+'" value="'+val(pf.cidade)+'">'+
    '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Salvar perfil</button></div></form>'+
    '<div class="sec"><h3>Seus dados</h3><p class="hint">O backup é um arquivo com todos os seus pacientes, empresas e atendimentos (sem os dados de exemplo). Guarde em local seguro: ele não tem senha. Restaurar acrescenta ao que você já tem; nada é apagado nem sobrescrito.</p><div class="sheet-actions"><button type="button" class="btn" data-action="backup">'+ic('download')+'Baixar backup (JSON)</button><button type="button" class="btn" data-action="import-pick">'+ic('upload')+'Restaurar backup (JSON)</button><input type="file" id="imp-file" data-role="import-file" accept="application/json,.json" hidden></div></div>'+
    '<div class="sec"><h3>Segurança</h3><div class="sheet-actions"><button type="button" class="btn" data-action="open-password">'+ic('lock')+'Alterar senha</button><button type="button" class="btn" data-action="logout">'+ic('logout')+'Sair da conta</button></div></div>'+
    '<div class="sheet-actions"><button type="button" class="btn ghost" data-action="open-menu">Voltar ao menu</button></div>';
  openSheet('Perfil',b);
}
function saveProfile(f){
  const nome=cleanName(fv(f,'nome'));
  if(!nome) return fail(f,'Informe seu nome.','nome');
  S.perfil={nome:nome,tel:cleanName(fv(f,'tel')),profissao:cleanName(fv(f,'profissao')),registro:cleanName(fv(f,'registro')),cidade:cleanName(fv(f,'cidade'))};
  if(auth.conta) auth.conta.nome=nome;
  commit();closeSheet(true);lastFocus=null;
  toast('Perfil atualizado.');
}
function openSoon(kind){
  const t=kind==='notif'?{h:'Notificações',s:'Aqui ficarão os avisos e lembretes dos seus atendimentos.'}:{h:'Configurações',s:'Aqui ficarão as preferências do app.'};
  openSheet(t.h,'<div class="soon"><strong>Em breve</strong>'+t.s+' Esta área será liberada em uma próxima versão.</div><div class="sheet-actions"><button type="button" class="btn" data-action="open-menu">Voltar ao menu</button></div>');
}
function openPassword(){
  const b='<form id="f-senha" novalidate>'+pwField('s-atual','atual','Senha atual','current-password')+pwField('s-nova','senha','Nova senha','new-password')+pwField('s-conf','conf','Repita a nova senha','new-password')+
    '<p class="hint">Use pelo menos 8 caracteres.</p><p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Salvar nova senha</button><button type="button" class="btn" data-action="menu-go" data-go="perfil">Voltar ao perfil</button></div></form>';
  openSheet('Alterar senha',b);
}
async function doSenha(f){
  const at=fv(f,'atual'),s1=fv(f,'senha'),s2=fv(f,'conf');
  if(!at) return fail(f,'Informe a senha atual.','atual');
  const r=senhaRegra(s1,s2);if(r) return fail(f,r,'senha');
  setBusy(f,true);
  try{
    try{
      const d=await api('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:ses.user.email,password:at}});
      storeSes(d,ses.persist);
    }catch(e){
      setBusy(f,false);
      return fail(f,(e&&e.code==='http'&&e.status===400)?'A senha atual está incorreta.':errMsg(e,'Não foi possível verificar a senha atual.'),'atual');
    }
    await api('/auth/v1/user',{method:'PUT',body:{password:s1}});
    setBusy(f,false);closeSheet(true);lastFocus=null;toast('Senha alterada.');
  }catch(e){setBusy(f,false);fail(f,errMsg(e,'Não foi possível alterar a senha. Tente de novo.'),'senha');}
}

/* Consultas e regras ficam em src/domain/ (v17). Aqui só ligam ao estado da tela: S (dados) e ui (filtros). */
function findPatient(id){return Q.findPatient(S,id);}
function findCompany(id){return Q.findCompany(S,id);}
function noCompany(p){return Q.noCompany(S,p);}
function visitsBetween(a,b){return Rec.visitsBetween(S,a,b);}
function visitById(id){return Rec.visitById(S,id);}
function resolveVisit(id){return Rec.resolveVisit(S,id);}
function recSig(r){return Rec.recSig(r);}
function closeRecurrence(p){return Rec.closeRecurrence(S,p);}
function recText(p){return Rec.recText(p);}
function monthRange(y,m){return Bill.monthRange(y,m);}
function repData(){return Bill.repData(S,ui.rep);}
function repCsv(){return Bill.repCsv(S,ui.rep);}
function repText(){return Bill.repText(S,ui.rep);}
const hasExamples=()=>S.patients.some(x=>x.ex)||S.companies.some(x=>x.ex)||S.visits.some(x=>x.ex);
function money(v){
  if(hide) return '<span class="money" aria-label="Valor oculto">R$ ••••</span>';
  if(v==null||v==='') return '<span class="money none">Sem valor</span>';
  return '<span class="money">'+esc(BRL.format(Number(v)||0))+'</span>';
}
function chip(compId){
  const c=findCompany(compId);
  return c?'<span class="chip c'+(c.cor%6)+'">'+esc(c.nome)+'</span>':'<span class="chip none">Particular</span>';
}
function avatar(p,cls){
  const c=findCompany(p.empresaId);
  const k=c?c.cor%6:hashN(p.id)%6;
  return '<span class="av c'+k+(cls?' '+cls:'')+'" aria-hidden="true">'+esc(initials(p.nome))+'</span>';
}
const exTag=o=>o&&o.ex?'<span class="ex">exemplo</span>':'';
const mapsUrl=a=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(a);
const repMark=()=>'<span class="rep" role="img" aria-label="Atendimento semanal">'+ic('repeat')+'</span>';
const repIcon=p=>p&&p.rec&&p.rec.ativo?repMark():'';
/* Tipos de atendimento: lista do usuário. Quem ainda não criou a sua lista vê os padrões e os tipos já usados. */
function tiposList(){
  const l=Array.isArray(S.tipos)?S.tipos.slice():Array.from(new Set(TIPOS_ATEND.concat(S.visits.map(x=>x.tipo).filter(Boolean),S.patients.map(p=>p.rec&&p.rec.tipo).filter(Boolean))));
  return l.sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function ensureTipos(){if(!Array.isArray(S.tipos)) S.tipos=tiposList();}
function addTipo(nome){
  nome=cleanName(nome);
  if(!nome) return '';
  const ex=tiposList().find(t=>norm(t)===norm(nome));
  if(ex) return ex;
  ensureTipos();S.tipos.push(nome);commit();
  return nome;
}
function renameTipo(old,nome){
  ensureTipos();
  const i=S.tipos.indexOf(old);
  if(i>-1) S.tipos[i]=nome;else S.tipos.push(nome);
  S.visits.forEach(function(v){if(v.tipo===old) v.tipo=nome;});
  S.patients.forEach(function(p){if(p.rec&&p.rec.tipo===old) p.rec.tipo=nome;});
  commit();
}
function deleteTipo(nome){ensureTipos();S.tipos=S.tipos.filter(t=>t!==nome);commit();}
function tipoUso(t){
  const at=S.visits.filter(v=>v.tipo===t).length,pac=S.patients.filter(p=>p.rec&&p.rec.ativo&&p.rec.tipo===t).length;
  const parts=[];
  if(at) parts.push(at+(at===1?' atendimento':' atendimentos'));
  if(pac) parts.push(pac+(pac===1?' paciente recorrente':' pacientes recorrentes'));
  return parts.length?parts.join(' · '):'Ainda sem uso';
}
function tipoOptions(sel){
  const list=tiposList();
  if(sel&&list.indexOf(sel)<0) list.push(sel);
  return opt('','Sem tipo',!sel)+list.map(t=>opt(t,t,t===sel)).join('')+opt('__novo','+ Criar novo tipo…',false);
}
function tipoField(id,name,value){
  return '<div class="tipof"><select id="'+id+'" name="'+name+'" data-kind="tipo">'+tipoOptions(value)+'</select>'+
    '<div class="tipo-new" hidden><label for="'+id+'-novo">Nome do novo tipo</label><div class="datef-row"><input id="'+id+'-novo" data-role="tipo-new" type="text" maxlength="'+LIM.tipo+'" autocomplete="off" placeholder="Ex.: Troca de sonda"><button type="button" class="btn" data-action="tipo-add">Adicionar</button></div></div></div>';
}

/* ---------- telas ---------- */
function renderAll(){if(!auth.logged) return;renderTop();renderView();renderTabs();renderFab();}

function renderTop(){
  const t=ui.tab;
  const titles={agenda:'Agenda da semana',pacientes:'Pacientes',empresas:'Empresas',tipos:'Atendimentos'};
  let sub='';
  if(t==='agenda') sub=weekLabel();
  else if(t==='pacientes') sub=S.patients.length+(S.patients.length===1?' paciente cadastrado':' pacientes cadastrados');
  else if(t==='tipos'){const n=tiposList().length;sub=n+(n===1?' tipo de atendimento':' tipos de atendimento');}
  else sub=S.companies.length+(S.companies.length===1?' empresa cadastrada':' empresas cadastradas');
  $('#top').innerHTML='<div class="top-row"><div class="top-text"><h1>'+titles[t]+'</h1><p class="sub">'+esc(sub)+'</p></div>'+
    (ui.tab==='agenda'||ui.tab==='tipos'?'':'<button type="button" class="eye'+(hide?' on':'')+'" data-action="toggle-hide">'+ic(hide?'eye':'eye-off')+'<span>'+(hide?'Mostrar valores':'Ocultar valores')+'</span></button>')+'</div>';
}
function renderTabs(){
  const tabs=[['agenda','Agenda','calendar'],['pacientes','Pacientes','users'],['empresas','Empresas','building']];
  $('#tabs').innerHTML=tabs.map(function(t){
    return '<button type="button" class="tab" data-action="tab" data-tab="'+t[0]+'"'+(ui.tab===t[0]?' aria-current="page"':'')+'><span class="pill">'+ic(t[2])+'</span>'+t[1]+'</button>';
  }).join('')+'<button type="button" class="tab" data-action="open-menu" aria-haspopup="dialog"'+(ui.tab==='tipos'?' aria-current="page"':'')+'><span class="pill">'+ic('menu')+'</span>Menu</button>';
}
function renderFab(){
  const l={agenda:'Novo atendimento',pacientes:'Novo paciente',empresas:'Nova empresa',tipos:'Novo tipo'}[ui.tab];
  $('#fab').innerHTML=ic('plus')+'<span>'+l+'</span>';
}
function renderView(){
  let h='';
  if(hasExamples()) h+='<div class="notice"><p>Estes são dados de exemplo para você ver o app em uso.</p><button type="button" class="btn small" data-action="clear-demo">Apagar exemplos</button></div>';
  if(ui.tab==='agenda') h+=viewAgenda();
  else if(ui.tab==='pacientes') h+=viewPacientes();
  else if(ui.tab==='tipos') h+=viewTipos();
  else h+=viewEmpresas();
  h+='<p class="foot" id="foot">'+esc(statusText())+'</p>';
  $('#view').innerHTML=h;
  if(ui.tab==='pacientes') renderPatientList();
}

function viewAgenda(){
  const ws=fromIso(ui.weekStart),today=iso(new Date());
  const days=[0,1,2,3,4,5,6].map(i=>addDays(ws,i));
  const a=iso(days[0]),b=iso(days[6]);
  const wk=visitsBetween(a,b);
  const active=wk.filter(v=>v.status!=='cancelado');
  const strip=days.map(function(d){
    const k=iso(d),n=wk.filter(v=>v.date===k&&v.status!=='cancelado').length;
    const cls='day'+(k===ui.day?' sel':'')+(k===today?' today':'');
    return '<button type="button" class="'+cls+'" data-action="pick-day" data-day="'+k+'"'+(k===today?' aria-current="date"':'')+' aria-pressed="'+(k===ui.day)+'" aria-label="'+esc(dayTitle(d)+', '+n+(n===1?' atendimento':' atendimentos'))+'">'+
      '<span class="dw">'+WD[d.getDay()]+'</span><span class="dn">'+d.getDate()+'</span><span class="dots">'+'<i></i>'.repeat(Math.min(n,3))+'</span></button>';
  }).join('');
  const dayVisits=visitsBetween(ui.day,ui.day).sort((x,y)=>x.hora.localeCompare(y.hora));
  let nextId=null;
  if(ui.day===today){
    const hm=nowKey().slice(11);
    const nx=dayVisits.find(v=>v.status==='agendado'&&v.hora>=hm);
    if(nx) nextId=nx.id;
  }
  const dd=fromIso(ui.day);
  let list;
  if(!dayVisits.length){
    list='<div class="empty"><p>Nenhum atendimento em '+esc(dayTitle(dd).toLowerCase())+'.</p><button type="button" class="btn small" data-action="new-visit" data-date="'+ui.day+'">Agendar atendimento</button></div>';
  }else{
    list='<ol class="route">'+dayVisits.map(function(v){
      const p=findPatient(v.pacienteId);
      const nm=p?p.nome:'Paciente removido';
      const meta=[v.tipo||'Atendimento',p&&p.bairro].filter(Boolean).join(' · ');
      let side='';
      if(v.status==='feito') side+='<span class="badge feito">'+ic('check')+'Realizado</span>';
      else if(v.status==='cancelado') side+='<span class="badge cancelado">Cancelado</span>';
      else if(v.id===nextId) side+='<span class="badge next">Próximo</span>';
      return '<li class="stop '+v.status+(v.id===nextId?' next':'')+'"><time class="stop-time" datetime="'+v.date+'T'+esc(v.hora)+'">'+esc(v.hora)+'</time><span class="rail" aria-hidden="true"><i class="node"></i></span>'+
        '<button type="button" class="stop-card" data-action="open-visit" data-id="'+v.id+'"><span class="stop-main"><span class="stop-name">'+esc(nm)+exTag(v)+(v.serie?repMark():'')+'</span><span class="stop-meta">'+esc(meta)+'</span>'+(p?chip(p.empresaId):'')+'</span><span class="stop-side">'+side+'</span></button></li>';
    }).join('')+'</ol>';
  }
  const n=active.length;
  return '<div class="weekbar"><button type="button" class="btn small" data-action="week-prev">'+ic('left')+'Anterior</button><button type="button" class="btn small ghost" data-action="week-today">Hoje</button><button type="button" class="btn small" data-action="week-next">Próxima'+ic('right')+'</button></div>'+
    '<div class="weekstrip">'+strip+'</div>'+
    '<p class="weeksum"><strong>'+n+(n===1?' atendimento':' atendimentos')+'</strong> na semana</p>'+
    '<div class="dayhead"><h2>'+esc(dayTitle(dd))+'</h2><span>'+dayVisits.filter(v=>v.status!=='cancelado').length+' no dia</span></div>'+list;
}

function viewPacientes(){
  let f='';
  if(S.companies.length){
    f='<div class="filters" role="group" aria-label="Filtrar por empresa"><button type="button" class="fchip'+(ui.fcomp==='all'?' sel':'')+'" data-action="filter" data-id="all">Todos</button>'+
      S.companies.map(c=>'<button type="button" class="fchip'+(ui.fcomp===c.id?' sel':'')+'" data-action="filter" data-id="'+c.id+'">'+esc(c.nome)+'</button>').join('')+
      '<button type="button" class="fchip'+(ui.fcomp==='none'?' sel':'')+'" data-action="filter" data-id="none">Particulares</button></div>';
  }
  return '<button type="button" class="btn rep-btn" data-action="open-report" data-by="paciente">'+ic('chart')+'Relatório de faturamento</button><div class="search">'+ic('search')+'<label for="q" class="sr">Buscar paciente</label><input id="q" type="search" placeholder="Buscar por nome, bairro ou empresa" value="'+esc(ui.q)+'" autocomplete="off"></div>'+f+'<div id="plist"></div>';
}
function renderPatientList(){
  const el=$('#plist');if(!el) return;
  const q=norm(ui.q);
  const list=S.patients.filter(function(p){
    if(ui.fcomp==='none'){if(p.empresaId&&findCompany(p.empresaId)) return false;}
    else if(ui.fcomp!=='all'&&p.empresaId!==ui.fcomp) return false;
    if(!q) return true;
    const c=findCompany(p.empresaId);
    return norm([p.nome,p.bairro,p.endereco,c&&c.nome].join(' ')).indexOf(q)>-1;
  }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if(!S.patients.length){
    el.innerHTML='<div class="empty"><p>Nenhum paciente cadastrado. Cadastre o primeiro para montar sua agenda.</p><button type="button" class="btn small primary" data-action="new-patient">Cadastrar paciente</button></div>';
    return;
  }
  if(!list.length){el.innerHTML='<div class="empty"><p>Nenhum paciente encontrado.</p></div>';return;}
  el.innerHTML='<ul class="group">'+list.map(function(p){
    const a=age(p.nasc);
    const sub=[a!=null?a+' anos':'',p.bairro].filter(Boolean).join(' · ')||'Sem endereço';
    return '<li><button type="button" class="row" data-action="open-patient" data-id="'+p.id+'">'+avatar(p)+'<span class="row-main"><span class="row-name">'+esc(p.nome)+exTag(p)+repIcon(p)+'</span><span class="row-sub">'+esc(sub)+'</span>'+chip(p.empresaId)+'</span></button></li>';
  }).join('')+'</ul>';
}

function viewTipos(){
  const list=tiposList();
  if(!list.length) return '<div class="empty"><p>Nenhum tipo cadastrado. Crie os tipos de atendimento que você realiza, como curativo ou fisioterapia.</p><button type="button" class="btn small primary" data-action="new-tipo">Criar tipo</button></div>';
  return '<p class="hint hint-list">Estes tipos aparecem ao agendar um atendimento e no cadastro de pacientes recorrentes. Toque em um tipo para renomear ou excluir.</p><ul class="group">'+
    list.map(t=>'<li><button type="button" class="row" data-action="open-tipo" data-name="'+esc(t)+'"><span class="row-main"><span class="row-name">'+esc(t)+'</span><span class="row-sub">'+esc(tipoUso(t))+'</span></span></button></li>').join('')+'</ul>';
}
function viewEmpresas(){
  if(!S.companies.length) return '<div class="empty"><p>Nenhuma empresa cadastrada. Cadastre as empresas para as quais você presta serviço e vincule seus pacientes a elas.</p><button type="button" class="btn small primary" data-action="new-company">Cadastrar empresa</button></div>';
  const list=S.companies.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  return '<button type="button" class="btn rep-btn" data-action="open-report" data-by="empresa">'+ic('chart')+'Relatório de faturamento</button><ul class="group">'+list.map(function(c){
    const n=S.patients.filter(p=>p.empresaId===c.id).length;
    return '<li><button type="button" class="row" data-action="open-company" data-id="'+c.id+'"><span class="av sq c'+(c.cor%6)+'" aria-hidden="true">'+esc(initials(c.nome))+'</span><span class="row-main"><span class="row-name">'+esc(c.nome)+exTag(c)+'</span><span class="row-sub">'+esc(c.tipo||'Empresa')+'</span></span><span class="row-side"><span>'+n+(n===1?' paciente':' pacientes')+'</span></span></button></li>';
  }).join('')+'</ul>';
}

/* ---------- janelas ---------- */
let lastFocus=null;
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
function openSheet(title,body){
  if($('#sheet-root').firstChild) closeSheet(true);
  else lastFocus=document.activeElement;
  $('#sheet-root').innerHTML='<div class="scrim" data-action="close-sheet"></div><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title" tabindex="-1">'+esc(title)+'</h2><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">'+ic('x')+'</button></div><div class="sheet-body">'+body+'</div></section>';
  applyLimits($('#sheet-root'));
  setInert(true);
  const h=$('#sheet-title');if(h) h.focus();
}
function closeSheet(keep){
  $('#sheet-root').innerHTML='';
  setInert(false);
  if(!keep&&lastFocus&&document.contains(lastFocus)){try{lastFocus.focus();}catch(e){}}
}
let toastT=null;
function toast(msg){
  const t=$('#toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('show');},2600);
}
function copyText(txt){
  const done=function(){toast('Copiado.');};
  const fail=function(){toast('Não foi possível copiar. Selecione o texto e copie.');};
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,fail);
    else fail();
  }catch(e){fail();}
}
function moveBlock(){
  return '<div class="confirm" id="move-confirm" role="alert" hidden><p id="move-msg"></p><div class="two"><button type="button" class="btn danger" data-action="confirm-move">Confirmar mudança</button><button type="button" class="btn" data-action="cancel-move">Voltar</button></div></div>';
}
function askMove(f,html){
  const c=f.querySelector('#move-confirm'),a=f.querySelector('.sheet-actions');
  f.querySelector('#move-msg').innerHTML=html;
  c.hidden=false;if(a) a.hidden=true;
  const e=f.querySelector('#f-err');if(e) e.textContent='';
  const b=c.querySelector('[data-action="confirm-move"]');
  c.scrollIntoView({block:'nearest'});if(b) b.focus({preventScroll:true});
}
function clearMove(f){
  const c=f.querySelector('#move-confirm'),a=f.querySelector('.sheet-actions');
  if(c) c.hidden=true;if(a) a.hidden=false;delete f.dataset.moveOk;
}
function askBlock(id,msg,action,dataId){
  return '<button type="button" class="btn danger" id="ask-'+id+'" data-action="ask" data-confirm="cf-'+id+'">Excluir</button>'+
    '<div class="confirm" id="cf-'+id+'" hidden><p>'+msg+'</p><div class="two"><button type="button" class="btn danger" data-action="'+action+'" data-id="'+dataId+'">Excluir</button><button type="button" class="btn" data-action="unask" data-confirm="cf-'+id+'" data-ask="ask-'+id+'">Manter</button></div></div>';
}
function kv(label,html,extra){
  return '<div><div class="grow"><span class="k">'+label+'</span><div class="v">'+html+'</div>'+(extra||'')+'</div></div>';
}
function copyBtn(txt,label){
  return '<button type="button" class="icon-btn sm" data-action="copy" data-text="'+esc(txt)+'" aria-label="'+esc(label)+'">'+ic('copy')+'</button>';
}
function kvCopy(label,txt,extra,copyLabel){
  return '<div><div class="grow"><span class="k">'+label+'</span><div class="v">'+esc(txt)+'</div>'+(extra||'')+'</div>'+copyBtn(txt,copyLabel||('Copiar '+label.toLowerCase()))+'</div>';
}

function openVisit(id){
  const v=visitById(id);if(!v) return;
  const p=findPatient(v.pacienteId);
  const d=fromIso(v.date);
  const addr=p?[p.endereco,p.bairro].filter(Boolean).join(', '):'';
  const st={agendado:'Agendado',feito:'Realizado',cancelado:'Cancelado'}[v.status];
  let b='<div class="sum">'+(p?avatar(p,'lg'):'')+'<div><h3>'+esc(p?p.nome:'Paciente removido')+'</h3><p>'+esc(dayTitle(d))+' às '+esc(v.hora)+'</p></div></div>'+
    '<p><span class="badge '+v.status+'">'+st+'</span> <span class="lead">'+esc(v.tipo||'Atendimento')+'</span></p>';
  if(p&&p.alergias) b+='<p class="alert"><strong>Alergias:</strong> '+esc(p.alergias)+'</p>';
  if(v.serie) b+='<p class="hint">Este atendimento se repete toda semana. Para mudar os dias ou o horário, edite o cadastro do paciente.</p>';
  b+='<div class="panel kv">';
  if(p) b+=kv('Empresa',chip(p.empresaId));
  if(addr) b+=kvCopy('Endereço',addr,'<a href="'+mapsUrl(addr)+'" target="_blank" rel="noopener noreferrer">'+ic('external')+'Abrir no mapa</a>','Copiar endereço');
  if(p&&p.ref) b+=kv('Como chegar e acessar',esc(p.ref));
  if(p&&p.tel) b+=kvCopy('Telefone',p.tel,'','Copiar telefone');
  if(p&&p.respNome) b+=kvCopy('Responsável',p.respNome+(p.respTel?', '+p.respTel:''),'','Copiar contato do responsável');
  if(v.obs) b+=kv('Observação deste atendimento',esc(v.obs));
  b+='</div><div class="sheet-actions">';
  if(v.status==='agendado') b+='<button type="button" class="btn primary" data-action="visit-status" data-id="'+v.id+'" data-status="feito">'+ic('check')+'Marcar como realizado</button>';
  else b+='<button type="button" class="btn primary" data-action="visit-status" data-id="'+v.id+'" data-status="agendado">Voltar para agendado</button>';
  b+='<div class="two"><button type="button" class="btn" data-action="edit-visit" data-id="'+v.id+'">Remarcar ou editar</button>'+(p?'<button type="button" class="btn" data-action="open-patient" data-id="'+p.id+'">Ficha do paciente</button>':'<span></span>')+'</div>';
  if(v.status==='agendado') b+='<button type="button" class="btn" data-action="visit-status" data-id="'+v.id+'" data-status="cancelado">Cancelar atendimento</button>';
  b+=askBlock('v'+v.id,'Excluir este atendimento da agenda?','do-delete-visit',v.id)+'</div>';
  openSheet('Atendimento',b);
}

function openPatient(id){
  const p=findPatient(id);if(!p) return;
  const a=age(p.nasc);
  const addr=[p.endereco,p.bairro].filter(Boolean).join(', ');
  const key=nowKey();
  const ups=visitsBetween(iso(new Date()),iso(addDays(new Date(),120))).filter(v=>v.pacienteId===id&&v.status==='agendado'&&(v.date+' '+v.hora)>=key).sort((x,y)=>(x.date+x.hora).localeCompare(y.date+y.hora)).slice(0,4);
  let b='<div class="sum">'+avatar(p,'lg')+'<div><h3>'+esc(p.nome)+exTag(p)+'</h3><p>'+(a!=null?a+' anos':'Idade não informada')+'</p></div></div>'+
    '<p>'+chip(p.empresaId)+'</p>';
  if(p.alergias) b+='<p class="alert"><strong>Alergias:</strong> '+esc(p.alergias)+'</p>';
  b+='<div class="panel kv"><div><div class="grow"><span class="k">Valor por atendimento</span><div class="v">'+money(p.valor)+'</div></div><button type="button" class="icon-btn sm" data-action="toggle-hide-sheet" data-id="'+p.id+'" aria-label="'+(hide?'Mostrar valores':'Ocultar valores')+'">'+ic(hide?'eye':'eye-off')+'</button></div>'+(p.rec&&p.rec.ativo?kv('Atendimento recorrente',esc(recText(p))):'');
  if(addr) b+=kvCopy('Endereço',addr,'<a href="'+mapsUrl(addr)+'" target="_blank" rel="noopener noreferrer">'+ic('external')+'Abrir no mapa</a>','Copiar endereço');
  if(p.ref) b+=kv('Como chegar e acessar',esc(p.ref));
  b+='</div>';
  let c='';
  if(p.tel) c+=kvCopy('Telefone',p.tel,'','Copiar telefone');
  if(p.respNome) c+=kvCopy('Responsável',p.respNome+(p.respTel?', '+p.respTel:''),'','Copiar contato do responsável');
  if(c) b+='<div class="panel kv">'+c+'</div>';
  let h='';
  if(p.condicoes) h+=kv('Condições e diagnóstico',esc(p.condicoes));
  if(p.medicamentos) h+=kv('Medicamentos em uso',esc(p.medicamentos));
  if(p.obs) h+=kv('Observações importantes',esc(p.obs));
  if(h) b+='<div class="panel kv">'+h+'</div>';
  if(ups.length){
    b+='<div class="panel"><ul class="ups">'+ups.map(function(v){const d=fromIso(v.date);return '<li><span>'+WD[d.getDay()]+', '+pad(d.getDate())+'/'+pad(d.getMonth()+1)+' às '+esc(v.hora)+'</span><span>'+esc(v.tipo||'Atendimento')+'</span></li>';}).join('')+'</ul></div>';
  }
  b+='<div class="sheet-actions"><button type="button" class="btn primary" data-action="new-visit" data-patient="'+p.id+'">'+ic('calendar')+'Agendar atendimento</button><button type="button" class="btn" data-action="edit-patient" data-id="'+p.id+'">Editar cadastro</button><button type="button" class="btn" data-action="open-report" data-by="paciente" data-pac="'+p.id+'">'+ic('chart')+'Faturamento deste paciente</button>'+
    askBlock('p'+p.id,'Excluir '+esc(p.nome)+' e todos os atendimentos dessa pessoa?','do-delete-patient',p.id)+'</div>';
  openSheet('Paciente',b);
}

function openCompany(id){
  const c=findCompany(id);if(!c) return;
  const ps=S.patients.filter(p=>p.empresaId===id).sort((x,y)=>x.nome.localeCompare(y.nome,'pt-BR'));
  let b='<div class="sum"><span class="av sq lg c'+(c.cor%6)+'" aria-hidden="true">'+esc(initials(c.nome))+'</span><div><h3>'+esc(c.nome)+exTag(c)+'</h3><p>'+esc(c.tipo||'Empresa')+'</p></div></div><div class="panel kv">';
  b+=kv('Valor padrão por atendimento',money(c.valorPadrao));
  if(c.contato) b+=kvCopy('Contato',c.contato,'','Copiar contato');
  if(c.pagamento) b+=kv('Pagamento',esc(c.pagamento));
  if(c.obs) b+=kv('Observações',esc(c.obs));
  b+='</div>';
  b+='<div class="dayhead"><h2>Pacientes</h2><span>'+ps.length+'</span></div>';
  if(ps.length){
    b+='<ul class="group">'+ps.map(function(p){return '<li><button type="button" class="row" data-action="open-patient" data-id="'+p.id+'">'+avatar(p)+'<span class="row-main"><span class="row-name">'+esc(p.nome)+'</span><span class="row-sub">'+esc(p.bairro||'Sem bairro')+'</span></span></button></li>';}).join('')+'</ul>';
  }else b+='<div class="empty"><p>Nenhum paciente vinculado a esta empresa.</p></div>';
  const outros=S.patients.filter(p=>p.empresaId!==id).length;
  b+='<div class="sheet-actions">'+(outros?'<button type="button" class="btn primary" data-action="link-patients" data-company="'+c.id+'">'+ic('users')+'Vincular paciente já cadastrado</button>':'')+'<button type="button" class="btn'+(outros?'':' primary')+'" data-action="new-patient" data-company="'+c.id+'">'+ic('plus')+'Cadastrar novo paciente'+(outros?'':' nesta empresa')+'</button><button type="button" class="btn" data-action="edit-company" data-id="'+c.id+'">Editar empresa</button><button type="button" class="btn" data-action="open-report" data-by="paciente" data-emp="'+c.id+'">'+ic('chart')+'Faturamento desta empresa</button>'+
    askBlock('c'+c.id,ps.length?'<strong>Atenção:</strong> '+(ps.length===1?'1 paciente será desvinculado':ps.length+' pacientes serão desvinculados')+' de '+esc(c.nome)+(ps.length===1?' e ficará como particular':' e ficarão como particulares')+'. Confirmar a exclusão da empresa?':'Excluir '+esc(c.nome)+'?','do-delete-company',c.id)+'</div>';
  openSheet('Empresa',b);
}

/* ---------- formulários ---------- */
const opt=(v,l,sel)=>'<option value="'+esc(v)+'"'+(sel?' selected':'')+'>'+esc(l)+'</option>';
const val=x=>esc(x==null?'':x);
const moneyIn=n=>n==null||n===''?'':String(n).replace('.',',');

function patientForm(p,companyId){
  p=p||{};
  const emp=p.empresaId||companyId||'';
  const comps=S.companies.map(c=>opt(c.id,c.nome,c.id===emp)).join('');
  const r=p.rec&&p.rec.ativo?p.rec:null;
  const dayChecks=[1,2,3,4,5,6,0].map(d=>'<label class="dpick"><input type="checkbox" name="dia" value="'+d+'" aria-label="'+WDL[d]+'"'+(r&&r.dias.indexOf(d)>-1?' checked':'')+'><span>'+WD[d]+'</span></label>').join('');
  const b='<form id="f-patient" novalidate data-id="'+val(p.id)+'">'+
    '<fieldset><legend>Dados do paciente</legend>'+
    '<label for="p-nome">Nome completo</label><input id="p-nome" name="nome" autocomplete="off" value="'+val(p.nome)+'">'+
    '<label for="p-nasc">Nascimento</label>'+dateField('p-nasc','nasc',p.nasc,{clear:true})+'<label for="p-tel">Telefone</label><input id="p-tel" name="tel" type="tel" inputmode="tel" autocomplete="off" value="'+val(p.tel)+'">'+
    '<div class="two"><div><label for="p-rn">Responsável</label><input id="p-rn" name="respNome" autocomplete="off" placeholder="Nome e parentesco" value="'+val(p.respNome)+'"></div><div><label for="p-rt">Telefone do responsável</label><input id="p-rt" name="respTel" type="tel" inputmode="tel" autocomplete="off" value="'+val(p.respTel)+'"></div></div></fieldset>'+
    '<fieldset><legend>Endereço</legend>'+
    '<label for="p-end">Rua e número</label><input id="p-end" name="endereco" autocomplete="off" value="'+val(p.endereco)+'">'+
    '<label for="p-bai">Bairro</label><input id="p-bai" name="bairro" autocomplete="off" value="'+val(p.bairro)+'">'+
    '<label for="p-ref">Como chegar e acessar</label><textarea id="p-ref" name="ref" placeholder="Ponto de referência, portaria, interfone, animais">'+val(p.ref)+'</textarea></fieldset>'+
    '<fieldset><legend>Atendimento</legend>'+
    '<label for="p-emp">Empresa</label><select id="p-emp" name="empresaId">'+opt('','Particular (sem empresa)',!emp)+comps+'</select>'+
    (S.companies.length?'':'<p class="hint">Cadastre empresas na aba Empresas para vinculá-las aqui.</p>')+
    '<label for="p-val">Valor por atendimento (R$)</label><input id="p-val" name="valor" inputmode="decimal" autocomplete="off" placeholder="Ex.: 150,00" value="'+moneyIn(p.valor)+'"></fieldset>'+
    '<fieldset><legend>Atendimento recorrente</legend>'+
    '<label class="check" for="p-rec"><input type="checkbox" id="p-rec" name="recAtivo"'+(r?' checked':'')+'><span>Atendido toda semana</span></label>'+
    '<div id="rec-box"'+(r?'':' hidden')+'>'+
    '<p class="lab" id="dias-l">Dias da semana</p><div class="days" role="group" aria-labelledby="dias-l">'+dayChecks+'</div>'+
    '<label for="p-rhora">Horário</label>'+timeField('p-rhora','recHora',r?r.hora:'09:00')+'<label for="p-rtipo">Tipo de atendimento</label>'+tipoField('p-rtipo','recTipo',r?r.tipo:'')+
    '<label for="p-rini">Começa em</label>'+dateField('p-rini','recInicio',r?r.inicio:iso(new Date()))+'<label for="p-rfim">Termina em</label>'+dateField('p-rfim','recFim',r?r.fim:'',{clear:true})+
    '<p class="hint">O fim é opcional. Os atendimentos aparecem na agenda toda semana, sem precisar agendar um por um.</p></div></fieldset>'+
    '<fieldset><legend>Saúde</legend>'+
    '<label for="p-con">Condições e diagnóstico</label><textarea id="p-con" name="condicoes">'+val(p.condicoes)+'</textarea>'+
    '<label for="p-ale">Alergias</label><input id="p-ale" name="alergias" autocomplete="off" value="'+val(p.alergias)+'">'+
    '<label for="p-med">Medicamentos em uso</label><textarea id="p-med" name="medicamentos">'+val(p.medicamentos)+'</textarea>'+
    '<label for="p-obs">Observações importantes</label><textarea id="p-obs" name="obs">'+val(p.obs)+'</textarea></fieldset>'+
    '<p class="err" id="f-err" role="alert"></p>'+
    moveBlock()+'<div class="sheet-actions"><button type="submit" class="btn primary">Salvar paciente</button><button type="button" class="btn" data-action="close-sheet">Cancelar</button></div></form>';
  openSheet(p.id?'Editar paciente':'Novo paciente',b);
  const rc=$('#p-rec'),rb=$('#rec-box');
  if(rc&&rb) rc.addEventListener('change',function(){rb.hidden=!rc.checked;});
  const sel=$('#p-emp'),inp=$('#p-val');
  if(sel&&inp) sel.addEventListener('change',function(){
    const c=findCompany(sel.value);
    if(c&&!inp.value.trim()&&c.valorPadrao!=null) inp.value=moneyIn(c.valorPadrao);
  });
}

function companyForm(c){
  c=c||{};
  const b='<form id="f-company" novalidate data-id="'+val(c.id)+'">'+
    '<label for="c-nome">Nome da empresa</label><input id="c-nome" name="nome" autocomplete="off" value="'+val(c.nome)+'">'+
    '<label for="c-tipo">Tipo</label><select id="c-tipo" name="tipo">'+TIPOS_EMPRESA.map(t=>opt(t,t,(c.tipo||TIPOS_EMPRESA[0])===t)).join('')+'</select>'+
    '<label for="c-con">Contato</label><input id="c-con" name="contato" autocomplete="off" placeholder="Nome e telefone" value="'+val(c.contato)+'">'+
    '<label for="c-val">Valor padrão por atendimento (R$)</label><input id="c-val" name="valorPadrao" inputmode="decimal" autocomplete="off" placeholder="Ex.: 180,00" value="'+moneyIn(c.valorPadrao)+'"><p class="hint">Aparece sugerido ao vincular um paciente a esta empresa.</p>'+
    '<label for="c-pag">Pagamento</label><input id="c-pag" name="pagamento" autocomplete="off" placeholder="Ex.: Pagamento até o dia 10" value="'+val(c.pagamento)+'">'+
    '<label for="c-obs">Observações</label><textarea id="c-obs" name="obs">'+val(c.obs)+'</textarea>'+
    '<p class="err" id="f-err" role="alert"></p>'+
    '<div class="sheet-actions"><button type="submit" class="btn primary">Salvar empresa</button><button type="button" class="btn" data-action="close-sheet">Cancelar</button></div></form>';
  openSheet(c.id?'Editar empresa':'Nova empresa',b);
}

function visitForm(v,opts){
  v=v||{};opts=opts||{};
  if(!S.patients.length){
    openSheet('Novo atendimento','<div class="empty"><p>Cadastre um paciente antes de agendar um atendimento.</p><button type="button" class="btn primary small" data-action="new-patient">Cadastrar paciente</button></div>');
    return;
  }
  const pid=v.pacienteId||opts.patient||'';
  const pats=S.patients.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const b='<form id="f-visit" novalidate data-id="'+val(v.id)+'">'+
    '<label for="v-pac">Paciente</label><select id="v-pac" name="pacienteId">'+opt('','Escolha o paciente',!pid)+pats.map(p=>opt(p.id,p.nome,p.id===pid)).join('')+'</select>'+
    '<label for="v-data">Data</label>'+dateField('v-data','date',v.date||opts.date||ui.day)+'<label for="v-hora">Hora</label>'+timeField('v-hora','hora',v.hora||'09:00')+
    '<label for="v-tipo">Tipo de atendimento</label>'+tipoField('v-tipo','tipo',v.tipo)+
    '<label for="v-obs">Observação</label><textarea id="v-obs" name="obs" placeholder="Opcional">'+val(v.obs)+'</textarea>'+
    (v.id?'':'<label for="v-rep">Repetir</label><select id="v-rep" name="rep"><option value="1">Não repetir</option><option value="4">Toda semana, por 4 semanas</option><option value="8">Toda semana, por 8 semanas</option><option value="12">Toda semana, por 12 semanas</option></select>')+
    '<p class="err" id="f-err" role="alert"></p>'+
    '<div class="sheet-actions"><button type="submit" class="btn primary">Salvar atendimento</button><button type="button" class="btn" data-action="close-sheet">Cancelar</button></div></form>';
  openSheet(v.id?'Editar atendimento':'Novo atendimento',b);
}

function tipoForm(nome){
  const edit=nome!=null;
  const b='<form id="f-tipo" novalidate data-old="'+esc(nome||'')+'"><label for="t-nome">Nome do tipo</label><input id="t-nome" name="nome" maxlength="'+LIM.tipo+'" autocomplete="off" placeholder="Ex.: Troca de sonda" value="'+esc(nome||'')+'">'+
    (edit?'<p class="hint">Ao renomear, os atendimentos e cadastros que usam este tipo passam a usar o novo nome.</p>':'')+
    '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Salvar tipo</button><button type="button" class="btn" data-action="close-sheet">Cancelar</button>'+
    (edit?askBlock('t'+tiposList().indexOf(nome),'Excluir o tipo “'+esc(nome)+'”? Atendimentos já registrados mantêm o nome.','do-delete-tipo',esc(nome)):'')+'</div></form>';
  openSheet(edit?'Editar tipo':'Novo tipo',b);
}
function linkForm(companyId){
  const c=findCompany(companyId);if(!c) return;
  const ps=S.patients.filter(p=>p.empresaId!==companyId).sort((x,y)=>x.nome.localeCompare(y.nome,'pt-BR'));
  const b='<form id="f-link" novalidate data-company="'+c.id+'"><p class="hint hint-form">Marque os pacientes que passam a ser atendidos por <strong>'+esc(c.nome)+'</strong>. Quem já estiver em outra empresa muda para esta.</p>'+
    (ps.length>6?'<div class="search">'+ic('search')+'<label for="lk-q" class="sr">Buscar paciente</label><input id="lk-q" data-role="link-q" type="search" placeholder="Buscar por nome" autocomplete="off"></div>':'')+
    '<ul class="group" id="lk-list">'+ps.map(function(p){
      const atual=findCompany(p.empresaId);
      return '<li><label class="lrow" data-n="'+esc(norm(p.nome))+'"><input type="checkbox" name="pac" value="'+esc(p.id)+'" aria-label="'+esc(p.nome)+'">'+avatar(p)+'<span class="row-main"><span class="row-name">'+esc(p.nome)+exTag(p)+'</span><span class="row-sub">'+(atual?'Hoje em '+esc(atual.nome):'Particular')+'</span></span></label></li>';
    }).join('')+'</ul><p class="err" id="f-err" role="alert"></p>'+moveBlock()+
    '<div class="sheet-actions"><button type="submit" class="btn primary">Vincular selecionados</button><button type="button" class="btn" data-action="back-company" data-id="'+c.id+'">Voltar</button></div></form>';
  openSheet('Vincular pacientes',b);
}
function saveLink(f){
  const id=f.dataset.company,ids=Array.from(f.querySelectorAll('input[name=pac]:checked')).map(x=>x.value);
  if(!ids.length) return fail(f,'Marque pelo menos um paciente.');
  const moves=S.patients.filter(p=>ids.indexOf(p.id)>-1&&findCompany(p.empresaId));
  if(moves.length&&!f.dataset.moveOk){
    const nova=findCompany(id);
    return askMove(f,'<strong>Desvincular '+(moves.length===1?'este paciente da empresa atual?':moves.length+' pacientes das empresas atuais?')+'</strong> Eles passam a ser atendidos por <strong>'+esc(nova?nova.nome:'')+'</strong>:<br>'+
      moves.map(p=>esc(p.nome)+' (sai de '+esc(findCompany(p.empresaId).nome)+')').join('<br>')+'<br>Os atendimentos já agendados e os valores cadastrados continuam como estão.');
  }
  S.patients.forEach(function(p){if(ids.indexOf(p.id)>-1) p.empresaId=id;});
  commit();
  renderAll();openCompany(id);
  toast(ids.length===1?'Paciente vinculado.':ids.length+' pacientes vinculados.');
}
function saveTipo(f){
  const nome=cleanName(f.elements.nome.value),old=f.dataset.old;
  if(!nome) return fail(f,'Informe o nome do tipo.','nome');
  if(tiposList().some(t=>t!==old&&norm(t)===norm(nome))) return fail(f,'Já existe um tipo com esse nome.','nome');
  if(old) renameTipo(old,nome);else addTipo(nome);
  closeSheet(true);lastFocus=null;renderAll();
  toast(old?'Tipo atualizado.':'Tipo criado.');
}
function fail(f,msg,field){
  const e=$('#f-err');if(e) e.textContent=msg;
  const x=f.elements[field];if(x&&x.focus) x.focus();else if(x&&x[0]) x[0].focus();
}
function readForm(f){
  const o={};
  Array.prototype.forEach.call(f.elements,function(el){
    if(!el.name||el.type==='checkbox') return;
    const t=String(el.value||'').trim();
    if(el.dataset&&el.dataset.kind==='date') o[el.name]=t===''?'':(brToIso(t)||'invalid');
    else if(el.dataset&&el.dataset.kind==='time') o[el.name]=t===''?'':(parseTime(t)||'invalid');
    else o[el.name]=t;
  });
  return o;
}

function savePatient(f){
  const o=readForm(f);
  if(!o.nome) return fail(f,'Informe o nome do paciente.','nome');
  const valor=parseMoney(o.valor);
  if(valor!==null&&isNaN(valor)) return fail(f,'Informe um valor válido, como 150,00.','valor');
  if(o.nasc==='invalid') return fail(f,'Informe a data de nascimento como dia/mês/ano, por exemplo 12/03/1944.','nasc');
  let rec=null;
  if(f.elements.recAtivo&&f.elements.recAtivo.checked){
    const dias=Array.prototype.map.call(f.querySelectorAll('input[name="dia"]:checked'),x=>Number(x.value)).sort((a,b)=>a-b);
    if(!dias.length) return fail(f,'Escolha ao menos um dia da semana.','dia');
    if(!o.recHora||o.recHora==='invalid') return fail(f,'Informe um horário válido, como 08:30.','recHora');
    if(o.recTipo==='__novo') return fail(f,'Digite o nome do novo tipo e toque em Adicionar, ou escolha outro tipo.','recTipo');
    if(!o.recInicio||o.recInicio==='invalid') return fail(f,'Informe quando os atendimentos começam, como 16/11/2026.','recInicio');
    if(o.recFim==='invalid') return fail(f,'Informe a data final como dia/mês/ano.','recFim');
    if(o.recFim&&o.recFim<o.recInicio) return fail(f,'A data final precisa ser depois da data inicial.','recFim');
    rec={ativo:true,dias:dias,hora:o.recHora,tipo:o.recTipo,inicio:o.recInicio,fim:o.recFim};
  }
  const data={nome:o.nome,nasc:o.nasc,tel:o.tel,respNome:o.respNome,respTel:o.respTel,endereco:o.endereco,bairro:o.bairro,ref:o.ref,empresaId:o.empresaId,valor:valor,condicoes:o.condicoes,alergias:o.alergias,medicamentos:o.medicamentos,obs:o.obs,rec:rec};
  const id=f.dataset.id;
  if(id){
    const p=findPatient(id);
    const antes=p?findCompany(p.empresaId):null;
    if(p&&antes&&(o.empresaId||'')!==p.empresaId&&!f.dataset.moveOk){
      const novo=findCompany(o.empresaId);
      return askMove(f,'<strong>Desvincular '+esc(p.nome)+' de '+esc(antes.nome)+'?</strong> O paciente '+(novo?'passa a ser atendido por <strong>'+esc(novo.nome)+'</strong>':'passa a ser <strong>particular</strong>')+'. Os atendimentos já agendados e o valor cadastrado continuam como estão.');
    }
    if(p){
      if(p.rec&&p.rec.ativo&&recSig(p.rec)!==recSig(rec)) closeRecurrence(p);
      Object.assign(p,data);
    }
  }
  else S.patients.push(Object.assign({id:uid()},data));
  commit();closeSheet(true);lastFocus=null;renderAll();
  toast(id?'Cadastro atualizado.':'Paciente cadastrado.');
}
function saveCompany(f){
  const o=readForm(f);
  if(!o.nome) return fail(f,'Informe o nome da empresa.','nome');
  const valor=parseMoney(o.valorPadrao);
  if(valor!==null&&isNaN(valor)) return fail(f,'Informe um valor válido, como 180,00.','valorPadrao');
  const data={nome:o.nome,tipo:o.tipo,contato:o.contato,valorPadrao:valor,pagamento:o.pagamento,obs:o.obs};
  const id=f.dataset.id;
  if(id){const c=findCompany(id);if(c) Object.assign(c,data);}
  else S.companies.push(Object.assign({id:uid(),cor:S.companies.length%6},data));
  commit();closeSheet(true);lastFocus=null;renderAll();
  toast(id?'Empresa atualizada.':'Empresa cadastrada.');
}
function saveVisit(f){
  const o=readForm(f);
  if(!o.pacienteId) return fail(f,'Escolha o paciente.','pacienteId');
  if(!o.date||o.date==='invalid') return fail(f,'Informe uma data válida, como 16/11/2026.','date');
  if(o.tipo==='__novo') return fail(f,'Digite o nome do novo tipo e toque em Adicionar, ou escolha outro tipo.','tipo');
  if(!o.hora||o.hora==='invalid') return fail(f,'Informe um horário válido, como 08:30.','hora');
  const id=f.dataset.id;
  let msg=null;
  if(id){
    const v=resolveVisit(id);
    if(v){
      const moved=v.date!==o.date||v.hora!==o.hora;
      Object.assign(v,{pacienteId:o.pacienteId,date:o.date,hora:o.hora,tipo:o.tipo,obs:o.obs,manual:true});
      if(moved){
        if(v.status==='cancelado'||(v.status==='feito'&&(o.date+' '+o.hora)>nowKey())) v.status='agendado';
        const d=fromIso(o.date);
        msg='Atendimento remarcado para '+WD[d.getDay()]+', '+pad(d.getDate())+'/'+pad(d.getMonth()+1)+' às '+o.hora+'.';
      }
    }
  }else{
    const n=Math.max(1,Number(o.rep)||1),d0=fromIso(o.date);
    for(let i=0;i<n;i++) S.visits.push({id:uid(),pacienteId:o.pacienteId,date:iso(addDays(d0,7*i)),hora:o.hora,tipo:o.tipo,obs:o.obs,status:'agendado'});
  }
  commit();closeSheet(true);lastFocus=null;
  ui.tab='agenda';ui.day=o.date;ui.weekStart=iso(startOfWeek(fromIso(o.date)));
  renderAll();window.scrollTo(0,0);
  toast(msg||(id?'Atendimento atualizado.':'Atendimento agendado.'));
}

/* ---------- ações ---------- */
function setWeek(start){
  const off=fromIso(ui.day).getDay();
  ui.weekStart=iso(start);
  ui.day=iso(addDays(start,off));
  renderAll();
}
const A={
  'tab':function(el){ui.tab=el.dataset.tab;renderAll();window.scrollTo(0,0);},
  'toggle-hide':function(){
    hide=!hide;writeLocal(HIDE_KEY,hide?'1':'0');
    renderTop();renderView();
    toast(hide?'Valores ocultos.':'Valores visíveis.');
  },
  'toggle-hide-sheet':function(el){
    hide=!hide;writeLocal(HIDE_KEY,hide?'1':'0');
    renderTop();renderView();openPatient(el.dataset.id);
  },
  'pick-day':function(el){ui.day=el.dataset.day;renderView();},
  'week-prev':function(){setWeek(addDays(fromIso(ui.weekStart),-7));},
  'week-next':function(){setWeek(addDays(fromIso(ui.weekStart),7));},
  'week-today':function(){ui.weekStart=iso(startOfWeek(new Date()));ui.day=iso(new Date());renderAll();},
  'filter':function(el){ui.fcomp=el.dataset.id;renderView();},
  'fab':function(){
    if(ui.tab==='agenda') visitForm(null,{date:ui.day});
    else if(ui.tab==='pacientes') patientForm();
    else if(ui.tab==='tipos') tipoForm();
    else companyForm();
  },
  'new-visit':function(el){visitForm(null,{date:el.dataset.date,patient:el.dataset.patient});},
  'new-patient':function(el){patientForm(null,el.dataset.company);},
  'new-company':function(){companyForm();},
  'new-tipo':function(){tipoForm();},
  'pw-toggle':function(el){
    const i=el.parentNode.querySelector('input'),on=i.type==='password';
    i.type=on?'text':'password';el.textContent=on?'Ocultar':'Mostrar';el.setAttribute('aria-pressed',on?'true':'false');
  },
  'auth-forgot':function(){showGate('reset');},
  'auth-create':function(){showGate('criar');},
  'auth-retry':function(){boot();},
  'auth-back':function(){showGate('entrar');},
  'open-report':function(el){
    const d=el.dataset,fromTab=!el.closest('.sheet');
    repInit({by:d.by,emp:d.emp||(fromTab&&ui.tab==='pacientes'?ui.fcomp:'all'),pac:d.pac||'all'});
    openReport();
  },
  'rep-mode':function(el){
    const r=ui.rep;
    if(el.dataset.mode==='mes'){const a=fromIso(r.from);repSetMonth(a.getFullYear(),a.getMonth());r.mode='mes';}
    else r.mode='custom';
    repRender();
  },
  'rep-month':function(el){repSetMonth(ui.rep.y,ui.rep.m+Number(el.dataset.dir));repRender();},
  'rep-by':function(el){ui.rep.by=el.dataset.by;repRender();},
  'rep-apply':function(){
    const a=brToIso(($('#r-de')||{}).value||''),b=brToIso(($('#r-ate')||{}).value||''),e=$('#r-err');
    if(!a||!b){if(e) e.textContent='Informe as duas datas como dia/mês/ano, por exemplo 01/11/2026.';return;}
    if(b<a){if(e) e.textContent='A data final precisa ser depois da data inicial.';return;}
    if((fromIso(b)-fromIso(a))/864e5>731){if(e) e.textContent='Escolha um período de até 2 anos.';return;}
    ui.rep.from=a;ui.rep.to=b;repRender();
  },
  'rep-hide':function(){hide=!hide;writeLocal(HIDE_KEY,hide?'1':'0');renderTop();renderView();repRender();},
  'rep-copy':function(){copyText(repText());},
  'rep-csv':function(){
    if(!dlRef) return;
    const r=ui.rep;
    dlRef.save({filename:'faturamento_por-'+r.by+'_'+r.from+'_a_'+r.to+'.csv',data:repCsv()}).then(function(){toast('Planilha salva.');},function(e){if(e&&e.code==='declined') return;toast('Não foi possível salvar a planilha.');});
  },
  'open-menu':function(){openMenu();},
  'open-password':function(){openPassword();},
  'menu-go':function(el){
    const g=el.dataset.go;
    if(g==='perfil') openProfile();
    else if(g==='atend'){closeSheet(true);lastFocus=null;ui.tab='tipos';renderAll();window.scrollTo(0,0);}
    else openSoon(g);
  },
  'logout':function(){sair();},
  'import-pick':function(){const i=$('#imp-file');if(i) i.click();},
  'import-confirm':function(){applyImport();},
  'backup':function(){
    const o=backupObject();
    if(!o.empresas.length&&!o.pacientes.length&&!o.atendimentos.length){toast('Ainda não há dados seus para guardar.');return;}
    dlFile('cuidar-em-casa_backup_'+iso(new Date())+'.json',JSON.stringify(o,null,2),'application/json');
    toast('Backup baixado.');
  },
  'confirm-move':function(el){const f=el.closest('form');if(!f) return;f.dataset.moveOk='1';if(f.id==='f-patient') savePatient(f);else if(f.id==='f-link') saveLink(f);},
  'cancel-move':function(el){const f=el.closest('form');if(f) clearMove(f);},
  'link-patients':function(el){linkForm(el.dataset.company);},
  'back-company':function(el){openCompany(el.dataset.id);},
  'open-tipo':function(el){tipoForm(el.dataset.name);},
  'do-delete-tipo':function(el){deleteTipo(el.dataset.id);closeSheet();renderAll();toast('Tipo excluído.');},
  'tipo-add':function(el){
    const box=el.closest('.tipof'),inp=$('.tipo-new input',box),sel=$('select',box),err=$('#f-err');
    const nome=addTipo(inp.value);
    if(!nome){if(err) err.textContent='Digite o nome do novo tipo.';inp.focus();return;}
    if(err) err.textContent='';
    sel.innerHTML=tipoOptions(nome);sel.value=nome;
    inp.value='';$('.tipo-new',box).hidden=true;sel.focus();
    toast('Tipo criado.');
  },
  'open-visit':function(el){openVisit(el.dataset.id);},
  'open-patient':function(el){openPatient(el.dataset.id);},
  'open-company':function(el){openCompany(el.dataset.id);},
  'edit-visit':function(el){visitForm(visitById(el.dataset.id));},
  'edit-patient':function(el){patientForm(findPatient(el.dataset.id));},
  'edit-company':function(el){companyForm(findCompany(el.dataset.id));},
  'visit-status':function(el){
    const v=resolveVisit(el.dataset.id);if(!v) return;
    v.status=el.dataset.status;commit();closeSheet();renderView();
    toast({feito:'Atendimento marcado como realizado.',cancelado:'Atendimento cancelado.',agendado:'Atendimento voltou para agendado.'}[v.status]);
  },
  'do-delete-visit':function(el){
    const gone=visitById(el.dataset.id);
    if(gone&&gone.serie){
      const pp=findPatient(gone.serie);
      if(pp){pp.recExc=pp.recExc||[];if(pp.recExc.indexOf(gone.serieData)<0) pp.recExc.push(gone.serieData);}
    }
    S.visits=S.visits.filter(v=>v.id!==el.dataset.id);
    commit();closeSheet();renderAll();toast('Atendimento excluído.');
  },
  'do-delete-patient':function(el){
    const id=el.dataset.id;
    S.patients=S.patients.filter(p=>p.id!==id);S.visits=S.visits.filter(v=>v.pacienteId!==id);
    commit();closeSheet();renderAll();toast('Paciente excluído.');
  },
  'do-delete-company':function(el){
    const id=el.dataset.id;
    S.companies=S.companies.filter(c=>c.id!==id);
    S.patients.forEach(function(p){if(p.empresaId===id) p.empresaId='';});
    if(ui.fcomp===id) ui.fcomp='all';
    commit();closeSheet();renderAll();toast('Empresa excluída.');
  },
  'ask':function(el){const c=document.getElementById(el.dataset.confirm);if(c){c.hidden=false;el.hidden=true;}},
  'unask':function(el){const c=document.getElementById(el.dataset.confirm),a=document.getElementById(el.dataset.ask);if(c) c.hidden=true;if(a) a.hidden=false;},
  'copy':function(el){copyText(el.dataset.text);},
  'clear-demo':function(){
    S.patients=S.patients.filter(x=>!x.ex);S.companies=S.companies.filter(x=>!x.ex);S.visits=S.visits.filter(x=>!x.ex);
    if(ui.fcomp!=='all'&&ui.fcomp!=='none'&&!findCompany(ui.fcomp)) ui.fcomp='all';
    commit();renderAll();toast('Exemplos apagados.');
  },
  'open-cal':function(el){const w=el.closest('.datef');if($('.cal',w).hidden) calOpen(w);else calClose(w,false);},
  'cal-nav':function(el){
    const w=el.closest('.datef'),cal=$('.cal',w);
    let y=+cal.dataset.y,m=+cal.dataset.m+Number(el.dataset.dir);
    if(m<0){m=11;y--;}else if(m>11){m=0;y++;}
    cal.dataset.y=y;cal.dataset.m=m;calRender(w);
  },
  'cal-pick':function(el){calSet(el.closest('.datef'),el.dataset.iso);},
  'cal-today':function(el){calSet(el.closest('.datef'),iso(new Date()));},
  'cal-clear':function(el){calSet(el.closest('.datef'),'');},
  'open-time':function(el){const w=el.closest('.datef');if($('.cal',w).hidden) timeOpen(w);else calClose(w,false);},
  'wheel-pick':function(el){
    const wh=el.closest('.wheel');
    wheelGo(wh,Array.prototype.indexOf.call(wh.querySelectorAll('.wi'),el),false);
  },
  'time-done':function(el){const w=el.closest('.datef');timeApply(w);calClose(w,true);},
  'close-sheet':function(){closeSheet();}
};

document.addEventListener('click',function(e){
  const el=e.target.closest('[data-action]');
  if(!el) return;
  const fn=A[el.dataset.action];
  if(fn) fn(el,e);
});
document.addEventListener('submit',function(e){
  e.preventDefault();
  const f=e.target;
  if(f.id==='f-patient') savePatient(f);
  else if(f.id==='f-company') saveCompany(f);
  else if(f.id==='f-visit') saveVisit(f);
  else if(f.id==='f-tipo') saveTipo(f);
  else if(f.id==='f-link') saveLink(f);
  else if(f.id==='f-entrar') doEntrar(f);
  else if(f.id==='f-criar') doCriar(f);
  else if(f.id==='f-reset') doReset(f);
  else if(f.id==='f-nova') doNova(f);
  else if(f.id==='f-senha') doSenha(f);
  else if(f.id==='f-perfil') saveProfile(f);
});
document.addEventListener('input',function(e){
  const t=e.target;
  if(t&&t.id==='q'){ui.q=t.value;renderPatientList();}
  if(t&&t.dataset&&t.dataset.role==='link-q'){const q=norm(t.value);document.querySelectorAll('#lk-list .lrow').forEach(function(l){l.parentNode.hidden=q&&l.dataset.n.indexOf(q)<0;});}
  else if(t&&t.dataset&&t.dataset.kind==='time'){
    maskTime(t);
    const w=t.closest('.datef');
    if(!$('.cal',w).hidden&&parseTime(t.value)) timeSync(w);
  }
  else if(t&&t.dataset&&t.dataset.kind==='date'){
    maskDate(t);
    const w=t.closest('.datef'),cal=$('.cal',w);
    if(!cal.hidden){
      const i=brToIso(t.value);
      if(i){const d=fromIso(i);cal.dataset.y=d.getFullYear();cal.dataset.m=d.getMonth();}
      calRender(w);
    }
  }
});
document.addEventListener('change',function(e){
  const t=e.target;
  if(t&&t.dataset&&t.dataset.role==='import-file'){const f=t.files&&t.files[0];t.value='';readBackupFile(f);return;}
  if(t&&t.dataset&&t.dataset.role==='rep-emp'){
    ui.rep.emp=t.value;
    const p=findPatient(ui.rep.pac);
    if(p&&ui.rep.emp!=='all'&&(ui.rep.emp==='none'?!noCompany(p):p.empresaId!==ui.rep.emp)) ui.rep.pac='all';
    repRender('r-emp');
  }
  if(t&&t.dataset&&t.dataset.role==='rep-pac'){ui.rep.pac=t.value;repRender('r-pac');}
  if(t&&t.name==='empresaId'){const f=t.closest('form');if(f) clearMove(f);}
  if(t&&t.dataset&&t.dataset.kind==='tipo'){
    const box=$('.tipo-new',t.closest('.tipof')),show=t.value==='__novo';
    box.hidden=!show;
    if(show){const i=$('input',box);if(i) i.focus();}
  }
});
document.addEventListener('keydown',function(e){
  const t=e.target;
  if(e.key==='Enter'&&t&&t.dataset&&t.dataset.role==='tipo-new'){e.preventDefault();A['tipo-add'](t);return;}
  if(e.key==='Escape'){
    const open=Array.prototype.find.call(document.querySelectorAll('.datef'),w=>!$('.cal',w).hidden);
    if(open){calClose(open,true);return;}
    if($('#sheet-root').firstChild) closeSheet();
    return;
  }
  if(t&&t.classList&&t.classList.contains('cal-day')){
    const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];
    if(step){
      const items=Array.prototype.slice.call(t.parentNode.querySelectorAll('.cal-day'));
      const nx=items[items.indexOf(t)+step];
      if(nx){e.preventDefault();nx.focus();}
    }
  }
  if(t&&t.classList&&t.classList.contains('wheel')){
    const step={ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5}[e.key];
    if(step){e.preventDefault();wheelGo(t,wheelIdx(t)+step,true);}
    else if(e.key==='Home'){e.preventDefault();wheelGo(t,0,true);}
    else if(e.key==='End'){e.preventDefault();wheelGo(t,99,true);}
  }
});

/* ---------- início ---------- */
boot();
