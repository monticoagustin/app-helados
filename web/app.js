// Página de teskel.online/helados. Habla con la extensión vía window.postMessage
// (la extensión inyecta un "puente" en esta página).
const $ = (id) => document.getElementById(id);
const PLATFORM_NAMES = { pedidosya: "PedidosYa", rappi: "Rappi" };
// Ciudades donde Rappi tiene la categoría Helados (relevadas 2026-11-16). PedidosYa usa la
// dirección que tengas cargada en PedidosYa.
const CITIES = [
  ["rosario", "Rosario"], ["buenos-aires", "Buenos Aires"], ["cordoba", "Córdoba"], ["mendoza", "Mendoza"],
  ["la-plata", "La Plata"], ["mar-del-plata", "Mar del Plata"], ["san-miguel-de-tucuman", "San Miguel de Tucumán"],
  ["salta", "Salta"], ["neuquen", "Neuquén"], ["parana", "Paraná"], ["bahia-blanca", "Bahía Blanca"],
  ["san-juan", "San Juan"], ["resistencia", "Resistencia"], ["san-luis", "San Luis"], ["rio-cuarto", "Río Cuarto"],
  ["san-rafael", "San Rafael"], ["santiago-del-estero", "Santiago del Estero"],
];
let results = {};            // platform -> resultado (de la ciudad elegida)
let city = loadCity();
const progress = {};         // platform -> último mensaje
let extVersion = null;
let pyaAddress = null;       // dirección que la extensión tiene guardada para PedidosYa
let busy = false;

// ------------------------------------------------------------ comunicación
const send = (type, extra = {}) => window.postMessage({ app: "helados", type, ...extra }, location.origin);

window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.app !== "helados-ext") return;
  const msg = e.data;
  switch (msg.type) {
    case "PONG":
      if (!extVersion) { extVersion = msg.version; onExtension(); }
      break;
    case "CACHED":
      if (msg.city !== city.slug) break;
      for (const r of msg.results) results[r.platform] = r;
      render();
      break;
    case "PROGRESS":
      delete progress._;
      progress[msg.platform] = msg.message;
      renderProgress();
      break;
    case "RESULT":
      if (msg.result.citySlug && msg.result.citySlug !== city.slug) break;
      results[msg.result.platform] = msg.result;
      delete progress[msg.result.platform];
      saveLocal();
      renderProgress();
      render();
      break;
    case "BUSY":
    case "STATUS":
      if (msg.type === "STATUS") { pyaAddress = msg.pyaAddress; renderSetup(); }
      if (msg.type === "BUSY" || msg.running) {
        setBusy(true);
        progress._ = "Hay una búsqueda en curso (el avance aparece acá). Si quedó trabada, tocá Cancelar.";
        renderProgress();
      }
      break;
    case "DONE":
      setBusy(false);
      send("STATUS");
      break;
    case "RAW":
      downloadRaw(msg.raw);
      break;
    case "ERROR":
      progress._ = `Error: ${msg.message}`;
      setBusy(false);
      renderProgress();
      break;
  }
});

function onExtension() {
  $("ext-badge").textContent = `Extensión conectada (versión ${extVersion})`;
  $("ext-badge").className = "ext-badge on";
  $("install").hidden = true;
  $("fetch").disabled = false;
  $("force").disabled = false;
  send("GET_CACHED", { city });
  send("STATUS");
  renderSetup();
}

function renderSetup() {
  let done = Boolean(pyaAddress);
  try { done = done || localStorage.getItem("helados:pya-address") === "1"; } catch { /* nada */ }
  $("pya-setup").hidden = !extVersion || done;
  $("show-pya-setup").hidden = !extVersion || !done;
  $("show-pya-setup").textContent = pyaAddress ? `PedidosYa busca cerca de ${pyaAddress}. Cambiar` : "Cambiar dirección de PedidosYa";
}
function setPyaDone(value) {
  try { localStorage.setItem("helados:pya-address", value ? "1" : "0"); } catch { /* nada */ }
  renderSetup();
}

function fetchDeals(force) {
  if (busy) return;
  setBusy(true);
  for (const k of Object.keys(progress)) delete progress[k];
  progress._ = "Buscando… tarda uno o dos minutos. Podés seguir en otra pestaña.";
  renderProgress();
  send("FETCH", { force, city, platforms: ["pedidosya", "rappi"] });
}

function setBusy(value) {
  busy = value;
  $("fetch").disabled = value || !extVersion;
  $("city").disabled = value;
  $("cancel").hidden = !value;
  $("force").disabled = value || !extVersion;
  $("fetch").textContent = value ? "Buscando…" : "Traer descuentos";
  if (!value) { delete progress._; renderProgress(); }
}

