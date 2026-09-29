import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BAG_ITEMS, bagKindValid } from '../src/bags.ts';

const bytes=readFileSync(new URL('../public/models/bag-kit.glb',import.meta.url));
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const source=stripTypeScriptTypes(readFileSync(new URL('../src/bag-preview.ts',import.meta.url),'utf8'))
  .replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const poses=()=>{const rows=[];asset.scene.traverse(node=>rows.push([node.name,...node.position,...node.quaternion,...node.scale]));return JSON.stringify(rows);};
const beforePoses=poses(),disposals=new Map();
asset.scene.traverse(node=>{
  if(!node.isMesh)return;
  for(const resource of [node.geometry,node.material])if(!disposals.has(resource)){
    disposals.set(resource,0);resource.addEventListener('dispose',()=>disposals.set(resource,disposals.get(resource)+1));
  }
});

// Stub only the GPU, document surface, and fetch completion. Imported models,
// camera projection, scene graphs and OrbitControls are the actual shipping code.
class Target extends EventTarget {
  listeners=new Map();
  addEventListener(type,listener,options){super.addEventListener(type,listener,options);this.listeners.set(listener,type);}
  removeEventListener(type,listener,options){super.removeEventListener(type,listener,options);this.listeners.delete(listener);}
}
function harness(){
  const renderers=[],observers=[],requests=[],document=new Target();
  class Canvas extends Target {
    style={};attrs=new Map();captures=new Set();ownerDocument=document;
    setAttribute(key,value){this.attrs.set(key,value);}
    getRootNode(){return document;}
    getBoundingClientRect(){return this.parent?.rect??{width:0,height:0,left:0,top:0};}
    get clientWidth(){return this.getBoundingClientRect().width;}
    get clientHeight(){return this.getBoundingClientRect().height;}
    setPointerCapture(id){this.captures.add(id);}
    releasePointerCapture(id){this.captures.delete(id);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;this.captures.clear();}
  }
  document.createElement=tag=>{assert.equal(tag,'canvas');return new Canvas();};
  document.createTextNode=textContent=>({textContent,nodeType:3,
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}});
  class Renderer {
    frames=0;disposed=0;lost=0;
    constructor(options){assert(options.alpha&&options.antialias);this.domElement=options.canvas;renderers.push(this);}
    setPixelRatio(value){this.pixelRatio=value;}
    setSize(width,height){assert(width>0&&height>0);this.size=[width,height];}
    render(scene,camera){assert.equal(this.disposed,0,'no drawing after renderer disposal');this.frames++;this.scene=scene;this.camera=camera;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);}
    dispose(){this.disposed++;}
    forceContextLoss(){this.lost++;}
  }
  class Observer {
    constructor(callback){this.callback=callback;observers.push(this);}
    observe(container){this.container=container;}
    disconnect(){this.disconnected=true;}
  }
  class Loader {
    loadAsync(url){assert.equal(url,'/models/bag-kit.glb');return new Promise((resolve,reject)=>requests.push({resolve,reject}));}
  }
  const mount=vm.runInNewContext(`${source}\nmountBagPreview`,{
    THREE:{...THREE,WebGLRenderer:Renderer},GLTFLoader:Loader,OrbitControls,BAG_ITEMS,bagKindValid,
    ResizeObserver:Observer,document,devicePixelRatio:3,
  });
  const container=()=>({rect:{width:260,height:150,left:0,top:0},children:[],
    getBoundingClientRect(){return this.rect;},append(child){this.children.push(child);if(typeof child!=='string')child.parent=this;}});
  return {mount,container,renderers,observers,requests,document};
}
function dispatch(canvas,type,properties={}){
  const event=new Event(type,{cancelable:true});Object.assign(event,properties);canvas.dispatchEvent(event);return event;
}
const test=harness();
assert.equal(test.requests.length,0,'module import does not download a preview asset');
assert.equal(test.mount(test.container(),'unknown-bag'),undefined);
assert.equal(test.renderers.length,0,'invalid kinds do not create GPU contexts');
const mounted=Object.keys(BAG_ITEMS).map(kind=>{
  const container=test.container(),view=test.mount(container,kind),renderer=test.renderers.at(-1),observer=test.observers.at(-1),canvas=container.children[0];
  assert.equal(renderer.frames,0,'no empty scene is rendered before loading');
  assert.equal(canvas.tabIndex,0);assert.equal(canvas.attrs.get('role'),'img');
  assert(canvas.attrs.get('aria-label').includes(BAG_ITEMS[kind].label)&&canvas.attrs.get('aria-label').includes('Left and Right arrows'));
  assert.equal(renderer.pixelRatio,1.5);assert.equal(renderer.toneMapping,THREE.ACESFilmicToneMapping);
  assert(!dispatch(canvas,'keydown',{key:'ArrowLeft'}).defaultPrevented,'unloaded previews do not consume keyboard input');
  return {kind,container,view,renderer,observer,canvas};
});
const closedContainer=test.container(),early=test.mount(closedContainer,'linen-pouch'),earlyRenderer=test.renderers.at(-1),earlyObserver=test.observers.at(-1);
early.dispose();early.dispose();
assert.equal(test.requests.length,1,'simultaneous previews share one lazy GLB request');
test.requests[0].resolve(asset);await drain();
assert.equal(earlyRenderer.frames,0,'closing during loading cannot mount or render the completed asset');
assert.equal(closedContainer.children.length,0);assert(earlyObserver.disconnected);
assert.equal(earlyRenderer.disposed,1);assert.equal(earlyRenderer.lost,1);

