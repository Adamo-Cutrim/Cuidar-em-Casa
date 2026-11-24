// Testes unitarios dos modulos site/src/core/*. Registram o comportamento ATUAL (v17 nao muda comportamento).
// Rodar: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test fonte-e-ferramentas/testes/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {pad, iso, fromIso, addDays, startOfWeek, WD, WDL, MON, nowKey, age, isoToBr, brToIso} from '../../../site/src/core/dates.js';
import {esc, norm, sid, TXT, cleanName, initials, hashN} from '../../../site/src/core/text.js';
import {BRL, parseMoney, numOrNull, brl} from '../../../site/src/core/money.js';
import {uid, UUID_RE, isUuid, hashUuid} from '../../../site/src/core/ids.js';
import {SHORT, LONG, LIM, ISO_D, HHMM} from '../../../site/src/core/limits.js';

test('limites: valores que o banco tambem usa', () => {
  assert.equal(SHORT, 300); assert.equal(LONG, 5000);
  assert.deepEqual(LIM, {nome: 80, tel: 60, tipo: 60, profissao: 100, registro: 60, cidade: 100});
  assert.ok(ISO_D.test('2026-11-23') && !ISO_D.test('23/11/2026'));
  assert.ok(HHMM.test('00:00') && HHMM.test('23:59') && !HHMM.test('24:00') && !HHMM.test('9:30') && !HHMM.test('12:60'));
});

test('datas: iso e fromIso fazem ida e volta no horario local', () => {
  assert.equal(pad(7), '07'); assert.equal(pad(12), '12');
  assert.equal(iso(new Date(2026, 0, 5)), '2026-01-05');
  const d = fromIso('2026-11-23');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 10, 23, 0]);
  for (const s of ['2026-01-01', '2026-12-31', '2028-02-29', '1999-07-09']) assert.equal(iso(fromIso(s)), s);
});

test('datas: addDays atravessa mes, ano e bissexto sem alterar a data original', () => {
  const base = fromIso('2026-01-31');
  assert.equal(iso(addDays(base, 1)), '2026-02-01');
  assert.equal(iso(base), '2026-01-31');
  assert.equal(iso(addDays(fromIso('2026-03-01'), -1)), '2026-02-28');
  assert.equal(iso(addDays(fromIso('2028-02-28'), 1)), '2028-02-29');
  assert.equal(iso(addDays(fromIso('2026-12-31'), 1)), '2027-01-01');
  assert.equal(iso(addDays(fromIso('2026-11-23'), 0)), '2026-11-23');
  assert.equal(iso(addDays(fromIso('2026-11-23'), 365)), '2027-11-23');
});

test('datas: a semana comeca no domingo', () => {
  assert.equal(iso(startOfWeek(fromIso('2026-11-23'))), '2026-11-22'); // segunda
  assert.equal(iso(startOfWeek(fromIso('2026-11-22'))), '2026-11-22'); // domingo
  assert.equal(iso(startOfWeek(fromIso('2026-11-28'))), '2026-11-22'); // sabado
  assert.equal(iso(startOfWeek(fromIso('2026-01-01'))), '2025-12-28'); // virada de ano
});

test('datas: nomes de dias e meses', () => {
  assert.equal(WD.length, 7); assert.equal(WDL.length, 7); assert.equal(MON.length, 12);
  assert.deepEqual([WD[0], WD[6], WDL[0], WDL[6], MON[0], MON[11]], ['dom', 'sáb', 'Domingo', 'Sábado', 'janeiro', 'dezembro']);
  assert.equal(fromIso('2026-11-22').getDay(), 0);
});

