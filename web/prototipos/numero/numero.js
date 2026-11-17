// NÚMERO — el porcentaje es la página: una heladería por pantalla, del descuento más grande al más chico.
// Lee lo que app.js dibuja en #list (lib/datos.js) y no toca la búsqueda.
import { alCambiar, paletas } from "../lib/datos.js";

paletas(["fruta", "papel", "neon"], "cuartito:paleta:numero");

const MAX = 12;
const cont = document.getElementById("ticket");
const quieto = matchMedia("(prefers-reduced-motion: reduce)");
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// el número sube de 0 al descuento cuando la pantalla entra en vista (una sola vez)
const visto = new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue;
    visto.unobserve(e.target);
    contar(e.target.querySelector(".cifra"));
  }
}, { threshold: 0.45 });

function contar(el) {
  if (!el) return;
  const fin = Number(el.dataset.fin);
  if (quieto.matches || !fin) { el.textContent = fin; return; }
  const t0 = performance.now(), dur = 700;
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(fin * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function render(d) {
  const shops = d.shops.slice().sort((a, b) => b.best - a.best).slice(0, MAX);
  if (!shops.length) {
    cont.innerHTML = `<p class="vacio">${esc(d.empty || "Todavía no hay números. Elegí la ciudad y traé los descuentos.")}</p>`;
  } else {
    cont.innerHTML = shops.map((s, i) => {
      const [mejor, ...resto] = s.deals.slice().sort((a, b) => b.off - a.off);
      const pedir = s.url ? `<a class="pedir" href="${esc(s.url)}" target="_blank" rel="noopener">Pedir en ${esc(s.platform || "la app")}</a>` : "";
      const tambien = resto.length ? `<p class="tambien">También: ${resto.slice(0, 4).map((x) => `−${x.off}% ${esc(x.name)} ${esc(x.now)}`).join(" · ")}${resto.length > 4 ? ` · y ${resto.length - 4} más` : ""}</p>` : "";
      return `<article class="pantalla${s.closed ? " cerrada" : ""}" style="--c:var(--f${i % 8});--t:var(--t${i % 8}, var(--ink-pantalla))" aria-label="${esc(s.name)}: hasta ${s.best}% menos">
        <p class="orden">${String(i + 1).padStart(2, "0")} de ${String(shops.length).padStart(2, "0")}${s.closed ? " · cerrada ahora" : ""}</p>
        <h3 class="quien">${esc(s.name)}</h3>
        <p class="numero" aria-hidden="true"><span class="menos">−</span><span class="cifra" data-fin="${s.best}">${quieto.matches ? s.best : 0}</span><span class="pc">%</span></p>
        <div class="dato">
          <h2>${esc(mejor.name)}${mejor.plus ? ' <em class="plus">con Plus</em>' : ""}</h2>
          <p class="precio"><b>${esc(mejor.now)}</b>${mejor.before ? ` <s>${esc(mejor.before)}</s>` : ""}</p>
          <p class="local">${esc(s.meta)}</p>
          ${pedir}
          ${tambien}
        </div>
      </article>`;
    }).join("");
    for (const p of cont.querySelectorAll(".pantalla")) visto.observe(p);
  }
  const sueltos = document.getElementById("sueltos");
  const resto = d.shops.length > MAX ? d.shops.slice().sort((a, b) => b.best - a.best).slice(MAX) : [];
  const partes = [];
  if (resto.length) partes.push(`<h3>Más heladerías</h3><p>${resto.map((s) => `${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)} −${s.best}%`).join(", ")}</p>`);
  if (d.vague?.length) partes.push(`<h3>Con descuento, sin precio a la vista</h3><p>${d.vague.map((v) => `${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.name)}</a>` : esc(v.name)}${v.best ? ` −${v.best}%` : ""}`).join(", ")}</p>`);
  sueltos.innerHTML = partes.join("");
}

alCambiar(render);
