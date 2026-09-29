import assert from 'node:assert/strict';
import { TALENT_DESIGN as redesign } from '../src/talent-design.ts';
import { registerHooks } from 'node:module';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { TALENTS, TALENT_VERSION, canLearnTalent, talentsValid, migrateTalents, starterGear, combatStats } = await import('../src/progression.ts');
const { SPELLS, TALENT_EFFECT_IDS, abilityUnlocked, defaultHotbar, spellsForClass, spellDamage, hotbarValid, availableHotbar } = await import('../src/spells.ts');
const { renderTalents } = await import('../src/progression-ui.ts');
const { renderSpellbook, createHotbarState, placeHotbar } = await import('../src/hotbar.ts');
hook.deregister();

const ids = { 'custom-037458b0-ccd3-4b03-9d0a-da1f61492ca7':'ranger-beastmaster', 'custom-552c8493-1924-4ed9-832e-9045ce3a7091':'ranger-everlasting-bond' };
// The complete September 26 export is authoritative for all four classes.
const preservedClasses = redesign.classes;
const imported = [];
for (const calling of preservedClasses) for (const tree of calling.trees) for (const source of tree.talents) {
  const id = ids[source.id] || source.id, talent = TALENTS[id]; imported.push(id);
  assert(talent, `${id} exists`);
  for (const key of ['label', 'row', 'column', 'maxRank', 'requiredLevel', 'requiredBranchPoints', 'prerequisiteRank']) assert.equal(talent[key], source[key], `${id}: imported ${key}`);
  assert.equal(talent.className, calling.id); assert.equal(talent.branch, tree.name);
  assert.equal(talent.prerequisite, ids[source.prerequisite] || source.prerequisite, `${id}: imported prerequisite`);
}
assert.equal(imported.length, 130); assert.deepEqual(Object.keys(TALENTS).sort(), imported.sort());
assert(!TALENTS['ranger-6'], 'Forest guardian was removed');
assert.equal(TALENT_VERSION, 7);
const makePlayer = (className = 'Ranger', level = 60, talents = []) => ({ id:'redesign', level, hp:100, maxHp:100, gold:1000, appearance:{className}, talents, talentVersion:TALENT_VERSION, learnedSpells:[], inventory:{potion:0}, hotbar:Array(8).fill(null), hotbar2:Array(8).fill(null), ...starterGear(className) });
for (const calling of preservedClasses) for (const tree of calling.trees) {
  const player = makePlayer(calling.id), nodes = Object.values(TALENTS).filter(t => t.className === calling.id && t.branch === tree.name);
  while (true) { const next = nodes.find(t => canLearnTalent(player, t.id)); if (!next) break; player.talents.push(next.id); }
  assert.equal(player.talents.length, Math.min(20, nodes.reduce((sum, t) => sum + t.maxRank, 0)), `${calling.id}/${tree.name}: all ranks reachable within 20 points`);
  assert(talentsValid(player)); assert(talentsValid({ ...player, talents:[...player.talents].reverse() }));
  const html = renderTalents(player); assert(!/undefined|NaN/.test(html));
}
const v3Build = ['ranger-4', 'ranger-5', 'ranger-6', ...Array(3).fill('ranger-pathfinder-1'), ...Array(3).fill('ranger-pathfinder-3'), ...Array(2).fill('ranger-pathfinder-5'), 'ranger-pathfinder-4', 'ranger-pathfinder-6'];
const previous = { ...makePlayer('Ranger', 60, v3Build), talentVersion:3 };
migrateTalents(previous); assert.deepEqual(previous.talents, []); assert.equal(previous.talentVersion, TALENT_VERSION, 'valid v3 allocations validate against the original catalog, including removed nodes');
previous.talents.push(TALENT_EFFECT_IDS.beastmaster); migrateTalents(previous); assert.deepEqual(previous.talents, [TALENT_EFFECT_IDS.beastmaster], 'refund happens once');
for (const allocation of [[TALENT_EFFECT_IDS.beastmaster], ['ranger-6'], ['ranger-1','ranger-1'], ['mage-1'], ['unknown'], null]) {
  const player = { ...makePlayer('Ranger', 60, allocation), talentVersion:3 }; migrateTalents(player);
  assert.equal(player.talentVersion, 3, 'invalid v3 builds are not laundered by the refund'); assert.deepEqual(player.talents, allocation);
}
for (const version of [undefined, 2]) { const player = { ...makePlayer('Ranger', 60, ['ranger-1','ranger-2','ranger-3']), talentVersion:version }; migrateTalents(player); assert.equal(player.talentVersion,TALENT_VERSION); assert.deepEqual(player.talents,[]); }
const baseline = combatStats(makePlayer()), arrowstorm = combatStats(makePlayer('Ranger',60,[TALENT_EFFECT_IDS.arrowstorm,TALENT_EFFECT_IDS.arrowstorm]));
assert.deepEqual(arrowstorm, baseline, 'Arrowstorm no longer leaks the replaced flat direct damage bonus');
for (const rank of [1,2]) assert.equal(combatStats(makePlayer('Ranger',60,Array(rank).fill('ranger-survival-5'))).spellBonuses.periodic, rank * 2, 'periodic rank values are totals');
assert.match(TALENTS[TALENT_EFFECT_IDS.lingeringVenom].rankDescriptions[0], /five seconds/); assert.match(TALENTS[TALENT_EFFECT_IDS.lingeringVenom].rankDescriptions[1], /six seconds/);
assert.equal(defaultHotbar('Ranger')[0], 'arrow', 'Tame Beast never replaces the starter ability');
assert.deepEqual(spellsForClass('Ranger').filter(spell => spell.requiredLevel === 1).map(spell => spell.id), ['arrow']);
assert.equal(SPELLS.twinshot.label, 'Double Tap'); assert.equal(SPELLS['combined-assault'].cooldownMs, 16000);
assert.equal(SPELLS['tame-beast'].castTimeMs,3000); assert.equal(SPELLS['tame-beast'].range,8); assert.equal(spellDamage(SPELLS['tame-beast'],baseline),0);
for (const id of ['tame-beast','combined-assault']) {
  const spell = SPELLS[id], player = makePlayer('Ranger',60,[spell.requiredTalent]), bar = [id,...Array(9).fill(null)];
  assert(!abilityUnlocked(id,'Ranger',60,[id],[]), 'trainer lists cannot forge talent unlocks');
  assert(abilityUnlocked(id,'Ranger',60,[],player.talents)); assert(hotbarValid(bar,'Ranger',60,[],player.talents));
  assert(!spellsForClass('Ranger').some(s => s.id === id));
  assert.deepEqual(availableHotbar(bar,'Ranger',60,[],[]),Array(10).fill(null),'refund/reset removes granted actions');
  const state = createHotbarState(() => true); state.sync(player); assert(state.set(placeHotbar(state.slots,10,id)),'new actions work on second hotbar');
  const html = renderSpellbook(player,bar), card = [...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes(`data-book-ability="${id}"`));
  assert(card && !card.includes(' disabled')); assert(!/undefined|NaN/.test(html));
}
console.log('PASS: all 130 imported talents, four class layouts, attainable ranks, version-7 one-time refunds, invalid-save preservation, rank effects and Beastmaster spellbook/hotbars.');
