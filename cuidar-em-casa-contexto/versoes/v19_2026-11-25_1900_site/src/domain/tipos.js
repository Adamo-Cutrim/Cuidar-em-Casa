/* Identidade dos tipos de atendimento (v18b, decidido em 24/11/2026: tipo ligado à lista).
   Cada tipo tem um id estável; atendimentos e recorrências apontam para esse id. Renomear NÃO pode trocar o id,
   senão tudo o que está ligado a ele ficaria solto. Sem rede, sem DOM, sem estado global. */
import {hashUuid} from '../core/ids.js';

/* Mesma regra do índice único do banco (user_id, lower(btrim(nome))): maiúscula e espaços nas pontas não distinguem tipos. */
export const tipoKey=n=>String(n).trim().toLowerCase();
/* Id do tipo: o que o banco já tem (tipoIds: Map nome->id) ou, se ainda não foi ao banco, um uuid fixo do usuário e do nome. */
export const tipoId=(tipoIds,userId,nome)=>tipoIds.get(tipoKey(nome))||hashUuid(userId+'|tipo|'+tipoKey(nome));
/* O id acompanha o novo nome. Devolve o id. */
export function renameTipoId(tipoIds,userId,antigo,novo){
  const id=tipoId(tipoIds,userId,antigo);
  tipoIds.delete(tipoKey(antigo));
  tipoIds.set(tipoKey(novo),id);
  return id;
}
/* Renomeia na lista, nos atendimentos e nas recorrências (sem diferenciar maiúscula, como o banco) e leva o id junto. */
export function renameTipoNoEstado(state,tipoIds,userId,antigo,novo){
  const k=tipoKey(antigo),i=state.tipos.findIndex(t=>tipoKey(t)===k);
  if(i>-1) state.tipos[i]=novo;else state.tipos.push(novo);
  const fica=i>-1?i:state.tipos.length-1;   /* posição do tipo renomeado (ou do recém-incluído) */
  state.tipos=state.tipos.filter((t,j)=>j===fica||tipoKey(t)!==k);   /* variantes de maiúscula do mesmo tipo viram um só */
  state.visits.forEach(function(v){if(v.tipo&&tipoKey(v.tipo)===k) v.tipo=novo;});
  state.patients.forEach(function(p){if(p.rec&&p.rec.tipo&&tipoKey(p.rec.tipo)===k) p.rec.tipo=novo;});
  renameTipoId(tipoIds,userId,antigo,novo);
}
/* Tira o tipo da lista (sem diferenciar maiúscula). Atendimentos e recorrências que o usam guardam o nome; o banco solta a ligação. */
export function deleteTipoNoEstado(state,nome){
  const k=tipoKey(nome);
  state.tipos=state.tipos.filter(t=>tipoKey(t)!==k);
}
