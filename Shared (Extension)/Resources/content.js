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
  
  // Common LaTeX macros to ensure consistent rendering
  const COMMON_MACROS = {
    "\\rightarrow": "\\to",
    "\\N": "\\mathbb{N}",
    "\\Z": "\\mathbb{Z}",
    "\\Q": "\\mathbb{Q}",
    "\\R": "\\mathbb{R}",
    "\\C": "\\mathbb{C}",
    // Bold text and vector support
    "\\vec": "\\mathbf",
    "\\vect": "\\mathbf",
    "\\vector": "\\mathbf",
    // Nuclear notation macros
    "\\isotope": "{}^{#2}_{#1}\\textrm{#3}",
    "\\nucl": "{}_{#1}^{#2}\\textrm{#3}",
    "\\nucleus": "{}_{#1}^{#2}\\textrm{#3}",
    // Special nuclear decay formula macro
    "\\nucleardecay": "{}_{#1}^{#2}\\textrm{#3} \\to {}_{#4}^{#5}\\textrm{#6} + {}_{#7}^{#8}\\textrm{#9}",
    // Physics formula macros
    "\\coulomb": "\\mathbf{F} = k \\frac{Q_1 Q_2}{r^2}"
  };

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

  // Process LaTeX in DOM to handle text with formulas before KaTeX renders it
  function processLatexInDOM() {
    // Find all LaTeX delimiters in text nodes
    const textWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const nodesToProcess = [];
    let currentNode;
    
    // First collect all text nodes containing math delimiters
    while (currentNode = textWalker.nextNode()) {
      const text = currentNode.nodeValue;
      if (text && /\$(.*?)\$|\\\[(.*?)\\\]|\\\((.*?)\\\)/.test(text)) {
        nodesToProcess.push(currentNode);
      }
    }
    
    // Then process each one
    nodesToProcess.forEach(node => {
      let text = node.nodeValue;
      
      // Replace \text{FORMULA} with just FORMULA in math contexts
      text = text.replace(/\$(.*?)\$|\\\[(.*?)\\\]|\\\((.*?)\\\)/g, (match, g1, g2, g3) => {
        const formula = g1 || g2 || g3 || '';
        
        // Process the formula - handle \text{} with formulas
        let processed = formula.replace(/\\text\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)}\}/g, (match, content) => {
          // If content has math symbols, remove the \text wrapper
          if (/[_\^\\+=\/\*0-9Q\{\}]/.test(content)) {
            return content;
          }
          return match;
        });
        
        // Handle \textbf{} properly - convert to \mathbf{}
        processed = processed.replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)}\}/g, (match, content) => {
          return "\\mathbf{" + content + "}";
        });
        
        // Special handling for nuclear notation with specific format ^{A}{Z}N
        processed = processed.replace(/(\^\{[^{}]+\})\{([^{}]+)\}\\text\{([^{}]+)\}/g, (match, sup, sub, element) => {
          return "_{"+sub+"}" + sup + "\\text{" + element + "}";
        });
        
        // Handle nuclear decay equations with the specific pattern
        if (processed.includes('\\rightarrow') && /\^\{[^{}]+\}\{[^{}]+\}\\text\{[^{}]+\}/.test(processed)) {
          // Convert ^{A}{Z}\text{N} format to _{Z}^{A}\text{N} format
          processed = processed.replace(/(\^\{[^{}]+\})\{([^{}]+)\}\\text\{([^{}]+)\}/g, (match, sup, sub, element) => {
            return "_{"+sub+"}" + sup + "\\text{" + element + "}";
          });
        }
        
        // Reconstruct the delimiter
        if (g1) return '$' + processed + '$';
        if (g2) return '\\[' + processed + '\\]';
        return '\\(' + processed + '\\)';
      });
      
      node.nodeValue = text;
    });
  }
  
  function renderAll(root = document.body) {
    decodeEntitiesWalk(root);
    
    // Process LaTeX with text formulas directly in the DOM before rendering
    processLatexInDOM();
    
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
              strict: 'ignore',
              macros: {
                "\\text": "\\textrm"  // Provide explicit text macro support
              }
            });
            
            // Fix selection/copying for rendered math
            setTimeout(() => fixMathSelection(), 100);
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
        strict: 'ignore',
        trust: true,
        fleqn: false,
        leqno: false,
        output: 'html',  // Use HTML output for better handling of complex formulas
        macros: COMMON_MACROS
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

  /* Selection fix ----------------------------------------------------------- */
  function fixMathSelection() {
    // Find all KaTeX-rendered elements
    const mathElements = document.querySelectorAll('.katex');
    
    mathElements.forEach(mathEl => {
      if (mathEl.dataset.selectionFixed) return;
      mathEl.dataset.selectionFixed = 'true';
      
      // Store the original LaTeX in a data attribute for copy support
      const mathmlElement = mathEl.querySelector('.katex-mathml annotation');
      if (mathmlElement) {
        const originalTex = mathmlElement.textContent;
        mathEl.dataset.originalTex = originalTex;
      }
      
      // Make math elements more selection-friendly
      mathEl.style.userSelect = 'text';
      mathEl.querySelectorAll('*').forEach(el => {
        el.style.userSelect = 'text';
      });
      
      // Handle copy event to preserve the LaTeX format
      mathEl.addEventListener('copy', function(e) {
        // Only handle if this element or its child is the primary target
        if (!e.currentTarget.contains(document.getSelection().anchorNode)) return;
        
        const texContent = mathEl.dataset.originalTex;
        if (texContent) {
          e.clipboardData.setData('text/plain', texContent);
          e.preventDefault();
        }
      });
    });
  }
  
  /* Toggle handling ----------------------------------------------------- */
  let extensionEnabled = true;
  
  // Unrender all LaTeX elements on the page
  function unrenderMath() {
    // Find all rendered KaTeX elements
    const mathElements = document.querySelectorAll('.katex-mathml');
    
    mathElements.forEach(mathEl => {
      const parent = mathEl.parentElement;
      if (!parent) return;
      
      // Store original LaTeX in a data attribute for later re-rendering
      const originalTex = mathEl.querySelector('annotation')?.textContent;
      if (originalTex) {
        // Find the outer wrapper that contains both mathml and html
        const wrapper = parent.closest('.katex') || parent;
        const originalContent = document.createElement('span');
        originalContent.className = 'wt-original-tex';
        originalContent.textContent = originalTex;
        
        // Store the original display mode
        const isDisplayMode = wrapper.classList.contains('katex-display');
        if (isDisplayMode) {
          originalContent.dataset.displayMode = 'true';
        }
        
        // Replace the rendered math with the original LaTeX
        if (wrapper.parentElement) {
          wrapper.parentElement.replaceChild(originalContent, wrapper);
        }
      }
    });
    
    // Also convert any unprocessed delimiters to wt-original-tex
    processLatexInDOM(true);
  }
  
  // Listen for messages from popup or background script
  browser.runtime.onMessage.addListener(async (message) => {
    if (message.action === 'toggleExtension') {
      extensionEnabled = message.enabled;
      
      if (extensionEnabled) {
        // Re-render all math when toggled on
        const originalTexElements = document.querySelectorAll('.wt-original-tex');
        originalTexElements.forEach(el => {
          try {
            const tex = el.textContent;
            const displayMode = el.dataset.displayMode === 'true';
            const newEl = document.createElement('span');
            if (displayMode) {
              newEl.textContent = '$$' + tex + '$$';
            } else {
              newEl.textContent = '$' + tex + '$';
            }
            if (el.parentElement) {
              el.parentElement.replaceChild(newEl, el);
            }
          } catch (e) {
            console.error('Error re-rendering math:', e);
          }
        });
        
        // Restart normal rendering
        safeRender();
      } else {
        // Unrender all math when toggled off
        unrenderMath();
      }
      
      return Promise.resolve({status: 'success'});
    }
    return Promise.resolve({status: 'unknown_message'});
  });
  
  /* Main ------------------------------------------------------------------ */
  (async function init() {
    // Check if the extension is enabled (defaults to true)
    try {
      const data = await browser.storage.local.get('extensionEnabled');
      extensionEnabled = data.extensionEnabled !== false; // Default to true if not set
    } catch (e) {
      console.error('Error retrieving extension state:', e);
    }
    
    if (!(await shouldRun()) || !extensionEnabled) return;

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

    // Set up enhanced continuous rendering
    setupContinuousRendering();
  })();
})();

