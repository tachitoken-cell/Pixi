import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await import('./build-auth-theme.mjs');
const resources = resolve('artifacts/auth-theme/mossvale/login/resources');
const properties = Object.fromEntries((await readFile(resolve(resources, '../theme.properties'), 'utf8'))
  .split('\n').filter(line => /^[\w.]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
async function asset(file) {
  assert.match(file, /^(?:css|js)\/[\w-]+\.[a-f0-9]{16}\.(?:css|js)$/, 'Custom theme assets must bypass previously cached stable URLs');
  const content = await readFile(resolve(resources, file));
  assert.equal(file.split('.').at(-2), createHash('sha256').update(content).digest('hex').slice(0, 16), 'Filename hash describes the final built content');
  return content.toString();
}
const [parentStyles, customStyles] = properties.styles.split(' ');
assert.equal(parentStyles, 'css/login.css', 'Keycloak parent styles remain available');
const css = await asset(customStyles);
assert.equal(css, await readFile('auth-theme/mossvale/login/resources/css/mossvale.css', 'utf8'));
assert.match(css, /--mossvale-embedded-layout:\s*compact-v1/);
const bootstrap = await asset(properties.scripts);
const scene = bootstrap.match(/new URL\('(js\/login-scene\.[a-f0-9]{16}\.js)', resources\)/)?.[1];
assert(scene, 'The scene module import also bypasses its previously cached stable URL');
await asset(scene);
const embedded = await asset(properties.mossvaleEmbeddedScript);
assert.equal(embedded, await readFile('auth-theme/mossvale/login/resources/js/embedded.js', 'utf8'));
assert(bootstrap.includes("classList.contains('mossvale-embedded')"), 'The fresh scene bootstrap skips embedded forms');
console.log('PASS: built theme references matching content-hashed CSS, scripts and scene module.');
