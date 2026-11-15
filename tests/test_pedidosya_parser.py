import json
from pathlib import Path

from connectors.filters import is_ice_cream_store
from connectors.pedidosya_parser import parse_stores

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "pedidosya_ejemplo.json").read_text(encoding="utf-8"))


def _heladerias():
    return [s for s in parse_stores([FIXTURE]) if is_ice_cream_store(s.name, s.categories)]


def test_encuentra_solo_la_heladeria():
    stores = _heladerias()
    assert [s.name for s in stores] == ["Heladería Ejemplo Centro"]


def test_combina_listado_y_ficha():
    store = _heladerias()[0]
    assert store.store_id == "101"
    assert store.rating == 4.6
    assert store.delivery_fee == 990
    assert store.eta == "20-35 min"
    assert store.address == "Córdoba 1200, Rosario"
    assert "25% OFF en todo" in store.promos
    assert store.url == "https://www.pedidosya.com.ar/restaurantes/rosario/heladeria-ejemplo-centro-menu"
    assert len(store.products) == 4


def test_productos_con_descuento_y_precio_por_kg():
    products = {p.name: p for p in _heladerias()[0].products}

    kilo = products["Helado 1 kg"]
    assert kilo.price == 18000 and kilo.original_price == 24000
    assert kilo.discount_pct == 25.0
    assert kilo.price_per_kg == 18000

    medio = products["Helado 1/2 kg"]  # precios en formato argentino "$11.250"
    assert medio.price == 11250 and medio.discount_pct == 25.0
    assert medio.price_per_kg == 22500

    cuarto = products["Helado 1/4 kg"]
    assert cuarto.discount_pct is None and cuarto.price_per_kg == 24000

    assert products["Cucurucho"].size_kg is None


def test_payload_vacio_no_rompe():
    assert parse_stores([{}, [], None, "texto"]) == []
