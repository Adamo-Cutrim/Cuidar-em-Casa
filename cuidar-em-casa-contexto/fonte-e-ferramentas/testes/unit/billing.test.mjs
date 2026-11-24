// Testes de site/src/domain/billing.js. Regras: BACKEND.md secao 5.2. Registram o comportamento ATUAL.
// "Agora" e injetado (2026-11-23 12:00, segunda-feira): o resultado nao depende do relogio.
import test from 'node:test';
import assert from 'node:assert/strict';
import {monthRange, repData, repEmpLabel, repPacLabel, csvCell, csvNum, repCsv, repText} from '../../../site/src/domain/billing.js';
import {pl} from '../../../site/src/core/text.js';

const AGORA = '2026-11-23 12:00', AGORA_DATE = new Date(2026, 10, 23, 12, 0);
const rec = (o = {}) => ({ativo: true, dias: [1], hora: '09:00', tipo: '', inicio: '2026-11-02', fim: '', ...o});
const P = (id, nome, empresaId, valor, extra = {}) => ({id, nome, empresaId, valor, recExc: [], ...extra});
const V = (id, pacienteId, date, status, hora = '08:00', extra = {}) => ({id, pacienteId, date, hora, tipo: '', obs: '', status, ...extra});

function cenario() {
  return {
    companies: [{id: 'c1', nome: 'Clinica Alfa', cor: 0}, {id: 'c2', nome: 'Zeta Saude', cor: 1}],
    patients: [
      P('p1', 'Ana', 'c1', 100), P('p2', 'Bruno', 'c2', 200),
      P('p3', 'Carla', '', 150, {rec: rec()}),            // particular, toda segunda a partir de 02/11
      P('p4', 'Dani', 'c1', null),                         // sem valor cadastrado
      P('p5', 'Edu', 'removida', 50),                      // empresa que nao existe mais = particular
    ],
    visits: [
      V('v1', 'p1', '2026-11-02', 'feito'), V('v2', 'p1', '2026-11-10', 'feito'),
      V('v3', 'p1', '2026-11-20', 'agendado'),             // passou e continua agendado: conta em Previsto e gera aviso
      V('v4', 'p1', '2026-11-28', 'agendado'),
      V('v5', 'p2', '2026-11-05', 'cancelado'),            // cancelado nao entra
      V('v6', 'p2', '2026-11-06', 'feito'),
      V('v7', 'p4', '2026-11-04', 'feito'), V('v8', 'p4', '2026-11-26', 'agendado'),
      V('v9', 'p5', '2026-11-07', 'feito'),
      V('v10', 'fantasma', '2026-11-08', 'feito'),         // paciente inexistente: ignorado
      V('v11', 'p1', '2026-10-31', 'feito'), V('v12', 'p1', '2026-12-01', 'feito'),   // fora do periodo
      V('v13', 'p3', '2026-11-02', 'feito', '09:00', {serie: 'p3', serieData: '2026-11-02'}),   // segunda 02/11 ja materializada
    ],
  };
}
const REP = (o = {}) => ({by: 'paciente', emp: 'all', pac: 'all', mode: 'mes', from: '2026-11-01', to: '2026-11-30', ...o});
const nb = s => s.replace(/\s/g, ' ');   // espaco inseparavel do BRL vira espaco comum

test('monthRange: primeiro e ultimo dia, virada de ano e bissexto', () => {
  assert.deepEqual(monthRange(2026, 10), {y: 2026, m: 10, from: '2026-11-01', to: '2026-11-30'});
  assert.deepEqual(monthRange(2026, 12), {y: 2027, m: 0, from: '2027-01-01', to: '2027-01-31'});
  assert.deepEqual(monthRange(2026, -1), {y: 2025, m: 11, from: '2025-12-01', to: '2025-12-31'});
  assert.equal(monthRange(2028, 1).to, '2028-02-29'); assert.equal(monthRange(2027, 1).to, '2027-02-28');
});

