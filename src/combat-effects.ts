import * as THREE from 'three';
import { combatTiming, RADIAL_SWEEPS, shieldThrowHops } from './combat-timing.ts';
import { SPELLS, type AbilityId } from './spells.ts';
import { AUTO_ATTACKS, autoAttackTiming } from './auto-attacks.ts';
import { graphics } from './graphics-settings.ts';
import { createSpellEffectDetails } from './spell-effect-details.ts';

export type CombatAbility = AbilityId;
export interface CombatEffectEvent {
  ability: CombatAbility;
  basic?: boolean;
  effectPhase?: 'impact';
  playerId?: string;
  from: { x: number; z: number };
  targets: { id: string; x: number; z: number }[];
  /** Character heading in radians; forward is +Z. Used for attacks without a target. */
  rotation?: number;
}

type Point = { x: number; y: number; z: number };
interface Projectile {
  from: Point; to: Point; delay: number; flight: number; arc: number;
  targetId?: string; released: boolean; impacted: boolean; bendX: number; bendZ: number;
}
interface Effect {
  ability: CombatAbility; basic?: boolean; playerId?: string; start: number; end: number; x: number; z: number; rotation: number;
  effectPhase?: 'impact';
  projectiles: Projectile[];
}

const MAX_EFFECTS = 16;
const MAX_VOXELS = 1536;
const IMPACT_LIFETIME = 0.42;
const abilities = new Set(Object.keys(SPELLS));
// Persisted ability IDs keep world effects independent of replaceable spellbook art.
const fireProjectiles = new Set<AbilityId>(['combustion', 'explosive-arrow', 'fireball', 'cinderbolt', 'pyroblast', 'inferno-beam']);
const frostProjectiles = new Set<AbilityId>(['shatter', 'hamstring-shot', 'frost-arrow', 'tranquilizing-shot', 'frostfall-volley', 'frostbolt', 'ice-lance', 'frozen-orb', 'deep-freeze', 'blizzard', 'glacial-spike', 'winterstorm']);
const palette = {
  wood: '#d8ad6d', feather: '#a5e5bd', steel: '#e8f4ed',
  orange: '#f57932', amber: '#ffbf51', cream: '#fff4be', ember: '#e1502c',
  holy: '#ffe49a', healing: '#a0efbb', ward: '#8cdeed',
  violet: '#b99fff', ice: '#d4f4ff', gold: '#f9d77c', poison: '#9dea65', frost: '#61cce8', arcane: '#c689ff',
};
type Tint = keyof typeof palette;

