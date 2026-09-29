import { INSTANT_COMBAT, INSTANT_COMBAT_BRACKETS, INSTANT_COMBAT_CREATURES, instantCombatEncounter, instantCombatBracket, instantCombatWaveReward, type InstantCombatState } from './instant-combat.ts';
import type { Player } from './shared';
import { instantCombatMap } from './instant-combat-maps.ts';

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

const countdown = (end: number, now: number) => {
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}` : Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const utcTime = (time: number) => new Date(time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

export function instantCombatStatus(state: InstantCombatState, now: number) {
  const run = state.run;
  if (!run) return state.registrationOpen ? `${state.registered ? 'Registered' : 'Join now'} · Closes in ${countdown(state.startsAt, now)}` : `Next event · ${utcTime(state.startsAt)}`;
  if (run.phase === 'preparing') return `Prepare · Round 1 in ${countdown(run.phaseEndsAt, now)}`;
  if (run.phase === 'intermission') return `Wave ${run.round} cleared · Collect rewards · ${countdown(run.phaseEndsAt, now)}`;
  if (run.phase === 'completed') return `Victory · Collect rewards · Return in ${countdown(run.phaseEndsAt, now)}`;
  if (run.phase === 'failed') return `Encounter ended · Return in ${countdown(run.phaseEndsAt, now)}`;
  if (run.boss?.shielded) return `${run.mechanic?.label ?? 'Clear the objective'}${run.mechanic ? ` · ${run.mechanic.progress}/${run.mechanic.goal}` : ''} · ${countdown(run.mechanic?.nextAt && run.mechanic.nextAt > now ? run.mechanic.nextAt : run.boss.endsAt, now)}`;
  if (run.boss) return `${run.boss.name} · ${Math.ceil(100 * run.boss.hp / run.boss.maxHp)}% HP`;
  return `Round ${run.round} / ${run.totalRounds} · Group ${run.subwave ?? 1} / ${run.totalSubwaves ?? INSTANT_COMBAT.subwaves} · ${run.enemiesRemaining} enemies remaining`;
}

export function renderInstantCombatPanel(state: InstantCombatState | null, player: Pick<Player, 'level' | 'hp' | 'economyVersion'>, now: number, connected = true) {
  if (!state || !connected) return '<p role="status">Reconnect to see the next Instant Combat event.</p>';
  const run = state.run, bracket = instantCombatBracket(player.level), eligible = !!bracket;
  const rewards = bracket ? Array.from({length: INSTANT_COMBAT.rounds}, (_, round) => instantCombatWaveReward(run?.bracketId ?? bracket.id, round + 1, (player.economyVersion ?? 0) >= 1)!) : [];
  const minLevel = run?.minLevel ?? bracket?.minLevel ?? 16;
  const maxLevel = run?.maxLevel ?? bracket?.maxLevel ?? 60;
  const status = instantCombatStatus(state, now), encounter = run ?? instantCombatEncounter(state.startsAt);
  const map = instantCombatMap(encounter.mapId), boss = INSTANT_COMBAT_CREATURES[map.id].bosses.find(boss => boss.model === encounter.bossModel), bossName = boss?.name;
  const previousAt = state.startsAt - INSTANT_COMBAT.intervalMs;
  const elapsed = Math.max(0, Math.min(100, (now - previousAt) / INSTANT_COMBAT.intervalMs * 100));
  const registrationMark = (state.registrationOpensAt - previousAt) / INSTANT_COMBAT.intervalMs * 100;
  const maxGold = Math.max(1, ...rewards.map(reward => reward.gold));
  const rules = [
    `Register from anywhere. Be online and alive, and finish any duel or arena match before entry. Separate arenas serve levels ${INSTANT_COMBAT_BRACKETS.map(entry => `${entry.minLevel}–${entry.maxLevel}`).join(', ')}.`,
    `Stay together: rounds grow harder. Monsters pursue the closest adventurer across the arena at ${INSTANT_COMBAT.movementSpeedMultiplier}× movement speed and a ${Math.round((INSTANT_COMBAT.attackRateMultiplier - 1) * 100)}% faster attack rate. The final group is the boss.`,
    `Survive all ${INSTANT_COMBAT.subwaves} groups in a round to receive your personal ground pickup. Collect rewards within ${INSTANT_COMBAT.roundBreakMs / 1000} seconds (${INSTANT_COMBAT.returnMs / 1000} after the boss). Monsters drop no loot or XP.`,
    'Fallen adventurers return to the world and cannot rejoin this run. Missed events cannot be joined after they begin.',
  ];
  const runInstruction = run ? player.hp <= 0 ? 'Returning you to the world. Fallen adventurers cannot rejoin this run.' : run.phase === 'preparing' ? `Use these ${INSTANT_COMBAT.preparationMs / 1000} seconds to prepare together. The first round starts automatically.` : run.phase === 'intermission' ? 'Collect your personal ground rewards, heal and regroup before the next round.' : run.phase === 'completed' || run.phase === 'failed' ? `You return automatically after ${INSTANT_COMBAT.returnMs / 1000} seconds, or leave now to return to where you entered.` : run.objective || 'Defeat every creature to advance. All adventurers in this arena are allies.' : '';
  return `<section class="instant-combat-panel">
    <header class="ic-event-hero" data-map="${map.id}"><div><span class="ic-label">${run ? 'Your encounter' : 'Next event'}</span><h3 class="instant-combat-location">${map.name}</h3><p>${escape(bossName ?? '')}</p></div><div class="ic-event-clock"><strong>${run ? run.phase === 'fighting' ? `${run.round} / ${run.totalRounds}` : countdown(run.phaseEndsAt, now) : countdown(state.startsAt, now)}</strong><span>${run ? run.phase === 'fighting' ? 'Round' : 'Until next phase' : `Starts ${utcTime(state.startsAt)}`}</span></div>
      ${!run ? `<div class="ic-event-timeline" role="img" aria-label="${escape(`Previous event ${utcTime(previousAt)}. Registration ${utcTime(state.registrationOpensAt)}. Start ${utcTime(state.startsAt)}.`)}"><i style="width:${elapsed.toFixed(2)}%"></i><b style="left:${registrationMark.toFixed(2)}%"></b></div><div class="ic-event-marks"><span>Last ${utcTime(previousAt)}</span><span>Registration ${utcTime(state.registrationOpensAt)}</span><span>Start ${utcTime(state.startsAt)}</span></div>` : ''}
      <p class="instant-combat-status" role="status">${escape(status)}</p>
    </header>
    <dl class="ic-event-facts"><div><dt>Rounds × groups</dt><dd>${INSTANT_COMBAT.rounds} × ${INSTANT_COMBAT.subwaves}</dd></div><div><dt>Your arena</dt><dd>Levels ${minLevel}–${maxLevel}</dd></div><div><dt>Adventurers</dt><dd>${run ? `${run.members} / ${INSTANT_COMBAT.maxPlayers}` : `Up to ${INSTANT_COMBAT.maxPlayers}`}</dd></div><div><dt>Prepare</dt><dd>${INSTANT_COMBAT.preparationMs / 1000} seconds</dd></div></dl>
    ${run ? `<section class="ic-event-section ic-event-objective"><h4>Current objective</h4><p>${escape(runInstruction)}</p>${run.boss ? `<p>${run.boss.shielded ? `Boss shielded · ${countdown(run.boss.endsAt, now)} to clear the full objective.` : 'Dodge red attack shapes. Clear this boss’s special objective at each health gate to remove its shield.'}</p>` : ''}</section>` : `<p class="ic-registration-note">${state.registered ? 'You are registered. Be online and alive, and finish any duel or arena match before entry.' : state.registrationOpen ? `${state.registeredCount} registered in your level bracket. Join before the countdown ends.` : `Registration opens at ${utcTime(state.registrationOpensAt)} and closes at ${utcTime(state.startsAt)}.`}</p>`}
    <section class="ic-event-section"><h4>Personal rewards</h4>${rewards.length ? `<figure class="ic-event-rewards"><div class="ic-gold-rounds">${rewards.map((reward, index) => `<div><strong>${reward.gold}</strong><i style="height:${16 + reward.gold / maxGold * 58}px" aria-hidden="true"></i><span>Round ${index + 1}</span></div>`).join('')}</div><div class="ic-boss-reward"><strong>Boss clear</strong><p>${rewards[4].xp} XP and a ${Math.round(rewards[4].gearChance * 100)}% chance of rare-or-better equipment in your pickup.</p><small>Potions, tonics and crafting materials across the rounds.</small></div><figcaption>Gold by round: ${rewards.map(reward => reward.gold).join(' / ')}</figcaption></figure>` : '<p>Reach level 16 to see rewards for your arena bracket.</p>'}</section>
    ${boss ? `<section class="ic-event-section"><h4>${escape(boss.name)}</h4><p class="instant-combat-boss-guide">${escape(boss.instruction)}</p></section>` : ''}
    <section class="ic-event-section"><h4>How it works</h4><ol class="ic-event-rules">${rules.map(rule => `<li>${escape(rule)}</li>`).join('')}</ol></section>
    <section class="ic-event-section"><h4>Coming up <small>Every ${INSTANT_COMBAT.intervalMs / 3600000} hours · UTC</small></h4><ol class="ic-event-upcoming">${Array.from({length: 4}, (_, index) => { const at = state.startsAt + index * INSTANT_COMBAT.intervalMs, next = instantCombatEncounter(at), nextMap = instantCombatMap(next.mapId), nextBoss = INSTANT_COMBAT_CREATURES[nextMap.id].bosses.find(entry => entry.model === next.bossModel)!; return `<li${index === 0 ? ' class="is-next"' : ''}><time datetime="${new Date(at).toISOString()}">${utcTime(at)}</time><span>${nextMap.name}<small>${escape(nextBoss.name)}</small></span>${index === 0 ? '<b>Next</b>' : ''}</li>`; }).join('')}</ol></section>
    <section class="ic-event-section"><h4>Arenas by level</h4><div class="ic-event-brackets">${INSTANT_COMBAT_BRACKETS.map(entry => `<span${entry.id === (run?.bracketId ?? bracket?.id) ? ' class="is-current"' : ''}>Levels ${entry.minLevel}–${entry.maxLevel}${entry.id === (run?.bracketId ?? bracket?.id) ? ' · you' : ''}</span>`).join('')}</div></section>
    <footer class="ic-event-actions">${run ? `<button class="primary-button" data-instant-combat="leave">${run.phase === 'completed' || run.phase === 'failed' ? 'Return to the world' : 'Leave Instant Combat'}</button>` : `<button class="primary-button" data-instant-combat="${state.registered ? 'unregister' : 'register'}" ${!state.registered && (!state.registrationOpen || !eligible) ? 'disabled' : ''}>${state.registered ? 'Cancel registration' : !eligible ? 'Available at levels 16–60' : state.registrationOpen ? 'Register for Instant Combat' : 'Registration opens at ' + utcTime(state.registrationOpensAt)}</button>`}</footer>
  </section>`;
}

export function mountInstantCombatHUD(host: HTMLElement, open: () => void, join?: () => void) {
  const darkness = document.createElement('div'); darkness.hidden = true; darkness.setAttribute('aria-hidden', 'true');
  darkness.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;background:radial-gradient(ellipse at center,transparent 12%,#080511 90%);';
  host.append(darkness);
  const button = document.createElement('button');
  button.id = 'instant-combat-hud'; button.type = 'button'; button.hidden = true;
  button.innerHTML = '<strong>Instant Combat</strong><span class="instant-combat-timer"></span><span class="instant-combat-objective"></span><span class="instant-combat-control" role="status"></span><progress max="100" aria-label="Boss health" hidden></progress>';
  button.onclick = open;
  host.append(button);
  const notice = document.createElement('section'); notice.id = 'instant-combat-notice'; notice.hidden = true;
  notice.setAttribute('aria-labelledby', 'instant-combat-notice-title');
  notice.setAttribute('popover', 'manual');
  notice.innerHTML = '<div class="instant-combat-invitation-scene"><p>Instant Combat begins soon</p><h2 id="instant-combat-notice-title"></h2><p class="instant-combat-invitation-boss"></p><p class="instant-combat-invitation-time"></p><p class="instant-combat-invitation-note">Join now. Teleport when registration closes.</p></div><div class="instant-combat-invitation-actions"><button type="button" data-response="join">Join Event</button><button type="button" data-response="decline">Decline</button></div>';
  host.append(notice);
  const joinButton = notice.querySelector<HTMLButtonElement>('[data-response="join"]')!, declineButton = notice.querySelector<HTMLButtonElement>('[data-response="decline"]')!;
  const location = notice.querySelector('#instant-combat-notice-title')!, bossName = notice.querySelector('.instant-combat-invitation-boss')!, invitationTimer = notice.querySelector('.instant-combat-invitation-time')!;
  const declinedEvents = new Map<string, number>();
  let current: InstantCombatState | null = null, currentNow = 0, characterId = '', pendingUntil = 0;
  function placeInvitation() {
    const shown = notice.matches(':popover-open');
    if (notice.hidden) { if (shown) notice.hidePopover(); return; }
    // A modal makes outside elements inert, even when they are in the top layer.
    const parent = document.activeElement?.closest('dialog:modal') || document.querySelector('dialog:modal') || host;
    if (notice.parentElement !== parent) {
      if (shown) notice.hidePopover();
      parent.append(notice);
    }
    if (!notice.matches(':popover-open')) notice.showPopover();
  }
  joinButton.onclick = () => {
    if (notice.hidden || joinButton.disabled || !current?.registrationOpen || current.startsAt <= currentNow) return;
    pendingUntil = currentNow + 5000; joinButton.disabled = declineButton.disabled = true; joinButton.textContent = 'Joining…'; join?.();
  };
  declineButton.onclick = () => {
    if (notice.hidden || declineButton.disabled || !current) return;
    declinedEvents.set(characterId, current.startsAt); notice.hidden = button.hidden = true; placeInvitation();
  };
  return { update(state: InstantCombatState | null, now: number, active: boolean, player?: Pick<Player, 'id' | 'level'>) {
    const control = active ? state?.run?.control : undefined;
    darkness.hidden = !control || Math.max(control.blindUntil, control.darkUntil) <= now;
    darkness.style.opacity = control && control.blindUntil > now ? '.96' : '.68';
    const effects = control ? [['Stunned', control.stunUntil], ['Rooted', control.rootUntil], ['Silenced', control.silenceUntil], ['Blinded', control.blindUntil]] as const : [];
    button.querySelector('.instant-combat-control')!.textContent = effects.filter(([, until]) => until > now).map(([label, until]) => `${label} ${Math.ceil((until - now) / 1000)}s`).join(' · ');
    current = state; currentNow = now;
    if (player && player.id !== characterId) { characterId = player.id; pendingUntil = 0; }
    if (!active || !state || state.registered || state.run) pendingUntil = 0;
    const signup = !!state?.registrationOpen && state.startsAt > now;
    const declined = !!state && declinedEvents.get(characterId) === state.startsAt && !state.registered;
    notice.hidden = !join || !active || !signup || !player || !instantCombatBracket(player.level) || !!state?.registered || !!state?.run || declined;
    if (!notice.hidden && state) {
      const encounter = instantCombatEncounter(state.startsAt), map = instantCombatMap(encounter.mapId);
      const boss = INSTANT_COMBAT_CREATURES[map.id].bosses.find(boss => boss.model === encounter.bossModel)!;
      const timeText = `Starts in ${countdown(state.startsAt, now)} · Levels ${state.bracketId?.replace('-', '–') ?? '16–60'}`;
      notice.dataset.map = map.id;
      if (location.textContent !== map.name) location.textContent = map.name;
      if (bossName.textContent !== boss.name) bossName.textContent = boss.name;
      if (invitationTimer.textContent !== timeText) invitationTimer.textContent = timeText;
      joinButton.disabled = declineButton.disabled = pendingUntil > now;
      joinButton.textContent = pendingUntil > now ? 'Joining…' : 'Join Event';
    }
    placeInvitation();
    button.hidden = !active || !state || !state.run && (!signup || declined || !!player && !instantCombatBracket(player.level)) || !notice.hidden;
    if (button.hidden || !state) return;
    const text = instantCombatStatus(state, now);
    const timer = button.querySelector('.instant-combat-timer')!, objective = button.querySelector('.instant-combat-objective')!, health = button.querySelector('progress')!;
    if (timer.textContent !== text) timer.textContent = text;
    const instruction = state.run?.phase === 'fighting' ? state.run.objective || '' : '';
    if (objective.textContent !== instruction) objective.textContent = instruction;
    objective.toggleAttribute('hidden', !instruction);
    health.hidden = !state.run?.boss;
    if (state.run?.boss) health.value = 100 * state.run.boss.hp / state.run.boss.maxHp;
    button.firstElementChild!.textContent = state.run ? instantCombatMap(state.run.mapId).name : 'Instant Combat';
    button.setAttribute('aria-label', `Instant Combat. ${text}. ${instruction ? instruction + ' ' : ''}Open event details.`);
  } };
}
