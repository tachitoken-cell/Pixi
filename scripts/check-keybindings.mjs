import assert from 'node:assert/strict';

let stored = null, storageDenied = false;
globalThis.localStorage = {
  getItem(key) { assert.equal(key, 'mossvale-keybindings'); if (storageDenied) throw Error('denied'); return stored; },
  setItem(key, value) { assert.equal(key, 'mossvale-keybindings'); if (storageDenied) throw Error('denied'); stored = value; },
};
const { KEY_ACTIONS, bindings, normalizeKeybindings: normalize, gameKey, bindingLabel, bindingLabels, renderKeybindings, mountKeybindings } = await import('../src/keybindings.ts');
const defaults = structuredClone(bindings), identity = bindings;
assert.equal(KEY_ACTIONS.length, 35);
for (const action of KEY_ACTIONS) for (const code of action.defaults) if (code) assert.equal(gameKey({ code, key: '' }), action.key);
assert.equal(gameKey({ code: 'ArrowUp', key: 'ArrowUp' }), 'w');
for (const side of ['Left', 'Right']) {
  assert.equal(gameKey({ code: `Shift${side}`, key: 'Shift' }), 'shift');
  assert.equal(gameKey({ code: `Control${side}`, key: 'Control' }), 'control');
}
assert.equal(gameKey({ code: '', key: 'W' }), 'w');
assert.equal(gameKey({ code: '', key: ' ' }), ' ');
assert.equal(gameKey({ code: '', key: 'shift' }), 'shift');
assert.equal(gameKey({ code: '', key: 'tab' }), 'tab');
assert.equal(gameKey({ code: '', key: 'escape' }), 'escape');
assert.equal(gameKey({ code: '', key: 'enter' }), 'enter');
for (const code of ['Escape', 'Enter', 'NumpadEnter']) assert.equal(gameKey({ code, key: '' }), code === 'Escape' ? 'escape' : 'enter');
for (const code of ['MetaLeft', 'MetaRight', 'F5', 'F11', 'F12', 'KeyW<script>', '__proto__']) assert.equal(gameKey({ code, key: '' }), undefined);
for (const value of [null, [], true, 'oops', { forward: ['Enter', null] }, { options: ['KeyW', null] }, { options: ['KeyQ', 'KeyQ'] }, Object.create({ forward: [null, null] })]) assert.deepEqual(normalize(value), defaults);
assert.deepEqual(normalize({ forward: [null, null] }).forward, [null, null], 'explicit clearing survives normalization');
assert.deepEqual(normalize({ sprint: ['ShiftRight', null] }).sprint, ['Shift', null]);
assert.deepEqual(normalize({ sprint: ['ShiftLeft', 'ShiftRight'] }), defaults, 'side modifiers cannot be duplicate bindings');
const oldBindings=structuredClone(defaults);delete oldBindings.hotbarBank;oldBindings.slot1=['Backquote','KeyQ'];
assert.deepEqual(normalize(oldBindings),{...oldBindings,hotbarBank:[null,null]},'adding a bank shortcut preserves every old binding even when its default was customized');
const oldDigits=structuredClone(defaults);delete oldDigits.slot9;delete oldDigits.slot10;oldDigits.slot1=['Digit9','Digit0'];
assert.deepEqual(normalize(oldDigits),{...oldDigits,slot9:[null,null],slot10:[null,null]},'new digit defaults cannot reset existing custom bindings');
assert.equal(bindingLabel('w'), 'W'); assert.equal(bindingLabels('w'), 'W / Up');
assert.equal(bindingLabel('options'), 'Unbound');
stored = '{oops'; assert.deepEqual((await import('../src/keybindings.ts?broken')).bindings, defaults);
storageDenied = true; assert.deepEqual((await import('../src/keybindings.ts?denied')).bindings, defaults); storageDenied = false;

