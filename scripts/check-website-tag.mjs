import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/website-tag.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''));
const storageKey = 'mossvale-x-advertising-v1';
function fixture({ saved = null, native = false, privacy = false, readBlocked = false, writeBlocked = false, navigator = {}, url = 'https://mossvale.world/' } = {}) {
  const scripts = [], panels = [], events = {}, storage = new Map(saved === null ? [] : [[storageKey, saved]]);
  const buttons = ['denied', 'allowed'].map(xChoice => ({ dataset: { xChoice }, setAttribute() {}, addEventListener(type, listener) { this[type] = listener; } }));
  const panelEvents = {}, status = {}, panel = {
    hidden: false, open: false, shows: 0, setAttribute() {}, querySelector: () => status, querySelectorAll: () => buttons,
    addEventListener: (type, listener) => { panelEvents[type] = listener; },
    showModal() { assert(panels.includes(panel), 'append the native dialog before showing it'); this.open = true; this.shows++; },
    close() { this.open = false; panelEvents.close?.(); },
  };
  const preferences = privacy ? { append: child => panels.push(child) } : null;
  const location = new URL(url);
  let reloads = 0;
  location.reload = () => { reloads++; };
  const window = { addEventListener: (name, listener) => { events[name] = listener; } };
  const mount = runInNewContext(source + '\nmountWebsiteTag;', {
    isNativeApp: () => native, navigator, window, location, URLSearchParams,
    localStorage: {
      getItem(key) { if (readBlocked) throw Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (writeBlocked) throw Error('blocked'); storage.set(key, value); },
    },
    document: {
      getElementById: id => id === 'x-advertising-choices' ? preferences : null,
      createElement: tag => tag === 'script' ? {} : Object.assign(panel, { tagName: tag.toUpperCase() }),
      head: { append: script => scripts.push(script) }, body: { append: child => panels.push(child) },
    },
  });
  const ready = mount();
  let settled = false;
  if (ready) ready.then(() => { settled = true; }); else settled = true;
  return { scripts, panels, buttons, panel, panelEvents, status, window, mount, storage, ready, get settled() { return settled; }, get reloads() { return reloads; },
    choose(value) { buttons.find(button => button.dataset.xChoice === value).click(); },
    change(value, key = storageKey) { if (value === null) storage.delete(storageKey); else storage.set(storageKey, value); events.storage({ key }); },
  };
}

const fresh = fixture();
assert.equal(fresh.scripts.length, 0, 'no vendor request before consent');
assert.equal(fresh.panel.tagName, 'DIALOG');
assert.equal(fresh.panel.open, true, 'first visit uses a native modal');
await Promise.resolve();
assert.equal(fresh.settled, false, 'game startup waits for a choice');
let cancelPrevented = false, propagationStopped = false;
fresh.panelEvents.cancel({ preventDefault() { cancelPrevented = true; } });
fresh.panelEvents.keydown({ stopPropagation() { propagationStopped = true; } });
assert(cancelPrevented, 'Escape cannot dismiss the choice');
assert(propagationStopped, 'dialog key presses cannot reach game handlers');
assert.equal(fresh.panel.open, true);
assert.equal(fresh.settled, false);
fresh.choose('denied');
await Promise.resolve();
assert.equal(fresh.settled, true, 'Decline continues to the game');
assert.equal(fresh.scripts.length, 0, 'declining never loads the tag');
assert.equal(fresh.storage.get(storageKey), 'denied');
assert.equal(fresh.panel.open, false);
for (const saved of ['denied', 'invalid']) assert.equal(fixture({ saved }).scripts.length, 0);
for (const saved of ['allowed', 'denied']) {
  const returning = fixture({ saved });
  await Promise.resolve();
  assert.equal(returning.settled, true, 'saved choice immediately continues');
  assert.equal(returning.panel.shows, 0, 'saved choice never asks again');
}

const allowed = fixture();
allowed.choose('allowed');
await Promise.resolve();
assert.equal(allowed.settled, true, 'Allow continues to the game');
assert.equal(allowed.panel.open, false);
allowed.mount();
allowed.choose('allowed');
assert.equal(allowed.scripts.length, 1, 'repeat mount/consent loads one script');
assert.equal(allowed.storage.get(storageKey), 'allowed');
assert.deepEqual(allowed.scripts[0], { async: true, src: 'https://static.ads-twitter.com/uwt.js', referrerPolicy: 'no-referrer' });
assert.deepEqual(JSON.parse(JSON.stringify(allowed.window.twq.queue)), [
  ['set', 'autoAdvancedMatching', 'false', 'rftxa'],
  ['set', 'autoConfig', 'false', 'rftxa'],
  ['set', 'dataLayerTracking', 'false', 'rftxa'],
  ['set', 'autoDwellTracking', 'false', 'rftxa'],
  ['config', 'rftxa'],
], 'privacy switches precede the one page-view config, without user attributes');
allowed.choose('denied');
assert.equal(allowed.reloads, 1, 'withdrawal reloads an already tagged document');

