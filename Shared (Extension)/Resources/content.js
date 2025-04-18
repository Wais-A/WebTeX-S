/* WebTeX — single‑toggle version (2025‑04) */

(() => {
  console.log('[WebTeX] injected on', location.hostname);

  const storage = browser.storage?.local ?? { get:async()=>({}), set:async()=>{} };

  /* run‑or‑skip decision */
  async function shouldRun () {
    const { globalEnabled = true } = await storage.get('globalEnabled');
    if (!globalEnabled) { console.log('[WebTeX] disabled'); return false; }

    if (document.querySelector('script[src*="katex"],script[src*="mathjax"]')) {
      console.log('[WebTeX] native renderer detected – skip');
      return false;
    }
    return true;
  }

  /* helpers ------------------------------------------------------ */
  const DELIMS = [
    {left:'$$',  right:'$$',  display:true},
    {left:'\\[', right:'\\]', display:true},
    {left:'$',   right:'$',   display:false},
    {left:'\\(', right:'\\)', display:false}
  ];
  function decodeEntitiesWalk (n) {
    if (n.nodeType === 3) n.data = n.data
      .replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
    else if (n.nodeType === 1 &&
             !['SCRIPT','STYLE','PRE','CODE','NOSCRIPT','TEXTAREA'].includes(n.nodeName))
      n.childNodes.forEach(decodeEntitiesWalk);
  }
  function renderAll (root = document.body) {
    decodeEntitiesWalk(root);
    renderMathInElement(root, {
      delimiters: DELIMS,
      ignoredTags:['script','style','textarea','pre','code','noscript'],
      throwOnError:false, strict:'ignore'
    });
  }

  /* main ---------------------------------------------------------- */
  (async function init () {
    if (!(await shouldRun())) return;

    (document.readyState === 'loading')
      ? window.addEventListener('DOMContentLoaded', () => renderAll())
      : renderAll();

    const mo = new MutationObserver(() => {
      clearTimeout(mo.t); mo.t = setTimeout(renderAll, 200);
    });
    mo.observe(document, { subtree:true, childList:true, characterData:true });

    /* react to toggle flips */
    browser.runtime.onMessage.addListener(msg => {
      if (msg === 'prefs‑changed') shouldRun().then(ok => ok && renderAll());
    });
  })();
})();
