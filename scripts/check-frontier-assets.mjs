import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBuildingModels } from '../src/building-models.ts';
import { BUILDINGS, BUILDING_CHAIRS, buildingPoint } from '../src/buildings.ts';
import { insideAnyCity as insideCity, BANK_HOME_ID, BANK_HOME_IDS, CITY_FURNISHINGS } from '../src/city.ts';

const biomes=['sunveil','mistwood','greenwood','amberwild','frostmarch','hollow'];
const ids = [...biomes.flatMap(biome=>['cottage','inn','market'].map(kind=>`${biome}-${kind}`)),
  'sunveil-palm','sunveil-cactus','sunveil-rock','mistwood-broadleaf','mistwood-fern','mistwood-root','hollow-gate'];
const raw = await readFile(new URL('../public/models/frontier-biomes.glb', import.meta.url));
const doc = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)));
assert(raw.length < 4_000_000, 'six complete reusable biome kits and gate stay below 4MB');
assert(!doc.images?.length && !doc.textures?.length && !doc.animations?.length, 'geometry palette has no texture or animation payload');
assert(!doc.cameras?.length && !doc.extensionsRequired?.some(x => /draco|meshopt/i.test(x)), 'native GLTFLoader needs no new decoder');
const kit = (await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '')).scene;
assert.deepEqual(kit.children.map(n => n.name).sort(), ids.map(id => `frontier-${id}`).sort());
kit.updateMatrixWorld(true);
const materials = new Set(), point = new THREE.Vector3();
let triangles = 0, draws = 0;
for (const root of kit.children) {
  assert.deepEqual(root.position.toArray(), [0, 0, 0], `${root.name}: ground pivot`);
  assert.deepEqual(root.scale.toArray(), [1, 1, 1], `${root.name}: authored metre scale`);
  const bounds = new THREE.Box3().setFromObject(root);
  assert(bounds.min.y > -.0001 && bounds.max.y > 1, `${root.name}: finite ground-based geometry`);
  assert(root.userData.width > 0 && root.userData.depth > 0);
  assert(Array.isArray(JSON.parse(root.userData.solidFootprints)));
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    materials.add(mesh.material); draws++;
    assert(mesh.geometry.attributes.color && mesh.material.vertexColors, `${mesh.name}: exported palette`);
    assert(mesh.userData.part && mesh.matrixWorld.elements.every(Number.isFinite));
    for (const a of Object.values(mesh.geometry.attributes)) assert(a.array.every(Number.isFinite));
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  });
}
assert.equal(materials.size, 2, 'all biome models share one opaque palette and one clear glazing material');
assert.equal([...materials].filter(material=>material.transparent&&material.opacity<=.25).length,1);
assert.equal(draws, 125, 'each wall batches its clear panes; two Greenwood dormers share roof glazing');
assert(triangles < 120_000, 'repeated towns and vegetation use bounded geometry');

