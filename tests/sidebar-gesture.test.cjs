const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('ChatGPTWeb/Resources/chatgpt.js', 'utf8');
const gestureSource = source.slice(source.indexOf('  const sidebarRow ='), source.indexOf('  const composer ='));
function setup() {
  const listeners = new Map();
  let layoutReads = 0;
  const replayed = [];
  class Element {
    closest(selector) {
      if (selector === 'nav[role="navigation"]') return nav;
      if (selector.startsWith('button,')) return null;
      return row;
    }
    dispatchEvent(event) { replayed.push(event); for (const fn of listeners.get(event.type) || []) fn(event); }
  }
  const target = new Element();
  const row = new Element();
  const scroller = new Element();
  const nav = new Element();
  nav.contains = () => true;
  nav.clientWidth = 270;
  scroller.parentElement = nav;
  row.parentElement = scroller;
  row.contains = node => node === target;
  target.isConnected = true;
  scroller.scrollTop = 100;
  for (const [key, value] of Object.entries({clientWidth: 270, clientHeight: 100, scrollHeight: 500})) {
    Object.defineProperty(scroller, key, {get() { layoutReads++; return value; }});
  }
  const document = {documentElement: {}, addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); }};
  class PointerEvent { constructor(type, data) { Object.assign(this, data); this.type = type; } }
  vm.runInNewContext(gestureSource, {document, window: {addEventListener() {}}, Element, PointerEvent, performance: {now: () => 0}, getComputedStyle() { layoutReads++; return {overflowY: 'auto'}; }});
  function fire(type, data = {}) {
    const event = {type, target, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: 0, clientY: 0, button: 0, buttons: 1, timeStamp: 0, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...data};
    for (const fn of listeners.get(type) || []) fn(event);
    return event;
  }
  return {fire, replayed, scroller, reads: () => layoutReads};
}
let p = setup();
p.fire('pointerdown');
assert.equal(p.reads(), 0, 'a click must not read sidebar geometry');
p.fire('pointermove', {clientY: 20, timeStamp: 100});
assert.ok(p.reads() > 0, 'a mouse drag resolves its scroll container');
assert.equal(p.scroller.scrollTop, 80);
p.fire('pointermove', {clientY: 30, timeStamp: 2100});
assert.equal(p.replayed.length, 0, 'scrolling cannot become reorder later');
p = setup();
p.fire('pointerdown');
p.fire('pointermove', {clientY: 4, timeStamp: 500});
p.fire('pointermove', {clientY: 20, timeStamp: 1900});
assert.equal(p.replayed.length, 0, 'early slow movement is not a stationary hold');
p = setup();
p.fire('pointerdown');
p.fire('pointermove', {clientY: 20, timeStamp: 1900});
assert.equal(p.replayed.length, 1, 'stationary long hold preserves reorder');
assert.equal(p.reads(), 0, 'reorder does not scan scroll geometry');
p = setup();
p.fire('pointerdown', {pointerType: 'touch'});
const touch = p.fire('pointermove', {pointerType: 'touch', clientY: 20, timeStamp: 100});
assert.equal(p.reads(), 0);
assert.equal(touch.prevented, undefined, 'native touch scrolling remains uncanceled');
p.fire('pointermove', {pointerType: 'touch', clientY: 30, timeStamp: 2000});
assert.equal(p.replayed.length, 0);
console.log('Sidebar gesture checks passed');
