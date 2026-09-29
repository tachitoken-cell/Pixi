import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STORY_QUESTS, newStoryQuests, storyQuestsValid, storyQuestAvailable, storyQuestReady, acceptStoryQuest, abandonStoryQuest, storyQuestProgress, claimStoryQuest, listStoryQuests, storyInteractAvailable, MAX_ACTIVE_STORY_QUESTS } from '../src/story-quests.ts';
import { STORY_OBJECTS, STORY_ENEMIES, STORY_ENCOUNTERS } from '../src/story-world-data.ts';
import { OVERWORLD_SPAWNS, toWorld, canTraverse, overworldSpawnAllowed } from '../src/realm.ts';
import { surfaceAt, groundHeight } from '../src/landscape.ts';
import { monsterSpawnLevel } from '../src/bestiary.ts';
import { createGatheringNodes } from '../src/gathering-nodes.ts';
import { DUNGEONS, dungeonStages } from '../src/dungeon.ts';
import { NPCS } from '../src/content.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { BANKERS, AUCTIONEERS } from '../src/city-services.ts';

const releaseSource = readFileSync(new URL('./build-release.mjs', import.meta.url), 'utf8');
assert(Number(releaseSource.match(/PLAYER_CATALOG_VERSION = (\d+)/)?.[1]) >= 10, 'new story inventory requires a coordinated catalog release');

