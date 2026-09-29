import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** A local, decorative woodland. It never opens a game connection. */
export function createLoginScene(canvas:HTMLCanvasElement,assetBase='') {
 let renderer:THREE.WebGLRenderer|undefined,scene:THREE.Scene|undefined,camera:THREE.PerspectiveCamera|undefined;
 let active=false,disposed=false,frame=0,loading:Promise<void>|undefined;
 const lanterns:THREE.PointLight[]=[],motion=matchMedia('(prefers-reduced-motion: reduce)');
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 function own(root:THREE.Object3D){root.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});}
 function draw(now=0){
  frame=0;if(!active||disposed||document.hidden||!renderer||!scene||!camera)return;
  const width=canvas.clientWidth||innerWidth,height=canvas.clientHeight||innerHeight;
  if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  for(let i=0;i<lanterns.length;i++)lanterns[i].intensity=6+(motion.matches?0:Math.sin(now*.0028+i*2)*.55);
  renderer.render(scene,camera);
  if(!motion.matches)frame=requestAnimationFrame(draw);
 }
 async function initialize(){
  try {
   renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.17;
   scene=new THREE.Scene();scene.background=new THREE.Color('#688477');scene.fog=new THREE.Fog('#688477',18,52);
   camera=new THREE.PerspectiveCamera(43,1,.1,90);camera.position.set(.5,3.15,10.8);camera.lookAt(0,2.15,-5.5);
   scene.add(new THREE.HemisphereLight('#fff0ce','#244c38',1.9));
   const sun=new THREE.DirectionalLight('#ffe2b5',2.8);sun.position.set(-8,12,8);scene.add(sun);
   for(const x of [-3,3]){const light=new THREE.PointLight('#ffbc65',6,9,2);light.position.set(x,1.9,-2);lanterns.push(light);scene.add(light);}
   const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#40543a',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.23;scene.add(ground);own(ground);draw();
   const model=await new GLTFLoader().loadAsync(`${assetBase}/models/creator-scene.glb`);own(model.scene);
   if(disposed){for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();return;}
   scene.add(model.scene);canvas.dataset.scene='ready';restart();
  }catch{canvas.dataset.scene='unavailable';}
 }
 function restart(){cancelAnimationFrame(frame);frame=0;if(active&&!document.hidden)draw(performance.now());}
 function visibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;}else restart();}
 window.addEventListener('resize',restart);document.addEventListener('visibilitychange',visibility);motion.addEventListener('change',restart);
 return {
  start(){if(disposed)return;active=true;if(!loading)loading=initialize();else restart();},
  stop(){active=false;cancelAnimationFrame(frame);frame=0;},
  dispose(){if(disposed)return;disposed=true;active=false;cancelAnimationFrame(frame);window.removeEventListener('resize',restart);document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',restart);for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();geometries.clear();materials.clear();renderer?.dispose();scene?.clear();},
 };
}
