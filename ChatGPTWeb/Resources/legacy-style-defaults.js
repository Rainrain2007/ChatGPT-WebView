(() => {
  'use strict';

  const NAME = '__shellStyleDefaults';
  const MAIN_CSS = 'https://chatgpt.com/cdn/assets/886701.edb92b3055.css';
  const EXPECTED_SHEET_HASH = '2d1cde80';
  const EXPECTED_RESET_HASH = 'b0358584';
  const GLOBAL_SELECTORS = ['*', '::before', '::after', '::backdrop'];
  const VAR_RE = /var\(\s*(--[\w-]+)/g;

  let enabled = false;
  let active = false;
  let lastError = null;
  let state = {};
  let internalMutation = 0;
  let observer = null;
  let phaseMs = {};
  let ruleTextCache = new WeakMap();
  let targetSheet = null;
  let record = null;
  let apiInstalled = false;
  let linkLoadHandler = null;
  const savedDescriptors = [];
  const trackedRules = new WeakSet();
  const trackedStyles = new WeakSet();
  const generatedRules = new Set();
  const styleProxyCache = new WeakMap();
  const monitoredSheets = new WeakSet();
  const rulePrototypes = new Set();

  function now() {
    try { return window.performance.now(); }
    catch (_) { return Date.now(); }
  }

  function timed(name, action) {
    const start = now();
    try { return action(); }
    finally { phaseMs[name] = Math.max(0, now() - start); }
  }

  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function declarations(style) {
    const out = [];
    for (let i = 0; i < style.length; i++) {
      const property = style.item(i);
      out.push({property, value: style.getPropertyValue(property), priority: style.getPropertyPriority(property)});
    }
    return out;
  }

  function splitSelectors(text) {
    const out = [];
    let start = 0, parens = 0, brackets = 0, quote = '', escaped = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '(') parens++;
      else if (c === ')') parens--;
      else if (c === '[') brackets++;
      else if (c === ']') brackets--;
      else if (c === ',' && !parens && !brackets) { out.push(text.slice(start, i).trim()); start = i + 1; }
    }
    out.push(text.slice(start).trim());
    return out.filter(Boolean);
  }

  function variablesIn(text) {
    const out = new Set();
    VAR_RE.lastIndex = 0;
    let match;
    while ((match = VAR_RE.exec(text))) out.add(match[1]);
    return out;
  }

  function walkRules(list, callback) {
    for (const rule of [...list]) {
      if (rule.style) callback(rule);
      if (rule.cssRules) walkRules(rule.cssRules, callback);
      if (rule.styleSheet?.cssRules) walkRules(rule.styleSheet.cssRules, callback);
    }
  }

  function ruleText(rule) {
    if (ruleTextCache.has(rule)) return ruleTextCache.get(rule);
    const text = String(rule.cssText || '');
    ruleTextCache.set(rule, text);
    return text;
  }

  function layerName(rule) {
    const match = ruleText(rule).match(/^\s*@layer\s+([\w.-]+)\s*\{/);
    return match && match[1];
  }

  function findMainSheet() {
    const matches = [...document.styleSheets].filter(sheet => {
      const owner = sheet.ownerNode;
      return owner && owner.tagName === 'LINK' && new URL(owner.href, location.href).href === MAIN_CSS;
    });
    if (matches.length !== 1) throw new Error('Expected exactly one main stylesheet link');
    return matches[0];
  }

  function gatherStyleSheets() {
    const sheets = [...document.styleSheets];
    try {
      for (const sheet of document.adoptedStyleSheets || []) if (!sheets.includes(sheet)) sheets.push(sheet);
    } catch (_) { throw new Error('Cannot inspect document adoptedStyleSheets'); }
    for (const element of document.querySelectorAll('*')) {
      if (!element.shadowRoot) continue;
      throw new Error('Open shadow roots prevent complete custom-property consumer analysis');
    }
    for (const sheet of sheets) {
      try { void sheet.cssRules.length; }
      catch (_) { throw new Error('A document stylesheet has unreadable CSSOM rules'); }
    }
    return sheets;
  }

  function assertGate(sheet, sheets) {
    if (!window.CSS || typeof window.CSS.registerProperty === 'function') {
      throw new Error('Native CSS.registerProperty is available');
    }
    if (fnv1a([...sheet.cssRules].map(ruleText).join('\n')) !== EXPECTED_SHEET_HASH) {
      throw new Error('Main stylesheet fingerprint differs');
    }
    const topLayers = [...sheet.cssRules].map(layerName).filter(Boolean);
    if (topLayers.slice(0, 3).join(',') !== 'properties,theme,base') {
      throw new Error('Main stylesheet layer order differs');
    }
    const all = [];
    walkRules(sheet.cssRules, rule => all.push(rule));
    const expectedSelectors = [...GLOBAL_SELECTORS].sort().join('\n');
    const candidates = all.filter(rule => {
      if (typeof rule.selectorText !== 'string' || !rule.style) return false;
      if (splitSelectors(rule.selectorText).sort().join('\n') !== expectedSelectors) return false;
      const items = declarations(rule.style);
      const twItems = items.filter(item => item.property.startsWith('--tw-'));
      return items.length === 100 && twItems.length === 94 &&
        twItems.every(item => item.priority === '') && fnv1a(ruleText(rule)) === EXPECTED_RESET_HASH;
    });
    if (candidates.length !== 1) throw new Error('Expected exactly one verified 94-variable reset rule');
    const reset = candidates[0];
    const decls = declarations(reset.style);
    const tw = decls.filter(item => item.property.startsWith('--tw-'));

    let cursor = reset.parentRule;
    let propertiesLayer = null;
    let supportsFound = false;
    while (cursor) {
      const name = layerName(cursor);
      if (name === 'properties') propertiesLayer = cursor;
      if (/^@supports\b/i.test(ruleText(cursor))) supportsFound = true;
      cursor = cursor.parentRule;
    }
    if (!propertiesLayer || !supportsFound) throw new Error('Reset is not inside expected supports/properties layers');
    const layerNames = [];
    const scannedSheets = new Set();
    let anonymousLayerBeforeProperties = false;
    function gatherLayerNames(list) {
      for (const rule of [...list]) {
        const text = ruleText(rule).trim();
        if (/^@import\b/i.test(text) && /\blayer(?:\s*\(|\s+[-\w])/i.test(text)) {
          throw new Error('Layered @import order is not covered by the layer gate');
        }
        if (/^@layer\s*\{/i.test(text) && !layerNames.includes('properties')) anonymousLayerBeforeProperties = true;
        const declaration = text.match(/^@layer\s+([^;{]+)\s*(?:;|\{)/);
        if (declaration) {
          for (const path of declaration[1].split(',').map(value => value.trim())) {
            const root = path.split('.')[0];
            if (root && !layerNames.includes(root)) layerNames.push(root);
          }
        }
        if (rule.cssRules) gatherLayerNames(rule.cssRules);
        if (rule.styleSheet && !scannedSheets.has(rule.styleSheet)) {
          scannedSheets.add(rule.styleSheet);
          gatherLayerNames(rule.styleSheet.cssRules);
        }
      }
    }
    for (const current of sheets) {
      if (scannedSheets.has(current)) continue;
      scannedSheets.add(current);
      gatherLayerNames(current.cssRules);
    }
    const propertiesIndex = layerNames.indexOf('properties');
    if (propertiesIndex < 0) throw new Error('properties cascade layer is missing');
    if (anonymousLayerBeforeProperties) throw new Error('An earlier anonymous cascade layer makes fallback order ambiguous');
    const mustRemainGlobal = new Set();
    const mustRemainGlobalReasons = new Map();
    const preserveInLayer = (items, layer) => {
      for (const item of items) {
        mustRemainGlobal.add(item.property);
        let reasons = mustRemainGlobalReasons.get(item.property);
        if (!reasons) mustRemainGlobalReasons.set(item.property, reasons = new Set());
        reasons.add(layer);
      }
    };
    for (const current of sheets) {
      walkRules(current.cssRules, rule => {
        const twAssignments = declarations(rule.style).filter(item => item.property.startsWith('--tw-'));
        if (!twAssignments.length) return;
        for (let parent = rule.parentRule; parent; parent = parent.parentRule) {
          if (parent === propertiesLayer && rule !== reset) throw new Error('properties layer contains another --tw-* assignment');
          const name = layerName(parent);
          if (name) {
            const root = name.split('.')[0];
            const index = layerNames.indexOf(root);
            if (index < 0 || index < propertiesIndex) preserveInLayer(twAssignments, index < 0 ? `unknown:${root}` : root);
            break;
          }
          if (/^@layer\b/i.test(ruleText(parent).trim())) {
            preserveInLayer(twAssignments, 'unparsed-layer');
            break;
          }
        }
      });
    }
    return {reset, propertiesLayer, decls, tw, mustRemainGlobal, mustRemainGlobalReasons, layerNames, propertiesIndex};
  }

  function decodeIdent(value) {
    return value.replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[\t\n\f\r ])?/g, (_m, h) => {
      const point = parseInt(h, 16);
      return String.fromCodePoint(!point || point > 0x10ffff ? 0xfffd : point);
    })
      .replace(/\\([^\n\r\f])/g, '$1');
  }

  function escapeIdent(value) {
    if (CSS.escape) return CSS.escape(value);
    let result = '';
    for (let i = 0; i < value.length; i++) {
      const code = value.codePointAt(i);
      const char = String.fromCodePoint(code);
      if (code > 0xffff) i++;
      if (code === 0) result += '\\fffd ';
      else if ((code >= 1 && code <= 31) || code === 127 || (i === 0 && code >= 48 && code <= 57) ||
               (i === 1 && code >= 48 && code <= 57 && value[0] === '-')) result += `\\${code.toString(16)} `;
      else if (i === 0 && char === '-' && value.length === 1) result += '\\-';
      else if (code >= 128 || char === '-' || char === '_' || /[a-zA-Z0-9]/.test(char)) result += char;
      else result += `\\${char}`;
    }
    return result;
  }

  function finalCompound(selector) {
    let boundary = -1, parens = 0, brackets = 0, quote = '', escaped = false;
    for (let i = 0; i < selector.length; i++) {
      const c = selector[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '(') parens++;
      else if (c === ')') parens--;
      else if (c === '[') brackets++;
      else if (c === ']') brackets--;
      else if (!parens && !brackets && (c === '>' || c === '+' || c === '~' || /\s/.test(c))) boundary = i;
    }
    return selector.slice(boundary + 1).trim();
  }

  function topLevelTokens(text, token) {
    const out = [];
    let parens = 0, brackets = 0, quote = '', escaped = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (token === 'attribute' && c === '[' && !parens && !brackets) {
        let close = i + 1, q = '', esc = false;
        for (; close < text.length; close++) {
          const ch = text[close];
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (q) { if (ch === q) q = ''; continue; }
          if (ch === '"' || ch === "'") { q = ch; continue; }
          if (ch === ']') break;
        }
        if (close < text.length) {
          const body = text.slice(i + 1, close).trim();
          const attr = body.match(/^((?:\\.|[-_a-zA-Z0-9])+)(?=\s|[~|^$*]?=|$)/);
          if (attr && !/[~|^$*]?=/.test(body)) out.push(`[${attr[1]}]`);
          i = close;
        }
        continue;
      }
      if (c === '(') { parens++; continue; }
      if (c === ')') { parens--; continue; }
      if (c === '[') { brackets++; continue; }
      if (c === ']') { brackets--; continue; }
      if (parens || brackets) continue;
      if (token === 'class' && c === '.') {
        let end = i + 1;
        while (end < text.length) {
          if (text[end] === '\\') {
            end++;
            if (end < text.length && /[0-9a-fA-F]/.test(text[end])) {
              let digits = 0;
              while (end < text.length && digits < 6 && /[0-9a-fA-F]/.test(text[end])) { end++; digits++; }
              if (end < text.length && /[\t\n\f\r ]/.test(text[end])) end++;
            } else if (end < text.length) end++;
            continue;
          }
          if (/[.#:[\]\s>+~]/.test(text[end])) break;
          end++;
        }
        if (end > i + 1) out.push(`.${escapeIdent(decodeIdent(text.slice(i + 1, end)))}`);
        i = end - 1;
      }
    }
    return out;
  }

  function subjectSelectors(compound, depth = 0) {
    if (depth > 10) throw new Error('Selector nesting limit');
    const classes = topLevelTokens(compound, 'class');
    if (classes.length) return [classes[0]];
    if (hasTopLevelRoot(compound)) return [':root'];
    const attrs = topLevelTokens(compound, 'attribute');
    if (attrs.length) return [attrs[0]];
    const tag = compound.trimStart().match(/^([a-zA-Z][\w-]*)(?=$|[.#:[\s])/);
    if (tag) return [tag[1]];

    let parens = 0, brackets = 0, quote = '', escaped = false;
    for (let i = 0; i < compound.length; i++) {
      const c = compound[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '[') { brackets++; continue; }
      if (c === ']') { brackets--; continue; }
      if (c === '(') { parens++; continue; }
      if (c === ')') { parens--; continue; }
      if (parens || brackets || c !== ':') continue;
      const match = compound.slice(i).match(/^:(is|where)\(/i);
      if (!match) continue;
      const open = i + match[0].length - 1;
      let level = 1, q = '', esc = false, j = open + 1;
      for (; j < compound.length && level; j++) {
        const ch = compound[j];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (q) { if (ch === q) q = ''; continue; }
        if (ch === '"' || ch === "'") { q = ch; continue; }
        if (ch === '(') level++;
        else if (ch === ')') level--;
      }
      if (level) throw new Error('Unclosed functional selector');
      const branches = splitSelectors(compound.slice(open + 1, j - 1));
      const union = [];
      for (const branch of branches) union.push(...subjectSelectors(finalCompound(branch), depth + 1));
      if (union.length === branches.length && union.length) return [...new Set(union)];
      i = j - 1;
    }
    throw new Error('No safe terminal class/tag/attribute/root selector');
  }

  function hasTopLevelRoot(text) {
    let parens = 0, brackets = 0, quote = '', escaped = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '[') { brackets++; continue; }
      if (c === ']') { brackets--; continue; }
      if (brackets) continue;
      if (c === '(') { parens++; continue; }
      if (c === ')') { parens--; continue; }
      if (!parens && text.startsWith(':root', i) && !/[\w-]/.test(text[i + 5] || '')) return true;
    }
    return false;
  }

  function selectorsFor(selectorText) {
    const out = new Set();
    for (const selector of splitSelectors(selectorText)) {
      const compound = finalCompound(selector);
      for (const required of subjectSelectors(compound)) out.add(required);
      const pseudo = compound.match(/(::before|::after|::backdrop)\s*$/);
      if (pseudo) for (const required of subjectSelectors(compound.slice(0, pseudo.index))) out.add(required + pseudo[1]);
    }
    return [...out];
  }

  function calculateScopes(sheets, reset, twDeclarations, mustRemainGlobal = new Set()) {
    const rules = [];
    for (const sheet of sheets) walkRules(sheet.cssRules, rule => rules.push(rule));
    const twNames = new Set(twDeclarations.map(item => item.property));
    const definitions = new Map();
    for (const rule of rules) {
      if (rule === reset || generatedRules.has(rule)) continue;
      for (const item of declarations(rule.style)) {
        if (!item.property.startsWith('--')) continue;
        let refs = definitions.get(item.property);
        if (!refs) definitions.set(item.property, refs = new Set());
        for (const ref of variablesIn(item.value)) refs.add(ref);
      }
    }
    const depends = (name, visiting = new Set()) => {
      if (twNames.has(name)) return new Set([name]);
      if (visiting.has(name)) return new Set();
      visiting.add(name);
      const out = new Set();
      for (const ref of definitions.get(name) || []) for (const x of depends(ref, visiting)) out.add(x);
      visiting.delete(name);
      return out;
    };
    const scopes = new Map([...twNames].map(name => [name, new Set()]));
    const global = new Set([...mustRemainGlobal].filter(name => twNames.has(name)));
    for (const rule of rules) {
      if (rule === reset || generatedRules.has(rule)) continue;
      const deps = new Set();
      for (const item of declarations(rule.style)) for (const ref of variablesIn(item.value)) for (const x of depends(ref)) deps.add(x);
      if (!deps.size) continue;
      let candidates;
      try { candidates = selectorsFor(rule.selectorText || ''); }
      catch (_) { candidates = null; }
      if (!candidates?.length) { for (const name of deps) global.add(name); continue; }
      for (const name of deps) for (const selector of candidates) scopes.get(name).add(selector);
    }
    for (const element of document.querySelectorAll('[style]')) {
      for (const item of declarations(element.style)) {
        for (const ref of variablesIn(item.value)) for (const name of depends(ref)) global.add(name);
      }
    }
    for (const name of twNames) if (!scopes.get(name).size) global.add(name);
    return {scopes, global, twNames};
  }

  function addTrackedRule(rule) {
    trackedRules.add(rule);
    if (rule && Object.getPrototypeOf(rule)) rulePrototypes.add(Object.getPrototypeOf(rule));
    if (rule.style) trackedStyles.add(rule.style);
  }

  function trackSheet(sheet, seen = new Set()) {
    if (!sheet || seen.has(sheet)) return;
    seen.add(sheet);
    monitoredSheets.add(sheet);
    const trackList = list => {
      for (const rule of [...list]) {
        if (rule.style) addTrackedRule(rule);
        if (rule.cssRules) trackList(rule.cssRules);
        if (rule.styleSheet) trackSheet(rule.styleSheet, seen);
      }
    };
    trackList(sheet.cssRules);
  }

  function callNativeBeforeMutation() {
    if (internalMutation || !active) return;
    rollback('Observed CSSOM mutation');
  }

  function patchMethod(proto, key, isTarget = null) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor || typeof descriptor.value !== 'function') throw new Error(`Cannot guard ${key}`);
    const original = descriptor.value;
    const wrapped = function(...args) {
      const affected = isTarget ? isTarget(this) :
        (monitoredSheets.has(this) || monitoredSheets.has(this?.parentStyleSheet) || (record && this === record.parent));
      const callArgs = args.slice();
      if (affected && active && !internalMutation && this?.cssRules && ['deleteRule', 'insertRule', 'addRule', 'removeRule'].includes(key)) {
        const rules = [...this.cssRules];
        const indexArg = key === 'addRule' ? 2 : (key === 'removeRule' ? 0 : (key === 'deleteRule' ? 0 : 1));
        const index = Number.isInteger(Number(callArgs[indexArg])) ? Number(callArgs[indexArg]) : 0;
        if (key === 'deleteRule' || key === 'removeRule') {
          const selected = rules[index];
          const selectedGenerated = generatedRules.has(selected);
          callNativeBeforeMutation();
          if (selectedGenerated) return undefined;
          if (!selected) return Reflect.apply(original, this, callArgs);
          const restoredIndex = [...this.cssRules].indexOf(selected);
          if (restoredIndex < 0) return undefined;
          callArgs[indexArg] = restoredIndex;
        } else {
          if (index < 0 || index > rules.length) {
            callNativeBeforeMutation();
            return Reflect.apply(original, this, callArgs);
          }
          const restoredIndex = rules.slice(0, Math.max(0, index)).filter(rule => !generatedRules.has(rule)).length;
          callNativeBeforeMutation();
          callArgs[indexArg] = restoredIndex;
        }
      } else if (affected) {
        callNativeBeforeMutation();
      }
      return Reflect.apply(original, this, callArgs);
    };
    Object.defineProperty(proto, key, {...descriptor, value: wrapped});
    savedDescriptors.push({proto, key, descriptor, wrapped});
  }

  function patchSetter(proto, key, isTarget) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor?.set || !descriptor.configurable) throw new Error(`Cannot guard ${key}`);
    const original = descriptor.set;
    const wrapped = function(value) {
      if (isTarget(this)) callNativeBeforeMutation();
      return Reflect.apply(original, this, [value]);
    };
    Object.defineProperty(proto, key, {...descriptor, set: wrapped});
    savedDescriptors.push({proto, key, descriptor, wrapped});
  }

  function patchStyleGetter(proto) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'style');
    if (!descriptor?.get || !descriptor.configurable) throw new Error('Cannot guard CSSStyleRule.style');
    const originalGet = descriptor.get;
    const wrappedGet = function() {
      const style = Reflect.apply(originalGet, this, []);
      if (!trackedRules.has(this)) return style;
      trackedStyles.add(style);
      let proxy = styleProxyCache.get(style);
      if (!proxy) {
        proxy = new Proxy(style, {
          set(target, property, value) {
            callNativeBeforeMutation();
            return Reflect.set(target, property, value, target);
          },
          deleteProperty(target, property) {
            callNativeBeforeMutation();
            return Reflect.deleteProperty(target, property);
          },
          defineProperty(target, property, descriptor) {
            callNativeBeforeMutation();
            return Reflect.defineProperty(target, property, descriptor);
          },
          get(target, property) {
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        styleProxyCache.set(style, proxy);
      }
      return proxy;
    };
    Object.defineProperty(proto, 'style', {...descriptor, get: wrappedGet});
    savedDescriptors.push({proto, key: 'style', descriptor, wrapped: wrappedGet, getter: true});
  }

  function installGuards() {
    if (apiInstalled) return;
    patchMethod(CSSStyleSheet.prototype, 'insertRule');
    patchMethod(CSSStyleSheet.prototype, 'deleteRule');
    if (CSSStyleSheet.prototype.addRule) patchMethod(CSSStyleSheet.prototype, 'addRule');
    if (CSSStyleSheet.prototype.removeRule) patchMethod(CSSStyleSheet.prototype, 'removeRule');
    if (CSSStyleSheet.prototype.replace) patchMethod(CSSStyleSheet.prototype, 'replace');
    if (CSSStyleSheet.prototype.replaceSync) patchMethod(CSSStyleSheet.prototype, 'replaceSync');
    if (window.CSSGroupingRule?.prototype) {
      for (const name of ['insertRule', 'deleteRule']) if (window.CSSGroupingRule.prototype[name]) patchMethod(window.CSSGroupingRule.prototype, name);
    }
    for (const proto of rulePrototypes) {
      if (Object.getOwnPropertyDescriptor(proto, 'selectorText')?.set)
        patchSetter(proto, 'selectorText', rule => monitoredSheets.has(rule.parentStyleSheet));
      if (Object.getOwnPropertyDescriptor(proto, 'style')?.get) patchStyleGetter(proto);
    }
    patchMethod(CSSStyleDeclaration.prototype, 'setProperty', style => trackedStyles.has(style));
    patchMethod(CSSStyleDeclaration.prototype, 'removeProperty', style => trackedStyles.has(style));
    patchSetter(CSSStyleDeclaration.prototype, 'cssText', style => trackedStyles.has(style));
    apiInstalled = true;
  }

  function restoreGuards() {
    for (const entry of savedDescriptors.splice(0).reverse()) {
      const current = Object.getOwnPropertyDescriptor(entry.proto, entry.key);
      if (current && (current.value === entry.wrapped || current.set === entry.wrapped || current.get === entry.wrapped)) {
        Object.defineProperty(entry.proto, entry.key, entry.descriptor);
      }
    }
    apiInstalled = false;
  }

  function rollback(reason = null) {
    if (observer) { observer.disconnect(); observer = null; }
    document.head?.removeEventListener('load', linkLoadHandler, true);
    internalMutation++;
    try {
      if (record) {
        const siblings = record.parent.cssRules;
        const indexes = [];
        for (const rule of generatedRules) {
          const index = [...siblings].indexOf(rule);
          if (index >= 0) indexes.push(index);
        }
        indexes.sort((a, b) => b - a).forEach(index => record.parent.deleteRule(index));
        generatedRules.clear();
        record.reset.style.cssText = record.originalStyleText;
      }
    } catch (error) {
      lastError = `Rollback failed: ${String(error)}`;
    } finally {
      internalMutation--;
      active = false;
      enabled = false;
      record = null;
      restoreGuards();
      if (reason) lastError = reason;
    }
  }

  function observeHead() {
    if (!document.head || observer) return;
    const relevant = node => node?.nodeType === 1 && (node.tagName === 'STYLE' || (node.tagName === 'LINK' && /stylesheet/i.test(node.rel || '')));
    const relevantTree = node => relevant(node) || Boolean(node?.querySelector?.('style, link[rel~="stylesheet"]'));
    observer = new MutationObserver(records => {
      for (const mutation of records) {
        if (mutation.type === 'childList' && ([...mutation.addedNodes, ...mutation.removedNodes].some(relevantTree) || relevant(mutation.target))) {
          rollback('Head stylesheet set changed; page disabled until next navigation'); return;
        }
        if (mutation.type === 'characterData' && mutation.target.parentElement?.closest('style')) {
          rollback('Head style text changed; page disabled until next navigation'); return;
        }
        if (mutation.type === 'attributes' && mutation.target?.nodeType === 1 && ['STYLE', 'LINK'].includes(mutation.target.tagName)) {
          rollback('Head stylesheet attributes changed; page disabled until next navigation'); return;
        }
      }
    });
    observer.observe(document.head, {subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true});
    linkLoadHandler = event => { if (relevant(event.target)) rollback('Stylesheet loaded after activation; page disabled until next navigation'); };
    document.head.addEventListener('load', linkLoadHandler, true);
  }

  function apply() {
    if (!enabled) return status();
    const totalStart = now();
    phaseMs = {};
    ruleTextCache = new WeakMap();
    try {
      targetSheet = timed('findMainSheet', findMainSheet);
      const sheets = timed('gather', gatherStyleSheets);
      const gate = timed('assertGate', () => assertGate(targetSheet, sheets));
      const scopeData = timed('calculateScopes', () => calculateScopes(sheets, gate.reset, gate.tw, gate.mustRemainGlobal));
      const scoped = gate.tw.filter(item => !scopeData.global.has(item.property));
      const globalCount = gate.tw.length - scoped.length;
      const resetParent = gate.reset.parentRule;
      if (!resetParent?.cssRules || !resetParent.insertRule || !resetParent.deleteRule) throw new Error('Reset parent is not editable');
      record = {reset: gate.reset, parent: resetParent, originalStyleText: gate.reset.style.cssText};
      timed('trackSheets', () => { for (const sheet of sheets) trackSheet(sheet); });
      timed('installGuards', installGuards);
      timed('modify', () => {
        internalMutation++;
        try {
          for (const item of scoped) gate.reset.style.removeProperty(item.property);
          record.expectedStyleText = gate.reset.style.cssText;
          const groups = new Map();
          for (const item of scoped) {
            const selectors = [...scopeData.scopes.get(item.property)].sort();
            if (!selectors.length) throw new Error(`Missing selectors for ${item.property}`);
            const selectorText = selectors.join(', ');
            let group = groups.get(selectorText);
            if (!group) groups.set(selectorText, group = []);
            group.push(item);
          }
          for (const [selectorText, items] of groups) {
            const body = items.map(item => `${item.property}:${item.value}`).join(';');
            const text = `${selectorText}{${body}}`;
            const index = resetParent.insertRule(text, [...resetParent.cssRules].indexOf(gate.reset) + 1);
            const generated = resetParent.cssRules[index];
            generatedRules.add(generated);
            addTrackedRule(generated);
            if (items.some(item => generated.style.getPropertyValue(item.property) !== item.value)) throw new Error('Scoped rule verification failed');
          }
          const full = gate.tw.map(item => `${item.property}:${item.value}`).join(';');
          const index = resetParent.insertRule(`[style]{${full}}`, [...resetParent.cssRules].indexOf(gate.reset) + 1);
          const guard = resetParent.cssRules[index];
          generatedRules.add(guard);
          addTrackedRule(guard);
          if (gate.tw.some(item => guard.style.getPropertyValue(item.property) !== item.value)) throw new Error('Inline guard verification failed');
        } finally { internalMutation--; }
      });
      active = true;
      lastError = null;
      state = {
        mainSheet: MAIN_CSS,
        fingerprint: EXPECTED_SHEET_HASH,
        resetFingerprint: EXPECTED_RESET_HASH,
        scopedVariables: scoped.length,
        globalVariables: globalCount,
        mustRemainGlobalVariables: [...gate.mustRemainGlobal].filter(name => scopeData.twNames.has(name)).sort(),
        cascadeLayerOrder: gate.layerNames,
        propertiesLayerIndex: gate.propertiesIndex,
        mustRemainGlobalReasons: Object.fromEntries([...gate.mustRemainGlobalReasons].map(([name, reasons]) => [name, [...reasons].sort()])),
        generatedRuleCount: generatedRules.size,
        inlineDefaultsPreserved: true,
        arbitraryJSComputedStyleReadsObservable: false,
      };
      observeHead();
      phaseMs.total = Math.max(0, now() - totalStart);
      return status();
    } catch (error) {
      rollback();
      lastError = String(error);
      phaseMs.total = Math.max(0, now() - totalStart);
      return status();
    }
  }

  function status() { return {...state, enabled, active, lastError, phaseMs: {...phaseMs}}; }
  const controller = {
    set(value) {
      if (!value) { rollback(); lastError = null; state = {}; return status(); }
      if (active) return status();
      enabled = true;
      return apply();
    },
    status,
    clean() {
      rollback();
      if (window[NAME] === controller) delete window[NAME];
      return 'removed style defaults helper';
    },
  };
  window[NAME]?.clean?.();
  window[NAME] = controller;
})();