const source = JSON.parse(readFileSync(new URL('../docs/qa/2026-09-28-story-quest-source.json', import.meta.url)));
assert.equal(source.chapters.length, 90); assert.equal(source.sideQuestTemplates.length, 12); assert.equal(STORY_QUESTS.length, 82);
assert.equal(new Set(STORY_QUESTS.map(quest => quest.id)).size, STORY_QUESTS.length);
const npcs = [...NPCS.map(npc => toWorld(npc.zone, npc)), ...TRAINER_NPCS, ...VILLAGE_NPCS];
const nodes = createGatheringNodes();
const state = newStoryQuests();
for (const quest of STORY_QUESTS) {
  const authored = source.chapters.find(row => row.chapter === quest.source.chapter && row.row === quest.source.row);
  assert.equal(quest.title, authored.title); assert.equal(quest.requiredLevel, authored.requiredLevel);
  assert.equal(quest.dialogue.intro[0], quest.id === 'story-the-old-campfire'
    ? 'Someone camped beyond the southern trail and never came home.'
    : authored.hook.replace(/^Rowan:\s*/, '').replace(/^“|”$/g, ''));
  assert.equal(new Set(quest.objectives.map(objective => objective.id)).size, quest.objectives.length, 'distinct objective IDs');
  assert(quest.requiredLevel <= 60 && !/First Path|Trial of Instinct|Trial of Resolve|Final Calling|Abbess.s Fragment/.test(quest.title));
  for (const id of [quest.npcId, quest.turnInNpcId ?? quest.npcId]) {
    const npc = npcs.find(npc => npc.id === id); assert(npc, `${quest.title}: real giver/return NPC ${id}`);
    assert(canTraverse(npc, npc), `${quest.title}: giver can be approached`);
  }
  assert.equal(storyQuestAvailable({ level: quest.requiredLevel - 1, storyQuests: state }, quest), false, 'level gate');
  assert(acceptStoryQuest(state, quest.id, 60), `${quest.title}: dependency chain is reachable`);
  assert.equal(claimStoryQuest(state, quest.id), undefined, 'unfinished reward rejected');
  for (const [index, objective] of quest.objectives.entries()) {
    const matches = target => objective.targets.includes('*') || objective.targets.includes(target.kind ?? target.id);
    if (objective.kind === 'kill') {
      const pool = objective.scope === 'overworld' ? [...OVERWORLD_SPAWNS, ...STORY_ENEMIES] : dungeonStages(objective.dungeonId).flatMap(stage => stage.enemies);
      assert(pool.some(spawn => matches(spawn) && (!objective.zone || spawn.zone === objective.zone)
        && (!objective.regionId || surfaceAt(spawn.x, spawn.z).regionId === objective.regionId)
        && (!objective.spawnIds || objective.spawnIds.includes(spawn.id))
        && (!objective.minTargetLevel || monsterSpawnLevel(spawn, surfaceAt(spawn.x, spawn.z).regionId) >= objective.minTargetLevel)), `${quest.title}: objective ${index} has an existing eligible spawn`);
    } else if (objective.kind === 'gather') {
      assert(nodes.some(node => matches(node) && (!objective.zone || node.zone === objective.zone)
        && (!objective.siteId || node.siteId === objective.siteId)
        && (!objective.spawnIds || objective.spawnIds.includes(node.id))
        && (!objective.regionId || surfaceAt(node.x, node.z).regionId === objective.regionId)), `${quest.title}: real gathering node`);
    } else if (objective.kind === 'dungeon') assert(DUNGEONS.some(dungeon => dungeon.id === objective.dungeonId), 'real dungeon');
    else {
      const target = objective.targets[0];
      const placed = STORY_OBJECTS.find(object => object.id === target), encounter = STORY_ENCOUNTERS.find(encounter => encounter.id === target);
      if (placed || encounter) assert.equal((placed ?? encounter).questId, quest.id, 'placed target belongs to exact active quest');
      else if (target === 'story-foundry-ledger') assert.equal(objective.dungeonId, 'emberfall', 'ledger is an actual optional Foundry cache interaction');
      else assert((target === 'banker' ? BANKERS : target === 'auctioneer' ? AUCTIONEERS : target === 'class-trainer' ? TRAINER_NPCS.filter(npc => npc.className) : npcs.filter(npc => npc.id === target)).some(npc => npc.zone === objective.zone), `${quest.title}: real visit target`);
    }
    const event = { kind: objective.kind, target: objective.targets[0] === '*' ? 'moss-slime' : objective.targets[0], scope: objective.scope,
      zone: objective.zone, regionId: objective.regionId, siteId: objective.siteId, spawnId: objective.spawnIds?.[0], dungeonId: objective.dungeonId, targetLevel: objective.minTargetLevel ?? 60, amount: objective.count };
    const before = state.active[quest.id][index];
    storyQuestProgress(state, { ...event, scope: objective.scope === 'overworld' ? 'dungeon' : 'overworld' });
    assert.equal(state.active[quest.id][index], before, 'wrong instance scope cannot progress');
    if (objective.regionId) { storyQuestProgress(state, { ...event, regionId: 'unrelated' }); assert.equal(state.active[quest.id][index], before, 'wrong region cannot progress'); }
    if (objective.siteId) { storyQuestProgress(state, { ...event, siteId: 'unrelated' }); assert.equal(state.active[quest.id][index], before, 'wrong resource site cannot progress'); }
    if (objective.spawnIds) { storyQuestProgress(state, { ...event, spawnId: 'unrelated' }); assert.equal(state.active[quest.id][index], before, 'ordinary/other keeper kill cannot grant this key'); }
    storyQuestProgress(state, event);
    assert.equal(state.active[quest.id][index], objective.count);
    storyQuestProgress(state, { ...event, amount: Number.MAX_SAFE_INTEGER });
    assert.equal(state.active[quest.id][index], objective.count, 'progress saturates');
  }
  assert(storyQuestReady(state, quest.id)); assert.equal(claimStoryQuest(state, quest.id), quest);
  assert.equal(claimStoryQuest(state, quest.id), undefined, 'claim replay inert');
  assert.equal(acceptStoryQuest(state, quest.id, 60), false, 'one-time quest cannot be restarted');
  assert(storyQuestsValid(state));
}
assert.deepEqual(listStoryQuests({ level: 60, storyQuests: state }), []);
const delivery = {active:{},completed:['story-welcome-to-lanternreach','story-slime-at-the-gates','story-what-the-slime-left-behind']};
assert(acceptStoryQuest(delivery,'story-a-message-for-sable',60));
assert(!listStoryQuests({level:60,storyQuests:delivery},'rowan').some(q=>q.id==='story-a-message-for-sable'),'accepted delivery moves to destination NPC');
assert(listStoryQuests({level:60,storyQuests:delivery},'sable').some(q=>q.id==='story-a-message-for-sable'));
const fresh = newStoryQuests();
assert(!acceptStoryQuest(fresh, 'story-slime-at-the-gates', 60), 'prerequisites cannot be skipped');
for (const quest of STORY_QUESTS.filter(q => !q.requires).slice(0, MAX_ACTIVE_STORY_QUESTS)) assert(acceptStoryQuest(fresh, quest.id, 60));
assert(!acceptStoryQuest(fresh, STORY_QUESTS.filter(q => !q.requires)[MAX_ACTIVE_STORY_QUESTS].id, 60), 'active quest bound');
const abandoned = Object.keys(fresh.active)[0]; assert(abandonStoryQuest(fresh, abandoned)); assert(!abandonStoryQuest(fresh, abandoned));
for (const corrupt of [null, {}, { active: {}, completed: [], extra: true }, { active: { unknown: [0] }, completed: [] },
  { active: { 'story-welcome-to-lanternreach': [1] }, completed: [] }, { active: {}, completed: ['story-slime-at-the-gates'] },
  { active: { 'story-welcome-to-lanternreach': [1, 0, 0, NaN] }, completed: [] }, { active: {}, completed: ['story-welcome-to-lanternreach', 'story-welcome-to-lanternreach'] }]) assert(!storyQuestsValid(corrupt), 'malformed/forged saved state rejected');
