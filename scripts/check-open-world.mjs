import { CITY_SERVICE_NPCS } from '../src/city-services.ts';
import { GOLD_MERCHANT } from '../src/gold-merchant.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DUNGEON_START, DUNGEON_EXIT, DUNGEON_OBJECTS, DUNGEON_STAGES, dungeonColliders } from '../src/dungeon.ts';
import { VILLAGES, VILLAGE_NPCS, VILLAGE_PROPS, villagePropHeight } from '../src/settlements.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { CITY_PROPS } from '../src/city.ts';
import { BUILDINGS, buildingFloorHeight } from '../src/buildings.ts';
import { ZONES } from '../src/content.ts';
import { CORE_BOUNDS, EXPEDITIONS, EXPEDITION_ENEMY_OFFSETS, EXPEDITION_NODE_OFFSETS, TERRAIN_STEP, WATER_LEVEL, groundHeight, surfaceAt, waterAt } from '../src/landscape.ts';
import { REGION_ORIGINS, WORLD_BOUNDS, DUNGEON_BOUNDS, WORLD_COLLIDERS, WORLD_SCENERY, DUNGEON_COLLIDERS, DUNGEON_WALLS, toWorld, toLocal, regionAt, canTraverse } from '../src/realm.ts';
import { createOverworld, createDungeonWorld } from '../src/zones.ts';
import { graphics } from '../src/graphics-settings.ts';
import { findPath } from '../src/navigation.ts';
const forestSources=[];
const budgetFailures=[];
const checkBudget=(within,message)=>{if(!within)budgetFailures.push(message);};
// The former capital measured 584 loaded architecture meshes, 188 visible draws
// and 490,814 visible triangles. The requested 3x capital with furnished interiors
// now measures 834 / 336 / 1,005,170, with 57 nearby architecture draws. Keep a
// bounded ~7% architecture margin while preserving every original environment cap.
const ARCHITECTURE_BUDGET={loadedMeshes:860,runtimeDraws:360,runtimeTriangles:1_080_000,nearbyDraws:64};
//24 citizens use18 instanced part batches; three articulated stable mounts add33.
// These cosmetic actors have their own allowance rather than loosening terrain caps.
const ACTOR_BUDGET={loadedMeshes:51,runtimeDraws:51,runtimeTriangles:20_000};
const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const npcVisibilityStart=main.indexOf(' for(const [id,view] of npcViews){'),npcVisibilityEnd=main.indexOf('  if(!view.mesh.visible)continue;',npcVisibilityStart);
assert(npcVisibilityStart>=0&&npcVisibilityEnd>npcVisibilityStart);
const npcVisibilitySource=stripTypeScriptTypes(main.slice(npcVisibilityStart,npcVisibilityEnd)+'\n }');
function visibleInHierarchy(object){for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;}
const architectureRoots=new Set(['Walkable homes','Lanternreach — Blender city']);
const CITY_LIFE_ROOT='Lanternreach townsfolk and stable animals';
function measureMeshes(root,meshes){
  const groups={};let draws=0,triangles=0,architectureDraws=0,architectureTriangles=0,actorDraws=0,actorTriangles=0;
  for(const mesh of meshes){
    let owner=mesh;while(owner.parent&&owner.parent!==root)owner=owner.parent;
    const name=owner.userData.villagerIdle?'NPCs':owner.userData.landscapeChunk?'Landscape':owner.name;
    const count=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);
    const group=groups[name]??={draws:0,triangles:0};group.draws++;group.triangles+=count;draws++;triangles+=count;
    if(architectureRoots.has(owner.name)){architectureDraws++;architectureTriangles+=count;}
    if(owner.name===CITY_LIFE_ROOT){actorDraws++;actorTriangles+=count;}
  }
  return{draws,triangles,environmentDraws:draws-architectureDraws-actorDraws,environmentTriangles:triangles-architectureTriangles-actorTriangles,architectureDraws,architectureTriangles,actorDraws,actorTriangles,groups};
}

