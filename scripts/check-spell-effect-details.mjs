import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCombatEffects } from '../src/combat-effects.ts';
import { createSpellEffectDetails, setSpellEffectAssets, setSpellModelAssets, setSpellRedesignAssets, SPELL_MODEL_SOURCES, SPELL_REDESIGN_MODELS } from '../src/spell-effect-details.ts';
import { SPELL_VISUALS } from '../src/spell-visuals.ts';
import { SPELLS, RETIRED_SPELLS } from '../src/spells.ts';
import { combatTiming, RADIAL_SWEEPS } from '../src/combat-timing.ts';
import { AUTO_ATTACKS, autoAttackTiming } from '../src/auto-attacks.ts';
import { graphics } from '../src/graphics-settings.ts';

const reworkedSpellIds=new Set(['poison-cloud','charge','taunt','powerful-throw','guard','adamant-guardian','courageous-call','lord-of-battle']);
const bytes=readFileSync(new URL('../public/models/spell-effects.glb',import.meta.url));
setSpellEffectAssets((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);
const modelIds=new Set(),modelGeometry=new Set();let modelTriangles=0,modelBytes=0;
for(const className of ['Ranger','Knight','Mage','Cleric']){
  const file=readFileSync(new URL(`../public/models/spell-models-${className.toLowerCase()}.glb`,import.meta.url));
  assert(file.length<6*1024*1024,`${className}: bounded model download`);modelBytes+=file.length;
  const root=(await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'')).scene,found=[];
  root.traverse(mesh=>{
    if(!(mesh instanceof THREE.Mesh))return;
    const id=mesh.name.replace(/^fx_/,'');assert((SPELLS[id]??RETIRED_SPELLS[id])?.className===className,`${mesh.name}: model belongs to its class`);assert(!modelIds.has(id),`${id}: one centerpiece`);modelIds.add(id);found.push(id);
    assert(mesh.position.length()<1e-7&&mesh.quaternion.angleTo(new THREE.Quaternion())<1e-7&&mesh.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-7,`${id}: baked identity transforms`);
    const geometry=mesh.geometry,positions=geometry.getAttribute('position'),colors=geometry.getAttribute('color');
    assert(positions?.count>0&&colors?.count===positions.count,`${id}: complete positions and baked surface colors`);
    assert(positions.array.every(Number.isFinite)&&colors.array.every(Number.isFinite),`${id}: finite geometry and color`);
    const triangles=(geometry.index?.count??positions.count)/3;assert(triangles>=100&&triangles<=(reworkedSpellIds.has(id)?6500:3200),`${id}: bounded substantial geometry (${triangles} triangles)`);modelTriangles+=triangles;
    geometry.computeBoundingBox();const bounds=geometry.boundingBox,size=bounds.getSize(new THREE.Vector3());
    assert(size.x>0&&size.y>0&&size.z>0&&Math.max(...size.toArray())<6,`${id}: a finite volumetric centerpiece`);
    const hash=createHash('sha256').update(Buffer.from(positions.array.buffer,positions.array.byteOffset,positions.array.byteLength));if(geometry.index)hash.update(Buffer.from(geometry.index.array.buffer,geometry.index.array.byteOffset,geometry.index.array.byteLength));
    const signature=hash.digest('hex');assert(!modelGeometry.has(signature),`${id}: model geometry is not a recolored duplicate`);modelGeometry.add(signature);
  });
  assert.deepEqual(found.sort(),[...new Set([...Object.values(SPELLS).filter(spell=>spell.className===className).map(spell=>SPELL_MODEL_SOURCES[spell.id]||spell.id),...Object.entries(RETIRED_SPELLS).filter(([,spell])=>spell.className===className).map(([id])=>id)])].sort(),`${className}: every ability resolves an authored Blender mesh`);
  setSpellModelAssets(root);
}
for(const id of reworkedSpellIds){
  assert(!SPELL_MODEL_SOURCES[id]&&modelIds.has(id),`${id}: class rework has its own authored Blender mesh`);
}
assert(modelTriangles<220000,'bounded complete model catalog');assert(modelBytes<20*1024*1024,'bounded complete model download');
const redesignBytes=readFileSync(new URL('../public/models/spell-redesign.glb',import.meta.url));
assert(redesignBytes.length<8*1024*1024,'bounded detailed redesign download');
const redesign=(await new GLTFLoader().parseAsync(redesignBytes.buffer.slice(redesignBytes.byteOffset,redesignBytes.byteOffset+redesignBytes.byteLength),'')).scene;
let redesignParts=0,redesignTriangles=0;
for(const [id,name] of Object.entries(SPELL_REDESIGN_MODELS)){
  const root=redesign.getObjectByName(name),parts=[];assert(root,`${id}: its own Blender source root`);
  root.traverse(mesh=>{if(mesh instanceof THREE.Mesh)parts.push(mesh);});
  assert(parts.length>=4&&parts.length<=8,`${id}: separate bounded animated parts`);
  assert.equal(parts.filter(mesh=>mesh.name.endsWith('_core')).length,1,`${id}: recognizable core`);
  let triangles=0;
  for(const mesh of parts){
    const positions=mesh.geometry.getAttribute('position'),colors=mesh.geometry.getAttribute('color');
    assert(positions?.count>0&&colors?.count===positions.count,`${mesh.name}: detailed colored geometry`);
    assert(positions.array.every(Number.isFinite)&&colors.array.every(Number.isFinite),`${mesh.name}: finite geometry`);
    triangles+=(mesh.geometry.index?.count??positions.count)/3;
  }
  assert(triangles>=1000&&triangles<=12000,`${id}: substantial bounded redesign (${triangles} triangles)`);
  redesignParts+=parts.length;redesignTriangles+=triangles;
}
setSpellRedesignAssets(redesign);
const scene=new THREE.Scene(),unrelated=new THREE.Group();scene.add(unrelated);
const ground=(x,z)=>20+x*.04+z*.06,live=new Map(),origin=new THREE.Vector3(3,25,-2);
let originCalls=0,targetCalls=0,validOrigin=true;
const effects=createCombatEffects(scene,id=>{targetCalls++;return live.get(id);},ground,(_id,_ability,out)=>{originCalls++;out.copy(origin);return validOrigin;});
const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
const event=(ability,targets=[{id:'target',x:0,z:8}])=>({ability,playerId:'caster',from:{x:0,z:0},targets,rotation:0});
const details=()=>scene.children.filter(mesh=>mesh.name.startsWith('spell-detail-'));
const fallback=()=>scene.getObjectByName('combat-effects');
function position(mesh,index=0){assert(mesh&&index<mesh.count,'requested visible instance exists');mesh.getMatrixAt(index,matrix);return new THREE.Vector3().setFromMatrixPosition(matrix);}
function primary(ability){const spell=SPELLS[ability];return scene.getObjectByName(`spell-detail-${spell.className==='Ranger'?'arrow':SPELL_VISUALS[ability].motif}`);}
function close(actual,expected,label){assert(actual.distanceTo(new THREE.Vector3(...expected))<.002,label);}
function validate(label){
  let count=0;assert(details().length<=Object.keys(SPELLS).length+13+redesignParts-7,`${label}: one batch per authored part plus shared brushes`);
  assert(details().filter(mesh=>mesh.count>0).length<=29+redesignParts-7,`${label}: bounded active centerpieces, moving pieces and shared brushes`);
  for(const mesh of details()){
    assert(mesh instanceof THREE.InstancedMesh);assert.equal(mesh.instanceMatrix.count,256);assert(mesh.count<=256);count+=mesh.count;
    assert.equal(mesh.visible,mesh.count>0);assert(mesh.userData.primaryCount<=mesh.count);
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite),`${label}: finite transforms`);point.setFromMatrixPosition(matrix);assert(point.y>=ground(point.x,point.z)-.15,`${label}: no underground centers`);}
    assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(0,40,0),new THREE.Vector3(0,-1,0)).intersectObject(mesh),[],`${label}: visual meshes cannot intercept selection`);
  }
  assert(count<=1536,`${label}: fixed total instance budget`);return count;
}

