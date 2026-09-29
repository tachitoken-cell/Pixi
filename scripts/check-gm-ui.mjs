import assert from 'node:assert/strict';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {mountGmUI}=await import('../src/gm-ui.ts');
const {gmBadge,updateGmNameplate}=await import('../src/gm-badge.ts');
const {gmActionValid}=await import('../src/gm.ts');
const {PETS}=await import('../src/pets.ts');
const {mountUnitFrames}=await import('../src/unit-frames.ts');hook.deregister();
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|#39);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[c]);
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.events={};this.hidden=false;this.disabled=false;this.style={};this.value='';this.checked=false;}
 setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=value;if(name==='class')this.className=value;if(name==='hidden')this.hidden=true;if(name==='value')this.value=value;if(name==='disabled')this.disabled=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
 removeAttribute(name){delete this.attributes[name];}
 append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
 get firstElementChild(){return this.children[0];}get scrollHeight(){return this.children.length*20;}
 getBoundingClientRect(){const top=this.parentElement?this.parentElement.children.indexOf(this)*20-(this.parentElement.scrollTop||0):0;return {top,bottom:top+20};}
 insertAdjacentElement(position,node){const parent=this.parentElement;node.parentElement=parent;parent.children.splice(parent.children.indexOf(this)+1,0,node);}
 contains(node){return this===node||this.children.some(n=>n.contains(node));}focus(){document.activeElement=this;}
 set innerHTML(html){this.html=html;this.children=[];const stack=[this];for(const [,end,tag,attrs]of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)){if(end){if(stack.length>1)stack.pop();continue;}const node=new Element(tag);for(const [,name,value]of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(name,decode(value||''));stack.at(-1).append(node);if(!['img','br','input','hr'].includes(tag))stack.push(node);}}
 get innerHTML(){return this.html||'';}matches(selector){if(selector.startsWith('.'))return (this.className||'').split(' ').includes(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);const attr=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);return attr?Object.hasOwn(this.attributes,attr[1])&&(attr[2]===undefined||this.attributes[attr[1]]===attr[2]):this.tagName===selector.toUpperCase();}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 addEventListener(type,handler){(this.events[type]||=[]).push(handler);}fire(type,extra={}){const event={target:this,stopped:false,defaultPrevented:false,stopPropagation(){this.stopped=true;},preventDefault(){this.defaultPrevented=true;},...extra};let node=this;while(node){for(const fn of node.events[type]||[])fn(event);if(event.stopped)break;node=node.parentElement;}return event;}
}
globalThis.HTMLElement=Element;globalThis.document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:null,createTextNode:text=>{const node=new Element('text');node.textContent=text;return node;}};

