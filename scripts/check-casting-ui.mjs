import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import postcss from 'postcss';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { updateCastingBar, castTimeLabel, spellTimingLabel, castLabel } = await import('../src/casting.ts');
const { mountUI } = await import('../src/ui.ts');
const { renderHotbar, renderSpellbook, createHotbar } = await import('../src/hotbar.ts');
const { renderTraining } = await import('../src/training-ui.ts');
const { TRAINER_NPCS } = await import('../src/training.ts');
const { SPELLS, defaultHotbar, spellsForClass, spellCastTimeMs, spellDamage, spellTotalDamage, spellTotalPower, spellUtilityLabel } = await import('../src/spells.ts');
const { combatStats, starterGear, TALENTS } = await import('../src/progression.ts');
hook.deregister();
assert.equal(spellTimingLabel(SPELLS.fireball,undefined,0,{castSpeedMultiplier:1.1}),castTimeLabel(Math.round(SPELLS.fireball.castTimeMs/1.1)),'cast timing labels include passive cast speed');
const hero = (className='Ranger') => ({ id:className, level:60, hp:100, appearance:{className}, talents:[], inventory:{potion:3}, gold:1000, hotbar:defaultHotbar(className,60), abilityCooldowns:{}, ...starterGear(className) });

// The only mocked boundary is native DOM storage. Mount and update the shipped markup.
class Element {
  constructor(tag='') {
    this.attributes=Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,key,value])=>[key,value]));
    this.hidden=/\shidden(?:\s|>)/.test(tag); this.innerHTML=''; this.textContent='';
    this.style={setProperty(key,value){this[key]=value;}};
  }
  setAttribute(key,value){this.attributes[key]=value;}
}
const elements=new Map([['app',new Element()],['instance-loading',new EventTarget()],['character-list',{insertAdjacentHTML(){}}],['roster-create',{insertAdjacentHTML(){}}]]);
globalThis.document={body:{classList:{contains:()=>false}},querySelectorAll:()=>[],getElementById:id=>elements.get(id)||null};
updateCastingBar(undefined,1000,false); // Safe before mount.
mountUI();
const markup=elements.get('app').innerHTML;
for(const match of markup.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))elements.set(match[1],new Element(match[0]));
const get=id=>elements.get(`casting-${id}`), bar=get('bar'), progress=get('progress');
assert(bar.hidden,'cast bar starts completely hidden');
assert(markup.indexOf('id="casting-bar"')<markup.indexOf('id="hotbar"'),'bar sits above the live hotbar');
assert.equal(progress.attributes.role,'progressbar');assert.equal(progress.attributes['aria-labelledby'],'casting-name');
assert.equal(progress.attributes['aria-valuemin'],'0');assert.equal(progress.attributes['aria-valuemax'],'100');
const casting={ability:'fireball',startedAt:1000,endsAt:3000,rotation:0,targetId:'target'};
const player={...hero('Mage'),casting};
updateCastingBar(player,1000,true);
assert(!bar.hidden);assert.equal(get('name').textContent,SPELLS.fireball.label);assert.equal(get('time').textContent,'2.0s');
assert.equal(get('fill').style.width,'0%');assert.equal(progress.attributes['aria-valuenow'],'0');
assert(get('icon').innerHTML.includes('item-art'),'bar reuses generated ability art');
updateCastingBar(player,2000,true);
assert.equal(get('fill').style.width,'50%');assert.equal(progress.attributes['aria-valuenow'],'50');assert.equal(get('time').textContent,'1.0s');
assert.equal(progress.attributes['aria-valuetext'],'Fireball, 1.0s remaining');
updateCastingBar({...player,casting:{...casting,ability:'smite'}},2000,true);
assert.equal(get('name').textContent,'Smite');assert.equal(progress.attributes['aria-valuetext'],'Smite, 1.0s remaining','changing spell refreshes accessibility text even with the same time remaining');
assert.equal(bar.style['--cast-color'],SPELLS.smite.color);
updateCastingBar(player,2500,true);assert.equal(get('fill').style.width,'75%','a late snapshot starts at its elapsed server time');
updateCastingBar(player,900,true);assert.equal(get('fill').style.width,'0%','clock skew never fills below zero');
for(const [p,now,active] of [[player,3000,true],[player,4000,true],[player,1500,false],[{...player,hp:0},1500,true],[{...player,casting:null},1500,true],[undefined,1500,true],[{...player,casting:{...casting,endsAt:1000}},1500,true],[{...player,casting:{...casting,endsAt:NaN}},1500,true],[player,NaN,true]]) {
  updateCastingBar(player,1500,true);assert(!bar.hidden);
  updateCastingBar(p,now,active);assert(bar.hidden,'release, cancellation, death, inactive UI and invalid timing hide the entire bar');
}
updateCastingBar({...player,casting:{...casting,startedAt:3000,endsAt:5000}},3500,true);
assert(!bar.hidden);assert.equal(get('fill').style.width,'25%','a fresh cast after cancellation resets its fill');
const channel={...hero('Cleric'),casting:{ability:'renew',startedAt:1000,endsAt:4000,channel:true}};
updateCastingBar(channel,1000,true);assert.equal(get('fill').style.width,'100%');assert.equal(get('name').textContent,'Renew · Channeling');
updateCastingBar(channel,2500,true);assert.equal(get('fill').style.width,'50%');assert.equal(progress.attributes['aria-valuetext'],'Renew, channeling, 1.5s remaining');
updateCastingBar(channel,4000,true);assert(bar.hidden,'finished channels disappear');
updateCastingBar({...hero('Cleric'),casting:null},1500,true);assert(bar.hidden,'instant healing has no fabricated cast bar');

