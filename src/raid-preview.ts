import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterAssets, setMonsterAssets, makeCharacter, animateCharacter, makeEnemy, animateEnemy } from './characters';
import { loadRaidAssets, makeDeathApostlePet, animateDeathApostlePet } from './raid-model';
import { createRaidWorld, makeRaidMechanicModel } from './raid-world';
import { raidCastCue } from './raid-visuals';
import { mountRaidHUD, renderRaidPanel, revealRaidRewards } from './raid-ui';
import { RAID_SUIT_GLYPHS, type RaidState } from './raid';
import { newRaidProgress, RAID_COSMETICS } from './raid-progression';
import type { Enemy, Player } from './shared';
import type { WorldInstance } from './world';
import { createDayNightCycle } from './day-night';
import { graphics } from './graphics-settings';

interface PreviewState {
  type:'previewState'; now:number; raid:RaidState; self:Player; players:Player[]; enemies:Enemy[];
  mechanicId:string; paused:boolean; practice:boolean; events:string[];
  mechanics:{id:string;label:string;hint:string}[];
}
type Actor = {model:THREE.Group;key:string;label:HTMLElement;height:number;moving:boolean;position:THREE.Vector3;data:Player|Enemy;enemy:boolean};
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const stage=$('preview-stage'),canvas=$<HTMLCanvasElement>('arena'),mechanic=$<HTMLSelectElement>('mechanic');
const panel=$<HTMLDialogElement>('panel'),content=$('panel-content'),labels=$('nameplates');
const scene=new THREE.Scene();scene.background=new THREE.Color('#090616');scene.fog=new THREE.Fog('#090616',100,180);
const camera=new THREE.PerspectiveCamera(44,1,.1,220);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
const hemisphere=new THREE.HemisphereLight('#d6c5ff','#393050',2);scene.add(hemisphere);
const sun=new THREE.DirectionalLight('#d6c5ff',2.5);sun.position.set(15,45,25);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=sun.shadow.camera.bottom=-42;sun.shadow.camera.right=sun.shadow.camera.top=42;sun.shadow.camera.far=110;sun.shadow.bias=-.001;scene.add(sun);
const previewOptions=new URLSearchParams(location.search),effects=previewOptions.get('effects');if(effects==='off'||effects==='low'||effects==='high')graphics.effects=effects;
const gameLighting=previewOptions.get('lighting')==='game'?createDayNightCycle(scene,hemisphere,sun):undefined;
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.minDistance=5;controls.maxDistance=130;controls.maxPolarAngle=Math.PI*.48;controls.target.set(0,0,0);
const actors=new Map<string,Actor>(),actorRoot=new THREE.Group(),galleryRoot=new THREE.Group();scene.add(actorRoot,galleryRoot);galleryRoot.visible=false;
const selectedRing=new THREE.Mesh(new THREE.RingGeometry(1.32,1.48,4),new THREE.MeshBasicMaterial({color:'#f4cb72',side:THREE.DoubleSide,depthWrite:false}));selectedRing.rotation.set(-Math.PI/2,0,Math.PI/4);selectedRing.visible=false;scene.add(selectedRing);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),hitPoint=new THREE.Vector3();
let latest:PreviewState|undefined,arrival=0,world:WorldInstance|undefined,worldRoot:THREE.Object3D|undefined,assetsReady=false,selectedId='',lastMechanic='',gallery=false,petStage=0,galleryPet:THREE.Group|undefined,galleryAvatar:THREE.Group|undefined,attackAt=0;
let socket:WebSocket|undefined,frameAt=performance.now(),lastMoveAt=0,lastEvents='',lastOptions='';
const keys=new Set<string>();
const elapsed=(duration:number)=>`${Math.floor(duration/60000).toString().padStart(2,'0')}:${Math.floor(duration/1000%60).toString().padStart(2,'0')}`;
const send=(message:object)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));};
const previewNow=()=>latest?latest.now+(latest.paused?0:Math.min(250,performance.now()-arrival)):0;
const displayRaid=(raid:RaidState):RaidState=>raid.result?{...raid,objective:'Death defied · Preview reward reveal'}:raid;
const hud=mountRaidHUD(stage,()=>inspect(),id=>{selectedId=id;focusActor(id);},message=>{if(message.type==='raidAdvance')send({type:'advance'});});
function overview(){controls.target.set(0,0,0);camera.position.set(38,52,63);if(stage.clientWidth/stage.clientHeight<1)camera.position.multiplyScalar(1.25);controls.update();}
function focusActor(id:string){const actor=actors.get(id);if(!actor)return;const height=new THREE.Box3().setFromObject(actor.model).getSize(new THREE.Vector3()).y;controls.target.copy(actor.model.position).add(new THREE.Vector3(0,actor.enemy?Math.max(2,height*.75):1,0));camera.position.copy(controls.target).add(new THREE.Vector3(11,12,18));controls.update();}
function resize(){const width=stage.clientWidth,height=stage.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);overview();

