const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../ChatGPTWeb/Resources/legacy-layer-order.js'), 'utf8');
function run({enabled = true, native = false, ready = true} = {}) {
  const inserted = [];
  let callback, disconnected = false;
  const parent = {prepend: s => inserted.push(s)};
  const document = {head: ready ? parent : null, documentElement: null,
    getElementById: id => inserted.find(s => s.id === id), createElement: () => ({})};
  class MutationObserver {
    constructor(cb) { callback = cb; }
    observe(target, options) { assert.equal(target, document); assert.equal(options.childList, true); }
    disconnect() { disconnected = true; }
  }
  const context = {window: {__webShellLegacyLayerOrder: enabled}, CSS: native ? {registerProperty() {}} : {}, document, MutationObserver};
  vm.runInNewContext(source, context);
  return {inserted, again: () => vm.runInNewContext(source, context), ready: () => {document.documentElement = parent; callback();}, disconnected: () => disconnected};
}
test('legacy layer order is inserted once before site sheets', () => {
  const r = run(); r.again();
  assert.equal(r.inserted.length, 1);
  assert.equal(r.inserted[0].textContent, '@layer properties,theme,base,components,utilities;');
});
test('legacy layer order waits for the first document element', () => {
  const r = run({ready:false}); assert.equal(r.inserted.length, 0); r.ready();
  assert.equal(r.inserted.length, 1); assert.equal(r.disconnected(), true);
});
test('native property support and disabled Lite Mode leave layer order unchanged', () => {
  assert.equal(run({native:true}).inserted.length, 0);
  assert.equal(run({enabled:false}).inserted.length, 0);
});
