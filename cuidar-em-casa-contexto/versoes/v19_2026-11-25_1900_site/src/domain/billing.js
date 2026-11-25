/* Relatório de faturamento (BACKEND.md seção 5.2). O estado, o filtro ({by,emp,pac,from,to}) e o "agora" entram como argumento.
   Valor de cada atendimento = valor cadastrado no paciente. Feito = realizado. Agendado = previsto.
   Cancelados não entram. Atendimentos recorrentes ainda não registrados contam como agendados. */
import {iso,isoToBr,nowKey} from '../core/dates.js';
import {pl} from '../core/text.js';
import {brl} from '../core/money.js';
import {findPatient,findCompany,pValue,noCompany} from './queries.js';
import {visitsBetween} from './recurrence.js';

export function monthRange(y,m){const a=new Date(y,m,1),b=new Date(y,m+1,0);return {y:a.getFullYear(),m:a.getMonth(),from:iso(a),to:iso(b)};}
export function repData(state,r,now=nowKey()){
  const rows=Object.create(null);
  const tot={feitos:0,ag:0,real:0,prev:0,pacs:Object.create(null)};
  let semValor=0,pend=0;
  visitsBetween(state,r.from,r.to).forEach(function(v){
    if(v.status==='cancelado') return;
    const p=findPatient(state,v.pacienteId);if(!p) return;
    if(r.emp==='none'){if(!noCompany(state,p)) return;}
    else if(r.emp!=='all'&&p.empresaId!==r.emp) return;
    if(r.pac!=='all'&&p.id!==r.pac) return;
    const comp=noCompany(state,p)?null:findCompany(state,p.empresaId);
    const key=r.by==='empresa'?(comp?comp.id:'none'):p.id;
    const row=rows[key]||(rows[key]={key:key,nome:r.by==='empresa'?(comp?comp.nome:'Particulares'):p.nome,empresa:comp?comp.nome:'Particular',valor:(p.valor==null||p.valor==='')?null:pValue(p),feitos:0,ag:0,real:0,prev:0,pacs:Object.create(null)});
    /* feito com valor guardado (v18a): vale o que foi guardado ao marcar como feito; null = sem valor. Sem o campo (dado antigo) e agendado: valor atual do paciente. */
    const guardado=v.status==='feito'&&Object.prototype.hasOwnProperty.call(v,'valorSnapshot');
    const val=guardado?(v.valorSnapshot==null?0:Number(v.valorSnapshot)):pValue(p),sem=guardado?v.valorSnapshot==null:(p.valor==null||p.valor==='');
    if(sem) semValor++;
    row.pacs[p.id]=1;tot.pacs[p.id]=1;
    if(v.status==='feito'){row.feitos++;row.real+=val;tot.feitos++;tot.real+=val;}
    else{row.ag++;row.prev+=val;tot.ag++;tot.prev+=val;if((v.date+' '+(v.hora||'00:00'))<now) pend++;}
  });
  const list=Object.keys(rows).map(k=>rows[k]).sort(function(a,b){
    if(a.key==='none') return 1;if(b.key==='none') return -1;
    return a.nome.localeCompare(b.nome,'pt-BR');
  });
  return {rows:list,tot:tot,semValor:semValor,pend:pend};
}
export function repEmpLabel(state,r){if(r.emp==='all') return 'Todas';if(r.emp==='none') return 'Particulares';const c=findCompany(state,r.emp);return c?c.nome:'Todas';}
export function repPacLabel(state,r){if(r.pac==='all') return 'Todos';const p=findPatient(state,r.pac);return p?p.nome:'Todos';}
export const csvCell=v=>{let t=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(t)) t="'"+t;return /[;"\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
export const csvNum=v=>(Math.round(Number(v)*100)/100).toFixed(2).replace('.',',');
export function repCsv(state,r,now=new Date()){
  const d=repData(state,r,nowKey(now)),L=[];
  L.push(['Relatório de faturamento']);
  L.push(['Período',isoToBr(r.from)+' a '+isoToBr(r.to)]);
  L.push(['Agrupado por',r.by==='empresa'?'Empresa':'Paciente']);
  L.push(['Empresa',repEmpLabel(state,r)]);
  L.push(['Paciente',repPacLabel(state,r)]);
  L.push(['Gerado em',isoToBr(iso(now))+' '+nowKey(now).slice(11)]);
  L.push([]);
  if(r.by==='empresa'){
    L.push(['Empresa','Pacientes atendidos','Atendimentos feitos','Valor realizado','Atendimentos agendados','Valor previsto']);
    d.rows.forEach(x=>L.push([x.nome,Object.keys(x.pacs).length,x.feitos,csvNum(x.real),x.ag,csvNum(x.prev)]));
    L.push(['Total',Object.keys(d.tot.pacs).length,d.tot.feitos,csvNum(d.tot.real),d.tot.ag,csvNum(d.tot.prev)]);
  }else{
    L.push(['Paciente','Empresa','Atendimentos feitos','Valor atual por atendimento','Valor realizado','Atendimentos agendados','Valor previsto']);
    d.rows.forEach(x=>L.push([x.nome,x.empresa,x.feitos,x.valor==null?'':csvNum(x.valor),csvNum(x.real),x.ag,csvNum(x.prev)]));
    L.push(['Total','',d.tot.feitos,'',csvNum(d.tot.real),d.tot.ag,csvNum(d.tot.prev)]);
  }
  return '\ufeff'+L.map(a=>a.map(csvCell).join(';')).join('\r\n');
}
export function repText(state,r,now=nowKey()){
  const d=repData(state,r,now);
  const line=(n,f,re,a,pr)=>n+': '+pl(f,'feito','feitos')+' ('+brl(re)+'), '+pl(a,'agendado','agendados')+' ('+brl(pr)+' previsto)';
  return ['Faturamento de '+isoToBr(r.from)+' a '+isoToBr(r.to)+' (por '+r.by+')']
    .concat(d.rows.map(x=>line(x.nome,x.feitos,x.real,x.ag,x.prev)))
    .concat([line('Total',d.tot.feitos,d.tot.real,d.tot.ag,d.tot.prev)]).join('\n');
}
