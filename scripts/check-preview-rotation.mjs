import assert from 'node:assert/strict';
import { bindPreviewDrag, bindPreviewRotation } from '../src/preview-rotation.ts';

let now=0, next=0, angle=0, active=true;
const frames=new Map();
globalThis.window=new EventTarget(); globalThis.document=Object.assign(new EventTarget(),{hidden:false});
globalThis.performance={now:()=>now};
globalThis.requestAnimationFrame=callback=>{frames.set(++next,callback);return next;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
const button=Object.assign(new EventTarget(),{disabled:false,style:{},setPointerCapture(){}});
bindPreviewRotation(button,delta=>angle+=delta,()=>active);
const emit=(type,props={})=>{const event=Object.assign(new Event(type,{cancelable:true}),props);button.dispatchEvent(event);return event;};
const down=(pointerId=1)=>emit('pointerdown',{button:0,pointerId});
const step=()=>{now+=20;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));};
const hold=()=>{down();for(let i=0;i<50;i++)step();};
const click=()=>{if(!emit('click').defaultPrevented)angle+=Math.PI/4;};
down();step();emit('pointerup',{pointerId:1});click();assert.equal(angle,Math.PI/4,'a short tap still rotates once');
angle=0;hold();assert(angle>2.5&&angle<3,'holding spins smoothly at half a turn per second');
const held=angle;emit('pointerup',{pointerId:9});step();assert(angle>held,'another finger cannot end this hold');
emit('pointerup',{pointerId:1});const released=angle;click();step();assert.equal(angle,released,'release and delayed click never add another step');
emit('keydown');click();assert.equal(angle,released+Math.PI/4,'keyboard activation still works after a hold');
for(const event of ['pointercancel','lostpointercapture']){hold();emit(event,{pointerId:1});const stopped=angle;step();assert.equal(angle,stopped,event);}
for(const event of ['blur','pagehide']){hold();window.dispatchEvent(new Event(event));const stopped=angle;step();assert.equal(angle,stopped,event);}
hold();document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));const hidden=angle;step();assert.equal(angle,hidden);document.hidden=false;
hold();active=false;const closed=angle;step();assert.equal(angle,closed,'leaving the preview stops rotation');active=true;
button.disabled=true;down();step();assert.equal(angle,closed,'disabled controls cannot start rotation');
assert.equal(frames.size,0,'no animation loop remains after cancellation');
const canvas=Object.assign(new EventTarget(),{setPointerCapture(){}});
bindPreviewDrag(canvas,delta=>angle+=delta,()=>active);
const drag=(type,clientX,pointerId=1)=>canvas.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{button:0,clientX,pointerId}));
angle=0;drag('pointerdown',20);drag('pointermove',120,2);assert.equal(angle,0,'another finger cannot turn the preview');
drag('pointermove',120);assert.equal(angle,1.2,'dragging right rotates by distance');drag('pointermove',20);assert.equal(angle,0,'dragging back reverses rotation');
drag('pointerup',20);drag('pointermove',120);assert.equal(angle,0,'release stops dragging');
for(const event of ['pointercancel','lostpointercapture']){drag('pointerdown',20);drag(event,20);drag('pointermove',120);assert.equal(angle,0,event);}
drag('pointerdown',20);window.dispatchEvent(new Event('blur'));drag('pointermove',120);assert.equal(angle,0,'blur stops dragging');
drag('pointerdown',20);active=false;drag('pointermove',120);assert.equal(angle,0,'closed preview stops dragging');
console.log('PASS preview rotation: tap, sustained hold, drag/reverse, no release jump, independent pointers, keyboard activation, cancellation, visibility and closed/disabled previews.');
