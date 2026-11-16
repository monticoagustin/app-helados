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
MOCK = "http://127.0.0.1:8768"
for f, subs in {
  "lib/rappi.js": [('"https://www.rappi.com.ar"', f'"{MOCK}/rappi"')],
  "lib/pedidosya.js": [('"https://www.pedidosya.com.ar"', f'"{MOCK}/pya"')],
  "background.js": [('"https://www.pedidosya.com.ar/*"', f'"{MOCK}/pya/*"')],
}.items():
    p = os.path.join(EXT, f); s = open(p).read()
    for a, b in subs: assert a in s, (f, a); s = s.replace(a, b)
    open(p, "w").write(s)
m = json.load(open(f"{EXT}/manifest.json")); m["host_permissions"].append("http://127.0.0.1/*"); json.dump(m, open(f"{EXT}/manifest.json","w"))

nd = lambda pp: '<html><head><title>Rappi</title></head><body><script id="__NEXT_DATA__" type="application/json">%s</script></body></html>' % json.dumps({"props":{"pageProps":pp}})
CAT = nd({"location":{"city":"Rosario"},"fallback":{"k":[
  {"id":1,"status":"OPEN","name":"Grido","etaString":"20 min","rating":4.4,"promotionText":"Envío Gratis: mín $14mil","deliveryCost":0,"hasFreeShipping":True,"categories":[257]},
  {"id":2,"status":"OPEN","name":"Monk's","etaString":"12 min","rating":4.5,"promotionText":"Hasta 33% Off","deliveryCost":500,"categories":[257]},
  {"id":3,"status":"CLOSED","name":"Freddo","etaString":"","rating":4.7,"promotionText":"Hasta 30% Off","deliveryCost":0,"categories":[257]}]}})
STORE = {1: nd({"fallback":{"r":{"id":1,"name":"Grido","status":"OPEN","address":"Oroño 1181","corridors":[{"products":[
            {"id":11,"name":"1 Kg de helado","price":12900,"realPrice":21500},{"id":12,"name":"1/4 kg","price":5000,"realPrice":5000}]}]}}}),
         2: nd({"fallback":{"r":{"id":2,"name":"Monk's","status":"OPEN","address":"Tucumán 1996","corridors":[{"products":[
            {"id":21,"name":"Kilo","price":20000,"realPrice":25000},{"id":22,"name":"Medio","price":10800,"realPrice":13500}]}]}}})}
CHALLENGE = "<html><head><title>Just a moment...</title></head><body>Nuestros sistemas han detectado tráfico inusual</body></html>"
PYA_PAGE = """<html><head><title>Restaurantes en Rosario</title></head><body><a href="#" onclick="fetch('/pya/api/feed').then(r=>r.json());return false;">Helados</a><div style="height:5000px"></div></body></html>"""
FEED = json.dumps({"data":{"items":[
  {"id":501,"name":"Heladería Rosarina","rating":4.6,"deliveryTimeText":"25-40 min","shippingAmount":0,"discounts":[{"text":"2x1 en 1/4"}],"link":"/restaurantes/rosario/heladeria-rosarina-menu","categories":[{"name":"Helados"}]},
  {"id":502,"name":"Burger X","rating":4.0,"deliveryTimeText":"30 min","shippingAmount":900}]}})
state = {"challenge": True, "calls": []}
class Mock(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def out(self, code, ctype, body):
        self.send_response(code); self.send_header("Content-Type", ctype); self.end_headers(); self.wfile.write(body.encode())
    def do_GET(self):
        u = self.path; state["calls"].append(u)
        if u.startswith("/rappi/restaurantes/category/helados"): return self.out(200,"text/html",CAT)
        if u.startswith("/rappi/restaurantes/"): return self.out(200,"text/html",STORE[int(u.rsplit("/",1)[1])])
        if u == "/pya/api/feed": return self.out(200,"application/json",FEED)
        if u.startswith("/pya/"): return self.out(403,"text/html",CHALLENGE) if state["challenge"] else self.out(200,"text/html",PYA_PAGE)
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
    solved = False
    for i in range(60):
        page.wait_for_timeout(2000)
        prog = page.inner_text("#progress") if not page.is_hidden("#progress") else ""
        if "verificación" in prog and not solved:
            print("PROGRESO:", prog.replace("\n"," | "))
            tabs = [pg for pg in ctx.pages if "/pya/" in pg.url]
            print("pestaña PedidosYa visible:", [t.url for t in tabs])
            state["challenge"] = False; tabs[0].reload(); solved = True   # "la persona resuelve"
        if page.inner_text("#fetch") == "Traer descuentos" and i > 0: break
    print("STATUS:", page.inner_text("#status").replace("\n"," | "))
    print("LIST:\n" + page.inner_text("#list")[:1200])
    print("tabs al final:", [pg.url for pg in ctx.pages])
    print("pedidos:", state["calls"])
    page.click("details summary") if page.query_selector("details summary") else None
    page.screenshot(path="/tmp/e2e.png", full_page=True)
    # segundo click: debe usar caché (no nuevos pedidos)
    n = len(state["calls"]); page.click("#fetch"); page.wait_for_timeout(3000)
    print("pedidos nuevos con caché:", len(state["calls"]) - n)
    status = page.inner_text("#status")
    assert "Rappi: ok" in status and "PedidosYa: ok" in status, status
    assert solved, "no apareció el aviso de verificación"
    assert len(state["calls"]) == n, "el segundo click no usó la caché"
    print("E2E OK")
    ctx.close()
