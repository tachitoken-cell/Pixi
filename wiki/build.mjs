import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MONSTERS, WORLD_BOSSES } from '../src/bestiary.ts';
import { DUNGEONS } from '../src/dungeon.ts';
import { ZONES } from '../src/content.ts';
import { REGION_LEVEL_RANGES } from '../src/region-levels.ts';
import { TRAINING_DUMMY_RESET_MS } from '../src/training-dummies.ts';

const root = fileURLToPath(new URL('../', import.meta.url)), out = resolve(root, 'wiki-dist');
const compiled = await build({ entryPoints: [resolve(root, 'wiki/data.ts')], bundle: true, write: false, platform: 'node', format: 'esm' });
const { articles } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const link = (slug, label) => `<a href="/${slug}/">${escape(label)}</a>`;
const notes = JSON.parse(await readFile(resolve(root, 'wiki/patch-notes.json'), 'utf8'));
assert.ok(Array.isArray(notes) && notes.length, 'Patch notes must contain a release');
const noteIds = new Set();
const noteDate = note => `<time datetime="${note.date}">${new Date(`${note.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</time>`;
for (const note of notes) {
  assert.match(note.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid patch note ID');
  assert.ok(!noteIds.has(note.id), `Duplicate patch note: ${note.id}`); noteIds.add(note.id);
  assert.match(note.date, /^\d{4}-\d{2}-\d{2}$/, 'Patch note date must be YYYY-MM-DD (UTC)');
  assert.equal(new Date(`${note.date}T00:00:00Z`).toISOString().slice(0, 10), note.date, 'Invalid release date');
  for (const field of ['title', 'summary']) assert.ok(typeof note[field] === 'string' && note[field].trim(), `Missing patch ${field}`);
  assert.ok(Array.isArray(note.changes) && note.changes.length && note.changes.every(change => typeof change === 'string' && change.trim()), 'Patch notes need player-facing changes');
  assert.ok(Array.isArray(note.guides) && note.guides.every(slug => articles.some(article => article.slug === slug)), 'Unknown patch-note guide');
  if (note.revision) assert.match(note.revision, /^[a-f0-9]{40}$/, 'Invalid patch source revision');
}
notes.sort((a, b) => b.date.localeCompare(a.date));
const changes = note => `<ul>${note.changes.map(change => `<li>${escape(change)}</li>`).join('')}</ul>`;
articles.push({ slug: 'patch-notes', title: 'Patch notes', category: 'Updates', summary: 'Mossvale updates, newest first. Dates use UTC.',
  keywords: ['updates', 'changelog', 'release notes'],
  body: notes.map(note => `<h2>${escape(note.date)} — ${escape(note.title)}</h2><p>${escape(note.summary)}</p>${changes(note)}<p>${link(`patch-notes/${note.id}`, 'Permanent link')}</p>`).join('') });
for (const note of notes) articles.push({ slug: `patch-notes/${note.id}`, title: note.title, category: 'Updates', summary: note.summary,
  keywords: ['patch notes', 'update', note.date],
  body: `<p>Released ${noteDate(note)} (UTC).</p><h2>Changes</h2>${changes(note)}${note.guides.length ? `<h2>Related guides</h2><ul>${note.guides.map(slug => `<li>${link(slug, articles.find(article => article.slug === slug).title)}</li>`).join('')}</ul>` : ''}<p>${link('patch-notes', 'All patch notes')}</p>${note.revision ? `<p class="source-note">Release ${note.revision.slice(0, 7)}.</p>` : ''}` });
const find = slug => articles.find(article => article.slug === slug);
const nav = [['getting-started', 'Getting started'], ['monsters', 'Monsters'], ['dungeons', 'Dungeons'], ['leveling', 'Leveling'], ['classes', 'Classes & spells'], ['world', 'World & travel'], ['items-and-crafting', 'Items & crafting']];
for (const [slug] of nav) if (!find(slug)) throw new Error(`Missing navigation article: ${slug}`);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const date = new Date().toISOString().slice(0, 10);
const table = (headers, rows) => `<div class="table-scroll" role="region" aria-label="Scrollable reference table" tabindex="0"><table><thead><tr>${headers.map(h=>`<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const number = value => value.toLocaleString('en-US');
const searchIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg>';
const contract = '<!-- THESIS: A factual game encyclopedia with complete topic indexes and cross-linked reference articles. OWN-WORLD: Mossvale branding, muted green navigation, white article paper, readable serif headings and compact tables. STORY: Find a named entity and inspect its documented mechanics. FIRST VIEWPORT: Main-page title, topic links, class index and dungeon requirements; no promotional hero. FORM: Conventional wiki, explicit user correction supersedes seed 4062eb5b. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->';
const shell = (title, description, slug, content, noindex = false) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}${slug ? ' · Mossvale Wiki' : ''}</title><meta name="description" content="${escape(description)}">${noindex ? '<meta name="robots" content="noindex">' : ''}<link rel="canonical" href="https://wiki.mossvale.world/${slug ? `${slug}/` : ''}"><meta name="mossvale-source-revision" content="${revision}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:image" content="https://wiki.mossvale.world/ui/wordmark.png"><meta property="og:type" content="website"><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/style.css"><script type="module" src="/client.js"></script></head>
<body>${contract}<a class="skip" href="#main">Skip to content</a><aside class="sidebar"><a class="brand" href="/" aria-label="Mossvale Wiki home"><img src="/ui/wordmark.png" alt="Mossvale" width="190" height="90"><span>WIKI</span></a><details class="chapters" open><summary>Navigation</summary><nav aria-label="Wiki chapters"><a href="/" ${!slug ? 'aria-current="page"' : ''}>Main page</a><a href="/all-pages/" ${slug === 'all-pages' ? 'aria-current="page"' : ''}>All articles</a><a href="/patch-notes/" ${slug === 'patch-notes' ? 'aria-current="page"' : ''}>Patch notes</a><h2>Game reference</h2>${nav.map(([path, name]) => `<a href="/${path}/" ${slug === path ? 'aria-current="page"' : ''}>${escape(name)}</a>`).join('')}<h2>Mossvale</h2><a href="https://mossvale.world/">Play the game</a></nav></details></aside>
<div class="workspace"><header class="topbar"><a href="/">Mossvale Wiki</a><form class="search" action="/search/" role="search">${searchIcon}<label class="sr-only" for="wiki-search">Search the wiki</label><input id="wiki-search" name="q" type="search" placeholder="Search Mossvale Wiki" autocomplete="off"><button type="submit">Search</button></form></header><main id="main" tabindex="-1"><section class="search-results" hidden aria-label="Search results"><div class="search-heading"><h1>Search results</h1><button type="button" id="clear-search">Clear search</button></div><p id="search-status" role="status" aria-live="polite"></p><div id="results"></div></section><div class="page-content">${content}</div></main><footer><span>Mossvale Wiki · Updated ${date}</span><a href="/all-pages/">All articles</a><a href="https://mossvale.world/">Mossvale website</a></footer></div></body></html>`;
const classLinks = articles.filter(a=>a.slug.startsWith('class-'));
const overviewLinks = ['getting-started','combat-and-loot','leveling','contracts','professions','items-and-crafting','equipment','bags-and-bank','parties','travel','pets','achievements-and-titles','colosseum','story','audio-and-settings','treasure-maps','store'];
const articleList = values => `<ul class="link-list">${values.map(a=>`<li>${link(a.slug,a.title)}</li>`).join('')}</ul>`;
const home = `<nav class="breadcrumb" aria-label="Breadcrumb">Main page</nav><h1>Mossvale Wiki</h1><p class="lead">Reference for the creatures, dungeons, items and mechanics of <a href="https://mossvale.world/">Mossvale</a>.</p><nav class="topic-nav" aria-label="Main page contents">${[['basics','Game systems'],['dungeons','Dungeons'],['monsters','Monsters'],['world','World regions']].map(([s,t])=>`<a href="#${s}">${t}</a>`).join('')}<a href="/all-pages/">All ${articles.length} articles</a></nav>
<p>Latest update: ${noteDate(notes[0])} · ${link(`patch-notes/${notes[0].id}`, notes[0].title)} · ${link('patch-notes', 'All patch notes')}</p>
<div class="wiki-index"><section id="basics"><h2>Game systems</h2>${articleList(overviewLinks.map(find).filter(Boolean))}<h2>Character classes</h2><p>Each class has 31 trainable abilities, including its starting ability.</p><ul class="class-list">${classLinks.map(a=>`<li>${link(a.slug,a.title)}</li>`).join('')}</ul><p>${link('classes','Ability training and talents')} · ${link('equipment','Equipment by class')}</p></section>
<section id="dungeons"><h2>Dungeons</h2><p>Instanced encounters for one to four players. The minimum level is required for entry.</p>${table(['Dungeon','Entry level','Encounter levels'],DUNGEONS.map(d=>[link(`dungeon-${d.id}`,d.name),d.minLevel,`${d.minLevel}–${d.maxLevel}`]))}<p>${link('dungeons','Entry requirements, checkpoints and rewards')}</p><h2>World bosses</h2>${table(['Boss','Level','Location'],WORLD_BOSSES.map(b=>[link(`monster-${b.kind}`,b.name),MONSTERS[b.kind].level,link(`region-${b.regionId}`,find(`region-${b.regionId}`).title)]))}</section></div>
<section id="monsters"><h2>Monsters</h2><p>Creature pages include spawn locations, level variants, attacks and drop tables.</p><ul class="monster-directory">${Object.entries(MONSTERS).filter(([id])=>!WORLD_BOSSES.some(b=>b.kind===id)).map(([id,m])=>`<li><a href="/monster-${id}/"><img src="/assets/monsters/${id}.png" alt="" width="58" height="58" loading="lazy">${escape(m.name)}</a></li>`).join('')}</ul><p>${link('monsters','Full monster statistics')} · ${link('world-bosses','World boss mechanics')}</p></section>
<section id="world"><h2>World regions</h2><div class="region-directory">${ZONES.map(zone=>`<section><h3>${link(`region-${zone.id}`,zone.name)}</h3><p>Core region: levels ${REGION_LEVEL_RANGES[zone.id].min}–${REGION_LEVEL_RANGES[zone.id].max}</p>${articleList(articles.filter(a=>a.slug.startsWith('region-') && a.slug!==`region-${zone.id}` && a.keywords?.includes(zone.name)))}</section>`).join('')}</div><p>${link('world','All regions and level ranges')} · ${link('travel','Mounts and zeppelin routes')}</p></section>`;
const infobox = article => {
  const kind = article.slug.replace(/^monster-/, ''), monster = MONSTERS[kind];
  const dungeon = DUNGEONS.find(d=>`dungeon-${d.id}`===article.slug);
  if (!monster && !dungeon) return '';
  const boss = WORLD_BOSSES.find(b=>b.kind===kind);
  const training = kind === 'training-dummy';
  const rows = training ? [['Type','Training target'],['Maximum health',number(monster.hp)],['Minimum health',1],['Full recovery',`${TRAINING_DUMMY_RESET_MS / 1000} seconds without damage`],['Attacks','None'],['Rewards','None']] : monster ? [['Type',boss ? 'World boss' : 'Creature'],...(boss ? [['Level',monster.level]] : []),['Base health',number(monster.hp)],['Base damage',monster.damage],['Base kill XP',monster.xp],['Base loot gold',monster.gold],['Behavior',kind === 'treasure-goblin' ? 'Flees; does not attack' : monster.attackStyle]] : [['Minimum level',dungeon.minLevel],['Encounter levels',`${dungeon.minLevel}–${dungeon.maxLevel}`],['Party size','1–4'],['Completion XP',number(dungeon.completionXp)],['Entrance',`${dungeon.entrance.x}, ${dungeon.entrance.z}`]];
  return `<aside class="infobox" aria-label="${escape(article.title)} facts"><h2>${escape(article.title)}</h2>${monster ? `<img src="/assets/monsters/${kind}.png" alt="${escape(monster.name)} in-game model" width="320" height="320">` : ''}<dl>${rows.map(([key,value])=>`<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>${monster && !boss && !training ? `<p>${kind === 'treasure-goblin' ? 'Level and health vary with the region where it appears.' : 'Base values. See level variants below for spawned and dungeon statistics.'}</p>` : ''}</aside>`;
};
await rm(out,{recursive:true,force:true}); await mkdir(out,{recursive:true});
await writeFile(resolve(out,'index.html'),shell('Mossvale Wiki','Mossvale game reference: monsters, dungeons, leveling, classes, items and world regions.','',home));
for (const article of articles) {
  const headings = [], ids = new Set();
  const body = article.body.replace(/<h([23])(?:\s+id="([^"]+)")?>(.*?)<\/h\1>/g,(_,level,existing,text)=>{
    const base = existing || plain(text).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    let id=base; for(let i=2;ids.has(id);i++) id=`${base}-${i}`;
    ids.add(id); if(level==='2') headings.push([id,plain(text)]);
    return `<h${level} id="${escape(id)}">${text}<a class="heading-anchor" href="#${escape(id)}" aria-label="Link to ${escape(plain(text))}">#</a></h${level}>`;
  });
  const category = article.category === 'Updates' ? ['patch-notes', 'Patch notes'] : nav.find(([s])=>find(s).category===article.category);
  const content=`<article class="article"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Main page</a><span>/</span>${category ? link(category[0],category[1]) : escape(article.category)}</nav><h1>${escape(article.title)}</h1><p class="lead">${escape(article.summary)}</p>${infobox(article)}${headings.length ? `<nav class="contents" aria-label="Article contents"><h2>Contents</h2><ol>${headings.map(([id,title])=>`<li><a href="#${escape(id)}">${escape(title)}</a></li>`).join('')}</ol></nav>` : ''}<div class="prose">${body}</div><div class="article-category">Category: ${category ? link(category[0],category[1]) : escape(article.category)}</div><p class="source-note">${article.category === 'Updates' ? 'Historical release notes. Related guides describe current gameplay.' : `Game data from release ${revision.slice(0, 7)}. Rebuilt ${date}; guides are maintained alongside game changes.`}</p></article>`;
  await mkdir(resolve(out,article.slug),{recursive:true}); await writeFile(resolve(out,article.slug,'index.html'),shell(article.title,article.summary,article.slug,content));
}
const index=articles.map(({slug,title,summary,category,keywords=[],body})=>({slug,title,summary,category,text:`${keywords.join(' ')} ${plain(body)}`}));
await writeFile(resolve(out,'search-index.json'),JSON.stringify(index));
for(const slug of ['search','all-pages']){
  await mkdir(resolve(out,slug),{recursive:true});
  const title=slug==='search'?'Search the wiki':'All articles';
  const content=`<h1>${title}</h1>${slug==='search'?'<p class="lead">Enter a name or mechanic in the search field.</p><noscript><p>Search requires JavaScript. All articles are listed below.</p></noscript>':`<p class="lead">${articles.length} articles, listed alphabetically.</p>`}<ul class="all-pages">${[...articles].sort((a,b)=>a.title.localeCompare(b.title)).map(a=>`<li>${link(a.slug,a.title)} <span>${escape(a.category)}</span></li>`).join('')}</ul>`;
  await writeFile(resolve(out,slug,'index.html'),shell(title,title,slug,content,true));
}
await writeFile(resolve(out,'404.html'),shell('Page not found','This article does not exist.','404','<h1>Page not found</h1><p>This article does not exist. Check the page name, use search, or <a href="/all-pages/">browse all articles</a>.</p>',true));
await writeFile(resolve(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['',...articles.map(a=>`${a.slug}/`)].map(path=>`<url><loc>https://wiki.mossvale.world/${path}</loc></url>`).join('')}</urlset>`);
await writeFile(resolve(out,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://wiki.mossvale.world/sitemap.xml\n');
await writeFile(resolve(out,'_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'\n  Cache-Control: public, max-age=300\n`);
for(const name of ['style.css','client.js','assets']) await cp(resolve(root,'wiki',name),resolve(out,name),{recursive:true});
const images=new Set(['favicon.png','ui/wordmark.png']);
for(const article of articles) for(const match of article.body.matchAll(/src="\/(ui\/.*?)"/g)) images.add(match[1]);
for(const path of images){if(path.includes('..'))throw Error(`Invalid asset path ${path}`);await mkdir(resolve(out,path,'..'),{recursive:true});await cp(resolve(root,'public',path),resolve(out,path));}
await writeFile(resolve(out, 'release.json'), JSON.stringify({ revision, builtAt: date, latestPatch: notes[0].id, articleCount: articles.length }) + '\n');
console.log(`Built ${articles.length} wiki articles in ${out} from game ${revision}.`);
