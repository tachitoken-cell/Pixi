import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadGatheringAssets, loadWorldFeatureAssets, makeResource, showResource } from '../src/resources.ts';
const path = '../public/models/world-feedback-kit.glb';
const bytes = readFileSync(new URL(path, import.meta.url));
const scene = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '')).scene;
assert(bytes.length < 1_000_000, 'the shared world kit stays below one megabyte');
const names = ['slime-mushroom','candy-tree','slime-pool','sugar-cane','site-wall','mine-frame','cave-roof','mine-track','site-sign','campfire','companion-crate','fishing'];
let triangles=0,parts=0;
for(const name of names) {
  const root=scene.getObjectByName(`feedback-${name}`);assert(root,`${name} is authored in Blender`);
  const box=new THREE.Box3().setFromObject(root);assert(!box.isEmpty());
  if(name!=='cave-roof')assert(box.min.y>=-.12,`${name} rests at ground level with shallow buried roots`);
  root.traverse(part=>{
    if(!part.isMesh)return;
    parts++;const pos=part.geometry.attributes.position;triangles+=(part.geometry.index?.count??pos.count)/3;
    assert(part.geometry.attributes.color,`${name} uses the shared authored palette`);
    assert([...pos.array].every(Number.isFinite),`${name} geometry is finite`);
    assert(part.geometry.attributes.normal,`${name} exports normals`);
    assert(!part.material.map,`${name} requires no extra texture downloads`);
  });
}
assert.equal(parts,15,'repeated models share meshes; fishing water and campfire flame are isolated nonphysical parts');
assert.equal(scene.getObjectByName('feedback-campfire-flame').userData.collision,'effect');
assert.equal(scene.getObjectByName('feedback-fishing-water').userData.collision,'water');
assert(triangles<20_000,'detail remains affordable for repeated landscape instances');
const wall=new THREE.Box3().setFromObject(scene.getObjectByName('feedback-site-wall'));
assert(wall.min.x>=-2.001&&wall.max.x<=2.001&&wall.min.z>=-1.53&&wall.max.z<=1.53,'stone modules match authoritative wall envelopes');
const frame=scene.getObjectByName('feedback-mine-frame');frame.traverse(part=>{if(!part.isMesh)return;const pos=part.geometry.attributes.position;for(let i=0;i<pos.count;i++)assert(pos.getY(i)>4||Math.abs(pos.getX(i))>=8.4,'mine frame leaves the walking aisle open');});
const original=GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync=async url=>{
  if(url==='/models/world-feedback-kit.glb')return {scene};
  const data=readFileSync(new URL(`../public${url}`,import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
};
try{await Promise.all([loadGatheringAssets(),loadWorldFeatureAssets()]);}finally{GLTFLoader.prototype.loadAsync=original;}
const resources=root=>{const out=new Set();root.traverse(part=>{if(part.isMesh){out.add(part.geometry);for(const mat of Array.isArray(part.material)?part.material:[part.material])out.add(mat);}});return out;};
const source=resources(scene);
for(const kind of ['brook-shoal','silver-shoal','glacial-shoal','moonfin-shoal']) {
  const a=makeResource(kind),b=makeResource(kind),own=resources(a),peer=resources(b);
  assert(a.getObjectByName('feedback-fishing-base'));assert(a.getObjectByName('feedback-fishing-yield'));
  assert.equal(a.children.filter(child=>child.isMesh).length,6,'base, fish and water parts plus three water ripple effects');
  for(const asset of own){assert(!source.has(asset),'node disposal cannot destroy the cached kit');assert(!peer.has(asset),'node disposal cannot destroy another shoal');asset.dispose();}
  showResource(b,false);assert(b.children.every(child=>!child.visible));showResource(b,true);assert(b.children.every(child=>child.visible));
  for(const asset of peer)asset.dispose();
}
assert(existsSync(new URL('../assets/source/world-feedback-kit.blend',import.meta.url)));
assert(existsSync(new URL('../assets/source/world-feedback-kit-preview.png',import.meta.url)));
// Inspect the actual renderer, not only the library: a valid asset can still have zero world placements.
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {createOverworld}=await import('../src/zones.ts');
const {WILD_BIOMES,wildBiomeAt}=await import('../src/world-features.ts');
const {WORLD_SCENERY}=await import('../src/realm.ts');
const {groundHeight}=await import('../src/landscape.ts');
GLTFLoader.prototype.loadAsync=async function(url){const data=readFileSync(new URL(`../public${url}`,import.meta.url));return this.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');};
try {
  const rendered=new THREE.Scene(),world=await createOverworld(rendered);rendered.updateMatrixWorld(true);
  for(const biome of WILD_BIOMES) {
    const name=biome.id==='slimefen'?'slime-mushroom':'candy-tree';
    const expected=WORLD_SCENERY.filter(solid=>solid.kind==='tree'&&wildBiomeAt(solid.x,solid.z)?.id===biome.id);
    assert(expected.length>=30,`${biome.id} has a defining canopy rather than relying on absent camp woodland`);
    assert(expected.some(point=>Math.hypot(point.x-biome.x,point.z-biome.z)<15),`${biome.id} has visible foreground trees at arrival`);
    let count=0;const matrix=new THREE.Matrix4(),canopies=[];
    rendered.traverse(mesh=>{
      if(mesh.name!==`Landscape: feedback-${name}`)return;
      assert(mesh.isInstancedMesh,'repeated canopies use chunk instances');canopies.push(mesh);
      for(let i=0;i<mesh.count;i++) {
        count++;mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);
        const at=new THREE.Vector3().setFromMatrixPosition(matrix);
        assert(expected.some(point=>Math.hypot(point.x-at.x,point.z-at.z)<.001),'rendered trees match shared collision positions');
        const bounds=new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(matrix),ground=groundHeight(at.x,at.z);
        assert(bounds.max.y-ground>5&&bounds.max.y-ground<12,'actual canopy instances preserve metre-scale asset transforms');
        assert(bounds.min.y-ground>-.3&&bounds.min.y-ground<.1,'actual canopy instances meet the terrain');
      }
    });
    assert.equal(count,expected.length,`${biome.id} places every authored canopy in the actual world`);
    const cameraRay=new THREE.Raycaster(),direction=new THREE.Vector3();let shortened=0;
    const nearest=[...expected].sort((a,b)=>Math.hypot(a.x-biome.x,a.z-biome.z)-Math.hypot(b.x-biome.x,b.z-biome.z));
    for(const point of [biome,...nearest.slice(0,2).map(point=>({x:point.x+2,z:point.z}))])for(const yaw of [.34,0,Math.PI/2,Math.PI,Math.PI*1.5])for(const pitch of [.18,.35,1.12])for(const distance of [8,21,37]) {
      const target=new THREE.Vector3(point.x,groundHeight(point.x,point.z)+1.2,point.z);
      const desired=target.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance));
      world.constrainCamera(target,desired);const actual=desired.distanceTo(target);
      assert(desired.toArray().every(Number.isFinite)&&actual>=.099&&actual<=distance+.001,'camera remains finite and within the requested zoom, including minimum pitch and zoom');
      if(actual<distance-.001)shortened++;
      cameraRay.set(target,direction.subVectors(desired,target).normalize());cameraRay.near=.1;cameraRay.far=Math.max(.1,actual-.001);
      assert.equal(cameraRay.intersectObjects(canopies,false).length,0,`${biome.id} leaves a clear camera-to-avatar sight line at every orbit/pitch/zoom`);
    }
    assert(shortened>0,`${biome.id} test exercises actual canopy occlusion`);

  }
  world.dispose();
} finally {GLTFLoader.prototype.loadAsync=original;hook.deregister();}
console.log(`World feedback assets passed: ${names.length} Blender models, ${parts} mesh parts, ${triangles.toLocaleString()} triangles, ${bytes.length.toLocaleString()} bytes; walkable mine aisle, wall bounds and isolated fishing resource lifecycle and actual rendered biome canopy positions/scale and 270 unobstructed camera orbit/pitch/zoom cases.`);
