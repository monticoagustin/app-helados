"""Arma los HTML de los 4 prototipos de diseño en web/prototipos/<slug>/index.html.

Todos usan el mismo app.js (la lógica no cambia): por eso cada página tiene los mismos ids
(#city, #fetch, #list, #hero, ...) y el mismo radio name="plat". Lo que cambia es el orden,
los envoltorios, el texto fijo y el CSS de cada carpeta.
    python scripts/build_prototipos.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "prototipos")

PROTOS = [
    ("cotizacion", "Cotización", "Editorial: el helado cotiza en papel salmón"),
    ("derretido", "Derretido", "Experimental: el precio se derrite"),
    ("oferton", "Ofertón", "Bold: cartel fluo de vidriera"),
    ("nocciola", "Nocciola", "Lujo mínimo: la carta de una gelateria"),
]

MARK = """<svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="#F6F3EB" stroke="#1E120D" stroke-width="4.5"/>
        <path d="M30.5 30.5H10C10 19.1782 19.1782 10 30.5 10V30.5Z" fill="#F29CB0"/>
        <path d="M30.5 33.5V54C19.1782 54 10 44.8218 10 33.5H30.5Z" fill="#FBC943"/>
        <path d="M33.5 33.5H54C54 44.8218 44.8218 54 33.5 54V33.5Z" fill="#633624"/>
        <path d="M34 30H53.5C53.2 19.3 44.7 10.8 34 10.5V30Z" fill="none" stroke="#1E120D" stroke-width="2.6" stroke-dasharray="4.2 3.2" stroke-linejoin="round"/>
      </svg>"""

EXT = """<p id="ext-badge" class="ext-badge"><span class="ext-dot" aria-hidden="true"></span><span id="ext-text">BUSCANDO<span class="ext-word"> LA EXTENSIÓN</span>…</span></p>"""

INSTALL = """<section id="install" class="note" hidden>
        <h2>Primero, instalá la extensión</h2>
        <p>La búsqueda corre en tu Chrome, con tu conexión: así Rappi, PedidosYa y Uber Eats te muestran lo de tu ciudad,
          y si piden una verificación la resolvés vos con un click.</p>
        <ol>
          <li><a href="../../helados-extension.zip" download>Descargá la extensión</a> y descomprimí el .zip en una carpeta que no vayas a borrar.</li>
          <li>Abrí <code>chrome://extensions</code> y activá el modo de desarrollador, arriba a la derecha.</li>
          <li>Tocá <b>Cargar descomprimida</b> y elegí esa carpeta.</li>
          <li>Volvé acá y recargá la página.</li>
        </ol>
      </section>"""

PYA = """<section id="pya-setup" class="note" hidden>
        <h2>Una sola vez: tu dirección en PedidosYa</h2>
        <p>PedidosYa necesita saber dónde estás. Se abre en una pestaña: cargá tu dirección hasta que veas la lista de locales y volvé.</p>
        <div class="note-actions">
          <button id="open-pya" class="btn" type="button">Abrir PedidosYa</button>
          <button id="pya-done" class="link" type="button">Ya la cargué</button>
        </div>
      </section>"""

def panel(label):
    return f"""<section class="panel" aria-label="Buscar descuentos">
        <label class="label" for="city">{label}</label>
        <div class="search-row">
          <select id="city"></select>
          <button id="fetch" class="btn" type="button" disabled>Traer descuentos</button>
        </div>
        <button id="cancel" class="btn btn-ghost" type="button" hidden>Cancelar búsqueda</button>
        <section id="progress" class="progress" hidden aria-live="polite"></section>
        <div class="panel-links">
          <button id="force" class="link" type="button" disabled>Buscar de nuevo, sin lo guardado</button>
          <button id="show-pya-setup" class="link" type="button" hidden>Cambiar dirección de PedidosYa</button>
        </div>
      </section>"""

FILTERS = """<div id="filters" class="filters" aria-label="Filtros">
          <fieldset class="seg">
            <legend class="sr">Plataforma</legend>
            <div class="seg-box">
              <label><input type="radio" name="plat" value="" checked><span>Todas</span></label>
              <label><input type="radio" name="plat" value="rappi"><span>Rappi</span></label>
              <label><input type="radio" name="plat" value="pedidosya"><span>PedidosYa</span></label>
              <label><input type="radio" name="plat" value="ubereats"><span>Uber Eats</span></label>
            </div>
          </fieldset>
          <div class="chips">
            <label class="chip"><input type="checkbox" id="f-open" checked><span class="box" aria-hidden="true"></span>Solo abiertas</label>
            <label class="chip"><input type="checkbox" id="f-plus" checked><span class="box" aria-hidden="true"></span>Con Plus<span class="sr"> de PedidosYa</span></label>
          </div>
        </div>"""

STATUS = """<div id="status" class="status"></div>
          <p class="total"><span id="total"></span></p>"""

DIAG = """<p class="fineprint">Los descuentos con bancos o billeteras se muestran, pero no cuentan para ordenar.
        <a href="#" id="diag">Descargar diagnóstico de PedidosYa</a></p>"""

def switcher(current):
    items = ['<a href="../../">Principal</a>', '<a href="../ticket/">Ticket</a>'] + [
        f'<a href="../{s}/"{" aria-current=\"page\"" if s == current else ""}>{n}</a>' for s, n, _ in PROTOS]
    return f"""<nav class="proto-switch" aria-label="Prototipos de diseño">
  <a class="proto-all" href="../">Prototipos</a>{"".join(items)}