test('repData por paciente: realizado = feito, previsto = agendado, cancelado fora, tudo do periodo', () => {
  const d = repData(cenario(), REP(), AGORA);
  assert.deepEqual(d.rows.map(r => r.nome), ['Ana', 'Bruno', 'Carla', 'Dani', 'Edu']);
  const por = Object.fromEntries(d.rows.map(r => [r.nome, r]));
  assert.deepEqual([por.Ana.feitos, por.Ana.ag, por.Ana.real, por.Ana.prev, por.Ana.valor, por.Ana.empresa], [2, 2, 200, 200, 100, 'Clinica Alfa']);
  assert.deepEqual([por.Bruno.feitos, por.Bruno.ag, por.Bruno.real, por.Bruno.prev, por.Bruno.empresa], [1, 0, 200, 0, 'Zeta Saude']);   // cancelado nao conta
  assert.deepEqual([por.Carla.feitos, por.Carla.ag, por.Carla.real, por.Carla.prev, por.Carla.empresa], [1, 4, 150, 600, 'Particular']);   // 02/11 materializada + 9, 16, 23, 30 virtuais
  assert.deepEqual([por.Dani.feitos, por.Dani.ag, por.Dani.real, por.Dani.prev, por.Dani.valor], [1, 1, 0, 0, null]);                      // sem valor soma 0
  assert.deepEqual([por.Edu.real, por.Edu.empresa], [50, 'Particular']);                                                                    // empresa removida = particular
  assert.deepEqual([d.tot.feitos, d.tot.ag, d.tot.real, d.tot.prev], [6, 7, 600, 800]);
  assert.deepEqual(Object.keys(d.tot.pacs).sort(), ['p1', 'p2', 'p3', 'p4', 'p5']);
});

test('repData: avisos de atendimentos sem valor e de agendados com data passada', () => {
  const d = repData(cenario(), REP(), AGORA);
  assert.equal(d.semValor, 2);   // os dois atendimentos da Dani (feito e agendado)
  assert.equal(d.pend, 4);       // 20/11 da Ana + segundas 9, 16 e 23 (09:00 < 12:00) da Carla; 28/11, 26/11 e 30/11 ainda nao
  assert.equal(repData(cenario(), REP(), '2026-11-23 08:59').pend, 3);   // as 08:59 a segunda de 09:00 ainda nao passou
  assert.equal(repData(cenario(), REP(), '2026-11-23 09:00').pend, 3);   // exatamente 09:00 tambem nao (precisa ser anterior)
  assert.equal(repData(cenario(), REP(), '2026-11-23 09:01').pend, 4);
});

test('repData por empresa: agrupa, particulares por ultimo', () => {
  const d = repData(cenario(), REP({by: 'empresa'}), AGORA);
  assert.deepEqual(d.rows.map(r => [r.key, r.nome]), [['c1', 'Clinica Alfa'], ['c2', 'Zeta Saude'], ['none', 'Particulares']]);
  const [c1, c2, none] = d.rows;
  assert.deepEqual([c1.feitos, c1.ag, c1.real, c1.prev, Object.keys(c1.pacs).length], [3, 3, 200, 200, 2]);
  assert.deepEqual([c2.feitos, c2.ag, c2.real, c2.prev, Object.keys(c2.pacs).length], [1, 0, 200, 0, 1]);
  assert.deepEqual([none.feitos, none.ag, none.real, none.prev, Object.keys(none.pacs).length], [2, 4, 200, 600, 2]);
  assert.deepEqual([d.tot.feitos, d.tot.ag, d.tot.real, d.tot.prev], [6, 7, 600, 800]);
});

