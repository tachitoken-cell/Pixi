import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';

const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { minimapBounds } = await import('../src/minimap.ts');
const { buildWorldMapScene, disposeGroup, makeMapSearchArea, updateMapSearchArea, updateDungeonPortalMap, worldMapHeight } = await import('../src/world-map.ts');
const { isArenaInstance } = await import('../src/arena.ts');
const { isInstantCombatInstance } = await import('../src/instant-combat.ts');
const { instantCombatMap } = await import('../src/instant-combat-maps.ts');
const { isRaidInstance, RAID_BOUNDS } = await import('../src/raid.ts');
const { VILLAGE_NPCS } = await import('../src/settlements.ts');
const { GOLD_MERCHANT } = await import('../src/gold-merchant.ts');
const { REGION_ORIGINS, WORLD_BOUNDS } = await import('../src/realm.ts');
hook.deregister();

const releases = new Map(), events = new Map();
let scene, loadKit, clippingPlanes, rendererDisposals = 0, contextDisposals = 0;
function resources(group) {
  const result = new Set();
  group.traverse(object => {
    if (object.geometry) result.add(object.geometry);
    for (const material of object.material ? [].concat(object.material) : []) result.add(material);
    if (object.isInstancedMesh) result.add(object);
  });
  for (const resource of result) if (!releases.has(resource)) {
    releases.set(resource, 0);
    resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource) + 1));
  }
  return result;
}
const runtime = {
  THREE: { ...THREE, WebGLRenderer: class {
    setPixelRatio() {} setClearColor() {} setSize() {}
    render(value, camera) {
      scene = value; scene.updateMatrixWorld(); assert(camera.projectionMatrix.elements.every(Number.isFinite)); resources(scene);
      const arena = isArenaInstance(player.instanceId), bounds = minimapBounds(player.x, player.z, !!player.instanceId && !arena, arena, data.dungeon?.kind);
      const planes = this.clippingPlanes;
      assert.equal(planes?.length, 4, 'the minimap clips every rendered object to all four crop edges');
      if (clippingPlanes) planes.forEach((plane, i) => assert.equal(plane, clippingPlanes[i], 'moving or switching instances reuses clipping planes'));
      else clippingPlanes = [...planes];
      const visible = point => planes.every(plane => plane.distanceToPoint(point) >= -1e-7);
      const x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
      assert(visible(new THREE.Vector3(x, 0, z)), 'crop center survives');
      // A road crossing the crop and a 45-degree player outline whose center is
      // just inside it must lose their outside fragments, at any terrain height.
      for (const y of [0, 90]) for (const overflow of [.001, 2.2880465325, 16]) {
        for (const [edgeX, edgeZ, dx, dz] of [
          [bounds.minX, z, -1, 0], [bounds.maxX, z, 1, 0],
          [x, bounds.minZ, 0, -1], [x, bounds.maxZ, 0, 1],
        ]) {
          assert(visible(new THREE.Vector3(edgeX, y, edgeZ)), 'crop boundary survives');
          assert(visible(new THREE.Vector3(edgeX - dx, y, edgeZ - dz)), 'inside road/icon fragment survives');
          assert(!visible(new THREE.Vector3(edgeX + dx * overflow, y, edgeZ + dz * overflow)), 'outside road/icon fragment is clipped');
        }
      }
    }
    dispose() { rendererDisposals++; } forceContextLoss() { contextDisposals++; }
  } },
  GLTFLoader: class { load(_url, callback) { loadKit = callback; } },
  document: { hidden: false }, minimapBounds, buildWorldMapScene, disposeGroup,
  makeMapSearchArea, updateMapSearchArea, updateDungeonPortalMap, isArenaInstance, isRaidInstance, isInstantCombatInstance, instantCombatMap, RAID_BOUNDS, VILLAGE_NPCS, GOLD_MERCHANT,
};
const source = readFileSync(new URL('../src/minimap.ts', import.meta.url), 'utf8');
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('export function createMinimap(')).replace('export function', 'function')), runtime);
const canvas = { dataset: {}, getBoundingClientRect: () => ({ width: 240, height: 165 }),
  addEventListener(name, callback) { events.set(name, callback); },
  removeEventListener(name, callback) { assert.equal(events.get(name), callback); events.delete(name); },
};
const minimap = runtime.createMinimap(canvas), player = { id: 'local', x: 0, z: 0, rotation: 0, zone: 'greenwood', instanceId: null };
const data = { player, route: [] };
function update(x, z) { Object.assign(player, { x, z }); data.route = [{ x, z }, { x: x + 512, z }]; minimap.update(data); }
const activeAttribute = (geometry, name) => Array.from(geometry.getAttribute(name).array.slice(0, geometry.drawRange.count * 3));
function compareCrop(atlas, fresh) {
  for (const name of ['atlas-land', 'atlas-scenery']) {
    const actual = atlas.getObjectByName(name), expected = fresh.group.getObjectByName(name);
    assert.equal(actual.count, expected.count, `${name} keeps every cell`);
    assert.deepEqual(actual.instanceMatrix.array.slice(0, actual.count * 16), expected.instanceMatrix.array.slice(0, expected.count * 16));
    assert.deepEqual(Array.from(actual.instanceColor?.array.slice(0, actual.count * 3) || []), Array.from(expected.instanceColor?.array.slice(0, expected.count * 3) || []));
    assert(actual.boundingBox.equals(expected.boundingBox), `${name} updates its crop bounds`);
    assert(actual.boundingSphere.equals(expected.boundingSphere), `${name} updates culling after moving`);
    assert.equal(actual.material.opacity, expected.material.opacity);
  }
  for (const name of ['atlas-surround', 'atlas-region-borders']) {
    const actual = atlas.getObjectByName(name), expected = fresh.group.getObjectByName(name);
    actual.updateMatrix(); expected.updateMatrix(); assert(actual.matrix.equals(expected.matrix));
    if (name.endsWith('borders')) for (const attribute of ['position', 'color']) {
      assert.deepEqual(activeAttribute(actual.geometry, attribute), activeAttribute(expected.geometry, attribute));
    }
  }
  const pins = atlas.children.filter(child => child.userData.mapPoint);
  assert.deepEqual(pins.map(pin => pin.name).sort(), fresh.markers.map(pin => pin.name).sort());
  assert.equal(atlas.children.length, fresh.group.children.length, 'retired crop objects do not accumulate');
  for (const pin of pins) {
    const expected = fresh.markers.find(other => other.name === pin.name);
    assert(pin.position.equals(expected.position));
    if (!pin.userData.decorated) pin.children.forEach((mesh, i) => {
      assert(mesh.material.color.equals(expected.children[i].material.color));
      assert.equal(mesh.material.opacity, expected.children[i].material.opacity);
    });
  }
}
update(0, 0);
const initialAtlas = scene.getObjectByName('realm-atlas'), ground = initialAtlas.getObjectByName('atlas-land'), scenery = initialAtlas.getObjectByName('atlas-scenery');
const retained = [ground.geometry, ground.material, ground.instanceMatrix, ground.instanceColor, scenery.geometry, scenery.material];
const borders = initialAtlas.getObjectByName('atlas-region-borders'), borderGeometry = borders.geometry, borderMaterial = borders.material;
const route = scene.children.find(child => child.isGroup).children.find(child => child.isLine && !child.isLineLoop);
const routeGeometry = route.geometry;
const cityPath = [[0, 0], [16, 0], [32, 0], [48, 0], [48, 32], [32, 48], [0, 48], [-32, 48], [-48, 0], [-32, -32], [0, -48], [32, -32], [0, 0]];
for (const [x, z] of [...cityPath, ...Object.values(REGION_ORIGINS).map(point => [point.x, point.z]), [WORLD_BOUNDS.minX + 80, WORLD_BOUNDS.minZ + 80], ...cityPath]) {
  update(x, z);
  const atlas = scene.getObjectByName('realm-atlas'); assert.equal(atlas, initialAtlas);
  const fresh = buildWorldMapScene(false, minimapBounds(x, z)); compareCrop(atlas, fresh); fresh.dispose();
  assert.deepEqual([ground.geometry, ground.material, ground.instanceMatrix, ground.instanceColor, scenery.geometry, scenery.material], retained);
  assert.equal(route.geometry, routeGeometry);
  assert.equal(atlas.getObjectByName('atlas-region-borders').geometry, borderGeometry);
  assert.equal(atlas.getObjectByName('atlas-region-borders').material, borderMaterial);
  const positions = route.geometry.getAttribute('position'), bounds = minimapBounds(x, z);
  assert(route.visible && route.geometry.drawRange.count > 2);
  for (let i = 0; i < route.geometry.drawRange.count; i++) {
    assert(positions.getX(i) >= bounds.minX && positions.getX(i) <= bounds.maxX);
    assert(positions.getZ(i) >= bounds.minZ && positions.getZ(i) <= bounds.maxZ);
    assert(Math.abs(positions.getY(i) - worldMapHeight(positions.getX(i), positions.getZ(i)) - 1) < .0001);
  }
}
// Once capacity covers the route, moving and clearing it do not dispose/recreate GPU buffers.
const routeBuffer = route.geometry.getAttribute('position'), routeReleases = releases.get(routeGeometry);
for (let i = 0; i < 50; i++) update(i / 10, 0);
assert.equal(route.geometry.getAttribute('position'), routeBuffer);
assert.equal(releases.get(routeGeometry), routeReleases);
data.route = []; minimap.update(data); assert(!route.visible); assert.equal(route.geometry.drawRange.count, 0);