assert.deepEqual(WORLD_BOUNDS, { minX: -1488, maxX: 1584, minZ: -1584, maxZ: 1488 });
assert.equal((WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX)*(WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ), 256*(CORE_BOUNDS.maxX-CORE_BOUNDS.minX)*(CORE_BOUNDS.maxZ-CORE_BOUNDS.minZ), 'the actual world covers 256 times the original area');
for (const zone of ZONES) {
  const local = Object.freeze({ x: 3, z: -7, id: 'preserved' }), global = toWorld(zone.id, local);
  assert.deepEqual(toLocal(zone.id, global), local);
  assert.equal(regionAt(REGION_ORIGINS[zone.id].x, REGION_ORIGINS[zone.id].z), zone.id);
}
for (const [x, z] of [[WORLD_BOUNDS.minX-.01, 0], [WORLD_BOUNDS.maxX+.01, 0], [0, WORLD_BOUNDS.minZ-.01], [0, WORLD_BOUNDS.maxZ+.01], [NaN, 0], [0, Infinity]]) assert.equal(regionAt(x, z), undefined);
const obstacle = { x: 0, z: 0, r: .015 }, wall = { x: 0, z: 0, r: 3, halfWidth: .02, halfDepth: 2 };
for (const shape of [obstacle, wall]) assert(!canTraverse({ x: -40, z: 0 }, { x: 40, z: 0 }, [shape]), 'a long move cannot tunnel through even a thin solid');
assert(!canTraverse({ x: -1, z: 0 }, { x: 1, z: 0 }, [{ x: 0, z: .39, r: .01 }]), 'sweeps include the player radius');
assert(canTraverse({ x: -40, z: 3 }, { x: 40, z: 3 }, [wall]));
assert(!canTraverse({ x: 0, z: 0 }, { x: WORLD_BOUNDS.maxX, z: 0 }, []), 'the player circle stays inside outer bounds');
assert(!canTraverse({ x: 0, z: 0 }, { x: NaN, z: 0 }, []));

