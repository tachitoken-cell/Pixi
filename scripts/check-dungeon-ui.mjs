import { isRaidInstance } from '../src/raid.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { POLL_BOOTHS } from '../src/poll-booths.ts';
import { CITY_SERVICE_NPCS } from '../src/city-services.ts';
import assert from 'node:assert/strict';
import {isArenaInstance,ARENA_ENTRANCE,ARENA_ENTRY_RADIUS} from '../src/arena.ts';
import { HEARTHLING_NPC } from '../src/hearthling.ts';
import { GOLD_MERCHANT } from '../src/gold-merchant.ts';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import { DUNGEONS, LEGACY_DUNGEONS, getDungeon, dungeonStages, dungeonReturn, dungeonPreparation, inDungeonPreparation, DUNGEON_EXIT, DUNGEON_RETURN, ROOTVAULT_GUARDIAN } from '../src/dungeon.ts';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {dungeonTime,dungeonElapsed,renderDungeonResult,renderDungeonLeaderboard}=await import('../src/dungeon-results-ui.ts');
const {lootAllBlockReason,lootEntryBlockReason}=await import('../src/loot-ui.ts');
const {starterGear}=await import('../src/progression.ts');
hook.deregister();
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const segment=(a,b)=>stripTypeScriptTypes(source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a))));
let html='',heading;const sent=[],waypoints=[];
const ui={isInstantCombatInstance,usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),lastDungeonPanel:'',dungeonBoard:null,renderDungeonResult,revealDungeonRewards(){},renderDungeonLeaderboard,loadDungeonLeaderboard:()=>ui.renderDungeonPanel(),isArenaInstance,ARENA_ENTRANCE,ARENA_ENTRY_RADIUS,DUNGEONS,getDungeon,dungeonStages,dungeonReturn,dungeonPreparation,inDungeonPreparation,DUNGEON_EXIT,DUNGEON_RETURN,ROOTVAULT_GUARDIAN,dungeon:null,dungeonChoice:'rootvault',worldInstance:null,
 player:{id:'leader',level:9,hp:100,rootvaultUnlocked:false},party:null,position:{...DUNGEONS[0].entrance},allowFeature:()=>true,icon:()=>'',
 openPanel:(...args)=>heading=args,replacePanelContent:value=>html=value,closePanel(){},setWaypoint:p=>waypoints.push(p),send:p=>sent.push(p),
 worldZone:'hollow',rotation:0,lastMove:0,performance:{now:()=>0}};
