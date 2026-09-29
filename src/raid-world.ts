import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { APOSTLE_RAID, RAID_COLLIDERS, RAID_SUIT_ZONES, RAID_SUIT_GLYPHS, type RaidState, type RaidHazard } from './raid';
import { disposeWorldGroup, type WorldInstance } from './world';
import type { Player, Enemy } from './shared';
import { configureAuthoredMaterials } from './authored-materials';
import { graphics } from './graphics-settings';
import { createMonsterModel } from './monster-models';
import { createSoftGlowTexture } from './environment-lights';
import { RAID_APPROACH_MONSTERS } from './raid-approach';

let spellAnimations:THREE.AnimationClip[]=[];
const propNames=['raid-crystal','raid-shield','raid-column','raid-sun'] as const;
let raidProps:THREE.Group|undefined,sanctum:THREE.Object3D|undefined,spellAssets:THREE.Group|undefined,chamberAssets:THREE.Group|undefined,propsLoading:Promise<void>|undefined;
export function loadRaidWorldAssets(){return propsLoading??=Promise.all([new GLTFLoader().loadAsync('/models/raid-props.glb'),new GLTFLoader().loadAsync('/models/raid-sanctum.glb'),new GLTFLoader().loadAsync('/models/apostle-spells.glb'),new GLTFLoader().loadAsync('/models/raid-approach-rooms.glb')]).then(([{scene},environment,spells,chambers])=>{
 chamberAssets=chambers.scene;for(let i=0;i<7;i++)if(!chamberAssets.getObjectByName(`raid-chamber-${i}`))throw Error(`Missing raid chamber: ${i}`);
 spellAssets=spells.scene;spellAnimations=spells.animations;
 for(const name of propNames)if(!scene.getObjectByName(name))throw Error(`Missing raid prop: ${name}`);
 sanctum=environment.scene.getObjectByName('raid-sanctum');if(!sanctum)throw Error('Missing raid sanctum');
 for(const root of [scene,sanctum,chamberAssets])root.traverse(node=>{if(node instanceof THREE.Mesh)node.castShadow=node.receiveShadow=true;});raidProps=scene;
}).catch(error=>{propsLoading=undefined;throw error;});}
/** Exact room roots are reused by the renderer and authoritative collision bake. */
export function createRaidScenery(room: number): THREE.Object3D {
 const source=room===7?sanctum:chamberAssets?.getObjectByName(`raid-chamber-${room}`);
 if(!source)throw Error(`Raid scenery is not loaded: ${room}`);
 const group=source.clone(true);group.position.set(0,0,0);group.userData.collision='solid';return group;
}
function raidProp(name:typeof propNames[number]):THREE.Group {
 const source=raidProps?.getObjectByName(name);if(!source)throw Error(`Raid prop assets are not loaded: ${name}`);
 const group=new THREE.Group(),model=source.clone(true);model.position.set(0,0,0);model.quaternion.identity();group.name=name;group.add(model);return group;
}

/** The server owns timing and hit tests; this adapter only paints its tells. */
export function raidHazardGeometry(hazard:RaidHazard):THREE.BufferGeometry {
 if(hazard.shape==='line')return new THREE.PlaneGeometry(hazard.width??hazard.r,hazard.length??hazard.r*2).rotateX(-Math.PI/2).rotateY(hazard.rotation||0);
 const angle=hazard.shape==='cone'?hazard.angle??Math.PI/2:Math.PI*2,start=hazard.shape==='cone'?(hazard.rotation||0)-angle/2:0;
 const vertices:number[]=[],indices:number[]=[],inner=hazard.shape==='ring'?hazard.innerR??0:0;
 for(let i=0;i<=64;i++){const a=start+i/64*angle;vertices.push(Math.sin(a)*inner,0,Math.cos(a)*inner,Math.sin(a)*hazard.r,0,Math.cos(a)*hazard.r);if(i)indices.push(i*2-2,i*2-1,i*2+1,i*2-2,i*2+1,i*2);}
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
const clamp=THREE.MathUtils.clamp;
const glow=(color:string,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});
function retire(object:THREE.Object3D){
 object.removeFromParent();object.traverse(node=>{
  if(node instanceof THREE.Mesh||node instanceof THREE.Line||node instanceof THREE.Points||node instanceof THREE.Sprite){if(!(node instanceof THREE.Sprite)&&!node.userData.raidSharedGeometry)node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}
  if(node instanceof THREE.InstancedMesh)node.dispose();
 });
}
function groundRing(radius:number,color:string,width=.12){
 const ring=new THREE.Mesh(new THREE.RingGeometry(Math.max(0,radius-width),radius,64),glow(color));ring.rotation.x=-Math.PI/2;return ring;
}
export function raidSafeGap(hazards:readonly RaidHazard[]):RaidHazard|undefined {
 const hands=hazards.filter(h=>h.kind==='Four Hands of Judgment'&&h.shape==='cone');if(hands.length!==4)return;
 const turn=Math.PI*2,edges=hands.map(h=>({start:((h.rotation??0)-(h.angle??0)/2+turn*2)%turn,angle:h.angle??0})).sort((a,b)=>a.start-b.start);
 let gap=0,rotation=0;
 for(let i=0;i<edges.length;i++){const end=edges[i].start+edges[i].angle,next=edges[(i+1)%edges.length].start+(i===edges.length-1?turn:0),width=next-end;if(width>gap){gap=width;rotation=end+width/2;}}
 if(gap>.001)return {...hands[0],id:hands[0].id+'-safe',kind:'Safe path',label:'Safe path',rotation,angle:gap,r:Math.min(33,hands[0].r),safe:true};
}

