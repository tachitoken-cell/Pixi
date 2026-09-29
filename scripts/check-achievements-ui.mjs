import { translateText } from '../src/localization.ts';
import { gameKey } from '../src/keybindings.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, achievementProgress, achievementPoints, newAchievements } from '../src/achievements.ts';

import { TITLES, getTitle, titleUnlocked, playerTitle } from '../src/titles.ts';

for (const { id } of ACHIEVEMENTS) {
  const png = readFileSync(new URL(`../public/ui/achievements/${id}.png`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG', `${id} has icon art`);
  assert.equal(png.readUInt32BE(16), png.readUInt32BE(20), `${id} is square`);
  assert(png.readUInt32BE(16) >= 256 && png.readUInt32BE(16) <= 1536, `${id} has a suitable icon resolution`);
  assert.equal(png[25], 6, `${id} preserves transparency`);
}

// The native DOM boundary used by the existing friends/trade UI checks.
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39);/g, value => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[value]);
class Element {
  constructor(tag='div') { this.tagName=tag.toUpperCase(); this.children=[]; this.attributes={}; this.dataset={}; this.events={}; this.hidden=false; this.value=''; }
  setAttribute(name,value) { this.attributes[name]=String(value); if(name==='id')this.id=value; if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value); }
  getAttribute(name) { return this.attributes[name]??null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes,name); }
  append(...nodes) { for(const node of nodes) { node.parentElement=this; this.children.push(node); } }
  replaceChildren(...nodes) { for(const child of this.children)child.parentElement=null; this.children=[]; this.html=''; this.append(...nodes); }
  get isConnected() { return this===document.body||!!this.parentElement?.isConnected; }
  contains(node) { return node===this||!!node?.parentElement&&this.contains(node.parentElement); }
  focus() { document.activeElement=this; }
  set textContent(text) { this.replaceChildren(); this.text=String(text); }
  get textContent() { return this.text||''; }
  set innerHTML(html) {
    this.replaceChildren(); this.html=html; const stack=[this];
    for(const [,closing,tag,attrs]of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)) {
      if(closing) { if(stack.length>1)stack.pop(); continue; }
      const node=new Element(tag);
      for(const [,name,value]of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(name,decode(value??''));
      stack.at(-1).append(node); if(tag==='option'&&!stack.at(-1).value)stack.at(-1).value=node.getAttribute('value');
      if(!['input','img','br','hr'].includes(tag))stack.push(node);
    }
  }
  get innerHTML() { return this.html||''; }
  matches(selector) { if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim())); if(selector.startsWith('#'))return this.id===selector.slice(1); if(selector.startsWith('.'))return (this.getAttribute('class')||this.className||'').split(' ').includes(selector.slice(1)); const attr=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/); return attr?this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]):this.tagName===selector.toUpperCase(); }
  querySelectorAll(selector) { return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
  closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector)||null; }
  addEventListener(type,callback) { (this.events[type]||=[]).push(callback); }
  fire(type,extra={}) { const event={target:this,stopped:false,defaultPrevented:false,stopPropagation(){this.stopped=true;},preventDefault(){this.defaultPrevented=true;},...extra}; let node=this; while(node) { for(const fn of node.events[type]||[])fn(event); if(event.stopped)break; node=node.parentElement; } return event; }
}
const document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:null};
const timers=new Map(); let timerId=0;
const source=readFileSync(new URL('../src/achievements-ui.ts',import.meta.url),'utf8');
const mount=runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export function','function'))+';mountAchievementsUI;', {
  translateText,gameKey,document,HTMLElement:Element,icon:()=>'<span class="item-art"></span>',ACHIEVEMENTS,ACHIEVEMENT_CATEGORIES,achievementProgress,achievementPoints,TITLES,getTitle,titleUnlocked,playerTitle,
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
});
const tick=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
const trigger=new Element('button'); document.body.append(trigger); trigger.focus();
let allowed=true,opens=0; const selectedTitles=[];
const ui=mount({trigger,allowed:()=>allowed,onOpen:()=>opens++,onSelectTitle:id=>selectedTitles.push(id)});
const panel=document.body.querySelector('#achievements-window'),find=selector=>panel.querySelector(selector),content=find('#achievement-content'),search=find('input'),filter=find('select');
const category=name=>find(`[data-category="${name}"]`),rows=()=>content.querySelectorAll('.achievement-row');
const player={name:'Willow <img src=x onerror=bad()>',characterCreated:true,level:5,ownedMounts:[],quest:{chapter:0,completed:false},skills:{woodcutting:0},achievements:newAchievements()};
assert(panel.hidden); assert.equal(panel.role,'dialog'); ui.open(); assert(panel.hidden,'a character is required');
ui.update(player); ui.toggle(); assert(ui.isOpen()); assert.equal(opens,1); assert.equal(document.activeElement,find('[data-achievements-close]'));
assert.equal(trigger.getAttribute('aria-expanded'),'true'); assert.match(content.innerHTML,/Your first milestones/); assert.equal(rows().length,3);
assert(content.querySelector('.achievement-completion-ring'),'summary includes the overall completion ring');
assert.match(content.innerHTML,new RegExp(`0 of ${ACHIEVEMENTS.length} earned`),'summary denominator uses the actual achievement catalog');
assert.equal(find('#achievements-character').textContent,`${player.name} · 0 of ${ACHIEVEMENTS.length} earned`); assert.equal(find('#achievements-character').children.length,0,'names are rendered as text');
const overview=content.querySelector('[data-category="Combat"]'); overview.focus(); overview.fire('click');
assert.equal(category('Combat').getAttribute('aria-pressed'),'true'); assert.equal(document.activeElement,content,'replacing an overview button retains keyboard focus');
assert.equal(rows().length,ACHIEVEMENTS.filter(a=>a.category==='Combat').length);
category('Summary').fire('click'); search.value='  resource NODE  '; search.fire('input');
assert.equal(category('All').getAttribute('aria-pressed'),'true'); assert.equal(rows().length,2); assert.match(content.innerHTML,/Hands On/);
search.value='<script>bad()</script>'; search.fire('input'); assert.equal(rows().length,0); assert.match(content.innerHTML,/No matching achievements/); assert(!content.innerHTML.includes('<script>'));
search.value=''; search.fire('input'); filter.value='earned'; filter.fire('change'); assert.match(content.innerHTML,/A story still to be written/);
player.achievements.unlocked={'growing-roots':1000,'first-victory':2000}; ui.update(player);
assert.equal(rows().length,2); assert.equal(find('#achievement-points').textContent,'10'); assert.match(content.innerHTML,/datetime="1970-01-01/);
filter.value='progress'; filter.fire('change'); assert.equal(rows().length,ACHIEVEMENTS.length-2); assert(!content.innerHTML.includes('First Victory'));
category('Summary').fire('click'); assert.equal(search.value,''); assert.equal(filter.value,'all'); assert(content.innerHTML.indexOf('First Victory')<content.innerHTML.indexOf('Growing Roots'),'recent achievements sort newest first');
assert.match(content.innerHTML,new RegExp(`2 of ${ACHIEVEMENTS.length} earned`),'completion updates only from confirmed saved achievement state');
const before=content.querySelector('button'); ui.update(player); assert.equal(content.querySelector('button'),before,'unchanged snapshots retain rendered controls');
const focusedCategory=content.querySelector('[data-category="Professions"]'); focusedCategory.focus(); player.achievements.unlocked['hands-on']=3000; ui.update(player);
assert.equal(document.activeElement,content.querySelector('[data-category="Professions"]'),'changed snapshots retain the focused category');
assert(search.fire('keydown',{key:'w'}).stopped); assert(search.fire('pointerdown').stopped);
assert(search.fire('keydown',{key:'Escape'}).defaultPrevented); assert(panel.hidden); assert.equal(document.activeElement,trigger); assert.equal(trigger.getAttribute('aria-expanded'),'false');
ui.open(); find('[data-achievements-close]').fire('click'); assert(panel.hidden);
ui.open(); assert(!search.fire('keydown',{key:'y'}).defaultPrevented); assert(ui.isOpen(),'search can contain the shortcut letter'); assert(find('[data-achievements-close]').fire('keydown',{key:'Y'}).defaultPrevented); assert(panel.hidden,'Y also closes from a focused window control');
ui.open();
const titleSelect=find('#achievement-title'),titleStatus=find('#achievement-title-status');
assert(titleSelect.querySelector('[value="beta-tester"]').hasAttribute('disabled'),'Beta Tester is locked without an account entitlement');
titleSelect.value='beta-tester'; titleSelect.fire('change'); assert.equal(selectedTitles.length,0);
titleSelect.value='adventurer'; titleSelect.fire('change'); assert.equal(selectedTitles.at(-1),'adventurer'); assert(titleSelect.disabled); assert.match(titleStatus.textContent,/Saving/);
ui.update(player); assert(titleSelect.disabled); assert.equal(titleSelect.value,'adventurer','periodic snapshots do not overwrite pending selection');
player.achievements.unlocked['trail-warden']=4000; ui.update(player); assert.equal(titleSelect.value,'adventurer','a new title unlock preserves the pending selection');
ui.titleSelected('adventurer'); assert(!titleSelect.disabled); assert.match(titleStatus.textContent,/<Adventurer> equipped/);
player.title='adventurer'; player.betaTester=true; ui.update(player); assert(!titleSelect.querySelector('[value="beta-tester"]').hasAttribute('disabled'));
titleSelect.value='beta-tester'; titleSelect.fire('change'); ui.titleSelected('adventurer','Could not save. Try again.'); assert.equal(titleSelect.value,'adventurer'); assert.match(titleStatus.textContent,/Could not save/);
titleSelect.value=''; titleSelect.fire('change'); assert.equal(selectedTitles.at(-1),null); ui.titleSelected(null); assert.match(titleStatus.textContent,/hidden/);
titleSelect.value='beta-tester'; titleSelect.fire('change'); tick(); assert(!titleSelect.disabled); assert.match(titleStatus.textContent,/No reply/);
ui.titleSelected('beta-tester'); assert.equal(titleSelect.value,'beta-tester');
assert(content.innerHTML.includes('/ui/achievements/first-victory.png'),'rows use the original achievement art');
const notification=document.body.querySelector('.achievement-unlocked');
ui.unlock('unknown'); assert(notification.hidden); ui.unlock('first-victory'); assert(!notification.hidden); assert.match(notification.innerHTML,/First Victory/);
ui.unlock('first-victory'); ui.unlock('hands-on'); assert.equal(timers.size,1); tick(); assert.match(notification.innerHTML,/Hands On/); tick(); assert(notification.hidden); assert.equal(timers.size,0);
ui.unlock('growing-roots'); ui.unlock('seasoned-adventurer'); ui.open(); ui.reset();
assert(panel.hidden&&notification.hidden); assert.equal(content.innerHTML,''); assert.equal(search.value,''); assert.equal(filter.value,'all'); assert.equal(timers.size,0);
ui.update(player); allowed=false; ui.open(); ui.unlock('hands-on'); assert(panel.hidden&&notification.hidden,'disconnected or roster state blocks the UI');
allowed=true; ui.unlock('hands-on'); assert(!notification.hidden,'reset clears announcement history for the next character'); ui.reset();
console.log('PASS achievements UI: summary, categories, search/status/empty states, saved points/dates, safe names, focus and input isolation, queued notifications, server-confirmed title selection, locked/beta titles, rejection/timeout, reset and disconnected state.');
