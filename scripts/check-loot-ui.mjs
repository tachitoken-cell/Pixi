import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {mountLootUI,renderLootContents,lootEntryBlockReason,lootAllBlockReason}=await import('../src/loot-ui.ts');
const {renderBackpack,renderItemDetails,lootItemArt}=await import('../src/character-ui.ts');
const {renderShop}=await import('../src/progression-ui.ts');
const {LOOT_ITEMS,lootRows,gearLootQuality}=await import('../src/loot-items.ts');
const {bagItems}=await import('../src/bags.ts');
const {GEAR,starterGear}=await import('../src/progression.ts');
hook.deregister();

// The native DOM is represented here; the actual renderer/controller and inventory helpers run unchanged.
const decode=value=>value.replace(/&(?:amp|lt|gt|quot|#39);/g,part=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[part]);
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.events={};this.hidden=false;this.disabled=false;}
 setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=value;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;if(name==='hidden'||name==='disabled')this[name]=true;}
 append(node){node.parentElement=this;this.children.push(node);}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
 contains(node){return this===node||this.children.some(child=>child.contains(node));}
 get isConnected(){return this===document.body||!!this.parentElement?.isConnected;}
 focus(){document.activeElement=this;}
 set innerHTML(html){this.html=html;this.children=[];const stack=[this];for(const [,closing,tag,attrs]of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)){if(closing){if(stack.length>1)stack.pop();continue;}const node=new Element(tag);for(const [,name,value]of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(name,decode(value||''));stack.at(-1).append(node);if(!['img','br','input','hr'].includes(tag))stack.push(node);}}
 get innerHTML(){return this.html||'';}
 matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);const attribute=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);return attribute?Object.hasOwn(this.attributes,attribute[1])&&(attribute[2]===undefined||this.attributes[attribute[1]]===attribute[2]):this.tagName===selector.toUpperCase();}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 addEventListener(type,handler){(this.events[type]||=[]).push(handler);}
 fire(type,extra={}){const event={target:this,stopped:false,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};let node=this;while(node){for(const handler of node.events[type]||[])handler(event);if(event.stopped)break;node=node.parentElement;}return event;}
}
globalThis.HTMLElement=Element;
globalThis.document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:null};
const fresh=()=>({id:'hero',name:'Tester',level:30,hp:40,maxHp:100,gold:100,appearance:{className:'Mage'},inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},ownedBags:[],equippedBags:[null,null,null,null],...starterGear('Mage')});
const entry=(kind,itemId,quantity=1)=>({id:`${kind}:${itemId}`,kind,itemId,quantity,quality:kind==='item'?LOOT_ITEMS[itemId].quality:kind==='gear'?gearLootQuality(GEAR[itemId]):'common'});
const drop={id:'corpse-a',ownerId:'hero',name:'<Fallen & guardian>',kind:'moss-slime',zone:'greenhollow',instanceId:null,x:0,z:0,gold:27,relic:2,expiresAt:Date.now()+60000,items:[entry('item','slime-residue',3),entry('item','trail-bread',2),entry('gear','starfall-staff'),entry('resource','potion')]};
let player=fresh(),nearby=true,opened=0,serverNow=Date.now(),sendMode=true;const sent=[];
const ui=mountLootUI({send:message=>{if(sendMode==='throw')throw new Error('Disconnected');if(!sendMode)return false;sent.push(structuredClone(message));return true;},getPlayer:()=>player,canLoot:drop=>nearby&&drop.expiresAt>serverNow,onOpen:()=>opened++});
const panel=document.body.querySelector('#loot-window'),find=selector=>panel.querySelector(selector),click=selector=>{const node=find(selector);assert(node,selector);node.fire('click');};
assert(panel.hidden&&!ui.isOpen());ui.update([drop]);assert(panel.hidden,'a snapshot alone never opens the loot window');
const before=structuredClone(drop);
assert(ui.open(drop)&&ui.isOpen());assert.equal(opened,1);
assert.equal(panel.attributes['aria-modal'],'false','looting never creates a screen-blocking modal');
assert(panel.innerHTML.includes('&lt;Fallen &amp; guardian&gt;')&&!panel.innerHTML.includes('<Fallen'),'corpse names are safe text');
assert.equal(find('[data-loot-entry="gold"]').disabled,false);
assert.equal(panel.querySelectorAll('[data-loot-entry]').length,6,'gold, relics and every rolled item render once');
assert.deepEqual(drop,before,'opening a corpse does not reroll or mutate loot');
for(const [rowId,tooltipId] of [['gold','gold'],['item:trail-bread','item:trail-bread'],['gear:starfall-staff','starfall-staff'],['resource:potion','potion']]){assert.equal(find(`[data-loot-entry="${rowId}"]`).dataset.itemTooltip,tooltipId);assert(!find(`[data-loot-entry="${rowId}"]`).attributes.title,'loot uses one rich item tooltip');}
const originalRows=panel.querySelectorAll('[data-loot-entry]');
ui.update([drop]);assert.equal(panel.querySelectorAll('[data-loot-entry]')[0],originalRows[0],'unchanged snapshots preserve rows and keyboard focus');
find('[data-loot-entry="item:trail-bread"]').focus();
click('[data-loot-entry="item:trail-bread"]');
const first=sent.pop();assert.equal(typeof first.requestId,'string');assert(first.requestId.length>0);
assert.deepEqual(first,{type:'loot',targetId:drop.id,itemId:'item:trail-bread',requestId:first.requestId});
assert(!find('[data-loot-entry="item:trail-bread"]')&&ui.isSaving(),'accepted clicks immediately hide the pending item');
assert(!panel.innerHTML.includes('Saving'),'pending loot does not display routine save status');
assert(panel.querySelectorAll('[data-loot-entry]').every(row=>row.disabled)&&find('[data-loot-all]').disabled,'pending loot actions remain disabled without saving labels');
assert.equal(document.activeElement,find('[data-loot-close]'),'removed focused items leave focus on a live control');
assert.equal(ui.displayPlayer(player).carriedItems['trail-bread'],2,'pending items immediately appear in displayed inventory');
assert.deepEqual(player,fresh(),'optimistic collection never mutates authoritative inventory');
assert.deepEqual(drop,before,'optimistic collection never mutates the authoritative corpse');
assert(!lootRows(ui.visibleDrops()[0]).some(row=>row.id==='item:trail-bread'),'world loot also hides pending rows');
ui.update([structuredClone(drop)]);
assert(!find('[data-loot-entry="item:trail-bread"]')&&ui.displayPlayer(player).carriedItems['trail-bread']===2,'delayed pre-commit snapshots preserve the overlay once');
assert.equal(ui.result('unrelated-request',false),false);assert(ui.isSaving(),'unmatched results cannot reject the current request');
click('[data-loot-entry="gold"]');click('[data-loot-all]');assert.equal(sent.length,0,'repeat collection is blocked while saving');
assert.equal(ui.result(first.requestId,false),true);
assert(find('[data-loot-entry="item:trail-bread"]')&&!ui.isSaving(),'rejection restores the pending corpse row');
assert.equal(ui.displayPlayer(player),player,'rejection immediately restores authoritative inventory');
assert.deepEqual(ui.visibleDrops(),[drop],'rejection restores world loot');
click('[data-loot-entry="item:trail-bread"]');const retry=sent.pop();assert.notEqual(retry.requestId,first.requestId,'rejected requests can retry with a fresh request id');
const remaining={...drop,items:drop.items.filter(row=>row.itemId!=='trail-bread')};
player={...player,carriedItems:{'trail-bread':2}};ui.update([remaining]);
assert(!find('[data-loot-entry="item:trail-bread"]')&&find('[data-loot-entry="gold"]'),'confirmed snapshots remove only collected rows');
assert.equal(ui.displayPlayer(player).carriedItems['trail-bread'],2,'a committed snapshot before its result cannot double the pending item');
assert(ui.isSaving());assert.equal(ui.result(retry.requestId,true),true);assert(!ui.isSaving());
assert.equal(ui.displayPlayer(player),player,'success drops the display overlay');
click('[data-loot-all]');const all=sent.pop();assert.deepEqual(all,{type:'loot',targetId:drop.id,requestId:all.requestId});
assert(!ui.isOpen()&&ui.isSaving(),'loot-all immediately closes an optimistically empty corpse');
assert.deepEqual(ui.visibleDrops(),[],'an optimistically empty corpse is removed from world loot');
const projected=ui.displayPlayer(player);
assert.equal(projected.gold,127);assert.equal(projected.inventory.relic,2);assert.equal(projected.inventory.potion,1);
assert.equal(projected.carriedItems['slime-residue'],3);assert.equal(projected.carriedItems['trail-bread'],2);
assert(projected.ownedGear.includes('starfall-staff'),'loot-all overlays gold, resources, items and equipment');
player=projected;ui.update([{...remaining,gold:0,relic:0,items:[]}]);
assert.deepEqual(ui.displayPlayer(player),projected,'a committed loot-all snapshot cannot double any rewards');
ui.result(all.requestId,true);assert(!ui.isOpen()&&!ui.isSaving(),'confirmed empty corpses stay closed');

