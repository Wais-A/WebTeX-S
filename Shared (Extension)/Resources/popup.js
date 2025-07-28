const toggle   = document.getElementById('toggle');
const storage  = browser.storage.local;
const statusEl = document.createElement('div');

async function load () {
  const { extensionEnabled = true } = await storage.get('extensionEnabled');
  toggle.checked = extensionEnabled;
  
  statusEl.className = 'status';
  statusEl.style.color = toggle.checked ? '#4CAF50' : '#777';
  statusEl.textContent = toggle.checked ? 'Active' : 'Disabled';
  document.body.appendChild(statusEl);
}

toggle.addEventListener('change', async () => {
  statusEl.style.color = toggle.checked ? '#4CAF50' : '#777';
  statusEl.textContent = toggle.checked ? 'Active' : 'Disabled';
  
  await storage.set({ extensionEnabled: toggle.checked });
  
  const tabs = await browser.tabs.query({});
  
  statusEl.textContent = 'Applying changes...';
  
  const promises = tabs.map(tab => {
    try {
      return browser.tabs.sendMessage(tab.id, {
        action: 'toggleExtension',
        enabled: toggle.checked
      }).catch(() => {/* Ignore errors for tabs where content script isn't running */});
    } catch (e) {
      return Promise.resolve(); // Ignore errors
    }
  });
  
  await Promise.all(promises);
  
  setTimeout(() => {
    statusEl.textContent = toggle.checked ? 'Active' : 'Disabled';
  }, 750);
});

load();
