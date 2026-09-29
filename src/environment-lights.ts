import * as THREE from 'three';
import { graphics } from './graphics-settings.ts';

export interface EnvironmentEmitter {
  /** Position in the owning world root's local coordinates. */
  position: THREE.Vector3;
  color: number;
  fire?: boolean;
  scale?: number;
  /** Authored glass bounds; a tiny shell lights its otherwise unlit opaque surface. */
  size?: THREE.Vector3;
  source?: THREE.Object3D;
}
export const ENVIRONMENT_LIGHT_LIMIT = 6;
export const ENVIRONMENT_VISUAL_LIMIT = 24;

/** Resize cosmetic procedural maps only; keep the original bytes for lossless restoration. */
export function updateEffectTexture(texture: THREE.DataTexture, original: Uint8Array, width: number, height: number) {
  const divisor = graphics.textures === 'low' ? 4 : graphics.textures === 'medium' ? 2 : 1;
  const nextWidth = Math.max(1, Math.ceil(width / divisor)), nextHeight = Math.max(1, Math.ceil(height / divisor));
  if (texture.image.width === nextWidth && texture.image.height === nextHeight) return;
  const channels = original.length / (width * height), data = divisor === 1 ? original : new Uint8Array(nextWidth * nextHeight * channels);
  if (divisor > 1) for (let y = 0; y < nextHeight; y++) for (let x = 0; x < nextWidth; x++) for (let c = 0; c < channels; c++) {
    let sum = 0, count = 0;
    for (let dy = 0; dy < divisor && y * divisor + dy < height; dy++) for (let dx = 0; dx < divisor && x * divisor + dx < width; dx++) {
      sum += original[((y * divisor + dy) * width + x * divisor + dx) * channels + c]; count++;
    }
    data[(y * nextWidth + x) * channels + c] = Math.round(sum / count);
  }
  texture.dispose(); // WebGL's immutable texture storage must be recreated when dimensions change.
  texture.image = { data, width: nextWidth, height: nextHeight }; texture.needsUpdate = true;
}

/** Read actual authored glass/fire vertices, including every instanced placement. */
export function discoverEnvironmentEmitters(root: THREE.Group): EnvironmentEmitter[] {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), transform = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const emitters: EnvironmentEmitter[] = [];
  const amber = new THREE.Color(0xf4d38b), fire = new THREE.Color(0xf2b455);
  const indices = new Map<THREE.BufferGeometry, Map<string, number[]>>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const brazier = /brazier-glow/.test(object.name), village = /village-lantern-body/.test(object.name);
    const city = /^city-/.test(object.name), furniture = String(object.userData.part || object.name).startsWith('interior-furniture');
    const houseFront = object.userData.part === 'shell-front' && !city;
    if (!brazier && !village && !city && !furniture && !houseFront) return;
    const geometry = object.geometry, positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
    if (!positions) return;
    const key = brazier || village ? 'all' : furniture && !city ? 'fire' : 'amber';
    let cache = indices.get(geometry); if (!cache) indices.set(geometry, cache = new Map());
    let selected = cache.get(key);
    if (!selected) {
      selected = [];
      const target = key === 'fire' ? fire : amber;
      for (let i = 0; i < positions.count; i++) {
        if (brazier || village || colors && Math.abs(colors.getX(i)-target.r)+Math.abs(colors.getY(i)-target.g)+Math.abs(colors.getZ(i)-target.b)<.018) selected.push(i);
      }
      cache.set(key, selected);
    }
    for (let index = 0; index < (object instanceof THREE.InstancedMesh ? object.count : 1); index++) {
      transform.multiplyMatrices(inverse, object.matrixWorld);
      if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(index, instance); transform.multiply(instance); }
      if (village) {
        // This named source contains its post too: isolate its authored glass palette.
        const glass: THREE.Vector3[] = [];
        for (const i of selected) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i);
          if (!colors || colors.getX(i)<.65 || colors.getY(i)<.35 || colors.getZ(i)>.45) continue;
          glass.push(point.applyMatrix4(transform));
        }
        if (glass.length) {
          const bounds=new THREE.Box3().setFromPoints(glass);
          emitters.push({position:bounds.getCenter(new THREE.Vector3()),size:bounds.getSize(new THREE.Vector3()),color:0xffce83,source:object,scale:.65});
        }
        continue;
      }
      const pending = new Map<string, THREE.Vector3>();
      for (const i of selected) {
        const p = new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(transform);
        pending.set(`${Math.round(p.x*1000)},${Math.round(p.y*1000)},${Math.round(p.z*1000)}`,p);
      }
      // Lamp boxes share a baked material with the walls. Spatial clusters preserve each light.
      while (pending.size) {
        const first = pending.entries().next().value!; pending.delete(first[0]);
        const cluster = [first[1]];
        for (let i=0;i<cluster.length;i++) for (const [key,p] of pending) if (p.distanceToSquared(cluster[i])<1.22) {cluster.push(p);pending.delete(key);}
        const bounds = new THREE.Box3().setFromPoints(cluster), size = bounds.getSize(new THREE.Vector3());
        if (!brazier && key !== 'fire' && (size.y<.28 || Math.max(size.x,size.y,size.z)>1.15)) continue;
        emitters.push({position:bounds.getCenter(new THREE.Vector3()),color:brazier?0xffbb67:key==='fire'?0xffa449:0xffcf88,
          fire:brazier||key==='fire',size:brazier||key==='fire'?undefined:size,scale:brazier?1:key==='fire'?.7:Math.max(.6,size.y*1.4),source:object});
      }
    }
  });
  return emitters;
}

