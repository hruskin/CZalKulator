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

const { nextPublication, nextCheck, isCnbWorkingDay, RETRY_MS } = require('../src/rates.js');
const at = (iso) => Date.parse(iso);

test('další lístek ČNB: příští pracovní den 14:35 pražského času', () => {
  // čtvrtek → pátek, letní čas (UTC+2)
  assert.equal(nextPublication('2026-10-01'), at('2026-10-02T12:35:00Z'));
  // pátek → pondělí
  assert.equal(nextPublication('2026-10-02'), at('2026-10-05T12:35:00Z'));
  // zimní čas (UTC+1)
  assert.equal(nextPublication('2026-11-02'), at('2026-11-03T13:35:00Z'));
  // 27. 10. → 28. 10. je svátek → 29. 10.
  assert.equal(nextPublication('2026-10-27'), at('2026-10-29T13:35:00Z'));
  // Zelený čtvrtek 2026-04-02 → Velký pátek i Velikonoční pondělí přeskočit → úterý 7. 4.
  assert.equal(nextPublication('2026-04-02'), at('2026-04-07T12:35:00Z'));
  // Vánoce: 23. 12. → 24.–26. 12. svátky, 27. 12. neděle → 28. 12.
  assert.equal(nextPublication('2026-12-23'), at('2026-12-28T13:35:00Z'));
});

test('svátky a víkendy ČNB', () => {
  assert.equal(isCnbWorkingDay(at('2026-04-03T00:00:00Z')), false); // Velký pátek
  assert.equal(isCnbWorkingDay(at('2026-04-06T00:00:00Z')), false); // Velikonoční pondělí
  assert.equal(isCnbWorkingDay(at('2026-10-03T00:00:00Z')), false); // sobota
  assert.equal(isCnbWorkingDay(at('2026-10-05T00:00:00Z')), true);
});

test('cache: do vyhlášení se nestahuje, po něm a při zpoždění ČNB za 30 minut', () => {
  const pub = at('2026-10-05T12:35:00Z');
  assert.equal(nextCheck('2026-10-02', at('2026-10-03T10:00:00Z')), pub); // sobota: čekáme na pondělí
  const late = at('2026-10-05T12:40:00Z'); // pondělí po 14:35, ale stále páteční lístek
  assert.equal(nextCheck('2026-10-02', late), late + RETRY_MS);
});

test('znaménko minus ve všech podobách se odečte (Amazon „-€7.52“)', () => {
  assert.deepEqual(pick('FREE DELIVERY -€7.52'), [[-7.52, 'EUR']]);
  assert.deepEqual(pick('Sleva –€7.52'), [[-7.52, 'EUR']]);       // pomlčka
  assert.deepEqual(pick('Sleva ‑€7.52'), [[-7.52, 'EUR']]);  // nezlomitelný spojovník
  assert.deepEqual(pick('Sleva €−7.52'), [[-7.52, 'EUR']]);
  assert.deepEqual(pick('10–20 €'), [[10, null], [20, 'EUR']]);    // rozsah není záporný
  const r = summarize('Items: €94.15\nPostage & Packing: €7.52\nFREE DELIVERY -€7.52', { EUR: 25 });
  assert.equal(r.totalOriginal, 94.15);
  assert.equal(r.totalCzk, 2353.75);
  assert.equal(r.items[2].czk, -188);
});

test('záporné částky v součtu přes různé měny', () => {
  assert.deepEqual(pick('Vratka -$5.00'), [[-5, 'USD']]);
  assert.deepEqual(pick('Sleva USD -5'), [[-5, 'USD']]);
  assert.deepEqual(pick('(€7.52)'), [[-7.52, 'EUR']]);
  const r = summarize('10 €\nVratka -$5\nSleva -100 Kč', { EUR: 25, USD: 20 });
  assert.equal(r.totalCzk, 50);
  assert.deepEqual(r.items.map((i) => i.czk), [250, -100, -100]);
  const neg = summarize('-10 €\n-5 €', { EUR: 25 });
  assert.equal(neg.totalOriginal, -15);
  assert.equal(neg.totalCzk, -375);
});
