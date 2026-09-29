import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY_LAYOUTS } from '../src/city.ts';
import { createCityModels } from '../src/city-models.ts';
import { graphics } from '../src/graphics-settings.ts';
import { groundHeight } from '../src/landscape.ts';

async function load(name) {
  const bytes=await readFile(new URL(`../public/models/${name}.glb`,import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const [biomes,kit,furniture]=await Promise.all(['town-biomes','city-kit','city-furnishings'].map(load));
const zones=CITY_LAYOUTS.slice(1).map(city=>city.zone),kinds=['landmark','tree','planter','statue'];
assert.deepEqual(biomes.scene.children.map(root=>root.name).sort(),zones.flatMap(zone=>kinds.map(kind=>`town-${zone}-${kind}`)).sort());
assert.deepEqual(biomes.animations.map(clip=>clip.name).sort(),zones.map(zone=>`town-${zone}-ambient`).sort());
assert((await stat(new URL('../public/models/town-biomes.glb',import.meta.url))).size<2_000_000,'bounded shared asset download');
assert((await stat(new URL('../assets/source/town-biomes.blend',import.meta.url))).size>10_000,'editable Blender source retained');
let triangles=0;
const point=new THREE.Vector3(),limits={landmark:[6,6],tree:[3,3],planter:[2.4,1.2],statue:[2.8,2.8]};
for(const root of biomes.scene.children){
  assert.deepEqual(root.position.toArray(),[0,0,0],`${root.name}: ground-origin placement`);
  root.updateMatrixWorld(true);
  const kind=root.name.split('-').at(-1),[width,depth]=limits[kind];
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const positions=mesh.geometry.attributes.position;
    triangles+=(mesh.geometry.index?.count??positions.count)/3;
    assert(positions.array.every(Number.isFinite),`${mesh.name}: finite exported geometry`);
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
      assert(point.y>=-.001,`${mesh.name}: no geometry below the ground`);
      if(point.y>2.3)continue;
      assert(Math.abs(point.x)<=width/2+.001&&Math.abs(point.z)<=depth/2+.001,`${mesh.name}: body-height detail fits the existing collider`);
    }
  });
}
assert(triangles<50_000,'unique town decoration geometry remains bounded');
// Sample the exported motion itself; rotating mesh AABBs overestimate these thin ornaments.
for(const zone of zones){
  const root=biomes.scene.getObjectByName(`town-${zone}-landmark`).clone(true),clip=biomes.animations.find(clip=>clip.name===`town-${zone}-ambient`);
  assert(Math.abs(clip.duration-8)<.01,`${zone}: an eight-second loop`);
  const mixer=new THREE.AnimationMixer(root);mixer.clipAction(clip).play();mixer.setTime(0);root.updateMatrixWorld(true);
  const cameraBounds=new THREE.Box3().setFromObject(root).expandByScalar(.35);
  const rest=[];root.traverse(node=>rest.push({node,position:node.position.clone(),rotation:node.quaternion.clone(),scale:node.scale.clone()}));
  for(let sample=0;sample<=64;sample++){
    mixer.setTime(sample/8);root.updateMatrixWorld(true);
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        point.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
        assert(cameraBounds.containsPoint(point),`${zone}: camera bound covers the entire loop`);
        if(point.y<=2.3)assert(Math.abs(point.x)<=3.001&&Math.abs(point.z)<=3.001,`${zone}: moving detail stays inside the existing solid`);
      }
    });
  }
  mixer.setTime(clip.duration-1/60);
  for(const pose of rest)assert(pose.node.position.distanceTo(pose.position)<.08&&pose.node.quaternion.angleTo(pose.rotation)<.08&&pose.node.scale.distanceTo(pose.scale)<.04,`${zone}: animation rejoins the start without a visible jump`);
  mixer.stopAllAction();mixer.uncacheRoot(root);
}
const snapshot=root=>{const result=[];root.traverse(node=>{result.push(...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray());});return result;};
const effects=graphics.effects;
try{
  graphics.effects='high';
  for(const city of CITY_LAYOUTS){
    const models=createCityModels(kit.scene,furniture.scene,city,biomes);
    const landmark=models.root.getObjectByName(`town-${city.zone}-landmark`);
    if(city.zone==='greenwood')assert(!landmark,'Greenwood keeps its original town');
    else{
      assert(landmark,`${city.name}: unique landmark is in the real city renderer`);
      assert.equal(landmark.position.x,city.x+34);assert.equal(landmark.position.z,city.z+24);
      assert(Math.abs(landmark.position.y-groundHeight(landmark.position.x,landmark.position.z))<.15,'landmark rests on the existing fountain foundation');
      const target=new THREE.Vector3(landmark.position.x,landmark.position.y+2,landmark.position.z+10),camera=target.clone().add(new THREE.Vector3(0,0,-20));
      models.constrainCamera(target,camera);
      assert(camera.z>landmark.position.z,`${city.name}: camera stops in front of the tall landmark`);
      const observer={x:landmark.position.x,z:landmark.position.z+6};models.update(observer);
      const start=snapshot(landmark);
      for(let frame=0;frame<120;frame++)models.animate(frame/60,observer);
      assert.notDeepEqual(snapshot(landmark),start,`${city.name}: authored animation moves in-game`);
      assert.equal(landmark.position.x,city.x+34);assert.equal(landmark.position.z,city.z+24);
      assert(landmark.position.y>=groundHeight(landmark.position.x,landmark.position.z),'animation cannot move the landmark off its foundation');
      const paused=snapshot(landmark);graphics.effects='off';
      for(let frame=120;frame<180;frame++)models.animate(frame/60,observer);
      assert.deepEqual(snapshot(landmark),paused,'Effects Off pauses cosmetic animation');graphics.effects='high';
      models.update({x:20000,z:20000});models.animate(10,{x:20000,z:20000});
      assert(!models.root.visible);assert.deepEqual(snapshot(landmark),paused,'distant towns perform no landmark animation');
      models.update(observer);
      for(let frame=600;frame<660;frame++)models.animate(frame/60,observer);
      assert.notDeepEqual(snapshot(landmark),paused,'returning to the town resumes the loop');
      assert(snapshot(landmark).every(Number.isFinite),'animation transforms stay finite');
    }
    models.dispose();models.dispose();
  }
}finally{graphics.effects=effects;}
console.log(`PASS: five distinct Blender town kits, five live animation loops, ${triangles} shared triangles, unchanged placement footprints, Effects Off and distance culling.`);
