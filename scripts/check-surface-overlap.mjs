import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const load=async path=>{const bytes=readFileSync(path);const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;scene.updateMatrixWorld(true);return scene;};
const city=await load('public/models/city-kit.glb'),houses=await load('public/models/house-interiors.glb');
const ray=new THREE.Raycaster();let checks=0;
function surface(mesh,origin,direction,label,required=true){
  ray.set(new THREE.Vector3(...origin),new THREE.Vector3(...direction));
  const hits=Array.isArray(mesh)?ray.intersectObjects(mesh,true):ray.intersectObject(mesh,true),first=hits[0];
  if(!first){assert(!required,`${label}: the seam must not open to the sky`);return;}
  // Shared triangle edges are fine; two differently colored faces over the same area are not.
  const colors=new Set(hits.filter(hit=>Math.abs(hit.distance-first.distance)<.0005).map(hit=>{
    const color=hit.object.geometry.attributes.color;
    return ['getX','getY','getZ'].map(f=>Math.round(color[f](hit.face.a)*255)).join(',');
  }));
  assert.equal(colors.size,1,`${label}: differently colored faces compete for the same depth`);
  checks++;return first;
}

// Every section authored with the city's shared roof helper, including small dormers/cupolas.
const roofs=[
  ['gate',3.55,5.6,13.9,16.73,-4.5,0],['gate',3.55,5.6,13.9,16.73,4.5,0],
  ['auction-hall',25.2,19.1,7.17,12.72,0,0],
  ['auction-hall',3.15,2.25,11.18,12.14,-6.4,4.4],['auction-hall',3.15,2.25,11.18,12.14,6.4,4.4],
  ...['ranger','knight','mage'].map(role=>[`${role}-pavilion`,8.70,6.65,4.38,6.26,0,0]),
  ['stable',16.8,10.7,4.92,7.13,0,0],['stable',3.05,3.10,8.13,9.12,0,0],
];
for(const [kind,width,depth,base,top,cx,cz] of roofs){
  const roof=city.getObjectByName(`city-${kind}`).children.find(node=>node.userData.part==='roof-shingles');
  const tiers=Math.ceil((top-base)/.28),columns=Math.ceil(depth/.88),step=width/(tiers*2);
  for(let row=0;row<tiers;row++)for(let column=1;column<columns;column++)for(const side of [-1,1]){
    const x=cx+side*(width/2-(row+.5)*step),z=cz-depth/2+column*depth/columns;
    // The old .02m overlap covered both of these interior points.
    for(const offset of [-.004,.004])surface(roof,[x,top+3,z+offset],[0,-1,0],`${kind} row${row}/seam${column}/${side}/${offset}`);
    ray.set(new THREE.Vector3(x,top+3,z),new THREE.Vector3(0,-1,0));
    assert(ray.intersectObject(roof,true).length,`${kind}: shared tile edge remains continuous after quantization`);
  }
}

for(const model of houses.children){
  const width=model.userData.width,depth=model.userData.depth;
  for(const [part,length,wallX,wallZ,rotation] of [
    ['front',width,0,depth/2,0],['back',width,0,-depth/2,Math.PI],
    ['left',depth,-width/2,0,-Math.PI/2],['right',depth,width/2,0,Math.PI/2],
  ]){
    const wall=model.children.find(node=>node.userData.part===`shell-${part}`),glass=model.children.find(node=>node.userData.part===`shell-${part}-glass`),c=Math.cos(rotation),s=Math.sin(rotation);
    assert(glass?.material.transparent&&glass.material.opacity<=.25,'window glazing remains transparent in its separate cutaway batch');
    for(const sign of [-1,1])for(const facing of [-1,1]){
      const across=sign*length*.30,y=2.905,z=facing>0?1:-1;
      const hit=surface([wall,glass],[wallX+across*c+z*s,y,wallZ-across*s+z*c],[-facing*s,0,-facing*c],`${model.name}/${part} window${sign}/${facing}`);
      const depthAtHit=(hit.point.x-wallX)*s+(hit.point.z-wallZ)*c;
      assert(Math.abs(depthAtHit-(facing>0?.195:-.1125))<.0005,'outside upright has 2.5cm relief; inside glazing stays at its original depth');
      assert.equal(hit.object===glass,facing<0,'the exterior hits the projecting upright; the interior hits the recessed clear pane');
    }
  }
  // Existing rugs, furniture and floorboards stay at distinct depths.
  const indoor=model.clone(true);for(const child of [...indoor.children])if(/^(roof|shell)-/.test(String(child.userData.part)))indoor.remove(child);
  indoor.updateMatrixWorld(true);
  for(let x=-2.7;x<=2.8;x+=.45)for(let z=-3.3;z<=3.4;z+=.45)surface(indoor,[x,3,z],[0,-1,0],`${model.name} floor/furniture`,false);
}
const fountain=city.getObjectByName('city-fountain');
for(let x=-2.83;x<2.9;x+=.23)for(let z=-2.83;z<2.9;z+=.23)surface(fountain,[x,7,z],[0,-1,0],'fountain pool/rim',false);
console.log(`PASS: ${checks} real GLB surface probes, all 10 shared city roof sections continuous without overlapping color bands, 32 house windows from both sides, and clear floor/fountain depths.`);
