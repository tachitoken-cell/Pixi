import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { instantCombatMap } from '../src/instant-combat-maps.ts';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';

const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { buildWorldMapScene, worldMapHeight, worldMapTerrainStep, makeMapSearchArea, updateMapSearchArea } = await import('../src/world-map.ts');
const { isArenaInstance, ARENA_ENTRANCE } = await import('../src/arena.ts');
const { ZEPPELIN_PORTS } = await import('../src/zeppelin.ts');
const { RESOURCE_TYPES } = await import('../src/skills.ts');
const { RESOURCE_SITES, WILD_BIOMES, wildBiomeAt } = await import('../src/world-features.ts');
const { VILLAGES, VILLAGE_PROPS, villagePropHeight } = await import('../src/settlements.ts');
const { MONSTERS, WORLD_BOSS, WORLD_BOSSES, WORLD_BOSS_GROUP_SIZE } = await import('../src/bestiary.ts');
const { AUCTIONEERS, BANKERS } = await import('../src/city-services.ts');
const { POLL_BOOTHS } = await import('../src/poll-booths.ts');
const { CITY, CITY_VENDORS, AUCTIONEER, DEED_AUCTIONEER, BANKER, insideCity } = await import('../src/city.ts');
const { TRAINER_NPCS } = await import('../src/training.ts');
const { ZONES, getZone } = await import('../src/content.ts');
const { regionLevelRange, regionLevelLabel } = await import('../src/region-levels.ts');
const { WORLD_SCENERY, REGION_ORIGINS, OVERWORLD_SPAWNS, toWorld } = await import('../src/realm.ts');
const { WORLD_BOUNDS, CORE_BOUNDS, TERRAIN_STEP, WATER_LEVEL, EXPEDITIONS, surfaceAt, groundHeight, TOWN_HEIGHTS, waterAt } = await import('../src/landscape.ts');
const { DUNGEONS, getDungeon, dungeonStages, dungeonLayout, dungeonBounds, DUNGEON_BOUNDS, DUNGEON_ROOMS, DUNGEON_OBJECTS, DUNGEON_EXIT, DUNGEON_STAGES, ROOTVAULT_ENTRANCE } = await import('../src/dungeon.ts');
hook.deregister();

