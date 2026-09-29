import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {bagItems,renderBackpack,renderGear}=await import('../src/character-ui.ts');
const {starterGear}=await import('../src/progression.ts');
hook.deregister();

const worn={id:'00000000-0000-4000-8000-000000000001',kind:'linen-pouch'},spare={id:'00000000-0000-4000-8000-000000000002',kind:'linen-pouch'};
const player={name:'Bag tester',appearance:{className:'Mage'},level:30,hp:100,maxHp:100,gold:1234,talents:[],...starterGear('Mage'),inventory:{wood:57,crystal:3,herb:12,potion:9,relic:5},carriedItems:{'trail-bread':4,'greater-tonic':2,'treasure-map':6,'moss-voucher':7,'chipped-fang':8},ownedBags:[worn,spare],equippedBags:[worn.id,null,null,null]};
player.ownedGear.push('starfall-staff','copper-ring');
const saved=Array(24).fill(null),items=bagItems(player);
items.filter(id=>!['wood','crystal','herb'].includes(id)).reverse().forEach((id,index)=>saved[index]=id);
saved[17]='wood';saved[20]='crystal';saved[23]='herb';
const before=JSON.stringify({player,saved});
const slots=html=>[...html.matchAll(/<(?:button|span)\b([^>]*\bdata-storage-slot="(\d+)"[^>]*)>/g)].map(([,attrs,index])=>({index:Number(index),id:attrs.match(/data-inspect-item="([^"]+)"/)?.[1]??null,locked:attrs.includes('data-storage-locked')}));
const occupied=html=>slots(html).filter(slot=>slot.id);
const overview=view=>renderBackpack(player,'',true,[],saved,view);
const profile=view=>renderBackpack(player,'',false,[],saved,view);
const sections=html=>[...html.matchAll(/<section class="backpack-window bag-container"[^>]*data-bag-container="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)].map(([,id,body])=>({id,slots:slots(body)}));

for(const render of [overview,profile]){
 const balance=view=>render(view).match(/<div class="bag-currency bag-moss"[^>]*>[\s\S]*?<\/div>/)?.[0];
 assert(balance({}).includes('<strong>—</strong>'),'an unread wallet balance is never shown as zero');
 assert(balance({mossBalance:'0.0'}).includes('<strong>0</strong>'),'a successful empty-wallet read shows zero');
 assert(balance({mossBalance:'1234.567890123456789'}).includes('<strong>1,234.5678</strong>'),'both bag layouts show a compact primary wallet amount beside gold');
 assert(balance({mossBalance:'1234.567890123456789'}).includes('1234.567890123456789 MOSS'),'the complete decimal amount remains available in the title');
 assert(balance({mossBalance:'0.000000000000000001'}).includes('<strong>&lt;0.0001</strong>'),'a nonzero dust balance never rounds to zero');
 assert(balance({mossBalance:'<img src=x>'}).includes('<strong>—</strong>'),'invalid values cannot become wallet markup');
 assert.equal((render({mossBalance:'1'}).match(/bag-currency bag-moss/g)||[]).length,1,'MOSS appears once alongside the shared gold total');
}

const combined=profile();
assert(combined.includes('bag-manager bag-profile'));
assert.equal(slots(combined).length,24,'combined view includes the backpack and real equipped-bag capacity');
assert.deepEqual(slots(combined).map(slot=>slot.id),saved,'custom layout retains empty positions');
assert(combined.includes('data-select-bag="all" aria-pressed="true"'));
assert(combined.includes(`data-select-bag="${worn.id}"`));
assert(!combined.includes(`data-select-bag="${spare.id}"`),'carried spare bags do not create tabs');
assert.equal((combined.match(/data-bag-slot=/g)||[]).length,4,'empty sockets remain usable in the profile');
assert(combined.includes('data-bag-layout="list"')&&combined.includes('data-bag-layout="grid"'),'both view controls are present');
const oneBag=profile({activeBag:worn.id});
assert(oneBag.includes(`data-select-bag="${worn.id}" aria-pressed="true"`));
assert.deepEqual(slots(oneBag).map(slot=>slot.index),[16,17,18,19,20,21,22,23],'a tab retains global storage indices');
assert.deepEqual(occupied(oneBag).map(slot=>slot.id),['wood','crystal','herb']);
assert.equal(profile({activeBag:'removed-bag'}),combined,'an unknown active bag falls back to all bags');
const removed={...player,ownedBags:[spare],equippedBags:[null,null,null,null]};
assert.equal(renderBackpack(removed,'',false,[],saved,{activeBag:worn.id}),renderBackpack(removed,'',false,[],saved),'removing the active equipped bag restores the combined view');
assert(renderGear(player,'',false,[],saved,false,{activeBag:worn.id}).includes(`data-select-bag="${worn.id}" aria-pressed="true"`),'character rendering forwards the active tab');

const categories={equipment:['starfall-staff','copper-ring'],materials:['wood','crystal','herb','relic'],consumables:['potion','item:trail-bread','item:greater-tonic'],quest:['item:treasure-map','item:moss-voucher'],misc:['item:chipped-fang',`bag:${spare.id}`]};
for(const [filter,expected] of Object.entries(categories)){
 const html=overview({filter});
 assert.deepEqual(occupied(html).map(slot=>slot.id).sort(),expected.toSorted(),`${filter} contains only its exact items`);
 assert(slots(html).every(slot=>slot.locked),'filtered positions cannot be rearranged');
 for(const slot of occupied(html))assert.equal(saved[slot.index],slot.id,'filtering keeps original storage indices');
 assert(html.includes(`data-bag-filter="${filter}" aria-pressed="true"`));
}
assert.equal(occupied(overview()).length,items.length,'All includes every item once');
assert(slots(overview()).every(slot=>!slot.locked),'Custom and All allow manual arrangement');
assert(overview({filter:'quest'}).includes('No matching items in this bag.'),'empty filtered bags explain why no items are shown');

for(const sort of ['type','name','quantity']){
 const html=overview({sort});
 assert.equal(slots(html).length,24,'sorting retains every real slot');
 assert(slots(html).every(slot=>slot.locked),'sorted slots cannot be rearranged');
 assert.deepEqual(sections(html).map(section=>section.slots.filter(slot=>slot.id).map(slot=>slot.id).sort()),sections(overview()).map(section=>section.slots.filter(slot=>slot.id).map(slot=>slot.id).sort()),'sorting never moves items between bags');
 for(const slot of occupied(html))assert.equal(saved[slot.index],slot.id,'sorting keeps original storage indices');
 assert(html.includes(`<option value="${sort}" selected>`));
}
const bagIds=sort=>sections(overview({sort}))[1].slots.filter(slot=>slot.id).map(slot=>slot.id);
assert.deepEqual(bagIds('quantity'),['wood','herb','crystal'],'quantities sort largest first');
assert.deepEqual(bagIds('name'),['crystal','herb','wood'],'names sort alphabetically');
assert.deepEqual(bagIds('type'),['crystal','herb','wood'],'items of the same type sort by name');
const order=Object.keys(categories),category=id=>order.findIndex(key=>categories[key].includes(id));
const sortedTypes=sections(overview({sort:'type'}))[0].slots.filter(slot=>slot.id).map(slot=>category(slot.id));
assert.deepEqual(sortedTypes,sortedTypes.toSorted((a,b)=>a-b),'Type groups equipment, materials, consumables, quest and misc');
const searched=overview({search:'LANTERN FRAGMENTS'});
assert.deepEqual(occupied(searched).map(slot=>slot.id),['crystal'],'search is case insensitive and uses actual display names');
assert.equal(occupied(searched)[0].index,20,'search retains the real global storage index');
assert(slots(searched).every(slot=>slot.locked),'search results cannot mutate the saved arrangement');
assert(overview({search:'<img src=x>'}).includes('value="&lt;img src=x&gt;"'),'search text remains escaped in the input');
const listed=overview({contents:'list'});
assert.equal(slots(listed).length,items.length,'list mode shows each occupied stack once without phantom empty items');
assert.deepEqual(occupied(listed).map(slot=>slot.id),saved.filter(Boolean),'list mode preserves custom order and exact ownership');
assert(occupied(listed).every(slot=>saved[slot.index]===slot.id),'list mode preserves global slot indices');
assert(listed.includes('data-bag-contents="list"')&&listed.includes('bag-list-copy'),'list mode exposes item names alongside art');
const selectedBag=overview({activeBag:worn.id});
assert.deepEqual(occupied(selectedBag).map(slot=>slot.id),['wood','crystal','herb'],'standalone capacity tabs filter to the real equipped container');
assert.equal(JSON.stringify({player,saved}),before,'rendering never mutates ownership, quantities or saved custom positions');
assert.equal(profile(),combined,'returning from filtered/sorted overview restores the exact custom layout');
console.log('PASS: combined and individual bag tabs, removed-bag fallback, exact filters, per-bag sorting and immutable saved slots.');