/** Shared Blender buffers, with owned materials so overlapping casts fade independently. */
function spellModel(name:string){
 const source=spellAssets?.getObjectByName(`apostle-spell-${name}`);if(!source)throw Error(`Missing Apostle spell: ${name}`);
 const group=new THREE.Group(),attachment=new THREE.Group(),authored=source.clone(true),materials=new Map<THREE.Material,THREE.MeshStandardMaterial>();
 // The new source motifs use viewer-sized vertical rigs. Preserve the game's
 // established attachment units and floor orientation outside the native rig.
 const scale:Record<string,number>={palm:1.5,feather:.37,chain:.09,soul:.14};attachment.scale.setScalar(scale[name]??1);
 if(['palm','claws','feather','rune-ring'].includes(name))attachment.rotation.x=Math.PI/2;
 attachment.add(authored);group.add(attachment);
 group.traverse(node=>{if(node instanceof THREE.Mesh){node.userData.raidSharedGeometry=true;node.castShadow=false;node.receiveShadow=false;
  const own=(material:THREE.Material)=>{let value=materials.get(material);if(!value){value=material.clone() as THREE.MeshStandardMaterial;value.transparent=true;value.depthWrite=false;value.side=THREE.DoubleSide;materials.set(material,value);}return value;};
  node.material=Array.isArray(node.material)?node.material.map(own):own(node.material);
 }});
 configureAuthoredMaterials(group);
 const mixer=new THREE.AnimationMixer(authored),actions=new Map(spellAnimations.filter(clip=>clip.name.startsWith(`apostle-spell-${name}-`)).map(clip=>[clip.name.slice(`apostle-spell-${name}-`.length),mixer.clipAction(clip)]));
 let current:THREE.AnimationAction|undefined;
 return {group,materials:[...materials.values()],sample(age:number,remaining=Infinity){
  const stage=remaining<.5?'vanish':age<2/3?'spawn':'loop',action=actions.get(stage);if(!action)return;
  if(current!==action){current?.stop();current=action;action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();}
  const duration=action.getClip().duration,time=stage==='vanish'?duration*(1-Math.max(0,remaining)/.5):stage==='spawn'?Math.max(0,age):Math.max(0,age-2/3)%duration;
  mixer.setTime(Math.min(duration,time));
 }};
}
function spellInstances(name:string,capacity:number){
 const model=spellModel(name),parts:{mesh:THREE.InstancedMesh;local:THREE.Matrix4;original:THREE.Mesh}[]=[],meshes:THREE.Mesh[]=[];model.group.updateMatrixWorld(true);
 const inverse=model.group.matrixWorld.clone().invert(),matrix=new THREE.Matrix4();
 model.group.traverse(node=>{if(node instanceof THREE.Mesh)meshes.push(node);});
 for(const original of meshes){const local=inverse.clone().multiply(original.matrixWorld),mesh=new THREE.InstancedMesh(original.geometry,original.material,capacity);mesh.userData.raidSharedGeometry=true;mesh.frustumCulled=false;original.visible=false;model.group.add(mesh);parts.push({mesh,local,original});}
 return {...model,parts,sample(age:number,remaining=Infinity){model.sample(age,remaining);model.group.updateMatrixWorld(true);inverse.copy(model.group.matrixWorld).invert();for(const part of parts)part.local.multiplyMatrices(inverse,part.original.matrixWorld);},set(index:number,pose:THREE.Object3D){for(const part of parts)part.mesh.setMatrixAt(index,matrix.multiplyMatrices(pose.matrix,part.local));},finish(count:number){for(const {mesh}of parts){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}}};
}

function impactRing(h:RaidHazard){
 const angle=h.shape==='cone'?h.angle??Math.PI/2:Math.PI*2;
 return new THREE.RingGeometry(.965,1,64,1,h.shape==='cone'?(h.rotation??0)-angle/2-Math.PI/2:0,angle);
}

