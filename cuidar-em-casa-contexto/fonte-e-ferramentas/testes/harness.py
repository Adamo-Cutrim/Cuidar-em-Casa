"""Supabase simulado para testar o site sem tocar no banco real.

Reproduz o esquema normalizado aplicado em 18/11/2026 (backend/sql/): colunas tipadas, ids uuid,
constraints, chaves estrangeiras compostas com user_id, cascatas, unicidades e RLS (cada usuário só
enxerga e altera as próprias linhas). Implementa só a parte do PostgREST e do Auth que o app usa.

Uso:  python3 harness.py mock     -> API em http://127.0.0.1:8766
      python3 harness.py static   -> site em http://127.0.0.1:8765 (pasta SITE_DIR, com os cabeçalhos do vercel.json)
"""
import sys, json, re, time, os, secrets, uuid, datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

SITE_DIR = os.environ.get('SITE_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site_test'))
KEY = 'sb_publishable_Tuay0Raxi1UIqQLi1pNrcA_hqdThXOV'
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)

class DbError(Exception):
    def __init__(self, status, code, msg): self.status, self.code, self.msg = status, code, msg

# ---------- tipos de coluna ----------
def t_uuid(v):
    if not isinstance(v, str) or not UUID.match(v): raise DbError(400, '22P02', 'invalid input syntax for type uuid: %r' % (v,))
    return v.lower()
def t_text(n, nonblank=False):
    def f(v):
        if not isinstance(v, str): raise DbError(400, '22P02', 'text esperado')
        if len(v) > n or (nonblank and not (1 <= len(v.strip()) <= n)): raise DbError(400, '23514', 'violates check constraint (tamanho)')
        return v
    return f
def t_bool(v):
    if not isinstance(v, bool): raise DbError(400, '22P02', 'boolean esperado')
    return v
def t_num(v):
    if isinstance(v, str):
        try: v = float(v)
        except ValueError: raise DbError(400, '22P02', 'numeric esperado')
    if isinstance(v, bool) or not isinstance(v, (int, float)): raise DbError(400, '22P02', 'numeric esperado')
    if v < 0: raise DbError(400, '23514', 'violates check constraint (>= 0)')
    if v >= 1e9: raise DbError(400, '22003', 'numeric field overflow')
    return round(float(v), 2)
def t_small(lo, hi):
    def f(v):
        if isinstance(v, bool) or not isinstance(v, int): raise DbError(400, '22P02', 'smallint esperado')
        if not lo <= v <= hi: raise DbError(400, '23514', 'violates check constraint (faixa)')
        return v
    return f
def t_date(v):
    try: d = datetime.date.fromisoformat(v)
    except Exception: raise DbError(400, '22007', 'invalid input syntax for type date: %r' % (v,))
    if not (datetime.date(1900, 1, 1) <= d <= datetime.date(2100, 12, 31)): raise DbError(400, '23514', 'violates check constraint (data)')
    return d.isoformat()
def t_time(v):
    m = re.match(r'^(\d{2}):(\d{2})(?::(\d{2}))?$', v if isinstance(v, str) else '')
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59: raise DbError(400, '22007', 'invalid input syntax for type time: %r' % (v,))
    if m.group(3) and m.group(3) != '00': raise DbError(400, '23514', 'violates check constraint (hora com segundos)')
    return '%s:%s:00' % (m.group(1), m.group(2))
def t_days(v):
    if not isinstance(v, list) or any(isinstance(x, bool) or not isinstance(x, int) for x in v): raise DbError(400, '22P02', 'smallint[] esperado')
    if any(not 0 <= x <= 6 for x in v) or len(v) > 7: raise DbError(400, '23514', 'violates check constraint (dias)')
    return list(v)

