import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import {characterNameError} from '../src/character-name.ts';
import {DEFAULT_APPEARANCE,appearanceValid} from '../src/appearance.ts';
import {hostingConfig,guestSessionKey,realmAddress} from '../src/hosting-client.ts';
import {realmIdValid} from '../src/hosting-realms.ts';
import {HOTBAR_PAGE_SIZE} from '../src/spells.ts';
globalThis.location={origin:'https://fixture.invalid'};
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const between=(a,b)=>{const start=main.indexOf(a),end=main.indexOf(b,start+a.length);assert(start>=0&&end>start,a);return main.slice(start,end);};
const hero={id:'hero',name:'Willow',level:25,hp:80,maxHp:150,x:20,z:30,zone:'greenwood',instanceId:null,appearance:{className:'Ranger'},gold:100};
const alt={...hero,id:'alt',name:'Clover',level:8};
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const nodes=new Map(),storage=new Map(),sockets=[],timers=new Map(),sent=[],entries=[],previews=[],notices=[],warnings=[];let nextTimer=0,ctx;
 class Element{constructor(){this.textContent='';this.value='';this.disabled=false;this.hidden=false;this.dataset={};this.attributes=new Map();this.classList={add(){},remove(){}};}setAttribute(name,value){this.attributes.set(name,String(value));}getAttribute(name){return this.attributes.get(name)??null;}focus(){ctx.document.activeElement=this;}append(){}querySelector(){return null;}setCustomValidity(){}reportValidity(){}}
 const $=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const noop=()=>{},customizer={open:false,close(){this.open=false;},showModal(){this.open=true;}};
 ctx=createContext({creatorStep:3,showCreatorStep(){},socket:undefined,performance,performanceHud:{reset:noop},checkForUpdates:async()=>{},updateSelection:null,sessionDisplaced:false,stopSessionRenewal:undefined,refreshSessionAccessToken:async()=>undefined,setInterval:noop,clearInterval:noop,console,$,document:{visibilityState:'visible',addEventListener:noop,removeEventListener:noop,body:new Element(),activeElement:null,querySelectorAll:selector=>selector==='[data-character-id]'?ctx.rosterCharacters.map(character=>{const button=$(`character-${character.id}`);button.dataset.characterId=character.id;return button;}):[],querySelector:selector=>selector==='.customizer-art'?new Element():$(selector.match(/data-character-id="([^"]+)"/)?.[1]?'character-'+selector.match(/data-character-id="([^"]+)"/)[1]:selector)},
  HOTBAR_PAGE_SIZE,serverHotbarPageSize:8,shopSaleEvent:noop,isNativeApp:()=>false,promptNativeNotifications:noop,chatTranslation:{configure:noop,receive:noop},specialistNftUI:undefined,createClientCheck:()=>({challenge:noop,reset:noop,dispose:noop}),
  sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},appearanceValid,accountFlowPending:false,
  setActiveHostingRealm(){},resetInstantCombat:noop,hostingConfig,guestSessionKey,realmAddress,realmIdValid,activeRealmId:'eu',changingRealm:false,
  shutdownWarningActive:false,showShutdownWarning:(seconds,held)=>{ctx.shutdownWarningActive=seconds!==null;ctx.warningHeld=held;warnings.push(seconds);},mountViews:new Map(),sprintSinceMove:false,
  characterDeletion:null,closeCharacterDeletion:noop,characterDeletionError:noop,connected:false,realmAvailable:false,realmOutageMessage:'',entryActive:false,rosterActive:true,rosterCharacters:[],maxCharacters:6,selectedCharacterId:null,enteredCharacterId:undefined,creatingCharacter:false,connectionRevision:0,reconnectTimer:undefined,
  player:undefined,playerId:'',players:[],enemies:[],nodes:[],loot:[],moderationNotice:null,trainingPending:null,gmPlayers:[],party:null,partyInvites:[],dungeon:null,guideKey:'lesson',heldKeyCodes:new Map(),keys:new Set(),selectedId:null,hoveredId:null,
  appearance:{className:'Ranger'},draft:{className:'Mage',hair:'#abcdef'},creatorColor:'skin',previewRotation:0,playerName:'Willow',authEnabled:true,characterNameError,
  customizer,panel:{open:false,dataset:{},close(){this.open=false;}},canvas:{focus:noop},position:{x:0,z:0},combatAnimations:new Map(),worldReady:true,worldInstance:null,worldZone:'greenwood',serverOffset:0,
  getAccessToken:async()=> 'verified-fixture-token',readLocal:()=>null,saveLocal:noop,location:{protocol:'https:',host:'fixture.invalid'},clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},
  snapWorldPosition:noop,switchZone:async()=>{},zoneError:noop,zoneRevision:0,setWorldLoading:noop,replaceAvatar:noop,updateHUD:noop,refreshGmAccess:noop,disposeMinimap:noop,clearSocialUI:noop,clearCombat:noop,updatePartyHUD:noop,clearEntityViews:noop,clearWaypoint:noop,
  getZone:()=>({name:'Greenwood'}),renderCharacterList:(characters,selected)=>JSON.stringify({characters,selected}),showRosterPreview:character=>previews.push(character?.id),normalizeAppearance:structuredClone,drawChoices:noop,requestAnimationFrame:noop,updatePreview:noop,
  showEntry:(...args)=>{entries.push(args);ctx.entryActive=true;},clearSession:noop,send:message=>sent.push(plain(message)),toast:text=>notices.push(text),chatMessage:noop,gameAudio:{play:noop},achievementsUI:{update:noop,titleSelected:noop,unlock:noop},gmUI:{close:noop,result:noop},auctionUI:{reject:noop},nftUI:{reject:noop},goldMerchantUI:{isLinking:()=>false,reject:noop},bankUI:{reject:noop},hotbar:{reject:noop},renderTrainingPanel:noop,renderJournal:noop,
  WebSocket:class{static OPEN=1;constructor(){this.events={};this.readyState=1;sockets.push(this);}addEventListener(name,fn){this.events[name]=fn;}send(raw){sent.push(JSON.parse(raw));}close(){}message(msg){this.events.message({data:JSON.stringify(msg)});}open(){this.events.open();}end(code){this.readyState=3;this.events.close({code});}},
 });
 const source=between('function realmHasSpace(', 'async function switchHostingRealm(')+between('function saveUpdateSelection(', 'function snapWorldPosition(')+between('async function connect(', 'function showEntry(')+between('function showCharacterRoster(', 'function showRosterPreview(')+between('function openCustomizer(', 'function drawChoices(')+main.split('\n').find(line=>line.startsWith("$('roster-enter').onclick="))+between("$<HTMLFormElement>('character-form').onsubmit=", "$<HTMLInputElement>('character-name').oninput=");
 runInContext(main.match(/^function clearMovementKeys.*$/m)[0],ctx);
 runInContext(stripTypeScriptTypes(source),ctx);
 const connect=async()=>{await ctx.connect();sockets.at(-1).open();return sockets.at(-1);};
 const roster=(socket,characters=[hero,alt])=>socket.message({type:'roster',characters,maxCharacters:6});
 const retry=async()=>{assert.equal(timers.size,1,'only one quiet reconnect timer is scheduled');const [id,fn]=[...timers][0];timers.delete(id);fn();await new Promise(setImmediate);sockets.at(-1).open();return sockets.at(-1);};
 return {ctx,$,storage,sockets,timers,sent,entries,previews,notices,warnings,connect,roster,retry};
}
// The countdown leaves gameplay active and holds client updates until the real shutdown.
for(const ending of ['retiring','disconnect','pause']){
 const f=fixture(),{ctx}=f;const socket=await f.connect();f.roster(socket);socket.message({type:'welcome',id:hero.id,player:hero});ctx.keys.add('w');
 for(const secondsRemaining of [300,240,180,120,60,10,9,8,7,6,5,4,3,2,1]){
  socket.message({type:'shutdownWarning',secondsRemaining});assert.equal(f.warnings.at(-1),secondsRemaining);assert.equal(ctx.saveUpdateSelection(),false);
  assert(ctx.realmAvailable&&ctx.connected&&!ctx.rosterActive&&ctx.player.id===hero.id&&ctx.keys.has('w'),'shutdown warnings keep the player in control');
 }
 assert.equal(f.storage.size,0,'a shutdown warning cannot create a reload marker');
 if(ending==='retiring'){
  socket.message({type:'realmStatus',available:false});socket.message({type:'shutdownWarning',secondsRemaining:1});assert.equal(f.warnings.at(-1),null,'a retiring socket cannot revive the countdown');
 }else if(ending==='disconnect')socket.end(1006);else ctx.pauseConnection();
 assert.equal(f.warnings.at(-1),null);assert(!ctx.shutdownWarningActive);assert.equal(ctx.saveUpdateSelection(),true,'actual shutdown, disconnect or account exit releases client updates');
}
// Held notices continue to guard reloads after expiry and can be canceled without retiring the realm.
{
 const f=fixture(),{ctx}=f;const socket=await f.connect();f.roster(socket);socket.message({type:'welcome',id:hero.id,player:hero});ctx.keys.add('w');
 for(const secondsRemaining of [300,60,0]){
  socket.message({type:'shutdownWarning',secondsRemaining,held:true});assert.equal(ctx.warningHeld,true);assert.equal(f.warnings.at(-1),secondsRemaining);
  assert.equal(ctx.saveUpdateSelection(),false);assert(ctx.realmAvailable&&ctx.player.id===hero.id&&ctx.keys.has('w'));
 }
 socket.message({type:'shutdownWarning',secondsRemaining:null});assert.equal(f.warnings.at(-1),null);assert.equal(ctx.saveUpdateSelection(),true);
 assert(ctx.realmAvailable&&ctx.player.id===hero.id&&ctx.keys.has('w'),'canceling a held warning leaves gameplay active');
}
// An automatic reload keeps only tab-local UI intent; the new authenticated roster remains authoritative.
{
 const f=fixture(),{ctx,$,storage}=f;const socket=await f.connect();f.roster(socket);ctx.selectedCharacterId='alt';ctx.openCustomizer();
 ctx.draft={...DEFAULT_APPEARANCE,className:'Mage'};$('character-name').value='Unfinished Mage';
 for(const field of ['accountFlowPending','creatingCharacter']){ctx[field]=true;assert.equal(ctx.saveUpdateSelection(),false);ctx[field]=false;}
 ctx.characterDeletion={pending:true};assert.equal(ctx.saveUpdateSelection(),false);ctx.characterDeletion=null;assert.equal(storage.size,0,'busy operations cannot be interrupted or persisted as a resume request');
 assert.equal(ctx.saveUpdateSelection(),true);const saved=storage.get('mossvale-update-selection');assert(!saved.includes('token')&&!saved.includes('gold'));
 ctx.updateSelection=ctx.takeUpdateSelection();assert.equal(storage.size,0,'resume intent is consumed once after authentication');
 ctx.selectedCharacterId=null;ctx.rosterCharacters=[];ctx.customizer.close();f.roster(socket);
 assert.equal(ctx.selectedCharacterId,'alt','the selected alternative survives the first fresh roster');assert(ctx.customizer.open);assert.equal($('character-name').value,'Unfinished Mage');assert.equal(ctx.draft.className,'Mage');
 assert(!f.sent.some(message=>message.type==='selectCharacter'||message.type==='createCharacter'),'an update never replays entry or creation');
 ctx.updateSelection={resume:true,selectedId:'deleted-or-other-account'};ctx.customizer.close();ctx.rosterCharacters=[];f.roster(socket);assert.equal(ctx.selectedCharacterId,'hero','missing character IDs are discarded against the verified roster');
 socket.end(4001);ctx.saveUpdateSelection();assert.equal(ctx.takeUpdateSelection().resume,false,'a displaced tab cannot take the active account back after an update');
 const setItem=ctx.sessionStorage.setItem;ctx.sessionStorage.setItem=()=>{throw Error('Storage full');};assert.equal(ctx.saveUpdateSelection(),false,'a displaced tab stays paused when its resume marker cannot be saved');ctx.sessionStorage.setItem=setItem;
 for(const raw of ['broken','{"resume":true,"selectedId":42}','{"resume":true,"selectedId":null,"draft":{"name":"Bad","appearance":{}}}']){
  storage.set('mossvale-update-selection',raw);const value=ctx.takeUpdateSelection();assert(value===null||!value.draft);assert.equal(storage.size,0);
 }
 const startup=between(' updateSelection=takeUpdateSelection();',' startUpdates(saveUpdateSelection);');let opens=0;ctx.openCharacterSelection=()=>opens++;
 for(const authState of ['account','guest','signed-out'])for(const resume of [true,false]){
  storage.set('mossvale-update-selection',JSON.stringify({resume,selectedId:'alt'}));ctx.authState=authState;const before=opens;
  runInContext(stripTypeScriptTypes(startup),ctx);assert.equal(opens-before,resume&&authState!=='signed-out'?1:0,'only an authenticated or configured guest session resumes its roster');
 }
}
// An uncached roster during a reload is unknown, not a confirmed empty account.
{
 const f=fixture(),{ctx,$}=f;ctx.renderRoster();
 assert.equal($('roster-character-name').textContent,'Waiting for the realm');
 assert.equal($('roster-character-name').getAttribute('translate'),'yes','waiting text remains localizable');
 assert.equal($('roster-character-detail').textContent,'Your characters will appear when the realm reconnects.');
 assert.equal($('roster-count').textContent,'Loading…');assert.match($('character-list').innerHTML,/Loading characters/);assert.doesNotMatch($('character-list').innerHTML,/first adventure|Create an adventurer/);
 assert($('roster-enter').disabled&&$('roster-create').disabled);
 const socket=await f.connect();f.roster(socket,[]);
 assert.equal($('roster-character-name').textContent,'Your story begins here');assert.equal($('roster-character-detail').textContent,'Create your first adventurer, then enter the world.');assert.equal($('roster-count').textContent,'0 / 6');assert(!$('roster-create').disabled);assert($('roster-enter').disabled);
}
// A draining socket can publish final saved data, but cannot enable entry before its replacement authenticates.
{
 const f=fixture(),{ctx,$}=f;let socket=await f.connect();assert($('roster-enter').disabled&&$('roster-create').disabled);f.roster(socket);ctx.selectedCharacterId='alt';ctx.renderRoster();assert(!$('roster-enter').disabled);
 assert.equal($('roster-character-name').getAttribute('translate'),'no','selected player names are protected from localization');
 socket.message({type:'welcome',id:hero.id,player:hero});assert.equal(ctx.rosterActive,false);ctx.player={...hero,gold:222,level:26};
 socket.message({type:'realmStatus',available:false});assert(ctx.rosterActive&&!$('roster').hidden);assert.equal(ctx.selectedCharacterId,'hero');assert.equal(ctx.enteredCharacterId,undefined);assert.equal(ctx.player,undefined);assert.equal(ctx.rosterCharacters.find(p=>p.id==='hero').gold,222);assert.deepEqual(plain(ctx.rosterCharacters.map(p=>p.id)),['hero','alt'],'held roster ordering stays stable');
 assert($('roster-enter').disabled&&$('roster-create').disabled&&$('create-character').disabled);const before=f.sent.length;$('roster-enter').onclick();ctx.openCustomizer();assert.equal(f.sent.length,before);assert(!ctx.customizer.open);
 f.roster(socket,[{...hero,gold:250},alt]);assert.equal(ctx.rosterCharacters[0].gold,250);assert(!ctx.realmAvailable&&$('roster-enter').disabled,'final retiring roster does not reopen the realm');
 socket.message({type:'event',kind:'info',text:'Final save complete',logOnly:true});assert($('roster-enter').disabled,'late info cannot unlock entry');
 socket.message({type:'welcome',id:hero.id,player:hero});assert(ctx.rosterActive&&ctx.player===undefined,'late welcome from a retiring socket cannot enter the world');
 socket.end(1012);assert.equal(f.entries.length,0);assert.equal(f.notices.length,0,'updates produce no reconnect toast spam');
 const renders=f.previews.length;socket=await f.retry();assert(!('characterId' in f.sent.at(-1)),'update reconnect authenticates the roster, never auto-enters a character');socket.end(1006);assert.equal(f.previews.length,renders,'repeated failures preserve the existing roster preview');assert.equal(ctx.selectedCharacterId,'hero');assert.match($('roster-error').textContent,/updating/);
 socket=await f.retry();assert($('roster-enter').disabled,'an open socket alone does not prove availability');f.roster(socket,[{...hero,gold:250},alt]);assert(ctx.realmAvailable);assert.equal(ctx.selectedCharacterId,'hero');assert(!$('roster-enter').disabled&&!$('roster-create').disabled);assert.equal($('roster-error').textContent,'');assert.equal(f.sent.filter(m=>m.type==='selectCharacter').length,0);
 $('roster-enter').onclick();assert.deepEqual(f.sent.at(-1),{type:'selectCharacter',realmId:'eu',characterId:'hero'});
}
// Ordinary outages preserve selection and an unsent creator draft as well as planned updates.
{
 const f=fixture(),{ctx,$}=f;let socket=await f.connect();f.roster(socket);ctx.selectedCharacterId='alt';ctx.renderRoster();ctx.openCustomizer();ctx.draft={className:'Cleric',hair:'#aabbcc'};$('character-name').value='Unfinished Hero';ctx.creatingCharacter=true;
 socket.end(1006);assert(ctx.customizer.open);assert.equal(ctx.creatingCharacter,false);assert($('create-character').disabled);const before=f.sent.length;$('character-form').onsubmit({preventDefault(){}});assert.equal(f.sent.length,before,'creation submit is guarded even if invoked while disconnected');
 socket=await f.retry();f.roster(socket);assert(ctx.customizer.open);assert.equal($('character-name').value,'Unfinished Hero');assert.deepEqual(plain(ctx.draft),{className:'Cleric',hair:'#aabbcc'});assert.equal(ctx.selectedCharacterId,'alt');assert(!$('create-character').disabled);assert.equal(f.sent.filter(m=>m.type==='createCharacter').length,0,'reconnect never replays creation');
 $('character-form').onsubmit({preventDefault(){}});assert.equal(f.sent.at(-1).type,'createCharacter');
}
// All existing terminal stops remain terminal; transient token expiry still gets its own refresh attempt.
for(const code of [4001,4403,4408,4409]){
 const f=fixture();const socket=await f.connect();f.roster(socket);if(code===4408||code===4409)socket.message({type:'gmNotice',action:code===4408?'kick':'ban',text:'Moderator reason'});socket.end(code);assert.equal(f.timers.size,0,`${code} must not retry`);assert.equal(f.entries.length,code===4001?0:1);if(code===4408||code===4409)assert.deepEqual(f.entries[0],['Moderator reason',code===4408]);
}
{
 const f=fixture();let socket=await f.connect();f.roster(socket);socket.message({type:'welcome',id:hero.id,player:hero});socket.end(4401);socket=await f.retry();assert.equal(f.sent.at(-1).characterId,'hero','authenticated token refresh retains its established resume behavior');socket.end(4401);assert.equal(f.entries.length,1);assert.equal(f.timers.size,0,'rejected refreshed credentials stop retrying');
}
console.log('PASS realm updates client: live shutdown warnings without gameplay interruption, deferred reload and warning cleanup, retained roster/selection/draft, final-drain roster lock, quiet retries, no update auto-entry/replayed creation, and preserved auth/GM/session stops.');
