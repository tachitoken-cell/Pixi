import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BAG_ITEMS, BASE_BAG_CAPACITY, BAG_SLOT_COUNT, newBags, bagItems, bagCapacity, bagUsage, bagCanFit, bagsValid, migrateBags, bagMerchantStock } from '../src/bags.ts';
import { GEAR, starterGear, combatStats } from '../src/progression.ts';
import { auctionCanReceive } from '../src/auction.ts';

const hero = () => ({ level: 75, appearance: { className: 'Ranger' }, talents: [], ...starterGear('Ranger'), ...newBags(),
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 } });
const player = hero(), stats = combatStats(player);
assert.equal(BASE_BAG_CAPACITY,16); assert.equal(BAG_SLOT_COUNT,4);
assert.deepEqual(bagItems(player),['potion']); assert.equal(bagCapacity(player),16); assert(bagsValid(player));
for (let index=0;index<4;index++) {
  const bag={id:randomUUID(),kind:'linen-pouch'};player.ownedBags.push(bag);player.equippedBags[index]=bag.id;
}
assert(bagsValid(player),'four different instances of the same bag type are valid');
assert.equal(bagCapacity(player),48);assert.equal(bagUsage(player),1);
assert.deepEqual(combatStats(player),stats,'bags never change combat equipment or stats');
const spare={id:randomUUID(),kind:'trail-satchel'};player.ownedBags.push(spare);
assert.deepEqual(bagItems(player),['potion',`bag:${spare.id}`],'only unequipped bags occupy inventory slots');
assert(!bagsValid({...player,equippedBags:[...player.equippedBags,null]}),'there is no fifth socket');
assert(!bagsValid({...player,equippedBags:[player.equippedBags[0],player.equippedBags[0],null,null]}),'one instance cannot add capacity twice');
assert(!bagsValid({...player,equippedBags:[randomUUID(),null,null,null]}),'equipped bag must be owned');
assert(!bagsValid({...player,ownedBags:[...player.ownedBags,player.ownedBags[0]]}),'duplicate bag IDs are invalid');
assert(!bagsValid({...hero(),ownedBags:[{...spare,slots:1000}]}),'saved bags cannot override catalog capacity');
assert(!bagsValid({...hero(),level:1,ownedBags:[spare]}),'bag level requirements are validated on save');
const gear=Object.values(GEAR).filter(item=>!item.className||item.className==='Ranger').map(item=>item.id);
const full=hero();full.inventory.potion=0;full.ownedGear.push(...gear.filter(id=>!full.ownedGear.includes(id)).slice(0,16));
assert.equal(bagUsage(full),16);assert(!bagCanFit(full,{inventory:{...full.inventory,potion:1}}));
const openSlot=full.ownedGear.at(-1);full.equipment[GEAR[openSlot].slot==='ring'?'ring1':GEAR[openSlot].slot]=openSlot;
assert.equal(bagUsage(full),15,'equipping gear frees one inventory slot');
assert(bagCanFit(full,{inventory:{...full.inventory,potion:1}}));
full.inventory.potion=1;
assert(bagCanFit(full,{inventory:{...full.inventory,potion:999}}),'an existing resource stack uses one slot at any quantity');
assert(!bagCanFit(full,{inventory:{...full.inventory,potion:Number.MAX_SAFE_INTEGER+1}}),'stack amounts cannot overflow');
assert(!auctionCanReceive(full,{kind:'resource',id:'herb',quantity:1}),'auction gains respect capacity');
assert(auctionCanReceive(full,{kind:'resource',id:'potion',quantity:1}),'auction gains can join an existing full-bag stack');
const legacy={...hero(),ownedGear:[...gear],inventory:{wood:1,crystal:1,herb:1,potion:1,relic:1}};
delete legacy.ownedBags;delete legacy.equippedBags;
const oldAssets=structuredClone({ownedGear:legacy.ownedGear,inventory:legacy.inventory,equipment:legacy.equipment});
const required=Math.ceil((bagUsage(legacy)-16)/24);migrateBags(legacy,randomUUID);
assert(bagsValid(legacy));assert.equal(legacy.ownedBags.length,required,'migration adds the minimum number of bags needed');
assert.deepEqual({ownedGear:legacy.ownedGear,inventory:legacy.inventory,equipment:legacy.equipment},oldAssets,'migration never loses old items');
const after=structuredClone(legacy);migrateBags(legacy,randomUUID);assert.deepEqual(legacy,after,'migration is idempotent');
const small=hero();delete small.ownedBags;delete small.equippedBags;migrateBags(small,randomUUID);assert.equal(small.ownedBags.length,0,'normal old inventories receive no free bags');
assert.deepEqual(bagMerchantStock('city-armorer'),Object.values(BAG_ITEMS));
assert.equal(bagMerchantStock('village-pinewake-merchant').length,4);
for(const id of ['city-weaponsmith','riding-trainer','fake'])assert.equal(bagMerchantStock(id).length,0);
console.log('PASS: 16 base slots, four bag sockets, duplicate types/unique instances, stack and gear accounting, capacity/level validation, auction gains and lossless minimum legacy migration.');
