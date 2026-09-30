// Skill tree: every level up gives 1 skill point. Spend points on three branches (Power, Guard, Mana) and on
// upgrading your learned skills (each up to Lv. 5: more damage, shorter cooldown). Resetting is free.
export const BRANCHES = [
  { id: 'power', name: 'Power', color: '#ff7a5a', nodes: [
    { id: 'edge', name: 'Sharp Edge', max: 5, desc: (r) => `Attack +${4 * r}%`, per: 'Attack +4% per rank' },
    { id: 'eye', name: 'Critical Eye', max: 5, need: 'edge', lv: 3, desc: (r) => `Crit chance +${2 * r}%`, per: 'Crit chance +2% per rank' },
    { id: 'deadly', name: 'Deadly Strikes', max: 3, need: 'eye', lv: 6, desc: (r) => `Crit damage +${10 * r}%`, per: 'Crit damage +10% per rank' },
    { id: 'berserk', name: 'Berserker', max: 1, need: 'deadly', lv: 10, desc: () => '+20% damage while below half HP', per: '+20% damage while below half HP' },
  ] },
  { id: 'guard', name: 'Guard', color: '#6aa8ff', nodes: [
    { id: 'skin', name: 'Tough Skin', max: 5, desc: (r) => `Max HP +${6 * r}%`, per: 'Max HP +6% per rank' },
    { id: 'iron', name: 'Iron Body', max: 5, need: 'skin', lv: 3, desc: (r) => `Defence +${6 * r}%`, per: 'Defence +6% per rank' },
    { id: 'wind', name: 'Second Wind', max: 3, need: 'iron', lv: 6, desc: (r) => `HP regeneration +${25 * r}%`, per: 'HP regeneration +25% per rank' },
    { id: 'blessing', name: 'Saat Blessing', max: 1, need: 'wind', lv: 10, desc: () => 'Saat revive costs 4 instead of 5', per: 'Saat revive costs 4 instead of 5' },
  ] },
  { id: 'mana', name: 'Mana', color: '#5ae0e8', nodes: [
    { id: 'well', name: 'Mana Well', max: 5, desc: (r) => `Max MP +${8 * r}%`, per: 'Max MP +8% per rank' },
    { id: 'mind', name: 'Clear Mind', max: 5, need: 'well', lv: 3, desc: (r) => `MP regeneration +${25 * r}%`, per: 'MP regeneration +25% per rank' },
    { id: 'thrift', name: 'Efficiency', max: 3, need: 'mind', lv: 6, desc: (r) => `Skills cost ${10 * r}% less MP`, per: 'Skills cost 10% less MP per rank' },
    { id: 'shield', name: 'Mana Shield', max: 1, need: 'thrift', lv: 10, desc: () => '20% of damage taken is paid with MP', per: '20% of damage taken is paid with MP' },
  ] },
];
const NODES = Object.fromEntries(BRANCHES.flatMap((b) => b.nodes.map((n) => [n.id, { ...n, branch: b }])));
export const SKILL_MAX = 5;

