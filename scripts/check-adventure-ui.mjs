import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { onboardingFeatureUnlocked, onboardingLockReason } from '../src/onboarding.ts';
import { ROOTVAULT_GUARDIAN, ROOTVAULT_ENTRANCE, DUNGEON_EXIT, getDungeon } from '../src/dungeon.ts';

// Execute the shipped renderers with native TypeScript loading, without a DOM substitute.
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { renderContracts: renderContractPage, renderCrafting, partyHUD } = await import('../src/adventure-ui.ts');
const { CONTRACTS, RECIPES, newContracts, craftingXpGain } = await import('../src/adventure.ts');
const { starterGear } = await import('../src/progression.ts');
const { renderSkills, renderProfessionGuide } = await import('../src/skills-ui.ts');
const { gatheringXpGain, MAX_SKILL_XP, SKILLS, RESOURCE_TYPES, skillProgress } = await import('../src/skills.ts');
const { LOOT_ITEMS } = await import('../src/loot-items.ts');
hook.deregister();

// Preserve all regional/action coverage while the shipped board shows three notices per page.
const renderContracts=(player,zone,nearBoard,now)=>Array.from({length:Math.max(1,Math.ceil(CONTRACTS.filter(contract=>contract.zone===zone||Object.hasOwn(player.contracts.active,contract.id)).length/3))},(_,page)=>renderContractPage(player,zone,nearBoard,now,page)).join('');

const action = (html, name, id) => {
  const button = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`data-${name}="${id}"`));
  assert(button, `Missing ${name} action for ${id}`);
  return button;
};
const disabled = tag => /\sdisabled(?:\s|=|>)/.test(tag);
const hero = (className = 'Ranger') => ({ id: 'hero', name: 'Rowan', appearance: { className }, level: 3, hp: 100, maxHp: 100,
  characterCreated: true, zone: 'greenwood', x: 0, z: 0, instanceId: null, inventory: { wood: 20, crystal: 20, herb: 20, potion: 0, relic: 2 },
  craftingXp: 37, contracts: newContracts(), ...starterGear(className) });
const now = 1_000_000;
const player = hero();
for (const zone of ['greenwood', 'amberwild', 'frostmarch', 'hollow', 'sunveil', 'mistwood']) {
  const offered = CONTRACTS.filter(contract => contract.zone === zone);
  const eligible = { ...player, level: 60 };
  const html = renderContracts(eligible, zone, true, now);
  assert.equal((html.match(/data-accept-contract=/g) || []).length, offered.length, 'each board offers only its regional contracts');
  for (const contract of offered) {
    assert(!disabled(action(html, 'accept-contract', contract.id)));
    if (contract.requiredLevel) assert(disabled(action(renderContracts({ ...player, level: contract.requiredLevel - 1 }, zone, true, now), 'accept-contract', contract.id)), 'under-level adventurers see a locked regional contract');
    assert(disabled(action(renderContracts(player, zone, false, now), 'accept-contract', contract.id)), 'quests cannot be accepted away from the board');
    assert(html.includes(`${contract.reward.xp} XP · ${contract.reward.gold} gold`));
  }
  assert(renderContracts(player, zone, false, now).includes(`data-find-board="${zone}"`));
}
const hunt = CONTRACTS.find(contract => contract.id === 'greenwood-hunt');
player.contracts.active[hunt.id] = 1;
let html = renderContracts(player, 'greenwood', true, now);
assert(html.includes(`1 / ${hunt.count}`));
assert(!html.includes(`data-accept-contract="${hunt.id}"`) && !html.includes(`data-claim-contract="${hunt.id}"`), 'incomplete active contracts have no accept or reward action');
player.contracts.active[hunt.id] = hunt.count;
assert(!disabled(action(renderContracts(player, 'greenwood', true, now), 'claim-contract', hunt.id)));
assert(disabled(action(renderContracts(player, 'greenwood', false, now), 'claim-contract', hunt.id)));
html = renderContracts(player, 'amberwild', true, now);
assert(disabled(action(html, 'claim-contract', hunt.id)), 'a foreign board cannot claim the completed quest');
assert(html.includes('data-find-board="greenwood"'), 'a tracked foreign quest points back to its actual board');
player.contracts.active = { 'greenwood-hunt': 4, 'amberwild-hunt': 0, 'frostmarch-hunt': 0 };
html = renderContracts(player, 'greenwood', true, now);
assert(disabled(action(html, 'accept-contract', 'greenwood-herbs')), 'three active quests disable additional acceptance');
assert(!disabled(action(html, 'claim-contract', hunt.id)), 'a full journal still permits claiming an earned reward');
player.contracts = newContracts(); player.contracts.completed[hunt.id] = now + 60_001;
html = renderContracts(player, 'greenwood', true, now);
assert(disabled(action(html, 'accept-contract', hunt.id)) && html.includes('Returns in 2m'));
assert(!disabled(action(renderContracts(player, 'greenwood', true, now + 60_001), 'accept-contract', hunt.id)), 'repeatable quests reopen at the exact cooldown boundary');

