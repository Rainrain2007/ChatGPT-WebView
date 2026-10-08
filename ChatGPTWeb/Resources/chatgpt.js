(() => {
  'use strict';
  if (window !== window.top || location.hostname !== 'chatgpt.com' || location.protocol !== 'https:' || window.__chatGPTShell) return;
  window.__chatGPTShell = true;
  const options = window.__webShellOptions || {};
  // Lock the document scale. Image viewers may still transform their own media.
  const lockViewport = () => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    const content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    if (meta.content !== content) meta.content = content;
    return meta;
  };
  const viewport = lockViewport();
  new MutationObserver(lockViewport).observe(viewport, {attributes: true, attributeFilter: ['content']});

  // Keyboard focus follows an explicit editor press or Tab. Route changes and
  // opening a dialog must not summon the keyboard on their own.
  if (!window.__shellFocusControl) {
    const nativeFocus = HTMLElement.prototype.focus;
    const control = window.__shellFocusControl = {enabled: options.autoFocus === true, target: null, at: 0};
    const editable = element => element?.closest?.('input, textarea, [contenteditable="true"]');
    document.addEventListener('pointerdown', event => {
      control.tab = false;
      control.target = editable(event.target);
      control.at = performance.now();
    }, {capture: true, passive: true});
    document.addEventListener('keydown', event => {
      if (event.key === 'Tab' || editable(event.target)) {
        control.target = event.key === 'Tab' ? null : editable(event.target);
        control.at = performance.now();
        control.tab = event.key === 'Tab';
      }
    }, {capture: true, passive: true});
    HTMLElement.prototype.focus = function (...args) {
      const field = editable(this);
      const manual = performance.now() - control.at < 1500 && (control.tab || control.target === field);
      if (field && !control.enabled && !manual) return;
      return Reflect.apply(nativeFocus, this, args);
    };
    window.__setShellAutoFocus = enabled => { control.enabled = !!enabled; };
  }
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
  let styleDefaultsTimer = 0;
  const scheduleStyleDefaults = enabled => {
    clearTimeout(styleDefaultsTimer);
    if (!enabled) { window.__shellStyleDefaults?.set(false); return; }
    // Let initial stylesheet loading settle before the version-gated change.
    styleDefaultsTimer = setTimeout(() => window.__shellStyleDefaults?.set(true), 2500);
  };
  window.__setShellLite = enabled => {
    document.documentElement.toggleAttribute('data-shell-lite', !!enabled);
    window.__chatgptSidebarMotionAB?.set(enabled ? true : null);
    scheduleStyleDefaults(!!enabled);
  };
  window.__setShellLite(options.lite);
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => scheduleStyleDefaults(document.documentElement.hasAttribute('data-shell-lite')), {once: true});
  }

  // Keep native touch/trackpad scrolling and defer sortable row presses until
  // a stationary hold is confirmed by a real pointer move.
  const sidebarStyle = document.createElement('style');
  sidebarStyle.id = 'chatgpt-shell-sidebar-touch';
  sidebarStyle.textContent = `
    nav[role="navigation"] [role="listitem"],
    nav[role="navigation"] [aria-roledescription="sortable"],
    nav[role="navigation"] .sidebar-item,
    nav[role="navigation"] a[href^="/c/"],
    nav[role="navigation"] a[href^="/g/"] {touch-action:manipulation!important}
    nav[role="navigation"] [role="listitem"] a[href],
    nav[role="navigation"] [aria-roledescription="sortable"] a[href],
    nav[role="navigation"] .sidebar-item a[href],
    nav[role="navigation"] a[href^="/c/"],
    nav[role="navigation"] a[href^="/g/"] {-webkit-user-drag:none!important}
    :where(nav[role="navigation"] [role="listitem"],
      nav[role="navigation"] [role="listitem"] *,
      nav[role="navigation"] [aria-roledescription="sortable"],
      nav[role="navigation"] [aria-roledescription="sortable"] *,
      nav[role="navigation"] .sidebar-item,
      nav[role="navigation"] .sidebar-item *,
      nav[role="navigation"] a[href^="/c/"],
      nav[role="navigation"] a[href^="/c/"] *,
      nav[role="navigation"] a[href^="/g/"],
      nav[role="navigation"] a[href^="/g/"] *) {
      -webkit-user-select:none!important;user-select:none!important;-webkit-user-drag:none!important
    }
    nav[role="navigation"] input,
    nav[role="navigation"] textarea,
    nav[role="navigation"] [contenteditable="true"],
    nav[role="navigation"] [contenteditable="true"] *,
    nav[role="navigation"] [role="textbox"],
    nav[role="navigation"] [role="textbox"] * {
      -webkit-user-select:text!important;user-select:text!important
    }
  `;
  (document.head || document.documentElement).appendChild(sidebarStyle);
  if (!CSS.supports('color', 'color-mix(in srgb, red 5%, transparent)')) {
    const searchTabStyle = document.createElement('style');
    searchTabStyle.id = 'chatgpt-search-tab-legacy';
    searchTabStyle.textContent = `
      [role="dialog"] [role="tablist"] [role="tab"][aria-selected="true"].bg-text\\/5,
      button.bg-text\\/5 {background-color:rgba(127,127,127,.16)!important}
      button.bg-text\\/5:hover {background-color:rgba(127,127,127,.24)!important}
    `;
    (document.head || document.documentElement).appendChild(searchTabStyle);
  }
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
  const sidebarRow = '[role="listitem"], [aria-roledescription="sortable"], .sidebar-item, nav[role="navigation"] a[href^="/c/"], nav[role="navigation"] a[href^="/g/"]';
  const sidebarControl = 'button, input, textarea, select, summary, [role="button"], [contenteditable="true"]';
  const nestedSidebarControl = (target, row) => {
    const control = target?.closest(sidebarControl);
    return control && control !== row && row.contains(control) ? control : null;
  };
  const scrollableSidebarAncestor = (row, nav) => {
    for (let node = row.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      if (!nav.contains(node) && node.clientWidth > nav.clientWidth * 1.5) break;
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
          node.clientHeight > 0 && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
  };
  let sidebarGesture = null;
  const replayedSidebarPointerDowns = new WeakSet();
  let suppressedSidebarClick = null;
  const clearSidebarGesture = () => { sidebarGesture = null; };
  document.addEventListener('pointerdown', event => {
    if (replayedSidebarPointerDowns.has(event)) return;
    // The browser emits the drag's click directly after pointerup. Any later
    // pointerdown starts a new user action and must not inherit that guard.
    suppressedSidebarClick = null;
    if (sidebarGesture && sidebarGesture.pointerId !== event.pointerId) clearSidebarGesture();
    if (!(event.target instanceof Element)) return;
    const nav = event.target.closest('nav[role="navigation"]');
    const row = event.target.closest(sidebarRow);
    if (!nav || !row || !nav.contains(row)) return;
    if (nestedSidebarControl(event.target, row)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // Hold the original down event from the site's sortable handlers without
    // canceling browser defaults such as touch panning.
    event.stopPropagation();
    if (!event.isPrimary) {
      clearSidebarGesture();
      return;
    }
    const gesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      target: event.target,
      row,
      nav,
      scroller: null,
      holdEligible: true,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      button: event.button,
      buttons: event.buttons,
      pressure: event.pressure,
      width: event.width,
      height: event.height,
      tangentialPressure: event.tangentialPressure,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      twist: event.twist,
      screenX: event.screenX,
      screenY: event.screenY,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      downTime: event.timeStamp,
      mode: 'pending',
    };
    sidebarGesture = gesture;
  }, true);
  document.addEventListener('dragstart', event => {
    if (!(event.target instanceof Element)) return;
    const nav = event.target.closest('nav[role="navigation"]');
    const row = event.target.closest(sidebarRow);
    if (nav && row && nav.contains(row)) event.preventDefault();
  }, true);
  document.addEventListener('pointermove', event => {
    const gesture = sidebarGesture;
    if (!gesture || event.pointerId !== gesture.pointerId ||
        gesture.mode === 'heldLong' || gesture.mode === 'nativePan') return;
    const deltaFromStartY = event.clientY - gesture.startY;
    const deltaFromStartX = event.clientX - gesture.startX;
    const distance = Math.hypot(deltaFromStartX, deltaFromStartY);
    const elapsed = event.timeStamp - gesture.downTime;
    if (gesture.mode === 'pending' && elapsed < 1800 && distance > 3) gesture.holdEligible = false;
    if (gesture.mode === 'pending' && distance > 8) {
      if (gesture.holdEligible && elapsed >= 1800 && gesture.target.isConnected && typeof PointerEvent === 'function') {
        gesture.mode = 'heldLong';
        const replayed = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          pointerId: gesture.pointerId,
          pointerType: gesture.pointerType,
          isPrimary: gesture.isPrimary,
          clientX: gesture.startX,
          clientY: gesture.startY,
          screenX: gesture.screenX,
          screenY: gesture.screenY,
          button: gesture.button,
          buttons: gesture.buttons,
          pressure: gesture.pressure,
          width: gesture.width,
          height: gesture.height,
          tangentialPressure: gesture.tangentialPressure,
          tiltX: gesture.tiltX,
          tiltY: gesture.tiltY,
          twist: gesture.twist,
          altKey: gesture.altKey,
          ctrlKey: gesture.ctrlKey,
          metaKey: gesture.metaKey,
          shiftKey: gesture.shiftKey
        });
        replayedSidebarPointerDowns.add(replayed);
        gesture.target.dispatchEvent(replayed);
        return;
      }
      gesture.mode = gesture.pointerType === 'mouse' ? 'moved' : 'nativePan';
      if (gesture.mode === 'moved') gesture.scroller = scrollableSidebarAncestor(gesture.row, gesture.nav);
    }
    if (gesture.mode === 'nativePan') return;
    if (gesture.mode === 'moved' && gesture.scroller && Math.abs(deltaFromStartY) > 8 &&
        Math.abs(deltaFromStartY) >= Math.abs(deltaFromStartX)) gesture.mode = 'scrolling';
    if (gesture.mode !== 'scrolling') return;
    event.preventDefault();
    event.stopPropagation();
    gesture.scroller.scrollTop += gesture.lastY - event.clientY;
    gesture.lastY = event.clientY;
  }, {capture: true, passive: false});
  document.addEventListener('pointerup', event => {
    const gesture = sidebarGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.mode === 'scrolling' || gesture.mode === 'heldLong' ||
        (gesture.mode === 'pending' && event.timeStamp - gesture.downTime >= 1800)) {
      suppressedSidebarClick = {row: gesture.row, pointerId: gesture.pointerId, expiresAt: performance.now() + 350};
    }
    clearSidebarGesture();
  }, true);
  document.addEventListener('pointercancel', event => {
    if (sidebarGesture && event.pointerId === sidebarGesture.pointerId) clearSidebarGesture();
  }, true);
  window.addEventListener('blur', clearSidebarGesture);
  document.addEventListener('contextmenu', event => {
    if (!(event.target instanceof Element)) return;
    const gesture = sidebarGesture;
    if (gesture?.pointerType === 'touch' && gesture.mode === 'pending' &&
        gesture.row.contains(event.target)) event.preventDefault();
  }, true);
  document.addEventListener('click', event => {
    const pending = suppressedSidebarClick;
    if (!pending) return;
    if (performance.now() > pending.expiresAt) {
      suppressedSidebarClick = null;
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest(sidebarRow);
    if (row !== pending.row) return;
    // A menu/control click after the drag must still be delivered.
    if (nestedSidebarControl(target, row) || event.detail === 0) {
      suppressedSidebarClick = null;
      return;
    }
    if (typeof event.pointerId === 'number' && event.pointerId !== pending.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    suppressedSidebarClick = null;
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
  const visible = element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  let blockedUntil=0;
  document.addEventListener('keydown',event=>{
    const editor=composer(event.target);
    if(event.key!=='Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
      event.isComposing || event.keyCode===229 || !editor)return;
    const scope=editor.closest('form') || editor.closest('[data-composer-body]');
    const buttons=[...scope.querySelectorAll('button')].filter(button => buttonKind(button) && visible(button));
    const stop=buttons.find(button=>buttonKind(button)==='stop');
    const send=buttons.find(button=>buttonKind(button)==='send' && !button.disabled && button.getAttribute('aria-disabled')!=='true');
    if(!stop && !send)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(stop || event.repeat || Date.now()<blockedUntil || !(editor.value || editor.textContent || '').trim())return;
    blockedUntil=Date.now()+1000;send.click();
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');if(!button)return;
    const kind=buttonKind(button);
    if(!kind || !visible(button))return;
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
    if (target !== document.scrollingElement &&
        (!target || (!target.closest?.('main') && !target.querySelector?.('main')))) return;
    if (target && target.closest && target.closest('[role="dialog"], #prompt-textarea')) return;
    scroller = target;
    clearTimeout(timer); timer = setTimeout(saveScroll, 350);
  }, {capture:true, passive:true});
  window.addEventListener('pagehide', saveScroll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveScroll(); });
  post('ready');
})();
