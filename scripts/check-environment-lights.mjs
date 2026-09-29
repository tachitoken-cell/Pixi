import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEnvironmentLights, discoverEnvironmentEmitters, ENVIRONMENT_LIGHT_LIMIT, ENVIRONMENT_VISUAL_LIMIT } from '../src/environment-lights.ts';
import { createOverworld, createDungeonWorld, createZone } from '../src/zones.ts';
import { CITY_PROPS, CITY_CLOCKTOWER, BANK_HOME_ID } from '../src/city.ts';
import { BUILDINGS, BUILDING_FLOOR_LIFT, buildingPoint } from '../src/buildings.ts';
import { DUNGEON_LANTERNS } from '../src/dungeon.ts';
import { graphics, GRAPHICS_PRESETS } from '../src/graphics-settings.ts';

Object.assign(graphics, GRAPHICS_PRESETS.high); // Exercise authored lights and particles at their full quality.
const loader=new GLTFLoader();
async function asset(name){const b=readFileSync(`public/models/${name}.glb`);return (await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')).scene;}
const close=(a,b,epsilon=.008)=>assert(a.distanceTo(b)<epsilon,`anchor ${a.toArray()} differs from authored ${b.toArray()}`);
const house=await asset('house-interiors'),city=await asset('city-kit'),village=await asset('village-kit'),vault=await asset('rootvault-kit');
const houseEmitters=discoverEnvironmentEmitters(house),cityEmitters=discoverEnvironmentEmitters(city),villageEmitters=discoverEnvironmentEmitters(village),vaultEmitters=discoverEnvironmentEmitters(vault);
assert.equal(houseEmitters.filter(e=>e.fire).length,4,'one joined hearth per actual house variant, not one emitter per voxel');
assert.equal(houseEmitters.filter(e=>!e.fire).length,8,'two front-door lamps per house variant');
assert.equal(cityEmitters.length,23,'authored city lamps include six hall lamps and exclude brass trim, produce and hay');
const hallLamps=cityEmitters.filter(emitter=>emitter.source.name==='city-clocktower-interior-furniture');
assert.equal(hallLamps.length,6,'the furnished hall has six individually illuminated lamps');
for(const x of [-8.95,8.95])for(const z of [-5.4,1.7,6.5])assert(hallLamps.some(lamp=>lamp.position.distanceTo(new THREE.Vector3(x,4.1,z))<.008),'town hall lighting follows actual wall-lamp glass');
close(cityEmitters.find(e=>e.source.name==='city-lantern-interior-furniture').position,new THREE.Vector3(0,3.45,0));
assert.equal(villageEmitters.length,1);close(villageEmitters[0].position,new THREE.Vector3(0,2.76,0));
assert.equal(vaultEmitters.length,1);assert(vaultEmitters[0].fire);close(vaultEmitters[0].position,new THREE.Vector3(.005,2.6775,.385));

// The effect system owns only its meshes, texture and light pool, never source assets.
const root=new THREE.Group();root.position.set(30,4,-20);root.rotation.y=.3;
root.add(city);const shared=new Set(),sourceDisposals=[];
city.traverse(n=>{if(n.isMesh){shared.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])shared.add(m);}});
for(const resource of shared)resource.addEventListener('dispose',()=>sourceDisposals.push(resource));
const source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());root.add(source);
const emitters=Array.from({length:200},(_,i)=>({position:new THREE.Vector3(i%20*2,2,Math.floor(i/20)*2),color:0xffbc76,fire:i%2===0,source}));
const effects=createEnvironmentLights(root,emitters),group=root.getObjectByName('Mossvale environmental effects');
const lights=group.children.filter(n=>n.isPointLight),meshes=group.children.filter(n=>n.isInstancedMesh);
assert.equal(lights.length,ENVIRONMENT_LIGHT_LIMIT);assert.equal(meshes.length,3,'world emitter count adds no particle draw calls');
const camera=new THREE.PerspectiveCamera();camera.position.set(33,8,-10);camera.lookAt(30,4,-20);camera.updateMatrixWorld();
const observer=new THREE.Vector3(4,1,4);root.localToWorld(observer);
effects.update(1,observer,camera);
assert(lights.every(l=>l.visible&&!l.castShadow&&l.intensity>0),'fixed six shadowless lights illuminate nearby surfaces');
assert(meshes[0].count<=ENVIRONMENT_VISUAL_LIMIT&&meshes[1].count<=ENVIRONMENT_VISUAL_LIMIT*12&&meshes[2].count<=ENVIRONMENT_VISUAL_LIMIT*4);
for(const mesh of meshes){assert(mesh.material.depthTest&&!mesh.material.depthWrite,'effects respect opaque geometry without blocking later translucent effects');assert([...mesh.instanceMatrix.array].every(Number.isFinite));}
const before=meshes.map(m=>m.instanceMatrix.array.slice()),intensity=lights[0].intensity;
effects.update(1.45,observer,camera);assert.notEqual(lights[0].intensity,intensity,'soft flicker is animated');
assert(meshes.every((mesh,i)=>mesh.instanceMatrix.array.some((n,j)=>n!==before[i][j])),'halos, fire and smoke each animate');
group.visible=false;effects.update(2,observer,camera);assert(!group.visible,'preview/user visibility toggle survives animation');group.visible=true;
source.visible=false;effects.update(3,observer,camera);assert(lights.every(l=>l.intensity===0)&&meshes.every(m=>m.count===0),'hidden source and cutaway parts leave no floating glow');
source.visible=true;effects.update(4,new THREE.Vector3(10000,10000,10000),camera);assert(lights.every(l=>l.intensity===0)&&meshes.every(m=>m.count===0),'distant emitters release every active slot');
effects.update(NaN,observer,camera);effects.update(0);assert(meshes.every(m=>[...m.instanceMatrix.array].every(Number.isFinite)));
const owned=new Set(meshes.flatMap(m=>[m.geometry,m.material]));owned.add(meshes[0].material.map);const disposed=new Map();
for(const resource of owned)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1));
effects.dispose();effects.dispose();effects.update(5,observer,camera);
assert.equal(group.parent,null);assert.equal(group.children.length,0);assert([...owned].every(r=>disposed.get(r)===1),'each owned GPU resource disposed exactly once');
assert.equal(sourceDisposals.length,0,'world geometry/materials remain owned by the world');

