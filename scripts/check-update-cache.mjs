import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extname } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { createHostingConfig } from '../src/hosting-realms.ts';
import { parseAppUpdatePolicy } from '../mobile/app-update.ts';

const files=['/','/assets/game.js','/assets/game.css','/models/hero.glb','/animations/benji-upgrade-poses.json','/ui/wordmark.png','/ui/instant-combat/bone-pit.webp'];
const template=readFileSync(new URL('./service-worker.js',import.meta.url),'utf8');
const serverSource=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const mime=runInNewContext('('+serverSource.match(/  const mime = (\{[^\n]+\});/)[1]+')');
const config={keycloak:{url:'https://identity.example',realm:'mossvale',clientId:'browser'}};
const body=path=>path==='/api/config'?JSON.stringify(config):path==='/'?'<title>Mossvale</title>installed build':`installed ${path}`;
const worker=(name,assets=files,contents={})=>template.replace('__BUILD__',name).replace('__FILES__',JSON.stringify(Object.fromEntries(assets.map(path=>[path,createHash('sha256').update(contents[path]??body(path)).digest('hex')]))));
const source=worker('current');
function fixture({workerSource=source,stores=new Map(),registration={installing:null,waiting:null},origin='https://mossvale.example',contents={},timeoutMs}={}){
 const handlers={},calls=[];let claimCount=0,skipCount=0,unregisterCount=0,active=0,peak=0;
 registration.unregister=async()=>{unregisterCount++;return true;};
 const response=path=>new Response(contents[path]??body(path),{headers:{'Content-Type':path==='/api/config'?'application/json':mime[extname(path==='/'?'/index.html':path)]||'application/octet-stream'}});
 let network=async path=>response(path);
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const values=stores.get(name);return {async put(path,value){values.set(path,value.clone());},async match(path){return values.get(path)?.clone();},async delete(path){return values.delete(path);}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
 runInNewContext(workerSource,{self:{registration,location:new URL(origin),addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>claimCount++},skipWaiting:async()=>skipCount++},caches,URL,Response,AbortSignal:timeoutMs?{any:AbortSignal.any,timeout:()=>AbortSignal.timeout(timeoutMs)}:AbortSignal,AbortController,crypto:webcrypto,
  fetch:async(input,options)=>{const path=typeof input==='string'?input:new URL(input.url).pathname;calls.push({input:typeof input==='string'?input:input.url,options});active++;peak=Math.max(peak,active);try{return await network(path,options);}finally{active--;}}});
 const lifecycle=async name=>{let completion;handlers[name]({waitUntil:promise=>completion=promise});assert(completion);return completion;};
 const request=(path,extra={})=>{if(!handlers.fetch)return;let response;handlers.fetch({request:{url:new URL(path,origin).href,method:'GET',mode:'cors',headers:new Headers(),...extra},respondWith:promise=>response=promise});return response;};
 const message=data=>{let completion;handlers.message({data,waitUntil:promise=>completion=promise});return completion;};
 return {stores,calls,caches,response,lifecycle,request,message,get unregisterCount(){return unregisterCount;},get skipCount(){return skipCount;},setNetwork:fn=>network=fn,get peak(){return peak;},get claimCount(){return claimCount;}};
}
// The first game visit already downloaded its shell; reuse those HTTP-cache bytes.
{
 const first=fixture(),httpCache=new Map(files.map(path=>[path,first.response(path)]));let downloaded=0;
 first.setNetwork(async(path,{cache})=>{
  if(cache==='force-cache'&&httpCache.has(path))return httpCache.get(path).clone();
  const response=first.response(path);downloaded+=(await response.clone().arrayBuffer()).byteLength;return response;
 });
 await first.lifecycle('install');
 assert.equal(downloaded,Buffer.byteLength(body('/api/config')),'verified startup assets are not downloaded a second time');
 assert(first.calls.filter(call=>files.includes(call.input)).every(call=>call.options.cache==='force-cache'));
 assert.equal(first.calls.find(call=>call.input==='/api/config').options.cache,'reload','public configuration must bypass the HTTP cache');
 await first.lifecycle('activate');first.setNetwork(async()=>{throw Error('offline');});
 for(const path of files)assert.equal(await(await first.request(path)).text(),body(path),'HTTP-cache reuse still installs the complete offline shell');
}
// Old HTTP-cache bodies, MIME metadata and cached errors each get one fresh repair.
for(const cached of ['body','mime','missing']){
 const repaired=fixture(),path='/models/hero.glb';
 repaired.setNetwork(async(request,{cache})=>request!==path||cache==='reload'?repaired.response(request):
  cached==='body'?new Response('old model',{headers:{'Content-Type':'model/gltf-binary'}}):
  cached==='mime'?new Response(body(path),{headers:{'Content-Type':'application/octet-stream'}}):new Response('not found',{status:404}));
 await repaired.lifecycle('install');
 assert.deepEqual(repaired.calls.filter(call=>call.input===path).map(call=>call.options.cache),['force-cache','reload'],`${cached} receives exactly one HTTP-cache-bypassing repair`);
 assert.equal(await repaired.stores.get('mossvale-shell-current').get(path).clone().text(),body(path),'only repaired build bytes enter Cache Storage');
}
// Use the server's real MIME map: correctly hashed WebP bytes must install as images.
{
 const images=fixture();
 await assert.doesNotReject(images.lifecycle('install'),'the production MIME map must allow every shell dependency, including WebP, to install');
 assert.equal(images.response('/ui/instant-combat/bone-pit.webp').headers.get('Content-Type'),'image/webp');
 assert.equal(images.response('/animations/benji-upgrade-poses.json').headers.get('Content-Type'),'application/json');
 assert.equal(await(await images.request('/animations/benji-upgrade-poses.json')).text(),body('/animations/benji-upgrade-poses.json'),'authored motion stays in the verified same-build shell');
 const wrongType=fixture();wrongType.setNetwork(async path=>path.endsWith('.webp')?new Response(body(path),{headers:{'Content-Type':'application/octet-stream'}}):wrongType.response(path));
 await assert.rejects(wrongType.lifecycle('install'),/Incomplete game update/,'correct hashes cannot excuse a non-image MIME type');
}
// A MIME repair at the same URL must recover even when the separate HTTP cache retains old headers.
{
 const stores=new Map(),oldFiles=['/','/assets/game-OLD12345.js'],oldContents={'/':'<title>Mossvale</title>old build'};
 const old=fixture({workerSource:worker('old',oldFiles,oldContents),stores,contents:oldContents});
 await old.lifecycle('install');await old.lifecycle('activate');
 const contents={'/':'<title>Mossvale</title>repaired build'},image='/ui/instant-combat/bone-pit.webp';
 const partial=fixture({stores,contents,workerSource:worker('current',files,contents)});
 let originRepaired=false,httpCachedImage;
 const network=client=>async(path,{cache})=>{
  if(path!==image)return client.response(path);
  // Model unchanged image bytes revalidated against a cached response with the former MIME header.
  if(httpCachedImage&&cache==='force-cache')return httpCachedImage.clone();
  const response=originRepaired?client.response(path):new Response(body(path),{headers:{'Content-Type':'application/octet-stream'}});
  httpCachedImage=response.clone();return response;
 };
 partial.setNetwork(network(partial));
 await assert.rejects(partial.lifecycle('install'),/Incomplete game update/);
 const candidate=stores.get('mossvale-shell-current'),saved=files.filter(path=>candidate.has(path));
 assert(saved.length>0,'the failed update retains verified partial downloads');
 assert(!candidate.has(image),'wrong MIME metadata never enters the verified candidate');
 assert.equal(partial.claimCount,0);assert.equal(partial.skipCount,0);
 assert.equal(await(await old.request('/',{mode:'navigate'})).text(),oldContents['/'],'failed installation leaves ordinary navigation on the old working shell');
 originRepaired=true;
 const resumed=fixture({stores,contents,workerSource:worker('current',files,contents)});
 resumed.setNetwork(network(resumed));await resumed.lifecycle('install');
 assert(saved.every(path=>!resumed.calls.some(call=>call.input===path)),'HTTP-cache recovery still reuses verified candidate files');
 assert.deepEqual(resumed.calls.filter(call=>call.input===image).map(call=>call.options.cache),['force-cache','reload'],'stale HTTP-cache metadata triggers one fresh repair');
 assert.equal(candidate.get(image).headers.get('Content-Type'),'image/webp');
 assert.equal(httpCachedImage.headers.get('Content-Type'),'image/webp','the fresh response replaces stale HTTP-cache metadata');
 assert.equal((await candidate.get('/__mossvale_shell__').clone().json()).complete,true);
 await resumed.lifecycle('activate');resumed.setNetwork(async()=>{throw Error('offline');});
 assert.equal(await(await resumed.request('/',{mode:'navigate'})).text(),contents['/'],'normal navigation stays on the repaired shell after activation');
}
// An interrupted candidate keeps verified files and resumes without redownloading them.
{
 const stores=new Map(),partial=fixture({stores});let attempts=0;
 partial.setNetwork(async path=>{if(path==='/api/config'){attempts++;throw Error('connection interrupted');}return partial.response(path);});
 await assert.rejects(partial.lifecycle('install'),/connection interrupted/);
 assert(stores.has('mossvale-shell-current'),'an interrupted update retains its verified candidate files');
 const saved=[...stores.get('mossvale-shell-current').keys()].filter(path=>files.includes(path));
 assert(saved.length>0,'some verified downloads completed before the interruption');
 assert.equal(attempts,2,'transient downloads have a bounded retry');
 assert.equal(partial.claimCount,0);assert.equal(partial.skipCount,0);
 const resumed=fixture({stores});await resumed.lifecycle('install');
 assert(saved.every(path=>!resumed.calls.some(call=>call.input===path)),'retry reuses the verified candidate files');
 assert.equal(resumed.calls.filter(call=>call.input==='/api/config').length,1,'public settings are always refreshed');
}
// Transient failures retry once; invalid fresh bytes/types remain a hard failure.
{
 const retry=fixture();let requests=0;
 retry.setNetwork(async path=>path==='/models/hero.glb'&&requests++===0?new Response('temporary',{status:503}):retry.response(path));
 await retry.lifecycle('install');assert.equal(requests,2);
 const corrupt=fixture(),candidate=await corrupt.caches.open('mossvale-shell-current');
 await candidate.put('/models/hero.glb',new Response('corrupt',{headers:{'Content-Type':'model/gltf-binary'}}));
 await corrupt.lifecycle('install');assert.equal(corrupt.calls.filter(call=>call.input==='/models/hero.glb').length,1,'candidate cache bytes are verified again before reuse');
}
// Headers do not finish an asset download: a stalled body times out and stays resumable.
{
 const stalled=fixture({timeoutMs:50});let requests=0;
 stalled.setNetwork(async(path,{signal})=>{
  if(path!=='/models/hero.glb')return stalled.response(path);
  requests++;
  return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('partial model'));signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});}}),{headers:{'Content-Type':'model/gltf-binary'}});
 });
 const alive=setTimeout(()=>{},2000);
 try {await assert.rejects(stalled.lifecycle('install'));} finally {clearTimeout(alive);}
 assert.equal(requests,2,'body timeouts are bounded to two attempts');
 assert(!stalled.stores.get('mossvale-shell-current').has('/models/hero.glb'),'partial streamed bytes cannot enter the candidate cache');
 assert.equal((await stalled.stores.get('mossvale-shell-current').get('/__mossvale_shell__').clone().json()).complete,false);
 stalled.setNetwork(async path=>stalled.response(path));await stalled.lifecycle('install');
 assert.equal((await stalled.stores.get('mossvale-shell-current').get('/__mossvale_shell__').clone().json()).complete,true,'only every verified dependency makes the candidate complete');
}
// A marked partial cache is never mistaken for the active legacy predecessor.
{
 const stores=new Map(),partial=fixture({workerSource:worker('partial'),stores});
 partial.setNetwork(async path=>path==='/api/config'?Promise.reject(Error('offline')):partial.response(path));
 await assert.rejects(partial.lifecycle('install'));
 const legacy=fixture({workerSource:worker('legacy'),stores});await legacy.lifecycle('install');
 // Legacy workers have no completion/generation metadata.
 await (await legacy.caches.open('mossvale-shell-legacy')).delete('/__mossvale_shell__');
 const newest=fixture({workerSource:worker('newest'),stores});await newest.lifecycle('install');await newest.lifecycle('activate');
 assert.equal((await stores.get('mossvale-shell-newest').get('/__mossvale_shell__').clone().json()).previous,'mossvale-shell-legacy');
 assert(stores.has('mossvale-shell-legacy'));assert(!stores.has('mossvale-shell-partial'));
}
// Reproduce a previously cached game on the new account hostname, then retire it.
const accountOrigin='https://account.mossvale.world';
const oldAccount=fixture({origin:accountOrigin,workerSource:source.slice(source.indexOf('// Immutable'),source.lastIndexOf('\n}'))});
await oldAccount.lifecycle('install');await oldAccount.lifecycle('activate');
oldAccount.setNetwork(async path=>path==='/'?new Response('<title>Your account · Mossvale</title>',{headers:{'Content-Type':'text/html'}}):oldAccount.response(path));
assert.match(await(await oldAccount.request('/',{mode:'navigate'})).text(),/installed build/,'old worker reproduces the account callback opening its cached game');
const retiring=fixture({origin:accountOrigin,stores:oldAccount.stores});
await retiring.caches.open('unrelated-account-cache');await retiring.lifecycle('install');await retiring.lifecycle('activate');
assert.equal(retiring.skipCount,1);assert.equal(retiring.claimCount,1);assert.equal(retiring.unregisterCount,1);
assert.deepEqual(await retiring.caches.keys(),['unrelated-account-cache']);
assert.equal(retiring.request('/',{mode:'navigate'}),undefined,'account documents always reach the network after retirement');
assert.equal(retiring.request('/account.html'),undefined);
assert.equal(retiring.request('/api/config'),undefined);
const f=fixture();await f.caches.open('mossvale-shell-previous');await f.caches.open('unrelated-app');await f.lifecycle('install');
assert.deepEqual([...f.stores.get('mossvale-shell-current').keys()].sort(),[...files,'/api/config','/__mossvale_shell__'].sort(),'installation saves every public shell dependency and only public identity configuration');
assert(f.peak<=4&&f.peak>1,'installation uses bounded parallel downloads');assert.equal(f.claimCount,0);assert.equal(f.skipCount,0,'installation never forces activation');assert(f.stores.has('mossvale-shell-previous'),'installation retains the working previous build');
await f.lifecycle('activate');assert.equal(f.claimCount,1);assert(f.stores.has('mossvale-shell-previous'),'activation retains one predecessor for running tabs');assert(f.stores.has('unrelated-app'),'activation only deletes this game’s obsolete shell caches');
for(const data of [null,{},'ACTIVATE_UPDATE',{type:'UNKNOWN'},{type:'ACTIVATE_UPDATE',extra:true}])assert.equal(f.message(data),undefined);
assert.equal(f.skipCount,0,'malformed messages cannot force activation');await f.message({type:'ACTIVATE_UPDATE'});assert.equal(f.skipCount,1,'only the explicit activation command skips waiting');
assert.doesNotMatch(readFileSync(new URL('../vite.config.js',import.meta.url),'utf8'),/serviceWorker\.register|transformIndexHtml/,'wallet and other HTML entries do not receive the legacy registration snippet');
const first=fixture();await first.lifecycle('install');assert.equal(first.skipCount,0);await first.lifecycle('activate');
assert.equal(first.claimCount,1);assert.equal(first.skipCount,0,'a first install follows normal browser activation without skipWaiting');
assert.deepEqual(await(first.stores.get('mossvale-shell-current').get('/__mossvale_shell__').clone().json()),{generation:1,previous:null});
// A completed waiting build is newer in CacheStorage, but has never controlled the old tabs.
const oldFiles=['/','/assets/game-OLD12345.js','/assets/game-OLD12345.css'];
const version=(name,assets,stores,registration,contents={})=>fixture({registration,workerSource:worker(name,assets,contents),stores,contents});
// Content hashes reuse both legacy and new caches without trusting filenames alone.
{
 const stores=new Map(),legacy=fixture({stores}),cache=await legacy.caches.open('mossvale-shell-legacy');
 for(const path of [...files,'/api/config'])await cache.put(path,legacy.response(path));
 const migrated=version('migrated',files,stores);await migrated.lifecycle('install');await migrated.lifecycle('activate');
 assert.deepEqual(migrated.calls.map(call=>call.input),['/api/config'],'the first incremental release reuses verified legacy bytes, avoiding another full download');
 const changedFiles=files.map(path=>path==='/assets/game.js'?'/assets/game-NEW12345.js':path),contents={'/':'<title>Mossvale</title>new build'};
 const changed=version('changed',changedFiles,stores,undefined,contents);await changed.lifecycle('install');
 assert.deepEqual(changed.calls.map(call=>call.input).sort(),['/','/assets/game-NEW12345.js','/api/config'].sort(),'a code update downloads only its changed HTML/script and fresh public settings');
 assert.equal(await(await migrated.request('/models/hero.glb')).text(),body('/models/hero.glb'),'a waiting update preserves the running model');
 await changed.lifecycle('activate');
 const nextContents={...contents,'/models/hero.glb':'changed model bytes'};
 const modelUpdate=version('model',changedFiles,stores,undefined,nextContents);await modelUpdate.lifecycle('install');
 assert.deepEqual(modelUpdate.calls.map(call=>call.input).sort(),['/models/hero.glb','/api/config'].sort(),'an asset changed at the same URL must download again');
 assert.equal(await(await modelUpdate.caches.open('mossvale-shell-model')).match('/models/hero.glb').then(response=>response.text()),'changed model bytes');
 // A valid Content-Type is insufficient when a deployment or interrupted proxy returns old bytes.
 const broken=version('broken',changedFiles,stores,undefined,{...nextContents,'/models/hero.glb':'newer model bytes'});
 broken.setNetwork(async path=>path==='/models/hero.glb'?modelUpdate.response(path):broken.response(path));
 await assert.rejects(broken.lifecycle('install'),/Incomplete game update/);
 assert(!stores.get('mossvale-shell-broken').has('/models/hero.glb'),'a hash mismatch is never saved in the resumable candidate');
 assert.equal((await stores.get('mossvale-shell-broken').get('/__mossvale_shell__').clone().json()).complete,false);
 assert(stores.has('mossvale-shell-changed'),'hash mismatch keeps the active predecessor intact');
 assert.equal(broken.skipCount,0);
}
{
 const stores=new Map(),legacy=fixture({stores}),cache=await legacy.caches.open('mossvale-shell-legacy');
 for(const path of files)await cache.put(path,legacy.response(path));
 await cache.put('/models/hero.glb',new Response('corrupt cached model',{headers:{'Content-Type':'model/gltf-binary'}}));
 const repaired=version('repaired',files,stores);await repaired.lifecycle('install');
 assert.deepEqual(repaired.calls.map(call=>call.input).sort(),['/models/hero.glb','/api/config'].sort(),'a corrupt cached file is repaired while other unchanged assets are reused');
}
for(const marked of [true,false]){
 const stores=new Map(),old=version('old',oldFiles,stores);await old.lifecycle('install');if(marked)await old.lifecycle('activate');
 const waiting=version('skipped',['/','/assets/game-SKIP1234.js'],stores);await waiting.lifecycle('install');
 await old.caches.open('unrelated-game');const current=version('new',files,stores);await current.lifecycle('install');
 assert.equal(current.skipCount,0);await current.message({type:'ACTIVATE_UPDATE'});assert.equal(current.claimCount,0,'skipWaiting does not bypass the browser activation lifecycle');await current.lifecycle('activate');
 assert.deepEqual([...stores.keys()].filter(key=>key.startsWith('mossvale-shell-')).sort(),['mossvale-shell-new','mossvale-shell-old'],'retain the active or legacy predecessor, not an unused waiting cache');
 assert(stores.has('unrelated-game'));
 // A worker restart has no in-memory activation state; its retained-cache pointer remains usable.
 const resumed=version('new',files,stores);resumed.setNetwork(async()=>new Response('gone',{status:404}));
 for(const path of oldFiles.slice(1))assert.equal(await(await resumed.request(path)).text(),`installed ${path}`,'exact previous hashed JS/CSS survives network 404 after activation and worker restart');
 for(const [path,extra] of [
  ['/assets/game-OLD12345.js?token=private',{}],['/assets/game-OLD12345.css?token=private',{mode:'navigate'}],
  ['/assets/game-OLD12345.js',{headers:new Headers({Authorization:'Bearer private'})}],['/assets/game-OLD12345.js',{method:'POST'}],
  ['https://other.example/assets/game-OLD12345.js',{}],['/assets/old.js',{}],['/assets/game-OLD12345.js.map',{}],['/models/old.glb',{}],['/ui/old.png',{}],['/__mossvale_shell__',{}],
 ])assert.equal(resumed.request(path,extra),undefined,'previous-build fallback never expands beyond unauthenticated same-origin exact hashed script/style paths');
 const future=await resumed.caches.open('mossvale-shell-future');await future.put('/assets/other-MISS1234.js',resumed.response('/assets/other-MISS1234.js'));
 const foreign=await resumed.caches.open('unrelated-game');await foreign.put('/assets/other-MISS1234.js',resumed.response('/assets/other-MISS1234.js'));
 for(const path of ['/assets/other-MISS1234.js','/assets/renamed-OLD12345.js'])assert.equal((await resumed.request(path)).status,404,'a missing exact predecessor key never reads unrelated or waiting caches');
 const next=version('next',files,stores);await next.lifecycle('install');await next.lifecycle('activate');
 assert.deepEqual([...stores.keys()].filter(key=>key.startsWith('mossvale-shell-')).sort(),['mossvale-shell-new','mossvale-shell-next'],'only the most recently activated predecessor survives the next update');
 assert.deepEqual(await stores.get('mossvale-shell-next').get('/__mossvale_shell__').clone().json(),{generation:marked?3:2,previous:'mossvale-shell-new'},'monotonic generations do not rely on wall-clock time or cache creation order');
}
// Activation can overlap the next update's installation or waiting state.
for(const phase of ['installing','waiting']){
 const stores=new Map(),registration={installing:null,waiting:null};
 const active=version('active',oldFiles,stores,registration);await active.lifecycle('install');await active.lifecycle('activate');
 const activating=version('activating',files,stores,registration);await activating.lifecycle('install');
 const successor=version('successor',files,stores,registration);let release,entered;
 const blocked=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 successor.setNetwork(async path=>{if(path==='/api/config'){entered();await blocked;}return successor.response(path);});
 registration.installing={};const installing=successor.lifecycle('install');await started;
 if(phase==='waiting'){release();await installing;registration.installing=null;registration.waiting={};}
 await activating.lifecycle('activate');assert(stores.has('mossvale-shell-successor'),'activation cannot delete a successor update cache');
 if(phase==='installing'){release();await installing;}
 registration.installing=null;registration.waiting=null;await successor.lifecycle('activate');
 assert.deepEqual([...stores.keys()].sort(),['mossvale-shell-activating','mossvale-shell-successor'],'successor activation prunes deferred obsolete builds');
 successor.setNetwork(async()=>new Response('gone',{status:404}));
 assert.match(await(await successor.request('/',{mode:'navigate'})).text(),/installed build/,'a completed overlapping update retains its entire offline shell');
}
const cacheKeys=[...f.stores.get('mossvale-shell-current').keys()],before=f.calls.length;
for(const [path,extra] of [
 ['/__mossvale_shell__',{}],['/api/health',{}],['/api/account',{}],['/api/roster',{}],['/api/roster',{headers:new Headers({'X-Guest-Token':'private'})}],['/socket',{}],['/api/config?token=private',{}],['/assets/game.js?v=private',{}],
 ['/models/hero.glb?build=game-CURRENT123.js',{}],
 ['/api/config',{headers:new Headers({Authorization:'Bearer private'})}],['/',{method:'POST'}],['https://identity.example/realms/mossvale',{}],
])assert.equal(f.request(path,extra),undefined,`${path} stays outside the public fallback`);
assert.equal(f.calls.length,before,'private, authenticated, cross-origin and mutating requests are not intercepted');
f.setNetwork(async path=>new Response(path==='/'?'<title>Mossvale</title>online build':`online ${path}`,{headers:{'Content-Type':path==='/'?'text/html':'model/gltf-binary'}}));
const warmedCalls=f.calls.length;
assert.match(await (await f.request('/',{mode:'navigate'})).text(),/installed build/);assert.equal(await (await f.request('/models/hero.glb')).text(),'installed /models/hero.glb','HTML and models come from the same complete installed build');
assert.equal(f.calls.length,warmedCalls,'installed shell navigation and assets consume no network bytes');
assert.equal(await f.stores.get('mossvale-shell-current').get('/models/hero.glb').clone().text(),'installed /models/hero.glb','online fetches never partially overwrite the installed fallback build');
f.setNetwork(async()=>{throw Error('realm restarting');});
assert.match(await (await f.request('/?code=private-code&state=private-state',{mode:'navigate'})).text(),/installed build/);
assert.equal(f.calls.length,warmedCalls,'OAuth callback parameters never reach a network fetch or cache key');
assert.deepEqual(await (await f.request('/api/config')).json(),config);assert.equal(await (await f.request('/models/hero.glb')).text(),'installed /models/hero.glb');
assert.deepEqual([...f.stores.get('mossvale-shell-current').keys()],cacheKeys,'outages and callback navigation never cache account data or callback credentials');
for(const invalid of [new Response('<h1>Proxy error</h1>',{headers:{'Content-Type':'text/html'}}),new Response('<title>Mossvale</title>error',{status:503,headers:{'Content-Type':'text/html'}})]){
 f.setNetwork(async()=>invalid.clone());assert.match(await (await f.request('/',{mode:'navigate'})).text(),/installed build/,'invalid or unavailable HTML falls back to the complete installed shell');
}
const walletConfig={keycloak:{...config.keycloak,url:'https://new-identity.example'},walletBroker:{enabled:true,provider:'mossvale-wallet',chainId:1}};
const realmConfig={...walletConfig,...createHostingConfig('eu','https://mossvale.example','https://us.example')};
const legacyRealmConfig={...realmConfig,realms:realmConfig.realms.slice(0,2)};
const asiaConfig={...walletConfig,...createHostingConfig('asia','https://mossvale.example','https://us.example','https://asia.example')};
const mobileConfig={...realmConfig,mobilePurchases:{apple:false,google:false}};
const socialConfig={...mobileConfig,mobilePurchases:{apple:true,google:true},socialProviders:{google:'google',apple:'apple'}};
const turnkeyConfig={...socialConfig,turnkey:{organizationId:'51b5e0de-3064-4e9e-990d-e34e4d3df988',authProxyConfigId:'4782e754-75da-4a4c-8462-93b6a65f36e1',gasFunding:true,
 collections:{petsContract:'0xe86B214d38bEC528393309b0eC12e3c19dfac2F6',legacyPetsContract:'0xF1bc2AB7401601993886DAF61839B874E7F10eAD',housesContract:'0x'+'34'.repeat(20)}}};
