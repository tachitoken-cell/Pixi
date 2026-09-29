import { translateText } from './localization';
import { gameKey } from './keybindings';
import type { Player } from './shared';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, achievementProgress, achievementPoints } from './achievements';
import { icon } from './icons';
import { TITLES, getTitle, titleUnlocked, playerTitle } from './titles';
import './achievements.css';

type Category = 'Summary' | 'All' | typeof ACHIEVEMENT_CATEGORIES[number];
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number) => value.toLocaleString();
const emblem = '<img src="/ui/achievement-emblem.png" alt="" width="72" height="72" loading="lazy" decoding="async">';

export function mountAchievementsUI(options: {
  trigger: HTMLButtonElement;
  allowed: () => boolean;
  onOpen: () => void;
  onSelectTitle: (titleId: string | null) => void;
}) {
  const panel = document.createElement('section');
  panel.id = 'achievements-window';
  panel.hidden = true;
  panel.role = 'dialog';
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'achievements-title');
  panel.innerHTML = `<header class="achievements-heading">${emblem}<div><h2 id="achievements-title">Achievements</h2><p id="achievements-character">Your story in Mossvale</p></div><div class="achievements-score"><strong id="achievement-points">0</strong><span>Achievement points</span></div><button type="button" data-achievements-close aria-label="Close achievements">${icon('close')}</button></header>
    <div class="achievements-layout"><nav class="achievement-categories" aria-label="Achievement categories">${(['Summary', 'All', ...ACHIEVEMENT_CATEGORIES] as Category[]).map(category => `<button type="button" data-category="${category}" aria-pressed="${category === 'Summary'}" aria-controls="achievement-content"><span>${category === 'All' ? 'All achievements' : category}</span><small></small></button>`).join('')}<p>Every adventure leaves a mark.</p></nav>
    <div class="achievement-pages"><div class="achievement-tools"><input type="search" id="achievement-search" aria-label="Search achievements" placeholder="Search achievements…" autocomplete="off" maxlength="100"><select id="achievement-filter" aria-label="Achievement status"><option value="all">All statuses</option><option value="progress">In progress</option><option value="earned">Earned</option></select></div><div id="achievement-content" tabindex="0"></div></div></div>
    <footer class="achievements-footer"><label class="achievement-title-picker" for="achievement-title">Displayed title<select id="achievement-title" aria-describedby="achievement-title-status"></select></label><span id="achievement-title-status" role="status">Your title appears beneath your name.</span></footer>`;
  const notification = document.createElement('div');
  notification.className = 'achievement-unlocked';
  notification.role = 'status';
  notification.setAttribute('aria-live', 'polite');
  notification.setAttribute('aria-atomic', 'true');
  notification.hidden = true;
  document.body.append(panel, notification);
  const content = panel.querySelector<HTMLElement>('#achievement-content')!;
  const search = panel.querySelector<HTMLInputElement>('input')!;
  const filter = panel.querySelector<HTMLSelectElement>('#achievement-filter')!;
  const titleSelect = panel.querySelector<HTMLSelectElement>('#achievement-title')!;
  const titleStatus = panel.querySelector<HTMLElement>('#achievement-title-status')!;
  let selectingTitle = false, renderedTitles = '';
  let titleTimer: ReturnType<typeof setTimeout> | undefined;
  const categories = [...panel.querySelectorAll<HTMLButtonElement>('[data-category]')];
  let player: Player | undefined, category: Category = 'Summary', rendered = '';
  let previousFocus: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending: string[] = [], announced = new Set<string>();
  const earned = (id: string) => player?.achievements?.unlocked[id];

  function progressBar(value: number, total: number, label: string) {
    return `<progress value="${value}" max="${total}" aria-label="${escape(label)}">${value} / ${total}</progress>`;
  }
  function row(achievement: typeof ACHIEVEMENTS[number]) {
    const date = earned(achievement.id), value = achievementProgress(achievement, player!), rewardTitle = TITLES.find(title => title.achievementId === achievement.id);
    return `<li class="achievement-row${date ? ' earned' : ''}"><span class="achievement-icon" aria-hidden="true"><img src="/ui/achievements/${achievement.id}.png" alt="" width="48" height="48" loading="lazy" decoding="async"></span><div class="achievement-description"><div class="achievement-row-heading"><h4>${escape(achievement.name)}</h4>${date ? `<time datetime="${new Date(date).toISOString()}">${new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>` : ''}</div><p>${escape(achievement.description)}</p>${rewardTitle ? `<p class="achievement-title-reward">Title: &lt;${escape(rewardTitle.name)}&gt;</p>` : ''}<div class="achievement-row-progress">${date ? `<span class="achievement-earned">${icon('check')} Earned</span>` : `${progressBar(value, achievement.target, achievement.name)}<span>${number(value)} / ${number(achievement.target)}</span>`}</div></div><span class="achievement-value" aria-label="${achievement.points} achievement points">${achievement.points}<small>pts</small></span></li>`;
  }
  function render() {
    if (panel.hidden || !player) return;
    const completed = ACHIEVEMENTS.filter(a => earned(a.id));
    const titleOptions = '<option value="">No title</option>' + TITLES.map(title => `<option value="${title.id}" title="${escape(title.description)}" ${titleUnlocked(player!, title) ? '' : 'disabled'}>&lt;${escape(title.name)}&gt;${titleUnlocked(player!, title) ? '' : ' · Locked'}</option>`).join('');
    if (titleOptions !== renderedTitles) { const selected = titleSelect.value; renderedTitles = titleOptions; titleSelect.innerHTML = titleOptions; if (selectingTitle) titleSelect.value = selected; }
    if (!selectingTitle) titleSelect.value = player.title || '';
    titleSelect.disabled = selectingTitle;
    panel.querySelector('#achievement-points')!.textContent = number(achievementPoints(player));
    panel.querySelector('#achievements-character')!.textContent = `${player.name} · ${completed.length} of ${ACHIEVEMENTS.length} earned`;
    for (const button of categories) {
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
      const entries = ACHIEVEMENTS.filter(a => a.category === button.dataset.category);
      button.querySelector('small')!.textContent = entries.length ? `${entries.filter(a => earned(a.id)).length}/${entries.length}` : '';
    }
    let html: string;
    if (category === 'Summary') {
      const recent = [...completed].sort((a, b) => earned(b.id)! - earned(a.id)!).slice(0, 4);
      html = `<section class="achievement-completion" aria-label="Achievement completion"><div class="achievement-completion-ring" style="--completion:${completed.length / ACHIEVEMENTS.length * 100}%"><strong>${Math.round(completed.length / ACHIEVEMENTS.length * 100)}%</strong></div><div><h3>${completed.length} of ${ACHIEVEMENTS.length} earned</h3><p>${ACHIEVEMENTS.length - completed.length} left · ${number(ACHIEVEMENTS.filter(entry => !earned(entry.id)).reduce((sum, entry) => sum + entry.points, 0))} points to discover</p></div></section><div class="achievement-overview">${ACHIEVEMENT_CATEGORIES.map(name => {
        const entries = ACHIEVEMENTS.filter(a => a.category === name), count = entries.filter(a => earned(a.id)).length;
        return `<button type="button" data-category="${name}"><span>${name}<small>${count} / ${entries.length}</small></span>${progressBar(count, entries.length, `${name} achievements earned`)}</button>`;
      }).join('')}</div><div class="achievement-section-heading"><h3>${recent.length ? 'Recent achievements' : 'Your first milestones'}</h3></div>${!recent.length ? '<p class="achievement-intro">Your story is just beginning. Play, explore, and earn your first achievement.</p>' : ''}<ul class="achievement-list">${(recent.length ? recent : ['first-victory', 'hands-on', 'growing-roots'].map(id => ACHIEVEMENTS.find(a => a.id === id)!)).map(row).join('')}</ul>`;
    } else {
      const query = search.value.trim().toLocaleLowerCase();
      const entries = ACHIEVEMENTS.filter(a => (category === 'All' || a.category === category) && (filter.value === 'all' || (filter.value === 'earned' ? !!earned(a.id) : !earned(a.id))) && `${a.name} ${a.description} ${a.category} ${translateText(a.name)} ${translateText(a.description)} ${translateText(a.category)}`.toLocaleLowerCase().includes(query));
      entries.sort((a, b) => Number(!!earned(b.id)) - Number(!!earned(a.id)) || achievementProgress(b, player!) / b.target - achievementProgress(a, player!) / a.target);
      html = `<div class="achievement-section-heading"><h3>${category === 'All' ? 'All achievements' : category}</h3><span role="status">${entries.length} ${entries.length === 1 ? 'achievement' : 'achievements'}</span></div>${entries.length ? `<ul class="achievement-list">${entries.map(row).join('')}</ul>` : `<div class="achievement-empty">${icon('compass')}<h3>${query ? 'No matching achievements' : filter.value === 'earned' ? 'A story still to be written' : 'All caught up'}</h3><p>${query ? 'Try another search or choose a different category.' : filter.value === 'earned' ? 'Keep adventuring to earn achievements in this category.' : 'Choose another category to find your next milestone.'}</p></div>`}`;
    }
    if (html !== rendered) {
      const focusedCategory = document.activeElement instanceof HTMLElement && content.contains(document.activeElement) ? document.activeElement.dataset.category : undefined;
      rendered = html; content.innerHTML = html;
      if (focusedCategory) (content.querySelector<HTMLElement>(`[data-category="${focusedCategory}"]`) || content).focus({ preventScroll: true });
    }
  }
  function close(restoreFocus = true) {
    panel.hidden = true;
    options.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function open() {
    if (!options.allowed() || !player) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    options.onOpen();
    panel.hidden = false;
    options.trigger.setAttribute('aria-expanded', 'true');
    render();
    panel.querySelector<HTMLButtonElement>('[data-achievements-close]')!.focus({ preventScroll: true });
  }
  function showNext() {
    const id = pending.shift();
    const achievement = ACHIEVEMENTS.find(a => a.id === id);
    if (!achievement) { notification.hidden = true; timer = undefined; return; }
    notification.innerHTML = `<img src="/ui/achievements/${achievement.id}.png" alt="" width="72" height="72"><div><span>Achievement earned</span><strong>${escape(achievement.name)}</strong><small>+${achievement.points} points</small></div>`;
    notification.hidden = false;
    timer = setTimeout(showNext, 5000);
  }
  panel.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (button?.hasAttribute('data-achievements-close')) close();
    if (button?.dataset.category) {
      category = button.dataset.category as Category;
      if (category === 'Summary') { search.value = ''; filter.value = 'all'; }
      render(); content.scrollTop = 0;
      if (!button.isConnected) content.focus({ preventScroll: true });
    }
  });
  titleSelect.addEventListener('change', () => {
    const id = titleSelect.value || null;
    if (selectingTitle || !options.allowed() || !player || id && !titleUnlocked(player, getTitle(id))) { render(); return; }
    selectingTitle = true; titleSelect.disabled = true; titleStatus.textContent = 'Saving title…';
    options.onSelectTitle(id);
    clearTimeout(titleTimer); titleTimer = setTimeout(() => { selectingTitle = false; titleSelect.disabled = false; titleStatus.textContent = 'No reply from the realm. Try choosing your title again.'; render(); }, 10000);
  });
  search.addEventListener('input', () => { if (category === 'Summary') category = 'All'; render(); content.scrollTop = 0; });
  filter.addEventListener('change', () => { if (category === 'Summary') category = 'All'; render(); content.scrollTop = 0; });
  panel.addEventListener('pointerdown', event => { event.stopPropagation(); options.onOpen(); });
  panel.addEventListener('keydown', event => { event.stopPropagation(); if (event.isComposing || event.metaKey || event.ctrlKey && event.key !== 'Control' || event.altKey && event.key !== 'Alt') return; if (event.key === 'Escape' || gameKey(event) === 'y' && !(event.target instanceof HTMLElement && event.target.matches('input, select, textarea'))) { event.preventDefault(); close(); } });
  options.trigger.setAttribute('aria-controls', panel.id);
  options.trigger.setAttribute('aria-expanded', 'false');
  return {
    open, close, isOpen: () => !panel.hidden,
    toggle() { if (panel.hidden) open(); else close(); },
    update(next: Player) { player = next; render(); },
    titleSelected(titleId: string | null, error?: string) {
      if (!player) return;
      clearTimeout(titleTimer); selectingTitle = false; titleSelect.disabled = false; player = { ...player, title: titleId };
      titleStatus.textContent = error || (playerTitle(player) ? `<${playerTitle(player)}> equipped.` : 'Your title is hidden.'); render();
    },
    unlock(id: string) {
      if (!options.allowed() || announced.has(id) || !ACHIEVEMENTS.some(a => a.id === id)) return;
      announced.add(id); pending.push(id); if (!timer) showNext();
    },
    reset() { close(false); clearTimeout(titleTimer); selectingTitle = false; renderedTitles = ''; titleSelect.disabled = false; titleSelect.replaceChildren(); titleStatus.textContent = 'Your title appears beneath your name.'; player = undefined; category = 'Summary'; search.value = ''; filter.value = 'all'; rendered = ''; content.replaceChildren(); clearTimeout(timer); timer = undefined; pending.length = 0; announced.clear(); notification.hidden = true; },
  };
}
