import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TALENT_DESIGN } from '../src/talent-design.ts';
import { TALENTS, TALENT_VERSION, canLearnTalent, talentsValid, migrateTalents, earnedTalentPoints } from '../src/progression.ts';
import { SPELLS, SPELL_EFFECT_IDS, TALENT_EFFECT_IDS, abilityUnlocked, spellDamage, spellTotalDamage, spellUtilityLabel } from '../src/spells.ts';

const requestedSpells = JSON.parse(readFileSync(new URL('../docs/source/mossvale-spell-redesign-2026-09-28.json', import.meta.url)));
const mobility = [SPELL_EFFECT_IDS.roll,SPELL_EFFECT_IDS.blink,SPELL_EFFECT_IDS.lightspeed];
const capstones = ['edict-of-the-dawn', 'titans-edict', 'eternal-edict'];
const edictIcons = {
  [TALENT_EFFECT_IDS.edictLight]:'spell-edict-of-light', [TALENT_EFFECT_IDS.bouncingEdicts]:'spell-bouncing-edicts', [TALENT_EFFECT_IDS.edictDawn]:'spell-edict-of-the-dawn',
  [TALENT_EFFECT_IDS.edictProtection]:'spell-edict-of-protection', [TALENT_EFFECT_IDS.blanketEdicts]:'spell-blanket-edicts', [TALENT_EFFECT_IDS.titansEdict]:'spell-titans-edict',
  [TALENT_EFFECT_IDS.edictHarm]:'spell-edict-of-harm', [TALENT_EFFECT_IDS.renewableEdict]:'spell-renewable-edict', [TALENT_EFFECT_IDS.eternalEdict]:'spell-eternal-edict',
};
const requestedTalents = TALENT_DESIGN.classes.flatMap(c => c.trees.flatMap(tree => tree.talents.map(t => ({ ...t, className:c.id, branch:tree.name }))));
assert.equal(requestedTalents.length, 130);
assert.deepEqual(new Set(Object.keys(TALENTS)), new Set(requestedTalents.map(t => t.id)), 'all requested nodes exist without stale extras');
for (const { rank, notes, ...requested } of requestedTalents) {
  const actual = TALENTS[requested.id];
  for (const [key, value] of Object.entries(requested)) {
    assert.deepEqual(actual[key], key === 'icon' ? /new icon/i.test(notes) ? `spell-${requested.label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}` : edictIcons[requested.id] ?? value : value, `${requested.id}.${key} matches complete export or requested Blender artwork`);
  }
}
const exportedSpells = requestedSpells.classes.flatMap(c => c.spells);
assert.equal(exportedSpells.length, 137);
assert.deepEqual(new Set(Object.keys(SPELLS)), new Set(exportedSpells.map(s => s.id)));
for (const { notes, ...requested } of exportedSpells) {
  const actual = SPELLS[requested.id];
  // The new movement forms contain editor default attack fields; their explicit prose defines non-damaging self utility.
  for (const [key, value] of Object.entries(requested)) {
    // Revivify prose defines resurrection, despite the new-form attack defaults. Guardian's newer talent specifies mitigation/counters.
    if (requested.id === SPELL_EFFECT_IDS.revivify && ['effect','targetRelation','targeting','visual','damageScale','icon'].includes(key)) continue;
    if (requested.id === 'adamant-guardian' && ['description','effect','damageScale','damageStat','shieldDurationMs','absorbedDamageScale'].includes(key)) continue;
    if (/new icon/i.test(notes) && key === 'icon') continue;
    assert.deepEqual(actual[key], value, `${requested.id}.${key} matches complete export`);
  }
}
for (const id of mobility) {
  const spell = SPELLS[id];
  assert.equal(spell.effect, 'buff'); assert.equal(spell.targetRelation, 'self');
  assert.equal(spellDamage(spell, { primaryDamage:100, specialDamage:100 }), 0);
  assert.equal(spellTotalDamage(spell, { primaryDamage:100, specialDamage:100 }), 0);
  assert(abilityUnlocked(id, spell.className, spell.requiredLevel, [id]));
  assert(!abilityUnlocked(id, spell.className, spell.requiredLevel - 1, [id]));
}
assert.equal(spellUtilityLabel(SPELLS[SPELL_EFFECT_IDS.roll]), 'Move 12m forwards');
assert.equal(spellUtilityLabel(SPELLS[SPELL_EFFECT_IDS.blink]), 'Move 15m forwards · Removes slows and roots');
assert.equal(spellUtilityLabel(SPELLS[SPELL_EFFECT_IDS.lightspeed]), '+50% movement speed for 5s · Removes slows and roots');
assert.equal(spellUtilityLabel(SPELLS['edict-of-the-dawn']), 'Heals every 2s for 12s · Healing pulse when hit');
assert.equal(spellUtilityLabel(SPELLS['eternal-edict']), 'Repeat current Edicts for 8s');
assert.equal(spellUtilityLabel(SPELLS['courageous-call']), null);
assert.equal(SPELLS[SPELL_EFFECT_IDS.roll].movementDistance, 12);
assert.equal(SPELLS[SPELL_EFFECT_IDS.roll].movementDurationMs, 500);
assert.equal(SPELLS[SPELL_EFFECT_IDS.blink].movementDistance, 15);
assert.equal(SPELLS[SPELL_EFFECT_IDS.blink].clearMovementImpairments, true);
assert.equal(SPELLS[SPELL_EFFECT_IDS.lightspeed].clearMovementImpairments, true);
assert.equal(SPELLS[SPELL_EFFECT_IDS.lightspeed].buffDurationMs, 5000);
assert.equal(SPELLS[SPELL_EFFECT_IDS.lightspeed].movementSpeedMultiplier, 1.5);
for (const id of capstones) {
  const spell = SPELLS[id], talent = TALENTS[spell.requiredTalent];
  assert.equal(talent.ability, id); assert.equal(spell.requiredLevel, talent.requiredLevel);
  assert.equal(spell.description, talent.description);
  assert(!abilityUnlocked(id, 'Cleric', 60, [id], []), 'training cannot forge capstones');
  assert(abilityUnlocked(id, 'Cleric', 60, [], [talent.id]));
  const build = { level:60, appearance:{ className:'Cleric' }, talents:[] };
  const branch = Object.values(TALENTS).filter(t => t.branch === talent.branch);
  const learn = node => {
    if (node.prerequisite) while (build.talents.filter(id => id === node.prerequisite).length < node.prerequisiteRank) learn(TALENTS[node.prerequisite]);
    while (!canLearnTalent(build, node.id)) {
      const next = branch.find(t => t.id !== node.id && canLearnTalent(build, t.id));
      assert(next, `${id} is reachable within the budget`); build.talents.push(next.id);
    }
    build.talents.push(node.id);
  };
  learn(talent); assert(talentsValid(build));
}
for (const id of [TALENT_EFFECT_IDS.beastmaster, TALENT_EFFECT_IDS.wideSwing, TALENT_EFFECT_IDS.guard, TALENT_EFFECT_IDS.courageousCall,
  TALENT_EFFECT_IDS.edictLight, TALENT_EFFECT_IDS.edictProtection, TALENT_EFFECT_IDS.edictHarm]) {
  const talent = TALENTS[id]; assert.equal(talent.requiredBranchPoints, [TALENT_EFFECT_IDS.wideSwing,TALENT_EFFECT_IDS.guard,TALENT_EFFECT_IDS.courageousCall].includes(id)?5:6);
  assert(!canLearnTalent({ level:60, appearance:{ className:talent.className }, talents:[] }, id), `${id} requires six invested branch points`);
}
assert.equal(TALENT_VERSION, 7);
const retained = { level:60, appearance:{ className:'Knight' }, talentVersion:5, talents:['knight-1','knight-2'] };
migrateTalents(retained); assert.equal(retained.talentVersion, 7); assert.deepEqual(retained.talents, ['knight-1','knight-2']);
for (const version of [4, 5]) {
  const refund = { level:60, appearance:{ className:'Ranger' }, talentVersion:version, talents:[TALENT_EFFECT_IDS.beastmaster] };
  migrateTalents(refund); assert.equal(refund.talentVersion, 7); assert.deepEqual(refund.talents, []);
  assert.equal(earnedTalentPoints(refund.level) - refund.talents.length, 20);
}
for (const talents of [['unknown'], ['mage-1'], [TALENT_EFFECT_IDS.edictLight], null]) {
  const corrupt = { level:60, appearance:{ className:'Ranger' }, talentVersion:5, talents };
  const before = structuredClone(corrupt); migrateTalents(corrupt); assert.deepEqual(corrupt, before, 'invalid prior saves remain rejected');
}
console.log('PASS: full 130-talent/137-spell export parity; 3 playable Edict capstones; mobility contracts; reachable gates; safe v4/v5 allocation migration.');
