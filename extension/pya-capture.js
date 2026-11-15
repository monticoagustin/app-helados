// Se inyecta en PedidosYa SOLO mientras la extensión está buscando (se registra y se
// borra en cada búsqueda). Guarda en memoria las respuestas JSON que la propia web
// recibe, para leerlas después. No modifica nada de la página.
(() => {
  if (window.__heladosCap) return;
  const cap = (window.__heladosCap = []);
  const MAX = 300;
  const keep = (url, status, body) => { if (cap.length < MAX) cap.push({ url: String(url), status, body }); };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      if ((response.headers.get("content-type") || "").includes("json")) {
        response.clone().json().then((b) => keep(response.url, response.status, b)).catch(() => {});
      }
    } catch { /* nada */ }
    return response;
  };

  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  XHR.open = function (method, url, ...rest) {
    this.__heladosUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XHR.send = function (...args) {
    this.addEventListener("load", () => {
      try {
        if ((this.getResponseHeader("content-type") || "").includes("json")) {
          const body = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
          keep(this.responseURL || this.__heladosUrl, this.status, body);
        }
      } catch { /* nada */ }
    });
    return originalSend.apply(this, args);
  };
})();
