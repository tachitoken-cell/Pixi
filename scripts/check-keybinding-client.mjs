import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript';
import { bindings, normalizeKeybindings, gameKey } from '../src/keybindings.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const listener = (owner, type) => tree.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
  && node.expression.expression.getText(tree) === `${owner}.addEventListener` && node.expression.arguments[0]?.text === type)?.getText(tree);
const clear = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'clearMovementKeys');
assert(clear, 'the client shares one keyboard and physical-key reset');
class Element { closest() { return null; } }
class Input extends Element {}
class Select extends Element {}
class Textarea extends Element {}
class Button extends Element {}
class Summary extends Element { closest(selector) { return selector.split(',').some(value => ['summary', '#chat-preview'].includes(value.trim())) ? this : null; } }
const original = structuredClone(bindings);
const fixture = () => {
  const handlers = {}, calls = [], keys = new Set(), heldKeyCodes = new Map();
  const ctx = { worldLoading: false, keys, heldKeyCodes, gameKey, player: {}, standingChairId: null, cancelledCast: null, autoAttackTarget: null, selectedId: null, hoveredId: null,
    HTMLElement: Element, HTMLInputElement: Input, HTMLSelectElement: Select, HTMLTextAreaElement: Textarea, HTMLButtonElement: Button,
    modal: false, flying: false, modalOpen: () => ctx.modal, gmFlying: () => ctx.flying, floatingPanel: () => true,
    panel: { open: false, contains: target => !!target?.inPanel, dataset: { mode: 'gear' } },
    storeUI: { isOpen: () => false }, achievementsUI: { isOpen: () => false }, friendsUI: { isOpen: () => false }, pollUI: { isOpen: () => false },
    gmUI: { isOpen: () => false }, lootUI: { isOpen: () => false }, bankUI: { isOpen: () => false },
    cancelGathering() {}, standUp() {}, cancelCasting() {}, setAutoAttack() {}, closePanel() {},
    act: action => calls.push(action), tryJump: () => calls.push('jump'), openSettings: () => calls.push('options'),
    toggleBackpack: () => calls.push('backpack'), selectNextFoe: () => calls.push('target'),
    hotbar: { activateSlot: slot => calls.push(`slot${slot + 1}`), cancel() {} }, pointerInWorld: false,
    canvas: { style: {} }, performanceHud: { reset() {} },
    window: { addEventListener: (type, handler) => handlers[type] = handler }, document: { addEventListener: (type, handler) => handlers[type] = handler },
  };
  runInNewContext(stripTypeScriptTypes([clear.getText(tree), listener('window', 'keydown'), listener('window', 'keyup'), listener('window', 'blur'), listener('document', 'visibilitychange')].join('\n')), ctx);
  const fire = (type, code, key, extra = {}) => { const event = { code, key, target: new Element(), repeat: false, isComposing: false, metaKey: false, ctrlKey: false, altKey: false,
    prevented: false, preventDefault() { this.prevented = true; }, ...extra }; handlers[type](event); return event; };
  return { ctx, calls, keys, heldKeyCodes, handlers, down: (code, key, extra) => fire('keydown', code, key, extra), up: (code, key, extra) => fire('keyup', code, key, extra) };
};
try {
  Object.assign(bindings, normalizeKeybindings(null));
  bindings.forward = ['KeyQ', 'ArrowUp'];
  const movement = fixture();
  movement.down('KeyW', 'w'); assert(!movement.keys.has('w'), 'the old physical movement key stops working');
  assert(movement.down('KeyQ', 'q').prevented); assert(movement.keys.has('w'));
  movement.down('ArrowUp', 'ArrowUp'); movement.up('KeyQ', 'q'); assert(movement.keys.has('w'), 'releasing one alternate preserves the other held key');
  movement.up('ArrowUp', 'ArrowUp'); assert(!movement.keys.has('w'));
  movement.down('KeyQ', 'q'); bindings.forward = ['KeyR', 'ArrowUp']; movement.up('KeyQ', 'q'); assert(!movement.keys.has('w'), 'keyup releases the original action after a binding changes');
  movement.down('KeyR', 'r'); movement.ctx.clearMovementKeys(); assert.equal(movement.keys.size, 0); assert.equal(movement.heldKeyCodes.size, 0);
  for (const event of ['blur', 'visibilitychange']) { movement.down('KeyR', 'r'); movement.handlers[event](); assert.equal(movement.keys.size + movement.heldKeyCodes.size, 0); }
  movement.keys.add('touch-move'); movement.up('KeyQ', 'q'); assert(movement.keys.has('touch-move'), 'keyboard releases preserve unrelated touch input');
  movement.ctx.clearMovementKeys(); movement.down('', 'R'); movement.up('', 'r'); assert.equal(movement.keys.size, 0, 'legacy events without code release across letter case');

  bindings.slot1 = ['KeyQ', null]; bindings.options = ['KeyL', null]; bindings.jump = ['KeyZ', null]; bindings.interact = ['Space', null];
  const actions = fixture();
  actions.down('Digit1', '1'); assert.deepEqual(actions.calls, []);
  actions.down('KeyQ', 'q'); actions.down('KeyQ', 'q', { repeat: true }); assert.deepEqual(actions.calls, ['slot1'], 'remapped slots fire once per press');
  actions.down('KeyL', 'l'); actions.down('KeyZ', 'z'); assert.deepEqual(actions.calls, ['slot1', 'options', 'jump']);
  assert(actions.down('Space', ' ').prevented, 'a physical scrolling key rebound to interact cannot also scroll the page'); assert.equal(actions.calls.at(-1), 'gather');
  for (const extra of [{ metaKey: true }, { isComposing: true }, { target: new Input() }, { target: new Select() }, { target: new Textarea() }, { target: Object.assign(new Element(), { isContentEditable: true }) }]) {
    const count = actions.calls.length; actions.down('KeyQ', 'q', extra); assert.equal(actions.calls.length, count, 'typing and composing bypass gameplay shortcuts');
  }
  actions.ctx.modal = true; const beforeModal = actions.calls.length; actions.down('KeyQ', 'q'); actions.down('KeyR', 'r'); assert.equal(actions.calls.length, beforeModal); assert.equal(actions.keys.size, 0);
  actions.ctx.modal = false; const beforeButton = actions.calls.length;
  assert(!actions.down('Space', ' ', { target: new Button() }).prevented); assert.equal(actions.calls.length, beforeButton, 'focused buttons retain native activation');
  assert(!actions.down('Enter', 'Enter', { target: new Button() }).prevented);
  for (const [code, key] of [['Space', ' '], ['Enter', 'Enter'], ['Tab', 'Tab']])
    assert(!actions.down(code, key, { target: new Summary() }).prevented, 'chat disclosure keeps native activation and focus navigation');
  assert.equal(actions.calls.length, beforeButton, 'using the chat disclosure cannot trigger gameplay');
  bindings.target = [null, null]; bindings.forward = ['Tab', null];
  const focus = fixture(), panelButton = Object.assign(new Button(), { inPanel: true });
  assert(!focus.down('Tab', 'Tab', { target: panelButton }).prevented); assert.equal(focus.keys.size, 0, 'Tab navigation in a floating panel cannot start remapped movement');
  assert(focus.down('Tab', 'Tab').prevented); assert(focus.keys.has('w'), 'the same remapped Tab still moves when the world is focused'); focus.up('Tab', 'Tab');

  Object.assign(bindings, normalizeKeybindings(null));
  const modifiers = fixture();
  modifiers.down('KeyW', 'w', { ctrlKey: true }); assert.equal(modifiers.keys.size, 0, 'unbound browser Control chords do not start movement');
  modifiers.down('KeyW', 'w', { altKey: true }); assert.equal(modifiers.keys.size, 0);
  modifiers.down('ShiftLeft', 'Shift', { shiftKey: true }); modifiers.down('KeyW', 'W', { shiftKey: true }); assert(modifiers.keys.has('w') && modifiers.keys.has('shift'), 'sprinting and movement remain combinable');
  modifiers.ctx.clearMovementKeys(); modifiers.ctx.flying = true;
  modifiers.down('ControlLeft', 'Control', { ctrlKey: true }); modifiers.down('KeyW', 'w', { ctrlKey: true });
  assert(modifiers.keys.has('control') && modifiers.keys.has('w'), 'GM descent and horizontal flight remain combinable');
} finally { Object.assign(bindings, original); }
console.log('PASS: actual client handlers honor remaps, alternate holds, release/reset, one-shot repeats, native focus, modifier safety, options and hotbar bindings.');