// Authored Blender pieces move independently; Low removes secondary debris and Off retains fallback cues.
for(const ability of Object.keys(SPELL_REDESIGN_MODELS)){
  const timing=combatTiming(ability,8),offset=ability==='poison-cloud'?timing.delay+timing.flight:0,lifetime=ability==='poison-cloud'?2.6:SPELLS[ability].effect==='shield'?1.2:.7;
  const frame=p=>{
    effects.update(offset+lifetime*p);
    return details().filter(mesh=>mesh.count&&mesh.name.startsWith(`spell-detail-fx_${ability}`)).map(mesh=>{
      mesh.getMatrixAt(0,matrix);return {name:mesh.name,matrix:[...matrix.elements]};
    });
  };
  graphics.effects='high';effects.play(event(ability),0);const early=frame(.24),late=frame(.62);
  assert(early.length>=4,`${ability}: separate Blender meshes render`);
  assert(early.some(part=>part.name.includes('__')&&late.some(other=>other.name===part.name&&other.matrix.some((n,i)=>Math.abs(n-part.matrix[i])>.01))),`${ability}: secondary pieces visibly animate`);
  graphics.effects='low';const low=frame(.62);assert(low.length>=2&&low.length<late.length,`${ability}: Low retains core structure with fewer moving parts`);
  graphics.effects='off';frame(.62);assert(details().every(mesh=>!mesh.count),`${ability}: Off clears every moving piece`);
  graphics.effects='high';assert.deepEqual(frame(.62),late,`${ability}: quality changes restore deterministic animation`);
  effects.update(20);assert(details().every(mesh=>!mesh.count),`${ability}: moving pieces expire`);effects.clear();
}

