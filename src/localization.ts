import { UI_ZH, UI_PATTERNS } from './locales/zh-CN-ui.ts';
import { GAME_ZH, GAME_PATTERNS } from './locales/zh-CN-game.ts';
import { UI_ID, UI_ID_PATTERNS } from './locales/id-ui.ts';
import { GAME_ID, GAME_ID_PATTERNS } from './locales/id-game.ts';

export type Language = 'en' | 'zh-CN' | 'id';
const storageKey = 'mossvale-language';
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function catalog(copy: Record<string, string>, templates: [string, string][]) {
  const dictionary = new Map(Object.entries(copy));
  const folded = new Map([...dictionary].map(([key, value]) => [key.toLowerCase(), value]));
  const patterns = templates.sort((a, b) => b[0].replace(/\{\d+\}/g, '').length - a[0].replace(/\{\d+\}/g, '').length).map(([source, value]) => {
    const slots: string[] = [];
    const parts = source.split(/(\{\d+\})/g).map(part => {
      if (!/^\{\d+\}$/.test(part)) return escapePattern(part);
      slots.push(part); return '(.+?)';
    });
    return { expression: new RegExp(`^${parts.join('')}$`, 'i'), value, slots };
  });
  return { dictionary, folded, patterns, cache: new Map<string, string>() };
}
const catalogs = {
  'zh-CN': catalog({ ...GAME_ZH, ...UI_ZH }, [...UI_PATTERNS, ...GAME_PATTERNS]),
  id: catalog({ ...GAME_ID, ...UI_ID }, [...UI_ID_PATTERNS, ...GAME_ID_PATTERNS]),
};

export function preferredLanguage(saved: string | null, languages: readonly string[]): Language {
  if (saved === 'en' || saved === 'zh-CN' || saved === 'id') return saved;
  const preferred = languages.find(value => /^(en|zh|id)(?:-|$)/i.test(value)) || '';
  return /^zh(?:-|$)/i.test(preferred) ? 'zh-CN' : /^id(?:-|$)/i.test(preferred) ? 'id' : 'en';
}
function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  let saved = null;
  try { saved = localStorage.getItem(storageKey); } catch { /* Private browsing still supports this session. */ }
  return preferredLanguage(saved, typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language]);
}
let language = initialLanguage();
export const getLanguage = () => language;

/** Exact authored messages only; template arguments (including names) stay verbatim. */
export function translateText(source: string, locale: Language = language): string {
  if (locale === 'en' || !/[a-z]/i.test(source)) return source;
  const { dictionary, folded, patterns, cache } = catalogs[locale];
  const cached = cache.get(source);
  if (cached !== undefined) return cached;
  const text = source.trim();
  let translated = dictionary.get(text) ?? folded.get(text.toLowerCase());
  // Rolled/upgraded gear composes known catalog names; never substitute arbitrary words.
  if (translated === undefined) {
    const gear = /^(?:(Common|Uncommon|Rare|Epic|Legendary|Mythic) )?(.+?)( \+[1-5])?$/.exec(text);
    if (gear && (gear[1] || gear[3]) && dictionary.has(gear[2])) translated = `${gear[1] ? translateText(gear[1], locale) + ' ' : ''}${dictionary.get(gear[2])}${gear[3] || ''}`;
    const description = /^(.+?)( Its bonus attributes were rolled when it dropped\.)?( Upgrade with materials and gold up to \+5\.)$/.exec(text);
    if (description && dictionary.has(description[1])) translated = dictionary.get(description[1]) + translateText(description[2] || '', locale) + translateText(description[3], locale);
  }
  // Translate separately authored segments before a broad template can capture them as names.
  if (translated === undefined && / · |\n/.test(text)) {
    const segments = text.split(/( · |\n)/).map(part => /^( · |\n)$/.test(part) ? part : translateText(part, locale)).join('');
    if (segments !== text) translated = segments;
  }
  if (translated === undefined) {
    for (const { expression, value, slots } of patterns) {
      const match = expression.exec(text);
      if (match) { translated = value.replace(/\{\d+\}/g, slot => match[slots.indexOf(slot) + 1] ?? slot); break; }
    }
  }
  const result = translated === undefined ? source : source.slice(0, source.indexOf(text)) + translated + source.slice(source.indexOf(text) + text.length);
  if (cache.size >= 2000) cache.clear();
  cache.set(source, result);
  return result;
}

