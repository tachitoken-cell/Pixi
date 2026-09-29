import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCityModels } from '../src/city-models.ts';
import { createBuildingModels } from '../src/building-models.ts';
import { CITY_HOMES, CITY_PROPS, CITY_CLOCKTOWER, CITY_ROADS, BANK_HOME_ID, BANK_HOME_IDS } from '../src/city.ts';
import { BUILDINGS, BUILDING_CHAIRS, BUILDING_COLLIDERS, buildingPoint, chairApproach } from '../src/buildings.ts';
import { WORLD_COLLIDERS, canTraverse } from '../src/realm.ts';

const load=async path=>{const bytes=readFileSync(path);return(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;};
const kit=await load('public/models/city-kit.glb'),houses=await load('public/models/house-interiors.glb');
const frontier=await load('public/models/frontier-biomes.glb'),furnishings=await load('public/models/city-furnishings.glb');
kit.updateMatrixWorld(true);houses.updateMatrixWorld(true);
// Export quantization must preserve relief on the inward town hall shell faces.
const trimRay=new THREE.Raycaster(),clockAsset=kit.getObjectByName('city-clocktower');
for(const [part,origin,direction,axis,expected] of [
  ['shell-left',[-9,3,3.85],[-1,0,0],'x',-9.365],
  ['shell-left',[-9,2.02,1.4],[-1,0,0],'x',-9.345],
  ['shell-right',[9,3,3.85],[1,0,0],'x',9.365],
  ['shell-right',[9,2.02,1.4],[1,0,0],'x',9.345],
  ['shell-back',[5.1,3,-7],[0,0,-1],'z',-7.365],
  ['shell-back',[1,2.02,-7],[0,0,-1],'z',-7.345],
  ['shell-front',[2.24,3,7],[0,0,1],'z',7.365],
  ['shell-front',[4.5,2.02,7],[0,0,1],'z',7.345],
]){
  trimRay.set(new THREE.Vector3(...origin),new THREE.Vector3(...direction));
  const hit=trimRay.intersectObject(clockAsset.children.find(node=>node.userData.part===part),true)[0];
  assert(hit&&Math.abs(hit.point[axis]-expected)<.001,`${part} inside trim has real relief, clear of its wall and cross-beams`);
}
const hallFurniture=clockAsset.children.find(node=>node.userData.part==='interior-furniture');
for(const [label,x,z,minHeight] of [['council table',-5.3,-.5,1],['Rowan desk',0,-6,1],['archives',8.65,-1.5,2],['bookcases',-8.65,-4.8,2],['map cabinet',5.7,-6.6,1],['reading table',5.7,2.8,1]]){
  trimRay.set(new THREE.Vector3(x,6,z),new THREE.Vector3(0,-1,0));
  const hit=trimRay.intersectObject(hallFurniture,true)[0];assert(hit&&hit.point.y>minHeight,`${label} has substantial authored interior geometry`);
}
assert.equal(clockAsset.children.filter(node=>/^interior-chair-/.test(node.userData.part)).length,8,'the hall exports all eight usable seats');
const sourceResources=new Set(),sourceBuffers=[];
for(const asset of [kit,houses,frontier,furnishings])asset.traverse(node=>{
  if(!node.isMesh)return;
  sourceResources.add(node.geometry);
  for(const material of Array.isArray(node.material)?node.material:[node.material])sourceResources.add(material);
  sourceBuffers.push(node.geometry.attributes.position.array);
});
let sourceDisposals=0;for(const resource of sourceResources)resource.addEventListener('dispose',()=>sourceDisposals++);
const sourceHash=()=>{const hash=createHash('sha256');for(const array of sourceBuffers)hash.update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));return hash.digest('hex');};
const beforeSource=sourceHash(),city=createCityModels(kit,furnishings);
const water=[],stone=[];city.root.traverse(node=>{
  if(!node.isInstancedMesh)return;
  if(node.name.startsWith('city-fountain-water-'))water.push(node);
  else if(node.name.startsWith('city-fountain-'))stone.push({node,matrices:node.instanceMatrix.array.slice()});
});
for(const part of ['water-pool','water-streams','water-ripples'])assert(kit.getObjectByName(`city-fountain-${part}`),`actual authored fountain ${part} exists`);
assert(water.length>=3&&water.every(node=>!node.castShadow&&node.receiveShadow),'all water parts animate without opaque water shadows');
const fountains=CITY_PROPS.filter(p=>p.kind==='city-fountain');assert.equal(fountains.length,2);
const droplets=city.root.getObjectByName('Lanternreach fountain droplets');
assert(droplets.isInstancedMesh&&droplets.count===64&&droplets.instanceMatrix.count===128,'two fountains reuse a fixed bounded droplet pool');
const tiles=city.root.getObjectByName('Lanternreach cobbled streets'),matrix=new THREE.Matrix4();
const ownedResources=new Map([droplets,droplets.geometry,droplets.material,water[0].material,tiles,tiles.geometry,tiles.material].map(resource=>[resource,0]));
for(const resource of ownedResources.keys())resource.addEventListener('dispose',()=>ownedResources.set(resource,ownedResources.get(resource)+1));
const initialWater=water.map(node=>node.instanceMatrix.array.slice()),initialDroplets=droplets.instanceMatrix.array.slice();
let objects=0;city.root.traverse(()=>objects++);
for(let frame=1;frame<=120;frame++)city.animate(frame/30,{x:10,z:8});
assert(water.every((node,i)=>node.instanceMatrix.array.some((n,j)=>Math.abs(n-initialWater[i][j])>.001)),'pool, streams and ripples all move');
assert(droplets.instanceMatrix.array.some((n,i)=>Math.abs(n-initialDroplets[i])>.01),'visible droplets fall and splash');
assert(droplets.instanceMatrix.array.every(Number.isFinite));
let afterObjects=0;city.root.traverse(()=>afterObjects++);assert.equal(afterObjects,objects,'animation creates no scene objects');
for(const {node,matrices}of stone)assert.deepEqual(node.instanceMatrix.array,matrices,'stone fountain stays completely still');
city.animate(0);water.forEach((node,i)=>assert.deepEqual(node.instanceMatrix.array,initialWater[i],'water returns deterministically without accumulated transforms'));
const safe=droplets.instanceMatrix.array.slice();city.animate(NaN);assert.deepEqual(droplets.instanceMatrix.array,safe);
city.animate(3,{x:500,z:500});assert(!droplets.visible,'distant fountains stop drawing spray');
city.animate(3,{x:10,z:8});assert(droplets.visible);