/** Fixed GPU buffers and analytical paths make pause, reconnect and rewind exact. */
function spellRadiance(hazard:RaidHazard,texture:THREE.Texture){
 const group=new THREE.Group();group.name='Void radiance';group.userData.raidVfx=true;
 const positions=new THREE.Float32BufferAttribute(new Float32Array(96*3),3).setUsage(THREE.DynamicDrawUsage),colors=new THREE.Float32BufferAttribute(new Float32Array(96*3),3).setUsage(THREE.DynamicDrawUsage);
 const tails=new THREE.Float32BufferAttribute(new Float32Array(96*6),3).setUsage(THREE.DynamicDrawUsage),tailColors=new THREE.Float32BufferAttribute(new Float32Array(96*6),3).setUsage(THREE.DynamicDrawUsage);
 const sparks=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',positions).setAttribute('color',colors),new THREE.PointsMaterial({map:texture,size:.85,vertexColors:true,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));sparks.name='Void sparks';
 const streaks=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',tails).setAttribute('color',tailColors),new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));streaks.name='Void streaks';
 const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color:'#b293ff',transparent:true,opacity:.2,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));halo.name='Void glow';
 const waves=new THREE.InstancedMesh(impactRing(hazard),new THREE.MeshBasicMaterial({color:'#bb98ff',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),3);waves.name='Void shockwaves';waves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 for(const object of [sparks,streaks,halo,waves]){object.frustumCulled=false;object.raycast=()=>{};group.add(object);}
 const violet=new THREE.Color('#af7cff'),cyan=new THREE.Color('#94efff'),color=new THREE.Color(),pose=new THREE.Object3D();
 return {group,update(h:RaidHazard,now:number,figure?:THREE.Object3D){
  const enabled=graphics.effects!=='off',count=enabled?(graphics.effects==='high'?96:32):0;
  group.visible=enabled;sparks.geometry.setDrawRange(0,count);streaks.geometry.setDrawRange(0,count*2);waves.count=0;halo.visible=enabled&&graphics.bloom&&h.shape!=='ring';
  if(!enabled)return;
  const t=(now-h.startedAt)/1000,charge=clamp((now-h.startedAt)/Math.max(1,h.impactAt-h.startedAt),0,1),hit=now>=h.impactAt,after=clamp((now-h.impactAt)/Math.max(1,h.endsAt-h.impactAt),0,1);
  const kind=h.sourceId?(h.shape==='cone'?'Black Claw':h.shape==='line'?'Shadow Wings':h.shape==='ring'?'Approach Ring':'Death Star'):h.kind,harvest=kind==='Soul Harvest',sun=kind==='Black Sun',clone=kind==='Death Clone',hand=kind==='Death Palm'||kind==='Four Hands of Judgment',persistent=harvest||sun||clone;
  const fade=hit&&!persistent?1-after:1,ox=figure?.position.x??0,oy=figure?.position.y??.7,oz=figure?.position.z??0;
  halo.position.set(ox,oy+.4,oz);halo.scale.setScalar(sun?5+charge*9:harvest?6:clone?7:hand?7:4+charge*2);halo.material.opacity=fade*(sun?.25:hand?.18:.28)*(1+Math.sin(t*3)*.12);
  for(let i=0;i<count;i++){
   const seed=(i*.61803398875)%1,a=i*2.399963,flow=(t*.8+seed)%1;
   let x=0,y=0,z=0,dx=0,dy=0,dz=0,brightness=1;
   if(kind==='Death Star'){
    if(hit){const r=(.2+after*.75)*h.r,angle=a+t*.5;x=Math.sin(angle)*r;y=.25+Math.sin(after*Math.PI)*(1+seed*2);z=Math.cos(angle)*r;dx=x*.18;dy=(.5-after)*.8;dz=z*.18;brightness=1-after;}
    else{const angle=a+t*2.6,r=.25+flow*.85;x=ox+Math.sin(angle)*r;y=oy+flow*4;z=oz+Math.cos(angle)*r;dx=Math.cos(angle)*.18;dy=-.9;dz=-Math.sin(angle)*.18;brightness=1-flow*.8;}
   }else if(kind==='Approach Ring'){
    const angle=a+t*.7,inner=h.innerR??0,radius=inner+.35+(h.r-inner-.7)*(hit?after:seed);x=Math.sin(angle)*radius;z=Math.cos(angle)*radius;y=.2+(hit?Math.sin(after*Math.PI)*2:flow*1.5);dx=Math.sin(angle)*Math.min(.25,radius-inner-.2);dz=Math.cos(angle)*Math.min(.25,radius-inner-.2);dy=.2;brightness=hit?1-after:Math.sin(flow*Math.PI)*charge;
   }else if(hand||kind==='Black Claw'){
    const scatter=(i*.754877666)%1,lift=(t*.8+i*.56984029)%1,cone=h.shape==='cone',angle=cone?(h.rotation??0)+(seed-.5)*Math.max(0,(h.angle??Math.PI/2)-.2):a+t*.3;
    const radius=hit?h.r*(.12+after*.72)*(.4+scatter*.6):cone?8+scatter*12:1+scatter*Math.max(0,h.r*.7-1);
    x=Math.sin(angle)*radius;z=Math.cos(angle)*radius;y=hit?.2+Math.sin(after*Math.PI)*(1+seed*2):.3+lift*(hand?oy+1:3);
    dx=hit?Math.sin(angle)*.65:0;dy=hit?(1-after)*.5:.6;dz=hit?Math.cos(angle)*.65:0;brightness=hit?1-after:Math.sin(lift*Math.PI)*(.4+charge*.6);
    if(kind==='Black Claw'&&!hit&&cone){x*=Math.min(1,h.r/24);z*=Math.min(1,h.r/24);}
   }else if(kind==='Shadow Wings'){
    const lane=i%3-1,length=h.length??64,width=h.width??7,travel=(t*(hit?1.5:.4)+seed)%1;
    x=lane*width*.28+Math.sin(a+t*5)*.22;y=.4+seed*.9;z=-length/2+.8+travel*(length-1.6);dx=Math.sin(t*3+a)*.05;dy=.06;dz=Math.min(1.3,z+length/2);brightness=.4+.6*Math.sin(travel*Math.PI);
   }else if(harvest){
    const angle=a+t*(hit?1.6:.5),radius=3+(1-flow)*(hit?24:10);x=Math.sin(angle)*radius;y=.4+Math.sin(flow*Math.PI)*3;z=Math.cos(angle)*radius;dx=-Math.sin(angle)*.8+Math.cos(angle)*.4;dy=.08;dz=-Math.cos(angle)*.8-Math.sin(angle)*.4;brightness=Math.sin(flow*Math.PI);
   }else if(sun){
    const quadrant=i%4,angle=quadrant*Math.PI/2,travel=(t*.35+seed)%1,spiral=a+t*4,radius=Math.sin(travel*Math.PI)*1.8;
    x=Math.sin(angle)*18*(1-travel)+ox*travel+Math.sin(spiral)*radius;y=1+travel*(oy-1);z=Math.cos(angle)*18*(1-travel)+oz*travel+Math.cos(spiral)*radius;
    dx=(ox-Math.sin(angle)*18)*.04;dy=.45;dz=(oz-Math.cos(angle)*18)*.04;brightness=.4+.6*travel;
   }else{
    const angle=a+t*.65,radius=2+Math.sin(seed*Math.PI)*2.5;x=Math.sin(angle)*radius;y=.25+flow*7;z=Math.cos(angle)*radius;dx=Math.cos(angle)*.25;dy=.45;dz=-Math.sin(angle)*.25;brightness=Math.sin(flow*Math.PI);
   }
   positions.setXYZ(i,x,y,z);tails.setXYZ(i*2,x,y,z);tails.setXYZ(i*2+1,x-dx,y-dy,z-dz);
   color.copy(violet).lerp(cyan,seed).multiplyScalar(Math.max(0,brightness)*fade*(hit?1.4:.9));colors.setXYZ(i,color.r,color.g,color.b);tailColors.setXYZ(i*2,color.r,color.g,color.b);tailColors.setXYZ(i*2+1,0,0,0);
  }
  positions.needsUpdate=colors.needsUpdate=tails.needsUpdate=tailColors.needsUpdate=true;
  // The sector mesh follows the real cone; no full circle crosses Four Hands' safe opening.
  if(h.shape!=='line'&&!sun&&!clone&&(hit||harvest)){
   waves.count=graphics.effects==='high'?3:1;
   for(let i=0;i<waves.count;i++){
    const progress=harvest?(t*.7+i/3)%1:clamp(after*1.4-i*.16,0,1),ringStart=((h.innerR??0)+.05)/.965,radius=harvest?3+(1-progress)*22:h.shape==='ring'?ringStart+(h.r-.05-ringStart)*progress:h.r*(.05+progress*.9);
    pose.position.set(0,.04+i*.025,0);pose.rotation.set(-Math.PI/2,0,0);pose.scale.setScalar(radius);pose.updateMatrix();waves.setMatrixAt(i,pose.matrix);
   }
   waves.instanceMatrix.needsUpdate=true;waves.material.opacity=harvest?.22:.55*(1-after);
  }
 }};
}