AUTO = object()  # coluna preenchida pelo banco
TABLES = {
    'profiles': {'pk': ('user_id',), 'cols': {
        'user_id': (t_uuid, AUTO), 'nome': (t_text(80), ''), 'tel': (t_text(60), ''), 'profissao': (t_text(100), ''),
        'registro': (t_text(60), ''), 'cidade': (t_text(100), ''), 'iniciado': (t_bool, False), 'updated_at': (None, AUTO)}},
    'companies': {'pk': ('id',), 'cols': {
        'id': (t_uuid, AUTO), 'user_id': (t_uuid, AUTO), 'nome': (t_text(300, True), None), 'tipo': (t_text(300), ''),
        'contato': (t_text(300), ''), 'valor_padrao': (t_num, 'null'), 'pagamento': (t_text(300), ''), 'obs': (t_text(5000), ''),
        'cor': (t_small(0, 999), 0), 'created_at': (None, AUTO), 'updated_at': (None, AUTO)}},
    'patients': {'pk': ('id',), 'cols': {
        'id': (t_uuid, AUTO), 'user_id': (t_uuid, AUTO), 'company_id': (t_uuid, 'null'), 'nome': (t_text(300, True), None),
        'nasc': (t_date, 'null'), 'tel': (t_text(60), ''), 'resp_nome': (t_text(300), ''), 'resp_tel': (t_text(60), ''),
        'endereco': (t_text(300), ''), 'bairro': (t_text(300), ''), 'ref': (t_text(5000), ''), 'valor': (t_num, 'null'),
        'condicoes': (t_text(5000), ''), 'alergias': (t_text(5000), ''), 'medicamentos': (t_text(5000), ''), 'obs': (t_text(5000), ''),
        'created_at': (None, AUTO), 'updated_at': (None, AUTO)}},
    'visits': {'pk': ('id',), 'cols': {
        'id': (t_uuid, AUTO), 'user_id': (t_uuid, AUTO), 'patient_id': (t_uuid, None), 'data': (t_date, None),
        'hora': (t_time, '08:00:00'), 'tipo': (t_text(100), ''), 'obs': (t_text(5000), ''), 'status': (t_text(20), 'agendado'),
        'serie_data': (t_date, 'null'), 'manual': (t_bool, False), 'valor_snapshot': (t_num, 'null'), 'service_type_id': (t_uuid, 'null'), 'created_at': (None, AUTO), 'updated_at': (None, AUTO)}},
    'recurrences': {'pk': ('patient_id',), 'cols': {
        'patient_id': (t_uuid, None), 'user_id': (t_uuid, AUTO), 'ativo': (t_bool, True), 'dias': (t_days, []),
        'hora': (t_time, '08:00:00'), 'tipo': (t_text(100), ''), 'inicio': (t_date, None), 'fim': (t_date, 'null'), 'service_type_id': (t_uuid, 'null'),
        'created_at': (None, AUTO), 'updated_at': (None, AUTO)}},
    'recurrence_exceptions': {'pk': ('patient_id', 'data'), 'cols': {
        'patient_id': (t_uuid, None), 'data': (t_date, None), 'user_id': (t_uuid, AUTO), 'created_at': (None, AUTO)}},
    'service_types': {'pk': ('id',), 'cols': {
        'id': (t_uuid, AUTO), 'user_id': (t_uuid, AUTO), 'nome': (t_text(60, True), None), 'created_at': (None, AUTO)}},
}
UNIQUE = {  # unicidades além da chave primária
    'visits': [lambda r: (r['user_id'], r['patient_id'], r['serie_data']) if r['serie_data'] is not None else None],
    'service_types': [lambda r: (r['user_id'], r['nome'].strip().lower())],
}

def now(): return datetime.datetime.utcnow().isoformat() + '+00:00'

