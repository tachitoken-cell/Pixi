import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import RAPIER from '@dimforge/rapier3d-compat';
import { REGION_ORIGINS } from '../src/realm.ts';
import { groundHeight } from '../src/landscape.ts';
import { installCollisionScene, cloneCollisionScene, disposeCollisionScene, updateCollisionSceneState, actorFloor, actorCanStand, actorCanMove, actorLineOfSight, ACTOR_HEIGHT } from '../src/collision3d.ts';
import { newJump, startJump, stepJump, moveJump } from '../src/jumping.ts';
import { CLIMB_ENABLED, startClimb, stepClimb, CLIMB_DRAIN, CLIMB_SPEED } from '../src/climbing.ts';
import { newTravel } from '../src/travel.ts';

const vertices = new Float32Array([-.5,-.5,-.5, .5,-.5,-.5, .5,.5,-.5, -.5,.5,-.5, -.5,-.5,.5, .5,-.5,.5, .5,.5,.5, -.5,.5,.5]);
const indices = new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);
const buffer = new ArrayBuffer(vertices.byteLength + indices.byteLength);
new Float32Array(buffer, 0, vertices.length).set(vertices); new Uint32Array(buffer, vertices.byteLength, indices.length).set(indices);
const box = (x, y, z, w, h, d, state) => ({ shape: 0, matrix: [w,0,0,0, 0,h,0,0, 0,0,d,0, x,y,z,1], ...(state ? { state } : {}) });
const data = { shapes: [{vertexOffset:0,vertexCount:8,indexOffset:vertices.byteLength,indexCount:indices.length}], instances: [
  box(0,-.1,0,150,.2,150),
  box(0,.5,0,3,1,3), box(0,4.1,0,5,.2,5),
  box(4,1.5,0,.4,3,3), box(8,6,0,1,12,3),
  box(20,1.5,0,.02,3,4),
  box(30,1.5,-2,1,3,1), box(30,1.5,2,1,3,1), box(30,3.2,0,1,.4,5),
  box(40,.5,0,2,1,2,{key:'object:chest',value:false}), box(40,2.5,0,2,.2,2,{key:'object:chest',value:true}),
  box(50,4,0,1,8,3), box(50,9.1,0,4,.2,4),
  { ...box(60,1,0,2,2,8,{key:'depleted:fixture-node',value:false}), tag:'gathering-vein-base' },
  { ...box(59.1,1,0,.4,2,8,{key:'depleted:fixture-node',value:false}), tag:'gathering-vein-yield' },
  box(58.5,1,3,.1,2,1),
  { ...box(58.5,1,-3,.1,2,1,{key:'depleted:other-node',value:false}), tag:'gathering-vein-base' },
  box(70,1.5,0,1,3,3),box(68,1.5,0,.02,3,3),
] };
await installCollisionScene('test', data, buffer);
try {
  assert(Math.abs(actorFloor('test',0,0,1.01)-1)<1e-5, 'lower support under a roof is not replaced by roof height');
  assert(Math.abs(actorFloor('test',0,0,4.21)-4.2)<1e-4, 'upper support chosen only below feet ceiling');
  assert(actorCanStand('test',0,1,0), 'usable space under roof'); assert(!actorCanStand('test',0,2,0), 'head cannot occupy roof');
  assert(!actorCanStand('test',8,1,0), 'closed mesh interior cannot contain an actor');
  assert.equal(actorFloor('test',100,100,0),-Infinity,'instance gaps have no phantom floor');
  assert(!newJump(100,100,true,'test').grounded,'unsupported instance spawn is airborne');
  assert(!actorCanMove('test',{x:19,y:0,z:0},{x:21,y:0,z:0}), 'swept body cannot tunnel through thin walls');
  assert(actorCanMove('test',{x:69.12,y:0,z:0},{x:68.9,y:0,z:0}),'a slight initial overlap can move outward');
  assert(!actorCanMove('test',{x:69.12,y:0,z:0},{x:69.3,y:0,z:0}),'initial overlap cannot move farther into a wall');
  assert(!actorCanMove('test',{x:69.12,y:0,z:0},{x:67,y:0,z:0}),'escaping one overlap still sweeps against the next thin wall');
  assert(actorCanMove('test',{x:29,y:0,z:0},{x:31,y:0,z:0}), 'authored doorway remains hollow');
  assert(!actorLineOfSight('test',{x:0,y:3,z:0},{x:0,y:5,z:0}), 'roof blocks vertical interaction sightlines');
  assert(actorLineOfSight('test',{x:-1,y:2,z:0},{x:1,y:2,z:0}), 'interior sightline remains open');
  assert(!actorLineOfSight('test',{x:57,y:1,z:0},{x:60,y:1,z:0}), 'target resource is solid without an interaction exception');
  assert(actorLineOfSight('test',{x:57,y:1,z:0},{x:60,y:1,z:0},'resource:fixture-node'), 'interaction ray ignores every submesh of the specific target');
  assert(!actorLineOfSight('test',{x:57,y:1,z:3},{x:60,y:1,z:3},'resource:fixture-node'), 'ignoring target does not ignore an intervening wall');
  assert(!actorLineOfSight('test',{x:57,y:1,z:-3},{x:60,y:1,z:-3},'resource:fixture-node'), 'another resource with the same mesh names still blocks the ray');
  const roof = newJump(0,0,true,'test',4.2); assert(Math.abs(roof.y-4.2)<1e-4); assert(startJump(roof,0,0,true,'test')); assert(roof.y>4,'jump starts on roof support');
  const under = newJump(0,0,true,'test',1); assert(startJump(under,0,0,true,'test')); stepJump(under,.3,1,{x:0,z:0},'test');
  assert(under.y <= 4-ACTOR_HEIGHT+.03, 'upward jump stops at ceiling'); assert(under.velocity<=0);
  stepJump(under,1,1,{x:0,z:0},'test'); assert(under.grounded); assert(Math.abs(under.y-1)<.03);
  const delayed=newJump(0,0,true,'test',1); assert(startJump(delayed,0,0,true,'test')); stepJump(delayed,.6,1,{x:0,z:0},'test');
  assert(delayed.y<1.51&&delayed.velocity<=0,'a frame spanning the apex cannot skip a ceiling');
  const stepping = newJump(0,0,true,'test',4.2); assert(moveJump(stepping,{x:0,z:0},{x:3,z:0},true,'test')); assert(!stepping.grounded,'stepping off a roof starts a fall');
  stepJump(stepping,1,0,{x:3,z:0},'test'); assert(stepping.grounded); assert(Math.abs(stepping.y)<1e-5);
  if (!CLIMB_ENABLED) {
    const point={x:3.3,z:0},state=newJump(point.x,point.z,true,'test'),travel=newTravel(),before=structuredClone({state,travel});
    assert(!startClimb(state,point,{x:3.7,z:0},travel,true,'test'),'solid walls do not start disabled climbing');
    assert.deepEqual({state,travel},before,'blocked climbing leaves state and energy unchanged');
    assert(!moveJump(state,point,{x:4.5,z:0},true,'test'),'disabled climbing does not permit wall traversal');
  } else {
  const point = {x:3.3,z:0}, climb = newJump(point.x,point.z,true,'test'), travel = newTravel();
  assert(startClimb(climb,point,{x:3.7,z:0},travel,true,'test'),'contact with authored wall starts climb'); assert(climb.climb.wall);
  stepClimb(climb,point,travel,1,'test'); assert(climb.climb); assert(Math.abs(travel.stamina-(100-CLIMB_DRAIN))<1e-6);
  stepClimb(climb,point,travel,2,'test'); assert(climb.grounded); assert(!climb.climb); assert(Math.abs(climb.y-3)<1e-5); assert(point.x>3.8&&point.x<4.2,'mantle lands on actual wall top');
  const gatedPoint={x:3.3,z:0},gated=newJump(gatedPoint.x,gatedPoint.z,true,'test'),gatedEnergy=newTravel();let routeChecks=0;
  assert(startClimb(gated,gatedPoint,{x:3.7,z:0},gatedEnergy,true,'test'));
  stepClimb(gated,gatedPoint,gatedEnergy,4,'test',()=>{routeChecks++;return false;});
  assert(routeChecks>0&&gatedPoint.x===3.3&&gatedPoint.z===0,'climbing cannot follow or mantle across a forbidden route');
  assert(!gated.grounded&&gatedEnergy.stamina<100,'denied mantle never creates support and still charges ascent energy');
  const tiredPoint={x:6.8,z:0}, tired=newJump(tiredPoint.x,tiredPoint.z,true,'test'), energy=newTravel();
  assert(startClimb(tired,tiredPoint,{x:7.3,z:0},energy,true,'test'),'tall objects are climbable without arbitrary height cap');
  stepClimb(tired,tiredPoint,energy,10,'test'); assert.equal(energy.stamina,0); assert(energy.exhausted); assert(!tired.climb); assert(!tired.grounded);
  assert(tiredPoint.x<7.12 && actorCanStand('test',tiredPoint.x,tired.y,tiredPoint.z),'exhaustion leaves the body outside the wall without mantling');
  stepJump(tired,2,0,tiredPoint,'test'); assert(tired.grounded); assert(Math.abs(tired.y)<1e-5);
  const coveredPoint={x:48.8,z:0},covered=newJump(48.8,0,true,'test'),coveredEnergy=newTravel();
  assert(startClimb(covered,coveredPoint,{x:49.3,z:0},coveredEnergy,true,'test'),'overhang permits climbing until the head contacts it');
  for(let i=0;i<100;i++) {
    stepClimb(covered,coveredPoint,coveredEnergy,.05,'test');
    assert(covered.y<=9-ACTOR_HEIGHT+.03,'broad ceiling cannot be bypassed while climbing');
    assert(actorCanStand('test',coveredPoint.x,covered.y,coveredPoint.z),'ceiling contact never embeds the capsule');
  }
  assert(!covered.climb&&!covered.grounded); assert(covered.y>6); assert(coveredEnergy.stamina<100,'partial ascent under a ceiling consumes energy');
  }
  cloneCollisionScene('test','other-run'); updateCollisionSceneState('test',{'object:chest':true});
  assert(Math.abs(actorFloor('test',40,0,3)-2.6)<1e-4,'dynamic alternate matrix applied');
  assert(Math.abs(actorFloor('other-run',40,0,3)-1)<1e-5,'another run retains independent collision state');
  assert(!actorCanMove('test',{x:NaN,y:0,z:0},{x:0,y:0,z:0}));
  console.log('PASS 3D collision: stacked tops, hollow roofs and doors, ceiling sweeps, thin walls, step-off/fall, jumping from roofs, climbing policy, dynamic variants and independent instances.');
} finally { disposeCollisionScene('test'); disposeCollisionScene('other-run'); }