const arenaConfig={...turnkeyConfig,turnkey:{...turnkeyConfig.turnkey,arenaContract:'0x22F1b671d728a8E64f5553eD008c4F3D3A0FcDbC'}};
const pushUpdateConfig={...turnkeyConfig,mobilePush:{enabled:true},mobileAppUpdate:{apple:{minVersion:'1.0.3',minBuild:'12.1'},google:{minVersion:'1.0.3',minBuild:'27'}}};
const validMobileConfigs=[pushUpdateConfig,{...mobileConfig,mobilePush:{enabled:false},mobileAppUpdate:{}},
 {...mobileConfig,mobilePush:{enabled:true}},{...mobileConfig,mobileAppUpdate:null},{...mobileConfig,mobileAppUpdate:{apple:{minVersion:'1.0.3'}}}];
for(const value of validMobileConfigs){
 assert.doesNotThrow(()=>parseAppUpdatePolicy(value.mobileAppUpdate));
 const mobileWorker=fixture();mobileWorker.setNetwork(path=>path==='/api/config'?Response.json(value):mobileWorker.response(path));
 await mobileWorker.lifecycle('install');
 assert.deepEqual(await(await mobileWorker.stores.get('mossvale-shell-current').get('/api/config').clone()).json(),value,'current push/update settings install and cache without stalling the complete shell');
 assert.deepEqual(await(await mobileWorker.request('/api/config')).json(),value,'current push/update policy is served live');
 assert.equal(mobileWorker.skipCount,0);assert.equal(mobileWorker.claimCount,0,'schema compatibility keeps the normal activation gate');
}
const invalidMobileConfigs=[...[null,[],{}, {enabled:'true'},{enabled:true,accessToken:'private'}].map(mobilePush=>({...mobileConfig,mobilePush})),
 ...[[],true,{web:{minVersion:'1.0.3'}},{apple:null},{apple:{}},{apple:{minVersion:103}},
  {apple:{minVersion:'latest'}},{apple:{minVersion:'1.0.3.4'}},{apple:{minVersion:'10000000000'}},
  {apple:{minVersion:'1.0.3',minBuild:''}},{apple:{minVersion:'1.0.3',minBuild:27}},{google:{minVersion:'1.0.3',token:'private'}}]
  .map(mobileAppUpdate=>{assert.throws(()=>parseAppUpdatePolicy(mobileAppUpdate));return {...mobileConfig,mobileAppUpdate};})];
