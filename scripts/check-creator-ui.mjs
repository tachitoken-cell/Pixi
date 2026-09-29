import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { RACES, GENDERS, FACES, HAIRSTYLES, DEFAULT_APPEARANCE, appearanceValid, normalizeAppearance, ARMOR_COLOR_SLOTS } from '../src/appearance.ts';

const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { mountUI } = await import('../src/ui.ts'); hook.deregister();
const app = { innerHTML: '' }; globalThis.document = { querySelectorAll:()=>[], getElementById: id => id === 'app' ? app : { insertAdjacentHTML(where,html){ if(id==='character-list'){assert.equal(where,'beforebegin');assert.match(html,/id="roster-language"/);return;} assert.equal(id,'roster-create'); assert.equal(where,'afterend'); assert.match(html,/id="roster-delete"/); } } }; mountUI(); delete globalThis.document;
const creator = app.innerHTML.slice(app.innerHTML.indexOf('<dialog id="customizer"'), app.innerHTML.indexOf('</form></dialog>', app.innerHTML.indexOf('<dialog id="customizer"')));
for (const key of ['Race','Gender','Class','Face','Haircut']) for (const direction of ['Previous','Next']) assert(creator.includes(`aria-label="${direction} ${key.toLowerCase()}"`));
assert.equal((creator.match(/data-cycle=/g)||[]).length,10);
assert.equal((creator.match(/role="tab"/g)||[]).length,10);
assert.equal((creator.match(/data-creator-step=/g)||[]).length,4);
for(let step=1;step<4;step++)assert(creator.includes(`data-creator-page="${step}" hidden`));
assert(creator.includes('id="creator-color-part"'),'mobile colors retain all parts without the dense tabs');
assert(creator.includes('id="character-preview"') && creator.includes('id="character-name"') && creator.includes('id="create-character"'));
const ids=[...creator.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]); assert.equal(new Set(ids).size,ids.length,'creator IDs remain unique');

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function section(start,end){const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a);return main.slice(a,b);}
const elements=new Map(); let previews=0;
class Element {
  constructor(id='',attributes={}){this.id=id;this.attributes=attributes;this.dataset={};this.textContent='';this.children=[];this.tabIndex=0;this._html='';for(const [key,value] of Object.entries(attributes))if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;}
  set innerHTML(html){this._html=html;this.children=[...html.matchAll(/<button\b([^>]*)>/g)].map(match=>new Element('',Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute=>[attribute[1],attribute[2]]))));}
  get innerHTML(){return this._html;}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelectorAll(selector){return this.children.filter(button=>selector==='[data-color-tab]'?button.dataset.colorTab:button.dataset.color);}
  querySelector(selector){return selector==='.swatches'?this:selector==='[aria-pressed="true"]'?this.children.find(button=>button.attributes['aria-pressed']==='true'):this.querySelectorAll(selector)[0];}
  contains(element){return this===element||this.children.includes(element);}
  focus(){context.document.activeElement=this;}
  closest(){return this;}
}
function $(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);}
$('creator-color-tabs').children=['hair','hairHighlight','skin','outfit','accent','head','armor','legs','shoes','back'].map(key=>new Element(`creator-tab-${key}`,{'data-color-tab':key}));
const context={$,HTMLElement:Element,document:{activeElement:null},draft:normalizeAppearance(DEFAULT_APPEARANCE),
 RACES,GENDERS,FACES,HAIRSTYLES,ARMOR_COLOR_SLOTS,normalizeAppearance,icon:()=>'',updatePreview:()=>previews++,
 classSpells:Object.fromEntries(['Ranger','Knight','Mage','Cleric'].map(name=>[name,{primary:name+' attack',special:name+' burst',range:10,primaryIcon:'bow',specialIcon:'spark'}])),
 getComputedStyle:()=>({gridTemplateColumns:Array(12).fill('20px').join(' ')}),Math};
