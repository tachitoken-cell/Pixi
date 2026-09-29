type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };
type Group = 'joystick' | 'movement' | 'combat';
type Positions = Partial<Record<Group, Point>>;
type Layout = { portrait: Positions; landscape: Positions };
const storageKey = 'mossvale-touch-layout-v1';
const groups: { id: Group; name: string; selectors: string[] }[] = [
  { id: 'joystick', name: 'Joystick', selectors: ['#mobile-move'] },
  { id: 'movement', name: 'Sprint & Jump', selectors: ['#mobile-sprint', '#jump-button'] },
  { id: 'combat', name: 'Combat', selectors: ['#hotbar', '#mobile-actions', '#mobile-target', '#mobile-clear'] },
];

export function readMobileLayout(raw: string | null): Layout {
  const result: Layout = { portrait: {}, landscape: {} };
  try {
    const parsed = JSON.parse(raw || 'null');
    for (const orientation of ['portrait', 'landscape'] as const) for (const { id } of groups) {
      const point = parsed?.[orientation]?.[id];
      if (point && [point.x, point.y].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1))
        result[orientation][id] = { x: point.x, y: point.y };
    }
  } catch { /* Corrupt preferences must never hide gameplay controls. */ }
  return result;
}

export function fitMobileGroup(point: Point, rect: Rect, bounds: Rect): Point {
  return {
    x: Math.max(bounds.left, Math.min(point.x, bounds.left + Math.max(0, bounds.width - rect.width))),
    y: Math.max(bounds.top, Math.min(point.y, bounds.top + Math.max(0, bounds.height - rect.height))),
  };
}

export function mobileGroupsOverlap(rects: Rect[]): boolean {
  return rects.some((a, index) => rects.slice(index + 1).some(b =>
    a.left < b.left + b.width - 1 && a.left + a.width > b.left + 1 && a.top < b.top + b.height - 1 && a.top + a.height > b.top + 1));
}

