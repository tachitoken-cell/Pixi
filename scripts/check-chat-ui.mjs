import {mountChatTranslation} from '../src/chat-translation-ui.ts';
import assert from 'node:assert/strict';
import './check-chat-bubbles.mjs';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import { EMOTES, emoteCommand, EMOTE_HELP } from '../src/emotes.ts';

const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/ui.ts',import.meta.url),'utf8'),chatCss=readFileSync(new URL('../src/chat.css',import.meta.url),'utf8');
assert.match(ui.match(/<div id="chat-log-\$\{id\}"[^>]*>/)?.[0]||'',/tabindex="0"/,'keyboard focus belongs to the scrollable log');
const panelTag=ui.match(/<div id="chat-panel-\$\{id\}"[^>]*>/)?.[0]||'';assert.match(panelTag,/role="tabpanel"/);assert.doesNotMatch(panelTag,/tabindex=/,'the wrapper must not intercept keyboard scrolling');
assert.doesNotMatch(chatCss,/border-image:/,'chat has no window frame');
assert.match(ui,/<details id="chat-preview" open>/,'conversation feed is visible by default');
const slice=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert(from>=0&&to>from,`Missing chat source: ${start}`);return source.slice(from,to);};
const channels=['world','system','whisper','party'],nodes=new Map(),sent=[],saved=new Map([['mossvale-chat-size','[450,260]']]),notices=[];
class Element{
 constructor(){this.children=[];this.dataset={};this.attributes={};this.style={};this.value='';this.hidden=false;this.disabled=false;this.scrollTop=0;this.clientHeight=100;this.events={};const classes=new Set();this.classList={contains:name=>classes.has(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)};}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
 get firstElementChild(){return this.children[0];}get firstChild(){return this.children[0];}get scrollHeight(){return this.children.length*20;}
 setAttribute(name,value){this.attributes[name]=String(value);}
 removeAttribute(name){delete this.attributes[name];}
 replaceChildren(...children){this.children=[];this.append(...children);}
 contains(child){return this.children.includes(child);}
 set textContent(value){this.text=String(value);this.children=[];}get textContent(){return this.text||this.children.map(child=>child.textContent).join('');}
 querySelector(){return this.badge;}
 addEventListener(type,handler){this.events[type]=handler;}
 dispatchEvent(event){this.events[event.type]?.(event);return true;}
 focus(){document.activeElement=this;}blur(){document.activeElement=null;}click(){this.onclick?.();}
 getBoundingClientRect(){if(this===nodes.get('chat')){const scale=document.body.classList.contains('mobile-controls')?1:context.chatScale/100;return {width:(parseFloat(this.style.width)||340)*scale,height:(parseFloat(this.style.height)||210)*scale};}if(this.scrollContainer)return {top:0,bottom:this.clientHeight};if(this.parent?.scrollContainer){const top=this.parent.children.indexOf(this)*20-this.parent.scrollTop;return {top,bottom:top+20};}return {width:parseFloat(this.style.width)||340,height:parseFloat(this.style.height)||210};}
 setPointerCapture(id){this.pointerId=id;}
}
const $=id=>{if(!nodes.has(id)){const node=new Element();node.scrollContainer=id.startsWith('chat-log-');nodes.set(id,node);}return nodes.get(id);};
const tabs=channels.map(channel=>{const tab=$(`chat-tab-${channel}`);tab.dataset.chatChannel=channel;tab.badge=new Element();tab.append({textContent:channel});return tab;});
const document={body:new Element(),activeElement:null,createElement:()=>new Element(),createTextNode:text=>({textContent:text}),querySelectorAll:()=>tabs};
const window=new Element(),canvas=new Element();let stopped=0,cleared=0;
window.visualViewport=new Element();
const bubbleCalls=[],bubbleClears=[];
const context=vm.createContext({mountChatTranslation,chatScale:100,showChatBubble:(...args)=>bubbleCalls.push(args),clearChatBubbles:ids=>bubbleClears.push(ids),specialistNftUI:undefined,deferTouchRender:()=>false,Event,requestAnimationFrame:callback=>callback(),emoteCommand,EMOTE_HELP,$,document,window,canvas,innerWidth:1000,innerHeight:700,gmBadge:()=>null,send:msg=>sent.push(JSON.parse(JSON.stringify(msg))),toast:text=>notices.push(text),stopForSocialUI:()=>stopped++,heldKeyCodes:new Map(),keys:{clear:()=>cleared++},getComputedStyle:()=>({left:'20px',bottom:'80px'}),readLocal:key=>saved.get(key),saveLocal:(key,value)=>saved.set(key,value)});
const run=code=>vm.runInContext(stripTypeScriptTypes(code),context);
run(source.match(/^function clearMovementKeys.*$/m)[0]);
run(slice('type ChatChannel=','const friendsUI=')+slice('function chatMessage(','\nfunction send(')+slice('function mobileChat(','\nfunction openPlayerMenu(')+slice("$('chat-toggle').onclick=",'let mapCanvas='));
const input=$('chat-input'),log=channel=>$(`chat-log-${channel}`),tab=channel=>$(`chat-tab-${channel}`),lastText=channel=>log(channel).children.at(-1)?.children.at(-1).textContent;
const select=channel=>context.selectChatChannel(channel),submit=()=>$('chat-form').onsubmit({preventDefault(){}}),key=(node,key)=>{const event={key,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};(node.onkeydown||node.events.keydown)(event);return event;};

