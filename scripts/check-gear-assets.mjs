import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RACES, GENDERS } from '../src/appearance.ts';
import { makeCharacter, animateCharacter, setCharacterGear, setCharacterRaces } from '../src/characters.ts';
import { GEAR, GEAR_SETS, starterGear, equipmentSlotFor, EQUIPMENT_SLOTS } from '../src/progression.ts';
import { setMountAssets } from '../src/mounts.ts';

const bytes = await readFile(new URL('../public/models/gear-kit.glb', import.meta.url));
assert(bytes.length < 12_000_000, 'the original gear and fifteen complete sets with twelve baked body fits fit in twelve megabytes');
const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
assert(!json.textures?.length && !json.cameras?.length && !json.animations?.length, 'only wearable geometry ships');
assert(!json.extensionsRequired?.some(name => /draco|meshopt/i.test(name)), 'no extra decoder is needed');
assert((await stat(new URL('../assets/source/gear-kit.blend', import.meta.url))).size > 100_000, 'editable Blender source is retained');
const { scene: library } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), '');
assert.throws(()=>setCharacterGear(new THREE.Group()), /Missing equipment model/);
setCharacterGear(library);
const sourceResources = new Set(), sourceGeometry = new Map();
library.traverse(node => {
  if (!node.isMesh) return;
  sourceResources.add(node.geometry); sourceResources.add(node.material);
  sourceGeometry.set(node.geometry, node.geometry.attributes.position.array.slice());
  assert(node.material.vertexColors && node.geometry.attributes.color, 'Blender colours are rendered');
  for(const attribute of Object.values(node.geometry.attributes)) assert(attribute.array.every(Number.isFinite));
});
for(const model of new Set(Object.values(GEAR).map(item=>item.model).filter(model=>model&&!model.startsWith('cleric-')))) {
  const root = library.getObjectByName(model); assert(root, model);
  assert.deepEqual(root.position.toArray(), [0,0,0]); assert.deepEqual(root.scale.toArray(), [1,1,1]);
  const png = await readFile(new URL(`../public/ui/gear/${model}.png`, import.meta.url));
  assert.equal(png.subarray(1,4).toString(),'PNG'); assert(png.readUInt32BE(16)>=128 && png.readUInt32BE(20)>=128, `${model} has a rendered bag icon`);
}
const profiles = JSON.parse(await readFile(new URL('../assets/source/race-fit.json', import.meta.url), 'utf8'));
const fittedBases = ['ranger','knight','mage'].flatMap(name => ['body','legs','shoes','back'].map(slot => `${name}-${slot}`)).concat('necklace');
assert.equal(Object.keys(profiles).length, RACES.length * GENDERS.length);
const sharedFit = fit => /^(catfolk|dogfolk|lizardfolk)-/.test(fit) ? `human-${profiles[fit].gender}` : fit;
const exportedProfiles = Object.fromEntries(Object.entries(profiles).filter(([fit]) => sharedFit(fit) === fit));
assert.equal(Object.keys(exportedProfiles).length, 12, 'the original twelve authored fits are preserved');
const fitSignatures = new Set(), raycaster = new THREE.Raycaster();
library.updateMatrixWorld(true);
function frontAt(mesh, x, y) {
  raycaster.set(new THREE.Vector3(x,y,3), new THREE.Vector3(0,0,-1));
  return raycaster.intersectObject(mesh, true)[0]?.point.z;
}
for (const [fit, profile] of Object.entries(exportedProfiles)) {
  for (const base of fittedBases) {
    const model = library.getObjectByName(`${base}-${fit}`); assert(model, `${base} has an authored ${fit} fit`);
    assert.equal(model.userData.baseModel, base); assert.equal(model.userData.fit, fit);
    model.traverse(node => {
      assert.deepEqual(node.scale.toArray(), [1,1,1], 'equipment proportions are baked into the Blender vertices');
      assert.deepEqual(node.position.toArray(), [0,0,0], 'each wearable part keeps its runtime pivot origin');
    });
    if (base.endsWith('body')) {
      const torso = model.getObjectByName(`${base}-${fit}-torso`);
      assert(torso); fitSignatures.add(Array.from(torso.geometry.attributes.position.array).join(','));
      for (const arm of ['left-arm','right-arm']) assert(model.getObjectByName(`${base}-${fit}-${arm}`), 'fitted shoulders remain separate arm-local meshes');
      const { chestY, chestWidth, chestFront, waistY, waistWidth, femaleChest } = profile.torso;
      for (const side of [-1, 1]) {
        const chest = frontAt(torso, side*chestWidth*.18, chestY);
        assert(chest > chestFront+.015, `${base}/${fit} surrounds the clothed chest envelope`);
      }
      if (femaleChest) assert(frontAt(torso,0,chestY) > frontAt(torso,0,waistY)+.045, `${base}/${fit} preserves a shaped chest instead of a flat plate`);
    }
    if (base.endsWith('shoes')) {
      const bounds = new THREE.Box3().setFromObject(model);
      assert(Math.abs(bounds.min.y + profile.hip.y) < .00001, `${base}/${fit} soles meet the real ground at the race hip anchor`);
    }
  }
}
assert.equal(fitSignatures.size, 36, 'each class and race/gender torso has its own authored geometry');
for (const calling of ['ranger','knight','mage']) for (const x of [-.155,.155]) {
  const front = frontAt(library.getObjectByName(`${calling}-head`), x, -.045);
  assert(front === undefined || front < .31, `${calling} headgear leaves both eyes unobscured on the shared face plane`);
}
const appearance = {skin:'#eeb58b',hair:'#62452f',hairStyle:'long',outfit:'#548d68',accent:'#e5b961'};
for(const className of ['Ranger','Knight','Mage']) {
  const equipment = {...starterGear(className).equipment};
  for(const item of Object.values(GEAR)) if(!item.setId && item.price>0 && (!item.className || item.className===className)) equipment[equipmentSlotFor(equipment,item.id)] = item.id;
  const identity = Object.freeze({...appearance,className}), snapshot=JSON.stringify(identity);
  const rig = makeCharacter(identity, Object.freeze(equipment)), twin=makeCharacter(identity,equipment);
  for(const slot of EQUIPMENT_SLOTS.filter(slot=>slot!=='weapon')) {
    const attachments=[];rig.traverse(node=>{if(node.name===`equipment-${slot}`)attachments.push(node);});
    assert.equal(attachments.length,['legs','shoes'].includes(slot)?2:1, `${className} ${slot} is visible`);
    const anchors={head:['head'],armor:['body'],charm:['body'],back:['cape'],legs:['left-leg','right-leg'],shoes:['left-leg','right-leg'],ring1:['left-arm'],ring2:['right-arm']};
    assert.deepEqual(attachments.map(node=>node.parent.name),anchors[slot]);
    for(const attachment of attachments) {
      const matching=twin.getObjectByName(attachment.name);
      attachment.traverse(node=>{if(node.isMesh){assert(sourceResources.has(node.geometry));assert(sourceResources.has(node.material));}});
      assert(matching && matching!==attachment, 'avatars own transforms while sharing imported buffers');
    }
  }
  for(const part of ['left-arm','right-arm']) {
    const shoulder=rig.getObjectByName(`${GEAR[equipment.armor].model}-human-male-${part}`)||rig.getObjectByName(`${GEAR[equipment.armor].model}-${part}`);
    assert.equal(shoulder.parent.name,part,'shoulder plates follow the arms');
  }
  const bounds=new THREE.Box3();rig.updateMatrixWorld(true);rig.traverseVisible(node=>{if(node.isMesh)bounds.expandByObject(node);});
  assert(bounds.min.y>=-.04 && bounds.max.y<3.6, 'full set keeps human scale and grounded feet');
  const nodes=[];rig.traverse(node=>nodes.push(node));
  for(const mode of [{moving:true},{gathering:'mining'},{swimming:true,moving:true},{attack:{ability:className==='Mage'?'fireball':className==='Ranger'?'volley':'cleave',progress:.4}}]) {
    animateCharacter(rig,.37,!!mode.moving,mode.attack||false,mode.gathering,!!mode.swimming);rig.updateMatrixWorld(true);
    const after=[];rig.traverse(node=>{after.push(node);assert(node.matrixWorld.elements.every(Number.isFinite));});assert.deepEqual(after,nodes,'attacks, gathering and swimming retain all gear attachments');
  }
  assert.equal(JSON.stringify(identity),snapshot, 'equipping preserves immutable character appearance');
  const bare=makeCharacter(identity,{...equipment,head:null});
  assert(!bare.getObjectByName('equipment-head'),'unequipping the hat restores the chosen hair');
  assert.notEqual(bare.getObjectByName('head').getObjectByName('voxel-parts').count,rig.getObjectByName('head').getObjectByName('voxel-parts').count);
}
for(const [geometry, positions] of sourceGeometry) assert.deepEqual(geometry.attributes.position.array,positions, 'equipping and animation never mutate shared source meshes');
const raceBytes = await readFile(new URL('../public/models/race-kit.glb', import.meta.url));
const { scene: raceLibrary } = await new GLTFLoader().parseAsync(raceBytes.buffer.slice(raceBytes.byteOffset,raceBytes.byteOffset+raceBytes.byteLength), '');
setCharacterRaces(raceLibrary);
const mountBytes=await readFile(new URL('../public/models/mounts.glb',import.meta.url));
setMountAssets((await new GLTFLoader().parseAsync(mountBytes.buffer.slice(mountBytes.byteOffset,mountBytes.byteOffset+mountBytes.byteLength),'')).scene);
for (const [raceFit, profile] of Object.entries(profiles)) for (const className of ['Ranger','Knight','Mage']) {
  const fit=sharedFit(raceFit);
  const equipment={...starterGear(className).equipment};
  for(const item of Object.values(GEAR)) if(!item.setId && item.price>0 && (!item.className || item.className===className)) equipment[equipmentSlotFor(equipment,item.id)]=item.id;
  const character=makeCharacter({...appearance,className,race:profile.race,gender:profile.gender},equipment), rig=character.userData.rig;
  assert.equal(character.userData.raceModel,profile.root);
  assert.deepEqual(rig.body.scale.toArray(),[1,1,1],'equipped races retain their authored anatomy without runtime stretching');
  for(const slot of ['armor','legs','shoes','back','charm']) {
    const item=character.getObjectByName(`equipment-${slot}`);assert.equal(item.userData.fit,fit,`${className}/${fit}/${slot} chooses its fitted exported model`);
    item.traverse(node=>{if(node.isMesh)assert(sourceResources.has(node.geometry),'fitted equipment still shares the imported vertex buffers');});
  }
  for(const part of ['left-arm','right-arm']) assert.equal(character.getObjectByName(`${GEAR[equipment.armor].model}-${fit}-${part}`).parent.name,part,'fitted sleeves follow the actual race arm pivot');
  character.updateMatrixWorld(true);
  const bounds=new THREE.Box3();character.traverseVisible(node=>{if(node.isMesh)bounds.expandByObject(node);assert(!['armor','legs','shoes'].includes(node.userData.slot),'replaced body clothes cannot clip through equipped models');});
  assert(bounds.min.y>=-.025&&bounds.max.y<3.7,`${className}/${fit} is grounded and fits a full-body preview`);
  for(const mode of [{moving:true},{gathering:'woodcutting'},{swimming:true,moving:true},{attack:{ability:className==='Ranger'?'volley':className==='Mage'?'fireball':'cleave',progress:.26}}]){
    animateCharacter(character,.37,!!mode.moving,mode.attack||false,mode.gathering,!!mode.swimming);character.updateMatrixWorld(true);
    assert.deepEqual(rig.body.scale.toArray(),[1,1,1]);character.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite)));
  }
}
const originalSets=GEAR_SETS.filter(set=>set.className!=='Cleric');
assert.equal(originalSets.length,15,'all fifteen original complete equipment sets are preserved');
for(const set of originalSets) {
  const pieces=Object.values(GEAR).filter(item=>item.setId===set.id);
  assert.equal(pieces.length,8,`${set.id} has every wearable and its own weapon`);
  for(const [raceFit,profile] of Object.entries(profiles)) {
    const fit=sharedFit(raceFit);
    const equipment={...starterGear(set.className).equipment};
    for(const item of pieces)equipment[equipmentSlotFor(equipment,item.id)]=item.id;
    equipment.ring2=equipment.ring1;
    for(const suffix of ['body','legs','shoes','back','necklace']) {
      const source=library.getObjectByName(`${set.id}-${suffix}-${fit}`);assert(source,`${set.id}/${suffix}/${fit} exists`);
      assert.equal(source.userData.baseModel,`${set.id}-${suffix}`);assert.equal(source.userData.fit,fit);
      source.traverse(node=>{assert.deepEqual(node.scale.toArray(),[1,1,1],'new fitted gear is baked in Blender');assert.deepEqual(node.position.toArray(),[0,0,0],'new fitted parts retain their joint origin');});
      if(suffix==='shoes')assert(Math.abs(new THREE.Box3().setFromObject(source).min.y+profile.hip.y)<.00001,`${set.id}/${fit} soles meet the authored ground`);
    }
    const character=makeCharacter({...appearance,className:set.className,race:profile.race,gender:profile.gender},equipment);
    for(const slot of EQUIPMENT_SLOTS) {
      const attached=character.getObjectByName(`equipment-${slot}`);assert(attached,`${set.id}/${fit}/${slot} is equipped`);
      attached.traverse(node=>{if(node.isMesh){assert(sourceResources.has(node.geometry));assert(sourceResources.has(node.material));}});
      if(['armor','legs','shoes','back','charm'].includes(slot))assert.equal(attached.userData.fit,fit,`${set.id}/${slot} uses its authored race fit`);
    }
    for(const part of ['left-arm','right-arm'])assert.equal(character.getObjectByName(`${set.id}-body-${fit}-${part}`).parent.name,part,'new shoulder plates move with the actual arm');
    for(const mode of [{},{moving:true},{gathering:'mining'},{gathering:'woodcutting'},{swimming:true,moving:true},{attack:{ability:set.className==='Ranger'?'volley':set.className==='Mage'?'fireball':'cleave',progress:.26}},{travel:{mount:'horse'},moving:true}]) {
      animateCharacter(character,.37,!!mode.moving,mode.attack||false,mode.gathering,!!mode.swimming,mode.travel);character.updateMatrixWorld(true);
      character.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite),`${set.id}/${fit} stays finite`));
    }
  }
}
for(const [geometry,positions] of sourceGeometry)assert.deepEqual(geometry.attributes.position.array,positions,'new sets never mutate shared Blender buffers');
const dropped = Object.values(GEAR).filter(item => item.dropOnly);
assert.equal(new Set(dropped.map(item => item.model)).size, 64, 'common and uncommon gear have 64 authored models');
const dropSignatures = new Set();
for (const model of new Set(dropped.map(item => item.model))) {
  const signature=[];
  library.getObjectByName(model).traverse(node=>{if(node.isMesh)signature.push(Array.from(node.geometry.attributes.position.array),Array.from(node.geometry.attributes.color.array));});
  dropSignatures.add(JSON.stringify(signature));
}
assert.equal(dropSignatures.size,64,'each new base piece has distinct authored geometry or colours');
for (const className of ['Ranger','Knight','Mage','Cleric']) for (const quality of ['common','uncommon']) for (const [raceFit,profile] of Object.entries(profiles)) {
  const fit=sharedFit(raceFit);
  const pieces=dropped.filter(item=>item.className===className&&item.quality===quality&&item.requiredLevel===(quality==='common'?1:3));
  assert.equal(pieces.length,8);
  const equipment={...starterGear(className).equipment};
  for(const item of pieces)equipment[equipmentSlotFor(equipment,item.id)]=item.id;
  const character=makeCharacter({...appearance,className,race:profile.race,gender:profile.gender},equipment);
  for(const item of pieces){
    const slot=equipmentSlotFor(equipment,item.id),attachment=character.getObjectByName(`equipment-${slot}`);assert(attachment,`${item.id}/${fit} attaches`);
    if(['head','armor','legs','shoes','back','charm'].includes(slot))assert.equal(attachment.userData.fit,fit,`${item.id} uses the real ${fit} body fit`);
    attachment.traverse(node=>{if(node.isMesh)assert(sourceResources.has(node.geometry),'new gear shares imported buffers');});
  }
  for(const part of ['left-arm','right-arm'])assert.equal(character.getObjectByName(`${GEAR[equipment.armor].model}-${fit}-${part}`).parent.name,part,'drop sleeves follow the arms');
  const head=library.getObjectByName(`${GEAR[equipment.head].model}-${fit}`);
  for(const x of [-.155,.155]){const front=frontAt(head,x,-.045);assert(front===undefined||front<.31,`${className}/${quality}/${fit} leaves eyes clear`);}
  character.updateMatrixWorld(true);
  const bounds=new THREE.Box3();character.traverseVisible(node=>{if(node.isMesh)bounds.expandByObject(node);});
  assert(bounds.min.y>=-.035&&bounds.max.y<3.8,`${className}/${quality}/${fit} keeps grounded feet and character scale`);
  for(const mode of [{},{moving:true},{gathering:'mining'},{swimming:true,moving:true},{attack:{ability:{Ranger:'volley',Knight:'cleave',Mage:'fireball',Cleric:'smite'}[className],progress:.3}},{travel:{mount:'horse'},moving:true}]){
    animateCharacter(character,.37,!!mode.moving,mode.attack||false,mode.gathering,!!mode.swimming,mode.travel);character.updateMatrixWorld(true);
    character.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite)));
    const grip=[];character.getObjectByName('equipment-weapon').traverse(node=>{if(node.userData.role==='weapon-grip')grip.push(node);});assert.equal(grip.length,1);
    const arm=character.userData.rig[className==='Ranger'?'leftArm':'rightArm'];
    const palm=arm.localToWorld(new THREE.Vector3(0,-.625,.04)),center=new THREE.Box3().setFromObject(grip[0]).getCenter(new THREE.Vector3());
    assert(center.distanceTo(palm)<.00001,`${className}/${quality}/${fit} keeps the handle in its palm`);
  }
}
await import('./check-character-view.mjs');
console.log('PASS: original 36 race/gender/class fits plus 15 full Blender sets across 12 race fits, shaped chest shells, grounded boots, clear eyes, real joint attachments, shared buffers and equipped preview framing.');

// The separate Cleric kit has its own complete race-fit/pose/buffer checks.
await import('./check-cleric-assets.mjs');
