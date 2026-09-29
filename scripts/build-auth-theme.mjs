import { build } from 'vite';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('artifacts/auth-theme/mossvale');
await rm(output, { recursive: true, force: true });
await cp('auth-theme/mossvale', output, { recursive: true });
const resources = resolve(output, 'login/resources');
await build({ configFile: false, publicDir: false, build: {
  outDir: resolve(resources, 'js'), emptyOutDir: false, minify: true,
  lib: { entry: resolve('src/login-scene.ts'), formats: ['es'], fileName: () => 'login-scene.js' },
} });
for (const file of ['models/creator-scene.glb', 'ui/wordmark.png', 'ui/wood-frame.png']) {
  await mkdir(resolve(resources, file, '..'), { recursive: true });
  await cp(resolve('public', file), resolve(resources, file));
}

// Keycloak's resource prefix stays the same across custom theme releases, while
// browsers and the CDN cache these URLs for a month. Version the actual content.
async function version(file) {
  const hash = createHash('sha256').update(await readFile(resolve(resources, file))).digest('hex').slice(0, 16);
  const name = file.replace(/(\.[^.]+)$/, `.${hash}$1`);
  await cp(resolve(resources, file), resolve(resources, name));
  return name;
}
const scene = await version('js/login-scene.js');
const bootstrap = resolve(resources, 'js/mossvale.js');
await writeFile(bootstrap, (await readFile(bootstrap, 'utf8')).replace('js/login-scene.js', scene));
const styles = await version('css/mossvale.css');
const scripts = await version('js/mossvale.js');
const embedded = await version('js/embedded.js');
const properties = resolve(output, 'login/theme.properties');
await writeFile(properties, (await readFile(properties, 'utf8'))
  .replace(/^styles=.*$/m, `styles=css/login.css ${styles}`)
  .replace(/^scripts=.*$/m, `scripts=${scripts}`)
  + `mossvaleEmbeddedScript=${embedded}\n`);
console.log('Built Mossvale theme with native Keycloak forms and local 3D assets.');
