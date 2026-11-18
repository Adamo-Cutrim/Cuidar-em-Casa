import re, os, sys, json
# Gera a pasta site/ (versão independente, ligada ao Supabase) a partir do HTML da v14.
# Uso: python3 fonte-e-ferramentas/build_site.py [ORIGEM.html] [PASTA_SAIDA]
AQUI = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, 'cuidar-em-casa.html')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(AQUI, '..', 'site')
SB_URL = 'https://ynbqblvdtgwabczbssfp.supabase.co'
SB_KEY = 'sb_publishable_Tuay0Raxi1UIqQLi1pNrcA_hqdThXOV'

s = open(SRC, encoding='utf-8').read()
css = s[s.index('<style>') + 7:s.index('</style>')]
body = s[s.index('</style>') + 8:s.index('<script>')]
js = s[s.index('<script>') + 8:s.rindex('</script>')]

def once(t, a):
    assert t.count(a) == 1, ('not unique/missing', a[:70], t.count(a))
    return t.index(a)

def cut(t, a, b, new):
    i = once(t, a); j = t.index(b, i)
    return t[:i] + new + t[j:]

def rep(t, a, b):
    once(t, a)
    return t.replace(a, b)

# ---------- 0. ids: uuid v4 (o banco usa uuid como chave) ----------
js = cut(js, "const uid=()=>{", "const BRL=", r'''const uid=()=>{
  if(crypto.randomUUID) return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const x=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
  return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20);
};
''')

# ---------- 1. constantes e estado ----------
NEW_CONSTS = r'''const HIDE_KEY='cuidar-em-casa:ocultar-valores';
const SB_URL='__SB_URL__', SB_KEY='__SB_KEY__', SB_SES='cuidar-em-casa:sb';
let S=null, hide=false, saveTimer=null, retryTimer=null, retryN=0, failToast=false, writing=false, dirty=false, dbMode='conta', lastLoad=0;
const ui={tab:'agenda',weekStart:iso(startOfWeek(new Date())),day:iso(new Date()),q:'',fcomp:'all'};
const auth={conta:null,logged:false,mode:'',msg:'',email:''};
function readSess(k){try{return sessionStorage.getItem(k);}catch(e){return null;}}
function writeSess(k,v){try{sessionStorage.setItem(k,v);}catch(e){}}
function delLocal(k){try{localStorage.removeItem(k);}catch(e){}}
function delSess(k){try{sessionStorage.removeItem(k);}catch(e){}}
function readLocal(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function writeLocal(k,v){try{localStorage.setItem(k,v);}catch(e){}}'''.replace('__SB_URL__', SB_URL).replace('__SB_KEY__', SB_KEY)
js = cut(js, "const KEY='cuidar-em-casa:v1'", "/* Tudo que vem de fora", NEW_CONSTS + "\n")

js = rep(js, "perfil:{tel:TXT(pf.tel,60)", "perfil:{nome:TXT(pf.nome,80),tel:TXT(pf.tel,60)")

