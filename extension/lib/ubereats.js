// Uber Eats (web, ubereats.com/ar). Formatos relevados con datos reales de Rosario (2026-11-17):
// - La ubicación va en el parámetro `pl` de la URL: base64 de encodeURIComponent(JSON) con
//   { address, reference, referenceType, latitude, longitude }. Al abrir la página con ese `pl`,
//   Uber guarda la ubicación y las llamadas siguientes la usan.
// - Búsqueda: POST /_p/api/getSearchFeedV1 → data.feedItems[] de tipo REGULAR_STORE ({store})
//   o MINI_STORE_WITH_ITEMS ({miniStoreWithItems: {store}}). Trae también supermercados.
// - Local: POST /_p/api/getStoreV1 {storeUuid} → data con cuisineList, isOpen, etaRange, fareBadge,
//   location y catalogSectionsMap[...][].payload.standardItemsPayload.catalogItems[].
//   price = precio final en centavos; el anterior va en purchaseInfo.purchaseOptions[0].purchasePriceV2
//   ({base:{low}, exponent:-2}) o, si falta, en priceTagline.accessibilityText ("discounted from $ X").
import { isIceCreamStore, normalizeProduct } from "./normalize.js";

export const UBER_BASE = "https://www.ubereats.com";

// Centro aproximado de cada ciudad (Uber necesita coordenadas para buscar).
export const CITY_COORDS = {
  "rosario": [-32.9496, -60.6303],
  "buenos-aires": [-34.6037, -58.3816],
  "cordoba": [-31.4167, -64.1833],
  "mendoza": [-32.8895, -68.8458],
  "la-plata": [-34.9214, -57.9545],
  "mar-del-plata": [-38.0055, -57.5426],
  "san-miguel-de-tucuman": [-26.8083, -65.2176],
  "salta": [-24.7859, -65.4117],
  "neuquen": [-38.9516, -68.0591],
  "parana": [-31.7333, -60.5297],
  "bahia-blanca": [-38.7183, -62.2663],
  "san-juan": [-31.5375, -68.5364],
  "resistencia": [-27.4606, -58.9839],
  "san-luis": [-33.3017, -66.3378],
  "rio-cuarto": [-33.1232, -64.3493],
  "san-rafael": [-34.6177, -68.3301],
  "santiago-del-estero": [-27.7951, -64.2615],
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Valor del parámetro `pl` (ubicación) para una ciudad, o null si no tenemos sus coordenadas. */
export function locationParam(city, b64 = (s) => btoa(s)) {
  const c = CITY_COORDS[city.slug];
  if (!c) return null;
  const json = JSON.stringify({ address: city.name, reference: "", referenceType: "", latitude: c[0], longitude: c[1] });
  return b64(encodeURIComponent(json));
}

export const feedUrl = (pl) => `${UBER_BASE}/ar/feed?diningMode=DELIVERY&pl=${encodeURIComponent(pl)}`;

/** Lo que pide la web al tocar la categoría Helado. */
export const SEARCH_BODY = {
  userQuery: "Ice Cream", date: "", startTime: 0, endTime: 0, carouselId: "", sortAndFilters: [],
  marketingFeedType: "", billboardUuid: "", feedProvider: "", promotionUuid: "", targetingStoreTag: "",
  venueUUID: "", selectedSectionUUID: "", favorites: "", vertical: "", searchSource: "", searchType: "",
  keyName: "", cacheKey: "", recaptchaToken: "",
};
export const storeBody = (storeUuid) => ({ storeUuid, diningMode: "DELIVERY", time: { asap: true }, cbType: "EATER_ENDORSED" });

/** "$ 36.000,00" / "$1149" → 36000 / 1149. */
export function parseArs(text) {
  const m = String(text || "").match(/\$\s*([\d.]+(?:,\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Locales de la búsqueda (los dos formatos que devuelve Uber). */
export function parseSearchFeed(body) {
  const items = body?.data?.feedItems;
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  for (const f of items) {
    const s = f?.store || f?.miniStoreWithItems?.store;
    const uuid = s?.storeUuid || f?.uuid;
    const name = s?.title?.text;
    if (!uuid || !name || seen.has(uuid)) continue;
    seen.add(uuid);
    const meta = Array.isArray(s.meta) ? s.meta : [];
    const fare = meta.find((m) => m?.badgeType === "FARE")?.text;
    const eta = meta.find((m) => m?.badgeType === "ETD" && /min/.test(m.text || ""))?.accessibilityText;
    out.push({
      uuid,
      name: name.trim(),
      url: typeof s.actionUrl === "string" ? `${UBER_BASE}/ar${s.actionUrl}` : null,
      deliveryFee: fare ? parseArs(fare) : null,
      eta: eta ? eta.replace(/^Entrega en\s*/i, "") : null,
      promos: (s.signposts || []).map((p) => p?.text?.trim()).filter(Boolean),
    });
  }
  return out;
}

/** Precio anterior de un producto, en pesos (null si no tiene descuento a la vista). */
function originalOf(it, price) {
  const opt = it.purchaseInfo?.purchaseOptions?.[0]?.purchasePriceV2;
  const low = Number(opt?.base?.low);
  if (Number.isFinite(low) && low > 0) {
    const v = low * 10 ** Number(opt.exponent ?? -2);
    if (v > price) return v;
  }
  const t = it.priceTagline?.accessibilityText || "";
  const m = t.match(/(?:discounted from|precio anterior era)\s*(\$\s*[\d.,]+)/i);
  const fromText = m ? parseArs(m[1]) : null;
  if (fromText && fromText > price) return fromText;
  return null;
}

/** Productos del menú de un local, sin repetir (Uber repite productos en varias secciones). */
export function parseStoreItems(data) {
  const out = [];
  const seen = new Set();
  for (const sections of Object.values(data?.catalogSectionsMap || {})) {
    for (const sec of Array.isArray(sections) ? sections : []) {
      const p = sec?.payload?.standardItemsPayload;
      if (!isObj(p)) continue;
      const section = p.title?.text || "";
      for (const it of p.catalogItems || []) {
        if (!it?.title || it.isSoldOut || it.isAvailable === false) continue;
        const key = it.uuid || `${it.title}|${it.price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const price = Number(it.price) / 100;
        if (!(price > 0)) continue;
        out.push(normalizeProduct({
          name: it.title.trim(),
          description: it.itemDescription || "",
          section,
          price,
          originalPrice: originalOf(it, price),
        }));
      }
    }
  }
  return out;
}

/** ¿El local es una heladería? Por nombre o por sus categorías ("Ice Cream", "Helado y yogur helado"). */
export function isUberIceCreamStore(data) {
  return isIceCreamStore(data?.title || "", [...(data?.cuisineList || []), ...(data?.categories || [])]);
}

/** ¿El local es de la ciudad buscada? (si Uber no está en esa ciudad, devuelve locales de otra). */
export function inCity(data, city) {
  const slug = plain(data?.citySlug).replace(/\s+/g, "-");
  if (slug) return slug === city.slug || slug.includes(city.slug) || city.slug.includes(slug);
  return plain(data?.location?.city) === plain(city.name);
}

/** Heladería en el formato común de la app, a partir de getStoreV1 (+ lo que vino en la búsqueda). */
export function parseStore(data, listed = {}) {
  const fare = data.fareBadge?.text;
  const fee = fare ? parseArs(fare) : listed.deliveryFee ?? null;
  const rating = Number(data.rating?.ratingValue);
  return {
    platform: "ubereats",
    id: String(data.uuid || listed.uuid),
    name: String(data.title || listed.name || "").trim(),
    address: data.location?.streetAddress || null,
    rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
    reviews: Number(data.rating?.reviewCount) || null,
    eta: data.etaRange?.text || listed.eta || null,
    deliveryFee: fee,
    freeShipping: fee === 0 || /gratis/i.test(fare || ""),
    open: typeof data.isOpen === "boolean" ? data.isOpen : null,
    url: listed.url || (data.slug && data.uuid ? `${UBER_BASE}/ar/store/${data.slug}/${data.uuid}` : null),
    location: data.location?.latitude != null ? { lat: data.location.latitude, lng: data.location.longitude } : null,
    distanceKm: null,
    categories: data.cuisineList || data.categories || [],
    promos: listed.promos || [],
    products: parseStoreItems(data),
  };
}

const CHALLENGE = ["recaptcha", "are you a robot", "eres un robot", "verify you are human", "unusual traffic", "tráfico inusual"];

/** ¿La respuesta es un bloqueo/desafío en vez de datos? */
export function isUberBlock(status, body) {
  if (status === 403 || status === 429) return true;
  if (body && body.status === "failure") {
    return CHALLENGE.some((c) => JSON.stringify(body).toLowerCase().includes(c));
  }
  return false;
}
