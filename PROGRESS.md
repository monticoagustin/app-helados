# PROGRESS

Última actualización: 2026-11-17

## Decisiones
- 2026-11-15: la app vive en **teskel.online/helados** (Spacefast, flujo GitHub → Spacefast).
- 2026-11-16: se muda a **teskel.online/cuartito**.
  Como ahí solo se sirven archivos estáticos (sin Python, sin IP argentina), la búsqueda se hace
  con una **extensión de Chrome** en la compu del usuario. Reemplaza al prototipo en Python
  (PR #1, rama `fase-1-pedidosya`, sin mergear).
- Si PedidosYa pide verificación, **la resuelve la persona** en la pestaña que abre la extensión.
  No se automatiza ni se saltea.
- Sin búsquedas periódicas ni alertas por ahora: se busca al apretar "Traer descuentos".
- Plataformas: PedidosYa, Rappi y **Uber Eats** (desde 2026-11-17: volvió a Argentina y tiene web con Rosario).
  Mercado Libre queda afuera (solo app). Relevado 2026-11-17 en el navegador integrado, como compu y
  como celular: la landing `/landing/restaurantes` solo tiene links a la app (`meli://proximity_marketplace/
  store?brand_id=…`, ej. Freddo = 53) y una página "pedí con la app". No hay versión web (ni en
  mercadolibre.com.ar ni en mercadopago.com.ar: 404). Leer la app por dentro implicaría usar la sesión
  del usuario e interceptar su tráfico: no se hace.
- Pendiente de decisión: versión para celular (iPhone y Android, sin compu). Propuesta: app propia
  que busca desde el celular (necesita cuenta de Apple Developer para el iPhone).

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

## Hecho (rama `fase-1-solo-descuentos-segundo-plano`, 2026-11-16)
- Con el diagnóstico real: formato del menú de PedidosYa confirmado
  (`price: { finalPrice, originalPrice, discount: { percentage, isPlus, type } }`). Fixtures reales.
- Se leen los menús de las heladerías **con descuento** (las de mayor % primero, hasta 20), no las
  más cercanas. Descuentos `SUBSIDIZED_PRODUCT_PLUS` / `isPlus` marcados como "PedidosYa Plus".
- **Segundo plano:** los menús se piden directo (sin abrir páginas); si PedidosYa no lo permite,
  se abren en una **ventana minimizada**, que solo se muestra si hay que resolver algo.
- **Página:** solo heladerías con descuento en helado; se muestran los productos en descuento con
  "queda a" y "antes" (sin $/kg). Filtro para incluir o no descuentos de PedidosYa Plus. v0.6.0.

## Hecho (rama `fase-1-diseno-cuartito`, 2026-11-16)
- **Marca: Cuartito.** Logo: el pote de telgopor visto de arriba, con tres gustos y el cuarto vacío
  punteado (lo que te ahorrás). Lienzo de exploración: https://claude.ai/artifact/HLiFUSYpsEeDgKa6wcNJZ5
- **Paleta:** telgopor #F3F5F0, granizado #2A1712, frutilla #D61F4B (solo descuentos), sambayón
  #FFCE4A, rosa #F7A8B8, chocolate #6B3A2A. **Tipografía:** Rosario (Omnibus-Type), alojada en
  `web/fonts/` (OFL), con números alineados y fracciones reales (¼, ½).
- **Interfaz:** portada con la mejor rebaja como precio tachado grande; resultados en un solo ticket
  de heladería (bordes en zigzag, puntitos entre producto y precio). Celular revisado. Extensión v0.7.0.

## Hecho (rama `fase-1-diseno-ticket`, 2026-11-16)
- **Nuevo diseño "ticket de caja"** (elegido por el usuario a partir de un prototipo propio), que
  reemplaza la UI anterior. Sistema de diseño en `DESIGN.md` y como artifact de Design System.
- Dos columnas en escritorio: a la izquierda la edición (ciudad y hace cuánto se buscó), el titular,
  la bajada y el panel de controles con sombra dura; a la derecha el comprobante de rebajas con sello
  "−X% HOY", el destacado con el precio tachado en rojo y los renglones numerados. En celular, una columna.
- **Tipografía:** Bricolage Grotesque (titulares), Plus Jakarta Sans (texto), IBM Plex Mono (datos del
  ticket), alojadas en `web/fonts/` (OFL). Se sacó Rosario. Fracciones ¼ ½ ¾ en los nombres.
- Se adaptó lo que en el prototipo era de mentira: el titular cambia según la mejor rebaja real, la
  insignia muestra el estado real de la extensión y no hay selector de tipografías ni factores por ciudad.
- E2E: arranca con un perfil de Chrome limpio (antes podía tomar resultados guardados de otra corrida).
- **Descuento más claro (pensado para celular):** cada producto lleva su % en una etiqueta roja a la
  izquierda y el precio final a la derecha, con el anterior tachado debajo. Por heladería: nombre y una línea
  de datos (plataforma, demora, envío); se sacaron puntaje, distancia y dirección. Hasta 3 productos a la
  vista y el resto en "N descuentos más". Las que solo anuncian "hasta X%" van al final, en un grupo
  aparte. Los filtros pasaron al ticket. En celular el encabezado y el panel son más compactos.
- Análisis con la skill design-taste-frontend: contraste OK, sin desbordes a 320 px; se arreglaron
  botones y links chicos (44 px). Las reglas de sitio de marketing (una sección por pantalla, fotos,
  hero) no aplican a una herramienta.
- **Nueva dirección: teskel.online/cuartito** (el workflow publica en `cuartito/`; `helados/` queda
  con la última versión vieja). Extensión v0.8.0: el puente también corre en /cuartito.

## Hecho (rama `fase-2-uber-eats`, 2026-11-17)
- **Uber Eats** como tercera plataforma. Relevado con datos reales de Rosario en el navegador integrado:
  - Ubicación: parámetro `pl` de la URL (base64 de JSON con ciudad y coordenadas). Probado con Rosario y
    Córdoba (Uber acepta el centro de la ciudad sin ID de Google).
  - Búsqueda: `POST /_p/api/getSearchFeedV1` (categoría Ice Cream) → locales en dos formatos. Trae
    también supermercados y kioscos.
  - Menú: `POST /_p/api/getStoreV1` → categorías del local, abierto/cerrado, envío, demora y productos.
    Precio final en centavos; el anterior en `purchaseInfo` o, si falta, en el texto ("discounted from $ X").
  - Solo heladerías (por nombre o por categoría "Ice Cream"/"Helado"); descarta locales de otra ciudad
    (si Uber no está en la ciudad elegida, avisa "Uber Eats no está en X").
- La extensión abre Uber en la ventana minimizada (para que tome la ubicación) y hace las mismas llamadas
  que su web desde esa pestaña. Hasta 30 menús por búsqueda. Si Uber no contesta, muestra la ventana por
  si hay una verificación y espera a la persona (no se saltea nada).
- Página: filtro "Uber Eats" y su nombre en los renglones. Extensión **v0.9.0**.
- Normalizador: reconoce "Cassata" (con doble s).
- Tests: 36 unitarios (8 de Uber Eats con fixtures reales recortados) + e2e con un Uber Eats simulado
  (Grido con descuentos, supermercado filtrado, Córdoba "no está").
- **Falta probar con la extensión real** en la compu del usuario.

## Hecho (rama `fase-3-prototipos`, 2026-11-17)
- **4 prototipos de diseño** radicalmente distintos, que funcionan de verdad (misma `app.js`, mismos ids;
  la búsqueda, la extensión y la caché no cambian). La versión original queda intacta.
  - `/cuartito/prototipos/`: selector con las 4 direcciones y el original.
  - **Cotización** (editorial/suizo): página de mercados en papel salmón, cinta de cotizaciones
    (`tape.js` copia lo que ya dibujó app.js), pizarra como tabla de valores. Newsreader + IBM Plex Sans Condensed.
  - **Derretido** (experimental): Climate Crisis con su eje YEAR (la marca se derrite al cargar),
    franjas de gustos que chorrean. Martian Mono.
  - **Ofertón** (bold): carteles fluo con cinta sobre cartón, estrellas de oferta. Big Shoulders Display + Atkinson Hyperlegible.
  - **Nocciola** (lujo mínimo): la carta de una gelateria, Bodoni Moda en itálica + Jost, descuento en dorado.
- Cada prototipo tiene una barra arriba para pasar de uno a otro. Fuentes libres alojadas en
  `web/prototipos/fonts/` (licencias en `fonts/licencias/`).
- Los HTML se generan con `python scripts/build_prototipos.py` (editar ahí, no el HTML).
- E2E: abre los 4 prototipos, detectan la extensión, buscan y muestran resultados.
- El workflow publica `web/prototipos/` en `/cuartito/prototipos/`.
- **Segunda tanda, sin cajas** (al usuario no le gustó ninguna de las 4: "muy cuadrado, muchas boxes").
  Cada una con 3 paletas para elegir arriba (se guarda en el navegador):
  - **Vitrina**: la heladera de mostrador en dibujo isométrico (kit Anatomy, MIT, en `lib/iso-kit.mjs`).
    Cada pote se llena según el descuento, la pala va al que elegís (click, flechas o recorrido solo).
    Gloock + Geist Mono. Paletas Mármol / Noche / Pistacho.
  - **Cucurucho**: las heladerías apiladas como bochas SVG con chorreones sobre un barquillo; arriba la
    del descuento más grande. Tocás una bocha y abajo aparece el detalle. Instrument Serif + Hanken Grotesk.
    Paletas Cacao / Frutilla / Limón.
  - **Número**: una heladería por pantalla, el % gigante en Bagel Fat One es la composición y cuenta
    de 0 al entrar. DM Mono. Paletas Fruta / Papel / Neón.
  - Las tres leen lo que app.js dibuja en `#list` (que queda oculto) con `lib/datos.js`;
    `lib/comun.css` tiene los controles en versión texto suelto.
- **Mostrador** (pedido del usuario, 2026-11-17): mezcla de la heladera de Vitrina, la tipografía de
  Número (Bagel Fat One + DM Mono) y las paletas de Cucurucho (Cacao / Frutilla / Limón). El pote elegido
  pinta el % gigante (con contorno tipo sticker) y debajo están todos los potes como lista de % en color.
- E2E: abre los 8 prototipos; en los nuevos también chequea que el dibujo propio muestre los datos.

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
