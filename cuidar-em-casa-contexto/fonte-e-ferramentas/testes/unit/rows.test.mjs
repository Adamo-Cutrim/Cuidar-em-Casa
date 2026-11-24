// Testes de site/src/data/rows.js: estado do app <-> linhas das tabelas do Supabase (BACKEND.md secoes 9.2 e 9.6).
// Registram o comportamento ATUAL. Inclui ida e volta: estado -> linhas -> estado.
import test from 'node:test';
import assert from 'node:assert/strict';
import {T_ORDER, T_CONFLICT, dbId, tipoKey, dbTime, profRow, desiredRows, rowsToRaw} from '../../../site/src/data/rows.js';
import {hashUuid, isUuid} from '../../../site/src/core/ids.js';
import {normalize} from '../../../site/src/domain/validation.js';

const USER = 'bbbbbbbb-1111-4111-8111-000000000001';
const U = n => 'aaaaaaaa-0000-4000-8000-' + String(n).padStart(12, '0');

function estado() {
  return {
    companies: [
      {id: U(1), nome: 'Clinica A', tipo: 'Clinica', contato: 'zap', valorPadrao: 120, pagamento: '30 dias', obs: 'o', cor: 2},
      {id: 'ex1', nome: 'Empresa Exemplo', ex: true, cor: 0}],
    patients: [
      {id: U(11), nome: 'Maria', nasc: '1944-03-12', tel: '1', respNome: 'Filha', respTel: '2', endereco: 'Rua A', bairro: 'Centro', ref: 'perto', empresaId: U(1), valor: 150,
       condicoes: 'c', alergias: 'a', medicamentos: 'm', obs: 'x', rec: {ativo: true, dias: [1, 3], hora: '09:00', tipo: 'Curativo', inicio: '2026-11-01', fim: ''}, recExc: ['2026-11-11', '2026-11-18']},
      {id: U(12), nome: 'Joao', nasc: '', empresaId: 'removida', valor: null},
      {id: 'ex2', nome: 'Paciente Exemplo', ex: true, empresaId: 'ex1', valor: 10},
      {id: 'p-curto', nome: 'Ana', empresaId: '', valor: 80, rec: {ativo: false, dias: [], hora: '08:00', tipo: '', inicio: '2026-01-01', fim: '2026-12-31'}}],
    visits: [
      {id: U(21), pacienteId: U(11), date: '2026-11-10', hora: '08:30', tipo: 'Curativo', obs: 'n', status: 'feito'},
      {id: 'r-' + U(11) + '-2026-11-23', pacienteId: U(11), date: '2026-11-23', hora: '09:00', tipo: 'Curativo', obs: '', status: 'agendado', serie: U(11), serieData: '2026-11-23'},
      {id: U(23), pacienteId: U(11), date: '2026-11-24', hora: '10:00', tipo: '', obs: '', status: 'agendado', serie: U(12), serieData: '2026-11-24', manual: true},   // serie de OUTRO paciente: nao vira serie_data
      {id: 'v-virtual', pacienteId: U(11), date: '2026-11-25', hora: '09:00', tipo: '', obs: '', status: 'agendado', virtual: true},
      {id: 'v-ex', pacienteId: U(11), date: '2026-11-26', hora: '09:00', tipo: '', obs: '', status: 'agendado', ex: true},
      {id: 'v-orfao', pacienteId: 'nao-existe', date: '2026-11-27', hora: '09:00', tipo: '', obs: '', status: 'agendado'},
      {id: 'v-de-exemplo', pacienteId: 'ex2', date: '2026-11-28', hora: '09:00', tipo: '', obs: '', status: 'agendado'}],
    tipos: ['Curativo', '  Fisio  ', 'curativo', '', '   '],
    perfil: {nome: 'Dra. Bia', tel: '1', profissao: 'Enfermeira', registro: 'COREN 1', cidade: 'SP'},
  };
}

test('constantes: ordem das tabelas e chaves de conflito', () => {
  assert.deepEqual(T_ORDER, ['companies', 'patients', 'visits', 'recurrences', 'recurrence_exceptions', 'service_types']);
  assert.deepEqual(T_CONFLICT, {companies: 'id', patients: 'id', visits: 'id', recurrences: 'patient_id', recurrence_exceptions: 'patient_id,data', service_types: 'id'});
});

