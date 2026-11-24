// Testes de site/src/data/supabase.js: cliente HTTP do Supabase (login, sessao, renovacao do token). Registram o comportamento ATUAL.
// fetch, armazenamento e relogio sao simulados; nada acessa a rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient, errMsg, readHashSession, nowSec, SB_ERR} from '../../../site/src/data/supabase.js';

const URL_ = 'https://x.supabase.co', KEY = 'chave-publica', SK = 'cuidar-em-casa:sb';
const memStore = (inicial = {}, falha = false) => { const m = new Map(Object.entries(inicial)); return {m, getItem: k => { if (falha) throw new Error('bloqueado'); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { if (falha) throw new Error('bloqueado'); m.set(k, String(v)); }, removeItem: k => { if (falha) throw new Error('bloqueado'); m.delete(k); }}; };
function ambiente({sessao, local, respostas = [], tempo = 1_000_000, falhaStorage = false} = {}) {
  const ss = memStore(sessao ? {[SK]: JSON.stringify(sessao)} : {}, falhaStorage), ls = memStore(local ? {[SK]: JSON.stringify(local)} : {}, falhaStorage);
  const chamadas = []; let i = 0; const agora = {t: tempo};
  const fetchFn = async (url, o) => {
    chamadas.push({url, method: o.method, headers: o.headers, body: o.body === undefined ? undefined : JSON.parse(o.body), cache: o.cache, credentials: o.credentials, referrerPolicy: o.referrerPolicy});
    const r = typeof respostas === 'function' ? respostas(chamadas.length, url, o) : respostas[Math.min(i++, respostas.length - 1)];
    if (r instanceof Error) throw r;
    return {ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.corpo === undefined ? '' : (typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo))};
  };
  const c = createClient({url: URL_, key: KEY, sesKey: SK, fetchFn, storage: {session: () => ss, local: () => ls}, now: () => agora.t});
  return {c, ss, ls, chamadas, agora};
}
const sess = (o = {}) => ({access_token: 'AT1', refresh_token: 'RT1', expires_at: 1_000_000 + 3600, user: {id: 'u1', email: 'a@b.c', nome: 'Ana'}, ...o});
const ok = corpo => ({status: 200, corpo});

test('nowSec: segundos inteiros', () => { assert.ok(Number.isInteger(nowSec())); assert.ok(Math.abs(nowSec() - Date.now() / 1000) < 2); });

test('api: sem sessao e com autenticacao exigida, falha como "expirada" sem chamar a rede', async () => {
  const e = ambiente(); await assert.rejects(e.c.api('/rest/v1/patients'), {code: 'expired'}); assert.equal(e.chamadas.length, 0);
});

