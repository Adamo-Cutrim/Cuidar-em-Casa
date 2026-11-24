// Testes unitarios de site/src/domain/validation.js. Registram o comportamento ATUAL; dados hostis vem da auditoria de 16/11/2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import {okDate, keepExtra, uniqueIds, normRec, normPatient, normCompany, normVisit, normalize} from '../../../site/src/domain/validation.js';
import {isUuid} from '../../../site/src/core/ids.js';

const U = n => 'aaaaaaaa-0000-4000-8000-%s'.replace('%s', String(n).padStart(12, '0'));

test('okDate: so aceita data ISO que existe de verdade', () => {
  for (const v of ['2026-11-23', '2028-02-29', '1900-01-01', '2100-12-31']) assert.equal(okDate(v), true, v);
  for (const v of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '1899-12-31', '2101-01-01', '23/11/2026', '2026-1-1', '', null, undefined, 20261123, {}, ['2026-11-23']])
    assert.equal(okDate(v), false, String(v));
});

test('normalize: entrada vazia ou lixo vira estado vazio valido', () => {
  for (const entrada of [null, undefined, 42, 'texto', [], {}]) {
    const n = normalize(entrada);
    assert.deepEqual([n.patients, n.companies, n.visits], [[], [], []]);
    assert.equal(n.rev, 0); assert.equal(n.persisted, true); assert.equal(n.tipos, undefined);
    assert.deepEqual(n.perfil, {nome: '', tel: '', profissao: '', registro: '', cidade: ''});
  }
});

test('normalize: listas que nao sao listas sao ignoradas', () => {
  const n = normalize({patients: 'x', companies: {a: 1}, visits: 7});
  assert.deepEqual([n.patients, n.companies, n.visits], [[], [], []]);
});

test('normalize: itens que nao sao objetos sao descartados', () => {
  const n = normalize({patients: [null, 1, 'x', [], {nome: 'ok'}], companies: [undefined, {nome: 'E'}], visits: [null, {date: '2026-11-23'}]});
  assert.equal(n.patients.length, 2); // o array vazio [] e um objeto e vira paciente sem nome
  assert.equal(n.companies.length, 1); assert.equal(n.visits.length, 1);
});

test('normPatient: texto gigante e cortado nos limites', () => {
  const p = normPatient({id: 'a', nome: 'n'.repeat(10000), tel: 't'.repeat(500), endereco: 'e'.repeat(1000), obs: 'o'.repeat(20000), condicoes: 'c'.repeat(6000)});
  assert.equal(p.nome.length, 300); assert.equal(p.tel.length, 60); assert.equal(p.endereco.length, 300);
  assert.equal(p.obs.length, 5000); assert.equal(p.condicoes.length, 5000);
});

test('normPatient: id so com caracteres seguros (vai para atributos HTML)', () => {
  assert.equal(normPatient({id: '"><img src=x onerror=alert(1)>'}).id, 'i___img_src_x_onerror_alert_1__'); // comeca com "__": ganha o prefixo "i"
  assert.equal(normPatient({id: 'ok-1_a'}).id, 'ok-1_a');
  assert.equal(normPatient({id: '__proto__'}).id, 'i__proto__');
  assert.equal(normPatient({id: 'x'.repeat(200)}).id.length, 64);
  assert.ok(isUuid(normPatient({id: ''}).id) && isUuid(normPatient({}).id) && isUuid(normPatient({id: null}).id));
  assert.equal(normPatient({id: 'a', empresaId: '<b>'}).empresaId, '_b_');
});

test('normPatient: data de nascimento invalida vira vazio; valor invalido vira nulo', () => {
  assert.equal(normPatient({nasc: '2026-02-30'}).nasc, ''); assert.equal(normPatient({nasc: '1944-03-12'}).nasc, '1944-03-12');
  assert.equal(normPatient({valor: 'abc'}).valor, null); assert.equal(normPatient({valor: -5}).valor, null);
  assert.equal(normPatient({valor: '150'}).valor, 150); assert.equal(normPatient({valor: 0}).valor, 0);
  assert.equal(normPatient({valor: null}).valor, null); assert.equal(normPatient({valor: ''}).valor, null); assert.equal(normPatient({valor: 1e12}).valor, null);
});