for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  for (const recipe of RECIPES) {
    const crafter = { ...hero(className), level: Math.max(recipe.requiredLevel, 3), craftingXp: 50 * (recipe.requiredCraftingLevel - 1) ** 2,
      inventory: { wood: 100, crystal: 100, herb: 100, potion: 0, relic: 5 }, carriedItems: { 'gnarled-bark': 20, 'frost-shard': 20 } };
    let view = renderCrafting(crafter, true);
    if (recipe.className && recipe.className !== className) {
      assert(!view.includes(`data-craft="${recipe.id}"`), 'another class cannot craft unusable gear');
      continue;
    }
    assert(!disabled(action(view, 'craft', recipe.id)), `${className} can craft ${recipe.id} with its materials and level`);
    assert(disabled(action(renderCrafting(crafter, false), 'craft', recipe.id)), 'crafting requires the workshop');
    assert(renderCrafting(crafter, false).includes('data-find-workshop'));
    for (const [material, quantity] of Object.entries(recipe.cost)) {
      const saved = crafter.inventory[material]; crafter.inventory[material] = quantity - 1;
      view = renderCrafting(crafter, true);
      assert(disabled(action(view, 'craft', recipe.id)), `${recipe.id} requires enough ${material}`);
      assert(view.includes(`<strong>${quantity - 1} / ${quantity}</strong>`), 'the ingredient shows owned and required quantities');
      if (['wood', 'crystal', 'herb'].includes(material)) assert(view.includes(`data-find-material="${material}"`), 'missing gathered ingredients offer a route');
      crafter.inventory[material] = saved;
    }
    for (const [material, quantity] of Object.entries(recipe.itemCost || {})) {
      const saved = crafter.carriedItems[material]; crafter.carriedItems[material] = quantity - 1;
      assert(disabled(action(renderCrafting(crafter, true), 'craft', recipe.id)), 'refinement requires carried loot');
      crafter.carriedItems[material] = saved;
    }
    if (recipe.requiredCraftingLevel > 1) {
      crafter.craftingXp -= 1;
      const locked = renderCrafting(crafter, true);
      assert(disabled(action(locked, 'craft', recipe.id)), 'adventure level and materials cannot bypass crafting rank');
      assert(locked.includes(`Reach crafting level ${recipe.requiredCraftingLevel}`), 'a locked recipe explains the exact skill requirement');
      crafter.craftingXp += 1;
    }
    assert(view.includes(`+${craftingXpGain(recipe, crafter.craftingXp)} crafting XP`), 'recipe XP matches the authoritative reward');
    crafter.level = recipe.requiredLevel - 1;
    assert(disabled(action(renderCrafting(crafter, true), 'craft', recipe.id)), 'materials do not bypass level requirements');
    crafter.level = recipe.requiredLevel;
    if (recipe.output.gear) {
      crafter.ownedGear.push(recipe.output.gear);
      assert(disabled(action(renderCrafting(crafter, true), 'craft', recipe.id)), 'owned equipment cannot consume materials again');
    } else {
      if (recipe.output.item) crafter.carriedItems[recipe.output.item] = Number.MAX_SAFE_INTEGER;
      else crafter.inventory[recipe.output.resource] = Number.MAX_SAFE_INTEGER;
      assert(disabled(action(renderCrafting(crafter, true), 'craft', recipe.id)), 'the output must fit its server inventory counter');
    }
  }
}
assert(renderCrafting(hero(), true).includes('Crafting experience: 37'));
const novice = { ...hero(), skills: { mining: 0, woodcutting: 0, herbalism: 0, fishing: 0 } };
const fullBags = { ...hero(), carriedItems: Object.fromEntries(Object.keys(LOOT_ITEMS).slice(0, 12).map(id => [id, 1])) };
const fullView = renderCrafting(fullBags, true);
assert(disabled(action(fullView, 'craft', 'trail-tonic')) && fullView.includes('Make room in your inventory for this output'), 'full bags disable a new output stack with an actionable reason');
fullBags.inventory.herb = 2; fullBags.inventory.crystal = 1;
assert(!disabled(action(renderCrafting(fullBags, true), 'craft', 'trail-tonic')), 'ingredients consumed by the recipe can free the output slot');

