const test = require('node:test');
const assert = require('node:assert/strict');
const { findAmounts, parseNumber, summarize } = require('../src/parser.js');
const { parseCnb } = require('../src/rates.js');

const pick = (text) => findAmounts(text).map((a) => [a.value, a.currency]);

test('formáty čísel', () => {
  assert.equal(parseNumber('1 234,56'), 1234.56);
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('1,234.56'), 1234.56);
  assert.equal(parseNumber('1 234'), 1234);
  assert.equal(parseNumber('1,234'), 1234);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('1 000 000'), 1000000);
});

test('měna před i za číslem, symboly i kódy', () => {
  assert.deepEqual(pick('€12.50'), [[12.5, 'EUR']]);
  assert.deepEqual(pick('12,50 €'), [[12.5, 'EUR']]);
  assert.deepEqual(pick('USD 1,299.00'), [[1299, 'USD']]);
  assert.deepEqual(pick('1 299 Kč'), [[1299, 'CZK']]);
  assert.deepEqual(pick('1 299,- Kč'), [[1299, 'CZK']]);
  assert.deepEqual(pick('£5'), [[5, 'GBP']]);
  assert.deepEqual(pick('C$ 10'), [[10, 'CAD']]);
  assert.deepEqual(pick('25 zł'), [[25, 'PLN']]);
  assert.deepEqual(pick('3 500 Ft'), [[3500, 'HUF']]);
  assert.deepEqual(pick('100 CZK'), [[100, 'CZK']]);
});

test('záporné hodnoty', () => {
  assert.deepEqual(pick('Sleva -200 Kč'), [[-200, 'CZK']]);
  assert.deepEqual(pick('−5 €'), [[-5, 'EUR']]);
  assert.deepEqual(pick('(1 200 Kč)'), [[-1200, 'CZK']]);
  assert.deepEqual(pick('Položka - 100 Kč'), [[100, 'CZK']]);
});

test('šum se nepočítá', () => {
  assert.deepEqual(pick('Datum 12.10.2026'), []);
  assert.deepEqual(pick('v 12:30'), []);
  assert.deepEqual(pick('DPH 21 %'), []);
  assert.deepEqual(pick('iPhone15'), []);
});

test('více částek pod sebou', () => {
  assert.deepEqual(pick('Položka A 100 Kč\nPoložka B 250,50 Kč\n'), [[100, 'CZK'], [250.5, 'CZK']]);
});

const rates = { EUR: 25, USD: 20 };

test('součet v Kč přes různé měny', () => {
  const r = summarize('10 €\n$5\n100 Kč', rates);
  assert.equal(r.totalCzk, 450);
  assert.equal(r.currency, null);
});

test('stejná měna: součet i v původní měně', () => {
  const r = summarize('10,50 €\n4,50 €', rates);
  assert.equal(r.totalOriginal, 15);
  assert.equal(r.currency, 'EUR');
  assert.equal(r.totalCzk, 375);
});

test('čísla bez měny převezmou měnu z výřezu', () => {
  const r = summarize('Cena (EUR)\n10 EUR\n20\n30', rates);
  assert.equal(r.totalOriginal, 60);
  assert.equal(r.totalCzk, 1500);
});

test('bez měny se jen sčítá', () => {
  const r = summarize('10\n20,5', rates);
  assert.equal(r.totalCzk, 30.5);
  assert.equal(r.currency, null);
});

test('neznámý kurz se nezapočítá', () => {
  const r = summarize('10 €\n5 GBP', rates);
  assert.equal(r.totalCzk, 250);
  assert.equal(r.unknown.length, 1);
});

test('parsování lístku ČNB', () => {
  const r = parseCnb('02.10.2026 #191\nzemě|měna|množství|kód|kurz\nEMU|euro|1|EUR|24,330\nMaďarsko|forint|100|HUF|6,180\n');
  assert.equal(r.date, '2026-10-02');
  assert.equal(r.rates.EUR, 24.33);
  assert.ok(Math.abs(r.rates.HUF - 0.0618) < 1e-12);
});
