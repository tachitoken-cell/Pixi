import './style.css';
import './art.css';
import './treasure.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeEnemy, animateEnemy } from './characters';
import { createVillager, animateVillager } from './village-models';
import { loadTreasureAssets, createTreasureEffects } from './treasure-visuals';
import { mountTreasureUI } from './treasure-ui';
import type { TreasureClaim, TreasureState } from './treasure-rewards';
import type { Enemy, Player } from './shared';

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const dialog=$<HTMLDialogElement>('merchant-dialog'), content=$('panel-content'), preset=$<HTMLSelectElement>('treasury-state');
const wallet='0x1111111111111111111111111111111111111111', contract='0x2222222222222222222222222222222222222222', player={id:'preview-character'} as Player;
preset.querySelector<HTMLOptionElement>('option[value="saved"]')!.textContent='Saved $6.25 MOSS payout';
function state():TreasureState {
  const saved=preset.value==='saved', paid=preset.value==='paid', processed=preset.value==='processed';
  // Display-only fixtures cannot pass claim validation and never enter wallet code.
  const claim={id:'preview-payout',characterId:player.id,wallet,contract,amount:'12500.0',amountWei:'12500000000000000000000',
    usdCents:625,price:{usdWei:'500000000000000',observedAt:Date.now()},status:paid?'paid':processed?'processed':'pending'} as TreasureClaim;
  return {configured:preset.value!=='empty',enabled:preset.value!=='empty',contract,balanceWei:preset.value==='empty'?'0':'100000000000000000000000',wallet,vouchers:saved||paid?0:1,
    claims:saved||paid||processed?[claim]:[],reason:'The treasury is awaiting funding. Your voucher stays in your bags.'};
}
const ui=mountTreasureUI({getPlayer:()=>player,active:()=>dialog.open,content:()=>content,nearby:()=>true,now:()=>Date.now(),
  show:()=>{if(!dialog.open)dialog.showModal();},send:message=>queueMicrotask(()=>{
    if(message.type==='treasureRedeem')preset.value='saved';
    if(message.type==='treasureCheck')preset.value='paid';
    ui.update(state(),message.type==='treasureRedeem'?'Simulated: your voucher became a fixed 12,500 MOSS payout, worth $6.25 at redemption.':undefined);
  })});
// Capture before the real panel's bubbling handler: no preview action can request a wallet.
content.addEventListener('click',event=>{
  const action=(event.target as Element).closest<HTMLElement>('[data-treasure]')?.dataset.treasure;
  if(action!=='collect'&&action!=='link')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action==='collect'){preset.value='paid';ui.update(state(),'Simulated: 12,500 MOSS paid. No transaction was sent.');}
  else ui.reject('Preview wallet is fixed. The real game lets you connect your own wallet.');
},true);
$('open-merchant').onclick=()=>ui.open();$('close-merchant').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>ui.reset());preset.onchange=()=>{if(dialog.open)ui.update(state());};

const scene=new THREE.Scene();scene.background=new THREE.Color('#607863');scene.fog=new THREE.Fog('#607863',24,65);
const camera=new THREE.PerspectiveCamera(38,1,.1,90);
const renderer=new THREE.WebGLRenderer({canvas:$<HTMLCanvasElement>('preview'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
scene.add(new THREE.HemisphereLight('#e2edce','#334531',2.0));
const sun=new THREE.DirectionalLight('#fff0ca',3);sun.position.set(-4,8,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,far:30});scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:'#596b43',roughness:1}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=5;controls.maxDistance=24;controls.maxPolarAngle=Math.PI*.48;
const slider=$<HTMLInputElement>('timeline'), speed=$<HTMLSelectElement>('speed'), pause=$<HTMLButtonElement>('pause');
let elapsed=0,last=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
function pauseLabel(){pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-pressed',String(paused));}
pause.onclick=()=>{paused=!paused;pauseLabel();};pauseLabel();
let serial=0, resetEffects=()=>{};
$('replay').onclick=()=>{resetEffects();elapsed=0;serial++;paused=false;pauseLabel();};
slider.oninput=()=>{resetEffects();elapsed=Number(slider.value);paused=true;serial++;pauseLabel();};
try {
  const asset=await loadTreasureAssets(), goblin=makeEnemy('treasure-goblin'), merchant=createVillager(asset.scene,'merchant','shadyMerchant');
  merchant.position.set(2.5,0,.2);merchant.rotation.y=-.20;scene.add(goblin,merchant);
  const effects=createTreasureEffects(scene);
  resetEffects=()=>effects.clear();
  function resize(){
    const width=$('viewport').clientWidth,height=$('viewport').clientHeight;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    controls.target.set(.1,1,0);camera.position.set(5,5.1,camera.aspect<1.2?17:12);controls.update();
  }
  addEventListener('resize',resize);resize();document.body.dataset.ready='true';
  renderer.setAnimationLoop(now=>{
    const dt=last?Math.min(100,now-last):0;last=now;
    if(!paused)elapsed=Math.min(31000,elapsed+dt*Number(speed.value));
    const t=elapsed/1000, running=t<28, alive=t<30, angle=t*.65;
    goblin.position.set(-2.3+(running?Math.sin(angle)*1.25:Math.sin(28*.65)*1.25),0,running?Math.cos(angle)*.6:Math.cos(28*.65)*.6);
    goblin.rotation.y=running?Math.atan2(Math.cos(angle)*1.25,-Math.sin(angle)*.6):0;
    goblin.visible=alive;goblin.scale.setScalar(t<29.6?1:Math.max(0,(30-t)/.4));
    animateEnemy(goblin,t,running);animateVillager(merchant,now/1000);
    const enemy={id:`preview-goblin-${serial}`,kind:'treasure-goblin',zone:'greenwood',instanceId:null,level:8,name:'Treasure Goblin',
      x:goblin.position.x,z:goblin.position.z,rotation:goblin.rotation.y,hp:100,maxHp:100,alive,worldBoss:false,attack:null,
      treasure:{spawnedAt:1,escapeAt:30000,portalAt:28000}} satisfies Enemy;
    effects.update(alive?[enemy]:[],elapsed,()=>0);
    $('status').textContent=t<28?`Fleeing · ${Math.ceil(30-t)} seconds to escape`:t<30?'The escape portal is opening…':'Escaped into the portal · Replay to chase again';
    $('elapsed').textContent=`${Math.min(30,t).toFixed(1)} / 30 seconds`;slider.value=String(elapsed);
    controls.update();renderer.render(scene,camera);
  });
  addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);controls.dispose();renderer.dispose();},{once:true});
}catch(error){$('status').textContent=`Preview could not load: ${error instanceof Error?error.message:String(error)}`;console.error(error);}