player=fresh();ui.update([drop]);ui.open(drop);click('[data-loot-all]');const rejectedAll=sent.pop();
assert(!ui.isOpen());ui.result(rejectedAll.requestId,false);
assert(ui.isOpen()&&panel.querySelectorAll('[data-loot-entry]').length===6,'failed loot-all reopens the original rows');
assert.equal(ui.displayPlayer(player),player);
click('[data-loot-entry="gold"]');const closed=sent.pop();click('[data-loot-close]');
assert(!ui.isOpen()&&ui.isSaving()&&ui.displayPlayer(player).gold===127,'closing the panel preserves pending inventory');
ui.update([drop]);assert(!ui.isOpen()&&ui.displayPlayer(player).gold===127,'delayed snapshots cannot reopen a manually closed pending panel');
ui.result(closed.requestId,false);assert(!ui.isOpen()&&ui.displayPlayer(player).gold===100,'rejection rolls back without reopening a manually closed panel');
ui.open(drop);click('[data-loot-entry="item:trail-bread"]');const reopened=sent.pop();ui.close();
assert(ui.open(ui.visibleDrops()[0]),'a pending partial corpse can reopen from its world projection');
ui.result(reopened.requestId,false);
assert(find('[data-loot-entry="item:trail-bread"]')&&ui.displayPlayer(player)===player,'rejection restores rows even when reopened from projected world loot');
ui.open(drop);click('[data-loot-entry="gold"]');const disconnected=sent.pop();ui.reset();
assert(!ui.isOpen()&&!ui.isSaving()&&ui.displayPlayer(player)===player,'disconnect/reset clears pending inventory and the panel');
assert.deepEqual(ui.visibleDrops(),[]);assert.equal(ui.result(disconnected.requestId,true),false,'results from a cleared connection are ignored');
ui.update([drop]);ui.open(drop);
for(const mode of [false,'throw']){sendMode=mode;click('[data-loot-entry="gold"]');assert(!ui.isSaving()&&find('[data-loot-entry="gold"]')&&ui.displayPlayer(player)===player,'a failed send leaves the corpse and inventory unchanged');}
sendMode=true;assert.equal(sent.length,0);
assert(!ui.open({...drop,id:'foreign-corpse',ownerId:'someone-else'})&&!ui.open({...drop,id:'expired-corpse',expiresAt:serverNow-1}),'foreign and expired corpses cannot open');
serverNow=Date.now()-2000;assert(ui.open({...drop,id:'clock-corpse',expiresAt:Date.now()-1000}),'loot expiry follows the synchronized canLoot clock instead of the local clock');serverNow=Date.now();
ui.open(drop);nearby=false;click('[data-loot-entry="gold"]');assert(!ui.isOpen()&&sent.length===0,'range is rechecked at click time');nearby=true;
ui.open(drop);player={...player,hp:0};ui.update([drop]);assert(!ui.isOpen(),'death closes the loot window');player=fresh();
ui.open(drop);ui.update([]);assert(!ui.isOpen(),'despawn or leaving the interest region closes the window');
ui.open(drop);click('[data-loot-close]');assert(!ui.isOpen());ui.update([drop]);assert(!ui.isOpen(),'snapshots cannot reopen a manually closed window');
ui.open(drop);const key=find('[data-loot-all]').fire('keydown',{key:'Escape'});assert(!ui.isOpen()&&key.defaultPrevented&&key.stopped,'Escape closes just the loot window');
ui.open(drop);assert(find('[data-loot-entry="gold"]').fire('pointerdown').stopped,'loot clicks never become movement or combat clicks');

