// Service worker de la extensión: corre las búsquedas cuando la página lo pide.
import { mergeStore, parseCategoryPage, parseStorePage, RAPPI_BASE, StructureChanged } from "./lib/rappi.js";
import {
  HELADOS_CATEGORY_ID, isBotBlock, isChallengePage, menuPartnerId, parseCaptured, parseMenu, PEDIDOSYA_BASE,
} from "./lib/pedidosya.js";
import { summarizeStore } from "./lib/normalize.js";

const PAGE_URL = "https://teskel.online/helados/";
const CACHE_MINUTES = 20;
const RAPPI_MAX_DETAILS = 30;      // fichas a abrir (solo heladerías abiertas)
const CHALLENGE_WAIT_MS = 4 * 60 * 1000;
const HELP_WAIT_MS = 3 * 60 * 1000;   // tiempo para que la persona cargue la dirección en PedidosYa
const STUCK_MS = 15 * 60 * 1000;
const PYA_MAX_MENUS = 20;           // menús de PedidosYa a leer por búsqueda (solo heladerías con descuento)
const MENU_BLOCK_WAIT_MS = 60 * 1000;      // si una búsqueda lleva más que esto, la damos por muerta
const DEFAULT_CITY = { slug: "rosario", name: "Rosario" };
const PLATFORMS = ["rappi", "pedidosya"];

