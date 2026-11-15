"""Conector de PedidosYa.

Flujo (pocos pedidos, con pausas aleatorias):
1. Abre el listado de la ciudad (/restaurantes/{ciudad}).
2. Intenta entrar a la categoría Helados y scrollea un poco.
3. Opcional: abre la ficha de hasta N heladerías para leer precios de productos.
4. Lee todo el JSON que recibió la página (+ estado embebido en el HTML), lo guarda
   crudo en data/raw/pedidosya/ y lo convierte en Store.

Si aparece un captcha o desafío anti-bot, corta y devuelve status BLOCKED.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path

from config import Location, Settings, settings as default_settings
from connectors.base import Connector, ScrapeResult, Status
from connectors.browser import BlockedError, BrowserSession, CapturedJSON, human_pause
from connectors.filters import is_ice_cream_store
from connectors.pedidosya_parser import BASE_URL, parse_stores

log = logging.getLogger(__name__)

CATEGORY_TEXTS = ["Helados", "Heladerías", "Heladerias", "Helado"]


class PedidosYaConnector(Connector):
    name = "pedidosya"

    def __init__(self, settings: Settings = default_settings):
        self.settings = settings
        self.max_store_details = int(os.getenv("PEDIDOSYA_MAX_STORE_DETAILS", "5"))

    def fetch(self, location: Location) -> ScrapeResult:
        captured: list[CapturedJSON] = []
        try:
            with BrowserSession(self.settings, location, domain_filter="pedidosya") as s:
                s.goto(f"{BASE_URL}/restaurantes/{location.city}")
                human_pause(self.settings)

                if not s.click_text(CATEGORY_TEXTS):
                    log.warning("PedidosYa: no encontré la categoría Helados en la página. "
                                "Puede haber cambiado la estructura; sigo con el filtro por palabras.")
                s.check_blocked()
                s.scroll(3)
                captured.extend(s.embedded_state())

                stores = [st for st in parse_stores([c.body for c in s.captured + captured])
                          if is_ice_cream_store(st.name, st.categories)]

                for store in [st for st in stores if not st.products and st.url][: self.max_store_details]:
                    human_pause(self.settings)
                    s.goto(store.url)
                    s.scroll(1)
                    captured.extend(s.embedded_state())

                captured = s.captured + captured
        except BlockedError as exc:
            log.warning("PedidosYa bloqueó la consulta: %s", exc)
            self._save_raw(captured)
            return ScrapeResult(self.name, Status.BLOCKED,
                                message="PedidosYa pidió una verificación anti-bot. No se saltea; "
                                        "probá de nuevo más tarde.",
                                captured_endpoints=sorted({c.url.split("?")[0] for c in captured}))
        except Exception as exc:  # noqa: BLE001
            log.exception("PedidosYa: error inesperado")
            self._save_raw(captured)
            return ScrapeResult(self.name, Status.ERROR, message=f"Error: {exc}")

        raw_dir = self._save_raw(captured)
        stores = [st for st in parse_stores([c.body for c in captured])
                  if is_ice_cream_store(st.name, st.categories)]
        endpoints = sorted({c.url.split("?")[0] for c in captured})

        if captured and not stores:
            log.warning("PedidosYa: recibí %s respuestas JSON pero no reconocí ninguna heladería. "
                        "Posible cambio de estructura: revisar %s", len(captured), raw_dir)
            return ScrapeResult(self.name, Status.ERROR, captured_endpoints=endpoints,
                                message=f"No reconocí heladerías en los datos. Crudos en {raw_dir}")

        return ScrapeResult(self.name, Status.OK, stores=stores, captured_endpoints=endpoints,
                            message=f"{len(stores)} heladerías encontradas")

    def _save_raw(self, captured: list[CapturedJSON]) -> Path | None:
        if not captured:
            return None
        folder = self.settings.data_dir / "raw" / self.name / datetime.now().strftime("%Y%m%d-%H%M%S")
        folder.mkdir(parents=True, exist_ok=True)
        index = []
        for i, c in enumerate(captured):
            name = f"{i:03d}.json"
            (folder / name).write_text(json.dumps(c.body, ensure_ascii=False, indent=1), encoding="utf-8")
            index.append({"file": name, "url": c.url, "status": c.status})
        (folder / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
        return folder
