// Testes de site/src/domain/recurrence.js e queries.js. Regras: BACKEND.md secao 5.1. Registram o comportamento ATUAL.
// Datas de referencia: 2026-11-23 e segunda-feira (dom=0 ... sab=6). "Hoje" e injetado, nunca o relogio real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {findPatient, findCompany, pValue, noCompany} from '../../../site/src/domain/queries.js';
import {recOccurs, virtualOf, visitsBetween, visitById, resolveVisit, recSig, closeRecurrence, recText} from '../../../site/src/domain/recurrence.js';
import {iso, fromIso, addDays} from '../../../site/src/core/dates.js';

const rec = (o = {}) => ({ativo: true, dias: [1, 3], hora: '09:00', tipo: 'Curativo', inicio: '2026-11-01', fim: '', ...o}); // seg e qua
const pac = (id = 'p1', o = {}) => ({id, nome: 'Paciente ' + id, empresaId: '', valor: 100, rec: rec(), recExc: [], ...o});
const vis = (o = {}) => ({id: 'v' + Math.random().toString(36).slice(2, 8), pacienteId: 'p1', date: '2026-11-23', hora: '08:00', tipo: '', obs: '', status: 'agendado', ...o});
const estado = (patients = [pac()], visits = [], companies = []) => ({patients, visits, companies});
const HOJE = new Date(2026, 10, 23, 12, 0); // segunda-feira 23/11/2026, meio-dia

test('queries: findPatient, findCompany, pValue, noCompany', () => {
  const s = estado([pac('p1'), pac('p2')], [], [{id: 'c1', nome: 'A'}]);
  assert.equal(findPatient(s, 'p2').id, 'p2'); assert.equal(findPatient(s, 'nope'), undefined);
  assert.equal(findCompany(s, 'c1').nome, 'A'); assert.equal(findCompany(s, 'x'), undefined);
  assert.equal(pValue({valor: 150}), 150); assert.equal(pValue({valor: '150'}), 150); assert.equal(pValue({valor: null}), 0);
  assert.equal(pValue({valor: 'abc'}), 0); assert.equal(pValue({valor: Infinity}), 0); assert.equal(pValue(null), 0); assert.equal(pValue(undefined), 0); assert.equal(pValue({}), 0);
  assert.equal(noCompany(s, {empresaId: ''}), true); assert.equal(noCompany(s, {}), true);
  assert.equal(noCompany(s, {empresaId: 'removida'}), true);      // empresa que nao existe mais = particular
  assert.equal(noCompany(s, {empresaId: 'c1'}), false);
});

test('recOccurs: dia da semana, inicio e fim (inclusivos), fim vazio = sem fim', () => {
  const p = pac();
  assert.equal(recOccurs(p, '2026-11-23', []), true);   // segunda
  assert.equal(recOccurs(p, '2026-11-25', []), true);   // quarta
  assert.equal(recOccurs(p, '2026-11-24', []), false);  // terca
  assert.equal(recOccurs(p, '2026-11-01', []), false);  // domingo, dia do inicio, mas fora de rec.dias
  assert.equal(recOccurs(p, '2026-10-26', []), false);  // segunda antes do inicio
  assert.equal(recOccurs(p, '2027-06-07', []), true);   // fim vazio: continua para sempre
  const q = pac('q', {rec: rec({inicio: '2026-11-02', fim: '2026-11-16'})});
  assert.equal(recOccurs(q, '2026-11-02', []), true);   // inicio inclusivo
  assert.equal(recOccurs(q, '2026-11-16', []), true);   // fim inclusivo
  assert.equal(recOccurs(q, '2026-11-18', []), false);  // depois do fim
  assert.equal(recOccurs(q, '2026-10-28', []), false);  // antes do inicio
});

test('recOccurs: domingo (0) e sabado (6) funcionam', () => {
  const p = pac('p1', {rec: rec({dias: [0, 6], inicio: '2026-01-01'})});
  assert.equal(recOccurs(p, '2026-11-22', []), true); assert.equal(recOccurs(p, '2026-11-28', []), true);
  assert.equal(recOccurs(p, '2026-11-23', []), false);
});

