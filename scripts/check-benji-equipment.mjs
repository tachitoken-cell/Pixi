import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {setArsenalAssets,arsenalWeapon,animateArsenalWeapon}=await import('../src/arsenal.ts');
const {GEAR,rollGear,starterGear,gearUpgradeQuote,MAX_GEAR_UPGRADE,MAX_LEVEL}=await import('../src/progression.ts');
const {makeCharacter,animateCharacter}=await import('../src/characters.ts');
const {DEFAULT_APPEARANCE}=await import('../src/appearance.ts');
const {newRaidProgress}=await import('../src/raid-progression.ts');
const load=async name=>{const b=readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const asset=await load('benji-arsenal');setArsenalAssets(asset.scene,asset.animations);
assert.equal(MAX_GEAR_UPGRADE,5);assert.equal(MAX_LEVEL,60);assert(!asset.scene.getObjectByName('mythic-knight-weapon_plus9'),'held +9 artwork is not shipped');
let variants=0;
for(const quality of ['epic','mythic'])for(const className of ['Knight','Ranger','Mage','Cleric'])for(const upgradeLevel of [0,5]){
 const base=Object.values(GEAR).find(g=>g.className===className&&g.slot==='weapon'&&g.requiredLevel===50);let item=rollGear(base.id,quality,()=>.5);
 for(let rank=0;rank<upgradeLevel;rank++)item=gearUpgradeQuote(item.id).next;
 const source=arsenalWeapon(item);assert(source);const model=source.clone(true);assert.equal(model.userData.arsenal.upgrade,upgradeLevel);
 model.traverse(node=>{if(node instanceof THREE.Mesh){assert(node.material.vertexColors);assert.equal(node.geometry.getAttribute('color').itemSize,3);assert.deepEqual(node.material.color.toArray(),[1,1,1],'authored vertex palette is not overwritten by rarity tint');}});
 for(const t of [0,.5,1,1.5,2]){animateArsenalWeapon(model,t);model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model);assert(!box.isEmpty());assert([...box.min,...box.max].every(Number.isFinite));assert(box.getSize(new THREE.Vector3()).length()<6,'weapon remains wearable');}
 assert.deepEqual(source.position.toArray(),[0,0,0]);variants++;
 const card={id:'saved-sp',className,jobXp:12000,upgrade:15,broken:false,sealed:false,attempts:25,source:'quest'};
 const progress={...newRaidProgress(),specialists:[card],activeSpecialistId:card.id};
 const character=makeCharacter({...DEFAULT_APPEARANCE,className},{...starterGear(className).equipment,weapon:item.id},progress);animateCharacter(character,1,false);
 assert.equal(character.getObjectByName('equipment-weapon').userData.arsenal.upgrade,upgradeLevel,'real equipped identity selects its correct visual tier');
 assert(!character.getObjectByName('raid-wings'),'saved SP card cannot display specialist wings');
}
const fx=await load('benji-upgrades'),poses=JSON.parse(readFileSync(new URL('../public/animations/benji-upgrade-poses.json',import.meta.url)));
for(const outcome of ['channel','success','fail','break']){
 const model=fx.scene.getObjectByName(`upgrade-${outcome}`),clip=fx.animations.find(c=>c.name===`upgrade-${outcome}-sp_upgrade_${outcome}`);assert(model&&clip);
 const names=[];model.traverse(node=>names.push(node.userData.sourceName));assert(!names.some(n=>n?.startsWith('rig-')),'effect bundle contains no SP1 mannequin');
 const mixer=new THREE.AnimationMixer(model);mixer.clipAction(clip).setLoop(THREE.LoopOnce,1).play();
 for(const fraction of [.1,.5,.9]){mixer.setTime(clip.duration*fraction);model.updateMatrixWorld(true);model.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite)));}
 for(const cls of ['knight','ranger','mage','cleric']){const pose=poses[cls][outcome];assert(pose.duration>0);for(const part of Object.values(pose.parts))for(const q of part.r)assert(Math.abs(new THREE.Quaternion().fromArray(q).length()-1)<1e-5);}
}
// Exercise the real overlay on live rigs, including rebuilds and delayed realm replies.
const originalLoad=GLTFLoader.prototype.loadAsync,originalFetch=globalThis.fetch,originalPerformance=globalThis.performance;
let clock=0;
GLTFLoader.prototype.loadAsync=async()=>({scene:fx.scene.clone(true),animations:fx.animations});
globalThis.fetch=async()=>({ok:true,json:async()=>poses});globalThis.performance={now:()=>clock};
const {startUpgradeEffect,finishUpgradeEffect,cancelUpgradeEffect,animateUpgradeEffect}=await import('../src/upgrade-effects.ts');
const avatar=className=>makeCharacter({...DEFAULT_APPEARANCE,className},starterGear(className).equipment);
const frame=(character,time,available=true)=>{clock=time;animateCharacter(character,time/1000,false);animateUpgradeEffect(character,available,time);character.updateMatrixWorld(true);character.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite)));};
const visibleMinimum=character=>{
 const inverse=character.matrixWorld.clone().invert(),point=new THREE.Vector3(),instance=new THREE.Matrix4();let minimum=Infinity;
 character.traverseVisible(node=>{if(!(node instanceof THREE.Mesh))return;const positions=node.geometry.getAttribute('position'),matrix=new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld);
  for(let i=0;i<(node instanceof THREE.InstancedMesh?node.count:1);i++){
   const transform=matrix.clone();if(node instanceof THREE.InstancedMesh){node.getMatrixAt(i,instance);transform.multiply(instance);}if(Math.abs(transform.determinant())<1e-12)continue;
   for(let j=0;j<positions.count;j++)minimum=Math.min(minimum,point.fromBufferAttribute(positions,j).applyMatrix4(transform).y);
  }
 });return minimum;
};
try{
 for(const cls of ['Knight','Ranger','Mage','Cleric'])for(const outcome of ['success','fail','break']){
  clock=0;const character=avatar(cls),id=`${cls}-${outcome}`;assert(startUpgradeEffect(cls,id));await new Promise(setImmediate);
  frame(character,250);assert(character.getObjectByName('upgrade-channel'));
  finishUpgradeEffect(outcome,id);frame(character,1900);assert(character.getObjectByName('upgrade-channel'),'results wait for the channel');
  const duration=poses[cls.toLowerCase()][outcome].duration;
  for(const fraction of [.1,.5,.9]){
   frame(character,2000+duration*1000*fraction);const model=character.getObjectByName(`upgrade-${outcome}`);assert(model);
   if(outcome!=='success'){model.visible=false;assert(Math.abs(visibleMinimum(character))<1e-5,`${cls} ${outcome} is grounded`);model.visible=true;}
  }
  const lastReply=clock;finishUpgradeEffect(outcome,id);frame(character,2000+duration*1000+1);assert(!character.getObjectByName(`upgrade-${outcome}`),'duplicate outcomes cannot restart or extend the motion');assert(clock>lastReply);
 }
 clock=0;const first=avatar('Knight'),second=avatar('Knight'),rest=first.userData.rig.leftLeg.position.clone();
 assert(startUpgradeEffect('Knight','old'));frame(first,500);frame(second,600);
 assert(!first.getObjectByName('upgrade-channel'));assert(second.getObjectByName('upgrade-channel'));assert.deepEqual(first.userData.rig.leftLeg.position.toArray(),rest.toArray(),'rebuilding an avatar restores its old leg anchors');
 frame(second,700,false);assert(!second.getObjectByName('upgrade-channel'));
 assert(startUpgradeEffect('Knight','new'));frame(second,900);finishUpgradeEffect('break','old');cancelUpgradeEffect('old');frame(second,3000);
 assert(second.getObjectByName('upgrade-channel'),'old success/error replies cannot finish or cancel a new attempt');
 finishUpgradeEffect('success','new');frame(second,3200);assert(second.getObjectByName('upgrade-success'));cancelUpgradeEffect('new');
 assert(startUpgradeEffect('Knight','timeout'));frame(second,34001);assert(!second.getObjectByName('upgrade-channel'),'unanswered requests have a bounded visual lifetime');
}finally{cancelUpgradeEffect();GLTFLoader.prototype.loadAsync=originalLoad;globalThis.fetch=originalFetch;globalThis.performance=originalPerformance;}
hook.deregister();console.log(`PASS ${variants} authored arsenal variants, all class outcomes and grounded falls, avatar replacement, stale/duplicate replies, bounded interruption, no SP1 mannequins and disabled saved-card wings.`);
