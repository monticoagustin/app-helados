# PROGRESS

Última actualización: 2026-11-14

## Hecho
- Repo creado con estructura de carpetas, `.gitignore`, `.env.example` y README.
- Ubicación por defecto: Rosario, Santa Fe.
- Fase 0: investigación de viabilidad por plataforma (ver abajo). Hecha desde un
  navegador con IP argentina, sin login.

## Viabilidad por plataforma (Rosario, 2026-11-14)

| Plataforma | Estado | Cómo se obtienen los datos |
|---|---|---|
| Rappi | ✅ Viable | JSON embebido en la página (`__NEXT_DATA__`, Next.js) + API interna `services.rappi.com.ar` |
| PedidosYa | ⛔ Bloqueada | Cloudflare devuelve 403 "Just a moment…" con desafío, incluso después de pasarlo a mano |
| Mercado Libre | ⛔ No aplica | El delivery es solo dentro de la app (deep links `meli://proximity_marketplace`), sin web |
| Uber Eats | ⛔ No opera en Rosario | Relanzado en Córdoba y Mendoza; Rosario no aparece en su listado de ciudades |

### Rappi: detalle
- Detecta la ciudad sola (`location`: Rosario, id 42, lat -32.945, lng -60.646).
- Listado `/restaurantes`: en `props.pageProps.catalog.restaurants` (30 por página) vienen
  `id, name, status, etaString, rating, reviewAmount, deliveryCost, hasFreeShipping,
  promotionText, categories, brandId`.
- Categoría **Helados = id 257** (`catalog.restaurantCategories`).
- Ficha `/restaurantes/{id}-{slug}`: en `props.pageProps.fallback["restaurant/{id},..."]`
  vienen `location [lng, lat]`, `tags`, `ratingData`, promos (incluidas algunas bancarias
  con vencimiento) y `corridors[].products[]` con `name, price, realPrice,
  discountInPercent, isAvailable`. El tamaño sale del nombre ("Helado 1Kg", "1/2Kg", "1/4 Kg").
  - Ejemplo: Frais Helados, "Helado 1Kg" $17.625 (antes $23.500, −25%).
- La clave de la ficha incluye lat/lng: hay que mandar la ubicación de búsqueda.
- Endpoints internos vistos (XHR): `/api/rocket/v2/guest` (token de invitado),
  `/api/web-gateway/web/restaurants-bus/stores/catalog-paged/home/` (paginado),
  `/api/web-gateway/web/restaurants-bus/stores/filters/`. Falta capturar el cuerpo del
  pedido paginado (el visor de red del navegador integrado no lo mostró).

## Fase 1 – PedidosYa a demanda (rama `fase-1-pedidosya`)
Decisión: el usuario quiere PedidosYa automático. Sin consultas periódicas ni alertas
por ahora: se consulta solo al apretar "Ver promos".
- Hecho:
  - Config desde `.env`, modelos comunes e interfaz `Connector`.
  - `BrowserSession`: Chrome real con ventana visible, captura JSON, detecta desafíos
    anti-bot (no los saltea), pausas aleatorias, reintentos con backoff, caché de 20 min.
  - Conector PedidosYa con parser heurístico (todavía no vimos el JSON real) y guardado
    de crudos en `data/raw/pedidosya/`.
  - Normalizador de tamaños y precio por kg (con tests).
  - Pantalla FastAPI con botones "Ver promos" y "Actualizar ahora".
  - 34 tests (incluye navegador real contra servidor local).
- Pendiente de validar en la compu del usuario: si PedidosYa deja pasar el scraper
  liviano o lo bloquea. Si pasa, ajustar el parser con los JSON crudos reales.

## En curso
- Validación de la fase 1 en la compu del usuario.

## Falta
- Fase 1: primer conector de punta a punta (scraping → normalización → ranking → alerta Telegram).
- Fase 2: resto de plataformas viables + matching entre plataformas.
- Fase 3: scheduler, historial y dashboard.
- Fase 4: docker-compose, README completo y deploy.

## Problemas conocidos por plataforma
- **PedidosYa**: Cloudflare con desafío anti-bot. No se saltea. Alternativas a evaluar:
  Playwright con ventana visible y ritmo bajo (si igual bloquea, se registra y se sigue),
  o modo semiautomático en el que el usuario navega y un script local lee lo que ya ve.
- **Mercado Libre**: sin web. Conector desactivado.
- **Uber Eats**: no opera en Rosario. Conector desactivado; revisar cada tanto.

## Mejoras futuras
- Descuentos con bancos/billeteras (Mercado Pago, Modo, etc.): Rappi trae algunos en la
  ficha; el resto muchas veces no aparece. Fuera de alcance por ahora.

## Próximos pasos
- Usuario corre `python scripts/probar_pedidosya.py` y pasa el resultado + `data/raw/pedidosya/`.
- Ajustar parser a la estructura real de PedidosYa.
- Sumar conector de Rappi (ya relevado, viable) para comparar entre apps.
