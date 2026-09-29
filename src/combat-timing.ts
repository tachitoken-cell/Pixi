import type { CombatEvent } from './shared.ts';
import { SPELLS } from './spells.ts';

export const RADIAL_SWEEPS: Record<string,{delay:number;duration:number;radius:number;reach:number}> = {
  ...Object.fromEntries(Object.values(SPELLS).map(spell=>[spell.id,{delay:spell.effect==='damage'?.18:0,duration:spell.effect==='shield'?1.2:.7,radius:.4,reach:spell.effect==='damage'?spell.range+.1:2}])),
  'venom-detonation': { delay:0, duration:.42, radius:SPELLS['venom-detonation'].range, reach:SPELLS['venom-detonation'].range },
  shatter: { delay:0, duration:.42, radius:SPELLS.shatter.range, reach:SPELLS.shatter.range },
  nova: { delay: 0.18, duration: 0.70, radius: 0.4, reach: SPELLS.nova.range + .1 },
  strike: { delay: 0.18, duration: 0.42, radius: 1.4, reach: SPELLS.strike.range + .1 },
  whirlwind: { delay: 0.18, duration: 0.65, radius: 1.55, reach: SPELLS.whirlwind.range + .1 },
  'arcane-burst': { delay: 0.24, duration: 0.65, radius: 0.4, reach: SPELLS['arcane-burst'].range + .1 },
  cleave: { delay: 0.3, duration: 0.48, radius: 1.2, reach: SPELLS.cleave.range + .1 },
  shockwave: { delay: 0.42, duration: 0.7, radius: 0.5, reach: SPELLS.shockwave.range + .1 },
  'shield-bash': { delay: 0.2, duration: 0.32, radius: 1.0, reach: SPELLS['shield-bash'].range + .1 },
};

/** A thrown shield or ricochet moves through ordered targets, each hop starting at the previous impact. */
export function shieldThrowHops(from: { x: number; z: number }, targets: readonly { x: number; z: number }[]) {
  let origin = from, delay = .18;
  return targets.map(target => {
    const hop = { from:{ x:origin.x, z:origin.z }, delay, flight:Math.max(.2, Math.min(.9, Math.hypot(target.x-origin.x, target.z-origin.z)/15)) };
    origin = target; delay += hop.flight;
    return hop;
  });
}

/** Seconds from the accepted cast; shared by authoritative damage and visible impacts. */
export function combatTiming(ability: CombatEvent['ability'], distance: number, index = 0) {
  const spell=SPELLS[ability];
  if(spell.effect!=='damage' || ability === 'shatter' || ability === 'venom-detonation')return {delay:0,flight:0};
  if(ability === 'arcane-volley')return {delay:.18+index*.08,flight:Math.max(.2,Math.min(.9,distance/15))};
  if(spell.visual==='meteor') return { delay: .55, flight: .9 };
  if (ability === 'power-shot') return { delay: .5, flight: Math.max(.25, Math.min(.7, distance / 25)) };
  if (ability === 'multishot') return { delay: .22 + index * .055, flight: Math.max(.25, Math.min(.7, distance / 20)) };
  if (ability === 'poison-shot' || ability === 'frostbolt') return { delay: .22, flight: Math.max(.25, Math.min(.9, distance / (ability === 'frostbolt' ? 12 : 19))) };
  if (ability === 'arrow' || ability === 'fireball' || ability === 'volley') {
    const volley = ability === 'volley';
    return { delay: 0.18 + (volley ? index * 0.045 : 0),
      flight: Math.max(volley ? 0.38 : 0.22, Math.min(0.85, distance / (ability === 'fireball' ? 13 : volley ? 16 : 21))) };
  }
  if(spell.visual==='projectile')return {delay:.18,flight:Math.max(.2,Math.min(.9,distance/(spell.className==='Ranger'&&ability!=='ricochet-shot'?21:15)))};
  const sweep = RADIAL_SWEEPS[ability];
  return { delay: sweep.delay, flight: sweep.duration * Math.max(0, Math.min(1, (distance - sweep.radius) / (sweep.reach - sweep.radius))) };
}
