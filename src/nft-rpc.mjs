/** Share immutable block-hash reads and pace the public RPC without caching chain heads or receipts. */
export function createNftRpc(request, { spacingMs = 200, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const pending = new Map(), saved = new Map();
  let queue = Promise.resolve(), nextAt = 0, retryAt = 0;
  const available = () => { if (now() < retryAt) throw Error('Chain verification is rate limited. Please wait a few seconds and refresh.'); };
  return function rpc(method, params) {
    try { available(); } catch (error) { return Promise.reject(error); }
    const key = JSON.stringify([method, params]), tag = params.at(-1);
    const immutable = ['eth_call', 'eth_getCode', 'eth_getStorageAt'].includes(method) && tag?.requireCanonical === true && /^0x[\da-f]{64}$/i.test(tag.blockHash);
    const cached = immutable && saved.get(key);
    // Keep frequently reused finalized reads through wallet scans. Callers still
    // recheck canonical headers; a new block hash always has a different key.
    if (cached && now() - cached.at < 300000) {
      saved.delete(key); saved.set(key, cached);
      return Promise.resolve(cached.value);
    }
    if (pending.has(key)) return pending.get(key);
    const start = queue.then(async () => {
      available();
      const delay = nextAt - now(); if (delay > 0) await wait(delay);
      available(); nextAt = now() + spacingMs;
    });
    queue = start.catch(() => {});
    const work = start.then(() => request(method, params)).then(value => {
      if (immutable) {
        saved.delete(key); saved.set(key, { at: now(), value });
        if (saved.size > 512) saved.delete(saved.keys().next().value);
      }
      return value;
    }).catch(error => {
      if (error?.status === 429 || error?.code === -32005 || error?.error?.code === -32005) {
        retryAt = now() + 15000;
        throw Error('Chain verification is rate limited. Please wait a few seconds and refresh.');
      }
      throw error;
    }).finally(() => { pending.delete(key); });
    pending.set(key, work); return work;
  };
}

// All game contracts using an endpoint share its request budget, cache and cooldown.
const endpoints = new Map();
export function getChainRpc(rpcUrl, { routeHeaders = true } = {}) {
  // The server's existing Alchemy key also covers chain verification. Resolve
  // defaults before caching so both public URLs share one paid request budget.
  if (routeHeaders && ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public'].includes(rpcUrl.replace(/\/$/, ''))) {
    const apiKey = process.env.ALCHEMY_WALLET_API_KEY;
    if (apiKey) {
      if (!/^[\w-]{8,256}$/.test(apiKey)) throw Error('Chain verification Alchemy configuration is invalid.');
      rpcUrl = `https://robinhood-mainnet.g.alchemy.com/v2/${apiKey}`;
    }
  }
  const key = JSON.stringify([rpcUrl, routeHeaders]);
  if (endpoints.has(key)) return endpoints.get(key);
  // This public state provider can lag finality and refuses old block headers.
  // The official node supplies canonical headers but prunes historical state;
  // keep every state read pinned to the exact hash it supplied, without retries
  // at a weaker block tag. Private/custom endpoints retain their own routing.
  const headers = routeHeaders && rpcUrl.replace(/\/$/, '') === 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public'
    ? getChainRpc('https://rpc.mainnet.chain.robinhood.com') : undefined;
  endpoints.set(key, createNftRpc(async (method, params) => {
    if (headers && ['eth_getBlockByNumber', 'eth_getBlockByHash'].includes(method)) return headers(method, params);
    let response, data;
    try {
      response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) });
    } catch { throw Error('Chain verification is unavailable. Please refresh.'); }
    if (!response.ok) throw Object.assign(Error(`Chain verification is unavailable (RPC HTTP ${response.status}).`), { status: response.status });
    try { data = await response.json(); } catch { throw Error('Chain verification returned an invalid response.'); }
    if (data?.error || data?.result === undefined) throw Object.assign(Error('Chain verification could not verify this request.'),
      { code: Number.isInteger(data?.error?.code) ? data.error.code : undefined });
    // Production adapters check chain identity before issuing or settling claims.
    if (headers && method === 'eth_chainId' && (data.result !== '0x1237' || await headers(method, params) !== data.result))
      throw Error('Chain verification endpoints disagree or are on the wrong chain.');
    return data.result;
  }));
  return endpoints.get(key);
}
