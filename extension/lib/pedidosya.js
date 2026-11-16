// Parser de PedidosYa. Todavía no vimos el JSON real (el desafío anti-bot frenó la
// investigación), así que es heurístico: recorre todas las respuestas buscando objetos
// que parezcan un local o un producto. Con la primera captura real lo ajustamos.
import { isIceCreamStore, normalizeProduct, summarizeStore } from "./normalize.js";

export const PEDIDOSYA_BASE = "https://www.pedidosya.com.ar";

const ID_KEYS = ["id", "partnerId", "restaurantId", "vendorId", "storeId"];
const NAME_KEYS = ["name", "businessName", "restaurantName", "title"];
const RATING_KEYS = ["rating", "ratingScore", "generalScore", "score", "averageRating"];
const ETA_KEYS = ["deliveryTime", "deliveryTimeText", "eta", "deliveryTimeRange", "estimatedDeliveryTime"];
const FEE_KEYS = ["shippingAmount", "deliveryFee", "shippingFee", "deliveryCost", "shipping"];
const ADDRESS_KEYS = ["address", "street", "addressLine", "formattedAddress"];
const CATEGORY_KEYS = ["categories", "cuisines", "foodCategories", "mainCategory", "tags"];
const PROMO_KEYS = ["discounts", "promotions", "campaigns", "badges", "promotionText", "discountText", "tags"];
const URL_KEYS = ["link", "url", "permalink", "slug"];
const PRICE_KEYS = ["price", "finalPrice", "discountedPrice", "priceAfterDiscount", "unitPrice", "amount"];
const ORIGINAL_KEYS = ["originalPrice", "realPrice", "priceBeforeDiscount", "beforePrice", "previousPrice", "oldPrice",
  "strikethroughPrice", "basePrice", "listPrice", "regularPrice"];
const PRODUCT_LIST_KEYS = ["products", "items", "menuItems", "sections", "categories", "corridors"];
const STORE_SIGNALS = [...RATING_KEYS, ...ETA_KEYS, ...FEE_KEYS];

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);

function first(d, keys) {
  for (const k of keys) if (k in d && !empty(d[k])) return d[k];
  return null;
}

