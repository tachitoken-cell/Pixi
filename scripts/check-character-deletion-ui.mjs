import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import {hostingConfig,guestSessionKey,realmAddress} from '../src/hosting-client.ts';
import {realmIdValid} from '../src/hosting-realms.ts';
globalThis.location={origin:'https://fixture.invalid'};
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const between=(a,b)=>{const start=main.indexOf(a),end=main.indexOf(b,start+a.length);assert(start>=0&&end>start,a);return main.slice(start,end);};
const hero={id:'hero',name:'Willow',level:25,hp:80,maxHp:150,x:20,z:30,zone:'greenwood',instanceId:null,appearance:{className:'Ranger'},gold:100};
const alt={...hero,id:'alt',name:'Clover',level:8};
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const nodes=new Map(),sockets=[],timers=new Map(),sent=[],entries=[],previews=[],notices=[];let nextTimer=0,ctx;
 class Element{constructor(){this.textContent='';this.value='';this.disabled=false;this.hidden=false;this.dataset={};this.attributes=new Map();this.classList={add(){},remove(){}};this.events={};this.open=false;}addEventListener(type,fn){this.events[type]=fn;}fire(type){const event={prevented:false,preventDefault(){this.prevented=true;}};this.events[type]?.(event);return event;}showModal(){this.open=true;}close(){this.open=false;}focus(){ctx.document.activeElement=this;}append(){}setAttribute(name,value){this.attributes.set(name,String(value));}getAttribute(name){return this.attributes.get(name)??null;}querySelector(){return null;}setCustomValidity(){}reportValidity(){}}
 const $=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const noop=()=>{},customizer={open:false,close(){this.open=false;},showModal(){this.open=true;}};
 ctx=createContext({creatorStep:3,showCreatorStep(){},performance,performanceHud:{reset:noop},checkForUpdates:async()=>{},updateSelection:null,sessionDisplaced:false,stopSessionRenewal:undefined,refreshSessionAccessToken:async()=>undefined,setInterval:noop,clearInterval:noop,console,$,document:{visibilityState:'visible',addEventListener:noop,removeEventListener:noop,body:new Element(),activeElement:null,querySelectorAll:selector=>selector==='[data-character-id]'?ctx.rosterCharacters.map(character=>{const button=$(`character-${character.id}`);button.dataset.characterId=character.id;return button;}):[],querySelector:selector=>selector==='.customizer-art'?new Element():$(selector.match(/data-character-id="([^"]+)"/)?.[1]?'character-'+selector.match(/data-character-id="([^"]+)"/)[1]:selector)},
  isNativeApp:()=>false,specialistNftUI:undefined,createClientCheck:()=>({challenge:noop,reset:noop,dispose:noop}),
  zoneRevision:0,setWorldLoading:noop,socket:null,characterDeletion:null,connected:false,realmAvailable:false,realmOutageMessage:'',entryActive:false,rosterActive:true,rosterCharacters:[],maxCharacters:6,selectedCharacterId:null,enteredCharacterId:undefined,creatingCharacter:false,connectionRevision:0,reconnectTimer:undefined,
  setActiveHostingRealm(){},hostingConfig,guestSessionKey,realmAddress,realmIdValid,activeRealmId:'eu',showShutdownWarning:noop,changingRealm:false,resetInstantCombat:noop,
  player:undefined,playerId:'',players:[],enemies:[],nodes:[],loot:[],moderationNotice:null,trainingPending:null,gmPlayers:[],party:null,partyInvites:[],dungeon:null,guideKey:'lesson',heldKeyCodes:new Map(),keys:new Set(),selectedId:null,hoveredId:null,
  appearance:{className:'Ranger'},draft:{className:'Mage',hair:'#abcdef'},creatorColor:'skin',previewRotation:0,playerName:'Willow',authEnabled:true,
  customizer,panel:{open:false,dataset:{},close(){this.open=false;}},canvas:{focus:noop},position:{x:0,z:0},combatAnimations:new Map(),worldReady:true,worldInstance:null,worldZone:'greenwood',serverOffset:0,
  getAccessToken:async()=> 'verified-fixture-token',readLocal:()=>null,saveLocal:noop,location:{protocol:'https:',host:'fixture.invalid'},clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},
  shopSaleEvent:noop,snapWorldPosition:noop,switchZone:async()=>{},zoneError:noop,replaceAvatar:noop,updateHUD:noop,refreshGmAccess:noop,disposeMinimap:noop,clearSocialUI:noop,clearCombat:noop,updatePartyHUD:noop,clearEntityViews:noop,clearWaypoint:noop,
  getZone:()=>({name:'Greenwood'}),renderCharacterList:(characters,selected)=>JSON.stringify({characters,selected}),showRosterPreview:character=>previews.push(character?.id),normalizeAppearance:structuredClone,drawChoices:noop,requestAnimationFrame:noop,updatePreview:noop,
  showEntry:(...args)=>{entries.push(args);ctx.entryActive=true;},clearSession:noop,send:message=>sent.push(plain(message)),toast:text=>notices.push(text),chatMessage:noop,gameAudio:{play:noop},gmUI:{close:noop,result:noop},auctionUI:{reject:noop},nftUI:{reject:noop},goldMerchantUI:{isLinking:()=>false,reject:noop},bankUI:{reject:noop},hotbar:{reject:noop},renderTrainingPanel:noop,renderJournal:noop,
  WebSocket:class{static OPEN=1;constructor(){this.events={};this.readyState=1;sockets.push(this);}addEventListener(name,fn){this.events[name]=fn;}send(raw){sent.push(JSON.parse(raw));}close(){}message(msg){this.events.message({data:JSON.stringify(msg)});}open(){this.events.open();}end(code){this.readyState=3;this.events.close({code});}},
 });
 const source=between('function realmHasSpace(', 'async function switchHostingRealm(')+between('async function connect(', 'function pauseConnection(')+between('function showCharacterRoster(', 'function showRosterPreview(')+between('function openCustomizer(', 'function drawChoices(')+between('function closeCharacterDeletion(',"$('roster-create').onclick=")+main.split('\n').find(line=>line.startsWith("$('roster-enter').onclick="))+between("$<HTMLFormElement>('character-form').onsubmit=", "$<HTMLInputElement>('character-name').oninput=");
 runInContext(main.match(/^function clearMovementKeys.*$/m)[0],ctx);
 runInContext(stripTypeScriptTypes(source),ctx);
 const connect=async()=>{await ctx.connect();sockets.at(-1).open();return sockets.at(-1);};
 const roster=(socket,characters=[hero,alt])=>socket.message({type:'roster',characters,maxCharacters:6});
 const retry=async()=>{assert.equal(timers.size,1,'only one quiet reconnect timer is scheduled');const [id,fn]=[...timers][0];timers.delete(id);fn();await new Promise(setImmediate);sockets.at(-1).open();return sockets.at(-1);};
 return {ctx,$,sockets,timers,sent,entries,previews,notices,connect,roster,retry};
}