test('datas: isoToBr e brToIso', () => {
  assert.equal(isoToBr('2026-11-23'), '23/11/2026');
  assert.equal(isoToBr(''), ''); assert.equal(isoToBr(null), ''); assert.equal(isoToBr(undefined), '');
  assert.equal(brToIso('23/11/2026'), '2026-11-23');
  assert.equal(brToIso(' 23/11/2026 '), '2026-11-23');
  assert.equal(brToIso('29/02/2028'), '2028-02-29');
  for (const ruim of ['29/02/2027', '31/04/2026', '31/02/2026', '00/01/2026', '01/13/2026', '01/00/2026', '01/01/1899', '01/01/2101', '1/1/2026', '23-11-2026', '2026-11-23', '', 'abc', '23/11/26'])
    assert.equal(brToIso(ruim), null, ruim);
  assert.equal(brToIso('01/01/1900'), '1900-01-01'); assert.equal(brToIso('31/12/2100'), '2100-12-31');
});

test('datas: age', () => {
  const hoje = new Date(), y = hoje.getFullYear(), m = hoje.getMonth(), d = hoje.getDate();
  const nasc = (anos, dm = 0) => iso(new Date(y - anos, m, d + dm));
  assert.equal(age(nasc(30)), 30);       // faz anos hoje
  assert.equal(age(nasc(30, -1)), 30);   // fez ontem
  assert.equal(age(nasc(30, 1)), 29);    // faz amanha
  assert.equal(age(nasc(0)), 0);
  assert.equal(age(iso(new Date(y + 1, m, d))), null);  // futuro
  assert.equal(age(nasc(130)), null); assert.equal(age(nasc(129)), 129);
  assert.equal(age(''), null); assert.equal(age(null), null);
});

test('datas: nowKey', () => assert.match(nowKey(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/));

test('texto: esc protege os cinco caracteres do HTML', () => {
  assert.equal(esc('<a href="x" onclick=\'y\'>&</a>'), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), ''); assert.equal(esc(undefined), ''); assert.equal(esc(0), '0'); assert.equal(esc(12.5), '12.5');
  assert.equal(esc('já está'), 'já está');
});

test('texto: norm tira acentos e caixa', () => {
  assert.equal(norm('Ação São João'), 'acao sao joao');
  assert.equal(norm(null), ''); assert.equal(norm(undefined), ''); assert.equal(norm('ÀÉÎÕÜ Ç'), 'aeiou c');
});

test('texto: sid deixa so letras ASCII, numeros, _ e -, ate 64 caracteres', () => {
  assert.equal(sid('abc-123_X'), 'abc-123_X');
  assert.equal(sid('<script>"x"'), '_script__x_');
  assert.equal(sid('a b/c'), 'a_b_c');
  assert.equal(sid('é'), '_');
  assert.equal(sid(null), ''); assert.equal(sid(undefined), ''); assert.equal(sid(''), '');
  assert.equal(sid('x'.repeat(100)).length, 64);
  assert.equal(sid('__proto__'), 'i__proto__');
  assert.equal(sid('__x'), 'i__x'); assert.equal(sid('_x'), '_x');
  assert.equal(sid(42), '42');
});

test('texto: TXT aceita texto e numero finito, corta no limite', () => {
  assert.equal(TXT('abc'), 'abc');
  assert.equal(TXT('a'.repeat(400)).length, SHORT);
  assert.equal(TXT('a'.repeat(400), 10).length, 10);
  assert.equal(TXT('a'.repeat(6000), LONG).length, LONG);
  assert.equal(TXT(12.5), '12.5'); assert.equal(TXT(0), '0');
  for (const v of [NaN, Infinity, null, undefined, {}, [], true, () => 1]) assert.equal(TXT(v), '', String(v));
});

test('texto: cleanName, initials, hashN', () => {
  assert.equal(cleanName('  Ana   Maria \n Souza '), 'Ana Maria Souza'); assert.equal(cleanName(null), '');
  assert.equal(initials('maria da silva'), 'MS'); assert.equal(initials('Ana'), 'A');
  assert.equal(initials(''), '?'); assert.equal(initials(null), '?'); assert.equal(initials('  joão   pedro  '), 'JP');
  assert.equal(hashN('abc'), hashN('abc')); assert.notEqual(hashN('abc'), hashN('abd'));
  assert.ok(Number.isInteger(hashN('qualquer')) && hashN('qualquer') >= 0);
});