// The actual rectangular stones fill the union of roads, including junctions.
const solids=WORLD_COLLIDERS.filter(p=>Math.abs(p.x)<90&&Math.abs(p.z)<90);
for(let i=0;i<tiles.count;i++){
  tiles.getMatrixAt(i,matrix);const x=matrix.elements[12],z=matrix.elements[14],halfWidth=matrix.elements[0]/2,halfDepth=matrix.elements[10]/2;
  for(let dx=-halfWidth+.125;dx<halfWidth;dx+=.25)for(let dz=-halfDepth+.125;dz<halfDepth;dz+=.25)assert(CITY_ROADS.some(road=>{
    const rx=road.x2-road.x1,rz=road.z2-road.z1,len=Math.hypot(rx,rz),ux=rx/len,uz=rz/len;
    const along=(x+dx-road.x1)*ux+(z+dz-road.z1)*uz,across=-(x+dx-road.x1)*uz+(z+dz-road.z1)*ux;
    return along>=-1e-6&&along<=len+1e-6&&Math.abs(across)<=road.width/2+1e-6;
  }),`paver ${x},${z} lies wholly inside the joined roads`);
  for(const p of solids){
    const overlap=p.halfWidth===undefined?Math.hypot(Math.max(0,Math.abs(x-p.x)-halfWidth),Math.max(0,Math.abs(z-p.z)-halfDepth))<p.r-1e-6:
      Math.abs(x-p.x)<p.halfWidth+halfWidth-1e-6&&Math.abs(z-p.z)<p.halfDepth+halfDepth-1e-6;
    assert(!overlap,`paver ${x},${z} must not run underneath solid ${p.x},${p.z}`);
  }
}

