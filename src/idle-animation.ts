import * as THREE from 'three';

const kinds = ['player', 'rider', 'horse', 'wolf', 'merchant', 'warden', 'healer', 'riding-trainer', 'mount-seller', 'ranger-trainer', 'knight-trainer', 'mage-trainer', 'moss-slime', 'briar-sentinel', 'ice-wisp', 'root-warden', 'bramble-wolf', 'briar-boar', 'grove-spider', 'ember-beetle', 'dune-scorpion', 'stone-golem', 'frost-yeti', 'crystal-bat', 'marsh-toad', 'void-stalker', 'stormhorn-behemoth', 'briarhorn-elder', 'rimefang-matriarch', 'ashen-crown-titan'];
const library = new Map<string, { duration: number; tracks: { part: string; property: string; sample: THREE.Interpolant; origin: number[]; inverse?: THREE.Quaternion }[] }>();
const actors = new WeakMap<THREE.Object3D, { phase: number; kind: string; enabled: boolean; start: number }>();
const rotation = new THREE.Quaternion(), blend = new THREE.Quaternion();

/** The shipping GLB contains Blender motion channels; runtime actors retain their own anatomy. */
export function setIdleAnimations(scene: THREE.Object3D, clips: THREE.AnimationClip[]): void {
  const entries = kinds.map(kind => {
    const clip = clips.find(clip => clip.name === `${kind}-idle`);
    if (!clip || !Number.isFinite(clip.duration) || clip.duration < 6 || clip.duration > 10) throw new Error(`Missing idle animation: ${kind}`);
    const tracks = clip.tracks.map(track => {
      const [name, property] = track.name.split('.'), part = name.slice(kind.length + 1), size = property === 'quaternion' ? 4 : 3;
      if (!name.startsWith(`${kind}-`) || !scene.getObjectByName(name) || !['quaternion', 'position', 'scale'].includes(property)) throw new Error(`Invalid idle target: ${track.name}`);
      if (track.times.length < 2 || track.getValueSize() !== size || ![...track.times, ...track.values].every(Number.isFinite)) throw new Error(`Invalid idle values: ${track.name}`);
      const origin = Array.from(track.values.slice(0, size)), end = Array.from(track.values.slice(-size));
      const seam = property === 'quaternion' ? 1 - Math.abs(rotation.fromArray(origin).dot(blend.fromArray(end))) : Math.max(...origin.map((v, i) => Math.abs(v - end[i])));
      if (seam > .0001 || (property === 'scale' && origin.some(value => value <= 0))) throw new Error(`Idle loop does not close: ${track.name}`);
      return { part, property, origin, inverse: property === 'quaternion' ? new THREE.Quaternion().fromArray(origin).invert() : undefined,
        sample: property === 'quaternion' ? new THREE.QuaternionLinearInterpolant(track.times, track.values, 4) : new THREE.LinearInterpolant(track.times, track.values, 3) };
    });
    if (!tracks.length) throw new Error(`Empty idle animation: ${kind}`);
    return [kind, { duration: clip.duration, tracks }] as const;
  });
  library.clear(); for (const [kind, clip] of entries) library.set(kind, clip);
}

/** Apply once after restoring the neutral pose. Active animations always take priority. */
export function applyIdleAnimation(kind: string, root: THREE.Object3D, parts: Record<string, THREE.Object3D | undefined>, time: number, enabled = true): boolean {
  const clip = library.get(kind); if (!clip || !Number.isFinite(time)) return false;
  let actor = actors.get(root);
  if (!actor) {
    const hash = [...root.uuid].reduce((hash, ch) => Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
    actor = { phase: hash / 0x100000000, kind, enabled, start: time - .3 }; actors.set(root, actor);
  }
  if (actor.kind !== kind || (!actor.enabled && enabled)) actor.start = time;
  actor.kind = kind; actor.enabled = enabled;
  if (!enabled) return true;
  const weight = THREE.MathUtils.smoothstep(time - actor.start, 0, .3);
  const sampleTime = ((time + actor.phase * clip.duration) % clip.duration + clip.duration) % clip.duration;
  for (const track of clip.tracks) {
    const node = parts[track.part]; if (!node || node === root) continue;
    const value = track.sample.evaluate(sampleTime);
    if (track.property === 'quaternion') {
      rotation.fromArray(value).premultiply(track.inverse!).normalize();
      node.quaternion.multiply(blend.identity().slerp(rotation, weight));
    } else if (track.property === 'position') {
      node.position.x += (value[0] - track.origin[0]) * weight; node.position.y += (value[1] - track.origin[1]) * weight; node.position.z += (value[2] - track.origin[2]) * weight;
    } else {
      node.scale.x *= 1 + (value[0] / track.origin[0] - 1) * weight; node.scale.y *= 1 + (value[1] / track.origin[1] - 1) * weight; node.scale.z *= 1 + (value[2] / track.origin[2] - 1) * weight;
    }
  }
  return true;
}
