"""Testes de navegador de Configuracoes > Excluir minha conta, contra o Supabase simulado.
Cria duas contas: exclui.ana@teste.com (sera excluida) e fica.bia@teste.com (tem de ficar intacta).
Rode com ./rodar_testes.sh."""
import json, os, urllib.request
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/'; M = 'http://127.0.0.1:8766'
def mock(path): return json.loads(urllib.request.urlopen(M + path).read() or b'null')
def rows(t, email): return mock('/__mock/rows?t=' + t + '&email=' + email) if email in mock('/__mock/users') else []
ok = [0, 0]
def chk(name, cond, extra=''):
    ok[0 if cond else 1] += 1; print(('  OK   ' if cond else '  FALHA ') + name + (' ' + str(extra) if extra != '' else ''))
def saved(pg):
    for _ in range(40):
        if pg.locator('#foot').count() and pg.locator('#foot').inner_text().startswith('Dados privados'): return True
        pg.wait_for_timeout(150)
    return False
A = 'exclui.ana@teste.com'; B = 'fica.bia@teste.com'; PW = 'Senha-segura-1'

def criar_conta(pg, nome, email):
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome', nome); pg.fill('#a-email', email); pg.fill('#a-senha', PW); pg.fill('#a-conf', PW); pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    pg.locator('[data-action="clear-demo"]').click(); pg.wait_for_timeout(300)
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-patient')
    pg.fill('#p-nome', 'Paciente de ' + nome); pg.fill('#p-con', 'Dado de saude de ' + nome); pg.locator('#f-patient button[type=submit]').click(); saved(pg)
def abrir_excluir(pg):
    pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="config"]').click(); pg.wait_for_timeout(300)
    pg.locator('#sheet-root [data-action="open-excluir"]').click(); pg.wait_for_selector('#f-excluir')
def enviar(pg, senha, palavra):
    pg.fill('#ex-senha', senha); pg.fill('#ex-conf', palavra); pg.locator('#f-excluir button[type=submit]').click(); pg.wait_for_timeout(700)
def erro(pg): return pg.locator('#f-excluir #f-err').inner_text() if pg.locator('#f-excluir #f-err').count() else ''
def conta_existe(email): return email in mock('/__mock/users')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    cb = b.new_context(viewport={'width': 390, 'height': 844}); pb = cb.new_page(); criar_conta(pb, 'Bia', B); cb.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    criar_conta(pg, 'Ana', A)
    pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="config"]').click(); pg.wait_for_timeout(300)
    pg.locator('label[for="cfg-saude"]').click(); pg.wait_for_timeout(150); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    chk('ha uma preferencia guardada no aparelho antes de excluir', pg.evaluate("localStorage.getItem('cuidar-em-casa:ocultar-saude')") == '1')
    UID_A = mock('/__mock/users')[A]['id']
    chk('as duas contas tem dados no banco', len(rows('patients', A)) == 1 and len(rows('patients', B)) == 1)

    print('A) Configuracoes > Excluir minha conta explica o que acontece antes de pedir a senha')
    abrir_excluir(pg)
    txt = pg.locator('#sheet-root').inner_text()
    chk('diz que nao da para desfazer', 'não dá para desfazer' in txt.lower(), txt[:80])
    chk('mostra quantos pacientes serao apagados', '1 paciente' in txt)
    chk('oferece baixar o backup antes', pg.locator('#sheet-root [data-action="backup"]').count() == 1)

    print('B) Recusas: nada e apagado')
    mock('/__mock/clearlog'); enviar(pg, '', 'EXCLUIR'); chk('sem senha: pede a senha', 'senha' in erro(pg).lower(), erro(pg))
    chk('sem senha: nem chega ao servidor', not any('/auth/v1/token' in x[1] for x in mock('/__mock/log')))
    enviar(pg, PW, 'excluir conta'); chk('palavra de confirmacao errada: recusa', 'EXCLUIR' in erro(pg), erro(pg))
    enviar(pg, 'Senha-errada-9', 'EXCLUIR'); chk('senha errada: avisa', 'incorreta' in erro(pg).lower(), erro(pg))
    mock('/__mock/fail?n=1'); enviar(pg, PW, 'EXCLUIR')
    chk('falha do servidor: avisa que nada foi apagado', 'nada foi apagado' in erro(pg).lower(), erro(pg))
    chk('depois das recusas a conta e os dados continuam', conta_existe(A) and len(rows('patients', A)) == 1)

    print('C) Exclusao: mesmo com a sessao antiga, o app confirma a senha de novo e a conta some com todos os dados')
    mock('/__mock/age_auth?email=' + A + '&s=7200')
    enviar(pg, PW, ' excluir ')   # minusculas e espacos sao aceitos
    pg.wait_for_selector('#gate', state='visible', timeout=8000)
    chk('volta para a tela de entrada com o aviso', 'excluídos' in pg.locator('#gate').inner_text(), pg.locator('#gate').inner_text()[:120])
    chk('a conta nao existe mais', not conta_existe(A))
    TABS = ('profiles', 'companies', 'patients', 'visits', 'recurrences', 'recurrence_exceptions', 'service_types')
    chk('nenhum dado da conta ficou no banco (7 tabelas)', not any(r['user_id'] == UID_A for t in TABS for r in mock('/__mock/rows?t=' + t)))
    chk('o servidor nao recusou por falta de senha recente', not any(x[0] == 'RECUSA' for x in mock('/__mock/log')))
    chk('a outra conta continua intacta', conta_existe(B) and len(rows('patients', B)) == 1)
    chk('nada do app ficou guardado no aparelho', pg.evaluate("Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter(k=>k.startsWith('cuidar-em-casa:')).length") == 0)

    print('D) Nao da para entrar de novo com a conta excluida')
    login = pg.locator('#gate form').first
    login.locator('input[type=email]').fill(A); login.locator('input[type=password]').fill(PW); login.locator('button[type=submit]').click(); pg.wait_for_timeout(700)
    chk('login recusado', pg.locator('#gate').is_visible())

    chk('sem erros na pagina', errs == [], errs)
    b.close()
print('Resultado: %d OK, %d falhas' % (ok[0], ok[1]))