for (const [mount, name] of [['horse', 'Briar Horse'], ['wolf', 'Moonfang Wolf']]) {
  const rider = {...player, casting:{...casting, ability:'mount', mount}};
  assert.equal(castLabel(rider.casting), name);
  updateCastingBar(rider, 1000, true);
  assert(!bar.hidden);assert.equal(get('name').textContent, name);assert.equal(get('time').textContent, '2.0s');
  assert(get('icon').innerHTML.includes(`/ui/mount-${mount}.png`));
  updateCastingBar(rider, 2000, true);
  assert.equal(get('fill').style.width, '50%');assert.equal(progress.attributes['aria-valuetext'], `${name}, 1.0s remaining`);
  updateCastingBar(rider, 3000, true);assert(bar.hidden, 'completed mount casts hide the bar');
  updateCastingBar(rider, 1500, true);
  updateCastingBar({...rider, casting:null}, 1500, true);assert(bar.hidden, 'cancelled mount casts hide the bar');
}

for(const className of ['Ranger','Mage','Knight','Cleric']) {
  const p=hero(className),stats=combatStats(p),book=renderSpellbook(p,p.hotbar),trainerNPC=TRAINER_NPCS.find(n=>n.className===className);
  for(const spell of spellsForClass(className)) {
    const label=spellTimingLabel(spell),slots=renderHotbar([spell.id,null,'mend','interact',null,null,null,null],p);
    const slotTag=[...slots.matchAll(/<button\b[^>]*>/g)].find(([tag])=>tag.includes('data-hotbar-slot="0"'))?.[0];
    assert(slotTag?.includes(label),`${spell.label} hotbar tooltip uses authored cast/channel duration`);
    const card=book.split(`data-book-ability="${spell.id}"`)[1]?.split('</button>')[0];
    assert(card?.includes(label),`${spell.label} spellbook duration matches its tooltip`);
    const trainer=renderTraining(p,trainerNPC,{selected:spell.id}),lesson=trainer.split('<aside class="training-detail"')[1];
    assert(lesson?.includes(label),`${spell.label} selected trainer detail matches its tooltip`);
    const utility=spellUtilityLabel(spell),effect=spell.effect==='heal'?'Healing':spell.effect==='shield'?'Absorption':'Damage';
    if(utility){
      assert(lesson.includes(`<dt>Effect</dt><dd>${utility}</dd>`),`${spell.label} training shows its utility effect`);
      assert(card.includes(utility),`${spell.label} spellbook shows its utility effect`);
    }else{
      assert(lesson.includes(`<dt>${effect}</dt>`),`${spell.label} training labels its effect`);
      const shownEffect=spell.effect==='damage'&&spell.status?.ticks?`total damage including ${spell.status.kind}`:effect.toLowerCase();
      assert(card.includes(`${spellTotalPower(spell,stats)} ${shownEffect}`),`${spell.label} displays the full effect including periodic damage`);
    }
    if(spell.channel)assert(card.includes('over the channel')&&lesson.includes('per tick'));
    assert(!/undefined|NaN/.test(slots+book+trainer));
  }
}
assert.equal(castTimeLabel(0),'Instant');assert.equal(castTimeLabel(1000),'1s cast');assert.equal(castTimeLabel(1025),'1.025s cast');
assert.equal(spellTimingLabel(SPELLS.renew),'3s channel');
const venom=SPELLS['poison-shot'],rangerStats=combatStats(hero());
assert.equal(spellCastTimeMs(venom,rangerStats),0,'Venom Arrow remains instant regardless of poison power');
assert(renderSpellbook(hero(),hero().hotbar).includes(`${spellTotalDamage(venom,rangerStats)} total damage including poison`),'spellbook explains real damage including poison');
for (const [ring, talents, damage] of [[null, [], 511], ['star-ring', [], 517], ['star-ring', ['ranger-1'], 527]]) {
  const ranger = { ...hero(), talents, equipment: { ...hero().equipment, ring1: ring } };
  const card = renderSpellbook(ranger, ranger.hotbar).split('data-book-ability="eagles-eye"')[1]?.split('</button>')[0];
  assert(card?.includes(`${damage} damage`), 'Eagle’s Eye display includes skill gear and applicable passives');
}