let professions = renderSkills(novice);
for (const kind of ['crystal', 'timber', 'herb', 'brook-shoal']) {
  assert(!disabled(action(professions, 'resource-kind', kind)), 'starter resources are visible and routable');
  assert(professions.includes(`${gatheringXpGain(kind, 0)} XP per gather`));
}
for (const kind of ['copper-vein', 'ironwood', 'sunblossom', 'silver-shoal']) assert(disabled(action(professions, 'resource-kind', kind)), 'locked resources cannot set a gathering target');
assert.equal((professions.match(/data-resource-kind=/g)||[]).length, 16, 'each gathering profession shows all four ranks');
const journeyman = { ...novice, craftingXp: 4050, skills: { mining: 4050, woodcutting: 4050, herbalism: 4050, fishing: 4050 } };
professions = renderSkills(journeyman);
assert(!disabled(action(professions, 'resource-kind', 'copper-vein')));
assert(professions.includes('0 XP per gather') && professions.includes('Next: Expert at 25.'), 'mastered starter nodes are honest about XP and the next rank is visible');
const maximum = { ...novice, craftingXp: MAX_SKILL_XP, skills: { mining: MAX_SKILL_XP, woodcutting: MAX_SKILL_XP, herbalism: MAX_SKILL_XP, fishing: MAX_SKILL_XP } };
assert(renderSkills(maximum).includes('Every resource unlocked. Your craft is mastered.'));
for (const [subject, expectedLevel] of [[novice, 1], [maximum, skillProgress(MAX_SKILL_XP).level]]) {
  const overview = renderSkills(subject);
  assert.equal((overview.match(new RegExp(`class="profession-level">[^<]*Level ${expectedLevel} / 99`, 'g')) || []).length, Object.keys(SKILLS).length, 'overview exposes current / maximum levels');
  for (const id of Object.keys(SKILLS)) {
    assert(!disabled(action(overview, 'profession-guide', id)), 'guides are accessible at every profession level');
    const guide = renderProfessionGuide(subject, id);
    assert(guide.includes('data-profession-back') && guide.includes('data-open-crafting'));
    assert(guide.includes(`Level ${expectedLevel} / 99`) && guide.includes('How to train') && guide.includes('Resources and locations'));
    for (const [kind, resource] of Object.entries(RESOURCE_TYPES)) {
      if (resource.skill !== id) { assert(!guide.includes(`data-resource-kind="${kind}"`)); continue; }
      assert.equal(disabled(action(guide, 'resource-kind', kind)), resource.requiredLevel > expectedLevel, 'guide waypoint eligibility uses the profession level');
      assert(guide.includes(`${resource.yield} ${resource.item ? LOOT_ITEMS[resource.item].label : resource.reward} per gather`));
      if(resource.item) assert(guide.includes(`Restores ${LOOT_ITEMS[resource.item].heal} health out of combat · Sells for ${LOOT_ITEMS[resource.item].sellPrice} gold`));
    }
    assert(guide.includes('Glimmerwood') || guide.includes('Amberwild'), 'guide names source-backed gathering regions');
    if(id === 'fishing') assert(guide.includes('Using your catch') && guide.includes('Your rod is supplied') && !guide.includes('Craft with your materials'), 'Fishing explains eating and selling catches without inventing recipes');
    else assert(guide.includes('Trail tonic') || guide.includes('Traveler’s remedies'), 'guide lists relevant material recipes');
    assert(!guide.includes('Starfall staff'), 'Ranger guide omits Mage-only recipes');
    assert(!/NaN|undefined/.test(guide));
  }
}

