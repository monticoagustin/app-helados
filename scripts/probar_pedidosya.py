"""Prueba rápida del conector de PedidosYa desde tu compu.

    python scripts/probar_pedidosya.py

Abre una ventana de Chrome, entra a PedidosYa de tu ciudad, busca heladerías y te dice
si funcionó o si PedidosYa pidió verificación. No usa la caché.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import settings  # noqa: E402
from connectors.pedidosya import PedidosYaConnector  # noqa: E402
from logging_setup import setup_logging  # noqa: E402


def main() -> int:
    setup_logging()
    print(f"Buscando en PedidosYa cerca de: {settings.location.address}\n")
    result = PedidosYaConnector(settings).fetch(settings.location)

    print(f"\nResultado: {result.status.value.upper()} — {result.message}")
    if result.captured_endpoints:
        print("\nEndpoints JSON que usó la web:")
        for url in result.captured_endpoints:
            print("  ", url)
    for s in result.stores[:15]:
        extra = f"{len(s.products)} productos" if s.products else "sin productos"
        print(f"  • {s.name} | rating {s.rating} | envío {s.delivery_fee} | promos {s.promos} | {extra}")
    print("\nLos JSON crudos quedaron en data/raw/pedidosya/. Pasame esa carpeta para ajustar el parser.")
    return 0 if result.status.value == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
