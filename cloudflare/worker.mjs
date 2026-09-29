import restartingPage from '../public/realm-restarting.html';

const ORIGIN = 'https://00edc49e-6028-442d-9417-673a2251a662.bba.tools';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    if (url.protocol !== 'https:' || url.hostname === 'www.mossvale.world') return Response.redirect(`https://mossvale.world${path}`, 308);
    const upstream = new Request(ORIGIN + path, request);
    upstream.headers.set('Host', new URL(ORIGIN).host);
    const navigation = ['GET', 'HEAD'].includes(request.method) && ['/', '/index.html'].includes(url.pathname)
      && !request.headers.has('Authorization') && !request.headers.has('Upgrade')
      && (request.mode === 'navigate' || /\btext\/html\b/i.test(request.headers.get('Accept') || ''));
    if (!navigation) return fetch(upstream, { redirect: 'manual' });
    try {
      const response = await fetch(upstream, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (response.status < 500) return response;
      void response.body?.cancel().catch(() => {});
    } catch { /* First-time visitors have no installed game shell to fall back to. */ }
    return new Response(request.method === 'HEAD' ? null : restartingPage, { status: 503, headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    } });
  },
};
