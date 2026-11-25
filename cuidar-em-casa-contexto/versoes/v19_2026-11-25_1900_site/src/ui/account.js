/* Conta e acesso: entrar, criar conta, recuperar senha, menu, perfil, trocar senha, sair. */
import {makeDemo} from '../app/catalog.js';
import {tiposList} from '../app/model.js';
import {bumpIdle,commit,esperaGravar,idleT,initState,loadAll} from '../app/persistence.js';
import {SB,api,clearSes,readSes,sbSignIn,sbSignUp,storeSes} from '../app/session.js';
import {auth,ui} from '../app/state.js';
import {st} from '../app/store.js';
import {LIM} from '../core/limits.js';
import {cleanName,esc,initials} from '../core/text.js';
import {errMsg,nowSec,readHashSession} from '../data/supabase.js';
import {emptySnap} from '../data/sync.js';
import {$,ic} from './dom.js';
import {fail,val} from './forms.js';
import {closeSheet,openSheet,toast} from './sheet.js';
import {renderAll} from './views.js';
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
      '<form id="f-nova" class="gate-form" novalidate>'+pwField('a-senha','senha','Nova senha','new-password')+'<p class="hint">Use pelo menos 8 caracteres, com letras maiúsculas e minúsculas, números e símbolos.</p>'+pwField('a-conf','conf','Repita a nova senha','new-password')+
      '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Salvar nova senha</button></div></form>';
  }else if(m==='criar'){
    h+='<h1 id="gate-h" tabindex="-1">Criar conta</h1><p class="sub">Crie uma conta para guardar os dados dos seus pacientes com segurança.</p>'+
      '<form id="f-criar" class="gate-form" novalidate><label for="a-nome">Seu nome</label><input id="a-nome" name="nome" autocomplete="name" maxlength="80">'+
      '<label for="a-email">E-mail</label><input id="a-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" maxlength="120">'+
      pwField('a-senha','senha','Senha','new-password')+'<p class="hint">Use pelo menos 8 caracteres, com letras maiúsculas e minúsculas, números e símbolos.</p>'+
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
export function showGate(mode){
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
export async function boot(){
  initState();
  showGate('wait');
  const hs=readHashSession(location,history);
  try{
    if(hs&&hs.error){auth.msg='O link não é mais válido. Peça um novo ou entre com sua senha.';}
    else if(hs&&hs.access_token){
      SB.setSession({access_token:hs.access_token,refresh_token:hs.refresh_token,expires_at:Number(hs.expires_at)||(nowSec()+(Number(hs.expires_in)||3600)),user:{id:'',email:'',nome:''},persist:false});
      const u=await api('/auth/v1/user');
      storeSes({access_token:SB.ses.access_token,refresh_token:SB.ses.refresh_token,expires_at:SB.ses.expires_at,user:u},false);
      if(hs.type==='recovery'){showGate('nova');return;}
    }else{
      const r=readSes();
      if(r) SB.setSession(r);
    }
    if(SB.ses){await entrarComSessao();return;}
  }catch(e){
    if(e&&e.code==='network'){auth.msg=errMsg(e);return showGate('erro');}
    clearSes();
  }
  showGate('entrar');
}
export async function sair(msg,semGravar){
  closeSheet(true);
  clearTimeout(idleT);clearTimeout(st.retryTimer);
  if(!semGravar&&auth.logged&&SB.ses){try{await esperaGravar();}catch(e){}}
  clearTimeout(st.saveTimer);st.saveTimer=null;
  if(SB.ses){try{await api('/auth/v1/logout?scope=local',{method:'POST'});}catch(e){}}
  clearSes();
  auth.logged=false;auth.mode='';auth.conta=null;auth.msg=typeof msg==='string'?msg:'';
  st.S=makeDemo();st.snap=emptySnap();
  ui.tab='agenda';ui.q='';ui.fcomp='all';
  ['#top','#view','#tabs','#fab'].forEach(function(s){const e=$(s);if(e) e.innerHTML='';});
  showGate('entrar');
}
function senhaRegra(s1,s2){
  if(s1.length<8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if(s1!==s2) return 'As duas senhas não são iguais.';
  return '';
}

export async function doEntrar(f){
  const email=normEmail(fv(f,'email')),pw=fv(f,'senha');
  if(!email) return fail(f,'Informe o e-mail da sua conta.','email');
  if(!pw) return fail(f,'Informe a senha.','senha');
  setBusy(f,true);
  try{await sbSignIn(email,pw,!!(f.elements.manter&&f.elements.manter.checked));}
  catch(e){setBusy(f,false);return fail(f,errMsg(e,'Não foi possível entrar. Tente de novo.'),'senha');}
  await entrarComSessao();
}
export async function doCriar(f){
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
export async function doReset(f){
  const email=normEmail(fv(f,'email'));
  if(!emailOk(email)) return fail(f,'Informe um e-mail válido, como nome@exemplo.com.','email');
  setBusy(f,true);
  try{
    await api('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+'/'),{method:'POST',auth:false,body:{email:email}});
  }catch(e){setBusy(f,false);return fail(f,errMsg(e,'Não foi possível enviar o link. Tente de novo.'),'email');}
  auth.msg='Se esse e-mail tiver uma conta, enviamos um link para criar uma nova senha. Olhe também a caixa de spam.';
  showGate('entrar');
}
export async function doNova(f){
  const s1=fv(f,'senha'),s2=fv(f,'conf');
  const r=senhaRegra(s1,s2);if(r) return fail(f,r,'senha');
  setBusy(f,true);
  try{await api('/auth/v1/user',{method:'PUT',body:{password:s1}});}
  catch(e){setBusy(f,false);return fail(f,errMsg(e,'Não foi possível salvar a nova senha. Peça um novo link.'),'senha');}
  await entrarComSessao();
  toast('Senha redefinida.');
}
export function openMenu(){
  const c=auth.conta,nt=tiposList().length;
  const row=(go,icon,nome,sub)=>'<li><button type="button" class="row" data-action="menu-go" data-go="'+go+'"><span class="mi">'+ic(icon)+'</span><span class="row-main"><span class="row-name">'+nome+'</span><span class="row-sub">'+sub+'</span></span><span class="go">'+ic('right')+'</span></button></li>';
  const b=(c?'<div class="sum"><span class="av c0" aria-hidden="true">'+esc(initials(c.nome))+'</span><div><h3 class="sum-name">'+esc(c.nome)+'</h3><p class="sub sum-sub">'+esc(c.email)+'</p></div></div>':'')+
    '<ul class="group">'+
    row('perfil','user','Perfil','Seus dados pessoais e profissionais')+
    row('config','gear','Configurações','Preferências do app')+
    row('notif','bell','Notificações','Avisos e lembretes')+
    row('atend','list','Atendimentos',nt+(nt===1?' tipo cadastrado':' tipos cadastrados'))+
    row('fatur','chart','Faturamento','Relatório por paciente ou empresa')+
    '</ul>';
  openSheet('Menu',b);
}
export function openProfile(){
  const c=auth.conta||{nome:'',email:''},pf=st.S.perfil||{};
  const b='<div class="sum"><span class="av lg c0" aria-hidden="true">'+esc(initials(c.nome))+'</span><div><h3 class="sum-name">'+esc(c.nome)+'</h3><p class="sub sum-sub">'+esc(c.email)+'</p></div></div>'+
    '<form id="f-perfil" novalidate>'+
    '<label for="pf-nome">Nome</label><input id="pf-nome" name="nome" autocomplete="name" maxlength="'+LIM.nome+'" value="'+val(c.nome)+'">'+
    '<label for="pf-email">E-mail</label><input id="pf-email" type="email" value="'+val(c.email)+'" readonly aria-describedby="pf-email-h"><p class="hint" id="pf-email-h">É o e-mail que você usa para entrar. Ele não pode ser alterado aqui.</p>'+
    '<label for="pf-tel">Telefone</label><input id="pf-tel" name="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="'+LIM.tel+'" value="'+val(pf.tel)+'">'+
    '<label for="pf-prof">Profissão</label><input id="pf-prof" name="profissao" list="pf-profs" maxlength="'+LIM.profissao+'" placeholder="Ex.: Enfermeira" value="'+val(pf.profissao)+'"><datalist id="pf-profs">'+['Enfermeiro(a)','Técnico(a) de enfermagem','Fisioterapeuta','Médico(a)','Fonoaudiólogo(a)','Nutricionista','Psicólogo(a)','Terapeuta ocupacional','Cuidador(a)'].map(x=>'<option value="'+esc(x)+'"></option>').join('')+'</datalist>'+
    '<label for="pf-reg">Registro profissional</label><input id="pf-reg" name="registro" maxlength="'+LIM.registro+'" placeholder="Ex.: COREN 000000" value="'+val(pf.registro)+'">'+
    '<label for="pf-cid">Cidade ou região de atuação</label><input id="pf-cid" name="cidade" maxlength="'+LIM.cidade+'" value="'+val(pf.cidade)+'">'+
    '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Salvar perfil</button></div></form>'+
    '<div class="sec"><h3>Seus dados</h3><p class="hint">Seus dados ficam salvos na sua conta e são copiados automaticamente todos os dias, de forma protegida. Você não precisa fazer nada.</p></div>'+
    '<div class="sec"><h3>Segurança</h3><div class="sheet-actions"><button type="button" class="btn" data-action="open-password">'+ic('lock')+'Alterar senha</button><button type="button" class="btn" data-action="logout">'+ic('logout')+'Sair da conta</button></div></div>'+
    '<div class="sheet-actions"><button type="button" class="btn ghost" data-action="open-menu">Voltar ao menu</button></div>';
  openSheet('Perfil',b);
}
export function saveProfile(f){
  const nome=cleanName(fv(f,'nome'));
  if(!nome) return fail(f,'Informe seu nome.','nome');
  st.S.perfil={nome:nome,tel:cleanName(fv(f,'tel')),profissao:cleanName(fv(f,'profissao')),registro:cleanName(fv(f,'registro')),cidade:cleanName(fv(f,'cidade'))};
  if(auth.conta) auth.conta.nome=nome;
  commit();closeSheet(true);st.lastFocus=null;
  toast('Perfil atualizado.');
}
export function openSoon(kind){
  const t=kind==='notif'?{h:'Notificações',s:'Aqui ficarão os avisos e lembretes dos seus atendimentos.'}:{h:'Configurações',s:'Aqui ficarão as preferências do app.'};
  openSheet(t.h,'<div class="soon"><strong>Em breve</strong>'+t.s+' Esta área será liberada em uma próxima versão.</div><div class="sheet-actions"><button type="button" class="btn" data-action="open-menu">Voltar ao menu</button></div>');
}
export function openPassword(){
  const b='<form id="f-senha" novalidate>'+pwField('s-atual','atual','Senha atual','current-password')+pwField('s-nova','senha','Nova senha','new-password')+pwField('s-conf','conf','Repita a nova senha','new-password')+
    '<p class="hint">Use pelo menos 8 caracteres, com letras maiúsculas e minúsculas, números e símbolos.</p><p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Salvar nova senha</button><button type="button" class="btn" data-action="menu-go" data-go="perfil">Voltar ao perfil</button></div></form>';
  openSheet('Alterar senha',b);
}
export async function doSenha(f){
  const at=fv(f,'atual'),s1=fv(f,'senha'),s2=fv(f,'conf');
  if(!at) return fail(f,'Informe a senha atual.','atual');
  const r=senhaRegra(s1,s2);if(r) return fail(f,r,'senha');
  setBusy(f,true);
  try{
    try{
      const d=await api('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:SB.ses.user.email,password:at}});
      storeSes(d,SB.ses.persist);
    }catch(e){
      setBusy(f,false);
      return fail(f,(e&&e.code==='http'&&e.status===400)?'A senha atual está incorreta.':errMsg(e,'Não foi possível verificar a senha atual.'),'atual');
    }
    await api('/auth/v1/user',{method:'PUT',body:{password:s1}});
    setBusy(f,false);closeSheet(true);st.lastFocus=null;toast('Senha alterada.');
  }catch(e){setBusy(f,false);fail(f,errMsg(e,'Não foi possível alterar a senha. Tente de novo.'),'senha');}
}
