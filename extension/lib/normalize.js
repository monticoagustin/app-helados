// Normalizador: tamaños, precio por kg y promos → % de descuento efectivo.
// Es la parte más crítica: cualquier cambio acá tiene que pasar los tests.

const FRACTIONS = { "½": "1/2", "¼": "1/4", "¾": "3/4" };

function clean(text) {
  let t = String(text || "");
  for (const [sym, frac] of Object.entries(FRACTIONS)) t = t.split(sym).join(` ${frac} `);
  t = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return ` ${t.replace(/\s+/g, " ")} `;
}

function num(token) {
  if (token.includes("/")) {
    const [a, b] = token.split("/").map(Number);
    return a / b;
  }
  return Number(token.replace(",", "."));
}

const NUM = String.raw`(\d+\/\d+|\d+(?:[.,]\d+)?)`;
const KG = new RegExp(NUM + String.raw`\s*(?:kg|kgs|kilo|kilos|k)\b`);
const G = new RegExp(NUM + String.raw`\s*(?:g|gr|grs|gramos)\b`);
const MULT = /\b(\d+)\s*x\s*/;

/** Tamaño total en kg ("1/2Kg" → 0.5, "2 x 1/4" → 0.5) o null. */
export function parseSizeKg(text) {
  if (!text) return null;
  let t = clean(text);
  let multiplier = 1;
  const mult = t.match(MULT);
  if (mult) {
    multiplier = Number(mult[1]);
    t = t.slice(0, mult.index) + " " + t.slice(mult.index + mult[0].length);
  }
  let size = null;
  let m;
  if ((m = t.match(KG))) size = num(m[1]);
  else if ((m = t.match(G))) size = num(m[1]) / 1000;
  else if (/\b(1\/4|cuarto)\b/.test(t)) size = 0.25;
  else if (/\b(1\/2|medio)\b/.test(t)) size = 0.5;
  else if (/\b3\/4\b/.test(t)) size = 0.75;
  else if (/\bkilo\b|\bkg\b/.test(t)) size = 1;
  if (size == null || !(size > 0) || size > 5) return null;
  return Math.round(size * multiplier * 1000) / 1000;
}

export function pricePerKg(price, sizeKg) {
  if (!price || !sizeKg) return null;
  return Math.round((price / sizeKg) * 100) / 100;
}

export function discountPct(price, originalPrice) {
  if (!price || !originalPrice || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 1000) / 10;
}

const PAYMENT_WORDS = [
  "mercado pago", "modo", "visa", "mastercard", "master", "amex", "banco", "santander",
  "galicia", "bbva", "macro", "naranja", "uala", "cuenta dni", "credicoop", "icbc", "hsbc",
  "patagonia", "supervielle", "brubank", "personal pay", "tarjeta", "rappipay", "rappi card",
];

function parseAmount(raw, suffix) {
  let n = raw.replace(/\./g, "").replace(",", ".");
  let value = Number(n);
  if (Number.isNaN(value)) return null;
  if (suffix && /^(mil|k)$/.test(suffix)) value *= 1000;
  return value;
}

/**
 * Convierte el texto de una promo en un modelo común.
 * Devuelve { text, kind, pct, upTo, freeShipping, minAmount, cap, payment }
 *  - kind: percent | multi_buy | second_unit | free_shipping | other
 *  - pct: % de descuento efectivo sobre el total (2x1 → 50, 2do al 50% → 25)
 */
export function parsePromo(text) {
  const t = clean(text);
  const out = {
    text: String(text || "").trim(),
    kind: "other",
    pct: null,
    upTo: /\bhasta\b/.test(t),
    freeShipping: /envio\s*gratis|delivery\s*gratis|\$\s*0\s*(de\s*)?envio/.test(t),
    minAmount: null,
    cap: null,
    payment: null,
  };

  let m;
  if ((m = t.match(/\b(\d)\s*x\s*(\d)\b/)) && Number(m[1]) > Number(m[2])) {
    const lleva = Number(m[1]);
    const paga = Number(m[2]);
    out.kind = "multi_buy";
    out.pct = Math.round((1 - paga / lleva) * 1000) / 10;
  } else if ((m = t.match(/\b(segund[oa]|2\s*(?:do|da|°|º))\s+(?:unidad\s+|producto\s+)?(al\s+|con\s+(?:un\s+)?|a\s+)?(\d{1,3})\s*%/))) {
    // "2do al 50%"        → pagás el 50% de la segunda → 50% off en la segunda
    // "2da unidad 70% off" → 70% off en la segunda
    // En los dos casos, sobre el total de 2 unidades el descuento es la mitad.
    const n = Number(m[3]);
    const saysOff = /\boff\b|descuento|\bdto\b/.test(t);
    const secondOff = m[2] && m[2].startsWith("al") && !saysOff ? 100 - n : n;
    out.kind = "second_unit";
    out.pct = Math.round((secondOff / 2) * 10) / 10;
  } else if ((m = t.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/))) {
    out.kind = "percent";
    out.pct = Number(m[1].replace(",", "."));
  } else if (out.freeShipping) {
    out.kind = "free_shipping";
  }

  if ((m = t.match(/m[i]n(?:imo)?\.?\s*(?:de\s*compra\s*)?\$?\s*([\d.,]+)\s*(mil|k)?/))) {
    out.minAmount = parseAmount(m[1], m[2]);
  }
  if ((m = t.match(/tope\s*(?:de\s*)?(?:reintegro\s*)?\$?\s*([\d.,]+)\s*(mil|k)?/))) {
    out.cap = parseAmount(m[1], m[2]);
  }
  const pay = PAYMENT_WORDS.find((w) => t.includes(` ${w}`));
  if (pay) out.payment = pay;
  return out;
}

