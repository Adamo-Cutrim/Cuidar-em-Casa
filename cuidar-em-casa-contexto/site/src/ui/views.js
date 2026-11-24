/* Telas principais: cabeçalho, abas, agenda, pacientes, empresas, tipos. */
import {findCompany,findPatient,hasExamples,tipoUso,tiposList,visitsBetween} from '../app/model.js';
import {statusText} from '../app/persistence.js';
import {auth,ui} from '../app/state.js';
import {st} from '../app/store.js';
import {WD,addDays,age,fromIso,iso,nowKey} from '../core/dates.js';
import {esc,initials,norm} from '../core/text.js';
import {avatar,chip,exTag,repIcon,repMark} from './bits.js';
import {$,ic} from './dom.js';
import {dayTitle,weekLabel} from './fields.js';
/* ---------- telas ---------- */
export function renderAll(){if(!auth.logged) return;renderTop();renderView();renderTabs();renderFab();}

export function renderTop(){
  const t=ui.tab;
  const titles={agenda:'Agenda da semana',pacientes:'Pacientes',empresas:'Empresas',tipos:'Atendimentos'};
  let sub='';
  if(t==='agenda') sub=weekLabel();
  else if(t==='pacientes') sub=st.S.patients.length+(st.S.patients.length===1?' paciente cadastrado':' pacientes cadastrados');
  else if(t==='tipos'){const n=tiposList().length;sub=n+(n===1?' tipo de atendimento':' tipos de atendimento');}
  else sub=st.S.companies.length+(st.S.companies.length===1?' empresa cadastrada':' empresas cadastradas');
  $('#top').innerHTML='<div class="top-row"><div class="top-text"><h1>'+titles[t]+'</h1><p class="sub">'+esc(sub)+'</p></div></div>';
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
export function renderView(){
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
  if(st.S.companies.length){
    f='<div class="filters" role="group" aria-label="Filtrar por empresa"><button type="button" class="fchip'+(ui.fcomp==='all'?' sel':'')+'" data-action="filter" data-id="all">Todos</button>'+
      st.S.companies.map(c=>'<button type="button" class="fchip'+(ui.fcomp===c.id?' sel':'')+'" data-action="filter" data-id="'+c.id+'">'+esc(c.nome)+'</button>').join('')+
      '<button type="button" class="fchip'+(ui.fcomp==='none'?' sel':'')+'" data-action="filter" data-id="none">Particulares</button></div>';
  }
  return '<div class="search">'+ic('search')+'<label for="q" class="sr">Buscar paciente</label><input id="q" type="search" placeholder="Nome, bairro ou empresa" value="'+esc(ui.q)+'" autocomplete="off"></div>'+f+'<div id="plist"></div>';
}
export function renderPatientList(){
  const el=$('#plist');if(!el) return;
  const q=norm(ui.q);
  const list=st.S.patients.filter(function(p){
    if(ui.fcomp==='none'){if(p.empresaId&&findCompany(p.empresaId)) return false;}
    else if(ui.fcomp!=='all'&&p.empresaId!==ui.fcomp) return false;
    if(!q) return true;
    const c=findCompany(p.empresaId);
    return norm([p.nome,p.bairro,p.endereco,c&&c.nome].join(' ')).indexOf(q)>-1;
  }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if(!st.S.patients.length){
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
  if(!st.S.companies.length) return '<div class="empty"><p>Nenhuma empresa cadastrada. Cadastre as empresas para as quais você presta serviço e vincule seus pacientes a elas.</p><button type="button" class="btn small primary" data-action="new-company">Cadastrar empresa</button></div>';
  const list=st.S.companies.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  return '<ul class="group">'+list.map(function(c){
    const n=st.S.patients.filter(p=>p.empresaId===c.id).length;
    return '<li><button type="button" class="row" data-action="open-company" data-id="'+c.id+'"><span class="av sq c'+(c.cor%6)+'" aria-hidden="true">'+esc(initials(c.nome))+'</span><span class="row-main"><span class="row-name">'+esc(c.nome)+exTag(c)+'</span><span class="row-sub">'+esc(c.tipo||'Empresa')+'</span></span><span class="row-side"><span>'+n+(n===1?' paciente':' pacientes')+'</span></span></button></li>';
  }).join('')+'</ul>';
}