test('repData: filtros por empresa e por paciente', () => {
  const nomes = r => repData(cenario(), r, AGORA).rows.map(x => x.nome);
  assert.deepEqual(nomes(REP({emp: 'none'})), ['Carla', 'Edu']);
  assert.deepEqual(nomes(REP({emp: 'c1'})), ['Ana', 'Dani']);
  assert.deepEqual(nomes(REP({emp: 'c2'})), ['Bruno']);
  assert.deepEqual(nomes(REP({pac: 'p1'})), ['Ana']);
  assert.deepEqual(nomes(REP({emp: 'c2', pac: 'p1'})), []);
  const vazio = repData(cenario(), REP({emp: 'c2', pac: 'p1'}), AGORA);
  assert.deepEqual([vazio.rows, vazio.tot.feitos, vazio.tot.real, vazio.semValor, vazio.pend], [[], 0, 0, 0, 0]);
});

test('repData: periodo menor, so um dia, e periodo sem nada', () => {
  assert.deepEqual(repData(cenario(), REP({from: '2026-11-02', to: '2026-11-02'}), AGORA).rows.map(r => r.nome), ['Ana', 'Carla']);
  assert.deepEqual(repData(cenario(), REP({from: '2026-01-01', to: '2026-01-31'}), AGORA).rows, []);
  assert.equal(repData(cenario(), REP({from: '2026-10-31', to: '2026-10-31'}), AGORA).tot.feitos, 1);
});

test('repData: nao altera o estado', () => {
  const s = cenario(); const antes = JSON.stringify(s);
  repData(s, REP(), AGORA); repData(s, REP({by: 'empresa'}), AGORA);
  assert.equal(JSON.stringify(s), antes);
});

test('rotulos dos filtros', () => {
  const s = cenario();
  assert.equal(repEmpLabel(s, REP()), 'Todas'); assert.equal(repEmpLabel(s, REP({emp: 'none'})), 'Particulares');
  assert.equal(repEmpLabel(s, REP({emp: 'c1'})), 'Clinica Alfa'); assert.equal(repEmpLabel(s, REP({emp: 'sumiu'})), 'Todas');
  assert.equal(repPacLabel(s, REP()), 'Todos'); assert.equal(repPacLabel(s, REP({pac: 'p3'})), 'Carla'); assert.equal(repPacLabel(s, REP({pac: 'sumiu'})), 'Todos');
});

test('csvCell: protege contra injecao de formula e escapa ; " e quebras de linha', () => {
  assert.equal(csvCell('\tx'), "'\tx");             // tab no inicio: ganha apostrofo (tab nao exige aspas)
  assert.equal(csvCell('\rx'), '"\'\rx"');          // CR no inicio: apostrofo e, por ter CR, entre aspas
  assert.equal(csvCell('=1+1'), "'=1+1"); assert.equal(csvCell('+55'), "'+55"); assert.equal(csvCell('-3'), "'-3"); assert.equal(csvCell('@a'), "'@a");
  assert.equal(csvCell('Maria'), 'Maria'); assert.equal(csvCell('a;b'), '"a;b"'); assert.equal(csvCell('diz "oi"'), '"diz ""oi"""');
  assert.equal(csvCell('l1\nl2'), '"l1\nl2"'); assert.equal(csvCell(null), ''); assert.equal(csvCell(undefined), ''); assert.equal(csvCell(0), '0'); assert.equal(csvCell(12), '12');
  assert.equal(csvCell('=a;b'), '"\'=a;b"');   // as duas defesas juntas
  assert.equal(csvCell('a-b'), 'a-b');         // o hifen so conta no inicio
});

test('csvNum: duas casas com virgula decimal', () => {
  assert.equal(csvNum(1234.5), '1234,50'); assert.equal(csvNum(0), '0,00'); assert.equal(csvNum('12'), '12,00'); assert.equal(csvNum(0.005), '0,01');
  assert.equal(csvNum(1e6), '1000000,00'); assert.equal(csvNum(150), '150,00');
});

