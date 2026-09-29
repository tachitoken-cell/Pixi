import assert from 'node:assert/strict';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {renderRaidPanel,renderRaidTactics,raidAction}=await import('../src/raid-ui.ts');
const {raidHazardGeometry}=await import('../src/raid-world.ts');
const {raidHazardContains}=await import('../src/raid.ts');
const {buildWorldMapScene}=await import('../src/world-map.ts');
hook.deregister();
const player={id:'hero',name:'Aster',hp:100,level:60,instanceId:null};
const members=Array.from({length:20},(_,i)=>({id:i?`p${i}`:'hero',name:i?'Raider '+i:'<img src=x>',className:'Cleric',level:60,role:i===0?'tank':i<3?'healer':'damage',ready:true,online:true,hp:100,maxHp:100,marks:i%5,plane:'arena'}));
const raid={id:'raid-test',leaderId:'hero',phase:'forming',members,plane:'arena',lockedSize:0,startedAt:0,phaseEndsAt:0,enrageEndsAt:0,wipes:0,bossId:'boss',bossHp:1000,bossMaxHp:1000,objective:'Get ready.',hazards:[],chains:[],guardiansKilled:0,crystalsRemaining:0,seals:[]};
let html=renderRaidPanel(raid,[],player,[],1000);
assert.equal((html.match(/data-raid-member=/g)||[]).length,20);assert(html.includes('&lt;img src=x&gt;'));assert(!html.includes('<img src=x>'));assert.match(html,/data-raid-action="start" >Enter/);
assert.match(renderRaidPanel({...raid,members:members.slice(0,9)},[],player,[],1000),/data-raid-action="start" disabled/);
assert.match(renderRaidPanel({...raid,members:members.map(member=>({...member,role:'damage'}))},[],player,[],1000),/data-raid-action="start" >Enter/);
assert.equal(raidAction({raidRole:'healer'},raid,'hero'),null);
assert(!html.includes('data-raid-role='));
assert.match(renderRaidPanel({...raid,members:members.map((member,index)=>({...member,ready:index<10}))},[],player,[],1000),/data-raid-action="start" >Enter/);
assert.deepEqual(raidAction({raidCoLeader:'p1'},raid,'hero'),{type:'raidCoLeader',targetId:'p1'});
assert.deepEqual(raidAction({raidCoLeader:''},raid,'hero'),{type:'raidCoLeader',targetId:null});
assert.deepEqual(raidAction({raidReady:'false'},raid,'hero'),{type:'raidReady',ready:false});
assert.deepEqual(raidAction({raidRespond:'invite',accept:'false'},null,'hero'),{type:'raidRespond',invitationId:'invite',accept:false});
assert.equal(raidAction({raidRole:'admin'},raid,'hero'),null);
const retry={...raid,phase:'wiped',lockedSize:20,approach:{roomIndex:3,roomName:'Silent Ossuary',remaining:0,cleared:false,totalRooms:8,exit:{x:0,z:-27}}};
const retryHtml=renderRaidPanel(retry,[],player,[],1000);
assert(!retryHtml.includes('data-raid-invite=')&&retryHtml.includes('data-raid-kick=')&&!retryHtml.includes('raid-invite-list'));
assert.equal((retryHtml.match(/data-raid-role="[^"]+" aria-pressed="[^"]+" disabled/g)||[]).length,0);
assert.match(retryHtml,/data-raid-ready="false" >✓ Ready/);
assert.match(retryHtml,/20 ready · 10 needed to retry/);assert.match(retryHtml,/Retry from room 4: Silent Ossuary/);
assert.equal(raidAction({raidRole:'healer'},retry,'hero'),null);
assert.equal(raidAction({raidInvite:'new-member'},retry,'hero'),null);assert.deepEqual(raidAction({raidKick:'p1'},retry,'hero'),{type:'raidKick',targetId:'p1'});
assert.deepEqual(raidAction({raidReady:'false'},retry,'hero'),{type:'raidReady',ready:false});
assert.match(renderRaidPanel({...retry,members:members.slice(0,9)},[],player,[],1000),/data-raid-action="start" >Try/);
const deputyHtml=renderRaidPanel({...raid,coLeaderId:'p1',candidates:[{id:'candidate',name:'Eligible hero',className:'Knight',level:60}]},[],{...player,id:'p1'},[],1000);
assert(deputyHtml.includes('data-raid-invite="candidate"'));assert(deputyHtml.includes('data-raid-kick="p2"'));assert(!deputyHtml.includes('data-raid-kick="hero"'));assert(!deputyHtml.includes('data-raid-co-leader='));
const invite=[{id:'invite',raidId:'raid-test',leaderName:'<img src=x>',expiresAt:2000}];
assert.match(renderRaidPanel(null,invite,player,[],1000),/data-raid-respond="invite" data-accept="true"/);
assert(!renderRaidPanel(null,invite,player,[],3000).includes('data-raid-respond'));
assert.match(renderRaidPanel(null,[],{...player,level:59},[],1000),/data-raid-action="create" disabled/);
assert.match(renderRaidPanel({...raid,candidates:[{id:'candidate',name:'Eligible hero',className:'Knight',level:60}]},[],player,[],1000),/data-raid-invite="candidate"/);
assert.match(renderRaidTactics({...raid,phase:'death-realm',seals:[{x:0,z:0,r:3,charge:1,active:false},{x:2,z:2,r:3,charge:6,active:true}]},'hero',1000),/1 \/ 4 seals/);
assert.match(renderRaidPanel({...raid,phase:'completed',result:{runId:'pending',durationMs:1000,partySize:20,saved:false,rewards:[]}},[],player,[],1000),/data-raid-action="leave" disabled/);
const cosmetics=renderRaidPanel({...raid,wipes:1,phase:'completed',result:{runId:'cosmetics',durationMs:1000,partySize:20,saved:true,rewards:['apostle-wings','black-aura','apostle-weapon'].map(id=>({id,label:id,kind:'cosmetic',quantity:1}))}},[],player,[],1000);
for(const file of ['wings','aura','weapon'])assert(cosmetics.includes(`/ui/raid/${file}.png`));
assert(cosmetics.includes('1 wipe</span>'));assert(!cosmetics.includes('1 wipes'));
for(const shape of ['circle','cone','line','ring']){
 const hazard={id:shape,shape,x:0,z:0,r:10,rotation:.7,angle:1.4,width:6,length:16,innerR:4},geometry=raidHazardGeometry(hazard),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
 const ray=new THREE.Raycaster();for(const p of [{x:.1,z:.2},{x:5,z:5},{x:-7,z:-4},{x:1,z:7},{x:15,z:0}]){ray.set(new THREE.Vector3(p.x,5,p.z),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(mesh).length>0,raidHazardContains(hazard,p),`${shape} drawn bounds match server at${JSON.stringify(p)}`);}geometry.dispose();mesh.material.dispose();
}
const atlas=buildWorldMapScene(false,undefined,'rootvault',false,undefined,true);assert.equal(atlas.group.name,'raid-atlas');assert.equal(atlas.markers.length,4);assert.equal(atlas.bounds.maxX,34);assert(!atlas.markers.some(marker=>marker.name.startsWith('dungeon-')));atlas.dispose();
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(main,/isRaidInstance\(instanceId\)\?createRaidWorld\(destination\)/);assert(main.includes('zoneHandle?.setRaidState?.'));assert.match(main,/function openDeath\(\)\{[^\n]*if\(isRaidInstance\(worldInstance\)\)\{openRaid\(\);return;\}/);
console.log('PASS raid lobby 10–20, ten-ready launch, role-free readiness, co-leader controls and smaller retries, safe names, invite expiry/actions, authoritative hazard geometry and dedicated map.');

// A dead raid spectator leaving the instance must receive the ordinary revive prompt.
const transition=main.match(/const instanceChanged=worldInstance!==instanceId;\n[^\n]+/)[0];
for(const changed of [false,true]){
 const state={worldInstance:'raid-ended',instanceId:changed?null:'raid-ended',deathPresented:true,panel:{open:true},clearWaypoint(){},closePanel(){}};
 runInNewContext(stripTypeScriptTypes(transition),state);
 assert.equal(state.deathPresented,!changed,'instance travel resets the presented death state exactly when the destination changes');
}

const overview=renderRaidPanel(null,[],{...player,raidProgress:{clears:7}},[],1000);
assert.match(overview,/>7 clears<\/span>/);
assert.equal([...overview.matchAll(/<li class="" /g)].length,8,'route includes six authored chambers, Morgrath and Apostle');
assert.match(overview,/Roles are chosen by your group/);assert.match(overview,/no role quotas/);
assert.match(overview,/<details class="raid-guide" open>/);
assert.doesNotMatch(overview,/Find a group|data-raid-role=/,'no fictional matchmaking or role-selection control');
assert.match(renderRaidPanel({...raid,phase:'approach',approach:{roomIndex:2,totalRooms:8,cleared:false,remaining:3,roomName:'Hollow Hive'}},[],player,[],1000),/class="is-current" aria-current="step"[^>]*><span>3<\/span>/);
console.log('PASS raid source composition: true clears, eight-room route/current stage and advisory roles without changing entry rules.');
