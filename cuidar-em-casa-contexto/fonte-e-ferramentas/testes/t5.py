"""Testes de navegador da v18b (tipo de atendimento ligado a lista) contra o Supabase simulado. Cria a conta tipos.ana@teste.com.
Rode com ./rodar_testes.sh."""
import datetime, json, os, urllib.request
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/'; M = 'http://127.0.0.1:8766'
def mock(path): return json.loads(urllib.request.urlopen(M + path).read() or b'null')
def rows(t, email): return mock('/__mock/rows?t=' + t + '&email=' + email)
def db_errors(): return [x for x in mock('/__mock/log') if x[0] == 'ERRO']
ok = [0, 0]
def chk(name, cond, extra=''):
    ok[0 if cond else 1] += 1; print(('  OK   ' if cond else '  FALHA ') + name + (' ' + str(extra) if extra != '' else ''))
def saved(pg):
    for _ in range(40):
        if pg.locator('#foot').count() and pg.locator('#foot').inner_text().startswith('Dados privados'): return True
        pg.wait_for_timeout(150)
    return False
def br(d): return d.strftime('%d/%m/%Y')
E = 'tipos.ana@teste.com'; PW = 'senha-segura-1'; hoje = datetime.date.today()

def menu(pg, go): pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="%s"]' % go).click(); pg.wait_for_timeout(300)
def tipo_db(nome): return next((r for r in rows('service_types', E) if r['nome'] == nome), None)
def novo_tipo(pg, nome):
    menu(pg, 'atend'); pg.locator('#fab').click(); pg.wait_for_selector('#f-tipo'); pg.fill('#t-nome', nome); pg.locator('#f-tipo button[type=submit]').click(); saved(pg)
def abrir_tipo(pg, nome):
    menu(pg, 'atend'); pg.locator('[data-action="open-tipo"][data-name="%s"]' % nome).click(); pg.wait_for_selector('#f-tipo')
def agendar(pg, pac_id, hora, tipo=None, tipo_novo=None):
    pg.locator('[data-action="tab"][data-tab="agenda"]').click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-visit')
    pg.select_option('#v-pac', pac_id); pg.fill('#v-data', br(hoje)); pg.fill('#v-hora', hora)
    if tipo_novo:
        pg.select_option('#v-tipo', '__novo'); pg.fill('#v-tipo-novo', tipo_novo); pg.locator('#f-visit [data-action="tipo-add"]').click()
    elif tipo: pg.select_option('#v-tipo', tipo)
    pg.locator('#f-visit button[type=submit]').click(); saved(pg)
