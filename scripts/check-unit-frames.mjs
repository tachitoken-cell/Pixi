import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountUnitFrames } from '../src/unit-frames.ts';

// Native DOM boundary only; the actual frame construction and snapshot updater run unchanged.
let writes = 0;
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.attributes = {}; this.events = new Map(); this.hidden = false;
    this.style = new Proxy({}, { set(target, key, value) { writes++; target[key] = value; return true; } });
    this.dataset = new Proxy({}, { set(target, key, value) { writes++; target[key] = value; return true; } });
  }
  append(...children) { this.children.push(...children); }
  set textContent(value) { writes++; this.text = String(value); }
  get textContent() { return this.text || ''; }
  setAttribute(key, value) { writes++; this.attributes[key] = String(value); }
  removeAttribute(key) { writes++; delete this.attributes[key]; if (key === 'data-unit-id') delete this.dataset.unitId; }
  addEventListener(type, callback) { this.events.set(type, [...(this.events.get(type) || []), callback]); }
  getBoundingClientRect() { return { left: 20, top: 20, width: 300, height: 102, bottom: 122 }; }
  fire(type, extra = {}) {
    const event = { type, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; }, ...extra };
    for (const callback of this.events.get(type) || []) callback(event); return event;
  }
  find(test) { if (test(this)) return this; for (const child of this.children) { const found = child.find(test); if (found) return found; } }
}
const oldDocument = globalThis.document, oldMouseEvent = globalThis.MouseEvent;
globalThis.document = { createElement: tag => new Element(tag) };
globalThis.MouseEvent = class { constructor(type, value) { this.type = type; Object.assign(this, value); } };
try {
  const root = new Element('section'), actions = [], ui = mountUnitFrames(root, {
    onPlayer: () => actions.push('player'), onTargetContext: event => actions.push(event), onTargetOfTarget: () => actions.push('focus'),
  });
  const frame = kind => root.find(node => node.id === (kind === 'player' ? 'profile' : `unit-${kind}`));
  const part = (kind, name) => frame(kind).find(node => node.className === name);
  const meter = kind => part(kind, 'unit-health');
  const player = { className:'Ranger', id: 'hero', name: 'A very long <script>adventurer</script> name', level: 25, hp: 75, maxHp: 100, subtitle: 'Ranger', disposition: 'self' };
  const enemy = { id: 'enemy', name: 'Root Warden', level: 30, hp: 500, maxHp: 2000, subtitle: 'World boss', disposition: 'hostile', boss: true, casting: { label: 'Root slam', progress: .375 } };
  assert(root.children.every(child => child.hidden), 'frames begin hidden');
  assert(root.hidden, 'container starts hidden until the player is available');
  assert.deepEqual(Object.keys(ui.canvases), ['player', 'target', 'focus']);
  for (const canvas of Object.values(ui.canvases)) { assert.equal(canvas.attributes['aria-hidden'], 'true'); assert.equal(canvas.width, 192); }
  ui.update(player, enemy, player);
  assert(!root.hidden, 'a player snapshot unhides the container');
  assert(root.children.every(child => !child.hidden));
  assert.equal(part('player', 'unit-name').id, 'player-name'); assert.equal(part('player', 'unit-subtitle').id, 'player-class'); assert.equal(part('player', 'unit-health-fill').id, 'hp-fill');
  assert.equal(part('player', 'unit-name').textContent, player.name); assert.equal(part('player', 'unit-name').title, player.name);
  assert(!root.find(node => node.tagName === 'script'), 'names are plain text, not parsed HTML');
  assert.equal(part('player', 'unit-class').textContent, 'Ranger');assert(!part('player','unit-class').hidden);assert(part('target','unit-class').hidden);
  assert.equal(part('player', 'unit-health-current').textContent, '75 / 100'); assert.equal(part('player', 'unit-health-percent').textContent, '75%');
  assert.equal(meter('player').attributes.role, 'meter'); assert.equal(meter('player').attributes['aria-valuemin'], '0');
  assert.equal(meter('player').attributes['aria-valuenow'], '75'); assert.equal(meter('player').attributes['aria-valuemax'], '100');
  assert.equal(part('player', 'unit-health-fill').style.width, '75%');
  assert.equal(frame('target').dataset.disposition, 'hostile'); assert.equal(frame('target').dataset.boss, 'true');
  assert.equal(part('target', 'unit-cast').attributes['aria-valuenow'], '37.5'); assert.equal(part('target', 'unit-cast-fill').style.width, '37.5%');
  assert.equal(part('target', 'unit-cast-label').textContent, 'Root slam');
  ui.update({...player,role:'gm'}, enemy, player);assert.equal(part('player','gm-badge').textContent,'GM');assert(!part('player','gm-badge').hidden);assert.equal(part('player','unit-name').textContent,player.name);
  ui.update(player, enemy, player);assert(part('player','gm-badge').hidden,'role loss is part of the cached update key');
  ui.update(player,{...enemy,effects:'Venom Arrow 3s'},player);assert.equal(part('target','unit-effects').textContent,'Venom Arrow 3s');assert(!part('target','unit-effects').hidden);
  ui.update(player,enemy,player);assert(part('target','unit-effects').hidden,'expired effects disappear');
  ui.update({...player,className:'Mage'},enemy,player);assert.equal(part('player','unit-class').textContent,'Mage');assert(frame('player').attributes['aria-label'].includes('Mage'),'class changes update the accessible summary');ui.update(player,enemy,player);
  const before = writes; ui.update(structuredClone(player), structuredClone(enemy), structuredClone(player));
  assert.equal(writes, before, 'identical snapshots do not rewrite DOM, styles or ARIA');
  assert.equal(ui.canvases.target, part('target', 'unit-portrait-canvas'), 'portrait canvases remain stable');
  ui.update({ ...player, hp: 150 }, { ...enemy, hp: -3, casting: { label: 'Root slam', progress: 5 } }, null);
  assert.equal(meter('player').attributes['aria-valuenow'], '100'); assert.equal(part('player', 'unit-health-fill').style.width, '100%');
  assert.equal(meter('target').attributes['aria-valuenow'], '0'); assert.equal(frame('target').dataset.dead, 'true');
  assert.equal(part('target', 'unit-cast').attributes['aria-valuenow'], '100'); assert(frame('focus').hidden);
  const npc = { id: 'npc', name: 'Merrick Ledger', subtitle: 'Auctioneer', disposition: 'friendly' };
  ui.update(player, npc, null); assert(meter('target').hidden, 'NPCs without health have no invented health bar');
  assert(part('target', 'unit-level').hidden); assert(part('target', 'unit-cast').hidden); assert.equal(meter('target').attributes['aria-valuenow'], undefined);
  for (const values of [{ hp: NaN, maxHp: 100 }, { hp: 10, maxHp: 0 }, { hp: 10, maxHp: Infinity }]) {
    ui.update(player, { ...npc, ...values }, null); assert(meter('target').hidden);
  }
  ui.update(player, null, player); assert(frame('target').hidden && frame('focus').hidden, 'target of target cannot outlive the target');
  ui.update(player, enemy, player);
  frame('player').fire('click'); frame('focus').fire('click'); assert.deepEqual(actions, ['player', 'focus']);
  const context = frame('target').fire('contextmenu', { clientX: 123, clientY: 45 }); assert(context.prevented && context.stopped); assert.equal(actions.at(-1), context);
  const keyboard = frame('target').fire('keydown', { key: 'F10', shiftKey: true }); assert(keyboard.prevented); assert.equal(actions.at(-1).clientX, 170); assert.equal(actions.at(-1).clientY, 122);
  assert(frame('target').fire('keydown', { key: 'Enter' }).prevented, 'keyboard activation opens target interaction');
  assert(!frame('target').fire('keydown', { key: 'w' }).stopped, 'movement keys still reach gameplay while a frame has focus');
  ui.clear(); assert(root.hidden && root.children.every(child => child.hidden));
  assert.equal(part('player', 'unit-class').textContent, '');assert(part('player','unit-class').hidden);
  assert.equal(part('player', 'unit-name').textContent, ''); assert.equal(frame('target').dataset.unitId, undefined); assert.equal(meter('player').attributes['aria-valuenow'], undefined);
  ui.update(player, null, null); assert(!root.hidden && !frame('player').hidden && frame('target').hidden);
  ui.update(null, enemy, player); assert(root.hidden, 'a missing player hides the container even if a target is stale');
  ui.update(player, null, null); assert(!root.hidden, 'frames reappear when the player returns');
  const css = readFileSync(new URL('../src/unit-frames.css', import.meta.url), 'utf8');
  assert(css.includes("url('/ui/unit-portrait-ring.png')") && css.includes("url('/ui/unit-panel.png')"), 'Blender-authored portrait ring and panel artwork are used');
  assert(css.includes('text-overflow:ellipsis') && css.includes('pointer-events:none') && css.includes('pointer-events:auto'));
  assert(css.includes('@media(max-width:1000px)') && css.includes('@media(max-width:600px)') && css.includes('@media(max-width:390px)'));
  assert(css.includes('body.at-entry #unit-frames') && css.includes('body.at-roster #unit-frames'), 'game frames stay out of login and character selection');
  assert(css.includes("url('/ui/redesign/player-status-source.webp')")&&css.includes('.unit-health-track')&&css.includes('.unit-cast-track'),'supplied player status artwork frames separate live health and casting tracks');
  console.log('Unit frames: actual/bounded health, absent stats, casts, friendly/hostile/boss state, safe names, stable portraits, cached updates, input callbacks and clearing passed.');
} finally { globalThis.document = oldDocument; globalThis.MouseEvent = oldMouseEvent; }
