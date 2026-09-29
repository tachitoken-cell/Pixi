import assert from 'node:assert/strict';
import { BASIC_ATTACK, MONSTERS, WORLD_BOSSES, WORLD_BOSS_GROUP_SIZE, WORLD_BOSS_BERSERK_MS, basicAttackCooldown, monsterLevelScale, monsterStatsAtLevel } from '../src/bestiary.ts';
import { EQUIPMENT_SLOTS, GEAR, GEAR_SETS, TALENTS, earnedTalentPoints, canLearnTalent, combatStats, talentsValid } from '../src/progression.ts';
import { GLOBAL_ATTACK_MS, SPELLS, spellCastTimeMs, spellDamage, spellTotalDamage, spellsForClass } from '../src/spells.ts';
import { AUTO_ATTACKS, autoAttackDamage } from '../src/auto-attacks.ts';

// Balance estimate, not a server combat simulation. Five four-person parties each
// bring a Knight, Ranger, Mage and Cleric. Healers do not contribute damage.
// Vendor gear, legal talent progression and learned spells are available at the
// boss's level. 25% damage downtime covers dodges, charge pursuit and recovery.
const uptime = .75, sampleMs = 180000, partyCount = WORLD_BOSS_GROUP_SIZE / 4;
const classes = ['Knight', 'Ranger', 'Mage', 'Cleric'];
const primaryBranches = { Knight: 'Vanguard', Ranger: 'Marksmanship', Mage: 'Fire', Cleric: 'Radiance' };
const defenseBranches = { Knight: 'Sentinel', Ranger: 'Pathfinder', Mage: 'Arcane', Cleric: 'Devotion' };

function adventurer(className, level) {
  const set = GEAR_SETS.filter(set => set.className === className && set.requiredLevel <= level).at(-1);
  const equipment = Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, `${set.id}-${slot.startsWith('ring') ? 'ring' : slot}`]));
  const player = { level: 1, appearance: { className }, equipment, talents: [] };
  const choices = Object.values(TALENTS).filter(talent => talent.className === className).sort((a, b) => {
    const branchOrder = talent => talent.branch === primaryBranches[className] ? 0 : talent.branch === defenseBranches[className] ? 1 : 2;
    return branchOrder(a) - branchOrder(b) || a.row - b.row || a.column - b.column;
  });
  for (; player.level <= level; player.level++) {
    const talent = choices.find(talent => canLearnTalent(player, talent.id));
    if (talent) player.talents.push(talent.id);
  }
  player.level = level;
  assert(talentsValid(player));
  assert.equal(player.talents.length, earnedTalentPoints(level));
  assert(Object.values(equipment).every(id => GEAR[id].requiredLevel <= level));
  return { ...player, stats: combatStats(player), hp: 100 + (level - 1) * 12, set: set.id };
}

function damageRotation(player, enemyLevel) {
  const duration = spell => Math.max(GLOBAL_ATTACK_MS, spell.channel?.durationMs ?? spellCastTimeMs(spell));
  const power = spell => spellTotalDamage(spell, player.stats) / monsterLevelScale(enemyLevel, player.level);
  const known = spellsForClass(player.appearance.className).filter(spell => spell.requiredLevel <= player.level && spell.effect === 'damage');
  const filler = known.find(spell => spell.requiredLevel === 1);
  // Six damage buttons leave two hotbar slots for defensive skills or utilities.
  const buttons = [...known.filter(spell => spell !== filler).sort((a, b) => power(b) / duration(b) - power(a) / duration(a)).slice(0, 5), filler];
  const ready = new Map(), casts = new Map();
  let total = 0, at = 0;
  while (at < sampleMs) {
    const spell = buttons.filter(spell => (ready.get(spell.id) || 0) <= at).sort((a, b) => power(b) / duration(b) - power(a) / duration(a))[0];
    if (!spell) { at = Math.min(...buttons.map(spell => ready.get(spell.id))); continue; }
    if (at + duration(spell) > sampleMs) break;
    total += power(spell);
    casts.set(spell.id, (casts.get(spell.id) || 0) + 1);
    // Core hardcasts have no extra cooldown; strategic cooldowns begin at release.
    ready.set(spell.id, at + (spell.channel ? 0 : spellCastTimeMs(spell)) + spell.cooldownMs);
    at += duration(spell);
  }
  // Spell releases defer automatic hits; adding their idle DPS here is incorrect.
  const autoDps = autoAttackDamage(player.appearance.className, player.stats) / (AUTO_ATTACKS[player.appearance.className].cooldownMs / 1000);
  return { dps: total / (sampleMs / 1000), autoDps, casts: Object.fromEntries(casts) };
}