assert.deepEqual($('chat').getBoundingClientRect(),{width:450,height:260},'saved size is restored');
const restoreSize=slice("try{const size=JSON.parse(readLocal('mossvale-chat-size')", "\nwindow.addEventListener('resize'");
for(const raw of ['{','[1]','["400",210]','[1e999,210]','{"width":400}']){saved.set('mossvale-chat-size',raw);run(restoreSize);assert.deepEqual($('chat').getBoundingClientRect(),{width:450,height:260},'malformed saved sizes do not change the window');}
assert($('chat').classList.contains('collapsed'),'start with the mixed-channel HUD feed');context.setChatExpanded(true);context.chatMessage('Hello','Ranger');context.chatMessage('Quest updated');context.chatMessage('Private',undefined,{id:'friend',name:'Friend',incoming:true});context.chatMessage('Together','Leader',undefined,undefined,'party');
for(const channel of channels)assert.equal(log(channel).children.length,1,`${channel} has its own history`);
assert.equal(tab('world').dataset.unread,'0');assert.equal(tab('whisper').dataset.unread,'1');assert($('chat-toggle').classList.contains('has-unread'));
select('whisper');assert.equal(tab('whisper').dataset.unread,'0');assert(tab('whisper').badge.hidden);assert.equal(tab('whisper').attributes['aria-selected'],'true');assert.equal(tab('world').tabIndex,-1);assert($('chat-panel-world').hidden);assert(!$('chat-panel-whisper').hidden);assert(input.disabled,'recipient is required');
log('whisper').children[0].children[0].onclick();assert.equal(stopped,1);assert.equal(input.placeholder,'Whisper to Friend…');assert(!input.disabled);assert.equal(document.activeElement,input);
input.value='Private draft';select('party');input.value='Party draft';select('world');input.value='World draft';select('whisper');assert.equal(input.value,'Private draft');select('party');assert.equal(input.value,'Party draft');submit();assert.deepEqual(sent.at(-1),{type:'partyChat',text:'Party draft'});
select('world');assert.equal(input.value,'World draft');submit();assert.deepEqual(sent.at(-1),{type:'chat',text:'World draft'});select('whisper');submit();assert.deepEqual(sent.at(-1),{type:'whisper',targetId:'friend',text:'Private draft'});assert.equal(run('chatDrafts.whisper'),'');
input.value='For Friend';context.openWhisper({id:'another',name:'Another'});assert.equal(input.value,'','changing recipients drops the previous private draft');input.value='Never public';run('whisperTarget=null');const count=sent.length;submit();assert.equal(sent.length,count);assert.equal(input.value,'Never public');assert.match(notices.at(-1),/Choose a player/);
select('system');assert($('chat-form').hidden);input.value='Cannot send system';submit();assert.equal(sent.length,count,'system messages cannot be submitted');
for(const channel of channels){for(let i=0;i<45;i++)context.chatMessage(`${channel} ${i}`,'Writer',undefined,undefined,channel);assert.equal(log(channel).children.length,40);assert.equal(log(channel).children[0].children.at(-1).textContent,`${channel} 5`);}
select('world');log('world').scrollTop=0;context.chatMessage('While reading','Writer');assert.equal(log('world').scrollTop,0,'new messages preserve a scrolled-up history');log('world').scrollTop=log('world').scrollHeight-log('world').clientHeight;context.chatMessage('At bottom','Writer');assert.equal(log('world').scrollTop,log('world').scrollHeight);
context.setChatExpanded(false);context.chatMessage('Collapsed','Writer');assert.equal(tab('world').dataset.unread,'1');context.setChatExpanded(true);assert.equal(tab('world').dataset.unread,'0');
for(const channel of channels)select(channel);assert(!$('chat-toggle').classList.contains('has-unread'),'visiting each tab clears the aggregate unread indicator');
assert(key(tab('party'),'ArrowRight').prevented);assert.equal(document.activeElement,tab('world'));key(tab('world'),'ArrowLeft');assert.equal(document.activeElement,tab('party'));key(tab('party'),'Home');assert.equal(document.activeElement,tab('world'));key(tab('world'),'End');assert.equal(document.activeElement,tab('party'));
assert(key($('chat'),'Escape').stopped);assert.equal(document.activeElement,canvas);const clearedBefore=cleared;$('chat').events.pointerdown();assert.equal(cleared,clearedBefore+1);