/** Benji's creature casts reuse the detailed Blender motifs, with shape-correct motion. */
function approachSpellFigure(hazard:RaidHazard,texture:THREE.Texture){
 const group=new THREE.Group();group.name=`Spell · ${hazard.kind}`;group.userData.raidSpell=hazard.kind;
 const basic=hazard.kind.endsWith(' Strike'),definition=RAID_APPROACH_MONSTERS.find(monster=>monster.ability===hazard.kind);
 const archetype=definition?.archetype??(hazard.shape==='cone'?'cleave':hazard.shape==='line'?'line':hazard.shape==='ring'?'ring':'burst');
 const motif=archetype==='cleave'?'claws':archetype==='line'?'feather':archetype==='volley'?'star':archetype==='leap'?'rift':'soul';
 const detail=spellInstances(motif,basic?1:archetype==='line'?12:archetype==='ring'?16:6);group.add(detail.group);
 const rune=spellModel('rune-ring');group.add(rune.group);rune.group.position.y=.04;
 const radiance=basic?undefined:spellRadiance(hazard,texture);if(radiance)group.add(radiance.group);
 const pose=new THREE.Object3D(),emission=[...detail.materials,...rune.materials].map(material=>({material,base:material.emissiveIntensity}));
 const inner=hazard.shape==='ring'?groundRing(hazard.innerR??0,'#a8fff2',.12):undefined;if(inner){inner.position.y=.03;group.add(inner);}
 return {group,update(h:RaidHazard,now:number){
  detail.sample((now-h.startedAt)/1000,(h.endsAt-now)/1000);rune.sample((now-h.startedAt)/1000,(h.endsAt-now)/1000);
  const charge=clamp((now-h.startedAt)/Math.max(1,h.impactAt-h.startedAt),0,1),hit=now>=h.impactAt,after=clamp((now-h.impactAt)/Math.max(1,h.endsAt-h.impactAt),0,1),t=(now-h.startedAt)/1000,fade=hit?1-after:.25+charge*.75;
  const budget=detail.parts[0].mesh.instanceMatrix.count,count=basic?1:graphics.effects==='off'?Math.min(3,budget):graphics.effects==='low'?Math.min(6,budget):budget;
  group.userData.stage=hit?'impact':'windup';group.userData.progress=charge;group.rotation.y=h.shape==='line'?h.rotation??0:0;
  rune.group.visible=!basic&&h.shape!=='ring';rune.group.scale.setScalar(h.shape==='line'?Math.min(1.6,(h.width??4)/2):Math.min(3,h.r*.5));rune.group.rotation.y=t*.35;
  for(const material of rune.materials)material.opacity=fade*.48;
  for(let i=0;i<count;i++){
   const seed=(i+.5)/count,angle=h.shape==='cone'?(h.rotation??0)+(seed-.5)*(h.angle??Math.PI/2)*.86:seed*Math.PI*2+t*.32;
   pose.position.set(0,.2,0);pose.rotation.set(0,0,0);pose.scale.setScalar(basic?.3:.8);
   if(archetype==='cleave'){
    const r=Math.min(h.r-(h.kind.startsWith('Morgrath')?3.5:1.8),h.r*(hit?.22+after*.65:.3+charge*.1));pose.position.set(Math.sin(angle)*r,.4+(hit?Math.sin(after*Math.PI):charge*1.2),Math.cos(angle)*r);pose.rotation.set(hit?-.3:charge*.4,angle,0);pose.scale.setScalar(basic?.3:h.kind.startsWith('Morgrath')?1.45:.72);
   }else if(archetype==='line'){
    const length=h.length??28,flow=(seed+(hit?after*.9:charge*.15))%1;pose.position.set((i%2?1:-1)*(h.width??4)*.32,.2+(hit?Math.sin(after*Math.PI)*2:charge*.8),-length/2+.3+flow*Math.max(0,length-3.8));pose.rotation.set(hit?-.8:-.15,0,(i%2?1:-1)*.4);pose.scale.set(.55,hit?1.1:.55+charge*.4,1.6);
   }else if(archetype==='ring'){
    const radius=(h.innerR??0)+.8+(h.r-(h.innerR??0)-1.6)*(hit?after:charge*.12);pose.position.set(Math.sin(angle)*radius,.25+(hit?Math.sin(after*Math.PI)*1.8:charge*.7),Math.cos(angle)*radius);pose.rotation.y=angle;pose.scale.setScalar(h.kind.startsWith('Morgrath')?1.05:.65);
   }else if(archetype==='volley'){
    const radius=hit?h.r*after*.8:.5+seed*.6;pose.position.set(Math.sin(angle)*radius,hit?.2+Math.sin(after*Math.PI):1+6*(1-charge**3)+seed,Math.cos(angle)*radius);pose.rotation.set(t*.4,angle,t*.7);pose.scale.setScalar(.28+charge*.28);
   }else{
    const radius=h.r*(hit?.2+after*.7:.4+seed*.35);pose.position.set(Math.sin(angle)*radius,hit?.15+Math.sin(after*Math.PI)*2.5:.1+charge*1.7,Math.cos(angle)*radius);pose.rotation.set(0,angle,archetype==='leap'?Math.PI/2:0);pose.scale.setScalar(archetype==='leap'?.38:.6);
   }
   pose.updateMatrix();detail.set(i,pose);
  }
  detail.finish(count);for(const material of detail.materials)material.opacity=fade*.9;
  for(const {material,base}of emission)material.emissiveIntensity=base*(graphics.bloom&&graphics.effects!=='off'?1+(hit?1-after:charge):1);
  if(inner)inner.material.opacity=.75+charge*.25;
  radiance?.update(h,now);
 },dispose(){retire(group);}};
}

