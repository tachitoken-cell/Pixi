import assert from 'node:assert/strict';
import { TALENTS, TALENT_VERSION, combatStats, maxHealth, starterGear, migrateTalents, talentsValid, canLearnTalent, availableTalentPoints } from '../src/progression.ts';
import { autoAttackDamage } from '../src/auto-attacks.ts';

const player = (className, talents = []) => ({ level:60, appearance:{ className }, talents, talentVersion:TALENT_VERSION, ...starterGear(className) });
const cases = [
  ['Ranger', 'custom-542f3ce8-e745-484a-9bc3-cb624415b6ff', 'attackSpeedMultiplier', .05],
  ['Ranger', 'custom-f52507bb-80c7-4067-9fa4-0e4beda2f788', 'critChance', .025],
  ['Ranger', 'custom-6805d983-80b3-479e-b8c4-70793d850f4e', 'damageMultiplier', .02],
  ['Mage', 'custom-beae5a3c-4e83-48c4-82f1-bfa05f17d045', 'castSpeedMultiplier', .02],
  ['Mage', 'custom-e1f80f80-e98d-4bdc-8fda-d4dee64dfd2a', 'magicDamageMultiplier', .02],
  ['Mage', 'custom-e591c589-f537-4690-9e68-82a8534027e1', 'critChance', .025],
  ['Knight', 'knight-3', 'critChance', .025],
  ['Knight', 'knight-warlord-5', 'damageMultiplier', .02],
  ['Cleric', 'cleric-judgment-5', 'critChance', .025],
];
for (const [className, id, field, perRank] of cases) {
  const base = combatStats(player(className));
  for (const rank of [1, 2]) {
    const actual = combatStats(player(className, Array(rank).fill(id)));
    assert(Math.abs(actual[field] - base[field] - rank * perRank) < 1e-12, `${id} rank ${rank}: authored ${field}`);
    assert.equal(actual.primaryDamage, base.primaryDamage, 'percentages do not change weapon power');
    assert.equal(actual.specialDamage, base.specialDamage, 'damage percentages do not increase heal/shield power');
    assert.deepEqual(actual.spellBonuses, base.spellBonuses, 'replaced school/cast/healing bonuses are absent');
  }
}
for (const id of ['knight-3', 'knight-sentinel-4', 'knight-warlord-5', 'cleric-radiance-2', 'cleric-devotion-2', 'cleric-judgment-5']) {
  assert.deepEqual(TALENTS[id].stats, {}, `${id} no longer grants its historical flat bonuses`);
  assert.equal(TALENTS[id].spellBonuses, undefined, `${id} no longer grants its historical school/heal/shield bonus`);
}
for (const rank of [0, 1, 2]) {
  const knight = player('Knight', Array(rank).fill('knight-sentinel-4'));
  knight.equipment.head = 'death-horns'; // Includes stamina: percentage health must scale equipped health as well.
  const base = maxHealth({ ...knight, talents:[] });
  assert.equal(maxHealth(knight), Math.round(base * (1 + rank * .05)));
  const stats = combatStats(knight), noTalent = combatStats({ ...knight, talents:[] });
  assert.equal(stats.defense, noTalent.defense); assert.equal(stats.specialDamage, noTalent.specialDamage);
}
for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  assert.equal(autoAttackDamage(className, { primaryDamage:1000, damageMultiplier:1.04 }), 572, 'all damage includes basic attacks');
  assert.equal(autoAttackDamage(className, { primaryDamage:1000 }), 550, 'legacy callers retain their damage');
}

assert.equal(TALENT_VERSION, 7);
const refund = { ...player('Ranger', ['ranger-4', 'ranger-5']), level:4, talentVersion:6 };
assert(!talentsValid(refund), 'old Trail ward allocation violates the increased branch gate');
migrateTalents(refund);
assert.equal(refund.talentVersion, 7); assert.deepEqual(refund.talents, []); assert.equal(availableTalentPoints(refund), 2);
for (const version of [4, 5, 6]) {
  const retained = { ...player('Knight', ['knight-1', 'knight-2', 'knight-3']), talentVersion:version };
  migrateTalents(retained); assert.equal(retained.talentVersion, 7); assert.deepEqual(retained.talents, ['knight-1', 'knight-2', 'knight-3']);
  assert(talentsValid(retained), 'valid allocations and persisted IDs survive migration');
}
for (const talents of [['unknown'], ['mage-1'], null, ['knight-1', 'knight-2', 'knight-3', 'knight-3'], ['custom-e1f80f80-e98d-4bdc-8fda-d4dee64dfd2a']]) {
  const corrupt = { ...player('Knight'), talentVersion:6, talents }, before = structuredClone(corrupt);
  migrateTalents(corrupt); assert.deepEqual(corrupt, before, 'invalid v6 saves cannot exploit migration to gain or refund points');
}
const forgedV6 = { ...player('Mage', ['custom-e1f80f80-e98d-4bdc-8fda-d4dee64dfd2a']), talentVersion:6 };
assert(talentsValid(forgedV6), 'Magic Focus intentionally has no branch gate in the new export');
const beforeForgery = structuredClone(forgedV6); migrateTalents(forgedV6);
assert.deepEqual(forgedV6, beforeForgery, 'a new reachable talent still cannot appear in a version-6 save');
// Every node, including the six additions and all capstones, must be reachable within the real point budget.
for (const target of Object.values(TALENTS)) {
  const build = player(target.className), branch = Object.values(TALENTS).filter(node => node.className === target.className && node.branch === target.branch);
  const learn = node => {
    if (node.prerequisite) while (build.talents.filter(id => id === node.prerequisite).length < node.prerequisiteRank) learn(TALENTS[node.prerequisite]);
    while (!canLearnTalent(build, node.id)) {
      const filler = branch.find(candidate => candidate.id !== node.id && canLearnTalent(build, candidate.id));
      assert(filler, `${target.label}: reachable within twenty points`); build.talents.push(filler.id);
    }
    build.talents.push(node.id);
  };
  for (let rank = 0; rank < target.maxRank; rank++) learn(target);
  assert(talentsValid(build), `${target.label}: valid maximum-rank build`);
}
console.log('PASS: authored talent percentages, damage/power separation, health scaling, all 130 nodes reachable, v7 retention/refunds and corrupt-save rejection.');