# ---------- 2. conexao, sincronizacao ----------
SYNC = r'''function initState(){
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

/* ---------- dados: carregar do banco e gravar só o que mudou ----------
   Esquema normalizado (backend/BACKEND.md §9): uma tabela por entidade, ids uuid e colunas próprias.
   O estado S continua no formato da v14; este bloco traduz S para as linhas do banco e de volta.
   Dados de exemplo (ex:true) nunca vão para o banco (ESTRUTURA_BASE §7, regra 9). */
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isUuid=s=>typeof s==='string'&&UUID_RE.test(s);
/* Id que não é uuid (ex.: ocorrência recorrente que virou registro, "r-{paciente}-{data}") ganha um uuid fixo,
   calculado do id e do usuário: é sempre a mesma linha no banco e não colide com a de outro usuário. */
function hashUuid(s){
  const h=[0x811c9dc5,0x01000193,0x9e3779b9,0x85ebca6b];
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    for(let k=0;k<4;k++) h[k]=Math.imul(h[k]^c,0x01000193+0x2000*k)>>>0;
  }
  for(let k=0;k<4;k++){let x=h[k]^h[(k+1)%4];x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);h[k]=(x^(x>>>16))>>>0;}
  const x=h.map(n=>n.toString(16).padStart(8,'0')).join('');
  return x.slice(0,8)+'-'+x.slice(8,12)+'-5'+x.slice(13,16)+'-'+(8|(parseInt(x.charAt(16),16)&3)).toString(16)+x.slice(17,20)+'-'+x.slice(20,32);
}
const dbId=id=>isUuid(id)?id:hashUuid(ses.user.id+'|'+id);
const tipoKey=n=>String(n).trim().toLowerCase();
const dbTime=h=>typeof h==='string'?h.slice(0,5):'';
const T_ORDER=['companies','patients','visits','recurrences','recurrence_exceptions','service_types'];
const T_CONFLICT={companies:'id',patients:'id',visits:'id',recurrences:'patient_id',recurrence_exceptions:'patient_id,data',service_types:'id'};
const emptySnap=()=>({companies:new Map(),patients:new Map(),visits:new Map(),recurrences:new Map(),recurrence_exceptions:new Map(),service_types:new Map(),perfil:''});
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
function profRow(){
  const p=S.perfil||{};
  return {nome:p.nome||'',tel:p.tel||'',profissao:p.profissao||'',registro:p.registro||'',cidade:p.cidade||'',iniciado:true};
}
/* O que o banco deveria ter agora, tabela por tabela: Map(chave -> linha). Toda linha de uma tabela tem as mesmas colunas. */
function desiredRows(){
  const uid=ses.user.id,D={};
  T_ORDER.forEach(function(t){D[t]=new Map();});
  const comps=new Set();
  S.companies.forEach(function(c){
    if(c.ex) return;
    const id=dbId(c.id);comps.add(c.id);
    D.companies.set(id,{id:id,user_id:uid,nome:c.nome,tipo:c.tipo||'',contato:c.contato||'',valor_padrao:c.valorPadrao==null?null:c.valorPadrao,pagamento:c.pagamento||'',obs:c.obs||'',cor:c.cor||0});
  });
  const pats=new Set();
  S.patients.forEach(function(p){
    if(p.ex) return;
    const id=dbId(p.id);pats.add(p.id);
    D.patients.set(id,{id:id,user_id:uid,company_id:p.empresaId&&comps.has(p.empresaId)?dbId(p.empresaId):null,nome:p.nome,nasc:p.nasc||null,tel:p.tel||'',
      resp_nome:p.respNome||'',resp_tel:p.respTel||'',endereco:p.endereco||'',bairro:p.bairro||'',ref:p.ref||'',valor:p.valor==null?null:p.valor,
      condicoes:p.condicoes||'',alergias:p.alergias||'',medicamentos:p.medicamentos||'',obs:p.obs||''});
    const r=p.rec;
    if(r) D.recurrences.set(id,{patient_id:id,user_id:uid,ativo:!!r.ativo,dias:r.dias.slice(),hora:r.hora,tipo:r.tipo||'',inicio:r.inicio,fim:r.fim||null});
    (p.recExc||[]).forEach(function(d){D.recurrence_exceptions.set(id+'|'+d,{patient_id:id,user_id:uid,data:d});});
  });
  S.visits.forEach(function(v){
    if(v.ex||v.virtual||!pats.has(v.pacienteId)) return;
    const id=dbId(v.id);
    D.visits.set(id,{id:id,user_id:uid,patient_id:dbId(v.pacienteId),data:v.date,hora:v.hora,tipo:v.tipo||'',obs:v.obs||'',status:v.status,
      serie_data:v.serie===v.pacienteId&&v.serieData?v.serieData:null,manual:!!v.manual});
  });
  if(Array.isArray(S.tipos)) S.tipos.forEach(function(n){
    const k=tipoKey(n);
    if(!k||D.service_types.has(tipoIds.get(k)||hashUuid(uid+'|tipo|'+k))) return;
    const id=tipoIds.get(k)||hashUuid(uid+'|tipo|'+k);
    D.service_types.set(id,{id:id,user_id:uid,nome:String(n).trim()});
  });
  return D;
}
function takeSnap(){
  const D=desiredRows();snap=emptySnap();
  T_ORDER.forEach(function(t){D[t].forEach(function(row,k){snap[t].set(k,JSON.stringify(row));});});
  snap.perfil=JSON.stringify(profRow());
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
  const p=(Array.isArray(r[0])&&r[0][0])||null;
  const recs=new Map(),excs=new Map();
  r[4].forEach(function(x){recs.set(x.patient_id,{ativo:x.ativo,dias:x.dias,hora:dbTime(x.hora),tipo:x.tipo,inicio:x.inicio,fim:x.fim||''});});
  r[5].forEach(function(x){if(!excs.has(x.patient_id)) excs.set(x.patient_id,[]);excs.get(x.patient_id).push(x.data);});
  tipoIds=new Map();r[6].forEach(function(x){tipoIds.set(tipoKey(x.nome),x.id);});
  const raw={
    companies:r[1].map(x=>({id:x.id,nome:x.nome,tipo:x.tipo,contato:x.contato,valorPadrao:x.valor_padrao,pagamento:x.pagamento,obs:x.obs,cor:x.cor})),
    patients:r[2].map(function(x){
      const o={id:x.id,nome:x.nome,nasc:x.nasc||'',tel:x.tel,respNome:x.resp_nome,respTel:x.resp_tel,endereco:x.endereco,bairro:x.bairro,ref:x.ref,
        empresaId:x.company_id||'',valor:x.valor,condicoes:x.condicoes,alergias:x.alergias,medicamentos:x.medicamentos,obs:x.obs};
      if(recs.has(x.id)) o.rec=recs.get(x.id);
      if(excs.has(x.id)) o.recExc=excs.get(x.id);
      return o;
    }),
    visits:r[3].map(function(x){
      const o={id:x.id,pacienteId:x.patient_id,date:x.data,hora:dbTime(x.hora),tipo:x.tipo,obs:x.obs,status:x.status};
      if(x.serie_data){o.serie=x.patient_id;o.serieData=x.serie_data;}
      if(x.manual) o.manual=true;
      return o;
    }),
    rev:0,
    perfil:p?{nome:p.nome,tel:p.tel,profissao:p.profissao,registro:p.registro,cidade:p.cidade}:{},
    tipos:r[6].length?r[6].map(x=>x.nome):undefined
  };
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
const inList=a=>'in.('+a.map(encodeURIComponent).join(',')+')';
async function sendDeletes(t,keys){
  if(!keys.length) return;
  if(t==='recurrence_exceptions'){
    const byP=new Map();
    keys.forEach(function(k){const i=k.indexOf('|'),pid=k.slice(0,i);if(!byP.has(pid)) byP.set(pid,[]);byP.get(pid).push(k);});
    for(const [pid,ks] of byP){
      for(let i=0;i<ks.length;i+=100){
        const part=ks.slice(i,i+100);
        await api('/rest/v1/'+t+'?patient_id=eq.'+pid+'&data='+inList(part.map(k=>k.slice(k.indexOf('|')+1))),{method:'DELETE',prefer:'return=minimal'});
        part.forEach(function(k){snap[t].delete(k);});
      }
    }
    return;
  }
  const col=t==='recurrences'?'patient_id':'id';
  for(let i=0;i<keys.length;i+=100){
    const part=keys.slice(i,i+100);
    await api('/rest/v1/'+t+'?'+col+'='+inList(part),{method:'DELETE',prefer:'return=minimal'});
    part.forEach(function(k){snap[t].delete(k);});
  }
}
async function sendUpserts(t,list){
  for(let i=0;i<list.length;i+=200){
    const part=list.slice(i,i+200);
    await api('/rest/v1/'+t+'?on_conflict='+T_CONFLICT[t],{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:part.map(x=>x.row)});
    part.forEach(function(x){snap[t].set(x.k,x.json);});
  }
}
async function pushAll(){
  const uid=ses.user.id;
  const pj=JSON.stringify(profRow());
  if(pj!==snap.perfil){
    await api('/rest/v1/profiles?on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:Object.assign({user_id:uid},profRow())});
    snap.perfil=pj;
  }
  const D=desiredRows(),up={},del={};
  T_ORDER.forEach(function(t){
    up[t]=[];del[t]=[];
    D[t].forEach(function(row,k){const j=JSON.stringify(row);if(snap[t].get(k)!==j) up[t].push({k:k,row:row,json:j});});
    snap[t].forEach(function(j,k){if(!D[t].has(k)) del[t].push(k);});
  });
  /* Ordem pensada para as chaves estrangeiras e unicidades: primeiro some o que saiu dos filhos,
     depois grava pais antes de filhos, e por fim apaga pacientes e empresas (o banco cuida das cascatas). */
  for(const t of ['recurrence_exceptions','recurrences','visits','service_types']) await sendDeletes(t,del[t]);
  for(const t of T_ORDER) await sendUpserts(t,up[t]);
  await sendDeletes('patients',del.patients);
  await sendDeletes('companies',del.companies);
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

'''
js = cut(js, "function initState(){", "/* ---------- relatório de faturamento", SYNC)
js = rep(js, "let dlRef=null;", "let dlRef={save:function(o){dlFile(o.filename,o.data,'text/csv');return Promise.resolve();}};")

