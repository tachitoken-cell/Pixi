import * as THREE from 'three';
import ts from 'typescript';
import { surfaceHeight } from '../src/terrain-view.ts';
import { newJump } from '../src/jumping.ts';
import { REGION_ORIGINS, waterAt } from '../src/landscape.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { SPELLS, HOTBAR_PAGE_SIZE } from '../src/spells.ts';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { hostingConfig, guestSessionKey, realmAddress } from '../src/hosting-client.ts';

// Exercise the shipped TS module with the browser and identity adapter boundary mocked.
const calls = [];
let options = {};
let adapter;
const storage = new Map(), tabStorage = new Map();
const signedOutStorage = message => {
  assert.deepEqual([...storage.keys()], ['mossvale-wallet-reset'], message);
  assert.match(storage.get('mossvale-wallet-reset'), /^[\da-f-]{36}$/i, 'sign-out persists only a non-secret wallet invalidation marker');
};
globalThis.location = { origin: 'https://mossvale.example' };
const browserStorage = data => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
globalThis.localStorage = browserStorage(storage);
globalThis.sessionStorage = browserStorage(tabStorage);
globalThis.MockKeycloak = class {
  constructor(config) { this.config = config; adapter = this; }
  async init(config) {
    calls.push(['init', config]);
    if (options.initError) throw new Error('Provider unavailable');
    this.authenticated = !!options.account || (!!options.ssoAccount && config.onLoad === 'check-sso');
    this.token = this.authenticated ? 'test-access-token' : undefined;
    return this.authenticated;
  }
  async updateToken(validity) {
    calls.push(['refresh', validity]);
    if (options.refreshError) { if (options.revokedRefresh) this.clearToken(); throw new Error('Session could not refresh'); }
    if (options.missingToken) this.token = undefined;
    else this.token = 'test-refreshed-token';
  }
  clearToken() { calls.push(['clear']); this.authenticated = false; this.token = undefined; }
  async login(config) { calls.push(['login', config]); if (options.actionError) throw new Error(); }
  async register(config) { calls.push(['register', config]); if (options.actionError) throw new Error(); }
  async logout(config) { calls.push(['logout', config]); if (options.actionError) throw new Error(); }
};
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'keycloak-js' && context.parentURL?.includes('/src/auth.ts')) {
      return { url: 'data:text/javascript,export default globalThis.MockKeycloak', shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const config = { keycloak: { url: 'https://accounts.example', realm: 'mossvale', clientId: 'mossvale-browser' } };
let sequence = 0;
async function fresh(settings = {}, response = config, preserveStorage = false) {
  options = settings; calls.length = 0; adapter = undefined;
  if (!preserveStorage) { storage.clear(); tabStorage.clear(); }
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/config?app-startup=1');
    assert.equal(init.cache, 'no-store');
    if (options.fetchError) throw new Error('Offline');
    return { ok: !options.httpError, json: async () => response };
  };
  return import(`../src/auth.ts?check=${sequence++}`);
}

try {
  let auth = await fresh();
  await assert.rejects(auth.getAccessToken(), /not ready/);
  assert.equal(await auth.initAuth(), 'signed-out');
  assert.equal(auth.authEnabled, true);
  assert.deepEqual(calls, [['init', { pkceMethod: 'S256', checkLoginIframe: false, flow: 'standard', redirectUri: location.origin }]]);
  assert.equal(storage.size, 0, 'first visit must not start SSO or persist credentials');
  await assert.rejects(auth.getAccessToken(), /session has ended/);
  assert.ok(!calls.some(([name]) => name === 'login'), 'expired sessions must not redirect automatically');
  await auth.signIn(); await auth.createAccount();
  assert.deepEqual(calls.filter(([name]) => ['login', 'register'].includes(name)), [
    ['login', { redirectUri: location.origin }], ['register', { redirectUri: location.origin }],
  ]);

  assert.equal(auth.walletSignInEnabled, false);
  assert.deepEqual(auth.socialSignInEnabled, { google: false, apple: false });
  for (const provider of ['google', 'apple', '__proto__', '../google']) await assert.rejects(auth.signInWithSocial(provider), /not available/);
  auth = await fresh({}, { ...config, socialProviders: { google: 'google', apple: 'apple' } });
  await auth.initAuth(); await auth.signInWithSocial('google'); await auth.signInWithSocial('apple');
  assert.deepEqual(calls.filter(([name]) => name === 'login'), ['google', 'apple'].map(idpHint => ['login', { redirectUri: location.origin, idpHint }]));
  for (const socialProviders of [null, {}, { google: 'apple', apple: 'google' }, { google: true, apple: 'https://other.example' }, { google: '../google' }]) {
    auth = await fresh({}, { ...config, socialProviders }); await auth.initAuth();
    assert.deepEqual(auth.socialSignInEnabled, { google: false, apple: false });
    await assert.rejects(auth.signInWithSocial('google'), /not available/); await assert.rejects(auth.signInWithSocial('apple'), /not available/);
    assert(!calls.some(([name]) => name === 'login'));
  }
  globalThis.__MOSSVALE_NATIVE_AUTH__ = true;
  auth = await fresh({}, { ...config, socialProviders: { google: 'google', apple: 'apple' }, walletBroker: { enabled: true, provider: 'mossvale-wallet' } }); await auth.initAuth();
  await auth.signIn(); await auth.createAccount(); await auth.signInWithSocial('apple');
  assert(calls.filter(([name]) => ['init', 'login', 'register'].includes(name)).every(([, settings]) => settings.redirectUri === 'mossvale://auth/callback'), 'native PKCE state must store the same custom redirect used for authorization and token exchange');
  await auth.signInWithWallet(); assert.deepEqual(calls.at(-1), ['login', { redirectUri: location.origin, idpHint: 'mossvale-wallet', prompt: 'login' }], 'wallet sign-in preserves its existing in-app broker and exact HTTPS token-exchange redirect');
  globalThis.__MOSSVALE_NATIVE_WALLET_BROWSER__ = true;
  await auth.signInWithWallet(); assert.deepEqual(calls.at(-1), ['login', { redirectUri: 'mossvale://auth/callback', idpHint: 'mossvale-wallet', prompt: 'login' }], 'new wallet-browser binaries keep the native callback in the original PKCE transaction');
  globalThis.__MOSSVALE_NATIVE_AUTH_LINKS__ = true;
  await auth.signInWithWallet(); assert.deepEqual(calls.at(-1), ['login', { redirectUri: 'https://mossvale.world/mobile-auth/callback', idpHint: 'mossvale-wallet', prompt: 'login' }], 'app-link binaries store the verified HTTPS wallet callback in the original PKCE transaction');
  await auth.signIn(); assert.equal(calls.at(-1)[1].redirectUri, 'mossvale://auth/callback', 'account sign-in keeps its authentication-session callback');
  delete globalThis.__MOSSVALE_NATIVE_AUTH_LINKS__;
  delete globalThis.__MOSSVALE_NATIVE_WALLET_BROWSER__;
  await auth.signOut(); assert.equal(calls.find(([name]) => name === 'logout')[1].redirectUri, location.origin, 'native logout keeps the HTTPS POST return');
  delete globalThis.__MOSSVALE_NATIVE_AUTH__;
  globalThis.__MOSSVALE_NATIVE__ = true;
  auth = await fresh({}, { ...config, socialProviders: { google: 'google', apple: 'apple' } }); await auth.initAuth(); await auth.signIn();
  assert.equal(auth.socialSignInRequiresUpdate, true); assert.deepEqual(auth.socialSignInEnabled, { google: false, apple: false });
  await assert.rejects(auth.signInWithSocial('google'), /not available/);
  assert(calls.filter(([name]) => ['init', 'login'].includes(name)).every(([, settings]) => settings.redirectUri === location.origin), 'old APK keeps its working HTTPS account callback');
  delete globalThis.__MOSSVALE_NATIVE__;
  auth = await fresh(); await auth.initAuth();
  await assert.rejects(auth.signInWithWallet(), /not available/);
  auth = await fresh({}, { ...config, walletBroker: { enabled: true, provider: 'mossvale-wallet', chainId: 4663 } });
  await auth.initAuth(); assert.equal(auth.walletSignInEnabled, true); await auth.signInWithWallet();
  assert.deepEqual(calls.find(([name]) => name === 'login'), ['login', { redirectUri: location.origin, idpHint: 'mossvale-wallet', prompt: 'login' }]);
  for (const walletBroker of [{ enabled: false, provider: 'mossvale-wallet' }, { enabled: true, provider: '../other' }, null]) {
    auth = await fresh({}, { ...config, walletBroker }); await auth.initAuth();
    assert.equal(auth.walletSignInEnabled, false); await assert.rejects(auth.signInWithWallet(), /not available/);
    assert.ok(!calls.some(([name]) => name === 'login'));
  }

  auth = await fresh({ account: true });
  assert.equal(await auth.initAuth(), 'account');
  assert.equal(await auth.getAccessToken(), 'test-refreshed-token');
  assert.equal(await auth.getAccessToken(true), 'test-refreshed-token');
  assert.deepEqual(calls.filter(([name]) => name === 'refresh'), [['refresh', 30], ['refresh', -1]]);
  assert.deepEqual([...new Map([...storage, ...tabStorage])], [['mossvale-signed-in', '1']], 'remember only a non-secret sign-in preference');
  await auth.initAuth();
  assert.equal(calls.filter(([name]) => name === 'init').length, 1);

  auth = await fresh({ account: true }, config, true);
  assert.equal(await auth.initAuth(), 'account');
  assert.equal(calls[0][1].onLoad, 'check-sso', 'existing account reload resumes through the provider');
  await auth.signOut();
  assert.deepEqual(calls.find(([name]) => name === 'logout'), ['logout', { redirectUri: location.origin, logoutMethod: 'POST' }]);
  assert.equal(adapter.authenticated, false);
  signedOutStorage('sign-out must remove sign-in state and invalidate a lazily loaded wallet');
  assert.equal(tabStorage.size, 0, 'sign-out also removes the legacy session marker');

  for (const native of ['browser', 'old-app', 'native-auth']) {
    globalThis.__MOSSVALE_NATIVE__ = native !== 'browser';
    globalThis.__MOSSVALE_NATIVE_AUTH__ = native === 'native-auth';
    auth = await fresh({ account: true }); await auth.initAuth();
    tabStorage.clear(); // Closing the browser/app destroys the document and its session storage.
    auth = await fresh({ ssoAccount: true }, config, true);
    assert.equal(await auth.initAuth(), 'account', `${native} restart restores through the existing provider session`);
    assert.equal(calls[0][1].onLoad, 'check-sso');
    assert.equal(calls[0][1].redirectUri, native === 'native-auth' ? 'mossvale://auth/callback' : location.origin);
    assert.equal(calls[0][1].silentCheckSsoRedirectUri, native === 'browser' ? `${location.origin}/silent-check-sso.html` : undefined);
    assert.equal(calls[0][1].silentCheckSsoFallback, native === 'browser' ? false : undefined, 'browser privacy restrictions cannot cause a full-page SSO redirect');
    assert.deepEqual([...storage], [['mossvale-signed-in', '1']], 'access and refresh tokens are never persisted');
    assert(!calls.some(([name]) => name === 'login'), 'restoration does not force interactive login');
    await auth.signOut(); tabStorage.clear();
    auth = await fresh({ ssoAccount: true }, config, true);
    assert.equal(await auth.initAuth(), 'signed-out', 'explicit logout remains signed out after app restart');
    assert.equal(calls[0][1].onLoad, undefined);
  }
  delete globalThis.__MOSSVALE_NATIVE__; delete globalThis.__MOSSVALE_NATIVE_AUTH__;
  auth = await fresh({ ssoAccount: true }); tabStorage.set('mossvale-signed-in', '1');
  assert.equal(await auth.initAuth(), 'account', 'existing session-only preferences migrate on the next reload');
  assert.equal(storage.get('mossvale-signed-in'), '1');

  auth = await fresh({ account: true }); await auth.initAuth();
  auth = await fresh({}, config, true);
  assert.equal(await auth.initAuth(), 'signed-out');
  assert.equal(calls[0][1].onLoad, 'check-sso');
  assert.equal(storage.size, 0, 'expired SSO must stop automatic retry on the next reload');
  assert.equal(tabStorage.size, 0);
  auth = await fresh({ ssoAccount: true }, config, true); await auth.initAuth();
  assert.equal(calls[0][1].onLoad, undefined, 'expired SSO cannot cause a restart loop');

  for (const failure of [{ refreshError: true, revokedRefresh: true }, { missingToken: true }]) {
    auth = await fresh({ account: true, ...failure }); await auth.initAuth();
    await assert.rejects(auth.getAccessToken(), /session has ended/);
    assert.equal(adapter.token, undefined, 'failed refresh must clear stale authority');
    signedOutStorage('revoked sessions invalidate saved wallet access');
    assert.ok(!calls.some(([name]) => name === 'login'));
  }

  auth = await fresh({ account: true, refreshError: true }); await auth.initAuth();
  await assert.rejects(auth.getAccessToken(), /Could not refresh/);
  assert.equal(storage.get('mossvale-signed-in'), '1', 'an offline reconnect preserves sign-in for a later retry');
  calls.length = 0;
  assert.equal(await auth.refreshSessionAccessToken(), undefined);
  assert.equal(adapter.token, 'test-access-token'); assert.equal(adapter.authenticated, true);
  assert.equal(storage.get('mossvale-signed-in'), '1', 'temporary renewal errors preserve the current session and reload marker');
  assert(!calls.some(([name]) => name === 'clear' || name === 'login'));
  options.refreshError = false;
  assert.equal(await auth.refreshSessionAccessToken(), 'test-refreshed-token', 'renewal retries recover after a temporary provider failure');
  assert.deepEqual(calls.filter(([name]) => name === 'refresh'), [['refresh', 60], ['refresh', 60]]);
  await auth.refreshSessionAccessToken(true);
  assert.deepEqual(calls.at(-1), ['refresh', -1], 'server expiry prompts force renewal even at the adapter margin boundary');
  adapter.clearToken(); const revokedCalls = calls.length;
  assert.equal(await auth.refreshSessionAccessToken(), undefined); assert.equal(calls.length, revokedCalls, 'an unauthenticated adapter cannot renew');

  auth = await fresh({}, { keycloak: null });
  assert.equal(await auth.initAuth(), 'guest');
  assert.equal(auth.authEnabled, false);
  assert.equal(await auth.getAccessToken(), undefined);
  assert.equal(await auth.refreshSessionAccessToken(), undefined);
  await auth.signOut();
  await assert.rejects(auth.signIn(), /could not be opened/);
  await assert.rejects(auth.createAccount(), /could not be opened/);
  assert.equal(adapter, undefined);

  for (const badConfig of [{}, { keycloak: {} }, { keycloak: { ...config.keycloak, url: 'javascript:alert(1)' } }, { keycloak: { ...config.keycloak, url: 'https://user:password@example.com' } }]) {
    auth = await fresh({}, badConfig);
    await assert.rejects(auth.initAuth(), /settings|address/);
    await assert.rejects(auth.getAccessToken(), /not ready/);
  }
  for (const failure of [{ fetchError: true }, { httpError: true }, { initError: true }]) {
    auth = await fresh({ account: true }); await auth.initAuth();
    auth = await fresh(failure, config, true);
    await assert.rejects(auth.initAuth(), /could not|Could not/);
    await assert.rejects(auth.getAccessToken(), /not ready/);
    if (failure.initError) signedOutStorage('failed account initialization invalidates saved wallet access');
  }
  auth = await fresh({ account: true, actionError: true }); await auth.initAuth();
  await assert.rejects(auth.signIn(), /could not be opened/);
  await assert.rejects(auth.createAccount(), /could not be opened/);
  await assert.rejects(auth.signOut(), /could not be completed/);
  signedOutStorage('failed sign-out must not restart automatic SSO');
  auth = await fresh({ actionError: true }, { ...config, socialProviders: { google: 'google' } }); await auth.initAuth();
  await assert.rejects(auth.signInWithSocial('google'), /Google sign-in could not be opened/);
  assert.equal(storage.size, 0, 'failed social sign-in must not persist account state');

  globalThis.localStorage = { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } };
  auth = await fresh({ account: true }); await auth.initAuth();
  assert.equal(tabStorage.get('mossvale-signed-in'), '1', 'session storage remains a fallback if persistent storage is denied');
  auth = await fresh({ ssoAccount: true }, config, true); assert.equal(await auth.initAuth(), 'account');
  auth.clearSession(); assert.equal(tabStorage.size, 0);
  globalThis.sessionStorage = globalThis.localStorage;
  auth = await fresh({ account: true });
  assert.equal(await auth.initAuth(), 'account');
  assert.equal(await auth.getAccessToken(), 'test-refreshed-token');
  auth.clearSession();
  console.log('PASS: explicit sign-in/register; callback/reload and browser/native app-restart SSO without stored tokens; POST logout; guest mode; configuration errors; revoked/missing tokens fail closed without redirects; storage fallback/unavailable.');
} finally {
  hook.deregister();
  delete globalThis.MockKeycloak;
}

