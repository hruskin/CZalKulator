const box = document.getElementById('auto');
const status = document.getElementById('status');
const ORIGINS = { origins: ['<all_urls>'] };

chrome.storage.local.get('autoSelect').then(({ autoSelect }) => { box.checked = Boolean(autoSelect); });

box.addEventListener('change', async () => {
  status.textContent = '';
  if (box.checked) {
    // Žádost o oprávnění musí přijít přímo z kliknutí.
    const granted = await chrome.permissions.request(ORIGINS);
    if (!granted) {
      box.checked = false;
      status.textContent = 'Bez oprávnění ke všem webům to nejde zapnout.';
      return;
    }
  } else {
    await chrome.permissions.remove(ORIGINS).catch(() => {});
  }
  await chrome.storage.local.set({ autoSelect: box.checked });
  await chrome.runtime.sendMessage({ type: 'syncAuto' });
});
