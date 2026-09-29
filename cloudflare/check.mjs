import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';

// Wrangler imports .html as a Text module; exercise that same file in Node.
const hook = registerHooks({ load(url, context, next) {
  if (url === new URL('../public/realm-restarting.html', import.meta.url).href) {
    return { format: 'module', source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))};`, shortCircuit: true };
  }
  return next(url, context);
} });
const { default: worker } = await import('./worker.mjs');
hook.deregister();
const restartingPage = readFileSync(new URL('../public/realm-restarting.html', import.meta.url), 'utf8');

const originalFetch = globalThis.fetch;
let forwarded, options, response = new Response('upstream');
globalThis.fetch = async (request, init) => { forwarded = request; options = init; return response; };
try {
  for (const origin of ['http://mossvale.world', 'http://www.mossvale.world', 'https://www.mossvale.world']) {
    const redirect = await worker.fetch(new Request(`${origin}/play/%2Froom?next=%2Fworld&x=1`));
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), 'https://mossvale.world/play/%2Froom?next=%2Fworld&x=1');
  }
  const post = new Request('https://mossvale.world/wallet-oidc/verify?x=%2F', {
    method: 'POST', body: '{"proof":"test"}',
    headers: { Host: 'mossvale.world', Origin: 'https://mossvale.world', 'Content-Type': 'application/json', Authorization: 'Bearer test' },
  });
  assert.equal(await worker.fetch(post), response);
  assert.equal(forwarded.url, 'https://00edc49e-6028-442d-9417-673a2251a662.bba.tools/wallet-oidc/verify?x=%2F');
  assert.equal(forwarded.method, 'POST');
  assert.equal(await forwarded.text(), '{"proof":"test"}');
  assert.equal(forwarded.headers.get('host'), '00edc49e-6028-442d-9417-673a2251a662.bba.tools');
  for (const header of ['origin', 'content-type', 'authorization']) assert.equal(forwarded.headers.get(header), post.headers.get(header));
  assert.equal(options.redirect, 'manual');

  response = { status: 101, webSocket: {} };
  assert.equal(await worker.fetch(new Request('https://mossvale.world/socket?realm=1', {
    headers: { Upgrade: 'websocket', Origin: 'https://mossvale.world' },
  })), response);
  assert.equal(forwarded.url, 'https://00edc49e-6028-442d-9417-673a2251a662.bba.tools/socket?realm=1');
  assert.equal(forwarded.headers.get('upgrade'), 'websocket');
  assert.equal(forwarded.headers.get('origin'), 'https://mossvale.world');
  assert.equal(options.redirect, 'manual');
  const visit = (path = '/', extra = {}) => new Request(`https://mossvale.world${path}`, { headers: { Accept: 'text/html' }, ...extra });
  for (const status of [200, 302, 401, 403, 404, 429]) {
    response = new Response('upstream document', { status });
    assert.equal(await worker.fetch(visit()), response, `HTML status ${status} remains authoritative`);
  }
  for (const path of ['/', '/index.html', '/?code=private-code&state=private-state']) {
    for (const status of [500, 502, 503, 504, 530]) {
      response = new Response('Unavailable', { status });
      const fallback = await worker.fetch(visit(path));
      assert.equal(fallback.status, 503); assert.equal(fallback.headers.get('cache-control'), 'no-store');
      assert.equal(fallback.headers.get('retry-after'), '5'); assert.match(fallback.headers.get('content-type'), /text\/html/);
      assert.equal(fallback.headers.get('referrer-policy'), 'no-referrer');
      const html = await fallback.text(); assert.equal(html, restartingPage, 'cold visits receive the bundled recovery page without an origin asset request');
      assert(!html.includes('private-code') && !html.includes('private-state'), 'OAuth callback values never enter the response body');
    }
  }
  response = new Response('Unavailable', { status: 503 });
  const head = await worker.fetch(visit('/index.html', { method: 'HEAD' }));
  assert.equal(head.status, 503); assert.equal(await head.text(), ''); assert.match(head.headers.get('content-type'), /text\/html/);
  const bypasses = [
    new Request('https://mossvale.world/'), visit('/', { headers: { Accept: 'application/json' } }),
    visit('/', { headers: { Accept: 'text/html', Authorization: 'Bearer test' } }),
    visit('/', { headers: { Accept: 'text/html', Upgrade: 'websocket' } }),
    visit('/api/health'), visit('/api/config'), visit('/api/roster'), visit('/wallet-oidc/authorize'),
    visit('/assets/game-12345678.js'), visit('/models/colosseum.glb'), visit('/socket'),
    visit('/wallet-oidc/verify', { method: 'POST', body: 'proof' }), visit('/', { method: 'POST', body: 'proof' }),
  ];
  for (const request of bypasses) {
    response = new Response('Unavailable', { status: 503 });
    assert.equal(await worker.fetch(request), response, `${request.method} ${new URL(request.url).pathname} never receives HTML fallback`);
  }
  globalThis.fetch = async () => { throw Error('Origin offline'); };
  assert.equal(await (await worker.fetch(visit())).text(), restartingPage, 'origin network failures still deliver a cold-visit recovery page');
  assert.equal(await (await worker.fetch(visit('/', { method: 'HEAD' }))).text(), '');
  await assert.rejects(worker.fetch(visit('/api/health')), /Origin offline/, 'health failures cannot claim availability');
  globalThis.fetch = async (request, init) => {
    assert.equal(init.redirect, 'manual'); assert(init.signal instanceof AbortSignal, 'navigation requests have a deadline');
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  };
  const started = performance.now(), keepAlive = setTimeout(() => {}, 6000);
  try {
    assert.equal(await (await worker.fetch(visit())).text(), restartingPage, 'a hung origin also resolves to the recovery page');
    assert(performance.now() - started < 6000, 'navigation fallback is bounded to five seconds');
  } finally { clearTimeout(keepAlive); }
  console.log('PASS edge: redirects, exact POST/auth/API/assets/WebSocket passthrough, cold-visit 5xx/network recovery page, no-store/HEAD semantics, and callback confidentiality.');
} finally {
  globalThis.fetch = originalFetch;
}

// The same inline script runs at either edge, with no game assets or cached worker.
assert(!/<(?:script|img|link)\b[^>]*(?:src|href)\s*=/i.test(restartingPage), 'the outage page has no external asset dependency');
assert(!/url\(\s*['"]?https?:/i.test(restartingPage));
const recoveryScript = restartingPage.match(/<script>([\s\S]*?)<\/script>/)?.[1]; assert(recoveryScript);
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
function recoveryFixture() {
  const timers = new Map(), requests = [], handlers = new Map(), status = { textContent: '' }, retry = { disabled: false, addEventListener: (type, fn) => handlers.set(type, fn) };
  let timerId = 0, reloads = 0, network = async () => new Response('{}', { status: 503 });
  const location = { href: 'https://mossvale.world/?code=private-code&state=private-state#callback', reload() { reloads++; } };
  runInNewContext(recoveryScript, {
    document: { getElementById: id => id === 'restart-status' ? status : id === 'restart-retry' ? retry : assert.fail(`unexpected element ${id}`) },
    location, AbortSignal: { timeout: ms => { assert.equal(ms, 5000); return new AbortController().signal; } },
    fetch: async (path, init) => { assert(['/', '/api/health'].includes(path)); assert.equal(init.cache, 'no-store'); assert(init.signal instanceof AbortSignal); requests.push(path); return network(path); },
    setTimeout: (fn, ms) => { assert.equal(ms, 5000); timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  return { timers, requests, retry, status, location, get reloads() { return reloads; }, setNetwork(fn) { network = fn; }, click: () => handlers.get('click')(), poll: () => { const [id, fn] = timers.entries().next().value; timers.delete(id); return fn(); } };
}
const readyHealth = () => new Response(JSON.stringify({ ok: true, available: true }));
for (const network of [
  async () => { throw Error('offline'); },
  async () => new Response('Unavailable', { status: 503 }),
  async () => new Response('not JSON'),
  async () => new Response(JSON.stringify({ ok: true, available: false })),
  async () => new Response(JSON.stringify({ ok: false, available: true })),
  async () => new Response(JSON.stringify({ ok: true, available: 'true' })),
  async path => path === '/api/health' ? readyHealth() : new Response('Unavailable', { status: 503 }),
  async path => path === '/api/health' ? readyHealth() : new Response(restartingPage),
  async path => path === '/api/health' ? readyHealth() : new Response('<h1>Proxy error</h1>'),
]) {
  const fixture = recoveryFixture(); assert.equal(fixture.requests.length, 0, 'first visit allows the outage page to render before checking');
  fixture.setNetwork(network); await fixture.poll();
  assert.equal(fixture.reloads, 0, 'unavailable, malformed, or incomplete recovery never reloads');
  assert.equal(fixture.retry.disabled, false); assert.equal(fixture.timers.size, 1, 'exactly one retry remains scheduled');
}
{
  const fixture = recoveryFixture(); let release;
  fixture.setNetwork(() => new Promise(resolve => { release = resolve; }));
  const pending = fixture.poll(); await flush();
  assert.equal(fixture.retry.disabled, true); fixture.click(); fixture.click(); await flush();
  assert.equal(fixture.requests.length, 1, 'manual retries never overlap an in-flight check');
  release(new Response('{}', { status: 503 })); await pending;
  assert.equal(fixture.timers.size, 1); assert.equal(fixture.retry.disabled, false);
  fixture.setNetwork(path => path === '/api/health' ? readyHealth() : new Response('<!doctype html><title>Mossvale</title><div id="app"></div>'));
  await fixture.click(); assert.deepEqual(fixture.requests, ['/api/health', '/api/health', '/']);
  assert.equal(fixture.reloads, 1, 'healthy realm and real game HTML resume the original visit');
  assert.equal(fixture.location.href, 'https://mossvale.world/?code=private-code&state=private-state#callback', 'auth callback URL remains in place for reload');
  assert.equal(fixture.timers.size, 0, 'manual recovery cancels the scheduled retry');
  await fixture.click(); assert.equal(fixture.reloads, 1, 'recovery can reload only once');
}
console.log('PASS restart page: no origin assets, bounded polling, health and real-HTML recovery, failed/malformed responses, one in-flight check, manual retry, and unchanged callback URL.');
