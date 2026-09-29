import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pickTerrain, surfaceHeight } from '../src/terrain-view.ts';
import { WORLD_BOUNDS, WATER_LEVEL, groundHeight, waterAt } from '../src/landscape.ts';

let hill, sea;
for(let x=WORLD_BOUNDS.minX+10;x<WORLD_BOUNDS.maxX;x+=8) for(let z=WORLD_BOUNDS.minZ+10;z<WORLD_BOUNDS.maxZ;z+=8){
  if(!waterAt(x,z)&&groundHeight(x,z)>15) hill??={x,z};
  if(waterAt(x,z)) sea??={x,z};
}
assert(hill&&sea);
for(const point of [hill,sea]){
  const height=surfaceHeight(point.x,point.z), ray=new THREE.Ray(new THREE.Vector3(point.x,height+30,point.z),new THREE.Vector3(0,-1,0));
  const hit=pickTerrain(ray);assert(hit);assert(Math.abs(hit.y-height)<.0001);assert.equal(hit.x,point.x);assert.equal(hit.z,point.z);
  if(point===sea)assert.equal(hit.y,WATER_LEVEL,'water picking selects the surface rather than the sea floor');
  assert.equal(pickTerrain(ray,false,10),undefined,'click picking has a bounded range');
  ray.direction.y=1;assert.equal(pickTerrain(ray),undefined,'sky clicks do not pick behind the camera');
}
const start=new THREE.Vector3(hill.x-8,groundHeight(hill.x,hill.z)+20,hill.z-8), aim=new THREE.Vector3(hill.x,groundHeight(hill.x,hill.z),hill.z);
const ray=new THREE.Ray(start,aim.clone().sub(start).normalize()), hit=pickTerrain(ray);assert(hit);
assert(Math.abs(hit.y-surfaceHeight(hit.x,hit.z))<.00001,'an oblique hill click resolves the visible terrace');
assert.equal(pickTerrain(new THREE.Ray(new THREE.Vector3(NaN,10,0),new THREE.Vector3(0,-1,0))),undefined);
const dungeon=pickTerrain(new THREE.Ray(new THREE.Vector3(0,20,0),new THREE.Vector3(0,-1,0)),true);assert.equal(dungeon.y,0);
assert.equal(pickTerrain(new THREE.Ray(new THREE.Vector3(0,20,0),new THREE.Vector3(0,-1,0)),true,19.99),undefined,'dungeon picking respects the requested maximum distance');
assert.equal(pickTerrain(new THREE.Ray(new THREE.Vector3(0,20,0),new THREE.Vector3(0,-1,0)),true,20)?.y,0,'a dungeon floor exactly at the range boundary remains pickable');
console.log('PASS: elevated and oblique ground picking, visible water surface, bounded sky/invalid clicks, and unchanged dungeon plane.');
