import type { Player } from './shared';
import { SPELLS, spellCastTimeMs, type Spell, type CombatTalents, type SpellStats } from './spells';
import { icon } from './icons';
import { MOUNTS } from './travel';

/** Readable server-authored timing, with no padded whole seconds. */
export const castTimeLabel = (milliseconds: number) => milliseconds <= 0 ? 'Instant' : `${Number((milliseconds / 1000).toFixed(3))}s cast`;
export const spellTimingLabel = (spell: Spell, talents?: CombatTalents, now = Date.now(), stats?: SpellStats) => spell.channel ? `${Number((spell.channel.durationMs / 1000).toFixed(3))}s channel` : castTimeLabel(spellCastTimeMs(spell, stats, talents, now));
export const castLabel = (cast: NonNullable<Player['casting']>) => cast.ability === 'mount' ? MOUNTS.find(mount => mount.id === cast.mount)!.name : SPELLS[cast.ability].label;

let elements: { bar: HTMLElement; icon: HTMLElement; name: HTMLElement; time: HTMLElement; progress: HTMLElement; fill: HTMLElement } | undefined;
let lastAbility = '', lastPercent = -1, lastTime = '';

/** Server time keeps the preparation bar aligned with authoritative cast completion. */
export function updateCastingBar(player: Player | undefined, nowServerMs: number, active: boolean): void {
  if (!elements) {
    const get = (id: string) => document.getElementById(`casting-${id}`);
    const bar = get('bar'), art = get('icon'), name = get('name'), time = get('time'), progress = get('progress'), fill = get('fill');
    if (!bar || !art || !name || !time || !progress || !fill) return;
    elements = { bar, icon: art, name, time, progress, fill };
  }
  const cast = player?.casting, spell = cast && cast.ability !== 'mount' ? SPELLS[cast.ability] : undefined;
  if (!active || !player || player.hp <= 0 || !cast || !spell && cast.ability !== 'mount' || !Number.isFinite(nowServerMs) || !Number.isFinite(cast.startedAt) || !Number.isFinite(cast.endsAt) || cast.endsAt <= cast.startedAt || nowServerMs >= cast.endsAt) {
    elements.bar.hidden = true;
    lastAbility = ''; lastPercent = -1; lastTime = '';
    return;
  }
  elements.bar.hidden = false;
  const label = castLabel(cast), ability = cast.ability === 'mount' ? `mount-${cast.mount}` : cast.ability;
  if (lastAbility !== ability) {
    elements.icon.innerHTML = cast.ability === 'mount' ? `<img class="item-art" src="/ui/mount-${cast.mount}.png" alt=""/>` : icon(spell!.icon);
    elements.name.textContent = cast.channel ? `${label} · Channeling` : label;
    elements.bar.style.setProperty('--cast-color', spell?.color ?? '#e8cc8c');
    lastAbility = ability; lastTime = '';
  }
  const fraction = Math.max(0, Math.min(1, (nowServerMs - cast.startedAt) / (cast.endsAt - cast.startedAt)));
  const fillFraction = cast.channel ? 1 - fraction : fraction;
  const percent = Math.round(fillFraction * 1000) / 10;
  if (percent !== lastPercent) {
    elements.fill.style.width = `${percent}%`;
    elements.progress.setAttribute('aria-valuenow', String(Math.floor(fillFraction * 100)));
    lastPercent = percent;
  }
  const remaining = `${(Math.max(0, cast.endsAt - nowServerMs) / 1000).toFixed(1)}s`;
  if (remaining !== lastTime) {
    elements.time.textContent = remaining;
    elements.progress.setAttribute('aria-valuetext', `${label}${cast.channel ? ", channeling" : ""}, ${remaining} remaining`);
    lastTime = remaining;
  }
}
