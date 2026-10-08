(() => {
  'use strict';
  if (window !== window.top || location.hostname !== 'chatgpt.com' || location.protocol !== 'https:' || window.__chatGPTShell) return;
  window.__chatGPTShell = true;
  const options = window.__webShellOptions || {};
  const post = (kind, extra = {}) => {
    try { window.webkit.messageHandlers.shellState.postMessage({kind, url: location.href, ...extra}); } catch (_) {}
  };
  const style = document.createElement('style');
  style.id = 'chatgpt-shell-lite';
  // Exact utility classes; no substring selectors or display/visibility changes.
  style.textContent = `
    html[data-shell-lite] .backdrop-blur, html[data-shell-lite] .backdrop-blur-sm,
    html[data-shell-lite] .backdrop-blur-md, html[data-shell-lite] .backdrop-blur-lg,
    html[data-shell-lite] .backdrop-blur-xl, html[data-shell-lite] .backdrop-blur-2xl,
    html[data-shell-lite] .backdrop-blur-3xl {backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    html[data-shell-lite] .shadow-lg, html[data-shell-lite] .shadow-xl,
    html[data-shell-lite] .shadow-2xl {box-shadow:none!important}
    html[data-shell-lite] .transition-colors, html[data-shell-lite] .transition-shadow {transition-duration:0s!important}
    html[data-shell-lite] .animate-pulse, html[data-shell-lite] .animate-bounce {animation:none!important}
  `;
  (document.head || document.documentElement).appendChild(style);
  window.__setShellLite = enabled => document.documentElement.toggleAttribute('data-shell-lite', !!enabled);
  window.__setShellLite(options.lite);

  // Touch gestures in the history list scroll; mouse dragging remains available.
  const sidebarStyle = document.createElement('style');
  sidebarStyle.id = 'chatgpt-shell-sidebar-touch';
  sidebarStyle.textContent = 'nav[role="navigation"] [role="listitem"], nav[role="navigation"] [aria-roledescription="sortable"] {touch-action:pan-y!important}';
  (document.head || document.documentElement).appendChild(sidebarStyle);
  if (typeof CSS.registerProperty !== 'function') {
    const layoutStyle = document.createElement('style');
    layoutStyle.id = 'chatgpt-shell-legacy-layout';
    layoutStyle.textContent = `
      body > .fixed.-translate-y-full {translate:var(--tw-translate-x,0) -100%!important}
      .codex-dialog.left-1\\/2.top-1\\/2.-translate-x-1\\/2.-translate-y-1\\/2 {translate:-50% -50%!important}
      nav[role="navigation"] .after\\:bg-text\\/10::after {background:currentColor!important;opacity:.1!important}
    `;
    (document.head || document.documentElement).appendChild(layoutStyle);
  }
  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !(event.target instanceof Element)) return;
    const nav = event.target.closest('nav[role="navigation"]');
    if (!nav) return;
    const row = event.target.closest('[role="listitem"], [aria-roledescription="sortable"]');
    if (!row || !nav.contains(row)) return;
    // Do not preventDefault: WebKit must retain native scrolling and tap/click.
    event.stopPropagation();
  }, true);

  const composer = element => {
    if (!(element instanceof Element)) return null;
    const editor=element.closest('#prompt-textarea, [data-composer-body] [contenteditable="true"][role="textbox"]');
    return editor && editor.closest('form, [data-composer-body]') ? editor : null;
  };
  const sendLabels=new Set(['Send','Send prompt','Send message','傳送','送出','发送','发送消息','发送提示']);
  const stopLabels=new Set(['Stop','Stop generating','Stop streaming','停止','停止生成','停止產生','停止串流']);
  const buttonKind = button => {
    const id=button.getAttribute('data-testid'), label=button.getAttribute('aria-label');
    if(id==='stop-button' || stopLabels.has(label))return 'stop';
    if(id==='send-button' || sendLabels.has(label))return 'send';
    if(button.type==='submit' && button.closest('form')?.querySelector('[data-composer-body], #prompt-textarea'))return 'send';
    return null;
  };
  const visible = element => element.getBoundingClientRect().width>0 && element.getBoundingClientRect().height>0;
  let blockedUntil=0;
  document.addEventListener('keydown',event=>{
    const editor=composer(event.target);
    if(event.key!=='Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
      event.isComposing || event.keyCode===229 || !editor)return;
    const scope=editor.closest('form') || editor.closest('[data-composer-body]');
    const buttons=[...scope.querySelectorAll('button')].filter(visible);
    const stop=buttons.find(button=>buttonKind(button)==='stop');
    const send=buttons.find(button=>buttonKind(button)==='send' && !button.disabled && button.getAttribute('aria-disabled')!=='true');
    if(!stop && !send)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(stop || event.repeat || Date.now()<blockedUntil || !(editor.value || editor.textContent || '').trim())return;
    blockedUntil=Date.now()+1000;send.click();
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');if(!button || !visible(button))return;
    const kind=buttonKind(button);
    if((kind==='send' || kind==='stop') && event.isTrusted && Date.now()<blockedUntil) {
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    if(kind==='send' && event.isTrusted)blockedUntil=Date.now()+1000;
  },true);
  document.addEventListener('focusin', event => {
    const prompt = composer(event.target);
    if (prompt) prompt.setAttribute('enterkeyhint', 'send');
  }, true);

  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function(...args) {
      const before = location.href;
      const result = Reflect.apply(original, this, args);
      if (location.href !== before) post('route');
      return result;
    };
  }
  window.addEventListener('popstate', () => post('route'));
  let timer, scroller = document.scrollingElement;
  const saveScroll = () => {
    if (!scroller || !scroller.isConnected) scroller = document.scrollingElement;
    if (!scroller) return;
    post('scroll', {x: scroller.scrollLeft, y: scroller.scrollTop,
      element: scroller.id || scroller.getAttribute('data-testid') || scroller.tagName});
  };
  document.addEventListener('scroll', event => {
    const target = event.target instanceof Element ? event.target : document.scrollingElement;
    const main = document.querySelector('main');
    if (target !== document.scrollingElement && (!main || (!main.contains(target) && !target.contains(main)))) return;
    if (target && target.closest && target.closest('[role="dialog"], #prompt-textarea')) return;
    scroller = target;
    clearTimeout(timer); timer = setTimeout(saveScroll, 350);
  }, {capture:true, passive:true});
  window.addEventListener('pagehide', saveScroll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveScroll(); });
  post('ready');
})();
