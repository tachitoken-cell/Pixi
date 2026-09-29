import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/updates.ts',import.meta.url),'utf8')).replace(/^export /gm,'').replace(/^import '\.\/updates\.css';\s*/m,'');
const settle=()=>new Promise(setImmediate);

class Events{
  listeners=new Map();
  addEventListener(type,callback,options){const entries=this.listeners.get(type)||[];entries.push({callback,once:options?.once});this.listeners.set(type,entries);}
  emit(type,target){for(const entry of [...(this.listeners.get(type)||[])]){if(entry.once)this.listeners.set(type,this.listeners.get(type).filter(item=>item!==entry));entry.callback({target,preventDefault(){},stopPropagation(){}});}}
}
class Worker extends Events{
  constructor(state='installing'){super();this.state=state;this.sent=[];}
  postMessage(message){this.sent.push(JSON.parse(JSON.stringify(message)));}
  change(state){this.state=state;this.emit('statechange');}
}
function fixture({controlled=true,waiting=false,readyState='complete',supported=true,path='/',search='',hash='',hostname='mossvale.world'}={}){
  let document,checks=0,registers=0,reloads=0,gates=0,allowed=true,updateError=false,registrationError=false;
  const focus={focus(){document.activeElement=this;}};
  class Element extends Events{
    constructor(){super();this.open=false;this.attributes={};this.dataset={};this.children=new Map();}
    setAttribute(name,value){this.attributes[name]=value;}
    querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
    closest(){return document.modal??null;}
    append(node){node.parentElement=this;this.warning=node;}
    show(){this.open=true;document.activeElement=this;}
    showModal(){this.open=true;this.modal=true;document.activeElement=this;}
    close(){this.open=false;this.modal=false;document.activeElement=focus;}
    showPopover(){this.open=true;}
    hidePopover(){this.open=false;}
  }
  Object.setPrototypeOf(focus,Element.prototype);
  document=Object.assign(new Events(),{readyState,visibilityState:'visible',activeElement:focus,body:{children:[],append(node){node.parentElement=this;if(!this.children.includes(node))this.children.push(node);}},querySelector:()=>document.modal??null,createElement:()=>new Element()});
  const old=controlled?new Worker('activated'):null,registration=Object.assign(new Events(),{active:old,waiting:waiting?new Worker('installed'):null,installing:null,async update(){checks++;if(updateError)throw Error('Network unavailable');}});
  const sw=Object.assign(new Events(),{controller:old,async register(path,options){registers++;assert.equal(path,'/sw.js');assert.equal(options.updateViaCache,'none');if(registrationError)throw Error('Offline');return registration;}});
  const window=new Events(),timers=[],frames=[],location={hostname,pathname:path,search,hash,reload(){reloads++;}};
  const context={document,window,location,navigator:supported?{serviceWorker:sw}:{},HTMLElement:Element,HTMLDialogElement:Element,requestAnimationFrame:callback=>frames.push(callback),setInterval:(callback,ms)=>{timers.push({callback,ms});return timers.length;}};
  const api=runInNewContext(source+'\n({startUpdates,checkForUpdates,showShutdownWarning,warningActive:()=>shutdownWarningActive});',context);
  const start=()=>api.startUpdates(()=>{gates++;return allowed&&!api.warningActive();});
  const install=()=>{const worker=new Worker();registration.installing=worker;registration.emit('updatefound');return worker;};
  const installed=worker=>{registration.installing=null;registration.waiting=worker;worker.change('installed');};
  const control=(worker,state='activated')=>{worker.state=state;sw.controller=worker;registration.active=worker;registration.waiting=null;sw.emit('controllerchange');};
  const paint=()=>{for(let i=0;i<2;i++)for(const frame of frames.splice(0))frame();};
  return {...api,start,install,installed,control,paint,document,window,sw,registration,timers,location,focus,get loader(){return document.body.children.find(node=>node.id==='update-loader');},get warning(){return document.body.children.find(node=>node.id==='shutdown-warning');},get registers(){return registers;},get checks(){return checks;},get reloads(){return reloads;},get gates(){return gates;},set allowed(value){allowed=value;},set updateError(value){updateError=value;},set registrationError(value){registrationError=value;}};
}

{
  const f=fixture({hostname:'account.mossvale.world'});f.start();await f.checkForUpdates();await settle();
  assert.equal(f.registers,0,'the account hostname never installs a game worker');assert.equal(f.timers.length,0);
}

