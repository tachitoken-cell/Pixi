import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname,extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),output=join(root,'artifacts/adventure-board');
const seen=new Set(),css=[];
function visit(file){if(seen.has(file)||!existsSync(file))return;seen.add(file);const source=readFileSync(file,'utf8');if(file.endsWith('.css')){css.push(file);return;}for(const [,spec] of source.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)){let target=resolve(dirname(file),spec);if(!extname(target))target+='.ts';if(/\.(?:ts|css)$/.test(target))visit(target);}}
visit(join(root,'src/main.ts'));
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adventure board component check</title></head><body><div id="app"></div><script type="module">
${css.map(file=>`import ${JSON.stringify('/'+file.slice(root.length))};`).join('\n')}
import {mountUI,$} from '/src/ui.ts';
import {renderAdventureJournal,renderContracts} from '/src/adventure-ui.ts';
import {TREASURE_MAP_SITES} from '/src/treasure-maps.ts';
import {CONTRACTS,newContracts} from '/src/adventure.ts';
mountUI();$('loading').hidden=true;const panel=$('panel');panel.dataset.mode='contracts';$('panel-title').textContent='The adventure board';$('panel-eyebrow').textContent='GREENWOOD · MOSSVALE';
const local=CONTRACTS.filter(c=>c.zone==='greenwood');window.player={id:'preview',name:'Preview adventurer',level:30,hp:100,gold:200000,economyVersion:1,contracts:newContracts(),meadGodPaid:true,carriedItems:{},treasureMap:{id:'preview-map',siteId:TREASURE_MAP_SITES[0].id,stage:'search',level:30}};player.contracts.active[local[0].id]=1;
let selected='treasure',page=0;window.actions=[];
window.render=()=>{$('panel-content').innerHTML=renderAdventureJournal(player,false,'',selected)+renderContracts(player,'greenwood',true,1000000,page);};
$('panel-content').addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;const data=button.dataset;if(data.adventureQuest){selected=data.adventureQuest;render();document.getElementById('adventure-detail').focus({preventScroll:true});}else if(data.contractPage){page=Number(data.contractPage);render();}else actions.push({...data});});
$('close-panel').onclick=()=>panel.close();document.body.classList.toggle('mobile-controls',innerWidth<900);render();panel.showModal();document.body.dataset.ready='true';
</script><style>#world{background:#16251f}#loading[hidden]{display:none}.brand,.region-intro,.controls-hint,.footer-note{display:none}</style></body></html>`;
const server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'adventure-board-fixture',configureServer(server){server.middlewares.use('/__adventure-board',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});}}]});
await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}/__adventure-board`;
if(process.argv.includes('--serve')){console.log(url);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void server.close().then(()=>process.exit(0));});}
else{let browser;try{
 const {chromium}=await import(process.env.MOSSVALE_PLAYWRIGHT||'playwright');browser=await chromium.launch({headless:true,...(process.env.MOSSVALE_CHROME?{executablePath:process.env.MOSSVALE_CHROME}:{})});
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));mkdirSync(output,{recursive:true});
 for(const [name,width,height] of [['desktop',1440,1000],['portrait',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});await page.goto(url);await page.waitForSelector('[data-ready="true"]',{state:'attached'});await page.evaluate(()=>document.fonts.ready);
  assert(await page.locator('#panel').evaluate(node=>{const b=node.getBoundingClientRect();return b.left>=0&&b.top>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1&&node.scrollWidth<=node.clientWidth+1;}),name+' panel fits without horizontal scroll');
  assert(await page.locator('.adventure-journal').evaluate(node=>node.scrollWidth<=node.clientWidth+1),name+' journal fits');
  for(const button of await page.locator('#panel button').all())assert((await button.boundingBox()).height>=44,name+' minimum touch target');
  assert.equal(await page.locator('[data-adventure-quest="treasure"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.quest-notice').count(),3);assert(await page.locator('[data-track-treasure-map]').count());
  assert(await page.locator('#panel').evaluate(node=>getComputedStyle(node).borderImageSource.includes('/ui/redesign/panel-frame.svg')),name+' supplied frame used');
  assert.equal(await page.locator('#panel img').evaluateAll(images=>images.filter(image=>!image.complete||image.naturalWidth===0).map(image=>image.src)).then(images=>images.length),0,'all quest artwork loads');
  await page.screenshot({path:join(output,name+'.png')});
  await page.locator('[data-adventure-quest="hearthling"]').click();assert.equal(await page.locator('[data-adventure-quest="hearthling"]').getAttribute('aria-pressed'),'true');assert(await page.locator('[data-open-hearthling]').count());assert.equal(await page.locator('[data-track-treasure-map]').count(),0);
  await page.screenshot({path:join(output,name+'-title.png')});
  await page.locator('.quest-board-meta').scrollIntoViewIfNeeded();await page.screenshot({path:join(output,name+'-notices.png')});
  await page.locator('[data-contract-page="1"]').click();assert.equal(await page.locator('.quest-board').getAttribute('data-contract-page-current'),'1');
  await page.locator('[data-contract-page="0"]').click();assert.equal(await page.locator('.quest-board').getAttribute('data-contract-page-current'),'0');
  const accept=page.locator('[data-accept-contract]:not(:disabled)').first();await accept.click();assert(await page.evaluate(()=>actions.at(-1).acceptContract));
 }
 assert.deepEqual(errors,[]);console.log('PASS live Adventure Board components: selected details, paging/actions, supplied frame, image loading, touch targets and desktop/portrait/landscape layout. Screenshots: '+output);
}finally{await browser?.close();await server.close();}}
