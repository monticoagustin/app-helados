// CARTEL — mezcla de Monumento y Vidriera: titular grande, la heladera de Vitrina (kit Anatomy) sobre una
// forma azul con el % del elegido gigante detrás, y abajo el destacado y todas las heladerías en franjas de color.
// Paleta atardecer (#F8B195 #F67280 #C06C84 #6C5B7B #355C7D), letra Anton. Lee #list con lib/datos.js.
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
const gigante = document.querySelector("[data-gigante]");
let shops = [], selected = 0, empty = "";

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pesos = (t) => Number(String(t || "").replace(/[^\d]/g, "")) || 0;
const ars = (n) => "$" + n.toLocaleString("es-AR");
const ahorro = (d) => { const a = pesos(d.before) - pesos(d.now); return a > 0 ? a : 0; };
const mejorDe = (s) => s.deals.slice().sort((a, b) => b.off - a.off)[0];
const corto = (n) => n.split(" - ")[0];
const plataforma = (p) => /rappi/i.test(p) ? "rappi" : /pedidos/i.test(p) ? "pya" : /uber/i.test(p) ? "uber" : "otra";
const pedir = (s) => s.url ? `<a class="pedir app-${plataforma(s.platform)}" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="pedir-en">Pedir en&nbsp;</span>${esc(s.platform || "la app")}</a>` : "";

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

// el destacado (la heladería elegida) y la franja con todas
function pintar() {
  if (!shops.length) {
    gigante.textContent = "−0%";
    res.innerHTML = `<p class="vacio">${esc(empty || "Tocá “Traer descuentos” y se llena la heladera.")}</p>`;
    return;
  }
  const s = shops[selected], m = mejorDe(s), a = ahorro(m);
  gigante.textContent = `−${Math.round(s.best)}%`;
  const fila = shops.map((x, i) => {
    const mx = mejorDe(x), ax = ahorro(mx);
    return `<li class="${i === selected ? "on" : ""}" style="--i:${i % 4}">
      <button type="button" class="elegir" data-i="${i}" aria-pressed="${i === selected}"><span class="p">−${Math.round(x.best)}%</span><span class="n">${esc(corto(x.name))}</span>
        <span class="x">${esc(mx.name)}: <b>${esc(mx.now)}</b>${mx.before ? ` <s>${esc(mx.before)}</s>` : ""}${ax ? ` · ahorrás ${ars(ax)}` : ""}</span></button>
      ${pedir(x)}
    </li>`;
  }).join("");
  res.innerHTML = `<div class="abajo">
      <article class="destacado">
        <p class="cual">${selected === 0 ? "El mejor de hoy" : `${selected + 1}º de ${shops.length}`}</p>
        <p class="p">−${Math.round(s.best)}%</p>
        <h2 class="n">${esc(corto(s.name))}</h2>
        <p class="x">${esc(m.name)}: <b>${esc(m.now)}</b>${m.before ? ` <s>${esc(m.before)}</s>` : ""}</p>
        ${a ? `<p class="ah">Te ahorrás ${ars(a)}</p>` : ""}
        ${pedir(s)}
      </article>
      <ol class="franja" aria-label="Todas las heladerías, de mayor a menor descuento">${fila}</ol>
    </div>`;
  for (const b of res.querySelectorAll(".elegir")) b.addEventListener("click", () => choose(Number(b.dataset.i), false));
}

function render(data) {
  shops = data.shops.slice().sort((a, b) => b.best - a.best).slice(0, COLS * 2);
  empty = data.empty;
  selected = Math.min(selected, Math.max(0, shops.length - 1));
  dibujar();
  pintar();
}

function choose(i, desdeDibujo) {
  if (!shops[i]) return;
  selected = i;
  for (const g of stage.querySelectorAll(".rot")) g.classList.toggle("sel", Number(g.dataset.i) === i);
  pintar();
  if (desdeDibujo && matchMedia("(max-width: 999px)").matches) res.scrollIntoView({ behavior: "smooth", block: "start" });
}

stage.addEventListener("keydown", (e) => {
  const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(e.key in map) || !shops.length) return;
  e.preventDefault();
  choose((selected + map[e.key] + shops.length) % shops.length, false);
});

alCambiar(render);
