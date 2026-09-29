import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setTreasureAssets } from './monster-models.ts';
import type { Enemy } from './shared';
let assets:ReturnType<GLTFLoader['loadAsync']>|undefined;
export function loadTreasureAssets() {
  return assets??=new GLTFLoader().loadAsync('/models/treasure-goblin.glb').then(gltf=>{setTreasureAssets(gltf.scene,gltf.animations);return gltf;});
}
export function createTreasureEffects(scene:THREE.Scene) {
  let source:THREE.Object3D|undefined;
  const portals=new Map<string,{mesh:THREE.Object3D;lastSeen:number}>();
  void loadTreasureAssets().then(gltf=>{source=gltf.scene.getObjectByName('goblinPortal');}).catch(()=>{});
  return {
    clear(){for(const entry of portals.values())scene.remove(entry.mesh);portals.clear();},
    update(enemies:Enemy[],now:number,height:(x:number,z:number)=>number) {
      if(!source)return;
      for(const enemy of enemies){
        if(!enemy.alive||!enemy.treasure?.portalAt||now<enemy.treasure.portalAt)continue;
        let entry=portals.get(enemy.id);
        if(!entry){const mesh=source.clone(true);mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);scene.add(mesh);entry={mesh,lastSeen:now};portals.set(enemy.id,entry);}
        entry.lastSeen=now;
        entry.mesh.position.set(enemy.x,height(enemy.x,enemy.z),enemy.z);
        entry.mesh.rotation.y=enemy.rotation;
        const swirl=entry.mesh.getObjectByName('goblinPortal-swirl');if(swirl)swirl.rotation.z=now/1100;
        const scale=Math.min(1,(now-enemy.treasure.portalAt)/450);
        entry.mesh.scale.setScalar(scale*(1+Math.sin(now/140)*.035));
      }
      for(const [id,entry] of portals){
        const age=now-entry.lastSeen;
        if(age>600){scene.remove(entry.mesh);portals.delete(id);}
        else if(age>0)entry.mesh.scale.setScalar(Math.max(0,1-age/600));
      }
    },
  };
}
