import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hooks = registerHooks({resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
}});
const { TREASURE_MAP_SITES, treasureMapPlayerValid } = await import('../src/treasure-maps.ts');
const { renderItemDetails } = await import('../src/character-ui.ts');
const { renderItemTooltip } = await import('../src/item-tooltip.ts');
const { auctionCanList, auctionItemChanges } = await import('../src/auction.ts');
const { bankDeposit, bankWithdraw, newBank } = await import('../src/bank.ts');
const { newBags } = await import('../src/bags.ts');
const { starterGear } = await import('../src/progression.ts');
hooks.deregister();

const map = {id:'00000000-0000-4000-8000-000000000001', siteId:TREASURE_MAP_SITES[0].id, stage:'search', level:1, voucher:false};
assert(treasureMapPlayerValid({}) && treasureMapPlayerValid({treasureMap:null}), 'old saves need no expedition');
for (const stage of ['search', 'guardian', 'chest']) assert(treasureMapPlayerValid({treasureMap:{...map,stage}}));
for (const change of [{id:'forged'}, {siteId:'unknown'}, {stage:'complete'}, {level:0}, {level:61}, {level:1.5}, {voucher:1}, {voucher:undefined}, {amount:1000}]) {
  assert(!treasureMapPlayerValid({treasureMap:{...map,...change}}), 'forged or incomplete progress rejected');
}
const player = {id:'hero',level:1,hp:100,maxHp:100,instanceId:null,appearance:{className:'Ranger'},inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},...starterGear('Ranger'),...newBags(),bank:newBank(),auctions:[],carriedItems:{'treasure-map':2}};
const item = {kind:'item',id:'treasure-map',quantity:1};
assert(auctionCanList(player,item), 'unused map follows normal auction inventory rules');
const listed = {...player,...auctionItemChanges(player,item,-1)};
assert.equal(listed.carriedItems['treasure-map'],1);
const banked = bankDeposit(player,item);
assert(banked);assert.equal(banked.carriedItems['treasure-map'],1);
const withdrawn = bankWithdraw({...player,...banked},item);
assert(withdrawn);assert.equal(withdrawn.carriedItems['treasure-map'],2);
assert(renderItemDetails(player,'item:treasure-map').includes('data-start-treasure-map'));
assert(renderItemDetails({...player,treasureMap:map},'item:treasure-map').includes('data-open-treasure-map'));
for (const changes of [{hp:0}, {instanceId:'dungeon'}, {zeppelin:{}}]) {
  assert(/data-start-treasure-map[^>]*disabled/.test(renderItemDetails({...player,...changes},'item:treasure-map')));
}
assert(renderItemTooltip('item:treasure-map').includes('Unused maps can be auctioned'));
console.log('PASS: strict expedition save validation, existing auction/bank storage, bag use/resume and unavailable states.');