// Run the real hotbar controller: no predicted cooldown and repaint after only stats change.
class Slot extends Element {
  constructor(tag,parent){super(tag);this.parent=parent;this.dataset={hotbarSlot:this.attributes['data-hotbar-slot']};this.parts=new Map();const classes=new Set();this.classList={toggle:(key,on)=>on?classes.add(key):classes.delete(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)};}
  querySelector(key){if(!this.parts.has(key))this.parts.set(key,new Element());return this.parts.get(key);}
  closest(key){return key==='#hotbar'&&this.parent.id==='hotbar'?this.parent:null;}
}
class Container {
  constructor(id){this.id=id;this.slots=[];this.paints=0;}
  set innerHTML(html){this.html=html;this.paints++;this.slots=[...html.matchAll(/<button\b[^>]*>/g)].map(([tag])=>new Slot(tag,this));}
  querySelectorAll(selector){return selector==='[data-hotbar-slot]'?this.slots.filter(slot=>slot.dataset.hotbarSlot!==undefined):[];}
  querySelector(){return null;}
  addEventListener(){}
}
const hud=new Container('hotbar'),book=new Container('book');
let rangeTarget=null;
const controller=createHotbar({hud,book,canEdit:()=>true,rangeTarget:()=>rangeTarget,cast(){},save:()=>true,notify(){}});
const ranger={...hero(),casting:{ability:'arrow',startedAt:1000,endsAt:2200}};controller.sync(ranger);controller.predictCast('arrow',1000);controller.updateCooldowns(1000);
assert.equal(hud.slots[0].style['--cooldown'],'0%');assert.equal(hud.slots[0].querySelector('.hotbar-cooldown').textContent,'','requesting a cast never starts cooldown');
assert(hud.slots[0].classList.contains('is-casting'),'authoritative preparation highlights its slot');
controller.sync({...ranger,casting:null,abilityCooldowns:{arrow:2750}});controller.updateCooldowns(2200);
assert.equal(hud.slots[0].style['--cooldown'],'100%');assert.equal(hud.slots[0].querySelector('.hotbar-cooldown').textContent,'0.6');
assert(!hud.slots[0].classList.contains('is-casting'),'release removes the cast highlight');
controller.updateCooldowns(2750);assert.equal(hud.slots[0].style['--cooldown'],'0%');
let p=hero();controller.sync(p);const initialTitle=hud.slots[0].attributes.title,initialPaints=hud.paints;
p={...p,equipment:{...p.equipment,weapon:'warden-longbow'}};controller.sync(p);
assert.equal(hud.paints,initialPaints+1);assert.equal(hud.slots[0].attributes.title,initialTitle,'gear changes preserve fixed cast durations');assert.notEqual(renderSpellbook(p,p.hotbar),renderSpellbook(hero(),hero().hotbar),'gear improves displayed power');
const gearedTitle=hud.slots[0].attributes.title;
const talent=Object.values(TALENTS).find(t=>t.className==='Ranger'&&t.stats.primaryDamage>0);
p={...p,talents:[talent.id]};controller.sync(p);
assert.equal(hud.slots[0].attributes.title,gearedTitle,'talents improve power while preserving fixed cast durations');
const paints=hud.paints;controller.sync({...p,hp:90});assert.equal(hud.paints,paints,'ordinary health snapshots do not rebuild the bar');

