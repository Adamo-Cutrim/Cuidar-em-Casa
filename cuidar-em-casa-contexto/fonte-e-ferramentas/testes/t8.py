"""Testes de navegador da v20a: o app abre sem internet (service worker), sem guardar dados no aparelho.
Cria a conta offline.ana@teste.com. Rode com ./rodar_testes.sh."""
import json, os, urllib.request
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/'; M = 'http://127.0.0.1:8766'
def mock(path): return json.loads(urllib.request.urlopen(M + path).read() or b'null')
ok = [0, 0]
def chk(name, cond, extra=''):
    ok[0 if cond else 1] += 1; print(('  OK   ' if cond else '  FALHA ') + name + (' ' + str(extra) if extra != '' else ''))
E = 'offline.ana@teste.com'; PW = 'Senha-segura-1'
def saved(pg):
    for _ in range(40):
        if pg.locator('#foot').count() and pg.locator('#foot').inner_text().startswith('Dados privados'): return True
        pg.wait_for_timeout(150)
    return False
def controlada(pg):
    for _ in range(40):
        if pg.evaluate('!!(navigator.serviceWorker && navigator.serviceWorker.controller)'): return True
        pg.wait_for_timeout(150)
    return False
def gate_h1(pg): return pg.locator('#gate h1').inner_text() if pg.locator('#gate h1').count() else ''

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='allow'); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'ERR_INTERNET_DISCONNECTED' not in m.text else None)

    print('A) Primeira visita com internet: o app instala o service worker')
    pg.goto(URL); pg.wait_for_selector('#gate h1')
    pg.evaluate('Promise.race([navigator.serviceWorker.ready.then(()=>1), new Promise(r=>setTimeout(()=>r(0),5000))])'); pg.reload(); pg.wait_for_selector('#gate h1')
    chk('a pagina passa a ser atendida pelo service worker', controlada(pg))

    print('B) Sem internet, o app ABRE (antes: tela de erro do navegador)')
    ctx.set_offline(True)
    try: pg.reload(); pg.wait_for_selector('#gate h1', timeout=8000)
    except Exception as e: print('  (sem internet a pagina nao abriu: %s)' % str(e)[:80])
    chk('a tela de entrada aparece sem internet', 'Entrar' in gate_h1(pg) or pg.locator('#f-entrar').count() == 1, gate_h1(pg))
    chk('estilos e fontes carregaram (o titulo usa a fonte do app)', 'Bricolage' in pg.evaluate("getComputedStyle(document.querySelector('#gate h1')).fontFamily"))
    chk('sem erro de codigo (todos os modulos vieram do aparelho)', errs == [], errs)
    try: pg.goto(URL + 'pacientes?x=1'); pg.wait_for_selector('#gate h1', timeout=8000)
    except Exception as e: print('  (outro endereco sem internet nao abriu: %s)' % str(e)[:60])
    chk('sem internet, abrir por outro endereco do site tambem abre o app', pg.locator('#gate h1').count() == 1)
    ctx.set_offline(False)

    print('C) Conta com "manter conectado": sem internet abre e explica; com a internet de volta, entra sozinho')
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome', 'Ana Offline'); pg.fill('#a-email', E); pg.fill('#a-senha', PW); pg.fill('#a-conf', PW); pg.locator('#a-manter').check()
    pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    pg.locator('[data-action="clear-demo"]').click(); pg.wait_for_timeout(300)
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-patient')
    pg.fill('#p-nome', 'Paciente Sigiloso'); pg.fill('#p-con', 'Diagnostico sigiloso'); pg.locator('#f-patient button[type=submit]').click(); saved(pg)
    ctx.set_offline(True); pg.reload(); pg.wait_for_selector('#gate h1', timeout=8000); pg.wait_for_timeout(500)
    chk('mostra "Sem conexao" com Tentar de novo', gate_h1(pg) == 'Sem conexão' and pg.locator('[data-action="auth-retry"]').count() == 1, gate_h1(pg))
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))")
    pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(300)
    chk('quando a internet volta, entra sozinho e mostra os dados', pg.locator('#view').get_by_text('Paciente Sigiloso').count() >= 1)

    print('D) Nenhum dado de paciente fica guardado pelo service worker (isso e a v20b, depende de decisao)')
    urls = pg.evaluate("caches.keys().then(ks=>Promise.all(ks.map(k=>caches.open(k).then(c=>c.keys()).then(rs=>rs.map(r=>r.url))))).then(a=>a.flat())")
    chk('o cache so tem arquivos do proprio site', len(urls) > 0 and all(u.startswith(URL) for u in urls), [u for u in urls if not u.startswith(URL)])
    textos = pg.evaluate("caches.keys().then(ks=>Promise.all(ks.map(k=>caches.open(k).then(c=>c.keys().then(rs=>Promise.all(rs.map(r=>c.match(r).then(x=>x.text())))))))).then(a=>a.flat().join('|'))")
    chk('nenhum arquivo guardado contem o paciente ou o diagnostico', 'Sigiloso' not in textos and 'sigiloso' not in textos)

    print('E) Com internet, uma versao nova do site chega na hora (o guardado so serve sem rede)')
    css = os.path.join(os.environ['SITE_DIR'], 'styles.css'); orig = open(css, encoding='utf-8').read()
    open(css, 'w', encoding='utf-8').write(orig + '\n/* versao-nova-t8 */\n')
    try:
        pg.reload(); pg.wait_for_timeout(800)
        novo = pg.evaluate("fetch('/styles.css').then(r=>r.text())")
        chk('com internet, o navegador recebe o arquivo novo', 'versao-nova-t8' in novo)
        ctx.set_offline(True)
        off = pg.evaluate("fetch('/styles.css').then(r=>r.text())")
        chk('e o guardado foi atualizado (sem internet ja vem o novo)', 'versao-nova-t8' in off)
        ctx.set_offline(False)
    finally:
        open(css, 'w', encoding='utf-8').write(orig)

    chk('sem erros na pagina', errs == [], errs)
    b.close()
print('Resultado: %d OK, %d falhas' % (ok[0], ok[1]))