const eventChat=source.split('\n').find(line=>line.trimStart().startsWith("if(msg.kind==='chat'){"));assert(eventChat);const route=msg=>{context.msg=msg;run(eventChat);};
route({kind:'chat',text:'Ranger: World event',channel:'world'});assert.equal(lastText('world'),'World event');route({kind:'chat',text:'[Party] Leader: Old party event'});assert.equal(lastText('party'),'Old party event');route({kind:'chat',text:'Leader: New party event',channel:'party'});assert.equal(lastText('party'),'New party event');route({kind:'chat',text:'[Party] Costume: Public label',channel:'world'});assert.equal(lastText('world'),'Public label','explicit world channel overrides a legacy-looking player name');
context.playerId='self';route({kind:'chat',text:'Friend: Hello there',channel:'world',playerId:'friend'});assert.deepEqual(bubbleCalls.at(-1),['friend','Hello there','world','self'],'speech uses the server author and parsed message');
const whisperRoute=slice("   const incoming=msg.to.id===playerId",'\n  } else if(msg.type===\'trade\')');context.playerId='self';context.msg={text:'Reply back',from:{id:'self',name:'Self'},to:{id:'recipient',name:'Recipient'}};run(`(()=>{${whisperRoute}})()`);assert.match(log('whisper').children.at(-1).children[0].textContent,/To Recipient/);log('whisper').children.at(-1).children[0].onclick();input.value='Reply';submit();assert.equal(sent.at(-1).targetId,'recipient','outgoing whispers reply to the other player');

context.resizeChat(-1,-1);assert.deepEqual($('chat').getBoundingClientRect(),{width:280,height:180});context.resizeChat(9999,9999);assert.deepEqual($('chat').getBoundingClientRect(),{width:964,height:604});
const handle=$('chat-resize');key(handle,'Home');assert.deepEqual($('chat').getBoundingClientRect(),{width:340,height:250});key(handle,'ArrowRight');key(handle,'ArrowUp');assert.deepEqual(JSON.parse(saved.get('mossvale-chat-size')),[360,270]);
handle.onpointerdown({button:0,pointerId:7,clientX:0,clientY:0,preventDefault(){}});handle.onpointermove({pointerId:8,clientX:100,clientY:-100});assert.equal($('chat').style.width,'360px');handle.onpointermove({pointerId:7,clientX:50,clientY:-40});handle.onpointerup();assert.deepEqual(JSON.parse(saved.get('mossvale-chat-size')),[410,310]);assert.equal(handle.pointerId,7);
context.chatScale=80;context.resizeChat(400,250);
handle.onpointerdown({button:0,pointerId:9,clientX:0,clientY:0,preventDefault(){}});handle.onpointermove({pointerId:9,clientX:40,clientY:-32});handle.onpointerup();
assert.deepEqual(JSON.parse(saved.get('mossvale-chat-size')),[450,290],'scaled pointer movement converts physical to saved logical pixels');
key(handle,'ArrowRight');assert.deepEqual(JSON.parse(saved.get('mossvale-chat-size')),[475,290],'keyboard resize changes physical width by twenty pixels');
assert.equal($('chat').getBoundingClientRect().width,380);context.chatScale=100;
context.innerWidth=260;context.innerHeight=210;window.events.resize();assert.deepEqual($('chat').getBoundingClientRect(),{width:224,height:114},'small viewports override minimum size');
console.log('PASS chat UI: independent bounded histories and drafts, explicit/legacy routing, unread clearing, private replies and submit guards, keyboard tabs and scroll focus, anchored resize and validated saved size.');

