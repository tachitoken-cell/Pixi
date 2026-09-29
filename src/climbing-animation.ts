import * as THREE from 'three';

const parts = ['body', 'head', 'left-arm', 'right-arm', 'left-leg', 'right-leg', 'cape', 'tail'];
let animation: { duration: number; tracks: { part: string; sample: THREE.QuaternionLinearInterpolant }[] } | undefined;

/** One Blender-authored motion fits every race without replacing its joint offsets. */
export function setClimbingAnimations(scene: THREE.Object3D, clips: THREE.AnimationClip[]): void {
  const clip = clips.find(clip => clip.name === 'player-climb');
  if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error('Missing climbing animation');
  const tracks = clip.tracks.filter(track => track.name.endsWith('.quaternion')).map(track => {
    const [name] = track.name.split('.'), part = name.slice('player-'.length);
    if (!name.startsWith('player-') || !parts.includes(part) || !scene.getObjectByName(name)) throw new Error(`Invalid climbing target: ${name}`);
    if (track.times.length < 2 || track.getValueSize() !== 4 || ![...track.times, ...track.values].every(Number.isFinite)) throw new Error(`Invalid climbing values: ${name}`);
    const first = new THREE.Quaternion().fromArray(track.values), last = new THREE.Quaternion().fromArray(track.values, track.values.length - 4);
    if (1 - Math.abs(first.dot(last)) > .0001) throw new Error(`Climbing loop does not close: ${name}`);
    return { part, sample: new THREE.QuaternionLinearInterpolant(track.times, track.values, 4) };
  });
  if (parts.some(part => !tracks.some(track => track.part === part))) throw new Error('Missing climbing joint');
  animation = { duration: clip.duration, tracks };
}

export function applyClimbingAnimation(joints: Record<string, THREE.Object3D | undefined>, time: number, moving: boolean): void {
  if (!animation || !Number.isFinite(time)) return;
  const sampleTime = moving ? ((time % animation.duration) + animation.duration) % animation.duration : 0;
  for (const track of animation.tracks) joints[track.part]?.quaternion.fromArray(track.sample.evaluate(sampleTime)).normalize();
}
