import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url), out = new URL('../stats-dist/', import.meta.url);
const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('Stats build requires a full source revision.');
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
const assets = [];
for (const [target, source] of Object.entries({ 'index.html': 'stats/index.html', 'style.css': 'stats/style.css', 'client.js': 'stats/client.js', 'wordmark.png': 'public/ui/wordmark.png', 'favicon.png': 'public/favicon.png', 'marcellus.ttf': 'wiki/assets/marcellus.ttf', 'OFL.txt': 'wiki/assets/OFL.txt' })) {
  let bytes = await readFile(new URL(source, root));
  if (target === 'index.html') bytes = Buffer.from(bytes.toString().replaceAll('__REVISION__', revision));
  await writeFile(new URL(target, out), bytes);
  assets.push({ path: `/${target}`, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(new URL('404.html', out), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Mossvale statistics</title><link rel="stylesheet" href="/style.css"><main><h1>Page not found</h1><p><a href="/">Return to Mossvale statistics</a>.</p></main></html>');
await writeFile(new URL('robots.txt', out), 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://stats.mossvale.world/sitemap.xml\n');
await writeFile(new URL('sitemap.xml', out), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://stats.mossvale.world/</loc></url></urlset>');
await writeFile(new URL('_headers', out), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\'; font-src \'self\'; connect-src \'self\'; object-src \'none\'; base-uri \'none\'; frame-ancestors \'none\'\n');
await writeFile(new URL('release.json', out), JSON.stringify({ revision, assets }));
console.log(`Built Mossvale statistics at ${fileURLToPath(out)} (${revision.slice(0, 7)})`);