/** Ciudad pedida por la página, validada (slug tipo "buenos-aires"). */
function cityFrom(msg) {
  const slug = String(msg?.city?.slug || "").toLowerCase();
  return /^[a-z]+(-[a-z]+)*$/.test(slug) ? { slug, name: String(msg.city.name || slug) } : DEFAULT_CITY;
}
const cacheKey = (platform, city) => `result:${platform}:${city.slug}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(700 + Math.random() * 900); // ritmo de persona, no de bot
let running = null;            // { since } mientras hay una búsqueda
let cancelRequested = false;
const ports = new Set();       // todas las páginas abiertas reciben el progreso

class Cancelled extends Error {}
function checkCancel() { if (cancelRequested) throw new Cancelled("Búsqueda cancelada"); }
const isRunning = () => running && Date.now() - running.since < STUCK_MS;

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: PAGE_URL }));

// Cuando PedidosYa muestra resultados, la URL trae la ubicación elegida por la persona
// (lat, lng, address, areaId...). La guardamos para ir directo la próxima vez.
const LOCATION_PARAMS = ["lat", "lng", "areaId", "areaName", "address"];
function locationFromUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("pedidosya.com.ar") || !u.searchParams.get("lat") || !u.searchParams.get("lng")) return null;
    const loc = {};
    for (const k of LOCATION_PARAMS) if (u.searchParams.get(k)) loc[k] = u.searchParams.get(k);
    return loc;
  } catch { return null; }
}
chrome.tabs.onUpdated.addListener((_id, info) => {
  const loc = info.url && locationFromUrl(info.url);
  if (loc) chrome.storage.local.set({ "pya:location": { ...loc, savedAt: new Date().toISOString() } });
});
/** Ubicación a partir de las llamadas internas de PedidosYa (la portada pide
 *  /home-page/.../lazy_load?lat=..&lng=.. con la dirección que la persona ya tiene cargada). */
function locationFromCaptured(acc, pageText = "") {
  for (const c of acc.captured.values()) {
    try {
      const u = new URL(c.url);
      if (!u.hostname.endsWith("pedidosya.com.ar")) continue;
      const lat = u.searchParams.get("lat");
      const lng = u.searchParams.get("lng");
      if (!lat || !lng || Number(lat) === 0 || Number(lng) === 0) continue;
      const loc = { lat, lng };
      const areaId = u.searchParams.get("area_id") || u.searchParams.get("areaId");
      if (areaId && areaId !== "0") loc.areaId = areaId;
      const address = String(pageText).match(/Enviar a\s*\n+\s*([^\n]{3,80})/);
      if (address) loc.address = address[1].trim();
      return loc;
    } catch { /* URL rara */ }
  }
  return null;
}

async function savedPyaLocation() {
  const { "pya:location": loc } = await chrome.storage.local.get("pya:location");
  return loc || null;
}
function helados(loc) {
  const u = new URL(`${PEDIDOSYA_BASE}/restaurantes`);
  u.searchParams.set("bt", "RESTAURANT");
  u.searchParams.set("category", String(HELADOS_CATEGORY_ID));
  for (const k of LOCATION_PARAMS) if (loc[k]) u.searchParams.set(k, loc[k]);
  return u.toString();
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "helados") return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((msg) => handle(msg, port).catch((e) => post(port, { type: "ERROR", message: String(e) })));
});

const broadcast = (msg) => { for (const p of ports) post(p, msg); };

function post(port, msg) {
  try { port.postMessage(msg); } catch { /* la página se cerró */ }
}

async function handle(msg, port) {
  const city = cityFrom(msg);
  if (msg.type === "GET_CACHED") {
    const results = await Promise.all(PLATFORMS.map((p) => readCache(p, city)));
    return post(port, { type: "CACHED", city: city.slug, results: results.filter(Boolean) });
  }
  if (msg.type === "GET_RAW") {
    const { ["raw:pedidosya"]: raw } = await chrome.storage.local.get("raw:pedidosya");
    return post(port, { type: "RAW", platform: "pedidosya", raw: raw || null });
  }
  if (msg.type === "STATUS") {
    const loc = await savedPyaLocation();
    return post(port, { type: "STATUS", running: Boolean(isRunning()), pyaAddress: loc?.address || null });
  }
  if (msg.type === "CANCEL") {
    if (isRunning()) { cancelRequested = true; broadcast({ type: "PROGRESS", platform: "_", message: "Cancelando…" }); }
    return;
  }
  if (msg.type === "OPEN_PYA") {
    // Pestaña normal de PedidosYa para que la persona cargue su dirección (sin capturar nada).
    const tab = await chrome.tabs.create({ url: `${PEDIDOSYA_BASE}/`, active: true });
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    return;
  }
  if (msg.type !== "FETCH") return;
  if (isRunning()) return post(port, { type: "BUSY" });

  running = { since: Date.now() };
  cancelRequested = false;
  const heartbeat = setInterval(() => broadcast({ type: "HEARTBEAT" }), 15000); // mantiene vivo el worker
  const pageTabId = port.sender?.tab?.id;
  const platforms = (msg.platforms?.length ? msg.platforms : PLATFORMS).filter((p) => PLATFORMS.includes(p));
  try {
    await Promise.all(platforms.map(async (platform) => {
      const progress = (message) => { checkCancel(); broadcast({ type: "PROGRESS", platform, message }); };
      let result = !msg.force && (await readCache(platform, city, CACHE_MINUTES));
      if (!result) {
        result = platform === "rappi" ? await fetchRappi(city, progress) : await fetchPedidosYa(city, progress);
        result.citySlug = city.slug;
        if (!cancelRequested) await chrome.storage.local.set({ [cacheKey(platform, city)]: result });
      }
      broadcast({ type: "RESULT", result });
    }));
  } finally {
    clearInterval(heartbeat);
    running = null;
    cancelRequested = false;
    if (pageTabId) chrome.tabs.update(pageTabId, { active: true }).catch(() => {});
    broadcast({ type: "DONE" });
  }
}

async function readCache(platform, city, maxMinutes = Infinity) {
  const key = cacheKey(platform, city);
  const { [key]: r } = await chrome.storage.local.get(key);
  if (!r) return null;
  const ageMin = (Date.now() - Date.parse(r.capturedAt)) / 60000;
  return ageMin <= maxMinutes ? { ...r, fromCache: true } : null;
}

const result = (platform, status, extra = {}) => ({
  platform, status, stores: [], message: "", capturedAt: new Date().toISOString(), ...extra,
});

// ---------------------------------------------------------------- Rappi
async function fetchText(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { credentials: "include", headers: { "Accept-Language": "es-AR,es;q=0.9" } });
      if (r.status === 403 || r.status === 429) throw Object.assign(new Error(`HTTP ${r.status}`), { blocked: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (e.blocked || i + 1 >= tries) throw e;
      await sleep(1500 * 2 ** i + Math.random() * 500); // backoff exponencial
    }
  }
}

async function fetchRappi(city, progress) {
  try {
    progress(`Buscando heladerías en ${city.name}…`);
    const html = await fetchText(`${RAPPI_BASE}/${city.slug}/restaurantes/category/helados`);
    const { location, stores } = parseCategoryPage(html);
    // Si la ciudad no existe en Rappi, devuelve la de la cookie sin avisar: lo detectamos.
    if (location?.url && location.url !== city.slug) {
      return result("rappi", "error", {
        message: `Rappi no tiene ${city.name} (me mostró ${location.city}).`,
      });
    }
    const cityName = location?.city || city.name;
    const open = stores.filter((s) => s.open).slice(0, RAPPI_MAX_DETAILS);
    const details = new Map();
    let fails = 0;
    for (const [i, s] of open.entries()) {
      progress(`Leyendo precios ${i + 1}/${open.length}: ${s.name}`);
      await pause();
      try {
        details.set(s.id, parseStorePage(await fetchText(s.url)));
      } catch (e) {
        if (e.blocked || e instanceof Cancelled) throw e;
        fails++;
        console.warn("Rappi: no pude leer", s.name, e);
      }
    }
    const merged = stores.map((s) => mergeStore(s, details.get(s.id)));
    const note = fails ? ` (${fails} fichas sin leer)` : "";
    return result("rappi", "ok", {
      stores: merged,
      city: cityName,
      message: `${merged.length} heladerías en ${cityName}, ${open.length} abiertas${note}`,
    });
  } catch (e) {
    if (e instanceof Cancelled) return result("rappi", "error", { message: "Cancelada" });
    if (e.blocked) return result("rappi", "blocked", { message: `Rappi bloqueó la consulta (${e.message})` });
    const msg = e instanceof StructureChanged ? `Rappi cambió su estructura: ${e.message}`
      : /failed to fetch|network/i.test(e.message) ? "No pude conectarme con Rappi (¿hay internet?)"
      : `Error: ${e.message}`;
    return result("rappi", "error", { message: msg });
  }
}

// ---------------------------------------------------------------- PedidosYa
async function registerCapture() {
  await chrome.scripting.unregisterContentScripts({ ids: ["pya-capture"] }).catch(() => {});
  await chrome.scripting.registerContentScripts([{
    id: "pya-capture",
    matches: ["https://www.pedidosya.com.ar/*"],
    js: ["pya-capture.js"],
    runAt: "document_start",
    world: "MAIN",
    persistAcrossSessions: false,
  }]);
}

const inTab = (tabId, func, args = []) =>
  chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args }).then((r) => r?.[0]?.result);

function pageState() {
  return {
    url: location.href,
    title: document.title,
    text: (document.body?.innerText || "").slice(0, 4000),
    ready: document.readyState,
  };
}

function readCaptured() {
  const embedded = [];
  const nd = document.getElementById("__NEXT_DATA__");
  if (nd) try { embedded.push(JSON.parse(nd.textContent)); } catch { /* nada */ }
  for (const k of ["__PRELOADED_STATE__", "__INITIAL_STATE__", "__APOLLO_STATE__"]) {
    if (window[k]) try { embedded.push(JSON.parse(JSON.stringify(window[k]))); } catch { /* nada */ }
  }
  return { captured: window.__heladosCap || [], embedded };
}

async function scrollDown(times) {
  for (let i = 0; i < times; i++) {
    window.scrollBy(0, 900 + Math.random() * 600);
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1000));
  }
}

async function waitLoaded(tabId, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await sleep(500);
  }
}

/** Si PedidosYa muestra la verificación, muestra la pestaña y espera que la persona la pase. */
/** La búsqueda corre en una ventana minimizada. Solo se muestra si la persona tiene que hacer algo. */
async function showTab(tabId) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { state: "normal", focused: true }).catch(() => {});
  return tab;
}

async function waitForHuman(tabId, progress) {
  let state = await inTab(tabId, pageState).catch(() => null);
  if (!state) { // la pestaña estaba navegando; esperamos y miramos de nuevo
    await waitLoaded(tabId, 10000);
    await sleep(1500);
    state = await inTab(tabId, pageState);
  }
  if (!isChallengePage(state?.title, state?.text)) return true;
  await showTab(tabId);
  progress("PedidosYa pide una verificación: resolvela en la ventana que se abrió y la búsqueda sigue sola.");
  const start = Date.now();
  while (Date.now() - start < CHALLENGE_WAIT_MS) {
    await sleep(2000);
    checkCancel();
    await waitLoaded(tabId, 10000);
    state = await inTab(tabId, pageState).catch(() => null);
    if (state && !isChallengePage(state.title, state.text)) {
      progress("Verificación pasada, sigo…");
      await sleep(2500);
      return true;
    }
  }
  return false;
}

/** Junta lo capturado en la pestaña (las respuestas se pierden si la página navega, así que acumulamos). */
async function collect(tabId, acc) {
  const data = await inTab(tabId, readCaptured).catch(() => null);
  if (!data) return acc;
  for (const c of data.captured) acc.captured.set(`${c.url}#${JSON.stringify(c.body).length}`, c);
  if (data.embedded.length) acc.embedded = data.embedded;
  acc.stores = parseCaptured([...[...acc.captured.values()].map((c) => c.body), ...acc.embedded]);
  return acc;
}

