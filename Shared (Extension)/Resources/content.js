/* WebTeX — single‑toggle version (2025‑04, selection‑safe + UI‑quiet + typing‑safe) */

(() => {
  const storage = browser.storage?.local ?? { get: async () => ({}), set: async () => {} };

  /* Run/skip decision ----------------------------------------------------- */
  async function shouldRun() {
    const { globalEnabled = true } = await storage.get('globalEnabled');
    if (!globalEnabled) return false;
    if (document.querySelector('script[src*="katex"],script[src*="mathjax"]')) return false;
    return true;
  }

  /* Helpers ---------------------------------------------------------------- */
  const DELIMS = [
    { left: '$$',  right: '$$',  display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '$',   right: '$',   display: false },
    { left: '\\(', right: '\\)', display: false }
  ];

  function decodeEntitiesWalk(node) {
    /* ① Don’t touch anything inside an editor --------------------------- */
    if (node.nodeType === 1 && (node.isContentEditable ||
        node.matches?.('input, textarea, [contenteditable]'))) {
      return;
    }

    if (node.nodeType === 3) {            // text node
      node.data = node.data
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
    } else if (node.nodeType === 1) {     // element
      node.childNodes.forEach(decodeEntitiesWalk);
    }
  }

  function renderAll(root = document.body) {
    decodeEntitiesWalk(root);
    renderMathInElement(root, {
      delimiters: DELIMS,
      ignoredTags: ['script','style','textarea','pre','code','noscript','input'],
      throwOnError: false,
      strict: 'ignore'
    });
  }

  /* Safe render wrapper ---------------------------------------------------- */
  let mo;
  function safeRender(root = document.body) {
    mo?.disconnect();
    renderAll(root);
    mo?.observe(document, { subtree: true, childList: true });  // no characterData
  }

  /* Ripple‑filter helpers -------------------------------------------------- */
  function isRippleNode(n) {
    return n.nodeType === 1 && n.classList && (
      n.classList.contains('mat-ripple') ||
      n.classList.contains('mdc-button__ripple') ||
      n.classList.contains('mat-focus-indicator')
    );
  }
  function mutationsOnlyRipple(muts) {
    return muts.every(m =>
      [...m.addedNodes, ...m.removedNodes].every(isRippleNode)
    );
  }
  /* ✨ NEW helper: are all mutations inside the element we’re typing in? */
  function typingInsideActiveElement(muts) {
    const active = document.activeElement;
    if (!active || !(active.isContentEditable || /^(INPUT|TEXTAREA)$/.test(active.tagName)))
      return false;
    return muts.every(m => active.contains(m.target));
  }

  /* Main ------------------------------------------------------------------ */
  (async function init() {
    if (!(await shouldRun())) return;

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => safeRender());
    } else {
      safeRender();
    }

    /* KaTeX selectable */
    const style = document.createElement('style');
    style.textContent = '.katex{user-select:text!important;}';
    document.head.append(style);

    /* Observer: ripple‑aware + typing‑aware */
    mo = new MutationObserver(muts => {
      if (mutationsOnlyRipple(muts)) return;          // UI hover noise
      if (typingInsideActiveElement(muts)) return;    // user is typing

      clearTimeout(mo.t);
      mo.t = setTimeout(
        () => requestAnimationFrame(() => safeRender()),
        100
      );
    });
    mo.observe(document, { subtree: true, childList: true });

    browser.runtime.onMessage.addListener(msg => {
      if (msg === 'prefs-changed') shouldRun().then(ok => ok && safeRender());
    });
  })();
})();
