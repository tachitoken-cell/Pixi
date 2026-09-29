import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

class Target {
  listeners = new Map();
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  contains(target) { return target === this; }
  fire(type, properties = {}) { this.listeners.get(type)?.({ target: this, touches: [{ target: this }], ...properties }); }
}
let now = 1000, nextTimer = 0;
const timers = new Map(), window = new Target(), panel = new Target(), joystick = new Target();
window.clearTimeout = id => timers.delete(id);
window.setTimeout = (work, after) => { const id = ++nextTimer; timers.set(id, { work, at: now + after }); return id; };
const advance = milliseconds => {
  now += milliseconds;
  for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.work(); }
};
const source = stripTypeScriptTypes(readFileSync(new URL('../src/scroll-refresh.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
const defer = runInNewContext(`${source};deferTouchRender`, { window, performance: { now: () => now } });
let renders = 0, state = 'initial', displayed = '';
const render = () => { if (defer(panel, render)) return; renders++; displayed = state; };
render(); assert.equal(renders, 1, 'idle rendering is synchronous');
panel.fire('touchstart'); state = 'updated'; render();
advance(1000); assert.equal(renders, 1, 'active touch retains its mounted scrollport');
panel.fire('scroll'); window.fire('touchend', { touches: [{ target: joystick }] });
advance(119); assert.equal(renders, 1, 'momentum has a quiet period');
panel.fire('scroll'); state = 'latest'; render();
advance(119); assert.equal(renders, 1, 'continued native scrolling postpones repaint');
advance(1); assert.equal(renders, 2); assert.equal(displayed, 'latest', 'one repaint uses newest state, even with another finger outside the panel');
panel.fire('touchstart'); render();
window.fire('touchend', { touches: [{ target: panel }] }); advance(500);
assert.equal(renders, 2, 'a second panel finger still protects the gesture');
window.fire('touchend', { touches: [] }); advance(0);
assert.equal(renders, 3, 'the last panel finger releases a tap update without a scroll delay');
panel.fire('touchstart'); render(); window.fire('touchcancel', { touches: [] }); advance(0);
assert.equal(renders, 4, 'cancelled gestures cannot freeze updates');
panel.fire('touchstart'); render(); window.fire('blur'); advance(0);
assert.equal(renders, 5, 'leaving the app cannot leave touch state stuck');
panel.fire('touchstart'); render(); window.fire('touchend', { target: {}, touches: [] }); advance(0);
assert.equal(renders, 6, 'release from a detached target after an explicit repaint cannot freeze passive updates');
const removedTarget = {}; let attached = true;
panel.contains = target => target === panel || target === removedTarget && attached;
panel.fire('touchstart', { touches: [{ target: removedTarget }] }); render();
attached = false; render();
assert.equal(renders, 7, 'removing a touched node without a touchend cannot freeze later passive updates');
console.log('Scroll refresh passed: stable scrollports throughout touch and momentum, latest state once, independent panel/joystick fingers, cancellation and blur recovery.');
