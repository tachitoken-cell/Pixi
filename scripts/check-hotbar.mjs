import { gameKey, bindingLabel } from '../src/keybindings.ts';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { createHotbarState, placeHotbar, renderHotbar, renderSpellbook, createHotbar } = await import('../src/hotbar.ts');
const { SPELLS, spellsForClass, defaultHotbar: defaultBank, hotbarValid: bankValid, abilityValid, abilityUnlocked, availableHotbar: availableBank } = await import('../src/spells.ts');
const { starterGear, MAX_LEVEL } = await import('../src/progression.ts');
const { specialistJobLevel,activeSpecialist,SPECIALISTS_ENABLED } = await import('../src/raid-progression.ts');
const { newOnboarding, onboardingFeatureUnlocked } = await import('../src/onboarding.ts');
hook.deregister();
const defaultHotbar=(...args)=>[...defaultBank(...args),...Array(10).fill(null)];
const hotbarValid=(slots,...args)=>slots.length===20&&bankValid(slots.slice(0,10),...args)&&bankValid(slots.slice(10),...args);
const availableHotbar=(slots,...args)=>{const size=slots.length===16?8:10;return [...availableBank(slots.slice(0,size),...args),...(slots.length<=size?Array(10).fill(null):availableBank(slots.slice(size,size*2),...args))];};
const snapshot=(player,slots)=>({...player,hotbar:slots.slice(0,8),hotbarExtra:slots.slice(8,10),hotbar2:slots.slice(10,18),hotbar2Extra:slots.slice(18,20)});
const hero = (className = 'Ranger', id = className, level = 20) => ({ id, appearance:{className}, hotbar:defaultBank(className, level), hotbar2:Array(10).fill(null), abilityCooldowns:{}, hp:80, maxHp:100, inventory:{potion:3}, talents:[], level, ...starterGear(className) });
for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  const player = hero(className), slots = defaultHotbar(className, 20), html = renderSpellbook(player, slots);
  assert.equal(slots.length, 20); assert.deepEqual(slots.slice(2, 4), ['mend', 'interact']);
  assert.equal((html.match(/data-hotbar-slot=/g) || []).length, 10);
  assert.equal((html.match(/data-book-ability=/g) || []).length, spellsForClass(className, true).length + 2);
  for (const spell of Object.values(SPELLS)) assert.equal(html.includes(`data-book-ability="${spell.id}"`), spell.className === className);
  assert(html.includes('draggable="true"') && html.includes('data-hotbar-clear') && html.includes('data-hotbar-reset'));
  assert(!/undefined|NaN/.test(html));
  const cleared = placeHotbar(slots, 1, null), assigned = placeHotbar(cleared, 7, slots[1]);
  assert.equal(assigned[7], slots[1]); assert.equal(assigned[1], null);
  const swapped = placeHotbar(slots, 6, slots[0]); assert.equal(swapped[6], slots[0]); assert.equal(swapped[0], slots[6]);
  assert.deepEqual(slots, defaultHotbar(className, 20), 'edits never mutate a server snapshot');
  assert(hotbarValid(swapped, className));
}
// Real level boundaries preserve the layout while gating every class spell.
for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  const all = defaultHotbar(className, 20);
  assert.deepEqual(defaultHotbar(className), availableHotbar(all, className, 1), 'new characters start with only their first spell and utilities');
  for (const spell of spellsForClass(className)) {
    for (const level of [Math.max(1, spell.requiredLevel - 1), spell.requiredLevel]) {
      const player = hero(className, `${className}-${level}`, level), html = renderSpellbook(player, all);
      const tag = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`data-book-ability="${spell.id}"`));
      const unlocked = level >= spell.requiredLevel;
      assert.equal(/\sdisabled(?:\s|>)/.test(tag), !unlocked, `${spell.label} unlocks exactly at level ${spell.requiredLevel}`);
      assert(tag.includes(`draggable="${unlocked}"`));
      if (!unlocked) assert(html.includes(`Requires level ${spell.requiredLevel}`));
      const state = createHotbarState(() => true); state.sync(snapshot(player,all));
      all.forEach((id, index) => assert.equal(state.slots[index], id === 'mend' || id === 'interact' || id === null || abilityUnlocked(id, className, level) ? id : null, 'migration blanks only locked slots'));
      if (!unlocked) assert.equal(state.set(placeHotbar(state.slots, 7, spell.id)), false, 'locked assignments never reach the save callback');
    }
  }
}
const player = hero(), sent = []; let stale = 0;
const state = createHotbarState(slots => { sent.push(slots); return true; }, () => stale++);
state.sync(player, 0);
const first = placeHotbar(state.slots, 7, 'arrow'); state.set(first, 10);
const second = placeHotbar(state.slots, 6, 'mend'); state.set(second, 20);
state.sync(player, 30); assert.deepEqual(state.slots, second, 'old snapshots do not erase optimistic edits');
state.sync(snapshot(player,first), 40); assert.deepEqual(state.slots, second, 'an earlier acknowledgement preserves the newest edit');
state.sync(snapshot(player,second), 50); assert.equal(state.saving, false); assert.deepEqual(state.slots, second);
state.set(placeHotbar(second, 0, 'interact'), 60); state.reject(); assert.deepEqual(state.slots, second, 'rejection restores the last authoritative layout');
state.set(first, 80); state.sync(snapshot(player,second), 4081); assert.equal(stale, 1); assert.deepEqual(state.slots, second, 'unacknowledged edits have a bounded lifetime');
state.set(first, 5000); state.sync(hero('Mage','other'), 5001); assert.deepEqual(state.slots, defaultHotbar('Mage', 20)); assert(!state.saving, 'changing characters discards another character’s optimistic queue');
assert.equal(state.set(defaultHotbar('Ranger', 20)), false, 'foreign-class abilities cannot enter the layout');
assert.equal(state.set([null]), false, 'partial layouts are rejected before sending');
const reloaded = createHotbarState(() => true); reloaded.sync(snapshot(player,second)); assert.deepEqual(reloaded.slots, second, 'a reload uses the saved character layout');
const disconnected = createHotbarState(() => false); disconnected.sync(player); assert(!disconnected.set(first)); assert.deepEqual(disconnected.slots, defaultHotbar('Ranger',20));
const original = SPELLS.arrow.label; SPELLS.arrow.label = '<img src=x onerror="bad()">';
try { assert(!renderSpellbook(player,player.hotbar).includes('<img src=x')); assert(renderHotbar(player.hotbar,player).includes('&lt;img')); } finally { SPELLS.arrow.label = original; }

