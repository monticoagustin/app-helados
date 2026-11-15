"""Pantalla web mínima: botón "Ver promos" que corre los conectores a demanda.

Levantar con:  uvicorn api.app:app --port 8000
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from config import settings
from connectors import registry
from connectors.base import ScrapeResult
from logging_setup import setup_logging

setup_logging()

app = FastAPI(title="App Helados")
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent.parent / "web" / "templates"))
AR_TZ = timezone(timedelta(hours=-3))


def hora_local(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).astimezone(AR_TZ).strftime("%d/%m %H:%M")
    except ValueError:
        return iso


templates.env.filters["hora_local"] = hora_local


def _rows(results: list[ScrapeResult]) -> list[dict]:
    """Una fila por heladería, ordenadas por el mejor descuento de sus productos."""
    rows = []
    for r in results:
        for s in r.stores:
            discounts = [p.discount_pct for p in s.products if p.discount_pct]
            per_kg = [p.price_per_kg for p in s.products if p.price_per_kg]
            rows.append({
                "store": s,
                "best_discount": max(discounts) if discounts else None,
                "best_per_kg": min(per_kg) if per_kg else None,
            })
    rows.sort(key=lambda x: (-(x["best_discount"] or 0), x["best_per_kg"] or float("inf")))
    return rows


def _render(request: Request, results: list[ScrapeResult], ran: bool) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html", {
        "results": results,
        "rows": _rows(results),
        "location": settings.location,
        "ran": ran,
        "ttl": settings.cache_ttl_minutes,
    })


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return _render(request, registry.last_results(), ran=False)


@app.post("/promos", response_class=HTMLResponse)
def ver_promos(request: Request, force: str = Form("")):
    # Endpoint sincrónico a propósito: FastAPI lo corre en un hilo aparte,
    # que es lo que necesita Playwright en modo sync.
    results = registry.run_all(force=force == "1")
    return _render(request, results, ran=True)