// Run the shipped connection lifecycle without starting WebGL or a real network.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const functionText = name => tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(tree);
const connectionSource = ['snapWorldPosition','connect'].map(functionText).join('\n');
const sockets = [], timers = [], refreshes = [], joins = [], renewals = [], pings = [], combat = [], transitions = [], damage = [], notices = [];
const clientChecks = [], clientCheckResponses = [];
const intervals = new Map(), visibilityListeners = new Set(); let intervalId = 0;
let entryCount = 0, clearCount = 0, rosterCount = 0;
const noop = () => {};
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { textContent: '', hidden: false, classList: { add: noop, remove: noop }, focus: noop });
  return elements.get(id);
};
const context = {instantCombat:null,lastInstantCombatPanel:'',resetInstantCombat:noop,renderInstantCombatMenu:noop,isNativeApp:()=>false,nativeClient:()=>null,specialistNftUI:undefined,raid:null,raidInvites:[],raidAppearance:()=>[],presentedRaidResult:"",presentedDungeonResult:"",arenaWagerUI:{close:noop,reject:noop},hearthlingPending:false,hearthlingNotice:"",renderHearthlingPanel:noop,
  createClientCheck(options) {
    const check = { ...options, challenges: [], disposed: 0, challenge(nonce) { this.challenges.push(nonce); }, dispose() { this.disposed++; } };
    clientChecks.push(check); return check;
  },
  performance:{now:()=>Date.now()},treasureMapStarting:false,socket:undefined,performanceHud:{reset:noop,pong:noop},chatTranslation:{configure:noop,receive:noop},
  playMonsterHit:noop,enemyMeshes:new Map(),elapsed:0,
  hostingConfig, guestSessionKey, realmAddress, HOTBAR_PAGE_SIZE, activeRealmId: 'eu', realmHasSpace: () => true, renderRealmOptions: noop, creatingCharacter: false, changingRealm: false,
  characterDeletion:null,closeCharacterDeletion:noop,characterDeletionError:noop,realmAvailable:false,realmOutageMessage:'',reconnectTimer:undefined,checkForUpdates:async()=>{},updateSelection:null,sessionDisplaced:false,stopSessionRenewal:undefined,rosterCharacters:[],maxCharacters:6,updateRosterAvailability:noop,showRealmUnavailable:noop,clearTimeout:timer=>{const index=timers.indexOf(timer);if(index>=0)timers.splice(index,1);},
  showShutdownWarning:noop,mountViews:new Map(),trainingPending:null, moderationNotice:null, gmPlayers:[], refreshGmAccess:noop, gmUI:{result:noop,close:noop}, lootUI:{drops:[],update(drops){this.drops=drops;},visibleDrops(){return this.drops;}}, duelUI:{update:noop}, arenaUI:{update:noop},
  entryActive: false, rosterActive: true, enteredCharacterId: undefined, selectedCharacterId: null, selectedBagItem: null, connectionRevision: 0, connected: false, playerName: 'Adventurer', appearance: {},
  location: { protocol: 'https:', host: 'mossvale.example' },
  getAccessToken: async force => { refreshes.push(force); return 'test-access-token'; },
  refreshSessionAccessToken: async () => 'test-access-token', readLocal:()=>undefined,
  heldKeyCodes:new Map(),$: element, keys: new Set(), waypoint: null, yaw: 0, canvas: { focus: noop },
  groundWaypoint: {update: noop}, waypointIndicator: { update: point => { context.visibleWaypoint = point; } }, combatAnimations: new Map(),
  document: { querySelector:selector=>selector==='.wallet-picker[open]'?null:{getAttribute:()=>'/assets/game-test.js'}, body: { classList: { add: noop, remove: noop } },visibilityState:'visible',
    addEventListener:(name,callback)=>{assert.equal(name,'visibilitychange');visibilityListeners.add(callback);},
    removeEventListener:(name,callback)=>{assert.equal(name,'visibilitychange');visibilityListeners.delete(callback);}},
  newJump, jump: newJump(0, 8), reconcileJump: noop, position: new THREE.Vector3(), localAvatar: { position: new THREE.Vector3() }, cameraTarget: new THREE.Vector3(), surfaceHeight, waterAt,
  switchZone: async (zone, instanceId) => { transitions.push([zone, instanceId]); context.worldZone = zone; context.worldInstance = instanceId; }, zoneError: noop,
  worldReady: true, renderedInstance:null, updateDungeonRoomView:noop, visibleInDungeonRoom:()=>true, worldLoading: false, worldZone: 'greenwood', worldInstance: null, worldDungeonKind: null, zoneRevision: 0, setWorldLoading: noop, party: null, partyInvites: [], dungeon: null,
  updateShopSales: noop, shopSaleEvent: noop, clearSocialUI: noop, playerMenu: { update: noop }, tradeUI: { update: noop, refresh: noop }, renderInspectPanel: noop, updatePartyHUD: noop, playCombat: event => combat.push(event), clearCombat: noop,
  achievementsUI: { update: player => { context.achievementPlayer = player; }, titleSelected: noop, unlock: noop },
  auctionUI: { refresh: noop, reject: noop }, nftUI: { reject: noop }, goldMerchantUI: { isLinking: () => false, reject: noop }, updatePartyInvitation: noop, updateWho: noop, damageNumbers: { play: event => damage.push(event) },
  zoneHandle: { setDungeonState: noop }, serverOffset: 0,
  syncEntities: noop, hotbar: { reject: noop },
  replaceAvatar: noop, saveLocal: noop, updateHUD: noop, updateAudioScene: noop, openDeath: noop, toast: text => notices.push(text), chatMessage: noop, gameAudio: { play: noop, reset: noop },
  customizer: { open: false, close() { this.open = false; } },
  panel: { open: false, dataset: {} },
  showCharacterRoster: () => { rosterCount++; context.rosterActive = true; context.enteredCharacterId = undefined; context.player = undefined; },
  showEntry: () => { entryCount++; context.entryActive = true; },
  clearSession: () => { clearCount++; },
  setTimeout: (callback,ms) => { callback.ms=ms;timers.push(callback);return callback; },
  setInterval:(callback,ms)=>{intervals.set(++intervalId,{callback,ms});return intervalId;},clearInterval:id=>intervals.delete(id),
  WebSocket: class {
    static OPEN=1;
    constructor() { this.events = {}; this.readyState=0; sockets.push(this); }
    addEventListener(name, callback) { this.events[name] = callback; }
    send(raw) { const message = JSON.parse(raw); assert(['join','refreshSession','ping','clientCheck'].includes(message.type)); (message.type==='join'?joins:message.type==='ping'?pings:message.type==='clientCheck'?clientCheckResponses:renewals).push(message); }
    close(code, reason) { this.readyState=3; this.closeCode=code; this.closeReason=reason; }
    open() { this.readyState=1;this.events.open(); }
    message(message) { this.events.message({ data: JSON.stringify(message) }); }
    roster() { this.message({ type: 'roster', characters: [], maxCharacters: 6 }); }
    welcome(id = 'hero-a') { this.message({ type: 'welcome', id, player: { id, characterCreated: true, x: 0, z: 8, rotation: 0, appearance: {}, name: 'Adventurer', zone: 'greenwood', hp: 100 } }); }
    expire() { this.readyState=3;this.events.close({ code: 4401 }); }
  },
};
runInNewContext(main.match(/^function clearMovementKeys.*$/m)[0], context);
const clearWaypointSource = main.slice(main.indexOf('function clearWaypoint('), main.indexOf('function setWaypoint('));
const connect = runInNewContext(stripTypeScriptTypes(clearWaypointSource + main.slice(main.indexOf('function updateRosterAvailability('),main.indexOf('function showRealmUnavailable(')) + connectionSource) + '\nconnect;', context);
await connect(); sockets.at(-1).open(); sockets.at(-1).roster();
assert.equal(joins[0].characterId, undefined, 'first account connection must not auto-enter a character');
assert(!('name' in joins[0]) && !('appearance' in joins[0]), 'account authentication does not create a draft identity');
assert.equal(rosterCount, 1); assert.equal(context.connected, true); assert.equal(context.player, undefined);
assert.equal(context.rosterActive, true, 'authentication alone stays in character selection');
sockets.at(-1).message({ type: 'combat', zone: 'greenwood' });
assert.equal(combat.length, 0, 'world effects never appear on the roster');
sockets.at(-1).message({ type: 'damage', targetId: 'slime', targetKind: 'enemy', amount: 17, x: 0, z: 0 });
assert.equal(damage.length, 0, 'damage numbers never appear on the roster');
sockets.at(-1).message({ type: 'snapshot', players: [{ id: 'stale-world-character' }] });
assert.equal(context.player, undefined, 'a delayed world snapshot cannot bypass the roster');
sockets.at(-1).message({ type: 'correction', x: 96, z: -96, zone: 'frostmarch', instanceId: null });
assert.equal(context.position.x, 0, 'a delayed correction cannot move the character during roster selection');
context.creatingCharacter = true; element('create-character').disabled = true;
sockets.at(-1).message({ type: 'event', kind: 'info', text: 'That character name is already taken.' });
assert.equal(context.creatingCharacter, false); assert.equal(element('create-character').disabled, false);
assert.equal(element('creation-error').textContent, 'That character name is already taken.', 'a rejected creation is visible and retryable');
// A roster response authenticates the socket even when no character enters the world.
context.creatingCharacter = true;
sockets.at(-1).expire();
assert.equal(context.creatingCharacter, false, 'a lost connection releases pending creation so Cancel can return to the roster');
timers.shift()(); await new Promise(setImmediate);
sockets.at(-1).open(); sockets.at(-1).roster();
assert.equal(joins.at(-1).characterId, undefined, 'reconnecting from the roster stays at the roster');
assert.equal(entryCount, 0);
sockets.at(-1).welcome('hero-a');
assert.equal(context.enteredCharacterId, 'hero-a'); assert.equal(context.rosterActive, false);
assert.equal(context.player.id, 'hero-a', 'only selected-character welcome unlocks the world');
const frost = REGION_ORIGINS.frostmarch;
sockets.at(-1).message({type:'welcome',id:'hero-a',player:{...context.player,x:frost.x,z:frost.z+8,zone:'frostmarch',instanceId:null}});
assert.equal(context.position.y,25,'high-town welcome resolves the actual terrain height before the first frame');
assert.deepEqual(context.localAvatar.position.toArray(),context.position.toArray(),'welcome cannot animate the avatar upward from underground');
assert.deepEqual(context.cameraTarget.toArray(),[frost.x,26.2,frost.z+8],'welcome snaps the camera to the selected town instead of crossing the entire realm');
sockets.at(-1).message({type:'welcome',id:'hero-a',player:{...context.player,x:-668,z:-764,zone:'amberwild',instanceId:null}});
assert(context.localAvatar.position.distanceTo(new THREE.Vector3(-668,-.65,-764))<1e-9,'a saved swimmer resumes at the body waterline, never the seabed');
assert.deepEqual(context.cameraTarget.toArray(),[-668,.6,-764]);
sockets.at(-1).welcome();
assert.equal(context.achievementPlayer, context.player, 'entering a realm updates achievements for its authoritative character');

