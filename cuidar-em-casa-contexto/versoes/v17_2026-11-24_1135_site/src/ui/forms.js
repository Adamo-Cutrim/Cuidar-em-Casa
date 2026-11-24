/* Formulários de cadastro e edição e a gravação de cada um. */
import {TIPOS_EMPRESA} from '../app/catalog.js';
import {addTipo,closeRecurrence,findCompany,findPatient,recSig,renameTipo,resolveVisit,tiposList} from '../app/model.js';
import {commit} from '../app/persistence.js';
import {ui} from '../app/state.js';
import {st} from '../app/store.js';
import {WD,WDL,addDays,brToIso,fromIso,iso,nowKey,pad,startOfWeek} from '../core/dates.js';
import {uid} from '../core/ids.js';
import {LIM} from '../core/limits.js';
import {parseMoney} from '../core/money.js';
import {cleanName,esc,norm} from '../core/text.js';
import {avatar,exTag,tipoField} from './bits.js';
import {openCompany} from './details.js';
import {$,ic} from './dom.js';
import {dateField,parseTime,timeField} from './fields.js';
import {askBlock,askMove,closeSheet,moveBlock,openSheet,toast} from './sheet.js';
import {renderAll} from './views.js';
/* ---------- formulários ---------- */
export const opt=(v,l,sel)=>'<option value="'+esc(v)+'"'+(sel?' selected':'')+'>'+esc(l)+'</option>';
export const val=x=>esc(x==null?'':x);
const moneyIn=n=>n==null||n===''?'':String(n).replace('.',',');

