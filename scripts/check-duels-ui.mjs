import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {mountDuelUI}=await import('../src/duel-ui.ts');hook.deregister();

class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.events={};this.hidden=false;this.classList={toggle(){}};}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=value;if(name==='hidden')this.hidden=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
  append(node){node.parentElement=this;this.children.push(node);}
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
const sent=[],opponents=[],ui=mountDuelUI(message=>sent.push(message),id=>opponents.push(id));
const panel=document.body.querySelector('#duel-card'),find=selector=>panel.querySelector(selector),action=name=>find(`[data-duel-action="${name}"]`);
const now=Date.now(),invite={id:'invite-1',inviterId:'opponent',inviterName:'<img src=x onerror="bad()">',expiresAt:now+30000};
assert(panel.hidden);assert.equal(panel.attributes.role,'dialog');assert.equal(panel.attributes['aria-modal'],'false');
ui.update(null,[invite],now);assert(!panel.hidden);assert.equal(find('#duel-message').textContent,`${invite.inviterName} challenges you to a duel.`);
assert(!panel.innerHTML.includes(invite.inviterName),'player names only enter textContent');assert.equal(panel.querySelectorAll('img').length,0);assert.equal(document.activeElement,previous,'incoming invitations do not steal focus');
assert(!action('accept').hidden&&!action('decline').hidden&&action('forfeit').hidden);
assert(action('accept').fire('pointerdown').stopped);assert(action('accept').fire('keydown',{key:'1'}).stopped);
action('accept').fire('click');assert.deepEqual(sent.at(-1),{type:'duelAccept',invitationId:invite.id});assert(panel.hidden);
action('accept').fire('click');assert.equal(sent.length,1,'a response cannot repeat before the next snapshot');
ui.update(null,[invite],now);assert(!panel.hidden,'the next snapshot permits retry after validation failure');
const escape=action('decline').fire('keydown',{key:'Escape'});assert(escape.stopped&&escape.defaultPrevented);assert.deepEqual(sent.at(-1),{type:'duelDecline',invitationId:invite.id});
ui.update(null,[invite],now);action('decline').fire('click');assert.deepEqual(sent.at(-1),{type:'duelDecline',invitationId:invite.id});
ui.update(null,[{...invite,expiresAt:now-1}],now);assert(panel.hidden,'expired invitations disappear');
const active={id:'duel-1',opponentId:'opponent',opponentName:invite.inviterName};ui.update(active,[invite],now);
assert(!panel.hidden);assert.equal(find('#duel-message').textContent,`Dueling ${invite.inviterName}`);assert.equal(find('#duel-note').textContent,'Ends at 1 HP');
assert(action('accept').hidden&&action('decline').hidden&&!action('forfeit').hidden);assert.deepEqual(opponents,['opponent']);
ui.update({...active},[],now);assert.equal(opponents.length,1,'matching snapshots never retarget the opponent');
action('forfeit').fire('click');assert.deepEqual(sent.at(-1),{type:'duelForfeit'});
assert(!action('forfeit').fire('keydown',{key:'Escape'}).defaultPrevented,'Escape cannot accidentally forfeit a duel');
ui.update(null,[],now);assert(panel.hidden);const count=sent.length;action('forfeit').fire('click');assert.equal(sent.length,count,'stale controls cannot send after a duel ends');
ui.update({...active,id:'duel-2',opponentId:'second'},[],now);assert.deepEqual(opponents,['opponent','second']);
ui.reset();assert(panel.hidden);assert.equal(find('#duel-message').textContent,'');assert.equal(find('#duel-note').textContent,'');
action('accept').fire('click');action('forfeit').fire('click');assert.equal(sent.length,count,'reset clears all action state');
ui.update(active,[],now);assert.equal(opponents.at(-1),'opponent','reset allows a fresh session to retarget');
console.log('PASS duel UI: safe names, invitation consent/retry/expiry, keyboard/pointer isolation, nonmodal focus, forfeit, opponent transition and reset.');
