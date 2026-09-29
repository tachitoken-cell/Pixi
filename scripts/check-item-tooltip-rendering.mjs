import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { GEAR, gearById, gearStatBreakdown, gearSetBonuses, PRIMARY_ATTRIBUTES, ATTRIBUTE_EFFECTS, rollGear, starterGear, gearUpgradeQuote, equippedAttributes } = await import('../src/progression.ts');
const { renderItemTooltip, renderGearRollDetails } = await import('../src/item-tooltip.ts');
const { renderItemDetails, renderBackpack, renderGear } = await import('../src/character-ui.ts');
const { gearSellPrice } = await import('../src/merchants.ts');
hook.deregister();
const player = { name: 'Tooltip reader', level: 60, hp: 90, maxHp: 100, gold: 100000, talents: [], appearance: { className: 'Mage' }, inventory: { wood: 500, crystal: 500, herb: 500, relic: 500, potion: 2 }, ...starterGear('Mage'), ownedBags: [{ id: 'owned-bag', kind: 'linen-pouch' }] };
const gear = rollGear('starfall-staff', 'mythic', () => .42);
const html = renderItemTooltip(gear.id, player);
assert(html.includes(gear.label) && html.includes('quality-mythic') && html.includes(`Item Level ${gear.requiredLevel}`));
assert(html.includes('Attack interval 2.40s') && html.includes('Staff'));
assert(html.includes(`Requires Level ${gear.requiredLevel}`) && html.includes('Calling: Mage'));
assert(html.includes(`Sell Price: <span class="item-sheet-gold">${gearSellPrice(gear.id).toLocaleString('en-US')}`));
for (const attribute of PRIMARY_ATTRIBUTES.filter(key => gear.stats[key])) assert(html.includes(`+${gear.stats[attribute]} ${attribute[0].toUpperCase() + attribute.slice(1)}`) && html.includes(ATTRIBUTE_EFFECTS[attribute]));
assert(!/data-(equip|upgrade)|Durability|Binds when|Transmog|damage per second/.test(html), 'a hover sheet has no actions or invented item mechanics');
assert(html.includes('item-sheet-attributes') && html.includes('item-sheet-bonuses'));
assert(renderItemTooltip(gear.id, { ...player, level: 1, appearance: { className: 'Knight' } }).includes('class="item-sheet-unmet"'));
assert(html.includes('<summary>Roll details</summary>') && html.includes('data-item-roll="' + gear.id + '"'), 'every item sheet has a native keyboard and touch disclosure');
for (const row of gearStatBreakdown(gear.id)) {
  assert(html.includes(`<dt>Base</dt><dd>${row.base}`) && html.includes(`<dt>Upgrade</dt><dd>${row.upgrade}`));
  if(row.max)assert(html.includes(`Range ${row.min}${row.stat==='speed'?'%':''}–${row.max}${row.stat==='speed'?'%':''}`), 'selected roll ranges come from the shared formula');
}
assert(renderGearRollDetails(GEAR['starfall-staff'], player).includes('Fixed item: no random affixes.'));
const upgraded = gearUpgradeQuote(gear.id).next;
assert(renderGearRollDetails(upgraded, player).includes('Upgrade +1'));
const ring = Object.values(GEAR).find(item => item.slot === 'ring' && (!item.className || item.className === 'Mage'));
const beforePlayer = JSON.stringify(player);
const comparison = renderGearRollDetails(ring, {...player, equipment:{...player.equipment,ring1:ring.id,ring2:''}});
assert(comparison.includes('Already equipped · Ring 1') && comparison.includes('Ring 2 · Compared with empty slot'), 'both ring sockets have explicit comparisons');
assert(html.includes('If equipped instead') && html.includes('Mage') && html.includes('Upgrade +0'));
assert(renderGearRollDetails(GEAR['rootforged-charm'], player).includes('Any calling'));
const setGear = rollGear('emberweave-armor', 'rare', () => .24);
const setSheet = renderItemTooltip(setGear.id, {...player, equipment:{...player.equipment,armor:setGear.id,ring1:'emberweave-ring',ring2:'emberweave-ring'}});
assert(setSheet.includes('2 / 8 pieces equipped') && setSheet.includes('Roll details'), 'roll inspection preserves set counts without double-counting the two ring sockets');
for(const bonus of gearSetBonuses('emberweave')) assert(setSheet.includes(`<div class="${bonus.pieces<=2?'item-sheet-bonuses':'item-sheet-note'}">(${bonus.pieces}) ${bonus.description}</div>`), 'active and upcoming spell set bonuses survive roll inspection');
assert.equal(JSON.stringify(player), beforePlayer, 'inspection cannot alter owned stats');
const before = GEAR['starfall-staff'].description;
try {
  GEAR['starfall-staff'].description = '<img src=x onerror=alert(1)>';
  assert(renderItemTooltip('starfall-staff').includes('&lt;img src=x onerror=alert(1)&gt;'), 'descriptions remain text');
} finally { GEAR['starfall-staff'].description = before; }
for (const id of ['__proto__', 'invalid', 'bag:foreign', 'bag-kind:__proto__', 'item:__proto__']) assert.equal(renderItemTooltip(id, player), '');
for (const [id, text] of [['wood', 'crafting'], ['potion', '55 health'], ['item:trail-bread', '25 health'], ['bag-kind:linen-pouch', '8 storage slots'], ['bag:owned-bag', '8 storage slots'], ['gold', 'Currency']]) assert(renderItemTooltip(id, player).includes(text));
player.ownedGear.push(gear.id);
const detail = renderItemDetails(player, gear.id), quote = gearUpgradeQuote(gear.id);
assert(detail.includes(html), 'selected gear and hover use the same item sheet');
assert(detail.includes('data-close-item') && detail.includes('Close item details') && !detail.includes('Back to backpack') && !html.includes('data-close-item'), 'only actionable item details expose a named dismiss control');
player.carriedItems = { 'trail-bread': 1, 'greater-tonic': 1, 'slime-residue': 1, 'moss-fox': 1, 'treasure-map': 1, 'moss-voucher': 1 };
for (const id of [gear.id, 'potion', 'wood', 'bag:owned-bag', ...Object.keys(player.carriedItems).map(id => `item:${id}`)]) {
  assert.equal([...renderItemDetails(player, id).matchAll(/data-close-item/g)].length, 1, `${id} has exactly one return action`);
}
assert(detail.includes('data-item-upgrade-mode="upgrade"') && renderItemDetails(player, gear.id, true).includes(`data-upgrade-gear="${gear.id}"`));
const backpack = renderBackpack(player, gear.id);
assert(backpack.includes(`data-item-tooltip="${gear.id}"`));
assert(!backpack.match(new RegExp(`<button[^>]*data-item-tooltip="${gear.id}"[^>]*title=`)), 'item previews do not compete with native title tooltips');
player.equipment.weapon = gear.id;
const inspect = renderGear(player, '', true), attributes = equippedAttributes(player);
assert(inspect.includes(`data-item-tooltip="${gear.id}"`) && !inspect.includes('data-equip-gear='));
for (const attribute of PRIMARY_ATTRIBUTES) assert(inspect.includes(`<dd>${attributes[attribute]}</dd>`));
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), start = main.indexOf(" if('closeItem' in data){");
const closeHandler = main.slice(start, main.indexOf(" if(panel.dataset.mode==='arena'){", start));
const pane = { hidden: false, classList: { toggle() {} } }, sourceItem = { dataset: { inspectItem: gear.id }, pressed: 'true', focused: false, setAttribute(name, value) { if (name === 'aria-pressed') this.pressed = value; }, focus() { this.focused = true; }, scrollIntoView() { this.visible = true; } };
const content = { scrollTop: 230, querySelectorAll: () => [sourceItem] };
const runtime = { data: { closeItem: '' }, player, selectedBagItem: gear.id, upgradingBagItem: true, disposed: false,
  lootUI: { displayPlayer: player => player }, panel: { dataset: { mode: 'inventory' } },
  disposeBagPreview() { runtime.disposed = true; }, showBagPreview() {}, renderItemDetails: () => '<p>Item</p>',
  document: { querySelectorAll: () => [sourceItem] }, $: id => id === 'bag-item-details' ? pane : content };