houses.add(kit);const interiors=createBuildingModels(houses,frontier,furnishings);
assert.equal(CITY_HOMES.length,17);assert.equal(interiors.root.children.length,BUILDINGS.length);assert.equal(interiors.chairs.size,BUILDING_CHAIRS.length);
const ray=new THREE.Raycaster();
for(const kind of ['cottage','inn','city-cottage','city-inn']){
  const source=houses.getObjectByName(`house-${kind}`),furniture=source.children.find(part=>part.userData.part==='interior-furniture');
  const width=source.userData.width,cz=kind.includes('cottage')?1.5:2.65;
  for(const side of [-1,1])for(const across of [-.60,.60]){
    ray.set(new THREE.Vector3(side*(width/2-.95)+across,3,cz+.25),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(furniture,true)[0];assert(hit&&hit.point.y>.7,'new sleeping alcoves have an actual full-width mattress/canopy');
  }
}
for(const home of BUILDINGS.filter(home=>home.kind==='inn'||home.kind==='cottage'))for(const side of [-1,1]){
  const p=buildingPoint(home,side*(home.width/2-.95),home.kind==='inn'?2.65:1.5);
  const collider=BUILDING_COLLIDERS.find(c=>Math.hypot(c.x-p.x,c.z-p.z)<.001);
  if(home.id===BANK_HOME_IDS[home.zone]){assert(!collider,'converted bank has no obsolete sleeping-alcove collision');continue;}
  assert(collider&&Math.abs(collider.halfWidth*collider.halfDepth*4-1.5*2.8)<1e-6,'wider beds have matching authoritative collision');
}
const bank=interiors.root.getObjectByName(BANK_HOME_ID),bankParts=[];
bank.traverse(part=>{if(part.userData.part)bankParts.push(part.userData.part);});
assert(bankParts.includes('interior-floor')&&!bankParts.some(part=>String(part).startsWith('interior-')&&part!=='interior-floor'),'bank retains its clear floor instead of the former inn furniture');
for(const chair of BUILDING_CHAIRS){const approach=chairApproach(chair);assert(canTraverse(approach,approach),`${chair.id} keeps a usable approach`);}
const clock=interiors.root.getObjectByName(CITY_CLOCKTOWER.id),fulcrum=clock.getObjectByName('Clock pendulum fulcrum'),pendulum=fulcrum.children[0];
assert.deepEqual(pendulum.userData.animationPivot,[0,5.5,-7.28],'Blender stores the animation fulcrum before quantization');
interiors.root.updateMatrixWorld(true);const fulcrumStart=fulcrum.getWorldPosition(new THREE.Vector3()),bobStart=new THREE.Box3().setFromObject(pendulum).getCenter(new THREE.Vector3());
interiors.animate(.5);interiors.root.updateMatrixWorld(true);
assert(fulcrum.getWorldPosition(new THREE.Vector3()).distanceTo(fulcrumStart)<1e-9,'clock pendulum swings from its fixed upper fulcrum');
assert(new THREE.Box3().setFromObject(pendulum).getCenter(new THREE.Vector3()).distanceTo(bobStart)>.05,'the visible bob actually swings');
interiors.animate(0);interiors.root.updateMatrixWorld(true);assert(new THREE.Box3().setFromObject(pendulum).getCenter(new THREE.Vector3()).distanceTo(bobStart)<1e-7);
assert.equal(sourceHash(),beforeSource,'animation and furniture clones never mutate shared imported vertex buffers');
city.dispose();city.dispose();assert.equal(sourceDisposals,0,'city animation teardown never disposes imported world geometry or palette');
for(const count of ownedResources.values())assert.equal(count,1,'all new owned resources are disposed exactly once');
assert(!droplets.parent&&!tiles.parent);city.animate(99);assert.equal(sourceHash(),beforeSource);
console.log(`PASS: 17 capital homes, ${BUILDING_CHAIRS.length} clear chair approaches, full-width Blender beds, fixed clock fulcrum, two animated fountains/64 droplets, ${tiles.count} road-contained pavers and idempotent owned-resource cleanup.`);
