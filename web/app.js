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
  $("ext-text").textContent = `EXTENSIÓN ${extVersion} ACTIVA`;
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
const tame = (t) => frac(/[a-záéíóúñ]/.test(t) ? t : t.charAt(0) + t.slice(1).toLowerCase());
/** "1/4 de helado" → "¼ de helado", como en la pizarra de la heladería. */
const frac = (t) => String(t).replace(/(^|[^\d/])([13])\/([24])(?![\d/])/g, (m, a, n, d) => a + ({ "1/4": "¼", "1/2": "½", "3/4": "¾" }[`${n}/${d}`] || `${n}/${d}`));

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
    return `<p class="${cls}"><b>${PLATFORM_NAMES[r.platform] || esc(r.platform)}:</b> ${esc(String(r.message).replace(/\.+$/, ""))}. `
      + `Actualizado el ${hora(r.capturedAt)}${r.fromCache ? ", guardado de antes" : ""}.</p>`;
  }).join("");
  $("city-name").textContent = city.name;
  $("city-upper").textContent = city.name.toLocaleUpperCase("es-AR");
  renderSync();

  const fPlat = platformFilter();
  const onlyOpen = $("f-open").checked;
  const withPlus = $("f-plus").checked;

  let rows = all.flatMap((r) => r.stores || []).map((s) => ({ s, ...view(s, withPlus) }));
  const withDiscount = rows.filter((r) => r.best > 0).length;
  if (fPlat) rows = rows.filter((r) => r.s.platform === fPlat);
  if (onlyOpen) rows = rows.filter((r) => r.s.open !== false);
  rows = rows.filter((r) => r.best > 0); // solo heladerías con descuento en helado
  rows.sort((a, b) => b.best - a.best);

  renderHero(rows, all.length > 0);
  $("total").textContent = withDiscount ? `HELADERÍAS VISIBLES: ${rows.length} DE ${withDiscount}` : "";
  if (!rows.length) {
    $("list").innerHTML = `<p class="empty">${all.length
      ? "No quedaron heladerías con esos filtros. Probá con “Todas” o desmarcando “Solo abiertas”."
      : "Todavía no buscaste. Tocá “Traer descuentos” y en uno o dos minutos aparecen acá."}</p>`;
    return;
  }
  $("list").innerHTML = rows.map(shop).join("");
}

/** "Edición Rosario • hace 3 min": cuándo se trajeron los datos que estás viendo. */
function renderSync() {
  const times = Object.values(results).map((r) => Date.parse(r.capturedAt)).filter(Boolean);
  if (!times.length) { $("last-sync").textContent = "sin buscar todavía"; return; }
  const min = Math.round((Date.now() - Math.max(...times)) / 60000);
  $("last-sync").textContent = min < 1 ? "recién" : min < 60 ? `hace ${min} min`
    : min < 24 * 60 ? `hace ${Math.round(min / 60)} h` : `del ${hora(new Date(Math.max(...times)).toISOString()).split(",")[0]}`;
}

/** Titular, bajada y destacado del ticket: la rebaja más grande con producto. */
function renderHero(rows, searched) {
  const hero = $("hero");
  const best = rows[0]?.best || 0;
  $("headline").textContent = best >= 50 ? "Helado a mitad de precio. Sin abrir diez apps."
    : best > 0 ? `Helado hasta ${Math.round(best)}% más barato. Sin abrir diez apps.`
    : "El helado más barato de hoy. Sin abrir diez apps.";
  $("stamp").hidden = !best;
  $("stamp").textContent = `−${Math.round(best)}% HOY`;

  const top = rows.find((r) => r.deals.length) || null;
  const key = top ? `${top.s.platform}:${top.s.id}:${top.deals[0].price}` : null;
  if (!top) {
    hero.innerHTML = "";
    $("lede").innerHTML = rows.length
      ? `Hay ${rows.length} ${rows.length === 1 ? "heladería" : "heladerías"} con descuento en ${esc(city.name)}, pero no pudimos ver a qué productos se aplica. Están en el ticket.`
      : searched
        ? "Con estos filtros no quedó ninguna heladería con descuento."
        : "Elegí tu ciudad y tocá <b>Traer descuentos</b>: buscamos en Rappi y PedidosYa desde tu Chrome y en uno o dos minutos aparecen en el ticket.";
    lastTop = null;
    return;
  }
  const d = top.deals[0];
  const others = rows.length - 1;
  const plat = PLATFORM_NAMES[top.s.platform];
  $("lede").innerHTML = `<b>${esc(top.s.name)}</b> tiene ${esc(lower(tame(d.name)))} a <b>${money(d.price)}</b> en ${plat}${d.plusOnly ? ", con PedidosYa Plus" : ""}. `
    + `Es la rebaja más grande de hoy en ${esc(city.name)}.`
    + (others > 0 ? ` Abajo tenés ${others} ${others === 1 ? "heladería más" : "heladerías más"} con descuento.` : "");
  hero.innerHTML = `<div class="feature">
      <div class="feature-top">
        <p class="feature-who" style="margin:0">${esc(top.s.name)} <span>tiene ${esc(lower(tame(d.name)))} en ${plat}:</span></p>
        ${top.s.eta ? `<span class="pill">${esc(top.s.eta)}</span>` : ""}
      </div>
      <p class="feature-prices">
        <span class="feature-before"><span class="sr">Antes </span>${money(d.originalPrice)}</span>
        <span class="feature-now"><span class="sr">ahora </span>${money(d.price)}</span>
      </p>
      <div class="feature-foot">
        <span>TE AHORRÁS ${money(d.originalPrice - d.price)}${d.plusOnly ? " CON PEDIDOSYA PLUS" : ""}</span>
        ${top.s.address ? `<span>${esc(top.s.address)}</span>` : ""}
      </div>
    </div>`;
  if (key !== lastTop) {
    hero.classList.remove("is-new"); void hero.offsetWidth; hero.classList.add("is-new");
    const t = $("ticket"); t.classList.remove("is-printing"); void t.offsetWidth; t.classList.add("is-printing");
  }
  lastTop = key;
}

