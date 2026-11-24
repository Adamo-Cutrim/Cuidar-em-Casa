"""Testes de navegador do backup JSON (baixar e restaurar) contra o Supabase simulado (harness.py).
Rode com ./rodar_testes.sh. Cria as contas backup.lia@teste.com e backup.davi@teste.com (independe de t1/t2)."""
import json, os, re, tempfile, urllib.request
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/'; M = 'http://127.0.0.1:8766'
UUIDANY = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
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
def create_account(pg, nome, email, pw):
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.locator('[data-action="auth-create"]').click(); pg.wait_for_selector('#f-criar')
    pg.fill('#a-nome', nome); pg.fill('#a-email', email); pg.fill('#a-senha', pw); pg.fill('#a-conf', pw)
    pg.locator('#f-criar button[type=submit]').click(); pg.wait_for_selector('#gate', state='hidden', timeout=8000)
def open_perfil(pg):
    pg.locator('[data-action="open-menu"]').click(); pg.wait_for_timeout(250); pg.locator('[data-go="perfil"]').click(); pg.wait_for_selector('#imp-file', state='attached')
def pick(pg, path):
    pg.set_input_files('#imp-file', path); pg.wait_for_timeout(400)
def toast(pg): return pg.locator('#toast').inner_text()
def sheet(pg): return pg.locator('.sheet').inner_text() if pg.locator('.sheet').count() else ''

TMP = tempfile.mkdtemp(prefix='bkp_')
def wfile(name, content, mode='w'):
    p = os.path.join(TMP, name); open(p, mode, **({} if 'b' in mode else {'encoding': 'utf-8'})).write(content); return p
U = lambda n: 'aaaaaaaa-0000-4000-8000-%012d' % n
BACKUP = {'app': 'cuidar-em-casa', 'versao': 1, 'exportadoEm': '2026-11-20T10:00:00.000Z', 'tipos': ['Curativo', 'Troca de sonda'],
  'empresas': [
    {'id': U(1), 'nome': 'Clinica A', 'tipo': 'Clinica', 'valorPadrao': 120, 'cor': 1},
    {'id': U(2), 'nome': 'Home Care B', 'tipo': 'Home care', 'valorPadrao': None, 'cor': 2},
    {'id': 'ex1', 'nome': 'Empresa Exemplo', 'ex': True}],
  'pacientes': [
    {'id': U(11), 'nome': 'Maria Lima', 'empresaId': U(1), 'valor': 150, 'bairro': 'Centro'},
    {'id': 'p-curto', 'nome': 'Joao Souza', 'empresaId': U(2), 'valor': 200, 'rec': {'ativo': True, 'dias': [1, 3], 'hora': '09:00', 'tipo': 'Curativo', 'inicio': '2026-11-01', 'fim': ''}, 'recExc': ['2026-11-11']},
    {'id': U(13), 'nome': 'Ana Paula', 'empresaId': 'empresa-que-nao-esta-no-arquivo', 'valor': 100},
    {'id': 'ex2', 'nome': 'Paciente Exemplo', 'ex': True}],
  'atendimentos': [
    {'id': U(21), 'pacienteId': U(11), 'date': '2026-11-10', 'hora': '08:30', 'tipo': 'Curativo', 'status': 'feito'},
    {'id': U(22), 'pacienteId': 'p-curto', 'date': '2026-11-12', 'hora': '09:00', 'tipo': 'Troca de sonda', 'status': 'agendado'},
    {'id': U(23), 'pacienteId': 'paciente-que-nao-esta-no-arquivo', 'date': '2026-11-13', 'hora': '10:00', 'tipo': 'Curativo', 'status': 'agendado'},
    {'id': 'ex3', 'pacienteId': 'ex2', 'date': '2026-11-14', 'hora': '10:00', 'tipo': 'Curativo', 'status': 'agendado', 'ex': True}]}
