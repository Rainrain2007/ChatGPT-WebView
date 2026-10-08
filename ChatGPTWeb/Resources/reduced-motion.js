// Reversible reduced-motion preference override.
(() => {
  'use strict';
  const host = window;
  const key = '__chatgptSidebarMotionAB';
  if (host[key] || typeof host.matchMedia !== 'function') return;

  const nativeMatchMedia = host.matchMedia;
  const priorOwnDescriptor = Object.getOwnPropertyDescriptor(host, 'matchMedia');
  const entries = new Set();
  const syntheticEvents = new WeakSet();
  let forced = host.__webShellReduceMotion === true ? true : null;

  const isReducedMotionQuery = query => {
    if (typeof query !== 'string') return false;
    const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized === '(prefers-reduced-motion)' ||
      normalized === '(prefers-reduced-motion: reduce)';
  };

  const effectiveMatches = entry => forced === null ? entry.list.matches : forced;

  const makeChangeEvent = (media, matches) => {
    let event;
    if (typeof host.MediaQueryListEvent === 'function') {
      try { event = new host.MediaQueryListEvent('change', {media, matches}); } catch (_) {}
    }
    if (!event) {
      event = new Event('change');
      Object.defineProperty(event, 'media', {configurable: true, value: media});
      Object.defineProperty(event, 'matches', {configurable: true, value: matches});
    }
    syntheticEvents.add(event);
    return event;
  };

  const invokeListener = (listener, event, thisValue) => {
    if (typeof listener === 'function') listener.call(thisValue, event);
    else if (listener && typeof listener.handleEvent === 'function') listener.handleEvent.call(listener, event);
  };

  const createFacade = (list, query) => {
    const entry = {list, query, proxy: null, listeners: []};
    const findRecord = (listener, capture) => entry.listeners.find(record =>
      record.listener === listener && record.capture === capture);
    const addChangeListener = (listener, options) => {
      if (null == listener) return;
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      if (findRecord(listener, capture)) return;
      const record = {
        listener,
        capture,
        wrapper: event => {
          // Dispatch changes only when the effective preference changes.
          if (forced !== null && !syntheticEvents.has(event)) return;
          invokeListener(listener, event, entry.proxy);
        },
      };
      entry.listeners.push(record);
      list.addEventListener('change', record.wrapper, options);
    };
    const removeChangeListener = (listener, options) => {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      const record = findRecord(listener, capture);
      if (!record) return;
      list.removeEventListener('change', record.wrapper, options);
      entry.listeners.splice(entry.listeners.indexOf(record), 1);
    };

    entry.proxy = new Proxy(list, {
      get(target, property) {
        if (property === 'matches') return effectiveMatches(entry);
        if (property === 'addEventListener') return (type, listener, options) => {
          if (type === 'change') return addChangeListener(listener, options);
          return target.addEventListener(type, listener, options);
        };
        if (property === 'removeEventListener') return (type, listener, options) => {
          if (type === 'change') return removeChangeListener(listener, options);
          return target.removeEventListener(type, listener, options);
        };
        if (property === 'addListener') return listener => addChangeListener(listener, false);
        if (property === 'removeListener') return listener => removeChangeListener(listener, false);
        if (property === 'onchange') return entry.onchange ?? null;
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, property, value) {
        if (property === 'onchange') {
          if (entry.onchange) removeChangeListener(entry.onchange, false);
          entry.onchange = value;
          if (value) addChangeListener(value, false);
          return true;
        }
        return Reflect.set(target, property, value, target);
      },
    });
    entries.add(entry);
    return entry.proxy;
  };

  const wrappedMatchMedia = function (query) {
    const list = Reflect.apply(nativeMatchMedia, host, [query]);
    return isReducedMotionQuery(query) ? createFacade(list, query) : list;
  };

  try {
    Object.defineProperty(host, 'matchMedia', {
      configurable: true,
      enumerable: priorOwnDescriptor?.enumerable ?? true,
      writable: true,
      value: wrappedMatchMedia,
    });
  } catch (_) {
    return;
  }

  const api = {
    set(value) {
      if (value !== null && typeof value !== 'boolean') {
        throw new TypeError('value must be true, false, or null');
      }
      const before = new Map();
      for (const entry of entries) before.set(entry, effectiveMatches(entry));
      forced = value;
      let changes = 0;
      for (const entry of entries) {
        const after = effectiveMatches(entry);
        if (before.get(entry) === after) continue;
        entry.list.dispatchEvent(makeChangeEvent(entry.query, after));
        changes++;
      }
      return {forced, trackedQueries: entries.size, dispatchedChanges: changes};
    },
    status() {
      return {
        forced,
        trackedQueries: entries.size,
        nativeReducedMotion: Reflect.apply(nativeMatchMedia, host, ['(prefers-reduced-motion: reduce)']).matches,
      };
    },
    restore() {
      api.set(null);
      if (priorOwnDescriptor) Object.defineProperty(host, 'matchMedia', priorOwnDescriptor);
      else delete host.matchMedia;
      delete host[key];
      return 'window.matchMedia restored; reload is required to reset page code that cached a matchMedia result.';
    },
  };
  Object.defineProperty(host, key, {configurable: true, value: api});
})();
