/* Dinheiro. Sem DOM, sem estado. */
export const BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
export function parseMoney(s){
  s=String(s||'').replace(/[^\d.,]/g,'');
  if(!s) return null;
  if(s.indexOf(',')>-1) s=s.replace(/\./g,'').replace(',','.');
  const n=Number(s);
  return isFinite(n)&&n>=0?Math.round(n*100)/100:NaN;
}
export const numOrNull=v=>{if(v==null||v==='') return null;const n=Number(v);return isFinite(n)&&n>=0&&n<1e9?n:null;};
export const brl=v=>BRL.format(Number(v)||0);
