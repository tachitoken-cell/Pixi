import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createWalletOidc } from '../src/wallet-oidc.mjs';
import { authCallback } from '../mobile/navigation.ts';

const html = readFileSync(new URL('../public/mobile-auth/callback.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const state = 'synthetic-wallet-state-1234567890';
const valid = `https://mossvale.world/mobile-auth/callback#${new URLSearchParams({code: 'synthetic-one-use-code', state, iss: 'https://auth.mossvale.world/realms/mossvale'})}`;
async function mount(href, results = [true], transport) {
  const nodes = new Map(['return', 'retry', 'status', 'help'].map(id => [id, {hidden: true, textContent: '', href: ''}]));
  const requests = [], history = [], pending = [];
  runInNewContext(script, {URL, URLSearchParams, AbortSignal, location: {href}, document: {getElementById: id => nodes.get(id)},
    history: {state: null, replaceState: (...args) => history.push(args)},
    fetch: (url, init) => { requests.push([url, init]); const response = results.shift(); const request = transport ? transport(url, init) : response instanceof Error ? Promise.reject(response) : Promise.resolve({ok: response}); pending.push(request); return request; },
  });
  const flush = async () => { await Promise.allSettled(pending); for (let i = 0; i < 5; i++) await Promise.resolve(); };
  await flush();
  return {nodes, requests, history, flush};
}
for (const host of ['mossvale.world', 'us.mossvale.world', 'asia.mossvale.world']) {
  const page = await mount(valid.replace('https://mossvale.world', `https://${host}`));
  assert.equal(page.requests.length, 1);
  const [endpoint, init] = page.requests[0];
  assert.equal(endpoint, 'https://mossvale.world/wallet-oidc/mobile/complete');
  assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store'); assert.equal(init.keepalive, true);
  assert.equal(JSON.parse(init.body).callback, valid);
  assert.equal(page.nodes.get('return').hidden, false);
  const target = new URL(page.nodes.get('return').href);
  assert.notEqual(target.host, host); assert.equal(target.pathname, '/mobile-auth/callback'); assert.equal(target.hash, new URL(valid).hash);
  assert.match(page.nodes.get('status').textContent, /approved sign-in/);
  assert.equal(page.history[0][2], `https://${host}/mobile-auth/callback`, 'successful handoff removes the response from wallet browser history');
}
for (const host of ['mossvale.world','us.mossvale.world','asia.mossvale.world']) {
  const page=await mount(`https://${host}/mobile-auth/callback#walletAction=${'a'.repeat(64)}`);
  assert.equal(page.requests.length,0,'wallet wake-up link has no authority to return a result');
  assert.equal(page.nodes.get('return').hidden,false);assert.notEqual(new URL(page.nodes.get('return').href).host,host);
  assert.match(page.nodes.get('status').textContent,/wallet action is finished/);
}
const failed = await mount(valid, [false, true]);
assert.equal(failed.nodes.get('return').hidden, true, 'do not tell users to switch apps before the fallback response is saved');
assert.equal(failed.history.length, 0, 'failed handoff preserves the response for retry');
assert.equal(failed.nodes.get('retry').hidden, false);
failed.nodes.get('retry').onclick(); await failed.flush();
assert.equal(failed.requests.length, 2); assert.equal(failed.nodes.get('return').hidden, false);
const denied = await mount(valid.replace('code=synthetic-one-use-code', 'error=access_denied') + '&error_description=private&error_uri=https%3A%2F%2Fevil.invalid');
assert.match(denied.nodes.get('status').textContent, /cancelled/);
assert(!denied.requests[0][1].body.includes('private')); assert(!denied.requests[0][1].body.includes('evil'));
for (const invalid of [
  valid.replace('https:', 'http:'), valid.replace('mossvale.world/', 'mossvale.world.evil.invalid/'), valid.replace('mossvale.world/', 'asia.mossvale.world.evil.invalid/'), valid.replace('mossvale.world/', 'asia.mossvale.world:8443/'),
  valid.replace('mossvale.world/', 'user@mossvale.world/'), valid.replace('/callback#', '/other#'), valid.replace('/callback#', '/callback?unexpected=1#'),
  valid + '&state=duplicate', valid + '&access_token=secret', valid + '&error=access_denied', valid.replace(state, 'short'),
  valid.replace('auth.mossvale.world', 'evil.invalid'), valid.replace(/&iss=.*/, ''), valid.replace('#', '#unknown=value&'), valid.split('#')[0],
]) {
  const page = await mount(invalid); assert.equal(page.requests.length, 0, invalid); assert.equal(page.nodes.get('return').hidden, true);
}
assert(!html.includes('target="_blank"'), 'wallet browsers intercept new windows instead of dispatching Universal Links');
assert.match(html, /name="referrer" content="no-referrer"/);

// Run the actual return page against the broker, then validate the response as the native app does.
const keycloak = {url: 'https://auth.mossvale.world', realm: 'mossvale'};
const privateJwk = {...generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey.export({format: 'jwk'}), kid: 'isolated-return-check'};
const broker = createWalletOidc({keycloak, env: {WALLET_OIDC_ENABLED: 'true', APP_ORIGIN: 'https://mossvale.world', WALLET_OIDC_CHAIN_ID: '46630', WALLET_OIDC_CLIENT_ID: 'isolated-return', WALLET_OIDC_CLIENT_SECRET: randomBytes(32).toString('base64url'), WALLET_OIDC_PRIVATE_JWK: JSON.stringify(privateJwk), WALLET_OIDC_REDIRECT_URI: `${keycloak.url}/realms/mossvale/broker/mossvale-wallet/endpoint`}});
const server = createServer((req, res) => { void broker.handle(req, res); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/wallet-oidc/mobile/`;
const post = (path, body) => fetch(endpoint + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
try {
  for (const host of ['mossvale.world', 'us.mossvale.world', 'asia.mossvale.world']) {
    const state = randomBytes(32).toString('base64url');
    const callback = valid.replace('synthetic-wallet-state-1234567890', state);
    const registration = await post('start', {state}); assert.equal(registration.status, 200);
    const {token} = await registration.json();
    const page = await mount(callback.replace('https://mossvale.world', `https://${host}`), [], (url, init) => {
      assert.equal(url, 'https://mossvale.world/wallet-oidc/mobile/complete');
      return fetch(endpoint + 'complete', {...init, headers: {...init.headers, Origin: `https://${host}`}});
    });
    assert.equal(page.nodes.get('return').hidden, false);
    const response = await post('result', {state, token}); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.callback, callback);
    const request = {url: 'https://auth.mossvale.world/realms/mossvale/protocol/openid-connect/auth?redirect_uri=https%3A%2F%2Fmossvale.world%2Fmobile-auth%2Fcallback', state, issuer: `${keycloak.url}/realms/mossvale`, resumeUrl: `https://${host}/`, expiresAt: Date.now() + 60000};
    const resume = new URL(authCallback(request, result.callback));
    assert.equal(resume.origin, `https://${host}`); assert.equal(resume.hash, new URL(callback).hash);
  }
} finally { broker.close(); await new Promise(resolve => server.close(resolve)); }
console.log('PASS mobile HTTPS return: code-only validation, exact hosts/path/issuer, secret-free copy, completion before manual return, same-window cross-host app link, retry and cancellation.');
