import { bindingLabel } from '../src/keybindings.ts';
import { languagePicker } from '../src/localization.ts';
import { CHAT_LANGUAGES } from '../src/chat-languages.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { STAMINA_MAX, MOUNT_UNLOCK_LEVEL, MOUNTS, mountSpeed, canSprint } from '../src/travel.ts';
import { MAX_LEVEL } from '../src/progression.ts';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const initialPage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(initialPage, /id="app">\s*<div id="boot-loading" role="status">[\s\S]*?Preparing the realm/, 'initial HTML shows loading before JavaScript downloads');
assert.match(initialPage, /#boot-loading\{[^}]*position:fixed;inset:0;[^}]*background:/, 'initial loading covers the empty world without external CSS');
const ui = source('ui.ts'), app = { innerHTML: initialPage };
runInNewContext(stripTypeScriptTypes(ui.slice(ui.indexOf('const creatorColorParts =')).replaceAll('export function', 'function')) + ';mountUI();', {
  document:{querySelectorAll:()=>[]},bindingLabel,languagePicker,CHAT_LANGUAGES,$: id => { if(id==='instance-loading')return {addEventListener(type,listener){assert.equal(type,'cancel');let prevented=false;listener({preventDefault(){prevented=true;}});assert(prevented,'instance loading stays modal until the world is ready');}}; if(id==='character-list')return {insertAdjacentHTML(where,html){assert.equal(where,'beforebegin');assert.match(html,/id="roster-language"/);}}; if(id==='roster-create')return {insertAdjacentHTML(where,html){assert.equal(where,'afterend');assert.match(html,/id="roster-delete"/);}}; assert.equal(id, 'app'); return app; }, icon: () => '', rosterShell: () => '',
});
assert(!app.innerHTML.includes('boot-loading') && app.innerHTML.includes('id="loading"'), 'mounted UI replaces the initial loading screen with realm progress');
const travelTag = app.innerHTML.match(/<div\b[^>]*\bid="travel-hud"[^>]*>/)?.[0];
assert(travelTag && /\shidden(?:\s|>)/.test(travelTag), 'stamina starts hidden before the first player snapshot');
assert.match(app.innerHTML, /<section id="login"[\s\S]*?<img class="login-wordmark" src="\/ui\/wordmark\.png" alt="Mossvale"\/>/, 'the login screen keeps its wordmark');

const css = source('art.css');
const cleanup = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selectors, body]) => selectors.includes('#play-ui .brand') && /\bdisplay\s*:\s*none\s*;/.test(body));
assert(cleanup, 'the requested HUD cleanup has an explicit display:none rule');
const selectors = cleanup[1].split(',').map(selector => selector.trim());
for (const selector of ['.brand', '.realm', '.controls-hint', '.footer-note', '#movement-state', '#target-hud', '#travel-hud button', '#travel-hud[hidden]']) {
  assert(selectors.includes(`#play-ui ${selector}`), `${selector} is hidden only inside the play UI`);
}
assert(selectors.every(selector => selector.startsWith('#play-ui ')), 'the cleanup cannot hide login or character-screen artwork');

// Exercise the shipped renderer without resetting its paint cache between boundary values.
const fields = new Map();
function element(id) {
  if (!fields.has(id)) fields.set(id, { hidden: id === 'travel-hud', style: {}, attributes: {}, dataset: {},
    classList: { toggle() {} }, setAttribute(name, value) { this.attributes[name] = value; }, querySelector(selector) { assert.equal(selector, 'span:last-child', 'mobile HUD changes the label while preserving its icon'); return element(`${id} ${selector}`); } });
  return fields.get(id);
}
let mobileControls = false;
const runtime = { document:{body:{classList:{contains:name=>name==='mobile-controls'&&mobileControls}}},bindingLabel,STAMINA_MAX, MOUNT_UNLOCK_LEVEL, MOUNTS, mountSpeed, canSprint, $: element,
  player: undefined, autoAttackTarget: null, travelHUDKey: '', activeMount: () => null, jump: { grounded: true }, worldInstance: null,
  waterAt: () => false, localSwimming: () => false, position: { x: 0, z: 0 }, isMoving: false, keys: new Set(), connected: true,
  preferredMount: 'horse', panel: { open: false }, selectedId:null, nearbyInteraction:()=>undefined, zoneHandle:undefined, canUseZeppelinDock:point=>point.x<=8 };
