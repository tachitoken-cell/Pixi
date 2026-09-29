import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCharacterAssets, makeCharacter, animateCharacter } from './characters.ts';
import { DEFAULT_APPEARANCE } from './appearance.ts';
import { starterGear } from './progression.ts';
import { createMonsterModel, setTrainingDummyAssets, playMonsterHit, animateMonsterModel } from './monster-models.ts';
import { createCombatEffects, type CombatEffectEvent } from './combat-effects.ts';
import { loadSpellEffectAssets } from './spell-effect-details.ts';
import { SPELLS, type AbilityId } from './spells.ts';
import { combatTiming, shieldThrowHops } from './combat-timing.ts';
import { graphics } from './graphics-settings.ts';

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const select=$<HTMLSelectElement>('spell'),quality=$<HTMLSelectElement>('quality'),timeline=$<HTMLInputElement>('timeline'),pause=$<HTMLButtonElement>('pause');
const params=new URLSearchParams(location.search),classes=['Ranger','Knight','Mage','Cleric'] as const;
const spells=classes.flatMap(className=>Object.values(SPELLS).filter(spell=>spell.className===className).sort((a,b)=>a.requiredLevel-b.requiredLevel));
for(const className of classes){const group=document.createElement('optgroup');group.label=className;for(const spell of spells.filter(spell=>spell.className===className))group.append(new Option(spell.label,spell.id));select.append(group);}
select.value=spells.some(spell=>spell.id===params.get('spell'))?params.get('spell')!:'fireball';
if(['high','low','off'].includes(params.get('quality')??''))quality.value=params.get('quality')!;
graphics.effects=quality.value as typeof graphics.effects;
const scene=new THREE.Scene();scene.background=new THREE.Color('#1b2b24');scene.fog=new THREE.Fog('#1b2b24',40,95);
const renderer=new THREE.WebGLRenderer({canvas:$<HTMLCanvasElement>('preview'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const camera=new THREE.PerspectiveCamera(43,1,.1,130),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=4;controls.maxDistance=70;controls.maxPolarAngle=Math.PI*.47;
scene.add(new THREE.HemisphereLight('#dce8d3','#374536',2));const sun=new THREE.DirectionalLight('#fff0cf',2.7);sun.position.set(-9,16,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,far:65});sun.shadow.normalBias=.035;scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:'#334137',roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const stones=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.04,1),new THREE.MeshStandardMaterial({color:'#677065',roughness:1}),81),pose=new THREE.Object3D();
for(let i=0;i<81;i++){pose.position.set((i%9-4)*2,-.01,(Math.floor(i/9)-2)*2);pose.scale.set(1.94,1,1.94);pose.updateMatrix();stones.setMatrixAt(i,pose.matrix);}stones.receiveShadow=true;scene.add(stones);
let paused=params.has('time')||matchMedia('(prefers-reduced-motion: reduce)').matches,time=0,duration=3,previous=0;
function pauseLabel(){pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-pressed',String(paused));}
pauseLabel();
try{
  const [,,dummy]=await Promise.all([loadCharacterAssets(),loadSpellEffectAssets(),new GLTFLoader().loadAsync('/models/training-dummy.glb')]);
  setTrainingDummyAssets(dummy.scene,dummy.animations);
  const casters=new Map(classes.map(className=>{const mesh=makeCharacter({...DEFAULT_APPEARANCE,className},starterGear(className).equipment);scene.add(mesh);return [className,mesh] as const;}));
  const ally=makeCharacter({...DEFAULT_APPEARANCE,className:'Knight'},starterGear('Knight').equipment);scene.add(ally);
  const targets=Array.from({length:7},()=>{const mesh=createMonsterModel('training-dummy')!;scene.add(mesh);return mesh;});
  let spell=SPELLS[select.value as AbilityId],caster=casters.get(spell.className)!,event:CombatEffectEvent,releaseTimes:number[]=[],released=0,lastRelease=0,hits:{time:number;index:number}[]=[],hitIndex=0;
  const effects=createCombatEffects(scene,id=>{
    const mesh=id==='caster'?caster:id==='ally'?ally:targets[Number(id.replace('target-',''))];
    return mesh?{x:mesh.position.x,y:mesh.position.y+1.2,z:mesh.position.z}:undefined;
  },()=>0,(_id,_ability,out)=>{
    const rig=caster.userData.rig;
    if(rig.bow){out.set(0,0,-.31-.38+.42);rig.bow.pivot.localToWorld(out);return true;}
    if(spell.className!=='Mage'&&spell.className!=='Cleric')return false;
    rig.leftHand.getWorldPosition(out);return true;
  });
  function animate(at:number){
    while(released<releaseTimes.length&&releaseTimes[released]<=at){lastRelease=releaseTimes[released++];effects.play(event,lastRelease);}
    const age=at-lastRelease,windup=combatTiming(spell.id,0).delay,recovery=Math.max(spell.id==='volley'?.9:.7,windup/(spell.id==='power-shot'?.26:.30)),release=spell.className==='Ranger'?.26:.30;
    const progress=spell.visual==='radial'||spell.effect!=='damage'?age/recovery:age<=windup&&windup>0?age/windup*release:release+(age-windup)/(recovery-windup)*(1-release);
    animateCharacter(caster,at,false,!event.effectPhase&&released>0&&age<recovery?{ability:spell.id,progress}:false);caster.updateMatrixWorld(true);
    while(hitIndex<hits.length&&hits[hitIndex].time<=at){const hit=hits[hitIndex++];playMonsterHit(targets[hit.index],hit.time);}
    for(const target of targets)if(target.visible)animateMonsterModel(target,at,false);
    if(ally.visible)animateCharacter(ally,at,false);effects.update(at);
  }
  function seek(at:number){effects.clear();released=hitIndex=0;lastRelease=0;time=0;for(const target of targets)playMonsterHit(target,-10);for(let step=0;step<at;step+=1/60)animate(step);time=at;animate(time);timeline.value=String(time);}
  function frameCamera(){
    const radial=spell.visual==='radial'&&spell.effect==='damage'&&!['shatter','venom-detonation'].includes(spell.id),radius=radial?Math.max(6,spell.range):8,scale=Math.max(1,1/camera.aspect*.8),focusZ=spell.targetRelation==='self'?0:radial?1:3.5;
    controls.target.set(0,spell.visual==='meteor'?3:1,focusZ);camera.position.set(radius*1.05*scale,radius*.95*scale+(spell.visual==='meteor'?4:0),focusZ+radius*1.55*scale);controls.update();
  }
  function choose(){
    spell=SPELLS[select.value as AbilityId];caster=casters.get(spell.className)!;for(const mesh of casters.values())mesh.visible=mesh===caster;
    const radial=spell.visual==='radial'&&spell.effect==='damage',distance=spell.targetRelation==='self'?0:Math.min(7,spell.range*.78),count=spell.effect==='damage'?(spell.targeting==='single'?1:Math.min(7,spell.maxTargets??5)):0;
    targets.forEach((target,i)=>{target.visible=i<count;const angle=count===1?0:radial?(i-(count-1)/2)*.65:(i-(count-1)/2)*.2;target.position.set(Math.sin(angle)*distance,0,Math.cos(angle)*distance);target.rotation.y=Math.PI;});
    ally.visible=spell.effect!=='damage'&&spell.targetRelation!=='self';ally.position.set(0,0,distance);ally.rotation.y=Math.PI;
    const accepted=spell.effect!=='damage'?[{id:spell.targetRelation==='self'?'caster':'ally',x:0,z:distance}]:targets.slice(0,count).map((target,index)=>({id:`target-${index}`,x:target.position.x,z:target.position.z}));
    event={ability:spell.id,playerId:'caster',from:{x:0,z:0},rotation:0,targets:spell.id==='arcane-volley'?Array.from({length:7},(_,i)=>accepted[i%accepted.length]):accepted};
    if(spell.id==='adamant-guardian'&&params.get('phase')==='impact')event.effectPhase='impact';
    releaseTimes=spell.channel?Array.from({length:Math.floor(spell.channel.durationMs/spell.channel.tickMs)},(_,i)=>i*spell.channel!.tickMs/1000):[0];
    const hops=['powerful-throw','ricochet-shot'].includes(spell.id)?shieldThrowHops(event.from,event.targets):undefined;
    hits=spell.effect==='damage'?releaseTimes.flatMap(at=>event.targets.map((target,index)=>{const timing=hops?.[index]??combatTiming(spell.id,Math.hypot(target.x,target.z),index);return {time:at+timing.delay+timing.flight,index:Number(target.id.replace('target-',''))};})).sort((a,b)=>a.time-b.time):[];
    duration=Math.max(3,releaseTimes.at(-1)!+2,(hits.at(-1)?.time??0)+(spell.school==='poison'&&spell.id!=='venom-detonation'?2.6:spell.visual==='meteor'?.8:.42)+.3);timeline.max=String(duration);$('calling').textContent=`${spell.className.toUpperCase()} · ${spell.school.toUpperCase()} · ${spells.indexOf(spell)+1} / ${spells.length}`;$('name').textContent=spell.label;$('description').textContent=spell.description;document.body.dataset.spell=spell.id;document.body.dataset.quality=graphics.effects;
    frameCamera();seek(0);
  }
  select.onchange=choose;for(const [id,step] of [['previous',-1],['next',1]] as const)$(id).onclick=()=>{select.selectedIndex=(select.selectedIndex+step+select.options.length)%select.options.length;choose();};
  quality.onchange=()=>{graphics.effects=quality.value as typeof graphics.effects;document.body.dataset.quality=graphics.effects;effects.update(time);};
  pause.onclick=()=>{paused=!paused;pauseLabel();};$('replay').onclick=()=>{seek(0);paused=false;pauseLabel();};timeline.oninput=()=>{paused=true;pauseLabel();seek(Number(timeline.value));};
  function resize(){const viewport=$('viewport');renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();frameCamera();}
  addEventListener('resize',resize);choose();resize();if(params.has('time')){const at=Number(params.get('time'));if(Number.isFinite(at))seek(THREE.MathUtils.clamp(at,0,duration));}
  for(const id of ['spell','previous','next','replay','pause','timeline'])($(id) as HTMLInputElement).disabled=false;
  document.body.dataset.ready='true';
  renderer.setAnimationLoop(now=>{
    const dt=previous?Math.min(.05,(now-previous)/1000):0;previous=now;if(!paused){time+=dt;if(time>=duration)seek(time%duration);else animate(time);timeline.value=String(time);}
    controls.update();renderer.render(scene,camera);$('clock').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)} s`;
    $('status').textContent=`${paused?'Paused':'Playing'} · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString('en-US')} triangles`;
    document.body.dataset.time=time.toFixed(3);document.body.dataset.drawCalls=String(renderer.info.render.calls);document.body.dataset.triangles=String(renderer.info.render.triangles);
  });
  addEventListener('pagehide',()=>{effects.clear();},{once:true});
}catch(error){document.body.dataset.error=error instanceof Error?error.message:String(error);$('status').textContent=`Preview could not load: ${document.body.dataset.error}`;console.error(error);}
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);controls.dispose();renderer.dispose();},{once:true});
