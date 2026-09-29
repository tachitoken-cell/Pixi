import type { Player } from './shared';
import { bagItems, BAG_ITEMS } from './bags';
import { gearById } from './progression';
import { itemResources } from './item-tooltip';
import { LOOT_ITEMS, lootItemValid } from './loot-items';
import { itemLocked } from './item-locks';
import { icon } from './icons';

export function mountItemMenu(panel: HTMLElement, getPlayer: () => Player | undefined, onAction: (action: 'drop' | 'inspect', id: string) => void) {
  const menu = document.createElement('div');
  menu.id = 'item-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Item options');
  menu.setAttribute('popover', 'auto');
  menu.innerHTML = `<header><strong></strong></header><button type="button" role="menuitem" data-item-action="drop">${icon('close')}<span>Drop</span></button><button type="button" role="menuitem" data-item-action="inspect">${icon('inspect')}<span>Inspect</span></button>`;
  panel.append(menu);
  const drop = menu.querySelector<HTMLButtonElement>('[data-item-action="drop"]')!;
  const inspect = menu.querySelector<HTMLButtonElement>('[data-item-action="inspect"]')!;
  const confirmation = document.createElement('dialog');
  confirmation.className = 'item-drop-dialog';
  confirmation.setAttribute('aria-labelledby', 'item-drop-title');
  confirmation.setAttribute('aria-describedby', 'item-drop-warning');
  confirmation.innerHTML = `<h2 id="item-drop-title"></h2><p id="item-drop-warning">This permanently destroys one item. It cannot be recovered.</p><div class="item-drop-actions"><button type="button" data-drop-cancel autofocus>Keep item</button><button type="button" data-drop-confirm>Drop item</button></div>`;
  panel.append(confirmation);
  let itemId = '', playerId = '';
  const isOpen = () => menu.matches(':popover-open');
  const source = () => [...panel.querySelectorAll<HTMLElement>('[data-inspect-item]')].find(node => node.dataset.inspectItem === itemId && node.getClientRects().length && !node.closest('[hidden]'));
  function close(restoreFocus = false) {
    if (isOpen()) menu.hidePopover();
    if (confirmation.open) confirmation.close();
    if (restoreFocus) source()?.focus({ preventScroll: true });
  }
  function update() {
    const player = getPlayer();
    if (!player || player.id !== playerId || !source()) { close(); return false; }
    const gear = gearById(itemId), bag = player.ownedBags?.find(bag => `bag:${bag.id}` === itemId);
    if (!bagItems(player).includes(itemId) && !player.ownedGear.includes(itemId) && !bag) { close(); return false; }
    const lootId = itemId.startsWith('item:') ? itemId.slice(5) : '';
    const label = gear?.label || (bag ? BAG_ITEMS[bag.kind].label : lootItemValid(lootId) ? LOOT_ITEMS[lootId].label : Object.hasOwn(itemResources, itemId) ? itemResources[itemId as keyof typeof itemResources].label : '');
    if (!label) { close(); return false; }
    const equipped = Object.values(player.equipment).includes(itemId) || !!bag && !!player.equippedBags?.includes(bag.id);
    const reason = itemLocked(player, itemId) ? 'This item is locked. Unlock it in item details first.' : equipped ? 'Unequip this item first.' : '';
    if (reason && confirmation.open) { close(true); return false; }
    menu.querySelector('strong')!.textContent = label;
    drop.setAttribute('aria-disabled', String(!!reason));
    drop.title = reason;
    drop.setAttribute('aria-label', reason ? `Drop. ${reason}` : 'Drop');
    inspect.hidden = !gear;
    return true;
  }
  function open(target: EventTarget | null, x?: number, y?: number) {
    const anchor = target instanceof Element ? target.closest<HTMLElement>('[data-inspect-item]') : null;
    const player = getPlayer();
    if (!anchor || !panel.contains(anchor) || !player) return false;
    itemId = anchor.dataset.inspectItem!; playerId = player.id;
    if (!update()) return false;
    menu.showPopover();
    const bounds = menu.getBoundingClientRect(), origin = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x ?? origin.left, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y ?? origin.bottom, innerHeight - bounds.height - 8))}px`;
    drop.focus({ preventScroll: true });
    return true;
  }
  panel.addEventListener('contextmenu', event => {
    if (open(event.target, event.clientX, event.clientY)) { event.preventDefault(); event.stopPropagation(); }
  });
  panel.addEventListener('keydown', event => {
    if ((event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) && open(event.target)) { event.preventDefault(); event.stopPropagation(); }
  });
  menu.addEventListener('click', event => {
    event.stopPropagation();
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-item-action]');
    if (!button || !isOpen() || !update() || button.hidden || button.getAttribute('aria-disabled') === 'true') return;
    const id = itemId, action = button.dataset.itemAction as 'drop' | 'inspect', label = menu.querySelector('strong')!.textContent;
    close(action === 'inspect');
    if (action === 'drop') {
      confirmation.querySelector('h2')!.textContent = `Drop ${label}?`;
      confirmation.showModal();
    } else onAction(action, id);
  });
  confirmation.querySelector('[data-drop-cancel]')!.addEventListener('click', () => close(true));
  confirmation.querySelector('[data-drop-confirm]')!.addEventListener('click', () => {
    if (!confirmation.open || !update() || drop.getAttribute('aria-disabled') === 'true') return;
    const id = itemId;
    close(true);
    onAction('drop', id);
  });
  confirmation.addEventListener('cancel', event => { event.preventDefault(); close(true); });
  for (const type of ['keydown', 'keyup', 'pointerdown', 'click', 'contextmenu']) confirmation.addEventListener(type, event => event.stopPropagation());
  menu.addEventListener('pointerdown', event => event.stopPropagation());
  menu.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); });
  menu.addEventListener('keydown', event => {
    event.stopPropagation();
    const buttons = inspect.hidden ? [drop] : [drop, inspect];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
    }
  });
  panel.addEventListener('close', () => close());
  document.addEventListener('scroll', event => { if (!confirmation.open && !menu.contains(event.target as Node)) close(); }, true);
  document.addEventListener('dragstart', () => close(), true);
  window.addEventListener('resize', () => close());
  window.addEventListener('blur', () => close());
  return { close, update: () => { if (isOpen() || confirmation.open) update(); } };
}
