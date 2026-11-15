"""Sesión de navegador compartida por los conectores.

Decisiones:
- Usa el Chrome instalado en la compu (channel="chrome") con ventana visible por defecto:
  es un navegador normal, con su propio user-agent real. Si no hay Chrome, usa el
  Chromium de Playwright.
- NO usa plugins anti-detección ni intenta resolver captchas. Si la página muestra un
  desafío, se lanza BlockedError y el conector lo reporta como bloqueado.
- Guarda todas las respuestas JSON que la web recibe (la forma más estable de leer datos).
"""
from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

from config import Location, Settings

log = logging.getLogger(__name__)

T = TypeVar("T")

CHALLENGE_MARKERS = (
    "just a moment",
    "tráfico inusual",
    "trafico inusual",
    "comprobación de seguridad",
    "comprobacion de seguridad",
    "attention required",
    "cdn-cgi/challenge-platform",
    "verify you are human",
    "checking your browser",
)


class BlockedError(Exception):
    """La plataforma mostró un captcha o desafío anti-bot."""


def is_challenge(status: int | None, title: str, html: str = "") -> bool:
    text = f"{title}\n{html[:20000]}".lower()
    if any(marker in text for marker in CHALLENGE_MARKERS):
        return True
    # Un 403/429 sin contenido útil también lo tomamos como bloqueo.
    return status in (403, 429) and len(html) < 5000


def human_pause(settings: Settings) -> None:
    time.sleep(random.uniform(settings.min_delay, settings.max_delay))


def with_retries(fn: Callable[[], T], retries: int, base_delay: float = 2.0) -> T:
    """Reintenta con backoff exponencial + jitter. Un bloqueo NO se reintenta:
    insistir contra un desafío anti-bot solo empeora las cosas."""
    attempt = 0
    while True:
        try:
            return fn()
        except BlockedError:
            raise
        except Exception as exc:  # noqa: BLE001
            attempt += 1
            if attempt > retries:
                raise
            wait = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 1)
            log.warning("Fallo (%s). Reintento %s/%s en %.1fs", exc, attempt, retries, wait)
            time.sleep(wait)


@dataclass
class CapturedJSON:
    url: str
    status: int
    body: Any


class BrowserSession:
    """Uso:
        with BrowserSession(settings, location) as s:
            s.goto(url)
            ...
            s.captured  # lista de CapturedJSON
    """

    def __init__(self, settings: Settings, location: Location, domain_filter: str):
        self.settings = settings
        self.location = location
        self.domain_filter = domain_filter
        self.captured: list[CapturedJSON] = []
        self._pw = None
        self._browser = None
        self.page = None

    def __enter__(self) -> "BrowserSession":
        from playwright.sync_api import sync_playwright  # import diferido: los tests no lo necesitan

        self._pw = sync_playwright().start()
        try:
            self._browser = self._pw.chromium.launch(channel="chrome", headless=self.settings.headless)
        except Exception:  # noqa: BLE001
            log.info("No encontré Chrome instalado; uso el Chromium de Playwright.")
            self._browser = self._pw.chromium.launch(headless=self.settings.headless)
        context = self._browser.new_context(
            locale="es-AR",
            timezone_id="America/Argentina/Cordoba",
            geolocation={"latitude": self.location.lat, "longitude": self.location.lng},
            permissions=["geolocation"],
            viewport={"width": 1366, "height": 850},
        )
        self.page = context.new_page()
        self.page.on("response", self._on_response)
        return self

    def __exit__(self, *exc) -> None:
        try:
            if self._browser:
                self._browser.close()
        finally:
            if self._pw:
                self._pw.stop()

    def _on_response(self, response) -> None:
        try:
            if self.domain_filter not in response.url:
                return
            ctype = response.headers.get("content-type", "")
            if "json" not in ctype:
                return
            self.captured.append(CapturedJSON(response.url, response.status, response.json()))
        except Exception:  # noqa: BLE001 (respuestas sin cuerpo, redirecciones, etc.)
            pass

    def goto(self, url: str) -> None:
        def _go():
            response = self.page.goto(url, wait_until="domcontentloaded", timeout=45000)
            self.page.wait_for_timeout(2500)
            self.check_blocked(response.status if response else None)

        with_retries(_go, self.settings.max_retries)

    def check_blocked(self, status: int | None = None) -> None:
        title = self.page.title()
        html = self.page.content()
        if is_challenge(status, title, html):
            raise BlockedError(f"Desafío anti-bot en {self.page.url} (HTTP {status}, título: {title!r})")

    def click_text(self, options: list[str]) -> bool:
        """Hace click en el primer texto visible de la lista. Devuelve si pudo."""
        for text in options:
            locator = self.page.get_by_text(text, exact=True)
            if locator.count() > 0:
                try:
                    locator.first.click(timeout=5000)
                    self.page.wait_for_timeout(2500)
                    return True
                except Exception:  # noqa: BLE001
                    continue
        return False

    def scroll(self, times: int = 3) -> None:
        for _ in range(times):
            self.page.mouse.wheel(0, random.randint(900, 1500))
            self.page.wait_for_timeout(random.randint(1200, 2200))

    def embedded_state(self) -> list[CapturedJSON]:
        """Estado JSON embebido en el HTML (Next.js, Redux precargado, etc.)."""
        found = []
        script = """() => {
            const out = {};
            const nd = document.getElementById('__NEXT_DATA__');
            if (nd) out.__NEXT_DATA__ = nd.textContent;
            for (const k of ['__PRELOADED_STATE__', '__INITIAL_STATE__', '__APOLLO_STATE__']) {
                if (window[k]) out[k] = JSON.stringify(window[k]);
            }
            return out;
        }"""
        for key, raw in (self.page.evaluate(script) or {}).items():
            try:
                found.append(CapturedJSON(f"{self.page.url}#{key}", 200, json.loads(raw)))
            except (TypeError, ValueError):
                continue
        return found
