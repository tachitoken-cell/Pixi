import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server.mjs';
import { createAuctionChain } from '../src/auction-chain.mjs';
import { createStoreChain } from '../src/store-chain.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 'mossvale-account-http-'));
const noRpc = () => { throw Error('Static account checks must not call a chain.'); };
// Authentication is enabled but unavailable: public documents must still load without a session.
const game = createGameServer({ port: 0, host: '127.0.0.1', dataDir,
  keycloak: { url: 'https://auth.fixture.invalid', realm: 'mossvale', clientId: 'mossvale-browser' }, databaseUrl: '', walletOidc: { env: {} },
  auctionChain: createAuctionChain({ contract: '', authorityKey: '', rpc: noRpc }),
  mossAuctionChain: createAuctionChain({ currency: 'moss', contract: '', authorityKey: '', rpc: noRpc }),
  storeChain: createStoreChain({ contract: '', authorityKey: '', legacyContract: '', rpc: noRpc }) });
try {
  const base = `http://127.0.0.1:${await game.start()}`;
  for (const [page, title] of [['account', 'Your account'], ['support', 'Support'], ['privacy', 'Privacy'], ['auth-callback', 'Signing in to Mossvale'], ['silent-check-sso', 'Mossvale sign-in']]) {
    const response = await fetch(`${base}/${page}.html?code=synthetic-callback`, { redirect: 'manual' });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('location'), null, 'Public documents cannot redirect to sign-in.');
    assert.equal(response.headers.get('cache-control'), ['account', 'auth-callback', 'silent-check-sso'].includes(page) ? 'no-store' : 'no-cache');
    if (['account', 'auth-callback', 'silent-check-sso'].includes(page)) assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const html = await response.text();
    assert.match(html, new RegExp(`<title>.*${title}`, 'i'), 'Run npm run build before testing the actual account documents.');
    if (page === 'privacy') {
      assert.match(html, /<h1>Mossvale privacy notice<\/h1>/);
      assert.match(html, /support@mossvale\.world/);
      assert.doesNotMatch(html, /<script\b|http-equiv=["']refresh/i, 'The privacy notice must be readable without JavaScript or authentication.');
    }
  }
  const missing = await fetch(`${base}/missing-privacy-check.html`, { redirect: 'manual' });
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal(await missing.text(), 'Page not found.', 'Missing documents must not fall back to the game login.');
  const callback = await fetch(`${base}/mobile-auth/callback`, { redirect: 'manual' });
  assert.equal(callback.status, 200); assert.match(callback.headers.get('content-type'), /text\/html/);
  assert.equal(callback.headers.get('cache-control'), 'no-store'); assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await callback.text(), /<title>Return to Mossvale<\/title>/);
  const apple = await fetch(`${base}/.well-known/apple-app-site-association`, {redirect: 'manual'});
  assert.equal(apple.status, 200); assert.match(apple.headers.get('content-type'), /application\/json/);
  assert.deepEqual((await apple.json()).applinks.details, [{appID: 'FR8KLTJ5HP.world.mossvale.game', paths: ['/mobile-auth/callback']}]);
  const android = await fetch(`${base}/.well-known/assetlinks.json`, {redirect: 'manual'});
  assert.equal(android.status, 200); assert.match(android.headers.get('content-type'), /application\/json/);
  const association = (await android.json())[0]; assert.equal(association.target.package_name, 'world.mossvale.game');
  assert.deepEqual(association.target.sha256_cert_fingerprints, ['E8:46:1A:4E:E5:F9:77:B4:D5:32:CC:15:3D:43:EA:2A:E6:88:B5:79:AC:8A:1C:FE:11:E6:70:72:4A:5A:6A:AB']);
  assert.equal((await fetch(`${base}/.well-known/missing-association`)).status, 404);
  assert.equal((await fetch(`${base}/api/roster`)).status, 401, 'Public documents must not make account data public.');
  assert.equal((await fetch(`${base}/account.html`, { method: 'HEAD' })).headers.get('cache-control'), 'no-store');
  console.log('PASS unauthenticated account/support/privacy documents with authentication enabled, static privacy content, no login redirects, missing-page 404, protected roster, cache and referrer headers.');
} finally { await game.stop(); await rm(dataDir, { recursive: true, force: true }); }
