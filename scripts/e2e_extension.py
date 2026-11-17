"""Prueba de punta a punta de la extensión + página, sin internet.

Copia la extensión a /tmp, la apunta a un servidor local que imita Rappi y PedidosYa
(incluida la verificación anti-bot, que "resuelve" el script como lo haría una persona)
y la carga en Chrome. Requiere: pip install playwright y Google Chrome.

    python scripts/e2e_extension.py
"""
import http.server, threading, json, shutil, re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
WEB = os.path.join(ROOT, "web")
SRC = os.path.join(ROOT, "extension"); EXT = "/tmp/ext-test"
shutil.rmtree(EXT, ignore_errors=True); shutil.copytree(SRC, EXT)
shutil.rmtree("/tmp/prof-e2e3", ignore_errors=True)  # perfil limpio: sin caché de corridas anteriores
MOCK = "http://127.0.0.1:8768"
for f, subs in {
  "lib/rappi.js": [('"https://www.rappi.com.ar"', f'"{MOCK}/rappi"')],
  "lib/pedidosya.js": [('"https://www.pedidosya.com.ar"', f'"{MOCK}/pya"')],
  "lib/ubereats.js": [('"https://www.ubereats.com"', f'"{MOCK}/ue"')],
  "background.js": [('"https://www.pedidosya.com.ar/*"', f'"{MOCK}/pya/*"'),
                    ('u.hostname.endsWith("pedidosya.com.ar")', 'u.pathname.startsWith("/pya/")'),
                    ('const MENU_BLOCK_WAIT_MS = 60 * 1000;', 'const MENU_BLOCK_WAIT_MS = 4 * 1000;')],
}.items():
    p = os.path.join(EXT, f); s = open(p).read()
    for a, b in subs: assert a in s, (f, a); s = s.replace(a, b)
    open(p, "w").write(s)
m = json.load(open(f"{EXT}/manifest.json")); m["host_permissions"].append("http://127.0.0.1/*"); json.dump(m, open(f"{EXT}/manifest.json","w"))

nd = lambda pp: '<html><head><title>Rappi</title></head><body><script id="__NEXT_DATA__" type="application/json">%s</script></body></html>' % json.dumps({"props":{"pageProps":pp}})
CAT = nd({"location":{"city":"Rosario","url":"rosario"},"fallback":{"k":[
  {"id":1,"status":"OPEN","name":"Grido","etaString":"20 min","rating":4.4,"promotionText":"Envío Gratis: mín $14mil","deliveryCost":0,"hasFreeShipping":True,"categories":[257]},
  {"id":2,"status":"OPEN","name":"Monk's","etaString":"12 min","rating":4.5,"promotionText":"Hasta 33% Off","deliveryCost":500,"categories":[257]},
  {"id":3,"status":"CLOSED","name":"Freddo","etaString":"","rating":4.7,"promotionText":"Hasta 30% Off","deliveryCost":0,"categories":[257]}]}})
STORE = {1: nd({"fallback":{"r":{"id":1,"name":"Grido","status":"OPEN","address":"Oroño 1181","corridors":[{"products":[
            {"id":11,"name":"1 Kg de helado","price":12900,"realPrice":21500},{"id":12,"name":"1/4 kg","price":5000,"realPrice":5000},
            {"id":13,"name":"Agua mineral 500","price":500,"realPrice":1000}]}]}}}),
         2: nd({"fallback":{"r":{"id":2,"name":"Monk's","status":"OPEN","address":"Tucumán 1996","corridors":[{"products":[
            {"id":21,"name":"Kilo","price":20000,"realPrice":25000},{"id":22,"name":"Medio","price":10800,"realPrice":13500}]}]}}})}
CHALLENGE = "<html><head><title>Just a moment...</title></head><body>Nuestros sistemas han detectado tráfico inusual</body></html>"
# Como la web real: la lista de Helados hace POST /v4/shoplist/vendors (formato real, ver tests/fixtures)
PYA_LIST = """<html><head><title>PedidosYa! Resultados</title></head><body><div style="height:5000px">lista</div>
<script>const x = new XMLHttpRequest(); x.open('POST', '/pya/v4/shoplist/vendors?size=30&page=1'); x.setRequestHeader('Content-Type','application/json'); x.send('{}');</script></body></html>"""
PYA_ADDRESS = """<html><head><title>PedidosYa</title></head><body><h1>Ingresá tu dirección</h1><input placeholder="Calle y número"><div style="height:3000px"></div></body></html>"""
# Caso real (diagnóstico 2026-11-16): con la dirección ya cargada, la portada muestra "Enviar a <dirección>"
# y pide /home-page/.../lazy_load?lat=..&lng=.. — la URL de la página no trae la ubicación.
PYA_HOME_WITH_ADDRESS = """<html><head><title>PedidosYa</title></head><body><div>Enviar a</div><div>1 de Mayo 910</div><div>Restaurantes</div>
<script>fetch('/pya/home-page/v44/home/lazy_load?country_id=3&area_id=0&lat=-32.949493&lng=-60.630245&broker_version=v1').then(r=>r.json());</script></body></html>"""
PYA_RESULTS_NO_CAT = """<html><head><title>PedidosYa! Resultados</title></head><body>Todos los restaurantes</body></html>"""
_v = json.load(open(os.path.join(ROOT, "tests", "fixtures", "pedidosya_vendors_real.json")))
for vend, pct in ((_v["vendors"][0], 20), (_v["vendors"][1], 25)):   # Esther 20%, Tento 25% (formato real SUBSIDIZED_PRODUCT)
    vend["discounts"].append({"type": "SUBSIDIZED_PRODUCT", "amount": pct, "calculationType": "PERCENTAGE"})