const gearRow=entry('gear','starfall-staff');
assert.match(lootEntryBlockReason({...player,level:1},gearRow),/level/);
assert.match(lootEntryBlockReason({...player,appearance:{className:'Knight'}},gearRow),/Mage/);
assert.equal(lootEntryBlockReason({...player,ownedGear:[...player.ownedGear,gearRow.itemId]},gearRow),'Already owned');
assert.equal(lootEntryBlockReason({...player,auctions:[{item:{kind:'gear',id:gearRow.itemId}}]},gearRow),'Already owned','own auction escrow cannot duplicate gear');
const full=fresh();full.ownedGear.push(...Object.keys(GEAR).filter(id=>!full.ownedGear.includes(id)).slice(0,15));full.carriedItems={'trail-bread':2};
assert.equal(bagItems(full).length,16);
assert.equal(lootEntryBlockReason(full,entry('item','trail-bread')),undefined,'existing item stacks still fit when every slot is occupied');
assert.equal(lootEntryBlockReason(full,entry('item','berry-tart')),'Not enough bag space');
const petRow={id:'item:golden-pig',kind:'item',itemId:'golden-pig',quantity:1,quality:'epic'};
assert.equal(lootEntryBlockReason(full,petRow),'Not enough bag space','unlearned pets are tradable bag items');
assert.equal(lootEntryBlockReason({...fresh(),ownedPets:['golden-pig']},petRow),undefined,'learned pets can still drop for auction sale');
assert.equal(lootEntryBlockReason(full,{...petRow,itemId:'__proto__'}),'Unavailable');
const petHtml=renderLootContents({...drop,gold:0,relic:0,items:[petRow]},fresh());
assert(petHtml.includes('Golden Pig')&&petHtml.includes('/ui/pets/golden-pig.png')&&petHtml.includes('Learn or auction'),'pets have an identifiable tradeable loot row');
const petHolder={...fresh(),ownedPets:[],carriedItems:{'golden-pig':2}};
assert(renderItemDetails(petHolder,'item:golden-pig').includes('data-learn-pet="golden-pig"')&&renderItemDetails(petHolder,'item:golden-pig').includes('Auction House'),'inventory offers learning and explains auction sale');
assert(/data-learn-pet="golden-pig" disabled/.test(renderItemDetails({...petHolder,ownedPets:['golden-pig']},'item:golden-pig')),'learning is disabled for known pets');
assert(/data-learn-pet="golden-pig" disabled/.test(renderItemDetails({...petHolder,zeppelin:{}},'item:golden-pig')),'learning waits until the zeppelin lands');
assert.match(renderItemDetails({...petHolder,nftConfigured:true},'item:golden-pig'),/data-claim-nft-pet="golden-pig"[^>]*>.*Claim NFT · review/, 'legacy NFT species use the claim flow in inventory');
for (const petId of ['bramble-badger', 'suncrest-peacock']) {
 const details=renderItemDetails({...petHolder,nftConfigured:true,nftMintablePets:[petId],carriedItems:{[petId]:1}},`item:${petId}`);
 assert(details.includes(`data-learn-pet="${petId}"`)); assert(details.includes(`data-claim-nft-pet="${petId}"`), 'rotated pets retain optional minting and learning');
}
const newPetDetails=renderItemDetails({...petHolder,nftConfigured:true,carriedItems:{'fern-lynx':1}},'item:fern-lynx');
assert.match(newPetDetails,/data-learn-pet="fern-lynx"[^>]*>.*Learn pet/);
assert.match(newPetDetails,/data-claim-nft-pet="fern-lynx"[^>]*>Mint NFT · review/, 'new bag pets keep learning and offer optional NFT minting');
assert.match(renderItemDetails({...petHolder,nftConfigured:true,ownedPets:['fern-lynx'],carriedItems:{'fern-lynx':1}},'item:fern-lynx'), /Convert learned pet · NFT/, 'a learned pet conversion is distinguished from spending an extra bag copy');
assert(!renderShop(petHolder,'city-armorer',{tab:'sell',filter:'loot'}).includes('data-sell-item="golden-pig"'),'rare pets are excluded from vendor sales');
assert.equal(lootEntryBlockReason(full,{id:'gold',kind:'gold',itemId:'gold',quantity:5,quality:'common'}),undefined,'gold never consumes bag slots');
const oneSlot={...full,carriedItems:{}}, twoItems=[entry('item','trail-bread'),entry('item','berry-tart')];
assert(twoItems.every(row=>!lootEntryBlockReason(oneSlot,row)));
assert.equal(lootAllBlockReason(oneSlot,twoItems),'Not enough bag space','loot-all checks combined capacity rather than each row independently');
player=full;ui.open({...drop,id:'capacity-corpse',items:[entry('item','trail-bread'),entry('item','berry-tart')],relic:0});
assert(!find('[data-loot-entry="item:trail-bread"]').disabled&&find('[data-loot-entry="item:berry-tart"]').disabled&&find('[data-loot-all]').disabled,'unavailable items stay visible while eligible rows remain usable');
click('[data-loot-all]');assert.equal(sent.length,0,'disabled loot-all never sends an atomic request that cannot fit');
assert.match(renderLootContents(drop,player),/Not enough bag space/);
ui.dispose();assert(!panel.isConnected&&!ui.isOpen());

