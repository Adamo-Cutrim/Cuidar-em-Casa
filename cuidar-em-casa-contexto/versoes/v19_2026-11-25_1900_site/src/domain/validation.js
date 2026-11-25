/* Validacao: tudo que vem de fora (conta, arquivo de backup) passa por aqui antes de ser usado. */
import {LONG,LIM,ISO_D,HHMM} from '../core/limits.js';
import {iso,isoToBr,brToIso} from '../core/dates.js';
import {sid,TXT} from '../core/text.js';
import {numOrNull} from '../core/money.js';
import {uid} from '../core/ids.js';
export const okDate=v=>typeof v==='string'&&ISO_D.test(v)&&brToIso(isoToBr(v))===v;
/* Campos opcionais que o validador já tratou: se vieram inválidos, foram recusados e NÃO podem voltar como "campo extra"
   (E7: serieData "2026-02-30" chegava ao banco e o Postgres recusava o lote; ex:"sim" virava exemplo; virtual:true nunca era gravado). */
const KNOWN={patient:new Set(['ex','rec','recExc']),company:new Set(['ex']),visit:new Set(['serie','serieData','manual','ex','virtual','valorSnapshot'])};
export function keepExtra(src,dst,known){
  Object.keys(src).forEach(function(k){
    if(k==='__proto__'||k==='constructor'||k==='prototype'||Object.prototype.hasOwnProperty.call(dst,k)||(known&&known.has(k))) return;
    const v=src[k];
    if(typeof v==='string') dst[k]=v.slice(0,LONG);
    else if((typeof v==='number'&&isFinite(v))||typeof v==='boolean') dst[k]=v;
  });
}
export function uniqueIds(list){
  const seen=new Set();
  list.forEach(function(x){while(seen.has(x.id)) x.id=uid();seen.add(x.id);});
  return list;
}
export function normRec(r){
  if(!r||typeof r!=='object') return null;
  const dias=Array.isArray(r.dias)?Array.from(new Set(r.dias.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))):[];
  return {ativo:r.ativo===true&&dias.length>0,dias:dias,hora:HHMM.test(r.hora)?r.hora:'08:00',tipo:TXT(r.tipo,100),inicio:okDate(r.inicio)?r.inicio:iso(new Date()),fim:okDate(r.fim)?r.fim:''};
}
export function normPatient(p){
  if(!p||typeof p!=='object') return null;
  const o={id:sid(p.id)||uid(),nome:TXT(p.nome),nasc:okDate(p.nasc)?p.nasc:'',tel:TXT(p.tel,60),respNome:TXT(p.respNome),respTel:TXT(p.respTel,60),endereco:TXT(p.endereco),bairro:TXT(p.bairro),ref:TXT(p.ref,LONG),empresaId:sid(p.empresaId),valor:numOrNull(p.valor),condicoes:TXT(p.condicoes,LONG),alergias:TXT(p.alergias,LONG),medicamentos:TXT(p.medicamentos,LONG),obs:TXT(p.obs,LONG)};
  if(p.ex===true) o.ex=true;
  const r=normRec(p.rec);if(r) o.rec=r;
  if(Array.isArray(p.recExc)) o.recExc=p.recExc.filter(okDate).slice(0,5000);
  keepExtra(p,o,KNOWN.patient);return o;
}
export function normCompany(c){
  if(!c||typeof c!=='object') return null;
  const n=Number(c.cor);
  const o={id:sid(c.id)||uid(),nome:TXT(c.nome),tipo:TXT(c.tipo),contato:TXT(c.contato),valorPadrao:numOrNull(c.valorPadrao),pagamento:TXT(c.pagamento),obs:TXT(c.obs,LONG),cor:Number.isInteger(n)&&n>=0&&n<1000?n:0};
  if(c.ex===true) o.ex=true;
  keepExtra(c,o,KNOWN.company);return o;
}
export function normVisit(v){
  if(!v||typeof v!=='object'||!okDate(v.date)) return null;
  const o={id:sid(v.id)||uid(),pacienteId:sid(v.pacienteId),date:v.date,hora:HHMM.test(v.hora)?v.hora:'08:00',tipo:TXT(v.tipo,100),obs:TXT(v.obs,LONG),status:v.status==='feito'||v.status==='cancelado'?v.status:'agendado'};
  if(v.serie) o.serie=sid(v.serie);
  if(okDate(v.serieData)) o.serieData=v.serieData;
  if(v.manual===true) o.manual=true;
  if(v.ex===true) o.ex=true;
  if(o.status==='feito'&&Object.prototype.hasOwnProperty.call(v,'valorSnapshot')) o.valorSnapshot=numOrNull(v.valorSnapshot);   /* valor guardado ao marcar como feito (v18a); inválido = sem valor */
  keepExtra(v,o,KNOWN.visit);return o;
}
export function normalize(o){
  o=(o&&typeof o==='object')?o:{};
  const pf=(o.perfil&&typeof o.perfil==='object')?o.perfil:{};
  let tipos;
  if(Array.isArray(o.tipos)) tipos=Array.from(new Set(o.tipos.filter(x=>typeof x==='string').map(x=>x.trim().replace(/\s+/g,' ').slice(0,LIM.tipo)).filter(Boolean))).slice(0,200);
  const arr=a=>Array.isArray(a)?a:[];
  return {patients:uniqueIds(arr(o.patients).map(normPatient).filter(Boolean)),companies:uniqueIds(arr(o.companies).map(normCompany).filter(Boolean)),visits:uniqueIds(arr(o.visits).map(normVisit).filter(Boolean)),
    rev:Math.max(0,Math.floor(Number(o.rev))||0),perfil:{nome:TXT(pf.nome,LIM.nome),tel:TXT(pf.tel,LIM.tel),profissao:TXT(pf.profissao,LIM.profissao),registro:TXT(pf.registro,LIM.registro),cidade:TXT(pf.cidade,LIM.cidade)},tipos:tipos,persisted:true};
}