const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
const approx = (actual, expected, label) => assert(Math.abs(actual - expected) < .0001, `${label}: ${actual} ≈ ${expected}`);
for (const dungeon of [false, true]) {
  const atlas = buildWorldMapScene(dungeon), bounds = dungeon ? dungeonBounds() : WORLD_BOUNDS;
  let triangles = 0, meshes = 0, instances = 0, disposed = 0;
  atlas.group.updateMatrixWorld(true);
  atlas.group.traverse(object => {
    assert(object.matrixWorld.elements.every(Number.isFinite), 'every atlas object has a finite transform');
    if (!object.isMesh) return;
    meshes++;
    const vertices = object.geometry.getAttribute('position');
    assert([...vertices.array].every(Number.isFinite), 'all voxel vertices remain finite');
    triangles += (object.geometry.index?.count || vertices.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    object.geometry.addEventListener('dispose', () => disposed++);
    if (object.isInstancedMesh) {
      instances += object.count;
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix); assert(matrix.elements.every(Number.isFinite));
        matrix.decompose(position, rotation, scale);
        assert(scale.x > 0 && scale.y > 0 && scale.z > 0, 'voxel scales cannot collapse or invert');
      }
    }
  });
  // Prior release measured 338 meshes; retain a 12-mesh margin and budget the
  // resource/biome pins, additional entrance/summon pairs and polling booths at three meshes each.
  // Terrain instance and triangle ceilings remain unchanged.
  const addedPins = 3 * (RESOURCE_SITES.length + WILD_BIOMES.length + (DUNGEONS.length - 4) * 2 + POLL_BOOTHS.length);
  const budget = dungeon ? { instances: 13_000, triangles: 170_000, meshes: 80 } : { instances: 170_000, triangles: 2_100_000, meshes: 350+addedPins };
  assert(instances < budget.instances && triangles < budget.triangles && meshes < budget.meshes, 'dense map geometry stays within the expanded-world draw/triangle budget');
  assert.deepEqual(atlas.bounds, bounds);
  assert(atlas.labels.every(label => typeof label.point.id === 'string' && label.point.id.length), 'every projected label has a stable nonempty ID');
  assert.equal(new Set(atlas.labels.map(label => label.point.id)).size, atlas.labels.length, 'atlas labels never overwrite one another in the DOM ID map');
  if(!dungeon)for(const npc of [...BANKERS,...AUCTIONEERS])assert(atlas.markers.some(marker=>marker.userData.mapPoint.id===npc.id),`${npc.id}: bank or market has its own map pin`);
  if(!dungeon)for(const booth of POLL_BOOTHS){
    const pin=atlas.markers.find(marker=>marker.userData.mapPoint.id===booth.id);
    assert(pin && pin.userData.kind==='poll', `${booth.id}: polling booth has its own map pin`);
    const meshes=pin.children.filter(child=>child.isMesh);
    assert.equal(meshes.length,3,'each new booth pin costs exactly three draws');
    assert.equal(meshes.reduce((sum,mesh)=>sum+mesh.geometry.index.count/3,0),56,'each new booth pin costs exactly 56 triangles');
    approx(pin.position.x,booth.x,'poll service X');approx(pin.position.z,booth.z,'poll service Z');
  }
  const landBounds = new THREE.Box3().setFromObject(atlas.ground);
  assert(landBounds.min.x >= bounds.minX && landBounds.max.x <= bounds.maxX && landBounds.min.z >= bounds.minZ && landBounds.max.z <= bounds.maxZ, 'selectable terrain never invents land beyond the playable bounds');
  for (const marker of atlas.markers) {
    const point = marker.userData.mapPoint;
    assert(point.id && point.label && Number.isFinite(point.x) && Number.isFinite(point.z));
    approx(marker.position.x, point.x, 'marker world X'); approx(marker.position.z, point.z, 'marker world Z');
    assert(point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ);
    assert(atlas.labels.some(label => label.point.id === point.id), 'every interactive landmark has a projected DOM label');
  }
  if (!dungeon) {
    const borders = atlas.group.getObjectByName('atlas-region-borders');
    assert(borders.isLineSegments && borders.geometry.getAttribute('position').count > 100, 'actual neighboring region boundaries receive raised outlines');
    const borderBounds = new THREE.Box3().setFromObject(borders);
    assert(borderBounds.min.x >= bounds.minX && borderBounds.max.x <= bounds.maxX && borderBounds.min.z >= bounds.minZ && borderBounds.max.z <= bounds.maxZ, 'region borders remain within the canonical land footprint');
    assert.equal(atlas.ground.count, (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / worldMapTerrainStep(WORLD_BOUNDS) ** 2, 'the whole atlas covers the realm with bounded authoritative terrain samples');
    assert.equal((WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ), 256 * (CORE_BOUNDS.maxX - CORE_BOUNDS.minX) * (CORE_BOUNDS.maxZ - CORE_BOUNDS.minZ));
    approx(landBounds.min.x, WORLD_BOUNDS.minX, 'west edge'); approx(landBounds.max.x, WORLD_BOUNDS.maxX, 'east edge');
    approx(landBounds.min.z, WORLD_BOUNDS.minZ, 'north edge'); approx(landBounds.max.z, WORLD_BOUNDS.maxZ, 'south edge');
    const heights = new Set(); let waterCells = 0, landCells = 0;
    for (let i = 0; i < atlas.ground.count; i++) {
      atlas.ground.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
      approx(position.y + scale.y / 2, worldMapHeight(position.x, position.z), 'tile top follows the map relief');
      if (surfaceAt(position.x, position.z).water) { waterCells++; approx(position.y + scale.y / 2, WATER_LEVEL, 'swimming water uses the real water level'); }
      else { landCells++; assert(position.y + scale.y / 2 > WATER_LEVEL, 'land and beaches rise above the real shoreline'); }
      heights.add(Math.round(scale.y * 100));
    }
    assert(heights.size >= 8, 'fine voxel steps remain visible within the broad terrain terraces');
    assert(waterCells > 1000 && landCells > 10000, 'the expanded realm includes substantial actual islands and navigable water');
    for (const region of EXPEDITIONS) {
      assert(!surfaceAt(region.x, region.z).water, `${region.name} center is real land`);
      const pin = atlas.markers.find(marker => marker.name === region.id);
      assert.equal(pin.userData.mapPoint.regionId, region.id); assert.equal(pin.userData.mapPoint.label, region.name);
      assert.equal(atlas.labels.find(label=>label.point.id===region.id).text,`${region.name} · ${regionLevelLabel(region.id,region.zone)}`,'expedition map label shows its regional levels');
      approx(pin.position.x, region.x, region.id); approx(pin.position.z, region.z, region.id);
    }
    const villagePins=atlas.markers.filter(marker=>VILLAGES.some(village=>village.id===marker.name));
    assert.equal(villagePins.length,VILLAGES.length,'every hamlet and frontier town is a real selectable atlas landmark');
    for(const village of VILLAGES){const pin=villagePins.find(pin=>pin.name===village.id);assert.equal(pin.userData.kind,'village');assert.equal(pin.userData.mapPoint.label,village.name);approx(pin.position.x,village.x,'village X');approx(pin.position.z,village.z,'village Z');approx(pin.position.y,worldMapHeight(village.x,village.z),'village elevation');}
    for (const zone of ZONES) {
      assert.equal(atlas.labels.find(label=>label.point.id===`region-${zone.id}`).text,`${zone.name} · ${regionLevelLabel(zone.id,zone.id)}`);
      const origin = REGION_ORIGINS[zone.id];
      assert.equal(worldMapHeight(origin.x + 1, origin.z + 43), TOWN_HEIGHTS[zone.id], 'town roads use their actual elevation');
      assert.equal(worldMapHeight(origin.x + 43, origin.z + 1), TOWN_HEIGHTS[zone.id], 'all town roads use their actual elevation');
      for (const [id, local] of [[zone.npc.id, zone.npc], [`board-${zone.id}`, { x: 3, z: 2 }], [`workshop-${zone.id}`, { x: -4, z: 3 }], ...(zone.beacon ? [[zone.beacon.id, zone.beacon]] : [])]) {
        const marker = atlas.markers.find(marker => marker.userData.mapPoint.id === id), at = toWorld(zone.id, local);
        assert(marker, `Missing actual landmark ${id}`); approx(marker.position.x, at.x, id); approx(marker.position.z, at.z, id);
      }
    }
    const scenery = atlas.group.getObjectByName('atlas-scenery'), centers = [];
    for (let i = 0; i < scenery.count; i++) { scenery.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); centers.push({ x: position.x, z: position.z }); }
    for(const prop of VILLAGE_PROPS)assert(centers.some(p=>Math.hypot(p.x-prop.x,p.z-prop.z)<.0001),'every real hamlet building also appears on the atlas');
    for (const prop of WORLD_SCENERY) assert(centers.some(p => Math.hypot(p.x - prop.x, p.z - prop.z) < .0001), `actual scenery at ${prop.x},${prop.z} appears on the atlas`);
    assert.equal(atlas.markers.filter(marker=>marker.userData.kind==='world-boss').length,4);
    for(const definition of WORLD_BOSSES){
      const boss=atlas.markers.find(marker=>marker.name===definition.id),bossHome=OVERWORLD_SPAWNS.find(spawn=>spawn.id===definition.id);
      assert.equal(boss.userData.kind,'world-boss');assert.equal(boss.userData.mapPoint.label,definition.name);approx(boss.position.x,bossHome.x,'world boss X');approx(boss.position.z,bossHome.z,'world boss Z');
      assert.equal(atlas.labels.find(label=>label.point.id===definition.id).text,`${definition.name} · Lv ${MONSTERS[definition.kind].level}`);
    }
    const rootvault = atlas.markers.find(marker => marker.name === 'dungeon-entrance');
    for(const village of VILLAGES){const surface=surfaceAt(village.x,village.z);assert.equal(atlas.labels.find(label=>label.point.id===village.id).text,`${village.name} · ${regionLevelLabel(surface.regionId,surface.zone)}`,'village map labels use the surrounding region, not only its biome');}
    assert.equal(atlas.labels.find(label=>label.point.id===WORLD_BOSS.id).text,`${MONSTERS[WORLD_BOSS.kind].name} · Lv 30`,'world boss level is explicit');
    assert.equal(atlas.labels.find(label=>label.point.id==='dungeon-entrance').text,'The Rootvault · Lv 10–14','dungeon range is independent of the surrounding Hollow');
    assert.deepEqual({ x: rootvault.position.x, z: rootvault.position.z }, {x:ROOTVAULT_ENTRANCE.x,z:ROOTVAULT_ENTRANCE.z});
  } else {
    for (const room of dungeonLayout().rooms) {
      assert(atlas.roomOutlines.has(room.id));
      const label = atlas.labels.find(label => label.point.id === room.id);
      assert.equal(label.point.label, room.name); approx(label.position.x, room.x, room.id); approx(label.position.z, room.z, room.id);
    }
    for (const object of dungeonLayout().objects) {
      const marker = atlas.markers.find(marker => marker.name === object.id);
      assert(marker, `Missing dungeon ${object.kind}`); approx(marker.position.x, object.x, object.id); approx(marker.position.z, object.z, object.id);
    }
    const exit = atlas.markers.find(marker => marker.name === 'dungeon-exit');
    assert.deepEqual({ x: exit.position.x, z: exit.position.z }, DUNGEON_EXIT);
  }
  atlas.dispose(); assert(disposed >= meshes, 'disposing a closed atlas releases its mesh geometry');
  let landmarkDraws=0;for(const marker of atlas.markers)marker.traverse(mesh=>{if(mesh.isMesh)landmarkDraws++;});
  console.log(`PASS: ${dungeon ? 'Rootvault' : 'realm'} atlas · ${instances} voxel instances · ${Math.ceil(triangles)} triangles · ${meshes} mesh draws (${landmarkDraws} landmarks, ${meshes-landmarkDraws} terrain/scenery; cap ${budget.meshes}).`);
}
for (const point of [[NaN, 0], [0, Infinity], [WORLD_BOUNDS.minX - 1, 0], [WORLD_BOUNDS.maxX + 1, 0]]) assert.equal(worldMapHeight(...point), 0);

