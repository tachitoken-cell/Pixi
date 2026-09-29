import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Run the actual entrypoint with the image's Bash/base64 as its normal keycloak user.
const root = fileURLToPath(new URL('..', import.meta.url));
const image = process.argv[2] || 'quay.io/keycloak/keycloak:26.7.3';
const dockerfile = readFileSync(join(root, 'Dockerfile.auth'), 'utf8');
assert.match(dockerfile, /COPY --chown=keycloak:keycloak --chmod=755 auth-theme\/entrypoint\.sh \/opt\/keycloak\/bin\/mossvale-entrypoint\.sh/);
assert.match(dockerfile, /ENTRYPOINT \["\/opt\/keycloak\/bin\/mossvale-entrypoint\.sh"\]/);
assert.match(dockerfile, /CMD \["start", "--optimized"\]/);
const directory = mkdtempSync(join(tmpdir(), 'mossvale-auth-entrypoint-'));
chmodSync(directory, 0o777); // Only synthetic certificate/argument output; writable by container UID 1000.
const stub = join(directory, 'kc.sh');
writeFileSync(stub, `#!/bin/bash
printf '%s\\0' "$@"
if [[ -e /tmp/mossvale-db-ca.pem ]]; then
  stat -c '%a' /tmp/mossvale-db-ca.pem > /result/mode
  cp /tmp/mossvale-db-ca.pem /result/ca
fi
exit "\${TEST_EXIT_CODE:-0}"
`, { mode: 0o755 });
const run = (ca, args, exit = 0, stock = false) => {
  const env = { ...process.env, TEST_EXIT_CODE: String(exit) };
  delete env.MOSSVALE_DB_CA_BASE64;
  if (ca !== undefined) env.MOSSVALE_DB_CA_BASE64 = ca;
  const mounts = ['--mount', `type=bind,source=${resolve(root, 'auth-theme/entrypoint.sh')},target=/entrypoint.sh,readonly`];
  if (!stock) mounts.push('--mount', `type=bind,source=${stub},target=/opt/keycloak/bin/kc.sh,readonly`, '--mount', `type=bind,source=${directory},target=/result`);
  return spawnSync('docker', ['run', '--pull=never', '--rm', ...mounts, '--env', 'MOSSVALE_DB_CA_BASE64', '--env', 'TEST_EXIT_CODE', '--entrypoint', '/bin/bash', image, '/entrypoint.sh', ...args], { env, encoding: 'utf8', timeout: 30000 });
};
try {
  const args = ['start', '--optimized', '--hostname=https://auth.example.test', 'space kept', 'literal-$value'];
  for (const ca of [undefined, '']) {
    const result = run(ca, args, 23);
    assert.equal(result.status, 23, result.stderr || result.error?.message);
    assert.deepEqual(result.stdout.split('\0').slice(0, -1), args);
    assert.equal(existsSync(join(directory, 'ca')), false);
  }
  const certificate = '-----BEGIN CERTIFICATE-----\nU3ludGhldGljIHRlc3QgY2VydGlmaWNhdGU=\n-----END CERTIFICATE-----\n';
  const encoded = Buffer.from(certificate).toString('base64');
  const valid = run(encoded, args);
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(valid.stdout.split('\0').slice(0, -1), args);
  assert.equal(readFileSync(join(directory, 'ca'), 'utf8'), certificate);
  assert.equal(readFileSync(join(directory, 'mode'), 'utf8').trim(), '600');
  assert.equal(valid.stderr, '');
  rmSync(join(directory, 'ca')); rmSync(join(directory, 'mode'));
  const malformed = run(`${encoded}!!!`, args);
  assert.equal(malformed.status, 1, malformed.stderr);
  assert.equal(malformed.stdout, '');
  assert.equal(malformed.stderr.trim(), 'Invalid database CA encoding.');
  assert.equal(existsSync(join(directory, 'ca')), false, 'Keycloak must not run after failed decoding');
  const stock = run(undefined, ['--version'], 0, true);
  assert.equal(stock.status, 0, stock.stderr);
  assert.match(stock.stdout, /Keycloak 26\.7\.3/);
  console.log('PASS: Keycloak image entrypoint decodes exact CA bytes with mode 600, rejects malformed input quietly, preserves arguments/exit codes, and runs the stock command without a CA.');
} finally { rmSync(directory, { recursive: true, force: true }); }