async function fetchPedidosYa(city, progress) {
  let tabId = null;
  let windowId = null;
  const acc = { captured: new Map(), embedded: [], stores: [] };
  let neededHelp = false;
  let loc = await savedPyaLocation();
  try {
    await registerCapture();
    progress(loc ? `Abriendo PedidosYa (${loc.address || "tu dirección"})…` : "Abriendo PedidosYa…");
    // Ventana aparte y minimizada: no te cambia las pestañas mientras busca.
    const win = await chrome.windows.create({ url: loc ? helados(loc) : `${PEDIDOSYA_BASE}/`, state: "minimized", focused: false });
    windowId = win.id;
    tabId = win.tabs[0].id;
    await waitLoaded(tabId);
    await sleep(2500);

    const blocked = () => result("pedidosya", "blocked", { message: "No se pasó la verificación de PedidosYa a tiempo." });
    if (!(await waitForHuman(tabId, progress))) return blocked();

    if (!loc) {
      // Si la persona ya tiene una dirección cargada en PedidosYa, la portada la usa en sus llamadas.
      await sleep(2000);
      await collect(tabId, acc);
      const state = await inTab(tabId, pageState).catch(() => ({}));
      loc = locationFromCaptured(acc, state.text);
      if (loc) {
        await chrome.storage.local.set({ "pya:location": { ...loc, savedAt: new Date().toISOString() } });
        progress(`Usando tu dirección de PedidosYa${loc.address ? ` (${loc.address})` : ""}…`);
        await chrome.tabs.update(tabId, { url: helados(loc) });
        await waitLoaded(tabId);
        await sleep(2500);
        if (!(await waitForHuman(tabId, progress))) return blocked();
      }
    }

    if (loc) {
      progress("Buscando heladerías…");
      await inTab(tabId, scrollDown, [4]).catch(() => {}); // carga más páginas de la lista
      await sleep(1500);
      await collect(tabId, acc);
    }

    if (!acc.stores.length) {
      // Sin dirección guardada (o no aparecieron locales): la persona carga la dirección en la pestaña.
      neededHelp = true;
      await showTab(tabId);
      const helpMsg = (left) => `PedidosYa necesita tu dirección: cargala en la ventana que se abrió. `
        + `Sigo sola cuando aparezcan las heladerías (espero ${left}).`;
      progress(helpMsg("3 min"));
      const start = Date.now();
      let lastNotice = Date.now();
      let wentToHelados = false;
      while (!acc.stores.length && Date.now() - start < HELP_WAIT_MS) {
        await sleep(3000);
        checkCancel();
        if (Date.now() - lastNotice > 30000) {
          lastNotice = Date.now();
          progress(helpMsg(`${Math.ceil((HELP_WAIT_MS - (Date.now() - start)) / 60000)} min más`));
        }
        const state = await inTab(tabId, pageState).catch(() => null);
        if (state && isChallengePage(state.title, state.text)) {
          if (!(await waitForHuman(tabId, progress))) return blocked();
          continue;
        }
        // Apenas sabemos la ubicación (por la URL o por las llamadas de la portada), vamos a Helados.
        await collect(tabId, acc);
        const newLoc = state && (locationFromUrl(state.url) || locationFromCaptured(acc, state.text));
        if (newLoc && !wentToHelados) {
          loc = newLoc;
          await chrome.storage.local.set({ "pya:location": { ...loc, savedAt: new Date().toISOString() } });
          if (!new URL(state.url).searchParams.get("category")) {
            wentToHelados = true;
            progress("Dirección cargada. Abriendo Helados…");
            await chrome.tabs.update(tabId, { url: helados(loc) });
            await waitLoaded(tabId);
            await sleep(2500);
            await inTab(tabId, scrollDown, [4]).catch(() => {});
          }
        }
        await collect(tabId, acc);
      }
    }

    if (!acc.stores.length) {
      return result("pedidosya", "error", {
        message: `No aparecieron heladerías en PedidosYa (${acc.captured.size} respuestas leídas). `
          + "Descargá el diagnóstico y pasámelo.",
      });
    }

    // Precios: entramos al menú de las heladerías abiertas más cercanas, de a una.
    const listed = acc.stores;
    const { menus, blocked: menusBlocked } = await readMenus(tabId, acc, listed, progress);
    const all = listed.map((s) => {
      const products = menus.has(s.id) ? parseMenu(menus.get(s.id)) : [];
      return products.length ? summarizeStore({ ...s, products }) : s;
    });
    // Solo interesan las heladerías con descuento en helado (el envío gratis solo no alcanza).
    const stores = all.filter((s) => s.bestDiscountPct);
    const withDetail = stores.filter((s) => s.deals?.length).length;
    const menuNote = menusBlocked
      ? ` · PedidosYa no dejó ver el detalle de algunas (${withDetail} con detalle)`
      : menus.size && !all.some((s) => s.products?.length) ? " · no reconocí los productos de los menús (descargá el diagnóstico)"
        : "";

    const where = loc?.address ? ` cerca de ${loc.address}` : "";
    return result("pedidosya", "ok", {
      stores,
      city: loc?.areaName || city.name,
      address: loc?.address || null,
      message: `${stores.length} ${stores.length === 1 ? "heladería" : "heladerías"} con descuento${where}${menuNote}`,
    });
  } catch (e) {
    if (e instanceof Cancelled) return result("pedidosya", "error", { message: "Cancelada" });
    const msg = /error page|ERR_/i.test(e.message) ? "No pude abrir PedidosYa (¿hay internet?)" : `Error: ${e.message}`;
    return result("pedidosya", "error", { message: msg });
  } finally {
    // El diagnóstico se guarda siempre (también si falla o se cancela), para poder ajustar el parser.
    const state = tabId != null ? await inTab(tabId, pageState).catch(() => ({})) : {};
    if (tabId != null) await collect(tabId, acc).catch(() => {});
    await saveRaw({ url: state.url, title: state.title, text: state.text, neededHelp, location: loc,
      captured: [...acc.captured.values()], embedded: acc.embedded }).catch(() => {});
    await chrome.scripting.unregisterContentScripts({ ids: ["pya-capture"] }).catch(() => {});
    if (windowId != null) chrome.windows.remove(windowId).catch(() => {});
    else if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
  }
}

