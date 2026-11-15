"""Filtro de respaldo para quedarnos solo con heladerías."""
from __future__ import annotations

import unicodedata

ICE_CREAM_KEYWORDS = (
    "helad", "gelat", "ice cream", "sorbet", "cremolatti", "grido", "freddo",
    "rapanui", "persicco", "chungo", "lucciano", "jauja", "nicolo", "via flaminia",
)


def _norm(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def is_ice_cream_store(name: str, categories: list[str] | None = None, extra_text: str = "") -> bool:
    haystack = _norm(" ".join([name or "", *(categories or []), extra_text]))
    return any(keyword in haystack for keyword in ICE_CREAM_KEYWORDS)