# ---------- 3. conta e acesso ----------
i0 = once(js, "/* ---------- conta e acesso")
keep_helpers = js[js.index("function setBusy("):js.index("function renderGate(){")]
keep_show = js[js.index("function showGate(mode){"):js.index("function decideGate(){")]
keep_unlock = js[js.index("function unlock(){"):js.index("function entrar(manter){")]
keep_regra = js[js.index("function senhaRegra("):js.index("async function doEntrar(")]

AUTH = r'''/* ---------- conta e acesso ----------
   O login é do Supabase Auth: a senha nunca fica neste aparelho nem neste código. */
const normEmail=v=>String(v||'').trim().toLowerCase();
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)&&v.length<=200;
__HELPERS__
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
__SHOW__
__UNLOCK__
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
__REGRA__
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
'''
AUTH = AUTH.replace('__HELPERS__', keep_helpers).replace('__SHOW__', keep_show).replace('__UNLOCK__', keep_unlock).replace('__REGRA__', keep_regra)
js = js[:i0] + AUTH + js[js.index("function openMenu(){"):]

# ---------- 4. perfil, senha, backup ----------
js = cut(js, "function saveProfile(f){", "function openSoon(", r'''function saveProfile(f){
  const nome=cleanName(fv(f,'nome'));
  if(!nome) return fail(f,'Informe seu nome.','nome');
  S.perfil={nome:nome,tel:cleanName(fv(f,'tel')),profissao:cleanName(fv(f,'profissao')),registro:cleanName(fv(f,'registro')),cidade:cleanName(fv(f,'cidade'))};
  if(auth.conta) auth.conta.nome=nome;
  commit();closeSheet(true);lastFocus=null;
  toast('Perfil atualizado.');
}
''')
js = rep(js, "    '<div class=\"sec\"><h3>Segurança</h3>",
        "    '<div class=\"sec\"><h3>Seus dados</h3><p class=\"hint\">O backup é um arquivo com todos os seus pacientes, empresas e atendimentos. Guarde em local seguro: ele não tem senha.</p><div class=\"sheet-actions\"><button type=\"button\" class=\"btn\" data-action=\"backup\">'+ic('download')+'Baixar backup (JSON)</button></div></div>'+\n    '<div class=\"sec\"><h3>Segurança</h3>")
