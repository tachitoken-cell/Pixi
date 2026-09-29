import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ZEPPELIN_PORTS, zeppelinPose, type ZeppelinFlight } from './zeppelin';

export async function createZeppelins(scene:THREE.Scene) {
  const {scene:asset}=await new GLTFLoader().loadAsync('/models/zeppelin-kit.glb');
  const ship=asset.getObjectByName('zeppelin'),dock=asset.getObjectByName('zeppelin-dock');
  if(!ship||!dock)throw new Error('Zeppelin kit is missing its ship or dock.');
  for(const side of ['port','starboard']){
    const propeller=ship.getObjectByName(`zeppelin-propeller-${side}`);
    if(propeller){propeller.userData.collision='effect';propeller.userData.collisionReason='Spinning visual propeller; ship hull and dock remain solid.';}
  }
  const root=new THREE.Group();root.name='Intercity zeppelins';scene.add(root);
  root.userData.collision='solid';
  const docks=new Map<string,THREE.Object3D>(),parked=new Map<string,THREE.Object3D>(),flights=new Map<string,THREE.Object3D>();
  for(const port of ZEPPELIN_PORTS){
    const berth=dock.clone(true),craft=ship.clone(true);
    berth.position.set(port.x,port.y,port.z);craft.position.set(port.x,port.y+1.3,port.z+12);
    berth.userData.targetId=`zeppelin-${port.id}`;
    docks.set(port.id,berth);parked.set(port.id,craft);root.add(berth,craft);
  }
  const animate=(craft:THREE.Object3D,time:number)=>{
    for(const side of ['port','starboard']){const propeller=craft.getObjectByName(`zeppelin-propeller-${side}`);if(propeller)propeller.rotation.z=time*.018;}
  };
  return {root,docks,update(now:number,observer:{x:number;z:number},passengers:readonly {id:string;zeppelin?:ZeppelinFlight|null}[],visible=true){
    root.visible=visible;if(!visible)return;
    const active=passengers.filter(p=>p.zeppelin),ids=new Set(active.map(p=>p.id));
    for(const [id,craft] of flights)if(!ids.has(id)){craft.removeFromParent();flights.delete(id);}
    for(const port of ZEPPELIN_PORTS){
      const craft=parked.get(port.id)!;
      docks.get(port.id)!.visible=Math.hypot(port.x-observer.x,port.z-observer.z)<230;
      craft.visible=docks.get(port.id)!.visible&&!active.some(p=>{const pose=zeppelinPose(p.zeppelin!,now);return Math.hypot(pose.x-port.x,pose.z-port.z-12)<36&&pose.y<port.y+35;});
      if(craft.visible)animate(craft,now*.15);
    }
    for(const passenger of active){
      let craft=flights.get(passenger.id);
      if(!craft){craft=ship.clone(true);craft.name=`Zeppelin carrying ${passenger.id}`;flights.set(passenger.id,craft);root.add(craft);}
      const pose=zeppelinPose(passenger.zeppelin!,now);
      craft.position.set(pose.x,pose.y,pose.z);craft.rotation.y=pose.rotation;
      craft.visible=Math.hypot(pose.x-observer.x,pose.z-observer.z)<300;
      if(craft.visible)animate(craft,now);
    }
  },dispose(){
    root.removeFromParent();root.clear();docks.clear();parked.clear();flights.clear();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    asset.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of [object.material].flat())materials.add(material);}});
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
  }};
}
