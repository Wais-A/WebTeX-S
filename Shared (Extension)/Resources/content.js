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
    if (node.dataset?.wtDecoded) return; // already decoded

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
      node.dataset.wtDecoded = '1';
    }
  }

  function isInViewport(el) {
    const r = el.getBoundingClientRect?.();
    return !!r && r.bottom > 0 && r.top < (window.innerHeight||0);
  }

  function containsPotentialMath(node){
    const t = node.textContent;
    return /\$\$|\\\[|\\\(|\$[^\d\s]/.test(t);
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
  const schedule = cb => (window.requestIdleCallback ? requestIdleCallback(cb,{timeout:200}) : setTimeout(cb,100));
  function safeRender(root = document.body) {
    mo?.disconnect();
    // do not render inside editors
    if (root.closest?.('[contenteditable], input, textarea')) return;
    // if root is element and off-screen, skip
    if (root !== document.body && !isInViewport(root)) return;
    if (root !== document.body && !containsPotentialMath(root)) return;
    renderAll(root);
    mo?.observe(document, { subtree: true, childList: true, characterData: true });  // no characterData
  }

  /* Ripple‑filter helpers -------------------------------------------------- */
  function isRippleNode(n) {
    if (n.nodeType !== 1 || !n.classList) return false;
    const rippleClasses = [
      'mat-ripple', 'mdc-button__ripple', 'mat-focus-indicator',
      'ripple', 'MuiTouchRipple-root', 'v-ripple__container'];
    return rippleClasses.some(c => n.classList.contains(c));
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

  /* ✨ NEW helper: is the user currently selecting text? */
  function userIsSelecting() {
    const sel = window.getSelection?.();
    return !!sel && sel.rangeCount > 0 && !sel.isCollapsed;
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

    /* Observer: ripple‑aware + typing‑aware + selection‑aware */
    mo = new MutationObserver(muts => {
      // if text changed inside existing node, re-render whole viewport after debounce
      if (muts.some(m => m.type === 'characterData')) {
        clearTimeout(mo.t);
        mo.t = schedule(() => requestAnimationFrame(() => safeRender()));
        return;
      }
      const subtrees = [];
      muts.forEach(m => {
        if (m.type === 'childList') {
          m.addedNodes.forEach(n => n.nodeType===1 && subtrees.push(n));
        }
      });
      if (subtrees.length) {
        schedule(() => subtrees.forEach(safeRender));
        return;
      }
      if (mutationsOnlyRipple(muts)) return;          // UI hover noise
      if (typingInsideActiveElement(muts)) return;    // user is typing
      if (userIsSelecting()) return;                 // user is selecting text

      clearTimeout(mo.t);
      mo.t = schedule(() => requestAnimationFrame(() => safeRender()));
    });
    mo.observe(document, { subtree: true, childList: true, characterData: true });
    window.addEventListener('pagehide', () => mo.disconnect(), { once: true });

    browser.runtime.onMessage.addListener(msg => {
      if (msg === 'prefs-changed') shouldRun().then(ok => ok && safeRender());
    });
  })();
})();