test('dbId: uuid fica como esta; o resto vira uuid fixo do usuario', () => {
  assert.equal(dbId(USER, U(1)), U(1));
  const d = dbId(USER, 'p-curto');
  assert.equal(d, hashUuid(USER + '|p-curto')); assert.ok(isUuid(d));
  assert.notEqual(d, dbId('outro-usuario', 'p-curto'));        // cada usuario tem o seu
});

test('tipoKey e dbTime', () => {
  assert.equal(tipoKey('  Curativo '), 'curativo'); assert.equal(tipoKey('Aplicação'), 'aplicação'); assert.equal(tipoKey(5), '5');
  assert.equal(dbTime('09:30:00'), '09:30'); assert.equal(dbTime('09:30'), '09:30'); assert.equal(dbTime(null), ''); assert.equal(dbTime(undefined), ''); assert.equal(dbTime(930), '');
});

test('profRow: sempre as 5 colunas e iniciado=true', () => {
  assert.deepEqual(profRow({nome: 'A', tel: 'T', profissao: 'P', registro: 'R', cidade: 'C', extra: 'x'}), {nome: 'A', tel: 'T', profissao: 'P', registro: 'R', cidade: 'C', iniciado: true});
  assert.deepEqual(profRow(undefined), {nome: '', tel: '', profissao: '', registro: '', cidade: '', iniciado: true});
  assert.deepEqual(profRow({nome: null, tel: undefined}), {nome: '', tel: '', profissao: '', registro: '', cidade: '', iniciado: true});
});

test('desiredRows: tabelas, chaves e exclusoes (exemplo, virtual, orfao)', () => {
  const D = desiredRows(estado(), USER, new Map());
  assert.deepEqual(Object.keys(D), T_ORDER);
  assert.ok(T_ORDER.every(t => D[t] instanceof Map));
  assert.equal(D.companies.size, 1); assert.equal(D.patients.size, 3);                  // sem os dois exemplos
  assert.equal(D.visits.size, 3);                                                        // so U(21), a materializada e U(23)
  assert.ok(![...D.visits.values()].some(v => ['v-virtual', 'v-ex', 'v-orfao', 'v-de-exemplo'].includes(v.id)));
  assert.equal(D.recurrences.size, 2);                                                   // p1 (ativa) e p-curto (desligada)
  assert.equal(D.recurrence_exceptions.size, 2);
});

test('desiredRows: linha de empresa', () => {
  const D = desiredRows(estado(), USER, new Map());
  assert.deepEqual(D.companies.get(U(1)), {id: U(1), user_id: USER, nome: 'Clinica A', tipo: 'Clinica', contato: 'zap', valor_padrao: 120, pagamento: '30 dias', obs: 'o', cor: 2});
});

test('desiredRows: linha de paciente (empresa, nasc vazio, valor nulo, id curto)', () => {
  const D = desiredRows(estado(), USER, new Map());
  assert.deepEqual(D.patients.get(U(11)), {id: U(11), user_id: USER, company_id: U(1), nome: 'Maria', nasc: '1944-03-12', tel: '1', resp_nome: 'Filha', resp_tel: '2', endereco: 'Rua A', bairro: 'Centro', ref: 'perto',
    valor: 150, condicoes: 'c', alergias: 'a', medicamentos: 'm', obs: 'x'});
  const joao = D.patients.get(U(12));
  assert.equal(joao.company_id, null);            // empresa removida: vira particular
  assert.equal(joao.nasc, null);                  // data vazia vira null
  assert.equal(joao.valor, null); assert.equal(joao.tel, ''); assert.equal(joao.obs, '');
  const ana = D.patients.get(dbId(USER, 'p-curto'));
  assert.equal(ana.id, hashUuid(USER + '|p-curto')); assert.equal(ana.company_id, null); assert.equal(ana.valor, 80);
});

test('desiredRows: paciente ligado a empresa de exemplo grava sem empresa', () => {
  const s = estado(); s.patients.push({id: U(13), nome: 'Real com empresa exemplo', empresaId: 'ex1', valor: 1});
  assert.equal(desiredRows(s, USER, new Map()).patients.get(U(13)).company_id, null);
});

