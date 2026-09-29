import assert from 'node:assert/strict';
import { TRAINING_DUMMIES } from '../src/training-dummies.ts';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

const start=performance.now();
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {ZONES}=await import('../src/content.ts');
const {WORLD_BOUNDS,PRE_EXPANSION_BOUNDS,REGION_ORIGINS,EXPEDITIONS,TERRAIN_STEP,townAt,surfaceAt,groundHeight,waterAt}=await import('../src/landscape.ts');
const {TOWN_BOUNDS,VILLAGES,VILLAGE_PROPS,VILLAGE_NPCS,villageFootprint,townDistance,townSpawnAllowed,TOWN_SPAWN_DISTANCE}=await import('../src/settlements.ts');
const {OVERWORLD_SPAWNS,WORLD_COLLIDERS,canTraverse,regionAt,toWorld,overworldSpawnAllowed}=await import('../src/realm.ts');
const {ROOTVAULT_GUARDIAN}=await import('../src/dungeon.ts');
const {BUILDINGS,buildingPoint,BUILDING_RAMP_LENGTH,buildingFloorHeight}=await import('../src/buildings.ts');
const {findPath}=await import('../src/navigation.ts');
const {regionLevelRange,regionLevelLabel}=await import('../src/region-levels.ts');
const {monsterSpawnLevel,WORLD_BOSS}=await import('../src/bestiary.ts');
const {CONTRACTS,newContracts,acceptContract,contractProgress,claimContract}=await import('../src/adventure.ts');
const {TRAINER_NPCS}=await import('../src/training.ts');
const {createAmbientEffects}=await import('../src/ambient-effects.ts');
const {createDayNightCycle,WORLD_DAY_MS}=await import('../src/day-night.ts');
const {CITY_RADIUS}=await import('../src/city.ts');

const area=b=>(b.maxX-b.minX)*(b.maxZ-b.minZ);
assert.equal(area(PRE_EXPANSION_BOUNDS),1536**2);
assert.equal(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX,3072);
assert.equal(WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ,3072);
assert.equal(area(WORLD_BOUNDS),area(PRE_EXPANSION_BOUNDS)*4,'the playable area is four times its prior size');
const oldOrigins={greenwood:{x:0,z:0},amberwild:{x:-440,z:-260},frostmarch:{x:440,z:-432},hollow:{x:448,z:280}};
for(const [id,point] of Object.entries(oldOrigins))assert.deepEqual(REGION_ORIGINS[id],point,`${id} keeps its saved world coordinates`);
const oldCamps=[['pinewake',-280,160],['redleaf',-520,-340],['sunscar',-500,-610],['stormcrag',80,-590],['northglass',500,-540],['moonfen',660,-160],['shadewood',600,320],['elderwood',230,420],['tidewatch',-130,490],['whisper',-510,480],['silverreach',-310,0],['cindergrove',60,-230],['opal-isles',-220,-690],['bracken-crown',-600,40],['emberfall',360,-60],['violet-reach',590,590]];
assert.deepEqual(EXPEDITIONS.slice(0,16).map(c=>[c.id,c.x,c.z]),oldCamps,'legacy camp order and coordinates remain stable for saved journeys');
assert.deepEqual(ZONES.map(z=>z.id).sort(),['greenwood','amberwild','frostmarch','hollow','sunveil','mistwood'].sort());
assert.equal(EXPEDITIONS.length,33,'seventeen new regions extend the existing sixteen');
let savedCells=0;
for(let x=PRE_EXPANSION_BOUNDS.minX+2;x<PRE_EXPANSION_BOUNDS.maxX;x+=4)for(let z=PRE_EXPANSION_BOUNDS.minZ+2;z<PRE_EXPANSION_BOUNDS.maxZ;z+=4){
  const town=townAt(x,z);
  const nearest=EXPEDITIONS.slice(0,16).reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<=Math.hypot(x-b.x,z-b.z)?a:b);
  assert.equal(regionAt(x,z),town??nearest.zone,`town footprints own their expanded ground; other v2 cells retain ownership at ${x},${z}`);savedCells++;
}