runInNewContext(stripTypeScriptTypes(section('const spectrumColors =','function updatePreview(')+section("$('creator-selectors').onclick=","$('customize-button').onclick=")+ '\nglobalThis.catalog=creatorChoices;globalThis.palettes=palettes;globalThis.activeColor=()=>creatorColor;'),context);
context.drawChoices();
for(const property of Object.keys(context.catalog)){
 const choices=context.catalog[property],seen=new Set(); const initial=context.draft[property];
 for(let i=0;i<choices.length;i++){context.cycleCreatorChoice(property,1);seen.add(context.draft[property]);assert(appearanceValid(context.draft));}
 assert.equal(seen.size,choices.length,`${property}: every option is reachable`); assert.equal(context.draft[property],initial,`${property}: forward cycling wraps`);
 context.cycleCreatorChoice(property,-1);assert.equal(context.draft[property],choices[(choices.findIndex(option=>option.id===initial)-1+choices.length)%choices.length].id);
 context.cycleCreatorChoice(property,1);
}
for(const [key,colors] of Object.entries(context.palettes)){
 assert(colors.length>=72,`${key}: dense palette`);assert.equal(new Set(colors).size,colors.length);
 $('creator-color-tabs').onclick({target:$('creator-color-tabs').children.find(button=>button.dataset.colorTab===key)});
 assert.equal(context.activeColor(),key);assert.equal($('color-options').attributes['aria-labelledby'],`creator-tab-${key}`);
 assert.equal($('creator-color-tabs').children.filter(button=>button.attributes['aria-selected']==='true').length,1);
 context.chooseCreatorColor(colors.at(-1));assert.equal(context.draft[key],colors.at(-1));assert(appearanceValid(context.draft));
 assert.equal(($('color-options').innerHTML.match(/aria-pressed="true"/g)||[]).length,1);
 assert.equal(($('color-options').innerHTML.match(/tabindex="0"/g)||[]).length,1,'palette has a single tab stop');
}
// A valid previously chosen custom color stays selected rather than disappearing.
$('creator-color-tabs').onclick({target:$('creator-color-tabs').children.find(button=>button.dataset.colorTab==='accent')});context.draft.accent='#123456';context.drawChoices();assert($('color-options').innerHTML.includes('data-color="#123456"'));
let prevented=false;const key=key=>({key,target:$('color-options').querySelector('[aria-pressed="true"]'),preventDefault(){prevented=true;}});
$('color-options').onkeydown(key('Home'));assert(prevented);assert.equal(context.draft.accent,context.palettes.accent[0]);
$('color-options').onkeydown(key('ArrowDown'));assert.equal(context.draft.accent,context.palettes.accent[12]);
$('color-options').onkeydown(key('ArrowRight'));assert.equal(context.draft.accent,context.palettes.accent[13]);
assert.equal(context.document.activeElement,$('color-options').querySelector('[aria-pressed="true"]'),'keyboard focus survives live palette redraw');
$('creator-color-tabs').onkeydown({key:'Home',preventDefault(){}});assert.equal(context.activeColor(),'hair');
$('creator-color-tabs').onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(context.activeColor(),'back','tab keyboard navigation wraps');
for(const slot of ARMOR_COLOR_SLOTS){
 $('creator-color-tabs').onclick({target:$('creator-color-tabs').children.find(button=>button.dataset.colorTab===slot)});
 $('creator-custom-color').oninput({target:{value:'#29a1d7'}});assert.equal(context.draft.armorColors[slot],'#29a1d7');
 $('creator-reset-dye').onclick();assert(!Object.hasOwn(context.draft.armorColors,slot));
}
$('creator-color-tabs').onclick({target:$('creator-color-tabs').children.find(button=>button.dataset.colorTab==='hairHighlight')});
$('creator-custom-color').oninput({target:{value:'#af47e2'}});assert.equal(context.draft.hairHighlight,'#af47e2');
const selectedClass=context.draft.className;for(let i=0;i<20;i++){context.randomizeAppearance();assert(appearanceValid(context.draft));assert.equal(context.draft.className,selectedClass,'appearance shuffle preserves chosen class');}
assert(previews>50,'selections update the live preview');
const css=readFileSync(new URL('../src/creator.css',import.meta.url),'utf8');
assert(css.includes('border-image: var(--wood-art)'));
assert(!css.includes('character-backdrop'),'the background stays real3D');
console.log('PASS: five complete appearance selectors,84-color palettes, shared normalization, accessible tabs/color keys and focus, valid randomization, painted controls and real3D mount.');
