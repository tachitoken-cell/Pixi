import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {bagItems,renderBackpack,renderGear,renderItemDetails}=await import('../src/character-ui.ts');
const {starterGear,EQUIPMENT_SLOTS,GEAR:catalog}=await import('../src/progression.ts');
hook.deregister();
const p={name:'<QA & Adventurer>',appearance:{className:'Mage'},level:2,hp:20,maxHp:112,gold:1234567,talents:[],inventory:{wood:15000,crystal:7,potion:2,herb:0,relic:3},...starterGear('Mage')};
p.ownedGear.push('starfall-staff','rootforged-charm');
assert.deepEqual(bagItems(p),['starfall-staff','rootforged-charm','wood','crystal','potion','relic']);
const bag=renderBackpack(p,'starfall-staff',true),sheet=renderGear(p,'starfall-staff');
assert.equal((bag.match(/class="bag-slot /g)||[]).length,16,'bag includes occupied and empty slots');
assert(!bag.includes('data-inspect-item="mage-staff"'),'equipped gear is outside the bag');
assert(bag.includes('aria-label="Wood, 15,000"')&&bag.includes('>15K</span>'),'large stacks retain exact accessible quantities');
assert(bag.includes('1,234,567'),'currency uses readable grouping');
assert(sheet.includes('paper-doll-stage')&&sheet.includes('&lt;QA &amp; Adventurer&gt;'),'live model mount and safe character name');
assert(renderGear({...p,betaTester:true,title:'beta-tester'}).includes('<span class="character-title">&lt;Beta Tester&gt;</span>'),'entitled title appears separately from the name');
assert(!renderGear({...p,title:'beta-tester'}).includes('class="character-title"'),'unearned title stays hidden');
assert.equal((sheet.match(/data-gear-slot=/g)||[]).length,9,'the character sheet has nine wearable slots');
for(const slot of EQUIPMENT_SLOTS)assert(sheet.includes(`data-gear-slot="${slot}"`),'every real equipment slot accepts matching drops');
assert(sheet.includes('>Body</span>')&&sheet.includes('>Necklace</span>')&&sheet.includes('>Ring 1</span>')&&sheet.includes('>Ring 2</span>'),'equipment labels distinguish the two ring positions');
assert(sheet.includes('src="/ui/gear/mage-body.png"'),'equipped body uses its original wearable thumbnail');
assert(renderItemDetails(p,'starfall-staff').includes('title="Compared with Apprentice staff"'));
assert(renderItemDetails(p,'starfall-staff').includes('data-equip-gear="starfall-staff" '));
assert(/data-equip-gear="rootforged-charm" disabled/.test(renderItemDetails(p,'rootforged-charm')),'level-gated equipment remains locked');
p.equipment.weapon='starfall-staff';
assert(!bagItems(p).includes('starfall-staff')&&bagItems(p).includes('mage-staff'),'equipping returns replaced gear to the bag');
assert(!renderItemDetails(p,'starfall-staff').includes('data-equip-gear='),'equipped items have no redundant equip action');
assert(renderItemDetails(p,'mage-staff').includes('stat-loss'),'downgrades show negative comparison');
assert(!/data-use-potion disabled/.test(renderItemDetails(p,'potion')));
p.hp=p.maxHp;
assert(/data-use-potion disabled/.test(renderItemDetails(p,'potion')),'full health cannot consume a potion');
p.hp=20;p.inventory.potion=0;
assert(!bagItems(p).includes('potion')&&/data-use-potion disabled/.test(renderItemDetails(p,'potion')));
assert(!renderItemDetails(p,'__proto__').includes('data-equip-gear='));
for(const className of ['Ranger','Knight','Mage']){
 const dressed={...p,level:20,appearance:{className},...starterGear(className)};
 dressed.ownedGear.push('lantern-charm','copper-ring','star-ring');
 for(const slot of ['head','legs','shoes','back']){
  const id=`${className.toLowerCase()}-${slot}`;
  assert(catalog[id],`${className} has actual ${slot} equipment`);dressed.ownedGear.push(id);
  const details=renderItemDetails(dressed,id),pack=renderBackpack(dressed,id);
  assert(details.includes(`data-equip-gear="${id}" `)&&!details.includes('data-unequip-gear='),'bag wearables can equip without a spurious worn state');
  assert(details.includes(`src="/ui/gear/${id}.png"`)&&pack.includes(`src="/ui/gear/${id}.png"`),'bag and details use matching wearable images');
  dressed.equipment[slot]=id;
  assert(renderItemDetails(dressed,id).includes(`data-unequip-gear="${slot}"`),'optional worn pieces can return to the bag');
  assert(!bagItems(dressed).includes(id));
  dressed.equipment[slot]=null;assert(bagItems(dressed).includes(id),'unequipping returns the owned wearable to the bag');
 }
 const ring=renderItemDetails(dressed,'copper-ring');
 for(const slot of ['ring1','ring2'])assert(ring.includes(`data-equip-slot="${slot}"`),'ring destination is explicit');
 assert(ring.includes('Equip Ring 1')&&ring.includes('Equip Ring 2')&&ring.includes('src="/ui/gear/ring.png"'));
 dressed.equipment.ring1='copper-ring';
 const secondRing=renderItemDetails(dressed,'star-ring');
 assert(secondRing.includes('title="Compared with Copper band"')&&secondRing.includes('title="Compared with empty slot"'),'each ring position compares against its own item');
 const wornRing=renderItemDetails(dressed,'copper-ring');
 assert(wornRing.includes('Equipped · Ring 1')&&wornRing.includes('data-unequip-gear="ring1"')&&!wornRing.includes('data-equip-gear='),'worn rings must be unequipped before moving to the other slot');
 dressed.equipment.ring2='star-ring';assert(renderItemDetails(dressed,'star-ring').includes('data-unequip-gear="ring2"'));
 dressed.equipment.charm='lantern-charm';
 assert(renderItemDetails(dressed,'lantern-charm').includes('data-unequip-gear="charm"')&&renderGear(dressed).includes('src="/ui/gear/necklace.png"'));
 for(const slot of ['weapon','armor'])assert(!renderItemDetails(dressed,dressed.equipment[slot]).includes('data-unequip-gear='),'required weapon and body slots remain filled');
 const view=renderGear(dressed);assert(!/undefined|NaN/.test(view)&&view.includes('data-gear-slot="ring2"'));
}
console.log('PASS: character bag contents, real slots, item comparisons, equip transitions, stack counts, potion states and safe details.');

// Exercise the shipped native gear handlers, including wrong-slot and foreign drops.
const {readFileSync}=await import('node:fs');
const {stripTypeScriptTypes}=await import('node:module');
const {runInNewContext}=await import('node:vm');
const {GEAR,gearFitsSlot}=await import('../src/progression.ts');
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const handlers={},documentHandlers={},sent=[];
const slot={dataset:{gearSlot:'armor'},classList:{add(){},remove(){}}};
const sourceItem={dataset:{dragGear:'starwoven-robes'}};
const transfer={setData(){},effectAllowed:'',dropEffect:''};
const runtime={player:{...p,ownedGear:[...p.ownedGear,'starwoven-robes']},panel:{dataset:{mode:'gear'}},GEAR,gearFitsSlot,
  send:m=>sent.push(m),document:{querySelector:()=>slot,querySelectorAll:()=>[slot],addEventListener:(name,fn)=>documentHandlers[name]=fn},
  window:{addEventListener(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  $:()=>({addEventListener:(name,fn)=>handlers[name]=fn}),renderGearPanel(){},renderInventory(){}};
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf("let draggedGear='';"),source.indexOf('function openDeath()'))),runtime);
const event=target=>({target:{closest:()=>target},dataTransfer:transfer,prevented:false,preventDefault(){this.prevented=true;}});
handlers.dragstart(event(sourceItem));
const over=event(slot);handlers.dragover(over);assert(over.prevented,'matching equipment slots accept a native drag');
handlers.drop(event(slot));const equipped=sent.pop();assert.equal(equipped?.itemId,'starwoven-robes');assert.equal(equipped.slot,'armor');
slot.dataset.gearSlot='weapon';handlers.dragstart(event(sourceItem));
const wrong=event(slot);handlers.dragover(wrong);assert(!wrong.prevented);handlers.drop(wrong);assert.equal(sent.length,0,'wrong-slot drop never sends an equip request');
slot.dataset.gearSlot='armor';sourceItem.dataset.dragGear='sunsteel-plate';handlers.dragstart(event(sourceItem));handlers.drop(event(slot));assert.equal(sent.length,0,'foreign gear cannot be equipped');
sourceItem.dataset.dragGear='copper-ring';runtime.player.ownedGear.push('copper-ring');
for(const ring of ['ring1','ring2']){slot.dataset.gearSlot=ring;handlers.dragstart(event(sourceItem));handlers.drop(event(slot));assert.equal(sent.pop()?.slot,ring,'ring drops retain the chosen hand');}
documentHandlers.dragend();
console.log('PASS: native gear drag acceptance, correct-slot equipment requests, wrong-slot/foreign-drop rejection and drag cleanup.');
