/* WebTeX — single‑toggle version (2025‑04, selection‑safe + UI‑quiet) */

(() => {
  /* ------------------------------------------------------------------ */
  /*  Storage shim (works in Safari & Firefox)                           */
  /* ------------------------------------------------------------------ */
  const storage = browser.storage?.local ?? { get: async () => ({}), set: async () => {} };

  /* ------------------------------------------------------------------ */
  /*  Run‑or‑skip decision                                              */
  /* ------------------------------------------------------------------ */
  async function shouldRun() {
    const { globalEnabled = true } = await storage.get('globalEnabled');
    if (!globalEnabled) { console.log('[WebTeX] disabled'); return false; }

    if (document.querySelector('script[src*="katex"],script[src*="mathjax"]')) {
      console.log('[WebTeX] native renderer detected – skip');
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */
  const DELIMS = [
    { left: '$$',  right: '$$',  display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '$',   right: '$',   display: false },
    { left: '\\(', right: '\\)', display: false }
  ];

  /** Decode &lt;, &gt;, &amp; in *text* nodes so KaTeX sees raw delimiters */
  function decodeEntitiesWalk(node) {
    if (node.nodeType === 3) {
      node.data = node.data
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
    } else if (
      node.nodeType === 1 &&
      !['SCRIPT', 'STYLE', 'PRE', 'CODE', 'NOSCRIPT', 'TEXTAREA'].includes(node.nodeName)
    ) {
      node.childNodes.forEach(decodeEntitiesWalk);
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

  /* ------------------------------------------------------------------ */
  /*  Selection‑safe render wrapper                                     */
  /* ------------------------------------------------------------------ */
  let mo; // MutationObserver reference

  function safeRender(root = document.body) {
    mo?.disconnect();          // 1. pause observer
    renderAll(root);           // 2. mutate DOM once
    mo?.observe(document, {    // 3. resume
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Ripple filter helpers (ignore pure UI noise)                      */
  /* ------------------------------------------------------------------ */
  function isRippleNode(n) {
    return (
      n.nodeType === 1 &&
      n.classList && (
        n.classList.contains('mat-ripple') ||            // Angular Material
        n.classList.contains('mdc-button__ripple') ||    // MDC
        n.classList.contains('mat-focus-indicator')      // Focus ring
      )
    );
  }

  function mutationsOnlyRipple(muts) {
    return muts.every(m =>
      [...m.addedNodes, ...m.removedNodes].every(isRippleNode)
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Main                                                              */
  /* ------------------------------------------------------------------ */
  (async function init() {
    if (!(await shouldRun())) return;

    /* First render --------------------------------------------------- */
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => safeRender());
    } else {
      safeRender();
    }

    /* Make KaTeX output selectable everywhere ------------------------ */
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

    /* Observer (debounced, ripple‑aware) ----------------------------- */
    mo = new MutationObserver(muts => {
      if (mutationsOnlyRipple(muts)) return;  // ignore pure UI ripples

      clearTimeout(mo.t);
      mo.t = setTimeout(
        () => requestAnimationFrame(() => safeRender()),
        100   // debounce window
      );
    });
    mo.observe(document, { subtree: true, childList: true, characterData: true });

    /* React to toggle flips from popup / options --------------------- */
    browser.runtime.onMessage.addListener(msg => {
      if (msg === 'prefs-changed') shouldRun().then(ok => ok && safeRender());
    });
  })();
})();
