import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';

// Shipped renderers, panel handlers, touch actions, CSS and character model; no realm connection.
const root=fileURLToPath(new URL('../',import.meta.url)),session=`bag-layout-${process.pid}`;
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'/tmp/mossvale-bag-layout';
const source=readFileSync(join(root,'src/main.ts'),'utf8');
const between=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert(from>=0&&to>from,start);return source.slice(from,to);};
const shipped=stripTypeScriptTypes([
  between('let bagLayoutPlayer=','const closedBagIds='),
  between('function reconcileBagSelection(','function toggleTalents()'),
  between('function renderGearPanel(){','let inspectedPlayerId:'),
  between('function replacePanelContent(','function openDeath()'),
].join('\n'));
const seen=new Set(),css=[];
function visit(file){
  if(seen.has(file)||!existsSync(file))return;seen.add(file);
  const text=readFileSync(file,'utf8');if(file.endsWith('.css')){css.push(file);return;}
  for(const [,specifier] of text.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)){
    let target=resolve(dirname(file),specifier);if(!extname(target))target+='.ts';
    if(/\.(?:ts|css)$/.test(target))visit(target);
  }
}
visit(join(root,'src/main.ts'));
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bag layout verification</title></head><body><div id="play-ui"><dialog id="panel" class="panel" data-mode="gear"><div class="panel-heading"><div><span class="eyebrow" id="panel-eyebrow"></span><h2 id="panel-title">Benjooie</h2></div><button class="close-button" id="close-panel" aria-label="Close panel">×</button></div><div id="panel-content"></div></dialog></div><script type="module">
${css.map(file=>`import ${JSON.stringify('/'+file.slice(root.length))};`).join('\n')}
import {raidProgressionAction} from '/src/raid-progression-ui.ts';
import {renderGear,renderBackpack,renderItemDetails,bagItems,reconcileBagSlots} from '/src/character-ui.ts';
import {starterGear,gearById,gearFitsSlot} from '/src/progression.ts';
import {LOOT_ITEMS,lootItemValid} from '/src/loot-items.ts';
import {preserveItemRollDetails} from '/src/item-tooltip.ts';
import {mountCharacterView} from '/src/character-view.ts';
import {loadCharacterAssets} from '/src/characters.ts';
import {normalizeAppearance,DEFAULT_APPEARANCE} from '/src/appearance.ts';
import {bindTouchActions} from '/src/mobile-controls.ts';
const lootUI={displayPlayer:value=>value};
const $=id=>document.getElementById(id),panel=$('panel'),closedBagIds=new Set();
window.errors=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
let selectedBagItem='',upgradingBagItem=false,characterView,bagPreview;
const storage=new Map(),readLocal=key=>storage.get(key),saveLocal=(key,value)=>storage.set(key,value);
const raid=null,raidAction=()=>false;
const sent=[],send=message=>sent.push(message),toast=()=>{},itemMenu={update(){},close(){}},localization={translate(){}};
const disposeBagPreview=()=>{},showBagPreview=()=>{},disposeCharacterView=()=>{characterView?.dispose();characterView=undefined;};
const closePanel=()=>{disposeCharacterView();panel.close();},openCharacter=()=>{inventoryLayout='grid';renderGearPanel();};
let player={id:'bag-layout-check',name:'Benjooie',characterCreated:true,level:60,hp:1193,maxHp:1193,gold:111103,talents:[],title:'giant-slayer',achievements:{unlocked:{'giant-slayer':1}},appearance:normalizeAppearance({...DEFAULT_APPEARANCE,className:'Ranger'}),inventory:{wood:545,crystal:1218,herb:57,potion:571,relic:1090},carriedItems:{'trail-bread':2,'roast-meat':2,'berry-tart':8,'greater-tonic':115,'prismatic-pearl':18,'ancient-coin':15,'chipped-fang':3,'gnarled-bark':66,'treasure-map':36,'slime-residue':4,'tattered-pelt':309,'cracked-carapace':50,'frost-shard':517,'bog-gland':8,'void-dust':47,'dream-petal':27},ownedBags:Array.from({length:4},(_,i)=>({id:'00000000-0000-4000-8000-00000000000'+(i+1),kind:'runewoven-holdall'})),...starterGear('Ranger')};
player.equippedBags=player.ownedBags.map(bag=>bag.id);
Object.assign(player.equipment,{head:'ranger-head',legs:'ranger-legs',shoes:'ranger-shoes',back:'ranger-back',charm:'lantern-charm',ring1:'copper-ring',ring2:'star-ring'});
player.ownedGear=[...new Set([...Object.values(player.equipment).filter(Boolean),'warden-longbow','rootforged-charm','mage-head'])];
const initialSlots=Array(112).fill(null),items=bagItems(player),positions=[0,1,2,3,...Array.from({length:13},(_,i)=>16+i),40,41,42,43,64,65,66];
items.forEach((id,index)=>initialSlots[positions[index]]=id);storage.set('mossvale:bag-slots:'+player.id,JSON.stringify(initialSlots));
${shipped}
bagView.mossBalance='1234.5678';
$('close-panel').onclick=closePanel;bindTouchActions($('play-ui'));
const responsive=()=>{document.body.classList.toggle('mobile-controls',innerWidth<1000);document.body.classList.toggle('mobile-panel-open',innerWidth<1000);};responsive();addEventListener('resize',responsive);
window.fixture={state:()=>({selectedBagItem,inventoryLayout,bagView,slots:currentBagSlots(),sent}),refresh:renderGearPanel,player};
await loadCharacterAssets();panel.show();renderGearPanel();await document.fonts.ready;
requestAnimationFrame(function draw(now){characterView?.render(now/1000);requestAnimationFrame(draw);});
await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.ready=true;
</script></body></html>`;
let vite;
const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});});
server.listen(0,'127.0.0.1');await once(server,'listening');
vite=await createVite({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:{server,clientPort:server.address().port}}});
const url=`http://127.0.0.1:${server.address().port}`,run=promisify(execFile);
const browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{cwd:root,timeout:60000,maxBuffer:2_000_000})).stdout;
const evaluate=async code=>JSON.parse(await browser('eval',`(()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${code}})()`));
const touch=async(selector,refresh=false)=>{
 // Let native scrolling settle before beginning a new gesture.
 await browser('wait','150');
 await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});return true;`);
 return evaluate(`const node=document.querySelector(${JSON.stringify(selector)}),r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);check(node.contains(hit),'touch target is unobstructed: '+${JSON.stringify(selector)}+' at '+x+','+y+' under '+hit?.outerHTML.slice(0,180));const event=type=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:11,button:0,clientX:x,clientY:y});node.dispatchEvent(event('pointerdown'));if(${refresh}){fixture.refresh();check(node.isConnected,'passive update retains held control: '+${JSON.stringify(selector)});}node.dispatchEvent(event('pointerup'));return true;`);
};
const geometry=()=>evaluate(`
 const panel=document.querySelector('#panel'),content=document.querySelector('#panel-content'),r=panel.getBoundingClientRect();
 check(r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,'panel fits viewport: '+JSON.stringify(r.toJSON()));
 if(innerWidth>1100&&innerHeight>650)check(r.width<=1009&&r.height<=575,'compact bags leave the game visible around the window');
 check(document.documentElement.scrollWidth<=innerWidth+1&&panel.scrollWidth<=panel.clientWidth+1&&content.scrollWidth<=content.clientWidth+1,'no horizontal viewport or panel overflow');
 const close=panel.querySelector(panel.dataset.mode==='inventory'?'[data-close-bag]':'#close-panel'),c=close.getBoundingClientRect();check(c.width>=43.5&&c.height>=43.5&&c.left>=r.left-1&&c.right<=r.right+1&&c.top>=r.top-1&&c.bottom<=r.bottom+1,'panel close remains visible and reachable');
 const windows=content.querySelector('.bag-windows'),w=windows.getBoundingClientRect();check(w.width>0&&w.height>0,'bag scrolling area is visible');
 const moss=content.querySelector('.bag-moss'),m=moss.getBoundingClientRect();check(moss.textContent.includes('1,234.5678')&&getComputedStyle(moss.querySelector('span:not(.item-art)')).display!=='none','MOSS balance and label stay visible');
 check(m.left>=r.left-1&&m.right<=r.right+1&&m.top>=r.top-1&&m.bottom<=r.bottom+1,'MOSS balance fits the compact bag');
 check(w.left>=r.left-1&&w.right<=r.right+1&&w.top>=r.top-1&&w.bottom<=r.bottom+1,'bag scrolling area fits panel');
 const details=content.querySelector('#bag-item-details');if(details&&!details.hidden){const d=details.getBoundingClientRect();check(d.left>=r.left-1&&d.right<=r.right+1&&d.top>=r.top-1&&d.bottom<=r.bottom+1,'item details fit panel');if(panel.dataset.mode==='inventory')check(w.height>=44,'bag scroll area remains usable beside item details');}
 const cell=content.querySelector('.bag-slot[data-storage-slot]');if(innerWidth<1000){const c=cell.getBoundingClientRect();check(c.width>=43.5&&c.height>=43.5,'mobile bag cells retain 44px touch targets');}
 check(errors.length===0,errors.join('\\n'));return {width:innerWidth,height:innerHeight,mode:panel.dataset.mode,bagViewport:Math.round(w.height),bagScroll:windows.scrollHeight};