const lower = (t) => String(t).charAt(0).toLowerCase() + String(t).slice(1);

function shop({ s, deals, promos, best, hasDetail }, i) {
  // El envío va en la línea de datos (con sus condiciones), no repetido como etiqueta.
  const fs = promos.find((p) => p.freeShipping);
  promos = promos.filter((p) => p !== fs);
  const fee = (s.freeShipping || fs)
    ? `envío gratis${fs && isPlusPromo(fs.text) ? " con PedidosYa Plus" : ""}${fs?.minAmount ? ` desde ${money(fs.minAmount)}` : ""}`
    : s.deliveryFee != null ? `envío ${money(s.deliveryFee)}` : null;
  const meta = [
    `en <b>${esc(PLATFORM_NAMES[s.platform] || s.platform)}</b>`,
    ...[s.eta, fee,
      s.distanceKm ? `a ${String(s.distanceKm).replace(".", ",")} km` : null,
      s.rating ? `★ ${String(s.rating).replace(".", ",")}` : null,
      s.address].filter(Boolean).map(esc),
  ].join(" · ");
  const lines = deals.map((p) => `<li class="line">
      <span class="line-name">${esc(tame(p.name))}${p.plusOnly ? '<span class="plus-tag">Plus</span>' : ""}</span>
      <span class="line-dots" aria-hidden="true"></span>
      <span class="line-prices">
        <span class="line-before"><span class="sr">antes </span>${money(p.originalPrice)}</span>
        <span class="line-now"><span class="sr">ahora </span>${money(p.price)}</span>
        <span class="line-off">−${Math.round(p.discountPct)}%</span>
      </span>
    </li>`).join("");
  const badges = promos.map((p) => {
    const cls = isPlusPromo(p.text) ? "plus" : p.payment ? "pay" : "";
    return `<li class="badge ${cls}">${esc(p.text)}</li>`;
  }).join("");
  const name = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name);
  const upTo = !hasDetail && promos.some((p) => p.upTo);
  const plat = PLATFORM_NAMES[s.platform] || s.platform;
  const body = lines
    ? `<ul class="lines">${lines}</ul>${badges ? `<ul class="badges">${badges}</ul>` : ""}`
    : !hasDetail
      ? `<div class="nodetail"><p>No pudimos ver qué productos tienen el descuento: miralos en ${esc(plat)}.</p>${badges ? `<ul class="badges">${badges}</ul>` : ""}</div>`
      : badges ? `<ul class="badges">${badges}</ul>` : "";
  return `<article class="shop ${s.open === false ? "closed" : ""}">
    <header class="shop-head">
      <div>
        <div class="shop-title">
          <span class="shop-num">${String(i + 1).padStart(2, "0")}.</span>
          <h3 class="shop-name">${name}</h3>
          ${s.open === false ? '<span class="closed-tag">Cerrada ahora</span>' : ""}
        </div>
        <p class="shop-meta">${meta}</p>
      </div>
      <p class="shop-pct" style="margin:0">${upTo ? "<small>hasta</small>" : ""}<span>−${Math.round(best)}%</span></p>
    </header>
    ${body}
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
setInterval(renderSync, 60000);
send("PING");
setTimeout(() => {
  if (extVersion) return;
  $("ext-text").textContent = "EXTENSIÓN NO DETECTADA";
  $("ext-badge").className = "ext-badge off";
  $("install").hidden = false;
}, 1200);
