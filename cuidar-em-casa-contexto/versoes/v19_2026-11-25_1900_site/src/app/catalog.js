/* Listas fixas (tipos de empresa e de atendimento) e os dados de exemplo da primeira abertura. */
import {addDays,iso,nowKey,startOfWeek} from '../core/dates.js';
export const TIPOS_EMPRESA=['Operadora de saúde','Clínica','Hospital','Empresa de home care','Particular ou outro'];
export const TIPOS_ATEND=['Consulta','Curativo','Aplicação de medicação','Fisioterapia','Coleta de exame','Avaliação'];
export function makeDemo(){
  const comps=[
    {id:'ex-c1',nome:'Vida Plena Saúde',tipo:'Operadora de saúde',contato:'Marcos, (00) 3000-0101',valorPadrao:180,pagamento:'Pagamento até o dia 10',obs:'',cor:0,ex:true},
    {id:'ex-c2',nome:'Clínica Aurora',tipo:'Clínica',contato:'Dra. Paula, (00) 3000-0202',valorPadrao:150,pagamento:'Pagamento quinzenal',obs:'',cor:1,ex:true},
    {id:'ex-c3',nome:'Cuidar+ Home Care',tipo:'Empresa de home care',contato:'Renata, (00) 3000-0303',valorPadrao:220,pagamento:'Pagamento no dia 5 do mês seguinte',obs:'Enviar relatório mensal por e-mail.',cor:2,ex:true}
  ];
  const pats=[
    {id:'ex-p1',nome:'Helena Prado',nasc:'1944-03-12',tel:'(00) 90000-0101',respNome:'Rita (filha)',respTel:'(00) 90000-0102',endereco:'Rua das Acácias, 128',bairro:'Bela Vista',ref:'Portão azul. O interfone não funciona, ligar ao chegar.',empresaId:'ex-c1',valor:180,condicoes:'Hipertensão e diabetes tipo 2. Úlcera venosa na perna esquerda.',alergias:'Dipirona',medicamentos:'Losartana 50 mg, metformina 850 mg',obs:'Rita acompanha às terças. Trocar o curativo e medir a glicemia.',ex:true},
    {id:'ex-p2',nome:'Antônio Ribeiro',nasc:'1950-08-02',tel:'(00) 90000-0201',respNome:'Marta (esposa)',respTel:'(00) 90000-0202',endereco:'Av. Primavera, 540, apto 32',bairro:'Centro',ref:'Prédio sem elevador, 3º andar.',empresaId:'ex-c1',valor:150,condicoes:'Pós-AVC com fraqueza do lado direito.',alergias:'',medicamentos:'AAS 100 mg, sinvastatina 20 mg',obs:'Prefere atendimento depois do almoço.',ex:true},
    {id:'ex-p3',nome:'Maria das Graças Lima',nasc:'1957-01-20',tel:'(00) 90000-0301',respNome:'',respTel:'',endereco:'Rua dos Ipês, 77',bairro:'Jardim das Flores',ref:'Casa de esquina, muro branco.',empresaId:'ex-c2',valor:150,condicoes:'Artrose de joelho. Em reabilitação.',alergias:'Látex',medicamentos:'Paracetamol se houver dor',obs:'Usar luvas sem látex.',ex:true},
    {id:'ex-p4',nome:'Carlos Eduardo Nunes',nasc:'1972-05-30',tel:'(00) 90000-0401',respNome:'Fernanda (esposa)',respTel:'(00) 90000-0402',endereco:'Rua do Sol, 903',bairro:'Parque Real',ref:'Cachorro no quintal, bater palmas.',empresaId:'ex-c3',valor:220,condicoes:'Pós-operatório de hérnia, ferida em cicatrização.',alergias:'',medicamentos:'Cefalexina até o dia 20',obs:'Fotografar a ferida a cada visita.',ex:true},
    {id:'ex-p5',nome:'Josefa Barbosa',nasc:'1938-09-14',tel:'',respNome:'Joana (cuidadora)',respTel:'(00) 90000-0502',endereco:'Travessa Bom Jesus, 15',bairro:'Vila Nova',ref:'Casa de fundos, entrada pelo corredor.',empresaId:'ex-c3',valor:200,condicoes:'Insuficiência cardíaca. Acamada.',alergias:'Penicilina',medicamentos:'Furosemida 40 mg, carvedilol 6,25 mg',obs:'Medir pressão e peso. Avisar a família se houver inchaço.',ex:true}
  ];
  const ws0=startOfWeek(new Date());
  const recs={'ex-p1':{dias:[1,3,5],hora:'08:30',tipo:'Curativo'},'ex-p3':{dias:[2,4],hora:'11:00',tipo:'Fisioterapia'},'ex-p5':{dias:[1,3,5],hora:'10:00',tipo:'Avaliação e sinais vitais'}};
  pats.forEach(function(p){const r=recs[p.id];if(r) p.rec={ativo:true,dias:r.dias,hora:r.hora,tipo:r.tipo,inicio:iso(ws0),fim:''};});
  const tipos={'ex-p1':'Curativo','ex-p2':'Aplicação de medicação','ex-p3':'Fisioterapia','ex-p4':'Curativo pós-cirúrgico','ex-p5':'Avaliação e sinais vitais'};
  const plan=[[0,2,'15:30'],[1,4,'14:00'],[2,2,'09:00'],[2,4,'15:00'],[3,2,'14:30'],[4,4,'09:30'],[5,2,'10:30']];
  const ws=startOfWeek(new Date()),key=nowKey(),visits=[];
  let n=0;
  [0,7].forEach(function(w){
    plan.forEach(function(p){
      const date=iso(addDays(ws,w+p[0])),pid='ex-p'+p[1];
      visits.push({id:'ex-v'+(++n),pacienteId:pid,date:date,hora:p[2],tipo:tipos[pid],obs:'',status:(date+' '+p[2])<key?'feito':'agendado',ex:true});
    });
  });
  return {patients:pats,companies:comps,visits:visits,rev:0,tipos:Array.from(new Set(TIPOS_ATEND.concat(Object.keys(tipos).map(k=>tipos[k]),Object.keys(recs).map(k=>recs[k].tipo)))),persisted:false};
}
