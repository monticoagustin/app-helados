// Datos reales de Uber Eats en Rosario (2026-11-17), recortados: ver tests/fixtures/ubereats_*.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  inCity, isUberBlock, isUberIceCreamStore, locationParam, parseArs, parseSearchFeed, parseStore, parseStoreItems,
} from "../extension/lib/ubereats.js";
import { summarizeStore } from "../extension/lib/normalize.js";

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const FEED = load("ubereats_feed_real.json");
const GRIDO = load("ubereats_store_grido_real.json");
const DAR = load("ubereats_store_dar_real.json");
const ROSARIO = { slug: "rosario", name: "Rosario" };

test("la ubicación va en pl como base64 de JSON urlencodeado (igual que la web)", () => {
  const pl = locationParam(ROSARIO, (s) => Buffer.from(s).toString("base64"));
  const json = JSON.parse(decodeURIComponent(Buffer.from(pl, "base64").toString()));
  assert.equal(json.address, "Rosario");
  assert.equal(json.latitude, -32.9496);
  assert.equal(locationParam({ slug: "ushuaia", name: "Ushuaia" }), null);
});

test("parseArs entiende los precios de Uber", () => {
  assert.equal(parseArs("$ 36.000,00"), 36000);
  assert.equal(parseArs("Costo de envío: $1149"), 1149);
  assert.equal(parseArs("gratis"), null);
});

test("búsqueda: lee los dos formatos (REGULAR_STORE y MINI_STORE_WITH_ITEMS)", () => {
  const stores = parseSearchFeed(FEED);
  assert.equal(stores.length, 6);
  const grido = stores[0];
  assert.equal(grido.name, "Grido Helados - 3912");
  assert.equal(grido.deliveryFee, 1149);
  assert.equal(grido.eta, "11-22 min");
  assert.equal(grido.url, "https://www.ubereats.com/ar/store/grido-helados-3912/93S4qhGGVJyZPRdpJ-5mxw");
  assert.deepEqual(grido.promos, ["30% en artículos seleccionados"]);
  assert.equal(stores[1].eta, null, "la hora de entrega (1:50PM) no es una demora");
  assert.equal(stores[3].name, "Tento Helados - San Luis 1038");
});

test("menú: precio final en centavos y precio anterior desde purchaseInfo o desde el texto", () => {
  const items = parseStoreItems(GRIDO.data);
  const by = Object.fromEntries(items.map((p) => [p.name, p]));
  assert.equal(items.length, 7, "no repite productos que aparecen en varias secciones");
  assert.deepEqual([by["1/2 kg de Helado"].price, by["1/2 kg de Helado"].originalPrice, by["1/2 kg de Helado"].discountPct], [8400, 12000, 30]);
  assert.deepEqual([by["Promo 2 Cajas de Bombones"].price, by["Promo 2 Cajas de Bombones"].originalPrice], [24840, 36000]);
  assert.equal(by["Cassata X 8"].isIceCream, true);
  assert.ok(!by["1 Kg de helado"].discountPct, "sin descuento");
});

test("solo heladerías: Grido sí, el supermercado Dar no", () => {
  assert.equal(isUberIceCreamStore(GRIDO.data), true);
  assert.equal(isUberIceCreamStore(DAR.data), false);
});

test("ciudad: reconoce si el local es de la ciudad buscada", () => {
  assert.equal(inCity(GRIDO.data, ROSARIO), true);
  assert.equal(inCity(GRIDO.data, { slug: "cordoba", name: "Córdoba" }), false);
});

test("heladería completa con sus descuentos, en el formato común", () => {
  const listed = parseSearchFeed(FEED)[0];
  const s = summarizeStore(parseStore(GRIDO.data, listed));
  assert.equal(s.platform, "ubereats");
  assert.equal(s.address, "Leandro N Alem 1886");
  assert.equal(s.open, true);
  assert.equal(s.deliveryFee, 1149);
  assert.equal(s.rating, 5);
  assert.equal(s.bestDiscountPct, 31);
  assert.deepEqual(s.deals.map((d) => d.name), ["Promo 2 Cajas de Bombones", "1/2 kg de Helado", "Cassata X 8", "Almendrado X 8"]);
});

test("bloqueos", () => {
  assert.equal(isUberBlock(403, null), true);
  assert.equal(isUberBlock(200, { status: "failure", data: { message: "Please verify you are human" } }), true);
  assert.equal(isUberBlock(200, GRIDO), false);
});
