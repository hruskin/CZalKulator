// Vkládá se do stránky až po aktivaci: výběr obdélníku, čtení textu z DOM a bublina s výsledkem.
(function () {
  'use strict';
  const PC = globalThis.PicCalc;
  if (PC.start) return; // skript už na stránce běží

  const Z = 2147483647;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg']);
  const fmt = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    host.style.cssText = `position:fixed;z-index:${Z};left:0;top:0;`;
    const root = host.attachShadow({ mode: 'closed' });
    const n = (v) => fmt.format(v);

    let html;
    if (!res.items.length && !res.unknown.length) {
      html = '<div class="t">Ve výřezu není žádná částka</div>';
    } else {
      const rows = res.items.slice(0, 12).map((i) =>
        i.currency === 'CZK' || !i.currency
          ? `<div class="r">${n(i.value)}${i.currency ? ' Kč' : ''}</div>`
          : `<div class="r">${n(i.value)} ${i.currency} → ${n(i.czk)} Kč</div>`).join('');
      const more = res.items.length > 12 ? `<div class="m">… a dalších ${res.items.length - 12}</div>` : '';
      const orig = res.currency && res.currency !== 'CZK' && res.items.length > 1
        ? `<div class="m">= ${n(res.totalOriginal)} ${res.currency}</div>` : '';
      const unk = res.unknown.length
        ? `<div class="w">Bez kurzu, nezapočteno: ${res.unknown.map((u) => esc(u.raw)).join(', ')}</div>` : '';
      const date = data ? `kurz ČNB ${data.date.split('-').reverse().map(Number).join('. ')}` : 'kurzy ČNB nejsou k dispozici';
      const unit = res.items.some((i) => i.currency) ? ' Kč' : '';
      html = `<div class="t">Σ ${n(res.totalCzk)}${unit}</div>${orig}${rows}${more}${unk}` +
        `<div class="f">${date} · kliknutím zkopírovat</div>`;
    }

    root.innerHTML = `<style>
      .b{font:13px/1.45 system-ui,sans-serif;color:#1f1f1f;background:#fff;border:1px solid #c7c7c7;border-radius:8px;
         box-shadow:0 4px 16px rgba(0,0,0,.18);padding:8px 12px;max-width:340px;cursor:pointer;user-select:none}
      .t{font-size:16px;font-weight:600}.r{font-variant-numeric:tabular-nums;color:#444}
      .m{color:#666}.w{color:#b3261e;margin-top:4px}.f{color:#777;font-size:11px;margin-top:6px}
      .ok{color:#137333}
      @media (prefers-color-scheme:dark){.b{background:#2b2b2b;color:#eee;border-color:#555}.r{color:#ccc}.m,.f{color:#aaa}.w{color:#f2b8b5}.ok{color:#81c995}}
    </style><div class="b">${html}</div>`;
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
    b.addEventListener('click', async () => {
      if (!res.items.length) return close();
      try {
        await navigator.clipboard.writeText(n(res.totalCzk).replace(/\s/g, ''));
        b.querySelector('.f').innerHTML = '<span class="ok">Zkopírováno</span>';
        setTimeout(close, 700);
      } catch { close(); }
    });
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('keydown', onKey, true);
    cleanup = close;
    if (!res.items.length && !res.unknown.length) setTimeout(close, 1800);
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  PC.start = start;
  PC._textInRect = textInRect; // pro testy
})();
