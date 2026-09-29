import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { collisionSceneKey } from '../src/collision-context.ts';
import { HEARTHLING_NPC } from '../src/hearthling.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const functionText = name => {
  const node = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert(node, `client function ${name} exists`);
  return node.getText(tree);
};
const paint = tree.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(tree) === 'worldPaint'));
assert(paint, 'world transitions yield to the browser paint loop');
const execute = (text, context) => runInNewContext(stripTypeScriptTypes(text), context);
const settle = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

function fixture({ deferCollision = false } = {}) {
  const frames = [], calls = [], creations = [], collisionLoads = [], elements = new Map(), scene = new THREE.Scene(), oldMesh = new THREE.Group();
  scene.add(oldMesh);
  const old = { colliders: [], update() {}, dispose() { calls.push('dispose-old'); oldMesh.removeFromParent(); } };
  const create = (kind, staging, ...args) => {
    const instance = ctx.worldInstance;
    const mesh = new THREE.Group();
    staging.add(mesh);
    staging.background = new THREE.Color('#123456');
    staging.fog = new THREE.Fog('#123456', 1, 10);
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const handle = { colliders: [kind], villagers: new Map(), update() { calls.push(staging.background); }, dispose() { calls.push(`dispose-${kind}`); mesh.removeFromParent(); }, setDungeonState() {} };
    creations.push({ kind, staging, args, mesh, handle, resolve: (snapshot = true) => { if (snapshot) ctx.snapshotInstance = instance; resolve(handle); }, reject });
    calls.push(`create-${kind}`);
    return promise;
  };
  const ctx = {
    THREE, Date, scene, camera: {}, position: {}, serverOffset: 0, worldReady: true, worldLoading: false, entryActive: false, rosterActive: false, snapshotInstance: undefined,
    isInstantCombatInstance, instantCombat: null, usesArenaWorld: id => !!id?.startsWith('arena-') || isInstantCombatInstance(id), resetInstantCombat() {},
    currentDungeonRoom:undefined, updateDungeonRoomView() {}, worldZone: 'greenwood', worldInstance: null, worldDungeonKind: null, renderedInstance: null, zoneRevision: 0,
    currentCollisionScene: () => collisionSceneKey(ctx.worldInstance, ctx.dungeon?.kind),
    loadCollisionScene(key) {
      calls.push(`collision-${key}`);
      if (!deferCollision) return Promise.resolve();
      return new Promise((resolve, reject) => collisionLoads.push({ key, resolve, reject }));
    },
    syncCollisionState() { assert.equal(ctx.worldReady, false, 'collision state is applied before movement becomes ready'); calls.push('collision-state'); },
    zoneHandle: old, colliders: old.colliders, updateWorld: old.update, dungeon: { kind: 'rootvault', name: 'Rootvault' },
    dungeonAttackCues: { clear() {} }, panel: { open: false }, npcViews: new Map(), zoneMarkers: [], lastHUD: 'old',
    VILLAGE_NPCS: [], TRAINER_NPCS: [], GOLD_MERCHANT: { id: 'gold' }, CITY_SERVICE_NPCS: [], CITY_VENDORS: [],
    SHADY_MERCHANT: { id: 'shady' }, ZONES: [], ZEPPELIN_PORTS: [], DUNGEONS: [], POLL_BOOTHS: [], ARENA_ENTRANCE: {}, DUNGEON_EXIT: {},
    isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance: id => !!id?.startsWith('arena-'), getZone: id => ({ name: id, npc: { id: 'guide' } }),
    getDungeon: kind => ({ name: kind }), dungeonLayout: () => ({ objects: [], gates: [], portals: [] }), dungeonReturn: () => ({}),
    label: () => ({ remove() {} }),
    clearWaypoint() {}, closePanel() { ctx.panel.open = false; }, clearMovementKeys() { calls.push('clear-input'); },
    clearEntityViews() { ctx.snapshotInstance = undefined; calls.push('clear-entities'); },
    HTMLElement: class {}, document: { activeElement: null },
    $: id => { if (!elements.has(id)) elements.set(id, { hidden: true, inert: false, open: false, dataset: {}, showModal() { this.open = true; }, close() { this.open = false; } }); return elements.get(id); },
    openPanel() {}, icon: () => '',
    createArenaWorld: staging => create('arena', staging),
    createRaidWorld: staging => create('raid', staging), APOSTLE_RAID: { name: 'Horned Apostle' },
    createDungeonWorld: (staging, ...args) => create('dungeon', staging, ...args),
    createOverworld: staging => create('overworld', staging),
    STORY_OBJECTS:[], storyWorld:undefined, createStoryWorld:async()=>({dispose(){}}),
    dayNight: { update() {} }, applyGraphicsFog() {}, updateLocation() {},
    updateHUD() { calls.push('hud'); }, syncEntities() { calls.push('entities'); },
    requestAnimationFrame(callback) { frames.push(callback); },
    renderer: { compile() { assert(ctx.worldLoading, 'shader compilation stays covered'); calls.push('compile'); }, render() { assert(ctx.worldLoading, 'the first complete render stays covered'); calls.push('render'); } },
  };
  execute(`${paint.getText(tree)}\n${functionText('setWorldLoading')}\n${functionText('zoneError')}\n${functionText('switchZone')}`, ctx);
  const setLoading = ctx.setWorldLoading;
  ctx.setWorldLoading = (...args) => { setLoading(...args); calls.push(args[0] ? 'cover' : 'uncover'); };
  const frame = async () => { const ready = frames.splice(0); for (const callback of ready) callback(0); await settle(); };
  const paintFrame = async () => { await frame(); await frame(); };
  const finish = async () => { for (let n = 0; n < 12 && frames.length; n++) await frame(); };
  return { ctx, calls, creations, collisionLoads, scene, old, oldMesh, frame, paintFrame, finish };
}