F_BKP = wfile('backup.json', json.dumps(BACKUP))
E_BIA = 'backup.lia@teste.com'; E_CAIO = 'backup.davi@teste.com'; PW = 'senha-segura-1'

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    def newpage(c):
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None); return pg
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, accept_downloads=True); pg = newpage(ctx)

    print('A) conta nova, so com dados de exemplo'); create_account(pg, 'Lia', E_BIA, PW); open_perfil(pg)
    chk('Perfil tem baixar e restaurar', pg.locator('[data-action="backup"]').count() == 1 and pg.locator('[data-action="import-pick"]').count() == 1)
    pg.locator('[data-action="backup"]').click(); pg.wait_for_timeout(300)
    chk('baixar sem dados proprios avisa e nao baixa', 'Ainda não há dados seus' in toast(pg), toast(pg))

    print('B) arquivos que nao servem')
    pick(pg, wfile('texto.json', 'isto nao e json')); chk('texto solto', 'Não foi possível ler' in toast(pg), toast(pg))
    pick(pg, wfile('outro.json', json.dumps({'app': 'outro-app', 'versao': 1}))); chk('backup de outro app', 'não é um backup' in toast(pg), toast(pg))
    pick(pg, wfile('futuro.json', json.dumps({'app': 'cuidar-em-casa', 'versao': 9}))); chk('versao desconhecida', 'versão que o app não conhece' in toast(pg), toast(pg))
    pick(pg, wfile('lista.json', '[1,2,3]')); chk('json que nao e objeto', 'não é um backup' in toast(pg), toast(pg))
    pick(pg, wfile('grande.json', b'0' * (6 * 1024 * 1024), 'wb')); chk('arquivo grande demais', 'grande demais' in toast(pg), toast(pg))
    chk('nada foi gravado e nenhum erro', rows('patients', E_BIA) == [] and db_errors() == [])

    print('C) restaurar o backup (com orfaos e exemplos)'); pick(pg, F_BKP); s = sheet(pg)
    chk('resumo: 2 empresas, 3 pacientes, 2 atendimentos', all(x in s for x in ('2 empresas', '3 pacientes', '2 atendimentos')), s.replace('\n', ' | '))
    chk('resumo: paciente com empresa ausente vira particular', '1 paciente estava ligado a uma empresa que não está no arquivo' in s)
    chk('resumo: atendimento sem paciente descartado', '1 atendimento será descartado' in s)
    chk('resumo: avisa que exemplos serao apagados', 'dados de exemplo serão apagados' in s)
    chk('resumo: data do backup', 'Backup de 20/11/2026' in s)
    pg.locator('[data-action="import-confirm"]').click(); chk('rodape: salvo na conta', saved(pg), pg.locator('#foot').inner_text())
    co, pa, vi = rows('companies', E_BIA), rows('patients', E_BIA), rows('visits', E_BIA)
    chk('empresas no banco', sorted(r['nome'] for r in co) == ['Clinica A', 'Home Care B'], [r['nome'] for r in co])
    chk('pacientes no banco', sorted(r['nome'] for r in pa) == ['Ana Paula', 'Joao Souza', 'Maria Lima'], [r['nome'] for r in pa])
    chk('atendimentos no banco (orfao fora)', len(vi) == 2, len(vi))
    chk('exemplos nao foram para o banco', not any('Exemplo' in r['nome'] for r in co + pa))
    chk('total de valores confere (450)', sum(r['valor'] for r in pa) == 450, sum(r['valor'] for r in pa))
    ana = [r for r in pa if r['nome'] == 'Ana Paula'][0]; joao = [r for r in pa if r['nome'] == 'Joao Souza'][0]
    chk('empresa ausente virou particular', ana['company_id'] is None)
    chk('paciente com id curto ganhou uuid', UUIDANY.match(joao['id']) and joao['id'] != 'p-curto', joao['id'])
    chk('atendimento aponta para o paciente remapeado', [r for r in vi if r['tipo'] == 'Troca de sonda'][0]['patient_id'] == joao['id'])
    chk('paciente aponta para a empresa remapeada', joao['company_id'] in [r['id'] for r in co] and joao['company_id'] is not None)
    chk('ids novos nao sao os do arquivo (conta propria)', not ({U(1), U(2), U(11), U(13), U(21), U(22)} & {r['id'] for r in co + pa + vi}))
    chk('recorrencia e excecao vieram', len(rows('recurrences', E_BIA)) == 1 and len(rows('recurrence_exceptions', E_BIA)) == 1)
    chk('tipo novo em service_types', 'Troca de sonda' in [r['nome'] for r in rows('service_types', E_BIA)], [r['nome'] for r in rows('service_types', E_BIA)])
    pg.locator('[data-action="tab"][data-tab="empresas"]').click(); pg.wait_for_timeout(250); vt = pg.locator('#view').inner_text()
    chk('tela: empresas restauradas, sem exemplos', 'Clinica A' in vt and 'Home Care B' in vt and 'Vida Plena' not in vt and 'dados de exemplo' not in vt, vt.replace(chr(10), ' | ')[:120])
    chk('nenhum erro do banco', db_errors() == [], db_errors())

    print('D) restaurar o mesmo arquivo de novo (nao duplica)'); mock('/__mock/clearlog'); open_perfil(pg); pick(pg, F_BKP); s = sheet(pg)
    chk('diz que nao ha nada novo', 'Nada novo neste arquivo' in s, s.replace('\n', ' | ')); pg.locator('.sheet [data-action="close-sheet"]').first.click(); pg.wait_for_timeout(300)
    chk('contagens iguais e nenhuma gravacao', (len(rows('companies', E_BIA)), len(rows('patients', E_BIA)), len(rows('visits', E_BIA))) == (2, 3, 2) and not [x for x in mock('/__mock/log') if x[0] in ('POST', 'DELETE', 'PATCH')])

    print('E) depois de recarregar (ids vindos do banco) tambem nao duplica'); pg.reload(); pg.wait_for_selector('#gate', state='hidden', timeout=8000); pg.wait_for_timeout(400)
    open_perfil(pg); pick(pg, F_BKP); s = sheet(pg)
    chk('continua dizendo que nao ha nada novo', 'Nada novo neste arquivo' in s, s.replace('\n', ' | ')); pg.locator('.sheet [data-action="close-sheet"]').first.click(); pg.wait_for_timeout(300)

    print('F) baixar o backup'); open_perfil(pg)
    with pg.expect_download() as dl: pg.locator('[data-action="backup"]').click()
    d = dl.value; path = os.path.join(TMP, 'baixado.json'); d.save_as(path); exp = json.load(open(path, encoding='utf-8'))
    chk('nome do arquivo', re.match(r'^cuidar-em-casa_backup_\d{4}-\d{2}-\d{2}\.json$', d.suggested_filename), d.suggested_filename)
    chk('formato e contagens', exp['app'] == 'cuidar-em-casa' and exp['versao'] == 1 and (len(exp['empresas']), len(exp['pacientes']), len(exp['atendimentos'])) == (2, 3, 2), (len(exp['empresas']), len(exp['pacientes']), len(exp['atendimentos'])))
    chk('sem dados de exemplo', not any(x.get('ex') for x in exp['empresas'] + exp['pacientes'] + exp['atendimentos']))
    chk('exportado tem os ids do banco', {x['id'] for x in exp['pacientes']} == {r['id'] for r in rows('patients', E_BIA)})
    bia_ids = {t: {r['id'] for r in rows(t, E_BIA)} for t in ('companies', 'patients', 'visits')}

    print('G) levar o backup para OUTRA conta'); ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True); p2 = newpage(ctx2)
    create_account(p2, 'Davi', E_CAIO, PW); open_perfil(p2); pick(p2, path); s = sheet(p2)
    chk('resumo igual', all(x in s for x in ('2 empresas', '3 pacientes', '2 atendimentos')), s.replace('\n', ' | '))
    p2.locator('[data-action="import-confirm"]').click(); chk('salvou na conta do Davi', saved(p2), p2.locator('#foot').inner_text())
    c_co, c_pa, c_vi = rows('companies', E_CAIO), rows('patients', E_CAIO), rows('visits', E_CAIO)
    chk('contagens e total iguais', (len(c_co), len(c_pa), len(c_vi)) == (2, 3, 2) and sum(r['valor'] for r in c_pa) == 450, (len(c_co), len(c_pa), len(c_vi)))
    chk('ids diferentes dos da Lia (sem colisao)', not (bia_ids['companies'] & {r['id'] for r in c_co}) and not (bia_ids['patients'] & {r['id'] for r in c_pa}) and not (bia_ids['visits'] & {r['id'] for r in c_vi}))
    chk('dados da Lia intactos', {t: {r['id'] for r in rows(t, E_BIA)} for t in ('companies', 'patients', 'visits')} == bia_ids)
    chk('particular continua particular, empresa continua ligada', [r for r in c_pa if r['nome'] == 'Ana Paula'][0]['company_id'] is None and [r for r in c_pa if r['nome'] == 'Joao Souza'][0]['company_id'] in [r['id'] for r in c_co])
    chk('recorrencia veio', len(rows('recurrences', E_CAIO)) == 1)
    chk('mesmo arquivo de novo na conta do Davi nao duplica', (p2.reload(), p2.wait_for_selector('#gate', state='hidden', timeout=8000), open_perfil(p2), pick(p2, path), 'Nada novo neste arquivo' in sheet(p2))[-1])
    chk('nenhum erro do banco no fim', db_errors() == [], db_errors())

    print('H) backup adulterado (E7): data de serie que nao existe nao trava mais a conta')
    E_E7 = 'backup.e7@teste.com'; mock('/__mock/clearlog')
    ruim = {'app': 'cuidar-em-casa', 'versao': 1, 'exportadoEm': '2026-11-20T10:00:00.000Z', 'empresas': [],
            'pacientes': [{'id': U(41), 'nome': 'Paciente E7', 'valor': 150, 'ex': 'sim', 'rec': 'x'}],
            'atendimentos': [{'id': U(42), 'pacienteId': U(41), 'date': '2026-11-10', 'hora': '08:00', 'status': 'agendado', 'serie': U(41), 'serieData': '2026-02-30', 'virtual': True}]}
    c3 = b.new_context(viewport={'width': 390, 'height': 844}); p3 = newpage(c3)
    create_account(p3, 'E7', E_E7, PW); open_perfil(p3); pick(p3, wfile('adulterado.json', json.dumps(ruim)))
    tem = p3.locator('[data-action="import-confirm"]').count() > 0
    chk('resumo oferece restaurar (paciente com ex:"sim" nao e descartado como exemplo)', tem, sheet(p3).replace('\n', ' | ')[:120])
    if not tem: p3.locator('.sheet [data-action="close-sheet"]').first.click(); p3.wait_for_timeout(300)
    else: p3.locator('[data-action="import-confirm"]').click()
    chk('salvou (sem "servidor recusou")', saved(p3), p3.locator('#foot').inner_text())
    chk('paciente e atendimento no banco', len(rows('patients', E_E7)) == 1 and len(rows('visits', E_E7)) == 1, (len(rows('patients', E_E7)), len(rows('visits', E_E7))))
    vs = rows('visits', E_E7); chk('atendimento gravado sem a data de serie invalida', len(vs) == 1 and vs[0]['serie_data'] is None, vs)
    chk('nenhum erro do banco', db_errors() == [], db_errors())
    p3.locator('[data-action="tab"][data-tab="empresas"]').click(); p3.wait_for_timeout(250); p3.locator('#fab').click(); p3.wait_for_selector('#f-company')
    p3.fill('#f-company [name=nome]', 'Empresa E7'); p3.locator('#f-company button[type=submit]').click(); saved(p3)
    p3.locator('[data-action="open-company"]').first.click(); p3.wait_for_selector('.sheet [data-action="ask"]')
    p3.locator('.sheet [data-action="ask"]').click(); p3.locator('.sheet .confirm:not([hidden]) .btn.danger').click(); saved(p3)
    chk('exclusao chega ao banco', not any(r['nome'] == 'Empresa E7' for r in rows('companies', E_E7)))
    p3.reload(); p3.wait_for_selector('#gate', state='hidden', timeout=8000); p3.wait_for_timeout(400)
    p3.locator('[data-action="tab"][data-tab="empresas"]').click(); p3.wait_for_timeout(250)
    chk('empresa excluida nao volta ao recarregar', 'Empresa E7' not in p3.locator('#view').inner_text())
    chk('paciente do arquivo nao virou "exemplo" (ex:"sim" ignorado)', any(r['nome'] == 'Paciente E7' for r in rows('patients', E_E7)))

    print('\nresultado: %d ok, %d falhas | erros JS/console: %s' % (ok[0], ok[1], errs)); b.close()
