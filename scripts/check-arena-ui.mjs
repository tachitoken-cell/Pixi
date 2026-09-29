import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {mountArenaUI}=await import('../src/duel-ui.ts');hook.deregister();

class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.events={};this.hidden=false;this.classList={toggle(){}};}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=value;if(name==='hidden')this.hidden=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  set innerHTML(html){this.html=html;this.children=[];const stack=[this];for(const [,end,tag,attrs]of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)){if(end){if(stack.length>1)stack.pop();continue;}const node=new Element(tag);for(const [,name,value]of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(name,value||'');stack.at(-1).append(node);if(!['img','br','input','hr'].includes(tag))stack.push(node);}}
  get innerHTML(){return this.html||'';}
  matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);const attr=selector.match(/^\[([\w-]+)="([^"]*)"\]$/);return attr?this.attributes[attr[1]]===attr[2]:this.tagName===selector.toUpperCase();}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
  querySelectorAll(selector){return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(type,handler){(this.events[type]||=[]).push(handler);}
  fire(type,extra={}){const event={target:this,stopped:false,defaultPrevented:false,stopPropagation(){this.stopped=true;},preventDefault(){this.defaultPrevented=true;},...extra};let node=this;while(node){for(const fn of node.events[type]||[])fn(event);if(event.stopped)break;node=node.parentElement;}return event;}
}
const previous=new Element('button');globalThis.document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:previous};
let walletReady=true,walletChecks=0;
const sent=[],opponents=[],openedWagers=[],ui=mountArenaUI(message=>sent.push(message),id=>opponents.push(id),()=>'hero',id=>openedWagers.push(id),()=>{walletChecks++;return walletReady;});
const panel=document.body.querySelector('#arena-card'),find=selector=>panel.querySelector(selector),action=name=>find(`[data-arena-action="${name}"]`);
const now=Date.now(),unsafeName='<img src=x onerror="bad()">',members=[{id:'hero',name:'Hero',team:0,accepted:false},{id:'opponent',name:unsafeName,team:1,accepted:true}],invite={id:'invite-1',inviterId:'opponent',inviterName:unsafeName,expiresAt:now+30000,size:1,members};
const rosterText=()=>find('#arena-roster').querySelectorAll('span').map(node=>node.textContent).join(' '),states=()=>find('#arena-roster').querySelectorAll('small').map(node=>node.textContent);
assert(panel.hidden);assert(!ui.busy());assert.equal(panel.attributes.role,'dialog');assert.equal(panel.attributes['aria-modal'],'false');
ui.update(null,[invite],now);assert(!panel.hidden);assert(ui.busy());assert.equal(find('#arena-message').textContent,`${invite.inviterName} challenges you.`);assert.equal(find('#arena-title-text').textContent,'1v1 arena');
assert(!panel.innerHTML.includes(unsafeName),'player names only enter textContent');assert.equal(panel.querySelectorAll('img').length,0);assert(rosterText().includes(unsafeName));assert(rosterText().includes('Hero (you)'));assert.deepEqual(states(),['Waiting','Accepted']);assert.equal(document.activeElement,previous,'incoming invitations do not steal focus');
assert(!action('accept').hidden&&!action('decline').hidden&&action('forfeit').hidden&&action('close').hidden);
assert(action('accept').fire('pointerdown').stopped);assert(action('accept').fire('keydown',{key:'1'}).stopped);
action('accept').fire('click');assert.deepEqual(sent.at(-1),{type:'arenaAccept',invitationId:invite.id});assert(!panel.hidden);assert(action('accept').hidden);assert.match(find('#arena-message').textContent,/Waiting for acceptance/);assert.equal(action('decline').textContent,'Cancel challenge');assert.equal(walletChecks,0,'free matches do not require a wallet');
action('accept').fire('click');assert.equal(sent.length,1,'a response cannot repeat before the next snapshot');
ui.update(null,[invite],now);assert(!action('accept').hidden,'an authoritative unaccepted snapshot permits retry after validation failure');
const escape=action('decline').fire('keydown',{key:'Escape'});assert(escape.stopped&&escape.defaultPrevented);assert.deepEqual(sent.at(-1),{type:'arenaDecline',invitationId:invite.id});assert(panel.hidden);
ui.update(null,[invite],now);action('decline').fire('click');assert.deepEqual(sent.at(-1),{type:'arenaDecline',invitationId:invite.id});
ui.update(null,[{...invite,expiresAt:now-1}],now);assert(panel.hidden,'expired invitations disappear');assert(!ui.busy());
const teamInvite={...invite,id:'invite-2',size:2,members:[...members,{id:'ally',name:'Ally',team:0,accepted:false},{id:'second',name:'Second',team:1,accepted:false}]};
ui.update(null,[teamInvite],now);assert.equal(find('#arena-title-text').textContent,'2v2 arena');assert.equal(find('#arena-roster').querySelectorAll('li').length,4,'the consent panel shows all four participants');assert.deepEqual(states(),['Waiting','Waiting','Accepted','Waiting']);
const tripleInvite={...teamInvite,size:3,queued:true,members:[...teamInvite.members,{id:'third-ally',name:'Third ally',team:0,accepted:false},{id:'third-rival',name:'Third rival',team:1,accepted:false}]};
ui.update(null,[tripleInvite],now);assert.equal(find('#arena-title-text').textContent,'3v3 rated arena');assert.equal(find('#arena-roster').querySelectorAll('li').length,6);assert(find('#arena-note').hidden,'free invitations do not show helper text');
const accepted={...teamInvite,members:teamInvite.members.map(member=>({...member,accepted:member.id==='hero'||member.accepted}))};ui.update(null,[accepted],now);assert(action('accept').hidden&&!action('decline').hidden);assert.match(find('#arena-message').textContent,/Waiting for acceptance/);const beforeAccepted=sent.length;action('accept').fire('click');assert.equal(sent.length,beforeAccepted,'accepted members cannot consent twice');
const countdown={id:'arena-1',opponentId:'opponent',opponentName:unsafeName,size:2,phase:'countdown',startsAt:now+5000,endsAt:now+305000,members:teamInvite.members.map(({accepted,...member})=>({...member,hp:100,maxHp:100,eliminated:false}))};
ui.update(countdown,[],now);assert(!panel.hidden);assert(ui.busy());assert.equal(panel.dataset.phase,'countdown');assert.match(find('#arena-message').textContent,/Starts in 5/);assert.equal(opponents.length,0,'countdown never selects an attack target');
assert(action('accept').hidden&&action('decline').hidden&&!action('forfeit').hidden&&action('close').hidden);assert(states().every(state=>state==='100 / 100 HP'));
ui.update(countdown,[],now+3000);assert.match(find('#arena-message').textContent,/Starts in 2/,'countdown uses authoritative server time');
const active={...countdown,phase:'active'};ui.update(active,[],now+5000);assert.equal(find('#arena-message').textContent,'Fight! · 5:00 remaining');assert.deepEqual(opponents,['opponent']);
assert(find('#arena-note').hidden,'free active matches show only the live fight state');
ui.update({...active},[],now+5000);assert.equal(opponents.length,1,'matching active snapshots never retarget the opponent');
action('forfeit').fire('click');assert.deepEqual(sent.at(-1),{type:'arenaForfeit'});assert(!action('forfeit').fire('keydown',{key:'Escape'}).defaultPrevented,'Escape cannot accidentally forfeit a match');
const knockout={...active,members:active.members.map(member=>member.id==='hero'?{...member,hp:1,eliminated:true}:member)};ui.update(knockout,[],now+6000);assert.equal(find('#arena-message').textContent,'Knocked out · watch your team');assert(states().includes('Knocked out'));assert(ui.busy(),'elimination does not allow a new challenge while the teammate fights');
const finished={...knockout,phase:'finished',winnerTeam:0,reason:'Opposing team knocked out.'};ui.update(finished,[],now+7000);assert.equal(find('#arena-message').textContent,'Victory');assert.equal(find('#arena-note').textContent,finished.reason);assert(!ui.busy());assert(action('forfeit').hidden&&!action('close').hidden);const beforeResult=sent.length;action('forfeit').fire('click');assert.equal(sent.length,beforeResult,'result controls cannot forfeit the next match');
ui.update({...finished,reason:undefined},[],now+7000);assert(find('#arena-note').hidden,'finished matches do not add a default explanation');
ui.update({...finished,winnerTeam:1},[],now+7000);assert.equal(find('#arena-message').textContent,'Defeat');ui.update({...finished,winnerTeam:undefined},[],now+7000);assert.equal(find('#arena-message').textContent,'Draw');
for(const delta of [16,-12,0]){ui.update({...finished,rated:true,ratingChange:delta},[],now+7000);assert.match(find('#arena-note').textContent,new RegExp(`MMR ${delta>=0?'\\+':''}${delta}\\.`));}
action('close').fire('click');assert(panel.hidden);ui.update(finished,[],now+8000);assert(panel.hidden,'a dismissed result stays dismissed across snapshots');
ui.update(finished,[invite],now+8000);assert(!panel.hidden);assert.equal(panel.dataset.phase,'invitation','new consent can replace a previous result');
ui.update(null,[],now);assert(panel.hidden);const count=sent.length;action('forfeit').fire('click');assert.equal(sent.length,count,'stale controls cannot send after a match ends');
ui.update({...active,id:'arena-2',opponentId:'second'},[],now);assert.deepEqual(opponents,['opponent','second']);
ui.reset();assert(panel.hidden);assert(!ui.busy());assert.equal(find('#arena-message').textContent,'');assert.equal(find('#arena-note').textContent,'');
action('accept').fire('click');action('forfeit').fire('click');assert.equal(sent.length,count,'reset clears all action state');
ui.update(active,[],now);assert.equal(opponents.at(-1),'opponent','reset allows a fresh session to retarget');
ui.reset();const queueInvite={...invite,id:'queue-ready',queued:true,members:members.map(member=>({...member,accepted:false}))};
ui.update(null,[{...queueInvite,acceptReason:'Leave combat before accepting.'}],now);
assert(action('accept').disabled&&!action('accept').hidden);assert.match(find('#arena-message').textContent,/Leave combat before accepting/);assert(!find('#arena-note').textContent.includes('entrance'),'queued invitations do not require staying at the entrance');
const beforeCombat=sent.length;action('accept').fire('click');assert.equal(sent.length,beforeCombat,'combat prevents accepting without discarding the invitation');assert(ui.busy());
action('decline').fire('click');assert.deepEqual(sent.at(-1),{type:'arenaDecline',invitationId:'queue-ready'},'combat never blocks declining');
ui.update(null,[queueInvite],now);assert.deepEqual(states(),['Waiting','Waiting'],'queue pairing never implies consent from either player');assert(!action('accept').hidden);
assert(!action('accept').disabled,'leaving combat enables acceptance on the next authoritative snapshot');assert.match(find('#arena-message').textContent,/Opponent found/);assert(find('#arena-note').hidden);
const queueTargets=opponents.length;action('accept').fire('click');assert.deepEqual(sent.at(-1),{type:'arenaAccept',invitationId:'queue-ready'});
ui.update(null,[{...queueInvite,members:queueInvite.members.map(member=>({...member,accepted:member.id==='hero'}))}],now);
assert.deepEqual(states(),['Accepted','Waiting']);assert(action('accept').hidden&&!action('decline').hidden);assert.equal(opponents.length,queueTargets,'one acceptance waits without selecting or fighting the opponent');
ui.reset();const wagerInvite={...invite,id:'moss-invite',wagerMoss:'100',wagerMatchId:'0xmatch'};ui.update(null,[wagerInvite],now);
assert(!find('#arena-wager').hidden);assert.match(find('#arena-wager').textContent,/100.0 MOSS each · Pot 200.0 · Winner 190.0 · Tax 10.0/);assert.equal(action('accept').textContent,'Accept 100.0 MOSS stake');
assert.match(find('#arena-note').textContent,/including countdown/);assert.match(find('#arena-note').textContent,/Draw: full refund/);
walletReady=false;const beforeWallet=sent.length;action('accept').fire('click');assert.equal(sent.length,beforeWallet);assert.equal(walletChecks,1);assert(!action('accept').hidden,'connecting does not mark consent pending');
walletReady=true;action('accept').fire('click');assert.equal(walletChecks,2);assert.deepEqual(sent.at(-1),{type:'arenaAccept',invitationId:'moss-invite'});assert(action('accept').hidden,'integrated wallet ready permits consent on the next click');
ui.update(null,[{...wagerInvite,funding:true}],now);assert(action('accept').hidden);assert(!action('wagers').hidden);assert.match(find('#arena-message').textContent,/Awaiting MOSS deposits/);action('wagers').fire('click');assert.equal(openedWagers.at(-1),'0xmatch');
const wagerMatch={...active,wagerMoss:'100',wagerMatchId:'0xmatch'};ui.update(wagerMatch,[],now);assert.equal(action('forfeit').textContent,'Forfeit 100.0 MOSS');
const beforeSaving=sent.length;ui.update({...wagerMatch,settling:true},[],now);assert.equal(find('#arena-message').textContent,'Saving wager result…');assert(action('forfeit').disabled);action('forfeit').fire('click');assert.equal(sent.length,beforeSaving);
ui.update({...wagerMatch,phase:'finished',winnerTeam:0},[],now);assert(!action('wagers').hidden);assert.match(find('#arena-note').textContent,/Claim before the displayed payout deadline/);assert.equal(action('wagers').textContent,'Collect payout');
ui.update({...wagerMatch,phase:'finished',winnerTeam:null},[],now);assert.match(find('#arena-note').textContent,/Full stake refund/);assert.equal(action('wagers').textContent,'Collect refund');
ui.update({...wagerMatch,phase:'finished',winnerTeam:1},[],now);assert(find('#arena-note').hidden,'defeat does not invite the loser to claim a winner payout');assert.equal(action('wagers').textContent,'MOSS wager');
ui.reset();ui.update(null,[invite],now);assert(find('#arena-wager').hidden);assert(action('wagers').hidden);assert.equal(action('accept').textContent,'Accept');
console.log('PASS arena UI: MOSS consent, verified funding handoff, settlement guard and result payout/refund controls; safe names, 1v1/2v2/3v3 full-team consent/retry/cancel/expiry, keyboard/pointer isolation, countdown and active clock, opponent transition, knockout health, victory/defeat/draw and rating delta, result dismissal and reset.');
