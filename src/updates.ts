let started=false,ready=false,checking=false,reloading=false,pendingReload=false;
let registration:ServiceWorkerRegistration|undefined,watched:ServiceWorker|null=null,activating:ServiceWorker|null=null,controller:ServiceWorker|null=null;
let beforeReload:()=>boolean|void=()=>{},loader:HTMLDialogElement|undefined;
let shutdownAlert:HTMLElement|undefined;
export let shutdownWarningActive=false;
const safePage=()=>location.hostname!=='account.mossvale.world'&&location.pathname==='/'&&!/[?&#](?:code|state|session_state|error|iss)=/.test(location.search+location.hash);

function placeShutdownWarning(){
  if(!shutdownWarningActive||!shutdownAlert)return;
  const parent=document.activeElement?.closest('dialog:modal')||document.querySelector('dialog:modal')||document.body;
  if(shutdownAlert.parentElement!==parent){shutdownAlert.hidePopover();parent.append(shutdownAlert);}
  shutdownAlert.showPopover();
}
export function showShutdownWarning(secondsRemaining:number|null,held=false):void{
  if(secondsRemaining===null){shutdownWarningActive=false;shutdownAlert?.hidePopover();return;}
  if(!Number.isInteger(secondsRemaining)||secondsRemaining<(held?0:1)||secondsRemaining>300)return;
  shutdownWarningActive=true;
  if(!shutdownAlert){
    shutdownAlert=document.createElement('div');shutdownAlert.id='shutdown-warning';shutdownAlert.setAttribute('popover','manual');shutdownAlert.setAttribute('role','alert');shutdownAlert.setAttribute('aria-atomic','true');
    shutdownAlert.innerHTML='<h2>Server shutting down</h2><p></p>';document.body.append(shutdownAlert);
    document.addEventListener('toggle',event=>{if(event.target instanceof HTMLDialogElement)placeShutdownWarning();},true);
  }
  const minutes=secondsRemaining/60;
  shutdownAlert.querySelector('h2')!.textContent=held?'Update planned':'Server shutting down';
  shutdownAlert.dataset.countdown=String(!held&&secondsRemaining<=10);
  shutdownAlert.querySelector('p')!.textContent=held&&secondsRemaining===0?'Update pending. You can keep playing until restart.':!held&&secondsRemaining<=10?String(secondsRemaining):`Restarting for an update in ${held?'at least ':''}${secondsRemaining%60===0?`${minutes} minute${minutes===1?'':'s'}`:`${secondsRemaining} seconds`}.`;
  placeShutdownWarning();
}

function show(phase:'downloading'|'ready'|'opening'){
  if(!loader){
    loader=document.createElement('dialog');loader.id='update-loader';loader.setAttribute('aria-labelledby','update-title');loader.setAttribute('aria-describedby','update-message');
    loader.innerHTML='<img src="/ui/wordmark.png" alt="Mossvale" width="300" height="100"><h2 id="update-title"></h2><p id="update-message" role="status" aria-live="polite"></p><div class="update-progress" role="progressbar" aria-label="Updating Mossvale"><span></span></div>';
    loader.addEventListener('keydown',event=>event.stopPropagation());
    loader.addEventListener('cancel',event=>{if(loader?.dataset.phase==='opening')event.preventDefault();});
    document.body.append(loader);
  }
  const opening=phase==='opening';
  if(loader.open&&(loader.dataset.phase==='opening')!==opening)loader.close();
  loader.dataset.phase=phase;loader.setAttribute('aria-modal',String(opening));
  loader.querySelector('h2')!.textContent=opening?'Opening the new version…':phase==='ready'?'Update ready':'Updating Mossvale';
  loader.querySelector('p')!.textContent=opening?'Your adventure will be back in a moment.':phase==='ready'?'The new version will open when you are ready.':'Downloading the latest adventure. You can keep playing.';
  if(!loader.open){const focus=document.activeElement;if(opening)loader.showModal();else{loader.show();if(focus instanceof HTMLElement)focus.focus({preventScroll:true});}}
}
function hide(){if(loader?.open)loader.close();}
function allowed(){try{return safePage()&&beforeReload()!==false;}catch{return false;}}
function reload(){
  if(reloading||!pendingReload)return;
  if(!safePage()){hide();return;}
  if(controller?.state!=='activated')return;
  if(!allowed()){show('ready');return;}
  reloading=true;show('opening');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(controller?.state!=='activated'){reloading=false;return;}
    if(!safePage()){reloading=false;hide();return;}
    if(!allowed()){reloading=false;show('ready');return;}
    location.reload();
  }));
}
function activate(worker:ServiceWorker){
  if(worker.state!=='installed'||activating===worker||reloading||!safePage())return;
  if(!allowed()){show('ready');return;}
  try{activating=worker;show('opening');worker.postMessage({type:'ACTIVATE_UPDATE'});}
  catch{activating=null;hide();}
}
function watch(){
  if(!safePage())return;
  const worker=registration?.installing||registration?.waiting;
  if(worker&&worker!==watched){
    watched=worker;
    // A first installation warms the offline cache without interrupting this visit.
    if(navigator.serviceWorker.controller||registration?.active){
      const changed=()=>{
        if(worker!==watched)return;
        if(!safePage()){hide();return;}
        if(worker.state==='installed')activate(worker);
        else if(worker.state==='redundant'){if(activating===worker)activating=null;hide();}
      };
      show('downloading');worker.addEventListener('statechange',changed);changed();
    }
  }
  if(registration?.waiting&&(navigator.serviceWorker.controller||registration.active))activate(registration.waiting);
}

export async function checkForUpdates():Promise<void>{
  if(!ready||checking||reloading||!safePage())return;
  if(pendingReload){reload();return;}
  checking=true;
  try{
    if(!registration){
      registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      registration.addEventListener('updatefound',watch);watch();
    }else{watch();await registration.update();}
  }catch{if(!registration?.installing&&!activating)hide();}
  finally{checking=false;}
}

export function startUpdates(onBeforeReload:()=>boolean|void):void{
  if(started||!('serviceWorker' in navigator)||!safePage())return;
  started=true;beforeReload=onBeforeReload;controller=navigator.serviceWorker.controller;
  const start=()=>{
    ready=true;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      const previous=controller;controller=navigator.serviceWorker.controller;
      if(!controller||controller===previous||!previous&&!activating)return;
      pendingReload=true;
      // A controller can take over before its activation/cache handoff finishes.
      if(controller.state!=='activated')controller.addEventListener('statechange',reload,{once:true});
      reload();
    });
    setInterval(()=>void checkForUpdates(),60000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checkForUpdates();});
    window.addEventListener('online',()=>void checkForUpdates());
    void checkForUpdates();
  };
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
}
import './updates.css';
