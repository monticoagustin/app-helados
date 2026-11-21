// Parser de Rappi. Basado en datos reales vistos en Rosario (2026-11-21), cuando Rappi pasó de Next.js a Astro:
// - /{ciudad}/restaurantes/categoria/helados trae un <script> que pide la "isla"
//   /_server-islands/RestaurantStoresCatalogContent?...; esa isla trae <astro-island> con
//   component-url ".../DynamicListRestaurantStoresGrid..." y en `props` la lista de locales.
// - /restaurantes/{id}-{slug} pide /_server-islands/SingleRestaurantDetail?...; esa isla trae
//   DynamicListRestaurantProductsCarousel (productos con pricing.currentPrice/originalPrice),
//   DynamicListRestOffersCarousel (ofertas) y DynamicListRestaurantStoreInfo (nombre).
// - Sin cuenta, después de unas pocas páginas Rappi redirige a /login?...&logout=guest_limit.
//   No lo salteamos: avisamos que hay que entrar con la cuenta propia en el Chrome.
// Corre en el service worker de la extensión: sin DOMParser, todo con expresiones regulares.
import { normalizeProduct, summarizeStore } from "./normalize.js";

export const RAPPI_BASE = "https://www.rappi.com.ar";
export const HELADOS_CATEGORY_ID = 257;

export class StructureChanged extends Error {}
export class LoginRequired extends Error {}

/** ¿Rappi nos mandó a iniciar sesión? (por la URL final o por el título de la página) */
export function isLoginWall(html, finalUrl = "") {
  if (/\/login(\?|$|\/)/.test(String(finalUrl))) return true;
  const title = (String(html).match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  return /^(sign in|iniciar sesi[oó]n|ingres[aá])\b/i.test(title.trim());
}

const ENTITIES = { "&quot;": '"', "&#34;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };
export const decodeEntities = (s) => String(s).replace(/&(quot|#34|#39|apos|lt|gt|amp);/g, (m) => ENTITIES[m]);

/** Astro serializa cada valor como [tipo, valor]: 0 = valor u objeto, 1 = arreglo. */
function decodeAstro(v) {
  if (!Array.isArray(v)) return v;
  const [type, value] = v;
  if (type === 1) return Array.isArray(value) ? value.map(decodeAstro) : [];
  if (type === 0 && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, decodeAstro(x)]));
  }
  return type === 0 ? value : undefined;
}

/** Todas las <astro-island> de un HTML, con el nombre del componente y sus props ya decodificadas. */
export function astroIslands(html) {
  const out = [];
  for (const m of String(html).matchAll(/<astro-island\b((?:[^>"]|"[^"]*")*)>/g)) {
    const attrs = m[1];
    const url = (attrs.match(/\bcomponent-url="([^"]*)"/) || [])[1] || "";
    const raw = (attrs.match(/\bprops="([^"]*)"/) || [])[1];
    if (!raw) continue;
    try {
      const obj = JSON.parse(decodeEntities(raw));
      const props = Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, decodeAstro(x)]));
      out.push({ component: url.split("/").pop() || "", props });
    } catch { /* una isla rota no invalida las demás */ }
  }
  return out;
}

/** URL de la isla de servidor `name` que la página pide con fetch('/_server-islands/name?...'). */
export function serverIslandUrl(html, name) {
  const m = String(html).match(new RegExp(`fetch\\(['"](/_server-islands/${name}\\?[^'"]+)['"]`));
  return m ? RAPPI_BASE + decodeEntities(m[1]) : null;
}