for (const channel of ['world', 'party', 'whisper']) {
 select(channel);
 for (const id of Object.keys(EMOTES)) {
  input.value=` /${id.toUpperCase()} `;submit();assert.deepEqual(sent.at(-1),{type:'emote',emoteId:id},`${channel}: slash commands use the emote protocol`);
 }
 input.value='/stop';submit();assert.deepEqual(sent.at(-1),{type:'emote',emoteId:null});
 const before=sent.length;
 for(const text of ['/emotes','/help','/no-such-emote','/dance extra','/constructor']){input.value=text;submit();assert.match(lastText(channel),/\/dance/);}
 assert.equal(sent.length,before,'help and invalid commands never leak into public, party or private chat');
}
assert.equal(emoteCommand('hello /dance'),undefined);
assert.equal(emoteCommand('/dance extra'),'');
console.log('Emote command routing, help, stop and invalid commands verified across all chat channels.');

run(slice('function emotePlayback(','\nfunction syncEntities('));
const dance={emote:{id:'dance',startedAt:1000,endsAt:null}};
assert.equal(context.emotePlayback(dance,4250).elapsed,3.25,'playback follows server time rather than frame time');
assert.equal(context.emotePlayback(dance,500).elapsed,0,'clock corrections do not create negative elapsed time');
assert.equal(context.emotePlayback({...dance,casting:{}},2000),undefined);
assert.equal(context.emotePlayback({...dance,zeppelin:{}},2000),undefined);
assert.equal(context.emotePlayback({emote:{id:'wave',startedAt:1000,endsAt:3500}},3500),undefined,'one-shot gestures expire exactly at their server deadline');
assert.equal(context.emotePlayback(undefined,2000),undefined);

