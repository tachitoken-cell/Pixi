import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { TALENTS, TALENT_VERSION, canLearnTalent, talentsValid, migrateTalents, availableTalentPoints, starterGear } = await import('../src/progression.ts');
const { SPELLS, TALENT_EFFECT_IDS, spellsForClass, abilityUnlocked, hotbarValid, availableHotbar, spellCastTimeMs } = await import('../src/spells.ts');
const { renderSpellbook, createHotbarState, placeHotbar } = await import('../src/hotbar.ts');
const { renderTalents } = await import('../src/progression-ui.ts');
const { renderTraining } = await import('../src/training-ui.ts');
const { TRAINER_NPCS } = await import('../src/training.ts');
const { damageOverTimeLabels } = await import('../src/combat-feedback.ts');
hook.deregister();
const builds = [
  ['twinshot', 'twinshot', 'twinshotMomentum'],
  ['venom-detonation', 'venom', 'lingeringVenom'],
  ['arcane-volley', 'arcaneEcho', 'arcaneEchoChance'],
  ['combustion', 'burning', 'periodicBurning'],
  ['shatter', 'chilled', 'deepChill'],
];
for (const [id, signature, augment] of builds) {
  const spell = SPELLS[id], className = spell.className, capstone = TALENTS[spell.requiredTalent];
  const player = { id, level:37, hp:100, maxHp:100, gold:10000, appearance:{className}, talents:[], talentVersion:TALENT_VERSION,
    learnedSpells:spellsForClass(className).filter(s => s.requiredLevel <= 37).map(s => s.id), inventory:{potion:3}, hotbar:Array(8).fill(null), hotbar2:Array(8).fill(null), ...starterGear(className) };
  assert.equal(TALENTS[TALENT_EFFECT_IDS[signature]].row, 2); assert.equal(TALENTS[TALENT_EFFECT_IDS[signature]].maxRank, 1);
  assert.equal(TALENTS[TALENT_EFFECT_IDS[augment]].row, 2); assert.equal(TALENTS[TALENT_EFFECT_IDS[augment]].maxRank, 2);
  assert.equal(capstone.row, 4); assert.equal(capstone.maxRank, 1);
  const branch = Object.values(TALENTS).filter(node => node.className === className && node.branch === capstone.branch);
  const fill = () => {
    const next = branch.find(node => node.id !== capstone.id && canLearnTalent(player, node.id));
    assert(next, `${id}: reachable within the thirteen-point budget`); player.talents.push(next.id);
  };
  const learn = id => {
    const node = TALENTS[id];
    if (node.prerequisite) while (player.talents.filter(id => id === node.prerequisite).length < node.prerequisiteRank) learn(node.prerequisite);
    while (!canLearnTalent(player, id)) fill();
    player.talents.push(id);
  };
  learn(TALENT_EFFECT_IDS[signature]);
  for (let rank = 0; rank < TALENTS[TALENT_EFFECT_IDS[augment]].maxRank; rank++) learn(TALENT_EFFECT_IDS[augment]);
  while (player.talents.filter(id => id === capstone.prerequisite).length < capstone.prerequisiteRank) learn(capstone.prerequisite);
  while (player.talents.length < capstone.requiredBranchPoints) fill();
  assert.equal(player.talents.length,12); assert(talentsValid(player));
  const bar = [id, ...Array(9).fill(null)];
  assert(!abilityUnlocked(id, className, 60, [id]), 'trainer purchase cannot forge a capstone');
  assert(!abilityUnlocked(id, className, 37, player.learnedSpells, player.talents));
  assert(!hotbarValid(bar, className, 37, player.learnedSpells, player.talents));
  const locked = renderSpellbook(player, bar); assert(locked.includes(`Requires ${capstone.branch} talent: ${capstone.label}`));
  learn(capstone.id); assert(talentsValid(player)); assert(talentsValid({...player,talents:[...player.talents].reverse()}));
  assert.equal(availableTalentPoints(player),0,'each capstone is reachable with thirteen points at level37');
  assert(abilityUnlocked(id,className,37,[],player.talents),'allocation grants without a trainer purchase');
  assert(!abilityUnlocked(id,className,36,[],player.talents),'level floor still holds');
  assert(!abilityUnlocked(id,className==='Mage'?'Ranger':'Mage',60,[],player.talents),'cross-class talent IDs cannot grant spells');
  assert(hotbarValid(bar,className,37,player.learnedSpells,player.talents));
  assert.deepEqual(availableHotbar(bar,className,37,player.learnedSpells,player.talents),bar);
  const state = createHotbarState(() => true); state.sync(player); assert(state.set(placeHotbar(state.slots,10,id)),'capstones work in the second hotbar');
  state.sync({...player,talents:[],hotbar2:[id,...Array(7).fill(null)]}); assert(!state.slots.includes(id),'reset removes talent abilities and invalidates pending edits');
  const html = renderSpellbook(player,bar), card = [...html.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]).find(s=>s.includes(`data-book-ability="${id}"`));
  assert(!card.includes(' disabled')); assert(!/NaN|undefined/.test(html));
  assert(renderTalents(player).includes(spell.description.replaceAll('&','&amp;')),'tree explains each capstone');
  const trainer = TRAINER_NPCS.find(t=>t.className===className);
  assert(!renderTraining(player,trainer).includes(`data-training-select="${id}"`),'trainers never offer talent spells');
  assert(spellsForClass(className,true).some(s=>s.id===id)); assert(!spellsForClass(className).some(s=>s.id===id));
  const copy = structuredClone(player); migrateTalents(copy); assert.deepEqual(copy,player,'current builds retain allocations');
}
const old = {level:60,appearance:{className:'Mage'},talentVersion:2,talents:[...Array(3).fill('mage-frostweaving-1'),...Array(2).fill('mage-frostweaving-2'),...Array(2).fill('mage-frostweaving-3'),...Array(3).fill('mage-frostweaving-6')]};
assert(!talentsValid(old),'previous higher ranks no longer fit the new layout');
const validOld=structuredClone(old);migrateTalents(validOld);assert.deepEqual(validOld.talents,[]);assert.equal(validOld.talentVersion,TALENT_VERSION);assert.equal(availableTalentPoints(validOld),20);
for(const patch of [{talents:[...old.talents,'mage-frostweaving-3']},{talents:['mage-frostweaving-3']},{talents:['ranger-1']},{talents:null},{talentVersion:1},{talentVersion:99}]){
  const corrupt={...old,...patch},before=structuredClone(corrupt);migrateTalents(corrupt);assert.deepEqual(corrupt,before,'unknown or corrupt old saves remain rejected, never silently refunded');
}
const legacy={level:6,appearance:{className:'Ranger'},talents:['ranger-3','ranger-2','ranger-1']};migrateTalents(legacy);assert.deepEqual(legacy.talents,[]);assert.equal(legacy.talentVersion,TALENT_VERSION);
const now=1000,state={heat:10,heatUntil:2000,twinshotReadyUntil:2000};
assert.equal(spellCastTimeMs(SPELLS.combustion,undefined,state,now),2308);
assert.equal(spellCastTimeMs(SPELLS.combustion,undefined,{...state,heat:100},now),2308,'heat is capped');
assert.equal(spellCastTimeMs(SPELLS.frostbolt,undefined,state,now),1538,'heat speeds casts from other schools');
for (const spell of Object.values(SPELLS).filter(spell=>spell.id!=='twinshot')) {
  const channel=spell.channel&&{...spell.channel};
  assert.equal(spellCastTimeMs(spell,undefined,state,now),Math.round(spell.castTimeMs/1.3),'heat applies to every spell cast');
  assert.deepEqual(spell.channel,channel,'heat leaves channel duration and tick timing unchanged');
}
assert.equal(spellCastTimeMs(SPELLS.twinshot,undefined,state,now),0,'instant proc permits movement');
assert.equal(spellCastTimeMs(SPELLS.twinshot,undefined,state,2000),1500,'expired proc restores draw time');
assert.equal(spellCastTimeMs(SPELLS.combustion,undefined,state,2000),3000,'expired heat restores cast time');
assert.equal(damageOverTimeLabels([{ability:'arrow',sourceId:'ranger',expiresAt:5000}],'ranger',1000),'Toxic Arrows 4s');
assert.equal(damageOverTimeLabels([], 'mage', 1000, 5000),'Chilled 4s');
assert.equal(damageOverTimeLabels([], 'mage', 5000, 5000),'');
console.log('PASS: five reachable signature/augment/capstone builds, authoritative talent spell unlocks, both hotbars, reset removal, trainer exclusion, valid-old refunds/corrupt-save rejection, heat/instant timing and poison labels.');
