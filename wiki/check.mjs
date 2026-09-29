import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONSTERS, monsterSpawnLevel } from '../src/bestiary.ts';
import { DUNGEONS, ROOTVAULT_GUARDIAN } from '../src/dungeon.ts';
import { CHARACTER_CLASSES } from '../src/shared.ts';
import { RECIPES } from '../src/adventure.ts';
import { ACHIEVEMENTS } from '../src/achievements.ts';
import { TITLES } from '../src/titles.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { MAX_LEVEL, MAX_GEAR_UPGRADE } from '../src/progression.ts';
import { STORE_PRODUCTS } from '../src/ingame-store.ts';
import { WORLD_GATHERING_NODES } from '../src/gathering-nodes.ts';
import { RESOURCE_TYPES } from '../src/skills.ts';
import { surfaceAt } from '../src/landscape.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'wiki-dist');
const origin = 'https://wiki.mossvale.world';
execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--module', 'ESNext', '--target', 'ES2022', '--moduleResolution', 'Bundler', '--strict', '--skipLibCheck', '--allowImportingTsExtensions', resolve(root, 'wiki/data.ts')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root, 'wiki/build.mjs')], { cwd: root, stdio: 'inherit' });

const files = new Set((await readdir(out, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile()).map(entry => relative(out, resolve(entry.parentPath, entry.name))));
const pages = new Map();
const decode = text => text.replace(/&(?:amp|quot|apos|lt|gt|#39);/g, entity => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>' })[entity]);
const plain = html => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
for (const path of files) {
  if (!path.endsWith('.html')) continue;
  const html = await readFile(resolve(out, path), 'utf8');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => decode(match[1]));
  assert.equal(new Set(ids).size, ids.length, `${path}: duplicate element IDs`);
  assert.match(html, /<html\s+lang="en"/, `${path}: missing document language`);
  assert.match(html, /<title>[^<]+<\/title>/, `${path}: missing page title`);
  assert.match(html, /<meta name="description" content="[^"]+">/, `${path}: missing description`);
  assert.match(html, /<meta name="viewport"/, `${path}: missing viewport`);
  assert.ok(ids.includes('main') && /href="#main"/.test(html), `${path}: missing skip-link destination`);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i, `${path}: inline script violates CSP`);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${path}: inline event handler violates CSP`);
  pages.set(path, { html, ids: new Set(ids) });
}

let links = 0;
function checkReference(reference, from) {
  const basePath = from === 'index.html' ? '/' : `/${from.replace(/index\.html$/, '')}`;
  const url = new URL(decode(reference), `${origin}${basePath}`);
  assert.notEqual(url.protocol, 'javascript:', `${from}: executable URL`);
  if (url.origin !== origin) return;
  const path = decodeURIComponent(url.pathname).replace(/^\//, '');
  const target = path.endsWith('/') || !path ? `${path}index.html` : files.has(path) ? path : `${path}/index.html`;
  assert.ok(files.has(target), `${from}: broken local reference ${reference} (${target})`);
  if (url.hash) assert.ok(pages.get(target)?.ids.has(decodeURIComponent(url.hash.slice(1))), `${from}: missing fragment ${reference}`);
  links++;
}
for (const [path, { html }] of pages) {
  for (const tag of html.matchAll(/<[a-z][^>]*>/gi)) {
    if (/\brel="canonical"/.test(tag[0])) continue;
    for (const attr of tag[0].matchAll(/\b(?:href|src|action)=["']([^"']*)["']/g)) checkReference(attr[1], path);
  }
}
const css = await readFile(resolve(out, 'style.css'), 'utf8');
for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) checkReference(match[1], 'style.css');

const index = JSON.parse(await readFile(resolve(out, 'search-index.json'), 'utf8'));
assert.ok(Array.isArray(index) && index.length > 0, 'Search index must contain articles');
const slugs = new Set(index.map(article => article.slug));
assert.equal(slugs.size, index.length, 'Duplicate article slugs in search index');
for (const slug of ['getting-started', 'monsters', 'dungeons', 'leveling', 'classes', 'world', 'items-and-crafting']) assert.ok(slugs.has(slug), `Missing required guide: ${slug}`);
for (const article of index) {
  assert.match(article.slug, /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/, `Unsafe article slug: ${article.slug}`);
  for (const key of ['title', 'summary', 'category', 'text']) assert.ok(typeof article[key] === 'string' && article[key].trim(), `${article.slug}: empty search ${key}`);
  const page = pages.get(`${article.slug}/index.html`);
  assert.ok(page, `${article.slug}: missing rendered article`);
  const body = page.html.match(/<div class="prose">([\s\S]*?)<\/div>\s*<div class="article-category">/)?.[1];
  assert.ok(body && plain(body).length > 80, `${article.slug}: empty article body`);
  assert.doesNotMatch(plain(body), /\b(?:undefined|NaN|Infinity)\b/, `${article.slug}: invalid catalog value`);
  assert.match(page.html, /<link rel="canonical" href="https:\/\/wiki\.mossvale\.world\//, `${article.slug}: missing canonical URL`);
  assert.ok(page.html.includes(`href="${origin}/${article.slug}/"`), `${article.slug}: wrong canonical URL`);
  assert.doesNotMatch(page.html, /<meta name="robots" content="noindex">/, `${article.slug}: article must be indexable`);
}
assert.equal(pages.size, index.length + 4, 'Rendered articles and search index differ');
for (const path of ['search/index.html', 'all-pages/index.html', '404.html']) assert.match(pages.get(path)?.html || '', /<meta name="robots" content="noindex">/, `${path}: missing noindex`);

// Catalog checks below use game exports so newly added game content cannot silently disappear from the wiki.
assert.equal(index.filter(article => article.slug.startsWith('monster-')).length, Object.keys(MONSTERS).length, 'Monster catalog count differs from game');
assert.equal(index.filter(article => article.slug.startsWith('dungeon-')).length, DUNGEONS.length, 'Dungeon catalog count differs from game');
assert.equal(index.filter(article => article.slug.startsWith('class-')).length, CHARACTER_CLASSES.length, 'Class catalog count differs from game');
for (const [kind, monster] of Object.entries(MONSTERS)) assert.ok(index.some(article => article.slug === `monster-${kind}` && article.title === monster.name), `Missing monster article: ${monster.name}`);
for (const dungeon of DUNGEONS) assert.ok(index.some(article => article.slug === `dungeon-${dungeon.id}` && article.title === dungeon.name), `Missing dungeon article: ${dungeon.name}`);
for (const name of CHARACTER_CLASSES) assert.ok(index.some(article => article.slug === `class-${name.toLowerCase()}` && article.title === name), `Missing class article: ${name}`);

const portraits = new Set();
for (const kind of Object.keys(MONSTERS)) {
  const path = `assets/monsters/${kind}.png`, png = await readFile(resolve(out, path));
  assert.ok(pages.get(`monster-${kind}/index.html`).html.includes(`src="/${path}"`), `${kind}: missing monster portrait`);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${kind}: portrait is not a PNG`);
  assert.ok(png.readUInt32BE(16) >= 128 && png.readUInt32BE(20) >= 128, `${kind}: portrait is too small`);
  portraits.add(createHash('sha256').update(png).digest('hex'));
}
assert.equal(portraits.size, Object.keys(MONSTERS).length, 'Monster portraits must be distinct');
const trainingDummy = plain(pages.get('monster-training-dummy/index.html').html);
assert.match(trainingDummy, /100,000 HP/);
assert.match(trainingDummy, /cannot fall below 1 HP/);
assert.match(trainingDummy, /10 seconds without damage/);
assert.match(trainingDummy, /never attack back/);
assert.match(trainingDummy, /no XP, gold, loot, quest progress, contract progress or kill achievements/);
assert.doesNotMatch(trainingDummy, /Special attack|14 s|minimum repeat interval/);

