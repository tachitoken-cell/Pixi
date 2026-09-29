import * as THREE from 'three';
import { makeCharacter } from '../src/characters.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import { TALENTS, canLearnTalent } from '../src/progression.ts';
import { TALENT_EFFECT_IDS } from '../src/spells.ts';
import { normalizeAppearance } from '../src/appearance.ts';
import { characterNameError } from '../src/character-name.ts';
import { hostingConfig } from '../src/hosting-client.ts';
import { realmIdValid } from '../src/hosting-realms.ts';

for (const name of ['Dan', 'Icey', 'Magma', 'Devin', 'Devon', 'Modric', 'Model', ' Ad_venturer-2 ']) assert.equal(characterNameError(name), null, name);
for (const name of [undefined, null, 42, ['Dan'], {}, '', 'A', 'X'.repeat(21), '<Dan>', 'Ad\u0000min', 'Ad\u200bmin', '\u0410dmin']) assert(characterNameError(name), `${JSON.stringify(name)} is invalid input`);

const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { renderCharacterList, rosterShell } = await import('../src/roster-ui.ts');
const { partyHUD } = await import('../src/adventure-ui.ts');
hook.deregister();
const emptyRoster = rosterShell();
assert(emptyRoster.includes('id="roster-enter" class="primary-button" disabled'), 'an empty roster cannot enter the world');
assert(emptyRoster.includes('id="roster-preview-mount"'), 'the roster hosts the shared character preview');
const rosterHtml = renderCharacterList([
  { id: 'ranger', name: '<Ember & Ash>', level: 2, appearance: { className: 'Ranger' } },
  { id: 'mage', name: 'Nova', level: 7, appearance: { className: 'Mage' } },
], 'mage');
assert(rosterHtml.includes('&lt;Ember &amp; Ash&gt;') && !rosterHtml.includes('<Ember'), 'roster names cannot introduce markup');
assert.equal((rosterHtml.match(/aria-pressed="true"/g) || []).length, 1, 'the roster has exactly one selected character');
assert(rosterHtml.includes('data-character-id="mage" aria-pressed="true"') && rosterHtml.includes('Level 7 · Mage'));

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
function section(start, end) {
  const from = main.indexOf(start), to = main.indexOf(end, from);
  assert(from >= 0 && to > from);
  return main.slice(from, to);
}
const elements = new Map();
let focus = '', lastPreview, lastPreviewArgument;
function element(id) {
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, validity: '',
    attributes:{},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},addEventListener() {}, querySelector() { return null; }, setCustomValidity(message) { this.validity = message; }, reportValidity() {}, focus() { focus = id; }, append(child) { child.mount = id; } });
  return elements.get(id);
}
function dialog() {
  return { open: false, dataset: {}, events: {}, close() { this.open = false; }, showModal() { this.open = true; }, addEventListener(type, callback) { this.events[type] = callback; }, getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }) };
}
const sent = [], classes = new Set(), cards = new Map();
const appearance = { className: 'Ranger', skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a' };
const hero = (id, className = 'Ranger') => ({ id, name: id, level: 1, zone: 'greenwood', characterCreated: true, appearance: { ...appearance, className } });
const context = {
  setActiveHostingRealm() {},
  resetInstantCombat() {},
  worldLoading: false, zoneRevision: 0, setWorldLoading() {},
  editingMobileLayout: false, specialistNftUI: undefined,
  icon:()=>'',resizePreview(){},hostingConfig, realmIdValid, mobileOverlayOpen:()=>false, floatingPanel:()=>false, activeRealmId: 'eu', updateSelection: null, changingRealm: false,
  characterDeletion:null,realmAvailable:true,realmOutageMessage:'',
  entryActive: false, rosterActive: true, rosterCharacters: [], selectedCharacterId: null, enteredCharacterId: undefined,
  creatingCharacter: false, maxCharacters: 6, player: undefined, connected: true, authEnabled: false, previewRotation: Math.PI,
  socket: { readyState: 1 }, WebSocket: { OPEN: 1 }, appearance, playerName: 'Wanderer', normalizeAppearance, characterNameError, creatorColor: 'hair',
  heldKeyCodes:new Map(),keys: new Set(['w']), waypoint: { x: 30, z: 20, label: 'Previous objective', instanceId: null },
  position: { x: 0, z: 0 }, yaw: 0, elapsed:0, groundWaypoint:{update(){}}, waypointIndicator: { update: point => { context.visibleWaypoint = point; } },
  party: { id: 'previous-party', members: [] }, partyInvites: [{ id: 'previous-invite' }], dungeon: { id: 'previous-dungeon' },
  lastPartyHUD: 'Previous character party', partyHUD,
  customizer: dialog(), panel: dialog(), canvas: { focus() {} },
  document: {
    body: { classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) } },
    querySelectorAll: selector => selector === '[data-character-id]' ? context.rosterCharacters.map(character => {
      if (!cards.has(character.id)) cards.set(character.id, { dataset: { characterId: character.id }, focus() { focus = character.id; } });
      return cards.get(character.id);
    }) : [],
    querySelector: selector => selector === '.customizer-art' ? element('customizer-art') : cards.get(selector.match(/data-character-id="([^"]+)"/)?.[1]),
  },
  $: element, toast() {}, drawChoices() {}, updatePreview: chosen => { lastPreviewArgument = chosen; lastPreview = chosen === null ? null : chosen?.id || 'draft'; }, requestAnimationFrame: callback => callback(),
  disposeMinimap() {}, clearSocialUI() {}, clearEntityViews() {}, cancelGathering() {}, leaveAccount() {}, saveLocal() {}, renderCharacterList, getZone: () => ({ name: 'Greenwood' }), send: message => sent.push(message),
};
const source = section('const modalOpen =', '\nconst canvas =')
  + section('function realmHasSpace(', 'async function switchHostingRealm(')
  + section('function clearWaypoint(', 'function setWaypoint(')
  + section('function updatePartyHUD()', 'function openDungeon(')
  + section('function showCharacterRoster(', 'async function openAccountFlow(')
  + section('let creatorStep=0;', 'function drawChoices(')
  + section('function closeCustomizer(', "$('creator-selectors').onclick=")
  + section('for(const dialog of [panel,customizer])', "$('hotbar-customize').onclick=")
  + '\nglobalThis.isModalOpen = modalOpen;';
