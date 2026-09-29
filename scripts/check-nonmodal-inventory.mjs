import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { gameKey, bindingLabel } from '../src/keybindings.ts';
import assert from 'node:assert/strict';
import { isArenaInstance } from '../src/arena.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { canTraverse, WORLD_BOUNDS } from '../src/realm.ts';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import * as THREE from 'three';
import { chooseTarget, isHostilePlayer, isHostileTarget, combatCompanionOwner, canSupportPlayer } from '../src/targeting.ts';
import { SPELLS, abilityValid, abilityUnlocked, spellCastTimeMs, legacyAbility, GLOBAL_ATTACK_MS, defaultHotbar } from '../src/spells.ts';
import { WALK_SPEED, SPRINT_SPEED, SWIM_SPRINT_SPEED, MOUNT_UNLOCK_LEVEL, mountSpeed, canSprint } from '../src/travel.ts';
import { starterGear, gearSpeedMultiplier, combatStats } from '../src/progression.ts';
import { onboardingFeatureUnlocked, onboardingLockReason } from '../src/onboarding.ts';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { createHotbar } = await import('../src/hotbar.ts');
const { renderTalents } = await import('../src/progression-ui.ts'); hook.deregister();
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
function between(start, end) { const a = main.indexOf(start), b = main.indexOf(end, a + start.length); assert(a >= 0 && b > a, `source boundary ${start}`); return main.slice(a, b); }

// Only the DOM/network boundary is simulated. Predicates, key/pointer handlers, movement and casting come from main.ts.
class Element {
  constructor(id = '', parent = null) {
    this.id = id; this.parent = parent; this.events = new Map(); this.dataset = {}; this.style = {}; this.captures = new Set();
    const classes = new Set(); this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value) };
  }
  addEventListener(name, listener) { const listeners = this.events.get(name) || []; listeners.push(listener); this.events.set(name, listeners); }
  contains(node) { for (let at = node; at; at = at.parent) if (at === this) return true; return false; }
  closest(selector) {
    if (selector === 'button') return this instanceof Button ? this : this.parent?.closest(selector) || null;
    if (selector === '#hotbar') return this.id === 'hotbar' ? this : this.parent?.closest(selector) || null;
    if (selector.includes('[data-book-ability]') && this.dataset.bookAbility !== undefined || selector.includes('[data-hotbar-slot]') && this.dataset.hotbarSlot !== undefined) return this;
    return this.parent?.closest(selector) || null;
  }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  focus() { runtime.document.activeElement = this; }
  setPointerCapture(id) { this.captures.add(id); }
  getBoundingClientRect() { return { left: 10, top: 10, right: 310, bottom: 400 }; }
  fire(type, properties = {}) {
    const event = { target: this, key: '', pointerId: 1, button: 0, clientX: 50, clientY: 50, deltaY: 20, defaultPrevented: false, stopped: false,
      dataTransfer: { effectAllowed: '', dropEffect: '', setData() {} }, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...properties };
    for (let at = this; at; at = event.stopped ? null : at.parent) for (const listener of at.events.get(type) || []) listener(event);
    return event;
  }
}
class Button extends Element {} class Input extends Element {} class Select extends Element {} class Textarea extends Element {}
const pendingClose = [];
class Dialog extends Element {
  open = false; modal = false; opens = []; closeCount = 0;
  show() { assert(!this.open || !this.modal, 'show cannot convert an open modal'); this.open = true; this.modal = false; this.opens.push('show'); }
  showModal() { assert(!this.open || this.modal, 'showModal cannot convert an open floating window'); this.open = true; this.modal = true; this.opens.push('showModal'); }
  close() { if (this.open) { this.open = false; this.closeCount++; pendingClose.push(() => this.fire('close')); } }
}
const window = new Element('window'), body = new Element('body', window), panel = new Dialog('panel', body), customizer = new Dialog('customizer', body);
const canvas = new Element('world', body), book = new Element('panel-content', panel), hud = new Element('hotbar', body), gearButton = new Button('gear', book);
gearButton.dataset.dragGear = 'veteran-bow';
const elements = new Map([['jump-button', new Button()],['panel-title', new Element()], ['panel-eyebrow', new Element()], ['chat', new Element()], ['chat-input', new Input()]]);
const sent = [], toggleCalls = [], hero = { id: 'test-hero', name: 'Hero', characterCreated: true, appearance: { className: 'Ranger' }, level: 1, hp: 50, maxHp: 100,
  inventory: { potion: 3 }, talents: [], abilityCooldowns: {}, hotbar: defaultHotbar('Ranger'), ...starterGear('Ranger') };
