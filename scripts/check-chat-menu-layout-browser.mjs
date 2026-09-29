import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'vite';

// Uses the game's DOM, stylesheet order, hotbar renderer, and an existing browser runtime.
// Chat settings, resizing, tabs, input, and scroll behavior are extracted from the real game.
// MOSSVALE_PLAYWRIGHT/MOSSVALE_CHROME may point to an installed browser; --serve opens the fixture for review.
const root=fileURLToPath(new URL('../',import.meta.url)),output=process.env.MOSSVALE_LAYOUT_OUTPUT||'/tmp/mossvale-chat-menu-layout';
const main=readFileSync(join(root,'src/main.ts'),'utf8');
const desktopMenus=stripTypeScriptTypes(main.slice(main.indexOf('function setDesktopMenus('),main.indexOf('function setMobileMenus(')));
assert(desktopMenus.includes("$('desktop-menu-toggle').onclick"),'desktop menu behavior is loaded from the game');
const hudScaleSettings=stripTypeScriptTypes(main.slice(main.indexOf('function normalizeHudScale('),main.indexOf('let appearance =')));
assert(hudScaleSettings.includes("applyHudScale(readLocal('mossvale-desktop-hud-scale'))"),'HUD scale setting and startup preference are loaded from the game');
const sourceSlice=(start,end)=>{const from=main.indexOf(start),to=main.indexOf(end,from);assert(from>=0&&to>from,start+' boundary');return main.slice(from,to);};
const chatBehavior=stripTypeScriptTypes(sourceSlice('type ChatChannel=','const friendsUI=')+sourceSlice('function mobileChat(','function fighterUnavailable(')+sourceSlice('function chatMessage(','function eraseCommunityMessages(')+sourceSlice("$('chat-toggle').onclick=",'let mapCanvas='));
const seen=new Set(),css=[];
function visit(file){if(seen.has(file)||!existsSync(file))return;seen.add(file);const source=readFileSync(file,'utf8');if(file.endsWith('.css')){css.push(file);return;}for(const [,spec] of source.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)){let target=resolve(dirname(file),spec);if(!extname(target))target+='.ts';if(/\.(?:ts|css)$/.test(target))visit(target);}}
visit(join(root,'src/main.ts'));
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Chat and menu layout check</title></head><body><div id="app"></div><script type="module">
${css.map(file=>`import ${JSON.stringify('/'+file.slice(root.length))};`).join('\n')}
import {mountUI,$,icon} from '/src/ui.ts';
import {createHotbar} from '/src/hotbar.ts';
import {spellsForClass} from '/src/spells.ts';
import {starterGear} from '/src/progression.ts';
import {renderGraphicsSettings} from '/src/graphics-settings.ts';
import {DEFAULT_APPEARANCE} from '/src/appearance.ts';
import {deferTouchRender} from '/src/scroll-refresh.ts';
import {emoteCommand,EMOTE_HELP} from '/src/emotes.ts';
mountUI();$('loading').hidden=true;
const readLocal=key=>localStorage.getItem(key),saveLocal=(key,value)=>localStorage.setItem(key,value);
${hudScaleSettings}
${desktopMenus}
const canvas=$('world'),keys=new Set(),heldKeyCodes=new Map(),sent=[];
const clearMovementKeys=()=>{keys.clear();heldKeyCodes.clear();},gmBadge=()=>null,toast=()=>{},send=message=>sent.push(message),stopForSocialUI=()=>{},friendsUI={close(){}},playerMenu={close(){}};
${chatBehavior}
for(const channel of ['world','system','whisper','party'])for(let index=0;index<24;index++){chatMessage(index%3===2?'Instant Combat begins in 5 minutes. Register from anywhere in the Instant Combat menu.':index%3===1?'Benjooie arrived in Greenwood.':'Benjooie left Greenwood.',undefined,undefined,undefined,channel);}
for(const [id,label,art,anchor,tag] of [
 ['instant-combat-button','Instant Combat','sword','arena-button','span'],['raid-button','Raid','menu-raid','arena-button','span'],
 ['pets-button','Pets','menu-pets','achievements-button','kbd'],['referrals-button','Referrals','menu-referral','account-button','small'],
 ['gm-button','Game master','crown','settings-button','span'],['store-button','Store','menu-store','settings-button','small'],['nft-button','NFTs','menu-nfts','settings-button','small']
]){const button=document.createElement('button');button.id=id;button.type='button';button.title=label;button.setAttribute('aria-label',label);button.dataset.mobileLabel=label;button.innerHTML=icon(art)+'<'+tag+'>'+ (id==='pets-button'?'V':label)+'</'+tag+'>' ;$(anchor).before(button);}
$('game-menus').append($('mobile-mount'));
for(const button of document.querySelectorAll('#game-menus button'))button.dataset.mobileLabel||=button.id==='mobile-mount'?'Mount':button.dataset.bindingName||button.getAttribute('aria-label');
const learnedSpells=spellsForClass('Mage').filter(spell=>!spell.requiredTalent).map(spell=>spell.id);
const player={id:'hero',name:'Aster',appearance:{...DEFAULT_APPEARANCE,className:'Mage'},...starterGear('Mage'),level:60,hp:300,maxHp:600,talents:[],learnedSpells,inventory:{potion:3},hotbar:learnedSpells.slice(0,8),hotbar2:learnedSpells.slice(8,16)};
const actions=[],casts=[];let rangeTarget=null;
const hotbar=createHotbar({hud:$('hotbar'),book:$('panel-content'),canEdit:()=>true,rangeTarget:()=>rangeTarget,cast:id=>casts.push(id),save:()=>true,notify(){}});
function openScaleSettings(){$('panel').dataset.mode='settings';$('panel-title').textContent='Options';$('panel-content').innerHTML='<div class="settings-layout"><nav class="settings-nav"><span>System</span><button aria-current="page">Graphics</button></nav><div class="settings-pages">'+renderGraphicsSettings()+renderHudScaleSettings()+renderChatScaleSettings()+'</div></div>';mountHudScaleSettings($('panel-content'));mountChatScaleSettings($('panel-content'));$('panel').showModal();}
$('close-panel').onclick=()=> $('panel').close();
for(const button of document.querySelectorAll('#game-menus > button'))button.onclick=()=>{actions.push(button.id);if(button.id==='settings-button')openScaleSettings();};
window.fixture={actions,casts,sent,message:chatMessage,chatScale:applyChatScale,resizeChat,statuses(){const now=Date.now(),learned=spellsForClass('Ranger').filter(spell=>!spell.requiredTalent).map(spell=>spell.id),abilities=['twinshot','mend',...learned.filter(id=>id!=='twinshot')];rangeTarget={distance:1000,hostile:true};hotbar.sync({...player,id:'status-hero',appearance:{...DEFAULT_APPEARANCE,className:'Ranger'},...starterGear('Ranger'),learnedSpells:learned,talents:['ranger-marksmanship-6'],hotbar:abilities.slice(0,10),hotbar2:abilities.slice(10,20),combatTalents:{twinshotReadyUntil:now+30000},abilityCooldowns:{[abilities[2]]:now+4000}});hotbar.updateCooldowns(now);},settings:openScaleSettings,scale:applyHudScale,mode(mobile,chat=false){document.body.classList.toggle('mobile-controls',mobile);document.body.classList.toggle('mobile-menu-open',mobile&&!chat);document.body.classList.toggle('mobile-chat-open',mobile&&chat);setChatExpanded(!mobile||chat);hotbar.sync(player);},preview(){document.body.classList.remove('mobile-chat-open','mobile-menu-open');setChatExpanded(false);}};
const preview=new URLSearchParams(location.search);
fixture.mode(preview.has('mobile'),preview.has('chat'));
for(const [param,property] of [['chat-width','width'],['chat-height','height']]){const size=Number(preview.get(param));if(size>0&&Number.isFinite(size))$('chat').style[property]=size+'px';}
document.body.dataset.ready='true';
</script><style>#world{background:#6e8550}.brand,.region-intro,.controls-hint,.footer-note{display:none}#loading[hidden]{display:none}</style></body></html>`;
const server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false},plugins:[{name:'chat-menu-fixture',configureServer(server){server.middlewares.use('/__chat-menu-layout',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});}}]});
await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}/__chat-menu-layout`;
if(process.argv.includes('--serve')){console.log(url);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void server.close().then(()=>process.exit(0));});}
else {
 let browser;
 try {
  const {chromium}=await import(process.env.MOSSVALE_PLAYWRIGHT||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.MOSSVALE_CHROME?{executablePath:process.env.MOSSVALE_CHROME}:{})});
  const page=await browser.newPage(),errors=[],failures=[],reports=[];page.on('pageerror',error=>errors.push(error.message));mkdirSync(output,{recursive:true});
  const inside=(a,b)=>a.left>=b.left-1&&a.top>=b.top-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1;
  const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
  const rect=locator=>locator.evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
  const geometry=async()=>Object.fromEntries(await Promise.all(['#hotbar','.hud-action-dock','#game-menus','#desktop-menu-toggle','#chat','#chat-preview','#mobile-tools','#mobile-actions'].map(async selector=>[selector,await rect(page.locator(selector))])));
  const assertControlCenters=async(name)=>{const blocked=await page.locator('#game-menus > button:visible,#hotbar > button:visible,#desktop-menu-toggle:visible').evaluateAll(nodes=>nodes.flatMap(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return node.contains(hit)?[]:[{id:node.id||node.dataset.hotbarSlot||node.dataset.hotbarBank,hit:hit?.id||hit?.className}];}));assert.deepEqual(blocked,[],name+': every menu, slot, bank and toggle center accepts pointer input');};
  const scaleSetting=async(value)=>{await page.evaluate(()=>fixture.settings());const slider=page.locator('#hud-scale-setting');await slider.focus();await page.keyboard.press('Home');for(let valueNow=30;valueNow<value;valueNow+=5)await page.keyboard.press('ArrowRight');assert.equal(await slider.inputValue(),String(value));assert.equal(await page.locator('#hud-scale-value').textContent(),value+'%');await page.locator('#close-panel').click();};
  await page.setViewportSize({width:1440,height:900});await page.goto(url);await page.waitForSelector('[data-ready="true"]',{state:'attached'});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--hud-scale').trim()),'0.4','fresh startup defaults to forty percent');
  await scaleSetting(65);assert.equal(await page.evaluate(()=>localStorage.getItem('mossvale-desktop-hud-scale')),'65','slider saves immediately');
  const savedGeometry=await geometry();await page.reload();await page.waitForSelector('[data-ready="true"]',{state:'attached'});assert.deepEqual(await geometry(),savedGeometry,'reload restores saved HUD geometry');
  await page.locator('#settings-button').click();assert.equal(await page.locator('#hud-scale-setting').inputValue(),'65');await page.screenshot({path:join(output,'desktop-settings.png')});
  await page.locator('#hud-scale-reset').click();assert.equal(await page.locator('#hud-scale-setting').inputValue(),'40');assert.equal(await page.locator('#hud-scale-value').textContent(),'40%');assert.equal(await page.evaluate(()=>localStorage.getItem('mossvale-desktop-hud-scale')),'40');await page.locator('#close-panel').click();await page.reload();await page.waitForSelector('[data-ready="true"]',{state:'attached'});assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--hud-scale').trim()),'0.4','Reset survives reload');
  await page.evaluate(()=>fixture.settings());await page.locator('#hud-scale-setting').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#hud-scale-setting').inputValue(),'30','native slider cannot go below thirty');await page.keyboard.press('End');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#hud-scale-setting').inputValue(),'100','native slider cannot go above one hundred');await page.locator('#close-panel').click();
  reports.push({settings:{liveInput:true,persisted65:true,reloadRestored:true,reset40:true,min30:true,max100:true}});
  for(const [width,height,mobile] of process.argv.includes('--status-only')?[]:[[1920,1080,false],[1440,900,false],[1280,900,false],[1024,900,false],[801,900,false],[320,740,true],[390,844,true],[800,900,true],[844,390,true],[1024,900,true]]){
   const name=(mobile?'mobile-':'desktop-')+width,viewport={left:0,top:0,right:width,bottom:height};
   try {
   await page.setViewportSize({width,height});await page.goto(url);await page.waitForSelector('[data-ready="true"]',{state:'attached'});await page.evaluate(mobile=>{fixture.scale(40);fixture.mode(mobile);},mobile);await page.evaluate(()=>document.fonts.ready);
   let at30;const at40=await geometry();await page.evaluate(()=>fixture.scale(100));const at100=await geometry();
   if(mobile){await page.evaluate(()=>fixture.chatScale(60));const mobileAt60=await geometry();await page.evaluate(()=>fixture.chatScale(125));assert.deepEqual(await geometry(),mobileAt60,name+': chat preference cannot move or resize mobile');assert.deepEqual(at40,at100,name+': desktop preference cannot move or resize mobile controls');await page.evaluate(()=>fixture.settings());assert(!await page.locator('.desktop-hud-settings').isVisible()&&!await page.locator('.desktop-chat-settings').isVisible(),name+': desktop scale settings are hidden on mobile');await page.locator('#close-panel').click();}
   else {
    await assertControlCenters(name+' full');for(const selector of ['#hotbar','.hud-action-dock','#game-menus','#desktop-menu-toggle'])assert(inside(at100[selector],viewport),name+': full-size '+selector+' fits viewport');assert(!overlap(at100['#chat'],at100['#game-menus'])&&!overlap(at100['#chat'],at100['#hotbar']),name+': full scale keeps chat clear');
    for(const selector of ['#hotbar','.hud-action-dock','#game-menus','#desktop-menu-toggle'])for(const dimension of ['width','height'])assert(Math.abs(at40[selector][dimension]-at100[selector][dimension]*.4)<.1,name+': default '+selector+' '+dimension+' is forty percent');
    if(width===1440)await page.screenshot({path:join(output,'desktop-100-percent.png')});
    await scaleSetting(30);at30=await geometry();await assertControlCenters(name+' minimum');
    for(const selector of ['#hotbar','.hud-action-dock','#game-menus','#desktop-menu-toggle']){assert(inside(at30[selector],viewport),name+': minimum '+selector+' fits viewport');for(const dimension of ['width','height'])assert(Math.abs(at30[selector][dimension]-at100[selector][dimension]*.3)<.1,name+': minimum '+selector+' '+dimension+' is thirty percent');}
    assert(!overlap(at30['#chat'],at30['#game-menus'])&&!overlap(at30['#chat'],at30['#hotbar']),name+': minimum scale keeps chat clear');
    if(width===1440)await page.screenshot({path:join(output,'desktop-30-percent.png')});
   }
   await page.evaluate(()=>{fixture.scale(40);fixture.chatScale(80);});if(!mobile)await assertControlCenters(name+' default');reports.push({name,at30,at40,at100,mobileUnchanged:mobile||undefined});
   const menu=page.locator('#game-menus'),menuBox=await rect(menu);assert(inside(menuBox,viewport),name+': menu fits viewport');
   if(mobile)assert(await menu.evaluate(node=>node.scrollWidth<=node.clientWidth+1),name+': menu has no horizontal overflow');
   const buttons=page.locator('#game-menus > button:visible');assert.equal(await buttons.count(),mobile?19:18,name+': every menu action is represented');
   for(const button of await buttons.all()){
    const box=await rect(button),id=await button.getAttribute('id');assert(box.width>=44*(mobile?1:.4)-.1&&box.height>=44*(mobile?1:.4)-.1,name+': '+id+' target follows desktop scale or keeps mobile 44px');
    if(!mobile)assert(inside(box,menuBox),name+': '+id+' stays inside menu');
    const art=button.locator('.icon,.item-art,img').first();assert(inside(await rect(art),box),name+': '+id+' icon fits button');
   }
   if(!mobile){
    const core=page.locator('#game-menus > button:visible:not(#account-button):not(#gm-button)'),coreBoxes=await Promise.all((await core.all()).map(rect));
    assert.equal(coreBoxes.length,16,name+': all sixteen core actions stay in the menu');
    assert.equal(new Set(coreBoxes.map(box=>Math.round(box.left))).size,4,name+': core menu has four columns');
    assert.equal(new Set(coreBoxes.map(box=>Math.round(box.top))).size,4,name+': core menu has four rows');
    const actionBoxes=await Promise.all((await buttons.all()).map(rect));
    for(let index=0;index<actionBoxes.length;index++)for(let next=index+1;next<actionBoxes.length;next++)assert(!overlap(actionBoxes[index],actionBoxes[next]),name+': menu actions do not overlap');
    await page.locator('#gm-button').evaluate(node=>{node.hidden=true;});assert.equal(await buttons.count(),17,name+': every normal-player action remains visible');await page.locator('#gm-button').evaluate(node=>{node.hidden=false;});
    const hotbar=await rect(page.locator('#hotbar')),chat=await rect(page.locator('#chat')),dock=await rect(page.locator('.hud-action-dock'));
    assert(inside(hotbar,dock)&&inside(dock,viewport),name+': ability bar stays inside its dock and viewport');
    assert(Math.abs(menuBox.bottom-dock.bottom)<=1,name+': menu and ability dock share the bottom rail');
    assert(Math.abs(menuBox.left-dock.right)<=24,name+': menu joins the right edge of the ability dock');
    assert(menuBox.top<dock.top,name+': menu rises above the experience rails');
    const slots=page.locator('#hotbar [data-hotbar-slot]'),slotBoxes=await Promise.all((await slots.all()).map(rect));
    assert.equal(slotBoxes.length,10,name+': desktop shows ten ability slots');
    assert.equal(new Set(slotBoxes.map(box=>Math.round(box.top))).size,1,name+': ten ability slots stay on one row');
    for(const box of slotBoxes)assert(inside(box,hotbar)&&box.width>=36*.4-.1&&box.height>=44*.4-.1,name+': ability targets stay usable inside the bar');
    const banks=page.locator('#hotbar [data-hotbar-bank]'),bankBoxes=await Promise.all((await banks.all()).map(rect));
    assert.equal(bankBoxes.length,2,name+': both bank buttons are visible');
    assert(Math.abs(bankBoxes[0].left-bankBoxes[1].left)<=1&&bankBoxes[0].bottom<=bankBoxes[1].top&&bankBoxes[0].left>=slotBoxes.at(-1).right,name+': bank buttons stack beside the ten slots');
    assert(!await page.locator('#hotbar [data-hotbar-page]').isVisible(),name+': desktop does not show the mobile page toggle');
    await banks.nth(1).click();assert.equal(await banks.nth(1).getAttribute('aria-pressed'),'true',name+': bank two can be selected');assert.equal(await slots.first().getAttribute('data-hotbar-slot'),'10');await banks.nth(0).click();
    const xp=page.locator('.hud-xp-row'),xpBoxes=await Promise.all((await xp.all()).map(rect));
    assert.equal(xpBoxes.length,2,name+': character and job experience rails remain visible');
    assert(xpBoxes[0].bottom<=xpBoxes[1].top&&xpBoxes[1].bottom<=hotbar.top,name+': experience rails stack above the abilities');
    assert(!overlap(menuBox,hotbar)&&!overlap(menuBox,chat)&&!overlap(hotbar,chat),name+': chat, hotbar, and menus do not overlap');
    const toggle=page.locator('#desktop-menu-toggle'),toggleBox=await rect(toggle);
    assert(inside(toggleBox,viewport)&&toggleBox.width>=44*.4-.1&&toggleBox.height>=44*.4-.1,name+': menu collapse remains an accessible target');
    assert(actionBoxes.every(box=>!overlap(box,toggleBox)),name+': collapse does not cover a menu action');
    await toggle.focus();await page.keyboard.press('Enter');assert(!await menu.isVisible(),name+': keyboard can collapse the menus');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert(inside(await rect(toggle),viewport)&&!overlap(await rect(toggle),await rect(page.locator('#hotbar'))),name+': collapsed menu can still be reopened');
    await page.keyboard.press('Enter');assert(await menu.isVisible(),name+': keyboard can reopen the menus');assert.equal(await toggle.getAttribute('aria-expanded'),'true');
   }
   if(!mobile){await page.locator('#inventory-button').click();assert.equal(await page.evaluate(()=>fixture.actions.at(-1)),'inventory-button',name+': scaled menu receives actual pointer click');await page.locator('#hotbar [data-hotbar-slot]').first().click();assert((await page.evaluate(()=>fixture.casts.length))>0,name+': scaled hotbar receives actual cast click');}
   await page.screenshot({path:join(output,name+'-menu.png')});
   if(width===1440||width===320)await menu.screenshot({path:join(output,name+'-menu-detail.png')});
   if(width===1440)await page.locator('#hotbar').screenshot({path:join(output,'desktop-hotbar-detail.png')});
   if(mobile){await buttons.last().scrollIntoViewIfNeeded();assert(inside(await rect(buttons.last()),menuBox),name+': last menu action can be scrolled into view');await page.evaluate(()=>{fixture.mode(true,true);fixture.chatScale(60);});const compact=await geometry();await page.evaluate(()=>fixture.chatScale(125));assert.deepEqual(await geometry(),compact,name+': expanded mobile chat is unchanged by desktop scale');}
   const chat=page.locator('#chat'),chatBox=await rect(chat),heading=await rect(page.locator('.chat-heading'));
   assert(inside(chatBox,viewport),name+': chat fits viewport');
   // The desktop resize handle has its own space above the chat heading.
   for(const part of await chat.locator('.chat-heading,.chat-history,form').all()){assert(inside(await rect(part),chatBox),name+': chat content fits its frame');assert(await part.evaluate(node=>node.scrollWidth<=node.clientWidth+1),name+': chat content has no horizontal overflow');}
   assert.equal(await chat.evaluate(node=>getComputedStyle(node,'::before').content),'none',name+': chat stays frameless around its live controls');
   assert.match(await page.locator('.chat-history').evaluate(node=>getComputedStyle(node).overflowY),/^(hidden|clip|auto|scroll)$/,name+': message history clips wrapped rows before the composer');
   const activeLog=page.locator('.chat-panel:not([hidden]) .chat-messages');
   assert(await activeLog.evaluate(node=>node.scrollHeight>node.clientHeight),name+': long mixed messages exercise a scrollable history');
   assert(inside(await rect(activeLog),await rect(page.locator('.chat-history'))),name+': the log fits its history viewport');

   const tabs=page.locator('[data-chat-channel]'),before=[];
   for(const tab of await tabs.all()){const box=await rect(tab);before.push(box);assert(inside(box,heading),name+': tab fits heading');if(mobile)assert(box.width>=44&&box.height>=44,name+': channel keeps a 44px touch target');assert(await tab.evaluate(node=>node.scrollWidth<=node.clientWidth+1),name+': channel text fits');}
   for(const tab of await tabs.all()){
    await tab.hover();await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');
    assert.deepEqual(await Promise.all((await tabs.all()).map(rect)),before,name+': selection and hover preserve all tab geometry');
    assert(await page.locator('#'+await tab.getAttribute('aria-controls')).isVisible(),name+': selected channel is visible');
   }
   if(mobile){const back=await rect(page.locator('#chat-close'));assert(inside(back,heading)&&back.width>=44&&back.height>=44,name+': Back fits and remains touchable');for(const box of before)assert(!overlap(box,back),name+': tabs do not overlap Back');assert(inside(await rect(page.locator('#chat-input')),chatBox),name+': composer fits chat');}
   await page.click('#chat-tab-world');await page.screenshot({path:join(output,name+'-chat.png')});
   if(width===1440||width===320)await chat.screenshot({path:join(output,name+'-chat-detail.png')});
   if(width===1440){
    await chat.evaluate(node=>{node.style.width='280px';node.style.height='180px';});
    assert(inside(await rect(page.locator('#chat-log-world')),await rect(page.locator('.chat-history'))),name+': wrapped messages fit the minimum resized history');
    for(const tab of await tabs.all())assert(await tab.evaluate(node=>node.scrollWidth<=node.clientWidth+1),name+': tabs fit the minimum resized chat');
    assert(inside(await rect(page.locator('#chat-toggle')),await rect(chat)),name+': Hide control fits the minimum chat');
   }
   if(!mobile){await page.locator('#interact-prompt').evaluate(node=>{node.hidden=false;});assert(inside(await rect(page.locator('#interact-prompt')),viewport),name+': framed interaction prompt fits viewport');if(width===1440)await page.locator('#interact-prompt').screenshot({path:join(output,'interaction-detail.png')});}
   if(mobile){
    await page.click('#chat-close');assert(await chat.evaluate(node=>node.classList.contains('collapsed')),name+': Back closes chat');
    await page.evaluate(()=>fixture.preview());
    assert.equal(await page.locator('#hotbar [data-hotbar-slot]').count(),4,name+': mobile retains four radial ability slots');
    assert.equal(await page.locator('#hotbar [data-hotbar-bank]').count(),0,name+': desktop bank controls do not enter mobile');
    assert(await page.locator('#hotbar [data-hotbar-page]').isVisible(),name+': mobile page switching remains available');
    assert(!await page.locator('.hud-xp-rails').isVisible()&&!await page.locator('#desktop-menu-toggle').isVisible(),name+': desktop experience rails and menu toggle stay hidden on mobile');
   }else{
    await page.evaluate(()=>fixture.preview());const preview=await rect(page.locator('#chat-preview')),dock=await rect(page.locator('.hud-action-dock'));
    assert(inside(preview,viewport)&&preview.bottom<=dock.top&&!overlap(preview,menuBox),name+': six-line chat preview stays above the joined rail');
    assert.equal(await page.locator('#chat-preview .chat-preview-line:visible').count(),6,name+': desktop keeps six recent messages');
    await page.screenshot({path:join(output,name+'-preview.png')});
   }
   console.log('PASS '+name+': '+(mobile?'preserved mobile controls and chat':'joined desktop rail, 4x4 menus, ten slots and keyboard collapse'));
   } catch(error) {failures.push(error.message);await page.screenshot({path:join(output,name+'-failure.png')});console.error('FAIL '+error.message);}
  }
  const chatSetting=async(value)=>{await page.evaluate(()=>fixture.settings());const slider=page.locator('#chat-scale-setting');await slider.focus();await page.keyboard.press('Home');for(let next=60;next<value;next+=5)await page.keyboard.press('ArrowRight');assert.equal(await slider.inputValue(),String(value));assert.equal(await page.locator('#chat-scale-value').textContent(),value+'%');await page.locator('#close-panel').click();};
  for(const width of process.argv.includes('--status-only')?[]:[1440,1024,801]){
   const name='chat-scale-'+width,viewport={left:0,top:0,right:width,bottom:900};
   await page.setViewportSize({width,height:900});await page.evaluate(()=>{localStorage.removeItem('mossvale-chat-size');localStorage.removeItem('mossvale-desktop-chat-scale');});await page.goto(url);await page.waitForSelector('[data-ready="true"]',{state:'attached'});await page.evaluate(()=>{fixture.scale(40,true);fixture.mode(false);return document.fonts.ready;});
   assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--chat-scale').trim()),'0.8');
   const original=await geometry(),chat=page.locator('#chat'),log=page.locator('#chat-log-world');
   await page.screenshot({path:join(output,name+'-default80.png')});
   await chatSetting(100);const full=await rect(chat);
   if(width===1440)for(const dimension of ['width','height'])assert(Math.abs(original['#chat'][dimension]-full[dimension]*.8)<.2,'default chat is eighty percent of the original '+dimension);
   for(const percent of [60,80,125]){
    await chatSetting(percent);let box=await rect(chat);assert(inside(box,viewport),name+': '+percent+'% fits viewport');
    assert(!overlap(box,await rect(page.locator('#game-menus')))&&!overlap(box,await rect(page.locator('#hotbar'))),name+': chat stays clear of menus and hotbar');
    assert.deepEqual(await rect(page.locator('#hotbar')),original['#hotbar'],name+': independent setting leaves hotbar unchanged');
    const sizes=await chat.evaluate(node=>{const scale=Number(getComputedStyle(document.body).getPropertyValue('--chat-scale'));return {text:parseFloat(getComputedStyle(node).fontSize)*scale,input:parseFloat(getComputedStyle(document.querySelector('#chat-input')).fontSize)*scale,tab:parseFloat(getComputedStyle(document.querySelector('#chat-tab-world')).fontSize)*scale};});
    assert(sizes.text>=13.99&&sizes.input>=13.99&&sizes.tab>=10.99,name+': minimum physical type stays readable');
    await page.screenshot({path:join(output,name+'-'+percent+'.png')});
    await page.evaluate(()=>fixture.resizeChat(1,1));box=await rect(chat);
    for(const selector of ['.chat-heading','.chat-history','#chat-form','#chat-toggle','#chat-input','#chat-send'])assert(inside(await rect(page.locator(selector)),box),name+': minimum '+selector+' fits at '+percent);
    for(const tab of await page.locator('[data-chat-channel]').all())assert(await tab.evaluate(node=>node.scrollWidth<=node.clientWidth+1),name+': minimum tab text fits at '+percent);
    await page.evaluate(()=>{document.querySelector('#chat').style.width='';document.querySelector('#chat').style.height='';});
   }
   await chatSetting(80);await page.evaluate(()=>fixture.resizeChat(380,300));
   const beforeDrag=await rect(chat),handle=await rect(page.locator('#chat-resize'));
   await page.mouse.move(handle.left+handle.width/2,handle.top+handle.height/2);await page.mouse.down();await page.mouse.move(handle.left+handle.width/2+40,handle.top+handle.height/2-32,{steps:5});await page.mouse.up();
   const afterDrag=await rect(chat);assert(Math.abs(afterDrag.width-beforeDrag.width-40)<1&&Math.abs(afterDrag.height-beforeDrag.height-32)<1,name+': pointer resize follows physical mouse movement');
   await page.locator('#chat-resize').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowDown');const afterKeys=await rect(chat);assert(Math.abs(afterKeys.width-afterDrag.width+20)<1&&Math.abs(afterKeys.height-afterDrag.height+20)<1,name+': keyboard resize uses physical twenty-pixel steps');
   await page.reload();await page.waitForSelector('[data-ready="true"]',{state:'attached'});await page.evaluate(()=>document.fonts.ready);assert.deepEqual(await rect(chat),afterKeys,name+': logical window dimensions and scale survive reload');
   await page.locator('#chat-input').fill('World draft');await page.locator('#chat-tab-party').click();await page.locator('#chat-input').fill('Party draft');await page.locator('#chat-tab-world').click();assert.equal(await page.locator('#chat-input').inputValue(),'World draft');
   await page.locator('#chat-tab-world').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#chat-tab-system').getAttribute('aria-selected'),'true');assert(!await page.locator('#chat-form').isVisible());await page.locator('#chat-tab-world').click();
   await page.locator('#chat-input').fill('Browser fixture message');await page.locator('#chat-send').click();assert.deepEqual(await page.evaluate(()=>fixture.sent.at(-1)),{type:'chat',text:'Browser fixture message'});
   await page.evaluate(()=>{for(let index=0;index<45;index++)fixture.message('Readable message '+index+' across the Mossvale realm.','Player');});await log.hover();await page.mouse.wheel(0,-220);await page.waitForFunction(()=>{const log=document.querySelector('#chat-log-world');return log.scrollTop>0&&log.scrollTop<log.scrollHeight-log.clientHeight-80;});
   await page.evaluate(()=>{const log=document.querySelector('#chat-log-world'),top=log.getBoundingClientRect().top,node=[...log.children].find(child=>child.getBoundingClientRect().bottom>top);window.readingAnchor={node,offset:node.getBoundingClientRect().top-top};fixture.message('New message should not interrupt reading.','Player');});
   assert(await page.evaluate(()=>{const log=document.querySelector('#chat-log-world');return log.contains(readingAnchor.node)&&Math.abs(readingAnchor.node.getBoundingClientRect().top-log.getBoundingClientRect().top-readingAnchor.offset)<1.5;}),name+': trimming an old row preserves the visible reading anchor');
   await chatSetting(60);assert(await page.evaluate(()=>{const log=document.querySelector('#chat-log-world');return Math.abs((readingAnchor.node.getBoundingClientRect().top-log.getBoundingClientRect().top)/.6-readingAnchor.offset/.8)<2;}),name+': changing scale preserves the reading anchor');
   await page.evaluate(()=>fixture.settings());await page.locator('#chat-scale-setting').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#chat-scale-setting').inputValue(),'60');await page.keyboard.press('End');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#chat-scale-setting').inputValue(),'125');
   await page.locator('#chat-scale-reset').click();assert.equal(await page.locator('#chat-scale-setting').inputValue(),'80');assert.equal(await page.evaluate(()=>localStorage.getItem('mossvale-desktop-chat-scale')),'80');
   if(width===1440){await page.locator('.desktop-chat-settings').scrollIntoViewIfNeeded();await page.screenshot({path:join(output,'desktop-chat-settings.png')});}
   await page.locator('#close-panel').click();await page.locator('#chat-toggle').click();assert(!await chat.isVisible());await page.locator('#chat-preview-messages').click();assert(await chat.isVisible());
   reports.push({chatWidth:width,default80:true,range:[60,125],minimumText:14,independentHud:true,persistedResize:true,realPointerAndKeyboardResize:true,realTabsAndDrafts:true,realSubmit:true,wheelScrollAndTrimAnchor:true,scaleAnchor:true,reset80:true});console.log('PASS '+name+': real settings, resize, tabs, submit, history and reading anchors');
  }
  for(const width of [1440,801]){
   await page.setViewportSize({width,height:900});await page.goto(url);await page.waitForSelector('[data-ready="true"]',{state:'attached'});await page.evaluate(()=>{fixture.mode(false);fixture.statuses();});
   for(const percent of [40,30]){
    await page.evaluate(value=>fixture.scale(value),percent);await assertControlCenters('status '+width+' at '+percent);
    const badges=await page.locator('#hotbar :is(.hotbar-count,.hotbar-range,.hotbar-proc,.hotbar-cooldown):visible').evaluateAll(nodes=>nodes.filter(node=>node.textContent).map(node=>{const box=node.getBoundingClientRect(),slot=node.closest('[data-hotbar-slot]').getBoundingClientRect(),scale=Number(getComputedStyle(document.body).getPropertyValue('--hud-scale')),style=getComputedStyle(node),badgeStyle=parseFloat(style.fontSize)===0?getComputedStyle(node,'::after'):style;return {ability:node.closest('[data-hotbar-slot]').dataset.hotbarAbility,kind:node.className,slotSize:[slot.width,slot.height],edgeOffsets:[box.left-slot.left,box.right-slot.right,box.top-slot.top,box.bottom-slot.bottom],text:node.textContent,displayText:badgeStyle===style?node.textContent:badgeStyle.content,physicalFont:parseFloat(badgeStyle.fontSize)*scale,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,width:box.width,height:box.height,clipped:/^(hidden|clip)$/.test(style.overflowX)&&node.scrollWidth>node.clientWidth+1||/^(hidden|clip)$/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1||node.scrollWidth*scale>slot.width+.5||node.scrollHeight*scale>slot.height+.5||box.left<slot.left-.5||box.right>slot.right+.5||box.top<slot.top-.5||box.bottom>slot.bottom+.5};}));
    assert(badges.some(badge=>badge.kind==='hotbar-count')&&badges.some(badge=>badge.kind==='hotbar-proc')&&badges.some(badge=>badge.kind==='hotbar-range')&&badges.some(badge=>badge.kind==='hotbar-cooldown'),'actual player state populates potion, range, proc and cooldown badges');
    reports.push({statusWidth:width,percent,badges});await page.screenshot({path:join(output,'desktop-'+width+'-status-'+percent+'.png')});const clipped=badges.filter(badge=>badge.clipped);if(clipped.length)failures.push('Status badges clip at '+width+'/'+percent+': '+JSON.stringify(clipped));console.log('Status badges '+width+' at '+percent+'%: '+JSON.stringify(clipped));
   }
   await page.evaluate(()=>fixture.scale(40));const source=page.locator('#hotbar [data-hotbar-slot="0"]'),target=page.locator('#hotbar [data-hotbar-slot="1"]');const first=await source.getAttribute('data-hotbar-ability'),second=await target.getAttribute('data-hotbar-ability');await source.dragTo(target);assert.equal(await source.getAttribute('data-hotbar-ability'),second,'native drag swaps scaled hotbar first slot');assert.equal(await target.getAttribute('data-hotbar-ability'),first,'native drag swaps scaled hotbar second slot');reports.push({dragWidth:width,percent:40,nativeDragSwap:true});
  }
  writeFileSync(join(output,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),reports,errors,failures},null,2)+'\n');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);console.log('PASS HUD scale: default40/full100/min30 geometry, live native slider, saved reload, Reset, unchanged mobile. Screenshots: '+output);
 } finally {await browser?.close();await server.close();}
}
