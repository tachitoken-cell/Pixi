import assert from 'node:assert/strict';

let stored = null, coarse = false, failStorage = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
globalThis.matchMedia = () => ({ matches: coarse });
globalThis.localStorage = {
  getItem(key) { assert.equal(key, 'mossvale-graphics'); if (failStorage) throw Error('Storage denied'); return stored; },
  setItem(key, value) { assert.equal(key, 'mossvale-graphics'); if (failStorage) throw Error('Storage full'); stored = value; },
};
const { graphics, GRAPHICS_PRESETS: presets, normalizeGraphicsSettings: normalize, renderGraphicsSettings, mountGraphicsSettings } = await import('../src/graphics-settings.ts');
assert.deepEqual(graphics, presets.medium, 'unknown desktop starts conservatively with Medium');
assert.match(renderGraphicsSettings(), /value="auto" selected/);
coarse = true;
assert.deepEqual((await import('../src/graphics-settings.ts?mobile')).graphics, presets.low, 'first-use touch devices start with Low');
stored = JSON.stringify(presets.high);
assert.deepEqual((await import('../src/graphics-settings.ts?saved-mobile')).graphics, presets.high, 'saved choices beat the device default');
stored = '{broken';
assert.deepEqual((await import('../src/graphics-settings.ts?broken')).graphics, presets.low, 'invalid storage cannot break startup');
failStorage = true;
assert.deepEqual((await import('../src/graphics-settings.ts?denied')).graphics, presets.low, 'blocked storage cannot break startup');
failStorage = false;
for (const value of [null, [], true, 42, 'low', { resolution: '0.5', renderDistance: 0, shadows: 'medium', textures: 'off', effects: false, bloom: 'false', reflections: 1 }, Object.create(presets.low)]) assert.deepEqual(normalize(value), presets.high);
for (const preset of Object.values(presets)) assert.deepEqual(normalize(preset), preset, 'presets contain only supported values');
assert.deepEqual(normalize({ shadows: 'off', extra: 'ignored' }, presets.medium), { ...presets.medium, shadows: 'off' }, 'valid partial settings retain the supplied defaults');
assert.deepEqual(normalize({ bloom: false, reflections: false }), { ...presets.high, bloom: false, reflections: false }, 'false is a valid saved setting');

