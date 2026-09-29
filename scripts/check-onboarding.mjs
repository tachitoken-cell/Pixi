import assert from 'node:assert/strict';
import { newOnboarding, onboardingValid, getOnboardingStep, onboardingFeatureUnlocked as unlocked, onboardingLockReason, onboardingCanComplete } from '../src/onboarding.ts';
import { SPELLS } from '../src/spells.ts';
import { newContracts } from '../src/adventure.ts';
import { SKILLS } from '../src/skills.ts';
const newSkills=()=>Object.fromEntries(Object.keys(SKILLS).map(id=>[id,0]));

const features=['bag','gear','professions','spells','crafting','contracts','party','dungeon','talents','auction','mounts'];
const makePlayer=(className='Ranger')=>({level:1,gold:0,appearance:{className},quest:{chapter:0,stage:0,progress:{'grove-slimes':0,'grove-crystals':0},completed:false},learnedSpells:Object.values(SPELLS).filter(spell=>spell.className===className&&spell.requiredLevel===1).map(spell=>spell.id),contracts:newContracts(),skills:newSkills(),onboarding:newOnboarding()});
const secondSpell=p=>Object.values(SPELLS).find(spell=>spell.className===p.appearance.className&&spell.requiredLevel===2).id;
const step=(p,id,index)=>{const value=getOnboardingStep(p);assert.equal(value.id,id);assert.equal(value.index,index);assert.equal(value.total,10);assert(value.title&&value.description);};
const legacy=makePlayer();delete legacy.onboarding;assert.equal(getOnboardingStep(legacy),null);assert(features.every(feature=>unlocked(legacy,feature)),'every old character retains previous access without progression guessing');assert(!onboardingCanComplete(legacy));
assert(onboardingValid(newOnboarding()));const one=newOnboarding(),two=newOnboarding();one.looted=true;assert(!two.looted,'creation state is not shared');
for(const value of [null,{},[],{...newOnboarding(),version:2},{...newOnboarding(),looted:'true'},{...newOnboarding(),extra:0},{...newOnboarding(),gearViewed:true},{...newOnboarding(),bagViewed:true,gearViewed:true},{...newOnboarding(),completed:true}]){
  assert(!onboardingValid(value));const p={...makePlayer(),onboarding:value};assert(features.every(feature=>!unlocked(p,feature)),'malformed explicit state cannot grant access');assert(onboardingLockReason(p,'bag'));assert(!onboardingCanComplete(p));
}
for(const className of ['Ranger','Knight','Mage','Cleric']){
  const p=makePlayer(className);step(p,'meet-rowan',1);assert(features.every(feature=>!unlocked(p,feature)));
  p.quest.stage=1;step(p,'first-kill',2);assert(!unlocked(p,'bag'));
  p.quest.progress['grove-slimes']=1;step(p,'loot',3);assert(unlocked(p,'bag'));assert(!unlocked(p,'gear'));
  p.onboarding.looted=true;step(p,'bag',4);assert.equal(getOnboardingStep(p).action,'bag');assert(unlocked(p,'gear'));
  p.onboarding.bagViewed=true;step(p,'gear',5);assert.equal(getOnboardingStep(p).action,'gear');
  p.onboarding.gearViewed=true;step(p,'gather-crystals',6);assert(!unlocked(p,'professions'));
  p.quest.progress['grove-crystals']=1;assert(unlocked(p,'professions'));assert.match(getOnboardingStep(p).description,/1 \/ 3/);
  p.quest.progress['grove-crystals']=3;step(p,'finish-hunt',7);
  p.quest.progress['grove-slimes']=3;p.quest.stage=2;step(p,'return-rowan',8);assert(!unlocked(p,'spells'));
  p.quest={chapter:1,stage:1,progress:{'meet-sable':0},completed:false};p.level=2;p.gold=60;step(p,'train-spell',9);assert(unlocked(p,'spells'));assert(unlocked(p,'contracts'));assert(!unlocked(p,'crafting'));assert.match(getOnboardingStep(p).description,/10 gold/);
  for(const feature of ['bag','gear','professions'])assert(unlocked(p,feature),'chapter turn-in does not relock reset quest counters');
  p.gold=0;assert.match(getOnboardingStep(p).description,/contract/);assert(unlocked(p,'contracts'),'spending the quest reward cannot block earning replacement training gold');
  p.contracts.active['greenwood-hunt']=0;assert(!onboardingCanComplete(p),'an early contract cannot skip the actual spell lesson');
  p.learnedSpells.push(secondSpell(p));assert(unlocked(p,'crafting'));step(p,'accept-contract',10);assert(onboardingCanComplete(p),'training completes the tour when a contract was accepted earlier');
  delete p.contracts.active['greenwood-hunt'];assert(!onboardingCanComplete(p));p.contracts.completed['greenwood-hunt']=Date.now();assert(onboardingCanComplete(p),'previously completed contracts also count');
  p.onboarding.completed=true;assert.equal(getOnboardingStep(p),null);assert(!onboardingCanComplete(p),'completion is one-time');assert(features.filter(feature=>!['talents','auction','mounts'].includes(feature)).every(feature=>unlocked(p,feature)));
  for(const [feature,level] of [['talents',5],['auction',10],['mounts',25]]){p.level=level-1;assert(!unlocked(p,feature));assert(onboardingLockReason(p,feature));p.level=level;assert(unlocked(p,feature));assert.equal(onboardingLockReason(p,feature),'');}
}
const gatherEarly=makePlayer();gatherEarly.skills.mining=1;assert(unlocked(gatherEarly,'professions'));step(gatherEarly,'meet-rowan',1);
const earlyProgress=makePlayer();earlyProgress.quest.progress['grove-slimes']=3;earlyProgress.quest.progress['grove-crystals']=3;earlyProgress.quest.stage=2;earlyProgress.learnedSpells.push(secondSpell(earlyProgress));assert(!onboardingCanComplete(earlyProgress),'level/spell/quest progress does not replace explicit loot and window lessons');
console.log('PASS onboarding: ten server-derived lessons, explicit loot/bag/gear acknowledgements, every class trainer, legacy access, malformed-state rejection, early contracts and training-funds recovery, persistent completion, feature thresholds.');