assert(renderCrafting(maximum, true).includes('Maximum crafting level reached.'));
const expertise = renderCrafting({ ...novice, craftingXp: 28800 }, true);
assert.deepEqual([...expertise.matchAll(/<details[^>]*data-crafting-rank="([^"]+)"[^>]* open/g)].map(match=>match[1]), ['expert', 'artisan'], 'current and next ranks open without expanding earlier ranks');
assert(renderCrafting(novice, true).includes('Briar sentinel') && renderCrafting(novice, true).includes('Ice wisp'), 'refinement recipes name actual loot sources');


const hostileName = '<img src=x onerror="bad()"> & \'friend\'';
const escapedName = '&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; &#39;friend&#39;';
const friend = { ...hero('Mage'), id: 'friend', name: hostileName, hp: 25, maxHp: 100 };
const invite = { id: 'invite-1', inviterId: 'friend', inviterName: hostileName, expiresAt: now + 60_000 };
const member = p => ({ id: p.id, name: p.name, className: p.appearance.className, level: p.level, hp: p.hp, maxHp: p.maxHp, zone: p.zone, instanceId: p.instanceId });
const party = { id: 'party-1', leaderId: player.id, members: [member(player), member(friend)] };
party.members.push(member({ ...hero(), id: 'third' }), member({ ...hero(), id: 'fourth' }));
assert.equal(partyHUD(null, []), '');
assert(partyHUD(null, [invite]).includes('1 party invitation') && partyHUD(null, [invite, invite]).includes('2 party invitations'));
const hud = partyHUD(party, []);
assert(hud.includes('PARTY · 4 / 4') && hud.includes('width:25%'));
assert(hud.includes(escapedName) && !hud.includes('<img'), 'party HUD names remain text');
assert(partyHUD(party, [invite]).includes('1 invitation waiting'), 'new invitations remain discoverable while already in a party');
const damagedParty = { ...party, members: [{ ...party.members[0], hp: 200, maxHp: 100 }, { ...party.members[1], hp: -5, maxHp: 0 }] };
for (const healthView of [partyHUD(damagedParty, [])]) {
  assert(healthView.includes('width:100%') && healthView.includes('width:0%'), 'health strips stay inside their frame for stale or invalid health values');
  assert(!/width:(?:NaN|Infinity|-)/.test(healthView));
}
for (const view of [renderContracts(hero(), 'hollow', true, now), renderCrafting(hero(), true), hud]) {
  assert(view.includes('item-art atlas-') && !/<svg\b/i.test(view), 'adventure panels reuse generated image icons');
  assert(!/NaN|undefined/.test(view), 'rendered copy and health/experience values remain defined');
}
// Verify actual delegated actions flush the manually reached position before range checks.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
// Execute the invitation window's real snapshot rendering and response handlers.
const elements=new Map(),responses=[];
const element=id=>{
 if(!elements.has(id))elements.set(id,{dataset:{},open:false,shows:0,textContent:'',listeners:{},
  matches(){return this.open;},showPopover(){this.open=true;this.shows++;},hidePopover(){this.open=false;},
  append(child){child.parentElement=this;child.open=false;},addEventListener(type,handler){this.listeners[type]=handler;}});
 return elements.get(id);
};
const invitationRuntime={$:element,panel:element('panel'),connected:true,entryActive:false,rosterActive:false,player:hero(),party:null,dungeonSummon:null,
 onboardingFeatureUnlocked,onboardingLockReason,toast(){},updateWho(){},
 partyInvites:[invite],pendingPartyInvite:null,serverOffset:500,Date:{now:()=>now},send:message=>responses.push({...message}),keys:new Set(['w'])};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function allowFeature('),main.indexOf('function acknowledgeGuide('))),invitationRuntime);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function updatePartyInvitation('),main.indexOf("let lastPartyHUD="))),invitationRuntime);
