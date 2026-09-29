import type { Player } from './shared';
import { icon } from './icons';

const classIcons = { Ranger: 'bow', Knight: 'shield', Mage: 'spark', Cleric: 'cleric' };
const escape = (text: string) => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function rosterShell(): string {
  return `<section id="roster" class="roster-screen" aria-labelledby="roster-title" hidden tabindex="-1"><div class="roster-shell">
<header class="roster-header"><img src="/ui/wordmark.png" alt="Mossvale"/><h1 id="roster-title">Choose your adventurer</h1></header>
<div class="roster-realm-choice"><label for="roster-realm">Realm</label><select id="roster-realm" aria-describedby="roster-realm-note"><option value="eu">Europe (EU)</option><option value="us" disabled>North America (US) — Not open yet</option><option value="asia" disabled>Asia — Not open yet</option></select><p id="roster-realm-note">Your progress follows you. Play with friends in the same realm.</p></div>
<section class="roster-stage" aria-label="Selected adventurer"><div id="roster-preview-mount" class="roster-preview-mount" role="img" aria-label="Live 3D scene and selected adventurer"></div><div class="roster-character-caption"><h2 id="roster-character-name">Your story begins here</h2><p id="roster-character-detail">Create your first adventurer, then enter the world.</p><p id="roster-error" class="roster-error" role="alert"></p></div><div class="roster-entry-controls"><button type="button" id="roster-enter" class="primary-button" disabled>Enter world ${icon('arrow')}</button><button type="button" id="roster-retry" class="roster-retry" hidden>Reconnect</button><div class="roster-turn-controls"><button type="button" id="roster-turn-left" aria-label="Rotate character left" disabled>${icon('left')}</button><button type="button" id="roster-turn-right" aria-label="Rotate character right" disabled>${icon('arrow')}</button></div></div></section>
<aside class="roster-list-pane" aria-labelledby="roster-list-title"><div class="roster-list-heading"><h2 id="roster-list-title">Your characters</h2><span id="roster-count">0 / 6</span></div><div id="character-list" class="character-list" role="group" aria-label="Select a character">${renderCharacterList([], null)}</div><button type="button" id="roster-create" class="primary-button">${icon('user')} Create character ${icon('arrow')}</button></aside>
<footer class="roster-actions"><button type="button" id="roster-account" class="roster-account">${icon('logout')}<span id="roster-account-label">Sign out</span></button></footer>
</div></section>`;
}

export function renderCharacterList(characters: Player[], selectedId: string | null): string {
  if (!characters.length) return `<div class="roster-empty">${icon('user')}<h3>Your first adventure</h3><p>Create an adventurer to step onto the lantern roads.</p></div>`;
  return characters.map(character => {
    const selected = character.id === selectedId;
    return `<button type="button" class="roster-character ${selected ? 'selected' : ''}" data-character-id="${escape(character.id)}" aria-pressed="${selected}">${icon(classIcons[character.appearance.className])}<span class="roster-character-copy"><strong>${escape(character.name)}</strong><small>Level ${character.level} · ${escape(character.appearance.className)}</small></span><span class="roster-selection-mark">${icon(selected ? 'check' : 'arrow')}</span></button>`;
  }).join('');
}
