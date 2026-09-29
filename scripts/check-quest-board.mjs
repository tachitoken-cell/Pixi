import assert from 'node:assert/strict';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {renderAdventureJournal,renderContracts}=await import('../src/adventure-ui.ts');
const {TREASURE_MAP_SITES}=await import('../src/treasure-maps.ts');
const {CONTRACTS,newContracts,MAX_ACTIVE_CONTRACTS}=await import('../src/adventure.ts');
const {ZONES}=await import('../src/content.ts');
hook.deregister();
const hero=()=>({id:'preview',characterCreated:true,hp:100,level:60,gold:0,contracts:newContracts()});
const now=1_000_000;
const notices=html=>[...html.matchAll(/\bdata-contract-id="([^"]+)"/g)].map(match=>match[1]);
const button=(html,key,id)=>[...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes(`data-${key}="${id}"`));
const disabled=tag=>!!tag&&/\sdisabled(?:\s|=|>)/.test(tag);
const action=(html,key,id)=>{const tag=button(html,key,id);assert(tag,`missing ${key} ${id}`);return tag;};
const count=(p,zone)=>CONTRACTS.filter(c=>c.zone===zone||Object.hasOwn(p.contracts.active,c.id)).length;
const pages=(p,zone,near=true,time=now)=>Array.from({length:Math.max(1,Math.ceil(count(p,zone)/3))},(_,page)=>renderContracts(p,zone,near,time,page));
const all=(...args)=>pages(...args).join('');
const pageIndex=html=>Number(html.match(/data-contract-page-current="(\d+)"/)?.[1]);
const pageCount=html=>Number(html.match(/data-contract-page-count="(\d+)"/)?.[1]);
const seen=new Set();
const journalPlayer={...hero(),treasureMap:{id:'map-1',siteId:TREASURE_MAP_SITES[0].id,stage:'search',level:10},meadGodPaid:true};
const journalSnapshot=JSON.stringify(journalPlayer);
const journal=renderAdventureJournal(journalPlayer);
assert.match(journal,/data-adventure-quest="treasure" aria-pressed="true"/);
assert.match(journal,/Step 1 \/ 3 · In progress/);assert.match(journal,/Complete · Title unlocked/);
assert(journal.includes('data-track-treasure-map'),'selected treasure retains the real tracking control');
const titleQuest=renderAdventureJournal(journalPlayer,false,'','hearthling');
assert.match(titleQuest,/data-adventure-quest="hearthling" aria-pressed="true"/);
assert(titleQuest.includes('data-open-hearthling')&&!titleQuest.includes('data-track-treasure-map'),'only the selected adventure renders detail actions');
assert(!renderAdventureJournal(hero()).includes('data-adventure-quest="treasure"'),'no invented treasure quest when none exists');
assert(renderAdventureJournal({...hero(),carriedItems:{'treasure-map':1}}).includes('data-start-treasure-map'),'unopened maps retain the start action');
assert.equal(JSON.stringify(journalPlayer),journalSnapshot,'selection rendering never changes saved quest state');
for(const zone of ZONES){
 const player=hero(),expected=CONTRACTS.filter(c=>c.zone===zone.id),snapshot=JSON.stringify(player),views=pages(player,zone.id);
 assert.equal(views.length,Math.ceil(expected.length/3));
 assert.deepEqual(views.flatMap(notices),expected.map(c=>c.id),'all regional notices remain reachable in their existing order');
 views.forEach((html,index)=>{
  assert(notices(html).length<=3&&notices(html).length>0,'each parchment page displays at most three real notices');
  assert.equal(pageIndex(html),index);assert.equal(pageCount(html),views.length);
  assert(!/<(?:input|textarea)/.test(html),'static quest descriptions are not editable fields');
  for(const id of notices(html)){seen.add(id);const contract=CONTRACTS.find(c=>c.id===id);assert(html.includes(contract.label));assert(html.includes(contract.description));assert(!disabled(action(html,'accept-contract',id)));}
 });
 for(const contract of expected){assert(disabled(action(all(player,zone.id,false),'accept-contract',contract.id)),'remote boards cannot accept quests');}
 assert(all(player,zone.id,false).includes(`data-find-board="${zone.id}"`));
 assert.equal(JSON.stringify(player),snapshot,'rendering pages never mutates authoritative quest progress');
 for(const requested of [-5,NaN,-Infinity])assert.equal(pageIndex(renderContracts(player,zone.id,true,now,requested)),0,'invalid/negative page starts at the first sheet');
 assert.equal(pageIndex(renderContracts(player,zone.id,true,now,9999)),views.length-1,'oversized page clamps to the final sheet');
}
assert.equal(CONTRACTS.filter(c=>!c.requiredLevel).length,13,'the original thirteen contracts remain');assert.equal(seen.size,CONTRACTS.length,'every original and frontier quest has page and action coverage');
const first=CONTRACTS[0],player=hero();
player.contracts.active[first.id]=0;
let html=all(player,first.zone);assert(!button(html,'accept-contract',first.id)&&!button(html,'claim-contract',first.id),'zero-progress active quests are already accepted');
assert(!disabled(action(html,'cancel-contract',first.id)),'zero-progress contracts can be cancelled');
assert(!disabled(action(all(player,first.zone,false),'cancel-contract',first.id)),'cancellation does not require a nearby board');
player.contracts.active[first.id]=first.count;html=all(player,first.zone);
assert(!disabled(action(html,'claim-contract',first.id)));
assert(!disabled(action(html,'cancel-contract',first.id)),'ready unclaimed contracts can also be cancelled');
assert(disabled(action(all(player,first.zone,false),'claim-contract',first.id)),'ready rewards cannot be claimed remotely');
const foreignZone=ZONES.find(zone=>zone.id!==first.zone).id;
html=all(player,foreignZone);assert(disabled(action(html,'claim-contract',first.id)));assert(html.includes(`data-find-board="${first.zone}"`),'foreign active notice keeps guidance to its own region');
assert(!disabled(action(html,'cancel-contract',first.id)),'foreign accepted contracts can be cancelled');
player.contracts.active=Object.fromEntries(CONTRACTS.filter(c=>c.zone==='greenwood').slice(0,MAX_ACTIVE_CONTRACTS).map(c=>[c.id,c.count]));
html=all(player,'greenwood');assert(disabled(action(html,'accept-contract','greenwood-tonics')),'page two cannot bypass a full journal');assert(!disabled(action(html,'claim-contract',first.id)),'a full journal still permits claiming earned rewards');
player.contracts=newContracts();player.contracts.completed[first.id]=now+60_001;
assert(!button(all(player,first.zone),'cancel-contract',first.id),'unaccepted and previously claimed contracts cannot be cancelled');
assert(disabled(action(all(player,first.zone),'accept-contract',first.id)));
assert(!disabled(action(all(player,first.zone,true,now+60_001),'accept-contract',first.id)),'repeatables return at the exact cooldown boundary');
player.contracts=newContracts();for(const contract of CONTRACTS.filter(c=>c.zone!=='greenwood').slice(-3))player.contracts.active[contract.id]=contract.count;
const foreign=pages(player,'greenwood'),total=CONTRACTS.filter(c=>c.zone==='greenwood').length+3;assert.equal(foreign.length,Math.ceil(total/3));assert.equal(foreign.flatMap(notices).length,total,'local offers and three foreign active quests share the paginated board');
assert.equal(new Set(foreign.flatMap(notices)).size,total,'pagination never duplicates foreign notices');
for(const id of Object.keys(player.contracts.active))assert(disabled(action(foreign.join(''),'claim-contract',id)));
while(Math.ceil(count(player,'greenwood')/3)===foreign.length)delete player.contracts.active[Object.keys(player.contracts.active).at(-1)];
html=renderContracts(player,'greenwood',true,now,foreign.length-1);assert.equal(pageIndex(html),foreign.length-2);assert.equal(pageCount(html),foreign.length-1,'removing foreign quests clamps a now-vanished last page');assert(notices(html).length>0);

