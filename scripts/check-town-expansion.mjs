import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY_LAYOUTS, CITY_RADIUS, BANK_HOME_IDS, insideAnyCity, insideAirshipApproach } from '../src/city.ts';
import { BANKERS, AUCTIONEERS } from '../src/city-services.ts';
import { ZONES } from '../src/content.ts';
import { TOWN_HEIGHTS, groundHeight, waterAt, EXPEDITIONS, EXPEDITION_NODE_OFFSETS } from '../src/landscape.ts';
import { BUILDINGS, BUILDING_CHAIRS, buildingPoint, chairApproach } from '../src/buildings.ts';
import { WORLD_SCENERY, canTraverse } from '../src/realm.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { cityPatrolRoutes, createCityLife } from '../src/city-life.ts';
import { createCityModels } from '../src/city-models.ts';
import { createBuildingModels } from '../src/building-models.ts';

const assets=new Map();
async function asset(url){if(!assets.has(url)){const raw=await readFile(new URL(`../public${url}`,import.meta.url));assets.set(url,await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),''));}return assets.get(url);}
const kit=(await asset('/models/city-kit.glb')).scene,furniture=(await asset('/models/city-furnishings.glb')).scene,villagers=(await asset('/models/village-kit.glb')).scene;
const sources=new THREE.Group();sources.add(kit,(await asset('/models/house-interiors.glb')).scene);
const frontier=(await asset('/models/frontier-biomes.glb')).scene;
const biomes=await asset('/models/town-biomes.glb');
const homes=createBuildingModels(sources,frontier,furniture);
const load=GLTFLoader.prototype.loadAsync;GLTFLoader.prototype.loadAsync=asset;
try{
  assert.equal(CITY_LAYOUTS.length,6);
  assert.equal(new Set(CITY_LAYOUTS.map(city=>JSON.stringify(city.homes.map(home=>[home.x-city.x,home.z-city.z,home.rotation])))).size,6,'each city has its own residential layout');
  assert.equal(new Set(CITY_LAYOUTS.map(city=>JSON.stringify(city.roads.map(road=>[road.x1-city.x,road.z1-city.z,road.x2-city.x,road.z2-city.z])))).size,6,'residential streets follow distinct city plans');
  for(const city of CITY_LAYOUTS){
    assert.equal(city.homes.length,17,`${city.name}: capital-scale housing`);
    assert.equal(city.props.length,CITY_LAYOUTS[0].props.length,`${city.name}: full capital civic and wall kit`);
    assert.equal(city.props.filter(p=>p.kind==='city-gate').length,4);
    assert.equal(cityPatrolRoutes(city).length,24);
    for(const road of city.roads){
      const dx=road.x2-road.x1,dz=road.z2-road.z1,length=Math.hypot(dx,dz),steps=Math.ceil(length*2);
      for(let step=0;step<=steps;step++)for(const offset of [-road.width/2+.41,0,road.width/2-.41]){
        const point={x:road.x1+dx*step/steps-dz/length*offset,z:road.z1+dz*step/steps+dx/length*offset};
        assert(canTraverse(point,point),`${city.name}: full paved road width stays clear at ${point.x-city.x},${point.z-city.z}`);
      }
    }
    const step=.5,limit=94,width=limit*2/step+1;
    const index=(x,z)=>Math.round((x+limit)/step)+Math.round((z+limit)/step)*width;
    const point=id=>({x:(id%width)*step-limit+city.x,z:Math.floor(id/width)*step-limit+city.z});
    const zone=ZONES.find(z=>z.id===city.zone),start={x:city.x+zone.spawn.x,z:city.z+zone.spawn.z};
    const first=index(zone.spawn.x,zone.spawn.z),reached=new Set([first]),queue=[first];
    for(let i=0;i<queue.length;i++){
      const from=point(queue[i]);
      for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]){
        const to={x:from.x+dx,z:from.z+dz},id=index(to.x-city.x,to.z-city.z);
        if(Math.abs(to.x-city.x)>limit||Math.abs(to.z-city.z)>limit||reached.has(id)||waterAt(to.x,to.z)||!canTraverse(from,to))continue;
        reached.add(id);queue.push(id);
      }
    }
    const reachable=(target,label)=>{
      assert(canTraverse(target,target)&&!waterAt(target.x,target.z),`${city.name}: ${label} has free ground`);
      const x=Math.round((target.x-city.x)/step)*step,z=Math.round((target.z-city.z)/step)*step;
      assert([-step,0,step].some(dx=>[-step,0,step].some(dz=>reached.has(index(x+dx,z+dz))&&canTraverse({x:x+dx+city.x,z:z+dz+city.z},target))),`${city.name}: ${label} reachable from spawn`);
    };
    for(const building of BUILDINGS.filter(b=>Math.abs(b.x-city.x)<CITY_RADIUS&&Math.abs(b.z-city.z)<CITY_RADIUS)){
      reachable(buildingPoint(building,0,building.depth/2+3),`${building.id} doorway`);
      const door=buildingPoint(building,0,building.depth/2);assert(city.roads.some(r=>{const dx=r.x2-r.x1,dz=r.z2-r.z1,t=Math.max(0,Math.min(1,((door.x-r.x1)*dx+(door.z-r.z1)*dz)/(dx*dx+dz*dz)));return Math.hypot(door.x-r.x1-dx*t,door.z-r.z1-dz*t)<=r.width/2;}),'every house entrance joins a paved street');
      reachable(buildingPoint(building,0,1.5),`${building.id} interior`);
      for(const chair of BUILDING_CHAIRS.filter(c=>c.buildingId===building.id))reachable(chairApproach(chair),chair.id);
      const model=homes.root.getObjectByName(building.id);assert(model,'every room renders its real Blender model');assert.equal(model.position.y,building.y);
      homes.update({...building,y:building.y+185},buildingPoint(building,20,20));model.traverse(part=>{if(String(part.userData.part).startsWith('roof-'))assert(part.visible,'airship passengers see intact roofs beneath them');});
      const regionalHome=city.zone!=='greenwood'&&['cottage','inn'].includes(building.kind);
      const source=regionalHome?frontier.getObjectByName(`frontier-${city.zone}-${building.kind}`):sources.getObjectByName(['cottage','inn'].includes(building.kind)?`house-city-${building.kind}`:`city-${building.kind}`);
      for(const part of source.children.filter(part=>String(part.userData.part).startsWith('roof-')))assert.equal(model.getObjectByName(part.name)?.geometry,part.geometry,`${city.name}: preserve the complete authored ${regionalHome?'biome':'capital'} roof`);
    }
    for(const npc of [...TRAINER_NPCS,...VILLAGE_NPCS].filter(p=>p.zone===city.zone&&Math.abs(p.x-city.x)<CITY_RADIUS&&Math.abs(p.z-city.z)<CITY_RADIUS))reachable(npc,npc.id);
    for(const services of [BANKERS,AUCTIONEERS]){
      const npc=services.find(npc=>npc.zone===city.zone);assert(npc,`${city.name}: city service exists`);reachable(npc,npc.id);
    }
    const bank=BUILDINGS.find(b=>b.id===BANK_HOME_IDS[city.zone]);assert(bank,`${city.name}: bank interior exists`);
    assert.equal(city.furnishings.filter(p=>p.buildingId===bank.id&&p.kind.startsWith('bank-')).length,3,'every bank has counter, vault and sign');
    assert(!BUILDING_CHAIRS.some(c=>c.buildingId===bank.id),'bank does not retain invisible inn seats');
    for(const p of [zone.npc,...zone.nodes,...zone.gateways,...zone.beacon?[zone.beacon]:[]].filter(p=>Math.abs(p.x)<CITY_RADIUS&&Math.abs(p.z)<CITY_RADIUS))reachable({x:p.x+city.x,z:p.z+city.z},p.id);
    reachable({x:city.x,z:city.z+90},'airship boarding dock');
    for(let x=-10;x<=10;x+=2)for(let z=84;z<=120;z+=2){
      assert.equal(groundHeight(city.x+x,city.z+z),TOWN_HEIGHTS[city.zone],`${city.name}: level dock approach`);
      assert(canTraverse({x:city.x+x,z:city.z+z},{x:city.x+x,z:city.z+z}),`${city.name}: clear dock approach`);
    }
    for(const gate of city.props.filter(p=>p.kind==='city-gate'))assert(canTraverse(buildingPoint(gate,0,-6),buildingPoint(gate,0,6)),`${city.name}: open ${gate.id}`);
    const models=createCityModels(kit,furniture,city,biomes),life=await createCityLife(villagers,city);
    assert.equal(life.citizens.size,24);assert.equal(life.root.userData.stableAnimals,3);
    models.update(start);life.update(1,start);assert(models.root.visible&&life.root.visible);
    for(let t=2;t<22;t+=2){life.update(t);for(const p of life.root.userData.actorPositions)assert(canTraverse(p,p)&&!waterAt(p.x,p.z),`${city.name}: walking residents avoid solids`);}
    const wall=city.props.find(p=>p.kind==='city-wall'&&Math.abs(p.z-city.z-78)<.01),target=new THREE.Vector3(wall.x,TOWN_HEIGHTS[city.zone]+2,wall.z-8),desired=new THREE.Vector3(wall.x,TOWN_HEIGHTS[city.zone]+3,wall.z+8);
    models.constrainCamera(target,desired);assert(desired.z<wall.z,'camera stays in front of the actual elevated wall');
    models.update({x:20000,z:20000});life.update(30,{x:20000,z:20000});assert(!models.root.visible&&!life.root.visible,'distant town assets are culled');
    life.dispose();models.dispose();console.log(`PASS ${city.name}: 17 homes, 2 civic interiors, 4 gates, 24 walking citizens, 3 stable animals, ${reached.size} reachable street cells, level airship dock.`);
  }
  assert(!WORLD_SCENERY.some(p=>['tree','rock'].includes(p.kind)&&(insideAnyCity(p.x,p.z)||insideAirshipApproach(p.x,p.z))),'random scenery cannot cover city or airship plots');
  for(const camp of EXPEDITIONS)for(const p of EXPEDITION_NODE_OFFSETS){const point={x:camp.x+p.x,z:camp.z+p.z};assert(canTraverse(point,point),`${camp.id}: existing resource anchor preserved`);}
}finally{GLTFLoader.prototype.loadAsync=load;}
