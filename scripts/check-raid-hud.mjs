import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Use an existing browser runtime; no game dependency is added. --serve supports manual review.
const root=fileURLToPath(new URL('../',import.meta.url)),output=join(root,'artifacts/raid-hud');
const seen=new Set(),css=[];
function visit(file){if(seen.has(file)||!existsSync(file))return;seen.add(file);const source=readFileSync(file,'utf8');if(file.endsWith('.css')){css.push(file);return;}for(const [,spec] of source.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)){let target=resolve(dirname(file),spec);if(!extname(target))target+='.ts';if(/\.(?:ts|css)$/.test(target))visit(target);}}
visit(join(root,'src/main.ts'));
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Raid HUD regression fixture</title></head><body><div id="app"></div><script type="module">
${css.map(file=>`import ${JSON.stringify('/'+file.slice(root.length))};`).join('\n')}
import {mountUI,$,icon} from '/src/ui.ts';
import {mountRaidHUD} from '/src/raid-ui.ts';
import {mountUnitFrames} from '/src/unit-frames.ts';
import {createHotbar} from '/src/hotbar.ts';
import {spellsForClass} from '/src/spells.ts';
import {starterGear} from '/src/progression.ts';
import {DEFAULT_APPEARANCE} from '/src/appearance.ts';
mountUI();$('loading').hidden=true;$('chat').classList.add('collapsed');$('game-menus').append($('mobile-mount'));
const showChat=new URLSearchParams(location.search).has('chat');
if(showChat){$('chat').classList.remove('collapsed');$('chat').classList.add('active');$('chat-log-world').textContent='Say hello to the realm.';$('chat-input').placeholder='Say hello, or / for commands…';}
$('chat-toggle').onclick=()=>{$('chat').classList.toggle('collapsed');};
$('chat-close').onclick=()=>{$('chat').classList.add('collapsed');document.body.classList.remove('mobile-chat-open');};
const learnedSpells=spellsForClass('Mage').filter(spell=>!spell.requiredTalent).map(spell=>spell.id);
const player={id:'hero',name:'Aster',appearance:{...DEFAULT_APPEARANCE,className:'Mage'},...starterGear('Mage'),level:60,hp:300,maxHp:600,talents:[],learnedSpells,inventory:{potion:3},hotbar:learnedSpells.slice(0,8),hotbar2:learnedSpells.slice(8,16)};
const hotbar=createHotbar({hud:$('hotbar'),book:$('panel-content'),canEdit:()=>true,cast(){},save:()=>true,notify(){}});
const frames=mountUnitFrames($('unit-frames'),{onPlayer(){},onTargetContext(){},onTargetOfTarget(){}});
frames.update({id:'hero',name:'Aster',level:60,hp:300,maxHp:600,subtitle:'Mage',disposition:'self'},{id:'boss',name:'Horned Apostle',level:60,hp:12000,maxHp:24000,subtitle:'Raid boss',disposition:'hostile',boss:true},{id:'tank',name:'Tank companion',level:60,hp:300,maxHp:600,subtitle:'Knight',disposition:'friendly'});
for(const [id,label,art] of [['raid-button','Raid','menu-raid'],['referrals-button','Referrals','menu-referral'],['nft-button','NFTs','menu-nfts'],['pets-button','Pets','menu-pets']]){const button=document.createElement('button');button.id=id;button.type='button';button.title=label;button.setAttribute('aria-label',label);button.innerHTML=icon(art)+'<span>'+label+'</span>';$('settings-button').before(button);}
for(const button of document.querySelectorAll('#game-menus button'))button.dataset.mobileLabel=button.id==='mobile-mount'?'Mount':button.dataset.bindingName||button.getAttribute('aria-label');
$('mobile-menu-button').onclick=()=>document.body.classList.toggle('mobile-menu-open');
window.sent=[];window.raid={id:'raid',leaderId:'hero',phase:'wings',plane:'arena',lockedSize:20,startedAt:0,phaseEndsAt:0,enrageEndsAt:0,wipes:0,bossId:'boss',bossHp:12000,bossMaxHp:24000,objective:'Dodge the shadow lanes. Break the chains by spreading apart.',members:Array.from({length:20},(_,i)=>({id:i?'member'+i:'hero',name:i?'Raider '+i:'Aster',className:'Mage',level:60,role:'damage',ready:true,online:true,hp:300,maxHp:600,marks:i?0:4,plane:'arena'})),hazards:[{id:'cast',sourceId:'boss',kind:'Shadow Wings',label:'Dodge shadow lanes',plane:'arena',shape:'line',x:0,z:0,r:0,startedAt:0,impactAt:5000,endsAt:6000}],chains:[],guardiansKilled:0,crystalsRemaining:0,seals:[],approach:{roomIndex:7,totalRooms:8,roomName:'Apostle Sanctum',remaining:1,cleared:false,exit:{x:0,z:-27}}};
const hud=mountRaidHUD($('play-ui'),()=>sent.push('open'),id=>sent.push(id),message=>sent.push(message));
window.fixture={mode(mobile){document.body.classList.toggle('mobile-controls',mobile);document.body.classList.toggle('mobile-chat-open',mobile&&showChat);hotbar.sync(player);hud.update(raid,'hero',1000,true);},refresh(){hud.update(raid,'hero',1000,true);},hotbar};
fixture.mode(innerWidth<900);document.body.dataset.ready='true';
</script><style>#world{background:#171324}.brand,.region-intro,.controls-hint,.footer-note{display:none}#loading[hidden]{display:none}</style></body></html>`;
const server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'raid-hud-fixture',configureServer(server){server.middlewares.use('/__raid-hud',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});}}]});
await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}/__raid-hud`;
if(process.argv.includes('--serve')){console.log(url);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void server.close().then(()=>process.exit(0));});}
else {
 let browser;
 try {
  const {chromium}=await import(process.env.MOSSVALE_PLAYWRIGHT||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.MOSSVALE_CHROME?{executablePath:process.env.MOSSVALE_CHROME}:{})});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));mkdirSync(output,{recursive:true});
  for(const [name,width,height,mobile] of [['desktop',1440,900,false],['portrait',390,844,true],['landscape',844,390,true],['short-landscape',568,320,true]]){
   await page.setViewportSize({width,height});await page.goto(url);await page.waitForSelector('[data-ready="true"]',{state:'attached'});await page.evaluate(mobile=>fixture.mode(mobile),mobile);
   assert.equal(await page.locator('#hotbar [data-hotbar-slot]').count(),mobile?4:8);
   const report=await page.evaluate(()=>{const rect=selector=>{const box=document.querySelector(selector).getBoundingClientRect();return {left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height};};return {header:rect('.raid-hud-heading'),status:rect('.raid-hud-personal'),cast:rect('.raid-hud-cast'),roster:rect('.raid-hud-roster'),skills:[...document.querySelectorAll('#hotbar [data-hotbar-slot]')].map(button=>{const b=button.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};})};});
   const fits=box=>box.left>=0&&box.top>=0&&box.right<=width+1&&box.bottom<=height+1;
   for(const [key,value] of Object.entries(report))for(const box of Array.isArray(value)?value:[value])assert(fits(box),name+' '+key+' fits');
   if(mobile)for(const box of report.skills){assert(box.width>=44&&box.height>=44);assert(box.left>=report.status.right||box.top>=report.status.bottom,'personal mechanics stay clear of skills');}
   assert.match(await page.locator('.raid-hud-personal').innerText(),/Marks 4 \/ 5/);assert.match(await page.locator('.raid-hud-cast').innerText(),/Shadow Wings/);
   await page.screenshot({path:join(output,name+'.png')});
   const reachable=async()=>{for(const selector of ['#mobile-sprint','#jump-button','#mobile-target','#mobile-clear','#mobile-interact','#hotbar .hotbar-page'])assert(await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),name+' '+selector+' remains reachable');};
   if(mobile)await reachable();
   await page.click('.raid-hud-roster summary');assert(await page.locator('.raid-hud-roster').evaluate(node=>node.open));
   if(mobile)await reachable();
   if(mobile)assert(await page.locator('.raid-hud-roster').evaluate(node=>node.getBoundingClientRect().right<=160),'expanded roster stays left');
   await page.screenshot({path:join(output,name+'-roster.png')});
   await page.click('.raid-hud-roster summary');await page.evaluate(()=>{raid.members[0].hp=0;fixture.refresh();});assert(await page.locator('.raid-hud-fallen').isVisible());
   if(mobile)await reachable();await page.screenshot({path:join(output,name+'-fallen.png')});
   await page.evaluate(()=>{raid.phase='approach';raid.approach={roomIndex:0,totalRooms:8,roomName:'Void Vestibule',remaining:0,cleared:true,exit:{x:0,z:-27}};raid.objective='Chamber cleared. Regroup at the north gate.';raid.hazards=[];raid.members[0].hp=300;fixture.refresh();});
   assert.equal(await page.locator('.raid-hud-personal').isVisible(),false,'approach does not repeat the objective in personal status');assert.equal((await page.locator('#raid-hud').innerText()).split('Void Vestibule').length,2,'room name appears once');
   await page.click('#raid-hud [data-raid-action=advance]');assert.equal(await page.evaluate(()=>sent.at(-1).type),'raidAdvance');
   if(mobile){await page.click('#mobile-menu-button');await page.screenshot({path:join(output,name+'-menu.png')});}
   else for(const id of ['raid-button','referrals-button','nft-button'])assert.equal(await page.locator('#'+id+' > span:not(.item-art)').isVisible(),false,'desktop icon strip hides overflowing inline labels');
  }
  assert.deepEqual(errors,[]);console.log('PASS raid HUD and four-slot paging across desktop, portrait and two landscape sizes. Screenshots: '+output);
 } finally {await browser?.close();await server.close();}
}