for (const host of ['mossvale.world', 'www.mossvale.world', 'eu.mossvale.world', 'us.mossvale.world', 'asia.mossvale.world']) {
  assert.equal(fixture({ saved: 'allowed', url: `https://${host}/` }).scripts.length, 1, host);
}
assert.equal(fixture({ saved: 'allowed', url: 'https://mossvale.world/index.html?twclid=click&utm_source=x&utm_medium=social&utm_campaign=launch&utm_content=one&utm_term=game' }).scripts.length, 1);
for (const url of [
  'http://mossvale.world/', 'https://localhost/', 'https://mossvale.world.evil.example/',
  'https://dev.mossvale.world/', 'https://mossvale.world/privacy.html', 'https://mossvale.world/account.html',
  'https://mossvale.world/?code=secret', 'https://mossvale.world/?email=player', 'https://mossvale.world/?utm_source=x&wallet=secret',
  'https://mossvale.world/#access_token=secret',
]) assert.equal(fixture({ saved: 'allowed', url }).scripts.length, 0, `never tag ${url}`);

const native = fixture({ native: true, saved: 'allowed' });
await Promise.resolve();
assert.equal(native.settled, true);
assert.equal(native.scripts.length, 0);
assert.equal(native.panels.length, 0, 'native app has no advertising consent UI');
const privacy = fixture({ privacy: true, saved: 'allowed', url: 'https://mossvale.world/privacy.html' });
privacy.choose('allowed');
assert.equal(privacy.scripts.length, 0, 'privacy page only saves preferences');
assert.equal(privacy.panels.length, 1, 'auto mount and explicit mount are idempotent');
assert.equal(privacy.panel.hidden, false, 'saved choice remains editable on privacy page');
assert.equal(privacy.panel.tagName, 'SECTION');
assert.equal(privacy.panel.shows, 0, 'privacy preferences remain an inline section');
for (const navigator of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) {
  for (const saved of [null, 'allowed']) {
    const signal = fixture({ saved, navigator });
    await Promise.resolve();
    assert.equal(signal.settled, true, 'privacy signal skips the consent step');
    assert.equal(signal.panel.shows, 0);
    assert.equal(signal.scripts.length, 0, 'browser privacy signal overrides saved opt-in');
    assert.equal(signal.buttons[1].disabled, true);
  }
}
assert.equal(fixture({ saved: 'allowed', readBlocked: true }).scripts.length, 0, 'unreadable consent fails closed');
for (const choice of ['allowed', 'denied']) {
  const blocked = fixture({ writeBlocked: true });
  blocked.choose(choice);
  await Promise.resolve();
  assert.equal(blocked.scripts.length, 0, 'unsaved consent fails closed');
  assert.equal(blocked.settled, true, 'blocked storage must not block playing');
  assert.equal(blocked.panel.open, false, 'either choice dismisses the dialog when storage is blocked');
  assert.equal(blocked.storage.has(storageKey), false);
}
const blockedWithdrawal = fixture({ privacy: true, saved: 'allowed', writeBlocked: true, url: 'https://mossvale.world/privacy.html' });
blockedWithdrawal.choose('denied');
assert.equal(blockedWithdrawal.storage.get(storageKey), 'allowed');
assert.equal(blockedWithdrawal.scripts.length, 0);
assert.match(blockedWithdrawal.status.textContent, /could not save/);
assert(!blockedWithdrawal.status.textContent.includes('advertising is off') && !blockedWithdrawal.status.textContent.includes('stays off'), 'failed withdrawal must not claim the saved opt-in was revoked');
for (const choice of ['allowed', 'denied']) {
  const waitingTab = fixture();
  waitingTab.change(null);
  await Promise.resolve();
  assert.equal(waitingTab.settled, false, 'removing an absent choice does not bypass the dialog');
  waitingTab.change(choice);
  await Promise.resolve();
  assert.equal(waitingTab.settled, true, 'a valid choice in another tab continues this tab');
  assert.equal(waitingTab.panel.open, false);
}
for (const choice of ['denied', null]) {
  const tab = fixture({ saved: 'allowed' });
  tab.change(choice, choice === null ? null : storageKey);
  assert.equal(tab.reloads, 1, 'withdrawal or clearing storage reloads active tagged tabs');
}
const otherTab = fixture({ saved: 'allowed' });
otherTab.change('allowed');
assert.equal(otherTab.reloads, 0, 'another opt-in does not reload');
otherTab.change('denied', 'unrelated-key');
assert.equal(otherTab.reloads, 0, 'unrelated storage changes are ignored');
console.log('PASS website tag: one-time modal choice, startup waiting, both choices, blocked-storage continuation, exact pixel config, production URLs, native/privacy exclusions, privacy signals, and cross-tab choices/withdrawal.');