const healer={...hero('Cleric'),hotbar:['heal','smite','mend','interact',null,null,null,null],casting:null,globalCooldownUntil:6500};
controller.sync(healer);controller.updateCooldowns(5000);assert.equal(hud.slots[0].style['--cooldown'],'100%');assert.equal(hud.slots[1].style['--cooldown'],'100%','the global cooldown affects different learned spells');
controller.updateCooldowns(5750);assert.equal(hud.slots[0].style['--cooldown'],'50%');
controller.updateCooldowns(6500);assert.equal(hud.slots[0].style['--cooldown'],'0%','zero individual cooldown is finite after the global cooldown');

// Follow the same authoritative proc timestamp that makes the actual cast instant.
const twinshot={...hero(),talents:[SPELLS.twinshot.requiredTalent],hotbar:['twinshot','arrow',null,null,null,null,null,null],hotbar2:['arrow','twinshot',null,null,null,null,null,null],combatTalents:{heat:0,heatUntil:0,twinshotReadyUntil:0}};
controller.sync(twinshot);controller.updateCooldowns(7000);
assert(!hud.slots[0].classList.contains('is-proc-ready'),'learning Twinshot and having no cooldown do not imply an instant proc');
assert(hud.html.includes('<span class="hotbar-proc" hidden aria-hidden="true">Instant</span>'),'Twinshot provides a hidden, non-color-only proc badge');
const procSlot=hud.slots[0],procPaints=hud.paints;
const readyTwinshot={...twinshot,globalCooldownUntil:9000,combatTalents:{...twinshot.combatTalents,twinshotReadyUntil:10000}};
rangeTarget={distance:99,hostile:true};controller.sync(readyTwinshot);controller.updateCooldowns(8000);
assert.equal(spellCastTimeMs(SPELLS.twinshot,combatStats(readyTwinshot),readyTwinshot.combatTalents,8000),0);
assert(procSlot.classList.contains('is-proc-ready'),'server-granted instant Twinshot highlights the existing slot');
assert(procSlot.classList.contains('is-out-of-range'));assert.equal(procSlot.attributes['aria-disabled'],'true','the proc stays visible through range and GCD restrictions');
assert(!procSlot.querySelector('.hotbar-proc').hidden);assert(procSlot.attributes['aria-label'].includes('Instant cast ready'));
assert(!hud.slots[1].classList.contains('is-proc-ready'),'other instant spells are not highlighted');
controller.predictCast('twinshot',8100);controller.reject();controller.updateCooldowns(8200);
assert(procSlot.classList.contains('is-proc-ready'),'a requested or rejected cast does not predictively consume the proc');
controller.sync({...readyTwinshot,combatTalents:twinshot.combatTalents});controller.updateCooldowns(8300);
assert(!procSlot.classList.contains('is-proc-ready'),'accepted-cast snapshot removes the highlight');
assert(procSlot.querySelector('.hotbar-proc').hidden);assert(!procSlot.attributes['aria-label'].includes('Instant cast ready'));
assert.equal(hud.paints,procPaints);assert.equal(hud.slots[0],procSlot,'proc changes preserve the focused or dragged native slot');
controller.sync(readyTwinshot);controller.updateCooldowns(9000);controller.switchPage();controller.updateCooldowns(9100);
assert(hud.slots[1].classList.contains('is-proc-ready'),'switching banks displays the armed proc on the correct Twinshot slot');
assert(!hud.slots[0].classList.contains('is-proc-ready'));
controller.updateCooldowns(10000);
assert(!hud.slots[1].classList.contains('is-proc-ready'),'exact timestamp expiry removes readiness without waiting for another snapshot');
assert(hud.slots[1].querySelector('.hotbar-proc').hidden);
assert.equal(spellCastTimeMs(SPELLS.twinshot,combatStats(readyTwinshot),readyTwinshot.combatTalents,10000),1500);
const renewedTwinshot={...readyTwinshot,combatTalents:{...readyTwinshot.combatTalents,twinshotReadyUntil:20000}};
controller.sync({...renewedTwinshot,hp:0});controller.updateCooldowns(11000);
assert(!hud.slots[1].classList.contains('is-proc-ready'),'death hides stale proc readiness');
controller.sync({...renewedTwinshot,talents:[]});controller.updateCooldowns(11200);
assert(!hud.slots.some(slot=>slot.classList.contains('is-proc-ready')),'removing the capstone cannot leave a proc on an unavailable slot');
rangeTarget=null;

