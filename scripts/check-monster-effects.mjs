import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { createMonsterEffects } from '../src/monster-effects.ts';
import { WORLD_BOSSES } from '../src/bestiary.ts';
const scene=new THREE.Scene(),other=new THREE.Group();scene.add(other);
const height=(x,z)=>2+x*.05+z*.02,effects=createMonsterEffects(scene,height);
const enemy={id:'toad',kind:'marsh-toad',alive:true,x:0,z:0,worldBoss:false,attack:{id:'cast-1',style:'spit',startedAt:1000,impactAt:2000,endsAt:2500,x:0,z:6,radius:1.5}};
const root=()=>scene.getObjectByName('Monster attack warnings'),cast=()=>root().children[0];
effects.update([enemy],999);assert.equal(root().children.length,0);
effects.update([enemy],1100);const warning=cast();assert(warning);assert(!warning.getObjectByName('monster-projectile').visible);assert(!warning.getObjectByName('impact-shards').visible);
const vertices=warning.getObjectByName('impact-warning').geometry.getAttribute('position');
for(let i=0;i<vertices.count;i++)assert(Math.abs(vertices.getY(i)-height(vertices.getX(i),vertices.getZ(i)+6)-.09)<.000001,'warning follows terrain across its radius');
effects.update([enemy],1750);assert.equal(cast(),warning);const projectile=warning.getObjectByName('monster-projectile');assert(projectile.visible);assert(projectile.position.z<0&&projectile.position.z>-6);
effects.update([enemy],1999.999);assert(projectile.position.distanceTo(new THREE.Vector3(0,height(0,6)+.45,0))<.0001,'projectile reaches the locked impact point at the server timestamp');assert(!warning.getObjectByName('impact-shards').visible);
const trail=warning.getObjectByName('venom-projectile-trail');assert(trail.visible,'spit visibly trails behind its projectile');
effects.update([enemy],2000);assert(!trail.visible);assert(!projectile.visible);assert(warning.getObjectByName('impact-shards').visible,'impact starts at damage time');
const matrix=new THREE.Matrix4();for(let i=0;i<8;i++){warning.getObjectByName('impact-shards').getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));}
effects.update([enemy],2500);assert.equal(root().children.length,0);
for(const cancellation of [{...enemy,alive:false},{...enemy,attack:null}]){effects.update([enemy],1200);effects.update([cancellation],1250);assert.equal(root().children.length,0,'death and interruption clear the tell');}
for(const worldBoss of [false,true]) {
 const basic={...enemy,worldBoss,attack:{...enemy.attack,basic:true}};
 for(const now of [1000,1100,1999.999]) {effects.update([basic],now);assert.equal(root().children.length,0,'normal melee never warns or charges before impact');}
 effects.update([basic],2000);assert.equal(root().children.length,1);assert(cast().getObjectByName('melee-contact-arcs').visible,'a basic strike flashes only on contact');
 for(const name of ['impact-warning','impact-area','monster-projectile','venom-projectile-trail','impact-shockwave','impact-shards','pulse-burst'])assert(!cast().getObjectByName(name).visible,`${name} never accompanies a basic strike`);
 effects.update([basic],2139);assert(cast().getObjectByName('melee-contact-arcs').visible);effects.update([basic],2140);assert.equal(root().children.length,0,'the basic contact flash is brief and never outlives recovery');
}