runInNewContext(main.match(/^function clearMovementKeys.*$/m)[0],context);
runInNewContext(stripTypeScriptTypes(source), context);
element('party-hud').innerHTML = context.lastPartyHUD;
context.showCharacterRoster({ characters: [], maxCharacters: 6 });
assert(context.isModalOpen(), 'account authentication alone cannot unlock gameplay');
assert.equal(context.player, undefined); assert.equal(context.enteredCharacterId, undefined);
assert(element('play-ui').inert && element('roster-enter').disabled && !element('roster-create').disabled);
assert.equal(element('character-preview').mount, 'roster-preview-mount');
assert.equal(element('character-preview').hidden, false, 'an empty account keeps the live 3D stage visible');
assert.equal(lastPreview, null, 'an empty roster clears any preview avatar instead of showing a draft');
assert.equal(context.previewRotation, 0);
assert(element('roster-turn-left').disabled && element('roster-turn-right').disabled, 'an empty stage has no character to rotate');
assert.equal(context.keys.size, 0); assert.equal(context.waypoint, null); assert.equal(context.visibleWaypoint, null, 'the roster clears the previous character waypoint and its indicator');
assert.equal(context.party, null); assert.equal(context.partyInvites.length, 0); assert.equal(context.dungeon, null);
assert(element('party-hud').hidden && element('party-hud').innerHTML === '', 'the roster clears the previous character party, invitations, dungeon and visible party HUD');
context.previewRotation = Math.PI;
context.openCustomizer();
assert(context.customizer.open); assert.equal(element('character-name').value, '', 'new characters start with a fresh name');
assert.equal(element('character-preview').mount, 'customizer-art', 'creator reuses the preview canvas');
assert.equal(lastPreview, 'draft'); assert.equal(lastPreviewArgument, undefined);
assert.equal(context.previewRotation, 0, 'opening the creator resets the preview heading');
assert.equal(context.draft.race, 'human'); assert.equal(context.draft.gender, 'male'); assert.equal(context.draft.face, 'bright', 'legacy appearances receive shared creator defaults');
context.draft.className = 'Knight'; element('character-name').value = 'New Hero';
context.previewRotation = Math.PI / 2;
let prevented = false;
context.customizer.events.cancel({ preventDefault: () => prevented = true });
assert(prevented && !context.customizer.open && context.isModalOpen(), 'Escape cancels creation into the roster, never the world');
assert.equal(context.player, undefined); assert.equal(element('character-preview').mount, 'roster-preview-mount');
assert.equal(lastPreview, null, 'canceling a draft into an empty account clears the draft avatar');
assert.equal(element('character-preview').hidden, false); assert.equal(context.previewRotation, 0);
context.openCustomizer(); context.draft.className = 'Knight'; element('character-name').value = 'New Hero';
assert(element('character-name').disabled && element('create-character').hidden,'hidden name cannot block early step navigation');
element('character-form').onsubmit({preventDefault(){}});
assert.equal(sent.length,0,'Enter on Class advances the step without creating');
assert(!element('creator-page-1').hidden && element('creator-page-0').hidden);
for(const step of [2,3,1,0,3]){
 context.showCreatorStep(step);
 assert.equal(element('character-name').value,'New Hero','back and forward keep the chosen name');
 assert.equal(context.draft.className,'Knight','back and forward keep the chosen class');
 assert.equal([0,1,2,3].filter(i=>!element(`creator-page-${i}`).hidden).length,1,'only the current step is available');
 assert.equal(element(`creator-step-${step}`).attributes['aria-current'],'step');
}
assert(!element('character-name').disabled && !element('create-character').hidden && element('creator-next').hidden);
context.showCreatorStep(-1);context.showCreatorStep(4);assert(!element('creator-page-3').hidden,'invalid steps cannot blank the creator');
element('character-form').onsubmit({ preventDefault() {} });
assert.equal(sent.length, 1); assert.equal(sent[0].type, 'createCharacter'); assert.equal(sent[0].name, 'New Hero'); assert.equal(sent[0].appearance.className, 'Knight');
assert.equal(context.player, undefined); assert.equal(context.appearance.className, 'Ranger', 'submission does not mutate an existing character');
assert(context.customizer.open && context.creatingCharacter && element('create-character').disabled);
context.showCreatorStep(0);assert(!element('creator-page-3').hidden,'pending submission cannot be edited by navigating away');
context.closeCustomizer();
assert(context.customizer.open, 'pending creation waits for confirmation before closing');
element('character-form').onsubmit({ preventDefault() {} });
assert.equal(sent.length, 1, 'repeated submission cannot create duplicate characters');
context.connected = false;
element('character-form').onsubmit({ preventDefault() {} });
assert.equal(sent.length, 1);
context.connected = true; context.showCharacterRoster({ characters: [], maxCharacters: 6 });
assert(context.customizer.open && !context.creatingCharacter && !element('create-character').disabled, 'reconnect without a new character makes the draft retryable');
assert.equal(context.draft.className, 'Knight'); assert.equal(element('character-name').value, 'New Hero');
assert.equal(element('character-preview').mount, 'customizer-art', 'reconnect preserves the visible draft preview');
const first = hero('first', 'Knight'), second = hero('second', 'Mage');
context.showCharacterRoster({ characters: [first], maxCharacters: 6 });
assert(!context.customizer.open && context.isModalOpen(), 'successful creation returns to selection without entering the world');
assert.equal(context.selectedCharacterId, first.id); assert.equal(context.player, undefined); assert.equal(lastPreview, first.id);
assert.equal(lastPreviewArgument, first, 'the roster previews the shared saved character, not the creator draft');
assert(!element('roster-turn-left').disabled && !element('roster-turn-right').disabled);
element('roster-turn-left').onclick(); assert.equal(context.previewRotation, -Math.PI / 4);
element('roster-turn-right').onclick(); assert.equal(context.previewRotation, 0);
element('roster-turn-right').onclick(); assert.equal(context.previewRotation, Math.PI / 4);
element('roster-enter').onclick();
assert.equal(sent.at(-1).type, 'selectCharacter'); assert.equal(sent.at(-1).characterId, first.id);
assert(context.rosterActive && !context.player && !context.enteredCharacterId && element('roster-enter').disabled, 'Enter world waits for selected-character welcome');
context.showCharacterRoster({ characters: [first, second], maxCharacters: 6 });
assert.equal(context.selectedCharacterId, second.id, 'a newly created character is selected');
assert.equal(lastPreviewArgument, second); assert.equal(lastPreviewArgument.appearance.className, 'Mage');
assert.equal(context.previewRotation, 0, 'restoring the roster resets the preview heading');
element('roster-turn-left').onclick();
cards.get(first.id).onclick();
assert.equal(context.selectedCharacterId, first.id); assert.equal(lastPreview, first.id); assert.equal(focus, first.id);
assert.equal(lastPreviewArgument.appearance, first.appearance, 'switching characters uses the selected saved appearance');
assert.equal(context.previewRotation, 0, 'switching characters resets the preview heading');
context.openCustomizer(); assert(!element('creator-page-0').hidden,'a fresh character starts on Class');context.showCreatorStep(3);element('character-name').value = '<bad>';
const beforeInvalid = sent.length;
element('character-form').onsubmit({ preventDefault() {} });
assert.equal(sent.length, beforeInvalid, 'invalid permanent names cannot be submitted');
for (const name of ['Admin', 'gM', 'Game Master', 'Owner42', 'a_d_m_i_n', '4dm1n', 'AdminDan', 'ModeratorDan', 'G_M_Dan', 'DevDan', 'Dan Admin']) {
  element('character-name').value = name;
  element('character-form').onsubmit({ preventDefault() {} });
  assert.equal(sent.length, beforeInvalid, `${name} never sends a character creation request`);
  assert.equal(element('character-name').validity, 'Choose an adventurer name without staff titles such as Admin, GM or Owner.');
  assert.equal(element('creation-error').textContent, element('character-name').validity, 'staff-title guidance is visibly shown beside the form');
  assert.equal(context.creatingCharacter, false, 'a rejected name leaves the draft editable');
}
element('character-name').value = 'Magma';
element('character-name').oninput({ target: element('character-name') });
assert.equal(element('character-name').validity, '');
assert.equal(element('creation-error').textContent, '', 'editing the name clears rejected-name feedback');
context.closeCustomizer();
context.player = second; context.enteredCharacterId = second.id; context.rosterActive = false;
context.openCustomizer();
assert(!context.customizer.open, 'world character controls cannot reopen identity creation');
context.waypoint = { x: 30, z: 20, label: 'Mage objective', instanceId: null }; context.keys.add('w');
context.returnToCharacters();
assert.equal(sent.at(-1).type, 'leaveWorld'); assert.equal(context.enteredCharacterId, undefined, 'a disconnect while leaving world must reconnect to the roster');
assert.equal(context.waypoint, null); assert.equal(context.visibleWaypoint, null); assert.equal(context.keys.size, 0, 'leaving a character clears navigation and held movement before the roster response');
context.showCharacterRoster({ characters: [first, second], maxCharacters: 6 });
assert.equal(context.player, undefined); assert.equal(context.selectedCharacterId, second.id); assert(context.isModalOpen());
const six = Array.from({ length: 6 }, (_, index) => hero(`hero-${index}`));
context.showCharacterRoster({ characters: six, maxCharacters: 6 });
assert(element('roster-create').disabled); context.openCustomizer(); assert(!context.customizer.open, 'full rosters cannot begin another character');
const fullHtml = renderCharacterList(six, six[2].id);
assert.equal((fullHtml.match(/data-character-id=/g) || []).length, 6); assert.equal((fullHtml.match(/aria-pressed="true"/g) || []).length, 1);

