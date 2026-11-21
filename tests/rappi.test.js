// Fixtures con la forma real de Rappi Rosario después de su paso a Astro (relevada el 2026-11-21), recortados:
// la página pide "islas de servidor" y los datos vienen en el atributo `props` de <astro-island>,
// serializados como [tipo, valor] y escapados como HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  astroIslands, isLoginWall, mergeStore, parseCatalogIsland, parseCategoryPage, parseStoreDetail, parseStorePage,
  sameCity, StructureChanged,
} from "../extension/lib/rappi.js";

const enc = (v) => (Array.isArray(v) ? [1, v.map(enc)]
  : v && typeof v === "object" ? [0, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))]
  : [0, v]);
const island = (component, props) => {
  const attr = JSON.stringify(Object.fromEntries(Object.entries(props).map(([k, x]) => [k, enc(x)])))
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<astro-island uid="x" component-url="/_astro/${component}.hcN_RsWl.js" props="${attr}" ssr client="visible"></astro-island>`;
};
const islandScript = (name) => `<script type="module">const headers = new Headers({});
let response = await fetch('/_server-islands/${name}?e=default&p=62FED2C1%2FtORL1u4&s=', { headers });replaceServerIsland('e3d8', response);</script>`;

const CATEGORY_HTML = `<html><head><title>Helados in Rosario — Delivery | Rappi</title></head><body>
${islandScript("UserAvatarContent")}${islandScript("RestaurantStoresCatalogContent")}</body></html>`;

const store = (id, brandName, status, offer, ev = {}) => ({
  id, storeType: "restaurant", storeName: `${brandName} Rosario`, brandName, brandId: id + 1,
  imageComponents: { cornerTag: null, isClosedComponent: status === "OPEN" ? null : { text: "Cerrado" },
    mainOfferComponent: offer ? { tag: { type: "main_offer", style: "full_corner" }, text: offer } : null },
  cardComponents: [],
  analytics: { event_name: "SELECT_STORE", event_properties: { STATUS: status, STORE_ID: id, ...ev } },
});
const CATALOG_HTML = island("DynamicListRestaurantStoresGrid", {
  component: { type: "rest_stores_grid", title: "+60 restaurants for you", stores: [
    store(133407, "Américo Helados", "OPEN", "Up to 40% Off",
      { RATING: 4.3, RATINGS_AMOUNT: 77, ETA: "41 min", SHIPPING_COST: 0, OFFER_TAG: "Free Shipping: min $14K", OFFER_TYPE: "free_shipping" }),
    store(151094, "Melt", "OPEN", "25% Cashback with Eminent", { RATING: 4.6, ETA: "30 min", SHIPPING_COST: 1290 }),
    store(211964, "Grido", "CLOSED", "Free Shipping: T&C apply", { RATING: 0 }),
  ] },
}) + `
<a href="/restaurantes/133407-americo-helados?brand-id=19601" class="link-to-prefetch"></a>
<a href="/restaurantes/151094-melt?brand-id=34547" class="link-to-prefetch"></a>`;

const STORE_HTML = `<html><head><title>Americo Helados - Delivery and Menu | Rappi</title></head><body>
${islandScript("CurrentAddress")}${islandScript("SingleRestaurantDetail")}</body></html>`;

const product = (id, title, currentPrice, originalPrice, extra = {}) => ({ store: null, product: {
  id, storeId: 133407, title, isEnabled: true, hasToppings: true,
  pricing: { originalPrice, currentPrice, offerTag: originalPrice > currentPrice ? `-${Math.round(100 - currentPrice * 100 / originalPrice)}%` : "", style: "default_tag_strikethrough" },
  productHref: `/restaurantes/133407-americo-helados/${id}`, ...extra } });
const DETAIL_HTML = [
  island("DynamicListRestaurantStoreInfo", { component: { type: "rest_store_info", brandName: "Américo Helados" } }),
  island("DynamicListRestOffersCarousel", { data: { type: "rest_offers_carousel", offers: [
    { title: "Free Shipping: min $14K", description: "" },
    { title: "50% Off: T&C apply", description: "", modal: { conditionsContent: "<b>Offer details:</b><ul><li>Only applies when you pay with ARQ</li></ul>" } },
  ] } }),
  island("DynamicListRestaurantProductsCarousel", { component: { id: 339410, type: "rest_products_carousel", title: "Helados", items: [
    product(4915029, "Cuarto de helado", 5250, 10500),
    product(4914999, "Kilo de helado", 16800, 28000),
    product(4915021, "Cucurucho", 2000, 2000),
    product(1, "Sin stock", 1, 1, { isEnabled: false }),
  ] } }),
  island("DynamicListRestaurantProductsCarousel", { component: { id: 339411, type: "rest_products_carousel", title: "Promos", items: [
    product(4914999, "Kilo de helado", 16800, 28000), // repetido en otro carrusel: va una vez
    product(4934242, "Helado 1/2kg + 3 Cucuruchos", 9600, 12000),
  ] } }),
].join("\n");

test("categoría: ciudad del título y URL de la isla con los locales", () => {
  const { city, catalogUrl } = parseCategoryPage(CATEGORY_HTML);
  assert.equal(city, "Rosario");
  assert.equal(catalogUrl, "https://www.rappi.com.ar/_server-islands/RestaurantStoresCatalogContent?e=default&p=62FED2C1%2FtORL1u4&s=");
  assert.equal(parseCategoryPage(CATEGORY_HTML.replace("in Rosario", "en Córdoba")).city, "Córdoba");
});

test("sameCity compara sin tildes ni mayúsculas", () => {
  assert.ok(sameCity("Cordoba", "Córdoba"));
  assert.ok(sameCity(null, "Rosario"));
  assert.ok(!sameCity("Rosario", "Córdoba"));
});

test("isla del catálogo: locales con estado, oferta, envío y URL con slug", () => {
  const stores = parseCatalogIsland(CATALOG_HTML);
  assert.deepEqual(stores.map((s) => s.name), ["Américo Helados", "Melt", "Grido"]);
  const [americo, melt, grido] = stores;
  assert.equal(americo.id, "133407");
  assert.equal(americo.open, true);
  assert.equal(americo.rating, 4.3);
  assert.equal(americo.eta, "41 min");
  assert.equal(americo.freeShipping, true);
  assert.equal(americo.url, "https://www.rappi.com.ar/restaurantes/133407-americo-helados");
  assert.deepEqual(americo.promos, ["Up to 40% Off", "Free Shipping: min $14K"]);
  assert.equal(melt.freeShipping, false);
  assert.equal(melt.deliveryFee, 1290);
  assert.equal(grido.open, false);
  assert.equal(grido.rating, null);
  assert.equal(grido.url, "https://www.rappi.com.ar/restaurantes/211964"); // sin link en la isla: URL corta
});

test("decodifica entidades HTML dentro de props (& y comillas)", () => {
  const [g] = astroIslands(CATALOG_HTML);
  assert.equal(g.props.component.stores[2].imageComponents.mainOfferComponent.text, "Free Shipping: T&C apply");
});

test("ficha: URL de la isla con el detalle", () => {
  assert.equal(parseStorePage(STORE_HTML).detailUrl,
    "https://www.rappi.com.ar/_server-islands/SingleRestaurantDetail?e=default&p=62FED2C1%2FtORL1u4&s=");
});

test("detalle: productos con precio, descuento y $/kg, sin repetidos ni sin stock", () => {
  const d = parseStoreDetail(DETAIL_HTML);
  assert.equal(d.name, "Américo Helados");
  assert.deepEqual(d.promos, ["Free Shipping: min $14K", "50% Off: T&C apply"]);
  assert.equal(d.products.length, 4);
  const kilo = d.products.find((p) => p.name === "Kilo de helado");
  assert.deepEqual([kilo.price, kilo.originalPrice, kilo.discountPct, kilo.sizeKg, kilo.pricePerKg], [16800, 28000, 40, 1, 16800]);
  const cuarto = d.products.find((p) => p.name === "Cuarto de helado");
  assert.equal(cuarto.discountPct, 50);
  assert.equal(cuarto.sizeKg, 0.25);
});

test("mergeStore: el dato real de productos manda sobre el cartel de la tarjeta", () => {
  const [americo, , grido] = parseCatalogIsland(CATALOG_HTML);
  const m = mergeStore(americo, parseStoreDetail(DETAIL_HTML));
  assert.equal(m.bestDiscountPct, 50);
  assert.equal(m.products.length, 4);
  assert.ok(m.promos.includes("Up to 40% Off") && m.promos.includes("50% Off: T&C apply"));
  assert.equal(mergeStore(grido, undefined).products.length, 0);
});

test("detecta el muro de login de Rappi (límite para visitantes sin cuenta)", () => {
  assert.ok(isLoginWall("<html>…</html>", "https://www.rappi.com.ar/login?url_redirect=%2Frosario&logout=guest_limit"));
  assert.ok(isLoginWall("<html><head><title>Sign In - Rappi</title></head></html>"));
  assert.ok(!isLoginWall(CATEGORY_HTML, "https://www.rappi.com.ar/rosario/restaurantes/categoria/helados"));
});

test("si cambia la estructura, avisa con StructureChanged", () => {
  assert.throws(() => parseCategoryPage("<html>sin datos</html>"), StructureChanged);
  assert.throws(() => parseCatalogIsland("<div>nada</div>"), StructureChanged);
  assert.throws(() => parseStorePage("<html></html>"), StructureChanged);
  assert.throws(() => parseStoreDetail(island("DynamicListRestaurantStoreInfo", { component: {} })), StructureChanged);
});