VENDORS = json.dumps(_v)
# Menú: la página pide /v2/niles/partners/{id}/menus. Tento carga bien; Esther está bloqueado (PerimeterX real).
MENU_PAGE = """<html><head><title>Menú</title></head><body><div id="m">Cargando menú…</div>
<script>fetch('/pya/v2/niles/partners/%s/menus?occasion=DELIVERY').then(r=>r.json()).then(()=>{});</script></body></html>"""
MENU_OK = json.dumps({"sections":[{"name":"Helados","products":[
  {"id":1,"name":"1 Kg de helado","price":{"finalPrice":17000,"originalPrice":20000}},
  {"id":2,"name":"1/4 Kg","price":6000},
  {"id":3,"name":"Agua mineral 500","price":{"finalPrice":500,"originalPrice":1000}}]}]})
# Uber Eats: búsqueda y locales con el formato real (tests/fixtures/ubereats_*). La búsqueda trae un
# supermercado (Dar) que no debe aparecer; el resto de los locales vienen sin descuentos.
_fx = lambda f: json.load(open(os.path.join(ROOT, "tests", "fixtures", f)))
UE_FEED = json.dumps(_fx("ubereats_feed_real.json"))
UE_STORES = {d["data"]["uuid"]: json.dumps(d) for d in (_fx("ubereats_store_grido_real.json"), _fx("ubereats_store_dar_real.json"))}
UE_EMPTY = lambda uuid: json.dumps({"status": "success", "data": {"title": "Heladería sin descuentos", "uuid": uuid,
    "citySlug": "rosario", "cuisineList": ["Ice Cream"], "isOpen": True, "catalogSectionsMap": {}}})
