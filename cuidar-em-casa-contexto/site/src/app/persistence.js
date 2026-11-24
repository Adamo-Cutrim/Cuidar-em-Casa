/* Carregar e salvar na conta: estado inicial, foto do banco, gravação com novas tentativas, saída por inatividade. */
import {cleanName} from '../core/text.js';
import {dbId as rowDbId,desiredRows,profRow,rowsToRaw} from '../data/rows.js';
import {emptySnap,pushAll as syncPush,snapshotOf} from '../data/sync.js';
import {normalize} from '../domain/validation.js';
import {sair} from '../ui/account.js';
import {$} from '../ui/dom.js';
import {toast} from '../ui/sheet.js';
import {renderAll} from '../ui/views.js';
import {makeDemo} from './catalog.js';
import {SB,api} from './session.js';
import {HIDE_KEY,auth,readLocal} from './state.js';
import {st} from './store.js';
export function initState(){
  st.hide=readLocal(HIDE_KEY)==='1';
  st.S=makeDemo();
}
const pending=()=>!!(st.saveTimer||st.writing||st.dirty);
function setMode(m){
  st.dbMode=m;
  const f=$('#foot');if(f) f.textContent=statusText();
}
export function statusText(){
  if(!st.S||!st.S.persisted) return 'Dados de exemplo. Nada foi salvo ainda.';
  if(st.dbMode==='salvando') return 'Salvando…';
  if(st.dbMode==='erro') return 'Não foi possível salvar agora. Tentando de novo…';
  if(st.dbMode==='recusado') return 'O servidor recusou salvar um dado. Revise o último campo editado.';
  return 'Dados privados, salvos na sua conta.';
}

/* Mapeamento estado <-> linhas e envio ficam em src/data/ (v17). Aqui só ligam ao estado da tela (S), à sessão (SB.ses) e à rede (api). */
export function dbId(id){return rowDbId(SB.ses.user.id,id);}
function takeSnap(){st.snap=snapshotOf(desiredRows(st.S,SB.ses.user.id,st.tipoIds),profRow(st.S.perfil));}
function pushAll(){return syncPush(api,SB.ses.user.id,st.S,st.snap,st.tipoIds);}
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
export async function loadAll(){
  const r=await Promise.all([
    api('/rest/v1/profiles?select=nome,tel,profissao,registro,cidade,iniciado&limit=1'),
    fetchAll('companies','id,nome,tipo,contato,valor_padrao,pagamento,obs,cor','id'),
    fetchAll('patients','id,company_id,nome,nasc,tel,resp_nome,resp_tel,endereco,bairro,ref,valor,condicoes,alergias,medicamentos,obs','id'),
    fetchAll('visits','id,patient_id,data,hora,tipo,obs,status,serie_data,manual,valor_snapshot','data,id'),
    fetchAll('recurrences','patient_id,ativo,dias,hora,tipo,inicio,fim','patient_id'),
    fetchAll('recurrence_exceptions','patient_id,data','patient_id,data'),
    fetchAll('service_types','id,nome','created_at,id')
  ]);
  const conv=rowsToRaw({profile:r[0],companies:r[1],patients:r[2],visits:r[3],recurrences:r[4],exceptions:r[5],serviceTypes:r[6]});
  const raw=conv.raw,p=conv.p;st.tipoIds=conv.tipoIds;
  const semDados=!raw.companies.length&&!raw.patients.length&&!raw.visits.length;
  st.snap=emptySnap();
  if(semDados&&!(p&&p.iniciado)){
    st.S=makeDemo();st.S.perfil={nome:'',tel:'',profissao:'',registro:'',cidade:''};
  }else{
    st.S=normalize(raw);
    takeSnap();
  }
  if(!st.S.perfil.nome) st.S.perfil.nome=cleanName(SB.ses.user.nome)||SB.ses.user.email.split('@')[0];
  auth.conta={nome:st.S.perfil.nome,email:SB.ses.user.email};
  st.lastLoad=Date.now();
}
export function commit(){
  st.S.persisted=true;st.S.rev=(st.S.rev||0)+1;
  setMode('salvando');
  scheduleSave();
}
function scheduleSave(){clearTimeout(st.saveTimer);st.saveTimer=setTimeout(flush,400);}
async function flush(){
  st.saveTimer=null;
  if(!auth.logged||!st.S||!st.S.persisted||!SB.ses) return;
  if(st.writing){st.dirty=true;return;}
  st.writing=true;
  try{
    do{st.dirty=false;await pushAll();}while(st.dirty);
    st.retryN=0;st.failToast=false;clearTimeout(st.retryTimer);
    setMode('conta');
  }catch(e){
    if(e&&e.code==='expired'){st.writing=false;sair('Sua sessão expirou. Entre de novo. As últimas alterações podem não ter sido salvas.',true);return;}
    const permanente=e&&e.code==='http'&&e.status>=400&&e.status<500&&e.status!==408&&e.status!==429;
    if(permanente){
      setMode('recusado');
      toast('O servidor recusou salvar. Revise o último dado editado.');
    }else{
      setMode('erro');
      if(!st.failToast){st.failToast=true;toast('Não foi possível salvar. Vamos tentar de novo.');}
      clearTimeout(st.retryTimer);
      st.retryTimer=setTimeout(scheduleSave,Math.min(30000,2000*Math.pow(2,st.retryN++)));
    }
  }
  st.writing=false;
}
export async function esperaGravar(){
  for(let i=0;i<50&&st.writing;i++) await new Promise(function(r){setTimeout(r,100);});
  if(st.saveTimer){clearTimeout(st.saveTimer);await flush();}
}
async function refreshData(){
  try{await loadAll();renderAll();}
  catch(e){if(e&&e.code==='expired') sair('Sua sessão expirou. Entre de novo.',true);}
}
document.addEventListener('visibilitychange',function(){
  if(!auth.logged) return;
  if(document.visibilityState==='hidden'){if(st.saveTimer){clearTimeout(st.saveTimer);flush();}return;}
  if(Date.now()-st.lastLoad>30000&&!pending()&&!$('#sheet-root').firstChild) refreshData();
});
window.addEventListener('online',function(){if(auth.logged&&st.dbMode==='erro') scheduleSave();});
window.addEventListener('beforeunload',function(e){if(auth.logged&&pending()){e.preventDefault();e.returnValue='';}});

/* Quem não escolheu "manter conectado" sai sozinho depois de 15 minutos sem uso. */
export let idleT=null;
const IDLE_MS=15*60*1000;
export function bumpIdle(){
  clearTimeout(idleT);
  if(!auth.logged||!SB.ses||SB.ses.persist) return;
  idleT=setTimeout(function(){
    if(pending()){bumpIdle();return;}
    sair('Você saiu por inatividade. Entre de novo para continuar.');
  },IDLE_MS);
}
['pointerdown','keydown','touchstart','scroll'].forEach(function(ev){document.addEventListener(ev,bumpIdle,{passive:true,capture:true});});