/** Shared soft sprite falloff for environmental and combat glow. */
export function createSoftGlowTexture(){
  const pixels = new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const i=(y*32+x)*4,r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5);
    pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(255*Math.pow(Math.max(0,1-r),2.4));
  }
  const texture=new THREE.DataTexture(pixels,32,32);texture.name='Soft environmental glow';texture.needsUpdate=true;
  texture.magFilter=texture.minFilter=THREE.LinearFilter;
  return {texture,pixels};
}

/** Six nearby lights and three fixed particle batches, independent of world size. */
export function createEnvironmentLights(root: THREE.Group, emitters: readonly EnvironmentEmitter[]) {
  const group = new THREE.Group(); group.name = 'Mossvale environmental effects'; root.add(group);
  group.userData.collision = 'effect';
  const {texture,pixels}=createSoftGlowTexture();
  const haloMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.72,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const fireMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:.9,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const smokeMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.15,depthTest:true,depthWrite:false,toneMapped:true,color:0x8f9297});
  const halos=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),haloMaterial,ENVIRONMENT_VISUAL_LIMIT);
  const sparks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),fireMaterial,ENVIRONMENT_VISUAL_LIMIT*12);
  const smoke=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),smokeMaterial,ENVIRONMENT_VISUAL_LIMIT*4);
  halos.name='Environmental lamp halos';sparks.name='Environmental flame and embers';smoke.name='Environmental rising smoke';
  for(const mesh of [halos,sparks,smoke]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);}
  const lights=Array.from({length:ENVIRONMENT_LIGHT_LIMIT},()=>{const light=new THREE.PointLight(0xffca80,0,9,2);light.castShadow=false;group.add(light);return light;});
  const ranked=emitters.map((emitter,index)=>({...emitter,phase:index*2.399963,distance:Infinity}));
  const pose=new THREE.Object3D(),color=new THREE.Color(),observerLocal=new THREE.Vector3(),cameraRotation=new THREE.Quaternion(),rootRotation=new THREE.Quaternion();
  const fallback=new THREE.Vector3(), inverse=new THREE.Matrix4(); let disposed=false;
  const visible=(source?:THREE.Object3D)=>{for(let node=source;node&&node!==root;node=node.parent??undefined)if(!node.visible)return false;return true;};
  function update(time:number,observer?:THREE.Vector3,camera?:THREE.Camera){
    if(disposed||!Number.isFinite(time))return;
    updateEffectTexture(texture,pixels,32,32);
    const lightLimit=graphics.effects==='off'?0:graphics.effects==='low'?2:ENVIRONMENT_LIGHT_LIMIT;
    for(let i=0;i<lights.length;i++){lights[i].visible=i<lightLimit;if(i>=lightLimit)lights[i].intensity=0;}
    if(!graphics.bloom&&!lightLimit){halos.count=sparks.count=smoke.count=0;return;}
    root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();
    if(observer)observerLocal.copy(observer).applyMatrix4(inverse);
    else if(camera)observerLocal.copy(camera.getWorldPosition(fallback)).applyMatrix4(inverse);
    else observerLocal.set(0,0,0);
    if(camera){camera.getWorldQuaternion(cameraRotation);root.getWorldQuaternion(rootRotation);cameraRotation.premultiply(rootRotation.invert());}
    else cameraRotation.identity();
    for(const emitter of ranked)emitter.distance=visible(emitter.source)?emitter.position.distanceToSquared(observerLocal):Infinity;
    ranked.sort((a,b)=>a.distance-b.distance);
    for(let i=0;i<lightLimit;i++){
      const emitter=ranked[i],light=lights[i];
      if(!emitter||emitter.distance>24*24){light.intensity=0;continue;}
      const scale=emitter.scale??1,flicker=1+Math.sin(time*7.1+emitter.phase)*.055+Math.sin(time*13.7+emitter.phase)*.028;
      light.position.copy(emitter.position);light.color.setHex(emitter.color);light.distance=emitter.fire?10:8;
      light.intensity=(emitter.fire?20:13)*scale*flicker*Math.min(1,(24-Math.sqrt(emitter.distance))/5);
    }
    let haloCount=0,sparkCount=0,smokeCount=0;
    for(let i=0;i<Math.min(ranked.length,ENVIRONMENT_VISUAL_LIMIT);i++){
      const emitter=ranked[i];if(emitter.distance>65*65)break;
      const scale=emitter.scale??1,fade=Math.min(1,(65-Math.sqrt(emitter.distance))/10),flicker=1+Math.sin(time*7.1+emitter.phase)*.06;
      if(graphics.bloom){
        pose.position.copy(emitter.position);pose.quaternion.copy(cameraRotation);pose.scale.setScalar((emitter.fire?1.75:1.4)*scale*flicker);pose.updateMatrix();
        halos.setMatrixAt(haloCount,pose.matrix);halos.setColorAt(haloCount++,color.setHex(emitter.color).multiplyScalar(fade));
      }
      if(graphics.bloom&&!emitter.fire&&emitter.size){
        pose.rotation.set(0,0,0);pose.scale.copy(emitter.size).multiplyScalar(1.025);pose.updateMatrix();
        sparks.setMatrixAt(sparkCount,pose.matrix);sparks.setColorAt(sparkCount++,color.setHex(emitter.color).multiplyScalar(flicker*fade));
      }
      if(graphics.effects==='off'||!emitter.fire||emitter.distance>38*38)continue;
      for(let j=0;j<(graphics.effects==='low'?5:12);j++){
        const flame=j<5,life=(time*(flame?1.3:.47)+j*.137+emitter.phase)%1;
        const seed=emitter.phase+j*2.17,radius=(flame?.22:.29)*scale;
        pose.position.set(emitter.position.x+Math.sin(seed+life*2)*radius,emitter.position.y+(-.15+life*(flame?.62:1.7))*scale,emitter.position.z+Math.cos(seed+life)*radius);
        const size=(flame?.16:.034)*scale*Math.sin(life*Math.PI);
        pose.scale.set(size,flame?size*(2.4-life):size,size);pose.rotation.set(.1*Math.sin(seed),seed,.1*Math.cos(seed));pose.updateMatrix();
        sparks.setMatrixAt(sparkCount,pose.matrix);sparks.setColorAt(sparkCount++,color.setHex(flame?life<.35?0xffe6a1:0xff8d38:0xffc572).multiplyScalar((1-life)*fade));
      }
      for(let j=0;j<(graphics.effects==='low'?1:4);j++){
        const life=(time*.28+j*.25+emitter.phase)%1,size=(.28+life*.48)*scale*Math.sin(life*Math.PI);
        pose.position.copy(emitter.position);pose.position.x+=Math.sin(emitter.phase+life*2)*life*.25*scale;
        pose.position.y+=(.30+life*1.65)*scale;pose.position.z+=Math.cos(emitter.phase+life)*life*.18*scale;
        pose.quaternion.copy(cameraRotation);pose.scale.set(size,size*1.1,1);pose.updateMatrix();smoke.setMatrixAt(smokeCount++,pose.matrix);
      }
    }
    for(const [mesh,count] of [[halos,haloCount],[sparks,sparkCount],[smoke,smokeCount]] as const){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
  return {update,dispose(){
    if(disposed)return;disposed=true;group.removeFromParent();
    for(const mesh of [halos,sparks,smoke]){mesh.dispose();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}
    texture.dispose();group.clear();ranked.length=0;
  }};
}