// Execute the production delegated handler: paging is local; rewards remain server requests.
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),handlerStart=main.indexOf("$('panel-content').addEventListener('click',event=>{"),handlerEnd=main.indexOf('function selectBagItem(',handlerStart);
assert(handlerStart>=0&&handlerEnd>handlerStart);
let click;const sent=[],found=[],focused=[],ctx={player:hero(),connected:true,panel:{dataset:{mode:'contracts'}},contractPage:0,contractZone:'greenwood',selectedAdventure:'treasure',renders:0,
 raid:null,raidAction:()=>null,raidProgressionAction:()=>null,
 document:{getElementById:id=>{assert.equal(id,'adventure-detail');return {focus:options=>focused.push({...options})};}},
 position:{x:3,z:2},rotation:.5,worldZone:'greenwood',worldInstance:null,performance:{now:()=>1000},
 $:()=>({addEventListener:(name,callback)=>{if(name==='click')click=callback;},querySelector:selector=>{assert.equal(selector,'.quest-notice h3');return {focus:options=>focused.push({...options})};}}),send:message=>sent.push(message),renderContractPanel:()=>ctx.renders++,findStation:(...args)=>found.push(args)};
runInNewContext(stripTypeScriptTypes(main.slice(handlerStart,handlerEnd)),ctx);
const press=(dataset,disabled=false)=>click({target:{closest:()=>({dataset,disabled})}});
press({adventureQuest:'hearthling'});assert.equal(ctx.selectedAdventure,'hearthling');assert.equal(ctx.renders,1);assert.equal(sent.length,0,'adventure selection changes only the view');
press({adventureQuest:'invented'});assert.equal(ctx.selectedAdventure,'hearthling');assert.equal(ctx.renders,1,'unknown adventures cannot change selection');
ctx.renders=0;focused.length=0;
press({contractPage:'1'});assert.equal(ctx.contractPage,1);assert.equal(ctx.renders,1);assert.equal(sent.length,0,'changing notices never sends gameplay or movement');
assert.deepEqual(focused,[{preventScroll:true}],'a valid page change focuses the first notice heading once without scrolling');
for(const value of ['-1','NaN','Infinity','1.5'])press({contractPage:value});assert.equal(ctx.contractPage,1);assert.equal(ctx.renders,1,'invalid page input is ignored');
press({contractPage:'0'},true);assert.equal(ctx.contractPage,1,'disabled pagination cannot change sheets');
assert.equal(focused.length,1,'invalid and disabled page inputs never move focus');
for(const type of ['acceptContract','claimContract']){sent.length=0;press({[type]:first.id});assert.deepEqual(sent.map(message=>message.type),['move',type]);assert.deepEqual({...sent[1]},{type,contractId:first.id},'quest actions send identity only, never chosen rewards');}
sent.length=0;press({cancelContract:first.id});assert.deepEqual(sent.map(message=>({...message})),[{type:'cancelContract',contractId:first.id}],'cancellation sends only the contract identity and needs no movement');
sent.length=0;ctx.connected=false;press({cancelContract:first.id});assert.equal(sent.length,0,'disconnected cancellation is ignored');ctx.connected=true;
press({cancelContract:first.id},true);assert.equal(sent.length,0,'disabled actions are ignored');
sent.length=0;press({findBoard:'hollow'});assert.equal(sent.length,0);assert.deepEqual(found.at(-1),['board','hollow']);
const preview=readFileSync(new URL('../artifacts/quest-board-preview.html',import.meta.url),'utf8');assert(preview.includes('PREVIEW ONLY'));assert(preview.includes('renderContracts(player,zone,nearBoard,now,page)'));assert(!/\b(?:WebSocket|localStorage|sessionStorage)\b/.test(preview),'isolated visual fixtures never open a realm connection or persist a player');
console.log('PASS quest board: three-notice pagination, all original and frontier quests, foreign/full-journal cases, exact cooldown/location gates, safe page clamping, actual delegated actions and isolated preview.');
