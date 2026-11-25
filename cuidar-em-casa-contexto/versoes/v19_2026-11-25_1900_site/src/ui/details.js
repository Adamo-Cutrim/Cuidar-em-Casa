/* Fichas de atendimento, paciente e empresa. */
import {findCompany,findPatient,recText,visitById,visitsBetween} from '../app/model.js';
import {st} from '../app/store.js';
import {WD,addDays,age,fromIso,iso,nowKey,pad} from '../core/dates.js';
import {esc,initials} from '../core/text.js';
import {avatar,chip,exTag,mapsUrl,money} from './bits.js';
import {ic} from './dom.js';
import {dayTitle} from './fields.js';
import {askBlock,kv,kvCopy,openSheet} from './sheet.js';
export function openVisit(id){
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

export function openPatient(id){
  const p=findPatient(id);if(!p) return;
  const a=age(p.nasc);
  const addr=[p.endereco,p.bairro].filter(Boolean).join(', ');
  const key=nowKey();
  const ups=visitsBetween(iso(new Date()),iso(addDays(new Date(),120))).filter(v=>v.pacienteId===id&&v.status==='agendado'&&(v.date+' '+v.hora)>=key).sort((x,y)=>(x.date+x.hora).localeCompare(y.date+y.hora)).slice(0,4);
  let b='<div class="sum">'+avatar(p,'lg')+'<div><h3>'+esc(p.nome)+exTag(p)+'</h3><p>'+(a!=null?a+' anos':'Idade não informada')+'</p></div></div>'+
    '<p>'+chip(p.empresaId)+'</p>';
  if(p.alergias) b+='<p class="alert"><strong>Alergias:</strong> '+esc(p.alergias)+'</p>';
  b+='<div class="panel kv"><div><div class="grow"><span class="k">Valor por atendimento</span><div class="v">'+money(p.valor)+'</div></div><button type="button" class="icon-btn sm" data-action="toggle-hide-sheet" data-id="'+p.id+'" aria-label="'+(st.hide?'Mostrar valores':'Ocultar valores')+'">'+ic(st.hide?'eye':'eye-off')+'</button></div>'+(p.rec&&p.rec.ativo?kv('Atendimento recorrente',esc(recText(p))):'');
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

export function openCompany(id){
  const c=findCompany(id);if(!c) return;
  const ps=st.S.patients.filter(p=>p.empresaId===id).sort((x,y)=>x.nome.localeCompare(y.nome,'pt-BR'));
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
  const outros=st.S.patients.filter(p=>p.empresaId!==id).length;
  b+='<div class="sheet-actions">'+(outros?'<button type="button" class="btn primary" data-action="link-patients" data-company="'+c.id+'">'+ic('users')+'Vincular paciente já cadastrado</button>':'')+'<button type="button" class="btn'+(outros?'':' primary')+'" data-action="new-patient" data-company="'+c.id+'">'+ic('plus')+'Cadastrar novo paciente'+(outros?'':' nesta empresa')+'</button><button type="button" class="btn" data-action="edit-company" data-id="'+c.id+'">Editar empresa</button><button type="button" class="btn" data-action="open-report" data-by="paciente" data-emp="'+c.id+'">'+ic('chart')+'Faturamento desta empresa</button>'+
    askBlock('c'+c.id,ps.length?'<strong>Atenção:</strong> '+(ps.length===1?'1 paciente será desvinculado':ps.length+' pacientes serão desvinculados')+' de '+esc(c.nome)+(ps.length===1?' e ficará como particular':' e ficarão como particulares')+'. Confirmar a exclusão da empresa?':'Excluir '+esc(c.nome)+'?','do-delete-company',c.id)+'</div>';
  openSheet('Empresa',b);
}
