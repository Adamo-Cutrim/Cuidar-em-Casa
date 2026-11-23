/* Texto: escape para HTML, normalizacao, ids seguros e limites de tamanho. Sem DOM, sem estado. */
import {SHORT} from './limits.js';
export const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const sid=v=>{const t=String(v==null?'':v).replace(/[^\w-]/g,'_').slice(0,64);return /^__/.test(t)?'i'+t:t;};
export const TXT=(v,n)=>typeof v==='string'?v.slice(0,n||SHORT):(typeof v==='number'&&isFinite(v)?String(v).slice(0,n||SHORT):'');
export function initials(n){
  const w=String(n||'?').trim().split(/\s+/).filter(Boolean);
  return ((w[0]||'?').charAt(0)+(w.length>1?w[w.length-1].charAt(0):'')).toUpperCase();
}
export function hashN(s){let h=0;for(const ch of String(s)) h=(h*31+ch.charCodeAt(0))>>>0;return h;}
export const cleanName=n=>String(n||'').trim().replace(/\s+/g,' ');
