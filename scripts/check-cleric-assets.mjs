import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCharacter, animateCharacter, setCharacterGear, setCharacterClericAssets, setCharacterRaces, setCharacterCustomization, setDeathAnimations } from '../src/characters.ts';
import { DEFAULT_APPEARANCE, RACES, GENDERS } from '../src/appearance.ts';
import { GEAR, GEAR_SETS, starterGear, equipmentSlotFor } from '../src/progression.ts';
import { spellsForClass } from '../src/spells.ts';
import { setMountAssets } from '../src/mounts.ts';

const load=async name=>{const b=readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;};
assert.throws(()=>setCharacterClericAssets(new THREE.Group()),/Missing Cleric equipment/);
const fallback=makeCharacter({...DEFAULT_APPEARANCE,className:'Cleric'});
assert(fallback.getObjectByName('mace')&&fallback.getObjectByName('tome')&&!fallback.getObjectByName('staff')&&!fallback.getObjectByName('bow'),'unloaded previews have a Cleric-specific fallback');
const kit=await load('cleric-kit');setCharacterClericAssets(kit);
const deathBytes=readFileSync(new URL('../public/models/death-animations.glb',import.meta.url));const deathAsset=await new GLTFLoader().parseAsync(deathBytes.buffer.slice(deathBytes.byteOffset,deathBytes.byteOffset+deathBytes.byteLength),'');setDeathAnimations(deathAsset.scene,deathAsset.animations);
setMountAssets(await load('mounts'));setCharacterGear(await load('gear-kit'));setCharacterRaces(await load('race-kit'));setCharacterCustomization(await load('customization-kit'));
const bytes=readFileSync(new URL('../public/models/cleric-kit.glb',import.meta.url));
assert(bytes.length<1_000_000,'separate race-fitted kit is under 1 MB');
const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
assert(!doc.textures?.length&&!doc.animations?.length&&!doc.cameras?.length);
assert(!doc.extensionsRequired?.some(name=>/draco|meshopt/i.test(name)));
assert(statSync(new URL('../assets/source/cleric-kit.blend',import.meta.url)).size>100_000);
let triangles=0,meshes=0;const resources=new Map();
kit.traverse(node=>{if(!node.isMesh)return;meshes++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;assert(node.material.vertexColors&&node.geometry.attributes.color);resources.set(node.geometry,node.geometry.attributes.position.array.slice());for(const a of Object.values(node.geometry.attributes))assert(a.array.every(Number.isFinite));});
for(const name of ['class','smite','heal','renew','shield','holyburst','beam','blessing','guardian']){
 const png=readFileSync(new URL(`../public/ui/cleric/${name}.png`,import.meta.url));assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128);assert.equal(png[25],6,'icons retain alpha');
}
for(const slot of ['head','body','legs','shoes','back','weapon']){const png=readFileSync(new URL(`../public/ui/gear/cleric-${slot}.png`,import.meta.url));assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128);assert.equal(png[25],6);}
let poses=0;
for(const race of RACES)for(const gender of GENDERS){
 const fitRace=['catfolk','dogfolk','lizardfolk'].includes(race.id)?'human':race.id;
 const look={...DEFAULT_APPEARANCE,race:race.id,gender:gender.id,className:'Cleric'};
 const equipment={...starterGear('Cleric').equipment};
 for(const item of Object.values(GEAR))if(item.className==='Cleric'&&!item.setId&&!item.dropOnly&&['head','legs','shoes','back'].includes(item.slot))equipment[equipmentSlotFor(equipment,item.id)]=item.id;
 const character=makeCharacter(look,equipment),rig=character.userData.rig,objects=[];
 const cranium=character.getObjectByName(`${character.userData.raceModel}-head-cranium`);
 cranium.geometry.computeBoundingBox();
 const headCore=cranium.geometry.boundingBox.clone().expandByScalar(-.05);
 character.traverse(node=>objects.push(node));character.position.set(7,3,-12);character.rotation.y=.41;
 for(const slot of ['head','armor','legs','shoes','back'])assert.equal(character.getObjectByName(`equipment-${slot}`).userData.fit,`${fitRace}-${gender.id}`,'matching authored clothing envelope is chosen');
 for(const side of ['left','right'])assert.equal(character.getObjectByName(`cleric-body-${fitRace}-${gender.id}-${side}-arm`).parent.name,`${side}-arm`);
 const cases=[{}, {moving:true}, {moving:true,travel:{sprinting:true}}, {moving:true,travel:{jump:{grounded:false,velocity:4}}}, {swimming:true,moving:true},{gathering:'mining'},{gathering:'woodcutting'},{travel:{mount:'horse'}},{death:.5},...spellsForClass('Cleric').flatMap(spell=>[.001,.12,.3,.55,.85,.999].map(progress=>({attack:{ability:spell.id,progress}})))];
 for(const mode of cases){
  animateCharacter(character,.37,!!mode.moving,mode.attack??false,mode.gathering,!!mode.swimming,mode.travel,mode.death);character.updateMatrixWorld(true);poses++;
  const after=[];character.traverse(n=>{after.push(n);assert(n.matrixWorld.elements.every(Number.isFinite));});assert.deepEqual(after,objects);assert.deepEqual(character.position.toArray(),[7,3,-12]);assert.equal(character.rotation.y,.41);
  for(const [name,arm] of [['mace',rig.rightArm],['tome',rig.leftArm]]){
   const weapon=character.getObjectByName(name),grip=[];weapon.traverse(n=>{if(n.userData.role==='weapon-grip')grip.push(n);});assert.equal(grip.length,1);
   const box=new THREE.Box3().setFromObject(grip[0]),palm=arm.localToWorld(new THREE.Vector3(0,-.625,.04));assert(box.getCenter(new THREE.Vector3()).distanceTo(palm)<1e-5,`${race.id}/${gender.id}/${name} handle is inside its palm in ${JSON.stringify(mode)}`);
   if(mode.gathering||mode.swimming||mode.travel?.mount)assert(!weapon.visible,'travel and work stow both held items');
   if(weapon.visible&&mode.death===undefined){
    const inverse=cranium.matrixWorld.clone().invert(),point=new THREE.Vector3(),matrix=new THREE.Matrix4();
    weapon.traverseVisible(n=>{if(!n.isMesh)return;matrix.multiplyMatrices(inverse,n.matrixWorld);const positions=n.geometry.attributes.position;
     for(let index=0;index<positions.count;index++){point.fromBufferAttribute(positions,index).applyMatrix4(matrix);assert(!headCore.containsPoint(point),`${race.id}/${gender.id}/${name} keeps its geometry outside the face during ${JSON.stringify(mode)}`);}
    });
   }
  }
 }
 animateCharacter(character,0,false);character.position.set(0,0,0);character.updateMatrixWorld(true);const bounds=new THREE.Box3();character.traverseVisible(n=>{if(n.isMesh)bounds.expandByObject(n);});assert(bounds.min.y>=-.035&&bounds.min.y<=.01&&bounds.max.y<3.8,`${race.id}/${gender.id} stays grounded`);
 assert(!character.getObjectByName('staff')&&!rig.bow);
}
for(const set of GEAR_SETS.filter(s=>s.className==='Cleric')){
 const equipment={...starterGear('Cleric').equipment};for(const item of Object.values(GEAR).filter(i=>i.setId===set.id))equipment[equipmentSlotFor(equipment,item.id)]=item.id;
 const char=makeCharacter({...DEFAULT_APPEARANCE,className:'Cleric'},equipment);assert(char.getObjectByName('equipment-weapon'));assert(char.getObjectByName('equipment-armor'));
}
for(const [geometry,positions] of resources)assert.deepEqual(geometry.attributes.position.array,positions,'equipping/animation do not mutate shared Blender buffers');
console.log(`PASS: Cleric kit ${bytes.length} bytes, ${meshes} meshes, ${triangles} triangles; ${RACES.length*GENDERS.length} race bodies, ${poses} poses, palm-centered mace/tome, original rig transforms, face clearance, stowing and 15 alpha icons.`);