// A cached transition can finish between telemetry ticks: discard both sides.
{
  const f = fixture(), states = [];
  f.ctx.inputActivity = { reset() { states.push(f.ctx.worldLoading); } };
  f.ctx.setWorldLoading(true);
  f.ctx.setWorldLoading(false);
  assert.deepEqual(states, [true, false], 'instance loading never blends browser input across worlds');
}

// Real transition code waits for assets, entity creation, shader compilation and a painted frame.
{
  const f = fixture({ deferCollision: true }), pending = f.ctx.switchZone('greenwood', 'dungeon-one');
  assert.equal(f.ctx.worldLoading, true);
  assert.equal(f.ctx.worldReady, false);
  assert.equal(f.ctx.$('instance-loading').hidden, false);
  assert.equal(f.ctx.$('instance-loading').open, true, 'the loading screen occupies the modal top layer');
  assert.equal(f.ctx.$('play-ui').inert, true, 'game UI is inert while a destination is loading');
  assert(f.calls.includes('clear-input') && f.calls.includes('clear-entities'));
  assert.equal(f.creations.length, 0, 'the cover paints before expensive world creation');
  await f.paintFrame();
  assert.equal(f.creations.length, 0, 'destination rendering waits for solid collision geometry');
  assert.equal(f.ctx.worldReady, false, 'collision downloads cannot permit unsupported movement');
  assert.equal(f.ctx.worldLoading, true);
  assert.equal(f.collisionLoads[0].key, 'dungeon-rootvault');
  f.collisionLoads[0].resolve(); await settle();
  const next = f.creations[0];
  assert.equal(next.kind, 'dungeon');
  assert.notEqual(next.staging, f.scene, 'asynchronous creation cannot expose partial geometry in the live scene');
  assert.equal(next.mesh.parent, next.staging);
  assert.equal(f.ctx.zoneHandle, f.old, 'the existing world survives until replacement assets are ready');
  assert.equal(f.ctx.worldLoading, true);
  next.resolve(false); await settle();
  assert.equal(f.ctx.worldLoading, true, 'asset completion alone cannot dismiss the cover');
  assert.equal(f.ctx.worldReady, false, 'assets without the destination snapshot are not ready');
  await f.paintFrame();
  assert.equal(f.ctx.worldLoading, true, 'slow snapshot delivery cannot expose an empty instance');
  f.ctx.snapshotInstance = 'dungeon-other'; await f.paintFrame();
  assert.equal(f.ctx.worldReady, false, 'a snapshot from another instance cannot satisfy readiness');
  f.ctx.snapshotInstance = 'dungeon-one';
  assert.equal(f.oldMesh.parent, null);
  await f.finish(); await pending;
  assert.equal(f.ctx.worldReady, true);
  assert(f.calls.includes('hud') && f.calls.includes('entities'), 'destination entities are synchronized before exposure');
  assert.equal(f.ctx.worldLoading, false);
  assert.equal(f.ctx.$('instance-loading').hidden, true);
  assert.equal(f.ctx.$('instance-loading').open, false);
  assert.equal(f.ctx.$('play-ui').inert, false);
  assert(f.calls.indexOf('entities') < f.calls.indexOf('compile'));
  assert(f.calls.indexOf('collision-state') < f.calls.indexOf('compile'));
  assert(f.calls.indexOf('compile') < f.calls.indexOf('render'));
  assert(f.calls.indexOf('render') < f.calls.indexOf('uncover'));
}