const css=postcss.parse(readFileSync(new URL('../src/hotbar.css',import.meta.url),'utf8')),rules=[];css.walkRules(rule=>rules.push(rule));
const declaration=(selector,property)=>rules.find(rule=>rule.selector===selector)?.nodes.find(node=>node.prop===property)?.value;
assert(declaration('.hotbar-slot.is-proc-ready','box-shadow')?.includes('0 0 0 2px'),'ready Twinshot has a solid surrounding rim');
assert(!declaration('.hotbar-slot.is-proc-ready','animation'),'the readiness cue is steady, including for reduced-motion players');
assert.equal(declaration('.hotbar-slot .hotbar-proc[hidden]','display'),'none');
assert(declaration('#casting-bar','border-image')?.includes('var(--wood-art)'),'cast frame uses existing generated artwork');
assert.equal(declaration('#casting-bar[hidden]','display'),'none');assert.equal(declaration('#casting-bar','pointer-events'),'none');
assert.equal(declaration('.casting-copy','min-width'),'0');assert.equal(declaration('#casting-name','text-overflow'),'ellipsis');
assert.equal(declaration('body:not(.mobile-controls) #play-ui .utility','bottom'),'var(--hud-bottom)','the desktop menu stays anchored to the shared screen-bottom offset');
assert(!rules.some(rule=>rule.selector.includes(':has(#casting-bar:not([hidden])) .utility')),'casting must not move the bottom menu');
console.log('PASS casting UI: authoritative progress and release/cancel/death visibility, accessible labels, all 124 fixed/instant/channel tooltips and selected training entries, healing/shield totals, gear/talent power repaint, authoritative cooldowns, Twinshot proc activation/consumption/expiry/bank changes without repaint, and framed responsive layout.');