def visita_do_tipo(nome): return [r for r in rows('visits', E) if r['tipo'] == nome]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome', 'Ana Tipos'); pg.fill('#a-email', E); pg.fill('#a-senha', PW); pg.fill('#a-conf', PW); pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
    pg.locator('[data-action="clear-demo"]').click(); pg.wait_for_timeout(300)

    print('A) cadastrar um tipo novo (Menu > Atendimentos > Tipo)')
    novo_tipo(pg, 'Troca de sonda'); t1 = tipo_db('Troca de sonda')
    chk('tipo gravado no banco', t1 is not None, t1 and t1['nome']); T1 = t1['id']

    print('B) atendimento com esse tipo fica ligado ao id e guarda o nome')
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-patient')
    pg.fill('#p-nome', 'Paciente Tipos'); pg.fill('#p-val', '100,00'); pg.locator('#f-patient button[type=submit]').click(); saved(pg)
    pac = rows('patients', E)[0]['id']
    agendar(pg, pac, '08:00', tipo='Troca de sonda'); v = visita_do_tipo('Troca de sonda')
    chk('visits.service_type_id = id do tipo, e o nome em texto', len(v) == 1 and v[0]['service_type_id'] == T1, v and v[0]['service_type_id'])

    print('C) criar o tipo DENTRO do formulario e usar no mesmo envio (o tipo tem de ir antes)')
    agendar(pg, pac, '09:00', tipo_novo='Curativo X'); t2 = tipo_db('Curativo X')
    chk('tipo criado no formulario foi para o banco', t2 is not None); T2 = t2 and t2['id']
    v2 = visita_do_tipo('Curativo X'); chk('atendimento ligado ao tipo novo', len(v2) == 1 and v2[0]['service_type_id'] == T2, v2 and v2[0]['service_type_id'])
    chk('nenhum erro do banco (a ordem de gravacao esta certa)', db_errors() == [], db_errors())

    print('D) recorrencia tambem aponta para o tipo')
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-patient')
    pg.fill('#p-nome', 'Paciente Recorrente'); pg.check('#p-rec'); pg.check('#rec-box input[name=dia][value="1"]'); pg.fill('#p-rhora', '10:00'); pg.select_option('#p-rtipo', 'Troca de sonda'); pg.fill('#p-rini', br(hoje))
    pg.locator('#f-patient button[type=submit]').click(); saved(pg)
    rc = rows('recurrences', E); chk('recurrences.service_type_id = id do tipo', len(rc) == 1 and rc[0]['service_type_id'] == T1, rc and rc[0]['service_type_id'])

    print('E) renomear o tipo: o MESMO id, o nome novo em tudo, nada fica solto')
    abrir_tipo(pg, 'Troca de sonda'); pg.fill('#t-nome', 'Troca de sonda vesical'); pg.locator('#f-tipo button[type=submit]').click(); saved(pg)
    tr = [r for r in rows('service_types', E) if r['id'] == T1]
    chk('mesma linha, nome novo', len(tr) == 1 and tr[0]['nome'] == 'Troca de sonda vesical', tr)
    chk('nao sobrou o tipo com o nome antigo', tipo_db('Troca de sonda') is None)
    va = [r for r in rows('visits', E) if r['service_type_id'] == T1]; chk('atendimento continua ligado e com o nome novo', len(va) == 1 and va[0]['tipo'] == 'Troca de sonda vesical', va and (va[0]['tipo'], va[0]['service_type_id']))
    rc = rows('recurrences', E); chk('recorrencia continua ligada e com o nome novo', rc[0]['service_type_id'] == T1 and rc[0]['tipo'] == 'Troca de sonda vesical', (rc[0]['tipo'], rc[0]['service_type_id']))
    pg.reload(); pg.wait_for_selector('#gate', state='hidden', timeout=8000); pg.wait_for_timeout(400)
    pg.locator('[data-action="tab"][data-tab="agenda"]').click(); pg.wait_for_timeout(250)
    chk('depois de recarregar, a agenda mostra o nome novo', 'Troca de sonda vesical' in pg.locator('#view').inner_text(), pg.locator('#view').inner_text()[:140].replace('\n', ' | '))
    menu(pg, 'atend'); lt = pg.locator('#view').inner_text()
    chk('lista de tipos mostra o nome novo e quantos usam', 'Troca de sonda vesical' in lt and '1 atendimento' in lt, lt.replace('\n', ' | ')[:200])

    print('F) excluir um tipo em uso: o atendimento guarda o nome, a ligacao e solta')
    abrir_tipo(pg, 'Curativo X'); pg.locator('.sheet [data-action="ask"]').click(); pg.locator('.sheet .confirm:not([hidden]) .btn.danger').click(); saved(pg); pg.wait_for_timeout(250)
    chk('tipo some do banco', tipo_db('Curativo X') is None)
    v2 = visita_do_tipo('Curativo X'); chk('atendimento mantem o nome e fica sem ligacao', len(v2) == 1 and v2[0]['service_type_id'] is None, v2 and v2[0]['service_type_id'])
    pg.reload(); pg.wait_for_selector('#gate', state='hidden', timeout=8000); pg.wait_for_timeout(400)
    pg.locator('[data-action="tab"][data-tab="agenda"]').click(); pg.wait_for_timeout(250)
    chk('depois de recarregar, o atendimento ainda mostra "Curativo X"', 'Curativo X' in pg.locator('#view').inner_text())
    chk('nenhum erro do banco no fim', db_errors() == [], db_errors())
    print('\nresultado: %d ok, %d falhas | erros JS/console: %s' % (ok[0], ok[1], errs)); b.close()
