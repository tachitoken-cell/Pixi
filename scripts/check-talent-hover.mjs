import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

class Events {
 listeners = new Map();
 addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
 emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({target:this, ...event}); }
}
class Element extends Events {
 constructor(kind, rect = {}) {
  super(); this.kind = kind; this.rect = {left:100, top:100, width:44, height:44, ...rect};
  this.children = []; this.attributes = new Map(); this.style = {}; this.open = false; this.opens = 0;
  this.classes = new Set(); this.classList = {contains:name=>this.classes.has(name),toggle:(name, on)=>on?this.classes.add(name):this.classes.delete(name)};
 }
 append(child) { child.parent = this; this.children.push(child); return child; }
 contains(target) { return target === this || this.children.some(child => child.contains(target)); }
 closest(selector) { return this.kind === selector ? this : this.parent?.closest(selector) || null; }
 querySelector(selector) { return this.children.find(child => child.kind === selector) || this.children.map(child => child.querySelector(selector)).find(Boolean) || null; }
 getBoundingClientRect() { const r = this.rect; return {...r, right:r.left+r.width, bottom:r.top+r.height}; }
 setAttribute(name, value) { this.attributes.set(name, value); }
 removeAttribute(name) { this.attributes.delete(name); }
 matches(selector) { assert.equal(selector, ':popover-open'); return this.open; }
 showPopover() { assert.equal(this.attributes.get('popover'), 'manual'); this.open = true; this.opens++; }
 hidePopover() { this.open = false; }
}
const source = readFileSync(new URL('../src/talent-hover.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/progression.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const dialog = new Element('dialog'), content = dialog.append(new Element('#panel-content'));
const makeTalent = (rank, left = 500) => {
 const node = content.append(new Element('.talent-node', {left}));
 const button = node.append(new Element('button')), icon = button.append(new Element('svg'));
 const detail = node.append(new Element('.talent-node-detail', {width:300, height:180})); detail.rank = rank;
 return {node, button, icon, detail};
};
let a = makeTalent(1), b = makeTalent(3, 900), hit = a.icon;
const document = new Events(), window = new Events(), media = new Events();
media.matches = true; document.activeElement = null; document.elementFromPoint = () => hit;
const context = {Element, HTMLElement:Element, document, window, innerWidth:1280, innerHeight:720, matchMedia:()=>media};
const mount = runInNewContext(`${stripTypeScriptTypes(source).replace(/^export /gm, '')}\nmountTalentHover`, context);
const refresh = mount(content), visible = detail => detail.open;
const move = (target, x, y, pointerType = 'mouse', type = 'pointermove') => content.emit(type, {target, clientX:x, clientY:y, pointerType});
const position = detail => [parseFloat(detail.style.left), parseFloat(detail.style.top)];
assert(content.classes.has('talent-cursor-tooltips'));
move(a.icon, 300, 200, 'mouse', 'pointerover');
assert(visible(a.detail)); assert.deepEqual(position(a.detail), [316,216]);
move(a.icon, 340, 225); assert.deepEqual(position(a.detail), [356,241]); assert.equal(a.detail.opens, 1, 'same-node movement follows pointer without reopening');
move(b.icon, 1275, 715); assert(!visible(a.detail)); assert(visible(b.detail));
assert.deepEqual(position(b.detail), [959,519], 'lower-right pointer flips left and above');
context.innerWidth = 260; context.innerHeight = 160; b.detail.rect.width = 240; b.detail.rect.height = 140;
move(b.icon, 3, 3); assert.deepEqual(position(b.detail), [10,10], 'tooltip clamps to viewport margins');
context.innerWidth = 1280; context.innerHeight = 720;
document.emit('keydown', {key:'Tab'}); document.activeElement = a.button; content.emit('focusin', {target:a.button});
assert.deepEqual(position(a.detail), [560,116], 'keyboard focus anchors to its node rather than stale mouse coordinates');
content.emit('focusout', {target:a.button, relatedTarget:null}); assert(!visible(a.detail), 'keyboard focus leaving dismisses');
move(a.icon, 300, 200); const previous = a;
content.children = content.children.filter(child => child !== previous.node); previous.node.parent = null; previous.detail.open = false;
a = makeTalent(2); hit = a.icon; refresh();
assert(visible(a.detail) && a.detail.rank === 2); assert.deepEqual(position(a.detail), [316,216]);
assert(!previous.detail.attributes.has('popover'), 'rank refresh releases old tooltip and positions the replaced node');
content.emit('pointerleave'); assert(!visible(a.detail));
move(a.icon, 300, 200); document.emit('keydown', {key:'Escape'}); assert(!visible(a.detail), 'Escape dismisses');
move(a.icon, 300, 200); dialog.emit('close'); assert(!visible(a.detail), 'closing panel dismisses');
for (const [target, type] of [[document,'scroll'],[window,'resize'],[window,'blur']]) {
 move(a.icon,300,200); target.emit(type); assert(!visible(a.detail), `${type} dismisses stale geometry`);
}
move(a.icon, 300, 200); move(a.icon, 300, 200, 'touch'); content.emit('focusin', {target:a.button}); refresh();
assert(!visible(a.detail) && !content.classes.has('talent-cursor-tooltips'), 'touch on a hybrid desktop suppresses hover and restores inline details');
document.emit('keydown', {key:'Tab'}); content.emit('focusin', {target:a.button});
assert(visible(a.detail) && content.classes.has('talent-cursor-tooltips'), 'keyboard inspection resumes after hybrid touch');
media.matches = false; media.emit('change'); assert(!content.classes.has('talent-cursor-tooltips'));
move(a.icon, 300, 200, 'touch'); document.activeElement = a.button; content.emit('focusin', {target:a.button}); refresh();
assert(!visible(a.detail) && !a.detail.attributes.has('popover'), 'mobile touch/focus leaves native inline details intact');
media.matches = true; media.emit('change'); move(a.icon,300,200); media.matches = false; media.emit('change');
assert(!a.detail.style.left && !a.detail.style.top, 'switching to mobile clears viewport coordinates from inline details');
assert(/\.talent-node-detail\s*\{[^}]*pointer-events:none/.test(css), 'tooltip cannot intercept talent clicks');

// Execute the shipped render and reopen functions to verify passive HUD updates preserve DOM.
const renderText = main.match(/^function renderTalentPanel\(\).*$/m)?.[0];
const openText = main.match(/^function openTalents\(\).*$/m)?.[0];
assert(renderText && openText);
const replacements = [], render = {player:{characterCreated:true, rank:1}, appearance:{className:'Mage'}, lastTalentHTML:'',
 renderTalents:p=>`rank:${p.rank}`, replacePanelContent:html=>replacements.push(html), refreshes:0,
 refreshTalentHover:()=>render.refreshes++, allowFeature:()=>true, openPanel(){}};
runInNewContext(stripTypeScriptTypes(`${renderText}\n${openText}`), render);
render.renderTalentPanel(); for(let i=0;i<20;i++)render.renderTalentPanel();
assert.deepEqual(replacements,['rank:1']); assert.equal(render.refreshes,1,'passive updates preserve talent buttons and hover');
render.player.rank=2; render.renderTalentPanel(); assert.deepEqual(replacements,['rank:1','rank:2']); assert.equal(render.refreshes,2,'confirmed rank change repaints and restores hover');
render.openTalents(); assert.deepEqual(replacements,['rank:1','rank:2','rank:2'],'reopening after another panel resets the render cache');
console.log('PASS talent hover: pointer follow, viewport flip/clamp, keyboard anchor, refreshed ranks, leave/Escape/close, mobile fallback and stable passive rendering.');