// Merging independent props can preserve one mirrored shell's inward winding.
// It must not make air above that shell solid or its actual interior traversable.
const mixedVertices = new Float32Array([...vertices].map((n,i) => n*6+(i%3===1?3:0)).concat([...vertices].map((n,i) => n*6+(i%3===0?10:i%3===1?3:0))));
const reversed = [...indices].map(n => n+8);
for(let i=0;i<reversed.length;i+=3) [reversed[i+1],reversed[i+2]]=[reversed[i+2],reversed[i+1]];
const mixedIndices = new Uint32Array([...indices,...reversed]);
const mixedBuffer = new ArrayBuffer(mixedVertices.byteLength+mixedIndices.byteLength);
new Float32Array(mixedBuffer,0,mixedVertices.length).set(mixedVertices);new Uint32Array(mixedBuffer,mixedVertices.byteLength,mixedIndices.length).set(mixedIndices);
const unchanged = new Uint8Array(mixedBuffer).slice();
await installCollisionScene('mixed-winding',{shapes:[{vertexOffset:0,vertexCount:mixedVertices.length/3,indexOffset:mixedVertices.byteLength,indexCount:mixedIndices.length}],instances:[
  {shape:0,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
  {shape:0,matrix:[-1,0,0,0,0,1,0,0,0,0,1,0,40,0,0,1]},
]},mixedBuffer);
try {
  assert.deepEqual(new Uint8Array(mixedBuffer),unchanged,'winding normalization does not mutate shared baked input');
  for(const x of [0,10,30,40]) {
    assert(!actorCanStand('mixed-winding',x,1,0),'each closed component retains its solid interior, including reflected instances');
    assert(actorCanStand('mixed-winding',x,6,0),'empty space above every component remains usable');
    assert(Math.abs(actorFloor('mixed-winding',x,0,6.01)-6)<1e-5,'each shell top is an upward support');
    assert(!actorCanMove('mixed-winding',{x:x-4,y:1,z:0},{x:x+4,y:1,z:0}),'corrected shells cannot be traversed');
  }
  assert(actorCanStand('mixed-winding',5,0,0),'space between disconnected components remains hollow');
} finally {disposeCollisionScene('mixed-winding');}
console.log('PASS mixed shell winding: interiors, tops, gaps and reflected instances preserve geometry without changing shared input.');

// Separate inner boundaries of a hollow solid intentionally face inward.
// Correcting mirrored props must not fill that enclosed, usable cavity.
const hollowVertices=new Float32Array([...vertices].map((n,i)=>n*12+(i%3===1?6:0)).concat([...vertices].map((n,i)=>n*10+(i%3===1?6:0))));
const hollowBuffer=new ArrayBuffer(hollowVertices.byteLength+mixedIndices.byteLength);
new Float32Array(hollowBuffer,0,hollowVertices.length).set(hollowVertices);new Uint32Array(hollowBuffer,hollowVertices.byteLength,mixedIndices.length).set(mixedIndices);
await installCollisionScene('nested-cavity',{shapes:[{vertexOffset:0,vertexCount:hollowVertices.length/3,indexOffset:hollowVertices.byteLength,indexCount:mixedIndices.length}],instances:[box(0,0,0,1,1,1)]},hollowBuffer);
try {
  assert(actorCanStand('nested-cavity',0,1,0),'an intentional inward inner boundary preserves its empty cavity');
  assert(Math.abs(actorFloor('nested-cavity',0,0,1.01)-1)<1e-5,'the cavity floor supports a player from inside');
  assert(!actorCanStand('nested-cavity',5.6,2,0),'material between inner and outer boundaries stays solid');
  assert(!actorCanMove('nested-cavity',{x:0,y:1,z:0},{x:8,y:1,z:0}),'a player in the cavity cannot cross its wall');
  assert(actorCanStand('nested-cavity',0,12,0),'space above the enclosing shell remains clear');
}finally{disposeCollisionScene('nested-cavity');}
console.log('PASS nested hollow shell: inward cavity, interior support and enclosing solid walls are preserved.');

// Stone courses, narrow cap lips and relief bands are separate solid meshes in
// the dungeon ruins. A flat box alone does not exercise their grip transitions.
if (CLIMB_ENABLED) for (const fixture of [
  { name:'capped wall', start:-.92, top:3.2, solids:[box(0,1.5,0,1,3,3),box(0,3.1,0,1.2,.2,3.2)] },
  { name:'shallow face bump', start:-.92, top:4, solids:[box(0,2,0,1,4,3),box(0,2.8,0,1.2,.12,3)] },
  { name:'recessed upper course', start:-.92, top:3.4, solids:[box(0,1,0,1,2,3),box(0,2.7,0,.6,1.4,3)] },
  { name:'mortar gaps', start:-1.08, top:3.2, solids:[box(0,.5,0,1.32,1,3),box(0,1.532,0,1.32,1,3),box(0,2.632,0,1.32,1.136,3)] },
]) {
  const key = `climb-${fixture.name}`;
  await installCollisionScene(key,{shapes:data.shapes,instances:[box(0,-.1,0,20,.2,20),...fixture.solids]},buffer);
  try {
    const position={x:fixture.start,z:0}, state=newJump(position.x,position.z,true,key), travel=newTravel();
    assert(state.grounded && actorCanStand(key,position.x,state.y,position.z),`${fixture.name}: valid approach`);
    assert(startClimb(state,position,{x:position.x+.5,z:0},travel,true,key),`${fixture.name}: starts climbing`);
    let ticks=0;
    while (state.climb && ticks++<120) {
      stepClimb(state,position,travel,.05,key);
      assert(actorCanStand(key,position.x,state.y,position.z),`${fixture.name}: body remains clear of solid meshes`);
      assert(state.y>=fixture.top-.05 || position.x<0,`${fixture.name}: cannot cross through wall before reaching its top`);
    }
    assert(!state.climb && state.grounded,`${fixture.name}: completes mantle instead of dropping`);
    assert(Math.abs(state.y-fixture.top)<.03,`${fixture.name}: reaches the actual solid top`);
    assert(travel.stamina>0 && travel.stamina<=100-state.y/CLIMB_SPEED*CLIMB_DRAIN+.01,`${fixture.name}: ascent consumes energy`);
    const landing={...position,y:state.y};
    for (let i=0;i<20;i++) {
      stepJump(state,.05,0,position,key);
      assert(state.grounded && Math.abs(state.y-landing.y)<.03,`${fixture.name}: remains supported after mantle`);
      assert(Math.abs(actorFloor(key,position.x,position.z,state.y+.03)-state.y)<.03,`${fixture.name}: support is actual geometry`);
      assert(actorCanStand(key,position.x,state.y,position.z),`${fixture.name}: standing capsule remains clear`);
    }
  } finally { disposeCollisionScene(key); }
}
if (CLIMB_ENABLED) console.log('PASS climbing stone profiles: capped walls, shallow relief bumps, recessed courses and mortar gaps reach clear solid tops, charge energy and remain supported.');

// The authored sunstone extends farther than the old fixed .8m ray trim.
// Test its actual meshes as well as the small, isolated fixtures above.
const overworld = JSON.parse(await readFile(new URL('../public/collision/overworld.json', import.meta.url), 'utf8'));
const binary = await readFile(new URL('../public/collision/overworld.bin', import.meta.url));
await installCollisionScene('overworld', overworld, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
try {
  const cap={x:531,z:173.54},capY=actorFloor('overworld',cap.x,cap.z,5.883);
  assert(Math.abs(capY-5.8328)<.01,'authored dungeon ruin cap remains the actual support');
  assert(actorCanStand('overworld',cap.x,capY,cap.z),'inverted authored cap cannot classify the air above it as solid');
  if (CLIMB_ENABLED) {
  const ruinsPoint={x:531,z:172.88},ruins=newJump(ruinsPoint.x,ruinsPoint.z,false,'overworld'),ruinsTravel=newTravel();
  assert(ruins.grounded&&startClimb(ruins,ruinsPoint,{x:531,z:173.38},ruinsTravel,false,'overworld'),'actual ruin face starts climbing');
  for(let i=0;i<160&&ruins.climb;i++)stepClimb(ruins,ruinsPoint,ruinsTravel,.05,'overworld');
  assert(!ruins.climb&&ruins.grounded&&Math.abs(ruins.y-capY)<.04,'actual authored capped wall completes its mantle');
  for(let i=0;i<20;i++)stepJump(ruins,.05,groundHeight(ruinsPoint.x,ruinsPoint.z),ruinsPoint,'overworld');
  assert(ruins.grounded&&Math.abs(ruins.y-capY)<.04&&actorCanStand('overworld',ruinsPoint.x,ruins.y,ruinsPoint.z),'authored cap remains a clear stable landing');
  assert(ruinsTravel.stamina<100&&ruinsTravel.stamina>0,'actual ruin climb consumes energy');
  console.log('PASS authored ruins: formerly inverted cap supports a complete energy-consuming mantle and stable landing.');
  } else {
    const ruins=newJump(cap.x,cap.z,false,'overworld',capY);
    for(let i=0;i<20;i++)stepJump(ruins,.05,groundHeight(cap.x,cap.z),cap,'overworld');
    assert(ruins.grounded&&Math.abs(ruins.y-capY)<.04,'disabled climbing retains stable support on authored ruin tops');
    console.log('PASS authored ruins: disabled climbing retains solid, stable cap support.');
  }
  const from = {x:-1141.4020868,y:22,z:-380.5050231}, to = {x:-1139,y:22,z:-381.5};
  assert(!actorLineOfSight('overworld',from,to),'actual sunstone intersects the normal solid ray');
  assert(actorLineOfSight('overworld',from,to,'resource:gathering-dune-wells-sunstone-vein-0'),'actual sunstone can be gathered from the valid approach');
  console.log('PASS actual sunstone interaction: precise target exclusion preserves solid world rays.');
  // Standing players in separate towns must not rebuild one another's geometry
  // every server tick. Count real Rapier worlds instead of using a flaky timer.
  cloneCollisionScene('overworld', 'spread-players');
  const World = RAPIER.World;
  let builds = 0, liveTriangles = 0, peakTriangles = 0;
  const history = [];
  RAPIER.World = class extends World {
    triangles = 0;
    constructor(...args) { super(...args); builds++; }
    createCollider(description, ...args) {
      const collider = super.createCollider(description, ...args), count = description.shape.indices.length / 3;
      this.triangles += count; liveTriangles += count; peakTriangles = Math.max(peakTriangles, liveTriangles); return collider;
    }
    free() { liveTriangles -= this.triangles; super.free(); }
  };
  try {
    const points = [{x:0,z:20},{x:35,z:0},{x:-35,z:0},{x:0,z:-35},{x:55,z:35}]
      .flatMap(offset => Object.values(REGION_ORIGINS).map(origin => ({x:origin.x+offset.x,z:origin.z+offset.z}))).slice(0,26);
    const floors = points.map(p => actorFloor('spread-players',p.x,p.z,groundHeight(p.x,p.z)+.5));
    assert(floors.every(Number.isFinite),'distributed players have real support');
    builds = 0;
    for (let tick=0;tick<3;tick++) points.forEach((p,i) => assert.equal(actorFloor('spread-players',p.x,p.z,groundHeight(p.x,p.z)+.5),floors[i]));
    assert.equal(builds,0,'26 distributed players retain their collision chunks between ticks');
    console.log('PASS collision cache: 26 distributed city positions retain identical support without rebuilding geometry across three ticks.');
    for (let run=0;run<3;run++) {
      const key=`cache-history-${run}`; cloneCollisionScene('overworld',key); history.push(key);
      for (const p of points) {
        actorFloor(key,p.x,p.z,groundHeight(p.x,p.z)+.5);
        const before=builds;
        points.forEach((p,i)=>assert.equal(actorFloor('spread-players',p.x,p.z,groundHeight(p.x,p.z)+.5),floors[i]));
        assert.equal(builds,before,'active town players stay warm while other scenes visit new areas');
      }
    }
    assert(peakTriangles<=1_000_000,'all scenes share the triangle budget, including while replacement worlds are being built');
    for(const key of history)disposeCollisionScene(key);disposeCollisionScene('spread-players');
    assert.equal(liveTriangles,0,'scene disposal releases every globally retained collision world');
    console.log('PASS global collision cache: scene history is bounded before allocation, active town26 never thrashes, and disposal frees all worlds.');
  } finally { for(const key of history)disposeCollisionScene(key); disposeCollisionScene('spread-players'); RAPIER.World = World; }
} finally { disposeCollisionScene('overworld'); }

// Opening an authored chest can move its hinged lid into a player who was
// standing legally beside the closed chest. Permit escape, never deeper entry.
const chestScene=JSON.parse(await readFile(new URL('../public/collision/dungeon-rootvault.json',import.meta.url),'utf8'));
const chestBinary=await readFile(new URL('../public/collision/dungeon-rootvault.bin',import.meta.url));
await installCollisionScene('dungeon-rootvault',chestScene,chestBinary.buffer.slice(chestBinary.byteOffset,chestBinary.byteOffset+chestBinary.byteLength));
try {
  const portalPoint={x:5,z:14},portalState=newJump(5,14,true,'dungeon-rootvault');let portalPeak=portalState.y;
  assert(portalState.grounded,'authored portal approach is supported');
  for(let i=0;i<80;i++) {
    const to={x:portalPoint.x-.1,z:portalPoint.z};
    assert(moveJump(portalState,portalPoint,to,true,'dungeon-rootvault'),'ordinary walking traverses the actual low portal plinth');
    Object.assign(portalPoint,to);stepJump(portalState,.02,0,portalPoint,'dungeon-rootvault');portalPeak=Math.max(portalPeak,portalState.y);
  }
  assert(portalPeak>.2&&portalPeak<.5&&!portalState.climb,'portal fixture traversed physical steps without climbing');
  const point={x:-23.5,z:-240.8},state=newJump(point.x,point.z,true,'dungeon-rootvault');
  assert(state.grounded&&actorCanStand('dungeon-rootvault',point.x,state.y,point.z),'closed authored chest leaves legal standing space');
  updateCollisionSceneState('dungeon-rootvault',{'object:garden-cache':true});
  assert(!actorCanStand('dungeon-rootvault',point.x,state.y,point.z),'opening the actual hinged lid overlaps this previously valid pose');
  assert(!actorCanMove('dungeon-rootvault',{...point,y:state.y},{x:point.x+.1,y:state.y,z:point.z}),'starting overlap cannot move deeper into the opened lid');
  for(let i=0;i<5;i++) {
    const to={x:point.x-.1,z:point.z};
    assert(moveJump(state,point,to,true,'dungeon-rootvault'),'player can walk away from a newly overlapping chest lid');
    Object.assign(point,to);
  }
  assert(state.grounded&&actorCanStand('dungeon-rootvault',point.x,state.y,point.z),'escape reaches clear supported space');
  console.log('PASS actual opened chest: valid closed pose escapes a moving lid while deeper overlap remains blocked.');
} finally {disposeCollisionScene('dungeon-rootvault');}