for(const value of invalidMobileConfigs){
 const invalidWorker=fixture();invalidWorker.setNetwork(path=>path==='/api/config'?Response.json(value):invalidWorker.response(path));
 await assert.rejects(invalidWorker.lifecycle('install'),/Incomplete game update/);
 assert(!invalidWorker.stores.get('mossvale-shell-current').has('/api/config'),'malformed push/update policy and private fields cannot enter fallback storage');
}
for(const value of [walletConfig,legacyRealmConfig,realmConfig,asiaConfig,mobileConfig,socialConfig,turnkeyConfig,arenaConfig,
 ...validMobileConfigs,
 {...turnkeyConfig,turnkey:{...turnkeyConfig.turnkey,gasFunding:false,collections:{}}},
 {keycloak:null,turnkey:{...turnkeyConfig.turnkey,gasFunding:false,collections:{}}},
 {...socialConfig,socialProviders:{google:'google'}},{...socialConfig,socialProviders:{apple:'apple'}},{...config,...createHostingConfig('us','https://mossvale.example','https://us.example')},
 {keycloak:null,...createHostingConfig(),mobilePurchases:{apple:false,google:false}}, {...config,...createHostingConfig('eu','','http://localhost:2568')}]){
 f.setNetwork(async()=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));
 assert.deepEqual(await (await f.request('/api/config')).json(),value,'healthy legacy, wallet and regional configurations return live settings instead of stale cached settings');
}
for(const value of [...invalidMobileConfigs,{keycloak:null,token:'private'},{keycloak:{...config.keycloak,accessToken:'private'}},{keycloak:{...config.keycloak,clientId:''}},
 {...walletConfig,token:'private'},...[
  {...walletConfig.walletBroker,clientSecret:'private'}, {...walletConfig.walletBroker,enabled:false},
  {...walletConfig.walletBroker,provider:'invalid provider'}, {...walletConfig.walletBroker,chainId:0},
  {...walletConfig.walletBroker,chainId:1.5}, {...walletConfig.walletBroker,chainId:Number.MAX_SAFE_INTEGER+1},
 ].map(walletBroker=>({...walletConfig,walletBroker})),{keycloak:null,walletBroker:walletConfig.walletBroker},
 ...[null,[],{},true,{apple:false},{apple:0,google:false},{apple:false,google:false,token:'private'}].map(mobilePurchases=>({...mobileConfig,mobilePurchases})),
 ...[null,[],true,'apple',{google:'other'},{apple:true},{microsoft:'microsoft'},{apple:'apple',token:'private'}].map(socialProviders=>({...socialConfig,socialProviders})),
 ...[null,[],{},true,'wallet',{...turnkeyConfig.turnkey,apiKey:'private'},
  ...['organizationId','authProxyConfigId'].flatMap(key=>[undefined,'','not-a-uuid','00000000-0000-0000-0000-000000000000',`${turnkeyConfig.turnkey[key]}\n`,123].map(value=>({...turnkeyConfig.turnkey,[key]:value}))),
  ...[undefined,null,0,'true'].map(gasFunding=>({...turnkeyConfig.turnkey,gasFunding})),
  ...[null,true,123,[],{},'','0x'+'00'.repeat(20),'0x1234','private',`${arenaConfig.turnkey.arenaContract}\n`].map(arenaContract=>({...turnkeyConfig.turnkey,arenaContract})),
  ...[undefined,null,[],true,{apiKey:'private'},{mountsContract:'0x'+'12'.repeat(20)},
   ...['','0x'+'00'.repeat(20),'0x1234','private',`${turnkeyConfig.turnkey.collections.petsContract}\n`,123,null].map(petsContract=>({petsContract}))
  ].map(collections=>({...turnkeyConfig.turnkey,collections})),
 ].map(turnkey=>({...turnkeyConfig,turnkey})),
 {keycloak:null,socialProviders:{apple:'apple'}},
 {...config,realmId:'eu'}, {...config,realms:realmConfig.realms}, {...realmConfig,realmId:'asia'}, {...realmConfig,characters:[{token:'private'}]},
 {...asiaConfig,realms:asiaConfig.realms.slice(0,2)}, {...realmConfig,realms:[...realmConfig.realms,realmConfig.realms[2]]},
 {...realmConfig,realms:[realmConfig.realms[0],realmConfig.realms[1],{...realmConfig.realms[2],id:'au'}]},
 {...realmConfig,realms:[realmConfig.realms[0],realmConfig.realms[1],{...realmConfig.realms[2],origin:realmConfig.realms[1].origin}]},
 ...[
  [], [realmConfig.realms[0],realmConfig.realms[0]],
  [{...realmConfig.realms[0],origin:'https://mossvale.example'},realmConfig.realms[1]],
  [realmConfig.realms[0],{...realmConfig.realms[1],name:'Wrong realm'}],
  [realmConfig.realms[0],{...realmConfig.realms[1],token:'private'}],
  ...['','http://us.example','https://user:secret@us.example','https://us.example/path','https://us.example/a/..','https://us.example?','https://us.example#','javascript:alert(1)']
   .map(origin=>[realmConfig.realms[0],{...realmConfig.realms[1],origin}]),
 ].map(realms=>({...realmConfig,realms}))]){
 f.setNetwork(async()=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));assert.deepEqual(await (await f.request('/api/config')).json(),config,'cached configuration cannot be replaced by credentials or malformed identity settings');
}
// The deployed arena release downloaded assets but rejected its own public config.
// A fixed worker must recover using verified partial bytes without replacing the active shell early.
{
 const oldSource=source.replace("'gasFunding', 'arenaContract', 'collections'", "'gasFunding', 'collections'");
 assert.notEqual(oldSource,source,'the legacy fixture must reject the newly exposed arena field');
 const legacy=fixture({workerSource:oldSource.replace('mossvale-shell-current','mossvale-shell-before-arena')});
 legacy.setNetwork(path=>path==='/api/config'?Response.json(turnkeyConfig):legacy.response(path));
 await legacy.lifecycle('install');await legacy.lifecycle('activate');
 const contents=Object.fromEntries(files.map(path=>[path,path==='/'?'<title>Mossvale</title>arena build':`arena build ${path}`]));
 const network=client=>path=>path==='/api/config'?Response.json(arenaConfig):client.response(path);
 legacy.setNetwork(network(legacy));
 const broken=fixture({workerSource:worker('current',files,contents).replace("'gasFunding', 'arenaContract', 'collections'", "'gasFunding', 'collections'"),stores:legacy.stores,contents});broken.setNetwork(network(broken));
 await assert.rejects(broken.lifecycle('install'),/Incomplete game update/);
 const partial=legacy.stores.get('mossvale-shell-current'),saved=files.filter(path=>partial.has(path));
 assert(saved.length>0);assert.equal((await partial.get('/__mossvale_shell__').clone().json()).complete,false);
 assert(!partial.has('/api/config'));assert.equal(broken.claimCount,0);assert.equal(broken.skipCount,0);
 assert.deepEqual(await(await legacy.request('/api/config')).json(),turnkeyConfig,'the blocked update leaves the working fallback intact');
 const fixed=fixture({workerSource:worker('arena-fixed',files,contents),stores:legacy.stores,contents});
 fixed.setNetwork(network(fixed));await fixed.lifecycle('install');
 assert(saved.every(path=>!fixed.calls.some(call=>call.input===path)),'the replacement reuses verified partial downloads from the failed worker');
 assert.equal(fixed.calls.filter(call=>call.input==='/api/config').length,1,'recovery still obtains fresh public settings');
 assert.equal((await fixed.stores.get('mossvale-shell-arena-fixed').get('/__mossvale_shell__').clone().json()).complete,true);
 assert.deepEqual(await(await legacy.request('/api/config')).json(),arenaConfig,'complete recovery refreshes the active predecessor fallback');
 assert.match(await(await legacy.request('/',{mode:'navigate'})).text(),/installed build/);
 assert.equal(fixed.claimCount,0);assert.equal(fixed.skipCount,0,'recovery retains the existing activation and player-state gates');
 await fixed.message({type:'ACTIVATE_UPDATE'});assert.equal(fixed.skipCount,1);await fixed.lifecycle('activate');
 fixed.setNetwork(async()=>{throw Error('offline');});
 assert.deepEqual(await(await fixed.request('/api/config')).json(),arenaConfig,'the installed recovery remains complete offline');
 assert.match(await(await fixed.request('/',{mode:'navigate'})).text(),/arena build/);
}
// Already-installed workers predate push and required-update settings. Queried
// startup reads bypass them until the normal complete-worker update repairs fallback.
{
 const legacySource=source.replace('mossvale-shell-current','mossvale-shell-before-mobile-update').replace(", 'mobilePush', 'mobileAppUpdate'",'');
 assert.notEqual(legacySource,source.replace('mossvale-shell-current','mossvale-shell-before-mobile-update'));
 const legacy=fixture({workerSource:legacySource});await legacy.lifecycle('install');await legacy.lifecycle('activate');
 const network=path=>path==='/api/config'?Response.json(pushUpdateConfig):legacy.response(path);
 legacy.setNetwork(network);
 assert.deepEqual(await(await legacy.request('/api/config',{cache:'no-store'})).json(),config,'the old worker reproduces the missing required-update policy despite a healthy current endpoint');
 assert.equal(legacy.request('/api/config?app-startup=1',{cache:'no-store'}),undefined,'fresh startup policy checks bypass the installed legacy worker');
 assert.deepEqual(await(await network('/api/config')).json(),pushUpdateConfig,'the bypassed request reaches the current required policy');
 const upgrade=fixture({stores:legacy.stores});upgrade.setNetwork(network);await upgrade.lifecycle('install');
 assert.equal(upgrade.claimCount,0);assert.equal(upgrade.skipCount,0);
 assert.deepEqual(await(await legacy.request('/api/config')).json(),pushUpdateConfig,'a complete replacement repairs fallback without forcing a running game to reload');
 assert.equal(upgrade.request('/api/config?app-startup=1'),undefined,'replacement workers keep startup policy reads fresh too');
}
// Reproduce the deployed worker exactly: its public field allowlist predates Turnkey.
// A no-store fetch cannot bypass that worker, and enabled config also breaks installation.
{
 const legacySource=source.replace('mossvale-shell-current','mossvale-shell-before-turnkey').replace("'socialProviders', 'turnkey'", "'socialProviders'");
 assert.notEqual(legacySource,source.replace('mossvale-shell-current','mossvale-shell-before-turnkey'));
 const legacy=fixture({workerSource:legacySource});await legacy.lifecycle('install');await legacy.lifecycle('activate');
 const network=path=>path==='/api/config'?new Response(JSON.stringify(turnkeyConfig),{headers:{'Content-Type':'application/json'}}):legacy.response(path);
 legacy.setNetwork(network);
 assert.deepEqual(await(await legacy.request('/api/config',{cache:'no-store'})).json(),config,'wallet openings reproduce the old disabled config despite a healthy enabled endpoint');
 const broken=fixture({stores:legacy.stores,workerSource:legacySource.replace('mossvale-shell-before-turnkey','mossvale-shell-rejected-update')});broken.setNetwork(network);
 await assert.rejects(broken.lifecycle('install'),/Incomplete game update/);
 assert.equal((await legacy.stores.get('mossvale-shell-rejected-update').get('/__mossvale_shell__').clone().json()).complete,false,'the old allowlist also blocks completion of new client updates after wallet activation');
 const upgrade=fixture({stores:legacy.stores});upgrade.setNetwork(network);await upgrade.lifecycle('install');
 assert.equal(upgrade.claimCount,0);assert.equal(upgrade.skipCount,0,'wallet recovery preserves the normal safe activation gate');
 assert.deepEqual(await(await legacy.request('/api/config',{cache:'no-store'})).json(),turnkeyConfig,'a complete fixed update repairs the still-active old worker fallback without a hard refresh');
 assert.deepEqual(await(await upgrade.request('/api/config')).json(),turnkeyConfig,'the fixed worker accepts current public wallet settings');
 assert.match(await(await legacy.request('/',{mode:'navigate'})).text(),/installed build/,'repair leaves the running game shell intact');
 const invalid=fixture({workerSource:source.replace('mossvale-shell-current','mossvale-shell-private-config')});
 invalid.setNetwork(path=>path==='/api/config'?new Response(JSON.stringify({...turnkeyConfig,turnkey:{...turnkeyConfig.turnkey,privateKey:'never-cache'}}),{headers:{'Content-Type':'application/json'}}):invalid.response(path));
 await assert.rejects(invalid.lifecycle('install'),/Incomplete game update/);assert(!invalid.stores.get('mossvale-shell-private-config').has('/api/config'),'private wallet fields cannot enter the candidate cache');
}
// Returning browsers may predate walletBroker or hosting realms. Their old fetch
// handlers reject newly added fields but still accept the cached fallback.
for(const nextConfig of [walletConfig,realmConfig,mobileConfig,socialConfig]){
const legacySource=source.replace('mossvale-shell-current','mossvale-shell-legacy').replace(/async function valid\([\s\S]*?\n}\n/,`async function valid(response,path) {
 if (!response.ok || response.redirected) return false;
 if (path !== CONFIG) return true;
 const value=await response.clone().json();
 return Object.keys(value).every(key => ${JSON.stringify(nextConfig===walletConfig?['keycloak']:nextConfig===realmConfig?['keycloak','walletBroker']:['keycloak','walletBroker','realmId','realms'])}.includes(key)) && !!value.keycloak;
}\n`);
const legacy=fixture({workerSource:legacySource});
const previous=await legacy.caches.open('mossvale-shell-legacy');
await previous.put('/api/config',legacy.response('/api/config'));await previous.put('/',legacy.response('/'));
const unrelated=await legacy.caches.open('other-app');await unrelated.put('/api/config',legacy.response('/api/config'));
legacy.setNetwork(async()=>new Response(JSON.stringify(nextConfig),{headers:{'Content-Type':'application/json'}}));
assert.deepEqual(await (await legacy.request('/api/config')).json(),config,'old active worker reproduces stale settings despite a healthy upgraded server');
const upgrade=fixture({stores:legacy.stores});
upgrade.setNetwork(async path=>path==='/api/config'?new Response(JSON.stringify(nextConfig),{headers:{'Content-Type':'application/json'}}):upgrade.response(path));
await upgrade.lifecycle('install');assert.equal(upgrade.claimCount,0,'recovery does not activate over a running game');
assert.deepEqual(await (await legacy.request('/api/config')).json(),nextConfig,'even the still-active old worker recovers on the next normal navigation');
assert.equal(await (await previous.match('/')).text(),'<title>Mossvale</title>installed build','the running build remains intact');
assert.deepEqual(await (await unrelated.match('/api/config')).json(),config,'configuration migration stays inside Mossvale caches');
assert.deepEqual(await (await (await upgrade.caches.open('mossvale-shell-current')).match('/api/config')).json(),nextConfig,'wallet, regional, native billing and social sign-in configurations install successfully');
}
// A waiting Asia-capable build must not poison the old two-realm client's fallback.
{
 const previous=fixture({workerSource:source.replace('mossvale-shell-current','mossvale-shell-two-realms')});
 const cache=await previous.caches.open('mossvale-shell-two-realms');
 await cache.put('/api/config',new Response(JSON.stringify(legacyRealmConfig),{headers:{'Content-Type':'application/json'}}));
 const upgrade=fixture({stores:previous.stores});
 const expanded={...socialConfig,...createHostingConfig('eu','https://mossvale.example','https://us.example','https://asia.example')};
 upgrade.setNetwork(async path=>path==='/api/config'?new Response(JSON.stringify(expanded),{headers:{'Content-Type':'application/json'}}):upgrade.response(path));
 await upgrade.lifecycle('install');
 assert.deepEqual(await(await cache.match('/api/config')).json(),{...expanded,realms:expanded.realms.slice(0,2)});
 assert.deepEqual(await(await(await upgrade.caches.open('mossvale-shell-current')).match('/api/config')).json(),expanded);
 assert.equal(upgrade.claimCount,0);
}
for(const broken of ['/assets/game.js','/api/config']){
 const failed=fixture();const previous=await failed.caches.open('mossvale-shell-previous');await previous.put('/api/config',failed.response('/api/config'));failed.setNetwork(async path=>path===broken?new Response('gateway error',{headers:{'Content-Type':'text/html'}}):path==='/api/config'?new Response(JSON.stringify(realmConfig),{headers:{'Content-Type':'application/json'}}):failed.response(path));
 await assert.rejects(failed.lifecycle('install'),/Incomplete game update/);assert(!failed.stores.get('mossvale-shell-current').has(broken),'invalid responses are never saved in a resumable candidate');assert.equal((await failed.stores.get('mossvale-shell-current').get('/__mossvale_shell__').clone().json()).complete,false);assert(failed.stores.has('mossvale-shell-previous'));assert.equal(failed.claimCount,0);assert.equal(failed.skipCount,0,'an incomplete update never requests activation');
 assert.deepEqual(await (await previous.match('/api/config')).json(),config,'an incomplete update cannot change the previous identity configuration');
}
const empty=fixture();empty.setNetwork(async()=>{throw Error('offline');});assert.equal((await empty.request('/',{mode:'navigate'})).status,503,'a missing fallback never invents a playable response');
// Fetch resolves at headers; a GLB body can still be streaming when its timeout fires.
const keepAlive=setTimeout(()=>{},5000); // AbortSignal.timeout does not keep Node running.
try {
 await Promise.all([true,false].map(async installed=>{
  const slow=fixture();if(installed)await slow.lifecycle('install');
  slow.setNetwork(async(path,{signal})=>new Response(new ReadableStream({start(controller){
   controller.enqueue(new TextEncoder().encode('partial glTF'));
   signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});
  }}),{headers:{'Content-Type':'model/gltf-binary'}}));
  const response=await slow.request('/models/hero.glb');
  assert.equal(response.status,installed?200:503);
  assert.equal(await response.text(),installed?'installed /models/hero.glb':'The realm is updating. Please retry shortly.',
   'an aborted body uses the complete installed model or a readable 503, never a broken stream');
 }));
} finally {clearTimeout(keepAlive);}
const streamed=fixture();
streamed.setNetwork(async()=>new Response(new ReadableStream({start(controller){
 controller.enqueue(new TextEncoder().encode('installed '));
 setTimeout(()=>{controller.enqueue(new TextEncoder().encode('/models/hero.glb'));controller.close();},10);
}}),{headers:{'Content-Type':'model/gltf-binary'}}));
assert.equal(await (await streamed.request('/models/hero.glb')).text(),'installed /models/hero.glb','a missing cached asset can recover a complete matching streamed body');
streamed.setNetwork(async()=>new Response('wrong deployment bytes',{headers:{'Content-Type':'model/gltf-binary'}}));
assert.equal((await streamed.request('/models/hero.glb')).status,503,'missing assets never mix a different deployed build into the installed game');
console.log('PASS update cache: hash-verified HTTP-cache reuse and stale-byte/MIME repair, incremental and legacy installs, cache-first complete shell, complete bounded public install, explicit complete-update activation, one activated predecessor, overlapping-install preservation and exact hashed JS/CSS fallback, returning-worker public configuration compatibility, scoped cleanup, streamed-body timeout recovery, OAuth query stripping, strict public config, private/auth/API bypass, interrupted-install resumption and explicit missing-cache 503.');