const foe = { id: 'foe', kind: 'enemy', x: 2, z: 0, alive: true };
let cancelled = 0, previewDisposals = 0, picks = 0, lootOpen = false;
const runtime = createContext({ specialistNftUI:undefined, updateDungeonRoomView() {}, worldLoading:false,charging:false,gameKey,bindingLabel,heldKeyCodes:new Map(),THREE, gearSpeedMultiplier, WALK_SPEED, SPRINT_SPEED, SWIM_SPRINT_SPEED, MOUNT_UNLOCK_LEVEL, mountSpeed, canSprint, SPELLS, abilityValid, abilityUnlocked, spellCastTimeMs, legacyAbility, GLOBAL_ATTACK_MS, chooseTarget, isHostilePlayer, isHostileTarget, combatCompanionOwner, canSupportPlayer, players: [], window, panel, customizer, canvas,
  combatStats, onboardingFeatureUnlocked, onboardingLockReason, isRaidInstance,RAID_BOUNDS,isArenaInstance,isInstantCombatInstance, canTraverse, WORLD_BOUNDS, colliders: [],
  HTMLElement: Element, HTMLButtonElement: Button, HTMLInputElement: Input, HTMLSelectElement: Select, HTMLTextAreaElement: Textarea,
  document: { body, activeElement: canvas, addEventListener: (...args) => body.addEventListener(...args), querySelector: () => null, querySelectorAll: () => [] },
  $: id => elements.get(id), entryActive: false, rosterActive: false, player: hero, appearance: hero.appearance, connected: true, worldReady: true,
  worldInstance: null, worldZone: 'greenwood', position: new THREE.Vector3(), rotation: 0, yaw: 0, pitch: .35, distance: 20,
  jump:{grounded:true,y:0,velocity:0,sequence:0}, jumpRequestedAt:-Infinity, tryJump:()=>sent.push({type:'jump'}), keys: new Set(), waypoint: null, selectedId: null, hoveredId: null, pointerInWorld: false, hoverPointer: new THREE.Vector2(),
  performance: { now: () => 10_000 }, serverOffset: 0, lastPrimary: -10_000, lastMove: 0, now: 20_000, dt: .05, isMoving: false, sprintSinceMove:false,
  cancelledCast: null, autoAttackTarget: null, lastAutoAttackRequest: -Infinity, storeUI: { isOpen: () => false }, nftUI: { isOpen: () => false }, achievementsUI: { isOpen: () => false }, friendsUI: { isOpen: () => false }, pollUI: { isOpen: () => false },
  waterAt: () => false, SWIM_SPEED: 3, freeAt: () => true, enemies: [foe], targetPoints: () => [foe], send: message => sent.push(message), tone() {}, toast() {},
  cancelQueuedShopSales() {}, cancelGathering: () => cancelled++, interactNearby: () => sent.push({ type: 'interact' }), clearGearDrag() {}, disposeAtlas() {}, disposeCharacterView: () => previewDisposals++, disposeBagPreview() {}, disposeWalletSettings() {}, disposeBagBalance() {}, disposeCollectionPreview: () => previewDisposals++, itemMenu: { close() {} }, lootUI: { close: () => { lootOpen=false; }, isOpen: () => lootOpen }, bankUI: { close() {}, isOpen: () => false }, gmUI: {close() {},isOpen:()=>false}, closeCustomizer() {},
  pickTarget: () => { picks++; return foe; }, pickPlayer: () => null,
  innerWidth: 1280, innerHeight: 720,
  toggleBackpack: () => toggleCalls.push('bag'), toggleCharacter: () => toggleCalls.push('character'),
  openContracts() {}, openParty() {}, openCrafting() {}, openMap() {},
  renderTalents, refreshTalentHover() {}, replacePanelContent: html => { book.innerHTML = html; },
  renderProfessions: () => { book.innerHTML = 'Professions'; }, renderSpells: () => { book.innerHTML = 'Combat'; },
});
const execute = source => runInContext(stripTypeScriptTypes(source), runtime);
execute(main.match(/^function clearMovementKeys.*$/m)[0]);
execute(between('function allowFeature(', 'function acknowledgeGuide('));
const predicates = between('const floatingPanel =', 'const canvas =');
const canEdit = main.match(/^\s*canEdit:(.*),$/m)?.[1]; assert(canEdit);
execute(`${predicates}\nglobalThis.modalOpen = modalOpen; globalThis.floatingPanel = floatingPanel; globalThis.canEdit = ${canEdit};`);
execute(between('function cancelCasting(', 'function clearInteraction('));
execute(between('function setAutoAttack(', 'function clearCombat('));
execute(between('let standingChairId:', 'function interactNearby('));
execute(between('function gmFlying()', 'function updateMountView('));
execute(between('function act(', 'let characterView:'));
const controller = createHotbar({ hud, book, canEdit: runtime.canEdit, cast: ability => runtime.act(ability), save: () => true, notify() {} }); controller.sync(hero); runtime.hotbar = controller;
execute(between('function closePanel(', 'function openJournal('));
execute(between("let skillTab:", 'function wireSkillTabs('));
execute(between('function openProfessions(', "let lastSpellBook="));
execute(between('function toggleTalents(', 'function openCharacter('));
execute(between("window.addEventListener('keydown'", 'const canUseMobile='));
execute(between("window.addEventListener('keyup'", 'let dragging=false'));
execute(between('let dragging=false', "canvas.addEventListener('webglcontextlost'"));
execute(between('for(const dialog of [panel,customizer])', "$('hotbar-customize')"));
const movement = between(' const able=connected', ' localAvatar.visible=');
const packetLine = main.split('\n').find(line => line.includes('if(able&&now-lastMove') && line.includes("send({type:'move'")); assert(packetLine);
const able = movement.match(/\bconst able=[^;]+;/)?.[0]; assert(able);
const packet = `{${able}${packetLine}}`;
const flushClose = () => { while (pendingClose.length) pendingClose.shift()(); };
const slot = new Button('slot', hud); slot.dataset.hotbarSlot = '0';

