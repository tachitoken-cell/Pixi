import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const collectionRuntime=stripTypeScriptTypes(main.slice(main.indexOf('function renderCollectionContent('),main.indexOf("let petPanelKey=''")));
const collectionInput=main.match(/^ if\(input instanceof HTMLInputElement&&input.hasAttribute\('data-collection-search'\)[^\n]+/m)?.[0];
const collectionChange=main.match(/^ if\(select instanceof HTMLInputElement&&select.hasAttribute\('data-collection-collected'\)[^\n]+/m)?.[0];
assert(collectionInput&&collectionChange&&collectionRuntime.includes('function renderCollectionContent'), 'actual collection wiring found');

// Execute the shipped renderers and controls in a real DOM. The gallery owns screenshots.
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="hotbar" hidden></div><dialog id="panel" class="panel"><div class="panel-heading"><h2 id="panel-title">Skills</h2></div><div id="panel-content"></div></dialog><script type="module">
import '/src/style.css';import '/src/art.css';import '/src/progression.css';import '/src/skills.css';import '/src/character-bags.css';import '/src/hotbar.css';import '/src/adventure.css';import '/src/mobile-controls.css';import '/src/mobile-layout.css';import '/src/benji-ui.css';import '/src/talents.css';
import {createHotbar,renderSpellbook} from '/src/hotbar.ts';
import {renderTalents,mountTalentBranches} from '/src/progression-ui.ts';
import {renderCrafting} from '/src/adventure-ui.ts';
import {starterGear} from '/src/progression.ts';
import {renderPetCollection,renderMountCollection} from '/src/pet-ui.ts';
import {MOUNTS} from '/src/travel.ts';
import {defaultHotbar,SPELLS} from '/src/spells.ts';
const player={id:'skills-check',name:'Willow',appearance:{className:'Ranger'},level:20,hp:80,maxHp:100,inventory:{potion:3,wood:20,herb:20,crystal:20,relic:2},gold:100,craftingXp:0,carriedItems:{},skills:{fishing:0,mining:0,woodcutting:0,herbalism:0},talents:[],characterCreated:true,learnedSpells:['arrow','power-shot'],hotbar:defaultHotbar('Ranger',20,['arrow','power-shot']),hotbar2:Array(10).fill(null),abilityCooldowns:{},...starterGear('Ranger')};
const panel=document.querySelector('#panel'),content=document.querySelector('#panel-content'),saves=[],notices=[];
let editable=true;
const hotbar=createHotbar({hud:document.querySelector('#hotbar'),book:content,canEdit:()=>editable,cast:()=>false,save:slots=>{saves.push(slots);return true;},notify:message=>notices.push(message)});
mountTalentBranches(content);
const $=id=>document.getElementById(id),collectionFilters={search:'',collectedOnly:false},localization={translate(){}},previewCalls={created:0,disposed:0};
let collectionPreview;
function disposeCollectionPreview(){collectionPreview?.dispose();collectionPreview=undefined;}
function createCollectionPreview(){previewCalls.created++;return{show(){},dispose(){previewCalls.disposed++;}};}
${collectionRuntime}
function renderPets(){renderCollectionContent(renderPetCollection(player,true,Date.now(),undefined,collectionFilters));}
function renderMounts(){renderCollectionContent(renderMountCollection(player,true,MOUNTS[0].id,MOUNTS[0].id,true,collectionFilters));}
content.addEventListener('input',event=>{const input=event.target;${collectionInput}});
content.addEventListener('change',event=>{const select=event.target;${collectionChange}});
function collectionMode(kind){panel.dataset.mode=kind;collectionFilters.search='';collectionFilters.collectedOnly=false;player.ownedPets=['moss-fox'];player.ownedMounts=[MOUNTS[0].id];player.ridingRank=1;kind==='pets'?renderPets():renderMounts();}
function mode(name,near=false){panel.dataset.mode=name;content.innerHTML=name==='spells'?renderSpellbook(player,hotbar.slots):name==='talents'?renderTalents(player):renderCrafting(player,near);if(name==='spells')hotbar.sync(player);}
hotbar.sync(player);mode('spells');panel.showModal();
window.fixture={player,mode,collectionMode,previewCalls,hotbar,saves,notices,SPELLS,setEditable:value=>editable=value};document.body.dataset.ready='true';
</script></body></html>`;
const server=await createServer({configFile:false,root:new URL('../',import.meta.url).pathname,server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/*']}},plugins:[{name:'skills-social-check',configureServer(server){server.middlewares.use('/__skills-test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});}}]});
let browser;
try {
 await server.listen();const port=server.httpServer.address().port;
 const {chromium}=await import(process.env.MOSSVALE_PLAYWRIGHT||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.MOSSVALE_CHROME?{executablePath:process.env.MOSSVALE_CHROME}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${port}/__skills-test`);await page.waitForSelector('[data-ready=true]');
 const search=page.locator('[data-spell-search-input]');await search.fill('power shot');
 assert.equal(await page.locator('[data-spell-search]:not([hidden])').count(),1,'search filters actual names/descriptions');
 await search.fill('no-skill-matches');assert(await page.locator('.spell-search-empty').isVisible());await search.fill('');
 const lockedId=await page.locator('[data-book-ability][disabled]').first().getAttribute('data-book-ability');
 await page.locator(`[data-spell-inspect="${lockedId}"]`).click();
 assert.equal(await page.locator('[data-spell-inspector]').getAttribute('data-ability'),lockedId);
 assert.equal(await page.locator('[data-spell-inspector] [data-book-place]').count(),0,'locked inspection cannot equip or learn');
 assert.equal(await page.locator('[data-spell-inspector] [data-find-trainer]').count(),1);
 assert.equal(await page.evaluate(()=>fixture.saves.length),0);
 await page.locator('[data-spell-inspect="power-shot"]').click();
 const initialSlots=await page.evaluate(()=>fixture.hotbar.slots),empty=initialSlots.slice(0,10).indexOf(null);
 await page.locator('[data-book-place="power-shot"]').click();
 assert.equal(await page.evaluate(index=>fixture.hotbar.slots[index],empty),'power-shot','inspector uses the current bank first empty slot');
 assert.equal((await page.evaluate(()=>fixture.saves.at(-1))).length,20,'save retains both desktop banks');
 assert.equal(await page.locator('[data-book-ability="power-shot"]').evaluate(node=>node.closest('.spell-catalog-item').querySelector('.spell-onbar').hidden),false);
 const saved=await page.evaluate(()=>fixture.saves.length);
 await page.evaluate(()=>fixture.setEditable(false));await page.locator('[data-spell-inspect="mend"]').click();await page.locator('[data-book-place="mend"]').click();
 assert.equal(await page.evaluate(()=>fixture.saves.length),saved,'onboarding edit lock applies to inspector actions');await page.evaluate(()=>fixture.setEditable(true));
 await page.locator('[data-spell-inspect="power-shot"]').click();
 await page.evaluate(()=>{fixture.hotbar.updateCooldowns(Date.now());});
 assert.equal(await page.locator('[data-spell-inspector] .spell-meta').innerText(),await page.locator('[data-book-ability="power-shot"] .spell-meta').innerText(),'live timing refreshes inspector without replacing its action');
 await page.evaluate(()=>fixture.mode('talents'));
 assert.equal(await page.locator('.talent-branch:visible').count(),3,'desktop shows all three actual paths');
 const talentsBefore=await page.evaluate(()=>JSON.stringify(fixture.player.talents));
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.body.classList.add('mobile-controls'));
 assert.equal(await page.locator('.talent-branch:visible').count(),1);
 await page.locator('.talent-branch-tabs label').nth(2).click();
 assert.equal(await page.locator('.talent-branch:visible').getAttribute('data-branch-index'),'2');
 assert.equal(await page.evaluate(()=>JSON.stringify(fixture.player.talents)),talentsBefore,'branch navigation cannot purchase talents');
 await page.evaluate(()=>fixture.mode('talents'));assert.equal(await page.locator('.talent-branch:visible').getAttribute('data-branch-index'),'2','snapshot rerender retains chosen path');
 await page.evaluate(()=>{fixture.player.id='another-character';fixture.mode('talents');});assert.equal(await page.locator('.talent-branch:visible').getAttribute('data-branch-index'),'0','character change resets navigation');
 await page.evaluate(()=>fixture.mode('spells'));
 assert.equal(await page.locator('.hotbar-editor-slots [data-hotbar-slot]').count(),5);
 for(let i=0;i<4;i++){
  assert.deepEqual(await page.locator('.hotbar-editor-slots [data-hotbar-slot]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.hotbarSlot))),Array.from({length:5},(_,j)=>i*5+j));
  await page.locator('.hotbar-editor-slots [data-hotbar-page]').click();
 }
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const mode of ['spells','talents','crafting']){
   await page.evaluate(name=>fixture.mode(name),mode);
   const sizes=await page.locator('#panel-content').evaluate(node=>({scroll:node.scrollWidth,width:node.clientWidth}));
   assert(sizes.scroll<=sizes.width+2,`${mode} does not overflow horizontally at ${viewport.width}px (${JSON.stringify(sizes)})`);
  }
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>fixture.mode('crafting',false));
 assert.equal(await page.locator('[data-craft]:enabled').count(),0,'every craft action requires workshop proximity');
 assert(await page.locator('[data-find-workshop]').isVisible());
 await page.evaluate(()=>fixture.mode('crafting',true));assert(await page.locator('[data-craft]:enabled').count()>0);
 assert.equal(await page.locator('[data-crafting-rank]').count(),4,'all four live profession ranks retain expandable recipes');
 const lastRank=page.locator('[data-crafting-rank]').last();await lastRank.locator('summary').click();assert(await lastRank.evaluate(node=>node.open));
 assert.equal(await lastRank.locator('[data-craft]:enabled').count(),0,'expanding a locked rank does not unlock recipes');
 for(const kind of ['pets','mounts']){
  await page.evaluate(kind=>fixture.collectionMode(kind),kind);
  const collectionSearch=page.locator('[data-collection-search]');
  await collectionSearch.fill('nothing-matches');
  assert(await page.locator('.collection-empty').isVisible());
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'collection-search','no-result repaint keeps search focus');
  const wanted=kind==='pets'?'moss':'horse';
  await collectionSearch.evaluate(node=>node.setSelectionRange(0,node.value.length));await page.keyboard.insertText(wanted);
  assert.equal(await collectionSearch.inputValue(),wanted);
  assert.equal(await page.evaluate(()=>document.activeElement?.selectionStart),wanted.length,'search caret survives returning to results');
  assert.equal(await page.locator('.collection-empty').count(),0,'search can recover from no results');
  await collectionSearch.evaluate(node=>node.setSelectionRange(0,0));await page.keyboard.insertText('x');assert.equal(await collectionSearch.inputValue(),'x'+wanted);
  await collectionSearch.press('Backspace');assert.equal(await collectionSearch.inputValue(),wanted,'editing at retained caret does not reorder text');
  const owned=page.locator('[data-collection-collected]');await owned.check();assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-collection-collected')),true,'filter focus survives repaint');
 }
 assert((await page.evaluate(()=>fixture.previewCalls.disposed))>=2,'empty filters dispose the missing preview');
 assert.deepEqual(errors,[]);
 console.log('PASS: actual spell search/locked inspector/equip/save lock/live timing; 20 mobile hotbar slots; talent desktop/mobile navigation and retained selection; workshop proximity/rank gates; portrait and landscape horizontal bounds; real collection input/filter routing retains focus and caret across empty results.');
} finally {await browser?.close();await server.close();}
