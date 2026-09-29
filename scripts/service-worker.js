// The account hostname may retain a game worker from before its dedicated route.
// Retire it immediately so root sign-in callbacks cannot receive a cached game.
if (self.location.hostname === 'account.mossvale.world') {
  self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
  self.addEventListener('activate', event => event.waitUntil((async () => {
    await self.clients.claim();
    for (const key of await caches.keys()) if (key.startsWith('mossvale-shell-')) await caches.delete(key);
    await self.registration.unregister();
  })()));
} else {
// Immutable, complete fallback for returning players while a realm restarts.
const CACHE = 'mossvale-shell-__BUILD__';
const HASHES = __FILES__;
const FILES = Object.keys(HASHES);
const CONFIG = '/api/config';
const META = '/__mossvale_shell__';
const cacheInfo = async cache => await (await cache.match(META))?.json().catch(() => null) || {};

function validHosting(value) {
  if (!Object.hasOwn(value, 'realmId') && !Object.hasOwn(value, 'realms')) return true;
  const names = { eu: 'Europe', us: 'North America', asia: 'Asia' };
  if (!Object.hasOwn(names, value.realmId) || !Array.isArray(value.realms) || ![2, 3].includes(value.realms.length)
    || value.realms.some(realm => !realm || !Object.hasOwn(names, realm.id)) || new Set(value.realms.map(realm => realm.id)).size !== value.realms.length) return false;
  const origins = value.realms.map(realm => realm.origin).filter(Boolean);
  if (new Set(origins).size !== origins.length) return false;
  return Object.keys(names).every(id => {
    const realm = value.realms.find(realm => realm?.id === id);
    if (!realm && id === 'asia' && value.realmId !== 'asia' && value.realms.length === 2) return true;
    if (!realm || Object.keys(realm).some(key => !['id', 'name', 'origin'].includes(key)) || realm.name !== names[id]) return false;
    if (id === value.realmId) return realm.origin === '';
    if (realm.origin === null) return true;
    if (typeof realm.origin !== 'string' || !/^https?:\/\/[^/?#\s]+\/?$/i.test(realm.origin)) return false;
    const url = new URL(realm.origin);
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
      && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  });
}

async function valid(response, path) {
  if (!response.ok || response.redirected) return false;
  const type = response.headers.get('Content-Type') || '';
  if (path === CONFIG) {
    if (!type.includes('application/json')) return false;
    try {
      const value = await response.clone().json(), realm = value.keycloak, wallet = value.walletBroker, mobile = value.mobilePurchases, social = value.socialProviders, turnkey = value.turnkey,
        push = value.mobilePush, appUpdate = value.mobileAppUpdate;
      const realmValid = realm === null || realm && Object.keys(realm).every(key => ['url', 'realm', 'clientId'].includes(key)) && ['url', 'realm', 'clientId'].every(key => typeof realm[key] === 'string' && realm[key].trim());
      const walletValid = wallet === undefined || realm && wallet && Object.keys(wallet).every(key => ['enabled', 'provider', 'chainId'].includes(key)) && wallet.enabled === true && typeof wallet.provider === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(wallet.provider) && Number.isSafeInteger(wallet.chainId) && wallet.chainId > 0;
      const mobileValid = mobile === undefined || mobile && typeof mobile === 'object' && !Array.isArray(mobile) && Object.keys(mobile).length === 2 && ['apple', 'google'].every(key => typeof mobile[key] === 'boolean');
      const pushValid = push === undefined || push && typeof push === 'object' && !Array.isArray(push)
        && Object.keys(push).length === 1 && typeof push.enabled === 'boolean';
      const numericVersion = value => typeof value === 'string' && /^\d{1,10}(?:\.\d{1,10}){0,2}$/.test(value);
      const appUpdateValid = appUpdate === undefined || appUpdate === null || appUpdate && typeof appUpdate === 'object' && !Array.isArray(appUpdate)
        && Object.entries(appUpdate).every(([platform, minimum]) => ['apple', 'google'].includes(platform)
          && minimum && typeof minimum === 'object' && !Array.isArray(minimum) && numericVersion(minimum.minVersion)
          && Object.keys(minimum).every(key => ['minVersion', 'minBuild'].includes(key))
          && (minimum.minBuild === undefined || numericVersion(minimum.minBuild)));
      const socialValid = social === undefined || realm && social && typeof social === 'object' && !Array.isArray(social) && Object.entries(social).every(([key, alias]) => ['apple', 'google'].includes(key) && alias === key);
      const turnkeyValid = turnkey === undefined || turnkey && typeof turnkey === 'object' && !Array.isArray(turnkey)
        && Object.keys(turnkey).every(key => ['organizationId', 'authProxyConfigId', 'gasFunding', 'arenaContract', 'collections'].includes(key))
        && ['organizationId', 'authProxyConfigId'].every(key => typeof turnkey[key] === 'string' && turnkey[key].length === 36 && /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(turnkey[key]))
        && (turnkey.arenaContract === undefined || typeof turnkey.arenaContract === 'string' && turnkey.arenaContract.length === 42 && /^0x[\da-f]{40}$/i.test(turnkey.arenaContract) && !/^0x0{40}$/i.test(turnkey.arenaContract))
        && typeof turnkey.gasFunding === 'boolean' && turnkey.collections && typeof turnkey.collections === 'object' && !Array.isArray(turnkey.collections)
        && Object.entries(turnkey.collections).every(([key, address]) => ['petsContract', 'legacyPetsContract', 'housesContract'].includes(key)
          && typeof address === 'string' && address.length === 42 && /^0x[\da-f]{40}$/i.test(address) && !/^0x0{40}$/i.test(address));
      return Object.keys(value).every(key => ['keycloak', 'walletBroker', 'realmId', 'realms', 'mobilePurchases', 'socialProviders', 'turnkey', 'mobilePush', 'mobileAppUpdate'].includes(key)) && realmValid && walletValid && mobileValid && pushValid && appUpdateValid && socialValid && turnkeyValid && validHosting(value);
    } catch { return false; }
  }
  if (path === '/') return type.includes('text/html') && (await response.clone().text()).includes('<title>Mossvale');
  if (path.endsWith('.glb')) return type.includes('model/gltf-binary');
  if (path.endsWith('.js')) return /(?:application|text)\/javascript/.test(type);
  if (path.endsWith('.css')) return type.includes('text/css');
  if (path.endsWith('.json')) return type.includes('application/json');
  return type.startsWith('image/');
}

async function matchesBuild(response, path) {
  if (!await valid(response, path)) return false;
  if (!Object.hasOwn(HASHES, path)) return true;
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') === HASHES[path];
}

async function download(path, signal) {
  for (let attempt = 0; ; attempt++) {
    const fresh = path === CONFIG || attempt > 0;
    let retryable = true;
    try {
      // This deadline also covers streamed bodies, not only response headers.
      // Reuse startup downloads only after checking their bytes and MIME type.
      // A fresh retry replaces stale HTTP-cache bytes or metadata; config is always fresh.
      const response = await fetch(path, { cache: fresh ? 'reload' : 'force-cache', signal: AbortSignal.any([signal, AbortSignal.timeout(path.endsWith('.glb') ? 120000 : 30000)]) });
      if (!response.ok) {
        retryable = !fresh || response.status === 408 || response.status === 429 || response.status >= 500;
        throw new Error('Incomplete game update');
      }
      if (!await matchesBuild(response, path)) { retryable = !fresh; throw new Error('Incomplete game update'); }
      return response;
    } catch (error) {
      if (signal.aborted || !retryable || attempt >= 1) throw error;
    }
  }
}

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE), abort = new AbortController();
  const previous = await Promise.all((await caches.keys()).filter(key => key.startsWith('mossvale-shell-') && key !== CACHE).reverse().map(key => caches.open(key)));
  // A failed attempt can be resumed, but must never become the active predecessor.
  await cache.put(META, new Response(JSON.stringify({ complete: false })));
  const pending = [...FILES, CONFIG];
  const downloads = Array.from({ length: 4 }, async () => {
    while (pending.length) {
      const path = pending.shift();
      let response, savedHere = false;
      // Recheck bytes from this attempt as well as legacy/previous caches.
      if (path !== CONFIG) for (const old of [cache, ...previous]) {
        try {
          const saved = await old.match(path);
          if (saved && await matchesBuild(saved, path)) { response = saved; savedHere = old === cache; break; }
          if (saved && old === cache) await cache.delete(path);
        } catch { if (old === cache) await cache.delete(path); }
      }
      if (!response) response = await download(path, abort.signal);
      abort.signal.throwIfAborted();
      if (!savedHere) await cache.put(path, response);
    }
  });
  try { await Promise.all(downloads); }
  catch (error) {
    abort.abort();
    await Promise.allSettled(downloads);
    // Only verified completed responses were saved. Keep them for the next check.
    throw error;
  }
  await cache.put(META, new Response(JSON.stringify({ complete: true })));
  // Public sign-in and realm settings can change independently of the build.
  // Older workers reject added config fields and keep returning their old fallback.
  // Refresh that one fallback only after the new build is complete; its HTML and
  // assets remain untouched until normal activation, without replacing live tabs.
  const config = await cache.match(CONFIG);
  for (const key of await caches.keys()) if (key.startsWith('mossvale-shell-') && key !== CACHE) {
    try {
      const previous = await caches.open(key);
      const installed = await previous.match(CONFIG);
      if (installed) {
        const oldConfig = await installed.json(), nextConfig = await config.clone().json();
        // The old EU/US client rejects a third realm, even from its own fallback.
        if (oldConfig.realms?.length === 2 && nextConfig.realms?.length === 3 && nextConfig.realmId !== 'asia') {
          nextConfig.realms = nextConfig.realms.filter(realm => realm.id !== 'asia');
          await previous.put(CONFIG, new Response(JSON.stringify(nextConfig), { headers: config.headers }));
        } else await previous.put(CONFIG, config.clone());
      }
    } catch { /* A cache quota failure must not prevent the complete new build. */ }
  }
})()));

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE' && Object.keys(event.data).length === 1) event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => event.waitUntil((async () => {
  const shells = await Promise.all((await caches.keys()).filter(key => key.startsWith('mossvale-shell-') && key !== CACHE).map(async key => {
    const info = await cacheInfo(await caches.open(key));
    return { key, complete: info.complete !== false, generation: Number.isSafeInteger(info.generation) && info.generation > 0 ? info.generation : 0 };
  }));
  // Cache creation order cannot distinguish the active build from a skipped waiting update.
  // Unmarked legacy builds use the oldest cache as a best-effort predecessor.
  shells.sort((a, b) => b.generation - a.generation);
  const previous = shells.find(shell => shell.complete)?.key || null;
  await (await caches.open(CACHE)).put(META, new Response(JSON.stringify({ generation: (shells[0]?.generation || 0) + 1, previous })));
  // ponytail: one predecessor covers handoff until update-aware tabs reload on controller change.
  // A successor may already be installing or waiting while this activation runs.
  if (!self.registration.installing && !self.registration.waiting) for (const { key } of shells) if (key !== previous) await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization')) return;
  const path = request.mode === 'navigate' && url.pathname === '/' ? '/' : url.pathname;
  const previousAsset = !FILES.includes(path) && !url.search && /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(path);
  if (path !== CONFIG && !FILES.includes(path) && !previousAsset) return;
  // Auth callback parameters stay in the browser URL, never in cache keys or stored HTML.
  if (url.search && request.mode !== 'navigate') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), installed = await cache.match(path);
    // Serve one complete installed build; updates download only during installation.
    // Identity/realm settings must still refresh independently of game releases.
    if (path !== CONFIG && installed) return installed;
    if (previousAsset) {
      const { previous } = await cacheInfo(cache);
      if (typeof previous === 'string' && previous.startsWith('mossvale-shell-') && previous !== CACHE && (await caches.keys()).includes(previous)) {
        const retained = await (await caches.open(previous)).match(path);
        if (retained) return retained;
      }
    }
    let response;
    try {
      response = await fetch(path === '/' ? '/' : request, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (await matchesBuild(response, path)) {
        // Headers arrive before the body; catch a timed-out stream before handing it to the game.
        await response.clone().arrayBuffer();
        return response;
      }
    } catch { response = undefined; /* Fall back to the installed public build, never account or game data. */ }
    if (installed) return installed;
    if (response?.ok) response = undefined;
    return response || new Response('The realm is updating. Please retry shortly.', { status: 503 });
  })());
});

}