const main = source('main.ts');
const xpHUD = stripTypeScriptTypes(main.slice(main.indexOf(' const xpPercent='), main.indexOf(" document.querySelector<HTMLElement>('.hud-job-xp-row')")));
for (const [level, xp, width, label] of [[59, 2950, '50%', '50.0%'], [MAX_LEVEL, 0, '100%', 'MAX'], [MAX_LEVEL, 6000, '100%', 'MAX']]) {
  runInNewContext(xpHUD, { player: { level, xp }, MAX_LEVEL, $: element });
  assert.equal(element('xp-fill').style.width, width);
  assert.equal(element('xp-label').textContent, label);
  assert.equal(element('xp-label').title, `${xp} / ${level * 100} XP`);
  assert.equal(element('level-label').textContent, `Lv. ${level}`);
}
assert.match(main, /<button id="settings-mounts"[^>]*>Your mounts/, 'mount selection remains available in Settings');
assert.match(main, /\$\('settings-mounts'\)\.onclick=openMounts;/, 'the Settings shortcut opens the existing companion selection');
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function updateTravelHUD('), main.indexOf('function openMounts('))), runtime);
runtime.updateTravelHUD();
assert.equal(element('travel-hud').hidden, true, 'waiting for a player keeps the meter hidden');
runtime.player = { level: 1, hp: 100 };
for (const stamina of [undefined, 100, 99.9, 99.1, 99, 98, 0, 99.1, 100]) {
  runtime.player.travel = stamina === undefined ? undefined : { stamina, mount: null, sprinting: false, exhausted: false };
  runtime.updateTravelHUD();
  const value = stamina ?? STAMINA_MAX;
  assert.equal(element('travel-hud').hidden, value > 99, `raw stamina ${stamina} controls visibility, including cached 99.1 → 99`);
  assert.equal(element('stamina-value').textContent, String(Math.round(value)));
  assert.equal(element('stamina-fill').style.width, `${Math.round(value)}%`);
  assert.equal(element('stamina-track').attributes['aria-valuenow'], String(Math.round(value)));
}
mobileControls = true;
for (const [stamina, exhausted, moving, expected] of [[100,false,false,'Ready'],[99,false,false,'Recovering'],[99.1,false,false,'Recovering'],[99.9,false,false,'Ready'],[80,false,false,'Recovering'],[0,true,false,'Exhausted'],[12,true,false,'Recovering'],[25,false,false,'Recovering'],[80,false,true,'Sprinting'],[100,false,false,'Ready']]) {
  runtime.player.travel = {stamina, exhausted, mount:null}; runtime.isMoving = moving; runtime.keys = new Set(moving ? ['shift'] : []); runtime.updateTravelHUD();
  assert.equal(element('travel-hud').hidden, false, 'mobile keeps readiness visible when stamina is full');
  assert.equal(element('stamina-label').textContent, expected, 'state remains readable without color');
}
mobileControls = false; runtime.updateTravelHUD();
assert.equal(element('travel-hud').hidden, true, 'switching back to desktop restores the quiet full-stamina HUD');
runtime.autoAttackTarget = 'foe'; runtime.player.travel.mount = 'horse'; runtime.updateTravelHUD();
assert.equal(element('mobile-attack').attributes['aria-pressed'], 'true');
assert.equal(element('mobile-attack span:last-child').textContent, 'Stop');
assert.equal(element('mobile-mount span:last-child').textContent, 'Dismount');
runtime.autoAttackTarget = null; runtime.player.travel.mount = null; runtime.updateTravelHUD();
assert.equal(element('mobile-attack span:last-child').textContent, 'Attack');
assert.equal(element('mobile-mount span:last-child').textContent, 'Mount');
runtime.nearbyInteraction=()=>({kind:'loot',id:'loot',x:2,z:0,label:'Loot remains'}); runtime.updateTravelHUD();
assert.equal(element('mobile-interact').hidden,false); assert.equal(element('mobile-interact span:last-child').textContent,'Loot');
runtime.nearbyInteraction=()=>({kind:'node',id:'node',x:4,z:0,label:'Gather'}); runtime.updateTravelHUD();
assert.equal(element('mobile-interact').hidden,true,'contextual Use hides out of range');
runtime.nearbyInteraction=()=>({kind:'enemy',id:'enemy',x:1,z:0,label:'Attack'}); runtime.updateTravelHUD();
assert.equal(element('mobile-interact').hidden,true,'Attack is not duplicated as Use');
runtime.nearbyInteraction=()=>({kind:'zeppelin',id:'zeppelin',x:7,z:0,label:'Travel'}); runtime.updateTravelHUD();
assert.equal(element('mobile-interact').hidden,false,'dock action uses its existing eight-metre interaction range');
console.log('PASS: level-cap XP display, scoped HUD cleanup, preserved login logo, initially hidden stamina, raw 99% visibility boundary and recovery without stale cached output.');
