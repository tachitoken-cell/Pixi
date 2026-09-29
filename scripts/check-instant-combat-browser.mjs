import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, rm } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';

// Isolated authoritative-state fixtures render the real menu and HUD without a saved account.
const root=fileURLToPath(new URL('../',import.meta.url)),output='/tmp/mossvale-instant-combat-proof',session=`instant-combat-${process.pid}`;
await mkdir(output,{recursive:true});
const run=promisify(execFile),browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{cwd:root,timeout:45000,maxBuffer:1024*1024})).stdout;
const seen=new Set(),styles=[];
function visit(file){if(seen.has(file)||!existsSync(file))return;seen.add(file);if(file.endsWith('.css')){styles.push(file.slice(root.length));return;}for(const [,specifier] of readFileSync(file,'utf8').matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)){let next=resolve(dirname(file),specifier);if(!extname(next))next+='.ts';if(/\.(ts|css)$/.test(next))visit(next);}}
visit(resolve(root,'src/main.ts'));
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instant Combat client proof</title><style>body{background:#263e32}#proof-note{position:fixed;bottom:10px;left:12px;color:#f5e8c9;font:12px sans-serif}</style></head><body><div id="app"></div><p id="proof-note">Isolated event interface fixture</p><script type="module">
${styles.map(file=>`import '/${file}';`).join('\n')}
import {mountUI,$} from '/src/ui.ts';import {renderInstantCombatPanel,mountInstantCombatHUD} from '/src/instant-combat-ui.ts';
mountUI();for(const id of ['loading','login','roster'])$(id).hidden=true;$('loading').remove();$('play-ui').inert=false;
window.now=Date.UTC(2026,8,27,13,55);window.player={level:16,hp:100};window.state={startsAt:now+300000,registrationOpensAt:now,registrationOpen:true,registered:false,bracketId:'16-30',registeredCount:21,run:null};
const panel=$('panel');panel.dataset.mode='instant-combat';$('panel-title').textContent='Instant Combat';$('panel-eyebrow').textContent='COOPERATIVE ARENA · EVERY TWO HOURS';
window.render=()=>{$('panel-content').innerHTML=renderInstantCombatPanel(state,player,now);hud.update(state,now,true);};
window.hud=mountInstantCombatHUD($('play-ui'),()=>{render();panel.show();});$('close-panel').onclick=()=>panel.close();
$('panel-content').onclick=e=>{const action=e.target.closest('[data-instant-combat]')?.dataset.instantCombat;if(action==='register')state.registered=true;else if(action==='unregister')state.registered=false;window.action=action;render();};
render();window.ready=true;
</script></body></html>`;
let vite;
const server=createServer(async(req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/',html));}else vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});});
server.listen(0,'127.0.0.1');await once(server,'listening');
vite=await createVite({root,cacheDir:`${output}/cache-${session}`,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:{server,clientPort:server.address().port}}});
const check=code=>browser('eval',`(()=>{const check=(value,message)=>{if(!value)throw Error(message)};${code};return 'PASS';})()`);
try{
 await browser('set','viewport','1280','900');await browser('open',`http://127.0.0.1:${server.address().port}`);await browser('wait','--fn','window.ready===true');console.log(await browser('snapshot','-i'));
 await check(`check(!document.querySelector('#instant-combat-hud').hidden,'registration notification visible');document.querySelector('#instant-combat-hud').focus();`);await browser('press','Enter');await browser('snapshot','-i');
 await check(`check(document.querySelector('#panel').open,'keyboard opens event details');check(!document.querySelector('[data-instant-combat="register"]').disabled,'registration available');`);
 await browser('eval','document.fonts.ready.then(()=>true)');await browser('screenshot',`${output}/registration-desktop.png`);await browser('click','[data-instant-combat="register"]');await browser('snapshot','-i');
 await check(`check(action==='register','register control dispatch');check(document.querySelector('[data-instant-combat="unregister"]'),'authoritative registered state offers cancellation');`);
 await browser('set','viewport','390','844');await check(`document.body.classList.add('mobile-controls','mobile-panel-open');document.querySelector('#chat').classList.add('collapsed');render();`);
 await check(`const panel=document.querySelector('#panel'),content=document.querySelector('#panel-content'),r=panel.getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth,'event menu fits mobile');check(content.scrollWidth<=content.clientWidth,'no horizontal overflow');check(document.querySelector('[data-instant-combat]').getBoundingClientRect().height>=44,'touch control is large enough');`);
 await browser('screenshot',`${output}/registered-mobile.png`);
 await browser('click','[data-instant-combat="unregister"]');await check(`check(action==='unregister','cancel control dispatch');state.registrationOpen=false;render();check(document.querySelector('[data-instant-combat="register"]').disabled,'late registration disabled');state.run={id:'instant-combat-test',mapId:'bone-pit',bossModel:'ossuary-tyrant',objective:'Prepare together. Four creature waves and a final boss await.',boss:null,mechanic:null,hazards:[],runes:[],bracketId:'16-30',minLevel:16,maxLevel:30,phase:'preparing',round:0,totalRounds:5,phaseEndsAt:now+90000,members:20,enemiesRemaining:0};render();check(document.querySelector('#instant-combat-hud').textContent.includes('1:30'),'preparation countdown');document.querySelector('#panel').close();document.body.classList.remove('mobile-panel-open');`);
 await browser('screenshot',`${output}/preparation-mobile.png`);await check(`hud.update(null,now,false);check(document.querySelector('#instant-combat-hud').hidden,'disconnect clears stale event');`);
 assert.equal((await browser('errors')).trim(),'','no browser exceptions');
 console.log(`PASS Instant Combat browser: desktop keyboard join, cancellation, mobile fit, closed registration, preparation countdown and disconnect cleanup. Screenshots: ${output}`);
}finally{await browser('close').catch(()=>{});await vite.close();await new Promise(resolve=>server.close(resolve));await rm(`${output}/cache-${session}`,{recursive:true,force:true});}
