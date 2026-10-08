const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../ChatGPTWeb/Resources/legacy-style-defaults.js'), 'utf8');

const fnvPrime = 0x01000193;
const fnvPrimeInverse = (() => {
  let oldR = BigInt(fnvPrime), r = 1n << 32n, oldS = 1n, s = 0n;
  while (r) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return Number((oldS % (1n << 32n) + (1n << 32n)) % (1n << 32n));
})();

function hashFNV(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), fnvPrime) >>> 0;
  return hash;
}

function previousHash(hash, code) {
  return (Math.imul(hash, fnvPrimeInverse) >>> 0) ^ code;
}

function forgeTail(prefix, finalCharacter, targetHex) {
  const target = parseInt(targetHex, 16) >>> 0;
  const beforeTail = previousHash(target, finalCharacter.charCodeAt(0));
  const forward = new Map();
  const start = hashFNV(prefix);
  for (let a = 0; a < 256; a++) {
    const h1 = Math.imul(start ^ a, fnvPrime) >>> 0;
    for (let b = 0; b < 256; b++) forward.set(Math.imul(h1 ^ b, fnvPrime) >>> 0, [a, b]);
  }
  for (let c = 0; c < 256; c++) for (let d = 0; d < 256; d++) for (let e = 0; e < 256; e++) {
    const h4 = previousHash(beforeTail, e);
    const h3 = previousHash(h4, d);
    const h2 = previousHash(h3, c);
    const pair = forward.get(h2);
    if (pair) return String.fromCharCode(...pair, c, d, e) + finalCharacter;
  }
  throw new Error('Could not forge test hash suffix');
}

function createContext({registerProperty = false} = {}) {
  const link = {tagName: 'LINK', href: 'https://chatgpt.com/cdn/assets/886701.edb92b3055.css'};
  const sheet = {ownerNode: link, cssRules: []};
  link.sheet = sheet;
  const head = {addEventListener() {}, removeEventListener() {}};
  class MutationObserver { observe() {} disconnect() {} }
  class CSSStyleSheet {}
  class CSSGroupingRule {}
  class CSSStyleRule {}
  class CSSStyleDeclaration {}
  const win = {setTimeout, clearTimeout};
  win.window = win;
  win.CSS = registerProperty ? {registerProperty() {}} : {};
  const context = {
    window: win,
    document: {styleSheets: [sheet], head, querySelectorAll() { return []; }},
    location: {href: 'https://chatgpt.com/'},
    URL,
    MutationObserver,
    CSSStyleSheet,
    CSSGroupingRule,
    CSSStyleRule,
    CSSStyleDeclaration,
    CSS: win.CSS,
  };
  vm.runInNewContext(source, context, {filename: 'legacy-style-defaults.js'});
  return {controller: win.__shellStyleDefaults, sheet, link, win};
}

