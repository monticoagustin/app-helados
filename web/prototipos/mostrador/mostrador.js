// MOSTRADOR — la heladera de Vitrina (kit Anatomy), quieta y rotulada: cada pote es una heladería,
// lleno según su descuento y con el % escrito arriba. Debajo, los descuentos a todo el ancho en uno de
// tres diseños para comparar (Podio, Grilla, Foco). Paleta Frutilla, letra Bricolage. Lee #list con lib/datos.js.
import * as k from "../lib/iso-kit.mjs";
import { alCambiar } from "../lib/datos.js";

const style = document.createElement("style");
style.textContent = k.ISO_CSS;
document.head.prepend(style);

const W = 760, H = 560;
const PER_PCT = 1.05;              // unidades de altura por punto de descuento
const MAX_PCT = 60;
const TUB_R = 21, MOUND_R = 17.2, RIM = 7;
const COLS = 4, GAP_X = 62, ROWS_Y = [-26, 34];
const CASE = { x: -150, y: -70, w: 300, d: 140, r: 10 };
const CASE_TOP = 0, CASE_BOTTOM = -54, FEET = 7;
const WALL = { x: -150, y: -84, w: 300, d: 8, r: 2 };
const WALL_TOP = 6 + MAX_PCT * PER_PCT + 10;
const FLAVORS = 8;

const P = k.fitProjection(
  [...k.boxCorners(CASE, CASE_BOTTOM - FEET, CASE_TOP), ...k.boxCorners(WALL, 0, WALL_TOP)],
  W, H, { pad: 14, azimuth: 34, elevation: 36 },
);
const at = (p) => k.iso(p, P);
const S = (paths, o) => k.solidSvg(paths, o);
const L = (d, o) => k.lineSvg(d, o);
const D = (pts, o) => k.dotsSvg(pts, o);
const tubAt = (i) => [(i % COLS - (COLS - 1) / 2) * GAP_X, ROWS_Y[i < COLS ? 0 : 1]];
const moundH = (pct) => 3 + Math.min(MAX_PCT, pct) * PER_PCT;

// ------------------------------------------------------------- partes fijas
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(CASE, CASE_BOTTOM - FEET, 1, P)}"/>`];
  for (const [x, y] of k.corners(CASE, 18).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))) {
    out.push(S(k.cylinder(x, y, 5, CASE_BOTTOM - FEET, FEET, P, 24), { tone: "lo" }));
  }
  out.push(S(k.slabOf(CASE, CASE_BOTTOM, CASE_TOP - CASE_BOTTOM - 4, P, 8, 1.2), { tone: "mid" }));
  // rejilla del motor: ranuras cerradas en el frente
  const front = CASE.y + CASE.d;
  for (let i = 0; i < 9; i++) {
    const x = -64 + i * 16;
    out.push(L(k.pathOf([at([x, front, CASE_BOTTOM + 12]), at([x + 9, front, CASE_BOTTOM + 12]), at([x + 9, front, CASE_BOTTOM + 15]), at([x, front, CASE_BOTTOM + 15])], true), { tone: "lo" }));
  }
  // chapa con tres renglones
  const plate = [[-128, front, -16], [-84, front, -16], [-84, front, -30], [-128, front, -30]];
  out.push(L(k.pathOf(plate.map(at), true), { tone: "mid" }));
  for (const z of [-20, -23.5, -27]) out.push(L(k.pathOf([at([-124, front, z]), at([z === -27 ? -104 : -88, front, z])]), { tone: "lo", free: true }));
  out.push(D([at([-126, front, -18]), at([-86, front, -18]), at([-126, front, -28]), at([-86, front, -28])], { size: 0.45 }));
  // tapa de acero con el pozo
  out.push(S(k.slabOf(CASE, CASE_TOP - 4, 4, P, 8, 0.8), { tone: "mid" }));
  const well = k.insetPlan(CASE, 9);
  out.push(S(k.slabOf(well, CASE_TOP - 0.3, 0.3, P, 6), { tone: "lo", flat: true }));
  out.push(L(k.planOutline(k.insetPlan(CASE, 4), CASE_TOP, P), { tone: "faint" }));
  const screws = k.corners(CASE, 4.5);
  out.push(D(screws.map(([x, y]) => at([x, y, CASE_TOP])), { size: 0.5 }));
  return out.join("");
}

