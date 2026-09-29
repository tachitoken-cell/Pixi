import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.MOSSVALE_PLAYWRIGHT||'playwright');
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {BENJI_UI_VIEWS as views,BENJI_UI_VIEWPORTS,benjiViewsForViewport,BENJI_UI_CAPTURE_COUNT} from './lib/benji-ui-review-cases.mjs';
const out=resolve('artifacts/benji-ui'),base=process.env.MOSSVALE_UI_URL||'http://127.0.0.1:5173',recheck=process.argv.includes('--recheck'),fullCheck=process.argv.includes('--full'),styleCheck=fullCheck||process.argv.includes('--mossvale-style');
const only=new Set((process.argv.find(value=>value.startsWith('--only='))?.slice(7)||'').split(',').filter(Boolean));
mkdirSync(out,{recursive:true});

const browser=await chromium.launch({headless:true,...(process.env.MOSSVALE_CHROME?{executablePath:process.env.MOSSVALE_CHROME}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage(),results=[];let errors=[];page.on('pageerror',e=>errors.push(e.message));
// Wallet RPC is answered in-page. Only local assets and the game's two font hosts may load.
await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url());const font=url.protocol==='https:'&&((url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')||(url.hostname==='fonts.gstatic.com'&&request.resourceType()==='font'));return url.origin===new URL(base).origin||font?route.continue():route.abort('blockedbyclient');});
try { for(const [mode,width,height] of BENJI_UI_VIEWPORTS){
 await page.setViewportSize({width,height});
 for(const view of (styleCheck&&!fullCheck?(mode==='narrow'?['login']:mode==='landscape'?['login','shop']:['hud','login','training','shop','journal','story']):recheck&&!fullCheck?(mode==='narrow'?['login']:mode==='landscape'?['login','shop']:['training','shop','journal']):benjiViewsForViewport(mode))){
  if(only.size&&!only.has(mode+':'+view))continue;
  errors=[];await page.goto(base+'/artifacts/benji-ui/view.html?view='+view+(mode==='desktop'?'':'&mobile'));
  try{await page.waitForSelector('[data-ready=true]',{state:'attached',timeout:25000});}catch(e){errors.push('ready timed out');}
  const fonts=await page.evaluate(async()=>{const proof={};for(const family of ['Marcellus','DM Sans']){try{const loaded=await document.fonts.load('16px "'+family+'"','Mossvale');proof[family]={loaded:loaded.length>0&&loaded.every(face=>face.status==='loaded'),checked:document.fonts.check('16px "'+family+'"','Mossvale')};}catch(error){proof[family]={loaded:false,checked:false,error:String(error)};}}await document.fonts.ready;return proof;});
  for(const [family,proof] of Object.entries(fonts))if(!proof.loaded||!proof.checked)errors.push('Original font failed to load: '+family);
  const layout=await page.evaluate(()=>{const active=[...document.querySelectorAll('#panel[open],[id$="-window"]:not([hidden]),#login:not([hidden]),#loading:not([hidden]),dialog.turnkey-wallet[open],body.mobile-menu-open #game-menus')];return{surfaces:active.map(node=>{const r=node.getBoundingClientRect();const frameOutset=Math.max(0,...['::before','::after'].map(pseudo=>{const style=getComputedStyle(node,pseudo);return style.position==='absolute'&&style.content!=='none'?-(parseFloat(style.right)||0):0;}));const contentOutside=[...node.querySelectorAll('*')].some(child=>{const box=child.getBoundingClientRect();return box.width>0&&box.right>r.right+1;});return{id:node.id||node.className,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom,frameOutset,overflow:node.scrollWidth>node.clientWidth+1&&(contentOutside||node.scrollWidth>node.clientWidth+frameOutset+1)};}),brokenImages:[...document.images].filter(i=>i.offsetWidth&&i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),font:getComputedStyle(document.querySelector('#panel')).fontFamily};});
  layout.fonts=fonts;
  const issues=[...errors,...layout.brokenImages.map(src=>'Broken image: '+src),...layout.surfaces.flatMap(r=>r.left<-.5||r.top<-.5||r.right>width+.5||r.bottom>height+.5?[r.id+' outside viewport']:r.overflow?[r.id+' horizontal overflow']:[])];
  const contentProof=await page.evaluate(view=>{
   const count=selector=>document.querySelectorAll(selector).length;
   const proof={};
   if(view==='talents')proof.branchNavigation=count('[data-talent-branch]');
   if(view==='mobile-menu'){proof.menuButtons=count('#game-menus > button');proof.missingLabels=[...document.querySelectorAll('#game-menus > button')].filter(button=>!button.dataset.mobileLabel).map(button=>button.id);proof.heading=!!document.querySelector('#mobile-menu-title')?.getClientRects().length;}
   if(view==='hud')proof.frames=['profile','unit-target','unit-focus'].map(id=>({id,shown:!!document.getElementById(id)?.getClientRects().length}));
   if(view==='instant-combat'){proof.rewardRounds=count('.ic-gold-rounds>div');proof.upcoming=count('.ic-event-upcoming>li');}
   if(view==='raid-collection'){proof.cosmetics=count('.raid-cosmetic-cards>article');proof.evolutionStages=count('.raid-evolution-steps>li');}
   if(view==='auction')proof.listings=count('[data-listing]');
   if(view==='friends')proof.friendRows=count('[data-friend-id]');
   if(view==='bank')proof.items=count('[data-bank-item]');
   if(view==='nfts')proof.collectionTabs=count('[data-nft-tab]');
   if(view==='dungeon')proof.catalog=count('[data-choose-dungeon]');
   if(view==='wallet'){proof.balances=[...document.querySelectorAll('.turnkey-asset-amount')].map(node=>node.textContent);proof.tabs=count('.turnkey-tabs>button');}
   return proof;
  },view);layout.content=contentProof;
  if(view==='mobile-menu'){if(!contentProof.heading)issues.push('Mobile menu heading is not visible');if(contentProof.missingLabels.length)issues.push('Mobile menu controls lack labels: '+contentProof.missingLabels.join(', '));if(contentProof.menuButtons<18)issues.push('Mobile menu fixture has '+contentProof.menuButtons+' of 18 required controls');}
  if(view==='instant-combat'&&(contentProof.rewardRounds!==5||contentProof.upcoming!==4))issues.push('Instant Combat fixture is incomplete');
  if(view==='raid-collection'&&(contentProof.cosmetics!==3||contentProof.evolutionStages!==3))issues.push('Raid Collection fixture is incomplete');
  if(view==='auction'&&contentProof.listings<2)issues.push('Auction fixture has no populated marketplace');
  if(view==='friends'&&contentProof.friendRows<2)issues.push('Friends fixture is empty');
  if(view==='bank'&&contentProof.items<4)issues.push('Bank fixture is empty');
  if(view==='nfts'&&contentProof.collectionTabs<3)issues.push('NFT collection tabs are missing');
  if(view==='dungeon'&&contentProof.catalog<7)issues.push('Dungeon catalog is missing');
  if(view==='wallet'&&(contentProof.balances.length!==2||contentProof.balances.some(value=>/Loading|unavailable/.test(value))||contentProof.tabs<5))issues.push('Wallet fixture did not load its true renderer');
  if(mode==='mobile'&&view==='inventory'){const visible=await page.evaluate(()=>{const viewport=document.querySelector('.bag-windows').getBoundingClientRect(),slot=document.querySelector('.bag-grid .bag-slot').getBoundingClientRect();return{visibleHeight:Math.max(0,Math.min(slot.bottom,viewport.bottom)-Math.max(slot.top,viewport.top)),slotHeight:slot.height};});layout.inventoryFirstRow=visible;if(visible.visibleHeight<visible.slotHeight-1)issues.push('Inventory first row is clipped with item details open');}
  if(view==='training'||view==='shop'){const heights=await page.locator('.training-primary').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));layout.actionHeights=heights;if(heights.some(h=>h>0&&h<44))issues.push('NPC primary action is below 44px');}
  if(mode==='desktop'&&view==='journal'){const box=await page.locator('.story-journal-actions').boundingBox();if(!box||box.y+box.height>height)issues.push('Quest actions below initial desktop viewport');}
  if(mode==='desktop'&&view==='inventory'){const box=await page.locator('#panel').boundingBox();if(box.width>1101||box.height>721)issues.push('Bag workspace exceeds compact desktop cap');}
  try{await page.screenshot({path:out+'/'+(styleCheck?'mossvale-':'')+mode+'-'+view+'.png',animations:'disabled',timeout:60000});}catch(e){issues.push('screenshot timeout');}results.push({mode,view,issues,layout});console.log(mode,view,issues.length?issues.join('; '):'PASS');
 }
} } finally { await browser.close(); }
const reportPath=out+(styleCheck?'/review-mossvale-style.json':'/review.json');
const previous=(only.size||recheck&&!styleCheck)&&existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):[],keys=new Set(results.map(row=>row.mode+':'+row.view)),combined=[...previous.filter(row=>!keys.has(row.mode+':'+row.view)),...results];
writeFileSync(out+(styleCheck?'/review-mossvale-style.json':'/review.json'),JSON.stringify(combined,null,2));
if(fullCheck&&!only.size)assert.equal(combined.length,BENJI_UI_CAPTURE_COUNT,'Every source surface must have desktop, mobile and landscape evidence');
assert.deepEqual(combined.filter(row=>row.issues.length),[],'All reviewed surfaces must fit with loaded imagery and no runtime errors');
console.log('PASS Benji UI: '+combined.length+' captured viewport views.');
