import type { DungeonHazard, EnemyAttack } from './shared.ts';
import type { EnemyKind } from './content.ts';
import { dungeonThemeId, type DungeonId } from './dungeon.ts';

export type DungeonHazardKind = 'roots' | 'fire' | 'frost' | 'shadow';
export interface DungeonHazardSource { kind: EnemyKind; x: number; z: number; dungeonBoss?: boolean }
export interface DungeonHazardSpec {
  x: number; z: number; r: number; innerR?: number; delayMs: number;
  kind: DungeonHazardKind; label: string; damageScale: number; leap?: boolean;
}
export interface DungeonHazardPlan { cooldownMs: number; hazards: DungeonHazardSpec[] }

/** Positions are locked when the warning starts; the server validates walls before queuing. */
export function dungeonHazardPattern(id: DungeonId, source: DungeonHazardSource, target: { x: number; z: number }, sequence = 0): DungeonHazardPlan | null {
  id = dungeonThemeId(id);
  // Combat targets can contain cyclic session references; warnings only need a locked position.
  target = { x: target.x, z: target.z };
  const boss = source.dungeonBoss === true;
  if (id === 'rootvault' && (boss || source.kind === 'briar-sentinel')) return {
    cooldownMs: boss ? 6500 : 7000,
    hazards: [{ ...target, r: boss ? 4.5 : 2.4, delayMs: 1800, kind: 'roots', label: 'Root eruption · move out', damageScale: boss ? 1 : .7 }],
  };
  if (id === 'cindercrypt' && boss) {
    const dx = target.x - source.x, dz = target.z - source.z, length = Math.hypot(dx, dz) || 1;
    return { cooldownMs: 7500, hazards: [-2, -1, 0, 1, 2].map((offset, index) => ({
      x: target.x + dx / length * offset * 3.4, z: target.z + dz / length * offset * 3.4,
      r: 2.5, delayMs: 1500 + index * 300, kind: 'fire', label: 'Furnace sweep · sidestep the row', damageScale: .8,
    })) };
  }
  if (id === 'frosthollow' && (boss || source.kind === 'ice-wisp' || source.kind === 'frost-yeti')) {
    const core = boss && sequence % 2 === 1;
    return { cooldownMs: boss ? 7000 : 8000, hazards: [{
      x: source.x, z: source.z, r: core ? 5 : boss ? 10 : 5.8, ...(core ? {} : { innerR: boss ? 3.5 : 2.2 }),
      delayMs: boss ? 2000 : 1700, kind: 'frost', label: core ? 'Frozen core · move out' : 'Frost ring · move inside or beyond', damageScale: boss ? 1 : .7,
    }] };
  }
  if (id === 'nightroot' && (boss || source.kind === 'void-stalker')) return {
    cooldownMs: boss ? 7000 : 7500,
    hazards: [
      { ...target, r: boss ? 3.4 : 2.7, delayMs: 1500, kind: 'shadow', label: 'Shadow leap · leave the mark', damageScale: boss ? .9 : .7, leap: true },
      ...(boss ? [{ ...target, r: 5.5, delayMs: 2600, kind: 'shadow' as const, label: 'Shadow echo · keep moving', damageScale: .8 }] : []),
    ],
  };
  if (id === 'plagueworks') {
    if (source.kind === 'fungal-thrall') return { cooldownMs: 9000, hazards: [{ x: source.x, z: source.z, r: 4.2, delayMs: 2000, kind: 'roots', label: 'Spore bloom · move away from the thrall', damageScale: .65 }] };
    if (source.kind === 'carrion-hound') return { cooldownMs: 8500, hazards: [{ ...target, r: 2.3, delayMs: 1500, kind: 'roots', label: 'Carrion pounce · sidestep the mark', damageScale: .6, leap: true }] };
    if (source.kind === 'sewer-horror') return { cooldownMs: 10500, hazards: [
      { x: source.x, z: source.z, r: 4.5, delayMs: 2100, kind: 'roots', label: 'Sewer rupture · leave the brute’s reach', damageScale: .7 },
      { ...target, r: 2.4, delayMs: 3000, kind: 'roots', label: 'Sewer aftershock · leave the second mark', damageScale: .55 },
    ] };

    if (source.kind === 'broodmother-vex') return { cooldownMs: 7000, hazards: [-1, 0, 1].map((offset, index) => ({
      x: target.x + offset * 4, z: target.z, r: 2.7, delayMs: 1800 + index * 400, kind: 'roots', label: 'Brood cascade · leave the egg marks', damageScale: .8,
    })) };
    if (source.kind === 'plague-abomination') return { cooldownMs: 8000, hazards: [
      { x: source.x, z: source.z, r: sequence % 2 ? 4.5 : 9, ...(sequence % 2 ? {} : { innerR: 3.5 }), delayMs: 2200, kind: 'roots', label: sequence % 2 ? 'Toxic heart · move away' : 'Plague tide · shelter inside the ring', damageScale: 1.1 },
      { ...target, r: 3, delayMs: 3200, kind: 'roots', label: 'Ruptured vial · leave the marked ground', damageScale: .8 },
    ] };
    if (source.kind === 'crypt-weaver' || source.kind === 'plague-alchemist') return { cooldownMs: 8000, hazards: [{ ...target, r: 2.7, delayMs: 1800, kind: 'roots',
      label: source.kind === 'crypt-weaver' ? 'Venom web · leave the mark' : 'Plague flask · leave the mark', damageScale: .7 }] };
  }
  if (id === 'emberfall') {
    if (source.kind === 'slag-elemental') return { cooldownMs: 9500, hazards: [{ x: source.x, z: source.z, r: 4.8, delayMs: 2100, kind: 'fire', label: 'Slag surge · leave the molten core', damageScale: .7 }] };
    if (source.kind === 'ash-drake') {
      const dx = target.x - source.x, dz = target.z - source.z, length = Math.hypot(dx, dz) || 1;
      return { cooldownMs: 10000, hazards: [1, 2, 3].map((step, index) => ({ x: source.x + dx / length * step * 2.5, z: source.z + dz / length * step * 2.5,
        r: 2, delayMs: 1800 + index * 300, kind: 'fire', label: 'Ash breath · sidestep the advancing row', damageScale: .55 })) };
    }
    if (source.kind === 'chain-jailer') return { cooldownMs: 9500, hazards: [{ x: source.x, z: source.z, r: 5.5, innerR: 2.2, delayMs: 2100, kind: 'fire', label: 'Chain sweep · move inside or beyond', damageScale: .65 }] };

    if (source.kind === 'anvil-warden') return { cooldownMs: 7500, hazards: [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]].map(([x, z], index) => ({
      x: source.x + x, z: source.z + z, r: 2.5, delayMs: 2000 + index * 180, kind: 'fire', label: 'Anvil fracture · step between the arms', damageScale: .85,
    })) };
    if (source.kind === 'pyrelord-ignivar') return { cooldownMs: 8000, hazards: [
      { x: source.x, z: source.z, r: sequence % 2 ? 5 : 10, ...(sequence % 2 ? {} : { innerR: 4 }), delayMs: 2300, kind: 'fire', label: sequence % 2 ? 'Crucible core · leave the center' : 'Crown of cinders · move inside the ring', damageScale: 1.1 },
      { ...target, r: 3, delayMs: 3400, kind: 'fire', label: 'Falling slag · keep moving', damageScale: .85 },
    ] };
    if (source.kind === 'furnace-revenant') return { cooldownMs: 8000, hazards: [{ ...target, r: 2.8, delayMs: 1800, kind: 'fire', label: 'Furnace brand · leave the mark', damageScale: .7 }] };
  }
  if (id === 'veilhaven') {
    if (source.kind === 'grave-fox') return { cooldownMs: 8500, hazards: [{ ...target, r: 2.2, delayMs: 1600, kind: 'shadow', label: 'Gravefox feint · leave the spirit mark', damageScale: .6, leap: true }] };
    if (source.kind === 'incense-acolyte') return { cooldownMs: 9000, hazards: [{ x: source.x, z: source.z, r: 4.5, delayMs: 1900, kind: 'frost', label: 'Incense cloud · leave the censer’s reach', damageScale: .65 }] };
    if (source.kind === 'spirit-koi') {
      const dx = target.x - source.x, dz = target.z - source.z, length = Math.hypot(dx, dz) || 1;
      return { cooldownMs: 9500, hazards: [-1, 1].map((side, index) => ({ x: target.x + dz / length * side * 2.2, z: target.z - dx / length * side * 2.2,
        r: 1.8, delayMs: 1800 + index * 450, kind: 'frost', label: 'Spirit ripples · stay between the waves', damageScale: .5 })) };
    }

    if (source.kind === 'bellkeeper-shen') return { cooldownMs: 8000, hazards: [
      { x: source.x, z: source.z, r: 6, innerR: 2.5, delayMs: 2000, kind: 'frost', label: 'First toll · shelter beside the bell', damageScale: .85 },
      { x: source.x, z: source.z, r: 10, innerR: 6.5, delayMs: 3000, kind: 'frost', label: 'Second toll · follow the fading ring', damageScale: .9 },
    ] };
    if (source.kind === 'veiled-abbess') return { cooldownMs: 8000, hazards: [
      { ...target, r: 3.2, delayMs: 1900, kind: 'shadow', label: 'Veilstep · leave the spirit mark', damageScale: .8, leap: true },
      { ...target, r: 9, innerR: 4, delayMs: 3100, kind: 'frost', label: 'Mourning veil · return to the quiet center', damageScale: 1 },
      { ...target, r: 3.5, delayMs: 4300, kind: 'shadow', label: 'Final lament · leave the center again', damageScale: 1 },
    ] };
    if (source.kind === 'lantern-wraith') return { cooldownMs: 8000, hazards: [{ ...target, r: 2.7, delayMs: 1800, kind: 'frost', label: 'Wandering soul · leave the lantern mark', damageScale: .7, leap: true }] };
    if (source.kind === 'jade-sentinel') return { cooldownMs: 8500, hazards: [{ x: source.x, z: source.z, r: 6, innerR: 2.5, delayMs: 2000, kind: 'frost', label: 'Jade resonance · move inside or beyond', damageScale: .75 }] };
  }
  return null;
}

