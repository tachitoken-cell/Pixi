import type { Player } from './shared';
import { renderItemTooltip, preserveItemRollDetails } from './item-tooltip';

/** One delegated tooltip survives bag refreshes without replacing the item controls. */
export function mountItemHover(getPlayer: () => Player | undefined) {
  const tooltip = document.createElement('div');
  tooltip.id = 'item-hover-tooltip';
  tooltip.className = 'item-hover-tooltip';
  tooltip.setAttribute('role', 'dialog');
  tooltip.setAttribute('aria-label', 'Item details');
  tooltip.setAttribute('aria-modal', 'false');
  tooltip.setAttribute('popover', 'manual');
  tooltip.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
  tooltip.hidden = true;
  document.body.append(tooltip);
  let anchor: HTMLElement | null = null, dismissed: HTMLElement | null = null, closeTimer = 0, refreshTimer = 0, touch = false;
  let pointerX = -1, pointerY = -1, rendered = '';
  const contents = (id: string) => {
    const html = renderItemTooltip(id, getPlayer());
    return html && html + (html.includes('data-item-roll=') ? '<div class="item-sheet-note">Press F2 to focus roll details.</div>' : '');
  };
  const item = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-item-tooltip]') : null;
  const cancelClose = () => window.clearTimeout(closeTimer);
  const hide = () => {
    cancelClose();
    window.clearInterval(refreshTimer);
    if (anchor) {
      const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tooltip.id);
      if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' ')); else anchor.removeAttribute('aria-describedby');
    }
    anchor = null;
    if (tooltip.matches(':popover-open')) tooltip.hidePopover();
    tooltip.hidden = true;
  };
  const position = () => {
    if (!anchor) return;
    const scrollTop = tooltip.scrollTop;
    tooltip.style.maxHeight = '';
    const rect = anchor.getBoundingClientRect(), width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const rightFits = rect.right + 10 + width <= window.innerWidth - 8, leftFits = rect.left - width - 10 >= 8;
    let left = rightFits ? rect.right + 10 : rect.left - width - 10, top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
    if (!rightFits && !leftFits) {
      // Keep the item clickable on narrow screens; scroll the preview in the larger vertical gap.
      const above = rect.top - 18, below = window.innerHeight - rect.bottom - 18, under = below >= height || below >= above;
      tooltip.style.maxHeight = `${Math.max(40, under ? below : above)}px`;
      left = rect.left; top = under ? rect.bottom + 10 : rect.top - tooltip.offsetHeight - 10;
    }
    tooltip.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
    tooltip.scrollTop = scrollTop;
  };
  const refresh = () => {
    if (!anchor?.isConnected || !anchor.getClientRects().length || anchor.closest('[hidden], [inert]')) { hide(); return; }
    const html = contents(anchor.dataset.itemTooltip || '');
    if (!html) { hide(); return; }
    if (rendered !== html) { const restore = preserveItemRollDetails(tooltip); tooltip.innerHTML = html; rendered = html; restore(); }
    position();
  };
  const show = (next: HTMLElement | null) => {
    cancelClose();
    if (document.querySelector('[role="menu"]:popover-open')) return;
    if (!next || next === anchor || dismissed && next.dataset.itemTooltip === dismissed.dataset.itemTooltip) return;
    dismissed = null;
    hide();
    anchor = next;
    const html = contents(next.dataset.itemTooltip || '');
    if (!html) { anchor = null; return; }
    // A tooltip opened inside a modal must belong to that dialog to remain interactive.
    (next.closest('dialog[open]') || document.body).append(tooltip);
    tooltip.innerHTML = html; rendered = html;
    const ids = new Set((next.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(tooltip.id); next.setAttribute('aria-describedby', [...ids].join(' '));
    tooltip.hidden = false;
    tooltip.showPopover();
    position();
    refreshTimer = window.setInterval(refresh, 250);
  };
  const closeSoon = () => { cancelClose(); closeTimer = window.setTimeout(hide, 160); };
  const over = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.buttons) return;
    if (event.clientX !== pointerX || event.clientY !== pointerY) dismissed = null;
    pointerX = event.clientX; pointerY = event.clientY;
    if (dismissed) return;
    if (tooltip.contains(event.target as Node)) { cancelClose(); return; }
    const next = item(event.target);
    if (next) show(next);
  };
  const out = (event: PointerEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (tooltip.contains(next) || anchor?.contains(next))) return;
    if (!tooltip.contains(document.activeElement) && (anchor?.contains(event.target as Node) || tooltip.contains(event.target as Node))) closeSoon();
  };
  // Native popovers restore focus during hidePopover; wait until that transition finishes.
  const focus = (event: FocusEvent) => { if (!touch) queueMicrotask(() => { if (document.activeElement === event.target) show(item(event.target)); }); };
  const blur = (event: FocusEvent) => { if (!tooltip.contains(event.relatedTarget as Node)) closeSoon(); };
  const down = (event: PointerEvent) => { touch = event.pointerType === 'touch'; if (!tooltip.contains(event.target as Node)) { dismissed = item(event.target) || anchor; hide(); } };
  const key = (event: KeyboardEvent) => {
    touch = false;
    if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { dismissed = anchor; hide(); }
    if (event.key === 'Tab') dismissed = null;
    if (event.key === 'F2' && anchor) { const summary = tooltip.querySelector<HTMLElement>('summary'); if (summary) { cancelClose(); summary.focus(); event.preventDefault(); event.stopPropagation(); } }
    if (event.key === 'Escape' && anchor) { const returnTo = tooltip.contains(document.activeElement) ? anchor : null; dismissed = anchor; hide(); returnTo?.focus({ preventScroll: true }); event.preventDefault(); event.stopPropagation(); }
  };
  const scroll = (event: Event) => { if (!tooltip.contains(event.target as Node)) hide(); };
  tooltip.addEventListener('toggle', position, true);
  document.addEventListener('pointerover', over);
  document.addEventListener('pointermove', over);
  document.addEventListener('pointerout', out);
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('contextmenu', () => { dismissed = anchor; hide(); }, true);
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', blur);
  document.addEventListener('keydown', key, true);
  document.addEventListener('dragstart', hide, true);
  document.addEventListener('scroll', scroll, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('visibilitychange', hide);
}
