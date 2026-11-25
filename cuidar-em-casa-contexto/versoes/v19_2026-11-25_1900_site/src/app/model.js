/* Consultas e regras ligadas ao estado (S) e tipos de atendimento. */
import {cleanName,norm} from '../core/text.js';
import {TIPOS_ATEND} from './catalog.js';
import {commit} from './persistence.js';
import {SB} from './session.js';
import {ui} from './state.js';
import {st} from './store.js';
import * as Bill from '../domain/billing.js';
import * as Q from '../domain/queries.js';
import * as Rec from '../domain/recurrence.js';
import {deleteTipoNoEstado,renameTipoNoEstado} from '../domain/tipos.js';
/* Consultas e regras ficam em src/domain/ (v17). Aqui só ligam ao estado da tela: S (dados) e ui (filtros). */
export function findPatient(id){return Q.findPatient(st.S,id);}
export function findCompany(id){return Q.findCompany(st.S,id);}
export function noCompany(p){return Q.noCompany(st.S,p);}
export function visitsBetween(a,b){return Rec.visitsBetween(st.S,a,b);}
export function visitById(id){return Rec.visitById(st.S,id);}
export function resolveVisit(id){return Rec.resolveVisit(st.S,id);}
export function recSig(r){return Rec.recSig(r);}
export function closeRecurrence(p){return Rec.closeRecurrence(st.S,p);}
export function recText(p){return Rec.recText(p);}
export function monthRange(y,m){return Bill.monthRange(y,m);}
export function repData(){return Bill.repData(st.S,ui.rep);}
export function repCsv(){return Bill.repCsv(st.S,ui.rep);}
export function repText(){return Bill.repText(st.S,ui.rep);}
export const hasExamples=()=>st.S.patients.some(x=>x.ex)||st.S.companies.some(x=>x.ex)||st.S.visits.some(x=>x.ex);
/* Tipos de atendimento: lista do usuário. Quem ainda não criou a sua lista vê os padrões e os tipos já usados. */
export function tiposList(){
  const l=Array.isArray(st.S.tipos)?st.S.tipos.slice():Array.from(new Set(TIPOS_ATEND.concat(st.S.visits.map(x=>x.tipo).filter(Boolean),st.S.patients.map(p=>p.rec&&p.rec.tipo).filter(Boolean))));
  return l.sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
export function ensureTipos(){if(!Array.isArray(st.S.tipos)) st.S.tipos=tiposList();}
export function addTipo(nome){
  nome=cleanName(nome);
  if(!nome) return '';
  const ex=tiposList().find(t=>norm(t)===norm(nome));
  if(ex) return ex;
  ensureTipos();st.S.tipos.push(nome);commit();
  return nome;
}
export function renameTipo(old,nome){
  ensureTipos();
  renameTipoNoEstado(st.S,st.tipoIds,SB.ses.user.id,old,nome);   /* o id do tipo fica: a linha é atualizada, não trocada (v18b) */
  commit();
}
export function deleteTipo(nome){ensureTipos();deleteTipoNoEstado(st.S,nome);commit();}
export function tipoUso(t){
  const at=st.S.visits.filter(v=>v.tipo===t).length,pac=st.S.patients.filter(p=>p.rec&&p.rec.ativo&&p.rec.tipo===t).length;
  const parts=[];
  if(at) parts.push(at+(at===1?' atendimento':' atendimentos'));
  if(pac) parts.push(pac+(pac===1?' paciente recorrente':' pacientes recorrentes'));
  return parts.length?parts.join(' · '):'Ainda sem uso';
}
