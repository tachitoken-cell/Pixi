import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SPELLS, GLOBAL_ATTACK_MS, spellsForClass, spellCastTimeMs, spellDamage, spellTotalDamage, spellTotalPower,
  defaultHotbar, hotbarValid, availableHotbar, abilityValid, abilityUnlocked, legacyAbility } from '../src/spells.ts';
import { icon } from '../src/icons.ts';

const classes=['Ranger','Knight','Mage','Cleric'],levels=[1,...Array.from({length:30},(_,i)=>(i+1)*2)];
const stats={primaryDamage:20,specialDamage:30},strong={primaryDamage:420,specialDamage:650};
const defaults={Ranger:['arrow','volley','mend','interact','power-shot','multishot','poison-shot',null],
  Knight:['strike','whirlwind','mend','interact','cleave','shockwave','shield-bash',null],
  Mage:['fireball','nova','mend','interact','frostbolt','arcane-burst','meteor',null],
  Cleric:['smite','holy-nova','mend','interact','heal','flash-heal','power-word-shield',null]};
assert.equal(Object.keys(SPELLS).length,137);
assert.equal(GLOBAL_ATTACK_MS,1500,'a fixed 1.5-second global cooldown is shared by every calling');
const signatures=new Set();
for(const [id,spell] of Object.entries(SPELLS)){
  assert.equal(id,spell.id,'persisted ID matches its lookup key');
  assert(classes.includes(spell.className));
  assert(spell.label.length>2&&spell.description.length>20);
  assert.match(spell.color,/^#[0-9a-f]{6}$/i);
  assert(Number.isSafeInteger(spell.castTimeMs)&&spell.castTimeMs>=0&&spell.castTimeMs<=3000);
  assert.equal(spell.castTimeMs%500,0,'readable authored casting times');
  assert(Number.isSafeInteger(spell.cooldownMs)&&spell.cooldownMs>=0&&spell.cooldownMs<=90000);
  assert(Number.isFinite(spell.range)&&spell.range>=0&&spell.range<=30);
  assert(spell.range>0||spell.targetRelation==='self','only explicitly self-targeted utility has zero range');
  assert(['damage','heal','shield','buff','revive'].includes(spell.effect));
  assert(['hostile','friendly','self'].includes(spell.targetRelation));
  if(spell.effect!=='buff')assert.equal(spell.targetRelation==='hostile',spell.effect==='damage','harmful and friendly effects cannot cross allegiance');
  assert(['primaryDamage','specialDamage'].includes(spell.damageStat));
  assert(Number.isFinite(spell.damageScale)&&spell.damageScale>=0&&spell.damageScale<=6);
  if(spell.damageScale===0)assert(['buff','revive'].includes(spell.effect)||id==='tame-beast','only non-damaging utilities have zero power');
  assert(['single','radial','chain','splash'].includes(spell.targeting));
  assert(['projectile','radial','meteor'].includes(spell.visual));
  if(spell.targeting==='chain'||spell.maxTargets!==undefined)assert(['chain','splash'].includes(spell.targeting)&&Number.isSafeInteger(spell.maxTargets)&&spell.maxTargets>=2&&spell.maxTargets<=7);
  if(spell.targeting==='splash')assert(Number.isFinite(spell.radius)&&spell.radius>0&&spell.radius<=5);
  else assert.equal(spell.radius,undefined);
  if(spell.effect==='shield')assert(Number.isSafeInteger(spell.shieldDurationMs)&&spell.shieldDurationMs>=5000&&spell.shieldDurationMs<=20000);
  else assert.equal(spell.shieldDurationMs,undefined);
  if(spell.channel){
    assert.equal(spell.castTimeMs,0,'channels begin immediately and tick later');
    assert.equal(spell.channel.durationMs,3000);
    assert([500,1000].includes(spell.channel.tickMs));
    assert.equal(spell.channel.durationMs%spell.channel.tickMs,0);
    assert.equal(spell.status,undefined,'channels do not silently multiply damage-over-time status applications');
    assert.equal(spellTotalPower(spell,stats),spellDamage(spell,stats)*spell.channel.durationMs/spell.channel.tickMs,'channel tooltip power equals all actual ticks');
  }
  if(spell.status){
    assert.equal(spell.effect,'damage');
    assert(Number.isSafeInteger(spell.status.durationMs)&&spell.status.durationMs>0);
    assert(['slow','stun','poison','burn'].includes(spell.status.kind));
    if(spell.status.kind==='slow')assert(spell.status.multiplier>0&&spell.status.multiplier<1);
    if(spell.status.ticks){
      assert(Number.isSafeInteger(spell.status.ticks)&&spell.status.ticks>=1);
      assert(spell.status.tickScale>0);
      const tick=Math.max(1,Math.round(stats[spell.damageStat]*spell.status.tickScale));
      assert.equal(spellTotalDamage(spell,stats),spellDamage(spell,stats)+spell.status.ticks*tick);
    }
  }
  assert.equal(spellCastTimeMs(spell,stats),spell.castTimeMs);
  assert.equal(spellCastTimeMs(spell,strong),spell.castTimeMs,'equipment power never changes cast duration');
  if(spell.damageScale===0)assert.equal(spellTotalPower(spell,strong),0,'zero-power utility stays non-damaging');
  else assert(spellTotalPower(spell,strong)>spellTotalPower(spell,stats),'gear improves every damage, heal and shield spell');
  if(spell.effect!=='damage')assert.equal(spellTotalDamage(spell,stats),0,'healing and absorption are never labeled as damage');
  assert.match(spell.icon,/^spell-/,'spells use resolved illustrations, including authored reuse');
  const art=icon(spell.icon);assert.notEqual(art,icon('help'),`${id} has a resolved icon`);
  for(const match of art.matchAll(/src="([^"]+)"/g))assert(existsSync(`public${match[1]}`),`${id} artwork exists`);
  const {id:_,label,description,icon:artKey,color,requiredLevel,...mechanics}=spell;
  const signature=JSON.stringify(mechanics);
  assert(!signatures.has(signature),`${id} has distinct mechanics, not a renamed copy`);signatures.add(signature);
}
for(const className of classes){
  const spells=spellsForClass(className),known=spells.map(spell=>spell.id);
  const extraLevels=className==='Ranger'?[9,33]:className==='Knight'?[1,3]:className==='Mage'?[11]:[1,9];
  const removedLevels={Ranger:[22,34,44,60],Knight:[24,42,46],Mage:[44,52],Cleric:[]}[className];
  assert.equal(spells.length,31+extraLevels.length-removedLevels.length);
  assert.deepEqual(spells.map(spell=>spell.requiredLevel),[...levels.filter(level=>!removedLevels.includes(level)),...extraLevels].sort((a,b)=>a-b),`${className} has only the requested active lessons`);
  assert.equal(new Set(spells.map(spell=>spell.label)).size,spells.length);
  for(const effect of ['damage','heal','shield'])assert(spells.some(spell=>spell.effect===effect),`${className} has real ${effect} utility`);
  for(const control of ['slow','stun'])assert(spells.some(spell=>spell.status?.kind===control));
  assert(spells.filter(spell=>spell.channel).length>=2);
  assert(spells.some(spell=>spell.effect==='damage'&&spell.castTimeMs===0&&!spell.channel));
  assert(new Set(spells.map(spell=>spell.targeting)).size>=3);
  assert.deepEqual(defaultHotbar(className,60,known),[...defaults[className],null,null],'existing default positions stay stable');
  assert.equal(legacyAbility(className),defaults[className][0]);
  assert.equal(legacyAbility(className,true),defaults[className][1]);
  for(const level of levels){
    const bar=defaultHotbar(className,level,known);assert.equal(bar.length,10);assert(hotbarValid(bar,className,level,known));
    for(const spell of spells)assert.equal(abilityUnlocked(spell.id,className,level,known),level>=spell.requiredLevel);
  }
  assert.deepEqual(defaultHotbar(className,1,[]),[null,null,'mend','interact',null,null,null,null,null,null],'unlearned spells are not silently granted');
  const chosen=[known.at(-1),null,known[0],'interact','mend',known[10],null,known[15],null,null];
  assert.deepEqual(availableHotbar(chosen,className,60,known),chosen,'learning additional spells never overwrites a chosen slot');
  const removed=known.filter(id=>id!==known[10]);
  const filtered=availableHotbar(chosen,className,60,removed);assert.equal(filtered[5],null);assert.deepEqual(filtered.filter((_,index)=>index!==5),chosen.filter((_,index)=>index!==5));
  assert.equal(chosen[5],known[10],'hotbar filtering does not mutate the saved array');
  assert(!hotbarValid([...chosen,null],className));
  assert(!hotbarValid([spellsForClass(classes.find(other=>other!==className))[0].id,...chosen.slice(1)],className));
}
const oldLevels={arrow:1,volley:20,'power-shot':5,multishot:15,'poison-shot':10,fireball:1,nova:10,frostbolt:5,'arcane-burst':15,meteor:20,strike:1,whirlwind:15,cleave:5,shockwave:20,'shield-bash':10};
const moved={1:1,5:4,10:8,15:12,20:16};
for(const [id,previous] of Object.entries(oldLevels))assert.equal(SPELLS[id].requiredLevel,moved[previous],`${id} unlock only moves earlier`);
for(const invalid of ['__proto__','constructor','toString','missing','',null,1])assert(!abilityValid(invalid));
assert.equal(SPELLS['holy-word-serenity'].castTimeMs,0,'Cleric has a reactive instant heal');
assert.equal(SPELLS['power-word-shield'].effect,'shield');
assert.equal(SPELLS.renew.effect,'heal');assert.equal(SPELLS.renew.channel.durationMs,3000);
assert.equal(SPELLS['starfall-arrow'].maxTargets,4,'Starfall keeps its authored four-target cap');
assert.deepEqual(SPELLS.flamewave.status,{kind:'burn',durationMs:4000,ticks:3,tickScale:.35});
assert.deepEqual(SPELLS['poison-cloud'].status,{kind:'poison',durationMs:4000,ticks:4,tickScale:.4});
assert.equal(spellTotalDamage(SPELLS['poison-cloud'],stats),42,'Poison Cloud deals 50% direct plus four 40% ticks');
assert.equal(SPELLS.charge.chargeSpeed,30);
assert.equal(SPELLS.taunt.tauntDurationMs,3000);
assert.equal(SPELLS.guard.buffDurationMs,8000,'reflection outlasts depletion of the absorb');
assert.equal(SPELLS['courageous-call'].damageBonusPercent,20);
assert.equal(SPELLS['lord-of-battle'].markHealTicks,3);
assert.equal(spellCastTimeMs(SPELLS['powerful-throw'],stats,{heat:0,heatUntil:0,twinshotReadyUntil:0,powerfulThrowReady:true},100),1000,'pickup shortens the next charge');
assert.equal(spellCastTimeMs(SPELLS['powerful-throw'],stats,{heat:0,heatUntil:0,twinshotReadyUntil:0,powerfulThrowReady:false},100),2000,'consumed pickup does not shorten charge');
for(const id of ['powerful-throw','guard','adamant-guardian','courageous-call','lord-of-battle']){
  const spell=SPELLS[id];assert(!abilityUnlocked(id,'Knight',60,[]),`${id} is talent-only`);
  assert(abilityUnlocked(id,'Knight',60,[],[spell.requiredTalent]),`${id} unlocks from its authored talent`);
}
console.log('PASS: 137 distinct spells, authored rework lessons and talents, real effect/target/channel contracts, artwork, power totals, legacy unlocks and stable hotbars.');
