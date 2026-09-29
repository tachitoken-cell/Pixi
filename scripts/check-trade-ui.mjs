import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { mountTradeUI } = await import('../src/trade-ui.ts');
const { starterGear } = await import('../src/progression.ts');
hook.deregister();

// The native event/DOM boundary is small: exercise the shipped controller and HTML,
// without replacing its offer, revision, input validation, or lifecycle logic.
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39);/g, value => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[value]);
const voidTags = new Set(['input','img','br','hr']);
class Element {
  constructor(tag = 'div') { this.tagName=tag.toUpperCase(); this.children=[]; this.parentElement=null; this.events=new Map(); this.attributes={}; this.dataset={}; this.hidden=false; this.disabled=false; this.checked=false; this.value=''; }
  setAttribute(name,value) { this.attributes[name]=String(value); if(name==='id')this.id=value; if(name==='name')this.name=value; if(name==='value')this.value=decode(value); if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=decode(value); if(['disabled','hidden','checked'].includes(name))this[name]=true; }
  append(node) { node.parentElement=this; this.children.push(node); }
  remove() { if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this); this.parentElement=null; }
  get isConnected() { return this===document.body || !!this.parentElement?.isConnected; }
  contains(node) { return node===this || this.children.some(child=>child.contains(node)); }
  focus() { document.activeElement=this; }
  set textContent(value) { this.text=String(value); this.children=[]; }
  get textContent() { return this.text ?? this.children.map(child=>child.textContent).join(''); }
  set innerHTML(html) {
    this.html=html; this.text=undefined; this.children=[]; const stack=[this];
    for(const match of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)) {
      const [,closing,tag,attrs]=match;
      if(closing) { if(stack.length>1)stack.pop(); continue; }
      const node=new Element(tag);
      for(const attr of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(attr[1],decode(attr[2]??''));
      stack.at(-1).append(node); if(!voidTags.has(tag))stack.push(node);
    }
  }
  get innerHTML() { return this.html||''; }
  matches(selector) { if(selector.startsWith('#'))return this.id===selector.slice(1); const attr=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/); if(attr)return Object.hasOwn(this.attributes,attr[1])&&(attr[2]===undefined||this.attributes[attr[1]]===attr[2]); return this.tagName===selector.toUpperCase(); }
  querySelectorAll(selector) { return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
  closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector)||null; }
  addEventListener(type,callback) { if(!this.events.has(type))this.events.set(type,new Set()); this.events.get(type).add(callback); }
  removeEventListener(type,callback) { this.events.get(type)?.delete(callback); }
  fire(type,extra={}) { const event={type,target:this,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra}; let node=this; while(node){for(const callback of node.events.get(type)||[])callback(event);if(event.stopped)break;node=node.parentElement;}return event; }
}
globalThis.document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:null};
const previous=new Element('button'); document.body.append(previous); previous.focus();
let hero={id:'me',name:'Moss',hp:100,gold:40,level:10,appearance:{className:'Ranger'},inventory:{wood:12,crystal:6,potion:3,herb:8,relic:2},...starterGear('Ranger')};
hero.ownedGear.push('warden-longbow','rootforged-charm','ranger-head','knight-sword');
hero.equipment.head='ranger-head';
const zero=()=>({gold:0,items:{},gear:[]});
const state=(status='open',revision=1)=>({id:'trade-one',status,inviterId:'them',expiresAt:Date.now()+120000,revision,participants:[{id:'me',name:'Moss',offer:zero(),accepted:false},{id:'them',name:'<img src=x onerror="bad()">',offer:zero(),accepted:false}]});
const sent=[];let opens=0;
const ui=mountTradeUI({send:message=>sent.push(structuredClone(message)),getPlayer:()=>hero,onOpen:()=>opens++});
const panel=document.body.querySelector('#trade-window');
const find=selector=>panel.querySelector(selector);
const action=name=>find(`[data-trade-action="${name}"]`);
const field=name=>find(`[name="${name}"]`);
const edit=(name,value)=>{field(name).value=String(value);field(name).fire('input');};
const publish=()=>find('#trade-offer-form').fire('submit');
assert.equal(panel.hidden,true);assert.equal(panel.attributes.role,'dialog');assert.equal(panel.attributes['aria-modal'],'false');
ui.update(state('invited'));
assert(!panel.hidden);assert.equal(opens,1);assert(find('#trade-invitation-text').textContent.includes('<img src=x'));
assert.equal(panel.querySelectorAll('img').length,0,'player names are text, never parsed HTML');
action('respond').fire('click');assert.deepEqual(sent.at(-1),{type:'tradeRespond',tradeId:'trade-one',accept:true});assert(action('respond').disabled);
ui.update(state('invited'),'Invitation unavailable.');assert(!action('respond').disabled);assert.equal(find('#trade-status').textContent,'Invitation unavailable.');
let authoritative=state();ui.update(authoritative);
assert.equal(opens,2);assert(action('accept').disabled,'both empty offers cannot be accepted');assert(action('publish').disabled);const beforeEmpty=sent.length;action('accept').fire('click');assert.equal(sent.length,beforeEmpty);assert(find('#trade-status').textContent.includes('Add gold'));
const selectable=panel.querySelectorAll('[data-trade-gear]').map(input=>input.dataset.tradeGear);
assert(selectable.includes('rootforged-charm'),'crafted zero-price gear remains tradable');
assert(selectable.includes('warden-longbow'));assert(!selectable.includes('ranger-head'),'equipped gear is excluded');
assert(!selectable.includes('ranger-bow')&&!selectable.includes('knight-sword'),'all classes’ starter gear is excluded');
assert(!find('#trade-gear').innerHTML.includes('undefined'));
assert.equal(find('[data-trade-gear="warden-longbow"]').parentElement.dataset.itemTooltip,'warden-longbow','hover and checkbox focus identify the offered item');assert.equal(field('wood').parentElement.dataset.itemTooltip,'wood');assert.equal(field('wood').dataset.itemTooltip,'wood','focused quantity inputs receive their own accessible tooltip relationship');assert.equal(find('[data-trade-gear="warden-longbow"]').dataset.itemTooltip,'warden-longbow');
field('gold').focus();edit('gold',12);edit('wood',4);
const goldNode=field('gold'),gearNode=find('[data-trade-gear="rootforged-charm"]');gearNode.checked=true;gearNode.fire('change');
assert(action('accept').disabled);assert(!action('publish').disabled);
ui.update(structuredClone(authoritative));assert.equal(field('gold'),goldNode);assert.equal(document.activeElement,goldNode);assert.equal(field('gold').value,'12','same revision preserves unsaved input');
publish();const offer=sent.at(-1);assert.equal(offer.type,'tradeOffer');assert.deepEqual(offer.offer,{gold:12,items:{wood:4},gear:['rootforged-charm']});assert(action('accept').disabled&&action('publish').disabled&&field('gold').disabled);
ui.update(structuredClone(authoritative));assert(action('accept').disabled,'old snapshots cannot acknowledge a pending offer');
authoritative=structuredClone(authoritative);authoritative.revision=2;authoritative.participants[0].offer=offer.offer;ui.update(authoritative);
assert(!action('accept').disabled);assert(!field('gold').disabled);assert(find('#trade-status').textContent.includes('Review both'));
action('accept').fire('click');assert.deepEqual(sent.at(-1),{type:'tradeAccept',tradeId:'trade-one',revision:2});assert(action('accept').disabled);assert(field('gold').disabled,'pending acceptance freezes the visible terms');
authoritative=structuredClone(authoritative);authoritative.participants[0].accepted=true;ui.update(authoritative);assert(find('#trade-own-approved').textContent.includes('You accepted'));assert(field('gold').disabled&&gearNode.disabled,'accepted terms cannot be edited while the exchange may complete');
assert(!action('revise').hidden&&!action('revise').disabled);action('revise').fire('click');assert.deepEqual(sent.at(-1),{type:'tradeOffer',tradeId:'trade-one',offer:offer.offer});assert(field('gold').disabled,'changing a confirmed offer waits for server approval withdrawal');
authoritative=structuredClone(authoritative);authoritative.revision=3;authoritative.participants[0].accepted=false;authoritative.participants[1].offer={gold:4,items:{potion:2,relic:1},gear:[]};ui.update(authoritative);
assert(!action('accept').disabled,'new revision needs a new explicit acceptance');assert(find('#trade-other-offer').innerHTML.includes('Healing potions'));assert(find('#trade-other-offer').innerHTML.includes('Rootvault relics'));
assert.equal(find('#trade-other-offer').querySelector('[data-item-tooltip="relic"]').attributes.tabindex,'0','counterparty items support keyboard inspection');
edit('gold',8);authoritative=structuredClone(authoritative);authoritative.revision=4;authoritative.participants[1].offer.gold=6;ui.update(authoritative);
assert.equal(field('gold').value,'8','counterparty changes preserve the local draft');assert(action('accept').disabled);
edit('gold',41);assert(action('publish').disabled);let count=sent.length;publish();assert.equal(sent.length,count,'insufficient live gold never sends an offer');
edit('gold',1.5);assert(action('publish').disabled);publish();assert.equal(sent.length,count);
edit('gold',0);edit('wood',13);assert(action('publish').disabled);edit('wood',1);
hero={...hero,inventory:{...hero.inventory,wood:0}};ui.refresh();assert.equal(field('wood').max,'0');assert(action('publish').disabled);publish();assert.equal(sent.length,count,'publishing rechecks current inventory, not the previous snapshot');
hero={...hero,inventory:{...hero.inventory,wood:12}};edit('wood',1);publish();assert.equal(sent.length,count+1);ui.update(authoritative,'Your partner cannot equip that item.');
assert(!field('gold').disabled);assert(action('accept').disabled);assert.equal(field('gold').value,'0','rejection keeps the editable draft');
ui.close();assert.deepEqual(sent.at(-1),{type:'tradeCancel',tradeId:'trade-one'});assert(panel.hidden);assert.equal(document.activeElement,previous,'closing restores prior focus');
count=sent.length;ui.update(authoritative);assert(panel.hidden,'a late canceled-session update cannot reopen the window');ui.close();assert.equal(sent.length,count,'repeated close sends no duplicate cancellation');
ui.update(null,'Trade canceled.');authoritative=state();authoritative.id='second';ui.update(authoritative);
count=sent.length;hero={...hero,gold:0};authoritative=structuredClone(authoritative);authoritative.participants[0].offer.gold=10;ui.update(authoritative);action('accept').fire('click');assert.equal(sent.length,count,'acceptance checks live funds');
assert(find('#trade-status').textContent.includes('gold'));
const outside=[];document.body.addEventListener('keydown',()=>outside.push('key'));document.body.addEventListener('pointerdown',()=>outside.push('pointer'));
field('gold').fire('keydown',{key:'1'});field('gold').fire('pointerdown');assert.deepEqual(outside,[],'UI edits do not cast spells or move the world');
field('gold').fire('keydown',{key:'Escape'});assert(panel.hidden);assert.equal(sent.at(-1).type,'tradeCancel');
ui.update(null);const outgoing=state('invited');outgoing.id='outgoing';outgoing.inviterId='me';ui.update(outgoing);assert(action('respond').hidden);assert(find('#trade-invitation-text').textContent.includes('Waiting for'));
ui.close();ui.update(null);const incoming=state('invited');incoming.id='decline';ui.update(incoming);action('decline').fire('click');assert.deepEqual(sent.at(-1),{type:'tradeRespond',tradeId:'decline',accept:false});assert(panel.hidden);
ui.update(null);const gift=state();gift.id='gift';gift.participants[1].offer.items.potion=1;ui.update(gift);assert(!action('accept').disabled,'a one-sided gift is a valid nonempty exchange');action('accept').fire('click');assert.deepEqual(sent.at(-1),{type:'tradeAccept',tradeId:'gift',revision:1});ui.close();
ui.update(null);const final=state();final.id='final';ui.update(final);count=sent.length;ui.update(null,'Trade completed.');assert(panel.hidden);assert.equal(sent.length,count,'server completion does not cancel an already completed trade');assert.equal(document.body.querySelector('#trade-notice').textContent,'Trade completed.');assert(!document.body.querySelector('#trade-notice').hidden,'only the real server result appears after closing');
ui.dispose();assert(!panel.isConnected);assert(!document.body.querySelector('#trade-notice'));for(const listeners of panel.events.values())assert.equal(listeners.size,0,'dispose removes every delegated handler');ui.update(state());assert(!panel.isConnected);
const css=readFileSync(new URL('../src/trade.css',import.meta.url),'utf8');
assert(css.includes('var(--wood-art)')&&css.includes('border-image:'),'the generated painted frame is reused');
assert(css.includes('minmax(0, 1fr)')&&css.includes('overflow-wrap: anywhere')&&css.includes('@media (max-width: 560px)')&&css.includes('min-height: 44px'),'narrow layout retains wrapping and touch-sized controls');
assert(/#trade-window\[hidden\], #trade-window \[hidden\]\s*\{\s*display: none !important/.test(css),'hidden actions override later primary-button display rules');
assert(css.includes('.trade-review { position: sticky; bottom:')&&panel.innerHTML.includes('class="trade-review"'),'acceptance and review message stay in one sticky footer');
assert(!/::backdrop|backdrop-filter/.test(css),'nonmodal trading never dims or blurs the game');
console.log('PASS: native trade UI invitations, escaped names, gear eligibility, draft preservation, offer acknowledgment/revisions, live balances, input isolation, cancellation and disposal.');
