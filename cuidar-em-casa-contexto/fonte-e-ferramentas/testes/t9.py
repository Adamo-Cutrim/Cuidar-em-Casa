"""Testes de navegador da v20b: dados no aparelho, cifrados com PIN, para consultar sem internet.
Decisões do usuário (25/11/2026): PIN de 6 números; 5 erros apagam a cópia; com internet não pede PIN; trava após 15 min sem uso.
Cria a conta pin.ana@teste.com. Rode com ./rodar_testes.sh."""
import json, os, urllib.request
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/'; M = 'http://127.0.0.1:8766'
def mock(path): return json.loads(urllib.request.urlopen(M + path).read() or b'null')
ok = [0, 0]
def chk(name, cond, extra=''):
    ok[0 if cond else 1] += 1; print(('  OK   ' if cond else '  FALHA ') + name + (' ' + str(extra) if extra != '' else ''))
E = 'pin.ana@teste.com'; PW = 'Senha-segura-1'; PIN = '482913'; PIN2 = '551177'
def saved(pg):
    for _ in range(40):
        if pg.locator('#foot').count() and pg.locator('#foot').inner_text().startswith('Dados privados'): return True
        pg.wait_for_timeout(150)
    return False
def menu(pg, go): pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="%s"]' % go).click(); pg.wait_for_timeout(300)
def fechar(pg): pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
def h1(pg): return pg.locator('#gate h1').inner_text() if pg.locator('#gate h1').count() and pg.locator('#gate').is_visible() else ''
def erro(pg, sel='#f-err'): return pg.locator(sel).first.inner_text() if pg.locator(sel).count() else ''
DUMP = """() => new Promise(res => { const r = indexedDB.open('cuidar-em-casa'); r.onerror = () => res('ERRO');
  r.onupgradeneeded = () => { r.transaction.abort(); res('VAZIO'); };
  r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('aparelho')) { db.close(); return res('VAZIO'); }
    const g = db.transaction('aparelho').objectStore('aparelho').getAll(); g.onsuccess = () => { db.close();
      const s = JSON.stringify(g.result, (k, v) => v instanceof Uint8Array ? Array.from(v).map(b => String.fromCharCode(b)).join('') : v); res(g.result.length ? s : 'VAZIO'); }; }; })"""
def guardado(pg): return pg.evaluate(DUMP)
def offline_reload(ctx, pg):
    ctx.set_offline(True); pg.reload(); pg.wait_for_selector('#gate h1', timeout=8000); pg.wait_for_timeout(400)
def digita_pin(pg, pin):
    pg.fill('#pin-campo', pin); pg.locator('#f-pin button[type=submit]').click(); pg.wait_for_timeout(2500)
