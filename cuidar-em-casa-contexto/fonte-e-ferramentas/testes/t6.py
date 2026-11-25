"""Testes de navegador da tela Configuracoes (parte 1): esconder dados de saude e apagar dados de exemplo.
Usa os dados de exemplo (Helena Prado: condicoes, alergia a Dipirona, medicamentos). Cria a conta config.ana@teste.com.
Rode com ./rodar_testes.sh."""
import datetime, json, os, urllib.request
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/'; M = 'http://127.0.0.1:8766'
def mock(path): return json.loads(urllib.request.urlopen(M + path).read() or b'null')
ok = [0, 0]
def chk(name, cond, extra=''):
    ok[0 if cond else 1] += 1; print(('  OK   ' if cond else '  FALHA ') + name + (' ' + str(extra) if extra != '' else ''))
E = 'config.ana@teste.com'; PW = 'Senha-segura-1'; hoje = datetime.date.today()
domingo = hoje - datetime.timedelta(days=(hoje.weekday() + 1) % 7); segunda = domingo + datetime.timedelta(days=1)
CONDICAO = 'Hipertensão e diabetes'; ALERGIA = 'Dipirona'; REMEDIO = 'Losartana'

def config(pg):
    pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="config"]').click(); pg.wait_for_timeout(300)
def fechar(pg):
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
def ficha_helena(pg):
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200)
    pg.locator('[data-action="open-patient"][data-id="ex-p1"]').first.click(); pg.wait_for_selector('#sheet-root .sum'); pg.wait_for_timeout(200)
def visita_helena(pg):
    pg.locator('[data-action="tab"][data-tab="agenda"]').click(); pg.wait_for_timeout(200)
    pg.locator('[data-action="pick-day"][data-day="%s"]' % segunda.isoformat()).click(); pg.wait_for_timeout(200)
    pg.locator('.stop-card', has_text='Helena').first.click(); pg.wait_for_selector('#sheet-root .sum'); pg.wait_for_timeout(200)