export function toNumber(v) {
  if (v == null || typeof v === "boolean") return null;
  if (typeof v === "number") return v;
  if (isObj(v)) return toNumber(first(v, ["amount", "value", "price", "score"]));
  if (typeof v === "string") {
    let s = v.replace(/\$|\s/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function toText(v) {
  if (v == null) return null;
  if (["string", "number"].includes(typeof v)) return String(v);
  if (isObj(v)) return toText(first(v, ["text", "name", "label", "description", "value"]));
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ") || null;
  return null;
}

function texts(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(texts);
  const t = toText(v);
  return t ? [t] : [];
}

function* walk(node) {
  if (Array.isArray(node)) for (const v of node) yield* walk(v);
  else if (isObj(node)) {
    yield node;
    for (const v of Object.values(node)) yield* walk(v);
  }
}

export function looksLikeStore(d) {
  return first(d, ID_KEYS) != null && typeof first(d, NAME_KEYS) === "string"
    && STORE_SIGNALS.filter((k) => k in d).length >= 2;
}

function looksLikeProduct(d) {
  return typeof first(d, NAME_KEYS) === "string" && toNumber(first(d, PRICE_KEYS)) != null && !looksLikeStore(d);
}

function productsInside(d) {
  const out = [];
  const seen = new Set();
  for (const key of PRODUCT_LIST_KEYS) {
    if (!(key in d)) continue;
    for (const node of walk(d[key])) {
      if (!looksLikeProduct(node)) continue;
      const name = first(node, NAME_KEYS);
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(normalizeProduct({
        name,
        description: node.description || "",
        price: toNumber(first(node, PRICE_KEYS)),
        originalPrice: toNumber(first(node, ORIGINAL_KEYS)),
      }));
    }
  }
  return out;
}

function storeUrl(d) {
  const v = first(d, URL_KEYS);
  if (typeof v !== "string") return null;
  if (v.startsWith("http")) return v;
  if (v.startsWith("/")) return PEDIDOSYA_BASE + v;
  return null;
}

function parseStore(d) {
  const fee = toNumber(first(d, FEE_KEYS));
  return {
    platform: "pedidosya",
    id: String(first(d, ID_KEYS)),
    name: first(d, NAME_KEYS).trim(),
    address: toText(first(d, ADDRESS_KEYS)),
    rating: toNumber(first(d, RATING_KEYS)),
    eta: toText(first(d, ETA_KEYS)),
    deliveryFee: fee,
    freeShipping: fee === 0,
    open: d.opened ?? d.isOpen ?? (d.status ? /open|abierto/i.test(String(d.status)) : null),
    url: storeUrl(d),
    promos: [...new Set(texts(first(d, PROMO_KEYS)))],
    categories: texts(first(d, CATEGORY_KEYS)),
    products: productsInside(d),
  };
}

const richness = (s) => s.products.length * 10 + s.promos.length
  + ["address", "rating", "eta", "deliveryFee", "url"].filter((k) => s[k] != null).length;

function merge(a, b) {
  const [base, other] = richness(b) > richness(a) ? [b, a] : [a, b];
  for (const k of ["address", "rating", "eta", "deliveryFee", "url", "open", "location", "categoryIds"]) if (base[k] == null) base[k] = other[k];
  base.promos = [...new Set([...base.promos, ...other.promos])];
  base.categories = [...new Set([...base.categories, ...other.categories])];
  if (!base.products.length) base.products = other.products;
  return base;
}

// ---------------------------------------------------------------- formato real (2026-11-16)
// POST /v4/shoplist/vendors?size=30&page=N → { vendors: [ { id, name, url, rating:{score,surveyCount},
//   delivery:{ bucket:{label}, price:{ deliveryFeeTotal, deliveryFeeTotalWithDiscount } },
//   state:{status}, location:{latitude,longitude}, mainFoodCategories:[{id,name}],
//   discounts:[{ type, amount, calculationType, discountTag, conditions }], discountSummary:{totalAmount,type} } ] }
export const HELADOS_CATEGORY_ID = 25;

const isVendor = (v) => isObj(v) && v.id != null && typeof v.name === "string"
  && (isObj(v.delivery) || isObj(v.state) || isObj(v.rating));

function discountTexts(v) {
  const out = [];
  for (const d of Array.isArray(v.discounts) ? v.discounts : []) {
    if (!isObj(d)) continue;
    const plus = isObj(d.conditions) && "SUBSCRIPTION" in d.conditions ? " (con PedidosYa Plus)" : "";
    const pct = d.calculationType === "PERCENTAGE" ? Number(d.amount) : null;
    if (d.type === "DELIVERY_FEE" || d.target === "DELIVERY_FEE") {
      out.push(pct === 100 ? `Envío gratis${plus}` : pct ? `Envío ${pct}% off${plus}` : `Envío con descuento${plus}`);
    } else if (/SUBSIDIZED_PRODUCT|WEEKLY/.test(String(d.type)) && pct) {
      // Descuento en algunos productos del menú (el % es el máximo): "Hasta X% off".
      const plusOnly = /PLUS/.test(String(d.type)) ? " (con PedidosYa Plus)" : plus;
      out.push(`Hasta ${pct}% off en productos${plusOnly}`);
    } else if (d.discountTag) {
      out.push(`${d.discountTag}${plus}`);
    } else if (pct) {
      out.push(`${pct}% off${plus}`);
    } else if (d.amount) {
      out.push(`$${Math.round(d.amount).toLocaleString("es-AR")} off${plus}`);
    }
  }
  const sum = isObj(v.discountSummary) ? v.discountSummary : null;
  if (sum && Number(sum.totalAmount) > 0 && sum.type === "PERCENTAGE" && !out.some((t) => t.startsWith("Hasta "))) {
    out.push(`Hasta ${Number(sum.totalAmount)}% off`);
  }
  return [...new Set(out)];
}

export function parseVendor(v) {
  const price = isObj(v.delivery?.price) ? v.delivery.price : {};
  const fee = toNumber(price.deliveryFeeTotalWithDiscount ?? price.deliveryFeeTotal);
  return {
    platform: "pedidosya",
    id: String(v.id),
    name: v.name.trim(),
    address: null,
    rating: toNumber(v.rating?.score) ? Math.round(toNumber(v.rating.score) * 10) / 10 : null,
    reviews: toNumber(v.rating?.surveyCount),
    eta: v.delivery?.bucket?.label || v.distance?.delivery?.valueLabel || null,
    deliveryFee: fee,
    freeShipping: fee === 0,
    open: v.state?.status ? v.state.status === "OPEN" : null,
    url: typeof v.url === "string" ? (v.url.startsWith("http") ? v.url : PEDIDOSYA_BASE + v.url) : null,
    location: v.location ? { lat: v.location.latitude, lng: v.location.longitude } : null,
    distanceKm: toNumber(v.distance?.legacyDistance),
    categories: (v.mainFoodCategories || []).map((c) => c?.name).filter(Boolean),
    categoryIds: (v.mainFoodCategories || []).map((c) => c?.id).filter((x) => x != null),
    promos: discountTexts(v),
    products: [],
  };
}

/** Locales con el formato real de /v4/shoplist/vendors (cualquier objeto con { vendors: [...] }). */
export function parseVendorLists(payloads) {
  const out = [];
  for (const payload of payloads) {
    for (const node of walk(payload)) {
      if (Array.isArray(node.vendors)) out.push(...node.vendors.filter(isVendor).map(parseVendor));
    }
  }
  return out;
}

/** Todas las heladerías encontradas en las respuestas capturadas. */
export function parseCaptured(payloads) {
  const byId = new Map();
  for (const s of parseVendorLists(payloads)) byId.set(s.id, byId.has(s.id) ? merge(byId.get(s.id), s) : s);
  for (const payload of payloads) {
    for (const node of walk(payload)) {
      if (Array.isArray(node.vendors)) continue; // ya procesado arriba
      if (!looksLikeStore(node)) continue;
      const s = parseStore(node);
      byId.set(s.id, byId.has(s.id) ? merge(byId.get(s.id), s) : s);
    }
  }
  return [...byId.values()]
    .filter((s) => (s.categoryIds || []).includes(HELADOS_CATEGORY_ID) || isIceCreamStore(s.name, s.categories))
    .map(summarizeStore);
}

// ---------------------------------------------------------------- menús
// GET /v2/niles/partners/{id}/menus → { name, sections: [ { name, products: [ { name, description, enabled,
//   price: { finalPrice, originalPrice, discount: { percentage, amount, isPlus, type } } } ] } ] }
// (formato real visto en el diagnóstico del 2026-11-16). Se recorre de forma tolerante por si cambia.

/** Id del local a partir de la URL del menú (/v2/niles/partners/59418/menus → "59418"). */
export function menuPartnerId(url) {
  const m = String(url).match(/\/partners\/(\d+)\/menus/);
  return m ? m[1] : null;
}

/** ¿La respuesta es un bloqueo de PerimeterX (y no un menú)? */
export function isBotBlock(body) {
  return isObj(body) && (typeof body.blockScript === "string" || (typeof body.appId === "string" && /^PX/.test(body.appId)));
}

function priceOf(p) {
  const v = first(p, PRICE_KEYS);
  if (isObj(v)) {
    return {
      price: toNumber(first(v, ["finalPrice", "discountedPrice", "value", "amount", "price"])),
      original: toNumber(first(v, ["originalPrice", "beforePrice", "previousPrice", "oldPrice", "original", "before", "regular"])),
    };
  }
  return { price: toNumber(v), original: toNumber(first(p, ORIGINAL_KEYS)) };
}

/** Productos de un menú, con la sección a la que pertenecen (sirve para saber si es helado). */
export function parseMenu(body) {
  const out = [];
  const seen = new Set();
  const visit = (node, section) => {
    if (Array.isArray(node)) { for (const v of node) visit(v, section); return; }
    if (!isObj(node)) return;
    const hasList = ["products", "items", "menuItems"].some((k) => Array.isArray(node[k]));
    const name = first(node, NAME_KEYS);
    const here = hasList && typeof name === "string" ? name : section;
    if (!hasList && typeof name === "string") {
      if (node.enabled === false) return;
      const { price, original } = priceOf(node);
      if (price != null && price > 0 && !seen.has(`${name}|${price}`)) {
        seen.add(`${name}|${price}`);
        const product = normalizeProduct({
          name: name.trim(),
          description: typeof node.description === "string" ? node.description : "",
          section: here || "",
          price,
          originalPrice: original,
        });
        // formato real: price.discount = { percentage, amount, isPlus, type: ["SUBSIDIZED_PRODUCT"] }
        if (node.price?.discount?.isPlus) product.plusOnly = true;
        out.push(product);
        return;
      }
    }
    for (const v of Object.values(node)) visit(v, here);
  };
  visit(body, "");
  return out;
}

const CHALLENGE_MARKERS = [
  "press & hold", "press and hold", "mantené presionado", "mantén presionado", "presiona y mantén",
  "access to this page has been denied", "px-captcha", "human verification", "verify you are a human",
  "just a moment", "trafico inusual", "tráfico inusual", "comprobación de seguridad",
  "comprobacion de seguridad", "attention required", "verify you are human", "checking your browser",
];

export function isChallengePage(title, bodyText) {
  const t = `${title || ""}\n${(bodyText || "").slice(0, 5000)}`.toLowerCase();
  return CHALLENGE_MARKERS.some((m) => t.includes(m));
}
