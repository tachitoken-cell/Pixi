import ts from 'typescript';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {createZeppelinFlight,zeppelinPose,zeppelinPort,ZEPPELIN_PORTS} from '../src/zeppelin.ts';
import {newJump,stepJump} from '../src/jumping.ts';
import {findPath} from '../src/navigation.ts';
import {canTraverse} from '../src/realm.ts';
import {createRemoteMotion} from '../src/remote-motion.ts';
import {isInstantCombatInstance} from '../src/instant-combat.ts';

const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const functionText=name=>tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(tree);
const segment=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
const flight=createZeppelinFlight('greenwood','mistwood',1_000_000);
let clockReads=0,now=flight.startedAt,wet=false,ship,localAnimation,remoteAnimation;
const noop=()=>{},localAvatar=new THREE.Group(),remoteMesh=new THREE.Group(),position=new THREE.Vector3();
const remoteMotion=createRemoteMotion();remoteMotion.push({x:0,y:0,z:0,rotation:0,instanceId:null,mode:'zeppelin'},flight.startedAt,0);
const hero={id:'hero',characterCreated:true,hp:100,zeppelin:flight,summonedPet:'golden-pig',combatCompanion:{kind:'bramble-wolf'}},other={...hero,id:'other'};
const ctx={isInstantCombatInstance,instantCombat:null,instantCombatHUD:{update:noop},renderInstantCombatMenu:noop,updateDungeonTimer:noop,raid:null,raidHUD:{update:noop},renderRaidMenu:noop,THREE,Date:{now:()=>now+clockReads++*.75},serverOffset:0,performance:{now:()=>now},
 performanceHud:{frame:noop},customizer:{open:false},atlas:null,socket:null,WebSocket:{OPEN:1},
 mobileWindows:[],updateAutoGraphics:()=>false,applyGraphics:noop,autoGraphicsStatus:()=>'',lastGraphicsStatus:'',
 storeUI:{refresh:noop},nftUI:{refresh:noop},treasureUI:{refresh:noop},goldMerchantUI:{refresh:noop},updateStoreBoostHud:noop,emotePlayback:noop,
 heldKeyCodes:new Map(),player:hero,playerId:hero.id,players:[other],position,localAvatar,jump:newJump(0,90),rotation:0,keys:new Set(),
 newJump,zeppelinPose,zeppelinPort,ZEPPELIN_PORTS,flightStatus:{replaceChildren(){},append(){}},flightStatusText:'',
 document:{createTextNode:noop,createElement:()=>({})},
 zeppelins:{update(time){ship=zeppelinPose(flight,time);}},
 entryActive:false,rosterActive:false,connected:true,worldReady:true,renderedInstance:null,updateDungeonRoomView:noop,visibleInDungeonRoom:()=>true,worldInstance:null,worldZone:'greenwood',
 requestAnimationFrame:noop,hotbar:{updateCooldowns:noop},updateCastingBar:noop,cancelledCast:-1,
 previous:0,elapsed:0,auctionUI:{refresh:noop},bankUI:{refresh:noop},pollUI:{refresh:noop},panel:{open:false},modalOpen:()=>false,
 isMoving:false,cancelCasting:noop,releaseClimb:noop,syncCollisionState:noop,climbStopRequested:false,gmFlying:()=>false,stepJump,jumpFloor:()=>0,waterAt:()=>wet,
 standingChairId:null,activeMount:()=>null,mountRiderOffset:()=>0,canSprint:()=>false,
 combatPose:()=>false,animateCharacter:(mesh,_time,_moving,_attack,_gather,swim,travel)=>{const state={swim,travel};if(mesh===localAvatar)localAnimation=state;else remoteAnimation=state;},
 animateUpgradeEffect:noop,updateMountView:noop,updateThrownShield:noop,deathProgress:()=>undefined,deathPresented:false,
 petFollowers:{update(owners){assert.equal(owners.length,0,'local and remote pets rest during zeppelin flights');}},
 combatCompanions:{update(owners){assert.equal(owners.length,0,'local and remote combat companions rest during zeppelin flights');}},
 distance:21,pitch:.35,yaw:.34,airshipFraming:0,cameraTarget:new THREE.Vector3(),cameraPosition:new THREE.Vector3(),camera:new THREE.PerspectiveCamera(),surfaceHeight:()=>0,buildingAt:()=>undefined,
 zoneHandle:{constrainCamera(){assert.fail('Flight camera must stay clear of ground constraints');},setInteriorView:noop},
 remote:new Map([['other',{mesh:remoteMesh,label:{},motion:remoteMotion}]]),mountViews:new Map(),graphics:{renderDistance:420},placeLabel:noop,COLOSSEUM:{},inColosseumClearing:()=>false,
};
runInNewContext(source.match(/^function clearMovementKeys.*$/m)[0],ctx);
runInNewContext(source.match(/^function localSwimming.*$/m)[0],ctx);
runInNewContext(stripTypeScriptTypes(segment('function updateZeppelinTravel(','let travelHUDKey=')),ctx);
const local=segment('function frame(now:number)',' updateTravelHUD();');
const camera=segment(' const indoors=',' const worldTime=dayNight.update(');
const remotes=segment(' for(const p of players){\n  const entry=remote.get(p.id);',' zoneHandle?.setSwimmers?.');
runInNewContext(stripTypeScriptTypes(local+camera+' const swimmers=[];\n'+remotes+'\n}'),ctx);
runInNewContext(stripTypeScriptTypes(segment('function reconcileJump(','function moveGmFlight(')),ctx);
runInNewContext(stripTypeScriptTypes(functionText('snapWorldPosition')),ctx);
for(const fps of [12,30,60]){
 ctx.previous=0;localAvatar.position.set(0,0,0);
 for(let elapsed=0;elapsed<flight.arrivesAt-flight.startedAt;elapsed+=1000/fps){
  now=flight.startedAt+elapsed;clockReads=0;wet=elapsed>6500&&elapsed<20000;
  // Delayed snapshots and a suspended frame must never separate the rig from its craft.
  if(Math.round(elapsed)%5===0)ctx.reconcileJump({...hero,jump:{y:0,velocity:0,grounded:true,sequence:0}});
  ctx.frame(elapsed);
  const expected=new THREE.Vector3(ship.x,ship.y,ship.z);
  assert(localAvatar.position.distanceTo(expected)<1e-8,`local passenger stays on deck at ${fps}fps / ${elapsed}ms, gap=${localAvatar.position.distanceTo(expected)}`);
  assert(remoteMesh.position.distanceTo(expected)<1e-8,'remote passenger uses the same frame timestamp as the aircraft');
  assert.equal(localAvatar.rotation.y,ship.rotation,'rider rotates with the deck');
  assert.equal(localAnimation.swim,false,'airborne water crossings never enable swimming');
  assert.equal(remoteAnimation.swim,false);assert.equal(ctx.jump.grounded,false,'flight is not ground physics');
  assert(localAnimation.travel.jump.grounded,'passengers keep their standing animation');
  if(elapsed>9000&&elapsed<15000)assert(ctx.cameraTarget.y>180,'water below cannot pull the camera to sea level');
 }
}
now=flight.startedAt+10000;wet=true;
ctx.snapWorldPosition(0,0,null,{y:185,velocity:0,grounded:false,sequence:1});
assert(ctx.cameraTarget.y>185,'airborne correction keeps the camera at flight altitude over water');
ctx.frame(60000);assert(localAvatar.position.distanceTo(new THREE.Vector3(ship.x,ship.y,ship.z))<1e-8,'suspended tab resumes attached');
runInNewContext(stripTypeScriptTypes('function updateCamera(dt=1){const swimming=false,seated=null,riderLift=0,hoverLift=0;'+camera+'}'),ctx);
for(const flying of [true,false]){
 hero.zeppelin=flying?flight:null;ctx.airshipFraming=1;position.set(ZEPPELIN_PORTS[0].x,0,ZEPPELIN_PORTS[0].z);
 ctx.zoneHandle.constrainCamera=noop;
 const rendered=[];
 for(const zoom of [8,21,37]){ctx.distance=zoom;ctx.updateCamera();rendered.push(ctx.cameraPosition.distanceTo(ctx.cameraTarget));}
 assert(rendered[0]<rendered[1]&&rendered[1]<rendered[2],`${flying?'flight':'dock'} camera responds across the full zoom range`);
 assert(Math.abs(rendered[1]-46)<1e-8,'default ship framing remains unchanged');
}
ctx.distance=21;position.set(1000,0,1000);ctx.updateCamera(.05);
assert(ctx.airshipFraming>0&&ctx.airshipFraming<1,'leaving the dock eases out of flight framing');
const transition=ctx.cameraPosition.distanceTo(ctx.cameraTarget);assert(transition>21&&transition<46,'the first landing/exit frame does not snap to ground zoom');
ctx.updateCamera(2);assert(Math.abs(ctx.cameraPosition.distanceTo(ctx.cameraTarget)-21)<.001,'ground framing settles without retaining the flight offset');
let clears=0;
Object.assign(ctx,{oldFlight:null,panel:{open:false},clearWaypoint:()=>clears++,closePanel:noop});hero.zeppelin=flight;
runInNewContext(source.match(/^    if\(!oldFlight&&player.zeppelin\).*$/m)[0],ctx);
assert.equal(clears,0,'confirmed departure retains the chosen waypoint');
const correction=source.match(/^   if\(.*msg.x-position.x.*clearWaypoint\(\);$/m)[0];
ctx.msg={x:position.x+100,z:position.z,instanceId:null};runInNewContext(correction,ctx);
assert.equal(clears,0,'same-world flight corrections retain the chosen waypoint');
ctx.msg.instanceId='dungeon';runInNewContext(correction,ctx);assert.equal(clears,1,'incompatible instance correction still clears');
ctx.msg.instanceId=null;hero.zeppelin=null;runInNewContext(correction,ctx);assert.equal(clears,2,'ordinary ground teleport still clears');
const arrival=source.match(/^    if\(oldFlight&&!player.zeppelin\).*$/m)[0];
let routes=0;
Object.assign(ctx,{oldFlight:flight,guideTargetId:'quest-board',waypoint:{x:800,z:800},guideRoute:[{x:-5,z:-5}],colliders:[],WORLD_BOUNDS:{},toast:noop,
 findPath:(start,end)=>{routes++;assert.equal(start.x,hero.x);assert.equal(start.z,hero.z);assert.equal(end,ctx.waypoint);return [{x:hero.x+2,z:hero.z+2},end];}});
Object.assign(hero,{x:600,z:600});runInNewContext(stripTypeScriptTypes(arrival),ctx);
assert.equal(routes,1,'landing recomputes beginner directions from the arrival position');assert.equal(ctx.guideRoute[0].x,602);assert.equal(ctx.waypoint.x,800,'landing keeps the original destination');
const destination={x:640,z:600,label:'Beyond the dock',instanceId:null};
Object.assign(ctx,{guideTargetId:undefined,waypoint:destination,guideRoute:[{x:-5,z:-5}],colliders:[{x:620,z:600,r:4}],WORLD_BOUNDS:{minX:500,maxX:700,minZ:500,maxZ:700},findPath});
position.set(100,185,100);runInNewContext(stripTypeScriptTypes(arrival),ctx);
assert.equal(ctx.waypoint,destination,'landing preserves the exact custom destination');assert.equal(ctx.guideTargetId,undefined,'landing keeps manual guidance manual');
assert(ctx.guideRoute.length>1,'custom guidance is rebuilt around the obstacle beyond the arrival dock');
let previousPoint={x:hero.x,z:hero.z};
for(const point of ctx.guideRoute){assert(canTraverse(previousPoint,point,ctx.colliders,ctx.WORLD_BOUNDS),'every rebuilt leg is reachable from the authoritative landing position');previousPoint=point;}
assert.deepEqual(previousPoint,{x:destination.x,z:destination.z},'the rebuilt route ends at the retained destination');
ctx.waypoint=null;ctx.findPath=()=>assert.fail('landing without a waypoint must not create a route');runInNewContext(stripTypeScriptTypes(arrival),ctx);
console.log('PASS zeppelin client: deck attachment through flight, delayed snapshots, low FPS and resumed frames; dock/flight zoom and waypoint retention through departure/correction.');
