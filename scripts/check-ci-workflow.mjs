import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/production.yml', import.meta.url), 'utf8');
const authWorkflow = readFileSync(new URL('../.github/workflows/auth-image.yml', import.meta.url), 'utf8');
const job = (name, source = workflow) => {
  const marker = `\n  ${name}:\n`, start = source.indexOf(marker);
  assert(start >= 0, `Missing ${name} job`);
  return source.slice(start + marker.length).split(/^  [\w-]+:\n/m)[0];
};
for (const [source, expectedJobs] of [[workflow, ['activation-preflight', 'check-shards', 'checks', 'image', 'deploy', 'wiki', 'stats']], [authWorkflow, ['image', 'deploy']]]) {
  assert.deepEqual([...source.matchAll(/^  ([\w-]+):\n/gm)].map(match => match[1]).filter(name => source.indexOf(`\n  ${name}:\n`) > source.indexOf('\njobs:\n')), expectedJobs);
  for (const name of expectedJobs) assert.match(job(name, source), /^    runs-on: \[self-hosted, linux, x64, mossvale-ci\]$/m,
    `${name} must use the repository's self-hosted workers without a hosted fallback`);
}
const early = job('activation-preflight'), shards = job('check-shards'), gate = job('checks'), image = job('image'), deploy = job('deploy');
assert.match(early, /^    environment: production$/m, 'Read the gate from the production environment');
assert.match(early, /^    if: github\.repository == 'trappyon\/mossvale' && github\.event\.repository\.private && github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'$/m);
assert(!early.split('\n    steps:')[0].includes('vars.MOSSVALE_ACTIVATE_TURNKEY'), 'Environment flags cannot gate job admission');
assert.equal((early.match(/if: steps\.gate\.outputs\.enabled == 'true'/g) || []).length, 4, 'Disabled activation must skip checkout, setup, installation and provider access');
assert.match(early, /run: node scripts\/turnkey-activation-readiness\.mjs/);
assert(!/SSH_KEY|KNOWN_HOSTS|contents: write|packages: write|rollout\.mjs/.test(early), 'Early readiness has no deployment access or mutation entry point');
const earlyGate = early.split('        run: |\n')[1]?.split('      - uses:')[0]?.split('\n').map(line => line.slice(10)).join('\n');
assert(earlyGate, 'The early gate must be checked before checkout');
const temporary = mkdtempSync(join(tmpdir(), 'mossvale-activation-gate-'));
try {
  for (const value of ['', 'false', 'true', 'yes', 'TRUE']) {
    const output = join(temporary, 'gate-' + (value || 'empty'));
    const result = spawnSync('bash', ['-e', '-c', earlyGate], { env: { ACTIVATE_TURNKEY: value, GITHUB_OUTPUT: output }, encoding: 'utf8' });
    assert.equal(result.status === 0, ['', 'false', 'true'].includes(value));
    if (result.status === 0) assert.equal(readFileSync(output, 'utf8'), `enabled=${value === 'true'}\n`);
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
const expectedSuites = ['shared-progress', 'combat-feedback', 'dungeon-chambers', 'nft-wallet', 'store-release',
  'towns-auctions', 'economy-updates', 'client-mobile', 'arena-performance', 'gm-controls', 'characters-treasury'];
const batches = [...shards.matchAll(/^          - batch: (\d+)\n            suites: \[([^\]]+)\]$/gm)]
  .map(([, id, names]) => ({ id, suites: names.split(', ') }));
assert.deepEqual(batches.map(batch => batch.id), ['1', '2'], 'Reuse one checkout/install/build per available worker');
assert.deepEqual(batches.flatMap(batch => batch.suites).sort(), [...expectedSuites].sort(), 'Every suite runs exactly once');
assert.match(shards, /^    timeout-minutes: 30$/m, 'Each combined batch remains bounded');
assert.match(shards, /^      fail-fast: false$/m, 'One failure must not cancel other evidence');
assert.match(shards, /^      max-parallel: 2$/m, 'At most two check shards run at once');
assert.match(shards, /^    needs: activation-preflight$/m);
assert.match(shards, /!cancelled\(\) && \(needs\.activation-preflight\.result == 'success' \|\| \(github\.ref != 'refs\/heads\/main' && needs\.activation-preflight\.result == 'skipped'\)\) &&/,
  'Failed readiness must block main checks; non-main checks retain their intentionally skipped production dependency');
assert.match(shards, /^      github\.repository == 'trappyon\/mossvale' && github\.event\.repository\.private && \(github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository\)$/m,
  'Only private repository pushes, dispatches, and same-repository pull requests may run checked-out code');
assert(!/continue-on-error:/.test(shards + gate + deploy), 'Failed checks must block deployment');

const steps = shards.slice(shards.indexOf('\n    steps:\n'));
const checkout = steps.slice(0, steps.indexOf('      - uses: actions/setup-node@'));
assert(checkout.includes("fetch-depth: ${{ contains(matrix.suites, 'store-release') && '0' || '1' }}"),
  'Only the patch-note batch needs full history');
assert.equal((steps.match(/run: npm ci$/gm) || []).length, 1);
assert.equal((steps.match(/run: npm run build$/gm) || []).length, 1);
assert.match(steps, /run: npm run build\n        id: build/);
assert(steps.indexOf('run: npm ci') < steps.indexOf('run: npm run build'), 'Install before building');
const suiteSteps = [...steps.matchAll(/      - name: Run ([\w-]+) checks\n([\s\S]*?)(?=      - )/g)];
assert.deepEqual(suiteSteps.map(([, name]) => name), expectedSuites, 'Keep all named suite results');
for (const [, name, step] of suiteSteps) {
  assert(step.includes(`if: \${{ !cancelled() && steps.build.outcome == 'success' && contains(matrix.suites, '${name}') }}`),
    `${name} must run after another suite fails, but never after a failed build or cancellation`);
  assert.match(step, /^        timeout-minutes: 15$/m, `${name} retains its own timeout`);
  assert(step.trimEnd().endsWith('git diff --exit-code'), `${name} must guard tracked files before another suite runs`);
  assert.match(step, /^        run: \|\n          (?:npm|node) /m);
}
assert(steps.indexOf('id: build') < steps.indexOf('      - name: Run '), 'Build before every suite');
assert(steps.includes("if: ${{ !cancelled() && steps.build.outcome == 'success' && contains(matrix.suites, 'store-release') && (github.event_name == 'pull_request' || github.event_name == 'push') }}"),
  'Patch-note enforcement must also run after a failed suite');
assert.match(steps, /run: node wiki\/check-sync\.mjs "\$MOSSVALE_WIKI_BASE" "\$MOSSVALE_WIKI_HEAD"/);
const upload = steps.slice(steps.indexOf('uses: actions/upload-artifact@'));
assert.match(upload, /if: contains\(matrix\.suites, 'store-release'\)/, 'Exactly one successful batch publishes the manifest');
assert(!/always\(|!cancelled\(|continue-on-error/.test(upload), 'Never publish a manifest after any suite fails');
assert.match(upload, /name: release-manifest\n          path: dist\/release\.json\n          if-no-files-found: error/);
assert(steps.indexOf('uses: actions/upload-artifact@') > steps.lastIndexOf('git diff --exit-code'), 'Publish only after every tracked-file guard');

assert.match(gate, /^    needs: check-shards$/m);
assert.match(gate, /^    if: always\(\)$/m, 'The stable checks status must fail for skipped or cancelled shards');
assert.match(gate, /CHECK_RESULT: \$\{\{ needs\.check-shards\.result \}\}/);
const gateCommand = gate.match(/^        run: (.+)$/m)?.[1];
assert(gateCommand, 'Missing aggregate success gate');
for (const result of ['success', 'failure', 'cancelled', 'skipped', '']) {
  const check = spawnSync('sh', ['-c', gateCommand], { env: { CHECK_RESULT: result }, stdio: 'pipe' });
  assert.equal(check.status === 0, result === 'success', `Aggregate gate must reject ${result || 'missing'} result`);
}
assert.match(image, /^    needs: activation-preflight$/m, 'Image building overlaps checks only after early readiness');
assert.match(image, /^    if: github\.repository == 'trappyon\/mossvale' && github\.ref == 'refs\/heads\/main' && vars\.MOSSVALE_PRODUCTION_ENABLED == 'true'$/m);
assert.match(deploy, /^    needs: \[checks, image\]$/m, 'Every check and the immutable image must pass before deployment');
assert(!/^    if:/m.test(deploy), 'Deployment must retain the default successful-dependencies gate');
assert.match(workflow, /^  cancel-in-progress: false$/m, 'A newer push must not cancel a started rollout');
assert(!workflow.includes('pull_request_target'), 'Pull requests cannot receive deployment access');
assert(!authWorkflow.includes('pull_request'), 'Auth image publication remains manual');
assert.match(job('image', authWorkflow), /^    if: github\.repository == 'trappyon\/mossvale' && github\.event\.repository\.private$/m);
assert.match(job('deploy', authWorkflow), /^    needs: image\n    if: inputs\.deploy$/m, 'Auth deploy retains its explicit dispatch choice and successful image dependency');
assert.match(job('deploy', authWorkflow), /^      group: mossvale-auth-production\n      cancel-in-progress: false$/m);

// Exercise the actual wiki publication shell without network access or real delays.
const wikiPublish = job('wiki').split('      - name: Publish matching wiki\n')[1]?.split('\n      - name:')[0];
const wikiPublishScript = wikiPublish?.split('        run: |\n')[1]?.split('\n').map(line => line.slice(10)).join('\n');
assert(wikiPublishScript, 'Missing wiki publication command');
for (const scenario of [
  { name: 'first success', successAt: 1, realmFailureAt: 99, status: 0, calls: [1, 1, 0] },
  { name: 'transient timeout', successAt: 2, realmFailureAt: 99, status: 0, calls: [2, 2, 1] },
  { name: 'persistent failure', successAt: 99, realmFailureAt: 99, status: 1, calls: [3, 3, 2] },
  { name: 'superseded during retry', successAt: 2, realmFailureAt: 2, status: 1, calls: [1, 2, 1] },
  { name: 'missing token', successAt: 1, realmFailureAt: 99, token: '', status: 1, calls: [0, 0, 0] },
]) {
  const check = spawnSync('bash', ['-e', '-c', `
    publishes=0; realms=0; delays=0
    trap 'printf "calls=%d,%d,%d\\n" "$publishes" "$realms" "$delays"' EXIT
    node() { realms=$((realms + 1)); test "$realms" -lt "$REALM_FAILURE_AT"; }
    npx() { publishes=$((publishes + 1)); test "$publishes" -ge "$SUCCESS_AT"; }
    sleep() { delays=$((delays + 1)); }
    ${wikiPublishScript}
  `], { encoding: 'utf8', env: { CLOUDFLARE_API_TOKEN: scenario.token ?? 'test-token', GITHUB_SHA: 'a'.repeat(40),
    SUCCESS_AT: String(scenario.successAt), REALM_FAILURE_AT: String(scenario.realmFailureAt) } });
  assert.equal(check.status, scenario.status, `${scenario.name}: ${check.stderr}`);
  assert(check.stdout.trim().endsWith(`calls=${scenario.calls.join(',')}`), `${scenario.name}: ${check.stdout}`);
}
console.log('PASS CI workflow: all game/auth jobs self-hosted, eleven named suites in two build-once batches, failure-preserving suite gates, full history only for patch-note validation, private same-repository PR guard, one manifest, strict aggregate success, bounded wiki publishing retries, and unchanged game/auth deployment gates.');
