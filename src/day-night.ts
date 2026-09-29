import * as THREE from 'three';
import { ZONES, type ZoneId } from './content.ts';

export const WORLD_DAY_MS = 40 * 60 * 1000;
export interface WorldTime { hour:number; phase:'Dawn'|'Day'|'Dusk'|'Night'; daylight:number; label:string }
const smooth = (low:number,high:number,value:number) => {const t=THREE.MathUtils.clamp((value-low)/(high-low),0,1);return t*t*(3-2*t);};

/** Shared epoch clock: timestamp zero is noon; one full world day takes 40 real minutes. */
export function sampleWorldTime(serverTimeMs:number):WorldTime {
  const time=Number.isFinite(serverTimeMs)?serverTimeMs:0;
  const fraction=(((time%WORLD_DAY_MS)+WORLD_DAY_MS+WORLD_DAY_MS/2)%WORLD_DAY_MS)/WORLD_DAY_MS;
  const hour=fraction*24,minutes=Math.floor(hour*60+1e-8)%1440;
  return {hour,phase:hour<5||hour>=20?'Night':hour<8?'Dawn':hour<17?'Day':'Dusk',
    daylight:smooth(-.16,.20,Math.cos((hour-12)*Math.PI/12)),
    label:`${Math.floor(minutes/60).toString().padStart(2,'0')}:${(minutes%60).toString().padStart(2,'0')}`};
}

const palettes:Record<ZoneId,{nightSky:number;nightFog:number;nightHemi:number;nightGround:number;duskSky:number;duskFog:number;daySun:number}>={
  greenwood:{nightSky:0x192b43,nightFog:0x293e50,nightHemi:0x8da8cf,nightGround:0x405454,duskSky:0xbe8e85,duskFog:0xb19a87,daySun:0xfff0d2},
  amberwild:{nightSky:0x2a293d,nightFog:0x463c50,nightHemi:0xa4a8ca,nightGround:0x594e48,duskSky:0xdb9370,duskFog:0xc69276,daySun:0xffe0ac},
  frostmarch:{nightSky:0x1d2c4b,nightFog:0x344a65,nightHemi:0xa7bee1,nightGround:0x56697b,duskSky:0xb19bbb,duskFog:0xaaa8b9,daySun:0xe4f1ff},
  hollow:{nightSky:0x17192e,nightFog:0x2b2742,nightHemi:0x9e99c4,nightGround:0x47405a,duskSky:0x65506f,duskFog:0x68556e,daySun:0xe2d3f0},
  sunveil:{nightSky:0x292b46,nightFog:0x514855,nightHemi:0xa8accf,nightGround:0x645848,duskSky:0xe2a17c,duskFog:0xcaa585,daySun:0xffe5bc},
  mistwood:{nightSky:0x152d39,nightFog:0x24484b,nightHemi:0x91bfcb,nightGround:0x345749,duskSky:0x89a395,duskFog:0x779b88,daySun:0xe6f1cf},
};

