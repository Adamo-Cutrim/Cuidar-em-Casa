/* Backup: baixar e restaurar (só acrescenta; ids próprios da conta). */
import {ensureTipos,findCompany,hasExamples,tiposList} from '../app/model.js';
import {commit,dbId} from '../app/persistence.js';
import {SB} from '../app/session.js';
import {ui} from '../app/state.js';
import {st} from '../app/store.js';
import {isoToBr} from '../core/dates.js';
import {hashUuid} from '../core/ids.js';
import {esc,pl} from '../core/text.js';
import {tipoKey} from '../data/rows.js';
import {normalize,okDate} from '../domain/validation.js';
import {snapshotValue} from '../domain/visit.js';
import {closeSheet,openSheet,toast} from './sheet.js';
import {renderAll} from './views.js';
/* ---------- backup: restaurar (a opção de baixar saiu em 25/11/2026: o backup é automático, ver ../backup/README.md) ----------
   Arquivo JSON {app,versao,exportadoEm,perfil,tipos,empresas,pacientes,atendimentos}.
   Dados de exemplo (ex:true) nunca entram no arquivo nem voltam dele.
   Restaurar só ACRESCENTA: o que já existe (mesmo id) fica como está; nada é apagado nem sobrescrito.
   Regras de BACKEND.md seção 10: paciente de empresa que não está no arquivo vira particular;
   atendimento sem paciente é descartado. Tudo é contado e mostrado antes de confirmar. */
const BKP_MAX=5*1024*1024;
let pendingImport=null;
/* Ids do arquivo -> ids desta conta. A chave primária do banco é o id sozinho: importar o id de OUTRA conta
   bateria numa linha que não é sua e travaria a gravação. Então cada item do arquivo ganha um uuid calculado
   do id original e do usuário: sempre o mesmo para a mesma conta (importar duas vezes não duplica) e diferente
   entre contas. O que já existe aqui, com o id original ou com o calculado, é reconhecido e mantido. */
