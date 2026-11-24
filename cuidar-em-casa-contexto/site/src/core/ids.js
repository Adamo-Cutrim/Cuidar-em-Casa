/* Ids: uuid v4 e uuid fixo calculado de um texto. Sem DOM, sem estado. */
export const uid=()=>{
  if(crypto.randomUUID) return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const x=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
  return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20);
};
/* ---------- dados: carregar do banco e gravar só o que mudou ----------
   Esquema normalizado (backend/BACKEND.md §9): uma tabela por entidade, ids uuid e colunas próprias.
   O estado S continua no formato da v14; este bloco traduz S para as linhas do banco e de volta.
   Dados de exemplo (ex:true) nunca vão para o banco (ESTRUTURA_BASE §7, regra 9). */
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid=s=>typeof s==='string'&&UUID_RE.test(s);
/* Id que não é uuid (ex.: ocorrência recorrente que virou registro, "r-{paciente}-{data}") ganha um uuid fixo,
   calculado do id e do usuário: é sempre a mesma linha no banco e não colide com a de outro usuário. */
export function hashUuid(s){
  const h=[0x811c9dc5,0x01000193,0x9e3779b9,0x85ebca6b];
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    for(let k=0;k<4;k++) h[k]=Math.imul(h[k]^c,0x01000193+0x2000*k)>>>0;
  }
  for(let k=0;k<4;k++){let x=h[k]^h[(k+1)%4];x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);h[k]=(x^(x>>>16))>>>0;}
  const x=h.map(n=>n.toString(16).padStart(8,'0')).join('');
  return x.slice(0,8)+'-'+x.slice(8,12)+'-5'+x.slice(13,16)+'-'+(8|(parseInt(x.charAt(16),16)&3)).toString(16)+x.slice(17,20)+'-'+x.slice(20,32);
}
