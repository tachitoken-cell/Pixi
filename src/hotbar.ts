import type { Player } from './shared';
import { spellOutOfRange } from './combat-feedback';
import { SPELLS, spellsForClass, defaultHotbar, hotbarValid, availableHotbar, extendedHotbar, abilityUnlocked, GLOBAL_ATTACK_MS, spellDamage, spellTotalPower, spellUtilityLabel, HOTBAR_PAGE_SIZE, HOTBAR_SIZE, LEGACY_HOTBAR_PAGE_SIZE, type HotbarSlot, type AbilityId } from './spells';
import { combatStats, TALENTS } from './progression';
import { icon } from './icons';
import { spellTimingLabel } from './casting';
import { gameKey, bindingLabel } from './keybindings';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
export const slotLabel = (id: HotbarSlot) => id === null ? 'Empty' : id === 'mend' ? 'Mend' : id === 'interact' ? 'Interact' : SPELLS[id].label;
const slotIcon = (id: HotbarSlot) => id === 'mend' ? 'potion' : id === 'interact' ? 'interact' : id ? SPELLS[id].icon : 'book';
const emptyBank = (): HotbarSlot[] => Array(HOTBAR_PAGE_SIZE).fill(null);
const defaultSlots = (player: Player) => [...defaultHotbar(player.appearance.className, player.level, player.learnedSpells), ...emptyBank()];
const validSlots = (slots: readonly HotbarSlot[], player: Player) => slots.length === HOTBAR_SIZE && [0, 1].every(page => hotbarValid(slots.slice(page * HOTBAR_PAGE_SIZE, (page + 1) * HOTBAR_PAGE_SIZE), player.appearance.className, player.level, player.learnedSpells, player.talents));
const availableSlots = (slots: readonly HotbarSlot[], player: Player) => [0, 1].flatMap(page => availableHotbar(slots.slice(page * HOTBAR_PAGE_SIZE, (page + 1) * HOTBAR_PAGE_SIZE), player.appearance.className, player.level, player.learnedSpells, player.talents));
const sameSlots = (a: readonly HotbarSlot[], b: readonly HotbarSlot[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** Moving an assigned spell swaps slots, so dropping it never silently deletes another spell. */
export function placeHotbar(slots: readonly HotbarSlot[], index: number, ability: HotbarSlot, source?: number | null): HotbarSlot[] {
  const next = [...slots]; if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SIZE) return next;
  const from = ability ? source ?? slots.indexOf(ability) : -1;
  if (from >= 0 && from !== index) next[from] = next[index];
  next[index] = ability; return next;
}

/** Keep rapid local edits visible until their ordered snapshots arrive. */
export function createHotbarState(save: (slots: HotbarSlot[]) => boolean, stale: () => void = () => {}) {
  let player: Player | undefined, slots: HotbarSlot[] = Array(HOTBAR_SIZE).fill(null), authoritative = [...slots];
  let pending: { slots: HotbarSlot[]; at: number }[] = [];
  return {
    get player() { return player; }, get slots() { return [...slots]; }, get saving() { return pending.length > 0; },
    sync(next: Player, now = performance.now()) {
      const incoming = [extendedHotbar(next.hotbar, next.hotbarExtra), next.hotbar2 ? extendedHotbar(next.hotbar2, next.hotbar2Extra) : emptyBank()]
        .flatMap(bank => availableHotbar(bank, next.appearance.className, next.level, next.learnedSpells, next.talents));
      if (next.id !== player?.id) { slots = incoming; pending = []; }
      player = next; authoritative = incoming;
      pending = pending.filter(edit => validSlots(edit.slots, next));
      let acknowledged = -1; pending.forEach((edit, index) => { if (sameSlots(edit.slots, incoming)) acknowledged = index; });
      if (acknowledged >= 0) pending.splice(0, acknowledged + 1);
      if (pending.length && now - pending[pending.length - 1].at > 4000) { pending = []; stale(); }
      slots = pending.length ? [...pending[pending.length - 1].slots] : [...incoming];
    },
    set(next: HotbarSlot[], now = performance.now()) {
      if (!player || !validSlots(next, player)) return false;
      if (sameSlots(slots, next) || !save([...next])) return false;
      slots = [...next]; pending.push({ slots: [...next], at: now }); return true;
    },
    reject() { pending = []; slots = [...authoritative]; },
  };
}

export function renderHotbar(slots: readonly HotbarSlot[], player?: Player, editing = false, page = 0, pageSize = HOTBAR_PAGE_SIZE): string {
  const stats = player && combatStats(player);
  const pages = HOTBAR_SIZE / pageSize;
  if (slots.length === LEGACY_HOTBAR_PAGE_SIZE) slots = [...slots, null, null];
  if (slots.length === HOTBAR_PAGE_SIZE) slots = [...slots, ...emptyBank()];
  return (player ? availableSlots(slots, player) : slots).slice(page * pageSize, (page + 1) * pageSize).map((id, position) => {
    const index = page * pageSize + position;
    const name = slotLabel(id), detail = id && id !== 'mend' && id !== 'interact' ? `${stats ? `${spellTimingLabel(SPELLS[id], player?.combatTalents, Date.now(), stats)} · ` : ''}${SPELLS[id].range}m range · ${SPELLS[id].cooldownMs / 1000}s cooldown` : id === 'mend' ? 'Instant · Restore 55 health · Uses one potion' : id === 'interact' ? `Instant · Gather, loot and interact · ${bindingLabel('e')} also works` : 'Open the spellbook to assign an ability';
    const key = String((position + 1) % HOTBAR_PAGE_SIZE), title = `${name} · Key ${bindingLabel(key)} · ${detail}`;
    return `<button type="button" class="action hotbar-slot ${id ? '' : 'is-empty'}" data-hotbar-slot="${index}" data-hotbar-ability="${id??''}" draggable="${!!id}" aria-label="${editing ? 'Assign to slot' : 'Slot'} ${index + 1}: ${escape(name)}" data-timing-title="${escape(title)}" title="${escape(title)}"><kbd>${escape(bindingLabel(key))}</kbd>${id ? icon(slotIcon(id)) : '<span class="hotbar-empty" aria-hidden="true">+</span>'}<span class="hotbar-name">${escape(name)}</span>${id === 'mend' ? `<small class="hotbar-count">${player?.inventory.potion || 0}</small>` : ''}${id === 'twinshot' ? '<span class="hotbar-proc" hidden aria-hidden="true">Instant</span>' : ''}<span class="hotbar-range" hidden aria-hidden="true">Range</span><span class="hotbar-shade" aria-hidden="true"></span><span class="hotbar-cooldown" aria-hidden="true"></span></button>`;
  }).join('') + (!editing && pages === 2 ? [0, 1].map(bank => `<button type="button" class="hotbar-bank" data-hotbar-bank="${bank}" aria-label="Select hotbar bank ${bank + 1}" aria-pressed="${page === bank}" title="Hotbar bank ${bank + 1}">${bank + 1}</button>`).join('') : '') + `<button type="button" class="hotbar-page" data-hotbar-page="${page}" aria-label="Hotbar bank ${page + 1} of ${pages}. Switch to bank ${(page + 1) % pages + 1}" title="Switch hotbar bank · ${escape(bindingLabel('hotbar-page'))}"><span>Bar ${page + 1} / ${pages}</span><kbd>${escape(bindingLabel('hotbar-page'))}</kbd>${icon('arrow')}</button>`;
}

export function renderSpellbook(player: Player, slots: readonly HotbarSlot[]): string {
  const stats = combatStats(player);
  const choices = spellsForClass(player.appearance.className, true).sort((a, b) => a.requiredLevel - b.requiredLevel).map(spell => ({ id: spell.id as HotbarSlot, label: spell.label, icon: spell.icon, description: spell.description,
    requiredTalent: spell.requiredTalent, requiredLevel: spell.requiredLevel, locked: !abilityUnlocked(spell.id, player.appearance.className, player.level, player.learnedSpells, player.talents),
    meta: `${spellUtilityLabel(spell) ?? (spell.effect === 'buff' ? spell.id === 'lord-of-battle' ? `${spell.markDurationMs! / 1000}s marks · ${spellTotalPower(spell, stats)} triggered damage or healing` : `+${spell.damageBonusPercent}% damage for ${spell.buffDurationMs! / 1000}s` : spell.id === 'tame-beast' ? 'Combat companion' : spell.id === 'combined-assault' ? '150% of your basic damage + 150% of companion basic damage' : `${spell.id === 'venom-detonation' ? 'Remaining poison' : spell.id === 'arcane-volley' ? 7 * spellDamage(spell, stats) + spellDamage(SPELLS['arcane-missile'], stats) : spellTotalPower(spell, stats)} ${spell.effect === 'heal' ? 'healing' : spell.effect === 'shield' ? 'absorption' : spell.status?.ticks ? `total damage including ${spell.status.kind}` : 'damage'}${spell.channel ? ' over the channel' : ''}`)} · ${spellTimingLabel(spell, player.combatTalents, Date.now(), stats)} · ${spell.range}m range · ${spell.cooldownMs / 1000}s cooldown` }));
  const unlocked = choices.filter(spell => !spell.locked).length, total = choices.length;
  choices.push({ id:'mend', label:'Mend', icon:'potion', description:'Restore 55 health using one healing potion.', meta:`Instant · ${player.inventory.potion} potions remaining`, requiredTalent:undefined, requiredLevel:1, locked:false },
    { id:'interact', label:'Interact', icon:'interact', description:'Gather resources, loot remains, and visit quest boards or workshops.', meta:`Instant · Within 3m · ${bindingLabel('e')}: selected or closest`, requiredTalent:undefined, requiredLevel:1, locked:false });
  const renderChoice = (spell: typeof choices[number]) => {
    const requirement = !spell.locked ? '' : spell.requiredTalent ? `Requires ${TALENTS[spell.requiredTalent].branch} talent: ${TALENTS[spell.requiredTalent].label}` : player.level < spell.requiredLevel ? `Requires level ${spell.requiredLevel}` : 'Visit your class trainer to learn';
    return `<div class="spell-catalog-item" data-spell-search="${escape(`${spell.label} ${spell.description}`.toLocaleLowerCase())}"><button type="button" class="spell-choice${spell.locked ? ' is-locked' : ''}" data-book-ability="${spell.id}" data-timing-meta="${escape(spell.meta)}" draggable="${!spell.locked}" aria-pressed="false" aria-label="${escape(`${spell.label}. ${requirement || 'Select to assign to your hotbar'}. ${spell.description} ${spell.meta}`)}" title="${escape(`${spell.label} · ${requirement || spell.description}`)}"${spell.locked ? ' disabled aria-disabled="true"' : ''}>${icon(spell.icon)}<strong class="spell-name">${escape(spell.label)}</strong>${requirement ? `<span class="spell-unlock">${escape(requirement)}</span>` : ''}<span class="spell-copy"><span class="spell-detail-heading">${icon(spell.icon)}<strong>${escape(spell.label)}</strong></span><span class="spell-description">${escape(spell.description)}</span><span class="spell-meta">${escape(spell.meta)}</span><span class="spell-detail-hint">${escape(requirement || "Select this skill, then choose a hotbar slot to equip.")}</span></span></button><small class="spell-onbar" ${slots.includes(spell.id)?'':'hidden'}>On bar</small><button type="button" class="spell-inspect-button" data-spell-inspect="${spell.id}" aria-label="Inspect ${escape(spell.label)}">${escape(spell.label)}</button></div>`;
  };
  const initial = choices.find(spell => !spell.locked) ?? choices[0];
  return `<div class="spellbook-toolbar"><label>${icon('book')}<input type="search" data-spell-search-input placeholder="Search skills" aria-label="Search skills" maxlength="100"></label><span>Level ${player.level} · ${unlocked} / ${total} class skills learned</span></div><div class="spellbook-layout"><div class="spell-library"><section class="spell-category spell-learned" aria-labelledby="spell-learned-title"><h3 id="spell-learned-title">${icon('check')}<span>Learned skills<small>Select or drag to equip</small></span></h3><div class="spell-list" role="group" aria-label="Learned abilities and utilities">${choices.filter(spell => !spell.locked).map(renderChoice).join('')}</div></section><section class="spell-category spell-available" aria-labelledby="spell-available-title"><h3 id="spell-available-title">${icon('book')}<span>Not learned yet<small>Inspect a skill to see its requirements</small></span></h3><div class="spell-list" role="group" aria-label="Skills to learn">${choices.filter(spell => spell.locked).map(renderChoice).join('') || '<p class="spell-empty">All class skills learned.</p>'}</div><button type="button" class="primary-button spell-trainer" data-find-trainer="class">${icon('route')} Find class trainer</button></section><p class="spell-search-empty" hidden>No skills match your search.</p></div><aside class="spell-inspector" data-spell-inspector data-ability="${initial.id}" aria-label="Skill details" aria-live="polite"><span class="spell-detail-heading">${icon(initial.icon)}<strong>${escape(initial.label)}</strong></span><p class="spell-description">${escape(initial.description)}</p><p class="spell-meta">${escape(initial.meta)}</p><span class="spell-detail-hint">Select a skill, then choose a hotbar slot below. Locked skills can be inspected without learning them.</span><button type="button" class="primary-button" data-book-place="${initial.id}">Put on current bar</button></aside></div>
    <section class="hotbar-editor" aria-label="Edit your hotbar"><div class="hotbar-editor-heading"><h3>${icon('sword')}Your hotbar</h3><button type="button" class="primary-button hotbar-reset" data-hotbar-reset>${icon('respawn')} Reset</button></div><div class="hotbar-editor-slots" role="group" aria-label="Choose an ability slot">${renderHotbar(slots, player, true)}</div><p class="hotbar-edit-hint">Drag slots to swap. Select an occupied slot to move or clear it. Switch banks to edit all ${HOTBAR_SIZE} slots. Your configured hotbar keys assign a selected spell to the current bank.</p><p class="hotbar-status" role="status" aria-live="polite">Changes save to this character.</p><div class="hotbar-clear-row"><button type="button" class="primary-button" data-hotbar-clear disabled>${icon('close')} Clear selected slot</button><button type="button" class="primary-button" data-hotbar-cancel disabled>Cancel selection</button></div></section><p class="spellbook-power-note">Power values include your equipped gear and applicable passive talents.</p>`;
}

export function createHotbar(options: { hud: HTMLElement; book: HTMLElement; canEdit: () => boolean; rangeTarget?: () => {distance: number; hostile: boolean} | null; cast: (ability: Exclude<HotbarSlot, null>) => boolean | void; releaseCast?: (ability: AbilityId) => void; save: (slots: HotbarSlot[]) => boolean; notify: (message: string) => void }) {
  const state = createHotbarState(options.save, () => options.notify('Hotbar changes were not saved. Your saved layout has been restored.'));
  let armed: { ability: HotbarSlot; source: number | null } | null = null;
  let drag: { ability: HotbarSlot; characterId: string; source: number | null } | null = null, ignoreClickUntil = 0, lastPaint = '', lastTick = 0, page = 0;
  let heldCast: string | number | undefined;
  let pageSize = HOTBAR_PAGE_SIZE;
  const containers = [options.hud, options.book];
  const unlocked = (ability: HotbarSlot | undefined) => !!state.player && (ability === 'mend' || ability === 'interact' || abilityUnlocked(ability, state.player.appearance.className, state.player.level, state.player.learnedSpells, state.player.talents));
  const slotsIn = () => containers.flatMap(container => [...container.querySelectorAll<HTMLButtonElement>('[data-hotbar-slot]')]);
  function hint(message?: string) {
    const status = options.book.querySelector<HTMLElement>('.hotbar-status');
    const nextMessage = message || (armed ? `${slotLabel(armed.ability)} selected. Choose a hotbar slot${armed.source !== null ? ' or clear it' : ''}.` : state.saving ? 'Saving your layout…' : 'Changes save to this character.');
    if (status && status.textContent !== nextMessage) status.textContent = nextMessage;
    for (const slot of slotsIn()) slot.classList.toggle('is-chosen', armed?.source === Number(slot.dataset.hotbarSlot));
    options.book.querySelectorAll<HTMLButtonElement>('[data-book-ability]').forEach(button => button.setAttribute('aria-pressed', String(armed?.ability === button.dataset.bookAbility)));
    const clear = options.book.querySelector<HTMLButtonElement>('[data-hotbar-clear]'), cancel = options.book.querySelector<HTMLButtonElement>('[data-hotbar-cancel]');
    if (clear) clear.disabled = armed?.source == null; if (cancel) cancel.disabled = !armed;
  }
  function paint(force = false) {
    const nextSize = typeof document !== 'undefined' && document.body.classList.contains('mobile-controls') ? 5 : HOTBAR_PAGE_SIZE;
    if (nextSize !== pageSize) { page = Math.floor(page * pageSize / nextSize); pageSize = nextSize; }
    const key = JSON.stringify([page, pageSize, state.player?.id, state.player?.level, state.player?.learnedSpells, state.player?.talents, state.slots, state.player?.inventory.potion, state.player && combatStats(state.player)]);
    if (force || key !== lastPaint) {
      // A removed native drag source may never bubble dragend back to its container.
      if (drag) cancel();
      lastPaint = key;
      for (const container of [options.hud, options.book.querySelector<HTMLElement>('.hotbar-editor-slots')]) {
        if (!container) continue;
        const active = container.querySelector<HTMLButtonElement>(':focus'), index = active?.dataset.hotbarSlot, bank = active?.dataset.hotbarBank, pageFocused = active?.dataset.hotbarPage !== undefined;
        const pageButton = container.querySelector<HTMLButtonElement>('[data-hotbar-page]');
        const html = renderHotbar(state.slots, state.player, container !== options.hud, page, pageSize);
        if (pageButton) {
          // Keep a thumb's original button and label/icon attached during snapshots.
          container.querySelectorAll('[data-hotbar-slot]').forEach(slot => slot.remove());
          container.querySelectorAll('[data-hotbar-bank]').forEach(button => button.remove());
          pageButton.insertAdjacentHTML('beforebegin', html);
          const nextPage = pageButton.previousElementSibling!;
          for (const name of ['data-hotbar-page', 'aria-label', 'title']) pageButton.setAttribute(name, nextPage.getAttribute(name)!);
          for (const selector of ['span', 'kbd']) pageButton.querySelector(selector)!.textContent = nextPage.querySelector(selector)!.textContent;
          nextPage.remove();
        } else container.innerHTML = html;
        if (index !== undefined) container.querySelector<HTMLButtonElement>(`[data-hotbar-slot="${index}"]`)?.focus({ preventScroll: true });
        if (bank !== undefined) container.querySelector<HTMLButtonElement>(`[data-hotbar-bank="${bank}"]`)?.focus({ preventScroll: true });
        if (pageFocused) container.querySelector<HTMLButtonElement>('[data-hotbar-page]')?.focus({ preventScroll: true });
      }
    }
    options.book.querySelectorAll<HTMLElement>('.spell-catalog-item').forEach(item => { const id = item.querySelector<HTMLElement>('[data-book-ability]')?.dataset.bookAbility; const badge = item.querySelector<HTMLElement>('.spell-onbar'); if (badge) badge.hidden = !state.slots.includes(id as HotbarSlot); });
    hint(); lastTick = 0;
  }
  function switchPage(nextPage = (page + 1) % (HOTBAR_SIZE / pageSize)) {
    if (!state.player || drag || !Number.isInteger(nextPage) || nextPage < 0 || nextPage >= HOTBAR_SIZE / pageSize) return;
    page = nextPage;
    try { localStorage.setItem(`mossvale-hotbar-page:${state.player.id}`, String(Math.floor(page * pageSize / HOTBAR_PAGE_SIZE))); } catch { /* Storage can be unavailable. */ }
    paint();
  }
  function assign(index: number, ability: HotbarSlot, source?: number | null) {
    if (!options.canEdit() || ability !== null && !unlocked(ability)) return;
    state.set(placeHotbar(state.slots, index, ability, source)); armed = null; paint();
  }
  function releaseCast() {
    if (heldCast === undefined) return;
    heldCast = undefined; ignoreClickUntil = performance.now() + 300; options.releaseCast?.('powerful-throw');
  }
  function holdCast(input: string | number) {
    if (heldCast === undefined && unlocked('powerful-throw') && options.cast('powerful-throw') === true) heldCast = input;
  }
  function cancel() { releaseCast(); armed = null; drag = null; if (ignoreClickUntil === Infinity) ignoreClickUntil = performance.now() + 300; slotsIn().forEach(slot => slot.classList.remove('is-drop-target')); hint(); }
  if (options.releaseCast) {
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, event => { if ((event as PointerEvent).pointerId === heldCast) releaseCast(); });
    window.addEventListener('keyup', event => { if ((event.code || event.key.toLowerCase()) === heldCast) releaseCast(); });
    window.addEventListener('pagehide', releaseCast);
  }
  function inspectBook(id: string) {
    const inspector = options.book.querySelector<HTMLElement>('[data-spell-inspector]');
    const choice = [...options.book.querySelectorAll<HTMLButtonElement>('[data-book-ability]')].find(button => button.dataset.bookAbility === id);
    if (!inspector || !choice) return;
    inspector.dataset.ability = id;
    inspector.innerHTML = choice.querySelector<HTMLElement>('.spell-copy')!.innerHTML + (unlocked(id as HotbarSlot) ? `<button type="button" class="primary-button" data-book-place="${escape(id)}">Put on current bar</button>` : '<button type="button" class="primary-button" data-find-trainer="class">Find class trainer</button>');
    options.book.querySelectorAll<HTMLElement>('.spell-catalog-item').forEach(item => item.classList.toggle('is-inspected', item.querySelector<HTMLElement>('[data-book-ability]')?.dataset.bookAbility === id));
  }
  options.book.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('[data-spell-search-input]')) return;
    const query = input.value.trim().toLocaleLowerCase(), items = [...options.book.querySelectorAll<HTMLElement>('[data-spell-search]')];
    items.forEach(item => { item.hidden = !item.dataset.spellSearch!.includes(query); });
    const empty = options.book.querySelector<HTMLElement>('.spell-search-empty'); if (empty) empty.hidden = items.some(item => !item.hidden);
  });
  for (const container of containers) {
    container.addEventListener('pointerdown', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-hotbar-slot]');
      if (!options.releaseCast || container !== options.hud || !button || button.disabled || event.button !== 0 || event.shiftKey || armed || drag || performance.now() < ignoreClickUntil || state.slots[Number(button.dataset.hotbarSlot)] !== 'powerful-throw') return;
      event.preventDefault(); holdCast(event.pointerId); options.hud.setPointerCapture(event.pointerId);
    });
    container.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled || performance.now() < ignoreClickUntil) return;
      if (button.dataset.spellInspect) { inspectBook(button.dataset.spellInspect); return; }
      if (button.dataset.hotbarPage !== undefined) { switchPage(); return; }
      if (button.dataset.hotbarBank !== undefined) { switchPage(Number(button.dataset.hotbarBank)); return; }
      // The spellbook unlock gates layout changes, not using starter abilities or potions.
      if ((container === options.book || (event as MouseEvent).shiftKey || armed) && !options.canEdit()) return;
      if (button.dataset.bookPlace) {
        const ability = button.dataset.bookPlace as HotbarSlot; if (!unlocked(ability)) return;
        const index = state.slots.findIndex((id, index) => id === null && index >= page * pageSize && index < (page + 1) * pageSize);
        if (index < 0) { options.notify('This hotbar page is full. Clear a slot or select a different page.'); return; }
        assign(index, ability); return;
      }
      if ('hotbarReset' in button.dataset) { state.player && state.set(defaultSlots(state.player)); armed = null; paint(); return; }
      if ('hotbarCancel' in button.dataset) { cancel(); return; }
      if ('hotbarClear' in button.dataset && armed?.source != null) { assign(armed.source, null); return; }
      if (button.dataset.bookAbility) { inspectBook(button.dataset.bookAbility); const ability = button.dataset.bookAbility as HotbarSlot; if (!unlocked(ability)) return; armed = { ability, source: null }; hint(); return; }
      if (button.dataset.hotbarSlot === undefined) return;
      const index = Number(button.dataset.hotbarSlot), ability = state.slots[index];
      if (armed) { assign(index, armed.ability, armed.source); return; }
      if (!ability && container === options.book) { hint('Choose a skill in the library, then select this empty slot.'); return; }
      if (container === options.book || (event as MouseEvent).shiftKey) { armed = { ability, source: index }; hint(); if (container === options.hud) options.notify('Select another slot to swap, or press Delete to clear.'); }
      else if (ability && unlocked(ability)) { if (ability !== 'powerful-throw' || heldCast === undefined) options.cast(ability); } else options.notify(`Open the spellbook with ${bindingLabel('k')} to assign an ability.`);
    });
    container.addEventListener('dragstart', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || !button.dataset.bookAbility && button.dataset.hotbarSlot === undefined) return;
      if (!options.canEdit() || !state.player) { event.preventDefault(); return; }
      const ability = button.dataset.bookAbility as HotbarSlot || state.slots[Number(button.dataset.hotbarSlot)];
      if (!ability || button.disabled || !unlocked(ability)) { event.preventDefault(); return; }
      drag = { ability, characterId: state.player.id, source: button.dataset.hotbarSlot === undefined ? null : Number(button.dataset.hotbarSlot) }; ignoreClickUntil = Infinity;
      if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', slotLabel(ability)); }
    });
    const acceptDrop = (event: DragEvent) => {
      const slot = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-hotbar-slot]');
      if (!slot || !drag || drag.characterId !== state.player?.id || !options.canEdit() || !unlocked(drag.ability)) return;
      event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; slot.classList.add('is-drop-target');
    };
    container.addEventListener('dragenter', acceptDrop);
    container.addEventListener('dragover', acceptDrop);
    container.addEventListener('dragleave', event => (event.target as HTMLElement).closest('[data-hotbar-slot]')?.classList.remove('is-drop-target'));
    container.addEventListener('drop', event => {
      const slot = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-hotbar-slot]'); if (!slot || !drag || drag.characterId !== state.player?.id) return;
      event.preventDefault(); assign(Number(slot.dataset.hotbarSlot), drag.ability, drag.source); cancel(); ignoreClickUntil = performance.now() + 300;
    });
    container.addEventListener('dragend', () => { cancel(); ignoreClickUntil = performance.now() + 300; });
    container.addEventListener('keydown', event => {
      if (event.isComposing || event.metaKey || event.ctrlKey && event.key !== 'Control' || event.altKey && event.key !== 'Alt' || (event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return;
      const key = gameKey(event);
      if (key === 'hotbar-page') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) switchPage(); return; }
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-hotbar-slot]');
      if (options.releaseCast && container === options.hud && button && !button.disabled && !armed && !drag && ['Enter', ' '].includes(event.key) && state.slots[Number(button.dataset.hotbarSlot)] === 'powerful-throw') {
        event.preventDefault(); event.stopPropagation(); if (!event.repeat && performance.now() >= ignoreClickUntil) holdCast(event.code || event.key.toLowerCase()); return;
      }
      if (!options.canEdit()) return;
      if (event.key === 'Escape' && armed) { event.preventDefault(); event.stopPropagation(); cancel(); }
      const keySlot = key === '0' ? 9 : Number(key) - 1;
      if (key && /^[0-9]$/.test(key) && keySlot < pageSize && armed) { event.preventDefault(); event.stopPropagation(); assign(page * pageSize + keySlot, armed.ability, armed.source); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const slot = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-hotbar-slot]');
        if (slot) { event.preventDefault(); event.stopPropagation(); assign(Number(slot.dataset.hotbarSlot), null); }
      }
    });
  }
  return {
    get slots() { return state.slots; },
    get page() { return page; },
    switchPage,
    sync(player: Player) { if (player.id !== state.player?.id) {
      cancel(); page = 0; pageSize = HOTBAR_PAGE_SIZE;
      try { page = localStorage.getItem(`mossvale-hotbar-page:${player.id}`) === '1' ? 1 : 0; } catch { /* Storage can be unavailable. */ }
    } state.sync(player); if (armed?.ability && !unlocked(armed.ability)) cancel(); paint(); },
    refresh() { paint(true); },
    reject() { state.reject(); paint(); },
    cancel,
    activateSlot(index: number, input?: string) { if (Number.isInteger(index) && index >= 0 && index < pageSize && !armed && !drag && performance.now() >= ignoreClickUntil) { const ability = state.slots[page * pageSize + index]; if (ability && unlocked(ability)) { if (ability === 'powerful-throw' && options.releaseCast && input) holdCast(input); else options.cast(ability); } } },
    // Requests may be cancelled or rejected; only release snapshots start cooldowns.
    predictCast(_ability: AbilityId, _now: number) { lastTick = 0; },
    updateCooldowns(now: number) {
      if (!state.player || now - lastTick < 100) return; lastTick = now;
      const slots = state.slots, target = options.rangeTarget?.() ?? null, stats = combatStats(state.player);
      // Refresh only timing text: heat and proc changes must not replace a focused or dragged spell.
      for (const button of [...slotsIn(), ...options.book.querySelectorAll<HTMLElement>('[data-book-ability]')]) {
        const id = button.dataset.bookAbility || button.dataset.hotbarAbility;
        if (!id || !Object.hasOwn(SPELLS, id)) continue;
        const timing = ` · ${spellTimingLabel(SPELLS[id as AbilityId], state.player.combatTalents, now, stats)} · `;
        if (button.dataset.timingLabel === timing) continue;
        button.dataset.timingLabel = timing;
        // Localized display text is never a source for the next timing update.
        const meta = button.querySelector<HTMLElement>('.spell-meta');
        if (meta && button.dataset.timingMeta) {
          meta.textContent = button.dataset.timingMeta.replace(/ · (?:Instant|[\d.]+s (?:cast|channel)) · /, timing);
          const inspector = options.book.querySelector<HTMLElement>('[data-spell-inspector]');
          const shownMeta = inspector?.dataset.ability === id ? inspector.querySelector<HTMLElement>('.spell-meta') : null;
          if (shownMeta) shownMeta.textContent = meta.textContent;
        }
        if (button.dataset.timingTitle) button.title = button.dataset.timingTitle.replace(/ · (?:Instant|[\d.]+s (?:cast|channel)) · /, timing);
      }
      for (const button of slotsIn()) {
        const ability = slots[Number(button.dataset.hotbarSlot)]; let remaining = 0, total = 1;
        if (ability && ability !== 'mend' && ability !== 'interact') {
          const readyAt = state.player.abilityCooldowns?.[ability] || 0;
          remaining = Math.max(0, readyAt - now); total = Math.max(1, SPELLS[ability].cooldownMs);
          const globalRemaining = Math.max(0, (state.player.globalCooldownUntil || 0) - now);
          if (globalRemaining > remaining) { remaining = globalRemaining; total = GLOBAL_ATTACK_MS; }
        }
        const outOfRange=!!ability&&ability!=='mend'&&ability!=='interact'&&spellOutOfRange(SPELLS[ability],target);
        button.classList.toggle('is-out-of-range',outOfRange);
        const rangeHint=button.querySelector<HTMLElement>('.hotbar-range');if(rangeHint)rangeHint.hidden=!outOfRange;
        const instantReady = ability === 'twinshot' && state.player.hp > 0 && (state.player.combatTalents?.twinshotReadyUntil ?? 0) > now;
        button.classList.toggle('is-proc-ready', instantReady);
        const procHint = button.querySelector<HTMLElement>('.hotbar-proc'); if (procHint) procHint.hidden = !instantReady;
        button.setAttribute('aria-label',`Slot ${Number(button.dataset.hotbarSlot)+1}: ${slotLabel(ability)}${instantReady?' · Instant cast ready':''}${outOfRange?' · Out of range':''}`);
        const casting = state.player.casting;
        button.classList.toggle('is-casting', !!casting && state.player.hp > 0 && casting.ability === ability && now < casting.endsAt);
        button.style.setProperty('--cooldown', `${Math.min(100, remaining / total * 100)}%`);
        button.querySelector<HTMLElement>('.hotbar-cooldown')!.textContent = remaining ? (remaining < 1000 ? (remaining / 1000).toFixed(1) : String(Math.ceil(remaining / 1000))) : '';
        button.setAttribute('aria-disabled', String(button.closest('#hotbar') !== null && remaining > 0));
      }
    },
  };
}
