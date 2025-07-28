/* WebTeX — single‑toggle version (2025‑07, selection‑safe + UI‑quiet + typing‑safe + NotebookLM-compatible) */

(() => {
  const storage = browser.storage?.local ?? { get: async () => ({}), set: async () => {} };

  /* Run/skip decision ----------------------------------------------------- */
  async function shouldRun() {
    const { globalEnabled = true } = await storage.get('globalEnabled');
    if (!globalEnabled) return false;
    
    // Special case for NotebookLM - always run our extension
    const isNotebookLM = window.location.hostname.includes('notebooklm');
    if (isNotebookLM) return true;
    
    // Skip if page already has KaTeX or MathJax
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
    
    // Check if we're on NotebookLM
    const isNotebookLM = window.location.hostname.includes('notebooklm');
    
    if (isNotebookLM) {
      // Use a more CSP-friendly approach for NotebookLM
      try {
        // Try to initialize KaTeX directly with custom settings
        if (typeof katex !== 'undefined' && typeof renderMathInElement === 'function') {
          // Use setTimeout to break out of the current execution context
          // This can help with some CSP restrictions
          setTimeout(() => {
            renderMathInElement(root, {
              delimiters: DELIMS,
              ignoredTags: ['script','style','textarea','pre','code','noscript','input'],
              throwOnError: false,
              trust: true,  // Add trust option to handle some CSP issues
              strict: 'ignore'
            });
          }, 0);
        }
      } catch (e) {
        console.error('WebTeX NotebookLM rendering failed:', e);
      }
    } else {
      // Standard approach for other sites
      renderMathInElement(root, {
        delimiters: DELIMS,
        ignoredTags: ['script','style','textarea','pre','code','noscript','input'],
        throwOnError: false,
        strict: 'ignore'
      });
    }
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
    mo?.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style','hidden','class'] });  // no characterData
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
    
    // Check if we're on NotebookLM
    const isNotebookLM = window.location.hostname.includes('notebooklm');
    
    // For NotebookLM, use a more aggressive approach to ensure rendering works
    if (isNotebookLM) {
      console.log('WebTeX: NotebookLM detected, using compatible mode');
      
      // Use progressive enhancement approach for NotebookLM
      const renderFn = () => {
        try {
          safeRender();
          // Re-render after a delay to catch any late-loading content
          setTimeout(safeRender, 1000);
          setTimeout(safeRender, 3000);
        } catch (e) {
          console.error('WebTeX NotebookLM render error:', e);
        }
      };
      
      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', renderFn);
      } else {
        renderFn();
      }
      
      // Add periodic rendering to catch new content on NotebookLM
      setInterval(safeRender, 5000);
    } else {
      // Standard initialization for other sites
      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => safeRender());
      } else {
        safeRender();
      }
    }

    /* KaTeX selectable */
    const style = document.createElement('style');
    style.textContent = '.katex{user-select:text!important;}';
    try {
      document.head.append(style);
    } catch (e) {
      console.error('WebTeX style insertion error:', e);
    }

    /* Observer: ripple‑aware + typing‑aware + selection‑aware */
    try {
      // Check if we're on NotebookLM
      const isNotebookLM = window.location.hostname.includes('notebooklm');
      
      mo = new MutationObserver(muts => {
        try {
          // if text changed, render parent elements quickly
          const charNodes = muts.filter(m => m.type === 'characterData').map(m => m.target.parentNode).filter(Boolean);
          if (charNodes.length) {
            const uniqueParents = Array.from(new Set(charNodes));
            schedule(() => uniqueParents.forEach(safeRender));
            // fall through to allow additional logic (e.g., full render debounce)
          }
          
          const subtrees = [];
          // attribute changes (e.g., display:none → block)
          muts.forEach(m => {
            if (m.type === 'attributes') {
              subtrees.push(m.target);
            }
          });
          muts.forEach(m => {
            if (m.type === 'childList') {
              m.addedNodes.forEach(n => n.nodeType===1 && subtrees.push(n));
            }
          });
          if (subtrees.length) {
            schedule(() => subtrees.forEach(safeRender));
            return;
          }
          
          // For NotebookLM, we want to be more aggressive with rendering
          if (isNotebookLM) {
            // For NotebookLM, be less restrictive about when to render
            // This helps ensure math gets rendered despite strict CSP
            const shouldSkip = mutationsOnlyRipple(muts) || 
                              (typingInsideActiveElement(muts) && !isNotebookLM) || 
                              (userIsSelecting() && !isNotebookLM);
                              
            if (!shouldSkip) {
              clearTimeout(mo.t);
              mo.t = setTimeout(() => safeRender(), 100);
            }
          } else {
            // Standard behavior for other sites
            if (mutationsOnlyRipple(muts)) return;          // UI hover noise
            if (typingInsideActiveElement(muts)) return;    // user is typing
            if (userIsSelecting()) return;                 // user is selecting text

            clearTimeout(mo.t);
            mo.t = schedule(() => requestAnimationFrame(() => safeRender()));
          }
        } catch (e) {
          console.error('WebTeX mutation handling error:', e);
        }
      });
      
      // Start observing with error handling
      mo.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style','hidden','class'] });
    } catch (e) {
      console.error('WebTeX observer setup error:', e);
    }
    // Re-attach observer when tab becomes visible again (handles SPA view swaps)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        try { 
          // First try to re-observe
          mo.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style','hidden','class'] }); 
          
          // Check if we're on NotebookLM and force a render
          if (window.location.hostname.includes('notebooklm')) {
            // Staggered rendering to catch dynamic content
            setTimeout(safeRender, 100);
            setTimeout(safeRender, 1000);
            setTimeout(safeRender, 3000);
          }
        } catch (e) {
          console.error('WebTeX visibility change error:', e);
        }
      }
    });

    browser.runtime.onMessage.addListener(msg => {
      if (msg === 'prefs-changed') shouldRun().then(ok => ok && safeRender());
    });
  })();
})();