export function patientForm(p,companyId){
  p=p||{};
  const emp=p.empresaId||companyId||'';
  const comps=st.S.companies.map(c=>opt(c.id,c.nome,c.id===emp)).join('');
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
    (st.S.companies.length?'':'<p class="hint">Cadastre empresas na aba Empresas para vinculá-las aqui.</p>')+
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

export function companyForm(c){
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

export function visitForm(v,opts){
  v=v||{};opts=opts||{};
  if(!st.S.patients.length){
    openSheet('Novo atendimento','<div class="empty"><p>Cadastre um paciente antes de agendar um atendimento.</p><button type="button" class="btn primary small" data-action="new-patient">Cadastrar paciente</button></div>');
    return;
  }
  const pid=v.pacienteId||opts.patient||'';
  const pats=st.S.patients.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
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

export function tipoForm(nome){
  const edit=nome!=null;
  const b='<form id="f-tipo" novalidate data-old="'+esc(nome||'')+'"><label for="t-nome">Nome do tipo</label><input id="t-nome" name="nome" maxlength="'+LIM.tipo+'" autocomplete="off" placeholder="Ex.: Troca de sonda" value="'+esc(nome||'')+'">'+
    (edit?'<p class="hint">Ao renomear, os atendimentos e cadastros que usam este tipo passam a usar o novo nome.</p>':'')+
    '<p class="err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary">Salvar tipo</button><button type="button" class="btn" data-action="close-sheet">Cancelar</button>'+
    (edit?askBlock('t'+tiposList().indexOf(nome),'Excluir o tipo “'+esc(nome)+'”? Atendimentos já registrados mantêm o nome.','do-delete-tipo',esc(nome)):'')+'</div></form>';
  openSheet(edit?'Editar tipo':'Novo tipo',b);
}
export function linkForm(companyId){
  const c=findCompany(companyId);if(!c) return;
  const ps=st.S.patients.filter(p=>p.empresaId!==companyId).sort((x,y)=>x.nome.localeCompare(y.nome,'pt-BR'));
  const b='<form id="f-link" novalidate data-company="'+c.id+'"><p class="hint hint-form">Marque os pacientes que passam a ser atendidos por <strong>'+esc(c.nome)+'</strong>. Quem já estiver em outra empresa muda para esta.</p>'+
    (ps.length>6?'<div class="search">'+ic('search')+'<label for="lk-q" class="sr">Buscar paciente</label><input id="lk-q" data-role="link-q" type="search" placeholder="Buscar por nome" autocomplete="off"></div>':'')+
    '<ul class="group" id="lk-list">'+ps.map(function(p){
      const atual=findCompany(p.empresaId);
      return '<li><label class="lrow" data-n="'+esc(norm(p.nome))+'"><input type="checkbox" name="pac" value="'+esc(p.id)+'" aria-label="'+esc(p.nome)+'">'+avatar(p)+'<span class="row-main"><span class="row-name">'+esc(p.nome)+exTag(p)+'</span><span class="row-sub">'+(atual?'Hoje em '+esc(atual.nome):'Particular')+'</span></span></label></li>';
    }).join('')+'</ul><p class="err" id="f-err" role="alert"></p>'+moveBlock()+
    '<div class="sheet-actions"><button type="submit" class="btn primary">Vincular selecionados</button><button type="button" class="btn" data-action="back-company" data-id="'+c.id+'">Voltar</button></div></form>';
  openSheet('Vincular pacientes',b);
}
export function saveLink(f){
  const id=f.dataset.company,ids=Array.from(f.querySelectorAll('input[name=pac]:checked')).map(x=>x.value);
  if(!ids.length) return fail(f,'Marque pelo menos um paciente.');
  const moves=st.S.patients.filter(p=>ids.indexOf(p.id)>-1&&findCompany(p.empresaId));
  if(moves.length&&!f.dataset.moveOk){
    const nova=findCompany(id);
    return askMove(f,'<strong>Desvincular '+(moves.length===1?'este paciente da empresa atual?':moves.length+' pacientes das empresas atuais?')+'</strong> Eles passam a ser atendidos por <strong>'+esc(nova?nova.nome:'')+'</strong>:<br>'+
      moves.map(p=>esc(p.nome)+' (sai de '+esc(findCompany(p.empresaId).nome)+')').join('<br>')+'<br>Os atendimentos já agendados e os valores cadastrados continuam como estão.');
  }
  st.S.patients.forEach(function(p){if(ids.indexOf(p.id)>-1) p.empresaId=id;});
  commit();
  renderAll();openCompany(id);
  toast(ids.length===1?'Paciente vinculado.':ids.length+' pacientes vinculados.');
}
export function saveTipo(f){
  const nome=cleanName(f.elements.nome.value),old=f.dataset.old;
  if(!nome) return fail(f,'Informe o nome do tipo.','nome');
  if(tiposList().some(t=>t!==old&&norm(t)===norm(nome))) return fail(f,'Já existe um tipo com esse nome.','nome');
  if(old) renameTipo(old,nome);else addTipo(nome);
  closeSheet(true);st.lastFocus=null;renderAll();
  toast(old?'Tipo atualizado.':'Tipo criado.');
}
export function fail(f,msg,field){
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

export function savePatient(f){
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
  else st.S.patients.push(Object.assign({id:uid()},data));
  commit();closeSheet(true);st.lastFocus=null;renderAll();
  toast(id?'Cadastro atualizado.':'Paciente cadastrado.');
}
export function saveCompany(f){
  const o=readForm(f);
  if(!o.nome) return fail(f,'Informe o nome da empresa.','nome');
  const valor=parseMoney(o.valorPadrao);
  if(valor!==null&&isNaN(valor)) return fail(f,'Informe um valor válido, como 180,00.','valorPadrao');
  const data={nome:o.nome,tipo:o.tipo,contato:o.contato,valorPadrao:valor,pagamento:o.pagamento,obs:o.obs};
  const id=f.dataset.id;
  if(id){const c=findCompany(id);if(c) Object.assign(c,data);}
  else st.S.companies.push(Object.assign({id:uid(),cor:st.S.companies.length%6},data));
  commit();closeSheet(true);st.lastFocus=null;renderAll();
  toast(id?'Empresa atualizada.':'Empresa cadastrada.');
}
export function saveVisit(f){
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
    for(let i=0;i<n;i++) st.S.visits.push({id:uid(),pacienteId:o.pacienteId,date:iso(addDays(d0,7*i)),hora:o.hora,tipo:o.tipo,obs:o.obs,status:'agendado'});
  }
  commit();closeSheet(true);st.lastFocus=null;
  ui.tab='agenda';ui.day=o.date;ui.weekStart=iso(startOfWeek(fromIso(o.date)));
  renderAll();window.scrollTo(0,0);
  toast(msg||(id?'Atendimento atualizado.':'Atendimento agendado.'));
}
