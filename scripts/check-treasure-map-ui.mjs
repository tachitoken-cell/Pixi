import assert from 'node:assert/strict';
import { registerHooks,stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {TREASURE_MAP_SITES}=await import('../src/treasure-maps.ts');
const {renderTreasureMap,treasureMapTarget,treasureMapWaypoint,treasureMapSearchArea}=await import('../src/treasure-map-ui.ts');
const {makeMapSearchArea,updateMapSearchArea,disposeGroup}=await import('../src/world-map.ts');
hook.deregister();
assert(TREASURE_MAP_SITES.length,'Approved map sites must exist');
const site=TREASURE_MAP_SITES[0],expedition={id:'test-expedition',siteId:site.id,stage:'search',level:4};
const player={id:'hero',characterCreated:true,hp:100,instanceId:null,carriedItems:{'treasure-map':2},treasureMap:expedition};
const action=(html,name)=>html.match(new RegExp(`<button[^>]*data-${name}[^>]*>`))?.[0];
let html=renderTreasureMap(player);
assert(html.includes(site.clue.replaceAll("'",'&#39;')));assert(html.includes('aria-current="step"'));assert(html.includes('no extra map is needed'));
assert(action(html,'track-treasure-map'));assert(!action(html,'start-treasure-map'));
assert.equal((html.match(/<section class="treasure-map-rewards"[^]*?<\/section>/)?.[0].match(/<li>/g)||[]).length,4,'each live reward has its own cell');
assert(html.indexOf('class="treasure-map-rewards"')<html.indexOf('data-track-treasure-map'),'rewards precede the tracking action');
assert(html.includes('1% chance of a MOSS voucher'),'the voucher remains a chance, not a guaranteed reward');
assert(action(renderTreasureMap({...player,treasureMap:null}),'start-treasure-map'));
assert(action(renderTreasureMap({...player,treasureMap:null},true),'start-treasure-map').includes('disabled'));
assert(renderTreasureMap(player,false,'<unsafe>').includes('&lt;unsafe&gt;'));
assert.equal(renderTreasureMap({...player,treasureMap:null,carriedItems:{}}),'');
const area=treasureMapSearchArea(player);assert.deepEqual(area,{x:site.searchX,z:site.searchZ,radius:site.radius});
assert(!treasureMapSearchArea({...player,instanceId:'dungeon-1'}));
assert(!treasureMapSearchArea({...player,treasureMap:{...expedition,stage:'chest'}}));
const ring=makeMapSearchArea();updateMapSearchArea(ring,area,()=>5);assert(ring.visible);assert.equal(ring.geometry.getAttribute('position').count,64);const geometry=ring.geometry;updateMapSearchArea(ring,area,()=>5);assert.equal(ring.geometry,geometry,'Passive updates reuse circle geometry');updateMapSearchArea(ring,undefined,()=>5);assert(!ring.visible);disposeGroup(ring);
const route=treasureMapWaypoint(player);assert.equal(route.x,site.searchX);assert.equal(route.z,site.searchZ);
assert(Math.hypot(route.x-site.x,route.z-site.z)>0,'Search waypoint must not reveal exact site');
assert(!treasureMapTarget(player,{x:site.x+16.01,z:site.z}));assert(treasureMapTarget(player,{x:site.x+16,z:site.z}));
for(const unavailable of [{hp:0},{instanceId:'dungeon-1'},{zeppelin:{}}]){
 assert(!treasureMapTarget({...player,...unavailable},site));
 assert(action(renderTreasureMap({...player,...unavailable}),'track-treasure-map').includes('disabled'));
}
for(const stage of ['guardian','chest']){
 const next={...player,treasureMap:{...expedition,stage}};
 assert(treasureMapTarget(next,{x:site.x+30,z:site.z}));assert.equal(treasureMapWaypoint(next).x,site.x);
 assert(renderTreasureMap(next).includes(stage==='guardian'?'Track guardian':'Track treasure chest'));
}
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const sent=[],messages=[];
const runtime={player:{...player,treasureMap:null},connected:true,treasureMapStarting:false,treasureMapMessage:'',worldInstance:null,worldZone:site.zone,
 contractZone:site.zone,contractPage:0,lastContractHTML:'',selectedAdventure:'hearthling',getZone:()=>({name:'Greenwood'}),document:{getElementById:()=>({focus(){}})},
 openPanel(){},renderContractPanel(){},send:msg=>sent.push(msg),treasureMapWaypoint,closePanel(){},setWaypoint:()=>true,toast:msg=>messages.push(msg)};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function openTreasureMap(){'),main.indexOf('function nearStation('))),runtime);
runtime.startTreasureMap();runtime.startTreasureMap();assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'treasureMapStart'}],'Repeated start suppressed while awaiting state');assert.equal(runtime.selectedAdventure,'treasure','opening a map selects its detail even after viewing another adventure');
for(const unavailable of [{hp:0},{carriedItems:{}},{zeppelin:{}}]){sent.length=0;runtime.treasureMapStarting=false;runtime.player={...player,treasureMap:null,...unavailable};runtime.startTreasureMap();assert.equal(sent.length,0);}
runtime.player=player;runtime.worldInstance='dungeon-1';runtime.trackTreasureMap();assert(messages.at(-1).includes('Return to the open world'));
let journalOpened=0,lockedNotice=0;
const journal={player,worldZone:site.zone,onboardingFeatureUnlocked:()=>false,openTreasureMap:()=>journalOpened++,allowFeature:()=>lockedNotice++};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function openContracts('),main.indexOf('function renderContractPanel('))),journal);
journal.openContracts();assert.equal(journalOpened,1,'Active map reopens with J before contracts unlock');
journal.player={...player,treasureMap:null};journal.openContracts();assert.equal(journalOpened,2,'Spare map remains discoverable in Quests before contracts unlock');
journal.player={...player,treasureMap:null,carriedItems:{}};journal.openContracts();assert.equal(lockedNotice,1,'Ordinary contract feature remains locked');
let target=treasureMapTarget(player,site),blocked=false;
const interaction={worldInstance:null,player,position:{x:site.x,z:site.z},rotation:0,worldZone:site.zone,zoneHandle:null,nearbyInteraction:()=>target,standUp(){},clearInteraction:()=>!blocked,
 clearMovementKeys(){},cancelCasting(){},cancelGathering(){},send:msg=>sent.push(msg),lastMove:0,performance:{now:()=>100},toast:msg=>messages.push(msg)};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function interactNearby(){'),main.indexOf('function pickTarget('))),interaction);
sent.length=0;interaction.interactNearby();assert.equal(sent[1].type,'treasureMapSearch');assert.equal(sent[1].expeditionId,expedition.id);
interaction.player={...player,treasureMap:{...expedition,stage:'guardian'}};sent.length=0;interaction.interactNearby();assert.equal(sent.length,0);assert(messages.at(-1).includes('Defeat the treasure guardian'));
interaction.player={...player,treasureMap:{...expedition,stage:'chest'}};sent.length=0;interaction.interactNearby();assert.equal(sent[1].type,'treasureMapOpen');
blocked=true;sent.length=0;interaction.interactNearby();assert.equal(sent.length,0);
blocked=false;interaction.position={x:site.x+3.01,z:site.z};interaction.interactNearby();assert.equal(sent.length,0,'Distant interactions do not send');
assert(main.includes("player.itemUseReadyAt,player.treasureMap,player.quest"),'Progress invalidates the HUD');
console.log('PASS treasure map UI: clue/stages, saved progress, approximate route, hidden site, unavailable states, start deduplication, and blocked/distant dig/chest commands');