test('normPatient: ex===true marca como exemplo; objeto nao passa', () => {
  assert.equal(normPatient({ex: true}).ex, true);
  assert.equal('ex' in normPatient({ex: {}}), false); assert.equal('ex' in normPatient({}), false);
});

test('E7 corrigido: ex que nao e true nao passa como "campo extra" (antes ex:"sim" ou ex:1 virava exemplo)', () => {
  for (const v of ['true', 1, 'sim', false, 0]) assert.equal('ex' in normPatient({ex: v}), false, JSON.stringify(v));
  for (const v of ['true', 1]) { assert.equal('ex' in normCompany({ex: v}), false); assert.equal('ex' in normVisit({date: '2026-11-23', ex: v}), false); }
});

test('normPatient: recorrencia e excecoes', () => {
  const p = normPatient({id: 'p', rec: {ativo: true, dias: [1, 3], hora: '09:00', tipo: 'Curativo', inicio: '2026-11-01', fim: ''}, recExc: ['2026-11-11', 'x', '2026-02-30', 5]});
  assert.deepEqual(p.rec, {ativo: true, dias: [1, 3], hora: '09:00', tipo: 'Curativo', inicio: '2026-11-01', fim: ''});
  assert.deepEqual(p.recExc, ['2026-11-11']);
  assert.equal('rec' in normPatient({rec: null}), false); assert.equal('rec' in normPatient({}), false);
  assert.equal(normPatient({rec: {a: 1}}).rec.ativo, false);   // objeto qualquer vira recorrencia desligada
  assert.equal(normPatient({recExc: Array.from({length: 6000}, () => '2026-11-11')}).recExc.length, 5000);
  assert.deepEqual(normPatient({recExc: [1]}).recExc, []);
});

test('E7 corrigido: rec e recExc que nao sao objeto/lista sao descartados (antes passavam como texto ou numero)', () => {
  for (const v of ['x', 5, true]) { assert.equal('rec' in normPatient({rec: v}), false); assert.equal('recExc' in normPatient({recExc: v}), false); }
});

test('normRec: dias validos, hora e datas com padrao seguro', () => {
  assert.deepEqual(normRec({ativo: true, dias: [1, 1, 9, '3', -1, 2.5, 'x', 6, 0], inicio: '2026-11-01'}).dias, [1, 3, 6, 0]);
  assert.equal(normRec({ativo: true, dias: []}).ativo, false);          // sem dias, nao e recorrente
  assert.equal(normRec({ativo: 'true', dias: [1]}).ativo, false);       // so true de verdade
  assert.equal(normRec({ativo: true, dias: [1], hora: '25:00'}).hora, '08:00');
  assert.equal(normRec({ativo: true, dias: [1], hora: '07:05'}).hora, '07:05');
  assert.equal(normRec({ativo: true, dias: [1], fim: '2026-02-30'}).fim, '');
  assert.equal(normRec({ativo: true, dias: [1], tipo: 'x'.repeat(300)}).tipo.length, 100);
  assert.equal(normRec({dias: 'x'}).ativo, false); assert.deepEqual(normRec({dias: 'x'}).dias, []);
  assert.match(normRec({ativo: true, dias: [1]}).inicio, /^\d{4}-\d{2}-\d{2}$/); // sem inicio: hoje
  assert.equal(normRec(null), null); assert.equal(normRec('x'), null);
});

test('normCompany: cor, valor padrao e exemplo', () => {
  assert.equal(normCompany({nome: 'E', cor: 3}).cor, 3);
  for (const c of [-1, 1000, 1.5, 'x', null, undefined]) assert.equal(normCompany({cor: c}).cor, 0, String(c));
  assert.equal(normCompany({valorPadrao: '120'}).valorPadrao, 120); assert.equal(normCompany({valorPadrao: 'abc'}).valorPadrao, null);
  assert.equal(normCompany({ex: true}).ex, true); assert.equal(normCompany(null), null);
  assert.equal(normCompany({nome: 'n'.repeat(999)}).nome.length, 300);
});

