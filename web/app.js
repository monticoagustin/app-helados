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
  $("ext-badge").textContent = `Extensión conectada · v${extVersion}`;
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
  $("show-pya-setup").textContent = pyaAddress ? `PedidosYa: ${pyaAddress} · cambiar` : "Cambiar dirección de PedidosYa";
}
function setPyaDone(value) {
  try { localStorage.setItem("helados:pya-address", value ? "1" : "0"); } catch { /* nada */ }
  renderSetup();
}

function fetchDeals(force) {
  if (busy) return;
  setBusy(true);
  for (const k of Object.keys(progress)) delete progress[k];
  progress._ = "Arrancando… (tarda 1–2 minutos; podés dejar esta pestaña abierta)";
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
  $("city-name").textContent = city.name;
  loadLocal();
  render();
  if (extVersion) send("GET_CACHED", { city });
}

// ------------------------------------------------------------ render
const money = (n) => (n == null ? "" : "$" + Math.round(n).toLocaleString("es-AR"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hora = (iso) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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

function render() {
  const all = Object.values(results);
  $("status").innerHTML = all.map((r) => `<span class="pill">${PLATFORM_NAMES[r.platform] || r.platform}:
    <b class="${esc(r.status)}">${esc(r.status)}</b> · ${esc(r.message)} · ${hora(r.capturedAt)}${r.fromCache ? " (caché)" : ""}</span>`).join("");

  const fPlat = $("f-platform").value;
  const onlyOpen = $("f-open").checked;
  const withPlus = $("f-plus").checked;

  let rows = all.flatMap((r) => r.stores || []).map((s) => ({ s, ...view(s, withPlus) }));
  $("filters").hidden = !rows.length;
  if (fPlat) rows = rows.filter((r) => r.s.platform === fPlat);
  if (onlyOpen) rows = rows.filter((r) => r.s.open !== false);
  rows = rows.filter((r) => r.best > 0); // solo heladerías con descuento en helado
  rows.sort((a, b) => b.best - a.best);

  if (!rows.length) {
    $("list").innerHTML = `<p class="empty">${all.length ? "No hay heladerías con descuento con estos filtros." : "Apretá “Traer descuentos” para buscar."}</p>`;
    return;
  }
  $("list").innerHTML = rows.map(card).join("");
}

function card({ s, deals, promos, best, hasDetail }) {
  const fee = s.freeShipping ? "envío gratis" : s.deliveryFee != null ? `envío ${money(s.deliveryFee)}` : "";
  const meta = [
    s.open === false ? "cerrada" : null,
    s.rating ? `⭐ ${s.rating}` : null,
    s.eta, fee, s.distanceKm ? `${s.distanceKm} km` : null, s.address,
  ].filter(Boolean).map(esc).join(" · ");
  const tags = promos.map((p) => `<span class="tag ${p.payment || isPlusPromo(p.text) ? "pay" : ""}">${esc(p.text)}</span>`).join("");
  const rows = deals.map((p) => `<tr>
      <td>${esc(p.name)}${p.plusOnly ? ' <span class="tag pay">Plus</span>' : ""}</td>
      <td class="num"><b>${money(p.price)}</b></td>
      <td class="num"><span class="strike">${money(p.originalPrice)}</span></td>
      <td class="num off">−${Math.round(p.discountPct)}%</td></tr>`).join("");
  const name = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name);
  const noDetail = !rows && !hasDetail
    ? `<p class="nodetail">No pudimos ver qué productos tienen el descuento: miralos en ${PLATFORM_NAMES[s.platform] || s.platform}.</p>` : "";
  return `<article class="card ${s.open === false ? "closed" : ""}">
    <div>
      <div class="name">${name}<span class="plat ${esc(s.platform)}">${PLATFORM_NAMES[s.platform] || esc(s.platform)}</span></div>
      <div class="meta">${meta}</div>
    </div>
    <div class="big"><div class="pct">${hasDetail || !promos.some((p) => p.upTo) ? "" : "hasta "}${Math.round(best)}% off</div></div>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    ${rows ? `<table class="deals"><tr><th>Producto en descuento</th><th class="num">Queda a</th><th class="num">Antes</th><th class="num"></th></tr>${rows}</table>` : noDetail}
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
$("city-name").textContent = city.name;
$("city").addEventListener("change", (e) => setCity(e.target.value));
$("fetch").addEventListener("click", () => fetchDeals(false));
$("cancel").addEventListener("click", () => send("CANCEL"));
$("open-pya").addEventListener("click", () => { send("OPEN_PYA"); setPyaDone(true); });
$("pya-done").addEventListener("click", () => setPyaDone(true));
$("show-pya-setup").addEventListener("click", () => { pyaAddress = null; setPyaDone(false); });
$("force").addEventListener("click", () => fetchDeals(true));
for (const id of ["f-platform", "f-open", "f-plus"]) $(id).addEventListener("change", render);
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
