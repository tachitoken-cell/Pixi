// Quests: NPCs with a yellow "!" have a quest for you, a yellow "?" means you can hand one in (grey "?" = still
// in progress). Goals: defeat monsters, collect drops, talk to someone, visit a place, catch a companion, beat a
// dungeon boss or reach a level. Progress is saved in the browser.
import { MONSTER_TYPES } from './monsters.js';

const KEY = 'voxelquest-quests';

// quest items drop only while a quest needs them
export const ITEMS = {
  goo: { name: 'Jelly Goo', from: ['jelly', 'tjelly', 'bluejelly'], chance: 0.6 },
  fluff: { name: 'Hopper Fluff', from: ['hopper', 'thopper'], chance: 0.6 },
  spore: { name: 'Shroom Spore', from: ['shroom'], chance: 0.55 },
  fang: { name: 'Wolf Fang', from: ['wolf'], chance: 0.5 },
  shell: { name: 'Crab Shell', from: ['crab'], chance: 0.55 },
};

const kill = (target, n) => ({ type: 'kill', target: [target].flat(), n });
const collect = (item, n) => ({ type: 'collect', item, n });
const talk = (npc) => ({ type: 'talk', npc, n: 1 });
const visit = (map, name) => ({ type: 'visit', map, name, n: 1 });

