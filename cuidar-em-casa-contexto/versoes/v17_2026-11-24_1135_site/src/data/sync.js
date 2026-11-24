/* O que enviar ao Supabase, em que ordem e em que tamanho de lote. A rede entra como argumento: api(path,opcoes).
   snap = foto do que o banco já tem (Map por tabela, valores em JSON); só o que mudou desde a foto é enviado. */
import {T_ORDER,T_CONFLICT,desiredRows,profRow} from './rows.js';

export const emptySnap=()=>({companies:new Map(),patients:new Map(),visits:new Map(),recurrences:new Map(),recurrence_exceptions:new Map(),service_types:new Map(),perfil:''});
/* Foto do que as linhas desejadas (D) e o perfil (profRow) representam. */
export function snapshotOf(D,perfilRow){
  const snap=emptySnap();
  T_ORDER.forEach(function(t){D[t].forEach(function(row,k){snap[t].set(k,JSON.stringify(row));});});
  snap.perfil=JSON.stringify(perfilRow);
  return snap;
}
/* Diferença entre o desejado (D) e a foto: o que gravar (up) e o que apagar (del), por tabela. */
export function planSync(D,snap){
  const up={},del={};
  T_ORDER.forEach(function(t){
    up[t]=[];del[t]=[];
    D[t].forEach(function(row,k){const j=JSON.stringify(row);if(snap[t].get(k)!==j) up[t].push({k:k,row:row,json:j});});
    snap[t].forEach(function(j,k){if(!D[t].has(k)) del[t].push(k);});
  });
  return {up:up,del:del};
}
const inList=a=>'in.('+a.map(encodeURIComponent).join(',')+')';
export async function sendDeletes(api,snap,t,keys){
  if(!keys.length) return;
  if(t==='recurrence_exceptions'){
    const byP=new Map();
    keys.forEach(function(k){const i=k.indexOf('|'),pid=k.slice(0,i);if(!byP.has(pid)) byP.set(pid,[]);byP.get(pid).push(k);});
    for(const [pid,ks] of byP){
      for(let i=0;i<ks.length;i+=100){
        const part=ks.slice(i,i+100);
        await api('/rest/v1/'+t+'?patient_id=eq.'+pid+'&data='+inList(part.map(k=>k.slice(k.indexOf('|')+1))),{method:'DELETE',prefer:'return=minimal'});
        part.forEach(function(k){snap[t].delete(k);});
      }
    }
    return;
  }
  const col=t==='recurrences'?'patient_id':'id';
  for(let i=0;i<keys.length;i+=100){
    const part=keys.slice(i,i+100);
    await api('/rest/v1/'+t+'?'+col+'='+inList(part),{method:'DELETE',prefer:'return=minimal'});
    part.forEach(function(k){snap[t].delete(k);});
  }
}
export async function sendUpserts(api,snap,t,list){
  for(let i=0;i<list.length;i+=200){
    const part=list.slice(i,i+200);
    await api('/rest/v1/'+t+'?on_conflict='+T_CONFLICT[t],{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:part.map(x=>x.row)});
    part.forEach(function(x){snap[t].set(x.k,x.json);});
  }
}
/* Grava o que mudou. A foto (snap) é atualizada lote a lote: se falhar no meio, a próxima tentativa manda só o resto. */
export async function pushAll(api,userId,state,snap,tipoIds){
  const pr=profRow(state.perfil),pj=JSON.stringify(pr);
  if(pj!==snap.perfil){
    await api('/rest/v1/profiles?on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:Object.assign({user_id:userId},profRow(state.perfil))});
    snap.perfil=pj;
  }
  const plan=planSync(desiredRows(state,userId,tipoIds),snap),up=plan.up,del=plan.del;
  /* Ordem pensada para as chaves estrangeiras e unicidades: primeiro some o que saiu dos filhos,
     depois grava pais antes de filhos, e por fim apaga pacientes e empresas (o banco cuida das cascatas). */
  for(const t of ['recurrence_exceptions','recurrences','visits','service_types']) await sendDeletes(api,snap,t,del[t]);
  for(const t of T_ORDER) await sendUpserts(api,snap,t,up[t]);
  await sendDeletes(api,snap,'patients',del.patients);
  await sendDeletes(api,snap,'companies',del.companies);
}
