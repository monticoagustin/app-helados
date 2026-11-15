// Service worker de la extensión: corre las búsquedas cuando la página lo pide.
import { mergeStore, parseCategoryPage, parseStorePage, RAPPI_BASE, StructureChanged } from "./lib/rappi.js";
import { isChallengePage, parseCaptured, PEDIDOSYA_BASE } from "./lib/pedidosya.js";

const PAGE_URL = "https://teskel.online/helados/";
const CACHE_MINUTES = 20;
const RAPPI_MAX_DETAILS = 30;      // fichas a abrir (solo heladerías abiertas)
const CHALLENGE_WAIT_MS = 4 * 60 * 1000;
const CITY = "rosario";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(700 + Math.random() * 900); // ritmo de persona, no de bot
let running = false;

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: PAGE_URL }));

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "helados") return;
  port.onMessage.addListener((msg) => handle(msg, port).catch((e) => post(port, { type: "ERROR", message: String(e) })));
});

function post(port, msg) {
  try { port.postMessage(msg); } catch { /* la página se cerró */ }
}

async function handle(msg, port) {
  if (msg.type === "GET_CACHED") {
    const results = await Promise.all(["rappi", "pedidosya"].map(readCache));
    return post(port, { type: "CACHED", results: results.filter(Boolean) });
  }
  if (msg.type === "GET_RAW") {
    const { ["raw:pedidosya"]: raw } = await chrome.storage.local.get("raw:pedidosya");
    return post(port, { type: "RAW", platform: "pedidosya", raw: raw || null });
  }
  if (msg.type !== "FETCH") return;
  if (running) return post(port, { type: "BUSY" });

  running = true;
  const heartbeat = setInterval(() => post(port, { type: "HEARTBEAT" }), 15000); // mantiene vivo el worker
  const pageTabId = port.sender?.tab?.id;
  const platforms = msg.platforms?.length ? msg.platforms : ["rappi", "pedidosya"];
  try {
    await Promise.all(platforms.map(async (platform) => {
      const progress = (message) => post(port, { type: "PROGRESS", platform, message });
      let result = !msg.force && (await readCache(platform, CACHE_MINUTES));
      if (!result) {
        result = platform === "rappi" ? await fetchRappi(progress) : await fetchPedidosYa(progress);
        await chrome.storage.local.set({ [`result:${platform}`]: result });
      }
      post(port, { type: "RESULT", result });
    }));
  } finally {
    clearInterval(heartbeat);
    running = false;
    if (pageTabId) chrome.tabs.update(pageTabId, { active: true }).catch(() => {});
    post(port, { type: "DONE" });
  }
}

async function readCache(platform, maxMinutes = Infinity) {
  const { [`result:${platform}`]: r } = await chrome.storage.local.get(`result:${platform}`);
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

async function fetchRappi(progress) {
  try {
    progress("Buscando heladerías…");
    const { location, stores } = parseCategoryPage(await fetchText(`${RAPPI_BASE}/restaurantes/category/helados`));
    const city = location?.city || "?";
    const open = stores.filter((s) => s.open).slice(0, RAPPI_MAX_DETAILS);
    const details = new Map();
    let fails = 0;
    for (const [i, s] of open.entries()) {
      progress(`Leyendo precios ${i + 1}/${open.length}: ${s.name}`);
      await pause();
      try {
        details.set(s.id, parseStorePage(await fetchText(s.url)));
      } catch (e) {
        if (e.blocked) throw e;
        fails++;
        console.warn("Rappi: no pude leer", s.name, e);
      }
    }
    const merged = stores.map((s) => mergeStore(s, details.get(s.id)));
    const note = fails ? ` (${fails} fichas sin leer)` : "";
    return result("rappi", "ok", {
      stores: merged,
      city,
      message: `${merged.length} heladerías en ${city}, ${open.length} abiertas${note}`,
    });
  } catch (e) {
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

async function fetchPedidosYa(progress) {
  let tabId = null;
  try {
    await registerCapture();
    progress("Abriendo PedidosYa…");
    const tab = await chrome.tabs.create({ url: `${PEDIDOSYA_BASE}/restaurantes/${CITY}`, active: false });
    tabId = tab.id;
    await waitLoaded(tabId);
    await sleep(2500);

    if (!(await waitForHuman(tabId, progress))) {
      return result("pedidosya", "blocked", { message: "No se pasó la verificación de PedidosYa a tiempo." });
    }

    progress("Buscando heladerías…");
    const clicked = await inTab(tabId, clickText, [["Helados", "Heladerías", "Heladerias", "Helado"]]);
    await sleep(3000);
    if (!(await waitForHuman(tabId, progress))) {
      return result("pedidosya", "blocked", { message: "No se pasó la verificación de PedidosYa a tiempo." });
    }
    await inTab(tabId, scrollDown, [4]);
    await sleep(1500);

    const { captured, embedded } = await inTab(tabId, readCaptured);
    const state = await inTab(tabId, pageState);
    const payloads = [...captured.map((c) => c.body), ...embedded];
    await saveRaw({ url: state.url, title: state.title, clicked, captured, embedded });

    const stores = parseCaptured(payloads);
    if (!stores.length) {
      const needsAddress = /direcci[oó]n|ingres[aá] tu ubicaci[oó]n/i.test(state.text);
      return result("pedidosya", "error", {
        message: needsAddress
          ? "PedidosYa pide una dirección: abrilo una vez, cargá tu dirección en Rosario y volvé a buscar."
          : `Leí ${captured.length} respuestas pero no reconocí heladerías. Descargá el diagnóstico y pasámelo.`,
      });
    }
    return result("pedidosya", "ok", {
      stores,
      city: "Rosario",
      message: `${stores.length} heladerías${clicked ? "" : " (no encontré el filtro Helados; filtré por nombre)"}`,
    });
  } catch (e) {
    const msg = /error page|ERR_/i.test(e.message) ? "No pude abrir PedidosYa (¿hay internet?)" : `Error: ${e.message}`;
    return result("pedidosya", "error", { message: msg });
  } finally {
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