function removeActor(actor:Actor){actor.model.removeFromParent();actor.model.traverse(node=>{if(node instanceof THREE.InstancedMesh)node.dispose();});actor.label.remove();}
function syncActors(state:PreviewState){
  if(!assetsReady)return;
  const entries=new Map<string,{data:Player|Enemy;enemy:boolean}>();
  for(const player of [...state.players,state.self])entries.set(player.id,{data:player,enemy:false});
  for(const enemy of state.enemies)entries.set(enemy.id,{data:enemy,enemy:true});
  for(const [id,actor]of actors)if(!entries.has(id)){removeActor(actor);actors.delete(id);}
  for(const [id,{data,enemy}]of entries){
    const player=data as Player,foe=data as Enemy;
    const key=enemy?`${foe.model??foe.kind}:${foe.raidVisual}`:JSON.stringify([player.appearance,player.equipment,player.raidProgress?.equippedCosmetics]);
    let actor=actors.get(id);
    if(actor?.key!==key){if(actor)removeActor(actor);const model=enemy?makeRaidMechanicModel(foe)??makeEnemy(foe.model??foe.kind):makeCharacter(player.appearance,player.equipment,player.raidProgress);model.position.set(data.x,0,data.z);model.rotation.y=data.rotation;model.userData.previewId=id;actorRoot.add(model);
      const label=document.createElement('div');label.className='preview-nameplate';labels.append(label);const bounds=new THREE.Box3().setFromObject(model,true);actor={model,key,label,height:Math.max(2,bounds.max.y)+.6,moving:false,position:new THREE.Vector3(data.x,0,data.z),data,enemy};actors.set(id,actor);
    }
    actor.moving=actor.position.distanceToSquared(new THREE.Vector3(data.x,0,data.z))>.002;actor.position.set(data.x,0,data.z);actor.data=data;
    const member=state.raid.members.find(member=>member.id===id);
    const status=member?.suit?`${RAID_SUIT_GLYPHS[member.suit]} ${member.suit}`:member?.marks?`${member.marks}/5 Marks`:'';
    actor.label.textContent=enemy?`${foe.name}${foe.raidShielded?' · Shielded':''}`:id===state.self.id?`YOU${status?' · '+status:''}`:id===selectedId?`${data.name}${status?' · '+status:''}`:member?.suit?RAID_SUIT_GLYPHS[member.suit]:'';
    actor.label.dataset.kind=enemy?'enemy':id===state.self.id?'self':'ally';actor.label.dataset.fallen=String(data.hp<=0);
  }
}
function updateControls(state:PreviewState){
  const optionKey=JSON.stringify(state.mechanics);if(lastOptions!==optionKey){lastOptions=optionKey;mechanic.replaceChildren(...state.mechanics.map(entry=>new Option(entry.label,entry.id)));}
  mechanic.value=state.mechanicId;const index=state.mechanics.findIndex(entry=>entry.id===state.mechanicId);
  const route=state.raid.approach;
  const hint=route?.cleared&&route.roomIndex<7?'Chamber cleared. Heal and regroup, then move within eight meters of the north gate and choose Rally to continue.':state.mechanicId==='full-route'?state.raid.objective:state.raid.phase==='death-realm'?state.mechanics.find(entry=>entry.id===(state.raid.plane==='shadow'?'death-realm-shadow':'death-realm'))?.hint:state.mechanics[index]?.hint;
  $('step-count').textContent=`${index+1} / ${state.mechanics.length}`;$('instruction').textContent=hint??state.raid.objective;
  $('play').textContent=state.paused||state.raid.phase==='forming'?'▶ Play':'Ⅱ Pause';
  $<HTMLInputElement>('practice').checked=state.practice;
  $('mode').textContent=gallery?'Cosmetics inspection':`${state.paused?'Paused · Inspect, then Play':'Playing'}${state.practice?' · Practice protection':' · Death enabled'}`;
  $('self-health').textContent=`${Math.ceil(state.self.hp).toLocaleString()} / ${state.self.maxHp.toLocaleString()}`;$<HTMLProgressElement>('health').max=state.self.maxHp;$<HTMLProgressElement>('health').value=state.self.hp;
  const member=state.raid.members.find(member=>member.id===state.self.id);$('personal-status').textContent=`${route&&route.roomIndex<7?`Room ${route.roomIndex+1} / ${route.totalRooms} · ${route.remaining} ${route.remaining===1?'enemy':'enemies'}`:`Marks ${member?.marks??0} / 5`} · ${member?.suit?RAID_SUIT_GLYPHS[member.suit]+' '+member.suit:state.raid.plane==='shadow'?'Shadow Realm':'Arena'}${state.self.hp<=0?' · Fallen':''}`;
  $('camera-boss').textContent=route&&route.roomIndex<6?'Creature':'Boss';
  $('plane-controls').hidden=state.raid.phase!=='death-realm';document.querySelectorAll<HTMLButtonElement>('[data-plane]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.plane===state.raid.plane)));
  for(const id of ['mechanic','next','previous','play','restart','inspect','gallery','heal'])($<HTMLButtonElement>(id)).disabled=!assetsReady;
  $<HTMLButtonElement>('previous').disabled=index<=0;$<HTMLButtonElement>('next').disabled=index>=state.mechanics.length-1;
  $<HTMLButtonElement>('play').disabled=gallery||['completed','wiped'].includes(state.raid.phase);$<HTMLButtonElement>('heal').disabled=gallery;
  const events=JSON.stringify(state.events);if(events!==lastEvents){lastEvents=events;$('events').replaceChildren(...state.events.slice(-5).map(text=>{const item=document.createElement('li');item.textContent=text;return item;}));}
}
function selectMechanic(id:string){if(gallery)toggleGallery(false);panel.close();selectedId='';send({type:'select',id});}
function inspect(){if(!latest)return;$('panel-title').textContent=latest.raid.result?'Raid rewards':'Raid details';content.innerHTML=renderRaidPanel(displayRaid(latest.raid),[],latest.self,latest.players,previewNow());
  content.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.disabled=button.dataset.raidAction!=='advance';if(button.dataset.raidAction==='advance')button.onclick=()=>{send({type:'advance'});panel.close();};});
  if(latest.raid.result){const footer=content.querySelector('.dungeon-reward-footer p');if(footer)footer.textContent='Preview rewards only — no real progress is saved.';content.querySelectorAll('.dungeon-reward-status').forEach(status=>{if(status.textContent==='Saved to your collection')status.textContent='Preview reward · Not saved';});revealRaidRewards(content,latest.raid.result,latest.self.id);}
  if(!panel.open)panel.showModal();
}
function rebuildGallery(){if(!latest||!assetsReady)return;for(const child of [...galleryRoot.children]){child.removeFromParent();child.traverse(node=>{if(node instanceof THREE.InstancedMesh)node.dispose();});}
  const progress={...newRaidProgress(),cosmetics:[...RAID_COSMETICS],equippedCosmetics:[...RAID_COSMETICS]};
  galleryAvatar=makeCharacter(latest.self.appearance,{...latest.self.equipment,head:'death-horns'},progress);galleryAvatar.position.x=-1.7;galleryAvatar.rotation.y=.25;galleryRoot.add(galleryAvatar);
  galleryPet=makeDeathApostlePet(petStage);galleryPet.scale.multiplyScalar(2);galleryPet.position.set(1.7,0,0);galleryPet.rotation.y=-.25;galleryRoot.add(galleryPet);
}
function toggleGallery(enabled:boolean){gallery=enabled;keys.clear();galleryRoot.visible=enabled;actorRoot.visible=!enabled;if(worldRoot)worldRoot.visible=!enabled;labels.hidden=enabled;$('gallery-controls').hidden=!enabled;
  if(enabled){send({type:'pause',paused:true});rebuildGallery();controls.target.set(0,1.7,0);camera.position.set(5,5,11);controls.update();}else overview();if(latest)updateControls(latest);
}
function attack(){if(!latest||latest.paused||gallery||!latest.enemies.some(enemy=>enemy.id===selectedId&&enemy.alive))return;attackAt=performance.now();send({type:'attack',targetId:selectedId});}
$('play').onclick=()=>{if(latest)send({type:'pause',paused:latest.raid.phase==='forming'?false:!latest.paused});};
$('restart').onclick=()=>{panel.close();selectedId='';send({type:'restart'});};
mechanic.onchange=()=>selectMechanic(mechanic.value);
for(const [id,offset]of [['previous',-1],['next',1]] as const)$(id).onclick=()=>{if(!latest)return;const index=latest.mechanics.findIndex(entry=>entry.id===latest!.mechanicId),next=latest.mechanics[index+offset];if(next)selectMechanic(next.id);};
$<HTMLInputElement>('practice').onchange=event=>send({type:'practice',enabled:(event.target as HTMLInputElement).checked});
document.querySelectorAll<HTMLButtonElement>('[data-plane]').forEach(button=>button.onclick=()=>send({type:'plane',plane:button.dataset.plane}));
$('attack').onclick=attack;$('heal').onclick=()=>send({type:'heal'});$('inspect').onclick=inspect;$('gallery').onclick=()=>toggleGallery(!gallery);$('back-encounter').onclick=()=>toggleGallery(false);
$<HTMLSelectElement>('pet-stage').onchange=event=>{petStage=Number((event.target as HTMLSelectElement).value);rebuildGallery();};
$('close-panel').onclick=()=>panel.close();panel.addEventListener('click',event=>{if(event.target===panel){const rect=panel.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)panel.close();}});
$('camera-reset').onclick=overview;$('camera-hero').onclick=()=>latest&&focusActor(latest.self.id);$('camera-boss').onclick=()=>{const id=selectedId||latest?.raid.bossId||latest?.enemies[0]?.id;if(id)focusActor(id);};
let pointerStart:{x:number;y:number;button:number}|undefined;
canvas.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY,button:event.button};});
canvas.addEventListener('pointerup',event=>{if(!pointerStart||pointerStart.button!==0||Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>6||gallery||!latest)return;
  const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects([...actors.values()].filter(actor=>actor.enemy&&(actor.data as Enemy).alive).map(actor=>actor.model),true);
  if(hits.length){let node:THREE.Object3D|null=hits[0].object;while(node&&!node.userData.previewId)node=node.parent;if(node)selectedId=node.userData.previewId;}
  else if(raycaster.ray.intersectPlane(ground,hitPoint))send({type:'move',x:THREE.MathUtils.clamp(hitPoint.x,-33,33),z:THREE.MathUtils.clamp(hitPoint.z,-33,33)});
  canvas.focus();pointerStart=undefined;
});
window.addEventListener('keydown',event=>{if(panel.open||gallery||(event.target instanceof HTMLElement&&event.target.matches('input,select,textarea'))||(event.key===' '&&event.target instanceof HTMLButtonElement))return;const key=event.key.toLowerCase();if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright',' '].includes(key)){event.preventDefault();keys.add(key);}if(key===' '&&!event.repeat)attack();if(key==='h'&&!event.repeat)send({type:'heal'});});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());panel.addEventListener('close',()=>keys.clear());

function connect(){socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/raid-preview-ws`);
  socket.onopen=()=>{$('connection').textContent='Local controller connected';};
  socket.onmessage=event=>{const state=JSON.parse(event.data) as PreviewState;if(state.type!=='previewState')return;latest=state;arrival=performance.now();syncActors(state);updateControls(state);
    if(lastMechanic!==state.mechanicId){lastMechanic=state.mechanicId;if(state.mechanicId==='completion'&&assetsReady)inspect();}
  };
  socket.onclose=()=>{$('connection').textContent='Disconnected · Reconnecting…';document.body.dataset.ready='false';setTimeout(connect,1500);};
  socket.onerror=()=>{$('connection').textContent='Waiting for local preview server…';};
}
connect();
Promise.all([loadCharacterAssets(),loadRaidAssets(),new GLTFLoader().loadAsync('/models/monster-kit.glb').then(asset=>setMonsterAssets(asset.scene)),createRaidWorld(scene)]).then(([, , ,instance])=>{
  world=instance;worldRoot=scene.getObjectByName('Apostle sanctum');assetsReady=true;if(latest){syncActors(latest);updateControls(latest);if(latest.mechanicId==='completion')inspect();}
}).catch(error=>{$('loading').textContent=`Could not load the preview: ${error instanceof Error?error.message:String(error)}. Reload to retry.`;console.error(error);});

const projectPoint=new THREE.Vector3(),forward=new THREE.Vector3(),side=new THREE.Vector3(),direction=new THREE.Vector3();
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min(.05,(now-frameAt)/1000);frameAt=now;controls.update();
  if(latest&&assetsReady){
    const clock=previewNow();world?.setRaidState?.(latest.raid,clock,latest.players);world?.update(dt);
    gameLighting?.update(clock,'hollow',true,projectPoint.set(latest.self.x,0,latest.self.z),camera,true);
    hud.update(displayRaid(latest.raid),latest.self.id,clock,!gallery);$('elapsed').textContent=elapsed(latest.raid.startedAt?Math.max(0,clock-latest.raid.startedAt):0);
    for(const [id,actor]of actors){actor.model.position.lerp(actor.position,Math.min(1,dt*15));actor.model.rotation.y=actor.data.rotation;
      if(actor.enemy){const foe=actor.data as Enemy,attack=foe.attack,cue=raidCastCue(latest.raid,foe,clock);
        if(cue)actor.model.rotation.y=cue.rotation;
        actor.model.userData.raidCast=cue?{clip:cue.clip,progress:cue.progress,kind:cue.kind}:null;
        const text=`${foe.name}${cue?' · '+cue.kind+' '+(Math.max(0,cue.impactAt-clock)/1000).toFixed(1)+'s':foe.raidShielded?' · Shielded':''}`;if(actor.label.textContent!==text)actor.label.textContent=text;
        const pose=cue??(attack?{style:attack.style,progress:(clock-attack.startedAt)/Math.max(1,attack.endsAt-attack.startedAt),impactProgress:(attack.impactAt-attack.startedAt)/Math.max(1,attack.endsAt-attack.startedAt),basic:attack.basic}:undefined);
        animateEnemy(actor.model,clock/1000,actor.moving,pose,foe.alive?undefined:Math.min(1,(clock-(foe.diedAt??clock))/1200));
      }else animateCharacter(actor.model,clock/1000,actor.moving,id===latest.self.id&&now-attackAt<450,undefined,false,undefined,actor.data.hp>0?undefined:1);
      actor.label.hidden=gallery||!actor.label.textContent;projectPoint.copy(actor.model.position);projectPoint.y+=actor.height;projectPoint.project(camera);if(projectPoint.z<0||projectPoint.z>1||Math.abs(projectPoint.x)>1||Math.abs(projectPoint.y)>1)actor.label.hidden=true;
      actor.label.style.transform=`translate(-50%,-100%) translate(${(projectPoint.x*.5+.5)*stage.clientWidth}px,${(-projectPoint.y*.5+.5)*stage.clientHeight}px)`;actor.label.dataset.selected=String(id===selectedId);
    }
    const selected=latest.enemies.find(enemy=>enemy.id===selectedId&&enemy.alive),selectedActor=selected&&actors.get(selected.id);selectedRing.visible=!!selectedActor&&!gallery;if(selectedActor)selectedRing.position.copy(selectedActor.model.position).setY(.2);
    $<HTMLButtonElement>('attack').disabled=!selected||latest.paused||gallery||latest.self.hp<=0;
    $('target-status').textContent=selected?`${selected.name} · ${Math.ceil(selected.hp).toLocaleString()} HP · ${Math.hypot(selected.x-latest.self.x,selected.z-latest.self.z).toFixed(1)}m${Math.hypot(selected.x-latest.self.x,selected.z-latest.self.z)>13.5?' · Move closer':''}${latest.paused?' · Press Play to attack':''}`:'Click an enemy to select it.';
    if(!gallery&&!panel.open&&keys.size&&now-lastMoveAt>90){camera.getWorldDirection(forward);forward.y=0;forward.normalize();side.crossVectors(forward,camera.up).normalize();direction.set(0,0,0);if(keys.has('w')||keys.has('arrowup'))direction.add(forward);if(keys.has('s')||keys.has('arrowdown'))direction.sub(forward);if(keys.has('d')||keys.has('arrowright'))direction.add(side);if(keys.has('a')||keys.has('arrowleft'))direction.sub(side);if(direction.lengthSq()){direction.normalize().multiplyScalar(2);send({type:'move',x:THREE.MathUtils.clamp(latest.self.x+direction.x,-33,33),z:THREE.MathUtils.clamp(latest.self.z+direction.z,-33,33)});lastMoveAt=now;}}
    if(galleryAvatar)animateCharacter(galleryAvatar,now/1000,false);if(galleryPet)animateDeathApostlePet(galleryPet,now/1000,false);
    $('loading').hidden=true;document.body.dataset.ready='true';
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(frame);
Object.defineProperty(window,'__raidPreview',{value:Object.freeze({get state(){return latest?structuredClone(latest):null;},get selectedId(){return selectedId;},get gallery(){return gallery;},get actors(){return [...actors].map(([id,actor])=>({id,model:actor.key,position:actor.model.position.toArray(),cast:actor.model.userData.raidCast}));},get visuals(){const effects:object[]=[];worldRoot?.traverse(node=>{if(node.userData.raidSpell)effects.push({kind:node.userData.raidSpell,stage:node.userData.stage,progress:node.userData.progress,particles:(node.getObjectByName('Void sparks') as THREE.Points|undefined)?.geometry.drawRange.count??0,glow:node.getObjectByName('Void glow')?.visible??false});});return {effects,room:worldRoot?.userData.raidRoom,visibleRooms:worldRoot?.children.filter(node=>node.visible&&/^raid-chamber-\d$|^raid-sanctum$/.test(node.name)).map(node=>node.name),sanctum:!!worldRoot?.getObjectByName('raid-sanctum'),draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};}}),writable:false});