test('recOccurs: desligada, sem regra ou regra quebrada nunca ocorre', () => {
  assert.equal(recOccurs(pac('p', {rec: rec({ativo: false})}), '2026-11-23', []), false);
  assert.equal(recOccurs(pac('p', {rec: undefined}), '2026-11-23', []), false);
  assert.equal(recOccurs(pac('p', {rec: rec({dias: 'x'})}), '2026-11-23', []), false);
  assert.equal(recOccurs(pac('p', {rec: rec({dias: []})}), '2026-11-23', []), false);
  assert.equal(recOccurs(null, '2026-11-23', []), false); assert.equal(recOccurs(undefined, '2026-11-23', []), false);
});

test('recOccurs: excecao (recExc) e visita materializada da mesma serie e data tiram a ocorrencia', () => {
  const p = pac('p1', {recExc: ['2026-11-23']});
  assert.equal(recOccurs(p, '2026-11-23', []), false);
  assert.equal(recOccurs(p, '2026-11-25', []), true);
  const q = pac('p1');
  assert.equal(recOccurs(q, '2026-11-23', [vis({serie: 'p1', serieData: '2026-11-23'})]), false);
  assert.equal(recOccurs(q, '2026-11-23', [vis({serie: 'p1', serieData: '2026-11-25'})]), true);   // outra data
  assert.equal(recOccurs(q, '2026-11-23', [vis({serie: 'p2', serieData: '2026-11-23'})]), true);   // serie de outro paciente
  assert.equal(recOccurs(q, '2026-11-23', [vis({date: '2026-11-23'})]), true);                    // visita avulsa nao conta
  assert.equal(recOccurs(pac('p1', {recExc: undefined}), '2026-11-23', []), true);                // sem lista de excecoes
});

test('virtualOf: forma da ocorrencia virtual', () => {
  const v = virtualOf(pac('p1'), '2026-11-23');
  assert.deepEqual(v, {id: 'r-p1-2026-11-23', pacienteId: 'p1', date: '2026-11-23', hora: '09:00', tipo: 'Curativo', obs: '', status: 'agendado', serie: 'p1', serieData: '2026-11-23', virtual: true});
  assert.equal(virtualOf(pac('p1', {rec: rec({tipo: undefined})}), '2026-11-23').tipo, '');
});

test('visitsBetween: atendimentos reais e ocorrencias virtuais no periodo, extremos inclusivos', () => {
  const real = vis({id: 'v1', pacienteId: 'p9', date: '2026-11-24'});
  const fora = vis({id: 'v2', pacienteId: 'p9', date: '2026-11-30'});
  const s = estado([pac('p1')], [real, fora]);
  const l = visitsBetween(s, '2026-11-23', '2026-11-29');
  assert.deepEqual(l.map(v => v.id), ['v1', 'r-p1-2026-11-23', 'r-p1-2026-11-25']);     // reais primeiro, depois virtuais por data
  assert.equal(visitsBetween(s, '2026-11-24', '2026-11-24').length, 1);                  // um dia so, so o real
  assert.equal(visitsBetween(s, '2026-11-23', '2026-11-23').map(v => v.id)[0], 'r-p1-2026-11-23');
  assert.deepEqual(visitsBetween(s, '2026-11-30', '2026-11-23'), []);                    // periodo invertido
  assert.equal(s.visits.length, 2);                                                       // nao altera o estado
});

test('visitsBetween: materializada aparece uma vez; excecao some; paciente sem recorrencia ativa e ignorado', () => {
  const mat = vis({id: 'real1', pacienteId: 'p1', date: '2026-11-23', hora: '10:30', serie: 'p1', serieData: '2026-11-23', status: 'feito'});
  const s = estado([pac('p1', {recExc: ['2026-11-25']}), pac('p2', {rec: rec({ativo: false})}), pac('p3', {rec: undefined})], [mat]);
  const l = visitsBetween(s, '2026-11-23', '2026-11-29');
  assert.deepEqual(l.map(v => v.id), ['real1']);   // 23 ja materializada, 25 excluida, outros pacientes sem recorrencia ativa
});

test('visitsBetween: varios pacientes, cada um na sua ordem de cadastro por dia', () => {
  const s = estado([pac('a'), pac('b', {rec: rec({dias: [1], hora: '14:00'})})]);
  assert.deepEqual(visitsBetween(s, '2026-11-23', '2026-11-25').map(v => v.id), ['r-a-2026-11-23', 'r-b-2026-11-23', 'r-a-2026-11-25']);
});

