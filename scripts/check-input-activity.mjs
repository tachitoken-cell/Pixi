import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/input-activity.ts',import.meta.url),'utf8')).replace(/^export /gm,'');
function fixture(){
 let now=0,active=true,focused=true,tick,cleared=false;const samples=[];
 class Target{
  listeners=new Map();
  addEventListener(type,fn,options){assert.deepEqual(JSON.parse(JSON.stringify(options)),{capture:this===document,passive:true});this.listeners.set(type,fn);}
  removeEventListener(type,fn,capture){assert.equal(this.listeners.get(type),fn);assert.equal(capture,this===document);this.listeners.delete(type);}
  fire(type,properties={}){this.listeners.get(type)?.({isTrusted:true,isPrimary:true,button:0,pointerId:1,pointerType:'mouse',clientX:200,clientY:100,repeat:false,...properties});}
 }
 const document=Object.assign(new Target(),{visibilityState:'visible',hasFocus:()=>focused}),window=Object.assign(new Target(),{innerWidth:1366,innerHeight:768});
 const make=runInNewContext(source+'\ncreateInputActivity;',{document,window,performance:{now:()=>now},setInterval:(fn,ms)=>{assert.equal(ms,1000);tick=fn;return 1;},clearInterval:id=>{assert.equal(id,1);cleared=true;}});
 const api=make({active:()=>active,send:sample=>samples.push(JSON.parse(JSON.stringify(sample)))});
 return {document,window,api,samples,tick:()=>tick(),at:value=>now=value,advance:value=>{now+=value;tick();},get cleared(){return cleared;},set active(value){active=value;},set focused(value){focused=value;}};
}
const fields=['version','durationMs','viewportWidth','viewportHeight','clicks','keys','drags','touchClicks','syntheticClicks','clickIntervals','clickMeanMs','clickJitter','sameCellClicks','resizes'].sort();
{
 const f=fixture();
 for(const time of [1000,2000,3000]){f.at(time);f.document.fire('pointerdown');f.document.fire('pointerup');}
 f.document.fire('pointerdown',{isTrusted:false});f.document.fire('click',{isTrusted:false});f.document.fire('click');
 f.document.fire('pointerdown',{isPrimary:false});f.document.fire('pointerdown',{button:2});
 f.document.listeners.get('keydown')(new Proxy({isTrusted:true,repeat:false},{get(target,key){if(key==='key'||key==='code')throw Error('Raw key values must not be read');return target[key];}}));
 f.document.fire('keydown',{repeat:true});f.document.fire('keydown',{isTrusted:false});
 f.window.fire('resize');f.at(29999);f.tick();assert.equal(f.samples.length,0);f.at(30000);f.tick();
 assert.deepEqual(f.samples[0],{version:1,durationMs:30000,viewportWidth:1400,viewportHeight:800,clicks:3,keys:1,drags:0,touchClicks:0,syntheticClicks:1,clickIntervals:2,clickMeanMs:1000,clickJitter:0,sameCellClicks:3,resizes:1});
 assert.deepEqual(Object.keys(f.samples[0]).sort(),fields,'only coarse bounded aggregates leave the collector');
 f.advance(30000);assert.equal(f.samples[1].clicks,0);assert.equal(f.samples[1].sameCellClicks,0);assert.equal(f.samples[1].clickIntervals,0,'each window starts fresh');
}
{
 const f=fixture();
 for(const [time,x]of [[1000,100],[2000,600],[5000,100]]){f.at(time);f.document.fire('pointerdown',{clientX:x,pointerType:'touch'});f.document.fire('pointerup');}
 f.at(30000);f.tick();assert.equal(f.samples[0].clickMeanMs,2000);assert.equal(f.samples[0].clickJitter,.5);assert.equal(f.samples[0].sameCellClicks,2);assert.equal(f.samples[0].touchClicks,3);
 f.document.fire('pointerdown');f.document.fire('pointermove',{clientX:207});f.document.fire('pointerup');
 f.document.fire('pointerdown');f.document.fire('pointermove',{clientX:208,isTrusted:false});f.document.fire('pointerup');
 f.document.fire('pointerdown');f.document.fire('pointermove',{clientX:208});f.document.fire('pointerup',{pointerId:2});f.document.fire('pointerup');
 f.document.fire('pointerdown');f.document.fire('pointermove',{clientX:208});f.document.fire('pointercancel');f.document.fire('pointerup');
 f.advance(30000);assert.equal(f.samples[1].drags,1,'only trusted moves at least 8px ending on the matching pointer count as a drag');
}
for(const pause of ['hidden','blur','inactive']){
 const f=fixture();f.advance(15000);f.document.fire('pointerdown');
 if(pause==='hidden'){f.document.visibilityState='hidden';f.document.fire('visibilitychange');}
 else if(pause==='blur'){f.focused=false;f.window.fire('blur');}
 else{f.active=false;f.tick();}
 f.advance(120000);f.document.fire('pointerdown');f.document.fire('keydown');assert.equal(f.samples.length,0);
 if(pause==='hidden'){f.document.visibilityState='visible';f.document.fire('visibilitychange');}
 else if(pause==='blur'){f.focused=true;f.window.fire('focus');}
 else{f.active=true;f.tick();}
 f.advance(29999);assert.equal(f.samples.length,0);f.advance(1);assert.equal(f.samples.length,1);assert.equal(f.samples[0].clicks,0);assert.equal(f.samples[0].keys,0);assert.equal(f.samples[0].durationMs,30000,'background/inactive windows are discarded, never replayed');
}
{
 const f=fixture();f.document.fire('pointerdown');f.advance(61000);assert.equal(f.samples.length,0,'suspension without a visibility event does not send a stale long window');f.advance(30000);assert.equal(f.samples[0].clicks,0);
 f.advance(59000);assert.equal(f.samples[1].durationMs,59000,'a delayed foreground sample remains bounded to 60 seconds');
 f.document.fire('pointerdown');f.api.reset();f.advance(30000);assert.equal(f.samples.at(-1).clicks,0,'world transitions can explicitly discard a window');
 const count=f.samples.length;f.api.dispose();assert(f.cleared);assert.equal(f.document.listeners.size+f.window.listeners.size,0);f.advance(30000);assert.equal(f.samples.length,count);
}
console.log('PASS input activity: trusted primary clicks/keys/drags, synthetic context, online timing variance, coarse viewport/grid counts, privacy fields, 30s windows, inactive/background/suspension drops and disposal.');

