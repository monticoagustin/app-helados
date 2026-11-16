// Parser de Rappi. Basado en datos reales vistos en Rosario (2026-11):
// - /restaurantes/category/helados → __NEXT_DATA__.props.pageProps.fallback[...] = lista de locales
// - /restaurantes/{id}             → __NEXT_DATA__.props.pageProps.fallback["restaurant/{id},..."] = ficha
import { isIceCreamStore, normalizeProduct, summarizeStore } from "./normalize.js";

export const RAPPI_BASE = "https://www.rappi.com.ar";
export const HELADOS_CATEGORY_ID = 257;

export class StructureChanged extends Error {}

export function nextData(html) {
  const m = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new StructureChanged("No encontré __NEXT_DATA__ en la página de Rappi");
  return JSON.parse(m[1]);
}

function fallbackValues(data) {
  const fb = data?.props?.pageProps?.fallback;
  if (!fb || typeof fb !== "object") throw new StructureChanged("Rappi: falta pageProps.fallback");
  return Object.values(fb);
}

/** Lista de heladerías desde la página de categoría. */
export function parseCategoryPage(html) {
  const data = nextData(html);
  const list = fallbackValues(data).find((v) => Array.isArray(v) && v.length && v[0].id && v[0].name);
  if (!list) throw new StructureChanged("Rappi: no encontré la lista de locales en la categoría");
  const location = data.props.pageProps.location || null;
  const stores = list
    .filter((s) => (s.categories || []).includes(HELADOS_CATEGORY_ID) || isIceCreamStore(s.name))
    .map((s) => ({
      platform: "rappi",
      id: String(s.id),
      name: s.name,
      address: null,
      rating: s.rating || null,
      reviews: s.reviewAmount ?? null,
      eta: s.etaString || null,
      deliveryFee: typeof s.deliveryCost === "number" ? s.deliveryCost : null,
      freeShipping: Boolean(s.hasFreeShipping),
      open: s.status === "OPEN",
      url: `${RAPPI_BASE}/restaurantes/${s.id}`,
      promos: s.promotionText ? [s.promotionText] : [],
      products: [],
    }));
  return { location, stores };
}

/** Datos de la ficha de un local: dirección, horario y productos con precios. */
export function parseStorePage(html) {
  const data = nextData(html);
  const store = fallbackValues(data).find((v) => v && !Array.isArray(v) && v.id && Array.isArray(v.corridors));
  if (!store) throw new StructureChanged("Rappi: no encontré la ficha del local");
  const products = [];
  const seen = new Set();
  for (const corridor of store.corridors || []) {
    for (const p of corridor.products || []) {
      if (!p || p.isAvailable === false || typeof p.price !== "number" || seen.has(p.id)) continue;
      seen.add(p.id);
      products.push(normalizeProduct({
        name: p.name,
        description: p.description || "",
        section: corridor.name || "",
        price: p.price,
        originalPrice: typeof p.realPrice === "number" ? p.realPrice : p.price,
      }));
    }
  }
  const promos = [store.promotionMessage, ...(store.globalOffers || []).map((o) => o?.title || o?.text || o?.description)]
    .filter((x) => typeof x === "string" && x.trim());
  return {
    id: String(store.id),
    name: store.name,
    address: store.address || null,
    schedule: store.schedule || null,
    open: store.status ? store.status === "OPEN" : undefined,
    rating: store.rating || null,
    location: Array.isArray(store.location) ? { lng: store.location[0], lat: store.location[1] } : null,
    promos,
    products,
  };
}

/** Junta lo del listado con lo de la ficha y calcula los resúmenes. */
export function mergeStore(listing, detail) {
  if (!detail) return summarizeStore(listing);
  return summarizeStore({
    ...listing,
    name: listing.name || detail.name,
    address: detail.address || listing.address,
    schedule: detail.schedule,
    rating: listing.rating || detail.rating,
    location: detail.location,
    open: detail.open ?? listing.open,
    promos: [...new Set([...listing.promos, ...detail.promos])],
    products: detail.products,
  });
}
