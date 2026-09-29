import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { WebSocket, WebSocketServer } from 'ws';

// Runs only disposable local containers and a synthetic origin; never the live Compose project.
const root = resolve(import.meta.dirname, '..'), directory = await mkdtemp(join(tmpdir(), 'mossvale-restart-proxy-'));
const tunnel = process.argv.includes('--tunnel');
const name = `mossvale-restart-check-${process.pid}`, docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let status = 200, stallHeaders = false, forwarded, websocketHeaders;
const origin = createServer(async (request, response) => {
  if (stallHeaders && request.url === '/') return;
  let body = ''; for await (const part of request) body += part;
  forwarded = { url: request.url, method: request.method, headers: request.headers, body };
  response.writeHead(status, { 'Content-Type': request.url.startsWith('/api/') ? 'application/json' : 'text/html', 'X-Origin': 'untouched',
    'Cache-Control': 'no-store', 'Set-Cookie': 'session=synthetic; Secure; HttpOnly; SameSite=Lax', ...(status === 302 ? { Location: 'https://mossvale.world/?code=synthetic' } : {}) });
  response.end(request.url.startsWith('/api/') ? '{"ok":false,"available":false}' : status === 200 ? '<!doctype html><div id="app">Healthy Mossvale</div>' : `origin-${status}`);
});
const sockets = new WebSocketServer({ noServer: true });
origin.on('upgrade', (request, socket, head) => {
  websocketHeaders = request.headers;
  sockets.handleUpgrade(request, socket, head, client => client.on('message', data => client.send(data)));
});
await new Promise(resolve => origin.listen(0, '0.0.0.0', resolve));
const originPort = origin.address().port;
try {
  const config = await readFile(join(root, tunnel ? 'cloudflare/Caddyfile' : 'deploy/ovh/Caddyfile'), 'utf8');
  if (!tunnel) {
    const compose = await readFile(join(root, 'deploy/ovh/compose.yml'), 'utf8');
    assert(compose.includes('../../public/realm-restarting.html:/srv/mossvale/realm-restarting.html:ro'));
  }
  await writeFile(join(directory, 'Caddyfile'), config.replaceAll(tunnel ? '192.168.0.148:80' : 'game:2567', `host.docker.internal:${originPort}`)
    .replaceAll(':8087', ':8080').replaceAll('bind 127.0.0.1', 'bind 0.0.0.0'));
  const page = await readFile(join(root, 'public/realm-restarting.html'), 'utf8');
  await writeFile(join(directory, 'realm-restarting.html'), page);
  docker('run', '--detach', '--name', name, '--publish', '127.0.0.1::8080', '--add-host', 'host.docker.internal:host-gateway', '--env', 'US_HOST=:8080', '--env', `STATS_COUNTRY_SECRET=${'f'.repeat(64)}`,
    '--mount', `type=bind,src=${join(directory, 'Caddyfile')},dst=/etc/caddy/Caddyfile,readonly`,
    '--mount', `type=bind,src=${join(directory, 'realm-restarting.html')},dst=/srv/mossvale/realm-restarting.html,readonly`, 'caddy:2-alpine');
  const port = Number(docker('port', name, '8080/tcp').split(':').at(-1)), base = `http://127.0.0.1:${port}`;
  const headers = tunnel ? { Host: 'mossvale.world', 'X-Forwarded-Proto': 'https' } : {};
  const request = (path = '/', options = {}) => new Promise((resolve, reject) => {
    // Node fetch rewrites Host and some browser headers; exercise their exact wire values.
    const call = httpRequest(base + path, { method: options.method, headers: { Accept: 'text/html', ...headers, ...options.headers }, signal: options.signal ?? AbortSignal.timeout(5000) }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject);
      response.on('end', () => resolve(new Response(options.method === 'HEAD' ? null : Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
    });
    call.on('error', reject); call.end(options.body);
  });
  let started = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await request()).status === 200) { started = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(started, 'Caddy proxy starts and preserves healthy origin');
  const healthy = await request(); assert.equal(healthy.headers.get('x-origin'), 'untouched'); assert.match(await healthy.text(), /Healthy Mossvale/);
  await request('/api/health', { headers: { 'CF-IPCountry': 'SE', 'X-Mossvale-Country': 'CN', 'X-Mossvale-Country-Token': 'forged', 'X-Mossvale-Client-IP': '8.8.8.8' } });
  if (tunnel) {
    assert.equal(forwarded.headers['x-mossvale-country'], 'SE');
    assert.equal(forwarded.headers['x-mossvale-country-token'], 'f'.repeat(64), 'The edge replaces visitor authentication headers.');
  } else {
    assert.notEqual(forwarded.headers['x-mossvale-client-ip'], '8.8.8.8', 'Caddy overwrites visitor IP claims with its socket peer.');
    assert(forwarded.headers['x-mossvale-client-ip']);
  }
  if (tunnel) {
    const upstreamHost = '00edc49e-6028-442d-9417-673a2251a662.bba.tools';
    assert.equal(forwarded.headers.host, upstreamHost);
    const authPath = '/realms/mossvale/protocol/openid-connect/auth?client_id=mossvale-browser&redirect_uri=https%3A%2F%2Faccount.mossvale.world%2F';
    const auth = await request(authPath, { headers: { Host: 'auth.mossvale.world', 'X-Forwarded-Host': 'spoofed.invalid', 'X-Forwarded-Port': '80' } });
    assert.equal(auth.status, 200); assert.equal(forwarded.url, authPath);
    for (const [key, value] of Object.entries({ host: '347997b7-50dd-490b-aa22-a2627e0732e8.bba.tools', 'x-forwarded-host': 'auth.mossvale.world', 'x-forwarded-proto': 'https', 'x-forwarded-port': '443' })) assert.equal(forwarded.headers[key], value);
    const authHttp = await request(authPath, { headers: { Host: 'auth.mossvale.world', 'X-Forwarded-Proto': 'http' } });
    assert.equal(authHttp.status, 308); assert.equal(authHttp.headers.get('location'), 'https://auth.mossvale.world' + authPath);
    for (const path of ['/', '/index.html']) {
      const account = await request(path + '?code=synthetic%2Fcode&state=synthetic-state', { headers: { Host: 'account.mossvale.world' } });
      assert.equal(account.status, 200);
      assert.equal(forwarded.url, '/account.html?code=synthetic%2Fcode&state=synthetic-state');
      assert.equal(forwarded.headers.host, upstreamHost);
    }
    const accountHttp = await request('/?state=synthetic', { headers: { Host: 'account.mossvale.world', 'X-Forwarded-Proto': 'http' } });
    assert.equal(accountHttp.status, 308); assert.equal(accountHttp.headers.get('location'), 'https://account.mossvale.world/?state=synthetic');
    const accountApi = await request('/api/account/deletion', { headers: { Host: 'account.mossvale.world', Origin: 'https://account.mossvale.world', Authorization: 'Bearer synthetic' } });
    assert.equal(accountApi.status, 200); assert.equal(forwarded.url, '/api/account/deletion');
    assert.equal(forwarded.headers.origin, 'https://account.mossvale.world');
    for (const [host, scheme] of [['mossvale.world', 'http'], ['www.mossvale.world', 'http'], ['www.mossvale.world', 'https']]) {
      const response = await request('/play/%2Froom?next=%2Fworld&x=1', { headers: { Host: host, 'X-Forwarded-Proto': scheme } });
      assert.equal(response.status, 308, `${host} ${scheme} redirects`); assert.equal(response.headers.get('location'), 'https://mossvale.world/play/%2Froom?next=%2Fworld&x=1');
    }
    const proof = '{"proof":"synthetic"}', requestHeaders = { Authorization: 'Bearer synthetic', Cookie: 'session=synthetic', Origin: 'https://mossvale.world', 'Content-Type': 'application/json' };
    const post = await request('/wallet-oidc/verify?x=%2F', { method: 'POST', body: proof, headers: requestHeaders });
    assert.equal(post.status, 200); assert.equal(post.headers.get('cache-control'), 'no-store'); assert.match(post.headers.get('set-cookie'), /session=synthetic; Secure; HttpOnly; SameSite=Lax/);
    assert.equal(forwarded.url, '/wallet-oidc/verify?x=%2F'); assert.equal(forwarded.method, 'POST'); assert.equal(forwarded.body, proof);
    for (const [name, value] of Object.entries({ ...requestHeaders, Host: upstreamHost, 'X-Forwarded-Proto': 'https' })) assert.equal(forwarded.headers[name.toLowerCase()], value);
    status = 302; const redirect = await request(); assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('location'), 'https://mossvale.world/?code=synthetic'); status = 200;
    await new Promise((resolve, reject) => {
      const client = new WebSocket(base.replace('http:', 'ws:') + '/socket?realm=1', { headers: { ...headers, Cookie: 'session=synthetic', Origin: 'https://mossvale.world' }, handshakeTimeout: 5000 });
      let echoed = false;
      const deadline = setTimeout(() => { client.terminate(); reject(Error('WebSocket echo timed out')); }, 5000);
      client.once('error', reject); client.once('open', () => client.send('synthetic-echo'));
      client.once('message', data => { try { assert.equal(data.toString(), 'synthetic-echo'); echoed = true; client.close(); } catch (error) { client.terminate(); reject(error); } });
      client.once('close', () => { clearTimeout(deadline); echoed ? resolve() : reject(Error('WebSocket closed before echo')); });
    });
    for (const [name, value] of Object.entries({ host: upstreamHost, origin: 'https://mossvale.world', cookie: 'session=synthetic', upgrade: 'websocket' })) assert.equal(websocketHeaders[name], value);
  }
  for (status of [500, 502, 503, 504, 599]) {
    for (const path of ['/', '/index.html', '/?code=private-callback&state=callback-state']) {
      const response = await request(path);
      assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('retry-after'), '5'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      if (tunnel) assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('content-type'), /text\/html/); assert.equal(await response.text(), page);
    }
    const head = await request('/index.html', { method: 'HEAD' }); assert.equal(head.status, 503); assert.equal(await head.text(), '');
    for (const path of ['/api/health', '/api/config', '/api/roster', '/socket', '/assets/game.js', '/wallet-login.html']) {
      const response = await request(path); assert.equal(response.status, status); assert.equal(response.headers.get('x-origin'), 'untouched'); assert(!(await response.text()).includes('data-realm-restarting'));
    }
    for (const options of [{ method: 'POST' }, { headers: { Accept: 'application/json' } }, { headers: { Accept: 'text/html', Authorization: 'Bearer synthetic-test' } }]) {
      const response = await request('/', options); assert.equal(response.status, status); assert.equal(await response.text(), `origin-${status}`);
    }
  }
  status = 404; const missing = await request(); assert.equal(missing.status, 404); assert.equal(await missing.text(), 'origin-404');
  if (tunnel) {
    status = 503;
    for (const path of ['/%69ndex.html', '/INDEX.html', '//', '/index.html/']) assert.equal(await (await request(path)).text(), 'origin-503', 'only exact raw entry paths receive fallback');
    for (const headers of [{ Accept: 'text/htmlish' }, { Accept: '' }, { Authorization: '' }, { Upgrade: '' }]) assert.equal(await (await request('/', { headers })).text(), 'origin-503', 'non-HTML and even empty auth/upgrade headers bypass fallback');
    for (const headers of [{ Accept: 'TEXT/HTML' }, { Accept: '', 'Sec-Fetch-Mode': 'navigate' }]) assert.equal(await (await request('/', { headers })).text(), page);
  }
  origin.closeAllConnections(); await new Promise(resolve => origin.close(resolve));
  const disconnected = await request(); assert.equal(disconnected.status, 503); assert.equal(await disconnected.text(), page);
  const apiDisconnected = await request('/api/health?code=private-callback'); assert.equal(apiDisconnected.status, 502); assert(!(await apiDisconnected.text()).includes('data-realm-restarting'));
  if (tunnel) {
    const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' }), output = logs.stdout + logs.stderr;
    assert(!output.includes('private-callback'), 'failed callback URLs never enter proxy logs');
  }
  status = 200; await new Promise(resolve => origin.listen(originPort, '0.0.0.0', resolve));
  const recovered = await request(); assert.equal(recovered.status, 200); assert.match(await recovered.text(), /Healthy Mossvale/);
  stallHeaders = true;
  const startedAt = Date.now(), stalled = await request('/', { signal: AbortSignal.timeout(10000) });
  assert.equal(stalled.status, 503); assert.equal(await stalled.text(), page);
  assert(Date.now() - startedAt >= 4500 && Date.now() - startedAt < 9500, 'stalled navigation reaches fallback after the five-second header timeout');
  const liveApi = await request('/api/health'); assert.equal(liveApi.status, 200); assert.equal(liveApi.headers.get('x-origin'), 'untouched');
  console.log(`PASS ${tunnel ? 'Tunnel' : 'US'} restart proxy: healthy/recovered documents unchanged, 5xx/connection failures/stalled navigation render shared503 page, five-second entry-only timeout, HEAD and callback URLs preserved, API/socket/assets/non-HTML requests never receive fallback.${tunnel ? ' Canonical game/account/auth redirects, auth proxy headers/query, BBA Host, POST/cookies/Origin/no-store and WebSocket echo verified.' : ''}`);
} catch (error) {
  const logs = spawnSync('docker', ['logs', '--tail', '15', name], { encoding: 'utf8' }); console.error(logs.stdout + logs.stderr);
  throw error;
} finally {
  origin.closeAllConnections(); await new Promise(resolve => origin.close(resolve));
  sockets.close();
  try { docker('rm', '--force', name); } catch {}
  await rm(directory, { recursive: true, force: true });
}