const ICE_CREAM_KEYWORDS = [
  "helad", "gelat", "ice cream", "sorbet", "cremolatti", "grido", "freddo", "rapanui",
  "persicco", "chungo", "lucciano", "jauja", "nicolo", "via flaminia",
];

export function isIceCreamStore(name, categories = [], extra = "") {
  const hay = clean([name, ...categories, extra].join(" "));
  return ICE_CREAM_KEYWORDS.some((k) => hay.includes(k));
}

const NOT_BULK = /\b(palito|palitos|bombon|bombones|paleta|paletas|alfajor|torta|postre|cucurucho|cono|almendrado|escoces|casata|tentacion|helado de agua|unidades|\d+\s*u)\b/;

/** ¿Es helado por peso (cuarto, medio, kilo)? Los packs de palitos o bombones no cuentan para $/kg. */
export function isBulkIceCream(name) {
  return !NOT_BULK.test(clean(name));
}

const ICE_CREAM_WORDS = /\b(helad\w*|gelat\w*|sorbet\w*|palitos?|bombon\w*|paletas?|sundae|frapp\w*|batidos?|milkshake|almendrado|escoces\w*|casata|tentacion|cucuruchos?|cuchuruchos?|conos?|kilos?|kg|cuartos?|medio|1\/4|1\/2|potes?|copas?|affogato|granizad\w*)\b/;
const NOT_ICE_CREAM = /\b(agua|aguas|gaseosas?|coca|cola|sprite|fanta|pepsi|7up|cervezas?|vinos?|jugos?|soda|cafe|te|infusion\w*|alfajor\w*|galletit\w*|budin\w*|medialunas?|facturas?|sandwich\w*|tostados?|bolsas?|envases?|vasos?|cucharas?|cucharitas?|servilletas?|propina|chocolatada|yogur\w*)\b/;

/** ¿Es un producto de helado? Excluye bebidas, alfajores, panificados y accesorios. */
export function isIceCreamProduct(name, description = "", section = "") {
  const n = clean(name);
  if (NOT_ICE_CREAM.test(n) && !/helad/.test(n)) return false;
  return ICE_CREAM_WORDS.test(clean(`${name} ${description} ${section}`));
}

/** Completa un producto con tamaño, % y precio por kg (solo helado por peso). */
export function normalizeProduct({ name, description = "", section = "", price, originalPrice }) {
  const original = originalPrice && originalPrice >= price ? originalPrice : price;
  const isIceCream = isIceCreamProduct(name, description, section);
  const sizeKg = isIceCream && isBulkIceCream(name) ? parseSizeKg(`${name} ${description}`) : null;
  return {
    name,
    price,
    originalPrice: original,
    discountPct: discountPct(price, original),
    sizeKg,
    pricePerKg: pricePerKg(price, sizeKg),
    isIceCream,
  };
}

/** Agrega a la heladería sus resúmenes: mejor % efectivo, mejor $/kg, envío gratis.
 *  Solo cuentan los productos de helado (no bebidas, alfajores, etc.). */
export function summarizeStore(store) {
  const promos = (store.promos || []).filter(Boolean).map(parsePromo);
  const all = store.products || [];
  const products = all.filter((p) => p.isIceCream !== false);
  const productPcts = products.map((p) => p.discountPct || 0);
  // No cuentan para el ranking: promos con medio de pago, y los "Hasta X% off" cuando ya
  // tenemos los productos (ese "hasta" puede venir de una gaseosa; mejor el dato real).
  const promoPcts = promos
    .filter((p) => p.pct && !p.payment && !(p.upTo && all.length))
    .map((p) => p.pct);
  const best = Math.max(0, ...productPcts, ...promoPcts);
  // Productos de helado con descuento, de mayor a menor %: es lo que se muestra.
  const deals = products.filter((p) => p.discountPct).sort((a, b) => b.discountPct - a.discountPct);
  const perKg = products.map((p) => p.pricePerKg).filter(Boolean);
  return {
    ...store,
    products,
    deals,
    promosParsed: promos,
    bestDiscountPct: best > 0 ? best : null,
    bestPricePerKg: perKg.length ? Math.min(...perKg) : null,
    freeShipping: Boolean(store.freeShipping || promos.some((p) => p.freeShipping)),
  };
}