const drySegment=(from,to,label)=>{
  assert(canTraverse(from,to),`${label}: route clears shared collision`);
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.5));
  for(let i=0;i<=steps;i++){const x=from.x+(to.x-from.x)*i/steps,z=from.z+(to.z-from.z)*i/steps;assert(!waterAt(x,z),`${label}: route remains on dry ground at ${x.toFixed(1)},${z.toFixed(1)}`);}
};
const dryRoute=(from,to,label)=>{
  const path=findPath(from,to,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length,`${label}: a real walking route exists`);
  let previous=from;for(const step of path){drySegment(previous,step,label);previous=step;}
  assert(Math.hypot(previous.x-to.x,previous.z-to.z)<.01,`${label}: reaches the actual target`);
};
for(const zone of ZONES){
  const origin=REGION_ORIGINS[zone.id],spawn=toWorld(zone.id,zone.spawn),range=regionLevelRange(zone.id,zone.id);
  assert.equal(regionAt(origin.x,origin.z),zone.id);assert(!waterAt(origin.x,origin.z));
  assert(range.min>=1&&range.max<=60&&range.min<=range.max,`${zone.id} has a usable leveling label`);
  dryRoute(spawn,toWorld(zone.id,zone.npc),`${zone.id} story NPC`);
  dryRoute(spawn,toWorld(zone.id,{x:3,z:4}),`${zone.id} quest board approach`);
  if(['sunveil','mistwood'].includes(zone.id))for(const trainer of TRAINER_NPCS.filter(n=>n.zone===zone.id)){
    const front={x:trainer.x+Math.sin(trainer.rotation)*1.5,z:trainer.z+Math.cos(trainer.rotation)*1.5};
    dryRoute(spawn,front,`${trainer.id} approach`);drySegment(front,trainer,`${trainer.id} interaction`);
    assert(!VILLAGE_NPCS.some(n=>Math.hypot(n.x-trainer.x,n.z-trainer.z)<2.5),`${trainer.id} does not overlap another NPC`);
  }
}
for(const camp of EXPEDITIONS){assert(!waterAt(camp.x,camp.z),`${camp.id} discovery marker is dry`);assert.equal(surfaceAt(camp.x,camp.z).regionId,camp.id,`${camp.id} can actually be discovered at its marker`);}
let entrances=0;
for(const village of VILLAGES){
  assert(!waterAt(village.x,village.z),`${village.id} central square is dry`);
  const homes=BUILDINGS.filter(building=>village.size==='town'?building.zone===village.zone&&Math.abs(building.x-village.x)<CITY_RADIUS&&Math.abs(building.z-village.z)<CITY_RADIUS:VILLAGE_PROPS.some(prop=>prop.villageId===village.id&&prop.id===building.id));
  assert(homes.length>0,`${village.id} contains actual walkable houses`);
  if(village.size==='town')assert(homes.length>=10,`${village.id} is a town with a substantial residential layout`);
  for(const building of homes){
    const ramp=buildingPoint(building,0,building.depth/2+BUILDING_RAMP_LENGTH),door=buildingPoint(building,0,building.depth/2),aisle=buildingPoint(building,0,1.5);
    dryRoute(village,ramp,`${building.id} village approach`);drySegment(ramp,door,`${building.id} ramp`);drySegment(door,aisle,`${building.id} interior aisle`);
    assert(Math.abs(buildingFloorHeight(aisle.x,aisle.z)-building.y)<.001,`${building.id} grounded interior floor`);entrances++;
  }
  for(const npc of VILLAGE_NPCS.filter(npc=>npc.villageId===village.id))dryRoute(village,npc,`${npc.id} interaction`);
  for(const prop of VILLAGE_PROPS.filter(prop=>prop.villageId===village.id)){
    const size=villageFootprint(prop);
    for(const dx of [-size.width/2,size.width/2])for(const dz of [-size.depth/2,size.depth/2])assert.equal(townDistance({x:prop.x+dx,z:prop.z+dz}),0,`${prop.id} entire building footprint is protected`);
  }
}
assert.equal(TOWN_SPAWN_DISTANCE,100);
assert(!townSpawnAllowed({x:NaN,z:0}));assert(!townSpawnAllowed({x:Infinity,z:0}));
const distanceToBounds=(p,t)=>Math.hypot(Math.max(t.minX-p.x,0,p.x-t.maxX),Math.max(t.minZ-p.z,0,p.z-t.maxZ));
for(const town of TOWN_BOUNDS)for(const distance of [0,50,99.99,100,150]){
  const p={x:town.maxX+distance,z:(town.minZ+town.maxZ)/2},actual=Math.min(...TOWN_BOUNDS.map(t=>distanceToBounds(p,t)));
  assert(Math.abs(townDistance(p)-actual)<1e-8);assert.equal(townSpawnAllowed(p),actual>=100,'the buffer measures from the footprint boundary, not the map pin');
}
assert(OVERWORLD_SPAWNS.length>=1000,'the larger land has at least a thousand real encounter homes');
assert.equal(new Set(OVERWORLD_SPAWNS.map(s=>s.id)).size,OVERWORLD_SPAWNS.length);
const levels=new Set(),byZone={};
for(const spawn of OVERWORLD_SPAWNS){
  const distance=Math.min(...TOWN_BOUNDS.map(t=>distanceToBounds(spawn,t)));
  if(spawn.kind==='training-dummy')assert(TRAINING_DUMMIES.some(dummy=>dummy.id===spawn.id&&dummy.zone===spawn.zone&&dummy.x===spawn.x&&dummy.z===spawn.z),'city targets must match an authored training dummy');
  else if(spawn.id===ROOTVAULT_GUARDIAN.id)assert.deepEqual({id:spawn.id,kind:spawn.kind,zone:spawn.zone,x:spawn.x,z:spawn.z},ROOTVAULT_GUARDIAN,'only the exact curated temple guardian may use the town-buffer exception');
  else assert(distance>=100,`${spawn.id} is ${distance.toFixed(1)}m outside the nearest town; requires100`);
  assert(overworldSpawnAllowed(spawn,spawn.zone),`${spawn.id} passes shared dry-ground, biome and two-metre clearance checks`);
  assert(!waterAt(spawn.x,spawn.z)&&canTraverse(spawn,spawn),`${spawn.id} is dry and collision-free`);
  assert.equal(regionAt(spawn.x,spawn.z),spawn.zone);const surface=surfaceAt(spawn.x,spawn.z),level=monsterSpawnLevel(spawn,surface.regionId);levels.add(level);byZone[spawn.zone]=(byZone[spawn.zone]??0)+1;
}
assert(!overworldSpawnAllowed({...ROOTVAULT_GUARDIAN,id:'ordinary-guardian'},ROOTVAULT_GUARDIAN.zone),'ordinary monsters at the temple guardian point still require the full town buffer');
assert(OVERWORLD_SPAWNS.some(s=>s.id===WORLD_BOSS.id),'the world boss uses the same protected-spawn catalog');
assert(levels.has(1)&&levels.has(60),'real encounter homes reach both ends of the level1–60 journey');
for(let level=1;level<=60;level++){
  const regions=[...ZONES.map(z=>({id:z.id,zone:z.id})),...EXPEDITIONS].filter(r=>{const range=regionLevelRange(r.id,r.zone);return range.min<=level&&range.max>=level;});
  assert(regions.length,`level${level} has a recommended region`);
  assert([...levels].some(actual=>Math.abs(actual-level)<=1),`level${level} has real encounters within one level, without forcing random homes to use every exact integer`);
}
for(const zone of ZONES)assert(byZone[zone.id]>=10,`${zone.id} has populated exploration space`);
console.log(`Expansion geometry: 4× area, ${savedCells} old save cells retain their region, 6 towns/biomes, ${VILLAGES.length} settlements, ${entrances} reachable dry entrances, ${OVERWORLD_SPAWNS.length} safe homes; distribution ${JSON.stringify(byZone)}.`);

