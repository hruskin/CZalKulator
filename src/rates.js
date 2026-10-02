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

  // --- Kdy přijde další lístek ---------------------------------------------
  // ČNB vyhlašuje kurzy každý pracovní den kolem 14:30 (Praha) s platností pro ten den
  // a následující víkend či svátek. Cache proto platí do příštího pracovního dne 14:35.
  const PUBLISH_HOUR = 14, PUBLISH_MINUTE = 35;
  const RETRY_MS = 30 * 60 * 1000; // ČNB se zpozdila nebo síť selhala

  // Velikonoční neděle (anonymní gregoriánský algoritmus).
  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(y, month - 1, day);
  }

  const FIXED_HOLIDAYS = ['01-01', '05-01', '05-08', '07-05', '07-06', '09-28', '10-28', '11-17', '12-24', '12-25', '12-26'];
  const DAY = 864e5;

  // t = půlnoc UTC daného kalendářního dne
  function isCnbWorkingDay(t) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) return false;
    if (FIXED_HOLIDAYS.includes(d.toISOString().slice(5, 10))) return false;
    const easter = easterSunday(d.getUTCFullYear());
    return t !== easter - 2 * DAY && t !== easter + DAY; // Velký pátek, Velikonoční pondělí
  }

  // Posun Europe/Prague proti UTC v daný okamžik (ms), např. +2 h v létě.
  function pragueOffset(ms) {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', timeZoneName: 'shortOffset' })
      .formatToParts(ms).find((p) => p.type === 'timeZoneName').value; // "GMT+2"
    const m = /GMT([+-]\d+)(?::(\d+))?/.exec(name);
    return m ? (Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] || 0)) * 60000 : 0;
  }

  // Okamžik (ms), kdy má vyjít lístek následující po lístku s datem `date` (YYYY-MM-DD).
  function nextPublication(date) {
    let t = Date.parse(date + 'T00:00:00Z') + DAY;
    while (!isCnbWorkingDay(t)) t += DAY;
    const local = t + (PUBLISH_HOUR * 60 + PUBLISH_MINUTE) * 60000;
    return local - pragueOffset(local);
  }

  // Kdy se má znovu zkusit stáhnout lístek: po příštím vyhlášení,
  // a když je už po něm (ČNB se zpozdila), za 30 minut.
  function nextCheck(date, now = Date.now()) {
    const next = nextPublication(date);
    return next > now ? next : now + RETRY_MS;
  }

  async function fetchRates() {
    const res = await fetch(CNB_URL, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) throw new Error(`ČNB vrátila ${res.status}`);
    const parsed = parseCnb(await res.text());
    const data = { ...parsed, fetchedAt: Date.now(), nextCheck: nextCheck(parsed.date) };
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    return data;
  }

  async function loadRates() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] || null;
  }

  const api = { parseCnb, fetchRates, loadRates, nextPublication, nextCheck, isCnbWorkingDay, RETRY_MS, CNB_URL, STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PicCalc = Object.assign(root.PicCalc || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
