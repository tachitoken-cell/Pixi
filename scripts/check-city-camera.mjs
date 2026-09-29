import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCityModels } from '../src/city-models.ts';
import { CITY_PROPS, CITY_CLOCKTOWER, CITY_WALL_RADIUS } from '../src/city.ts';
import { BUILDING_FLOOR_LIFT, buildingPoint } from '../src/buildings.ts';

const bytes = readFileSync(new URL('../public/models/city-kit.glb', import.meta.url));
const asset = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
asset.updateMatrixWorld(true);
const wall = asset.getObjectByName('city-wall'), gate = asset.getObjectByName('city-gate');
const wallBounds = new THREE.Box3().setFromObject(wall), gateBounds = new THREE.Box3().setFromObject(gate);
assert(wallBounds.max.y >= 9 && wallBounds.max.y <= 10, 'the camera check uses the actual new 9–10m wall asset');
assert(gateBounds.max.y >= 17, 'the camera check uses the actual tall gate asset');
const city = createCityModels(asset), ray = new THREE.Ray(), hit = new THREE.Vector3();
const vector = (prop, x, y, z) => { const p = buildingPoint(prop,x,z); return new THREE.Vector3(p.x,y+BUILDING_FLOOR_LIFT,p.z); };
const check = (target, desired, blocked, label, shape) => {
  const before = desired.clone(), anchor = target.clone(), direction = before.clone().sub(target).normalize();
  city.constrainCamera(target,desired);
  assert(target.equals(anchor), `${label}: camera correction cannot move the player/aim target`);
  assert(desired.toArray().every(Number.isFinite));
  if (blocked) {
    assert(target.distanceTo(desired) < target.distanceTo(before) - .39, `${label}: obstructed camera moves in front of the wall`);
    assert(new THREE.Vector3().subVectors(desired,target).cross(direction).length() < 1e-8, `${label}: correction preserves the viewing direction`);
    if (shape) {
      ray.set(target,direction); assert(ray.intersectBox(shape,hit));
      assert(Math.abs(target.distanceTo(hit)-target.distanceTo(desired)-.4)<1e-6, `${label}: camera stops exactly 0.4m before the solid`);
    }
  } else assert(desired.equals(before), `${label}: clear camera paths remain unchanged`);
  return desired;
};
for (const prop of CITY_PROPS.filter(p => p.kind === 'city-wall')) {
  const depth = wall.userData.depth;
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(prop.x,BUILDING_FLOOR_LIFT,prop.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),prop.rotation),new THREE.Vector3(1,1,1));
  const block = new THREE.Box3(new THREE.Vector3(-4,wallBounds.min.y,-depth/2),new THREE.Vector3(4,wallBounds.max.y,depth/2)).applyMatrix4(matrix);
  for (const direction of [-1,1]) check(vector(prop,0,2,direction*8),vector(prop,0,3,-direction*8),true,`${prop.id}/${direction}`,block);
  check(vector(prop,0,2,-8),vector(prop,0,2,-depth/2),true,`${prop.id}/camera on surface`,block);
  check(vector(prop,0,wallBounds.max.y+.5,-8),vector(prop,0,wallBounds.max.y+.5,8),false,`${prop.id}/above wall`);
  check(vector(prop,0,2,-8),vector(prop,0,2,-3),false,`${prop.id}/same side`);
}
const lintelBounds = new THREE.Box3().setFromObject(gate.getObjectByName('city-gate-shell-front'));
for (const prop of CITY_PROPS.filter(p => p.kind === 'city-gate')) {
  for (const x of [-2.6,0,2.6]) check(vector(prop,x,2,-8),vector(prop,x,2,8),false,`${prop.id}/open passage ${x}`);
  for (const x of [-4.5,4.5]) check(vector(prop,x,2,-8),vector(prop,x,2,8),true,`${prop.id}/watchtower ${x}`);
  check(vector(prop,0,lintelBounds.getCenter(new THREE.Vector3()).y,-8),vector(prop,0,lintelBounds.getCenter(new THREE.Vector3()).y,8),true,`${prop.id}/lintel`);
  check(vector(prop,0,gateBounds.max.y+.5,-8),vector(prop,0,gateBounds.max.y+.5,8),false,`${prop.id}/above gate`);
}
const clock = asset.getObjectByName('city-clocktower').clone(true);
clock.position.set(CITY_CLOCKTOWER.x,BUILDING_FLOOR_LIFT,CITY_CLOCKTOWER.z);
clock.rotation.y = CITY_CLOCKTOWER.rotation; clock.updateMatrixWorld(true);
for (const [localX,localZ] of [[0,-CITY_CLOCKTOWER.depth/2-2],[-CITY_CLOCKTOWER.width/2-2,-2]]) {
  const {x,z}=buildingPoint(CITY_CLOCKTOWER,localX,localZ),target = new THREE.Vector3(x,1.2,z);
  const desired = target.clone().add(new THREE.Vector3(Math.sin(.34)*Math.cos(.35)*21,Math.sin(.35)*21,Math.cos(.34)*Math.cos(.35)*21));
  const meshRay = new THREE.Raycaster(desired,target.clone().sub(desired).normalize(),0,desired.distanceTo(target));
  assert(meshRay.intersectObject(clock,true).length, 'the reproduced outdoor orbit really intersects the authored clocktower');
  check(target,desired,true,`clocktower outdoor player ${x},${z}`);
  meshRay.set(desired,target.clone().sub(desired).normalize());meshRay.far=desired.distanceTo(target);
  assert.equal(meshRay.intersectObject(clock,true).length,0,'corrected outdoor camera has a clear view of the player through actual clock geometry');
}
for (const [x,z] of [[0,10],[10,0],[0,-10],[-10,0]])
  check(vector(CITY_CLOCKTOWER,0,1.2,0),vector(CITY_CLOCKTOWER,x,7,z),false,'clocktower indoor cutaway orbit');