// Run the same handlers in mobile mode with real per-message scroll anchors.
document.body.classList.toggle('mobile-controls',true);
let inputReleases=0;window.addEventListener('mobile-ui-open',()=>inputReleases++);
run("setChatExpanded(false);for(const channel of ['world','system','whisper','party']){$(`chat-log-${channel}`).replaceChildren();$(`chat-log-${channel}`).scrollTop=0;$(`chat-tab-${channel}`).dataset.unread='0';}chatScroll.clear();chatPreviewMessages.length=0;updateChatPreview();updateChatUnread();");
context.chatMessage('First','Reader');context.chatMessage('Private <script> stays text',undefined,{id:'friend',name:'Friend',incoming:true});context.chatMessage('Party ready','Leader',undefined,undefined,'party');
assert.equal($('chat-preview-messages').children.length,3,'gameplay preview includes recent mixed channels');
assert.match($('chat-preview-messages').children[1].textContent,/\[Whispers\] From Friend: Private <script> stays text/);
assert.equal($('chat-preview-messages').children[1].children.length,2,'message content remains a text node, never injected HTML');
assert.equal($('chat-preview-unread').textContent,'3 new');
const previewBeforeRoutine=$('chat-preview-messages').children.map(row=>row.textContent),unreadBeforeRoutine=$('chat-preview-unread').textContent;
const systemUnreadBeforeRoutine=tab('system').dataset.unread;
run('const routinePreview=chatPreviewMessages.slice();');
for(let i=0;i<12;i++)context.chatMessage(`Collected ${i}`,undefined,undefined,undefined,'system',undefined,undefined,true);
assert.equal(log('system').children.length,12,'routine rewards remain available in System history');
assert.deepEqual($('chat-preview-messages').children.map(row=>row.textContent),previewBeforeRoutine,'routine rewards do not overwrite player conversation previews');
assert.equal($('chat-preview-unread').textContent,unreadBeforeRoutine);assert.equal(tab('system').dataset.unread,systemUnreadBeforeRoutine,'routine rewards do not add unread badges');
const routineRoute=source.split('\n').find(line=>line.trimStart().startsWith("else ")&&line.includes("if(!msg.logOnly"));assert(routineRoute);
const rewardSounds=[],rewardToasts=[];
context.gameAudio={play:value=>rewardSounds.push(value)};context.rosterActive=false;
const previousToast=context.toast;context.toast=(text)=>rewardToasts.push(text);
context.msg={kind:'reward',text:'Collected herbs',logOnly:true};run(routineRoute.trim().slice(5));
assert.equal(rewardSounds.length,0);assert.equal(rewardToasts.length,0,'log-only rewards stay silent');
context.msg={kind:'reward',text:'Level 18!'};run(routineRoute.trim().slice(5));
assert.deepEqual(rewardSounds,['reward']);assert.deepEqual(rewardToasts,['Level 18!'],'milestones still announce themselves');
context.toast=previousToast;
run("chatPreviewMessages.splice(0,chatPreviewMessages.length,...routinePreview);updateChatPreview();$(`chat-tab-system`).dataset.unread='0';updateChatUnread();");
assert(!document.body.classList.contains('chat-expanded'),'incoming messages do not open chat');
$('chat-preview-messages').onclick({target:{closest:()=>$('chat-preview-messages').children[2]}});
assert.equal(run('chatChannel'),'party','tapping a preview line opens that channel');
assert(document.body.classList.contains('chat-expanded'));assert.equal($('chat').attributes.role,undefined);assert.equal($('chat').attributes['aria-modal'],undefined);assert.equal(inputReleases,0,'inline chat does not disable gameplay controls');
assert.equal($('chat-preview-messages').attributes['aria-expanded'],'true');
input.value='Keep this party draft';input.focus();$('chat-close').onclick();
assert.equal(run('chatDrafts.party'),'Keep this party draft');assert.equal(document.activeElement,canvas);assert(!document.body.classList.contains('chat-expanded'));assert.equal($('chat').attributes.role,undefined);
$('chat-preview-messages').onclick({target:{closest:()=>null}});assert.equal(input.value,'Keep this party draft');assert.equal(inputReleases,0);
input.focus();submit();assert.equal(document.activeElement,input,'mobile send keeps the composer available');assert.deepEqual(sent.at(-1),{type:'partyChat',text:'Keep this party draft'});
assert(key($('chat'),'Escape').stopped);assert(!document.body.classList.contains('chat-expanded'),'Escape closes mobile chat before gameplay sees it');

