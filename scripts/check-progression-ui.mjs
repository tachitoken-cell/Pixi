import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Resolve the browser's extensionless TS imports without a DOM or bundler.
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { renderTalents, renderGear, renderShop } = await import('../src/progression-ui.ts');
const { skillTabs, renderSkills } = await import('../src/skills-ui.ts');
const { starterGear, GEAR, GEAR_SETS, TALENTS, MAX_LEVEL, talentRank, canLearnTalent } = await import('../src/progression.ts');
const { MERCHANT_SET_LEVELS } = await import('../src/merchants.ts');
const merchant = 'village-pinewake-merchant';
hook.deregister();

const button = (html, action, id) => {
  const match = html.match(new RegExp(`<button\\b[^>]*data-${action}="${id}"[^>]*>`));
  assert(match, `Missing ${action} action for ${id}`);
  return match[0];
};
// The compact shop renders only one page and one reviewed action at a time.
function shopPages(player,npcId,options={}) {
  const first=renderShop(player,npcId,{...options,page:0}),pages=Number(first.match(/data-shop-page-count="(\d+)"/)?.[1]||1);
  return Array.from({length:pages},(_,page)=>page?renderShop(player,npcId,{...options,page}):first);
}
const shopKeys=(player,npcId,options={})=>shopPages(player,npcId,options).flatMap(html=>[...html.matchAll(/data-shop-select="([^"]+)"/g)].map(match=>match[1]));
function selectedShop(player,npcId,selected,options={}) {
  const pages=shopPages(player,npcId,options),page=pages.findIndex(html=>html.includes(`data-shop-select="${selected}"`));
  assert(page>=0,`Shop contains ${selected}`);return renderShop(player,npcId,{...options,page,selected});
}
for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  const player = { name: 'Adventurer', hp: 50, maxHp: 100, appearance: { className }, level: 1, gold: 0, talents: [], characterCreated: true,
    skills: { fishing: 0, mining: 0, woodcutting: 50, herbalism: 480200 }, inventory: { wood: 3, crystal: 0, herb: 2, potion: 3, relic: 0 }, craftingXp: 0, contracts: { active: {}, completed: {} }, ...starterGear(className) };
  const prefix = className.toLowerCase();
  let tree = renderTalents(player);
  const classTalents = Object.values(TALENTS).filter(talent => talent.className === className);
  assert.equal((tree.match(/class="talent-node /g) || []).length, classTalents.length, `${className} shows every ranked talent`);
  assert(!tree.includes('Next rank: </p>'), 'statless passive talents describe their next rank');
  assert.equal((tree.match(/class="talent-branch talent-tone-/g) || []).length, 3, `${className} has three branches`);
  assert.equal((tree.match(/role="tooltip"/g) || []).length, classTalents.length, 'every node has keyboard and hover details');
  for (const talent of classTalents) {
    assert(tree.includes(`style="grid-column:${talent.column + 1};grid-row:${talent.row + 1}"`));
    assert(tree.includes(`aria-describedby="talent-detail-${talent.id}"`) && tree.includes(`id="talent-detail-${talent.id}"`));
    if (talent.prerequisite) {
      const previous = TALENTS[talent.prerequisite];
      const arrow = tree.match(new RegExp(`<(?:path|line)[^>]*data-talent-from="${previous.id}" data-talent-to="${talent.id}"[^>]*>`))?.[0];
      assert(arrow, 'visible arrows match the actual prerequisite');
      if (previous.row === talent.row) {
        const container = tree.match(new RegExp(`<svg class="talent-side-connection" style="([^"]+)"[^>]*>${arrow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</svg>`));
        assert(container, 'same-tier dependencies have a horizontal overlay without a scaled viewBox');
        const layout = container[1].match(/left:calc\(([\d.]+)% \+ ([\d.]+)px\);width:calc\(([\d.]+)% - ([\d.]+)px\);top:([\d.]+)px/);
        assert(layout); const [, leftPercent, padding, spanPercent, combinedPadding, y] = layout.map(Number);
        assert.equal(y, talent.row * 58 + 22, 'horizontal arrows meet the vertical center of both buttons');
        assert(arrow.includes(previous.column > talent.column ? 'x1="100%" x2="0"' : 'x1="0" x2="100%"'), 'arrow points from signature to augment');
        for (const width of [190, 300, 420]) {
          const left = width * leftPercent / 100 + padding, right = left + width * spanPercent / 100 - combinedPadding;
          const lowerCenter = width * (Math.min(previous.column, talent.column) + .5) / 3, upperCenter = width * (Math.max(previous.column, talent.column) + .5) / 3;
          assert(left > lowerCenter + 22 && right < upperCenter - 22 && left < right, `at ${width}px tree width, arrow endpoints stay outside both 44px buttons`);
        }
      } else assert(arrow.includes(`d="M${previous.column * 100 + 50} ${previous.row * 58 + 47} V`), 'earlier-tier arrows retain their bottom-to-top route');
    }
  }
  assert(!button(tree, 'learn-talent', `${prefix}-1`).includes(' disabled'));
  assert(button(tree, 'learn-talent', `${prefix}-2`).includes(' disabled'));
  player.level = 4;
  tree = renderTalents(player);
  assert(button(tree, 'learn-talent', `${prefix}-2`).includes(' disabled'), 'level alone must not bypass prerequisites');
  player.talents = [`${prefix}-1`];
  tree = renderTalents(player);
  assert(button(tree, 'learn-talent', `${prefix}-1`).includes(' disabled'), 'capped talents remain inspectable but cannot be purchased twice');
  const second = TALENTS[`${prefix}-2`];
  if (second.requiredBranchPoints > player.talents.length) {
    assert(button(tree, 'learn-talent', second.id).includes(' disabled'), 'the prerequisite alone does not bypass current branch-point requirements');
    const filler = classTalents.find(talent => talent.branch === second.branch && !talent.prerequisite && talent.maxRank >= second.requiredBranchPoints - 1);
    player.level = Math.max(second.requiredLevel, 1 + 3 * second.requiredBranchPoints);
    while (player.talents.length < second.requiredBranchPoints) {
      assert(canLearnTalent(player, filler.id), 'fixture spends only valid prerequisite ranks');
      player.talents.push(filler.id);
    }
  }
  assert(!button(renderTalents(player), 'learn-talent', second.id).includes(' disabled'), 'enough actual branch ranks and one remaining point unlock the node');
  player.level = 1;
  assert(button(renderTalents(player), 'learn-talent', `${prefix}-4`).includes(' disabled'), 'spent points disable the other branch');
  const ranked = classTalents.find(talent => talent.maxRank === 3 && !talent.prerequisite && talent.requiredLevel === 1);
  const allocator = { ...player, level: 20, talents: [] };
  for (let rank = 0; rank <= ranked.maxRank; rank++) {
    allocator.talents = Array(rank).fill(ranked.id);
    const rankedTree = renderTalents(allocator);
    assert(rankedTree.includes(`Rank ${rank} / ${ranked.maxRank}`), 'rank counter follows repeated server-authoritative allocations');
    assert.equal(button(rankedTree, 'learn-talent', ranked.id).includes(' disabled'), rank === ranked.maxRank);
    assert(rankedTree.includes(`<strong>${rank}</strong> ${rank === 1 ? 'point' : 'points'} spent in ${ranked.branch}`));
  }
  const dependent = classTalents.find(talent => talent.prerequisite === ranked.id);
  allocator.talents = [ranked.id];
  assert(button(renderTalents(allocator), 'learn-talent', dependent.id).includes(' disabled'), 'one rank does not bypass a multi-rank prerequisite');
  allocator.talents = Array(dependent.prerequisiteRank).fill(ranked.id);
  assert(button(renderTalents(allocator), 'learn-talent', dependent.id).includes(' disabled'), 'the prerequisite does not bypass branch point gates');
  allocator.talents.push(`${prefix}-1`);
  assert(!button(renderTalents(allocator), 'learn-talent', dependent.id).includes(' disabled'), 'exact prerequisite and branch point requirements unlock the node');
  allocator.talents = [];
  allocator.level = MAX_LEVEL;
  for (let count = 0; count < 90; count++) {
    const next = classTalents.find(talent => canLearnTalent(allocator, talent.id));
    if (!next) break;
    allocator.talents.push(next.id);
  }
  assert.equal(allocator.talents.length, 20, 'point budget forces a specialization');
  assert(classTalents.some(talent => talentRank(allocator, talent.id) < talent.maxRank), 'all branches cannot be filled');
  const cappedTree = renderTalents(allocator);
  assert.equal((cappedTree.match(/class="talent-connection satisfied"/g) || []).length, classTalents.filter(talent => talent.prerequisite && talentRank(allocator, talent.prerequisite) >= talent.prerequisiteRank).length);
  assert([...cappedTree.matchAll(/<button\b[^>]*data-learn-talent[^>]*>/g)].every(match => match[0].includes(' disabled')));

  const upgrade = Object.values(GEAR).find(gear => gear.slot === 'weapon' && gear.className === className && gear.price > 0);
  assert(button(selectedShop(player, merchant, `gear:${upgrade.id}`), 'buy-gear', upgrade.id).includes(' disabled'), 'level and gold requirements are enforced in the UI');
  player.level = 2;
  assert(button(selectedShop(player, merchant, `gear:${upgrade.id}`), 'buy-gear', upgrade.id).includes(' disabled'), 'insufficient gold disables purchases');
  player.gold = upgrade.price;
  assert(!button(selectedShop(player, merchant, `gear:${upgrade.id}`), 'buy-gear', upgrade.id).includes(' disabled'), 'exact price enables a purchase');
  player.ownedGear.push(upgrade.id);
  assert(!selectedShop(player, merchant, `gear:${upgrade.id}`).includes(`data-buy-gear="${upgrade.id}"`), 'owned gear has no duplicate buy action');
  assert(!button(selectedShop(player, merchant, `gear:${upgrade.id}`), 'equip-gear', upgrade.id).includes(' disabled'));
  assert(!button(renderGear(player, upgrade.id), 'equip-gear', upgrade.id).includes(' disabled'));
  player.equipment.weapon = upgrade.id;
  assert(button(selectedShop(player, merchant, `gear:${upgrade.id}`), 'equip-gear', upgrade.id).includes(' disabled'), 'equipped gear is labelled without a redundant action');
  assert(!renderGear(player).includes(`data-equip-gear="${upgrade.id}"`));
  assert(renderGear(player).includes(`Lv ${player.level} ${className}`), 'compact profile keeps character level and class visible');
  assert(!renderGear(player).includes('data-open-supplies'), 'bags cannot open a remote shop');
  assert(!renderShop(player).includes('data-buy-gear='), 'a merchant is required to render stock');
  assert(!renderShop(player, 'village-pinewake-healer').includes('data-sell-resource='), 'other NPC roles cannot trade');
  const shop = selectedShop(player, merchant, 'resource:wood', {tab:'sell',quantity:'all'});
  assert(!shopKeys(player,merchant,{tab:'sell'}).includes('resource:crystal'), 'empty resources are absent from the selling inventory');
  assert(shop.includes('data-sell-resource="wood" data-sell-quantity="3"'));
  assert(shop.includes('You receive: 9 gold'), 'whole-stack sale shows the exact proceeds');
  player.inventory.wood = 1_000_001;
  assert(selectedShop(player, merchant, 'resource:wood', {tab:'sell',quantity:'all'}).includes('data-sell-resource="wood" data-sell-quantity="1000000"'), 'sale quantity stays within the server limit');
  const professions = renderSkills(player);
  assert(professions.includes('0 / 50 XP') && professions.includes('0 / 150 XP') && professions.includes('Artisan · Level 99') && professions.includes('Every resource unlocked. Your craft is mastered.'));
  assert(!/NaN|undefined/.test(tree + shop + renderGear(player) + professions));
  assert(!shopKeys(player, merchant).includes('gear:rootforged-charm'), 'the dungeon relic reward cannot be purchased from ordinary supplies');
  assert(!shopKeys(player, merchant,{tab:'sell'}).includes('resource:relic'), 'dungeon relics remain crafting materials instead of a generic resource sale');
  player.ownedGear.push('rootforged-charm');
  assert(button(renderGear(player, 'rootforged-charm'), 'equip-gear', 'rootforged-charm').includes(' disabled'), 'crafted gear retains its equip-level requirement');
  player.level = 4;
  assert(!button(renderGear(player, 'rootforged-charm'), 'equip-gear', 'rootforged-charm').includes(' disabled'), 'every class can equip the universal relic reward');
  player.equipment.charm = 'rootforged-charm';
  const relicGear = renderGear(player, 'rootforged-charm');
  assert(!relicGear.includes('data-equip-gear="rootforged-charm"'));
  assert(relicGear.includes('Rootforged sigil') && ['+5 Attack damage', '+8 Magic (skill damage)', '+3 Defense (armor)'].every(bonus => relicGear.includes(`>${bonus}</div>`)), 'the equipped relic displays its real combat bonuses');
  for (const set of GEAR_SETS.filter(set => set.className === className)) {
    const shopper = { ...player, level: set.requiredLevel, gold: 1_000_000, ...starterGear(className) };
    const seller = Object.keys(MERCHANT_SET_LEVELS).find(id => MERCHANT_SET_LEVELS[id] === set.requiredLevel);
    const stock = Object.values(GEAR).filter(gear => gear.setId === set.id);
    const expected=Object.values(GEAR).filter(gear=>!gear.dropOnly&&gear.price>0&&(!gear.className||gear.className===className)&&(!gear.setId||gear.setId===set.id)).map(gear=>`gear:${gear.id}`);
    assert.deepEqual(new Set(shopKeys(shopper,seller,{filter:'equipment'})),new Set(expected),'all pages contain only this village collection and essentials for the player class');
    assert.deepEqual(shopKeys(shopper,seller,{filter:'bags'}),['bag:linen-pouch','bag:trail-satchel','bag:wayfarer-pack','bag:runewoven-holdall'],'bag stock stays independently filterable');
    for (const gear of stock) {
      const shop=selectedShop(shopper,seller,`gear:${gear.id}`,{filter:'equipment'});
      assert(!button(shop, 'buy-gear', gear.id).includes(' disabled'));
      assert(shop.includes(`/ui/gear/${gear.model}.png`), 'each selected set piece has its rendered Blender icon');
      const locked = selectedShop({ ...shopper, level: set.requiredLevel - 1 }, seller, `gear:${gear.id}`,{filter:'equipment'});
      assert(button(locked, 'buy-gear', gear.id).includes(' disabled'), 'new set level requirements appear before purchase');
    }
    shopper.ownedGear.push(...stock.map(gear => gear.id));
    for (const gear of stock) shopper.equipment[gear.slot === 'ring' ? 'ring1' : gear.slot] = gear.id;
    assert(renderGear(shopper, stock[0].id).includes(`${set.label} set · 8 / 8 pieces equipped`), 'the bag identifies the matching collection');
    for(const gear of stock)assert(button(selectedShop(shopper,seller,`gear:${gear.id}`),'equip-gear',gear.id).includes(' disabled'),'equipped collection pieces cannot be bought twice or redundantly equipped');
  }
}
const bagShopper = { name:'Bag buyer', appearance:{className:'Mage'}, level:25, gold:650, inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0}, ...starterGear('Mage'), ownedBags:[], equippedBags:[null,null,null,null] };
for(const seller of [merchant,'city-armorer']){
 const stock=selectedShop(bagShopper,seller,'bag:runewoven-holdall',{filter:'bags'});
 assert.deepEqual(shopKeys(bagShopper,seller,{filter:'bags'}),['bag:linen-pouch','bag:trail-satchel','bag:wayfarer-pack','bag:runewoven-holdall'],'bag merchants offer every real bag tier');
 assert(!button(stock,'buy-bag','runewoven-holdall').includes(' disabled'),'exact level and price enable the bag purchase');
 assert(stock.includes('Automatically equips')&&stock.includes('Price: 650 gold'),'an empty socket and exact purchase price remain clear');
 assert(button(selectedShop({...bagShopper,level:24},seller,'bag:runewoven-holdall',{filter:'bags'}),'buy-bag','runewoven-holdall').includes(' disabled'),'bag level requirements remain enforced');
 assert(button(selectedShop({...bagShopper,gold:649},seller,'bag:runewoven-holdall',{filter:'bags'}),'buy-bag','runewoven-holdall').includes(' disabled'),'insufficient funds disable purchases');
}
for(const npc of [undefined,'city-weaponsmith','village-pinewake-healer','unknown-npc']){
 assert.equal(shopKeys(bagShopper,npc,{filter:'bags'}).length,0,'non-bag merchants and absent NPCs never expose bag purchases');
 assert.equal(shopKeys(bagShopper,npc,{tab:'sell',filter:'bags'}).length,0,'non-bag merchants and absent NPCs never expose bag resale');
}
bagShopper.ownedBags=[{id:'00000000-0000-4000-8000-000000000001',kind:'linen-pouch'},{id:'00000000-0000-4000-8000-000000000002',kind:'linen-pouch'}];
bagShopper.equippedBags[0]=bagShopper.ownedBags[0].id;
const resale=selectedShop(bagShopper,merchant,`bag:${bagShopper.ownedBags[1].id}`,{tab:'sell',filter:'bags'});
assert.deepEqual(shopKeys(bagShopper,merchant,{tab:'sell',filter:'bags'}),[`bag:${bagShopper.ownedBags[1].id}`],'only spare bag instances can be sold');
assert(resale.includes(`data-sell-bag="${bagShopper.ownedBags[1].id}"`)&&resale.includes('You receive: 6 gold'),'bag resale shows exact instance and quarter-price value');
const namedTalent = TALENTS['ranger-1'], originalText = { label: namedTalent.label, description: namedTalent.description };
try {
  namedTalent.label = '<img src=x onerror="bad()">';
  namedTalent.description = 'A & B <script>bad()</script>';
  const escapedTree = renderTalents({ appearance: { className: 'Ranger' }, level: 1, talents: [] });
  assert(!escapedTree.includes('<img') && !escapedTree.includes('<script>'));
  assert(escapedTree.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt;') && escapedTree.includes('A &amp; B &lt;script&gt;bad()&lt;/script&gt;'), 'node labels, descriptions and accessible names remain safe text');
} finally { Object.assign(namedTalent, originalText); }
for (const active of ['combat', 'professions']) {
  const tabs = skillTabs(active);
  assert.equal((tabs.match(/data-skill-tab=/g) || []).length, 2);
  assert.equal((tabs.match(/aria-pressed="true"/g) || []).length, 1);
  assert(tabs.includes(`data-skill-tab="${active}" aria-pressed="true"`));
  assert(!tabs.includes('data-skill-tab="tree"')&&!tabs.includes('skill-tabs--three'),'the standalone skill tree is absent from the two-category selector');
}
console.log('PASS: all class talent trees, purchase/equip states, resource sales, profession levels, skill tabs and universal crafted relic equipment.');