class Db:
    def __init__(self): self.rows = {t: {} for t in TABLES}  # tabela -> {pk: linha}
    def key(self, t, r): return tuple(r[c] for c in TABLES[t]['pk'])
    def mine(self, t, uid): return [r for r in self.rows[t].values() if r['user_id'] == uid]

    def build(self, t, uid, body, old=None):
        spec = TABLES[t]['cols']
        for c in body:
            if c not in spec: raise DbError(400, 'PGRST204', "Could not find the '%s' column of '%s' in the schema cache" % (c, t))
        r = dict(old) if old else {}
        for c, (fn, default) in spec.items():
            if c in body and fn is not None:
                v = body[c]
                if v is None:
                    if default != 'null': raise DbError(400, '23502', 'null value in column "%s" violates not-null constraint' % c)
                    r[c] = None
                else: r[c] = fn(v)
            elif old is None:
                if c in ('created_at', 'updated_at'): r[c] = now()
                elif c == 'id': r[c] = str(uuid.uuid4())
                elif c == 'user_id': r[c] = uid
                elif default is None: raise DbError(400, '23502', 'null value in column "%s" violates not-null constraint' % c)
                elif default == 'null': r[c] = None
                else: r[c] = default
        if 'updated_at' in spec and old is not None: r['updated_at'] = now()
        if r['user_id'] != uid: raise DbError(403, '42501', 'new row violates row-level security policy for table "%s"' % t)
        self.check(t, r)
        return r

    def check(self, t, r):
        u = r['user_id']
        if t == 'visits' and r['status'] not in ('agendado', 'feito', 'cancelado'): raise DbError(400, '23514', 'visits_status_check')
        if t == 'recurrences':
            if r['ativo'] and not r['dias']: raise DbError(400, '23514', 'recurrences_check (ativo sem dias)')
            if r['fim'] is not None and r['fim'] < r['inicio']: raise DbError(400, '23514', 'recurrences_fim_check')
        if t == 'patients' and r['company_id'] is not None:
            c = self.rows['companies'].get((r['company_id'],))
            if not c or c['user_id'] != u: raise DbError(409, '23503', 'violates foreign key constraint patients_user_id_company_id_fkey')
        if t in ('visits', 'recurrences') and r.get('service_type_id') is not None:   # v18b: tipo ligado (FK composta user_id, service_type_id)
            st = self.rows['service_types'].get((r['service_type_id'],))
            if not st or st['user_id'] != u: raise DbError(409, '23503', 'violates foreign key constraint %s_service_type_fk' % t)
        if t in ('visits', 'recurrences', 'recurrence_exceptions'):
            p = self.rows['patients'].get((r['patient_id'],))
            if not p or p['user_id'] != u: raise DbError(409, '23503', 'violates foreign key constraint %s_user_id_patient_id_fkey' % t)

    def unique_ok(self, t, r, pending):
        for f in UNIQUE.get(t, []):
            k = f(r)
            if k is None: continue
            for o in list(self.rows[t].values()) + pending:
                if o is not r and self.key(t, o) != self.key(t, r) and f(o) == k:
                    raise DbError(409, '23505', 'duplicate key value violates unique constraint (%s)' % t)

    def upsert(self, t, uid, rows, conflict, mode):
        """Tudo ou nada, como uma instrução SQL."""
        snapshot = {k: dict(v) for k, v in self.rows[t].items()}
        try:
            out = []
            for b in rows:
                tmp = self.build(t, uid, b)
                ck = conflict or TABLES[t]['pk']
                hit = next((o for o in self.rows[t].values() if all(o[c] == tmp[c] for c in ck)), None)
                if hit is None and conflict is None:
                    pass
                if hit is not None:
                    if mode == 'ignore': continue
                    if mode != 'merge': raise DbError(409, '23505', 'duplicate key value violates unique constraint "%s_pkey"' % t)
                    if hit['user_id'] != uid: raise DbError(403, '42501', 'new row violates row-level security policy (USING expression) for table "%s"' % t)
                    del self.rows[t][self.key(t, hit)]
                    r = self.build(t, uid, b, old=hit)
                else: r = tmp
                if self.key(t, r) in self.rows[t]: raise DbError(409, '23505', 'duplicate key value violates unique constraint "%s_pkey"' % t)
                self.unique_ok(t, r, out)
                self.rows[t][self.key(t, r)] = r
                out.append(r)
        except DbError:
            self.rows[t] = snapshot
            raise

    def delete(self, t, uid, filt):
        gone = [r for r in self.mine(t, uid) if filt(r)]
        for r in gone:
            del self.rows[t][self.key(t, r)]
            if t == 'patients':  # on delete cascade
                for tt in ('visits', 'recurrences', 'recurrence_exceptions'):
                    for k, o in list(self.rows[tt].items()):
                        if o['user_id'] == uid and o['patient_id'] == r['id']: del self.rows[tt][k]
            if t == 'service_types':  # on delete set null (service_type_id): o atendimento fica com o nome em texto
                for tt in ('visits', 'recurrences'):
                    for o in self.mine(tt, uid):
                        if o['service_type_id'] == r['id']: o['service_type_id'] = None
            if t == 'companies':  # on delete set null (company_id)
                for o in self.mine('patients', uid):
                    if o['company_id'] == r['id']: o['company_id'] = None

