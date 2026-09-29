export interface UnitFrameData {
  id: string;
  name: string;
  playerName?: boolean;
  role?: 'player' | 'gm';
  level?: number;
  hp?: number;
  maxHp?: number;
  subtitle: string;
  className?: string;
  disposition: 'self' | 'friendly' | 'hostile' | 'neutral';
  boss?: boolean;
  effects?: string;
  casting?: { label: string; progress: number };
}

type FrameKind = 'player' | 'target' | 'focus';

/** Stable portrait canvases; only text and meter values change with snapshots. */
export function mountUnitFrames(root: HTMLElement, callbacks: {
  onPlayer: () => void;
  onTargetContext: (event: MouseEvent) => void;
  onTargetOfTarget: () => void;
}) {
  root.hidden = true;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
    const node = document.createElement(tag); node.className = className; return node;
  };
  function make(kind: FrameKind) {
    const frame = element('button', `unit-frame unit-frame-${kind}`); frame.type = 'button'; frame.hidden = true;
    frame.id = kind === 'player' ? 'profile' : `unit-${kind}`;
    const portrait = element('span', 'unit-portrait'), canvas = element('canvas', 'unit-portrait-canvas'), ring = element('span', 'unit-portrait-ring');
    canvas.width = canvas.height = 192; canvas.setAttribute('aria-hidden', 'true'); ring.setAttribute('aria-hidden', 'true');
    const level = element('span', 'unit-level');
    portrait.append(canvas, ring, level);
    const details = element('span', 'unit-details'), name = element('strong', 'unit-name'), subtitle = element('span', 'unit-subtitle');
    if (kind === 'player') { name.id = 'player-name'; subtitle.id = 'player-class'; }
    const health = element('span', 'unit-health'), fill = element('i', 'unit-health-fill'), values = element('span', 'unit-health-values');
    const healthTrack = element('span', 'unit-health-track');
    const current = element('span', 'unit-health-current'), percent = element('span', 'unit-health-percent');
    health.setAttribute('role', 'meter'); health.setAttribute('aria-valuemin', '0');
    fill.setAttribute('aria-hidden', 'true'); values.setAttribute('aria-hidden', 'true');
    if (kind === 'player') fill.id = 'hp-fill';
    values.append(current, percent); healthTrack.append(fill); health.append(healthTrack, values);
    const cast = element('span', 'unit-cast'), castLabel = element('span', 'unit-cast-label'), castFill = element('i', 'unit-cast-fill');
    cast.setAttribute('role', 'progressbar'); cast.setAttribute('aria-valuemin', '0'); cast.setAttribute('aria-valuemax', '100');
    const castTrack = element('span', 'unit-cast-track');
    castLabel.setAttribute('aria-hidden', 'true'); castFill.setAttribute('aria-hidden', 'true'); castTrack.append(castFill); cast.append(castLabel, castTrack);
    const nameRow=element('span','unit-name-row'),badge=element('span','gm-badge');badge.textContent='GM';badge.title='Game master';badge.hidden=true;nameRow.append(name,badge);
    const className=element('span','unit-class');className.hidden=true;nameRow.append(className);
    const effects=element('span','unit-effects');effects.hidden=true;effects.setAttribute('aria-live','off');
    details.append(nameRow, subtitle, health, cast); frame.append(portrait, details, effects); root.append(frame);
    frame.addEventListener('pointerdown', event => event.stopPropagation());
    frame.addEventListener('keydown', event => {
      if (kind === 'target' && (['ContextMenu', 'Enter', ' '].includes(event.key) || event.key === 'F10' && event.shiftKey)) {
        event.preventDefault(); event.stopPropagation(); const bounds = frame.getBoundingClientRect();
        callbacks.onTargetContext(new MouseEvent('contextmenu', { clientX: bounds.left + bounds.width / 2, clientY: bounds.bottom }));
      } else if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
    if (kind === 'player') frame.addEventListener('click', callbacks.onPlayer);
    if (kind === 'focus') frame.addEventListener('click', callbacks.onTargetOfTarget);
    if (kind === 'target') frame.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); callbacks.onTargetContext(event); });
    return { frame, canvas, level, name, badge, className, subtitle, health, fill, current, percent, cast, castLabel, castFill, effects, key: '', kind };
  }
  const player = make('player'), target = make('target'), focus = make('focus');
  const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  function update(view: ReturnType<typeof make>, data: UnitFrameData | null) {
    if (!data) {
      if (!view.key) return;
      view.key = ''; view.frame.hidden = true; view.badge.hidden=true; view.frame.removeAttribute('data-unit-id'); view.frame.removeAttribute('aria-label'); view.frame.title = '';
      view.className.hidden=true;view.className.textContent='';
      view.name.textContent = view.subtitle.textContent = view.level.textContent = view.current.textContent = view.percent.textContent = view.castLabel.textContent = '';
      view.name.title = view.subtitle.title = view.level.title = view.castLabel.title = ''; view.fill.style.width = view.castFill.style.width = '0%';
      view.health.hidden = view.cast.hidden = view.effects.hidden = true; view.effects.textContent='';
      for (const attribute of ['aria-valuenow', 'aria-valuemax', 'aria-valuetext', 'aria-label']) view.health.removeAttribute(attribute);
      view.cast.removeAttribute('aria-valuenow'); view.cast.removeAttribute('aria-label');
      return;
    }
    const hasHealth = Number.isFinite(data.hp) && Number.isFinite(data.maxHp) && data.maxHp! > 0;
    const hp = hasHealth ? Math.max(0, Math.min(data.maxHp!, data.hp!)) : 0, maxHp = hasHealth ? data.maxHp! : 0;
    const healthPercent = hasHealth ? Math.round(hp / maxHp * 100) : 0;
    const level = Number.isFinite(data.level) && data.level! >= 1 ? Math.floor(data.level!) : null;
    const casting = data.casting && Number.isFinite(data.casting.progress) ? { label: data.casting.label, progress: Math.round(Math.max(0, Math.min(1, data.casting.progress)) * 1000) / 10 } : null;
    const key = JSON.stringify([data.id, data.name, data.playerName, data.role, level, hp, maxHp, data.subtitle, data.className, data.disposition, !!data.boss, casting, data.effects]);
    if (view.key === key) return;
    view.key = key; view.frame.hidden = false; view.frame.dataset.unitId = data.id; view.frame.dataset.disposition = data.disposition;
    view.frame.dataset.boss = String(!!data.boss); view.frame.dataset.dead = String(hasHealth && hp === 0);
    view.name.setAttribute('translate', data.playerName ? 'no' : 'yes');
    view.frame.dataset.playerName = data.playerName ? data.name : '';
    view.badge.hidden=data.role!=='gm';view.name.textContent = data.name; view.name.title = data.name; view.subtitle.textContent = data.subtitle; view.subtitle.title = data.subtitle;
    view.className.hidden = view.kind !== 'player' || !data.className; view.className.textContent = data.className || '';
    view.level.hidden = level === null; view.level.textContent = level === null ? '' : String(level); view.level.title = level === null ? '' : `Level ${level}`;
    view.health.hidden = !hasHealth;
    const healthText = hasHealth ? `${number(hp)} / ${number(maxHp)}` : '';
    view.current.textContent = healthText; view.percent.textContent = hasHealth ? `${healthPercent}%` : ''; view.fill.style.width = `${hasHealth ? hp / maxHp * 100 : 0}%`;
    if (hasHealth) {
      view.health.setAttribute('aria-label', `${data.name} health`); view.health.setAttribute('aria-valuenow', String(hp)); view.health.setAttribute('aria-valuemax', String(maxHp));
      view.health.setAttribute('aria-valuetext', `${healthText} health (${healthPercent}%)`);
    } else for (const attribute of ['aria-valuenow', 'aria-valuemax', 'aria-valuetext', 'aria-label']) view.health.removeAttribute(attribute);
    view.effects.hidden=!data.effects;view.effects.textContent=data.effects||'';view.effects.title=data.effects?`Your damage over time: ${data.effects}`:'';
    view.cast.hidden = !casting;
    if (casting) { view.castLabel.textContent = casting.label; view.castLabel.title = casting.label; view.castFill.style.width = `${casting.progress}%`; view.cast.setAttribute('aria-label', `Casting ${casting.label}`); view.cast.setAttribute('aria-valuenow', String(casting.progress)); }
    else { view.castLabel.textContent = ''; view.cast.removeAttribute('aria-valuenow'); view.cast.removeAttribute('aria-label'); }
    const action = view.kind === 'player' ? 'Open character and gear' : view.kind === 'focus' ? 'Select target of target' : 'Right-click to interact';
    const summary = `${data.name}${data.role==='gm'?' · Game master':''}${level === null ? '' : ` · Level ${level}`}${data.className && data.className !== data.subtitle ? ` · ${data.className}` : ''}${data.subtitle ? ` · ${data.subtitle}` : ''}${hasHealth ? ` · Health ${healthText} (${healthPercent}%)` : ''}${data.boss ? ' · World boss' : ''}${data.effects ? ` · Your effects: ${data.effects}` : ''}`;
    view.frame.title = `${summary} · ${action}`; view.frame.setAttribute('aria-label', `${summary}. ${action}.`);
  }
  return {
    canvases: { player: player.canvas, target: target.canvas, focus: focus.canvas },
    update(playerData: UnitFrameData | null, targetData: UnitFrameData | null, focusData: UnitFrameData | null) {
      const hidden = !playerData;
      if (root.hidden !== hidden) root.hidden = hidden;
      update(player, playerData); update(target, targetData); update(focus, targetData ? focusData : null);
    },
    clear() { root.hidden = true; update(player, null); update(target, null); update(focus, null); },
  };
}
