"""Testes de navegador: Menu > Atendimentos abre como folha (igual a Perfil, Configuracoes e Faturamento), sem trocar a tela de fundo.
Cria a conta folha.ana@teste.com. Rode com ./rodar_testes.sh."""
import json, os, urllib.request
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/'; M = 'http://127.0.0.1:8766'
def mock(path): return json.loads(urllib.request.urlopen(M + path).read() or b'null')
def tipos_db(): return sorted(r['nome'] for r in mock('/__mock/rows?t=service_types&email=' + E))
ok = [0, 0]
def chk(name, cond, extra=''):
    ok[0 if cond else 1] += 1; print(('  OK   ' if cond else '  FALHA ') + name + (' ' + str(extra) if extra != '' else ''))
E = 'folha.ana@teste.com'; PW = 'Senha-segura-1'
def saved(pg):
    for _ in range(40):
        if pg.locator('#foot').count() and pg.locator('#foot').inner_text().startswith('Dados privados'): return True
        pg.wait_for_timeout(150)
    return False
def folha(pg): return pg.locator('#sheet-root').inner_text() if pg.locator('#sheet-root .sheet').count() else ''
def titulo_folha(pg): return pg.locator('#sheet-root h2').first.inner_text() if pg.locator('#sheet-root h2').count() else ''
def abrir_atendimentos(pg):
    pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="atend"]').click(); pg.wait_for_timeout(350)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    pg = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome', 'Ana Folha'); pg.fill('#a-email', E); pg.fill('#a-senha', PW); pg.fill('#a-conf', PW); pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    pg.locator('[data-action="clear-demo"]').click(); saved(pg)

    print('A) Menu > Atendimentos abre uma folha, como os outros itens do menu')
    fundo = pg.locator('#top h1').inner_text()
    abrir_atendimentos(pg)
    chk('abre uma folha com o titulo "Atendimentos"', titulo_folha(pg) == 'Atendimentos', titulo_folha(pg))
    chk('a folha lista os tipos de atendimento', pg.locator('#sheet-root [data-action="open-tipo"]').count() >= 1)
    chk('a tela de fundo nao muda', pg.locator('#top h1').inner_text() == fundo, pg.locator('#top h1').inner_text())
    chk('a barra de baixo nao muda (o + continua "Agendar")', pg.locator('#fab .lbl').inner_text() == 'Agendar')
    larg = pg.evaluate("[document.querySelector('#sheet-root .sheet').getBoundingClientRect().width, document.documentElement.clientWidth]")
    chk('a folha ocupa a mesma largura das outras folhas do menu', abs(larg[0] - larg[1]) <= 1, larg)

    print('B) Novo tipo: cancelar e salvar voltam para a lista, sem fechar')
    pg.locator('#sheet-root [data-action="new-tipo"]').click(); pg.wait_for_selector('#f-tipo')
    pg.locator('#f-tipo [data-action="tipos-voltar"]').click(); pg.wait_for_timeout(300)
    chk('cancelar volta para a lista de tipos', titulo_folha(pg) == 'Atendimentos')
    pg.locator('#sheet-root [data-action="new-tipo"]').click(); pg.wait_for_selector('#f-tipo')
    pg.fill('#t-nome', 'Troca de sonda'); pg.locator('#f-tipo button[type=submit]').click(); saved(pg); pg.wait_for_timeout(300)
    chk('salvar volta para a lista, com o tipo novo', titulo_folha(pg) == 'Atendimentos' and 'Troca de sonda' in folha(pg))
    chk('o tipo novo foi para o banco', 'Troca de sonda' in tipos_db(), tipos_db())

    print('C) Renomear e excluir tambem voltam para a lista')
    pg.locator('#sheet-root [data-action="open-tipo"][data-name="Troca de sonda"]').click(); pg.wait_for_selector('#f-tipo')
    pg.fill('#t-nome', 'Troca de sonda vesical'); pg.locator('#f-tipo button[type=submit]').click(); saved(pg); pg.wait_for_timeout(300)
    chk('renomear volta para a lista com o nome novo', titulo_folha(pg) == 'Atendimentos' and 'Troca de sonda vesical' in folha(pg))
    pg.locator('#sheet-root [data-action="open-tipo"][data-name="Troca de sonda vesical"]').click(); pg.wait_for_selector('#f-tipo')
    pg.locator('#sheet-root [data-action="ask"]').click(); pg.locator('#sheet-root .confirm:not([hidden]) .btn.danger').click(); saved(pg); pg.wait_for_timeout(300)
    chk('excluir volta para a lista, sem o tipo', titulo_folha(pg) == 'Atendimentos' and 'Troca de sonda vesical' not in folha(pg))
    chk('excluido no banco', 'Troca de sonda vesical' not in tipos_db(), tipos_db())

    print('D) Voltar ao menu e fechar')
    pg.locator('#sheet-root [data-action="open-menu"]').click(); pg.wait_for_timeout(300)
    chk('"Voltar ao menu" abre o menu', titulo_folha(pg) == 'Menu')
    chk('o item "Atendimentos" do menu mostra quantos tipos ha', 'tipos cadastrados' in pg.locator('[data-go="atend"]').inner_text(), pg.locator('[data-go="atend"]').inner_text())
    pg.locator('[data-go="atend"]').click(); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    chk('fechar a folha deixa a tela de fundo como estava', pg.locator('#sheet-root .sheet').count() == 0 and pg.locator('#top h1').inner_text() == fundo)

    chk('sem erros na pagina', errs == [], errs)
    b.close()
print('Resultado: %d OK, %d falhas' % (ok[0], ok[1]))
