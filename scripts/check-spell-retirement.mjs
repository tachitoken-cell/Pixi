import assert from 'node:assert/strict';
import { SPELLS, SPELL_EFFECT_IDS, RETIRED_SPELLS, migrateRetiredSpells, ricochetHits, spellDamage, spellPeriodicDamage, spellCastTimeMs, abilityValid, spellsForClass, defaultHotbar, legacyAbility } from '../src/spells.ts';
import { shieldThrowHops } from '../src/combat-timing.ts';

const clericStarters = spellsForClass('Cleric').filter(spell => spell.requiredLevel === 1).map(spell => spell.id);
assert.deepEqual(clericStarters, ['smite', SPELL_EFFECT_IDS.revivify], 'Revivify does not displace Smite in trainer or starter ordering');
assert.equal(defaultHotbar('Cleric', 1, clericStarters)[0], 'smite');
assert.equal(legacyAbility('Cleric'), 'smite', 'legacy class attacks remain Smite');
assert.equal(SPELLS[SPELL_EFFECT_IDS.revivify].castTimeMs, 0);
assert.equal(SPELLS[SPELL_EFFECT_IDS.revivify].cooldownMs, 0);
assert.equal(SPELLS[SPELL_EFFECT_IDS.revivify].reviveHealthFraction, 1);

for (const [id, retired] of Object.entries(RETIRED_SPELLS)) {
  assert(!Object.hasOwn(SPELLS,id) && !abilityValid(id));
  assert(!spellsForClass(retired.className,true).some(spell=>spell.id===id));
  const active=spellsForClass(retired.className)[0].id;
  const saved={appearance:{className:retired.className},level:60,learnedSpells:[active,id],
    hotbar:[active,id,'mend',null,'interact',active,null,null],hotbarExtra:[id,active],
    hotbar2:[null,active,null,id,null,'mend',null,'interact'],hotbar2Extra:[active,id],hp:17,gold:321};
  migrateRetiredSpells(saved);
  assert.deepEqual(saved.learnedSpells,[active]);
  assert.deepEqual(saved.hotbar,[active,null,'mend',null,'interact',active,null,null]);
  assert.deepEqual(saved.hotbarExtra,[null,active]);
  assert.deepEqual(saved.hotbar2,[null,active,null,null,null,'mend',null,'interact']);
  assert.deepEqual(saved.hotbar2Extra,[active,null]);
  assert.equal(saved.hp,17);assert.equal(saved.gold,321);
  const once=structuredClone(saved);migrateRetiredSpells(saved);assert.deepEqual(saved,once,'migration is idempotent');
  for(const mutate of [p=>p.learnedSpells.push('unknown'),p=>p.learnedSpells.push(id),p=>p.appearance.className='Cleric',p=>p.level=1,p=>p.hotbar[0]='unknown',p=>p.hotbarExtra.push(null)]) {
    const corrupt={...structuredClone(once),learnedSpells:[active,id]};mutate(corrupt);
    const before=structuredClone(corrupt);migrateRetiredSpells(corrupt);assert.deepEqual(corrupt,before,'invalid legacy data remains rejected');
  }
}
const one={id:'a',x:0,z:10},two={id:'b',x:3,z:10};
assert.deepEqual(ricochetHits([]),[]);
assert.deepEqual(ricochetHits([one]).map(hit=>hit.damageMultiplier),[1,.85,.85**2,.85**3,.85**4]);
const hits=ricochetHits([one,two]);
assert.deepEqual(hits.map(hit=>hit.target.id),['a','b','a','b','a']);
assert.deepEqual(hits.map(hit=>hit.damageMultiplier),[1,1,.85,.85,.85**2]);
const hops=shieldThrowHops({x:0,z:0},hits.map(hit=>hit.target));
for(let i=1;i<hops.length;i++)assert.equal(hops[i].delay,hops[i-1].delay+hops[i-1].flight,'repeats land in visible chain order');
const base={primaryDamage:100,specialDamage:100},boost={...base,damageMultiplier:1.1,magicDamageMultiplier:1.2,castSpeedMultiplier:1.1};
assert.equal(spellDamage(SPELLS.arrow,boost),110,'physical damage gets only the general bonus');
assert.equal(spellDamage(SPELLS.fireball,boost),Math.round(spellDamage(SPELLS.fireball,base)*1.32));
assert.equal(spellPeriodicDamage(SPELLS['poison-shot'],boost),Math.round(35*1.32),'periodic magic receives both damage bonuses');
for(const id of ['heal','power-word-shield'])assert.equal(spellDamage(SPELLS[id],boost),spellDamage(SPELLS[id],base),'damage bonuses never amplify healing/shields');
assert.equal(spellCastTimeMs(SPELLS.fireball,boost),Math.round(SPELLS.fireball.castTimeMs/1.1));
assert.equal(spellCastTimeMs(SPELLS['powerful-throw'],boost,{powerfulThrowReady:true}),Math.round(1000/1.1));
console.log('PASS: retired lessons migrate without corrupt-save repair or lost slots; Ricochet repeats per target; shared damage, periodic and cast passives.');
