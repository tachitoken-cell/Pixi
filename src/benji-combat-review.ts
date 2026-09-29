import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { INSTANT_COMBAT_MODEL_KINDS } from './instant-combat';
import { INSTANT_COMBAT_SKILLS } from './instant-combat-skills';
import { setInstantCombatAssets, setRaidAssets, createMonsterModel, animateMonsterModel } from './monster-models';
import { configureAuthoredMaterials } from './authored-materials';

const canvas=document.querySelector('canvas')!,labels=document.querySelector<HTMLDivElement>('#labels')!,view=document.querySelector<HTMLSelectElement>('#view')!,pose=document.querySelector<HTMLInputElement>('#pose')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setScissorTest(true);renderer.outputColorSpace=THREE.SRGBColorSpace;
const errors:string[]=[];addEventListener('error',event=>errors.push(event.message));
try{
 const [ic,apostle,fx]=await Promise.all(['instant-combat-monsters','horned-apostle','apostle-spells'].map(name=>new GLTFLoader().loadAsync(`/models/${name}.glb`)));
 setInstantCombatAssets(ic.scene,ic.animations);setRaidAssets(apostle.scene,apostle.animations);configureAuthoredMaterials(fx.scene);
 let entries:{name:string;clip?:string;model:THREE.Group;scene:THREE.Scene;camera:THREE.PerspectiveCamera;mixer?:THREE.AnimationMixer;duration?:number}[]=[];
 const build=()=>{
  const type=view.value,names=type==='base'?[...INSTANT_COMBAT_MODEL_KINDS]:type==='apostle'?['horned-apostle','apostle-clone','apostle-incarnate']:type==='fx'?fx.scene.children.map(root=>root.name):Object.keys(INSTANT_COMBAT_SKILLS);
  labels.replaceChildren();entries=names.map(name=>{
   const spell=type==='fx',model=spell?fx.scene.getObjectByName(name)!.clone(true) as THREE.Group:createMonsterModel(name as Parameters<typeof createMonsterModel>[0])!;
   const clip=spell?'loop':type==='apostle'?'black-claw':type==='base'?undefined:`skill-${INSTANT_COMBAT_SKILLS[name][Number(type)].id}`;
   const scene=new THREE.Scene();scene.background=new THREE.Color('#171724');scene.add(new THREE.HemisphereLight('#e5daff','#555777',2.4));const sun=new THREE.DirectionalLight('#ffffff',3);sun.position.set(4,7,5);scene.add(sun,model);
   const grid=new THREE.GridHelper(20,20,'#4f4568','#272738');grid.position.y=-.03;scene.add(grid);
   const camera=new THREE.PerspectiveCamera(38,1,.1,200),label=document.createElement('div');label.className='label';label.textContent=name;const detail=document.createElement('small');detail.textContent=spell?'Native loop':type==='base'?'Native idle':type==='apostle'?'Black Claw':INSTANT_COMBAT_SKILLS[name][Number(type)].name;label.append(detail);labels.append(label);
   if(spell){const mixer=new THREE.AnimationMixer(model),animation=fx.animations.find(c=>c.name===`${name}-loop`)!;mixer.clipAction(animation).play();return{name,clip,model,scene,camera,mixer,duration:animation.duration};}
   return{name,clip,model,scene,camera};
  });render();
 };
 const render=()=>{
  const width=canvas.clientWidth,height=canvas.clientHeight,columns=entries.length===3?3:entries.length===8?4:entries.length===12?4:5,rows=Math.ceil(entries.length/columns);renderer.setSize(width,height,false);labels.style.gridTemplateColumns=`repeat(${columns},1fr)`;labels.style.gridTemplateRows=`repeat(${rows},1fr)`;
  entries.forEach((entry,i)=>{
   const progress=Number(pose.value);if(entry.mixer)entry.mixer.setTime(progress*entry.duration!);else animateMonsterModel(entry.model,progress,false,entry.clip?{clip:entry.clip,style:'pulse',progress,impactProgress:.5,authoredTime:true}:undefined);
   const box=new THREE.Box3().setFromObject(entry.model,true),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),w=width/columns,h=height/rows;
   entry.camera.aspect=w/h;const distance=Math.max(size.y,size.x/entry.camera.aspect)*2.1+size.z*.5;entry.camera.position.copy(center).add(new THREE.Vector3(.35,.2,1).normalize().multiplyScalar(distance));entry.camera.lookAt(center);entry.camera.updateProjectionMatrix();renderer.setViewport(i%columns*w,height-(Math.floor(i/columns)+1)*h,w,h);renderer.setScissor(i%columns*w,height-(Math.floor(i/columns)+1)*h,w,h);renderer.render(entry.scene,entry.camera);
  });
 };
 view.onchange=build;pose.oninput=render;addEventListener('resize',render);build();document.body.dataset.ready='true';
 Object.assign(window,{benjiReview:{show(value:string,progress=.5){view.value=value;pose.value=String(progress);build();return entries.map(e=>({name:e.name,clip:e.clip}));},get errors(){return errors;}}});
}catch(error){document.querySelector('#error')!.textContent=String(error);throw error;}