</nav>"""

def head(slug, title, theme, preload):
    pre = "\n".join(f'  <link rel="preload" href="../fonts/{f}" as="font" type="font/woff2" crossorigin>' for f in preload)
    return f"""<!doctype html>
<html lang="es" data-proto="{slug}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>cuartito · {title} (prototipo)</title>
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="{theme}">
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml">
{pre}
  <link rel="stylesheet" href="../switch.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
{switcher(slug)}
"""

TAIL = """<script type="module" src="../../app.js"></script>
</body>
</html>
"""

PAGES = {}

# ------------------------------------------------------------------ 1. Cotización
PAGES["cotizacion"] = head("cotizacion", "Cotización", "#F1D3C2", [
    "newsreader-latin-800-normal.woff2", "ibm-plex-sans-condensed-latin-400-normal.woff2"]) + f"""<main class="paper">
  <header class="masthead">
    <div class="mast-top">
      <a class="brand" href="../../" aria-label="cuartito, versión original">{MARK}<span>cuartito</span></a>
      {EXT}
    </div>
    <p class="mast-title" aria-hidden="true">Cotización del helado</p>
    <p class="dateline"><span>Mercado de <span id="city-name">Rosario</span></span><span>Cierre: <span id="last-sync">sin buscar todavía</span></span><span>Rappi · PedidosYa · Uber Eats</span></p>
  </header>
  <div class="tape" aria-hidden="true"><div class="tape-track" id="tape"><span>Tocá “Traer descuentos” para ver la pizarra del día</span></div></div>

  <div class="grid">
    <article class="lead">
      <p class="kicker">Tapa</p>
      <h1 id="headline" class="headline">El helado más barato de hoy. Sin abrir diez apps.</h1>
      <p class="lede" id="lede" aria-live="polite"></p>
      <div id="hero" aria-live="polite"></div>
    </article>

    <aside class="desk">
      <p class="kicker">Consultá</p>
      {INSTALL}
      {PYA}
      {panel("Plaza")}
      <p class="kicker">Filtrar la pizarra</p>
      {FILTERS}
    </aside>

    <section class="board" id="ticket" aria-label="Descuentos encontrados">
      <header class="board-head">
        <h2>Pizarra completa · <span id="city-upper">ROSARIO</span></h2>
        <p class="stamp" id="stamp" hidden></p>
      </header>
      <div class="board-cols" aria-hidden="true"><span>Heladería</span><span class="bc-r"><span>Var.</span><span>Producto</span><span>Ahora · antes</span></span></div>
      <div id="list" class="list"></div>
      <footer class="board-foot">
          {STATUS}
      </footer>
    </section>
  </div>
  <footer class="colophon">
    {DIAG}
    <p>Cotizaciones tomadas de las webs de cada plataforma en tu Chrome. Los precios pueden cambiar en el local.</p>
  </footer>
