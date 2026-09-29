import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {COLOSSEUM as arena,COLOSSEUM_ENTRANCE,isInColosseum,COLOSSEUM_COLLIDERS,COLOSSEUM_PILLARS,inColosseumClearing,colosseumFloorHeight} from '../src/colosseum.ts';
import {ARENA_ENTRANCE} from '../src/arena.ts';
import {WORLD_COLLIDERS,WORLD_SCENERY,OVERWORLD_SPAWNS,canTraverse} from '../src/realm.ts';
import {newJump,moveJump,jumpFloor,stepJump} from '../src/jumping.ts';
import {groundHeight,surfaceAt} from '../src/landscape.ts';
assert(isInColosseum(arena));assert(!isInColosseum(COLOSSEUM_ENTRANCE));
for(const x of [NaN,Infinity,-Infinity])assert(!isInColosseum({x,z:0}));
for(let angle=0;angle<Math.PI*2;angle+=.1){
 const point=r=>({x:arena.x+Math.sin(angle)*r,z:arena.z+Math.cos(angle)*r});
 assert(isInColosseum(point(arena.radius-.01)));assert(!isInColosseum(point(arena.radius+.01)));
 assert(canTraverse(point(arena.radius-.01),point(arena.radius-.01)),'outer fighting lane remains open');
 assert.equal(groundHeight(point(arena.radius-1).x,point(arena.radius-1).z),0,'floor height matches model');
}
for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){
 const outside={x:arena.x+x*75,z:arena.z+z*75};
 assert(canTraverse(outside,arena),'all four entrances have a continuous path');
 assert.equal(surfaceAt(outside.x,outside.z).water,false);
}
assert(canTraverse({x:84,z:0},arena),'city east gate connects to arena');
assert(!canTraverse(arena,{x:arena.x+47,z:47}),'spectator wall cannot be crossed');
assert(COLOSSEUM_COLLIDERS.every(c=>WORLD_COLLIDERS.includes(c)));
assert.equal(COLOSSEUM_PILLARS.length,4);
for(const pillar of COLOSSEUM_PILLARS){
 assert(isInColosseum(pillar));assert(!canTraverse(pillar,pillar),'players cannot stand inside cover');
 for(const [dx,dz] of [[1,0],[0,1]]){
  const from={x:pillar.x-dx*5,z:pillar.z-dz*5},to={x:pillar.x+dx*5,z:pillar.z+dz*5};
  assert(!canTraverse(from,to),'long movement and spell paths cannot tunnel through a pillar');
  const route=[from,{x:from.x+dz*4,z:from.z+dx*4},{x:to.x+dz*4,z:to.z+dx*4},to];
  for(let i=1;i<route.length;i++)assert(canTraverse(route[i-1],route[i]),'each side of every pillar is accessible');
 }
}
assert(!WORLD_SCENERY.some(p=>Math.hypot(p.x-arena.x,p.z-arena.z)<arena.outerRadius+4),'arena excludes scenery');
assert(!OVERWORLD_SPAWNS.some(p=>Math.hypot(p.x-arena.x,p.z-arena.z)<arena.outerRadius+4),'arena excludes monster homes');
const bytes=readFileSync('public/models/colosseum.glb');assert(bytes.length<8_000_000,'arena asset stays below 8MB');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const model=gltf.scene;model.updateMatrixWorld(true);
assert(model.getObjectByName('Colosseum'),'editable model retains named root');
const bounds=new THREE.Box3().setFromObject(model);assert(bounds.max.y>=20&&bounds.max.y<26,'terraces and gate retain monumental player scale');
let meshes=0,triangles=0;model.traverse(p=>{if(p.isMesh){meshes++;triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3;assert(p.matrixWorld.elements.every(Number.isFinite));}});assert(meshes<=8,'bounded authored draw calls');
const ray=new THREE.Raycaster();
for(let x=-40;x<=40;x+=5)for(let z=-40;z<=40;z+=5){if(Math.hypot(x,z)>arena.radius-1||COLOSSEUM_PILLARS.some(p=>Math.abs(x+arena.x-p.x)<=p.halfWidth&&Math.abs(z+arena.z-p.z)<=p.halfDepth))continue;ray.set(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0));const hits=ray.intersectObject(model,true);assert(hits.length&&hits[0].point.y>=-.01&&hits[0].point.y<=.08,'visible floor matches grounded player feet');}
for(const pillar of COLOSSEUM_PILLARS){
 const x=pillar.x-arena.x,z=pillar.z-arena.z;
 const part=model.getObjectByName(`Cover_pillar_${z<0?'N':'S'}${x<0?'W':'E'}`);assert(part,'each cover pillar retains its editable name');
 const bounds=new THREE.Box3().setFromObject(part);
 assert(Math.abs(bounds.max.y-7)<.1&&Math.abs(bounds.min.x-(x-3))<.01&&Math.abs(bounds.max.x-(x+3))<.01&&Math.abs(bounds.min.z-(z-3))<.01&&Math.abs(bounds.max.z-(z+3))<.01,'visible 6m footprint and 7m crown agree with the shared pillars');
 ray.set(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0));
 assert(ray.intersectObject(model,true)[0]?.point.y>6,'every pillar has a solid core beneath its crown');
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  ray.set(new THREE.Vector3(x+dx*4,1.3,z+dz*4),new THREE.Vector3(-dx,0,-dz));
  const hit=ray.intersectObject(model,true)[0];assert(hit&&hit.distance>=.99&&hit.distance<2,'visible cover agrees with the solid footprint from every face');
 }
}
for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const offset of [-6,0,6]){
 ray.set(new THREE.Vector3(dx*75+dz*offset,1.3,dz*75+dx*offset),new THREE.Vector3(-dx,0,-dz));
 assert(!ray.intersectObject(model,true).some(hit=>hit.distance<75),'all entrances clear at player chest height');
}
// A spectator can enter, circle the safe front walkway and climb every tier.
const point=(r,a)=>({x:arena.x+Math.sin(a)*r,z:arena.z+Math.cos(a)*r});
let from=COLOSSEUM_ENTRANCE;const jump=newJump(from.x,from.z);
const walk=to=>{assert(!isInColosseum(to),'spectator never enters PvP');assert(canTraverse(from,to),'spectator route is unobstructed');assert(moveJump(jump,from,to),'spectator can walk each height change');assert(jump.grounded,'spectator stairs need no jump');from=to;};
for(let r=74.75;r>=44;r-=.25)walk(point(r,0));
for(let a=.01;a<=Math.PI/4;a+=.01)walk(point(44,a));
for(let r=44.25;r<=61.75;r+=.25)walk(point(r,.78));
assert(jump.y>10.4,'upper tiers elevate spectators above the fighting floor');
// These wall-collider corners extend just beyond the old terrace radius and used to drop players beneath the stands.
for(const [x,z] of [[22.5,58.5],[58.5,22.5]])for(const sx of [-1,1])for(const sz of [-1,1]){
 const radius=Math.hypot(x,z),corner={x:arena.x+sx*x,z:arena.z+sz*z},inside={x:arena.x+sx*x*(radius-1)/radius,z:arena.z+sz*z*(radius-1)/radius};
 const state=newJump(inside.x,inside.z),height=state.y;
 assert(canTraverse(inside,corner)&&moveJump(state,inside,corner),'the wall corner is reachable from the upper seats');
 for(let tick=0;tick<40;tick++)stepJump(state,.05,jumpFloor(corner.x,corner.z));
 assert.equal(state.y,height,'spectators cannot fall through a gap between the seats and exterior wall');
 assert(state.grounded&&moveJump(state,corner,inside),'spectators can walk back from every wall corner');
 assert(moveJump(newJump(corner.x,corner.z),corner,inside),'a character saved at the old trap position can walk out after reconnecting');
}
for(let row=0;row<15;row++){
 const r=(18.60+.43*row+.20)*2.5,p=point(r,.78),top=colosseumFloorHeight(p.x,p.z);
 assert(top>0&&!isInColosseum(p));ray.set(new THREE.Vector3(p.x-arena.x,top+.25,p.z-arena.z),new THREE.Vector3(0,-1,0));
 const hits=ray.intersectObject(model,true);assert(hits.length);assert(Math.abs(hits[0].point.y-top)<.015,`Blender seat${row} and shared floor agree: ${hits[0].point.y}/${top}`);assert.equal(jumpFloor(p.x,p.z),top);
}
// Invoke the actual world camera method: terrace canopies/parapets must not hide the fight.
model.position.set(arena.x,0,arena.z);model.updateMatrixWorld(true);
const worldSource=readFileSync('src/zones.ts','utf8'),cameraMethod=worldSource.slice(worldSource.indexOf('    constrainCamera(target,desired) {'),worldSource.indexOf('    setRegionBeaconLit(zone, lit)'));
const cameraWorld=runInNewContext(`({${cameraMethod}})`,{disposed:false,landscape:{constrainCamera(){}},dungeonApproaches:{constrainCamera(){}},cities:[{constrainCamera(){}}],COLOSSEUM:arena,arena:model,arenaRay:new THREE.Raycaster(),arenaDirection:new THREE.Vector3()});
const observer=point(58,.78),target=new THREE.Vector3(observer.x,jumpFloor(observer.x,observer.z)+1.2,observer.z),desired=target.clone().add(new THREE.Vector3(Math.sin(.78)*18,2,Math.cos(.78)*18));
cameraWorld.constrainCamera(target,desired);assert(target.distanceTo(desired)<18,'camera stops before the exterior wall');
const direction=desired.clone().sub(target),length=direction.length();ray.set(target,direction.normalize());ray.near=.01;ray.far=length;assert(!ray.intersectObject(model,true).length,'spectator view stays unobstructed');
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {buildWorldMapScene}=await import('../src/world-map.ts');hook.deregister();
const atlas=buildWorldMapScene(false,{minX:80,maxX:272,minZ:-96,maxZ:96});const pin=atlas.markers.find(m=>m.name===arena.id);assert(pin);assert.match(pin.userData.mapPoint.label,/Lethal world PvP/);assert(!isInColosseum(pin.userData.mapPoint),'map waypoint stops safely outside combat');assert(canTraverse(pin.userData.mapPoint,pin.userData.mapPoint));
const matchPin=atlas.markers.find(m=>m.name==='arena-entrance');assert(matchPin);assert.match(matchPin.userData.mapPoint.label,/Private 1v1 & 2v2/);assert.equal(matchPin.userData.mapPoint.x,ARENA_ENTRANCE.x);assert.equal(matchPin.userData.mapPoint.z,ARENA_ENTRANCE.z);assert(!isInColosseum(matchPin.userData.mapPoint),'private match entrance never routes through lethal combat');assert.notDeepEqual({x:pin.userData.mapPoint.x,z:pin.userData.mapPoint.z},{x:matchPin.userData.mapPoint.x,z:matchPin.userData.mapPoint.z},'private matches and world PvP retain distinct destinations');atlas.dispose();
console.log(`PASS: four solid model/collider cover pillars, open flanking routes, dry level arena, all four entrances, city approach, PvP boundaries, safe spectator route; ${meshes} meshes / ${triangles} triangles / ${bytes.length} bytes.`);
