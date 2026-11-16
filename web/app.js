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
      if (msg.type === "BUSY" || msg.running) {
        setBusy(true);
        progress._ = "Hay una búsqueda en curso (el avance aparece acá). Si quedó trabada, tocá Cancelar.";
        renderProgress();
      }
      break;
    case "DONE":
      setBusy(false);
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
  let done = false;
  try { done = localStorage.getItem("helados:pya-address") === "1"; } catch { /* nada */ }
  $("pya-setup").hidden = !extVersion || done;
  $("show-pya-setup").hidden = !extVersion || !done;
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

function render() {
  const all = Object.values(results);
  $("status").innerHTML = all.map((r) => `<span class="pill">${PLATFORM_NAMES[r.platform] || r.platform}:
    <b class="${esc(r.status)}">${esc(r.status)}</b> · ${esc(r.message)} · ${hora(r.capturedAt)}${r.fromCache ? " (caché)" : ""}</span>`).join("");

  const fPlat = $("f-platform").value;
  const onlyOpen = $("f-open").checked;
  const onlyDeals = $("f-deals").checked;
  const sort = $("f-sort").value;

  let stores = all.flatMap((r) => r.stores || []);
  $("filters").hidden = !stores.length;
  if (fPlat) stores = stores.filter((s) => s.platform === fPlat);
  if (onlyOpen) stores = stores.filter((s) => s.open !== false);
  if (onlyDeals) stores = stores.filter((s) => s.bestDiscountPct || s.freeShipping);
  stores.sort(sort === "perkg"
    ? (a, b) => (a.bestPricePerKg ?? Infinity) - (b.bestPricePerKg ?? Infinity)
    : (a, b) => (b.bestDiscountPct ?? 0) - (a.bestDiscountPct ?? 0) || (a.bestPricePerKg ?? Infinity) - (b.bestPricePerKg ?? Infinity));

  if (!stores.length) {
    $("list").innerHTML = `<p class="empty">${all.length ? "No hay heladerías con estos filtros." : "Apretá “Traer descuentos” para buscar."}</p>`;
    return;
  }
  $("list").innerHTML = stores.map(card).join("");
}

function card(s) {
  const fee = s.freeShipping ? "envío gratis" : s.deliveryFee != null ? `envío ${money(s.deliveryFee)}` : "";
  const meta = [
    s.open === false ? "cerrada" : null,
    s.rating ? `⭐ ${s.rating}` : null,
    s.eta, fee, s.address,
  ].filter(Boolean).map(esc).join(" · ");
  const tags = (s.promosParsed || []).map((p) =>
    `<span class="tag ${p.payment ? "pay" : ""}">${esc(p.text)}</span>`).join("");
  const sized = (s.products || []).filter((p) => p.sizeKg).sort((a, b) => b.sizeKg - a.sizeKg);
  const deals = (s.products || []).filter((p) => p.discountPct && !p.sizeKg);
  const rows = [...sized, ...deals].map((p) => `<tr>
      <td>${esc(p.name)}</td>
      <td class="num">${p.discountPct ? `<span class="strike">${money(p.originalPrice)}</span>` : ""}${money(p.price)}</td>
      <td class="num">${p.discountPct ? Math.round(p.discountPct) + "%" : ""}</td>
      <td class="num">${p.pricePerKg ? money(p.pricePerKg) : ""}</td></tr>`).join("");
  const name = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name);
  return `<article class="card ${s.open === false ? "closed" : ""}">
    <div>
      <div class="name">${name}<span class="plat ${esc(s.platform)}">${PLATFORM_NAMES[s.platform] || esc(s.platform)}</span></div>
      <div class="meta">${meta}</div>
    </div>
    <div class="big">
      ${s.bestDiscountPct ? `<div class="pct">${Math.round(s.bestDiscountPct)}% off</div>` : ""}
      ${s.bestPricePerKg ? `<div class="kg">kg desde <b>${money(s.bestPricePerKg)}</b></div>` : ""}
    </div>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    ${rows ? `<details><summary>Ver precios</summary><table>
      <tr><th>Producto</th><th class="num">Precio</th><th class="num">Desc.</th><th class="num">$/kg</th></tr>${rows}</table></details>` : ""}
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
$("show-pya-setup").addEventListener("click", () => setPyaDone(false));
$("force").addEventListener("click", () => fetchDeals(true));
for (const id of ["f-platform", "f-sort", "f-open", "f-deals"]) $(id).addEventListener("change", render);
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