</main>
<script src="tape.js" defer></script>
""" + TAIL

# ------------------------------------------------------------------ 2. Derretido
PAGES["derretido"] = head("derretido", "Derretido", "#FF5470", [
    "climate-crisis-latin-year-normal.woff2", "martian-mono-latin-400-normal.woff2"]) + f"""<header class="melt-top">
  <a class="brand" href="../../" aria-label="cuartito, versión original">{MARK}</a>
  {EXT}
</header>
<main>
  <section class="drip">
    <p class="giant" aria-hidden="true">cuar<br>tito</p>
    <div class="drip-copy">
      <p class="edition"><span id="city-name">Rosario</span> · <span id="last-sync">sin buscar todavía</span></p>
      <h1 id="headline" class="headline">El helado más barato de hoy. Sin abrir diez apps.</h1>
      <p class="lede" id="lede" aria-live="polite"></p>
    </div>
  </section>

  <section class="controls">
    {INSTALL}
    {PYA}
    {panel("¿En qué ciudad hace calor?")}
  </section>

  <section class="scoops" id="ticket" aria-label="Descuentos encontrados">
    <header class="scoops-head">
      <h2>Lo que se está derritiendo en <span id="city-upper">ROSARIO</span></h2>
      <p class="stamp" id="stamp" hidden></p>
    </header>
    {FILTERS}
    <div id="hero" aria-live="polite"></div>
    <div id="list" class="list"></div>
    <footer class="scoops-foot">
      {STATUS}
    </footer>
  </section>
</main>
<footer class="melt-foot">
  {DIAG}
</footer>
""" + TAIL

# ------------------------------------------------------------------ 3. Ofertón
PAGES["oferton"] = head("oferton", "Ofertón", "#111111", [
    "big-shoulders-display-latin-900-normal.woff2", "atkinson-hyperlegible-latin-400-normal.woff2"]) + f"""<header class="bar">
  <a class="brand" href="../../" aria-label="cuartito, versión original">{MARK}<span>cuartito</span></a>
  <p class="bar-city">Ofertas de helado en <span id="city-name">Rosario</span></p>
  {EXT}
</header>
<main>
  <section class="window">
    <div class="poster poster-main">
      <p class="poster-tag">Hoy · <span id="last-sync">sin buscar todavía</span></p>
      <h1 id="headline" class="headline">El helado más barato de hoy. Sin abrir diez apps.</h1>
      <p class="lede" id="lede" aria-live="polite"></p>
    </div>
    <div class="poster poster-form">
      {INSTALL}
      {PYA}
      {panel("Elegí tu ciudad")}
    </div>
    <div id="hero" class="window-hero" aria-live="polite"></div>
  </section>

  <section class="wall" id="ticket" aria-label="Descuentos encontrados">
    <header class="wall-head">
      <h2>Ofertón en <span id="city-upper">ROSARIO</span></h2>
      <p class="stamp" id="stamp" hidden></p>
      {FILTERS}
    </header>
    <div id="list" class="list"></div>
    <footer class="wall-foot">
      {STATUS}
    </footer>
  </section>
</main>
<footer class="bottom">
  {DIAG}
</footer>
""" + TAIL

# ------------------------------------------------------------------ 4. Nocciola
PAGES["nocciola"] = head("nocciola", "Nocciola", "#231B16", [
    "bodoni-moda-latin-400-italic.woff2", "jost-latin-400-normal.woff2"]) + f"""<div class="carte">
  <aside class="spine">
    <a class="brand" href="../../" aria-label="cuartito, versión original">{MARK}<span>cuartito</span></a>
    <p class="spine-note">Carta de rebajas<br>de helado</p>
    {EXT}
  </aside>
  <main class="page">
    <div class="opening">
    <header class="intro">
      <p class="edition"><span id="city-name">Rosario</span>, <span id="last-sync">sin buscar todavía</span></p>
      <h1 id="headline" class="headline">El helado más barato de hoy. Sin abrir diez apps.</h1>
      <p class="lede" id="lede" aria-live="polite"></p>
    </header>

    <section class="service">
      {INSTALL}
      {PYA}
      {panel("Ciudad")}
    </section>
    <aside class="house" aria-label="Recomendación de la casa">
      <div id="hero" aria-live="polite"></div>
    </aside>
    </div>

    <section class="menu" id="ticket" aria-label="Descuentos encontrados">
      <header class="menu-head">
        <h2>La carta de hoy en <span id="city-upper">ROSARIO</span></h2>
        <p class="stamp" id="stamp" hidden></p>
      </header>
      {FILTERS}
      <div id="list" class="list"></div>
      <footer class="menu-foot">
        {STATUS}
      </footer>
    </section>
    <footer class="colophon">{DIAG}</footer>
  </main>