for(const zone of ['sunveil','mistwood']){
  const contracts=CONTRACTS.filter(c=>c.zone===zone);assert(contracts.length>=3,`${zone} has repeatable level30–60 quest choices`);
  for(const contract of contracts){
    const level=contract.requiredLevel;assert(level>=30&&level<=60);assert(contract.reward.xp>=level*100*.5,`${contract.id} rewards at least half the experience needed at its intended level`);
    if(contract.kind==='kill')assert(OVERWORLD_SPAWNS.some(s=>s.zone===zone&&(contract.target==='*'||s.kind===contract.target)&&surfaceAt(s.x,s.z).regionId===contract.targetRegion&&monsterSpawnLevel(s,contract.targetRegion)>=contract.targetLevel),`${contract.id} has real local targets at its required enemy level`);
    if(contract.kind==='gather')assert(ZONES.find(z=>z.id===zone).nodes.some(n=>contract.target==='*'||n.kind===contract.target),`${contract.id} has real local resource nodes`);
    const state=newContracts(),now=1000;assert(!acceptContract(state,contract.id,zone,now,level-1),'frontier contracts reject under-level players');assert(acceptContract(state,contract.id,zone,now,level));assert(!contractProgress(state,contract.kind,contract.target,contract.count),'frontier progress needs authoritative location');
    assert(contractProgress(state,contract.kind,contract.target,contract.count,{zone,regionId:contract.targetRegion,level:contract.targetLevel}));assert.equal(claimContract(state,contract.id,zone,now)?.id,contract.id);assert(!acceptContract(state,contract.id,zone,now,level),'completed notices respect their cooldown');assert(acceptContract(state,contract.id,zone,now+contract.cooldownMs,level),'frontier quests become repeatable after cooldown');
  }
}