// Run the real avatar replacement branch with an initialized renderer; no WebGL is needed.
const removed = [], made = [], added = [];
let resized = 0;
const oldPreview = {}, draftAppearance = { ...appearance, className: 'Knight' };
const previewContext = {
  THREE, $: element, previewRenderer: {}, previewCharacter: oldPreview, draft: draftAppearance,
  previewScene: { add: mesh => added.push(mesh) }, removeRig: mesh => removed.push(mesh),
  makeCharacter: (look, equipment) => { const mesh = makeCharacter(look,equipment); Object.assign(mesh,{look,equipment}); made.push(mesh); return mesh; },
  resizePreview: () => resized++,
};
runInNewContext(stripTypeScriptTypes(section('function updatePreview(', 'function resizePreview(')), previewContext);
previewContext.updatePreview(null);
assert.deepEqual(removed, [oldPreview]); assert.equal(previewContext.previewCharacter, undefined);
assert.equal(made.length, 0); assert.equal(added.length, 0); assert.equal(resized, 1, 'an empty stage still resizes the scene');
const savedPreview = { ...second, equipment: { weapon: 'mage-staff', armor: 'mage-robes', charm: null } };
previewContext.updatePreview(savedPreview);
assert.equal(made[0].look, savedPreview.appearance); assert.equal(made[0].equipment, savedPreview.equipment);
assert.equal(added[0], previewContext.previewCharacter);
previewContext.updatePreview();
assert.equal(removed[1], made[0]); assert.equal(made[1].look, draftAppearance); assert.equal(made[1].equipment, undefined);
assert.equal(added[1], previewContext.previewCharacter); assert.equal(resized, 3);

