import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createGameServer} from '../server.mjs';
import {starterGear,maxHealth} from '../src/progression.ts';
import {storyQuestById} from '../src/story-quests.ts';
import {STORY_OBJECTS} from '../src/story-world-data.ts';
import {canTraverse} from '../src/realm.ts';
import {COMMUNITY_VERSION} from '../src/community.ts';
const dataDir=mkdtempSync(join(tmpdir(),'mossvale-story-browser-')),out=resolve('artifacts/story-game');mkdirSync(out,{recursive:true});
const token=randomBytes(32).toString('base64url'),key=createHash('sha256').update(token).digest('hex'),id=randomUUID(),questId='story-the-old-campfire';
const object=STORY_OBJECTS.find(object=>object.id==='story-abandoned-pack'),completed=new Set();
function unlock(id){for(const required of storyQuestById(id).requires??[]){unlock(required);completed.add(required);}}unlock(questId);
const position=[1.5,-1.5,2,-2].flatMap(dz=>[0,1.5,-1.5].map(dx=>({x:object.x+dx,z:object.z+dz}))).find(point=>canTraverse(point,object)&&canTraverse(point,point));assert(position);
const hero={id,name:'Quest playtest',appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},coordinateVersion:2,zone:object.zone,...position,rotation:0,level:storyQuestById(questId).requiredLevel,xp:0,gold:100,characterCreated:true,talents:[],...starterGear('Ranger'),inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},quest:{stage:0,kills:0,crystals:0},onboarding:{version:1,looted:true,bagViewed:true,gearViewed:true,completed:true},storyQuests:{active:{[questId]:[0]},completed:[...completed]}};hero.hp=hero.maxHp=maxHealth(hero);
writeFileSync(join(dataDir,'players.json'),JSON.stringify({[key]:{characters:[hero],communityRulesVersion:COMMUNITY_VERSION}}));
const mobile=process.argv.includes('--mobile');
let game,browser;const errors=[],snapshots=[];
try{
 game=createGameServer({port:0,host:'127.0.0.1',dataDir,keycloak:null,databaseUrl:'',economyVersion:1});const gamePort=await game.start();

 const {chromium}=await import(process.env.MOSSVALE_PLAYWRIGHT||'playwright');browser=await chromium.launch({headless:true,...(process.env.MOSSVALE_CHROME?{executablePath:process.env.MOSSVALE_CHROME}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});page.on('pageerror',error=>{errors.push(error.message);console.log('Browser error:',error.message);});page.on('console',message=>{if(message.type()==='error')console.log('Browser console:',message.text());});page.on('websocket',socket=>socket.on('framereceived',({payload})=>{try{const data=JSON.parse(payload);if(data.type==='snapshot')snapshots.push(data);}catch{}}));
 await page.addInitScript(token=>{localStorage.setItem('mossvale-session',token);localStorage.setItem('mossvale-graphics',JSON.stringify({resolution:.5,renderDistance:120,shadows:'off',textures:'low',effects:'off',bloom:false,reflections:false}));},token);await page.goto(`http://127.0.0.1:${gamePort}/`);console.log('Built game loaded.');
 await page.getByRole('button',{name:'Decline X cookies',exact:true}).click({timeout:60000});console.log('Advertising declined.');
 await page.locator('#login-guest').waitFor({state:'visible',timeout:60000});await page.locator('#login-guest').click();console.log('Guest selected.');
 await page.locator('#roster-enter').waitFor({state:'visible',timeout:60000});await page.locator('#roster-enter').click();console.log('Character selected.');
 await page.locator('#label-story-abandoned-pack').waitFor({state:'visible',timeout:60000});
 // Use the normal nearest-object interaction while standing beside the visible prop.
 await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
 // Exercise the built client's journal and bag controls before interacting with the prop.
 assert.equal(await page.locator('#quest-title').innerText(),storyQuestById(questId).title);
 await page.locator('#quest-button').click();await page.locator('#panel[data-mode=journal][open]').waitFor();
 if(mobile)await page.locator(`[data-story-select="${questId}"]`).click();
 await page.locator(`[data-story-find="${questId}"]`).click();await page.locator('#panel').waitFor({state:'hidden'});
 // The first object is within arrival range, so its waypoint may clear immediately.
 assert.equal(await page.locator('#quest-title').innerText(),storyQuestById(questId).title);
 if(mobile){await page.locator('#mobile-menu-button').click();await page.locator('#game-menus[aria-modal=true]').waitFor();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'mobile-mount');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'mobile-menu-close');}
 await page.locator('#inventory-button').click();
 const search=page.locator('[data-bag-search]');await search.fill('potion');
 await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-bag-search'));
 await page.locator('[data-bag-contents="list"]').click();
 assert.equal(await page.locator('[data-bag-contents="list"]').getAttribute('aria-pressed'),'true');
 await search.fill('zznomatch');assert.equal(await page.locator('.bag-slot[data-inspect-item]').count(),0);
 await search.fill('pot');await search.press('End');await search.press('i');
 assert.equal(await search.inputValue(),'poti');assert.equal(await search.evaluate(e=>e.selectionStart),4);
 await page.locator('.bag-slot[data-inspect-item]').first().click();assert(await page.locator('#bag-item-details').isVisible(),'selecting an item opens an initially empty inspector');
 await page.locator('[data-close-item]').click();await page.waitForFunction(()=>document.querySelector('#bag-item-details')?.classList.contains('is-empty'));
 assert.equal(await page.locator('#bag-item-details button,#bag-item-details [data-item-more]').count(),0,'dismissed inspector has no item actions');
 const beforeDismissedUpdate=snapshots.length,dismissedDeadline=Date.now()+10000;while(snapshots.length===beforeDismissedUpdate&&Date.now()<dismissedDeadline)await new Promise(resolve=>setTimeout(resolve,50));assert(snapshots.length>beforeDismissedUpdate,'receive a snapshot after dismissal');
 assert(await page.locator('#bag-item-details').evaluate(node=>node.classList.contains('is-empty')),'a server update keeps the dismissed inspector empty');
 assert.equal(await page.locator('#bag-item-details button,#bag-item-details [data-item-more]').count(),0,'a server update does not restore dismissed item actions');
 await page.locator('[data-close-bag]').click();
 await page.keyboard.press('e');
 const deadline=Date.now()+10000;while(Date.now()<deadline&&!snapshots.at(-1)?.players.find(player=>player.id===id)?.storyQuests.active[questId]?.[0])await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(snapshots.at(-1)?.players.find(player=>player.id===id)?.storyQuests.active[questId][0],1,'visible quest prop completes through normal client interaction');
 assert(snapshots.at(-1)?.players.find(player=>player.id===id)?.hp>0,'a character at the intended quest level survives the interaction');
 await page.waitForFunction(()=>document.querySelector('#quest-state')?.textContent==='Ready to return');
 await page.locator('#quest-button').click();if(mobile&&await page.locator(`[data-story-select="${questId}"]`).isVisible())await page.locator(`[data-story-select="${questId}"]`).click();await page.locator(`[data-story-find="${questId}"]`).click();
 await page.waitForFunction(()=>/Rowan|keeper|campfire|Fenn|Mira/i.test(document.querySelector('#waypoint-name')?.textContent??''));
 assert.match(await page.locator('#waypoint-name').innerText(),/Rowan|keeper|campfire|Fenn|Mira/i);
 if(mobile){
  assert.equal(await page.locator('#hotbar .hotbar-slot').count(),5,'five mobile skill slots');
  await page.locator('#mobile-menu-button').click();await page.locator('#pets-button').click();
  const filter=page.locator('[data-collection-search]');await filter.fill('zz-no-match');assert.equal(await page.locator('#collection-preview').count(),0);
  await filter.fill('moss');await filter.press('End');await filter.press(' ');assert.equal(await filter.inputValue(),'moss ');assert.equal(await filter.evaluate(e=>e.selectionStart),5);
  await page.locator('[data-collection-collected]').check();assert.equal(await page.locator('[data-collection-select]').count(),0,'empty owned collection filter');
  await page.locator('[data-collection-collected]').uncheck();await filter.fill('');assert(await page.locator('[data-collection-select]').count()>0);
  await page.locator('#close-panel').click();await page.locator('#mobile-menu-button').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#mobile-menu-button').getAttribute('aria-expanded'),'false');
 }
 await page.screenshot({path:join(out,mobile?'quest-object-complete-mobile.png':'quest-object-complete.png'),timeout:60000,animations:'disabled'});
 assert.deepEqual(errors,[],'actual game has no uncaught browser errors');await browser.close();browser=undefined;await game.stop();game=undefined;
 const saved=JSON.parse(readFileSync(join(dataDir,'players.json'),'utf8'))[key].characters[0];assert.equal(saved.storyQuests.active[questId][0],1,'browser-earned objective persists');
 for(const file of ['failure.txt','failure.png','quest-object.png'])rmSync(join(out,file),{force:true});
 writeFileSync(join(out,mobile?'result-mobile.json':'result.json'),JSON.stringify({questId,level:hero.level,object:object.id,x:object.x,z:object.z,complete:true,errors},null,2));console.log('PASS actual game browser: seeded local roster, enter realm, authored quest prop visible, normal interaction completes objective, clean console and persisted progress. '+out);
}catch(error){const page=browser?.contexts()[0]?.pages()[0];if(page){writeFileSync(join(out,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText());await page.screenshot({path:join(out,'failure.png'),timeout:10000}).catch(()=>{});}throw error;}finally{await browser?.close();await game?.stop();rmSync(dataDir,{recursive:true,force:true});}
