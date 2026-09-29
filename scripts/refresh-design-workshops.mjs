import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SPELLS } from '../src/spells.ts';
import { TALENTS } from '../src/progression.ts';
import { TALENT_DESIGN } from '../src/talent-design.ts';
import { ICONS } from '../src/icons.ts';

// Keep downloaded/offline workshops in sync with the playable catalogs and art.
for (const kind of ['spell', 'talent']) {
  const path = new URL(`../public/${kind}-editor.html`, import.meta.url);
  let html = readFileSync(path, 'utf8');
  const script = id => new RegExp(`(<script id="${id}"[^>]*>)[\\s\\S]*?(</script>)`);
  const art = JSON.parse(html.match(script('art-data'))[0].replace(/^<script[^>]*>|<\/script>$/g, ''));
  const design = kind === 'talent' ? structuredClone(TALENT_DESIGN) : {
    schemaVersion: 1, workshop: 'spells', sourceRevision: '361cf1ba+spec-2026-09-28',
    documentId: 'mossvale-spell-2026-09-28-playable', title: 'Mossvale spell redesign',
    classes: ['Ranger', 'Knight', 'Mage', 'Cleric'].map(id => ({ id, name: id,
      spells: Object.values(SPELLS).filter(s => s.className === id).map(s => ({ ...s, notes: '' })) })),
  };
  if (kind === 'talent') for (const c of design.classes) for (const tree of c.trees) for (const node of tree.talents) {
    const talent = TALENTS[node.id];
    Object.assign(node, { ...talent, rank: 0, notes: '' });
    for (const key of ['className', 'branch', 'stats', 'spellBonuses', 'passiveBonuses', 'ability']) delete node[key];
  }
  const nodes = design.classes.flatMap(c => kind === 'spell' ? c.spells : c.trees.flatMap(t => t.talents));
  for (const { icon } of nodes) {
    if (ICONS[icon]) {
      const [atlas, slot, rows] = ICONS[icon];
      const file = [`ui/${atlas}.png`, `ui/${atlas}-v2.png`].find(f => existsSync(new URL(`../public/${f}`, import.meta.url)));
      if (!file) throw Error(`Missing artwork: ${icon}`);
      art.icons[icon] = { file, slot, rows };
      art.files[file] = `data:image/png;base64,${readFileSync(new URL(`../public/${file}`, import.meta.url)).toString('base64')}`;
    } else if (!art.icons[icon]) throw Error(`Missing embedded artwork: ${icon}`);
  }
  for (const [id, data] of [['baseline-data', design], ['design-data', design], ['art-data', art]])
    html = html.replace(script(id), (_, open, close) => open + JSON.stringify(data).replaceAll('<', '\\u003c') + close);
  writeFileSync(path, html);
  console.log(`Updated ${kind} workshop: ${nodes.length} entries.`);
}
