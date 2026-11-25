/* Dados no aparelho para consultar sem internet (v20b). Decisões do usuário (25/11/2026): PIN de 6 números; 5 erros
   seguidos apagam a cópia; com internet não pede PIN; trava após 15 minutos sem uso.
   Guarda no IndexedDB (banco "cuidar-em-casa", tabela "aparelho") só duas coisas, ambas cifradas (src/data/cofre.js):
     'cofre' = a chave dos dados trancada pelo PIN e pelo segredo da conta, mais o contador de erros;
     'copia' = os dados da conta cifrados, com a data da cópia.
   A chave aberta fica só na memória (st.chaveAparelho) e some ao sair, travar ou recarregar. */
import * as C from '../data/cofre.js';
import {api,SB} from './session.js';
import {auth} from './state.js';
import {st} from './store.js';

export const MAX_ERROS = 5;
const BANCO = 'cuidar-em-casa', TABELA = 'aparelho';

function abrirBanco() {
  return new Promise(function (res, rej) {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = function () { r.result.createObjectStore(TABELA); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
async function op(modo, fn) {
  const db = await abrirBanco();
  try {
    return await new Promise(function (res, rej) {
      const t = db.transaction(TABELA, modo), s = t.objectStore(TABELA); let out;
      const q = fn(s); if (q) q.onsuccess = function () { out = q.result; };
      t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); };
    });
  } finally { db.close(); }
}
const ler = k => op('readonly', s => s.get(k)).catch(() => undefined);
const gravar = (k, v) => op('readwrite', s => { s.put(v, k); });

/* Estado conhecido sem abrir o banco a toda hora: atualizado no início (lerEstado) e a cada mudança. */
export const aparelho = {cofre: null, salvoEm: null};
export async function lerEstado() {
  try { aparelho.cofre = (await ler('cofre')) || null; const c = await ler('copia'); aparelho.salvoEm = c ? c.salvoEm : null; }
  catch (e) { aparelho.cofre = null; aparelho.salvoEm = null; }
  return aparelho;
}
export const ativo = () => !!aparelho.cofre;
const p2 = n => String(n).padStart(2, '0');
export function copiaDe() {
  if (!aparelho.salvoEm) return '';
  const d = new Date(aparelho.salvoEm);
  return 'Cópia de ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' às ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + '.';
}

/* Apaga tudo do aparelho (Sair, excluir conta, desativar, 5 erros, conta diferente). */
export async function apagarCopia() {
  st.chaveAparelho = null; aparelho.cofre = null; aparelho.salvoEm = null;
  await new Promise(function (res) {
    try { const r = indexedDB.deleteDatabase(BANCO); r.onsuccess = r.onerror = r.onblocked = function () { res(); }; }
    catch (e) { res(); }
  });
}

let segredoCache = null;   /* só durante a sessão com internet; nunca é gravado */
async function segredo() {
  if (segredoCache && segredoCache.u === SB.ses.user.id) return segredoCache.s;
  const s = await api('/rest/v1/rpc/segredo_do_aparelho', {method: 'POST', body: {}});
  if (typeof s !== 'string' || s.length < 32) throw {code: 'segredo'};
  segredoCache = {u: SB.ses.user.id, s: s};
  return s;
}
export function esquecerSegredo() { segredoCache = null; }

const conteudo = () => ({S: st.S, conta: auth.conta});
async function gravarCopia() {
  const salvoEm = new Date().toISOString();
  await gravar('copia', {pacote: await C.cifrar(st.chaveAparelho, conteudo(), SB.ses.user.id), salvoEm: salvoEm});
  aparelho.salvoEm = salvoEm;
}

/* Ativar (com internet e logado): cria o cofre com o PIN e grava a primeira cópia. */
export async function ativar(pin) {
  const {cofre, chave} = await C.criarCofre(pin, await segredo(), SB.ses.user.id);
  await apagarCopia();
  await gravar('cofre', Object.assign(cofre, {erros: 0}));
  aparelho.cofre = cofre; st.chaveAparelho = chave;
  await gravarCopia();
}
/* Trocar o PIN (também para PIN esquecido): exige o segredo da conta, ou seja, internet e login. */
export async function trocarPin(pin) {
  const novo = await C.trocarPin(aparelho.cofre, await segredo(), pin);
  novo.erros = 0;
  await gravar('cofre', novo); aparelho.cofre = novo;
}

/* Com internet, depois de carregar ou salvar: atualiza a cópia sem pedir PIN. Nunca derruba o app se falhar. */
let tAtualizar = null;
export function atualizarCopia() {
  clearTimeout(tAtualizar);
  tAtualizar = setTimeout(atualizarAgora, 300);
}
export async function atualizarAgora() {
  clearTimeout(tAtualizar);
  if (!aparelho.cofre || st.offline || !auth.logged || !SB.ses || !st.S || !st.S.persisted) return;
  try {
    if (aparelho.cofre.usuario !== SB.ses.user.id) { await apagarCopia(); return; }   /* cópia de outra conta: some */
    if (!st.chaveAparelho) {
      try { st.chaveAparelho = await C.abrirComSegredo(aparelho.cofre, await segredo()); }
      catch (e) { if (e && e.code === 'segredo') await apagarCopia(); return; }   /* segredo da conta mudou: a cópia não abre mais */
    }
    await gravarCopia();
  } catch (e) { /* sem rede ou armazenamento cheio: tenta na próxima gravação */ }
}

/* Sem internet: abre com o PIN. Devolve {ok:true, dados} | {erro:'pin', restantes} | {erro:'apagada'} | {erro:'sem_copia'}. */
export async function abrirComPin(pin) {
  const cofre = await ler('cofre'), copia = await ler('copia');
  if (!cofre || !copia) return {erro: 'sem_copia'};
  try {
    const chave = await C.abrirComPin(cofre, pin);
    const dados = await C.decifrar(chave, copia.pacote, cofre.usuario);
    if (cofre.erros) { cofre.erros = 0; await gravar('cofre', cofre); }
    st.chaveAparelho = chave; aparelho.cofre = cofre; aparelho.salvoEm = copia.salvoEm;
    return {ok: true, dados: dados, usuario: cofre.usuario, salvoEm: copia.salvoEm};
  } catch (e) {
    if (!(e && e.code === 'pin')) throw e;
    cofre.erros = (cofre.erros || 0) + 1;
    if (cofre.erros >= MAX_ERROS) { await apagarCopia(); return {erro: 'apagada'}; }
    await gravar('cofre', cofre);
    return {erro: 'pin', restantes: MAX_ERROS - cofre.erros};
  }
}