def pacientes(pg):
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(300); return pg.locator('#view').inner_text()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='allow'); pg = ctx.new_page()
    pg.clock.install()   # o tempo corre normal; o teste F avanca 15 minutos de uma vez
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'ERR_INTERNET_DISCONNECTED' not in m.text else None)
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.wait_for_timeout(800); pg.reload(); pg.wait_for_selector('#gate h1')
    pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome', 'Ana Pin'); pg.fill('#a-email', E); pg.fill('#a-senha', PW); pg.fill('#a-conf', PW); pg.locator('#a-manter').check()
    pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    pg.locator('[data-action="clear-demo"]').click(); pg.wait_for_timeout(300)
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-patient')
    pg.fill('#p-nome', 'Paciente Sigiloso'); pg.fill('#p-con', 'Diagnostico reservado'); pg.locator('#f-patient button[type=submit]').click(); saved(pg)

    print('A) Configuracoes: ativar o uso sem internet com PIN')
    menu(pg, 'config')
    chk('ha a secao "Usar sem internet", ainda desligada', pg.locator('#sheet-root [data-action="offline-ativar"]').count() == 1)
    chk('nada guardado no aparelho antes de ativar', guardado(pg) == 'VAZIO')
    pg.locator('#sheet-root [data-action="offline-ativar"]').click(); pg.wait_for_selector('#f-offline')
    def ativar(p1, p2, bloqueio):
        pg.fill('#of-pin', p1); pg.fill('#of-conf', p2)
        if pg.locator('#of-bloq').is_checked() != bloqueio: pg.locator('label[for="of-bloq"]').click()
        pg.locator('#f-offline button[type=submit]').click(); pg.wait_for_timeout(2500)
    ativar('12345', '12345', True); chk('PIN com 5 numeros e recusado', '6 números' in erro(pg, '#f-offline #f-err'), erro(pg, '#f-offline #f-err'))
    ativar('12345a', '12345a', True); chk('PIN com letra e recusado', '6 números' in erro(pg, '#f-offline #f-err'))
    ativar(PIN, '482914', True); chk('PINs diferentes sao recusados', 'iguais' in erro(pg, '#f-offline #f-err'), erro(pg, '#f-offline #f-err'))
    ativar(PIN, PIN, False); chk('sem confirmar o bloqueio de tela do celular, recusa', 'bloqueio de tela' in erro(pg, '#f-offline #f-err').lower(), erro(pg, '#f-offline #f-err'))
    chk('nenhuma das recusas guardou algo', guardado(pg) == 'VAZIO')
    ativar(PIN, PIN, True)
    menu(pg, 'config')
    chk('Configuracoes mostra "ativo" e a hora da copia', 'Ativo neste aparelho' in pg.locator('#sheet-root').inner_text())
    fechar(pg)
    g = guardado(pg)
    chk('ha uma copia guardada no aparelho', g not in ('VAZIO', 'ERRO'))
    chk('a copia esta cifrada: nada do paciente, do PIN nem do e-mail aparece', all(x not in g for x in ('Sigiloso', 'Diagnostico', PIN, E)), g[:80])
    chk('o segredo da conta foi pedido ao servidor', any('/rpc/segredo_do_aparelho' in x[1] for x in mock('/__mock/log')))

    print('B) Com internet, a copia acompanha o que e salvo (sem pedir PIN)')
    pg.locator('#fab').click(); pg.wait_for_selector('#f-patient'); pg.fill('#p-nome', 'Paciente Dois'); pg.locator('#f-patient button[type=submit]').click(); saved(pg); pg.wait_for_timeout(1500)
    chk('nao pediu PIN com internet', pg.locator('#f-pin').count() == 0)

    print('C) Sem internet: pede o PIN, mostra os dados, so consulta')
    offline_reload(ctx, pg)
    chk('a tela e a do PIN (nao "Sem conexao")', pg.locator('#f-pin').count() == 1, h1(pg))
    digita_pin(pg, '000000')
    chk('PIN errado: avisa e diz quantas tentativas restam', '4' in erro(pg) and 'incorreto' in erro(pg).lower(), erro(pg))
    digita_pin(pg, PIN)
    chk('PIN certo: o app abre', not pg.locator('#gate').is_visible())
    txt = pacientes(pg)
    chk('mostra os dois pacientes (a copia estava atualizada)', 'Paciente Sigiloso' in txt and 'Paciente Dois' in txt)
    chk('avisa que esta sem internet e so consulta', 'Sem internet' in pg.locator('#top').inner_text())
    chk('o botao de adicionar some', pg.locator('#fab').count() == 0 or not pg.locator('#fab').is_visible())
    pg.locator('#view').get_by_text('Paciente Sigiloso').first.click(); pg.wait_for_timeout(300)
    chk('a ficha abre com o diagnostico', 'Diagnostico reservado' in pg.locator('#sheet-root').inner_text())
    pg.locator('#sheet-root [data-action="edit-patient"]').click(); pg.wait_for_selector('#f-patient'); pg.fill('#p-nome', 'Nome Trocado Offline')
    pg.locator('#f-patient button[type=submit]').click(); pg.wait_for_timeout(500)
    chk('tentar salvar sem internet nao muda nada', 'Nome Trocado Offline' not in pacientes(pg) and 'Paciente Sigiloso' in pacientes(pg))

    print('D) A internet volta: o app volta ao normal sozinho (sem PIN)')
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(2500)
    chk('saiu do modo sem internet', 'Sem internet' not in pg.locator('#top').inner_text() and pg.locator('#fab').is_visible())

    print('E) Trocar o PIN (com internet): o novo abre, o antigo nao')
    menu(pg, 'config'); pg.locator('#sheet-root [data-action="offline-trocar"]').click(); pg.wait_for_selector('#f-offline')
    pg.fill('#of-pin', PIN2); pg.fill('#of-conf', PIN2)
    if not pg.locator('#of-bloq').is_checked(): pg.locator('label[for="of-bloq"]').click()
    pg.locator('#f-offline button[type=submit]').click(); pg.wait_for_timeout(2500)
    offline_reload(ctx, pg); digita_pin(pg, PIN)
    chk('o PIN antigo nao abre mais', pg.locator('#f-pin').count() == 1)
    digita_pin(pg, PIN2); chk('o PIN novo abre', not pg.locator('#gate').is_visible())

    print('F) 15 minutos sem uso: trava e pede o PIN de novo')
    chk('antes da trava, a lista de pacientes esta na tela', 'Paciente Sigiloso' in pacientes(pg))
    pg.clock.fast_forward(15 * 60 * 1000 + 2000); pg.wait_for_timeout(800)
    chk('voltou para a tela do PIN', pg.locator('#f-pin').count() == 1, h1(pg))
    chk('os dados sairam da pagina (nem escondidos ficam)', not pg.evaluate("document.body.textContent.includes('Sigiloso') || document.body.textContent.includes('Diagnostico')"))

    print('G) 5 erros seguidos apagam a copia do aparelho')
    for i in range(5): digita_pin(pg, '00000%d' % i)
    chk('avisa que a copia foi apagada', 'apagad' in (pg.locator('#gate').inner_text()).lower(), pg.locator('#gate').inner_text()[:150])
    chk('nao pede mais PIN', pg.locator('#f-pin').count() == 0)
    chk('o aparelho nao tem mais a copia', guardado(pg) == 'VAZIO')
    ctx.set_offline(False); pg.reload(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    chk('com internet tudo continua na conta', 'Paciente Sigiloso' in pacientes(pg))

    print('H) Sem "manter conectado": abre com o PIN pela tela de entrada')
    menu(pg, 'config'); pg.locator('#sheet-root [data-action="offline-ativar"]').click(); pg.wait_for_selector('#f-offline')
    pg.fill('#of-pin', PIN); pg.fill('#of-conf', PIN); pg.locator('label[for="of-bloq"]').click(); pg.locator('#f-offline button[type=submit]').click(); pg.wait_for_timeout(2500)
    pg.evaluate("Object.keys(localStorage).filter(k=>k==='cuidar-em-casa:sb').forEach(k=>localStorage.removeItem(k)); sessionStorage.clear()")
    offline_reload(ctx, pg)
    chk('sem sessao e sem internet, a tela de entrada oferece abrir com o PIN', pg.locator('[data-action="pin-abrir"]').count() == 1, h1(pg))
    pg.locator('[data-action="pin-abrir"]').click(); pg.wait_for_selector('#f-pin'); digita_pin(pg, PIN)
    chk('abriu com o PIN', 'Paciente Sigiloso' in pacientes(pg))
    ctx.set_offline(False)

    print('I) "Sair" apaga a copia do aparelho')
    pg.reload(); pg.wait_for_selector('#gate h1'); pg.fill('#a-email', E); pg.fill('#a-senha', PW); pg.locator('#f-entrar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    chk('antes de sair, a copia existe', guardado(pg) not in ('VAZIO', 'ERRO'))
    menu(pg, 'perfil'); pg.locator('#sheet-root [data-action="logout"]').click(); pg.wait_for_selector('#gate h1'); pg.wait_for_timeout(500)
    chk('depois de sair, o aparelho nao tem mais a copia', guardado(pg) == 'VAZIO')

    print('J) Excluir a conta apaga a copia do aparelho')
    pg.fill('#a-email', E); pg.fill('#a-senha', PW); pg.locator('#f-entrar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    menu(pg, 'config'); pg.locator('#sheet-root [data-action="offline-ativar"]').click(); pg.wait_for_selector('#f-offline')
    pg.fill('#of-pin', PIN); pg.fill('#of-conf', PIN); pg.locator('label[for="of-bloq"]').click(); pg.locator('#f-offline button[type=submit]').click(); pg.wait_for_timeout(2500)
    menu(pg, 'config'); pg.locator('#sheet-root [data-action="open-excluir"]').click(); pg.wait_for_selector('#f-excluir')
    pg.fill('#ex-senha', PW); pg.fill('#ex-conf', 'EXCLUIR'); pg.locator('#f-excluir button[type=submit]').click(); pg.wait_for_selector('#gate', state='visible', timeout=8000); pg.wait_for_timeout(500)
    chk('excluir a conta apaga a copia do aparelho', guardado(pg) == 'VAZIO')

    chk('sem erros na pagina', errs == [], errs)
    b.close()
print('Resultado: %d OK, %d falhas' % (ok[0], ok[1]))