class Element extends EventTarget {
  constructor(dataset = {}) { super(); this.dataset = dataset; this.hidden = false; this.textContent = ''; }
  setAttribute(key, value) { this[key] = value; }
}
const nodes = new Map(), buttons = [];
for (const [, id] of renderKeybindings().matchAll(/id="([^"]+)"/g)) nodes.set(`#${id}`, new Element());
for (const action of KEY_ACTIONS) for (const slot of ['0', '1']) buttons.push(new Element({ bindAction: action.id, bindSlot: slot }));
const tabs = [new Element(), new Element()], page = new Element(), dialog = new Element();
nodes.set('[data-settings-page="keybindings"]', page);
const root = Object.assign(new Element(), { querySelector: selector => nodes.get(selector), querySelectorAll: selector => selector === '[data-bind-action]' ? buttons : tabs, closest: () => dialog });
Object.defineProperty(root, 'innerHTML', { set() { assert.fail('capture cannot rebuild controls'); } });
let changes = 0, escapedToGameplay = 0;
mountKeybindings(root, () => changes++);
root.addEventListener('keydown', () => escapedToGameplay++);
const click = element => element.dispatchEvent(new Event('click'));
const choose = (id, slot = '0') => click(buttons.find(button => button.dataset.bindAction === id && button.dataset.bindSlot === slot));
const key = (code, value = code, extra = {}) => { const event = Object.assign(new Event('keydown', { cancelable: true }), { code, key: value, ...extra }); root.dispatchEvent(event); return event; };
const status = () => nodes.get('#keybindings-status').textContent;
choose('slot1'); assert(key('KeyQ', 'q').defaultPrevented); assert.equal(gameKey({ code: 'KeyQ', key: 'q' }), '1');
assert.equal(gameKey({ code: 'Digit1', key: '1' }), undefined); assert.equal(bindingLabel('1'), 'Q');
assert.equal(escapedToGameplay, 0, 'capture stops gameplay listeners');
assert.equal(changes, 1); assert.deepEqual(JSON.parse(stored), bindings);
choose('options'); key('KeyQ', 'q'); assert.match(status(), /already assigned to Hotbar slot 1/); assert.deepEqual(bindings.options, [null, null]);
assert(key('Escape', 'Escape').defaultPrevented); assert.match(status(), /cancelled/); assert.equal(changes, 1);
choose('slot1'); click(nodes.get('#keybindings-clear')); assert.deepEqual(bindings.slot1, [null, null]); assert.equal(bindingLabel('1'), 'Unbound');
choose('options'); key('KeyQ', 'q'); assert.equal(gameKey({ code: 'KeyQ', key: 'q' }), 'options');
choose('slot2'); for (const code of ['Enter', 'MetaLeft', 'F5', 'F11', 'F12', '__proto__']) { key(code); assert.match(status(), /reserved or unsupported/); }
for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }]) { key('KeyR', 'r', extra); assert.match(status(), /one key without/); assert.equal(bindingLabel('2'), '2'); }
key('ControlLeft', 'Control', { ctrlKey: true }); assert.match(status(), /already assigned to Fly down/, 'a modifier alone is a supported binding');
click(nodes.get('#keybindings-cancel')); assert.equal(bindingLabel('2'), '2');
choose('options', '1'); key('AltRight', 'Alt'); assert.equal(gameKey({ code: 'AltLeft', key: 'Alt' }), 'options');
choose('slot2'); click(tabs[0]); assert(nodes.get('#keybindings-capture-tools').hidden); assert.match(status(), /cancelled/);
choose('slot2'); page.hidden = true; key('KeyR', 'r'); assert.equal(bindingLabel('2'), '2'); page.hidden = false;
choose('slot2'); dialog.dispatchEvent(new Event('close')); assert(nodes.get('#keybindings-capture-tools').hidden);
storageDenied = true; choose('slot2'); key('KeyR', 'r'); assert.equal(bindingLabel('2'), 'R'); assert.match(status(), /session.*unavailable/);
for (const code of ['F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10']) { choose('slot2'); key(code); assert.equal(bindingLabel('2'), code); }
storageDenied = false; click(nodes.get('#keybindings-defaults')); assert.deepEqual(bindings, defaults); assert.equal(bindings, identity);
for (const button of buttons) assert.notEqual(button.textContent, 'Press key…');
assert.deepEqual(JSON.parse(stored), defaults);
console.log('PASS keybindings: primary/secondary defaults, arrows and modifiers, fixed safety keys, physical remapping, safe storage, conflict rejection, stable capture/clear/cancel/defaults, navigation and dialog cleanup.');
