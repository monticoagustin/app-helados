"""Modelos comunes e interfaz que implementa cada conector."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from config import Location


class Status(str, Enum):
    OK = "ok"              # se obtuvieron datos
    BLOCKED = "blocked"    # la plataforma pidió captcha / desafío anti-bot
    ERROR = "error"        # falló por otra razón (red, estructura cambiada, etc.)
    DISABLED = "disabled"  # apagado desde el .env


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Product:
    name: str
    price: float | None                 # precio final (con descuento) en ARS
    original_price: float | None = None  # precio sin descuento
    discount_pct: float | None = None
    size_kg: float | None = None
    price_per_kg: float | None = None


@dataclass
class Store:
    platform: str
    store_id: str
    name: str
    address: str | None = None
    rating: float | None = None
    eta: str | None = None
    delivery_fee: float | None = None
    promos: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    products: list[Product] = field(default_factory=list)
    url: str | None = None
    captured_at: str = field(default_factory=now_iso)


@dataclass
class ScrapeResult:
    platform: str
    status: Status
    stores: list[Store] = field(default_factory=list)
    message: str = ""
    captured_endpoints: list[str] = field(default_factory=list)
    captured_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["status"] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ScrapeResult":
        stores = []
        for s in data.get("stores", []):
            products = [Product(**p) for p in s.pop("products", [])]
            stores.append(Store(**s, products=products))
        return cls(
            platform=data["platform"],
            status=Status(data["status"]),
            stores=stores,
            message=data.get("message", ""),
            captured_endpoints=data.get("captured_endpoints", []),
            captured_at=data.get("captured_at", now_iso()),
        )


class Connector(ABC):
    """Cada plataforma implementa `fetch`. Nunca debe lanzar excepciones hacia afuera:
    si algo falla, devuelve un ScrapeResult con status ERROR o BLOCKED."""

    name: str = ""

    @abstractmethod
    def fetch(self, location: Location) -> ScrapeResult:
        ...
