import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const lightButton=$<HTMLButtonElement>('light'),resetButton=$<HTMLButtonElement>('reset');
const scene=new THREE.Scene();scene.background=new THREE.Color('#18231f');
const camera=new THREE.PerspectiveCamera(40,1,.1,200);
const renderer=new THREE.WebGLRenderer({canvas:$<HTMLCanvasElement>('preview'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
scene.add(new THREE.HemisphereLight('#e2eddf','#45553a',2.1));
const sun=new THREE.DirectionalLight('#ffe4b6',3);sun.position.set(-10,18,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-20,right:20,top:20,bottom:-20,far:65});sun.shadow.normalBias=.03;scene.add(sun);
const rim=new THREE.DirectionalLight('#a9d3dd',2);rim.position.set(12,9,-12);scene.add(rim);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:'#394a39',roughness:1}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.listenToKeyEvents(renderer.domElement);
const views: { root:THREE.Object3D; light:THREE.Mesh }[]=[];
let lit=true;
const api={
  ready:false,status:'loading',
  selfCheck(){
    if(views.length!==2)throw new Error('Expected both beacon models');
    return views.map(({root,light})=>{
      const meshes:THREE.Mesh[]=[];root.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
      if(meshes.length!==2||!meshes.some(mesh=>mesh.userData.part==='frame')||light.userData.part!=='light')throw new Error(`Invalid beacon parts: ${root.name}`);
      if(!(light.material instanceof THREE.MeshBasicMaterial)||!light.material.vertexColors||light.material.toneMapped)throw new Error(`Invalid beacon glow: ${root.name}`);
      const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      if(![size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0)||light.visible!==lit)throw new Error(`Invalid beacon state: ${root.name}`);
      return {name:root.name,parts:meshes.map(mesh=>mesh.userData.part),lit:light.visible,size:size.toArray()};
    });
  },
};
Object.assign(window,{beaconPreview:api});

try {
  const asset=await new GLTFLoader().loadAsync('/models/beacon-kit.glb');
  const glowMaterial=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  for(const name of ['beacon-amberwild','beacon-frostmarch']){
    const source=asset.scene.getObjectByName(name);
    if(!source)throw new Error(`Missing ${name}`);
    const root=source.clone(true);root.position.set(0,0,0);
    let light:THREE.Mesh|undefined;
    root.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=object.userData.part==='frame';object.receiveShadow=true;if(object.userData.part==='light')light=object;}});
    if(!light)throw new Error(`Missing light in ${name}`);
    light.material=glowMaterial;
    views.push({root,light});scene.add(root);
  }
  const width=Math.max(...views.map(({root})=>new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).x));
  for(const [index,{root}] of views.entries()){
    const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
    root.position.set((index-.5)*width*1.65-center.x,-bounds.min.y,-center.z);
  }
  const bounds=new THREE.Box3();for(const {root} of views)bounds.union(new THREE.Box3().setFromObject(root));
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  function reset(){
    const distance=Math.max(size.y,size.x/camera.aspect)*2.3+size.z*.5;
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,distance*.27,distance));
    controls.minDistance=size.y*.8;controls.maxDistance=distance*3;controls.update();
  }
  function resize(){const viewport=$('viewport');renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();reset();}
  lightButton.onclick=()=>{lit=!lit;for(const {light} of views)light.visible=lit;lightButton.textContent=lit?'Extinguish beacons':'Light beacons';lightButton.setAttribute('aria-pressed',String(lit));$('status').textContent=lit?'Beacons lit':'Beacons unlit';};
  resetButton.onclick=reset;addEventListener('resize',resize);resize();api.selfCheck();
  lightButton.disabled=false;resetButton.disabled=false;api.ready=true;api.status='ready';document.body.dataset.ready='true';$('status').textContent='Beacons lit';
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
}catch(error){api.status='error';$('status').textContent=`Preview could not load: ${error instanceof Error?error.message:String(error)}`;console.error(error);}
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);controls.dispose();renderer.dispose();},{once:true});
