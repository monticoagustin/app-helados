// Puente entre la página (teskel.online/helados) y la extensión.
// La página manda window.postMessage({ app: "helados", type, ... }) y recibe
// mensajes { app: "helados-ext", type, ... }.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  let port = null;

  const toPage = (msg) => window.postMessage({ app: "helados-ext", ...msg }, window.location.origin);

  function getPort() {
    if (port) return port;
    port = chrome.runtime.connect({ name: "helados" });
    port.onMessage.addListener(toPage);
    port.onDisconnect.addListener(() => { port = null; });
    return port;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.app !== "helados") return;
    const { type } = event.data;
    if (type === "PING") return toPage({ type: "PONG", version: VERSION });
    try {
      getPort().postMessage(event.data);
    } catch {
      port = null; // el service worker se reinició: reintentamos una vez con un puerto nuevo
      getPort().postMessage(event.data);
    }
  });

  document.documentElement.dataset.heladosExt = VERSION;
  toPage({ type: "PONG", version: VERSION });
})();
