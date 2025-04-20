/* WebTeX — single‑toggle version (2025‑04, selection‑safe) */

(() => {
  const storage = browser.storage?.local ?? { get: async () => ({}), set: async () => {} };

  /* run‑or‑skip decision ---------------------------------------------------- */
  async function shouldRun() {
    const { globalEnabled = true } = await storage.get('globalEnabled');
    if (!globalEnabled) { console.log('[WebTeX] disabled'); return false; }

    if (document.querySelector('script[src*="katex"],script[src*="mathjax"]')) {
      console.log('[WebTeX] native renderer detected – skip');
      return false;
    }
    return true;
  }

  /* helpers ----------------------------------------------------------------- */
  const DELIMS = [
    { left: '$$',  right: '$$',  display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '$',   right: '$',   display: false },
    { left: '\\(', right: '\\)', display: false }
  ];

  function decodeEntitiesWalk(n) {
    if (n.nodeType === 3) {
      n.data = n.data
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
    } else if (
      n.nodeType === 1 &&
      !['SCRIPT', 'STYLE', 'PRE', 'CODE', 'NOSCRIPT', 'TEXTAREA'].includes(n.nodeName)
    ) {
      n.childNodes.forEach(decodeEntitiesWalk);
    }
  }

  function renderAll(root = document.body) {
    decodeEntitiesWalk(root);
    renderMathInElement(root, {
      delimiters: DELIMS,
      ignoredTags: ['script', 'style', 'textarea', 'pre', 'code', 'noscript'],
      throwOnError: false,
      strict: 'ignore'
    });
  }

  /* selection‑safe render wrapper ------------------------------------------- */
  let mo;            // forward‑declared so safeRender can pause/restart it

  function safeRender(root = document.body) {
    mo?.disconnect();                 // 1. stop observer feedback
    renderAll(root);                  // 2. mutate DOM once
    mo?.observe(document, {           // 3. resume (no characterData!)
      subtree: true,
      childList: true
    });
  }

  /* main -------------------------------------------------------------------- */
  (async function init() {
    if (!(await shouldRun())) return;

    /* 1st render (after DOMContentLoaded if needed) */
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => safeRender());
    } else {
      safeRender();
    }

    /* make KaTeX output selectable everywhere */
    const style = document.createElement('style');
    style.textContent = `
      .katex {
        user-select: text !important;
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
      }
    `;
    document.head.append(style);

    /* observer – throttled & selection‑friendly */
    mo = new MutationObserver(() => {
      clearTimeout(mo.t);
      mo.t = setTimeout(() => requestAnimationFrame(() => safeRender()), 150);
    });
    mo.observe(document, { subtree: true, childList: true });

    /* react to toggle flips from the popup/options page */
    browser.runtime.onMessage.addListener(msg => {
      if (msg === 'prefs-changed') shouldRun().then(ok => ok && safeRender());
    });
  })();
})();
