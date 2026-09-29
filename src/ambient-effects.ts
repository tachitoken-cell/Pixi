import * as THREE from 'three';
import type { ZoneId } from './content.ts';
import { groundHeight, WATER_LEVEL } from './landscape.ts';
import { disposeWorldGroup } from './world.ts';
import { graphics } from './graphics-settings.ts';

export interface AmbientView {
  position: THREE.Vector3; zone: ZoneId; dungeon: boolean; moving: boolean;
  sprinting: boolean; mounted: boolean; grounded: boolean; swimming: boolean; indoors: boolean; active: boolean;
  daylight?: number;
}
type Dust = { x:number; y:number; z:number; vx:number; vz:number; born:number; life:number; size:number; snow:boolean };
const MOTES=80, DRIFT=120, DUST=96;
const wrap=(n:number,span:number)=>((n%span)+span)%span-span/2;
const palettes:Record<ZoneId,{mote:number;leaf:number[]}>={
  greenwood:{mote:0xe4ff9b,leaf:[0xa6bd53,0xc5a458,0x88b96a]},
  amberwild:{mote:0xffd987,leaf:[0xd57b38,0xdba548,0xc4bd69]},
  frostmarch:{mote:0xbcefff,leaf:[0xd9f4ff,0xffffff,0xb7dae8]},
  hollow:{mote:0xcbb6ff,leaf:[0x9985b6,0xad9dbb,0x9cb2bc]},
  sunveil:{mote:0xffd79d,leaf:[0xd4b273,0xe4c790,0xb89560]},
  mistwood:{mote:0xb9f8b8,leaf:[0x3f9d68,0x62b979,0x8cc876]},
};

