const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('ChatGPTWeb/Resources/chatgpt.js', 'utf8');
const interactionSource = source.slice(source.indexOf('  const composer ='), source.indexOf("  for (const name of ['pushState'"));
function setup() {
  const listeners = new Map();
  let reads = 0, sends = 0;
  class Element {
    constructor(kind) { this.kind = kind; this.disabled = false; this.type = 'button'; this.textContent = ''; }
    closest(selector) {
      if (selector === 'button') return this.kind === 'editor' ? null : this;
      if (selector.startsWith('#prompt-textarea')) return this.kind === 'editor' ? this : null;
      if (selector.startsWith('form') || selector === '[data-composer-body]') return form;
      return null;
    }
    getAttribute(key) { if (key === 'data-testid') return this.kind === 'send' ? 'send-button' : this.kind === 'stop' ? 'stop-button' : null; return null; }
    setAttribute() {}
    getBoundingClientRect() { reads++; return {width: 20, height: 20}; }
    click() { sends++; }
  }
  const send = new Element('send'), editor = new Element('editor'), other = new Element('other');
  editor.textContent = 'draft';
  const form = {querySelector: () => editor, querySelectorAll: () => [other, send]};
  const document = {addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); }};
  vm.runInNewContext(interactionSource, {Element, document, Date: {now: () => 100}});
  function fire(type, data) { const event = {target: editor, key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, repeat: false, keyCode: 13, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...data}; for (const fn of listeners.get(type) || []) fn(event); return event; }
  return {fire, editor, other, send, reads: () => reads, sends: () => sends};
}
let p = setup();
p.fire('click', {target: p.other, isTrusted: true});
assert.equal(p.reads(), 0, 'non-composer buttons must not force geometry reads');
p.fire('keydown', {shiftKey: true});
assert.equal(p.sends(), 0);
p.fire('keydown', {isComposing: true});
assert.equal(p.sends(), 0, 'IME composition remains untouched');
p.fire('keydown', {});
assert.equal(p.sends(), 1, 'Enter sends once');
assert.equal(p.reads(), 1, 'only the send button has its visibility measured once');
p.fire('keydown', {});
assert.equal(p.sends(), 1, 'rapid repeated Enter is guarded');
const e = p.fire('click', {target: p.send, isTrusted: true});
assert.equal(e.prevented, true, 'rapid trusted send click is guarded');
console.log('Shell interaction checks passed');
