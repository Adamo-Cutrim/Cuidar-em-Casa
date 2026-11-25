/* Atendimentos recorrentes (BACKEND.md seção 5.1). O estado ({patients, visits}) e o "hoje" entram como argumento.
   Atendimentos recorrentes não são gravados um a um: aparecem na agenda a partir do cadastro do paciente.
   Só viram registro quando você conclui, edita, cancela ou exclui um deles. */
import {iso,fromIso,addDays} from '../core/dates.js';
import {findPatient} from './queries.js';

export function recOccurs(p,date,visits){
  const r=p&&p.rec;
  if(!r||!r.ativo||!Array.isArray(r.dias)) return false;
  if(r.dias.indexOf(fromIso(date).getDay())<0) return false;
  if(date<r.inicio||(r.fim&&date>r.fim)) return false;
  if((p.recExc||[]).indexOf(date)>-1) return false;
  return !visits.some(v=>v.serie===p.id&&v.serieData===date);
}
export function virtualOf(p,date){
  return {id:'r-'+p.id+'-'+date,pacienteId:p.id,date:date,hora:p.rec.hora,tipo:p.rec.tipo||'',obs:'',status:'agendado',serie:p.id,serieData:date,virtual:true};
}
export function visitsBetween(state,a,b){
  const out=state.visits.filter(v=>v.date>=a&&v.date<=b);
  const pats=state.patients.filter(p=>p.rec&&p.rec.ativo);
  if(pats.length){
    for(let d=fromIso(a),end=fromIso(b);d<=end;d=addDays(d,1)){
      const k=iso(d);
      pats.forEach(function(p){if(recOccurs(p,k,state.visits)) out.push(virtualOf(p,k));});
    }
  }
  return out;
}
export function visitById(state,id){
  const st=state.visits.find(x=>x.id===id);
  if(st) return st;
  if(String(id).indexOf('r-')===0){
    const p=findPatient(state,id.slice(2,-11)),date=id.slice(-10);
    if(p&&recOccurs(p,date,state.visits)) return virtualOf(p,date);
  }
  return null;
}
export function resolveVisit(state,id){
  const v=visitById(state,id);
  if(!v) return null;
  if(v.virtual){const m=Object.assign({},v);delete m.virtual;state.visits.push(m);return m;}
  return v;
}
export function recSig(r){return r&&r.ativo?[r.dias.join(','),r.hora,r.tipo||'',r.inicio,r.fim||''].join('|'):'';}
/* Antes de trocar a regra: o passado recente fica como estava e o futuro volta a seguir a regra nova.
   Atendimentos que você mexeu à mão (remarcou, editou) ou já concluiu/cancelou são mantidos.
   "now" é injetável para os testes; no app é o relógio do aparelho. */
export function closeRecurrence(state,p,now=new Date()){
  const today=iso(now),floor=addDays(now,-120),from=fromIso(p.rec.inicio);
  for(let d=from<floor?floor:from;iso(d)<today;d=addDays(d,1)){
    const k=iso(d);
    if(recOccurs(p,k,state.visits)) resolveVisit(state,'r-'+p.id+'-'+k);
  }
  state.visits=state.visits.filter(v=>!(v.serie===p.id&&v.status==='agendado'&&!v.manual&&v.date>=today));
  p.recExc=(p.recExc||[]).filter(x=>x<today);
}
export function recText(p){
  const r=p.rec;
  if(!r||!r.ativo) return '';
  const nomes=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  const ds=r.dias.slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(d=>nomes[d]);
  const lista=ds.length>1?ds.slice(0,-1).join(', ')+' e '+ds[ds.length-1]:ds[0];
  const fmt=x=>x.split('-').reverse().join('/');
  return 'Toda semana: '+lista+', às '+r.hora+(r.fim?'. Até '+fmt(r.fim)+'.':'.');
}
