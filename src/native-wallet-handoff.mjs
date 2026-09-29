import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { nativeWalletResultValid, validateNativeWalletOperation } from './native-wallet-operation.ts';

const secret = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest();
const matches = (value, expected) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(digest(value), expected);
const fields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const failure = (status, message) => Object.assign(Error(message), { status });

/** Store one bounded voucher approval and its result; account credentials never enter the packet. */
export function createNativeWalletHandoff({ originAllowed, claimAllowed, authenticate, now = Date.now }) {
  const pending = new Map(), rates = new Map();
  let closed = false;
  function rate(key, time) {
    const prior = rates.get(key);
    if (prior?.until > time && prior.count >= 60) throw failure(429, 'Too many wallet requests. Wait a minute and try again.');
    if (prior?.until > time) prior.count++;
    else if (rates.size < 2048) rates.set(key, { count: 1, until: time + 60000 });
    else throw failure(503, 'Wallet connection is busy. Try again shortly.');
  }
  async function handle(req, res, origin) {
    const reply = (status, body) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(body));
    try {
      if (closed) throw failure(503, 'The realm is restarting. Return to Mossvale and try again.');
      const time = now();
      for (const [id, entry] of pending) if (entry.retainUntil <= time) pending.delete(id);
      for (const [id, entry] of rates) if (entry.until <= time) rates.delete(id);
      if (req.method !== 'POST') throw failure(405, 'Use POST for wallet actions.');
      if (!originAllowed(origin) || req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') throw failure(403, 'Start wallet actions from Mossvale.');
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw failure(415, 'Use JSON for wallet actions.');
      const action = new URL(req.url, origin).pathname.replace('/api/native-wallet/', '');
      if (!['start', 'request', 'complete', 'result'].includes(action)) throw failure(404, 'Unknown wallet action.');
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 16384) throw failure(413, 'Wallet request is too large.'); chunks.push(chunk); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw failure(400, 'Invalid wallet request.'); }
      if (action === 'start') {
        let account;
        try { account = await authenticate(req); } catch {
          rate(`invalid:${req.socket.remoteAddress}`, time);
          throw failure(401, 'Sign in to Mossvale again before linking or collecting.');
        }
        rate(`account:${account}`, time);
        if (!fields(body, ['operation'])) throw failure(400, 'Invalid wallet action.');
        let operation;
        try { operation = validateNativeWalletOperation(body.operation, origin, now()); } catch (error) { throw failure(400, error.message); }
        if (operation.kind === 'claim' && !await claimAllowed(operation.claim)) throw failure(400, 'This payout is not available from this realm. Return to Veyl and check the payout.');
        if (closed) throw failure(503, 'The realm is restarting. Return to Mossvale and try again.');
        // ponytail: 1024 short-lived approvals per realm; use a shared TTL store if this measured limit is reached.
        if (pending.size >= 1024) throw failure(503, 'Wallet connection is busy. Try again shortly.');
        const id = secret(), readToken = secret(), walletToken = secret(), expiresAt = Math.min(now() + 180000, operation.kind === 'sign' ? operation.expiresAt : Infinity);
        if (expiresAt <= now()) throw failure(400, 'The wallet action expired. Return to Mossvale and try again.');
        pending.set(id, { operation, origin, expiresAt, retainUntil: operation.kind === 'claim' ? now() + 600000 : expiresAt, read: digest(readToken), wallet: digest(walletToken), opened: false, result: null });
        reply(200, { id, readToken, walletToken, expiresAt }); return;
      }
      if (!fields(body, action === 'complete' ? ['id', 'token', 'result'] : ['id', 'token']) || typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id)) throw failure(400, 'Invalid wallet request.');
      const entry = pending.get(body.id);
      if (!entry || entry.retainUntil <= now() || entry.origin !== origin || !matches(body.token, action === 'result' ? entry.read : entry.wallet)) {
        rate(`invalid:${req.socket.remoteAddress}`, time);
        throw failure(404, 'The wallet action is missing or expired. Return to Mossvale and try again.');
      }
      if (action === 'request') {
        if (entry.expiresAt <= now()) throw failure(410, 'This wallet action expired. Return to Mossvale and try again.');
        if (entry.opened) throw failure(409, 'This approval page was already opened. Return to Mossvale and check the payout before trying again.');
        entry.opened = true; reply(200, { operation: entry.operation, expiresAt: entry.expiresAt }); return;
      }
      if (action === 'complete') {
        if (!entry.opened || !nativeWalletResultValid(entry.operation, body.result)) throw failure(400, 'Invalid wallet result.');
        if (entry.result && JSON.stringify(entry.result) !== JSON.stringify(body.result)) throw failure(409, 'This wallet action already finished.');
        entry.result = body.result; reply(200, { completed: true }); return;
      }
      // Retain an immutable result until expiry: a dropped HTTP response must not lose a submitted transaction.
      reply(200, { result: entry.result });
    } catch (error) { if (!res.headersSent && !res.destroyed) reply(error.status || 500, { error: error.status ? error.message : 'Wallet connection could not finish. Return to Mossvale and check the payout.' }); }
  }
  return { handle, close() { closed = true; pending.clear(); rates.clear(); } };
}
