import json
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8765/'; M='http://127.0.0.1:8766'
SHOT='/tmp/claude-0/-home-claude/aa82f2d5-0af4-559e-8728-4499b420e757/scratchpad/'
import urllib.request
def mock(path):
    return json.loads(urllib.request.urlopen(M+path).read() or b'null')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':390,'height':844},has_touch=True,accept_downloads=True)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console:'+m.text) if m.type in('error','warning') and 'fonts.g' not in m.text else None)
    pg.goto(URL); pg.wait_for_selector('#gate h1'); print('1) gate:',pg.locator('#gate h1').inner_text(),'| botoes:',pg.locator('#gate .sheet-actions button').all_inner_texts())
    pg.screenshot(path=SHOT+'sb_gate.png')
    pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome','Ana Souza'); pg.fill('#a-email','Ana@Teste.com'); pg.fill('#a-senha','senha-segura-1'); pg.fill('#a-conf','senha-segura-1')
    pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate',state='hidden',timeout=8000)
    print('2) logou; rodape:',pg.locator('#foot').inner_text(),'| saudacao topo:',pg.locator('#top').inner_text().replace('\n',' | ')[:80])
    print('   linhas no servidor antes de editar:',{t:len(mock('/__mock/rows?t='+t)) for t in ('profiles','companies','patients','visits')})
    st=pg.evaluate("JSON.stringify({l:Object.keys(localStorage),s:Object.keys(sessionStorage)})"); print('   storage chaves:',st)
    print('   Helena em storage:', 'Helena' in pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)"))
    print('3) abrir formulario de empresa')
    pg.locator('.tabs button').nth(2).click(); pg.wait_for_timeout(300); pg.locator('#fab').click(); pg.wait_for_timeout(400)
    print('   form:',pg.eval_on_selector('.sheet form','f=>f.id+" :: "+Array.from(f.elements).map(e=>e.name).join(",")'))
    pg.screenshot(path=SHOT+'sb_form.png')
    print('erros:',errs); b.close()
