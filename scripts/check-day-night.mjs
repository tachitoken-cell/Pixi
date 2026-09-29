import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WORLD_DAY_MS, sampleWorldTime, createDayNightCycle } from '../src/day-night.ts';
import { ZONES } from '../src/content.ts';
const atHour=hour=>((hour+12)%24)/24*WORLD_DAY_MS;
const near=(a,b,epsilon=1e-8)=>assert(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);
assert.equal(WORLD_DAY_MS,40*60*1000);
assert.deepEqual(sampleWorldTime(0),{hour:12,phase:'Day',daylight:1,label:'12:00'});
for(const [hour,phase,label] of [[0,'Night','00:00'],[5,'Dawn','05:00'],[6,'Dawn','06:00'],[8,'Day','08:00'],[17,'Dusk','17:00'],[18,'Dusk','18:00'],[20,'Night','20:00'],[23.5,'Night','23:30']]){
  const sample=sampleWorldTime(atHour(hour));near(sample.hour,hour);assert.equal(sample.phase,phase);assert.equal(sample.label,label);
  for(const days of [-100,-1,0,1,100])assert.deepEqual(sampleWorldTime(atHour(hour)+days*WORLD_DAY_MS),sample,'clock wraps deterministically in both directions');
}
assert.deepEqual(sampleWorldTime(NaN),sampleWorldTime(0));assert.deepEqual(sampleWorldTime(Infinity),sampleWorldTime(0));
assert.equal(sampleWorldTime(atHour(0)).daylight,0);assert.equal(sampleWorldTime(atHour(12)).daylight,1);
for(let minute=0;minute<1440;minute++){
  const s=sampleWorldTime(atHour(minute/60));assert(s.hour>=0&&s.hour<24&&s.daylight>=0&&s.daylight<=1);assert(/^\d{2}:\d{2}$/.test(s.label));
  const next=sampleWorldTime(atHour(minute/60)+1000);assert(Math.abs(s.daylight-next.daylight)<.015,'smooth clock progression through sunrise/sunset');
}