// Crossing an overworld region reuses the scene without a loading-screen flash.
{
  const f = fixture();
  await f.ctx.switchZone('amberwild', null);
  assert.equal(f.ctx.zoneHandle, f.old);
  assert.equal(f.creations.length, 0);
  assert(!f.calls.includes('cover'));
}

// Startup behind the entry screen does not wait for an in-game character snapshot.
{
  const f = fixture();
  Object.assign(f.ctx, { entryActive: true, zoneHandle: undefined });
  const pending = f.ctx.switchZone('greenwood', null);
  await f.paintFrame(); f.creations[0].resolve(false); await settle(); await f.finish(); await pending;
  assert.equal(f.ctx.worldReady, true);
  assert.equal(f.ctx.$('instance-loading').hidden, true);
  assert.equal(f.ctx.$('play-ui').inert, true);
}

for (const selector of ['arena', 'raid', 'dream', 'overworld']) {
  const f = fixture();
  if (selector === 'overworld') Object.assign(f.ctx, { worldInstance: 'dungeon-old', renderedInstance: 'dungeon-old', worldDungeonKind: 'rootvault' });
  if (selector === 'dream') f.ctx.dungeon = { kind: 'rootvault', dream: { kind: 'nightmare' }, objects: [] };
  const pending = f.ctx.switchZone('greenwood', selector === 'arena' ? 'arena-new' : selector === 'raid' ? 'raid-new' : selector === 'dream' ? 'dream-new' : null);
  await f.paintFrame();
  const next = f.creations[0];
  assert.equal(next.kind, selector === 'dream' ? 'dungeon' : selector);
  if (selector === 'dream') assert.deepEqual(next.args, ['rootvault', 'nightmare']);
  if (selector === 'raid') assert.deepEqual(f.calls.filter(call => typeof call === 'string' && call.startsWith('collision-')), Array.from({ length: 8 }, (_, i) => `collision-raid-${i}`), 'all raid room collisions load before entry');
  next.resolve(); await settle(); await f.finish(); await pending;
  assert.equal(f.ctx.worldLoading, false);
  if (selector === 'overworld') {
    f.scene.background = new THREE.Color('#abcdef');
    f.ctx.updateWorld(1);
    assert.equal(f.calls.at(-1), f.scene.background, 'overworld animation reads the current live sky after staging');
    f.ctx.zoneHandle.dispose();
    assert.equal(next.staging.parent, null, 'disposing a world also removes its staging scene');
  }
}