function wall() {
  const out = [];
  out.push(S(k.slabOf(WALL, 0, WALL_TOP, P, 3, 0.6), { tone: "mid" }));
  out.push(S(k.slabOf({ x: WALL.x - 2, y: WALL.y - 1, w: WALL.w + 4, d: WALL.d + 2, r: 2 }, WALL_TOP, 3, P, 3, 0.5), { tone: "mid" }));
  // escala: rayitas en la cara del frente, cada 5 %, número cada 10 %
  const face = WALL.y + WALL.d;
  const minor = [], major = [];
  for (let pct = 0; pct <= MAX_PCT; pct += 5) {
    const z = 3 + pct * PER_PCT;
    const long = pct % 10 === 0;
    for (const x0 of [WALL.x, WALL.x + WALL.w]) {
      const dir = x0 === WALL.x ? 1 : -1;
      (long ? major : minor).push(k.pathOf([at([x0, face, z]), at([x0 + dir * (long ? 10 : 5), face, z])]));
    }
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  for (let pct = 10; pct <= MAX_PCT; pct += 10) {
    out.push(k.faceTextSvg(k.sideMatrix([WALL.x + 12, face], 3 + pct * PER_PCT - 1.6, P, "left"), `${pct}%`, { size: 7, tone: "hi" }));
  }
  // una línea fina que cruza la pared a cada 10 %
  const rules = [];
  for (let pct = 10; pct <= MAX_PCT; pct += 10) rules.push(k.pathOf([at([WALL.x + 36, face, 3 + pct * PER_PCT]), at([WALL.x + WALL.w - 12, face, 3 + pct * PER_PCT])]));
  out.push(L(rules.join(""), { tone: "lo", dashed: true }));
  out.push(D([at([WALL.x + 4, face, WALL_TOP - 4]), at([WALL.x + WALL.w - 4, face, WALL_TOP - 4])], { size: 0.5 }));
  return out.join("");
}

// ------------------------------------------------------------- potes
function tub(i, shop, pct) {
  const [x, y] = tubAt(i);
  const out = [];
  out.push(S(k.cylinder(x, y, TUB_R, CASE_TOP - 0.3, RIM, P, 48, 0.6), { tone: "mid" }));
  out.push(L(k.ring(x, y, TUB_R - 1.6, CASE_TOP + RIM - 0.3, P, 48), { tone: "lo" }));
  if (shop) {
    out.push(`<g class="flav" data-flavor="${i % FLAVORS}" data-mound="${i}">${mound(x, y, pct)}</g>`);
    out.push(tag(i, x, y));
  } else {
    out.push(S(k.cylinder(x, y, TUB_R - 2, CASE_TOP + RIM - 1.2, 0.2, P, 40), { tone: "faint", flat: true }));
  }
  return out.join("");
}
function mound(x, y, pct) {
  const h = moundH(pct);
  const z0 = CASE_TOP + RIM - 1.2;
  const body = S(k.cylinder(x, y, MOUND_R, z0, Math.max(0.6, h - 7), P, 44, 0), { tone: "hi", crease: "none" });
  const mid = S(k.cylinder(x, y, MOUND_R - 2.6, z0 + Math.max(0.6, h - 7), 4, P, 40, 1.6), { tone: "hi", crease: "none" });
  const cap = S(k.cylinder(x, y, MOUND_R - 7, z0 + Math.max(0.6, h - 7) + 4, 3, P, 32, 1.4), { tone: "hi", crease: "none" });
  return body + mid + cap;
}
function tag(i, x, y) {
  // banderita de sabor: palito + chapita con el número, clavada en el borde de atrás del pote
  const sx = x + TUB_R - 6, sy = y - 6, top = CASE_TOP + RIM + 16;
  const flag = { x: sx - 0.6, y: sy - 0.6, w: 1.2, d: 1.2, r: 0.4 };
  return [
    S(k.slabOf(flag, CASE_TOP + RIM - 2, top - CASE_TOP - RIM + 2, P, 2), { tone: "lo", crease: "none" }),
    S(k.slabOf({ x: sx - 0.6, y: sy, w: 1.2, d: 11, r: 0.3 }, top - 7, 7, P, 2, 0.3), { tone: "hi" }),
    k.faceTextSvg(k.sideMatrix([sx + 0.7, sy + 5.5], top - 1.8, P, "right"), String(i + 1), { size: 5, tone: "hi", anchor: "middle" }),
  ].join("");
}

// ------------------------------------------------------------- página
const stage = document.getElementById("vitrina");
const res = document.getElementById("ticket");
const root = document.documentElement;
let shops = [], selected = 0, empty = "";

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pesos = (t) => Number(String(t || "").replace(/[^\d]/g, "")) || 0;
const ars = (n) => "$" + n.toLocaleString("es-AR");
const ahorro = (d) => { const a = pesos(d.before) - pesos(d.now); return a > 0 ? a : 0; };
const mejorDe = (s) => s.deals.slice().sort((a, b) => b.off - a.off)[0];
const corto = (n) => n.split(" - ")[0];
const movil = () => matchMedia("(max-width: 999px)").matches;

function rotulos() {
  const order = shops.map((_, i) => i).sort((a, b) => k.depthOf([...tubAt(a), 0], P) - k.depthOf([...tubAt(b), 0], P));
  return order.map((i) => {
    const [x, y] = tubAt(i);
    const [sx, sy] = at([x, y, CASE_TOP + RIM + moundH(shops[i].best) + 4]);
    return `<g class="rot${i === selected ? " sel" : ""}" data-i="${i}"><text x="${sx.toFixed(1)}" y="${(sy - 6).toFixed(1)}" text-anchor="middle">−${Math.round(shops[i].best)}%</text></g>`;
  }).join("");
}

function dibujar() {
  const order = [...Array(COLS * 2).keys()].sort((a, b) => k.depthOf([...tubAt(a), 0], P) - k.depthOf([...tubAt(b), 0], P));
  const hits = shops.map((s, i) => {
    const [x, y] = tubAt(i);
    return `<path class="hit" data-i="${i}" d="${k.ring(x, y, TUB_R + 4, CASE_TOP + RIM + moundH(s.best) / 2, P, 32)}"/>`;
  }).join("");
  stage.innerHTML = k.figureSvg({
    width: W, height: H,
    label: `Heladera con ${shops.length} potes, uno por heladería, del descuento más grande al más chico.`,
    body: [wall(), base(), order.map((i) => tub(i, shops[i], shops[i] ? shops[i].best : 0)).join(""), `<g class="rotulos">${rotulos()}</g>`, `<g class="hits">${hits}</g>`],
  });
  for (const h of stage.querySelectorAll(".hit")) h.addEventListener("click", () => choose(Number(h.dataset.i), true));
}

// piezas de texto
// cada app con su color, para reconocerla de un vistazo
const plataforma = (p) => /rappi/i.test(p) ? "rappi" : /pedidos/i.test(p) ? "pya" : /uber/i.test(p) ? "uber" : "otra";
const pedir = (s, cls = "pedir") => s.url ? `<a class="${cls} app-${plataforma(s.platform)}" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="pedir-en">Pedir en </span>${esc(s.platform || "la app")}</a>` : "";
const precio = (m) => `<p class="precio"><b>${esc(m.now)}</b>${m.before ? ` <s>${esc(m.before)}</s>` : ""}</p>`;
const ahorra = (m) => ahorro(m) ? `<p class="ahorro">Ahorrás ${ars(ahorro(m))}</p>` : "";
const sel = (i) => `<button type="button" class="elegir" data-i="${i}" aria-pressed="${i === selected}" aria-label="Ver ${esc(shops[i].name)} en la heladera">`;

function podio() {
  const top = shops.slice(0, 3).map((s, i) => {
    const m = mejorDe(s);
    return `<article class="pod${i === selected ? " on" : ""}" style="--c:var(--f${i})">
      ${sel(i)}<span class="puesto">${i + 1}º</span><span class="pct">−${Math.round(s.best)}%</span><span class="nm">${esc(corto(s.name))}</span></button>
      <p class="prod">${esc(m.name)}</p>${precio(m)}${ahorra(m)}${pedir(s)}
    </article>`;
  }).join("");
  const resto = shops.slice(3).map((s, j) => {
    const i = j + 3;
    return `<li style="--c:var(--f${i % FLAVORS})">${sel(i)}<span class="puesto">${i + 1}º</span><span class="pct-s">−${Math.round(s.best)}%</span><span class="nm">${esc(corto(s.name))}</span></button></li>`;
  }).join("");
  return `<h2 class="res-t">Los mejores descuentos de hoy</h2><div class="podio">${top}</div>${resto ? `<ol class="resto">${resto}</ol>` : ""}`;
}

function grilla() {
  return `<h2 class="res-t">Todos los descuentos, de mayor a menor</h2><ol class="grilla">${shops.map((s, i) => {
    const m = mejorDe(s);
    return `<li class="${i === selected ? "on" : ""}" style="--c:var(--f${i % FLAVORS})">
      ${sel(i)}<span class="puesto">${i + 1}º</span><span class="pct">−${Math.round(s.best)}%</span><span class="nm">${esc(corto(s.name))}</span></button>
      <p class="prod">${esc(m.name)}</p>${precio(m)}${ahorra(m)}${pedir(s)}
    </li>`;
  }).join("")}</ol>`;
}

function foco() {
  const s = shops[selected], m = mejorDe(s);
  const chips = shops.map((x, i) => `<li style="--c:var(--f${i % FLAVORS})">${sel(i)}<span class="pct-s">−${Math.round(x.best)}%</span><span class="nm">${esc(corto(x.name))}</span></button></li>`).join("");
  return `<div class="foco" style="--c:var(--f${selected % FLAVORS})">
      <div class="foco-num"><p class="puesto-g">${selected === 0 ? "El mejor de hoy" : `${selected + 1}º mejor`}</p><h2 class="quien">${esc(corto(s.name))}</h2><p class="numero"><span class="menos">−</span>${Math.round(s.best)}<span class="pc">%</span></p></div>
      <div class="foco-dato"><p class="prod">${esc(m.name)}</p>${precio(m)}${ahorra(m)}${pedir(s, "pedir pedir-grande")}<p class="meta">${esc(s.meta)}</p></div>
    </div>
    <ol class="chips-d" aria-label="Todas las heladerías">${chips}</ol>`;
}

function pintar() {
  if (!shops.length) { res.innerHTML = `<p class="vacio">${esc(empty || "Tocá “Traer descuentos” y se llena la heladera.")}</p>`; return; }
  const layout = root.dataset.layout;
  res.innerHTML = layout === "grilla" ? grilla() : layout === "foco" ? foco() : podio();
  for (const b of res.querySelectorAll(".elegir")) b.addEventListener("click", () => choose(Number(b.dataset.i), false));
}

function render(data) {
  shops = data.shops.slice().sort((a, b) => b.best - a.best).slice(0, COLS * 2);
  empty = data.empty;
  selected = Math.min(selected, Math.max(0, shops.length - 1));
  dibujar();
  pintar();
}

// elegir desde la heladera o desde la lista: se marcan los dos lados
function choose(i, desdeDibujo) {
  if (!shops[i]) return;
  selected = i;
  for (const g of stage.querySelectorAll(".rot")) g.classList.toggle("sel", Number(g.dataset.i) === i);
  if (root.dataset.layout === "foco") { pintar(); if (desdeDibujo && movil()) res.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  for (const b of res.querySelectorAll(".elegir")) {
    const on = Number(b.dataset.i) === i;
    b.setAttribute("aria-pressed", String(on));
    b.parentElement.classList.toggle("on", on);
  }
  if (desdeDibujo) res.querySelector(`.elegir[data-i="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

stage.addEventListener("keydown", (e) => {
  const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(e.key in map) || !shops.length) return;
  e.preventDefault();
  choose((selected + map[e.key] + shops.length) % shops.length, false);
});

// diseño: para comparar las tres opciones; se guarda en el navegador
let layout = "podio";
try { layout = localStorage.getItem("cuartito:layout:mostrador") || layout; } catch { /* nada */ }
const ponerLayout = (v) => {
  root.dataset.layout = ["podio", "grilla", "foco"].includes(v) ? v : "podio";
  for (const b of document.querySelectorAll("[data-set-layout]")) b.setAttribute("aria-pressed", String(b.dataset.setLayout === root.dataset.layout));
  pintar();
};
for (const b of document.querySelectorAll("[data-set-layout]")) b.addEventListener("click", () => {
  ponerLayout(b.dataset.setLayout);
  try { localStorage.setItem("cuartito:layout:mostrador", b.dataset.setLayout); } catch { /* nada */ }
});
ponerLayout(layout);

// lemas para probar: el botón "Otro lema" los va pasando
const LEMAS = [
  "¿Cansad@ de que te cobren el envío más caro que el cuarto?",
  "Tres apps, un cuarto, cero verso.",
  "Te cobran el helado de más. Acá está la prueba.",
  "Rappi, PedidosYa y Uber Eats se pelean. Vos tomás helado.",
  "El helado no tendría que costar un riñón.",
];
const lemaEl = document.querySelector("[data-lema]");
let lema = 0;
try { lema = Number(localStorage.getItem("cuartito:lema:mostrador")) || 0; } catch { /* nada */ }
const ponerLema = (n) => { lema = (n + LEMAS.length) % LEMAS.length; lemaEl.textContent = LEMAS[lema]; };
document.querySelector("[data-otro-lema]")?.addEventListener("click", () => {
  ponerLema(lema + 1);
  try { localStorage.setItem("cuartito:lema:mostrador", String(lema)); } catch { /* nada */ }
});
ponerLema(lema);
alCambiar(render);