const enter=f=>f.$('roster-delete').onclick();
const input=(f,value)=>{f.$('character-delete-confirmation').value=value;f.$('character-delete-confirmation').fire('input');};
const submit=f=>f.$('character-delete-form').onsubmit({preventDefault(){}});
const requests=f=>f.sent.filter(message=>message.type==='deleteCharacter');
{
 const f=fixture(),{ctx,$}=f,shared={...hero,realmId:'eu'};
 Object.assign(ctx,{connected:true,realmAvailable:true,activeRealmId:'us',selectedCharacterId:hero.id,rosterCharacters:[shared]});
 ctx.renderRoster();enter(f);assert.equal($('character-delete-name').textContent,'Willow','a shared character remains selectable and deletable when its saved realm differs from the current server');
 $('character-delete-cancel').onclick();
 Object.assign(ctx,{player:{...shared,gold:250},rosterActive:false});ctx.showRealmUnavailable();
 assert.equal(ctx.rosterCharacters.length,1);assert.equal(ctx.rosterCharacters[0].gold,250,'holding final progress updates the same shared character');
}
{
 const f=fixture(),{ctx,$}=f;const socket=await f.connect();enter(f);assert(!ctx.characterDeletion,'no deletion can open before authenticated availability');
 const dangerous={...hero,name:'<img src=x onerror=bad>'};f.roster(socket,[dangerous,alt]);enter(f);
 assert.equal($('roster-character-name').getAttribute('translate'),'no','selected player names are protected from localization');
 assert($('character-delete-dialog').open);assert.equal($('character-delete-name').textContent,dangerous.name);assert.equal($('character-delete-name').innerHTML,undefined,'names are written with textContent');assert.equal(ctx.document.activeElement,$('character-delete-confirmation'));
 assert.equal(requests(f).length,0,'opening does not delete');
 for(const wrong of ['', 'i confirm','I Confirm','I confirm ',' I confirm','I  confirm','I confirm\n']){input(f,wrong);assert($('character-delete-submit').disabled,JSON.stringify(wrong));submit(f);assert.equal(requests(f).length,0);}
 input(f,'I confirm');assert(!$('character-delete-submit').disabled);$('character-delete-cancel').onclick();assert(!$('character-delete-dialog').open);assert.equal(requests(f).length,0);assert.equal($('character-delete-confirmation').value,'');assert.equal(ctx.document.activeElement,$('roster-delete'));
 enter(f);input(f,'I confirm');const escape=$('character-delete-dialog').fire('cancel');assert(escape.prevented);assert(!$('character-delete-dialog').open);assert.equal(requests(f).length,0);
 enter(f);input(f,'I confirm');ctx.selectedCharacterId='alt';ctx.renderRoster();assert(!$('character-delete-dialog').open,'changing selection invalidates the captured confirmation');submit(f);assert.equal(requests(f).length,0);
 enter(f);input(f,'I confirm');f.roster(socket,[dangerous,alt]);assert(!$('character-delete-dialog').open,'any roster refresh invalidates an unsubmitted confirmation');
 enter(f);input(f,'I confirm');submit(f);assert.deepEqual(requests(f)[0],{type:'deleteCharacter',characterId:'alt',confirmation:'I confirm'});assert(ctx.characterDeletion.pending);assert($('character-delete-submit').disabled&&$('character-delete-cancel').disabled);assert($('roster-enter').disabled&&$('roster-create').disabled&&$('roster-delete').disabled);submit(f);enter(f);assert.equal(requests(f).length,1,'pending cannot resend or start another deletion');
 $('character-delete-dialog').fire('cancel');assert($('character-delete-dialog').open,'Escape cannot imply cancellation after a confirmed request was sent');
 f.roster(socket,[dangerous,alt]);assert(ctx.characterDeletion.pending,'a stale roster retaining the target does not prove success');assert.equal(requests(f).length,1);
 socket.message({type:'event',kind:'info',requestType:'deleteCharacter',text:'Cancel your auctions before deleting this character.',logOnly:true});assert(!ctx.characterDeletion.pending);assert.equal($('character-delete-error').textContent,'Cancel your auctions before deleting this character.');assert($('character-delete-submit').disabled);assert(!$('character-delete-cancel').disabled);assert.equal($('character-delete-confirmation').value,'','a retry needs fresh exact confirmation');
 input(f,'I confirm');submit(f);assert.equal(requests(f).length,2);f.roster(socket,[dangerous]);assert(!$('character-delete-dialog').open);assert.equal(ctx.characterDeletion,null);assert.equal(ctx.selectedCharacterId,'hero');assert.equal(ctx.rosterCharacters.length,1);assert.equal(ctx.rosterCharacters[0].name,dangerous.name,'other character state remains untouched');
 enter(f);input(f,'I confirm');submit(f);f.roster(socket,[]);assert.equal(ctx.selectedCharacterId,null);assert.equal(ctx.rosterCharacters.length,0);assert($('roster-enter').disabled&&$('roster-delete').disabled);assert(!$('roster-create').disabled,'deleting the last character preserves the account and enables creation');assert(!$('character-delete-dialog').open);
}
{
 const f=fixture(),{ctx,$}=f;let socket=await f.connect();f.roster(socket);enter(f);input(f,'I confirm');socket.message({type:'realmStatus',available:false});assert.equal(ctx.characterDeletion,null);assert(!$('character-delete-dialog').open);assert.equal($('character-delete-confirmation').value,'');assert($('roster-delete').disabled);submit(f);assert.equal(requests(f).length,0);
 socket.end(1012);socket=await f.retry();f.roster(socket);assert(!$('character-delete-dialog').open);assert.equal(requests(f).length,0,'reconnecting does not retry a cancelled confirmation');
 enter(f);input(f,'I confirm');submit(f);socket.end(1006);assert.equal(ctx.characterDeletion,null);assert(!$('character-delete-dialog').open);socket=await f.retry();f.roster(socket);assert.equal(requests(f).length,1,'a lost response never replays permanent deletion');assert(!$('character-delete-dialog').open);
 // An account teardown invokes the same unconditional reset even with an active confirmation.
 enter(f);input(f,'I confirm');Object.assign(ctx,{mountViews:new Map(),disposeMount(){},disposeMinimap(){},sprintSinceMove:false});runInContext(stripTypeScriptTypes(between('function pauseConnection(', 'function showEntry(')+'pauseConnection();'),ctx);assert.equal(ctx.characterDeletion,null);assert(!$('character-delete-dialog').open);assert.equal($('character-delete-confirmation').value,'');
}
const ui=readFileSync(new URL('../src/ui.ts',import.meta.url),'utf8'),css=readFileSync(new URL('../src/roster.css',import.meta.url),'utf8');
assert.match(ui,/<dialog id="character-delete-dialog"[^>]*aria-labelledby="character-delete-title"/);assert.match(ui,/label for="character-delete-confirmation"/);assert.match(ui,/id="character-delete-confirmation"[^>]*autofocus/);assert.match(ui,/All progress and items for this character will be permanently lost/);assert.match(css,/character-delete-submit[^}]*background:#792e29/);assert.match(css,/character-delete-dialog::backdrop/);
console.log('PASS character deletion UI: exact untrimmed confirmation, safe captured identity, native focus/cancel/Escape, selection and roster invalidation, one pending command, explicit error retry, disconnect/auth cleanup, and last-character account preservation.');