/** Respuesta del menú de un local en la pestaña: el JSON, "blocked" (PerimeterX) o null si no llegó. */
async function menuResponse(tabId, partnerId, acc) {
  const data = await inTab(tabId, readCaptured).catch(() => null);
  if (!data) return null;
  const hits = data.captured.filter((c) => menuPartnerId(c.url) === partnerId);
  for (const c of hits) acc.captured.set(`${c.url}#${c.status}#${JSON.stringify(c.body).length}`, c); // para el diagnóstico
  const ok = hits.find((c) => c.status < 400 && !isBotBlock(c.body));
  if (ok) return ok.body;
  return hits.some((c) => c.status >= 400 || isBotBlock(c.body)) ? "blocked" : null;
}

/** Pide el menú directo a PedidosYa (la misma llamada que hace su web), sin abrir páginas. */
async function fetchMenuDirect(partnerId, acc) {
  const url = `${PEDIDOSYA_BASE}/v2/niles/partners/${partnerId}/menus?occasion=DELIVERY`;
  try {
    const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    let body = null;
    try { body = await r.json(); } catch { /* no es JSON */ }
    acc.captured.set(`${url}#direct#${r.status}`, { url, status: r.status, body }); // diagnóstico
    if (r.status >= 400 || !body || isBotBlock(body)) return "blocked";
    return body;
  } catch {
    return "blocked";
  }
}

