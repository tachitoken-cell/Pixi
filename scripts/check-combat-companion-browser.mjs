import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';

// Render real client modules with isolated snapshot fixtures; no realm or saved account is touched.
const root = fileURLToPath(new URL('../', import.meta.url)), session = `companion-proof-${process.pid}`;
const output = process.env.COMPANION_PROOF_DIR || '/tmp/mossvale-talent-redesign-proof';
await mkdir(output, { recursive: true });
const run = promisify(execFile), browser = async (...args) => (await run('npx', ['--yes', 'agent-browser', '--session', session, ...args], { cwd: root, timeout: 45000, maxBuffer: 1024 * 1024 })).stdout;
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Talent and companion client proof</title>
<style>body{margin:0;background:#263e32}#proof-tools{position:fixed;bottom:12px;left:24px;right:24px;z-index:10000;display:flex;gap:8px;flex-wrap:wrap}#proof-tools button{padding:8px;background:#ecebd5;color:#304730}#companion-stage{position:fixed;right:0;bottom:0;width:38vw;height:70vh}#proof-note{position:fixed;right:16px;bottom:16px;color:#eae7c4;max-width:30vw;font:13px sans-serif}@media(max-width:700px){#companion-stage{display:none}#proof-note{display:none}}</style></head><body>
<nav id="proof-tools"><button data-mode="pets">Pets</button><button data-class="Ranger">Ranger</button><button data-class="Knight">Knight</button><button data-class="Mage">Mage</button><button data-class="Cleric">Cleric</button></nav>
<canvas id="companion-stage"></canvas><p id="proof-note">Isolated client fixture · actual Bramble wolf companion rig</p><dialog id="panel" class="panel"><div class="panel-heading"><h2 id="panel-title">Your pets</h2></div><div id="panel-content"></div></dialog>
<script type="module">
import '/src/progression.css';import '/src/style.css';import '/src/art.css';import '/src/character-bags.css';import '/src/pet-ui.css';
import * as THREE from 'three';import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setMonsterAssets } from '/src/monster-models.ts';import { createCombatCompanions } from '/src/combat-companion-models.ts';
import { renderPetCollection } from '/src/pet-ui.ts';import { renderTalents } from '/src/progression-ui.ts';import { starterGear } from '/src/progression.ts';import { mountTalentHover } from '/src/talent-hover.ts';
window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.player={id:'client-proof',name:'Companion proof',level:60,hp:900,maxHp:900,gold:500,appearance:{className:'Ranger'},talents:['ranger-beastmaster','ranger-everlasting-bond'],ownedPets:['moss-fox'],summonedPet:'moss-fox',carriedItems:{},travel:{mount:null},tamedCompanion:{kind:'bramble-wolf',level:20,hp:160},combatCompanion:{kind:'bramble-wolf',level:20,hp:160,maxHp:328,x:0,z:0,rotation:.4,attackUntil:0,targetId:null,bondReady:true},...starterGear('Ranger')};
const panel=document.querySelector('#panel'),content=document.querySelector('#panel-content'),refreshHover=mountTalentHover(content);
window.show=(mode='pets',className='Ranger')=>{const details=[...content.querySelectorAll('details[id]')].map(detail=>[detail.id,detail.open]);panel.dataset.mode=mode;player.appearance.className=className;document.querySelector('#panel-title').textContent=mode==='pets'?'Your pets':className+' talents';content.innerHTML=mode==='pets'?renderPetCollection(player,true,1000):renderTalents({...player,talents:className==='Ranger'?player.talents:[]});for(const [id,open]of details){const detail=document.getElementById(id);if(detail)detail.open=open;}content.scrollTop=0;panel.scrollTop=0;refreshHover();};
document.querySelector('#proof-tools').onclick=e=>{const button=e.target.closest('button');if(button)show(button.dataset.class?'talents':'pets',button.dataset.class);};
content.onclick=e=>{const button=e.target.closest('[data-combat-companion]');if(!button||button.disabled)return;window.lastAction=button.dataset.combatCompanion;if(lastAction==='dismiss')player.combatCompanion=null;else player.combatCompanion={...player.tamedCompanion,maxHp:328,x:0,z:0,rotation:.4,attackUntil:0,targetId:null,bondReady:false};show();};
panel.show();show();
const asset=await new GLTFLoader().loadAsync('/models/monster-kit.glb');setMonsterAssets(asset.scene,asset.animations);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,30),canvas=document.querySelector('#companion-stage'),renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.setPixelRatio(1.5);camera.position.set(3,2.4,4);camera.lookAt(0,.7,0);scene.add(new THREE.HemisphereLight(0xf5eed8,0x4f6946,3));const light=new THREE.DirectionalLight(0xffdfad,3);light.position.set(4,5,2);scene.add(light);const companions=createCombatCompanions(scene,()=>0);window.companions=companions;
function frame(time){requestAnimationFrame(frame);const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();companions.update([player],.016,time/1000,1000);renderer.render(scene,camera);}requestAnimationFrame(frame);window.ready=true;
</script></body></html>`;
let vite;
const server = createServer(async (req, res) => { if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml('/', html)); } else vite.middlewares(req, res, () => { res.statusCode = 404; res.end(); }); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
vite = await createVite({ root, cacheDir: `${output}/cache-${session}`, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: { server, clientPort: server.address().port } } });
const capture = async name => {
  await browser('eval', `(async()=>{await document.fonts.ready;const urls=new Set([...document.querySelectorAll('.item-art,.talent-branch')].flatMap(el=>[getComputedStyle(el).backgroundImage,getComputedStyle(el,'::before').borderImageSource]).flatMap(text=>[...text.matchAll(/url\\([\"']?([^\"')]+)[\"']?\\)/g)].map(match=>match[1])));await Promise.all([...urls].map(src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(Error('Missing icon artwork: '+src));image.src=src;})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;})()`);
  await browser('screenshot', `${output}/${name}.png`);
};
const evaluate = code => browser('eval', `(()=>{const check=(value,message)=>{if(!value)throw Error(message)};${code};return 'PASS';})()`);
try {
  await browser('set', 'viewport', '1365', '1000'); await browser('open', `http://127.0.0.1:${server.address().port}`); await browser('wait', '--fn', 'window.ready === true');
  console.log(await browser('snapshot', '-i'));
  if (!process.argv.includes('--mobile-only')) {
  await evaluate(`check(companions.size===1,'combat companion rig renders');check(document.querySelector('meter').value===160,'HP is visible and accessible');check(document.querySelector('[data-combat-companion]').textContent==='Dismiss companion','active pet can be dismissed');`);
  await capture('pets-desktop');
  await browser('click', '[data-combat-companion="dismiss"]'); await evaluate(`check(lastAction==='dismiss','dismiss control fires');check(document.querySelector('[data-combat-companion="recall"]'),'resting companion can be recalled');`);
  await browser('click', '[data-combat-companion="recall"]'); await evaluate(`check(lastAction==='recall','recall control fires');player.combatCompanion=null;player.combatCompanionRecallAt=6000;show();check(document.querySelector('[data-combat-companion]').disabled,'combat blocks recall');player.combatCompanionRecallAt=0;player.tamedCompanion.hp=0;show();check(document.querySelector('[data-combat-companion]').textContent.includes('Revive'),'defeated pet can be revived');`);
  await capture('pets-defeated');
  for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
    await browser('click', `[data-class="${className}"]`);
    await evaluate(`check(document.querySelectorAll('.talent-branch').length===3,'three class trees');for(const node of document.querySelectorAll('.talent-node')){const a=node.getBoundingClientRect(),b=node.closest('.talent-tree').getBoundingClientRect();check(a.left>=b.left-1&&a.right<=b.right+1,'talent stays in tree');}`);
    await browser('wait', '--fn', 'Array.from(document.images).every(image => image.complete && image.naturalWidth > 0)');
    await capture(`talents-${className.toLowerCase()}`);
  }
  }
  await browser('set', 'viewport', '390', '844'); await evaluate(`document.body.classList.add('mobile-controls');show('pets');`);
  await evaluate(`const r=document.querySelector('#panel').getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth,'Pets fits mobile');check(document.querySelector('#panel-content').scrollWidth<=document.querySelector('#panel-content').clientWidth,'Pets has no horizontal overflow');`);
  await capture('pets-mobile');
  await browser('click', '[data-class="Ranger"]'); await evaluate(`const content=document.querySelector('#panel-content');check(getComputedStyle(content).overflowX==='auto'&&(content.scrollWidth>content.clientWidth||content.scrollHeight>content.clientHeight),'mobile talent trees scroll within their panel');`); await capture('talents-ranger-mobile');
  await evaluate(`check(errors.length===0,errors.join(' | '));`);
  assert.equal((await browser('errors')).trim(), '', 'no browser exceptions');
  console.log(`PASS: companion client browser proof. Screenshots: ${output}`);
} catch (error) {
  console.error(await browser('errors').catch(() => ''));
  console.error(await browser('console').catch(() => ''));
  console.error(await browser('eval', '({ready:window.ready,errors:window.errors,body:document.body.innerText.slice(0,1200)})').catch(() => ''));
  throw error;
} finally {
  await browser('close').catch(() => {}); await vite.close(); await new Promise(resolve => server.close(resolve)); await rm(`${output}/cache-${session}`, { recursive: true, force: true });
}