runInNewContext(segment('function openDungeon(','function lootSummary('),ui);
ui.openDungeon();assert.match(html,/Requires level 10/);assert.match(html,/data-dungeon-enter disabled/);
assert.equal((html.match(/data-choose-dungeon=/g)||[]).length,LEGACY_DUNGEONS.length);
for(const entry of DUNGEONS){
 ui.player.level=60;ui.player.storyQuests={active:{},completed:[]};
 if(entry.storyQuestId){ui.openDungeon(entry.id);assert.match(html,/Story quest required/);assert.match(html,/data-dungeon-enter disabled/);assert(!html.includes(`data-choose-dungeon="${entry.id}"`),'locked chamber is absent from chooser');ui.player.storyQuests.active[entry.storyQuestId]=[0];}
 ui.openDungeon(entry.id);assert.equal(heading[0],entry.name);assert(heading[1].includes(`${entry.minLevel}–${entry.maxLevel}`));
 if(entry.storyQuestId){assert(heading[1].includes('STORY CHAMBER'));assert(html.includes('One-time quest rewards'));assert(!html.includes('+0 XP'));assert(!html.includes('awaken both rune seals'));assert(html.includes(`data-choose-dungeon="${entry.id}"`));ui.player.storyQuests={active:{},completed:[entry.storyQuestId]};ui.renderDungeonPanel();assert(html.includes('Story completed'),'completed quest cannot start another run');assert.match(html,/data-dungeon-enter disabled/);assert(!html.includes(`data-choose-dungeon="${entry.id}"`),'completed chamber is removed from chooser');}
 else {assert(html.includes(`+${entry.completionXp} XP`));assert.equal(html.includes('Find the Gatekeeper'),entry.id==='rootvault');const stages=dungeonStages(entry.id),optional=stages.filter(stage=>stage.optional).length;assert(html.includes(`Follow ${stages.length-optional} main encounters`));if(optional)assert(html.includes(`${optional} side encounters`));}
}
ui.dungeonChoice='cindercrypt';ui.position={...DUNGEONS[1].summonStone};ui.party={leaderId:'leader',members:[ui.player,{id:'ally',name:'<img src=x>',level:15,hp:100,instanceId:null},{id:'low',name:'Novice',level:14,hp:100,instanceId:null},{id:'delver',name:'Delver',level:20,hp:100,instanceId:'another-run'}]};
ui.renderDungeonPanel();assert(html.includes('&lt;img src=x&gt;'));assert.match(html,/data-dungeon-summon="ally" >Summon/);assert.match(html,/data-dungeon-summon="low" disabled/);assert.match(html,/data-dungeon-summon="delver" disabled/);
ui.position={x:0,z:0};ui.renderDungeonPanel();assert.match(html,/data-dungeon-summon="ally" disabled/);
ui.dungeon={completed:true,kind:'frosthollow',encounterName:'Final chamber',objectives:['Use the portal'],checkpoint:{active:true},wipes:0};ui.worldInstance='run';ui.position={...dungeonReturn('frosthollow')};ui.openDungeon();assert.equal(heading[0],'Frosthollow');assert.equal(ui.dungeonExitPoint(),dungeonReturn('frosthollow'));assert(html.includes('Return to the entrance'));
for(const entry of DUNGEONS.slice(4)){ui.dungeon.kind=entry.id;ui.position={x:0,z:22};ui.renderDungeonPanel();assert(html.includes('Arrival sanctuary · Safe to prepare')); ui.position={...dungeonReturn(entry.id)};assert.equal(ui.dungeonExitPoint(),dungeonReturn(entry.id),'expanded dungeon uses its own final return');}
ui.dungeon.completed=false;assert.equal(ui.dungeonExitPoint(),DUNGEON_EXIT,'final return is unavailable until completion');
const dispatch=source.slice(source.indexOf(" if(data.chooseDungeon)"),source.indexOf(' if(data.learnTalent)'));
runInNewContext(stripTypeScriptTypes(`function dispatch(data,button={}){${dispatch}}`),ui);
ui.dungeon.completed=true;ui.dispatch({dungeonExit:''});assert.equal(sent.at(-1).type,'dungeonExit');
ui.worldInstance=null;ui.dungeon=null;ui.dungeonChoice='cindercrypt';ui.position={...DUNGEONS[1].entrance};ui.dispatch({dungeonEnter:''});assert.equal(sent.at(-1).dungeonId,'cindercrypt');
ui.dispatch({dungeonSummon:'ally'});assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'dungeonSummon',dungeonId:'cindercrypt',targetId:'ally'});
const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},textContent:'',hidden:false,disabled:false,parentElement:null,matches(selector){return selector===':popover-open'&&!!this.shown;},showPopover(){this.shown=true;},hidePopover(){this.shown=false;},append(child){child.parentElement=this;}});return nodes.get(id);};
const invitation={...ui,$:el,connected:true,entryActive:false,rosterActive:false,player:{id:'ally',hp:100,characterCreated:true},party:{},partyInvites:[],pendingPartyInvite:null,dungeonSummon:{id:'offer-1',fromName:'Friend <safe>',dungeonName:'Cindercrypt',expiresAt:Date.now()+30000},serverOffset:0,panel:el('panel'),onboardingLockReason:()=>'',allowFeature:()=>true,updateWho(){}};
runInNewContext(segment('function updatePartyInvitation(',"$('party-invitation-accept').onclick"),invitation);
invitation.updatePartyInvitation();assert.equal(el('party-invitation').dataset.summonId,'offer-1');assert.equal(el('party-invitation-accept').textContent,'Travel there');assert(el('party-invitation-message').textContent.includes('Friend <safe>'),'untrusted name is text, never HTML');
const beforeWho=sent.length;invitation.respondToPartyInvite('partyAccept','unrelated-party-id');assert.equal(sent.length,beforeWho,'Who party responses cannot accept a pending dungeon summon');
invitation.partyInvites=[{id:'party-offer',expiresAt:Date.now()+30000}];invitation.respondToPartyInvite('partyDecline','party-offer');assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'partyDecline',invitationId:'party-offer'});assert.equal(invitation.dungeonSummon.id,'offer-1','Who declines only the selected party invitation');
invitation.respondToPartyInvite('partyAccept','unrelated-party-id',true);assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'dungeonSummonRespond',summonId:'offer-1',accept:true});assert.equal(invitation.dungeonSummon,null);
const count=sent.length;invitation.respondToPartyInvite('partyAccept','stale',true);assert.equal(sent.length,count,'double-click cannot replay summon');
invitation.dungeonSummon={id:'expired',expiresAt:0};invitation.updatePartyInvitation();assert.equal(el('party-invitation').shown,false);
const targets={storyWorld:null,usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),visibleInDungeonRoom:()=>true,HEARTHLING_NPC,POLL_BOOTHS,CITY_SERVICE_NPCS,GOLD_MERCHANT,isRaidInstance,isArenaInstance,ARENA_ENTRANCE,ARENA_ENTRY_RADIUS,ZEPPELIN_PORTS:[],DUNGEONS,dungeonReturn,DUNGEON_EXIT,DUNGEON_RETURN,worldInstance:null,dungeon:null,player:{},position:{x:0,z:0},zoneHandle:null,ZONES:[],VILLAGE_NPCS:[],TRAINER_NPCS:[],AUCTIONEER:{id:'a'},DEED_AUCTIONEER:{id:'deed'},BANKER:{id:'b'},BUILDING_CHAIRS:[],BUILDING_BEDS:[],WORLD_CURIOS:[],RESOURCE_SITES:[],buildingAt:()=>null,treasureMapTarget:()=>null,players:[],nodes:[],enemies:[],loot:[]};
runInNewContext(segment('function targetPoints(','function cancelGathering('),targets);
assert.equal(targets.targetPoints().filter(p=>p.kind==='dungeon').length,DUNGEONS.length*2,'all actual portal and summon interaction pairs');targets.worldInstance='run';targets.dungeon={completed:false,objects:[]};assert.deepEqual(Array.from(targets.targetPoints(),p=>p.id),['dungeon-exit']);targets.dungeon.completed=true;assert.deepEqual(Array.from(targets.targetPoints(),p=>p.id),['dungeon-exit','dungeon-return']);
console.log('PASS: seven legacy dungeons plus six quest-gated chambers and level copy, summon availability/escaping, exact destination dispatch, single consent response, expired invitation hiding, 26 world portal/stone targets, completion-only return.');

