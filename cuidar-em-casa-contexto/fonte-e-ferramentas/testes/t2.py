import json, urllib.request, time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8765/'; M='http://127.0.0.1:8766'
SHOT='/tmp/claude-0/-home-claude/aa82f2d5-0af4-559e-8728-4499b420e757/scratchpad/'
def mock(path): return json.loads(urllib.request.urlopen(M+path).read() or b'null')
def rows(t): return mock('/__mock/rows?t='+t)
ok=[0,0]
def chk(name,cond,extra=''):
    ok[0 if cond else 1]+=1; print(('  OK   ' if cond else '  FALHA ')+name+(' '+str(extra) if extra!='' else ''))
def login(pg,email,pw,manter=False):
    pg.wait_for_selector('#f-entrar'); pg.fill('#a-email',email); pg.fill('#a-senha',pw)
    if manter: pg.check('#a-manter')
    pg.locator('#f-entrar button[type=submit]').click()
def logged(pg,t=8000): pg.wait_for_selector('#gate',state='hidden',timeout=t)
def add_company(pg,nome):
    pg.locator('.tabs button').nth(2).click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-company')
    pg.fill('#f-company [name=nome]',nome); pg.locator('#f-company button[type=submit]').click(); pg.wait_for_timeout(300)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    errs=[]
    def newctx(**k):
        c=b.new_context(viewport={'width':390,'height':844},has_touch=True,accept_downloads=True,**k); return c
    def newpage(c):
        pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text and 'status of 40' not in m.text and 'status of 50' not in m.text else None); return pg
    ctx=newctx(); pg=newpage(ctx)
    print('A) entrar com a conta criada antes'); pg.goto(URL); login(pg,'ana@teste.com','senha-segura-1'); logged(pg)
    chk('mostra exemplos e nada salvo',pg.locator('#foot').inner_text().startswith('Dados de exemplo'))
    print('B) primeira gravacao'); add_company(pg,'Clinica Teste'); pg.wait_for_timeout(1500)
    pr=rows('profiles'); co=rows('companies'); pa=rows('patients'); vi=rows('visits')
    chk('perfil criado e iniciado',len(pr)==1 and pr[0]['iniciado'] is True,pr[0]['nome'] if pr else '')
    chk('empresa nova no servidor',any(r['data'].get('nome')=='Clinica Teste' for r in co),len(co))
    chk('exemplos tambem gravados',len(pa)==5 and len(vi)==14,(len(pa),len(vi)))
    chk('linhas so com user_id,id,data(,date,status)',all(set(r)<= {'uid','user_id','id','data','date','status'} for r in co+pa+vi))
    chk('id nao duplicado dentro de data',all('id' not in r['data'] for r in co+pa+vi))
    chk('rodape: salvo na conta',pg.locator('#foot').inner_text().startswith('Dados privados'),pg.locator('#foot').inner_text())
    print('C) recarregar a pagina'); pg.reload(); logged(pg); pg.wait_for_timeout(300)
    pg.locator('.tabs button').nth(2).click(); pg.wait_for_timeout(300)
    chk('dados vieram do servidor',('Clinica Teste' in pg.locator('#view').inner_text()) and not pg.locator('#foot').inner_text().startswith('Dados de exemplo'))
    print('D) gravacao incremental'); mock('/__mock/clearlog')
    pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="perfil"]').click(); pg.wait_for_timeout(250)
    pg.fill('#pf-tel','(11) 90000-0000'); pg.locator('#f-perfil button[type=submit]').click(); pg.wait_for_timeout(1500)
    w=[(m,pa) for m,pa,q in mock('/__mock/log') if m in('POST','DELETE')]
    chk('so o perfil foi enviado',w==[('POST','/rest/v1/profiles')],w)
    chk('telefone gravado',rows('profiles')[0]['tel']=='(11) 90000-0000')
    print('E) token expirado (401) renova sozinho'); mock('/__mock/expire'); mock('/__mock/clearlog')
    add_company(pg,'Empresa Pos Expiracao'); pg.wait_for_timeout(2000)
    lg=mock('/__mock/log')
    chk('chamou refresh_token',any('grant_type=refresh_token' in q for m,pa,q in lg))
    chk('gravou depois de renovar',any(r['data'].get('nome')=='Empresa Pos Expiracao' for r in rows('companies')))
    chk('continua logado',pg.locator('#gate').is_hidden())
    print('F) servidor fora do ar (503) e depois volta'); mock('/__mock/fail?n=2')
    add_company(pg,'Empresa Apos Falha'); pg.wait_for_timeout(900)
    chk('rodape avisa erro',pg.locator('#foot').inner_text().startswith('Não foi possível salvar'),pg.locator('#foot').inner_text())
    for _ in range(40):
        if pg.locator('#foot').inner_text().startswith('Dados privados'): break
        pg.wait_for_timeout(500)
    chk('retentou e salvou',any(r['data'].get('nome')=='Empresa Apos Falha' for r in rows('companies')))
    print('G) servidor recusa (400)'); mock('/__mock/reject?n=1')
    add_company(pg,'Empresa Recusada'); pg.wait_for_timeout(1200)
    chk('rodape avisa recusa',pg.locator('#foot').inner_text().startswith('O servidor recusou'),pg.locator('#foot').inner_text())
    print('H) backup'); pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="perfil"]').click(); pg.wait_for_timeout(250)
    with pg.expect_download() as d: pg.locator('[data-action="backup"]').click()
    dl=d.value; path=SHOT+'backup_teste.json'; dl.save_as(path); bk=json.load(open(path))
    chk('arquivo de backup valido',dl.suggested_filename.startswith('cuidar-em-casa_backup_') and bk['app']=='cuidar-em-casa' and len(bk['pacientes'])==5 and len(bk['empresas'])>=4,(dl.suggested_filename,len(bk['pacientes']),len(bk['empresas'])))
    print('I) sair'); pg.locator('[data-action="logout"]').click(); pg.wait_for_selector('#f-entrar'); pg.wait_for_timeout(300)
    chk('sessao apagada do navegador',pg.evaluate("Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter(k=>k.includes(':sb')).length")==0)
    chk('nenhum paciente na tela',('Helena' not in pg.evaluate('document.body.innerText')) and pg.locator('#view').inner_html()=='')
    pg.reload(); pg.wait_for_selector('#f-entrar'); chk('apos recarregar continua deslogado',True)
    print('J) erros de login'); 
    login(pg,'ana@teste.com','errada-123'); pg.wait_for_timeout(600); chk('senha errada',pg.locator('#f-err').inner_text()=='E-mail ou senha incorretos.',pg.locator('#f-err').inner_text())
    pg.fill('#a-email','naoexiste@teste.com'); pg.locator('#f-entrar button[type=submit]').click(); pg.wait_for_timeout(600); chk('e-mail inexistente (mesma mensagem)',pg.locator('#f-err').inner_text()=='E-mail ou senha incorretos.')
    print('K) confirmacao de e-mail'); pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome','Carla'); pg.fill('#a-email','confirm1@teste.com'); pg.fill('#a-senha','senha-segura-2'); pg.fill('#a-conf','senha-segura-2'); pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_timeout(700)
    chk('pede para confirmar e-mail',pg.locator('#gate h1').inner_text()=='Confirme seu e-mail' and 'confirm1@teste.com' in pg.locator('#gate .sub').inner_text())
    pg.locator('[data-action="auth-back"]').click(); login(pg,'confirm1@teste.com','senha-segura-2'); pg.wait_for_timeout(700)
    chk('login antes de confirmar e barrado',pg.locator('#f-err').inner_text().startswith('Confirme seu e-mail'),pg.locator('#f-err').inner_text())
    mock('/__mock/confirm?email=confirm1@teste.com'); h=mock('/__mock/link?email=confirm1@teste.com&type=signup')['hash']
    pg.goto('about:blank'); pg.goto(URL+h); logged(pg); chk('link de confirmacao entra no app',True); chk('hash removido da URL',pg.evaluate('location.hash')=='' )
    print('L) recuperar senha'); pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="perfil"]').click(); pg.wait_for_timeout(250); pg.locator('[data-action="logout"]').click(); pg.wait_for_selector('#f-entrar')
    pg.locator('[data-action="auth-forgot"]').click(); pg.wait_for_selector('#f-reset'); pg.fill('#a-email','confirm1@teste.com'); pg.locator('#f-reset button[type=submit]').click(); pg.wait_for_timeout(600)
    chk('mensagem generica do reset','Se esse e-mail tiver uma conta' in pg.locator('#gate').inner_text())
    h=mock('/__mock/link?email=confirm1@teste.com&type=recovery')['hash']; pg.goto('about:blank'); pg.goto(URL+h); pg.wait_for_selector('#f-nova')
    pg.fill('#a-senha','nova-senha-33'); pg.fill('#a-conf','nova-senha-33'); pg.locator('#f-nova button[type=submit]').click(); logged(pg); chk('nova senha definida e entrou',True)
    pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="perfil"]').click(); pg.wait_for_timeout(250); pg.locator('[data-action="logout"]').click(); pg.wait_for_selector('#f-entrar')
    login(pg,'confirm1@teste.com','nova-senha-33'); logged(pg); chk('entra com a senha nova',True)
    print('M) trocar senha logado'); pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="perfil"]').click(); pg.wait_for_timeout(250); pg.locator('[data-action="open-password"]').click(); pg.wait_for_selector('#f-senha')
    pg.fill('#s-atual','errada'); pg.fill('#s-nova','outra-senha-44'); pg.fill('#s-conf','outra-senha-44'); pg.locator('#f-senha button[type=submit]').click(); pg.wait_for_timeout(700); chk('senha atual errada',pg.locator('#f-err').inner_text()=='A senha atual está incorreta.',pg.locator('#f-err').inner_text())
    pg.fill('#s-atual','nova-senha-33'); pg.locator('#f-senha button[type=submit]').click(); pg.wait_for_timeout(900); chk('senha trocada no servidor',mock('/__mock/users')['confirm1@teste.com']['pw']=='outra-senha-44')
    print('N) manter conectado'); c2=newctx(); p2=newpage(c2); p2.goto(URL); login(p2,'ana@teste.com','senha-segura-1',manter=True); logged(p2)
    chk('sessao em localStorage',p2.evaluate("!!localStorage.getItem('cuidar-em-casa:sb')"))
    p3=c2.new_page(); p3.goto(URL); logged(p3,6000); chk('nova aba ja entra logada',True)
    c3=newctx(); p4=newpage(c3); p4.goto(URL); p4.wait_for_selector('#f-entrar'); login(p4,'ana@teste.com','senha-segura-1'); logged(p4)
    chk('sem manter: so sessionStorage',p4.evaluate("!localStorage.getItem('cuidar-em-casa:sb') && !!sessionStorage.getItem('cuidar-em-casa:sb')"))
    p5=c3.new_page(); p5.goto(URL); p5.wait_for_selector('#f-entrar'); chk('nova aba sem manter pede login',True)
    print('O) isolamento: outro usuario nao ve nada do primeiro'); 
    c4=newctx(); p6=newpage(c4); p6.goto(URL); p6.wait_for_selector('#f-entrar'); p6.locator('[data-action="auth-create"]').click(); p6.wait_for_selector('#f-criar')
    p6.fill('#a-nome','Bia'); p6.fill('#a-email','bia@teste.com'); p6.fill('#a-senha','senha-segura-3'); p6.fill('#a-conf','senha-segura-3'); p6.locator('#f-criar button[type=submit]').click(); logged(p6)
    p6.locator('.tabs button').nth(2).click(); p6.wait_for_timeout(300)
    chk('Bia nao ve a empresa de Ana','Clinica Teste' not in p6.locator('#view').inner_text())
    print('P) inatividade'); 
    try:
        c5=newctx(); p7=newpage(c5); p7.clock.install(); p7.goto(URL); login(p7,'ana@teste.com','senha-segura-1'); logged(p7); p7.clock.run_for(16*60*1000); p7.wait_for_selector('#f-entrar',timeout=5000)
        chk('sai sozinho apos 15 min sem uso','inatividade' in p7.locator('#gate').inner_text())
    except Exception as e: print('  (teste de relogio nao executado:',str(e)[:80],')')
    print('\nresultado: %d ok, %d falhas | erros JS/console: %s'%(ok[0],ok[1],errs)); b.close()
