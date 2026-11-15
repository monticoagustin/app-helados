"""Detecta el tamaño de un producto de helado y calcula el precio por kg.

Ejemplos que entiende: "1Kg", "1 kilo", "1/2Kg", "½ kg", "medio kilo", "1/4 Kg",
"cuarto", "250 g", "250grs", "2 x 1/4", "Kilo de helado".
"""
from __future__ import annotations

import re
import unicodedata

_FRACTIONS = {"½": "1/2", "¼": "1/4", "¾": "3/4"}


def _clean(text: str) -> str:
    for symbol, frac in _FRACTIONS.items():
        text = text.replace(symbol, f" {frac} ")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " " + re.sub(r"\s+", " ", text.lower()) + " "


def _num(token: str) -> float:
    if "/" in token:
        a, b = token.split("/")
        return float(a) / float(b)
    return float(token.replace(",", "."))


_NUM = r"(\d+/\d+|\d+(?:[.,]\d+)?)"
_KG = re.compile(_NUM + r"\s*(?:kg|kgs|kilo|kilos|k)\b")
_G = re.compile(_NUM + r"\s*(?:g|gr|grs|gramos)\b")
_MULT = re.compile(r"\b(\d+)\s*x\s*")


def parse_size_kg(text: str) -> float | None:
    """Devuelve el tamaño total en kg, o None si no lo puede inferir."""
    if not text:
        return None
    t = _clean(text)

    multiplier = 1
    mult = _MULT.search(t)
    if mult:
        multiplier = int(mult.group(1))
        t = t[: mult.start()] + " " + t[mult.end():]

    size: float | None = None
    if m := _KG.search(t):
        size = _num(m.group(1))
    elif m := _G.search(t):
        size = _num(m.group(1)) / 1000
    elif re.search(r"\b(1/4|cuarto)\b", t):
        size = 0.25
    elif re.search(r"\b(1/2|medio)\b", t):
        size = 0.5
    elif re.search(r"\b(3/4)\b", t):
        size = 0.75
    elif re.search(r"\bkilo\b|\bkg\b", t):
        size = 1.0

    if size is None or size <= 0 or size > 5:
        return None
    return round(size * multiplier, 3)


def price_per_kg(price: float | None, size_kg: float | None) -> float | None:
    if not price or not size_kg:
        return None
    return round(price / size_kg, 2)