test('desiredRows: recorrencia e excecoes', () => {
  const D = desiredRows(estado(), USER, new Map());
  assert.deepEqual(D.recurrences.get(U(11)), {patient_id: U(11), user_id: USER, ativo: true, dias: [1, 3], hora: '09:00', tipo: 'Curativo', inicio: '2026-11-01', fim: null});
  const ana = D.recurrences.get(dbId(USER, 'p-curto'));
  assert.deepEqual([ana.ativo, ana.dias, ana.fim], [false, [], '2026-12-31']);
  assert.deepEqual([...D.recurrence_exceptions.keys()], [U(11) + '|2026-11-11', U(11) + '|2026-11-18']);
  assert.deepEqual(D.recurrence_exceptions.get(U(11) + '|2026-11-18'), {patient_id: U(11), user_id: USER, data: '2026-11-18'});
  const s = estado(); const copia = s.patients[0].rec.dias; desiredRows(s, USER, new Map()).recurrences.get(U(11)).dias.push(9);
  assert.deepEqual(copia, [1, 3]);               // a linha tem copia da lista, nao a mesma
});

test('desiredRows: atendimento (serie_data so quando a serie e do proprio paciente)', () => {
  const D = desiredRows(estado(), USER, new Map());
  assert.deepEqual(D.visits.get(U(21)), {id: U(21), user_id: USER, patient_id: U(11), data: '2026-11-10', hora: '08:30', tipo: 'Curativo', obs: 'n', status: 'feito', serie_data: null, manual: false});
  const idMat = dbId(USER, 'r-' + U(11) + '-2026-11-23');
  assert.equal(idMat, hashUuid(USER + '|r-' + U(11) + '-2026-11-23'));
  assert.equal(D.visits.get(idMat).serie_data, '2026-11-23'); assert.equal(D.visits.get(idMat).patient_id, U(11));
  assert.equal(D.visits.get(U(23)).serie_data, null);          // serie aponta para outro paciente
  assert.equal(D.visits.get(U(23)).manual, true);
});

test('desiredRows: tipos de atendimento reaproveitam o id que ja existe e ignoram repetidos e vazios', () => {
  const D = desiredRows(estado(), USER, new Map([['fisio', 'tid-fisio']]));
  assert.deepEqual([...D.service_types.entries()], [
    [hashUuid(USER + '|tipo|curativo'), {id: hashUuid(USER + '|tipo|curativo'), user_id: USER, nome: 'Curativo'}],   // "curativo" minusculo e repetido: fica o primeiro
    ['tid-fisio', {id: 'tid-fisio', user_id: USER, nome: 'Fisio'}]]);
  const s = estado(); delete s.tipos; assert.equal(desiredRows(s, USER, new Map()).service_types.size, 0);          // nunca criou lista: nada vai ao banco
  s.tipos = []; assert.equal(desiredRows(s, USER, new Map()).service_types.size, 0);
});

test('desiredRows: usuarios diferentes nunca produzem o mesmo id para dados com id curto', () => {
  const a = desiredRows(estado(), USER, new Map()), b = desiredRows(estado(), 'cccccccc-2222-4222-8222-000000000002', new Map());
  const curtoA = [...a.patients.keys()].filter(k => !k.startsWith('aaaaaaaa')), curtoB = [...b.patients.keys()].filter(k => !k.startsWith('aaaaaaaa'));
  assert.equal(curtoA.length, 1); assert.notEqual(curtoA[0], curtoB[0]);
});

test('desiredRows: nao altera o estado e e repetivel', () => {
  const s = estado(), antes = JSON.stringify(s);
  const a = desiredRows(s, USER, new Map()), b = desiredRows(s, USER, new Map());
  assert.equal(JSON.stringify(s), antes);
  for (const t of T_ORDER) assert.deepEqual([...a[t]], [...b[t]]);
});

test('QUIRK registrado (E7): serieData invalida do estado chega a serie_data da linha', () => {
  // normalize deixa passar texto invalido como "campo extra"; aqui ele seria enviado e o Postgres recusaria. Corrigir em PR proprio.
  const s = {companies: [], patients: [{id: U(11), nome: 'M', valor: 1}], visits: [{id: U(21), pacienteId: U(11), date: '2026-11-10', hora: '08:00', tipo: '', obs: '', status: 'agendado', serie: U(11), serieData: '2026-02-30'}], perfil: {}};
  assert.equal(desiredRows(s, USER, new Map()).visits.get(U(21)).serie_data, '2026-02-30');
});