for(const spell of Object.values(SPELLS)){
  const timing=combatTiming(spell.id,8),instant=['shatter','venom-detonation'].includes(spell.id),ranged=spell.effect==='damage'&&spell.visual!=='radial';
  const at=spell.id==='poison-cloud'?timing.delay+timing.flight+.6:spell.effect!=='damage'?.22:instant?.1:ranged?timing.delay+timing.flight*.5:RADIAL_SWEEPS[spell.id].delay+RADIAL_SWEEPS[spell.id].duration*.5;
  graphics.effects='high';effects.play(event(spell.id),0);effects.update(at);const high=validate(spell.id);assert(high>0,`${spell.id}: authored High effect visible`);assert.equal(fallback().count,0,`${spell.id}: authored model replaces generic blocks`);
  const centerpiece=scene.getObjectByName(`spell-detail-fx_${spell.id}`);assert(centerpiece?.count>0,`${spell.id}: actual per-spell Blender centerpiece is integrated`);
  graphics.effects='low';effects.update(at);const low=validate(spell.id);assert(low>0&&low<=high,`${spell.id}: Low retains the effect with bounded work`);assert(centerpiece.count>0,`${spell.id}: Low preserves its recognizable Blender centerpiece`);
  graphics.effects='off';effects.update(at);assert.equal(validate(spell.id),0,`${spell.id}: Off clears authored detail immediately`);assert(fallback().count>0,`${spell.id}: Off preserves combat cues`);
  graphics.effects='high';effects.update(at);assert.equal(validate(spell.id),high,`${spell.id}: changing quality restores the same frame`);
  effects.update(10);assert.equal(validate(spell.id),0);assert.equal(fallback().count,0,`${spell.id}: completed effects expire`);effects.clear();assert.deepEqual(scene.children,[unrelated]);
}