function model(row){return row.renderer.scene.getObjectByName('bag-'+row.kind);}
function framed(row){
  const point=new THREE.Vector3();
  model(row).traverseVisible(node=>{
    if(!node.isMesh)return;
    const positions=node.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld).project(row.renderer.camera);
      assert(point.toArray().every(Number.isFinite)&&Math.abs(point.x)<.985&&Math.abs(point.y)<.985&&Math.abs(point.z)<1,
        `${row.kind} clips at ${row.container.rect.width}×${row.container.rect.height}, rotation ${model(row).rotation.y}: ${point.toArray()}`);
    }
  });
}
for(const row of mounted){
  const {kind,renderer,observer,container,canvas}=row,original=asset.scene.getObjectByName('bag-'+kind),copy=model(row);
  assert(copy&&copy!==original,'preview owns a transform clone of its real Blender model');
  assert.equal(copy.children[0].geometry,original.children[0].geometry);assert.equal(copy.children[0].material,original.children[0].material);
  assert.equal(renderer.scene.children.filter(node=>node.name.startsWith('bag-')).length,1,'a preview contains only its selected bag');
  assert(dispatch(canvas,'keydown',{key:'ArrowRight'}).defaultPrevented);assert.equal(copy.rotation.y,Math.PI/8);
  assert(dispatch(canvas,'keydown',{key:'ArrowLeft'}).defaultPrevented);assert.equal(copy.rotation.y,0);
  const frames=renderer.frames;assert(!dispatch(canvas,'keydown',{key:'N'}).defaultPrevented);assert.equal(renderer.frames,frames);
  for(const [width,height]of [[120,150],[260,150],[80,190],[420,190]]){
    container.rect={width,height,left:0,top:0};observer.callback();
    for(let turn=0;turn<16;turn++){dispatch(canvas,'keydown',{key:'ArrowRight'});framed(row);}
  }
  dispatch(canvas,'keydown',{key:'Home'});assert.equal(copy.rotation.y,0);
  // Exercise the real mouse control path, not a substitute rotate implementation.
  const before=renderer.camera.position.clone();
  dispatch(canvas,'pointerdown',{pointerId:1,pointerType:'mouse',button:0,clientX:30,clientY:50});
  dispatch(canvas,'pointermove',{pointerId:1,pointerType:'mouse',clientX:75,clientY:50});
  dispatch(canvas,'pointerup',{pointerId:1,pointerType:'mouse',button:0,clientX:75,clientY:50});
  assert(renderer.camera.position.distanceTo(before)>.1,'dragging rotates the actual OrbitControls camera');
  assert.equal(canvas.captures.size,0);framed(row);
  const drawn=renderer.frames;container.rect={width:0,height:0,left:0,top:0};observer.callback();assert.equal(renderer.frames,drawn,'zero-sized containers skip resize rendering');
  container.rect={width:260,height:150,left:0,top:0};observer.callback();framed(row);
}
const reopenedContainer=test.container(),reopened=test.mount(reopenedContainer,'linen-pouch');await drain();
assert.equal(test.requests.length,1,'later inspection reuses the loaded library');
assert.notEqual(test.renderers.at(-1).scene.getObjectByName('bag-linen-pouch'),model(mounted[0]),'simultaneous same-kind previews keep independent transforms');
reopened.dispose();
for(const row of mounted){
  const {view,renderer,canvas,observer,container}=row;view.dispose();view.dispose();
  const frames=renderer.frames;observer.callback();dispatch(canvas,'keydown',{key:'ArrowRight'});
  assert.equal(renderer.frames,frames);assert.equal(renderer.disposed,1);assert.equal(renderer.lost,1);
  assert(observer.disconnected&&canvas.listeners.size===0&&container.children.length===0);
  assert.equal(renderer.scene.children.length,0,'teardown releases references to lights and model clones');
}
assert.equal(test.document.listeners.size,0,'all real OrbitControls document listeners are removed');
assert.equal(poses(),beforePoses,'turning and closing previews never mutates library transforms');
assert([...disposals.values()].every(count=>count===0),'shared imported geometry and materials survive every preview teardown');

// Failed downloads reset the shared promise, so a later inspection can retry.
const failure=harness(),failedContainer=failure.container(),failed=failure.mount(failedContainer,'trail-satchel');
failure.requests[0].reject(new Error('fixture download unavailable'));await drain();
assert(failedContainer.children.some(child=>child.nodeType===3&&child.textContent==='3D preview unavailable.'),'an active failed load explains the missing preview');
failed.dispose();
assert.equal(failedContainer.children.length,0,'disposing a failed preview removes its fallback text as well as its canvas');
assert.equal(failure.renderers[0].disposed,1);assert.equal(failure.renderers[0].lost,1);
const retryContainer=failure.container(),retry=failure.mount(retryContainer,'trail-satchel');
assert.equal(failure.requests.length,2,'failed download is retryable');failure.requests[1].resolve(asset);await drain();
assert(failure.renderers[1].scene.getObjectByName('bag-trail-satchel'));retry.dispose();
const rejectedAfterClose=harness(),lateContainer=rejectedAfterClose.container(),late=rejectedAfterClose.mount(lateContainer,'wayfarer-pack');
late.dispose();rejectedAfterClose.requests[0].reject(new Error('fixture late failure'));await drain();
assert.equal(lateContainer.children.length,0,'a late rejection cannot write into a closed preview');
for(const h of [failure,rejectedAfterClose]){
  assert(h.renderers.every(renderer=>renderer.disposed===1&&renderer.lost===1));
  assert(h.observers.every(observer=>observer.disconnected));assert.equal(h.document.listeners.size,0);
}
assert([...disposals.values()].every(count=>count===0));
console.log('PASS: real four-bag GLB clones and OrbitControls, full framing at80–420px/all angles, drag and keyboard, shared lazy loads, retry, async close, and isolated renderer/listener/resource cleanup.');
