import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { ICONS, MENU_ICONS, BENJI_MENU_ICONS, BENJI_RESOURCE_ICONS, SPELL_ICON_ATLASES, TALENT_ICON_SOURCES, icon } from '../src/icons.ts';
import { CHAPTERS, ZONES } from '../src/content.ts';
import { SPELLS, RETIRED_SPELLS, defaultHotbar } from '../src/spells.ts';
import { SKILLS } from '../src/skills.ts';
import { GEAR, TALENTS, EQUIPMENT_SLOTS, starterGear } from '../src/progression.ts';

if (process.argv.includes('--redesign-only')) {
  populatedCells('/ui/spells-redesign.png', 4, 4, new Set(Array.from({length:13}, (_, slot) => slot)));
  console.log('PASS: thirteen distinct Blender icon cells with transparent padding; three unused cells remain transparent.');
  process.exit(0);
}

const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { gearArt, renderGear, BENJI_ITEM_ICONS } = await import('../src/character-ui.ts');
const { renderTalents } = await import('../src/progression-ui.ts');
const { renderHotbar, renderSpellbook } = await import('../src/hotbar.ts');
hook.deregister();

const used = new Set();
const suppliedIcons = JSON.parse(readFileSync(new URL('../docs/design/ui-2026-09-27/source-sha256.json',import.meta.url),'utf8'));
assert.equal(Object.keys(MENU_ICONS).length,18,'all supplied navigation icons are mapped');
assert.equal(new Set(Object.values(MENU_ICONS)).size,18,'navigation actions have distinct supplied artwork');
for(const [name,file] of Object.entries(MENU_ICONS)){
  const path=`/ui/navigation/${file}.png`,png=readFileSync(new URL('../public'+path,import.meta.url));
  assert.equal(png.readUInt32BE(16),64);assert.equal(png.readUInt32BE(20),64);
  assert.equal(createHash('sha256').update(png).digest('hex'),suppliedIcons[`icons/${file}.png`],'supplied pixels and filenames stay intact');
  assert(icon('menu-'+name).includes(`src="${BENJI_MENU_ICONS[name]?`/ui/benji-2026-09-28/icons/${BENJI_MENU_ICONS[name]}.png`:path}"`),'navigation icon is routed to the supplied PNG');
}
const latestIcons=JSON.parse(readFileSync(new URL('../docs/design/ui-2026-09-28/source-sha256.json',import.meta.url),'utf8'));
for(const file of new Set([...Object.values(BENJI_MENU_ICONS),...Object.values(BENJI_RESOURCE_ICONS),...Object.values(BENJI_ITEM_ICONS)])){
  const path=`icons/${file}.png`,png=readFileSync(new URL('../public/ui/benji-2026-09-28/'+path,import.meta.url));
  assert.equal(createHash('sha256').update(png).digest('hex'),latestIcons[path].sha256,'September 28 runtime artwork preserves supplied pixels: '+path);
}
const requireIcon = name => { assert(Object.hasOwn(ICONS, name) || existsSync(new URL('../public'+(icon(name).match(/src="([^"]+)"/)?.[1]||'/missing'),import.meta.url)), `Missing icon: ${name}`); used.add(name); };
const gearIconAssets = new Map(Object.values(GEAR).filter(gear => gear.icon).map(gear => [gear.icon, gearArt(gear).match(/src="([^"]+)"/)?.[1]]));
const literals = expression => [...expression.matchAll(/(?:^\s*|[?:]|\|\|)\s*(['"])([\w-]+)\1/g)].map(match => match[2]);
if(!process.argv.includes('--menus-only')) for (const file of readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  for (const match of source.matchAll(/\b(?:icon|art|primaryIcon|specialIcon):\s*['"]([\w-]+)['"]/g)) {
    const gearAsset = file === 'progression.ts' && gearIconAssets.get(match[1]);
    if (gearAsset) assert(existsSync(new URL('../public' + gearAsset, import.meta.url)), `Missing rendered gear artwork: ${match[1]}`);
    else requireIcon(match[1]);
  }
  for (const match of source.matchAll(/\bicon\s*\(/g)) {
    const start = match.index + match[0].length;
    let end = start, depth = 1, quote = '';
    for (; end < source.length; end++) {
      const c = source[end];
      if (quote) { if (c === '\\') end++; else if (c === quote) quote = ''; continue; }
      if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0 || c === ',' && depth === 1) break;
    }
    for (const name of literals(source.slice(start, end))) requireIcon(name);
  }
}
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8').match(/<nav\b[^>]*aria-label="Game menus"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert(menu, 'the actual game menu markup must be checked');
const menuButtons = [...menu.matchAll(/<button\b([^>]+)>([\s\S]*?)<\/button>/g)];
assert.deepEqual(menuButtons.map(([, attributes]) => attributes.match(/\bid="([^"]+)"/)[1]).sort(), ['inventory', 'journal', 'customize', 'spells', 'talents', 'crafting', 'arena', 'achievements', 'friends', 'account', 'settings'].map(id => `${id}-button`).sort(), 'every shipped player menu is covered');
const menuArt = menuButtons.map(([, attributes, body]) => {
  assert(/aria-label="[^"]+"/.test(attributes) && /title="[^"]+"/.test(attributes), 'icon-only menus retain accessible labels and tooltips');
  const name = body.match(/\$\{icon\('([^']+)'\)\}/)?.[1], path = body.match(/<img\b[^>]*src="([^"]+)"/)?.[1];
  assert(name || path, 'every menu button contains artwork');
  if (name) { requireIcon(name); return icon(name); }
  assert(existsSync(new URL(`../public${path}`, import.meta.url)), `${path} exists`);
  return path;
});
const gmIcon = main.match(/gmButton\.innerHTML\s*=\s*icon\('([^']+)'\)/)?.[1];
assert.equal(gmIcon, 'crown', 'the GM menu uses its crown artwork');
menuArt.push(icon(gmIcon));
const iconOnlyArt = menuArt.filter((_, index) => !/<span>[^<]+<\/span>/.test(menuButtons[index]?.[2] || ''));
assert.equal(new Set(iconOnlyArt).size, iconOnlyArt.length, 'icon-only menus render distinct artwork, including GM; Arena has a visible label');
console.log(`PASS: ${menuButtons.length + 1} game menus have artwork; icon-only menus remain distinct and player menus retain labels and tooltips.`);
if (process.argv.includes('--menus-only')) process.exit(0);
const skillsUI = readFileSync(new URL('../src/skills-ui.ts', import.meta.url), 'utf8');
for (const [source, registry, keys] of [[main, 'zoneIcons', ZONES.map(zone => zone.id)], [main, 'nodeIcons', [...new Set(CHAPTERS.flatMap(chapter => chapter.objectives.filter(objective => objective.kind === 'gather').map(objective => objective.target)))]], [skillsUI, 'professionIcons', Object.keys(SKILLS)]]) {
  const body = source.match(new RegExp(`const ${registry}[^=]*=\\s*\\{([^}]+)\\}`))?.[1];
  assert(body, `${registry} registry must be checked`);
  const entries = Object.fromEntries([...body.matchAll(/(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*['"]([\w-]+)['"]/g)].map(m => [m[1] || m[2] || m[3], m[4]]));
  for (const key of keys) { assert(entries[key], `${registry} is missing ${key}`); requireIcon(entries[key]); }
}
const objective = main.match(/const objectiveIcon[^;\n]*?=>\s*([^;\n]+)/)?.[1];
assert(objective, 'dynamic objective icons must be checked');
literals(objective).forEach(requireIcon);

const actions = readFileSync(new URL('../src/player-menu.ts', import.meta.url), 'utf8').match(/const actions\s*=\s*\{([^}]+)\}/)?.[1];
assert(actions, 'player action mapping must be checked');
const actionIcons = [...actions.matchAll(/\[\s*['"][^'"]+['"]\s*,\s*['"]([\w-]+)['"]\s*\]/g)].map(match => match[1]);
assert.equal(actionIcons.length, 13, 'inspect, invite, passenger ride, trade, whisper, friend, ignore, report, duel, all three arenas and GM have art');
actionIcons.forEach(requireIcon);

const spells = Object.values(SPELLS), classes = [...new Set(spells.map(spell => spell.className))];
for (const spell of spells) requireIcon(spell.icon);
for(const spell of spells)assert(ICONS[spell.icon],`${spell.id}: active ability resolves a registered icon`);
assert.equal(new Set(spells.filter(spell => !spell.requiredTalent).map(spell => ICONS[spell.icon].slice(0,2).join(':'))).size, spells.filter(spell=>!spell.requiredTalent).length, 'active trainer lessons retain distinct atlas slots');
for (const spell of spells.filter(spell => TALENT_ICON_SOURCES[spell.id] && !['spells-september28','spells-redesign'].includes(ICONS[spell.icon][0]))) assert.deepEqual(ICONS[spell.icon], ICONS[`spell-${TALENT_ICON_SOURCES[spell.id]}`], 'additional spells reuse explicit matching artwork');
for (const [className, ids] of Object.entries(SPELL_ICON_ATLASES)) {
  assert.equal(ids.length, 31, `${className} has 31 authored spell icons`);
  ids.forEach((id, slot) => {
    assert.equal((SPELLS[id]??RETIRED_SPELLS[id]).className.toLowerCase(), className, `${id} is on its class sheet`);
    assert.deepEqual(ICONS[`spell-${id}`], [`spells-${className}`, slot, 8]);
  });
}
assert.equal(SPELLS.fireball.icon, 'spell-fireball', 'Fireball uses its distinct orange flame artwork');
assert.deepEqual(ICONS.arrow, ['functions', 12, 4], 'navigation arrows retain their existing artwork');
assert.notEqual(icon('arrow'), icon(SPELLS.arrow.icon), 'Quick Shot cannot replace navigation arrows');
const adventureNames = ['power-shot', 'multishot', 'poison-shot', 'fireball', 'frostbolt', 'arcane-burst', 'meteor', 'cleave', 'shockwave', 'shield-bash', 'mining', 'woodcutting', 'herbalism', 'inspect', 'invite', 'trade', 'whisper', 'crafting', 'skill-tree', 'interact'];
adventureNames.forEach((name, slot) => assert.deepEqual(ICONS[name], ['adventure', slot, 5], `${name} matches its authored atlas cell`));
for (const className of classes) {
  const player = { name: 'Icon check', appearance: { className }, level: 20, hp: 100, maxHp: 100, gold: 0, talents: [], inventory: { potion: 3 }, ...starterGear(className) };
  const book = renderSpellbook(player, defaultHotbar(className, 20)), bar = renderHotbar(defaultHotbar(className, 20), player), tree = renderTalents(player);
  for (const spell of spells.filter(spell => spell.className === className)) {
    const entry = book.match(new RegExp(`<button\\b[^>]*data-book-ability="${spell.id}"[^>]*>([\\s\\S]*?)<\\/button>`))?.[1];
    assert(entry?.includes(icon(spell.icon)), `${spell.label} actually renders its catalog artwork in the spellbook`);
    if(defaultHotbar(className,20).includes(spell.id)) assert(bar.includes(icon(spell.icon)), `${spell.label} appears with artwork in the default hotbar`);
  }
  for (const talent of Object.values(TALENTS).filter(talent => talent.className === className)) {
    const entry = tree.match(new RegExp(`<button\\b[^>]*data-learn-talent="${talent.id}"[^>]*>([\\s\\S]*?)<\\/button>`))?.[1];
    assert((entry?.includes('item-art atlas-') || entry?.includes('/ui/cleric/')) && !entry.includes(icon('help')), `${talent.label} renders real artwork rather than a missing-icon fallback`);
  }
  const equipment = renderGear(player);
  for (const slot of EQUIPMENT_SLOTS.filter(slot => !player.equipment[slot])) {
    const entry = equipment.match(new RegExp(`data-gear-slot="${slot}"[\\s\\S]*?<button\\b[^>]*>([\\s\\S]*?)<\\/button>`))?.[1];
    const model = slot === 'charm' ? 'necklace' : slot.startsWith('ring') ? 'ring' : `${className.toLowerCase()}-${slot}`;
    assert(entry?.includes(`src="/ui/gear/${model}.png"`), `${className} empty ${slot} uses its equipment silhouette`);
  }
}
assert(gearArt(GEAR['mage-staff']).includes(icon('spark')), 'Mage equipment uses staff artwork rather than a spell projectile');

// Decode only the noninterlaced 8-bit alpha PNG format used by our assets.
// Native zlib plus PNG's five scanline filters keeps this check dependency-free.
function pngPixels(path) {
  const png = readFileSync(new URL(`../public${path}`, import.meta.url));
  assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${path} is a PNG`);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), type = png[25], channels = type === 6 ? 4 : 2;
  assert(type === 6 || type === 4, `${path} preserves an alpha channel`);
  assert.equal(png[24], 8, `${path} uses eight-bit pixels`); assert.equal(png[28], 0, `${path} uses ordinary scanlines`);
  const chunks = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    assert(at + length + 12 <= png.length, `${path} contains complete PNG chunks`);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const stride = width * channels, raw = inflateSync(Buffer.concat(chunks)), pixels = Buffer.alloc(height * stride);
  assert.equal(raw.length, height * (stride + 1), `${path} has complete pixel data`);
  const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  let at = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++]; assert(filter <= 4, `${path} has a known PNG filter`);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? pixels[i - channels] : 0, b = y ? pixels[i - stride] : 0, c = y && x >= channels ? pixels[i - stride - channels] : 0;
      pixels[i] = raw[at++] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c)) & 255;
    }
  }
  return { width, height, channels, pixels };
}
function populatedCells(path, columns, rows, usedSlots = new Set(Array.from({ length: columns * rows }, (_, slot) => slot))) {
  const { width, height, channels, pixels } = pngPixels(path), counts = Array(columns * rows).fill(0);
  const spellSheet = path.startsWith('/ui/spells-');
  const illustrations = new Set();
  assert(width / columns >= 48 && height / rows >= 48, `${path} cells have enough pixels for 48px icons`);
  assert(Math.abs(width / columns - height / rows) <= 1, `${path} has square cells`);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * channels + channels - 1] > 32) counts[Math.floor(y * rows / height) * columns + Math.floor(x * columns / width)]++;
  }
  counts.forEach((count, cell) => {
    const coverage = count / (width * height / (columns * rows));
    if (!usedSlots.has(cell)) {
      assert.equal(count, 0, `${path} unused cell ${cell} stays transparent`);
      return;
    }
    assert(coverage > .01, `${path} cell ${cell} contains visible artwork`);
    assert(coverage < .99, `${path} cell ${cell} retains transparent padding`);
    if (spellSheet) {
      const x0 = Math.ceil(cell % columns * width / columns), x1 = Math.ceil((cell % columns + 1) * width / columns);
      const y0 = Math.ceil(Math.floor(cell / columns) * height / rows), y1 = Math.ceil((Math.floor(cell / columns) + 1) * height / rows);
      const hash = createHash('sha256');
      for (let y = y0; y < y1; y++) hash.update(pixels.subarray((y * width + x0) * channels, (y * width + x1) * channels));
      const digest = hash.digest('hex');
      assert(!illustrations.has(digest), `${path} cell ${cell} is not copied artwork`);
      illustrations.add(digest);
    }
  });
  if (spellSheet) {
    assert.equal(illustrations.size, usedSlots.size, `${path} contains distinct images for every used slot`);
    const file = path.split('/').at(-1);
    if(!['/ui/spells-redesign.png', '/ui/spells-september28.png'].includes(path)) assert(readFileSync(new URL(`../public${path}`, import.meta.url)).equals(readFileSync(new URL(`../assets/source/${file.replace('.png', '-generated.png')}`, import.meta.url))), `${path} preserves the original generated pixels and alpha`);
  }
}

const sheets = new Map();
const css = readFileSync(new URL('../src/art.css', import.meta.url), 'utf8');
for (const [name, [atlas, slot, rows]] of Object.entries(ICONS)) {
  assert(/^[a-z][a-z0-9-]*$/.test(atlas), `${name} references a safe atlas name`);
  assert(Number.isInteger(rows) && rows > 1 && Number.isInteger(slot) && slot >= 0 && slot < 4 * rows, `${name} has a valid atlas cell`);
  assert(!sheets.has(atlas) || sheets.get(atlas).rows === rows, `${atlas} uses one consistent row count`);
  const html = icon(name);
  assert(html.includes(`atlas-${atlas}`) && html.includes('aria-hidden="true"') && !/NaN|undefined/.test(html), `${name} renders a valid decorative icon`);
  const rule = css.match(new RegExp(`\\.item-art\\.atlas-${atlas}\\s*\\{([^}]+)\\}`))?.[1];
  const path = rule?.match(/background-image:\s*url\(['"]?(\/ui\/[\w/-]+\.png)['"]?\)/)?.[1];
  assert(path && new RegExp(`background-size:\\s*400%\\s+${rows * 100}%`).test(rule), `${atlas} CSS matches its registry and PNG`);
  const slots = sheets.get(atlas)?.slots || new Set();
  slots.add(slot);
  sheets.set(atlas, { rows, path, slots });
}
for (const { path, rows, slots } of sheets.values()) populatedCells(path, 4, rows, slots);
const gearPaths = new Set();
for (const gear of Object.values(GEAR)) {
  const html = gearArt(gear), path = html.match(/src="([^"<>]+)"/)?.[1];
  if (gear.icon || gear.model) {
    assert.equal(path, `/ui/gear/${encodeURIComponent(gear.icon ?? gear.model)}.png`, `${gear.label} renders its actual thumbnail`);
    gearPaths.add(path);
  } else {
    assert(html.includes('item-art atlas-') && !html.includes(icon('help')), `${gear.label} has a real weapon or slot illustration`);
  }
}
for (const path of gearPaths) populatedCells(path, 1, 1);
assert(used.size >= 30, 'UI coverage must include literal and dynamic icon references');
console.log(`PASS: ${used.size} referenced icons, ${spells.length} spells with valid artwork, ${Object.keys(TALENTS).length} talent nodes, ${Object.keys(GEAR).length} gear entries; ${sheets.size} populated PNG atlases and ${gearPaths.size} visible gear thumbnails.`);
