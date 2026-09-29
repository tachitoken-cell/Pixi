import * as THREE from 'three';
import { createCombatEffects, type CombatEffectEvent } from './combat-effects.ts';
import { loadSpellEffectAssets } from './spell-effect-details.ts';
import { SPELLS, type Spell } from './spells.ts';
import { combatTiming, RADIAL_SWEEPS } from './combat-timing.ts';
import { graphics } from './graphics-settings.ts';

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const calling=$<HTMLSelectElement>('class'),phase=$<HTMLSelectElement>('phase'),slider=$<HTMLInputElement>('progress'),pause=$<HTMLButtonElement>('pause'),stage=$('stage');
const params=new URLSearchParams(location.search);
if(['Ranger','Knight','Mage','Cleric'].includes(params.get('class')??''))calling.value=params.get('class')!;
if(params.get('phase')==='impact')phase.value='impact';
const requestedProgress=Number(params.get('progress')??'.5'),requestedPage=Number(params.get('page')??'0');
let progress=Number.isFinite(requestedProgress)?THREE.MathUtils.clamp(requestedProgress,0,1):.5,page=Number.isFinite(requestedPage)?Math.max(0,Math.floor(requestedPage)):0;
let paused=params.has('progress')||matchMedia('(prefers-reduced-motion: reduce)').matches,last=0,ready=false;
graphics.effects='high';
const renderer=new THREE.WebGLRenderer({canvas:$<HTMLCanvasElement>('comparison'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.setScissorTest(true);renderer.info.autoReset=false;
const groundGeometry=new THREE.PlaneGeometry(100,100),groundMaterial=new THREE.MeshBasicMaterial({color:'#283d30'}),markerGeometry=new THREE.CapsuleGeometry(.25,.9,3,8),markerMaterial=new THREE.MeshBasicMaterial({color:'#b4c8ae',transparent:true,opacity:.18,depthWrite:false});
const tiles=Array.from({length:6},()=>{
  const cell=document.createElement('article');cell.className='cell';const link=document.createElement('a'),name=document.createElement('span'),caption=document.createElement('small'),clock=document.createElement('output');link.append(name,caption);cell.append(link,clock);$('cells').append(cell);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#22372b');scene.fog=new THREE.Fog('#22372b',35,70);
  const floor=new THREE.Mesh(groundGeometry,groundMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);
  const grid=new THREE.GridHelper(50,25,'#455946','#354a39');grid.position.y=.005;scene.add(grid);
  const camera=new THREE.PerspectiveCamera(40,1,.1,100),markers=Array.from({length:8},()=>{const marker=new THREE.Mesh(markerGeometry,markerMaterial);marker.position.y=.7;scene.add(marker);return marker;});
  const effects=createCombatEffects(scene,undefined,()=>0);
  return {cell,link,name,caption,clock,scene,camera,markers,effects,spell:undefined as Spell|undefined,event:undefined as CombatEffectEvent|undefined,distance:7,at:-1};
});
function pauseLabel(){pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-pressed',String(paused));}
function saveView(){const url=new URL(location.href);url.searchParams.set('class',calling.value);url.searchParams.set('page',String(page));url.searchParams.set('phase',phase.value);url.searchParams.set('progress',progress.toFixed(3));history.replaceState(null,'',url);}
function currentTime(tile:typeof tiles[number]){
  const spell=tile.spell!,p=Math.min(.99999,progress),timing=combatTiming(spell.id,tile.distance),instant=['shatter','venom-detonation'].includes(spell.id);
  if(spell.id==='adamant-guardian'&&phase.value==='impact')return .7*p;
  if(spell.effect!=='damage'||spell.visual==='radial'&&!instant){const sweep=RADIAL_SWEEPS[spell.id];return sweep.delay+sweep.duration*p;}
  const impactLife=spell.school==='poison'&&!instant?2.6:spell.visual==='meteor'?.8:.42;
  if(instant)return impactLife*p;
  return phase.value==='impact'?timing.delay+timing.flight+impactLife*p:timing.delay+timing.flight*p;
}
function sample(reset=false){
  if(!ready)return;
  for(const tile of tiles){if(!tile.spell||!tile.event)continue;tile.event.effectPhase=tile.spell.id==='adamant-guardian'&&phase.value==='impact'?'impact':undefined;const at=currentTime(tile);if(reset||at<tile.at||tile.at<0){tile.effects.clear();tile.effects.play(tile.event,0);}tile.effects.update(at);tile.at=at;tile.clock.textContent=`${at.toFixed(3)} s after release`;tile.cell.dataset.time=at.toFixed(3);tile.link.href=`/spell-preview.html?spell=${tile.spell.id}&time=${at.toFixed(5)}${tile.event.effectPhase?'&phase=impact':''}`;}
  slider.value=String(progress);$('percent').textContent=`${Math.round(progress*100)}%`;document.body.dataset.phase=phase.value;document.body.dataset.progress=progress.toFixed(3);
}
function frameCameras(){
  for(const tile of tiles){if(!tile.spell)continue;const {width,height}=tile.cell.getBoundingClientRect();if(!width||!height)continue;const spell=tile.spell,instant=['shatter','venom-detonation'].includes(spell.id),field=spell.visual==='radial'&&!instant,support=spell.effect!=='damage';
    tile.camera.aspect=width/height;tile.camera.updateProjectionMatrix();
    const meteor=spell.visual==='meteor'&&phase.value==='flight',radius=spell.id==='adamant-guardian'&&phase.value==='impact'?5.5:meteor?11.5:support?2.25:field?Math.max(3.6,spell.range):4.4,fit=Math.max(1,1/tile.camera.aspect),focusZ=support||field?0:tile.distance*.53;
    // Meteors begin 12 m above their target; leave room for their upward flame tails as well.
    tile.camera.position.set(radius*1.55*fit,radius*1.35*fit+(meteor?4:0),focusZ+radius*1.8*fit);tile.camera.lookAt(0,meteor?7.2:support?1:field?.4:1.2,focusZ);
  }
}
function populate(){
  if(!ready)return;const spells=Object.values(SPELLS).filter(spell=>spell.className===calling.value).sort((a,b)=>a.requiredLevel-b.requiredLevel),pages=Math.ceil(spells.length/6);page=Math.min(page,pages-1);
  tiles.forEach((tile,index)=>{
    tile.effects.clear();tile.at=-1;tile.spell=spells[page*6+index];tile.cell.hidden=!tile.spell;for(const marker of tile.markers)marker.visible=false;if(!tile.spell)return;
    const spell=tile.spell,support=spell.effect!=='damage',instant=['shatter','venom-detonation'].includes(spell.id),field=spell.visual==='radial'&&!instant;tile.distance=support?0:Math.min(7,spell.range*.75);
    const count=support||spell.targeting==='single'?1:Math.min(7,spell.maxTargets??3),targets=Array.from({length:count},(_,i)=>{const angle=count===1?0:(i-(count-1)/2)*(field?.55:.14);return {id:`target-${i}`,x:Math.sin(angle)*tile.distance,z:Math.cos(angle)*tile.distance};});
    targets.forEach((target,i)=>{tile.markers[i].visible=true;tile.markers[i].position.set(target.x,.7,target.z);});if(!support){tile.markers[7].visible=true;tile.markers[7].position.set(0,.7,0);}
    tile.event={ability:spell.id,from:{x:0,z:0},rotation:0,targets:spell.id==='arcane-volley'?Array.from({length:7},(_,i)=>targets[i%targets.length]):targets};tile.name.textContent=spell.label;tile.caption.textContent=`${spell.className} · ${spell.effect==='damage'?spell.school:spell.effect==='heal'?'healing':'shield'}`;tile.cell.dataset.spell=spell.id;
  });
  $('page').textContent=`${page+1} / ${pages} · ${spells.length} spells`;$<HTMLButtonElement>('previous').disabled=page===0;$<HTMLButtonElement>('next').disabled=page===pages-1;document.body.dataset.calling=calling.value;document.body.dataset.page=String(page);frameCameras();sample(true);saveView();
}
function resize(){renderer.setSize(stage.clientWidth,stage.clientHeight,false);frameCameras();}
calling.onchange=()=>{page=0;populate();};$('previous').onclick=()=>{page--;populate();};$('next').onclick=()=>{page++;populate();};phase.onchange=()=>{frameCameras();sample(true);saveView();};pause.onclick=()=>{paused=!paused;pauseLabel();saveView();};slider.oninput=()=>{paused=true;progress=Number(slider.value);pauseLabel();sample();saveView();};addEventListener('resize',resize);pauseLabel();resize();
try{
  await loadSpellEffectAssets();ready=true;populate();pause.disabled=false;document.body.dataset.ready='true';
  renderer.setAnimationLoop(now=>{
    const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!paused){progress=(progress+dt/2.5)%1;sample();}
    renderer.info.reset();renderer.setScissorTest(false);renderer.setClearColor('#17231d');renderer.clear();renderer.setScissorTest(true);const bounds=renderer.domElement.getBoundingClientRect();
    for(const tile of tiles){if(!tile.spell)continue;const rect=tile.cell.getBoundingClientRect(),x=rect.left-bounds.left,y=bounds.bottom-rect.bottom;renderer.setViewport(x,y,rect.width,rect.height);renderer.setScissor(x,y,rect.width,rect.height);renderer.render(tile.scene,tile.camera);}
    $('status').textContent=`${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString('en-US')} triangles`;document.body.dataset.drawCalls=String(renderer.info.render.calls);document.body.dataset.triangles=String(renderer.info.render.triangles);
  });
}catch(error){document.body.dataset.error=error instanceof Error?error.message:String(error);$('status').textContent=document.body.dataset.error;console.error(error);}
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);for(const tile of tiles){tile.effects.clear();const grid=tile.scene.children.find(node=>node instanceof THREE.GridHelper) as THREE.GridHelper;grid.geometry.dispose();for(const material of Array.isArray(grid.material)?grid.material:[grid.material])material.dispose();}groundGeometry.dispose();groundMaterial.dispose();markerGeometry.dispose();markerMaterial.dispose();renderer.dispose();},{once:true});
