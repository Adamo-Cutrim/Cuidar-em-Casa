/* Datas e horas. Sem DOM, sem estado. */
export const pad=n=>String(n).padStart(2,'0');
export const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
export const fromIso=s=>{const p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);};
export const addDays=(d,n)=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;};
export const startOfWeek=d=>addDays(d,-d.getDay());
export const WD=['dom','seg','ter','qua','qui','sex','sáb'];
export const WDL=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
export const MON=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export const nowKey=(n=new Date())=>iso(n)+' '+pad(n.getHours())+':'+pad(n.getMinutes());
export function age(n){
  if(!n) return null;
  const b=fromIso(n),t=new Date();
  let a=t.getFullYear()-b.getFullYear();
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) a--;
  return a>=0&&a<130?a:null;
}
/* ---------- campo de data: digitar (dd/mm/aaaa) ou abrir o calendário na setinha ---------- */
export const isoToBr=i=>i?String(i).split('-').reverse().join('/'):'';
export function brToIso(t){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(t).trim());
  if(!m) return null;
  const d=+m[1],mo=+m[2],y=+m[3];
  if(y<1900||y>2100||mo<1||mo>12||d<1) return null;
  const dt=new Date(y,mo-1,d);
  if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d) return null;
  return y+'-'+pad(mo)+'-'+pad(d);
}