/** Three reusable instance buffers; visual particles never alter movement or combat. */
export function createAmbientEffects(parent:THREE.Scene|THREE.Group){
  const root=new THREE.Group();root.name='Ambient effects';parent.add(root);
  const pose=new THREE.Object3D(),color=new THREE.Color(),previous=new THREE.Vector3();
  let disposed=false,lastTime=0,lastStep=-Infinity,lastSpace='',hasPrevious=false,wasGrounded=true,cursor=0,step=0;
  let quality=graphics.effects;
  const dust: Dust[]=[];
  function batch(name:string,limit:number,additive=false){
    const geometry=new THREE.BoxGeometry(1,1,1);
    const opacity=new THREE.InstancedBufferAttribute(new Float32Array(limit),1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('ambientOpacity',opacity);
    const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,toneMapped:false,
      blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float ambientOpacity; varying float ambientAlpha;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nambientAlpha = ambientOpacity;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float ambientAlpha;')
        .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= ambientAlpha;');
    };
    material.customProgramCacheKey=()=> 'mossvale-ambient-alpha-v1';
    const mesh=new THREE.InstancedMesh(geometry,material,limit);mesh.name=name;mesh.count=0;mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);return mesh;
  }
  const motes=batch('Ambient fireflies and spores',MOTES,true),drift=batch('Ambient leaves and snow',DRIFT),steps=batch('Footstep dust',DUST);
  const batches=[motes,drift,steps];
  function draw(mesh:THREE.InstancedMesh,x:number,y:number,z:number,sx:number,sy:number,sz:number,turn:number,tint:number,alpha:number){
    if(mesh.count>=mesh.instanceMatrix.count||alpha<=.002)return;
    pose.position.set(x,y,z);pose.scale.set(sx,sy,sz);pose.rotation.set(turn*.7,turn,turn*.3);pose.updateMatrix();
    mesh.setMatrixAt(mesh.count,pose.matrix);mesh.setColorAt(mesh.count,color.setHex(tint));
    (mesh.geometry.getAttribute('ambientOpacity') as THREE.InstancedBufferAttribute).setX(mesh.count++,THREE.MathUtils.clamp(alpha,0,1));
  }
  function burst(view:AmbientView,time:number,dx:number,dz:number,landing=false){
    const count=Math.ceil((landing?12:view.mounted?6:view.sprinting?5:3)*(quality==='low'?.25:1));
    const size=landing?.18:view.mounted?.14:view.sprinting?.11:.075,angle=Math.atan2(dx,dz),side=step++%2?1:-1;
    for(let i=0;i<count;i++){
      const turn=i*2.39996+step*1.7,spread=landing?.5:view.mounted?.38:.18;
      dust[cursor]={x:view.position.x+Math.cos(angle)*side*spread,y:view.position.y+.07,z:view.position.z-Math.sin(angle)*side*spread,
        vx:Math.cos(turn)*.55-dx*.12,vz:Math.sin(turn)*.55-dz*.12,born:time,life:.55+i%3*.13,size:size*(1+i%3*.25),snow:view.zone==='frostmarch'};
      cursor=(cursor+1)%(quality==='low'?DUST/4:DUST);
    }
  }
  function reset(){dust.length=0;cursor=0;hasPrevious=false;lastStep=-Infinity;for(const mesh of batches)mesh.count=0;}
  return {root,
    update(time:number,view:AmbientView){
      if(disposed)return;
      if(quality!==graphics.effects){quality=graphics.effects;reset();}
      if(quality==='off'){root.visible=false;reset();lastTime=time;return;}
      if(!Number.isFinite(time)||!view.position.toArray().every(Number.isFinite)||!Object.hasOwn(palettes,view.zone)){root.visible=false;reset();return;}
      root.visible=view.active;if(!view.active){reset();lastTime=time;return;}
      const space=`${view.zone}:${view.dungeon}`,gap=previous.distanceTo(view.position);
      if(space!==lastSpace||time<lastTime||hasPrevious&&gap>20)reset();lastSpace=space;
      for(const mesh of batches)mesh.count=0;
      const palette=palettes[view.zone],snow=view.zone==='frostmarch'&&!view.dungeon,sand=view.zone==='sunveil'&&!view.dungeon;
      const daylight=Number.isFinite(view.daylight)?THREE.MathUtils.clamp(view.daylight!,0,1):1;
      // Outdoor fireflies emerge at dusk; leaves, snow and dust follow the available light.
      const fireflyGlow=view.dungeon||view.indoors?1:1+(1-daylight)*.65;
      (drift.material as THREE.MeshBasicMaterial).color.setScalar(.32+daylight*.68);
      (steps.material as THREE.MeshBasicMaterial).color.setScalar(view.dungeon||view.indoors?1:.32+daylight*.68);
      // Wrapped world coordinates stay still as the camera moves, fading before their distant boundary wraps.
      const radius=view.dungeon?12:24,span=radius*2,density=quality==='low'?.25:1;
      for(let i=0;i<(view.indoors?12:view.dungeon?26:snow?24:sand?12:MOTES)*density;i++){
        const x=view.position.x+wrap(Math.sin(i*83.17)*1000+Math.sin(time*.25+i)*1.3-view.position.x,span);
        const z=view.position.z+wrap(Math.cos(i*17.93)*1000+Math.cos(time*.21+i)*1.2-view.position.z,span);
        const floor=view.dungeon||view.indoors?view.position.y:Math.max(WATER_LEVEL,groundHeight(x,z));
        const fade=Math.max(0,1-Math.hypot(x-view.position.x,z-view.position.z)/radius);
        const glow=.35+.65*(.5+.5*Math.sin(time*(.9+i%3*.17)+i*2.1))**2,size=.045+(i%5)*.008;
        draw(motes,x,floor+.6+i%9*.48+Math.sin(time*.55+i)*.25,z,size,size,size,time*.3+i,view.dungeon?0xcbb3ef:palette.mote,fade*glow*(view.indoors?.35:.9)*fireflyGlow);
      }
      if(!view.dungeon&&!view.indoors){
        const count=(snow?DRIFT:sand?48:view.zone==='amberwild'?60:32)*density;
        for(let i=0;i<count;i++){
          const phase=(time*(snow?.085:.055)+i*.618033)%1;
          const x=view.position.x+wrap(Math.sin(i*47.29+3)*1000+time*.38+Math.sin(time+i)*.6-view.position.x,span);
          const z=view.position.z+wrap(Math.cos(i*23.41+7)*1000+time*.16+Math.cos(time*.7+i)*.7-view.position.z,span);
          const floor=Math.max(WATER_LEVEL,groundHeight(x,z)),size=snow?.065+i%4*.018:sand?.035+i%4*.012:.13+i%4*.03;
          const fade=Math.max(0,1-Math.hypot(x-view.position.x,z-view.position.z)/radius)*Math.sin(phase*Math.PI);
          draw(drift,x,floor+.2+(1-phase)*(snow?14:sand?1.6:9),z,size,snow?size*.65:sand?size*.5:.025,size*(snow?1:.55),time*(snow?.25:1.3)+i,palette.leaf[i%3],fade*.8);
        }
      }
      const dt=Math.max(.001,time-lastTime),travelled=hasPrevious?Math.hypot(view.position.x-previous.x,view.position.z-previous.z):0;
      if(hasPrevious&&!view.swimming&&view.grounded){
        const dx=(view.position.x-previous.x)/dt,dz=(view.position.z-previous.z)/dt;
        if(!wasGrounded)burst(view,time,dx,dz,true);
        else if(view.moving&&travelled>.002&&time-lastStep>(view.mounted?.10:view.sprinting?.15:.29)){burst(view,time,dx,dz);lastStep=time;}
      }
      for(const p of dust){
        const age=time-p.born,t=age/p.life;if(t<0||t>=1)continue;
        const size=p.size*(.65+t*1.8);
        draw(steps,p.x+p.vx*age,p.y+age*.38,p.z+p.vz*age,size,size*.65,size,t*2,p.snow?0xd9edf2:0xc8b994,(1-t)**2*.42);
      }
      for(const mesh of batches){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.geometry.getAttribute('ambientOpacity').needsUpdate=true;}
      previous.copy(view.position);hasPrevious=true;wasGrounded=view.grounded;lastTime=time;
    },
    dispose(){if(!disposed){disposed=true;reset();disposeWorldGroup(root);}},
  };
}