const ray = new THREE.Raycaster();
for (const biome of biomes) for (const [kind, w, d] of [['cottage', 10, 9], ['inn', 14, 12]]) {
  const root = kit.getObjectByName(`frontier-${biome}-${kind}`);
  assert.equal(root.userData.assetKind, 'exterior');
  assert.deepEqual([root.userData.width, root.userData.depth, root.userData.doorWidth, root.userData.doorHeight], [w,d,2.8,3.6]);
  assert.deepEqual(root.children.filter(n=>!n.userData.part.endsWith('-glass')).map(n => n.userData.part).sort(), ['roof-shingles','shell-back','shell-front','shell-left','shell-right']);
  // A moving adult-sized capsule must pass the real rendered doorway, not just the collider gap.
  for (const x of [-1.30, -.70, 0, .70, 1.30]) for (const y of [.1, 1, 2.2, 3.50]) {
    ray.set(new THREE.Vector3(x,y,d/2+2),new THREE.Vector3(0,0,-1)); ray.far=3;
    assert.equal(ray.intersectObject(root,true).length,0, `${root.name}: clear door at ${x},${y}`);
  }
  // No low roof/decoration or new furniture intrudes into the existing walkable room.
  for (const mesh of root.children) {
    const positions=mesh.geometry.attributes.position;
    for (let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
      if (point.y < .02 || point.y > 3.59) continue;
      assert(Math.abs(point.x)>=w/2-.176 || Math.abs(point.z)>=d/2-.176,
        `${mesh.name}: preserve existing room and chair circulation`);
      assert(Math.abs(point.x)<=w/2+.176 && Math.abs(point.z)<=d/2+.176,
        `${mesh.name}: low facade fits original wall collision footprint`);
    }
  }
  const clone=root.clone(true);
  for (const mesh of clone.children) mesh.visible=false;
  assert(root.children.every(mesh=>mesh.visible), 'interior cutaways do not alter the shared source');
  assert.equal(clone.children[0].geometry,root.children[0].geometry,'cutaways retain shared geometry');
}
const palmBounds = new THREE.Box3().setFromObject(kit.getObjectByName('frontier-sunveil-palm'));
const jungleBounds = new THREE.Box3().setFromObject(kit.getObjectByName('frontier-mistwood-broadleaf'));
assert(palmBounds.max.y>11 && jungleBounds.max.y>16, 'new tree silhouettes rise above town roofs');
const duneRoof = new THREE.Box3().setFromObject(kit.getObjectByName('frontier-sunveil-inn')).max.y;
const jungleRoof = new THREE.Box3().setFromObject(kit.getObjectByName('frontier-mistwood-inn')).max.y;
assert(jungleRoof > duneRoof + 1, 'jungle leaf roofs and desert terraces have distinct silhouettes');
const gate=kit.getObjectByName('frontier-hollow-gate');
assert.deepEqual(JSON.parse(gate.userData.solidFootprints),[[-4,0,2,6],[4,0,2,6]]);
assert(new THREE.Box3().setFromObject(gate).max.y>=11.9,'Hollow has a substantial dedicated entrance');
for(const x of [-2.8,-1.4,0,1.4,2.8])for(const y of [.1,2.2,5.8]) {
  ray.set(new THREE.Vector3(x,y,5),new THREE.Vector3(0,0,-1));ray.far=10;
  assert.equal(ray.intersectObject(gate,true).length,0,'six-metre entrance remains open behind guardian');
}
for(const side of [-1,1]) {
  ray.set(new THREE.Vector3(side*4,2.2,5),new THREE.Vector3(0,0,-1));ray.far=10;
  assert(ray.intersectObject(gate,true).length,'Hollow piers are real geometry');
}
assert((await stat(new URL('../assets/source/frontier-biomes.blend',import.meta.url))).size>100_000, 'editable source retained');
const png = await readFile(new URL('../assets/source/frontier-biomes-preview.png',import.meta.url));
assert.equal(png.subarray(1,4).toString(),'PNG');
assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[2000,1250]);

// Exercise the real replacement path with the shipped interiors and civic library.
async function load(path) {
  const b=await readFile(new URL(path,import.meta.url));
  return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;
}
const interiors=await load('../public/models/house-interiors.glb');
interiors.add(await load('../public/models/city-kit.glb'));
const furnishings=await load('../public/models/city-furnishings.glb');
const homes=createBuildingModels(interiors,kit,furnishings);
assert.equal(homes.root.children.length,BUILDINGS.length);
assert.equal(homes.chairs.size,BUILDING_CHAIRS.length);
homes.root.updateMatrixWorld(true);
const frontierHomes=BUILDINGS.filter(home=>['cottage','inn'].includes(home.kind)&&(home.zone!=='greenwood'||!insideCity(home.x,home.z)));
for(const biome of biomes)for(const kind of ['cottage','inn'])
  assert(frontierHomes.some(home=>home.zone===biome&&home.kind===kind),`${biome}: ${kind} is used by a real town`);