// These original spawns deliberately fall outside their physical area's nominal range.
for (const area of ['violet-reach', 'shadewood']) {
  const row = [...pages.get('monster-root-warden/index.html').html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .find(match => match[1].includes(`href="/region-${area}/"`));
  const cells = [...(row?.[1] || '').matchAll(/<td>([\s\S]*?)<\/td>/g)].map(match => plain(match[1]));
  assert.equal(cells[1], String(monsterSpawnLevel(ROOTVAULT_GUARDIAN, area)), `${area}: report actual fixed Warden level, not regional range`);
}
const combat = plain(pages.get('combat-and-loot/index.html').html);
assert.match(combat, /min\(character level, monster level \+ 2\)/i, 'Gear eligibility must include both player and monster level caps');
assert.match(combat, /common and uncommon[^.]*highest[^.]*tier/i, 'Gear eligibility must explain the highest eligible tier');
assert.match(combat, /gear can drop again[^.]*equipped, carried, banked, auctioned or waiting to be collected/i, 'Gear eligibility must allow repeat drops regardless of other copies');
assert.match(combat, /each fixed drop is a separate item[^.]*sold to merchants, traded or auctioned/i, 'Repeat gear drops must remain separate sellable items');
const leveling = plain(pages.get('leveling/index.html').html);
assert.ok(leveling.includes(`Character level is capped at ${MAX_LEVEL}`), 'Guide must use the enforced character level cap');
assert.ok(leveling.includes(`at level ${MAX_LEVEL}, character XP stays at 0`), 'Character XP stops at the cap');
assert.doesNotMatch(leveling, /does not impose a level-60 cap/i);
const crafting = plain(pages.get('items-and-crafting/index.html').html);
for (const recipe of RECIPES) {
  assert.ok(crafting.includes(recipe.label), `Missing recipe: ${recipe.label}`);
  for (const item of Object.keys(recipe.itemCost ?? {})) assert.ok(crafting.includes(LOOT_ITEMS[item].label), `Missing carried ingredient: ${item}`);
  if (recipe.output.item) assert.ok(crafting.includes(`${recipe.output.quantity} × ${LOOT_ITEMS[recipe.output.item].label}`), `Wrong crafted item output: ${recipe.id}`);
  if (recipe.output.resource && recipe.output.resource !== 'potion') assert.ok(crafting.includes(`${recipe.output.quantity} × ${recipe.output.resource}`), `Wrong crafted resource output: ${recipe.id}`);
}
assert.match(crafting, /Crafting level Character level/, 'Recipes must distinguish profession and character requirements');
for (const slug of ['professions', 'profession-mining', 'profession-woodcutting', 'profession-herbalism', 'profession-fishing', 'items-and-crafting']) {
  assert.match(plain(pages.get(`${slug}/index.html`).html), /mastered work 0%/i, `${slug}: must explain difficulty-adjusted XP`);
}
const fishingLocations = plain(pages.get('profession-fishing/index.html').html.split('id="locations-by-resource"')[1].split('</table>')[0]);
for (const kind of ['brook-shoal', 'silver-shoal', 'glacial-shoal', 'moonfin-shoal']) {
  const count = WORLD_GATHERING_NODES.filter(node => node.kind === kind).length;
  assert(count > 0 && fishingLocations.includes(`${RESOURCE_TYPES[kind].label} ${count}`), `${kind}: fishing guide must list every generated shoal`);
}
for (const node of WORLD_GATHERING_NODES.filter(node => node.siteId)) {
  const region = surfaceAt(node.x, node.z).regionId;
  const page = pages.get(`region-${region}/index.html`);
  if (['slimefen', 'sugarbloom'].includes(region)) assert(plain(page.html).includes(`${node.x}, ${node.z}`), `${node.id}: biome guide must include its rich gathering site`);
}
const achievements = plain(pages.get('achievements-and-titles/index.html').html);
for (const entry of [...ACHIEVEMENTS, ...TITLES]) assert.ok(achievements.includes(entry.name) && achievements.includes(entry.description), `Missing achievement or title: ${entry.name}`);
const arenaGuide = plain(pages.get('colosseum/index.html').html);
assert.match(arenaGuide, /Every fighter must individually accept the 30-second ready check/, 'Queue entry must not imply consent to a match');
assert.match(arenaGuide, /Solo, 2v2 and 3v3 records/, 'Rated brackets have separate progression');
assert.match(arenaGuide, /100%, 75%, 50%, 25% and 0%/, 'Arena guide explains chained-stun protection');

const notes = JSON.parse(await readFile(resolve(root, 'wiki/patch-notes.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(out, 'release.json'), 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(manifest.revision, revision, 'Wiki must identify its exact source revision');
assert.equal(manifest.articleCount, index.length);
assert.equal(manifest.latestPatch, [...notes].sort((a, b) => b.date.localeCompare(a.date))[0].id);
const patchIndex = pages.get('patch-notes/index.html').html;
for (const note of notes) {
  const slug = `patch-notes/${note.id}`;
  assert.ok(index.some(article => article.slug === slug && article.text.includes(note.date)), `${slug}: missing searchable release`);
  assert.ok(patchIndex.includes(`href="/${slug}/"`), `${slug}: missing permanent link`);
  const html = pages.get(`${slug}/index.html`).html;
  assert.ok(html.includes(`<time datetime="${note.date}">`), `${slug}: missing release date`);
  for (const change of note.changes) assert.ok(plain(html).includes(change), `${slug}: missing change`);
}
assert.ok(pages.get('index.html').html.includes(`href="/patch-notes/${manifest.latestPatch}/"`), 'Homepage must link the latest update');
for (const { html } of pages.values()) {
  assert.ok(html.includes('href="/patch-notes/"'), 'Every page must link patch notes');
  assert.ok(html.includes(`name="mossvale-source-revision" content="${revision}"`), 'All pages must match the build revision');
}
for (const slug of ['treasure-maps', 'store']) assert.ok(slugs.has(slug), `Missing current guide: ${slug}`);
const store = plain(pages.get('store/index.html').html);
for (const product of STORE_PRODUCTS) assert.ok(store.includes(product.name), `Missing store reward: ${product.name}`);
assert.ok(plain(pages.get('equipment/index.html').html).includes(`capped at +${MAX_GEAR_UPGRADE}`));
assert.match(plain(pages.get('monster-treasure-goblin/index.html').html), /Flees; does not attack/);
assert.match(plain(pages.get('pets/index.html').html), /Store companions/);
const travel = plain(pages.get('travel/index.html').html);
assert.match(travel, /Mossvale Mounts/);
assert.match(travel, /Briar Horse and Moonfang Wolf.*cannot be minted/);
assert.match(travel, /including adventurers who already own or have learned the mount/);
assert.match(travel, /mount item to your personal boss loot/);
for (const slug of ['travel', 'monster-veiled-abbess', 'dungeon-veilhaven']) assert.doesNotMatch(plain(pages.get(`${slug}/index.html`).html), /existing owners do not roll again|unlocks the mount directly|directly into your character’s collection/);
assert.match(plain(pages.get('contracts/index.html').html), /does not start the repeat delay/);
assert.match(plain(pages.get('parties/index.html').html), /Who tab in Friends/);
assert.match(plain(pages.get('colosseum/index.html').html), /search from anywhere, even in combat/);
assert.match(plain(pages.get('audio-and-settings/index.html').html), /Show FPS and Show ping/);

const sitemap = await readFile(resolve(out, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
assert.equal(new Set(urls).size, urls.length, 'Duplicate sitemap URLs');
assert.deepEqual(new Set(urls), new Set([`${origin}/`, ...index.map(article => `${origin}/${article.slug}/`)]), 'Sitemap must cover every public article exactly once');
assert.ok((await readFile(resolve(out, 'robots.txt'), 'utf8')).includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt must advertise sitemap');
const headers = await readFile(resolve(out, '_headers'), 'utf8');
for (const directive of ['X-Content-Type-Options: nosniff', "default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'"]) assert.ok(headers.includes(directive), `Missing security header: ${directive}`);
assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/, 'CSP must not allow inline scripts or eval');
console.log(`Wiki integrity passed: ${index.length} articles, ${Object.keys(MONSTERS).length} monsters, ${DUNGEONS.length} dungeons, ${CHARACTER_CLASSES.length} classes, ${links} local references.`);
