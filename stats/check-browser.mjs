import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Run after build:stats. Exercise the shipped dashboard without contacting live realms.
const root = fileURLToPath(new URL('../', import.meta.url)), output = '/tmp/mossvale-stats-gaps';
const session = `stats-browser-${process.pid}`, run = promisify(execFile), now = Date.parse('2026-09-24T12:00:00Z');
const at = hours => new Date(now - hours * 3600000).toISOString();
let mode = 'healthy';
function fixture(range) {
  const partial = mode === 'partial', stale = mode === 'stale', window = range === 'all' ? '30d' : range;
  const concurrent = Array.from({ length: range === '24h' ? 25 : 169 }, (_, i) => ({ at: at((range === '24h' ? 24 : 168) - i),
    players: i === 60 || i === 61 ? null : i === 62 ? 0 : 22 + (i * 7) % 30,
    complete: i !== 60 && i !== 61 && (range === '24h' || i % 6 !== 0 && i !== 62) }));
  const hourly = concurrent.map((point, i) => ({ hour: point.at, activePlayers: point.players === null ? null : 41 + (i * 11) % 49,
    averagePlayers: point.players, peakPlayers: point.players === null ? null : 67, complete: point.complete && i < concurrent.length - 1 }));
  return {
    generatedAt: at(0), trackingSince: at(24 * 35), range, sampleIntervalSeconds: 30, concurrentIntervalSeconds: 3600,
    live: { players: partial ? null : 42, observedPlayers: 30, realms: [{ id: 'eu', players: 18, available: true }, { id: 'us', players: 12, available: true }, { id: 'asia', players: 12, available: !partial }] },
    peaks: { day: 67, allTime: 123 }, registered: { total: 12482, status: stale ? 'stale' : 'ok', updatedAt: at(2) },
    auction: { totalWei: '141656000000000000000000', decimals: 18, status: stale ? 'stale' : 'ok', updatedAt: at(2) },
    treasury: { totalPaidWei: '82411000000000000000000', balanceWei: '91045000000000000000000', decimals: 18, status: stale ? 'stale' : 'ok', updatedAt: at(2) },
    economy: { status: 'ok', windows: { 1: { created: '143921' }, 7: { created: '1045342' }, 30: { created: '3942167' } } },
    // Current game servers omit coverage metadata and null partial chart hours, but retain their measured hourly averages.
    concurrent: range === '7d' ? concurrent.map(({ at, players, complete }) => ({ at, players: complete ? players : null })) : concurrent,
    hourly,
    countries: { window, since: at(window === '24h' ? 24 : window === '7d' ? 168 : 720), until: at(0), trackingSince: at(840), total: 200, known: 185, unknown: 15, rows: [{ country: 'US', players: 110 }, { country: 'SE', players: 75 }, { country: null, players: 15 }] },
  };
}
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/stats') { res.writeHead(mode === 'offline' ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(fixture(url.searchParams.get('range') || '24h'))); return; }
  const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^[\w.-]+$/.test(path)) { res.writeHead(404); res.end(); return; }
  try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf' })[extname(path)] || 'application/octet-stream'); res.end(readFileSync(join(root, 'stats-dist', path))); }
  catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = async (...args) => (await run('npx', ['--yes', 'agent-browser', '--session', session, ...args], { cwd: root, timeout: 60000, maxBuffer: 2_000_000 })).stdout;