</div>
""" + TAIL

# ================================================================== segunda tanda: sin cajas
PROTOS2 = [
    ("vitrina", "Vitrina", "La heladera vista desde arriba: el helado sube según el descuento"),
    ("cucurucho", "Cucurucho", "Los descuentos apilados como bochas"),
    ("numero", "Número", "El porcentaje gigante es la página"),
    ("mostrador", "Mostrador", "Mezcla: la heladera de Vitrina con la tipografía de Número"),
    ("cartel", "Cartel", "Monumento + Vidriera: el % gigante detrás de la heladera, paleta atardecer"),
]

def switcher2(current):
    items = ['<a href="../../">Principal</a>', '<a href="../ticket/">Ticket</a>'] + [
        f'<a href="../{s}/"{" aria-current=\"page\"" if s == current else ""}>{n}</a>' for s, n, _ in PROTOS2]
    return f"""<nav class="proto-switch" aria-label="Prototipos de diseño">
  <a class="proto-all" href="../">Prototipos</a>{"".join(items)}
</nav>"""

def frase(label):
    return f"""<section class="panel" aria-label="Buscar descuentos">
        <p class="frase"><label for="city">{label}</label> <select id="city"></select>
          <button id="fetch" class="btn" type="button" disabled>Traer descuentos</button></p>
        <button id="cancel" class="link" type="button" hidden>Cancelar búsqueda</button>
        <section id="progress" class="progress" hidden aria-live="polite"></section>
        <p class="panel-links">
          <button id="force" class="link" type="button" disabled>Buscar de nuevo, sin lo guardado</button>
          <button id="show-pya-setup" class="link" type="button" hidden>Cambiar dirección de PedidosYa</button>
        </p>
      </section>"""

OCULTO = """<div class="app-oculta">
    <p id="stamp" hidden></p><span id="city-upper" hidden></span>
    <div id="hero" hidden></div>
    <h2 class="sr">Lista completa de descuentos</h2>
    <div id="list" class="sr"></div>
  </div>"""

def paletas(opts):
    return '<div class="paletas" role="group" aria-label="Paleta de colores">' + "".join(
        f'<button type="button" data-set-paleta="{v}" aria-pressed="false"><span class="sw" aria-hidden="true"></span>{n}</button>' for v, n in opts) + "</div>"

def head2(slug, title, theme, preload):
    return head(slug, title, theme, preload).replace(switcher(slug), switcher2(slug))

STATUS2 = """<footer class="estado">
      <div id="status" class="status"></div>
      <p class="total"><span id="total"></span></p>
      <p class="fineprint">Los descuentos con bancos o billeteras se muestran, pero no cuentan para ordenar.
        <a href="#" id="diag">Descargar diagnóstico de PedidosYa</a></p>
    </footer>"""

PAGES["vitrina"] = head2("vitrina", "Vitrina", "#EEF0EC", ["gloock-latin-400-normal.woff2", "geist-mono-latin-400-normal.woff2"]).replace("<body>", '<body class="iso" data-theme="light">') + f"""<header class="top">
  <a class="brand" href="../../" aria-label="cuartito, versión original">{MARK}<span>cuartito</span></a>
  {paletas([("marmol", "Mármol"), ("noche", "Noche"), ("pistacho", "Pistacho")])}
  {EXT}
</header>
<main class="sala">
  <section class="intro">
    <p class="edition"><span id="city-name">Rosario</span> · <span id="last-sync">sin buscar todavía</span></p>
    <h1 id="headline" class="headline">El helado más barato de hoy. Sin abrir diez apps.</h1>
    <p class="lede" id="lede" aria-live="polite"></p>
    {INSTALL}
    {PYA}
    {frase("Heladerías de")}
  </section>

  <section id="ticket" class="escena" aria-label="Vitrina de descuentos">
    <div class="vitrina-wrap">
      <div class="iso-stage" id="vitrina" tabindex="0" role="group" aria-label="Vitrina: con las flechas pasás de un pote a otro"></div>
      <p class="lectura" data-readout aria-live="polite"></p>
    </div>
    <div class="lado">
      <article id="detalle" class="detalle" aria-live="polite"></article>
      <ol id="indice" class="indice" aria-label="Potes de la vitrina"></ol>
      {FILTERS}
    </div>
  </section>
  {STATUS2}
  {OCULTO}
