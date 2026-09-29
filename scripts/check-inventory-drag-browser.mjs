import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { stripTypeScriptTypes } from 'node:module';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';

// Real Chromium native drags; the shipped UI uses local fixture state, never a game server.
const root=fileURLToPath(new URL('../',import.meta.url)),session=`inventory-drag-${process.pid}`;
const baseline=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice('--baseline='.length);
const source=baseline?execFileSync('git',['show',`${baseline}:src/main.ts`],{cwd:root,encoding:'utf8'}):readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const between=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert(from>=0&&to>from,start);return source.slice(from,to);};
const shipped=stripTypeScriptTypes([
 between('let bagLayoutPlayer=','const closedBagIds='),
 between('function reconcileBagSelection(', 'function renderInventory()'),
 between('function renderGearPanel(){','let inspectedPlayerId:'),
 between('function replacePanelContent(',"$('panel-content').addEventListener('change'"),
 between('function selectBagItem(', 'function openDeath()'),
].join('\n'));
const run=promisify(execFile),browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{cwd:root,timeout:45000,maxBuffer:1024*1024})).stdout;
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inventory drag check</title><style>
*{box-sizing:border-box}body{margin:0;background:#294332}button{cursor:pointer}#outside{position:fixed;left:20px;bottom:20px;padding:20px}body #panel.panel[data-mode='gear'][open]:has(.profile-inventory){inset:40px auto auto 10px;width:840px;height:680px;margin:0}#auction-window{left:870px!important;top:40px!important;width:700px!important;height:650px!important}
</style></head><body><button id="outside">World control</button><dialog id="panel" class="panel" data-mode="gear"><div class="panel-heading"><span id="panel-eyebrow"></span><h2 id="panel-title">Inventory</h2></div><div id="panel-content"></div></dialog><script type="module">
import {deferTouchRender} from '/src/scroll-refresh.ts';
import {renderGear,renderBackpack,renderItemDetails,bagItems,reconcileBagSlots} from '/src/character-ui.ts';import {starterGear,gearById,gearFitsSlot} from '/src/progression.ts';import {LOOT_ITEMS,lootItemValid} from '/src/loot-items.ts';import {preserveItemRollDetails} from '/src/item-tooltip.ts';import {mountItemHover} from '/src/item-hover.ts';import {mountItemMenu} from '/src/item-menu.ts';import {mountAuctionUI} from '/src/auction-ui.ts';
import {mountLocalization,languagePicker} from '/src/localization.ts';
import '/src/style.css';import '/src/art.css';import '/src/character-bags.css';import '/src/item-tooltip.css';import '/src/player-menu.css';import '/src/auction.css';
window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const lootUI={displayPlayer:value=>value};
const $=id=>document.getElementById(id),panel=$('panel'),closedBagIds=new Set();let selectedBagItem='',upgradingBagItem=false,characterView,bagPreview;
const languageControl=document.createElement('div');languageControl.hidden=true;languageControl.innerHTML=languagePicker('fixture-language');document.body.append(languageControl);const localization=mountLocalization();
let player={id:'drag-check',name:'Drag check',characterCreated:true,level:30,hp:100,maxHp:100,gold:1000,appearance:{className:'Ranger'},talents:[],inventory:{wood:15,crystal:2,herb:0,potion:1,relic:0},carriedItems:{'trail-bread':1},ownedBags:[{id:'00000000-0000-4000-8000-000000000001',kind:'linen-pouch'}],equippedBags:[null,null,null,null],...starterGear('Ranger')};player.ownedGear.push('warden-longbow','copper-ring');
const storage=new Map(),readLocal=key=>storage.get(key),saveLocal=(key,value)=>storage.set(key,value),sent=[],send=message=>sent.push(message),toast=()=>{},mountCharacterView=()=>({update(){}}),disposeBagPreview=()=>{},showBagPreview=()=>{},renderInventory=()=>renderGearPanel();
const itemMenu=mountItemMenu(panel,()=>player,()=>{});mountItemHover(()=>player);
${shipped}
panel.show();renderGearPanel();const auctionUI=mountAuctionUI({send,getPlayer:()=>player,nearby:()=>true,onOpen:()=>{}}),market={open:true,listings:[],mine:[],sold:[],economyVersion:1,crypto:{enabled:false,moss:{enabled:false}}};auctionUI.update(market);
window.worldClicks=0;$('outside').onclick=()=>worldClicks++;$('panel-content').addEventListener('click',event=>{const id=event.target.closest('[data-inspect-item]')?.dataset.inspectItem;if(id)selectBagItem(id);});
window.events=[];let dragSource;for(const type of ['dragstart','drop','dragend'])document.addEventListener(type,event=>{events.push({type,trusted:event.isTrusted,sourceConnected:dragSource?.isConnected});if(type==='dragstart'){dragSource=event.target;dragSource.addEventListener('dragend',()=>events.push({type:'source-dragend',sourceConnected:dragSource.isConnected}),{once:true});}},true);document.addEventListener('drop',()=>events.push({type:'after-drop',sourceConnected:dragSource?.isConnected}));
let ticks=0;setInterval(()=>{ticks++;player.hp=99+ticks%2;renderGearPanel();auctionUI.refresh();},50);
window.fixture={state:()=>({draggedGear,draggedBag,draggedItem,selectedBagItem,ticks,slots:currentBagSlots(),sent}),interrupt:()=>{const target=document.querySelector('[data-drag-item="wood"]');target.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:new DataTransfer()}));target.remove();},refresh:renderGearPanel,setLanguage:value=>{const select=$('fixture-language');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}};window.ready=true;
</script></body></html>`;
const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});});
server.listen(0,'127.0.0.1');await once(server,'listening');
const vite=await createVite({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,watch:null,hmr:{server,clientPort:server.address().port}}});
const evaluate=async code=>JSON.parse(await browser('eval',`(()=>{const check=(value,message)=>{if(!value)throw Error(message)};${code}})()`));
const point=selector=>evaluate(`const node=document.querySelector(${JSON.stringify(selector)}),r=node.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2),hit=document.elementFromPoint(x,y);check(node.contains(hit),'drag control is visible and unobstructed: '+${JSON.stringify(selector)}+' at '+JSON.stringify(r)+'; hit '+hit?.outerHTML.slice(0,300));return {x,y};`);
const startDrag=async selector=>{const p=await point(selector);await browser('mouse','move',String(p.x),String(p.y));await browser('mouse','down');await browser('mouse','move',String(p.x+12),String(p.y+6),'--steps','4');};
const dropOn=async selector=>{const p=await point(selector);await browser('mouse','move',String(p.x),String(p.y),'--steps','8');await browser('mouse','up');};
const state=()=>evaluate('return fixture.state();');
try{
 await browser('set','viewport','1600','900');await browser('open',`http://127.0.0.1:${server.address().port}`);await browser('wait','--fn','window.ready === true');await browser('snapshot','-i');
 await evaluate(`fixture.setLanguage('zh-CN');const control=document.querySelector('[data-drag-gear="warden-longbow"]'),slot=control.closest('[data-storage-slot]');check(control.getAttribute('aria-label').includes('守卫长弓'),'Chinese item label is translated');fixture.refresh();check(document.querySelector('[data-drag-gear="warden-longbow"]')===control&&control.closest('[data-storage-slot]')===slot,'Chinese passive refresh retains native item controls');fixture.setLanguage('en');check(control.getAttribute('aria-label').includes('Warden longbow'),'retained item restores original English');return true;`);
 for(let i=0;i<30;i++){
  const target=i%2?0:15;await startDrag('[data-drag-item="wood"]');
  await evaluate(`check(fixture.state().draggedItem==='wood','native mouse movement starts the real bag drag');return true;`);
  await dropOn('[data-storage-slot="'+target+'"]');
  await evaluate(`const s=fixture.state();check(s.slots[${target}]==='wood','native drop moves wood to cell ${target}');check(!s.draggedItem,'native drop releases inventory drag state');return true;`);
 }
 await startDrag('[data-drag-gear="warden-longbow"]');await dropOn('[data-gear-slot="weapon"] button');
 await startDrag('[data-drag-item="bag:00000000-0000-4000-8000-000000000001"]');await dropOn('[data-bag-slot="0"]');
 await evaluate(`check(fixture.state().sent.some(m=>m.type==='equipGear'&&m.itemId==='warden-longbow'),'native equipment drop sends the existing equip action');check(fixture.state().sent.some(m=>m.type==='equipBag'&&m.slot===0),'native bag drop sends the existing bag equip action');return true;`);
 const lifecycle=await evaluate(`return {drops:events.filter(e=>e.type==='after-drop').length,detachedDrops:events.filter(e=>e.type==='after-drop'&&!e.sourceConnected).length,detachedEnds:events.filter(e=>e.type==='source-dragend'&&!e.sourceConnected).length};`);
 console.log('Native source lifecycle:',JSON.stringify(lifecycle));
 if(!baseline){assert.equal(lifecycle.detachedDrops,0,'storage drops retain the native source until dragend');assert.equal(lifecycle.detachedEnds,0,'native dragend sees a connected source');}
 await startDrag('[data-drag-item="wood"]');await dropOn('#outside');
 await evaluate(`check(!fixture.state().draggedItem,'dropping onto the world ends the drag');return true;`);
 await browser('click','#outside');await evaluate(`check(worldClicks===1,'world clicks work after dragging out');return true;`);
 await startDrag('[data-drag-item="wood"]');await dropOn('#auction-title');
 await browser('click','[data-auction-tab="sell"]');await evaluate(`check(!!document.querySelector('#auction-sell'),'auction remains clickable after an inventory drag');return true;`);
 await startDrag('[data-drag-item="wood"]');await browser('press','Escape');await browser('mouse','up');
 await evaluate(`check(!fixture.state().draggedItem,'Escape cancellation releases the inventory');check(events.filter(e=>e.type==='dragstart'&&e.trusted).length>=35,'native trusted drags were exercised');check(errors.length===0,errors.join('\\n'));return true;`);
 console.log('PASS native mouse drags: 30 moves/swaps plus weapon and bag equipment under 50 ms passive refresh, world drop and click, auction drop and tab click, Escape cancellation.');
 const before=await state();await evaluate(`fixture.interrupt();return true;`);await browser('click','[data-drag-item="crystal"]');
 await evaluate(`const s=fixture.state();check(s.selectedBagItem==='crystal','first inventory click still selects its original control');check(!s.draggedItem,'next click must recover a detached source with missing dragend');check(s.ticks>${before.ticks},'passive updates continue throughout');check(errors.length===0,errors.join('\\n'));return true;`);
 await browser('wait','[data-drag-item="wood"]');await evaluate(`fixture.interrupt();return true;`);await browser('click','[data-auction-tab="browse"]');
 await evaluate(`check(!fixture.state().draggedItem&&!document.querySelector('#auction-sell'),'first auction click recovers inventory drag and switches the auction tab');return true;`);
 await browser('wait','[data-drag-item="wood"]');await browser('click','[data-drag-item="wood"]');
 await evaluate(`check(fixture.state().selectedBagItem==='wood','inventory clicks recover without refreshing');return true;`);
 console.log((await browser('screenshot')).trim());
 assert.equal((await browser('errors')).trim(),'','the fixture has no browser exceptions');
 console.log('PASS interrupted native lifecycle: detached source and missing dragend recover on the next click, rendering and inventory selection resume without reload.');
}catch(error){console.error(baseline?'BASELINE FAILURE':'FAILURE',await browser('eval','({state:window.fixture?.state(),events:window.events?.slice(-12),errors:window.errors})').catch(()=>''));throw error;}finally{
 await browser('mouse','up').catch(()=>{});await browser('close').catch(()=>{});await vite.close();await new Promise(resolve=>server.close(resolve));
}
