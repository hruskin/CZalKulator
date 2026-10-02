// Kurzovní lístek ČNB: stažení, parsování a uložení do chrome.storage.local.
(function (root) {
  'use strict';

  const CNB_URL = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';
  const STORAGE_KEY = 'cnbRates';

  // Formát:
  //   02.10.2026 #191
  //   země|měna|množství|kód|kurz
  //   Austrálie|dolar|1|AUD|15,123
  // Vrací {date: 'YYYY-MM-DD', rates: {AUD: 15.123, HUF: 0.06…}} – Kč za 1 jednotku.
  function parseCnb(text) {
    const lines = String(text).trim().split(/\r?\n/);
    const d = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(lines[0] || '');
    if (!d) throw new Error('Neznámý formát kurzovního lístku ČNB');
    const rates = {};
    for (const line of lines.slice(2)) {
      const [, , amount, code, rate] = line.split('|');
      const perUnit = Number(String(rate).replace(',', '.')) / Number(amount);
      if (/^[A-Z]{3}$/.test(code) && Number.isFinite(perUnit) && perUnit > 0) rates[code] = perUnit;
    }
    if (!Object.keys(rates).length) throw new Error('Kurzovní lístek ČNB neobsahuje žádné kurzy');
    return { date: `${d[3]}-${d[2]}-${d[1]}`, rates };
  }

  async function fetchRates() {
    const res = await fetch(CNB_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`ČNB vrátila ${res.status}`);
    const data = { ...parseCnb(await res.text()), fetchedAt: Date.now() };
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    return data;
  }

  async function loadRates() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] || null;
  }

  const api = { parseCnb, fetchRates, loadRates, CNB_URL, STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PicCalc = Object.assign(root.PicCalc || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
