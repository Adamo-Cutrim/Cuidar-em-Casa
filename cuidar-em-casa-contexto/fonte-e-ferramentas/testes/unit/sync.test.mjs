// Testes de site/src/data/sync.js: o que enviar ao Supabase, em que ordem e em que tamanho de lote. Registram o comportamento ATUAL.
// A rede e simulada por um "api" falso que so anota as chamadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySnap, snapshotOf, planSync, sendDeletes, sendUpserts, pushAll} from '../../../site/src/data/sync.js';
import {T_ORDER, desiredRows, profRow} from '../../../site/src/data/rows.js';
import {hashUuid} from '../../../site/src/core/ids.js';
import {renameTipoNoEstado} from '../../../site/src/domain/tipos.js';

const USER = 'bbbbbbbb-1111-4111-8111-000000000001';
const U = n => 'aaaaaaaa-0000-4000-8000-' + String(n).padStart(12, '0');

function estado() {
  return {
    companies: [{id: U(1), nome: 'Clinica A', tipo: '', contato: '', valorPadrao: null, pagamento: '', obs: '', cor: 0}],
    patients: [
      {id: U(11), nome: 'Maria', nasc: '', empresaId: U(1), valor: 150, rec: {ativo: true, dias: [1], hora: '09:00', tipo: '', inicio: '2026-11-01', fim: ''}, recExc: ['2026-11-11', '2026-11-18']},
      {id: U(12), nome: 'Joao', nasc: '', empresaId: '', valor: 100}],
    visits: [
      {id: U(21), pacienteId: U(11), date: '2026-11-10', hora: '08:00', tipo: '', obs: '', status: 'feito'},
      {id: U(22), pacienteId: U(12), date: '2026-11-12', hora: '08:00', tipo: '', obs: '', status: 'agendado'}],
    tipos: ['Curativo'], perfil: {nome: 'Dra', tel: '', profissao: '', registro: '', cidade: ''}};
}
function fakeApi(falhaNaChamada) {
  const calls = []; const api = async (path, o = {}) => { calls.push({path, method: o.method || 'GET', prefer: o.prefer, body: o.body}); if (falhaNaChamada === calls.length) throw {code: 'http', status: 503}; return null; };
  api.calls = calls; return api;
}
const resumo = calls => calls.map(c => c.method + ' ' + c.path.replace(/^\/rest\/v1\//, ''));

test('emptySnap e snapshotOf', () => {
  const e = emptySnap();
  assert.deepEqual(Object.keys(e), [...T_ORDER, 'perfil']); assert.ok(T_ORDER.every(t => e[t] instanceof Map && e[t].size === 0)); assert.equal(e.perfil, '');
  const s = estado(), D = desiredRows(s, USER, new Map()), sn = snapshotOf(D, profRow(s.perfil));
  assert.equal(sn.patients.size, 2); assert.equal(sn.perfil, JSON.stringify(profRow(s.perfil)));
  assert.equal(sn.patients.get(U(12)), JSON.stringify(D.patients.get(U(12))));
});

test('planSync: novo, alterado, removido e igual', () => {
  const s = estado(), D0 = desiredRows(s, USER, new Map()), snap = snapshotOf(D0, profRow(s.perfil));
  let p = planSync(D0, snap); assert.ok(T_ORDER.every(t => p.up[t].length === 0 && p.del[t].length === 0));
  s.patients[1].nome = 'Joao Silva'; s.visits.pop(); s.patients.push({id: U(13), nome: 'Nova', empresaId: '', valor: 1});
  p = planSync(desiredRows(s, USER, new Map()), snap);
  assert.deepEqual(p.up.patients.map(x => x.k).sort(), [U(12), U(13)].sort());     // alterado + novo
  assert.deepEqual(p.del.visits, [U(22)]); assert.deepEqual(p.del.patients, []);
  assert.deepEqual(p.up.patients.find(x => x.k === U(12)).row.nome, 'Joao Silva');
  assert.equal(p.up.patients[0].json, JSON.stringify(p.up.patients[0].row));
});

test('pushAll: primeira gravacao envia perfil e depois cada tabela, pais antes de filhos', async () => {
  const api = fakeApi(), s = estado(), snap = emptySnap();
  await pushAll(api, USER, s, snap, new Map());
  assert.deepEqual(resumo(api.calls), ['POST profiles?on_conflict=user_id', 'POST companies?on_conflict=id', 'POST patients?on_conflict=id', 'POST service_types?on_conflict=id', 'POST visits?on_conflict=id', 'POST recurrences?on_conflict=patient_id',
    'POST recurrence_exceptions?on_conflict=patient_id,data']);   // v18b: o tipo antes de quem o usa
  assert.ok(api.calls.every(c => c.prefer === 'resolution=merge-duplicates,return=minimal'));
  assert.deepEqual(api.calls[0].body, {user_id: USER, ...profRow(s.perfil)});
  assert.equal(api.calls[2].body.length, 2); assert.equal(api.calls[6].body.length, 2);
  assert.deepEqual(snap.patients.size, 2); assert.equal(snap.perfil, JSON.stringify(profRow(s.perfil)));
});

test('pushAll: sem mudanca nao envia nada', async () => {
  const s = estado(), snap = emptySnap(), api = fakeApi();
  await pushAll(api, USER, s, snap, new Map()); api.calls.length = 0;
  await pushAll(api, USER, s, snap, new Map());
  assert.deepEqual(api.calls, []);
});

test('pushAll: so o que mudou; perfil so quando muda', async () => {
  const s = estado(), snap = emptySnap(), api = fakeApi();
  await pushAll(api, USER, s, snap, new Map()); api.calls.length = 0;
  s.patients[1].nome = 'Joao Silva';
  await pushAll(api, USER, s, snap, new Map());
  assert.deepEqual(resumo(api.calls), ['POST patients?on_conflict=id']); assert.deepEqual(api.calls[0].body.map(r => r.nome), ['Joao Silva']);
  api.calls.length = 0; s.perfil.cidade = 'SP';
  await pushAll(api, USER, s, snap, new Map());
  assert.deepEqual(resumo(api.calls), ['POST profiles?on_conflict=user_id']);
});

test('pushAll: apagados, filhos primeiro; pacientes e empresas por ultimo (o banco cuida das cascatas)', async () => {
  const s = estado(), snap = emptySnap(), api = fakeApi();
  await pushAll(api, USER, s, snap, new Map()); api.calls.length = 0;
  s.visits.pop();                                   // some o atendimento da Joao (U22)
  s.patients[0].recExc = ['2026-11-11']; delete s.patients[0].rec;   // Maria perde a recorrencia e uma excecao
  s.tipos = [];                                     // some o tipo "Curativo"
  s.patients.pop(); s.companies.pop(); s.patients[0].empresaId = '';   // some a Joao e a empresa; a Maria fica particular
  await pushAll(api, USER, s, snap, new Map());
  assert.deepEqual(resumo(api.calls), [
    'DELETE recurrence_exceptions?patient_id=eq.' + U(11) + '&data=in.(2026-11-18)',
    'DELETE recurrences?patient_id=in.(' + U(11) + ')',
    'DELETE visits?id=in.(' + U(22) + ')',
    'DELETE service_types?id=in.(' + hashUuid(USER + '|tipo|curativo') + ')',
    'POST patients?on_conflict=id',                 // Maria mudou (sem empresa)
    'DELETE patients?id=in.(' + U(12) + ')',
    'DELETE companies?id=in.(' + U(1) + ')']);
  assert.equal(api.calls[4].body[0].company_id, null);
});

test('pushAll: excecoes apagadas sao agrupadas por paciente', async () => {
  const s = estado(); s.patients[1].recExc = ['2026-11-02']; const snap = emptySnap(), api = fakeApi();
  await pushAll(api, USER, s, snap, new Map()); api.calls.length = 0;
  s.patients[0].recExc = []; s.patients[1].recExc = [];
  await pushAll(api, USER, s, snap, new Map());
  const dels = api.calls.filter(c => c.method === 'DELETE');
  assert.deepEqual(dels.map(c => c.path.replace('/rest/v1/', '')), [
    'recurrence_exceptions?patient_id=eq.' + U(11) + '&data=in.(2026-11-11,2026-11-18)', 'recurrence_exceptions?patient_id=eq.' + U(12) + '&data=in.(2026-11-02)']);
  assert.ok(dels.every(c => c.prefer === 'return=minimal'));
});

test('pushAll: envia em lotes (upsert 200, delete 100)', async () => {
  const s = estado(); s.visits = Array.from({length: 450}, (_, i) => ({id: U(1000 + i), pacienteId: U(11), date: '2026-11-10', hora: '08:00', tipo: '', obs: '', status: 'agendado'}));
  const snap = emptySnap(), api = fakeApi();
  await pushAll(api, USER, s, snap, new Map());
  assert.deepEqual(api.calls.filter(c => c.path.includes('/visits?')).map(c => c.body.length), [200, 200, 50]);
  api.calls.length = 0; s.visits = s.visits.slice(0, 120);
  await pushAll(api, USER, s, snap, new Map());
  const ids = api.calls.filter(c => c.method === 'DELETE').map(c => decodeURIComponent(c.path).match(/in\.\((.*)\)/)[1].split(',').length);
  assert.deepEqual(ids, [100, 100, 100, 30]);      // 330 apagados: 3 lotes de 100 e 1 de 30
  assert.equal(snap.visits.size, 120);
});

test('pushAll: falha no meio mantem o snapshot do que ja foi; a proxima tentativa envia so o resto', async () => {
  const s = estado(); s.visits = Array.from({length: 450}, (_, i) => ({id: U(1000 + i), pacienteId: U(11), date: '2026-11-10', hora: '08:00', tipo: '', obs: '', status: 'agendado'}));
  const snap = emptySnap(), api = fakeApi(6);                // 1 perfil, 2 companies, 3 patients, 4 service_types, 5 visits(1o lote), 6 visits(2o lote) falha
  await assert.rejects(pushAll(api, USER, s, snap, new Map()), {status: 503});
  assert.equal(snap.visits.size, 200);                        // so o primeiro lote entrou no snapshot
  assert.equal(snap.companies.size, 1); assert.equal(snap.perfil, JSON.stringify(profRow(s.perfil)));
  const api2 = fakeApi();
  await pushAll(api2, USER, s, snap, new Map());
  assert.deepEqual(api2.calls.filter(c => c.path.includes('/visits?')).map(c => c.body.length), [200, 50]);   // 450 - 200 ja enviados = 250, em dois lotes
  assert.equal(snap.visits.size, 450);
  assert.ok(!api2.calls.some(c => c.path.includes('/companies?') || c.path.includes('/patients?') || c.path.includes('/profiles?')));   // nada repetido
});

test('sendUpserts e sendDeletes: nao fazem nada com lista vazia', async () => {
  const api = fakeApi(), snap = emptySnap();
  await sendUpserts(api, snap, 'visits', []); await sendDeletes(api, snap, 'visits', []); await sendDeletes(api, snap, 'recurrence_exceptions', []);
  assert.deepEqual(api.calls, []);
});

test('pushAll: tipos de atendimento reaproveitam os ids que ja existem', async () => {
  const s = estado(), snap = emptySnap(), api = fakeApi();
  await pushAll(api, USER, s, snap, new Map([['curativo', 'tid-1']]));
  assert.deepEqual(api.calls.find(c => c.path.includes('service_types')).body, [{id: 'tid-1', user_id: USER, nome: 'Curativo'}]);
});

test('pushAll: nao altera o estado', async () => {
  const s = estado(), antes = JSON.stringify(s); await pushAll(fakeApi(), USER, s, emptySnap(), new Map());
  assert.equal(JSON.stringify(s), antes);
});

test('v18b: tipo novo e atendimento que o usa, no mesmo envio: o tipo vai primeiro (senao o banco recusa a ligacao)', async () => {
  const s = estado(), snap = emptySnap(), api = fakeApi();
  await pushAll(api, USER, s, snap, new Map()); api.calls.length = 0;
  s.tipos.push('Troca de sonda'); s.visits[0].tipo = 'Troca de sonda';
  await pushAll(api, USER, s, snap, new Map());
  assert.deepEqual(resumo(api.calls), ['POST service_types?on_conflict=id', 'POST visits?on_conflict=id']);
  const idTipo = api.calls[0].body[0].id; assert.equal(api.calls[0].body[0].nome, 'Troca de sonda'); assert.equal(api.calls[1].body[0].service_type_id, idTipo);
});

test('v18b: renomear um tipo envia so a linha do tipo e os atendimentos cujo nome mudou, sem trocar o id', async () => {
  const s = estado(), snap = emptySnap(), api = fakeApi(), ids = new Map();
  s.visits[0].tipo = 'Curativo'; s.visits[1].tipo = '';
  await pushAll(api, USER, s, snap, ids); api.calls.length = 0;
  renameTipoNoEstado(s, ids, USER, 'Curativo', 'Curativo simples');
  await pushAll(api, USER, s, snap, ids);
  assert.deepEqual(resumo(api.calls), ['POST service_types?on_conflict=id', 'POST visits?on_conflict=id']);       // nada apagado: o tipo e atualizado no lugar
  assert.equal(api.calls[0].body[0].nome, 'Curativo simples'); assert.equal(api.calls[1].body.length, 1);
  assert.equal(api.calls[1].body[0].service_type_id, api.calls[0].body[0].id);
});