test('visitById: real, virtual, e o que nao existe', () => {
  const s = estado([pac('p1', {recExc: ['2026-11-30']})], [vis({id: 'v1'})]);
  assert.equal(visitById(s, 'v1').id, 'v1');
  const v = visitById(s, 'r-p1-2026-11-23');
  assert.equal(v.virtual, true); assert.equal(v.hora, '09:00');
  assert.equal(visitById(s, 'r-p1-2026-11-24'), null);   // terca: nao ocorre
  assert.equal(visitById(s, 'r-p1-2026-11-30'), null);   // excecao
  assert.equal(visitById(s, 'r-nope-2026-11-23'), null); // paciente inexistente
  assert.equal(visitById(s, 'qualquer'), null); assert.equal(visitById(s, ''), null); assert.equal(visitById(s, undefined), null);
});

test('visitById: paciente com id uuid (com hifens) e decodificado pela posicao', () => {
  const id = 'aaaaaaaa-0000-4000-8000-000000000011';
  const s = estado([pac(id)]);
  assert.equal(visitById(s, 'r-' + id + '-2026-11-25').pacienteId, id);
});

test('resolveVisit: materializa a ocorrencia virtual uma vez so', () => {
  const s = estado([pac('p1')]);
  const m = resolveVisit(s, 'r-p1-2026-11-23');
  assert.equal(s.visits.length, 1); assert.equal(s.visits[0], m);
  assert.equal('virtual' in m, false); assert.equal(m.id, 'r-p1-2026-11-23'); assert.equal(m.serie, 'p1'); assert.equal(m.serieData, '2026-11-23');
  assert.equal(resolveVisit(s, 'r-p1-2026-11-23'), m);   // de novo: acha a real pelo id, nao duplica
  assert.equal(s.visits.length, 1);
  assert.equal(recOccurs(s.patients[0], '2026-11-23', s.visits), false);   // a ocorrencia virtual deixou de existir
});

test('resolveVisit: visita real volta como esta; inexistente volta null e nada e criado', () => {
  const r = vis({id: 'v1'}); const s = estado([pac('p1')], [r]);
  assert.equal(resolveVisit(s, 'v1'), r); assert.equal(s.visits.length, 1);
  assert.equal(resolveVisit(s, 'r-p1-2026-11-24'), null); assert.equal(resolveVisit(s, 'nada'), null); assert.equal(s.visits.length, 1);
});

test('recSig: assinatura da regra (so muda quando a regra muda)', () => {
  assert.equal(recSig(rec()), '1,3|09:00|Curativo|2026-11-01|');
  assert.equal(recSig(rec({fim: '2026-12-31', tipo: undefined})), '1,3|09:00||2026-11-01|2026-12-31');
  assert.equal(recSig(rec({dias: [3, 1]})), '3,1|09:00|Curativo|2026-11-01|');   // a ordem dos dias conta
  assert.equal(recSig(rec({ativo: false})), ''); assert.equal(recSig(null), ''); assert.equal(recSig(undefined), '');
  assert.notEqual(recSig(rec()), recSig(rec({hora: '10:00'})));
});

test('recText: texto da regra em portugues', () => {
  const t = r => recText({rec: r});
  assert.equal(t(rec({dias: [1]})), 'Toda semana: segunda, às 09:00.');
  assert.equal(t(rec({dias: [1, 3]})), 'Toda semana: segunda e quarta, às 09:00.');
  assert.equal(t(rec({dias: [5, 1, 3]})), 'Toda semana: segunda, quarta e sexta, às 09:00.');   // segunda primeiro
  assert.equal(t(rec({dias: [0, 6]})), 'Toda semana: sábado e domingo, às 09:00.');             // domingo por ultimo
  assert.equal(t(rec({dias: [2], fim: '2026-12-31'})), 'Toda semana: terça, às 09:00. Até 31/12/2026.');
  assert.equal(t(rec({ativo: false})), ''); assert.equal(recText({}), ''); assert.equal(recText({rec: null}), '');
});

// ---- closeRecurrence: o que acontece ao mudar a regra ----
const seg_qua_passadas = (de, ate) => { const o = []; for (let d = fromIso(de); iso(d) <= ate; d = addDays(d, 1)) if ([1, 3].includes(d.getDay())) o.push(iso(d)); return o; };

