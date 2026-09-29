import * as THREE from 'three';
import type { EnemyKind } from './content.ts';
import { makeEnemy, animateEnemy } from './characters.ts';
import type { DungeonBossModel } from './dungeon-boss-models.ts';

const markerCube = new THREE.BoxGeometry(1, 1, 1);
const markerMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
/** Static fallen monster. Like living rigs, dispose only its instance buffers with removeRig. */
export function makeLootRemains(kind: EnemyKind, treasure = false, model?: import('./shared').Enemy['model']): THREE.Group {
  const remains = new THREE.Group();
  remains.name = 'loot-remains';
  remains.userData.enemyKind = kind;
  if (model) remains.userData.enemyModel = model;
  let bounds = new THREE.Box3(new THREE.Vector3(-.5, 0, -.5), new THREE.Vector3(.5, .9, .5));
  if (!treasure) {
  const fallen = makeEnemy(model ?? kind);
  fallen.name = `fallen-${model ?? kind}`;
  animateEnemy(fallen, 0, false, undefined, 1);
  // Keep exactly the animation's final pose and facing when the loot replaces it.
  delete fallen.userData.enemyRig;
  remains.add(fallen);
  bounds = new THREE.Box3().setFromObject(fallen);

  }
  const height = bounds.max.y - bounds.min.y;
  const coinX = Math.max(.28, (bounds.max.x - bounds.min.x) * .36);
  const coinZ = Math.max(.25, (bounds.max.z - bounds.min.z) * .22);
  const parts: [number, number, number, number, number, number, string][] = [
    [coinX, .045, coinZ, .18, .07, .19, '#f0bd55'],
    [coinX + .13, .035, coinZ + .13, .17, .05, .17, '#e4a541'],
    [coinX + .06, .098, coinZ + .035, .15, .035, .17, '#ffe8a1'],
    [0, height + .12, 0, .045, .23, .045, '#ffe8a1'],
    [0, height + .12, 0, .18, .045, .045, '#ffe8a1'],
    [0, height + .12, 0, .045, .045, .18, '#ffe8a1'],
    [-.24, height + .045, .15, .035, .13, .035, '#f0bd55'],
    [-.24, height + .045, .15, .12, .035, .035, '#f0bd55'],
  ];
  const marker = new THREE.InstancedMesh(markerCube, markerMaterial, parts.length);
  marker.name = 'loot-gold';
  const transform = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < parts.length; i++) {
    const [x, y, z, w, h, d, tint] = parts[i];
    transform.position.set(x, y, z); transform.scale.set(w, h, d); transform.updateMatrix();
    marker.setMatrixAt(i, transform.matrix); marker.setColorAt(i, color.set(tint));
  }
  marker.computeBoundingBox(); marker.computeBoundingSphere();
  remains.add(marker);
  return remains;
}