// A touch opener activates on pointerup. Its later compatibility click can land
// on the newly opened dialog, without a pointerdown ever starting on its backdrop.
const outside = { clientX: 500, clientY: 500, detail: 1 };
runtime.openPanel('Options', 'MOSSVALE', 'settings'); flushClose();
panel.fire('click', { ...outside, pointerType: 'touch' });
assert(panel.open, 'the Settings opener’s retargeted click must not immediately dismiss it');
for (const pointerType of ['touch', 'mouse']) {
  book.fire('pointerdown', { pointerType }); panel.fire('click', { ...outside, pointerType });
  assert(panel.open, 'dragging from content onto the backdrop does not dismiss the panel');
  panel.fire('pointerdown', { ...outside, pointerType }); panel.fire('pointercancel', { pointerType });
  panel.fire('click', { ...outside, pointerType }); assert(panel.open, 'a canceled backdrop press cannot dismiss the panel');
  panel.fire('pointerdown', { ...outside, pointerType }); panel.fire('click', { ...outside, pointerType });
  assert(!panel.open, 'a deliberate backdrop press and click still closes the panel'); flushClose();
  runtime.openPanel('Options', 'MOSSVALE', 'settings'); flushClose();
  panel.fire('click', { ...outside, pointerType }); assert(panel.open, 'backdrop dismissal cannot leak into the next opening');
}
panel.fire('pointerdown', outside); runtime.closePanel(); flushClose();
runtime.openPanel('Options', 'MOSSVALE', 'settings'); flushClose();
panel.fire('click', outside); assert(panel.open, 'closing resets an unfinished backdrop press');
runtime.closePanel(); flushClose();

