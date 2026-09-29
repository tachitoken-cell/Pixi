import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';

// Exercise the shipped DOM controller in Chromium; fixture state never reaches a game server.
const root=fileURLToPath(new URL('../',import.meta.url)),session=`item-hover-${process.pid}`;
const run=promisify(execFile),browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{cwd:root,timeout:45000,maxBuffer:1024*1024})).stdout;
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Item hover check</title><style>
*{box-sizing:border-box}body{margin:0;background:#294332}button{padding:12px}#panel{position:fixed;top:70px;left:20px}#blank{position:fixed;top:5px;right:5px}#edge{position:fixed;right:5px;bottom:5px}#center{position:fixed;left:175px;top:400px;width:40px;height:40px;padding:0}#bag{margin-top:12px;width:260px}.bag-slot{width:44px;height:44px}.bag-slot img,.bag-slot svg{width:28px;height:28px}
</style></head><body><button id="blank">Outside</button><section id="panel"><span id="existing-help" hidden>Existing help</span><button id="primary" data-item-tooltip="warden-longbow" aria-describedby="existing-help" draggable="true">Longbow</button><button id="resource" data-item-tooltip="wood">Wood</button><div id="bag"></div></section><button id="edge" data-item-tooltip="warden-longbow">Edge item</button><button id="center" data-item-tooltip="warden-longbow" hidden>Bow</button><dialog id="modal"><button id="modal-item" data-item-tooltip="wood">Modal wood</button></dialog><script type="module">
import {mountItemHover} from '/src/item-hover.ts';import '/src/character-bags.css';import '/src/item-tooltip.css';
import {starterGear,rollGear} from '/src/progression.ts';import {renderBackpack} from '/src/character-ui.ts';
window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.player={id:'hover-check',name:'Hover check',level:30,hp:100,maxHp:100,gold:1000,appearance:{className:'Ranger'},talents:[],inventory:{wood:2,crystal:0,herb:0,potion:1,relic:0},carriedItems:{'trail-bread':1},ownedBags:[],equippedBags:[null,null,null,null],...starterGear('Ranger')};
player.ownedGear.push('warden-longbow');document.querySelector('#bag').innerHTML=renderBackpack(player);
document.querySelector('#center').dataset.itemTooltip=rollGear('warden-longbow','mythic',()=>0.8).id;window.centerClicks=0;document.querySelector('#center').onclick=()=>centerClicks++;window.escapes=0;document.addEventListener('keydown',e=>{if(e.key==='Escape')escapes++});
mountItemHover(()=>player);window.ready=true;
</script></body></html>`;
const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});});
server.listen(0,'127.0.0.1');await once(server,'listening');
const vite=await createVite({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:{server,clientPort:server.address().port}}});
const evaluate=async code=>browser('eval',`(async()=>{const tip=document.querySelector('#item-hover-tooltip'),primary=document.querySelector('#primary');const check=(value,message)=>{if(!value)throw Error(message)},visible=()=>tip.matches(':popover-open')&&!tip.hidden,wait=()=>new Promise(r=>setTimeout(r,350));${code};return 'PASS';})()`);
try{
 await browser('set','viewport','1280','900');await browser('open',`http://127.0.0.1:${server.address().port}`);await browser('wait','--fn','window.ready === true');
 await browser('hover','#primary');await evaluate(`check(visible()&&tip.textContent.includes('Warden longbow'),'mouse hover renders the real item');check(primary.getAttribute('aria-describedby')==='existing-help item-hover-tooltip','hover retains existing accessible description');`);
 await browser('hover','#item-hover-tooltip');await evaluate(`await wait();check(visible(),'tooltip remains open while the pointer reads its description');`);
 await browser('hover','#blank');await evaluate(`await wait();check(!visible(),'leaving item and tooltip dismisses');`);
 await browser('focus','#primary');await evaluate(`check(visible(),'keyboard focus opens item description');`);
 await browser('press','Escape');await evaluate(`check(!visible()&&escapes===0,'first Escape only dismisses tooltip');check(primary.getAttribute('aria-describedby')==='existing-help','dismissal restores original accessible description');`);
 await browser('press','Escape');await evaluate(`check(escapes===1,'next Escape reaches the owning window');`);
 await browser('hover','#primary');await evaluate(`player.level=1;await wait();check(visible()&&tip.querySelector('.item-sheet-unmet'),'stationary hover refreshes changed player requirements');primary.dataset.itemTooltip='wood';await wait();check(tip.querySelector('.item-sheet-name').textContent==='Wood','stationary hover refreshes changed item identity');primary.dataset.itemTooltip='warden-longbow';player.level=30;primary.dispatchEvent(new DragEvent('dragstart',{bubbles:true}));check(!visible(),'drag start dismisses tooltip');`);
 await browser('hover','#blank');await browser('hover','#primary');await evaluate(`document.querySelector('#panel').hidden=true;await wait();check(!visible(),'closing the owning panel dismisses');document.querySelector('#panel').hidden=false;`);
 await browser('hover','#blank');await browser('hover','#primary');await evaluate(`const placeholder=document.createElement('span'),r=primary.getBoundingClientRect();placeholder.style.cssText='display:inline-block;width:'+r.width+'px;height:'+r.height+'px';primary.replaceWith(placeholder);await wait();check(!visible(),'a removed item control cannot leave stale tooltip content');placeholder.replaceWith(primary);`);
 // PointerEvent routing is exercised on the actual browser DOM, without a real purchase or consume action.
 await evaluate(`const target=document.querySelector('#resource');primary.blur();target.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'touch'}));target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));target.focus();target.click();check(!visible(),'touch selection leaves the hover layer closed');`);
 await browser('press','Tab');await browser('focus','#primary');await evaluate(`check(visible(),'keyboard inspection resumes after touch input');`);
 await browser('press','Escape');await browser('hover','[data-inspect-item="item:trail-bread"]');await evaluate(`check(visible()&&tip.textContent.includes('Trail bread'),'real backpack item metadata resolves its description');`);
 for(const [width,height] of [[1280,900],[390,844],[390,320]]){
  await browser('set','viewport',String(width),String(height));await browser('hover','#edge');
  await evaluate(`check(visible(),'edge item opens');const r=tip.getBoundingClientRect();check(r.left>=7&&r.top>=7&&r.right<=innerWidth-7&&r.bottom<=innerHeight-7,'tooltip fits viewport ${width}x${height}');`);
 }
 await browser('set','viewport','390','844');await evaluate(`document.querySelector('#center').hidden=false;`);await browser('hover','#center');await evaluate(`const center=document.querySelector('#center'),r=center.getBoundingClientRect();check(visible()&&center.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),'centered mobile item remains under the pointer instead of its tooltip');tip.scrollTop=tip.scrollHeight;const retained=tip.scrollTop;check(retained>0,'centered mythic tooltip is vertically capped and scrollable');await wait();check(tip.scrollTop===retained,'periodic positioning preserves the reader’s scroll position');`);
 await browser('click','#center');await evaluate(`check(centerClicks===1,'a real click reaches the centered mobile item');check(!visible(),'clicking the item leaves the hover layer dismissed');`);await browser('hover','#blank');await browser('hover','#center');await evaluate(`check(visible(),'leaving and re-entering restores hover');window.beforeCenterEscape=escapes;`);await browser('press','Escape');await evaluate(`await wait();check(!visible()&&escapes===beforeCenterEscape,'first Escape stays dismissed under the stationary pointer');document.querySelector('#center').hidden=true;`);
 await browser('set','viewport','1280','900');await browser('focus','#blank');await evaluate(`document.querySelector('#modal').showModal();`);await browser('hover','#modal-item');await browser('hover','#item-hover-tooltip');await evaluate(`await wait();check(visible()&&tip.closest('dialog')?.id==='modal','tooltip remains hoverable in a modal dialog');document.querySelector('#modal').close();await wait();check(!visible(),'closing a modal dismisses its tooltip');check(errors.length===0,errors.join('\\n'));`);
 assert.equal((await browser('errors')).trim(),'','the fixture has no browser exceptions');
 console.log('PASS item hover: real mouse/focus/keyboard behavior, accessible descriptions, hoverable content, touch and drag guards, live refresh, removed/closed controls, real backpack metadata, desktop/mobile viewport clamp, unobstructed mobile clicks, preserved preview scrolling, stationary Escape and modal ownership.');
}catch(error){console.error(await browser('eval',`({tooltip:document.querySelector('#item-hover-tooltip')?.textContent,open:document.querySelector('#item-hover-tooltip')?.matches(':popover-open'),focus:document.activeElement?.id})`).catch(()=>''));throw error;}finally{
 await browser('close').catch(()=>{});await vite.close();await new Promise(resolve=>server.close(resolve));
}
