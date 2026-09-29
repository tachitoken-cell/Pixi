import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import postcss from 'postcss';

const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {bagItems,reconcileBagSlots,renderBackpack,renderGear,renderItemDetails}=await import('../src/character-ui.ts');
const {BAG_ITEMS,bagCapacity}=await import('../src/bags.ts');
const {GEAR,gearFitsSlot,starterGear}=await import('../src/progression.ts');
hook.deregister();

const fresh=()=>({name:'Bag tester',appearance:{className:'Mage'},level:30,hp:60,maxHp:112,gold:1200,talents:[],inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},...starterGear('Mage'),ownedBags:[],equippedBags:[null,null,null,null]});
const instance=(index,kind)=>({id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,kind});
const windows=html=>[...html.matchAll(/<section class="backpack-window bag-container"[^>]*data-bag-container="([^"]+)"([^>]*)>([\s\S]*?)<\/section>/g)].map(([,id,attrs,body])=>({id,hidden:/\bhidden\b/.test(attrs),body,grid:body.match(/<div class="bag-grid"[^>]*>([\s\S]*?)<\/div>/)?.[1]||''}));
const occupied=grid=>[...grid.matchAll(/data-inspect-item="([^"]+)"/g)].map(match=>match[1]);
const slotCount=grid=>(grid.match(/class="bag-slot /g)||[]).length;
const actions=html=>[...html.matchAll(/<button[^>]*data-equip-bag="([^"]+)"[^>]*data-equip-bag-slot="(\d)"([^>]*)>/g)].map(([,id,slot,attrs])=>({id,slot:Number(slot),disabled:/\bdisabled\b/.test(attrs)}));

const base=fresh(), baseHtml=renderBackpack(base,'',true), baseWindows=windows(baseHtml);
assert.equal(baseWindows.length,1,'new players have only the permanent backpack');
assert.equal(baseWindows[0].id,'backpack');
assert.equal(slotCount(baseWindows[0].grid),16,'backpack has sixteen real slots');
assert.equal((baseHtml.match(/data-bag-slot=/g)||[]).length,4,'four empty sockets remain available');
assert.equal((baseHtml.match(/data-select-bag=/g)||[]).length,2,'All bags and Backpack are the only selectable storage tabs for a new player');
assert(baseHtml.includes('0 / 16 slots')&&baseHtml.includes('data-open-character'),'capacity and character access remain visible');
assert(baseHtml.includes('/ui/bags/backpack.png')&&baseHtml.includes('aria-label="Empty bag socket 4.'),'empty sockets have art and accessible explanations');
assert(baseHtml.includes('class="item-detail is-empty" id="bag-item-details"')&&baseHtml.includes('Choose an item'),'empty desktop inspector explains its purpose without exposing an item action');

// Pending auction previews never become inventory or expose an item action.
const pendingPlayer={...fresh(),carriedItems:{'fern-lynx':1},pendingAuctionPurchases:[
  {id:'pending-pet',item:{kind:'item',id:'fern-lynx',quantity:2},currency:'moss',price:'2',expiresAt:1},
  {id:'pending-gear',item:{kind:'gear',id:'starfall-staff',quantity:1},currency:'moss',price:'3',expiresAt:1},
  {id:'pending-resource',item:{kind:'resource',id:'wood',quantity:500},currency:'moss',price:'4',expiresAt:1},
  {id:'pending-gold',item:{kind:'gold',id:'gold',quantity:201},currency:'moss',price:'5',expiresAt:1},
]};
const pendingBefore=structuredClone(pendingPlayer),ownedBefore=bagItems(pendingPlayer),slotsBefore=reconcileBagSlots(pendingPlayer);
for(const standalone of [false,true]){
  const html=renderBackpack(pendingPlayer,'',standalone),section=html.match(/<section class="bag-pending-purchases"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert(section,'both bag layouts show pending purchases');
  assert.equal((section.match(/data-pending-auction=/g)||[]).length,4,'every reserved purchase has its own preview, even after its payment deadline');
  assert(section.includes('/ui/pets/fern-lynx.png')&&section.includes('2 items · Pending delivery')&&section.includes('500 items · Pending delivery')&&section.includes('201 gold in lot'),'pending previews show the real item art and quantity');
  assert(section.includes('Purchase pending')&&section.includes('remain locked until delivery completes'));
  assert(!/<button|draggable="true"|data-(?:inspect|drag|storage|learn|claim|use|sell|trade|equip|drop)-/.test(section),'pending previews have no clickable, drag, storage, mint or inventory action');
  assert.equal((html.match(/data-storage-slot=/g)||[]).length,16,'pending purchases never create inventory slots');
  assert(html.includes('data-inspect-item="item:fern-lynx"'),'an already owned copy stays usable alongside its pending purchase');
}
assert(renderItemDetails(pendingPlayer,'item:fern-lynx').includes('data-learn-pet="fern-lynx"'),'pending copies do not lock an existing owned pet');
assert.deepEqual(pendingPlayer,pendingBefore,'rendering cannot grant inventory or change gold');
assert.deepEqual(bagItems(pendingPlayer),ownedBefore);assert.deepEqual(reconcileBagSlots(pendingPlayer),slotsBefore,'pending previews are never saved into bag layout');
assert(!renderBackpack({...pendingPlayer,pendingAuctionPurchases:[]},'',true).includes('bag-pending-purchases'),'the next authoritative snapshot removes completed or released previews');
assert(!renderGear(pendingPlayer,'',true).includes('bag-pending-purchases'),'inspecting another player never shows pending purchases');

const full=fresh();
full.ownedBags=Object.keys(BAG_ITEMS).map((kind,index)=>instance(index+1,kind));
full.equippedBags=full.ownedBags.map(bag=>bag.id);
full.ownedBags.push(instance(5,'linen-pouch'));
full.ownedGear.push(...Object.keys(GEAR).filter(id=>!full.ownedGear.includes(id)).slice(0,22));
full.inventory={wood:12000,crystal:3,herb:8,potion:2,relic:1};
const allHtml=renderBackpack(full,`bag:${full.ownedBags[4].id}`,true), allWindows=windows(allHtml);
assert.equal(bagCapacity(full),76);
assert.equal(allWindows.length,5,'backpack and four actual equipped containers render separately');
assert.deepEqual(allWindows.map(window=>slotCount(window.grid)),[16,8,12,16,24],'each bag retains its own capacity');
assert.deepEqual(allWindows.flatMap(window=>occupied(window.grid)),bagItems(full),'every inventory item appears exactly once in stable container order');
assert.equal(new Set(allWindows.flatMap(window=>occupied(window.grid))).size,bagItems(full).length,'container partitions never duplicate items');
assert(allHtml.includes('28 / 76 slots'),'bag bar uses occupied stacks, not raw item quantities');
assert(!/id="bag-item-details"[^>]* hidden>/.test(allHtml),'selected item details remain visible');
const actionFirst=renderItemDetails({...fresh(),carriedItems:{'greater-tonic':2}},'item:greater-tonic',false,true);
assert(actionFirst.includes('data-use-item=')&&actionFirst.indexOf('data-use-item=')<actionFirst.indexOf('data-item-lock='),'standalone inspector puts the primary item action before the protection explanation');
assert.equal((actionFirst.match(/data-item-lock=/g)||[]).length,1,'reordering retains one authoritative lock control');
assert.equal((allHtml.match(/class="bag-currency"/g)||[]).length,1,'currency is displayed once in the shared inventory footer');
assert(allWindows.every(window=>!window.body.includes('bag-currency')),'individual bag rows do not duplicate the shared footer');
for(const bag of full.ownedBags){
 assert(allHtml.includes(`/ui/bags/${bag.kind}.png`),'all real bag kinds use generated art');
 assert(allHtml.includes(`data-drag-bag="${bag.id}"`),'worn and carried bags can move to sockets');
}
assert(allHtml.includes('aria-label="Wood, 12,000"')&&allHtml.includes('>12K</span>'),'resource stacks preserve exact accessible counts');
assert(allWindows[1].body.includes(`data-inspect-item="bag:${full.ownedBags[0].id}"`),'equipped bag header can open its management details');

const closed=['backpack',full.ownedBags[1].id], closedHtml=renderBackpack(full,'',true,closed), closedWindows=windows(closedHtml);
assert.deepEqual(closedWindows.filter(window=>window.hidden).map(window=>window.id),closed,'containers close independently');
assert.deepEqual(closedWindows.map(window=>occupied(window.grid)),allWindows.map(window=>occupied(window.grid)),'closing a bag does not move its items');
for(const id of closed)assert(closedHtml.includes(`data-select-bag="${id}"`),'closed bags remain selectable through their capacity tabs');
for(const window of closedWindows){
 assert(window.body.includes(`data-close-container="${window.id}"`),'individual close buttons use the dedicated handler');
 assert(!window.body.includes('data-close-bag'),'closing a container cannot invoke close-all');
}
const profile=renderGear(full,'',false,closed);
assert(profile.includes('bag-manager bag-profile')&&profile.includes('data-select-bag="all" aria-pressed="true"'),'character view shows the combined inventory tab');
assert.equal((profile.match(/data-select-bag=/g)||[]).length,5,'each equipped bag remains available from its own tab');
assert.equal(windows(profile).length,0,'character inventory no longer repeats the full bag overview');
const inspected=renderGear(full,'',true,closed);
assert(!/data-(?:toggle-bag|bag-slot|equip-bag|unequip-bag|drag-bag)=/.test(inspected),'inspecting someone else never exposes their bag controls');

const duplicate=fresh();duplicate.ownedBags=[instance(10,'linen-pouch'),instance(11,'linen-pouch')];duplicate.equippedBags=[duplicate.ownedBags[0].id,duplicate.ownedBags[1].id,null,null];
assert.deepEqual(windows(renderBackpack(duplicate,'',true)).map(window=>window.id),['backpack',...duplicate.ownedBags.map(bag=>bag.id)],'two bags of the same kind remain distinct instances');
assert.equal(bagCapacity(duplicate),32);

const spare=full.ownedBags[4], spareDetails=renderItemDetails(full,`bag:${spare.id}`), spareActions=actions(spareDetails);
assert.deepEqual(spareActions.map(action=>action.slot),[0,1,2,3],'carried bags offer each explicit socket destination');
assert(spareActions.every(action=>action.id===spare.id),'equip actions bind the actual instance');
assert(spareDetails.includes('data-bag-model="linen-pouch"')&&spareDetails.includes('class="bag-model-preview"'),'item details mount the actual rotatable bag model');
assert(spareDetails.includes('Sell at a bag merchant for 6 gold.')&&!spareDetails.includes('data-sell-bag'),'selling remains a nearby merchant action');
const wornDetails=renderItemDetails(full,`bag:${full.ownedBags[0].id}`);
assert(wornDetails.includes('data-unequip-bag="0"')&&!wornDetails.includes('data-equip-bag='),'worn bags offer unequip, not a duplicate equip action');
const locked=fresh();locked.level=1;locked.ownedBags=[instance(20,'runewoven-holdall')];
assert(actions(renderItemDetails(locked,`bag:${locked.ownedBags[0].id}`)).every(action=>action.disabled),'higher-level bags clearly lock every equip option');
const crowded=fresh();crowded.ownedBags=[instance(30,'trail-satchel'),instance(31,'linen-pouch')];crowded.equippedBags=[crowded.ownedBags[0].id,null,null,null];
crowded.ownedGear.push(...Object.keys(GEAR).filter(id=>!crowded.ownedGear.includes(id)).slice(0,25));
assert.equal(bagItems(crowded).length,26);
assert(/data-unequip-bag="0" disabled/.test(renderItemDetails(crowded,`bag:${crowded.ownedBags[0].id}`)),'a full inventory cannot unequip needed storage');
assert.deepEqual(actions(renderItemDetails(crowded,`bag:${crowded.ownedBags[1].id}`)).map(action=>action.disabled),[true,false,false,false],'shrinking a full bag is blocked while a free socket stays usable');
assert(!/data-(?:equip|unequip)-bag=/.test(renderItemDetails(full,'bag:forged')),'unowned bag identifiers cannot create management actions');

// Run the shipped native drag handlers with actual ownership and socket targets.
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'), handlers={}, documentHandlers={}, sent=[], hints=[];
const socket={dataset:{bagSlot:'2'},classList:{add(){},remove(){}}};
const runtime={player:full,panel:{dataset:{mode:'inventory'}},GEAR,gearFitsSlot,send:message=>sent.push(message),selectBagItem:id=>hints.push(id),toast:message=>hints.push(message),
 document:{querySelectorAll:()=>[socket],addEventListener:(name,handler)=>documentHandlers[name]=handler},window:{addEventListener(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},$:()=>({addEventListener:(name,handler)=>handlers[name]=handler}),renderGearPanel(){},renderInventory(){}};
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf("let draggedGear='';"),source.indexOf('function openDeath()'))),runtime);
const dragEvent=(selector,node)=>({target:{closest:wanted=>wanted===selector?node:null},dataTransfer:{setData(){},effectAllowed:'',dropEffect:''},prevented:false,preventDefault(){this.prevented=true;}});
const carried={dataset:{dragBag:spare.id}};
handlers.dragstart(dragEvent('[data-drag-bag]',carried));
const hover=dragEvent('[data-bag-slot]',socket);handlers.dragover(hover);assert(hover.prevented,'bag sockets accept native bag drags');
handlers.drop(dragEvent('[data-bag-slot]',socket));
assert.deepEqual(JSON.parse(JSON.stringify(sent.pop())),{type:'equipBag',bagId:spare.id,slot:2},'bag drop sends the chosen instance and destination');
carried.dataset.dragBag='foreign-instance';handlers.dragstart(dragEvent('[data-drag-bag]',carried));handlers.drop(dragEvent('[data-bag-slot]',socket));
assert.equal(sent.length,0,'foreign bags cannot be equipped by a drop');
carried.dataset.dragBag=spare.id;handlers.dblclick(dragEvent('[data-drag-bag]',carried));
assert.equal(sent.length,0);assert.equal(hints[0],`bag:${spare.id}`,'double-clicking with all sockets filled opens replacement choices');
runtime.player={...full,equippedBags:[full.equippedBags[0],null,full.equippedBags[2],full.equippedBags[3]]};
handlers.dblclick(dragEvent('[data-drag-bag]',carried));assert.equal(sent.pop()?.slot,1,'double-click equips into the first empty socket');
documentHandlers.dragend();

runtime.player={...full,id:'locked-slot-tester'};
runtime.currentBagSlots=()=>assert.fail('a filtered or sorted drop must never request a mutable storage layout');
runtime.saveLocal=()=>assert.fail('a filtered or sorted drop must never save a layout');
handlers.dragstart(dragEvent('[data-drag-item]',{dataset:{dragItem:'wood'}}));
const lockedSlot={dataset:{storageSlot:'1',storageLocked:'true'}};
const lockedHover=dragEvent('[data-storage-slot]',lockedSlot);handlers.dragover(lockedHover);
assert(!lockedHover.prevented,'filtered or sorted slots do not advertise a storage drop');
const lockedDrop=dragEvent('[data-storage-slot]',lockedSlot);handlers.drop(lockedDrop);
assert(!lockedDrop.prevented&&sent.length===0,'a drop onto a filtered or sorted slot does not move or equip items');
documentHandlers.dragend();

const css=readFileSync(new URL('../src/character-bags.css',import.meta.url),'utf8');
assert(/\.bag-model-preview\s*\{[^}]*height:\s*120px/.test(css)&&css.includes('.bag-model-preview canvas:focus-visible'),'compact bag model previews keep their keyboard focus treatment');
const rules=postcss.parse(css);
const desktopStyle=selector=>{const result={};rules.walkRules(rule=>{
 if(rule.parent.type==='atrule'||!rule.selectors.some(part=>part.trim().replaceAll('"',"'")===selector))return;
 rule.walkDecls(declaration=>{result[declaration.prop]=declaration.value;if(declaration.prop==='overflow')result['overflow-x']=result['overflow-y']=declaration.value;});
});return result;};
const panelStyle=desktopStyle('body #panel[open]:has(.profile-inventory, .bag-overview)');
assert(panelStyle['border-image'].includes('var(--ornate-panel-art)'),'one shared inventory frame uses the Mossvale artwork');
assert.equal(panelStyle['pointer-events'],'auto','the shared frame catches clicks instead of passing them to the world');
assert.equal(desktopStyle("body #panel[data-mode='gear'] .bag-profile .bag-grid")['grid-template-columns'],'repeat(8, minmax(0, 1fr))','the character inventory has eight columns');
assert.equal(desktopStyle("body #panel[data-mode='inventory'] .bag-redesign .bag-container .bag-grid")['grid-template-columns'],'repeat(auto-fill,minmax(58px,1fr))','the item workspace adapts its columns beside the inspector');
const inventoryScroll=desktopStyle("body #panel:is([data-mode='gear'], [data-mode='inventory']) :is(.bag-profile, .bag-overview) .bag-windows");
assert.equal(inventoryScroll['overflow-y'],'auto','all inventory slots remain reachable within the frame');
assert.equal(inventoryScroll['overflow-x'],'hidden','item grids do not require horizontal scrolling');
assert.equal(desktopStyle('.bag-container::before').content,'none','individual bags remain sections of the shared frame');
assert.equal(desktopStyle("body #panel:is([data-mode='gear'], [data-mode='inventory']) :is(.profile-inventory, .bag-overview) #bag-item-details").position,'relative','item details share the inventory layout');
const maximum=fresh();maximum.ownedBags=Array.from({length:4},(_,index)=>instance(50+index,'runewoven-holdall'));maximum.equippedBags=maximum.ownedBags.map(bag=>bag.id);
assert.deepEqual(windows(renderBackpack(maximum,'',true)).map(window=>slotCount(window.grid)),[16,24,24,24,24],'the largest loadout keeps every one of its 112 slots visible');
await import('./check-bag-views.mjs');
console.log('PASS: cohesive inventory, all bag capacities, stable item partitioning, independent open state, duplicate instances, generated art, safe equip/unequip, native drops, locked filtered slots and responsive grid layout.');

const protectedPlayer={...fresh(),inventory:{wood:4,crystal:0,herb:0,potion:2,relic:0},carriedItems:{'slime-residue':3},ownedBags:[instance(99,'linen-pouch')],lockedItems:['wood','item:slime-residue','mage-head','bag:'+instance(99,'linen-pouch').id]};
protectedPlayer.ownedGear.push('mage-head');
for(const id of protectedPlayer.lockedItems){
 const html=renderItemDetails(protectedPlayer,id);
 assert.match(html,/data-lock-value="false" aria-pressed="true"/,'every protected item type has an explicit accessible Unlock action');
 assert.match(html,/Locked · protected from sale, drop and transfer/);
}
const protectedBag=renderBackpack(protectedPlayer,'wood',true);
assert.equal((protectedBag.match(/data-item-locked="true"/g)||[]).length,4,'each protected bag entry visibly marks its protection');
assert.match(protectedBag,/future pickups/,'stack scope stays explicit');
