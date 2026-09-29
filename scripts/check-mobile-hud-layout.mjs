import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Uses the real HUD/stylesheet review fixture; no gameplay server or transactions.
// First run: node scripts/build-benji-ui-review.mjs
const root=fileURLToPath(new URL('../',import.meta.url));
assert(existsSync(root+'artifacts/benji-ui/view.html'),'Generate the Benji UI review fixture first.');
const {chromium}=await import(process.env.MOSSVALE_PLAYWRIGHT||'playwright');
let server,browser;
const results=[],errors=[];
try{
 let base=process.env.MOSSVALE_UI_URL;
 if(!base){server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/*']}}});await server.listen();base=`http://127.0.0.1:${server.httpServer.address().port}`;}
 browser=await chromium.launch({headless:true,...(process.env.MOSSVALE_CHROME?{executablePath:process.env.MOSSVALE_CHROME}:{})});
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url()),font=url.protocol==='https:'&&((url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')||(url.hostname==='fonts.gstatic.com'&&request.resourceType()==='font'));return url.origin===new URL(base).origin||font?route.continue():route.abort('blockedbyclient');});
 for(const [width,height] of [[390,844],[768,1024],[844,390],[667,375],[320,640]]){
  await page.setViewportSize({width,height});await page.goto(base+'/artifacts/benji-ui/view.html?view=hud&mobile');
  await page.waitForSelector('body[data-ready=true]',{state:'attached'});
  const fonts=await page.evaluate(async()=>{const result={};for(const family of ['Marcellus','DM Sans']){const loaded=await document.fonts.load(`16px "${family}"`,'Mossvale');result[family]=loaded.length>0&&loaded.every(face=>face.status==='loaded')&&document.fonts.check(`16px "${family}"`,'Mossvale');}await document.fonts.ready;return result;});
  assert(Object.values(fonts).every(Boolean),`${width}×${height}: original fonts loaded`);
  await page.evaluate(async()=>{
   const {renderStoreBoosts}=await import('/src/store-ui.ts'),{BOOST_PRODUCTS}=await import('/src/ingame-store.ts'),$=id=>document.getElementById(id);
   $('waypoint-hud').hidden=false;$('waypoint-name').textContent='Return to Rowan';$('waypoint-distance').textContent='125 m';
   $('party-hud').hidden=false;$('party-hud').innerHTML=['Aster','Mira','Finn','Willow'].map(name=>`<span class="party-hud-member"><span class="party-hud-name">${name}</span><span class="party-health"><span style="width:70%"></span></span></span>`).join('');
   let boosts=$('store-boost-hud');if(!boosts){boosts=document.createElement('button');boosts.id='store-boost-hud';$('play-ui').append(boosts);}boosts.hidden=false;boosts.innerHTML=renderStoreBoosts({storeBoosts:Object.fromEntries(BOOST_PRODUCTS.map(product=>[product.boostId,Date.now()+1234000]))});
   $('pvp-state').hidden=false;$('pvp-title').textContent='WORLD PVP · ACTIVE';
   for(const id of ['mobile-clear','mobile-interact','travel-hud','casting-bar'])$(id).hidden=false;
   $('chat-preview').open=true;$('chat-preview-messages').innerHTML='<span class="chat-preview-line"><strong>Mira:</strong> Ready for the dungeon?</span><span class="chat-preview-line">Party invitation accepted.</span>';
   $('stamina-value').textContent='72';$('stamina-label').textContent='Sprinting';
   $('casting-name').textContent='Aimed Shot';$('casting-time').textContent='1.2s';$('casting-fill').style.width='50%';
  });
  for(const activeEffects of [false,true]){
   const result=await page.evaluate(activeEffects=>{
    for(const kind of ['player','target']){const effects=document.querySelector(`.unit-frame-${kind} .unit-effects`);effects.hidden=!activeEffects;effects.textContent=kind==='player'?'Rejuvenation 12s · Blessed Armor 4s':'Burning 3s · Slowed 2s';}
    const selectors=['#chat-preview','.chat-preview-heading','#chat-preview-messages','#travel-hud','#casting-bar','#quest-button','#waypoint-hud','#waypoint-clear','#party-hud','#store-boost-hud','#pvp-state','.unit-frame-player','.unit-frame-target','.unit-frame-focus','.unit-frame-player .unit-effects','.unit-frame-target .unit-effects','#minimap-button','#mobile-menu-button','#mobile-joystick','#mobile-sprint','#jump-button','#mobile-target','#mobile-clear','#mobile-interact','#mobile-attack','#hotbar .hotbar-page'];
    const entries=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(node=>({selector,node}))),slots=[...document.querySelectorAll('#hotbar .hotbar-slot')];
    slots.forEach((node,index)=>entries.push({selector:`skill slot ${index+1}`,node}));
    document.querySelectorAll('#store-boost-hud .store-hud-boost').forEach((node,index)=>entries.push({selector:`boost ${index+1}`,node}));
    const visible=node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(node).visibility!=='hidden';};
    const nodes=entries.filter(({node})=>visible(node)),rects=nodes.map(({selector,node})=>({selector,...node.getBoundingClientRect().toJSON()})),overlaps=[];
    for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){
     if(nodes[a].node.contains(nodes[b].node)||nodes[b].node.contains(nodes[a].node))continue;
     const x=Math.min(rects[a].right,rects[b].right)-Math.max(rects[a].left,rects[b].left),y=Math.min(rects[a].bottom,rects[b].bottom)-Math.max(rects[a].top,rects[b].top);
     if(x>1&&y>1)overlaps.push(`${rects[a].selector} / ${rects[b].selector}: ${x.toFixed(1)}×${y.toFixed(1)}px`);
    }
    const undersize=nodes.filter(({node})=>node.matches('button,summary')&&(node.getBoundingClientRect().width<43.5||node.getBoundingClientRect().height<43.5)).map(({selector})=>selector);
    const outside=rects.filter(r=>r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5).map(r=>r.selector);
    const boostBounds=document.querySelector('#store-boost-hud').getBoundingClientRect(),overflowingBoosts=rects.filter(r=>r.selector.startsWith('boost ')&&(r.left<boostBounds.left-.5||r.right>boostBounds.right+.5||r.top<boostBounds.top-.5||r.bottom>boostBounds.bottom+.5)).map(r=>r.selector);
    return{activeEffects,visibleSlots:slots.filter(visible).length,overlaps,undersize,outside,overflowingBoosts,rects};
   },activeEffects);
   results.push({width,height,fonts,...result});
  }
 }
 if(process.env.MOSSVALE_HUD_REPORT)writeFileSync(process.env.MOSSVALE_HUD_REPORT,JSON.stringify(results,null,2));
 assert.deepEqual(errors,[],'HUD has no runtime errors');
 for(const result of results){const label=`${result.width}×${result.height}, effects ${result.activeEffects?'active':'hidden'}`;assert.equal(result.visibleSlots,5,label+': all five slots visible');for(const key of ['overlaps','undersize','outside','overflowingBoosts'])assert.deepEqual(result[key],[],`${label}: ${key}`);}
 console.log(`PASS mobile HUD: ${results.length} populated layouts, real fonts, five skill slots, 44px controls, effects and context rails.`);
}finally{await browser?.close();await server?.close();}
