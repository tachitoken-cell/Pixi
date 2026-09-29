import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { INSTANT_COMBAT_MAPS, instantCombatPosition } from '../src/instant-combat-maps.ts';
import { canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { raidHazardContains } from '../src/raid.ts';
import { WALK_SPEED } from '../src/travel.ts';

const audit = JSON.parse(readFileSync(new URL('../assets/source/instant-combat/map-audit.json', import.meta.url)));
let routes = 0;
for (const map of INSTANT_COMBAT_MAPS) {
  const record = audit.find(a => a.mapId === map.id), original = readFileSync(new URL(`../assets/source/instant-combat/original/${record.original}`, import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'), record.sha256, 'original map provenance is unchanged');
  const bytes = readFileSync(new URL(`../public/models/instant-combat-${map.id}.glb`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.length, bytes.readUInt32LE(8));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert(gltf.meshes.length && gltf.materials.length <= 32, 'original material colors are batched without hundreds of duplicate star draws');
  assert(gltf.nodes.some(n => n.extras?.source_sha256 === record.sha256), 'GLB carries original-source identity');
  const triangles = gltf.meshes.flatMap(mesh => mesh.primitives).reduce((total, part) => total + gltf.accessors[part.indices ?? part.attributes.POSITION].count / 3, 0);
  assert(triangles < 250000 && triangles > record.triangles * .99, 'faithful arena export stays within its geometry budget without losing authored detail');
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''); asset.scene.updateMatrixWorld(true);
  for (const [x,z] of [[0,0],[2.8,0],[1,1]]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0)).intersectObject(asset.scene,true)[0];
    assert(hit && hit.point.y >= -.001 && hit.point.y < .04, 'ritual platform remains at gameplay floor height');
    if(x) assert.equal(hit.object.material.name, 'Moss_Rune', 'original central ring and four rune dots remain above the platform');
  }
  const spawn = instantCombatPosition(map.id, map.spawn.x, map.spawn.z);
  const free = (point, clearance) => {
    assert(Math.hypot(point.x, point.z) < map.radius - clearance);
    for (const c of map.colliders) {
      const distance = c.halfWidth !== undefined ? Math.hypot(Math.max(0, Math.abs(point.x-c.x)-c.halfWidth), Math.max(0, Math.abs(point.z-c.z)-c.halfDepth)) : Math.hypot(point.x-c.x, point.z-c.z)-c.r;
      assert(distance > clearance - .00001, `${map.id}: placement clearance ${clearance} at ${JSON.stringify(point)}`);
    }
  };
  const routeTo = (point, clearance) => {
    free(point, clearance);
    const route = findPath(spawn, point, map.colliders, map.bounds);
    assert(route.length, `${map.id}: objective is reachable from spawn: ${JSON.stringify(point)}`);
    let previous = spawn;
    for (const next of route) { assert(canTraverse(previous, next, map.colliders, map.bounds)); previous = next; }
    assert.deepEqual(route.at(-1), point); routes++;
  };
  const routeLength = (from, to) => {
    const path = findPath(from, to, map.colliders, map.bounds);
    if (!path.length) return Infinity;
    let previous = from, length = 0;
    for (const point of path) {
      assert(canTraverse(previous, point, map.colliders, map.bounds));
      length += Math.hypot(point.x - previous.x, point.z - previous.z); previous = point;
    }
    assert.deepEqual(previous, to);
    return length;
  };
  routeTo(instantCombatPosition(map.id, map.boss.x, map.boss.z, 2), 2);
  for (let i = 0; i < 20; i++) routeTo(instantCombatPosition(map.id, map.spawn.x + (i%5-2)*2, map.spawn.z + (Math.floor(i/5)-1.5)*2), .4);
  for (let i = 0; i < 16; i++) {
    const angle = i/16*Math.PI*2;
    routeTo(instantCombatPosition(map.id, Math.sin(angle)*map.waveRadius, Math.cos(angle)*map.waveRadius, 1), 1);
  }
  for (let count = 1; count <= 4; count++) {
    const points = Array.from({length:count}, (_,i) => {
      const angle=i/count*Math.PI*2;
      return instantCombatPosition(map.id, Math.sin(angle)*map.mechanicRadius, Math.cos(angle)*map.mechanicRadius, 3);
    });
    for (const [i, point] of points.entries()) {
      routeTo(point, 3);
      for (const other of points.slice(i+1)) assert(Math.hypot(point.x-other.x,point.z-other.z)>6, 'mechanic circles remain separate');
      if (map.id === 'bone-pit' && count >= 3 && i)
        assert(routeLength(points[i-1], point) / WALK_SPEED < 6.5, 'successive stomp centers are reachable before the 6.5-second impact');
    }
  }
  if (map.id === 'void-rift') {
    // These authored-map candidate pairs are also exercised through actual controller movement in its regression check.
    const candidates = [0, 2, 5, 8, 12, 14].map(index => {
      const angle = index / 16 * Math.PI * 2;
      const pillar = instantCombatPosition(map.id, Math.sin(angle) * 10, Math.cos(angle) * 10, 1);
      const bait = instantCombatPosition(map.id, Math.sin(angle) * 17, Math.cos(angle) * 17, .4);
      const rotation = Math.atan2(bait.x, bait.z);
      const lane = { shape: 'line', x: Math.sin(rotation) * 17, z: Math.cos(rotation) * 17, width: 4, length: 34, rotation };
      routeTo(pillar, 1); routeTo(bait, .4);
      assert(raidHazardContains(lane, pillar), 'reachable charge bait aims through its pillar');
      assert(Math.hypot(bait.x, bait.z) > Math.hypot(pillar.x, pillar.z) + 3, 'bait remains visibly beyond its pillar');
      const pillarDistance = Math.hypot(pillar.x, pillar.z), baitDistance = Math.hypot(bait.x, bait.z);
      const offset = Math.acos(Math.min(1, (pillar.x * bait.x + pillar.z * bait.z) / (pillarDistance * baitDistance)));
      const widestAngle = offset + Math.asin(1.5 / baitDistance);
      assert(widestAngle < Math.PI / 2 && pillarDistance < 34 && pillarDistance * Math.sin(widestAngle) < 2,
        'the full continuous bait disk stays inside the pillar-hitting angle range');
      for (let sample = 0; sample < 64; sample++) {
        const edgeAngle = sample / 64 * Math.PI * 2;
        const aim = Math.atan2(bait.x + Math.sin(edgeAngle) * 1.5, bait.z + Math.cos(edgeAngle) * 1.5);
        assert(raidHazardContains({ ...lane, x: Math.sin(aim) * 17, z: Math.cos(aim) * 17, rotation: aim }, pillar),
          'every edge of the 1.5m bait circle aims the 4m charge lane through its pillar');
      }
      return bait;
    });
    let reachableEdges = 0;
    for (let index = 0; index < 32; index++) {
      const angle = index / 32 * Math.PI * 2;
      const edge = instantCombatPosition(map.id, Math.sin(angle) * 31, Math.cos(angle) * 31);
      if (!Number.isFinite(routeLength(map.boss, edge))) continue;
      reachableEdges++;
      const shortest = Math.min(...candidates.map(bait => routeLength(edge, bait)));
      assert(shortest / WALK_SPEED + 1 <= 6, 'reachable arena edges have a charge bait route within the minimum aim time, including reaction time');
    }
    assert(reachableEdges >= 30, 'charge travel check covers reachable points around the arena perimeter');
  }
  for (let i=0;i<192;i++) {
    const angle=i/192*Math.PI*2, outside={x:Math.sin(angle)*35.5,z:Math.cos(angle)*35.5};
    assert(!canTraverse(outside,outside,map.colliders,map.bounds), 'circular perimeter has no walkable gaps');
  }
}
console.log(`PASS: both original-map GLBs, provenance, material budgets, closed boundaries and ${routes} collision-safe reachable entry/wave/boss/objective placements.`);

// Exercise the real Three.js scene adapter without creating a browser or WebGL context.
const { transpileModule, ModuleKind, ScriptTarget } = await import('typescript');
const { runInNewContext } = await import('node:vm');
function sceneModule(file, bindings = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/^import .+;\s*$/gm, '');
  const exports = {};
  runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText, { exports, THREE, ...bindings });
  return exports;
}
const { disposeWorldGroup } = sceneModule('world.ts');
const { raidHazardGeometry } = sceneModule('raid-world.ts');
const document = { createElement() {
  const context = { beginPath() {}, ellipse() {}, fill() {}, stroke() {}, fillRect() {}, clearRect() {}, fillText(text) { this.lastText = text; } };
  return { width: 0, height: 0, getContext: () => context };
} };
const { createInstantCombatWorld } = sceneModule('instant-combat-world.ts', {
  document, disposeWorldGroup, raidHazardGeometry,
  instantCombatMap: id => INSTANT_COMBAT_MAPS.find(map => map.id === id),
  GLTFLoader: class { async loadAsync() { return { scene: new THREE.Group() }; } },
  createEnvironmentLights: () => ({ update() {}, dispose() {} }),
});
const scene = new THREE.Scene(), world = await createInstantCombatWorld(scene, 'void-rift'), root = scene.children[0];
const hazard = { id: 'tell', shape: 'cone', x: 2, z: -1, r: 8, rotation: .7, angle: 1, label: 'Leave cone', startedAt: 100, impactAt: 4000, endsAt: 4600 };
const run = { id: 'run-1', mapId: 'void-rift', boss: { x: 2, z: -1, shielded: true }, mechanic: { kind: 'gaze' }, hazards: [hazard], runes: [
  { id: 'ordered', kind: 'ordered', label: 'Note 2', x: 7, z: 8, r: 3, charge: .5, active: false },
  { id: 'soak', kind: 'soak', label: 'Soak stomp', x: -8, z: 8, r: 3.5, charge: 0 },
  { id: 'web', kind: 'web', label: 'Move 6m', x: 3, z: 4, r: 6, charge: .4, targetX: 7, targetZ: 8 },
  { id: 'bait', kind: 'bait', label: 'Bait here', x: -7, z: -9, r: 3, charge: 0 },
  { id: 'gaze', kind: 'gaze', label: 'Look away', x: 10, z: -1, r: 1, charge: 0 },
] };
world.setInstantCombatState({ run }, 1000); world.update(1, undefined, new THREE.PerspectiveCamera());
const marker = kind => root.getObjectByName(`Mechanic marker · ${kind}`);
assert.equal(marker('ordered').children[2].material.color.getHex(), 0x73758c, 'future notes are dim');
assert.equal(marker('ordered').children[1].geometry.drawRange.count, 96, 'server half charge draws half the progress circle');
assert.equal(marker('soak').children[2].geometry.parameters.outerRadius, 3.5, 'gold soak shows its actual server radius');
assert.equal(marker('soak').children[2].material.color.getHex(), 0xffce63);
assert.equal(root.getObjectByName('Boss immune while objectives remain').position.x, 2, 'shield follows public boss coordinates');
assert(root.getObjectByName('Eclipse gaze warning').visible);
const web = marker('web').getObjectByName('Stretch this web to sever it');
assert(web.visible && Math.abs(web.scale.y - Math.hypot(4, .6, 4)) < .001, 'tether uses current authoritative target coordinates');
const gazeArrow = marker('gaze').getObjectByName('Face away from the boss');
assert(Math.abs(gazeArrow.rotation.y - Math.PI / 2) < .001 && gazeArrow.position.x > 0, 'gaze arrow points away from the boss');
root.traverse(node => { if (node.material) for (const mat of [node.material].flat()) assert.equal(mat.toneMapped, false, 'tell colors survive the Void map exposure'); });
const oldOrdered = marker('ordered'), oldGeometry = oldOrdered.children[0].geometry;
let replacedDisposed = false; oldGeometry.addEventListener('dispose', () => { replacedDisposed = true; });
const noteLabel = oldOrdered.children.find(child => child.material?.map), oldVersion = noteLabel.material.map.version;
run.runes[0].label = 'Next note'; run.runes[0].active = true; run.runes[0].charge = 1;
world.setInstantCombatState({ run }, 1200);
assert.equal(noteLabel.material.map.image.getContext().lastText, 'Next note');
assert(noteLabel.material.map.version > oldVersion, 'dynamic mechanic labels refresh their existing texture');
assert.equal(marker('ordered').children[2].material.color.getHex(), 0x72ffa6, 'finished note becomes green');
run.runes[0].r = 4; world.setInstantCombatState({ run }, 1300);
assert(replacedDisposed && marker('ordered') !== oldOrdered, 'a changed radius rebuilds and disposes the prior geometry');
const resources = new Set(), disposed = new Set();
root.traverse(node => {
  if (node.geometry) resources.add(node.geometry);
  if (node.material) for (const mat of [node.material].flat()) { resources.add(mat); for (const value of Object.values(mat)) if (value instanceof THREE.Texture) resources.add(value); }
});
for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource));
world.setInstantCombatState({ run: { ...run, mapId: 'bone-pit' } }, 1400);
assert(!marker('web') && !root.getObjectByName('Leave cone'), 'incoming state for another map clears old mechanics during world loading');
assert(!root.getObjectByName('Eclipse gaze warning').visible);
world.dispose(); world.dispose();
assert.equal(scene.children.length, 0); assert.equal(disposed.size, resources.size, 'all meshes, line edges, labels and textures are disposed');
console.log('PASS: ordered notes, gold soaks, assigned web tethers, gaze arrows, label/radius updates, untonemapped tells, map transitions and complete scene disposal.');
