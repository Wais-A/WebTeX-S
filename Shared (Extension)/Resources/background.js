browser.runtime.onInstalled.addListener(async ({reason}) => {
  if (reason === 'install') {
    await browser.storage.local.set({
      allowedHosts: {}
    });
  }
});

// Toolbar icon click toggles enable/disable for current site
function baseHost(h){
  const parts = h.split('.');
  return parts.length>2 ? parts.slice(-2).join('.') : h;
}

browser.action.onClicked.addListener(async (tab) => {
  try {
    const url = new URL(tab.url);
    const host = baseHost(url.hostname);
    if (!host) return;
    const { allowedHosts = {} } = await browser.storage.local.get('allowedHosts');
    const enabled = !allowedHosts[host];
    if (enabled) {
      allowedHosts[host] = true;
    } else {
      delete allowedHosts[host];
    }
    await browser.storage.local.set({ allowedHosts });
    // Update badge
    browser.action.setBadgeText({ text: enabled ? 'ON' : 'OFF', tabId: tab.id });
    // Reload to apply
    browser.tabs.reload(tab.id);
  } catch (e) {
    console.error(e);
  }
});

browser.runtime.onMessage.addListener((req, sender) => {
  if (req.ping)          return Promise.resolve('pong');
  if (req.greeting==='hello') return Promise.resolve({farewell:'goodbye'});
});