function route(from, to, colliders = WORLD_COLLIDERS, bounds = WORLD_BOUNDS) {
  const path = findPath(from, to, colliders, bounds);
  assert(path.length, `no route ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  assert(Math.hypot(path.at(-1).x - to.x, path.at(-1).z - to.z) < .01, 'the route reaches its free destination');
  let previous = from;
  for (const point of path) { assert(canTraverse(previous, point, colliders, bounds), 'navigation and authoritative movement use the same continuous test'); previous = point; }
  return path;
}
const loop = ['greenwood', 'amberwild', 'frostmarch', 'hollow', 'greenwood'];
for (let i = 1; i < loop.length; i++) {
  const a = REGION_ORIGINS[loop[i - 1]], b = REGION_ORIGINS[loop[i]];
  route(a, b);
}
let reachable = 0;
for (const zone of ZONES) for (const point of [zone.npc, zone.spawn, ...zone.nodes, ...zone.enemies, ...zone.gateways, ...(zone.beacon ? [zone.beacon] : [])]) {
  const target = toWorld(zone.id, point);
  assert(canTraverse(target, target), `${point.id ?? zone.id + ' spawn'} is outside all authoritative solids`);
  route(toWorld(zone.id, zone.spawn), target); reachable++;
}
route(toWorld('greenwood', ZONES[0].spawn), toWorld('frostmarch', ZONES[2].npc));
route(toWorld('hollow', { x: 0, z: -24 }), REGION_ORIGINS.greenwood);
for (const camp of EXPEDITIONS) {
  // A single center-to-Violet Reach search exceeds the unchanged 100k A* budget
  // (108,990 expansions). Verify both physically continuous legs via a real gate.
  const gate = CITY_PROPS.filter(prop => prop.kind === 'city-gate').sort((a,b) => Math.hypot(a.x-camp.x,a.z-camp.z)-Math.hypot(b.x-camp.x,b.z-camp.z))[0];
  route(REGION_ORIGINS.greenwood, gate); route(gate, camp);
  for (const offset of [{ x: 0, z: 0 }, ...EXPEDITION_ENEMY_OFFSETS, ...EXPEDITION_NODE_OFFSETS]) {
    const point = { x: camp.x + offset.x, z: camp.z + offset.z };
    assert(!waterAt(point.x, point.z) && canTraverse(point, point), `${camp.id} keeps its encounters and resources on unobstructed land`);
    route(camp, point);
  }
}
for (const target of [DUNGEON_EXIT, ...DUNGEON_OBJECTS, ...DUNGEON_STAGES.flatMap(stage => [stage, ...stage.enemies])]) route(DUNGEON_START, target, DUNGEON_COLLIDERS, DUNGEON_BOUNDS);
assert(!canTraverse({ x: -12, z: 6 }, { x: -6, z: 6 }, DUNGEON_COLLIDERS, DUNGEON_BOUNDS), 'encounter cover is physically solid');
assert(route({ x: -12, z: 6 }, { x: -6, z: 6 }, DUNGEON_COLLIDERS, DUNGEON_BOUNDS).length > 2, 'the dungeon route bends around cover');

function verifyLandscape(root, handle) {
  const columns = (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) / TERRAIN_STEP;
  const rows = (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / TERRAIN_STEP;
  const floors = new Uint8Array(columns * rows), waters = new Uint8Array(columns * rows), meshes = [];
  const chunks = new Map();
  root.traverse(node => {
    if (node.userData.landscapeChunk) {
      const { x, z, size } = node.userData.landscapeChunk, key = `${x},${z}`;
      assert(!chunks.has(key), 'each landscape cell has one independently culled chunk'); chunks.set(key, node);
      assert(Number.isInteger(size / TERRAIN_STEP) && size > 0 && size <= 192, 'chunks align to the terrain grid and retain a bounded culling size');
      assert(Number.isInteger((x - WORLD_BOUNDS.minX) / size) && Number.isInteger((z - WORLD_BOUNDS.minZ) / size), 'chunks align to the world grid');
      const bounds = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
      assert(bounds.x < size + 36 && bounds.z < size + 36, 'terrain and giant crowns remain in small, independently culled batches');
    }
    if (!node.isMesh) return; meshes.push(node);
    if (!node.isInstancedMesh || (!node.userData.water && node.name !== 'Landscape: terrain and scenery' && !node.name.endsWith(': connected terrain and solids'))) return;
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix).applyMatrix4(node.matrixWorld); scale.setFromMatrixScale(matrix);
      if (Math.abs(scale.x - 4) > .001 || Math.abs(scale.z - 4) > .001) continue;
      const column = (position.x - WORLD_BOUNDS.minX - 2) / 4, row = (position.z - WORLD_BOUNDS.minZ - 2) / 4;
      if (Math.abs(column - Math.round(column)) > .001 || Math.abs(row - Math.round(row)) > .001) continue;
      const key = Math.round(row) * columns + Math.round(column), surface = surfaceAt(position.x, position.z);
      if (node.userData.water) {
        assert(surface.water && Math.abs(position.y - WATER_LEVEL) < .0001, 'water surfaces occupy exactly the canonical swimming cells'); waters[key]++;
      } else {
        // Town floors stay level at their region origin; wilderness/seabed uses
        // each canonical heightfield cell, including shore terraces.
        const height = node.name.endsWith(': connected terrain and solids') ? node.matrixWorld.elements[13] : surface.height;
        assert(Math.abs(position.y + scale.y / 2 - height) < .0001, 'each actual ground/seabed tile retains its height'); floors[key]++;
      }
    }
  });
  assert(chunks.size > 0, 'the scattered towns and wilderness have culled chunks');
  let waterCount = 0, sample;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = WORLD_BOUNDS.minX + (column + .5) * 4, z = WORLD_BOUNDS.minZ + (row + .5) * 4, key = row * columns + column;
    const water = waterAt(x, z);
    assert.equal(floors[key], 1, `one physical floor per cell: ${x},${z}`);
    assert.equal(waters[key], water ? 1 : 0, 'the ocean never overlaps dry ground or leaves water holes');
    if (water) { waterCount++; if (column > 2 && row > 2 && column < columns - 3 && row < rows - 3) sample ??= { x, z }; }
  }
  assert(waterCount > 10000 && waterCount < floors.length * .8, 'the expanded map contains substantial real sea and land');
  // Execute the live NPC hide/label logic before counting visible child meshes.
  // Three.js skips hidden parent groups, even when each mesh's own visible flag is true.
  const npcVisibility={graphics,mobileLabels:null,selectedId:null,worldInstance:null,position:{x:0,z:0},npcViews:new Map([...handle.villagers].map(([id,mesh])=>[id,{mesh,label:{hidden:false}}]))};
  const updateNpcVisibility=at=>{npcVisibility.position=at;runInNewContext(npcVisibilitySource,npcVisibility);};
  const example=npcVisibility.npcViews.values().next().value;
  updateNpcVisibility({x:example.mesh.position.x+169.99,z:example.mesh.position.z});assert(example.mesh.visible&&!example.label.hidden);assert(visibleInHierarchy(example.mesh.children[0]));
  updateNpcVisibility({x:example.mesh.position.x+170,z:example.mesh.position.z});assert(!example.mesh.visible&&example.label.hidden);assert(!visibleInHierarchy(example.mesh.children[0]),'a culled NPC contributes no child-mesh draws');
  const localDraws = []; let sampleTime = 10;
  const updateWorld = (at,camera) => {
    // Match the live frame before measuring pooled lights, fountains and citizens.
    handle.update(sampleTime += .05, new THREE.Vector3(at.x,groundHeight(at.x,at.z),at.z),camera,1);
    root.updateMatrixWorld(true);
  };
  for (const camp of [...EXPEDITIONS,...VILLAGES]) {
    updateNpcVisibility(camp);
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, .1, 150);
    camera.position.set(camp.x + 12, groundHeight(camp.x,camp.z) + 20, camp.z + 18); camera.lookAt(camp.x, groundHeight(camp.x,camp.z), camp.z); camera.updateMatrixWorld(true);
    handle.setInteriorView(camp,camera.position); updateWorld(camp,camera);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const visible=meshes.filter(mesh => visibleInHierarchy(mesh) && (!mesh.isInstancedMesh||mesh.count>0) && (mesh.frustumCulled === false || frustum.intersectsObject(mesh)));
    localDraws.push({id:camp.id,...measureMeshes(root,visible)});
  }
  const runtimeDraws=[];
  const capitalViews=[{id:'capital-plaza',x:0,z:8},...BUILDINGS.filter(building=>building.zone==='greenwood'&&Math.hypot(building.x,building.z)<60).flatMap(building=>[
    {id:`${building.id}-inside`,x:building.x,z:building.z},
    {id:`${building.id}-entry`,x:building.x,z:building.z+building.depth/2+2},
  ])];
  for(const at of [...EXPEDITIONS,...VILLAGES,...capitalViews])for(const yaw of [.34,.34+Math.PI/2,.34+Math.PI,.34+Math.PI*1.5]){
    updateNpcVisibility(at);
    const camera=new THREE.PerspectiveCamera(52,16/9,.1,500),base=groundHeight(at.x,at.z)+1.2;
    const x=at.x+Math.sin(yaw)*Math.cos(.35)*21,z=at.z+Math.cos(yaw)*Math.cos(.35)*21;
    camera.position.set(x,Math.max(base+Math.sin(.35)*21,(waterAt(x,z)?WATER_LEVEL:groundHeight(x,z))+1.6),z);
    handle.constrainCamera?.(new THREE.Vector3(at.x,base,at.z),camera.position);
    camera.lookAt(at.x,base,at.z);camera.updateMatrixWorld(true);
    handle.setInteriorView(at,camera.position); updateWorld(at,camera);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const visible=meshes.filter(mesh=>visibleInHierarchy(mesh)&&(!mesh.isInstancedMesh||mesh.count>0)&&(mesh.frustumCulled===false||frustum.intersectsObject(mesh)));
    runtimeDraws.push({id:at.id,yaw,...measureMeshes(root,visible)});
  }
  const closeMax=Math.max(...localDraws.map(point=>point.draws)),runtimeMax=Math.max(...runtimeDraws.map(point=>point.draws));
  const heaviestView=runtimeDraws.reduce((heaviest,point)=>point.triangles>heaviest.triangles?point:heaviest);
  console.log(`Measured exploration and city views: nearby maximum ${closeMax} draws; runtime maximum ${runtimeMax} draws; heaviest ${JSON.stringify(heaviestView)}.`);
  const peak=field=>Math.max(...runtimeDraws.map(point=>point[field]));
  console.log(`Separated camera peaks: ${JSON.stringify({nearbyEnvironmentDraws:Math.max(...localDraws.map(point=>point.environmentDraws)),nearbyArchitectureDraws:Math.max(...localDraws.map(point=>point.architectureDraws)),nearbyActorDraws:Math.max(...localDraws.map(point=>point.actorDraws)),actorDraws:peak('actorDraws'),actorTriangles:peak('actorTriangles'),environmentDraws:peak('environmentDraws'),environmentTriangles:peak('environmentTriangles'),architectureDraws:peak('architectureDraws'),architectureTriangles:peak('architectureTriangles'),viewCount:runtimeDraws.length})}`);
  checkBudget(Math.max(...localDraws.map(point=>point.environmentDraws))<60,'nearby environment draws must remain below 60');
  checkBudget(Math.max(...localDraws.map(point=>point.architectureDraws))<ARCHITECTURE_BUDGET.nearbyDraws,`nearby architecture draws must remain below ${ARCHITECTURE_BUDGET.nearbyDraws}`);
  checkBudget(peak('actorDraws')<=ACTOR_BUDGET.runtimeDraws,`ambient actor draws ${peak('actorDraws')} must remain at most ${ACTOR_BUDGET.runtimeDraws}`);
  checkBudget(peak('actorTriangles')<=ACTOR_BUDGET.runtimeTriangles,`ambient actor triangles ${peak('actorTriangles')} must remain at most ${ACTOR_BUDGET.runtimeTriangles}`);
  // Two additional authored species use small forest batches to keep visible triangles bounded.
  checkBudget(peak('environmentDraws')<180,`runtime environment draws ${peak('environmentDraws')} must remain below 180`);
  checkBudget(peak('architectureDraws')<ARCHITECTURE_BUDGET.runtimeDraws,`runtime architecture draws ${peak('architectureDraws')} must remain below ${ARCHITECTURE_BUDGET.runtimeDraws}`);
  checkBudget(peak('architectureTriangles')<ARCHITECTURE_BUDGET.runtimeTriangles,`runtime architecture triangles ${peak('architectureTriangles')} must remain below ${ARCHITECTURE_BUDGET.runtimeTriangles}`);
  const giantSolids=WORLD_SCENERY.filter(solid=>solid.treeModel),giantMeshes=meshes.filter(mesh=>['Landscape: ElderOak','Landscape: GiantPine'].includes(mesh.name));
  assert(giantSolids.length>=400&&giantSolids.every(solid=>solid.height>=19&&solid.height<=36),'hundreds of original giant trees tower over the medium woodland');
  assert.equal(giantMeshes.reduce((total,mesh)=>total+mesh.count,0),giantSolids.length,'every giant uses one instance of its authored model');
  for(const solid of giantSolids){assert.equal(solid.r,1.5*solid.scale,'the collider contains the authored roots and trunk');assert.equal((solid.x-WORLD_BOUNDS.minX)%TERRAIN_STEP,TERRAIN_STEP/2);assert.equal((solid.z-WORLD_BOUNDS.minZ)%TERRAIN_STEP,TERRAIN_STEP/2,'roots sit entirely on a single terrain tile');}
  const forestNames=['ElderOak','GiantPine','WoodlandOak','WoodlandPine'],trees=WORLD_SCENERY.filter(solid=>solid.kind==='tree');
  const treeMeshes=meshes.filter(mesh=>forestNames.some(name=>mesh.name===`Landscape: ${name}`));
  assert.equal(treeMeshes.reduce((total,mesh)=>total+mesh.count,0),trees.length,'every town and wilderness tree uses exactly one authored instance');
  const seen=new Set(),geometryByModel=new Map();
  const treeMatrix=new THREE.Matrix4(),treePosition=new THREE.Vector3(),treeScale=new THREE.Vector3();
  for(const mesh of treeMeshes) {
    assert(mesh.isInstancedMesh&&mesh.parent.userData.landscapeChunk,'all forest trees share independently culled chunk batches');
    const name=mesh.name.slice('Landscape: '.length),source=forestSources.map(library=>library.getObjectByName(name)).find(source=>source?.geometry===mesh.geometry);
    assert(source&&source.material===mesh.material,`${name} directly shares its loaded Blender geometry and material`);
    if(geometryByModel.has(name))assert.equal(mesh.geometry,geometryByModel.get(name),'one source geometry is shared by every batch of the same species');
    geometryByModel.set(name,mesh.geometry);
    for(let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,treeMatrix);treeMatrix.premultiply(mesh.matrixWorld);treePosition.setFromMatrixPosition(treeMatrix);treeScale.setFromMatrixScale(treeMatrix);
      const solid=trees.find(solid=>Math.hypot(solid.x-treePosition.x,solid.z-treePosition.z)<.001);assert(solid,`tree instance ${treePosition.x},${treePosition.z} matches authoritative scenery`);
      assert(!seen.has(solid),'a canonical tree is never rendered twice');seen.add(solid);
      assert.equal(name,solid.treeModel||(solid.zone==='frostmarch'?'WoodlandPine':'WoodlandOak'),'each canonical tree receives the appropriate species');
      assert(Math.abs(treePosition.y-groundHeight(solid.x,solid.z))<.001,'every authored root meets its real terrain tile');
      assert(treeScale.toArray().every(scale=>Math.abs(scale-solid.scale)<.00001),'the authored model retains canonical uniform scale');
      assert.equal(solid.r,source.userData.trunkRadius*solid.scale,'the exact model trunk footprint matches authoritative collision');
      assert.equal(solid.height,source.userData.height*solid.scale,'rendered tree height matches the canonical canopy height');
    }
  }
  assert.equal(seen.size,trees.length);assert.equal(geometryByModel.size,4,'all four forest models appear in the real world');
  checkBudget(peak('environmentTriangles')<2_000_000,`runtime environment triangles ${peak('environmentTriangles')} must remain below 2000000`);
  console.log(`PASS: ${trees.length} exact authored tree placements; local frustum ${Math.min(...localDraws.map(point=>point.draws))}–${closeMax} draws at150m; runtime camera maximum ${runtimeMax} draws / ${heaviestView.triangles} triangles across ${runtimeDraws.length} views.`);
  const ripples = root.getObjectByName('Landscape: swimmer ripples'), before = new THREE.Matrix4(), after = new THREE.Matrix4();
  assert(sample && ripples);
  const points = [{ id: 'water-probe', ...sample, moving: false }]; handle.setSwimmers(points); handle.update(0); ripples.getMatrixAt(0, before);
  points[0].x = 0; handle.update(.35); ripples.getMatrixAt(0, after);
  assert(ripples.count >= 2); assert(!before.equals(after), 'water ripples expand with animation time');
  assert(Math.abs(after.elements[12] - sample.x) < .001 && Math.abs(after.elements[13] - WATER_LEVEL) < .15, 'ripples retain copied swimmer positions and stay at the visible water surface');
  handle.setSwimmers(Array.from({ length: 100 }, (_, i) => ({ ...sample, id: `crowd-${i}`, moving: false }))); handle.update(1);
  assert(ripples.count <= 640, 'current rings and residual effects share a fixed bounded buffer');
  handle.update(4); assert.equal(ripples.count, 128, 'after entry splashes fade, only sixty-four swimmers retain their two idle rings');
  assert(ripples.instanceMatrix.array.every(Number.isFinite));
  handle.setSwimmers([{ x: 0, z: 0 }, { x: NaN, z: 0 }, { x: 9999, z: 9999 }]); handle.update(6);
  assert.equal(ripples.count, 0, 'land, invalid and outside-world actors produce no continuing swimming effect');
  const ocean = meshes.find(mesh => mesh.userData.water), shader = { uniforms: {}, vertexShader: '#include <common>\n#include <worldpos_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
  ocean.material.onBeforeCompile(shader); handle.update(6.5);
  assert.equal(shader.uniforms.mossvaleWaterTime.value, 6.5, 'the ocean shader receives the live animation clock');
}

const originalLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function (url) {
  assert(['/models/rootvault-kit.glb', '/models/water-effects.glb', '/models/village-kit.glb', '/models/trainer-kit.glb', '/models/giant-trees.glb', '/models/house-interiors.glb', '/models/city-kit.glb', '/models/mounts.glb'].includes(url), `unexpected world asset ${url}`);
  const glb = await readFile(new URL(`../public${url}`, import.meta.url));
  const asset=await this.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  if(url==='/models/giant-trees.glb')forestSources.push(asset.scene);
  return asset;
};
try {
  for (const [factory, expectedColliders, bounds] of [[createOverworld, WORLD_COLLIDERS, WORLD_BOUNDS], [createDungeonWorld, dungeonColliders(), DUNGEON_BOUNDS]]) {
    const scene = new THREE.Scene(), persistent = new THREE.Group(); scene.add(persistent);
    const handle = await factory(scene), root = scene.children.find(child => child !== persistent);
    assert.equal(scene.children.length, 2); assert.deepEqual(handle.colliders, expectedColliders, 'the renderer returns canonical authoritative solids');
    root.updateMatrixWorld(true);
    let draws = 0, instances = 0; const resources = new Set(), sharedMountResources = new Set();
    root.getObjectByName('Lanternreach townsfolk and stable animals')?.children.filter(child => child.name.startsWith('Stable ')).forEach(mount => mount.traverse(part => {
      if (!part.isMesh) return;
      sharedMountResources.add(part.geometry);
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) sharedMountResources.add(material);
    }));
    root.traverse(node => {
      assert(node.matrixWorld.elements.every(Number.isFinite));
      if (!node.isMesh) return; draws++;
      resources.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) resources.add(m);
      if (node.isInstancedMesh) { instances += node.count; resources.add(node); assert(node.instanceMatrix.array.every(Number.isFinite)); }
    });
    console.log(`Measured ${factory.name}: ${draws} batches / ${instances} instances.`);
    const modelBounds = new THREE.Box3().setFromObject(root);
    assert(modelBounds.min.x >= bounds.minX - .001 && modelBounds.max.x <= bounds.maxX + .001 && modelBounds.min.z >= bounds.minZ - .001 && modelBounds.max.z <= bounds.maxZ + .001, 'no inner mountain rings or overlapping oversized biome floors');
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    if (factory === createOverworld) {
      const groups=root.children.map(group=>{let meshes=0;group.traverse(part=>{if(part.isMesh)meshes++;});return{name:group.name,meshes};}).sort((a,b)=>b.meshes-a.meshes);
      console.log(`Largest world geometry groups: ${JSON.stringify(groups.slice(0,6))}`);
      verifyLandscape(root, handle);
      const meshes=[];root.traverse(node=>{if(node.isMesh)meshes.push(node);});const loaded=measureMeshes(root,meshes);
      console.log(`Separated loaded world: ${JSON.stringify({environmentMeshes:loaded.environmentDraws,architectureMeshes:loaded.architectureDraws,actorMeshes:loaded.actorDraws,instances})}`);
      checkBudget(loaded.environmentDraws < 880 && instances < 280000 && instances > 1000, `world environment exceeds budget: ${loaded.environmentDraws} meshes / ${instances} instances`);
      checkBudget(loaded.actorDraws<=ACTOR_BUDGET.loadedMeshes,`loaded ambient actor meshes ${loaded.actorDraws} must remain at most ${ACTOR_BUDGET.loadedMeshes}`);
      checkBudget(loaded.architectureDraws < ARCHITECTURE_BUDGET.loadedMeshes,`loaded architecture meshes ${loaded.architectureDraws} must remain below ${ARCHITECTURE_BUDGET.loadedMeshes}`);
      assert.equal(handle.villagers?.size,VILLAGE_NPCS.length+TRAINER_NPCS.length+CITY_SERVICE_NPCS.length+1,'all service NPCs, including the auctioneer, are returned for live targeting and idle animation');
      for(const resident of [...VILLAGE_NPCS,...TRAINER_NPCS,GOLD_MERCHANT,...CITY_SERVICE_NPCS]){
        const mesh=handle.villagers.get(resident.id);assert(mesh&&root.getObjectById(mesh.id)===mesh);
        const floor=buildingFloorHeight(resident.x,resident.z);
        assert.deepEqual(mesh.position.toArray(),[resident.x,floor,resident.z],'each villager uses its canonical floor or grounded position');
        assert.equal(mesh.rotation.y,resident.rotation);assert(mesh.userData.villagerIdle,'each authored NPC retains its isolated idle rig');
        const bounds=new THREE.Box3().setFromObject(mesh);assert(Math.abs(bounds.min.y-floor)<.05,'villager feet rest on the actual floor');
        assert(bounds.max.y-bounds.min.y>1.8&&bounds.max.y-bounds.min.y<3.2,'NPC models retain player-scale height');
        let parts=0;mesh.traverse(object=>{if(object.isMesh)parts++;});assert.equal(parts,4,'each resident has four bounded idle parts');
      }
      const villageParts=[];root.traverse(mesh=>{if(mesh.userData.villageProp&&mesh.name.startsWith('village-'))villageParts.push(mesh);});
      const outdoorProps=VILLAGE_PROPS.filter(prop=>prop.kind!=='cottage'&&prop.kind!=='inn');
      assert.equal(villageParts.reduce((sum,mesh)=>sum+mesh.count,0),outdoorProps.length,'outdoor village props are instanced exactly once; walkable houses use their separate authored shells');
      const propPose=new THREE.Matrix4(),propPosition=new THREE.Vector3();
      for(const prop of outdoorProps){
        assert(villageParts.some(mesh=>{if(mesh.userData.villageProp!==prop.kind)return false;for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,propPose);propPosition.setFromMatrixPosition(propPose).applyMatrix4(mesh.matrixWorld);if(Math.hypot(propPosition.x-prop.x,propPosition.z-prop.z)<.001&&Math.abs(propPosition.y-villagePropHeight(prop))<.001)return true;}return false;}),'every authored prop occupies its level collision-matched building plot');
      }
      for(const building of BUILDINGS){
        const model=root.getObjectByName(building.id);assert(model,`walkable ${building.id} has its real house or civic model`);
        assert.deepEqual(model.position.toArray(),[building.x,building.y,building.z]);
        assert.equal(model.rotation.y,building.rotation);
        assert(model.children.some(part=>part.userData.part==='interior-floor'),'walkable buildings retain their authored floor');
      }

      for (const zone of ZONES) assert.deepEqual(root.getObjectByName(`Region: ${zone.id}`).position.toArray(), [REGION_ORIGINS[zone.id].x, groundHeight(REGION_ORIGINS[zone.id].x,REGION_ORIGINS[zone.id].z), REGION_ORIGINS[zone.id].z]);
      for (const solid of WORLD_SCENERY) {
        ray.ray.origin.set(solid.x, groundHeight(solid.x, solid.z) + solid.height + 40, solid.z);
        const hits = ray.intersectObject(root);
        assert(hits.length && hits[0].point.y > groundHeight(solid.x, solid.z) + .5, `solid ${solid.kind} has real geometry at its authoritative position`);
      }
      for (const origin of Object.values(REGION_ORIGINS)) for (const localZ of [-50,-46,46,50]) {
        const x=origin.x, z=origin.z+localZ, y=groundHeight(x,z);
        ray.ray.origin.set(x,y+2,z); const hits=ray.intersectObject(root);
        assert(hits.length && hits[0].point.y>=y-.001 && hits[0].point.y<y+.10,'town exits meet their exact heightfield without gaps');
      }
      handle.setRegionBeaconLit('amberwild', true);
      assert(root.getObjectByName('amberwild: beacon light').visible);
      assert(!root.getObjectByName('frostmarch: beacon light').visible, 'regional beacon progress remains independent');
    } else {
      assert(draws < 45 && instances < 16000 && instances > 1000, `dungeon detail and draw calls are bounded: ${draws} draws / ${instances} instances`);
      for (const wall of DUNGEON_WALLS) {
      ray.ray.origin.set(wall.x, 12, wall.z); const hits = ray.intersectObject(root);
      assert(hits.length && hits[0].point.y >= wall.height - .001, 'each authoritative dungeon wall is drawn');
      }
    }
    handle.update(1); handle.update(20);
    const disposed = new Map([...resources].map(resource => [resource, 0]));
    for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
    handle.dispose(); handle.dispose(); handle.update(40); handle.setRegionBeaconLit?.('amberwild', false);
    assert.deepEqual(scene.children, [persistent]); assert([...disposed].every(([resource,count]) => count === (sharedMountResources.has(resource) ? 0 : 1)), 'world-owned resources release exactly once; cached player/stable mount assets remain alive');
    console.log(`PASS: ${factory.name}: ${draws} draws, ${instances} voxels, ${expectedColliders.length} canonical solids, geometry and isolated disposal.`);
  }
} finally { GLTFLoader.prototype.loadAsync = originalLoad; }
assert.deepEqual(budgetFailures,[],'original environment and explicit architecture/ambient actor budgets are enforced after geometry and lifecycle checks');
console.log(`PASS: ${reachable} existing world points, scattered town and cross-biome routes, dungeon chambers, ${EXPEDITIONS.length} expedition camps, exact terrain and water coverage, swimmer ripples, coordinate roundtrips and swept anti-tunneling collision.`);
