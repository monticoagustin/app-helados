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

## Falta / próximos pasos
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