player=fresh();const legacy=mountLootUI({send:message=>sent.push(structuredClone(message)),getPlayer:()=>player,canLoot:()=>true,optimistic:()=>false});
legacy.update([drop]);legacy.open(drop);const legacyPanel=document.body.querySelector('#loot-window');
legacyPanel.querySelector('[data-loot-entry="item:trail-bread"]').fire('click');
assert.deepEqual(sent.pop(),{type:'loot',targetId:drop.id,itemId:'item:trail-bread'},'older realms receive the original request without a result id');
assert(legacyPanel.querySelector('[data-loot-entry="item:trail-bread"]')&&!legacy.isSaving(),'older realms keep rows visible without pending state');
assert.equal(legacy.displayPlayer(player),player,'older realms give no display credit before confirmation');assert.deepEqual(legacy.visibleDrops(),[drop]);
player={...player,carriedItems:{'trail-bread':2}};legacy.update([remaining]);
assert(!legacyPanel.querySelector('[data-loot-entry="item:trail-bread"]')&&legacy.displayPlayer(player).carriedItems['trail-bread']===2,'older realms display only authoritative collection');
legacyPanel.querySelector('[data-loot-all]').fire('click');assert.deepEqual(sent.pop(),{type:'loot',targetId:drop.id},'older realms keep the original loot-all request');
assert(legacy.isOpen()&&!legacy.isSaving());legacy.dispose();

