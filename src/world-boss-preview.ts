import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD_BOSSES, WORLD_BOSS_GROUP_SIZE, MONSTERS, BASIC_ATTACK, CHARGE_ATTACK, basicAttackRange } from './bestiary';
import { createMonsterModel, animateMonsterModel, setMonsterAssets } from './monster-models';
import { createMonsterEffects } from './monster-effects';
import { setIdleAnimations } from './idle-animation';
import type { Enemy, EnemyAttack } from './shared';

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const select=$<HTMLSelectElement>('boss'),attackSelect=$<HTMLSelectElement>('attack'),slider=$<HTMLInputElement>('phase'),pause=$<HTMLButtonElement>('pause');
const scene=new THREE.Scene();scene.background=new THREE.Color('#18232b');
const camera=new THREE.PerspectiveCamera(42,1,.1,180),renderer=new THREE.WebGLRenderer({canvas:$<HTMLCanvasElement>('preview'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
scene.add(new THREE.HemisphereLight('#dceef6','#777354',2.4));
const sun=new THREE.DirectionalLight('#fff0cf',3.2);sun.position.set(-12,24,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-30,right:30,top:22,bottom:-22,far:75});scene.add(sun);
const rim=new THREE.DirectionalLight('#79b7e0',1.8);rim.position.set(12,10,-18);scene.add(rim);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(140,100),new THREE.MeshStandardMaterial({color:'#3d5055',roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=6;controls.maxDistance=160;controls.maxPolarAngle=Math.PI*.48;
const effects=createMonsterEffects(scene,()=>0);
let paused=false,phase=0,last=0,elapsed=0;
try {
  const [asset,idles]=await Promise.all(['monster-kit','idle-animations'].map(name=>new GLTFLoader().loadAsync(`/models/${name}.glb`)));setMonsterAssets(asset.scene,asset.animations);setIdleAnimations(idles.scene,idles.animations);
  const views=WORLD_BOSSES.map((boss,index)=>{
    const mesh=createMonsterModel(boss.kind)!;mesh.position.x=(index-1.5)*13;scene.add(mesh);
    select.add(new Option(`${boss.name} · Level ${MONSTERS[boss.kind].level}`,boss.id));return {boss,mesh,home:mesh.position.clone()};
  });
  function focus(){
    effects.clear();phase=0;
    const view=views.find(view=>view.boss.id===select.value),grid=!view&&camera.aspect<1.2,x=0;
    for(const [i,entry] of views.entries()){entry.mesh.visible=!view||entry===view;entry.mesh.position.set(view?0:grid?(i%2-.5)*13:(i-1.5)*13,0,grid?(Math.floor(i/2)-.5)*17:0);entry.home.copy(entry.mesh.position);}
    controls.target.set(x,view?MONSTERS[view.boss.kind].height*.4:2.6,0);
    camera.position.set(view?11:grid?15:0,view?9:grid?24:18,view?19:grid?52:Math.max(48,30/(Math.tan(Math.PI*42/360)*camera.aspect)));controls.update();
    $('stats').textContent=view?`Level ${MONSTERS[view.boss.kind].level} · ${MONSTERS[view.boss.kind].hp.toLocaleString()} health · ~${WORLD_BOSS_GROUP_SIZE} players`:'10 · Briarhorn / 20 · Rimefang / 30 · Stormhorn / 40 · Ashen Crown';
    $('description').textContent=view?view.boss.description:`Each encounter is balanced for about ${WORLD_BOSS_GROUP_SIZE} adventurers at the boss’s level, including healers.`;
    updateAbility();
  }
  function updateAbility(){
    phase=0;effects.clear();
    const boss=views.find(view=>view.boss.id===select.value)?.boss;
    const value=attackSelect.value;
    attackSelect.replaceChildren(new Option('Idle','idle'),new Option('Basic attack','basic'),...(boss?.attacks??WORLD_BOSSES[0].attacks).filter(attack=>attack.style!=='charge').map((attack,i)=>new Option(boss?attack.name:`Special ${i+1}`,String(i))),new Option(boss?.attacks.find(attack=>attack.style==='charge')?.name??'Charge','charge'));
    attackSelect.value=[...attackSelect.options].some(option=>option.value===value)?value:'0';
    $('ability').textContent=attackSelect.value==='charge'?(boss?.attacks.find(attack=>attack.style==='charge')?.description??'Sidestep the marked lane before the rush ends.'):boss&&/^\d$/.test(attackSelect.value)?boss.attacks[Number(attackSelect.value)%boss.attacks.length].description:attackSelect.value==='basic'?'A quick strike against the current target.':'Choose a special to inspect its warning, contact and recovery.';
    const charge=attackSelect.value==='charge';
    if(boss){controls.target.set(0,MONSTERS[boss.kind].height*.4,charge?6:0);camera.position.set(charge?18:11,charge?15:9,charge?30:19);}
    else {const grid=camera.aspect<1.2;controls.target.set(0,2.6,charge?6:0);camera.position.set(grid&&!charge?15:0,grid?charge?30:24:22,grid?charge?70:52:Math.max(58,30/(Math.tan(Math.PI*42/360)*camera.aspect)));}
    controls.update();
  }
  select.onchange=focus;attackSelect.onchange=updateAbility;
  pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Play animation':'Pause animation';pause.setAttribute('aria-pressed',String(paused));};
  slider.oninput=()=>{paused=true;phase=Number(slider.value)/1000;pause.textContent='Play animation';pause.setAttribute('aria-pressed','true');};
  function resize(){const width=$('viewport').clientWidth,height=$('viewport').clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  addEventListener('resize',resize);resize();focus();document.body.dataset.ready='true';
  renderer.setAnimationLoop(now=>{
    const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!paused){elapsed+=dt;phase=(phase+dt/4)%1;slider.value=String(Math.round(phase*1000));}
    const enemies:Enemy[]=[];let state='Idle';
    for(const {boss,mesh,home} of views){
      if(!mesh.visible)continue;mesh.position.copy(home);
      const stats=MONSTERS[boss.kind],basic=attackSelect.value==='basic',special=attackSelect.value==='charge'?boss.attacks.find(attack=>attack.style==='charge')!:boss.attacks[Number(attackSelect.value)%boss.attacks.length];
      let attack:EnemyAttack|null=null;
      if(attackSelect.value!=='idle'){
        const charge=!basic&&special.style==='charge',windup=basic?BASIC_ATTACK.impactMs:special.windupMs;
        const impact=windup+(charge?12/CHARGE_ATTACK.speed*1000:0),recovery=basic?BASIC_ATTACK.recoveryMs:charge?CHARGE_ATTACK.recoveryMs:stats.recoveryMs;
        const duration=impact+recovery,clock=phase*(duration+1000),self=!basic&&special.center==='self';
        attack={id:boss.id,style:basic?stats.attackStyle:special.style,name:basic?'Basic attack':special.name,basic,startedAt:0,impactAt:impact,endsAt:duration,
          x:home.x,z:home.z+(self?0:basic?2.5:charge?12:5),rotation:0,radius:basic?basicAttackRange(boss.kind):special.radius,targetId:'preview-target',
          ...(charge?{fromX:home.x,fromZ:home.z,chargeAt:windup}:{})};
        if(charge)mesh.position.z=home.z+12*THREE.MathUtils.clamp((clock-windup)/(impact-windup),0,1);
        animateMonsterModel(mesh,elapsed,false,clock<duration?{style:attack.style,basic,progress:clock/duration,impactProgress:impact/duration,chargeProgress:charge?windup/duration:undefined}:undefined);
        const enemy={...boss,x:mesh.position.x,z:mesh.position.z,level:stats.level,hp:stats.hp,maxHp:stats.hp,alive:true,instanceId:null,worldBoss:true,rotation:0,attack} as Enemy;
        // Each demonstration shares one normalized clock, while its effects retain exact attack timing.
        const scale=4000/(duration+1000);enemies.push({...enemy,attack:{...attack,impactAt:impact*scale,endsAt:duration*scale,...(charge?{chargeAt:windup*scale}:{})}});
        state=clock<windup?charge?'Warning · sidestep the charge lane':'Warning · move outside the marked circle':clock<impact?'Charging':clock<duration?'Impact and recovery':'Ready';
      }else animateMonsterModel(mesh,elapsed,false);
    }
    effects.update(enemies,phase*4000);$('status').textContent=state;controls.update();renderer.render(scene,camera);
  });
  addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);effects.dispose();controls.dispose();renderer.dispose();},{once:true});
}catch(error){$('status').textContent=`Preview could not load: ${error instanceof Error?error.message:String(error)}`;console.error(error);}