test('closeRecurrence: materializa o passado ate ontem, respeita excecoes e nao toca no hoje', () => {
  const p = pac('p1', {rec: rec({inicio: '2026-11-02'}), recExc: ['2026-11-09']});
  const s = estado([p]);
  closeRecurrence(s, p, HOJE);
  const esperado = seg_qua_passadas('2026-11-02', '2026-11-22').filter(d => d !== '2026-11-09');   // 02, 04, 11, 16, 18
  assert.deepEqual(s.visits.map(v => v.date).sort(), esperado);
  assert.equal(s.visits.length, 5);
  assert.ok(s.visits.every(v => v.id === 'r-p1-' + v.date && v.serie === 'p1' && v.serieData === v.date && v.status === 'agendado' && !('virtual' in v)));
  assert.equal(s.visits.some(v => v.date === '2026-11-23'), false);   // hoje (segunda) nao e materializado
  assert.deepEqual(p.recExc, ['2026-11-09']);                          // excecao passada fica
});

test('closeRecurrence: so olha 120 dias para tras', () => {
  const p = pac('p1', {rec: rec({inicio: '2025-01-01'})});
  const s = estado([p]);
  closeRecurrence(s, p, HOJE);
  const piso = iso(addDays(HOJE, -120));   // 2026-07-26
  const esperado = seg_qua_passadas(piso, '2026-11-22');
  assert.equal(piso, '2026-07-26');
  assert.deepEqual(s.visits.map(v => v.date).sort(), esperado);
  assert.ok(s.visits.every(v => v.date >= piso));
});

test('closeRecurrence: apaga o futuro agendado e nao mexido a mao; mantem o resto', () => {
  const p = pac('p1', {rec: rec({inicio: '2026-11-16'}), recExc: ['2026-11-18', '2026-11-23', '2026-11-25', '2026-12-02']});   // inclui a de hoje (23/11)
  const futuroAuto = vis({id: 'f1', date: '2026-11-30', serie: 'p1', serieData: '2026-11-30'});
  const hojeAuto = vis({id: 'f2', date: '2026-11-23', serie: 'p1', serieData: '2026-11-23'});
  const futuroManual = vis({id: 'm1', date: '2026-11-30', hora: '15:00', serie: 'p1', serieData: '2026-12-07', manual: true});
  const futuroFeito = vis({id: 'd1', date: '2026-12-07', serie: 'p1', serieData: '2026-12-07', status: 'feito'});
  const futuroCancel = vis({id: 'c1', date: '2026-12-09', serie: 'p1', serieData: '2026-12-09', status: 'cancelado'});
  const outraSerie = vis({id: 'o1', pacienteId: 'p2', date: '2026-12-14', serie: 'p2', serieData: '2026-12-14'});
  const avulsa = vis({id: 'a1', date: '2026-12-14'});
  const passadaAuto = vis({id: 'pa1', date: '2026-11-18', serie: 'p1', serieData: '2026-11-18'});
  const s = estado([p, pac('p2')], [futuroAuto, hojeAuto, futuroManual, futuroFeito, futuroCancel, outraSerie, avulsa, passadaAuto]);
  closeRecurrence(s, p, HOJE);
  const ids = s.visits.map(v => v.id);
  for (const some of ['f1', 'f2']) assert.equal(ids.includes(some), false, some + ' deveria sumir (futuro ou hoje, agendado, nao manual)');
  for (const fica of ['m1', 'd1', 'c1', 'o1', 'a1', 'pa1']) assert.equal(ids.includes(fica), true, fica + ' deveria ficar');
  assert.deepEqual(p.recExc, ['2026-11-18']);   // so as passadas: a de hoje e as futuras saem
});

test('closeRecurrence: ocorrencia ja materializada nao e duplicada', () => {
  const p = pac('p1', {rec: rec({inicio: '2026-11-16'})});
  const ja = vis({id: 'real', date: '2026-11-16', hora: '11:00', serie: 'p1', serieData: '2026-11-16', status: 'feito'});
  const s = estado([p], [ja]);
  closeRecurrence(s, p, HOJE);
  assert.equal(s.visits.filter(v => v.serieData === '2026-11-16').length, 1);
  assert.equal(s.visits.find(v => v.serieData === '2026-11-16').status, 'feito');
  assert.deepEqual(s.visits.map(v => v.serieData).sort(), ['2026-11-16', '2026-11-18']);
});

test('closeRecurrence: inicio no futuro nao materializa nada', () => {
  const p = pac('p1', {rec: rec({inicio: '2026-12-01'})});
  const s = estado([p]); closeRecurrence(s, p, HOJE);
  assert.deepEqual(s.visits, []);
});