export const QUESTS = [
  // ---- main story (Elder Moss, then Guard Hilda)
  { id: 'm1', main: true, name: 'A New Adventurer', giver: 'Elder Moss',
    offer: 'Every hero in Mossvale starts in the Training Grounds, north-west of the plaza. Show me what you can do: defeat 5 training monsters.',
    finish: 'Well fought! You have the makings of a real adventurer.',
    goals: [kill(['tjelly', 'thopper'], 5)], reward: { xp: 60, jobXp: 20, gold: 50 } },
  { id: 'm2', main: true, name: 'Clover Fields', giver: 'Elder Moss', after: ['m1'],
    offer: 'Beyond the east gate lie the Clover Fields. The Jellies and Hoppers there have grown bold. Thin them out for us.',
    finish: 'The farmers can work their fields again. Thank you!',
    goals: [kill('jelly', 6), kill('hopper', 4)], reward: { xp: 160, jobXp: 40, gold: 80 } },
  { id: 'm3', main: true, name: "Hilda's Watch", giver: 'Elder Moss', after: ['m2'],
    offer: 'Guard Hilda keeps watch at the north gate, by the road to the Whisperwood. She sent word she needs help. Go and see her.',
    finish: 'The Elder sent you? Good. I could use a hand.', turnIn: 'Guard Hilda',
    goals: [talk('Guard Hilda')], reward: { xp: 50, gold: 20 } },
  { id: 'm4', main: true, name: 'Whisperwood Spores', giver: 'Guard Hilda', after: ['m3'],
    offer: 'Shroomlings in the Whisperwood spread spores that make travellers sleepy. Bring me 5 Shroom Spores so the priestess can brew a cure.',
    finish: 'Five spores, perfect. Liora will be pleased.',
    goals: [collect('spore', 5)], reward: { xp: 260, jobXp: 60, gold: 120 } },
  { id: 'm5', main: true, name: 'Wolves at the Gate', giver: 'Guard Hilda', after: ['m4'],
    offer: 'Grey Wolves have been prowling close to town. Hunt 5 of them in the Whisperwood.',
    finish: 'The road is safer already. Take these Saat, you have earned them.',
    goals: [kill('wolf', 5)], reward: { xp: 380, jobXp: 80, gold: 150, saat: 2 } },
  { id: 'm6', main: true, name: 'The Mossy Cavern', giver: 'Guard Hilda', after: ['m5'],
    offer: 'The wolves were fleeing something. East of the Whisperwood is the Mossy Cavern, and a giant slime king rules it. Defeat him, then tell Elder Moss.',
    finish: 'The Cavern King is gone? Mossvale owes you a great deal, young hero.', turnIn: 'Elder Moss',
    goals: [kill('cavernking', 1)], reward: { xp: 900, jobXp: 150, gold: 400, saat: 3 } },
  { id: 'm7', main: true, name: 'A Path of Your Own', giver: 'Elder Moss', after: ['m6'],
    offer: 'You have outgrown the Adventurer. Reach Job Level 20, then speak to Class Master Oren and choose your path.',
    finish: 'So the Elder sent you. Then let us talk about your future.', turnIn: 'Class Master Oren',
    goals: [{ type: 'job', n: 20 }, talk('Class Master Oren')], reward: { xp: 600, gold: 300 } },
  // ---- Mossvale side quests
  { id: 's_goo', name: 'Sticky Business', giver: 'Merchant Tilly',
    offer: 'I make the best jelly candy in the realm, and I am out of Jelly Goo! Bring me 5? Jellies drop it.',
    finish: 'Mmm, fresh goo. Here is your share!', goals: [collect('goo', 5)], reward: { xp: 90, gold: 120 } },
  { id: 's_fluff', name: 'Fluffy Pillows', giver: 'Innkeeper Rosa',
    offer: 'My guests keep complaining about flat pillows. Hopper Fluff is the softest filling there is. Could you bring me 6?',
    finish: 'So soft! Rest here any time, dear.', goals: [collect('fluff', 6)], reward: { xp: 130, gold: 80, saat: 1 } },
  { id: 's_pest', name: 'Pest Control', giver: 'Farmer Hobb',
    offer: 'Hoppers from Clover Fields keep nibbling my cabbages. Chase off 8 of them, would you?',
    finish: 'My cabbages thank you!', goals: [kill('hopper', 8)], reward: { xp: 160, gold: 100 } },
  { id: 's_mate', name: 'A Loyal Companion', giver: 'Skill Master Kael',
    offer: 'A true adventurer never travels alone. Weaken a monster below half its health and use Catch.',
    finish: 'It already looks up to you. Take good care of it.', goals: [{ type: 'catch', n: 1 }], reward: { xp: 100, jobXp: 30, gold: 50 } },
  { id: 's_pip', name: 'Jelly Hunt', giver: 'Pip',
    offer: 'Mum says I am too small for the Training Grounds. Can you beat 3 Training Jellies for me? I will give you my shiny thing!',
    finish: 'Wooow! Here, my shiny thing. It is a Saat, I think?', goals: [kill('tjelly', 3)], reward: { xp: 40, saat: 1 } },
  { id: 's_shell', name: 'Hard Shells', giver: 'Blacksmith Doran', minLv: 3,
    offer: 'Rock Crab shells make fine rivets. Pebble Coast is full of crabs, bring me 5 shells.',
    finish: 'Good, solid shells. Here is your pay.', goals: [collect('shell', 5)], reward: { xp: 320, jobXp: 60, gold: 200 } },
  { id: 's_crypt', name: 'Restless Crypt', giver: 'Priestess Liora', minLv: 7,
    offer: 'South of Clover Fields lies the Old Crypt. A Lich Shroom stirs the dead there. Put it to rest.',
    finish: 'The crypt is quiet again. May these Saat protect you.', goals: [kill('lichshroom', 1)], reward: { xp: 1300, jobXp: 200, gold: 500, saat: 5 } },
  { id: 's_tour', name: 'A Growing Realm', giver: 'Mayor Aldwin',
    offer: 'Mossvale has three sister villages: Brookhollow in the west, Pinecrest beyond the Whisperwood and Saltmere north of Pebble Coast. Visit them all.',
    finish: 'You have seen the whole valley! Tell everyone Mossvale says hello.',
    goals: [visit('brookhollow', 'Brookhollow'), visit('pinecrest', 'Pinecrest'), visit('saltmere', 'Saltmere')], reward: { xp: 320, gold: 250 } },
  { id: 's_salt', name: 'A Taste of Salt', giver: 'Traveller Sable',
    offer: 'Captain Mara in Saltmere owes me a letter. Take her my greetings, will you? Saltmere is north of Pebble Coast.',
    finish: 'Sable sent you? Ha! Tell that rascal to write more often.', turnIn: 'Captain Mara',
    goals: [talk('Captain Mara')], reward: { xp: 180, gold: 90 } },
  // ---- village quests
  { id: 'v_greta', name: 'Hopper Harvest', giver: 'Farmer Greta',
    offer: 'We stuff our winter quilts with Hopper Fluff. Bring me 8 and I will pay well.',
    finish: 'That will keep the little ones warm. Thank you!', goals: [collect('fluff', 8)], reward: { xp: 200, gold: 150 } },
  { id: 'v_bjorn', name: 'Fangs for Pinecrest', giver: 'Chief Bjorn', minLv: 4,
    offer: 'Wolves keep raiding our lumber camp. Bring me 6 Wolf Fangs as proof you have dealt with them.',
    finish: 'Six fangs! You have the heart of a lumberjack.', goals: [collect('fang', 6)], reward: { xp: 420, jobXp: 80, gold: 200 } },
  { id: 'v_wren', name: 'Frost Hollow', giver: 'Ranger Wren', minLv: 10,
    offer: 'North of the Whisperwood lies Frost Hollow. Its Alpha Frost Wolf leads the packs. Only a seasoned hero can face it.',
    finish: 'The Alpha is down? The forest can breathe again.', goals: [kill('frostalpha', 1)], reward: { xp: 1800, jobXp: 250, gold: 600, saat: 5 } },
  { id: 'v_mara', name: 'Tide Jellies', giver: 'Captain Mara', minLv: 3,
    offer: 'Tide Jellies clog our nets on Pebble Coast. Clear out 8 of them.',
    finish: 'Our nets are free again. Fair winds, friend!', goals: [kill('bluejelly', 8)], reward: { xp: 360, gold: 180 } },
  { id: 'v_queen', name: 'Queen of the Grotto', giver: 'Captain Mara', after: ['v_mara'], minLv: 6,
    offer: 'The Tide Jellies come from the Sunken Grotto, south of Pebble Coast. A Crab Queen nests there. Defeat her!',
    finish: 'The Grotto Queen, beaten! Saltmere will sing of you.', goals: [kill('crabqueen', 1)], reward: { xp: 1100, jobXp: 180, gold: 450, saat: 3 } },
];
const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
const turnInOf = (q) => q.turnIn || q.giver;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createQuests({ $, audio, toast, getHero, getJob, getMapId, reward, fx }) {
  let st = { active: {}, done: [], items: {} };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* no storage */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* not saved */ } };
  const done = (id) => st.done.includes(id);

  const available = (q) => !done(q.id) && !st.active[q.id] && (q.after || []).every(done) && getHero().lv >= (q.minLv || 1);
  const goalName = (g) => {
    if (g.type === 'kill') return `Defeat ${g.target.map((t) => MONSTER_TYPES[t].name).join(' or ')}`;
    if (g.type === 'collect') return `Collect ${ITEMS[g.item].name}`;
    if (g.type === 'talk') return `Talk to ${g.npc}`;
    if (g.type === 'visit') return `Visit ${g.name}`;
    if (g.type === 'catch') return 'Catch a companion';
    if (g.type === 'job') return 'Reach Job Lv. 20';
    return g.type;
  };
  const goalCount = (q, i) => {
    const g = q.goals[i];
    if (g.type === 'collect') return Math.min(g.n, st.items[g.item] || 0);
    if (g.type === 'job') return getJob() >= g.n ? g.n : getJob();
    return Math.min(g.n, st.active[q.id]?.[i] || 0);
  };
  const goalDone = (q, i) => goalCount(q, i) >= q.goals[i].n;
  // talking to the turn-in NPC is part of finishing, so talk goals for that NPC don't block "ready"
  const ready = (q) => q.goals.every((g, i) => goalDone(q, i) || (g.type === 'talk' && g.npc === turnInOf(q)));
  const rewardText = (r) => [r.xp && `${r.xp} XP`, r.jobXp && `${r.jobXp} Job XP`, r.gold && `${r.gold} gold`, r.saat && `${r.saat} Saat`].filter(Boolean).join(' · ');

  function bump(q, i, by = 1) {
    const a = st.active[q.id];
    const before = a[i] || 0;
    a[i] = Math.min(q.goals[i].n, before + by);
    if (a[i] === before) return;
    const g = q.goals[i];
    if (g.n > 1 || g.type !== 'talk') toast(`${q.name}: ${goalName(g)} ${a[i]} / ${g.n}`);
    if (ready(q)) { audio.sfx('jobUp'); toast(`${q.name}: complete! Return to ${turnInOf(q)}.`, 4000); }
    save(); renderTracker();
  }
  function activeQuests() { return Object.keys(st.active).map((id) => BY_ID[id]).filter(Boolean); }

  // ---------------------------------------------------------------- world events
  function onKill(typeId) {
    for (const q of activeQuests()) q.goals.forEach((g, i) => { if (g.type === 'kill' && g.target.includes(typeId) && !goalDone(q, i)) bump(q, i); });
    // quest item drops
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!it.from.includes(typeId)) continue;
      const need = activeQuests().some((q) => q.goals.some((g, i) => g.type === 'collect' && g.item === id && !goalDone(q, i)));
      if (!need || Math.random() > it.chance) continue;
      st.items[id] = (st.items[id] || 0) + 1;
      const q = activeQuests().find((q) => q.goals.some((g) => g.type === 'collect' && g.item === id));
      const g = q.goals.find((g) => g.type === 'collect' && g.item === id);
      audio.sfx('stones');
      toast(`+1 ${it.name} (${Math.min(g.n, st.items[id])} / ${g.n})`);
      if (ready(q)) { audio.sfx('jobUp'); toast(`${q.name}: complete! Return to ${turnInOf(q)}.`, 4000); }
      save(); renderTracker();
    }
  }
  function onEvent(type, value) {
    for (const q of activeQuests()) q.goals.forEach((g, i) => {
      if (goalDone(q, i)) return;
      if (type === 'catch' && g.type === 'catch') bump(q, i);
      if (type === 'visit' && g.type === 'visit' && g.map === value) bump(q, i);
    });
    if (type === 'job') { renderTracker(); for (const q of activeQuests()) if (q.goals.some((g) => g.type === 'job') && ready(q) && value === 20) toast(`${q.name}: complete! Return to ${turnInOf(q)}.`, 4000); }
  }

  // ---------------------------------------------------------------- NPCs
  // marker over an NPC: '?' ready to hand in, '!' new quest, '…' in progress
  function marker(name) {
    const act = activeQuests();
    if (act.some((q) => turnInOf(q) === name && ready(q))) return 'ready';
    if (act.some((q) => q.goals.some((g, i) => g.type === 'talk' && g.npc === name && !goalDone(q, i) && turnInOf(q) !== name))) return 'ready';
    if (QUESTS.some((q) => q.giver === name && available(q))) return 'new';
    if (act.some((q) => turnInOf(q) === name)) return 'busy';
    return '';
  }
  // talking to an NPC: returns true when a quest window opened
  function talkTo(name) {
    // talk goals for someone who is not the turn-in NPC
    for (const q of activeQuests()) q.goals.forEach((g, i) => { if (g.type === 'talk' && g.npc === name && turnInOf(q) !== name && !goalDone(q, i)) bump(q, i); });
    const turnIns = activeQuests().filter((q) => turnInOf(q) === name && ready(q));
    const offers = QUESTS.filter((q) => q.giver === name && available(q));
    if (!turnIns.length && !offers.length) return false;
    const q = turnIns[0] || offers[0];
    openDialog(name, q, turnIns.length ? 'finish' : 'offer');
    return true;
  }

  // ---------------------------------------------------------------- windows
  const dlg = $('#qdlg');
  function openDialog(npc, q, mode) {
    $('#qd-who').textContent = `${q.main ? 'Main quest · ' : ''}${npc}`;
    $('#qd-title').textContent = q.name;
    $('#qd-text').textContent = mode === 'finish' ? q.finish : q.offer;
    $('#qd-goals').innerHTML = q.goals.map((g, i) => `<li>${esc(goalName(g))}${g.n > 1 ? ` · ${g.n}` : ''}${mode === 'finish' ? ' ✓' : ''}</li>`).join('');
    $('#qd-reward').textContent = `Reward: ${rewardText(q.reward)}`;
    const ok = $('#qd-ok'), no = $('#qd-no');
    ok.textContent = mode === 'finish' ? 'Complete quest' : 'Accept';
    no.textContent = mode === 'finish' ? 'Later' : 'Not now';
    ok.onclick = () => { closeDialog(); if (mode === 'finish') complete(q); else accept(q); };
    no.onclick = closeDialog;
    dlg.hidden = false;
  }
  function closeDialog() { dlg.hidden = true; }
  $('#qd-close').onclick = closeDialog;

  function accept(q) {
    st.active[q.id] = q.goals.map(() => 0);
    save();
    audio.sfx('click');
    toast(`New quest: ${q.name}`, 3000);
    // goals that may already be met (visited places don't count before accepting, levels do)
    if (q.goals.some((g) => g.type === 'visit' && g.map === getMapId())) onEvent('visit', getMapId());
    renderTracker();
  }
  function complete(q) {
    for (const g of q.goals) if (g.type === 'collect') st.items[g.item] = Math.max(0, (st.items[g.item] || 0) - g.n);
    delete st.active[q.id];
    st.done.push(q.id);
    save();
    audio.sfx('levelUp');
    fx?.();
    toast(`Quest complete: ${q.name}!  ${rewardText(q.reward)}`, 4500);
    reward(q.reward);
    renderTracker();
  }
  function abandon(id) { delete st.active[id]; save(); renderTracker(); renderLog(); }

  // tracker (always visible while quests are active) and the quest log (J)
  const track = $('#qtrack');
  function renderTracker() {
    const act = activeQuests().sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0));
    track.hidden = !act.length;
    track.innerHTML = `<b>Quests <small>J</small></b>` + act.slice(0, 4).map((q) => `<div class="qt${ready(q) ? ' ready' : ''}"><span>${q.main ? '★ ' : ''}${esc(q.name)}</span>
      ${ready(q) ? `<small>Return to ${esc(turnInOf(q))}</small>` : q.goals.map((g, i) => `<small class="${goalDone(q, i) ? 'ok' : ''}">${esc(goalName(g))}${g.n > 1 ? ` ${goalCount(q, i)}/${g.n}` : ''}</small>`).join('')}</div>`).join('')
      + (act.length > 4 ? `<small class="more">+${act.length - 4} more in the log</small>` : '');
    if (!log.hidden) renderLog();
  }
  const log = $('#qlog');
  function renderLog() {
    const act = activeQuests();
    const next = QUESTS.filter(available);
    $('#ql-body').innerHTML = `<h4>Active <small>${act.length}</small></h4>` + (act.map((q) => `<div class="ml-game"><b>${q.main ? '★ ' : ''}${esc(q.name)}${ready(q) ? ' <span class="ml-tag">Complete</span>' : ''}</b>
        <small>${esc(q.offer)}</small>
        <ul class="ql-goals">${q.goals.map((g, i) => `<li class="${goalDone(q, i) ? 'ok' : ''}">${esc(goalName(g))}${g.n > 1 ? ` ${goalCount(q, i)} / ${g.n}` : ''}</li>`).join('')}</ul>
        <small>Hand in to ${esc(turnInOf(q))} · Reward: ${rewardText(q.reward)}</small>
        <div class="ml-row"><button data-abandon="${q.id}">Abandon</button></div></div>`).join('') || '<p class="ml-empty">No active quests. Look for NPCs with a yellow !</p>')
      + `<h4>Available <small>${next.length}</small></h4>` + (next.map((q) => `<div class="ml-item"><b>${q.main ? '★ ' : ''}${esc(q.name)}</b><small>From ${esc(q.giver)}</small></div>`).join('') || '<p class="ml-empty">Nothing new right now. Level up to unlock more.</p>')
      + `<p class="ml-note">Completed: ${st.done.length} / ${QUESTS.length}</p>`;
    for (const b of log.querySelectorAll('[data-abandon]')) b.onclick = () => {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Click again to abandon'; return; }
      abandon(b.dataset.abandon);
    };
  }
  function toggleLog(force) {
    log.hidden = force === undefined ? !log.hidden : !force;
    if (!log.hidden) renderLog();
  }
  $('#ql-close').onclick = () => toggleLog(false);
  renderTracker();

  return {
    state: st, onKill, onEvent, marker, talkTo, toggleLog, renderTracker,
    get open() { return !dlg.hidden || !log.hidden; },
    closeAll() { closeDialog(); toggleLog(false); },
    npcsWithMarks: () => QUESTS,
  };
}