def visivel(pg, txt): return pg.locator('#sheet-root').get_by_text(txt, exact=False).first.is_visible() if pg.locator('#sheet-root').get_by_text(txt, exact=False).count() else False
def tem_alerta(pg): return pg.locator('#sheet-root .alert').count() == 1 and pg.locator('#sheet-root .alert').is_visible()
def botao_mostrar(pg): return pg.locator('#sheet-root [data-action="health-show"]')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome', 'Ana Config'); pg.fill('#a-email', E); pg.fill('#a-senha', PW); pg.fill('#a-conf', PW); pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)

    print('A) Menu > Configuracoes abre uma tela de verdade (nao mais "Em breve")')
    config(pg)
    chk('nao mostra "Em breve"', pg.locator('#sheet-root .soon').count() == 0)
    chk('tem a opcao "Esconder dados de saude", desmarcada por padrao', pg.locator('#cfg-saude').count() == 1 and not pg.locator('#cfg-saude').is_checked())
    chk('tem a secao de dados de exemplo com o botao de apagar', pg.locator('#sheet-root [data-action="ask"][data-confirm="cf-demo"]').count() == 1)
    fechar(pg)

    print('B) Com a opcao desligada (padrao), a ficha mostra tudo como antes')
    ficha_helena(pg)
    chk('condicoes visiveis', visivel(pg, CONDICAO)); chk('medicamentos visiveis', visivel(pg, REMEDIO)); chk('alergia visivel', visivel(pg, ALERGIA))
    chk('nao ha botao "Mostrar dados de saude"', botao_mostrar(pg).count() == 0)
    fechar(pg)

    print('C) Ligar a opcao: a ficha esconde condicoes, medicamentos e alergias, mas o ALERTA de alergia continua')
    config(pg); pg.locator('label[for="cfg-saude"]').click(); pg.wait_for_timeout(200)
    chk('opcao marcada', pg.locator('#cfg-saude').is_checked())
    chk('guardada so neste aparelho (localStorage)', pg.evaluate("localStorage.getItem('cuidar-em-casa:ocultar-saude')") == '1')
    fechar(pg); ficha_helena(pg)
    chk('condicoes escondidas', not visivel(pg, CONDICAO)); chk('medicamentos escondidos', not visivel(pg, REMEDIO)); chk('nome da alergia escondido', not visivel(pg, ALERGIA))
    chk('o aviso vermelho de alergia continua aparecendo (seguranca do paciente)', tem_alerta(pg))
    chk('ha o botao "Mostrar dados de saude"', botao_mostrar(pg).count() == 1)
    chk('o resto da ficha continua visivel (endereco)', visivel(pg, 'Rua das Acácias'))
    botao_mostrar(pg).click(); pg.wait_for_timeout(200)
    chk('tocar em Mostrar revela condicoes, medicamentos e alergia', visivel(pg, CONDICAO) and visivel(pg, REMEDIO) and visivel(pg, ALERGIA))
    fechar(pg); ficha_helena(pg)
    chk('ao reabrir a ficha, volta a esconder', not visivel(pg, CONDICAO) and not visivel(pg, ALERGIA))
    fechar(pg)

    print('D) Ficha do atendimento: alergia tambem fica coberta, com o aviso')
    visita_helena(pg)
    chk('nome da alergia escondido no atendimento', not visivel(pg, ALERGIA)); chk('aviso de alergia presente', tem_alerta(pg))
    botao_mostrar(pg).click(); pg.wait_for_timeout(200)
    chk('Mostrar revela a alergia no atendimento', visivel(pg, ALERGIA))
    fechar(pg)

    print('E) A escolha continua depois de recarregar a pagina')
    pg.reload(); pg.wait_for_selector('#gate', state='hidden', timeout=8000); pg.wait_for_timeout(300)
    config(pg); chk('opcao continua marcada', pg.locator('#cfg-saude').is_checked()); fechar(pg)
    ficha_helena(pg); chk('continua escondendo', not visivel(pg, CONDICAO)); fechar(pg)

    print('F) Desligar volta ao normal')
    config(pg); pg.locator('label[for="cfg-saude"]').click(); pg.wait_for_timeout(200); fechar(pg)
    chk('localStorage = 0', pg.evaluate("localStorage.getItem('cuidar-em-casa:ocultar-saude')") == '0')
    ficha_helena(pg); chk('condicoes visiveis de novo', visivel(pg, CONDICAO) and botao_mostrar(pg).count() == 0); fechar(pg)

    print('G) Apagar dados de exemplo pelas Configuracoes, com confirmacao')
    config(pg); pg.locator('#sheet-root [data-action="ask"][data-confirm="cf-demo"]').click(); pg.wait_for_timeout(150)
    chk('pede confirmacao antes de apagar', pg.locator('#cf-demo').is_visible())
    pg.locator('#cf-demo [data-action="unask"]').click(); pg.wait_for_timeout(150); fechar(pg)
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200)
    chk('"Manter" nao apaga nada', pg.locator('[data-action="open-patient"][data-id="ex-p1"]').count() >= 1)
    config(pg); pg.locator('#sheet-root [data-action="ask"][data-confirm="cf-demo"]').click(); pg.wait_for_timeout(150)
    pg.locator('#cf-demo [data-action="clear-demo-config"]').click(); pg.wait_for_timeout(400)
    chk('a tela de Configuracoes continua aberta e avisa que nao ha mais exemplos', pg.locator('#sheet-root').get_by_text('Não há dados de exemplo').count() == 1)
    chk('o botao de apagar sumiu', pg.locator('#sheet-root [data-confirm="cf-demo"]').count() == 0)
    fechar(pg)
    chk('os pacientes de exemplo sumiram da lista', pg.locator('[data-action="open-patient"][data-id^="ex-"]').count() == 0)
    chk('o aviso de exemplos sumiu da agenda', pg.locator('[data-action="clear-demo"]').count() == 0)
    chk('nada de exemplo foi para o banco', mock('/__mock/rows?t=patients&email=' + E) == [])

    chk('sem erros na pagina', errs == [], errs)
    b.close()
print('Resultado: %d OK, %d falhas' % (ok[0], ok[1]))
