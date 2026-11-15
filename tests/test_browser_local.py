"""Prueba BrowserSession con un navegador real contra un servidor local.
Se saltea si no hay Chrome/Chromium disponible."""
import http.server
import json
import threading
from dataclasses import replace

import pytest

from config import Location, settings
from connectors.browser import BlockedError, BrowserSession

pytest.importorskip("playwright")

PAGES = {
    "/ok": ("text/html", """<html><head><title>Heladerías en Rosario</title></head><body>
        <script id="__NEXT_DATA__" type="application/json">{"props":{"stores":[{"id":1,"name":"Helados Test"}]}}</script>
        <a href="#" onclick="fetch('/api/promos').then(r=>r.json())">Helados</a>
        <div style="height:4000px">listado</div></body></html>"""),
    "/api/promos": ("application/json", json.dumps({"items": [{"id": 1, "name": "Helados Test", "price": 100}]})),
    "/bloqueo": ("text/html", "<html><head><title>Just a moment...</title></head><body>tráfico inusual</body></html>"),
}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        ctype, body = PAGES.get(self.path, ("text/plain", "no"))
        self.send_response(403 if self.path == "/bloqueo" else 200)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


@pytest.fixture(scope="module")
def fast_settings():
    return replace(settings, headless=True, min_delay=0, max_delay=0, max_retries=0)


LOC = Location("test", -32.9, -60.6, "rosario")


def _session(fast_settings):
    try:
        return BrowserSession(fast_settings, LOC, domain_filter="127.0.0.1").__enter__()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"No hay navegador disponible: {exc}")


def test_captura_json_y_estado_embebido(server, fast_settings):
    s = _session(fast_settings)
    try:
        s.goto(f"{server}/ok")
        assert s.click_text(["Heladerías", "Helados"])
        s.page.wait_for_timeout(500)
        urls = [c.url for c in s.captured]
        assert any(u.endswith("/api/promos") for u in urls)
        embedded = s.embedded_state()
        assert embedded and embedded[0].body["props"]["stores"][0]["name"] == "Helados Test"
    finally:
        s.__exit__(None, None, None)


def test_detecta_bloqueo(server, fast_settings):
    s = _session(fast_settings)
    try:
        with pytest.raises(BlockedError):
            s.goto(f"{server}/bloqueo")
    finally:
        s.__exit__(None, None, None)
