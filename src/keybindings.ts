export const KEY_ACTIONS = [
  { id: 'forward', label: 'Move forward', group: 'Movement', key: 'w', defaults: ['KeyW', 'ArrowUp'] },
  { id: 'back', label: 'Move backward', group: 'Movement', key: 's', defaults: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: 'Move left', group: 'Movement', key: 'a', defaults: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: 'Move right', group: 'Movement', key: 'd', defaults: ['KeyD', 'ArrowRight'] },
  { id: 'sprint', label: 'Sprint', group: 'Movement', key: 'shift', defaults: ['Shift', null] },
  { id: 'jump', label: 'Jump', group: 'Movement', key: ' ', defaults: ['Space', null] },
  { id: 'descend', label: 'Fly down (GM)', group: 'Movement', key: 'control', defaults: ['Control', null] },
  { id: 'interact', label: 'Interact / gather', group: 'Combat', key: 'e', defaults: ['KeyE', null] },
  { id: 'target', label: 'Select foe', group: 'Combat', key: 'tab', defaults: ['Tab', null] },
  { id: 'attack', label: 'Toggle auto attack', group: 'Combat', key: 't', defaults: ['KeyT', null] },
  { id: 'mount', label: 'Mount / dismount', group: 'Movement', key: 'h', defaults: ['KeyH', null] },
  { id: 'slot1', label: 'Hotbar slot 1', group: 'Combat', key: '1', defaults: ['Digit1', null] },
  { id: 'slot2', label: 'Hotbar slot 2', group: 'Combat', key: '2', defaults: ['Digit2', null] },
  { id: 'slot3', label: 'Hotbar slot 3', group: 'Combat', key: '3', defaults: ['Digit3', null] },
  { id: 'slot4', label: 'Hotbar slot 4', group: 'Combat', key: '4', defaults: ['Digit4', null] },
  { id: 'slot5', label: 'Hotbar slot 5', group: 'Combat', key: '5', defaults: ['Digit5', null] },
  { id: 'slot6', label: 'Hotbar slot 6', group: 'Combat', key: '6', defaults: ['Digit6', null] },
  { id: 'slot7', label: 'Hotbar slot 7', group: 'Combat', key: '7', defaults: ['Digit7', null] },
  { id: 'slot8', label: 'Hotbar slot 8', group: 'Combat', key: '8', defaults: ['Digit8', null] },
  { id: 'slot9', label: 'Hotbar slot 9', group: 'Combat', key: '9', defaults: ['Digit9', null] },
  { id: 'slot10', label: 'Hotbar slot 10', group: 'Combat', key: '0', defaults: ['Digit0', null] },
  { id: 'hotbarBank', label: 'Switch hotbar bank', group: 'Combat', key: 'hotbar-page', defaults: ['Backquote', null] },
  { id: 'backpack', label: 'Backpack', group: 'Windows', key: 'b', defaults: ['KeyB', null] },
  { id: 'character', label: 'Character & gear', group: 'Windows', key: 'c', defaults: ['KeyC', null] },
  { id: 'quests', label: 'Quests', group: 'Windows', key: 'j', defaults: ['KeyJ', null] },
  { id: 'skills', label: 'Combat & professions', group: 'Windows', key: 'k', defaults: ['KeyK', null] },
  { id: 'talents', label: 'Skill tree', group: 'Windows', key: 'n', defaults: ['KeyN', null] },
  { id: 'crafting', label: 'Crafting', group: 'Windows', key: 'f', defaults: ['KeyF', null] },
  { id: 'party', label: 'Who / party', group: 'Windows', key: 'p', defaults: ['KeyP', null] },
  { id: 'map', label: 'World map', group: 'Windows', key: 'm', defaults: ['KeyM', null] },
  { id: 'arena', label: 'Arena', group: 'Windows', key: 'u', defaults: ['KeyU', null] },
  { id: 'pets', label: 'Pets', group: 'Windows', key: 'v', defaults: ['KeyV', null] },
  { id: 'friends', label: 'Friends & ignore', group: 'Windows', key: 'o', defaults: ['KeyO', null] },
  { id: 'achievements', label: 'Achievements', group: 'Windows', key: 'y', defaults: ['KeyY', null] },
  { id: 'options', label: 'Options', group: 'Windows', key: 'options', defaults: [null, null] },
] as const;