let queueLimit=2,queueSendMode=true;const queuedSent=[];
const queued=mountLootUI({send:message=>{if(queueSendMode==='throw')throw Error('Disconnected');if(!queueSendMode)return false;queuedSent.push(structuredClone(message));return true;},getPlayer:()=>player,canLoot:()=>true,maxPending:()=>queueLimit});
const queuePanel=document.body.querySelector('#loot-window'),queueFind=selector=>queuePanel.querySelector(selector),queueClick=selector=>{const button=queueFind(selector);assert(button,selector);button.fire('click');};
const corpseA={...drop,id:'queue-a',name:'First corpse',relic:0,items:[entry('item','trail-bread',2)]};
const corpseB={...drop,id:'queue-b',name:'Second corpse',gold:0,relic:0,items:[entry('item','berry-tart',3)]};
const corpseC={...drop,id:'queue-c',name:'Third corpse',gold:0,relic:0,items:[entry('item','prismatic-pearl')]};
player=fresh();queued.update([corpseA,corpseB,corpseC]);queued.open(corpseA);queueClick('[data-loot-all]');const firstQueued=queuedSent.at(-1);
assert(!queued.isOpen()&&queued.isSaving(),'first corpse disappears immediately while its save is pending');
assert(queued.open(corpseB)&&!queueFind('[data-loot-all]').disabled,'another corpse is immediately collectable without the first acknowledgment');
queueClick('[data-loot-all]');const secondQueued=queuedSent.at(-1);
assert.equal(queuedSent.length,2);assert.notEqual(firstQueued.requestId,secondQueued.requestId);
assert.deepEqual(queued.visibleDrops().map(value=>value.id),[corpseC.id],'all queued corpses disappear from world loot immediately');
assert(!queued.open(corpseA)&&!queued.open(corpseB),'already queued rows cannot be submitted twice');
queued.open(corpseC);assert(queueFind('[data-loot-all]').disabled,'only the advertised queue limit disables further collection');
queueClick('[data-loot-all]');assert.equal(queuedSent.length,2);
queued.update(structuredClone([corpseA,corpseB,corpseC]));
assert.equal(queued.displayPlayer(player).gold,127);assert.equal(queued.displayPlayer(player).carriedItems['trail-bread'],2);assert.equal(queued.displayPlayer(player).carriedItems['berry-tart'],3);
assert.deepEqual(player,fresh(),'multiple pending pickups never alter authoritative inventory');
assert(queued.result(firstQueued.requestId,false));assert(queued.isSaving()&&queuePanel.innerHTML.includes('Third corpse'),'an earlier failure does not replace the currently open corpse');
assert.equal(queued.displayPlayer(player).carriedItems['trail-bread'],undefined);assert.equal(queued.displayPlayer(player).carriedItems['berry-tart'],3,'failure rolls back only its own request');
assert(!queueFind('[data-loot-all]').disabled);assert.equal(queuedSent.length,2,'failures never replay a request automatically');
for(const mode of [false,'throw']){queueSendMode=mode;queueClick('[data-loot-all]');assert(queued.isSaving()&&queueFind('[data-loot-all]')&&!queueFind('[data-loot-all]').disabled);assert.equal(queued.displayPlayer(player).carriedItems['prismatic-pearl'],undefined,'send failure removes only the newly attempted overlay');}
queueSendMode=true;queueClick('[data-loot-all]');const thirdQueued=queuedSent.at(-1);queued.close();
queued.result(secondQueued.requestId,false);assert(!queued.isOpen()&&queued.isSaving(),'closing suppresses reopening from every pending request');
assert.equal(queued.displayPlayer(player).carriedItems['prismatic-pearl'],1);queued.result(thirdQueued.requestId,false);
assert(!queued.isSaving()&&queued.displayPlayer(player)===player);assert(!queued.result(firstQueued.requestId,true),'late duplicate results cannot revive failed requests');