// Exercise the shipped camera and pointer functions with actual Three.js projection/raycast math.
const source = readFileSync(new URL('../src/world-map.ts', import.meta.url), 'utf8');
const atlas = buildWorldMapScene(), selected = [];
const rect = { left: 83, top: 44, width: 920, height: 480 };
const camera = new THREE.PerspectiveCamera(42, rect.width / rect.height, .5, 10000);
const runtime = { wildBiomeAt, THREE, camera, atlas, surfaceAt, EXPEDITIONS, getZone, instanceId: null, disposed: false, contextLost: false,
  controls: { target: new THREE.Vector3(), minDistance: 22, maxDistance: 4800, update() { const offset=camera.position.clone().sub(this.target);offset.setLength(THREE.MathUtils.clamp(offset.length(),this.minDistance,this.maxDistance));camera.position.copy(this.target).add(offset);camera.lookAt(this.target); camera.updateMatrixWorld(); } },
  canvas: { getBoundingClientRect: () => rect }, pointers: new Set(), down: undefined,
  raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(), options: { onSelect: point => selected.push(point) },
  inBounds: (point, bounds) => point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ,
};
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('  function fitView()'), source.indexOf('  function resize()'))), runtime);
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('  function zoomBy('), source.indexOf('  function lost('))), runtime);
for (const aspect of [320 / 640, 390 / 600, 1280 / 720]) {
  camera.aspect = aspect; camera.updateProjectionMatrix(); runtime.fitView();
  for (const x of [WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX]) for (const z of [WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ]) {
    const projected = new THREE.Vector3(x, 12, z).project(camera);
    assert(Math.abs(projected.x) < .94 && Math.abs(projected.y) < .94, 'overview fits the full realm on portrait and desktop canvases');
    assert(projected.z > -1 && projected.z < 1, 'the enlarged realm is not clipped by camera depth');
  }
}
camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); runtime.fitView();
const before = camera.position.distanceTo(runtime.controls.target);
runtime.zoomBy(1.25); approx(camera.position.distanceTo(runtime.controls.target), before / 1.25, 'accessible zoom-in');
runtime.zoomBy(.8); approx(camera.position.distanceTo(runtime.controls.target), before, 'accessible zoom-out');
for (const bad of [0, -1, NaN, Infinity]) runtime.zoomBy(bad);
approx(camera.position.distanceTo(runtime.controls.target), before, 'invalid zoom inputs preserve camera');
atlas.group.updateMatrixWorld(true);
const landmark = atlas.markers.find(marker => marker.name === 'dungeon-entrance');
const pixel = landmark.children[1].getWorldPosition(new THREE.Vector3()).project(camera);
const click = { button: 0, pointerId: 1, clientX: rect.left + (pixel.x * .5 + .5) * rect.width, clientY: rect.top + (.5 - pixel.y * .5) * rect.height };
runtime.pointerDown(click); runtime.pointerUp(click);
assert.equal(selected.length, 1); assert.equal(selected[0].id, 'dungeon-entrance', 'marker picking uses the canvas offset, not the full viewport');
assert.deepEqual({ x: selected[0].x, z: selected[0].z }, {x:ROOTVAULT_ENTRANCE.x,z:ROOTVAULT_ENTRANCE.z});
runtime.pointerDown(click); runtime.pointerMove({ ...click, clientX: click.clientX + 20 }); runtime.pointerUp(click);
runtime.pointerDown(click); runtime.pointerDown({ ...click, pointerId: 2 }); runtime.pointerUp(click); runtime.pointerUp({ ...click, pointerId: 2 });
runtime.pointerDown({ ...click, button: 2 }); runtime.pointerUp(click);
runtime.pointerDown(click); runtime.pointerCancel(click); runtime.pointerUp(click);
assert.equal(selected.length, 1, 'orbit drags, two-finger gestures, right-button panning and cancelled taps never choose a destination');
const sea = { x: -670, z: 240 }; assert(surfaceAt(sea.x, sea.z).water);
const seaPixel = new THREE.Vector3(sea.x, WATER_LEVEL + .001, sea.z).project(camera);
const seaClick = { ...click, clientX: rect.left + (seaPixel.x * .5 + .5) * rect.width, clientY: rect.top + (.5 - seaPixel.y * .5) * rect.height };
runtime.pointerDown(seaClick); runtime.pointerUp(seaClick);
assert.equal(selected.length, 2); assert(surfaceAt(selected[1].x, selected[1].z).water, 'actual ocean tiles are selectable swimming destinations');
assert(Math.hypot(selected[1].x - sea.x, selected[1].z - sea.z) < .1);
assert(selected[1].regionId && selected[1].label.startsWith('Waters near '));
atlas.dispose();