for (const mode of ['gear', 'inventory', 'talents', 'inspect', 'mounts', 'training', 'shop', 'npc-talk']) {
  runtime.yaw = 0; runtime.keys = new Set(['w']); runtime.waypoint = { x: 30, z: 20, label: 'Objective', instanceId: null };
  const oldWaypoint = runtime.waypoint, oldCancel = cancelled;
  runtime.openPanel('Test', 'Test', mode); flushClose();
  assert.equal(panel.modal, false); assert.equal(panel.opens.at(-1), 'show'); assert(!body.classList.contains('menu-open'));
  assert.equal(runtime.modalOpen(), false); assert(runtime.canEdit());
  assert(runtime.keys.has('w') && runtime.waypoint === oldWaypoint, 'opening floating windows preserves held manual movement and the waypoint');
  assert.equal(cancelled, oldCancel, 'opening floating windows preserves movement and gathering');
  runtime.position.set(0, 0, 0); execute(`{${movement}}`); assert(runtime.position.z < 0 && runtime.isMoving, `${mode} permits actual WASD movement`);
  runtime.keys.clear(); const restingPosition = runtime.position.clone(); execute(`{${movement}}`);
  assert(runtime.position.equals(restingPosition) && !runtime.isMoving, 'a committed waypoint never moves the character without held movement keys');
  runtime.lastMove = 0; sent.length = 0; execute(packet); assert.equal(sent[0]?.type, 'move', `${mode} still sends movement to the server`);
  runtime.position.set(0, 0, 0); runtime.lastPrimary = -10_000; sent.length = 0;
  canvas.fire('keydown', { key: '1' }); assert.equal(sent.at(-1)?.type, 'attack'); assert.equal(sent.at(-1)?.ability, 'arrow');
  runtime.lastPrimary = -10_000; sent.length = 0; slot.fire('click'); assert.equal(sent.at(-1)?.type, 'attack', 'mouse hotbar remains usable beside floating windows');
  sent.length = 0; const beforeLockedCast = cancelled; runtime.act('volley');
  assert.equal(sent.length, 0, 'floating inventory never bypasses a spell unlock level');
  assert.equal(cancelled, beforeLockedCast, 'a locked spell never cancels gathering');
  sent.length = 0; canvas.fire('keydown', { key: '3' }); assert.equal(sent.at(-1)?.type, 'heal');
  sent.length = 0; canvas.fire('keydown', { key: 'e' }); assert.equal(sent.at(-1)?.type, 'interact');
  runtime.keys.clear(); const beforeMovementCancel = cancelled; gearButton.fire('keydown', { key: 'w' }); assert(runtime.keys.has('w'), 'WASD works after selecting an inventory item');
  assert.equal(cancelled, beforeMovementCancel + 1, 'manual movement still cancels an active gather');
  assert(!gearButton.fire('keydown', { key: 'Tab' }).defaultPrevented, 'Tab traverses inventory controls');
  assert(canvas.fire('keydown', { key: 'Tab' }).defaultPrevented); assert.equal(runtime.selectedId, foe.id, 'Tab still selects foes from the world');
  sent.length = 0; canvas.fire('keydown', { key: ' ' }); assert.equal(sent[0]?.type,'jump','Space jumps beside floating windows');
  sent.length = 0; gearButton.fire('keydown', { key: ' ' }); gearButton.fire('keydown', { key: 'Enter' }); assert.equal(sent.length, 0, 'native item-button activation never fires a combat shortcut');
  for (const field of [new Input('', book), new Select('', book), new Textarea('', book), Object.assign(new Element('', book), { isContentEditable: true })]) {
    runtime.keys.clear(); field.fire('keydown', { key: 'w' }); field.fire('keydown', { key: '1' }); assert.equal(runtime.keys.size, 0); assert.equal(sent.length, 0);
  }
  const beforePicks = picks, beforeYaw = runtime.yaw, beforeZoom = runtime.distance;
  gearButton.fire('pointerdown'); gearButton.fire('pointermove', { clientX: 100 }); gearButton.fire('pointerup'); gearButton.fire('wheel');
  assert.equal(picks, beforePicks); assert.equal(runtime.yaw, beforeYaw); assert.equal(runtime.distance, beforeZoom, 'UI clicks, drags and scrolling never operate the world camera');
  canvas.fire('pointerdown', { button: 2 }); canvas.fire('pointerup', { button: 2 }); assert.equal(picks, beforePicks, 'right-button pointer events do not duplicate the contextmenu action or walk');
  const beforeWorldClick = sent.length;
  canvas.fire('pointerdown'); canvas.fire('pointerup'); assert.equal(picks, beforePicks + 1, 'uncovered world geometry remains clickable');
  assert.equal(runtime.selectedId, foe.id); assert.equal(sent.length, beforeWorldClick, 'clicking world geometry only selects it without attacking or interacting');
  canvas.fire('pointerdown'); canvas.fire('pointermove', { clientX: 100 }); canvas.fire('pointerup', { clientX: 100 }); assert.notEqual(runtime.yaw, beforeYaw);
  canvas.fire('wheel'); assert.notEqual(runtime.distance, beforeZoom, 'uncovered world camera still orbits and zooms');
  assert(!gearButton.fire('dragstart').defaultPrevented, 'spellbook delegation must not cancel native gear dragging');
  runtime.lastPrimary = -10_000; sent.length = 0; slot.fire('click'); assert.equal(sent.at(-1)?.type, 'attack', 'gear drag does not arm or lock the hotbar');
  runtime.keys = new Set(['w']); const escape = gearButton.fire('keydown', { key: 'Escape' }); flushClose();
  assert(escape.defaultPrevented && !panel.open && runtime.keys.has('w'), 'Escape closes floating windows without cancelling held movement');
}