js = cut(js, "async function doSenha(f){", "/* ---------- consultas", r'''async function doSenha(f){
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

''')

# ---------- 5. acoes e envio de formularios ----------
js = rep(js, "  'auth-forgot':function(){showGate('reset');},",
         "  'auth-forgot':function(){showGate('reset');},\n  'auth-create':function(){showGate('criar');},\n  'auth-retry':function(){boot();},")
js = rep(js, "  'logout':function(){sair();},",
         "  'logout':function(){sair();},\n  'backup':function(){\n    const o={app:'cuidar-em-casa',versao:1,exportadoEm:new Date().toISOString(),perfil:S.perfil,tipos:S.tipos||null,empresas:S.companies,pacientes:S.patients,atendimentos:S.visits};\n    dlFile('cuidar-em-casa_backup_'+iso(new Date())+'.json',JSON.stringify(o,null,2),'application/json');\n    toast('Backup baixado.');\n  },")
js = rep(js, "  else if(f.id==='f-reset') doReset(f);", "  else if(f.id==='f-reset') doReset(f);\n  else if(f.id==='f-nova') doNova(f);")

# ---------- 6. inicio ----------
js = cut(js, "initState();\ntry{if(window.claude", "})();", "boot();\n")

# conferencias: nada do modelo antigo pode sobrar
for bad in ['window.claude', 'dbRef', 'contaRef', 'saveConta', 'validConta', 'decideGate', 'lockLeft', 'CONTA_KEY', 'MANTER_KEY', 'TENT_KEY', 'hashPw', 'makeConta', 'checkPw', 'cryptoOk', 'dataBytes', 'tooBig', 'localStorage.setItem(KEY', "readLocal(KEY"]:
    assert bad not in js, ('sobrou', bad)

