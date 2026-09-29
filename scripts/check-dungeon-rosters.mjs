import assert from 'node:assert/strict';
import { MONSTERS, THEMED_DUNGEON_ROSTERS, monsterStatsAtLevel, BASIC_ATTACK } from '../src/bestiary.ts';
import { dungeonStages, getDungeon } from '../src/dungeon.ts';
import { combatStats, GEAR_SETS, EQUIPMENT_SLOTS, maxHealth } from '../src/progression.ts';

const unique = new Set(Object.values(THEMED_DUNGEON_ROSTERS).flat());
assert.equal(unique.size, 36, 'three distinct twelve-creature rosters are three times the original twelve models');
const populations = { plagueworks: 93, emberfall: 93, veilhaven: 96 };
for (const [id, kinds] of Object.entries(THEMED_DUNGEON_ROSTERS)) {
  const definition = getDungeon(id), stages = dungeonStages(id), enemies = stages.flatMap(stage => stage.enemies), bosses = enemies.filter(enemy => enemy.boss);
  assert.equal(kinds.length, 12); assert.equal(stages.length, 24); assert.equal(enemies.length, populations[id]);
  assert.deepEqual([...new Set(enemies.map(enemy => enemy.kind))].sort(), [...kinds].sort(), 'every catalog identity spawns in its own dungeon');
  assert.equal(bosses.length, 2); assert.deepEqual(bosses.map(enemy => enemy.kind), kinds.slice(-2), 'the original midpoint and final boss are unchanged');
  const regular = kinds.slice(0, -2).map(kind => MONSTERS[kind]);
  assert(regular.some(stats => stats.speed >= 4 && stats.hp < 80), `${id}: a fast fragile melee role`);
  assert(regular.some(stats => stats.hp >= 100 && stats.speed <= 2.8), `${id}: a durable slow tank role`);
  assert(regular.some(stats => stats.range >= 5.5 && ['spit', 'pulse'].includes(stats.attackStyle)), `${id}: a ranged caster role`);
  assert(regular.some(stats => stats.windupMs >= 1200 && stats.attackRadius >= 2.1), `${id}: a telegraphed area attacker`);
  assert(new Set(regular.map(stats => stats.attackStyle)).size >= 5, `${id}: attacks use a diverse shared style vocabulary`);
  let worstBasic = 0, worstSpecial = 0;
  for (const kind of kinds) {
    const stats = MONSTERS[kind], occurrences = enemies.filter(enemy => enemy.kind === kind);
    assert.equal(stats.model, kind, `${kind}: a real, individually addressable model rather than an alias`);
    assert(stats.height > .4 && stats.height < 6 && stats.level >= definition.minLevel && stats.level <= definition.maxLevel);
    assert(occurrences.length >= (bosses.some(enemy => enemy.kind === kind) ? 1 : 2), `${kind}: every regular type appears more than once`);
    assert(stages.filter(stage => stage.enemies.some(enemy => enemy.kind === kind)).length >= (occurrences[0].boss ? 1 : 2), `${kind}: regular types inhabit multiple authored rooms`);
    assert(Object.values(stats).every(value => typeof value !== 'number' || Number.isFinite(value) && value >= 0));
    assert(stats.windupMs >= 500 && stats.cooldownMs >= stats.windupMs + stats.recoveryMs);
    assert(monsterStatsAtLevel(kind, definition.maxLevel).hp > monsterStatsAtLevel(kind, definition.minLevel).hp, 'shared continuous scaling remains active');
  }
  for (const stage of stages) {
    assert(new Set(stage.enemies.map(enemy => enemy.kind)).size >= 2, `${stage.id}: packs mix combat roles`);
    const level = stage.level, set = GEAR_SETS.filter(set => set.className === 'Ranger' && set.requiredLevel <= level).at(-1);
    const equipment = Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, slot === 'ring2' ? null : `${set.id}-${slot === 'ring1' ? 'ring' : slot}`]));
    const player = { level, appearance: { className: 'Ranger' }, equipment, talents: [] }, health = maxHealth(player), defense = combatStats(player).defense;
    for (const enemy of stage.enemies.filter(enemy => !enemy.boss)) for (const partySize of [1, 4]) {
      const scaled = monsterStatsAtLevel(enemy.kind, level), scale = (1 + (level - 10) * .07) * (1 + (partySize - 1) * .15);
      const basic = Math.max(1, Math.round(scaled.damage * scale * BASIC_ATTACK.damageScale) - defense) / health;
      const special = Math.max(1, Math.round(scaled.damage * scale) - defense) / health;
      assert(basic < .4 && special < .65, `${id}/${enemy.kind}: regular attacks remain survivable with same-level equipment in solo/four-player groups`);
      worstBasic = Math.max(worstBasic, basic); worstSpecial = Math.max(worstSpecial, special);
    }
  }
  console.log(`PASS ${id}: 12 distinct creatures, ${enemies.length} spawns in 24 encounters; maximum ordinary hit ${(worstBasic * 100).toFixed(1)}% basic / ${(worstSpecial * 100).toFixed(1)}% special of equipped health.`);
}
console.log('PASS: 36 unique model identities, all thirty regular types recur across multiple rooms, six original bosses, distinct combat roles and shared level/party balance.');