test('api: cabecalhos, metodo e corpo', async () => {
  const e = ambiente({respostas: [ok([{id: 1}]), ok(null)]}); e.c.setSession(sess());
  assert.deepEqual(await e.c.api('/rest/v1/patients?select=id'), [{id: 1}]);
  const c0 = e.chamadas[0];
  assert.equal(c0.url, URL_ + '/rest/v1/patients?select=id'); assert.equal(c0.method, 'GET');
  assert.deepEqual(c0.headers, {apikey: KEY, Authorization: 'Bearer AT1'});          // sem Content-Type quando nao ha corpo
  assert.deepEqual([c0.cache, c0.credentials, c0.referrerPolicy], ['no-store', 'omit', 'no-referrer']);
  await e.c.api('/rest/v1/profiles', {method: 'POST', prefer: 'return=minimal', body: {a: 1}});
  const c1 = e.chamadas[1];
  assert.equal(c1.method, 'POST'); assert.deepEqual(c1.headers, {apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal', Authorization: 'Bearer AT1'}); assert.deepEqual(c1.body, {a: 1});
});

test('api: auth:false nao exige nem envia o token', async () => {
  const e = ambiente({respostas: [ok({access_token: 'x'})]});
  await e.c.api('/auth/v1/token?grant_type=password', {method: 'POST', auth: false, body: {email: 'a', password: 'b'}});
  assert.deepEqual(e.chamadas[0].headers, {apikey: KEY, 'Content-Type': 'application/json'});
});

test('api: corpo que nao e JSON vira null; resposta vazia tambem', async () => {
  const e = ambiente({respostas: [{status: 200, corpo: 'texto solto'}, {status: 204}]}); e.c.setSession(sess());
  assert.equal(await e.c.api('/x'), null); assert.equal(await e.c.api('/y'), null);
});

test('api: erro de rede e erro HTTP', async () => {
  const e = ambiente({respostas: [new Error('offline'), {status: 400, corpo: {error_code: 'invalid_credentials'}}, {status: 503, corpo: 'fora'}]}); e.c.setSession(sess());
  await assert.rejects(e.c.api('/x'), {code: 'network'});
  await assert.rejects(e.c.api('/x'), {code: 'http', status: 400, data: {error_code: 'invalid_credentials'}});
  await assert.rejects(e.c.api('/x'), {code: 'http', status: 503, data: null});
});

test('api: token perto de vencer (menos de 60 s) e renovado antes da chamada', async () => {
  const e = ambiente({respostas: [ok({access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: {id: 'u1', email: 'a@b.c', user_metadata: {nome: 'Ana'}}}), ok([1])]});
  e.c.setSession(sess({expires_at: 1_000_000 + 59}));
  assert.deepEqual(await e.c.api('/rest/v1/x'), [1]);
  assert.equal(e.chamadas[0].url, URL_ + '/auth/v1/token?grant_type=refresh_token'); assert.deepEqual(e.chamadas[0].body, {refresh_token: 'RT1'});
  assert.equal(e.chamadas[1].headers.Authorization, 'Bearer AT2');
  assert.equal(e.c.ses.access_token, 'AT2'); assert.equal(e.c.ses.expires_at, 1_000_000 + 3600);
});

test('api: token com 60 s ou mais de vida nao e renovado', async () => {
  const e = ambiente({respostas: [ok([])]}); e.c.setSession(sess({expires_at: 1_000_000 + 60}));
  await e.c.api('/rest/v1/x'); assert.equal(e.chamadas.length, 1);
});

test('api: 401 renova o token e repete a chamada UMA vez', async () => {
  const e = ambiente({respostas: [{status: 401, corpo: {}}, ok({access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: {id: 'u1', email: 'a@b.c'}}), ok(['certo'])]}); e.c.setSession(sess());
  assert.deepEqual(await e.c.api('/rest/v1/x'), ['certo']);
  assert.deepEqual(e.chamadas.map(c => c.url.replace(URL_, '')), ['/rest/v1/x', '/auth/v1/token?grant_type=refresh_token', '/rest/v1/x']);
  assert.equal(e.chamadas[2].headers.Authorization, 'Bearer AT2');
  const f = ambiente({respostas: [{status: 401, corpo: {}}, ok({access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: {id: 'u1', email: 'a@b.c'}}), {status: 401, corpo: {}}]}); f.c.setSession(sess());
  await assert.rejects(f.c.api('/rest/v1/x'), {code: 'http', status: 401});     // segundo 401: nao tenta de novo
  assert.equal(f.chamadas.length, 3);
});

test('refreshSes: varias chamadas ao mesmo tempo compartilham uma renovacao so', async () => {
  const e = ambiente({respostas: [ok({access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: {id: 'u1', email: 'a@b.c'}})]}); e.c.setSession(sess());
  await Promise.all([e.c.refreshSes(), e.c.refreshSes(), e.c.refreshSes()]);
  assert.equal(e.chamadas.length, 1); assert.equal(e.c.ses.access_token, 'AT2');
  await e.c.refreshSes(); assert.equal(e.chamadas.length, 2);                        // depois de terminar, uma nova renovacao e nova
});

test('refreshSes: sem sessao; recusa do servidor encerra a sessao; outros erros preservam', async () => {
  await assert.rejects(ambiente().c.refreshSes(), {code: 'expired'});
  for (const status of [400, 401, 403]) {
    const e = ambiente({sessao: sess(), respostas: [{status, corpo: {}}]}); e.c.setSession(e.c.readSes());
    await assert.rejects(e.c.refreshSes(), {code: 'expired'}); assert.equal(e.c.ses, null); assert.equal(e.ss.m.has(SK) || e.ls.m.has(SK), false);
  }
  const f = ambiente({respostas: [{status: 503, corpo: {}}]}); f.c.setSession(sess());
  await assert.rejects(f.c.refreshSes(), {code: 'http', status: 503}); assert.equal(f.c.ses.access_token, 'AT1');       // servidor fora do ar: continua com a sessao
  const g = ambiente({respostas: [new Error('x')]}); g.c.setSession(sess());
  await assert.rejects(g.c.refreshSes(), {code: 'network'}); assert.equal(g.c.ses.access_token, 'AT1');
});

test('refreshSes: mantem a escolha de "manter conectado"', async () => {
  const e = ambiente({respostas: [ok({access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: {id: 'u1', email: 'a@b.c'}})]}); e.c.setSession(sess({persist: true}));
  await e.c.refreshSes(); assert.equal(e.c.ses.persist, true); assert.ok(e.ls.m.has(SK)); assert.equal(e.ss.m.has(SK), false);
});

test('storeSes: normaliza, grava no armazenamento certo e limpa o outro', () => {
  const e = ambiente();
  e.c.storeSes({access_token: 'AT', refresh_token: 'RT', expires_in: 100, user: {id: 'u9', email: 'x'.repeat(300), user_metadata: {nome: 'n'.repeat(200)}}}, false);
  assert.equal(e.c.ses.user.email.length, 200); assert.equal(e.c.ses.user.nome.length, 80); assert.equal(e.c.ses.expires_at, 1_000_000 + 100); assert.equal(e.c.ses.persist, false);
  assert.ok(e.ss.m.has(SK)); assert.equal(e.ls.m.has(SK), false);
  e.c.storeSes({access_token: 'AT3', refresh_token: 'RT3', expires_at: 5, user: {id: 'u9', email: 'a@b.c'}}, true);
  assert.ok(e.ls.m.has(SK)); assert.equal(e.ss.m.has(SK), false); assert.equal(e.c.ses.expires_at, 5); assert.equal(e.c.ses.persist, true); assert.equal(e.c.ses.user.nome, '');
  assert.deepEqual(JSON.parse(e.ls.m.get(SK)), e.c.ses);
});

test('storeSes: expires_at padrao de 1 hora, refresh_token ausente vira vazio, usuario anterior e reaproveitado', () => {
  const e = ambiente(); e.c.setSession(sess());
  e.c.storeSes({access_token: 'AT9'}, false);               // sem user: mantem o da sessao atual
  assert.deepEqual([e.c.ses.user.id, e.c.ses.user.email, e.c.ses.user.nome, e.c.ses.refresh_token, e.c.ses.expires_at], ['u1', 'a@b.c', 'Ana', '', 1_000_000 + 3600]);
});

test('storeSes: dados invalidos', () => {
  const e = ambiente();
  assert.throws(() => e.c.storeSes({access_token: 'x'}, false), {code: 'bad_session'});            // sem usuario e sem sessao atual
  assert.throws(() => e.c.storeSes({user: {id: 'u'}}, false), {code: 'bad_session'});               // sem token
  assert.throws(() => e.c.storeSes({access_token: 5, user: {id: 'u'}}, false), {code: 'bad_session'});
  assert.equal(e.c.ses, null);
});

test('storeSes: armazenamento bloqueado nao derruba o login', () => {
  const e = ambiente({falhaStorage: true}); e.c.storeSes({access_token: 'AT', refresh_token: 'RT', expires_in: 10, user: {id: 'u', email: 'a@b.c'}}, true);
  assert.equal(e.c.ses.access_token, 'AT');
});

test('readSes: prefere a sessao da aba, depois a guardada; ignora lixo', () => {
  assert.equal(ambiente().c.readSes(), null);
  const a = ambiente({sessao: sess({access_token: 'DA ABA'}), local: sess({access_token: 'GUARDADA'})}).c.readSes(); assert.deepEqual([a.access_token, a.persist], ['DA ABA', false]);
  const b = ambiente({local: sess({access_token: 'GUARDADA'})}).c.readSes(); assert.deepEqual([b.access_token, b.persist], ['GUARDADA', true]);
  const c = ambiente({sessao: {access_token: 'x'}, local: sess()}).c.readSes(); assert.equal(c.access_token, 'AT1');                    // a da aba esta incompleta: cai para a outra
  for (const ruim of [{access_token: 1, refresh_token: 'r', user: {id: 'u'}}, {access_token: 'a', refresh_token: 'r', user: {}}, {access_token: 'a', refresh_token: 'r'}, 'texto', null]) assert.equal(ambiente({sessao: ruim}).c.readSes(), null, JSON.stringify(ruim));
  const sujo = ambiente(); sujo.ss.m.set(SK, '{nao e json'); assert.equal(sujo.c.readSes(), null);
});

test('readSes: armazenamento bloqueado nao quebra', () => assert.equal(ambiente({falhaStorage: true}).c.readSes(), null));

test('clearSes: apaga a sessao em memoria e nos dois armazenamentos', () => {
  const e = ambiente({sessao: sess(), local: sess()}); e.c.setSession(sess()); e.c.clearSes();
  assert.equal(e.c.ses, null); assert.equal(e.ss.m.has(SK), false); assert.equal(e.ls.m.has(SK), false);
  assert.doesNotThrow(() => ambiente({falhaStorage: true}).c.clearSes());
});

test('sbSignIn e sbSignUp', async () => {
  const e = ambiente({respostas: [ok({access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: {id: 'u', email: 'a@b.c'}}), ok({id: 'u2', email: 'n@b.c'}), ok({access_token: 'AT5', refresh_token: 'R', expires_in: 3600, user: {id: 'u3', email: 'm@b.c', user_metadata: {nome: 'Maria'}}})]});
  await e.c.sbSignIn('a@b.c', 'senha', true);
  assert.deepEqual([e.chamadas[0].url, e.chamadas[0].body], [URL_ + '/auth/v1/token?grant_type=password', {email: 'a@b.c', password: 'senha'}]);
  assert.deepEqual(e.chamadas[0].headers, {apikey: KEY, 'Content-Type': 'application/json'}); assert.equal(e.c.ses.persist, true); assert.ok(e.ls.m.has(SK));
  assert.equal(await e.c.sbSignUp('Nova', 'n@b.c', 'senha', false), false);        // precisa confirmar o e-mail: sem sessao
  assert.deepEqual([e.chamadas[1].url, e.chamadas[1].body], [URL_ + '/auth/v1/signup', {email: 'n@b.c', password: 'senha', data: {nome: 'Nova'}}]); assert.equal(e.c.ses.user.id, 'u');   // a sessao anterior fica
  assert.equal(await e.c.sbSignUp('Maria', 'm@b.c', 'senha', false), true); assert.equal(e.c.ses.user.nome, 'Maria');
});

test('errMsg: mensagens em portugues', () => {
  assert.equal(errMsg({code: 'network'}, 'x'), 'Sem conexão com a internet. Verifique a rede e tente de novo.');
  assert.equal(errMsg({code: 'http', status: 400, data: {error_code: 'invalid_credentials'}}, 'x'), 'E-mail ou senha incorretos.');
  assert.equal(errMsg({code: 'http', status: 400, data: {error_description: 'Invalid login credentials'}}, 'x'), SB_ERR.invalid_credentials);
  assert.equal(errMsg({code: 'http', status: 400, data: {msg: 'invalid LOGIN credentials'}}, 'x'), SB_ERR.invalid_credentials);
  assert.equal(errMsg({code: 'http', status: 422, data: {error_code: 'weak_password'}}, 'x'), SB_ERR.weak_password);
  assert.equal(errMsg({code: 'http', status: 429, data: {}}, 'x'), SB_ERR.over_request_rate_limit);
  assert.equal(errMsg({code: 'http', status: 500, data: null}, 'x'), 'O servidor está indisponível no momento. Tente de novo em instantes.');
  assert.equal(errMsg({code: 'http', status: 502, data: 'html'}, 'x'), 'O servidor está indisponível no momento. Tente de novo em instantes.');
  assert.equal(errMsg({code: 'http', status: 400, data: {error_code: 'coisa_nova'}}, 'padrao'), 'padrao');
  assert.equal(errMsg({code: 'bad_data'}, 'padrao'), 'padrao'); assert.equal(errMsg(undefined, 'padrao'), 'padrao'); assert.equal(errMsg(null, 'padrao'), 'padrao');
  for (const k of ['email_not_confirmed', 'signup_disabled', 'same_password', 'user_banned', 'over_email_send_rate_limit']) assert.equal(errMsg({code: 'http', status: 400, data: {error_code: k}}, 'x'), SB_ERR[k], k);
});

test('readHashSession: link de confirmacao, recuperacao de senha e erros', () => {
  const hist = () => { const h = {chamadas: [], replaceState: (...a) => h.chamadas.push(a)}; return h; };
  let h = hist(); assert.equal(readHashSession({hash: '', pathname: '/', search: ''}, h), null); assert.equal(h.chamadas.length, 0);
  assert.equal(readHashSession({hash: '#outra=coisa', pathname: '/', search: ''}, h), null); assert.equal(h.chamadas.length, 0);
  assert.equal(readHashSession({hash: '#', pathname: '/', search: ''}, h), null);
  h = hist(); const r = readHashSession({hash: '#access_token=AT&refresh_token=RT&expires_in=3600&expires_at=999&token_type=bearer&type=recovery', pathname: '/app', search: '?a=1'}, h);
  assert.deepEqual(r, {access_token: 'AT', refresh_token: 'RT', expires_in: '3600', expires_at: '999', type: 'recovery'});
  assert.deepEqual(h.chamadas, [[null, '', '/app?a=1']]);                              // limpa o link da barra de enderecos
  assert.equal(readHashSession({hash: '#access_token=AT', pathname: '/', search: ''}, hist()).refresh_token, '');
  assert.deepEqual(readHashSession({hash: '#error=access_denied&error_description=Link+expirado', pathname: '/', search: ''}, hist()), {error: 'Link expirado'});
  assert.equal(readHashSession({hash: '#error=' + 'x'.repeat(500), pathname: '/', search: ''}, hist()).error.length, 200);
  assert.doesNotThrow(() => readHashSession({hash: '#access_token=a', pathname: '/', search: ''}, {replaceState() { throw new Error('x'); }}));
});
