import type { Player, ClientMessage } from './shared.ts';
import { listStoryQuests, storyQuestById, storyQuestReady, type StoryQuest, type StoryQuestDialogue } from './story-quests.ts';
import { LOOT_ITEMS } from './loot-items.ts';
import { SKILLS, type SkillId } from './skills.ts';
import type { GearSlot } from './progression.ts';
import { goldSource } from './gold-economy.ts';
import { getZone } from './content.ts';
import { icon } from './icons.ts';
import './story-quest.css';

const escape = (value: string | number) => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
const gearLabel = (slot: GearSlot) => ({weapon:'Weapon',armor:'Armor',charm:'Necklace',head:'Head armor',legs:'Leg armor',shoes:'Boots',back:'Back item',ring:'Ring'}[slot]);
const rewardText = (reward: StoryQuest['reward']) => [reward.xp ? `${reward.xp} XP` : '', reward.gold ? `${reward.gold} Gold` : '',
  reward.potions ? `${reward.potions} healing potion${reward.potions === 1 ? '' : 's'}` : '', reward.crystal ? `${reward.crystal} Lantern fragments` : '', reward.relic ? `${reward.relic} relic` : '',
  ...Object.entries(reward.inventory ?? {}).map(([id,count])=>`${count} ${id==='wood'?'Wood':'Wild herbs'}`),
  ...Object.entries(reward.items ?? {}).map(([id,count])=>`${count} ${LOOT_ITEMS[id]?.label ?? id}`),
  ...Object.entries(reward.professionXp ?? {}).map(([id,count])=>`${count} ${SKILLS[id as SkillId]?.label ?? id} XP`),
  reward.gear ? `${reward.gear.choice?'Choose one: ':''}${reward.gear.quality} ${reward.gear.slots.map(gearLabel).join(' or ')}` : '',
].filter(Boolean).join(' · ');
export function renderStoryNpcChoices(player: Player | null, npcId: string): string {
  if (!player) return '';
  const quests = listStoryQuests(player, npcId);
  if (!quests.length) return '';
  return `<section class="story-npc-quests" aria-label="Story quests"><h3>Stories along the road</h3>${quests.map(quest => {
    const active = Object.hasOwn(player.storyQuests?.active ?? {}, quest.id), ready = storyQuestReady(player.storyQuests, quest.id);
    return `<button type="button" class="story-quest-choice" data-story-talk="${escape(quest.id)}"><span class="story-quest-symbol" aria-hidden="true">${ready ? '?' : active ? '·' : '!'}</span><span><b>${escape(quest.title)}</b><small>Level ${quest.requiredLevel} · ${ready ? 'Ready to return' : active ? 'In progress' : 'New quest'}</small></span></button>`;
  }).join('')}</section>`;
}
const activeStories = (player: Player) => listStoryQuests(player).filter(quest => Object.hasOwn(player.storyQuests?.active ?? {}, quest.id));
function describeStory(player: Player, quest: StoryQuest) {
  const progress = player.storyQuests!.active[quest.id];
  const objectiveIndex = quest.objectives.findIndex((objective, index) => progress[index] < objective.count
    && (objective.requires ?? []).every(id => { const before = quest.objectives.findIndex(entry => entry.id === id); return before >= 0 && progress[before] >= quest.objectives[before].count; }));
  const objective = quest.objectives[objectiveIndex], completed = quest.objectives.filter((entry, index) => progress[index] >= entry.count).length;
  return { quest, objective, objectiveIndex, objectiveProgress: objective ? progress[objectiveIndex] : 0, objectiveTotal: objective?.count ?? 0,
    completed, total: quest.objectives.length, ready: completed === quest.objectives.length, progress,
    rewardText: rewardText({ ...quest.reward, gold: goldSource(quest.reward.gold, 'contract', (player.economyVersion ?? 0) >= 1) }) };
}
/** Shared journal/HUD projection. A finished or unknown preference falls back to an actual active quest. */
export function storyQuestTracker(player: Player | null | undefined, preferredQuestId?: string) {
  if (!player) return null;
  const active = activeStories(player), quest = active.find(quest => quest.id === preferredQuestId) ?? active[0];
  return quest ? describeStory(player, quest) : null;
}
let journalState: { playerId?: string; selectedId?: string; filter: 'active' | 'completed'; detail: boolean } = { filter: 'active', detail: false };
export function renderStoryJournal(player: Player | null, npcName: (id: string) => string): string {
  if (!player) return '';
  if (journalState.playerId !== player.id) journalState = { playerId: player.id, filter: 'active', detail: false };
  const active = activeStories(player), completed = (player.storyQuests?.completed ?? []).flatMap(id => { const quest = storyQuestById(id); return quest ? [quest] : []; }).reverse();
  const history = journalState.filter === 'completed', entries = history ? completed : active;
  const selected = entries.find(quest => quest.id === journalState.selectedId) ?? entries[0];
  journalState.selectedId = selected?.id;
  const list = entries.map(quest => {
    const state = history ? null : describeStory(player, quest), chosen = quest.id === selected?.id;
    return `<button type="button" class="story-journal-entry" data-story-select="${escape(quest.id)}" aria-pressed="${chosen}">
      <span class="story-entry-seal" aria-hidden="true">${icon(history ? 'check' : state!.ready ? 'gold' : 'book')}</span>
      <span class="story-entry-copy"><strong>${escape(quest.title)}</strong><small>Level ${quest.requiredLevel} · ${escape(getZone(quest.zone).name)}</small>
      <span class="story-entry-status${state?.ready ? ' is-ready' : ''}">${history ? 'Completed' : state!.ready ? 'Ready to return' : `${state!.completed}/${state!.total} objectives complete`}</span></span>
      <span class="story-entry-arrow" aria-hidden="true">›</span></button>`;
  }).join('');
  let detail = '';
  if (selected) {
    const state = history ? null : describeStory(player, selected), npcId = selected.turnInNpcId ?? selected.npcId;
    detail = `<article class="story-journal-detail" data-story-detail tabindex="-1" aria-label="${escape(selected.title)} details">
      <button type="button" class="story-journal-back" data-story-list>${icon('left')}Quest list</button>
      <div class="story-detail-heading"><span class="story-detail-crest" aria-hidden="true">${icon(history ? 'check' : 'book')}</span><div><p class="story-detail-kicker">Chapter ${selected.source.chapter} · Level ${selected.requiredLevel}</p><h4>${escape(selected.title)}</h4><p class="story-detail-giver">${escape(getZone(selected.zone).name)} · ${history ? 'Returned to' : 'Return to'} ${escape(npcName(npcId))}</p></div></div>
      <p class="story-detail-hook">${escape(selected.dialogue.intro[0])}</p>
      <div class="story-detail-section-title"><h5>Objectives</h5><span>${history ? 'Complete' : `${state!.completed} / ${state!.total} complete`}</span></div>
      <ol class="story-detail-objectives">${selected.objectives.map((objective, index) => {
        const count = history ? objective.count : state!.progress[index], done = count >= objective.count, current = state?.objectiveIndex === index;
        return `<li class="${done ? 'is-complete' : current ? 'is-current' : ''}"><span class="story-objective-mark" aria-hidden="true">${done ? '✓' : index + 1}</span><div><span>${escape(objective.label)}</span><progress value="${count}" max="${objective.count}" aria-label="${escape(objective.label)} progress">${count}/${objective.count}</progress></div><b>${count}/${objective.count}</b></li>`;
      }).join('')}</ol>
      <div class="story-detail-reward"><span aria-hidden="true">${icon(history ? 'check' : 'gold')}</span><div><h5>${history ? 'Rewards collected' : 'Completion rewards'}</h5><p>${history ? 'This story is complete. Its reward has already been claimed.' : escape(state!.rewardText) || 'Complete the story to continue your journey.'}</p></div></div>
      ${history ? '' : `<div class="story-journal-actions"><button type="button" class="primary-button" data-story-find="${escape(selected.id)}">${icon(state!.ready ? 'route' : 'compass')}${state!.ready ? `Return to ${escape(npcName(npcId))}` : 'Track objective'}</button>${state!.ready ? '' : `<button type="button" class="secondary-button" data-story-find="${escape(npcId)}">Find ${escape(npcName(npcId))}</button>`}</div><p class="story-journal-note">${state!.ready ? 'Speak with your quest giver nearby to collect the reward.' : 'Tracking marks your next destination in the world.'}</p>`}
    </article>`;
  }
  return `<section class="story-journal" data-story-journal data-story-view="${journalState.detail ? 'detail' : 'list'}" aria-label="Story quest journal">
    <header class="story-journal-heading"><h3>Stories along the road</h3><span class="story-journal-tally">${active.length} active · ${completed.length} completed</span></header>
    <div class="story-journal-filters" role="group" aria-label="Quest status"><button type="button" data-story-filter="active" aria-pressed="${!history}">Active <span>${active.length}</span></button><button type="button" data-story-filter="completed" aria-pressed="${history}">Completed <span>${completed.length}</span></button></div>
    <div class="story-journal-body">${selected ? `<nav class="story-journal-list" aria-label="${history ? 'Completed' : 'Active'} stories">${list}</nav>${detail}` : `<div class="story-journal-empty"><span aria-hidden="true">${icon(history ? 'book' : 'compass')}</span><h4>${history ? 'Your story is still unfolding' : 'A new story awaits'}</h4><p>${history ? 'Completed quests appear here after you return to their giver and claim the reward.' : 'Speak with Rowan or another town keeper to accept a story. Your active quests will appear here.'}</p>${history ? '' : '<button type="button" class="secondary-button" data-story-find="rowan">Find Rowan</button>'}</div>`}</div>
  </section>`;
}
export interface StoryQuestUIOptions {
  getPlayer: () => Player | null;
  send: (message: ClientMessage) => void;
  openPanel: (title: string, eyebrow: string, mode: string) => void;
  closePanel: () => void;
  content: () => HTMLElement;
  npcName: (id: string) => string;
  showNpcPortrait: (id: string) => void;
  findNpc: (id: string) => void;
}
export function createStoryQuestUI(options: StoryQuestUIOptions) {
  let current: StoryQuestDialogue | undefined, line = 0, rewardSlot: GearSlot | undefined;
  function render() {
    if (!current) return;
    const quest = storyQuestById(current.questId); if (!quest) return;
    const last = line >= current.lines.length - 1, phase = current.phase;
    const text = current.lines[line] ?? quest.dialogue.intro[0];
    const progress = options.getPlayer()?.storyQuests?.active[quest.id];
    const reward = current.reward ?? quest.reward, chooseGear = last && phase === 'complete' && reward.gear?.choice;
    const choice = chooseGear ? `<fieldset class="story-reward-choice"><legend>Choose your reward</legend>${reward.gear!.slots.map(slot=>`<label><input type="radio" name="story-gear-reward" data-story-reward-slot="${escape(slot)}" value="${escape(slot)}"${rewardSlot===slot?' checked':''}>${escape(gearLabel(slot))}</label>`).join('')}</fieldset>` : '';
    options.content().innerHTML = `<section class="story-conversation" aria-label="Conversation with ${escape(options.npcName(current.npcId))}"><p class="story-speaker">${escape(options.npcName(current.npcId))}</p><h3>${escape(quest.title)}</h3><p class="story-dialogue-line" aria-live="polite">${escape(text)}</p>${last && phase !== 'reward' ? `<ul class="story-objectives">${quest.objectives.map((objective, index) => `<li>${escape(objective.label)} <b>${progress ? `${progress[index]}/` : ''}${objective.count}</b></li>`).join('')}</ul>` : ''}${last && (phase === 'offer' || phase === 'complete' || phase === 'reward') ? `<div class="story-quest-rewards"><span>${phase === 'reward' ? 'Rewards received' : 'Rewards'}</span><b>${escape(rewardText(current.reward ?? quest.reward)) || 'Objectives complete'}</b></div>` : ''}${choice}<div class="story-dialogue-actions">${!last ? '<button type="button" class="primary-button" data-story-next>Continue</button>' : phase === 'offer' ? '<button type="button" class="primary-button" data-story-action="accept">Accept quest</button><button type="button" class="secondary-button" data-story-close>Decline</button>' : phase === 'complete' ? `<button type="button" class="primary-button" data-story-action="claim"${chooseGear&&!rewardSlot?' disabled':''}>Complete quest</button><button type="button" class="secondary-button" data-story-close>Later</button>` : `<button type="button" class="primary-button" data-story-close>${phase === 'reward' ? 'Continue your journey' : 'Continue quest'}</button>${phase === 'progress' ? '<button type="button" class="secondary-button" data-story-action="abandon">Abandon quest</button>' : ''}`}</div></section>`;
    options.showNpcPortrait(current.npcId);
    options.content().querySelector<HTMLButtonElement>('.story-dialogue-actions button')?.focus({ preventScroll: true });
  }
  function open(message: StoryQuestDialogue) {
    if (!storyQuestById(message.questId)) return;
    current = message; line = 0; rewardSlot = undefined;
    options.openPanel(options.npcName(message.npcId), 'STORIES ALONG THE ROAD', 'story-quest'); render();
  }
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-story-talk], [data-story-find], [data-story-next], [data-story-close], [data-story-action], [data-story-select], [data-story-filter], [data-story-list]') : null;
    if (!target) return;
    if (target.hasAttribute('data-story-select') || target.hasAttribute('data-story-filter') || target.hasAttribute('data-story-list')) {
      const player = options.getPlayer(), journal = target.closest<HTMLElement>('[data-story-journal]');
      if (!player || !journal) return;
      if (target.dataset.storySelect) {
        const id = target.dataset.storySelect;
        if (!Object.hasOwn(player.storyQuests?.active ?? {}, id) && !player.storyQuests?.completed.includes(id)) return;
        journalState.selectedId = id; journalState.detail = true;
      } else if (target.dataset.storyFilter === 'active' || target.dataset.storyFilter === 'completed') {
        journalState.filter = target.dataset.storyFilter; journalState.selectedId = undefined; journalState.detail = false;
      } else journalState.detail = false;
      const holder = journal.parentElement;
      journal.outerHTML = renderStoryJournal(player, options.npcName);
      const replacement = holder?.querySelector<HTMLElement>('[data-story-journal]');
      replacement?.querySelector<HTMLElement>(journalState.detail ? '[data-story-detail]' : '[data-story-select][aria-pressed="true"], [data-story-filter][aria-pressed="true"]')?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.storyTalk) { options.send({ type: 'storyQuest', action: 'talk', questId: target.dataset.storyTalk }); return; }
    if (target.dataset.storyFind) { options.findNpc(target.dataset.storyFind); return; }
    if (!current) return;
    if (target.hasAttribute('data-story-next')) { line++; render(); return; }
    if (target.hasAttribute('data-story-close')) { current = undefined; options.closePanel(); return; }
    const action = target.dataset.storyAction;
    if (action === 'accept' || action === 'claim' || action === 'abandon') {
      const reward = current.reward ?? storyQuestById(current.questId)!.reward;
      if (action === 'claim' && reward.gear?.choice && (!rewardSlot || !reward.gear.slots.includes(rewardSlot))) return;
      options.send({ type: 'storyQuest', action, questId: current.questId, ...(action==='claim'&&reward.gear?.choice?{rewardSlot}: {}) }); current = undefined; options.closePanel();
    }
  };
  const onChange = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches('[data-story-reward-slot]') || !current || current.phase!=='complete') return;
    const gear = (current.reward ?? storyQuestById(current.questId)!.reward).gear, slot = target.value as GearSlot;
    if (!gear?.choice || !gear.slots.includes(slot)) return;
    rewardSlot = slot;
    const claim = options.content().querySelector<HTMLButtonElement>('[data-story-action=claim]');if(claim)claim.disabled=false;
  };
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  return { open, close: () => { current = undefined; options.closePanel(); }, destroy: () => {document.removeEventListener('click', onClick);document.removeEventListener('change',onChange);} };
}
