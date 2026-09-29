import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY_LAYOUTS, ALL_CITY_COLLIDERS, ALL_CITY_GARDEN_COLLIDERS } from '../src/city.ts';
import { BUILDINGS, BUILDING_COLLIDERS, CIVIC_FURNITURE_COLLIDERS, buildingPoint, buildingFloorHeight } from '../src/buildings.ts';
import { cityRoadPavers, CITY_PAVER_VERTICES, CITY_PAVER_INDICES } from '../src/city-road-paving.ts';
import { createCityModels } from '../src/city-models.ts';
import { canTraverse } from '../src/realm.ts';

const bytes=await readFile(new URL('../public/models/city-kit.glb',import.meta.url));
const asset=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;
const key=(x,z)=>`${x},${z}`,matrix=new THREE.Matrix4(),vertex=new THREE.Vector3(),color=new THREE.Color();
const palettes=new Set();let total=0;
for(const city of CITY_LAYOUTS){
 const pavers=cityRoadPavers(city),cells=new Set(),solids=[...ALL_CITY_COLLIDERS,...ALL_CITY_GARDEN_COLLIDERS,...BUILDING_COLLIDERS,...CIVIC_FURNITURE_COLLIDERS].filter(p=>Math.abs(p.x-city.x)<90&&Math.abs(p.z-city.z)<90);
 assert(pavers.length>5000&&pavers.length<18000,`${city.name}: bounded regional stone batch`);total+=pavers.length;
 palettes.add(JSON.stringify([...new Set(pavers.map(p=>p.color))].sort()));
 for(const p of pavers){
  assert(Object.values(p).every(Number.isFinite));
  const left=Math.round((p.x-p.width/2)*4),back=Math.round((p.z-p.depth/2)*4),w=Math.round(p.width*4),d=Math.round(p.depth*4);
  for(let x=left;x<left+w;x++)for(let z=back;z<back+d;z++){assert(!cells.has(key(x,z)),'junctions never duplicate stone surfaces');cells.add(key(x,z));}
  assert(!solids.some(s=>Math.abs(p.x-s.x)<p.width/2+s.halfWidth-1e-7&&Math.abs(p.z-s.z)<p.depth/2+s.halfDepth-1e-7),`${city.name}: whole stones avoid walls, furniture and garden solids`);
  assert(Math.abs(p.slopeX)<=.161&&Math.abs(p.slopeZ)<=.161,'entrance transitions stay shallow');
  for(const [dx,,dz] of CITY_PAVER_VERTICES.slice(0,4)){
   const x=p.x+dx*p.width,z=p.z+dz*p.depth,y=p.y+p.slopeX*dx*p.width+p.slopeZ*dz*p.depth;
   const floor=buildingFloorHeight(x,z);assert(y>=floor+.0219&&y<=floor+.065,'paving follows shared ground and entry ramps without buried or floating corners');
   assert(y-.08<floor,'the skirt reaches below the walk surface at every ramp shoulder');
  }
 }
 for(const road of city.roads){
  assert(road.x1===road.x2||road.z1===road.z2,'city paving follows the authored cardinal road contract');
  const vertical=road.x1===road.x2;
  const bounds=[Math.min(road.x1,road.x2)-(vertical?road.width/2:0),Math.max(road.x1,road.x2)+(vertical?road.width/2:0),Math.min(road.z1,road.z2)-(vertical?0:road.width/2),Math.max(road.z1,road.z2)+(vertical?0:road.width/2)];
  assert(bounds.every(n=>Math.abs(n*4-Math.round(n*4))<1e-7));
  for(let ix=bounds[0]*4;ix<bounds[1]*4;ix++)for(let iz=bounds[2]*4;iz<bounds[3]*4;iz++){
   const x=(ix+.5)/4,z=(iz+.5)/4;
   if(solids.some(p=>Math.abs(x-p.x)<p.halfWidth+.125-1e-7&&Math.abs(z-p.z)<p.halfDepth+.125-1e-7))continue;
   assert(cells.has(key(ix,iz)),`${city.name}: complete declared street width, segment ends and junctions are paved`);
  }
 }
 // Test the rendered coverage, rather than only the road centerline graph.
 const first=cells.values().next().value,reached=new Set([first]),queue=[first];
 for(let i=0;i<queue.length;i++){
  const [x,z]=queue[i].split(',').map(Number);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const id=key(x+dx,z+dz);if(cells.has(id)&&!reached.has(id)){reached.add(id);queue.push(id);}}
 }
 const paved=p=>[-.001,.001].some(dx=>[-.001,.001].some(dz=>reached.has(key(Math.floor((p.x+dx)*4),Math.floor((p.z+dz)*4)))));
 for(const gate of city.props.filter(prop=>prop.kind==='city-gate'))assert(paved(gate),`${city.name}: all gates join the continuous stone surface`);
 for(const home of BUILDINGS.filter(home=>home.zone===city.zone&&city.homes.some(h=>h.id===home.id)||city.props.some(p=>p.id===home.id))){
  const door=buildingPoint(home,0,home.depth/2);assert(paved(door),`${home.id}: doorstep joins rendered streets`);
  for(const distance of [.125,.5,1,1.5,2]){
   const at=buildingPoint(home,0,home.depth/2+distance);
   if(paved(at))assert(canTraverse(at,door),`${home.id}: paved entry obeys authoritative collision`);
  }
 }
 const view=createCityModels(asset,undefined,city),tiles=view.root.getObjectByName(`${city.name} cobbled streets`);
 assert(tiles.isInstancedMesh&&tiles.count===pavers.length&&tiles.geometry.index.count===CITY_PAVER_INDICES.length,'all stone relief uses one bounded instanced draw');
 assert.equal(tiles.material.vertexColors,true,'grout has its own darker lower rim');
 assert(CITY_PAVER_VERTICES.slice(8).every(point=>point[1]===-.08),'stone skirts close ramp shoulders below the greatest permitted rim lift');
 assert.equal(tiles.material.flatShading,true,'sloped instances use actual surface normals instead of unsupported shear normal transforms');
 assert.equal(tiles.material.color.getHex(),0xffffff,'regional colors are not tinted twice');
 const skirt=new THREE.Mesh(tiles.geometry,tiles.material);skirt.updateMatrixWorld(true);
 assert(new THREE.Raycaster(new THREE.Vector3(.7,-.04,0),new THREE.Vector3(-1,0,0),0,1).intersectObject(skirt).length,'actual skirt geometry closes an oblique view below the mortar rim');
 for(const index of [0,Math.floor(pavers.length/2),pavers.length-1]){
  const p=pavers[index];tiles.getMatrixAt(index,matrix);tiles.getColorAt(index,color);assert.equal(color.getHex(),p.color);
  for(const point of CITY_PAVER_VERTICES){vertex.fromArray(point).applyMatrix4(matrix);assert(Math.abs(vertex.y-(p.y+point[1]+point[0]*p.width*p.slopeX+point[2]*p.depth*p.slopeZ))<.00001,'actual mesh follows the same ramp plane exported to Blender');}
 }
 view.dispose();
 console.log(`PASS ${city.name}: ${pavers.length} joined relief stones, all gates and ${city.homes.length+2} doorsteps.`);
}
assert.equal(palettes.size,6,'each city uses its authored stone palette');
console.log(`PASS city paving: ${total} stones across six cities; full-width coverage, no duplicated junction surfaces, collision clearance, terrain/ramp heights, six regional palettes and one draw per city.`);
