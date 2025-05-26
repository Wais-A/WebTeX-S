const toggle   = document.getElementById('toggle');
const storage  = browser.storage.local;

async function load () {
  const { globalEnabled = true } = await storage.get('globalEnabled');
  toggle.checked = globalEnabled;
}

toggle.addEventListener('change', async () => {
  /* ① persist the new state … */
  await storage.set({ globalEnabled: toggle.checked });

  /* ② tell every content-script that prefs changed (optional--kept) */
  browser.runtime.sendMessage('prefs-changed').catch(()=>{});

  /* ③ reload the active tab so the change is visible immediately */
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) browser.tabs.reload(tab.id);      // ← the actual refresh
});

load();
