/* Pedaços de tela reaproveitados: valor, etiqueta da empresa, avatar, campo de tipo. */
import {findCompany,tiposList} from '../app/model.js';
import {st} from '../app/store.js';
import {LIM} from '../core/limits.js';
import {BRL} from '../core/money.js';
import {esc,hashN,initials} from '../core/text.js';
import {ic} from './dom.js';
import {opt} from './forms.js';
export function money(v){
  if(st.hide) return '<span class="money" aria-label="Valor oculto">R$ ••••</span>';
  if(v==null||v==='') return '<span class="money none">Sem valor</span>';
  return '<span class="money">'+esc(BRL.format(Number(v)||0))+'</span>';
}
export function chip(compId){
  const c=findCompany(compId);
  return c?'<span class="chip c'+(c.cor%6)+'">'+esc(c.nome)+'</span>':'<span class="chip none">Particular</span>';
}
export function avatar(p,cls){
  const c=findCompany(p.empresaId);
  const k=c?c.cor%6:hashN(p.id)%6;
  return '<span class="av c'+k+(cls?' '+cls:'')+'" aria-hidden="true">'+esc(initials(p.nome))+'</span>';
}
export const exTag=o=>o&&o.ex?'<span class="ex">exemplo</span>':'';
export const mapsUrl=a=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(a);
export const repMark=()=>'<span class="rep" role="img" aria-label="Atendimento semanal">'+ic('repeat')+'</span>';
export const repIcon=p=>p&&p.rec&&p.rec.ativo?repMark():'';
export function tipoOptions(sel){
  const list=tiposList();
  if(sel&&list.indexOf(sel)<0) list.push(sel);
  return opt('','Sem tipo',!sel)+list.map(t=>opt(t,t,t===sel)).join('')+opt('__novo','+ Criar novo tipo…',false);
}
export function tipoField(id,name,value){
  return '<div class="tipof"><select id="'+id+'" name="'+name+'" data-kind="tipo">'+tipoOptions(value)+'</select>'+
    '<div class="tipo-new" hidden><label for="'+id+'-novo">Nome do novo tipo</label><div class="datef-row"><input id="'+id+'-novo" data-role="tipo-new" type="text" maxlength="'+LIM.tipo+'" autocomplete="off" placeholder="Ex.: Troca de sonda"><button type="button" class="btn" data-action="tipo-add">Adicionar</button></div></div></div>';
}
