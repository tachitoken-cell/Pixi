import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RAID_APPROACH_MODEL_KINDS, loadRaidApproachAssets, createRaidApproachModel, animateRaidApproachModel } from '../src/raid-approach-models.ts';
import { raidCastCue } from '../src/raid-visuals.ts';

const bytes = readFileSync(new URL('../public/models/raid-approach-monsters.glb', import.meta.url));
assert(bytes.length < 18_000_000, 'the 25-creature pack fits its bounded download budget');
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
assert.equal(RAID_APPROACH_MODEL_KINDS.length, 25);
assert.equal(asset.animations.length, 25 * 6 + 2, 'each creature has six standard clips and Morgrath has distinct Rift and Rupture clips');
const originalFetch = globalThis.fetch, originalProgress = globalThis.ProgressEvent;
let requests = 0;
THREE.DefaultLoadingManager.setURLModifier(path => new URL(path, 'http://raid-model-check.local').href);
globalThis.ProgressEvent = class extends Event { constructor(type, values) { super(type); Object.assign(this, values); } };
globalThis.fetch = async request => {
  assert.equal(new URL(typeof request === 'string' ? request : request.url).pathname, '/models/raid-approach-monsters.glb'); requests++;
  return new Response(bytes, { headers: { 'content-type': 'model/gltf-binary' } });
};
const pose = model => { const result = []; model.traverse(node => result.push([node.name, ...node.position, ...node.quaternion, ...node.scale])); return result; };
const geometry = model => { const result = []; model.traverse(node => { if (node.isMesh) result.push(node.geometry); }); return result; };
const joints = (model, key) => ['body', 'head', 'left-arm', 'right-arm', 'left-leg', 'right-leg'].flatMap(part => {
  const node=model.getObjectByName(`${key}-${part}`);return node?[...node.position,...node.quaternion,...node.scale]:[];
});
function closePose(actual, expected, label) { assert.equal(actual.length,expected.length,label);assert(actual.every((value,index)=>Math.abs(value-expected[index])<1e-5),label); }
const materialSet = new Set(), sourceShapes = new Set();
let triangles = 0, maxDraws = 0;
try {
  await Promise.all([loadRaidApproachAssets(), loadRaidApproachAssets()]); assert.equal(requests, 1, 'overlapping loads reuse one asset request');
  assert.equal(createRaidApproachModel('bramble-wolf'), undefined); assert.equal(animateRaidApproachModel(new THREE.Group(), 0, false), false);
  for (const key of RAID_APPROACH_MODEL_KINDS) {
    const model = createRaidApproachModel(key), twin = createRaidApproachModel(key), rest = pose(twin);
    assert(model.getObjectByName(`${key}-body`), `${key} has an articulated body`);
    const bounds = new THREE.Box3().setFromObject(model, true), size = bounds.getSize(new THREE.Vector3());
    assert(Math.abs(bounds.min.y) < .04, `${key} rests on the floor`); assert(size.y > .5 && size.y < 10, `${key} uses gameplay metres`);
    const owns = (part, first, last=first) => {
      const source=model.getObjectByName(`${key}-${part}`)?.userData.source_islands;
      assert(Array.isArray(source),`${key} ${part} records its source anatomy`);
      for(let island=first;island<=last;island++)assert(source.includes(island),`${key} source island ${island} stays attached to ${part}`);
    };
    if(key==='morgrath'){
      owns('head',72,119);owns('right-arm',212,234);owns('body',235,264);
      const left=model.getObjectByName(`${key}-left-arm`),right=model.getObjectByName(`${key}-right-arm`),head=model.getObjectByName(`${key}-head`);
      const a=left.getWorldPosition(new THREE.Vector3()),b=right.getWorldPosition(new THREE.Vector3()),neck=head.getWorldPosition(new THREE.Vector3());
      assert(Math.abs(a.y-b.y)<.1&&a.y<neck.y&&b.y<neck.y,'Morgrath shoulders remain level and below the neck instead of following horns or sword bounds');
      assert.equal(model.getObjectByName('morgrath-contact-tip')?.parent,right,'the contact landmark follows the actual sword arm');
    }
    if(key==='raid-thorn-knight'){owns('head',53,67);owns('left-arm',36);owns('right-arm',52);owns('right-arm',68,80);}
    if(key==='raid-hammer-stump'){owns('left-arm',23);owns('right-arm',25,27);}
    if(key==='raid-grave-knight'){owns('right-arm',28,29);owns('left-arm',30,32);}
    if(key==='raid-gnoll-scout')owns('head',12,22);
    if(key==='raid-shroom-shaman'){
      owns('body',2,38);owns('left-arm',39);owns('right-arm',40,50);
      for(const side of ['left','right'])assert(model.getObjectByName(`${key}-${side}-arm`).getWorldPosition(new THREE.Vector3()).y<1.3,'shaman shoulders stay under its cap, independent of staff height');
    }
    if(key==='raid-moss-golem'){owns('head',11,16);owns('left-arm',17,29);owns('right-arm',30,42);}
    if(key==='raid-magma-brute'){owns('head',7,10);owns('left-arm',11,19);owns('right-arm',20,24);}
    if(key==='raid-hammer-stump'){
      owns('body',0,15);
      const tip=model.getObjectByName('hammer-stump-contact-tip');assert(tip,'hammer head exports its contact landmark');
      const position=progress=>{animateRaidApproachModel(model,0,false,{style:'pulse',clip:'cast',progress,impactProgress:.5});return tip.getWorldPosition(new THREE.Vector3());};
      const raised=position(.35),contact=position(.5);assert(contact.y<raised.y-.8,'upward-held hammer swings down from its windup at the actual hit');
      animateRaidApproachModel(model,0,false);
    }
    const meshes = []; model.traverse(node => { if (node.isMesh) meshes.push(node); });
    maxDraws = Math.max(maxDraws, meshes.length); assert(meshes.length <= 28, `${key} has bounded rigid-part draw calls`);
    let creatureTriangles = 0;
    for (const [i, mesh] of meshes.entries()) {
      assert.equal(mesh.geometry, geometry(twin)[i], 'instances share authored buffers');
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { materialSet.add(material); assert(!material.map, 'vertex palettes need no texture request'); }
      const positions = mesh.geometry.getAttribute('position'), colors = mesh.geometry.getAttribute('color');
      assert(positions && colors, 'each rigid part retains real geometry and its vertex palette');
      assert(positions.array.every(Number.isFinite));
      creatureTriangles += (mesh.geometry.index?.count ?? positions.count) / 3;
    }
    assert(creatureTriangles >= 1000, `${key} retains detailed authored geometry beyond a proxy mesh`); triangles += creatureTriangles;
    sourceShapes.add(JSON.stringify(meshes.map(mesh => [mesh.geometry.attributes.position.count, mesh.geometry.index?.count])));
    const modes = key==='morgrath'?['idle','walk','auto','attack','cast','death','rift','rupture']:['idle','walk','auto','attack','cast','death'];
    for (const clip of modes) {
      const authored = asset.animations.find(animation => animation.name === `${key}-${clip}`);
      assert(authored?.tracks.length >= 3 && authored.duration > 0, `${key} ${clip} has authored keys`);
    }
    for (const moving of [false, true]) {
      animateRaidApproachModel(model, 0, moving); const first = pose(model);
      animateRaidApproachModel(model, .3, moving); assert.notDeepEqual(pose(model), first, `${key} animates ${moving ? 'walk' : 'idle'}`);
    }
    for (const mode of ['auto', 'attack', 'cast', 'death']) for (const progress of [0, .25, .5, .75, 1]) {
      const args = mode === 'death' ? [undefined, undefined, progress] : mode === 'cast' ? [undefined, progress] : [{ style: 'swipe', basic: mode === 'auto', progress, impactProgress: .5 }];
      animateRaidApproachModel(model, 0, false, ...args); model.updateMatrixWorld(true);
      model.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite)));
      assert(new THREE.Box3().setFromObject(model, true).min.y > -.055, `${key} ${mode} stays above the floor`);
      const sample = pose(model); animateRaidApproachModel(model, 0, false, ...args); assert.deepEqual(pose(model), sample, 'paused sampling never accumulates transforms');
    }
    assert(Math.abs(new THREE.Box3().setFromObject(model, true).min.y) < .055, 'settled corpse touches the floor');
    assert.deepEqual(pose(twin), rest, 'another instance retains its independent pose');
    animateRaidApproachModel(model,.31,false);animateRaidApproachModel(twin,.31,false);
    assert.deepEqual(pose(model),pose(twin),`${key} leaves no death or attack transforms in idle`);
    if(key==='morgrath') {
      const enemy={id:'morgrath-test',alive:true,model:key,raidVisual:'morgrath',rotation:0},contactPoses=[];
      for(const [kind,clip,shape] of [['Morgrath Cleave','attack','cone'],['Morgrath Rift','rift','line'],['Morgrath Rupture','rupture','ring']]) {
        const tipSamples=[];
        const hazard={id:clip,sourceId:enemy.id,kind,shape,startedAt:1000,impactAt:3400,endsAt:4000,rotation:.7};
        const authored=asset.animations.find(animation=>animation.name===`${key}-${clip}`),reference=asset.scene.getObjectByName(key).clone(true),mixer=new THREE.AnimationMixer(reference);
        const action=mixer.clipAction(authored).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
        for(const [now,phase] of [[1000,0],[2200,.25],[3400,.5],[3700,.75]]) {
          const cue=raidCastCue({hazards:[hazard]},enemy,now);animateRaidApproachModel(model,0,false,cue);
          action.reset().play();mixer.setTime(authored.duration*phase);
          closePose(joints(model,key),joints(reference,key),`${clip} samples the actual authored windup/contact/recovery at server time ${now}`);
          assert(new THREE.Box3().setFromObject(model,true).min.y>-.055,`${clip} keeps Morgrath above the floor`);
          if(phase===.5)contactPoses.push(joints(model,key));
          if(clip==='attack'){
            const tip=model.getObjectByName('morgrath-contact-tip');assert(tip,'Morgrath exports an actual sword-tip landmark');
            tipSamples.push(tip.getWorldPosition(new THREE.Vector3()));
          }
        }
        animateRaidApproachModel(model,0,false,{clip,style:shape==='cone'?'swipe':'pulse',progress:1,impactProgress:.8});
        action.reset().play();mixer.setTime(0);
        closePose(joints(model,key),joints(reference,key),`${clip} returns joints to its starting pose after recovery`);
        if(clip==='attack'){
          assert(tipSamples[1].z<tipSamples[0].z-.1,'sword retracts behind its resting forward reach during windup');
          assert(tipSamples[2].z-tipSamples[1].z>1,'sword advances over one metre from windup to authoritative contact');
          const recovered=model.getObjectByName('morgrath-contact-tip').getWorldPosition(new THREE.Vector3());
          assert(recovered.distanceTo(tipSamples[0])<.02,'sword recovers to its actual resting location');
        }
        mixer.stopAllAction();
      }
      for(let i=0;i<contactPoses.length;i++)for(let j=i+1;j<contactPoses.length;j++)assert(contactPoses[i].some((value,index)=>Math.abs(value-contactPoses[j][index])>.08),'Morgrath Cleave, Rift and Rupture have visibly distinct contact poses');
    }
    model.position.set(9, 0, -4); model.scale.setScalar(1.2); animateRaidApproachModel(model, 1, true);
    assert.deepEqual(model.position.toArray(), [9, 0, -4]); assert.equal(model.scale.x, 1.2, 'animation leaves gameplay placement and scale untouched');
    const corpse = pose(model); delete model.userData.enemyRig; animateRaidApproachModel(model, 2, true); assert.deepEqual(pose(model), corpse, 'loot corpses remain static');
    console.log(`${key}: ${creatureTriangles} triangles, ${meshes.length} draws, ${modes.length} clips`);
  }
  assert.equal(materialSet.size, 2, 'the complete pack shares two vertex palettes');
  assert.equal(sourceShapes.size, 25, 'all 25 creatures have distinct authored mesh structures');
  console.log(`PASS raid approach models: ${25} distinct creatures, ${asset.animations.length} clips, ${triangles} triangles total, ${maxDraws} maximum draws, ${(bytes.length / 1e6).toFixed(2)} MB.`);
} finally {
  THREE.DefaultLoadingManager.setURLModifier(undefined); globalThis.fetch = originalFetch; globalThis.ProgressEvent = originalProgress;
}
