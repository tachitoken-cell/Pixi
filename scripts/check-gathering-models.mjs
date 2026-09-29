import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadGatheringAssets, makeResource, showResource, makeWorkshop, WORKSHOP_MODELS } from '../src/resources.ts';
import { RESOURCE_TYPES, SKILLS, canGather, skillProgress } from '../src/skills.ts';
import { registerHooks } from 'node:module';
import { GATHERING_NODES, WORLD_GATHERING_NODES } from '../src/gathering-nodes.ts';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { renderSkills } = await import('../src/skills-ui.ts');
hook.deregister();

const kinds = ['crystal', 'timber', 'herb', 'copper-vein', 'cobalt-vein', 'sunstone-vein', 'silver-birch', 'ironwood', 'elderwood', 'moonpetal', 'frostbloom', 'sunblossom'];
const bytes = readFileSync(new URL('../public/models/gathering-kit.glb', import.meta.url));
const kit = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
const feedbackBytes = readFileSync(new URL('../public/models/world-feedback-kit.glb', import.meta.url));
const feedback = (await new GLTFLoader().parseAsync(feedbackBytes.buffer.slice(feedbackBytes.byteOffset, feedbackBytes.byteOffset + feedbackBytes.byteLength), '')).scene;
const resources = group => {
  const found = new Set();
  group.traverse(node => { if (node.isMesh) { found.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) found.add(material); } });
  return found;
};
const sourceResources = resources(kit), sourcePositions = new Map();
let sourceDisposals = 0;
for (const resource of sourceResources) resource.addEventListener('dispose', () => sourceDisposals++);
kit.traverse(node => { if (node.isMesh) sourcePositions.set(node.geometry, node.geometry.attributes.position.array.slice()); });
const original = GLTFLoader.prototype.loadAsync; let loads = 0;
GLTFLoader.prototype.loadAsync = async url => {
  if (url === '/models/world-feedback-kit.glb') return {scene:feedback};
  assert.equal(url, '/models/gathering-kit.glb'); loads++;
  return { scene: loads === 1 ? new THREE.Group() : kit };
};
try {
  await assert.rejects(loadGatheringAssets(), /Missing gathering model/, 'invalid source assets fail clearly');
  await Promise.all([loadGatheringAssets(), loadGatheringAssets()]); await loadGatheringAssets();
  assert.equal(loads, 2, 'failed loading can retry; successful concurrent startup is cached');
} finally { GLTFLoader.prototype.loadAsync = original; }
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const teardown = main.slice(main.indexOf('function removeNode('), main.indexOf('function replaceAvatar('));
assert(teardown.startsWith('function removeNode('), 'test uses the actual node teardown');
const context = vm.createContext({ THREE });
vm.runInContext(ts.transpileModule(teardown, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const scene = new THREE.Scene(); let meshCount = 0, triangles = 0;
for (const kind of kinds) {
  const info = RESOURCE_TYPES[kind], source = kit.getObjectByName(info.model);
  assert(source, `${kind} has its own authored model`);
  const icon = readFileSync(new URL(`../public/ui/gathering/${kind}.png`, import.meta.url));
  assert.equal(icon.subarray(1, 4).toString(), 'PNG');
  assert.equal(icon.readUInt32BE(16), 256); assert.equal(icon.readUInt32BE(20), 256);
  assert.equal(icon[25], 6, `${kind} has a transparent RGBA inventory icon`);
  assert(icon.length > 4_000, `${kind} icon contains a rendered silhouette`);
  assert.equal(source.userData.tier, [1, 10, 25, 50].indexOf(info.requiredLevel), `${kind} authored tier agrees with gameplay`);
  const base = source.getObjectByName(`${info.model}-base`), yieldPart = source.getObjectByName(`${info.model}-yield`);
  assert(base?.isMesh && yieldPart?.isMesh, `${kind} keeps separate base and harvestable geometry`);
  assert.equal(base.userData.harvestable, false); assert.equal(yieldPart.userData.harvestable, true);
  assert.equal(source.children.length, 2, `${kind} has two bounded draw parts`);
  const box = new THREE.Box3().setFromObject(source), size = box.getSize(new THREE.Vector3());
  assert(box.min.y >= -.002 && box.min.y <= .05, `${kind} rests on the ground`);
  assert(size.x > .2 && size.y > .4 && size.z > .2);
  for (const [axis, field] of [['x', 'width'], ['y', 'height'], ['z', 'depth']])
    assert(Number.isFinite(source.userData[field]) && size[axis] <= source.userData[field] + .02, `${kind} ${field} stays within its authored envelope`);
  assert(info.height >= box.max.y - .02, `${kind} target height covers its rendered silhouette`);
  source.traverse(node => { if (node.isMesh) { meshCount++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; assert(node.geometry.attributes.color, `${kind} uses its authored vertex palette`); } });
  const a = makeResource(kind), b = makeResource(kind), owned = resources(a), peer = resources(b); scene.add(a, b);
  assert.equal(a.children.length, 2);
  for (const resource of owned) { assert(!sourceResources.has(resource), 'node teardown cannot dispose cached source assets'); assert(!peer.has(resource), 'one depleted/removed node cannot damage another node'); }
  const initial = new THREE.Box3().setFromObject(a);
  showResource(a, false);
  assert.equal(a.getObjectByName(`${info.model}-base`).visible, false, 'depleted bases and stumps disappear');
  assert.equal(a.getObjectByName(`${info.model}-yield`).visible, false, 'depleted yield disappears');
  a.traverseVisible(part => assert(!part.isMesh, `${kind} has no visible geometry after harvest`));
  assert(b.children.every(child => child.visible), 'another node of the same kind stays available');
  showResource(a, true); assert(a.children.every(child => child.visible), 'regrowth restores all parts');
  assert(initial.equals(new THREE.Box3().setFromObject(a)), 'availability never distorts geometry');
  const disposed = new Map([...owned].map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  context.removeNode(a); assert.equal(a.parent, null);
  assert([...disposed.values()].every(count => count === 1), 'actual zone teardown disposes each owned buffer/material exactly once');
  context.removeNode(b);
  const restored = makeResource(kind); assert(restored.children.every(child => child.visible), 'a later zone entry starts from the intact source'); context.removeNode(restored);
}
assert.equal(meshCount, 24);
assert(bytes.length < 2_500_000, 'the complete gathering and station library stays below 2.5 MB');
assert(triangles < 45_000, 'all twelve resources stay below 45k triangles');
for (const [zone, name] of Object.entries(WORKSHOP_MODELS)) {
  const source = kit.getObjectByName(name), a = makeWorkshop(zone), b = makeWorkshop(zone);
  assert(source, `${zone} has its authored workshop`);
  const box = new THREE.Box3().setFromObject(a), size = box.getSize(new THREE.Vector3());
  assert(box.min.y >= -.002 && box.min.y <= .05, `${name} rests on the ground`);
  assert(size.x <= 4.4 && size.z <= 3.2 && size.y <= 3.6, `${name} fits the shared workshop collider`);
  let parts = 0, stationTriangles = 0;
  a.traverse(node => { if (node.isMesh) { parts++; stationTriangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; assert(node.geometry.attributes.color, `${name} keeps its authored palette`); } });
  assert.equal(parts, 1, `${name} is one merged draw part`); assert(stationTriangles > 2_000 && stationTriangles < 6_000, `${name} has detailed bounded geometry`);
  const owned = resources(a), peer = resources(b);
  for (const resource of owned) { assert(!sourceResources.has(resource)); assert(!peer.has(resource), 'workshop clones own their buffers/materials'); }
  context.removeNode(a); context.removeNode(b);
}
 assert.equal(sourceDisposals, 0, 'cached source material and geometry survive all node teardown');
for (const [geometry, position] of sourcePositions) assert.deepEqual(geometry.attributes.position.array, position, 'node lifetime does not mutate source vertices');
assert.equal(scene.children.length, 0);
for (const skill of Object.keys(SKILLS)) {
  const tiers = Object.keys(RESOURCE_TYPES).filter(kind => RESOURCE_TYPES[kind].skill === skill && RESOURCE_TYPES[kind].requiredLevel > 1).sort((a,b) => RESOURCE_TYPES[a].requiredLevel - RESOURCE_TYPES[b].requiredLevel);
  assert.deepEqual(tiers.map(kind => RESOURCE_TYPES[kind].requiredLevel), [10, 25, 50], `${skill} has three real unlock tiers`);
  for (const level of [1, 9, 10, 24, 25, 49, 50, 99]) {
    const xp = 50 * (level - 1) ** 2, player = { skills: { mining: xp, woodcutting: xp, herbalism: xp, fishing: xp } }, html = renderSkills(player);
    assert.equal(skillProgress(xp).level, level);
    for (const kind of tiers) {
      const row = html.match(new RegExp(`<button[^>]*data-resource-kind="${kind}"[^>]*>`))?.[0]; assert(row, `${kind} appears in the actual profession renderer`);
      assert.equal(/\sdisabled(?:\s|>)/.test(row), !canGather(kind, xp), `${kind} UI lock agrees with the authoritative profession rule at ${level}`);
    }
    assert(html.includes(`Level ${level}`)); assert(!html.includes('NaN'));
    if (level === 99) assert(html.includes('Level 99 / 99 · maximum level') && html.includes('Your craft is mastered.') && !html.includes('Next:'));
  }
}
// Execute the real client waypoint action with canonical nodes plus authoritative local availability.
const waypointSource = main.slice(main.indexOf('function findGatheringResource('), main.indexOf('function renderProfessions('));
assert(waypointSource.startsWith('function findGatheringResource('));
const waypoints = [], notices = []; let closed = 0;
const guide = vm.createContext({ RESOURCE_TYPES, canGather, WORLD_GATHERING_NODES,
  player: { skills: { mining: 0, woodcutting: 0, herbalism: 0, fishing: 0 } }, worldInstance: null, position: {x:0,z:0}, nodes: [],
  targetPoints: () => [], setWaypoint: point => waypoints.push(point), toast: message => notices.push(message), closePanel: () => closed++,
  send: () => assert.fail('finding resources must never move the player or send gameplay actions'),
});
vm.runInContext(ts.transpileModule(waypointSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, guide);
const known = WORLD_GATHERING_NODES;
const copper = GATHERING_NODES.find(node => node.kind === 'copper-vein'); assert(copper);
guide.position = {...copper}; guide.findGatheringResource('mining');
assert(waypoints.length === 1 && RESOURCE_TYPES[known.find(node => node.id === waypoints[0].id).kind].requiredLevel === 1, 'level1 ignores the locked copper vein at the player position');
assert.equal(closed, 1);
waypoints.length = 0; guide.player.skills.mining = 50 * 9 ** 2;
guide.findGatheringResource('mining', 'copper-vein');
assert.equal(waypoints[0].id, copper.id, 'an explicit unlocked tier guides to the nearest canonical node');
assert.equal(waypoints[0].kind, 'node'); assert.equal(waypoints[0].height, RESOURCE_TYPES['copper-vein'].height + .3);
waypoints.length = 0; guide.nodes = [{...copper, available: false}]; guide.findGatheringResource('mining', 'copper-vein');
assert(waypoints.length === 1 && waypoints[0].id !== copper.id, 'the latest depleted snapshot overrides the canonical available location');
waypoints.length = 0; guide.worldInstance = 'preview-dungeon'; guide.nodes = [{...copper,available:false}]; guide.findGatheringResource('mining');
assert.equal(waypoints.length, 0, 'no available local resources creates no invalid waypoint or overworld guidance in a dungeon'); assert(notices.at(-1).includes('No available resources'));
guide.nodes = [{id:'local-herb',kind:'herb',x:1,z:2,available:true}]; guide.findGatheringResource('herbalism');
assert.equal(waypoints.at(-1).id, 'local-herb', 'dungeon resource guidance stays in the current instance');
console.log(`Gathering model checks passed: 12 authored resource models and 3 workshops, ${meshCount + 3} draw parts, ${Math.round(triangles).toLocaleString()} resource triangles, ${bytes.length.toLocaleString()} bytes; depletion, regrowth, isolated ownership and profession unlock UI and 12 transparent icons verified.`);