{
  const f=fixture();f.start();await settle();
  for(const invalid of [0,-1,301,1.5,NaN,Infinity,'10',undefined])f.showShutdownWarning(invalid);
  assert(!f.warningActive()&&!f.warning,'invalid countdowns cannot block automatic updates');
  for(const seconds of [300,240,180,120,60]){
    f.showShutdownWarning(seconds);assert(f.warningActive()&&f.warning.open);assert.equal(f.warning.querySelector('p').textContent,`Restarting for an update in ${seconds/60} minute${seconds===60?'':'s'}.`);
  }
  assert.equal(f.warning.attributes.role,'alert');assert.equal(f.warning.attributes['aria-atomic'],'true');assert.equal(f.warning.attributes.popover,'manual');assert.equal(f.document.activeElement,f.focus,'warnings never steal gameplay focus');
  const modal=f.document.createElement('dialog');f.document.modal=modal;f.document.emit('toggle',modal);assert.equal(f.warning.parentElement,modal,'the alert remains accessible inside an open game modal');
  f.document.modal=null;f.document.emit('toggle',modal);assert.equal(f.warning.parentElement,f.document.body,'closing a modal returns the alert to the game');
  f.showShutdownWarning(47);assert.equal(f.warning.querySelector('p').textContent,'Restarting for an update in 47 seconds.','late joins show their current remaining time');
  const worker=f.install();f.installed(worker);assert.equal(worker.sent.length,0,'a downloaded update waits for the scheduled shutdown');
  f.control(worker);f.paint();assert.equal(f.reloads,0,'another tab activating the update cannot interrupt the warning');
  for(let seconds=10;seconds>=1;seconds--){f.showShutdownWarning(seconds);assert.equal(f.warning.querySelector('p').textContent,String(seconds));assert.equal(f.warning.dataset.countdown,'true');}
  assert.equal(f.document.body.children.filter(node=>node.id==='shutdown-warning').length,1,'one alert is reused throughout the countdown');
  f.showShutdownWarning(null);assert(!f.warningActive()&&!f.warning.open);await f.checkForUpdates();f.paint();assert.equal(f.reloads,1,'the update can open once the realm actually closes');
}

{
  const f=fixture();f.start();await settle();
  for(const seconds of [300,47,10,1,0]){
    f.showShutdownWarning(seconds,true);assert(f.warningActive()&&f.warning.open);
    assert.equal(f.warning.querySelector('h2').textContent,'Update planned');
    assert.equal(f.warning.dataset.countdown,'false','held notices never show an urgent digit countdown');
    assert.match(f.warning.querySelector('p').textContent,seconds===0?/Update pending\. You can keep playing until restart\./:/in at least /);
  }
  const worker=f.install();f.installed(worker);assert.equal(worker.sent.length,0,'held expiry keeps updates deferred while gameplay is active');
  f.showShutdownWarning(10);assert.equal(f.warning.querySelector('h2').textContent,'Server shutting down');
  assert.equal(f.warning.querySelector('p').textContent,'10');assert.equal(f.warning.dataset.countdown,'true');
  f.showShutdownWarning(null);assert(!f.warningActive()&&!f.warning.open);
  await f.checkForUpdates();assert.equal(worker.sent.length,1,'canceling a held notice releases the normal update gate');
}