// ------------------------------------------------------------ guardado local
function saveLocal() {
  try { localStorage.setItem(`helados:results:${city.slug}`, JSON.stringify(results)); } catch { /* sin espacio o bloqueado */ }
}
function loadLocal() {
  try { results = JSON.parse(localStorage.getItem(`helados:results:${city.slug}`) || "{}"); } catch { results = {}; }
}
function loadCity() {
  let slug = "rosario";
  try { slug = localStorage.getItem("helados:city") || slug; } catch { /* nada */ }
  const found = CITIES.find(([s]) => s === slug) || CITIES[0];
  return { slug: found[0], name: found[1] };
}
function setCity(slug) {
  const found = CITIES.find(([s]) => s === slug) || CITIES[0];
  city = { slug: found[0], name: found[1] };
  try { localStorage.setItem("helados:city", city.slug); } catch { /* nada */ }
  loadLocal();
  render();
  if (extVersion) send("GET_CACHED", { city });
}

// ------------------------------------------------------------ render
const money = (n) => (n == null ? "" : "$" + Math.round(n).toLocaleString("es-AR"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hora = (iso) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
/** "PALETA AMERICANA CON OREO" → "Paleta americana con oreo": los nombres en mayúsculas gritan. */
const tame = (t) => (/[a-záéíóúñ]/.test(t) ? t : t.charAt(0) + t.slice(1).toLowerCase());

function renderProgress() {
  const lines = Object.entries(progress).map(([k, m]) => {
    const alert = /verificaci[oó]n|direcci[oó]n/i.test(m) && !/pasada|listo/i.test(m);
    const label = PLATFORM_NAMES[k] ? `<b>${PLATFORM_NAMES[k]}:</b> ` : "";
    return `<div class="${alert ? "alert" : ""}">${label}${esc(m)}</div>`;
  });
  $("progress").innerHTML = lines.join("");
  $("progress").hidden = !lines.length;
}

const isPlusPromo = (t) => /pedidosya plus/i.test(t);

/** Descuentos que cuentan según los filtros (sin Plus si se destilda). */
function view(s, withPlus) {
  const deals = (s.deals || (s.products || []).filter((p) => p.discountPct))
    .filter((p) => withPlus || !p.plusOnly)
    .sort((a, b) => b.discountPct - a.discountPct);
  // Si tenemos el detalle de productos, manda el mejor producto y se ocultan los "Hasta X%" del local.
  const hasDetail = (s.products || []).length > 0;
  const promos = (s.promosParsed || [])
    .filter((p) => withPlus || !isPlusPromo(p.text))
    .filter((p) => !(hasDetail && p.upTo));
  const promoPct = Math.max(0, ...promos.filter((p) => p.pct && !p.payment && !(p.upTo && hasDetail)).map((p) => p.pct));
  const best = Math.max(0, deals[0]?.discountPct || 0, promoPct);
  return { deals, promos, best, hasDetail };
}

const platformFilter = () => document.querySelector('input[name="plat"]:checked')?.value || "";
let lastTop = null;

function render() {
  const all = Object.values(results);
  $("status").innerHTML = all.map((r) => {
    const cls = r.status === "ok" ? "" : "error";
    return `<p class="${cls}" style="margin:0"><b>${PLATFORM_NAMES[r.platform] || esc(r.platform)}:</b> ${esc(r.message)}. `
      + `Actualizado el ${hora(r.capturedAt)}${r.fromCache ? ", guardado de antes" : ""}.</p>`;
  }).join("");

  const fPlat = platformFilter();
  const onlyOpen = $("f-open").checked;
  const withPlus = $("f-plus").checked;

  let rows = all.flatMap((r) => r.stores || []).map((s) => ({ s, ...view(s, withPlus) }));
  $("filters").hidden = !rows.length;
  if (fPlat) rows = rows.filter((r) => r.s.platform === fPlat);
  if (onlyOpen) rows = rows.filter((r) => r.s.open !== false);
  rows = rows.filter((r) => r.best > 0); // solo heladerías con descuento en helado
  rows.sort((a, b) => b.best - a.best);

  renderHero(rows);
  if (!rows.length) {
    $("list").innerHTML = `<p class="empty">${all.length
      ? "No hay heladerías con descuento con estos filtros. Probá con todas las plataformas o incluyendo las cerradas."
      : "Todavía no buscaste. Tocá “Traer descuentos” y en uno o dos minutos aparecen acá."}</p>`;
    return;
  }
  $("list").innerHTML = rows.map(shop).join("");
}

/** Portada: la mejor rebaja con producto, contada como el cartel de la vidriera. */
function renderHero(rows) {
  const hero = $("hero");
  const top = rows.find((r) => r.deals.length) || null;
  const key = top ? `${top.s.platform}:${top.s.id}:${top.deals[0].price}` : null;
  if (!top) {
    hero.classList.remove("is-new");
    hero.innerHTML = `<h1 class="hero-ask">¿Dónde está más barato el helado hoy en <span id="city-name">${esc(city.name)}</span>?</h1>`;
    return;
  }
  const d = top.deals[0];
  const others = rows.length - 1;
  hero.innerHTML = `
    <p class="hero-where"><b>${esc(top.s.name)}</b> tiene ${esc(lower(tame(d.name)))} en ${PLATFORM_NAMES[top.s.platform]}${d.plusOnly ? ", con PedidosYa Plus" : ""}:</p>
    <h1 class="hero-price"><span class="hero-before"><span class="sr">Antes </span>${money(d.originalPrice)}</span><span class="hero-now"><span class="sr">ahora </span>${money(d.price)}</span></h1>
    <p class="hero-note">Es la rebaja más grande de hoy en <span id="city-name">${esc(city.name)}</span>, ${Math.round(d.discountPct)}% menos.
      ${others > 0 ? `Abajo hay ${others} ${others === 1 ? "heladería más" : "heladerías más"} con descuento.` : ""}</p>`;
  if (key !== lastTop) {
    hero.classList.remove("is-new"); void hero.offsetWidth; hero.classList.add("is-new");
    const t = $("ticket"); t.classList.remove("is-printing"); void t.offsetWidth; t.classList.add("is-printing");
  }
  lastTop = key;
}

const lower = (t) => String(t).charAt(0).toLowerCase() + String(t).slice(1);

function shop({ s, deals, promos, best, hasDetail }) {
  // El envío va en la línea de datos (con sus condiciones), no repetido como etiqueta.
  const fs = promos.find((p) => p.freeShipping);
  promos = promos.filter((p) => p !== fs);
  const fee = (s.freeShipping || fs)
    ? `envío gratis${fs && isPlusPromo(fs.text) ? " con PedidosYa Plus" : ""}${fs?.minAmount ? ` desde ${money(fs.minAmount)}` : ""}`
    : s.deliveryFee != null ? `envío ${money(s.deliveryFee)}` : null;
  const meta = [
    `en ${PLATFORM_NAMES[s.platform] || s.platform}`,
    s.open === false ? "cerrada ahora" : null,
    s.eta, fee,
    s.distanceKm ? `a ${String(s.distanceKm).replace(".", ",")} km` : null,
    s.rating ? `puntaje ${String(s.rating).replace(".", ",")}` : null,
    s.address,
  ].filter(Boolean).map(esc).join(", ");
  const lines = deals.map((p) => `<li class="line">
      <span class="line-name">${esc(tame(p.name))}${p.plusOnly ? '<span class="plus">Plus</span>' : ""}</span>
      <span class="line-dots" aria-hidden="true"></span>
      <span class="line-before"><span class="sr">antes </span>${money(p.originalPrice)}</span>
      <span class="line-now"><span class="sr">ahora </span>${money(p.price)}</span>
      <span class="line-off">−${Math.round(p.discountPct)}%</span>
    </li>`).join("");
  const tags = promos.map((p) => `<li class="${p.payment || isPlusPromo(p.text) ? "pay" : ""}">${esc(p.text)}</li>`).join("");
  const name = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name);
  const upTo = !hasDetail && promos.some((p) => p.upTo);
  const noDetail = !lines && !hasDetail
    ? `<p class="nodetail">No pudimos ver qué productos tienen el descuento: miralos en ${PLATFORM_NAMES[s.platform] || s.platform}.</p>` : "";
  return `<article class="shop ${s.open === false ? "closed" : ""}">
    <header class="shop-head">
      <h2 class="shop-name">${name}</h2>
      <span class="shop-pct">${upTo ? "<small>hasta</small>" : ""}−${Math.round(best)}%</span>
    </header>
    <p class="shop-meta">${meta}</p>
    ${lines ? `<ul class="lines">${lines}</ul>` : noDetail}
    ${tags ? `<ul class="promos">${tags}</ul>` : ""}
  </article>`;
}

function downloadRaw(raw) {
  if (!raw) { alert("Todavía no hay datos de diagnóstico: hacé una búsqueda primero."); return; }
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `diagnostico-pedidosya-${Date.now()}.json` });
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------ arranque
$("city").innerHTML = CITIES.map(([s, n]) => `<option value="${s}">${n}</option>`).join("");
$("city").value = city.slug;
$("city").addEventListener("change", (e) => setCity(e.target.value));
$("fetch").addEventListener("click", () => fetchDeals(false));
$("cancel").addEventListener("click", () => send("CANCEL"));
$("open-pya").addEventListener("click", () => { send("OPEN_PYA"); setPyaDone(true); });
$("pya-done").addEventListener("click", () => setPyaDone(true));
$("show-pya-setup").addEventListener("click", () => { pyaAddress = null; setPyaDone(false); });
$("force").addEventListener("click", () => fetchDeals(true));
for (const id of ["f-open", "f-plus"]) $(id).addEventListener("change", render);
for (const r of document.querySelectorAll('input[name="plat"]')) r.addEventListener("change", render);
$("diag").addEventListener("click", (e) => {
  e.preventDefault();
  if (extVersion) send("GET_RAW"); else alert("Necesitás la extensión instalada.");
});

loadLocal();
render();
send("PING");
setTimeout(() => {
  if (extVersion) return;
  $("ext-badge").textContent = "Extensión no detectada";
  $("install").hidden = false;
}, 1200);