check(vector(CITY_CLOCKTOWER,0,16,-10),vector(CITY_CLOCKTOWER,0,16,10),true,'clocktower upper shaft');
check(vector(CITY_CLOCKTOWER,CITY_CLOCKTOWER.width/2-1,14,-12),vector(CITY_CLOCKTOWER,CITY_CLOCKTOWER.width/2-1,14,12),false,'town hall clear air above the broad roof and outside the upper clock shaft');
const clockHeight = new THREE.Box3().setFromObject(clock).max.y + .5;
check(vector(CITY_CLOCKTOWER,0,clockHeight,-10),vector(CITY_CLOCKTOWER,0,clockHeight,10),false,'above clocktower spire');
check(new THREE.Vector3(100,2,100),new THREE.Vector3(125,8,120),false,'distant open terrain');
check(new THREE.Vector3(0,2,0),new THREE.Vector3(0,2,0),false,'zero camera distance');

// Execute the actual gameplay placement block, including its optional world callback.
const main = readFileSync(new URL('../src/main.ts', import.meta.url),'utf8');
const start = main.indexOf(' const indoors='), end = main.indexOf(' const worldTime=dayNight.update(',start);
assert(start>=0&&end>start,'the check extracts the current complete gameplay camera placement block');
let interiorCamera;
const playerZ=CITY_WALL_RADIUS-14;
const runtime = { airshipFraming:0, ZEPPELIN_PORTS:[], THREE, player:null, gmFlying:()=>false, worldInstance:null, buildingAt:()=>undefined, position:new THREE.Vector3(25,0,playerZ), distance:21,pitch:.35,yaw:.34,
  cameraTarget:new THREE.Vector3(25,1.2,playerZ),cameraPosition:new THREE.Vector3(),dt:0,swimming:false,riderLift:0,hoverLift:0,seated:null,
  camera:new THREE.PerspectiveCamera(),surfaceHeight:()=>0,zoneHandle:{constrainCamera:city.constrainCamera,setInteriorView:(_player,camera)=>{interiorCamera=camera.clone();}} };
runInNewContext(stripTypeScriptTypes(main.slice(start,end)),runtime);
assert(runtime.camera.position.distanceTo(runtime.cameraTarget)<20, 'default gameplay orbit stays in front of the new south wall');
assert(runtime.camera.position.z<CITY_WALL_RADIUS-wall.userData.depth/2, 'the camera remains on the player side of the deep curtain wall');
assert(interiorCamera.equals(runtime.camera.position), 'indoor cutaways receive the corrected camera position');
const unobstructed = { ...runtime, zoneHandle:{}, cameraPosition:new THREE.Vector3(), camera:new THREE.PerspectiveCamera() };
runInNewContext(stripTypeScriptTypes(main.slice(start,end)),unobstructed);
assert(Math.abs(unobstructed.camera.position.distanceTo(runtime.cameraTarget)-21)<1e-6,'worlds without the optional callback retain their original camera');

asset.traverse = asset.getObjectByName = () => assert.fail('camera motion must use cached boxes, not traverse loaded model geometry');
for (let frame=0;frame<200;frame++) {
  city.constrainCamera(new THREE.Vector3(25,1.2,playerZ),new THREE.Vector3(32,8,CITY_WALL_RADIUS+5));
  city.constrainCamera(vector(CITY_CLOCKTOWER,0,1.2,-CITY_CLOCKTOWER.depth/2-2),vector(CITY_CLOCKTOWER,7,8.4,10));
}
console.log('PASS: actual city walls/gates, outdoor clocktower visibility and indoor cutaways, stepped upper-stage bounds, 0.4m clearance, open arches, elevated views, cached proxies and live main camera integration.');

const passenger = { ...runtime, airshipFraming:1, player:{zeppelin:{}}, position:new THREE.Vector3(0,185,102), zoneHandle:{constrainCamera(){assert.fail('A zeppelin passenger must not be clipped against ground buildings');}}, cameraPosition:new THREE.Vector3(), camera:new THREE.PerspectiveCamera() };
runInNewContext(stripTypeScriptTypes(main.slice(start,end)),passenger);
assert(Math.abs(passenger.camera.position.distanceTo(passenger.cameraTarget)-46)<1e-6,'flight orbit frames the full33m aircraft');