# ---------- css ----------
css = '[hidden]{display:none!important}\n' + css

# ---------- index.html ----------
head = '''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#F1F6F4">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Cuidar em Casa">
<title>Cuidar em Casa</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
'''
index = head + body.strip() + '\n<script src="/app.js"></script>\n</body>\n</html>\n'

manifest = {"name": "Cuidar em Casa", "short_name": "Cuidar", "description": "Agenda, pacientes e faturamento de atendimentos domiciliares.",
            "lang": "pt-BR", "start_url": "/", "scope": "/", "display": "standalone", "orientation": "portrait",
            "background_color": "#F1F6F4", "theme_color": "#1E7468",
            "icons": [{"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"}]}
icon = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#1E7468"/><g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 47l28-24 28 24M26 43v28h44V43M42 71V54h12v17"/></g></svg>
'''
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
       "img-src 'self' data:; connect-src " + SB_URL + "; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'")
vercel = {"cleanUrls": True, "headers": [{"source": "/(.*)", "headers": [
    {"key": "Content-Security-Policy", "value": CSP},
    {"key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains"},
    {"key": "X-Content-Type-Options", "value": "nosniff"},
    {"key": "X-Frame-Options", "value": "DENY"},
    {"key": "Referrer-Policy", "value": "no-referrer"},
    {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
    {"key": "Cross-Origin-Opener-Policy", "value": "same-origin"}]}]}

os.makedirs(OUT, exist_ok=True)
w = lambda n, t: open(os.path.join(OUT, n), 'w', encoding='utf-8').write(t)
w('index.html', index); w('app.js', '(function(){\n' + js.strip().rstrip() + '\n') if False else None
js = js.replace('[\u0300-\u036f]', '[\\u0300-\\u036f]').replace("'\ufeff'", "'\\ufeff'")
open(os.path.join(OUT, 'app.js'), 'w', encoding='utf-8').write(js)
w('styles.css', css); w('manifest.webmanifest', json.dumps(manifest, ensure_ascii=False, indent=1)); w('icon.svg', icon)
w('vercel.json', json.dumps(vercel, indent=1))
print({n: os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT)})
