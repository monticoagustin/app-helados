"""Prueba la pantalla con un conector falso (sin navegador ni red)."""
import json
from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from config import settings
from connectors import registry
from connectors.base import Connector, ScrapeResult, Status
from connectors.filters import is_ice_cream_store
from connectors.pedidosya_parser import parse_stores

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "pedidosya_ejemplo.json").read_text(encoding="utf-8"))


class FakePedidosYa(Connector):
    name = "pedidosya"
    calls = 0

    def __init__(self, _settings):
        pass

    def fetch(self, location):
        FakePedidosYa.calls += 1
        stores = [s for s in parse_stores([FIXTURE]) if is_ice_cream_store(s.name, s.categories)]
        return ScrapeResult("pedidosya", Status.OK, stores=stores, message="1 heladerías encontradas")


def test_boton_ver_promos_usa_cache(tmp_path, monkeypatch):
    test_settings = replace(settings, cache_dir=tmp_path, connectors_enabled={"pedidosya": True})
    monkeypatch.setattr(registry, "default_settings", test_settings)
    monkeypatch.setattr(registry, "CONNECTORS", {"pedidosya": FakePedidosYa})

    from api import app as app_module
    monkeypatch.setattr(app_module, "settings", test_settings)
    real_run_all, real_last = registry.run_all, registry.last_results
    monkeypatch.setattr(registry, "run_all", lambda force=False: real_run_all(force=force, settings=test_settings))
    monkeypatch.setattr(registry, "last_results", lambda: real_last(settings=test_settings))

    client = TestClient(app_module.app)
    assert "Ver promos" in client.get("/").text

    FakePedidosYa.calls = 0
    html = client.post("/promos", data={"force": ""}).text
    assert "Heladería Ejemplo Centro" in html
    assert "Pizzería" not in html
    assert "25% OFF en todo" in html
    assert "$18.000/kg" in html
    assert FakePedidosYa.calls == 1

    client.post("/promos", data={"force": ""})   # segundo click: usa la caché
    assert FakePedidosYa.calls == 1
    client.post("/promos", data={"force": "1"})  # "Actualizar ahora": consulta de nuevo
    assert FakePedidosYa.calls == 2

    assert "Heladería Ejemplo Centro" in client.get("/").text  # la home muestra lo último


def test_conector_desactivado(tmp_path):
    test_settings = replace(settings, cache_dir=tmp_path, connectors_enabled={"pedidosya": False})
    results = registry.run_all(settings=test_settings)
    assert results[0].status == Status.DISABLED