/** Reuse the scene's two lights; three tiny sky draws are the only owned render resources. */
export function createDayNightCycle(scene:THREE.Scene,hemi:THREE.HemisphereLight,sun:THREE.DirectionalLight){
  const original={background:scene.background,fog:scene.fog,hemiColor:hemi.color.clone(),groundColor:hemi.groundColor.clone(),hemiIntensity:hemi.intensity,
    sunColor:sun.color.clone(),sunIntensity:sun.intensity,sunPosition:sun.position.clone(),targetPosition:sun.target.position.clone()};
  const sky=new THREE.Color(),fog=new THREE.Fog(0xffffff,150,430);
  const cached=Object.fromEntries(ZONES.map(zone=>{const p=palettes[zone.id];return[zone.id,{
    daySky:new THREE.Color(zone.sky),dayFog:new THREE.Color(zone.fog),nightSky:new THREE.Color(p.nightSky),nightFog:new THREE.Color(p.nightFog),
    nightHemi:new THREE.Color(p.nightHemi),nightGround:new THREE.Color(p.nightGround),duskSky:new THREE.Color(p.duskSky),duskFog:new THREE.Color(p.duskFog),daySun:new THREE.Color(p.daySun),
  }];})) as Record<ZoneId,{daySky:THREE.Color;dayFog:THREE.Color;nightSky:THREE.Color;nightFog:THREE.Color;nightHemi:THREE.Color;nightGround:THREE.Color;duskSky:THREE.Color;duskFog:THREE.Color;daySun:THREE.Color}>;
  const dayHemi=new THREE.Color(0xecf0d0),dayGround=new THREE.Color(0x6d8264),moonlight=new THREE.Color(0xb9d1fb),warmSun=new THREE.Color(0xffb673);
  const duskHemi=new THREE.Color(0xebba9e),dungeonSky=new THREE.Color(0x0b1014),dungeonFog=new THREE.Color(0x131a20),dungeonSun=new THREE.Color(0xc9b4ec);
  const root=new THREE.Group();root.name='Mossvale day-night sky';scene.add(root);
  const starPositions=new Float32Array(240*3),starColors=new Float32Array(240*3);
  for(let i=0;i<240;i++){
    const height=.10+.88*(i+.5)/240,angle=i*2.39996323,r=Math.sqrt(1-height*height),brightness=.55+(i%7)/15;
    starPositions.set([Math.cos(angle)*r,height,Math.sin(angle)*r],i*3);
    starColors.set([brightness*.87,brightness*.94,brightness],i*3);
  }
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));starGeometry.setAttribute('color',new THREE.BufferAttribute(starColors,3));
  const starMaterial=new THREE.PointsMaterial({size:1.5,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:0,depthTest:true,depthWrite:false,fog:false,toneMapped:false});
  const stars=new THREE.Points(starGeometry,starMaterial);stars.name='World stars';stars.frustumCulled=false;stars.renderOrder=-20;root.add(stars);
  const sunMaterial=new THREE.MeshBasicMaterial({color:0xffdf9d,transparent:true,depthTest:true,depthWrite:false,fog:false,toneMapped:false});
  const sunDisk=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),sunMaterial);sunDisk.name='World sun';sunDisk.renderOrder=-19;root.add(sunDisk);
  const moonGeometry=new THREE.IcosahedronGeometry(1,1),moonPositions=moonGeometry.getAttribute('position'),moonColors=new Float32Array(moonPositions.count*3);
  for(let i=0;i<moonPositions.count;i++){
    const x=moonPositions.getX(i),y=moonPositions.getY(i),z=moonPositions.getZ(i),shade=.67+.28*Math.max(0,-x*.4+y*.6+z*.45);
    moonColors.set([shade*.84,shade*.91,shade],i*3);
  }
  moonGeometry.setAttribute('color',new THREE.BufferAttribute(moonColors,3));
  const moonMaterial=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthTest:true,depthWrite:false,fog:false,toneMapped:false});
  const moon=new THREE.Mesh(moonGeometry,moonMaterial);moon.name='World moon';moon.renderOrder=-19;root.add(moon);
  const direction=new THREE.Vector3(),lightDirection=new THREE.Vector3(),cameraWorld=new THREE.Vector3();
  let disposed=false;
  function update(serverTimeMs:number,zone:ZoneId,dungeon:boolean,observer:THREE.Vector3,camera:THREE.Camera,raid=false,instantCombat?:'bone-pit'|'void-rift'):WorldTime{
    const state=sampleWorldTime(serverTimeMs);if(disposed)return state;
    scene.background=sky;scene.fog=fog;root.visible=!dungeon;
    sun.target.position.copy(observer);sun.target.updateMatrixWorld();
    if(instantCombat){
      const voidRift=instantCombat==='void-rift';root.visible=false;
      sky.set(voidRift?0x100b20:0xa18a70);fog.color.copy(sky);fog.near=70;fog.far=160;
      hemi.color.set(voidRift?0xc2b4e9:0xffedcc);hemi.groundColor.set(voidRift?0x302440:0x735744);hemi.intensity=voidRift?1.6:2;
      sun.color.set(voidRift?0xbba4f2:0xffe1b1);sun.intensity=voidRift?1.7:2.4;sun.position.set(observer.x-24,observer.y+45,observer.z+28);
      return {...state,daylight:voidRift?.2:1};
    }
    if(dungeon){
      // Explicit constants prevent the most recent overworld time from tinting the dungeon.
      sky.copy(dungeonSky);fog.color.copy(dungeonFog);fog.near=30;fog.far=105;
      if(raid){sky.set(0x090616);fog.color.set(0x17102b);fog.near=55;fog.far=155;}
      hemi.color.copy(dayHemi);hemi.groundColor.copy(dayGround);hemi.intensity=1.8;
      if(raid){hemi.color.set(0xd6c5ff);hemi.groundColor.set(0x393050);}
      sun.color.copy(dungeonSun);sun.intensity=1.5;sun.position.set(observer.x-20,observer.y+34,observer.z+18);
      return state;
    }
    const palette=cached[zone],angle=(state.hour-6)*Math.PI/12,elevation=Math.sin(angle),day=state.daylight;
    const twilight=Math.pow(Math.max(0,1-Math.abs(elevation)/.60),1.6)*(.4+.6*day);
    sky.copy(palette.nightSky).lerp(palette.daySky,day).lerp(palette.duskSky,twilight*.68);
    fog.color.copy(palette.nightFog).lerp(palette.dayFog,day).lerp(palette.duskFog,twilight*.72);
    fog.near=110+40*day;fog.far=370+60*day;
    hemi.color.copy(palette.nightHemi).lerp(dayHemi,day).lerp(duskHemi,twilight*.38);
    hemi.groundColor.copy(palette.nightGround).lerp(dayGround,day);hemi.intensity=.94+.86*day;
    const sunStrength=smooth(-.015,.42,elevation),moonStrength=1-smooth(-.30,.015,elevation);
    sun.color.copy(moonlight).lerp(palette.daySun,day).lerp(warmSun,twilight*.82);
    sun.intensity=2.5*sunStrength+.48*moonStrength;
    direction.set(-Math.cos(angle),elevation*.85,elevation*.52).normalize();
    lightDirection.copy(direction).multiplyScalar(elevation>=0?1:-1);
    lightDirection.y=Math.max(.16,lightDirection.y);lightDirection.normalize();
    sun.position.copy(observer).addScaledVector(lightDirection,44);
    camera.getWorldPosition(cameraWorld);root.position.copy(cameraWorld);
    const far=camera instanceof THREE.PerspectiveCamera||camera instanceof THREE.OrthographicCamera?camera.far:500;
    const radius=Math.min(360,far*.78);
    stars.scale.setScalar(radius);stars.rotation.y=state.hour*Math.PI/12;starMaterial.opacity=(1-day)*.88;
    stars.visible=starMaterial.opacity>.005;
    sunDisk.position.copy(direction).multiplyScalar(radius*.96);sunDisk.scale.setScalar(radius*.028);
    sunMaterial.color.copy(palette.daySun).lerp(warmSun,twilight);sunMaterial.opacity=day;
    sunDisk.visible=elevation>-.025&&day>.005;
    moon.position.copy(direction).multiplyScalar(-radius*.96);moon.scale.setScalar(radius*.021);moonMaterial.opacity=1-day;
    moon.visible=elevation<.025&&moonMaterial.opacity>.005;
    return state;
  }
  return {update,dispose(){
    if(disposed)return;disposed=true;root.removeFromParent();
    for(const object of [stars,sunDisk,moon]){object.geometry.dispose();object.material.dispose();}root.clear();
    if(scene.background===sky)scene.background=original.background;if(scene.fog===fog)scene.fog=original.fog;
    hemi.color.copy(original.hemiColor);hemi.groundColor.copy(original.groundColor);hemi.intensity=original.hemiIntensity;
    sun.color.copy(original.sunColor);sun.intensity=original.sunIntensity;sun.position.copy(original.sunPosition);sun.target.position.copy(original.targetPosition);sun.target.updateMatrixWorld();
  }};
}
