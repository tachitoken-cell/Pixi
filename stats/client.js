const count = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
export const number = value => typeof value === 'number' && Number.isFinite(value) ? count.format(value) : '—';
export const utc = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16).replace('T', ' ') : '—';
};
export function mossAmount(wei, decimals = 18) {
  if (!/^\d+$/.test(String(wei)) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return { display: '—', exact: 'Unavailable' };
  const amount = BigInt(wei), unit = 10n ** BigInt(decimals), whole = amount / unit;
  const fraction = decimals ? (amount % unit).toString().padStart(decimals, '0').replace(/0+$/, '') : '';
  return { display: whole >= 10000n ? compact.format(whole) : `${count.format(whole)}${fraction ? `.${fraction.slice(0, 2).padEnd(2, '0')}` : ''}`, exact: `${count.format(whole)}${fraction ? `.${fraction}` : ''} MOSS` };
}
export function csvFor(rows) {
  return ['Hour (UTC),Active players,Average online,Peak online,Coverage', ...rows.map(row => [utc(row.hour), ...['activePlayers', 'averagePlayers', 'peakPlayers'].map(key => typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : ''), row.complete ? 'Complete' : 'Partial'].join(','))].join('\r\n');
}
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
export const countryName = code => typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? countryNames.of(code) : 'Unknown';
export function countriesCsvFor(countries) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return ['Country code,Country,Active accounts,Share (%),Window,From (UTC),Until (UTC)', ...(countries?.rows || []).map(row =>
    [row.country || '', countryName(row.country), row.players, countries.total ? (row.players / countries.total * 100).toFixed(1) : '', countries.window, utc(countries.since), utc(countries.until)].map(quote).join(','))].join('\r\n');
}
export function chartGeometry(points, width, height, start, end) {
  const left = 42, right = width - 16, top = 16, bottom = height - 30;
  const max = points.reduce((max, point) => Number.isFinite(point.value) ? Math.max(max, point.value) : max, 1);
  const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
  const x = time => left + (time - start) / Math.max(1, end - start) * (right - left);
  const y = value => bottom - value / ceiling * (bottom - top);
  return { left, right, top, bottom, ceiling, x, y };
}
export function concurrentReadings(data) {
  const readings = data.concurrent || [];
  if (data.range === '24h' || data.concurrentIntervalSeconds !== 3600) return readings;
  const hours = new Map((data.hourly || []).map(row => [Date.parse(row.hour), row]));
  return readings.map(point => {
    if ('complete' in point) return point;
    const hour = hours.get(Date.parse(point.at));
    return Number.isFinite(hour?.averagePlayers) ? { ...point, players: hour.averagePlayers, complete: hour.complete } : point;
  });
}

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const names = { eu: 'Europe', us: 'North America', asia: 'Asia' };
  let data, range = '24h', rowsShown = 12, requestId = 0, controller;
  let chartPoints = [], chartPosition, inspectedAt = null;
  const text = (id, value) => { $(id).textContent = value; };
  const note = (id, value) => { text(id, value); $(id).hidden = !value; };
  function period(points) {
    const end = Date.parse(data.generatedAt) || Date.now();
    const duration = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[range];
    return [duration ? end - duration : Math.min(end - 3600000, Date.parse(data.trackingSince) || points[0]?.time || end), end];
  }
  function axis(g, start, end) {
    let html = '';
    for (let i = 0; i <= 4; i++) {
      const value = g.ceiling * i / 4, y = g.y(value);
      html += `<line class="chart-grid" x1="${g.left}" x2="${g.right}" y1="${y}" y2="${y}"/><text class="chart-axis" x="${g.left - 10}" y="${y + 4}" text-anchor="end">${number(value)}</text>`;
    }
    for (let i = 0; i <= 4; i++) {
      const at = start + (end - start) * i / 4;
      const label = range === '24h' ? utc(at).slice(11) : utc(at).slice(5, 10);
      html += `<text class="chart-axis" x="${g.x(at)}" y="${g.bottom + 23}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${label}</text>`;
    }
    return html;
  }
  function drawConcurrent() {
    chartPoints = concurrentReadings(data).map(point => ({ time: Date.parse(point.at), value: point.players, partial: point.complete === false })).filter(point => Number.isFinite(point.time));
    const [start, end] = period(chartPoints), width = Math.max(240, Math.round($('concurrent-chart').clientWidth)), height = width < 600 ? 210 : 300;
    $('concurrent-chart').setAttribute('viewBox', `0 0 ${width} ${height}`);
    const g = chartGeometry(chartPoints, width, height, start, end);
    chartPosition = g;
    let markup = `<title id="concurrent-chart-title">Concurrent players, ${range}. Use the time slider below or the hourly history table for values.</title>${axis(g, start, end)}`;
    let segment = [];
    const drawSegment = () => {
      if (!segment.length) return;
      const coordinates = segment.map(point => `${g.x(point.time)},${g.y(point.value)}`);
      markup += `<path class="chart-fill" d="M${g.x(segment[0].time)},${g.bottom} L${coordinates.join(' L')} L${g.x(segment.at(-1).time)},${g.bottom} Z"/>`;
      const lines = ['', ''];
      let previous;
      for (let i = 1; i < segment.length; i++) {
        const partial = Number(segment[i - 1].partial || segment[i].partial);
        if (partial !== previous) lines[partial] += `M${coordinates[i - 1]} `;
        lines[partial] += `L${coordinates[i]} `;
        previous = partial;
      }
      lines.forEach((line, partial) => { if (line) markup += `<path class="chart-line${partial ? ' partial' : ''}" d="${line}"/>`; });
      if (segment.length === 1) markup += `<circle class="chart-dot${segment[0].partial ? ' partial' : ''}" cx="${g.x(segment[0].time)}" cy="${g.y(segment[0].value)}" r="4"/>`;
      segment = [];
    };
    const expected = (data.concurrentIntervalSeconds || data.sampleIntervalSeconds || 30) * 1000;
    for (const point of chartPoints) {
      if (segment.length && point.time - segment.at(-1).time > expected * 2) drawSegment();
      if (typeof point.value !== 'number' || !Number.isFinite(point.value)) { drawSegment(); continue; }
      segment.push(point);
    }
    drawSegment();
    markup += '<g id="chart-cursor"></g>';
    $('concurrent-chart').innerHTML = markup;
    $('concurrent-empty').hidden = chartPoints.some(point => typeof point.value === 'number');
    text('concurrent-empty', 'No player readings in this period yet.');
    $('concurrent-partial').hidden = !chartPoints.some(point => point.partial && Number.isFinite(point.value));
    $('chart-time').disabled = !chartPoints.length;
    $('chart-time').max = String(Math.max(0, chartPoints.length - 1));
    if (chartPoints.length) {
      const selected = inspectedAt === null ? chartPoints.length - 1 : chartPoints.reduce((best, point, i) => Math.abs(point.time - inspectedAt) < Math.abs(chartPoints[best].time - inspectedAt) ? i : best, 0);
      inspect(selected, false);
    }
    else text('concurrent-readout', 'Readings will appear here as the realms report.');
  }
  function inspect(index, remember = true) {
    const point = chartPoints[index];
    if (!point) return;
    if (remember) inspectedAt = point.time;
    $('chart-time').value = String(index);
    const readout = `${utc(point.time)} UTC · ${point.value === null ? 'No reading' : `${number(point.value)} ${data.range === '24h' ? 'players online' : 'average players online'}${point.partial ? ' · Partial coverage' : ''}`}`;
    text('concurrent-readout', readout); $('chart-time').setAttribute('aria-valuetext', readout);
    const g = chartPosition, x = g.x(point.time);
    $('chart-cursor').innerHTML = `<line class="chart-marker" x1="${x}" x2="${x}" y1="${g.top}" y2="${g.bottom}"/>${typeof point.value === 'number' ? `<circle class="chart-dot${point.partial ? ' partial' : ''}" cx="${x}" cy="${g.y(point.value)}" r="4"/>` : ''}`;
  }
  function drawHourly() {
    const points = (data.hourly || []).map(row => ({ time: Date.parse(row.hour), value: row.activePlayers, complete: row.complete })).filter(point => Number.isFinite(point.time));
    const [start, end] = period(points), width = Math.max(240, Math.round($('hourly-chart').clientWidth)), height = 220;
    $('hourly-chart').setAttribute('viewBox', `0 0 ${width} ${height}`);
    const g = chartGeometry(points, width, height, start, end);
    // One bar per UTC hour; dense ranges share pixels without inventing daily unique counts.
    const barWidth = Math.max(.5, Math.min(25, (g.right - g.left) * 3600000 / (end - start) - 2));
    $('hourly-chart').innerHTML = `<title id="hourly-chart-title">Unique active accounts per UTC hour. Exact values are in the hourly history table.</title>${axis(g, start, end)}${points.filter(point => typeof point.value === 'number').map(point => `<rect class="hour-bar${point.complete ? '' : ' partial'}" x="${Math.max(g.left, g.x(point.time))}" y="${g.y(point.value)}" width="${barWidth}" height="${Math.max(0, g.bottom - g.y(point.value))}"><title>${utc(point.time)} UTC: ${number(point.value)} active accounts${point.complete ? '' : ' (partial hour)'}</title></rect>`).join('')}`;
    $('hourly-empty').hidden = points.some(point => typeof point.value === 'number');
    text('hourly-empty', 'No hourly activity recorded in this period yet.');
  }
  function table() {
    const rows = [...(data.hourly || [])].reverse();
    $('history').innerHTML = rows.length ? rows.slice(0, rowsShown).map(row => `<tr><td>${utc(row.hour)}</td><td>${number(row.activePlayers)}</td><td>${typeof row.averagePlayers === 'number' ? number(Math.round(row.averagePlayers * 10) / 10) : '—'}</td><td>${number(row.peakPlayers)}</td><td>${row.complete ? 'Complete' : 'Partial'}</td></tr>`).join('') : '<tr><td colspan="5">No hourly history in this period yet.</td></tr>';
    $('more').hidden = rowsShown >= rows.length;
    $('download').disabled = !rows.length;
  }
  function countries() {
    const value = data.countries;
    $('country-download').disabled = !value?.total;
    if (!value) {
      text('country-summary', 'Country measurements are unavailable.');
      text('country-tracking', '');
      $('country-history').innerHTML = '<tr><td colspan="3">No country measurements are available.</td></tr>'; return;
    }
    const window = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' }[value.window];
    text('country-summary', `${window} · ${number(value.total)} active accounts`);
    text('country-tracking', `Tracking since ${utc(value.trackingSince)} UTC; this view starts ${utc(value.since)} UTC.`);
    $('country-history').replaceChildren(...value.rows.map(row => {
      const tr = document.createElement('tr');
      for (const value of [countryName(row.country), number(row.players), data.countries.total ? `${(row.players / data.countries.total * 100).toFixed(1)}%` : '—']) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      return tr;
    }));
  }
  function render() {
    const live = data.live || {}, registered = data.registered || {}, auction = data.auction || {}, treasury = data.treasury || {};
    const economy = data.economy;
    const gold = value => typeof value === 'string' && /^\d+$/.test(value) ? new Intl.NumberFormat('en-US').format(BigInt(value)) : '—';
    $('gold-history').innerHTML = economy?.status === 'ok' ? [1, 7, 30].map(days => {
      const row = economy.windows[days];
      return `<tr><td>${days === 1 ? '24 hours' : `${days} days`}</td><td>${gold(row.created)}</td></tr>`;
    }).join('') : '<tr><td colspan="2">Gold data unavailable.</td></tr>';
    text('online', number(live.players));
    note('online-note', live.players === null ? `${number(live.observedPlayers)} observed · incomplete` : '');
    text('peak', number(data.peaks?.day));
    text('record', number(data.peaks?.allTime));
    text('registered', number(registered.total));
    note('registered-note', ['ok', 'ready', 'current'].includes(registered.status) ? '' : registered.total !== null && registered.total !== undefined ? `Last count: ${utc(registered.updatedAt)} UTC` : 'Unavailable');
    const moss = auction.totalWei === null || auction.totalWei === undefined ? { display: '—', exact: 'Unavailable' } : mossAmount(auction.totalWei, auction.decimals ?? 18);
    text('moss', moss.display); $('moss').title = moss.exact;
    note('moss-note', ['ok', 'ready', 'current'].includes(auction.status) ? '' : auction.status === 'indexing' ? 'Indexing purchases…' : auction.updatedAt ? `Last indexed: ${utc(auction.updatedAt)} UTC` : 'Unavailable');
    for (const [id, key] of [['vouchers', 'totalPaidWei'], ['vault', 'balanceWei']]) {
      const amount = mossAmount(treasury[key], treasury.decimals ?? 18);
      text(id, amount.display); $(id).title = amount.exact;
      note(`${id}-note`, treasury.status === 'ok' ? '' : treasury.updatedAt ? `Last checked: ${utc(treasury.updatedAt)} UTC` : 'Unavailable');
    }
    $('realms').replaceChildren(...Object.entries(names).map(([id, name]) => {
      const realm = (live.realms || []).find(item => item.id === id);
      const li = document.createElement('li'), label = document.createElement('span'), value = document.createElement('strong'), state = document.createElement('small');
      label.textContent = name; state.textContent = realm?.available ? '' : 'Unavailable'; state.hidden = !!realm?.available; label.append(state);
      value.textContent = realm?.available ? number(realm.players) : '—'; li.append(label, value); return li;
    }));
    text('status', `Updated ${utc(data.generatedAt).slice(11)} UTC`);
    $('status').classList.toggle('fresh', live.players !== null);
    $('notice').hidden = live.players !== null;
    text('notice', 'Some realms are unavailable. The global live count will return when all three report.');
    text('tracking', data.trackingSince ? `Tracking since ${utc(data.trackingSince)} UTC` : 'History begins when tracking is enabled');
    drawConcurrent(); drawHourly(); table(); countries();
  }
  async function refresh() {
    const id = ++requestId;
    controller?.abort(); const activeController = new AbortController(); controller = activeController;
    const timeout = setTimeout(() => activeController.abort(), 25000);
    $('refresh').disabled = true;
    text('status', data ? 'Updating…' : 'Loading…');
    try {
      const response = await fetch(`/api/stats?range=${range}`, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw Error('unavailable');
      const next = await response.json();
      if (!next.live || !Array.isArray(next.hourly) || !Array.isArray(next.concurrent) || !Number.isFinite(Date.parse(next.generatedAt))) throw Error('invalid');
      if (id !== requestId) return;
      data = next; render();
    } catch {
      if (id !== requestId) return;
      text('online', '—'); note('online-note', 'Live count unavailable');
      $('realms').querySelectorAll('strong').forEach(item => { item.textContent = '—'; });
      $('realms').querySelectorAll('small').forEach(item => { item.textContent = 'Last refresh failed'; item.hidden = false; });
      text('status', 'Connection unavailable'); $('status').classList.remove('fresh');
      $('notice').hidden = false;
      text('notice', data ? `Refresh failed. Showing ${data.range || '24h'} data from ${utc(data.generatedAt)} UTC. Retry with Refresh.` : 'Statistics unavailable. Retry with Refresh.');
      if (!data) { text('concurrent-empty', 'Player history is temporarily unavailable.'); text('hourly-empty', 'Hourly activity is temporarily unavailable.'); }
    } finally { clearTimeout(timeout); if (id === requestId) $('refresh').disabled = false; }
  }
  $('refresh').addEventListener('click', refresh);
  document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
    range = button.dataset.range; rowsShown = 12; inspectedAt = null;
    document.querySelectorAll('[data-range]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    refresh();
  }));
  $('chart-time').addEventListener('input', event => inspect(Number(event.target.value)));
  $('concurrent-chart').addEventListener('pointermove', event => {
    if (!chartPoints.length) return;
    const rect = event.currentTarget.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * event.currentTarget.viewBox.baseVal.width;
    let nearest = 0;
    for (let i = 1; i < chartPoints.length; i++) if (Math.abs(chartPosition.x(chartPoints[i].time) - x) < Math.abs(chartPosition.x(chartPoints[nearest].time) - x)) nearest = i;
    inspect(nearest);
  });
  $('more').addEventListener('click', () => { rowsShown += 48; table(); });
  $('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([csvFor(data.hourly || [])], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `mossvale-hourly-${range}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('country-download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([countriesCsvFor(data.countries)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `mossvale-countries-${data.countries.window}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (data) { drawConcurrent(); drawHourly(); } }, 150); });
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  refresh();
}
