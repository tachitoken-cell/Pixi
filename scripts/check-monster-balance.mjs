import assert from 'node:assert/strict';
import { BASIC_ATTACK, MONSTERS, WORLD_BOSSES, monsterStatsAtLevel } from '../src/bestiary.ts';
import { EQUIPMENT_SLOTS, GEAR_SETS, combatStats, maxHealth } from '../src/progression.ts';

const legacy = (kind, level) => {
  const stats = MONSTERS[kind], frontier = Math.max(0, level - 30);
  return { hp: Math.round(stats.hp * (1 + frontier * .35)), damage: Math.round(stats.damage * (1 + frontier * .2)),
    xp: Math.round(stats.xp * (1 + frontier * .15)), gold: Math.round(stats.gold * (1 + frontier * .08)) };
};
for (const [kind, base] of Object.entries(MONSTERS)) {
  const authored = kind === 'training-dummy' || WORLD_BOSSES.some(boss => boss.kind === kind);
  assert.equal(monsterStatsAtLevel(kind, 1), base, 'onboarding keeps its existing level-one encounters');
  let previous = base;
  for (let level = 2; level <= 60; level++) {
    const stats = monsterStatsAtLevel(kind, level), before = legacy(kind, level);
    if (authored) { assert.equal(stats, base, 'training and raid encounters retain authored stats'); continue; }
    assert.equal(stats.xp, before.xp, 'combat tuning does not inflate XP');
    assert.equal(stats.gold, before.gold, 'combat tuning does not inflate gold');
    assert.equal(stats.windupMs, base.windupMs, 'telegraph reaction windows remain intact');
    assert.equal(stats.cooldownMs, base.cooldownMs);
    if (kind === 'treasure-goblin') { assert.equal(stats.hp, before.hp, 'escape encounters retain their existing health'); assert.equal(stats.damage, 0); continue; }
    assert(stats.hp > previous.hp && stats.damage >= previous.damage, `${kind}: strength must grow continuously with spawn level`);
    assert(stats.hp > before.hp && stats.damage >= before.damage, `${kind} level ${level}: stronger than the old flat/frontier curve`);
    assert(Math.round(stats.damage * BASIC_ATTACK.damageScale) < (100 + (level - 1) * 12) * .2, 'ordinary basics never remove a fifth of same-level unarmored health');
    previous = stats;
  }
}

// A same-level Ranger in the available vendor set, without talent or upgrade bonuses.
// This is an inspectable balance estimate, not a simulated fight or optimized build.
const rows = [];
for (const [kind, level] of [['moss-slime', 1], ['briar-sentinel', 5], ['stone-golem', 10], ['void-stalker', 20], ['void-stalker', 30], ['void-stalker', 45], ['void-stalker', 60]]) {
  const stats = monsterStatsAtLevel(kind, level), before = legacy(kind, level);
  const set = GEAR_SETS.filter(set => set.className === 'Ranger' && set.requiredLevel <= level).at(-1);
  const equipment = set ? Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, slot === 'ring2' ? null : `${set.id}-${slot === 'ring1' ? 'ring' : slot}`])) : {};
  const player = { level, appearance: { className: 'Ranger' }, equipment, talents: [] }, combat = combatStats(player);
  const hit = Math.max(1, Math.round(stats.damage * BASIC_ATTACK.damageScale) - combat.defense);
  if (level >= 10) {
    assert(hit / maxHealth(player) >= .08 && hit / maxHealth(player) <= .16, 'ordinary basic hits exert pressure without replacing avoidable specials');
    assert(stats.hp / combat.primaryDamage >= 4 && stats.hp / combat.primaryDamage <= 9, 'ordinary foes survive several basic spell hits without becoming raid-sized health sponges');
  }
  rows.push({ monster: kind, level, hpBefore: before.hp, hpAfter: stats.hp, damageBefore: before.damage, damageAfter: stats.damage,
    basicHitPercent: +(100 * hit / maxHealth(player)).toFixed(1), primaryHits: +(stats.hp / combat.primaryDamage).toFixed(1) });
}
console.table(rows);
console.log('PASS monster balance: continuous level 1–60 health/damage, meaningful same-level pressure, preserved onboarding, telegraphs, raid bosses, loot goblins and rewards.');