const scene=new THREE.Scene(),hemi=new THREE.HemisphereLight(0xecf0d0,0x6d8264,1.8),sun=new THREE.DirectionalLight(0xfff0d2,2.5);
sun.position.set(-20,34,18);sun.castShadow=true;sun.target.position.set(7,1,9);scene.add(hemi,sun);
const originalSky=new THREE.Color(0xabcabc),originalFog=new THREE.Fog(0x567890,60,300);scene.background=originalSky;scene.fog=originalFog;
const persistent=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(persistent);let sharedDisposals=0;
for(const resource of [persistent.geometry,persistent.material])resource.addEventListener('dispose',()=>sharedDisposals++);
const camera=new THREE.PerspectiveCamera(52,1,.1,500);camera.position.set(35,12,80);camera.lookAt(20,3,30);camera.updateMatrixWorld();
const observer=new THREE.Vector3(20,3,30),cycle=createDayNightCycle(scene,hemi,sun),root=scene.getObjectByName('Mossvale day-night sky');
assert.equal(root.children.length,3);assert.equal(root.children.filter(n=>n.isLight).length,0,'reuse existing lights rather than adding celestial lights');
const stars=root.getObjectByName('World stars'),moon=root.getObjectByName('World moon'),disk=root.getObjectByName('World sun');
assert.equal(stars.geometry.attributes.position.count,240);
assert(stars.renderOrder<moon.renderOrder&&moon.renderOrder<0,'moon covers background stars while foreground translucent VFX draw later');
for(const node of root.children){assert(node.material.depthTest&&!node.material.depthWrite&&!node.material.fog,'sky objects respect opaque foreground depth');}
const skyByZone=new Set();
const lighting=()=>[scene.background.getHex(),scene.fog.color.getHex(),scene.fog.near,scene.fog.far,hemi.color.getHex(),hemi.groundColor.getHex(),hemi.intensity,sun.color.getHex(),sun.intensity];
for(const zone of ZONES){
  const state=cycle.update(0,zone.id,false,observer,camera);assert.deepEqual(state,sampleWorldTime(0));
  near(hemi.intensity,1.8);near(sun.intensity,2.5);assert(disk.visible&&!moon.visible&&!stars.visible);assert(root.visible);
  assert.equal(scene.background.getHex(),new THREE.Color(zone.sky).getHex(),'day retains established zone sky');skyByZone.add(scene.background.getHex());
  const daylight=lighting();cycle.update(atHour(0),zone.id,false,observer,camera);
  assert(moon.visible&&stars.visible&&!disk.visible);assert(hemi.intensity>=.9&&sun.intensity>=.45,'moonlight keeps navigation readable');
  assert.notDeepEqual(lighting(),daylight);closePosition(root.position,camera.position);closePosition(sun.target.position,observer);
  assert(sun.position.y>observer.y,'one shared directional light represents the moon at night');
  const nightSky=scene.background.getHex();cycle.update(atHour(6),zone.id,false,observer,camera);assert.notEqual(scene.background.getHex(),nightSky);
  // Dawn, noon and midnight cannot alter the fixed dungeon palette inherited from current game lighting.
  let dungeonLighting;
  for(const hour of [6,12,18,0]){
    cycle.update(atHour(hour),zone.id,true,observer,camera);
    assert(!root.visible);assert.equal(scene.background.getHex(),0x0b1014);assert.equal(scene.fog.color.getHex(),0x131a20);
    near(hemi.intensity,1.8);near(sun.intensity,1.5);assert.equal(sun.color.getHex(),0xc9b4ec);
    closePosition(sun.position,new THREE.Vector3(0,37,48));
    if(dungeonLighting)assert.deepEqual(lighting(),dungeonLighting);else dungeonLighting=lighting();
  }
  cycle.update(0,zone.id,true,observer,camera,true);
  assert.equal(scene.background.getHex(),0x090616);assert.equal(hemi.groundColor.getHex(),0x393050);
  cycle.update(0,zone.id,false,observer,camera);assert.deepEqual(lighting(),daylight,'leaving dungeon restores the current zone/time palette');
}
assert.equal(skyByZone.size,ZONES.length,'every regional palette stays distinct');
const farCamera=new THREE.PerspectiveCamera(52,1,.1,120);farCamera.position.set(-200,40,600);farCamera.lookAt(-210,40,590);farCamera.updateMatrixWorld();
cycle.update(atHour(0),'greenwood',false,observer,farCamera);closePosition(root.position,farCamera.position);assert(stars.scale.x<farCamera.far,'sky follows camera inside its far clip distance');
const resources=new Set(root.children.flatMap(n=>[n.geometry,n.material])),disposals=new Map();
for(const resource of resources)resource.addEventListener('dispose',()=>disposals.set(resource,(disposals.get(resource)||0)+1));
cycle.dispose();cycle.dispose();cycle.update(0,'amberwild',false,observer,camera);
assert.equal(scene.background,originalSky);assert.equal(scene.fog,originalFog);assert.equal(root.parent,null);assert.equal(root.children.length,0);
assert(resources.size===6&&[...resources].every(r=>disposals.get(r)===1),'owned sky geometry/materials disposed exactly once');
assert.equal(sharedDisposals,0);assert.deepEqual(scene.children,[hemi,sun,persistent]);closePosition(sun.position,new THREE.Vector3(-20,34,18));closePosition(sun.target.position,new THREE.Vector3(7,1,9));
assert(sun.castShadow,'existing shadow policy is unchanged');near(sun.intensity,2.5);near(hemi.intensity,1.8);
function closePosition(a,b){assert(a.distanceTo(b)<1e-8,`${a.toArray()} differs from ${b.toArray()}`);}
console.log('PASS: 40-minute epoch clock, exact noon/wrap/phase labels, smooth daylight, distinct biome palettes, readable moonlight, camera-relative bounded stars/sun/moon, unchanged dungeon lighting, zone transitions and isolated idempotent disposal.');