// Actual loaded world registration, floors, rotations and all scene constructors.
const oldLoad=GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync=async function(url){const b=readFileSync(`public${url}`);return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');};
try{
  for(const [label,build,at] of [
    ['overworld',createOverworld,new THREE.Vector3(-5,.08,22)],
    ['dungeon',createDungeonWorld,new THREE.Vector3(-15,0,1.5)],
    ['legacy Greenwood',s=>createZone(s,'greenwood'),new THREE.Vector3(0,0,0)],
    ['legacy Amber',s=>createZone(s,'amberwild'),new THREE.Vector3(0,0,0)],
  ]){
    const scene=new THREE.Scene(),world=await build(scene),worldRoot=scene.children[0],fx=scene.getObjectByName('Mossvale environmental effects');
    assert(fx,`${label} owns environmental effects`);world.update(1,at,camera);world.update(2,at,camera);
    assert.equal(fx.children.filter(n=>n.isPointLight).length,6);
    if(label==='overworld'){
      const actual=discoverEnvironmentEmitters(worldRoot),lanterns=CITY_PROPS.filter(p=>p.kind==='city-lantern');
      for(const p of lanterns)assert(actual.some(e=>e.position.distanceTo(new THREE.Vector3(p.x,3.53,p.z))<.01),'every instantiated city lamp has its actual anchor');
      for(const lamp of hallLamps){const p=buildingPoint(CITY_CLOCKTOWER,lamp.position.x,lamp.position.z);assert(actual.some(e=>e.position.distanceTo(new THREE.Vector3(p.x,lamp.position.y+BUILDING_FLOOR_LIFT,p.z))<.01),'all six town hall lamps register at their actual world anchors');}
      assert.equal(actual.filter(e=>e.fire).length,BUILDINGS.filter(b=>b.id!==BANK_HOME_ID&&!['auction-hall','clocktower'].includes(b.kind)).length,'all inhabited hearths have fire; the converted bank has no hearth');
      console.log('OVERWORLD_EMITTERS',actual.length,'fires',actual.filter(e=>e.fire).length);
    }
    if(label==='dungeon')assert.equal(discoverEnvironmentEmitters(worldRoot).length,DUNGEON_LANTERNS.length,'every actual brazier has one fire emitter');
    world.dispose();world.dispose();world.update(3,at,camera);assert.equal(scene.children.length,0,`${label} teardown removes lights and effects`);
  }
}finally{GLTFLoader.prototype.loadAsync=oldLoad;}
console.log('PASS: actual Blender glass/hearth anchors, rotated instancing, six-light/three-batch caps, fire/flicker/smoke animation, depth testing, source visibility, distance culling, all world constructors and isolated idempotent disposal.');
