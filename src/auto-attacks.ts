import type { CharacterClass } from './shared.ts';
import type { AbilityId } from './spells.ts';
import { combatTiming } from './combat-timing.ts';

export const AUTO_ATTACK_ANIMATION_MS = 700;

interface AutoAttack {
  ability: AbilityId;
  range: number;
  cooldownMs: number;
  damageScale: number;
  visual: 'melee' | 'projectile';
  impactMs?: number;
}

// These are weapon actions; sharing a spell's visual ID does not require learning it.
export const AUTO_ATTACKS: Record<CharacterClass, AutoAttack> = {
  Ranger: { ability: 'arrow', range: 13.5, cooldownMs: 2000, damageScale: .55, visual: 'projectile' },
  Knight: { ability: 'strike', range: 3, cooldownMs: 1800, damageScale: .55, visual: 'melee', impactMs: 300 },
  Mage: { ability: 'fireball', range: 15, cooldownMs: 2400, damageScale: .55, visual: 'projectile' },
  Cleric: { ability: 'smite', range: 3, cooldownMs: 2100, damageScale: .55, visual: 'melee', impactMs: 300 },
};

/** Seconds from weapon-action acceptance to launch/contact and projectile arrival. */
export function autoAttackTiming(className: CharacterClass, distance: number) {
  const attack = AUTO_ATTACKS[className];
  if (attack.visual === 'melee') return { delay: attack.impactMs! / 1000, flight: 0 };
  return combatTiming(attack.ability, Number.isFinite(distance) ? Math.max(0, distance) : 0);
}

export function autoAttackDamage(className: CharacterClass, stats: { primaryDamage: number; damageMultiplier?: number }) {
  return Math.max(1, Math.round(stats.primaryDamage * AUTO_ATTACKS[className].damageScale * (stats.damageMultiplier ?? 1)));
}