for(const home of frontierHomes) {
  const model=homes.root.getObjectByName(home.id),parts=new Map();
  model.traverse(part=>{if(part.isMesh&&part.userData.part)parts.set(part.userData.part,part);});
  const original=interiors.getObjectByName(`house-${insideCity(home.x,home.z)?'city-':''}${home.kind}`);
  const replacement=kit.getObjectByName(`frontier-${home.zone}-${home.kind}`);
  assert.equal(model.getObjectByName(replacement.name)?.parent,model,`${home.id}: replacement mounted in the house frame`);
  assert.equal([...parts].filter(([name])=>/^(shell|roof)-/.test(name)&&name!=='shell-front-bank-crest').length,replacement.children.length,`${home.id}: old roofs/gables removed and new glazing retained`);
  for(const source of replacement.children) {
    assert.equal(parts.get(source.userData.part)?.geometry,source.geometry,`${home.id}: uses actual frontier exterior buffers`);
    assert.equal(parts.get(source.userData.part).castShadow,!source.userData.part.endsWith('-glass'));
    assert(parts.get(source.userData.part).receiveShadow);
  }
  for(const source of original.children.filter(part=>String(part.userData.part).startsWith('interior-')&&(home.id!==BANK_HOME_IDS[home.zone]||part.userData.part==='interior-floor')))
    assert.equal(parts.get(source.userData.part)?.geometry,source.geometry,`${home.id}: original interior preserved`);
  const expectedHeight=new THREE.Box3().setFromObject(replacement).max.y;
  assert(Math.abs(new THREE.Box3().setFromObject(model).max.y-home.y-expectedHeight)<.003,`${home.id}: full authored roof height retained`);
  for(const chair of BUILDING_CHAIRS.filter(chair=>chair.buildingId===home.id)) {
    const mesh=homes.chairs.get(chair.id),bounds=new THREE.Box3().setFromObject(mesh),center=bounds.getCenter(new THREE.Vector3());
    assert.equal(mesh.userData.targetId,chair.id,`${home.id}: chair remains interactable`);
    assert(Math.hypot(center.x-chair.x,center.z-chair.z)<.35&&bounds.min.y<=chair.y&&bounds.max.y>chair.y,
      `${home.id}: authored chair matches the authoritative seat`);
  }
  const inward=new THREE.Vector3(-Math.sin(home.rotation),0,-Math.cos(home.rotation));
  for(const x of [-1.25,0,1.25]) {
    const at=buildingPoint(home,x,home.depth/2+2);
    ray.set(new THREE.Vector3(at.x,home.y+2.2,at.z),inward);ray.far=3;
    assert.equal(ray.intersectObject(parts.get('shell-front'),true).length,0,`${home.id}: rotated placed doorway remains hollow`);
  }
  homes.update(home,buildingPoint(home,20,20));
  assert(!parts.get('roof-shingles').visible&&!parts.get('shell-front').visible&&!parts.get('shell-right').visible);
  assert(parts.get('shell-back').visible&&parts.get('shell-left').visible);
  assert([...parts].filter(([name])=>name.startsWith('interior-')).every(([,part])=>part.visible),'cutaway keeps interiors visible');
  homes.update(home,buildingPoint(home,-20,-20));
  assert(!parts.get('shell-back').visible&&!parts.get('shell-left').visible);
  assert(parts.get('shell-front').visible&&parts.get('shell-right').visible);
  homes.update(buildingPoint(home,0,home.depth/2+2),home);
  assert(parts.get('roof-shingles').visible&&replacement.children.every(child=>child.visible),'leaving restores only this home; source remains unchanged');
}