// An old collision download cannot construct or expose a superseded world.
{
  const f = fixture({ deferCollision: true }), first = f.ctx.switchZone('greenwood', 'dungeon-first');
  await f.paintFrame();
  const second = f.ctx.switchZone('greenwood', 'arena-second');
  await f.paintFrame();
  f.collisionLoads[0].resolve(); await first;
  assert.equal(f.creations.length, 0);
  assert.equal(f.ctx.worldLoading, true);
  f.collisionLoads[1].resolve(); await settle();
  assert.equal(f.creations[0].kind, 'arena');
  f.creations[0].resolve(); await settle(); await f.finish(); await second;
  assert.equal(f.ctx.renderedInstance, 'arena-second');
}

for (const staleError of [false, true]) {
  const f = fixture(), first = f.ctx.switchZone('greenwood', 'dungeon-first');
  await f.paintFrame();
  const stale = f.creations[0], second = f.ctx.switchZone('greenwood', 'arena-second');
  await f.paintFrame();
  const current = f.creations[1];
  if (staleError) stale.reject(Error('obsolete download failed')); else stale.resolve();
  await first;
  assert.equal(f.ctx.worldLoading, true, 'obsolete work cannot uncover the newer transition');
  assert.equal(f.ctx.zoneHandle, f.old, 'obsolete work cannot replace the active world');
  if (!staleError) assert.equal(stale.mesh.parent, null, 'discarded worlds release their geometry');
  current.resolve(); await settle(); await f.finish(); await second;
  assert.equal(f.ctx.renderedInstance, 'arena-second');
  assert.equal(f.ctx.worldLoading, false);
}

// An obsolete frame completion must not clear a newer loading screen either.
{
  const f = fixture(), first = f.ctx.switchZone('greenwood', 'dungeon-first');
  await f.paintFrame(); f.creations[0].resolve(); await settle();
  const second = f.ctx.switchZone('greenwood', 'arena-second');
  await f.paintFrame(); await f.finish(); await first;
  assert.equal(f.ctx.worldLoading, true);
  f.creations[1].resolve(); await settle(); await f.finish(); await second;
  assert.equal(f.ctx.worldLoading, false);
}

// Returning to the rendered world while another destination loads cancels that destination.
{
  const f = fixture(), outbound = f.ctx.switchZone('greenwood', 'arena-cancelled');
  await f.paintFrame();
  const back = f.ctx.switchZone('greenwood', null);
  await f.paintFrame();
  assert.equal(f.creations.length, 2, 'returning to an already-rendered instance still supersedes the pending transition');
  f.creations[0].resolve(); await outbound;
  assert.equal(f.ctx.worldLoading, true);
  f.creations[1].resolve(); await settle(); await f.finish(); await back;
  assert.equal(f.ctx.worldInstance, null);
  assert.equal(f.ctx.renderedInstance, null);
  assert.equal(f.ctx.worldLoading, false);
}

