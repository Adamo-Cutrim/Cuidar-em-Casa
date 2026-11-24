"""Testes de navegador da v18a (valor guardado ao marcar como feito) contra o Supabase simulado. Cria a conta valor.ana@teste.com.
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
E = 'valor.ana@teste.com'; PW = 'senha-segura-1'
hoje = datetime.date.today(); ontem = hoje - datetime.timedelta(days=1)

def novo_paciente(pg, nome, valor):
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-patient')
    pg.fill('#p-nome', nome); pg.fill('#p-val', valor); pg.locator('#f-patient button[type=submit]').click(); saved(pg)
def novo_atendimento(pg, pac_id, data, hora):
    pg.locator('[data-action="tab"][data-tab="agenda"]').click(); pg.wait_for_timeout(200); pg.locator('#fab').click(); pg.wait_for_selector('#f-visit')
    pg.select_option('#v-pac', pac_id); pg.fill('#v-data', br(data)); pg.fill('#v-hora', hora); pg.locator('#f-visit button[type=submit]').click(); saved(pg)
def abrir_atendimento(pg):
    pg.locator('.route [data-action="open-visit"]').first.click(); pg.wait_for_selector('.sheet [data-action="visit-status"]')
def mudar_status(pg, status):
    pg.locator('.sheet [data-action="visit-status"][data-status="%s"]' % status).click(); saved(pg); pg.wait_for_timeout(250)
def mudar_valor_paciente(pg, nome, valor):
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200)
    pg.locator('[data-action="open-patient"]', has_text=nome).first.click(); pg.wait_for_selector('.sheet [data-action="edit-patient"]'); pg.locator('.sheet [data-action="edit-patient"]').click()
    pg.wait_for_selector('#f-patient'); pg.fill('#p-val', valor); pg.locator('#f-patient button[type=submit]').click(); saved(pg)
def relatorio_realizado(pg):
    pg.locator('[data-action="tab"][data-tab="pacientes"]').click(); pg.wait_for_timeout(200); pg.locator('[data-action="open-report"]').first.click(); pg.wait_for_selector('.tile.real')
    t = pg.locator('.tile.real .tv').inner_text().replace('\xa0', ' '); pg.locator('.sheet [data-action="close-sheet"]').first.click(); pg.wait_for_timeout(250); return t
def visita(email): v = rows('visits', email); return v[0] if v else None

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome', 'Ana Valor'); pg.fill('#a-email', E); pg.fill('#a-senha', PW); pg.fill('#a-conf', PW); pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)

    pg.locator('[data-action="clear-demo"]').click(); pg.wait_for_timeout(300)      # quem comeca de verdade apaga os dados de exemplo
    print('A) paciente com valor, atendimento agendado nao guarda valor')
    novo_paciente(pg, 'Paciente Valor', '150,00'); pac = rows('patients', E)[0]
    novo_atendimento(pg, pac['id'], hoje, '08:00')
    v = visita(E); chk('atendimento agendado no banco, sem valor guardado', v is not None and v['status'] == 'agendado' and v['valor_snapshot'] is None, v and (v['status'], v['valor_snapshot']))

    print('B) marcar como realizado guarda o valor daquele momento')
    pg.locator('[data-action="tab"][data-tab="agenda"]').click(); pg.wait_for_timeout(200); abrir_atendimento(pg); mudar_status(pg, 'feito')
    v = visita(E); chk('status feito e valor_snapshot = 150', v['status'] == 'feito' and v['valor_snapshot'] == 150.0, (v['status'], v['valor_snapshot']))
    chk('relatorio: Realizado = R$ 150,00', 'R$ 150,00' in relatorio_realizado(pg), relatorio_realizado(pg))

    print('C) mudar o valor do paciente depois NAO muda o que ja foi realizado')
    mudar_valor_paciente(pg, 'Paciente Valor', '200,00')
    chk('valor do paciente agora e 200', rows('patients', E)[0]['valor'] == 200.0)
    v = visita(E); chk('valor guardado do atendimento continua 150', v['valor_snapshot'] == 150.0, v['valor_snapshot'])
    t = relatorio_realizado(pg); chk('relatorio continua R$ 150,00 (nao virou 200)', 'R$ 150,00' in t and '200' not in t, t)
    pg.reload(); pg.wait_for_selector('#gate', state='hidden', timeout=8000); pg.wait_for_timeout(400)
    t = relatorio_realizado(pg); chk('depois de recarregar, relatorio continua R$ 150,00', 'R$ 150,00' in t, t)

    print('D) voltar a agendado apaga o valor guardado; marcar de novo guarda o valor da epoca (200)')
    pg.locator('[data-action="tab"][data-tab="agenda"]').click(); pg.wait_for_timeout(200); abrir_atendimento(pg); mudar_status(pg, 'agendado')
    v = visita(E); chk('agendado: valor_snapshot nulo', v['status'] == 'agendado' and v['valor_snapshot'] is None, (v['status'], v['valor_snapshot']))
    abrir_atendimento(pg); mudar_status(pg, 'feito')
    v = visita(E); chk('feito de novo: valor_snapshot = 200', v['status'] == 'feito' and v['valor_snapshot'] == 200.0, (v['status'], v['valor_snapshot']))

    print('E) cancelar tambem nao deixa valor guardado')
    abrir_atendimento(pg); mudar_status(pg, 'agendado'); abrir_atendimento(pg); mudar_status(pg, 'cancelado')
    v = visita(E); chk('cancelado: valor_snapshot nulo', v['status'] == 'cancelado' and v['valor_snapshot'] is None, (v['status'], v['valor_snapshot']))

    print('F) paciente sem valor: realizado fica "sem valor" e nao muda se o valor for cadastrado depois')
    novo_paciente(pg, 'Paciente Sem Valor', ''); sv = [r for r in rows('patients', E) if r['nome'] == 'Paciente Sem Valor'][0]
    novo_atendimento(pg, sv['id'], ontem, '09:00')
    pg.locator('[data-action="tab"][data-tab="agenda"]').click(); pg.wait_for_timeout(200)
    # o atendimento de ontem esta na semana atual; abre pelo dia
    if pg.locator('[data-action="pick-day"][data-day="%s"]' % ontem.isoformat()).count(): pg.locator('[data-action="pick-day"][data-day="%s"]' % ontem.isoformat()).click(); pg.wait_for_timeout(200)
    abrir_atendimento(pg); mudar_status(pg, 'feito')
    vs = [r for r in rows('visits', E) if r['patient_id'] == sv['id']][0]; chk('feito sem valor: valor_snapshot nulo (nao 0)', vs['status'] == 'feito' and vs['valor_snapshot'] is None, (vs['status'], vs['valor_snapshot']))
    mudar_valor_paciente(pg, 'Paciente Sem Valor', '90,00')
    vs = [r for r in rows('visits', E) if r['patient_id'] == sv['id']][0]; chk('cadastrar o valor depois nao preenche o atendimento antigo', vs['valor_snapshot'] is None, vs['valor_snapshot'])

    chk('nenhum erro do banco', db_errors() == [], db_errors())
    print('\nresultado: %d ok, %d falhas | erros JS/console: %s' % (ok[0], ok[1], errs)); b.close()
