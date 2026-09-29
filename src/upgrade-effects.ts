import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterClass } from './shared.ts';
import { groundDeathPose } from './death-animation.ts';
import { configureAuthoredMaterials } from './authored-materials.ts';

export type UpgradeOutcome='success'|'fail'|'break';
type PartPose={r:number[][];t:number[][]};
type Pose={duration:number;parts:Record<string,PartPose>};
let loaded:Promise<void>|undefined,poses:Record<string,Record<string,Pose>>;
const models=new Map<string,THREE.Object3D>(),clips=new Map<string,THREE.AnimationClip>();
const motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),rotation=new THREE.Quaternion(),nextRotation=new THREE.Quaternion(),offset=new THREE.Vector3();
let pending:{id:string;className:CharacterClass;started:number;outcome?:UpgradeOutcome;outcomeAt?:number;avatar?:THREE.Group;model?:THREE.Object3D;mixer?:THREE.AnimationMixer;stage?:string;legs?:[THREE.Object3D,THREE.Vector3][]}|undefined;
function load():Promise<void>{
  return loaded??=Promise.all([new GLTFLoader().loadAsync('/models/benji-upgrades.glb'),fetch('/animations/benji-upgrade-poses.json').then(r=>{if(!r.ok)throw Error('Upgrade motion unavailable');return r.json();})]).then(([asset,data])=>{
    configureAuthoredMaterials(asset.scene);
    for(const outcome of ['channel','success','fail','break']){
      const model=asset.scene.getObjectByName(`upgrade-${outcome}`),clip=asset.animations.find(clip=>clip.name===`upgrade-${outcome}-sp_upgrade_${outcome}`);
      if(!model||!clip)throw Error(`Missing upgrade effect: ${outcome}`);
      models.set(outcome,model);clips.set(outcome,clip);
    }
    poses=data;
  }).catch(error=>{loaded=undefined;throw error;});
}
export function cancelUpgradeEffect(id?:string):void{if(id!==undefined&&pending?.id!==id)return;for(const [leg,position] of pending?.legs??[])leg.position.copy(position);pending?.model?.removeFromParent();pending?.mixer?.stopAllAction();pending=undefined;}
export function startUpgradeEffect(className:CharacterClass,id:string):boolean{
  if(pending)return false;
  pending={id,className,started:performance.now()};
  void load().catch(()=>cancelUpgradeEffect(id));
  return true;
}
/** Called only for the realm's successfully persisted result. */
export function finishUpgradeEffect(outcome:UpgradeOutcome,id:string):void{
  if(pending?.id===id&&!pending.outcome){pending.outcome=outcome;pending.outcomeAt=Math.max(pending.started+2000,performance.now());}
}
export function animateUpgradeEffect(avatar:THREE.Group,available:boolean,now=performance.now()):void{
  const state=pending;if(!state)return;
  if(!available||now-state.started>30000){cancelUpgradeEffect();return;}
  if(!poses)return;
  const stage=state.outcome&&now>=state.outcomeAt!?state.outcome:'channel',pose=poses[state.className.toLowerCase()][stage];
  const elapsed=stage==='channel'?((now-state.started)/1000)%pose.duration:(now-state.outcomeAt!)/1000;
  if(stage!=='channel'&&elapsed>=pose.duration){cancelUpgradeEffect();return;}
  if(motion?.matches)return;
  if(state.avatar!==avatar){
    for(const [leg,position] of state.legs??[])leg.position.copy(position);
    state.legs=undefined;state.avatar=avatar;
  }
  if(state.stage!==stage||state.model?.parent!==avatar){
    state.model?.removeFromParent();state.mixer?.stopAllAction();state.model=models.get(stage)!.clone(true);avatar.add(state.model);
    state.mixer=new THREE.AnimationMixer(state.model);state.mixer.clipAction(clips.get(stage)!).setLoop(THREE.LoopOnce,1).play();state.stage=stage;
  }
  state.mixer!.setTime(elapsed);
  const rig=avatar.userData.rig;if(!rig)return;
  const parts:Record<string,THREE.Object3D>={body:rig.body,head:rig.head,'left-arm':rig.leftArm,'right-arm':rig.rightArm,'left-leg':rig.leftLeg,'right-leg':rig.rightLeg,cape:rig.cape};
  state.legs??=[[rig.leftLeg,rig.leftLeg.position.clone()],[rig.rightLeg,rig.rightLeg.position.clone()]];
  for(const gear of rig.classGear)gear.visible=false;
  const weight=Math.min(1,(now-state.started)/180,stage==='channel'?1:(pose.duration-elapsed)/.18);
  const sampleRotation=(track:PartPose)=>{
    const frame=elapsed/pose.duration*(track.r.length-1),index=Math.floor(frame);
    return new THREE.Quaternion().fromArray(track.r[index]).slerp(new THREE.Quaternion().fromArray(track.r[Math.min(index+1,track.r.length-1)]),frame-index);
  };
  const sampleOffset=(track:PartPose)=>{
    const frame=elapsed/pose.duration*(track.t.length-1),index=Math.floor(frame);
    return new THREE.Vector3().fromArray(track.t[index]).lerp(new THREE.Vector3().fromArray(track.t[Math.min(index+1,track.t.length-1)]),frame-index);
  };
  const rootRotation=sampleRotation(pose.parts.root),rootOffset=sampleOffset(pose.parts.root);
  for(const [name,track] of Object.entries(pose.parts)){
    const part=parts[name];if(!part)continue;
    const frame=elapsed/pose.duration*(track.r.length-1),index=Math.floor(frame),fraction=frame-index;
    rotation.fromArray(track.r[index]).slerp(nextRotation.fromArray(track.r[Math.min(index+1,track.r.length-1)]),fraction);
    if(name==='body')rotation.premultiply(rootRotation);
    if(name==='left-leg'||name==='right-leg')rotation.premultiply(rootRotation).premultiply(rig.body.quaternion.clone().invert());
    part.quaternion.slerp(rotation,weight);
    if(name==='body'){
      const frame=elapsed/pose.duration*(track.t.length-1),index=Math.floor(frame);
      offset.fromArray(track.t[index]).lerp(new THREE.Vector3().fromArray(track.t[Math.min(index+1,track.t.length-1)]),frame-index);
      part.position.addScaledVector(offset.add(rootOffset),weight);
      // The live rig pivots at the feet; the authored body pivots at the hips.
      offset.set(0,.86,0).applyQuaternion(part.quaternion);part.position.add(new THREE.Vector3(0,.86,0).sub(offset));
    }else if(name==='left-leg'||name==='right-leg'){
      const rest=state.legs.find(([leg])=>leg===part)![1];
      offset.copy(rest).add(sampleOffset(track)).applyQuaternion(rootRotation).add(rootOffset).sub(rig.body.position).applyQuaternion(rig.body.quaternion.clone().invert());
      part.position.copy(rest).lerp(offset,weight);
    }
  }
  if(stage==='fail'||stage==='break'){state.model!.visible=false;groundDeathPose(avatar,rig.body);state.model!.visible=true;}
}
