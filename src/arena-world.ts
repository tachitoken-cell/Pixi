import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARENA_COLLIDERS, ARENA_RADIUS } from './arena';
import { disposeWorldGroup, type WorldInstance } from './world';

/** A private copy of the authored arena, with no overworld actors or dungeon rooms. */
export async function createArenaWorld(scene: THREE.Scene): Promise<WorldInstance> {
  const root = (await new GLTFLoader().loadAsync('/models/colosseum.glb')).scene;
  root.name = 'Thornring arena instance';
  root.userData.collision = 'solid';
  root.getObjectByName('Brazier_embers')!.userData.collision = 'effect';
  root.traverse(part => { if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; } });
  const boundary = new THREE.Mesh(new THREE.RingGeometry(ARENA_RADIUS - .12, ARENA_RADIUS, 128),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: .8, side: THREE.DoubleSide }));
  boundary.name = 'Match boundary'; boundary.rotation.x = -Math.PI / 2; boundary.position.y = .06; root.add(boundary);
  boundary.userData.collision = 'effect';
  scene.add(root);
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3();
  let disposed = false;
  return {
    colliders: ARENA_COLLIDERS,
    update() {},
    constrainCamera(target, desired) {
      const distance = direction.subVectors(desired, target).length(); if (disposed || distance < .001) return;
      ray.set(target, direction.divideScalar(distance)); ray.near = .1; ray.far = distance;
      const hit = ray.intersectObject(root, true)[0];
      if (hit) desired.copy(target).addScaledVector(direction, Math.max(.1, hit.distance - .35));
    },
    dispose() { if (!disposed) { disposed = true; disposeWorldGroup(root); } },
  };
}
