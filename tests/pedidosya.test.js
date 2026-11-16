// DATOS DE EJEMPLO inventados: la forma real de PedidosYa todavía no la vimos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isChallengePage, parseCaptured, toNumber } from "../extension/lib/pedidosya.js";

const LISTADO = {
  data: { swimlanes: [{ items: [
    { id: 101, name: "Heladería Ejemplo Centro", rating: 4.6, deliveryTimeText: "20-35 min", shippingAmount: 990,
      address: "Córdoba 1200, Rosario", categories: [{ name: "Helados" }], discounts: [{ text: "25% OFF en todo" }],
      link: "/restaurantes/rosario/heladeria-ejemplo-centro-menu" },
    { id: 202, name: "Pizzería Ejemplo", rating: 4.1, deliveryTimeText: "30-45 min", shippingAmount: 1290, categories: [{ name: "Pizzas" }] },
    { id: 303, name: "Gelato Uno", rating: 4.8, shippingAmount: 0, promotionText: "2x1 en 1/4" },
  ] }] },
};
const FICHA = {
  menu: { id: 101, name: "Heladería Ejemplo Centro", rating: 4.6, shippingAmount: 990, sections: [{ products: [
    { name: "Helado 1 kg", price: 18000, originalPrice: 24000 },
    { name: "Helado 1/2 kg", price: "$11.250", originalPrice: "$15.000" },
    { name: "Cucurucho", price: 1200 },
  ] }] },
};

test("encuentra solo heladerías y combina listado + ficha", () => {
  const stores = parseCaptured([LISTADO, FICHA, null, "texto", []]);
  assert.deepEqual(stores.map((s) => s.name).sort(), ["Gelato Uno", "Heladería Ejemplo Centro"]);
  const h = stores.find((s) => s.id === "101");
  assert.equal(h.eta, "20-35 min");
  assert.equal(h.address, "Córdoba 1200, Rosario");
  assert.equal(h.url, "https://www.pedidosya.com.ar/restaurantes/rosario/heladeria-ejemplo-centro-menu");
  assert.equal(h.products.length, 3);
  assert.equal(h.bestDiscountPct, 25);
  assert.equal(h.bestPricePerKg, 18000);
  const g = stores.find((s) => s.id === "303");
  assert.equal(g.bestDiscountPct, 50); // 2x1
  assert.equal(g.freeShipping, true);
});

test("precios en formato argentino", () => {
  assert.equal(toNumber("$11.250"), 11250);
  assert.equal(toNumber("17.625,50"), 17625.5);
  assert.equal(toNumber({ amount: 990 }), 990);
  assert.equal(toNumber("abc"), null);
});

test("detecta la página de verificación", () => {
  assert.ok(isChallengePage("Just a moment...", ""));
  assert.ok(isChallengePage("", "Nuestros sistemas han detectado tráfico inusual"));
  assert.ok(!isChallengePage("Heladerías en Rosario - PedidosYa", "Grido, Freddo..."));
});