/** Cosmetic, bounded effects. Damage stays server-owned. clear() also releases GPU resources. */
export function createCombatEffects(scene: THREE.Scene, resolveTarget?: (id: string) => { x: number; y?: number; z: number } | undefined, groundHeight: (x: number, z: number) => number = () => 0,
  resolveOrigin?: (playerId: string, ability: CombatAbility, out: THREE.Vector3) => boolean) {
  const effects: Effect[] = [];
  const details = createSpellEffectDetails(scene, groundHeight);
  const colors = Object.fromEntries(Object.entries(palette).map(([key, value]) => [key, new THREE.Color(value)])) as Record<Tint, THREE.Color>;
  const block = new THREE.Object3D();
  const local = new THREE.Vector3();
  const releaseOrigin = new THREE.Vector3();
  const direction = new THREE.Quaternion();
  const angles = new THREE.Euler(0, 0, 0, 'YXZ');
  const point: Point = { x: 0, y: 0, z: 0 };
  let mesh: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | undefined;
  let count = 0;

  function ensureMesh() {
    if (mesh) return;
    mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX_VOXELS);
    mesh.name = 'combat-effects';
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.raycast = () => {};
    scene.add(mesh);
  }

  function voxel(x: number, y: number, z: number, w: number, h: number, d: number, color: Tint, rotation = 0, oriented = false) {
    if (!mesh || count >= MAX_VOXELS) return;
    block.position.set(x, y, z);
    block.scale.set(w, h, d);
    if (oriented) block.quaternion.copy(direction);
    else block.rotation.set(0, rotation, 0);
    block.updateMatrix();
    mesh.setMatrixAt(count, block.matrix);
    mesh.setColorAt(count++, colors[color]);
  }

  function arrowPart(x: number, y: number, z: number, w: number, h: number, d: number, color: Tint) {
    local.set(x, y, z).applyQuaternion(direction);
    voxel(point.x + local.x, point.y + local.y, point.z + local.z, w, h, d, color, 0, true);
  }

  function trajectory(projectile: Projectile, progress: number) {
    const t = Math.max(0, Math.min(1, progress));
    const bend = Math.sin(t * Math.PI);
    point.x = projectile.from.x + (projectile.to.x - projectile.from.x) * t + projectile.bendX * bend;
    point.z = projectile.from.z + (projectile.to.z - projectile.from.z) * t + projectile.bendZ * bend;
    point.y = projectile.from.y + (projectile.to.y - projectile.from.y) * t + 4 * projectile.arc * t * (1 - t);
  }

  function projectileVoxels(effect: Effect, projectile: Projectile, age: number, index: number) {
    const elapsed = age - projectile.delay;
    if (elapsed < 0) return;
    if (!projectile.released) {
      projectile.released = true;
      // Read the posed weapon/hand once at release; movement never drags an airborne shot.
      // Late events that have already landed need only their original impact, not a new launch.
      if (['powerful-throw', 'ricochet-shot'].includes(effect.ability) && index > 0) Object.assign(projectile.from, effect.projectiles[index-1].to);
      else if (elapsed < projectile.flight && SPELLS[effect.ability].visual !== 'meteor' && effect.playerId && resolveOrigin) {
        releaseOrigin.set(NaN, NaN, NaN);
        if (resolveOrigin(effect.playerId, effect.ability, releaseOrigin) && Number.isFinite(releaseOrigin.x) && Number.isFinite(releaseOrigin.y) && Number.isFinite(releaseOrigin.z)) {
          projectile.from.x = releaseOrigin.x; projectile.from.y = releaseOrigin.y; projectile.from.z = releaseOrigin.z;
        }
      }
    }
    if (!projectile.impacted) {
      const target = projectile.targetId ? resolveTarget?.(projectile.targetId) : undefined;
      if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
        projectile.to.x = target.x;
        projectile.to.z = target.z;
        if (Number.isFinite(target.y)) projectile.to.y = target.y!;
      }
      // Keep the final hit point even after the enemy moves, disappears or respawns.
      if (elapsed >= projectile.flight) projectile.impacted = true;
    }
    const progress = projectile.flight > 0 ? elapsed / projectile.flight : 1;
    const spell=SPELLS[effect.ability],meteor=spell.visual==='meteor',frost=frostProjectiles.has(spell.id)||spell.status?.kind==='slow'&&spell.className==='Mage',poison=spell.school==='poison',power=effect.ability==='power-shot';
    const holy=!effect.basic&&spell.className==='Cleric',fire=!effect.basic&&!holy&&(fireProjectiles.has(spell.id)||meteor),magic=spell.className==='Mage'&&!fire;
    const boltTint:Tint=holy?'holy':frost?'frost':'arcane',glint:Tint=holy?'cream':frost?'ice':'violet';
    const detail=graphics.effects==='off'?0:graphics.effects==='low'?.25:1;
    if (progress < 1) {
      trajectory(projectile, progress);
      if (!effect.basic) {
        const x = point.x, y = point.y, z = point.z;
        const drawn = details.projectile(effect.ability, elapsed, progress, projectile.flight, point, (at, out) => {
          trajectory(projectile, at); out.set(point.x, point.y, point.z);
        });
        point.x = x; point.y = y; point.z = z;
        if (drawn) return;
      }
      if (fire) {
        voxel(point.x, point.y, point.z, (meteor ? .9 : .48), (meteor ? .9 : .48), (meteor ? .9 : .48), 'orange', elapsed * 7);
        voxel(point.x, point.y + 0.06, point.z, 0.36, 0.53, 0.36, 'amber', -elapsed * 9);
        voxel(point.x, point.y + 0.08, point.z, 0.25, 0.30, 0.54, 'cream', elapsed * 7);
        for (let i = 0; i < 6*detail; i++) {
          const angle = elapsed * 6 + i * Math.PI / 3;
          voxel(point.x + Math.cos(angle) * 0.30, point.y + Math.sin(angle * 1.4) * 0.28, point.z + Math.sin(angle) * 0.30,
            0.14, 0.14, 0.14, i % 2 ? 'amber' : 'orange', angle);
        }
        // Sample earlier positions for a continuous trail with no particle emitters or allocations.
        for (let i = 1; i <= 15*detail; i++) {
          const before = (elapsed - i * 0.014) / projectile.flight;
          if (before < 0) break;
          trajectory(projectile, before);
          const size = 0.27 * (1 - i / 18);
          const jitter = Math.sin(i * 3.7 + elapsed * 17) * i * 0.008;
          voxel(point.x + jitter, point.y + jitter, point.z - jitter, size, size, size, i < 5 ? 'amber' : i < 10 ? 'orange' : 'ember', i);
        }
      } else if (frost || magic || holy) {
        voxel(point.x, point.y, point.z, .22, .22, .65, glint, elapsed * 5);
        for (let i = 0; i < 4*detail; i++) {
          const a = i * Math.PI / 2 + elapsed * 5;
          voxel(point.x + Math.sin(a) * .19, point.y + Math.cos(a) * .19, point.z, .10, .10, .30, boltTint, a);
        }
        for (let i = 1; i <= 9*detail; i++) {
          const before = (elapsed - i * .02) / projectile.flight; if (before < 0) break;
          trajectory(projectile, before); const size = .13 * (1 - i / 11);
          voxel(point.x, point.y, point.z, size, size, size, i % 2 ? boltTint : glint, i);
        }
      } else {
        const bendSlope = Math.cos(progress * Math.PI) * Math.PI;
        const dx = projectile.to.x - projectile.from.x + projectile.bendX * bendSlope;
        const dz = projectile.to.z - projectile.from.z + projectile.bendZ * bendSlope;
        const dy = projectile.to.y - projectile.from.y + 4 * projectile.arc * (1 - 2 * progress);
        angles.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ');
        direction.setFromEuler(angles);
        arrowPart(0, 0, 0, power ? .10 : .065, power ? .10 : .065, power ? 1.25 : .90, power ? 'gold' : 'wood');
        arrowPart(0, 0, power ? .64 : .47, .17, .12, .20, poison ? 'poison' : 'steel');
        arrowPart(0, 0, 0.60, 0.085, 0.08, 0.09, 'steel');
        arrowPart(0, 0, -0.33, 0.22, 0.045, 0.22, 'feather');
        arrowPart(0, 0, -0.33, 0.045, 0.22, 0.22, 'feather');
        if (['volley','multishot','power-shot','poison-shot'].includes(effect.ability)) for (let i = 1; i <= (power || poison ? 8 : 3)*detail; i++) {
          const before = (elapsed - i * 0.025) / projectile.flight;
          if (before < 0) break;
          trajectory(projectile, before);
          voxel(point.x, point.y, point.z, 0.06, 0.06, 0.06, poison ? 'poison' : power ? 'gold' : 'feather');
        }
      }
    } else {
      const lifetime = poison && spell.id !== 'venom-detonation' ? 2.6 : meteor ? .8 : IMPACT_LIFETIME;
      const impact = (elapsed - projectile.flight) / lifetime;
      if (impact > 1) return;
      const impactDx=projectile.to.x-projectile.from.x-projectile.bendX*Math.PI,impactDz=projectile.to.z-projectile.from.z-projectile.bendZ*Math.PI;
      const impactHeading=Math.hypot(impactDx,impactDz)>.0001?Math.atan2(impactDx,impactDz):effect.rotation;
      if (!effect.basic && details.impact(effect.ability, projectile.to.x, projectile.to.y, projectile.to.z, impact, index, impactHeading)) return;
      const total = (meteor ? 40 : fire ? 24 : frost || poison ? 16 : 7)*detail;
      for (let i = 0; i < total; i++) {
        const angle = i * 2.39996 + index;
        const radius = impact * (meteor ? 3.5 : fire ? 1.25 : poison ? 1.0 : frost ? .8 : .50) * (0.65 + (i % 3) * 0.15);
        const size = (fire ? 0.23 : 0.11) * (1 - impact);
        voxel(projectile.to.x + Math.cos(angle) * radius, projectile.to.y + Math.sin(angle * 2.1) * radius + impact * 0.24,
          projectile.to.z + Math.sin(angle) * radius, size, size, size, holy? (i%2?'holy':'cream') : magic&&!frost?'arcane' : fire ? (i % 3 ? 'orange' : 'cream') : frost ? (i % 2 ? 'ice' : 'frost') : poison ? 'poison' : power ? 'gold' : 'steel', angle + impact * 4);
      }
      if (fire) voxel(projectile.to.x, projectile.to.y, projectile.to.z, (1 - impact) * 0.55, (1 - impact) * 0.55, (1 - impact) * 0.55, 'amber', impact * 6);
      else if (!detail) voxel(projectile.to.x, projectile.to.y, projectile.to.z, (1-impact)*.15, (1-impact)*.15, (1-impact)*.15, holy?glint:frost?'ice':poison?'poison':magic?'arcane':'steel');
    }
  }

  function radialVoxels(effect: Effect, age: number) {
    const spell=SPELLS[effect.ability];
    if(effect.effectPhase==='impact'){
      const progress=age/.7,base=groundHeight(effect.x,effect.z);
      if(details.impact(effect.ability,effect.x,base+.5,effect.z,progress,0,effect.rotation))return;
      const radius=5*progress;
      for(let i=0;i<12;i++){const angle=i/12*Math.PI*2,size=.16*(1-progress);voxel(effect.x+Math.sin(angle)*radius,base+.2,effect.z+Math.cos(angle)*radius,size,size,size,'gold',angle);}
      return;
    }
    if(spell.effect!=='damage'){
      const shield=spell.effect==='shield',duration=shield?1.2:.7,progress=age/duration;
      if(progress<0||progress>=1)return;
      const base=groundHeight(effect.x,effect.z),radius=shield?1.0: .3+progress*.9;
      if (details.radial(effect.ability, effect.x, effect.z, effect.rotation, progress, radius)) return;
      for(let i=0;i<36;i++){
        const angle=i/12*Math.PI*2+age*1.8,y=base+.3+(i%3)*.55+(shield?0:progress*1.2),size=.12*(1-progress);
        voxel(effect.x+Math.sin(angle)*radius,y,effect.z+Math.cos(angle)*radius,size,shield?size: size*2,size,shield?'ward':i%3?'healing':'holy',angle);
      }
      return;
    }
    const arcane = effect.ability === 'arcane-burst', shockwave = effect.ability === 'shockwave', bash = effect.ability === 'shield-bash';
    const nova = spell.className==='Mage'||spell.className==='Cleric'||shockwave, whirlwind = spell.className==='Knight'&&spell.targeting==='radial';
    const sweep = RADIAL_SWEEPS[effect.ability as keyof typeof RADIAL_SWEEPS];
    const progress = Math.max(0, Math.min(1, (age - sweep.delay) / sweep.duration));
    if (age < sweep.delay || progress >= 1) return;
    const size = (1 - progress) * (nova ? 0.24 : 0.18);
    const pieces = nova ? 48 : whirlwind ? 32 : effect.ability === 'cleave' ? 24 : 15;
    const radius = sweep.radius + progress * (sweep.reach - sweep.radius);
    if (details.radial(effect.ability, effect.x, effect.z, effect.rotation, progress, radius)) return;
    for (let i = 0; i < pieces; i++) {
      const angle = nova || whirlwind ? i / pieces * Math.PI * 2 + progress * (whirlwind ? 8 : 0.5)
        : effect.ability === 'cleave' ? effect.rotation - 1.5 + i / (pieces - 1) * 3 : effect.rotation - 1.05 + i / (pieces - 1) * 2.1 + progress * 0.70;
      voxel(effect.x + Math.sin(angle) * radius, groundHeight(effect.x + Math.sin(angle) * radius, effect.z + Math.cos(angle) * radius) + (nova ? 0.20 + Math.sin(i * 1.7) * 0.08 : 1.0 + Math.sin(angle * 2 + progress * 6) * 0.16),
        effect.z + Math.cos(angle) * radius, size, nova ? size * (1 + Math.sin(i) * 0.4) : size * 0.42, size,
        spell.className==='Cleric'?(i%3?'holy':'cream'):shockwave ? (i % 3 ? 'gold' : 'amber') : arcane ? (i % 3 ? 'arcane' : 'violet') : nova ? (i % 3 ? 'ice' : 'violet') : bash ? 'gold' : (i % 3 ? 'steel' : 'gold'), angle);
      if (nova && graphics.effects!=='off' && i % (graphics.effects==='low'?8:2) === 0) voxel(effect.x + Math.sin(angle) * radius * 0.92, groundHeight(effect.x + Math.sin(angle) * radius * .92, effect.z + Math.cos(angle) * radius * .92) + 0.25 + progress * (0.4 + i % 4 * 0.18),
        effect.z + Math.cos(angle) * radius * 0.92, size * .6, size * (shockwave ? 3.5 : 1.6), size * .6, shockwave ? 'amber' : 'violet', angle);
    }
  }

  function play(event: CombatEffectEvent, nowSeconds: number) {
    if (!Number.isFinite(nowSeconds) || !abilities.has(event.ability) || !Number.isFinite(event.from.x) || !Number.isFinite(event.from.z)) return;
    const rotation = Number.isFinite(event.rotation) ? event.rotation! : 0;
    const spell=SPELLS[event.ability],instantBurst=event.ability==='shatter'||event.ability==='venom-detonation',basicMelee=!!event.basic&&AUTO_ATTACKS[spell.className].visual==='melee',ranged = instantBurst||!!event.basic||spell.visual !== 'radial'&&spell.effect==='damage';
    const validTargets = event.targets.filter(target => Number.isFinite(target.x) && Number.isFinite(target.z));
    if(event.effectPhase==='impact'&&event.ability==='adamant-guardian'){
      effects.push({ability:event.ability,effectPhase:'impact',start:nowSeconds,end:nowSeconds+.7,x:event.from.x,z:event.from.z,rotation,projectiles:[]});
      while(effects.length>MAX_EFFECTS)effects.shift();ensureMesh();return;
    }
    if(spell.effect!=='damage'){
      for(const target of validTargets){effects.push({ability:event.ability,playerId:event.playerId,start:nowSeconds,end:nowSeconds+(spell.effect==='shield'?1.2:.7),x:target.x,z:target.z,rotation,projectiles:[]});}
      while(effects.length>MAX_EFFECTS)effects.shift();ensureMesh();return;
    }
    const effect: Effect = { ability: event.ability, basic:!!event.basic, playerId: event.playerId, start: nowSeconds, end: nowSeconds, x: event.from.x, z: event.from.z, rotation, projectiles: [] };
    if (ranged) {
      const hops = ['powerful-throw', 'ricochet-shot'].includes(event.ability) ? shieldThrowHops(event.from, validTargets) : undefined;
      const total = event.ability==='poison-cloud'?1:instantBurst ? validTargets.length : event.ability === 'volley' ? Math.max(5, validTargets.length) : Math.max(1, validTargets.length);
      for (let i = 0; i < total; i++) {
        const target = validTargets[i % validTargets.length];
        const fallbackAngle = rotation + (total > 1 ? (i - 2) * 0.10 : 0);
        const to = { x: target?.x ?? event.from.x + Math.sin(fallbackAngle) * 9, y: 0, z: target?.z ?? event.from.z + Math.cos(fallbackAngle) * 9 };
        to.y = groundHeight(to.x, to.z) + .75;
        const hop = hops?.[i], from = hop?.from || event.from;
        const dx = to.x - from.x, dz = to.z - from.z, distance = Math.hypot(dx, dz);
        const offset = hop && i > 0 ? 0 : distance > 0.01 ? Math.min(0.55, distance * 0.2) / distance : 0;
        const timing = hop || (event.basic ? autoAttackTiming(spell.className,distance) : combatTiming(event.ability, distance, i));
        // Spread in mid-flight, then converge on the exact target without changing hit timing.
        const bend = hops ? 0 : total > 1 ? (i - (total - 1) / 2) * 0.12 : 0;
        const projectile = {
          from: spell.visual === 'meteor' ? {x:to.x - 3,y:to.y + 12,z:to.z - 2} : { x: from.x + dx * offset, y: groundHeight(from.x,from.z) + (hop && i > 0 ? .75 : event.ability === 'fireball' || event.ability === 'frostbolt' ? 1.60 : 1.40), z: from.z + dz * offset }, to,
          delay: timing.delay, flight: timing.flight, targetId: target?.id, released: basicMelee, impacted: false,
          bendX: Math.cos(rotation) * bend, bendZ: -Math.sin(rotation) * bend,
          arc: spell.visual === 'meteor' ? 0 : hops ? .25 : event.ability === 'multishot' ? .3 : total > 1 ? 1.7 + i % 3 * 0.35 : event.ability === 'fireball' || event.ability === 'frostbolt' ? .12 : .25,
        };
        effect.projectiles.push(projectile);
        effect.end = Math.max(effect.end, nowSeconds + projectile.delay + projectile.flight + (spell.school === 'poison' && spell.id !== 'venom-detonation' ? 2.6 : spell.visual === 'meteor' ? .8 : IMPACT_LIFETIME));
      }
    } else {
      const sweep = RADIAL_SWEEPS[event.ability as keyof typeof RADIAL_SWEEPS];
      effect.end = nowSeconds + sweep.delay + sweep.duration;
    }
    if (effects.length >= MAX_EFFECTS) effects.shift();
    effects.push(effect);
    ensureMesh();
  }

  function update(nowSeconds: number) {
    if (!mesh || !Number.isFinite(nowSeconds)) return;
    count = 0;
    details.begin();
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      if (nowSeconds >= effect.end) { effects.splice(i, 1); continue; }
      const age = nowSeconds - effect.start;
      if (age < 0) continue;
      if (effect.projectiles.length) for (let j = 0; j < effect.projectiles.length; j++) projectileVoxels(effect, effect.projectiles[j], age, j);
      else radialVoxels(effect, age);
    }
    details.finish();
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function clear() {
    effects.length = 0;
    details.clear();
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = undefined;
  }

  return { play, update, clear };
}
