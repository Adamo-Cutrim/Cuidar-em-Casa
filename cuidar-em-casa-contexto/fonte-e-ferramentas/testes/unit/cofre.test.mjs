/* v20b: cópia cifrada dos dados no aparelho (src/data/cofre.js).
   A chave dos dados (aleatória) fica trancada pelo PIN (para abrir sem internet) e pelo segredo da conta no servidor
   (para atualizar a cópia com internet sem pedir PIN). Os testes usam a mesma criptografia do navegador (WebCrypto do Node). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../../site/src/data/cofre.js';

const U = 'aaaaaaaa-0000-4000-8000-00000000000a', U2 = 'bbbbbbbb-0000-4000-8000-00000000000b';
const SEG = 'f'.repeat(64), SEG2 = 'e'.repeat(64);
const DADOS = {S: {patients: [{id: 'p1', nome: 'Helena Prado', condicoes: 'Diabetes', alergias: 'Dipirona'}]}, conta: {nome: 'Ana', email: 'ana@x.com'}};
const ITER = 1000;   // nos testes, poucas iterações (rápido); o app usa C.ITERACOES
const novo = (pin = '123456', seg = SEG, u = U) => C.criarCofre(pin, seg, u, ITER);
const txt = o => Buffer.from(JSON.stringify(o, (k, v) => v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v), 'latin1').toString('latin1');

test('PIN válido: exatamente 6 números', () => {
  for (const p of ['123456', '000000', '987654']) assert.equal(C.pinValido(p), true, p);
  for (const p of ['12345', '1234567', '12a456', ' 123456', '', null, undefined, 123456, '１２３４５６']) assert.equal(C.pinValido(p), false, String(p));
});
test('o app usa pelo menos 600 mil iterações no PIN (recomendação OWASP para PBKDF2-SHA256)', () => {
  assert.ok(C.ITERACOES >= 600000);
});
test('criar recusa PIN inválido, segredo curto ou sem usuário', async () => {
  await assert.rejects(C.criarCofre('12345', SEG, U, ITER));
  await assert.rejects(C.criarCofre('123456', 'curto', U, ITER));
  await assert.rejects(C.criarCofre('123456', SEG, '', ITER));
});
test('cifrar e abrir com o PIN devolve exatamente os mesmos dados', async () => {
  const {cofre, chave} = await novo();
  const pacote = await C.cifrar(chave, DADOS, U);
  const k = await C.abrirComPin(cofre, '123456');
  assert.deepEqual(await C.decifrar(k, pacote, U), DADOS);
});
test('abrir com o segredo da conta (com internet, sem PIN) também funciona', async () => {
  const {cofre, chave} = await novo();
  const pacote = await C.cifrar(chave, DADOS, U);
  const k = await C.abrirComSegredo(cofre, SEG);
  assert.deepEqual(await C.decifrar(k, pacote, U), DADOS);
});
test('PIN errado é recusado com code "pin"', async () => {
  const {cofre} = await novo();
  await assert.rejects(C.abrirComPin(cofre, '654321'), e => e && e.code === 'pin');
});
test('segredo errado é recusado', async () => {
  const {cofre} = await novo();
  await assert.rejects(C.abrirComSegredo(cofre, SEG2), e => e && e.code === 'segredo');
});
test('nada do conteúdo aparece em claro no que fica guardado (cofre e pacote)', async () => {
  const {cofre, chave} = await novo();
  const pacote = await C.cifrar(chave, DADOS, U);
  const guardado = txt(cofre) + txt(pacote);
  for (const s of ['Helena', 'Diabetes', 'Dipirona', 'ana@x.com', '123456', SEG]) assert.ok(!guardado.includes(s), s);
});
test('a cópia de uma conta não abre como se fosse de outra (dados presos ao usuário)', async () => {
  const {chave} = await novo();
  const pacote = await C.cifrar(chave, DADOS, U);
  await assert.rejects(C.decifrar(chave, pacote, U2));
});
test('pacote adulterado é recusado (não devolve lixo)', async () => {
  const {chave} = await novo();
  const pacote = await C.cifrar(chave, DADOS, U);
  const b = new Uint8Array(pacote.dados); b[5] ^= 1;
  await assert.rejects(C.decifrar(chave, {...pacote, dados: b}, U));
});
test('cada cifragem usa um vetor novo (mesmos dados, resultados diferentes)', async () => {
  const {chave} = await novo();
  const a = await C.cifrar(chave, DADOS, U), b = await C.cifrar(chave, DADOS, U);
  assert.notDeepEqual(a.iv, b.iv); assert.notDeepEqual(a.dados, b.dados);
});
test('dois aparelhos com o mesmo PIN têm cofres diferentes (sal aleatório)', async () => {
  const a = await novo(), b = await novo();
  assert.notDeepEqual(a.cofre.salPin, b.cofre.salPin);
});
test('trocar o PIN (com o segredo da conta): o novo abre, o antigo não, e a cópia continua legível', async () => {
  const {cofre, chave} = await novo();
  const pacote = await C.cifrar(chave, DADOS, U);
  const novoCofre = await C.trocarPin(cofre, SEG, '777777', ITER);
  await assert.rejects(C.trocarPin(cofre, SEG2, '777777', ITER), e => e && e.code === 'segredo');   // sem o segredo certo (sem login) não troca
  await assert.rejects(C.abrirComPin(novoCofre, '123456'), e => e && e.code === 'pin');
  assert.deepEqual(await C.decifrar(await C.abrirComPin(novoCofre, '777777'), pacote, U), DADOS);
  assert.deepEqual(await C.decifrar(await C.abrirComSegredo(novoCofre, SEG), pacote, U), DADOS);
});
test('o cofre guarda o usuário, a versão e as iterações usadas', async () => {
  const {cofre} = await novo();
  assert.equal(cofre.usuario, U); assert.equal(cofre.v, 1); assert.equal(cofre.iteracoes, ITER);
});
test('a chave dos dados não pode ser exportada depois de aberta', async () => {
  const {cofre} = await novo();
  const k = await C.abrirComPin(cofre, '123456');
  assert.equal(k.extractable, false);
});
