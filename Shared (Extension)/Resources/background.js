browser.runtime.onInstalled.addListener(async ({reason}) => {
  if (reason === 'install') {
    await browser.storage.local.set({
      globalEnabled: true,
      allowedHosts: { '*': true }
    });
  }
});

browser.runtime.onMessage.addListener((req, sender) => {
  if (req.ping)          return Promise.resolve('pong');
  if (req.greeting==='hello') return Promise.resolve({farewell:'goodbye'});
});