runtime.openPanel('Bags','Bags','inventory');flushClose();lootOpen=true;
runtime.keys=new Set(['w']);const lootEscape=gearButton.fire('keydown',{key:'Escape'});
assert(lootEscape.defaultPrevented&&!lootOpen&&panel.open&&runtime.keys.has('w'),'Escape closes corpse loot before the independently open bags without cancelling movement');

for (const mode of ['settings', 'map', 'spells', 'death', 'contracts']) {
  lootOpen=true;
  runtime.openPanel('Modal', 'Modal', mode); flushClose(); assert(panel.modal && runtime.modalOpen() && body.classList.contains('menu-open'));
  assert(!lootOpen,'opening a modal closes a lingering corpse loot window');
  runtime.keys = new Set(['w']); runtime.position.set(0, 0, 0); execute(`{${movement}}`); assert.equal(runtime.position.length(), 0);
  sent.length = 0; runtime.lastMove = 0; execute(packet); canvas.fire('keydown', { key: '1' }); runtime.act('heal'); assert.equal(sent.length, 0, 'true modal surfaces retain movement/cast guards');
  canvas.fire('keydown', { key: 'n' }); assert.equal(panel.dataset.mode, mode, 'N respects true modal surfaces');
  const prior = panel.closeCount; runtime.openPanel('Bag', 'Bag', 'inventory'); flushClose();
  assert.equal(panel.closeCount, prior + 1); assert(!panel.modal && !runtime.modalOpen() && !body.classList.contains('menu-open'), 'modality changes close and reopen the native dialog safely');
}

// Exercise the actual N toggle and K dispatcher, with only their unrelated category renderers stubbed.
for (const category of ['combat', 'professions']) {
  runtime.closePanel(); flushClose();
  execute(`skillTab = '${category}'`);
  runtime.keys = new Set(['w']); const oldCancel = cancelled, oldWaypoint = runtime.waypoint;
  const open = canvas.fire('keydown', { key: 'n' }); flushClose();
  assert(open.defaultPrevented && panel.open && panel.dataset.mode === 'talents' && !panel.modal && !runtime.modalOpen());
  assert.equal(elements.get('panel-title').textContent, 'Skill Tree');
  assert.equal(book.innerHTML, renderTalents(hero), 'N renders the real tree without combat/profession tabs');
  assert(!book.innerHTML.includes('data-skill-tab='));
  assert.equal(runInContext('skillTab', runtime), category, 'opening the tree preserves the remembered K category');
  assert(runtime.keys.has('w') && runtime.waypoint === oldWaypoint); assert.equal(cancelled, oldCancel);
  const closeCount = panel.closeCount;
  canvas.fire('keydown', { key: 'n', repeat: true });
  assert(panel.open && panel.closeCount === closeCount, 'holding N does not repeatedly toggle the tree');
  for (const field of [new Input('', book), new Select('', book), new Textarea('', book), Object.assign(new Element('', book), { isContentEditable: true })]) {
    field.fire('keydown', { key: 'n' }); assert(panel.open && panel.dataset.mode === 'talents', 'typing N leaves the tree open');
  }
  canvas.fire('keydown', { key: 'k' }); flushClose();
  assert.equal(panel.dataset.mode, category === 'combat' ? 'spells' : 'professions', 'K opens its remembered category independently of N');
  assert.equal(runInContext('skillTab', runtime), category);
  runtime.closePanel(); flushClose();
  for (const field of [new Input('', book), new Select('', book), new Textarea('', book), Object.assign(new Element('', book), { isContentEditable: true })]) {
    field.fire('keydown', { key: 'n' }); assert(!panel.open, 'typing N never opens a window');
  }
  canvas.fire('keydown', { key: 'n', repeat: true }); assert(!panel.open, 'repeated N cannot reopen a closed window');
  canvas.fire('keydown', { key: 'N' }); assert(panel.open && !panel.modal, 'uppercase N also opens the floating tree');
  runtime.keys = new Set(['w']);
  assert(gearButton.fire('keydown', { key: 'n' }).defaultPrevented); flushClose();
  assert(!panel.open && runtime.keys.has('w'), 'N closes the tree from a focused control without stopping held movement');
  assert.equal(runInContext('skillTab', runtime), category, 'closing the tree preserves the remembered K category');
}
assert(main.includes("$('talents-button').onclick=toggleTalents"), 'HUD tree button shares the keyboard toggle');