function createMatchingContext({earlierLayerTw = false} = {}) {
  class CSSStyleDeclaration {
    constructor(entries = []) { this.entries = new Map(entries); }
    get length() { return this.entries.size; }
    item(index) { return [...this.entries.keys()][index] || ''; }
    getPropertyValue(name) { return this.entries.get(name)?.value || ''; }
    getPropertyPriority(name) { return this.entries.get(name)?.priority || ''; }
    setProperty(name, value, priority = '') { this.entries.set(name, {value: String(value), priority}); }
    removeProperty(name) { this.entries.delete(name); }
    get cssText() { return [...this.entries].map(([name, entry]) => `${name}: ${entry.value}${entry.priority ? ' !important' : ''};`).join(' '); }
    set cssText(value) {
      this.entries.clear();
      for (const declaration of String(value).split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 0) continue;
        const name = declaration.slice(0, colon).trim();
        const raw = declaration.slice(colon + 1).trim();
        if (name) this.setProperty(name, raw.replace(/\s*!important$/, ''), /\s*!important$/.test(raw) ? 'important' : '');
      }
    }
  }
  class CSSStyleRule {
    constructor(selectorText, style, cssText) { this._selectorText = selectorText; this._style = style; this._cssText = cssText; }
    get selectorText() { return this._selectorText; }
    set selectorText(value) { this._selectorText = value; }
    get style() { return this._style; }
    get cssText() { return this._cssText; }
  }
  class CSSGroupingRule {
    constructor(cssText, parentRule = null, parentStyleSheet = null) { this.cssText = cssText; this.cssRules = []; this.parentRule = parentRule; this.parentStyleSheet = parentStyleSheet; }
    insertRule(ruleText, index = 0) {
      const brace = ruleText.indexOf('{');
      const selector = ruleText.slice(0, brace).trim();
      const body = ruleText.slice(brace + 1, ruleText.lastIndexOf('}'));
      const style = new CSSStyleDeclaration();
      style.cssText = body;
      const rule = new CSSStyleRule(selector, style, ruleText);
      rule.parentRule = this;
      rule.parentStyleSheet = this.parentStyleSheet;
      this.cssRules.splice(index, 0, rule);
      return index;
    }
    deleteRule(index) { this.cssRules.splice(index, 1); }
  }
  class CSSStyleSheet {
    constructor(ownerNode, cssRules) { this.ownerNode = ownerNode; this.cssRules = cssRules; }
    insertRule() { throw new Error('unexpected top-level insert'); }
    deleteRule() { throw new Error('unexpected top-level delete'); }
  }

  const twEntries = Array.from({length: 94}, (_, index) => [`--tw-test-${index}`, {value: `${index}`, priority: ''}]);
  const extraEntries = Array.from({length: 6}, (_, index) => [`color-${index}`, {value: 'black', priority: ''}]);
  const resetStyle = new CSSStyleDeclaration([...twEntries, ...extraEntries]);
  const resetPrefix = 'RESET-RULE{';
  const resetCssText = resetPrefix + forgeTail(resetPrefix, '}', 'b0358584');
  const reset = new CSSStyleRule('* , ::before, ::after, ::backdrop', resetStyle, resetCssText);
  const link = {tagName: 'LINK', href: 'https://chatgpt.com/cdn/assets/886701.edb92b3055.css'};
  const sheet = new CSSStyleSheet(link, []);
  const properties = new CSSGroupingRule('@layer properties {', null, sheet);
  const supports = new CSSGroupingRule('@supports (color:var(--x)) {', properties, sheet);
  reset.parentRule = supports;
  reset.parentStyleSheet = sheet;
  supports.cssRules.push(reset);
  properties.cssRules.push(supports);

  const theme = new CSSGroupingRule('@layer theme {', null, sheet);
  const base = new CSSGroupingRule('@layer base {', null, sheet);
  const unrelatedStyle = new CSSStyleDeclaration([...twEntries, ...extraEntries]);
  const unrelated = new CSSStyleRule('* , ::before, ::after, ::backdrop', unrelatedStyle, 'OTHER-UNIVERSAL-RULE{}');
  unrelated.parentRule = base;
  unrelated.parentStyleSheet = sheet;
  base.cssRules.push(unrelated);
  const utilities = new CSSGroupingRule('@layer utilities {', null, sheet);
  const sheetPrefix = `${properties.cssText}\n${theme.cssText}\n${base.cssText}\n${utilities.cssText}`;
  utilities.cssText = utilities.cssText.slice(0, -1) + forgeTail(sheetPrefix.slice(0, -1), '}', '2d1cde80');
  sheet.cssRules.push(properties, theme, base, utilities);

  const priorTheme = new CSSGroupingRule('@layer theme {');
  if (earlierLayerTw) {
    const priorRule = new CSSStyleRule('.legacy-theme', new CSSStyleDeclaration([['--tw-test-0', {value: 'old', priority: ''}]]), '.legacy-theme{--tw-test-0:old}');
    priorRule.parentRule = priorTheme;
    priorTheme.cssRules.push(priorRule);
  }
  const priorSheet = new CSSStyleSheet({tagName: 'STYLE'}, [priorTheme]);
  priorTheme.parentStyleSheet = priorSheet;

  const win = {setTimeout, clearTimeout};
  win.window = win;
  win.CSS = {};
  win.CSSGroupingRule = CSSGroupingRule;
  win.CSSStyleRule = CSSStyleRule;
  const head = {addEventListener() {}, removeEventListener() {}};
  class MutationObserver { observe() {} disconnect() {} }
  const context = {
    window: win,
    document: {styleSheets: [priorSheet, sheet], head, querySelectorAll() { return []; }},
    location: {href: 'https://chatgpt.com/'}, URL, MutationObserver,
    CSSStyleSheet, CSSGroupingRule, CSSStyleRule, CSSStyleDeclaration,
  };
  vm.runInNewContext(source, context, {filename: 'legacy-style-defaults.js'});
  return {controller: win.__shellStyleDefaults, reset, supports, unrelated, sheet, win};
}

test('style defaults helper exposes reversible API without changing CSS on an unknown fingerprint', () => {
  const {controller, sheet, win} = createContext();
  const originalRules = sheet.cssRules;

  const status = controller.set(true);

  assert.equal(status.active, false);
  assert.match(status.lastError, /fingerprint differs/);
  assert.equal(sheet.cssRules, originalRules);
  assert.equal(controller.set(false).active, false);
  controller.clean();
  assert.equal(win.__shellStyleDefaults, undefined);
});

test('style defaults helper refuses to run when native CSS.registerProperty exists', () => {
  const {controller, sheet} = createContext({registerProperty: true});
  const originalRules = sheet.cssRules;

  const status = controller.set(true);

  assert.equal(status.active, false);
  assert.match(status.lastError, /CSS\.registerProperty is available/);
  assert.equal(sheet.cssRules, originalRules);
});

test('style defaults helper selects the fingerprinted reset and ignores unrelated universal rules', () => {
  const {controller, reset, supports, unrelated} = createMatchingContext();
  assert.equal(hashFNV(reset.cssText).toString(16), 'b0358584');

  const status = controller.set(true);

  assert.equal(status.active, true, status.lastError);
  for (const phase of ['findMainSheet', 'gather', 'assertGate', 'calculateScopes', 'trackSheets', 'installGuards', 'modify', 'total']) {
    assert.equal(typeof status.phaseMs[phase], 'number', `missing ${phase} timing`);
    assert.ok(status.phaseMs[phase] >= 0, `${phase} timing must be non-negative`);
  }
  assert.equal(status.scopedVariables, 0);
  assert.equal(status.globalVariables, 94);
  assert.equal(reset.style.length, 100);
  assert.equal(unrelated.style.length, 100);
  assert.equal(supports.cssRules.length, 2);
  assert.match(supports.cssRules[1].selectorText, /^\[style\]$/);
  assert.equal(supports.cssRules[1].style.length, 94);
  controller.set(false);
  assert.equal(supports.cssRules.length, 1);
  assert.equal(reset.style.length, 100);
});

test('style defaults helper keeps earlier-layer TW assignments global', () => {
  const {controller, reset, supports} = createMatchingContext({earlierLayerTw: true});
  const originalStyle = reset.style.cssText;

  const status = controller.set(true);

  assert.equal(status.active, true, status.lastError);
  assert.equal(status.mustRemainGlobalVariables.includes('--tw-test-0'), true);
  assert.equal(reset.style.cssText, originalStyle);
  controller.set(false);
  assert.deepEqual(supports.cssRules.map(rule => rule.selectorText), ['* , ::before, ::after, ::backdrop']);
});
