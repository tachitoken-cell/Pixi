import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

// Exercise the shipped controller through the same small native DOM boundary as trade UI checks.
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39);/g, value => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[value]);
class Element {
  constructor(tag='div') { this.tagName=tag.toUpperCase(); this.children=[]; this.attributes={}; this.dataset={}; this.events={}; this.hidden=false; this.disabled=false; this.value=''; this.classList={toggle(){}}; }
  setAttribute(name,value) { this.attributes[name]=String(value); if(name==='id')this.id=value; if(name==='disabled')this.disabled=true; if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value); }
  getAttribute(name) { return this.attributes[name]??null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes,name); }
  append(node) { node.parentElement=this; this.children.push(node); }
  contains(node) { return node===this||this.children.some(child=>child.contains(node)); }
  get isConnected() { return this===document.body||!!this.parentElement?.isConnected; }
  focus() { document.activeElement=this; }
  set innerHTML(html) {
    this.html=html; for(const child of this.children)child.parentElement=null; this.children=[]; const stack=[this];
    for(const [,closing,tag,attrs]of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)) {
      if(closing) { if(stack.length>1)stack.pop(); continue; }
      const node=new Element(tag);
      for(const [,name,value]of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(name,decode(value??''));
      stack.at(-1).append(node); if(!['input','img','br','hr'].includes(tag))stack.push(node);
    }
  }
  get innerHTML() { return this.html||''; }
  matches(selector) { if(selector.startsWith('#'))return this.id===selector.slice(1); if(selector.startsWith('.'))return (this.getAttribute('class')||this.className||'').split(' ').includes(selector.slice(1)); const attr=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/); return attr?this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]):this.tagName===selector.toUpperCase(); }
  querySelectorAll(selector) { return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
  closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector)||null; }
  addEventListener(type,callback) { (this.events[type]||=[]).push(callback); }
  fire(type,extra={}) { const event={target:this,stopped:false,defaultPrevented:false,stopPropagation(){this.stopped=true;},preventDefault(){this.defaultPrevented=true;},...extra}; let node=this; while(node) { for(const fn of node.events[type]||[])fn(event); if(event.stopped)break; node=node.parentElement; } return event; }
}
const document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:null};
const timers=new Map(); let timerId=0;
const window=new Element('window'); document.body.parentElement=window;
window.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;}; window.clearTimeout=id=>timers.delete(id);
const scrollSource=readFileSync(new URL('../src/scroll-refresh.ts',import.meta.url),'utf8').replace('export function','function');
const deferTouchRender=runInNewContext(stripTypeScriptTypes(scrollSource)+';deferTouchRender;', {window,performance:{now:()=>0}});
const source=readFileSync(new URL('../src/friends-ui.ts',import.meta.url),'utf8');
const mount=runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export function','function'))+';mountFriendsUI;', {
  document,deferTouchRender,HTMLElement:Element,icon:()=>'<span class="item-art"></span>',getZone:id=>({name:id}),
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
});
const trigger=new Element('button'); document.body.append(trigger); trigger.focus();
const sent=[],whispers=[],invites=[],partyResponses=[]; let allowed=true,opens=0,partyChats=0,dungeons=0;
const ui=mount({send:message=>sent.push(JSON.parse(JSON.stringify(message))),allowed:()=>allowed,trigger,onOpen:()=>opens++,onWhisper:friend=>whispers.push(friend.id),onInvite:id=>invites.push(id),onPartyRespond:(type,id)=>partyResponses.push({type,id}),onPartyChat:()=>partyChats++,onDungeon:()=>dungeons++});
const panel=document.body.querySelector('#friends-window'),find=selector=>panel.querySelector(selector),list=find('#friends-list'),input=find('#friends-name'),form=find('form'),submit=form.querySelector('button');
const action=name=>find(`[data-friends-${name}]`),row=id=>find(`[data-friend-id="${id}"]`);
const friend={id:'willow',name:'Willow',level:12,className:'Ranger',online:true,zone:'Greenwood'};
const offline={...friend,id:'rowan',name:'<script>bad()</script> & Rowan',online:false,zone:null};
const update=(changes={})=>ui.update({type:'friends',friends:[offline,friend],ignored:[],incoming:[],outgoing:[],...changes});
assert(panel.hidden); assert.equal(panel.role,'dialog');
ui.toggle(); assert(!panel.hidden); assert.equal(document.activeElement,input); assert.equal(sent.at(-1).type,'friendsList');
assert.equal(trigger.getAttribute('aria-expanded'),'true'); assert.equal(list.getAttribute('aria-busy'),'true');
update(); assert(!list.innerHTML.includes('<script>')); assert(list.innerHTML.includes('&lt;script&gt;')); assert(list.innerHTML.indexOf('data-friend-id="willow"')<list.innerHTML.indexOf('data-friend-id="rowan"'),'online friends sort first');
assert(list.innerHTML.includes('Online · 1')&&list.innerHTML.includes('Offline · 1'),'friends grouped by current presence');
const search=find('#friends-search'),beforeSearch=sent.length;search.value='will';search.fire('input');assert(row('willow'));assert(!row('rowan'));assert.equal(sent.length,beforeSearch,'search is local only');search.value='absent name';search.fire('input');assert(list.innerHTML.includes('No matching names'));search.value='';search.fire('input');
row('willow').fire('click'); assert(!action('whisper').disabled&&!action('invite').disabled);
action('whisper').fire('click'); action('invite').fire('click'); assert.deepEqual(whispers,['willow']); assert.deepEqual(invites,['willow']);
row('willow').focus(); update({friends:[offline,{...friend,online:false,zone:null}]}); assert.equal(document.activeElement,row('willow'),'presence updates preserve focused row'); assert(action('whisper').disabled&&action('invite').disabled);
update({friends:[offline]}); assert.equal(document.activeElement,list,'a vanished focused player returns keyboard focus to the list'); assert(action('remove').disabled);
input.focus(); input.value=' Rowan '; form.fire('submit'); assert.deepEqual(sent.at(-1),{type:'friendAdd',name:'Rowan'}); assert(submit.disabled); const count=sent.length;
form.fire('submit'); update(); update({request:'list'}); assert.equal(sent.length,count); assert(submit.disabled,'presence and list snapshots do not acknowledge mutations');
input.value='Willow'; update({request:'add',notice:'Friend request sent to Rowan.'}); assert.equal(input.value,'Willow','a delayed success preserves a newer name draft'); assert(!submit.disabled); assert.equal(find('#requests-tab').getAttribute('aria-selected'),'true'); assert.equal(find('#friends-status').textContent,'Friend request sent to Rowan.');
form.fire('submit'); update({request:'add',error:'No adventurer has that name.'}); assert.equal(input.value,'Willow'); assert(!submit.disabled); assert.equal(find('#friends-status').textContent,'No adventurer has that name.');
form.fire('submit'); update({request:'add'}); assert.equal(input.value,'','an unchanged submitted draft clears on success');
input.value='Keep this draft'; ui.addPlayer('willow'); assert.deepEqual(sent.at(-1),{type:'friendAdd',targetId:'willow'}); update({request:'add'}); assert.equal(input.value,'Keep this draft','right-click adds do not discard a typed name'); find('#friends-tab').fire('click');
row('willow').fire('click'); action('remove').fire('click'); assert.deepEqual(sent.at(-1),{type:'friendRemove',targetId:'willow'}); assert(row('willow'),'removal waits for server state'); update({friends:[offline],request:'remove'}); assert(!row('willow')); assert(action('remove').disabled);
find('#friends-tab').fire('keydown',{key:'ArrowRight'}); assert.equal(document.activeElement,find('#who-tab')); assert.equal(list.getAttribute('aria-labelledby'),'who-tab'); find('#who-tab').fire('keydown',{key:'ArrowRight'}); assert.equal(document.activeElement,find('#requests-tab')); assert.equal(list.getAttribute('aria-labelledby'),'requests-tab'); assert(find('.friends-actions').hidden); assert.equal(form.querySelector('label').textContent,'Send a friend request'); assert.equal(submit.textContent,'Send request');
find('#requests-tab').fire('keydown',{key:'ArrowRight'}); assert.equal(find('#ignored-tab').getAttribute('aria-selected'),'true'); assert.equal(document.activeElement,find('#ignored-tab')); assert.equal(list.getAttribute('aria-labelledby'),'ignored-tab'); assert(action('invite').hidden&&action('whisper').hidden); assert.equal(form.querySelector('label').textContent,'Ignore a player');
input.value='x'; const before=sent.length; form.fire('submit'); assert.equal(sent.length,before,'short names never submit');
input.value='Rowan'; form.fire('submit'); assert.deepEqual(sent.at(-1),{type:'ignoreAdd',name:'Rowan'}); update({request:'ignoreAdd',ignored:[{id:'rowan',name:'Rowan'}]}); assert.equal(input.value,'');
row('rowan').fire('click'); assert.equal(action('remove').textContent,'Unignore'); action('remove').fire('click'); assert.deepEqual(sent.at(-1),{type:'ignoreRemove',targetId:'rowan'}); update({request:'ignoreRemove'}); assert(!row('rowan'));
const oak={id:'oak',name:'Oak <img src=x>'},ash={id:'ash',name:'Ash'};
const request=(action,id)=>find('#friends-list').querySelectorAll('[data-request-id]').find(button=>button.dataset.requestId===id&&button.dataset.requestAction===action);
ui.close(); const focus=document.activeElement; update({friends:[],incoming:[oak],outgoing:[ash]});
const badge=trigger.querySelector('.friends-request-badge'); assert(!badge.hidden); assert.equal(badge.textContent,'1'); assert.match(trigger.getAttribute('aria-label'),/1 pending friend request/); assert(panel.hidden); assert.equal(document.activeElement,focus,'incoming requests update the badge without opening or stealing focus');
ui.open('friends'); assert(!row('oak')&&!row('ash'),'pending players never appear as accepted friends'); assert.equal(find('#friends-tab').querySelector('span').textContent,'0');
find('#requests-tab').fire('click'); assert.match(find('#friends-summary').textContent,/1 received · 1 sent/); assert(list.innerHTML.includes('Oak &lt;img src=x&gt;')&&!list.innerHTML.includes('<img src=x>')); assert(list.innerHTML.includes('Waiting for acceptance'));
assert.equal(request('accept','oak').getAttribute('aria-label'),`Accept ${oak.name}`); assert.equal(request('decline','oak').getAttribute('aria-label'),`Decline ${oak.name}`); assert.equal(request('cancel','ash').getAttribute('aria-label'),'Cancel request to Ash');
request('accept','oak').focus(); update({friends:[],incoming:[oak],outgoing:[ash,{id:'elm',name:'Elm'}]}); assert.equal(document.activeElement,request('accept','oak'),'request updates retain the same focused action');
request('accept','oak').fire('click'); assert.deepEqual(sent.at(-1),{type:'friendRespond',targetId:'oak',accept:true}); assert(list.querySelectorAll('[data-request-id]').every(button=>button.disabled)); assert.equal(document.activeElement,list,'pending actions move focus to the list instead of a disabled or removed button'); const acceptedCount=sent.length;
request('decline','oak').fire('click'); update({friends:[],incoming:[oak],outgoing:[ash]}); assert.equal(sent.length,acceptedCount); assert(request('accept','oak').disabled,'presence updates cannot acknowledge acceptance');
update({request:'accept',friends:[{...friend,...oak}],outgoing:[ash]}); assert(!request('accept','oak')); assert(badge.hidden); find('#friends-tab').fire('click'); assert(row('oak'),'accepted friendship appears only after the server confirms it');
find('#requests-tab').fire('click'); update({incoming:[{id:'elm',name:'Elm'}],outgoing:[ash]}); request('decline','elm').fire('click'); assert.deepEqual(sent.at(-1),{type:'friendRespond',targetId:'elm',accept:false}); update({request:'decline',outgoing:[ash]}); assert(!request('decline','elm')); assert(!row('elm'));
request('cancel','ash').fire('click'); assert.deepEqual(sent.at(-1),{type:'friendCancel',targetId:'ash'}); assert(request('cancel','ash'),'cancel waits for authoritative state'); update({request:'cancel'}); assert(!request('cancel','ash')); assert(list.innerHTML.includes('No pending requests'));
find('#requests-tab').fire('keydown',{key:'Home'}); assert.equal(document.activeElement,find('#friends-tab')); find('#friends-tab').fire('keydown',{key:'ArrowLeft'}); assert.equal(document.activeElement,find('#ignored-tab'),'tab arrows wrap all four tabs');
input.value='Slow'; form.fire('submit'); const timeout=[...timers.values()][0]; timeout(); assert(!submit.disabled); assert.match(find('#friends-status').textContent,/No reply/);
assert(input.fire('keydown',{key:'w'}).stopped&&input.fire('pointerdown').stopped,'typing and clicking stay within the UI');
assert(input.fire('keydown',{key:'Escape'}).defaultPrevented); assert(panel.hidden); assert.equal(document.activeElement,trigger); assert.equal(trigger.getAttribute('aria-expanded'),'false');
// Who reuses the friends list, selection and footer while retaining party controls.
const self={id:'self',name:'You',level:12,hp:100,maxHp:100,x:0,z:0,zone:'Greenwood',appearance:{className:'Ranger'},characterCreated:true};
const nearby={...self,id:'near',name:'Nearby <script>bad()</script>',x:3,z:4,appearance:{className:'Mage'}};
const distant={...self,id:'far',name:'Far Fern',x:440,z:-432,zone:'frostmarch'};
const instanced={...self,id:'dungeon',name:'Dungeon friend',instanceId:'rootvault-a'};
const invitation={id:'invite-1',inviterId:nearby.id,inviterName:nearby.name,expiresAt:Date.now()+60000};
const member=player=>({id:player.id,name:player.name,level:player.level,hp:player.hp,maxHp:player.maxHp,className:player.appearance.className,zone:player.zone,instanceId:player.instanceId});
const group={id:'group',leaderId:self.id,members:[member(self),member(nearby)]};
const who=(changes={})=>ui.updateWho({player:self,party:null,invites:[],players:[distant,instanced,self,nearby],...changes});
const partyAction=name=>find(`[data-party-${name}]`);
who(); ui.open('who');
assert.equal(find('#who-tab').getAttribute('aria-selected'),'true'); assert.equal(list.getAttribute('aria-labelledby'),'who-tab'); assert(form.hidden,'Who uses player selection instead of the friends name form');
assert.equal(document.activeElement,list,'Who opens on its visible player list');
assert(!row(self.id),'solo discovery excludes the current character'); assert(row(nearby.id)&&row(distant.id)&&row(instanced.id),'Who discovers all players in the realm');
assert(list.innerHTML.includes('&lt;script&gt;')&&!list.innerHTML.includes('<script>'),'Who uses escaped Friends rows');
assert.equal(row(nearby.id).getAttribute('class').includes('friend-row'),true,'Who uses the Friends row interface');
row(distant.id).fire('click'); assert(!action('whisper').disabled&&!action('invite').disabled,'another overworld region does not block invitations');
action('whisper').fire('click'); action('invite').fire('click'); assert.equal(whispers.at(-1),distant.id); assert.equal(invites.at(-1),distant.id);
row(nearby.id).focus(); who({players:[distant,instanced,self,{...nearby,hp:25}]}); assert.equal(document.activeElement,row(nearby.id),'Who snapshots preserve focused player rows');
row(nearby.id).fire('click'); action('add-player').fire('click'); assert.deepEqual(sent.at(-1),{type:'friendAdd',targetId:nearby.id}); update({request:'add'}); find('#who-tab').fire('click');
row(instanced.id).fire('click'); assert(action('invite').disabled,'instanced targets cannot be invited');
who({invites:[invitation]}); assert(partyAction('accept')&&!partyAction('accept').disabled); assert.equal(partyAction('accept').getAttribute('aria-label'),`Join ${nearby.name}’s party`); assert.equal(partyAction('decline').getAttribute('aria-label'),`Decline ${nearby.name}’s party invitation`); assert(!partyAction('decline').disabled); assert(list.innerHTML.includes('&lt;script&gt;'));
partyAction('accept').fire('click'); assert.deepEqual(partyResponses.at(-1),{type:'partyAccept',id:invitation.id});
who({invites:[invitation],pendingInvite:invitation.id}); assert(partyAction('accept').disabled&&partyAction('decline').disabled,'pending invitation responses cannot repeat');
who({invites:[invitation]}); partyAction('decline').fire('click'); assert.deepEqual(partyResponses.at(-1),{type:'partyDecline',id:invitation.id});
const maliciousInvite={...invitation,id:'x" data-injected="yes'}; who({invites:[maliciousInvite]}); assert.equal(partyAction('accept').getAttribute('data-party-accept'),maliciousInvite.id); assert(!find('[data-injected]'),'invitation IDs cannot inject attributes');
who({party:group,invites:[invitation]}); assert(row(self.id)&&row(nearby.id),'party members stay visible in Who'); assert(partyAction('accept').disabled&&!partyAction('decline').disabled,'members cannot join a second party');
row(nearby.id).fire('click'); assert(!action('remove').disabled&&!partyAction('promote').disabled); partyAction('promote').fire('click'); assert.deepEqual(sent.at(-1),{type:'partyPromote',targetId:nearby.id}); action('remove').fire('click'); assert.deepEqual(sent.at(-1),{type:'partyKick',targetId:nearby.id});
row(self.id).fire('click'); assert((action('remove').hidden||action('remove').disabled)&&partyAction('promote').disabled,'leader cannot kick or promote themselves');
partyAction('chat-focus').fire('click'); assert.equal(partyChats,1); assert(panel.hidden); ui.open('who'); find('[data-open-dungeon]').fire('click'); assert.equal(dungeons,1); assert(panel.hidden); ui.open('who'); partyAction('leave').fire('click'); assert.deepEqual(sent.at(-1),{type:'partyLeave'});
who({party:{...group,leaderId:nearby.id}}); row(distant.id).fire('click'); assert(action('invite').disabled,'only the party leader can invite'); row(nearby.id).fire('click'); assert(action('remove').hidden||action('remove').disabled); assert(partyAction('promote').hidden||partyAction('promote').disabled);
who({party:{...group,members:[...group.members,member({...self,id:'third'}),member({...self,id:'fourth'})]}}); row(distant.id).fire('click'); assert(action('invite').disabled,'full parties cannot invite');
for(const change of [{hp:0},{instanceId:'rootvault-a'}]){who({player:{...self,...change},invites:[invitation]}); row(distant.id).fire('click'); assert(action('invite').disabled&&partyAction('accept').disabled); assert(!partyAction('decline').disabled,'dead or instanced players can decline invitations');}
who({players:[self,{...nearby,hp:0}]}); row(nearby.id).fire('click'); assert(action('invite').disabled,'defeated targets cannot be invited');
who({lockReason:'Finish the lesson first.',invites:[invitation]}); row(nearby.id).fire('click'); assert(action('invite').disabled&&partyAction('accept').disabled,'Who preserves party onboarding restrictions');
who({players:[nearby]}); row(nearby.id).focus(); who({players:[]}); assert.equal(document.activeElement,list,'leaving players return keyboard focus to the shared list'); assert(action('invite').disabled); assert(!list.querySelector('[data-friend-id]'));
ui.open(); update({incoming:[oak],outgoing:[ash]}); ui.reset(); assert(panel.hidden); assert.equal(input.value,''); assert.equal(list.innerHTML,''); assert.equal(timers.size,0); assert(badge.hidden); assert(!trigger.getAttribute('aria-label').includes('pending'));
ui.open('who'); assert.equal(list.getAttribute('aria-busy'),'true'); assert(!list.querySelector('[data-friend-id]'),'reset clears the former character’s Who snapshot'); ui.reset();
// Incoming requests and Who snapshots must not move a held native touch to another player.
const birch={id:'birch',name:'Birch'},willow={id:'willow',name:'Willow'};
const endTouch=target=>{window.fire('touchend',{touches:[]});const paints=[...timers.keys()];target.fire('click');for(const id of paints){const paint=timers.get(id);timers.delete(id);paint?.();}};
ui.open('requests');update({friends:[],incoming:[willow]});
const heldAccept=request('accept','willow');heldAccept.fire('touchstart',{touches:[{target:heldAccept}]});
update({friends:[],incoming:[birch,willow]});
assert.equal(request('accept','willow'),heldAccept,'incoming requests do not replace or move the held Accept control');
assert(!request('accept','birch'),'newly sorted requests wait until touch ends');
endTouch(heldAccept);assert.deepEqual(sent.at(-1),{type:'friendRespond',targetId:'willow',accept:true},'touch acceptance keeps its original recipient');
update({request:'accept',friends:[{...friend,...willow}],incoming:[birch]});assert(!request('accept','willow'));assert(request('accept','birch'));
const removedAccept=request('accept','birch');removedAccept.fire('touchstart',{touches:[{target:removedAccept}]});update({friends:[],incoming:[]});const removedCount=sent.length;
endTouch(removedAccept);assert.equal(sent.length,removedCount,'removed requests cannot be accepted through a deferred stale control');assert(!request('accept','birch'));
who({players:[nearby],invites:[invitation]});ui.open('who');
const heldJoin=partyAction('accept'),heldRow=row(nearby.id);heldJoin.fire('touchstart',{touches:[{target:heldJoin}]});
who({players:[{...nearby,hp:25}],invites:[invitation,{...invitation,id:'invite-2',inviterName:'Birch'}]});
assert.equal(partyAction('accept'),heldJoin,'Who snapshots preserve a held invitation');assert.equal(row(nearby.id),heldRow,'Who snapshots preserve rows during the same gesture');
endTouch(heldJoin);assert.deepEqual(partyResponses.at(-1),{type:'partyAccept',id:invitation.id});
const cancelledJoin=partyAction('accept');cancelledJoin.fire('touchstart',{touches:[{target:cancelledJoin}]});who({players:[nearby],invites:[]});const responseCount=partyResponses.length;
endTouch(cancelledJoin);assert.equal(partyResponses.length,responseCount,'withdrawn party invitations cannot be joined through deferred controls');assert(!partyAction('accept'));
ui.reset();
allowed=false; const end=sent.length; ui.open(); ui.addPlayer('willow',true); assert(panel.hidden); assert.equal(sent.length,end,'disconnected or character-selection state cannot open or mutate');
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert(!html.includes('id="party-button"')&&!main.includes("$('party-button')"),'the standalone Party menu is removed');
assert.match(main,/function openParty\(\)[^\n]*friendsUI\.open\('who'\)/,'Party shortcut and HUD route into Friends Who');
const css=readFileSync(new URL('../src/friends.css',import.meta.url),'utf8');
assert.match(css,/#friends-window \{[^}]*overflow-y: auto/,'short viewports can scroll to every control');
assert.match(css,/#friends-window\[hidden\] \{ display: none/); assert(css.includes('var(--ornate-panel-art)'));assert(source.includes('src="/ui/friends-emblem.png"'),'Friends uses the supplied menu artwork.');
console.log('PASS Friends and Who UI: realm discovery, shared player rows, party actions/authority/invitations, no standalone Party menu, accepted-only lists, received/sent requests, accept/decline/cancel, stable touch recipients, stale-request rejection, pending badge, safe names, live focus, authoritative mutations, preserved drafts, keyboard tabs, ignore/unignore, timeout, reset and input isolation.');