// Run the production batch helper in isolation, avoiding creation of the entire overworld.
// Its matrix composition must preserve normalized integer GLB coordinates without rewriting buffers.
const zoneSource=await readFile(new URL('../src/zones.ts',import.meta.url),'utf8');
const start=zoneSource.indexOf('function staticBatch('),end=zoneSource.indexOf('\ninterface LandscapeChunk',start);
assert(start>=0&&end>start);
const staticBatch=new Function('THREE',`${stripTypeScriptTypes(zoneSource.slice(start,end))}; return staticBatch;`)(THREE);
const palm=kit.getObjectByName('frontier-sunveil-palm'),palmMesh=palm.children[0];
assert(palmMesh.geometry.attributes.position.normalized,'fixture exercises actual normalized integer positions');
const authoredMatrix=new THREE.Matrix4().copy(palm.matrixWorld).invert().multiply(palmMesh.matrixWorld);
const before=Buffer.from(palmMesh.geometry.attributes.position.array.buffer).slice();
for(const [scale,turn] of [[1,0],[1.3,Math.PI*.7]]) {
  const group=new THREE.Group();group.position.set(-1040,0,-920);
  const instanced=staticBatch(group,[[30,5,-21,scale,scale,scale,0xffffff,turn]],palmMesh.geometry,palmMesh.material,'Frontier palm regression',true,authoredMatrix);
  group.updateMatrixWorld(true);
  const expected=palm.clone(true);expected.position.set(-1010,5,-941);expected.rotation.y=turn;expected.scale.setScalar(scale);expected.updateMatrixWorld(true);
  const actualBounds=new THREE.Box3().setFromObject(instanced),expectedBounds=new THREE.Box3().setFromObject(expected);
  assert(actualBounds.min.distanceTo(expectedBounds.min)<.003&&actualBounds.max.distanceTo(expectedBounds.max)<.003,
    'production instancing retains authored palm scale, rotation, ground and chunk placement');
  assert(actualBounds.max.y-actualBounds.min.y>12*scale,'palm is at least twelve metres tall after instancing');
  assert.equal(instanced.geometry,palmMesh.geometry,'instance batches reuse original geometry');
  instanced.dispose();
}
assert.deepEqual(Buffer.from(palmMesh.geometry.attributes.position.array.buffer),before,'instancing leaves normalized source coordinates unchanged');
const brokenGeometry=palmMesh.geometry.clone();brokenGeometry.applyMatrix4(authoredMatrix);
const broken=staticBatch(new THREE.Group(),[[0,0,0,1,1,1,0xffffff,0]],brokenGeometry,palmMesh.material,'Old flattening regression');
assert(new THREE.Box3().setFromObject(broken).getSize(new THREE.Vector3()).y<3,
  'negative control reproduces the former quantized-position flattening bug');
broken.dispose();brokenGeometry.dispose();

// Furnishings fit approved collision rectangles. Canopies may overhang above head height.
const furnishingNames=['auction-reading-desk','auction-bookcase','auction-display-case','auction-bench',
  'bank-counter','bank-vault','bank-crest','bush-planter','lantern-statue','courtyard-tree'];
assert.deepEqual(furnishings.children.map(root=>root.name).sort(),furnishingNames.map(name=>`furnishing-${name}`).sort());
const furnishingBytes=await readFile(new URL('../public/models/city-furnishings.glb',import.meta.url));
assert(furnishingBytes.length<600_000,'ten civic furnishings fit a bounded shared kit');
furnishings.updateMatrixWorld(true);
for(const root of furnishings.children) {
  assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(root.scale.toArray(),[1,1,1]);
  assert.equal(root.children.length,1,'each furnishing is one shared-material draw');
  const mesh=root.children[0],positions=mesh.geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
    assert(point.y>-.001,`${root.name}: floor-grounded`);
    if(point.y>2.3||root.name==='furnishing-bank-crest')continue;
    assert(Math.abs(point.x)<root.userData.width/2+.001&&Math.abs(point.z)<root.userData.depth/2+.001,
      `${root.name}: reachable geometry stays inside approved collision rectangle`);
  }
}
const bankModel=homes.root.getObjectByName(BANK_HOME_ID),bankParts=[];
bankModel.traverse(node=>{if(String(node.userData.part).startsWith('interior-'))bankParts.push(node.userData.part);});
assert.deepEqual(bankParts,['interior-floor'],'bank retains its walkable floor while old beds, tables and chairs are removed');
for(const placement of CITY_FURNISHINGS.filter(p=>p.buildingId)) {
  const home=homes.root.getObjectByName(placement.buildingId),source=furnishings.getObjectByName(`furnishing-${placement.kind}`);
  let found=false;
  home.traverse(node=>{if(node.isInstancedMesh&&node.geometry===source.children[0].geometry)found=true;});
  assert(found,`${placement.buildingId}: ${placement.kind} is consumed by real building runtime`);
}
for(const [path,w,h]of [['city-furnishings-preview.png',1800,1200]]) {
  const png=await readFile(new URL(`../assets/source/${path}`,import.meta.url));
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[w,h]);
}
assert((await stat(new URL('../assets/source/city-furnishings.blend',import.meta.url))).size>50_000);
console.log(`PASS: ${ids.length} Blender biome assets; ${draws} draws, ${triangles} triangles, ${raw.length} bytes; ${frontierHomes.length} runtime homes preserve doors/chairs/cutaways; full-height instancing; ten furnishings and an open Hollow gate.`);