// A splash accepts several damaged targets but releases one arrow and one cloud.
for(const quality of ['high','low']){
  graphics.effects=quality;const timing=combatTiming('poison-cloud',8);
  effects.play(event('poison-cloud',[{id:'center',x:0,z:8},{id:'splash-left',x:-2,z:8},{id:'splash-right',x:2,z:8}]),0);effects.update(timing.delay+timing.flight*.5);
  assert.equal(primary('poison-cloud')?.userData.primaryCount,1,'Poison Cloud has one readable arrow for its whole splash');
  assert(!scene.getObjectByName('spell-detail-fx_poison-cloud')?.count,'Poison Cloud spore mesh waits for impact');
  effects.update(timing.delay+timing.flight+.6);validate('Poison Cloud splash');
  assert.equal(scene.getObjectByName('spell-detail-fx_poison-cloud')?.count,1,'Poison Cloud blooms once for all splash victims');
  const mist=scene.getObjectByName('spell-detail-mist');assert(mist?.count>0&&mist.count<=12,'Poison Cloud retains bounded vapor clusters on High and Low');
  assert.equal(mist.material.blending,THREE.NormalBlending,'poison vapor stays visible against bright terrain without additive washout');
  effects.update(10);assert.equal(validate('Poison Cloud expired'),0);effects.clear();
}

// Guardian's stored damage release expands at the caster, independently of shield activation.
for(const quality of ['high','low']){
  graphics.effects=quality;effects.play({...event('adamant-guardian'),effectPhase:'impact'},0);
  const reach=()=>{const shards=scene.getObjectByName('spell-detail-shield');assert.equal(shards?.count,6,'Guardian release retains all six armour plates');return Math.max(...Array.from({length:shards.count},(_,i)=>{const p=position(shards,i);return Math.hypot(p.x,p.z);}));};
  effects.update(.07);validate('Guardian burst begins');const inner=reach();assert(inner>0&&inner<5,'Guardian release begins inside its damage radius');
  effects.update(.35);const active=validate('Guardian burst expands');assert(Math.abs(reach()-5)<.002,'Guardian release reaches the full five-meter radius');
  graphics.effects='off';effects.update(.35);assert.equal(validate('Guardian burst Off'),0);assert(fallback().count>0,'Guardian release remains readable with effects Off');
  graphics.effects=quality;effects.update(.35);assert.equal(validate('Guardian restored'),active);
  effects.update(.700001);assert.equal(validate('Guardian burst expired'),0);assert.equal(fallback().count,0,'Guardian burst expires after .7 seconds');effects.clear();
}

