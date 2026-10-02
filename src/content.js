// Vkládá se do stránky až po aktivaci: výběr obdélníku, čtení textu z DOM a bublina s výsledkem.
(function () {
  'use strict';
  const PC = globalThis.PicCalc;
  if (PC.start) return; // skript už na stránce běží

  const Z = 2147483647;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg']);
  const fmt = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtRate = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  let cleanup = null;

  function start() {
    if (cleanup) cleanup();
    const sel = window.getSelection();
    const text = sel && sel.toString().trim();
    if (text) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      show(text, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    } else {
      pickRect();
    }
  }

  // --- Výběr obdélníku -----------------------------------------------------

  function pickRect() {
    const layer = document.createElement('div');
    layer.dataset.picCalc = '';
    layer.style.cssText = `position:fixed;inset:0;z-index:${Z};cursor:crosshair;background:rgba(0,0,0,.04);`;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;border:2px dashed #1a73e8;background:rgba(26,115,232,.08);display:none;pointer-events:none;';
    layer.appendChild(box);
    document.documentElement.appendChild(layer);

    let x0 = 0, y0 = 0, dragging = false;
    const rectOf = (e) => ({
      left: Math.min(x0, e.clientX), top: Math.min(y0, e.clientY),
      right: Math.max(x0, e.clientX), bottom: Math.max(y0, e.clientY),
    });
    const onDown = (e) => {
      if (e.button !== 0) return close();
      e.preventDefault();
      x0 = e.clientX; y0 = e.clientY; dragging = true;
    };
    const onMove = (e) => {
      if (!dragging) return;
      const r = rectOf(e);
      Object.assign(box.style, {
        display: 'block', left: r.left + 'px', top: r.top + 'px',
        width: r.right - r.left + 'px', height: r.bottom - r.top + 'px',
      });
    };
    const onUp = (e) => {
      if (!dragging) return;
      const r = rectOf(e);
      close();
      if (r.right - r.left < 4 || r.bottom - r.top < 4) return;
      show(textInRect(r), r);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onContext = (e) => { e.preventDefault(); close(); };
    function close() {
      layer.remove();
      window.removeEventListener('keydown', onKey, true);
      cleanup = null;
    }
    layer.addEventListener('mousedown', onDown);
    layer.addEventListener('mousemove', onMove);
    layer.addEventListener('mouseup', onUp);
    layer.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey, true);
    cleanup = close;
  }

  // --- Text z DOM uvnitř obdélníku -----------------------------------------

  const intersects = (a, r) => a.right > r.left && a.left < r.right && a.bottom > r.top && a.top < r.bottom;
  const inside = (a, r) => {
    const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  };

  function textInRect(r) {
    const frags = [];
    const range = document.createRange();
    const elRects = new Map();
    const elHit = (el) => {
      if (!elRects.has(el)) elRects.set(el, intersects(el.getBoundingClientRect(), r));
      return elRects.get(el);
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (SKIP.has(node.nodeName)) return NodeFilter.FILTER_REJECT;
          // Prvek mimo výřez přeskočíme i s potomky, pokud nepřetéká (overflow).
          const cs = node.getBoundingClientRect();
          if (cs.width && cs.height && !intersects(cs, r) && getComputedStyle(node).overflow !== 'visible') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_SKIP;
        }
        return node.nodeValue.trim() && elHit(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()];
      if (!rects.some((q) => intersects(q, r))) continue;
      if (rects.every((q) => inside(q, r))) {
        const q = rects[0];
        frags.push({ text: node.nodeValue, x: q.left, y: (q.top + q.bottom) / 2, h: q.height });
        continue;
      }
      // Uzel je ve výřezu jen zčásti: bereme jednotlivá slova.
      for (const m of node.nodeValue.matchAll(/\S+/g)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const q = range.getBoundingClientRect();
        if (inside(q, r)) frags.push({ text: m[0], x: q.left, y: (q.top + q.bottom) / 2, h: q.height });
      }
    }

    for (const el of document.querySelectorAll('input:not([type=hidden]), textarea')) {
      const q = el.getBoundingClientRect();
      if (el.value && inside(q, r)) frags.push({ text: el.value, x: q.left, y: (q.top + q.bottom) / 2, h: q.height });
    }

    return toLines(frags);
  }

  // Fragmenty na stejné výšce tvoří jeden řádek; řádky shora dolů.
  function toLines(frags) {
    frags.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const f of frags) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(f.y - line.y) < Math.max(4, Math.min(f.h, line.h) / 2)) line.items.push(f);
      else lines.push({ y: f.y, h: f.h, items: [f] });
    }
    return lines.map((l) => l.items.sort((a, b) => a.x - b.x).map((f) => f.text.trim()).join(' ')).join('\n');
  }

  // --- Výsledek --------------------------------------------------------------

  async function getRates() {
    const stored = await chrome.storage.local.get('cnbRates');
    return stored.cnbRates || (await chrome.runtime.sendMessage({ type: 'getRates' }));
  }

  async function show(text, anchor) {
    const data = await getRates().catch(() => null);
    const res = PC.summarize(text, data && data.rates);
    bubble(res, data, anchor);
  }

  function bubble(res, data, anchor) {
    const host = document.createElement('div');
    host.dataset.picCalc = '';
    host.style.cssText = `position:fixed;z-index:${Z};left:0;top:0;`;
    const root = host.attachShadow({ mode: 'closed' });
    const n = (v) => fmt.format(v);

    const count = res.items.length;
    const empty = !count && !res.unknown.length;
    const unit = res.items.some((i) => i.currency) ? ' Kč' : '';
    const money = (v, cur) => `${n(v)} ${cur === 'CZK' ? 'Kč' : cur}`;

    let html;
    if (empty) {
      html = '<div class="head plain"><span>CZalKulator</span><button class="x" aria-label="Zavřít">×</button></div>' +
        '<div class="empty">Ve výřezu není žádná částka.</div>';
    } else {
      const total = res.items.length + res.unknown.length;
      const single = count === 1 && !res.unknown.length;
      const foreign = res.currency && res.currency !== 'CZK';
      const label = single
        ? (foreign ? 'Převod' : 'Částka')
        : `Součet · ${res.unknown.length ? `${count} z ${total} položek` : `${count} ${plural(count)}`}`;
      const rate = foreign ? res.items[0].rate : null;
      const rateText = rate === null ? '' : rate >= 1
        ? ` · kurz ${fmtRate.format(rate)} Kč`
        : ` · kurz ${fmtRate.format(rate * 100)} Kč za 100`;
      const sub = foreign ? `<div class="sub">${money(res.totalOriginal, res.currency)}${rateText}</div>` : '';
      const rows = count > 1
        ? '<div class="rows">' + res.items.slice(0, 12).map((i) =>
          `<span class="o">${i.currency ? money(i.value, i.currency) : n(i.value)}</span><span class="k">${n(i.czk)}${unit}</span>`).join('') +
          (count > 12 ? `<span class="o">… a dalších ${count - 12}</span><span></span>` : '') + '</div>'
        : '';
      const warn = res.unknown.length
        ? `<div class="warn">Nezapočteno, chybí kurz ČNB: ${res.unknown.map((u) => esc(u.raw)).join(', ')}</div>` : '';
      const source = data ? `ČNB ${data.date.split('-').reverse().map(Number).join('. ')}` : 'Kurzy ČNB nedostupné';
      html = `<div class="head"><span>${label}</span><button class="x" aria-label="Zavřít">×</button></div>` +
        `<div class="total"><div class="big">${count ? n(res.totalCzk) + unit : '–'}</div>${sub}</div>` +
        `${rows}${warn}<div class="foot"><span>${source}</span>` +
        (count ? '<button class="copy">Kopírovat</button>' : '') + '</div>';
    }

    root.innerHTML = `<style>
      .b{--bg:#fff;--fg:#1f1f1f;--muted:#6b6f6c;--line:#e4e6e4;--ok:#0b6e4f;--warn:#8a5a00;--warn-bg:#fff4dc;--btn:#f1f3f1;
         --total-bg:#fcf5e6;--total-fg:#111412;--total-sub:#4a4538;--shadow:rgba(0,0,0,.16);
         width:300px;max-width:calc(100vw - 16px);background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:12px;
         box-shadow:0 8px 28px var(--shadow);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden;text-align:left}
      @media (prefers-color-scheme:dark){.b{--bg:#262a27;--fg:#eef1ee;--muted:#a3aaa5;--line:#3a403c;--ok:#6fd3a8;--warn:#f3c66b;
         --warn-bg:#3b3220;--btn:#323733;--total-bg:#3f3522;--total-fg:#fff;--total-sub:#d8d0bf;--shadow:rgba(0,0,0,.5)}}
      .head{display:flex;align-items:center;justify-content:space-between;padding:10px 10px 0 14px;font-size:12px;
         background:var(--total-bg);color:var(--total-sub)}
      .head.plain{background:transparent;color:var(--muted)}
      .x{width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:inherit;font-size:16px;line-height:1;cursor:pointer}
      .x:hover{background:var(--btn)}
      .total{background:var(--total-bg);padding:2px 14px 12px}
      .big{font-size:24px;font-weight:700;letter-spacing:-.01em;color:var(--total-fg);font-variant-numeric:tabular-nums}
      .sub{color:var(--total-sub);font-variant-numeric:tabular-nums}
      .rows{border-top:1px solid var(--line);padding:8px 14px;display:grid;grid-template-columns:1fr auto;column-gap:12px;row-gap:3px;
         font-variant-numeric:tabular-nums}
      .o{color:var(--muted)}.k{text-align:right}
      .warn{margin:8px 14px;padding:6px 8px;border-radius:6px;background:var(--warn-bg);color:var(--warn);font-size:12px}
      .foot{border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:8px;
         padding:8px 10px 8px 14px;color:var(--muted);font-size:11.5px}
      .copy{border:0;border-radius:7px;padding:5px 10px;background:var(--btn);color:var(--fg);font:600 12px system-ui,sans-serif;cursor:pointer}
      .copy.ok{color:var(--ok)}
      .x:focus-visible,.copy:focus-visible{outline:2px solid var(--fg);outline-offset:1px}
      .empty{padding:10px 14px 12px}
    </style><div class="b" role="dialog" aria-label="CZalKulator">${html}</div>`;
    document.documentElement.appendChild(host);

    // Umístění pod výřez, aby nezakrývalo vybrané částky; uvnitř okna.
    const b = root.querySelector('.b');
    const w = b.offsetWidth, h = b.offsetHeight;
    let left = Math.min(Math.max(8, anchor.left), innerWidth - w - 8);
    let top = anchor.bottom + 8;
    if (top + h > innerHeight - 8) top = Math.max(8, anchor.top - h - 8);
    host.style.left = left + 'px';
    host.style.top = top + 'px';

    const close = () => {
      host.remove();
      document.removeEventListener('mousedown', onOutside, true);
      window.removeEventListener('keydown', onKey, true);
      cleanup = null;
    };
    const onOutside = (e) => { if (!e.composedPath().includes(host)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    root.querySelector('.x').addEventListener('click', close);
    const copy = root.querySelector('.copy');
    if (copy) copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(n(res.totalCzk).replace(/\s/g, ''));
        copy.textContent = 'Zkopírováno ✓';
        copy.classList.add('ok');
        setTimeout(close, 900);
      } catch {
        copy.textContent = 'Nelze kopírovat';
      }
    });
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('keydown', onKey, true);
    cleanup = close;
    if (empty) setTimeout(close, 2000);
  }

  const plural = (k) => (k >= 2 && k <= 4 ? 'položky' : 'položek');
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  PC.start = start;
  PC._textInRect = textInRect; // pro testy
})();
