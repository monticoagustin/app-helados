import { test } from "node:test";
import assert from "node:assert/strict";
import {
  discountPct, isIceCreamStore, normalizeProduct, parsePromo, parseSizeKg, pricePerKg, summarizeStore,
} from "../extension/lib/normalize.js";

test("parseSizeKg entiende los tamaños habituales", () => {
  const cases = [
    ["Helado 1Kg", 1], ["Helado 1 kg con 4 sabores", 1], ["Helado 1/2Kg", 0.5], ["½ kg de helado", 0.5],
    ["Medio kilo", 0.5], ["Helados 1/4 Kg", 0.25], ["Cuarto de helado", 0.25], ["Pote 250 g", 0.25],
    ["Pote 500grs", 0.5], ["2 x 1/4 Helados", 0.5], ["Kilo de helado artesanal", 1], ["1,5 kg", 1.5],
    ["Cucurucho", null], ["Paleta bañada", null], ["", null], [null, null],
  ];
  for (const [text, expected] of cases) assert.equal(parseSizeKg(text), expected, text);
});

test("precio por kg y % de descuento", () => {
  assert.equal(pricePerKg(10875, 0.5), 21750);
  assert.equal(pricePerKg(null, 1), null);
  assert.equal(discountPct(17625, 23500), 25);
  assert.equal(discountPct(100, 100), null);
  assert.equal(discountPct(100, null), null);
});

test("normalizeProduct con datos reales de Rappi (Frais Helados)", () => {
  const p = normalizeProduct({ name: "Helado 1/2Kg", description: "4 sabores", price: 10875, originalPrice: 14500 });
  assert.deepEqual(p, {
    name: "Helado 1/2Kg", price: 10875, originalPrice: 14500, discountPct: 25, sizeKg: 0.5, pricePerKg: 21750,
  });
  const sinDesc = normalizeProduct({ name: "Cucurucho", price: 1000, originalPrice: 1000 });
  assert.equal(sinDesc.discountPct, null);
  assert.equal(sinDesc.pricePerKg, null);
});

test("parsePromo: porcentajes", () => {
  const p = parsePromo("Hasta 30% Off");
  assert.equal(p.kind, "percent");
  assert.equal(p.pct, 30);
  assert.equal(p.upTo, true);
  assert.equal(parsePromo("25% OFF en todo").pct, 25);
  assert.equal(parsePromo("Hasta 54% Off").pct, 54);
});

test("parsePromo: 2x1, 3x2 y segunda unidad a % efectivo", () => {
  assert.deepEqual([parsePromo("2x1 en kilos").kind, parsePromo("2x1 en kilos").pct], ["multi_buy", 50]);
  assert.equal(parsePromo("3 x 2 en cuartos").pct, 33.3);
  assert.equal(parsePromo("Segundo al 50%").pct, 25);
  assert.equal(parsePromo("2do al 70%").pct, 15);
  assert.equal(parsePromo("2da unidad 70% off").pct, 35);
  assert.equal(parsePromo("Segunda unidad con 40% de descuento").pct, 20);
});

test("parsePromo: envío gratis, mínimo, tope y medio de pago", () => {
  const envio = parsePromo("Envío Gratis: mín $14mil");
  assert.equal(envio.kind, "free_shipping");
  assert.equal(envio.freeShipping, true);
  assert.equal(envio.minAmount, 14000);

  const banco = parsePromo("20% off pagando con Mercado Pago, tope $5.000");
  assert.equal(banco.pct, 20);
  assert.equal(banco.payment, "mercado pago");
  assert.equal(banco.cap, 5000);

  assert.equal(parsePromo("Envío Gratis: Aplican TyC").minAmount, null);
  assert.equal(parsePromo("").kind, "other");
});

test("isIceCreamStore", () => {
  assert.ok(isIceCreamStore("Frais Helados"));
  assert.ok(isIceCreamStore("Heladería Súper Gato"));
  assert.ok(isIceCreamStore("Lo de Juan", ["Helados"]));
  assert.ok(!isIceCreamStore("McDonald's", ["Hamburguesas"]));
});

test("summarizeStore elige el mejor descuento sin contar promos de banco", () => {
  const s = summarizeStore({
    name: "X",
    promos: ["Hasta 30% Off", "40% off con Modo"],
    products: [
      normalizeProduct({ name: "1 kg", price: 18000, originalPrice: 24000 }),
      normalizeProduct({ name: "1/4 kg", price: 6000 }),
    ],
  });
  assert.equal(s.bestDiscountPct, 30);
  assert.equal(s.bestPricePerKg, 18000);
  assert.equal(s.promosParsed[1].payment, "modo");

  const nada = summarizeStore({ name: "Y", promos: ["Envío Gratis: Aplican TyC"], products: [] });
  assert.equal(nada.bestDiscountPct, null);
  assert.equal(nada.freeShipping, true);
});