assert.equal(dungeonTime(0),'00:00');assert.equal(dungeonTime(62345,true),'01:02.345');assert.equal(dungeonTime(3600000),'60:00');assert.equal(dungeonTime(-50),'00:00');
assert.equal(dungeonElapsed({startedAt:0,elapsedMs:0},9999),0,'sanctuary prep does not count');
assert.equal(dungeonElapsed({startedAt:1000,elapsedMs:2200},5000),4000,'timer advances between snapshots');
assert.equal(dungeonElapsed({startedAt:1000,elapsedMs:2200},2500),2200,'snapshot elapsed protects against clock jitter');
assert.equal(dungeonElapsed({startedAt:1000,result:{durationMs:12345}},50000),12345,'completion freezes exact server time');
const player={id:'hero',name:'Tester',level:60,hp:100,gold:0,appearance:{className:'Mage'},inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},ownedBags:[],equippedBags:[null,null,null,null],...starterGear('Mage')};
const result={durationMs:62345,kills:111,wipes:2,partySize:2,ranked:true,xp:1000,lootId:'completion-1',items:[{id:'gear:starfall-staff',kind:'gear',itemId:'starfall-staff',quantity:1,quality:'rare'},{id:'resource:crystal',kind:'resource',itemId:'crystal',quantity:8,quality:'common'},{id:'resource:relic',kind:'resource',itemId:'relic',quantity:3,quality:'rare'}],claimed:false};
const original=structuredClone(result);html=renderDungeonResult(result,player);
assert.equal((html.match(/<article class="dungeon-reward-slot/g)||[]).length,4,'four reward slots');assert(html.includes('01:02.345'));assert(html.includes('111'));assert.match(html,/data-dungeon-claim >Collect/);assert.deepEqual(result,original,'view never rolls or grants rewards');
html=renderDungeonResult({...result,remainingItemIds:['resource:crystal']},player);assert.match(html,/data-dungeon-reward="gear:starfall-staff" disabled>Collected/);assert.match(html,/data-dungeon-reward="resource:crystal" >Collect/);
html=renderDungeonResult({...result,claimed:true},player);assert.match(html,/data-dungeon-claim disabled>Rewards collected/);
html=renderDungeonResult({...result,items:result.items.slice(1),ranked:false,unrankedReason:'<img src=x>'},player);assert(html.includes('No equipment'));assert(html.includes('&lt;img src=x&gt;'));assert(!html.includes('<img src=x>'));
const board={dungeonId:'rootvault',partySize:2,requestId:1,loading:false,entries:[{id:'run-1',dungeonId:'rootvault',partySize:2,durationMs:62345,kills:111,wipes:2,completedAt:1,realmId:'eu',members:[{id:'a',name:'<img src=x>',className:'Mage',level:60}]}]};
html=renderDungeonLeaderboard(board);assert(html.includes('&lt;img src=x&gt;'));assert(html.includes('01:02.345'));assert.equal((html.match(/data-dungeon-board-size=/g)||[]).length,4);assert.match(html,/data-dungeon-board-size="2" aria-pressed="true"/);
assert.match(renderDungeonLeaderboard({...board,loading:true}),/role="status">Loading dungeon records/);assert.match(renderDungeonLeaderboard({...board,entries:[]}),/No ranked clears yet/);assert.match(renderDungeonLeaderboard({...board,error:'Store unavailable'}),/role="alert">Store unavailable/);
const updates=[],timers=new Map();let timerId=0;
const requests={dungeonBoard:null,dungeonBoardRequest:0,dungeonBoardTimer:undefined,dungeon:null,dungeonChoice:'rootvault',party:null,connected:true,panel:{open:true,dataset:{mode:'dungeon'}},renderDungeonPanel:()=>updates.push(1),send:message=>sent.push(message),setTimeout:callback=>{timers.set(++timerId,callback);return timerId;},clearTimeout:id=>timers.delete(id)};
runInNewContext(segment('function loadDungeonLeaderboard(','let dungeonChoice:'),requests);
requests.loadDungeonLeaderboard(1);const first=sent.at(-1);requests.loadDungeonLeaderboard(2);const second=sent.at(-1);requests.loadDungeonLeaderboard(1);const latest=sent.at(-1);
requests.receiveDungeonLeaderboard({...first,entries:board.entries});assert(requests.dungeonBoard.loading,'stale response for previously selected same board ignored');
requests.receiveDungeonLeaderboard({...second,entries:board.entries});assert(requests.dungeonBoard.loading,'stale party size ignored');
requests.receiveDungeonLeaderboard({...latest,entries:board.entries});assert.equal(requests.dungeonBoard.loading,false);assert.equal(requests.dungeonBoard.entries.length,1);
requests.loadDungeonLeaderboard(4);timers.get(timerId)();assert.match(requests.dungeonBoard.error,/did not respond/);assert.equal(requests.dungeonBoard.loading,false,'timed out requests can retry');
requests.connected=false;requests.loadDungeonLeaderboard(4);assert.match(requests.dungeonBoard.error,/Reconnect/);
const claims={...ui,connected:true,player,dungeon:{result},lootAllBlockReason,lootEntryBlockReason};
runInNewContext(stripTypeScriptTypes(`function dispatch(data,button={}){${source.slice(source.indexOf(" if('dungeonClaim' in data"),source.indexOf(' if(data.chooseDungeon)'))}}`),claims);
claims.dispatch({dungeonClaim:''});assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'loot',targetId:'completion-1'});
claims.dispatch({dungeonReward:'resource:crystal'});assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'loot',targetId:'completion-1',itemId:'resource:crystal'});
const before=sent.length;claims.dungeon.result={...result,remainingItemIds:['resource:crystal']};claims.dispatch({dungeonReward:'gear:starfall-staff'});assert.equal(sent.length,before,'collected slot cannot resend');
console.log('PASS: exact frozen result time, preparation exclusion, four fixed personal slots, partial claims, escaped names/reasons, party-size boards, loading/error/retry, stale-response guard and authoritative loot requests.');
