"""Convierte el JSON que recibe la web de PedidosYa en objetos Store.

Todavía no pudimos ver las respuestas reales (el desafío anti-bot nos frenó en la
investigación), así que el parser es *heurístico*: recorre todo el JSON buscando
objetos que parezcan un local (tienen id + nombre + algún dato de delivery/rating) o un
producto (nombre + precio). Cuando tengamos capturas reales en data/raw/pedidosya,
lo ajustamos a los campos exactos.
"""
from __future__ import annotations

from typing import Any, Iterator

from connectors.base import Product, Store
from normalizer.sizes import parse_size_kg, price_per_kg

PLATFORM = "pedidosya"
BASE_URL = "https://www.pedidosya.com.ar"

ID_KEYS = ("id", "partnerId", "restaurantId", "vendorId", "storeId")
NAME_KEYS = ("name", "businessName", "restaurantName", "title")
RATING_KEYS = ("rating", "ratingScore", "generalScore", "score", "averageRating")
ETA_KEYS = ("deliveryTime", "deliveryTimeText", "eta", "deliveryTimeRange", "estimatedDeliveryTime")
FEE_KEYS = ("shippingAmount", "deliveryFee", "shippingFee", "deliveryCost", "shipping")
ADDRESS_KEYS = ("address", "street", "addressLine", "formattedAddress")
CATEGORY_KEYS = ("categories", "cuisines", "foodCategories", "tags", "mainCategory")
PROMO_KEYS = ("discounts", "promotions", "campaigns", "badges", "tags", "promotionText", "discountText")
URL_KEYS = ("link", "url", "permalink", "slug")
PRICE_KEYS = ("price", "finalPrice", "discountedPrice", "priceAfterDiscount")
ORIGINAL_PRICE_KEYS = ("originalPrice", "realPrice", "priceBeforeDiscount", "basePrice", "listPrice")
PRODUCT_LIST_KEYS = ("products", "items", "menuItems", "sections", "categories", "corridors")

STORE_SIGNAL_KEYS = RATING_KEYS + ETA_KEYS + FEE_KEYS


def _first(d: dict, keys: tuple[str, ...]) -> Any:
    for k in keys:
        if k in d and d[k] not in (None, "", [], {}):
            return d[k]
    return None


def _to_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict):
        return _to_float(_first(value, ("amount", "value", "price", "score")))
    if isinstance(value, str):
        cleaned = value.replace("$", "").replace(" ", "").strip()
        # formato argentino: 17.625,50
        if "," in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        elif cleaned.count(".") >= 1 and len(cleaned.split(".")[-1]) == 3:
            cleaned = cleaned.replace(".", "")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _to_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (str, int, float)):
        return str(value)
    if isinstance(value, dict):
        return _to_text(_first(value, ("text", "name", "label", "description", "value")))
    if isinstance(value, list):
        parts = [t for t in (_to_text(v) for v in value) if t]
        return ", ".join(parts) or None
    return None


def _texts(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        out: list[str] = []
        for v in value:
            out.extend(_texts(v))
        return out
    text = _to_text(value)
    return [text] if text else []


def _walk(node: Any) -> Iterator[dict]:
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def looks_like_store(d: dict) -> bool:
    has_id = _first(d, ID_KEYS) is not None
    has_name = isinstance(_first(d, NAME_KEYS), str)
    signals = sum(1 for k in STORE_SIGNAL_KEYS if k in d)
    return has_id and has_name and signals >= 2


def looks_like_product(d: dict) -> bool:
    return isinstance(_first(d, NAME_KEYS), str) and _to_float(_first(d, PRICE_KEYS)) is not None \
        and not looks_like_store(d)


def parse_product(d: dict) -> Product:
    name = _first(d, NAME_KEYS)
    price = _to_float(_first(d, PRICE_KEYS))
    original = _to_float(_first(d, ORIGINAL_PRICE_KEYS))
    if original is None or (price is not None and original < price):
        original = price
    discount = None
    if price and original and original > price:
        discount = round((1 - price / original) * 100, 1)
    size = parse_size_kg(f"{name} {d.get('description') or ''}")
    return Product(
        name=name,
        price=price,
        original_price=original,
        discount_pct=discount,
        size_kg=size,
        price_per_kg=price_per_kg(price, size),
    )


def _products_inside(d: dict) -> list[Product]:
    products: list[Product] = []
    seen: set[str] = set()
    for key in PRODUCT_LIST_KEYS:
        if key not in d:
            continue
        for node in _walk(d[key]):
            if looks_like_product(node):
                p = parse_product(node)
                if p.name not in seen:
                    seen.add(p.name)
                    products.append(p)
    return products


def _store_url(d: dict) -> str | None:
    value = _first(d, URL_KEYS)
    if not isinstance(value, str):
        return None
    if value.startswith("http"):
        return value
    if value.startswith("/"):
        return BASE_URL + value
    return None


def parse_store(d: dict) -> Store:
    return Store(
        platform=PLATFORM,
        store_id=str(_first(d, ID_KEYS)),
        name=_first(d, NAME_KEYS).strip(),
        address=_to_text(_first(d, ADDRESS_KEYS)),
        rating=_to_float(_first(d, RATING_KEYS)),
        eta=_to_text(_first(d, ETA_KEYS)),
        delivery_fee=_to_float(_first(d, FEE_KEYS)),
        promos=sorted(set(_texts(_first(d, PROMO_KEYS)))),
        categories=_texts(_first(d, CATEGORY_KEYS)),
        products=_products_inside(d),
        url=_store_url(d),
    )


def parse_stores(payloads: list[Any]) -> list[Store]:
    """Junta los locales encontrados en todas las respuestas. Si un local aparece varias
    veces (listado + ficha), se queda con la versión que tiene más datos."""
    by_id: dict[str, Store] = {}
    for payload in payloads:
        for node in _walk(payload):
            if not looks_like_store(node):
                continue
            store = parse_store(node)
            prev = by_id.get(store.store_id)
            by_id[store.store_id] = store if prev is None else _merge(prev, store)
    return list(by_id.values())


def _merge(a: Store, b: Store) -> Store:
    """Combina dos vistas del mismo local: base = la más completa, huecos = la otra."""
    base, other = (b, a) if _richness(b) > _richness(a) else (a, b)
    for attr in ("address", "rating", "eta", "delivery_fee", "url"):
        if getattr(base, attr) is None:
            setattr(base, attr, getattr(other, attr))
    base.promos = sorted(set(base.promos) | set(other.promos))
    base.categories = list(dict.fromkeys(base.categories + other.categories))
    if not base.products:
        base.products = other.products
    return base


def _richness(s: Store) -> int:
    return len(s.products) * 10 + len(s.promos) + sum(
        v is not None for v in (s.address, s.rating, s.eta, s.delivery_fee, s.url)
    )
