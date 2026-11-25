/* Cliente do Supabase: login, sessão e renovação do token. Só com fetch: nenhum código de terceiros roda na página.
   A chave é a chave PÚBLICA do projeto. Quem protege os dados é o banco (RLS): cada linha só pode ser lida e alterada pelo usuário dono dela.
   fetch, armazenamento e relógio entram como argumento (nos testes são falsos). */
export const nowSec=()=>Math.floor(Date.now()/1000);
export const SB_ERR={
  invalid_credentials:'E-mail ou senha incorretos.',
  email_not_confirmed:'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  weak_password:'Senha fora das regras. Use pelo menos 8 caracteres, com letras maiúsculas e minúsculas, números e símbolos, e evite senhas comuns.',
  over_request_rate_limit:'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  over_email_send_rate_limit:'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  signup_disabled:'Novos cadastros estão desativados.',
  same_password:'A nova senha precisa ser diferente da atual.',
  user_banned:'Esta conta está bloqueada.'
};
export function errMsg(e,fallback){
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
/* Link do e-mail (confirmação, recuperação de senha): a sessão vem no #fragmento. Limpa o endereço e devolve os dados. */
export function readHashSession(loc,hist){
  const h=loc.hash.replace(/^#/,'');
  if(!h) return null;
  const p=new URLSearchParams(h);
  if(!p.has('access_token')&&!p.has('error')) return null;
  try{hist.replaceState(null,'',loc.pathname+loc.search);}catch(e){}
  if(p.has('error')) return {error:String(p.get('error_description')||p.get('error')).slice(0,200)};
  return {access_token:p.get('access_token'),refresh_token:p.get('refresh_token')||'',expires_in:p.get('expires_in'),expires_at:p.get('expires_at'),type:p.get('type')};
}
/* cfg = {url,key,sesKey,fetchFn(url,opcoes),storage:{session(),local()},now()}. A sessão fica dentro do cliente (cliente.ses). */
export function createClient(cfg){
  const SB_URL=cfg.url,SB_KEY=cfg.key,SB_SES=cfg.sesKey,fetchFn=cfg.fetchFn,storage=cfg.storage,clock=cfg.now||nowSec;
  let ses=null, refreshing=null;
  function readSes(){
    const list=[[storage.session(),false],[storage.local(),true]];
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
    ses={access_token:d.access_token,refresh_token:String(d.refresh_token||''),expires_at:Number(d.expires_at)||(clock()+(Number(d.expires_in)||3600)),
      user:{id:String(u.id||''),email:String(u.email||'').slice(0,200),nome:typeof md.nome==='string'?md.nome.slice(0,80):''},persist:!!persist};
    try{
      (persist?storage.local():storage.session()).setItem(SB_SES,JSON.stringify(ses));
      (persist?storage.session():storage.local()).removeItem(SB_SES);
    }catch(e){}
  }
  function clearSes(){
    ses=null;
    try{storage.session().removeItem(SB_SES);}catch(e){}
    try{storage.local().removeItem(SB_SES);}catch(e){}
  }
  async function api(path,o){
    o=o||{};
    const useAuth=o.auth!==false;
    if(useAuth){
      if(!ses) throw {code:'expired'};
      if(ses.expires_at-clock()<60) await refreshSes();
    }
    const h={apikey:SB_KEY};
    if(o.body!==undefined) h['Content-Type']='application/json';
    if(useAuth) h.Authorization='Bearer '+ses.access_token;
    if(o.prefer) h.Prefer=o.prefer;
    let r,t;
    try{
      r=await fetchFn(SB_URL+path,{method:o.method||'GET',headers:h,body:o.body===undefined?undefined:JSON.stringify(o.body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
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
  async function sbSignIn(email,pw,persist){
    const d=await api('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:email,password:pw}});
    storeSes(d,persist);
  }
  async function sbSignUp(nome,email,pw,persist){
    const d=await api('/auth/v1/signup',{method:'POST',auth:false,body:{email:email,password:pw,data:{nome:nome}}});
    if(d&&typeof d.access_token==='string'){storeSes(d,persist);return true;}
    return false;
  }
  return {get ses(){return ses;},setSession(s){ses=s;},readSes,storeSes,clearSes,api,refreshSes,sbSignIn,sbSignUp};
}