export function dungeonDeathHazardPattern(id: DungeonId, source: DungeonHazardSource): DungeonHazardPlan | null {
  id = dungeonThemeId(id);
  if (id === 'plagueworks' && source.kind === 'corpse-scarab') return { cooldownMs: 0,
    hazards: [{ x: source.x, z: source.z, r: 2.8, delayMs: 1900, kind: 'roots', label: 'Carrion spores · leave the scarab shell', damageScale: .55 }] };

  return (id === 'cindercrypt' && source.kind === 'ember-beetle') || (id === 'emberfall' && source.kind === 'slag-crawler') ? {
    cooldownMs: 0,
    hazards: [{ x: source.x, z: source.z, r: 3.8, delayMs: 1600, kind: 'fire', label: source.kind === 'slag-crawler' ? 'Molten carapace · leave the corpse' : 'Volatile shell · leave the corpse', damageScale: .85 }],
  } : null;
}

/** The center of an annulus is truly safe, matching the displayed warning. */
export function dungeonHazardContains(hazard: { x: number; z: number; r: number; innerR?: number }, point: { x: number; z: number }): boolean {
  const d = Math.hypot(point.x - hazard.x, point.z - hazard.z);
  return d <= hazard.r && d >= (hazard.innerR ?? 0);
}

/** Display contact matches the server impact; recovery never delays damage. */
export function dungeonHazardAttack(hazard: DungeonHazard, source?: {x:number;z:number;rotation?:number}): EnemyAttack {
  return { id: hazard.id, style: hazard.kind === 'roots' || hazard.kind === 'fire' ? 'slam' : 'pulse', dungeonHazard: true,
    x: hazard.x, z: hazard.z, rotation: source && Math.hypot(hazard.x-source.x,hazard.z-source.z)>.01 ? Math.atan2(hazard.x-source.x,hazard.z-source.z) : source?.rotation ?? 0, targetId: '', radius: hazard.r, startedAt: hazard.startedAt, impactAt: hazard.endsAt, endsAt: hazard.endsAt + 450 };
}