test('repCsv por paciente: BOM, separador ;, CRLF, cabecalho e totais', () => {
  const t = repCsv(cenario(), REP(), AGORA_DATE);
  assert.equal(t[0], '\ufeff');
  const L = t.slice(1).split('\r\n');
  assert.deepEqual(L.slice(0, 7), ['Relatório de faturamento', 'Período;01/11/2026 a 30/11/2026', 'Agrupado por;Paciente', 'Empresa;Todas', 'Paciente;Todos', 'Gerado em;23/11/2026 12:00', '']);
  assert.equal(L[7], 'Paciente;Empresa;Atendimentos feitos;Valor atual por atendimento;Valor realizado;Atendimentos agendados;Valor previsto');
  assert.deepEqual(L.slice(8), [
    'Ana;Clinica Alfa;2;100,00;200,00;2;200,00', 'Bruno;Zeta Saude;1;200,00;200,00;0;0,00', 'Carla;Particular;1;150,00;150,00;4;600,00',
    'Dani;Clinica Alfa;1;;0,00;1;0,00', 'Edu;Particular;1;50,00;50,00;0;0,00', 'Total;;6;;600,00;7;800,00']);
});

test('repCsv por empresa e com filtros', () => {
  const L = repCsv(cenario(), REP({by: 'empresa', emp: 'none'}), AGORA_DATE).slice(1).split('\r\n');
  assert.deepEqual(L.slice(0, 5), ['Relatório de faturamento', 'Período;01/11/2026 a 30/11/2026', 'Agrupado por;Empresa', 'Empresa;Particulares', 'Paciente;Todos']);
  assert.equal(L[7], 'Empresa;Pacientes atendidos;Atendimentos feitos;Valor realizado;Atendimentos agendados;Valor previsto');
  assert.deepEqual(L.slice(8), ['Particulares;2;2;200,00;4;600,00', 'Total;2;2;200,00;4;600,00']);
  const todas = repCsv(cenario(), REP({by: 'empresa'}), AGORA_DATE).slice(1).split('\r\n').slice(8);
  assert.deepEqual(todas, ['Clinica Alfa;2;3;200,00;3;200,00', 'Zeta Saude;1;1;200,00;0;0,00', 'Particulares;2;2;200,00;4;600,00', 'Total;5;6;600,00;7;800,00']);
});

test('repCsv: nome de paciente que parece formula sai protegido', () => {
  const s = cenario(); s.patients[0].nome = '=CMD|calc'; s.patients[0].empresaId = '';
  const L = repCsv(s, REP({pac: 'p1'}), AGORA_DATE).slice(1).split('\r\n');
  assert.equal(L[8].startsWith("'=CMD|calc;"), true, L[8]);
});

test('repCsv sem atendimentos: so cabecalho e total zerado', () => {
  const L = repCsv(cenario(), REP({from: '2026-01-01', to: '2026-01-31'}), AGORA_DATE).slice(1).split('\r\n');
  assert.deepEqual(L.slice(8), ['Total;;0;;0,00;0;0,00']);
});

test('repText: resumo para copiar', () => {
  const L = repText(cenario(), REP(), AGORA).split('\n').map(nb);
  assert.deepEqual(L, [
    'Faturamento de 01/11/2026 a 30/11/2026 (por paciente)',
    'Ana: 2 feitos (R$ 200,00), 2 agendados (R$ 200,00 previsto)',
    'Bruno: 1 feito (R$ 200,00), 0 agendados (R$ 0,00 previsto)',
    'Carla: 1 feito (R$ 150,00), 4 agendados (R$ 600,00 previsto)',
    'Dani: 1 feito (R$ 0,00), 1 agendado (R$ 0,00 previsto)',
    'Edu: 1 feito (R$ 50,00), 0 agendados (R$ 0,00 previsto)',
    'Total: 6 feitos (R$ 600,00), 7 agendados (R$ 800,00 previsto)']);
  assert.equal(repText(cenario(), REP({by: 'empresa'}), AGORA).split('\n')[0], 'Faturamento de 01/11/2026 a 30/11/2026 (por empresa)');
});

