// La vitrina: una heladera de mostrador dibujada con el kit isométrico de anatomy (MIT).
// Cada pote es una heladería; el helado sube tanto como su mejor descuento, medido contra la
// escala de la pared del fondo (0 a 60 %). La pala de metal va al pote que elegís.
import * as k from "../lib/iso-kit.mjs";
import { alCambiar, paletas } from "../lib/datos.js";

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

// la pala: la única parte iluminada
function scoop() {
  return [
    `<path class="iso-halo" d="${k.haloOf({ x: -10, y: -12, w: 20, d: 52, r: 6 }, -8, 0.1, P)}" style="filter:blur(3px);opacity:.35"/>`,
    S(k.slabOf({ x: -10, y: -12, w: 20, d: 18, r: 7 }, 0, 1.8, P, 6, 0.5), { tone: "hi", lit: true }),
    S(k.slabOf({ x: -2.2, y: 5, w: 4.4, d: 34, r: 1.8 }, 1.8, 3, P, 4, 0.6), { tone: "hi", lit: true }),
    S(k.cylinder(0, 40, 3.4, 0.8, 4.6, P, 20, 0.7), { tone: "mid" }),
  ].join("");
}

// ------------------------------------------------------------- página
const stage = document.getElementById("vitrina");
const readout = document.querySelector("[data-readout]");
const detail = document.getElementById("detalle");
const indice = document.getElementById("indice");
const still = matchMedia("(prefers-reduced-motion: reduce)");
let shops = [], selected = 0, touring = !still.matches, pos = [0, 0, 0], target = [0, 0, 0];
let heights = [], grow = 0, frame = 0, last = 0, clock = 0, idle = 0, visible = true;

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function render(data) {
  shops = data.shops.slice(0, COLS * 2);
  heights = shops.map((s) => s.best);
  grow = still.matches ? 1 : 0;
  selected = Math.min(selected, Math.max(0, shops.length - 1));
  const order = [...Array(COLS * 2).keys()].sort((a, b) => {
    const [ax, ay] = tubAt(a), [bx, by] = tubAt(b);
    return k.depthOf([ax, ay, 0], P) - k.depthOf([bx, by, 0], P);
  });
  const hits = shops.map((s, i) => {
    const [x, y] = tubAt(i);
    return `<path class="hit" data-i="${i}" d="${k.ring(x, y, TUB_R + 4, CASE_TOP + RIM + moundH(s.best) / 2, P, 32)}"/>`;
  }).join("");
  const svg = k.figureSvg({
    width: W, height: H,
    label: `Vitrina de helado con ${shops.length} potes: cada pote es una heladería y el helado sube tanto como su mejor descuento, medido en la escala de la pared del fondo.`,
    body: [
      wall(), base(),
      order.map((i) => tub(i, shops[i], 0)).join(""),
      `<g data-part="scoop">${scoop()}</g>`,
      `<g class="hits">${hits}</g>`,
    ],
  });
  stage.innerHTML = svg;
  for (const h of stage.querySelectorAll(".hit")) {
    h.addEventListener("pointerenter", () => choose(Number(h.dataset.i)));
    h.addEventListener("click", () => choose(Number(h.dataset.i)));
  }
  indice.innerHTML = shops.length
    ? shops.map((s, i) => `<li><button type="button" data-i="${i}" aria-pressed="${i === selected}"><span class="n">${i + 1}</span>${esc(s.name.split(" - ")[0])}<span class="p">−${Math.round(s.best)}%</span></button></li>`).join("")
    : "";
  for (const b of indice.querySelectorAll("button")) b.addEventListener("click", () => choose(Number(b.dataset.i)));
  target = scoopTarget(selected);
  pos = [...target];
  describe();
  run();
}

const scoopTarget = (i) => {
  if (!shops[i]) return [0, 120, 30];
  const [x, y] = tubAt(i);
  return [x - 2, y + 2, CASE_TOP + RIM + moundH(shops[i].best) + 10];
};

function describe() {
  const s = shops[selected];
  if (!s) {
    readout.textContent = "vitrina vacía";
    detail.innerHTML = `<p class="vacio">${esc(document.querySelector("#list .empty")?.textContent || "Tocá “Traer descuentos” y se llena la vitrina.")}</p>`;
    return;
  }
  readout.textContent = `pote ${selected + 1} · −${Math.round(s.best)}%`;
  const deals = s.deals.slice(0, 4).map((d) => `<li><span class="off">−${Math.round(d.off)}%</span><span class="nm">${esc(d.name)}${d.plus ? " <em>(Plus)</em>" : ""}</span><span class="pr">${esc(d.now)} <s>${esc(d.before)}</s></span></li>`).join("");
  detail.innerHTML = `<p class="num">${selected + 1}</p>
    <h3>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</h3>
    <p class="meta">${esc(s.meta)}${s.closed ? " · cerrada ahora" : ""}</p>
    <ul>${deals}</ul>
    ${s.deals.length > 4 ? `<p class="mas">y ${s.deals.length - 4} descuentos más</p>` : ""}`;
  for (const b of indice.querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.i) === selected));
}

function choose(i, fromTour = false) {
  if (!shops[i]) return;
  if (!fromTour) {
    touring = false;
    clearTimeout(idle);
    idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 6000);
  }
  if (i === selected && !fromTour) return;
  selected = i;
  target = scoopTarget(i);
  describe();
  run();
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring && shops.length > 1) {
    clock += dt;
    if (clock > 2.8) { clock = 0; choose((selected + 1) % shops.length, true); }
  }
  // los potes se llenan una vez cuando llegan los datos
  if (grow < 1) {
    grow = Math.min(1, grow + dt / 1.4);
    const e = 1 - Math.pow(1 - grow, 3);
    shops.forEach((s, i) => {
      const g = stage.querySelector(`[data-mound="${i}"]`);
      const [x, y] = tubAt(i);
      if (g) g.innerHTML = mound(x, y, s.best * e);
    });
  }
  const f = still.matches ? 1 : 1 - Math.exp(-dt / 0.22);
  pos = pos.map((v, j) => v + (target[j] - v) * f);
  const sc = stage.querySelector('[data-part="scoop"]');
  if (sc) sc.setAttribute("transform", k.translateAlong(P, pos));
  const moving = pos.some((v, j) => Math.abs(v - target[j]) > 0.02);
  frame = visible && (moving || grow < 1 || touring) ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }).observe(stage);

stage.addEventListener("keydown", (e) => {
  const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(e.key in map) || !shops.length) return;
  e.preventDefault();
  choose((selected + map[e.key] + shops.length) % shops.length);
});

paletas(["marmol", "noche", "pistacho"], "cuartito:paleta:vitrina");
document.documentElement.addEventListener("paleta", () => {
  document.body.dataset.theme = document.documentElement.dataset.paleta === "noche" ? "dark" : "light";
});
document.body.dataset.theme = document.documentElement.dataset.paleta === "noche" ? "dark" : "light";
alCambiar(render);