const me={id:'11111111-1111-4111-8111-111111111111',name:'Steward <Moss>',role:'player',level:60,appearance:{className:'Ranger'}},other={id:'22222222-2222-4222-8222-222222222222',name:'<script>Traveler</script>',level:25,className:'Mage',role:'player'};
let player={...me},players=[other],opened=0;const sent=[];
const ui=mountGmUI({getPlayer:()=>player,getPlayers:()=>players,send:message=>sent.push(structuredClone(message)),onOpen:()=>opened++});
const panel=document.body.querySelector('#gm-window'),find=id=>panel.querySelector(`#gm-${id}`),change=(id,value)=>{find(id).value=value;find(id).fire('change');},run=()=>find('form').fire('submit');
assert(panel.hidden);assert.equal(ui.open(),false);assert.equal(sent.length,0,'ordinary players cannot open or send commands');
player={...me,role:'gm',gm:{invisible:false,tagHidden:false,flying:false,canReturn:false}};assert(ui.open(other.id));assert.equal(opened,1);assert.equal(panel.attributes['aria-modal'],'false');assert.equal(find('target').value,other.id);assert.equal(sent.length,0,'opening never executes an action');
assert(find('target').innerHTML.includes('&lt;script&gt;Traveler&lt;/script&gt;'));assert(!find('target').querySelector('script'));
// Travel is server-directed; a return exists only after a confirmed saved location.
run();assert.deepEqual(sent.at(-1),{type:'gmAction',action:'teleportTo',targetId:other.id});assert.equal(player.x,undefined);ui.result({success:true,text:'Teleported.'});
assert(find('self-return').disabled);const noReturn=sent.length;find('self-return').fire('click');assert.equal(sent.length,noReturn);
player.gm.canReturn=true;ui.refresh();assert(!find('self-return').disabled);find('self-return').fire('click');assert.deepEqual(sent.at(-1),{type:'gmAction',action:'return',targetId:me.id});ui.result({success:true,text:'Returned.'});player.gm.canReturn=false;
change('action','bring');run();assert.deepEqual(sent.at(-1),{type:'gmAction',action:'bring',targetId:other.id});ui.result({success:true,text:'Brought.'});
change('action','return');assert(find('submit').disabled);const noTargetReturn=sent.length;run();assert.equal(sent.length,noTargetReturn);
players=[{...other,canReturn:true}];ui.refresh();assert(!find('submit').disabled);run();assert.deepEqual(sent.at(-1),{type:'gmAction',action:'return',targetId:other.id});ui.result({success:true,text:'Returned.'});
change('target',me.id);for(const action of ['teleportTo','bring']){change('action',action);assert(find('submit').disabled);const count=sent.length;run();assert.equal(sent.length,count,'self travel is rejected');}
// Toggles always address the current GM, even when another player is selected.
change('target',other.id);
for(const [action,state] of [['setInvisible','invisible'],['setTagHidden','tagHidden'],['setFlying','flying']]){
 const button=find(action);assert.equal(button.attributes['aria-pressed'],'false');button.fire('click');assert.deepEqual(sent.at(-1),{type:'gmAction',action,targetId:me.id,enabled:true});assert.equal(player.gm[state],false);assert.equal(button.attributes['aria-pressed'],'false','pending commands never fake confirmed state');
 const pending=sent.length;button.fire('click');run();assert.equal(sent.length,pending,'one outstanding command covers target actions and toggles');ui.result({success:false,text:'Denied.'});assert.equal(button.attributes['aria-pressed'],'false');
 button.fire('click');player.gm[state]=true;ui.result({success:true,text:'Enabled.'});assert.equal(button.attributes['aria-pressed'],'true');if(state==='flying')assert(!find('flight-help').hidden);
 button.fire('click');assert.deepEqual(sent.at(-1),{type:'gmAction',action,targetId:me.id,enabled:false});player.gm[state]=false;ui.result({success:true,text:'Disabled.'});assert.equal(button.attributes['aria-pressed'],'false');
}
assert(find('flight-help').hidden);assert(panel.innerHTML.includes('Space up'));
// Manual goblins are a self action, independent of the selected online player.
const goblinButton=find('spawnTreasureGoblin');assert(!goblinButton.disabled);goblinButton.fire('click');
assert.deepEqual(sent.at(-1),{type:'gmAction',action:'spawnTreasureGoblin',targetId:me.id});
const spawning=sent.length;goblinButton.fire('click');run();assert.equal(sent.length,spawning);assert(goblinButton.disabled);
ui.result({success:false,text:'Move into the wilderness.'});assert.equal(find('status').textContent,'Move into the wilderness.');assert(!goblinButton.disabled);
for(const state of [{hp:0},{instanceId:'dungeon-fixture'}]){
 Object.assign(player,state);ui.refresh();assert(goblinButton.disabled);goblinButton.fire('click');assert.equal(sent.length,spawning);
 player.hp=100;player.instanceId=null;
}
ui.refresh();goblinButton.focus();ui.refresh();assert.equal(document.activeElement,goblinButton);goblinButton.fire('click');document.activeElement=document.body;ui.result({success:true,text:'Treasure goblin spawned nearby.'});assert.equal(find('status').textContent,'Treasure goblin spawned nearby.');assert.equal(document.activeElement,goblinButton,'restore keyboard focus after the pending control is re-enabled');
// Realm event signup is an explicit self action even while another player is selected.
const eventButton=find('startInstantCombat');assert(!eventButton.disabled);eventButton.fire('click');
assert.deepEqual(sent.at(-1),{type:'gmAction',action:'startInstantCombat',targetId:me.id});
const eventPending=sent.length;eventButton.fire('click');run();assert.equal(sent.length,eventPending,'pending event command cannot be duplicated');
assert(eventButton.disabled);ui.result({success:false,text:'Instant Combat registration is already open.'});
assert.equal(find('status').textContent,'Instant Combat registration is already open.');assert(!eventButton.disabled);
eventButton.fire('click');ui.result({success:true,text:'Instant Combat registration opened for five minutes.'});
assert.equal(find('status').textContent,'Instant Combat registration opened for five minutes.');
assert(panel.innerHTML.includes('Players choose whether to join.')&&panel.innerHTML.includes('90 seconds to prepare'));

