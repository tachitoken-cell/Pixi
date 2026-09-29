import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createZone } from '../src/zones.ts';
import { ZONES } from '../src/content.ts';
import { findPath } from '../src/navigation.ts';

// Legacy regional scenes use their real procedural village geometry, without the retired bell asset.
const loadAsync = GLTFLoader.prototype.loadAsync;
let modelsLoaded = 0;
GLTFLoader.prototype.loadAsync = async function (url) {
  modelsLoaded++;
  assert.fail(`Regional scenes must not load external models: ${url}`);
};

function checkRoute(start, target, colliders, zoneId) {
  const path = findPath(start, { x: target.x, z: target.z }, colliders);
  assert(path.length, `${zoneId}: no path to ${target.id || 'NPC'}`);
  assert(Math.hypot(path.at(-1).x - target.x, path.at(-1).z - target.z) < .01, `${zoneId}: path does not reach ${target.id}`);
  let from = start;
  for (const to of path) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .2));
    for (let i = 0; i <= steps; i++) {
      const x = from.x + (to.x - from.x) * i / steps, z = from.z + (to.z - from.z) * i / steps;
      assert(Math.abs(x) < 37 && Math.abs(z) < 37, `${zoneId}: route leaves the playable square`);
      assert(colliders.every(c => Math.hypot(c.x - x, c.z - z) >= c.r + .39), `${zoneId}: route crosses a collider`);
    }
    from = to;
  }
}

try {
  for (const zone of ZONES) {
    const scene = new THREE.Scene();
    const persistent = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    let persistentDisposals = 0;
    persistent.geometry.addEventListener('dispose', () => persistentDisposals++);
    persistent.material.addEventListener('dispose', () => persistentDisposals++);
    scene.add(persistent);
    const world = await createZone(scene, zone.id);
    assert.equal(scene.children.length, 2, `${zone.id}: scenery must have one removable root`);
    const root = scene.children.find(child => child !== persistent);
    assert(root instanceof THREE.Group);
    // Greenwood's active encounters now live beyond this legacy village. The open-world
    // check covers all of those canonical points; retain local walkability probes here.
    const targets = zone.id === 'greenwood'
      ? [zone.npc, ...zone.gateways, ...[[10,1],[15,-5],[8,-10],[18,7]].map(([x,z],i)=>({id:`village-meadow-${i}`,x,z}))]
      : [zone.npc, ...zone.gateways, ...zone.nodes, ...zone.enemies, ...(zone.beacon ? [zone.beacon] : [])];
    const starts = zone.id === 'greenwood' ? [zone.spawn, { x: 0, z: 22 }] : [zone.spawn];
    for (const target of targets) {
      const clearance = zone.id === 'greenwood' ? .4 : 3;
      assert(world.colliders.every(c => Math.hypot(c.x - target.x, c.z - target.z) >= c.r + clearance), `${zone.id}: blocked interaction ${target.id}`);
      for (const start of starts) checkRoute(start, target, world.colliders, zone.id);
    }
    const terrain = root.getObjectByName(zone.id === 'greenwood' ? 'Village voxel geometry' : `${zone.id}: terrain and landmarks`);
    assert(terrain instanceof THREE.InstancedMesh && terrain.count > 1000, `${zone.id}: actual baseline scenery remains populated`);
    if (zone.id === 'greenwood') {
      assert(root.getObjectByName('Willowbrook') instanceof THREE.Mesh, 'village water remains present');
      assert(root.getObjectByName('Distant voxel clouds') instanceof THREE.InstancedMesh, 'village sky remains present');
      assert.equal(root.getObjectByName('Mossvale bell tower — authored in Blender'), undefined, 'the retired landmark is absent');
    }
    const beacon = root.getObjectByName(`${zone.id}: beacon light`);
    const ambient = root.getObjectByName(`${zone.id}: luminous details`);
    if (zone.beacon) {
      assert(beacon && !beacon.visible, `${zone.id}: beacon begins unlit`);
      assert.equal(typeof world.setBeaconLit, 'function');
      world.setBeaconLit(true);
      assert(beacon.visible, `${zone.id}: story progression visibly ignites the beacon`);
      assert(ambient.visible, `${zone.id}: beacon state preserves other luminous scenery`);
      world.setBeaconLit(false);
      assert(!beacon.visible && ambient.visible, `${zone.id}: release ending extinguishes only the beacon`);
      world.setBeaconLit(true);
    } else assert.equal(world.setBeaconLit, undefined);
    world.update(0); world.update(7.25);
    const geometries = new Set(), materials = new Set();
    let instances = 0;
    root.updateMatrixWorld(true);
    root.traverse(object => {
      assert(object.matrixWorld.elements.every(Number.isFinite));
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object instanceof THREE.InstancedMesh) {
        instances += object.count;
        assert([...object.instanceMatrix.array].every(Number.isFinite));
      }
    });
    assert(instances > 1500 && instances < 30000, `${zone.id}: scenery remains detailed and bounded`);
    let geometryDisposals = 0, materialDisposals = 0;
    geometries.forEach(geometry => geometry.addEventListener('dispose', () => geometryDisposals++));
    materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
    world.dispose(); world.dispose(); world.update(10); world.setBeaconLit?.(false);
    assert.deepEqual(scene.children, [persistent], `${zone.id}: switching removes only this scenery`);
    assert.equal(root.children.length, 0);
    assert.equal(geometryDisposals, geometries.size, `${zone.id}: shared geometry disposed exactly once`);
    assert.equal(materialDisposals, materials.size, `${zone.id}: shared materials disposed exactly once`);
    assert.equal(persistentDisposals, 0, `${zone.id}: player/render resources remain intact`);
    persistent.geometry.dispose(); persistent.material.dispose();
    console.log(`PASS: ${zone.id}: ${instances} voxels, ${targets.length} reachable interactions, finite animation, beacon state and isolated disposal.`);
  }
  assert.equal(modelsLoaded, 0, 'regional scenery needs no external model loads');
  await assert.rejects(createZone(new THREE.Scene(), 'unknown-zone'), /Unknown zone/);
} finally {
  GLTFLoader.prototype.loadAsync = loadAsync;
}
