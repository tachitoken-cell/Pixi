import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gearQuality, type Gear } from './progression.ts';
import { configureAuthoredMaterials } from './authored-materials.ts';

const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
let loading:Promise<void>|undefined;
const models=new Map<string,THREE.Object3D>(), clips=new Map<string,THREE.AnimationClip>();
const players=new WeakMap<THREE.Object3D,THREE.AnimationMixer>();
export function setArsenalAssets(scene:THREE.Group,animations:THREE.AnimationClip[]):void {
  configureAuthoredMaterials(scene);
  for(const quality of ['epic','mythic'])for(const cls of ['knight','ranger','mage','cleric'])for(const rank of [0,5]){
    const name=`${quality}-${cls}-weapon_plus${rank}`,model=scene.getObjectByName(name),clip=animations.find(clip=>clip.name===`${name}-idle`);
    if(!model||!clip)throw Error(`Missing arsenal variant: ${name}`);
    model.traverse(node=>{if(node instanceof THREE.Mesh)node.castShadow=node.receiveShadow=true;});
    models.set(name,model);clips.set(name,clip);
  }
}
export function loadArsenalAssets():Promise<void>{
  return loading??=new GLTFLoader().loadAsync('/models/benji-arsenal.glb').then(({scene,animations})=>setArsenalAssets(scene,animations)).catch(error=>{loading=undefined;throw error;});
}
/** Visual rarity tiers keep the item's existing identity, attributes and drop rules. */
export function arsenalWeapon(item:Gear):THREE.Object3D|undefined {
  const quality=gearQuality(item);
  if(item.slot!=='weapon'||!item.className||!['epic','mythic'].includes(quality))return;
  const rank=(item.upgradeLevel??0)>=5?5:0;
  return models.get(`${quality}-${item.className.toLowerCase()}-weapon_plus${rank}`);
}
export function animateArsenalWeapon(model:THREE.Object3D|undefined,time:number):void {
  if(!model?.userData.arsenal||!Number.isFinite(time))return;
  let mixer=players.get(model);
  if(!mixer){
    const item=model.userData.arsenal,clip=clips.get(`${item.rarity}-${item.class}-weapon_plus${item.upgrade}`);
    if(!clip)return;
    mixer=new THREE.AnimationMixer(model);mixer.clipAction(clip).play();players.set(model,mixer);
  }
  mixer.setTime(reducedMotion?.matches?0:time);
}