for(let i=0;i<45;i++)context.chatMessage(`History ${i}`,'Reader');
select('world');const worldLog=log('world');worldLog.scrollTop=300;worldLog.events.scroll();const anchor=worldLog.children[15];
input.value='A world draft';$('chat-close').onclick();worldLog.scrollTop=0;
context.chatMessage('While closed A','Reader');context.chatMessage('While closed B','Reader');
$('chat-preview-messages').onclick({target:{closest:()=>null}});
assert.equal(worldLog.scrollTop,260,'reopening preserves the read message after older entries were trimmed');assert.equal(anchor.getBoundingClientRect().top,0);assert.equal(input.value,'A world draft');
select('party');input.value='Another party draft';worldLog.scrollTop=0;select('world');assert.equal(worldLog.scrollTop,260,'switching channels restores the saved read position');assert.equal(input.value,'A world draft');
context.chatMessage('While reading history','Reader');assert.equal(worldLog.scrollTop,240);assert.equal(anchor.getBoundingClientRect().top,0,'new messages do not yank the visible history');assert.equal(tab('world').dataset.unread,'1','messages arriving above the read position retain an unread badge');
worldLog.clientHeight=40;window.visualViewport.events.resize();assert.equal(anchor.getBoundingClientRect().top,0,'keyboard resizing preserves the reading anchor');
worldLog.scrollTop=worldLog.scrollHeight-worldLog.clientHeight;worldLog.events.scroll();assert.equal(tab('world').dataset.unread,'0');
context.chatMessage('Follow latest','Reader');assert.equal(worldLog.scrollTop,worldLog.scrollHeight,'readers at the end keep following new messages');
window.visualViewport.events.resize();assert.equal(worldLog.scrollTop,worldLog.scrollHeight);
const desktopSize={...$('chat').style};context.resizeChat(900,900);assert.deepEqual($('chat').style,desktopSize,'mobile keyboard resizing cannot overwrite the saved desktop size');
context.chatMessage('Private reset',undefined,{id:'friend',name:'Friend',incoming:true});context.chatMessage('Party reset','Leader',undefined,undefined,'party');
run(slice('whisperTarget=null;if(mobileChat())setChatExpanded(false);chatPreviewMessages.splice',"for(const channel of ['whisper','party'] as const)"));
assert.doesNotMatch($('chat-preview-messages').textContent,/Private reset|Party reset/,'private previews are cleared with the social session');
assert(!document.body.classList.contains('chat-expanded'));
context.chatMessage('Old realm','Reader');run(slice(" for(const channel of ['world','system','party','whisper'] as const)"," $('roster-error').textContent=`Connecting"));
assert.doesNotMatch($('chat-preview-messages').textContent,/Old realm/,'realm changes clear every preview and scroll anchor');assert.equal(run('chatScroll.size'),0);assert($('chat-preview-unread').hidden);
assert.match(chatCss,/#chat\.collapsed, body\.chat-expanded #chat-preview \{ display:none; \}/);
assert.match(chatCss,/min-height:94px; max-height:max\(94px,calc\(100dvh - var\(--chat-bottom\) - var\(--mobile-vtop,0px\) - 8px\)\)/,'inline history fits the visible keyboard viewport');
assert.match(chatCss,/-webkit-line-clamp:2/,'long previews are bounded without entering the hotbar');
assert.match(ui,/id="chat-close"[^>]*aria-label="Close chat and return to game"/);
let friendsClosed=0,playerMenuClosed=0;context.friendsUI={close:restoreFocus=>{assert.equal(restoreFocus,false);friendsClosed++;}};context.playerMenu={close:()=>playerMenuClosed++};context.cancelGathering=()=>{};context.setMobileMenus=()=>{};context.CustomEvent=Event;
run(slice('function stopForSocialUI()','\nfunction clearSocialUI('));
context.openWhisper({id:'friend',name:'Friend'});assert(document.body.classList.contains('chat-expanded'),'Whisper stays open after the shared social UI interlock');assert.equal(document.activeElement,input);assert.equal(friendsClosed,1);assert.equal(playerMenuClosed,1);
console.log('PASS mobile chat: bounded mixed-channel feed, channel routing, safe text, unread indicators, nonmodal input, Back/Escape, drafts, retained history anchors, keyboard resizing, desktop size isolation and private/session cleanup.');

context.chatMessage('Erase public','Deleted',undefined,undefined,'world',{targetId:'friend',name:'Deleted'});
context.chatMessage('Erase emote',undefined,undefined,undefined,'world',undefined,'friend');
context.chatMessage('Erase private',undefined,{id:'friend',name:'Friend',incoming:true});
input.value='Private draft for deleted player';
context.chatMessage('Keep public','Other',undefined,undefined,'world',{targetId:'other',name:'Other'});
context.eraseCommunityMessages(['friend']);assert.deepEqual(bubbleClears.at(-1),['friend'],'erased authors lose their world bubble');
assert.doesNotMatch(log('world').textContent,/Erase public|Erase emote/);
assert.doesNotMatch(log('whisper').textContent,/Erase private/);
assert.match(log('world').textContent,/Keep public/);
assert.doesNotMatch($('chat-preview-messages').textContent,/Erase private/);
assert.equal(run('whisperTarget'),null);assert.equal(run('chatDrafts.whisper'),'');assert.equal(input.value,'');assert(input.disabled);
console.log('PASS account erasure: authored chat, emotes, private history, preview and recipient drafts are removed without erasing other players.');
