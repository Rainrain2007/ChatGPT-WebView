// Declare the fallback layer before the site introduces its utility layers.
(() => {
  'use strict';
  if (window.__webShellLegacyLayerOrder !== true ||
      typeof CSS.registerProperty === 'function' ||
      document.getElementById('chatgpt-shell-layer-order')) return;
  const style = document.createElement('style');
  style.id = 'chatgpt-shell-layer-order';
  style.textContent = '@layer properties,theme,base,components,utilities;';
  const install = () => {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    parent.prepend(style);
    return true;
  };
  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document, {childList: true, subtree: true});
  }
})();
