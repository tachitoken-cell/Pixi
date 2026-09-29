import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { instantCombatMap } from '../src/instant-combat-maps.ts';
import { gameKey, bindingLabel } from '../src/keybindings.ts';
import { isArenaInstance, ARENA_BOUNDS } from '../src/arena.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { GM_FLY_SPEED, GM_FLY_MAX_HEIGHT } from '../src/gm.ts';
import { WORLD_BOUNDS, DUNGEON_BOUNDS } from '../src/realm.ts';
import { dungeonBounds } from '../src/dungeon.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const sent = [], context = { isInstantCombatInstance, instantCombatMap, instantCombat: null, GM_FLY_SPEED, GM_FLY_MAX_HEIGHT, WORLD_BOUNDS, DUNGEON_BOUNDS, dungeonBounds, dungeon: null,
  gameKey,bindingLabel,heldKeyCodes:new Map(),isRaidInstance,RAID_BOUNDS,isArenaInstance,ARENA_BOUNDS,connected: true, player: { role: 'gm', gm: { flying: true } }, keys: new Set(),
  position: { x: 0, z: 8 }, jump: { y: 5, velocity: 0, grounded: false }, worldInstance: null,
  rotation: 0, jumpFloor: () => 0, sprintSinceMove: true, WebSocket: { OPEN: 1 },
  socket: { readyState: 1, send: raw => sent.push(JSON.parse(raw)) }, toast() {} };
runInNewContext(source.match(/^function currentWorldBounds.*$/m)[0],context);
runInNewContext(source.match(/^function clearMovementKeys.*$/m)[0], context);
for (const [start, end] of [['function gmFlying(){', 'function travelSpeed(){'],
  ['function moveGmFlight(', 'const labelPosition='], ['function send(', 'function snapWorldPosition(']]) {
  runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf(start), source.indexOf(end))), context);
}

context.keys.add(' ');
assert(context.moveGmFlight(1, 1, .05));
assert(Math.abs(Math.hypot(context.position.x, context.position.z - 8, context.jump.y - 5) - GM_FLY_SPEED * .05) < 1e-9,
  'diagonal ascent shares the 3D speed budget');
assert.equal(context.jump.velocity, 0); assert.equal(context.jump.grounded, false);
context.send({ type: 'move', x: context.position.x, z: context.position.z, rotation: 0 });
assert.equal(sent.at(-1).y, context.jump.y); assert.equal(sent.at(-1).sprint, false);
assert.equal(context.sprintSinceMove, false);

context.keys.clear(); context.keys.add('control'); context.jump.y = .1;
context.moveGmFlight(0, 0, .05); assert.equal(context.jump.y, 0, 'descent stops on the floor');
context.keys.clear(); context.keys.add(' '); context.jump.y = GM_FLY_MAX_HEIGHT;
assert.equal(context.moveGmFlight(0, 0, .05), false, 'altitude is capped');
context.keys.clear(); context.jump.y = 5; context.position.x = WORLD_BOUNDS.maxX;
assert.equal(context.moveGmFlight(1, 0, .05), false, 'world edge is bounded');
context.worldInstance = 'vault'; context.position.x = DUNGEON_BOUNDS.maxX;
assert.equal(context.moveGmFlight(1, 0, .05), false, 'instance edge is bounded');
context.position.x = 0;
context.jumpFloor = x => x > 0 ? 10 : 0;
assert.equal(context.moveGmFlight(1, 0, .05), false, 'rise before crossing higher terrain');
context.jumpFloor = () => 0;
const before = context.position.z;
context.moveGmFlight(0, 1, 30);
assert(Math.abs(context.position.z - before - GM_FLY_SPEED * .05) < 1e-9, 'suspended tabs cannot spend a long frame as flight credit');

for (const state of [{ role: 'player', gm: { flying: true } }, { role: 'gm', gm: { flying: false } }]) {
  context.player = state;
  assert.equal(context.moveGmFlight(1, 0, .05), false);
  context.send({ type: 'move', x: 0, z: 8, rotation: 0 });
  assert(!Object.hasOwn(sent.at(-1), 'y'), 'normal movement never emits client altitude');
}
context.player = { role: 'gm', gm: { flying: true } }; context.connected = false;
assert.equal(context.moveGmFlight(1, 0, .05), false, 'disconnect stops flight prediction');

// Execute the real key handler and GM acknowledgement branch: button Space remains
// native until the server replies, then the next Space controls flight on the canvas.
class Element { closest() { return null; } focus() { context.activeElement = this; } }
class Button extends Element {}
Object.assign(context, { worldLoading: false, HTMLElement: Element, HTMLButtonElement: Button,
  HTMLInputElement: class extends Element {}, HTMLSelectElement: class extends Element {}, HTMLTextAreaElement: class extends Element {},
  panel: { open: false }, modalOpen: () => false, canvas: new Element(),
  gmUI: { result(message) { context.acknowledged = message; } }, msg: { success: true, text: 'Flight enabled.' },
  window: { addEventListener(type, handler) { assert.equal(type, 'keydown'); context.keydown = handler; } } });
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf("window.addEventListener('keydown',e=>{"), source.indexOf('const canUseMobile='))), context);
const acknowledge = () => runInNewContext(source.slice(source.indexOf('   gmUI.result(msg);'), source.indexOf("  } else if(msg.type==='gmLootTrace')")), context);
const key = value => { const event = { key: value, target: context.activeElement, preventDefault() { this.prevented = true; } }; context.keydown(event); return event; };
context.connected = true; context.keys.clear(); const button = new Button(); button.focus();
assert(!key(' ').prevented); assert(!key('Enter').prevented); assert.equal(context.keys.size, 0, 'native button activation does not also move');
for (const success of [true, false]) {
  button.focus(); context.keys.add('w'); context.msg = { success, text: success ? 'GM action applied.' : 'GM action rejected.' }; acknowledge();
  assert.equal(context.acknowledged, context.msg); assert.equal(context.activeElement, context.canvas); assert.equal(context.keys.size, 0);
  assert(key(' ').prevented); assert(context.keys.has(' '), 'Space after an acknowledgement ascends instead of repeating the focused command');
  assert(key('Control').prevented); assert(context.keys.has('control')); context.keys.clear();
}
context.player = { role: 'player', gm: { flying: true } }; button.focus(); acknowledge();
assert.equal(context.activeElement, button, 'forged ordinary-player flags cannot invoke flight focus handling');
console.log('PASS GM flight client: 3D speed, ascent/descent, altitude/terrain/world/instance bounds, frame cap, authorized movement payload and native button-to-flight focus.');
