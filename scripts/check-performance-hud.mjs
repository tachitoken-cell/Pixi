import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPerformanceHud } from '../src/performance-hud.ts';

let saved = null, denied = false;
let clock = 0;
const realPerformance = globalThis.performance;
globalThis.performance = { now: () => clock };
globalThis.localStorage = { getItem() { if (denied) throw Error('blocked'); return saved; }, setItem(_key, value) { if (denied) throw Error('blocked'); saved = value; } };
class Control extends EventTarget {
  hidden = false; textContent = '—'; checked = false;
  constructor(key) { super(); this.dataset = { performanceKey: key }; this.valueNode = { textContent: '—' }; }
  querySelector() { return this.valueNode; }
}
function setup() {
  const rows = { fps: new Control('fps'), ping: new Control('ping') }, sent = [];
  const root = { hidden: false, innerHTML: '', querySelector: selector => rows[selector.includes('fps') ? 'fps' : 'ping'] };
  const controls = { fps: new Control('fps'), ping: new Control('ping') }, status = new Control();
  const hud = createPerformanceHud(root, id => sent.push(id));
  const frame = hud.frame;
  hud.frame = (now, visible, online, sentAt = now) => { clock = sentAt; frame(now, visible, online); };
  hud.mountSettings({ querySelectorAll: () => Object.values(controls), querySelector: () => status });
  const toggle = (key, checked) => { controls[key].checked = checked; controls[key].dispatchEvent(new Event('change')); };
  const value = key => rows[key].valueNode.textContent;
  return { hud, root, rows, sent, status, toggle, value };
}
const view = setup();
view.hud.frame(0, true, true);
assert(view.root.hidden); assert.equal(view.sent.length, 0, 'disabled indicators send no traffic');
view.toggle('fps', true);
for (let frame = 0; frame <= 60; frame++) view.hud.frame(frame * 1000 / 60, true, true);
assert.equal(view.value('fps'), '60'); assert.equal(view.sent.length, 0, 'FPS alone needs no network');
assert(!view.rows.fps.hidden && view.rows.ping.hidden && !view.root.hidden);
view.toggle('ping', true); view.hud.frame(1100, true, true);
assert.equal(view.sent.length, 1);
view.hud.pong(view.sent[0] + 1, 1120); assert.equal(view.value('ping'), '—', 'unmatched replies ignored');
view.hud.pong(view.sent[0], 1142); assert.equal(view.value('ping'), '42 ms');
view.hud.pong(view.sent[0], 1160); assert.equal(view.value('ping'), '42 ms', 'duplicates ignored');
view.hud.frame(4099, true, true); assert.equal(view.sent.length, 1);
view.hud.frame(4100, true, true); assert.equal(view.sent.length, 2, 'one probe per three seconds');
view.hud.frame(9100, true, true); assert.equal(view.value('ping'), '—', 'lost replies expire');
view.hud.pong(view.sent[1], 9101); assert.equal(view.value('ping'), '—', 'late reply cannot restore stale ping');
view.hud.frame(9200, true, false); assert.equal(view.value('ping'), 'Offline');
view.rows.ping.valueNode.textContent = '离线'; // Presentation text must never become connection state.
view.hud.frame(9300, true, true); assert.equal(view.value('ping'), '—'); assert.equal(view.sent.length, 3);
view.hud.reset(); view.hud.pong(view.sent[2], 9330); assert.equal(view.value('ping'), '—', 'connection reset rejects the old sample');
view.hud.frame(9400, true, true); assert.equal(view.sent.length, 4);
view.hud.frame(9500, false, true); assert(view.root.hidden);
view.hud.frame(25000, false, true); assert.equal(view.sent.length, 4, 'hidden/covered game pauses diagnostics');
view.hud.pong(view.sent[3], 25001); assert.equal(view.value('ping'), '—');
view.hud.frame(26000, true, true); assert.equal(view.value('fps'), '—', 'return from background starts a fresh FPS window');
for (let frame = 1; frame <= 30; frame++) view.hud.frame(26000 + frame * 1000 / 30, true, true);
assert.equal(view.value('fps'), '30');
view.toggle('fps', false); assert(view.rows.fps.hidden && !view.rows.ping.hidden, 'independent toggles');
assert.deepEqual(JSON.parse(saved), { fps: false, ping: true });
assert.match(setup().hud.renderSettings(), /id="show-ping"[^>]* checked/);
assert.doesNotMatch(setup().hud.renderSettings(), /id="show-fps"[^>]* checked/);
const slow = setup(); slow.hud.frame(0, true, true); slow.hud.pong(slow.sent[0], 3500); slow.hud.frame(3516, true, true);
assert.equal(slow.value('ping'), '3500 ms', 'the last measurement stays readable while the next probe is pending');
const delayed = setup(); delayed.hud.frame(1000, true, true, 1100); delayed.hud.pong(delayed.sent[0], 1112);
assert.equal(delayed.value('ping'), '12 ms', 'a late animation callback does not count pre-send delay as network RTT');
delayed.hud.frame(4000, true, true, 4100); delayed.hud.pong(delayed.sent[1], 4600);
assert.equal(delayed.value('ping'), '500 ms', 'actual application round-trip spikes remain visible');
view.toggle('ping', false); const count = view.sent.length;
view.hud.frame(31000, true, true); assert(view.root.hidden); assert.equal(view.sent.length, count);
denied = true; view.toggle('fps', true); assert.match(view.status.textContent, /session.*unavailable/);
assert.doesNotThrow(setup); denied = false;
for (const invalid of ['{bad', 'null', '[]', '42', '{"fps":"true","ping":1}']) {
  saved = invalid; const fresh = setup(); fresh.hud.frame(0, true, true); assert(fresh.root.hidden);
}
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
assert.match(main, /performanceHud\.frame\(now,worldReady&&!entryActive&&!rosterActive&&!customizer.open&&!atlas&&!document.hidden,connected&&socket\?\.readyState===WebSocket.OPEN\)/);
assert.match(main, /if\(msg.type==='pong'\)\{performanceHud.pong\(msg.id,performance.now\(\)\)/);
const connectSetup = main.match(/async function connect\([^)]*\)\{([\s\S]*?)const revision=\+\+connectionRevision;/)?.[1];
assert.match(connectSetup || '', /performanceHud\.reset\(\);/, 'a new connection clears HUD samples before advancing its revision');
globalThis.performance = realPerformance;
console.log('PASS performance HUD: independent persistent toggles, measured FPS and RTT, bounded probes, timeout/reconnect/background resets, blocked storage, and game-loop wiring.');
