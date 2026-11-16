# PROGRESS

Última actualización: 2026-11-16

## Decisiones
- 2026-11-15: la app vive en **teskel.online/helados** (Spacefast, flujo GitHub → Spacefast).
  Como ahí solo se sirven archivos estáticos (sin Python, sin IP argentina), la búsqueda se hace
  con una **extensión de Chrome** en la compu del usuario. Reemplaza al prototipo en Python
  (PR #1, rama `fase-1-pedidosya`, sin mergear).
- Si PedidosYa pide verificación, **la resuelve la persona** en la pestaña que abre la extensión.
  No se automatiza ni se saltea.
- Sin búsquedas periódicas ni alertas por ahora: se busca al apretar "Traer descuentos".
- Plataformas: PedidosYa y Rappi. Mercado Libre (solo app) y Uber Eats (no opera en Rosario) quedan afuera.

## Hecho (rama `fase-1-extension`)
- Normalizador en JS: tamaños (1/4, 1/2, 1 kg, gramos, "2 x 1/4"), $/kg solo para helado por peso
  (excluye packs de palitos/bombones), promos → % efectivo (%, 2x1, 3x2, 2da al X%), envío gratis,
  mínimo, tope, medio de pago (las de banco/billetera no cuentan para el ranking).
- Parser de Rappi **verificado con datos reales de Rosario** (54 heladerías, 22 abiertas en la prueba;
  ej.: Grido kg $12.900 antes $21.500).
- Parser de PedidosYa heurístico + captura del JSON + diagnóstico descargable.
- Extensión MV3 (background, puente con la página, captura en PedidosYa), caché 20 min, pausas
  aleatorias, backoff.
- Página con botón, progreso, filtros (plataforma, solo abiertas, solo con descuento, orden por %/kg).
- Tests: 16 unitarios (`node --test`) + e2e con Chrome real y servidores simulados (incluye la
  verificación resuelta "por una persona").
- Workflow de publicación a `teskel/helados/`.

## Hecho (rama `fase-1-ciudad-y-direccion`, 2026-11-16)
- Publicado en https://teskel.online/helados/ (PR #2 mergeado). Rappi probado por el usuario: OK.
- Selector de ciudad (17 ciudades con Helados en Rappi, relevadas). Rappi usa
  `/{ciudad}/restaurantes/category/helados`; si la ciudad no existe, Rappi devuelve otra sin avisar
  → la extensión lo detecta y lo informa. Resultados y caché separados por ciudad.
- PedidosYa: si no aparecen locales (pide dirección), muestra la pestaña para que la persona cargue
  la dirección y sigue sola. Acumula lo capturado aunque la página navegue.

## Hecho (rama `fase-1-solo-helados-y-pedidosya`, 2026-11-16)
- Solo cuentan descuentos de **productos de helado** (excluye agua, gaseosas, alfajores, café, etc.).
  Verificado con Rappi real. Los "Hasta X% off" del listado no rankean si ya tenemos los productos.
- PedidosYa: paso previo "Abrir PedidosYa para cargar la dirección", botón **Cancelar**, la búsqueda
  no queda trabada (si recargás la página la retoma), aviso con cuenta regresiva y el diagnóstico se
  guarda siempre (también si falla o se cancela). Extensión v0.3.0.
- Problema reportado: con la dirección cargada, PedidosYa no devolvió heladerías → falta ver el JSON
  real (diagnóstico) para ajustar el parser.

## Hecho (rama `fase-1-pedidosya-real`, 2026-11-16)
- **PedidosYa con datos reales** (vistos en el navegador integrado con la sesión del usuario, solo lectura):
  - Lista de Helados: `/restaurantes?bt=RESTAURANT&category=25&lat=…&lng=…&areaId=…&areaName=…&address=…`
  - Datos: `POST /v4/shoplist/vendors?size=30&page=N` → `{ vendors: [...] }` con id, name, url,
    rating.score, delivery.bucket.label, delivery.price.deliveryFeeTotal(WithDiscount), state.status,
    location, mainFoodCategories (Helados = 25), discounts[], discountSummary.
  - El envío gratis que se ve suele ser **solo con PedidosYa Plus** (`conditions.SUBSCRIPTION`).
  - El listado no trae precios por producto: están en el menú de cada local (pendiente).
- Parser específico para ese formato (+ heurístico de respaldo), con fixture real recortado.
- La extensión guarda la dirección de PedidosYa (desde la URL) y va directo a Helados. Si no hay
  dirección, la persona la carga en la pestaña y la búsqueda sigue sola. Extensión v0.4.0.

## Hecho (rama `fase-1-pedidosya-ubicacion`, 2026-11-16)
- Diagnóstico real del usuario: con la dirección ya cargada, la pestaña quedaba en la portada (la URL no
  trae lat/lng) y la búsqueda esperaba ayuda sin llegar a Helados. Ahora la ubicación se toma también de
  las llamadas internas de la portada (`/home-page/v44/home/lazy_load?lat=..&lng=..`) y la dirección del
  texto "Enviar a …". Extensión v0.5.1.

## Falta / próximos pasos
- [ ] Menús de PedidosYa: la extensión ya los lee (hasta 8 heladerías abiertas, las más cercanas),
      pero el formato de `/v2/niles/partners/{id}/menus` todavía no lo vimos: en el navegador integrado
      PedidosYa lo bloqueó con **PerimeterX** (403 con `blockScript`); en el Chrome del usuario el menú
      carga. Parser heurístico + diagnóstico → ajustar con la primera captura real. Si PerimeterX
      bloquea en la búsqueda, se muestra la pestaña por si hay desafío y, si no, se sigue sin precios.
- [x] Secreto `SPACEFAST_TOKEN` cargado y publicación funcionando.
- [ ] Usuario: instalar la extensión y hacer la primera búsqueda real.
- [ ] Ajustar el parser de PedidosYa con el diagnóstico real (botón "Descargar diagnóstico").
- [ ] Fichas de PedidosYa (precios por producto); hoy solo promos del listado.
- [ ] Dirección exacta dentro de la ciudad (Rappi: ciudad elegida; PedidosYa: la dirección cargada en PedidosYa).
- [ ] Más adelante: historial, matching entre plataformas, alertas por Telegram.
- [ ] Limpiar carpetas vacías del esqueleto inicial (alerts/, notifiers/, etc.) si no se usan.

## Problemas conocidos por plataforma
- **PedidosYa**: Cloudflare con verificación anti-bot; con navegador automatizado la vuelve a pedir
  aunque se haya pasado. Con la extensión (Chrome normal) se espera que pase o que alcance con
  resolverla a mano. Estructura del JSON todavía sin ver.
- **Rappi**: anda sin bloqueos. Ubicación por IP/cookies (detecta Rosario). La página de categoría
  trae la primera tanda de heladerías (54 en la prueba).
- **Mercado Libre**: sin web (solo app). Fuera.
- **Uber Eats**: no opera en Rosario. Fuera.

## Mejoras futuras
- Descuentos con bancos/billeteras: se muestran, no rankean.