for (const [key, value] of [['entryActive', true], ['rosterActive', true], ['player', { ...hero, characterCreated: false }]]) {
  const previous = runtime[key]; runtime[key] = value; assert(runtime.modalOpen() && !runtime.canEdit());
  canvas.fire('keydown', { key: 'n' }); assert(!panel.open, 'N cannot open a tree before entering the world with a character'); runtime[key] = previous;
}
customizer.open = true; assert(runtime.modalOpen() && !runtime.canEdit()); customizer.open = false;
runtime.connected = false; assert(!runtime.canEdit()); sent.length = 0; runtime.act('heal'); assert.equal(sent.length, 0); runtime.connected = true;
runtime.player = { ...hero, hp: 0 }; sent.length = 0; runtime.act('heal'); assert.equal(sent.length, 0); runtime.player = hero;
canvas.fire('keydown', { key: 'b' }); canvas.fire('keydown', { key: 'c' }); assert.deepEqual(toggleCalls, ['bag', 'character']);
runtime.keys = new Set(['w']); window.fire('blur'); assert.equal(runtime.keys.size, 0, 'losing app focus still releases movement keys');
assert(previewDisposals > 0, 'opening and closing windows retains preview cleanup');
// Real movement and packet paths retain sprint intent when Shift is released between sends.
runtime.player={...hero,level:25,travel:{mount:null,stamina:100,exhausted:false,sprinting:false}};
runtime.keys=new Set(['w','shift']);runtime.position.set(0,0,0);runtime.worldInstance=null;
assert.equal(runtime.travelSpeed(),SPRINT_SPEED);execute(`{${movement}}`);assert(runtime.sprintSinceMove);
runtime.keys.delete('shift');runtime.WebSocket={OPEN:1};runtime.socket={readyState:1,send:raw=>sent.push(JSON.parse(raw))};
execute(between('function send(message:', 'function snapWorldPosition('));sent.length=0;
runtime.send({type:'move',x:runtime.position.x,z:runtime.position.z,rotation:0});assert.equal(sent[0].sprint,true);
runtime.send({type:'move',x:runtime.position.x,z:runtime.position.z,rotation:0});assert.equal(sent[1].sprint,false);
runtime.player.travel.exhausted=true;runtime.keys.add('shift');assert.equal(runtime.travelSpeed(),WALK_SPEED);
runtime.player.travel.mount='horse';assert.equal(runtime.travelSpeed(),10);runtime.player.level=50;assert.equal(runtime.travelSpeed(),14);
// Changing the selected companion while riding still makes H dismount, after flushing its final movement.
runtime.preferredMount='wolf';execute(between('function toggleMount(', 'const flightStatus='));sent.length=0;runtime.toggleMount();
assert.equal(sent[0].type,'move');assert.equal(sent[1].mount,null);assert.equal(runtime.player.travel.mount,null);
assert(between('if(data.rideMount!==undefined){', "if('startTreasureMap' in data)").includes('toggleMount(mount||preferredMount);'),'floating collection uses the same move flush');
console.log('Nonmodal inventory checked: native show/modal transitions, standalone N tree toggle and independent K category, typing/repeat guards, uninterrupted manual WASD/gathering and waypoint, server movement, keyboard/mouse hotbar, UI/world pointer isolation, gear drag, focus traversal, Escape and login/death guards.');
