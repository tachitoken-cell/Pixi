import { SPELLS, type AbilityId, type Spell } from './spells.ts';

export function spellOutOfRange(spell: Spell, target: { distance: number; hostile: boolean } | null) {
  return !!target && spell.targeting !== 'radial' && spell.targetRelation !== 'self'
    && (spell.targetRelation === 'hostile') === target.hostile && target.distance > spell.range;
}

export function damageOverTimeLabels(effects: readonly { ability: AbilityId; sourceId: string; expiresAt: number }[] | undefined, sourceId: string, now: number, chilledUntil = 0) {
  return (effects ?? []).filter(effect => effect.sourceId === sourceId && effect.expiresAt > now && SPELLS[effect.ability])
    .map(effect => `${effect.ability === 'arrow' ? 'Toxic Arrows' : SPELLS[effect.ability].label} ${Math.ceil((effect.expiresAt - now) / 1000)}s`)
    .concat(chilledUntil > now ? [`Chilled ${Math.ceil((chilledUntil - now) / 1000)}s`] : []).join(' · ');
}