type KeyActionId = typeof KEY_ACTIONS[number]['id'];
type Keybindings = Record<KeyActionId, [string | null, string | null]>;
const storageKey = 'mossvale-keybindings';
const namedCodes: Record<string, string> = {
  Space: 'Space', Tab: 'Tab', Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down', Insert: 'Insert', Delete: 'Delete', Backspace: 'Backspace',
};
const defaultBindings = (): Keybindings => Object.fromEntries(KEY_ACTIONS.map(action => [action.id, [...action.defaults]])) as Keybindings;
const normalizeCode = (code: string): string => code.replace(/^(Shift|Control|Alt)(Left|Right)$/, '$1');
const validCode = (code: unknown): code is string => typeof code === 'string' && (/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-4]|[6-9]|10))$/.test(code) || Object.hasOwn(namedCodes, code));

export function normalizeKeybindings(value: unknown): Keybindings {
  const result = defaultBindings(), data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  for (const action of KEY_ACTIONS) {
    const pair = Object.hasOwn(data, action.id) ? data[action.id] : undefined;
    if (Array.isArray(pair) && pair.length === 2) {
      const normalized = pair.map(code => typeof code === 'string' ? normalizeCode(code) : code);
      if (normalized.every(code => code === null || validCode(code))) result[action.id] = normalized as Keybindings[KeyActionId];
    }
  }
  // Adding a default must never reset a player's existing custom bindings.
  for (const [action, code] of [['hotbarBank', 'Backquote'], ['slot9', 'Digit9'], ['slot10', 'Digit0']] as const)
    if (!Object.hasOwn(data, action) && Object.entries(result).some(([id, pair]) => id !== action && pair.includes(code))) result[action] = [null, null];
  const codes = Object.values(result).flat().filter(code => code !== null);
  return new Set(codes).size === codes.length ? result : defaultBindings();
}

function loadBindings(): Keybindings {
  try { return normalizeKeybindings(JSON.parse(localStorage.getItem(storageKey) ?? 'null')); }
  catch { return defaultBindings(); }
}
export const bindings = loadBindings();

function physicalCode(event: Pick<KeyboardEvent, 'code' | 'key'>): string | undefined {
  if (event.code) { const code = normalizeCode(event.code); return validCode(code) ? code : undefined; }
  if (/^[a-z]$/i.test(event.key)) return `Key${event.key.toUpperCase()}`;
  if (/^[0-9]$/.test(event.key)) return `Digit${event.key}`;
  const named = event.key === ' ' ? 'Space' : event.key;
  if (validCode(named)) return named;
  if (/^f(?:[1-4]|[6-9]|10)$/i.test(event.key)) return event.key.toUpperCase();
  return Object.keys(namedCodes).find(code => code.toLowerCase() === event.key.toLowerCase() || namedCodes[code].toLowerCase() === event.key.toLowerCase());
}

export function gameKey(event: Pick<KeyboardEvent, 'code' | 'key'>): string | undefined {
  if (event.code === 'Escape' || !event.code && event.key.toLowerCase() === 'escape') return 'escape';
  if (event.code === 'Enter' || event.code === 'NumpadEnter' || !event.code && event.key.toLowerCase() === 'enter') return 'enter';
  const code = physicalCode(event);
  return code ? KEY_ACTIONS.find(action => bindings[action.id].includes(code))?.key : undefined;
}

function displayCode(code: string | null): string {
  return code === null ? 'Unbound' : namedCodes[code] ?? code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
}
export function bindingLabel(key: string): string {
  const action = KEY_ACTIONS.find(action => action.key === key);
  if (!action) return key === 'escape' ? 'Esc' : key === 'enter' ? 'Enter' : 'Unbound';
  return displayCode(bindings[action.id].find(code => code !== null) ?? null);
}
export function bindingLabels(key: string): string {
  const action = KEY_ACTIONS.find(action => action.key === key);
  return action ? bindings[action.id].filter(code => code !== null).map(displayCode).join(' / ') || 'Unbound' : bindingLabel(key);
}

export function renderKeybindings(): string {
  return `<section class="keybindings" aria-labelledby="keybindings-heading">
    <div class="settings-page-heading"><h3 id="keybindings-heading">Keybindings</h3><button id="keybindings-defaults" type="button">Defaults</button></div>
    <p>Choose a binding, then press one key. Escape cancels. Enter and Escape keep their chat/menu behavior.</p>
    <div class="keybinding-capture"><p id="keybindings-status" role="status" aria-live="polite">Bindings are saved on this device.</p><div id="keybindings-capture-tools" hidden><button id="keybindings-clear" type="button">Clear binding</button><button id="keybindings-cancel" type="button">Cancel</button></div></div>
    <table class="keybindings-table"><thead><tr><th scope="col">Action</th><th scope="col">Primary</th><th scope="col">Secondary</th></tr></thead>${[...new Set(KEY_ACTIONS.map(action => action.group))].map(group => `<tbody><tr class="keybindings-group"><th colspan="3" scope="rowgroup">${group}</th></tr>${KEY_ACTIONS.filter(action => action.group === group).map(action => `<tr><th scope="row">${action.label}</th>${bindings[action.id].map((code, slot) => `<td><button type="button" data-bind-action="${action.id}" data-bind-slot="${slot}" aria-label="${action.label}, ${slot ? 'secondary' : 'primary'} binding: ${displayCode(code)}">${displayCode(code)}</button></td>`).join('')}</tr>`).join('')}</tbody>`).join('')}</table>
  </section>`;
}

