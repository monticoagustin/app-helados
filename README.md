# App Helados

Comparador de descuentos en heladerías de las apps de delivery. Junta los datos,
normaliza las promos a un % efectivo y a precio por kg, y los muestra ordenados.

Ubicación por defecto: **Rosario, Santa Fe**. Moneda: ARS. Uso personal.

> Proyecto en construcción. Ver [PROGRESS.md](PROGRESS.md) para el estado actual.

## Instalación (Windows, PowerShell)

Necesitás Python 3.11+ y Google Chrome instalados.

```powershell
git clone https://github.com/monticoagustin/app-helados
cd app-helados
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium   # respaldo por si no encuentra tu Chrome
copy .env.example .env                  # editá la dirección si querés
```

En Mac/Linux: `source .venv/bin/activate` y `cp .env.example .env`.

## Uso

**Pantalla con botón "Ver promos":**

```powershell
uvicorn api.app:app --port 8000
```

Abrí http://localhost:8000 y apretá **Ver promos**. Se abre una ventana de Chrome, recorre
la plataforma un minuto aprox. y muestra las heladerías con descuentos y precio por kg.
Si volvés a apretar dentro de los 20 minutos usa la caché; "Actualizar ahora" la saltea.

**Prueba rápida por consola:**

```powershell
python scripts/probar_pedidosya.py
```

**Tests:**

```powershell
pytest
```

## Qué pasa si una plataforma bloquea

Si la plataforma muestra un captcha o una verificación anti-bot, el conector **no la
saltea**: corta, la marca como `blocked` en pantalla y lo deja en `logs/app.log`.
Las demás plataformas siguen funcionando.

## Estructura

```
config.py     lee el .env
connectors/   un módulo por plataforma (misma interfaz, activables desde .env)
  base.py       modelos Store/Product/ScrapeResult e interfaz Connector
  browser.py    sesión de Chrome: captura JSON, detecta bloqueos, reintentos
  registry.py   lista de conectores + corrida a demanda con caché
normalizer/   tamaños (1/4, 1/2, 1 kg…) y precio por kg
api/          FastAPI (pantalla "Ver promos")
web/          templates
scripts/      pruebas manuales
tests/        pytest
data/raw/     JSON crudos de cada corrida (no se commitea)
```

## Cómo sumar una plataforma

1. Crear `connectors/<plataforma>.py` con una clase que herede de `Connector` e implemente
   `fetch(location) -> ScrapeResult`. Usar `BrowserSession` para navegar y capturar JSON.
2. Agregarla en `CONNECTORS` dentro de `connectors/registry.py`.
3. Agregar `CONNECTOR_<PLATAFORMA>_ENABLED` en `.env.example` y en `config.py`.
4. Tests con datos de ejemplo en `tests/`.
