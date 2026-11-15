// Fixtures armados con la forma real de Rappi Rosario (relevada el 2026-11-15), recortados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStore, parseCategoryPage, parseStorePage, StructureChanged } from "../extension/lib/rappi.js";

const page = (pageProps) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script></body></html>`;

const CATEGORY_HTML = page({
  location: { address: "Rosario", city: "Rosario", id: 42, lat: -32.94502, lng: -60.64553, url: "rosario" },
  category: { id: 257, name: "Helados" },
  fallback: {
    '@"/restaurant/category",undefined,@,"",': [
      { id: 133407, status: "OPEN", name: "Américo Helados", etaString: "41 min", rating: 4.3, promotionText: "Envío Gratis: mín $14mil", deliveryCost: 0, hasFreeShipping: true, categories: [257, 4], reviewAmount: 61 },
      { id: 131717, status: "OPEN", name: "Frais Helados", etaString: "14 min", rating: 0, promotionText: "Hasta 30% Off", deliveryCost: 790, hasFreeShipping: false, categories: [257, 4], reviewAmount: 0 },
      { id: 999, status: "CLOSED", name: "Monk's", etaString: "12 min", rating: 4.4, promotionText: "Hasta 33% Off", deliveryCost: 0, hasFreeShipping: true, categories: [4] },
      { id: 121296, status: "OPEN", name: "McDonald's", etaString: "12 min", rating: 4.4, promotionText: "", deliveryCost: 790, categories: [256] },
    ],
  },
});

const STORE_HTML = page({
  fallback: {
    '@"restaurant/131717",#lng:-58.43,lat:-34.58,,': {
      id: 131717, name: "Frais Helados - Barrio de Abasto", status: "OPEN", address: "Paraguay 1850",
      schedule: "19:00:00 - 23:30:00", rating: 0, promotionMessage: "", globalOffers: null,
      location: [-60.6470087, -32.9580288], tags: ["Helados", "Postres"],
      corridors: [
        { name: "Helado", products: [
          { id: 4870895, name: "Helado 1Kg", description: "Helado 1Kg con 4 sabores a elección.", price: 17625, realPrice: 23500, isAvailable: true, discountInPercent: 25 },
          { id: 4870915, name: "Helado 1/2Kg", description: "Helado 1/2Kg con 4 sabores a elección.", price: 10875, realPrice: 14500, isAvailable: true, discountInPercent: 25 },
          { id: 4870924, name: "Helados 1/4 Kg", description: "Helados 1/4 Kg con 3 sabores a elección.", price: 5625, realPrice: 7500, isAvailable: true, discountInPercent: 25 },
          { id: 4871026, name: "2 x 1/4 Helados", description: "Dos cuartos de helado.", price: 9000, realPrice: 12000, isAvailable: true, discountInPercent: 25 },
          { id: 1, name: "Sin stock 1kg", price: 1, realPrice: 1, isAvailable: false },
        ] },
        { name: "Cucuruchos", products: [
          { id: 4870970, name: "Cuchurucho", description: "Cuchurucho de waffle.", price: 1000, realPrice: 1000, isAvailable: true },
        ] },
      ],
    },
  },
});

test("categoría: solo heladerías (por categoría 257 o por nombre)", () => {
  const { location, stores } = parseCategoryPage(CATEGORY_HTML);
  assert.equal(location.city, "Rosario");
  assert.deepEqual(stores.map((s) => s.name), ["Américo Helados", "Frais Helados"]);
  const americo = stores[0];
  assert.equal(americo.id, "133407");
  assert.equal(americo.open, true);
  assert.equal(americo.freeShipping, true);
  assert.equal(americo.url, "https://www.rappi.com.ar/restaurantes/133407");
  assert.deepEqual(americo.promos, ["Envío Gratis: mín $14mil"]);
});

test("ficha: productos con precio, descuento, tamaño y $/kg", () => {
  const d = parseStorePage(STORE_HTML);
  assert.equal(d.address, "Paraguay 1850");
  assert.deepEqual(d.location, { lng: -60.6470087, lat: -32.9580288 });
  assert.equal(d.products.length, 5); // sin el que no tiene stock
  const kilo = d.products.find((p) => p.name === "Helado 1Kg");
  assert.deepEqual([kilo.price, kilo.originalPrice, kilo.discountPct, kilo.sizeKg, kilo.pricePerKg], [17625, 23500, 25, 1, 17625]);
  const dosCuartos = d.products.find((p) => p.name === "2 x 1/4 Helados");
  assert.equal(dosCuartos.sizeKg, 0.5);
  assert.equal(dosCuartos.pricePerKg, 18000);
});

test("mergeStore combina listado + ficha y calcula resúmenes", () => {
  const { stores } = parseCategoryPage(CATEGORY_HTML);
  const frais = mergeStore(stores[1], parseStorePage(STORE_HTML));
  assert.equal(frais.address, "Paraguay 1850");
  assert.equal(frais.bestDiscountPct, 30); // "Hasta 30% Off" del listado > 25% de productos
  assert.equal(frais.bestPricePerKg, 17625);
  assert.equal(frais.products.length, 5);

  const americo = mergeStore(stores[0], null);
  assert.equal(americo.bestDiscountPct, null);
  assert.equal(americo.freeShipping, true);
});

test("si cambia la estructura, avisa con StructureChanged", () => {
  assert.throws(() => parseCategoryPage("<html>sin datos</html>"), StructureChanged);
  assert.throws(() => parseStorePage(page({ fallback: { x: [] } })), StructureChanged);
});
