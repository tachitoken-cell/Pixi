import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { bindings, bindingLabel, gameKey } = await import('../src/keybindings.ts');
const { renderHotbar } = await import('../src/hotbar.ts');
const { refreshBindingHints } = await import('../src/ui.ts');
hook.deregister();
const original = structuredClone(bindings);
const source = name => readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
const event = (code, key, target = { closest: () => null }) => ({ code, key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} });
try {
  bindings.slot1 = ['KeyQ', null]; bindings.achievements = ['KeyZ', null]; bindings.interact = ['KeyR', null];
  const html = renderHotbar(['interact', null, null, null, null, null, null, null]);
  assert(html.includes('<kbd>Q</kbd>') && html.includes('Key Q') && html.includes('R also works'), 'hotbar hints use the current slot and interaction bindings');
  assert(!html.includes('<kbd>1</kbd>'));
  const assignments = [], context = { gameKey, page:0, pageSize:8, switchPage(){context.page=(context.page+1)%(16/context.pageSize);}, options: { canEdit: () => true }, armed: { ability: 'interact', source: null }, assign: (...args) => assignments.push(args), cancel() {} };
  const hotbarBody = source('hotbar').match(/container\.addEventListener\('keydown', event => \{([\s\S]*?)\n    \}\);/)[1];
  const assignKey = runInNewContext(stripTypeScriptTypes(`(event: KeyboardEvent) => {${hotbarBody}}`), context);
  assignKey(event('Digit1', '1')); assert.equal(assignments.length, 0, 'old slot key cannot assign after rebinding');
  assignKey(event('KeyQ', 'q', { closest: () => ({}) })); assert.equal(assignments.length, 0, 'typing a custom slot key cannot edit the hotbar');
  assignKey(event('KeyQ', 'q')); assert.deepEqual(assignments, [[0, 'interact', null]], 'custom slot key assigns the selected spell');
  class Element { constructor(editable = false) { this.editable = editable; } matches() { return this.editable; } }
  let closed = 0;
  const closeBody = source('achievements-ui').match(/panel\.addEventListener\('keydown', event => \{([^\n]+)\}\);/)[1];
  const closeKey = runInNewContext(stripTypeScriptTypes(`(event: KeyboardEvent) => {${closeBody}}`), { gameKey, HTMLElement: Element, close: () => closed++ });
  closeKey(event('KeyY', 'y', new Element())); assert.equal(closed, 0, 'old achievements key cannot close the panel');
  closeKey(event('KeyZ', 'z', new Element())); assert.equal(closed, 1, 'custom achievements key closes its panel');
  closeKey(event('KeyZ', 'z', new Element(true))); assert.equal(closed, 1, 'typing the custom key does not close the panel');
  closeKey(event('Escape', 'Escape', new Element(true))); assert.equal(closed, 2, 'Escape remains native panel dismissal');
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'isComposing']) {
    const slotEvent = { ...event('KeyQ', 'q'), [modifier]: true }, achievementEvent = { ...event('KeyZ', 'z', new Element()), [modifier]: true };
    assignKey(slotEvent); closeKey(achievementEvent);
    assert.equal(assignments.length, 1, `${modifier} cannot assign a slot`); assert.equal(closed, 2, `${modifier} cannot close achievements`);
    assert(!slotEvent.defaultPrevented && !achievementEvent.defaultPrevented, `${modifier} keeps browser/IME behavior`);
  }
  closeKey({ ...event('Escape', 'Escape', new Element(true)), isComposing: true }); assert.equal(closed, 2, 'Escape cancels composition without closing achievements');
  const hint = { dataset: { bindingKey: '1' }, textContent: '' };
  const button = { dataset: { bindingTitle: 'y', bindingName: 'Achievements' }, attributes: { 'aria-keyshortcuts': 'Y' }, setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; } };
  refreshBindingHints({ querySelectorAll: selector => selector === '[data-binding-key]' ? [hint] : [button] });
  assert.equal(hint.textContent, 'Q'); assert.equal(button.title, 'Achievements · Z'); assert.equal(button.attributes['aria-label'], 'Achievements, Z');
  assert(!Object.hasOwn(button.attributes, 'aria-keyshortcuts'), 'stale ARIA shortcuts are removed');
  bindings.slot1 = [null, null];
  assert(renderHotbar([null]).includes(`<kbd>${bindingLabel('1')}</kbd>`), 'unbound slots show their unbound state');
  bindings.slot1 = ['Alt', null]; assignKey({ ...event('AltLeft', 'Alt'), altKey: true });
  assert.equal(assignments.length, 2, 'a standalone modifier can still be an assigned key');
  bindings.slot2 = ['Delete', null];
  const deleteSlot = { dataset: { hotbarSlot: '1' }, closest: selector => selector === '[data-hotbar-slot]' ? deleteSlot : null };
  assignKey(event('Delete', 'Delete', deleteSlot));
  assert.equal(assignments.length, 3, 'Delete bound to a slot assigns exactly once');
  assert.deepEqual(assignments.at(-1), [1, 'interact', null], 'Delete assignment retains the ability instead of falling through to clear');
  bindings.slot1 = ['KeyQ', null];
  for (const pageSize of [8, 4]) {
    context.pageSize = pageSize; context.page = 0;
    assignKey({ ...event('Backquote', '`'), repeat: true });
    assert.equal(context.page, 0, `${pageSize}-slot bank key does not repeat`);
    for (let page = 0; page < 16 / pageSize; page++) {
      assert.equal(context.page, page);
      const before = assignments.length;
      assignKey(event('KeyQ', 'q')); assignKey(event(`Digit${pageSize}`, String(pageSize)));
      assert.deepEqual(assignments.slice(before), [[page * pageSize, 'interact', null], [(page + 1) * pageSize - 1, 'interact', null]], `${pageSize}-slot page ${page + 1} assigns its first and last saved slots`);
      if (pageSize === 4) {
        for (let slot = 5; slot <= 8; slot++) assignKey(event(`Digit${slot}`, String(slot)));
        assert.equal(assignments.length, before + 2, 'mobile ignores slot keys outside the visible four slots');
      }
      const nextPage = event('Backquote', '`'); assignKey(nextPage);
      assert(nextPage.defaultPrevented, 'bank switching consumes its keyboard shortcut');
    }
    assert.equal(context.page, 0, `${pageSize}-slot banks wrap after all 16 saved slots`);
  }
} finally { Object.assign(bindings, original); }
console.log('PASS: custom keys update hotbar/HUD hints and actual slot/achievement handlers across desktop/mobile banks; old keys and text input cannot trigger remapped actions.');