const evaluate = async code => JSON.parse(await browser('eval', `(async()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${code}})()`));
const refresh = async (state, condition) => { mode = state; await browser('click', '#refresh'); await browser('wait', '--fn', condition); };
const healthy = `document.querySelector('#online').textContent==='42' && document.querySelector('#notice').hidden && !document.querySelector('#refresh').disabled`;
try {
  mkdirSync(output, { recursive: true });
  for (const [name, width, columns] of [['desktop', 1440, 6], ['tablet', 900, 3], ['mobile', 390, 2], ['compact', 320, 2]]) {
    await browser('set', 'viewport', String(width), '1000'); await browser('open', `http://127.0.0.1:${server.address().port}`); await browser('wait', '--fn', healthy); await browser('snapshot', '-i');
    await evaluate(`await document.fonts.ready;check(document.documentElement.scrollWidth<=innerWidth+1,'no horizontal page overflow at '+innerWidth);const metrics=document.querySelector('.metrics');check(getComputedStyle(metrics).gridTemplateColumns.split(' ').length===${columns},'metric columns at '+innerWidth);check([...metrics.querySelectorAll('p')].every(p=>!p.getClientRects().length),'healthy metrics have no filler notes');check(!document.querySelector('details.definitions').open,'data definitions start collapsed');check(document.querySelector('.chart-section').compareDocumentPosition(document.querySelector('#gold-title').closest('section'))&Node.DOCUMENT_POSITION_FOLLOWING,'player chart precedes gold');return true;`);
    await browser('screenshot', join(output, `${name}.png`), '--full');
    await browser('click', '[data-range="7d"]'); await browser('wait', '--fn', `document.querySelector('#concurrent-chart title').textContent.includes(', 7d.') && !document.querySelector('#refresh').disabled`);
    await evaluate(`check(!document.querySelector('#concurrent-partial').hidden,'partial coverage legend');check(document.querySelector('#concurrent-chart .chart-line.partial'),'partial averages remain plotted');check(document.querySelector('#concurrent-chart .chart-line:not(.partial)'),'complete averages stay solid');check(document.querySelectorAll('#concurrent-chart .chart-fill').length===2,'hours with no readings still break the plot');check(!document.querySelector('#concurrent-chart').innerHTML.includes('NaN'),'chart coordinates stay finite');return true;`);
    await browser('screenshot', join(output, `${name}-7d.png`), '--full');
    assert.equal((await browser('errors')).trim(), '', `no browser exceptions at ${width}px`);
  }
  await evaluate(`document.querySelector('#chart-time').focus();return true;`); await browser('press', 'Home'); await browser('press', 'ArrowRight');
  await evaluate(`const slider=document.querySelector('#chart-time');check(slider.value==='1','keyboard selects chart sample');check(slider.getAttribute('aria-valuetext')===document.querySelector('#concurrent-readout').textContent,'slider exposes selected reading');document.querySelector('details.definitions summary').focus();return true;`);
  await browser('press', 'Enter'); await evaluate(`check(document.querySelector('details.definitions').open,'keyboard opens definitions');return true;`); await browser('press', 'Enter'); await evaluate(`check(!document.querySelector('details.definitions').open,'keyboard closes definitions');return true;`);
  for (const range of ['7d', '30d', 'all', '24h']) {
    await browser('click', `[data-range="${range}"]`); await browser('wait', '--fn', `document.querySelector('#concurrent-chart title').textContent.includes(', ${range}.') && !document.querySelector('#refresh').disabled`);
    await evaluate(`check(document.querySelector('[data-range="${range}"]').getAttribute('aria-pressed')==='true','active range');check(document.querySelector('#country-summary').textContent.includes('${range === '24h' ? '24 hours' : range === '7d' ? '7 days' : '30 days'}'),'countries follow range and all-time limit');return true;`);
    if (range !== '24h') await evaluate(`const slider=document.querySelector('#chart-time'),select=index=>{slider.value=String(index);slider.dispatchEvent(new Event('input',{bubbles:true}));return slider.getAttribute('aria-valuetext')};check(select(54).includes('Partial coverage'),'partial sample is labelled for keyboard and pointer inspection');check(select(60).includes('No reading')&&!document.querySelector('#chart-cursor circle'),'missing sample has no invented value');check(select(62).includes('0 average players online')&&document.querySelector('#chart-cursor .partial'),'measured zero is retained with partial coverage');return true;`);
    else await evaluate(`check(document.querySelector('#concurrent-partial').hidden&&!document.querySelector('#concurrent-chart .chart-line.partial'),'24-hour complete readings need no partial legend');return true;`);
  }
  await evaluate(`window.csvFiles=[];window.csvNames=[];const make=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;URL.createObjectURL=blob=>{blob.text().then(text=>csvFiles.push(text));return make(blob)};HTMLAnchorElement.prototype.click=function(){csvNames.push(this.download);return click.call(this)};return true;`);
  await browser('click', '#download'); await browser('click', '#country-download'); await browser('wait', '--fn', 'window.csvFiles.length===2');
  await evaluate(`check(csvNames.includes('mossvale-hourly-24h.csv')&&csvNames.includes('mossvale-countries-24h.csv'),'CSV filenames');check(csvFiles.some(text=>text.startsWith('Hour (UTC),Active players')&&text.includes('Partial')),'hourly CSV contains coverage');check(csvFiles.some(text=>text.startsWith('Country code,Country')&&text.includes('"SE","Sweden","75","37.5"')),'country CSV contains exact accounts and share');return true;`);
  await refresh('stale', `!document.querySelector('#registered-note').hidden && !document.querySelector('#refresh').disabled`);
  await evaluate(`for(const id of ['registered','moss','vouchers','vault']){const note=document.querySelector('#'+id+'-note');check(note.getClientRects().length&&note.textContent.includes('10:00'),'stale '+id+' timestamp remains visible')}check(document.documentElement.scrollWidth<=innerWidth+1,'stale timestamps do not overflow compact viewport');return true;`);
  await refresh('healthy', healthy); await evaluate(`check([...document.querySelectorAll('.metrics p')].every(p=>!p.getClientRects().length),'healthy refresh clears stale notes');return true;`);
  await refresh('partial', `!document.querySelector('#notice').hidden && document.querySelector('#online').textContent==='—' && !document.querySelector('#refresh').disabled`);
  await evaluate(`check(document.querySelector('#online-note').getClientRects().length,'partial count note visible');check(document.querySelector('#realms').textContent.includes('Unavailable'),'missing realm remains labelled');return true;`);
  await refresh('offline', `document.querySelector('#status').textContent==='Connection unavailable' && !document.querySelector('#refresh').disabled`);
  await evaluate(`const notice=document.querySelector('#notice');check(!notice.hidden&&notice.textContent.includes('Showing')&&notice.textContent.includes('2026-09-24 12:00'),'failed refresh labels retained data and timestamp');check([...document.querySelectorAll('#realms strong')].every(node=>node.textContent==='—'),'failed live counts are cleared');return true;`);
  await refresh('healthy', healthy); await evaluate(`check([...document.querySelectorAll('.metrics p')].every(p=>!p.getClientRects().length),'recovery clears exception notes');check(!document.querySelector('#realms').textContent.includes('Unavailable'),'recovery restores realm state');return true;`);
  assert.equal((await browser('errors')).trim(), '', 'no browser exceptions after interactions');
  console.log(`PASS: stats at 1440/900/390/320px, partial and missing chart readings, measured zero, keyboard controls, ranges, CSVs, stale/partial/offline recovery. Screenshots: ${output}`);
} finally { await browser('close').catch(() => {}); await new Promise(resolve => server.close(resolve)); }
