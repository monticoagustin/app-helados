import pytest

from connectors.browser import BlockedError, is_challenge, with_retries
from connectors.filters import is_ice_cream_store


def test_detecta_desafio_cloudflare():
    html = "<body>Nuestros sistemas han detectado tráfico inusual por lo que te pedimos...</body>"
    assert is_challenge(403, "Just a moment...", html)
    assert is_challenge(200, "Just a moment...", "")
    assert is_challenge(403, "", "<html></html>")


def test_pagina_normal_no_es_desafio():
    assert not is_challenge(200, "Restaurantes en Rosario - PedidosYa", "<html>" + "x" * 10000)


def test_bloqueo_no_se_reintenta():
    calls = []

    def fn():
        calls.append(1)
        raise BlockedError("captcha")

    with pytest.raises(BlockedError):
        with_retries(fn, retries=3, base_delay=0)
    assert len(calls) == 1


def test_error_comun_se_reintenta():
    calls = []

    def fn():
        calls.append(1)
        if len(calls) < 3:
            raise TimeoutError("lento")
        return "ok"

    assert with_retries(fn, retries=3, base_delay=0) == "ok"
    assert len(calls) == 3


@pytest.mark.parametrize("name, cats, expected", [
    ("Frais Helados", [], True),
    ("Heladería Súper Gato", [], True),
    ("Gelato Mio", [], True),
    ("Grido", [], True),
    ("Lo de Juan", ["Helados", "Postres"], True),
    ("McDonald's", ["Hamburguesas"], False),
])
def test_filtro_heladerias(name, cats, expected):
    assert is_ice_cream_store(name, cats) is expected
