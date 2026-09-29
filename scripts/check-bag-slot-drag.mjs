import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {bagItems,reconcileBagSlots,renderBackpack,renderGear}=await import('../src/character-ui.ts');
const {GEAR,gearById,gearFitsSlot,starterGear}=await import('../src/progression.ts');
const {LOOT_ITEMS,lootItemValid}=await import('../src/loot-items.ts');
hook.deregister();
const bag={id:'00000000-0000-4000-8000-000000000001',kind:'linen-pouch'},spare={...bag,id:'00000000-0000-4000-8000-000000000002'};
const hero={id:'character-a',name:'Slot tester',characterCreated:true,appearance:{className:'Mage'},level:30,hp:60,maxHp:112,gold:10,talents:[],...starterGear('Mage'),inventory:{wood:15,crystal:0,herb:0,potion:2,relic:0},carriedItems:{'slime-residue':3,'trail-bread':2},ownedBags:[bag,spare],equippedBags:[bag.id,null,null,null]};
hero.ownedGear.push('starfall-staff','lantern-charm','copper-ring','star-ring');
const sorted=items=>items.filter(Boolean).sort();
const saved=Array(24).fill(null);saved[0]='unknown';saved[1]={id:'wood'};saved[5]='starfall-staff';saved[20]='wood';saved[21]='wood';
const sparse=reconcileBagSlots(hero,saved);
assert.equal(sparse.length,24);assert.equal(sparse[5],'starfall-staff');assert.equal(sparse[20],'wood');assert.equal(sparse[21],null);
assert.deepEqual(sorted(sparse),sorted(bagItems(hero)),'malformed, duplicate and foreign saved entries cannot hide or duplicate inventory');
assert.deepEqual(reconcileBagSlots(hero,sparse),sparse,'reconciliation preserves holes and is stable');
const smaller={...hero,equippedBags:[null,null,null,null]},shrunk=reconcileBagSlots(smaller,sparse);
assert.equal(shrunk.length,16);assert.deepEqual(sorted(shrunk),sorted(bagItems(smaller)),'removing a bag rescues items beyond the new capacity');
const equipped={...hero,equipment:{...hero.equipment,weapon:'starfall-staff'},inventory:{...hero.inventory,wood:0}};
const changed=reconcileBagSlots(equipped,sparse);
assert(!changed.includes('wood')&&!changed.includes('starfall-staff'));assert(changed.includes('mage-staff'),'replaced gear returns to a free cell');
assert.deepEqual(sorted(changed),sorted(bagItems(equipped)));

const html=renderBackpack(hero,'',true,[],sparse),tags=[...html.matchAll(/<(?:button|span)\b[^>]*data-storage-slot="(\d+)"[^>]*>/g)];
assert.deepEqual(tags.map(([,index])=>Number(index)),Array.from({length:24},(_,i)=>i),'all cells have unique global indices across bags');
for(const id of bagItems(hero))assert(tags.some(([tag])=>tag.includes(`data-drag-item="${id}"`)&&tag.includes('draggable="true"')),`${id} supports storage dragging`);
assert(html.includes(`${bagItems(hero).length} / 24 slots`));
const windows=[...html.matchAll(/<section class="backpack-window bag-container"[^>]*>([\s\S]*?)<\/section>/g)].map(([,body])=>body);
assert(windows[0].includes(`<span>${sparse.slice(0,16).filter(Boolean).length} / 16 slots</span>`));
assert(windows[1].includes(`<span>${sparse.slice(16).filter(Boolean).length} / 8 slots</span>`),'window counters count occupied cells, not array length');
assert(renderGear(hero,'',false,[],sparse).includes('data-storage-slot="20" draggable="true" data-drag-item="wood"'),'character bags share the saved layout');

