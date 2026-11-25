"""Teste de navegador: o uso sem internet (v20a/v20b) foi desfeito em 25/11/2026. Um aparelho que ainda tem o service worker
antigo, o cache dos arquivos e a copia cifrada do PIN tem de ficar LIMPO ao abrir a versao nova com internet.
Rode com ./rodar_testes.sh."""
import os, shutil
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/'
AQUI = os.path.dirname(os.path.abspath(__file__)); SW = os.path.join(os.environ['SITE_DIR'], 'sw.js'); VJ = os.path.join(os.environ['SITE_DIR'], 'vercel.json')
ok = [0, 0]
def chk(name, cond, extra=''):
    ok[0 if cond else 1] += 1; print(('  OK   ' if cond else '  FALHA ') + name + (' ' + str(extra) if extra != '' else ''))
REGS = "navigator.serviceWorker.getRegistrations().then(r=>r.length)"
CACHES = "caches.keys().then(k=>k)"
BANCOS = "indexedDB.databases().then(d=>d.map(x=>x.name))"
CRIA_BANCO = """() => new Promise(res => { const r = indexedDB.open('cuidar-em-casa', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('aparelho');
  r.onsuccess = () => { const t = r.result.transaction('aparelho', 'readwrite'); t.objectStore('aparelho').put({pacote: 'cifrado'}, 'copia'); t.oncomplete = () => { r.result.close(); res(1); }; }; })"""
def espera(pg, js, alvo, n=40):
    for _ in range(n):
        v = pg.evaluate(js)
        if v == alvo: return v
        pg.wait_for_timeout(250)
    return pg.evaluate(js)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None); errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='allow'); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    novo = open(SW, encoding='utf-8').read(); vj_novo = open(VJ, encoding='utf-8').read()

    print('A) Aparelho como ficou com a versao antiga: service worker ativo, arquivos em cache e copia do PIN')
    import re
    antigo = open(os.path.join(AQUI, 'sw_antigo_v20b.js'), encoding='utf-8').read()
    antigo = re.sub(r"const ARQUIVOS=\[[^\]]*\];", "const ARQUIVOS=['/','/app.js','/styles.css','/icon.svg'];", antigo)   # o mesmo SW antigo, com arquivos que existem hoje
    open(SW, 'w', encoding='utf-8').write(antigo); shutil.copy(os.path.join(AQUI, 'vercel_antigo_v20b.json'), VJ)   # o host como estava
    try:
        pg.goto(URL + 'icon.svg')   # pagina que nao roda o app (o app novo ja limparia tudo)
        pg.evaluate("navigator.serviceWorker.register('/sw.js').then(()=>Promise.race([navigator.serviceWorker.ready.then(()=>1), new Promise(r=>setTimeout(()=>r(0),8000))]))")
        pg.evaluate(CRIA_BANCO)
        pg.reload(); pg.wait_for_timeout(800)
        chk('montado: a pagina estava sob o service worker antigo', pg.evaluate('!!navigator.serviceWorker.controller'))
        chk('montado: havia cache do app', len(pg.evaluate(CACHES)) >= 1, pg.evaluate(CACHES))
    finally:
        open(SW, 'w', encoding='utf-8').write(novo); open(VJ, 'w', encoding='utf-8').write(vj_novo)   # o host passa a servir a versao nova

    print('B) Abre a versao nova com internet: tudo e apagado')
    pg.goto(URL); pg.wait_for_selector('#gate h1'); pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_selector('#gate h1')
    chk('o service worker foi desinstalado', espera(pg, REGS, 0) == 0)
    chk('o cache do app foi apagado', espera(pg, CACHES, []) == [], pg.evaluate(CACHES))
    chk('a copia cifrada do PIN (IndexedDB) foi apagada', 'cuidar-em-casa' not in espera(pg, BANCOS, []), pg.evaluate(BANCOS))
    chk('o app continua abrindo normalmente com internet', pg.locator('#gate h1').count() == 1)

    print('C) Sem internet o app nao abre mais (o uso offline saiu de verdade)')
    pg.reload(); pg.wait_for_selector('#gate h1')
    ctx.set_offline(True)
    try: pg.reload(timeout=8000); abriu = pg.locator('#gate h1').count() == 1
    except Exception: abriu = False
    chk('sem internet, nenhuma copia do app responde', not abriu)
    ctx.set_offline(False)

    print('D) Uma pessoa que nunca teve a versao antiga nao ganha service worker nenhum')
    c2 = b.new_context(service_workers='allow'); p2 = c2.new_page(); p2.goto(URL); p2.wait_for_selector('#gate h1'); p2.wait_for_timeout(1500)
    chk('nenhum service worker registrado', p2.evaluate(REGS) == 0); c2.close()

    chk('sem erros na pagina', errs == [], errs)
    b.close()
print('Resultado: %d OK, %d falhas' % (ok[0], ok[1]))