UE_PAGE = "<html><head><title>Uber Eats</title></head><body>Uber Eats</body></html>"
PX_BLOCK = json.dumps({"appId":"PXeT15wiaE","jsClientSrc":"/eT15wiaE/init.js","blockScript":"/eT15wiaE/captcha/captcha.js?a=c"})
state = {"challenge": True, "address": False, "calls": []}
class Mock(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def out(self, code, ctype, body):
        self.send_response(code); self.send_header("Content-Type", ctype); self.end_headers(); self.wfile.write(body.encode())
    def do_GET(self):
        u = self.path; state["calls"].append(u)
        if u.endswith("/restaurantes/category/helados") and u.startswith("/rappi/"): return self.out(200,"text/html",CAT)  # cualquier ciudad → Rosario, como Rappi
        if u.startswith("/rappi/restaurantes/"): return self.out(200,"text/html",STORE[int(u.rsplit("/",1)[1])])
        if u.startswith("/ue/ar/feed"): return self.out(200,"text/html",UE_PAGE)
        if u.startswith("/pya/"):
            if state["challenge"]: return self.out(403,"text/html",CHALLENGE)
            if u.startswith("/pya/home-page/"): return self.out(200,"application/json",'{"children":[]}')
            if u.startswith("/pya/v2/niles/partners/"):
                pid = u.split("/partners/")[1].split("/")[0]
                return self.out(200,"application/json",MENU_OK) if pid == "393747" else self.out(403,"application/json",PX_BLOCK)
            if u.startswith("/pya/restaurantes/rosario/tento"): return self.out(200,"text/html",MENU_PAGE % "393747")
            if u.startswith("/pya/restaurantes/rosario/esther"): return self.out(200,"text/html",MENU_PAGE % "59418")
            if u.startswith("/pya/restaurantes?") and "lat=" in u:
                return self.out(200,"text/html",PYA_LIST if "category=25" in u else PYA_RESULTS_NO_CAT)
            return self.out(200,"text/html",PYA_HOME_WITH_ADDRESS if state["address"] else PYA_ADDRESS)
        self.out(404,"text/plain","no")
    def do_POST(self):
        u = self.path; state["calls"].append("POST " + u)
        if u.startswith("/pya/v4/shoplist/vendors"): return self.out(200,"application/json",VENDORS)
        if u.startswith("/ue/_p/api/"):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            if self.headers.get("x-csrf-token") != "x": return self.out(403,"application/json","{}")
            if u.startswith("/ue/_p/api/getSearchFeedV1"): return self.out(200,"application/json",UE_FEED)
            if u.startswith("/ue/_p/api/getStoreV1"):
                uuid = body.get("storeUuid"); return self.out(200,"application/json",UE_STORES.get(uuid) or UE_EMPTY(uuid))
        self.out(404,"text/plain","no")
class Web(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a, directory=WEB, **k)
    def log_message(self,*a): pass
for port, h in ((8768, Mock), (8769, Web)):
    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), h); threading.Thread(target=s.serve_forever, daemon=True).start()

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context("/tmp/prof-e2e3", channel="chrome", headless=True,
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
              "--disable-features=DisableLoadExtensionCommandLineSwitch"])
    page = ctx.new_page()
    page.goto("http://127.0.0.1:8769/index.html"); page.wait_for_timeout(2000)
    page.click("#fetch")
    solved = address_done = False
    for i in range(90):
        page.wait_for_timeout(2000)
        prog = page.inner_text("#progress") if not page.is_hidden("#progress") else ""
        tabs = [pg for pg in ctx.pages if "/pya/" in pg.url]
        if "verificación" in prog and not solved:
            print("PROGRESO:", prog.replace("\n"," | "))
            state["challenge"] = False; tabs[0].reload(); solved = True   # "la persona resuelve"
        if "dirección" in prog and not address_done:
            print("PROGRESO:", prog.replace("\n"," | "))
            # "la persona carga la dirección" y queda en la portada (como en el caso real)
            state["address"] = True; tabs[0].reload(); address_done = True
        if page.inner_text("#fetch") == "Traer descuentos" and i > 0: break
    print("STATUS:", page.inner_text("#status").replace("\n"," | "))
    print("LIST:\n" + page.inner_text("#list")[:1200])
    print("tabs al final:", [pg.url for pg in ctx.pages])
    print("pedidos:", state["calls"])
    page.click("details summary") if page.query_selector("details summary") else None
    page.screenshot(path="/tmp/e2e.png", full_page=True)
    # segundo click: debe usar caché (no nuevos pedidos)
    n = len(state["calls"]); page.click("#fetch"); page.wait_for_timeout(3000)
    cache_new = len(state["calls"]) - n
    print("pedidos nuevos con caché:", cache_new)
    page.wait_for_function("() => { const t = document.getElementById('status').innerText; return t.includes('Rappi:') && t.includes('PedidosYa:') && t.includes('Uber Eats:'); }", timeout=15000)
    status = page.inner_text("#status")
    assert not page.query_selector("#status .error"), status
    assert solved, "no apareció el aviso de verificación"
    # Uber Eats: Grido con sus descuentos reales; el supermercado no aparece
    ue = page.inner_text("#list")
    assert "Grido Helados - 3912" in ue and "Supermercado Dar" not in ue, ue[:600]
    grido_ue = ue.split("Grido Helados - 3912")[1][:300]
    assert "−31%" in grido_ue and "24.840" in grido_ue and "Uber Eats" in grido_ue, grido_ue
    assert "Uber Eats: 1 heladería con descuento" in status, status
    assert not [pg for pg in ctx.pages if "/ue/" in pg.url], "quedó abierta la ventana de Uber Eats"
    assert address_done, "no apareció el pedido de dirección"
    # ciudad que Rappi no tiene: el mock devuelve Rosario → tiene que avisar
    page.select_option("#city", "cordoba"); page.wait_for_timeout(500)
    assert "córdoba" in page.inner_text("#city-name").lower()
    assert "Grido" not in page.inner_text("#list"), "mezcló resultados de otra ciudad"
    page.evaluate("window.postMessage({app:'helados', type:'FETCH', force:true, city:{slug:'cordoba',name:'Córdoba'}, platforms:['rappi','ubereats']}, location.origin)")
    for i in range(60):
        page.wait_for_timeout(1000)
        if "Rappi no tiene" in page.inner_text("#status") and "Uber Eats no está en Córdoba" in page.inner_text("#status"): break
    print("CÓRDOBA:", page.inner_text("#status"))
    assert "Rappi no tiene Córdoba" in page.inner_text("#status")
    assert "Uber Eats no está en Córdoba" in page.inner_text("#status"), page.inner_text("#status")
    assert not page.query_selector("#status .error") or "Uber" not in page.inner_text("#status .error")
    page.select_option("#city", "rosario"); page.wait_for_timeout(800)
    lista = page.inner_text("#list")
    assert "Grido" in lista, "al volver a Rosario no mostró lo guardado"
    assert "Agua mineral" not in lista and "50% off" not in lista.split("Grido")[1][:40], "contó el descuento del agua"
    # paso previo de PedidosYa: "cambiar dirección" muestra el aviso y abre una pestaña normal
    page.click("#show-pya-setup")
    assert page.is_visible("#pya-setup")
    n_tabs = len(ctx.pages); page.click("#open-pya"); page.wait_for_timeout(1500)
    assert len(ctx.pages) == n_tabs + 1 and "/pya/" in ctx.pages[-1].url, "no abrió PedidosYa para la dirección"
    ctx.pages[-1].close(); page.bring_to_front()
    assert page.is_hidden("#pya-setup")
    # con la dirección guardada, una nueva búsqueda va directo a Helados sin pedir nada
    page.reload(); page.wait_for_timeout(2000)
    assert "1 de Mayo 910" in page.inner_text("#show-pya-setup"), page.inner_text("#show-pya-setup")
    n = len(state["calls"])
    page.click("#force")
    for i in range(40):
        page.wait_for_timeout(1500)
        assert "necesita tu dirección" not in (page.inner_text("#progress") if not page.is_hidden("#progress") else ""), "volvió a pedir la dirección"
        if page.inner_text("#fetch") == "Traer descuentos" and i > 0: break
    directo = [c for c in state["calls"][n:] if c.startswith("/pya/")]
    print("SEGUNDA BÚSQUEDA PYA:", directo[:2])
    assert directo and "category=25" in directo[0] and "lat=-32.949493" in directo[0]
    assert "Esther Helados Centro" in page.inner_text("#list")
    st = page.inner_text("#status")
    print("MENÚS:", [l for l in st.split("\n") if "PedidosYa" in l])
    assert "no dejó ver el detalle de algunas (1 con detalle)" in st, st
    lista = page.inner_text("#list")
    assert "Esther Helados Centro" in page.inner_text(".vague") and "No pudimos ver qué productos" in page.inner_text(".vague"), "Esther debería ir entre las que no tienen detalle"
    tento = page.inner_text("#list").split("Tento Helados")[1][:200]
    assert "−15%" in tento and "17.000" in tento and "20.000" in tento, tento  # 1 kg queda a 17000 (antes 20000)
    assert "Agua" not in tento and "/kg" not in page.inner_text("#list")
    # la búsqueda no debe dejar ventanas de PedidosYa abiertas ni haberlas mostrado (no hubo nada que resolver)
    assert not [pg for pg in ctx.pages if "/pya/" in pg.url]
    # cancelar una búsqueda trabada en la verificación
    state["challenge"] = True
    page.click("#force"); page.wait_for_timeout(5000)
    assert page.is_visible("#cancel")
    page.click("#cancel")
    for i in range(15):
        page.wait_for_timeout(1000)
        if page.inner_text("#fetch") == "Traer descuentos": break
    print("CANCELADA:", page.inner_text("#status").replace("\n"," | "))
    assert "Cancelada" in page.inner_text("#status") and page.is_hidden("#cancel")
    assert not [pg for pg in ctx.pages if "/pya/" in pg.url], "quedó abierta la pestaña de PedidosYa"
    assert cache_new == 0, "el segundo click no usó la caché"
    # prototipos de diseño: misma app.js, mismos ids → detectan la extensión, buscan y muestran resultados
    PROPIO = {"vitrina": "#indice", "cucurucho": "#bochas", "numero": "#ticket", "mostrador": "#ticket"}  # lo que dibuja cada prototipo nuevo
    for proto in ("cotizacion", "derretido", "oferton", "nocciola", "vitrina", "cucurucho", "numero", "mostrador"):
        pp = ctx.new_page(); errs = []
        pp.on("pageerror", lambda e: errs.append(str(e)))
        pp.goto(f"http://127.0.0.1:8769/prototipos/{proto}/"); pp.wait_for_timeout(2000)
        assert "activa" in pp.inner_text("#ext-text").lower(), (proto, pp.inner_text("#ext-text"))
        pp.click("#fetch")
        pp.wait_for_function("() => document.getElementById('fetch').textContent === 'Traer descuentos'", timeout=60000)
        pp.wait_for_function("() => { const t = document.getElementById('status').innerText; return t.includes('Rappi:') && t.includes('PedidosYa:') && t.includes('Uber Eats:'); }", timeout=15000)
        assert "grido helados - 3912" in pp.inner_text("#list").lower() and "−31%" in pp.inner_text("#list"), proto
        if proto in PROPIO:
            pp.wait_for_function(f"() => document.querySelector('{PROPIO[proto]}').innerText.toLowerCase().includes('grido') || document.querySelector('{PROPIO[proto]}').innerHTML.toLowerCase().includes('grido')", timeout=5000)
        assert not errs, (proto, errs)
        print("PROTOTIPO OK:", proto); pp.close()
    print("E2E OK")
    ctx.close()
