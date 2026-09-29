import { getTreasuryStats } from './treasury.mjs';

const REALMS = ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world'];
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=15', 'X-Content-Type-Options': 'nosniff' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname !== '/api/stats') return Response.json({ error: 'Not found' }, { status: 404, headers: HEADERS });
    if (!['GET', 'HEAD'].includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { ...HEADERS, Allow: 'GET, HEAD' } });
    const range = url.searchParams.get('range') || '24h';
    if (!['24h', '7d', '30d', 'all'].includes(range)) return Response.json({ error: 'Invalid time range' }, { status: 400, headers: HEADERS });
    const treasury = getTreasuryStats();
    // Keep the shared snapshot alive when a HEAD response or disconnected caller finishes first.
    ctx.waitUntil(treasury);
    for (const origin of REALMS) {
      try {
        // Fixed origins and no forwarded cookies or auth keep this a public aggregate proxy.
        const response = await fetch(`${origin}/api/stats?range=${range}`, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(6000), cf: { cacheTtl: 15, cacheEverything: true } });
        if (!response.ok) { await response.body?.cancel(); continue; }
        const data = await response.json();
        if (!data.live || !Array.isArray(data.hourly) || !Array.isArray(data.concurrent) || !Number.isFinite(Date.parse(data.generatedAt))) continue;
        return new Response(request.method === 'HEAD' ? null : JSON.stringify({ ...data, treasury: await treasury }), { headers: HEADERS });
      } catch { /* Try another realm's view of the shared statistics database. */ }
    }
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: 'Statistics are temporarily unavailable' }), { status: 503, headers: { ...HEADERS, 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  },
};