const forged=sent.length;change('action','setInvisible');run();assert.equal(sent.length,forged,'self toggles cannot be submitted as target actions');
const confirmed=player.gm;delete player.gm;ui.refresh();assert(find('setFlying').disabled);find('setFlying').fire('click');assert.equal(sent.length,forged,'unknown GM state cannot be optimistically toggled');player.gm=confirmed;ui.refresh();sent.length=0;
// Native values remain stable on live snapshots, including edits that have not blurred.
change('action','giveGold');find('amount').value='123';find('amount').focus();ui.refresh();assert.equal(find('amount').value,'123');assert.equal(document.activeElement,find('amount'));run();
assert.deepEqual(sent.at(-1),{type:'gmAction',action:'giveGold',targetId:other.id,amount:123});assert.equal(player.gold,undefined,'there is no optimistic wallet change');run();assert.equal(sent.length,1);
ui.close();ui.open(other.id);assert(find('submit').disabled,'closing and reopening cannot duplicate an outstanding command');ui.result({success:false,text:'Target inventory could not be saved.'});assert.equal(find('status').textContent,'Target inventory could not be saved.');assert(!find('submit').disabled);
find('amount').value='1.5';run();assert.equal(sent.length,1);find('amount').value='1000000001';run();assert.equal(sent.length,1);find('amount').value='';run();assert.equal(sent.length,1);
change('action','levelUp');find('amount').value='59';run();assert.equal(sent.at(-1).amount,59);ui.result({success:true,text:'Levels added.'});
change('action','spawnItem');change('category','item');change('item','item:trail-bread');find('amount').value='17';run();assert.deepEqual(sent.at(-1).item,{kind:'item',id:'trail-bread',quantity:17});ui.result({success:true,text:'Items added.'});
assert(!find('item').innerHTML.includes('item:golden-pig'),'pets have their own category');
change('category','pet');assert.deepEqual(find('item').querySelectorAll('option').map(option=>option.value),PETS.filter(pet=>!pet.storeOnly&&!pet.referralOnly).map(pet=>`item:${pet.id}`));
assert(find('help').textContent.includes('learn or trade'));assert(!find('amount').disabled);
change('item','item:golden-pig');find('amount').value='2';run();assert.deepEqual(sent.at(-1),{type:'gmAction',action:'spawnItem',targetId:other.id,item:{kind:'item',id:'golden-pig',quantity:2}});ui.result({success:true,text:'Item granted.'});
change('target',me.id);change('category','mount');assert.deepEqual(find('item').querySelectorAll('option').map(option=>option.value),['mount:verdant-revenant']);
assert(find('amount').disabled);assert(find('help').textContent.includes('Riding training'));find('amount').value='900';run();
assert.deepEqual(sent.at(-1),{type:'gmAction',action:'spawnItem',targetId:me.id,item:{kind:'mount',id:'verdant-revenant',quantity:1}});ui.result({success:true,text:'Mount unlocked.'});change('target',other.id);
change('category','bag');change('item','bag:runewoven-holdall');find('amount').value='900';run();assert.deepEqual(sent.at(-1).item,{kind:'bag',id:'runewoven-holdall',quantity:1});ui.result({success:true,text:'Bag added.'});
change('category','gear');change('item','gear:ranger-bow');const before=sent.length;run();assert.equal(sent.length,before,'a wrong-class item cannot be submitted');change('item','gear:invented');run();assert.equal(sent.length,before,'an invented item cannot be submitted');
change('action','kill');find('amount').value='-8';ui.refresh();assert(find('amount').disabled,'hidden numeric fields cannot block a non-numeric action');change('action','kick');assert(find('amount').disabled);find('reason').value='   ';run();assert.equal(sent.length,before);find('reason').value='  Repeated disruption  ';run();assert.deepEqual(sent.at(-1),{type:'gmAction',action:'kick',targetId:other.id,reason:'Repeated disruption'});ui.result({success:true,text:'Kicked.'});
change('action','ban');find('reason').value='Repeated harassment';run();const banBefore=sent.length;assert.equal(sent.at(-1).action,'kick','a ban needs explicit confirmation');find('confirm').checked=true;run();assert.equal(sent.length,banBefore+1);assert.equal(sent.at(-1).action,'ban');ui.result({success:true,text:'Banned.'});assert(!find('confirm').checked);
change('target',me.id);find('confirm').checked=true;run();assert.equal(sent.length,banBefore+1,'self ban is rejected');players=[{...other,role:'gm'}];ui.refresh();change('target',other.id);find('confirm').checked=true;run();assert.equal(sent.length,banBefore+1,'GM ban is rejected');
players=[other];change('action','giveGold');change('target',other.id);players=[];run();assert.equal(sent.length,banBefore+1,'a disconnected target is never silently replaced with another player');ui.refresh();assert.equal(find('target').value,'');
players=[other];ui.refresh();change('target',other.id);change('action','giveGold');find('amount').value='10';run();ui.close();ui.result({success:true,text:'Applied after closing.'});assert(!ui.isOpen(),'late responses cannot reopen the window');
ui.open();assert(!find('close').fire('keydown',{key:'w'}).stopped,'movement remains playable from a button');assert(find('close').fire('keydown',{key:'Tab'}).stopped,'Tab stays in window controls');find('close').fire('keydown',{key:'Escape'});assert(!ui.isOpen());
ui.open(other.id);change('action','giveGold');find('amount').value='8';run();assert(find('submit').disabled);ui.reset();ui.open(other.id);assert(!find('submit').disabled,'disconnect cleanup does not leave a GM reconnect stuck pending');
// Trace actions contain only the chosen player ID. Existing reports remain accessible after disconnect.
const blobs=new Map(),revoked=[],createObjectURL=URL.createObjectURL,revokeObjectURL=URL.revokeObjectURL;
URL.createObjectURL=blob=>{const url=`blob:loot-trace-${blobs.size}`;blobs.set(url,blob);return url;};URL.revokeObjectURL=url=>revoked.push(url);
const report={version:1,realmId:'eu',player:{id:other.id,name:other.name,level:other.level,className:other.className},startedAt:1000,expiresAt:1801000,stoppedAt:null,stoppedReason:null,events:[{at:1001,type:'lootGenerated',items:{'treasure-map':1}}]};
for(const action of ['startLootTrace','stopLootTrace','getLootTrace']){
 const command={type:'gmAction',action,targetId:other.id};assert(gmActionValid(command));assert(!gmActionValid({...command,amount:1}));assert(!gmActionValid({...command,enabled:true}));assert(!gmActionValid({...command,targetId:'not-a-player-id'}));
}
for(const action of ['stopLootTrace','getLootTrace']){change('action',action);assert(find('submit').disabled);const count=sent.length;run();assert.equal(sent.length,count);}
change('action','startLootTrace');assert(!find('submit').disabled);assert(find('help').textContent.includes('30 minutes or 1,000 events'));assert(find('help').textContent.includes('realm restart'));run();assert.deepEqual(sent.at(-1),{type:'gmAction',action:'startLootTrace',targetId:other.id});
players=[{...other,lootTrace:{active:true,startedAt:1000,expiresAt:1801000,eventCount:1,stoppedReason:null}}];ui.result({success:true,text:'Trace started.'});assert(find('submit').disabled);const activeCount=sent.length;run();assert.equal(sent.length,activeCount,'active traces cannot be silently replaced');assert(find('target-summary').textContent.includes('Trace active · 1 events'));
change('action','getLootTrace');run();assert.deepEqual(sent.at(-1),{type:'gmAction',action:'getLootTrace',targetId:other.id});ui.lootTrace(report);
const download=find('trace-download'),firstUrl=download.href;assert(!download.hidden);assert.equal(blobs.get(firstUrl).type,'application/json');assert.deepEqual(JSON.parse(await blobs.get(firstUrl).text()),report);assert.equal(download.download,`loot-trace-${other.id}-1000.json`);assert.equal(download.textContent,`Download ${other.name} trace (.json)`);assert(!download.querySelector('script'),'report names are text, never markup');assert(find('status').textContent.includes('1 events · Trace active'));assert(!find('submit').disabled);
players=[{...players[0],online:false}];ui.refresh();assert(find('target').innerHTML.includes('Offline'));
for(const action of ['startLootTrace','giveGold','teleportTo']){change('action',action);assert(find('submit').disabled);const count=sent.length;run();assert.equal(sent.length,count,'retained offline reports do not authorize regular player actions');}
change('action','stopLootTrace');assert(!find('submit').disabled);run();assert.deepEqual(sent.at(-1),{type:'gmAction',action:'stopLootTrace',targetId:other.id});assert(revoked.includes(firstUrl));assert(download.hidden);
players=[{...players[0],lootTrace:{...players[0].lootTrace,active:false,stoppedReason:'gm-stopped'}}];ui.result({success:true,text:'Trace stopped.'});assert(find('submit').disabled);
change('action','getLootTrace');assert(!find('submit').disabled);run();ui.lootTrace({...report,stoppedAt:2000,stoppedReason:'gm-stopped'});assert(find('status').textContent.includes('Trace stopped (gm-stopped)'));const stoppedUrl=download.href;ui.reset();assert(revoked.includes(stoppedUrl));assert(download.hidden);assert.equal(download.textContent,'');
players=[{...players[0],online:true}];ui.open(other.id);change('action','getLootTrace');run();ui.lootTrace(report);const roleUrl=download.href;player={...me};assert(download.fire('click').defaultPrevented,'role loss blocks download even before the next refresh');assert(revoked.includes(roleUrl));ui.lootTrace(report);assert(download.hidden);assert.equal(download.textContent,'');assert(!ui.isOpen(),'late privileged reports never reopen ordinary-player controls');
URL.createObjectURL=createObjectURL;URL.revokeObjectURL=revokeObjectURL;
player={...me,role:'gm',gm:{invisible:false,tagHidden:false,flying:false,canReturn:false}};players=[other];ui.reset();
ui.open();player={...me,gm:{invisible:true,tagHidden:true,flying:true,canReturn:true}};ui.refresh();assert(!ui.isOpen(),'role loss closes the privileged window');const lost=sent.length;run();for(const action of ['setInvisible','setTagHidden','setFlying','self-return','spawnTreasureGoblin'])find(action).fire('click');assert.equal(sent.length,lost,'forged GM flags never authorize ordinary-player controls');player=undefined;ui.refresh();assert(!ui.open());
// A role is a separate DOM badge, never a suffix parsed into the player's identity.
assert.equal(gmBadge('player'),null);assert.equal(gmBadge(undefined),null);const badge=gmBadge('gm');assert.equal(badge.textContent,'GM');
const label=new Element(),name=new Element('strong');name.textContent='[GM] Pretender';label.append(name);updateGmNameplate(label,'player');assert(!label.querySelector('.gm-badge'));updateGmNameplate(label,'gm');assert.equal(label.querySelector('.gm-badge').textContent,'GM');assert.equal(name.textContent,'[GM] Pretender');updateGmNameplate(label,'gm');assert.equal(label.querySelectorAll('.gm-badge').length,1);updateGmNameplate(label,'player');assert(!label.querySelector('.gm-badge'));
const frames=mountUnitFrames(new Element(),{onPlayer(){},onTargetContext(){},onTargetOfTarget(){}}); // The full frame role/cache checks also run in check-unit-frames.
frames.update({...me,role:'gm',subtitle:'Ranger',disposition:'self'},null,null);frames.update({...me,role:'player',subtitle:'Ranger',disposition:'self'},null,null);
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
assert.match(source,/msg\.type==='gmLootTrace'[\s\S]*?gmUI\.lootTrace\(msg\.report\)/,'socket reports reach the role-gated GM UI');
const chat=source.slice(source.indexOf('function chatMessage('),source.indexOf('\nfunction send('));
const chatScrollHelpers=source.slice(source.indexOf('function currentChatScale('),source.indexOf('function updateChatPreview('));
const chatNodes=new Map(),chatNode=id=>{if(!chatNodes.has(id))chatNodes.set(id,Object.assign(new Element(),{scrollTop:0,clientHeight:200,classList:{contains:()=>false}}));return chatNodes.get(id);};
const chatContext={document,gmBadge,$:chatNode,chatChannel:'world',chatScale:100,chatScroll:new Map(),updateChatUnread(){},openWhisper(){},mobileChat:()=>false,chatPreviewMessages:[],updateChatPreview(){}};
vm.createContext(chatContext);vm.runInContext(stripTypeScriptTypes(chatScrollHelpers+chat)+`;chatMessage('Hello','Ordinary');chatMessage('Hello','Steward',undefined,'gm');chatMessage('Hi',undefined,{id:'x',name:'Steward',incoming:true,role:'gm'});chatMessage('Pretending','[GM] Name');`,chatContext);
const worldLog=chatNode('chat-log-world'),whisperLog=chatNode('chat-log-whisper');assert.equal(worldLog.children[0].querySelectorAll('.gm-badge').length,0);assert.equal(worldLog.children[1].querySelector('.gm-badge').textContent,'GM');assert.equal(whisperLog.children[0].querySelector('.gm-badge').textContent,'GM');assert.equal(whisperLog.children[0].querySelector('button').textContent,'From Steward: ');assert.equal(worldLog.children[2].querySelectorAll('.gm-badge').length,0);
// Execute the actual socket-close branch, with other UI teardown behind small boundary stubs.
const closeStart=source.indexOf(" function onClose(event:Pick<CloseEvent,'code'|'reason'>){"),closeEnd=source.indexOf("\n connection.addEventListener('close',onClose);",closeStart);
assert(closeStart>=0&&closeEnd>closeStart,'the named socket-close handler must remain available to the fixture');
const close=source.slice(closeStart,closeEnd);
for(const code of [4408,4409]){
 const entries=[],node={classList:{add(){}},disabled:false,textContent:''},connection={},context={closed:false,report(){},phase:'ready',checkForUpdates:async()=>{},showShutdownWarning(){},sessionDisplaced:false,stopRenewal(){},event:{code},socket:connection,connection,revision:3,connectionRevision:3,connected:true,resetInstantCombat(){},realmAvailable:true,updateRosterAvailability(){},trainingPending:null,clearSocialUI(){},clearCombat(){},creatingCharacter:false,clearMovementKeys(){},selectedId:null,hoveredId:null,$:()=>node,rosterActive:false,customizer:{open:false},entryActive:false,moderationNotice:{action:code===4408?'kick':'ban',text:'Specific moderator reason'},reconnectTimer:1,clearTimeout(){},showEntry:(...args)=>entries.push(args),setTimeout(){throw Error('Moderation must not reconnect automatically');}};
 vm.createContext(context);vm.runInContext(stripTypeScriptTypes(`${close}\nonClose(event);`),context);assert.deepEqual(entries,[['Specific moderator reason',code===4408]]);
}
ui.dispose();assert(!document.body.contains(panel));console.log('PASS GM UI: server role gate, teleport/bring/return targets, self-only confirmed toggles and goblin spawning, return availability, canonical item/class checks, exact native amounts, ban confirmation, per-player loot traces and protected JSON exports, pending/role/disconnect lifecycle, safe role badges and terminal moderation closes.');