// ---- rowsToRaw: do jeito que o banco devolve ----
const resposta = () => ({
  profile: [{nome: 'Dra. Bia', tel: '1', profissao: 'E', registro: 'R', cidade: 'SP', iniciado: true}],
  companies: [{id: U(1), nome: 'Clinica A', tipo: 'Clinica', contato: 'zap', valor_padrao: 120, pagamento: '30', obs: 'o', cor: 2}],
  patients: [
    {id: U(11), company_id: U(1), nome: 'Maria', nasc: '1944-03-12', tel: '1', resp_nome: 'F', resp_tel: '2', endereco: 'R', bairro: 'C', ref: 'r', valor: 150, condicoes: 'c', alergias: 'a', medicamentos: 'm', obs: 'x'},
    {id: U(12), company_id: null, nome: 'Joao', nasc: null, tel: '', resp_nome: '', resp_tel: '', endereco: '', bairro: '', ref: '', valor: null, condicoes: '', alergias: '', medicamentos: '', obs: ''}],
  visits: [
    {id: U(21), patient_id: U(11), data: '2026-11-10', hora: '08:30:00', tipo: 'Curativo', obs: '', status: 'feito', serie_data: null, manual: false},
    {id: U(22), patient_id: U(11), data: '2026-11-23', hora: '09:00:00', tipo: '', obs: '', status: 'agendado', serie_data: '2026-11-23', manual: true}],
  recurrences: [{patient_id: U(11), ativo: true, dias: [1, 3], hora: '09:00:00', tipo: 'Curativo', inicio: '2026-11-01', fim: null}],
  exceptions: [{patient_id: U(11), data: '2026-11-11'}, {patient_id: U(11), data: '2026-11-18'}],
  serviceTypes: [{id: 't1', nome: 'Curativo'}, {id: 't2', nome: 'Fisio'}],
});

test('rowsToRaw: converte as linhas do banco para o formato do app', () => {
  const {raw, p, tipoIds} = rowsToRaw(resposta());
  assert.deepEqual(raw.companies, [{id: U(1), nome: 'Clinica A', tipo: 'Clinica', contato: 'zap', valorPadrao: 120, pagamento: '30', obs: 'o', cor: 2}]);
  const [maria, joao] = raw.patients;
  assert.deepEqual([maria.empresaId, maria.respNome, maria.respTel, maria.nasc], [U(1), 'F', '2', '1944-03-12']);
  assert.deepEqual(maria.rec, {ativo: true, dias: [1, 3], hora: '09:00', tipo: 'Curativo', inicio: '2026-11-01', fim: ''});   // hora sem segundos, fim null vira ''
  assert.deepEqual(maria.recExc, ['2026-11-11', '2026-11-18']);
  assert.deepEqual([joao.empresaId, joao.nasc, joao.valor, 'rec' in joao, 'recExc' in joao], ['', '', null, false, false]);
  const [v1, v2] = raw.visits;
  assert.deepEqual(v1, {id: U(21), pacienteId: U(11), date: '2026-11-10', hora: '08:30', tipo: 'Curativo', obs: '', status: 'feito'});
  assert.deepEqual(v2, {id: U(22), pacienteId: U(11), date: '2026-11-23', hora: '09:00', tipo: '', obs: '', status: 'agendado', serie: U(11), serieData: '2026-11-23', manual: true});
  assert.deepEqual(raw.tipos, ['Curativo', 'Fisio']); assert.equal(raw.rev, 0);
  assert.deepEqual(raw.perfil, {nome: 'Dra. Bia', tel: '1', profissao: 'E', registro: 'R', cidade: 'SP'});
  assert.equal(p.iniciado, true);
  assert.deepEqual([...tipoIds], [['curativo', 't1'], ['fisio', 't2']]);
});

test('rowsToRaw: banco vazio e sem perfil', () => {
  const vazio = {profile: [], companies: [], patients: [], visits: [], recurrences: [], exceptions: [], serviceTypes: []};
  const {raw, p, tipoIds} = rowsToRaw(vazio);
  assert.deepEqual([raw.companies, raw.patients, raw.visits, raw.tipos, raw.perfil, p, tipoIds.size], [[], [], [], undefined, {}, null, 0]);
  assert.equal(rowsToRaw({...vazio, profile: null}).p, null);
  assert.equal(rowsToRaw({...vazio, profile: 'x'}).p, null);
});