export function createMobileLayout(options: { begin: () => void; end: () => void; announce: (message: string) => void }) {
  let saved: Layout;
  try { saved = readMobileLayout(localStorage.getItem(storageKey)); } catch { saved = readMobileLayout(null); }
  let draft: Layout | undefined, previousFocus: HTMLElement | null = null, scheduled = false;
  const play = document.getElementById('play-ui'); let wasInert = false;
  let drag: { id: Group; pointer: number; x: number; y: number; origin: Point } | undefined;
  const offsets = new Map<Group, Point>(), rectangles = new Map<Group, Rect>();
  const overlay = document.createElement('section');
  overlay.id = 'mobile-layout-editor'; overlay.hidden = true;
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'mobile-layout-title');
  overlay.innerHTML = `<header class="mobile-layout-toolbar"><div><h2 id="mobile-layout-title">Arrange touch controls</h2><p id="mobile-layout-help">Drag a group, or focus it and use arrow keys. Saved on this device for each orientation.</p></div><div class="mobile-layout-actions"><button type="button" class="primary-button" data-layout-reset>Reset</button><button type="button" class="primary-button" data-layout-cancel>Cancel</button><button type="button" class="primary-button" data-layout-save>Save layout</button></div><p id="mobile-layout-status" role="status" aria-live="polite"></p></header>${groups.map(group => `<button type="button" class="mobile-layout-handle" data-layout-group="${group.id}" aria-label="Move ${group.name}" aria-describedby="mobile-layout-help"><span>${group.name}</span></button>`).join('')}`;
  document.body.append(overlay);
  const safe = document.createElement('div'); safe.className = 'mobile-layout-safe-area'; safe.setAttribute('aria-hidden', 'true'); document.body.append(safe);
  const status = overlay.querySelector<HTMLElement>('#mobile-layout-status')!;
  const save = overlay.querySelector<HTMLButtonElement>('[data-layout-save]')!;
  const orientation = () => innerWidth < innerHeight ? 'portrait' : 'landscape';
  const elements = (id: Group) => groups.find(group => group.id === id)!.selectors.flatMap(selector => [...document.querySelectorAll<HTMLElement>(selector)]);
  function setOffset(id: Group, point: Point) {
    offsets.set(id, point);
    for (const element of elements(id)) {
      element.classList.add('mobile-layout-control');
      element.style.setProperty('--touch-layout-x', `${point.x}px`);
      element.style.setProperty('--touch-layout-y', `${point.y}px`);
    }
  }
  function baseRect(id: Group): Rect | undefined {
    const offset = offsets.get(id) || { x: 0, y: 0 };
    // The second hotbar page button extends above the ring. Include its actual
    // geometry without depending on the number of available action slots.
    const members = elements(id).flatMap(element => [element, ...element.querySelectorAll<HTMLElement>('.hotbar-page')]);
    const rects = members.map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
    if (!rects.length) return;
    const left = Math.min(...rects.map(rect => rect.left)), top = Math.min(...rects.map(rect => rect.top));
    return { left: left - offset.x, top: top - offset.y, width: Math.max(...rects.map(rect => rect.right)) - left, height: Math.max(...rects.map(rect => rect.bottom)) - top };
  }
  function bounds(): Rect {
    const inset = getComputedStyle(safe), view = window.visualViewport;
    const left = (view?.offsetLeft || 0) + parseFloat(inset.paddingLeft), right = parseFloat(inset.paddingRight);
    const top = (view?.offsetTop || 0) + parseFloat(inset.paddingTop), bottom = parseFloat(inset.paddingBottom);
    return { left, top, width: Math.max(0, (view?.width || innerWidth) - left + (view?.offsetLeft || 0) - right), height: Math.max(0, (view?.height || innerHeight) - top + (view?.offsetTop || 0) - bottom) };
  }
  function paint() {
    scheduled = false;
    if (!document.body.classList.contains('mobile-controls')) {
      if (draft) finish(false);
      for (const group of groups) setOffset(group.id, { x: 0, y: 0 });
      return;
    }
    const area = bounds(), positions = (draft || saved)[orientation()];
    rectangles.clear();
    for (const { id } of groups) {
      const base = baseRect(id); if (!base) continue;
      const point = positions[id];
      const desired = point ? { x: area.left + point.x * Math.max(0, area.width - base.width), y: area.top + point.y * Math.max(0, area.height - base.height) } : { x: base.left, y: base.top };
      const fitted = fitMobileGroup(desired, base, area);
      setOffset(id, { x: fitted.x - base.left, y: fitted.y - base.top });
      const rect = { ...base, left: fitted.x, top: fitted.y }; rectangles.set(id, rect);
      const handle = overlay.querySelector<HTMLElement>(`[data-layout-group="${id}"]`)!;
      Object.assign(handle.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }
    const overlap = mobileGroupsOverlap([...rectangles.values()]);
    if (!draft && overlap && Object.keys(positions).length) {
      // Orientation or font/viewport changes can invalidate a once-usable layout.
      // Fall back to authored positions; Settings remains independently reachable.
      saved[orientation()] = {}; persist(); paint();
      options.announce('Touch controls were reset to fit this screen. Arrange them again in Options → Controls.');
      return;
    }
    save.disabled = overlap;
    overlay.classList.toggle('has-overlap', overlap);
    status.textContent = overlap ? 'Move the outlined groups apart before saving.' : `${orientation() === 'portrait' ? 'Portrait' : 'Landscape'} layout · Move Sprint & Jump to the opposite side for two-thumb play.`;
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } }
  function position(id: Group, x: number, y: number) {
    if (!draft) return;
    const rect = rectangles.get(id); if (!rect) return;
    const area = bounds(), fitted = fitMobileGroup({ x, y }, rect, area);
    draft[orientation()][id] = { x: area.width > rect.width ? (fitted.x - area.left) / (area.width - rect.width) : 0, y: area.height > rect.height ? (fitted.y - area.top) / (area.height - rect.height) : 0 };
    paint();
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); return true; } catch { return false; }
  }
  function finish(commit: boolean) {
    if (!draft || commit && save.disabled) return;
    if (commit) saved = draft;
    draft = undefined; drag = undefined; if (play) play.inert = wasInert; overlay.hidden = true; document.body.classList.remove('mobile-layout-editing');
    options.end(); paint();
    if (commit) options.announce(persist() ? 'Touch layout saved on this device.' : 'Touch layout applied. Device storage is unavailable, so it will reset when you reopen the game.');
    if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
    else document.getElementById('mobile-menu-button')?.focus({ preventScroll: true });
  }
  overlay.querySelector('[data-layout-save]')!.addEventListener('click', () => finish(true));
  overlay.querySelector('[data-layout-cancel]')!.addEventListener('click', () => finish(false));
  overlay.querySelector('[data-layout-reset]')!.addEventListener('click', () => {
    if (draft) { draft[orientation()] = {}; paint(); status.textContent = 'Default positions restored for this orientation. Choose Save layout to keep them.'; }
  });
  overlay.addEventListener('pointerdown', event => {
    const handle = (event.target as Element).closest<HTMLElement>('[data-layout-group]');
    if (!handle || event.button !== 0 || drag) return;
    const id = handle.dataset.layoutGroup as Group, rect = rectangles.get(id); if (!rect) return;
    event.preventDefault(); handle.focus(); handle.setPointerCapture(event.pointerId);
    drag = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, origin: { x: rect.left, y: rect.top } };
  });
  overlay.addEventListener('pointermove', event => {
    if (drag?.pointer === event.pointerId) { event.preventDefault(); position(drag.id, drag.origin.x + event.clientX - drag.x, drag.origin.y + event.clientY - drag.y); }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) overlay.addEventListener(type, event => { if (drag?.pointer === (event as PointerEvent).pointerId) drag = undefined; });
  // Capture before the game's window/document input handlers, including bindings
  // that are valid while other panels are open. Keyboard navigation stays local.
  window.addEventListener('keydown', event => {
    if (!draft) return;
    event.stopImmediatePropagation();
    if (event.key === 'Escape') { event.preventDefault(); finish(false); return; }
    if (event.key === 'Tab') {
      const buttons = [...overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); return;
    }
    const id = (event.target as HTMLElement).dataset.layoutGroup as Group | undefined, rect = id && rectangles.get(id);
    if (id && rect && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); const step = event.shiftKey ? 1 : 10;
      position(id, rect.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), rect.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
    }
  }, true);
  const stopOutside = (event: Event) => { if (draft && !overlay.contains(event.target as Node) && !document.getElementById('mobile-reset-zoom')?.contains(event.target as Node)) { event.preventDefault(); event.stopImmediatePropagation(); } };
  for (const type of ['pointerdown', 'pointerup', 'click', 'contextmenu', 'touchend', 'wheel']) window.addEventListener(type, stopOutside, { capture: true, passive: false });
  window.addEventListener('resize', () => { drag = undefined; schedule(); });
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const hotbar = document.getElementById('hotbar'); if (hotbar) new MutationObserver(schedule).observe(hotbar, { childList: true });
  schedule();
  return {
    open() {
      if (draft || !document.body.classList.contains('mobile-controls')) return;
      previousFocus = document.activeElement as HTMLElement;
      options.begin(); wasInert = play?.inert || false; if (play) play.inert = true; draft = structuredClone(saved); overlay.hidden = false; document.body.classList.add('mobile-layout-editing');
      window.dispatchEvent(new Event('mobile-ui-open')); paint();
      overlay.querySelector<HTMLButtonElement>('[data-layout-group]')!.focus({ preventScroll: true });
    },
    close: () => finish(false),
  };
}