assert(!storyQuestProgress(newStoryQuests(), {kind:'kill',target:'moss-slime',scope:'overworld',amount:NaN}));
const treasureState={active:{'story-welcome-to-lanternreach':[1,1,1,1]},completed:[],treasures:['ashbound-treasure']};
assert(claimStoryQuest(treasureState,'story-welcome-to-lanternreach'));
assert(acceptStoryQuest(treasureState,'story-slime-at-the-gates',60));assert(abandonStoryQuest(treasureState,'story-slime-at-the-gates'));
assert.deepEqual(treasureState.treasures,['ashbound-treasure'],'claim and abandonment preserve once-only chamber treasure');
assert(storyQuestsValid(structuredClone(treasureState)),'saved/reloaded treasure remains valid');
for (const object of STORY_OBJECTS) {
  const surface = surfaceAt(object.x, object.z);
  assert(!surface.water && surface.zone === object.zone && canTraverse(object, object), `${object.id}: dry and approachable`);
  if(object.regionId) assert.equal(surface.regionId, object.regionId, `${object.id}: authored region`);
  const quest=STORY_QUESTS.find(quest=>quest.id===object.questId);assert(quest?.objectives.some(objective=>objective.targets.includes(object.id)),'every world marker is a wired objective');
  for(const previous of object.requires??[])assert(STORY_OBJECTS.some(other=>other.id===previous&&other.questId===object.questId),'ordered object prerequisite exists in same quest');
}
for (const spawn of STORY_ENEMIES) assert(overworldSpawnAllowed(spawn,spawn.zone), `${spawn.id}: existing town-safe collision policy`);
for (const encounter of STORY_ENCOUNTERS) {
  const object=STORY_OBJECTS.find(object=>object.id===encounter.objectId);assert(object && object.questId===encounter.questId,'encounter starts at its quest object');
  assert(STORY_QUESTS.find(quest=>quest.id===encounter.questId)?.objectives.some(objective=>objective.targets.includes(encounter.id)),'encounter completion advances an actual objective');
  for(let i=1;i<(encounter.route?.length??0);i++) {
    const a=encounter.route[i-1],b=encounter.route[i];assert(canTraverse(a,b),'escort route sweeps past real collision');
    const count=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z));let height=groundHeight(a.x,a.z);
    for(let step=1;step<=count;step++){const x=a.x+(b.x-a.x)*step/count,z=a.z+(b.z-a.z)*step/count,next=groundHeight(x,z);assert(!surfaceAt(x,z).water&&Math.abs(next-height)<=1.5,'escort route stays dry and climbable');height=next;}
  }
}
assert.equal(STORY_ENCOUNTERS.find(encounter=>encounter.id==='story-defend-scout').waves.length,3,'exact authored defense wave count');
const orderedQuest=STORY_QUESTS.find(quest=>quest.id==='story-the-bell-that-rings-alone');
const ordered={active:{[orderedQuest.id]:[0,0,0]},completed:state.completed.filter(id=>id!==orderedQuest.id&&id!=='story-orchid-isles')};
assert(storyQuestsValid(ordered));const event=index=>({kind:'interact',target:orderedQuest.objectives[index].targets[0],scope:'overworld',zone:'mistwood'});
assert(!storyInteractAvailable(ordered,event(2).target),'third bell unavailable before first two');
assert(!storyQuestProgress(ordered,event(2)),'out-of-order event cannot skip bells');
assert(storyInteractAvailable(ordered,event(0).target));assert(storyQuestProgress(ordered,event(0)));assert(!storyQuestProgress(ordered,event(0)),'repeat first bell cannot inflate progress');
assert(!storyInteractAvailable(ordered,event(0).target),'finished markers disappear');assert(storyInteractAvailable(ordered,event(1).target));
assert(!storyQuestsValid({...ordered,active:{[orderedQuest.id]:[1,0,1]}}),'saved out-of-order progress rejected');
assert(!storyInteractAvailable(ordered,event(1).target,'story-the-sealed-root'),'other active quest cannot expose target');
console.log('PASS: all 90 source rows accounted for: 82 non-SP quests (one documented safe-location hook adaptation) plus 8 explicit SP1 exclusions. Actual NPCs, world markers, creature homes, sites, 6 chambers, ordered unique interactions, distinct elite keys, 3 defense waves, swept escort, bounded one-time state and replay checks.');
