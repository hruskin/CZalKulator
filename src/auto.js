// Volitelné: po označení textu s částkou se výsledek ukáže sám.
// Registruje se jako content script na všech webech, jen když to uživatel zapne v nastavení.
(function () {
  'use strict';
  const PC = globalThis.PicCalc;
  if (PC.autoLoaded && PC.alive && PC.alive()) return;
  PC.autoLoaded = true;

  const editable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  // Spouštět jen na zjevné částky: aspoň jedna s měnou, nebo sloupec čísel (každý řádek jedno).
  function looksLikeAmounts(text) {
    if (text.length > 5000) return false;
    const amounts = PC.findAmounts(text);
    if (amounts.some((a) => a.currency)) return true;
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.length >= 2 && lines.every((l) => /^[-−(]?[\d\s\u00a0.,']+\)?$/.test(l));
  }

  const onUp = (e) => {
    // Starý skript po aktualizaci doplňku se odpojí; ve stránce už běží nový (viz background.js).
    if (!PC.alive()) return document.removeEventListener('mouseup', onUp, true);
    if (e.button !== 0 || e.composedPath().some((n) => n.dataset && 'picCalc' in n.dataset)) return;
    if (editable(document.activeElement)) return;
    // Až po dokončení výběru prohlížečem.
    setTimeout(() => {
      const text = String(window.getSelection() || '').trim();
      if (text && looksLikeAmounts(text)) PC.start();
    }, 0);
  };
  document.addEventListener('mouseup', onUp, true);

  PC.looksLikeAmounts = looksLikeAmounts;
})();
