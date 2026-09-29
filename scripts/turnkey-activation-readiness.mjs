import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { turnkeyActivation, turnkeyActivationPhase } from './turnkey-activation.mjs';
import { turnkeyActivationPreflight } from './turnkey-activation-preflight.mjs';

/** Early observations only. Rollout repeats its checks before player warnings. */
export async function turnkeyActivationReadiness({ env = process.env, fetcher = fetch, preflight = turnkeyActivationPreflight } = {}) {
  let phase = 'configuration';
  try {
    const activation = turnkeyActivation(env);
    if (!activation) return { enabled: false };
    assert(env.GITHUB_REPOSITORY === 'trappyon/mossvale' && env.GITHUB_REF === 'refs/heads/main'
      && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') && /^[a-f0-9]{64}$/.test(env.MOSSVALE_DEPLOY_TOKEN || ''));
    async function read(url, token) {
      const response = await fetcher(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Mozilla/5.0 MossvaleProduction/1.0', 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw Error();
      const body = await response.text();
      if (body.length > 524288) throw Error();
      return JSON.parse(body);
    }
    phase = 'EU deployment observation';
    const status = await read('https://mossvale.world/api/deployment', env.MOSSVALE_DEPLOY_TOKEN);
    phase = 'pinned BBA app observation';
    const { app } = await read(`https://bba.tools/api/apps/${activation.appId}`, activation.token);
    phase = 'activation state validation';
    const state = turnkeyActivationPhase(status, app, activation, env.GITHUB_SHA);
    assert(/^[a-f0-9]{40}$/.test(status.revision || ''));
    assert(status.state === 'idle' || status.targetRevision === env.GITHUB_SHA, 'Another release owns the drain');
    if (state === 'initial') assert.notEqual(status.revision, env.GITHUB_SHA);
    if (state === 'pending') {
      phase = 'pending settings replacement (not ready)';
      throw Error(); // Observe once; never replay a settings write or poll here.
    }
    phase = 'provider preparation';
    await preflight({ env: activation.settings, fetcher });
    return { enabled: true, state };
  } catch {
    throw Error(`Turnkey activation readiness failed at ${phase}. No deployment or transaction was started.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await turnkeyActivationReadiness();
    console.log(result.enabled ? 'Turnkey activation readiness passed before CI. Rollout will revalidate before player warnings.'
      : 'Turnkey activation is disabled; early provider checks were skipped.');
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