const popup=element('party-invitation'),accept=element('party-invitation-accept'),decline=element('party-invitation-decline');
const snapshot=invites=>{invitationRuntime.partyInvites=invites;invitationRuntime.pendingPartyInvite=null;invitationRuntime.updatePartyInvitation();};
snapshot([invite]);assert(popup.open);assert.equal(element('party-invitation-message').textContent,`${hostileName} has invited you to a party.`,'untrusted names are assigned as text');
for(let i=0;i<5;i++)snapshot([invite]);assert.equal(popup.shows,1,'snapshots do not reopen the window or steal focus');
element('panel').open=true;snapshot([invite]);assert.equal(popup.parentElement,element('panel'),'invitation stays interactive inside a modal menu');
element('panel').open=false;snapshot([invite]);assert.equal(popup.parentElement,element('play-ui'),'closing a modal returns the invitation to the game');
accept.onclick();assert.deepEqual(responses.at(-1),{type:'partyAccept',invitationId:invite.id});assert(accept.disabled&&decline.disabled);
decline.onclick();assert.equal(responses.length,1,'a pending response cannot be submitted twice');
snapshot([invite]);assert(!accept.disabled&&!decline.disabled,'a server rejection leaves the remaining invite retryable');
decline.onclick();assert.equal(responses.at(-1).type,'partyDecline');
const second={...invite,id:'invite-2',inviterName:'Second friend'};
snapshot([second]);assert.equal(popup.dataset.invitationId,second.id,'the next or replaced invitation uses its current server ID');
invitationRuntime.party=party;snapshot([second]);assert(!popup.open,'joining a party hides other pending invitations');invitationRuntime.party=null;
snapshot([{...invite,expiresAt:now+500}]);assert(!popup.open,'expired invitations honor server time');
snapshot([second]);invitationRuntime.respondToPartyInvite('partyAccept','old-id');assert.equal(responses.length,2,'stale IDs never send');
for(const field of ['connected','entryActive','rosterActive']){
 const saved=invitationRuntime[field];invitationRuntime[field]=field!=='connected';invitationRuntime.updatePartyInvitation();assert(!popup.open);invitationRuntime[field]=saved;snapshot([second]);
}
for(const state of [{hp:0},{instanceId:'rootvault'}]){
 invitationRuntime.player={...hero(),...state};snapshot([second]);assert(accept.disabled&&!decline.disabled);assert(!element('party-invitation-note').hidden);
 const before=responses.length;accept.onclick();assert.equal(responses.length,before,'unavailable players cannot accept');decline.onclick();assert.equal(responses.at(-1).type,'partyDecline');
}
invitationRuntime.player=hero();snapshot([second]);
const key={key:'Escape',preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
popup.listeners.keydown(key);assert(key.prevented&&key.stopped);assert.equal(responses.at(-1).type,'partyDecline');
popup.listeners.pointerdown();assert.equal(invitationRuntime.keys.size,0,'window input releases movement keys');
snapshot([]);assert(!popup.open,'authoritative removal closes the invitation');
const handlerStart = main.indexOf("$('panel-content').addEventListener('click',event=>{");
const handlerEnd = main.indexOf('function selectBagItem(', handlerStart);
assert(handlerStart >= 0 && handlerEnd > handlerStart);
const sent = [], waypoints = [], stationFinds=[];
let onClick;
const runtime = { ROOTVAULT_GUARDIAN, getDungeon, dungeonChoice: 'rootvault', dungeonExitPoint: () => DUNGEON_EXIT, player: hero(), panel: { dataset: { mode: 'contracts' } }, position: { x: 96, z: -22 }, rotation: .5, worldZone: 'hollow', worldInstance: null,
  raid:null,raidAction:()=>null,raidProgressionAction:()=>null,
  performance: { now: () => 1000 }, send: message => sent.push(message), closePanel() {},respondToPartyInvite:(type,invitationId)=>sent.push({type,invitationId}),
  $: () => ({ addEventListener: (name, callback) => { if (name === 'click') onClick = callback; } }),
  targetPoints: () => [{ id: 'dungeon-entrance', x: 96, z: -24 }, { id: 'dungeon-exit', x: 0, z: 26 }],
  setWaypoint: point => waypoints.push(point),findStation:(...args)=>stationFinds.push(args),
};
runInNewContext(stripTypeScriptTypes(main.slice(handlerStart, handlerEnd)), runtime);
function click(dataset, disabled = false) {
  sent.length = 0;
  const button = { dataset, disabled };
  onClick({ target: { closest: () => button } });
  return button;
}
for (const [data, type, field, id] of [['acceptContract', 'acceptContract', 'contractId', 'hollow-vault'], ['claimContract', 'claimContract', 'contractId', 'hollow-vault'], ['craft', 'craft', 'recipeId', 'rootforged-sigil']]) {
  click({ [data]: id });
  assert.deepEqual(sent.map(message => message.type), ['move', type]);
  assert.deepEqual({ ...sent[0] }, { type: 'move', zone: 'hollow', x: 96, z: -22, rotation: .5 });
  assert.deepEqual({ ...sent[1] }, { type, [field]: id }, 'the client submits only a content ID, never chosen reward values');
}
runtime.position = { x: ROOTVAULT_ENTRANCE.x, z: ROOTVAULT_ENTRANCE.z + 2 };
click({ dungeonEnter: '' });
assert.deepEqual(sent.map(message => message.type), ['move'], 'locked entrance sends guidance, not a dungeon request');
assert.equal(waypoints.at(-1).id, ROOTVAULT_GUARDIAN.id, 'locked adventurer is guided to the actual guardian');
runtime.player.rootvaultUnlocked = true;
click({ dungeonEnter: '' });
assert.deepEqual(sent.map(message => message.type), ['move', 'dungeonEnter']);
runtime.position = { x: 0, z: 0 };
click({ dungeonEnter: '' });
assert.deepEqual(sent.map(message => message.type), ['move']);
assert.equal(waypoints.at(-1).x, ROOTVAULT_ENTRANCE.x, 'the distant dungeon action marks guidance without an entry request');
assert.deepEqual(runtime.position,{x:0,z:0},'marking the dungeon does not move the character');
runtime.worldInstance = 'rootvault-a'; runtime.position = { x: DUNGEON_EXIT.x, z: DUNGEON_EXIT.z + 1 };
click({ dungeonExit: '' });
assert.deepEqual(sent.map(message => message.type), ['move', 'dungeonExit']);
runtime.position={x:0,z:0};click({dungeonExit:''});
assert.deepEqual(sent.map(message=>message.type),['move']);assert.equal(waypoints.at(-1).z,DUNGEON_EXIT.z,'a distant exit marks the in-instance destination');
assert.deepEqual(runtime.position,{x:0,z:0});
click({findBoard:'hollow'});assert.deepEqual(stationFinds.at(-1),['board','hollow']);assert.equal(sent.length,0,'finding a quest service delegates guidance without a server action');
click({findWorkshop:''});assert.deepEqual(stationFinds.at(-1),['workshop']);assert.equal(sent.length,0);
click({ craft: 'trail-tonic' }, true); assert.equal(sent.length, 0, 'disabled controls cannot send an action');
runtime.player.characterCreated = false;
click({ acceptContract: 'hollow-vault' }); assert.equal(sent.length, 0, 'a roster draft cannot use adventure actions');
console.log('PASS: regional contracts/cooldowns, all crafting requirements, party HUD/invitation popup, escaped names, generated art and movement-before-adventure actions.');