test('normVisit: exige data valida; ajusta hora, status e tipo', () => {
  assert.equal(normVisit({date: '2026-02-30'}), null); assert.equal(normVisit({}), null); assert.equal(normVisit(null), null);
  const v = normVisit({id: 'v1', pacienteId: 'p1', date: '2026-11-23', hora: '9:30', tipo: 't'.repeat(300), status: 'qualquer'});
  assert.equal(v.hora, '08:00'); assert.equal(v.status, 'agendado'); assert.equal(v.tipo.length, 100);
  assert.equal(normVisit({date: '2026-11-23', status: 'feito'}).status, 'feito'); assert.equal(normVisit({date: '2026-11-23', status: 'cancelado'}).status, 'cancelado');
  assert.equal(normVisit({date: '2026-11-23', hora: '23:59'}).hora, '23:59');
  assert.equal(normVisit({date: '2026-11-23', obs: 'o'.repeat(9000)}).obs.length, 5000);
});

test('normVisit: serie, serieData, manual e ex validos', () => {
  const v = normVisit({date: '2026-11-23', serie: 'p<1>', serieData: '2026-11-23', manual: true, ex: true});
  assert.deepEqual([v.serie, v.serieData, v.manual, v.ex], ['p_1_', '2026-11-23', true, true]);
  const w = normVisit({date: '2026-11-23'});
  assert.deepEqual(['serie' in w, 'serieData' in w, 'manual' in w, 'ex' in w], [false, false, false, false]);
});

test('E7 corrigido: serieData invalida e descartada e nao chega ao banco (antes passava como texto e o Postgres recusava o lote)', () => {
  const w = normVisit({date: '2026-11-23', serie: 'p1', serieData: '2026-02-30', manual: 'sim', ex: 1, virtual: true});
  assert.equal('serieData' in w, false); assert.equal('manual' in w, false); assert.equal('ex' in w, false);
  assert.equal('virtual' in w, false);          // "virtual" vindo de fora faria o atendimento nunca ser gravado
  assert.equal(w.serie, 'p1');                  // a serie (o paciente) continua; sem data, a linha vai com serie_data nula
  for (const v of ['', 'x', 20261123, null]) assert.equal('serieData' in normVisit({date: '2026-11-23', serie: 'p1', serieData: v}), false, String(v));
});

test('campos desconhecidos continuam preservados (so os conhecidos e invalidos sao descartados)', () => {
  assert.equal(normVisit({date: '2026-11-23', anotacao: 'x'}).anotacao, 'x');
  assert.equal(normPatient({id: 'a', apelido: 'Zé'}).apelido, 'Zé');
  assert.equal(normCompany({nome: 'E', site: 'w'}).site, 'w');
});

test('keepExtra: preserva so texto, numero finito e booleano; ignora chaves perigosas', () => {
  const dst = {nome: 'fixo'};
  keepExtra({nome: 'sobrescrever?', a: 'x', b: 7, c: true, d: {x: 1}, e: [1], f: NaN, g: Infinity, h: null, i: undefined, j: () => 1, l: 'y'.repeat(6000)}, dst);
  assert.equal(dst.nome, 'fixo');                       // nunca sobrescreve campo ja tratado
  assert.deepEqual([dst.a, dst.b, dst.c], ['x', 7, true]);
  for (const k of ['d', 'e', 'f', 'g', 'h', 'i', 'j']) assert.equal(k in dst, false, k);
  assert.equal(dst.l.length, 5000);
});

test('normalize: __proto__, constructor e prototype nao poluem nada', () => {
  const sujo = JSON.parse('{"patients":[{"id":"a","nome":"x","__proto__":{"polluido":1},"constructor":"c","prototype":"p","extra":"ok"}],"__proto__":{"polluido2":1}}');
  const n = normalize(sujo);
  assert.equal({}.polluido, undefined); assert.equal({}.polluido2, undefined); assert.equal(Object.prototype.polluido, undefined);
  const p = n.patients[0];
  assert.equal(p.extra, 'ok'); assert.equal(Object.hasOwn(p, 'polluido'), false);
  assert.equal(typeof p.constructor, 'function');       // continua o Object.prototype.constructor herdado, nao a string "c"
  assert.equal(Object.hasOwn(p, 'prototype'), false);
});

test('uniqueIds: id repetido ganha id novo, o primeiro fica', () => {
  const l = uniqueIds([{id: 'a'}, {id: 'a'}, {id: 'a'}, {id: 'b'}]);
  assert.equal(l[0].id, 'a'); assert.equal(l[3].id, 'b');
  assert.equal(new Set(l.map(x => x.id)).size, 4);
  assert.ok(isUuid(l[1].id) && isUuid(l[2].id));
});

