import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chartGeometry, concurrentReadings, csvFor, countriesCsvFor, countryName, mossAmount, number, utc } from './client.js';
import worker from './worker.mjs';

assert.equal(number(null), '—'); assert.equal(number(0), '0');
assert.equal(utc('2026-09-18T10:23:45Z'), '2026-09-18 10:23');
assert.deepEqual(mossAmount('141656000000000000000000'), { display: '141.66K', exact: '141,656 MOSS' });
assert.equal(mossAmount('1234567891234567891').exact, '1.234567891234567891 MOSS');
assert.equal(mossAmount('-1').display, '—');
assert.equal(mossAmount(null).display, '—');
assert.equal(countryName('CN'), 'China'); assert.equal(countryName(null), 'Unknown');
assert.match(countriesCsvFor({ rows: [{ country: 'CN', players: 2 }, { country: null, players: 1 }], total: 3, window: '7d', since: '2026-09-21', until: '2026-09-22' }), /"CN","China","2","66.7"/);
const g = chartGeometry([{ value: null }, { value: 0 }, { value: 13 }], 1100, 300, 1000, 2000);
assert.equal(g.ceiling, 16); assert.equal(g.x(1000), g.left); assert.equal(g.y(0), g.bottom);
assert.equal(csvFor([{ hour: '2026-09-18T01:00:00Z', activePlayers: 0, averagePlayers: null, peakPlayers: 0, complete: false }]).split('\r\n')[1], '2026-09-18 01:00,0,,0,Partial');
const historyAt = hour => `2026-09-18T0${hour}:00:00.000Z`;
const legacy = { range: '7d', concurrentIntervalSeconds: 3600,
  hourly: [12, 0, null, 99].map((averagePlayers, index) => ({ hour: historyAt(index), averagePlayers, complete: false })),
  concurrent: [null, null, null, 7, null].map((players, index) => ({ at: historyAt(index), players, ...(index === 3 ? { complete: false } : {}) })) };
const recovered = concurrentReadings(legacy);
assert.deepEqual(recovered.slice(0, 2), [{ at: historyAt(0), players: 12, complete: false }, { at: historyAt(1), players: 0, complete: false }], 'Legacy hourly charts recover measured partial averages, including zero.');
assert.equal(recovered[2], legacy.concurrent[2], 'Missing measurements remain null.');
assert.equal(recovered[3], legacy.concurrent[3], 'Modern points remain authoritative, including complete:false.');
assert.equal(recovered[4], legacy.concurrent[4], 'A missing matching hour is not invented.');
assert.equal(legacy.concurrent[0].players, null, 'Compatibility rendering does not mutate API history.');
assert.equal(concurrentReadings({ ...legacy, range: '24h' }), legacy.concurrent, 'Minute charts never substitute hourly averages.');
assert.equal(concurrentReadings({ ...legacy, range: 'all', concurrentIntervalSeconds: 7200 }), legacy.concurrent, 'Coarse legacy buckets cannot infer sample weights.');

const release = JSON.parse(await readFile(new URL('../stats-dist/release.json', import.meta.url)));
assert.match(release.revision, /^[a-f0-9]{40}$/);
for (const asset of release.assets) assert.equal(createHash('sha256').update(await readFile(new URL(`../stats-dist${asset.path}`, import.meta.url))).digest('hex'), asset.sha256);
const html = await readFile(new URL('../stats-dist/index.html', import.meta.url), 'utf8');
assert(html.includes(release.revision)); assert(html.includes('THESIS:'));
for (const id of ['online', 'registered', 'moss', 'vouchers', 'vault', 'concurrent-chart', 'hourly-chart', 'history', 'chart-time', 'country-history', 'country-summary', 'country-download']) assert(html.includes(`id="${id}"`));

const originalFetch = globalThis.fetch;
const payload = { generatedAt: new Date().toISOString(), live: { players: 0 }, hourly: [], concurrent: [] };
const background = [], ctx = { waitUntil: promise => background.push(promise) };
try {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    if (!url.includes('.mossvale.world/') && !url.startsWith('https://mossvale.world/')) throw Error('RPC unavailable in proxy check');
    calls.push(url);
    assert.equal(options.redirect, 'manual', 'Workers support manual redirect rejection, not redirect:error');
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Cookie, undefined);
    return url.startsWith('https://mossvale.world/') ? new Response('', { status: 503 }) : Response.json(payload);
  };
  const response = await worker.fetch(new Request('https://stats.mossvale.world/api/stats?range=7d&origin=https://evil.example', { headers: { Cookie: 'private', Authorization: 'private' } }), {}, ctx);
  const { treasury, ...stats } = await response.json();
  assert.deepEqual(stats, payload);
  assert.equal(treasury.status, 'unavailable', 'Treasury outage must not hide player statistics');
  assert.equal(treasury.balanceWei, null);
  assert.deepEqual(calls, ['https://mossvale.world/api/stats?range=7d', 'https://us.mossvale.world/api/stats?range=7d']);
  assert.equal((await worker.fetch(new Request('https://stats.mossvale.world/api/stats?range=no'), {})).status, 400);
  assert.equal((await worker.fetch(new Request('https://stats.mossvale.world/api/private'), {})).status, 404);
  assert.equal((await worker.fetch(new Request('https://stats.mossvale.world/api/stats', { method: 'POST' }), {})).status, 405);
  const tasks = background.length;
  assert.equal(await (await worker.fetch(new Request('https://stats.mossvale.world/api/stats', { method: 'HEAD' }), {}, ctx)).text(), '');
  assert.equal(background.length, tasks + 1, 'HEAD keeps the shared treasury snapshot alive for concurrent GETs');
  globalThis.fetch = async () => { throw Error('offline'); };
  const unavailable = await worker.fetch(new Request('https://stats.mossvale.world/api/stats'), {}, ctx);
  assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.equal(await (await worker.fetch(new Request('https://stats.mossvale.world/'), { ASSETS: { fetch: () => new Response('asset') } })).text(), 'asset');
  await Promise.all(background);
} finally { globalThis.fetch = originalFetch; }
console.log('Stats page, exact MOSS formatting, chart geometry, CSV and public Worker failover checks passed.');
await import('./check-treasury.mjs');