export function languagePicker(id: string): string {
  return `<label class="language-picker" for="${id}"><span>Language</span><select id="${id}" data-language-picker aria-label="Language"><option value="en" translate="no"${language === 'en' ? ' selected' : ''}>English</option><option value="zh-CN" translate="no"${language === 'zh-CN' ? ' selected' : ''}>简体中文</option><option value="id" translate="no"${language === 'id' ? ' selected' : ''}>Bahasa Indonesia</option></select></label>`;
}

const attributes = ['title', 'aria-label', 'aria-description', 'aria-valuetext', 'placeholder', 'alt', 'data-empty', 'data-mobile-label'];
// These surfaces contain names, player chat, typed input or protocol literals, not authored game copy.
const excluded = 'script,style,code,pre,kbd,textarea,svg,[contenteditable],[translate="no"],[data-no-localize],#character-delete-confirmation,#character-delete-name,#account-name,.roster-character-copy>strong,.paper-doll-caption>strong,.friend-details>strong,#player-menu header>strong,#trade-partner,.player-nameplate>strong,#label-you>strong,#arena-roster li>span,.party-member strong,.party-hud-name,.auction-seller,.auction-history button,#achievements-character,#gm-target-summary,#gm-target option,.community-body article>h3,.community-body article>blockquote,.community-body article>p,#panel[data-mode="gear"] #panel-title,#panel[data-mode="inspect"] #panel-title';

/** Translate the existing DOM without replacing controls, their listeners, or their values. */
export function mountLocalization(root: HTMLElement = document.body) {
  const originals = new WeakMap<Node, Map<string, { source: string; rendered: string }>>();
  const protectedNode = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(excluded);
  function update(node: Node, key: string, current: string, write: (value: string) => void, playerName = '') {
    let entries = originals.get(node);
    const prior = entries?.get(key);
    const source = prior && current === prior.rendered ? prior.source : current;
    const rendered = playerName && source.startsWith(playerName) ? playerName + translateText(source.slice(playerName.length)) : translateText(source);
    if (!prior && rendered === current) return;
    if (!entries) { entries = new Map(); originals.set(node, entries); }
    entries.set(key, { source, rendered });
    if (rendered !== current) write(rendered);
  }
  function visit(node: Node) {
    if (protectedNode(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue || '';
      if (value.trim()) update(node, 'text', value, result => { node.nodeValue = result; });
      return;
    }
    if (!(node instanceof Element)) {
      for (const child of node.childNodes) visit(child);
      return;
    }
    const playerName = node.matches('.unit-frame,.unit-health,.player-nameplate') ? node.closest<HTMLElement>('[data-player-name]')?.dataset.playerName : '';
    for (const attribute of attributes) {
      const value = node.getAttribute(attribute);
      if (value) update(node, attribute, value, result => node.setAttribute(attribute, result), playerName);
    }
    for (const child of node.childNodes) visit(child);
  }
  const observer = new MutationObserver(records => {
    // Ignore layout/animation attributes and our own translated writes.
    const nodes = new Set<Node>();
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) nodes.add(node);
      else nodes.add(record.target);
    }
    for (const node of nodes) if (root.contains(node)) visit(node);
  });
  function refresh() {
    observer.disconnect();
    document.documentElement.lang = language;
    for (const select of root.querySelectorAll<HTMLSelectElement>('[data-language-picker]')) select.value = language;
    visit(root);
    // English has no observer or per-frame localization work.
    if (language !== 'en') observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  }
  function change(event: Event) {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.matches('[data-language-picker]')) return;
    language = preferredLanguage(select.value, []);
    try { localStorage.setItem(storageKey, language); } catch { /* Keep the preference for this session. */ }
    refresh();
  }
  root.addEventListener('change', change);
  refresh();
  return {
    translate(node: Node) { if (language !== 'en') visit(node); },
    destroy() { observer.disconnect(); root.removeEventListener('change', change); },
  };
}