const mountedRoots = new WeakMap<HTMLElement, AbortController>();
export function mountKeybindings(root: HTMLElement, onChange: () => void): void {
  mountedRoots.get(root)?.abort();
  const controller = new AbortController();
  mountedRoots.set(root, controller);
  const buttons = root.querySelectorAll<HTMLButtonElement>('[data-bind-action]');
  const status = root.querySelector<HTMLElement>('#keybindings-status')!;
  const captureTools = root.querySelector<HTMLElement>('#keybindings-capture-tools')!;
  const page = root.querySelector<HTMLElement>('[data-settings-page="keybindings"]');
  let waiting: HTMLButtonElement | undefined;
  const refresh = () => {
    for (const button of buttons) {
      const action = KEY_ACTIONS.find(action => action.id === button.dataset.bindAction)!, slot = Number(button.dataset.bindSlot);
      button.textContent = displayCode(bindings[action.id][slot]);
      button.setAttribute('aria-label', `${action.label}, ${slot ? 'secondary' : 'primary'} binding: ${button.textContent}`);
    }
  };
  const cancel = () => {
    if (!waiting) return;
    delete waiting.dataset.capturing;
    waiting = undefined;
    captureTools.hidden = true;
    refresh();
    status.textContent = 'Binding change cancelled.';
  };
  const save = () => {
    onChange();
    try { localStorage.setItem(storageKey, JSON.stringify(bindings)); status.textContent = 'Keybindings saved on this device.'; }
    catch { status.textContent = 'Applied for this session. Browser storage is unavailable.'; }
  };
  for (const button of buttons) button.addEventListener('click', () => {
    cancel(); waiting = button; button.dataset.capturing = 'true'; button.textContent = 'Press key…'; captureTools.hidden = false;
    status.textContent = `Choose a key for ${KEY_ACTIONS.find(action => action.id === button.dataset.bindAction)!.label}.`;
  });
  root.addEventListener('keydown', event => {
    if (!waiting) return;
    if (page?.hidden) { cancel(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.code === 'Escape' || event.key === 'Escape') { cancel(); return; }
    const modifier = /^(Shift|Control|Alt)(Left|Right)?$/.test(event.code || event.key);
    if (event.isComposing || !modifier && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) {
      status.textContent = 'Choose one key without a shortcut combination or text composition.'; return;
    }
    const code = physicalCode(event);
    if (!code) { status.textContent = 'That key is reserved or unsupported. Choose another key, or press Escape to cancel.'; return; }
    const actionId = waiting.dataset.bindAction as KeyActionId, slot = Number(waiting.dataset.bindSlot);
    const conflict = KEY_ACTIONS.find(action => bindings[action.id].some((value, index) => value === code && (action.id !== actionId || index !== slot)));
    if (conflict) { status.textContent = `${displayCode(code)} is already assigned to ${conflict.label}. Clear that binding first, or choose another key.`; return; }
    bindings[actionId][slot] = code;
    cancel(); save();
  }, { capture: true, signal: controller.signal });
  root.querySelector<HTMLButtonElement>('#keybindings-clear')!.addEventListener('click', () => {
    if (!waiting) return;
    bindings[waiting.dataset.bindAction as KeyActionId][Number(waiting.dataset.bindSlot)] = null;
    cancel(); save();
  });
  root.querySelector<HTMLButtonElement>('#keybindings-cancel')!.addEventListener('click', cancel);
  root.querySelector<HTMLButtonElement>('#keybindings-defaults')!.addEventListener('click', () => { cancel(); Object.assign(bindings, defaultBindings()); refresh(); save(); });
  for (const tab of root.querySelectorAll<HTMLElement>('[data-settings-tab]')) tab.addEventListener('click', cancel);
  root.closest('dialog')?.addEventListener('close', cancel, { once: true, signal: controller.signal });
}
