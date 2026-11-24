/* Estado do app <-> linhas das tabelas do Supabase (BACKEND.md seções 9.2 e 9.6). Sem rede, sem DOM, sem variável global:
   o usuário, o estado e os ids de tipos já existentes entram como argumento. */
import {isUuid,hashUuid} from '../core/ids.js';

export const T_ORDER=['companies','patients','visits','recurrences','recurrence_exceptions','service_types'];
export const T_CONFLICT={companies:'id',patients:'id',visits:'id',recurrences:'patient_id',recurrence_exceptions:'patient_id,data',service_types:'id'};
/* Id que não é uuid (ex.: ocorrência recorrente que virou registro, "r-{paciente}-{data}") ganha um uuid fixo,
   calculado do id e do usuário: é sempre a mesma linha no banco e não colide com a de outro usuário. */
export const dbId=(userId,id)=>isUuid(id)?id:hashUuid(userId+'|'+id);
export const tipoKey=n=>String(n).trim().toLowerCase();
export const dbTime=h=>typeof h==='string'?h.slice(0,5):'';

export function profRow(perfil){
  const p=perfil||{};
  return {nome:p.nome||'',tel:p.tel||'',profissao:p.profissao||'',registro:p.registro||'',cidade:p.cidade||'',iniciado:true};
}
/* O que o banco deveria ter agora, tabela por tabela: Map(chave -> linha). Toda linha de uma tabela tem as mesmas colunas. */
export function desiredRows(state,userId,tipoIds){
  const uid=userId,D={};
  const dbId_=id=>dbId(userId,id);
  T_ORDER.forEach(function(t){D[t]=new Map();});
  const comps=new Set();
  state.companies.forEach(function(c){
    if(c.ex) return;
    const id=dbId_(c.id);comps.add(c.id);
    D.companies.set(id,{id:id,user_id:uid,nome:c.nome,tipo:c.tipo||'',contato:c.contato||'',valor_padrao:c.valorPadrao==null?null:c.valorPadrao,pagamento:c.pagamento||'',obs:c.obs||'',cor:c.cor||0});
  });
  const pats=new Set();
  state.patients.forEach(function(p){
    if(p.ex) return;
    const id=dbId_(p.id);pats.add(p.id);
    D.patients.set(id,{id:id,user_id:uid,company_id:p.empresaId&&comps.has(p.empresaId)?dbId_(p.empresaId):null,nome:p.nome,nasc:p.nasc||null,tel:p.tel||'',
      resp_nome:p.respNome||'',resp_tel:p.respTel||'',endereco:p.endereco||'',bairro:p.bairro||'',ref:p.ref||'',valor:p.valor==null?null:p.valor,
      condicoes:p.condicoes||'',alergias:p.alergias||'',medicamentos:p.medicamentos||'',obs:p.obs||''});
    const r=p.rec;
    if(r) D.recurrences.set(id,{patient_id:id,user_id:uid,ativo:!!r.ativo,dias:r.dias.slice(),hora:r.hora,tipo:r.tipo||'',inicio:r.inicio,fim:r.fim||null});
    (p.recExc||[]).forEach(function(d){D.recurrence_exceptions.set(id+'|'+d,{patient_id:id,user_id:uid,data:d});});
  });
  state.visits.forEach(function(v){
    if(v.ex||v.virtual||!pats.has(v.pacienteId)) return;
    const id=dbId_(v.id);
    D.visits.set(id,{id:id,user_id:uid,patient_id:dbId_(v.pacienteId),data:v.date,hora:v.hora,tipo:v.tipo||'',obs:v.obs||'',status:v.status,
      serie_data:v.serie===v.pacienteId&&v.serieData?v.serieData:null,manual:!!v.manual});
  });
  if(Array.isArray(state.tipos)) state.tipos.forEach(function(n){
    const k=tipoKey(n);
    if(!k||D.service_types.has(tipoIds.get(k)||hashUuid(uid+'|tipo|'+k))) return;
    const id=tipoIds.get(k)||hashUuid(uid+'|tipo|'+k);
    D.service_types.set(id,{id:id,user_id:uid,nome:String(n).trim()});
  });
  return D;
}
/* Linhas como o banco devolve -> formato do app (ainda por validar: quem chama passa por normalize).
   t = {profile,companies,patients,visits,recurrences,exceptions,serviceTypes}, cada um uma lista de linhas. */
export function rowsToRaw(t){
  const p=(Array.isArray(t.profile)&&t.profile[0])||null;
  const recs=new Map(),excs=new Map();
  t.recurrences.forEach(function(x){recs.set(x.patient_id,{ativo:x.ativo,dias:x.dias,hora:dbTime(x.hora),tipo:x.tipo,inicio:x.inicio,fim:x.fim||''});});
  t.exceptions.forEach(function(x){if(!excs.has(x.patient_id)) excs.set(x.patient_id,[]);excs.get(x.patient_id).push(x.data);});
  const tipoIds=new Map();t.serviceTypes.forEach(function(x){tipoIds.set(tipoKey(x.nome),x.id);});
  const raw={
    companies:t.companies.map(x=>({id:x.id,nome:x.nome,tipo:x.tipo,contato:x.contato,valorPadrao:x.valor_padrao,pagamento:x.pagamento,obs:x.obs,cor:x.cor})),
    patients:t.patients.map(function(x){
      const o={id:x.id,nome:x.nome,nasc:x.nasc||'',tel:x.tel,respNome:x.resp_nome,respTel:x.resp_tel,endereco:x.endereco,bairro:x.bairro,ref:x.ref,
        empresaId:x.company_id||'',valor:x.valor,condicoes:x.condicoes,alergias:x.alergias,medicamentos:x.medicamentos,obs:x.obs};
      if(recs.has(x.id)) o.rec=recs.get(x.id);
      if(excs.has(x.id)) o.recExc=excs.get(x.id);
      return o;
    }),
    visits:t.visits.map(function(x){
      const o={id:x.id,pacienteId:x.patient_id,date:x.data,hora:dbTime(x.hora),tipo:x.tipo,obs:x.obs,status:x.status};
      if(x.serie_data){o.serie=x.patient_id;o.serieData=x.serie_data;}
      if(x.manual) o.manual=true;
      return o;
    }),
    rev:0,
    perfil:p?{nome:p.nome,tel:p.tel,profissao:p.profissao,registro:p.registro,cidade:p.cidade}:{},
    tipos:t.serviceTypes.length?t.serviceTypes.map(x=>x.nome):undefined
  };
  return {raw:raw,p:p,tipoIds:tipoIds};
}
