// Rozpoznání částek a měn v textu a jejich součet v Kč.
// Klasický skript: v prohlížeči se vystaví na globalThis.PicCalc, v Node přes module.exports.
(function (root) {
  'use strict';

  // Kódy ISO, které vyhlašuje ČNB, plus CZK.
  const CODES = [
    'AUD', 'BRL', 'BGN', 'CNY', 'DKK', 'EUR', 'PHP', 'HKD', 'INR', 'IDR', 'ISK', 'ILS',
    'JPY', 'ZAR', 'CAD', 'KRW', 'HUF', 'MYR', 'MXN', 'XDR', 'NOK', 'NZD', 'PLN', 'RON',
    'SGD', 'SEK', 'CHF', 'THB', 'TRY', 'USD', 'GBP', 'CZK',
  ];

  // Symboly a lokální zápisy. Delší varianty musí být v regexu dřív než kratší.
  const SYMBOLS = {
    'US$': 'USD', 'CA$': 'CAD', 'C$': 'CAD', 'AU$': 'AUD', 'A$': 'AUD', 'NZ$': 'NZD',
    'HK$': 'HKD', 'S$': 'SGD', 'R$': 'BRL', '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY',
    '₹': 'INR', '₩': 'KRW', '₪': 'ILS', '₺': 'TRY', '₱': 'PHP',
    'Kč': 'CZK', 'kč': 'CZK', 'Kc': 'CZK', 'zł': 'PLN', 'Ft': 'HUF', 'Fr.': 'CHF', 'lei': 'RON',
  };

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const CUR = '(?:' + Object.keys(SYMBOLS).concat(CODES)
    .sort((a, b) => b.length - a.length).map(escape).join('|') + ')';

  // Číslo: buď se skupinami tisíců (stejný oddělovač), nebo bez nich; volitelně 1–2 desetinná místa.
  const NUM = "\\d{1,3}(?:(?<sep>[ \\u00a0\\u202f.,'])\\d{3})(?:\\k<sep>\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";

  // Minus v různých podobách: spojovník, matematické minus, pomlčky a nezlomitelný spojovník.
  const MINUS = '[-\u2010\u2011\u2012\u2013\u2212\uFE63\uFF0D]';

  const AMOUNT = new RegExp(
    '(?<![\\p{L}\\d.,:+/])' +             // nezačínat uprostřed slova, čísla, času nebo telefonu
    '(?<sign>' + MINUS + ')?' +              // znaménko hned u čísla nebo měny
    '(?:(?<pre>' + CUR + ')\\s?)?' +       // měna před číslem
    '(?<sign2>' + MINUS + ')?' +             // znaménko mezi měnou a číslem (€-5)
    '(?<num>' + NUM + ')' +
    '(?:[.,][-–])?' +                      // 100,- / 100.–
    '(?![.,:]?\\d)' +                      // ne část data nebo času (12.10.2026, 12:30)
    '(?!\\s?%)' +                          // ne procenta
    '(?:\\s?(?<post>' + CUR + ')(?![\\p{L}]))?',  // měna za číslem
    'gu'
  );

  const toCode = (token) => (token ? SYMBOLS[token] || token.toUpperCase() : null);

  // "1 234,56" -> 1234.56; poslední oddělovač následovaný 3 číslicemi je oddělovač tisíců.
  function parseNumber(raw) {
    const s = raw.replace(/[   ']/g, '');
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (last === -1) return Number(s);
    const tail = s.length - last - 1;
    if (tail === 3) return Number(s.replace(/[.,]/g, ''));
    return Number(s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1));
  }

  // Najde všechny částky v textu. Vrací [{value, currency|null, raw}].
  function findAmounts(text) {
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      for (const m of line.matchAll(AMOUNT)) {
        const g = m.groups;
        let value = parseNumber(g.num);
        if (!Number.isFinite(value)) continue;
        const negative = Boolean(g.sign || g.sign2) ||
          (line[m.index - 1] === '(' && line[m.index + m[0].length] === ')');
        if (negative) value = -value;
        out.push({ value, currency: toCode(g.pre || g.post), raw: m[0].trim() });
      }
    }
    return out;
  }

  // Částky bez měny převezmou nejčastější měnu z výřezu (typicky sloupec tabulky).
  function fillMissingCurrency(amounts) {
    const counts = {};
    for (const a of amounts) if (a.currency) counts[a.currency] = (counts[a.currency] || 0) + 1;
    const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || null;
    return amounts.map((a) => (a.currency ? a : { ...a, currency: best, inferred: Boolean(best) }));
  }

  // rates = {CODE: Kč za 1 jednotku}. Převádí se vše mimo CZK.
  function summarize(text, rates) {
    const amounts = fillMissingCurrency(findAmounts(text));
    const items = [];
    const unknown = [];
    let totalCzk = 0;
    for (const a of amounts) {
      const rate = a.currency === 'CZK' ? 1 : a.currency ? rates && rates[a.currency] : 1;
      if (!rate) { unknown.push(a); continue; }
      const czk = round2(a.value * rate);
      totalCzk += czk;
      items.push({ ...a, rate, czk });
    }
    const currencies = new Set(items.map((i) => i.currency));
    const single = currencies.size === 1 ? [...currencies][0] : null;
    return {
      items,
      unknown,
      totalCzk: round2(totalCzk),
      currency: single,
      totalOriginal: single ? round2(items.reduce((s, i) => s + i.value, 0)) : null,
    };
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  const api = { findAmounts, parseNumber, summarize, CODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PicCalc = Object.assign(root.PicCalc || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
