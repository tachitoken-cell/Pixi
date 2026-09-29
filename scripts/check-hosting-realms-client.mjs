import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { configureHosting, hostingConfig, guestSessionKey, realmAddress, leaveHostingRealm, setActiveHostingRealm, activeRealmTarget } from '../src/hosting-client.ts';
import { createHostingConfig, realmIdValid } from '../src/hosting-realms.ts';
import { characterNameError } from '../src/character-name.ts';

globalThis.location = { origin: 'https://eu.example' };
configureHosting({ keycloak: null });
assert.equal(realmAddress('eu', '/socket'), 'wss://eu.example/socket');
assert.throws(() => realmAddress('us', '/socket'), /not open/);
assert.throws(() => realmAddress('asia', '/socket'), /not open/);
const all = createHostingConfig('eu', '', 'https://us.example', 'https://asia.example');
configureHosting({ ...all, realms: all.realms.slice(0, 2) });
assert.throws(() => realmAddress('asia', '/socket'), /not open/, 'old two-realm servers leave Asia unavailable');
configureHosting(all);
assert.equal(realmAddress('us', '/socket'), 'wss://us.example/socket');
assert.equal(realmAddress('asia', '/socket'), 'wss://asia.example/socket');
assert.equal(realmAddress('eu', '/socket', 'http://localhost:3000'), 'ws://localhost:3000/socket');
for (const origin of ['http://us.example', 'https://user:password@us.example', 'https://us.example/path', 'https://us.example/?token=bad', 'javascript:alert(1)']) {
  for (const realmId of ['us', 'asia']) assert.throws(() => configureHosting({ ...all, realms: all.realms.map(realm => realm.id === realmId ? { ...realm, origin } : realm) }));
  assert.equal(realmAddress('us', '/socket'), 'wss://us.example/socket');
  assert.equal(realmAddress('asia', '/socket'), 'wss://asia.example/socket');
}
assert.equal(guestSessionKey, 'mossvale-session', 'shared local guests retain the existing EU identity');

// Exercise the shipped handoff helper, including its bounded timeout and listener cleanup.
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const timeoutCallbacks = new Map(); let timerId = 0;
globalThis.setTimeout = (callback, ms) => { assert.equal(ms, 10000); timeoutCallbacks.set(++timerId, callback); return timerId; };
globalThis.clearTimeout = id => timeoutCallbacks.delete(id);
try {
  for (const ending of ['ack', 'close', 'timeout', 'send-error']) {
    const listeners = new Map(), sent = [];
    const socket = {
      addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
      send: raw => { if (ending === 'send-error') throw Error('Closed'); sent.push(JSON.parse(raw)); },
    };
    let finished = false;
    const leaving = leaveHostingRealm(socket); leaving.then(() => { finished = true; }, () => { finished = true; });
    if (ending !== 'send-error') {
      assert.deepEqual(sent, [{ type: 'leaveRealm' }]);
      listeners.get('message')({ data: 'broken' }); listeners.get('message')({ data: '{"type":"roster"}' });
      await Promise.resolve(); assert.equal(finished, false, 'roster receipt and malformed messages are not save confirmation');
    }
    if (ending === 'ack') { listeners.get('message')({ data: '{"type":"realmLeft"}' }); await leaving; }
    else {
      const rejected = assert.rejects(leaving, /Could not confirm your progress was saved/);
      if (ending === 'close') listeners.get('close')();
      if (ending === 'timeout') [...timeoutCallbacks.values()][0]();
      await rejected;
    }
    assert.equal(listeners.size, 0); assert.equal(timeoutCallbacks.size, 0);
  }
} finally { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; }

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const between = (start, end) => {
  const from = main.indexOf(start), to = main.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, start); return main.slice(from, to);
};
const source = between('async function connect(', 'function pauseConnection(')
  + between('function realmHasSpace(', 'function openCharacterSelection(')
  + between('function showCharacterRoster(', 'function renderRoster(')
  + main.split('\n').find(line => line.startsWith("$('roster-enter').onclick="))
  + between("$<HTMLFormElement>('character-form').onsubmit=", "$<HTMLInputElement>('character-name').oninput=");
