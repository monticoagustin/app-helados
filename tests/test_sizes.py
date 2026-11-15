import pytest

from normalizer.sizes import parse_size_kg, price_per_kg


@pytest.mark.parametrize("text, expected", [
    ("Helado 1Kg", 1.0),
    ("Helado 1 kg con 4 sabores", 1.0),
    ("Helado 1/2Kg", 0.5),
    ("½ kg de helado", 0.5),
    ("Medio kilo", 0.5),
    ("Helados 1/4 Kg", 0.25),
    ("Cuarto de helado", 0.25),
    ("Pote 250 g", 0.25),
    ("Pote 500grs", 0.5),
    ("2 x 1/4 Helados", 0.5),
    ("Kilo de helado artesanal", 1.0),
    ("1,5 kg", 1.5),
    ("Cucurucho", None),
    ("Paleta bañada", None),
    ("", None),
])
def test_parse_size_kg(text, expected):
    assert parse_size_kg(text) == expected


def test_price_per_kg():
    assert price_per_kg(10875, 0.5) == 21750
    assert price_per_kg(5625, 0.25) == 22500
    assert price_per_kg(None, 1) is None
    assert price_per_kg(1000, None) is None