const bkpUuid=id=>hashUuid(SB.ses.user.id+'|bkp|'+id);
const wasThere=(have,id)=>have.has(id)||have.has(dbId(id))||have.has(bkpUuid(id));
function mapId(have,id){if(have.has(id)) return id;const d=dbId(id);return have.has(d)?d:bkpUuid(id);}
function planImport(o){
  if(!o||typeof o!=='object'||Array.isArray(o)||o.app!=='cuidar-em-casa') return {erro:'Este arquivo não é um backup do Cuidar em Casa.'};
  if(o.versao!==1) return {erro:'Este backup é de uma versão que o app não conhece.'};
  if(!SB.ses||!SB.ses.user) return {erro:'Entre na sua conta para restaurar um backup.'};
  const n=normalize({companies:o.empresas,patients:o.pacientes,visits:o.atendimentos,tipos:o.tipos});
  const realIds=l=>new Set(l.filter(x=>!x.ex).map(x=>x.id));
  const haveC=realIds(st.S.companies),haveP=realIds(st.S.patients),haveV=realIds(st.S.visits);
  const fileC=n.companies.filter(x=>!x.ex),fileP=n.patients.filter(x=>!x.ex),fileV=n.visits.filter(x=>!x.ex);
  const inC=new Set(fileC.map(x=>x.id)),inP=new Set(fileP.map(x=>x.id));
  const r={companies:[],patients:[],visits:[],tipoNovos:[],jaTinha:0,semEmpresa:0,semPaciente:0,
    data:okDate(String(o.exportadoEm||'').slice(0,10))?String(o.exportadoEm).slice(0,10):''};
  fileC.forEach(function(c){
    if(wasThere(haveC,c.id)){r.jaTinha++;return;}
    c.id=mapId(haveC,c.id);r.companies.push(c);
  });
  fileP.forEach(function(p){
    if(wasThere(haveP,p.id)){r.jaTinha++;return;}
    p.id=mapId(haveP,p.id);
    if(p.empresaId){
      if(inC.has(p.empresaId)||wasThere(haveC,p.empresaId)) p.empresaId=mapId(haveC,p.empresaId);
      else{p.empresaId='';r.semEmpresa++;}
    }
    r.patients.push(p);
  });
  fileV.forEach(function(v){
    if(wasThere(haveV,v.id)){r.jaTinha++;return;}
    if(!(inP.has(v.pacienteId)||wasThere(haveP,v.pacienteId))){r.semPaciente++;return;}
    v.id=mapId(haveV,v.id);v.pacienteId=mapId(haveP,v.pacienteId);
    if(v.serie) v.serie=mapId(haveP,v.serie);
    if(v.status==='feito'&&!Object.prototype.hasOwnProperty.call(v,'valorSnapshot')){   /* arquivo de antes da v18a: usa o valor do paciente de agora */
      const pp=r.patients.find(x=>x.id===v.pacienteId)||st.S.patients.find(x=>x.id===v.pacienteId);
      v.valorSnapshot=snapshotValue(pp);
    }
    r.visits.push(v);
  });
  if(Array.isArray(n.tipos)){
    const have=new Set(tiposList().map(tipoKey));
    n.tipos.forEach(function(t){if(!have.has(tipoKey(t))){have.add(tipoKey(t));r.tipoNovos.push(t);}});
  }
  r.nada=!r.companies.length&&!r.patients.length&&!r.visits.length&&!r.tipoNovos.length;
  return r;
}
function openImport(p){
  pendingImport=p.nada?null:p;
  let b;
  if(p.nada) b='<p>Nada novo neste arquivo: tudo o que ele tem já está no app.</p>'+(p.semPaciente?'<p class="hint">'+pl(p.semPaciente,'atendimento foi ignorado porque o paciente dele não está no arquivo.','atendimentos foram ignorados porque o paciente deles não está no arquivo.')+'</p>':'')+
    '<div class="sheet-actions"><button type="button" class="btn primary" data-action="close-sheet">Fechar</button></div>';
  else{
    let li='<li>Serão adicionados: <strong>'+pl(p.companies.length,'empresa','empresas')+'</strong>, <strong>'+pl(p.patients.length,'paciente','pacientes')+'</strong> e <strong>'+pl(p.visits.length,'atendimento','atendimentos')+'</strong>.</li>';
    if(p.tipoNovos.length) li+='<li>'+pl(p.tipoNovos.length,'tipo de atendimento novo.','tipos de atendimento novos.')+'</li>';
    if(p.jaTinha) li+='<li>'+pl(p.jaTinha,'item já existe no app e fica como está.','itens já existem no app e ficam como estão.')+'</li>';
    if(p.semEmpresa) li+='<li>'+pl(p.semEmpresa,'paciente estava ligado a uma empresa que não está no arquivo e entra como particular.','pacientes estavam ligados a uma empresa que não está no arquivo e entram como particulares.')+'</li>';
    if(p.semPaciente) li+='<li>'+pl(p.semPaciente,'atendimento será descartado porque o paciente dele não está no arquivo.','atendimentos serão descartados porque o paciente deles não está no arquivo.')+'</li>';
    if(hasExamples()) li+='<li>Os dados de exemplo serão apagados.</li>';
    b=(p.data?'<p>Backup de '+esc(isoToBr(p.data))+'.</p>':'')+'<ul class="imp-sum">'+li+'</ul><p class="hint">Seus dados atuais não são alterados nem apagados.</p>'+
      '<div class="sheet-actions"><button type="button" class="btn primary" data-action="import-confirm">Restaurar</button><button type="button" class="btn ghost" data-action="close-sheet">Cancelar</button></div>';
  }
  openSheet('Restaurar backup',b);
}
export function applyImport(){
  const p=pendingImport;pendingImport=null;
  if(!p) return;
  st.S.patients=st.S.patients.filter(x=>!x.ex).concat(p.patients);
  st.S.companies=st.S.companies.filter(x=>!x.ex).concat(p.companies);
  st.S.visits=st.S.visits.filter(x=>!x.ex).concat(p.visits);
  if(p.tipoNovos.length){ensureTipos();st.S.tipos=st.S.tipos.concat(p.tipoNovos).slice(0,200);}
  if(ui.fcomp!=='all'&&ui.fcomp!=='none'&&!findCompany(ui.fcomp)) ui.fcomp='all';
  commit();closeSheet();renderAll();
  toast('Backup restaurado: '+pl(p.patients.length,'paciente','pacientes')+' e '+pl(p.visits.length,'atendimento','atendimentos')+'.');
}
export function readBackupFile(file){
  if(!file) return;
  if(file.size>BKP_MAX){toast('Arquivo grande demais para ser um backup.');return;}
  file.text().then(function(txt){
    let o;try{o=JSON.parse(txt);}catch(e){toast('Não foi possível ler este arquivo.');return;}
    const p=planImport(o);
    if(p.erro){toast(p.erro);return;}
    openImport(p);
  },function(){toast('Não foi possível ler este arquivo.');});
}