const shared = { id: 'hero', name: 'Willow', realmId: 'eu', gold: 20 };
function fixture(realmId, accessToken) {
  setActiveHostingRealm(realmId);
  const sent = [], sockets = [], saved = [], errors = [], elements = new Map(), retries = [], clientChecks = [];
  const noop = () => {}, $ = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: false, disabled: false, dataset: {}, classList: { add: noop, remove: noop }, querySelector: () => null, replaceChildren: noop, focus: noop, setCustomValidity: noop, reportValidity: noop });
    return elements.get(id);
  };
  const context = createContext({isNativeApp:()=>false,nativeClient:()=>null,specialistNftUI:undefined,zoneRevision:0,setWorldLoading(){},creatorStep:3,showCreatorStep(){},
    createClientCheck(options) {
      const check = { ...options, challenges: [], disposed: 0, challenge(nonce) { this.challenges.push(nonce); }, dispose() { this.disposed++; } };
      clientChecks.push(check); return check;
    },
    Error, hostingConfig, guestSessionKey, realmAddress, leaveHostingRealm, setActiveHostingRealm, realmIdValid, characterNameError,
    socket:undefined,performance,performanceHud: { reset: noop },
    activeRealmId: realmId, changingRealm: false, rosterCharacters: [], maxCharacters: 6,
    entryActive: false, rosterActive: true, worldLoading: false, connected: false, realmAvailable: false, realmOutageMessage: '', stopSessionRenewal: undefined, reconnectTimer: undefined,
    connectionRevision: 0, updateSelection: null, characterDeletion: null, creatingCharacter: false, enteredCharacterId: undefined, selectedCharacterId: null,
    heldKeyCodes:new Map(),player: undefined, keys: new Set(), party: null, partyInvites: [], dungeon: null, guideKey: '', draft: { className: 'Mage' },
    $, getAccessToken: async () => accessToken, refreshSessionAccessToken: async () => undefined,
    readLocal: key => key === 'mossvale-session' ? 'shared-guest' : undefined, saveLocal: (key, value) => saved.push([key, value]),
    document: { querySelector:()=>null,addEventListener: noop, removeEventListener: noop, body: { classList: { add: noop, remove: noop } } },
    customizer: { open: false, close() { this.open = false; } }, panel: { close: noop },
    clearTimeout: timer=>{const index=retries.indexOf(timer);if(index>=0)retries.splice(index,1);}, setTimeout: callback => {retries.push(callback);return callback;}, setInterval: noop, clearInterval: noop,
    renderRoster: noop, disposeMinimap: noop, clearSocialUI: noop, clearCombat: noop, resetInstantCombat: noop,
    goldMerchantUI: { isLinking: () => false, reject: noop },
    closeCharacterDeletion: noop, clearEntityViews: noop, clearWaypoint: noop, updatePartyHUD: noop, checkForUpdates: noop, showShutdownWarning: noop,
    chatPreviewMessages:[],chatScroll:new Map(),mobileChat:()=>false,setChatExpanded:noop,updateChatPreview:noop,updateChatUnread:noop,selectChatChannel:noop,chatChannel:'world',chatDrafts: { world: '', system: '', party: '', whisper: '' },
    showEntry: error => { errors.push(error); context.entryActive = true; }, send: value => sent.push(JSON.parse(JSON.stringify(value))),
    WebSocket: class extends EventTarget {
      static OPEN = 1;
      constructor(url) { super(); this.url = url; this.readyState = 1; sockets.push(this); }
      send(value) { sent.push(JSON.parse(value)); }
      open() { this.dispatchEvent(new Event('open')); }
      close(code = 1000) { this.readyState = 3; this.dispatchEvent(Object.assign(new Event('close'), { code })); }
      message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
    },
  });
  runInContext(main.match(/^function clearMovementKeys.*$/m)[0], context);
  runInContext(stripTypeScriptTypes(source), context);
  return { context, $, sent, sockets, saved, errors, retries, clientChecks };
}
for (const realmId of ['eu', 'us', 'asia']) for (const accessToken of [undefined, 'account-token']) {
  const { context: ctx, $, sent, sockets, saved, errors } = fixture(realmId, accessToken);
  await ctx.connect(); const socket = sockets[0]; socket.open();
  assert.equal(socket.url, `wss://${realmId}.example/socket`);
  assert.deepEqual(sent[0], { type: 'join', realmId, ...(accessToken ? { accessToken } : { token: 'shared-guest' }) });
  socket.message({ type: 'roster', realmId, characters: [shared], maxCharacters: 6, token: 'issued-guest' });
  assert.deepEqual(saved.at(-1), [guestSessionKey, 'issued-guest']);
  assert.equal(ctx.selectedCharacterId, shared.id, 'the same saved character can be selected on every server');
  $('character-name').value = 'Young Mage'; $('character-form').onsubmit({ preventDefault() {} });
  assert.deepEqual(sent.at(-1), { type: 'createCharacter', realmId, appearance: { className: 'Mage' }, name: 'Young Mage' });
  ctx.creatingCharacter = false; $('roster-enter').onclick();
  assert.deepEqual(sent.at(-1), { type: 'selectCharacter', realmId, characterId: shared.id });
  ctx.rosterCharacters = Array.from({ length: 6 }, (_, i) => ({ ...shared, id: `hero-${i}` }));
  assert.equal(ctx.realmHasSpace(), false, 'six shared characters fill the account regardless of chosen realm');
  socket.message({ type: 'roster', realmId: realmId === 'eu' ? 'us' : 'eu', characters: [], maxCharacters: 6 });
  assert.match(errors.at(-1), /different realm/);
}
for (const [from, destination] of [['eu', 'us'], ['us', 'asia'], ['asia', 'eu']]) {
  const { context: ctx, $, sent, sockets, clientChecks } = fixture(from, 'account-token');
  await ctx.connect(); const original = sockets[0]; original.open();
  const originalCheck = clientChecks[0], nonce = 'b6e026fe-d44c-4c56-8546-b51fca6f6842';
  original.message({ type: 'clientCheck', nonce });
  assert.deepEqual(originalCheck.challenges, [nonce]);
  original.message({ type: 'roster', realmId: from, characters: [shared], maxCharacters: 6 });
  const target = activeRealmTarget('/api/turnkey/wallet');
  const switching = ctx.switchHostingRealm(destination);
  assert(target.signal.aborted, 'realm handoff cancels a captured wallet destination before awaiting release');
  assert.throws(() => activeRealmTarget('/api/turnkey/wallet'), /Finish connecting/);
  assert.deepEqual(sent.at(-1), { type: 'leaveRealm' }); assert.equal(sockets.length, 1);
  assert(ctx.changingRealm && $('roster-realm').disabled && $('roster-enter').disabled);
  const before = sent.length; $('roster-enter').onclick(); await ctx.switchHostingRealm(destination);
  assert.equal(sent.length, before, 'pending handoff cannot replay entry or launch another transfer');
  original.message({ type: 'roster', realmId: from, characters: [], maxCharacters: 6 });
  assert.equal(sockets.length, 1, 'ordinary roster receipt never substitutes for durable release');
  assert.throws(() => activeRealmTarget('/api/turnkey/wallet'), /Finish connecting/, 'an old roster response cannot reopen sponsorship during a handoff');
  original.message({ type: 'realmLeft' }); await switching; await new Promise(setImmediate);
  const replacement = sockets.at(-1); replacement.open();
  assert.equal(activeRealmTarget('/api/turnkey/wallet').url, `https://${destination}.example/api/turnkey/wallet`);
  assert.equal(original.readyState, 3); assert.equal(replacement.url, `wss://${destination}.example/socket`);
  assert.equal(sent.at(-1).realmId, destination); assert(!('characterId' in sent.at(-1)));
  replacement.message({ type: 'roster', realmId: destination, characters: [{ ...shared, gold: 45 }], maxCharacters: 6 });
  assert.equal(ctx.selectedCharacterId, shared.id); assert.equal(ctx.rosterCharacters.length, 1); assert.equal(ctx.rosterCharacters[0].gold, 45);
  original.message({ type: 'roster', realmId: from, characters: [], maxCharacters: 6 });
  assert.equal(ctx.rosterCharacters.length, 1, 'replaced sockets cannot overwrite the shared roster');
  assert(originalCheck.disposed > 0, 'realm handoff disposes the source connection probe');
  assert.equal(originalCheck.active(), false);
  const responsesBefore = sent.length;
  original.message({ type: 'clientCheck', nonce: 'stale' });
  originalCheck.send({ nonce, webdriver: true });
  assert.deepEqual(originalCheck.challenges, [nonce]);
  assert.equal(sent.length, responsesBefore, 'a source-realm callback cannot send on the destination connection');
  const replacementCheck = clientChecks.at(-1);
  replacement.message({ type: 'clientCheck', nonce });
  assert.deepEqual(replacementCheck.challenges, [nonce], 'destination challenges route to a fresh probe');
  replacementCheck.send({ nonce, webdriver: false });
  assert.deepEqual(sent.at(-1), { type: 'clientCheck', nonce, webdriver: false });
}
for (const readyState of [0, 1]) {
  const { context: ctx, sockets, sent, saved } = fixture('asia', 'account-token');
  await ctx.connect(); const original = sockets[0]; original.readyState = readyState;
  if (readyState === 1) original.open();
  let handoffs = 0; ctx.leaveHostingRealm = async () => { handoffs++; };
  await ctx.switchHostingRealm('eu'); await new Promise(setImmediate);
  assert.equal(handoffs, 0, 'an unfinished join has no loaded progress to hand off');
  assert.equal(original.readyState, 3); assert.equal(ctx.activeRealmId, 'eu');
  assert.deepEqual(saved.at(-1), ['mossvale-last-realm', 'eu']);
  const replacement = sockets.at(-1); replacement.open();
  assert.equal(replacement.url, 'wss://eu.example/socket'); assert.equal(sent.at(-1).realmId, 'eu');
  original.message({ type: 'roster', realmId: 'asia', characters: [], maxCharacters: 6 });
  replacement.message({ type: 'roster', realmId: 'eu', characters: [shared], maxCharacters: 6 });
  assert.equal(ctx.selectedCharacterId, shared.id); assert.equal(ctx.realmAvailable, true);
}
for (const recovery of ['automatic', 'manual']) {
  const { context: ctx, $, sockets, retries } = fixture('eu', 'account-token');
  await ctx.connect(); sockets[0].open(); sockets[0].message({ type: 'roster', realmId: 'eu', characters: [shared], maxCharacters: 6 });
  ctx.leaveHostingRealm = async () => { throw Error('Could not confirm your progress was saved.'); };
  await ctx.switchHostingRealm('asia');
  assert.equal(sockets.length, 1); assert.equal(ctx.activeRealmId, 'eu'); assert.equal(ctx.selectedCharacterId, shared.id);
  assert.equal($('roster-retry').hidden, false); assert.match($('roster-error').textContent, /Could not confirm/);
  assert.equal($('roster-realm').value, 'eu', 'a failed handoff keeps the selector on the source realm');
  assert.equal(retries.length, 1, 'a failed handoff automatically reconnects its source realm');
  if (recovery === 'automatic') retries.shift()(); else $('roster-retry').onclick();
  await new Promise(setImmediate); sockets.at(-1).open();
  assert.equal(retries.length, 0, 'manual reconnect also cancels the automatic retry');
  assert.equal(sockets.at(-1).url, 'wss://eu.example/socket', 'uncertain saves never transfer to the destination');
  sockets.at(-1).message({ type: 'roster', realmId: 'eu', characters: [{ ...shared, gold: 45 }], maxCharacters: 6 });
  assert(ctx.connected && ctx.realmAvailable); assert.equal(ctx.selectedCharacterId, shared.id); assert.equal(ctx.rosterCharacters[0].gold, 45);
  sockets.at(-1).close(4407);
  assert.equal(retries.length, 0, 'another realm owning the account never triggers an automatic takeover');
  assert.equal($('roster-retry').hidden, false); assert.match($('roster-error').textContent, /active in another realm/);
}
const ui = readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8'), roster = readFileSync(new URL('../src/roster-ui.ts', import.meta.url), 'utf8');
assert(!ui.includes('id="character-realm"') && !ui.includes('Your realm, name'));
assert(roster.includes('label for="roster-realm"') && roster.includes('Your progress follows you.'));
assert(!roster.includes('data-realm-id=') && !main.includes('loadOtherRealmRosters'));
console.log('PASS shared realm client: safe addresses, unavailable unconfigured Asia, legacy two-realm config, common guest identity, one six-character roster, explicit EU/US/Asia routing, cancellable unfinished joins, durable release before switching, automatic source-realm recovery, retained character/progress, stale-socket rejection, and no automatic account takeover.');
