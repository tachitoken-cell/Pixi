import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDungeonWorld } from '../src/zones.ts';
import { DUNGEONS, dungeonLayout, dungeonStages, dungeonReturn, dungeonCheckpoint } from '../src/dungeon.ts';
import { dungeonRoomAt } from '../src/dungeon-room-visibility.ts';

// Load the shipped Blender assets, not geometry stubs. No browser or server is required.
const originalLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function (url) {
  const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};
const pose = new THREE.Matrix4(), point = new THREE.Vector3();
const unclipped = (planes, p) => planes.every(plane => plane.distanceToPoint(p) >= -.001);
const outside = (planes, box) => planes.some(plane => plane.distanceToPoint(point.set(
  plane.normal.x >= 0 ? box.max.x : box.min.x, plane.normal.y >= 0 ? box.max.y : box.min.y,
  plane.normal.z >= 0 ? box.max.z : box.min.z)) < -.001);
let worlds = 0, changes = 0, remoteInstances = 0;
try {
  for (const dungeon of DUNGEONS) {
    const scene = new THREE.Scene(), unrelated = new THREE.Group(); scene.add(unrelated);
    const world = await createDungeonWorld(scene, dungeon.id), root = scene.children.find(node => node.userData.dungeonId === dungeon.id);
    const layout = dungeonLayout(dungeon.id), stages = dungeonStages(dungeon.id), planes = world.dungeonRoomClipping;
    assert.equal(root.userData.currentRoomId, 'preparation', `${dungeon.id}: defaults to its safe foyer`);
    assert.equal(planes.length, 4);
    const matrixIdentity = new Map(), resources = new Map(), staticBounds = [];
    root.updateMatrixWorld(true);
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (const resource of [mesh.geometry, ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]), ...(mesh.isInstancedMesh ? [mesh] : [])]) {
        if (resources.has(resource)) continue;
        resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
      }
      if (mesh.castShadow) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        assert.equal(material.clippingPlanes, planes, `${mesh.name}: shadow boundary matches world view`);
        assert(material.clipShadows);
      }
      if (!mesh.isInstancedMesh) return;
      matrixIdentity.set(mesh, mesh.instanceMatrix);
      // These retained instance batches cover floors, masonry, Blender props, shrine and teleport plinths.
      if (!mesh.userData.asset && !mesh.name.startsWith('Vault: fitted')) return;
      mesh.geometry.computeBoundingBox();
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, pose); pose.premultiply(mesh.matrixWorld);
        const box = mesh.geometry.boundingBox.clone().applyMatrix4(pose);
        const center = box.getCenter(new THREE.Vector3()), room = dungeonRoomAt(layout.rooms, center);
        if (room) staticBounds.push({ roomId: room.id, box, center });
      }
    });
    const vortex = root.getObjectByName('Dungeon: room teleport vortices'), domes = root.getObjectByName('Dungeon: sealed portal domes'), chains = root.getObjectByName('Dungeon: sealed portal chains');
    const mask = vortex.geometry.getAttribute('roomVisible');
    for (const mesh of [vortex, domes, chains]) {
      assert.equal(mesh.geometry.getAttribute('roomVisible'), mask);
      assert.match(mesh.material.vertexShader, /if\(roomVisible<\.5\)gl_Position=vec4\(2\.,2\.,2\.,1\.\)/, `${mesh.name}: hidden portals are outside clip space before rasterization`);
    }
    const now = Date.now(), completedState = { completed: true, clearedStages: stages.map(stage => stage.id), objects: layout.objects.map(object => ({ ...object, available: false, activated: true })), hazards: [] };
    const route = ['preparation', stages[0].id, stages.find(stage => stage.optional)?.id,
      dungeonRoomAt(layout.rooms, dungeonCheckpoint(dungeon.id))?.id, 'throne', stages[0].id, 'preparation'].filter(Boolean);
    for (const id of route) {
      const room = layout.rooms.find(room => room.id === id), remote = layout.rooms.find(room => room.id !== id);
      world.setDungeonRoom(id); assert.equal(root.userData.currentRoomId, id);
      assert.equal(world.dungeonRoomClipping, planes, 'room travel reuses the same four plane objects');
      assert(unclipped(planes, new THREE.Vector3(room.x, 2, room.z)));
      for (const other of layout.rooms) if (other.id !== id) assert(!unclipped(planes, new THREE.Vector3(other.x, 2, other.z)), `${id}: other room is clipped even if the camera is zoomed out or pointed there`);
      for (const bound of staticBounds) if (bound.roomId !== id) {
        assert(outside(planes, bound.box), `${dungeon.id}/${id}: no part of remote ${bound.roomId} architecture survives the boundary`); remoteInstances++;
      }
      for (const [index, portal] of layout.portals.entries()) assert.equal(mask.getX(index), Number(portal.roomId === id));
      const hazard = (at, suffix) => ({ id: suffix, x: at.x, z: at.z, r: 3, kind: 'fire', label: 'Test', startedAt: now, endsAt: now + 2000, damage: 0 });
      world.setDungeonState({ ...completedState, completed: false, hazards: [hazard(room, 'local'), hazard(remote, 'remote')] }, now);
      const observer = new THREE.Vector3(room.x, 1, room.z), camera = new THREE.PerspectiveCamera(); camera.position.copy(observer).add(new THREE.Vector3(0, 28, 25)); camera.lookAt(observer);
      world.update(1, observer, camera);
      assert.equal(root.getObjectByName('Vault: boss danger outlines').count, 2, 'only local hazard outlines enter the draw');
      assert.equal(root.getObjectByName('Vault: boss danger fill').count, 1, 'remote hazard fill is omitted');
      root.traverse(light => { if (light.isPointLight && light.intensity > 0 && light.parent.visible) {
        light.getWorldPosition(point); assert(unclipped(planes, point), `${id}: remote lamps cannot illuminate the current room`);
      } });
      for (const [mesh, buffer] of matrixIdentity) assert.equal(mesh.instanceMatrix, buffer, 'travel retains the existing GPU instance buffers');
      world.setDungeonState(completedState, now);
      assert.equal(root.getObjectByName('Dungeon: completion return').visible, dungeonRoomAt(layout.rooms, dungeonReturn(dungeon.id))?.id === id);
      changes++;
    }
    world.setDungeonState({ ...completedState, dream: { kind: 'pleasant' } }, now);
    world.setDungeonRoom('preparation');
    assert(vortex.geometry.getAttribute('portalLocked').array.every(value => value === 0), 'dream portals remain open');
    assert(mask.array.some(value => value === 0), 'dreams still show one occupied room');
    world.setDungeonRoom(null);
    assert(mask.array.every(value => value === 1), 'only explicit layout overview reveals every portal');
    for (const { center } of staticBounds) assert(unclipped(planes, center), 'overview restores every retained geometry batch');
    world.setDungeonRoom('preparation');
    const beforeInvalid = planes.map(plane => plane.constant);
    assert.throws(() => world.setDungeonRoom('missing-room'), /Unknown dungeon room/);
    assert.equal(root.userData.currentRoomId, 'preparation');
    assert.deepEqual(planes.map(plane => plane.constant), beforeInvalid);
    world.setDungeonState(completedState, now);
    assert.equal(root.getObjectByName('Dungeon: completion return').visible, false, 'invalid selection cannot disable the occupied-room content filter');
    world.dispose(); world.dispose();
    assert.deepEqual(scene.children, [unrelated], 'disposing a room-filtered world preserves unrelated scenes');
    for (const [resource, count] of resources) assert.equal(count, 1, `${resource.name || resource.type}: disposed exactly once`);
    worlds++;
  }
} finally { GLTFLoader.prototype.loadAsync = originalLoad; }
console.log(`PASS: ${worlds} dungeons, ${changes} room/backtrack/checkpoint selections, ${remoteInstances} remote architecture bounds hidden; portal masks, shadows, lighting, hazards, dreams, overview, retained buffers and disposal.`);