// Run the shipped layout and delegated event handlers, without a second implementation.
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const layoutSource=source.slice(source.indexOf("let bagLayoutPlayer="),source.indexOf('const closedBagIds='));
const handlersSource=source.slice(source.indexOf("let draggedGear='';"),source.indexOf('function openDeath()'));
const storage=new Map();
function runtime(player=structuredClone(hero)){
 const handlers={},documentHandlers={},windowHandlers={},frames=new Map(),sent=[];let nextFrame=0,paints=0;
 const context={player,panel:{open:true,dataset:{mode:'inventory'}},GEAR,gearById,gearFitsSlot,LOOT_ITEMS,lootItemValid,reconcileBagSlots,
  readLocal:key=>storage.get(key),saveLocal:(key,value)=>storage.set(key,value),send:message=>sent.push(JSON.parse(JSON.stringify(message))),
  requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),
  selectBagItem(){},toast(){},renderInventory(){paints++;},renderGearPanel(){paints++;},
  document:{querySelectorAll:()=>[],addEventListener:(name,fn)=>documentHandlers[name]=fn},window:{addEventListener:(name,fn)=>windowHandlers[name]=fn},$:()=>({addEventListener:(name,fn)=>handlers[name]=fn})};
 runInNewContext(stripTypeScriptTypes(`${layoutSource}\n${handlersSource}\nglobalThis.slots=currentBagSlots;globalThis.dragging=()=>!!(draggedGear||draggedBag||draggedItem);`),context);
 return {context,handlers,documentHandlers,windowHandlers,sent,get paints(){return paints;},frame(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}};
}
const node=dataset=>({dataset,closest(selector){const key=selector.match(/^\[data-([\w-]+)\]$/)?.[1]?.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return key&&Object.hasOwn(this.dataset,key)?this:null;}});
const item=id=>node({dragItem:id,inspectItem:id,...(GEAR[id]?{dragGear:id}:{}),...(id.startsWith('bag:')?{dragBag:id.slice(4)}:{})});
const event=target=>({target,dataTransfer:{setData(){},effectAllowed:'',dropEffect:''},prevented:false,preventDefault(){this.prevented=true;}});
const test=runtime(),{context,handlers,sent}=test;
const drag=(id,to)=>{handlers.dragstart(event(item(id)));handlers.drop(event(node({storageSlot:String(to)})));};
const start=context.slots(),woodFrom=start.indexOf('wood');
handlers.dragstart(event(item('wood')));
const over=event(node({storageSlot:'23'}));handlers.dragover(over);assert(over.prevented,'empty bag cells accept native drops');
handlers.drop(event(node({storageSlot:'23'})));assert.equal(context.slots()[23],'wood');assert.equal(context.slots()[woodFrom],null,'moving to another bag leaves the original cell empty');
const ringFrom=context.slots().indexOf('copper-ring');drag('wood',ringFrom);
assert.equal(context.slots()[ringFrom],'wood');assert.equal(context.slots()[23],'copper-ring','occupied drops swap instead of deleting the destination');
for(const target of [-1,24,1.5,'invalid']){const before=context.slots();drag('wood',target);assert.deepEqual(context.slots(),before,'invalid destinations leave the layout unchanged');}
const beforeForeign=context.slots();drag('unowned-item',23);assert.deepEqual(context.slots(),beforeForeign,'foreign items cannot enter the layout');
handlers.dragstart(event(item('wood')));context.player={...context.player,inventory:{...context.player.inventory,wood:0}};
const afterRemoval=context.slots();handlers.drop(event(node({storageSlot:'23'})));assert.deepEqual(context.slots(),afterRemoval,'a consumed source cannot move the new occupant of its former index');
context.player=structuredClone(hero);const restored=context.slots();
assert.deepEqual(runtime().context.slots(),restored,'stored positions survive a new client runtime');
handlers.dragstart(event(item('wood')));context.player={...structuredClone(hero),id:'character-b'};
const other=context.slots();handlers.drop(event(node({storageSlot:'23'})));assert.deepEqual(context.slots(),other,'a drag cannot follow the player into another character');
context.player=structuredClone(hero);assert.deepEqual(context.slots(),restored,'character switches restore each layout independently');
storage.set('mossvale:bag-slots:broken','{bad json');assert.deepEqual(sorted(runtime({...hero,id:'broken'}).context.slots()),sorted(bagItems(hero)),'corrupt storage does not lose inventory');
assert.equal(sent.length,0,'storage moves never send equipment or inventory mutations');
const resizing=runtime({...structuredClone(hero),id:'resizing'});
resizing.handlers.dragstart(event(item('wood')));resizing.handlers.drop(event(node({storageSlot:'23'})));
resizing.handlers.dragstart(event(item('wood')));resizing.context.player.equippedBags=[null,null,null,null];
resizing.handlers.drop(event(node({storageSlot:'15'})));
assert.equal(resizing.context.slots()[15],'wood','a drop resolves the source by item after capacity changes its cell');
assert.deepEqual(sorted(resizing.context.slots()),sorted(bagItems(resizing.context.player)),'resizing during a drag preserves every item');