def parse_filters(q, t):
    cols = TABLES[t]['cols']; fs = []
    for c, vals in q.items():
        if c in ('select', 'order', 'limit', 'offset', 'on_conflict'): continue
        if c not in cols: raise DbError(400, '42703', 'column %s.%s does not exist' % (t, c))
        v = vals[0]
        if v.startswith('eq.'): x = unquote(v[3:]); fs.append(lambda r, c=c, x=x: str(r[c]) == x)
        elif v.startswith('in.(') and v.endswith(')'):
            xs = set(unquote(i).strip('"') for i in v[4:-1].split(',') if i != ''); fs.append(lambda r, c=c, xs=xs: str(r[c]) in xs)
        elif v == 'is.null': fs.append(lambda r, c=c: r[c] is None)
        else: raise DbError(400, 'PGRST100', 'filtro não suportado no mock: %s=%s' % (c, v))
    return lambda r: all(f(r) for f in fs)

def out_row(r, sel):
    o = {c: v for c, v in r.items() if sel == ['*'] or c in sel}
    for c in o:
        if c in ('valor', 'valor_padrao') and o[c] is not None: o[c] = float('%.2f' % o[c])
    return o

class Mock(BaseHTTPRequestHandler):
    users = {}; byid = {}; access = {}; refresh = {}; amr = {}; segredos = {}   # segredos: uid -> segredo do aparelho (v20b)   # amr: token -> metodos de login com horario (como o JWT do Supabase)
    db = Db(); log = []; fail_n = 0; reject_n = 0
    def log_message(self, *a): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'apikey,authorization,content-type,prefer')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    def out(self, code, obj=None):
        b = b'' if obj is None else json.dumps(obj).encode()
        self.send_response(code); self.cors(); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def err(self, code, ec, msg): self.out(code, {'code': code, 'error_code': ec, 'msg': msg})
    def session(self, u, amr=None):
        at = 'at-' + secrets.token_hex(8); rt = 'rt-' + secrets.token_hex(8)
        Mock.access[at] = u['id']; Mock.refresh[rt] = u['id']
        Mock.amr[at] = Mock.amr[rt] = amr if amr is not None else [{'method': 'password', 'timestamp': int(time.time())}]
        return {'access_token': at, 'refresh_token': rt, 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer', 'user': self.user(u)}
    def user(self, u): return {'id': u['id'], 'email': u['email'], 'user_metadata': {'nome': u['nome']}}
    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n)) if n else None
    def uid(self):
        a = self.headers.get('Authorization', '')
        return Mock.access.get(a.replace('Bearer ', '')) if a.startswith('Bearer ') else None
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self): self.route('GET')
    def do_POST(self): self.route('POST')
    def do_PUT(self): self.route('PUT')
    def do_PATCH(self): self.route('PATCH')
    def do_DELETE(self): self.route('DELETE')
    def route(self, m):
        u = urlparse(self.path); q = parse_qs(u.query, keep_blank_values=True); p = u.path
        if p.startswith('/__mock/'): return self.ctl(p, q)
        Mock.log.append((m, p, u.query))
        if self.headers.get('apikey') != KEY: return self.err(401, 'no_authorization', 'No API key')
        if p == '/auth/v1/signup' and m == 'POST':
            b = self.body(); e = b['email']
            if len(b['password']) < 6: return self.err(422, 'weak_password', 'Password should be at least 6 characters')
            if e in Mock.users: return self.out(200, {'id': Mock.users[e]['id'], 'email': e, 'identities': []})
            us = {'id': str(uuid.uuid4()), 'email': e, 'pw': b['password'], 'nome': (b.get('data') or {}).get('nome', ''), 'confirmed': not e.startswith('confirm')}
            Mock.users[e] = us; Mock.byid[us['id']] = us
            return self.out(200, self.session(us) if us['confirmed'] else {'id': us['id'], 'email': e})
        if p == '/auth/v1/token' and m == 'POST':
            gt = q.get('grant_type', [''])[0]; b = self.body()
            if gt == 'password':
                us = Mock.users.get(b['email'])
                if not us or us['pw'] != b['password']: return self.err(400, 'invalid_credentials', 'Invalid login credentials')
                if not us['confirmed']: return self.err(400, 'email_not_confirmed', 'Email not confirmed')
                return self.out(200, self.session(us))
            if gt == 'refresh_token':
                uid = Mock.refresh.pop(b['refresh_token'], None)
                if not uid or uid not in Mock.byid: return self.err(400, 'refresh_token_not_found', 'Invalid Refresh Token')
                return self.out(200, self.session(Mock.byid[uid], Mock.amr.get(b['refresh_token'])))   # renovar mantem o horario do login
        if p == '/auth/v1/recover' and m == 'POST': return self.out(200, {})
        if p == '/auth/v1/logout' and m == 'POST':
            self.send_response(204); self.cors(); self.end_headers(); return
        uid = self.uid()
        if not uid or uid not in Mock.byid: return self.err(401, 'bad_jwt', 'invalid JWT')
        if p == '/rest/v1/rpc/segredo_do_aparelho' and m == 'POST':   # backend/sql/2026-11-25_segredo_do_aparelho.sql
            if Mock.fail_n > 0: Mock.fail_n -= 1; return self.err(503, 'unexpected_failure', 'down')
            return self.out(200, Mock.segredos.setdefault(uid, secrets.token_hex(32)))
        if p == '/rest/v1/rpc/excluir_minha_conta' and m == 'POST':   # backend/sql/2026-11-25_excluir_minha_conta.sql
            if Mock.fail_n > 0: Mock.fail_n -= 1; return self.err(503, 'unexpected_failure', 'down')
            tok = self.headers.get('Authorization', '').replace('Bearer ', '')
            ts = [a['timestamp'] for a in Mock.amr.get(tok, []) if a['method'] == 'password']
            if not ts or max(ts) < time.time() - 600:
                Mock.log.append(('RECUSA', p, 'reautenticacao'))
                return self.out(403, {'code': '42501', 'message': 'excluir_minha_conta: confirme a senha de novo', 'details': None, 'hint': 'reautenticacao'})
            us = Mock.byid.pop(uid); del Mock.users[us['email']]; Mock.segredos.pop(uid, None)
            for t in Mock.db.rows:
                for k, r in list(Mock.db.rows[t].items()):
                    if r['user_id'] == uid: del Mock.db.rows[t][k]
            for d in (Mock.access, Mock.refresh):
                for k, v in list(d.items()):
                    if v == uid: del d[k]
            self.send_response(204); self.cors(); self.end_headers(); return
        if p == '/auth/v1/user':
            us = Mock.byid[uid]
            if m == 'PUT':
                b = self.body()
                if b.get('password') == us['pw']: return self.err(422, 'same_password', 'New password should be different')
                us['pw'] = b['password']
            return self.out(200, self.user(us))
        mt = re.match(r'^/rest/v1/([a-z_]+)$', p)
        if not mt or mt.group(1) not in TABLES: return self.out(404, {'code': '42P01', 'message': 'relation does not exist: %s' % p})
        t = mt.group(1)
        try:
            if m != 'GET':
                if Mock.fail_n > 0: Mock.fail_n -= 1; return self.err(503, 'unexpected_failure', 'down')
                if Mock.reject_n > 0: Mock.reject_n -= 1; raise DbError(400, '23514', 'new row violates check constraint')
            if m == 'GET':
                filt = parse_filters(q, t)
                sel = [s.strip() for s in q.get('select', ['*'])[0].split(',')]
                for s in sel:
                    if s != '*' and s not in TABLES[t]['cols']: raise DbError(400, '42703', 'column %s.%s does not exist' % (t, s))
                rows = [r for r in Mock.db.mine(t, uid) if filt(r)]
                for o in reversed([x for x in q.get('order', [''])[0].split(',') if x]):
                    c, _, d = o.partition('.')
                    if c not in TABLES[t]['cols']: raise DbError(400, '42703', 'column %s.%s does not exist' % (t, c))
                    rows.sort(key=lambda r: (r[c] is None, str(r[c])), reverse=(d == 'desc'))
                lim = int(q.get('limit', ['1000000'])[0]); off = int(q.get('offset', ['0'])[0])
                return self.out(200, [out_row(r, sel) for r in rows[off:off + lim]])
            if m == 'POST':
                rows = self.body(); rows = rows if isinstance(rows, list) else [rows]
                if len(set(tuple(sorted(r)) for r in rows)) > 1: raise DbError(400, 'PGRST102', 'All object keys must match')
                prefer = self.headers.get('Prefer', '')
                mode = 'merge' if 'merge-duplicates' in prefer else ('ignore' if 'ignore-duplicates' in prefer else None)
                conflict = tuple(q['on_conflict'][0].split(',')) if 'on_conflict' in q else None
                if conflict and mode is None: mode = 'merge'
                Mock.db.upsert(t, uid, rows, conflict, mode)
                return self.out(201)
            if m == 'DELETE':
                if not [c for c in q if c not in ('select', 'order', 'limit', 'offset')]: raise DbError(400, '21000', 'DELETE requires a WHERE clause')
                Mock.db.delete(t, uid, parse_filters(q, t))
                self.send_response(204); self.cors(); self.end_headers(); return
            raise DbError(405, 'PGRST000', 'método não suportado no mock')
        except DbError as e:
            Mock.log.append(('ERRO', p, '%s %s' % (e.code, e.msg)))
            return self.out(e.status, {'code': e.code, 'message': e.msg, 'details': None, 'hint': None})
    def ctl(self, p, q):
        if p == '/__mock/log': return self.out(200, Mock.log)
        if p == '/__mock/clearlog': Mock.log.clear(); return self.out(200, {})
        if p == '/__mock/fail': Mock.fail_n = int(q['n'][0]); return self.out(200, {})
        if p == '/__mock/reject': Mock.reject_n = int(q['n'][0]); return self.out(200, {})
        if p == '/__mock/confirm': Mock.users[q['email'][0]]['confirmed'] = True; return self.out(200, {})
        if p == '/__mock/expire': Mock.access.clear(); return self.out(200, {})
        if p == '/__mock/link':
            us = Mock.users[q['email'][0]]; s = self.session(us, [{'method': q['type'][0], 'timestamp': int(time.time())}])
            return self.out(200, {'hash': '#access_token=%s&refresh_token=%s&expires_in=3600&expires_at=%d&token_type=bearer&type=%s' % (s['access_token'], s['refresh_token'], s['expires_at'], q['type'][0])})
        if p == '/__mock/rows':
            t = q['t'][0]; e = q.get('email', [None])[0]
            rows = Mock.db.rows[t].values()
            if e: rows = [r for r in rows if r['user_id'] == Mock.users[e]['id']]
            return self.out(200, [out_row(r, ['*']) for r in rows])
        if p == '/__mock/age_auth':   # envelhece o login com senha de todos os tokens da conta (simula sessao antiga)
            uid = Mock.users[q['email'][0]]['id']; s = int(q['s'][0])
            for d in (Mock.access, Mock.refresh):
                for k, v in d.items():
                    if v == uid: Mock.amr[k] = [dict(a, timestamp=a['timestamp'] - s) for a in Mock.amr.get(k, [])]
            return self.out(200, {})
        if p == '/__mock/users': return self.out(200, {e: {'pw': u['pw'], 'id': u['id']} for e, u in Mock.users.items()})
        self.err(404, 'nf', p)

class Static(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        d = os.path.join(os.path.normpath(SITE_DIR), ''); p = self.path.split('?')[0].split('#')[0]; p = 'index.html' if p == '/' else p.lstrip('/')
        f = os.path.normpath(os.path.join(d, p))
        if not f.startswith(d) or not os.path.isfile(f): self.send_response(404); self.end_headers(); return
        data = open(f, 'rb').read(); ct = {'html': 'text/html; charset=utf-8', 'js': 'text/javascript; charset=utf-8', 'css': 'text/css', 'svg': 'image/svg+xml', 'webmanifest': 'application/manifest+json', 'json': 'application/json', 'woff2': 'font/woff2'}[f.rsplit('.', 1)[1]]
        self.send_response(200); self.send_header('Content-Type', ct); self.send_header('Content-Length', str(len(data)))
        for h in json.load(open(d + 'vercel.json'))['headers'][0]['headers']: self.send_header(h['key'], h['value'])
        self.end_headers(); self.wfile.write(data)

if __name__ == '__main__':
    if sys.argv[1] == 'mock': ThreadingHTTPServer(('127.0.0.1', 8766), Mock).serve_forever()
    else: ThreadingHTTPServer(('127.0.0.1', 8765), Static).serve_forever()
