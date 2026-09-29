import { defineConfig } from 'vite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export default defineConfig({
  esbuild: { tsconfigRaw: readFileSync(new URL('./tsconfig.json', import.meta.url), 'utf8') },
  server:{host:'0.0.0.0',port:5173,proxy:{'/socket':{target:'ws://127.0.0.1:2567',ws:true},'/api':'http://127.0.0.1:2567','/wallet-oidc':'http://127.0.0.1:2567'}},
  build: { rollupOptions: { input: { game: resolve('index.html'), authCallback: resolve('auth-callback.html'), wallet: resolve('wallet-login.html'), walletAction: resolve('wallet-action.html'), account: resolve('account.html'), support: resolve('support.html'), privacy: resolve('privacy.html'), pets: resolve('pet-preview.html'), professions: resolve('professions-preview.html') } } },
  plugins: [{
    name: 'mossvale-update-cache', apply: 'build',
    writeBundle(options) {
      const dist = resolve(options.dir), template = readFileSync(new URL('./scripts/service-worker.js', import.meta.url), 'utf8');
      const files = ['index.html', 'favicon.png', ...readdirSync(resolve(dist, 'assets')).map(name => `assets/${name}`), ...readdirSync(resolve(dist, 'models')).filter(name => name.endsWith('.glb')).map(name => `models/${name}`)];
      files.push('animations/benji-upgrade-poses.json');
      const ui = new Set(['ui/wordmark.png']);
      for (const file of files.filter(file => file.endsWith('.css'))) {
        for (const match of readFileSync(resolve(dist, file), 'utf8').matchAll(/url\(["']?(\/ui\/[^)"']+)["']?\)/g)) ui.add(match[1].slice(1));
      }
      files.push(...ui);
      const hashes = Object.fromEntries(files.sort().map(file => [file === 'index.html' ? '/' : `/${file}`, createHash('sha256').update(readFileSync(resolve(dist, file))).digest('hex')]));
      const build = createHash('sha256').update(template).update(JSON.stringify(hashes)).digest('hex').slice(0, 16);
      writeFileSync(resolve(dist, 'sw.js'), template.replace('__BUILD__', build).replace('__FILES__', JSON.stringify(hashes)));
    },
  }],
});