test('dinheiro: parseMoney (formato brasileiro)', () => {
  assert.equal(parseMoney('1.234,56'), 1234.56);
  assert.equal(parseMoney('150'), 150);
  assert.equal(parseMoney('12,5'), 12.5);
  assert.equal(parseMoney('R$ 99,90'), 99.9);
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney(''), null); assert.equal(parseMoney(null), null); assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('10,999'), 11);          // arredonda para centavos
  assert.equal(parseMoney('1.234.567,89'), 1234567.89);
  assert.ok(Number.isNaN(parseMoney('1,2,3')));    // virgula repetida: invalido
});

test('E6 corrigido: ponto de milhar sem virgula (como se escreve no Brasil)', () => {
  assert.equal(parseMoney('1.234'), 1234);           // antes: 1,23
  assert.equal(parseMoney('1.500'), 1500);
  assert.equal(parseMoney('12.345.678'), 12345678);
  assert.equal(parseMoney('R$ 2.000'), 2000);
  assert.equal(parseMoney(' 1.234 '), 1234);
});

test('E6: ponto com 1 ou 2 casas (ou que nao forma milhar) continua decimal', () => {
  assert.equal(parseMoney('1.5'), 1.5); assert.equal(parseMoney('150.75'), 150.75); assert.equal(parseMoney('0.500'), 0.5);
  assert.equal(parseMoney('1.2345'), 1.23);          // 4 casas: decimal arredondado, como antes
  assert.equal(parseMoney('1234.5'), 1234.5);        // 4 digitos antes do ponto: nao e milhar
  assert.ok(Number.isNaN(parseMoney('1.234.5')));    // mistura invalida
});

test('E6: valor negativo ou grande demais pede um valor valido', () => {
  for (const v of ['-5', '-5,00', 'R$ -150', '5-']) assert.ok(Number.isNaN(parseMoney(v)), v);   // antes: o sinal era descartado e gravava 5
  assert.ok(Number.isNaN(parseMoney('1.000.000.000'))); assert.ok(Number.isNaN(parseMoney('1000000000')));   // mesmo limite de numOrNull (< 1e9)
  assert.equal(parseMoney('999.999.999,99'), 999999999.99);
});

test('dinheiro: numOrNull', () => {
  assert.equal(numOrNull(null), null); assert.equal(numOrNull(''), null); assert.equal(numOrNull(undefined), null);
  assert.equal(numOrNull('12'), 12); assert.equal(numOrNull(0), 0); assert.equal(numOrNull('0'), 0); assert.equal(numOrNull(150.5), 150.5);
  for (const v of ['abc', -1, 1e9, Infinity, NaN, {}]) assert.equal(numOrNull(v), null, String(v));
  assert.equal(numOrNull(999999999.99), 999999999.99);
});

test('dinheiro: BRL e brl', () => {
  assert.equal(BRL.format(1234.5).replace(/\s/g, ' '), 'R$ 1.234,50');
  assert.equal(brl(null).replace(/\s/g, ' '), 'R$ 0,00'); assert.equal(brl('abc').replace(/\s/g, ' '), 'R$ 0,00');
  assert.equal(brl('150').replace(/\s/g, ' '), 'R$ 150,00');
});

test('ids: uid gera uuid v4 diferente a cada chamada', () => {
  const a = uid(), b = uid();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

test('ids: isUuid e UUID_RE', () => {
  assert.ok(isUuid('aaaaaaaa-0000-4000-8000-000000000001'));
  for (const v of ['', 'abc', null, undefined, 42, 'AAAAAAAA-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000', 'p-curto'])
    assert.equal(isUuid(v), false, String(v));
  assert.ok(UUID_RE.test(uid()));
});

test('ids: hashUuid e deterministico, tem formato de uuid v5 e muda com a entrada', () => {
  const a = hashUuid('usuario|r-abc-2026-11-23');
  assert.equal(a, hashUuid('usuario|r-abc-2026-11-23'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(isUuid(a));
  assert.notEqual(a, hashUuid('usuario|r-abc-2026-11-24'));
  assert.notEqual(a, hashUuid('outro|r-abc-2026-11-23'));
  assert.ok(isUuid(hashUuid('')));
});
