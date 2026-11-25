/* Cópia cifrada dos dados no aparelho (v20b). Só criptografia, sem tela nem armazenamento: testável fora do navegador.
   - Os dados são cifrados com uma chave aleatória (AES-GCM 256), presa ao usuário (o id da conta entra como dado associado).
   - Essa chave fica guardada "trancada" de dois jeitos:
       pelo PIN (PBKDF2-SHA256, ITERACOES rodadas, sal aleatório): abre sem internet;
       pelo segredo da conta no servidor (HKDF-SHA256): abre com internet, sem pedir o PIN, e permite trocar o PIN.
   - Limite: um PIN de 6 números segura quem tenta pelo app (o app apaga a cópia após 5 erros), mas não quem extrai
     os arquivos do aparelho e testa as combinações num computador. A proteção de fundo é o bloqueio de tela do celular. */
export const ITERACOES = 600000;
const VERSAO = 1;
const te = new TextEncoder(), td = new TextDecoder();
const cr = () => globalThis.crypto;
const aleatorio = n => cr().getRandomValues(new Uint8Array(n));
const falha = code => { const e = new Error(code); e.code = code; return e; };

export const pinValido = p => typeof p === 'string' && /^[0-9]{6}$/.test(p);

async function chaveDoPin(pin, sal, iteracoes) {
  const base = await cr().subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return cr().subtle.deriveKey({name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
async function chaveDoSegredo(segredo, sal) {
  const base = await cr().subtle.importKey('raw', te.encode(segredo), 'HKDF', false, ['deriveKey']);
  return cr().subtle.deriveKey({name: 'HKDF', salt: sal, info: te.encode('cuidar-em-casa:cofre:v1'), hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
const ad = (usuario, parte) => te.encode('cuidar-em-casa|' + parte + '|' + usuario);
async function tranca(k, bytes, usuario, parte) {
  const iv = aleatorio(12);
  return {iv, dados: new Uint8Array(await cr().subtle.encrypt({name: 'AES-GCM', iv, additionalData: ad(usuario, parte)}, k, bytes))};
}
async function destranca(k, t, usuario, parte) {
  return new Uint8Array(await cr().subtle.decrypt({name: 'AES-GCM', iv: t.iv, additionalData: ad(usuario, parte)}, k, t.dados));
}
const importaDados = bytes => cr().subtle.importKey('raw', bytes, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);

async function bytesComSegredo(cofre, segredo) {
  try { return await destranca(await chaveDoSegredo(segredo, cofre.salSegredo), cofre.porSegredo, cofre.usuario, 'segredo'); }
  catch (e) { throw falha('segredo'); }
}
async function trancarComPin(bytes, pin, usuario, iteracoes) {
  const salPin = aleatorio(16);
  return {salPin, iteracoes, porPin: await tranca(await chaveDoPin(pin, salPin, iteracoes), bytes, usuario, 'pin')};
}

/* Cria o cofre de um aparelho. Devolve {cofre, chave}: o cofre vai para o armazenamento; a chave fica só na memória. */
export async function criarCofre(pin, segredo, usuario, iteracoes = ITERACOES) {
  if (!pinValido(pin)) throw falha('pin_invalido');
  if (typeof segredo !== 'string' || segredo.length < 32) throw falha('segredo_invalido');
  if (typeof usuario !== 'string' || !usuario) throw falha('usuario');
  const bytes = aleatorio(32);
  try {
    const salSegredo = aleatorio(16);
    const porSegredo = await tranca(await chaveDoSegredo(segredo, salSegredo), bytes, usuario, 'segredo');
    const cofre = {v: VERSAO, usuario, salSegredo, porSegredo, ...(await trancarComPin(bytes, pin, usuario, iteracoes))};
    return {cofre, chave: await importaDados(bytes)};
  } finally { bytes.fill(0); }
}
export async function abrirComPin(cofre, pin) {
  if (!pinValido(pin)) throw falha('pin');
  let bytes;
  try { bytes = await destranca(await chaveDoPin(pin, cofre.salPin, cofre.iteracoes), cofre.porPin, cofre.usuario, 'pin'); }
  catch (e) { throw falha('pin'); }
  try { return await importaDados(bytes); } finally { bytes.fill(0); }
}
export async function abrirComSegredo(cofre, segredo) {
  const bytes = await bytesComSegredo(cofre, segredo);
  try { return await importaDados(bytes); } finally { bytes.fill(0); }
}
/* Trocar o PIN (também serve para "esqueci o PIN"): exige o segredo da conta, ou seja, estar com internet e logado. */
export async function trocarPin(cofre, segredo, novoPin, iteracoes = ITERACOES) {
  if (!pinValido(novoPin)) throw falha('pin_invalido');
  const bytes = await bytesComSegredo(cofre, segredo);
  try { return {...cofre, ...(await trancarComPin(bytes, novoPin, cofre.usuario, iteracoes))}; }
  finally { bytes.fill(0); }
}
export async function cifrar(chave, obj, usuario) {
  return tranca(chave, te.encode(JSON.stringify(obj)), usuario, 'dados');
}
export async function decifrar(chave, pacote, usuario) {
  return JSON.parse(td.decode(await destranca(chave, pacote, usuario, 'dados')));
}
