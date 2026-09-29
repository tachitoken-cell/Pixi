import * as THREE from 'three';
import type { Enemy, EnemyAttack } from './shared.ts';
import { MONSTERS, THEMED_DUNGEON_ROSTERS } from './bestiary.ts';
import { INSTANT_COMBAT_RANGED_AUTO } from './instant-combat-skills.ts';

const dungeonColors = Object.fromEntries(Object.entries({plagueworks:'#a5ee6a',emberfall:'#ff783d',veilhaven:'#79e4d2'})
  .flatMap(([theme,color])=>THEMED_DUNGEON_ROSTERS[theme as keyof typeof THEMED_DUNGEON_ROSTERS].map(kind=>[kind,color])));

/** Special tells lead the server clock; contact flashes begin only at authoritative impact. */
export function createMonsterEffects(scene: THREE.Scene, height: (x:number,z:number,instance:boolean)=>number, modelHeight?: (enemy: Enemy) => number | undefined) {
  const group=new THREE.Group();group.name='Monster attack warnings';scene.add(group);
  const orbGeometry=new THREE.IcosahedronGeometry(1,1),chipGeometry=new THREE.BoxGeometry(1,1,1);
  const rootGeometry=new THREE.ConeGeometry(.3,1,5,3).translate(0,.5,0),iceGeometry=new THREE.ConeGeometry(.3,1,5).translate(0,.5,0);
  const roots=rootGeometry.getAttribute('position');for(let i=0;i<roots.count;i++)roots.setX(i,roots.getX(i)+roots.getY(i)**2*.4);rootGeometry.computeVertexNormals();rootGeometry.computeBoundingSphere();
  const leafGeometry=new THREE.IcosahedronGeometry(1,0).scale(1,.12,.45),rockGeometry=new THREE.DodecahedronGeometry(1,0);
  const bossThemes:Partial<Record<Enemy['kind'],{name:string;color:string;detail:THREE.BufferGeometry;chips:THREE.BufferGeometry;count:number}>>={
    'briarhorn-elder':{name:'briar-roots',color:'#b9e85e',detail:rootGeometry,chips:leafGeometry,count:18},
    'rimefang-matriarch':{name:'rime-spires',color:'#a6ecff',detail:iceGeometry,chips:iceGeometry,count:18},
    'stormhorn-behemoth':{name:'storm-bolts',color:'#b9c1ff',detail:chipGeometry,chips:orbGeometry,count:36},
    'ashen-crown-titan':{name:'magma-boulders',color:'#ff7435',detail:rockGeometry,chips:rockGeometry,count:18},
  };
  const burstGeometry=new THREE.TorusGeometry(1,.035,4,48).rotateX(-Math.PI/2);
  const arcGeometry=new THREE.RingGeometry(.76,1,20,1,Math.PI*.15,Math.PI*.7).rotateX(Math.PI/2);
  const waveTemplate=new THREE.RingGeometry(.88,1,40),waveVertices=waveTemplate.getAttribute('position').array.slice();
  const arrowGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-1,0,-.6,1,0,-.6,0,0,1],3));
  const pose=new THREE.Object3D(),boltStart=new THREE.Vector3(),boltEnd=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  type GlowMesh=THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
  const active=new Map<string,{root:THREE.Group;ring:GlowMesh;fill:GlowMesh;orb:GlowMesh;wave:GlowMesh;burst:GlowMesh;arcs:THREE.InstancedMesh;trail:THREE.InstancedMesh;chips:THREE.InstancedMesh;detail:THREE.InstancedMesh|null;arrows:THREE.InstancedMesh|null;origin:THREE.Vector3;impact:THREE.Vector3;worldBoss:boolean;seen:boolean}>();
  let disposed=false;
  function warpCircle(geometry:THREE.BufferGeometry,unit:ArrayLike<number>,attack:EnemyAttack,instance:boolean,radius=attack.radius) {
    const p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){const x=unit[i*3]*radius,z=unit[i*3+1]*radius;p.setXYZ(i,x,height(attack.x+x,attack.z+z,instance)+.09,z);}
    p.needsUpdate=true;geometry.computeBoundingSphere();return geometry;
  }
  function circle(geometry:THREE.BufferGeometry,attack:EnemyAttack,instance:boolean){return warpCircle(geometry,geometry.getAttribute('position').array.slice(),attack,instance);}
  function capsule(attack:EnemyAttack,instance:boolean,outline:boolean){
    const dx=attack.x-attack.fromX!,dz=attack.z-attack.fromZ!,length=Math.hypot(dx,dz);
    const vertices:number[]=[],indices:number[]=[],radius=attack.radius,inner=outline?radius*.9:0;
    const vertex=(across:number,along:number)=>{const x=(dz*across+dx*along)/length,z=(-dx*across+dz*along)/length,index=vertices.length/3;vertices.push(x,height(attack.x+x,attack.z+z,instance)+.09,z);return index;};
    const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,c,a,c,d);
    // Sample the long sides too: a charge warning must follow terrain all along its corridor.
    const steps=Math.ceil(length);
    for(let i=0;i<steps;i++)for(const side of outline?[-1,1]:[1]){
      const a=-length+i/steps*length,b=-length+(i+1)/steps*length,near=outline?inner*side:-radius,far=radius*side;
      quad(vertex(near,a),vertex(far,a),vertex(far,b),vertex(near,b));
    }
    for(const end of [0,1])for(let i=0;i<24;i++){
      const a=i/24*Math.PI,b=(i+1)/24*Math.PI,along=(r:number,t:number)=>end?-length-r*Math.sin(t):r*Math.sin(t);
      quad(vertex(inner*Math.cos(a),along(inner,a)),vertex(radius*Math.cos(a),along(radius,a)),vertex(radius*Math.cos(b),along(radius,b)),vertex(inner*Math.cos(b),along(inner,b)));
    }
    const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
  }
  function remove(id:string) {
    const entry=active.get(id);if(!entry)return;
    entry.root.removeFromParent();entry.ring.geometry.dispose();entry.fill.geometry.dispose();entry.wave.geometry.dispose();
    for(const material of new Set([entry.ring.material,entry.fill.material,entry.orb.material,entry.wave.material,entry.chips.material as THREE.Material]))material.dispose();
    entry.chips.dispose();entry.arcs.dispose();entry.trail.dispose();entry.detail?.dispose();entry.arrows?.dispose();active.delete(id);
  }
  function update(enemies:readonly Enemy[],now:number) {
    if(disposed)return;
    for(const entry of active.values())entry.seen=false;
    // Boss tells keep priority in a crowd. ponytail: cap simultaneous cosmetic attacks at64; instance all tells if encounters grow beyond that.
    for(const boss of [true,false])for(const enemy of enemies) {
      const attack=enemy.attack;
      if(!!enemy.worldBoss!==boss||!enemy.alive||!attack||![now,attack.startedAt,attack.impactAt,attack.endsAt,attack.x,attack.z,attack.radius].every(Number.isFinite)
        ||now<attack.startedAt||now>=attack.endsAt||attack.radius<=0||attack.radius>30||attack.impactAt<=attack.startedAt||attack.endsAt<=attack.impactAt
        ||attack.basic&&!attack.rangedAuto&&(now<attack.impactAt||now>=attack.impactAt+140))continue;
      const charge=attack.style==='charge',laneLength=charge?Math.hypot(attack.x-attack.fromX!,attack.z-attack.fromZ!):0;
      if(charge&&(attack.basic||![attack.fromX,attack.fromZ,attack.chargeAt,laneLength].every(Number.isFinite)||attack.chargeAt!<=attack.startedAt||attack.chargeAt!>=attack.impactAt||laneLength<.01||laneLength>64))continue;
      const laneX=charge?(attack.x-attack.fromX!)/laneLength:0,laneZ=charge?(attack.z-attack.fromZ!)/laneLength:0;
      let entry=active.get(attack.id);
      const theme=boss&&!attack.basic?bossThemes[enemy.kind]:undefined;
      if(!entry) {
        if(active.size>=64&&boss){const ordinary=[...active].find(([,entry])=>!entry.worldBoss);if(ordinary)remove(ordinary[0]);}
        if(active.size>=64)continue;
        const root=new THREE.Group();root.name=`monster-attack-${enemy.id}`;root.position.set(attack.x,0,attack.z);group.add(root);
        const color=(enemy.model&&attack.rangedAuto?INSTANT_COMBAT_RANGED_AUTO[enemy.model]?.color:undefined)??theme?.color??dungeonColors[enemy.kind]??(['frost-yeti','ice-wisp','crystal-bat'].includes(enemy.kind)?'#80dfff':enemy.kind==='void-stalker'||enemy.kind==='root-warden'?'#ba87ff'
          :enemy.kind==='ember-beetle'||enemy.kind==='stone-golem'?'#ff963d':attack.style==='spit'||attack.style==='sting'?'#b6e960':enemy.worldBoss?'#ff7951':'#ffd79b');
        const glow=(opacity:number)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
        const ring=new THREE.Mesh(charge?capsule(attack,!!enemy.instanceId,true):circle(waveTemplate.clone(),attack,!!enemy.instanceId),glow(.85));ring.name='impact-warning';
        const fill=new THREE.Mesh(charge?capsule(attack,!!enemy.instanceId,false):circle(new THREE.CircleGeometry(1,40),attack,!!enemy.instanceId),glow(.08));fill.name='impact-area';
        const material=glow(1);material.blending=THREE.AdditiveBlending;
        const orb=new THREE.Mesh(orbGeometry,material);orb.name='monster-projectile';
        const burst=new THREE.Mesh(burstGeometry,material);burst.name='pulse-burst';
        const wave=new THREE.Mesh(waveTemplate.clone(),glow(.8));wave.name='impact-shockwave';
        const arcs=new THREE.InstancedMesh(arcGeometry,material,3);arcs.name='melee-contact-arcs';arcs.frustumCulled=false;
        const chips=new THREE.InstancedMesh(theme?.chips??chipGeometry,glow(1),12);chips.name='impact-shards';chips.frustumCulled=false;
        const trail=new THREE.InstancedMesh(orbGeometry,charge?chips.material:material,7);trail.name=charge?'charge-dust-trail':'venom-projectile-trail';trail.frustumCulled=false;
        const arrows=charge?new THREE.InstancedMesh(arrowGeometry,ring.material,Math.min(6,Math.max(2,Math.floor(laneLength/3)))):null;
        if(arrows){arrows.name='charge-direction';arrows.frustumCulled=false;root.add(arrows);}
        const detail=theme?new THREE.InstancedMesh(theme.detail,theme.name==='storm-bolts'?material:chips.material,theme.count):null;
        if(detail){detail.name=theme!.name;detail.frustumCulled=false;root.add(detail);}
        const origin=new THREE.Vector3(enemy.x-attack.x,height(enemy.x,enemy.z,!!enemy.instanceId)+(modelHeight?.(enemy)??MONSTERS[enemy.kind].height)*.65,enemy.z-attack.z);
        const impact=new THREE.Vector3(0,height(attack.x,attack.z,!!enemy.instanceId)+.45,0);
        root.add(ring,fill,orb,wave,burst,arcs,trail,chips);entry={root,ring,fill,orb,wave,burst,arcs,trail,chips,detail,arrows,origin,impact,worldBoss:boss,seen:true};active.set(attack.id,entry);
      }
      entry.seen=true;
      const windup=Math.min(1,(now-attack.startedAt)/((charge?attack.chargeAt!:attack.impactAt)-attack.startedAt));
      const hit=now>=attack.impactAt,recovery=hit?Math.min(1,(now-attack.impactAt)/Math.max(1,(attack.basic?Math.min(attack.endsAt,attack.impactAt+140):attack.endsAt)-attack.impactAt)):0;
      const melee=!!attack.basic&&!attack.rangedAuto||['bite','swipe','sting'].includes(attack.style),spit=(!attack.basic||!!attack.rangedAuto)&&attack.style==='spit',pulse=!attack.basic&&attack.style==='pulse',slam=!attack.basic&&attack.style==='slam';
      // Dungeon hazard disks are drawn once by the dungeon world; ordinary special attacks keep their own tells.
      entry.ring.visible=entry.fill.visible=!attack.basic&&!attack.dungeonHazard&&!hit;
      entry.ring.material.opacity=.65+windup*.3;entry.fill.material.opacity=.06+windup*.13;
      entry.orb.visible=!hit&&(pulse||spit&&windup>=.5);entry.trail.visible=!hit&&(charge?now>=attack.chargeAt!:spit&&windup>=.5);
      entry.orb.material.opacity=hit?Math.pow(1-recovery,.7):.55+windup*.45;
      const flight=attack.rangedAuto&&attack.launchAt!==undefined?THREE.MathUtils.clamp((now-attack.launchAt)/(attack.impactAt-attack.launchAt),0,1):Math.max(0,(windup-.5)*2);
      if(entry.orb.visible){
        entry.orb.position.copy(entry.origin);
        if(spit){entry.orb.position.lerpVectors(entry.origin,entry.impact,flight);entry.orb.position.y+=Math.sin(flight*Math.PI)*.6;}
        entry.orb.scale.setScalar(pulse?.18+windup*Math.min(.72,attack.radius*.3):.12+Math.min(.25,attack.radius*.08));
      }
      if(entry.arrows){
        entry.arrows.visible=!hit;
        for(let i=0;i<entry.arrows.count;i++){const along=(i+.5)/entry.arrows.count*laneLength-laneLength,x=laneX*along,z=laneZ*along;
          pose.position.set(x,height(attack.x+x,attack.z+z,!!enemy.instanceId)+.13,z);pose.rotation.set(0,Math.atan2(laneX,laneZ),0);pose.scale.setScalar(Math.min(.7,attack.radius*.55));pose.updateMatrix();entry.arrows.setMatrixAt(i,pose.matrix);}
        entry.arrows.instanceMatrix.needsUpdate=true;
      }
      if(entry.trail.visible&&charge)for(let i=0;i<entry.trail.count;i++){
        const travelled=Math.max(0,Math.min(laneLength,(enemy.x-attack.fromX!)*laneX+(enemy.z-attack.fromZ!)*laneZ));
        const along=Math.max(0,travelled-(i+1)*.45)-laneLength,across=(i%2?1:-1)*attack.radius*.35,x=laneX*along+laneZ*across,z=laneZ*along-laneX*across;
        pose.position.set(x,height(attack.x+x,attack.z+z,!!enemy.instanceId)+.2+Math.sin(now*.012+i)*.12,z);pose.rotation.set(0,now*.004+i,0);pose.scale.setScalar(.1+(1-i/entry.trail.count)*.3);pose.updateMatrix();entry.trail.setMatrixAt(i,pose.matrix);
      }
      if(entry.trail.visible&&!charge)for(let i=0;i<entry.trail.count;i++){
        const t=Math.max(0,flight-(i+1)*.045),size=(1-i/entry.trail.count)*.16;
        pose.position.lerpVectors(entry.origin,entry.impact,t);pose.position.y+=Math.sin(t*Math.PI)*.6;
        pose.rotation.set(0,0,0);pose.scale.setScalar(size);pose.updateMatrix();entry.trail.setMatrixAt(i,pose.matrix);
      }
      if(entry.trail.visible)entry.trail.instanceMatrix.needsUpdate=true;
      entry.arcs.visible=hit&&melee;entry.wave.visible=hit&&slam;entry.burst.visible=hit&&(pulse||charge);entry.chips.visible=hit&&(!melee||!!theme);
      if(entry.arcs.visible){
        entry.arcs.count=attack.style==='sting'?1:attack.style==='bite'?2:3;
        const rotation=Number.isFinite(attack.rotation)?attack.rotation:Math.atan2(attack.x-enemy.x,attack.z-enemy.z),size=Math.min(attack.basic?.75:1.7,attack.radius)*(.85+recovery*.3);
        for(let i=0;i<entry.arcs.count;i++){
          pose.position.set(Math.cos(rotation)*(i-1)*.13,entry.impact.y+.25+i*.13,Math.sin(rotation)*(i-1)*.13);
          pose.rotation.set(-.5+i*.22,rotation-.65+recovery*1.3,attack.style==='bite'?(i?-.55:.55):-.35);
          pose.scale.set(size*(attack.style==='sting'?.35:1),1,size);pose.updateMatrix();entry.arcs.setMatrixAt(i,pose.matrix);
        }
        entry.arcs.instanceMatrix.needsUpdate=true;
      }
      if(entry.wave.visible){warpCircle(entry.wave.geometry,waveVertices,attack,!!enemy.instanceId,attack.radius*(.12+Math.sqrt(recovery)*1.12));entry.wave.material.opacity=(1-recovery)*.85;}
      if(entry.burst.visible){entry.burst.position.copy(entry.impact);entry.burst.position.y+=.3;entry.burst.scale.setScalar(attack.radius*(.15+Math.sqrt(recovery)*1.1));}
      if(entry.detail){
        entry.detail.visible=hit;
        // Special impact geometry fills the locked damage disk, including a pulse's center.
        if(hit)for(let i=0;i<entry.detail.count;i++){
          const lightning=theme?.name==='storm-bolts',index=lightning?Math.floor(i/3):i,count=lightning?entry.detail.count/3:entry.detail.count;
          const angle=index*2.399963,radius=attack.radius*Math.sqrt(index/(count-1))*.84;
          const along=(index/(count-1)-1)*laneLength,across=Math.sin(angle)*attack.radius*.55;
          const x=charge?laneX*along+laneZ*across:Math.cos(angle)*radius,z=charge?laneZ*along-laneX*across:Math.sin(angle)*radius,ground=height(attack.x+x,attack.z+z,!!enemy.instanceId)+.08;
          const size=Math.min(.7,attack.radius*.16)*(1+index%3*.22),rise=Math.min(1,.18+recovery*6)*(1-recovery*.65);
          if(lightning){
            const segment=i%3,top=Math.min(5,attack.radius)*(1-recovery*.5);
            for(const [point,t] of [[boltStart,segment],[boltEnd,segment+1]] as const){
              const jag=Math.sin(t*Math.PI/3)*(t%2?1:-1)*.45;
              point.set(x+Math.cos(angle)*jag,ground+top*(1-t/3),z+Math.sin(angle)*jag);
            }
            pose.position.copy(boltStart).add(boltEnd).multiplyScalar(.5);
            const length=boltEnd.sub(boltStart).length();pose.quaternion.setFromUnitVectors(up,boltEnd.normalize());pose.scale.set(.045*(1-recovery),length,.045*(1-recovery));
          }else{
            const magma=theme?.name==='magma-boulders',root=theme?.name==='briar-roots';
            pose.position.set(x,ground+(magma?size+Math.sin(recovery*Math.PI)*2.6:0),z);
            pose.rotation.set(magma?angle+recovery*5:root?.18:.08,angle,magma?recovery*4:root?-.28:.12);
            pose.scale.set(size*(magma?1-recovery:rise),size*(magma?(1-recovery)*.8:root?3.2*rise:4.5*rise),size*(magma?1-recovery:rise));
          }
          pose.updateMatrix();entry.detail.setMatrixAt(i,pose.matrix);
        }
        if(hit)entry.detail.instanceMatrix.needsUpdate=true;
      }
      if(entry.chips.visible)for(let i=0;i<entry.chips.count;i++) {
        const angle=i*2.399963,radius=attack.radius*(.12+recovery*(.7+i%3*.12)),size=(1-recovery)*(slam?.26+i%3*.075:spit?.13+i%3*.035:.12);
        const along=(i/(entry.chips.count-1)-1)*laneLength,across=Math.sin(angle)*attack.radius*.6;
        const x=charge?laneX*along+laneZ*across:Math.cos(angle)*radius,z=charge?laneZ*along-laneX*across:Math.sin(angle)*radius,ground=height(attack.x+x,attack.z+z,!!enemy.instanceId);
        pose.position.set(x,ground+.08+Math.sin(recovery*Math.PI)*(slam?Math.min(2.7,attack.radius)*(.5+i%3*.2):spit?.32:.85),z);
        pose.rotation.set(slam?angle+recovery*5:0,angle,slam?recovery*4:0);
        pose.scale.set(size,spit?Math.max(.02,size*.23):size*(slam?1.4:.7),size*(spit?1.8:1));pose.updateMatrix();entry.chips.setMatrixAt(i,pose.matrix);
      }
      if(entry.chips.visible){(entry.chips.material as THREE.MeshBasicMaterial).opacity=1-recovery;entry.chips.instanceMatrix.needsUpdate=true;}
    }
    for(const [id,entry] of active)if(!entry.seen)remove(id);
  }
  function clear(){for(const id of active.keys())remove(id);}
  return {update,clear,dispose(){if(disposed)return;disposed=true;clear();group.removeFromParent();for(const geometry of [orbGeometry,chipGeometry,arcGeometry,burstGeometry,waveTemplate,rootGeometry,iceGeometry,leafGeometry,rockGeometry,arrowGeometry])geometry.dispose();}};
}
