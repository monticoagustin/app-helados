# App Helados

Comparador de descuentos en heladerías de **Rosario** en **PedidosYa**, **Rappi** y **Uber Eats**.
Uso personal. Moneda: ARS.

- Página: **https://teskel.online/cuartito/**
- Estado y próximos pasos: [PROGRESS.md](PROGRESS.md)

## Cómo funciona

```
teskel.online/cuartito  ──(botón "Traer descuentos")──►  extensión en tu Chrome
                                                         ├─ Rappi: lee las páginas de la categoría Helados y de cada local
                                                         ├─ PedidosYa: abre una pestaña, lee lo que carga la web
                                                         └─ Uber Eats: abre su web con la ciudad y pide búsqueda y menús
                                                              └─ si pide verificación, la pestaña se muestra y la resolvés vos
       ◄────────── lista de heladerías con % de descuento efectivo y precio por kg
```

La búsqueda corre en tu navegador, con tu conexión (IP argentina). La página es estática
(no tiene servidor): se publica en el Space "teskel" de Spacefast.

## Instalar la extensión (una vez)

1. En https://teskel.online/cuartito/ tocá **Descargá la extensión** y descomprimí el .zip
   en una carpeta que no vayas a borrar.
2. Abrí `chrome://extensions`, activá **Modo de desarrollador**.
3. **Cargar descomprimida** → elegí la carpeta.
4. Recargá la página. Arriba a la derecha tiene que decir "Extensión conectada".

Para actualizarla: descargá el .zip nuevo, reemplazá la carpeta y tocá ↻ en `chrome://extensions`.

## Estructura

```
web/                 página (index.html, app.js, styles.css) → se publica en teskel.online/cuartito/
extension/           extensión de Chrome (Manifest V3)
  background.js        corre las búsquedas, caché de 20 min, ritmo lento con pausas
  bridge.js            puente entre la página y la extensión
  pya-capture.js       guarda el JSON que recibe PedidosYa (solo durante una búsqueda)
  lib/normalize.js     tamaños, $/kg y promos → % efectivo (2x1, 2da al 50%, etc.)
  lib/rappi.js         parser de Rappi (estructura real relevada)
  lib/pedidosya.js     parser de PedidosYa
  lib/ubereats.js      parser de Uber Eats (búsqueda y menús, formato real)
tests/               tests con node:test
scripts/e2e_extension.py   prueba de punta a punta con servidores simulados
```

## Tests

```bash
node --test                          # normalizador y parsers
python scripts/e2e_extension.py      # extensión + página (requiere playwright y Chrome)
```

## Publicación (GitHub → Spacefast)

Cada push a `main` corre los tests y la Action `.github/workflows/publicar-en-teskel.yml`
copia `web/` y `helados-extension.zip` a la carpeta `helados/` del Space teskel. Necesita el
secreto `SPACEFAST_TOKEN` en el repo. **Merge a main = publicar.**

## Sumar una plataforma

1. Parser en `extension/lib/<plataforma>.js` que devuelva heladerías con el formato de
   `summarizeStore` (ver `normalize.js`), con tests en `tests/`.
2. Función `fetch<Plataforma>` en `background.js` y agregarla a la lista de plataformas.
3. Permiso de host en `extension/manifest.json` y nombre en `PLATFORM_NAMES` de `web/app.js`.

## Reglas

- No se saltean captchas ni verificaciones: si aparecen, las resuelve la persona.
- Sin cuentas de usuario ni credenciales.
- Ritmo lento (pausas aleatorias), caché para no repetir pedidos, backoff si algo falla.