sockets.at(-1).message({ type: 'snapshot', zone: 'greenwood', instanceId: null, players: [context.player], enemies: [], nodes: [], party: { id: 'party-a', members: [] }, partyInvites: [{ id: 'invitation-a' }], dungeon: null, loot: [
  { id: 'mine', ownerId: 'hero-a' }, { id: 'theirs', ownerId: 'hero-b' },
] });
assert.equal(context.loot.length, 1); assert.equal(context.loot[0].id, 'mine', 'only this character sees actionable personal loot');
assert.equal(context.party.id, 'party-a'); assert.equal(context.partyInvites[0].id, 'invitation-a');
sockets.at(-1).message({ type: 'combat', zone: 'amberwild' });
assert.equal(combat.length, 1, 'connected overworld combat remains visible across regional seams');
sockets.at(-1).message({ type: 'combat', zone: 'greenwood', instanceId: 'other-dungeon' });
assert.equal(combat.length, 1, 'another dungeon instance cannot leak effects into the overworld');
context.worldReady = false;
sockets.at(-1).message({ type: 'combat', zone: 'greenwood' });
assert.equal(combat.length, 1, 'combat during world loading is ignored');
context.worldReady = true;
sockets.at(-1).message({ type: 'combat', zone: 'greenwood', ability: 'fireball', playerId: 'hero-a' });
assert.equal(combat.length, 2, 'an accepted local or remote attack reaches the world renderer');
assert.equal(damage.length, 0, 'launching attacks does not invent damage numbers');
sockets.at(-1).message({ type: 'damage', targetId: 'slime', targetKind: 'enemy', amount: 17, x: 0, z: 0 });
assert.equal(damage[0].amount, 17, 'confirmed damage reaches the floating-text renderer');
const noticeCount = notices.length;
for (const kind of ['combat', 'damage']) sockets.at(-1).message({ type: 'event', kind, text: 'Combat hit.' });
assert.equal(notices.length, noticeCount, 'duplicate hit notifications do not cover floating damage');
context.worldReady = false;
sockets.at(-1).message({ type: 'damage', targetId: 'slime', targetKind: 'enemy', amount: 17, x: 0, z: 0 });
assert.equal(damage.length, 1, 'damage during world loading is ignored'); context.worldReady = true;
context.keys.add('w');
sockets.at(-1).message({ type: 'correction', x: 0, z: 22, rotation: 1, zone: 'hollow', instanceId: 'rootvault-a' });
assert.deepEqual(transitions.at(-1), ['hollow', 'rootvault-a']);
assert.deepEqual([context.position.x, context.position.y, context.position.z, context.rotation], [0, 0, 22, 1]);
assert.deepEqual(context.localAvatar.position.toArray(),[0,0,22]);assert.deepEqual(context.cameraTarget.toArray(),[0,1.2,22],'instance corrections also snap the body and camera to the dungeon floor');
assert.equal(context.keys.size, 0, 'server correction releases held movement before accepting new manual input');
sockets.at(-1).message({ type: 'combat', zone: 'hollow', instanceId: null });
sockets.at(-1).message({ type: 'combat', zone: 'hollow', instanceId: 'rootvault-b' });
assert.equal(combat.length, 2, 'an instanced player ignores both overworld and neighboring dungeon combat');
sockets.at(-1).message({ type: 'combat', zone: 'hollow', instanceId: 'rootvault-a' });
assert.equal(combat.length, 3);
sockets.at(-1).message({ type: 'snapshot', zone: 'frostmarch', instanceId: null, players: [{ ...context.player, x: frost.x, z: frost.z, zone: 'frostmarch', instanceId: null }], enemies: [], nodes: [], loot: [] });
assert.deepEqual(transitions.at(-1), ['frostmarch', null]);
assert.deepEqual(context.position.toArray(), [0,0,22], 'living snapshots wait for an explicit position correction');
sockets.at(-1).message({type:'correction',x:frost.x,z:frost.z,rotation:0,zone:'frostmarch',instanceId:null});
assert.deepEqual(context.position.toArray(), [frost.x,25,frost.z], 'explicit corrections reconcile at the real global elevation');
assert.deepEqual(context.localAvatar.position.toArray(),context.position.toArray());assert.deepEqual(context.cameraTarget.toArray(),[frost.x,26.2,frost.z]);
assert.equal(context.party, null); assert.equal(context.partyInvites.length, 0); assert.equal(context.dungeon, null, 'cleared party and dungeon state is removed on the next snapshot');
context.waypoint = { x: frost.x + 30, z: frost.z, label: 'Saved destination', instanceId: null }; context.keys.add('w');
context.combatAnimations.set(context.playerId, { ability: 'arrow' });
const livingPlayer = context.player;
sockets.at(-1).message({ type: 'snapshot', zone: 'frostmarch', instanceId: null, players: [{ ...livingPlayer, hp: 0 }], enemies: [], nodes: [], loot: [] });
assert.equal(context.waypoint, null); assert.equal(context.visibleWaypoint, null, 'a death snapshot immediately clears the waypoint and direction indicator');
assert.equal(context.keys.size, 0); assert(!context.combatAnimations.has(context.playerId), 'death stops held movement and the active attack pose');
sockets.at(-1).message({ type: 'snapshot', zone: 'frostmarch', instanceId: null, players: [livingPlayer], enemies: [], nodes: [], loot: [] });
assert.equal(context.waypoint, null, 'reviving does not restore a discarded destination');
for (let cycle = 0; cycle < 2; cycle++) {
  sockets.at(-1).expire();
  assert.equal(timers.length, 1, 'each authenticated connection gets a fresh token-expiry retry');
  timers.shift()(); await new Promise(setImmediate);
  sockets.at(-1).open();
  assert.equal(joins.at(-1).characterId, 'hero-a', 'runtime reconnect resumes the entered character, not another roster member');
  sockets.at(-1).welcome();
  assert.equal(entryCount, 0, 'successful refresh must keep the player in the world');
}
assert.deepEqual(refreshes, [false, true, true, true]);
// A refreshed token rejected before any roster/welcome must stop instead of looping.
await connect(); sockets.at(-1).expire();
assert.equal(timers.length, 1);
timers.shift()(); await new Promise(setImmediate); sockets.at(-1).expire();
assert.equal(entryCount, 1); assert.equal(clearCount, 1); assert.equal(timers.length, 0);
context.entryActive = false;
await connect(); sockets.at(-1).events.close({ code: 4403 });
assert.equal(entryCount, 2); assert.equal(timers.length, 0, 'an anti-cheat session stop cannot enter an automatic reconnect loop');
context.entryActive=false;await connect();sockets.at(-1).events.close({code:4410});
assert.equal(entryCount,3);assert.equal(clearCount,2);assert.equal(timers.length,0,'account deletion clears authorization and stops automatic reconnect');
Object.assign(context, { waypoint: { x: 30, z: 20, label: 'Old account destination', instanceId: null }, keys: new Set(['w']),
  mountViews: new Map(), disposeMount: noop, disposeMinimap: noop, connected: true, entryActive: false });
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function pauseConnection('), main.indexOf('function showEntry('))) + '\npauseConnection();', context);
assert.equal(context.waypoint, null); assert.equal(context.visibleWaypoint, null); assert.equal(context.keys.size, 0);
assert.equal(context.connected, false); assert.equal(context.entryActive, true); assert.equal(context.player, undefined); assert.equal(context.enteredCharacterId, undefined);
assert.equal(context.party, null); assert.equal(context.partyInvites.length, 0); assert.equal(context.dungeon, null, 'leaving an account clears navigation, character authority and social state');
console.log('PASS: account/character separation, selected-character reconnect, expiry rejection, global corrections, party snapshots, death/logout waypoint cleanup, combat instance isolation and anti-cheat disconnect handling.');

// Live token renewal never replaces the socket or overlaps an existing adapter request.
assert.equal(intervals.size,0);assert.equal(visibilityListeners.size,0,'pause removes the old renewal timer and visibility listener');
context.entryActive=false;let renewalCalls=0,nextToken='test-access-token';
const renewalForces=[];
context.refreshSessionAccessToken=async force=>{renewalCalls++;renewalForces.push(force);return nextToken;};
const settle=()=>new Promise(setImmediate),visible=()=>{for(const listener of visibilityListeners)listener();};
await connect();const renewedSocket=sockets.at(-1),renewalInterval=[...intervals.values()][0],socketCount=sockets.length;
assert.equal(renewalInterval.ms,15000);renewalInterval.callback();await settle();assert.equal(renewalCalls,0,'unjoined sockets do not refresh');
renewedSocket.open();renewalInterval.callback();await settle();assert.equal(renewalCalls,0,'renewal waits for the server to authenticate the socket');
renewedSocket.roster();renewalInterval.callback();await settle();assert.equal(renewalCalls,1);assert.equal(renewals.length,0,'unchanged tokens are not sent again');
nextToken='renewed-token-one';renewalInterval.callback();await settle();
assert.deepEqual(renewals,[{type:'refreshSession',accessToken:nextToken}]);assert.equal(sockets.length,socketCount,'renewal uses the existing socket');
renewalInterval.callback();await settle();assert.equal(renewals.length,1);
nextToken=undefined;renewalInterval.callback();await settle();assert.equal(renewals.length,1);assert(context.connected&&!context.entryActive,'temporary provider failure leaves the realm connection usable');
// AFK: no timer or visibility callbacks run. Incoming server prompts must renew both roster and world sessions.
context.document.visibilityState='hidden';
for(const inWorld of [false,true]){
 if(inWorld)renewedSocket.welcome();
 const beforePrompts=renewals.length,beforeNotices=notices.length;
 nextToken=undefined;renewedSocket.message({type:'sessionRefresh'});await settle();
 assert.equal(renewalForces.at(-1),true,'server prompts force refresh while hidden without a browser timer');
 assert.equal(renewals.length,beforePrompts,'a transient provider error keeps the existing connection');
 nextToken=`afk-renewed-${inWorld}`;renewedSocket.message({type:'sessionRefresh'});await settle();
 assert.equal(renewals.at(-1).accessToken,nextToken);assert.equal(sockets.length,socketCount,'AFK renewal never reconnects');
 assert.equal(notices.length,beforeNotices,'AFK renewal does not produce departure/arrival notifications');
 assert.equal(context.rosterActive,!inWorld);assert(context.connected&&!context.entryActive);
}
nextToken='renewed-token-two';context.document.visibilityState='hidden';const beforeVisible=renewalCalls;visible();await settle();assert.equal(renewalCalls,beforeVisible);
context.document.visibilityState='visible';visible();await settle();assert.equal(renewals.at(-1).accessToken,nextToken,'returning to a background tab immediately refreshes its authority');
let completeRenewal;context.refreshSessionAccessToken=()=>{renewalCalls++;return new Promise(resolve=>{completeRenewal=resolve;});};
const beforePending=renewalCalls;renewalInterval.callback();visible();renewalInterval.callback();assert.equal(renewalCalls,beforePending+1,'timer and visibility events cannot overlap one pending refresh');
await connect();const replacement=sockets.at(-1);replacement.open();replacement.roster();assert.equal(intervals.size,2);assert.equal(visibilityListeners.size,1,'reconnect replaces rather than duplicates renewal listeners');
renewedSocket.events.close({code:1006});assert.equal(intervals.size,2);assert.equal(visibilityListeners.size,1,'late close cleans only the stale connection');
const beforeStale=renewals.length;completeRenewal('stale-connection-token');await settle();assert.equal(renewals.length,beforeStale,'async refresh result cannot send on a replaced socket');
renewalInterval.callback();await settle();assert.equal(renewalCalls,beforePending+1,'a stopped interval callback cannot restart old renewal work');
const currentInterval=[...intervals.values()][0];currentInterval.callback();assert.equal(renewalCalls,beforePending+2);
context.pauseConnection();assert.equal(intervals.size,0);assert.equal(visibilityListeners.size,0);completeRenewal('signed-out-token');await settle();assert.equal(renewals.length,beforeStale,'logout drops pending renewal results immediately');
context.entryActive=false;await connect();sockets.at(-1).open();sockets.at(-1).roster();sockets.at(-1).events.close({code:4001});
assert.equal(intervals.size,0);assert.equal(visibilityListeners.size,0);assert.equal(timers.length,0,'duplicate-tab stop cannot leave renewal or reconnect work behind');
context.getAccessToken=async()=>undefined;await connect();sockets.at(-1).open();sockets.at(-1).roster();
assert.equal(intervals.size,1);assert.equal(visibilityListeners.size,1,'guest sessions keep connection recovery without an identity renewal timer');context.pauseConnection();
console.log('PASS: proactive 60-second token renewal, same-socket changed tokens only, temporary-error recovery, visibility wakeup, no overlap, stale async results and complete reconnect/pause/close cleanup.');

// Connection watchdogs use the same close/retry path even when a transport never emits close.
let clockNow=100000,wallClockOffset=0;const diagnostics=[];
context.Date={now:()=>clockNow+wallClockOffset};context.performance={now:()=>clockNow};context.console={info:(...values)=>diagnostics.push(values)};
context.document.visibilityState='visible';
const watchdog=()=>[...intervals.values()].find(timer=>timer.ms===5000).callback();
const runTimer=async ms=>{const index=timers.findIndex(timer=>timer.ms===ms);assert(index>=0,`expected ${ms}ms timer`);timers.splice(index,1)[0]();await settle();};
const tokenProvider=async()=> 'recovery-test-token';
context.getAccessToken=tokenProvider;
context.showRealmUnavailable=()=>{context.realmAvailable=false;context.enteredCharacterId=undefined;context.player=undefined;context.rosterActive=true;};
context.entryActive=false;await connect();const opening=sockets.at(-1);
assert.equal(opening.readyState,0);clockNow+=20000;watchdog();
assert.equal(opening.readyState,3,'a CONNECTING socket is closed before retrying, without waiting for its close event');
assert.equal(opening.closeCode,4002);assert.equal(opening.closeReason,'Connection watchdog timeout','server diagnostics can identify client watchdog closes');
assert.equal(intervals.size,0);assert.equal(timers.length,1);assert(!element('roster-retry').hidden,'the disconnected roster exposes Retry');
opening.events.close({code:1006});assert.equal(timers.length,1,'a late close cannot schedule a second retry');
await runTimer(2500);const joining=sockets.at(-1);joining.open();
clockNow+=15000;joining.message({type:'pong',id:0});clockNow+=5000;watchdog();
assert.equal(joining.readyState,3,'incidental messages cannot extend the welcome deadline');
await runTimer(2500);const online=sockets.at(-1);online.open();online.welcome('recovery-hero');
const snapshot={...context.player,gold:321,inventory:{potion:4},hotbar:['arrow','mend']};
online.message({type:'welcome',id:snapshot.id,player:snapshot});
watchdog();assert.deepEqual(pings.at(-1),{type:'ping',id:0},'liveness probes work independently of the optional ping HUD');
for(const offset of [60000,-60000,0]){wallClockOffset=offset;watchdog();assert.equal(online.readyState,1,'system clock adjustments cannot expire a live socket');}
clockNow+=25000;watchdog();assert.equal(online.readyState,1,'a delayed visible-tab timer lets queued socket messages run before disconnecting');
watchdog();assert.equal(timers.filter(timer=>timer.ms===1000).length,1,'repeated checks cannot extend or duplicate the silence confirmation');
online.message({type:'pong',id:0});clockNow+=1000;await runTimer(1000);
assert.equal(online.readyState,1,'a queued response preserves the existing session after a long main-thread stall');
context.document.visibilityState='hidden';clockNow+=60000;watchdog();assert.equal(online.readyState,1,'background timer throttling alone does not retire a socket');
context.document.visibilityState='visible';visible();assert.equal(online.readyState,1,'resume gives queued responses a bounded grace period');
clockNow+=10000;online.message({type:'pong',id:0});clockNow+=10000;watchdog();assert.equal(online.readyState,1,'a replying connection survives resume');
clockNow+=10000;watchdog();assert.equal(online.readyState,1);clockNow+=1000;await runTimer(1000);
assert.equal(online.readyState,3,'an OPEN but silent connection closes after one bounded confirmation');assert.equal(online.closeCode,4002);
assert.equal(context.enteredCharacterId,'recovery-hero','ordinary outage UI cannot discard the character to resume');
await runTimer(2500);const recovered=sockets.at(-1);recovered.open();assert.equal(joins.at(-1).characterId,'recovery-hero');assert.equal(joins.at(-1).realmId,'eu');
opening.message({type:'welcome',id:'stale-hero',player:{}});online.message({type:'welcome',id:'stale-hero',player:{}});
assert.notEqual(context.playerId,'stale-hero','retired sockets cannot change character state before their replacement welcomes');
recovered.message({type:'welcome',id:snapshot.id,player:snapshot});assert.equal(context.player.gold,321);assert.equal(context.player.inventory.potion,4);assert.deepEqual([...context.player.hotbar],['arrow','mend']);
assert.equal(sockets.filter(socket=>socket.readyState!==3).length,1,'only the current transport remains open');
clockNow+=20000;watchdog();const staleConfirmation=timers.find(timer=>timer.ms===1000);assert(staleConfirmation);
context.pauseConnection();assert.equal(timers.length,0,'pause cancels a pending silence confirmation');
const beforeStaleConfirmation=diagnostics.length;staleConfirmation();assert.equal(diagnostics.length,beforeStaleConfirmation,'a queued stale confirmation cannot close a stopped session');

// A token request has a bounded result; a late result or superseded attempt cannot start a socket.
context.entryActive=false;let finishToken;context.getAccessToken=()=>new Promise(resolve=>{finishToken=resolve;});
const beforeToken=sockets.length,beforeTokenEntry=entryCount,pendingToken=connect();
await runTimer(20000);await pendingToken;assert.equal(entryCount,beforeTokenEntry+1);assert.equal(sockets.length,beforeToken);assert.equal(timers.length,0);
finishToken('late-token');await settle();assert.equal(sockets.length,beforeToken,'timed-out authority cannot open a socket');
context.entryActive=false;const replacedToken=connect();context.getAccessToken=tokenProvider;await connect();
finishToken('superseded-token');await replacedToken;assert.equal(sockets.length,beforeToken+1);assert.equal(timers.length,0);
context.pauseConnection();

// Recovery timers/listeners never revive explicit stops, including guest sessions.
for(const code of [4001,4403,4407,4408,4409,4410]){
 context.entryActive=false;context.getAccessToken=tokenProvider;await connect();const stopped=sockets.at(-1);stopped.open();stopped.roster();
 stopped.readyState=3;stopped.events.close({code,reason:'test terminal stop'});
 const count=sockets.length;clockNow+=60000;visible();await settle();
 assert.equal(sockets.length,count);assert.equal(timers.length,0);assert.equal(intervals.size,0);assert.equal(visibilityListeners.size,0,`terminal ${code} removes recovery work`);
}
context.entryActive=false;context.getAccessToken=async()=>undefined;await connect();const guest=sockets.at(-1);guest.open();guest.roster();
watchdog();assert.equal(pings.at(-1).id,0);clockNow+=20000;watchdog();clockNow+=1000;await runTimer(1000);assert.equal(guest.readyState,3,'an idle guest roster also recovers');context.pauseConnection();
assert(diagnostics.some(([,detail])=>detail.phase==='open'&&detail.reason==='open timed out'));
assert(diagnostics.some(([,detail])=>detail.phase==='welcome'&&detail.reason==='welcome timed out'));
assert(diagnostics.some(([,detail])=>detail.phase==='world'&&detail.code===4002));
assert(diagnostics.every(([,detail])=>detail.build==='/assets/game-test.js'&&detail.realm==='eu'));
assert(!JSON.stringify(diagnostics).includes('tokenProvider')&&!JSON.stringify(diagnostics).includes('recovery-test-token'),'diagnostics contain phases/builds/close reasons, never access tokens');
console.log('PASS: token/open/welcome deadlines, bounded silent world/guest recovery, monotonic watchdog clock, visible-stall queued replies, background resume grace, same-character rejoin, single socket/retry ownership, stale results, actionable retry, terminal stops and token-free diagnostics.');

// Runtime probes belong to one connection; delayed callbacks cannot cross sessions.
context.entryActive=false;context.getAccessToken=tokenProvider;await connect();
const checkedSocket=sockets.at(-1),check=clientChecks.at(-1),nonce='b6e026fe-d44c-4c56-8546-b51fca6f6842';
checkedSocket.open();checkedSocket.roster();
assert.equal(check.active(),false,'a roster cannot answer an active-world probe');
checkedSocket.message({type:'clientCheck',nonce});
assert.deepEqual(check.challenges,[nonce],'the current socket routes its server nonce to its own probe');
checkedSocket.welcome();assert.equal(check.active(),true);
context.worldLoading=true;assert.equal(check.active(),false,'instance loading suppresses runtime probes');context.worldLoading=false;
context.player.characterCreated=false;assert.equal(check.active(),false);context.player.characterCreated=true;
check.send({nonce,webdriver:false});
assert.deepEqual(clientCheckResponses,[{type:'clientCheck',nonce,webdriver:false}]);
await connect();const nextCheck=clientChecks.at(-1);sockets.at(-1).open();sockets.at(-1).roster();
assert(check.disposed>0,'reconnect disposes the previous connection probe');
assert.equal(check.active(),false);
checkedSocket.message({type:'clientCheck',nonce:'stale'});check.send({nonce,webdriver:true});
assert.deepEqual(check.challenges,[nonce],'retired sockets cannot route another challenge');
assert.equal(clientCheckResponses.length,1,'a delayed probe callback cannot send after socket replacement');
context.pauseConnection();assert(nextCheck.disposed>0,'pause disposes the active connection probe');
nextCheck.send({nonce,webdriver:true});assert.equal(clientCheckResponses.length,1,'pause blocks delayed probe responses');
context.entryActive=false;await connect();sockets.at(-1).open();sockets.at(-1).roster();
const closedCheck=clientChecks.at(-1);sockets.at(-1).events.close({code:4001});
assert(closedCheck.disposed>0,'terminal close disposes its connection probe');
closedCheck.send({nonce,webdriver:true});assert.equal(clientCheckResponses.length,1,'a stopped OPEN transport cannot send a delayed probe');
console.log('PASS: runtime challenge routing, active-world/loading eligibility, per-connection ownership, stale response rejection and reconnect/pause/close disposal.');

// The rendered projectile and rig must face the same confirmed target, even before a move heartbeat.
const rendered = [], starts = [], poses = new Map();
const combatContext = { worldDungeonKind:null, combatTiming, SPELLS, performance: { now: () => 1000 }, Date: { now: () => 5000 }, serverOffset: 100, Math, playerId: 'hero-a', rotation: 0, updateAudioScene: noop, gameAudio: { play: noop, spell: noop, reset: noop, setScene: noop },
  player: undefined, players: [], connected: false, position: { x: 0, z: 0 },
  monsterEffects: { clear: noop }, damageNumbers: { clear: noop }, combatAnimations: poses, combatEffects: { play: (event, start) => { rendered.push(event); starts.push(start); }, clear() { rendered.length = 0; } } };
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function clearCombat('), main.indexOf('function act('))), combatContext);
combatContext.playCombat({ playerId: 'hero-a', ability: 'strike', from: { x: 0, z: 0 }, rotation: 0, targets: [{ id: 'foe', x: 3, z: 0 }] });
assert.equal(rendered[0].rotation, Math.PI / 2);
assert.equal(combatContext.combatPose('hero-a', 1200).rotation, rendered[0].rotation);
assert.equal(combatContext.combatPose('hero-a', 1700), false, 'finished attacks restore the normal rig pose');
combatContext.playCombat({ playerId: 'hero-a', ability: 'fireball', startedAt: 4800, from: { x: 0, z: 0 }, rotation: 0, targets: [{ id: 'foe', x: 0, z: 5 }] });
assert.equal(starts.at(-1), .7, 'delayed cast events resume at server age instead of restarting the projectile');
assert.equal(poses.get('hero-a').started, 700, 'rig and projectile share the same cast clock');
combatContext.playCombat({ playerId: 'hero-a', ability: 'cleave', from: { x: 0, z: 0 }, rotation: .2, targets: [{ id: 'foe', x: 3, z: 1 }] });
assert.equal(rendered.at(-1).rotation, .2, 'cleave visuals preserve the accepted frontal cone');
assert.equal(combatContext.combatPose('hero-a', 1200).rotation, .2);
combatContext.clearCombat();
assert.equal(poses.size, 0); assert.equal(rendered.length, 0);
console.log('PASS: confirmed combat facing, timed rig restoration, and lifecycle cleanup.');

// EU can serve the new client while another realm still has a saved Atlas location.
const previousShowEntry=context.showEntry, retiredEntries=[];
context.showEntry=(message,retry)=>{retiredEntries.push({message,retry});context.pauseConnection();};
try {
 for(const type of ['welcome','snapshot','correction']){
  context.entryActive=false;await connect();const connection=sockets.at(-1);connection.open();connection.roster();
  if(type!=='welcome')connection.welcome();
  const before=transitions.length,position=context.position.clone();
  connection.message({type,id:'retired-atlas',zone:'greenwood',instanceId:'atlas:lanternreach',x:77.5,z:52.5,
   player:{id:'retired-atlas',instanceId:'atlas:lanternreach',x:77.5,z:52.5}});
  assert.equal(transitions.length,before,`${type}: retired Atlas cannot begin a dungeon/world load`);
  assert(context.position.equals(position),`${type}: unsupported coordinates cannot move the avatar`);
  assert.equal(connection.readyState,3,'the old realm connection is closed through existing recovery');
  assert.equal(context.player,undefined);assert.equal(context.entryActive,true);
  assert.equal(retiredEntries.at(-1).retry,true);assert.match(retiredEntries.at(-1).message,/realm is still updating.*Reconnect/);
  connection.welcome('late-retired-world');assert.equal(context.player,undefined,'queued old-realm messages cannot bypass recovery');
 }
} finally {context.showEntry=previousShowEntry;}
console.log('PASS: stale-realm Atlas welcome/snapshot/correction recover before world construction or position changes.');