const selectStart = main.indexOf('function selectBagItem(');
runInNewContext(stripTypeScriptTypes(main.slice(selectStart, main.indexOf("let draggedGear=''", selectStart))), runtime);
runInNewContext(stripTypeScriptTypes(`(()=>{${closeHandler}})()`), runtime);
assert(pane.hidden && runtime.selectedBagItem === '' && !runtime.upgradingBagItem && runtime.disposed && sourceItem.focused && sourceItem.pressed === 'false', 'dismissing clears item/mode and returns focus without an item mutation');
assert.equal(content.scrollTop, 230, 'dismissing never scrolls the persistent backpack');
runInNewContext("selectBagItem('potion', true);", runtime);
assert.equal(runtime.upgradingBagItem, true);
runInNewContext("selectBagItem('wood');", runtime);
assert.equal(runtime.upgradingBagItem, false, 'selecting another item resets upgrade mode');
assert.equal(content.scrollTop, 230, 'switching items never scrolls the outer panel');
sourceItem.dataset.inspectItem = 'wood';
runInNewContext(stripTypeScriptTypes(`(()=>{${closeHandler}})()`), runtime);
assert(pane.hidden && runtime.selectedBagItem === '' && sourceItem.focused);
console.log('PASS: shared item sheets show authoritative stats and prices, escaped descriptions, class/level requirements, item metadata, keyboard inspection, preserved actions and no invented mechanics.');