for(const id of ['starfall-staff','copper-ring','star-ring'])handlers.dblclick(event(item(id)));
assert.deepEqual(sent.splice(0),['starfall-staff','copper-ring','star-ring'].map(itemId=>({type:'equipGear',itemId})),'double-click uses the authoritative equip action and automatic ring hand selection');
context.player.level=1;handlers.dblclick(event(item('starfall-staff')));handlers.dblclick(event(item('sunsteel-plate')));handlers.dblclick(event(item('wood')));
assert.equal(sent.length,0,'locked, unowned and material items do not equip');
handlers.dblclick(event(item(`bag:${spare.id}`)));assert.deepEqual(sent.pop(),{type:'equipBag',bagId:spare.id,slot:1},'bag double-click retains the first empty socket behavior');
handlers.dblclick(event(item('item:trail-bread')));assert.deepEqual(sent.pop(),{type:'useItem',itemId:'trail-bread'},'consumable double-click still uses the item');

const lifecycle=runtime(),begin=()=>lifecycle.handlers.dragstart(event(item('wood')));
begin();lifecycle.documentHandlers.drop();lifecycle.handlers.drop(event(node({storageSlot:'23'})));
assert(lifecycle.context.dragging(),'drop retains its native source until the browser finishes');assert.equal(lifecycle.paints,0,'drop never rebuilds the source synchronously');
lifecycle.documentHandlers.dragend();assert(!lifecycle.context.dragging());assert.equal(lifecycle.paints,0,'dragend also finishes before repaint');
lifecycle.frame();assert.equal(lifecycle.paints,1,'completed drag refreshes the inventory');
begin();lifecycle.documentHandlers.drop();lifecycle.frame();assert(!lifecycle.context.dragging(),'a drop outside the inventory recovers without a bubbling dragend');lifecycle.frame();
for(const end of [()=>lifecycle.documentHandlers.pointerdown(),()=>lifecycle.windowHandlers.pagehide()]){
 begin();const before=lifecycle.paints;end();assert(!lifecycle.context.dragging(),'interrupted drags cannot keep the inventory frozen');lifecycle.frame();assert.equal(lifecycle.paints,before,'recovery must not detach the next clicked control');
}
begin();lifecycle.documentHandlers.drop();begin();lifecycle.frame();assert(lifecycle.context.dragging(),'a queued old drop cannot cancel a new drag');
lifecycle.documentHandlers.dragend();const beforePress=lifecycle.paints;lifecycle.documentHandlers.pointerdown();lifecycle.frame();assert.equal(lifecycle.paints,beforePress,'a pending dragend repaint cannot detach the next pressed control');
begin();lifecycle.documentHandlers.dragend();begin();lifecycle.frame();assert(lifecycle.context.dragging(),'a pending dragend repaint cannot detach a new drag source');
lifecycle.documentHandlers.dragend();lifecycle.context.panel.open=false;const beforeClosed=lifecycle.paints;lifecycle.frame();assert.equal(lifecycle.paints,beforeClosed,'cleanup never repaints a closed panel');
assert.equal(lifecycle.documentHandlers.pointercancel,undefined,'native drag startup cancels pointer input without cancelling the item drag');
assert.equal(lifecycle.windowHandlers.blur,undefined,'moving a live native drag to another window must retain its source');
assert.equal(lifecycle.documentHandlers.visibilitychange,undefined,'moving a live native drag to another tab must retain its source');
console.log('PASS: sparse bag slots, all item drags, swaps, stale/invalid drops, persistence, double-click equip and interrupted native drag recovery.');