`);
try{
 if(process.argv.includes('--serve')){
  console.log('Bag layout fixture: '+url);await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
 }else{
  mkdirSync(output,{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1000],['landscape',844,390],['portrait',390,844],['compact',667,375]].filter(([name])=>!process.argv.some(arg=>arg.startsWith('--views='))||process.argv.find(arg=>arg.startsWith('--views=')).slice(8).split(',').includes(name))){
   await browser('set','viewport',String(width),String(height));await browser('open',url);await browser('wait','--fn','window.ready === true');await browser('wait','--fn','[...document.images].every(image=>image.complete)');await browser('snapshot','-i');
   await evaluate(`check(document.querySelector('.bag-profile'),'profile layout');check(document.querySelectorAll('[data-select-bag]').length===5,'all bags and four equipped bag tabs');check(document.querySelectorAll('[data-gear-slot]').length===9,'all nine equipment slots');check(document.querySelector('.character-view-canvas')?.width>0,'live character model');check(document.querySelector('.bag-toolbar').textContent.includes('111,103'),'gold is shown');check(document.querySelectorAll('[data-drag-item]').length===24,'all item stacks are present');return true;`);
   await browser('screenshot',join(output,name+'-profile.png'));console.log(name+' profile:',JSON.stringify(await geometry()));
   await touch('[data-select-bag="00000000-0000-4000-8000-000000000002"]',true);
   await evaluate(`check(document.querySelectorAll('[data-storage-slot]').length===24,'selected bag has its own capacity');check(document.querySelectorAll('[data-drag-item]').length===4,'selected bag has only its contents');return true;`);
   await touch('[data-select-bag="all"]');
   await touch('[data-drag-item="warden-longbow"]');await geometry();
   await evaluate(`check(fixture.state().selectedBagItem==='warden-longbow','touch selects gear');const details=document.querySelector('#bag-item-details');check(!details.hidden,'item details open');details.querySelector('details').open=true;details.scrollTop=details.scrollHeight;const y=details.scrollTop;fixture.refresh();check(document.querySelector('#bag-item-details').scrollTop===y,'passive update preserves detail scrolling');return true;`);
   await browser('screenshot',join(output,name+'-details.png'));await touch('[data-close-item]');
   await evaluate(`const windows=document.querySelector('.bag-windows');windows.scrollTop=windows.scrollHeight;const y=windows.scrollTop;check(y>0,'full bag grid scrolls');fixture.refresh();check(document.querySelector('.bag-windows').scrollTop===y,'passive update preserves bag scrolling');return true;`);
   await touch('[data-bag-layout="list"]');await browser('snapshot','-i');
   await evaluate(`check(document.querySelector('.bag-overview'),'overview layout');check(document.querySelectorAll('.bag-container').length===5,'backpack and four bags are shown');check(document.querySelectorAll('[data-bag-filter]').length===6,'all six filters');check(document.querySelectorAll('[data-drag-item]').length===24,'switching layout preserves all items');return true;`);
   await evaluate(`document.querySelector('.bag-windows').scrollTop=0;return true;`);await browser('screenshot',join(output,name+'-overview.png'));console.log(name+' overview:',JSON.stringify(await geometry()));
   const original=await evaluate('return fixture.state().slots;');
   for(const filter of ['equipment','materials','consumables','quest','misc']){
    await touch('[data-bag-filter="'+filter+'"]',true);await evaluate(`check(document.querySelector('[data-bag-filter="${filter}"]').getAttribute('aria-pressed')==='true','filter selection');check(document.querySelectorAll('[data-drag-item]').length>0&&document.querySelectorAll('[data-drag-item]').length<24,'filter narrows visible items');return true;`);
   }
   await touch('[data-bag-filter="all"]');
   for(const sort of ['type','name','quantity','slots']){await browser('select','[data-bag-sort]',sort);await evaluate(`check(document.querySelector('[data-bag-sort]').value==='${sort}','sort remains selected');check(document.querySelectorAll('[data-drag-item]').length===24,'sort retains items');return true;`);}
   assert.deepEqual(await evaluate('return fixture.state().slots;'),original,'filtering and sorting preserve stored slot positions');
   await evaluate(`const windows=document.querySelector('.bag-windows');windows.scrollTop=windows.scrollHeight;const last=windows.querySelector('.bag-container:last-child .bag-slot:last-child'),r=last.getBoundingClientRect(),w=windows.getBoundingClientRect();check(r.bottom<=w.bottom+1&&r.top>=w.top-1,'last bag slot can scroll into view');windows.scrollTop=0;return true;`);
   await touch('[data-drag-item="warden-longbow"]');await geometry();await touch('[data-close-item]');
   await touch('[data-open-character]',true);await geometry();
   await touch('[data-bag-layout="list"]',true);await touch('[data-close-bag]',true);
   await evaluate(`check(!document.querySelector('#panel').open,'held close survives passive refresh and closes inventory');return true;`);
   assert.equal((await browser('errors')).trim(),'','no browser exceptions');
  }
  console.log('PASS: selected viewport profile/overview geometry, live model, touch selection, details and bag scrolling, filters and sort. Screenshots: '+output);
 }
}catch(error){console.error(await browser('eval','({ready:window.ready,errors:window.errors,state:window.fixture?.state()})').catch(()=>''));throw error;}finally{
 await browser('close').catch(()=>{});await vite.close();await new Promise(resolve=>server.close(resolve));
}
