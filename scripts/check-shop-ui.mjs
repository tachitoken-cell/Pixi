import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {renderShop}=await import('../src/progression-ui.ts');
const {GEAR,RESOURCE_PRICES,starterGear,rollGear}=await import('../src/progression.ts');
const {gearSellPrice,merchantStock}=await import('../src/merchants.ts');
const {VILLAGE_NPCS}=await import('../src/settlements.ts');
const {BAG_ITEMS,newBags,bagMerchantStock,bagCanFit,bagUsage,bagCapacity}=await import('../src/bags.ts');
const {LOOT_ITEMS}=await import('../src/loot-items.ts');
const {NPC_SERVICE_COSTS}=await import('../src/shared.ts');
const {raidAction}=await import('../src/raid-ui.ts');
const {raidProgressionAction}=await import('../src/raid-progression-ui.ts');
const {itemLocked}=await import('../src/item-locks.ts');
hook.deregister();
const merchant='city-armorer',weaponsmith='city-weaponsmith';
const hero=(extra={})=>({id:'shopper',name:'Shopper',level:50,gold:5000,hp:100,maxHp:100,appearance:{className:'Ranger'},talents:[],
  ...starterGear('Ranger'),...newBags(),inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},auctions:[],...extra});
const buttons=html=>[...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
const actionPattern=/data-(?:buy-gear|equip-gear|sell-gear|buy-bag|sell-bag|sell-item|sell-resource|npc-service)=/;
const actions=html=>buttons(html).filter(tag=>actionPattern.test(tag));
const disabled=tag=>/\sdisabled(?:\s|>|=)/.test(tag);
const rows=html=>buttons(html).filter(tag=>tag.includes('data-shop-select='));
const rowIds=html=>rows(html).map(tag=>tag.match(/data-shop-select="([^"]+)"/)[1]);
const currentPage=html=>Number(html.match(/data-shop-page-current="(\d+)"/)[1]);
const pages=html=>Number(html.match(/data-shop-page-count="(\d+)"/)[1]);
function render(player,npcId=merchant,options={}){
  const before=JSON.stringify(player),html=renderShop(player,npcId,options);assert.equal(JSON.stringify(player),before,'browsing never changes items, bags, equipment or gold');
  assert(rows(html).length<=6,'each page has at most six compact rows');
  assert(rows(html).every(tag=>!disabled(tag)&&!actionPattern.test(tag)),'even locked rows select without buying, selling or equipping');
  for(const tag of rows(html)){const id=tag.match(/data-shop-select="([^"]+)"/)[1],tooltip=tag.match(/data-item-tooltip="([^"]+)"/)?.[1];const expected=id.startsWith('bag:')?`bag-kind:${tabBagKind(id.slice(4))}`:id.replace(/^(?:gear|resource):/,'');assert.equal(tooltip,expected,'every merchant row exposes the canonical item identity for hover inspection');}
  function tabBagKind(id){return player.ownedBags?.find(bag=>bag.id===id)?.kind||id;}
  assert.equal(rows(html).filter(tag=>tag.includes('aria-pressed="true"')).length,rows(html).length?1:0);
  assert.equal(actions(html).length,rows(html).length?1+buttons(html).filter(tag=>tag.includes('shop-sell-all')).length:0,'only the selected item has sale actions');
  assert.equal((html.match(/<aside class="training-detail shop-detail/g)||[]).length,rows(html).length?1:0,'desktop and mobile share one selected item detail panel');
  if(rows(html).length)assert.match(html,/<button\b[^>]*data-shop-select="[^"]+"[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button><aside class="training-detail shop-detail/,'mobile details follow the selected row without a duplicate sale action');
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'sale acknowledgement and quantity controls have one ID each');
  return html;
}
function allRows(player,npcId,options={}){
  const first=render(player,npcId,options),ids=[];
  for(let page=0;page<pages(first);page++)ids.push(...rowIds(render(player,npcId,{...options,page})));
  const selectedFilter=options.filter||'all',filterCount=first.match(new RegExp(`<option value="${selectedFilter}"[^>]*>[^<]*\\((\\d+)\\)<\\/option>`));
  assert(filterCount,'category filter exposes its catalog count');
  assert.equal(Number(filterCount[1]),ids.length,'category counts include every page of authoritative visible stock');
  assert.equal(new Set(ids).size,ids.length,'pagination never duplicates catalog entries');return ids;
}
function select(player,npcId,id,options={}){
  const first=render(player,npcId,options);
  for(let page=0;page<pages(first);page++)if(rowIds(render(player,npcId,{...options,page})).includes(id))return render(player,npcId,{...options,page,selected:id});
  assert.fail(`Missing ${id} at ${npcId}`);
}
function action(html,attribute,id){const tag=actions(html)[0];assert(tag?.includes(`data-${attribute}="${id}"`),`selected footer exposes ${attribute} ${id}`);return tag;}
function fullPack(player){
  const capacity=bagCapacity(player),carriedItems=Object.fromEntries(Object.keys(LOOT_ITEMS).slice(0,capacity).map(id=>[id,1]));
  const extra=Object.values(GEAR).filter(gear=>!player.ownedGear.includes(gear.id)&&(!gear.className||gear.className===player.appearance.className)).slice(0,capacity-Object.keys(carriedItems).length);
  const full={...player,carriedItems,ownedGear:[...player.ownedGear,...extra.map(gear=>gear.id)]};assert.equal(bagUsage(full),capacity);assert(bagCanFit(full));return full;
}

for(const className of ['Ranger','Knight','Mage'])for(const npc of VILLAGE_NPCS.filter(npc=>npc.role==='merchant')){
  const player=hero({appearance:{className},...starterGear(className)}),stock=merchantStock(npc.id).filter(gear=>!gear.className||gear.className===className);
  assert.deepEqual(allRows(player,npc.id,{filter:'equipment'}).sort(),stock.map(gear=>`gear:${gear.id}`).sort(),'every NPC exposes exactly its real class-compatible equipment');
  assert.deepEqual(allRows(player,npc.id,{filter:'bags'}).sort(),bagMerchantStock(npc.id).map(bag=>`bag:${bag.id}`).sort());
  assert.deepEqual(allRows(player,npc.id,{filter:'supplies'}),['potion']);
  assert.equal(allRows(player,npc.id).length,stock.length+bagMerchantStock(npc.id).length+1);
}
const player=hero(),first=render(player);
assert(first.includes('data-shop-tab="buy" aria-pressed="true"')&&first.includes('id="shop-filter"')&&first.includes('/ui/merchant-emblem.png'));
assert.equal(currentPage(first),0);assert(pages(first)>1);assert(buttons(first).some(tag=>tag.includes('data-shop-page="0"')&&disabled(tag)));
const last=render(player,merchant,{page:999});assert.equal(currentPage(last),pages(first)-1);assert(rowIds(last).length>0);
assert.equal(currentPage(render(player,merchant,{page:-1})),0);assert.equal(currentPage(render(player,merchant,{page:Infinity})),0);
const changed=render(player,merchant,{page:1,selected:rowIds(first)[0]});assert(!rowIds(changed).includes(rowIds(first)[0]),'page changes do not preserve an off-page purchase');
assert.deepEqual(rowIds(render(player,merchant,{filter:'unknown',selected:'unknown'})),rowIds(first),'invalid filters and selections fall back to visible stock');
const empty=render(player,weaponsmith,{filter:'bags'});assert.equal(rows(empty).length,0);assert(empty.includes('No stock')&&buttons(empty).some(disabled));
for(const npc of [undefined,'unknown','__proto__',VILLAGE_NPCS.find(npc=>npc.role==='healer').id])assert(!renderShop(player,npc).includes('data-shop-select='),'missing, fake and non-merchant NPCs expose no transactions');

const gear=GEAR['briarwatch-head'],gearId=`gear:${gear.id}`;
assert(!disabled(action(select(hero({gold:gear.price}),merchant,gearId),'buy-gear',gear.id)),'exact gold buys eligible equipment');
for(const locked of [hero({level:gear.requiredLevel-1}),hero({gold:gear.price-1}),fullPack(hero()),hero({auctions:[{item:{kind:'gear',id:gear.id}}]})])
  assert(disabled(action(select(locked,merchant,gearId),'buy-gear',gear.id)),'level, gold, full capacity and existing auction escrow block purchases');
const owned=hero({ownedGear:[...player.ownedGear,gear.id]}),worn={...owned,equipment:{...owned.equipment,head:gear.id}};
assert(!disabled(action(select(owned,merchant,gearId),'equip-gear',gear.id)));assert(disabled(action(select(worn,merchant,gearId),'equip-gear',gear.id)));
const weapon=GEAR['warden-longbow'],packed=fullPack(hero()),carried={...packed.carriedItems};delete carried[Object.keys(carried)[0]];
const fullOwned={...packed,ownedGear:[...packed.ownedGear,weapon.id],carriedItems:carried};assert.equal(bagUsage(fullOwned),bagCapacity(fullOwned));
assert(!disabled(action(select(fullOwned,weaponsmith,`gear:${weapon.id}`),'equip-gear',weapon.id)),'equipping a bag item accounts for the replaced item at full capacity');
const detail=select(player,merchant,gearId);assert(detail.includes(gear.description)&&detail.includes('Briarwatch')&&detail.includes('Attack damage')&&detail.includes(`+${gear.stats.primaryDamage}`)&&detail.includes('quality-uncommon'),'selected equipment retains its description, set, rarity and actual stat bonus');

for(const bag of Object.values(BAG_ITEMS)){
  const selected=`bag:${bag.id}`;
  assert(!disabled(action(select(hero({gold:bag.price}),merchant,selected,{filter:'bags'}),'buy-bag',bag.id)));
  assert(disabled(action(select(hero({gold:bag.price-1}),merchant,selected,{filter:'bags'}),'buy-bag',bag.id)));
  assert(disabled(action(select(hero({level:bag.requiredLevel-1}),merchant,selected,{filter:'bags'}),'buy-bag',bag.id)));
}
const full=fullPack(hero());assert(!disabled(action(select(full,merchant,'bag:linen-pouch',{filter:'bags'}),'buy-bag','linen-pouch')),'a full base pack can purchase an auto-equipped expansion');
const ownedBags=Array.from({length:4},(_,index)=>({id:`00000000-0000-4000-8000-00000000000${index}`,kind:'linen-pouch'}));
const socketsFull=fullPack(hero({ownedBags,equippedBags:ownedBags.map(bag=>bag.id)}));
assert(disabled(action(select(socketsFull,merchant,'bag:linen-pouch',{filter:'bags'}),'buy-bag','linen-pouch')),'four occupied sockets require room for the purchased bag itself');
const potionOptions={filter:'supplies',selected:'potion'};
assert(!disabled(action(render(hero({gold:NPC_SERVICE_COSTS.potion}),merchant,potionOptions),'npc-service','potion')));
assert(disabled(action(render(hero({gold:0}),merchant,potionOptions),'npc-service','potion')));
assert(disabled(action(render(full,merchant,potionOptions),'npc-service','potion')),'a potion needs room for its first stack');
const potionStack={...full,carriedItems:carried,inventory:{...full.inventory,potion:1}};
assert.equal(bagUsage(potionStack),bagCapacity(potionStack));assert(!disabled(action(render(potionStack,merchant,potionOptions),'npc-service','potion')),'existing potion stacks accept another potion in full bags');

const spare={id:'00000000-0000-4000-8000-000000000009',kind:'trail-satchel'};
const seller=hero({inventory:{wood:2_000_010,crystal:4,herb:2,potion:2,relic:5},carriedItems:{'slime-residue':3,'trail-bread':2,'greater-tonic':4,'stormhorn-core':1},ownedBags:[...ownedBags,spare],equippedBags:ownedBags.map(bag=>bag.id)});
assert.deepEqual(allRows(seller,merchant,{tab:'sell',filter:'resources'}),['resource:wood','resource:crystal','resource:herb']);
assert.deepEqual(allRows(seller,merchant,{tab:'sell',filter:'loot'}).sort(),Object.keys(seller.carriedItems).map(id=>`item:${id}`).sort(),'all existing monster-loot sale categories remain available');
assert.deepEqual(allRows(seller,merchant,{tab:'sell',filter:'bags'}),[`bag:${spare.id}`],'equipped bags never appear as sale choices');
assert.equal(allRows(seller,weaponsmith,{tab:'sell',filter:'bags'}).length,0,'a weaponsmith cannot sell spare bags');
const woodOne=select(seller,merchant,'resource:wood',{tab:'sell'}),woodAll=select(seller,merchant,'resource:wood',{tab:'sell',quantity:'all'});
assert(woodOne.indexOf('class="training-detail shop-detail')<woodOne.indexOf('id="shop-quantity"')&&woodOne.indexOf('id="shop-quantity"')<woodOne.indexOf('You receive:'),'sale quantity belongs in item details above the total, away from the footer action');
assert(action(woodOne,'sell-resource','wood').includes('data-sell-quantity="1"'));assert(woodOne.includes('All (1,000,000)'),'quantity option shows the available sale limit before selection');
assert(action(woodAll,'sell-resource','wood').includes('data-sell-quantity="1000000"'));assert(woodAll.includes(`${(RESOURCE_PRICES.wood*1_000_000).toLocaleString('en-US')} gold`),'sale total uses the actual capped quantity');
const lootAll=select(seller,merchant,'item:slime-residue',{tab:'sell',filter:'loot',quantity:'all'});assert(action(lootAll,'sell-item','slime-residue').includes('data-sell-item-quantity="all"'));assert(lootAll.includes('You receive: 6 gold'));
assert(!disabled(action(select(seller,merchant,`bag:${spare.id}`,{tab:'sell',filter:'bags'}),'sell-bag',spare.id)));
assert(disabled(action(select({...seller,gold:Number.MAX_SAFE_INTEGER},merchant,'resource:wood',{tab:'sell'}),'sell-resource','wood')),'sales cannot overflow the gold balance');
const bulkAction=html=>buttons(html).find(tag=>tag.includes('shop-sell-all'));
assert(bulkAction(woodOne).includes('data-sell-quantity="1000000"'),'direct bulk sale respects the resource cap');
assert(woodOne.includes('Sell 1,000,000<small>'),'a capped sale does not claim to sell the entire stack');
const lootOne=select(seller,merchant,'item:slime-residue',{tab:'sell',filter:'loot'});
assert(bulkAction(lootOne).includes('data-sell-item-quantity="3"')&&lootOne.includes('Sell all · 3<small>6 gold'),'bulk loot shows and sends the exact selected stack');
const limited=select({...seller,gold:Number.MAX_SAFE_INTEGER-RESOURCE_PRICES.wood},merchant,'resource:wood',{tab:'sell'});
assert(!disabled(action(limited,'sell-resource','wood'))&&disabled(bulkAction(limited)),'bulk gold overflow does not block a valid single sale');
assert(!bulkAction(select(seller,merchant,'item:stormhorn-core',{tab:'sell',filter:'loot'})),'single items need no Sell all button');
assert(!bulkAction(first),'buying has no Sell all button');
assert(!allRows(hero({carriedItems:{'moss-fox':2}}),merchant,{tab:'sell'}).includes('item:moss-fox'),'pets remain protected from merchant sales');
for(const quality of ['epic','legendary','mythic']){
  const rolled=rollGear('warden-longbow',quality,()=>.42),html=select(hero({ownedGear:[...player.ownedGear,rolled.id]}),merchant,`gear:${rolled.id}`,{tab:'sell',filter:'equipment'});
  const warned=quality!=='epic';
  assert.equal(html.includes('id="shop-sale-ack"'),warned,'Legendary and Mythic rolls require acknowledgement');
  assert.equal(action(html,'sell-gear',rolled.id).includes('data-sell-warning'),warned);
  if(warned)assert(html.includes('Merchant sales cannot be undone.')&&!html.includes('id="shop-sale-ack" checked'),'the warning starts unconfirmed');
}
const emptySell=render(player,merchant,{tab:'sell'});assert.equal(rows(emptySell).length,0);assert.equal(actions(emptySell).length,0);

const saleIds=[...new Set([...Object.values(GEAR).filter(item=>item.price>0).slice(0,9).map(item=>item.id),'astralweave-weapon',gear.id,'ironbastion-ring'])];
const gearSeller=hero({level:1,ownedGear:[...player.ownedGear,...saleIds,'rootforged-charm','knight-sword','unknown','__proto__'],equipment:{...player.equipment,head:gear.id,ring2:'ironbastion-ring'}});
const eligible=[...saleIds.filter(id=>![gear.id,'ironbastion-ring'].includes(id)),'rootforged-charm'].map(id=>`gear:${id}`);
for(const npc of VILLAGE_NPCS.filter(npc=>npc.role==='merchant'))assert.deepEqual(allRows(gearSeller,npc.id,{tab:'sell',filter:'equipment'}),eligible,'every merchant buys owned unequipped valuable gear regardless of class, level or stock');
assert(pages(render(gearSeller,merchant,{tab:'sell',filter:'equipment'}))>1,'equipment sales use six-row pagination');
assert(!merchantStock('village-pinewake-merchant').some(item=>item.id==='astralweave-weapon'),'high-level sale fixture is absent from this merchant stock');
const oldGear=select(gearSeller,'village-pinewake-merchant','gear:astralweave-weapon',{tab:'sell',filter:'equipment',quantity:'all'}),oldItem=GEAR['astralweave-weapon'];
assert(!disabled(action(oldGear,'sell-gear',oldItem.id))&&oldGear.includes(oldItem.description)&&oldGear.includes('Calling</dt><dd>Mage'),'sale details retain another class item without an equip-level lock');
assert(oldGear.includes('class="gear-art')&&oldGear.includes('Attack damage')&&oldGear.includes('Skill damage'),'sale details retain equipment art and stats');
assert(oldGear.includes(`You receive: ${gearSellPrice(oldItem.id).toLocaleString('en-US')} gold`)&&oldGear.includes('id="shop-quantity" disabled'),'equipment sells one copy even if All was selected');
assert.equal(gearSellPrice('warden-longbow'),16,'quarter-price payout rounds down');
assert(select(gearSeller,merchant,'gear:warden-longbow',{tab:'sell',filter:'equipment'}).includes('You receive: 16 gold'));
assert.equal(GEAR['rootforged-charm'].price,0);assert.equal(gearSellPrice('rootforged-charm'),25,'crafted gear uses its authored resale value');
assert(select(gearSeller,weaponsmith,'gear:rootforged-charm',{tab:'sell',filter:'equipment'}).includes('You receive: 25 gold'),'crafted equipment can sell despite having no shop purchase price');
assert(disabled(action(select({...gearSeller,gold:Number.MAX_SAFE_INTEGER},merchant,`gear:${oldItem.id}`,{tab:'sell',filter:'equipment'}),'sell-gear',oldItem.id)),'equipment payout cannot overflow the gold balance');
const afterSale={...gearSeller,ownedGear:gearSeller.ownedGear.filter(id=>id!==oldItem.id)};
assert(!allRows(afterSale,merchant,{tab:'sell',filter:'equipment'}).includes(`gear:${oldItem.id}`),'a confirmed sale removes the gear choice');
const reserved=['gear:warden-longbow','resource:wood','item:slime-residue',`bag:${spare.id}`],pendingSeller={...seller,ownedGear:[...seller.ownedGear,'warden-longbow']};
const pendingHtml=render(pendingSeller,merchant,{tab:'sell',pendingSales:reserved});
assert(reserved.every(id=>!allRows(pendingSeller,merchant,{tab:'sell',pendingSales:reserved}).includes(id)),'pending sale rows disappear immediately without changing authoritative inventory');
assert(pendingHtml.includes('Saving 4 sales…')&&pendingHtml.includes(`${bagUsage(pendingSeller)} / ${bagCapacity(pendingSeller)} bag slots`)&&pendingHtml.includes(`${pendingSeller.gold.toLocaleString('en-US')} gold</strong>`),'pending sales show saving with actual gold and bag usage');
assert(disabled(action(select(pendingSeller,merchant,gearId,{pendingSales:reserved}),'buy-gear',gear.id)),'purchases wait for pending sales instead of spending unconfirmed gold');
const capped=select(pendingSeller,merchant,'resource:crystal',{tab:'sell',pendingSales:Array.from({length:16},(_,index)=>`pending:${index}`)});
assert(disabled(action(capped,'sell-resource','crystal'))&&disabled(bulkAction(capped)),'the bounded queue disables both single and all sales');

// Execute the shipped panel listener so sale routing shares the real proximity and movement guards.
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),start=source.indexOf("$('panel-content').addEventListener('click',event=>{"),end=source.indexOf('\nfunction selectBagItem(',start);
assert(start>=0&&end>start);let click;const acknowledgement={checked:false,focus(){}},sent=[],notices=[],context={
  $:()=>({querySelector:()=>acknowledgement,addEventListener:(type,callback)=>{assert.equal(type,'click');click=callback;}}),toast:message=>notices.push(message),itemLocked,lootItemValid:id=>Object.hasOwn(LOOT_ITEMS,id),player:hero({characterCreated:true}),panel:{dataset:{mode:'shop'}},connected:true,
  nearbyMerchant:()=>({id:merchant}),shopNpcId:merchant,send:message=>sent.push(JSON.parse(JSON.stringify(message))),worldZone:'greenwood',position:{x:2,z:3},rotation:1,performance:{now:()=>99},lastMove:0,
  merchantSales:false,raid:null,raidAction,raidProgressionAction,
};
const saleStart=source.indexOf('type ShopSale='),saleEnd=source.indexOf('\nfunction openShop(',saleStart);
assert(saleStart>=0&&saleEnd>saleStart);
runInNewContext(stripTypeScriptTypes(source.slice(saleStart,saleEnd)+'\n'+source.slice(start,end))+'\nglobalThis.pendingSales=shopSales;',context);
const sellButton={dataset:{sellGear:'warden-longbow'},disabled:false};sellButton.closest=()=>sellButton;
for(const queued of [false,true])for(const [lockedId,dataset] of [
  ['warden-longbow',{sellGear:'warden-longbow'}],['wood',{sellResource:'wood',sellQuantity:'1'}],
  ['item:slime-residue',{sellItem:'slime-residue',sellItemQuantity:'1'}],[`bag:${spare.id}`,{sellBag:spare.id}],
]){
  context.merchantSales=queued;context.player={...pendingSeller,characterCreated:true,lockedItems:[lockedId]};sellButton.dataset=dataset;
  click({target:sellButton});assert.equal(sent.length,0,'protected items send neither movement nor sale');
  assert.equal(context.pendingSales.length,0,'protected items never enter the sale queue');assert.match(notices.at(-1),/locked.*Unlock/);
}
context.merchantSales=false;context.player=hero({characterCreated:true});sellButton.dataset={sellGear:'warden-longbow'};
click({target:sellButton});assert.deepEqual(sent,[{type:'move',zone:'greenwood',x:2,z:3,rotation:1},{type:'sellGear',npcId:merchant,itemId:'warden-longbow'}]);assert.equal(context.lastMove,99);
sent.length=0;context.connected=false;click({target:sellButton});assert.equal(sent.length,0,'disconnected sale sends nothing');
context.connected=true;context.nearbyMerchant=()=>undefined;click({target:sellButton});assert.equal(sent.length,0,'walking away prevents movement and sale requests');
context.nearbyMerchant=()=>({id:merchant});context.panel.dataset.mode='inventory';click({target:sellButton});assert.equal(sent.length,0,'gear sales require the merchant panel');
context.panel.dataset.mode='shop';sellButton.disabled=true;click({target:sellButton});assert.equal(sent.length,0,'disabled sale cannot dispatch');
sellButton.disabled=false;sellButton.dataset.sellWarning='';
click({target:sellButton});assert.equal(sent.length,0,'unconfirmed high-rarity sales send nothing, including movement');
acknowledgement.checked=true;click({target:sellButton});assert.equal(sent.at(-1).type,'sellGear');assert.equal(acknowledgement.checked,false,'each sale consumes its acknowledgement');
sent.length=0;click({target:sellButton});assert.equal(sent.length,0,'a second sale requires fresh confirmation');
sellButton.dataset={sellResource:'wood',sellQuantity:'1000000'};click({target:sellButton});assert.equal(sent.at(-1).quantity,1_000_000,'direct resource sale sends the capped quantity');
sellButton.dataset={sellItem:'slime-residue',sellItemQuantity:'3'};click({target:sellButton});assert.equal(sent.at(-1).quantity,3,'direct loot sale sends the displayed stack quantity');
// A rolling-release server without tagged merchant replies uses the existing immediate path above.
context.merchantSales=true;sent.length=0;context.player={...pendingSeller,characterCreated:true};context.panel.open=true;context.renderShopPanel=()=>{};
const authoritative=JSON.stringify(context.player),saleTypes=()=>sent.filter(message=>message.type!=='move').map(message=>message.type);
const event=(kind,requestType,text='sale result')=>context.shopSaleEvent({type:'event',kind,requestType,text});
sellButton.dataset={sellGear:'warden-longbow'};click({target:sellButton});click({target:sellButton});
sellButton.dataset={sellResource:'wood',sellQuantity:'1000000'};click({target:sellButton});
sellButton.dataset={sellItem:'slime-residue',sellItemQuantity:'3'};click({target:sellButton});
sellButton.dataset={sellBag:spare.id};click({target:sellButton});
assert.deepEqual(saleTypes(),['sellGear'],'rapid clicks send only the first sale');
assert.equal(context.pendingSales.length,4,'duplicate clicks reserve each sale row once');
assert.equal(JSON.stringify(context.player),authoritative,'pending choices never change gold, items or bag capacity');
context.updateShopSales();event('reward','loot','Sold something unrelated');context.updateShopSales();
assert.deepEqual(saleTypes(),['sellGear'],'stale snapshots and unrelated rewards never advance the queue');
event('reward','sellGear');assert.deepEqual(saleTypes(),['sellGear'],'the tagged reward still waits for the authoritative snapshot');
context.player={...context.player,ownedGear:context.player.ownedGear.filter(id=>id!=='warden-longbow')};context.updateShopSales();
assert.deepEqual(saleTypes(),['sellGear','sellResource']);
// Concurrent rewards may replenish a stack: a tagged success plus the next snapshot still settles it.
event('reward','sellResource');context.updateShopSales();assert.deepEqual(saleTypes(),['sellGear','sellResource','sellItem']);
event('info','autoAttack','Saving your changes…');assert.equal(context.pendingSales.length,2,'unrelated errors preserve authorized sales');
event('info','sellItem','Your action could not be saved.');assert.equal(context.pendingSales.length,0,'a failed save restores every pending row and cancels unsent sales');
assert(!saleTypes().includes('sellBag'),'failure never retries or sends later choices');
sellButton.dataset={sellItem:'slime-residue',sellItemQuantity:'3'};click({target:sellButton});click({target:sellButton});
assert.equal(context.pendingSales.length,1,'a failed sale can be explicitly retried once');
context.resetShopSales();context.updateShopSales();assert.equal(context.pendingSales.length,0,'disconnect restores visibility without replay');
const beforeReconnect=sent.length;event('reward','sellItem');context.updateShopSales();assert.equal(sent.length,beforeReconnect,'a late reply after reset cannot replay a sale');
sellButton.dataset={sellResource:'wood',sellQuantity:'999999999'};click({target:sellButton});assert.equal(sent.length,beforeReconnect,'invalid or stale quantities cannot be dispatched');
sellButton.dataset={sellItem:'slime-residue',sellItemQuantity:'3'};click({target:sellButton});
sellButton.dataset={sellBag:spare.id};click({target:sellButton});context.nearbyMerchant=()=>undefined;
event('reward','sellItem');context.updateShopSales();assert.equal(context.pendingSales.length,0,'leaving the merchant cancels unsent choices');
context.nearbyMerchant=()=>({id:merchant});
sellButton.dataset={sellItem:'slime-residue',sellItemQuantity:'3'};click({target:sellButton});
sellButton.dataset={sellBag:spare.id};click({target:sellButton});
context.cancelQueuedShopSales();assert.equal(context.pendingSales.length,1,'closing/replacing the shop cancels unsent sales while retaining the in-flight result');
const beforeClose=sent.length;context.panel.open=false;event('reward','sellItem');context.updateShopSales();
assert.equal(context.pendingSales.length,0);assert.equal(sent.length,beforeClose,'closing the shop cannot send later sales off-screen');
context.panel.open=true;
const queueGear=Object.values(GEAR).filter(item=>item.price>0&&!Object.values(context.player.equipment).includes(item.id)).slice(0,17);
context.player={...context.player,ownedGear:[...context.player.ownedGear,...queueGear.map(item=>item.id)]};
for(const item of queueGear){sellButton.dataset={sellGear:item.id};click({target:sellButton});}
assert.equal(context.pendingSales.length,16,'the queue is bounded even with rapid stale-DOM clicks');
context.resetShopSales();
const risky=rollGear('warden-longbow','mythic',()=>.61);context.player.ownedGear.push(risky.id);
sellButton.dataset={sellGear:risky.id,sellWarning:''};acknowledgement.checked=false;click({target:sellButton});assert.equal(context.pendingSales.length,0,'queued high-rarity sales still require confirmation');
acknowledgement.checked=true;click({target:sellButton});assert.equal(context.pendingSales.length,1);assert.equal(acknowledgement.checked,false,'enqueueing consumes its warning acknowledgement');
assert.match(source, /function clearSocialUI\(\)\{[^\n]*resetShopSales\(\);/, 'disconnect, realm and character transitions reset the queue');
assert(source.includes('merchantSales=msg.merchantSales===true'),'tagged-sale capability is negotiated for rolling releases');
console.log('PASS shop UI: catalogs, pagination, stack Sell all, rare-item confirmation, exact payouts/quantities, guarded routing, immediate pending rows with authoritative balances, bounded distinct-sale FIFO, tagged reward then snapshot ordering, concurrent-loot stack counts, no oversell, failure/disconnect/proximity cancellation and legacy-server fallback.');