// Authored cores obey the same attachment, arrival and hit-point contracts as the fallback.
for(const spell of Object.values(SPELLS).filter(spell=>spell.effect==='damage'&&spell.visual!=='radial')){
  for(const quality of ['high','low']){
    graphics.effects=quality;origin.set(3,25,-2);originCalls=0;const timing=combatTiming(spell.id,8),cast=event(spell.id);Object.freeze(cast.from);Object.freeze(cast.targets[0]);Object.freeze(cast.targets);Object.freeze(cast);
    effects.play(cast,0);effects.update(timing.delay-.000001);assert.equal(validate(spell.id),0);assert.equal(originCalls,0);
    effects.update(timing.delay);const expected=spell.visual==='meteor'?[-3,ground(0,8)+12.75,6]:[3,25,-2];close(position(primary(spell.id)),expected,`${spell.id}: authored projectile starts at release origin`);
    assert.equal(originCalls,spell.visual==='meteor'?0:1);origin.set(100,80,-90);
    effects.update(timing.delay+timing.flight-.000001);close(position(primary(spell.id)),[0,ground(0,8)+.75,8],`${spell.id}: authored core arrives at exact shared time`);
    effects.update(timing.delay+timing.flight+.00000001);close(position(scene.getObjectByName('spell-detail-spark')),[0,ground(0,8)+.75,8],`${spell.id}: contact flash starts at authoritative hit`);
    assert.equal(originCalls,spell.visual==='meteor'?0:spell.id==='volley'?5:1,`${spell.id}: each launch origin sampled once`);effects.clear();
  }
}
graphics.effects='high';origin.set(3,25,-2);originCalls=targetCalls=0;
const timing=combatTiming('fireball',8);live.set('target',{x:2,y:23,z:7});effects.play(event('fireball'),0);effects.update(timing.delay);
live.set('target',{x:4,y:24,z:6});effects.update(timing.delay+timing.flight*.5);close(position(primary('fireball')),[3.5,24.62,2],'flight follows live target from its frozen origin');
live.set('target',{x:NaN,y:Infinity,z:8});effects.update(timing.delay+timing.flight*.5);close(position(primary('fireball')),[3.5,24.62,2],'invalid live positions preserve last valid endpoint');
live.set('target',{x:5,y:23,z:6});effects.update(timing.delay+timing.flight);close(position(scene.getObjectByName('spell-detail-spark')),[5,23,6],'impact freezes final rendered target');
const atImpact=targetCalls;live.set('target',{x:-5,y:22,z:-6});effects.update(timing.delay+timing.flight+.12);close(position(scene.getObjectByName('spell-detail-spark')),[5,23,6],'burst stays fixed after target moves');assert.equal(targetCalls,atImpact);assert.equal(originCalls,1);effects.clear();live.clear();
for(const valid of [false,true]){validOrigin=valid;origin.set(NaN,Infinity,4);effects.play(event('arrow'),0);effects.update(combatTiming('arrow',8).delay);close(position(primary('arrow')),[0,ground(0,0)+1.4,.55],'missing or invalid attachments preserve finite event fallback');effects.clear();}validOrigin=true;origin.set(3,25,-2);
originCalls=0;effects.play(event('arrow'),0);effects.update(1);assert.equal(originCalls,0,'late events never resample a launch attachment');effects.clear();

// Radial fronts meet targets at the shared timestamp; restorative cues are at recipients.
for(const spell of Object.values(SPELLS).filter(spell=>spell.effect==='damage'&&spell.visual==='radial'&&!['shatter','venom-detonation'].includes(spell.id))){
  const sweep=RADIAL_SWEEPS[spell.id],distance=(sweep.radius+sweep.reach)/2,timing=combatTiming(spell.id,distance);
  effects.play(event(spell.id),0);effects.update(timing.delay+timing.flight);
  const cues=scene.getObjectByName('spell-detail-spark');
  assert(Array.from({length:cues.userData.primaryCount},(_,i)=>position(cues,i)).some(p=>Math.abs(Math.hypot(p.x,p.z)-distance)<.00002),`${spell.id}: essential wavefront reaches damage radius at shared time`);effects.clear();
}
for(const ability of ['heal','power-word-shield']){
  effects.play(event(ability,[{id:'ally',x:9,z:12}]),0);effects.update(.2);const cue=scene.getObjectByName('spell-detail-spark');close(position(cue),[9,ground(9,12)+.045,12],`${ability}: effect is centered on recipient`);effects.clear();
}