// Use the actual factory with only WebGL submission and OrbitControls' DOM boundary replaced.
let renderedScene, renderedCamera, rendererDisposed = 0, controlsDisposed = 0, contextsReleased = 0;
const events = new Map(), releases = new Map();
const rendererBoundary = class {
  setPixelRatio() {} setClearColor() {} setSize() {}
  render(scene, camera) { renderedScene = scene; renderedCamera = camera; }
  dispose() { rendererDisposed++; }
  forceContextLoss() { contextsReleased++; }
};
const controlsBoundary = class {
  constructor(camera) { this.camera = camera; this.target = new THREE.Vector3(); }
  update() { this.camera.lookAt(this.target); this.camera.updateMatrixWorld(); }
  dispose() { controlsDisposed++; }
};
const factory = { isInstantCombatInstance,instantCombatMap,isArenaInstance,dungeonLayout, makeMapSearchArea, updateMapSearchArea, wildBiomeAt, THREE: { ...THREE, WebGLRenderer: rendererBoundary }, OrbitControls: controlsBoundary,
  performance: { now: () => 1000 }, buildWorldMapScene, DUNGEON_ROOMS, surfaceAt, EXPEDITIONS, getZone,
  inBounds: runtime.inBounds,
};
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('function disposeGroup('), source.indexOf('/** Also used'))), factory);
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('export function createWorldMap(')).replace('export function', 'function')), factory);
const map = factory.createWorldMap({ getBoundingClientRect: () => rect,
  addEventListener(name, callback) { events.set(name, callback); }, removeEventListener(name, callback) { assert.equal(events.get(name), callback); events.delete(name); },
}, { onSelect() {} });
const player = { id: 'local', x: 0, z: 8, zone: 'greenwood', instanceId: null, rotation: 0 };
const data = { player, players: [], party: null, dungeon: null, route: [{ x: 0, z: 8 }, { x: 0, z: 2 }] };
const labels = map.update(data);
assert.equal(new Set(labels.map(label => label.id)).size, labels.length);
assert(labels.some(label => label.kind === 'region' && label.visible) && labels.some(label => label.kind === 'expedition' && label.visible), 'the full-world overview prioritizes town and expedition names');
assert(labels.filter(label => label.kind === 'beacon').every(label => !label.visible), 'beacon detail does not overlap village names at overview scale');
const realm = renderedScene.getObjectByName('realm-atlas');
function trackResources(group) {
  const resources = new Set();
  group.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => resources.add(material));
    if (object.isInstancedMesh) resources.add(object);
  });
  for (const resource of resources) {
    if (releases.has(resource)) continue;
    releases.set(resource, 0); resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource) + 1));
  }
  return resources;
}
const realmResources = trackResources(realm), cameraBefore = renderedCamera.position.clone();
map.update({ ...data, player: { ...player, x: 0, z: -96, zone: 'amberwild' } });
assert.equal(renderedScene.getObjectByName('realm-atlas'), realm, 'crossing an overworld biome reuses the atlas and camera');
assert(renderedCamera.position.equals(cameraBefore));
assert([...realmResources].every(resource => releases.get(resource) === 0));
rect.width = 320; rect.height = 512; map.resize(); map.fitView();
function assertReadableLabels(projected) {
  const visible = projected.filter(label => label.visible);
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i], b = visible[j];
    const textBox = label => {
      const width = label.label.length * (label.kind === 'region' ? 7.5 : 4.8);
      return { width: Math.min(115, width), height: Math.ceil(width / 115) * (label.kind === 'region' ? 14 : 11) };
    };
    const aa = textBox(a), bb = textBox(b);
    assert(Math.abs(a.x - b.x) >= (aa.width + bb.width) / 2 || Math.abs(a.y - b.y) >= (aa.height + bb.height) / 2,
      `mobile labels overlap: ${a.label} / ${b.label}`);
  }
  return visible;
}
const mobileLabels = map.update(data), mobileVisible = assertReadableLabels(mobileLabels);
assert.equal(mobileLabels.length, labels.length, 'suppressed labels remain available to the DOM label cache');
assert(mobileVisible.some(label => label.kind === 'region'), 'town labels keep priority in the mobile overview');
assert(mobileVisible.length >= 2 && mobileVisible.length < 13, 'dense mobile overview keeps useful names without packing every expedition name together');
assert.deepEqual(map.update(data), mobileLabels, 'unchanged projections produce deterministic visibility');
const suppressed = mobileLabels.find(label => label.kind === 'expedition' && !label.visible && label.x > 10 && label.x < 310 && label.y > 10 && label.y < 502);
assert(suppressed, 'fixture includes a visible-frustum expedition suppressed by overlap');
const selectedLabels = map.update({ ...data, selected: { id: suppressed.id, x: 0, z: 0 } });
assert(selectedLabels.find(label => label.id === suppressed.id).visible, 'a selected destination wins label collisions');
assertReadableLabels(selectedLabels);
map.zoomBy(1.6);
const zoomed = assertReadableLabels(map.update(data));
assert(zoomed.some(label => !mobileVisible.some(previous => previous.id === label.id)), 'zoom reveals names as their projected positions separate');
console.log(`PASS: mobile atlas decluttering · ${mobileVisible.length} overview labels · ${zoomed.length} zoomed labels · selected destination priority.`);
const dungeonState = { clearedStages: ['threshold'], encounterName: 'Lantern Crossing', objects: [] };
map.update({ ...data, player: { ...player, x: 0, z: 22, zone: 'hollow', instanceId: 'vault-a' }, dungeon: dungeonState, route: [] });
assert.equal(realm.parent, null, 'the retired overworld is detached on dungeon entry');
assert([...realmResources].every(resource => releases.get(resource) === 1), 'all retired geometry, materials and instance buffers are disposed exactly once');
assert(renderedScene.getObjectByName('rootvault-atlas'));
const remainingResources = trackResources(renderedScene);
map.dispose(); map.dispose();
assert.equal(rendererDisposed, 1); assert.equal(controlsDisposed, 1); assert.equal(events.size, 0);
assert.equal(contextsReleased, 1, 'repeated map openings cannot retain abandoned WebGL contexts');
assert([...remainingResources].every(resource => releases.get(resource) === 1), 'closing the map disposes the active atlas, route and player markers');
assert.equal(map.update(data).length, 0, 'a closed map cannot resume rendering');
console.log('PASS: bounded relief, unique IDs, actual landmarks, shared dungeon layout, portrait framing, zoom, canvas picking, gestures, view transitions and complete resource cleanup.');