// Loaded landmark copies stay owned by the crop and survive movements while still visible.
const kit = new THREE.Group(), landmark = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), new THREE.MeshLambertMaterial({ color: '#f1ce99' }));
landmark.name = 'map-village'; kit.add(landmark); resources(kit); loadKit({ scene: kit }); update(0, 0);
const decorated = initialAtlas.children.find(child => child.userData.decorated), decoratedResources = resources(decorated);
update(16, 0); assert.equal(initialAtlas.getObjectByName(decorated.name), decorated);
for (const resource of decoratedResources) assert.equal(releases.get(resource), 0);

// No zero-capacity instance buffer gets stuck when an empty crop gains scenery.
let empty = buildWorldMapScene(false, { minX: WORLD_BOUNDS.minX, maxX: WORLD_BOUNDS.minX + 4, minZ: WORLD_BOUNDS.minZ, maxZ: WORLD_BOUNDS.minZ + 4 });
assert.equal(empty.scenery.count, 0);
empty = buildWorldMapScene(false, minimapBounds(0, 0), undefined, false, empty.group); assert(empty.scenery.count > 0);
const filled = buildWorldMapScene(false, minimapBounds(0, 0)); compareCrop(empty.group, filled); filled.dispose(); empty.dispose();

for (const [instanceId, dungeon, atlasName] of [['vault-test', { kind: 'rootvault', completed: false, clearedStages: [], objects: [] }, 'rootvault-atlas'], ['vault-other', { kind: 'cindercrypt', completed: false, clearedStages: [], objects: [] }, 'cindercrypt-atlas'], ['arena-test', undefined, 'arena-atlas'], [null, undefined, 'realm-atlas']]) {
  const outgoing = resources(scene.children.find(child => child.isGroup).children.find(child => child.name.endsWith('atlas')));
  const before = new Map([...outgoing].map(resource => [resource, releases.get(resource)]));
  player.instanceId = instanceId; data.dungeon = dungeon; data.route = []; Object.assign(player, { x: 0, z: 0 }); minimap.update(data);
  assert(scene.getObjectByName(atlasName), `enters ${atlasName}`);
  for (const resource of outgoing) assert.equal(releases.get(resource), before.get(resource) + 1, 'instance transitions release outgoing crop resources');
}
const live = resources(scene), beforeFinal = new Map([...live].map(resource => [resource, releases.get(resource)]));
minimap.dispose(); minimap.dispose();
for (const resource of live) assert.equal(releases.get(resource), beforeFinal.get(resource) + 1);
for (const resource of resources(kit)) assert.equal(releases.get(resource), 1, 'landmark source is released only at minimap disposal');
assert.equal(rendererDisposals, 1); assert.equal(contextDisposals, 1); assert.equal(events.size, 0);
console.log('PASS: city/region movement preserves crop and route GPU resources, exact terrain/scenery/colors/bounds, bounded pin lifetime, empty-batch growth, landmark ownership, dungeon/arena switching, all-edge road/icon clipping with reused planes and final disposal.');

if (process.argv.includes('--benchmark')) {
  for (const reuse of [false, true]) {
    const times = []; let crop;
    for (let i = 0; i < 200; i++) {
      const [x, z] = cityPath[i % cityPath.length], start = performance.now();
      if (!reuse) crop?.dispose();
      crop = buildWorldMapScene(false, minimapBounds(x, z), undefined, false, reuse ? crop?.group : undefined);
      if (i >= 20) times.push(performance.now() - start);
    }
    crop.dispose(); times.sort((a, b) => a - b);
    console.log(JSON.stringify({ reuse, medianMs: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1) }));
  }
}
