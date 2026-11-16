# cuartito: sistema de diseño "ticket de caja"

Un comprobante de mostrador de heladería: papel blanco con bordes dentados sobre fondo crema,
datos en monoespaciada como una impresora térmica, titulares gruesos y sombras duras de cartel.
El rojo frutilla es **solo** para rebajas (precio nuevo, %, sello, tachado).
La versión navegable vive en el artifact de Design System "cuartito"; los valores reales están en
`web/styles.css` (`:root`).

## Color

| token | valor | uso |
| --- | --- | --- |
| `--crema` | #F6F3EB | fondo de la página, cajas dentro del ticket |
| `--papel` | #FFFFFF | ticket, panel de controles, insignias |
| `--tinta` | #1E120D | texto, bordes de 2 px y sombras duras |
| `--tinta-2` | #3D2B23 | bajada (texto largo) |
| `--tinta-3` | #5C453B | datos secundarios, rótulos |
| `--tinta-4` | #6E574D | rótulos del ticket, numeración, precio tachado grande |
| `--tinta-5` | #7A6359 | precio anterior en los renglones |
| `--frutilla` | #E61C3A | descuentos: precio nuevo, %, sello, tachado, foco |
| `--sambayon` | #FFD23F | activo / resaltado (Solo abiertas, avisos, "Radar de helado") |
| `--rosa` | #FF9EB5 | etiqueta de edición, Plus incluido |
| `--plus-fondo` / `--plus-tinta` | #E0E7FF / #1E1B4B | insignias de PedidosYa Plus |
| `--vivo` | #10B981 | punto de "extensión activa" |
| logo | #F29CB0, #FBC943, #633624 | los tres gustos del pote |

## Tipografía

- **Bricolage Grotesque 800** (700 en botones): titulares, nombres de heladerías, precios grandes,
  %. Tracking −0.025em, interlineado 0.98.
- **Plus Jakarta Sans 400/500/700**: texto corrido, controles.
- **IBM Plex Mono 400/700**, números tabulares: todo lo que "imprime" el ticket (rótulos,
  datos de envío, renglones de producto, totales, estado).
- Escala: titular clamp(44→64 px); precio destacado clamp(48→72); título del ticket 24→30;
  nombre de heladería 20→24; % 24→30; texto 16–18; datos 12–14.

## Forma

- Radios: 8 (sello, etiquetas), 12 (botones, campos), 16 (destacado), 24 (paneles), pill.
- Bordes: 2 px `--tinta` en todo lo tocable.
- Sombras duras sin desenfoque: 2 px (insignias, sello), 3 px (edición), 6 px (paneles).
  El ticket es lo único con sombra blanda (drop-shadow 0 14 24, 12 %).
- Separadores del ticket: 2 px rayados al 20–25 %; líderes de puntos entre producto y precio.

## Componentes

- **Insignia de extensión**: pill blanca, borde 2, sombra 2, mono mayúscula, punto verde que late.
- **Etiqueta de edición**: rosa, "EDICIÓN {CIUDAD} • HACE N MIN".
- **Panel**: blanco, borde 2, radio 24, sombra 6. Rótulos mono mayúscula. Botón principal negro
  que pasa a frutilla al hover. Plataforma como segmentado (activo negro). Filtros como chips con
  casilla (amarillo / rosa cuando están activos).
- **Ticket**: kicker "COMPROBANTE DE REBAJAS • CIUDAD", título "Mejor precio en mostrador",
  sello rojo rotado −2°, destacado crema con precio anterior mono tachado por una barra roja de
  4 px a −4° y precio nuevo gigante en frutilla.
- **Renglón**: número 01., nombre, datos mono separados por " · ", % a la derecha (con "HASTA"
  si no hay detalle), productos con líderes de puntos; caja crema con insignia si no se ven los productos.

## Movimiento

Solo dos momentos: el ticket "sale de la impresora" y se dibuja el tachado cuando cambia la mejor
rebaja. Se respeta `prefers-reduced-motion`.