assert.equal(WORLD_BOSS_GROUP_SIZE, 20);
assert.equal(WORLD_BOSS_BERSERK_MS, 210000);
const rows = [], failures = [];
for (const boss of WORLD_BOSSES) {
  const stats = MONSTERS[boss.kind], level = stats.level;
  assert.equal(monsterLevelScale(level, level), 1);
  assert.deepEqual(monsterStatsAtLevel(boss.kind, level), stats, 'bosses must not receive frontier scaling twice');
  const players = Object.fromEntries(classes.map(className => [className, adventurer(className, level)]));
  const rotations = Object.fromEntries(classes.slice(0, 3).map(className => [className, damageRotation(players[className], level)]));
  const raidDps = partyCount * Object.values(rotations).reduce((sum, rotation) => sum + rotation.dps, 0) * uptime;
  const killSeconds = stats.hp / raidDps;
  const tank = players.Knight, healer = players.Cleric;
  const basic = Math.max(1, Math.round(stats.damage * BASIC_ATTACK.damageScale) - tank.stats.defense);
  const enragedBasic = Math.max(1, Math.round(stats.damage * BASIC_ATTACK.damageScale * 1.25) - tank.stats.defense);
  const largestSpecial = Math.max(...boss.attacks.map(attack => Math.round(stats.damage * attack.damageScale * 1.25)));
  const heal = spellDamage(SPELLS.heal, healer.stats), healHps = heal / (spellCastTimeMs(SPELLS.heal) / 1000);
  const normalTankDps = basic / (basicAttackCooldown(boss.kind) / 1000);
  const enragedTankDps = enragedBasic / (basicAttackCooldown(boss.kind) / 1000);
  const groupHeal = level >= SPELLS['prayer-of-healing'].requiredLevel ? spellDamage(SPELLS['prayer-of-healing'], healer.stats) : 0;
  rows.push({ boss: boss.name, level, hp: stats.hp, damage: stats.damage, playerHp: tank.hp,
    raidDps: +raidDps.toFixed(1), seconds20: +killSeconds.toFixed(1), seconds10: +(killSeconds * 2).toFixed(1),
    knightDps: +rotations.Knight.dps.toFixed(1), rangerDps: +rotations.Ranger.dps.toFixed(1), mageDps: +rotations.Mage.dps.toFixed(1),
    basic, enragedBasic, largestSpecial, heal, healHps: +healHps.toFixed(1), partyHealPerPerson: groupHeal });
  if (killSeconds < 120 || killSeconds > 180) failures.push(`${boss.name}: 20-person expected kill ${killSeconds.toFixed(1)}s outside 120–180s`);
  assert(killSeconds * 1000 < WORLD_BOSS_BERSERK_MS, '20-player party must finish before berserk');
  assert(killSeconds * 2 * 1000 > WORLD_BOSS_BERSERK_MS, 'ten equivalent players must exceed the berserk window');
  if (basic < tank.hp * .2 || basic > tank.hp * .35) failures.push(`${boss.name}: basic hit must cost 20–35% of same-level Knight health`);
  if (largestSpecial < tank.hp * .65 || largestSpecial > tank.hp * .9) failures.push(`${boss.name}: largest enraged special should cost 65–90% of unarmored health`);
  if (healHps * .75 <= enragedTankDps) failures.push(`${boss.name}: one attentive Cleric should sustain a tank while avoiding specials`);
  if (healHps * .3 >= normalTankDps) failures.push(`${boss.name}: boss pressure must require active healing`);
  assert(boss.description.includes(`about ${WORLD_BOSS_GROUP_SIZE}`) && boss.description.includes(`level ${level}`));
  assert(boss.description.includes('berserk after 3½ minutes'));
  if (process.argv.includes('--details')) console.log(JSON.stringify({ boss: boss.name, players, rotations }, null, 2));
}
console.table(rows);
assert.deepEqual(failures, []);
console.log('World-boss balance passed: 20 same-level players, five independent healing parties, 120–180s target and survivable healing pressure.');
