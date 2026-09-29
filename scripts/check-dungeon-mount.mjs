import assert from 'node:assert/strict';
import { MOUNTS, VERDANT_REVENANT_DROP, rollDungeonMount } from '../src/travel.ts';
import { MOUNT_PRICES } from '../src/training.ts';
import { LOOT_ITEMS, carriedItemsValid } from '../src/loot-items.ts';
import { auctionItemValid } from '../src/auction.ts';
import { existsSync } from 'node:fs';

const drop = VERDANT_REVENANT_DROP, boss = { kind: drop.boss, dungeonBoss: true, stageId: 'throne' };
assert.equal(drop.oneIn, 10_000);
assert.equal(MOUNTS.find(mount => mount.id === drop.mount)?.dropOnly, true);
assert(!Object.hasOwn(MOUNT_PRICES, drop.mount), 'dungeon mount cannot be purchased');
let successes = 0;
for (let draw = 0; draw < 10_000; draw++) {
  const result = rollDungeonMount(drop.dungeon, boss, [], max => { assert.equal(max, 10_000); return draw; });
  assert.equal(result, draw === 0 ? drop.mount : null);
  if (result) successes++;
}
assert.equal(successes, 1, 'exactly one of ten thousand equally likely integer draws wins');
const forbiddenRoll = () => assert.fail('ineligible rewards must not roll');
for (const dungeon of [undefined, 'rootvault', 'emberfall', 'plagueworks']) assert.equal(rollDungeonMount(dungeon, boss, [], forbiddenRoll), null);
for (const enemy of [{ ...boss, kind: 'bellkeeper-shen' }, { ...boss, dungeonBoss: false }, { ...boss, stageId: 'confluence' }, { kind: drop.boss }]) assert.equal(rollDungeonMount(drop.dungeon, enemy, [], forbiddenRoll), null);
assert.equal(rollDungeonMount(drop.dungeon, boss, [drop.mount], () => 0), drop.mount, 'learned mounts remain eligible for a tradable extra copy');
for (const draw of [-1, 1, 9999, 10_000, NaN]) assert.equal(rollDungeonMount(drop.dungeon, boss, [], () => draw), null);
for (const [id, assetId] of [['verdant-revenant', 1], ['store-embermane', 2], ['store-cinderfang', 3]]) assert.equal(MOUNTS.find(mount => mount.id === id)?.nftAssetId, assetId, 'published asset IDs stay stable');
assert.equal(new Set(MOUNTS.flatMap(mount => mount.nftAssetId === null ? [] : [mount.nftAssetId])).size, MOUNTS.filter(mount => mount.nftAssetId !== null).length);
for (const mount of MOUNTS) {
  assert(mount.description.length > 0 && existsSync(new URL(`../public${mount.icon}`, import.meta.url)), `${mount.id} has a description and existing icon`);
  if (mount.nftAssetId === null) {
    assert(['horse', 'wolf'].includes(mount.id) || 'referralOnly' in mount);
    assert(!LOOT_ITEMS[mount.id], 'vendor and referral mounts are unlocks, never loot items');
    assert.equal(mount.dungeonDrop, null);
    continue;
  }
  if (mount.storeOnly) {
    assert(!LOOT_ITEMS[mount.id], 'store mounts remain learned unlocks for eligible conversion');
    assert.equal(mount.source, null); assert.equal(mount.dropChance, 0); assert.equal(mount.dungeonDrop, null);
    continue;
  }
  assert.equal(LOOT_ITEMS[mount.id].category, 'mount');
  assert.equal(LOOT_ITEMS[mount.id].sellPrice, 0, 'mounts cannot be sold to NPC merchants');
  assert(carriedItemsValid({ carriedItems: { [mount.id]: 2 } }), 'duplicate mount items survive inventory validation');
  assert(auctionItemValid({ kind: 'item', id: mount.id, quantity: 2 }), 'mount copies can be auctioned');
  if (mount.dungeonDrop) assert.equal(mount.dropChance, 1 / mount.dungeonDrop.oneIn);
}
console.log('PASS dungeon mount: exactly 1/10,000, final Veilhaven boss only, duplicate tradable items, stable NFT IDs, and vendor exclusion.');
