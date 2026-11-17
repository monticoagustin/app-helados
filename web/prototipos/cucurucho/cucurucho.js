// CUCURUCHO — cada heladería es una bocha; arriba va la del descuento más grande.
// Lee lo que app.js dibuja en #list (lib/datos.js) y no toca la búsqueda.
import { alCambiar, paletas } from "../lib/datos.js";

paletas(["cacao", "frutilla", "limon"], "cuartito:paleta:cucurucho");

const MAX = 7;
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const lista = $("#bochas");
const detalle = document.createElement("article");
detalle.id = "detalle";
detalle.className = "detalle";
detalle.setAttribute("aria-live", "polite");
$("#ticket").insertBefore(detalle, $("#sueltos"));

let datos = { shops: [] };
let elegida = 0;

// azar con semilla: la misma heladería tiene siempre la misma bocha
function azar(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

// la bocha: domo irregular arriba, borde con ondas abajo y uno o dos chorreones
function bocha(i, shop) {
  const r = azar(shop.name + i);
  const w = (k) => (r() - 0.5) * k;
  const top = `M12 ${108 + w(6)} C${4 + w(6)} ${52 + w(10)} ${48 + w(10)} ${8 + w(6)} 100 ${9 + w(4)} C${152 + w(10)} ${8 + w(6)} ${197 + w(6)} ${52 + w(10)} 188 ${108 + w(6)}`;
  let borde = "";
  const n = 8;
  for (let k = 0; k < n; k++) {
    const x0 = 188 - (176 / n) * k, x1 = 188 - (176 / n) * (k + 1);
    borde += ` Q${(x0 + x1) / 2} ${128 + w(8)} ${x1} ${110 + w(5)}`;
  }
  const forma = `${top}${borde} Z`;
  const chorros = [];
  const cuantos = 1 + Math.round(r());
  for (let k = 0; k < cuantos; k++) {
    const x = (r() < 0.5 ? 30 + r() * 30 : 140 + r() * 30), largo = 136 + r() * 26, a = 5 + r() * 3;
    chorros.push(`M${x - a} 112 C${x - a} ${largo - 18} ${x - a - 1} ${largo - a} ${x} ${largo} C${x + a + 1} ${largo - a} ${x + a} ${largo - 18} ${x + a} 112 Z`);
  }
  // chispas de chocolate en algunos gustos
  const chispas = i % 3 === 1 ? Array.from({ length: 7 }, () => {
    const x = r() < 0.5 ? 28 + r() * 26 : 146 + r() * 26, y = 50 + r() * 44;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3.2" ry="2" transform="rotate(${Math.round(r() * 180)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join("") : "";
  const id = `b${i}`;
  return `<svg viewBox="0 0 200 170" aria-hidden="true" focusable="false">
    <defs><clipPath id="${id}"><path d="${forma}"/></clipPath></defs>
    ${chorros.map((d) => `<path class="chorro" d="${d}"/>`).join("")}
    <path class="masa" d="${forma}"/>
    <g clip-path="url(#${id})"><path class="sombra" d="M0 92 Q100 ${118 + w(6)} 200 92 V170 H0Z"/><g class="chispas">${chispas}</g></g>
    <path class="brillo" d="M44 ${54 + w(4)} C52 ${34 + w(4)} 70 ${24 + w(4)} 90 ${22 + w(3)}" />
    <text class="pct" x="100" y="80" text-anchor="middle">−${shop.best}%</text>
    <text class="nombre" x="100" y="98" text-anchor="middle">${esc(shop.name.length > 26 ? shop.name.slice(0, 25) + "…" : shop.name)}</text>
  </svg>`;
}

function render(d) {
  datos = d;
  const shops = d.shops.slice().sort((a, b) => b.best - a.best).slice(0, MAX);
  datos.top = shops;
  elegida = Math.min(elegida, Math.max(0, shops.length - 1));
  const max = Math.max(1, ...shops.map((s) => s.best));
  const min = Math.min(max, ...shops.map((s) => s.best));
  lista.innerHTML = shops.map((s, i) => {
    const escala = (max === min ? 1 : 0.6 + 0.4 * ((s.best - min) / (max - min))).toFixed(3);
    return `<li class="bocha" style="--i:${i};--n:${shops.length};--s:${escala};--c:var(--f${i % 8})${s.closed ? ";--cerrada:1" : ""}">
      <button type="button" data-i="${i}" aria-pressed="${i === elegida}" aria-label="${esc(s.name)}, hasta ${s.best}% menos${s.closed ? ", cerrada ahora" : ""}">${bocha(i, s)}</button>
      <span class="rotulo" aria-hidden="true">${esc(s.name)}</span>
    </li>`;
  }).join("");
  document.querySelector(".torre").classList.toggle("vacia", !shops.length);
  for (const b of lista.querySelectorAll("button")) b.addEventListener("click", () => {
    elegir(Number(b.dataset.i));
    // en el celular el detalle queda abajo de la torre: lo traemos a la vista
    if (matchMedia("(max-width: 999px)").matches) detalle.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  describir();
  sueltos(d);
}

function elegir(i) {
  elegida = i;
  for (const b of lista.querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.i) === i));
  describir();
}

function describir() {
  const s = datos.top?.[elegida];
  if (!s) {
    detalle.innerHTML = `<p class="vacio">${esc(datos.empty || "Todavía no hay bochas. Elegí la ciudad y traé los descuentos.")}</p>`;
    return;
  }
  const nombre = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name);
  const filas = s.deals.slice(0, 6).map((x) => `<li><span class="off">−${x.off}%</span><span class="nm">${esc(x.name)}${x.plus ? ' <em class="plus">con Plus</em>' : ""}</span><span class="pr">${esc(x.now)}${x.before ? ` <s>${esc(x.before)}</s>` : ""}</span></li>`).join("");
  const mas = s.deals.length > 6 ? `<p class="mas">y ${s.deals.length - 6} más en la app</p>` : "";
  detalle.innerHTML = `<p class="cual">bocha ${elegida + 1} de ${datos.top.length}</p>
    <h3>${nombre}</h3>
    <p class="meta">${esc(s.meta)}${s.closed ? " · cerrada ahora" : ""}</p>
    <ul>${filas}</ul>${mas}`;
}

function sueltos(d) {
  const el = $("#sueltos");
  const resto = d.shops.length > MAX ? d.shops.slice().sort((a, b) => b.best - a.best).slice(MAX) : [];
  const partes = [];
  if (resto.length) partes.push(`<h3>No entraron en el cucurucho</h3><p>${resto.map((s) => `${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)} −${s.best}%`).join(", ")}</p>`);
  if (d.vague?.length) partes.push(`<h3>Con descuento, sin precio a la vista</h3><p>${d.vague.map((v) => `${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.name)}</a>` : esc(v.name)}${v.best ? ` −${v.best}%` : ""}`).join(", ")}</p>`);
  el.innerHTML = partes.join("");
}

// flechas arriba/abajo para pasar de bocha
lista.addEventListener("keydown", (e) => {
  const n = datos.top?.length || 0;
  if (!n || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
  e.preventDefault();
  const i = (elegida + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
  elegir(i);
  lista.querySelector(`button[data-i="${i}"]`)?.focus();
});

alCambiar(render);