test('pl: singular so quando e exatamente 1', () => {
  assert.equal(pl(1, 'feito', 'feitos'), '1 feito'); assert.equal(pl(0, 'feito', 'feitos'), '0 feitos'); assert.equal(pl(2, 'feito', 'feitos'), '2 feitos');
});

// ---- v18a: o valor de um atendimento feito e o que foi guardado ao marcar como feito ----
const cen = (ajusta) => { const c = cenario(); ajusta(c); return c; };
const feitosDe = (c, nome, rep = REP()) => repData(c, rep, AGORA).rows.find(r => r.nome === nome);

test('v18a: mudar o valor do paciente depois NAO altera o que ja foi realizado', () => {
  const c = cen(c => { c.visits.find(v => v.id === 'v1').valorSnapshot = 100; c.visits.find(v => v.id === 'v2').valorSnapshot = 100; c.patients.find(p => p.id === 'p1').valor = 999; });
  const ana = feitosDe(c, 'Ana');
  assert.equal(ana.real, 200);                 // dois feitos de R$ 100 guardados; o valor atual (999) so vale para o Previsto
  assert.equal(ana.prev, 1998);                // dois agendados a 999
});

test('v18a: cada atendimento feito usa o seu proprio valor guardado', () => {
  const c = cen(c => { c.visits.find(v => v.id === 'v1').valorSnapshot = 100; c.visits.find(v => v.id === 'v2').valorSnapshot = 130; });
  assert.equal(feitosDe(c, 'Ana').real, 230);
});

test('v18a: valor guardado null = "sem valor": soma 0 e entra no aviso', () => {
  const c = cen(c => { c.visits.find(v => v.id === 'v1').valorSnapshot = null; c.visits.find(v => v.id === 'v2').valorSnapshot = 100; });
  const d = repData(c, REP({pac: 'p1'}), AGORA);
  assert.equal(d.rows[0].real, 100); assert.equal(d.semValor, 1);
});

test('v18a: valor guardado 0 e um valor (nao entra no aviso de "sem valor")', () => {
  const c = cen(c => { c.visits.find(v => v.id === 'v1').valorSnapshot = 0; c.visits.find(v => v.id === 'v2').valorSnapshot = 0; });
  const d = repData(c, REP({pac: 'p1'}), AGORA); assert.equal(d.rows[0].real, 0); assert.equal(d.semValor, 0);
});

test('v18a: feito SEM o campo (dado antigo) usa o valor atual do paciente, como antes', () => {
  assert.equal(feitosDe(cenario(), 'Ana').real, 200);
  const c = cen(c => { c.patients.find(p => p.id === 'p1').valor = 120; });
  assert.equal(feitosDe(c, 'Ana').real, 240);
});

test('v18a: agendado e virtual usam sempre o valor atual (so o feito e congelado)', () => {
  const c = cen(c => { c.visits.find(v => v.id === 'v3').valorSnapshot = 5; c.patients.find(p => p.id === 'p3').valor = 300; });   // campo estranho num agendado: ignorado
  assert.equal(feitosDe(c, 'Ana').prev, 100 + 100);
  assert.equal(feitosDe(c, 'Carla').prev, 4 * 300);
});

test('v18a: o relatorio por empresa tambem soma os valores guardados', () => {
  const c = cen(c => { c.visits.find(v => v.id === 'v1').valorSnapshot = 100; c.visits.find(v => v.id === 'v2').valorSnapshot = 100; c.visits.find(v => v.id === 'v7').valorSnapshot = 70; });
  const d = repData(c, REP({by: 'empresa', emp: 'c1'}), AGORA);
  assert.equal(d.rows[0].real, 270); assert.equal(d.tot.real, 270);
});