/** Lee los menús de las heladerías abiertas que tienen descuento (las de mayor % primero).
 *  1) directo, sin abrir nada; 2) si PedidosYa no lo permite, abriendo cada menú en la ventana
 *  minimizada; 3) si igual bloquea, muestra la ventana por si hay un desafío y, si no, no insiste. */
async function readMenus(tabId, acc, stores, progress) {
  const menus = new Map();
  const targets = stores
    .filter((s) => s.open !== false && s.url && s.bestDiscountPct)
    .sort((a, b) => b.bestDiscountPct - a.bestDiscountPct)
    .slice(0, PYA_MAX_MENUS);
  let direct = true;
  for (const [i, s] of targets.entries()) {
    progress(`Leyendo descuentos ${i + 1}/${targets.length}: ${s.name}`);
    await sleep(700 + Math.random() * 1100);
    if (direct) {
      const res = await fetchMenuDirect(s.id, acc);
      if (res !== "blocked") { menus.set(s.id, res); continue; }
      direct = false; // PedidosYa no deja pedirlo directo: seguimos abriendo los menús en la ventana
    }
    await chrome.tabs.update(tabId, { url: s.url });
    await waitLoaded(tabId);
    await sleep(2500);
    if (!(await waitForHuman(tabId, progress))) return { menus, blocked: true };
    let res = null;
    for (let t = 0; t < 4 && !res; t++) { res = await menuResponse(tabId, s.id, acc); if (!res) await sleep(1000); }
    if (res === "blocked") {
      await showTab(tabId);
      progress("PedidosYa frenó la lectura del menú. Si en la ventana ves un desafío (por ejemplo "
        + "\"mantené presionado\"), resolvelo. Si no aparece nada, sigo sin detalle en 1 minuto.");
      const start = Date.now();
      while (Date.now() - start < MENU_BLOCK_WAIT_MS) {
        await sleep(3000);
        checkCancel();
        res = await menuResponse(tabId, s.id, acc);
        if (res && res !== "blocked") break;
      }
      if (!res || res === "blocked") return { menus, blocked: true };
      progress("¡Listo! Sigo con los menús…");
    }
    if (res) menus.set(s.id, res);
  }
  return { menus, blocked: false };
}

async function saveRaw(raw) {
  let text = JSON.stringify({ savedAt: new Date().toISOString(), ...raw });
  if (text.length > 4_000_000) {
    raw.captured = raw.captured.slice(0, 40);
    text = JSON.stringify({ savedAt: new Date().toISOString(), truncated: true, ...raw });
  }
  await chrome.storage.local.set({ "raw:pedidosya": text });
}
