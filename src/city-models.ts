import * as THREE from 'three';
import { CITY_LAYOUTS, CITY_RADIUS, type CityLayout } from './city.ts';
import { groundHeight } from './landscape.ts';
import { createVillageProps } from './village-models.ts';
import { BUILDING_FLOOR_LIFT } from './buildings.ts';
import { cityRoadPavers, CITY_PAVER_VERTICES, CITY_PAVER_INDICES } from './city-road-paving.ts';
import { graphics } from './graphics-settings.ts';

/** Animate authored water parts and reuse one fixed droplet batch for the city. */
function fountainAnimation(root: THREE.Group, city: CityLayout) {
  const water = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.18,metalness:.08,emissive:0x174457,emissiveIntensity:.10});
  const bindings: { mesh:THREE.InstancedMesh; original:THREE.Material|THREE.Material[]; matrices:THREE.Matrix4[]; ripple:boolean }[] = [];
  root.traverse(node=>{
    if (!(node instanceof THREE.InstancedMesh) || !node.name.startsWith('city-fountain-water-')) return;
    node.userData.collision = 'water';
    const matrices:THREE.Matrix4[]=[];
    for(let i=0;i<node.count;i++){const matrix=new THREE.Matrix4();node.getMatrixAt(i,matrix);matrices.push(matrix);}
    bindings.push({mesh:node,original:node.material,matrices,ripple:node.name.includes('water-ripples')});
    node.material=water;node.castShadow=false;node.receiveShadow=true;
  });
  const fountains=city.props.filter(p=>p.kind==='city-fountain');
  const dropletGeometry=new THREE.BoxGeometry(1,1,1);
  const dropletMaterial=new THREE.MeshStandardMaterial({color:0xc5f1ef,roughness:.22,emissive:0x1a4550,emissiveIntensity:.12});
  const droplets=new THREE.InstancedMesh(dropletGeometry,dropletMaterial,128);
  droplets.name='Lanternreach fountain droplets';droplets.count=Math.min(4,fountains.length)*32;
  droplets.userData.collision='effect';
  droplets.frustumCulled=false;root.add(droplets);
  const nearby=fountains.map(p=>({p,distance:0})),pose=new THREE.Object3D(),matrix=new THREE.Matrix4();
  let disposed=false;
  function animate(time:number,observer?:{x:number;z:number}) {
    if(disposed||!Number.isFinite(time)||!root.visible)return;
    for(const {mesh,matrices,ripple} of bindings){
      for(let i=0;i<matrices.length;i++){
        matrix.copy(matrices[i]);
        const wave=Math.sin(time*(ripple?2.8:2.1)+i*1.7);
        matrix.elements[13]+=wave*(ripple?.006:.013);
        if(ripple)for(const at of [0,2,4,6,8,10])matrix.elements[at]*=1+wave*.055;
        mesh.setMatrixAt(i,matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
    for(const entry of nearby)entry.distance=observer?Math.hypot(observer.x-entry.p.x,observer.z-entry.p.z):0;
    nearby.sort((a,b)=>a.distance-b.distance);
    droplets.visible=!!nearby.length&&nearby[0].distance<120;
    if(!droplets.visible)return;
    for(let f=0;f<Math.min(4,nearby.length);f++){
      const {p,distance}=nearby[f],c=Math.cos(p.rotation),s=Math.sin(p.rotation);
      for(let i=0;i<32;i++){
        const jet=i%4,axis=jet<2,side=jet%2?-1:1;
        const phase=((time*(i<24?1.9:1.3)+Math.floor(i/4)*.167+f*.31)%1+1)%1;
        let x=axis?side*1.16:0,z=axis?0:side*1.16,y=.72;
        if(i<24){
          x+=Math.sin(time*4+i)*.035;z+=Math.cos(time*3+i)*.035;y+=(1-phase)*1.50;
          pose.scale.set(.043,.10+(1-phase)*.10,.043);
        }else{
          const direction=i*.92;
          x+=Math.cos(direction)*phase*.55;z+=Math.sin(direction)*phase*.55;y+=Math.sin(phase*Math.PI)*.27;
          pose.scale.setScalar(.056*(1-phase*.55));
        }
        if(distance>=120)pose.scale.setScalar(0);
        pose.position.set(p.x+x*c+z*s,groundHeight(p.x,p.z)+BUILDING_FLOOR_LIFT+y,p.z-x*s+z*c);pose.updateMatrix();
        droplets.setMatrixAt(f*32+i,pose.matrix);
      }
    }
    droplets.instanceMatrix.needsUpdate=true;
  }
  animate(0);
  return {animate,dispose(){
    if(disposed)return;disposed=true;
    for(const {mesh,original,matrices} of bindings){mesh.material=original;for(let i=0;i<matrices.length;i++)mesh.setMatrixAt(i,matrices[i]);mesh.instanceMatrix.needsUpdate=true;}
    droplets.removeFromParent();droplets.dispose();dropletGeometry.dispose();dropletMaterial.dispose();water.dispose();
  }};
}

/** Reuse instanced kit geometry; only the occupied canopy needs individual visibility. */
export function createCityModels(asset: THREE.Group, furnishings?: THREE.Group, city: CityLayout = CITY_LAYOUTS[0], biomes?: {scene:THREE.Group;animations:THREE.AnimationClip[]}) {
  const {props:CITY_PROPS,furnishings:CITY_FURNISHINGS}=city;
  const CITY_HALL=CITY_PROPS.find(p=>p.kind==='city-auction-hall')!,CITY_CLOCKTOWER=CITY_PROPS.find(p=>p.kind==='city-clocktower')!;
  const root = new THREE.Group(); root.name = `${city.name} — Blender city`;
  const regional=city.zone!=='greenwood'&&biomes?new THREE.Group():undefined;
  const gardenKinds:Record<string,string>={'courtyard-tree':'tree','bush-planter':'planter','lantern-statue':'statue'};
  const gardens=CITY_FURNISHINGS.filter(p=>!p.buildingId);
  if(furnishings)root.add(createVillageProps(furnishings,gardens.filter(p=>!regional||!gardenKinds[p.kind]).map(p=>({...p,y:groundHeight(p.x,p.z)+BUILDING_FLOOR_LIFT})),'furnishing-'));
  const landmarkProp=regional?CITY_PROPS.find(p=>p.kind==='city-fountain'&&p.x-city.x===34&&p.z-city.z===24):undefined;
  let landmark:THREE.Object3D|undefined,mixer:THREE.AnimationMixer|undefined,lastAnimationTime:number|undefined;
  if(regional){
    regional.name=`${city.name} biome landmarks`;
    regional.add(createVillageProps(biomes!.scene,gardens.filter(p=>gardenKinds[p.kind]).map(p=>({...p,kind:gardenKinds[p.kind],y:groundHeight(p.x,p.z)+BUILDING_FLOOR_LIFT})),`town-${city.zone}-`));
    const source=biomes!.scene.getObjectByName(`town-${city.zone}-landmark`),clip=biomes!.animations.find(clip=>clip.name===`town-${city.zone}-ambient`);
    if(!landmarkProp||!source||!clip)throw new Error(`Missing biome landmark or animation: ${city.zone}`);
    landmark=source.clone(true);landmark.position.set(landmarkProp.x,groundHeight(landmarkProp.x,landmarkProp.z)+BUILDING_FLOOR_LIFT,landmarkProp.z);landmark.rotation.y=landmarkProp.rotation+Math.PI/2;
    landmark.traverse(node=>{if(node instanceof THREE.Mesh)node.castShadow=node.receiveShadow=true;});
    regional.add(landmark);mixer=new THREE.AnimationMixer(landmark);mixer.clipAction(clip).play();mixer.update(0);
  }
  const open = CITY_PROPS.filter(p => /pavilion|stable|market-stall/.test(p.kind));
  const staticProps = CITY_PROPS.filter(p => p !== CITY_HALL && p !== CITY_CLOCKTOWER && p !== landmarkProp && !open.includes(p));
  root.add(createVillageProps(asset, staticProps.map(p=>({...p,kind:p.kind.slice(5),y:groundHeight(p.x,p.z)+BUILDING_FLOOR_LIFT})), 'city-'));
  const fountain=fountainAnimation(root,{...city,props:staticProps});
  let disposed=false;
  // Cache a few solid volumes once. Camera motion never raycasts the detailed city meshes.
  const cameraBlocks: THREE.Box3[] = [], transform = new THREE.Object3D();
  if(landmark)cameraBlocks.push(new THREE.Box3().setFromObject(landmark).expandByScalar(.35));
  for (const prop of staticProps.filter(p => p.kind === 'city-wall' || p.kind === 'city-gate')) {
    const source = asset.getObjectByName(prop.kind)!;
    const inverse = new THREE.Matrix4().copy(source.matrixWorld).invert();
    const bounds = new THREE.Box3().setFromObject(source).applyMatrix4(inverse);
    transform.position.set(prop.x, groundHeight(prop.x,prop.z)+BUILDING_FLOOR_LIFT, prop.z); transform.rotation.set(0, prop.rotation, 0); transform.updateMatrix();
    const footprints = JSON.parse(source.userData.solidFootprints) as number[][];
    for (const [x,z,width,depth] of footprints) cameraBlocks.push(new THREE.Box3(
      new THREE.Vector3(x-width/2,bounds.min.y,z-depth/2),
      new THREE.Vector3(x+width/2,bounds.max.y,z+depth/2),
    ).applyMatrix4(transform.matrix));
    // The lintel occupies only its authored height, leaving the six-metre arch open below.
    if (prop.kind === 'city-gate') {
      const lintel = source.getObjectByName('city-gate-shell-front');
      if (lintel) cameraBlocks.push(new THREE.Box3().setFromObject(lintel).applyMatrix4(inverse).applyMatrix4(transform.matrix));
    }
  }
  // Outside the clocktower, its shell and stepped upper stages also obstruct the view.
  // Individual part bounds avoid extending the wide ground floor up the whole spire.
  const clockBlocks: THREE.Box3[] = [], clockSource = asset.getObjectByName(CITY_CLOCKTOWER.kind)!;
  const clockSourceInverse = new THREE.Matrix4().copy(clockSource.matrixWorld).invert();
  transform.position.set(CITY_CLOCKTOWER.x, groundHeight(CITY_CLOCKTOWER.x,CITY_CLOCKTOWER.z)+BUILDING_FLOOR_LIFT, CITY_CLOCKTOWER.z);
  transform.rotation.set(0, CITY_CLOCKTOWER.rotation, 0); transform.updateMatrix();
  const clockInverse = transform.matrix.clone().invert(), clockTarget = new THREE.Vector3();
  clockSource.traverse(part => {
    if (part instanceof THREE.Mesh && /^(shell|roof)-/.test(String(part.userData.part || part.name)))
      clockBlocks.push(new THREE.Box3().setFromObject(part).applyMatrix4(clockSourceInverse).applyMatrix4(transform.matrix));
  });
  const cameraRay = new THREE.Ray(), cameraDirection = new THREE.Vector3(), cameraHit = new THREE.Vector3();
  function constrainCamera(target: THREE.Vector3, desired: THREE.Vector3) {
    const distance = cameraDirection.subVectors(desired,target).length();
    if (!Number.isFinite(distance) || distance < .001) return;
    cameraRay.set(target,cameraDirection.multiplyScalar(1/distance));
    let nearest = Infinity;
    for (const box of cameraBlocks) if (cameraRay.intersectBox(box,cameraHit)) nearest = Math.min(nearest,target.distanceTo(cameraHit));
    clockTarget.copy(target).applyMatrix4(clockInverse);
    const insideClock = Math.abs(clockTarget.x) <= CITY_CLOCKTOWER.width/2 && Math.abs(clockTarget.z) <= CITY_CLOCKTOWER.depth/2;
    // Indoor walls and the roof are already handled by the directional cutaway.
    if (!insideClock) for (const box of clockBlocks) if (cameraRay.intersectBox(box,cameraHit)) nearest = Math.min(nearest,target.distanceTo(cameraHit));
    if (nearest <= distance + 1e-6) desired.copy(target).addScaledVector(cameraDirection,Math.max(.05,nearest-.4));
  }
  const canopies = open.map(p => {
    const source = asset.getObjectByName(p.kind); if (!source) throw new Error(`Missing city model: ${p.kind}`);
    const model = source.clone(true); model.position.set(p.x,groundHeight(p.x,p.z)+BUILDING_FLOOR_LIFT,p.z); model.rotation.y=p.rotation; root.add(model);
    const roofs: THREE.Object3D[] = [];
    model.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = node.receiveShadow = true; if (String(node.userData.part || node.name).startsWith('roof-')) roofs.push(node); } });
    return { p, roofs };
  });
  const paving=cityRoadPavers(city),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(CITY_PAVER_VERTICES.flat(),3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(CITY_PAVER_VERTICES.flatMap(point=>Array(3).fill(point[1]>.01?1:.60)),3));
  geometry.setIndex(CITY_PAVER_INDICES);geometry.computeVertexNormals();
  const tiles=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({roughness:1,vertexColors:true,flatShading:true}),paving.length);
  tiles.name=`${city.name} cobbled streets`;tiles.receiveShadow=true;
  const matrix=new THREE.Matrix4(),tint=new THREE.Color();
  for(const [i,p] of paving.entries()){
    matrix.set(p.width,0,0,p.x,p.slopeX*p.width,1,p.slopeZ*p.depth,p.y,0,0,p.depth,p.z,0,0,0,1);
    tiles.setMatrixAt(i,matrix);tiles.setColorAt(i,tint.setHex(p.color));
  }
  tiles.computeBoundingSphere();root.add(tiles);
  const materials=new Map<THREE.Material,THREE.Material>();
  if(city.tint!==0xffffff)root.traverse(node=>{
    if(!(node instanceof THREE.Mesh)||node===tiles)return;
    const tintMaterial=(source:THREE.Material)=>{
      let material=materials.get(source);
      if(!material){material=source.clone();if('color' in material)(material.color as THREE.Color).multiply(new THREE.Color(city.tint));materials.set(source,material);}
      return material;
    };
    node.material=Array.isArray(node.material)?node.material.map(tintMaterial):tintMaterial(node.material);
  });
  // Biome assets keep the Blender palette instead of receiving the shared city-kit tint.
  if(regional)root.add(regional);
  return { root, constrainCamera, animate(time:number,observer?:{x:number;z:number}) {
    if(disposed||!Number.isFinite(time))return;
    fountain.animate(time,observer);
    const delta=lastAnimationTime===undefined?0:Math.max(0,Math.min(.1,time-lastAnimationTime));lastAnimationTime=time;
    if(mixer&&landmark&&root.visible&&graphics.effects!=='off'&&(!observer||Math.hypot(observer.x-landmark.position.x,observer.z-landmark.position.z)<140))mixer.update(delta);
  }, dispose() {
    if(disposed)return;disposed=true;fountain.dispose();
    if(mixer&&landmark){mixer.stopAllAction();mixer.uncacheRoot(landmark);}
    tiles.removeFromParent();tiles.dispose();tiles.geometry.dispose();tiles.material.dispose();materials.forEach(material=>material.dispose());
  }, update(player:{x:number;z:number;y?:number}) {
    if(disposed)return;
    root.visible=Math.hypot(player.x-city.x,player.z-city.z)<CITY_RADIUS+210;
    if(root.visible)for(const {p,roofs} of canopies){
      const dx=player.x-p.x,dz=player.z-p.z,c=Math.cos(p.rotation),s=Math.sin(p.rotation);
      for(const roof of roofs)roof.visible=!((player.y===undefined||player.y<=groundHeight(player.x,player.z)+3)&&Math.abs(dx*c-dz*s)<p.width/2&&Math.abs(dx*s+dz*c)<p.depth/2);
    }
  } };
}