// Native DOM event boundary only: run the actual delegated handlers and renderers.
class Button {
  constructor(tag, parent) {
    this.parent=parent; this.markup=tag; this.dataset={}; this.attributes={}; this.disabled=/\sdisabled(?:\s|>)/.test(tag); this.parts=new Map(); this.styles=new Map();
    for(const [,key,value] of tag.matchAll(/data-([\w-]+)="([^"]*)"/g)) this.dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
    for(const [,key] of tag.matchAll(/data-(hotbar-reset|hotbar-clear|hotbar-cancel)(?=[\s>])/g))this.dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]='';
    const classes=new Set((tag.match(/class="([^"]*)"/)?.[1]||'').split(' ')); this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c),contains:c=>classes.has(c)};
    this.style={setProperty:(key,value)=>this.styles.set(key,value)};
  }
  closest(selector){if(selector==='button'||selector==='button, summary')return this;if(selector==='[data-hotbar-slot]')return this.dataset.hotbarSlot===undefined?null:this;if(selector==='#hotbar')return this.parent.id==='hotbar'?this.parent:null;return null;}
  get isConnected(){return this.parent.buttons.includes(this);}
  contains(target){return target===this;}
  matches(){return this.disabled;}
  getBoundingClientRect(){return {left:100,top:100,right:180,bottom:144};}
  querySelector(selector){if(!this.parts.has(selector))this.parts.set(selector,{textContent:this.markup.match(new RegExp(`<${selector}[^>]*>(.*?)</${selector}>`))?.[1]||''});return this.parts.get(selector);}
  setAttribute(key,value){this.attributes[key]=value;if(key==='data-hotbar-page')this.dataset.hotbarPage=value;}
  getAttribute(key){return this.attributes[key]??this.markup.match(new RegExp(`${key}="([^"]*)"`))?.[1]??null;}
  get previousElementSibling(){return this.parent.buttons[this.parent.buttons.indexOf(this)-1]||null;}
  remove(){this.parent.buttons.splice(this.parent.buttons.indexOf(this),1);this.parent.html=this.parent.html.replace(this.markup,'');}
  insertAdjacentHTML(position,html){assert.equal(position,'beforebegin');this.parent.buttons.splice(this.parent.buttons.indexOf(this),0,...[...html.matchAll(/<button\b[^>]*>.*?<\/button>/gs)].map(m=>new Button(m[0],this.parent)));this.parent.html=this.parent.html.replace(this.markup,html+this.markup);}
  focus(){this.parent.focused=this;}
}
class Container {
  constructor(id){this.id=id;this.events=new Map();this.buttons=[];this.status={textContent:''};}
  set innerHTML(html){this.html=html;const editor=html.match(/<div class="hotbar-editor-slots"[^>]*>(.*?)<\/div>/s);if(editor){this.editor=new Container('editor');this.editor.innerHTML=editor[1];html=html.replace(editor[0],'');}this.buttons=[...html.matchAll(/<button\b[^>]*>.*?<\/button>/gs)].map(m=>new Button(m[0],this));}
  querySelectorAll(selector){const all=[...this.buttons,...(this.editor?.buttons||[])];if(selector==='[data-hotbar-slot]')return all.filter(b=>b.dataset.hotbarSlot!==undefined);if(selector==='[data-hotbar-bank]')return all.filter(b=>b.dataset.hotbarBank!==undefined);if(selector==='[data-book-ability]')return all.filter(b=>b.dataset.bookAbility!==undefined);return [];}
  querySelector(selector){if(selector===':focus')return this.focused||null;if(selector==='.hotbar-editor-slots')return this.editor||null;if(selector==='.hotbar-status')return this.status;if(selector==='[data-hotbar-page]')return [...this.buttons,...(this.editor?.buttons||[])].find(b=>b.dataset.hotbarPage!==undefined)||null;const names={'[data-hotbar-clear]':'hotbarClear','[data-hotbar-cancel]':'hotbarCancel','[data-hotbar-reset]':'hotbarReset'};if(names[selector])return this.buttons.find(b=>names[selector] in b.dataset)||null;const bank=selector.match(/data-hotbar-bank="(\d+)"/);if(bank)return this.querySelectorAll('[data-hotbar-bank]').find(b=>b.dataset.hotbarBank===bank[1])||null;const index=selector.match(/data-hotbar-slot="(\d+)"/);return index?this.querySelectorAll('[data-hotbar-slot]').find(b=>b.dataset.hotbarSlot===index[1]):null;}
  addEventListener(name,listener){this.events.set(name,listener);}
  fire(name,target,extra={}){let prevented=false;const event={target,key:'',dataTransfer:{effectAllowed:'',dropEffect:'',setData(){}},preventDefault(){prevented=true;},stopPropagation(){},...extra};this.events.get(name)?.(event);return prevented;}
}
const nativeNow=performance.now;let clock=10000;performance.now=()=>clock;
const hud=new Container('hotbar'),book=new Container('book'),casts=[],saves=[];let editable=true;
book.innerHTML=renderSpellbook(player,player.hotbar);
const controller=createHotbar({hud,book,canEdit:()=>editable,cast:id=>casts.push(id),save:slots=>{saves.push(slots);return true;},notify(){}});controller.sync(player);controller.refresh();
const slot=(container,index)=>container.querySelectorAll('[data-hotbar-slot]').find(button=>Number(button.dataset.hotbarSlot)===index);
const choice=id=>book.querySelectorAll('[data-book-ability]').find(button=>button.dataset.bookAbility===id);
hud.fire('click',slot(hud,0)); assert.deepEqual(casts,['arrow']);
book.fire('click',choice('power-shot')); book.fire('click',slot(book,7));
assert.equal(controller.slots[7],'power-shot');assert.equal(controller.slots[4],null);assert.equal(casts.length,1,'tap assignment inside the dialog never casts');
book.fire('click',choice('mend')); assert(book.fire('keydown',choice('mend'),{key:'5'})); assert.equal(controller.slots[4],'mend','keyboard assignment shares the click path');
book.fire('click',slot(book,7)); book.fire('click',book.querySelector('[data-hotbar-clear]')); assert.equal(controller.slots[7],null);
book.fire('click',book.querySelector('[data-hotbar-reset]'));assert.deepEqual(controller.slots,defaultHotbar('Ranger', 20));
book.fire('dragstart',choice('poison-shot'));
assert.equal(book.fire('dragenter',choice('arrow')),false,'ordinary spell cards are not drop targets');
assert(book.fire('dragenter',slot(book,7)),'entering a valid slot accepts the native drag');
assert(slot(book,7).classList.contains('is-drop-target'),'dragenter gives immediate target feedback');
assert(book.fire('dragover',slot(book,7)));book.fire('drop',slot(book,7));
assert.equal(controller.slots[7],'poison-shot');assert.equal(controller.slots[6],null);assert.equal(casts.length,1);
book.fire('dragend',choice('poison-shot'));hud.fire('click',slot(hud,0));assert.equal(casts.length,1,'the click following a drag never fires an attack');
hud.fire('dragstart',slot(hud,0));hud.fire('drop',slot(hud,1));assert.equal(controller.slots[1],'arrow');assert.equal(controller.slots[0],'volley','dragging the live bar swaps occupied slots');
hud.fire('dragend',slot(hud,1));hud.fire('keydown',slot(hud,1),{key:'Delete'});assert.equal(controller.slots[1],null);
hud.fire('dragstart',slot(hud,0));controller.cancel();clock+=301;controller.activateSlot(0);assert.equal(casts.at(-1),'volley','cancelled drags cannot permanently lock keyboard casting');
const draggedButton=slot(hud,0),castsBeforeSnapshot=casts.length;
hud.fire('dragstart',draggedButton);
controller.sync({...snapshot(player,controller.slots),inventory:{...player.inventory,potion:2}});
assert(!hud.buttons.includes(draggedButton),'the potion snapshot replaces the original dragged button');
assert.equal(hud.fire('dragover',slot(hud,2)),false,'rebuilding the slot DOM cancels the stale native drag');
controller.activateSlot(0);assert.equal(casts.length,castsBeforeSnapshot,'snapshot cancellation still blocks an accidental immediate cast');
clock+=301;controller.activateSlot(0);hud.fire('click',slot(hud,0));
assert.equal(casts.length,castsBeforeSnapshot+2,'keyboard and clicks recover after a snapshot detaches the source without dragend');
const before=controller.slots;editable=false;book.fire('click',choice('arrow'));book.fire('click',slot(book,1));assert.deepEqual(controller.slots,before,'disconnected/menu guards prevent changes');editable=true;
controller.sync(hero('Mage','mage'));assert.deepEqual(controller.slots,defaultHotbar('Mage', 20),'DOM controller switches to the selected character’s slots');
controller.sync({...hero('Mage','mage'),abilityCooldowns:{meteor:11000}});controller.updateCooldowns(1000);
assert.equal(slot(hud,6).querySelector('.hotbar-cooldown').textContent,'10');assert.equal(slot(hud,6).styles.get('--cooldown'),'100%');
controller.updateCooldowns(11000);assert.equal(slot(hud,6).querySelector('.hotbar-cooldown').textContent,'');
// Exercise locked click, keyboard and native drag boundaries with a legacy full bar.
const low = hero('Ranger', 'unlock-boundary', 3), gateHud = new Container('hotbar'), gateBook = new Container('book'), gateCasts = [], gateSaves = [];
gateBook.innerHTML = renderSpellbook(low, defaultHotbar('Ranger', 20));
const gate = createHotbar({hud:gateHud,book:gateBook,canEdit:()=>true,cast:id=>gateCasts.push(id),save:slots=>{gateSaves.push(slots);return true;},notify(){}});
gate.sync(snapshot(low,defaultHotbar('Ranger',20)));
const gateChoice = id => gateBook.querySelectorAll('[data-book-ability]').find(button=>button.dataset.bookAbility===id);
const locked = gateChoice('power-shot'); assert(locked.disabled); const lowSlots=gate.slots;
gateBook.fire('click',locked);gateBook.fire('keydown',locked,{key:'8'});gateBook.fire('click',slot(gateBook,7));gate.activateSlot(4);gate.activateSlot(7);
assert(gateBook.fire('dragstart',locked),'a locked card rejects native dragstart');assert.equal(gateBook.fire('dragover',slot(gateBook,7)),false);gateBook.fire('drop',slot(gateBook,7));
assert.deepEqual(gate.slots,lowSlots);assert.equal(gateCasts.length,0);assert.equal(gateSaves.length,0);
locked.disabled=false;gateBook.fire('click',locked);gateBook.fire('keydown',locked,{key:'8'});
assert(gateBook.fire('dragstart',locked),'level checks also reject a stale or altered DOM card');assert.deepEqual(gate.slots,lowSlots);
gateBook.fire('click',gateBook.querySelector('[data-hotbar-reset]'));assert.deepEqual(gate.slots,defaultHotbar('Ranger',3),'reset assigns only available abilities');
const unlockedPlayer={...low,level:4};gate.sync(unlockedPlayer);gateBook.innerHTML=renderSpellbook(unlockedPlayer,gate.slots);gate.refresh();
assert(!gateChoice('power-shot').disabled);gateBook.fire('dragstart',gateChoice('power-shot'));assert(gateBook.fire('dragover',slot(gateBook,7)));gateBook.fire('drop',slot(gateBook,7));clock+=301;gate.activateSlot(7);
assert.deepEqual(gateCasts,['power-shot'],'newly unlocked spells can be assigned and cast immediately');
gateBook.fire('dragstart',gateChoice('power-shot'));gate.sync(snapshot(low,gate.slots));
assert.equal(gateBook.fire('dragover',slot(gateBook,7)),false,'level changes invalidate a pending drag');gateBook.fire('drop',slot(gateBook,7));clock+=301;gate.activateSlot(7);assert.equal(gateCasts.length,1);assert(!gate.slots.includes('power-shot'));
// At level 60, every class ability still supports the full native swap/cast flow.
for(const className of ['Ranger','Mage','Knight','Cleric']) {
  const p=hero(className,className,60),h=new Container('hotbar'),b=new Container('book'),used=[];b.innerHTML=renderSpellbook(p,p.hotbar);
  const bar=createHotbar({hud:h,book:b,canEdit:()=>true,cast:id=>used.push(id),save:()=>true,notify(){}});bar.sync(p);
  for(const spell of spellsForClass(className)) {
    const card=b.querySelectorAll('[data-book-ability]').find(button=>button.dataset.bookAbility===spell.id);
    assert(!card.disabled);b.fire('dragstart',card);assert(b.fire('dragover',slot(b,7)));b.fire('drop',slot(b,7));clock+=301;bar.activateSlot(7);
    assert.equal(bar.slots[7],spell.id);assert.equal(used.at(-1),spell.id);
  }
}
// Two banks share physical keys, remain character-specific, and use live cooldown/potion state.
const pageStorage=new Map();globalThis.localStorage={getItem:key=>pageStorage.get(key),setItem:(key,value)=>pageStorage.set(key,value)};
const bankPlayer=hero('Mage','bank-owner',20),bankHud=new Container('hotbar'),bankBook=new Container('book'),bankCasts=[],bankSaves=[];
const bankSlots=['fireball',null,'mend','interact',null,null,null,null,null,null,'meteor','frostbolt','mend','interact',null,null,null,null,null,null];
Object.assign(bankPlayer,snapshot(bankPlayer,bankSlots));bankPlayer.abilityCooldowns={meteor:11000};bankBook.innerHTML=renderSpellbook(bankPlayer,bankSlots);
const bankOptions={hud:bankHud,book:bankBook,canEdit:()=>true,cast:id=>bankCasts.push(id),save:slots=>{bankSaves.push(slots);return true;},notify(){}};
const bank=createHotbar(bankOptions);bank.sync(bankPlayer);
// Direct desktop bank choices are idempotent, preserve focus, and share the persisted keyboard bank.
assert.equal(bankHud.querySelectorAll('[data-hotbar-bank]').length,2);
const chooseBank=index=>{const button=bankHud.querySelector(`[data-hotbar-bank="${index}"]`);button.focus();bankHud.fire('click',button);};
chooseBank(1);assert.equal(bank.page,1);assert.equal(bankHud.focused.dataset.hotbarBank,'1');
assert.equal(bankHud.querySelector('[data-hotbar-bank="1"]').getAttribute('aria-pressed'),'true');
assert.equal(pageStorage.get('mossvale-hotbar-page:bank-owner'),'1');
chooseBank(1);assert.equal(bank.page,1,'selecting the current bank cannot toggle away');
bank.sync({...bankPlayer,inventory:{potion:4}});assert.equal(bankHud.querySelectorAll('[data-hotbar-bank]').length,2,'snapshots never duplicate bank buttons');
chooseBank(0);assert.equal(bank.page,0);assert.equal(bankSaves.length,0,'choosing a bank does not rewrite ability assignments');
const bankToggle=()=>bankHud.querySelector('[data-hotbar-page]');bankToggle().focus();bankHud.fire('click',bankToggle());
assert.equal(bank.page,1);assert.equal(bankHud.focused.dataset.hotbarPage,'1','bank button keeps keyboard focus');
assert.equal(bankHud.querySelectorAll('[data-hotbar-slot]').length,10);assert(!slot(bankHud,0));assert(slot(bankHud,10));
assert(bankHud.html.includes('<kbd>1</kbd>')&&bankHud.html.includes('<kbd>9</kbd>')&&bankHud.html.includes('<kbd>0</kbd>'),'second bank retains all ten configured keys');
bank.activateSlot(0);bankHud.fire('click',slot(bankHud,12));assert.deepEqual(bankCasts,['meteor','mend']);
bank.updateCooldowns(1000);assert.equal(slot(bankHud,10).querySelector('.hotbar-cooldown').textContent,'10');
bank.sync({...bankPlayer,inventory:{potion:2}});assert.equal(bank.page,1);assert(bankHud.html.includes('hotbar-count">2</small>'));
const meteorCard=bankBook.querySelectorAll('[data-book-ability]').find(button=>button.dataset.bookAbility==='meteor');
bankBook.fire('click',meteorCard);bankBook.fire('keydown',meteorCard,{key:'0'});assert.equal(bank.slots[19],'meteor');assert.equal(bank.slots[10],null);assert.equal(bankSaves.at(-1).length,20);
bankBook.fire('keydown',meteorCard,{key:'`',code:'Backquote'});assert.equal(bank.page,0);bankBook.fire('keydown',meteorCard,{key:'`',code:'Backquote',repeat:true});assert.equal(bank.page,0,'held bank key never oscillates');
bank.switchPage();bank.sync(snapshot(bankPlayer,bank.slots));const savedBanks=bank.slots;
const restored=createHotbar(bankOptions);restored.sync(snapshot(bankPlayer,savedBanks));assert.equal(restored.page,1);assert.deepEqual(restored.slots,savedBanks);
restored.sync(hero('Ranger','other-bank-owner'));assert.equal(restored.page,0);assert.deepEqual(restored.slots,defaultHotbar('Ranger',20));
restored.sync(snapshot(bankPlayer,savedBanks));assert.equal(restored.page,1,'each character remembers its selected bank');
// Run the actual touch delegation against the real hotbar repaint/click handlers.
// A snapshot while the thumb is down must not drop the tap, and the browser's
// compatibility click after a page switch must not switch immediately back.
const touchSource=stripTypeScriptTypes(readFileSync(new URL('../src/mobile-controls.ts',import.meta.url),'utf8')).replace(/^export /gm,'');
const touchRoot={events:new Map(),addEventListener(type,handler){this.events.set(type,handler);}};
const bindTouchActions=runInNewContext(`${touchSource}\nbindTouchActions`,{Element:Button,performance,window:{addEventListener(){}},document:{addEventListener(){}},MouseEvent:class{constructor(type,options){Object.assign(this,{type,detail:0},options);}}});
bindTouchActions(touchRoot);
const fireTouch=(type,target,extra={})=>{
  const event={target,type,pointerId:2,pointerType:'touch',button:0,clientX:140,clientY:122,detail:1,preventDefault(){},stopImmediatePropagation(){this.stopped=true;},...extra};
  touchRoot.events.get(type)?.(event);
  if(type==='click'&&!event.stopped)touchHud.fire('click',target,event);
};
const touchHud=new Container('hotbar'),touchBook=new Container('book'),touchPlayer=hero('Mage','touch-bank-owner',20);
const touchBar=createHotbar({hud:touchHud,book:touchBook,canEdit:()=>true,cast(){},save:()=>true,notify(){}});touchBar.sync(touchPlayer);
const tapPage=({snapshotDuringTap=false}={})=>{
  const pressed=touchHud.querySelector('[data-hotbar-page]'),label=pressed.querySelector('span');
  pressed.dispatchEvent=event=>fireTouch(event.type,pressed,event);
  fireTouch('pointerdown',pressed);
  if(snapshotDuringTap)touchBar.sync({...touchPlayer,inventory:{potion:2}});
  fireTouch('pointerup',pressed);
  assert.equal(touchHud.querySelector('[data-hotbar-page]').querySelector('span'),label,'a tap on the label keeps its original target through repaint');
};
const touchFailures=[];
tapPage({snapshotDuringTap:true});if(touchBar.page!==1)touchFailures.push('snapshot during a page tap dropped the activation');
if(touchBar.page!==0)touchBar.switchPage();
tapPage();if(touchBar.page!==1)touchFailures.push('a completed page tap did not select bar 2');
fireTouch('click',touchHud.querySelector('[data-hotbar-page]'));
if(touchBar.page!==1)touchFailures.push('the compatibility click skipped bar 2 and returned to bar 1');
assert.deepEqual(touchFailures,[]);
const previousDocument=globalThis.document;
let mobile=true;
globalThis.document={body:{classList:{contains:()=>mobile}}};
const mobileHud=new Container('hotbar'),mobileBook=new Container('book'),mobileCasts=[];
const mobileBar=createHotbar({hud:mobileHud,book:mobileBook,canEdit:()=>true,cast:id=>mobileCasts.push(id),save:()=>true,notify(){}});
mobileBar.sync({...bankPlayer,id:'five-slot-owner'});
for(let page=0;page<4;page++){
 assert.equal(mobileBar.page,page);
 assert.equal(mobileHud.querySelectorAll('[data-hotbar-bank]').length,0,'touch controls retain one page toggle for their five radial slots');
 const buttons=mobileHud.querySelectorAll('[data-hotbar-slot]');
 assert.equal(buttons.length,5);assert.deepEqual(buttons.map(button=>Number(button.dataset.hotbarSlot)),[0,1,2,3,4].map(index=>page*5+index));
 const ability=mobileBar.slots[page*5];if(ability){mobileBar.activateSlot(0);assert.equal(mobileCasts.at(-1),ability);}
 assert.match(mobileHud.querySelector('[data-hotbar-page]').getAttribute('aria-label'),/of 4/);
 mobileBar.switchPage();
}
assert.equal(mobileBar.page,0,'four mobile pages cycle through all twenty saved slots');
mobileBar.switchPage();mobileBar.switchPage();mobileBar.switchPage();mobile=false;mobileBar.refresh();
assert.equal(mobileBar.page,1);assert.equal(mobileHud.querySelectorAll('[data-hotbar-slot]').length,10,'desktop returns to the containing ten-slot bank');
mobile=true;mobileBar.refresh();assert.equal(mobileBar.page,2,'touch mode keeps the first desktop slot visible');
globalThis.document=previousDocument;
const oldBar=['mend',null,'fireball','interact',null,null,null,'fireball'];
const legacySecond=['meteor',null,'mend',null,null,null,null,'frostbolt'];
const legacyState=createHotbarState(()=>true);legacyState.sync({...hero('Mage'),hotbar:oldBar,hotbar2:legacySecond});
assert.deepEqual(legacyState.slots,[...oldBar,null,null,...legacySecond,null,null],'each legacy bank gains its own two empty positions without shifting bank two into bank one');
legacyState.sync({...hero('Mage'),hotbar:oldBar,hotbarExtra:['frostbolt','mend'],hotbar2:legacySecond,hotbar2Extra:['interact','fireball']});
assert.deepEqual(legacyState.slots,[...oldBar,'frostbolt','mend',...legacySecond,'interact','fireball'],'separate persisted tails restore both ten-slot banks');
assert.deepEqual(availableHotbar(oldBar,'Mage',20),[...oldBar,null,null,...Array(10).fill(null)],'legacy positions and duplicates survive expansion');
for(const bad of ['arrow','constructor','aegis-of-the-archmage']){const value=[...savedBanks];value[19]=bad;assert(!hotbarValid(value,'Mage',20,['fireball','meteor','frostbolt']),'second-bank validation checks class, level and training');}
assert(!hotbarValid(Array(21).fill(null),'Mage'));assert(!hotbarValid(Array(19).fill(null),'Mage'));
assert.deepEqual(placeHotbar(savedBanks,20,'mend'),savedBanks,'assignments cannot grow a third bank');
delete globalThis.localStorage;
// Translation may replace rendered labels before any tick: canonical sources still drive proc timing.
const timingPlayer={...hero('Ranger','localized-timing',60),talents:[SPELLS.twinshot.requiredTalent],hotbar:['twinshot',null,null,null,null,null,null,null],combatTalents:{heat:0,heatUntil:0,twinshotReadyUntil:20000}};
const timingHud=new Container('hotbar'),timingBook=new Container('book');timingBook.innerHTML=renderSpellbook(timingPlayer,timingPlayer.hotbar);
const timingBar=createHotbar({hud:timingHud,book:timingBook,canEdit:()=>true,cast(){},save:()=>true,notify(){}});timingBar.sync(timingPlayer);
const timingSlot=slot(timingHud,0),timingCard=timingBook.querySelectorAll('[data-book-ability]').find(button=>button.dataset.bookAbility==='twinshot'),timingMeta=timingCard.querySelector('.spell-meta');
timingSlot.title='双重射击 · 1.5秒施法';timingMeta.textContent='伤害 · 1.5秒施法';
timingBar.updateCooldowns(19000);assert(timingSlot.title.includes(' · Instant · '));assert(timingMeta.textContent.includes(' · Instant · '),'active proc updates even already-translated spellbook text');
timingSlot.title='双重射击 · 瞬发';timingMeta.textContent='伤害 · 瞬发';
timingBar.updateCooldowns(19100);assert.equal(timingSlot.title,'双重射击 · 瞬发');assert.equal(timingMeta.textContent,'伤害 · 瞬发','unchanged timing leaves translated DOM untouched');
timingBar.updateCooldowns(20000);assert(timingSlot.title.includes(' · 1.5s cast · '));assert(timingMeta.textContent.includes(' · 1.5s cast · '),'proc expiry restores cast duration from canonical source');
assert.equal(slot(timingHud,0),timingSlot,'timing updates keep focused or dragged controls attached');
// Powerful Throw starts on press and releases only for the input that owns the hold.
const heldListeners=new Map(),heldCasts=[],heldReleases=[];let acceptHeld=true;
globalThis.window={addEventListener:(type,handler)=>{const handlers=heldListeners.get(type)||[];handlers.push(handler);heldListeners.set(type,handlers);}};
const heldEvent=(type,event)=>heldListeners.get(type)?.forEach(handler=>handler(event));
const heldPlayer={...hero('Knight','held-shield',60),talents:[SPELLS['powerful-throw'].requiredTalent],hotbar:['powerful-throw',null,null,null,null,null,null,null]};
const heldHud=new Container('hotbar'),heldBook=new Container('book');heldHud.setPointerCapture=()=>{};
const heldBar=createHotbar({hud:heldHud,book:heldBook,canEdit:()=>true,cast:id=>{heldCasts.push(id);return acceptHeld;},releaseCast:id=>heldReleases.push(id),save:()=>true,notify(){}});heldBar.sync(heldPlayer);
heldHud.fire('pointerdown',slot(heldHud,0),{pointerId:7,button:0});assert.deepEqual(heldCasts,['powerful-throw']);
heldHud.fire('click',slot(heldHud,0));assert.equal(heldCasts.length,1,'touch-generated click cannot restart a held cast');
heldEvent('pointerup',{pointerId:8});assert.equal(heldReleases.length,0,'another thumb cannot release the shield');
heldEvent('pointerup',{pointerId:7});assert.deepEqual(heldReleases,['powerful-throw']);
heldHud.fire('click',slot(heldHud,0));assert.equal(heldCasts.length,1,'native trailing click cannot restart a released cast');
clock+=301;heldBar.activateSlot(0,'Digit1');heldBar.activateSlot(0,'Digit1');assert.equal(heldCasts.length,2,'holding the same key starts only once');
heldEvent('keyup',{code:'KeyW',key:'w'});assert.equal(heldReleases.length,1,'movement key release preserves the charge');
heldEvent('keyup',{code:'Digit1',key:'1'});assert.equal(heldReleases.length,2,'slot key release cancels a pending charge');
clock+=301;heldHud.fire('keydown',slot(heldHud,0),{key:' ',code:'Space'});assert.equal(heldCasts.length,3,'focused keyboard activation can hold the shield');
heldBar.cancel();assert.equal(heldReleases.length,3,'blur/menu/reset cancels a held charge');
clock+=301;acceptHeld=false;heldBar.activateSlot(0,'Digit1');heldEvent('keyup',{code:'Digit1',key:'1'});assert.equal(heldReleases.length,3,'a rejected start never cancels another active spell');
delete globalThis.window;
performance.now=nativeNow;
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),pressed=[],actions=[];let keyHandler;
{
 const sent=[],notices=[],current=[...oldBar,'frostbolt','mend',...legacySecond,'interact','fireball'];
 const context={connected:true,HOTBAR_PAGE_SIZE:10,serverHotbarPageSize:10,hotbar:{slots:current},send:message=>sent.push(message),toast:message=>notices.push(message)};
 const save=runInNewContext(`slots=>${main.slice(main.indexOf('save:slots=>')+'save:slots=>'.length,main.indexOf(', notify:message=>'))}`,context);
 const welcome=main.match(/serverHotbarPageSize=msg\.hotbarPageSize===HOTBAR_PAGE_SIZE\?HOTBAR_PAGE_SIZE:8;/)[0];
 context.msg={};runInNewContext(welcome,context);assert.equal(context.serverHotbarPageSize,8,'a legacy welcome resets capacity after leaving a newer realm');
 const prefix=[...current];prefix[0]=null;prefix[10]='mend';assert.equal(save(prefix),true);
 assert.deepEqual(Array.from(sent.at(-1).slots),prefix.slice(0,8));assert.deepEqual(Array.from(sent.at(-1).otherSlots),prefix.slice(10,18),'legacy edits preserve bank-two indices and omit both saved tails');
 for(const index of [8,9,18,19]){const next=[...current];next[index]=null;assert.equal(save(next),false);}
 assert.equal(sent.length,1,'unsupported tail edits never reach the old server');assert(notices.every(message=>message.includes('still updating')));
 context.msg={hotbarPageSize:10};runInNewContext(welcome,context);assert.equal(context.serverHotbarPageSize,10);
 const full=[...current];full[8]=null;full[19]=null;assert.equal(save(full),true);assert.deepEqual(Array.from(sent.at(-1).slots),full.slice(0,10));assert.deepEqual(Array.from(sent.at(-1).otherSlots),full.slice(10));
 context.connected=false;assert.equal(save(full),false);assert.equal(sent.length,2,'disconnected edits remain unsent');
}
{
 const button=new Button('<button><span>Menu</span></button>',{buttons:[]}),classes=new Set();
 const context={document:{body:{classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)}}},$:()=>button};
 runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function setDesktopMenus('),main.indexOf("setDesktopMenus(readLocal("))),context);
 for(const open of [false,true,false]){
  context.setDesktopMenus(open);assert.equal(classes.has('desktop-menus-collapsed'),!open);
  assert.equal(button.getAttribute('aria-expanded'),String(open));assert.equal(button.getAttribute('aria-label'),open?'Hide menus':'Show menus');
  assert.equal(button.querySelector('span').textContent,open?'Hide':'Menu');
 }
}
// Exercise the live HUD calculation: Job XP belongs to the equipped card, including within-level updates.
{
 const markup=readFileSync(new URL('../src/ui.ts',import.meta.url),'utf8');
 const ids=['xp-fill','xp-label','level-label','job-xp-fill','job-xp-label','job-level-label'];
 for(const id of ids)assert.equal((markup.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`${id} has one live HUD target`);
 const xpBlock=stripTypeScriptTypes(main.slice(main.indexOf(' const xpPercent='),main.indexOf(" $('chapter-label').textContent=")));
 const renderXp=(jobXp,level=1,xp=25)=>{
  const elements=Object.fromEntries(ids.map(id=>[id,{style:{},textContent:'',title:''}]));
  const player={level,xp,appearance:{className:'Knight'},raidProgress:{activeSpecialistId:jobXp===null?null:'equipped',specialists:[{id:'unequipped',jobXp:180500},...(jobXp===null?[]:[{id:'equipped',jobXp}])]}};
  runInNewContext(xpBlock,{player,MAX_LEVEL,specialistJobLevel,activeSpecialist,SPECIALISTS_ENABLED,document:{querySelector:()=>({hidden:false})},$:id=>elements[id]});return elements;
 };
 for(const xp of [0,250,500,1250,180500]){
  const result=renderXp(xp);assert.equal(result['job-level-label'].textContent,'Job Lv. —');assert.equal(result['job-xp-label'].textContent,'SP disabled');assert.equal(result['job-xp-fill'].style.width,'0%');
 }
 const none=renderXp(null);assert.equal(none['job-xp-label'].textContent,'SP disabled');assert.equal(none['job-xp-fill'].style.width,'0%');
 assert.equal(none['xp-label'].textContent,'25.0%');assert.equal(renderXp(null,MAX_LEVEL,0)['xp-label'].textContent,'MAX');
 const hudExpression=main.match(/ const hud=JSON\.stringify\([^\n]+\);/)[0];
 const owner={...hero(),raidProgress:{specialists:[{id:'equipped',jobXp:100}]}};
 const context={trackedStoryQuestId:'',trackedContractId:'',player:owner,raidAppearance:()=>({}),connected:true,party:null,partyInvites:[],dungeon:null,raid:null,arena:null,instantCombat:null,players:[]};
 const before=runInNewContext(hudExpression+'\nhud',{...context});owner.raidProgress.specialists[0].jobXp=200;
 assert.notEqual(runInNewContext(hudExpression+'\nhud',{...context}),before,'Job XP gained within one level invalidates the HUD snapshot key');
}
// New characters can use their live bar before Rowan unlocks layout editing.
const novice={...hero('Ranger','novice',1),characterCreated:true,learnedSpells:['arrow'],quest:{chapter:0,completed:false},onboarding:newOnboarding()};
const noviceHud=new Container('hotbar'),noviceBook=new Container('book'),noviceCasts=[],noviceSaves=[],heals=[],notices=[];
const potionRuntime={player:novice,appearance:novice.appearance,modalOpen:()=>false,connected:true,worldReady:true,isMoving:true,abilityValid,send:message=>heals.push(message.type),toast:message=>notices.push(message)};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function act('),main.indexOf('let characterView:'))),potionRuntime);
noviceBook.innerHTML=renderSpellbook(novice,novice.hotbar);
const noviceBar=createHotbar({hud:noviceHud,book:noviceBook,canEdit:()=>onboardingFeatureUnlocked(novice,'spells'),cast:id=>{noviceCasts.push(id);if(id==='mend')potionRuntime.act(id);},save:slots=>{noviceSaves.push(slots);return true;},notify(){}});noviceBar.sync(novice);
for(const index of [0,2,3])noviceHud.fire('click',slot(noviceHud,index));
assert.deepEqual(noviceCasts,['arrow','mend','interact'],'starter abilities and utilities work before the spellbook unlock');
assert.deepEqual(heals,['heal'],'an injured moving beginner reaches the actual potion request path');
novice.hp=novice.maxHp;noviceHud.fire('click',slot(noviceHud,2));assert.equal(heals.length,1);assert.equal(notices.at(-1),'Your health is already full.');
novice.hp=80;novice.inventory.potion=0;noviceHud.fire('click',slot(noviceHud,2));assert.equal(heals.length,1);assert.equal(notices.at(-1),'You need a healing potion.');novice.inventory.potion=3;
const noviceBefore=noviceBar.slots,castCount=noviceCasts.length;
noviceHud.fire('click',slot(noviceHud,2),{shiftKey:true});noviceBook.fire('click',slot(noviceBook,2));noviceHud.fire('keydown',slot(noviceHud,2),{key:'Delete'});
assert(noviceHud.fire('dragstart',slot(noviceHud,2)),'locked editing still rejects HUD drags');
assert(noviceBook.fire('dragstart',slot(noviceBook,2)),'locked editing still rejects spellbook drags');
assert.equal(noviceCasts.length,castCount);assert.deepEqual(noviceBar.slots,noviceBefore);assert.equal(noviceSaves.length,0);
novice.quest.chapter=1;noviceBook.fire('click',slot(noviceBook,0));novice.quest.chapter=0;
noviceHud.fire('click',slot(noviceHud,2));noviceBar.activateSlot(2);
assert.equal(noviceCasts.length,castCount,'a pending edit never becomes an accidental cast when editing is locked');assert.equal(noviceSaves.length,0);
class Input{}class Select{}class Textarea{}class Element{}class ButtonElement extends Element{}
const keyboard={worldLoading:false,gameKey,bindingLabel,heldKeyCodes:new Map(),panel:{open:false,contains:()=>false},connected:true,player,$:()=>({}),tryJump(){},window:{addEventListener:(_name,handler)=>keyHandler=handler},HTMLInputElement:Input,HTMLSelectElement:Select,HTMLTextAreaElement:Textarea,HTMLElement:Element,HTMLButtonElement:ButtonElement,modalOpen:()=>false,hotbar:{activateSlot:index=>pressed.push(index),switchPage:()=>actions.push('bank')},act:type=>actions.push(type)};
runInNewContext(main.slice(main.indexOf('function gmFlying()'),main.indexOf('function travelSpeed()')),keyboard);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf("window.addEventListener('keydown'"),main.indexOf('const canUseMobile='))),keyboard);
for(let n=1;n<=10;n++)keyHandler({target:{},key:String(n%10),preventDefault(){}});
assert.deepEqual(pressed,[0,1,2,3,4,5,6,7,8,9],'all ten keys dispatch their configured slots');
keyHandler({target:{},key:'`',code:'Backquote',preventDefault(){}});assert.deepEqual(actions,['bank']);actions.length=0;
keyHandler({target:{},key:'e',preventDefault(){}});assert.deepEqual(actions,['gather'],'E remains an independent interaction key');
keyHandler({target:new Input(),key:'1',preventDefault(){}});keyHandler({target:{},key:'1',repeat:true,preventDefault(){}});keyboard.modalOpen=()=>true;keyHandler({target:{},key:'1',preventDefault(){}});assert.equal(pressed.length,10,'typing, repeats and open dialogs never cast from number keys');
const css=readFileSync(new URL('../src/hotbar.css',import.meta.url),'utf8');assert(css.includes('var(--wood-art)'));assert(css.includes('repeat(4,minmax(0,1fr))'));
let renderedBook='',refreshes=0;
const spellUI={player:hero('Ranger','level-up',3),lastSpellBook:'',combatStats:()=>({}),$:()=>({querySelector:()=>true}),skillTabs:()=>'',renderSpellbook,hotbar:{slots:defaultHotbar('Ranger',3),refresh(){refreshes++;}},replacePanelContent(html){renderedBook=html;},wireSkillTabs(){}};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function renderSpells('),main.indexOf('function toggleBackpack('))),spellUI);
spellUI.renderSpells();assert(renderedBook.includes('Requires level 4'));spellUI.player={...spellUI.player,level:4};spellUI.renderSpells();
assert.equal(refreshes,2,'an open book repaints immediately on level up even when stats and inventory are unchanged');assert(!renderedBook.match(/<button\b[^>]*data-book-ability="power-shot"[^>]*>/)?.[0].includes('disabled'),'the newly eligible spell can be assigned while later level-40 lessons stay locked');
console.log('PASS: spell unlock boundaries, locked click/keyboard/native-drag rejection, level-up repaint, legacy-slot migration, all 124 level-60 spell swaps/casts, utilities, optimistic save/reject, cooldowns and generated art.');