const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Página de categoría: ciudad que muestra Rappi y URL de la isla con los locales. */
export function parseCategoryPage(html) {
  const title = (String(html).match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  const city = (decodeEntities(title).match(/\b(?:in|en)\s+(.+?)\s+[—–-]\s/) || [])[1] || null;
  const catalogUrl = serverIslandUrl(html, "RestaurantStoresCatalogContent");
  if (!catalogUrl) throw new StructureChanged("Rappi: no encontré el pedido de la lista de locales en la categoría");
  return { city, catalogUrl };
}

/** ¿La ciudad que mostró Rappi es la que pedimos? (sin tildes ni mayúsculas) */
export const sameCity = (shown, asked) => !shown || plain(shown) === plain(asked);

/** Lista de heladerías desde la isla del catálogo. */
export function parseCatalogIsland(html) {
  const grids = astroIslands(html).filter((i) => /RestaurantStoresGrid/.test(i.component));
  if (!grids.length) throw new StructureChanged("Rappi: no encontré la grilla de locales");
  const hrefs = new Map();
  for (const m of String(html).matchAll(/href="(\/restaurantes\/(\d+)-[^"?]+)/g)) if (!hrefs.has(m[2])) hrefs.set(m[2], m[1]);
  const seen = new Set();
  const stores = [];
  for (const g of grids) {
    for (const s of g.props?.component?.stores || []) {
      const id = String(s?.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const ev = s.analytics?.event_properties || {};
      const offer = s.imageComponents?.mainOfferComponent?.text || "";
      const promos = [...new Set([offer, ev.OFFER_TAG].filter((x) => typeof x === "string" && x.trim()))];
      stores.push({
        platform: "rappi",
        id,
        name: s.brandName || String(s.storeName || "").trim(),
        address: null,
        rating: typeof ev.RATING === "number" && ev.RATING > 0 ? ev.RATING : null,
        reviews: typeof ev.RATINGS_AMOUNT === "number" ? ev.RATINGS_AMOUNT : null,
        eta: ev.ETA || null,
        deliveryFee: typeof ev.SHIPPING_COST === "number" ? ev.SHIPPING_COST : null,
        freeShipping: ev.SHIPPING_COST === 0 || ev.OFFER_TYPE === "free_shipping",
        open: ev.STATUS ? ev.STATUS === "OPEN" : !s.imageComponents?.isClosedComponent,
        url: RAPPI_BASE + (hrefs.get(id) || `/restaurantes/${id}`),
        promos,
        products: [],
      });
    }
  }
  return stores;
}

/** Página de un local: URL de la isla con el detalle (productos y ofertas). */
export function parseStorePage(html) {
  const detailUrl = serverIslandUrl(html, "SingleRestaurantDetail");
  if (!detailUrl) throw new StructureChanged("Rappi: no encontré el pedido del detalle del local");
  return { detailUrl };
}

/** Detalle de un local: nombre, ofertas y productos con precios. */
export function parseStoreDetail(html) {
  const islands = astroIslands(html);
  const carousels = islands.filter((i) => /ProductsCarousel/.test(i.component));
  if (!carousels.length) throw new StructureChanged("Rappi: no encontré los productos del local");
  const products = [];
  const seen = new Set();
  for (const c of carousels) {
    const section = c.props?.component?.title || "";
    for (const item of c.props?.component?.items || []) {
      const p = item?.product;
      const price = p?.pricing?.currentPrice;
      if (!p || p.isEnabled === false || typeof price !== "number" || seen.has(p.id)) continue;
      seen.add(p.id);
      const original = p.pricing.originalPrice;
      products.push(normalizeProduct({
        name: p.title,
        description: p.description || "",
        section,
        price,
        originalPrice: typeof original === "number" && original > 0 ? original : price,
      }));
    }
  }
  const offers = islands.filter((i) => /OffersCarousel/.test(i.component))
    .flatMap((i) => i.props?.data?.offers || i.props?.component?.offers || []);
  const promos = [...new Set(offers.map((o) => o?.title).filter((x) => typeof x === "string" && x.trim()))];
  const name = islands.find((i) => /StoreInfo/.test(i.component))?.props?.component?.brandName || null;
  return { name, promos, products };
}

/** Junta lo del listado con lo del detalle y calcula los resúmenes. */
export function mergeStore(listing, detail) {
  if (!detail) return summarizeStore(listing);
  return summarizeStore({
    ...listing,
    name: listing.name || detail.name,
    promos: [...new Set([...listing.promos, ...detail.promos])],
    products: detail.products,
  });
}
