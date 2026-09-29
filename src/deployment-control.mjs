import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

const revisionValid = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const requestError = status => Object.assign(Error('Invalid deployment request.'), { status });
export const APPLE_ACTIVATION_KEYS = ['APPLE_IAP_PRIVATE_KEY', 'APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'MOBILE_PURCHASE_SANDBOX_ACCOUNTS'];
export function appleConfigurationHash(env) {
  const values = APPLE_ACTIVATION_KEYS.map(key => env[key] || '');
  return values.some(Boolean) ? createHash('sha256').update(JSON.stringify(values)).digest('hex') : null;
}
export const TURNKEY_ACTIVATION_KEYS = ['TURNKEY_ORGANIZATION_ID', 'TURNKEY_AUTH_PROXY_CONFIG_ID',
  'ALCHEMY_WALLET_API_KEY', 'ALCHEMY_GAS_POLICY_ID', 'TURNKEY_SPONSOR_MAX_OPERATION_WEI',
  'TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI', 'TURNKEY_SPONSOR_WALLET_DAILY_WEI',
  'TURNKEY_SPONSOR_GLOBAL_DAILY_WEI', 'TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI', 'TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS'];
export function turnkeyConfigurationHash(env) {
  const values = TURNKEY_ACTIVATION_KEYS.map(key => env[key] || '');
  return values.some(Boolean) ? createHash('sha256').update(JSON.stringify(values)).digest('hex') : null;
}
export const ARENA_ACTIVATION_KEYS = ['MOSS_ARENA_CONTRACT', 'MOSS_ARENA_AUTHORITY_KEY', 'MOSS_ARENA_RPC_URL'];
export function arenaConfigurationHash(env) {
  const values = ARENA_ACTIVATION_KEYS.map(key => env[key] || '');
  return values.some(Boolean) ? createHash('sha256').update(JSON.stringify(values)).digest('hex') : null;
}

function readInput(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [], timeout = setTimeout(() => finish(requestError(408)), 5000);
    function finish(error) {
      clearTimeout(timeout);
      req.off('data', data); req.off('end', end); req.off('error', failed); req.off('aborted', failed);
      if (error) { req.resume(); reject(error); }
      else {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(requestError(400)); }
      }
    }
    function data(chunk) { size += chunk.length; if (size > 256) finish(requestError(413)); else chunks.push(chunk); }
    function end() { finish(); }
    function failed() { finish(requestError(400)); }
    req.on('data', data); req.on('end', end); req.on('error', failed); req.on('aborted', failed);
  });
}

/** One irreversible drain per process; a new release starts with a new identity. */
export function createDeploymentControl({ token = process.env.MOSSVALE_DEPLOY_TOKEN || '', releaseFile, canStart, drain, appleEnvironment = process.env, turnkeyEnvironment = process.env, arenaEnvironment = process.env }) {
  if (token && !/^[a-f0-9]{64}$/i.test(token)) throw Error('MOSSVALE_DEPLOY_TOKEN must contain exactly 64 hexadecimal characters.');
  let revision = null;
  if (token) {
    try {
      if (!statSync(releaseFile).isFile() || statSync(releaseFile).size > 1024 * 1024) throw Error();
      revision = JSON.parse(readFileSync(releaseFile, 'utf8')).revision;
      if (!revisionValid(revision)) throw Error();
    } catch { throw Error('Deployment control requires a valid dist/release.json revision.'); }
  }
  const expectedToken = Buffer.from(token, 'hex'), instanceId = randomUUID();
  const appleIapHash = appleConfigurationHash(appleEnvironment);
  const turnkeyHash = turnkeyConfigurationHash(turnkeyEnvironment);
  const arenaHash = arenaConfigurationHash(arenaEnvironment);
  let state = 'idle', targetRevision = null, errorCode, drainedAt;
  const snapshot = () => ({ revision, instanceId, state, targetRevision, appleIapHash, turnkeyHash, arenaHash, economyBarrierVersion: 1,
    ...(state === 'drained' ? { drainedAt, finalSave: true, admissionHeld: true } : {}), ...(errorCode ? { errorCode } : {}) });
  const fail = () => { if (targetRevision) { state = 'failed'; errorCode = 'DRAIN_FAILED'; } };
  return {
    get state() { return state; },
    get active() { return targetRevision !== null; },
    draining() { if (state === 'countdown') state = 'draining'; },
    fail,
    async handle(req, res) {
      const reply = (status, value = {}) => {
        if (!res.destroyed) res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Connection': 'close' }).end(JSON.stringify(value));
      };
      try {
        if (!token) { reply(404); return; }
        if (req.headers.origin !== undefined) { reply(403); return; }
        const supplied = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization || '');
        if (!supplied || !timingSafeEqual(expectedToken, Buffer.from(supplied[1], 'hex'))) { reply(401); return; }
        if (req.url !== '/api/deployment') { reply(400); return; }
        if (req.method === 'GET') { reply(200, snapshot()); return; }
        if (req.method !== 'POST') { reply(405); return; }
        if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') { reply(415); return; }
        if (req.headers['content-encoding'] || Number(req.headers['content-length']) > 256) { reply(413); return; }
        const input = await readInput(req);
        if (!input || Array.isArray(input) || Object.keys(input).length !== 2
            || !revisionValid(input.expectedRevision) || !revisionValid(input.targetRevision)) { reply(400); return; }
        if (input.expectedRevision !== revision || input.targetRevision === revision) { reply(409, snapshot()); return; }
        if (targetRevision) { reply(targetRevision !== input.targetRevision ? 409 : state === 'failed' ? 503 : state === 'drained' ? 200 : 202, snapshot()); return; }
        if (!canStart()) { reply(409, snapshot()); return; }
        targetRevision = input.targetRevision; state = 'countdown';
        // Catch completion here: no response or retry may turn a failed save into a drained realm.
        Promise.resolve().then(drain).then(() => {
          if (state === 'draining') { state = 'drained'; drainedAt = Date.now(); } else fail();
        }, fail);
        reply(202, snapshot());
      } catch (error) { reply(error.status || 400); }
    },
  };
}
