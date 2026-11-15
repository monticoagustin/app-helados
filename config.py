"""Configuración leída del .env (con valores por defecto para Rosario)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "si", "sí", "yes", "on"}


def _float(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value not in (None, "") else default


def _int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value not in (None, "") else default


@dataclass(frozen=True)
class Location:
    address: str
    lat: float
    lng: float
    city: str  # slug que usan las plataformas en la URL, ej: "rosario"


@dataclass(frozen=True)
class Settings:
    location: Location
    connectors_enabled: dict[str, bool]
    min_delay: float
    max_delay: float
    max_retries: int
    cache_ttl_minutes: int
    headless: bool
    data_dir: Path
    cache_dir: Path
    log_dir: Path


def load_settings() -> Settings:
    return Settings(
        location=Location(
            address=os.getenv("SEARCH_ADDRESS", "Córdoba 1000, Rosario, Santa Fe, Argentina"),
            lat=_float("SEARCH_LAT", -32.9468),
            lng=_float("SEARCH_LNG", -60.6393),
            city=os.getenv("SEARCH_CITY", "rosario"),
        ),
        connectors_enabled={
            "pedidosya": _bool("CONNECTOR_PEDIDOSYA_ENABLED", True),
            "rappi": _bool("CONNECTOR_RAPPI_ENABLED", True),
            "mercadolibre": _bool("CONNECTOR_MERCADOLIBRE_ENABLED", False),
            "ubereats": _bool("CONNECTOR_UBEREATS_ENABLED", False),
        },
        min_delay=_float("SCRAPE_MIN_DELAY_SECONDS", 2),
        max_delay=_float("SCRAPE_MAX_DELAY_SECONDS", 6),
        max_retries=_int("SCRAPE_MAX_RETRIES", 3),
        cache_ttl_minutes=_int("SCRAPE_CACHE_TTL_MINUTES", 20),
        headless=_bool("SCRAPE_HEADLESS", False),
        data_dir=ROOT / "data",
        cache_dir=ROOT / "cache",
        log_dir=ROOT / "logs",
    )


settings = load_settings()
