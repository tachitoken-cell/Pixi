import * as THREE from 'three';
import { DEATH_ANIMATION_MS } from './shared.ts';

export const DEATH_DURATION = DEATH_ANIMATION_MS / 1000;
const kinds = ['player', 'moss-slime', 'briar-sentinel', 'ice-wisp', 'root-warden'];
const library = new Map<string, { duration: number; tracks: { part: string; property: string; sample: THREE.Interpolant; origin: number[] }[] }>();
const bounds = new THREE.Box3(), inverseRoot = new THREE.Matrix4(), meshMatrix = new THREE.Matrix4(), localMatrix = new THREE.Matrix4(), instanceMatrix = new THREE.Matrix4(), vertex = new THREE.Vector3();

/** Blender-authored quaternion channels preserve each race's own joint positions. */
export function setDeathAnimations(scene: THREE.Object3D, clips: THREE.AnimationClip[]): void {
  const entries = kinds.map(kind => {
    const clip = clips.find(clip => clip.name === `${kind}-death`);
    if (!clip || Math.abs(clip.duration - DEATH_DURATION) > .001) throw new Error(`Missing death animation: ${kind}`);
    const tracks = clip.tracks.flatMap(track => {
      const [name, property] = track.name.split('.'), part = name.slice(kind.length + 1);
      if (!name.startsWith(`${kind}-`) || !scene.getObjectByName(name)) throw new Error(`Invalid death animation target: ${track.name}`);
      if (property !== 'quaternion' && !(part === 'body' && (property === 'position' || (kind === 'moss-slime' && property === 'scale')))) return [];
      const rotation = property === 'quaternion';
      if (![...track.times, ...track.values].every(Number.isFinite)) throw new Error(`Invalid death animation values: ${track.name}`);
      return [{ part, property, sample: rotation ? new THREE.QuaternionLinearInterpolant(track.times, track.values, 4) : new THREE.LinearInterpolant(track.times, track.values, 3), origin: Array.from(track.values.slice(0, 3)) }];
    });
    if (!tracks.some(track => track.part === 'body' && track.property === 'quaternion')) throw new Error(`Missing death body motion: ${kind}`);
    return [kind, { duration: clip.duration, tracks }] as const;
  });
  library.clear(); for (const [kind, entry] of entries) library.set(kind, entry);
}

/** Call from the neutral pose; body position channels are deltas, never joint replacements. */
export function applyDeathAnimation(kind: string, parts: Record<string, THREE.Object3D | undefined>, progress: number): void {
  const clip = library.get(kind); if (!clip) throw new Error(`Death animations not loaded: ${kind}`);
  const time = THREE.MathUtils.clamp(progress, 0, 1) * clip.duration;
  for (const track of clip.tracks) {
    const node = parts[track.part]; if (!node) continue;
    const value = track.sample.evaluate(time);
    if (track.property === 'quaternion') node.quaternion.fromArray(value).normalize();
    else if (track.property === 'scale') node.scale.fromArray(value);
    else { node.position.x += value[0] - track.origin[0]; node.position.y += value[1] - track.origin[1]; node.position.z += value[2] - track.origin[2]; }
  }
}

/** Ground actual body/gear vertices; combined batch boxes overestimate tilted limbs. */
export function groundDeathPose(root: THREE.Group, body: THREE.Object3D, floating = false): void {
  root.updateMatrixWorld(true); inverseRoot.copy(root.matrixWorld).invert(); bounds.makeEmpty();
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const positions = node.geometry.getAttribute('position');
    meshMatrix.multiplyMatrices(inverseRoot, node.matrixWorld);
    for (let instance = 0; instance < (node instanceof THREE.InstancedMesh ? node.count : 1); instance++) {
      localMatrix.copy(meshMatrix);
      if (node instanceof THREE.InstancedMesh) { node.getMatrixAt(instance, instanceMatrix); localMatrix.multiply(instanceMatrix); }
      if (Math.abs(localMatrix.determinant()) < 1e-12) continue;
      for (let index = 0; index < positions.count; index++) bounds.expandByPoint(vertex.fromBufferAttribute(positions, index).applyMatrix4(localMatrix));
    }
  });
  if (!bounds.isEmpty() && (!floating || bounds.min.y < 0)) body.position.y -= bounds.min.y;
  root.updateMatrixWorld(true);
}
