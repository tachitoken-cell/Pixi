import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { TargetInfo } from './targeting';
import type { TreasureMapProgress } from './treasure-maps';

/** The existing Blender chest is shared with dungeon treasure. */
export function createTreasureMapMarker(scene:THREE.Scene) {
  const mesh=new THREE.Group();mesh.name='treasure-map-site';mesh.visible=false;scene.add(mesh);
  const earth=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.2,.14,7),new THREE.MeshStandardMaterial({color:0x645039,roughness:1}));
  earth.position.y=.05;mesh.add(earth);
  const ring=new THREE.Mesh(new THREE.RingGeometry(1.25,1.34,24),new THREE.MeshBasicMaterial({color:0xe2bc67,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.14;mesh.add(ring);
  let chest:THREE.Object3D|undefined,loading=false,retryAt=0;
  function load(){
    if(chest||loading||Date.now()<retryAt)return;loading=true;
    void new GLTFLoader().loadAsync('/models/rootvault-kit.glb').then(asset=>{
      const source=asset.scene.getObjectByName('rootvault-chest');if(!source)throw new Error('Treasure chest unavailable');
      chest=source;chest.position.set(0,0,0);chest.rotation.set(0,0,0);mesh.add(chest);
    }).catch(()=>{retryAt=Date.now()+15000;}).finally(()=>{loading=false;});
  }
  return {
    mesh,
    clear(){mesh.visible=false;delete mesh.userData.targetId;},
    update(target:TargetInfo|undefined,stage:TreasureMapProgress['stage']|undefined,height:(x:number,z:number)=>number){
      mesh.visible=!!target;if(!target)return;
      mesh.userData.targetId=target.id;mesh.position.set(target.x,height(target.x,target.z),target.z);
      earth.visible=stage==='search'||!chest;ring.visible=stage!=='guardian'||!chest;
      if(stage!=='search')load();
      if(chest)chest.visible=stage!=='search';
    },
  };
}
