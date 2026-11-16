// Service worker de la extensión: corre las búsquedas cuando la página lo pide.
import { mergeStore, parseCategoryPage, parseStorePage, RAPPI_BASE, StructureChanged } from "./lib/rappi.js";
import { isChallengePage, parseCaptured, PEDIDOSYA_BASE } from "./lib/pedidosya.js";

const PAGE_URL = "https://teskel.online/helados/";
const CACHE_MINUTES = 20;
const RAPPI_MAX_DETAILS = 30;      // fichas a abrir (solo heladerías abiertas)
const CHALLENGE_WAIT_MS = 4 * 60 * 1000;
const HELP_WAIT_MS = 3 * 60 * 1000;   // tiempo para que la persona cargue la dirección en PedidosYa
const STUCK_MS = 12 * 60 * 1000;      // si una búsqueda lleva más que esto, la damos por muerta
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
  if (msg.type === "STATUS") return post(port, { type: "STATUS", running: Boolean(isRunning()) });
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

function clickText(texts) {
  const nodes = [...document.querySelectorAll("a, button, [role=button], [role=tab], li, span, p")];
  for (const t of texts) {
    const el = nodes.find((n) => n.textContent.trim().toLowerCase() === t.toLowerCase() && n.offsetParent !== null);
    if (el) { (el.closest("a, button, [role=button], [role=tab]") || el).click(); return t; }
  }
  return null;
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
async function waitForHuman(tabId, progress) {
  let state = await inTab(tabId, pageState).catch(() => null);
  if (!state) { // la pestaña estaba navegando; esperamos y miramos de nuevo
    await waitLoaded(tabId, 10000);
    await sleep(1500);
    state = await inTab(tabId, pageState);
  }
  if (!isChallengePage(state?.title, state?.text)) return true;
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  progress("PedidosYa pide una verificación: resolvela en la pestaña que se abrió y la búsqueda sigue sola.");
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
  const acc = { captured: new Map(), embedded: [], stores: [] };
  let clicked = null;
  let neededHelp = false;
  try {
    await registerCapture();
    progress("Abriendo PedidosYa…");
    const tab = await chrome.tabs.create({ url: `${PEDIDOSYA_BASE}/restaurantes/${city.slug}`, active: false });
    tabId = tab.id;
    await waitLoaded(tabId);
    await sleep(2500);

    const blocked = () => result("pedidosya", "blocked", { message: "No se pasó la verificación de PedidosYa a tiempo." });
    if (!(await waitForHuman(tabId, progress))) return blocked();

    progress("Buscando heladerías…");
    clicked = await inTab(tabId, clickText, [["Helados", "Heladerías", "Heladerias", "Helado"]]);
    await sleep(3000);
    if (!(await waitForHuman(tabId, progress))) return blocked();
    await inTab(tabId, scrollDown, [4]).catch(() => {});
    await sleep(1500);
    await collect(tabId, acc);

    if (!acc.stores.length) {
      // PedidosYa suele pedir una dirección antes de mostrar locales. La carga la persona.
      neededHelp = true;
      const t = await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
      const helpMsg = (left) => `PedidosYa no muestra heladerías todavía: en la pestaña que se abrió cargá una dirección `
        + `en ${city.name} y entrá a Helados. Sigo sola cuando aparezcan (espero ${left}).`;
      progress(helpMsg("3 min"));
      const start = Date.now();
      let lastNotice = Date.now();
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
        await collect(tabId, acc);
      }
      if (acc.stores.length) {
        progress("¡Listo! Leyendo heladerías…");
        await sleep(2500);
        await inTab(tabId, clickText, [["Helados", "Heladerías", "Heladerias"]]).catch(() => null);
        await sleep(2500);
        await inTab(tabId, scrollDown, [4]).catch(() => {});
        await collect(tabId, acc);
      }
    }

    if (!acc.stores.length) {
      return result("pedidosya", "error", {
        message: neededHelp
          ? `No aparecieron heladerías en PedidosYa (${acc.captured.size} respuestas leídas). `
            + "Si cargaste la dirección, descargá el diagnóstico y pasámelo."
          : `Leí ${acc.captured.size} respuestas pero no reconocí heladerías. Descargá el diagnóstico y pasámelo.`,
      });
    }
    return result("pedidosya", "ok", {
      stores: acc.stores,
      city: city.name,
      message: `${acc.stores.length} ${acc.stores.length === 1 ? "heladería" : "heladerías"}${clicked ? "" : " (filtradas por nombre)"}`,
    });
  } catch (e) {
    if (e instanceof Cancelled) return result("pedidosya", "error", { message: "Cancelada" });
    const msg = /error page|ERR_/i.test(e.message) ? "No pude abrir PedidosYa (¿hay internet?)" : `Error: ${e.message}`;
    return result("pedidosya", "error", { message: msg });
  } finally {
    // El diagnóstico se guarda siempre (también si falla o se cancela), para poder ajustar el parser.
    const state = tabId != null ? await inTab(tabId, pageState).catch(() => ({})) : {};
    if (tabId != null) await collect(tabId, acc).catch(() => {});
    await saveRaw({ url: state.url, title: state.title, text: state.text, clicked, neededHelp,
      captured: [...acc.captured.values()], embedded: acc.embedded }).catch(() => {});
    await chrome.scripting.unregisterContentScripts({ ids: ["pya-capture"] }).catch(() => {});
    if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function saveRaw(raw) {
  let text = JSON.stringify({ savedAt: new Date().toISOString(), ...raw });
  if (text.length > 4_000_000) {
    raw.captured = raw.captured.slice(0, 40);
    text = JSON.stringify({ savedAt: new Date().toISOString(), truncated: true, ...raw });
  }
  await chrome.storage.local.set({ "raw:pedidosya": text });
}