/** Every authored detail follows the server clock; silhouettes survive Effects Off. */
function spellFigure(hazard:RaidHazard,texture:THREE.Texture){
 if(hazard.sourceId)return approachSpellFigure(hazard,texture);
 const group=new THREE.Group();group.name=`Spell · ${hazard.kind}`;group.userData.raidSpell=hazard.kind;
 const hand=hazard.kind==='Death Palm'||hazard.kind==='Four Hands of Judgment',kind=hazard.kind;
 const name=hand?'palm':kind==='Death Star'?'star':kind==='Black Claw'?'claws':kind==='Black Sun'?'eclipse':kind==='Soul Harvest'?'vortex':kind==='Death Clone'?'rift':undefined;
 const figure=!hazard.safe&&name?spellModel(name):undefined;
 if(figure){group.add(figure.group);if(hand)figure.group.name='Spectral hand';}
 const ring=!hazard.safe&&kind!=='Black Sun'&&kind!=='Death Clone'?spellModel('rune-ring'):undefined;
 if(ring){ring.group.position.y=.045;group.add(ring.group);}
 const particleName=kind==='Shadow Wings'?'feather':kind==='Soul Harvest'||kind==='Black Sun'?'soul':kind==='Death Star'?'feather':undefined;
 const particles=!hazard.safe&&particleName?spellInstances(particleName,kind==='Shadow Wings'?24:18):undefined;
 if(particles)group.add(particles.group);
 const pose=new THREE.Object3D(),burst=groundRing(kind==='Soul Harvest'?3:1,'#b89aff',.11);burst.position.y=.035;group.add(burst);
 if(hazard.shape==='cone'){burst.geometry.dispose();burst.geometry=impactRing(hazard);}
 const radiance=hazard.safe?undefined:spellRadiance(hazard,texture);if(radiance)group.add(radiance.group);
 const emission=[...(figure?.materials??[]),...(ring?.materials??[])].map(material=>({material,strength:material.emissiveIntensity}));
 return {group,update(h:RaidHazard,now:number){
  const age=(now-h.startedAt)/1000,remaining=(h.endsAt-now)/1000;figure?.sample(age,remaining);ring?.sample(age,remaining);particles?.sample(age,remaining);
  const charge=clamp((now-h.startedAt)/Math.max(1,h.impactAt-h.startedAt),0,1),after=clamp((now-h.impactAt)/Math.max(1,h.endsAt-h.impactAt),0,1),impact=now>=h.impactAt,t=(now-h.startedAt)*.001;
  group.userData.stage=impact?'impact':'windup';group.userData.progress=charge;
  group.rotation.y=h.shape==='line'?h.rotation??0:0;
  const persistent=kind==='Soul Harvest'||kind==='Black Sun'||kind==='Death Clone';
  if(figure)for(const material of figure.materials)material.opacity=impact?(persistent?.9:1-after):.7+charge*.25;
  if(ring){const radius=kind==='Soul Harvest'?3:kind==='Shadow Wings'?Math.min(2.5,(h.width??7)/2):Math.min(6,h.r*.8);ring.group.scale.setScalar(radius*(impact?1:.75+charge*.25));ring.group.rotation.y=(kind==='Black Claw'?h.rotation??0:t*.15);for(const material of ring.materials)material.opacity=impact?(persistent?.7:1-after)*.7:.2+charge*.5;}
  burst.visible=!h.safe&&h.shape!=='line'&&impact&&kind!=='Black Sun'&&kind!=='Death Clone';burst.scale.setScalar(kind==='Soul Harvest'?1:Math.max(.05,h.r*(.3+after*.7)));burst.material.opacity=kind==='Soul Harvest'?.9:.9*(1-after);
  if(figure){const model=figure.group;
   if(kind==='Death Star'){
    model.position.y=impact?.25:1.2+8*(1-charge**3);model.rotation.set(charge*.35,t*1.2,charge*.4);model.scale.setScalar(impact?1.3+after*1.8:.7+charge*.7);
    for(const child of model.children)if(child.name.includes('shards'))child.rotation.z=impact?after*1.8:-charge*.6;
   }else if(hand){
    const slam=clamp((charge-.65)/.35,0,1),hands=kind==='Four Hands of Judgment';
    model.position.set(hands?Math.sin(h.rotation??0)*15:0,impact?.28:8.6-8.2*slam**3,hands?Math.cos(h.rotation??0)*15:0);
    model.rotation.set(impact?0:(1-slam)*.8,h.rotation??0,0);model.scale.setScalar(hands?2.1:Math.min(2,h.r/3));
   }else if(kind==='Black Claw'){
    const cone=h.shape==='cone',reach=cone?h.r*.38:1.8;model.scale.setScalar((cone?reach/2:1)*(impact?1+after*.3:.5+charge*.5));
    model.position.set(cone?Math.sin(h.rotation??0)*reach:0,impact?.35:1.3+charge,cone?Math.cos(h.rotation??0)*reach:0);model.rotation.y=(h.rotation??0)+(impact?after*.7:-.5+charge*.5);
   }else if(kind==='Black Sun'){
    model.position.set(-h.x,11,-10-h.z);model.rotation.z=-t*.25;model.rotation.y=.35;model.scale.setScalar(1.2+charge*2.4);
   }else if(kind==='Soul Harvest'){
    model.rotation.y=-t*1.8;model.scale.set(1.8,impact?1.5:charge*1.3+.2,1.8);
   }else if(kind==='Death Clone'){
    model.position.y=3.2;model.rotation.y=t*.3;model.scale.setScalar(1.2+charge*.7);
   }
  }
  if(particles){
   const capacity=particles.parts[0].mesh.instanceMatrix.count,count=graphics.effects==='high'?capacity:graphics.effects==='low'?Math.min(12,capacity):6;
   for(let i=0;i<count;i++){
    const a=i/count*Math.PI*2;pose.rotation.set(0,0,0);
    if(kind==='Shadow Wings'){
     const row=Math.floor(i/3),travel=impact?after:charge*.35;pose.position.set((i%3-1)*(h.width??7)*.28,.8+Math.sin(i*.8+charge*3)*.4,-(h.length??64)/2+((row/Math.ceil(count/3)+travel)%1)*Math.max(0,(h.length??64)-4));pose.scale.set(.95,.95,1.9);pose.rotation.set(.1,0,.25*(i%3-1));
    }else if(kind==='Soul Harvest'){
     const pull=impact?(t*.65+i/count)%1:i/count,r=impact?3+(1-pull)*25:6+i/count*22;pose.position.set(Math.sin(a+t*.35)*r,.7+Math.sin(pull*Math.PI)*1.5,Math.cos(a+t*.35)*r);pose.scale.setScalar(.75+pull*.5);pose.rotation.y=a+t*.35+Math.PI;
    }else if(kind==='Black Sun'){
     const quadrant=i%4,flow=(t*.45+Math.floor(i/4)/Math.ceil(count/4))%1;pose.position.set(Math.sin(quadrant*Math.PI/2)*18*(1-flow),1+flow*10,Math.cos(quadrant*Math.PI/2)*18*(1-flow)-10*flow);pose.scale.setScalar(.55+charge*.3);pose.rotation.y=quadrant*Math.PI/2+Math.PI;
    }else{
     const r=impact?after*h.r:1.5+charge;pose.position.set(Math.sin(a)*r,impact?.3+Math.sin(after*Math.PI):1+8*(1-charge**3),Math.cos(a)*r);pose.scale.setScalar(impact?.4*(1-after):.3);pose.rotation.y=a+t;
    }
    pose.updateMatrix();particles.set(i,pose);
   }
   particles.finish(count);for(const material of particles.materials)material.opacity=impact?(persistent?.85:.9*(1-after)):.75;
  }
  const strength=graphics.effects==='off'||!graphics.bloom?1:1+(impact?(persistent?.5:2.5*(1-after)):charge*.9);
  for(const {material,strength:base}of emission)material.emissiveIntensity=base*strength;
  radiance?.update(h,now,figure?.group);
 },dispose(){retire(group);}};
}