class Control extends EventTarget {
  constructor(value = '', key) { super(); this.value = value; this.dataset = key ? { graphicsKey: key } : {}; this.textContent = ''; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
}
const markup = renderGraphicsSettings(), nodes = new Map();
for (const [, attrs, options] of markup.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
  const id = attrs.match(/id="([^"]+)"/)[1], key = attrs.match(/data-graphics-key="([^"]+)"/)?.[1];
  nodes.set(`#${id}`, new Control(options.match(/<option value="([^"]+)" selected/)?.[1], key));
  assert(markup.includes(`for="${id}"`), `${id} has a native label`);
  if (key) assert(attrs.includes(`aria-describedby="graphics-${key}-hint"`) && markup.includes(`id="graphics-${key}-hint"`), `${key} has an accessible hint`);
}
nodes.set('#graphics-status', new Control());
nodes.set('#graphics-defaults', new Control());
nodes.set('#graphics-check', new Control());
const controls = [...nodes.values()].filter(node => node.dataset.graphicsKey);
const tabs = ['graphics', 'audio', 'updates', 'keybindings', 'controls'].map(name => Object.assign(new Control(), { dataset: { settingsTab: name } }));
const pages = tabs.map(tab => ({ dataset: { settingsPage: tab.dataset.settingsTab }, hidden: tab.dataset.settingsTab !== 'graphics' }));
const root = { querySelector: selector => nodes.get(selector), querySelectorAll: selector => ({ '[data-graphics-key]': controls, '[data-settings-tab]': tabs, '[data-settings-page]': pages })[selector], set innerHTML(_) { assert.fail('settings changes must preserve focused DOM nodes'); } };
let applied = 0;
mountGraphicsSettings(root, () => applied++);
const change = (id, value) => { const node = nodes.get(`#graphics-${id}`); node.value = value; node.dispatchEvent(new Event('change')); };
const identity = graphics;
for (const [name, preset] of Object.entries(presets)) {
  change('preset', name);
  assert.deepEqual(graphics, preset);
  for (const control of controls) assert.equal(control.value, String(preset[control.dataset.graphicsKey]), 'preset refreshes every control in place');
  assert.deepEqual(JSON.parse(stored), preset);
}
assert.equal(graphics, identity, 'renderer subscribers retain the same settings object');
assert.equal(applied, 3);
const independent = { resolution: .5, renderDistance: 120, shadows: 'off', textures: 'low', effects: 'off', bloom: false, reflections: false };
for (const [key, value] of Object.entries(independent)) {
  const before = { ...graphics };
  change(key, String(value));
  assert.deepEqual(graphics, { ...before, [key]: value }, `${key} changes independently`);
  assert.equal(nodes.get('#graphics-preset').value, 'custom');
}
assert.equal(applied, 10);
assert.deepEqual(JSON.parse(stored), independent);
assert.match(nodes.get('#graphics-status').textContent, /saved/);
failStorage = true;
change('shadows', 'high');
assert.equal(graphics.shadows, 'high', 'storage failure still applies the setting');
assert.match(nodes.get('#graphics-status').textContent, /session.*unavailable/);
const before = { ...graphics }, previousCalls = applied;
change('preset', '__proto__'); change('resolution', 'NaN');
assert.deepEqual(graphics, before); assert.equal(applied, previousCalls, 'invalid controls never apply unsupported values');
failStorage = false;
for (const [mobile, expected] of [[false, 'medium'], [true, 'low']]) {
  coarse = mobile;
  nodes.get('#graphics-defaults').dispatchEvent(new Event('click'));
  assert.deepEqual(graphics, presets[expected], 'Defaults restores the device recommendation');
  assert.equal(nodes.get('#graphics-preset').value, 'auto');
  assert.deepEqual(JSON.parse(stored), { mode: 'auto', preset: expected, checked: false });
  for (const control of controls) assert.equal(control.value, String(graphics[control.dataset.graphicsKey]));
}
const beforeNavigation = applied;
for (const tab of [tabs[1], tabs[2], tabs[0]]) {
  tab.dispatchEvent(new Event('click'));
  assert.equal(tab.attributes['aria-current'], 'page');
  assert.equal(tabs.filter(node => node.attributes['aria-current'] === 'page').length, 1);
  assert.deepEqual(pages.filter(page => !page.hidden).map(page => page.dataset.settingsPage), [tab.dataset.settingsTab]);
}
assert.equal(applied, beforeNavigation, 'navigation preserves graphics choices without applying them again');
assert.equal(graphics, identity);
// Exercise real elapsed frame windows, including pauses and deliberately slow devices.
let clock = 0;
const feed = (module, seconds, frameMs = 16, active = true) => {
  let changes = 0;
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += frameMs) {
    clock += frameMs;
    changes += Number(module.updateAutoGraphics(clock, active));
  }
  return changes;
};
const runCheck = (module, timings) => {
  const start = clock, tested = [];
  for (let frame = 0; clock - start < 30000; frame++) {
    const tier = Object.keys(presets).find(name => module.graphics.resolution === presets[name].resolution);
    clock += timings[tier];
    module.updateAutoGraphics(clock, true);
    const status = module.autoGraphicsStatus();
    if (status.startsWith('Checking') && tested.at(-1) !== status) tested.push(status);
    if (status.startsWith('Performance check complete')) return { seconds: (clock - start) / 1000, tested };
  }
  assert.fail('the check must finish in a bounded period');
};
coarse = false; stored = null;
const automatic = await import('../src/graphics-settings.ts?auto-frames');
assert.match(automatic.autoGraphicsStatus(), /queued/);
assert.equal(feed(automatic, 2), 0, 'initial world loading warms up at the conservative quality');
assert.equal(feed(automatic, 1), 1, 'the first benchmark tries High directly');
assert.deepEqual(automatic.graphics, presets.high);
assert.match(automatic.autoGraphicsStatus(), /Checking High/);
assert.equal(JSON.parse(stored).checked, false, 'unfinished tests are never saved as completed');
const fast = runCheck(automatic, { low: 16, medium: 16, high: 16 });
assert(fast.seconds < 5, 'a capable device finishes its High test within a few seconds');
assert.deepEqual(automatic.graphics, presets.high);
assert.deepEqual(JSON.parse(stored), { mode: 'auto', preset: 'high', checked: true });
const restored = await import('../src/graphics-settings.ts?auto-reload-high');
assert.deepEqual(restored.graphics, presets.high, 'a measured High result restores exactly');
assert.match(restored.autoGraphicsStatus(), /complete.*High/);
assert.equal(feed(restored, 20), 0, 'completed checks are not rerun on every launch');
assert.equal(feed(automatic, 8, 40), 1, 'later sustained slow play still lowers quality');
assert.deepEqual(automatic.graphics, presets.medium);
assert.match(automatic.autoGraphicsStatus(), /lowered.*Medium/);
assert.equal(feed(automatic, 100), 0, 'smooth frames never cause an unsolicited automatic up-climb');
assert.equal(feed(automatic, 8, 80), 1, 'persistent severe slowdown can lower quality again');
assert.deepEqual(automatic.graphics, presets.low);
assert.deepEqual((await import('../src/graphics-settings.ts?auto-reload-low')).graphics, presets.low);
assert.equal(feed(automatic, 8, 80), 0, 'Low is the floor');

stored = null;
const medium = await import('../src/graphics-settings.ts?benchmark-medium');
const middle = runCheck(medium, { low: 16, medium: 18, high: 30 });
assert(middle.seconds < 12);
assert.deepEqual(middle.tested.map(text => text.match(/Checking (\w+)/)[1]), ['High', 'Medium']);
assert.deepEqual(medium.graphics, presets.medium, 'the highest tier meeting around 50 FPS wins');
stored = null;
const low = await import('../src/graphics-settings.ts?benchmark-low');
const slow = runCheck(low, { low: 32, medium: 80, high: 80 });
assert(slow.seconds < 12, 'terrible performance falls back before the full three-second measurement');
assert.deepEqual(slow.tested.map(text => text.match(/Checking (\w+)/)[1]), ['High', 'Medium', 'Low']);
assert.deepEqual(low.graphics, presets.low, 'Low remains the safe fallback when no tier reaches the target');

stored = null;
const interrupted = await import('../src/graphics-settings.ts?auto-interrupted');
assert.equal(feed(interrupted, 90, 80, false), 0, 'inactive menus/loading/hidden tabs never run the check');
assert.deepEqual(interrupted.graphics, presets.medium);
feed(interrupted, 4);
assert.match(interrupted.autoGraphicsStatus(), /Checking High/);
assert.equal(feed(interrupted, 90, 80, false), 0, 'an in-flight check pauses across menus and hidden tabs');
clock += 60000;
assert.equal(interrupted.updateAutoGraphics(clock, true), false);
assert.equal(feed(interrupted, 2), 0);
assert.match(interrupted.autoGraphicsStatus(), /Checking High/, 'resume starts a fresh warmup and sampling window');
runCheck(interrupted, { low: 16, medium: 16, high: 16 });
assert.deepEqual(interrupted.graphics, presets.high, 'inactive time does not bias the selected tier');

stored = null;
const hitch = await import('../src/graphics-settings.ts?benchmark-hitch');
feed(hitch, 4);
clock += 900; hitch.updateAutoGraphics(clock, true);
runCheck(hitch, { low: 16, medium: 16, high: 16 });
assert.deepEqual(hitch.graphics, presets.high, 'one large stall cannot decide the quality tier');

stored = null;
const isolated = await import('../src/graphics-settings.ts?benchmark-isolated-long-stall');
feed(isolated, 4);
clock += 2000; isolated.updateAutoGraphics(clock, true);
runCheck(isolated, { low: 16, medium: 16, high: 16 });
assert.deepEqual(isolated.graphics, presets.high, 'one multi-second active stall restarts sampling without a downgrade');

stored = null;
const stalled = await import('../src/graphics-settings.ts?benchmark-long-stalls');
feed(stalled, 3);
assert.match(stalled.autoGraphicsStatus(), /Checking High/);
feed(stalled, 15, 1500);
assert.deepEqual(stalled.graphics, presets.low, 'repeated visible active stalls fall back even during warmup');
assert.match(stalled.autoGraphicsStatus(), /complete.*Low/, 'a one-FPS device cannot stay stuck testing High');

stored = null;
const alternating = await import('../src/graphics-settings.ts?benchmark-alternating-stalls');
feed(alternating, 3);
for (let cycle = 0; cycle < 12; cycle++) {
  clock += 1500; alternating.updateAutoGraphics(clock, true);
  feed(alternating, .32);
}
assert.deepEqual(alternating.graphics, presets.low, 'brief fast frames between repeated stalls cannot keep a struggling tier alive');
assert.match(alternating.autoGraphicsStatus(), /complete.*Low/);

stored = JSON.stringify({ mode: 'auto', preset: 'high', checked: false }); coarse = true;
const pending = await import('../src/graphics-settings.ts?auto-pending-reload');
assert.deepEqual(pending.graphics, presets.low, 'an unfinished check reloads conservatively');
assert.match(pending.autoGraphicsStatus(), /queued/);
runCheck(pending, { low: 16, medium: 16, high: 16 });
assert.deepEqual(pending.graphics, presets.high, 'fast touch devices get High directly from the short check');

const manual = { ...presets.high, resolution: .75, effects: 'off' };
stored = JSON.stringify(manual);
const legacy = await import('../src/graphics-settings.ts?manual-frames');
assert.deepEqual(legacy.graphics, manual, 'valid legacy custom preferences remain exact');
assert.equal(feed(legacy, 120, 80), 0, 'checks never override saved manual choices');
assert.deepEqual(legacy.graphics, manual);
assert.equal(legacy.autoGraphicsStatus(), '');
coarse = false;
for (const [key, value] of [['hardwareConcurrency', 2], ['deviceMemory', 2]]) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { [key]: value } });
  stored = null;
  assert.deepEqual((await import(`../src/graphics-settings.ts?limited-${key}`)).graphics, presets.low, 'limited hardware starts with Low');
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
for (const value of ['{broken', 'null', '[]', '{"mode":"auto","preset":"ultra","checked":true}', '{"resolution":0.5}']) {
  stored = value;
  const fallback = await import(`../src/graphics-settings.ts?invalid-${encodeURIComponent(value)}`);
  assert.deepEqual(fallback.graphics, presets.medium);
  assert.match(fallback.autoGraphicsStatus(), /queued/, 'invalid preferences safely queue a fresh check');
}
failStorage = true; stored = null;
const blocked = await import('../src/graphics-settings.ts?auto-blocked');
runCheck(blocked, { low: 16, medium: 18, high: 40 });
assert.deepEqual(blocked.graphics, presets.medium, 'the check works when persistence is blocked');
failStorage = false;

// User interaction cancels checks; explicit rerun and Defaults opt back in.
const original = await import('../src/graphics-settings.ts');
change('preset', 'auto');
feed(original, 3);
change('effects', 'off');
assert.equal(feed(original, 100, 80), 0);
assert.equal(original.autoGraphicsStatus(), '');
assert.deepEqual(JSON.parse(stored), graphics);
nodes.get('#graphics-check').dispatchEvent(new Event('click'));
assert.equal(nodes.get('#graphics-preset').value, 'auto');
assert.match(nodes.get('#graphics-status').textContent, /Close Settings/);
assert.equal(feed(original, 10, 16, false), 0, 'Run performance check queues until Settings closes');
runCheck(original, { low: 16, medium: 16, high: 16 });
assert.match(original.renderGraphicsSettings(), /Check again/);
assert.deepEqual(graphics, presets.high);
assert.equal(graphics, identity);
console.log('PASS graphics: short High-first performance checks, target FPS selection, early fallback, isolated stalls and paused/resumed windows, exact measured-result persistence, manual ownership, explicit reruns, blocked storage, stable controls and accessible labels.');
