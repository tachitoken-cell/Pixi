import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createServer as createVite } from 'vite';

// Shipped collection renderers with local fixture state; no realm, wallet provider or transactions.
const root = fileURLToPath(new URL('../', import.meta.url)), session = `mount-ui-${process.pid}`;
const output = process.env.MOUNT_UI_SCREENSHOTS || '/tmp/mossvale-mount-ui';
await mkdir(output, { recursive: true });
const run = promisify(execFile), browser = async (...args) => (await run('npx', ['--yes', 'agent-browser', '--session', session, ...args], { cwd: root, timeout: 45000, maxBuffer: 1024 * 1024 })).stdout;
const html = String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mount collection check</title><style>body{background:#21392b}#fixture-label{position:fixed;top:4px;left:16px;color:#e4ddbf;font:12px sans-serif}#nft-trigger{position:fixed;right:8px;bottom:8px}</style></head><body><p id="fixture-label">Local mount UI fixture · simulated ownership · no wallet</p><button id="nft-trigger">NFT collections</button><dialog id="panel" class="panel" data-mode="mounts"><div class="panel-heading"><h2>Mounts &amp; pets</h2></div><div id="panel-content"></div></dialog><script type="module">
import {renderMountCollection} from '/src/pet-ui.ts';import {mountNftUI} from '/src/nft-ui.ts';import {MOUNTS,newTravel} from '/src/travel.ts';import {NFT_HOUSES,NFT_MOUNTS} from '/src/nfts.ts';import {createCollectionPreview} from '/src/collection-preview.ts';import {setMountAssets} from '/src/mounts.ts';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import '/src/style.css';import '/src/art.css';import '/src/pet-ui.css';import '/src/nft-ui.css';
window.errors=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
const loader=new GLTFLoader();for(const [path,ids] of [['mounts',['horse','wolf']],['store-collection',['store-embermane','store-cinderfang']],['verdant-revenant',['verdant-revenant']],['wayfarer-stag',['wayfarer-stag']]])setMountAssets((await loader.loadAsync('/models/'+path+'.glb')).scene,ids);
const panel=document.querySelector('#panel'),content=document.querySelector('#panel-content'),trigger=document.querySelector('#nft-trigger'),sent=[];
const base={id:'10000000-0000-4000-8000-000000000010',name:'Mount check',characterCreated:true,hp:100,level:60,ridingRank:2,ownedMounts:['horse'],nftMounts:[],nftMountsConfigured:true,nftMintableMounts:NFT_MOUNTS.map(m=>m.id),ownedPets:[],carriedItems:{'verdant-revenant':2},travel:newTravel()};
let player=structuredClone(base),selected='verdant-revenant',preview,preferred='horse';
const state=()=>({configured:true,enabled:true,chainId:4663,petsContract:'0x1111111111111111111111111111111111111111',housesContract:'0x2222222222222222222222222222222222222222',mountsContract:'0x3333333333333333333333333333333333333333',mountsEnabled:player.nftMountsConfigured,mintableMountIds:player.nftMintableMounts,feeBps:500,wallet:'0x4444444444444444444444444444444444444444',orders:[],ownedPets:[],ownedHouses:[],ownedMounts:player.nftMounts,ownershipVerified:true,houses:NFT_HOUSES.map(h=>({...h,reserveWei:'1000000000000000000',highestBidWei:'0',startsAt:Date.now(),endsAt:Date.now()+14400000,settled:false}))});
const nft=mountNftUI({getPlayer:()=>player,allowed:()=>true,onOpen:()=>{preview?.dispose();preview=null;panel.close();},trigger,send:message=>{sent.push(message);if(message.type==='nftOpen')queueMicrotask(()=>nft.update(state()));}});
function render(){preview?.dispose();content.innerHTML=renderMountCollection(player,true,selected,preferred,true);const canvas=document.querySelector('#collection-preview');preview=createCollectionPreview(canvas);preview.show('mounts',selected);}
function show(changes={}){nft.close();player={...structuredClone(base),...changes};selected='verdant-revenant';panel.show();render();}
content.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;const data=button.dataset;if(data.collectionSelect){selected=data.collectionSelect;render();}else if(data.collectionRotate)preview.rotate(Number(data.collectionRotate)*Math.PI/8);else if(data.claimNftMount)nft.openMount(data.claimNftMount);else if(data.learnMount){sent.push({type:'learnMount',mount:data.learnMount});player.ownedMounts.push(data.learnMount);player.carriedItems[data.learnMount]--;render();}else if(data.preferMount){preferred=data.preferMount;render();}});
trigger.onclick=()=>nft.open();window.fixture={show,player:()=>player,sent:()=>sent};show();window.ready=true;
</script></body></html>`;
let vite;
const server = createServer(async (req, res) => { if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml('/', html)); } else vite.middlewares(req, res, () => { res.statusCode = 404; res.end(); }); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
vite = await createVite({ root, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null } });
const evaluate = async code => JSON.parse(await browser('eval', `(()=>{const check=(value,message)=>{if(!value)throw Error(message)};${code}})()`));
const capture = name => browser('screenshot', `${output}/${name}.png`);
try {
  await browser('set', 'viewport', '1366', '900');
  await browser('open', `http://127.0.0.1:${server.address().port}`);
  await browser('wait', '--fn', 'window.ready === true');
  await browser('snapshot', '-i');
  await evaluate(`check(document.body.innerText.includes('Verdant Revenant'),'journal has content');check(!document.querySelector('vite-error-overlay'),'no Vite overlay');check(errors.length===0,errors.join('; '));return true;`);
  for (const [name, width, height] of [['desktop',1366,900],['mobile',390,844]]) {
    await browser('set','viewport',String(width),String(height));
    await evaluate(`fixture.show();return true;`);
    await browser('wait','--fn',"document.querySelector('.collection-stage').classList.contains('is-ready')");
    await browser('click','[data-collection-select="horse"]');
    await evaluate(`check(!document.querySelector('[data-claim-nft-mount]'),'vendor mount has no mint action');return true;`);
    await browser('click','[data-collection-select="verdant-revenant"]');
    await evaluate(`const panel=document.querySelector('#panel'),learn=document.querySelector('[data-learn-mount]'),mint=document.querySelector('[data-claim-nft-mount]');check(!learn.disabled&&!mint.disabled,'learn and mint are available');check(panel.scrollWidth<=panel.clientWidth+1,'journal has no horizontal overflow');check([...document.querySelectorAll('.collection-entry img')].every(img=>img.complete&&img.naturalWidth>0),'mount portraits load');return true;`);
    await capture(`mount-journal-${name}`);
    await browser('click','[data-claim-nft-mount="verdant-revenant"]');
    await browser('wait','--fn',"!!document.querySelector('[data-nft-mint]')");
    await evaluate(`const box=document.querySelector('#nft-window'),review=document.querySelector('[data-nft-review]');check(review.innerText.includes('Mossvale Mounts')&&review.innerText.includes('0x3333333333333333333333333333333333333333'),'review identifies separate mount collection');check(review.innerText.includes('mount drop stays in your bag'),'review keeps item until mint');check(box.scrollWidth<=box.clientWidth+1,'NFT panel has no horizontal overflow');check(!fixture.sent().some(m=>m.type==='nftClaimMount'),'review never reserves or requests a wallet');return true;`);
    await capture(`mount-nft-review-${name}`);
    await browser('press','Escape');
    await evaluate(`check(document.querySelector('#nft-window').hidden,'Escape closes NFT review');fixture.show();return true;`);
    await browser('click','[data-learn-mount="verdant-revenant"]');
    await evaluate(`check(fixture.player().carriedItems['verdant-revenant']===1,'learn consumes one fixture copy');check(fixture.sent().at(-1).type==='learnMount','learn action selected');check(document.querySelector('[data-claim-nft-mount]').textContent.includes('Convert learned mount'),'learned source displayed');return true;`);
    await browser('click','[data-claim-nft-mount="verdant-revenant"]');
    await browser('wait','--fn',"document.querySelector('[data-nft-review]')?.innerText.includes('removes its character unlock')");
    await capture(`mount-nft-conversion-${name}`);
    await evaluate(`fixture.show({ownedMounts:[],nftMounts:['verdant-revenant'],carriedItems:{}});check(!document.querySelector('[data-ride-mount]').disabled,'NFT ownership enables riding');fixture.show({ownedMounts:[],nftMounts:[],carriedItems:{}});check(document.querySelector('[data-ride-mount]').disabled,'transferred NFT removes riding');fixture.show({nftMountsConfigured:false});check(document.querySelector('[data-claim-nft-mount]').disabled&&!document.querySelector('[data-learn-mount]').disabled,'disabled NFT collection leaves learning available');check(errors.length===0,errors.join('; '));return true;`);
  }
  console.log(`PASS real Chromium desktop + mobile mount journal, 3D assets, vendor exclusion, learning, separate NFT drop/conversion review, Escape recovery, ownership changes, no overflow/errors. Screenshots: ${output}`);
} catch (error) { console.error(await browser('errors').catch(String)); console.error(await browser('eval', 'JSON.stringify({errors:window.errors,body:document.body.innerText,overlay:document.querySelector("vite-error-overlay")?.textContent})').catch(String)); await capture('mount-ui-error').catch(()=>{}); throw error; } finally { await browser('close').catch(()=>{}); await vite.close(); await new Promise(resolve=>server.close(resolve)); }