test('normalize: ids repetidos entre pacientes, empresas e atendimentos ficam unicos dentro de cada lista', () => {
  const n = normalize({patients: [{id: 'x', nome: 'A'}, {id: 'x', nome: 'B'}], companies: [{id: 'x'}, {id: 'x'}], visits: [{id: 'x', date: '2026-11-23'}, {id: 'x', date: '2026-11-24'}]});
  for (const l of [n.patients, n.companies, n.visits]) assert.equal(new Set(l.map(i => i.id)).size, 2);
  assert.deepEqual(n.patients.map(p => p.nome), ['A', 'B']);
});

test('normalize: perfil respeita os limites de LIM', () => {
  const n = normalize({perfil: {nome: 'n'.repeat(200), tel: 't'.repeat(200), profissao: 'p'.repeat(300), registro: 'r'.repeat(300), cidade: 'c'.repeat(300)}});
  assert.deepEqual(Object.values(n.perfil).map(s => s.length), [80, 60, 100, 60, 100]);
  assert.deepEqual(normalize({perfil: 'x'}).perfil, {nome: '', tel: '', profissao: '', registro: '', cidade: ''});
});

test('normalize: tipos sao limpos, sem repeticao exata, no maximo 200 de ate 60 caracteres', () => {
  assert.deepEqual(normalize({tipos: ['  Curativo   simples ', 'Curativo simples', '', '   ', 7, null, 'Fisio']}).tipos, ['Curativo simples', 'Fisio']);
  assert.deepEqual(normalize({tipos: ['A', 'a']}).tipos, ['A', 'a']);   // diferenca de maiuscula conta como outro tipo aqui
  assert.equal(normalize({tipos: ['t'.repeat(100)]}).tipos[0].length, 60);
  assert.equal(normalize({tipos: Array.from({length: 300}, (_, i) => 'tipo ' + i)}).tipos.length, 200);
  assert.deepEqual(normalize({tipos: []}).tipos, []);                    // lista vazia e diferente de "nunca criou lista"
  for (const v of ['x', 5, {}, null, undefined]) assert.equal(normalize({tipos: v}).tipos, undefined, String(v));
});

test('normalize: rev e sempre inteiro nao negativo', () => {
  assert.equal(normalize({rev: 5.9}).rev, 5); assert.equal(normalize({rev: -3}).rev, 0); assert.equal(normalize({rev: 'x'}).rev, 0); assert.equal(normalize({rev: '7'}).rev, 7);
});

test('normalize: campo desconhecido e preservado quando e texto simples, descartado quando e estrutura', () => {
  const n = normalize({patients: [{id: 'a', cor_favorita: 'azul', nivel: 3, aninhado: {x: 1}, lista: [1]}]});
  assert.equal(n.patients[0].cor_favorita, 'azul'); assert.equal(n.patients[0].nivel, 3);
  assert.equal('aninhado' in n.patients[0], false); assert.equal('lista' in n.patients[0], false);
});

test('v18a: normVisit guarda valorSnapshot so em atendimento feito (numero valido, ou null explicito)', () => {
  const f = o => normVisit({date: '2026-11-23', status: 'feito', ...o});
  assert.strictEqual(f({valorSnapshot: 150}).valorSnapshot, 150); assert.strictEqual(f({valorSnapshot: '80.5'}).valorSnapshot, 80.5);
  assert.strictEqual(f({valorSnapshot: 0}).valorSnapshot, 0); assert.strictEqual(f({valorSnapshot: null}).valorSnapshot, null);
  for (const ruim of ['abc', -1, 1e9, NaN, Infinity, {}, []]) assert.strictEqual(f({valorSnapshot: ruim}).valorSnapshot, null, JSON.stringify(ruim));   // invalido = sem valor, nunca vai cru ao banco
  assert.equal('valorSnapshot' in f({}), false);                                  // ausente continua ausente (dado antigo)
  for (const status of ['agendado', 'cancelado', 'qualquer']) assert.equal('valorSnapshot' in normVisit({date: '2026-11-23', status, valorSnapshot: 150}), false, status);
});