// All accepted targets retain primary cues even when decorative details exhaust the budget.
for(const ability of ['arcane-volley','volley','shatter']){
  const targets=Array.from({length:8},(_,i)=>({id:`target-${i}`,x:Math.sin(i*.21)*12,z:Math.cos(i*.21)*12}));
  for(let i=0;i<16;i++)effects.play(event(ability,targets),0);
  const at=ability==='shatter'?0:ability==='volley'?.52:.86;effects.update(at);validate(`${ability} crowded`);
  const mesh=ability==='shatter'?scene.getObjectByName('spell-detail-spark'):primary(ability);assert.equal(mesh.userData.primaryCount,128,`${ability}: every accepted target keeps its primary cue`);effects.clear();
}
// Combat updates newest first: older radial and support cues must survive newer projectile decoration.
for(const ability of ['nova','strike','shield-bash','heal','power-word-shield']){
  const support=SPELLS[ability].effect!=='damage';effects.play(event(ability,[{id:'ally',x:9,z:12}]),0);
  const crowded=Array.from({length:16},(_,i)=>({id:`crowded-${i}`,x:Math.sin(i*.12)*12,z:Math.cos(i*.12)*12}));
  for(let i=0;i<15;i++)effects.play(event(['fireball','arcane-missile','arrow','frostbolt','chain-lightning'][i%5],crowded),0);
  effects.update(.5);validate(`${ability} after saturated projectiles`);assert(details().some(mesh=>mesh.count===mesh.instanceMatrix.count),'test saturates an authored draw batch');
  const mesh=scene.getObjectByName('spell-detail-spark'),primaryPositions=Array.from({length:mesh?.userData.primaryCount??0},(_,i)=>position(mesh,i));
  assert(primaryPositions.length>0,`${ability}: essential cue reserves an instance`);
  if(support)assert(primaryPositions.some(p=>p.distanceTo(new THREE.Vector3(9,ground(9,12)+.045,12))<.002),`${ability}: recipient cue survives saturation`);
  else {const sweep=RADIAL_SWEEPS[ability],radius=sweep.radius+(.5-sweep.delay)/sweep.duration*(sweep.reach-sweep.radius);assert(primaryPositions.some(p=>Math.abs(Math.hypot(p.x,p.z)-radius)<.002),`${ability}: directional midpoint survives saturation`);}
  effects.clear();
}
// Rotating a straight flight rotates every part of its local composition and its primary +Z axis.
const orientationScene=new THREE.Scene(),oriented=createSpellEffectDetails(orientationScene,()=>0),upAxis=new THREE.Vector3(0,1,0);
for(const ability of ['fireball','frozen-orb']){
  const render=east=>{
    oriented.begin();const sample=(t,out)=>out.set(east?t*10:0,4,east?0:t*10);oriented.projectile(ability,.4,.6,1,sample(.6,new THREE.Vector3()),sample);oriented.finish();
    const core=orientationScene.getObjectByName(`spell-detail-${SPELL_VISUALS[ability].motif}`);core.getMatrixAt(0,matrix);
    assert(new THREE.Vector3(0,0,1).transformDirection(matrix).distanceTo(new THREE.Vector3(east?1:0,0,east?0:1))<.00001,`${ability}: core +Z follows travel`);
    return orientationScene.children.filter(mesh=>mesh.count).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(mesh=>Array.from({length:mesh.count},(_,i)=>({name:mesh.name,p:position(mesh,i)})));
  };
  const north=render(false),east=render(true);assert(north.length>1);assert.equal(east.length,north.length);
  north.forEach(({name,p},i)=>{assert.equal(name,east[i].name);assert(p.applyAxisAngle(upAxis,Math.PI/2).distanceTo(east[i].p)<.00001,`${ability}: structural part ${i} rotates with eastward flight`);});oriented.clear();
}
// A curved trajectory's current tangent differs from the straight source-to-head beam chord.
for(const ability of ['arcane-beam','inferno-beam']){
  const sample=(t,out)=>out.set(1+8*t,5+3*t+1.2*Math.sin(Math.PI*t),-2+6*t),start=sample(0,new THREE.Vector3()),head=sample(.6,new THREE.Vector3()),chord=head.clone().sub(start);
  oriented.begin();oriented.projectile(ability,.4,.6,1,head,sample);oriented.finish();const strokes=orientationScene.getObjectByName('spell-detail-stroke');assert(strokes?.count>0,`${ability}: connected beam stroke`);strokes.getMatrixAt(strokes.count-1,matrix);
  assert(new THREE.Vector3(0,0,1).transformDirection(matrix).dot(chord.clone().normalize())>1-1e-6,`${ability}: beam long axis follows its actual source-head chord`);
  assert(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(start.clone().add(head).multiplyScalar(.5))<.00001,`${ability}: beam is centered between its endpoints`);oriented.clear();
}
// Directional impact art follows the arriving shot, even if the event's fallback heading is unchanged.
const impactEffects=createCombatEffects(orientationScene,undefined,()=>0);
for(const ability of ['arrow','twinshot']){
  const render=east=>{
    const target={id:'directional',x:east?8:0,z:east?0:8},timing=combatTiming(ability,8);
    impactEffects.play({ability,from:{x:0,z:0},targets:[target],rotation:0},0);impactEffects.update(timing.delay+timing.flight+.13);
    const contact=orientationScene.getObjectByName('spell-detail-spark');close(position(contact),[target.x,.75,target.z],`${ability}: turning leaves the authoritative contact intact`);
    const parts=orientationScene.children.filter(mesh=>mesh.count).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(mesh=>Array.from({length:mesh.count},(_,i)=>{
      mesh.getMatrixAt(i,matrix);return {name:mesh.name,primary:i<mesh.userData.primaryCount,p:new THREE.Vector3().setFromMatrixPosition(matrix),axis:new THREE.Vector3(0,0,1).transformDirection(matrix)};
    }));impactEffects.clear();return parts;
  };
  const north=render(false),east=render(true);assert.equal(north.length,east.length);assert(north.some(part=>!part.primary),'directional art is present beyond the contact cue');
  north.forEach((part,i)=>{
    assert.equal(part.name,east[i].name);
    assert(part.p.applyAxisAngle(upAxis,Math.PI/2).distanceTo(east[i].p)<.00001,`${ability}: impact structure ${i} rotates with its incoming shot`);
    // Radiance is a camera-facing billboard; its anchor rotates but its display axes do not.
    if(!part.primary&&part.name!=='spell-detail-radiance')assert(part.axis.applyAxisAngle(upAxis,Math.PI/2).distanceTo(east[i].axis)<.00001,`${ability}: impact piece ${i} keeps its local orientation`);
  });
}
for(const ability of ['shatter','venom-detonation']){effects.play(event(ability),0);effects.update(0);close(position(scene.getObjectByName('spell-detail-spark')),[0,ground(0,8)+.75,8],`${ability}: immediate target burst`);effects.update(.5);assert.equal(validate(ability),0);effects.clear();}
for(const [className,attack] of Object.entries(AUTO_ATTACKS)){
  const timing=autoAttackTiming(className,2);effects.play({...event(attack.ability,[{id:'target',x:0,z:2}]),basic:true},0);effects.update(timing.delay+timing.flight+.000001);assert.equal(validate(className),0,`${className}: weapon basics keep their existing visuals`);assert(fallback().count>0);effects.clear();
}