</main>
<script type="module" src="vitrina.js"></script>
""" + TAIL

def top2(opts):
    return f"""<header class="top">
  <a class="brand" href="../../" aria-label="cuartito, versión original">{MARK}<span>cuartito</span></a>
  {paletas(opts)}
  {EXT}
</header>"""

INTRO2 = lambda titulo, label: f"""<section class="intro">
    <p class="edition"><span id="city-name">Rosario</span> · <span id="last-sync">sin buscar todavía</span></p>
    <h1 id="headline" class="headline">{titulo}</h1>
    <p class="lede" id="lede" aria-live="polite"></p>
    {INSTALL}
    {PYA}
    {frase(label)}
  </section>"""

# ------------------------------------------------------------------ Cucurucho
PAGES["cucurucho"] = head2("cucurucho", "Cucurucho", "#2B1B15", ["instrument-serif-latin-400-italic.woff2", "hanken-grotesk-latin-400-normal.woff2"]).replace(
    '<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="../lib/comun.css">\n  <link rel="stylesheet" href="styles.css">') + f"""{top2([("cacao", "Cacao"), ("frutilla", "Frutilla"), ("limon", "Limón")])}
<main class="sala">
  {INTRO2("El helado más barato de hoy, apilado.", "Bochas de")}
  <section id="ticket" class="torre" aria-label="Descuentos apilados como bochas: arriba el más grande">
    <div class="pila">
    <ol id="bochas" class="bochas" aria-label="Bochas: con las flechas pasás de una a otra"></ol>
    <div class="cono" aria-hidden="true"><svg viewBox="0 0 200 260" preserveAspectRatio="none"><defs><pattern id="waffle" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H22M0 0V22" stroke="var(--cono-linea)" stroke-width="3"/></pattern></defs><path d="M6 0H194L106 254Q100 262 94 254Z" fill="var(--cono)"/><path d="M6 0H194L106 254Q100 262 94 254Z" fill="url(#waffle)"/><path d="M6 0H194L190 12H10Z" fill="var(--cono-linea)" opacity=".5"/></svg></div>
    </div>
    <div id="sueltos" class="sueltos"></div>
    {FILTERS}
  </section>
  {STATUS2}
  {OCULTO}
</main>
<script type="module" src="cucurucho.js"></script>
""" + TAIL

# ------------------------------------------------------------------ Número
PAGES["numero"] = head2("numero", "Número", "#FF6F91", ["bagel-fat-one-latin-400-normal.woff2", "dm-mono-latin-400-normal.woff2"]).replace(
    '<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="../lib/comun.css">\n  <link rel="stylesheet" href="styles.css">') + f"""{top2([("fruta", "Fruta"), ("papel", "Papel"), ("neon", "Neón")])}
<main class="sala">
  {INTRO2("Cuánto te ahorrás hoy, en un solo número.", "Heladerías de")}
  <section id="ticket" class="numeros" aria-label="Un descuento por pantalla, del más grande al más chico"></section>
  <section class="cierre">
    <div id="sueltos" class="sueltos"></div>
    {FILTERS}
    {STATUS2}
  </section>
  {OCULTO}
</main>
<script type="module" src="numero.js"></script>
""" + TAIL

# ------------------------------------------------------------------ Mostrador (Vitrina + Número + paletas de Cucurucho)
PAGES["mostrador"] = head2("mostrador", "Mostrador", "#F9D9DF", ["bricolage-grotesque-latin-800-normal.woff2", "bricolage-grotesque-latin-500-normal.woff2"]).replace(
    '<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="../lib/comun.css">\n  <link rel="stylesheet" href="styles.css">').replace(
    '<html lang="es" data-proto="mostrador">', '<html lang="es" data-proto="mostrador" data-paleta="frutilla" data-layout="podio">').replace(
    "<body>", '<body class="iso" data-theme="light">') + f"""<header class="top">
  <a class="brand" href="../../" aria-label="cuartito, versión original">{MARK}<span>cuartito</span></a>
  <div class="disenos" role="group" aria-label="Probar diseño">
    <span class="disenos-t">Diseño:</span>
    <button type="button" data-set-layout="podio" aria-pressed="true">Podio</button>
    <button type="button" data-set-layout="grilla" aria-pressed="false">Grilla</button>
    <button type="button" data-set-layout="foco" aria-pressed="false">Foco</button>
    <button type="button" class="otro-lema" data-otro-lema>Otro lema ↻</button>
  </div>
  {EXT}
</header>
<main class="sala">
  <section class="hero">
    <div class="intro">
      <p class="edition"><span id="city-name">Rosario</span> · <span id="last-sync">sin buscar todavía</span></p>
      <h1 class="headline lema" data-lema>¿Cansad@ de que te cobren el envío más caro que el cuarto?</h1>
      <p class="bajada"><a href="https://github.com/monticoagustin/app-helados" target="_blank" rel="noopener">Código abierto</a>. 0% humo corporativo.</p>
      <p class="lede" id="lede" aria-live="polite"></p>
      {INSTALL}
      {PYA}
      <section class="panel" aria-label="Buscar descuentos">
        <label class="ciudad-l" for="city">Ciudad</label>
        <div class="buscar">
          <select id="city"></select>
          <button id="fetch" class="btn-solido" type="button" disabled>Traer descuentos</button>
        </div>
        <button id="cancel" class="link" type="button" hidden>Cancelar búsqueda</button>
        <section id="progress" class="progress" hidden aria-live="polite"></section>
        <p class="panel-links">
          <button id="force" class="link" type="button" disabled>Buscar de nuevo, sin lo guardado</button>
          <button id="show-pya-setup" class="link" type="button" hidden>Cambiar dirección de PedidosYa</button>
        </p>
      </section>
    </div>
    <div class="vitrina-wrap">
      <div class="iso-stage" id="vitrina" tabindex="0" role="group" aria-label="Heladera: cada pote es una heladería; con las flechas pasás de uno a otro"></div>
      <p class="leyenda">Cada pote es una heladería: más lleno, más descuento.</p>
    </div>
  </section>
  <section id="ticket" class="resultados" aria-label="Descuentos de hoy" aria-live="polite"></section>
  {FILTERS}
  <footer class="estado">
    <div id="status" class="status"></div>
    <p class="total"><span id="total"></span></p>
  </footer>
  {OCULTO}
  <div hidden><p id="headline"></p><a href="#" id="diag">Diagnóstico</a></div>
</main>
<script type="module" src="mostrador.js"></script>
""" + TAIL

# ------------------------------------------------------------------ Cartel (Monumento + Vidriera, paleta atardecer, Anton)
PAGES["cartel"] = head2("cartel", "Cartel", "#F9F4E6", ["anton-latin-400-normal.woff2", "bricolage-grotesque-latin-500-normal.woff2"]).replace(
    '<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="../lib/comun.css">\n  <link rel="stylesheet" href="styles.css">').replace(
    "<body>", '<body class="iso" data-theme="light">') + f"""<header class="top">
  <a class="brand" href="../../" aria-label="cuartito, versión original">{MARK}<span>cuartito</span></a>
  {EXT}
</header>
<main class="sala">
  <section class="hero">
    <div class="intro">
      <p class="edition"><span id="city-name">Rosario</span> · <span id="last-sync">sin buscar todavía</span></p>
      <h1 class="lema">El helado no se negocia. <span class="si">El precio, sí.</span></h1>
      <p class="bajada">Comparamos Rappi, PedidosYa y Uber Eats en tu ciudad. <a href="https://github.com/monticoagustin/app-helados" target="_blank" rel="noopener">Código abierto</a>, 0% humo corporativo.</p>
      <p class="lede" id="lede" aria-live="polite"></p>
      {INSTALL}
      {PYA}
      <section class="panel" aria-label="Buscar descuentos">
        <div class="buscar">
          <button id="fetch" class="btn-solido" type="button" disabled>Traer descuentos</button>
          <label class="sr" for="city">Ciudad</label>
          <select id="city"></select>
        </div>
        <button id="cancel" class="link" type="button" hidden>Cancelar búsqueda</button>
        <section id="progress" class="progress" hidden aria-live="polite"></section>
        <p class="panel-links">
          <button id="force" class="link" type="button" disabled>Buscar de nuevo, sin lo guardado</button>
          <button id="show-pya-setup" class="link" type="button" hidden>Cambiar dirección de PedidosYa</button>
        </p>
      </section>
    </div>
    <div class="vitrina-wrap">
      <div class="forma" aria-hidden="true"><p class="gigante" data-gigante>−50%</p></div>
      <div class="iso-stage" id="vitrina" tabindex="0" role="group" aria-label="Heladera: cada pote es una heladería; con las flechas pasás de uno a otro"></div>
      <p class="leyenda">Cada pote es una heladería: más lleno, más descuento.</p>
    </div>
    <aside id="mejor" class="mejor" aria-live="polite"></aside>
  </section>
  <section id="ticket" class="resultados" aria-label="Descuentos de hoy" aria-live="polite"></section>
  {FILTERS}
  <footer class="estado">
    <div id="status" class="status"></div>
    <p class="total"><span id="total"></span></p>
  </footer>
  {OCULTO}
  <div hidden><p id="headline"></p><a href="#" id="diag">Diagnóstico</a></div>
</main>
<script type="module" src="cartel.js"></script>
""" + TAIL

for slug, html in PAGES.items():
    d = os.path.join(OUT, slug)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w") as f:
        f.write(html)
    print("ok", slug)

# ================================================================== página principal = Cartel
# Desde 2026-11-17 el diseño principal es Cartel. Se arma con los mismos archivos del prototipo,
# con las rutas de la raíz de web/. Editar el prototipo (cartel/) y volver a correr este script.
import re, shutil
WEB = os.path.join(ROOT, "web")
main = PAGES["cartel"]
main = re.sub(r'<nav class="proto-switch".*?</nav>\n', "", main, flags=re.S)
main = main.replace('<html lang="es" data-proto="cartel">', '<html lang="es">')
main = main.replace("<title>cuartito · Cartel (prototipo)</title>", "<title>cuartito · rebajas de helado</title>")
main = main.replace('  <link rel="stylesheet" href="../switch.css">\n', "")
main = main.replace('<meta name="theme-color"', '<script>if (/\\/(cuartito|helados)$/.test(location.pathname)) location.replace(location.pathname + "/" + location.search);</script>\n  <meta name="theme-color"')
for a, b in [('href="../../favicon.svg"', 'href="favicon.svg"'), ('href="../fonts/', 'href="fonts/'), ('href="../lib/', 'href="lib/'),
             ('href="../../helados-extension.zip"', 'href="helados-extension.zip"'), ('<a class="brand" href="../../"', '<a class="brand" href="./"'),
             ('src="../../app.js"', 'src="app.js"'), ('aria-label="cuartito, versión original"', 'aria-label="cuartito, inicio"')]:
    main = main.replace(a, b)
assert "../" not in main, re.findall(r'"[^"]*\.\./[^"]*"', main)
open(os.path.join(WEB, "index.html"), "w").write(main)
# estilos: la base común de los prototipos (sin la barra de prototipos) + los de Cartel
base = open(os.path.join(OUT, "switch.css")).read().split("/* ---- selector de prototipos")[0]
css = open(os.path.join(OUT, "cartel", "styles.css")).read().replace('url("../fonts/', 'url("fonts/')
open(os.path.join(WEB, "styles.css"), "w").write("/* Generado por scripts/build_prototipos.py desde prototipos/cartel: no editar acá. */\n" + base + css)
js = open(os.path.join(OUT, "cartel", "cartel.js")).read().replace('"../lib/', '"./lib/')
open(os.path.join(WEB, "cartel.js"), "w").write(js)
os.makedirs(os.path.join(WEB, "lib"), exist_ok=True)
for f in ("iso-kit.mjs", "iso-kit-LICENSE.txt", "datos.js", "comun.css"):
    shutil.copyfile(os.path.join(OUT, "lib", f), os.path.join(WEB, "lib", f))
for f in ("anton-latin-400-normal.woff2", "bricolage-grotesque-latin-500-normal.woff2"):
    shutil.copyfile(os.path.join(OUT, "fonts", f), os.path.join(WEB, "fonts", f))
print("ok principal (Cartel)")
