// Testes de site/src/domain/visit.js: o valor do atendimento e guardado no momento em que ele e marcado como feito (v18a, decisao de 24/11/2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotValue, setStatus} from '../../../site/src/domain/visit.js';

const pac = valor => ({id: 'p1', nome: 'Maria', valor});
const vis = (status = 'agendado', extra = {}) => ({id: 'v1', pacienteId: 'p1', date: '2026-11-23', hora: '09:00', tipo: '', obs: '', status, ...extra});

test('snapshotValue: o valor cadastrado do paciente naquele momento, ou null quando nao ha valor', () => {
  assert.equal(snapshotValue(pac(150)), 150); assert.equal(snapshotValue(pac('150')), 150); assert.equal(snapshotValue(pac(80.5)), 80.5);
  assert.equal(snapshotValue(pac(0)), 0);                         // zero e um valor (atendimento sem cobranca), nao e "sem valor"
  for (const v of [null, undefined, '', 'abc', NaN, Infinity, -1, 1e9]) assert.equal(snapshotValue(pac(v)), null, String(v));
  assert.equal(snapshotValue(undefined), null); assert.equal(snapshotValue(null), null); assert.equal(snapshotValue({}), null);
});

test('setStatus: ao marcar como feito, guarda o valor atual do paciente', () => {
  const v = vis(); const r = setStatus(v, 'feito', pac(150));
  assert.equal(r, v); assert.equal(v.status, 'feito'); assert.equal(v.valorSnapshot, 150);
});

test('setStatus: paciente sem valor ao marcar como feito guarda null (continua "sem valor")', () => {
  const v = vis(); setStatus(v, 'feito', pac(null));
  assert.equal(v.status, 'feito'); assert.ok('valorSnapshot' in v); assert.equal(v.valorSnapshot, null);
  const w = vis(); setStatus(w, 'feito', undefined); assert.equal(w.valorSnapshot, null);   // paciente removido
});

test('setStatus: valor zero e guardado como zero', () => { const v = vis(); setStatus(v, 'feito', pac(0)); assert.equal(v.valorSnapshot, 0); });

test('setStatus: marcar feito de novo nao troca o valor ja guardado', () => {
  const v = vis('feito', {valorSnapshot: 150});
  setStatus(v, 'feito', pac(200));                                 // o preco do paciente subiu depois; o historico fica
  assert.equal(v.valorSnapshot, 150);
});

test('setStatus: sair de feito apaga o valor guardado (voltar a agendado ou cancelar)', () => {
  for (const novo of ['agendado', 'cancelado']) {
    const v = vis('feito', {valorSnapshot: 150}); setStatus(v, novo, pac(200));
    assert.equal(v.status, novo); assert.equal('valorSnapshot' in v, false, novo);
  }
});

test('setStatus: agendado e cancelado nunca carregam valor', () => {
  const v = vis('agendado'); setStatus(v, 'cancelado', pac(150)); assert.equal('valorSnapshot' in v, false);
  setStatus(v, 'agendado', pac(150)); assert.equal('valorSnapshot' in v, false);
});

test('setStatus: ciclo completo feito -> agendado -> feito pega o valor da epoca da segunda marcacao', () => {
  const v = vis(); setStatus(v, 'feito', pac(150)); assert.equal(v.valorSnapshot, 150);
  setStatus(v, 'agendado', pac(150)); setStatus(v, 'feito', pac(200)); assert.equal(v.valorSnapshot, 200);
});

test('setStatus: nao mexe em mais nada do atendimento', () => {
  const v = vis('agendado', {obs: 'x', manual: true, serie: 'p1', serieData: '2026-11-23'}); const antes = {...v};
  setStatus(v, 'feito', pac(10)); delete v.valorSnapshot; v.status = 'agendado';
  assert.deepEqual(v, antes);
});