export async function createRaidWorld(scene:THREE.Scene):Promise<WorldInstance>{
 await loadRaidWorldAssets();
 const {texture:effectTexture}=createSoftGlowTexture();
 const root=new THREE.Group();root.name='Apostle sanctum';root.userData.collision='effect';scene.add(root);
 const environmentMaterials=new Map<THREE.MeshStandardMaterial,THREE.MeshStandardMaterial>();
 const environments=Array.from({length:8},(_,i)=>createRaidScenery(i)).map(group=>{
  group.visible=false;
  group.traverse(node=>{if(node instanceof THREE.Mesh){const tint=(material:THREE.MeshStandardMaterial)=>{let own=environmentMaterials.get(material);if(!own){own=material.clone();environmentMaterials.set(material,own);}return own;};node.material=Array.isArray(node.material)?node.material.map(tint):tint(node.material);}});root.add(group);return group;
 });
 environments[7].visible=true;
 const routeGate=spellModel('portal-crown');routeGate.group.name='Chamber exit';routeGate.group.position.set(0,3.5,-27);routeGate.group.scale.setScalar(1.5);root.add(routeGate.group);
 const gateHalo=new THREE.Sprite(new THREE.SpriteMaterial({map:effectTexture,color:'#83ffdf',transparent:true,opacity:.35,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));gateHalo.name='Chamber exit glow';gateHalo.scale.set(9,12,1);gateHalo.position.set(0,3,-27);root.add(gateHalo);
 const gateChains=spellInstances('chain',16);gateChains.group.name='Sealed chamber gate';gateChains.group.position.set(0,3.2,-27);root.add(gateChains.group);
 const gatePose=new THREE.Object3D();for(let i=0;i<16;i++){const t=(i%8)/7;gatePose.position.set(-5+10*t,(i<8?1:-1)*(-2+4*t),0);gatePose.rotation.set(0,0,(i<8?1:-1)*.38);gatePose.scale.setScalar(1.7);gatePose.updateMatrix();gateChains.set(i,gatePose);}gateChains.finish(16);
 const sun=raidProp('raid-sun');sun.visible=false;root.add(sun);
 const birthPortal=spellModel('black-hole');birthPortal.group.name='Apostle emergence portal';birthPortal.group.position.set(0,.025,0);birthPortal.group.visible=false;root.add(birthPortal.group);
 const portal=spellModel('portal-crown');portal.group.position.set(0,5,0);portal.group.visible=false;root.add(portal.group);
 for(const material of portal.materials)material.userData.raidEmission=material.emissiveIntensity;
 const portalHalo=new THREE.Sprite(new THREE.SpriteMaterial({map:effectTexture,color:'#ac87ff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));portalHalo.name='Realm transition glow';portalHalo.userData.raidSharedGeometry=true;portalHalo.scale.set(4,4,1);portal.group.add(portalHalo);
 const suitRunes:ReturnType<typeof spellModel>[]=[];
 const suitCircles:ReturnType<typeof groundRing>[]=[];
 const tells=new THREE.Group(),suits=new THREE.Group(),chains=new THREE.Group(),seals=new THREE.Group();root.add(tells,suits,chains,seals);
 const views=new Map<string,{signature:string;mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;line:THREE.LineSegments<THREE.EdgesGeometry,THREE.LineBasicMaterial>;spell:ReturnType<typeof spellFigure>}>();
 const chainViews=new Map<string,ReturnType<typeof spellInstances>>();
 const sealViews:{ring:ReturnType<typeof groundRing>;fill:THREE.Mesh<THREE.CircleGeometry,THREE.MeshBasicMaterial>;rune:ReturnType<typeof spellModel>}[]=[];
 for(const zone of RAID_SUIT_ZONES){
  const rune=spellModel('rune-ring');rune.group.position.set(zone.x,.1,zone.z);rune.group.scale.setScalar(zone.r*.9);suits.add(rune.group);suitRunes.push(rune);
  for(const material of rune.materials)material.userData.raidEmission=material.emissiveIntensity;
  const ring=groundRing(zone.r,zone.suit==='heart'||zone.suit==='diamond'?'#9ff4ee':'#c9b6ff',.19);ring.position.set(zone.x,.13,zone.z);suits.add(ring);suitCircles.push(ring);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#e1d6ff';ctx.textAlign='center';ctx.shadowColor='#160e28';ctx.shadowBlur=7;ctx.font='bold 140px Georgia';ctx.fillText(RAID_SUIT_GLYPHS[zone.suit],128,160);ctx.font='bold 28px sans-serif';ctx.fillText(zone.suit.toUpperCase(),128,214);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const glyph=new THREE.Mesh(new THREE.PlaneGeometry(4.6,4.6),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,depthWrite:false}));glyph.rotation.x=-Math.PI/2;glyph.position.set(zone.x,.12,zone.z);glyph.name=zone.suit+' circle';suits.add(glyph);
 }
 let current:RaidState|null=null,serverNow=0,plane='',disposed=false;
 const pose=new THREE.Object3D(),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),energy=new THREE.Color();
 const removeView=(id:string)=>{const view=views.get(id)!;view.spell.dispose();retire(view.mesh);views.delete(id);};
 return {colliders:RAID_COLLIDERS,
  setRaidState(state:RaidState|null,now=Date.now(),players:readonly Player[]=[]){
   current=state;serverNow=now;
   const room=state?.approach?.roomIndex??7;root.userData.raidRoom=room;for(let i=0;i<environments.length;i++)environments[i].visible=i===room;
   const hasGate=!!state&&room<7;routeGate.group.visible=gateChains.group.visible=hasGate;gateHalo.visible=false;
   if(!state){for(const id of views.keys())removeView(id);for(const mesh of chainViews.values())retire(mesh.group);chainViews.clear();suits.visible=seals.visible=sun.visible=portal.group.visible=birthPortal.group.visible=false;return;}
   if(plane!==state.plane){plane=state.plane;for(const [source,material] of environmentMaterials){material.color.set(plane==='shadow'?'#888cae':'#ffffff');material.emissiveIntensity=source.emissiveIntensity*(plane==='shadow'?.75:1);}root.userData.plane=plane;}
   suits.visible=state.plane==='arena'&&state.phase==='suits';seals.visible=state.plane==='arena'&&state.phase==='death-realm';
   const blackSun=state.hazards.find(h=>h.kind==='Black Sun'&&h.plane===state.plane&&now>=h.startedAt&&h.endsAt>now);
   sun.visible=state.plane==='arena'&&state.phase==='incarnate'&&!blackSun;sun.position.set(0,11,-10);sun.scale.setScalar(blackSun?.25+clamp((now-blackSun.startedAt)/Math.max(1,blackSun.impactAt-blackSun.startedAt),0,1)*.55:.85);sun.rotation.y=now*.00012;
   const active=state.hazards.filter(h=>h.plane===state.plane&&now>=h.startedAt&&h.endsAt>now),safe=raidSafeGap(active);if(safe)active.push(safe);const ids=new Set(active.map(h=>h.id));
   for(const id of views.keys())if(!ids.has(id))removeView(id);
   for(const hazard of active){
    const signature=JSON.stringify([hazard.kind,hazard.shape,hazard.r,hazard.rotation,hazard.angle,hazard.width,hazard.length,hazard.innerR,hazard.safe]);
    let view=views.get(hazard.id);if(view&&view.signature!==signature){removeView(hazard.id);view=undefined;}
    if(!view){
     const mesh=new THREE.Mesh(raidHazardGeometry(hazard),new THREE.MeshBasicMaterial({color:'#174f55',transparent:true,opacity:.42,visible:!!hazard.safe,side:THREE.DoubleSide,depthWrite:false}));mesh.name=hazard.label;
     const line=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:hazard.safe?'#a8fff2':'#dec6ff',transparent:true,opacity:.95,depthWrite:false}));mesh.add(line);
     line.visible=hazard.kind!=='Black Sun'&&hazard.kind!=='Death Clone';
     const spell=spellFigure(hazard,effectTexture);mesh.add(spell.group);tells.add(mesh);view={signature,mesh,line,spell};views.set(hazard.id,view);
    }
    view.mesh.userData.hazard=hazard;view.mesh.position.set(hazard.x,.16,hazard.z);
   }
   const chainIds=new Set<string>();
   for(const chain of state.chains){
    const first=players.find(p=>p.id===chain.firstId),second=players.find(p=>p.id===chain.secondId);if(!first||!second||chain.endsAt<=now)continue;chainIds.add(chain.id);
    let chainModel=chainViews.get(chain.id);if(!chainModel){chainModel=spellInstances('chain',32);chainModel.parts[0].mesh.name='Soul chain';for(const material of chainModel.materials)material.userData.raidEmission=material.emissiveIntensity;for(const {mesh}of chainModel.parts)for(let i=0;i<32;i++)mesh.setColorAt(i,energy.setRGB(1,1,1));chainViews.set(chain.id,chainModel);chains.add(chainModel.group);}
    chainModel.sample((now-(chain.endsAt-9000))/1000,(chain.endsAt-now)/1000);
    direction.set(second.x-first.x,0,second.z-first.z);const distance=direction.length(),count=Math.min(32,Math.max(2,Math.ceil(distance/.42)));direction.normalize();
    const detail=graphics.effects==='off'?0:graphics.effects==='low'?.4:1,phase=serverNow*.0007%1;
    for(const material of chainModel.materials){material.color.set(distance>=chain.breakDistance*.85?'#b5fff5':'#ffffff');material.emissiveIntensity=material.userData.raidEmission*(1+(graphics.bloom?detail:0)*(.4+.6*Math.sin(serverNow*.005)**2));}
    for(let i=0;i<count;i++){const t=i/(count-1),d=Math.abs(t-phase),pulse=Math.max(0,1-Math.min(d,1-d)*7)*detail;energy.setRGB(1+pulse*.2,1+pulse*.8,1+pulse);for(const {mesh}of chainModel.parts)mesh.setColorAt(i,energy);pose.position.set(first.x+(second.x-first.x)*t,1.2+Math.sin(t*Math.PI)*.3,first.z+(second.z-first.z)*t);pose.scale.setScalar(1);pose.quaternion.setFromUnitVectors(up,direction);pose.rotateY(i%2*Math.PI/2);pose.updateMatrix();chainModel.set(i,pose);}chainModel.finish(count);for(const {mesh}of chainModel.parts)mesh.instanceColor!.needsUpdate=true;
   }
   for(const [id,mesh]of chainViews)if(!chainIds.has(id)){retire(mesh.group);chainViews.delete(id);}

   while(sealViews.length>state.seals.length){const view=sealViews.pop()!;retire(view.ring);retire(view.fill);retire(view.rune.group);}
   state.seals.forEach((seal,i)=>{
    let view=sealViews[i];if(!view){const ring=groundRing(seal.r,'#c9b6ff',.22),fill=new THREE.Mesh(new THREE.CircleGeometry(seal.r,48),glow('#9ee8ed',.22)),rune=spellModel('rune-ring');rune.group.name='Sacrifice seal runes';rune.group.scale.setScalar(seal.r*.85);for(const material of rune.materials)material.userData.raidEmission=material.emissiveIntensity;fill.rotation.x=-Math.PI/2;seals.add(ring,fill,rune.group);sealViews.push(view={ring,fill,rune});}
    view.ring.position.set(seal.x,.2,seal.z);view.fill.position.copy(view.ring.position);view.ring.material.color.set(seal.active?'#9fffee':seal.charge>0?'#eee1ff':'#c9b6ff');view.fill.geometry.setDrawRange(0,Math.floor(48*seal.charge/6)*3);
    view.rune.group.position.set(seal.x,.15,seal.z);
   });
  },
  update(){
   for(const {mesh,line,spell}of views.values()){const hazard=mesh.userData.hazard as RaidHazard;line.material.opacity=.6+clamp((serverNow-hazard.startedAt)/Math.max(1,hazard.impactAt-hazard.startedAt),0,1)*.35;spell.update(hazard,serverNow);}
   const birthAge=current?.bossSpawnedAt?(serverNow-current.bossSpawnedAt)/500:-1;birthPortal.group.visible=!!current&&current.plane==='arena'&&current.bossHp>0&&birthAge>=0&&birthAge<6;
   if(birthPortal.group.visible)birthPortal.sample(birthAge,175/30-birthAge);
   if(current?.phase==='incarnate')sun.scale.setScalar(.85+Math.sin(serverNow*.001)*.025);
   const detail=graphics.effects==='off'?0:graphics.effects==='low'?.4:1,radiance=graphics.bloom?detail:0;
   routeGate.sample(serverNow/1000);
   const open=!!current?.approach?.cleared;gateChains.group.visible=routeGate.group.visible&&!open;gateHalo.visible=routeGate.group.visible&&open&&radiance>0;gateHalo.material.opacity=(.22+Math.sin(serverNow*.002)*.05)*radiance;routeGate.group.rotation.z=open?serverNow*.00018:0;for(const material of routeGate.materials){material.opacity=open?.8:.32;material.color.set(open?'#a3ffe9':'#8b6bb8');}
   const transition=current?.phase==='incarnate'?serverNow-(current.enrageEndsAt-APOSTLE_RAID.enrageMs):current?.phase==='death-realm'?serverNow-(current.phaseEndsAt-APOSTLE_RAID.realmMs):-1;
   portal.group.visible=transition>=0&&transition<2400;
   portalHalo.visible=portal.group.visible&&radiance>0;
   if(portal.group.visible){portal.sample(transition/1000,(2400-transition)/1000);const progress=transition/2400,envelope=Math.sin(progress*Math.PI);portal.group.rotation.z=-progress*1.8;portal.group.scale.setScalar(2+progress*5);for(const material of portal.materials){material.opacity=envelope*(.4+detail*.45);material.emissiveIntensity=material.userData.raidEmission*(1+radiance*3*envelope);}portalHalo.material.opacity=envelope*.4*radiance;}
   const urgency=current?.phase==='suits'?clamp(1-(current.phaseEndsAt-serverNow)/3000,0,1):0,suitPulse=(.5+.5*Math.sin((serverNow-(current?.phaseEndsAt??serverNow))*.008))*urgency;
   for(let i=0;i<suitRunes.length;i++){const rune=suitRunes[i];rune.sample(serverNow/1000);rune.group.rotation.y=detail?serverNow*.0001:0;for(const material of rune.materials){material.opacity=.45+detail*(.1+suitPulse*.35);material.emissiveIntensity=material.userData.raidEmission*(1+radiance*suitPulse*2);}suitCircles[i].material.opacity=.9+detail*suitPulse*.1;}
   for(let i=0;i<sealViews.length;i++){const {ring,fill,rune}=sealViews[i],seal=current?.seals[i],charge=clamp((seal?.charge??0)/6,0,1),pulse=.5+.5*Math.sin(serverNow*.006+i*1.7);rune.sample(serverNow/1000);rune.group.visible=detail>0;rune.group.rotation.y=detail?serverNow*.00025*(i%2?1:-1):0;ring.material.opacity=.9+detail*charge*pulse*.1;fill.material.opacity=.16+charge*.1+radiance*charge*pulse*.12;for(const material of rune.materials){material.opacity=(.18+charge*.45)*(.7+detail*pulse*.3);material.emissiveIntensity=material.userData.raidEmission*(1+radiance*charge*(.5+pulse));}}

  },
  dispose(){
   if(disposed)return;disposed=true;
   for(const id of views.keys())removeView(id);for(const mesh of chainViews.values())retire(mesh.group);chainViews.clear();
   retire(birthPortal.group);retire(portal.group);for(const rune of suitRunes)retire(rune.group);for(const view of sealViews)retire(view.rune.group);
   retire(routeGate.group);retire(gateChains.group);retire(gateHalo);for(const environment of environments)environment.removeFromParent();sun.removeFromParent();environmentMaterials.forEach(material=>material.dispose());disposeWorldGroup(root);effectTexture.dispose();
  }
 };
}

export function makeRaidMechanicModel(enemy:Enemy):THREE.Group|undefined {
 if(enemy.raidVisual==='guardian'){
  const model=createMonsterModel('apostle-clone');if(!model)throw Error('Void Guardian assets are not loaded');
  model.name='Void Soul Guardian';model.scale.multiplyScalar(.62);
  for(const part of ['halo','stars','left-wing','right-wing','left-lower-arm','right-lower-arm']){const node=model.getObjectByName(`apostle-clone-${part}`);if(node)node.visible=false;}
  return model;
 }
 if(enemy.raidVisual!=='crystal'&&enemy.raidVisual!=='shield')return;
 return raidProp(enemy.raidVisual==='crystal'?'raid-crystal':'raid-shield');
}