{
  const f=fixture({controlled:false,readyState:'loading'});await f.checkForUpdates();assert.equal(f.registers,0);
  f.start();f.start();assert.equal(f.registers,0,'registration waits for page load and settled startup');
  f.window.emit('load');await settle();assert.equal(f.registers,1);assert.equal(f.timers.length,1);assert.equal(f.timers[0].ms,60000);
  const first=f.install();f.installed(first);assert.equal(first.sent.length,0,'first installation activates normally');assert(!f.loader,'first installation never blocks the current visit');f.control(first);assert.equal(f.reloads,0,'first-ever controller claim never reloads');
  const next=f.install();assert.equal(f.loader.dataset.phase,'downloading');assert.equal(f.loader.attributes['aria-modal'],'false');assert.equal(f.document.activeElement,f.focus,'background download keeps keyboard focus');
  assert.match(f.loader.innerHTML,/role="status" aria-live="polite"/);assert.match(f.loader.innerHTML,/wordmark\.png/);assert.equal(next.sent.length,0,'incomplete installation cannot request activation');
  f.installed(next);assert.deepEqual(next.sent,[{type:'ACTIVATE_UPDATE'}]);assert.equal(f.loader.dataset.phase,'opening');assert(f.loader.modal);assert.equal(f.reloads,0,'complete install still waits for actual controller takeover');
  f.control(next);f.sw.emit('controllerchange');await f.checkForUpdates();assert.equal(f.reloads,0,'opening overlay gets a browser paint before navigation');f.paint();assert.equal(f.reloads,1);assert.equal(f.gates,3,'activation, reload and final navigation each honor the current readiness gate');
}
// Browsers may bypass a worker's fetch handler until activation has finished.
for(const allowedAtActivation of [true,false]){
  const f=fixture();f.start();await settle();const worker=f.install();f.installed(worker);
  f.control(worker,'activating');f.paint();await f.checkForUpdates();f.document.emit('visibilitychange');f.window.emit('online');await settle();f.paint();
  assert.equal(f.reloads,0,'controller takeover and periodic checks cannot navigate during cache handoff');
  f.allowed=allowedAtActivation;worker.change('activated');f.paint();
  assert.equal(f.reloads,allowedAtActivation?1:0,'activation completion resumes only when account/shutdown gates still allow it');
  if(!allowedAtActivation){assert.equal(f.loader.dataset.phase,'ready');f.allowed=true;await f.checkForUpdates();f.paint();assert.equal(f.reloads,1);}
}
{
  const f=fixture();f.start();await settle();const worker=f.install();f.installed(worker);f.control(worker);
  const successor=new Worker('activating');f.control(successor,'activating');f.paint();
  assert.equal(f.reloads,0,'a newer controller beginning activation during paint cancels navigation');
  successor.change('activated');f.paint();assert.equal(f.reloads,1,'the successor resumes navigation after its own handoff completes');
}
{
  const f=fixture({waiting:true});f.allowed=false;f.start();await settle();const worker=f.registration.waiting;
  assert.equal(worker.sent.length,0);assert.equal(f.loader.dataset.phase,'ready');assert(!f.loader.modal,'a busy form can finish before activation');
  f.allowed=true;await f.checkForUpdates();assert.equal(worker.sent.length,1,'a waiting worker is activated without another install');
  f.allowed=false;f.control(worker);assert.equal(f.reloads,0);assert.equal(f.loader.dataset.phase,'ready');
  f.allowed=true;f.document.emit('visibilitychange');await settle();f.paint();assert.equal(f.reloads,1,'controller takeover can wait for an in-progress account action');
}
{
  const f=fixture();f.start();await settle();const broken=f.install();broken.change('redundant');assert(!f.loader.open);assert.equal(broken.sent.length,0);assert.equal(f.reloads,0,'failed or partial install retains the old working client');
  f.registration.installing=null;f.updateError=true;await assert.doesNotReject(f.checkForUpdates());assert.equal(f.reloads,0);
  f.updateError=false;const before=f.checks;f.document.visibilityState='hidden';f.document.emit('visibilitychange');await settle();assert.equal(f.checks,before);
  f.document.visibilityState='visible';f.document.emit('visibilitychange');await settle();f.window.emit('online');await settle();f.timers[0].callback();await settle();assert.equal(f.checks,before+3,'visibility, online and periodic checks recover quietly');
  const good=f.install();f.installed(good);f.control(good);f.paint();assert.equal(f.reloads,1,'a later complete install can replace the failed attempt');
}
// Register/update callbacks can observe a worker after its state has already changed.
{
  const f=fixture();const failed=new Worker('redundant');f.registration.installing=failed;
  f.start();await settle();assert(!f.loader.open,'an already-failed worker cannot leave the downloading notice open');
  f.registration.installing=null;
  const stale=f.install(),current=f.install();stale.change('redundant');
  assert(f.loader.open&&f.loader.dataset.phase==='downloading','a superseded worker failure cannot hide the current download');
  current.change('redundant');assert(!f.loader.open,'the current failure closes the notice');
  f.registration.installing=null;await f.checkForUpdates();assert(!f.loader.open,'a later successful check without a candidate leaves no stale downloading notice');
}
{
  const f=fixture();f.registrationError=true;f.start();await settle();assert.equal(f.registers,1);assert.equal(f.reloads,0);f.registrationError=false;f.window.emit('online');await settle();assert.equal(f.registers,2,'offline registration retries when network returns');
  const foreign=new Worker('activated');f.allowed=false;f.control(foreign);assert.equal(f.reloads,0);f.allowed=true;await f.checkForUpdates();f.paint();assert.equal(f.reloads,1,'an upgrade activated by another tab is also gated');
}
{
  const f=fixture();f.start();await settle();const worker=f.install();f.installed(worker);f.control(worker);
  f.allowed=false;f.paint();assert.equal(f.reloads,0,'an account action or displacement during paint cannot use a stale resume marker');assert.equal(f.loader.dataset.phase,'ready');
  f.allowed=true;await f.checkForUpdates();f.paint();assert.equal(f.reloads,1,'the deferred update can retry with current tab state');
}
for(const options of [{supported:false},{path:'/api/wallet-oidc/callback'},{search:'?code=oauth-code&state=oauth-state'},{hash:'#state=oauth-state&session_state=provider'}]){
  const f=fixture(options);f.start();await f.checkForUpdates();assert.equal(f.registers,0);assert.equal(f.timers.length,0);assert(!f.loader,'unsupported browsers and auth callback routes remain untouched');
}
{
  const f=fixture();f.start();await settle();f.location.search='?code=callback&state=pending';f.control(new Worker('activated'));assert.equal(f.reloads,0);assert(!f.loader,'a callback begun after setup cannot be interrupted');await f.checkForUpdates();assert.equal(f.reloads,0);
  f.location.search='';await f.checkForUpdates();f.paint();assert.equal(f.reloads,1,'a completed callback releases the deferred upgrade');
}
console.log('PASS automatic updates: shutdown alerts and numeric countdown without focus loss, shutdown-gated activation/reload, complete-install activation, activated-controller handoff, first-claim protection, failed-download recovery, periodic/network/visibility checks and OAuth/no-SW exclusions.');
