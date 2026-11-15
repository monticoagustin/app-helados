"""Caché simple en disco: evita repetir pedidos si se aprieta "Ver promos" seguido."""
from __future__ import annotations

import json
import time
from pathlib import Path

from config import Location
from connectors.base import ScrapeResult


def _path(cache_dir: Path, platform: str, location: Location) -> Path:
    key = f"{platform}_{location.city}_{location.lat:.4f}_{location.lng:.4f}".replace("-", "m")
    return cache_dir / f"{key}.json"


def load(cache_dir: Path, platform: str, location: Location, ttl_minutes: int) -> ScrapeResult | None:
    path = _path(cache_dir, platform, location)
    if not path.exists():
        return None
    if time.time() - path.stat().st_mtime > ttl_minutes * 60:
        return None
    return ScrapeResult.from_dict(json.loads(path.read_text(encoding="utf-8")))


def last(cache_dir: Path, platform: str, location: Location) -> ScrapeResult | None:
    """Último resultado guardado, sin importar si venció (para mostrar en pantalla)."""
    path = _path(cache_dir, platform, location)
    if not path.exists():
        return None
    return ScrapeResult.from_dict(json.loads(path.read_text(encoding="utf-8")))


def save(cache_dir: Path, result: ScrapeResult, location: Location) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = _path(cache_dir, result.platform, location)
    path.write_text(json.dumps(result.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
