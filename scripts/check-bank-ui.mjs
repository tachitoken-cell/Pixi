import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {mountBankUI,renderBankContents,bankInventoryItems}=await import('../src/bank-ui.ts');
const {BANKERS}=await import('../src/city-services.ts');
const {BANKER}=await import('../src/city.ts');
const {newBank,bankItems,bankDeposit,bankWithdraw}=await import('../src/bank.ts');
const {starterGear,GEAR}=await import('../src/progression.ts');hook.deregister();
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|#39);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[c]);
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.events={};this.hidden=false;this.disabled=false;}
 setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=value;if(name==='value')this.value=value;if(name==='disabled')this.disabled=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
 getAttribute(name){return this.attributes[name]??null;}
 get childNodes(){return this.children;}
 append(node){node.remove();node.parentElement=this;this.children.push(node);}replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.html='';for(const node of nodes)this.append(node);}replaceWith(node){const parent=this.parentElement,index=parent.children.indexOf(this);node.remove();parent.children[index]=node;node.parentElement=parent;this.parentElement=null;}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
 contains(node){return this===node||this.children.some(n=>n.contains(node));}focus(){document.activeElement=this;}setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
 set innerHTML(html){this.html=html;this.children=[];const stack=[this];for(const [,end,tag,attrs]of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)){if(end){if(stack.length>1)stack.pop();continue;}const node=new Element(tag);for(const [,name,value]of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(name,decode(value||''));stack.at(-1).append(node);if(!['img','br','input','hr'].includes(tag))stack.push(node);}}
 get innerHTML(){return this.html||this.children.map(node=>node.outerHTML).join('');}get outerHTML(){return `<${this.tagName.toLowerCase()} ${Object.entries(this.attributes).map(([key,value])=>`${key}="${value}"`).join(' ')}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;}
 get scrollTop(){return document.body.contains(this)?this.scrollY||0:0;}set scrollTop(value){if(document.body.contains(this))this.scrollY=value;}
 matches(selector){if(selector.startsWith('.'))return (this.attributes.class||'').split(' ').includes(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);const attr=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);return attr?Object.hasOwn(this.attributes,attr[1])&&(attr[2]===undefined||this.attributes[attr[1]]===attr[2]):this.tagName===selector.toUpperCase();}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 addEventListener(type,handler){(this.events[type]||=[]).push(handler);}fire(type,extra={}){const event={target:this,stopped:false,defaultPrevented:false,stopPropagation(){this.stopped=true;},preventDefault(){this.defaultPrevented=true;},...extra};let node=this;while(node){for(const fn of node.events[type]||[])fn(event);if(event.stopped)break;node=node.parentElement;}return event;}
}
globalThis.HTMLElement=Element;globalThis.HTMLInputElement=Element;globalThis.document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:null};
const fresh=()=>({id:'hero',name:'Tester',level:60,hp:100,maxHp:100,gold:250,appearance:{className:'Ranger'},...starterGear('Ranger'),inventory:{wood:12,crystal:0,herb:0,potion:1,relic:0},carriedItems:{'trail-bread':3},ownedBags:[],equippedBags:[null,null,null,null],auctions:[]});
let player=fresh(),bank=newBank(),nearby=true,bagsOpened=0;const sent=[];
const state=(extra={})=>({npcId:BANKER.id,bank,items:bankItems(bank),capacity:48,...extra});
const ui=mountBankUI({send:message=>sent.push(structuredClone(message)),getPlayer:()=>player,nearby:()=>nearby,onBags:()=>bagsOpened++});
const panel=document.body.querySelector('#bank-window'),find=s=>s.startsWith('[data-bank-item=')?panel.querySelectorAll(s).find(node=>node.dataset.bankSide===panel.querySelectorAll('[data-bank-tab]').find(button=>button.attributes['aria-pressed']==='true')?.dataset.bankTab):panel.querySelector(s),click=s=>{const node=find(s);assert(node,s);node.fire('click');};
assert(panel.hidden);ui.update(state());assert(panel.hidden,'ordinary state updates cannot open an unrequested bank');ui.update(state({open:true}));assert(ui.isOpen());assert.equal(panel.attributes['aria-modal'],'false');
assert.match(panel.innerHTML,/Your bank is empty/);click('[data-bank-bags]');assert.equal(bagsOpened,1);assert(ui.isOpen(),'bags open alongside the bank');
click('[data-bank-tab="inventory"]');assert.equal(panel.querySelectorAll('[data-bank-item]').length,3,'all carried stacks are available and equipped gear is excluded');
assert.equal(find('[data-bank-item="resource:wood"]').dataset.itemTooltip,'wood');assert.equal(find('[data-bank-item="item:trail-bread"]').dataset.itemTooltip,'item:trail-bread');assert(!find('[data-bank-item="resource:wood"]').attributes.title,'custom item inspection replaces duplicate native titles');
click('[data-bank-item="resource:wood"]');const input=find('#bank-quantity');input.value='4';input.fire('input');ui.refresh();
assert.match(panel.innerHTML,/id="bank-quantity"[^>]*value="4"/,'input events preserve the visible amount across a live refresh before blur/change');
click('[data-bank-transfer]');
assert.deepEqual(sent[0],{type:'bankDeposit',npcId:BANKER.id,item:{kind:'resource',id:'wood',quantity:4}});assert.equal(player.inventory.wood,12);assert.equal(bankItems(bank).length,0,'sending a request does not optimistically move items');click('[data-bank-transfer]');assert.equal(sent.length,1,'a pending transfer cannot be sent twice');
ui.reject('Saving failed. Try again.');assert.match(panel.innerHTML,/Saving failed/);assert(!find('[data-bank-transfer]').disabled,'an explicit rejection unlocks retry');click('[data-bank-transfer]');assert.equal(sent.length,2);
const deposited=bankDeposit({...player,bank},sent.at(-1).item);bank=deposited.bank;player={...deposited};delete player.bank;ui.update(state({reason:'Deposited 4 Wood.'}));assert.equal(player.inventory.wood,8);assert.match(panel.innerHTML,/Deposited 4 Wood/);
click('[data-bank-tab="storage"]');click('[data-bank-item="resource:wood"]');click('[data-bank-all]');assert.equal(find('#bank-quantity').value,'4');click('[data-bank-transfer]');assert.deepEqual(sent.at(-1),{type:'bankWithdraw',npcId:BANKER.id,item:{kind:'resource',id:'wood',quantity:4}});
const withdrawn=bankWithdraw({...player,bank},sent.at(-1).item);bank=withdrawn.bank;player={...withdrawn};delete player.bank;ui.update(state({reason:'Withdrew 4 Wood.'}));assert(!find('[data-bank-item="resource:wood"]'),'only confirmed responses remove stored rows');
const same=find('[data-bank-bags]');ui.refresh();assert.equal(find('[data-bank-bags]'),same,'unchanged frames do not replace bank DOM');
click('[data-bank-tab="inventory"]');click('[data-bank-item="resource:wood"]');find('#bank-quantity').value='5';click('[data-bank-transfer]');
assert.equal(sent.at(-1).item.quantity,5,'the transfer reads the actual visible field even when the browser has not dispatched change');ui.reject('Preview check finished.');
assert(!find('[data-bank-bags]').fire('keydown',{key:'w'}).stopped,'movement keys remain available while a bank button has focus');assert(find('[data-bank-bags]').fire('keydown',{key:'Tab'}).stopped,'Tab navigates bank controls instead of cycling enemies');
click('[data-bank-close]');assert(!ui.isOpen());ui.update(state({reason:'Late response'}));assert(!ui.isOpen(),'a delayed transfer response cannot reopen a closed bank');
ui.update(state({open:true}));nearby=false;ui.refresh();assert(!ui.isOpen(),'walking away closes personal storage');nearby=true;ui.update(state({open:true}));player.hp=0;ui.refresh();assert(!ui.isOpen(),'death closes the bank');player=fresh();
ui.update(state({open:true}));const escape=find('[data-bank-close]').fire('keydown',{key:'Escape'});assert(escape.defaultPrevented&&escape.stopped&&!ui.isOpen());
const bag={id:'22222222-2222-2222-2222-222222222222',kind:'runewoven-holdall'};bank={...newBank(),bags:[bag]};const html=renderBankContents(player,state(),{tab:'storage',selected:`bag:${bag.id}`,page:0,quantity:1});assert.match(html,/runewoven-holdall\.png/);assert.match(html,/Runewoven Holdall/);assert.match(html,/data-item-tooltip="bag-kind:runewoven-holdall"/,'stored bag inspection resolves the catalog kind even when its UUID is absent from the backpack');assert.equal((html.match(/class="bank-slot /g)||[]).length,64,'both48bank slots and16bag slots are mounted simultaneously');
const many={...fresh(),ownedGear:[...player.ownedGear,...Object.keys(GEAR).filter(id=>!player.ownedGear.includes(id)).slice(0,65)]};const second=renderBankContents(many,state(),{tab:'inventory',selected:'',page:1,quantity:1});assert.equal((second.match(/data-bank-side="inventory" data-bank-item=/g)||[]).length,bankInventoryItems(many).length,'the scrollable bag grid exposes every available item without a second page');
bank={...newBank(),gear:['warden-longbow']};ui.update(state({open:true}));click('[data-bank-item="gear:warden-longbow"]');
const rollDetails=find('[data-item-roll="warden-longbow"]'),summary=rollDetails.querySelector('summary'),oldBody=rollDetails.querySelector('.item-roll-body');
assert(rollDetails,'bank gear selection exposes the same advanced disclosure');rollDetails.open=true;rollDetails.querySelector('.item-roll-body').scrollTop=120;summary.focus();player.equipment.weapon='warden-longbow';ui.refresh();
assert.equal(find('[data-item-roll="warden-longbow"]'),rollDetails,'passive bank updates retain the disclosure node');
assert(rollDetails.open && document.activeElement===summary,'passive bank updates preserve native open state and keyboard focus');
assert.notEqual(rollDetails.querySelector('.item-roll-body'),oldBody,'changed comparisons replace the previous body');
assert.equal(oldBody.parentElement,null,'replaced comparison content is detached');
assert.equal(rollDetails.querySelector('.item-roll-body').parentElement,rollDetails,'replacement content moves into the retained disclosure');
assert.equal(rollDetails.querySelector('.item-roll-body').scrollTop,120,'changed comparison content retains its reading position after reattachment');
for(const banker of BANKERS){
 bank=newBank();player=fresh();ui.close();ui.update(state({npcId:banker.id,open:true}));assert(ui.isOpen());assert(panel.innerHTML.includes(banker.name));
 click('[data-bank-tab="inventory"]');click('[data-bank-item="resource:wood"]');click('[data-bank-transfer]');assert.equal(sent.at(-1).npcId,banker.id,'all city bank requests use the displayed local NPC');
}
ui.update(state({npcId:'forged-banker',open:true}));assert(!ui.isOpen(),'unknown bank identities close the window');

player=fresh();bank={...newBank(),resources:{wood:7}};nearby=true;ui.update(state({open:true}));click('[data-bank-item="resource:wood"]');
const lockRequestAt=sent.length;find('[data-item-lock]').focus();click('[data-item-lock]');
assert.deepEqual(sent[lockRequestAt],{type:'setItemLock',itemId:'wood',locked:true});assert(!player.lockedItems,'protection never changes before the server confirms');
player.lockedItems=['wood'];ui.refresh();assert.match(panel.innerHTML,/data-item-locked="true"/);assert.match(panel.innerHTML,/data-lock-value="false"/);
assert.equal(document.activeElement.dataset.itemLock,'wood','keyboard focus survives the confirmed lock update');
assert(!find('[data-bank-transfer]').disabled,'locked storage remains withdrawable');click('[data-item-lock]');assert.deepEqual(sent.at(-1),{type:'setItemLock',itemId:'wood',locked:false});

const search=find('#bank-search');search.value='Wood';search.selectionStart=4;search.focus();search.fire('input');assert.equal(find('#bank-search').value,'Wood');assert.equal(document.activeElement.id,'bank-search','search keeps focus through an authoritative refresh');assert(panel.querySelectorAll('.is-dim').length>0,'nonmatching slots dim without disappearing or changing ownership');
ui.reject('Ready');const inventoryWood=panel.querySelectorAll('[data-bank-item]').find(node=>node.dataset.bankSide==='inventory'&&node.dataset.bankItem==='resource:wood');const transferAt=sent.length;inventoryWood.fire('click');const retainedWood=panel.querySelectorAll('[data-bank-item]').find(node=>node.dataset.bankSide==='inventory'&&node.dataset.bankItem==='resource:wood');assert.equal(retainedWood,inventoryWood,'selecting a slot preserves its native double-click target');retainedWood.fire('dblclick');assert.equal(sent[transferAt].type,'bankDeposit');assert.equal(sent[transferAt].item.quantity,player.inventory.wood,'double-click requests the exact current stack');retainedWood.fire('dblclick');assert.equal(sent.length,transferAt+1,'double-click cannot repeat a pending transfer');
ui.dispose();assert(!document.body.contains(panel));console.log('PASS bank UI: nonmodal48-slot storage, simultaneous bags, exact partial/all transfers, no optimistic item movement, pending/retry guards, private-response lifecycle, searchable dual grids, real bag icons and usable keyboard controls.');
