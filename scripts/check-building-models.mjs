import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBuildingModels } from '../src/building-models.ts';
import { BUILDINGS, BUILDING_CHAIRS, buildingPoint } from '../src/buildings.ts';
import { makeCharacter, animateCharacter, setCharacterRaces, setDeathAnimations } from '../src/characters.ts';
import { insideAnyCity as insideCity } from '../src/city.ts';
import { RACES, GENDERS, DEFAULT_APPEARANCE } from '../src/appearance.ts';
const load = async path => { const b=readFileSync(path); return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')).scene; };
const deathBytes=readFileSync('public/models/death-animations.glb');
const deaths=await new GLTFLoader().parseAsync(deathBytes.buffer.slice(deathBytes.byteOffset,deathBytes.byteOffset+deathBytes.length),'');
setDeathAnimations(deaths.scene,deaths.animations);
const asset=await load('public/models/house-interiors.glb');asset.add(await load('public/models/city-kit.glb'));
const frontier=await load('public/models/frontier-biomes.glb');
const deeds=await load('public/models/deed-cottages-merchants.glb');
// Cast through the exported facade, not a mocked material or the collision map.
function clearWindow(root, origin, direction, depth=1.6) {
 root.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,depth);
 const hits=ray.intersectObject(root,true);
 assert(hits.some(hit=>String(hit.object.userData.part).endsWith('-glass')),`${root.name}: window has glazing`);
 assert(hits.every(hit=>hit.object.material.transparent&&hit.object.material.opacity<=.25),`${root.name}: window looks through a real hole without an opaque backing`);
}
for(const root of [...asset.children.filter(root=>root.name.startsWith('house-')),...frontier.children.filter(root=>root.userData.assetKind==='exterior'),...deeds.children.filter(root=>root.name.startsWith('deed-house-'))]){
 const {width,depth}=root.userData;
 for(const sign of [-1,1]){
  clearWindow(root,[width*.30+.23,2.72,sign*(depth/2+.8)],[0,0,-sign]);
  clearWindow(root,[sign*(width/2+.8),2.72,depth*.30+.23],[-sign,0,0]);
 }
}
for(const [name,width,depth,y,z,x] of [['city-auction-hall',24,18,3.55,2.45,5.65],['city-clocktower',20,16,4.9,2.2,4.4]]){
 const root=asset.getObjectByName(name);
 clearWindow(root,[x,y,depth/2+.5],[0,0,-1]);
 for(const sign of [-1,1])clearWindow(root,[sign*(width/2+.5),y,z],[-sign,0,0]);
}
for(const kind of ['cottage','inn']){
 const root=asset.getObjectByName(`house-city-${kind}`),depth=root.userData.depth;
 clearWindow(root,[root.userData.width*.24+.19,(kind==='inn'?7.5:5.5)+.9,depth/2+.8],[0,0,-1]);
 if(kind==='inn')clearWindow(root,[4.35,6.7,depth/2+.8],[0,0,-1]);
}
for(const [root,origin,direction] of [
 [asset.getObjectByName('house-city-inn'),[5.9,9.35,2.92],[-1,0,0]],
 [asset.getObjectByName('city-auction-hall'),[6.6,10.75,5.8],[0,0,-1]],
 [asset.getObjectByName('city-clocktower'),[6.4,10.28,6.9],[0,0,-1]],
 ...['cottage','inn'].map(kind=>{const inn=kind==='inn',w=inn?14:10,d=inn?12:9,h=inn?5.5:5.2,top=inn?3.85:3.2;return [frontier.getObjectByName(`frontier-greenwood-${kind}`),[w*.23+.23,h+top*.54+1.03,d*.12+1.3],[0,0,-1]];}),
])clearWindow(root,origin,direction,.8);
const furnishings=await load('public/models/city-furnishings.glb');
asset.add(deeds);
const homes=createBuildingModels(asset,frontier,furnishings);
assert.equal(homes.root.children.length,BUILDINGS.length);assert.equal(homes.chairs.size,BUILDING_CHAIRS.length);
homes.root.updateMatrixWorld(true);
for(const home of BUILDINGS){
 const model=homes.root.getObjectByName(home.id),parts=new Map();
 model.traverse(part=>{if(part.isMesh&&part.userData.part)parts.set(part.userData.part,part);});
 const useFrontier=(home.zone!=='greenwood'||!insideCity(home.x,home.z))&&(home.kind==='cottage'||home.kind==='inn');
 const expectedSource=useFrontier?`frontier-${home.zone}-${home.kind}`:asset.getObjectByName(`deed-${home.id}`)?`deed-${home.id}`:['auction-hall','clocktower'].includes(home.kind)?`city-${home.kind}`:`house-city-${home.kind}`;
 assert(parts.get('shell-front')?.geometry===(useFrontier?frontier:asset).getObjectByName(expectedSource).children.find(p=>p.userData.part==='shell-front')?.geometry,`${home.id} shares its authored biome shell; Greenwood and civic shells stay unchanged`);
 assert(parts.has('shell-front')&&parts.has('shell-back')&&parts.has('roof-shingles'));
 for(const chair of BUILDING_CHAIRS.filter(c=>c.buildingId===home.id)){
  const mesh=homes.chairs.get(chair.id);assert.equal(mesh.userData.targetId,chair.id);
  const bounds=new THREE.Box3().setFromObject(mesh),center=bounds.getCenter(new THREE.Vector3());
  assert(Math.hypot(center.x-chair.x,center.z-chair.z)<.35,'visible chair matches authoritative seat');
  assert(bounds.min.y<=chair.y&&bounds.max.y>chair.y,'seat lies inside actual Blender chair bounds');
 }
 // Ray through the real front door, then one through its adjacent wall.
 model.traverse(part=>part.visible=true);model.updateMatrixWorld(true);
 const origin=buildingPoint(home,0,home.depth/2+2), direction=new THREE.Vector3(-Math.sin(home.rotation),0,-Math.cos(home.rotation));
 const ray=new THREE.Raycaster(new THREE.Vector3(origin.x,home.y+1.6,origin.z),direction,0,4);
 assert.equal(ray.intersectObjects([...parts.values()].filter(p=>p?.userData.part==='shell-front'),true).length,0,'authored door opening is hollow');
 const wall=buildingPoint(home,home.width/2-1,home.depth/2+2);ray.ray.origin.set(wall.x,home.y+1.6,wall.z);
 assert(ray.intersectObject(parts.get('shell-front'),true).length,'adjacent wall has visible geometry');
 homes.update(home,buildingPoint(home,20,20));
 assert(!parts.get('roof-shingles').visible&&!parts.get('shell-front').visible&&!parts.get('shell-right').visible);
 if(parts.has('shell-front-bank-crest'))assert(!parts.get('shell-front-bank-crest').visible,'bank sign cuts away with the wall');
 for(const [partName,part] of parts)if(partName?.startsWith('roof-'))assert(!part.visible,'all upper facades and clocktower stages cut away indoors');
 for(const [partName,part] of parts)if(partName?.endsWith('-glass')){
  assert(!part.castShadow&&!part.material.depthWrite,'clear glazing does not mask the room or cast solid shadows');
  if(partName.startsWith('shell-front')||partName.startsWith('shell-right'))assert(!part.visible,'glazing cuts away with its wall');
 }
 assert(parts.get('shell-back').visible&&parts.get('shell-left').visible,'far walls preserve the room');
 homes.update(home,buildingPoint(home,-20,-20));assert(!parts.get('shell-back').visible&&!parts.get('shell-left').visible);
 homes.update(buildingPoint(home,0,home.depth/2+2),home);assert(parts.get('roof-shingles').visible,'roof restores outdoors');
}
for(const [kind,minimum] of [['cottage',9.8],['inn',11.5]])assert(new THREE.Box3().setFromObject(asset.getObjectByName(`house-city-${kind}`)).max.y>=minimum,'dedicated city homes have substantial roof silhouettes');
setCharacterRaces(await load('public/models/race-kit.glb'));
for(const race of RACES)for(const gender of GENDERS)for(const className of ['Ranger','Mage','Knight']){
 const avatar=makeCharacter({...DEFAULT_APPEARANCE,race:race.id,gender:gender.id,className}),rig=avatar.userData.rig;
 const start=avatar.position.clone();animateCharacter(avatar,1,false,false,undefined,false,{seated:true});avatar.updateMatrixWorld(true);
 const hip=rig.leftLeg.getWorldPosition(new THREE.Vector3());assert(Math.abs(hip.y-.8)<.012,`${race.id} hip rests on seat without scaling`);
 assert(rig.leftLeg.rotation.x< -1&&rig.classGear.every(g=>!g.visible));
 assert(avatar.position.equals(start));avatar.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite)));
 animateCharacter(avatar,2,true);assert(rig.classGear.some(g=>g.visible),'standing restores equipment');
 animateCharacter(avatar,3,false,false,undefined,false,{seated:true},.5);assert(rig.body.rotation.toArray().every(v=>typeof v==='string'||Number.isFinite(v)),'death overrides sitting');
}
console.log(`PASS: ${BUILDINGS.length} real Blender shells, ${BUILDING_CHAIRS.length} chair targets, open door rays, directional cutaways, shared geometry and36 race/class/gender sitting/stand/death poses.`);