export function createSkillTree({ $, audio, toast, getHero, getSkills, isLearned, onChange }) {
  const st = { nodes: {}, skills: {} };
  const rank = (id) => st.nodes[id] || 0;
  const spent = () => Object.values(st.nodes).reduce((a, b) => a + b, 0) + Object.values(st.skills).reduce((a, b) => a + b - 1, 0);
  const points = () => Math.max(0, getHero().lv - 1 - spent());
  const skillLv = (id) => st.skills[id] || 1;

  const canNode = (n) => points() > 0 && rank(n.id) < n.max && getHero().lv >= (n.lv || 1) && (!n.need || rank(n.need) > 0);
  const canSkill = (sk) => points() > 0 && isLearned(sk) && skillLv(sk.id) < SKILL_MAX && getHero().lv >= skillLv(sk.id) * 2;

  const win = $('#treewin');
  function render() {
    if (win.hidden) return;
    $('#tr-points').textContent = `${points()} skill point${points() === 1 ? '' : 's'} · 1 per level up`;
    $('#tr-branches').innerHTML = BRANCHES.map((b) => `<div class="tr-branch" style="--c:${b.color}"><h4>${b.name}</h4>${b.nodes.map((n) => {
      const r = rank(n.id), locked = (n.need && !rank(n.need)) || getHero().lv < (n.lv || 1);
      return `<button class="tr-node${r ? ' on' : ''}${locked ? ' locked' : ''}" data-node="${n.id}" ${canNode(n) ? '' : 'disabled'}>
        <b>${n.name}</b><span class="tr-rank">${r} / ${n.max}</span><small>${r ? n.desc(r) : n.per}</small>
        ${locked ? `<em>${getHero().lv < (n.lv || 1) ? `Lv. ${n.lv}` : ''}${n.need && !rank(n.need) ? `${getHero().lv < (n.lv || 1) ? ' · ' : ''}needs ${NODES[n.need].name}` : ''}</em>` : ''}</button>`;
    }).join('<i class="tr-link"></i>')}</div>`).join('');
    const skills = getSkills().filter((sk) => isLearned(sk));
    $('#tr-skills').innerHTML = skills.map((sk) => {
      const l = skillLv(sk.id);
      return `<div class="tr-skill"><b>${sk.name} <span>Lv. ${l} / ${SKILL_MAX}</span></b><small>Damage +${(l - 1) * 12}% · Cooldown −${(l - 1) * 5}%${l < SKILL_MAX ? ` · next level needs hero Lv. ${l * 2}` : ''}</small>
        <button data-skill="${sk.id}" ${canSkill(sk) ? '' : 'disabled'}>${l >= SKILL_MAX ? 'Max' : '+1'}</button></div>`;
    }).join('') || '<p class="ml-empty">Learn skills from Skill Master Kael to upgrade them here.</p>';
    for (const b of win.querySelectorAll('[data-node]')) b.onclick = () => { const n = NODES[b.dataset.node]; if (!canNode(n)) return; st.nodes[n.id] = rank(n.id) + 1; audio.sfx('jobUp'); onChange(); render(); };
    for (const b of win.querySelectorAll('[data-skill]')) b.onclick = () => { const sk = getSkills().find((k) => k.id === b.dataset.skill); if (!canSkill(sk)) return; st.skills[sk.id] = skillLv(sk.id) + 1; audio.sfx('jobUp'); toast(`${sk.name} is now Lv. ${st.skills[sk.id]}!`); onChange(); render(); };
  }
  $('#tr-reset').onclick = () => { st.nodes = {}; st.skills = {}; audio.sfx('click'); toast('Skill tree reset: all points refunded.'); onChange(); render(); };
  $('#tr-close').onclick = () => toggle(false);
  function toggle(force) { win.hidden = force === undefined ? !win.hidden : !force; render(); }

  return {
    state: st, rank, points, skillLv, toggle, render,
    get open() { return !win.hidden; },
    // stat multipliers used by the game
    atk: () => 1 + 0.04 * rank('edge'), crit: () => 0.02 * rank('eye'), critDmg: () => 0.1 * rank('deadly'), berserk: () => rank('berserk') > 0,
    hp: () => 1 + 0.06 * rank('skin'), def: () => 1 + 0.06 * rank('iron'), hpRegen: () => 1 + 0.25 * rank('wind'), saatCost: () => (rank('blessing') ? 4 : 5),
    mp: () => 1 + 0.08 * rank('well'), mpRegen: () => 1 + 0.25 * rank('mind'), mpCost: () => 1 - 0.1 * rank('thrift'), manaShield: () => (rank('shield') ? 0.2 : 0),
    skillDmg: (id) => 1 + 0.12 * (skillLv(id) - 1), skillCd: (id) => 1 - 0.05 * (skillLv(id) - 1),
  };
}
