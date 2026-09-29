import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.MOSSVALE_PLAYWRIGHT || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url)), output = `${root}artifacts/referrals`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Referral model verification</title></head><body style="margin:0"><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadPetAssets,createPetModel,animatePetModel} from '/src/pet-models.ts';
import {setMountAssets,makeMount,animateMount,mountRiderOffset} from '/src/mounts.ts';
import {setCharacterRaces,setCharacterCustomization,setCharacterGear,makeCharacter,animateCharacter} from '/src/characters.ts';
import {DEFAULT_APPEARANCE} from '/src/appearance.ts';
await loadPetAssets();
const loader=new GLTFLoader();
for(const [name,setter] of [['wayfarer-stag',s=>setMountAssets(s,['wayfarer-stag'])],['race-kit',setCharacterRaces],['customization-kit',setCharacterCustomization],['gear-kit',setCharacterGear]])setter((await loader.loadAsync('/models/'+name+'.glb')).scene);
const scene=new THREE.Scene();scene.background=new THREE.Color('#172c27');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#efffe8','#567458',2));
for(const [color,intensity,position] of [['#fff1d1',3.4,[-5,10,6]],['#a2cfe0',2,[7,5,-5]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);}
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.05,100),group=new THREE.Group();scene.add(group);
const pet=createPetModel('wayfinder-sprite'),mount=makeMount('wayfarer-stag');
const riders=['orc','goblin'].map((race,i)=>{const rider=makeCharacter({...DEFAULT_APPEARANCE,race,outfit:i?'#376f8b':'#943e37'});rider.position.y=mountRiderOffset(rider,'wayfarer-stag',!!i);return rider;});
window.proof=(kind,time=0,moving=false,airborne=false,back=false)=>{
group.clear();group.add(kind==='sprite'?pet:mount);if(kind==='riders')group.add(...riders);
const jump={grounded:!airborne,velocity:4};
animatePetModel(pet,time,moving);
riders.forEach((rider,i)=>animateCharacter(rider,time,moving,false,undefined,false,{mount:'wayfarer-stag',driverId:i?'driver':undefined,jump}));
animateMount(mount,time,moving,false,kind==='riders'?riders[0]:undefined,jump);
group.updateMatrixWorld(true);const sphere=new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
camera.position.copy(sphere.center).add(new THREE.Vector3(kind==='sprite'?.25:1,.35,back?-1:.9).normalize().multiplyScalar(sphere.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.12));camera.lookAt(sphere.center);renderer.render(scene,camera);
let finite=true;group.traverse(node=>{finite&&=node.matrixWorld.elements.every(Number.isFinite)});
return {finite,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
};proof('sprite');document.body.dataset.ready='true';
</script></body></html>`;
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'referral-model-proof', configureServer(server) { server.middlewares.use('/__referral-models', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/__referral-models', html)); }); } }] });
let browser;
try {
  await mkdir(output, { recursive: true }); await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.MOSSVALE_CHROME ? { executablePath: process.env.MOSSVALE_CHROME } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } }), errors = [];
  const failed = new Promise((_, reject) => page.on('pageerror', error => { errors.push(error.message); reject(error); }));
  await Promise.race([failed, (async () => { await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__referral-models`); await page.waitForSelector('[data-ready="true"]', { timeout: 90000 }); })()]);
  for (const kind of ['sprite', 'stag', 'riders']) for (const [pose, moving, airborne, back] of [['idle',false,false,false],['moving',true,false,false],['jump',true,true,false],['back',false,false,true]]) {
    const stats = await page.evaluate(({kind,moving,airborne,back})=>proof(kind,.31,moving,airborne,back), {kind,moving,airborne,back});
    assert(stats.finite && stats.triangles > 8000, `${kind}/${pose} renders authored geometry`);
    await page.screenshot({ path: `${output}/${kind}-${pose}.png` });
  }
  assert.deepEqual(errors, []); console.log(`PASS referral models: real WebGL loading, idle/moving/jump and rear views, both rider seats. Screenshots: ${output}`);
} finally { await browser?.close(); await server.close(); }
