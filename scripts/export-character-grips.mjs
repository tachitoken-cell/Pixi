// Export exact, posed runtime geometry for Blender inspection. No replacement rig or assets.
// node scripts/export-character-grips.mjs --phase before --source /tmp/mossvale-character-grips-before.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';

const argument=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];};
const phase=argument('--phase','after'),runtimeURL=new URL('../src/characters.ts',import.meta.url);
const sourcePath=argument('--source',runtimeURL.pathname),source=readFileSync(sourcePath,'utf8');
const script=stripTypeScriptTypes(source).replace(/from\s+(['"])([^'"]+)\1/g,(_,quote,specifier)=>`from ${quote}${specifier.startsWith('.')?new URL(specifier,runtimeURL).href:import.meta.resolve(specifier)}${quote}`);
const {makeCharacter,animateCharacter,setCharacterCustomization,setCharacterGear,setCharacterRaces}=await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
for(const [name,setter] of [['customization-kit',setCharacterCustomization],['gear-kit',setCharacterGear],['race-kit',setCharacterRaces]]){
 if(!setter)continue; // Historical runtime sources predate the separate race bodies.
 const bytes=readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));
 setter((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);
}
globalThis.FileReader=class {
 readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
};
const cases=[
 {id:'ranger-idle',label:'Ranger · idle',className:'Ranger'},
 {id:'bow-draw',label:'Bow · full draw',className:'Ranger',attack:{ability:'arrow',progress:.24}},
 {id:'bow-release',label:'Bow · release',className:'Ranger',attack:{ability:'arrow',progress:.32}},
 {id:'knight-idle',label:'Knight · idle',className:'Knight'},
 {id:'sword-strike',label:'Sword · windup',className:'Knight',attack:{ability:'strike',progress:.24}},
 {id:'mage-idle',label:'Mage · idle',className:'Mage'},
 {id:'staff-cast',label:'Staff · casting',className:'Mage',attack:{ability:'fireball',progress:.30}},
 {id:'mining',label:'Pickaxe · overhead',className:'Knight',gathering:'mining',time:.92*.42},
 {id:'woodcutting',label:'Axe · backswing',className:'Ranger',gathering:'woodcutting',time:.92*.42},
];
const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide});
const instanceMatrix=new THREE.Matrix4(),transform=new THREE.Matrix4(),tint=new THREE.Color(),vertexTint=new THREE.Color();
const metrics=[];
for(const [index,entry] of cases.entries()){
 const avatar=makeCharacter({...DEFAULT_APPEARANCE,className:entry.className});
 animateCharacter(avatar,entry.time??0,false,entry.attack??false,entry.gathering);
 avatar.updateMatrixWorld(true);
 const rig=avatar.userData.rig,weapon=entry.gathering?avatar.getObjectByName(entry.gathering==='mining'?'pickaxe':'axe'):avatar.getObjectByName({Ranger:'bow',Knight:'sword',Mage:'staff'}[entry.className]);
 const arm=entry.className==='Ranger'&&!entry.gathering?rig.leftArm:rig.rightArm;
 const hand=arm.localToWorld(new THREE.Vector3(0,-.625,.04));
 const localGrip=new THREE.Vector3();
 if(weapon.name==='bow'){
  // Read the actual leather handle center, so moving or scaling its geometry is measured too.
  const batch=rig.bow.batch,matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();let found=false;
  for(let i=0;i<batch.count;i++){batch.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);if(scale.distanceTo(new THREE.Vector3(.082,.16,.082))<1e-5){localGrip.copy(position);found=true;break;}}
  if(!found)throw Error('Cannot identify the actual bow grip for inspection');
 }
 const grip=weapon.localToWorld(localGrip);
 const measurement={id:entry.id,hand:hand.toArray(),grip:grip.toArray(),distance:hand.distanceTo(grip)};
 if(entry.className==='Ranger'&&entry.attack){
  const bow=rig.bow,matrix=new THREE.Matrix4();bow.batch.getMatrixAt(bow.parts['string-bottom'],matrix);
  const a=new THREE.Vector3(0,-.5,0).applyMatrix4(matrix),b=new THREE.Vector3(0,.5,0).applyMatrix4(matrix);
  const nock=bow.pivot.localToWorld(Math.abs(a.y)<Math.abs(b.y)?a:b),drawHand=rig.rightArm.localToWorld(new THREE.Vector3(0,-.625,.04));
  measurement.drawHandGap=drawHand.distanceTo(nock);
 }
 metrics.push(measurement);
 const geometries=[];
 avatar.traverseVisible(node=>{
  if(!node.isMesh)return;
  const append=(matrix,instanceColor)=>{
   if(Math.abs(matrix.determinant())<1e-10)return;
   const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(matrix);
   const oldColor=geometry.getAttribute('color'),count=geometry.getAttribute('position').count,colors=new Float32Array(count*3);
   tint.copy(node.material.color);if(instanceColor)tint.multiply(instanceColor);
   for(let i=0;i<count;i++){
    vertexTint.copy(tint);if(oldColor)vertexTint.multiply(new THREE.Color(oldColor.getX(i),oldColor.getY(i),oldColor.getZ(i)));
    colors.set(vertexTint.toArray(),i*3);
   }
   for(const name of Object.keys(geometry.attributes))if(!['position','normal'].includes(name))geometry.deleteAttribute(name);
   geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometries.push(geometry);
  };
  if(node.isInstancedMesh){
   const instanceColor=new THREE.Color();
   for(let i=0;i<node.count;i++){node.getMatrixAt(i,instanceMatrix);transform.multiplyMatrices(node.matrixWorld,instanceMatrix);node.getColorAt(i,instanceColor);append(transform,instanceColor);}
  }else append(node.matrixWorld);
 });
 const baked=new THREE.Mesh(mergeGeometries(geometries),material);baked.name=`${phase}-${entry.id}`;
 baked.userData={phase,index,label:entry.label,runtimeSourceSHA256:createHash('sha256').update(source).digest('hex'),pose:entry,measurement};
 scene.add(baked);for(const geometry of geometries)geometry.dispose();
}
const output=argument('--output',`/tmp/mossvale-character-grips-${phase}.glb`);
const glb=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true});writeFileSync(output,Buffer.from(glb));
writeFileSync(`/tmp/mossvale-character-grips-${phase}.json`,JSON.stringify({phase,sourcePath,sourceSHA256:createHash('sha256').update(source).digest('hex'),metrics},null,2));
writeFileSync(`/tmp/mossvale-character-grips-${phase}.ts`,source);
console.log(`Exported ${cases.length} exact runtime snapshots to ${output} (${glb.byteLength} bytes).`);
console.log(JSON.stringify(metrics.map(row=>({pose:row.id,gripGapCm:+(row.distance*100).toFixed(1),...(row.drawHandGap==null?{}:{drawGapCm:+(row.drawHandGap*100).toFixed(1)})})),null,2));