queued.reset();player=fresh();queued.update([corpseA,corpseB]);queued.open(corpseA);queueClick('[data-loot-all]');const committedA=queuedSent.at(-1);
queued.open(corpseB);queueClick('[data-loot-all]');const committedB=queuedSent.at(-1);
player={...player,gold:127,carriedItems:{'trail-bread':2}};queued.update([corpseB]);
assert.equal(queued.displayPlayer(player).gold,127);assert.equal(queued.displayPlayer(player).carriedItems['trail-bread'],2);assert.equal(queued.displayPlayer(player).carriedItems['berry-tart'],3,'committed snapshots retain only the remaining pending overlay');
queued.result(committedA.requestId,true);assert(queued.isSaving());
player={...player,carriedItems:{'trail-bread':2,'berry-tart':3}};queued.update([]);assert.equal(queued.displayPlayer(player),player);
queued.result(committedB.requestId,true);assert(!queued.isSaving(),'each acknowledgment frees its own queue slot');

queued.reset();player=fresh();queued.update([corpseA]);queued.open(corpseA);queueClick('[data-loot-entry="gold"]');const partialGold=queuedSent.at(-1);
assert(!queueFind('[data-loot-entry="item:trail-bread"]').disabled,'remaining rows on the same corpse stay collectable');
queueClick('[data-loot-all]');const partialItem=queuedSent.at(-1);assert.notEqual(partialGold.requestId,partialItem.requestId);
assert.deepEqual(partialItem.itemIds,['item:trail-bread'],'queued Loot all selects only visible rows, so an earlier failed gold pickup is not silently retried');
assert.equal(queued.displayPlayer(player).gold,127);assert.equal(queued.displayPlayer(player).carriedItems['trail-bread'],2,'overlapping corpse requests overlay distinct visible rows only');
player={...player,gold:127};queued.update([{...corpseA,gold:0}]);assert.equal(queued.displayPlayer(player).gold,127);assert.equal(queued.displayPlayer(player).carriedItems['trail-bread'],2);
queued.result(partialGold.requestId,true);player={...player,carriedItems:{'trail-bread':2}};queued.update([]);queued.result(partialItem.requestId,true);assert.equal(queued.displayPlayer(player),player);

queued.reset();queueLimit=16;player={...oneSlot,carriedItems:{}};queued.update([corpseA,corpseB]);queued.open(corpseA);queueClick('[data-loot-all]');
queued.open(corpseB);assert(queueFind('[data-loot-all]').disabled&&queueFind('[data-loot-entry="item:berry-tart"]').disabled,'pending pickups reserve bag capacity across corpses');
const stacked={...corpseB,id:'stacked-corpse',items:[entry('item','trail-bread',4)]};queued.open(stacked);
assert(!queueFind('[data-loot-all]').disabled,'another pending stack of the same item consumes no extra slot');queueClick('[data-loot-all]');assert.equal(queued.displayPlayer(player).carriedItems['trail-bread'],6);
const clearing=queuedSent.slice(-2);queued.reset();assert(!queued.isSaving()&&queued.displayPlayer(player)===player&&queued.visibleDrops().length===0);
for(const request of clearing)assert(!queued.result(request.requestId,true),'disconnect ignores every old pending result');
player=fresh();const gearCorpse={...corpseB,id:'gear-a',items:[gearRow]},otherGear={...gearCorpse,id:'gear-b'};
queued.update([gearCorpse,otherGear]);queued.open(gearCorpse);queueClick('[data-loot-all]');queued.open(otherGear);
assert(queueFind('[data-loot-all]').disabled&&queuePanel.innerHTML.includes('Already owned'),'pending equipment blocks a duplicate pickup from another corpse');

for(const invalidLimit of [0,-1,1.5,NaN,Infinity]){
 queued.reset();player=fresh();queueLimit=invalidLimit;queued.update([corpseA,corpseB]);queued.open(corpseA);queueClick('[data-loot-all]');queued.open(corpseB);
 assert(queueFind('[data-loot-all]').disabled,'invalid advertised limits fall back to one pending request');
}
queued.reset();player=fresh();queueLimit=999;
const cappedDrops=Array.from({length:17},(_,index)=>({...corpseB,id:`capped-${index}`,gold:1,items:[]})),beforeCap=queuedSent.length;
queued.update(cappedDrops);for(const corpse of cappedDrops){queued.open(corpse);queueClick('[data-loot-all]');}
assert.equal(queuedSent.length-beforeCap,16,'a server cannot advertise an unbounded client queue');assert(queueFind('[data-loot-all]').disabled);
queued.dispose();assert(!queued.isSaving()&&!queuePanel.isConnected);

