"""Corre los conectores habilitados a demanda, con caché."""
from __future__ import annotations

import logging
import threading

from config import Location, Settings, settings as default_settings
from connectors import cache
from connectors.base import Connector, ScrapeResult, Status
from connectors.pedidosya import PedidosYaConnector

log = logging.getLogger(__name__)

# Para sumar una plataforma: crear su Connector y agregarlo acá.
CONNECTORS: dict[str, type[Connector]] = {
    "pedidosya": PedidosYaConnector,
}

_lock = threading.Lock()  # una corrida a la vez, aunque aprieten el botón varias veces


def run_all(location: Location | None = None, force: bool = False,
            settings: Settings = default_settings) -> list[ScrapeResult]:
    location = location or settings.location
    results = []
    with _lock:
        for name, cls in CONNECTORS.items():
            if not settings.connectors_enabled.get(name, False):
                results.append(ScrapeResult(name, Status.DISABLED, message="Desactivado en .env"))
                continue
            if not force:
                cached = cache.load(settings.cache_dir, name, location, settings.cache_ttl_minutes)
                if cached:
                    log.info("%s: uso caché de %s", name, cached.captured_at)
                    results.append(cached)
                    continue
            result = cls(settings).fetch(location)
            cache.save(settings.cache_dir, result, location)
            results.append(result)
    return results


def last_results(location: Location | None = None,
                 settings: Settings = default_settings) -> list[ScrapeResult]:
    location = location or settings.location
    out = []
    for name in CONNECTORS:
        r = cache.last(settings.cache_dir, name, location)
        if r:
            out.append(r)
    return out
