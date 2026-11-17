// Lee lo que app.js ya dibujó en #list (heladerías, descuentos, precios) y se lo pasa a cada prototipo.
// No busca nada ni cambia la lógica: los prototipos solo cambian cómo se ve.
const num = (t) => Number(String(t || "").replace(/[^\d,]/g, "").replace(",", ".")) || 0;
const clean = (el) => (el ? el.textContent.replace(/^(ahora|antes)\s*/i, "").trim() : "");

export function leer(list = document.getElementById("list")) {
  if (!list) return [];
  const shops = [...list.querySelectorAll(".shop")].map((s) => {
    const link = s.querySelector(".shop-name a");
    const meta = s.querySelector(".shop-meta");
    const deals = [...s.querySelectorAll(".deal")].map((d) => {
      const nameEl = d.querySelector(".deal-name");
      return {
        off: num(d.querySelector(".deal-off")?.textContent),
        name: nameEl ? (nameEl.childNodes[0]?.textContent || nameEl.textContent).trim() : "",
        plus: Boolean(d.querySelector(".plus-tag")),
        now: clean(d.querySelector(".deal-price b")),
        before: clean(d.querySelector(".deal-price s")),
      };
    });
    return {
      name: (s.querySelector(".shop-name")?.textContent || "").trim(),
      url: link?.href || null,
      platform: meta?.querySelector("b")?.textContent.trim() || "",
      meta: meta ? meta.textContent.trim() : "",
      closed: s.classList.contains("closed"),
      deals,
      best: Math.max(0, ...deals.map((d) => d.off)),
    };
  }).filter((s) => s.deals.length);
  const vague = [...list.querySelectorAll(".vague-row")].map((r) => ({
    name: (r.querySelector(".vague-name")?.childNodes[0]?.textContent || "").trim(),
    url: r.querySelector(".vague-name a")?.href || null,
    meta: r.querySelector(".shop-meta")?.textContent.trim() || "",
    best: num(r.querySelector(".deal-off")?.textContent),
  }));
  return { shops, vague, empty: list.querySelector(".empty")?.textContent.trim() || "" };
}

/** Llama a fn cada vez que app.js vuelve a dibujar la lista. */
export function alCambiar(fn) {
  const list = document.getElementById("list");
  if (!list) return;
  let t = 0;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => fn(leer(list)), 30); }).observe(list, { childList: true, subtree: true });
  fn(leer(list));
}

/** Paletas: guarda la elegida en el navegador y la aplica como data-paleta en <html>. */
export function paletas(nombres, clave) {
  const root = document.documentElement;
  let elegida = nombres[0];
  try { elegida = localStorage.getItem(clave) || elegida; } catch { /* nada */ }
  if (!nombres.includes(elegida)) elegida = nombres[0];
  root.dataset.paleta = elegida;
  for (const b of document.querySelectorAll("[data-set-paleta]")) {
    b.setAttribute("aria-pressed", String(b.dataset.setPaleta === elegida));
    b.addEventListener("click", () => {
      root.dataset.paleta = b.dataset.setPaleta;
      try { localStorage.setItem(clave, b.dataset.setPaleta); } catch { /* nada */ }
      for (const o of document.querySelectorAll("[data-set-paleta]")) o.setAttribute("aria-pressed", String(o === b));
      root.dispatchEvent(new CustomEvent("paleta"));
    });
  }
}
