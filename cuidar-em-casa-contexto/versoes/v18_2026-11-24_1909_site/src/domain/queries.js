/* Consultas sobre o estado (pacientes e empresas). O estado entra como argumento: nada de variável global. */
export const findPatient=(state,id)=>state.patients.find(p=>p.id===id);
export const findCompany=(state,id)=>state.companies.find(c=>c.id===id);
export const pValue=p=>{const n=p?Number(p.valor):0;return isFinite(n)?n:0;};
/* Particular = sem empresa, ou com empresaId de uma empresa que não existe mais. */
export const noCompany=(state,p)=>!p.empresaId||!findCompany(state,p.empresaId);