const sameTierAugments = new Map([
  [TALENT_EFFECT_IDS.twinshotMomentum, TALENT_EFFECT_IDS.twinshot],
  [TALENT_EFFECT_IDS.lingeringVenom, TALENT_EFFECT_IDS.venom],
  [TALENT_EFFECT_IDS.arcaneEchoChance, TALENT_EFFECT_IDS.arcaneEcho],
  [TALENT_EFFECT_IDS.periodicBurning, TALENT_EFFECT_IDS.burning],
  [TALENT_EFFECT_IDS.deepChill, TALENT_EFFECT_IDS.chilled],
  [TALENT_EFFECT_IDS.everlastingBond, TALENT_EFFECT_IDS.beastmaster],
  [TALENT_EFFECT_IDS.fineCuts, TALENT_EFFECT_IDS.wideSwing],
  [TALENT_EFFECT_IDS.holdTheLine, TALENT_EFFECT_IDS.guard],
  [TALENT_EFFECT_IDS.intoTheFray, TALENT_EFFECT_IDS.courageousCall],
]);
const sameTierColumns = new Map([
  [TALENT_EFFECT_IDS.twinshotMomentum, [2, 1]],
  [TALENT_EFFECT_IDS.lingeringVenom, [1, 2]],
  [TALENT_EFFECT_IDS.arcaneEchoChance, [1, 0]],
  [TALENT_EFFECT_IDS.periodicBurning, [1, 0]],
  [TALENT_EFFECT_IDS.deepChill, [1, 0]],
  [TALENT_EFFECT_IDS.everlastingBond, [2, 1]],
  [TALENT_EFFECT_IDS.fineCuts, [0, 1]],
  [TALENT_EFFECT_IDS.holdTheLine, [2, 1]],
  [TALENT_EFFECT_IDS.intoTheFray, [0, 1]],
]);
const sameTierLegacy = new Map([['knight-3', 'knight-2'], ['knight-6', 'knight-5']]);
const signatureIds = new Set(sameTierAugments.values()), checkedAugments = new Set();
for (const className of ['Ranger', 'Knight', 'Mage']) {
  const talents = Object.values(TALENTS).filter(t => t.className === className);
  const branches = [...new Set(talents.map(t => t.branch))];
  assert.equal(branches.length, 3);
  for (const branch of branches) {
    const nodes = talents.filter(t => t.branch === branch);
    assert.equal(nodes.length, className === 'Knight' || className === 'Ranger' && branch === 'Beastmaster' ? 11 : 10);
    assert.deepEqual([...new Set(nodes.map(t => t.row))].sort(), [0, 1, 2, 3, 4]);
    assert.equal(new Set(nodes.map(t => `${t.row},${t.column}`)).size, nodes.length);
    assert(nodes.some(t => t.maxRank > 1), 'every branch has ranked choices');
    for (const node of nodes) if (node.prerequisite) {
      const previous = TALENTS[node.prerequisite];
      assert.equal(previous.branch, branch); assert.equal(previous.className, className);
      if (sameTierAugments.has(node.id)) {
        assert.equal(previous.id, sameTierAugments.get(node.id), 'each signature augment requires its own signature');
        assert.equal(previous.row, 2); assert.equal(node.row, 2, 'signature augments deliberately share their signature tier');
        assert.deepEqual([previous.column, node.column], sameTierColumns.get(node.id), 'same-tier links retain their imported positions');
        assert.equal(previous.maxRank, 1); assert.equal(node.maxRank, 2); assert.equal(node.prerequisiteRank, 1);
        checkedAugments.add(node.id);
      } else if (sameTierLegacy.has(node.id)) {
        assert.equal(previous.id, sameTierLegacy.get(node.id));
        assert.equal(previous.row, 1); assert.equal(node.row, 1, 'Knight workshop moves the retained center path to the second tier');
        assert.deepEqual([previous.column, node.column], [2, 1]);
        assert.equal(previous.maxRank, 1); assert.equal(node.maxRank, node.id === 'knight-3' ? 2 : 1); assert.equal(node.prerequisiteRank, 1);
      } else assert(previous.row < node.row, `${node.id} must follow an earlier tier`);
      assert(node.prerequisiteRank >= 1 && node.prerequisiteRank <= previous.maxRank);
      const ancestors = new Set([node.id]);
      for (let ancestor = previous; ancestor; ancestor = TALENTS[ancestor.prerequisite]) {
        assert(!ancestors.has(ancestor.id), `${node.id} has no prerequisite cycle`); ancestors.add(ancestor.id);
      }
    }
  }
  for (const firstId of [1, 4]) {
    const path = (className === 'Ranger' && firstId === 4 ? [0, 1] : [0, 1, 2]).map(offset => TALENTS[`${className.toLowerCase()}-${firstId + offset}`]);
    assert.equal(path[0].prerequisite, null);
    const player = { appearance: { className }, level: 7, talents: [] };
    assert(!canLearnTalent(player, path.at(-1).id), 'high level alone does not bypass a branch prerequisite');
    for (let i = 0; i < path.length; i++) {
      assert.equal(path[i].maxRank, path[i].id === 'knight-3' ? 2 : 1, 'retained center paths include the authored two-rank Sunbreaker');
      assert.equal(path[i].prerequisite, i ? path[i - 1].id : null, 'each legacy path retains its preceding node');
      player.level = Math.max(7, path[i].requiredLevel, 1 + 3 * path[i].requiredBranchPoints);
      if (signatureIds.has(path[i].id)) {
        assert.equal(path[i].requiredLevel, 16); assert.equal(path[i].requiredBranchPoints, ['ranger-3', 'mage-6'].includes(path[i].id) ? 6 : 5);
      }
      if (player.talents.length < path[i].requiredBranchPoints) assert(!canLearnTalent(player, path[i].id), 'the path retains its current branch-point gate');
      while (player.talents.length < path[i].requiredBranchPoints) {
        const entry = talents.find(t => t.branch === path[i].branch && !path.includes(t) && canLearnTalent(player, t.id));
        assert(entry, 'each legacy path has reachable choices for its current branch-point requirement'); player.talents.push(entry.id);
      }
      if (signatureIds.has(path[i].id)) assert(!canLearnTalent({ ...player, level: 15 }, path[i].id), 'branch points do not bypass the signature level requirement');
      for (let rank = 0; rank < path[i].maxRank; rank++) {
        player.level = Math.max(player.level, 1 + 3 * player.talents.length);
        assert(canLearnTalent(player, path[i].id)); player.talents.push(path[i].id);
      }
      assert(!canLearnTalent({ ...player, level: 60 }, path[i].id), 'spare talent points cannot exceed the authored maximum rank');
    }
  }
}
assert.deepEqual(checkedAugments, new Set(sameTierAugments.keys()), 'all signature and Beastmaster augment paths are checked');
console.log('PASS: account roster/creator guards, party/invitation/dungeon cleanup, draft recovery, append/select confirmation, character switching, six slots, escaped names, empty 3D stage, saved preview identity, rotation, nine ranked branches, acyclic prerequisites, nine same-tier augments and retained legacy paths with current unlock gates.');