function probeFixture(webdriver=false){
 let active=true,focused=true,sequence=0;const frames=new Map(),sent=[],canceled=[];
 class Target{
  listeners=new Map();
  addEventListener(type,fn){this.listeners.set(type,fn);}
  removeEventListener(type,fn){assert.equal(this.listeners.get(type),fn);this.listeners.delete(type);}
  fire(type){this.listeners.get(type)?.();}
 }
 const document=Object.assign(new Target(),{visibilityState:'visible',hasFocus:()=>focused}),window=new Target();
 const navigator=new Proxy({webdriver},{get(target,key){assert.equal(key,'webdriver','probe reads no browser identifiers or fingerprint fields');return target[key];}});
 const make=runInNewContext(source+'\ncreateClientCheck;',{document,window,navigator,requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>{canceled.push(id);frames.delete(id);}});
 const api=make({active:()=>active,send:response=>sent.push(JSON.parse(JSON.stringify(response)))});
 return {api,document,window,frames,sent,canceled,frame(){for(const[id,fn]of [...frames]){frames.delete(id);fn();}},set active(value){active=value;},set focused(value){focused=value;}};
}
const nonce='f763a53a-e8a9-4dbe-981c-813a1fe643e3',nextNonce='50c36b72-ad96-45fa-9e14-3b9483e90c87';
for(const webdriver of [false,true,undefined,'true',1]){
 const f=probeFixture(webdriver);assert.equal(f.frames.size,0,'no unsolicited probe');f.api.challenge(nonce);assert.equal(f.frames.size,1);
 f.frame();assert.equal(f.sent.length,0,'one animation frame is insufficient');assert.equal(f.frames.size,1);
 f.frame();assert.deepEqual(f.sent,[{nonce,webdriver:webdriver===true}]);f.frame();assert.equal(f.sent.length,1,'exactly one response per challenge');f.api.dispose();
}
{
 const f=probeFixture();f.api.challenge(nonce);const stale=[...f.frames.values()][0];
 for(const invalid of [null,undefined,1,{},[],{nonce},'', 'x'.repeat(129),'invalid-nonce','00000000-0000-0000-0000-000000000000'])f.api.challenge(invalid);
 assert.equal(f.frames.size,1,'unknown challenge shapes do not replace valid pending work');
 f.frame();f.api.challenge(nextNonce);assert.equal(f.canceled.length,1,'a newer challenge cancels the previous pending frame');
 stale();f.frame();assert.equal(f.sent.length,0,'stale callbacks cannot count toward a successor challenge');f.frame();assert.deepEqual(f.sent,[{nonce:nextNonce,webdriver:false}]);
 f.api.challenge(nonce);f.api.reset();assert.equal(f.frames.size,0);f.frame();assert.equal(f.sent.length,1,'explicit reset cancels a pending probe');
 f.api.challenge(nonce);const last=[...f.frames.values()][0];f.api.dispose();last();f.api.challenge(nextNonce);f.frame();assert.equal(f.sent.length,1);assert.equal(f.document.listeners.size+f.window.listeners.size,0,'dispose cancels frames and removes listeners');
}
for(const pause of ['hidden','blur','inactive']){
 const f=probeFixture();
 const suspend=()=>{if(pause==='hidden'){f.document.visibilityState='hidden';f.document.fire('visibilitychange');}else if(pause==='blur'){f.focused=false;f.window.fire('blur');}else f.active=false;};
 const resume=()=>{f.document.visibilityState='visible';f.focused=true;f.active=true;};
 suspend();f.api.challenge(nonce);assert.equal(f.frames.size,0,'ineligible contexts never start a probe');resume();f.api.challenge(nonce);f.frame();suspend();f.frame();resume();f.frame();assert.equal(f.sent.length,0,'losing eligibility between frames discards the response');
 f.api.challenge(nextNonce);f.frame();f.frame();assert.equal(f.sent.length,1);assert.equal(f.sent[0].nonce,nextNonce,'a later eligible challenge can complete normally');f.api.dispose();
}
console.log('PASS client check: UUID validation, two active visible focused frames, exact webdriver boolean only, nonce replacement, stale callback rejection, lifecycle cancellation and no background failure claims.');