for(const zone of ['sunveil','mistwood']){
  const scene=new THREE.Scene(),hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight(),camera=new THREE.PerspectiveCamera(50,1,.1,500),position=new THREE.Vector3(REGION_ORIGINS[zone].x,groundHeight(REGION_ORIGINS[zone].x,REGION_ORIGINS[zone].z),REGION_ORIGINS[zone].z);
  scene.add(hemi,sun);camera.position.copy(position).add(new THREE.Vector3(12,10,18));const cycle=createDayNightCycle(scene,hemi,sun),effects=createAmbientEffects(scene);
  for(const time of [0,WORLD_DAY_MS/2]){const sample=cycle.update(time,zone,false,position,camera);assert(scene.background instanceof THREE.Color&&scene.background.toArray().every(Number.isFinite));assert(sun.intensity>0&&hemi.intensity>0);effects.update(time/1000,{position,zone,dungeon:false,moving:false,sprinting:false,mounted:false,grounded:true,swimming:false,indoors:false,active:true,daylight:sample.daylight});assert(effects.root.visible);effects.root.traverse(mesh=>{if(mesh.isInstancedMesh){assert(mesh.count<=mesh.instanceMatrix.count);assert(mesh.instanceMatrix.array.every(Number.isFinite));}});}
  cycle.dispose();effects.dispose();
}

const {buildWorldMapScene,worldMapTerrainStep,worldMapHeight,disposeGroup}=await import('../src/world-map.ts');
const {minimapBounds}=await import('../src/minimap.ts');
hook.deregister();
assert.equal(worldMapTerrainStep(WORLD_BOUNDS),8,'full atlas uses bounded eight-metre sampling');
const atlas=buildWorldMapScene(false),matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),position=new THREE.Vector3(),rotation=new THREE.Quaternion();
assert.equal(atlas.ground.count,area(WORLD_BOUNDS)/8**2,'atlas area increases without quadrupling cube memory');
const box=new THREE.Box3().setFromObject(atlas.ground);for(const [axis,min,max] of [['x','minX','maxX'],['z','minZ','maxZ']]){assert.equal(box.min[axis],WORLD_BOUNDS[min]);assert.equal(box.max[axis],WORLD_BOUNDS[max]);}
for(let i=0;i<atlas.ground.count;i+=197){atlas.ground.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);assert(Math.abs(position.y+scale.y/2-worldMapHeight(position.x,position.z))<.0001,'LOD tile tops sample authoritative terrain');}
for(const camp of EXPEDITIONS)assert(atlas.labels.some(l=>l.point.id===camp.id&&l.text.includes(regionLevelLabel(camp.id,camp.zone))),`${camp.id} has its real discovery/range label on the atlas`);
let atlasDraws=0,atlasTriangles=0;atlas.group.traverse(object=>{if(object.isMesh){atlasDraws++;atlasTriangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);}});
assert(atlasTriangles<2_100_000,'atlas retains the existing2.1M triangle cap');disposeGroup(atlas.group);
for(const point of [...Object.values(REGION_ORIGINS),{x:WORLD_BOUNDS.minX,z:WORLD_BOUNDS.minZ},{x:WORLD_BOUNDS.maxX,z:WORLD_BOUNDS.maxZ}]){
  const bounds=minimapBounds(point.x,point.z);assert.equal(area(bounds),128**2);assert.equal(worldMapTerrainStep(bounds),4);const local=buildWorldMapScene(false,bounds);assert.equal(local.ground.count,1024,'minimap keeps detailed local terrain independent of total world area');
  assert(bounds.minX>=WORLD_BOUNDS.minX&&bounds.maxX<=WORLD_BOUNDS.maxX&&bounds.minZ>=WORLD_BOUNDS.minZ&&bounds.maxZ<=WORLD_BOUNDS.maxZ);disposeGroup(local.group);
}
console.log(`PASS frontier expansion: level1–60 homes, repeatable frontier quests, exact footprint buffers, legacy landmark coordinates, bounded atlas ${atlasDraws} draws/${atlasTriangles.toLocaleString()} triangles, eight detailed minimap samples (${((performance.now()-start)/1000).toFixed(1)}s).`);