effects.play(event('fireball'),0);effects.update(.5);
const meshes=[fallback(),...details()],owned=[...meshes,...meshes.map(mesh=>mesh.material),fallback().geometry],shared=[...new Set(details().map(mesh=>mesh.geometry))];
const disposed=new Map([...owned,...shared].map(resource=>[resource,0]));for(const resource of disposed.keys())resource.addEventListener('dispose',()=>disposed.set(resource,disposed.get(resource)+1));
effects.clear();effects.clear();for(const resource of owned)assert.equal(disposed.get(resource),1,'instance buffers and owned resources disposed once');for(const geometry of shared)assert.equal(disposed.get(geometry),0,'shared authored geometry survives a zone change');assert.deepEqual(scene.children,[unrelated]);
effects.play(event('fireball'),0);effects.update(.5);assert(validate('reused')>0,'renderer recovers after clear');assert(details().some(mesh=>shared.includes(mesh.geometry)),'authored geometry is reused across scene changes');effects.clear();graphics.effects='high';
console.log(`PASS: ${modelIds.size} Blender centerpieces plus 7 detailed redesigns (${redesignParts} moving parts, ${redesignTriangles} extra triangles, ${redesignBytes.length} extra bytes), integrated High/Low/Off, exact origins and impact timing, homing and frozen hits, terrain and recipient alignment, 128 crowded primary cues, fixed buffers, nonblocking picking and shared-geometry teardown.`);