// Execute the actual selection-detail renderer, including points with stale biome metadata.
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),fields=new Map();
const detail={isInstantCombatInstance,instantCombatMap,isArenaInstance,RESOURCE_SITES,RESOURCE_TYPES,WORLD_BOSS_GROUP_SIZE,wildBiomeAt,DUNGEONS,getDungeon,dungeon:null,CITY,insideCity,surfaceAt,waterAt,EXPEDITIONS,VILLAGES,getZone,regionLevelRange,regionLevelLabel,DUNGEON_STAGES,WORLD_BOSSES,MONSTERS,
  worldInstance:null,player:{level:1},$:id=>{if(!fields.has(id))fields.set(id,{textContent:''});return fields.get(id);}};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function renderMapDetails('),main.indexOf('function renderAtlas('))),detail);
for(const point of [...Object.values(REGION_ORIGINS),...EXPEDITIONS]){
  const surface=surfaceAt(point.x,point.z),range=regionLevelRange(surface.regionId,surface.zone),name=EXPEDITIONS.find(region=>region.id===surface.regionId)?.name||getZone(surface.zone).name;
  for(const level of [Math.max(1,range.min-1),range.min,range.max,range.max+1]){
    detail.player.level=level;
    detail.renderMapDetails({x:point.x,z:point.z,zone:'hollow',regionId:'wrong-region',id:'wrong-marker',label:'Selected wilderness'});
    assert.equal(fields.get('atlas-region').textContent,`${name.toUpperCase()} · ${regionLevelLabel(surface.regionId,surface.zone)}`,'selected difficulty comes from actual terrain coordinates');
    assert.equal(fields.get('atlas-selection').textContent,'Selected wilderness','selection heading does not repeat the region level range');
    assert.equal(fields.get('atlas-suitability').textContent,level<range.min?`Reach level ${range.min} first`:level>range.max?'Lower-level area':'Recommended for your level');
  }
}
for(const boss of WORLD_BOSSES){
 const level=MONSTERS[boss.kind].level;
 detail.player.level=level-1;detail.renderMapDetails({...boss,label:boss.name});
 assert.equal(fields.get('atlas-suitability').textContent,`World boss · Lv ${level} · ~${WORLD_BOSS_GROUP_SIZE} players · Reach level ${level} first`);
 detail.player.level=level;detail.renderMapDetails({...boss,label:boss.name});
 assert.equal(fields.get('atlas-suitability').textContent,`World boss · Lv ${level} · ~${WORLD_BOSS_GROUP_SIZE} players`);
 assert(fields.get('atlas-description').textContent.includes(boss.description));
}
detail.player.level=7;detail.renderMapDetails({...ROOTVAULT_ENTRANCE,id:'dungeon-entrance',label:'The Rootvault'});
assert.equal(fields.get('atlas-region').textContent,'THE ROOTVAULT · Lv 10–14');
assert.equal(fields.get('atlas-suitability').textContent,'Reach level 10 first');
detail.worldInstance='vault-test';detail.player.level=14;detail.renderMapDetails({x:0,z:22,label:'Lantern Crossing'});
assert.equal(fields.get('atlas-region').textContent,'THE ROOTVAULT · Lv 10–14');
assert.equal(fields.get('atlas-suitability').textContent,'Recommended for your level');

const destinations={usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),AUCTIONEERS,BANKERS,POLL_BOOTHS,isArenaInstance,ARENA_ENTRANCE,ZEPPELIN_PORTS,DEED_AUCTIONEER,WILD_BIOMES,RESOURCE_SITES,CITY,CITY_VENDORS,AUCTIONEER,BANKER,TRAINER_NPCS,worldInstance:null,DUNGEON_ROOMS,WORLD_BOSSES,MONSTERS,ZONES,VILLAGES,EXPEDITIONS,surfaceAt,regionLevelLabel,
  DUNGEONS,getDungeon,dungeonStages,dungeon:null,zoneIcons:{greenwood:'leaf',amberwild:'ember',frostmarch:'frost',hollow:'heartroot',sunveil:'ember',mistwood:'leaf'}};
const placesStart=main.indexOf(' const cityDestinations=',main.indexOf('function openMap('));
runInNewContext(stripTypeScriptTypes(main.slice(placesStart,main.indexOf(" $('panel-content').innerHTML=",placesStart)))+';globalThis.places=places;',destinations);
assert.equal(destinations.places.length,3+AUCTIONEERS.length+BANKERS.length+POLL_BOOTHS.length+ZEPPELIN_PORTS.length+WILD_BIOMES.length+RESOURCE_SITES.length+WORLD_BOSSES.length+DUNGEONS.length+TRAINER_NPCS.filter(npc=>npc.zone==='greenwood').length+CITY_VENDORS.length+ZONES.length+VILLAGES.length+EXPEDITIONS.length,'all services, the boss and every region/settlement have destinations');
for(const npc of [...BANKERS,...AUCTIONEERS])assert.equal(destinations.places.find(button=>button.id===npc.id).label,`${npc.cityName} ${npc.role==='banker'?'Bank':'Auction House'}`);
for(const booth of POLL_BOOTHS)assert.equal(destinations.places.find(button=>button.id===booth.id).label,`${booth.cityName} Polling booth`);
for(const place of [...ZONES,...EXPEDITIONS])assert.equal(destinations.places.find(button=>button.id===place.id).label,`${place.name} · ${regionLevelLabel(place.id,place.zone||place.id)}`);
for(const village of VILLAGES){const surface=surfaceAt(village.x,village.z);assert.equal(destinations.places.find(button=>button.id===village.id).label,`${village.name} · ${regionLevelLabel(surface.regionId,surface.zone)}`);}
for(const boss of WORLD_BOSSES)assert(destinations.places.find(button=>button.id===boss.id).label.includes(`Lv ${MONSTERS[boss.kind].level}`));
assert(main.includes('<span id="atlas-suitability"></span>'),'level advice has its own element so mobile description hiding cannot remove it');
console.log('PASS: 20 actual region selections, level suitability boundaries, all destination ranges, level-30 boss and separate level-10–14 dungeon details.');

await import('./check-map-guidance.mjs');
