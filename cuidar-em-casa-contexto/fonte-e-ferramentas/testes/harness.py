import sys, json, re, time, threading, os, secrets
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
BASE='/tmp/claude-0/-home-claude/aa82f2d5-0af4-559e-8728-4499b420e757/scratchpad/'
REAL='https://ynbqblvdtgwabczbssfp.supabase.co'; MOCK='http://127.0.0.1:8766'
ID=re.compile(r'^[A-Za-z0-9_-]{1,64}$')

class Mock(BaseHTTPRequestHandler):
    users={}      # email -> dict
    byid={}
    access={}     # token -> uid
    refresh={}    # token -> uid
    tables={t:{} for t in ('profiles','companies','patients','visits')}  # table -> {(uid,id):row}
    log=[]; fail_n=0; reject_n=0
    def log_message(self,*a): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Headers','apikey,authorization,content-type,prefer')
        self.send_header('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS')
    def out(self,code,obj=None):
        b=b'' if obj is None else json.dumps(obj).encode()
        self.send_response(code); self.cors(); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def err(self,code,ec,msg): self.out(code,{'code':code,'error_code':ec,'msg':msg})
    def session(self,u):
        at='at-'+secrets.token_hex(8); rt='rt-'+secrets.token_hex(8)
        Mock.access[at]=u['id']; Mock.refresh[rt]=u['id']
        return {'access_token':at,'refresh_token':rt,'expires_in':3600,'expires_at':int(time.time())+3600,'token_type':'bearer','user':self.user(u)}
    def user(self,u): return {'id':u['id'],'email':u['email'],'user_metadata':{'nome':u['nome']}}
    def body(self):
        n=int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n)) if n else None
    def uid(self):
        a=self.headers.get('Authorization','')
        return Mock.access.get(a.replace('Bearer ','')) if a.startswith('Bearer ') else None
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self): self.route('GET')
    def do_POST(self): self.route('POST')
    def do_PUT(self): self.route('PUT')
    def do_DELETE(self): self.route('DELETE')
    def route(self,m):
        u=urlparse(self.path); q=parse_qs(u.query); p=u.path
        Mock.log.append((m,p,u.query))
        if p.startswith('/__mock/'): return self.ctl(p,q)
        if self.headers.get('apikey')!='sb_publishable_Tuay0Raxi1UIqQLi1pNrcA_hqdThXOV': return self.err(401,'no_authorization','No API key')
        if p=='/auth/v1/signup' and m=='POST':
            b=self.body(); e=b['email']
            if len(b['password'])<6: return self.err(422,'weak_password','Password should be at least 6 characters')
            if e in Mock.users: return self.out(200,{'id':Mock.users[e]['id'],'email':e,'identities':[]})
            us={'id':secrets.token_hex(8),'email':e,'pw':b['password'],'nome':(b.get('data') or {}).get('nome',''),'confirmed':not e.startswith('confirm')}
            Mock.users[e]=us; Mock.byid[us['id']]=us
            return self.out(200,self.session(us) if us['confirmed'] else {'id':us['id'],'email':e})
        if p=='/auth/v1/token' and m=='POST':
            gt=q.get('grant_type',[''])[0]; b=self.body()
            if gt=='password':
                us=Mock.users.get(b['email'])
                if not us or us['pw']!=b['password']: return self.err(400,'invalid_credentials','Invalid login credentials')
                if not us['confirmed']: return self.err(400,'email_not_confirmed','Email not confirmed')
                return self.out(200,self.session(us))
            if gt=='refresh_token':
                uid=Mock.refresh.pop(b['refresh_token'],None)
                if not uid: return self.err(400,'refresh_token_not_found','Invalid Refresh Token')
                return self.out(200,self.session(Mock.byid[uid]))
        if p=='/auth/v1/recover' and m=='POST': return self.out(200,{})
        if p=='/auth/v1/logout' and m=='POST':
            self.send_response(204); self.cors(); self.end_headers(); return
        uid=self.uid()
        if not uid: return self.err(401,'bad_jwt','invalid JWT')
        if p=='/auth/v1/user':
            us=Mock.byid[uid]
            if m=='PUT':
                b=self.body()
                if b.get('password')==us['pw']: return self.err(422,'same_password','New password should be different')
                us['pw']=b['password']
            return self.out(200,self.user(us))
        mt=re.match(r'^/rest/v1/(profiles|companies|patients|visits)$',p)
        if mt:
            t=mt.group(1); tab=Mock.tables[t]; mine={k:v for k,v in tab.items() if k[0]==uid}
            if m!='GET':
                if Mock.fail_n>0: Mock.fail_n-=1; return self.err(503,'unexpected_failure','down')
                if Mock.reject_n>0: Mock.reject_n-=1; return self.out(400,{'code':'23514','message':'new row violates check constraint'})
            if m=='GET':
                rows=sorted(mine.values(),key=lambda r:(r.get('date',''),r.get('id',r.get('user_id'))))
                lim=int(q.get('limit',['1000'])[0]); off=int(q.get('offset',['0'])[0])
                return self.out(200,[dict(r) for r in rows[off:off+lim]])
            if m=='POST':
                rows=self.body(); rows=rows if isinstance(rows,list) else [rows]
                keys=set(map(lambda r:tuple(sorted(r)),rows))
                if len(keys)>1: return self.out(400,{'code':'PGRST102','message':'All object keys must match'})
                for r in rows:
                    if r.get('user_id')!=uid: return self.out(403,{'code':'42501','message':'new row violates row-level security policy'})
                    if t!='profiles':
                        if not ID.match(r.get('id','')) or not isinstance(r.get('data'),dict): return self.out(400,{'code':'23514','message':'check'})
                        if t=='visits' and r.get('status') not in ('agendado','feito','cancelado'): return self.out(400,{'code':'23514','message':'check'})
                for r in rows: tab[(uid,r.get('id'))]=dict(r)
                return self.out(201)
            if m=='DELETE':
                ids=re.match(r'^in\.\((.*)\)$',q['id'][0]).group(1).split(',')
                for i in ids: tab.pop((uid,unquote(i)),None)
                self.send_response(204); self.cors(); self.end_headers(); return
        self.err(404,'not_found',p)
    def ctl(self,p,q):
        if p=='/__mock/log': return self.out(200,Mock.log)
        if p=='/__mock/clearlog': Mock.log.clear(); return self.out(200,{})
        if p=='/__mock/fail': Mock.fail_n=int(q['n'][0]); return self.out(200,{})
        if p=='/__mock/reject': Mock.reject_n=int(q['n'][0]); return self.out(200,{})
        if p=='/__mock/confirm': Mock.users[q['email'][0]]['confirmed']=True; return self.out(200,{})
        if p=='/__mock/expire':  # invalida todos os access tokens
            Mock.access.clear(); return self.out(200,{})
        if p=='/__mock/link':
            us=Mock.users[q['email'][0]]; s=self.session(us); return self.out(200,{'hash':'#access_token=%s&refresh_token=%s&expires_in=3600&expires_at=%d&token_type=bearer&type=%s'%(s['access_token'],s['refresh_token'],s['expires_at'],q['type'][0])})
        if p=='/__mock/rows':
            t=q['t'][0]; return self.out(200,[{'uid':k[0],**v} for k,v in Mock.tables[t].items()])
        if p=='/__mock/users': return self.out(200,{e:{'pw':u['pw'],'id':u['id']} for e,u in Mock.users.items()})
        self.err(404,'nf',p)

class Static(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        d=BASE+'site_test/'; p=self.path.split('?')[0].split('#')[0]; p='index.html' if p=='/' else p.lstrip('/')
        f=os.path.normpath(os.path.join(d,p))
        if not f.startswith(d) or not os.path.isfile(f): self.send_response(404); self.end_headers(); return
        data=open(f,'rb').read(); ct={'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css','svg':'image/svg+xml','webmanifest':'application/manifest+json','json':'application/json'}[f.rsplit('.',1)[1]]
        self.send_response(200); self.send_header('Content-Type',ct); self.send_header('Content-Length',str(len(data)))
        for h in json.load(open(d+'vercel.json'))['headers'][0]['headers']: self.send_header(h['key'],h['value'])
        self.end_headers(); self.wfile.write(data)

if __name__=='__main__':
    if sys.argv[1]=='mock': ThreadingHTTPServer(('127.0.0.1',8766),Mock).serve_forever()
    else: ThreadingHTTPServer(('127.0.0.1',8765),Static).serve_forever()