for (const [lifecycle, installed] of [['pauseConnection', false], ['showCharacterRoster', false], ['showCharacterRoster', true]]) {
  const f = fixture();
  Object.assign(f.ctx, {
    setActiveHostingRealm() {}, activeRealmId: 'eu', changingRealm: false, mountViews: new Map(), stopSessionRenewal: null, socket: null, reconnectTimer: undefined, connectionRevision: 0, clearTimeout,
    showShutdownWarning() {}, closeCharacterDeletion() {}, disposeMinimap() {}, clearSocialUI() {}, clearCombat() {}, updatePartyHUD() {},
    realmAvailable: false, realmOutageMessage: '', characterDeletion: null, customizer: { open: false, close() {} }, rosterCharacters: [], selectedCharacterId: null,
    panel: { open: false, close() {} }, renderRoster() {},
    document: { activeElement: null, body: { classList: { add() {}, remove() {} } } },
  });
  execute(functionText(lifecycle), f.ctx);
  const pending = f.ctx.switchZone('greenwood', 'dungeon-abandoned');
  await f.paintFrame();
  if (installed) {
    f.creations[0].resolve(false); await settle();
    assert.equal(f.ctx.renderedInstance, 'dungeon-abandoned');
    assert.equal(f.ctx.worldReady, false);
    assert.equal(f.ctx.worldLoading, true, 'the installed scene still waits for its first snapshot');
  }
  const revision = f.ctx.zoneRevision;
  f.ctx[lifecycle]({ characters: [], maxCharacters: 6 });
  assert(f.ctx.zoneRevision > revision, `${lifecycle} invalidates an unfinished world`);
  assert.equal(f.ctx.worldLoading, false);
  assert.equal(f.ctx.$('instance-loading').hidden, true);
  assert.equal(f.ctx.$('instance-loading').open, false, 'leaving gameplay releases the modal top layer');
  assert.equal(f.ctx.$('play-ui').inert, true, 'clearing the load screen cannot re-enable gameplay beneath login or roster');
  if (installed) await f.paintFrame(); else f.creations[0].resolve();
  await pending;
  if (!installed) assert.equal(f.ctx.zoneHandle, f.old, 'late asset completion cannot install a world after leaving gameplay');
  assert.equal(f.ctx.worldReady, false);
  if (installed) {
    f.ctx.rosterActive = false;
    const reentry = f.ctx.switchZone('greenwood', 'dungeon-abandoned');
    await f.paintFrame();
    assert.equal(f.creations.length, 2, 're-entering an installed but unfinished instance starts a fresh load');
    f.creations[1].resolve(); await settle(); await f.finish(); await reentry;
    assert.equal(f.ctx.worldReady, true);
    assert.equal(f.ctx.worldLoading, false);
    assert.equal(f.ctx.$('play-ui').inert, false);
  }
}

for (const failure of ['collision', 'download', 'render']) {
  const f = fixture({ deferCollision: failure === 'collision' }), pending = f.ctx.switchZone('greenwood', 'dungeon-failed').catch(error => { f.ctx.zoneError(); throw error; });
  const rejected = assert.rejects(pending, /controlled loading failure/);
  await f.paintFrame();
  if (failure === 'collision') f.collisionLoads[0].reject(Error('controlled loading failure'));
  else if (failure === 'download') f.creations[0].reject(Error('controlled loading failure'));
  else { f.ctx.renderer.render = () => { throw Error('controlled loading failure'); }; f.creations[0].resolve(); }
  await settle(); await f.finish(); await rejected;
  assert.equal(f.ctx.worldReady, false);
  assert.equal(f.ctx.worldLoading, false, 'the existing error/retry dialog is accessible after failure');
  assert.equal(f.ctx.$('instance-loading').open, false, 'failure closes the loading dialog before displaying recovery');
}

// Escape must not invoke the browser's stop-loading action while models are downloading.
{
  const listener = tree.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(tree) === 'window.addEventListener' && node.expression.arguments[0]?.text === 'keydown');
  assert(listener, 'the global gameplay keyboard handler exists');
  let keydown, processed = 0;
  class Element {}
  const closed = { isOpen: () => false };
  const ctx = { worldLoading: true, window: { addEventListener: (_, handler) => { keydown = handler; } },
    HTMLElement: Element, HTMLInputElement: Element, HTMLSelectElement: Element, HTMLTextAreaElement: Element, HTMLButtonElement: Element,
    nftUI: closed, storeUI: closed, achievementsUI: closed, friendsUI: closed, pollUI: closed, panel: { open: false },
    modalOpen: () => false, gameKey: () => { processed++; return null; }, setAutoAttack: () => { processed++; } };
  execute(listener.getText(tree), ctx);
  for (const key of ['Escape', 'w', '1', ' ', 'b']) {
    const event = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    keydown(event);
    if (key === 'Escape') assert.equal(event.defaultPrevented, true, 'Escape cannot abort in-flight asset downloads');
    assert.equal(processed, 0, `${key} cannot reach gameplay actions while the loading screen is active`);
  }
  ctx.worldLoading = false; keydown({ key: 'w' });
  assert.equal(processed, 1, 'normal gameplay keyboard processing resumes after loading');
}

console.log('PASS instance loading: actual transitions, delayed collision/assets/snapshots/first render, detached scenes, all instance selectors, overworld reuse, superseded loads, login/roster cancellation and failure recovery.');