// ---- ida e volta: estado -> linhas -> estado ----
function viraResposta(D, perfil) {
  const rows = t => [...D[t].values()];
  return {
    profile: [{...profRow(perfil)}],
    companies: rows('companies').map(({user_id, ...r}) => r), patients: rows('patients').map(({user_id, ...r}) => r),
    visits: rows('visits').map(({user_id, ...r}) => ({...r, hora: r.hora + ':00'})),
    recurrences: rows('recurrences').map(({user_id, ...r}) => ({...r, hora: r.hora + ':00'})),
    exceptions: rows('recurrence_exceptions').map(({user_id, ...r}) => r), serviceTypes: rows('service_types').map(({user_id, ...r}) => r)};
}
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const porId = l => l.slice().sort((a, b) => a.id < b.id ? -1 : 1);

test('ida e volta: o que o app grava e o que ele carrega de volta e igual (200 estados aleatorios)', () => {
  for (let it = 0; it < 200; it++) {
    const r = rng(500 + it), int = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = a => a[Math.floor(r() * a.length)];
    const dia = () => '2026-' + String(int(1, 12)).padStart(2, '0') + '-' + String(int(1, 28)).padStart(2, '0');
    const companies = Array.from({length: int(0, 3)}, (_, i) => ({id: U(100 + i), nome: 'Emp ' + i, tipo: pick(['', 'Clinica']), contato: pick(['', 'x']), valorPadrao: pick([null, 100, 150.5]), pagamento: '', obs: '', cor: int(0, 5)}));
    const patients = Array.from({length: int(1, 5)}, (_, i) => {
      const p = {id: U(200 + i), nome: 'Pac ' + i, nasc: pick(['', dia()]), tel: pick(['', '119']), respNome: '', respTel: '', endereco: pick(['', 'Rua']), bairro: '', ref: '', empresaId: pick(['', ...companies.map(c => c.id)]),
        valor: pick([null, 0, 100, 80.5]), condicoes: '', alergias: pick(['', 'dipirona']), medicamentos: '', obs: ''};
      if (r() < 0.6) p.rec = {ativo: r() < 0.8, dias: Array.from(new Set(Array.from({length: int(1, 3)}, () => int(0, 6)))), hora: pick(['08:00', '09:30']), tipo: pick(['', 'Curativo']), inicio: dia(), fim: pick(['', dia()])};
      if (p.rec && !p.rec.dias.length) p.rec.ativo = false;
      if (r() < 0.4) p.recExc = Array.from(new Set(Array.from({length: int(1, 3)}, dia)));
      return p;
    });
    const visits = Array.from({length: int(0, 12)}, (_, i) => {
      const p = pick(patients), d = dia(), v = {id: U(300 + i), pacienteId: p.id, date: d, hora: pick(['08:00', '14:15']), tipo: pick(['', 'Curativo']), obs: pick(['', 'n']), status: pick(['agendado', 'feito', 'cancelado'])};
      if (r() < 0.4) { v.serie = p.id; v.serieData = d; } if (r() < 0.3) v.manual = true;
      return v;
    });
    const tipos = r() < 0.6 ? Array.from(new Set(Array.from({length: int(0, 4)}, () => pick(['Curativo', 'Fisio', 'Consulta', 'Coleta'])))) : undefined;
    const perfil = {nome: 'N', tel: '', profissao: '', registro: '', cidade: ''};
    const original = normalize({companies, patients, visits, tipos, perfil});
    const D = desiredRows(original, USER, new Map());
    const {raw} = rowsToRaw(viraResposta(D, original.perfil));
    const volta = normalize(raw);
    // o banco devolve as excecoes ordenadas por data (order=patient_id,data): a ordem delas nao conta na comparacao
    const norm = s => JSON.stringify({c: porId(s.companies), p: porId(s.patients).map(p => p.recExc ? {...p, recExc: p.recExc.slice().sort()} : p), v: porId(s.visits), t: s.tipos && s.tipos.length ? s.tipos : undefined});
    assert.equal(norm(volta), norm(original), 'estado ' + it);
  }
});