// Each family has a different contact motion; dungeon hazard circles remain owned by zones.
for(const [kind,style,color] of [['frost-yeti','swipe','#80dfff'],['void-stalker','swipe','#ba87ff'],['ember-beetle','spit','#ff963d'],['marsh-toad','spit','#b6e960']]) {
 const monster={...enemy,kind,attack:{...enemy.attack,id:`color-${kind}`,style,rotation:.7}};
 effects.update([monster],2000);const impact=cast();assert.equal(impact.getObjectByName('monster-projectile').material.color.getHexString(),new THREE.Color(color).getHexString());
 const arcs=impact.getObjectByName('melee-contact-arcs');assert.equal(arcs.visible,style==='swipe');
 if(arcs.visible){const before=arcs.instanceMatrix.array.slice();effects.update([monster],2100);assert(arcs.instanceMatrix.array.some((v,i)=>v!==before[i]),'contact arcs sweep in the attack direction');}
 effects.clear();
}
const slam={...enemy,kind:'stone-golem',attack:{...enemy.attack,id:'slam',style:'slam',radius:3}};
effects.update([slam],1999.999);assert(!cast().getObjectByName('impact-shockwave').visible);assert(!cast().getObjectByName('impact-shards').visible);
effects.update([slam],2000);const slamRoot=cast(),wave=slamRoot.getObjectByName('impact-shockwave');assert(wave.visible);const small=wave.geometry.boundingSphere.radius;
effects.update([slam],2200);assert(wave.geometry.boundingSphere.radius>small,'slam shockwave expands only after impact');
const wavePositions=wave.geometry.getAttribute('position');for(let i=0;i<wavePositions.count;i++)assert(Math.abs(wavePositions.getY(i)-height(wavePositions.getX(i),wavePositions.getZ(i)+6)-.09)<.00001,'shockwave stays attached to changing ground');
const debris=slamRoot.getObjectByName('impact-shards');assert.equal(debris.count,12);debris.getMatrixAt(0,matrix);assert(matrix.elements[13]>height(matrix.elements[12],matrix.elements[14]+6)+.3,'slam lifts chunky debris off the actual floor');
const pulse={...enemy,kind:'ice-wisp',attack:{...enemy.attack,id:'pulse',style:'pulse'}};
effects.update([pulse],1200);const pulseRoot=cast(),charge=pulseRoot.getObjectByName('monster-projectile'),burst=pulseRoot.getObjectByName('pulse-burst');assert(charge.visible&&!burst.visible);assert.equal(burst.geometry.type,'TorusGeometry','pulse contact leaves the telegraphed safe center open');assert(burst.geometry.parameters.tube/burst.geometry.parameters.radius<.05,'pulse shell stays thin at boss scale');const chargeSize=charge.scale.x;
effects.update([pulse],1800);assert(charge.scale.x>chargeSize,'a pulse gathers a visible colored charge');assert.equal(charge.position.z,-6,'a pulse charges at the caster instead of pretending to fly');
effects.update([pulse],2000);assert(!charge.visible&&burst.visible);const burstSize=burst.scale.x;effects.update([pulse],2200);assert(burst.scale.x>burstSize,'pulse contact releases an expanding burst');
for(const dungeonHazard of [false,true]){const dungeonEnemy={...slam,instanceId:'vault',attack:{...slam.attack,id:`dungeon-${dungeonHazard}`,dungeonHazard}};effects.update([dungeonEnemy],1200);assert.equal(cast().getObjectByName('impact-warning').visible,!dungeonHazard,'normal dungeon specials retain warnings while synthetic hazard circles are not duplicated');}
effects.clear();
// Shared primitive geometry survives an attack; every per-attack resource is released once.
const disposal=new Map(),watch=r=>{if(!disposal.has(r)){disposal.set(r,0);r.addEventListener('dispose',()=>disposal.set(r,disposal.get(r)+1));}};
effects.update([slam,pulse],1800);root().traverse(n=>{if(n.isMesh){watch(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])watch(m);if(n.isInstancedMesh)watch(n);}});
const shared=new Set();for(const c of root().children)for(const name of ['monster-projectile','melee-contact-arcs','impact-shards','pulse-burst'])shared.add(c.getObjectByName(name).geometry);
assert.equal(shared.size,4,'concurrent effects share all static primitive geometry');
effects.clear();for(const [r,n]of disposal)assert.equal(n,shared.has(r)?0:1,'attack-owned resources release exactly once and shared geometry remains reusable');
// Four boss identities use actual encounter radii/times, different geometry and no early impacts.
const bossShared=new Set(),bossShapes=new Map(),bossColors=new Set(),bossDetails={
 'briarhorn-elder':['briar-roots','ConeGeometry'], 'rimefang-matriarch':['rime-spires','ConeGeometry'],
 'stormhorn-behemoth':['storm-bolts','BoxGeometry'], 'ashen-crown-titan':['magma-boulders','DodecahedronGeometry'],
};
for(const boss of WORLD_BOSSES)for(const ability of boss.attacks.filter(attack=>attack.style!=='charge')){
 const attack={...enemy.attack,id:`${boss.id}-${ability.name}`,style:ability.style,radius:ability.radius,impactAt:1000+ability.windupMs,endsAt:1800+ability.windupMs};
 const monster={...enemy,id:boss.id,kind:boss.kind,worldBoss:true,attack},[name,geometryType]=bossDetails[boss.kind];
 effects.update([monster],attack.impactAt-1);const visual=cast(),detail=visual.getObjectByName(name),area=visual.getObjectByName('impact-area');
 assert(detail&&!detail.visible&&!visual.getObjectByName('impact-shards').visible,'boss detail waits for authoritative damage time');
 assert.equal(detail.geometry.type,geometryType);bossShapes.set(boss.kind,detail.geometry);bossColors.add(detail.material.color.getHexString());
 assert.equal(detail.material.blending,boss.kind==='stormhorn-behemoth'?THREE.AdditiveBlending:THREE.NormalBlending,'solid boss details retain their color instead of accumulating white light');
 assert(area.visible&&area.geometry.type==='CircleGeometry','all boss warnings show full damage disks, including the center');
 const p=visual.getObjectByName('impact-warning').geometry.getAttribute('position');
 assert(Math.abs(Math.max(...Array.from({length:p.count},(_,i)=>Math.hypot(p.getX(i),p.getZ(i))))-attack.radius)<.00001,'warning matches the server radius');
 effects.update([{...monster,x:40,z:-40}],attack.impactAt);assert.equal(cast(),visual);assert.deepEqual(visual.position.toArray(),[attack.x,0,attack.z],'the tell remains at the locked impact location when the caster moves');
 assert(detail.visible&&!area.visible);const before=detail.instanceMatrix.array.slice();
 for(let i=0;i<detail.count;i++){detail.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));assert(Math.hypot(matrix.elements[12],matrix.elements[14])<=attack.radius,'detail originates within the actual damage disk');}
 effects.update([monster],attack.impactAt+200);assert(detail.instanceMatrix.array.some((v,i)=>v!==before[i]),'boss roots grow, crystals rise, lightning contracts and magma tumbles');
 visual.traverse(n=>{if(n.isMesh){watch(n.geometry);watch(n.material);if(n.isInstancedMesh)watch(n);if(!['impact-warning','impact-area','impact-shockwave'].includes(n.name))bossShared.add(n.geometry);}});
 const resources=[];visual.traverse(n=>{if(n.isMesh)resources.push(n.geometry,n.material,...(n.isInstancedMesh?[n]:[]));});
 effects.update([{...monster,attack:null}],attack.impactAt+220);assert.equal(root().children.length,0,'cancelling a boss special removes all detailed effects');
 for(const r of new Set(resources))assert.equal(disposal.get(r),bossShared.has(r)?0:1,'boss materials/instances are released while shared geometry remains reusable');
 effects.update([monster],attack.impactAt);effects.update([{...monster,alive:false}],attack.impactAt+1);assert.equal(root().children.length,0,'boss death removes the detailed impact');
 effects.update([{...monster,attack:{...attack,basic:true}}],attack.impactAt);assert(!cast().getObjectByName(name),'ordinary boss strikes never trigger their special geometry');effects.clear();
}
assert.equal(bossColors.size,4);assert.equal(bossShapes.size,4);
assert.notDeepEqual(bossShapes.get('briarhorn-elder').getAttribute('position').array,bossShapes.get('rimefang-matriarch').getAttribute('position').array,'roots bend while ice spires stay sharply straight');
// Charges warn the complete fixed capsule until the server resolves lane damage at dash end.
const chargeAttack={id:'charge-lane',style:'charge',startedAt:1000,chargeAt:1800,impactAt:2300,endsAt:2900,fromX:3,fromZ:-2,x:11,z:4,radius:1.4};
const chargeShared=new Set(),lanePoint=(along,across=0)=>({x:3+along*.8+across*.6,z:-2+along*.6-across*.8});
function covered(geometry,point){
 const p=geometry.getAttribute('position'),indices=geometry.index.array,x=point.x-chargeAttack.x,z=point.z-chargeAttack.z;
 for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),ax=p.getX(a),az=p.getZ(a),bx=p.getX(b),bz=p.getZ(b),cx=p.getX(c),cz=p.getZ(c),den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-10)continue;const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den;if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)return true;}return false;
}
for(const profile of [{kind:'bramble-wolf',worldBoss:false},...WORLD_BOSSES.map(boss=>({kind:boss.kind,worldBoss:true}))]){
 const monster={...enemy,...profile,x:3,z:-2,attack:chargeAttack};effects.update([monster],1799);
 const visual=cast(),ring=visual.getObjectByName('impact-warning'),area=visual.getObjectByName('impact-area'),arrows=visual.getObjectByName('charge-direction'),dust=visual.getObjectByName('charge-dust-trail');
 assert(ring.visible&&area.visible&&arrows.visible&&!dust.visible&&!visual.getObjectByName('impact-shards').visible,'the corridor and direction appear before any charge movement/impact');
 assert.equal(area.geometry.type,'BufferGeometry','charge does not substitute an endpoint disk for the damaging lane');
 for(const along of [-1,0,2.5,5,7.5,10,11])assert(covered(area.geometry,lanePoint(along)),'the entire corridor and both rounded end caps are filled');
 for(const across of [-1.3,1.3])assert(covered(area.geometry,lanePoint(5,across)));assert(!covered(area.geometry,lanePoint(5,1.5)),'outside the server halfwidth is visibly safe');
 const p=ring.geometry.getAttribute('position');let intermediate=false;
 for(let i=0;i<p.count;i++){const x=p.getX(i)+11,z=p.getZ(i)+4,along=(x-3)*.8+(z+2)*.6,across=(x-3)*.6-(z+2)*.8,cap=Math.max(0,-along,along-10);assert(Math.hypot(across,cap)<=1.40001,'charge border stays inside the exact capsule');assert(Math.abs(p.getY(i)-height(x,z)-.09)<.00001,'long lane sides follow the terrain');if(along>2&&along<8)intermediate=true;}assert(intermediate);
 const before=p.array.slice();effects.update([{...monster,...lanePoint(5)}],2050);assert.equal(cast(),visual);assert.deepEqual(p.array,before,'turning or moving the monster never retargets its locked lane');assert(dust.visible&&ring.visible&&arrows.visible&&!visual.getObjectByName('impact-shards').visible,'dust begins during the dash, while the full damaging lane remains marked');
 for(let i=0;i<dust.count;i++){dust.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));const along=(matrix.elements[12]+8)*.8+(matrix.elements[14]+6)*.6;assert(along>=-.0001&&along<=5,'dust follows the actual monster instead of racing ahead by the animation clock');}
 effects.update([{...monster,...lanePoint(10)}],2300);assert(!dust.visible&&!ring.visible&&!arrows.visible&&visual.getObjectByName('impact-shards').visible&&visual.getObjectByName('pulse-burst').visible,'charge impact begins at authoritative dash end');
 const resources=[];visual.traverse(n=>{if(n.isMesh){watch(n.geometry);watch(n.material);resources.push(n.geometry,n.material);if(n.isInstancedMesh){watch(n);resources.push(n);}if(!['impact-warning','impact-area','impact-shockwave'].includes(n.name))chargeShared.add(n.geometry);}});
 effects.update([{...monster,attack:null}],2301);assert.equal(root().children.length,0);for(const r of new Set(resources))assert.equal(disposal.get(r),chargeShared.has(r)?0:1,'charge cancellation disposes capsule/instances/materials once');
 effects.update([monster],2050);effects.update([{...monster,alive:false}],2051);assert.equal(root().children.length,0,'death cancels an in-flight charge corridor and dust');
}
for(const invalid of [{fromX:undefined},{fromZ:Infinity},{chargeAt:NaN},{chargeAt:1000},{chargeAt:2300},{fromX:11,fromZ:4},{fromX:100}]){effects.update([{...enemy,attack:{...chargeAttack,...invalid}}],2050);assert.equal(root().children.length,0,'malformed charge paths/timestamps never render');}
for(const invalid of [NaN,Infinity,-1]){effects.update([{...enemy,attack:{...enemy.attack,radius:invalid}}],1800);assert.equal(root().children.length,0);}

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const castUI=main.split('\n').filter(line=>line.includes("const cast=view.label.querySelector")||line.startsWith("  if(attack&&!attack.basic){cast.")).join('\n');
assert(castUI.includes('cast.hidden='));
for(const [attack,monsterNow,hidden] of [[null,1100,true],[{...enemy.attack,basic:true},1100,true],[enemy.attack,1100,false],[enemy.attack,2000,true]]) {
 const cast={hidden:false,querySelector:()=>({style:{}})};
 runInNewContext(stripTypeScriptTypes(castUI),{attack,monsterNow,view:{label:{querySelector:()=>cast}},monsterAttackNames:{spit:'Venom spit'}});
 assert.equal(cast.hidden,hidden,'only charging specials show the enemy cast bar');
}
const crowd=Array.from({length:80},(_,i)=>({...enemy,id:`mob-${i}`,attack:{...enemy.attack,id:`attack-${i}`}}));
effects.update(crowd,1800);assert.equal(root().children.length,64);
crowd.push({...enemy,id:'boss',worldBoss:true,attack:{...enemy.attack,id:'boss-attack'}});effects.update(crowd,1800);assert.equal(root().children.length,64);assert(root().getObjectByName('monster-attack-boss'),'boss warning takes priority in crowds');
effects.clear();assert.equal(root().children.length,0);assert(scene.children.includes(other));
effects.dispose();effects.dispose();effects.update([enemy],1800);assert.deepEqual(scene.children,[other]);for(const r of new Set([...shared,...bossShared,...chargeShared]))assert.equal(disposal.get(r),1,'system disposal releases shared primitives exactly once');
console.log('PASS: fixed capsule charge warnings/arrows, authoritative dash dust and lane impact; four boss roots/ice/lightning/magma impacts; exact server timing/footprints, terrain, cancellation/death, normal contact and dungeon effects, shared-resource disposal.');
