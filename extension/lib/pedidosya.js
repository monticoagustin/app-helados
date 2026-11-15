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
const PRICE_KEYS = ["price", "finalPrice", "discountedPrice", "priceAfterDiscount"];
const ORIGINAL_KEYS = ["originalPrice", "realPrice", "priceBeforeDiscount", "basePrice", "listPrice"];
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
  for (const k of ["address", "rating", "eta", "deliveryFee", "url", "open"]) if (base[k] == null) base[k] = other[k];
  base.promos = [...new Set([...base.promos, ...other.promos])];
  base.categories = [...new Set([...base.categories, ...other.categories])];
  if (!base.products.length) base.products = other.products;
  return base;
}

/** Todas las heladerías encontradas en las respuestas capturadas. */
export function parseCaptured(payloads) {
  const byId = new Map();
  for (const payload of payloads) {
    for (const node of walk(payload)) {
      if (!looksLikeStore(node)) continue;
      const s = parseStore(node);
      byId.set(s.id, byId.has(s.id) ? merge(byId.get(s.id), s) : s);
    }
  }
  return [...byId.values()]
    .filter((s) => isIceCreamStore(s.name, s.categories))
    .map(summarizeStore);
}

const CHALLENGE_MARKERS = [
  "just a moment", "trafico inusual", "tráfico inusual", "comprobación de seguridad",
  "comprobacion de seguridad", "attention required", "verify you are human", "checking your browser",
];

export function isChallengePage(title, bodyText) {
  const t = `${title || ""}\n${(bodyText || "").slice(0, 5000)}`.toLowerCase();
  return CHALLENGE_MARKERS.some((m) => t.includes(m));
}
