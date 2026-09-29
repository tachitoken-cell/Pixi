import * as THREE from 'three';
import { TRAINING_PROPS, TRAINING_PRACTICE } from './training-grounds-data.ts';
import { DEFAULT_APPEARANCE } from './appearance.ts';
import { makeCharacter, animateCharacter, type CharacterAttack } from './characters.ts';
import { starterGear } from './progression.ts';
import { buildingFloorHeight } from './buildings.ts';
import { createCombatEffects, type CombatAbility } from './combat-effects.ts';
import { combatTiming } from './combat-timing.ts';
import type { CharacterClass } from './shared.ts';
import type { WorldCitizen } from './world.ts';

type Point = { x:number; z:number };
const CULL_DISTANCE = 100;
const routines:Record<CharacterClass,{period:number;ability:CombatAbility;release:number;end:number}> = {
  Knight:{period:3.6,ability:'strike',release:.75,end:1.15},
  Ranger:{period:4.8,ability:'arrow',release:1.55,end:2.30},
  Mage:{period:4.8,ability:'arcane-missile',release:1.65,end:2.45},
  Cleric:{period:5.6,ability:'heal',release:1.65,end:3.05},
};

/** A render-only practice loop. It never calls gameplay actions or awards progress. */
export function createTrainingGrounds(asset:THREE.Group) {
  const root=new THREE.Group();root.name='Lanternreach training grounds';root.userData.cosmetic=true;
  const citizens=new Map<string,WorldCitizen>();
  const propGeometries=new Set<THREE.BufferGeometry>(),propMaterials=new Set<THREE.Material>();
  const props=new Map<string,{mesh:THREE.Group;aim?:THREE.Object3D;bladeContact?:THREE.Object3D;moving?:THREE.Object3D;rest?:THREE.Vector3;rotation?:THREE.Euler;kind:string}>();
  for(const placement of TRAINING_PROPS){
    const template=asset.getObjectByName(`training-${placement.kind}`);if(!template)throw new Error(`Missing training prop: training-${placement.kind}`);
    const mesh=template.clone(true) as THREE.Group;mesh.name=placement.id;mesh.position.set(placement.x,buildingFloorHeight(placement.x,placement.z),placement.z);mesh.rotation.y=placement.rotation;mesh.userData.cosmetic=true;
    mesh.traverse(node=>{if(node instanceof THREE.Mesh){node.castShadow=node.receiveShadow=true;propGeometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])propMaterials.add(material);}});root.add(mesh);
    const moving=mesh.getObjectByName(placement.kind==='dummy'?'training-dummy-strike':'training-arcane-target-crystal');
    let aim:THREE.Object3D|undefined;const local=template.userData.aimPoint as readonly[number,number,number]|undefined;
    if(local){aim=new THREE.Object3D();aim.name=`${placement.id}-contact`;aim.position.fromArray(local);if(moving){aim.position.sub(moving.position);moving.add(aim);}else mesh.add(aim);}
    // The solved sword meets the dummy's right torso edge, rather than its chest centre.
    let bladeContact:THREE.Object3D|undefined;
    if(placement.kind==='dummy'&&moving){bladeContact=new THREE.Object3D();bladeContact.name=`${placement.id}-blade-contact`;bladeContact.position.set(.55,1.4,.296).sub(moving.position);moving.add(bladeContact);}
    props.set(placement.id,{mesh,aim,bladeContact,moving,rest:moving?.position.clone(),rotation:moving?.rotation.clone(),kind:placement.kind});
  }
  // Four shallow, disjoint practice surfaces sit above grass and below existing road pavers.
  const floorGeometry=new THREE.BoxGeometry(1,.016,1),floorMaterial=new THREE.MeshStandardMaterial({roughness:1});
  const floors=new THREE.InstancedMesh(floorGeometry,floorMaterial,4);floors.name='Training sand and paving';floors.receiveShadow=true;
  const patches=[[-40.1,-25.2,6.5,4.8,0xc7b67e],[-40.25,-9.5,6.3,8,0xbbaa78],[-8,-39.5,8,8,0xb3beb2],[-31,-38.3,5.2,7.5,0xc1c5ad]],pose=new THREE.Object3D();
  patches.forEach(([x,z,w,d,color],index)=>{pose.position.set(x,buildingFloorHeight(x,z)+.01,z);pose.scale.set(w,1,d);pose.updateMatrix();floors.setMatrixAt(index,pose.matrix);floors.setColorAt(index,new THREE.Color(color));});root.add(floors);

  const colors:Record<CharacterClass,[string,string]>={Knight:['#627789','#c6b27b'],Ranger:['#527c50','#d2ad6b'],Mage:['#65528d','#bcb4ed'],Cleric:['#ece2bd','#659f91']};
  const actors=TRAINING_PRACTICE.map((practice,index)=>{
    const [outfit,accent]=colors[practice.className],second=index%2===1;
    const mesh=makeCharacter({...DEFAULT_APPEARANCE,className:practice.className,outfit,accent,gender:second?'female':'male',hair:second?'#a77445':'#473426',hairStyle:second?'braids':'swept',face:second?'freckles':'calm'},starterGear(practice.className).equipment);
    mesh.name=practice.id;mesh.position.set(practice.x,buildingFloorHeight(practice.x,practice.z)+.018,practice.z);mesh.userData.cosmetic=true;
    mesh.userData.collision='actor';
    mesh.userData.practice={className:practice.className,targetId:practice.targetId,phase:0,stage:'idle',contactAt:0};
    citizens.set(practice.id,{name:practice.name,title:practice.title,mesh});root.add(mesh);
    return {practice,mesh,routine:routines[practice.className],cycle:NaN,point:new THREE.Vector3(),origin:new THREE.Vector3(),impact:0};
  });
  const actorById=new Map(actors.map(actor=>[actor.practice.id,actor]));
  const clerics=actors.filter(actor=>actor.practice.className==='Cleric');
  for(const actor of actors){
    const companion=actor.practice.className==='Cleric'?clerics.find(other=>other!==actor):undefined;
    const target=companion?.mesh.position??props.get(actor.practice.targetId)?.mesh.position;if(!target)throw new Error(`Missing practice target: ${actor.practice.targetId}`);
    actor.mesh.rotation.y=Math.atan2(target.x-actor.practice.x,target.z-actor.practice.z);
    if(companion)actor.mesh.userData.practice.targetId=companion.practice.id;
  }
  const fxScene=new THREE.Scene();fxScene.name='Training projectiles and spell impacts';root.add(fxScene);
  fxScene.userData.collision='effect';
  function origin(id:string,_ability:CombatAbility,out:THREE.Vector3){
    const rig=actorById.get(id)?.mesh.userData.rig;if(!rig)return false;
    if(rig.bow){out.set(0,0,-.31-.38+.42);rig.bow.pivot.localToWorld(out);return true;}
    rig.leftHand.getWorldPosition(out);return true;
  }
  function targetPoint(id:string){
    const actor=actorById.get(id);if(actor)return actor.point.set(actor.mesh.position.x,actor.mesh.position.y+1.3,actor.mesh.position.z);
    const target=props.get(id);return target?.aim?.getWorldPosition(contact);
  }
  const contact=new THREE.Vector3(),from=new THREE.Vector3(),to=new THREE.Vector3();
  const effects=createCombatEffects(fxScene,id=>targetPoint(id),buildingFloorHeight,origin);
  const sparkleGeometry=new THREE.BoxGeometry(1,1,1),sparkleMaterial=new THREE.MeshBasicMaterial();
  const sparkles=new THREE.InstancedMesh(sparkleGeometry,sparkleMaterial,256);sparkles.name='Training healing streams and contact rings';sparkles.count=0;sparkles.frustumCulled=false;sparkles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);sparkles.raycast=()=>{};root.add(sparkles);
  const green=new THREE.Color('#a0efbb'),gold=new THREE.Color('#ffe49a'),violet=new THREE.Color('#c6a4ff'),straw=new THREE.Color('#e7cf95');let sparkleCount=0;
  function spark(x:number,y:number,z:number,size:number,color:THREE.Color){if(sparkleCount>=256)return;pose.position.set(x,y,z);pose.rotation.set(0,0,0);pose.scale.setScalar(size);pose.updateMatrix();sparkles.setMatrixAt(sparkleCount,pose.matrix);sparkles.setColorAt(sparkleCount++,color);}
  let disposed=false,lastTime=-Infinity;
  root.userData.practiceCount=actors.length;root.userData.targetCount=Array.from(props.values()).filter(prop=>prop.aim).length;
  function update(time:number,observer?:Point){
    if(disposed||!Number.isFinite(time))return;
    if(time<lastTime){effects.clear();for(const actor of actors)actor.cycle=NaN;}lastTime=time;
    let nearby=0;sparkleCount=0;
    for(const prop of props.values()){
      prop.mesh.visible=root.visible&&(!observer||Math.hypot(observer.x-prop.mesh.position.x,observer.z-prop.mesh.position.z)<CULL_DISTANCE);
      if(prop.moving&&prop.rest&&prop.rotation){prop.moving.position.copy(prop.rest);prop.moving.rotation.copy(prop.rotation);if(prop.kind==='arcane-target'&&prop.mesh.visible){prop.moving.position.y+=Math.sin(time*1.6+prop.mesh.position.x)*.055;prop.moving.rotation.y+=time*.28;}}
    }
    floors.visible=root.visible&&(!observer||patches.some(([x,z])=>Math.hypot(observer.x-x,observer.z-z)<CULL_DISTANCE));
    for(const actor of actors){
      const {mesh,practice,routine}=actor;mesh.visible=root.visible&&(!observer||Math.hypot(observer.x-practice.x,observer.z-practice.z)<CULL_DISTANCE);
      if(!mesh.visible){actor.cycle=NaN;continue;}nearby++;
      const phase=((time+practice.phase)%routine.period+routine.period)%routine.period,cycle=Math.floor((time+practice.phase)/routine.period),state=mesh.userData.practice;
      state.phase=phase;let attack:CharacterAttack|false=false;
      if(practice.className==='Knight'){
        const age=phase-(routine.release-.3);if(age>0&&age<.7)attack={ability:routine.ability,basic:true,progress:age/.7};
      }else if(phase>.35&&phase<routine.end){
        const before=phase<routine.release,peak=practice.className==='Ranger'?.26:.30;
        attack={ability:routine.ability,progress:before?Math.max(.001,(phase-.35)/(routine.release-.35)*peak):peak+(phase-routine.release)/(routine.end-routine.release)*(1-peak)};
      }
      animateCharacter(mesh,time,false,attack);mesh.updateMatrixWorld(true);
      const aim=targetPoint(state.targetId);if(!aim)continue;actor.point.copy(aim);
      const timing=combatTiming(routine.ability,Math.hypot(aim.x-practice.x,aim.z-practice.z));
      const eventAt=practice.className==='Knight'?routine.release:practice.className==='Cleric'?routine.release+.45:routine.release-timing.delay;
      const impact=practice.className==='Knight'?routine.release:practice.className==='Cleric'?eventAt:routine.release+timing.flight;
      actor.impact=impact;state.contactAt=impact;state.stage=phase<.35||phase>Math.max(routine.end,impact+.7)?'idle':phase<routine.release?'prepare':phase<impact?'release':'impact';
      if(practice.className!=='Knight'&&phase>=eventAt&&phase<impact+.7&&actor.cycle!==cycle){
        effects.play({ability:routine.ability,playerId:practice.id,from:mesh.position,rotation:mesh.rotation.y,targets:[{id:state.targetId,x:aim.x,z:aim.z}]},time-(phase-eventAt));actor.cycle=cycle;
      }
      const hitAge=phase-impact;
      if(practice.className==='Knight'&&hitAge>=0&&hitAge<.72){
        const dummy=props.get(practice.targetId);if(dummy?.moving&&dummy.rotation)dummy.moving.rotation.z=dummy.rotation.z+Math.sin(hitAge*18)*.11*Math.exp(-hitAge*4);
        dummy?.bladeContact?.getWorldPosition(contact);
        for(let i=0;i<7;i++){const a=i*2.399;const radius=hitAge*.7;spark(contact.x+Math.cos(a)*radius,contact.y+Math.sin(a)*radius-hitAge*.2,contact.z,.075*(1-hitAge/.72),straw);}
      }
      if(practice.className==='Mage'&&hitAge>=0&&hitAge<.6){
        const radius=.15+hitAge*1.25;for(let i=0;i<24;i++){const a=i/24*Math.PI*2;spark(aim.x+Math.cos(a)*radius,aim.y+Math.sin(a)*radius,aim.z+.08,.075*(1-hitAge/.6),i%3?violet:gold);}
      }
      if(practice.className==='Cleric'&&phase>=routine.release&&phase<impact+.6){
        origin(practice.id,routine.ability,from);to.copy(aim);const age=phase-routine.release;
        for(let i=0;i<24;i++){const u=age/.55-i*.025;if(u<0||u>1)continue;const wobble=Math.sin(u*Math.PI)*.13,a=i*1.7+time*4;spark(from.x+(to.x-from.x)*u+Math.cos(a)*wobble,from.y+(to.y-from.y)*u+Math.sin(u*Math.PI)*.3+Math.sin(a)*wobble,from.z+(to.z-from.z)*u,.075,i%3?green:gold);}
      }
    }
    fxScene.visible=root.visible&&nearby>0;effects.update(time);
    sparkles.count=sparkleCount;sparkles.visible=root.visible&&sparkleCount>0;sparkles.instanceMatrix.needsUpdate=true;if(sparkles.instanceColor)sparkles.instanceColor.needsUpdate=true;
    root.userData.visiblePracticeCount=nearby;root.userData.phaseTime=time;
  }
  update(0);
  return {root,citizens,update,dispose(){
    if(disposed)return;disposed=true;effects.clear();root.removeFromParent();
    for(const actor of actors){actor.mesh.visible=false;actor.mesh.traverse(node=>{if(node instanceof THREE.InstancedMesh)node.dispose();});}
    for(const geometry of propGeometries)geometry.dispose();for(const material of propMaterials)material.dispose();
    floors.dispose();floorGeometry.dispose();floorMaterial.dispose();sparkles.dispose();sparkleGeometry.dispose();sparkleMaterial.dispose();citizens.clear();props.clear();root.clear();
  }};
}
