/* Tabela de ações (data-action) e ouvintes globais de clique, envio, digitação e teclado. */
import {addTipo,deleteTipo,findCompany,findPatient,hasExamples,noCompany,repCsv,repText,resolveVisit,visitById} from '../app/model.js';
import {commit} from '../app/persistence.js';
import {HEALTH_KEY,HIDE_KEY,ui,writeLocal} from '../app/state.js';
import {st} from '../app/store.js';
import {addDays,brToIso,fromIso,iso,startOfWeek} from '../core/dates.js';
import {norm} from '../core/text.js';
import {setStatus} from '../domain/visit.js';
import {boot,doCriar,doEntrar,doNova,doReset,doSenha,openConfig,openMenu,openPassword,openProfile,openSoon,sair,saveProfile,showGate} from './account.js';
import {tipoOptions} from './bits.js';
import {openCompany,openPatient,openVisit} from './details.js';
import {$} from './dom.js';
import {calClose,calOpen,calRender,calSet,maskDate,maskTime,parseTime,timeApply,timeOpen,timeSync,wheelGo,wheelIdx} from './fields.js';
import {companyForm,linkForm,patientForm,saveCompany,saveLink,savePatient,saveTipo,saveVisit,tipoForm,visitForm} from './forms.js';
import {dlRef,openReport,repInit,repRender,repSetMonth} from './report.js';
import {clearMove,closeSheet,copyText,toast} from './sheet.js';
import {renderAll,renderPatientList,renderTop,renderView} from './views.js';
/* ---------- ações ---------- */
function setWeek(start){
  const off=fromIso(ui.day).getDay();
  ui.weekStart=iso(start);
  ui.day=iso(addDays(start,off));
  renderAll();
}
function clearDemo(){
  st.S.patients=st.S.patients.filter(x=>!x.ex);st.S.companies=st.S.companies.filter(x=>!x.ex);st.S.visits=st.S.visits.filter(x=>!x.ex);
  if(ui.fcomp!=='all'&&ui.fcomp!=='none'&&!findCompany(ui.fcomp)) ui.fcomp='all';
  commit();renderAll();toast('Exemplos apagados.');
}
const A={
  'tab':function(el){ui.tab=el.dataset.tab;renderAll();window.scrollTo(0,0);},
  'toggle-hide-sheet':function(el){
    st.hide=!st.hide;writeLocal(HIDE_KEY,st.hide?'1':'0');
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
  'rep-hide':function(){st.hide=!st.hide;writeLocal(HIDE_KEY,st.hide?'1':'0');renderTop();renderView();repRender();},
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
    else if(g==='config') openConfig();
    else if(g==='atend'){closeSheet(true);st.lastFocus=null;ui.tab='tipos';renderAll();window.scrollTo(0,0);}
    else if(g==='fatur'){repInit({by:'paciente',emp:'all',pac:'all'});openReport();}
    else openSoon(g);
  },
  'logout':function(){sair();},
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
    setStatus(v,el.dataset.status,findPatient(v.pacienteId));commit();closeSheet();renderView();   /* guarda o valor ao marcar como realizado (v18a) */
    toast({feito:'Atendimento marcado como realizado.',cancelado:'Atendimento cancelado.',agendado:'Atendimento voltou para agendado.'}[v.status]);
  },
  'do-delete-visit':function(el){
    const gone=visitById(el.dataset.id);
    if(gone&&gone.serie){
      const pp=findPatient(gone.serie);
      if(pp){pp.recExc=pp.recExc||[];if(pp.recExc.indexOf(gone.serieData)<0) pp.recExc.push(gone.serieData);}
    }
    st.S.visits=st.S.visits.filter(v=>v.id!==el.dataset.id);
    commit();closeSheet();renderAll();toast('Atendimento excluído.');
  },
  'do-delete-patient':function(el){
    const id=el.dataset.id;
    st.S.patients=st.S.patients.filter(p=>p.id!==id);st.S.visits=st.S.visits.filter(v=>v.pacienteId!==id);
    commit();closeSheet();renderAll();toast('Paciente excluído.');
  },
  'do-delete-company':function(el){
    const id=el.dataset.id;
    st.S.companies=st.S.companies.filter(c=>c.id!==id);
    st.S.patients.forEach(function(p){if(p.empresaId===id) p.empresaId='';});
    if(ui.fcomp===id) ui.fcomp='all';
    commit();closeSheet();renderAll();toast('Empresa excluída.');
  },
  'ask':function(el){const c=document.getElementById(el.dataset.confirm);if(c){c.hidden=false;el.hidden=true;}},
  'unask':function(el){const c=document.getElementById(el.dataset.confirm),a=document.getElementById(el.dataset.ask);if(c) c.hidden=true;if(a) a.hidden=false;},
  'copy':function(el){copyText(el.dataset.text);},
  'clear-demo':function(){clearDemo();},
  'clear-demo-config':function(){if(hasExamples()) clearDemo();openConfig();},
  'health-show':function(){   /* revela os dados de saúde só nesta ficha; ao reabrir, voltam a ficar cobertos */
    const r=$('#sheet-root');if(!r) return;
    const first=r.querySelector('[data-health]');
    r.querySelectorAll('[data-health]').forEach(function(x){x.hidden=false;});
    r.querySelectorAll('[data-health-off]').forEach(function(x){x.remove();});
    if(first){first.setAttribute('tabindex','-1');first.focus();}
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
  if(t&&t.dataset&&t.dataset.role==='cfg-saude'){st.hideHealth=t.checked;writeLocal(HEALTH_KEY,t.checked?'1':'0');return;}
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
