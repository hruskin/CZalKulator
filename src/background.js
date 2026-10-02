// Service worker: drží kurzy ČNB aktuální a po aktivaci vloží skript do karty.
importScripts('rates.js');

const { fetchRates, loadRates } = self.PicCalc;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

async function refreshIfStale() {
  const current = await loadRates();
  if (current && Date.now() - current.fetchedAt < MAX_AGE_MS) return current;
  try {
    return await fetchRates();
  } catch (err) {
    console.warn('CZalculator: kurzy ČNB se nepodařilo stáhnout', err);
    return current;
  }
}

async function activate(tab) {
  if (!tab || tab.id === undefined) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/parser.js', 'src/content.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.PicCalc.start() });
  } catch (err) {
    // chrome:// stránky, Web Store a vestavěný PDF prohlížeč skripty nepovolují.
    console.warn('CZalculator: na této stránce nelze spustit', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pic-calc', title: 'Sečíst a převést na Kč', contexts: ['selection'] });
    chrome.contextMenus.create({
      id: 'pic-calc-rect',
      title: 'Označit výřez a spočítat (Alt+Shift+S)',
      contexts: ['page', 'link', 'image', 'video', 'audio', 'frame'],
    });
  });
  chrome.alarms.create('rates', { periodInMinutes: 60 });
  refreshIfStale();
  syncAuto();
});

chrome.runtime.onStartup.addListener(refreshIfStale);
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === 'rates' && refreshIfStale());
chrome.action.onClicked.addListener(activate);
chrome.contextMenus.onClicked.addListener((info, tab) => String(info.menuItemId).startsWith('pic-calc') && activate(tab));
chrome.commands.onCommand.addListener((command, tab) => command === 'activate' && activate(tab));

// Volitelné spouštění označením: content script na všech webech jen se zapnutým nastavením a oprávněním.
const AUTO_ID = 'pic-calc-auto';
let autoQueue = Promise.resolve();
// Volání se řadí za sebe, aby souběžná registrace neskončila chybou „Duplicate script ID“.
function syncAuto() {
  autoQueue = autoQueue.then(doSyncAuto, doSyncAuto);
  return autoQueue;
}
async function doSyncAuto() {
  const { autoSelect } = await chrome.storage.local.get('autoSelect');
  const allowed = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [AUTO_ID] });
  if (autoSelect && allowed && !registered.length) {
    await chrome.scripting.registerContentScripts([{
      id: AUTO_ID, matches: ['<all_urls>'], js: ['src/parser.js', 'src/content.js', 'src/auto.js'],
      runAt: 'document_idle', persistAcrossSessions: true,
    }]);
  } else if (!(autoSelect && allowed) && registered.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [AUTO_ID] });
  }
}
chrome.permissions.onRemoved.addListener(syncAuto);

// Content script si řekne o kurzy, jen když v cache ještě nejsou (první spuštění).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'getRates') {
    refreshIfStale().then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'syncAuto') {
    syncAuto().then(() => sendResponse(true));
    return true;
  }
});
