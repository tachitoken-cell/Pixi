import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { MountId } from './travel.ts';
import { applyIdleAnimation } from './idle-animation.ts';

const library = new Map<MountId, THREE.Object3D>();
const rigs = new WeakMap<THREE.Group, {
  id: MountId; parts: Record<string, THREE.Object3D | undefined>;
  model: THREE.Object3D; head: THREE.Object3D; body: THREE.Object3D; tail: THREE.Object3D;
  legs: THREE.Object3D[]; knees: (THREE.Object3D | undefined)[];
  rest: { node: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3 }[];
  reins: THREE.LineSegments;
  tailSegments: THREE.Object3D[];
  mane?: THREE.Object3D;
  flame?: THREE.ShaderMaterial;
  spirits?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
}>();
const reinsMaterial = new THREE.LineBasicMaterial({ color: '#493025' });
const hand = new THREE.Vector3(), bridle = new THREE.Vector3(), middle = new THREE.Vector3();
const legNames = ['front-left', 'front-right', 'rear-left', 'rear-right'];
const legPhases = [0, .65, Math.PI + .3, Math.PI + .95];
const spiritMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  vertexShader: `attribute float life; attribute float radius; varying float glow; varying float halo;
    void main() { glow = sin(life * 3.14159265); halo = step(.5, radius); vec4 view = modelViewMatrix * vec4(position, 1.0);
      view.z += halo * .45;
      gl_Position = projectionMatrix * view; gl_PointSize = clamp(540.0 * radius / max(.1, -view.z), 1.0, 256.0); }`,
  fragmentShader: `varying float glow; varying float halo;
    void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float d = length(p);
      float aura = pow(max(0.0, 1.0 - d), 2.0);
      float core = pow(max(0.0, 1.0 - abs(p.x) - abs(p.y)), 6.0);
      vec3 color = mix(vec3(.025, 1.6, .10), vec3(.65, 2.0, .48), core * (1.0 - halo));
      gl_FragColor = vec4(color, mix(aura * .65 + core, aura * .72, halo) * glow); }`,
});
const spiritOrigin = new THREE.Vector3();
const spiritWorldToLocal = new THREE.Matrix4();
const flameMaterial = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending, toneMapped: false,
  vertexShader: `uniform float time; varying vec2 flow;
    void main() { flow = uv; vec3 p = position; float tip = uv.y * uv.y;
      p.x += sin(time * 4.8 - uv.y * 8.0 + position.z * 3.0) * .16 * tip;
      p.y += sin(time * 6.0 - uv.y * 5.0 + position.x * 4.0) * .10 * uv.y;
      p.z += sin(time * 3.7 - uv.y * 7.0 + position.y * 2.0) * .13 * tip;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `uniform float time; varying vec2 flow;
    void main() { float edge = abs(flow.x - .5) * 2.0;
      float flicker = .78 + .22 * sin(flow.y * 17.0 - time * 7.0 + sin(flow.x * 13.0));
      float core = pow(1.0 - edge, 2.0) * (1.0 - flow.y) * flicker;
      vec3 fire = mix(vec3(.015, .95, .06), vec3(.58, 2.6, .34), core);
      float alpha = (1.0 - smoothstep(.48, 1.0, edge)) * (1.0 - smoothstep(.80, 1.0, flow.y));
      gl_FragColor = vec4(fire, alpha * flicker * .88); }`,
});

/** Blender geometry and materials are shared; every rider owns only their mount's pose. */
export function setMountAssets(scene: THREE.Object3D, ids: readonly MountId[] = ['horse', 'wolf']): void {
  for (const id of ids) {
    const model = scene.getObjectByName(`mount-${id}`);
    if (!model || !Number.isFinite(model.userData.seatY) || !Number.isFinite(model.userData.seatZ)) throw new Error(`Missing mount model or saddle: ${id}`);
    if (id === 'wayfarer-stag' && (!Number.isFinite(model.userData.passengerSeatY) || !Number.isFinite(model.userData.passengerSeatZ))) throw new Error('Missing passenger saddle: wayfarer-stag');
    for (const part of ['body', 'head', 'tail', ...legNames]) if (!model.getObjectByName(`${id}-${part}`)) throw new Error(`Missing mount joint: ${id}-${part}`);
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = node.receiveShadow = true;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (id === 'verdant-revenant' && material instanceof THREE.MeshStandardMaterial && material.name === 'Jade spirit fire') {
          // Keep the emerald emission saturated instead of bleaching it through the game's filmic tone map.
          material.toneMapped = false; material.color.set('#185c25'); material.emissive.setRGB(.012, 1, .055); material.emissiveIntensity = 1.8;
        }
      }
    });
    library.set(id, model);
  }
}

export function mountSeat(id: MountId, passenger = false): { seatY: number; seatZ: number } {
  const model = library.get(id);
  if (!model) throw new Error(`Mount assets not loaded: ${id}`);
  return passenger && id === 'wayfarer-stag'
    ? { seatY: model.userData.passengerSeatY, seatZ: model.userData.passengerSeatZ }
    : model.userData as { seatY: number; seatZ: number };
}

export function mountRiderOffset(avatar: THREE.Group, id: MountId, passenger = false): number {
  return mountSeat(id, passenger).seatY - avatar.getObjectByName('left-leg')!.position.y;
}

export function mountBob(time: number, moving: boolean, upgraded = false, id?: MountId, airborne = false): number {
  if (id === 'verdant-revenant') return .95 + Math.sin(time * 1.65) * .13 + Math.sin(time * .73) * .045;
  if (airborne) return 0;
  return moving ? .025 + (1 - Math.cos(time * (upgraded ? 15 : 12))) * .055 : Math.sin(time * 2.1) * .012;
}

export function makeMount(id: MountId): THREE.Group {
  const source = library.get(id);
  if (!source) throw new Error(`Mount assets not loaded: ${id}`);
  const group = new THREE.Group(), model = id === 'verdant-revenant' ? cloneSkeleton(source) : source.clone(true);
  group.name = `riding-${id}`;
  model.position.set(0, 0, 0); model.quaternion.identity(); model.scale.setScalar(1); group.add(model);
  const part = (name: string) => model.getObjectByName(`${id}-${name}`)!;
  const body = part('body'), head = part('head'), tail = part('tail');
  const legs = legNames.map(part), knees = legNames.map(name => model.getObjectByName(`${id}-${name}-knee`));
  const tailSegments: THREE.Object3D[] = [];
  model.traverse(node => {
    if (node.name.startsWith(`${id}-tail-flow-`)) tailSegments.push(node);
    if (node instanceof THREE.SkinnedMesh) node.frustumCulled = false;
  });
  const mane = model.getObjectByName(`${id}-mane`);
  let flame: THREE.ShaderMaterial | undefined;
  if (mane) {
    flame = flameMaterial.clone();
    mane.traverse(node => {
      if (node instanceof THREE.Mesh) { node.material = flame!; node.castShadow = node.receiveShadow = false; }
    });
  }
  const rest = [body, head, tail, ...legs, ...tailSegments, ...[...knees, mane].filter((node): node is THREE.Object3D => !!node)].map(node => ({ node, position: node.position.clone(), rotation: node.quaternion.clone(), scale: node.scale.clone() }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3).setUsage(THREE.DynamicDrawUsage));
  const reins = new THREE.LineSegments(geometry, reinsMaterial); reins.name = 'rider-reins'; reins.frustumCulled = false; reins.visible = false; group.add(reins);
  const parts: Record<string, THREE.Object3D | undefined> = { body, head, tail };
  legNames.forEach((name, index) => { parts[name] = legs[index]; parts[`${name}-knee`] = knees[index]; });
  let spirits: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;
  if (id === 'verdant-revenant') {
    const motes = new THREE.BufferGeometry();
    motes.setAttribute('position', new THREE.BufferAttribute(new Float32Array(108 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    motes.setAttribute('life', new THREE.BufferAttribute(new Float32Array(108), 1).setUsage(THREE.DynamicDrawUsage));
    motes.setAttribute('radius', new THREE.BufferAttribute(new Float32Array(108), 1).setUsage(THREE.DynamicDrawUsage));
    motes.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.8, -1), 7);
    spirits = new THREE.Points(motes, spiritMaterial); spirits.name = 'verdant-spirit-motes'; group.add(spirits);
  }
  rigs.set(group, { id, parts, model, body, head, tail, legs, knees, rest, reins, tailSegments, mane, flame, spirits });
  return group;
}

/** Leaves the caller's world transform intact. Pass the posed rider to keep both reins in their palms. */
export function animateMount(group: THREE.Group, time: number, moving: boolean, upgraded = false, rider?: THREE.Group, jump?: { grounded: boolean; velocity: number }, effects: 'off' | 'low' | 'high' = 'high', bloom = true): void {
  const rig = rigs.get(group); if (!rig || !Number.isFinite(time)) return;
  for (const part of rig.rest) { part.node.position.copy(part.position); part.node.quaternion.copy(part.rotation); part.node.scale.copy(part.scale); }
  const airborne = !!jump && !jump.grounded;
  const phase = time * (upgraded ? 15 : 12), breath = Math.sin(time * 2.1);
  rig.model.position.y = mountBob(time, moving, upgraded, rig.id, airborne);

  const idle = applyIdleAnimation(rig.id === 'store-embermane' ? 'horse' : rig.id === 'store-cinderfang' ? 'wolf' : rig.id, group, rig.parts, time, !moving && !airborne);
  if (!idle || moving || airborne) {
    rig.head.rotation.x += rig.spirits ? Math.sin(time * 1.65 + .7) * .055 : moving ? Math.sin(phase + .5) * .055 : breath * .018;
    rig.head.rotation.y += moving && !rig.spirits ? 0 : Math.sin(time * .7) * .035;
    rig.tail.rotation.y += Math.sin(time * (rig.spirits ? 1.65 : moving ? 6 : 2)) * (rig.spirits ? .14 : moving ? .20 : .12);
    if (rig.spirits) rig.tail.rotation.x += Math.sin(time * 1.65 - .5) * .07;
    rig.tail.rotation.x += moving && !rig.spirits ? -.16 : 0;
    for (let index = 0; index < rig.legs.length; index++) {
      // The dragon folds its legs back into a glide; ground mounts retain their canter.
      const stride = Math.sin(phase + legPhases[index]);
      rig.legs[index].rotation.x += rig.spirits ? Math.sin(time * 1.65 - index * .65) * .10 + (moving ? airborne ? .16 : index < 2 ? 1 : .7 : 0) : airborne ? (index < 2 ? -.85 : .6) : moving ? stride * .62 : 0;
      if (rig.knees[index]) rig.knees[index]!.rotation.x += airborne ? .8 : rig.spirits ? Math.sin(time * 1.65 - index * .65 + .6) * .08 + (moving ? index < 2 ? 1.25 : 1 : 0) : moving ? Math.max(0, -stride) * .70 : 0;
    }
  }
  if (rig.spirits) {
    if (rig.flame) rig.flame.uniforms.time.value = time;
    rig.tailSegments.forEach((node, index) => {
      const tip = index / 13, wave = time * (moving ? 2.5 : 1.95) - index * .48;
      // A travelling bend grows toward the tip, giving the trailing half a loose sideways slither.
      node.rotation.z += Math.sin(wave) * (.07 + Math.pow(tip, 1.4) * .32);
      node.rotation.x += Math.sin(wave + .9) * (.015 + tip * .025);
    });
    if (rig.mane) { rig.mane.rotation.y += Math.sin(time * 2.1) * .075; rig.mane.rotation.x += Math.sin(time * 1.65 + .7) * .06; }
    const motes = rig.spirits; motes.visible = effects !== 'off';
    if (motes.visible) {
      const count = effects === 'low' ? 36 : 108;
      motes.geometry.setDrawRange(0, count);
      const positions = motes.geometry.getAttribute('position'), lives = motes.geometry.getAttribute('life'), radii = motes.geometry.getAttribute('radius');
      // Fixed-size, time-sampled embers keep every rider independent without spawning objects per frame.
      group.updateWorldMatrix(true, true);
      spiritWorldToLocal.copy(group.matrixWorld).invert();
      for (let i = 0; i < count; i++) {
        if (i < 12) {
          const origin = i < 2 ? rig.mane ?? rig.head : i === 2 ? rig.head : i < 5 ? rig.body : i < 9 ? rig.legs[i - 5] : rig.tailSegments[(i - 9) * 4 + 4] ?? rig.tail;
          spiritOrigin.set(i === 0 ? -.95 : i === 1 ? .95 : 0, i < 2 ? .10 : i === 2 ? .95 : i < 5 ? .25 : -.10, i < 2 ? -.55 : i === 4 ? -.8 : 0)
            .applyMatrix4(origin.matrixWorld).applyMatrix4(spiritWorldToLocal);
          positions.setXYZ(i, spiritOrigin.x, spiritOrigin.y, spiritOrigin.z);
          lives.setX(i, bloom ? .5 + Math.sin(time * 1.7 + i) * .10 : 0);
          radii.setX(i, (i < 3 ? 4.3 : i < 5 ? 3.2 : 2.0) * (1 + Math.sin(time * 1.7 + i) * .08));
          continue;
        }
        const life = ((time * (moving ? .65 : .4) + i * .61803398875) % 1 + 1) % 1;
        const angle = time * .8 + i * 2.39996323, spread = .12 + life * .4;
        const origin = i % 3 === 0 ? rig.head : i % 3 === 1 ? rig.tailSegments.at(-1) ?? rig.tail : rig.legs[i % 4];
        spiritOrigin.set(0, i % 3 === 0 ? .5 : -.15, 0).applyMatrix4(origin.matrixWorld).applyMatrix4(spiritWorldToLocal);
        positions.setXYZ(i, spiritOrigin.x + Math.cos(angle) * spread, spiritOrigin.y + life * 1.1, spiritOrigin.z + Math.sin(angle) * spread - (moving ? life * 1.8 : 0));
        lives.setX(i, life);
        radii.setX(i, .09 + Math.sin(life * Math.PI) * .18);
      }
      positions.needsUpdate = true; lives.needsUpdate = true; radii.needsUpdate = true;
    }
  }
  const leftArm = rider?.getObjectByName('left-arm'), rightArm = rider?.getObjectByName('right-arm');
  rig.reins.visible = !!leftArm && !!rightArm;
  if (rig.reins.visible) {
    rider!.updateMatrixWorld(true); group.updateMatrixWorld(true);
    const positions = rig.reins.geometry.getAttribute('position') as THREE.BufferAttribute;
    const anchor = rig.head.userData.reinAnchor as number[] | undefined;
    for (let side = 0; side < 2; side++) {
      hand.set(0, -.625, .04); (side ? rightArm! : leftArm!).localToWorld(hand); group.worldToLocal(hand);
      bridle.set((side ? -1 : 1) * (anchor?.[0] ?? .25), anchor?.[1] ?? -.20, anchor?.[2] ?? .52);
      rig.head.localToWorld(bridle); group.worldToLocal(bridle);
      middle.copy(hand).lerp(bridle, .5); middle.y -= .065;
      const start = side * 4;
      positions.setXYZ(start, hand.x, hand.y, hand.z);
      positions.setXYZ(start + 1, middle.x, middle.y, middle.z);
      positions.setXYZ(start + 2, middle.x, middle.y, middle.z);
      positions.setXYZ(start + 3, bridle.x, bridle.y, bridle.z);
    }
    positions.needsUpdate = true;
  }
}

export function disposeMount(group: THREE.Group): void {
  const rig = rigs.get(group); rig?.reins.geometry.dispose(); rig?.spirits?.geometry.dispose(); rig?.flame?.dispose();
  rig?.model.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); });
  rigs.delete(group); group.removeFromParent();
}
