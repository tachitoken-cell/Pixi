import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const API = 'https://bba.tools/api';
const APP = '347997b7-50dd-490b-aa22-a2627e0732e8';
const ISSUER = 'https://auth.mossvale.world/realms/mossvale';
const IMAGE = /^ghcr\.io\/trappyon\/mossvale-auth@sha256:[a-f0-9]{64}$/;
const mutable = new Set(['image', 'status', 'updatedAt', 'publicUrl', 'settingsPending', 'lastError']);
const configuration = app => Object.fromEntries(Object.entries(app).filter(([key]) => !mutable.has(key)));
const canonical = value => JSON.stringify(value, function (_, v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v;
});
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const idle = app => app.settingsPending === false && app.lastError === null;

/** API-only release. Injected I/O is used by the local lifecycle regression. */
export async function deployAuth(image, { token = process.env.BBA_API_TOKEN, fetchImpl = fetch, sleep = delay,
  now = Date.now, waitMs = 300_000, requestMs = 15_000 } = {}) {
  const proof = { appId: APP, image: IMAGE.test(image ?? '') ? image : null, startedAt: new Date(now()).toISOString(), ok: false };
  let baseline, pauseAttempted = false, promotionAttempted = false;
  const json = async (url, method = 'GET', body) => {
    const headers = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 MossvaleAuthRelease/1.0' };
    if (url.startsWith(API + '/')) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(url, { method, headers, body: body && JSON.stringify(body),
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(requestMs) });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      // Neither response bodies nor transport errors are safe to log: they can echo credentials.
      throw Object.assign(new Error(`${url.startsWith(API + '/') ? 'BBA' : 'Public auth'} ${method} request failed${response ? ` (HTTP ${response.status})` : ''}.`), { status: response?.status });
    }
  };
  const read = async () => {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { app } = await json(`${API}/apps/${APP}`);
        ensure(app?.id === APP && app.name === 'mossvale-auth-custom' && app.sourceType === 'container'
          && app.namespace === 'team-daniel-frykman-6d552ba9' && app.replicas === 1 && app.port === 8080
          && app.isPublic === true && app.customDomain === null && IMAGE.test(app.image)
          && typeof app.updatedAt === 'string' && Number.isFinite(Date.parse(app.updatedAt)), 'Auth app identity does not match.');
        if (baseline) ensure(isDeepStrictEqual(configuration(app), configuration(baseline)), 'Visible auth configuration changed; release stopped.');
        return app;
      } catch (error) { last = error; if (attempt < 2) await sleep(1000); }
    }
    throw last;
  };
  const poll = async (state, expectedImage) => {
    const end = now() + waitMs;
    do {
      const app = await read();
      ensure(app.image === expectedImage, 'Another image appeared; release stopped.');
      ensure(!app.lastError && !app.settingsPending, 'BBA reports an error or pending settings; release stopped.');
      if (app.status === state) return app;
      ensure(app.status === (state === 'paused' ? 'pausing' : 'resuming'), 'Unexpected lifecycle state; release stopped.');
      await sleep(2000);
    } while (now() < end);
    throw new Error(`Timed out waiting for auth ${state}.`);
  };
  const action = async (action, expectedImage) => {
    const current = await read();
    const from = current.status, to = action === 'pause' ? 'paused' : 'ready';
    ensure(current.image === expectedImage && (action === 'pause' ? from === 'ready' : ['paused', 'stopped'].includes(from))
      && idle(current), 'Auth changed before lifecycle action.');
    let requestError;
    try { await json(`${API}/apps/${APP}/actions`, 'POST', { action }); } catch (error) { requestError = error; }
    const rejected = requestError?.status >= 400 && requestError.status < 500;
    if (rejected && action === 'pause') pauseAttempted = false;
    // A lost response may follow a committed operation. Read the state before any further write.
    const after = await read();
    if (rejected) throw requestError;
    ensure(after.image === expectedImage, 'Another image appeared after lifecycle action.');
    if (after.status === from) throw requestError ?? new Error('BBA did not advance the lifecycle action.');
    return poll(to, expectedImage);
  };
  const publicIdentity = async () => {
    const discovery = await json(`${ISSUER}/.well-known/openid-configuration`);
    ensure(discovery.issuer === ISSUER && discovery.jwks_uri === `${ISSUER}/protocol/openid-connect/certs`
      && discovery.authorization_endpoint === `${ISSUER}/protocol/openid-connect/auth`
      && discovery.token_endpoint === `${ISSUER}/protocol/openid-connect/token`, 'Public auth issuer/endpoints do not match.');
    const { keys } = await json(`${ISSUER}/protocol/openid-connect/certs`);
    ensure(Array.isArray(keys) && keys.length > 0 && keys.every(k => typeof k.kid === 'string' && typeof k.kty === 'string'), 'Public signing keys are missing.');
    return { issuer: ISSUER, keys: [...keys].sort((a, b) => a.kid.localeCompare(b.kid)) };
  };
  try {
    ensure(IMAGE.test(image ?? ''), 'Supply the immutable ghcr.io/trappyon/mossvale-auth@sha256 image.');
    ensure(typeof token === 'string' && /^bba_pat_[A-Za-z0-9_-]{43}$/.test(token), 'Set BBA_API_TOKEN to an existing token with apps:read and apps:write.');
    baseline = await read();
    const stopped = baseline.status === 'stopped';
    ensure(['ready', 'stopped'].includes(baseline.status) && idle(baseline), 'Auth must be ready or explicitly stopped without pending settings or errors.');
    ensure(baseline.publicUrl === (stopped ? null : `http://${APP}.bba.tools`), 'Auth platform origin does not match.');
    proof.startedStopped = stopped;
    proof.previousImage = baseline.image;
    proof.rollbackCommand = `node scripts/deploy-auth.mjs ${baseline.image}`;
    proof.rollbackRequires = 'Auth must be ready or stopped. If startup failed, stop the app in BBA, wait for stopped, then run this command.';
    const beforeIdentity = stopped ? null : await publicIdentity();
    if (baseline.image !== image) {
      pauseAttempted = !stopped;
      const inactive = stopped ? baseline : await action('pause', baseline.image);
      let requestError;
      promotionAttempted = true;
      try {
        await json(`${API}/apps/${APP}/image`, 'PATCH', { image, expectedImage: inactive.image, expectedUpdatedAt: inactive.updatedAt });
      } catch (error) { requestError = error; }
      const rejected = requestError?.status >= 400 && requestError.status < 500;
      if (rejected) promotionAttempted = false;
      const after = await read();
      if (rejected) throw requestError;
      ensure(after.status === inactive.status && idle(after), 'Auth changed during image promotion.');
      if (after.image !== image) throw requestError ?? new Error('Image promotion did not persist.');
    }
    if (baseline.image !== image || stopped) await action('resume', image);
    const final = await read();
    ensure(final.image === image && final.status === 'ready' && idle(final) && final.publicUrl === `http://${APP}.bba.tools`, 'Auth final ready state does not match.');
    const afterIdentity = await publicIdentity();
    if (beforeIdentity) ensure(isDeepStrictEqual(beforeIdentity, afterIdentity), 'Public auth identity or signing keys changed.');
    Object.assign(proof, { ok: true, changed: baseline.image !== image, visibleConfigurationPreserved: true,
      configurationDigest: digest(configuration(final)), issuer: ISSUER, signingKeysPreserved: stopped ? null : true,
      signingKeysDigest: digest(afterIdentity.keys), finishedAt: new Date(now()).toISOString() });
    return proof;
  } catch (error) {
    proof.error = error.message;
    if (pauseAttempted) {
      try {
        let app = await read();
        const knownImage = app.image === baseline.image || (promotionAttempted && app.image === image);
        if (knownImage && app.status === 'pausing' && !app.lastError) app = await poll('paused', app.image);
        if (knownImage && app.status === 'paused' && idle(app)) {
          await action('resume', app.image); proof.cleanup = 'Resumed the unchanged known image.';
        } else proof.cleanup = app.status === 'ready' && knownImage ? 'Known image is already running.' : 'No safe lifecycle action; inspect BBA before using the rollback command.';
      } catch { proof.cleanup = 'Could not confirm a safe resume; inspect BBA before using the rollback command.'; }
    }
    proof.finishedAt = new Date(now()).toISOString();
    throw Object.assign(new Error(proof.error), { proof });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let proof;
  try {
    ensure(process.argv.length === 3, 'Usage: node scripts/deploy-auth.mjs ghcr.io/trappyon/mossvale-auth@sha256:DIGEST');
    proof = await deployAuth(process.argv[2]);
  } catch (error) { proof = error.proof ?? { ok: false, error: error.message }; process.exitCode = 1; }
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/auth-release.json', JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(proof));
}