const carried=fresh();carried.carriedItems={'slime-residue':12000,'trail-bread':3,'prismatic-pearl':2,'greater-tonic':1};
const bag=renderBackpack(carried,'item:trail-bread',true);
const carriedIcons={'slime-residue':'/ui/benji-2026-09-28/icons/item-slime-gel.png','trail-bread':'/ui/benji-2026-09-28/icons/item-bread.png','prismatic-pearl':'/ui/loot/prismatic-pearl.png','greater-tonic':'/ui/benji-2026-09-28/icons/item-greater-tonic.png'};
for(const [id,count]of Object.entries(carried.carriedItems)){
 assert(bag.includes(`data-inspect-item="item:${id}"`)&&bag.includes(carriedIcons[id]),'every carried item uses its actual icon and stable selection ID');
 assert(bag.includes(`${LOOT_ITEMS[id].label}, ${count.toLocaleString('en-US')}`),'stack quantities stay accessible');
}
assert(bag.includes('>12K</span>'),'large junk stacks stay compact');
assert(renderItemDetails(carried,'item:trail-bread').includes('data-use-item="trail-bread"')&&renderItemDetails(carried,'item:trail-bread').includes('Out of combat · Shared 10s cooldown'));
assert(renderItemDetails(carried,'item:greater-tonic').includes('Usable in combat · Shared 10s cooldown'));
assert(/data-use-item="trail-bread" disabled/.test(renderItemDetails({...carried,hp:100},'item:trail-bread')),'food cannot be consumed at full health');
assert(/data-use-item="greater-tonic" disabled/.test(renderItemDetails({...carried,hp:0},'item:greater-tonic')),'dead players cannot consume loot');
assert(!renderItemDetails(carried,'item:slime-residue').includes('data-use-item=')&&renderItemDetails(carried,'item:slime-residue').includes('24,000 gold total'),'vendor junk has a price and no fake consume action');
assert(!renderItemDetails(carried,'item:hearty-stew').includes('data-use-item='),'unowned consumables cannot create use actions');
assert(!lootItemArt('__proto__')&&!lootItemArt('bad/<id>'),'unknown icons are not treated as paths');
for(const merchant of ['village-pinewake-merchant','city-armorer','city-weaponsmith']){
 const options={tab:'sell',filter:'loot',selected:'item:slime-residue'};
 const single=renderShop(carried,merchant,{...options,quantity:'1'}),all=renderShop(carried,merchant,{...options,quantity:'all'});
 assert(single.includes('data-sell-item="slime-residue" data-sell-item-quantity="1"')&&all.includes('data-sell-item="slime-residue" data-sell-item-quantity="all"'),'nearby merchants offer exact reviewed single/whole-stack sales');
 assert(single.includes('You receive: 2 gold')&&all.includes('You receive: 24,000 gold'),'proceeds follow the selected quantity');
 assert(!all.includes('data-shop-select="item:hearty-stew"'),'unowned items are absent from the selling list');
}
for(const npc of [undefined,'unknown','village-pinewake-healer'])assert(!renderShop(carried,npc,{tab:'sell',filter:'loot'}).includes('data-sell-item='),'item sales are absent without a real merchant');
const css=readFileSync(new URL('../src/loot-ui.css',import.meta.url),'utf8');
assert(css.includes('border-image:var(--wood-art)')&&!css.includes('backdrop-filter')&&!css.includes('100vw'),'loot uses one compact art frame with no full-screen backdrop');
assert(css.includes('minmax(0,1fr)')&&css.includes('overflow-wrap:anywhere'),'long labels and quantities can wrap inside their rows');
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),eventMarker="  } else if(msg.type==='event'){",eventStart=main.indexOf(eventMarker),eventEnd=main.indexOf('\n  }\n });',eventStart);
assert(eventStart>=0&&eventEnd>eventStart);assert(!main.includes('Saving loot'),'the bag has no routine loot-saving banner');
const notices=[],messages=[],rejections=[],reject=name=>()=>rejections.push(name);
const resultMarker="  } else if(msg.type==='lootResult'){",resultStart=main.indexOf(resultMarker),resultEnd=main.indexOf("  } else if(msg.type==='snapshot'){",resultStart),results=[];
assert(resultStart>=0&&resultEnd>resultStart);
const resultEvents={lootUI:{result:(...args)=>{results.push(args);return true;}},toast:text=>notices.push(text)};
runInNewContext(stripTypeScriptTypes(`function onResult(msg){${main.slice(resultStart+resultMarker.length,resultEnd)}\n}`),resultEvents);
for(const success of [false,true])resultEvents.onResult({requestId:'pickup',success});
assert.deepEqual(results,[['pickup',false],['pickup',true]],'loot acknowledgments still reach correlated rollback and confirmation');
assert.equal(notices.length,0,'a rejected loot result never adds a generic save-error popup');
const events={shopSaleEvent(){},trainingPending:null,panel:{open:false},rosterActive:false,storeUI:{reject:reject('store')},treasureUI:{isLinking:()=>false,reject:reject('treasure')},goldMerchantUI:{isLinking:()=>false,reject:reject('goldMerchant')},nftUI:{reject:reject('nft')},auctionUI:{reject:reject('auction')},bankUI:{reject:reject('bank')},pollUI:{reject:reject('poll')},hotbar:{reject:reject('hotbar')},rejectAutoAttack:reject('autoAttack'),toast:text=>notices.push(text),chatMessage:text=>messages.push(text),gameAudio:{play(){}}};
runInNewContext(stripTypeScriptTypes(`function onEvent(msg){${main.slice(eventStart+eventMarker.length,eventEnd)}\n}`),events);
for(const logOnly of [false,true])events.onEvent({kind:'info',requestType:'autoAttack',text:'Saving your changes…',logOnly});
assert.equal(notices.length,0);assert.equal(messages.length,0,'routine saving notices do not enter system chat');
assert.equal(rejections.filter(name=>name==='autoAttack').length,2,'quiet saving messages still run attack recovery');
events.onEvent({kind:'info',requestType:'storeBuy',text:'Saving your changes…'});assert(rejections.includes('store'),'request-specific rejection handlers still run');
const failure='Your action could not be saved. No items or gold were changed. Please try again.';
events.onEvent({kind:'info',text:failure,logOnly:true});assert.equal(notices.length,0);assert.deepEqual(messages,[failure],'loot save failures stay in System history without a popup');
events.onEvent({kind:'info',requestType:'learnSpell',text:failure});assert.deepEqual(notices,[failure]);assert.deepEqual(messages,[failure,failure],'non-loot save failures remain visible');
const bagsFull='Your bags are full. Collect individual items or make room before taking everything.';
events.onEvent({kind:'info',requestType:'loot',text:bagsFull});assert.equal(notices.at(-1),bagsFull,'full-bag warnings remain visible');assert.equal(messages.at(-1),bagsFull);
events.onEvent({kind:'chat',text:'Saving your changes is my next quest.'});assert.equal(messages.at(-1),'Saving your changes is my next quest.','player chat is never filtered as a save notice');
console.log('PASS: immediate queued corpse/row loot, rolling limits, combined pending capacity, delayed/committed snapshots, per-request success/rollback, repeat/disconnect/send/close guards, range/ownership/death/despawn/focus guards, item icons/details, consumables and merchant sales.');