// Enhanced continuous LaTeX rendering is already implemented in the first setupContinuousRendering function

// Setup function for continuous LaTeX rendering across the page
function setupContinuousRendering() {
  // Set up persistent timer references
  window.webTexRenderTimers = window.webTexRenderTimers || {};
  
  // Create a more advanced observer with enhanced dynamic content detection
  const enhancedObserver = new MutationObserver(mutations => {
    try {
      // Check if we're on NotebookLM - need special handling
      const isNotebookLM = window.location.hostname.includes('notebooklm');
      
      // Skip observation based on common conditions
      // NotebookLM gets special treatment - we're more aggressive with rendering
      const shouldSkip = !isNotebookLM && (
        mutationsOnlyRipple(mutations) || 
        typingInsideActiveElement(mutations) || 
        userIsSelecting()
      );
      
      if (shouldSkip) return;
      
      // Track whether we have dynamic content that needs special handling
      let hasDynamicContent = false;
      let targetNodes = [];
      
      // Look for dynamic content like note links opening
      for (const mutation of mutations) {
        // Check added nodes
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Store for targeted rendering
              targetNodes.push(node);
              
              // Check if this looks like dynamic content (notes, articles, etc.)
              if (node.tagName === 'DIV' || node.tagName === 'ARTICLE' || 
                  node.tagName === 'SECTION' || node.tagName === 'MAIN') {
                hasDynamicContent = true;
              }
              
              // Check if it contains math
              if (node.textContent && containsLatex(node.textContent)) {
                hasDynamicContent = true;
              }
            }
          }
        }
        
        // Also check text changes
        if (mutation.type === 'characterData') {
          const text = mutation.target.nodeValue;
          if (text && containsLatex(text)) {
            hasDynamicContent = true;
            if (mutation.target.parentNode) {
              targetNodes.push(mutation.target.parentNode);
            }
          }
        }
      }
      
      // Clear any existing timers
      Object.values(window.webTexRenderTimers).forEach(timer => clearTimeout(timer));
      
      // Handle normal and dynamic content differently
      if (hasDynamicContent) {
        // For dynamic content, use a staggered rendering approach
        // This catches content that loads progressively
        window.webTexRenderTimers.immediate = setTimeout(() => {
          // First try to render specific changed nodes
          targetNodes.forEach(node => {
            try { 
              // Only render element nodes
              if (node.nodeType === Node.ELEMENT_NODE) {
                processLatexInDOM(false, node);
                renderMathInElement(node);
              }
            } catch (e) {
              // Silently fail individual node renders
            }
          });
          
          // Then do a full render
          safeRender();
        }, 50);
        
        // Follow-up renders to catch anything that might load with a delay
        window.webTexRenderTimers.short = setTimeout(safeRender, 500);
        window.webTexRenderTimers.medium = setTimeout(safeRender, 1500);
        window.webTexRenderTimers.long = setTimeout(safeRender, 3000);
      } else {
        // For normal content changes, a single delayed render is enough
        window.webTexRenderTimers.normal = setTimeout(() => {
          safeRender();
        }, 100);
      }
    } catch (e) {
      console.error('WebTeX mutation handling error:', e);
    }
  });
  
  // Start observing the whole document with all relevant options
  try {
    enhancedObserver.observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true, 
      attributeFilter: ['style', 'hidden', 'class']
    });
  } catch (e) {
    console.error('WebTeX observer setup error:', e);
  }
  
  // Also watch for visibility changes (tab switching, etc.)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // When tab becomes visible again, do a fresh render
      try {
        // Staggered rendering to catch any new content
        setTimeout(safeRender, 100);
        setTimeout(safeRender, 1000);
      } catch (e) {
        console.error('WebTeX visibility change error:', e);
      }
    }
  });
  
  // Initial render
  safeRender();
  
  // Listen for message from popup
  browser.runtime.onMessage.addListener(msg => {
    if (msg === 'prefs-changed') {
      shouldRun().then(ok => ok && safeRender());
    }
  });
}
