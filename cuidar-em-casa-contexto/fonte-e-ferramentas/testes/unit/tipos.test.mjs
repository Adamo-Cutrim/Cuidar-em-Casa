// Testes de site/src/domain/tipos.js: identidade dos tipos de atendimento (v18b, decisao de 24/11/2026: tipo ligado a lista).
// O id do tipo nao pode mudar ao renomear; senao os atendimentos ligados a ele ficariam soltos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tipoKey, tipoId, renameTipoId, renameTipoNoEstado, deleteTipoNoEstado} from '../../../site/src/domain/tipos.js';
import {hashUuid, isUuid} from '../../../site/src/core/ids.js';

const USER = 'bbbbbbbb-1111-4111-8111-000000000001';

test('tipoKey: nao diferencia maiuscula nem espacos nas pontas (a mesma regra do indice unico do banco)', () => {
  assert.equal(tipoKey('  Curativo '), 'curativo'); assert.equal(tipoKey('CURATIVO'), 'curativo'); assert.equal(tipoKey('Aplicação'), 'aplicação'); assert.equal(tipoKey(5), '5');
});

test('tipoId: usa o id que o banco ja tem; senao um uuid fixo do usuario e do nome', () => {
  const m = new Map([['curativo', 'tid-1']]);
  assert.equal(tipoId(m, USER, 'Curativo'), 'tid-1'); assert.equal(tipoId(m, USER, '  CURATIVO '), 'tid-1');
  const novo = tipoId(m, USER, 'Fisioterapia');
  assert.equal(novo, hashUuid(USER + '|tipo|fisioterapia')); assert.ok(isUuid(novo));
  assert.equal(tipoId(m, USER, 'FISIOTERAPIA'), novo);                       // maiuscula nao muda o id
  assert.notEqual(tipoId(m, 'outro-usuario', 'Fisioterapia'), novo);          // cada usuario tem o seu
});

test('renameTipoId: o id acompanha o novo nome (e o nome antigo deixa de ter id)', () => {
  const m = new Map([['curativo', 'tid-1'], ['fisio', 'tid-2']]);
  assert.equal(renameTipoId(m, USER, 'Curativo', 'Curativo simples'), 'tid-1');
  assert.equal(m.get('curativo simples'), 'tid-1'); assert.equal(m.has('curativo'), false); assert.equal(m.get('fisio'), 'tid-2');
});

test('renameTipoId: tipo ainda sem id no mapa leva o id calculado (nao ganha um id novo)', () => {
  const m = new Map();
  const id = renameTipoId(m, USER, 'Curativo', 'Curativo simples');
  assert.equal(id, hashUuid(USER + '|tipo|curativo')); assert.equal(m.get('curativo simples'), id);
});

test('renameTipoId: trocar so a maiuscula mantem o mesmo id', () => {
  const m = new Map([['curativo', 'tid-1']]);
  renameTipoId(m, USER, 'Curativo', 'CURATIVO'); assert.equal(m.get('curativo'), 'tid-1'); assert.equal(m.size, 1);
});

const estado = () => ({
  tipos: ['Consulta', 'Curativo'],
  visits: [{id: 'v1', tipo: 'Curativo'}, {id: 'v2', tipo: 'curativo'}, {id: 'v3', tipo: 'Consulta'}, {id: 'v4', tipo: ''}],
  patients: [{id: 'p1', rec: {ativo: true, tipo: 'Curativo'}}, {id: 'p2', rec: {ativo: true, tipo: 'Consulta'}}, {id: 'p3'}]});

test('renameTipoNoEstado: renomeia na lista, nos atendimentos e nas recorrencias do tipo (sem diferenciar maiuscula)', () => {
  const s = estado(), m = new Map([['curativo', 'tid-1']]);
  renameTipoNoEstado(s, m, USER, 'Curativo', 'Curativo simples');
  assert.deepEqual(s.tipos, ['Consulta', 'Curativo simples']);
  assert.deepEqual(s.visits.map(v => v.tipo), ['Curativo simples', 'Curativo simples', 'Consulta', '']);   // v2 ("curativo" minusculo) tambem: e o mesmo tipo
  assert.equal(s.patients[0].rec.tipo, 'Curativo simples'); assert.equal(s.patients[1].rec.tipo, 'Consulta');
  assert.equal(m.get('curativo simples'), 'tid-1');
});

test('renameTipoNoEstado: tipo que nao estava na lista entra com o novo nome', () => {
  const s = estado(); renameTipoNoEstado(s, new Map(), USER, 'Fantasma', 'Outro');
  assert.deepEqual(s.tipos, ['Consulta', 'Curativo', 'Outro']);
});

test('renameTipoNoEstado: nao mexe em atendimentos de outros tipos nem em pacientes sem recorrencia', () => {
  const s = estado(); const antes = JSON.stringify([s.visits[2], s.visits[3], s.patients[1], s.patients[2]]);
  renameTipoNoEstado(s, new Map(), USER, 'Curativo', 'X');
  assert.equal(JSON.stringify([s.visits[2], s.visits[3], s.patients[1], s.patients[2]]), antes);
});

test('renameTipoNoEstado: variantes de maiuscula do mesmo tipo colapsam em um so (o banco so aceita um por chave)', () => {
  const s = {tipos: ['Curativo', 'Consulta', 'curativo', 'CURATIVO'], visits: [], patients: []};
  renameTipoNoEstado(s, new Map(), USER, 'Curativo', 'Curativo simples');
  assert.deepEqual(s.tipos, ['Curativo simples', 'Consulta']);
});

test('deleteTipoNoEstado: tira o tipo pela chave (sem diferenciar maiuscula) e nao mexe nos atendimentos', () => {
  const s = {tipos: ['Curativo', 'Consulta', 'curativo'], visits: [{id: 'v1', tipo: 'Curativo'}], patients: [{id: 'p1', rec: {tipo: 'Curativo'}}]};
  deleteTipoNoEstado(s, 'CURATIVO');
  assert.deepEqual(s.tipos, ['Consulta']);
  assert.equal(s.visits[0].tipo, 'Curativo'); assert.equal(s.patients[0].rec.tipo, 'Curativo');          // o nome fica no historico
  deleteTipoNoEstado(s, 'nao existe'); assert.deepEqual(s.tipos, ['Consulta']);
});
