import * as THREE from 'three';
import { WATER_LEVEL, WORLD_BOUNDS, waterAt } from './landscape.ts';
import { disposeWorldGroup } from './world.ts';

export type Swimmer = { id?: string; x: number; z: number; rotation?: number; moving?: boolean };
type Actor = Swimmer & { phase: number; seen: boolean; fresh: boolean; stroke: number; trail: number; px: number; pz: number };
type Particle = { kind: 'ring' | 'splash' | 'drop'; x: number; z: number; born: number; life: number; size: number; vx: number; vz: number; vy: number; turn: number };
const MAX_SWIMMERS = 64, MAX_PARTICLES = 512, SURFACE = WATER_LEVEL + .065;

/** Visual only: fixed instance buffers, with identity-stable strokes and short-lived wakes. */
export function createSwimEffects(parent: THREE.Group, asset?: THREE.Group) {
  const root = new THREE.Group(); root.name = 'Landscape: swimming effects'; parent.add(root);
  root.userData.collision = 'effect';
  const actors = new Map<string, Actor>(), particles: Particle[] = [];
  let cursor = 0, clock = 0, disposed = false;
  const pose = new THREE.Object3D();
  asset?.updateMatrixWorld(true);
  function geometry(name: string, fallback: () => THREE.BufferGeometry) {
    const mesh = asset?.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh)) return fallback();
    const result = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    result.deleteAttribute('color'); return result;
  }
  function batch(name: string, shape: THREE.BufferGeometry, count: number, tint: number) {
    const opacity = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
    shape.setAttribute('effectOpacity', opacity);
    const material = new THREE.MeshBasicMaterial({ color: tint, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float effectOpacity; varying float waterEffectOpacity;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nwaterEffectOpacity = effectOpacity;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float waterEffectOpacity;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= waterEffectOpacity;');
    };
    material.customProgramCacheKey = () => 'mossvale-swim-fade-v1';
    const mesh = new THREE.InstancedMesh(shape, material, count);
    mesh.name = `Landscape: swimmer ${name}`; mesh.count = 0; mesh.renderOrder = 3; mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(mesh);
    return mesh;
  }
  const rings = batch('ripples', new THREE.RingGeometry(.94, 1, 32).rotateX(-Math.PI / 2), MAX_SWIMMERS * 2 + MAX_PARTICLES, 0xcbf8f1);
  const wakes = batch('wakes', geometry('wake', () => new THREE.RingGeometry(.8, 1, 16, 1, Math.PI * .18, Math.PI * .64).rotateX(-Math.PI / 2)), MAX_SWIMMERS, 0xd5fff6);
  const splashes = batch('splashes', geometry('splash', () => new THREE.CylinderGeometry(.72, .4, .45, 12, 1, true).translate(0, .225, 0)), MAX_PARTICLES, 0xc8f4f0);
  const drops = batch('droplets', geometry('droplet', () => new THREE.OctahedronGeometry(.5)), MAX_PARTICLES, 0xe6ffff);
  if (asset) disposeWorldGroup(asset);
  const batches = [rings, wakes, splashes, drops];
  function draw(mesh: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, turn: number, alpha: number) {
    if (mesh.count === mesh.instanceMatrix.count) return;
    pose.position.set(x, y, z); pose.rotation.set(0, turn, 0); pose.scale.set(sx, sy, sz); pose.updateMatrix();
    mesh.setMatrixAt(mesh.count, pose.matrix);
    (mesh.geometry.getAttribute('effectOpacity') as THREE.InstancedBufferAttribute).setX(mesh.count++, Math.max(0, alpha));
  }
  function emit(kind: Particle['kind'], x: number, z: number, size: number, life: number, turn = 0, vx = 0, vz = 0, vy = 0) {
    particles[cursor] = { kind, x, z, size, life, turn, vx, vz, vy, born: clock };
    cursor = (cursor + 1) % MAX_PARTICLES;
  }
  function burst(actor: Actor, entry: boolean, side = 1) {
    const turn = actor.rotation ?? 0, fx = Math.sin(turn), fz = Math.cos(turn), rx = Math.cos(turn), rz = -Math.sin(turn);
    const x = actor.x + (entry ? 0 : rx * side * .46 + fx * .2), z = actor.z + (entry ? 0 : rz * side * .46 + fz * .2);
    if (!waterAt(x, z)) return;
    emit('ring', x, z, entry ? 1.7 : .75, entry ? 1.6 : 1.1);
    if (entry) emit('splash', x, z, 1.0, .65, actor.phase * Math.PI * 2);
    for (let i = 0; i < (entry ? 12 : 5); i++) {
      const angle = i * 2.39996 + actor.phase * 6.28, force = entry ? 1.1 : .62;
      emit('drop', x, z, .07 + (i % 3) * .025, .68 + (i % 3) * .08, angle,
        Math.sin(angle) * force + (entry ? 0 : rx * side * .5 - fx * .3),
        Math.cos(angle) * force + (entry ? 0 : rz * side * .5 - fz * .3), 1.7 + (i % 4) * .24);
    }
  }
  return {
    setSwimmers(points: readonly Swimmer[]) {
      if (disposed) return;
      for (const actor of actors.values()) actor.seen = false;
      let count = 0;
      for (let i = 0; i < points.length && count < MAX_SWIMMERS; i++) {
        const point = points[i];
        if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || point.x < WORLD_BOUNDS.minX || point.x > WORLD_BOUNDS.maxX || point.z < WORLD_BOUNDS.minZ || point.z > WORLD_BOUNDS.maxZ || !waterAt(point.x, point.z)) continue;
        const id = point.id ?? `slot-${i}`; let actor = actors.get(id);
        if (actor?.seen) continue;
        if (!actor) {
          let hash = 0; for (let j = 0; j < id.length; j++) hash = (Math.imul(hash, 31) + id.charCodeAt(j)) >>> 0;
          actor = { x: point.x, z: point.z, px: point.x, pz: point.z, phase: (hash % 997) / 997, seen: true, fresh: true, stroke: -1, trail: -Infinity };
          actors.set(id, actor);
        }
        actor.x = point.x; actor.z = point.z; actor.rotation = Number.isFinite(point.rotation) ? point.rotation : 0;
        actor.moving = point.moving; actor.seen = true; count++;
      }
      for (const [id, actor] of actors) if (!actor.seen) actors.delete(id);
    },
    update(time: number) {
      if (disposed || !Number.isFinite(time)) return;
      const dt = Math.max(0, time - clock); clock = time;
      for (const mesh of batches) mesh.count = 0;
      for (const actor of actors.values()) {
        const travelled = Math.hypot(actor.x - actor.px, actor.z - actor.pz);
        const moving = actor.moving ?? (dt > 0 && travelled / dt > .15);
        const stroke = Math.floor(time * 5.4 / Math.PI); // Same alternating arm cycle as animateCharacter.
        if (actor.fresh) { burst(actor, true); actor.fresh = false; actor.stroke = stroke; }
        if (moving && stroke !== actor.stroke) burst(actor, false, stroke % 2 ? -1 : 1);
        actor.stroke = stroke;
        for (let wave = 0; wave < 2; wave++) {
          const phase = (time * .65 + actor.phase + wave * .5) % 1, radius = .36 + phase * 1.1;
          draw(rings, actor.x, SURFACE, actor.z, radius, 1, radius * (moving ? .72 : .86), actor.rotation ?? 0, (1 - phase) * (moving ? .23 : .38));
        }
        if (moving) {
          const pulse = 1 + Math.sin(time * 10.8) * .07;
          draw(wakes, actor.x, SURFACE + .012, actor.z, pulse, 1, pulse, actor.rotation ?? 0, .42);
          if (travelled > .001 && time - actor.trail > .18) {
            emit('ring', actor.x, actor.z, .85, 1.25); actor.trail = time;
          }
        }
        actor.px = actor.x; actor.pz = actor.z;
      }
      for (const p of particles) {
        const age = time - p.born, t = age / p.life;
        if (t < 0 || t >= 1) continue;
        const x = p.x + p.vx * age, z = p.z + p.vz * age;
        if (!waterAt(x, z)) continue;
        if (p.kind === 'ring') {
          const size = .2 + t * p.size;
          draw(rings, x, SURFACE + .004, z, size, 1, size * .82, p.turn, (1 - t) ** 2 * .42);
        } else if (p.kind === 'splash') {
          draw(splashes, x, SURFACE, z, p.size * (.6 + t), Math.sin(Math.PI * t) * .9 + .05, p.size * (.6 + t), p.turn, (1 - t) * .68);
        } else {
          const y = SURFACE + .08 + p.vy * age - 3.8 * age * age;
          if (y <= SURFACE) continue;
          const size = p.size * (1 - t * .6);
          draw(drops, x, y, z, size, size * 1.6, size, p.turn + age, (1 - t) * .88);
        }
      }
      for (const mesh of batches) {
        mesh.instanceMatrix.needsUpdate = true;
        (mesh.geometry.getAttribute('effectOpacity') as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    },
    dispose() { if (!disposed) { disposed = true; actors.clear(); particles.length = 0; disposeWorldGroup(root); } },
  };
}
