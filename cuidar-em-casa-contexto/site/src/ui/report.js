/* Tela do relatório de faturamento (as contas ficam em src/domain/billing.js). */
import {monthRange,noCompany,repData} from '../app/model.js';
import {ui} from '../app/state.js';
import {st} from '../app/store.js';
import {MON} from '../core/dates.js';
import {esc,pl} from '../core/text.js';
import {money} from './bits.js';
import {$,dlFile,ic} from './dom.js';
import {dateField} from './fields.js';
import {openSheet} from './sheet.js';
/* ---------- relatório de faturamento ----------
   Valor de cada atendimento realizado = o valor guardado quando foi marcado como realizado (v18a); agendado = valor atual do paciente. Feito = realizado. Agendado = previsto.
   Cancelados não entram. Atendimentos recorrentes ainda não registrados contam como agendados. */
export let dlRef={save:function(o){dlFile(o.filename,o.data,'text/csv');return Promise.resolve();}};
const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);
export function repInit(o){
  const n=new Date(),r=monthRange(n.getFullYear(),n.getMonth());
  ui.rep={by:o.by==='empresa'?'empresa':'paciente',emp:o.emp||'all',pac:o.pac||'all',mode:'mes',y:r.y,m:r.m,from:r.from,to:r.to};
}
export function repSetMonth(y,m){const r=monthRange(y,m);ui.rep.y=r.y;ui.rep.m=r.m;ui.rep.from=r.from;ui.rep.to=r.to;}
export function openReport(){
  openSheet('Faturamento','<div id="rep-root"></div>');
  repRender();
}
export function repRender(focusId){
  const root=$('#rep-root');if(!root) return;
  const sc=root.closest('.sheet-body'),y=sc?sc.scrollTop:0;
  const r=ui.rep,d=repData();
  const seg=(items,cur,action,key,label)=>'<div class="seg" role="group" aria-label="'+label+'">'+items.map(i=>'<button type="button" data-action="'+action+'" data-'+key+'="'+i[0]+'" aria-pressed="'+(cur===i[0])+'">'+i[1]+'</button>').join('')+'</div>';
  let h=seg([['mes','Por mês'],['custom','Outro período']],r.mode,'rep-mode','mode','Tipo de período');
  if(r.mode==='mes'){
    h+='<div class="monthnav"><button type="button" class="icon-btn sm" data-action="rep-month" data-dir="-1" aria-label="Mês anterior">'+ic('left')+'</button><span class="mn-t" aria-live="polite">'+cap(MON[r.m])+' de '+r.y+'</span><button type="button" class="icon-btn sm" data-action="rep-month" data-dir="1" aria-label="Próximo mês">'+ic('right')+'</button></div>';
  }else{
    h+='<div class="rep-custom"><label for="r-de">De</label>'+dateField('r-de','de',r.from)+'<label for="r-ate">Até</label>'+dateField('r-ate','ate',r.to)+'<button type="button" class="btn small" data-action="rep-apply">Aplicar período</button><p class="err" id="r-err" role="alert"></p></div>';
  }
  h+='<div class="rep-tiles"><div class="tile real"><span class="tl">Realizado</span><strong class="tv">'+money(d.tot.real)+'</strong><span class="ts">'+pl(d.tot.feitos,'atendimento feito','atendimentos feitos')+'</span></div>'+
     '<div class="tile prev"><span class="tl">Previsto</span><strong class="tv">'+money(d.tot.prev)+'</strong><span class="ts">'+pl(d.tot.ag,'agendado','agendados')+'</span></div></div>';
  h+=seg([['paciente','Por paciente'],['empresa','Por empresa']],r.by,'rep-by','by','Agrupar por');
  const emps='<option value="all"'+(r.emp==='all'?' selected':'')+'>Todas</option><option value="none"'+(r.emp==='none'?' selected':'')+'>Particulares</option>'+st.S.companies.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=>'<option value="'+esc(c.id)+'"'+(r.emp===c.id?' selected':'')+'>'+esc(c.nome)+'</option>').join('');
  const pacs='<option value="all">Todos</option>'+st.S.patients.filter(function(p){return r.emp==='all'||(r.emp==='none'?noCompany(p):p.empresaId===r.emp);}).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(p=>'<option value="'+esc(p.id)+'"'+(r.pac===p.id?' selected':'')+'>'+esc(p.nome)+'</option>').join('');
  h+='<div class="rep-filters"><div><label for="r-emp">Empresa</label><select id="r-emp" data-role="rep-emp">'+emps+'</select></div><div><label for="r-pac">Paciente</label><select id="r-pac" data-role="rep-pac">'+pacs+'</select></div></div>';
  if(!d.rows.length){
    h+='<div class="empty"><p>Nenhum atendimento neste período e com estes filtros.</p></div>';
  }else{
    h+='<ul class="group rep-list">'+d.rows.map(function(x){
      const np=Object.keys(x.pacs).length;
      const sub=(r.by==='empresa'?pl(np,'paciente','pacientes'):esc(x.empresa))+' · '+pl(x.feitos,'feito','feitos')+' · '+pl(x.ag,'agendado','agendados');
      return '<li class="rrow"><span class="rr-main"><span class="row-name">'+esc(x.nome)+'</span><span class="row-sub">'+sub+'</span></span><span class="rr-vals"><span class="rr-real">'+money(x.real)+'</span>'+(x.ag?'<span class="rr-prev">+ '+money(x.prev)+' previsto</span>':'')+'</span></li>';
    }).join('')+'<li class="rrow total"><span class="rr-main"><span class="row-name">Total</span><span class="row-sub">'+pl(d.tot.feitos+d.tot.ag,'atendimento','atendimentos')+'</span></span><span class="rr-vals"><span class="rr-real">'+money(d.tot.real+d.tot.prev)+'</span><span class="rr-prev">realizado + previsto</span></span></li></ul>';
  }
  if(d.semValor) h+='<p class="hint">'+pl(d.semValor,'atendimento sem valor (o paciente não tinha valor cadastrado quando ele foi marcado como realizado, ou ainda não tem) não entrou','atendimentos sem valor (o paciente não tinha valor cadastrado quando foram marcados como realizados, ou ainda não tem) não entraram')+' na soma.</p>';
  if(d.pend) h+='<p class="hint">'+pl(d.pend,'atendimento de data passada ainda não foi marcado como feito e está','atendimentos de datas passadas ainda não foram marcados como feitos e estão')+' em Previsto. Marque como feito na agenda para entrar em Realizado.</p>';
  if(st.hide) h+='<p class="hint">Os valores estão ocultos. O arquivo baixado e o resumo copiado trazem os valores reais.</p><div class="sheet-actions"><button type="button" class="btn" data-action="rep-hide">'+ic('eye')+'Mostrar valores</button></div>';
  h+='<div class="sheet-actions">';
  if(d.rows.length){
    if(dlRef) h+='<button type="button" class="btn primary" data-action="rep-csv">'+ic('download')+'Baixar planilha (CSV)</button>';
    h+='<button type="button" class="btn'+(dlRef?'':' primary')+'" data-action="rep-copy">'+ic('copy')+'Copiar resumo</button>';
  }
  h+='<button type="button" class="btn ghost" data-action="close-sheet">Fechar</button></div>';
  root.innerHTML=h;
  if(sc) sc.scrollTop=y;
  if(focusId){const e=document.getElementById(focusId);if(e) try{e.focus({preventScroll:true});}catch(x){}}
}
