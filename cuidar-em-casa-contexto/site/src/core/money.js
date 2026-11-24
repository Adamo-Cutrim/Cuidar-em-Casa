/* Dinheiro. Sem DOM, sem estado. */
export const BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
/* Valor digitado em reais -> número (null se vazio, NaN se inválido).
   Vírgula é decimal e ponto é milhar ("1.234,56"). Sem vírgula, ponto que forma milhar ("1.234", "12.345.678") também é milhar;
   ponto com 1 ou 2 casas ("150.75") é decimal. Negativo ou de 1 bilhão para cima é inválido (mesmo limite de numOrNull). */
export function parseMoney(s){
  const raw=String(s||'');
  if(raw.indexOf('-')>-1&&/\d/.test(raw)) return NaN;
  s=raw.replace(/[^\d.,]/g,'');
  if(!s) return null;
  if(s.indexOf(',')>-1) s=s.replace(/\./g,'').replace(',','.');
  else if(/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  const n=Number(s);
  return isFinite(n)&&n>=0&&n<1e9?Math.round(n*100)/100:NaN;
}
export const numOrNull=v=>{if(v==null||v==='') return null;const n=Number(v);return isFinite(n)&&n>=0&&n<1e9?n:null;};
export const brl=v=>BRL.format(Number(v)||0);