const mountRow={id:'item:verdant-revenant',kind:'item',itemId:'verdant-revenant',quantity:1,quality:'epic'};
assert.equal(lootEntryBlockReason(full,mountRow),'Not enough bag space');
assert.equal(lootEntryBlockReason({...fresh(),ownedMounts:['verdant-revenant']},mountRow),undefined,'known mounts can still collect extra tradeable copies');
const mountHtml=renderLootContents({...drop,gold:0,relic:0,items:[mountRow]},fresh());
assert(mountHtml.includes('/ui/mount-verdant-revenant.png')&&mountHtml.includes('Learn, mint or auction'));
const mountHolder={...fresh(),ownedMounts:[],nftMountsConfigured:true,nftMintableMounts:['verdant-revenant'],carriedItems:{'verdant-revenant':2}};
const mountDetails=renderItemDetails(mountHolder,'item:verdant-revenant');
assert.match(mountDetails,/data-learn-mount="verdant-revenant"[^>]*>.*Learn mount · consumes 1/);
assert.match(mountDetails,/data-claim-nft-mount="verdant-revenant"[^>]*>Mint NFT · review/);
assert.match(renderItemDetails({...mountHolder,ownedMounts:['verdant-revenant']},'item:verdant-revenant'),/Convert learned mount · NFT/);
assert.match(renderItemDetails({...mountHolder,nftMountsConfigured:false},'item:verdant-revenant'),/data-claim-nft-mount="verdant-revenant" disabled/);
assert(!renderShop(mountHolder,'city-armorer',{tab:'sell',filter:'loot'}).includes('data-sell-item="verdant-revenant"'),'mount drops are protected from vendor junk sales');

for(const id of ['store-embermane','store-cinderfang']){
 const details=renderItemDetails({...mountHolder,carriedItems:{[id]:1},ownedMounts:[]},`item:${id}`);
 assert(!details.includes('data-learn-mount'),'store copies cannot be learned from a bag');
 assert(!details.includes('data-claim-nft-mount'),'store bag copies cannot be minted');
}
