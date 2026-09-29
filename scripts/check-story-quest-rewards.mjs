import assert from 'node:assert/strict';
import { storyQuestRewardChanges } from '../src/story-quest-rewards.ts';
import { storyQuestById } from '../src/story-quests.ts';
import { starterGear, gearById } from '../src/progression.ts';
import { newBags, bagUsage, bagCapacity } from '../src/bags.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { MAX_SKILL_XP } from '../src/skills.ts';
const player=className=>({level:60,appearance:{className},...starterGear(className),...newBags(),inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},skills:{mining:0,woodcutting:0,herbalism:0,fishing:0},bank:{gear:[]},auctions:[]});
for(const className of ['Ranger','Knight','Mage','Cleric']){
 const p=player(className),before=structuredClone(p),quest=storyQuestById('story-the-sealed-root');
 assert.equal(storyQuestRewardChanges(p,quest),undefined,'equipment choice is explicit');
 assert.equal(storyQuestRewardChanges(p,quest,'ring'),undefined,'unoffered slot cannot be claimed');
 for(const slot of ['weapon','armor']){
  const changes=storyQuestRewardChanges(p,quest,slot,()=>.5);assert(changes);assert.deepEqual(p,before,'preflight never mutates owner');
  const gear=gearById(changes.ownedGear.at(-1));assert.equal(gear.slot,slot);assert.equal(gear.className,className);assert.equal(gear.quality,'uncommon');assert(gear.requiredLevel<=quest.requiredLevel);
  const collision=storyQuestRewardChanges({...p,ownedGear:changes.ownedGear},quest,slot,()=>.5);assert(collision);assert.notEqual(collision.ownedGear.at(-1),gear.id,'repeated RNG seed cannot overwrite an owned item');
  const escrow=storyQuestRewardChanges({...p,bank:{gear:[gear.id]}},quest,slot,()=>.5);assert(escrow);assert.notEqual(escrow.ownedGear.at(-1),gear.id,'bank reserves gear identity');
 }
 const frozen=storyQuestRewardChanges(p,storyQuestById('story-memory-beneath-ice'),undefined,()=>.5);assert(frozen);const accessory=gearById(frozen.ownedGear.at(-1));assert(['charm','ring'].includes(accessory.slot));assert.equal(accessory.quality,'rare');
}
const p=player('Knight'),quest=storyQuestById('story-saffron-bloom');p.skills.herbalism=MAX_SKILL_XP-1;
const rewards=storyQuestRewardChanges(p,quest);assert(rewards);assert.equal(rewards.skills.herbalism,MAX_SKILL_XP,'profession reward caps at existing maximum');assert.equal(p.skills.herbalism,MAX_SKILL_XP-1);
const food=storyQuestRewardChanges(p,storyQuestById('story-boars-of-bracken-crown'));assert.equal(food.carriedItems['roast-meat'],1,'food is a real carried item');
assert.equal(storyQuestRewardChanges(p,quest,'weapon'),undefined,'non-choice rewards reject injected slot');
const filled=player('Mage');for(const id of Object.keys(LOOT_ITEMS)){if(bagUsage(filled)>=bagCapacity(filled))break;filled.carriedItems[id]=1;}
const fullBefore=structuredClone(filled);assert.equal(bagUsage(filled),bagCapacity(filled));assert.equal(storyQuestRewardChanges(filled,storyQuestById('story-the-sealed-root'),'weapon',()=>.5),undefined,'full bags reject equipment without changing quest or inventory');assert.deepEqual(filled,fullBefore);
const overflow=player('Cleric');overflow.inventory.crystal=Number.MAX_SAFE_INTEGER;assert.equal(storyQuestRewardChanges(overflow,storyQuestById('story-crystals-for-the-road')),undefined,'resource overflow fails closed');
console.log('PASS: actual quest reward projections preserve owner, validate explicit class-compatible choices, rare accessories, bag/overflow limits, escrow identities, food and profession caps.');
