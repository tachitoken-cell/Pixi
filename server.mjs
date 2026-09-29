import { GOLD_MERCHANT, GOLD_MERCHANT_REQUIREMENTS } from './src/gold-merchant.ts';
import { HEARTHLING_NPC, MEADGOD_QUEST_COST, MEADGOD_QUEST } from './src/hearthling.ts';
import { combatCompanionStats, tamedCompanionValid, tameableCreature } from './src/combat-companions.ts';
import { goldSource, craftingGoldCost, talentResetGoldCost, GOLD_ZEPPELIN_COST, GOLD_CLASS_CHANGE_COST, goldBoostPurchase, goldStorePrice } from './src/gold-economy.ts';
import { WORLD_CURIOS, RESOURCE_SITES, DREAM_DURATION_MS, DREAM_REST_COOLDOWN_MS } from './src/world-features.ts';
import { createServer } from 'node:http';
import { id as chainIdHash, ZeroAddress } from 'ethers';
import { createArenaChain } from './src/arena-chain.mjs';
import { arenaWagerAmount, arenaWagersValid, ARENA_MAX_PENDING_WAGERS } from './src/arena-wager.ts';
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, statSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import timers from 'node:timers/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { createHostingConfig, hostingOrigin } from './src/hosting-realms.ts';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createWalletOidc } from './src/wallet-oidc.mjs';
import { createTurnkeyConfig } from './src/turnkey-config.mjs';
import { createTurnkeySponsorshipConfig, createTurnkeySponsorship, createTurnkeySponsorshipHandler, sponsorshipError } from './src/turnkey-sponsorship.mjs';
import { matchTurnkeyGasIntent } from './src/turnkey-gas-intent.mjs';
import { socialProvidersFor } from './src/social-providers.mjs';
import { createNativeWalletHandoff } from './src/native-wallet-handoff.mjs';
import { createStoreChain, readMossHoldings, readStorePrice } from './src/store-chain.mjs';
import { createMountPassengers } from './src/mount-passengers.mjs';
import { getChainRpc } from './src/nft-rpc.mjs';
import { referralValid, normalizeReferralCode, referralView, referralPlayed, referralFeeBps, referralWallets, referralWalletsOverlap } from './src/referrals.ts';
import { migrateReferral, mergeReferral, grantReferralRewards, applyReferralCommit } from './src/referral-store.mjs';
import { classChangeChanges } from './src/class-change.ts';
import { createNftChain } from './src/nft-chain.mjs';
import { createSpecialistNftService, specialistNftLocked } from './src/specialist-nft-service.mjs';
import { specialistNftPlayerValid } from './src/specialist-nft.ts';
import { nftPlayerValid, nftAsset, nftLearnedPetConvertible, NFT_LEGACY_PETS, NFT_PETS, NFT_FEE_BPS, nftMigrationTransactionValid } from './src/nfts.ts';
import { createMobilePurchaseVerifier } from './src/mobile-purchase-verifier.mjs';
import { createAccountDeletionProvider } from './src/account-deletion-provider.mjs';
import { accountDeletionHandler } from './src/account-deletion-http.mjs';
import { createDeploymentControl } from './src/deployment-control.mjs';
import { serveStaticAsset } from './src/static-assets.mjs';
import { storeProduct, storeProductForSale, storePlayerValid, storeNftConvertible, storeRepeatable, storeRewardChanges, storeActivationChanges, storeBoostMultiplier, storeCosmeticPool, STORE_MAX_ORDERS, MOBILE_STORE_SKUS, mobileIntentIdValid, mobilePurchaseConflict, mobileRewardChanges, mobileRefundChanges } from './src/ingame-store.ts';
import { createPlayerStore, SHARED_PLAYER_FIELDS } from './src/player-store.mjs';
import { createPushNotifications } from './src/push-notifications.mjs';
import { parseAppUpdatePolicy } from './mobile/app-update.ts';
import { createPublicStats } from './src/public-stats.mjs';
import { createCountryLookup } from './src/player-country.mjs';
import { goldEvent as makeGoldEvent, goldEventValid } from './src/gold-ledger.mjs';
import { COMMUNITY_VERSION, REPORT_REASONS, communityText, objectionableText } from './src/community.ts';
import { localReports } from './src/local-reports.mjs';
import { createActionGuard } from './src/action-guard.mjs';
import { botEvidenceDescription, createClientChecks } from './src/bot-evidence.mjs';
import { localPollStore } from './src/poll-store.mjs';
import { fileDungeonRecords } from './src/dungeon-records.mjs';
import { POLLS, pollsValid, pollAnswersValid, pollStatus } from './src/polls.ts';
import { POLL_BOOTHS } from './src/poll-booths.ts';
import { createChatTranslation } from './src/chat-translation.mjs';
import { chatLanguageValid } from './src/chat-languages.ts';
import { ZONES, NPCS as LOCAL_NPCS, GATEWAYS as LOCAL_GATEWAYS, BEACONS as LOCAL_BEACONS, CHAPTERS, ENDINGS, getZone } from './src/content.ts';
import { createGatheringNodes } from './src/gathering-nodes.ts';
import { SKILLS, RESOURCE_TYPES, MAX_SKILL_XP, skillProgress, gatheringDuration, canGather, gatheringUnlocks, gatheringXpGain, professionRank } from './src/skills.ts';
import { MAX_LEVEL, TALENT_VERSION, migrateTalents, GEAR, gearById, gearIdValid, gearUpgradeQuote, upgradeGear, gearSpeedMultiplier, equippedAttributes, maxHealth, TALENTS, RESOURCE_PRICES, EQUIPMENT_SLOTS, gearFitsSlot, equipmentSlotFor, starterGear, combatStats, talentRank, canLearnTalent, talentsValid } from './src/progression.ts';
import { VILLAGES, VILLAGE_NPCS, VILLAGE_SAFE_RADIUS } from './src/settlements.ts';
import { NPC_SERVICE_COSTS, WORLD_INTEREST_RADIUS, TRADE_RANGE, DEATH_ANIMATION_MS, CHARACTER_CLASSES } from './src/shared.ts';
import { MONSTERS, WORLD_BOSSES, WORLD_BOSS_BERSERK_MS, BASIC_ATTACK, CHARGE_ATTACK, CHARGING_MONSTERS, basicAttackRange, basicAttackCooldown, monsterSpawnLevel, monsterStatsAtLevel, monsterLevelScale, monsterPursuitSpeed } from './src/bestiary.ts';
import { TREASURE_MAP, TREASURE_MAP_SITES, treasureMapPlayerValid, treasureMapReward } from './src/treasure-maps.ts';
import { TREASURE_GOBLIN, treasureGoblinDeadline, engageTreasureGoblin, treasureGoblinFleeGoal } from './src/treasure-goblin.ts';
import { TRAINING_DUMMY_RESET_MS } from './src/training-dummies.ts';
import { merchantStock, gearSellPrice } from './src/merchants.ts';
import { createTreasureChain, rollTreasureUsd } from './src/treasury-chain.mjs';
import { treasurePlayerValid, treasureQuotes, treasureNextRedemptionAt, TREASURE_MAX_CLAIMS, goldUsdAmountWei } from './src/treasure-rewards.ts';
import { SHADY_MERCHANT } from './src/settlements.ts';
import { BAG_ITEMS, BAG_SLOT_COUNT, bagKindValid, bagMerchantStock, newBags, migrateBags, bagsValid, bagCanFit, bagUsage, bagCapacity } from './src/bags.ts';
import { createLootTrace } from './src/loot-trace.mjs';
import { itemLocked, itemLockKey, itemLockIdValid, itemLocksValid, ownsLockItem } from './src/item-locks.ts';
import { HEATPROOF_DURATION_MS, HEATPROOF_DAMAGE_MULTIPLIER, LOOT_ITEMS, lootItemValid, carriedItemsValid, lootRows, rollMonsterLoot, rollDungeonCacheLoot, isThemedDungeonLoot } from './src/loot-items.ts';
import { BANK_CAPACITY, newBank, bankItems, bankItemValid, bankPlayerValid, bankEscrowHas, bankDeposit, bankWithdraw } from './src/bank.ts';
import { TRAINER_NPCS, RIDING_LESSONS, MOUNT_PRICES, spellTrainingCost } from './src/training.ts';
import { appearanceValid, copyAppearance, migrateLegacyAppearance } from './src/appearance.ts';
import { characterNameError } from './src/character-name.ts';
import { newOnboarding, onboardingValid, onboardingFeatureUnlocked, onboardingLockReason, onboardingCanComplete } from './src/onboarding.ts';
import { newAchievements, achievementsValid, unlockAchievements } from './src/achievements.ts';
import { getTitle, titleUnlocked } from './src/titles.ts';
import { isPetId, petById, PET_LOOT_QUALITIES, PET_LOOT_RADIUS } from './src/pets.ts';
import { verifiedGmRole, gmActionValid, gmLevelAward, accountBanValid, GM_MAX_LEVEL, GM_FLY_SPEED, GM_FLY_MAX_HEIGHT } from './src/gm.ts';
import { combatTiming, shieldThrowHops } from './src/combat-timing.ts';
import { AUTO_ATTACKS, autoAttackTiming, autoAttackDamage } from './src/auto-attacks.ts';
import { isInColosseum } from './src/colosseum.ts';
import { ARENA_ENTRANCE, ARENA_BOUNDS, ARENA_COLLIDERS, isArenaInstance, isInArena, arenaTeamPosition, normalizeArenaRatings, arenaRatingsValid, arenaRatingDelta } from './src/arena.ts';
import { SPELLS, TALENT_EFFECT_IDS, CLERIC_EDICTS, GLOBAL_ATTACK_MS, HOTBAR_PAGE_SIZE, LEGACY_HOTBAR_PAGE_SIZE, abilityValid, abilityUnlocked, defaultHotbar, availableHotbar, extendedHotbar, hotbarValid, legacyAbility, spellDamage, spellPeriodicDamage, spellTargetMultiplier, spellCastTimeMs, spellsForClass, migrateRetiredSpells, ricochetHits } from './src/spells.ts';
import { toWorld, regionAt, canTraverse as groundCanTraverse, WORLD_COLLIDERS, WORLD_BOUNDS, createOverworldSpawns, relocateOverworldSpawn, overworldSpawnAllowed } from './src/realm.ts';
import { findPath } from './src/navigation.ts';
import { DEED_AUCTIONEER, CITY_RADIUS, REGION_ORIGINS, insideAnyCity as insideCity } from './src/city.ts';
import { AUCTIONEERS, BANKERS } from './src/city-services.ts';
import { newStoryQuests, storyQuestsValid, storyQuestById, storyQuestAvailable, storyQuestReady, storyInteractAvailable, acceptStoryQuest, abandonStoryQuest, storyQuestProgress, claimStoryQuest } from './src/story-quests.ts';
import { STORY_OBJECTS, STORY_ENEMIES, STORY_ENCOUNTERS } from './src/story-world-data.ts';
import { createStoryEncounters } from './src/story-encounters.mjs';
import { storyQuestRewardChanges } from './src/story-quest-rewards.ts';
import { createAuctionChain, auctionPriceWei, isProductionMossAuctionContract } from './src/auction-chain.mjs';
import { AUCTION_MAX_LISTINGS, auctionAssetValid, auctionGoldFee, auctionItemFee, auctionGoldPrice, auctionListingsValid, auctionRecordSale, auctionEscrowHas, auctionCanList, auctionCanReceive, auctionItemChanges, auctionItemLabel } from './src/auction.ts';
import { BUILDING_CHAIRS, BUILDING_BEDS, buildingAt, chairApproach } from './src/buildings.ts';
import { CONTRACTS, RECIPES, newContracts, validateContracts, acceptContract, cancelContract, claimContract, contractProgress, recipeAllowed, recipeOutput, craftingProgress, craftingXpGain, BOARD_POSITION, WORKSHOP_POSITION, ROOTVAULT_GUARDIAN } from './src/adventure.ts';
import { dungeonHazardPattern, dungeonDeathHazardPattern, dungeonHazardContains } from './src/dungeon-mechanics.ts';
import { dungeonSpikeTraps, dungeonSpikePhase, dungeonSpikeContains, DUNGEON_SPIKE_DAMAGE_FRACTION } from './src/dungeon-traps.ts';
import { dungeonBossVisual } from './src/dungeon-boss-models.ts';
import { createRaidController } from './src/raid-server.mjs';
import { createInstantCombatController } from './src/instant-combat-server.mjs';
import { INSTANT_COMBAT_RANGED_AUTO } from './src/instant-combat-skills.ts';
import { INSTANT_COMBAT, isInstantCombatInstance, instantCombatWaveReward } from './src/instant-combat.ts';
import { instantCombatMap, instantCombatPosition } from './src/instant-combat-maps.ts';
import { rollRaidRewards, raidRewardChanges, raidProgressValid, raidProgressionChanges, awardSpecialistXp, SPECIALISTS_ENABLED } from './src/raid-progression.ts';
import { RAID_BOUNDS, RAID_COLLIDERS, isRaidInstance } from './src/raid.ts';
import { DUNGEONS, crossedDungeonPortal, dungeonLayout, dungeonRoomPortalOpen, DUNGEON_START, DUNGEON_EXIT, dungeonReturn, dungeonCheckpoint, dungeonColliders, dungeonStages, getDungeon, dungeonBounds, inDungeonPreparation } from './src/dungeon.ts';
import { EXPEDITIONS, waterAt, surfaceAt, movementCost, SWIM_SPEED, TERRAIN_STEP, migrateWorldPositionV2 } from './src/landscape.ts';
import { newJump, jumpFloor, startJump, stepJump, moveJump } from './src/jumping.ts';
import { CLIMB_ENABLED, startClimb, stopClimb, stepClimb } from './src/climbing.ts';
import { installCollisionScene, hasCollisionScene, cloneCollisionScene, disposeCollisionScene, updateCollisionSceneState, actorFloor, actorCanStand, actorLineOfSight } from './src/collision3d.ts';
import { COLLISION_SCENES, collisionSceneKey, collisionRouteAllowed, dungeonCollisionFlags } from './src/collision-context.ts';
import { createZeppelinFlight, zeppelinPose, zeppelinPort } from './src/zeppelin.ts';
import { EMOTES, emoteValid } from './src/emotes.ts';
import { MOUNTS, MOUNT_UNLOCK_LEVEL, MOUNT_UPGRADE_LEVEL, MOUNT_CAST_MS, WALK_SPEED, SPRINT_SPEED, STAMINA_MAX, STAMINA_DRAIN, STAMINA_RECOVERY, EXHAUSTION_RECOVERY, mountSpeed, canSprint, newTravel, rollDungeonMount } from './src/travel.ts';
import { createMovementCredit } from './src/movement-credit.mjs';

const NPCS = LOCAL_NPCS.map(n => toWorld(n.zone, n));
const GATEWAYS = LOCAL_GATEWAYS.map(n => toWorld(n.zone, n));
const BEACONS = LOCAL_BEACONS.map(n => toWorld(n.zone, n));

const ROOT = dirname(fileURLToPath(import.meta.url));
let collisionAssetsReady;
function loadCollisionAssets() {
  const directory = existsSync(resolve(ROOT, 'public/collision')) ? 'public/collision' : 'dist/collision';
  return collisionAssetsReady ??= Promise.all(COLLISION_SCENES.map(async key => {
    const data = JSON.parse(readFileSync(resolve(ROOT, directory, `${key}.json`), 'utf8'));
    const bytes = readFileSync(resolve(ROOT, directory, `${key}.bin`));
    await installCollisionScene(key, data, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }));
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const zeppelinDockPosition = id => { const port = zeppelinPort(id); return { x: port.x, z: port.z, rotation: 0, zone: port.id }; };
const hash = token => createHash('sha256').update(token).digest('hex');
const cleanText = (value, max) => typeof value === 'string' ? value.replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
const send = (socket, message) => {
  if (socket.readyState !== WebSocket.OPEN) return;
  // Snapshots are replaced every tick; a slow reader needs the latest state, not a growing history.
  if (message.type === 'snapshot' && socket.bufferedAmount > 256 * 1024) return;
  const data = JSON.stringify(message);
  if (socket.bufferedAmount + Buffer.byteLength(data) + 10 > 8 * 1024 * 1024) {
    console.warn('Closing a slow game connection: outgoing messages exceeded the queue limit.');
    socket.terminate();
    return;
  }
  socket.send(data, { compress: message.type === 'snapshot' });
};
const nonnegativeInteger = n => Number.isSafeInteger(n) && n >= 0;
const socialIdValid = id => typeof id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id);
const SOCIAL_LIST_LIMIT = 100;
const socialRequests = { friendsList: 'list', friendAdd: 'add', friendRemove: 'remove', friendRespond: 'accept', friendCancel: 'cancel', ignoreAdd: 'ignoreAdd', ignoreRemove: 'ignoreRemove' };
const socialRequest = message => message.type === 'friendRespond' && message.accept === false ? 'decline' : socialRequests[message.type];
const socialIdsValid = (ids, self) => Array.isArray(ids) && ids.length <= SOCIAL_LIST_LIMIT && new Set(ids).size === ids.length && ids.every(id => socialIdValid(id) && id !== self);
const zoneIds = new Set(ZONES.map(zone => zone.id));
const enemyStats = MONSTERS;
const CHASE_DISTANCE = 40;
const newSkills = () => ({ mining: 0, woodcutting: 0, herbalism: 0, fishing: 0 });
const inventoryKeys = ['wood', 'crystal', 'potion', 'herb', 'relic'];
const starterItems = new Set(CHARACTER_CLASSES.flatMap(name => starterGear(name).ownedGear));
// Only the pre-trainer catalog was auto-learned by old characters. New lessons still require a trainer.
const legacySpellLevels = { arrow:1, volley:20, 'power-shot':5, multishot:15, 'poison-shot':10, fireball:1, nova:10, frostbolt:5, 'arcane-burst':15, meteor:20, strike:1, whirlwind:15, cleave:5, shockwave:20, 'shield-bash':10 };
const socialFields = {
  dungeonSummon: ['type', 'dungeonId', 'targetId'], dungeonSummonRespond: ['type', 'summonId', 'accept'],
  duelRequest: ['type', 'targetId'], duelAccept: ['type', 'invitationId'], duelDecline: ['type', 'invitationId'], duelForfeit: ['type'],
  arenaRequest: ['type', 'targetId', 'size', 'wagerMoss'], arenaAccept: ['type', 'invitationId'], arenaDecline: ['type', 'invitationId'], arenaForfeit: ['type'],
  arenaQueueJoin: ['type', 'size'], arenaQueueLeave: ['type'],
  whisper: ['type', 'targetId', 'text'], tradeRequest: ['type', 'targetId'], tradeRespond: ['type', 'tradeId', 'accept'],
  tradeOffer: ['type', 'tradeId', 'offer'], tradeAccept: ['type', 'tradeId', 'revision'], tradeCancel: ['type', 'tradeId'],
};
const treasureMapFields = { treasureMapStart:['type'], treasureMapSearch:['type','expeditionId'], treasureMapOpen:['type','expeditionId'] };
const arenaWagerFields = { arenaWagerOpen: ['type'], arenaWagerCheck: ['type', 'matchId'], arenaWalletChallenge: ['type', 'wallet'], arenaWalletBind: ['type', 'signature'] };
const treasureFields = { treasureOpen:['type'], treasureRedeem:['type'], treasureCheck:['type','claimId'], treasureRefresh:['type','claimId'], treasureSubmitted:['type','claimId','transactionHash'] };
const storeFields = { storeOpen: ['type'], storeWalletChallenge: ['type', 'wallet'], storeWalletBind: ['type', 'signature'], storeQuote: ['type', 'productId'], storeActivateBoost: ['type', 'boostId'], storeBuyBoost: ['type', 'boostId'], storeBuyClass: ['type', 'className'], storePaymentCheck: ['type', 'orderId'], storeChangeClass: ['type', 'orderId', 'className'] };
const nftFields = { nftOpen: ['type'], nftClaimPet: ['type', 'pet'], nftClaimMount: ['type', 'mount'], nftPaymentCheck: ['type', 'orderId'], nftMigrationReview: ['type', 'tokenId'],
  nftAuctionOpen: ['type', 'npcId'], nftBidHouse: ['type', 'npcId', 'houseId', 'amountWei'], nftSettleHouse: ['type', 'npcId', 'houseId'],
  nftWithdrawBid: ['type', 'npcId'], nftAuctionCheck: ['type', 'npcId', 'transactionHash', 'action', 'paymentWei'] };
const NFT_OWNERSHIP_MAX_AGE_MS = 15000;
const auctionFields = { auctionOpen: ['type', 'npcId'], auctionWalletChallenge: ['type', 'npcId', 'wallet'], auctionWalletBind: ['type', 'npcId', 'signature'], auctionPaymentCheck: ['type', 'npcId', 'listingId'], auctionList: ['type', 'npcId', 'item', 'currency', 'price'], auctionBuy: ['type', 'npcId', 'listingId'], auctionCancel: ['type', 'npcId', 'listingId'] };
const trainingFields = { learnSpell: ['type', 'npcId', 'ability'], learnRiding: ['type', 'npcId', 'rank'], buyMount: ['type', 'npcId', 'mount'] };
const merchantSaleTypes = new Set(['sellGear', 'sellBag', 'sellItem', 'sellResource']);
const bagFields = { buyBag: ['type', 'npcId', 'itemId'], sellBag: ['type', 'npcId', 'bagId'], equipBag: ['type', 'bagId', 'slot'], unequipBag: ['type', 'slot'] };
const bankFields = { bankOpen: ['type', 'npcId'], bankDeposit: ['type', 'npcId', 'item'], bankWithdraw: ['type', 'npcId', 'item'] };
const onboardingActions = {
  buyBag: 'bag', sellBag: 'bag', equipBag: 'bag', unequipBag: 'bag', dropItem: 'bag', buyGear: 'gear', upgradeGear: 'gear', sellGear: 'gear', equipGear: 'gear', unequipGear: 'gear',
  setHotbar: 'spells', learnSpell: 'spells', learnRiding: 'mounts', buyMount: 'mounts', mount: 'mounts',
  craft: 'crafting', acceptContract: 'contracts', claimContract: 'contracts', partyInvite: 'party', partyAccept: 'party',
  dungeonEnter: 'dungeon', dungeonSummon: 'dungeon', learnTalent: 'talents', resetTalents: 'talents',
  tradeRequest: 'gear', tradeAccept: 'gear',
  bankOpen: 'gear', bankDeposit: 'gear', bankWithdraw: 'gear',
};
const newQuest = (chapter = 0, stage = 0) => ({ chapter, stage, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[chapter].objectives.map(o => [o.id, 0])), completed: false, ending: null });
const objectivesDone = q => CHAPTERS[q.chapter].objectives.every(o => q.progress[o.id] >= o.count);
function questValid(q) {
  if (!q || !Number.isInteger(q.chapter) || !CHAPTERS[q.chapter] || ![0, 1, 2, 3].includes(q.stage)
      || !q.progress || typeof q.progress !== 'object' || Array.isArray(q.progress) || typeof q.completed !== 'boolean') return false;
  const objectives = CHAPTERS[q.chapter].objectives;
  if (Object.keys(q.progress).length !== objectives.length || !objectives.every(o => Number.isInteger(q.progress[o.id]) && q.progress[o.id] >= 0 && q.progress[o.id] <= o.count)) return false;
  if (q.kills !== objectives.filter(o => o.kind === 'kill').reduce((n, o) => n + q.progress[o.id], 0)
      || q.crystals !== objectives.filter(o => o.kind === 'gather').reduce((n, o) => n + q.progress[o.id], 0)) return false;
  return (q.stage !== 0 || q.chapter === 0 && Object.values(q.progress).every(n => n === 0)) && (q.stage !== 1 || !objectivesDone(q)) && (q.stage < 2 || objectivesDone(q))
    && (q.completed ? q.chapter === 8 && q.stage === 3 && typeof q.ending === 'string' && Object.hasOwn(ENDINGS, q.ending) : q.stage !== 3 && q.ending === null);
}
function progressionValid(p) {
  if (typeof p.characterCreated !== 'boolean' || !Array.isArray(p.talents) || !Array.isArray(p.ownedGear)
      || new Set(p.ownedGear).size !== p.ownedGear.length
      || !p.equipment || typeof p.equipment !== 'object' || Array.isArray(p.equipment) || Object.keys(p.equipment).length !== EQUIPMENT_SLOTS.length) return false;
  if (p.talentVersion !== TALENT_VERSION || !talentsValid(p)) return false;
  if (!p.ownedGear.every(id => typeof id === 'string' && gearIdValid(id) && gearById(id).requiredLevel <= p.level)) return false;
  return !(p.equipment.ring1 && p.equipment.ring1 === p.equipment.ring2)
    && EQUIPMENT_SLOTS.every(slot => slot !== 'weapon' && slot !== 'armor' && p.equipment[slot] === null
      || typeof p.equipment[slot] === 'string' && p.ownedGear.includes(p.equipment[slot]) && gearFitsSlot(p.equipment[slot], slot)
        && (!gearById(p.equipment[slot]).className || gearById(p.equipment[slot]).className === p.appearance.className));
}
function trainingValid(p) {
  return Array.isArray(p.learnedSpells) && new Set(p.learnedSpells).size === p.learnedSpells.length
    && p.learnedSpells.every(id => abilityValid(id, p.appearance.className) && !SPELLS[id].requiredTalent && abilityUnlocked(id, p.appearance.className, p.level))
    && [0, 1, 2].includes(p.ridingRank) && (p.ridingRank === 0 || p.level >= (p.ridingRank === 1 ? MOUNT_UNLOCK_LEVEL : MOUNT_UPGRADE_LEVEL))
    && Array.isArray(p.ownedMounts) && new Set(p.ownedMounts).size === p.ownedMounts.length
    && p.ownedMounts.every(id => MOUNTS.some(mount => mount.id === id)) && (p.ridingRank > 0 || p.ownedMounts.every(id => MOUNTS.some(mount => mount.id === id && (mount.storeOnly || mount.dropOnly || 'referralOnly' in mount))));
}
const savedZeppelinValid = flight => flight && typeof flight === 'object' && !Array.isArray(flight)
  && Object.keys(flight).length === 4 && Number.isFinite(flight.startedAt) && flight.startedAt >= 0
  && Number.isFinite(flight.arrivesAt) && flight.arrivesAt > flight.startedAt && flight.arrivesAt <= Number.MAX_SAFE_INTEGER
  && createZeppelinFlight(flight.from, flight.to, flight.startedAt)?.arrivesAt === flight.arrivesAt;
const savedPlayerValid = (p, maxLevel = MAX_LEVEL) => p && typeof p === 'object'
  && typeof p.id === 'string' && /^[\da-f-]{36}$/.test(p.id)
  && socialIdsValid(p.friendIds, p.id) && socialIdsValid(p.friendRequestIds, p.id) && socialIdsValid(p.ignoreIds, p.id) && !p.friendIds.some(id => p.ignoreIds.includes(id))
  && typeof p.name === 'string' && p.name.length > 0 && cleanText(p.name, 20) === p.name
  && appearanceValid(p.appearance) && [p.x, p.z, p.rotation].every(Number.isFinite)
  && (p.standingPosition === undefined || p.standingPosition && [p.standingPosition.x, p.standingPosition.y, p.standingPosition.z].every(Number.isFinite) && Math.abs(p.standingPosition.y) < 1000)
  && (p.onboarding === undefined || onboardingValid(p.onboarding))
  && achievementsValid(p.achievements)
  && arenaRatingsValid(p.arenaRatings)
  && arenaWagersValid(p.arenaWagers)
  && (p.title === null || !!getTitle(p.title))
  && (p.rootvaultUnlocked === undefined || typeof p.rootvaultUnlocked === 'boolean')
  && Array.isArray(p.zeppelinPorts) && p.zeppelinPorts.every(id => zoneIds.has(id)) && new Set(p.zeppelinPorts).size === p.zeppelinPorts.length
  && (p.zeppelin === undefined || savedZeppelinValid(p.zeppelin))
  && p.coordinateVersion === 2 && regionAt(p.x, p.z) === p.zone
  && Number.isSafeInteger(p.level) && p.level >= 1 && p.level <= maxLevel
  && nonnegativeInteger(p.hp) && p.hp <= p.maxHp
  && (p.diedAt === undefined || Number.isFinite(p.diedAt) && p.diedAt >= 0)
  && nonnegativeInteger(p.xp) && p.xp < p.level * 100 && nonnegativeInteger(p.gold)
  && (maxLevel > MAX_LEVEL || p.level < MAX_LEVEL || p.xp === 0)
  && p.inventory && ['wood', 'crystal', 'potion', 'herb', 'relic'].every(k => nonnegativeInteger(p.inventory[k]))
  && nonnegativeInteger(p.craftingXp) && validateContracts(p.contracts) && storyQuestsValid(p.storyQuests)
  && typeof p.meadGodPaid === 'boolean'
  && p.skills && typeof p.skills === 'object' && !Array.isArray(p.skills) && Object.keys(SKILLS).every(k => nonnegativeInteger(p.skills[k]) && p.skills[k] <= MAX_SKILL_XP)
  && raidProgressValid(p.raidProgress) && progressionValid(p) && p.maxHp === maxHealth(p) && bagsValid(p) && carriedItemsValid(p) && nonnegativeInteger(p.itemUseReadyAt) && (p.heatproofUntil === undefined || nonnegativeInteger(p.heatproofUntil)) && (p.dreamRestReadyAt === undefined || nonnegativeInteger(p.dreamRestReadyAt))
  && itemLocksValid(p) && auctionListingsValid(p) && bankPlayerValid(p) && storePlayerValid(p) && nftPlayerValid(p) && specialistNftPlayerValid(p) && treasurePlayerValid(p) && treasureMapPlayerValid(p)
  && (p.bank?.gear ?? []).every(id => gearById(id).requiredLevel <= p.level)
  && (p.bank?.bags ?? []).every(bag => BAG_ITEMS[bag.kind].requiredLevel <= p.level)
  && trainingValid(p) && hotbarValid(extendedHotbar(p.hotbar, p.hotbarExtra), p.appearance.className, p.level, p.learnedSpells, p.talents) && hotbarValid(extendedHotbar(p.hotbar2, p.hotbar2Extra), p.appearance.className, p.level, p.learnedSpells, p.talents)
  && Array.isArray(p.ownedPets) && new Set(p.ownedPets).size === p.ownedPets.length && p.ownedPets.every(isPetId)
  && tamedCompanionValid(p.tamedCompanion)
  && (p.summonedPet === null || isPetId(p.summonedPet) && p.ownedPets.includes(p.summonedPet))
  && PET_LOOT_QUALITIES.includes(p.petLootMinQuality)
  && zoneIds.has(p.zone) && questValid(p.quest);
function migratePlayer(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return p;
  // Realm is a login destination, never character ownership.
  delete p.realmId;
  // Roles belong to a verified connection, never to character save data.
  delete p.role;
  delete p.gm;
  delete p.betaTester;
  delete p.pendingAuctionPurchases;
  delete p.emote;
  delete p.nftPets;
  delete p.nftMounts;
  delete p.nftMintableMounts;
  delete p.nftMountsConfigured;
  delete p.nftHouses;
  delete p.nftConfigured;
  delete p.nftMintablePets;
  delete p.combatCompanion;
  delete p.combatCompanionRecallAt;
  if (!Object.hasOwn(p, 'tamedCompanion')) p.tamedCompanion = null;
  if (!Object.hasOwn(p, 'title')) p.title = null;
  if (!Object.hasOwn(p, 'arenaRatings')) p.arenaRatings = normalizeArenaRatings();
  if (!Object.hasOwn(p, 'ownedPets')) p.ownedPets = [];
  if (!Object.hasOwn(p, 'treasureMap')) p.treasureMap = null;
  if (!Object.hasOwn(p, 'treasureClaims')) p.treasureClaims = [];
  if (!Object.hasOwn(p, 'storeOrders')) p.storeOrders = [];
  if (!Object.hasOwn(p, 'nftOrders')) p.nftOrders = [];
  if (!Object.hasOwn(p, 'specialistNftOrders')) p.specialistNftOrders = [];
  if (!Object.hasOwn(p, 'mobileStoreOrders')) p.mobileStoreOrders = [];
  if (!Object.hasOwn(p, 'storeGrants')) p.storeGrants = [];
  if (!Object.hasOwn(p, 'storePurchases')) p.storePurchases = [];
  if (!Object.hasOwn(p, 'storeConsumables')) p.storeConsumables = {};
  if (!Object.hasOwn(p, 'storeBoosts')) p.storeBoosts = {};
  if (!Object.hasOwn(p, 'summonedPet')) p.summonedPet = null;
  if (!Object.hasOwn(p, 'petLootMinQuality')) p.petLootMinQuality = 'uncommon';
  p.zeppelinPorts = Array.isArray(p.zeppelinPorts) ? [...new Set(p.zeppelinPorts.filter(id => zoneIds.has(id)))] : [];
  if (!savedZeppelinValid(p.zeppelin)) delete p.zeppelin;
  // Atlas saves already kept the validated overworld return in x/z/rotation/zone.
  delete p.atlasLocation;
  // Retired appearance options migrate only at the save boundary, never at creation.
  p.appearance = migrateLegacyAppearance(p.appearance);
  // Only absent fields are legacy data. Existing invalid values must still fail validation.
  if (!Object.hasOwn(p, 'auctions')) p.auctions = [];
  if (!Object.hasOwn(p, 'auctionSales')) p.auctionSales = [];
  if (!Object.hasOwn(p, 'arenaWagers')) p.arenaWagers = [];
  if (!Object.hasOwn(p, 'bank')) p.bank = newBank();
  if (!Object.hasOwn(p, 'friendIds')) p.friendIds = [];
  if (!Object.hasOwn(p, 'friendRequestIds')) p.friendRequestIds = [];
  if (!Object.hasOwn(p, 'ignoreIds')) p.ignoreIds = [];
  if (!Object.hasOwn(p, 'carriedItems')) p.carriedItems = {};
  if (!Object.hasOwn(p, 'itemUseReadyAt')) p.itemUseReadyAt = 0;
  if (!Object.hasOwn(p, 'skills')) p.skills = newSkills();
  if (p.skills && typeof p.skills === 'object' && !Array.isArray(p.skills) && !Object.hasOwn(p.skills, 'fishing')) p.skills.fishing = 0;
  if (p.inventory && typeof p.inventory === 'object' && !Object.hasOwn(p.inventory, 'herb')) p.inventory.herb = 0;
  if (p.inventory && typeof p.inventory === 'object' && !Object.hasOwn(p.inventory, 'relic')) p.inventory.relic = 0;
  if (!Object.hasOwn(p, 'craftingXp')) p.craftingXp = 0;
  if (!Object.hasOwn(p, 'contracts')) p.contracts = newContracts();
  if (!Object.hasOwn(p, 'storyQuests')) p.storyQuests = newStoryQuests();
  if (!Object.hasOwn(p, 'meadGodPaid')) p.meadGodPaid = false;
  if (!Object.hasOwn(p, 'rootvaultUnlocked')) p.rootvaultUnlocked = p.quest?.chapter >= 8
    || p.quest?.chapter === 7 && (p.quest.progress?.['break-warden'] ?? 0) >= 1 || (p.contracts.completed?.['hollow-vault'] ?? 0) > 0;
  if (!Object.hasOwn(p, 'coordinateVersion')) {
    const zone = p.zone ?? 'greenwood';
    if (!zoneIds.has(zone) || ![p.x, p.z].every(Number.isFinite) || Math.abs(p.x) > 38 || Math.abs(p.z) > 38) throw new Error('Invalid legacy coordinates; refusing to overwrite progress.');
    const origins = { greenwood: { x: 0, z: 0 }, amberwild: { x: 0, z: -96 }, frostmarch: { x: 96, z: -96 }, hollow: { x: 96, z: 0 } };
    p.x += origins[zone].x; p.z += origins[zone].z; p.zone = zone; p.coordinateVersion = 1;
  }
  if (p.coordinateVersion === 1) { Object.assign(p, migrateWorldPositionV2(p)); p.coordinateVersion = 2; }
  if (!Object.hasOwn(p, 'characterCreated')) p.characterCreated = true;
  if (!Object.hasOwn(p, 'talents')) p.talents = [];
  const previousTalentVersion = p.talentVersion;
  if (appearanceValid(p.appearance)) migrateTalents(p);
  // Legacy looks keep their saved colors and silhouette; optional appearance
  // fields are resolved to the original human/male/bright defaults at rendering.
  if (appearanceValid(p.appearance)) {
    migrateRetiredSpells(p);
    const gear = starterGear(p.appearance.className);
    if (!Object.hasOwn(p, 'learnedSpells')) p.learnedSpells = spellsForClass(p.appearance.className).filter(spell => spell.requiredLevel === 1 || legacySpellLevels[spell.id] <= p.level).map(spell => spell.id);
    if (!Object.hasOwn(p, 'ridingRank')) p.ridingRank = p.level >= MOUNT_UPGRADE_LEVEL ? 2 : p.level >= MOUNT_UNLOCK_LEVEL ? 1 : 0;
    if (!Object.hasOwn(p, 'ownedMounts')) p.ownedMounts = p.ridingRank > 0 ? MOUNTS.filter(mount => !mount.storeOnly && !mount.dropOnly && !('referralOnly' in mount)).map(mount => mount.id) : [];
    // Preserve eight-slot prefixes for realms still running the previous release.
    for (const bank of ['hotbar', 'hotbar2']) {
      const tail = `${bank}Extra`;
      if (Array.isArray(p[bank]) && p[bank].length === HOTBAR_PAGE_SIZE && !Object.hasOwn(p, tail)) { p[tail] = p[bank].slice(LEGACY_HOTBAR_PAGE_SIZE); p[bank] = p[bank].slice(0, LEGACY_HOTBAR_PAGE_SIZE); }
      if (!Object.hasOwn(p, tail)) p[tail] = [null, null];
      // Older realms can change class while retaining the then-unknown tail.
      else if (Array.isArray(p[tail]) && p[tail].length === 2 && p[tail].every(slot => slot === null || slot === 'mend' || slot === 'interact' || abilityValid(slot)))
        p[tail] = p[tail].map(slot => abilityValid(slot) && !abilityUnlocked(slot, p.appearance.className, p.level, p.learnedSpells, p.talents) ? null : slot);
    }
    if (!Object.hasOwn(p, 'hotbar')) p.hotbar = defaultHotbar(p.appearance.className, p.level, p.learnedSpells).slice(0, LEGACY_HOTBAR_PAGE_SIZE);
    else if (hotbarValid(extendedHotbar(p.hotbar, p.hotbarExtra), p.appearance.className)) p.hotbar = availableHotbar(extendedHotbar(p.hotbar, p.hotbarExtra), p.appearance.className, p.level, p.learnedSpells, p.talents).slice(0, LEGACY_HOTBAR_PAGE_SIZE);
    if (!Object.hasOwn(p, 'hotbar2')) p.hotbar2 = Array(LEGACY_HOTBAR_PAGE_SIZE).fill(null);
    // An older realm can change class while preserving this then-unknown field.
    // Clear only known but unavailable spells; malformed banks must still fail validation.
    else if (Array.isArray(p.hotbar2) && p.hotbar2.length === 8 && p.hotbar2.every(slot => slot === null || slot === 'mend' || slot === 'interact' || abilityValid(slot)))
      p.hotbar2 = p.hotbar2.map(slot => abilityValid(slot) && !abilityUnlocked(slot, p.appearance.className, p.level, p.learnedSpells, p.talents) ? null : slot);
    if (!Object.hasOwn(p, 'ownedGear')) p.ownedGear = gear.ownedGear;
    if (!Object.hasOwn(p, 'equipment')) p.equipment = gear.equipment;
  }
  if (p.equipment && typeof p.equipment === 'object' && !Array.isArray(p.equipment)) {
    for (const slot of ['head', 'legs', 'shoes', 'back', 'ring1', 'ring2']) if (!Object.hasOwn(p.equipment, slot)) p.equipment[slot] = null;
  }
  // Old gear gains catalog attributes without healing injured or resurrecting dead characters.
  if (appearanceValid(p.appearance) && Number.isSafeInteger(p.level) && p.level >= 1 && p.level <= 1000000
    && progressionValid(p)
    && (!Object.values(p.equipment).some(id => /~[23]~/.test(id ?? '')) && p.maxHp === 100 + (p.level - 1) * 12
      || previousTalentVersion !== p.talentVersion && p.maxHp === maxHealth({ ...p, talents: [] }))
    && nonnegativeInteger(p.hp) && p.hp <= p.maxHp) p.maxHp = maxHealth(p);
  migrateBags(p, randomUUID);
  if (!Object.hasOwn(p, 'achievements')) p.achievements = newAchievements(p);
  const old = p.quest;
  if (!old || Object.hasOwn(old, 'chapter')) return migrateLevelCap(p);
  if (![0, 1, 2, 3].includes(old.stage) || !['kills', 'crystals'].every(k => Number.isInteger(old[k]) && old[k] >= 0 && old[k] <= 3)
      || (old.stage === 0 && (old.kills || old.crystals)) || (old.stage >= 2 && (old.kills !== 3 || old.crystals !== 3))) throw new Error('Invalid legacy quest; refusing to overwrite it.');
  p.zone ??= 'greenwood';
  p.quest = old.stage === 3 ? newQuest(1, 1) : newQuest(0, old.stage);
  if (old.stage !== 3) {
    p.quest.kills = old.kills; p.quest.crystals = old.crystals;
    p.quest.progress['grove-slimes'] = old.kills; p.quest.progress['grove-crystals'] = old.crystals;
    if (p.quest.stage === 1 && objectivesDone(p.quest)) p.quest.stage = 2;
  }
  return migrateLevelCap(p);
}
function migrateLevelCap(p) {
  if (p.level < MAX_LEVEL || !savedPlayerValid(p, 1000000)) return p;
  p.level = MAX_LEVEL;
  p.xp = 0;
  p.maxHp = maxHealth(p);
  p.hp = Math.min(p.hp, p.maxHp);
  return p;
}
export function migrateRecords(records) {
  if (!records || typeof records !== 'object' || Array.isArray(records)) return records;
  for (const [key, account] of Object.entries(records)) {
    if (account && typeof account === 'object' && Object.hasOwn(account, 'characters')) {
      if (Array.isArray(account.characters)) { account.characters.forEach(migratePlayer); migrateReferral(account, key); }
      continue;
    }
    const p = migratePlayer(account);
    if (!savedPlayerValid(p)) throw new Error('Invalid player save; refusing to overwrite it.');
    // A former creation draft had no gameplay. Never discard a draft carrying progress.
    if (!p.characterCreated && (p.level !== 1 || p.xp !== 0 || p.gold !== 0 || p.hp !== 100 || p.zone !== 'greenwood' || p.x !== 0 || p.z !== 8 || p.rotation !== 0
        || p.inventory.wood !== 0 || p.inventory.crystal !== 0 || p.inventory.herb !== 0 || p.inventory.potion !== 3
        || Object.values(p.skills).some(xp => xp !== 0) || p.talents.length || p.ownedGear.length !== 2 || p.equipment.charm !== null || p.ownedBags.length
        || p.inventory.relic !== 0 || p.craftingXp !== 0 || Object.keys(p.contracts.active).length || Object.keys(p.contracts.completed).length
        || Object.keys(p.storyQuests.active).length || p.storyQuests.completed.length || p.storyQuests.treasures?.length
        || p.tamedCompanion || p.treasureMap || p.ownedPets.length || p.nftOrders.length || p.summonedPet !== null || Object.keys(p.carriedItems).length || p.itemUseReadyAt || p.heatproofUntil || p.quest.chapter !== 0 || p.quest.stage !== 0
        || p.meadGodPaid)) throw new Error('Invalid pending player save; refusing to discard progress.');
    records[key] = migrateReferral({ characters: p.characterCreated ? [p] : [] }, key);
  }
  return records;
}
export function validateRecords(records, partial = false) {
  if (!records || typeof records !== 'object' || Array.isArray(records)
      || Object.entries(records).some(([key, account]) => !/^[\da-f]{64}$/.test(key) || !account || typeof account !== 'object' || Array.isArray(account)
        || Object.keys(account).some(key => !['characters', 'ban', 'betaTester', 'communityRulesVersion', 'gmProtected', 'goldLedger', 'lastTreasureClaimAt', 'referral'].includes(key)) || (Object.hasOwn(account, 'ban') && !accountBanValid(account.ban))
        || !referralValid(account.referral)
        || (Object.hasOwn(account, 'lastTreasureClaimAt') && !nonnegativeInteger(account.lastTreasureClaimAt))
        || (Object.hasOwn(account, 'goldLedger') && (!Array.isArray(account.goldLedger) || !account.goldLedger.every(goldEventValid)))
        || (Object.hasOwn(account, 'betaTester') && account.betaTester !== true)
        || (Object.hasOwn(account, 'gmProtected') && account.gmProtected !== true)
        || (Object.hasOwn(account, 'communityRulesVersion') && account.communityRulesVersion !== COMMUNITY_VERSION)
        || !Array.isArray(account.characters) || account.characters.length > 6
        || account.characters.some(p => !savedPlayerValid(p) || p.characterCreated !== true || p.title !== null && !titleUnlocked({ ...p, betaTester: account.betaTester === true }, getTitle(p.title)))
        || new Set(account.characters.map(p => p.name.toLowerCase())).size !== account.characters.length)) throw new Error('Invalid player save; refusing to overwrite it.');
  const characters = Object.values(records).flatMap(account => account.characters);
  if (new Set(characters.map(p => p.id)).size !== characters.length) throw new Error('Invalid player save; refusing duplicate character ownership.');
  const outgoingRequests = new Map();
  for (const p of characters) for (const id of p.friendRequestIds) {
    const count = (outgoingRequests.get(id) || 0) + 1;
    if (count > SOCIAL_LIST_LIMIT) throw new Error('Invalid player save; too many outgoing friend requests.');
    outgoingRequests.set(id, count);
  }
  const bagIds = characters.flatMap(p => [...p.ownedBags, ...(p.bank?.bags ?? [])].map(bag => bag.id));
  if (new Set(bagIds).size !== bagIds.length) throw new Error('Invalid player save; refusing duplicate bag ownership.');
  const treasureClaims = characters.flatMap(p => p.treasureClaims);
  if (new Set(treasureClaims.map(claim => claim.claimHash)).size !== treasureClaims.length) throw Error('Duplicate treasury claim.');
  const storeOrders = characters.flatMap(p => p.storeOrders);
  if (new Set(storeOrders.map(order => order.id)).size !== storeOrders.length) throw new Error('Invalid player save; refusing duplicate store orders.');
  const nftOrders = characters.flatMap(p => p.nftOrders);
  if (new Set(nftOrders.map(order => order.id)).size !== nftOrders.length) throw new Error('Invalid player save; refusing duplicate NFT orders.');
  const mobileOrders = characters.flatMap(p => p.mobileStoreOrders);
  const storeGrants = characters.flatMap(p => p.storeGrants || []);
  if (new Set(storeGrants.map(grant => grant.id)).size !== storeGrants.length) throw new Error('Invalid player save; refusing duplicate complimentary grants.');
  if (new Set(mobileOrders.map(order => order.id)).size !== mobileOrders.length
      || new Set(mobileOrders.filter(order => order.paymentId).map(order => `${order.platform}:${order.paymentId}`)).size !== mobileOrders.filter(order => order.paymentId).length) throw new Error('Invalid player save; refusing duplicate mobile payments.');
  const listings = characters.flatMap(p => p.auctions);
  if (new Set(listings.map(listing => listing.id)).size !== listings.length) throw new Error('Invalid player save; refusing duplicate auction listings.');
  for (const listing of listings) if (!partial && listing.reservation && (!characters.some(player => player.id === listing.reservation.buyerId)
      || Object.values(records).some(account => account.characters.some(player => player.id === listing.sellerId) && account.characters.some(player => player.id === listing.reservation.buyerId)))) throw new Error('Invalid player save; auction reservation has no distinct buyer account.');
}

export function createGameServer({ port = Number(process.env.PORT || 2567), host = process.env.HOST || '0.0.0.0', dataDir = process.env.DATA_DIR || resolve(ROOT, '.data'), keycloak = undefined, keycloakAccountIssuer = process.env.KEYCLOAK_ACCOUNT_ISSUER || undefined, databaseUrl = process.env.DATABASE_URL || '', databaseCaBase64 = process.env.DATABASE_CA_BASE64 || '', auctionChain = undefined, mossAuctionChain = undefined, arenaChain = undefined, storeChain = undefined, goldMerchantHoldings = readMossHoldings, chatTranslation = undefined, treasuryHoldings = readMossHoldings, treasuryChain = undefined, nftChain = undefined, specialistNftChain = undefined, mobilePurchaseVerifier = undefined, mobileAppUpdate = undefined, mobilePushConfig = undefined, accountDeletionProvider = undefined, walletOidc = undefined, deploymentControl = undefined, realmId = process.env.REALM_ID || 'eu', realmEuOrigin = process.env.REALM_EU_ORIGIN || '', realmUsOrigin = process.env.REALM_US_ORIGIN || '', realmAsiaOrigin = process.env.REALM_ASIA_ORIGIN || '', gameAllowedOrigins = process.env.GAME_ALLOWED_ORIGINS || '', treasureRandomInt = randomInt, treasureMapRandomInt = randomInt, dreamRandomInt = randomInt, mountRandomInt = randomInt, localGmAccountKeys = [], economyVersion = 0, goldExchangeEnabled = false, polls = POLLS, referralPrice = undefined, referralsEnabled = process.env.REFERRALS_ENABLED === undefined
    ? isProductionMossAuctionContract(process.env.MOSS_AUCTION_CONTRACT) && Number(process.env.MOSS_AUCTION_CHAIN_ID || 4663) === 4663
    : process.env.REFERRALS_ENABLED === '1' } = {}) {
  const turnkey = createTurnkeyConfig(), sponsorshipConfig = createTurnkeySponsorshipConfig();
  const appUpdate = parseAppUpdatePolicy(mobileAppUpdate ?? JSON.parse(readFileSync(resolve(ROOT, 'config/mobile-app-updates.json'), 'utf8')));
  const pushConfig = mobilePushConfig === undefined ? JSON.parse(readFileSync(resolve(ROOT, 'config/mobile-push.json'), 'utf8')) : mobilePushConfig;
  if (!pushConfig || typeof pushConfig !== 'object' || Array.isArray(pushConfig) || Object.keys(pushConfig).length !== 1
      || !Object.hasOwn(pushConfig, 'enabled') || typeof pushConfig.enabled !== 'boolean') throw Error('Invalid mobile push configuration.');
  const pushOverride = process.env.MOBILE_PUSH_ENABLED;
  if (pushOverride !== undefined && !['0', '1'].includes(pushOverride)) throw Error('MOBILE_PUSH_ENABLED must be 0 or 1.');
  const pushEnabled = pushOverride === undefined ? pushConfig.enabled : pushOverride === '1';
  if (typeof referralsEnabled !== 'boolean') throw Error('Invalid referral activation setting.');
  if (!pollsValid(polls)) throw Error('Invalid poll catalog.');
  polls = structuredClone(polls);
  if (![0, 1].includes(economyVersion) || typeof goldExchangeEnabled !== 'boolean' || goldExchangeEnabled && economyVersion !== 1) throw Error('Invalid gold economy configuration.');
  const hosting = createHostingConfig(realmId, realmEuOrigin, realmUsOrigin, realmAsiaOrigin);
  if (typeof gameAllowedOrigins !== 'string') throw Error('GAME_ALLOWED_ORIGINS must be a comma-separated list of origins.');
  const allowedOrigins = new Set(['https://account.mossvale.world', realmEuOrigin, realmUsOrigin, realmAsiaOrigin, ...gameAllowedOrigins.split(',').map(value => value.trim())].filter(Boolean).map(hostingOrigin));
  function allowedRequestOrigin(request) {
    const origin = request.headers.origin;
    if (origin === undefined) return true; // Native clients still authenticate; browsers always send Origin for cross-origin requests.
    try {
      if (hostingOrigin(origin) !== origin) return false;
      return allowedOrigins.has(origin) || new URL(origin).host === request.headers.host;
    } catch { return false; }
  }
  const realmMatches = message => message.realmId === realmId || realmId === 'eu' && !Object.hasOwn(message, 'realmId');
  if (keycloak === undefined) {
    const { KEYCLOAK_URL: url, KEYCLOAK_REALM: realm, KEYCLOAK_CLIENT_ID: clientId } = process.env;
    keycloak = url || realm || clientId ? { url, realm, clientId } : null;
  }
  if (sponsorshipConfig && (!turnkey || !keycloak || !databaseUrl)) throw Error('Wallet sponsorship requires configured embedded wallets, account authentication and the canonical database.');
  if (!Array.isArray(localGmAccountKeys) || !Array.from(localGmAccountKeys).every(key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key))) throw Error('localGmAccountKeys must be an array of lowercase SHA-256 account keys.');
  if (localGmAccountKeys.length && (!['127.0.0.1', '::1'].includes(host) || keycloak || databaseUrl || process.env.NODE_ENV === 'production')) throw Error('Local guest GM access requires a non-production loopback server without Keycloak or a database.');
  const localGmKeys = new Set(localGmAccountKeys);
  if (realmId !== 'eu' && !keycloak && (process.env.NODE_ENV === 'production' || !['127.0.0.1', '::1', 'localhost'].includes(host))) throw Error('A regional realm requires Keycloak sign-in; guest play is only allowed on a loopback development server.');
  if (!databaseUrl && (realmId !== 'eu' || realmUsOrigin || realmAsiaOrigin) && (process.env.NODE_ENV === 'production' || !['127.0.0.1', '::1', 'localhost'].includes(host))) throw Error('Public shared realms require the canonical PostgreSQL DATABASE_URL.');
  if (keycloak) {
    if (![keycloak.url, keycloak.realm, keycloak.clientId].every(value => typeof value === 'string' && value.trim())) throw new Error('KEYCLOAK_URL, KEYCLOAK_REALM and KEYCLOAK_CLIENT_ID must all be configured.');
    const url = new URL(keycloak.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('KEYCLOAK_URL must be an HTTP(S) server URL without credentials, query or fragment.');
    keycloak = { url: keycloak.url.replace(/\/+$/, ''), realm: keycloak.realm, clientId: keycloak.clientId };
  }
  const socialProviders = socialProvidersFor(keycloak, process.env.KEYCLOAK_SOCIAL_PROVIDERS);
  const issuer = keycloak && `${keycloak.url}/realms/${encodeURIComponent(keycloak.realm)}`;
  if (keycloakAccountIssuer !== undefined) {
    try {
      const value = new URL(keycloakAccountIssuer);
      if (!keycloak || typeof keycloakAccountIssuer !== 'string' || value.href !== keycloakAccountIssuer || !['http:', 'https:'].includes(value.protocol)
          || value.username || value.password || value.search || value.hash || value.pathname === '/' || keycloakAccountIssuer.endsWith('/')) throw Error();
    } catch { throw Error('KEYCLOAK_ACCOUNT_ISSUER must be a canonical realm URL and requires configured Keycloak authentication.'); }
  }
  // Only for a verified realm migration preserving every user ID. This is a
  // storage namespace, never an additional trusted JWT issuer or account link.
  const accountIssuer = keycloakAccountIssuer ?? issuer;
  const walletBroker = createWalletOidc({ keycloak, ...walletOidc });
  const jwks = issuer && createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`), { timeoutDuration: 5000 });
  async function verifyAccessToken(accessToken) {
    if (!keycloak || typeof accessToken !== 'string' || accessToken.length > 12000) throw new Error('Missing access token');
    const { payload } = await jwtVerify(accessToken, jwks, { issuer, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'azp'] });
    if (payload.azp !== keycloak.clientId || payload.typ !== 'Bearer' || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) throw new Error('Wrong access token client, type or subject');
    return { recordKey: hash(`${accountIssuer}\n${payload.sub}`), subject: payload.sub, authTime: Number.isSafeInteger(payload.auth_time) ? payload.auth_time * 1000 : undefined, expiresAt: payload.exp * 1000, role: verifiedGmRole(payload) };
  }
  const savePath = resolve(dataDir, realmId === 'eu' ? 'players.json' : `players-${realmId}.json`);
  if (!databaseUrl && !existsSync(savePath) && existsSync(`${savePath}.tmp`)) throw new Error('Incomplete player save found; refusing to overwrite it.');
  const initialRecords = !databaseUrl && existsSync(savePath) ? JSON.parse(readFileSync(savePath, 'utf8')) : {};
  const persistedReferralKeys = new Set(Object.entries(initialRecords).filter(([, account]) => account && Object.hasOwn(account, 'referral')).map(([key]) => key));
  let records = migrateRecords(initialRecords);
  validateRecords(records);
  let database, statisticsConnection;
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
    let ssl;
    if (databaseCaBase64) {
      const ca = Buffer.from(databaseCaBase64, 'base64').toString('utf8');
      if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('DATABASE_CA_BASE64 must contain a base64-encoded PEM certificate.');
      for (const key of ['sslcert', 'sslkey', 'sslrootcert', 'sslmode']) url.searchParams.delete(key);
      ssl = { ca, rejectUnauthorized: true };
    }
    statisticsConnection = { connectionString: url.toString(), ssl };
    database = createPlayerStore({ ...statisticsConnection, referralsEnabled,
      onChange: key => sharedChanges.set(key, (sharedChanges.get(key) || 0) + 1),
      migrate: (account, key) => migrateRecords({ [key]: account })[key],
      validate: account => validateRecords({ ['0'.repeat(64)]: account }, true), onFatal: failPersistence });
  }
  const gasSponsor = createTurnkeySponsorship({ config: sponsorshipConfig, connection: statisticsConnection });
  const mobilePush = createPushNotifications({ connection: statisticsConnection, realmId, enabled: pushEnabled, accounts: () => activeSessions().map(session => session.recordKey) });
  const pushError = error => console.error('Mobile notifications unavailable:', error.message);
  const sponsoredOperation = input => gasSponsor.sponsoredOperation(input);
  const pollStore = database || localPollStore(dataDir);
  const dungeonRecords = database?.dungeonRecords || fileDungeonRecords(resolve(dataDir, `dungeon-records-${realmId}.json`));
  const pendingDungeonRecords = new Map();
  let dungeonRecordWrite, lastDungeonRecordAttempt = 0;
  function flushDungeonRecords() {
    if (dungeonRecordWrite) return dungeonRecordWrite;
    lastDungeonRecordAttempt = Date.now();
    dungeonRecordWrite = (async () => {
      for (const [id, entry] of pendingDungeonRecords) {
        await dungeonRecords.record(entry.record);
        entry.dungeon.recordSaved = true;
        pendingDungeonRecords.delete(id);
      }
    })().finally(() => { dungeonRecordWrite = null; });
    return dungeonRecordWrite;
  }
  // Each realm simulates its own world; PostgreSQL owns account locks and shared auction/social state.
  const chain = auctionChain || createAuctionChain({ sponsoredOperation }), mossChain = mossAuctionChain || createAuctionChain({ currency: 'moss', sponsoredOperation });
  const wagerChain = arenaChain || createArenaChain();
  const burnChain = storeChain || createStoreChain({ sponsoredOperation });
  const treasureChain = treasuryChain || createTreasureChain({ sponsoredOperation });
  let treasureStatus = { configured:false, enabled:false, reason:"The treasury is awaiting setup and funding." }, treasureChecking, treasureCheckedAt = 0;
  const nativeWallet = createNativeWalletHandoff({
    authenticate: async request => {
      const bearer = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.authorization || '');
      return (await verifyAccessToken(bearer?.[1])).recordKey;
    },
    originAllowed: origin => ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world'].includes(origin)
      || allowedOrigins.has(origin) && origin !== 'https://account.mossvale.world'
      || process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname),
    claimAllowed: async claim => {
      await refreshTreasureStatus();
      return [treasureStatus.contract, treasureStatus.legacyContract].some(contract => contract?.toLowerCase() === claim.contract.toLowerCase());
    },
  });
  const collectiblesChain = nftChain || createNftChain();
  const specialists = createSpecialistNftService({ chain: specialistNftChain, commit: commitStore });
  let nftStatus = { configured: false, enabled: false, chainId: 4663, feeBps: NFT_FEE_BPS, houses: [] }, nftChecking, nftCheckedAt = 0;
  const settlingNfts = new Map();
  const mobileVerifier = mobilePurchaseVerifier || createMobilePurchaseVerifier();
  const deletionProvider = accountDeletionProvider || createAccountDeletionProvider({ keycloak });
  let mobileWork, lastMobilePoll = 0, lastVoidedPoll = 0, mobileReady = false;
  const mobilePurchaseStatus = () => database && keycloak ? mobileVerifier.status() : { apple: false, google: false };
  let storeStatus = { enabled: false, reason: 'Checking the MOSS store.' }, storeCheckedAt = 0, storeChecking;
  const settlingStore = new Map();
  const paymentChain = currency => currency === 'moss' ? mossChain : chain;
  const paymentStatus = currency => currency === 'moss' ? cryptoStatus.moss : cryptoStatus;
  let cryptoStatus = { enabled: false, reason: 'Checking the auction payment service.' }, cryptoCheckedAt = 0, cryptoCheck;
  const settlingAuctions = new Map();
  let lastAuctionPoll = 0, lastEconomyPoll = 0, economyPoll;
  let flush = Promise.resolve();
  const pendingGoldEvents = new Map();
  function changeGold(player, delta, reason) {
    if (!Number.isSafeInteger(delta) || !nonnegativeInteger(player.gold + delta)) throw Error('Gold limit reached.');
    if (delta) { const entry = makeGoldEvent(player.id, reason, delta); pendingGoldEvents.set(entry.id, entry); }
    player.gold += delta;
  }
  const lastSaved = new Map(), sharedChanges = new Map();
  const sessions = new Map();
  const movementCredit = createMovementCredit();
  const floorHeights = new WeakMap();
  function groundLevel(point, instanceId) {
    const dungeon = !!instanceId, cached = floorHeights.get(point);
    if (cached && cached.x === point.x && cached.z === point.z && cached.dungeon === dungeon) return cached.y;
    const y = jumpFloor(point.x, point.z, dungeon);
    floorHeights.set(point, { x:point.x, z:point.z, dungeon, y });
    return y;
  }
  const distance = (a, b) => {
    const aSession = sessions.get(a.id), bSession = sessions.get(b.id);
    const instanceId = aSession?.instanceId ?? bSession?.instanceId ?? a.instanceId ?? b.instanceId;
    const dy = a.id && b.id && (aSession || bSession) ? (aSession?.jump?.y ?? groundLevel(a,instanceId)) - (bSession?.jump?.y ?? groundLevel(b,instanceId)) : 0;
    return Math.hypot(a.x-b.x, a.z-b.z, dy);
  };
  function canTraverse(from, to, colliders = WORLD_COLLIDERS, bounds = WORLD_BOUNDS, radius) {
    const a = sessions.get(from.id), b = sessions.get(to.id);
    const elevated = session => session?.jump && Math.abs(session.jump.y - groundLevel(session.player, session.instanceId)) > .5;
    if (!elevated(a) && !elevated(b)) return groundCanTraverse(from, to, colliders, bounds, radius);
    const session = a || b;
    return groundCanTraverse(from, to, [], bounds, radius) && actorLineOfSight(collisionScene(session),
      { ...from, y:(a?.jump.y ?? groundLevel(from,session.instanceId))+1 },
      { ...to, y:(b?.jump.y ?? groundLevel(to,session.instanceId))+1 });
  }
  const activeSessions = () => [...sessions.values()];
  const ignores = (recipient, id) => !!recipient?.player.ignoreIds.includes(id);
  // ponytail: scan saves once per presence refresh; add an ID index if realm size makes this costly.
  const savedCharacters = () => new Map(Object.values(records).flatMap(account => account.characters.map(p => [p.id, p])));
  let lastFriendsRefresh = 0;
  const accountConnections = new Map();
  const releasingAccounts = new Map();
  const passengerReady = session => liveSession(session) && session.player.hp > 0 && !session.instanceId && !session.zeppelin
    && !session.duel && !session.casting && !session.gathering && !gmObserver(session) && !inCombat(session)
    && (!session.jump.grounded || !swimming(session)) && !buildingAt(session.player.x, session.player.z)
    && (!session.travel.mount || session.travel.driverId || session.player.ownedMounts.includes(session.travel.mount));
  const passengers = createMountPassengers({ sessions, ready: session => passengerReady(session) && session.jump.grounded && !committingAccounts.has(session.recordKey), valid: passengerReady,
    prepare: session => { stand(session); cancelCast(session); cancelGathering(session); cancelBasicHits(session); cancelTradeFor(session.player.id, 'Trade cancelled while boarding a mount.'); },
    send: (session, message) => send(session.socket, message), correct: session => correction(session, ''), changed: dirty });
  const activity = new Map();
  const connections = new Map();
  const actionGuard = createActionGuard();
  let saveTimer, autosaving = false, saveDirty = false;
  let closing = false;
  let persistenceFailed = false;
  let stopping;
  let closeHttpTask, httpKeptOpen = false;
  let shutdownAt = 0, shutdownTask, shutdownAbort, shutdownNotice = null;
  const deployment = createDeploymentControl({ releaseFile: resolve(ROOT, 'dist/release.json'), ...deploymentControl,
    canStart: () => !closing && !shutdownTask, drain: () => game.scheduleShutdown({ keepHttpOpen: true }) });
  const shutdownSeconds = () => shutdownNotice ? Math.max(0, Math.ceil((shutdownAt - performance.now()) / 1000)) : 0;
  const deploymentWarning = () => ({ version: 1, id: shutdownNotice?.id ?? null, startedAt: shutdownNotice?.startedAt ?? null,
    secondsRemaining: shutdownSeconds(), held: shutdownNotice?.held ?? false });
  const sendShutdownWarning = connection => send(connection.socket, { type: 'shutdownWarning', secondsRemaining: shutdownNotice ? shutdownSeconds() : null,
    ...(shutdownNotice?.held ? { held: true } : {}) });
  function watchShutdownWarning() {
    shutdownAbort?.abort();
    const notice = shutdownNotice, controller = shutdownAbort = new AbortController();
    return (async () => {
      let next = shutdownSeconds();
      while (!closing && shutdownNotice === notice && !controller.signal.aborted) {
        const seconds = shutdownSeconds();
        if (!seconds) {
          if (notice.held) for (const connection of accountConnections.values()) sendShutdownWarning(connection);
          break;
        }
        if (seconds <= next) {
          for (const connection of accountConnections.values()) sendShutdownWarning(connection);
          next = seconds > 60 ? (Math.ceil(seconds / 60) - 1) * 60 : notice.held ? 0 : seconds > 10 ? 10 : seconds - 1;
        }
        try {
          await timers.setTimeout(Math.max(1, shutdownAt - performance.now() - next * 1000), undefined, { signal: controller.signal });
        } catch (error) { if (error.name !== 'AbortError') throw error; }
      }
    })();
  }
  const enemySpawns = [...createOverworldSpawns(), ...STORY_ENEMIES];
  const enemies = enemySpawns.map(enemy => {
    const level=enemy.level??monsterSpawnLevel(enemy,surfaceAt(enemy.x,enemy.z).regionId),stats=monsterStatsAtLevel(enemy.kind,level),hp=stats.hp*(enemy.elite?2:1);
    return {...enemy,level,boss:enemy.worldBoss?WORLD_BOSSES.find(boss=>boss.kind===enemy.kind):undefined,instanceId:null,name:enemy.name??stats.name,homeX:enemy.x,homeZ:enemy.z,hp,maxHp:hp,...(enemy.elite?{damageScale:1.3}:{}),alive:true,diedAt:0,respawnAt:0,lastAttack:0,rotation:0,attack:null,participants:new Set(),threat:new Map(),target:null};
  });
  let nextTreasureSpawnAt = Date.now() + TREASURE_GOBLIN.spawnIntervalMs;
  const nodes = createGatheringNodes().map(node => ({ ...node, instanceId: null, available: true, respawnAt: 0 }));
  const gatheringClaims = new Map();
  let pendingHits = [];
  const lootDrops = new Map();
  const lootCollected = new WeakMap(), lootQueueLimit = 16;
  const lootTrace = createLootTrace({ realmId });
  const lootTraceDecisions = new WeakMap();
  const lootTraceBag = p => ({ used: bagUsage(p), capacity: bagCapacity(p), minimumQuality: p.petLootMinQuality });
  function traceLootDecision(session, drop, details) {
    if (drop?.ownerId !== session.player.id || !lootTrace.active(drop.ownerId)) return;
    const key = JSON.stringify([session.lootTraceVersion, details]);
    if (lootTraceDecisions.get(drop) === key) return;
    lootTraceDecisions.set(drop, key);
    lootTrace.write(drop.ownerId, 'pickup_decision', { dropId: drop.id, ...details, bags: lootTraceBag(session.player) });
  }
  function removeLootDrop(id, reason) {
    const drop = lootDrops.get(id);
    if (drop && lootTrace.active(drop.ownerId)) lootTrace.write(drop.ownerId, 'loot_removed', { dropId: id, reason, remaining: lootRows(drop) });
    lootDrops.delete(id);
  }
  function gmLootPlayers(active, now) {
    const traces = lootTrace.summaries(), online = active.filter(s => liveSession(s, now));
    return [...online.map(s => ({ id: s.player.id, name: s.player.name, level: s.player.level, className: s.player.appearance.className,
      role: publicRole(s), canReturn: !!s.gmReturnPosition })),
      ...traces.filter(t => !online.some(s => s.player.id === t.player.id)).map(t => ({ ...t.player, online: false }))]
      .map(player => { const trace = traces.find(t => t.player.id === player.id); if (!trace) return player;
        const { player: ignored, ...status } = trace; return { ...player, lootTrace: status }; });
  }
  const parties = new Map(), invitations = new Map(), dungeons = new Map(), duelInvitations = new Map(), dungeonSummons = new Map();
  const arenaMatches = new Map(), arenaInvitations = new Map(), arenaQueue = new Map(), arenaWagerWork = new Map();
  const trades = new Map(), playerTrades = new Map(), committingAccounts = new Map();
  async function waitForAccountAction(recordKey) {
    // Lifecycle/read callers need settlement, not an unrelated action's refusal.
    // The original caller keeps its error; genuine storage uncertainty stays fatal.
    await Promise.allSettled([committingAccounts.get(recordKey)?.completion]);
    if (persistenceFailed) throw Error('Shared progress storage disconnected.');
  }
  function combatSaveBlocked(recordKey) {
    const action = committingAccounts.get(recordKey);
    return !!action && !action.backgroundLoot;
  }
  const raids = createRaidController({ sessions, enemies, rollRewards:()=>rollRaidRewards(()=>randomInt(0x1_0000_0000)/0x1_0000_0000), random:()=>randomInt(0x1_0000_0000)/0x1_0000_0000, live:session=>liveSession(session),
    onInvite: (target, invite) => { void mobilePush.invite(target.recordKey, { id: invite.id, title: 'Raid invitation', body: `${invite.leaderName} invited you to the Horned Apostle raid.`, expiresAt: invite.expiresAt }).catch(pushError); },
    event:(session,text)=>event(session,'info',text), dirty, error:error=>console.error('Raid rewards save failed:',error.message),
    eligible:session=>liveSession(session)&&session.player.level>=60&&session.player.hp>0&&!session.instanceId&&!session.zeppelin&&!session.duel
      &&!gmObserver(session)&&!inCombat(session)&&!session.casting&&!session.gathering&&!session.travel.mount&&!committingAccounts.has(session.recordKey)
      &&!arenaQueue.has(session)&&!playerTrades.has(session.player.id)&&!waterAt(session.player.x,session.player.z)&&onboardingFeatureUnlocked(session.player,'dungeon'),
    busy:session=>committingAccounts.has(session.recordKey), canInvite:(from,to)=>canSee(from,to)&&!ignores(to,from.player.id),
    cancel:session=>{cancelTradeFor(session.player.id,'Trade cancelled by raid travel.');cancelGathering(session);cancelHits(session);session.shield=null;},
    cancelEnemy:enemy=>{enemy.attack=null;enemy.threat.clear();enemy.target=null;pendingHits=pendingHits.filter(hit=>hit.enemy!==enemy);},
    correct:(session,reason,travel=true)=>{if(travel){resetJump(session);session.lifeStartedAt=Date.now();session.lastMove=Date.now();session.moveBudget=.8/WALK_SPEED;session.dungeonPortalUntil=Date.now()+500;}correction(session,reason);},
    damage:(session,amount,at,execute,source)=>{if(execute)session.shield=null;applyDamage(session.player,'player',amount,session.instanceId,at,source,false,execute === true,execute === true);if(!session.player.hp)playerDied(session,at);dirty();},
    target:(enemy,team,now)=>selectEnemyTarget(enemy,team,now),
    award:(playerId,recordKey,runId,plan,shutdown)=>awardRaidCompletion(playerId,recordKey,runId,plan,shutdown),
  });
  const instantCombat = createInstantCombatController({ sessions, enemies,
    target: (enemy, team, now) => selectEnemyTarget(enemy, team, now),
    kill: (session, at) => { session.player.hp = 0; playerDied(session, at); dirty(); },
    interrupt: (session, kind) => {
      cancelCast(session);
      if (kind === 'stun') { session.autoAttack = null; cancelBasicHits(session); }
    },
    displace: (session, point, at) => {
      if (!isInstantCombatInstance(session.instanceId) || session.player.hp <= 0) return;
      const origin = { x: session.player.x, z: session.player.z };
      // Sweep the existing collision map, shortening a forced move at a wall.
      let accepted = origin;
      for (let step = 1; step <= 20; step++) {
        const next = { x: origin.x + (point.x - origin.x) * step / 20, z: origin.z + (point.z - origin.z) * step / 20 };
        if (!canTraverse(accepted, next, instanceColliders(session.instanceId), instanceBounds(session.instanceId))) break;
        accepted = next;
      }
      Object.assign(session.player, accepted); resetJump(session); session.lastMove = at; session.moveBudget = .1;
      correction(session, ''); dirty();
    },
    onRegistration: startsAt => { void mobilePush.worldEvent({ id: `instant-combat:${startsAt}`, title: 'Instant Combat registration is open', body: 'The event starts in five minutes. Open Mossvale to join.', urgent: true, expiresAt: startsAt }).catch(pushError); },
    live: session => liveSession(session), available: () => accountStoreReady && !closing && !shutdownTask,
    event: (session, text) => event(session, 'info', text), dirty,
    rewardWave: awardInstantCombatWave,
    removeRewards: (instanceId, ownerId) => {
      for (const [id, drop] of lootDrops) if (drop.instantCombatRound && drop.instanceId === instanceId && (!ownerId || drop.ownerId === ownerId))
        removeLootDrop(id, 'instant_combat_ended');
    },
    damage: (session, amount, at, source, damageSchool) => { applyDamage(session.player, 'player', amount, session.instanceId, at, source, false, false, false, damageSchool); if (!session.player.hp) playerDied(session, at); dirty(); },
    entryError: session => session.player.hp <= 0 ? 'Instant Combat entry requires a living character.'
      : session.duel ? 'Finish your duel or arena match before entering Instant Combat. Your match continues.'
      : committingAccounts.has(session.recordKey) ? 'A pending save prevented Instant Combat entry. Join the next event.'
      : gmObserver(session) ? 'Leave observer mode before entering Instant Combat.'
      : raids.bySession(session)?.phase === 'completed' && !raids.publicState(session)?.result?.saved ? 'Your raid rewards must finish saving before Instant Combat entry.' : null,
    prepare: session => {
      passengers.leave(session); leaveZeppelin(session);
      if (raids.bySession(session)) raids.leave(session, true); else leaveDungeon(session);
      cancelTradeFor(session.player.id, 'Trade cancelled by Instant Combat travel.');
      cancelGathering(session); cancelHits(session); session.shield = null;
    },
    cancel: session => { cancelTradeFor(session.player.id, 'Trade cancelled by Instant Combat travel.'); cancelGathering(session); cancelHits(session); session.shield = null; },
    cancelEnemy: enemy => { enemy.attack = null; enemy.threat.clear(); enemy.target = null; pendingHits = pendingHits.filter(hit => hit.enemy !== enemy); },
    correct: (session, reason) => { resetJump(session); session.lifeStartedAt = Date.now(); session.lastMove = Date.now(); session.moveBudget = .8 / WALK_SPEED; correction(session, reason); },
  });
  const storyEncounters = createStoryEncounters({
    live: session => liveSession(session),
    canMove: (from, to) => !waterAt(to.x, to.z) && canTraverse(from, to, WORLD_COLLIDERS, WORLD_BOUNDS),
    tell: (session, text) => event(session, 'info', text),
    progress: (session, progress) => { if (storyQuestProgress(session.player.storyQuests, progress)) dirty(); },
    spawn: (spec, now) => {
      let point;
      for (let radius = 0; radius <= 12 && !point; radius += 2) for (let i = 0; i < 16 && !point; i++) {
        const candidate = { x: spec.x + Math.sin(i * Math.PI / 8) * radius, z: spec.z + Math.cos(i * Math.PI / 8) * radius };
        if (!waterAt(candidate.x, candidate.z) && canTraverse(candidate, candidate, WORLD_COLLIDERS, WORLD_BOUNDS)) point = candidate;
      }
      if (!point) throw Error('Story encounter has no accessible spawn.');
      const stats = monsterStatsAtLevel(spec.kind, spec.level), enemy = { ...spec, ...point, name: stats.name, instanceId: null,
        homeX: point.x, homeZ: point.z, hp: stats.hp, maxHp: stats.hp, alive: true, diedAt: 0, respawnAt: Infinity,
        lastAttack: now, rotation: 0, attack: null, threat: new Map(), target: null, participants: new Set() };
      enemies.push(enemy); return enemy;
    },
    remove: enemy => {
      enemy.alive = false; enemy.hp = 0; enemy.attack = null; enemy.threat.clear(); enemy.target = null;
      pendingHits = pendingHits.filter(hit => hit.enemy !== enemy);
      const index = enemies.indexOf(enemy); if (index >= 0) enemies.splice(index, 1);
    },
  });
  function awardInstantCombatWave(run, members, now, expiresAt) {
    if ((run.rewardedRound || 0) >= run.round) return;
    run.rewardedRound = run.round;
    const reward = instantCombatWaveReward(run.bracket.id, run.round, economyVersion >= 1);
    if (!reward) return;
    for (const session of members) {
      if (!liveSession(session, now) || session.player.hp <= 0 || session.instanceId !== run.id || !run.members.has(session.player.id)) continue;
      const p = session.player, id = `${run.id}-wave-${run.round}-${p.id}`, items = reward.items.map(item => ({ ...item }));
      if (reward.gearChance) items.push(...rollDungeonCacheLoot(Math.min(run.bracket.maxLevel, run.level + run.round - 1), p, Math.random,
        { themed: true, reservedGear: reservedLootGear(p) }).filter(item => item.kind === 'gear'));
      const point = instantCombatPosition(run.mapId, p.x, p.z);
      lootDrops.set(id, { id, enemyId: `${run.id}-wave-${run.round}`, instantCombatRound: run.round, ownerId: p.id,
        zone: 'hollow', instanceId: run.id, kind: 'briar-sentinel', name: `Instant Combat · Wave ${run.round} rewards`, ...point,
        gold: reward.gold, goldReason: 'reward:instant_combat', relic: 0, items, expiresAt });
      if (reward.xp) {
        const xp = addXp(session, reward.xp);
        event(session, 'reward', `Instant Combat complete · +${xp} XP. Collect your personal Gold and items before the timer ends.`, true);
      }
    }
  }
  const instanceColliders = instanceId => {
    if (isRaidInstance(instanceId)) return RAID_COLLIDERS;
    if (isInstantCombatInstance(instanceId)) return instantCombatMap(instantCombat.byInstance(instanceId)?.mapId ?? 'bone-pit').colliders;
    if (isArenaInstance(instanceId)) return ARENA_COLLIDERS;
    const dungeon = dungeons.get(instanceId);
    return dungeonColliders(dungeon?.cleared, dungeon?.activated, dungeon?.kind);
  };
  const instanceBounds = instanceId => isRaidInstance(instanceId) ? RAID_BOUNDS : isInstantCombatInstance(instanceId) ? instantCombatMap(instantCombat.byInstance(instanceId)?.mapId ?? 'bone-pit').bounds : isArenaInstance(instanceId) ? ARENA_BOUNDS : dungeonBounds(dungeons.get(instanceId)?.kind);
  const overworldCollisionKey = `overworld:${randomUUID()}`;
  const runtimeCollisionScenes = new Set([overworldCollisionKey]);
  const depletedResources = {};
  function collisionScene(session) {
    const run = dungeons.get(session.instanceId), raid = raids.bySession(session), ic = instantCombat.bySession(session);
    const base = collisionSceneKey(session.instanceId, run?.kind, raid?.roomIndex, ic?.mapId);
    if (!session.instanceId) return overworldCollisionKey;
    if (!run) return base;
    const key = `${base}:${run.id}`;
    if (!hasCollisionScene(key)) { cloneCollisionScene(base, key); runtimeCollisionScenes.add(key); }
    updateCollisionSceneState(key, dungeonCollisionFlags(run.kind, run.activated, run.cleared, run.completed, !!run.dream, Date.now()));
    return key;
  }
  const playerRouteAllowed = (session, from, to) => collisionRouteAllowed(from, to, session.instanceId,
    dungeons.get(session.instanceId)?.kind, instantCombat.bySession(session)?.mapId);
  const swimming = session => !session.instanceId && session.jump.grounded && waterAt(session.player.x, session.player.z)
    && session.jump.y <= jumpFloor(session.player.x, session.player.z) + .1;
  const insideBuilding = session => !session.instanceId && !!buildingAt(session.player.x, session.player.z)
    && session.jump.y <= jumpFloor(session.player.x, session.player.z) + 3;
  function rememberStanding(session) {
    const p = session.player;
    if (session.jump.grounded && !session.zeppelin && !gmFlying(session)) session.lastSupportedPosition = { x:p.x, y:session.jump.y, z:p.z, scene:collisionScene(session) };
    if (!session.instanceId && !session.zeppelin && session.jump.grounded && !gmFlying(session))
      p.standingPosition = { x: p.x, y: session.jump.y, z: p.z };
    else delete p.standingPosition;
  }
  function targetHeight(target, instanceId) {
    return sessions.get(target.id)?.jump?.y ?? groundLevel(target, instanceId);
  }
  function physicalReach(session, target, range, ignoredTag) {
    const a = { ...session.player, y: session.jump.y + 1 }, b = { ...target, y: targetHeight(target, session.instanceId) + 1 };
    const gap = Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
    if (gap > range) return false;
    // Resources ignore only their own meshes; other interaction points stop just before the target.
    const t = ignoredTag ? 1 : Math.max(0, 1 - .8 / Math.max(.001, gap));
    return actorLineOfSight(collisionScene(session), a, { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t }, ignoredTag);
  }
  const dungeonPreparing = session => !!dungeons.get(session?.instanceId) && inDungeonPreparation(session.player, dungeons.get(session.instanceId).kind);

  function failPersistence(error) {
    if (persistenceFailed) return;
    persistenceFailed = true;
    deployment.fail();
    closing = true;
    clearInterval(interval); clearTimeout(saveTimer);
    shutdownAbort?.abort(); walletBroker.close(); nativeWallet.close(); void mobilePush.close().catch(pushError);
    console.error('Shared progress storage failed; this realm has stopped:', error.message);
    for (const connection of connections.values()) connection.socket.close(1011, 'Progress storage disconnected. Reconnect shortly.');
    void database?.close().catch(() => {});
    void gasSponsor.close().catch(() => {});
    void statistics.stop().catch(() => {});
    wss.close(); if (!deployment.active) server.close();
  }

  function applyStoredRow({ account_key: key, state, credits = {} }, owned = database?.owns(key)) {
    const current = records[key];
    if (current && state.referral) {
      const live = current.referral;
      current.referral = { ...structuredClone(state.referral), days: [...new Set([...state.referral.days, ...(live?.days || [])])].sort((a,b) => a-b).slice(0,2), level: Math.max(state.referral.level, live?.level || 0), canBind: state.referral.canBind && live?.canBind === true };
      if (referralsEnabled) grantReferralRewards(current);
    }
    if (current) { if (state.ban) current.ban = state.ban; else delete current.ban; if (state.gmProtected) current.gmProtected = true; }
    if (!current) { records[key] = state; return; }
    if (!owned) {
      const previous = new Map(current.characters.map(player => [player.id, player]));
      current.characters = state.characters.map(player => Object.assign(previous.get(player.id) || {}, player));
      if (state.ban) current.ban = state.ban; else delete current.ban;
      return;
    }
    for (const player of current.characters) {
      const saved = state.characters.find(character => character.id === player.id);
      if (!saved) continue;
      for (const field of SHARED_PLAYER_FIELDS) player[field] = structuredClone(saved[field]);
      // Gold earned during the SQL round trip stays in memory; proceeds are additive.
      if (credits[player.id]) {
        if (!nonnegativeInteger(player.gold + credits[player.id])) { failPersistence(Error('Gold limit reached while applying auction proceeds.')); return; }
        player.gold += credits[player.id];
      }
    }
  }

  let refreshingRecords, queuedFullRefresh, fullRefreshQueued = false;
  function refreshRecords(onlyChanged = false) {
    if (!database || closing) return Promise.resolve();
    if (refreshingRecords) {
      if (onlyChanged || fullRefreshQueued) return refreshingRecords;
      // Waiters share the next read; the current read may predate their changes.
      return queuedFullRefresh ??= refreshingRecords.then(() => {
        queuedFullRefresh = undefined;
        return refreshRecords();
      }, error => { queuedFullRefresh = undefined; throw error; });
    }
    const changes = new Map(sharedChanges);
    if (onlyChanged && !changes.size) return Promise.resolve();
    fullRefreshQueued = !onlyChanged;
    flush = flush.catch(() => {}).then(async () => {
      fullRefreshQueued = false;
      const rows = await database.read(onlyChanged ? [...changes.keys()] : undefined, true);
      const loaded = migrateRecords(Object.fromEntries(rows.map(row => [row.account_key, row.state])));
      validateRecords(loaded, onlyChanged);
      for (const [key, state] of Object.entries(loaded)) {
        if (!committingAccounts.has(key)) {
          applyStoredRow({ account_key: key, state });
          // Owned rows may contain proceeds that their next save must collect.
          if (!database.owns(key) && sharedChanges.get(key) === changes.get(key)) sharedChanges.delete(key);
        }
      }
      for (const key of onlyChanged ? changes.keys() : Object.keys(records)) if (!loaded[key] && !database.owns(key) && !committingAccounts.has(key)) { clearDeletedAccount(key); sharedChanges.delete(key); }
    });
    refreshingRecords = flush.finally(() => { refreshingRecords = null; });
    return refreshingRecords;
  }

  function stagedPlayerChanges(player, changes) {
    if (typeof changes === 'function') return changes;
    const goldDelta = Object.hasOwn(changes, 'gold') ? changes.gold - player.gold : null;
    return () => {
      if (goldDelta !== null) changes.gold = player.gold + goldDelta;
      return changes;
    };
  }

  async function save(overrides = new Map(), afterPersist, accountOverrides = new Map(), actionExpected, mobileReceipt, treasureReservation, goldRoundAction, referralPurchase) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const participants = new Set([...accountOverrides.keys(), ...Object.entries(records)
      .filter(([, account]) => account.characters.some(player => overrides.has(player.id))).map(([key]) => key)]);
    // Capture the fields used to authorize the action before waiting behind another writer.
    const expected = actionExpected || new Map([...participants].map(key => [key, structuredClone(records[key])]));
    const characters = savedCharacters();
    overrides = new Map([...overrides].map(([id, changes]) => [id, stagedPlayerChanges(characters.get(id), changes)]));
    flush = flush.catch(() => {}).then(async () => {
      if (persistenceFailed) throw Error('Shared progress storage disconnected.');
      const goldChanges = new Map(), revisions = new Map(sharedChanges), goldEvents = [...pendingGoldEvents.values()];
      const persisted = Object.fromEntries(Object.entries(records)
        .filter(([key]) => !database || database.owns(key) || participants.has(key))
        .map(([key, account]) => {
          const metadata = accountOverrides.get(key);
          const projected = { ...account, ...(typeof metadata === 'function' ? metadata() : metadata) };
          return [key, { ...projected, referral: structuredClone(projected.referral), characters: projected.characters.map(p => {
            const changes = overrides.get(p.id)?.(), session = sessions.get(p.id);
            if (changes) {
              const delta = Object.hasOwn(changes, 'gold') ? changes.gold - p.gold : 0;
              if (delta) goldEvents.push(makeGoldEvent(p.id, changes.goldReason || 'unclassified', delta));
              if (changes.goldEvent) goldEvents.push(makeGoldEvent(p.id, changes.goldEvent.reason, 0, changes.goldEvent));
              delete changes.goldReason; delete changes.goldEvent;
            }
            if (changes && Object.hasOwn(changes, 'gold') && (!database || database.owns(key))) goldChanges.set(p, changes.gold - p.gold);
            return { ...p, ...changes, ...(session?.returnPosition || {}),
              ...(session?.zeppelin ? { ...zeppelinDockPosition(session.zeppelin.from), zeppelin: { ...session.zeppelin } } : {}) };
          }) }];
        }));
      for (const [key, account] of Object.entries(persisted)) {
        for (const removed of records[key].characters.filter(p => !account.characters.some(next => next.id === p.id))) {
          if (removed.gold) goldEvents.push(makeGoldEvent(removed.id, 'deletion:character', -removed.gold));
        }
      }
      let committed = [];
      if (database) {
        committed = await database.commit(Object.entries(persisted)
          .filter(([key, state]) => participants.has(key) || revisions.has(key) || state.characters.some(p => goldEvents.some(event => event.characterId === p.id)) || lastSaved.get(key) !== JSON.stringify(state))
          .map(([key, state]) => ({ key, state, expected: expected.get(key) })),
          rows => validateRecords(Object.fromEntries(rows.map(row => [row.account_key, row.state])), true), mobileReceipt, treasureReservation, goldEvents, goldRoundAction, referralPurchase);
      } else if (Object.keys(persisted).length) {
        const existing = new Map(Object.entries(records).map(([key, state]) => [key, { account_key: key, state }]));
        if (referralsEnabled || referralPurchase) {
          if (referralsEnabled) for (const [key, account] of Object.entries(persisted)) mergeReferral(account, records[key], key);
          const referralRows = applyReferralCommit(existing, Object.entries(persisted).map(([key, state]) => ({ account_key: key, state })), referralPurchase, new Set(), referralsEnabled);
          for (const row of referralRows) persisted[row.account_key] = row.state;
        }
        validateRecords(persisted);
        // ponytail: local fixture history stays in the atomic save; use PostgreSQL for long-running realms.
        for (const [key, account] of Object.entries(persisted)) {
          const ids = new Set([...account.characters, ...records[key].characters].map(p => p.id));
          const events = goldEvents.filter(event => ids.has(event.characterId));
          if (events.length) account.goldLedger = [...(account.goldLedger || []), ...events];
        }
        if (treasureReservation) {
          if (!treasureReservation.previousClaimHash && !goldRoundAction) {
            const [key, account] = Object.entries(persisted).find(([, account]) => account.characters.some(p => p.treasureClaims?.some(claim => claim.claimHash === treasureReservation.claimHash)));
            if (treasureNextRedemptionAt(records[key]) > Date.now()) throw Error('You can redeem only one MOSS voucher per account per day. Resets at 00:00 UTC.');
            account.lastTreasureClaimAt = Date.now();
          }
          const issued = Object.values(persisted).flatMap(a => a.characters.flatMap(p => p.treasureClaims || []))
            .filter(claim => claim.contract.toLowerCase() === treasureReservation.contract.toLowerCase())
            .reduce((sum, claim) => sum + treasureQuotes(claim).reduce((largest, quote) => BigInt(quote.amountWei) > largest ? BigInt(quote.amountWei) : largest, 0n), 0n);
          if (issued > BigInt(treasureReservation.capacityWei)) throw Error('The treasury is awaiting funding. Your voucher was kept.');
        }
        validateRecords(persisted);
        mkdirSync(dataDir, { recursive: true });
        const tempPath = `${savePath}.tmp`;
        const stored = Object.fromEntries(Object.entries(persisted).map(([key, account]) => {
          if (referralsEnabled || persistedReferralKeys.has(key)) return [key, account];
          const { referral, ...state } = account; return [key, state];
        }));
        writeFileSync(tempPath, JSON.stringify(stored), { mode: 0o600 });
        const file = openSync(tempPath, 'r'); try { fsyncSync(file); } finally { closeSync(file); }
        renameSync(tempPath, savePath);
        const directory = openSync(dataDir, 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
      }
      for (const event of goldEvents) pendingGoldEvents.delete(event.id);
      if (!database) for (const [key, account] of Object.entries(persisted)) {
        records[key].referral = structuredClone(account.referral);
        if (referralsEnabled) { persistedReferralKeys.add(key); grantReferralRewards(records[key]); }
        if (account.goldLedger) records[key].goldLedger = account.goldLedger;
        if (account.lastTreasureClaimAt !== undefined) records[key].lastTreasureClaimAt = account.lastTreasureClaimAt;
      }
      const goldAfter = new Map([...goldChanges].map(([player, delta]) => [player, player.gold + delta]));
      afterPersist?.();
      if (!database && referralsEnabled) for (const account of Object.values(records)) grantReferralRewards(account);
      for (const [player, gold] of goldAfter) player.gold = gold;
      for (const row of committed) {
        applyStoredRow(row);
        if (database.owns(row.account_key)) lastSaved.set(row.account_key, JSON.stringify(row.state));
        if (sharedChanges.get(row.account_key) === revisions.get(row.account_key)) sharedChanges.delete(row.account_key);
      }
    });
    await flush;
  }

  function releaseAccount(connection, acknowledge = false) {
    if (!connection.recordKey || accountConnections.get(connection.recordKey) !== connection) return Promise.resolve();
    if (connection.releasing) return connection.releasing;
    const key = connection.recordKey;
    connection.releasing = (async () => {
      await waitForAccountAction(key);
      leaveSession(connection);
      await waitForAccountAction(key);
      await save();
      if (accountConnections.get(key) !== connection) return;
      flush = flush.catch(() => {}).then(async () => {
        await database?.release(key);
        accountConnections.delete(key);
        lastSaved.delete(key);
      });
      await flush;
      if (acknowledge) { send(connection.socket, { type: 'realmLeft' }); connection.socket.close(1000, 'Realm left'); }
    })().catch(error => {
      // Never acknowledge a handoff whose final save is uncertain.
      failPersistence(error);
      throw error;
    }).finally(() => { if (releasingAccounts.get(key) === connection.releasing) releasingAccounts.delete(key); });
    releasingAccounts.set(key, connection.releasing);
    return connection.releasing;
  }

  function dirty() {
    if (closing) return;
    saveDirty = true;
    if (!saveTimer && !autosaving) saveTimer = setTimeout(() => {
      autosaving = true; saveDirty = false;
      // Slow cross-region writes must not accumulate a new queued save every second.
      save().catch(error => console.error('Player save failed:', error.message)).finally(() => {
        autosaving = false;
        if (saveDirty) dirty();
      });
    }, 1000);
  }
  function sendAchievements(session, unlocked) {
    for (const achievement of unlocked) send(session.socket, { type: 'achievement', achievementId: achievement.id, unlockedAt: session.player.achievements.unlocked[achievement.id] });
  }
  function checkAchievements(session, notify = true) {
    const unlocked = unlockAchievements(session.player, Date.now());
    if (notify) sendAchievements(session, unlocked);
    if (unlocked.length) dirty();
  }
  function visitAchievementZone(session) {
    const p = session.player;
    if (session.instanceId || session.zeppelin || gmObserver(session) || p.achievements.zones.includes(p.zone)) return;
    p.achievements.zones.push(p.zone); checkAchievements(session); dirty();
  }

  const worldPvp = session => !session.zeppelin && !session.instanceId && isInColosseum(session.player);
  const emptyOffer = () => ({ gold: 0, items: {}, gear: [] });
  const liveSession = (session, now = Date.now()) => session && sessions.get(session.player.id) === session && session.socket.readyState === WebSocket.OPEN
    && (!session.expiresAt || session.expiresAt > now);
  const countryForRequest = createCountryLookup({ realmId });
  const statistics = createPublicStats({ ...statisticsConnection, realmId,
    accounts: () => activeSessions().filter(session => liveSession(session)).map(session => ({ key: session.recordKey, country: session.country })),
    countUsers: deletionProvider.enabled && typeof deletionProvider.countUsers === 'function' ? () => deletionProvider.countUsers() : undefined, auctionChain: mossChain });
  const nearbyTraders = (a, b, now = Date.now()) => liveSession(a, now) && liveSession(b, now) && a !== b && a.player.hp > 0 && b.player.hp > 0
    && !a.zeppelin && !b.zeppelin && !a.duel && !b.duel && canSee(a, b) && canSee(b, a) && a.instanceId === b.instanceId && physicalReach(a, b.player, TRADE_RANGE)
    && canTraverse(a.player, b.player, a.instanceId ? instanceColliders(a.instanceId) : WORLD_COLLIDERS, a.instanceId ? instanceBounds(a.instanceId) : WORLD_BOUNDS);
  const publicTrade = trade => ({ id: trade.id, status: trade.status, inviterId: trade.members[0].player.id, expiresAt: trade.expiresAt, revision: trade.revision,
    participants: trade.members.map((s, index) => ({ id: s.player.id, name: s.player.name, offer: trade.offers[index], accepted: trade.accepted[index] })) });
  function sendTrade(trade, reason) { for (const s of trade.members) send(s.socket, { type: 'trade', trade: publicTrade(trade), ...(reason ? { reason } : {}) }); }
  function closeTrade(trade, reason, committed = false) {
    if (!trade || trade.committing && !committed || trades.get(trade.id) !== trade) return;
    trades.delete(trade.id);
    for (const s of trade.members) {
      if (playerTrades.get(s.player.id) === trade) playerTrades.delete(s.player.id);
      send(s.socket, { type: 'trade', trade: null, reason });
    }
  }
  function cancelTradeFor(id, reason) { closeTrade(playerTrades.get(id), reason); }
  function checkTrade(trade, now = Date.now()) {
    if (!trade || trade.committing) return !!trade;
    if (trade.expiresAt <= now) { closeTrade(trade, 'Trade expired.'); return false; }
    if (!nearbyTraders(...trade.members, now)) { closeTrade(trade, 'Trade cancelled. Stay alive and nearby in the same area.'); return false; }
    return true;
  }
  function validOffer(offer, owner, recipient) {
    if (!offer || typeof offer !== 'object' || Array.isArray(offer) || Object.keys(offer).length !== 3
        || !['gold', 'items', 'gear'].every(key => Object.hasOwn(offer, key)) || !nonnegativeInteger(offer.gold) || offer.gold > owner.gold
        || !offer.items || typeof offer.items !== 'object' || Array.isArray(offer.items)
        || Object.entries(offer.items).some(([key, quantity]) => !inventoryKeys.includes(key) || !nonnegativeInteger(quantity) || quantity > owner.inventory[key] || quantity > 0 && itemLocked(owner, key))
        || !Array.isArray(offer.gear) || offer.gear.length > Object.keys(GEAR).length || new Set(offer.gear).size !== offer.gear.length) return false;
    return offer.gear.every(id => typeof id === 'string' && gearIdValid(id) && !starterItems.has(id) && owner.ownedGear.includes(id) && !itemLocked(owner, id)
      && !Object.values(owner.equipment).includes(id) && !recipient.ownedGear.includes(id) && !auctionEscrowHas(recipient, id) && !bankEscrowHas(recipient, id) && !auctionIncomingGear(recipient.id, id)
      && (!gearById(id).className || gearById(id).className === recipient.appearance.className) && gearById(id).requiredLevel <= recipient.level);
  }
  function tradeBalances(trade) {
    const players = trade.members.map(s => s.player);
    if (!trade.offers.every((offer, index) => validOffer(offer, players[index], players[1 - index]))) return null;
    const result = players.map((p, index) => {
      const outgoing = trade.offers[index], incoming = trade.offers[1 - index];
      return { gold: p.gold - outgoing.gold + incoming.gold, goldReason: 'transfer:player',
        ...(outgoing.gold ? { goldEvent: { reason: 'transfer:player', created: 0, burned: 0, transferred: outgoing.gold } } : {}),
        inventory: Object.fromEntries(inventoryKeys.map(key => [key, p.inventory[key] - (outgoing.items[key] || 0) + (incoming.items[key] || 0)])),
        ownedGear: p.ownedGear.filter(id => !outgoing.gear.includes(id)).concat(incoming.gear) };
    });
    return result.every((p, index) => nonnegativeInteger(p.gold) && Object.values(p.inventory).every(nonnegativeInteger)
      && new Set(p.ownedGear).size === p.ownedGear.length && bagCanFit(players[index], p) && auctionItemsRetained(players[index], p)) ? result : null;
  }
  async function completeTrade(trade, balances) {
    trade.committing = true;
    for (const s of trade.members) { committingAccounts.set(s.recordKey, trade); cancelGathering(s); }
    try {
      await save(new Map(trade.members.map((s, index) => [s.player.id, balances[index]])), () => {
        for (let index = 0; index < trade.members.length; index++) Object.assign(trade.members[index].player, balances[index]);
      });
      closeTrade(trade, 'Trade completed.', true);
    } catch (error) {
      console.error('Trade save failed:', error.message);
      closeTrade(trade, 'Trade could not be confirmed because saving failed. Please try again.', true);
      dirty();
    } finally {
      for (const s of trade.members) {
        if (committingAccounts.get(s.recordKey) === trade) committingAccounts.delete(s.recordKey);
        if (liveSession(s)) send(s.socket, snapshot(s));
      }
    }
  }
  async function awardRaidCompletion(playerId,recordKey,runId,plan,shutdown=false) {
    plan ||= rollRaidRewards(()=>randomInt(0x1_0000_0000)/0x1_0000_0000);
    const player=records[recordKey]?.characters.find(player=>player.id===playerId);
    if(!player)return {plan,rewards:[],saved:true}; // A deleted character must never be recreated by delayed rewards.
    if(player.raidProgress?.completedRuns.includes(runId))return {plan,rewards:player.raidProgress.lastCompletion?.runId===runId?player.raidProgress.lastCompletion.rewards:plan,saved:true};
    if(committingAccounts.has(recordKey)||releasingAccounts.has(recordKey))return {plan,rewards:plan,saved:false};
    const saved=await commitStore({recordKey,player},current=>raidRewardChanges(current,runId,plan),true,undefined,undefined,undefined,shutdown);
    const current=records[recordKey]?.characters.find(player=>player.id===playerId),session=sessions.get(playerId);
    if(saved&&liveSession(session))event(session,'reward','Horned Apostle rewards saved to your raid collection.',true);
    return {plan,rewards:saved?current?.raidProgress.lastCompletion?.rewards||plan:plan,saved};
  }
  async function handleRaidProgression(session,message) {
    const fields={raidSpUnlock:['type'],raidPetEvolve:['type'],raidClaimHorns:['type'],raidSpUpgrade:['type','specialistId','protect','expectedUpgrade','expectedAttempts'],
      raidSpRepair:['type','specialistId'],raidSpEquip:['type','specialistId'],raidCosmeticEquip:['type','cosmetic','equipped']};
    if (!Object.hasOwn(fields,message.type)) return false;
    const hasEffectId=message.type==='raidSpUpgrade'&&Object.hasOwn(message,'upgradeEffectId');
    const effectId=hasEffectId&&typeof message.upgradeEffectId==='string'&&message.upgradeEffectId.length>0&&message.upgradeEffectId.length<=128?message.upgradeEffectId:undefined;
    const ready=()=>liveSession(session)&&session.player.hp>0&&!session.zeppelin&&!session.duel&&!inCombat(session)&&!raids.fighting(session)&&!session.casting&&!session.gathering;
    if (hasEffectId&&!effectId||Object.keys(message).length!==fields[message.type].length+Number(hasEffectId)||Object.keys(message).some(key=>!fields[message.type].includes(key)&&!(hasEffectId&&key==='upgradeEffectId'))) {event(session,'info','Invalid raid collection action.',false,message.type,effectId);return true;}
    if (!ready()||committingAccounts.has(session.recordKey)) {event(session,'info','Finish combat, travel and your current save before changing raid progression.',false,message.type,effectId);return true;}
    let text;const roll=randomInt(0x1_0000_0000)/0x1_0000_0000;const id=randomUUID();
    try {raidProgressionChanges(session.player,message,()=>roll,()=>id);}catch(error){event(session,'info',error.message,false,message.type,effectId);return true;}
    await completeTraining(session,()=>{if(!ready())throw Error('Finish the current activity first.');const result=raidProgressionChanges(session.player,message,()=>roll,()=>id);text=result.text;return result.changes;},
      'Raid collection saved.',()=>{
        const card=session.player.raidProgress?.specialists.find(card=>card.id===message.specialistId);
        send(session.socket,{type:'event',kind:'reward',text,playerId:session.player.id,...(message.type==='raidSpUpgrade'&&card?{specialistUpgrade:card.broken?'break':card.upgrade>message.expectedUpgrade?'success':'fail',...(effectId?{upgradeEffectId:effectId}:{})}:{})});
      },true,true,false,false,message.type,effectId);return true;
  }
  function completeTraining(session, changes, description, onPersist, interruptActivity = true, logOnly = false, backgroundLoot = false, queueLoot = false, requestType, upgradeEffectId) {
    const active = committingAccounts.get(session.recordKey);
    const append = queueLoot && active?.backgroundLoot && active.pending < lootQueueLimit;
    if (closing || !liveSession(session) || accountConnections.get(session.recordKey)?.session !== session
      || active && !append || releasingAccounts.has(session.recordKey)
      || database && !database.owns(session.recordKey)) return Promise.resolve(false);
    const purchase = append ? active : { backgroundLoot, pending: 0 };
    purchase.pending++;
    const prepareChanges = stagedPlayerChanges(session.player, changes);
    let staged, achievements;
    committingAccounts.set(session.recordKey, purchase);
    if (interruptActivity) {
      cancelTradeFor(session.player.id, 'Trade cancelled while purchasing training.');
      stand(session); cancelGathering(session);
    }
    const completion = save(new Map([[session.player.id, () => {
      staged = prepareChanges();
      if (!auctionItemsRetained(session.player, staged)) throw Error(auctionFinalityMessage);
      const projected = { ...session.player, ...staged };
      if (Object.hasOwn(staged, 'equipment') || Object.hasOwn(staged, 'talents')) {
        staged.maxHp = maxHealth(projected);
        staged.hp = Math.min(session.player.hp, staged.maxHp);
      }
      if (onboardingCanComplete(projected)) staged.onboarding = { ...projected.onboarding, completed: true };
      staged.achievements = { ...projected.achievements, unlocked: { ...projected.achievements.unlocked } };
      achievements = unlockAchievements({ ...projected, achievements: staged.achievements }, Date.now());
      return staged;
    }]]), () => {
      const currentHp = session.player.hp, currentAchievements = session.player.achievements;
      // Party kills and released projectiles can land while this save is pending.
      Object.assign(currentAchievements.unlocked, staged.achievements.unlocked);
      Object.assign(session.player, staged, { achievements: currentAchievements });
      if (Object.hasOwn(staged, 'equipment') || Object.hasOwn(staged, 'talents')) {
        session.player.maxHp = maxHealth(session.player);
        session.player.hp = Math.min(currentHp, session.player.maxHp);
        if (session.player.maxHp !== staged.maxHp) dirty();
        session.nextSpiritAt = Date.now() + 5000;
      }
      onPersist?.(currentHp);
    })
      .then(() => { if (['gold','inventory','carriedItems','ownedGear','skills','craftingXp','learnedSpells','ridingRank'].some(key => Object.hasOwn(staged, key))) recordReferralGameplay(session); sendAchievements(session, achievements); const text = typeof description === 'function' ? description() : description; if (text) event(session, 'reward', text, logOnly, requestType); return true; })
      .catch(error => { if (error.code === 'LOOT_REJECTED') return false; console.error('Inventory action save failed:', error.message); event(session, 'info', error.message === auctionFinalityMessage ? auctionFinalityMessage : 'Your action could not be saved. No items or gold were changed. Please try again.', backgroundLoot, requestType, upgradeEffectId); dirty(); return false; })
      .finally(() => {
        if (--purchase.pending === 0 && committingAccounts.get(session.recordKey) === purchase) committingAccounts.delete(session.recordKey);
        if (liveSession(session)) send(session.socket, snapshot(session));
      });
    // Every admitted pickup is already in save's FIFO; handoff and shutdown wait for all of them.
    purchase.completion = completion;
    return completion;
  }

  function collectLoot(session, drop, itemId, automatic = false, preview = false) {
    const p = session.player, now = Date.now();
    const clearReward = !automatic && drop && dungeons.get(session.instanceId)?.results?.get(p.id)?.lootId === drop.id;
    const tracing = drop?.ownerId === p.id && lootTrace.active(p.id);
    const skipped = tracing ? [] : null;
    const fail = text => { if (tracing) traceLootDecision(session, drop, { automatic, reason: text, skipped }); if (!automatic) event(session, 'info', text, !text.startsWith('Your bags are full.')); return false; };
    if (!drop || drop.ownerId !== p.id || drop.instanceId !== session.instanceId || drop.expiresAt <= now || !clearReward && distance(p, drop) > (automatic ? PET_LOOT_RADIUS : 3)) return fail('Move beside your fallen enemy to collect its loot.');
    if (drop.diedAt && now < drop.diedAt + DEATH_ANIMATION_MS) return fail('Wait for the enemy to finish falling.');
    if (!clearReward && (swimming(session) || !canTraverse(p, drop, session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS))) return fail('Reach the fallen enemy on a clear, dry path.');
    const rows = lootRows(drop);
    const selected = rows.filter(row => automatic
      ? row.kind === 'gold' || PET_LOOT_QUALITIES.indexOf(row.quality) >= PET_LOOT_QUALITIES.indexOf(p.petLootMinQuality)
      : itemId === undefined || (Array.isArray(itemId) ? itemId.includes(row.id) : row.id === itemId));
    if (tracing) for (const row of rows) if (!selected.includes(row)) skipped.push({ itemId: row.itemId, reason: automatic ? 'below_minimum_rarity' : 'not_selected' });
    let collected = lootCollected.get(drop);
    if (!collected) lootCollected.set(drop, collected = new Map());
    const captured = selected.map(row => ({ row: { ...row }, collected: collected.get(row.id) || 0 }));
    let taken = [];
    const prepare = () => {
      let changes = { gold: p.gold, inventory: { ...p.inventory }, carriedItems: { ...p.carriedItems }, ownedGear: [...p.ownedGear] };
      taken = [];
      const remaining = lootRows(drop);
      for (const entry of captured) {
        const quantity = Math.min(entry.row.quantity - ((collected.get(entry.row.id) || 0) - entry.collected), remaining.find(row => row.id === entry.row.id)?.quantity || 0);
        if (quantity <= 0) continue;
        const row = { ...entry.row, quantity };
        const next = { ...changes, inventory: { ...changes.inventory }, carriedItems: { ...changes.carriedItems }, ownedGear: [...changes.ownedGear] };
        if (row.kind === 'gold') next.gold += row.quantity;
        else if (row.kind === 'resource') next.inventory[row.itemId] += row.quantity;
        else if (row.kind === 'item' && lootItemValid(row.itemId)) next.carriedItems[row.itemId] = (next.carriedItems[row.itemId] || 0) + row.quantity;
        else if (row.kind === 'gear') {
          const item = gearById(row.itemId);
          if (!item || row.quantity !== 1 || next.ownedGear.includes(item.id) || auctionEscrowHas(p, item.id) || bankEscrowHas(p, item.id) || auctionIncomingGear(p.id, item.id)
              || item.className && item.className !== p.appearance.className || p.level < item.requiredLevel) {
            skipped?.push({ itemId: row.itemId, reason: 'gear_owned_reserved_or_ineligible' });
            if (automatic) continue;
            return fail('That equipment is already owned or reserved, or unavailable for your class and level. Other loot can still be collected separately.');
          }
          next.ownedGear.push(item.id);
        } else {
          skipped?.push({ itemId: row.itemId, reason: 'invalid_item' });
          if (automatic) continue;
          return fail('That item is unavailable.');
        }
        if (!Number.isSafeInteger(next.gold) || !bagCanFit(p, next)) {
          skipped?.push({ itemId: row.itemId, reason: Number.isSafeInteger(next.gold) ? 'bags_full' : 'gold_limit' });
          if (automatic) continue;
          return fail('Your bags are full. Collect individual items or make room before taking everything.');
        }
        changes = next; taken.push(row);
      }
      if (taken.length && p.onboarding && !p.onboarding.looted) changes.onboarding = { ...p.onboarding, looted: true };
      changes.goldReason = drop.sourceObjectId ? 'reward:dungeon_cache' : drop.goldReason || 'reward:monster';
      return changes;
    };
    if (!prepare()) return false;
    if (tracing) traceLootDecision(session, drop, { automatic, eligible: taken.map(row => row.itemId), skipped });
    if (!taken.length) return fail('That loot has already been collected.');
    if (preview) return true;
    if (automatic && (!session.petLoot || distance(session.petLoot, drop) > .5)) return false;
    const description = () => taken.length ? `${taken.map(row => `+${row.quantity} ${row.kind === 'gold' ? 'gold' : row.kind === 'gear' ? gearById(row.itemId).label : row.kind === 'item' ? LOOT_ITEMS[row.itemId].label : row.itemId === 'potion' ? 'healing potions' : row.itemId}`).join(' · ')} · ${automatic ? `Pet collected ${drop.name}` : `${drop.name} looted`}` : null;
    if (tracing) lootTrace.write(p.id, 'pickup_attempt', { dropId: drop.id, automatic, items: taken });
    const completion = completeTraining(session, () => {
      // Admission checked the corpse and position. Rebase only inventory at the writer boundary.
      const changes = prepare();
      if (!changes) throw Object.assign(Error('Loot is no longer available.'), { code: 'LOOT_REJECTED' });
      return changes;
    }, description, () => {
      for (const row of taken) {
        collected.set(row.id, (collected.get(row.id) || 0) + row.quantity);
        let remaining = row.quantity;
        const field = row.id === 'gold' ? 'gold' : row.id === 'resource:relic' ? 'relic' : null;
        if (field) { const amount = Math.min(drop[field] || 0, remaining); drop[field] = (drop[field] || 0) - amount; remaining -= amount; }
        for (const item of drop.items || []) if (item.id === row.id && remaining > 0) {
          const amount = Math.min(item.quantity, remaining); item.quantity -= amount; remaining -= amount;
        }
      }
      drop.items = (drop.items || []).filter(row => row.quantity > 0);
      if (!lootRows(drop).length) lootDrops.delete(drop.id);
    }, !automatic, true, true, !automatic);
    if (!tracing) return completion;
    return completion.then(success => {
      lootTrace.write(p.id, success ? 'pickup_saved' : 'pickup_save_failed', { dropId: drop.id, automatic, items: taken,
        remaining: lootRows(drop), savedCounts: taken.map(row => ({ itemId: row.itemId, count: row.kind === 'gold' ? p.gold
          : row.kind === 'gear' ? Number(p.ownedGear.includes(row.itemId)) : row.kind === 'item' ? p.carriedItems[row.itemId] || 0 : p.inventory[row.itemId] })), bags: lootTraceBag(p) });
      return success;
    });
  }

  function petLootPath(session, from, to) {
    if (!groundCanTraverse(from, to, session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS)) return false;
    if (session.instanceId) return true;
    const steps = Math.max(1, Math.ceil(distance(from, to) * 2));
    for (let i = 0; i <= steps; i++) if (waterAt(from.x + (to.x - from.x) * i / steps, from.z + (to.z - from.z) * i / steps)) return false;
    return true;
  }

  function petLootTargets(session, now) {
    const p = session.player, dungeon = dungeons.get(session.instanceId), targets = [];
    const reachable = target => distance(p, target) <= PET_LOOT_RADIUS && petLootPath(session, p, target);
    // ponytail: scan loot; index by instance if large corpse counts make these scans costly.
    for (const drop of lootDrops.values()) {
      const canReach = reachable(drop);
      if (!canReach && drop.ownerId === p.id && lootTrace.active(p.id)) traceLootDecision(session, drop, { automatic: true,
        reason: drop.instanceId !== session.instanceId ? 'different_instance' : distance(p, drop) > PET_LOOT_RADIUS ? 'out_of_range' : 'blocked_or_wet_path' });
      if (canReach && collectLoot(session, drop, undefined, true, true)) targets.push({ kind: 'drop', id: drop.id, x: drop.x, z: drop.z });
    }
    if (dungeon && (!dungeon.dream || now < dungeon.dream.endsAt)) for (const object of dungeonLayout(dungeon.kind).objects) {
      if (object.kind === 'chest' && !dungeon.activated.has(object.id) && dungeon.cleared.has(object.stageId) && reachable(object))
        targets.push({ kind: 'chest', id: object.id, x: object.x, z: object.z });
    }
    const expedition = p.treasureMap, site = mapSite(expedition);
    if (expedition?.stage === 'chest' && site && p.zone === site.zone && treasureMapReady(session) && reachable(site)) {
      try { treasureMapChanges(p, expedition); targets.push({ kind: 'treasure', id: expedition.id, x: site.x, z: site.z }); } catch { /* Keep a full chest intact until its rewards fit. */ }
    }
    return targets;
  }

  function autoLootWithPet(session, now) {
    const p = session.player, pet = publicNftOwnership(session).summonedPet;
    if (lootTrace.active(p.id)) {
      const reason = closing ? 'server_closing' : !pet ? 'no_summoned_pet' : p.hp <= 0 ? 'dead' : session.zeppelin ? 'zeppelin'
        : gmObserver(session) || arenaMode(session) ? 'observer_or_arena' : committingAccounts.has(session.recordKey) ? 'saving'
        : releasingAccounts.has(session.recordKey) ? 'leaving' : session.casting ? 'casting' : session.gathering ? 'gathering'
        : session.seated ? 'seated' : playerTrades.has(p.id) ? 'trading' : 'ready';
      if (session.lootTracePetReason !== reason) {
        lootTrace.write(p.id, 'pet_state', { reason, targetDropId: session.petLoot?.target?.kind === 'drop' ? session.petLoot.target.id : null });
        session.lootTracePetReason = reason;
      }
    }
    if (closing || !liveSession(session, now) || !pet || p.hp <= 0 || session.zeppelin || gmObserver(session) || arenaMode(session)) {
      session.petLoot = null; return;
    }
    let follower = session.petLoot;
    if (!follower || follower.pet !== pet || follower.instanceId !== session.instanceId)
      follower = session.petLoot = { pet, instanceId: session.instanceId, x: p.x, z: p.z, at: now, target: null };
    const elapsed = Math.max(0, now - follower.at) / 1000; follower.at = now;
    const colliders = session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, bounds = session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS;
    const busy = committingAccounts.has(session.recordKey) || releasingAccounts.has(session.recordKey) || session.casting || session.gathering || session.seated || playerTrades.has(p.id);
    if (busy) follower.target = null;
    else if (now >= (session.nextPetLootAt || 0)) {
      session.nextPetLootAt = now + 750;
      const targets = petLootTargets(session, now);
      follower.target = targets.find(target => target.kind === follower.target?.kind && target.id === follower.target?.id)
        || targets.sort((a, b) => distance(follower, a) - distance(follower, b))[0] || null;
    }
    // Recheck reachability during travel, including moving owners and closed dungeon gates.
    if (follower.target && (distance(p, follower.target) > PET_LOOT_RADIUS || !petLootPath(session, p, follower.target))) follower.target = null;
    let destination = follower.target || { x: p.x + Math.cos(p.rotation) * 1.15 - Math.sin(p.rotation) * 1.6, z: p.z - Math.sin(p.rotation) * 1.15 - Math.cos(p.rotation) * 1.6 };
    if (!follower.target && !groundCanTraverse(p, destination, colliders, bounds)) destination = p;
    const gap = distance(follower, destination), clear = follower.target ? petLootPath(session, follower, destination) : groundCanTraverse(follower, destination, colliders, bounds);
    if (!follower.target && (gap > 18 || !clear)) { follower.x = destination.x; follower.z = destination.z; }
    else if (!clear) follower.target = null;
    else if (gap > .01) {
      const step = Math.min(gap, elapsed * (follower.target ? 6 : Math.min(20, 4 + gap * 2)));
      follower.x += (destination.x - follower.x) / gap * step; follower.z += (destination.z - follower.z) / gap * step;
    }
    const target = follower.target;
    if (!target || distance(follower, target) > .45) return;
    follower.target = null; session.nextPetLootAt = now + 750;
    if (target.kind === 'drop') void collectLoot(session, lootDrops.get(target.id), undefined, true);
    else if (target.kind === 'chest') {
      dungeonInteract(session, target.id, true);
      const drop = [...lootDrops.values()].find(drop => drop.ownerId === p.id && drop.instanceId === session.instanceId && drop.sourceObjectId === target.id);
      if (drop) void collectLoot(session, drop, undefined, true);
    } else void handleTreasureMap(session, { type: 'treasureMapOpen', expeditionId: target.id }, true);
  }

  const serviceNearby = (session, npcs, npcId) => liveSession(session) && session.player.hp > 0 && !session.instanceId && !session.zeppelin && !swimming(session)
    && npcs.find(npc => (npcId === undefined || npc.id === npcId) && session.player.zone === npc.zone && distance(session.player, npc) <= 4
      && canTraverse(session.player, npc, WORLD_COLLIDERS, WORLD_BOUNDS));
  const auctionNearby = (session, npcId) => serviceNearby(session, AUCTIONEERS, npcId);
  const deedAuctionNearby = session => liveSession(session) && session.player.hp > 0 && !session.instanceId && !session.zeppelin
    && session.player.zone === DEED_AUCTIONEER.zone && distance(session.player, DEED_AUCTIONEER) <= 4
    && canTraverse(session.player, DEED_AUCTIONEER, WORLD_COLLIDERS, WORLD_BOUNDS);
  const auctionOwners = () => Object.entries(records).flatMap(([recordKey, account]) => account.characters.map(player => ({ recordKey, player })));
  const auctionOwner = id => auctionOwners().find(owner => owner.player.auctions.some(listing => listing.id === id));
  function pendingAuctionPurchases() {
    const purchases = new Map();
    for (const account of Object.values(records)) for (const player of account.characters) for (const { id, item, currency, price, reservation } of player.auctions) {
      if (!reservation || reservation.delivered) continue;
      if (!purchases.has(reservation.buyerId)) purchases.set(reservation.buyerId, []);
      purchases.get(reservation.buyerId).push({ id, item, currency, price, expiresAt: reservation.expiresAt });
    }
    return purchases;
  }
  const auctionFinalityMessage = 'Auction items awaiting payment verification cannot be consumed, moved or sold yet.';
  // Signed reservations keep their payout address; unreserved listings follow a newly verified wallet.
  const auctionWalletLocked = playerId => auctionOwners().some(owner => owner.player.auctions.some(listing => listing.currency !== 'gold' && listing.reservation
    && (listing.sellerId === playerId || listing.reservation.buyerId === playerId)));
  const auctionWalletChanges = (player, wallet) => ({ auctionWallet: wallet, auctions: player.auctions.map(listing =>
    listing.currency !== 'gold' && !listing.reservation ? { ...listing, sellerWallet: wallet } : listing) });
  function auctionItemsRetained(player, changes, exceptId) {
    // ponytail: scan listings; index grants by buyer if auction volume makes inventory checks costly.
    const pending = new Map();
    for (const owner of auctionOwners()) for (const listing of owner.player.auctions) {
      if (listing.id === exceptId || !listing.reservation?.delivered || listing.reservation.buyerId !== player.id) continue;
      const { kind, id, quantity } = listing.item, key = `${kind}:${id}`;
      pending.set(key, { kind, id, quantity: quantity + (pending.get(key)?.quantity || 0) });
    }
    const next = { ...player, ...changes };
    return [...pending.values()].every(({ kind, id, quantity }) => kind === 'gear' ? next.ownedGear.includes(id)
      : (kind === 'item' ? next.carriedItems[id] || 0 : next.inventory[id]) >= quantity);
  }
  const auctionIncomingGear = (buyerId, gearId, exceptId) => auctionOwners().some(owner => owner.player.auctions.some(listing => listing.id !== exceptId
    && listing.reservation?.buyerId === buyerId && listing.item.kind === 'gear' && listing.item.id === gearId));
  const auctionReceive = (player, item, exceptId, returning = false) => auctionCanReceive(player, item, returning) && (item.kind !== 'gear' || !bankEscrowHas(player, item.id) && !auctionIncomingGear(player.id, item.id, exceptId));
  const reservedLootGear = player => [
    ...[...lootDrops.values()].filter(drop => drop.ownerId === player.id).flatMap(drop => (drop.items || []).filter(row => row.kind === 'gear').map(row => row.itemId)),
    ...auctionOwners().flatMap(owner => owner.player.auctions.filter(listing => listing.reservation?.buyerId === player.id && listing.item.kind === 'gear').map(listing => listing.item.id)),
  ];
  const rolledLoot = (kind, level, player, source, trace) => rollMonsterLoot(kind, level, player, Math.random, source && { ...source, dungeonKind: dungeons.get(source.instanceId)?.kind, reservedGear: reservedLootGear(player), trace }).filter(row => {
    const retained = row.kind !== 'gear' || !bankEscrowHas(player, row.itemId) && !auctionIncomingGear(player.id, row.itemId);
    if (!retained) trace?.({ stage: 'reservation-filter', itemId: row.itemId, reason: 'bank_or_incoming_auction' });
    return retained;
  });
  const bankNearby = (session, npcId) => serviceNearby(session, BANKERS, npcId);
  function sendBank(session, reason, open = false) {
    const banker = bankNearby(session); if (!banker) return;
    const bank = session.player.bank;
    send(session.socket, { type: 'bank', npcId: banker.id, bank, items: bankItems(bank), capacity: BANK_CAPACITY, open, ...(reason ? { reason } : {}) });
  }
  const pollNearby = (session, booth) => !!booth && liveSession(session) && !closing && session.player.hp > 0
    && !session.instanceId && !session.zeppelin && !session.duel && session.player.zone === booth.zone
    && physicalReach(session, booth, 4) && canTraverse(session.player, booth, WORLD_COLLIDERS, WORLD_BOUNDS);
  async function handlePoll(connection, message) {
    const session = connection.session, requestType = message.type, open = requestType === 'pollOpen';
    const fail = text => event(session, 'info', text, false, requestType);
    const fields = open ? ['type', 'boothId'] : ['type', 'boothId', 'pollId', 'answers'];
    if (Object.keys(message).length !== fields.length || !fields.every(field => Object.hasOwn(message, field))) { fail('Invalid polling booth request.'); return; }
    const booth = POLL_BOOTHS.find(booth => booth.id === message.boothId);
    if (!pollNearby(session, booth)) { fail('Stand beside a polling booth to take part.'); return; }
    if (connection.pollBusy || Date.now() - (connection.lastPollRequest ?? -Infinity) < 500) { fail('Wait a moment before using the polling booth again.'); return; }
    connection.lastPollRequest = Date.now(); connection.pollBusy = true;
    try {
      if (!open) {
        const poll = polls.find(poll => poll.id === message.pollId);
        if (!poll || !pollAnswersValid(poll, message.answers)) { fail('Answer every question with Yes, No, or Skip.'); return; }
        if (pollStatus(poll) !== 'open') { fail('This poll is not open for voting.'); return; }
        await pollStore.submitPoll(connection.recordKey, poll, message.answers, () => pollNearby(session, booth) && connection.session === session && !connection.releasing && !connection.retiring && !connection.account.ban && !database?.isDeleting(connection.recordKey));
      }
      const serverTime = Date.now(), views = await pollStore.readPolls(connection.recordKey, polls, serverTime);
      if (!liveSession(session) || connection.session !== session) return;
      if (open && !pollNearby(session, booth)) { fail('Stand beside a polling booth to take part.'); return; }
      stand(session);
      send(session.socket, { type: 'polls', boothId: booth.id, polls: views, serverTime, open, ...(!open ? { submittedPollId: message.pollId } : {}) });
    } catch (error) {
      fail(error.code === 'POLL_REJECTED' ? error.message : 'The polling booth could not save or load your ballot. Reopen it to check before trying again.');
    } finally { connection.pollBusy = false; }
  }
  const inCombat = session => worldPvp(session) || !!session.duel || !!session.companion?.assault || !!session.casting && session.casting.ability !== 'mount' || pendingHits.some(hit => hit.session === session && hit.enemy.alive && hit.enemy.respawnAt === hit.life)
    || enemies.some(enemy => enemy.alive && enemy.instanceId === session.instanceId
      && (enemy.target === session || enemy.threat.has(session) || enemy.attack?.targetId === session.player.id));
  async function refreshAuctionStatus() {
    if (cryptoCheck) return cryptoCheck;
    if (cryptoCheckedAt && Date.now() - cryptoCheckedAt < 20000) return;
    cryptoCheck = Promise.all([chain.status(), mossChain.status()]).then(([status, moss]) => { cryptoStatus = { ...status, moss }; cryptoCheckedAt = Date.now(); })
      .catch(() => { cryptoStatus = { enabled: false, reason: 'The auction payment service is unavailable.' }; cryptoCheckedAt = Date.now(); })
      .finally(() => { cryptoCheck = null; });
    await cryptoCheck;
  }
  function recordReferralGameplay(session, now = Date.now()) {
    if (!referralsEnabled || session.role === 'gm') return;
    const referral = records[session.recordKey]?.referral;
    if (referral && referralPlayed(referral, now, session.player.level)) dirty();
  }
  function sendReferral(connection, error) {
    if (connection.account?.referral) send(connection.socket, { type: 'referrals', ...referralView(connection.account.referral, referralsEnabled && cryptoStatus.moss?.referralsEnabled === true, error, referralsEnabled, cryptoStatus.moss?.referralsEnabled && cryptoStatus.moss.feeVersion !== 2 ? 1 : 2) });
  }
  async function bindReferral(connection, code) {
    if (!referralsEnabled) throw Error('The referral program is not available yet.');
    code = normalizeReferralCode(code);
    if (!code) throw Error('Enter a valid referral code or invite link.');
    if (!connection.account.referral.canBind || connection.account.referral.referredBy) throw Error('Referral codes can only be entered once, before you start playing.');
    await refreshRecords();
    const matches = Object.entries(records).filter(([, account]) => account.referral.code === code);
    const [key, account] = matches.length === 1 ? matches[0] : [];
    if (!account || account.ban || database?.isDeleting(key)) throw Error('This referral code is unavailable.');
    if (key === connection.recordKey || referralWalletsOverlap(connection.account, account)) throw Error('You cannot refer your own account or wallet.');
    if (closing || connection.releasing || accountConnections.get(connection.recordKey) !== connection || committingAccounts.has(connection.recordKey)) throw Error('Finish saving before entering a referral code.');
    const operation = {}; committingAccounts.set(connection.recordKey, operation);
    operation.completion = save(new Map(), undefined, new Map([[connection.recordKey, () => {
      if (!connection.account.referral.canBind || connection.account.referral.referredBy) throw Error('Your referral can no longer be changed.');
      return { referral: { ...connection.account.referral, referredBy: key, boundAt: Date.now(), canBind: false } };
    }]])).finally(() => { if (committingAccounts.get(connection.recordKey) === operation) committingAccounts.delete(connection.recordKey); });
    await operation.completion;
  }
  async function referralTerms(session, listing) {
    if (!referralsEnabled || listing.currency !== 'moss') return {};
    const account = records[session.recordKey], referral = account.referral;
    if (!referral.referredBy) return {};
    if (database) {
      const [row] = await database.read([referral.referredBy]);
      if (!row) return {};
      applyStoredRow(row);
      if ((await database.deletionStatus(referral.referredBy)).status !== 'none') return {};
    }
    const referrer = records[referral.referredBy], payout = referrer?.referral.payoutWallet;
    if (!referrer || referrer.ban || database?.isDeleting(referral.referredBy) || referralWalletsOverlap(account, referrer)
        || referrer.characters.some(p => p.id === listing.sellerId) || referralWallets(referrer).includes(listing.sellerWallet.toLowerCase())) return {};
    const rpc = getChainRpc(process.env.STORE_RPC_URL || process.env.MOSS_AUCTION_RPC_URL || 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');
    const now = Date.now(), block = referralPrice ? undefined : await rpc('eth_getBlockByNumber', ['finalized', false]);
    const price = await (referralPrice || readStorePrice)({ rpc, block, now, purpose: 'holdings' });
    if (!price || !/^[1-9]\d{0,77}$/.test(price.usdWei) || !Number.isSafeInteger(price.observedAt) || Date.now() - price.observedAt > 90000 || price.observedAt > Date.now() + 15000) throw Error('A fresh MOSS/USD referral quote is unavailable.');
    const value = BigInt(auctionPriceWei(listing.price, 'moss')) * BigInt(price.usdWei) * 100n / 10n ** 36n;
    const referralUsdCents = Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
    const rate = referral.qualified ? referralFeeBps(referrer.referral.qualifiedCount, cryptoStatus.moss?.referralsEnabled && cryptoStatus.moss.feeVersion !== 2 ? 1 : 2) : 0;
    // Qualified referrals must not silently lose their commission on an old contract.
    if (rate && !payout) throw Object.assign(Error('Your referrer must connect an Auction House wallet before this reward can be paid.'), { code: 'REFERRAL_UNAVAILABLE' });
    if (rate && payout && cryptoStatus.moss?.referralsEnabled !== true) throw Object.assign(Error('Referral rewards are awaiting the Auction House contract upgrade.'), { code: 'REFERRAL_UNAVAILABLE' });
    return { referralUsdCents, referralQuoteExpiresAt: price.observedAt + 90000, ...(rate && payout ? { referrer: payout, referralBps: rate } : {}) };
  }
  function sendAuction(session, reason, open = false) {
    const auctioneer = auctionNearby(session); if (!auctioneer) return;
    const listings = auctionOwners().flatMap(owner => owner.player.auctions).map(({ sellerWallet, reservation, ...listing }) => ({ ...listing,
      ...(reservation ? { reservation: { buyerId: reservation.buyerId, expiresAt: reservation.expiresAt, ...(reservation.delivered ? { delivered: true } : {}), ...(reservation.processed ? { processed: true } : {}) } } : {}) }))
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    send(session.socket, { type: 'auction', npcId: auctioneer.id, open, listings, mine: listings.filter(listing => listing.sellerId === session.player.id),
      sold: session.player.auctionSales, economyVersion, goldExchangeEnabled: economyVersion >= 1 && goldExchangeEnabled, crypto: cryptoStatus, wallet: session.player.auctionWallet || null, ...(reason ? { reason } : {}) });
  }
  function sendAuctionPayment(session, listing) {
    if (!liveSession(session) || listing?.reservation?.buyerId !== session.player.id) return;
    if (listing.reservation.processed) { sendAuction(session, 'Payment found. Checking gold delivery.'); return; }
    if (listing.reservation.delivered) { sendAuction(session, 'Your item is in your bags while payment is checked.'); return; }
    const order = listing.reservation.order;
    const status = paymentStatus(listing.currency);
    if (!status?.enabled || order.chainId !== status.chainId || order.contract.toLowerCase() !== status.contract?.toLowerCase()) {
      event(session, 'info', 'The payment service is unavailable for this order. Your item stays reserved.', false, 'auctionBuy'); return;
    }
    send(session.socket, { type: 'auctionPayment', listingId: listing.id, order });
  }
  function completeAuction(session, owners, description, prepare, releasingListingId, referralPurchase) {
    if (closing || session && (!liveSession(session) || accountConnections.get(session.recordKey)?.session !== session)
      || owners.some(owner => committingAccounts.has(owner.recordKey) || releasingAccounts.has(owner.recordKey))) return Promise.resolve(false);
    const purchase = {};
    const expected = new Map(owners.map(owner => [owner.recordKey, structuredClone(records[owner.recordKey])]));
    for (const owner of owners) {
      committingAccounts.set(owner.recordKey, purchase);
      const active = accountConnections.get(owner.recordKey)?.session;
      if (active) { cancelTradeFor(active.player.id, 'Trade cancelled while settling an auction.'); stand(active); cancelGathering(active); }
    }
    purchase.completion = (async () => {
      const updates = prepare ? await prepare() : owners;
      if (closing && prepare) return false; // A signed order is never exposed before its durable reservation.
      if (updates.some(update => !auctionItemsRetained(update.player, update.changes, releasingListingId))) throw Error('Auction items are awaiting payment verification.');
      await save(new Map(updates.map(update => [update.player.id, update.changes])), () => {
        for (const update of updates) {
          const currentHp = update.player.hp;
          Object.assign(update.player, update.changes);
          if (Object.hasOwn(update.changes, 'equipment')) {
            update.player.maxHp = maxHealth(update.player);
            update.player.hp = Math.min(currentHp, update.player.maxHp);
            if (update.player.hp !== update.changes.hp) dirty();
          }
        }
      }, new Map(), expected, undefined, undefined, undefined, referralPurchase);
      if (session) event(session, 'reward', description);
      else for (const owner of owners) { const active = sessions.get(owner.player.id); if (liveSession(active)) event(active, 'reward', description); }
      for (const active of sessions.values()) if (auctionNearby(active)) sendAuction(active, owners.some(owner => owner.player.id === active.player.id) ? description : undefined);
      return true;
    })().catch(error => {
      console.error('Auction save failed:', error.message);
      if (session) { event(session, 'info', error.code === 'REFERRAL_UNAVAILABLE' ? error.message : 'The auction could not be saved. No items or gold were moved. Please try again.', false, 'auction'); sendAuction(session); }
      dirty(); return false;
    }).finally(() => {
      for (const owner of owners) {
        if (committingAccounts.get(owner.recordKey) === purchase) committingAccounts.delete(owner.recordKey);
        const active = accountConnections.get(owner.recordKey)?.session;
        if (liveSession(active)) send(active.socket, snapshot(active));
      }
    });
    return purchase.completion;
  }
  async function settleAuction(listingId, transactionHash, followup = false) {
    const running = settlingAuctions.get(listingId);
    if (running) {
      // One success-triggered follow-up may bypass the next poll; duplicate hashes never form a retry loop.
      if (transactionHash && !running.followup) running.recheckHash = transactionHash;
      return;
    }
    const before = auctionOwner(listingId)?.player.auctions.find(listing => listing.id === listingId);
    if (!before?.reservation) return;
    const expectedReservation = JSON.stringify(before.reservation);
    const checking = { followup, recheckHash: undefined };
    settlingAuctions.set(listingId, checking);
    try {
      const order = before.reservation.order;
      const settlementChain = paymentChain(before.currency);
      const settlement = transactionHash ? await settlementChain.verifyPayment(order, transactionHash) : await settlementChain.settlement(order);
      if (closing || !['pending', 'expired', 'processed', 'paid'].includes(settlement.state)) return;
      const owner = auctionOwner(listingId), listing = owner?.player.auctions.find(item => item.id === listingId);
      const buyer = auctionOwners().find(owner => owner.player.id === before.reservation.buyerId);
      if (!listing || JSON.stringify(listing.reservation) !== expectedReservation || !buyer
          || committingAccounts.has(owner.recordKey) || committingAccounts.has(buyer.recordKey)) return;
      if (listing.item.kind === 'gold') {
        // Successful canonical payment releases the gold immediately; unpaid expiry still requires finality.
        if (settlement.state === 'pending' && (!listing.reservation.processed || settlement.revoked !== true)) return;
        if (settlement.state === 'processed' && listing.reservation.processed && !settlement.reanchored) return 'processed';
        const { paymentBlock, ...unanchored } = order;
        const { reservation: previous, ...unreserved } = listing;
        const reservation = { buyerId: previous.buyerId, expiresAt: previous.expiresAt, ...(previous.referralBoundAt ? { referralBoundAt: previous.referralBoundAt } : {}),
          order: settlement.state === 'processed' ? { ...order, paymentBlock: { hash: settlement.blockHash, number: settlement.blockNumber } } : unanchored,
          ...(settlement.state === 'processed' ? { processed: true } : {}) };
        const paid = settlement.state === 'paid', net = listing.item.quantity - listing.goldFee;
        if (paid && !Number.isSafeInteger(buyer.player.gold + net)) return;
        const auctions = paid ? owner.player.auctions.filter(row => row.id !== listingId)
          : owner.player.auctions.map(row => row.id === listingId ? settlement.state === 'expired' ? unreserved : { ...listing, reservation } : row);
        const changes = paid ? { gold: buyer.player.gold + net, goldReason: 'transfer:auction' } : {};
        const description = paid ? `Payment processed. ${net} gold delivered after the ${listing.goldFee} gold fee. The seller can withdraw MOSS.`
          : settlement.state === 'processed' ? 'Payment found. Checking gold delivery.'
          : settlement.state === 'expired' ? 'Unpaid reservation expired. The gold lot is available again.' : 'Payment was removed from the chain. The gold lot remains reserved.';
        if (await completeAuction(null, [{ ...owner, changes: { auctions, ...(paid ? { auctionSales: auctionRecordSale(owner.player, listing, buyer.player.name),
          goldEvent: { reason: 'exchange:fee', created: 0, burned: listing.goldFee, transferred: net } } : {}) } }, { ...buyer, changes }], description, undefined, undefined, paid && listing.currency === 'moss' ? { buyerKey: buyer.recordKey, sellerKey: owner.recordKey, listingId, orderHash: order.orderHash } : undefined)) return settlement.state;
        return;
      }
      const delivered = listing.reservation.delivered === true, grant = ['processed', 'paid'].includes(settlement.state);
      if ((!grant && delivered && settlement.revoked !== true) || (settlement.state === 'pending' && !delivered)) return;
      if (settlement.state === 'processed' && delivered && !settlement.reanchored) return 'processed';
      // Only the buyer's owning realm can change its inventory, including a rollback.
      if ((grant || delivered) && database && (!database.owns(buyer.recordKey) || releasingAccounts.has(buyer.recordKey))) return;
      if (grant && !delivered && !auctionReceive(buyer.player, listing.item, listingId)) {
        const active = sessions.get(buyer.player.id); if (active) sendAuction(active, 'Payment confirmed. Make room in your bags to receive your item.');
        return 'bags-full';
      }
      let changes = grant && !delivered ? auctionItemChanges(buyer.player, listing.item, 1)
        : !grant && delivered ? auctionItemChanges(buyer.player, listing.item, -1) : {};
      if (!grant && delivered && listing.item.kind === 'gear') {
        const equipment = { ...buyer.player.equipment }, starter = starterGear(buyer.player.appearance.className);
        for (const slot of EQUIPMENT_SLOTS) if (equipment[slot] === listing.item.id) {
          equipment[slot] = starter.equipment[slot] || null;
          if (equipment[slot] && !changes.ownedGear.includes(equipment[slot])) changes.ownedGear.push(equipment[slot]);
        }
        changes = { ...changes, equipment, bank: { ...buyer.player.bank, gear: buyer.player.bank.gear.filter(id => !changes.ownedGear.includes(id)) },
          maxHp: maxHealth({ ...buyer.player, ...changes, equipment }) };
        changes.hp = Math.min(buyer.player.hp, changes.maxHp);
      }
      const { paymentBlock, ...unanchoredOrder } = order;
      const reservation = grant ? { ...listing.reservation, delivered: true, order: { ...order, paymentBlock: { hash: settlement.blockHash, number: settlement.blockNumber } } }
        : { buyerId: listing.reservation.buyerId, expiresAt: listing.reservation.expiresAt, order: unanchoredOrder, ...(listing.reservation.referralBoundAt ? { referralBoundAt: listing.reservation.referralBoundAt } : {}) };
      const { reservation: previous, ...unreserved } = listing;
      const auctions = settlement.state === 'paid' ? owner.player.auctions.filter(item => item.id !== listingId)
        : owner.player.auctions.map(item => item.id === listingId ? settlement.state === 'expired' ? unreserved : { ...listing, reservation } : item);
      const description = settlement.state === 'processed' ? `Payment processed. ${auctionItemLabel(listing.item)} is in your bags; it can be equipped while payment verification finishes.`
        : settlement.state === 'paid' ? `Payment processed. ${auctionItemLabel(listing.item)} is yours. The seller can withdraw ${listing.currency.toUpperCase()} from the auction contract.`
        : delivered ? 'Payment was removed from the chain. The temporary auction item was reverted.' : 'Unpaid reservation expired. The item is available again.';
      if (await completeAuction(null, [{ ...owner, changes: { auctions, ...(settlement.state === 'paid' ? { auctionSales: auctionRecordSale(owner.player, listing, buyer.player.name) } : {}) } }, { ...buyer, changes }], description, undefined, !grant ? listingId : undefined, settlement.state === 'paid' && listing.currency === 'moss' ? { buyerKey: buyer.recordKey, sellerKey: owner.recordKey, listingId, orderHash: order.orderHash } : undefined)) return settlement.state;
    } catch (error) {
      // RPC loss, reorg uncertainty, or unavailable saving keep both the item and signed order reserved.
      if (!closing) console.error('Auction settlement deferred:', error.message);
    } finally {
      settlingAuctions.delete(listingId);
      if (checking.recheckHash && !closing) void settleAuction(listingId, checking.recheckHash, true);
    }
  }

  async function refreshStoreStatus() {
    if (storeChecking) return storeChecking;
    if (storeCheckedAt && Date.now() - storeCheckedAt < 20000) return;
    storeChecking = burnChain.status().then(status => { storeStatus = status; storeCheckedAt = Date.now(); })
      .catch(() => { storeStatus = { enabled: false, reason: 'The MOSS store is temporarily unavailable.' }; storeCheckedAt = Date.now(); })
      .finally(() => { storeChecking = null; });
    return storeChecking;
  }
  function sendStore(session, message) {
    if (!liveSession(session)) return;
    send(session.socket, { type: 'storeState', state: { ...storeStatus, mobile: mobilePurchaseStatus(),
      mobileOrders: session.player.mobileStoreOrders.map(({ id, productId, status, createdAt, expiresAt, reward, reason }) => ({ id, productId, status, createdAt, expiresAt, ...(reward ? { reward } : {}), ...(reason ? { reason } : {}) })), wallet: session.player.auctionWallet || null,
      owned: session.player.storePurchases, orders: session.player.storeOrders, consumables: session.player.storeConsumables, boosts: session.player.storeBoosts }, ...(message ? { message } : {}) });
  }
  function commitStore(owner, prepare, claimOffline = false, mobileReceipt, treasureReservation, goldRoundAction, allowShutdown = false) {
    if (closing && !allowShutdown || records[owner.recordKey]?.characters.find(player => player.id === owner.player.id) !== owner.player
        || committingAccounts.has(owner.recordKey) || releasingAccounts.has(owner.recordKey)
        || database && (database.owns(owner.recordKey) ? !accountConnections.has(owner.recordKey) : !claimOffline)) return Promise.resolve(false);
    const purchase = {};
    let claimed = false;
    committingAccounts.set(owner.recordKey, purchase);
    cancelTradeFor(owner.player.id, 'Trade cancelled while saving character progress.');
    purchase.completion = (async () => {
      if (database && !database.owns(owner.recordKey)) {
        // RPC checks finish before this short account lock, so offline monitoring never holds up login on the network.
        flush = flush.catch(() => {}).then(async () => {
          if (closing && !allowShutdown || accountConnections.has(owner.recordKey) || releasingAccounts.has(owner.recordKey)) return;
          const state = await database.claim(owner.recordKey);
          if (!state) return;
          claimed = true;
          validateRecords({ [owner.recordKey]: state }, true);
          records[owner.recordKey] = state;
          lastSaved.set(owner.recordKey, JSON.stringify(state));
          owner = { ...owner, player: state.characters.find(player => player.id === owner.player.id) };
        });
        await flush;
        if (!claimed || !owner.player) return false;
      }
      const changes = await prepare(owner.player);
      if (closing && !allowShutdown || !changes) return false;
      const specialistProgressBeforeSave = changes.specialistNftOrders ? JSON.stringify(owner.player.raidProgress) : undefined;
      purchase.specialistNft = specialistProgressBeforeSave !== undefined;
      if (!auctionItemsRetained(owner.player, changes)) throw Error(auctionFinalityMessage);
      await save(new Map([[owner.player.id, () => {
        if (specialistProgressBeforeSave !== undefined && JSON.stringify(owner.player.raidProgress) !== specialistProgressBeforeSave) throw Error('Specialist progress changed while saving. Review it again.');
        // Party XP and damage may arrive while another account's save is queued.
        if (changes.appearance) {
          changes.maxHp = maxHealth({ ...owner.player, ...changes });
          changes.hp = Math.min(owner.player.hp, changes.maxHp);
        }
        return changes;
      }]]), () => {
        const currentHp = owner.player.hp;
        Object.assign(owner.player, changes);
        if (changes.appearance) {
          owner.player.maxHp = maxHealth(owner.player);
          owner.player.hp = Math.min(currentHp, owner.player.maxHp);
          if (owner.player.hp !== changes.hp || owner.player.maxHp !== changes.maxHp) dirty();
        }
        // Also clear cached travel: character selection can restore a previous session after logout.
        for (const session of new Set([sessions.get(owner.player.id), activity.get(owner.player.id)])) {
          if (!session) continue;
          revokeNftMount(session);
        }
      }, new Map(), undefined, mobileReceipt, treasureReservation, goldRoundAction);
      return true;
    })().finally(async () => {
      try {
        if (claimed && (!closing || allowShutdown)) {
          flush = flush.catch(() => {}).then(() => database.release(owner.recordKey));
          await flush;
          lastSaved.delete(owner.recordKey);
        }
      } catch (error) { failPersistence(error); throw error; }
      finally {
        if (committingAccounts.get(owner.recordKey) === purchase) committingAccounts.delete(owner.recordKey);
        const active = owner.player && sessions.get(owner.player.id);
        if (liveSession(active)) { send(active.socket, snapshot(active)); sendStore(active); }
        const connection = accountConnections.get(owner.recordKey);
        if (connection?.joined && !connection.session) sendRoster(connection);
      }
    });
    return purchase.completion;
  }
  function settleStore(owner, orderId) {
    if (settlingStore.has(orderId)) return settlingStore.get(orderId);
    const order = owner.player.storeOrders.find(order => order.id === orderId);
    if (!order || ['delivered', 'expired'].includes(order.status) || closing || committingAccounts.has(owner.recordKey)
        || releasingAccounts.has(owner.recordKey)) return Promise.resolve();
    const expected = JSON.stringify(order);
    const work = (async () => {
      // Contract storage is the receipt: recovery never depends on the browser retaining a transaction hash.
      const result = await burnChain.settlement(order);
      if (closing) return;
      if (!['paid', 'processed', 'pending', 'expired'].includes(result.state)) throw Error('The store could not verify this purchase.');
      const grant = ['paid', 'processed'].includes(result.state);
      if (!grant && order.status === 'processed' && result.revoked !== true) return;
      if (result.state === 'pending' && order.status !== 'processed') return;
      if (result.state === 'processed' && order.status === 'processed' && !result.reanchored) return;
      const product = storeProduct(order.productId), repeatable = storeRepeatable(product);
      const committed = await commitStore(owner, async player => {
        const current = player.storeOrders.find(item => item.id === orderId);
        if (JSON.stringify(current) !== expected) return;
        const status = result.state === 'paid' ? 'delivered' : result.state === 'pending' ? 'submitted' : result.state;
        const changes = { storeOrders: player.storeOrders.map(item => item.id === orderId
          ? { ...item, status, ...((result.state === 'processed' || result.state === 'paid') && result.blockHash && result.blockNumber ? { paymentBlock: { hash: result.blockHash, number: result.blockNumber } } : {}) } : item) };
        if (product.kind === 'class-change') {
          const receipt = changes.storeOrders.find(item => item.id === orderId);
          if (grant && !receipt.reward) receipt.reward = storeRewardChanges(player, receipt).reward;
          else if (!grant && receipt.reward?.redeemedAt === undefined) delete receipt.reward;
        } else if (repeatable && result.state === 'paid') {
          const delivered = changes.storeOrders.find(item => item.id === orderId);
          const poolSize = storeCosmeticPool(player).length;
          const reward = storeRewardChanges(player, delivered, Date.now(), () => randomInt(poolSize) / poolSize);
          Object.assign(changes, reward.changes);
          delivered.reward = reward.reward;
        } else if (!repeatable && grant && order.status !== 'processed') {
          changes.storePurchases = [...new Set([...player.storePurchases, product.id])];
          if (product.kind === 'mount') changes.ownedMounts = [...new Set([...player.ownedMounts, product.rewardId])];
          if (product.kind === 'pet') changes.ownedPets = [...new Set([...player.ownedPets, product.rewardId])];
          if (product.kind === 'title') changes.title = product.rewardId;
        } else if (!repeatable && !grant && order.status === 'processed') {
          changes.storePurchases = player.storePurchases.filter(id => id !== product.id);
          if (product.kind === 'mount') changes.ownedMounts = player.ownedMounts.filter(id => id !== product.rewardId);
          if (product.kind === 'pet') {
            changes.ownedPets = player.ownedPets.filter(id => id !== product.rewardId);
            if (player.summonedPet === product.rewardId) changes.summonedPet = null;
          }
          if (product.kind === 'title' && player.title === product.rewardId) changes.title = null;
        }
        return changes;
      }, true);
      if (committed) {
        const active = sessions.get(owner.player.id);
        const text = product.kind === 'class-change' ? grant ? 'MOSS burn processed. Your class-change receipt is ready in the store.' : 'The class-change payment is not currently verified. Any completed swap remains saved.'
          : repeatable ? result.state === 'paid' ? `${product.name} delivered. ${product.kind === 'boost' ? 'Activate your charge from the store when ready.' : product.kind === 'sp-item' ? 'Your specialist item is in your bags.' : 'Your new cosmetic is in your collection.'}`
          : result.state === 'processed' ? 'MOSS burn included. Checking reward delivery.' : 'Payment not verified. No charge or cosmetic has been granted.'
          : result.state === 'paid' ? `${product.name} unlocked permanently. Your MOSS burn is processed.`
          : result.state === 'processed' ? `${product.name} unlocked temporarily. Checking the MOSS burn.`
          : order.status === 'processed' ? `${product.name} revoked because the MOSS burn left the chain. We will keep checking the payment.`
          : 'Unpaid quote expired. You can request a fresh price.';
        if (liveSession(active)) { sendStore(active, text); event(active, grant ? 'reward' : 'info', text); }
      }
    })().finally(() => { settlingStore.delete(orderId); });
    settlingStore.set(orderId, work);
    return work;
  }
  async function handleStore(session, connection, message) {
    const p = session.player, owner = { recordKey: session.recordKey, player: p };
    const fail = text => { event(session, 'info', text, false, message.type); sendStore(session, text); };
    if (connection.nativePlatform === 'ios' && message.type === 'storeQuote' && storeProduct(message.productId)?.kind === 'sp-item') { fail('MOSS specialist purchases are unavailable in the iOS app.'); return; }
    const fields = storeFields[message.type], optionalHash = message.type === 'storePaymentCheck' && Object.hasOwn(message, 'transactionHash');
    if (Object.keys(message).length !== fields.length + Number(optionalHash) || !fields.every(field => Object.hasOwn(message, field))
        || optionalHash && (typeof message.transactionHash !== 'string' || !/^0x[\da-f]{64}$/i.test(message.transactionHash))) { fail('Invalid store request.'); return; }
    try {
      if (message.type === 'storeOpen') {
        if (Date.now() - (session.lastStoreOpen || 0) < 1000) return;
        session.lastStoreOpen = Date.now();
        await refreshStoreStatus(); sendStore(session); return;
      }
      if (message.type === 'storeWalletChallenge') {
        if (typeof message.wallet !== 'string' || message.wallet.length !== 42) { fail('Choose a valid wallet address.'); return; }
        if (Date.now() - (session.lastWalletChallenge || 0) < 1000) { fail('Wait a moment before confirming your wallet again.'); return; }
        session.lastWalletChallenge = Date.now();
        send(session.socket, { type: 'storeWalletChallenge', ...chain.challenge(`store:${p.id}`, message.wallet, connection.origin) }); return;
      }
      if (message.type === 'storeWalletBind') {
        if (typeof message.signature !== 'string' || !/^0x[\da-f]{130}$/i.test(message.signature)) { fail('Confirm the wallet ownership message.'); return; }
        const wallet = chain.verifyWallet(`store:${p.id}`, message.signature, connection.origin);
        const busy = p.arenaWagers.length || specialistNftLocked(p) || p.storeOrders.some(order => !['delivered', 'expired'].includes(order.status)) || p.nftOrders.some(order => order.status === 'quoted')
          || auctionWalletLocked(p.id);
        if (busy && p.auctionWallet?.toLowerCase() !== wallet.toLowerCase()) { fail('Finish pending store, NFT and auction purchases before changing wallets.'); return; }
        if (!await commitStore(owner, player => auctionWalletChanges(player, wallet))) { fail('Saving your last action. Please try again.'); return; }
        invalidateNftOwnership(session); await refreshNftOwnership(session);
        sendStore(session, 'Wallet connected.'); return;
      }
      if (Date.now() - (session.lastStoreAction || 0) < 1000) { fail('Wait a moment before checking the store again.'); return; }
      session.lastStoreAction = Date.now();
      if (message.type === 'storeBuyBoost') {
        const changes = goldBoostPurchase(p, message.boostId, economyVersion >= 1);
        if (!changes) { fail('Choose an available boost and bring enough gold.'); return; }
        if (!await commitStore(owner, player => { const changes = goldBoostPurchase(player, message.boostId, economyVersion >= 1); return changes && { ...changes, goldReason: 'service:boost' }; })) { fail('The boost could not be saved. Your gold was kept.'); return; }
        send(session.socket, snapshot(session)); sendStore(session, 'Boost purchased with gold. Activate your charge when ready.'); return;
      }
      if (message.type === 'storeChangeClass' || message.type === 'storeBuyClass') {
        const goldPurchase = message.type === 'storeBuyClass';
        if (goldPurchase && economyVersion < 1) { fail('Gold class changes are not available yet.'); return; }
        if (!CHARACTER_CLASSES.includes(message.className) || message.className === p.appearance.className) { fail('Choose a different class.'); return; }
        const ready = () => liveSession(session) && p.hp > 0 && !session.instanceId && !session.zeppelin && !session.travel.mount
          && session.jump.grounded && !waterAt(p.x, p.z) && !gmObserver(session) && !session.casting && !session.gathering
          && !session.autoAttack && !inCombat(session) && !playerTrades.has(p.id) && !arenaQueue.has(session) && !hasPendingChallenge(session, Date.now());
        const incomingGear = () => auctionOwners().some(owner => owner.player.auctions.some(listing => listing.reservation?.buyerId === p.id
          && listing.item.kind === 'gear' && gearById(listing.item.id).className && gearById(listing.item.id).className !== message.className));
        const prepare = player => {
          if (!ready()) throw Error('Finish combat, trading and travel, leave the arena queue, and stand on dry overworld ground before changing class.');
          if (incomingGear()) throw Error('Finish your pending gear auction purchase before changing class.');
          const order = player.storeOrders.find(item => item.id === message.orderId);
          if (!goldPurchase && (!order || !['processed', 'delivered'].includes(order.status) || order.reward?.kind !== 'class-change' || order.reward.redeemedAt !== undefined))
            throw Error('Choose an unused class-change receipt with a processed MOSS payment.');
          if (goldPurchase && player.gold < GOLD_CLASS_CHANGE_COST) throw Error(`A class change costs ${GOLD_CLASS_CHANGE_COST} gold.`);
          const changes = classChangeChanges(player, message.className);
          if (!changes) throw Error('Make room in your inventory or bank for your current gear, then try again. Your class-change credit is still available.');
          if (goldPurchase) return { ...changes, gold: player.gold - GOLD_CLASS_CHANGE_COST, goldReason: 'service:class' };
          return { ...changes, storeOrders: player.storeOrders.map(item => item.id === order.id
            ? { ...item, reward: { ...item.reward, className: message.className, redeemedAt: Date.now() } } : item) };
        };
        prepare(p);
        if (!await commitStore(owner, prepare)) { fail('The class change could not be saved. Your credit is still available.'); return; }
        session.shield = null;
        send(session.socket, snapshot(session));
        sendStore(session, `Class changed to ${message.className}. Training and talents reset; your previous gear is in your inventory or bank.`); return;
      }
      if (message.type === 'storeActivateBoost') {
        if (p.hp <= 0 || session.zeppelin || session.casting || session.autoAttack || inCombat(session)) { fail('Finish combat actions before activating a boost.'); return; }
        const changes = storeActivationChanges(p, message.boostId);
        if (!changes) { fail('Buy a boost and wait for delivery before activating it.'); return; }
        if (!await commitStore(owner, async player => storeActivationChanges(player, message.boostId))) { fail('The boost could not be saved. Please try again.'); return; }
        sendStore(session, 'Boost activated. One hour added; the timer continues while offline.'); return;
      }
      if (message.type === 'storePaymentCheck') {
        const order = p.storeOrders.find(order => order.id === message.orderId);
        if (!order) { fail('That purchase does not belong to this character.'); return; }
        if (!['delivered', 'expired'].includes(order.status) && optionalHash) {
          // Hashes aid the receipt link; only verified canonical contract storage can grant a reward.
          if (!await commitStore(owner, async () => ({ storeOrders: p.storeOrders.map(item => item.id === order.id
            ? { ...item, transactionHash: message.transactionHash, status: item.status === 'processed' ? 'processed' : 'submitted' } : item) }))) { fail('Saving your last action. Please try again.'); return; }
        }
        await settleStore(owner, order.id);
        const status = p.storeOrders.find(item => item.id === order.id)?.status;
        sendStore(session, status === 'delivered' ? `${storeProduct(order.productId).name} is unlocked.` : status === 'expired'
          ? 'Unpaid quote expired. Request a fresh price.' : status === 'processed' && storeProduct(order.productId).kind === 'class-change' ? 'MOSS burn processed. Your class-change receipt is ready.' : status === 'processed' && storeRepeatable(storeProduct(order.productId)) ? 'MOSS burn included. Checking reward delivery.' : status === 'processed' ? 'Your saved reward is available while payment verification finishes.' : 'Waiting for the MOSS burn to be included. Your reward will unlock automatically.'); return;
      }
      const product = storeProductForSale(message.productId);
      if (!product) { fail('Choose an item from the store.'); return; }
      if (goldStorePrice(product.id, economyVersion >= 1)) { fail('This service is purchased with gold. Existing payments remain redeemable.'); return; }
      if (!p.auctionWallet) { fail('Connect and confirm your wallet first.'); return; }
      if (!storeRepeatable(product) && p.storePurchases.includes(product.id)) { fail('This character already owns that reward.'); return; }
      const previous = p.storeOrders.find(order => order.productId === product.id && !['delivered', 'expired'].includes(order.status)
        && !(order.reward?.kind === 'class-change' && order.reward.redeemedAt !== undefined));
      if (previous && previous.status !== 'expired') {
        await settleStore(owner, previous.id);
        const current = p.storeOrders.find(order => order.id === previous.id);
        if (!storeRepeatable(product) && ['processed', 'delivered'].includes(current.status)) { sendStore(session, 'This character already owns that reward.'); return; }
        if (!['delivered', 'expired'].includes(current.status)) { sendStore(session); send(session.socket, { type: 'storeQuote', order: current }); return; }
      }
      if (mobilePurchaseConflict(p, product) && p.mobileStoreOrders.some(order => order.status === 'payment-confirmed' || order.status === 'pending' && order.expiresAt > Date.now())) { fail('Finish your pending mobile cosmetic purchase before buying another cosmetic or box.'); return; }
      if (product.kind === 'gacha' && !storeCosmeticPool(p).length) { fail('You already own every cosmetic in this box.'); return; }
      const cosmetic = item => ['mount', 'pet', 'gacha'].includes(item.kind);
      if (cosmetic(product) && p.storeOrders.some(order => !['delivered', 'expired'].includes(order.status) && cosmetic(storeProduct(order.productId)) && (product.kind === 'gacha' || storeProduct(order.productId).kind === 'gacha'))) { fail('Finish your pending cosmetic purchase before buying another cosmetic or box.'); return; }
      if (p.storeOrders.filter(order => !(order.productId === product.id && order.status === 'expired' && !order.reward)).length >= STORE_MAX_ORDERS) { fail('The purchase history is full. Contact support before buying more.'); return; }
      let order;
      const committed = await commitStore(owner, async player => {
        if (product.kind === 'sp-item' && !bagCanFit(player,{carriedItems:{...player.carriedItems,[product.itemId]:(player.carriedItems[product.itemId]||0)+1}})) throw Error('Make room in your bags before buying this specialist item.');
        order = await burnChain.prepareOrder({ id: randomUUID(), characterId: p.id, wallet: p.auctionWallet, productId: product.id, usdPrice: product.usdPrice });
        if (!liveSession(session) || closing) return;
        return { storeOrders: [...p.storeOrders.filter(item => item.productId !== product.id || item.status !== 'expired' || item.reward), { ...order, status: 'quoted' }] };
      });
      if (!committed) { fail('The quote could not be saved. Please try again.'); return; }
      sendStore(session); send(session.socket, { type: 'storeQuote', order: p.storeOrders.find(item => item.id === order.id) });
    } catch (error) {
      if (!closing) fail(error instanceof Error ? error.message : 'The store could not complete this request. Please try again.');
    }
  }

  const publicTreasureMap = player => {
    const expedition = player.treasureMap;
    return expedition ? { id: expedition.id, siteId: expedition.siteId, stage: expedition.stage, level: expedition.level } : null;
  };
  const mapSite = expedition => expedition && TREASURE_MAP_SITES.find(site => site.id === expedition.siteId);
  function mapGuardianAllowed(enemy, session) {
    if (!enemy.mapExpeditionId) return true;
    const owner = sessions.get(enemy.mapOwnerId);
    return liveSession(owner) && !combatSaveBlocked(owner.recordKey) && !releasingAccounts.has(owner.recordKey)
      && !owner.instanceId && owner.player.hp > 0 && !owner.zeppelin
      && owner.player.treasureMap?.id === enemy.mapExpeditionId && owner.player.treasureMap.stage === 'guardian'
      && distance(owner.player, enemy) <= CHASE_DISTANCE
      && (session === owner || partyOf(owner.player.id)?.members.includes(session.player.id));
  }
  const treasureMapReady = session => liveSession(session) && session.player.hp > 0 && !session.instanceId && !session.zeppelin && !gmObserver(session)
    && session.jump.grounded && !waterAt(session.player.x, session.player.z) && !session.travel.mount && !session.casting && !session.gathering && !session.autoAttack && !inCombat(session);
  function treasureMapChanges(player, expedition) {
    const reward = treasureMapReward(expedition.level);
    reward.gold = goldSource(reward.gold, 'treasure', economyVersion >= 1);
    const changes = { treasureMap: null, gold: player.gold + reward.gold, goldReason: 'reward:treasure',
      inventory: { ...player.inventory, potion: player.inventory.potion + reward.potions },
      carriedItems: { ...player.carriedItems, 'ancient-coin': (player.carriedItems['ancient-coin'] || 0) + reward.coins } };
    if (expedition.voucher) changes.carriedItems['moss-voucher'] = (changes.carriedItems['moss-voucher'] || 0) + 1;
    if (!Number.isSafeInteger(changes.gold) || !Number.isSafeInteger(changes.inventory.potion)
        || !carriedItemsValid(changes) || !bagCanFit(player, changes)) throw Object.assign(Error('Make room in your bags before opening this chest. Your treasure is safe.'), { code: 'TREASURE_MAP_INPUT' });
    return changes;
  }
  async function handleTreasureMap(session, message, automatic = false) {
    const p = session.player, fields = treasureMapFields[message.type];
    const fail = text => { if (!automatic) event(session, 'info', text, false, message.type); };
    if (automatic && message.type !== 'treasureMapOpen') return;
    if (Object.keys(message).length !== fields.length || !fields.every(key => Object.hasOwn(message, key))
        || message.type !== 'treasureMapStart' && !socialIdValid(message.expeditionId)) { fail('Choose your current treasure expedition.'); return; }
    const ready = () => treasureMapReady(session);
    advanceJump(session, Date.now());
    if (!ready()) { fail('Finish combat, dismount, and stand on dry overworld ground before using the map or chest.'); return; }
    const current = p.treasureMap, site = mapSite(current);
    if (message.type === 'treasureMapStart') {
      if (current) { fail('Finish your current treasure expedition before using another map.'); return; }
      if (!(p.carriedItems['treasure-map'] > 0)) { fail('Carry an unused treasure map in your bags.'); return; }
    } else {
      if (!current || current.id !== message.expeditionId || !site) { fail('That treasure expedition is no longer active.'); return; }
      if (message.type === 'treasureMapSearch' && current.stage !== 'search' || message.type === 'treasureMapOpen' && current.stage !== 'chest') {
        fail(current.stage === 'guardian' ? 'Defeat the treasure guardian before opening the chest.' : 'Follow the clue and uncover your treasure first.'); return;
      }
      const range = automatic ? PET_LOOT_RADIUS : message.type === 'treasureMapSearch' ? TREASURE_MAP.searchRange : TREASURE_MAP.openRange;
      if (automatic && (!session.petLoot || distance(session.petLoot, site) > .5)) return;
      if (p.zone !== site.zone || distance(p, site) > range || !canTraverse(p, site, WORLD_COLLIDERS, WORLD_BOUNDS)) {
        fail(message.type === 'treasureMapSearch' ? 'Search the marked area and follow the clue to find the buried treasure.' : 'Move beside your treasure chest on a clear path.'); return;
      }
    }
    let description;
    try {
      const committed = await commitStore(session, async player => {
        if (!ready() || player.treasureMap !== current) return;
        if (message.type === 'treasureMapStart') {
          if (!(player.carriedItems['treasure-map'] > 0)) return;
          const choices = TREASURE_MAP_SITES.filter(site => site.zone === player.zone);
          if (!choices.length) throw Object.assign(Error('No treasure routes are available right now. Your map was kept.'), { code: 'TREASURE_MAP_INPUT' });
          const chosen = choices[treasureMapRandomInt(choices.length)];
          const carriedItems = { ...player.carriedItems };
          if (!--carriedItems['treasure-map']) delete carriedItems['treasure-map'];
          description = 'Treasure map opened. Follow its search area and clue in your quest journal.';
          return { carriedItems, treasureMap: { id: randomUUID(), siteId: chosen.id, stage: 'search', level: player.level,
            voucher: treasureMapRandomInt(100) < TREASURE_MAP.voucherChancePercent } };
        }
        if (message.type === 'treasureMapSearch') {
          description = 'Buried treasure uncovered. Defeat its guardian to unlock the chest.';
          return { treasureMap: { ...current, stage: 'guardian' } };
        }
        const reward = treasureMapReward(current.level);
        reward.gold = goldSource(reward.gold, 'treasure', economyVersion >= 1);
        const changes = treasureMapChanges(player, current);
        description = `Treasure recovered · +${reward.gold} gold · +${reward.potions} healing potions · +${reward.coins} ancient coin${current.voucher ? ' · +1 MOSS voucher' : ''}`;
        return changes;
      });
      if (!committed) { fail('Saving your last action. Please try again.'); return; }
      lootTrace.write(p.id, 'treasure_map_saved', { action: message.type, automatic, maps: p.carriedItems['treasure-map'] || 0, stage: p.treasureMap?.stage || null });
      updateMapGuardians(Date.now());
      event(session, 'reward', `${automatic ? 'Pet collected · ' : ''}${description}`, automatic, message.type);
      send(session.socket, snapshot(session));
    } catch (error) { fail(error.code === 'TREASURE_MAP_INPUT' ? error.message : 'Your expedition could not be saved. Please try again.'); }
  }
  function finishMapGuardian(enemy) {
    const owner = sessions.get(enemy.mapOwnerId), expedition = owner?.player.treasureMap;
    if (enemy.mapSaving || !liveSession(owner) || expedition?.id !== enemy.mapExpeditionId || expedition.stage !== 'guardian') return;
    enemy.mapSaving = true;
    void commitStore(owner, async player => player.treasureMap === expedition ? { treasureMap: { ...expedition, stage: 'chest' } } : undefined)
      .then(committed => { if (committed) event(owner, 'reward', 'Treasure guardian defeated. Open your chest.'); })
      .catch(() => { if (!enemy.mapSaveFailed) event(owner, 'info', 'Your treasure is waiting for progress storage. It will unlock when the save succeeds.'); enemy.mapSaveFailed = true; })
      .finally(() => { enemy.mapSaving = false; });
  }
  function updateMapGuardians(now) {
    for (let index = enemies.length - 1; index >= 0; index--) {
      const enemy = enemies[index];
      if (!enemy.mapExpeditionId) continue;
      const owner = sessions.get(enemy.mapOwnerId), expedition = (owner?.player || records[enemy.mapRecordKey]?.characters.find(player => player.id === enemy.mapOwnerId))?.treasureMap;
      // A failed save keeps the defeated guardian until its owner reconnects and the chest transition can commit.
      if (!enemy.alive && expedition?.id === enemy.mapExpeditionId && expedition.stage === 'guardian') { finishMapGuardian(enemy); continue; }
      if (enemy.mapSaving) continue;
      if (!liveSession(owner) || owner.instanceId || expedition?.id !== enemy.mapExpeditionId || expedition.stage !== 'guardian'
          || distance(owner.player, mapSite(expedition)) > WORLD_INTEREST_RADIUS) {
        enemy.alive = false; enemy.attack = null;
        pendingHits = pendingHits.filter(hit => hit.enemy !== enemy);
        enemies.splice(index, 1);
      }
    }
    for (const owner of activeSessions()) {
      const expedition = owner.player.treasureMap, site = mapSite(expedition);
      if (!liveSession(owner) || expedition?.stage !== 'guardian' || !site || owner.instanceId || owner.player.hp <= 0 || owner.zeppelin
          || distance(owner.player, site) > WORLD_INTEREST_RADIUS || enemies.some(enemy => enemy.mapExpeditionId === expedition.id)) continue;
      const kind = 'briar-sentinel', stats = monsterStatsAtLevel(kind, expedition.level), hp = Math.round(stats.hp * 1.5);
      enemies.push({ id: `map-${expedition.id}`, kind, name: 'Buried treasure guardian', level: expedition.level, zone: site.zone,
        instanceId: null, x: site.x, z: site.z, homeX: site.x, homeZ: site.z, hp, maxHp: hp, alive: true, diedAt: 0,
        respawnAt: Infinity, lastAttack: now, rotation: 0, attack: null, participants: new Set(), threat: new Map(), target: null,
        mapExpeditionId: expedition.id, mapOwnerId: owner.player.id, mapRecordKey: owner.recordKey });
    }
  }
  let goldRoundSettlement, goldRoundCheckedAt = 0, goldRoundQuote, goldRoundQuoteCheckedAt = 0;
  async function refreshGoldRoundQuote(round, force = false) {
    if (force || goldRoundQuote?.roundId !== round.id || Date.now() - goldRoundQuoteCheckedAt >= 15000) {
      goldRoundQuote = { ...await treasureChain.quoteGoldBudget({ payoutUsdMicros: (BigInt(round.budgetUsdCents) * 10000n).toString() }), roundId: round.id };
      goldRoundQuoteCheckedAt = Date.now();
    }
    return goldRoundQuote;
  }
  async function settleMerchantRounds() {
    if (!database || closing) return;
    if (treasureChain.configured === false) { goldRoundCheckedAt = Date.now(); return; }
    if (goldRoundSettlement) return goldRoundSettlement;
    if (Date.now() - goldRoundCheckedAt < 5000) return;
    goldRoundSettlement = (async () => {
      const due = (await database.goldRounds()).find(round => round.status === 'open' && round.endsAt <= Date.now());
      if (due) await database.settleGoldRounds(due.closingPrice
        ? { ...await treasureChain.status(false), roundId: due.id }
        : await refreshGoldRoundQuote(due, true));
    })().finally(() => { goldRoundSettlement = null; goldRoundCheckedAt = Date.now(); });
    return goldRoundSettlement;
  }
  const goldMerchantNearby = session => liveSession(session) && !closing && session.player.hp > 0 && !session.zeppelin && villageNpcNearby(session, GOLD_MERCHANT);
  async function merchantHoldings(session) {
    const wallet = session.player.auctionWallet, requestedAt = Date.now(); let timeout;
    if (!wallet) throw Error('Link your wallet before placing an offer.');
    try {
      const holdings = await Promise.race([goldMerchantHoldings(wallet), new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Holdings check timed out.')), 15000); })])
        .catch(() => { throw Error('MOSS holdings are temporarily unavailable. Try again.'); });
      if (!goldMerchantNearby(session) || session.player.auctionWallet !== wallet) throw Error('Your wallet or location changed. Check again.');
      if (!holdings || typeof holdings.balanceWei !== 'string' || !/^(?:0|[1-9]\d{0,77})$/.test(holdings.balanceWei) || BigInt(holdings.balanceWei) >= 2n ** 256n
        || holdings.valueUsdCents !== undefined && (typeof holdings.valueUsdCents !== 'string' || !/^(?:0|[1-9]\d{0,155})$/.test(holdings.valueUsdCents))
        || !Number.isSafeInteger(holdings.checkedAt) || holdings.checkedAt > Date.now() || Date.now() - Math.min(requestedAt, holdings.checkedAt) >= 15000) throw Error('Unverified MOSS holdings.');
      session.goldMerchantVerified = { wallet, balanceWei: holdings.balanceWei, valueUsdCents: holdings.valueUsdCents, checkedAt: Math.min(requestedAt, holdings.checkedAt) };
      return session.goldMerchantVerified;
    } finally { clearTimeout(timeout); }
  }
  async function sendGoldMerchant(session, reason) {
    if (!goldMerchantNearby(session)) return;
    const player = session.player, rounds = database ? await database.goldRounds(session.recordKey) : [];
    if (!goldMerchantNearby(session)) return;
    const current = rounds.find(round => round.status === 'open') || rounds[0];
    let quote;
    if (current?.status === 'open' && !current.closingPrice) try { quote = await refreshGoldRoundQuote(current); } catch { /* USD bids remain available when a live token estimate is unavailable. */ }
    if (!goldMerchantNearby(session)) return;
    const offerFor = round => {
      const bid = round.bids[session.recordKey];
      return bid && bid.characterId === player.id ? { roundId: round.id, gold: bid.gold, priceCentsPer1000: bid.priceCentsPer1000,
        wallet: bid.wallet, status: round.status, filledGold: bid.filledGold, payoutUsdMicros: bid.payoutUsdMicros, payoutWei: bid.payoutWei, claimId: bid.claimId } : undefined;
    };
    const holdings = session.goldMerchantVerified?.wallet === player.auctionWallet ? session.goldMerchantVerified : {};
    const bids = current ? Object.values(current.bids) : [];
    send(session.socket, { type: 'goldMerchantState', state: { characterId: player.id, level: player.level, wallet: player.auctionWallet || null, ...holdings,
      ...(current ? { round: { id: current.id, startsAt: current.startsAt, endsAt: current.endsAt, status: current.status, budgetWei: current.budgetWei,
        estimatedMossWei: quote?.amountWei,
        closingMossWei: current.status === 'open' && current.closingPrice ? goldUsdAmountWei((BigInt(current.budgetUsdCents) * 10000n).toString(), current.closingPrice.usdWei) : undefined,
        priceCheckedAt: current.settlementPrice?.observedAt ?? current.closingPrice?.observedAt ?? quote?.price.observedAt,
        budgetUsdCents: current.budgetUsdCents, maxPriceCentsPer1000: current.maxPriceCentsPer1000, offerCount: bids.length,
        totalGold: bids.reduce((sum, bid) => sum + (current.status === 'settled' ? bid.filledGold : bid.gold), 0),
        spentUsdMicros: bids.reduce((sum, bid) => sum + BigInt(bid.payoutUsdMicros || '0'), 0n).toString() }, offer: offerFor(current) } : {}),
      awards: rounds.filter(round => round.status === 'settled').map(offerFor).filter(offer => offer && !offer.claimId),
      claims: player.treasureClaims.filter(claim => claim.goldRoundId),
      treasuryAuthorizationCount: player.treasureClaims.reduce((count, claim) => count + treasureQuotes(claim).length, 0),
      treasury: { contract: treasureStatus.contract || '', balanceWei: treasureStatus.balanceWei, legacyContract: treasureStatus.legacyContract, legacyBalanceWei: treasureStatus.legacyBalanceWei },
      ...(reason || !database ? { reason: reason || 'Gold rounds require shared storage and a funded treasury.' } : {}) } });
  }
  async function handleGoldMerchant(session, message) {
    const fields = { goldMerchantCheck: ['type'], goldMerchantOffer: ['type', 'roundId', 'gold', 'priceCentsPer1000'],
      goldMerchantCancel: ['type', 'roundId'], goldMerchantClaim: ['type', 'roundId'],
      goldMerchantPayoutCheck: ['type', 'claimId'], goldMerchantSubmitted: ['type', 'claimId', 'transactionHash'] }[message.type];
    const fail = text => { session.goldMerchantVerified = undefined; event(session, 'info', text, false, message.type); return sendGoldMerchant(session, text).catch(() => {}); };
    if (!fields || Object.keys(message).length !== fields.length || !fields.every(field => Object.hasOwn(message, field))) { await fail('Invalid gold merchant request.'); return; }
    if (!goldMerchantNearby(session)) { await fail('Speak to the gold merchant nearby.'); return; }
    if (message.type === 'goldMerchantPayoutCheck' || message.type === 'goldMerchantSubmitted') {
      if (!session.player.treasureClaims.some(claim => claim.id === message.claimId && claim.goldRoundId)) { await fail('This gold payout does not belong to this character.'); return; }
      await handleTreasure(session, { ...message, type: message.type === 'goldMerchantSubmitted' ? 'treasureSubmitted' : 'treasureCheck' }, true); return;
    }
    if (session.goldMerchantChecking) return;
    if (Date.now() - (session.lastGoldMerchantCheck || 0) < 1000) { await fail('Wait a moment before asking the merchant again.'); return; }
    session.lastGoldMerchantCheck = Date.now(); session.goldMerchantChecking = true;
    const player = session.player, owner = { recordKey: session.recordKey, player };
    try {
      await settleMerchantRounds().catch(() => {}); // A deferred round must not block earlier awards or status checks.
      if (message.type === 'goldMerchantCheck') {
        let reason;
        if (player.auctionWallet) try { const holdings = await merchantHoldings(session); if (holdings.valueUsdCents === undefined) reason = 'MOSS balance verified. USD pricing is temporarily unavailable. Try again.'; } catch { session.goldMerchantVerified = undefined; reason = 'MOSS holdings are temporarily unavailable. Try again.'; }
        await refreshTreasureStatus();
        if (database && goldMerchantNearby(session)) await commitStore(owner, () => ({}));
        await sendGoldMerchant(session, reason); return;
      }
      if (!database) throw Error('Gold rounds require shared storage and a funded treasury.');
      if (typeof message.roundId !== 'string' || !message.roundId || message.roundId.length > 128) throw Error('Choose a valid gold round.');
      const round = (await database.goldRounds(session.recordKey)).find(round => round.id === message.roundId);
      if (!round) throw Error('This gold round is unavailable.');
      const bid = round.bids[session.recordKey];
      if (bid && bid.characterId !== player.id) throw Error('Use the character that placed this account’s offer.');
      const action = { kind: message.type === 'goldMerchantOffer' ? 'offer' : message.type === 'goldMerchantCancel' ? 'cancel' : 'claim',
        roundId: round.id, accountKey: session.recordKey, characterId: player.id };
      if (action.kind === 'claim') {
        if (round.status !== 'settled' || !bid || !(BigInt(bid.payoutWei || '0') > 0n)) throw Error('This round has no MOSS award for this character.');
        if (bid.claimed) { await refreshTreasureStatus(); await sendGoldMerchant(session); return; }
        if (player.treasureClaims.reduce((count, claim) => count + treasureQuotes(claim).length, 0) >= TREASURE_MAX_CLAIMS) throw Error('Your treasury history is full. Contact support.');
        const reservation = {};
        const committed = await commitStore(owner, async current => {
          const { claim, capacityWei } = await treasureChain.prepareGoldClaim({ id: randomUUID(), realmId: bid.realmId, characterId: current.id,
            wallet: bid.wallet, amountWei: bid.payoutWei, goldRoundId: round.id, contract: round.contract });
          if (!goldMerchantNearby(session)) return;
          if (claim.goldRoundId !== round.id || claim.amountWei !== bid.payoutWei || claim.wallet.toLowerCase() !== bid.wallet.toLowerCase()
            || !treasurePlayerValid({ ...current, treasureClaims: [...current.treasureClaims, claim] })) throw Error('The treasury returned different payout terms.');
          Object.assign(reservation, { claimHash: claim.claimHash, contract: claim.contract, amountWei: claim.amountWei, capacityWei });
          return { treasureClaims: [...current.treasureClaims, claim] };
        }, false, undefined, reservation, action);
        if (!committed) throw Error('Your award is saved. Try collecting again.');
        await refreshTreasureStatus(); await sendGoldMerchant(session); return;
      }
      if (action.kind === 'offer') {
        if (player.level < GOLD_MERCHANT_REQUIREMENTS.level) throw Error(`Reach level ${GOLD_MERCHANT_REQUIREMENTS.level} to place an offer.`);
        if (!Number.isSafeInteger(message.gold) || message.gold < 1 || !Number.isSafeInteger(message.priceCentsPer1000)
          || message.priceCentsPer1000 < 1 || message.priceCentsPer1000 > round.maxPriceCentsPer1000) throw Error('Enter whole gold and a price within this round’s limit.');
        const holdings = await merchantHoldings(session);
        if (holdings.valueUsdCents === undefined) throw Error('MOSS balance verified. USD pricing is temporarily unavailable. Try again.');
        if (BigInt(holdings.valueUsdCents) < BigInt(GOLD_MERCHANT_REQUIREMENTS.usdCents)) throw Error('Hold at least $25 worth of MOSS to place an offer.');
        Object.assign(action, { gold: message.gold, priceCentsPer1000: message.priceCentsPer1000, wallet: player.auctionWallet, realmId });
      }
      if (!goldMerchantNearby(session) || inCombat(session) || session.casting || session.gathering || !session.jump.grounded) throw Error('Finish your activity before changing an offer.');
      const committed = await commitStore(owner, current => {
        if (!goldMerchantNearby(session)) return;
        const gold = current.gold + (bid?.gold || 0) - (action.kind === 'offer' ? action.gold : 0);
        if (!Number.isSafeInteger(gold) || gold < 0) throw Error('You do not have enough available gold.');
        return { gold, goldReason: 'escrow:merchant' };
      }, false, undefined, undefined, action);
      if (!committed) throw Error('Your offer was not changed. Try again.');
      await sendGoldMerchant(session);
    } catch (error) { if (!closing) await fail(error?.code === 'PLAYER_STORE_CONFLICT' ? error.message : error instanceof Error && !error.code ? error.message : 'The gold merchant is temporarily unavailable. Try again.'); }
    finally { session.goldMerchantChecking = false; }
  }
  async function refreshTreasureStatus() {
    if (treasureChecking) return treasureChecking;
    if (treasureCheckedAt && Date.now() - treasureCheckedAt < 10000) return;
    treasureChecking = treasureChain.status().then(status => {
      treasureStatus = status;
      if (!database && !treasuryChain) treasureStatus = {...treasureStatus,enabled:false,reason:'The treasury requires shared progress storage and funding before redemption opens.'};
    }).catch(() => {
      treasureStatus = { configured:false, enabled:false, reason:'The treasury is temporarily unavailable. Your voucher was kept.' };
    }).finally(() => { treasureChecking = null; treasureCheckedAt = Date.now(); });
    return treasureChecking;
  }
  function sendTreasure(session, message) {
    if (!liveSession(session)) return;
    send(session.socket, { type:'treasureState', state:{ ...treasureStatus, wallet:session.player.auctionWallet || null,
      nextRedemptionAt:Math.max(session.treasureNextRedemptionAt || 0, treasureNextRedemptionAt(records[session.recordKey])),
      vouchers:session.player.carriedItems['moss-voucher'] || 0, claims:session.player.treasureClaims }, ...(message ? {message} : {}) });
  }
  async function handleTreasure(session, message, merchant = false) {
    const p = session.player, fields = treasureFields[message.type];
    const reply = text => merchant ? void sendGoldMerchant(session, text).catch(() => {}) : sendTreasure(session, text);
    const fail = text => { event(session, 'info', text, false, message.type); reply(text); };
    if (Object.keys(message).length !== fields.length || !fields.every(field => Object.hasOwn(message, field))) { fail('Invalid treasury request.'); return; }
    if (!liveSession(session) || p.hp <= 0 || session.zeppelin || !villageNpcNearby(session, merchant ? GOLD_MERCHANT : SHADY_MERCHANT)) { fail(merchant ? 'Visit the gold merchant.' : 'Visit Veyl, the shady merchant in Willowbrook.'); return; }
    if (Date.now() - (session.lastTreasureAction || 0) < 1000) { fail(merchant ? 'Wait a moment before checking your payout again.' : 'Wait a moment before asking Veyl again.'); return; }
    session.lastTreasureAction = Date.now();
    const owner = {recordKey:session.recordKey, player:p};
    try {
      await refreshTreasureStatus();
      if (database && ['treasureOpen', 'treasureRedeem'].includes(message.type)) session.treasureNextRedemptionAt = await database.treasureNextRedemptionAt(session.recordKey);
      if (message.type === 'treasureOpen') { reply(); return; }
      if (message.type === 'treasureRefresh') {
        const previous = p.treasureClaims.find(claim => claim.id === message.claimId);
        if (!previous) { fail('This claim does not belong to this character.'); return; }
        if (previous.status !== 'pending' || previous.transactionHash || previous.paymentBlock) { fail('Check your submitted payout before refreshing its MOSS amount.'); return; }
        if (previous.goldRoundId) { fail('Gold round payouts stay fixed at their closing price.'); return; }
        if (!previous.usdCents) { fail('This older payout keeps its original MOSS amount. You can still collect it.'); return; }
        if (p.treasureClaims.reduce((count, claim) => count + treasureQuotes(claim).length, 0) >= TREASURE_MAX_CLAIMS) { fail('Your quote history is full. Collect your saved payout.'); return; }
        const reservation = {}; let sameQuote = false;
        const committed = await commitStore(owner, async player => {
          if (player.treasureClaims.find(claim => claim.id === previous.id) !== previous) return;
          const {claim, capacityWei} = await treasureChain.refreshClaim(previous);
          if (!liveSession(session) || closing || player.hp <= 0 || session.zeppelin || !villageNpcNearby(session, SHADY_MERCHANT)) return;
          if (claim.claimHash === previous.claimHash) { sameQuote = true; return; }
          const treasureClaims = player.treasureClaims.map(saved => saved.id === previous.id ? claim : saved);
          if (!treasurePlayerValid({...player,treasureClaims})) throw Error('Invalid refreshed treasury authorization.');
          Object.assign(reservation, {claimHash:claim.claimHash,previousClaimHash:previous.claimHash,contract:claim.contract,amountWei:claim.amountWei,capacityWei});
          return {treasureClaims};
        }, false, undefined, reservation);
        if (!committed && !sameQuote) throw Error('Your refreshed payout could not be saved. The previous payout is still available.');
        reply(sameQuote ? 'Your MOSS amount is already current. Your assigned USD reward is unchanged.' : 'MOSS amount refreshed. Your assigned USD reward is unchanged; review the amount before collecting.');
        return;
      }
      if (message.type === 'treasureCheck' || message.type === 'treasureSubmitted') {
        const claim = p.treasureClaims.find(claim => claim.id === message.claimId);
        if (!claim) { fail('This claim does not belong to this character.'); return; }
        if (message.type === 'treasureSubmitted' && (typeof message.transactionHash !== 'string' || !/^0x[\da-f]{64}$/i.test(message.transactionHash))) { fail('Invalid payout transaction.'); return; }
        const result = message.type === 'treasureSubmitted' ? await treasureChain.verifyClaim(claim, message.transactionHash) : await treasureChain.checkClaim(claim);
        const settledQuote = treasureQuotes(claim).find(quote => quote.claimHash === (result.settledClaimHash || claim.claimHash));
        if (!['pending','processed','paid'].includes(result.state) || result.claimHash !== claim.claimHash || !settledQuote
          || result.state === 'pending' && claim.paymentBlock && result.revoked !== true) throw Error('The payout could not be verified. Check again.');
        const committed = await commitStore(owner, async player => {
          if (player.treasureClaims.find(current => current.id === claim.id) !== claim) throw Error('Your payout changed during verification. Check it again.');
          const treasureClaims = player.treasureClaims.map(current => current.id === claim.id
            ? {...current, status:result.state, paymentBlock:result.state === 'pending' ? undefined : {hash:result.blockHash,number:result.blockNumber},
              paidAt:result.state === 'paid' ? current.paidAt || Date.now() : undefined,
              ...(result.settledClaimHash || current.settledClaimHash ? {settledClaimHash:result.state === 'pending' ? undefined : settledQuote.claimHash} : {}),
              ...(result.state === 'pending' && result.revoked === true ? {transactionHash:undefined}
                : message.transactionHash ? {transactionHash:message.transactionHash} : {})} : current);
          if (!treasurePlayerValid({id:player.id,treasureClaims})) throw Error('The payout proof could not be saved. Check again.');
          return {treasureClaims};
        });
        if (!committed) throw Error('Your payout check could not be saved. Try again.');
        reply(merchant && result.state === 'processed' ? 'Your MOSS payment is being verified.' : result.state !== 'pending' ? `${settledQuote.amount} MOSS paid to your wallet.` : result.revoked ? 'Your payout is available again. Retry the same claim.' : claim.transactionHash || message.transactionHash ? 'Payout submitted. Checking for payment.' : 'Payout is still available. You can retry the same claim.');
        return;
      }
      if (!treasureStatus.enabled) { fail(treasureStatus.reason || 'The treasury is awaiting funding. Your voucher was kept.'); return; }
      if (!p.auctionWallet) { fail('Link and confirm your wallet before redeeming a voucher.'); return; }
      if (inCombat(session) || session.casting || session.gathering || !session.jump.grounded) { fail('Finish your activity before redeeming a voucher.'); return; }
      const pending = p.treasureClaims.find(claim => claim.status === 'pending');
      if (pending) { reply(`Your ${pending.amount} MOSS claim is saved. Finish that payout first.`); return; }
      if (!(p.carriedItems['moss-voucher'] > 0)) { fail('Bring a MOSS voucher from your bags.'); return; }
      if (p.treasureClaims.reduce((count, claim) => count + treasureQuotes(claim).length, 0) >= TREASURE_MAX_CLAIMS) { fail('Your treasury history is full. Contact support.'); return; }
      const reservation = {};
      const committed = await commitStore(owner, async player => {
        if (player.treasureClaims.some(claim => claim.status === 'pending') || !(player.carriedItems['moss-voucher'] > 0)) return;
        if (Math.max(session.treasureNextRedemptionAt || 0, treasureNextRedemptionAt(records[owner.recordKey])) > Date.now()) throw Error('You can redeem only one MOSS voucher per account per day. Resets at 00:00 UTC.');
        const wallet = player.auctionWallet, requestedAt = Date.now();
        let holdings;
        try { holdings = await treasuryHoldings(wallet); }
        catch { throw Error('MOSS holdings could not be verified. Please try again. Your voucher was kept.'); }
        if (!holdings || typeof holdings.valueUsdCents !== 'string' || !/^(?:0|[1-9]\d{0,155})$/.test(holdings.valueUsdCents)
          || !Number.isSafeInteger(holdings.checkedAt) || holdings.checkedAt > Date.now() || Date.now() - Math.min(requestedAt, holdings.checkedAt) >= 15000)
          throw Error('MOSS holdings could not be verified. Please try again. Your voucher was kept.');
        if (BigInt(holdings.valueUsdCents) < 3000n) throw Error('Hold at least $30 USD worth of MOSS in your linked wallet to redeem a voucher. Your voucher was kept.');
        const {claim, capacityWei} = await treasureChain.prepareClaim({id:randomUUID(),realmId,characterId:player.id,wallet:player.auctionWallet,usdCents:rollTreasureUsd()});
        if (!liveSession(session) || closing || player.hp <= 0 || session.zeppelin || !session.jump.grounded || inCombat(session)
          || session.casting || session.gathering || player.auctionWallet !== wallet || !villageNpcNearby(session, SHADY_MERCHANT)) return;
        if (claim.wallet.toLowerCase() !== wallet.toLowerCase() || claim.characterId !== player.id || claim.realmId !== realmId) throw Error('The treasury returned different payout terms.');
        if (!treasurePlayerValid({...player,treasureClaims:[...player.treasureClaims,claim]})) throw Error('Invalid treasury authorization.');
        Object.assign(reservation, {claimHash:claim.claimHash,contract:claim.contract,amountWei:claim.amountWei,capacityWei});
        const carriedItems = {...player.carriedItems};
        if (!(carriedItems['moss-voucher'] > 0)) return;
        if (!--carriedItems['moss-voucher']) delete carriedItems['moss-voucher'];
        return {carriedItems,treasureClaims:[...player.treasureClaims,claim]};
      }, false, undefined, reservation);
      if (!committed) { fail('Your voucher was kept. Try redeeming again.'); return; }
      if (database) session.treasureNextRedemptionAt = await database.treasureNextRedemptionAt(session.recordKey);
      reply('Veyl breaks the seal. Your MOSS payout is saved; collect it below.');
    } catch (error) { if (!closing) fail(error instanceof Error ? error.message : 'The treasury is unavailable. Try again.'); }
  }

  async function refreshNftStatus() {
    if (nftChecking) return nftChecking;
    if (nftCheckedAt && Date.now() - nftCheckedAt < 20000) return;
    nftChecking = collectiblesChain.status().then(status => { nftStatus = status; })
      .catch(() => { nftStatus = { ...nftStatus, configured: collectiblesChain.configured || nftStatus.configured, enabled: false, mountsEnabled: false, reason: 'NFT ownership service is temporarily unavailable.' }; })
      .finally(() => { nftChecking = null; nftCheckedAt = Date.now(); });
    return nftChecking;
  }
  function nftOwnershipValid(session) {
    const ownership = session.nftOwnership;
    return !!ownership && ownership.wallet === session.player.auctionWallet && ownership.verifiedAt <= Date.now()
      && Date.now() - ownership.verifiedAt < NFT_OWNERSHIP_MAX_AGE_MS;
  }
  function nftOwnedMounts(session) {
    return nftOwnershipValid(session) && session.nftOwnership.mountsVerified === true ? session.nftOwnership.mounts || [] : [];
  }
  function hasMount(session, mount) {
    return session.player.ownedMounts.includes(mount) || nftOwnedMounts(session).includes(mount);
  }
  function revokeNftMount(session) {
    const driver = sessions.get(session.travel.driverId);
    const passenger = driver?.travel.passengerId === session.player.id && driver.travel.mount === 'wayfarer-stag'
      && session.travel.mount === driver.travel.mount && hasMount(driver, driver.travel.mount);
    if (session.casting?.ability === 'mount' && !hasMount(session, session.casting.mount)) cancelCast(session);
    if (session.travel.mount && !passenger && !hasMount(session, session.travel.mount)) dismount(session);
  }
  function publicNftOwnership(session) {
    revokeNftMount(session);
    const verified = nftOwnershipValid(session), owned = verified ? session.nftOwnership : null;
    const pets = owned?.pets.filter(pet => owned.newPetsVerified !== false || !nftLearnedPetConvertible(pet)) || [];
    // Unverified access stays hidden; keep the selection until ownership can be checked again.
    if (verified && (!nftLearnedPetConvertible(session.nftSummonedPet) || owned.newPetsVerified !== false) && !pets.includes(session.nftSummonedPet)) session.nftSummonedPet = null;
    return { nftConfigured: !!(collectiblesChain.configured || nftStatus.configured), nftMintablePets: nftMintablePets(), nftPets: pets, nftMounts: nftOwnedMounts(session), nftMintableMounts: nftStatus.mintableMountIds || [], nftMountsConfigured: !!nftStatus.mountsContract, nftHouses: owned?.houses || [], summonedPet: pets.includes(session.nftSummonedPet) ? session.nftSummonedPet : session.player.summonedPet };
  }
  const nftMintablePets = () => nftStatus.mintablePetIds || (nftStatus.newPetsEnabled ? NFT_PETS.filter(pet => pet.assetId <= 16) : NFT_LEGACY_PETS).map(pet => pet.id);
  function invalidateNftOwnership(session) {
    session.nftEpoch = (session.nftEpoch || 0) + 1;
    session.nftOwnership = null; session.nftSummonedPet = null; session.nftChecking = null; session.nftAuction = null; session.nftAuctionChecking = null;
    revokeNftMount(session);
  }
  function sendNft(session, message, openAuction = false) {
    if (!liveSession(session)) return;
    const owned = publicNftOwnership(session);
    const auction = session.nftAuction && session.nftAuction.wallet === session.player.auctionWallet && session.nftAuction.verifiedAt <= Date.now()
      && Date.now() - session.nftAuction.verifiedAt < NFT_OWNERSHIP_MAX_AGE_MS ? session.nftAuction : null;
    send(session.socket, { type: 'nftState', state: { ...nftStatus, ...(auction ? { houses: auction.houses } : {}), wallet: session.player.auctionWallet || null,
      walletBalanceWei: auction?.walletBalanceWei ?? null, refundWei: auction?.refundWei ?? null,
      orders: session.player.nftOrders, ownedPets: owned.nftPets, ownedMounts: owned.nftMounts, ownedHouses: owned.nftHouses, ownershipVerified: nftOwnershipValid(session) }, ...(message ? { message } : {}), ...(openAuction ? { openAuction: true } : {}) });
  }
  function refreshNftAuction(session) {
    if (session.nftAuctionChecking) return session.nftAuctionChecking;
    if (session.nftAuction && session.nftAuction.wallet === session.player.auctionWallet && session.nftAuction.verifiedAt <= Date.now() && Date.now() - session.nftAuction.verifiedAt < 4500) return Promise.resolve();
    const wallet = session.player.auctionWallet, epoch = session.nftEpoch;
    const current = () => liveSession(session) && !closing && session.player.auctionWallet === wallet && session.nftEpoch === epoch;
    const work = Promise.resolve().then(async () => {
      try {
        const state = await collectiblesChain.auctionState(wallet);
        if (!current()) return;
        if (!state || !Number.isSafeInteger(state.verifiedAt) || state.verifiedAt > Date.now()
          || Date.now() - state.verifiedAt >= NFT_OWNERSHIP_MAX_AGE_MS) throw Error('Unverified NFT auction state.');
        session.nftAuction = { ...state, wallet };
      } catch { if (current()) session.nftAuction = null; }
      finally { if (session.nftAuctionChecking === work) session.nftAuctionChecking = null; if (current()) sendNft(session); }
    });
    session.nftAuctionChecking = work; return work;
  }
  function refreshNftOwnership(session, force = false) {
    if (!liveSession(session) || closing) return Promise.resolve(false);
    if (session.nftChecking) return session.nftChecking;
    const owned = session.nftOwnership;
    // ponytail: empty wallets discover incoming transfers within a minute; use transfer events if passive discovery must be immediate.
    const empty = owned?.collectionsVerified === true && owned.pets.length === 0 && owned.houses.length === 0 && owned.mounts?.length === 0;
    if (!force && owned && owned.wallet === session.player.auctionWallet && owned.verifiedAt <= Date.now()
      && Date.now() - owned.verifiedAt < (empty ? 60000 : 4500)) return Promise.resolve(nftOwnershipValid(session));
    const wallet = session.player.auctionWallet, epoch = session.nftEpoch;
    if (!wallet || !(collectiblesChain.configured || nftStatus.configured)) { invalidateNftOwnership(session); sendNft(session); return Promise.resolve(false); }
    const current = () => liveSession(session) && !closing && session.player.auctionWallet === wallet && session.nftEpoch === epoch;
    const work = Promise.resolve().then(async () => {
      try {
        const owned = await collectiblesChain.ownership(wallet);
        if (!current()) return false;
        if (!owned || !Array.isArray(owned.pets) || !owned.pets.every(pet => !!nftAsset('pet', pet))
            || owned.collectionsVerified !== undefined && typeof owned.collectionsVerified !== 'boolean'
            || owned.newPetsVerified !== undefined && typeof owned.newPetsVerified !== 'boolean'
            || owned.mounts !== undefined && (!Array.isArray(owned.mounts) || !owned.mounts.every(mount => !!nftAsset('mount', mount)))
            || owned.mountsVerified !== undefined && typeof owned.mountsVerified !== 'boolean'
            || !Array.isArray(owned.houses) || !owned.houses.every(house => !!nftAsset('house', house))
            || !Number.isSafeInteger(owned.verifiedAt) || owned.verifiedAt > Date.now()
            || Date.now() - owned.verifiedAt >= NFT_OWNERSHIP_MAX_AGE_MS) throw Error('Unverified NFT ownership.');
        session.nftOwnership = { ...owned, wallet };
        publicNftOwnership(session);
        return true;
      } catch {
        if (current()) {
          if (!nftOwnershipValid(session)) session.nftOwnership = null;
          else session.nftOwnership.collectionsVerified = false;
        }
        return false;
      } finally {
        if (session.nftChecking === work) session.nftChecking = null;
        if (current()) { sendNft(session); send(session.socket, snapshot(session)); }
      }
    });
    session.nftChecking = work;
    return work;
  }
  function settleNft(owner, orderId) {
    if (settlingNfts.has(orderId)) return settlingNfts.get(orderId);
    const order = owner.player.nftOrders.find(order => order.id === orderId);
    if (!order || order.status !== 'quoted' || closing || committingAccounts.has(owner.recordKey) || releasingAccounts.has(owner.recordKey)) return Promise.resolve();
    const expected = JSON.stringify(order);
    const work = (async () => {
      const result = await collectiblesChain.settlement(order);
      if (closing || result.state === 'pending') return;
      if (!['minted', 'expired'].includes(result.state)) throw Error('The NFT claim could not be verified.');
      const committed = await commitStore(owner, async player => {
        const current = player.nftOrders.find(item => item.id === orderId);
        if (JSON.stringify(current) !== expected) return;
        const changes = { nftOrders: player.nftOrders.map(item => item.id === orderId ? { ...item, status: result.state } : item) };
        if (result.state === 'expired' && ['pet', 'mount'].includes(order.kind)) {
          if (order.claimSource === 'learned') {
            const collection = order.kind === 'mount' ? 'ownedMounts' : 'ownedPets';
            changes[collection] = [...new Set([...player[collection], order.assetId])];
          }
          else {
            changes.carriedItems = { ...player.carriedItems, [order.assetId]: (player.carriedItems[order.assetId] || 0) + 1 };
            // Keep escrow pending if bags filled meanwhile; retry restitution when a slot opens.
            if (!bagCanFit(player, changes)) return;
          }
        }
        return changes;
      }, true);
      const active = sessions.get(owner.player.id);
      if (committed && liveSession(active)) {
        await refreshNftOwnership(active, true);
        sendNft(active, result.state === 'minted' ? 'NFT minted. The current wallet owner can use it in the game.' : order.claimSource === 'learned' ? 'Unpaid NFT quote expired. Your learned collectible is back in your collection.' : 'Unpaid NFT quote expired. Any reserved collectible is back in your bags.');
      }
    })().finally(() => { settlingNfts.delete(orderId); });
    settlingNfts.set(orderId, work);
    return work;
  }
  async function handleSpecialistNft(session, message) {
    const connection = accountConnections.get(session.recordKey);
    if (connection?.nativePlatform === 'ios') { event(session, 'info', 'Specialist NFT trading is unavailable in the iOS app.', false, message.type); return; }
    if (Date.now() - (session.lastSpecialistNft || 0) < 1000) { event(session, 'info', 'Wait a moment before checking specialists again.', false, message.type); return; }
    session.lastSpecialistNft = Date.now();
    if (committingAccounts.has(session.recordKey) || releasingAccounts.has(session.recordKey)) { event(session, 'info', 'Saving your last action. Try again shortly.', false, message.type); return; }
    try {
      const result = await specialists.handle({ recordKey: session.recordKey, player: session.player }, message, {
        nativePlatform: connection?.nativePlatform,
        canAct: () => liveSession(session) && !closing && !session.instanceId && session.player.hp > 0 && !session.zeppelin && !session.casting && !session.autoAttack && !session.gathering && !inCombat(session),
      });
      if (!liveSession(session) || closing) return;
      if (result.state) send(session.socket, { type: 'specialistNftState', state: result.state, ...(result.message ? { message: result.message } : {}) });
      if (result.order) send(session.socket, { type: 'specialistNftQuote', order: result.order });
      if (result.transaction) send(session.socket, { type: 'specialistNftTransaction', transaction: result.transaction });
      send(session.socket, snapshot(session));
    } catch (error) { if (liveSession(session) && !closing) event(session, 'info', error instanceof Error ? error.message : 'Specialist exchange is unavailable. Try again.', false, message.type); }
  }
  async function handleNft(session, message) {
    const fields = nftFields[message.type], p = session.player, owner = { recordKey: session.recordKey, player: p };
    const fail = text => { event(session, 'info', text, false, message.type); sendNft(session, text); };
    const extras = message.type === 'nftAuctionCheck' ? ['houseId', 'amountWei'].filter(field => Object.hasOwn(message, field)) : ['nftClaimPet', 'nftClaimMount'].includes(message.type) && Object.hasOwn(message, 'source') ? ['source'] : [];
    if (Object.keys(message).length !== fields.length + extras.length || !fields.every(field => Object.hasOwn(message, field))) { fail('Invalid NFT request.'); return; }
    if (['nftClaimPet', 'nftClaimMount'].includes(message.type) && Object.hasOwn(message, 'source') && message.source !== 'learned') { fail('Choose a valid collectible claim source.'); return; }
    const throttle = ['nftOpen', 'nftAuctionOpen', 'nftPaymentCheck', 'nftAuctionCheck', 'nftMigrationReview'].includes(message.type) ? 'lastNftCheck' : 'lastNftAction';
    if (Date.now() - (session[throttle] || 0) < 1000) { fail('Wait a moment before checking NFTs again.'); return; }
    session[throttle] = Date.now();
    try {
      await refreshNftStatus();
      if (!liveSession(session) || closing || committingAccounts.has(session.recordKey) || releasingAccounts.has(session.recordKey)) return;
      if (Object.hasOwn(message, 'npcId')) {
        if (message.npcId !== DEED_AUCTIONEER.id || !deedAuctionNearby(session)) { fail('Speak to Bram Oakledger at the House Deed Auctions.'); return; }
        if (message.type === 'nftAuctionOpen') { await Promise.all([refreshNftAuction(session), refreshNftOwnership(session, true)]); sendNft(session, undefined, true); return; }
        const wallet = p.auctionWallet;
        if (!wallet) { fail('Connect and confirm your wallet first.'); return; }
        if (session.casting || session.autoAttack || inCombat(session)) { fail('Finish combat before bidding at the house auctions.'); return; }
        const stillNearby = () => deedAuctionNearby(session) && !closing && p.auctionWallet === wallet && !committingAccounts.has(session.recordKey);
        if (message.type === 'nftAuctionCheck') {
          const result = await collectiblesChain.checkAuctionTransaction({ wallet, transactionHash: message.transactionHash, action: message.action,
            ...(message.houseId !== undefined ? { houseId: message.houseId } : {}), ...(message.amountWei !== undefined ? { amountWei: message.amountWei } : {}), paymentWei: message.paymentWei });
          if (stillNearby()) { send(session.socket, { type: 'nftAuctionChecked', transactionHash: message.transactionHash, state: result.state }); await refreshNftAuction(session); }
          return;
        }
        const action = message.type === 'nftBidHouse' ? 'bid' : message.type === 'nftSettleHouse' ? 'settle' : 'withdraw';
        const transaction = await collectiblesChain.prepareAuctionTransaction({ wallet, action, ...(message.houseId !== undefined ? { houseId: message.houseId } : {}), ...(message.amountWei !== undefined ? { amountWei: message.amountWei } : {}) });
        if (stillNearby()) { send(session.socket, { type: 'nftAuctionTransaction', ...transaction }); await refreshNftAuction(session); }
        return;
      }
      if (message.type === 'nftOpen') { await Promise.all([refreshNftOwnership(session, true), refreshNftAuction(session)]); sendNft(session); return; }
      if (message.type === 'nftMigrationReview') {
        const wallet = p.auctionWallet, epoch = session.nftEpoch;
        if (!wallet) { fail('Connect and confirm your wallet first.'); return; }
        if (!nftStatus.enabled || !nftStatus.legacyPetsContract) { fail('Pet migration is not enabled on this realm.'); return; }
        const terms = { wallet, legacyContract: nftStatus.legacyPetsContract, contract: nftStatus.petsContract, tokenId: message.tokenId };
        const migration = await collectiblesChain.prepareMigration({ wallet, tokenId: message.tokenId });
        if (!nftMigrationTransactionValid(migration, terms)) throw Error('The migration authorization could not be verified.');
        if (liveSession(session) && !closing && p.auctionWallet === wallet && session.nftEpoch === epoch) send(session.socket, { type: 'nftMigrationQuote', migration });
        return;
      }
      if (message.type === 'nftPaymentCheck') {
        const order = p.nftOrders.find(order => order.id === message.orderId);
        if (!order) { fail('That NFT claim does not belong to this character.'); return; }
        await settleNft(owner, order.id);
        await refreshNftOwnership(session, true);
        const status = p.nftOrders.find(item => item.id === order.id).status;
        sendNft(session, status === 'minted' ? 'NFT minted. Ownership follows the wallet holding it.' : status === 'expired'
          ? order.claimSource === 'learned' ? 'Unpaid NFT quote expired. Your learned collectible is back in your collection.' : 'Unpaid NFT quote expired. Any reserved collectible is back in your bags.'
          : order.claimSource === 'learned' ? 'Checking the mint. Your learned collectible returns if the chain confirms this quote expired unpaid.' : 'Checking the mint. Keep a bag slot free if the chain confirms this quote expired unpaid.'); return;
      }
      const kind = message.type === 'nftClaimMount' ? 'mount' : 'pet', assetId = kind === 'mount' ? message.mount : message.pet;
      const collection = kind === 'mount' ? 'ownedMounts' : 'ownedPets';
      if (!nftAsset(kind, assetId)) { fail('Choose a mintable pet or mount.'); return; }
      const learned = message.source === 'learned';
      if (kind === 'pet' && learned && !nftStatus.legacyPetsContract && !nftLearnedPetConvertible(assetId)) { fail('This learned pet requires the expanded NFT collection.'); return; }
      if (!p.auctionWallet) { fail('Connect and confirm your wallet first.'); return; }
      const previous = p.nftOrders.find(order => order.kind === kind && order.assetId === assetId && order.status === 'quoted');
      if (previous) {
        if (previous.claimSource !== message.source) { fail('This collectible already has a different reserved source. Review its existing claim.'); return; }
        await settleNft(owner, previous.id);
        const current = p.nftOrders.find(order => order.id === previous.id);
        sendNft(session);
        if (current.status === 'quoted') send(session.socket, { type: 'nftQuote', order: current });
        return;
      }
      if (kind === 'mount' ? !nftStatus.mountsEnabled : !nftStatus.enabled) { fail((kind === 'mount' ? nftStatus.mountsReason : nftStatus.reason) || 'NFT minting is currently unavailable.'); return; }
      if (!(kind === 'mount' ? nftStatus.mintableMountIds || [] : nftMintablePets()).includes(assetId)) { fail((kind === 'mount' ? nftStatus.mountsReason : nftStatus.newPetsReason) || 'This collectible is not enabled for minting.'); return; }
      if (nftAsset(kind, assetId).storeOnly && (!learned || !storeNftConvertible(p, assetId))) { fail('Store collectible NFTs require a verified MOSS purchase. Refundable native purchases stay with the character.'); return; }
      if (p.hp <= 0 || session.zeppelin || session.casting || session.autoAttack || inCombat(session)) { fail('Finish combat and travel before claiming an NFT.'); return; }
      if (!learned && itemLocked(p, `item:${assetId}`)) { fail('This item is locked. Unlock it before converting it to an NFT.'); return; }
      if (learned ? !p[collection].includes(assetId) : !(p.carriedItems[assetId] > 0)) { fail(learned ? 'This learned collectible is not available to convert.' : 'The unclaimed collectible must be in your bags. Withdraw it from the bank or cancel its auction first.'); return; }
      let order;
      const committed = await commitStore(owner, async player => {
        const wallet = player.auctionWallet, id = randomUUID();
        if (!learned && itemLocked(player, `item:${assetId}`)) return;
        if (learned && (!player[collection].includes(assetId) || nftAsset(kind, assetId).storeOnly && !storeNftConvertible(player, assetId))) return;
        order = await collectiblesChain.prepareOrder({ id, characterId: player.id, wallet, kind, assetId, ...(learned ? { claimSource: 'learned' } : {}) });
        if (!liveSession(session) || closing || player.auctionWallet !== wallet) return;
        if (order.id !== id || order.wallet !== wallet || order.kind !== kind || order.assetId !== assetId || order.status !== 'quoted'
            || order.claimSource !== message.source || !nftPlayerValid({ id: player.id, nftOrders: [order] })) throw Error('The NFT claim authorization could not be verified.');
        const changes = { nftOrders: [...player.nftOrders, { ...order, status: 'quoted' }] };
        if (learned) {
          if (!player[collection].includes(assetId)) return;
          changes[collection] = player[collection].filter(item => item !== assetId);
          if (kind === 'pet' && player.summonedPet === assetId) changes.summonedPet = null;
        } else {
          if (!(player.carriedItems[assetId] > 0)) return;
          changes.carriedItems = { ...player.carriedItems };
          if (!--changes.carriedItems[assetId]) delete changes.carriedItems[assetId];
        }
        return changes;
      });
      if (!committed) { fail('The NFT claim could not be saved. Please try again.'); return; }
      revokeNftMount(session);
      sendNft(session); send(session.socket, { type: 'nftQuote', order: p.nftOrders.find(item => item.id === order.id) });
    } catch (error) { if (!closing) fail(error instanceof Error ? error.message : 'The NFT claim could not be completed. Please try again.'); }
  }

  // ponytail: 2,000 recent account rate windows per realm; use a shared limiter if measured traffic reaches this ceiling.
  const translator = chatTranslation || createChatTranslation(), translationAccounts = new Map();
  async function translateChat(session, message) {
    const reply = result => send(session.socket, { type: 'chatTranslation', messageId: message.messageId, targetLanguage: message.targetLanguage, ...result });
    if (Object.keys(message).length !== 3 || typeof message.messageId !== 'string' || message.messageId.length > 36 || !chatLanguageValid(message.targetLanguage)) {
      reply({ error: 'Choose a recent chat message and a supported language.' }); return;
    }
    const receipt = session.recentChat?.get(message.messageId), skipped = { error: 'This chat message is no longer available for translation.', skipped: true };
    if (!receipt || !liveSession(session)) { reply(skipped); return; }
    if (!translator.enabled) { reply({ error: 'Chat translation is not enabled on this realm.' }); return; }
    const now = Date.now();
    let rate = translationAccounts.get(session.recordKey);
    if (!rate) {
      if (translationAccounts.size >= 2000) for (const [key, value] of translationAccounts) if (now - value.at >= 60_000 && !value.pending) translationAccounts.delete(key);
      if (translationAccounts.size >= 2000) { reply({ error: 'Chat translation is busy. Try again shortly.' }); return; }
      rate = { at: now, count: 0, pending: 0 }; translationAccounts.set(session.recordKey, rate);
    }
    if (now - rate.at >= 60_000) { rate.at = now; rate.count = 0; }
    if (rate.count >= 120 || rate.pending >= 4) { reply({ error: 'Wait a moment before translating more chat.' }); return; }
    rate.count++; rate.pending++;
    const finish = result => { if (liveSession(session) && !closing) reply(session.recentChat?.get(message.messageId) === receipt ? result : skipped); };
    try {
      const text = await translator.translate(receipt.text, message.targetLanguage);
      finish({ text });
    } catch (error) { finish({ error: error.message }); }
    finally { rate.pending--; }
  }
  const reports = localReports(dataDir);
  const publicReport = ({ reporterAccount, targetAccount, ...report }) => report;
  async function reportGuard(connection, reason, details, blockedUntil = 0, securityEvidence) {
    if (!connection.recordKey) return;
    const player = connection.session?.player;
    const report = { id: randomUUID(), source: 'guard', reporterAccount: connection.recordKey, targetAccount: connection.recordKey,
      targetId: player?.id || connection.account.characters[0]?.id || 'account', targetName: player?.name || 'Account',
      reason, details, realmId, blockedUntil, createdAt: Date.now(), status: 'open', ...(securityEvidence ? { securityEvidence } : {}) };
    console.warn('Security guard:', JSON.stringify({ characterId: report.targetId, realmId, reason, details, blockedUntil }));
    return database ? await database.addGuardReport(report) : reports.addGuard(report);
  }
  function observeClientAction(connection, session, type, now, targetId) {
    if (connection.session !== session || !liveSession(session)) return;
    const nonce = connection.clientChecks.action(Date.now());
    if (nonce) send(connection.socket, { type: 'clientCheck', nonce });
    const context = targetId ? JSON.stringify([session.instanceId || session.player.zone, type, targetId]) : undefined;
    const pattern = actionGuard.action(connection.recordKey, type, now, context);
    if (pattern) {
      const evidence = actionGuard.evidence(connection.recordKey, pattern, connection.clientChecks.summary(pattern.startedAt, pattern.endedAt));
      void reportGuard(connection, 'Possible scripted input', botEvidenceDescription(evidence), 0, evidence)
        .catch(error => console.error('Security report save failed:', error.message));
    }
  }
  function sendCommunityChat(session, message, author, text, channel) {
    const receipt = { targetId: author.id, targetName: author.name, text, channel, at: Date.now() };
    session.recentChat ||= new Map();
    session.recentChat.set(message.messageId, receipt);
    while (session.recentChat.size > 120) session.recentChat.delete(session.recentChat.keys().next().value);
    send(session.socket, message);
  }
  async function communityAction(connection, message) {
    const reply = (success, text) => send(connection.socket, { type: 'reportResult', success, text });
    if (message.type === 'acceptCommunityRules') {
      if (Object.keys(message).length !== 2 || message.version !== COMMUNITY_VERSION) { reply(false, 'Read the current community rules first.'); return; }
      if (connection.account.communityRulesVersion === COMMUNITY_VERSION) { send(connection.socket, { type: 'community', version: COMMUNITY_VERSION, accepted: true }); return; }
      if (committingAccounts.has(connection.recordKey) || connection.releasing) { reply(false, 'Saving your last action. Try again.'); return; }
      const action = {}; committingAccounts.set(connection.recordKey, action);
      action.completion = save(new Map(), () => { connection.account.communityRulesVersion = COMMUNITY_VERSION; }, new Map([[connection.recordKey, { communityRulesVersion: COMMUNITY_VERSION }]]))
        .then(() => send(connection.socket, { type: 'community', version: COMMUNITY_VERSION, accepted: true }))
        .catch(() => reply(false, 'The rules could not be saved. Please try again.'))
        .finally(() => { if (committingAccounts.get(connection.recordKey) === action) committingAccounts.delete(connection.recordKey); });
      await action.completion; return;
    }
    if (message.type === 'playerReport') {
      const session = connection.session;
      if (!liveSession(session) || connection.reporting) { reply(false, 'Enter the world before sending a report.'); return; }
      if (Object.keys(message).some(key => !['type','targetId','messageId','reason','details'].includes(key)) || !REPORT_REASONS.includes(message.reason)
          || !communityText(message.details, 500, true) || typeof message.targetId !== 'string' || message.targetId === session.player.id
          || (message.messageId !== undefined && typeof message.messageId !== 'string')) { reply(false, 'Choose a player and report reason.'); return; }
      const evidence = message.messageId ? session.recentChat?.get(message.messageId) : undefined;
      const target = sessions.get(message.targetId);
      if (message.messageId ? !evidence || evidence.targetId !== message.targetId : !liveSession(target) || !canSee(session, target)) { reply(false, 'Report a recent chat message or a visible player.'); return; }
      const owner = auctionOwners().find(owner => owner.player.id === message.targetId);
      if (!owner) { reply(false, 'This player no longer exists.'); return; }
      const report = { id: randomUUID(), reporterAccount: connection.recordKey, targetAccount: owner.recordKey, targetId: owner.player.id,
        targetName: owner.player.name, reason: message.reason, details: message.details, ...(evidence ? { evidence: { text: evidence.text, channel: evidence.channel, at: evidence.at } } : {}), createdAt: Date.now(), status: 'open', realmId };
      connection.reporting = true;
      try { if (database) await database.addReport(report); else reports.add(report); reply(true, 'Report sent to the game masters. Use Ignore to block this player’s chat and invitations.'); }
      catch (error) { reply(false, error.message === 'Wait one minute before sending another report.' ? error.message : 'The report could not be saved. Please try again.'); }
      finally { connection.reporting = false; }
      return;
    }
    if (!gmAuthorized(connection)) { reply(false, 'Game master access is required.'); return; }
    if (connection.reviewing) return;
    connection.reviewing = true;
    try {
      if (message.type === 'reviewReport') {
        if (Object.keys(message).length !== 4 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(message.reportId) || !['ban','dismiss'].includes(message.decision)
            || !communityText(message.reason, 160) || !message.reason) throw Error('Choose a report, action and reason.');
        if (database) {
          await database.reviewReport(message.reportId, message.decision, message.reason, { accountKey: connection.recordKey, characterId: connection.session.player.id }, () => gmAuthorized(connection));
          await refreshRecords();
        } else {
          const report = reports.get(message.reportId), account = report && records[report.targetAccount];
          if (!report || report.status !== 'open') throw Error('This report has already been reviewed.');
          if (message.decision === 'ban') {
            if (!account || report.targetAccount === connection.recordKey || account.gmProtected) throw Error('This account cannot be banned here.');
            if (committingAccounts.has(report.targetAccount)) throw Error('The account is saving. Try again.');
            const operation = {}, ban = { at: Date.now(), by: connection.session.player.id, reason: message.reason };
            committingAccounts.set(report.targetAccount, operation);
            operation.completion = save(new Map(), () => { account.ban = ban; }, new Map([[report.targetAccount, () => { if (!gmAuthorized(connection)) throw Error('Game master access has expired.'); return { ban }; }]]))
              .finally(() => { if (committingAccounts.get(report.targetAccount) === operation) committingAccounts.delete(report.targetAccount); });
            await operation.completion;
          }
          reports.resolve(report.id, message.decision === 'ban' ? 'banned' : 'dismissed', message.reason, connection.session.player.id);
        }
        reply(true, 'Report reviewed.');
      } else {
        if (Object.keys(message).some(key => !['type', 'reviewed'].includes(key)) || message.reviewed !== undefined && typeof message.reviewed !== 'boolean') throw Error('Invalid report list request.');
        connection.reviewedReports = message.reviewed === true;
      }
      const inbox = database ? await database.listReports(connection.reviewedReports) : reports.list(connection.reviewedReports);
      if (!gmAuthorized(connection)) throw Error('Game master access has expired.');
      send(connection.socket, { type: 'reports', reports: inbox.map(publicReport) });
    } catch (error) { reply(false, error.code ? 'The report could not be reviewed. Please try again.' : error.message); }
    finally { connection.reviewing = false; }
  }
  function broadcast(message, zone, instanceId = null) {
    const subject = sessions.get(message.playerId || (message.targetKind === 'player' ? message.targetId : ''));
    for (const session of sessions.values()) if (session.instanceId === instanceId && (!subject || canSee(session, subject))
      && !(message.type === 'event' && message.kind === 'chat' && ignores(session, message.playerId))) {
      if (message.type === 'event' && message.kind === 'chat' && subject) sendCommunityChat(session, message, subject.player, message.content, 'world');
      else send(session.socket, message);
    }
  }
  function applyDamage(target, targetKind, damage, instanceId, at = Date.now(), attacker, reflected = false, edictProc = false, execution = false, damageSchool) {
    if (targetKind === 'enemy' && target.raidId) damage = raids.damageAllowed(target, damage, at);
    if (targetKind === 'enemy' && target.instantCombat) damage = instantCombat.damageAllowed(target, damage, at, attacker);
    if (targetKind === 'enemy' && target.kind === 'training-dummy') {
      if (damage <= 0) return;
      if (at - (target.lastHitAt ?? -Infinity) >= TRAINING_DUMMY_RESET_MS) target.hp = target.maxHp;
      target.lastHitAt = at;
      target.hp = Math.max(1, target.hp - damage);
      // Keep practice damage and recoil visible even after the dummy reaches 1 HP.
      broadcast({ type: 'damage', targetId: target.id, targetKind, amount: damage, x: target.x, z: target.z }, target.zone, instanceId);
      if (!edictProc) triggerEdicts(target, 'damage', at, attacker?.player || attacker);
      return;
    }
    const recipient = targetKind === 'player' && sessions.get(target.id);
    if (recipient?.instanceId && (dungeonPreparing(recipient) || !instantCombat.combatActive(recipient.instanceId))) return;
    if (arenaMode(recipient) && (!attacker || !hostileTargetValid(attacker, target, at))) return;
    if (recipient && damage > 0) { recipient.emote = null; recipient.nextSpiritAt = at + 5000; recipient.companionCombatUntil = at + 5000; }
    const guardian = recipient?.combatTalents?.guardian;
    if (!execution && guardian?.until > at && damage > 0) damage = Math.max(1, Math.round(damage * .6));
    if (!execution && !reflected && damageSchool === 'fire' && recipient?.player.heatproofUntil > at && damage > 0) damage = Math.max(1, Math.round(damage * HEATPROOF_DAMAGE_MULTIPLIER));
    const incoming = damage;
    if (damage > 0 && !edictProc) triggerEdicts(target, 'beforeDamage', at, attacker?.player || attacker);
    const shield = recipient?.shield;
    let absorbed = 0;
    if (shield?.endsAt > at && shield.amount > 0 && damage > 0) {
      absorbed = Math.min(shield.amount,damage);
      shield.amount -= absorbed; damage -= absorbed;
      broadcast({ type:'damage', targetId:target.id, targetKind, amount:absorbed, x:target.x, z:target.z, effect:'absorb' },target.zone,instanceId);
      if (!shield.amount) recipient.shield = null;
    }
    if (recipient && incoming > 0 && !execution) knightDamageTaken(recipient, attacker?.player || attacker, incoming, absorbed, at, reflected);
    const protectedDuel = recipient?.duel && !worldPvp(recipient);
    const amount = Math.min(Math.max(0, target.hp - (protectedDuel ? 1 : 0)), Math.max(0, damage));
    if (amount <= 0) { if (incoming > 0 && !edictProc) triggerEdicts(target, 'damage', at, attacker?.player || attacker, { shield, absorbed }); return; }
    target.hp -= amount;
    broadcast({ type: 'damage', targetId: target.id, targetKind, amount, x: target.x, z: target.z }, target.zone, instanceId);
    const defeated = protectedDuel && target.hp === 1;
    if (incoming > 0 && target.hp > 0 && !defeated && !edictProc) triggerEdicts(target, 'damage', at, attacker?.player || attacker, { shield, absorbed });
    if (defeated) {
      if (arenaMode(recipient)) knockOut(recipient);
      else endDuel(recipient, attacker && duelOpponent(attacker) === recipient ? `${attacker.player.name} won the duel. ${target.name} finishes at 1 HP.` : 'Duel ended by outside damage.');
    }
  }
  function event(session, kind, text, logOnly = false, requestType, upgradeEffectId) { send(session.socket, { type: 'event', kind, text, playerId: session.player.id, ...(logOnly ? { logOnly: true } : {}), ...(requestType ? { requestType } : {}), ...(upgradeEffectId ? { upgradeEffectId } : {}) }); }
  function combatDefense(session, at) {
    const armor = session.combatTalents?.blessedArmor;
    return Math.round((combatStats(session.player).defense + (armor?.until > at ? armor.defense : 0)) * storeBoostMultiplier(session.player, 'defense', at));
  }
  function clericSupportTalents(source, recipient, amount, at, healing) {
    const armorRank = talentEffectRank(source.player, 'blessedArmor');
    if (armorRank) {
      const state = recipient.combatTalents ||= {}, previous = state.blessedArmor;
      if (!(previous?.until > at) || previous.defense <= armorRank * 2)
        state.blessedArmor = { until: at + 5000, defense: armorRank * 2 };
    }
    const pulse = healing ? Math.round(amount * talentEffectRank(source.player, 'healingLight') * .05) : 0;
    if (pulse > 0) for (const ally of edictNearby({ source, kind: 'light' }, recipient.player, at))
      if (restoreHealth(sessions.get(ally.id), pulse, at, true) > 0) dirty();
  }
  function restoreHealth(session, amount, at = Date.now(), edictProc = false, source) {
    const p = session.player;
    if (p.hp <= 0 || arenaMode(session) && !arenaFighter(session, at)) return 0;
    healCompanion(session, amount, at);
    const healed = Math.max(0, Math.min(amount, p.maxHp - p.hp));
    if (healed > 0) {
      p.hp += healed;
      broadcast({ type: 'damage', targetId: p.id, targetKind: 'player', amount: healed, x: p.x, z: p.z, effect: 'heal' }, p.zone, session.instanceId);
    }
    if (amount > 0 && !edictProc) triggerEdicts(p, 'heal', at);
    if (amount > 0 && source) clericSupportTalents(source, session, amount, at, true);
    return healed;
  }
  function dialogue(session, npcId, title, lines, choices, services) { send(session.socket, { type: 'dialogue', npcId, title, lines, choices, services }); }
  function storyVisit(session, target) {
    if (!target || session.instanceId || session.player.hp <= 0) return;
    const role = BANKERS.includes(target) ? 'banker' : AUCTIONEERS.includes(target) ? 'auctioneer'
      : TRAINER_NPCS.includes(target) && target.className ? 'class-trainer' : target.id;
    if (storyQuestProgress(session.player.storyQuests, { kind: 'interact', target: role, scope: 'overworld', zone: target.zone })) dirty();
  }
  function sendStoryDialogue(session, quest, npcId, phase, reward) {
    const progress = session.player.storyQuests.active[quest.id];
    const lines = phase === 'offer' ? [...quest.dialogue.intro] : phase === 'progress'
      ? quest.objectives.map((objective, index) => `${objective.label}: ${progress?.[index] ?? 0}/${objective.count}`)
      : [...quest.dialogue.complete];
    send(session.socket, { type: 'storyQuestDialogue', questId: quest.id, npcId, title: quest.title, phase, lines,
      reward: reward ?? { ...quest.reward, gold: goldSource(quest.reward.gold, 'contract', economyVersion >= 1) } });
  }
  function hearthlingDialogue(session) {
    dialogue(session, HEARTHLING_NPC.id, HEARTHLING_NPC.name, session.player.meadGodPaid ? [MEADGOD_QUEST.complete] : MEADGOD_QUEST.intro);
  }
  const villageSafe = point => VILLAGES.some(village => distance(point, village) < VILLAGE_SAFE_RADIUS);
  const chargeSafeAreas = [...VILLAGES.map(village=>({...village,r:VILLAGE_SAFE_RADIUS})),...Object.values(REGION_ORIGINS).map(origin=>({...origin,r:CITY_RADIUS,halfWidth:CITY_RADIUS,halfDepth:CITY_RADIUS}))];
  const villageNpcNearby = (session, npc) => !session.instanceId && npc && !swimming(session) && npc.zone === session.player.zone && physicalReach(session, npc, 3) && canTraverse(session.player, npc, WORLD_COLLIDERS, WORLD_BOUNDS);
  const visiblePlayer = ({ lockedItems, arenaWagers, auctions, auctionSales, auctionWallet, pendingAuctionPurchases, treasureClaims, treasureMap, storeOrders, nftOrders, specialistNftOrders, mobileStoreOrders, storeGrants, bank, friendIds, friendRequestIds, ignoreIds, role, gm, betaTester, storyQuests, raidProgress, ...player }) => ({ ...player, ...(raidProgress ? {raidProgress:{...raidProgress,activeSpecialistId:SPECIALISTS_ENABLED?raidProgress.activeSpecialistId:null,completedRuns:[]}} : {}), economyVersion });
  const hasGmRole = session => session?.role === 'gm' && (keycloak ? session.expiresAt > Date.now() : localGmKeys.has(session.recordKey));
  const publicRole = session => hasGmRole(session) ? 'gm' : 'player';
  const isGmSession = session => !!session && accountConnections.get(session.recordKey)?.session === session && gmAuthorized(accountConnections.get(session.recordKey));
  const gmFlying = session => isGmSession(session) && session.gm.flying;
  const gmInvisible = session => isGmSession(session) && session.gm.invisible;
  const gmObserver = session => gmFlying(session) || gmInvisible(session);
  const displayedRole = session => publicRole(session) === 'gm' && !session.gm?.tagHidden ? 'gm' : 'player';
  const canSee = (viewer, target) => viewer === target || !gmInvisible(target) || isGmSession(viewer);
  function sendFriends(session, result = {}, characters = savedCharacters(), changedOnly = false) {
    const p = session.player;
    const friends = p.friendIds.map(id => characters.get(id)).filter(friend => friend?.friendIds.includes(p.id)).map(friend => {
      const target = sessions.get(friend.id), online = !!(liveSession(target) && canSee(session, target));
      return { id: friend.id, name: friend.name, className: friend.appearance.className, level: friend.level, online, zone: online ? friend.zone : null };
    });
    const names = ids => ids.map(id => characters.get(id)).filter(Boolean).map(({ id, name }) => ({ id, name }));
    const ignored = names(p.ignoreIds), incoming = names(p.friendRequestIds);
    const outgoing = [...characters.values()].filter(target => target.friendRequestIds.includes(p.id)).map(({ id, name }) => ({ id, name }));
    const signature = JSON.stringify([friends, ignored, incoming, outgoing]);
    if (changedOnly && session.lastFriends === signature) return;
    session.lastFriends = signature;
    send(session.socket, { type: 'friends', friends, ignored, incoming, outgoing, ...result });
  }
  async function manageFriends(session, message) {
    await refreshRecords();
    if (!liveSession(session) || committingAccounts.has(session.recordKey) || releasingAccounts.has(session.recordKey)) return;
    const request = socialRequest(message), p = session.player, characters = savedCharacters();
    const reply = result => sendFriends(session, { request, ...result }, characters);
    const adding = message.type === 'friendAdd' || message.type === 'ignoreAdd';
    const responding = message.type === 'friendRespond';
    if (request === 'list') {
      reply(Object.keys(message).length === 1 ? {} : { error: 'Invalid friends list request.' }); return;
    }
    const field = Object.hasOwn(message, 'targetId') ? 'targetId' : 'name';
    if (Object.keys(message).length !== (responding ? 3 : 2) || !Object.hasOwn(message, field) || !adding && field !== 'targetId'
        || responding && typeof message.accept !== 'boolean' || field === 'targetId' && !socialIdValid(message.targetId)
        || field === 'name' && (typeof message.name !== 'string' || message.name.length > 80 || /[<>\u0000-\u001f\u007f]/.test(message.name) || !message.name.trim() || cleanText(message.name, 20) !== message.name.trim())) {
      reply({ error: 'Enter an exact character name or select an adventurer.' }); return;
    }
    const matches = field === 'targetId' ? [characters.get(message.targetId)].filter(Boolean)
      : [...characters.values()].filter(target => target.name.toLowerCase() === message.name.trim().toLowerCase());
    if (adding && matches.length !== 1) {
      reply({ error: matches.length > 1 ? 'More than one adventurer has that name. Right-click the player to choose them.' : 'That adventurer is unavailable.' }); return;
    }
    const target = matches[0], id = target?.id || message.targetId;
    if (id === p.id) { reply({ error: 'Choose another adventurer.' }); return; }
    const current = (player, field) => player[field].filter(id => characters.has(id) && (field !== 'friendIds' || characters.get(id).friendIds.includes(player.id)));
    const without = (player, field, id) => current(player, field).filter(existing => existing !== id);
    const updates = new Map();
    let notice;
    if (message.type === 'friendAdd') {
      if (p.ignoreIds.includes(id)) { reply({ error: `Remove ${target.name} from Ignore first.` }); return; }
      if (target.ignoreIds.includes(p.id)) { reply({ error: 'That adventurer is unavailable.' }); return; }
      if (p.friendIds.includes(id) && target.friendIds.includes(p.id)) { reply({ notice: `${target.name} is already your friend.` }); return; }
      if (p.friendRequestIds.includes(id)) { reply({ error: `${target.name} has sent you a request. Open Requests to accept it.` }); return; }
      if (target.friendRequestIds.includes(p.id)) { reply({ notice: `Friend request to ${target.name} is already pending.` }); return; }
      if (current(p, 'friendIds').length >= SOCIAL_LIST_LIMIT) { reply({ error: `Your Friends list is full (${SOCIAL_LIST_LIMIT}). Remove someone first.` }); return; }
      if (current(target, 'friendIds').length >= SOCIAL_LIST_LIMIT || current(target, 'friendRequestIds').length >= SOCIAL_LIST_LIMIT) { reply({ error: 'That adventurer is unavailable.' }); return; }
      if ([...characters.values()].filter(target => target.friendRequestIds.includes(p.id)).length >= SOCIAL_LIST_LIMIT) { reply({ error: `You have ${SOCIAL_LIST_LIMIT} pending requests. Cancel one first.` }); return; }
      updates.set(id, { friendRequestIds: [...current(target, 'friendRequestIds'), p.id] });
      notice = `Friend request sent to ${target.name}.`;
    } else if (responding) {
      if (message.accept && target && p.friendIds.includes(id) && target.friendIds.includes(p.id)) { reply({ notice: `${target.name} is already your friend.` }); return; }
      if (!target || !p.friendRequestIds.includes(id)) { reply({ error: 'That friend request is no longer available.' }); return; }
      updates.set(p.id, { friendRequestIds: without(p, 'friendRequestIds', id) });
      if (message.accept) {
        if (p.ignoreIds.includes(id) || target.ignoreIds.includes(p.id)) { reply({ error: 'That friend request is no longer available.' }); return; }
        if (current(p, 'friendIds').length >= SOCIAL_LIST_LIMIT || current(target, 'friendIds').length >= SOCIAL_LIST_LIMIT) { reply({ error: 'One of your Friends lists is full. Remove a friend before accepting.' }); return; }
        updates.set(p.id, { ...updates.get(p.id), friendIds: [...without(p, 'friendIds', id), id] });
        updates.set(id, { friendIds: [...without(target, 'friendIds', p.id), p.id], friendRequestIds: without(target, 'friendRequestIds', p.id) });
      }
      notice = message.accept ? `You and ${target.name} are now friends.` : `Friend request from ${target.name} declined.`;
    } else if (message.type === 'friendCancel') {
      if (target) updates.set(id, { friendRequestIds: without(target, 'friendRequestIds', p.id) });
      notice = 'Friend request cancelled.';
    } else if (message.type === 'friendRemove') {
      updates.set(p.id, { friendIds: without(p, 'friendIds', id) });
      if (target) updates.set(id, { friendIds: without(target, 'friendIds', p.id) });
      notice = `${target?.name || 'Adventurer'} removed from Friends.`;
    } else if (message.type === 'ignoreAdd') {
      if (p.ignoreIds.includes(id)) { reply({ notice: `${target.name} is already on your Ignore list.` }); return; }
      if (current(p, 'ignoreIds').length >= SOCIAL_LIST_LIMIT) { reply({ error: `Your Ignore list is full (${SOCIAL_LIST_LIMIT}). Remove someone first.` }); return; }
      updates.set(p.id, { ignoreIds: [...current(p, 'ignoreIds'), id], friendIds: without(p, 'friendIds', id), friendRequestIds: without(p, 'friendRequestIds', id) });
      updates.set(id, { friendIds: without(target, 'friendIds', p.id), friendRequestIds: without(target, 'friendRequestIds', p.id) });
      notice = `${target.name} added to Ignore.`;
    } else {
      updates.set(p.id, { ignoreIds: without(p, 'ignoreIds', id) });
      notice = `${target?.name || 'Adventurer'} removed from Ignore.`;
    }
    const accountKeys = Object.entries(records).filter(([, account]) => account.characters.some(player => player === p || player === target)).map(([key]) => key);
    if (accountKeys.some(key => committingAccounts.has(key))) { reply({ error: 'Saving an action. Please try again in a moment.' }); return; }
    const transaction = {};
    for (const key of accountKeys) committingAccounts.set(key, transaction);
    transaction.completion = save(updates, () => {
      for (const [id, changes] of updates) Object.assign(characters.get(id), changes);
      if (message.type === 'ignoreAdd') {
        for (const [key, invite] of invitations) if (invite.targetId === p.id && invite.inviterId === id) invitations.delete(key);
        for (const [key, invite] of duelInvitations) if (invite.targetId === p.id && invite.inviterId === id) duelInvitations.delete(key);
        for (const invite of arenaInvitations.values()) if (invite.members.some(member => member.session.player.id === p.id) && invite.members.some(member => member.session.player.id === id))
          cancelArenaInvitation(invite, 'Arena challenge cancelled.');
        if (dungeonSummons.get(p.id)?.from.player.id === id) dungeonSummons.delete(p.id);
        const trade = playerTrades.get(p.id);
        if (trade?.members[0].player.id === id) closeTrade(trade, 'Trade cancelled.');
      }
    }).then(() => {
      if (liveSession(session)) reply({ notice });
      const recipient = target && sessions.get(target.id);
      if (liveSession(recipient)) sendFriends(recipient, {}, characters);
      if (message.type === 'friendAdd') {
        const ownerKey = accountKeys.find(key => records[key]?.characters.some(player => player.id === id));
        if (ownerKey) void mobilePush.invite(ownerKey, { id: randomUUID(), title: 'Friend request', body: `${p.name} sent you a friend request.`, expiresAt: Date.now() + 60 * 60_000 }).catch(pushError);
      }
    }).catch(error => { console.error('Social list save failed:', error.message); if (liveSession(session)) reply({ error: 'Your list could not be saved. Please try again.' }); dirty(); })
      .finally(() => { for (const key of accountKeys) if (committingAccounts.get(key) === transaction) committingAccounts.delete(key); });
    await transaction.completion;
  }
  const canEmote = session => session.player.hp > 0 && session.jump.grounded && !session.travel.mount && !session.casting && !session.gathering
    && !session.seated && !session.zeppelin && !session.autoAttack && !inCombat(session) && (session.instanceId || !swimming(session));
  const seesEmote = (viewer, subject) => viewer.instanceId === subject.instanceId && canSee(viewer, subject) && !ignores(viewer, subject.player.id) && distance(viewer.player, subject.player) <= 64;
  function publicDamageOverTime(viewer) {
    const targets = new Map(), now = Date.now();
    for (const hit of pendingHits) {
      if (!hit.dot || hit.enemy.hp <= 0 || hit.dueAt <= now || combatTargetLife(hit.enemy) !== hit.life
          || !liveSession(hit.session, now) || hit.session.player.hp <= 0 || hit.session.lifeStartedAt !== hit.playerLife
          || hit.session.instanceId !== hit.instanceId || hit.instanceId !== viewer.instanceId || !canSee(viewer, hit.session)
          || hit.duelId && hit.session.duel?.id !== hit.duelId || !hostileTargetValid(hit.session, hit.enemy, now)) continue;
      const sourceId = hit.session.player.id, active = targets.get(hit.enemy.id) || new Map();
      active.set(`${sourceId}:${hit.ability}`, { ability: hit.ability, sourceId, expiresAt: hit.expiresAt });
      targets.set(hit.enemy.id, active);
    }
    return new Map([...targets].map(([id, active]) => [id, [...active.values()]]));
  }
  const publicPlayer = (session, viewer = session, effects = publicDamageOverTime(viewer), pendingPurchases) => ({ ...visiblePlayer(session.player), ...(viewer === session ? { storyQuests: session.player.storyQuests, lockedItems: session.player.lockedItems || [], pendingAuctionPurchases: (pendingPurchases ?? pendingAuctionPurchases()).get(session.player.id) || [] } : {}), petPosition: session.petLoot?.instanceId === session.instanceId ? { x: session.petLoot.x, z: session.petLoot.z } : null, ...(viewer !== session && session.player.raidProgress ? {raidProgress:{...session.player.raidProgress,activeSpecialistId:SPECIALISTS_ENABLED?session.player.raidProgress.activeSpecialistId:null,sigils:0,souls:0,evolutionCores:0,pendingHorns:false,cosmetics:session.player.raidProgress.equippedCosmetics,specialists:session.player.raidProgress.specialists.filter(card=>SPECIALISTS_ENABLED&&card.id===session.player.raidProgress.activeSpecialistId).map(({nft,...card})=>card),completedRuns:[],lastCompletion:undefined}} : {}), combatCompanion: publicCompanion(session), combatCompanionRecallAt: viewer === session ? Math.max(session.companionCombatUntil || 0, inCombat(session) ? Date.now() + 1000 : 0) : undefined, damageOverTime: (effects.get(session.player.id) || []), treasureMap: viewer === session ? publicTreasureMap(session.player) : null, ...publicNftOwnership(session), betaTester: records[session.recordKey]?.betaTester === true, pvp: worldPvp(session), arenaMatchId: arenaMode(session) ? session.duel.id : null, arenaTeam: arenaMode(session) ? duelMember(session).team : null, arenaPhase: arenaMode(session) ? session.duel.phase : null, arenaEliminated: arenaMode(session) && duelMember(session)?.eliminated === true, duelOpponentId: duelOpponent(session)?.player.id || null, duelStatus: session.duelStatus || null, role: viewer === session ? publicRole(session) : displayedRole(session), ...(viewer === session && isGmSession(session) ? { gm: { ...session.gm, canReturn: !!session.gmReturnPosition } } : {}), chilledUntil: chilledTarget(session.player, Date.now()) ? session.talentChill.until : 0, combatTalents: viewer === session ? combatTalentState(session, Date.now()) : undefined, abilityCooldowns: { ...session.abilityCooldowns }, globalCooldownUntil: session.lastAttack + GLOBAL_ATTACK_MS, autoAttack: session.autoAttack ? { targetId: session.autoAttack.enemy.id, nextAttackAt: session.nextAutoAttackAt || 0 } : null, shield: session.shield?.endsAt > Date.now() ? { ...session.shield } : null, emote: seesEmote(viewer, session) ? session.emote || null : null, gathering: session.gathering || null, casting: session.casting ? { ability: session.casting.ability, startedAt: session.casting.startedAt, endsAt: session.casting.endsAt, rotation: session.casting.rotation, targetId: session.casting.targetId, ...(session.casting.ability === 'mount' ? { mount: session.casting.mount } : {}), ...(session.casting.channel ? { channel: true } : {}) } : null, seated: session.seated ? { ...session.seated } : null, instanceId: session.instanceId, travel: { ...session.travel }, jump: { ...session.jump }, zeppelin: session.zeppelin || null });
  const sessionFloor = session => (x, z) => jumpFloor(x, z, !!session.instanceId);
  function moveSessionJump(session, state, from, to) {
    return moveJump(state, from, to, !!session.instanceId, collisionScene(session));
  }
  function resetJump(session) {
    movementCredit.reset(session);
    passengers.leave(session);
    session.emote = null;
    const sequence = session.jump?.sequence || 0;
    const saved = session.player.standingPosition;
    const savedY = !session.instanceId && saved?.x === session.player.x && saved?.z === session.player.z ? saved.y : undefined;
    session.jump = { ...newJump(session.player.x, session.player.z, !!session.instanceId, collisionScene(session), savedY), sequence };
    rememberStanding(session);
    if (gmFlying(session)) session.jump.grounded = false;
    session.lastJumpAt = Date.now();
  }
  function advanceJump(session, now) {
    if (session.zeppelin) {
      const pose = zeppelinPose(session.zeppelin, now);
      if (pose.landed) {
        const destination = zeppelinPort(session.zeppelin.to);
        leaveZeppelin(session, destination.id);
        visitAchievementZone(session);
        send(session.socket, snapshot(session)); correction(session, `Arrived at ${destination.name}.`); dirty();
      } else {
        Object.assign(session.player, { x: pose.x, z: pose.z, rotation: pose.rotation, zone: regionAt(pose.x, pose.z) });
        Object.assign(session.jump, { y: pose.y, velocity: 0, grounded: false });
        session.lastJumpAt = now;
      }
      return;
    }
    if (gmFlying(session)) { session.lastJumpAt = now; return; }
    if (session.jump.climb) {
      if (session.player.hp <= 0 || session.duelStatus?.stunUntil > now) stopClimb(session.jump);
      else stepClimb(session.jump, session.player, session.travel, Math.max(0, now - session.lastJumpAt) / 1000, collisionScene(session),
        (from, to) => playerRouteAllowed(session, from, to));
      rememberStanding(session);
      session.lastJumpAt = now; session.lastSprintAt = now; session.lastTravelAt = now;
      session.lastMove = now; session.moveBudget = 0;
      if (!session.jump.climb) {
        if (!session.instanceId) session.player.zone = regionAt(session.player.x, session.player.z);
        visitAchievementZone(session); send(session.socket, snapshot(session)); dirty();
      }
      return;
    }
    stepJump(session.jump, Math.max(0, now - session.lastJumpAt) / 1000, sessionFloor(session)(session.player.x, session.player.z), session.player, collisionScene(session));
    const safe = session.lastSupportedPosition;
    if (session.jump.y < jumpFloor(session.player.x, session.player.z, !!session.instanceId) - 40 && safe?.scene === collisionScene(session)) {
      Object.assign(session.player, { x:safe.x, z:safe.z });
      session.jump = { ...newJump(safe.x,safe.z,!!session.instanceId,collisionScene(session),safe.y), sequence:session.jump.sequence+1 };
      session.moveBudget = 0; correction(session, 'Returned to your last solid footing.');
    }
    rememberStanding(session);
    session.lastJumpAt = now;
    if (session.travel.mount && (insideBuilding(session) || swimming(session))) dismount(session);
  }
  function recoverTravel(session, now) {
    revokeNftMount(session);
    const t = session.travel;
    if (session.jump.climb) { session.lastTravelAt = now; t.sprinting = false; return; }
    const seconds = Math.max(0, now - Math.max(session.lastTravelAt, session.lastSprintAt + 600)) / 1000;
    t.stamina = Math.min(STAMINA_MAX, t.stamina + seconds * STAMINA_RECOVERY);
    if (t.stamina >= EXHAUSTION_RECOVERY) t.exhausted = false;
    if (now - session.lastSprintAt > 250) t.sprinting = false;
    session.lastTravelAt = now;
  }
  function recoverSpirit(session, now) {
    const p = session.player;
    if (!liveSession(session, now) || p.hp <= 0 || p.hp >= p.maxHp || inCombat(session) || session.casting
      || session.autoAttack || committingAccounts.has(session.recordKey)) { session.nextSpiritAt = now + 5000; return; }
    if (now < session.nextSpiritAt) return;
    session.nextSpiritAt = now + 5000;
    if (restoreHealth(session, equippedAttributes(p).spirit, now) > 0) dirty();
  }
  function leaveZeppelin(session, portId = session.zeppelin?.from) {
    if (!session.zeppelin) return;
    Object.assign(session.player, zeppelinDockPosition(portId));
    session.zeppelin = null; resetJump(session); session.jump.sequence++;
    session.lastMove = Date.now(); session.moveBudget = 0;
  }
  function dismount(session) {
    passengers.leave(session);
    if (session.travel.mount) {
      movementCredit.reset(session);
      // Movement credit is time, and cannot carry riding speed into a dismount.
      session.moveBudget = Math.min(session.moveBudget, .1);
      session.lastMove = Date.now();
    }
    session.travel.mount = null;
    session.travel.sprinting = false;
  }
  function unstick(p) {
    const saved = p.standingPosition;
    const floor = actorFloor(overworldCollisionKey, p.x, p.z, saved?.x === p.x && saved?.z === p.z ? saved.y + .05 : jumpFloor(p.x, p.z) + .5);
    if (actorCanStand(overworldCollisionKey, p.x, floor, p.z)) { p.standingPosition = { x:p.x, y:floor, z:p.z }; return; }
    delete p.standingPosition;
    for (let radius = .75; radius <= 9; radius += .75) for (let i = 0; i < 16; i++) {
      const point = { x: p.x + Math.cos(i * Math.PI / 8) * radius, z: p.z + Math.sin(i * Math.PI / 8) * radius };
      if (actorCanStand(overworldCollisionKey, point.x, actorFloor(overworldCollisionKey, point.x, point.z, jumpFloor(point.x, point.z)+.5), point.z)) { Object.assign(p, point); p.zone = regionAt(p.x, p.z); return; }
    }
    Object.assign(p, toWorld(p.zone, { x: 0, z: 22 }));
  }
  const partyOf = id => [...parties.values()].find(party => party.members.includes(id));
  function publicParty(viewer) {
    const party = partyOf(viewer.player.id);
    return party ? { id: party.id, leaderId: canSee(viewer, sessions.get(party.leaderId)) ? party.leaderId : '', members: party.members.map(id => sessions.get(id)).filter(s => s && canSee(viewer, s)).map(s => ({ id: s.player.id, name: s.player.name, className: s.player.appearance.className, level: s.player.level, hp: s.player.hp, maxHp: s.player.maxHp, zone: s.player.zone, instanceId: s.instanceId })) } : null;
  }
  function snapshot(session, pendingPurchases = pendingAuctionPurchases()) {
    const active = activeSessions(), effects = publicDamageOverTime(session);
    const instanceId = session.instanceId, dungeon = dungeons.get(instanceId), now = Date.now(), summon = dungeonSummons.get(session.player.id);
    return { type: 'snapshot', serverTime: now, zone: session.player.zone, instanceId, population: active.filter(s => canSee(session, s)).length,
      ...(isGmSession(session) ? { gmPlayers: gmLootPlayers(active, now) } : {}),
      players: active.filter(s => s.instanceId === instanceId && canSee(session, s)).map(s => publicPlayer(s, session, effects, pendingPurchases)),
      enemies: enemies.filter(e => e.instanceId === instanceId && (instanceId || Math.abs(session.player.x - e.x) <= WORLD_INTEREST_RADIUS && Math.abs(session.player.z - e.z) <= WORLD_INTEREST_RADIUS && distance(session.player, e) <= WORLD_INTEREST_RADIUS)).map(({ id, kind, model, name, level, zone, instanceId, x, z, hp, maxHp, alive, diedAt, rotation, attack, worldBoss, dungeonBoss, berserk, target, treasure, talentChill, respawnAt, raidId, raidKind, raidIndex, raidVisual, instantCombatRole }) => ({ id, kind, ...(model ? { model } : {}), ...(instantCombatRole ? { instantCombatRole, instantCombatShielded: instantCombatRole === 'boss' && !!instantCombat.byInstance(instanceId)?.mechanicEndsAt } : {}), ...(raidVisual ? { raidVisual, raidShielded:raidKind === 'guardian' && enemies.some(other=>other.raidId===raidId&&other.raidKind==='shield'&&other.raidIndex===raidIndex&&other.alive) } : {}), name, level, zone, instanceId, x, z, hp, maxHp, alive, diedAt, damageOverTime: (effects.get(id) || []), chilledUntil: talentChill?.life === respawnAt && talentChill.until > Date.now() ? talentChill.until : 0, rotation: rotation || 0, attack: target && !canSee(session, target) ? null : attack || null, worldBoss: !!worldBoss, dungeonBoss: !!dungeonBoss, berserk: !!berserk, targetId: target && canSee(session, target) ? target.player.id : null, ...(treasure ? { treasure } : {}) })),
      nodes: nodes.filter(n => n.instanceId === instanceId && (instanceId || Math.abs(session.player.x - n.x) <= WORLD_INTEREST_RADIUS && Math.abs(session.player.z - n.z) <= WORLD_INTEREST_RADIUS && distance(session.player, n) <= WORLD_INTEREST_RADIUS)), loot: [...lootDrops.values()].filter(drop => drop.instanceId === instanceId && drop.ownerId === session.player.id).map(({ goldReason, ...drop }) => drop),
      party: publicParty(session), partyInvites: [...invitations.values()].filter(invite => invite.targetId === session.player.id && invite.expiresAt > now).map(({ id, inviterId, inviterName, expiresAt }) => ({ id, inviterId, inviterName, expiresAt })),
      duel: session.duel?.mode === 'duel' ? publicDuel(session) : null,
      duelInvites: [...duelInvitations.values()].filter(invite => invite.targetId === session.player.id && invite.expiresAt > now).map(({ id, inviterId, inviterName, expiresAt }) => ({ id, inviterId, inviterName, expiresAt })),
      arena: arenaMode(session) ? publicDuel(session) : session.duelResult?.expiresAt > now ? session.duelResult.result : null,
      arenaInvites: [...arenaInvitations.values()].filter(invite => invite.members.some(member => member.session === session) && invite.expiresAt > now).map(invite => publicArenaInvitation(invite, session)),
      arenaQueue: arenaQueue.has(session) ? (({ joinedAt, size, rating }) => ({ joinedAt, size, rating }))(arenaQueue.get(session)) : null,
      raid: raids.publicState(session), raidInvites: raids.publicInvites(session), instantCombat: instantCombat.publicState(session, now),
      dungeon: dungeon ? publicDungeon(dungeon, session) : null, storyEncounter: storyEncounters.publicState(session),
      dungeonSummon: summon && summon.expiresAt > now ? { id: summon.id, fromName: summon.from.player.name, dungeonId: summon.definition.id, dungeonName: summon.definition.name, expiresAt: summon.expiresAt } : null };
  }
  const characterRoster = connection => ({ type: 'roster', realmId, characters: connection.account.characters.map(p => {
    const session = sessions.get(p.id), arena = arenaMode(session), savedActivity = arena ? duelMember(session).returnActivity : activity.get(p.id);
    return { ...visiblePlayer(p), treasureMap: publicTreasureMap(p), ...(arena ? session.returnPosition : {}), betaTester: connection.account.betaTester === true, role: publicRole(connection),
      abilityCooldowns: { ...savedActivity?.abilityCooldowns }, autoAttack: null, pvp: false, arenaMatchId: null, arenaTeam: null, arenaPhase: null, arenaEliminated: false,
      duelOpponentId: null, duelStatus: null, emote: null, gathering: null, casting: null, seated: null, zeppelin: null, instanceId: null };
  }), maxCharacters: 6, ...(connection.guestToken ? { token: connection.guestToken } : {}) });
  function sendRoster(connection) { send(connection.socket, characterRoster(connection)); }
  function correction(session, reason) { movementCredit.reset(session); send(session.socket, { type: 'correction', x: session.player.x, z: session.player.z, rotation: session.player.rotation, zone: session.player.zone, instanceId: session.instanceId, jump: { ...session.jump }, reason }); }
  function leaveParty(id) {
    const party = partyOf(id); if (!party) return;
    arenaPartyChanged(party);
    party.members = party.members.filter(member => member !== id);
    if (!party.members.length) parties.delete(party.id);
    else if (party.leaderId === id) party.leaderId = party.members[0];
  }
  function removeDungeonEntities(id) {
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].instanceId === id) enemies.splice(i, 1);
    for (const [dropId, drop] of lootDrops) if (drop.instanceId === id) removeLootDrop(dropId, 'instance_closed');
  }
  function leaveDungeon(session, disconnected = false) {
    if (!session.instanceId) return;
    if (instantCombat.bySession(session)) { instantCombat.leave(session); return; }
    if (raids.byInstance(session.instanceId)) { raids.leave(session); return; }
    if (arenaMode(session)) { endDuel(session, `${session.player.name} left the fight. The opposing team wins.`); return; }
    cancelTradeFor(session.player.id, 'Trade cancelled because an adventurer left the area.');
    const dungeon = dungeons.get(session.instanceId);
    cancelGathering(session); cancelHits(session, true);
    if (session.returnPosition) Object.assign(session.player, session.returnPosition);
    session.instanceId = null; session.returnPosition = null; resetJump(session); session.lastMove = Date.now(); session.lifeStartedAt = Date.now(); session.moveBudget = .8 / WALK_SPEED;
    if (dungeon) {
      if (dungeon.startedAt && !dungeon.completed) dungeon.unrankedReason ||= 'The party changed after the timer started.';
      dungeon.members = dungeon.members.filter(id => id !== session.player.id);
      if (dungeon.completed && !disconnected) {
        const reward = lootDrops.get(dungeon.results?.get(session.player.id)?.lootId);
        if (reward?.instanceId === dungeon.id) {
          Object.assign(reward, { instanceId: null, zone: session.player.zone, x: session.player.x, z: session.player.z,
            sourceObjectId: reward.enemyId, expiresAt: Date.now() + 300000 });
          event(session, 'info', 'Your unclaimed clear rewards are beside you at the entrance. Collect them within five minutes.');
        }
        (dungeon.finishedDepartures ||= new Set()).add(session.player.id);
      }
      if (!dungeon.members.length) {
        const finished = dungeon.completed && dungeon.results && [...dungeon.results.keys()].every(id => dungeon.finishedDepartures?.has(id) || dungeon.abandoned?.has(id));
        if (dungeon.dream || !dungeon.startedAt || finished || dungeon.roster?.every(member => dungeon.abandoned?.has(member.id))) {
          removeDungeonEntities(dungeon.id); dungeons.delete(dungeon.id);
        } else dungeon.emptySince = Date.now();
      }
    }
    dirty();
  }
  const gmLocation = session => ({ x: session.player.x, z: session.player.z, rotation: session.player.rotation,
    zone: session.player.zone, instanceId: session.instanceId, returnPosition: session.returnPosition ? { ...session.returnPosition } : null });
  function safeGmPosition(point, instanceId) {
    const colliders = instanceId ? instanceColliders(instanceId) : WORLD_COLLIDERS, bounds = instanceId ? instanceBounds(instanceId) : WORLD_BOUNDS;
    const valid = candidate => groundCanTraverse(candidate, candidate, colliders, bounds);
    if (valid(point)) return { x: point.x, z: point.z };
    for (let radius = .75; radius <= 12; radius += .75) for (let i = 0; i < 16; i++) {
      const candidate = { x: point.x + Math.cos(i * Math.PI / 8) * radius, z: point.z + Math.sin(i * Math.PI / 8) * radius };
      if (valid(candidate)) return candidate;
    }
    return instanceId ? { ...DUNGEON_START } : toWorld(point.zone, { x: 0, z: 22 });
  }
  function landGm(session) {
    session.gm.flying = false;
    Object.assign(session.player, safeGmPosition(session.player, session.instanceId));
    if (!session.instanceId) session.player.zone = regionAt(session.player.x, session.player.z);
    resetJump(session); session.jump.sequence++;
    session.lastMove = Date.now(); session.moveBudget = 0;
  }
  function relocateGmPlayer(session, destination, reason) {
    if (isInstantCombatInstance(destination.instanceId) && instantCombat.bySession(session)?.id !== destination.instanceId) return false;
    // A destroyed instance cannot be resurrected by a stored GM return slot.
    if (destination.instanceId && !dungeons.has(destination.instanceId) && !raids.byInstance(destination.instanceId) && !instantCombat.byInstance(destination.instanceId)) destination = { ...destination.returnPosition, instanceId: null, returnPosition: null };
    if (![destination.x, destination.z, destination.rotation].every(Number.isFinite) || !zoneIds.has(destination.zone)) return false;
    const point = safeGmPosition(destination, destination.instanceId);
    cancelTradeFor(session.player.id, 'Trade cancelled because an adventurer was relocated.');
    cancelGathering(session); cancelHits(session);
    if (session.instanceId !== destination.instanceId) leaveDungeon(session);
    session.instanceId = destination.instanceId;
    session.returnPosition = destination.instanceId ? { ...destination.returnPosition } : null;
    const dungeon = dungeons.get(destination.instanceId);
    if (dungeon && !dungeon.completed) dungeon.unrankedReason = 'A game master assisted this run.';
    if (dungeon && !dungeon.members.includes(session.player.id)) dungeon.members.push(session.player.id);
    Object.assign(session.player, point, { rotation: destination.rotation, zone: destination.instanceId ? 'hollow' : regionAt(point.x, point.z) });
    resetJump(session); session.jump.sequence++;
    session.lastMove = Date.now(); session.lifeStartedAt = Date.now(); session.moveBudget = 0;
    send(session.socket, snapshot(session)); correction(session, reason); dirty();
    return true;
  }
  function restInBed(session, bed) {
    const p = session.player, now = Date.now();
    if (session.instanceId || session.zeppelin || session.duel || p.hp <= 0 || !session.jump.grounded || session.casting || session.gathering || inCombat(session)
      || buildingAt(p.x,p.z)?.id !== bed.buildingId || distance(p,bed) > 3 || !canTraverse(p,bed.approach)) {
      event(session,'info','Approach a bed inside the house while out of combat, with no activity in progress.'); return;
    }
    if (now < (p.dreamRestReadyAt || 0)) { event(session,'info',`You are well rested. Try dreaming again in ${Math.ceil((p.dreamRestReadyAt-now)/60000)} minutes.`); return; }
    stand(session); cancelHits(session); dismount(session);
    p.dreamRestReadyAt = now + DREAM_REST_COOLDOWN_MS; restoreHealth(session,p.maxHp); dirty();
    if (dreamRandomInt(100) >= 35) { event(session,'info','You rest in the bed and wake refreshed. Perhaps a dream will find you next time.'); return; }
    const nightmare = dreamRandomInt(2) === 1, kind = nightmare ? 'nightroot' : 'rootvault';
    const dream = { id: randomUUID(), kind, partyId: null, members: [p.id], partySize: 1, completed: true, wipes: 0,
      spawned: new Set(), cleared: new Set(dungeonStages(kind).map(stage=>stage.id)),
      activated: new Set(dungeonLayout(kind).objects.filter(object=>object.kind!=='chest').map(object=>object.id)),
      checkpoint: false, hazards: [], lastHazard: now, dream: {kind: nightmare ? 'nightmare' : 'pleasant', endsAt: now+DREAM_DURATION_MS} };
    dungeons.set(dream.id,dream);
    cancelTradeFor(p.id,'Trade cancelled because an adventurer fell asleep.'); cancelGathering(session);
    session.returnPosition = {standingPosition:p.standingPosition,x:p.x,z:p.z,rotation:p.rotation,zone:p.zone,hp:p.hp,diedAt:0};
    session.instanceId = dream.id; Object.assign(p,DUNGEON_START,{zone:'hollow',rotation:Math.PI}); resetJump(session);
    session.lastMove = now; session.lifeStartedAt = now; session.moveBudget = 0;
    if (nightmare) for (const [i,object] of dungeonLayout(kind).objects.filter(object=>object.kind==='chest').entries()) {
      const enemyKind='grove-spider', level=p.level, stats=monsterStatsAtLevel(enemyKind,level), x=object.x, z=object.z+3;
      enemies.push({id:`${dream.id}-nightmare-${i}`,kind:enemyKind,name:'Nightmare weaver',level,zone:'hollow',instanceId:dream.id,
        x,z,homeX:x,homeZ:z,hp:stats.hp,maxHp:stats.hp,alive:true,diedAt:0,respawnAt:Infinity,lastAttack:0,rotation:0,attack:null,threat:new Map(),target:null,participants:new Set()});
    }
    event(session,'info',`${nightmare?'A nightmare':'A pleasant dream'} carries you away. Explore for keepsakes. Wake in three minutes, or use either return portal.`);
    correction(session,'You drift into a dream.'); send(session.socket,snapshot(session));
  }
  function publicDungeon(dungeon, session) {
    const definition = getDungeon(dungeon.kind), stages = dungeonStages(dungeon.kind);
    const active = stages.filter(stage => dungeon.spawned.has(stage.id) && !dungeon.cleared.has(stage.id));
    const objects = dungeonLayout(dungeon.kind).objects.map(({ stageId, ...object }) => {
      const storyChest = definition.storyQuestId && object.kind === 'chest', opened = dungeon.activated.has(object.id);
      const activated = storyChest ? opened && !!session?.player.storyQuests.treasures?.includes(object.id) : opened;
      return { ...object, ...(storyChest ? { opened } : {}), available: dungeon.cleared.has(stageId) && !activated && (object.requires ?? []).every(id => dungeon.activated.has(id)), activated };
    });
    const seals = objects.filter(object => object.kind === 'seal' && object.available);
    const objectives = dungeon.completed ? [definition.storyQuestId ? 'Chamber complete. Return to your quest giver to claim the story reward.' : 'Claim your clear rewards in the dungeon results, then use the return portal.']
      : [...active.filter(stage => !stage.optional).map(stage => stage.storyObjective ? `${stage.storyObjective.label} · ${Math.max(0, Math.ceil((stage.storyObjective.durationMs - (dungeon.storyObjectives?.has(stage.id) ? Date.now() - dungeon.storyObjectives.get(stage.id).startedAt : 0)) / 1000))}s` : `Defeat the guardians of ${stage.name}.`), ...active.filter(stage => stage.optional).map(stage => `Side room: explore ${stage.name} and defeat its guardians.`), ...seals.map(object => `Activate the ${object.label.toLowerCase()}.`)];
    objectives.unshift(...new Set(dungeon.hazards.map(hazard => hazard.label)));
    if (!dungeon.completed && !dungeon.dream) objectives.push('Spike beds flash amber before rising. Use the clear aisles.');
    if (dungeon.cleared.has('confluence') && !dungeon.checkpoint) objectives.push('Activate the sanctuary to secure a checkpoint.');
    if(dungeon.dream) return { id:dungeon.id, kind:dungeon.kind, name:dungeon.dream.kind==='nightmare'?'The Tangled Nightmare':'The Lantern Dream', dream:dungeon.dream, room:objects.filter(o=>o.kind==='chest'&&o.activated).length, rooms:objects.filter(o=>o.kind==='chest').length, completed:true, wipes:0, encounterName:dungeon.dream.kind==='nightmare'?'The Tangled Nightmare':'The Lantern Dream', objectives:[`Wake in ${Math.max(0,Math.ceil((dungeon.dream.endsAt-Date.now())/1000))} seconds.`, 'Explore the branching paths and open dream caches. Collected keepsakes remain when you wake.', ...(dungeon.dream.kind==='nightmare'?['Nightmare weavers guard the caches. Defeat them or slip past.']:[])], clearedStages:[...dungeon.cleared],objects:objects.filter(object=>object.kind==='chest').map(object=>({...object,label:'Dream cache'})),hazards:[],checkpoint:{...DUNGEON_START,active:false}};
    return { id: dungeon.id, kind: dungeon.kind, name: definition.name, room: Math.min(stages.length, dungeon.cleared.size + 1), rooms: stages.length,
      startedAt: dungeon.startedAt, elapsedMs: dungeon.elapsedMs, kills: dungeon.kills, totalKills: stages.reduce((sum, stage) => sum + stage.enemies.length + (stage.storyObjective?.waves.flat().length ?? 0), 0),
      ...(dungeon.results?.has(session?.player.id) ? { result: { ...dungeon.results.get(session.player.id),
        ranked: dungeon.recordSaved === true, unrankedReason: dungeon.unrankedReason || (dungeon.recordSaved ? undefined : 'Leaderboard save pending.'),
        remainingItemIds: (lootDrops.get(dungeon.results.get(session.player.id).lootId)?.items || []).map(item => item.id),
        claimed: !lootDrops.has(dungeon.results.get(session.player.id).lootId) } } : {}),
      completed: dungeon.completed, wipes: dungeon.wipes, encounterName: dungeon.completed ? stages.find(stage => stage.id === 'throne').name : (active.some(stage => !stage.optional) ? active.filter(stage => !stage.optional) : active).map(stage => `${stage.optional ? 'Side room: ' : ''}${stage.name}`).join(' / ') || 'The Two Rune Seals',
      objectives, clearedStages: [...dungeon.cleared], objects, hazards: dungeon.hazards.map(({ sourceLevel, sourceName, corpse, ...hazard }) => hazard),
      checkpoint: { ...(dungeon.checkpoint ? dungeonCheckpoint(dungeon.kind) : DUNGEON_START), active: dungeon.checkpoint } };
  }
  function spawnDungeonEnemy(dungeon, stage, spawn, index) {
    const stats = monsterStatsAtLevel(spawn.kind, stage.level), boss = spawn.boss === true || stage.id === 'throne' && index === 0;
    const visual = dungeonBossVisual(dungeon.kind, stage.id, index);
    const hp = Math.round(stats.hp * (1 + (dungeon.partySize - 1) * .6) * (boss ? 1.8 : 1));
    enemies.push({ id: `${dungeon.id}-${stage.id}-${index}-${dungeon.wipes}`, level: stage.level, stageId: stage.id, instanceId: dungeon.id, zone: 'hollow', kind: spawn.kind,
      ...(visual ? { model: visual.model } : {}), name: spawn.name ?? visual?.name ?? enemyStats[spawn.kind].name, dungeonBoss: boss, dungeonOptional: stage.optional === true,
      rewardScale: 1 + (getDungeon(dungeon.kind).minLevel - 10) * .1, x: spawn.x, z: spawn.z, homeX: spawn.x, homeZ: spawn.z, hp, maxHp: hp,
      damageScale: (1 + (stage.level - 10) * .07) * (1 + (dungeon.partySize - 1) * .15), alive: true, diedAt: 0, respawnAt: Infinity,
      lastAttack: 0, rotation: 0, attack: null, threat: new Map(), target: null });
  }
  function spawnDungeonStages(dungeon) {
    for (const stage of dungeonStages(dungeon.kind)) {
      if (dungeon.spawned.has(stage.id) || dungeon.cleared.has(stage.id) || !stage.requires.every(id => dungeon.cleared.has(id))) continue;
      if (stage.id === 'confluence' && (!dungeon.activated.has('verdant-seal') || !dungeon.activated.has('glacial-seal'))) continue;
      dungeon.spawned.add(stage.id);
      stage.enemies.forEach((spawn, index) => spawnDungeonEnemy(dungeon, stage, spawn, index));
    }
  }
  function advanceStoryChamber(dungeon, members, now) {
    for (const stage of dungeonStages(dungeon.kind)) {
      const objective = stage.storyObjective;
      if (!objective || !dungeon.spawned.has(stage.id) || dungeon.cleared.has(stage.id)) continue;
      const room = dungeonLayout(dungeon.kind).rooms.find(room => room.id === stage.id);
      const occupants = members.filter(s => s.player.hp > 0 && liveSession(s, now) && !gmObserver(s)
        && Math.abs(s.player.x - room.x) < room.width / 2 && Math.abs(s.player.z - room.z) < room.depth / 2);
      dungeon.storyObjectives ||= new Map();
      let state = dungeon.storyObjectives.get(stage.id);
      if (!state && !occupants.length) continue;
      if (!state) { state = { startedAt: now, wave: 0, lastDamageAt: now }; dungeon.storyObjectives.set(stage.id, state); }
      const protectedLight = objective.kind !== 'protection' || occupants.some(s => distance(s.player, stage) <= objective.protectRadius);
      if (!occupants.length || !protectedLight) state.startedAt = now;
      const elapsed = now - state.startedAt;
      while (state.wave < objective.waves.length && elapsed >= state.wave * objective.durationMs / objective.waves.length) {
        const wave = state.wave++;
        objective.waves[wave].forEach((kind, index) => spawnDungeonEnemy(dungeon, stage,
          { kind, x: stage.x + (index % 2 ? 8 : -8), z: stage.z - 5 }, `wave-${wave}-${index}`));
      }
      if (objective.kind === 'protection' && now - state.lastDamageAt >= 1000) {
        state.lastDamageAt = now;
        for (const member of occupants) if (distance(member.player, stage) > objective.protectRadius) {
          applyDamage(member.player, 'player', Math.max(1, Math.ceil(member.player.maxHp * .1)), dungeon.id, now);
          stand(member); if (member.player.hp <= 0) playerDied(member, now);
          event(member, 'damage', 'Return to the lantern light to escape the shadows.'); dirty();
        }
      }
      if (occupants.length && protectedLight && elapsed >= objective.durationMs && state.wave === objective.waves.length
        && !enemies.some(enemy => enemy.instanceId === dungeon.id && enemy.stageId === stage.id && enemy.alive)) dungeon.cleared.add(stage.id);
    }
  }
  function dungeonEligibility(session, definition) {
    if (!onboardingFeatureUnlocked(session.player, 'dungeon')) return 'Every party member must complete their beginner journey before entering a dungeon.';
    if (definition.storyQuestId && !Object.hasOwn(session.player.storyQuests.active, definition.storyQuestId)) return 'Every adventurer must have the chamber’s story quest active.';
    if (session.player.level < definition.minLevel) return `${definition.name} requires level ${definition.minLevel} for every adventurer.`;
    if (definition.id === 'rootvault' && !session.player.rootvaultUnlocked) return 'Defeat the Rootvault gate guardian together. Every adventurer must earn entry.';
    return null;
  }
  function enterDungeon(session, dungeonId = 'rootvault', individual = false) {
    const definition = getDungeon(dungeonId);
    if (!definition) { event(session, 'info', 'Choose an available dungeon.'); return; }
    const party = partyOf(session.player.id);
    const retainedRuns = [...dungeons.values()].filter(run => !run.dream && (!run.emptySince || Date.now() - run.emptySince < 10 * 60 * 1000));
    const existing = retainedRuns.find(run => party && run.partyId === party.id || !run.abandoned?.has(session.player.id) && run.roster?.some(member => member.id === session.player.id));
    if (existing?.completed && existing.finishedDepartures?.has(session.player.id)) {
      event(session, 'info', 'Wait for the remaining adventurers to leave the completed dungeon before starting a new run.'); return;
    }
    if (existing && existing.kind !== definition.id) { event(session, 'info', 'Finish your party’s current dungeon before opening another.'); return; }
    if (existing && (!existing.roster.some(member => member.id === session.player.id) || existing.abandoned?.has(session.player.id)
        || party?.members.some(id => existing.abandoned?.has(id) || !existing.roster.some(member => member.id === id)))) {
      event(session, 'info', 'Only the original adventurers can return to this dungeon run. Leave the new party before returning.'); return;
    }
    if (!individual && !existing && party && party.leaderId !== session.player.id) { event(session, 'info', 'Your party leader opens the dungeon.'); return; }
    if (!existing && party && retainedRuns.some(run => party.members.some(id => !run.abandoned?.has(id) && run.roster?.some(member => member.id === id)))) {
      event(session, 'info', 'A party member has a saved dungeon run. They must finish it or wait for it to expire before this party can open another.'); return;
    }
    const members = individual || existing ? [session] : party ? party.members.map(id => sessions.get(id)) : [session];
    const eligibility = members.filter(Boolean).map(member => dungeonEligibility(member, definition)).find(Boolean);
    if (eligibility) { event(session, 'info', eligibility); return; }
    const entrance = definition.entrance;
    if (members.some(s => !liveSession(s) || s.instanceId || s.zeppelin || s.player.hp <= 0 || combatSaveBlocked(s.recordKey)
        || s.player.zone !== entrance.zone || distance(s.player, entrance) > 5 || !canTraverse(s.player, entrance, WORLD_COLLIDERS, WORLD_BOUNDS))) {
      event(session, 'info', `Gather every party member alive beside the ${definition.name} entrance.`); return;
    }
    const dungeon = existing || { id: randomUUID(), kind: definition.id, partyId: party?.id || null, completed: false, wipes: 0, members: [], partySize: party?.members.length || 1,
      spawned: new Set(), cleared: new Set(), activated: new Set(), checkpoint: false, hazards: [], lastHazard: 0,
      startedAt: 0, elapsedMs: 0, kills: 0, roster: (party ? party.members.map(id => sessions.get(id)) : [session]).filter(Boolean).map(s => ({ id: s.player.id, name: s.player.name, className: s.player.appearance.className, level: s.player.level })) };
    if (!existing) { dungeons.set(dungeon.id, dungeon); spawnDungeonStages(dungeon); }
    for (const member of members) {
      cancelTradeFor(member.player.id, 'Trade cancelled because an adventurer entered a dungeon.');
      cancelGathering(member); cancelHits(member, true);
      const p = member.player;
      member.returnPosition = individual ? { x: entrance.x, z: entrance.z + 2, rotation: 0, zone: entrance.zone } : { standingPosition:p.standingPosition, x: p.x, z: p.z, rotation: p.rotation, zone: p.zone };
      dungeon.members.push(p.id); member.blockedDungeonPortal = null;
      delete dungeon.emptySince; dungeon.finishedDepartures?.delete(p.id);
      if (hasGmRole(member)) dungeon.unrankedReason = 'A game master participated in this run.';
      if (!dungeon.roster.some(entry => entry.id === p.id)) dungeon.unrankedReason ||= 'The party changed after entry.';
      member.instanceId = dungeon.id; Object.assign(p, dungeon.checkpoint ? dungeonCheckpoint(dungeon.kind) : DUNGEON_START); p.zone = 'hollow'; p.rotation = Math.PI; resetJump(member);
      member.lastMove = Date.now(); member.lifeStartedAt = Date.now(); member.moveBudget = .8 / WALK_SPEED;
      event(member, 'info', `${existing ? 'Resumed' : 'Entered'} ${definition.name}. Progress stays on this realm for 10 minutes after everyone leaves. Return through its entrance to resume at your checkpoint.`);
      correction(member, `Entered ${definition.name}.`); send(member.socket, snapshot(member));
    }
    dirty(); return true;
  }
  function startDungeonTimer(dungeon, now) {
    if (dungeon.dream || dungeon.completed || dungeon.startedAt) return;
    dungeon.startedAt = now;
    if (dungeon.roster.length !== dungeon.partySize || dungeon.roster.some(member => !dungeon.members.includes(member.id)))
      dungeon.unrankedReason ||= 'The whole party must enter before the timer starts.';
  }
  function canSummon(from, target, definition) {
    const party = from && partyOf(from.player.id), landing = { x: definition.summonStone.x, z: definition.summonStone.z + 2 };
    return from !== target && !!party && party.members.includes(target?.player.id) && !ignores(target, from.player.id)
      && [from, target].every(s => liveSession(s) && s.player.hp > 0 && !s.instanceId && !s.zeppelin && !s.casting && !inCombat(s)
        && !committingAccounts.has(s.recordKey) && !dungeonEligibility(s, definition))
      && from.player.zone === definition.entrance.zone && distance(from.player, definition.summonStone) <= 3
      && !waterAt(landing.x, landing.z) && canTraverse(landing, landing, WORLD_COLLIDERS, WORLD_BOUNDS);
  }
  function summonPartyMember(session, dungeonId, targetId) {
    const definition = getDungeon(dungeonId), target = typeof targetId === 'string' && sessions.get(targetId);
    if (!definition || !target || !canSummon(session, target, definition)) { event(session, 'info', 'Use the summon stone with a living party member who meets the dungeon level, outside combat and other dungeons.'); return; }
    if (Date.now() - (session.lastDungeonSummon || 0) < 1000) return;
    session.lastDungeonSummon = Date.now();
    if (dungeonSummons.get(targetId)?.expiresAt > Date.now()) { event(session, 'info', 'That adventurer already has a summon invitation.'); return; }
    const summon = { id: randomUUID(), from: session, target, definition, expiresAt: Date.now() + 60000 };
    dungeonSummons.set(targetId, summon);
    event(session, 'info', `Summon offered to ${target.player.name}.`); send(target.socket, snapshot(target));
  }
  function respondDungeonSummon(session, summonId, accept) {
    const summon = dungeonSummons.get(session.player.id);
    if (typeof summonId !== 'string' || typeof accept !== 'boolean' || !summon || summon.id !== summonId) { event(session, 'info', 'That summon invitation is unavailable.'); return; }
    dungeonSummons.delete(session.player.id);
    if (!accept) { if (liveSession(summon.from)) event(summon.from, 'info', `${session.player.name} declined the summon.`); send(session.socket, snapshot(session)); return; }
    if (summon.expiresAt <= Date.now() || summon.target !== session || !canSummon(summon.from, session, summon.definition)) {
      event(session, 'info', 'The summon is no longer available. Your party must remain eligible and the summoner must stay by the stone.'); send(session.socket, snapshot(session)); return;
    }
    cancelTradeFor(session.player.id, 'Trade cancelled because an adventurer accepted a summon.');
    cancelGathering(session); cancelHits(session);
    Object.assign(session.player, { x: summon.definition.summonStone.x, z: summon.definition.summonStone.z + 2, zone: summon.definition.entrance.zone, rotation: Math.PI });
    resetJump(session); session.lastMove = Date.now(); session.lifeStartedAt = Date.now(); session.moveBudget = .8 / WALK_SPEED;
    correction(session, `Summoned to ${summon.definition.name}.`); send(session.socket, snapshot(session)); dirty();
  }
  function dungeonInteract(session, targetId, automatic = false) {
    const dungeon = dungeons.get(session.instanceId), layout = dungeon && dungeonLayout(dungeon.kind);
    const portal = !automatic && typeof targetId === 'string' && layout?.portals.find(item => item.id === targetId);
    if (portal) {
      const now = Date.now(), colliders = dungeonColliders(dungeon.cleared, dungeon.activated, dungeon.kind), bounds = dungeonBounds(dungeon.kind);
      if (!liveSession(session, now) || session.player.hp <= 0 || !physicalReach(session, portal, 3) || !canTraverse(session.player, portal, colliders, bounds)) { event(session, 'info', 'Stand beside the room portal to use it.'); return; }
      if (!dungeonRoomPortalOpen(portal, dungeon.cleared, dungeon.activated)) { event(session, 'info', 'This portal is sealed. Defeat its guardians and awaken any required rune seals.'); return; }
      if (dungeon.dream && now >= dungeon.dream.endsAt) { event(session, 'info', 'The dream is ending.'); return; }
      if (!canTraverse(portal.destination, portal.destination, colliders, bounds)) { event(session, 'info', 'The destination portal is unavailable.'); return; }
      startDungeonTimer(dungeon, now);
      cancelTradeFor(session.player.id, 'Trade cancelled because an adventurer changed rooms.');
      cancelGathering(session); cancelHits(session, true);
      Object.assign(session.player, portal.destination); session.player.rotation = Math.PI;
      resetJump(session); session.jump.sequence++;
      session.lastMove = now; session.lifeStartedAt = now; session.moveBudget = 0; session.dungeonPortalUntil = now + 1000;
      correction(session, portal.label); send(session.socket, snapshot(session)); dirty(); return;
    }
    const object = typeof targetId === 'string' && layout?.objects.find(item => item.id === targetId);
    if (automatic && (!object || object.kind !== 'chest' || !session.petLoot || distance(session.petLoot, object) > .5)) return;
    if (!dungeon || !object || !physicalReach(session, object, automatic ? PET_LOOT_RADIUS : 3) || !canTraverse(session.player, object, dungeonColliders(dungeon.cleared, dungeon.activated, dungeon.kind), dungeonBounds(dungeon.kind))) { event(session, 'info', 'Stand beside a dungeon object to use it.'); return; }
    if (!liveSession(session) || session.player.hp <= 0 || dungeon.activated.has(object.id) && !(getDungeon(dungeon.kind).storyQuestId && object.kind === 'chest') || !dungeon.cleared.has(object.stageId) || !(object.requires ?? []).every(id => dungeon.activated.has(id))) { event(session, 'info', 'Defeat the nearby guardians before using this object.'); return; }
    if(dungeon.dream && Date.now()>=dungeon.dream.endsAt) { event(session,'info','The dream is ending.'); return; }
    if (getDungeon(dungeon.kind).storyQuestId && object.kind === 'chest') {
      // A party member with full bags can retry their personal treasure even after the room is open.
      for (const id of dungeon.members) {
        const member = sessions.get(id); if (member?.instanceId !== dungeon.id || member.player.storyQuests.treasures?.includes(object.id)) continue;
        if (committingAccounts.has(member.recordKey)) { event(member, 'info', 'Finish your current transaction, then open this treasure again.'); continue; }
        const carriedItems = { ...member.player.carriedItems, 'ancient-coin': (member.player.carriedItems['ancient-coin'] ?? 0) + 1 };
        if (!Number.isSafeInteger(carriedItems['ancient-coin']) || !bagCanFit(member.player, { carriedItems })) { event(member, 'info', 'Make room for the chamber treasure, then open it again.'); continue; }
        member.player.carriedItems = carriedItems;
        (member.player.storyQuests.treasures ||= []).push(object.id);
        event(member, 'reward', `${object.label} · +1 Ancient coin`, true); dirty();
      }
    }
    stand(session);
    dungeon.activated.add(object.id);
    if (object.kind === 'checkpoint') {
      dungeon.checkpoint = true;
      for (const id of dungeon.members) {
        const s = sessions.get(id); if (s?.instanceId !== dungeon.id) continue;
        restoreHealth(s, s.player.maxHp);
        event(s, 'info', 'Sanctuary secured. Your party is healed, and fallen adventurers now return here.');
      }
    } else if (object.kind === 'chest' && !getDungeon(dungeon.kind).storyQuestId) {
      for (const id of dungeon.members) {
        const s = sessions.get(id); if (s?.instanceId !== dungeon.id) continue;
        if (dungeon.kind === 'emberfall' && object.id === 'crossing-east-branch-cache') storyQuestProgress(s.player.storyQuests, { kind: 'interact', target: 'story-foundry-ledger', scope: 'dungeon', dungeonId: 'emberfall' });
        const dropId = randomUUID(), rolls = lootTrace.active(id) ? [] : null;
        lootDrops.set(dropId, { id: dropId, enemyId: `${dungeon.id}-${object.id}`, sourceObjectId: object.id, ownerId: id, zone: 'hollow', instanceId: dungeon.id,
          kind: 'briar-sentinel', name: `${object.label} contents`, x: object.x, z: object.z, gold: goldSource(dungeon.dream ? 10 : 18 + (getDungeon(dungeon.kind).minLevel - 10) * 3, 'cache', economyVersion >= 1), relic: dungeon.dream ? 0 : 1,
          items: dungeon.dream ? [{id:'item:dream-keepsake',kind:'item',itemId:dungeon.dream.kind==='nightmare'?'nightmare-shard':'dream-petal',quantity:1,quality:'rare'}] : rollDungeonCacheLoot(isThemedDungeonLoot(dungeon.kind) ? dungeonStages(dungeon.kind).find(stage => stage.id === object.stageId).level : getDungeon(dungeon.kind).maxLevel, s.player, Math.random, { themed: isThemedDungeonLoot(dungeon.kind), reservedGear: reservedLootGear(s.player), trace: rolls ? detail => rolls.push(detail) : undefined }), expiresAt: dungeon.dream?.endsAt || Date.now() + 300000 });
        if (rolls) lootTrace.write(id, 'cache_generated', { dropId, sourceObjectId: object.id, rolls, items: lootRows(lootDrops.get(dropId)) });
        event(s, 'reward', `${object.label} opened. Collect your personal treasure.`);
      }
    } else {
      for (const id of dungeon.members) { const s = sessions.get(id); if (s?.instanceId === dungeon.id) event(s, 'info', `${object.label} awakened.`); }
      spawnDungeonStages(dungeon);
    }
    dirty();
  }
  function advanceDungeons(now) {
    for (const dungeon of dungeons.values()) {
      if(dungeon.dream){
        for(const id of [...dungeon.members]) { const s=sessions.get(id); if(s?.instanceId!==dungeon.id)continue;
          if(now>=dungeon.dream.endsAt || s.player.hp<=0){leaveDungeon(s);correction(s,'You wake safely in your bed.');event(s,'info','The dream fades. Your collected keepsakes remain.');send(s.socket,snapshot(s));}
        }
        continue;
      }
      const members = dungeon.members.map(id => sessions.get(id)).filter(s => s?.instanceId === dungeon.id);
      if (!members.length) {
        const finished = dungeon.completed && dungeon.results && [...dungeon.results.keys()].every(id => dungeon.finishedDepartures?.has(id) || dungeon.abandoned?.has(id));
        if (!finished && dungeon.emptySince && now - dungeon.emptySince < 10 * 60 * 1000) continue;
        removeDungeonEntities(dungeon.id); dungeons.delete(dungeon.id); continue;
      }
      if (!dungeon.completed) {
        if (!dungeon.startedAt && dungeonLayout(dungeon.kind).rooms.some(room => room.id !== 'preparation'
          && members.some(s => Math.abs(s.player.x - room.x) < room.width / 2 && Math.abs(s.player.z - room.z) < room.depth / 2))) startDungeonTimer(dungeon, now);
        if (dungeon.startedAt) dungeon.elapsedMs = Math.max(dungeon.elapsedMs, now - dungeon.startedAt);
      }
      if (!dungeon.completed && members.every(s => s.player.hp <= 0)) {
        if (members.some(s => now - (s.player.diedAt || 0) < DEATH_ANIMATION_MS)) continue;
        removeDungeonEntities(dungeon.id); dungeon.wipes++; dungeon.hazards = []; dungeon.storyObjectives = new Map(); dungeon.lastHazard = Date.now();
        const secured = dungeon.checkpoint ? dungeonLayout(dungeon.kind).checkpointStages.filter(id => dungeon.cleared.has(id)) : [];
        dungeon.cleared = new Set(secured); dungeon.spawned = new Set(secured);
        // Opened caches remain spent even when their encounter has to be repeated.
        if (!dungeon.checkpoint) for (const object of dungeonLayout(dungeon.kind).objects) if (object.kind !== 'chest') dungeon.activated.delete(object.id);
        for (const s of members) {
          cancelHits(s); cancelGathering(s); s.player.hp = s.player.maxHp; s.player.diedAt = 0; Object.assign(s.player, dungeon.checkpoint ? dungeonCheckpoint(dungeon.kind) : DUNGEON_START);
          resetJump(s); s.lifeStartedAt = Date.now(); s.lastMove = Date.now(); s.moveBudget = .8 / WALK_SPEED; correction(s, dungeon.checkpoint ? 'The party returns to the sanctuary checkpoint.' : 'The party has fallen. The dungeon resets.');
        }
        spawnDungeonStages(dungeon); dirty(); continue;
      }
      advanceStoryChamber(dungeon, members, now);
      for (const stage of dungeonStages(dungeon.kind)) if (!stage.storyObjective && dungeon.spawned.has(stage.id) && !dungeon.cleared.has(stage.id)
          && (stage.id === 'throne' && !getDungeon(dungeon.kind).storyQuestId
            ? enemies.some(e => e.instanceId === dungeon.id && e.stageId === stage.id && e.dungeonBoss && !e.alive)
            : !enemies.some(e => e.instanceId === dungeon.id && e.stageId === stage.id && e.alive))) dungeon.cleared.add(stage.id);
      spawnDungeonStages(dungeon);
      if (dungeon.completed || !dungeon.cleared.has('throne')) continue;
      dungeon.completed = true; dungeon.hazards = []; dungeon.results = new Map();
      for (const enemy of enemies) if (enemy.instanceId === dungeon.id && enemy.alive && !enemy.dungeonOptional) {
        enemy.dungeonCleared = true; enemy.attack = null; enemy.target = null; enemy.threat.clear();
      }
      const definition = getDungeon(dungeon.kind), finalStage = dungeonStages(dungeon.kind).find(stage => stage.id === 'throne');
      const boss = finalStage.enemies.find(enemy => enemy.boss) || finalStage.enemies[0];
      if (definition.storyQuestId) {
        for (const member of members) {
          storyQuestProgress(member.player.storyQuests, { kind: 'dungeon', target: dungeon.kind, scope: 'dungeon', dungeonId: dungeon.kind });
          event(member, 'reward', `${definition.name} cleared. Return to your quest giver for the story reward.`, true);
        }
        dirty(); continue;
      }
      if (!dungeon.startedAt || dungeon.roster.length !== members.length || dungeon.roster.some(member => !members.some(s => s.player.id === member.id)))
        dungeon.unrankedReason ||= 'The whole original party must finish the run.';
      if (!dungeon.unrankedReason) {
        pendingDungeonRecords.set(dungeon.id, { dungeon, record: { id: dungeon.id, dungeonId: dungeon.kind, partySize: dungeon.partySize,
          durationMs: Math.max(1, dungeon.elapsedMs), kills: dungeon.kills, wipes: dungeon.wipes, completedAt: now, realmId, members: dungeon.roster } });
      }
      for (const s of members) {
        if (dungeon.kind === 'rootvault') contractProgress(s.player.contracts, 'dungeon', 'root-vault');
        storyQuestProgress(s.player.storyQuests, { kind: 'dungeon', target: dungeon.kind, scope: 'dungeon', dungeonId: dungeon.kind });
        s.player.achievements.dungeons[dungeon.kind] = Math.min(Number.MAX_SAFE_INTEGER, (s.player.achievements.dungeons[dungeon.kind] || 0) + 1);
        const completionXp = addXp(s, definition.completionXp);
        const items = rollDungeonCacheLoot(finalStage.level, s.player, Math.random, { themed: isThemedDungeonLoot(dungeon.kind), tier: isThemedDungeonLoot(dungeon.kind) ? 'final' : 'cache', reservedGear: reservedLootGear(s.player) });
        items.find(item => item.itemId === 'relic').quantity += 2 + Math.floor((definition.minLevel - 10) / 5);
        const id = randomUUID();
        lootDrops.set(id, { id, enemyId: `${dungeon.id}-completion`, ownerId: s.player.id, zone: 'hollow', instanceId: dungeon.id,
          kind: boss.kind, name: `${definition.name} clear rewards`, x: s.player.x, z: s.player.z, gold: 0, relic: 0, items, expiresAt: Number.MAX_SAFE_INTEGER });
        dungeon.results.set(s.player.id, { durationMs: dungeon.elapsedMs, kills: dungeon.kills, wipes: dungeon.wipes,
          partySize: dungeon.partySize, xp: completionXp, lootId: id, items: structuredClone(items) });
        event(s, 'reward', `${definition.name.replace(/^The /, '')} cleared · +${completionXp} XP. Claim your personal clear rewards in the dungeon results before leaving.`, true);
      }
      dirty();
    }
  }
  function queueDungeonHazards(dungeon, source, plan, now, corpse = false) {
    if (!plan || dungeon.completed && !source.dungeonOptional) return false;
    const colliders = instanceColliders(dungeon.id);
    const specs = plan.hazards.filter(spec => !inDungeonPreparation(spec, dungeon.kind) && canTraverse(source, spec, colliders, dungeonBounds(dungeon.kind)));
    // Admit whole patterns so a busy room never removes the second half of a warning.
    if (!specs.length || dungeon.hazards.length + specs.length > 24) return false;
    for (const { delayMs, damageScale, leap, ...spec } of specs) dungeon.hazards.push({
      ...spec, id: randomUUID(), sourceId: source.id, sourceLevel: source.level, sourceName: source.name, leap, corpse,
      startedAt: now, endsAt: now + delayMs, damage: Math.round(32 * source.damageScale * damageScale),
    });
    if (!corpse) {
      source.lastDungeonSpecial = now; source.dungeonSpecialCount = (source.dungeonSpecialCount || 0) + 1;
      source.dungeonCastUntil = now + Math.max(...specs.map(spec => spec.delayMs)) + 300;
    }
    return true;
  }
  function updateDungeonSpikeTraps(now) {
    for (const dungeon of dungeons.values()) {
      if (dungeon.dream || dungeon.completed) continue;
      const traps = dungeonSpikeTraps(dungeon.kind).map(trap => ({ trap, ...dungeonSpikePhase(trap, now) })).filter(state => state.phase === 'active');
      if (!traps.length) continue;
      for (const id of dungeon.members) {
        const session = sessions.get(id);
        if (!session || session.instanceId !== dungeon.id || !liveSession(session, now) || session.player.hp <= 0 || gmObserver(session) || session.zeppelin || dungeonPreparing(session)) continue;
        if (session.dungeonSpikeHits?.instanceId !== dungeon.id) session.dungeonSpikeHits = { instanceId: dungeon.id, cycles: new Map() };
        const pet = activeCompanion(session, now);
        for (const body of pet?.saved.hp > 0 ? [session.player, pet] : [session.player]) {
          if (session.player.hp <= 0 || inDungeonPreparation(body, dungeon.kind)) continue;
          const companion = body !== session.player;
          for (const { trap, cycle } of traps) {
            const key = `${companion ? 'companion' : 'player'}:${trap.id}`;
            if (!dungeonSpikeContains(trap, body, .3) || session.dungeonSpikeHits.cycles.get(key) === cycle) continue;
            session.dungeonSpikeHits.cycles.set(key, cycle);
            const defense = companion ? combatCompanionStats(pet.saved.level).defense : combatDefense(session, now);
            const maxHp = companion ? combatCompanionStats(pet.saved.level).maxHp : session.player.maxHp;
            const damage = Math.max(1, Math.round(maxHp * DUNGEON_SPIKE_DAMAGE_FRACTION) - defense);
            if (companion) { damageCompanion(session, damage, now); continue; }
            applyDamage(session.player, 'player', damage, dungeon.id, now);
            stand(session);
            if (!session.player.hp) playerDied(session, now);
            event(session, 'damage', session.player.hp ? `Raised spikes hit you for ${damage}.` : 'You fell on the dungeon spikes.'); dirty();
          }
        }
      }
    }
  }
  function updateDungeonHazards(now, resolveOnly = false) {
    for (const dungeon of dungeons.values()) {
      if (dungeon.completed && !dungeonStages(dungeon.kind).some(stage => stage.optional)) { dungeon.hazards = []; continue; }
      const members = dungeon.members.map(id => sessions.get(id)).filter(s => s?.instanceId === dungeon.id && s.player.hp > 0 && !gmObserver(s) && !s.zeppelin && !dungeonPreparing(s));
      const colliders = instanceColliders(dungeon.id);
      dungeon.hazards = dungeon.hazards.filter(hazard => {
        const source = enemies.find(enemy => enemy.id === hazard.sourceId && enemy.instanceId === dungeon.id);
        return source && (!dungeon.completed || source.dungeonOptional) && (hazard.corpse || source.alive && !(source.stunUntil > now));
      });
      const due = dungeon.hazards.filter(hazard => hazard.endsAt <= now);
      dungeon.hazards = dungeon.hazards.filter(hazard => hazard.endsAt > now);
      for (const hazard of due) {
        const source = enemies.find(enemy => enemy.id === hazard.sourceId && enemy.instanceId === dungeon.id);
        // Recheck the locked destination: a closing gate or cover cancels the leap/blast.
        if (!source || inDungeonPreparation(hazard, dungeon.kind) || !canTraverse(source, hazard, colliders, dungeonBounds(dungeon.kind))) continue;
        if (hazard.leap) {
          source.rotation = Math.atan2(hazard.x - source.x, hazard.z - source.z);
          source.x = hazard.x; source.z = hazard.z;
        }
        for (const s of members) {
          if (s.player.hp <= 0 || s.lifeStartedAt > hazard.startedAt) continue;
          const pet = activeCompanion(s, hazard.endsAt);
          for (const body of pet?.saved.hp > 0 ? [s.player, pet] : [s.player]) {
            if (s.player.hp <= 0 || inDungeonPreparation(body, dungeon.kind) || !dungeonHazardContains(hazard, body)
                || !canTraverse(hazard, body, colliders, dungeonBounds(dungeon.kind))) continue;
            const companion = body !== s.player;
            const level = companion ? pet.saved.level : s.player.level;
            const defense = companion ? combatCompanionStats(level).defense : combatDefense(s, hazard.endsAt);
            const damage = Math.max(1, Math.round(hazard.damage * monsterLevelScale(hazard.sourceLevel, level)) - defense);
            if (companion) { damageCompanion(s, damage, hazard.endsAt); continue; }
            applyDamage(s.player, 'player', damage, s.instanceId, hazard.endsAt, source, false, false, false, hazard.kind);
            stand(s);
            if (!s.player.hp) playerDied(s, hazard.endsAt);
            event(s, 'damage', s.player.hp ? `${hazard.label.split(' · ')[0]} hit you for ${damage}.` : `${hazard.sourceName} overwhelms you.`); dirty();
          }
        }
      }
      if (resolveOnly) continue;
      for (const source of enemies) {
        if (source.instanceId !== dungeon.id || !source.alive || dungeon.completed && !source.dungeonOptional || source.stunUntil > now || source.attack || source.dungeonCastUntil > now) continue;
        const targets = members.map(session => ({ session, point: enemyCombatCompanion(source, session, now) || session.player }));
        const target = source.dungeonBoss
          ? targets.filter(t => distance(source, t.point) <= 20 && canTraverse(source, t.point, colliders, dungeonBounds(dungeon.kind))).sort((a, b) => distance(source, a.point) - distance(source, b.point))[0]
          : targets.find(t => t.session === source.target && distance(source, t.point) <= 14 && canTraverse(source, t.point, colliders, dungeonBounds(dungeon.kind)));
        if (!target) continue;
        const plan = dungeonHazardPattern(dungeon.kind, source, target.point, source.dungeonSpecialCount || 0);
        if (!plan || now - (source.lastDungeonSpecial || 0) < plan.cooldownMs) continue;
        queueDungeonHazards(dungeon, source, plan, now);
      }
    }
  }
  function updateDungeonSpikeTraps(now) {
    for (const dungeon of dungeons.values()) {
      if (dungeon.dream || dungeon.completed) continue;
      const traps = dungeonSpikeTraps(dungeon.kind).map(trap => ({ trap, ...dungeonSpikePhase(trap, now) })).filter(state => state.phase === 'active');
      if (!traps.length) continue;
      for (const id of dungeon.members) {
        const session = sessions.get(id);
        if (!session || session.instanceId !== dungeon.id || !liveSession(session, now) || session.player.hp <= 0 || gmObserver(session) || session.zeppelin || dungeonPreparing(session)) continue;
        if (session.dungeonSpikeHits?.instanceId !== dungeon.id) session.dungeonSpikeHits = { instanceId: dungeon.id, cycles: new Map() };
        const pet = activeCompanion(session, now);
        for (const body of pet?.saved.hp > 0 ? [session.player, pet] : [session.player]) {
          if (session.player.hp <= 0 || inDungeonPreparation(body, dungeon.kind)) continue;
          const companion = body !== session.player;
          for (const { trap, cycle } of traps) {
            const key = `${companion ? 'companion' : 'player'}:${trap.id}`;
            if (!dungeonSpikeContains(trap, body, .3) || session.dungeonSpikeHits.cycles.get(key) === cycle) continue;
            session.dungeonSpikeHits.cycles.set(key, cycle);
            const defense = companion ? combatCompanionStats(pet.saved.level).defense : combatDefense(session, now);
            const maxHp = companion ? combatCompanionStats(pet.saved.level).maxHp : session.player.maxHp;
            const damage = Math.max(1, Math.round(maxHp * DUNGEON_SPIKE_DAMAGE_FRACTION) - defense);
            if (companion) { damageCompanion(session, damage, now); continue; }
            applyDamage(session.player, 'player', damage, dungeon.id, now);
            stand(session);
            if (!session.player.hp) playerDied(session, now);
            event(session, 'damage', session.player.hp ? `Raised spikes hit you for ${damage}.` : 'You fell on the dungeon spikes.'); dirty();
          }
        }
      }
    }
  }
  function leaveSession(connection, preserveFlight = true) {
    const session = connection.session;
    if (session) connection.lastWorld = { characterId: session.player.id, zone: session.player.zone,
      instanceId: session.instanceId, dungeon: dungeons.get(session.instanceId)?.kind ?? null };
    connection.session = null;
    if (!session || sessions.get(session.player.id) !== session) return;
    passengers.leave(session);
    const flight = preserveFlight && session.zeppelin;
    leaveZeppelin(session);
    if (flight) session.player.zeppelin = { ...flight };
    if (session.gm.flying) landGm(session);
    session.gmReturnPosition = null;
    session.gm = { invisible: false, tagHidden: false, flying: false };
    cancelTradeFor(session.player.id, 'Trade cancelled because an adventurer left the world.');
    cancelGathering(session);
    cancelHits(session);
    if (session.duel?.settling) Object.assign(session.player, session.returnPosition);
    instantCombat.leave(session);
    if (!raids.detach(session)) leaveDungeon(session, true);
    leaveParty(session.player.id);
    for (const [id, invite] of invitations) if (invite.inviterId === session.player.id || invite.targetId === session.player.id) invitations.delete(id);
    lootTrace.write(session.player.id, 'left_world', {});
    sessions.delete(session.player.id);
    statistics.observe([{ key: session.recordKey, country: session.country }]);
    event(session, 'info', `${session.player.name} left ${getZone(session.player.zone).name}.`);
    dirty();
  }
  function selectCharacter(connection, characterId) {
    if (connection.account.ban) return false;
    const p = typeof characterId === 'string' && connection.account.characters.find(p => p.id === characterId);
    if (!p) return false;
    const entering = connection.session?.player.id !== p.id;
    if (entering) {
      leaveSession(connection);
      const now = Date.now();
      const flight = p.zeppelin;
      delete p.zeppelin;
      if (flight && now >= flight.arrivesAt) Object.assign(p, zeppelinDockPosition(flight.to));
      unstick(p);
      if (p.hp > 0) p.diedAt = 0;
      const previous = activity.get(p.id);
      const session = { ...(previous || { lastAttack: 0, abilityCooldowns: {}, lastChat: 0, lastHeal: 0, lastInteract: 0 }), lastMove: previous?.lastMove ?? now, moveBudget: previous?.moveBudget ?? .8 / WALK_SPEED, travel: previous?.travel || newTravel(), lastTravelAt: previous?.lastTravelAt ?? now, lastSprintAt: previous?.lastSprintAt ?? 0, socket: connection.socket, recordKey: connection.recordKey, country: connection.country, player: p, role: connection.role, nftOwnership: null, nftSummonedPet: null, nftChecking: null, nftAuction: null, nftAuctionChecking: null, nftEpoch: 0, emote: null, autoAttack: null, combatTalents: null, talentChill: null, duel: null, duelResult: null, duelStatus: null, gathering: null, casting: null, shield: null, seated: null, zeppelin: null, instanceId: null, returnPosition: null, gmReturnPosition: null, gm: { invisible: false, tagHidden: false, flying: false }, expiresAt: connection.expiresAt, lifeStartedAt: now, nextSpiritAt: now + 5000 };
      if (session.travel.mount && !hasMount(session, session.travel.mount)) dismount(session);
      resetJump(session); recoverTravel(session, now);
      activity.set(p.id, session);
      connection.session = session;
      sessions.set(p.id, session);
      raids.reattach(session);
      statistics.observe();
      checkAchievements(session, false);
      if (flight && now >= flight.arrivesAt) visitAchievementZone(session);
      if (flight && now < flight.arrivesAt) { session.zeppelin = flight; advanceJump(session, now); }
      if (flight) dirty();
    }
    send(connection.socket, { type: 'welcome', id: p.id, token: connection.guestToken, player: publicPlayer(connection.session), chatTranslation: translator.enabled, lootResults: true, lootQueueLimit, merchantSales: true, hotbarPageSize: HOTBAR_PAGE_SIZE });
    send(connection.socket, snapshot(connection.session));
    sendFriends(connection.session);
    if (entering) void refreshNftOwnership(connection.session);
    if (entering) event(connection.session, 'info', `${p.name} arrived in ${getZone(p.zone).name}.`);
    return true;
  }
  const arenaMode = session => session?.duel?.mode === 'arena';
  const arenaWallet = session => session.player.auctionWallet?.toLowerCase();
  const arenaWagerNative = session => accountConnections.get(session.recordKey)?.nativePlatform === 'ios';
  function arenaWagerReady(invite) {
    return invite.members.every(({ session }, index) => !arenaWagerNative(session) && arenaWallet(session)
      && (!invite.order || arenaWallet(session) === [invite.order.playerA, invite.order.playerB][index].toLowerCase()))
      && new Set(invite.members.map(({ session }) => session.recordKey)).size === 2
      && new Set(invite.members.map(({ session }) => arenaWallet(session))).size === 2;
  }
  function writeArenaWagers(matchId, members, prepare) {
    if (arenaWagerWork.has(matchId)) return arenaWagerWork.get(matchId);
    const transaction = {}, previous = [...new Set(members.map(({ session }) => committingAccounts.get(session.recordKey)).filter(Boolean))];
    for (const { session } of members) committingAccounts.set(session.recordKey, transaction);
    transaction.completion = (async () => {
      await Promise.all(previous.map(action => action.completion));
      const changes = await prepare();
      if (!changes) return false;
      await save(new Map(members.map(({ session }, i) => [session.player.id, { arenaWagers: changes[i] }])), () => {
        members.forEach(({ session }, i) => { session.player.arenaWagers = changes[i]; });
      });
      return true;
    })().finally(() => {
      for (const { session } of members) if (committingAccounts.get(session.recordKey) === transaction) committingAccounts.delete(session.recordKey);
      arenaWagerWork.delete(matchId);
    });
    arenaWagerWork.set(matchId, transaction.completion);
    return transaction.completion;
  }
  async function sendArenaWagers(session, reason, open = false) {
    if (!liveSession(session) || arenaWagerNative(session)) return;
    const status = await wagerChain.status();
    const wagers = await Promise.all(session.player.arenaWagers.map(async entry => {
      try { const { funded, closed } = await wagerChain.verifyMatch(entry.order); return { ...entry, funded, closed }; }
      catch { return { ...entry, funded: null, closed: null }; }
    }));
    if (liveSession(session)) send(session.socket, { type: 'arenaWagers', status, wallet: session.player.auctionWallet || null, wagers, reason, open });
  }
  async function handleArenaWager(session, connection, message) {
    const fail = text => event(session, 'info', text, false, message.type);
    if (arenaWagerNative(session)) { fail('MOSS arena wagers are unavailable in the iOS app.'); return; }
    const fields = arenaWagerFields[message.type];
    if (Object.keys(message).length !== fields.length || !fields.every(field => Object.hasOwn(message, field))) { fail('Invalid arena wager request.'); return; }
    if (session.arenaWalletBusy || Date.now() - (session.lastArenaWalletAction || 0) < 750) { fail('Wait a moment before checking the wager again.'); return; }
    session.lastArenaWalletAction = Date.now(); session.arenaWalletBusy = true;
    try {
      if (message.type === 'arenaWalletChallenge' || message.type === 'arenaWalletBind') {
        if (session.duel || session.instanceId) { fail('Finish your match before changing wallets.'); return; }
        if (message.type === 'arenaWalletChallenge') {
          send(session.socket, { type: 'arenaWalletChallenge', ...chain.challenge(`arena:${session.player.id}`, message.wallet, connection.origin) }); return;
        }
        const p = session.player, wallet = chain.verifyWallet(`arena:${p.id}`, message.signature, connection.origin);
        const busy = p.arenaWagers.length || specialistNftLocked(p) || p.storeOrders.some(order => !['delivered', 'expired'].includes(order.status))
          || p.nftOrders.some(order => order.status === 'quoted') || auctionOwners().some(owner => owner.player.auctions.some(listing => listing.currency !== 'gold' && (listing.sellerId === p.id || listing.reservation?.buyerId === p.id)));
        if (busy && p.auctionWallet !== wallet) { fail('Finish pending wagers and wallet purchases before changing wallets.'); return; }
        if (!await commitStore(session, () => ({ auctionWallet: wallet }))) { fail('Your wallet could not be saved. Try again.'); return; }
        invalidateNftOwnership(session);
        await sendArenaWagers(session, 'Wallet connected.', true); return;
      }
      if (message.type === 'arenaWagerCheck') {
        const entry = session.player.arenaWagers.find(entry => entry.order.matchId === message.matchId);
        if (!entry) { fail('That wager does not belong to this character.'); return; }
        const state = await wagerChain.verifyMatch(entry.order);
        if (session.duel?.order?.matchId !== entry.order.matchId
          && (state.closed || state.funded === 0 && BigInt(state.block.timestamp) > BigInt(entry.order.fundingDeadline))) {
          // Soft closure can reverse. Keep recovery authorizations until terminal state is finalized.
          const final = await wagerChain.verifyMatch(entry.order, { finalized: true }).catch(() => null);
          if (final && session.duel?.order?.matchId !== entry.order.matchId
            && (final.closed || final.funded === 0 && BigInt(final.block.timestamp) > BigInt(entry.order.fundingDeadline))) {
            await commitStore(session, p => ({ arenaWagers: p.arenaWagers.filter(row => row.order.matchId !== entry.order.matchId) }));
            const invite = [...arenaInvitations.values()].find(invite => invite.order?.matchId === entry.order.matchId);
            if (invite) cancelArenaInvitation(invite, final.closed ? 'MOSS wager closed on-chain.' : 'MOSS funding expired without a deposit. No MOSS was spent.');
          }
        }
        const invite = [...arenaInvitations.values()].find(invite => invite.order?.matchId === entry.order.matchId);
        if (invite) await checkArenaFunding(invite);
      }
      await sendArenaWagers(session, undefined, message.type === 'arenaWagerOpen');
    } catch (error) { fail(error.message || 'MOSS arena status is unavailable. Your saved wager is kept.'); }
    finally { session.arenaWalletBusy = false; }
  }
  async function prepareArenaFunding(invite) {
    invite.preparing = true;
    try {
      const matchId = chainIdHash(`mossvale-arena:${invite.id}`);
      const saved = await writeArenaWagers(matchId, invite.members, async () => {
        const fundingDeadline = Math.floor(Date.now() / 1000) + 600;
        const order = await wagerChain.prepareMatch({ matchId, playerA: invite.members[0].session.player.auctionWallet,
          playerB: invite.members[1].session.player.auctionWallet, stakeWei: arenaWagerAmount(invite.wagerMoss).toString(), fundingDeadline, refundAfter: fundingDeadline + 3000 });
        if (closing || arenaInvitations.get(invite.id) !== invite || !arenaWagerReady(invite)
          || invite.members.some(({ session }) => !liveSession(session) || session.duel || session.instanceId)) return false;
        invite.order = order;
        return invite.members.map(({ session }, index) => [...session.player.arenaWagers,
          { order, opponentId: invite.members[1 - index].session.player.id, opponentName: invite.members[1 - index].session.player.name }]);
      });
      if (!saved) { cancelArenaInvitation(invite, 'MOSS wager cancelled before funding.'); return; }
      // Cover the latest-head freshness window plus polling after the deposit deadline.
      invite.expiresAt = (invite.order.fundingDeadline + 150) * 1000;
      invite.funding = true;
      for (const { session } of invite.members) {
        send(session.socket, snapshot(session));
        void sendArenaWagers(session, 'Both players accepted. Fund your stake to enter the arena.', true).catch(() => {});
      }
    } catch (error) { console.error('Arena funding preparation failed:', error.message); cancelArenaInvitation(invite, 'MOSS wager could not be saved. No payment was requested.'); }
    finally { invite.preparing = false; }
  }
  async function checkArenaFunding(invite) {
    if (invite.checking || !invite.funding || arenaInvitations.get(invite.id) !== invite) return;
    invite.checking = true; invite.nextCheck = Date.now() + 5000;
    try {
      const state = await wagerChain.verifyMatch(invite.order), now = Date.now();
      if (arenaInvitations.get(invite.id) !== invite || closing) return;
      if (state.closed) { cancelArenaInvitation(invite, 'MOSS wager was closed on-chain.'); return; }
      if (state.funded !== 3) return;
      if (!arenaInvitationValid(invite, now) || !arenaWagerReady(invite) || now + 600000 >= invite.order.refundAfter * 1000) {
        cancelArenaInvitation(invite, 'MOSS match cancelled because a fighter is unavailable. Use MOSS wagers to recover funded stakes at the refund deadline.'); return;
      }
      startArena(invite, now);
    } catch { /* Keep the saved wager; unknown funding never starts combat. */ }
    finally { invite.checking = false; }
  }
  async function checkActiveArenaFunding(duel) {
    if (duel.checkingFunding || duel.settling) return;
    duel.checkingFunding = true; duel.nextFundingCheck = Date.now() + 5000;
    try {
      const state = await wagerChain.verifyMatch(duel.order);
      if (closing || arenaMatches.get(duel.instanceId) !== duel || duel.settling
        || duel.members[0].session.duel !== duel) return;
      if (state.closed || state.funded !== 3)
        endDuel(duel.members[0].session, 'MOSS wager cancelled because its funding changed.', null);
    } catch { /* An RPC failure is not proof of a reverted payment. */ }
    finally { duel.checkingFunding = false; }
  }
  const duelMember = session => session?.duel?.members.find(member => member.session === session);
  const duelOpponent = session => {
    const member = duelMember(session);
    const opponents = session?.duel?.members.filter(other => other.team !== member?.team) || [];
    return (opponents.find(other => !other.eliminated) || opponents[0])?.session;
  };
  const arenaParticipantValid = (session, now) => liveSession(session, now) && session.player.hp > 0
    && arenaMode(session) && session.instanceId === session.duel.instanceId && !session.zeppelin && !gmObserver(session) && isInArena(session.player);
  const arenaFighter = (session, now = Date.now()) => arenaMode(session) && session.duel.phase === 'active'
    && !session.duel.settling && now >= session.duel.startsAt && now < session.duel.endsAt && !duelMember(session)?.eliminated && duelValid(session, now);
  function publicDuel(session) {
    const duel = session.duel, opponent = duelOpponent(session);
    const base = { id: duel.id, opponentId: opponent?.player.id || '', opponentName: opponent?.player.name || '' };
    return duel.mode === 'duel' ? base : { ...base, instanceId: duel.instanceId, size: duel.size, rated: duel.rated, phase: duel.phase, startsAt: duel.startsAt, endsAt: duel.endsAt,
      ...(duel.order ? { wagerMoss: duel.wagerMoss, wagerMatchId: duel.order.matchId, ...(duel.settling ? { settling: true } : {}) } : {}),
      members: duel.members.map(({ session: member, team, eliminated }) => ({ id: member.player.id, name: member.player.name, team, hp: member.player.hp, maxHp: member.player.maxHp, eliminated })) };
  }
  function publicArenaInvitation(invite, session) {
    return { id: invite.id, inviterId: invite.inviterId, inviterName: invite.inviterName, expiresAt: invite.expiresAt, size: invite.size,
      ...(invite.wagerMoss ? { wagerMoss: invite.wagerMoss, funding: !!invite.funding, wagerMatchId: invite.order?.matchId } : {}),
      rated: !!invite.queued, ...(invite.queued ? { queued: true, acceptReason: arenaQueueAcceptReason(session) } : {}),
      members: invite.members.map(({ session, team, accepted }) => ({ id: session.player.id, name: session.player.name, team, accepted })) };
  }
  function cancelArenaInvitation(invite, reason) {
    arenaInvitations.delete(invite.id);
    if (invite.order) reason += ' Check MOSS wagers for funded stakes and refund deadlines.';
    for (const { session } of invite.members) if (liveSession(session)) {
      event(session, 'info', reason); send(session.socket, snapshot(session));
    }
  }
  function removeDuelInvitations(id, keepQueue = false) {
    if (!keepQueue) for (const session of arenaQueue.keys()) if (session.player.id === id) removeArenaQueue(session);
    for (const [key, invite] of duelInvitations) if (invite.inviterId === id || invite.targetId === id) duelInvitations.delete(key);
    for (const invite of arenaInvitations.values()) if ((!keepQueue || !invite.queued) && invite.members.some(member => member.session.player.id === id))
      cancelArenaInvitation(invite, 'Arena challenge cancelled because a fighter is no longer available.');
  }
  function endDuel(session, reason, winnerTeam = 1 - duelMember(session)?.team) {
    const duel = session.duel;
    if (!duel) return;
    if (duel.settling) return arenaWagerWork.get(duel.order.matchId);
    if (duel.mode === 'arena' && closing) { winnerTeam = null; reason = 'Arena match cancelled because the realm is restarting.'; }
    if (!duel.order) return finishDuel(duel, reason, winnerTeam);
    duel.settling = true;
    for (const { session: member } of duel.members) cancelPlayerCombat(member);
    return writeArenaWagers(duel.order.matchId, duel.members, async () => {
      if (winnerTeam !== null) {
        try {
          const state = await wagerChain.verifyMatch(duel.order);
          if (state.closed || state.funded !== 3) {
            winnerTeam = null; reason = 'MOSS wager cancelled because its funding changed.';
          }
        } catch { /* Preserve the played outcome during outages; the contract still requires both stakes. */ }
      }
      const winner = winnerTeam === null ? ZeroAddress : [duel.order.playerA, duel.order.playerB][winnerTeam];
      const result = await wagerChain.prepareResult(duel.order, winner);
      return duel.members.map(({ session: member }) => member.player.arenaWagers.map(entry => {
        if (entry.order.matchId !== duel.order.matchId) return entry;
        if (entry.result) throw Error('Arena wager already has a saved result.');
        return { ...entry, result };
      }));
    }).then(() => {
      finishDuel(duel, `${reason} Open MOSS wagers to ${winnerTeam === null ? 'return funded stakes without tax' : 'collect the winner payout after 5% tax'}.`, winnerTeam);
      for (const { session: member } of duel.members) void sendArenaWagers(member).catch(() => {});
    }).catch(error => {
      console.error('Arena result save failed:', error.message);
      if (!persistenceFailed) finishDuel(duel, 'MOSS result could not be saved. Recover funded stakes at the refund deadline from MOSS wagers.', null);
    });
  }
  function finishDuel(duel, reason, winnerTeam) {
    delete duel.settling;
    const now = Date.now(), arena = duel.mode === 'arena', awardRating = duel.rated && !closing;
    if (arena) for (const { session: member, team } of duel.members) {
      let ratingChange;
      if (awardRating) {
        const rating = member.player.arenaRatings[duel.size], before = rating.rating;
        const score = winnerTeam === null ? .5 : winnerTeam === team ? 1 : 0;
        rating.rating = Math.max(0, before + arenaRatingDelta(duel.teamRatings[team], duel.teamRatings[1 - team], score));
        rating[score === .5 ? 'draws' : score === 1 ? 'wins' : 'losses']++;
        ratingChange = rating.rating - before;
      }
      member.duelResult = { expiresAt: now + 20000, result: { ...publicDuel(member), phase: 'finished', endsAt: now, winnerTeam, reason, ...(awardRating ? { ratingChange } : {}) } };
    }
    for (const { session: member, returnActivity } of duel.members) {
      member.duel = null; member.shield = null; cancelPlayerCombat(member);
      if (arena) {
        Object.assign(member.player, member.returnPosition);
        member.instanceId = null; member.returnPosition = null;
        Object.assign(member, returnActivity);
        member.lifeStartedAt = now;
        resetJump(member); member.jump.sequence++;
        member.moveBudget = 0; member.lastMove = now;
      }
    }
    if (arena) arenaMatches.delete(duel.instanceId);
    for (const { session: member } of duel.members) {
      event(member, 'info', reason);
      if (liveSession(member)) {
        if (arena) correction(member, 'Returned from the arena.');
        send(member.socket, snapshot(member));
      }
    }
    dirty();
  }
  function arenaRosterValid(match, team) {
    if (match.size === 1) return true;
    const frozen = match.parties[team], party = parties.get(frozen.id);
    return !!party && party.leaderId === frozen.leaderId && party.members.length === frozen.members.length
      && frozen.members.every(id => party.members.includes(id));
  }
  function duelValid(session, now = Date.now()) {
    const duel = session?.duel;
    if (duel?.mode === 'arena') return !duel.settling && arenaMatches.get(duel.instanceId) === duel && duel.members.every(member => member.session.duel === duel
      && arenaParticipantValid(member.session, now) && arenaRosterValid(duel, member.team));
    const opponent = duelOpponent(session);
    return !!opponent && opponent.duel === duel && liveSession(session, now) && liveSession(opponent, now)
      && session.player.hp > 1 && opponent.player.hp > 1 && !session.instanceId && !opponent.instanceId
      && !isInColosseum(session.player) && !isInColosseum(opponent.player)
      && !gmObserver(session) && !gmObserver(opponent) && distance(session.player, opponent.player) <= 40;
  }
  function canStartDuel(a, b, now) {
    return liveSession(a, now) && liveSession(b, now) && a !== b && !a.duel && !b.duel && !a.zeppelin && !b.zeppelin
      && a.player.hp > 1 && b.player.hp > 1 && !a.instanceId && !b.instanceId && !gmObserver(a) && !gmObserver(b)
      && !isInColosseum(a.player) && !isInColosseum(b.player)
      && !committingAccounts.has(a.recordKey) && !committingAccounts.has(b.recordKey) && !playerTrades.has(a.player.id) && !playerTrades.has(b.player.id)
      && distance(a.player, b.player) <= 8 && !waterAt(a.player.x, a.player.z) && !waterAt(b.player.x, b.player.z)
      && canTraverse(a.player, b.player, WORLD_COLLIDERS, WORLD_BOUNDS);
  }
  function canStartArena(session, now) {
    return liveSession(session, now) && session.player.hp > 1 && !session.duel && !session.instanceId && !session.zeppelin && !gmObserver(session)
      && session.jump.grounded && !session.casting && !inCombat(session)
      && !committingAccounts.has(session.recordKey) && !playerTrades.has(session.player.id)
      && !swimming(session);
  }
  function arenaInvitationValid(invite, now) {
    return invite.expiresAt > now && invite.members.every(member => (invite.queued ? canQueueArena(member.session, now, invite.size) : canStartArena(member.session, now))
      && arenaRosterValid(invite, member.team) && invite.members.every(other => member === other
        || canSee(member.session, other.session) && !ignores(member.session, other.session.player.id)));
  }
  function canQueueArena(session, now, size = 1) {
    if (!liveSession(session, now) || session.player.hp <= 1 || session.duel || gmObserver(session)) return false;
    const party = partyOf(session.player.id);
    return size === 1 ? !party : party?.members.length === size;
  }
  function arenaQueueAcceptReason(session) {
    if (inCombat(session) || session.autoAttack) return 'Leave combat before accepting.';
    if (session.instanceId) return 'Leave the dungeon before accepting.';
    if (session.zeppelin) return 'Wait until the zeppelin lands before accepting.';
    if (session.casting || committingAccounts.has(session.recordKey) || playerTrades.has(session.player.id)) return 'Finish your current action before accepting.';
    return '';
  }
  function hasPendingChallenge(session, now) {
    return [...arenaInvitations.values()].some(invite => invite.expiresAt > now && invite.members.some(member => member.session === session))
      || [...duelInvitations.values()].some(invite => invite.expiresAt > now && [invite.inviterId, invite.targetId].includes(session.player.id));
  }
  function removeArenaQueue(session, reason) {
    const entry = arenaQueue.get(session);
    if (!entry) return false;
    for (const member of entry.members) arenaQueue.delete(member);
    if (reason) for (const member of entry.members) if (liveSession(member)) {
      event(member, 'info', reason); send(member.socket, snapshot(member));
    }
    return true;
  }
  function updateArenaQueue(now) {
    for (const entry of new Set(arenaQueue.values())) if (!arenaRosterValid(entry, 0)
        || entry.members.some(member => !canQueueArena(member, now, entry.size) || hasPendingChallenge(member, now))) {
      removeArenaQueue(entry.members[0], 'Left the arena queue because a fighter or party is no longer available.');
    }
    for (const entry of new Set(arenaQueue.values())) {
      if (!arenaQueue.has(entry.members[0])) continue;
      // ponytail: realm-local queue scan; index by rating if queue populations make this costly.
      const opponent = [...new Set(arenaQueue.values())].filter(other => other !== entry && other.size === entry.size
        && Math.abs(entry.rating - other.rating) <= 200 + Math.floor((now - Math.min(entry.joinedAt, other.joinedAt)) / 30000) * 100
        && entry.members.every(member => other.members.every(target => member.recordKey !== target.recordKey
          && canSee(member, target) && canSee(target, member) && !ignores(member, target.player.id) && !ignores(target, member.player.id))))
        .sort((a, b) => Math.abs(entry.rating - a.rating) - Math.abs(entry.rating - b.rating) || a.joinedAt - b.joinedAt)[0];
      if (!opponent) continue;
      removeArenaQueue(entry.members[0]); removeArenaQueue(opponent.members[0]);
      const captain = entry.members[0].player;
      const invite = { id: randomUUID(), inviterId: captain.id, inviterName: captain.name, size: entry.size, queued: true,
        expiresAt: now + 30000, parties: [...entry.parties, ...opponent.parties],
        members: [entry, opponent].flatMap((teamEntry, team) => teamEntry.members.map(session => ({ session, team, accepted: false }))) };
      arenaInvitations.set(invite.id, invite);
      for (const { session: member } of invite.members) {
        event(member, 'info', `${entry.size}v${entry.size} opponents found. Every fighter must accept the arena ready check.`); send(member.socket, snapshot(member));
      }
    }
  }
  function arenaPartyChanged(party) {
    for (const entry of new Set(arenaQueue.values())) if (entry.parties.some(frozen => frozen.id === party.id))
      removeArenaQueue(entry.members[0], 'Left the arena queue because the party changed.');
    for (const invite of arenaInvitations.values()) if (invite.size > 1 && invite.parties.some(frozen => frozen.id === party.id))
      cancelArenaInvitation(invite, 'Arena challenge cancelled because a team changed.');
    for (const duel of arenaMatches.values()) if (duel.size > 1) {
      const member = duel.members.find(member => duel.parties[member.team].id === party.id);
      if (member) endDuel(member.session, 'Arena match forfeited because a team changed.');
    }
  }
  function startArena(invite, now) {
    arenaInvitations.delete(invite.id);
    const id = randomUUID(), duel = { id, mode: 'arena', instanceId: `arena-${id}`, size: invite.size, rated: !!invite.queued, order: invite.order, wagerMoss: invite.wagerMoss,
      teamRatings: [0, 1].map(team => invite.members.filter(member => member.team === team).reduce((sum, member) => sum + member.session.player.arenaRatings[invite.size].rating, 0) / invite.size),
      phase: 'countdown', startsAt: now + 5000, endsAt: now + 305000, nextFundingCheck: now + 5000,
      parties: invite.parties, members: invite.members.map(({ session, team }) => ({ session, team, eliminated: false,
        returnActivity: { lastAttack: session.lastAttack, abilityCooldowns: { ...session.abilityCooldowns }, nextAutoAttackAt: session.nextAutoAttackAt || 0, lastHeal: session.lastHeal } })) };
    for (const { session } of duel.members) { cancelHits(session); cancelGathering(session); session.shield = null; session.duelResult = null; }
    arenaMatches.set(duel.instanceId, duel);
    const positions = [0, 0];
    for (const { session, team } of duel.members) {
      const p = session.player;
      session.returnPosition = { standingPosition:p.standingPosition, x: p.x, z: p.z, rotation: p.rotation, zone: p.zone, hp: p.hp, diedAt: p.diedAt || 0 };
      session.duel = duel; session.instanceId = duel.instanceId;
      Object.assign(p, arenaTeamPosition(team, positions[team]++, duel.size), { zone: ARENA_ENTRANCE.zone, hp: p.maxHp, diedAt: 0 });
      session.lastAttack = 0; session.abilityCooldowns = {}; session.nextAutoAttackAt = 0;
      session.lifeStartedAt = now; session.moveBudget = 0; session.lastMove = now;
      resetJump(session); session.jump.sequence++;
    }
    for (const { session } of duel.members) {
      correction(session, 'Arena match begins in 5 seconds.');
      event(session, 'info', `${duel.size}v${duel.size} arena match begins in 5 seconds. Defeat the opposing team; knockouts stop at 1 HP.`);
      send(session.socket, snapshot(session));
    }
    dirty();
  }
  function updateArena(now) {
    for (const invite of arenaInvitations.values()) {
      if (invite.preparing) continue;
      if (!arenaInvitationValid(invite, now))
        cancelArenaInvitation(invite, invite.expiresAt <= now ? 'Arena challenge expired.' : invite.queued ? 'Arena ready check cancelled because a fighter is no longer available.' : 'Arena challenge cancelled. All fighters must stay available with their teams unchanged.');
      else if (invite.queued) for (const member of invite.members) if (arenaQueueAcceptReason(member.session)) member.accepted = false;
      if (invite.funding && now >= (invite.nextCheck || 0)) void checkArenaFunding(invite);
    }
    updateArenaQueue(now);
    for (const duel of arenaMatches.values()) {
      if (duel.settling) continue;
      if (duel.order && now >= duel.nextFundingCheck) void checkActiveArenaFunding(duel);
      const invalid = duel.members.find(member => member.session.duel !== duel || !arenaParticipantValid(member.session, now) || !arenaRosterValid(duel, member.team));
      if (invalid) { endDuel(invalid.session, `${invalid.session.player.name} left the fight. The opposing team wins.`); continue; }
      if (now >= duel.endsAt) {
        // Settle only this instance before its deadline; unrelated combat retains normal tick ordering.
        finishCasts(now, duel.endsAt, duel.id); resolveHits(now, duel.endsAt, duel.id);
        if (arenaMatches.get(duel.instanceId) === duel) endDuel(duel.members[0].session, 'Arena match ended in a draw after five minutes.', null);
        continue;
      }
      if (duel.phase === 'countdown' && now >= duel.startsAt) {
        duel.phase = 'active';
        for (const { session } of duel.members) {
          session.lastMove = now; session.moveBudget = 0;
          event(session, 'info', 'Arena match started!'); send(session.socket, snapshot(session));
        }
      }
    }
  }
  function knockOut(session) {
    const member = duelMember(session), duel = session.duel;
    if (!member || member.eliminated) return;
    member.eliminated = true; session.shield = null; cancelPlayerCombat(session); resetJump(session); session.jump.sequence++;
    session.moveBudget = 0; session.lastMove = Date.now();
    if (duel.members.filter(other => other.team === member.team).every(other => other.eliminated))
      endDuel(session, `${session.player.name} was knocked out. The opposing team wins.`);
    else for (const { session: other } of duel.members) {
      event(other, 'info', `${session.player.name} was knocked out at 1 HP.`); send(other.socket, snapshot(other));
    }
    if (arenaMode(session)) correction(session, 'Knocked out at 1 HP.');
  }
  const friendlyTarget = (session, target, at = Date.now()) => !!target && (!(raids.bySession(session) || raids.bySession(target)) || raids.allies(session,target) && session.instanceId === target.instanceId) && (arenaMode(session) || arenaMode(target)
    ? session.duel === target.duel && arenaFighter(session, at) && arenaFighter(target, at) && duelMember(session).team === duelMember(target).team
    : session === target || !session.duel && !target.duel && !worldPvp(session) && !worldPvp(target));
  const combatTargetLife = target => target.ownerId ? target : sessions.get(target.id)?.player === target ? sessions.get(target.id).lifeStartedAt : target.respawnAt;
  const combatInstanceActive = (instanceId, at) => raids.combatActive(instanceId) && instantCombat.combatActive(instanceId) && at < (dungeons.get(instanceId)?.dream?.endsAt ?? Infinity);
  function hostileTargets(session, now) {
    const opponents = arenaMode(session) ? arenaFighter(session, now)
      ? session.duel.members.filter(member => member.team !== duelMember(session).team && !member.eliminated).map(member => member.session) : []
      : worldPvp(session) ? activeSessions().filter(other => other !== session && worldPvp(other))
      : duelValid(session, now) ? [duelOpponent(session)] : [];
    return [...(arenaMode(session) ? [] : enemies), ...opponents.flatMap(other => {
      const pet = activeCompanion(other, now);
      return pet?.hp > 0 ? [other.player, pet] : [other.player];
    })];
  }
  function hostileTargetValid(session, target, now) {
    if (target.ownerId) {
      const owner = sessions.get(target.ownerId);
      return !!owner && activeCompanion(owner, now) === target && target.hp > 0 && target.instanceId === session.instanceId
        && (!worldPvp(owner) || isInColosseum(target)) && hostileTargetValid(session, owner.player, now);
    }
    const other = sessions.get(target.id);
    if (session.zeppelin || other?.zeppelin || session.instanceId && dungeonPreparing(session) || other?.instanceId && dungeonPreparing(other) || !combatInstanceActive(session.instanceId, now)) return false;
    if (other?.player === target) {
      if (arenaMode(session) || arenaMode(other)) return session.duel === other.duel && arenaFighter(session, now) && arenaFighter(other, now)
        && duelMember(session).team !== duelMember(other).team && canSee(session, other) && canSee(other, session);
      return duelValid(session, now) && duelOpponent(session) === other
        || other !== session && worldPvp(session) && worldPvp(other) && liveSession(session, now) && liveSession(other, now)
          && session.player.hp > 0 && target.hp > 0 && !gmObserver(session) && !gmObserver(other) && canSee(session, other) && canSee(other, session);
    }
    return !arenaMode(session) && (!target.raidId || raids.bySession(session) === raids.byInstance(target.instanceId)) && target.instanceId === session.instanceId && target.alive && target.hp > 0
      && (!target.treasure || now < treasureGoblinDeadline(target.treasure)) && mapGuardianAllowed(target, session) && worldBossCombatAllowed(target, session.player);
  }
  const worldBossCombatAllowed = (enemy, point) => !enemy.worldBoss || Math.hypot(point.x-enemy.homeX,point.z-enemy.homeZ)<=enemy.boss.leashRadius && !villageSafe(point);
  function cancelGathering(session) {
    if (gatheringClaims.get(session.gathering?.nodeId) === session) gatheringClaims.delete(session.gathering.nodeId);
    session.gathering = null;
  }
  function cancelPlayerCombat(session) {
    session.companion = null;
    session.battleMark = null;
    session.edicts = null;
    for (const host of [...sessions.values(), ...enemies].flatMap(host => host.player && host.companion ? [host, host.companion] : [host]))
      for (const [key, mark] of host.edicts || []) if (mark.source === session) host.edicts.delete(key);
    session.arenaStunChain = null;
    session.duelStatus = null; session.talentChill = null; session.combatTalents = null; session.autoAttack = null; cancelCast(session);
    pendingHits = pendingHits.filter(hit => hit.session !== session && hit.enemy !== session.player);
    for (const other of sessions.values()) {
      if (other.autoAttack?.enemy === session.player) other.autoAttack = null;
      if (other.casting?.anchor === session.player) cancelCast(other);
    }
  }
  function cancelHits(session, keepQueue = false) {
    endDuel(session, arenaMode(session) ? `${session.player.name} left the fight. The opposing team wins.` : 'Duel ended because an adventurer left the fight.');
    removeDuelInvitations(session.player.id, keepQueue);
    stand(session); dismount(session); resetJump(session);
    cancelPlayerCombat(session);
    for (const enemy of enemies) {
      enemy.threat.delete(session);
      if (enemy.attackTarget === session) { enemy.attack = null; enemy.attackTarget = null; }
    }
  }
  function playerDied(session, at) {
    if (session.gm.flying) landGm(session);
    session.player.diedAt = at;
    session.shield = null;
    cancelHits(session); cancelGathering(session);
    cancelTradeFor(session.player.id, 'Trade cancelled because an adventurer fell.');
  }
  function cancelCast(session) { session.casting = null; }
  function stand(session) { session.seated = null; session.emote = null; }
  // Once released, a projectile belongs to its original target, independently of the next action.
  function cancelBasicHits(session) { pendingHits = pendingHits.filter(hit => hit.session !== session || !hit.basic || hit.projectile); }
  const autoAttackPaused = (session, at = Date.now()) => !!(arenaMode(session) && !arenaFighter(session, at) || session.duelStatus?.stunUntil > at || session.casting || session.gathering || session.seated || session.travel.mount
    || instantCombat.actionError(session, 'autoAttack', at)
    || !session.instanceId && waterAt(session.player.x, session.player.z));
  function autoAttackTargetValid(session, attack, now) {
    return liveSession(session, now) && session.player.hp > 0 && session.lifeStartedAt === attack.playerLife
      && session.instanceId === attack.instanceId && hostileTargetValid(session, attack.enemy, now)
      && combatTargetLife(attack.enemy) === attack.targetLife && (!attack.duelId || session.duel?.id === attack.duelId);
  }
  function autoAttackInRange(session, enemy, range) {
    return distance(session.player, enemy) <= range && canTraverse(session.player, enemy,
      session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS);
  }
  function startAutoAttacks(now) {
    for (const session of sessions.values()) {
      const attack = session.autoAttack;
      if (!attack) continue;
      if (!autoAttackTargetValid(session, attack, now)) { session.autoAttack = null; cancelBasicHits(session); continue; }
      // Keep a queued target without auto-facing a shielded boss during positioning mechanics such as Eclipse Gaze.
      if (attack.enemy.instantCombatInvulnerable || attack.enemy.instantCombatRole === 'boss' && instantCombat.byInstance(attack.enemy.instanceId)?.mechanicEndsAt) continue;
      const p = session.player, config = AUTO_ATTACKS[p.appearance.className];
      if (autoAttackPaused(session, now) || combatSaveBlocked(session.recordKey) || now < (session.nextAutoAttackAt || 0)
          || now - session.lastAttack < GLOBAL_ATTACK_MS || !autoAttackInRange(session, attack.enemy, config.range)) continue;
      // One attack at the current tick, never a burst of backdated attacks after a pause.
      instantCombat.recordAction(session, 'autoAttack', now);
      if (p.hp <= 0 || instantCombat.actionError(session, 'autoAttack', now)) continue;
      session.nextAutoAttackAt = now + config.cooldownMs / (combatStats(p).attackSpeedMultiplier * (1 + combatTalentState(session, now).arrowstormStacks * talentEffectRank(p, 'arrowstorm') * .05));
      const enemy = attack.enemy, timing = autoAttackTiming(p.appearance.className, distance(p, enemy));
      p.rotation = Math.atan2(enemy.x - p.x, enemy.z - p.z);
      broadcast({ type: 'combat', basic: true, playerId: p.id, zone: p.zone, instanceId: session.instanceId,
        ability: config.ability, startedAt: now, castTimeMs: 0, from: { x: p.x, z: p.z }, rotation: p.rotation,
        targets: [{ id: enemy.id, x: enemy.x, z: enemy.z }] }, p.zone, session.instanceId);
      pendingHits.push({ session, enemy, life: combatTargetLife(enemy), duelId: attack.duelId, playerLife: session.lifeStartedAt, zone: p.zone, instanceId: session.instanceId,
        basic: true, projectile: config.visual === 'projectile', stats: combatStats(p), range: config.range, damage: autoAttackDamage(p.appearance.className, combatStats(p)),
        attackerLevel: p.level, special: false, dueAt: now + (timing.delay + timing.flight) * 1000 });
      pendingHits.sort((a, b) => a.dueAt - b.dueAt);
    }
  }
  function castTargets(session, cast, at) {
    const p = session.player, spell = SPELLS[cast.ability], anchor = cast.anchor;
    if (!liveSession(session, at) || p.hp <= 0 || instantCombat.actionError(session, 'cast', at) || session.lifeStartedAt !== cast.playerLife || session.instanceId !== cast.instanceId
        || (cast.chargeEnd || spell.movementDistance) && !spell.clearMovementImpairments && instantCombat.actionError(session, 'move', at)
        || !combatInstanceActive(session.instanceId, at) && !(instantCombat.bySession(session) && spell.targetRelation !== 'hostile')
          && !(spell.effect === 'revive' && raids.bySession(session)?.phase === 'completed')
        || arenaMode(session) && !arenaFighter(session, at) || session.duelStatus?.stunUntil > at || cast.duelId && session.duel?.id !== cast.duelId
        || !spell.castMoveMultiplier && !spell.movementDistance && cast.ability !== 'charge' && distance(p, cast.from) > .01 || swimming(session)) return null;
    const colliders = session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, bounds = session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS;
    if (spell.effect === 'revive') {
      const party = partyOf(p.id);
      return activeSessions().filter(other => other.player.hp <= 0 && liveSession(other, at) && !arenaMode(other)
        && !committingAccounts.has(other.recordKey) && !releasingAccounts.has(other.recordKey)
        && (party?.members.includes(other.player.id) || raids.allies(session, other) || instantCombat.allies(session, other))
        && friendlyTarget(session, other, at) && !gmObserver(other) && !other.zeppelin && canSee(session, other)
        && other.instanceId === session.instanceId && other.player.zone === p.zone && distance(p, other.player) <= spell.range
        && canTraverse(p, other.player, colliders, bounds)).map(other => other.player);
    }
    if (spell.targetRelation !== 'hostile') {
      const target = sessions.get(anchor.id);
      if (!liveSession(target, at) || !friendlyTarget(session, target, at) || gmObserver(target) || target.zeppelin || target.player !== anchor || target.lifeStartedAt !== cast.targetLife || anchor.hp <= 0
          || target.instanceId !== session.instanceId || anchor.zone !== p.zone || distance(p, anchor) > spell.range || !canTraverse(p, anchor, colliders, bounds)) return [];
      if (spell.targeting === 'single' || spell.targetRelation === 'self') return [anchor];
      const party = partyOf(p.id);
      const allies = activeSessions().filter(other => (other === session || party?.members.includes(other.player.id) || raids.allies(session,other) || instantCombat.allies(session,other))
        && friendlyTarget(session, other, at) && !gmObserver(other) && !other.zeppelin && other.player.hp > 0 && other.instanceId === session.instanceId && other.player.zone === p.zone && distance(p, other.player) <= spell.range && canTraverse(p, other.player, colliders, bounds))
        .map(other => other.player).sort((a,b) => distance(p,a)-distance(p,b));
      if (!allies.includes(anchor)) return [];
      return spell.targeting === 'chain' ? [anchor,...allies.filter(other => other !== anchor)].slice(0,spell.maxTargets || 4)
        : spell.targeting === 'splash' ? allies.filter(other => distance(anchor,other) <= (spell.radius || spell.range)) : allies;
    }
    const visible = hostileTargets(session, at).filter(e => hostileTargetValid(session, e, at) && distance(p, e) <= spell.range + (spell.radius || 0) && canTraverse(p, e, colliders, bounds));
    const nearby = visible.filter(e => distance(p, e) <= spell.range && (cast.ability !== 'cleave' || ((e.x - p.x) * Math.sin(cast.rotation) + (e.z - p.z) * Math.cos(cast.rotation)) / Math.max(.001, distance(p, e)) >= Math.cos(70 * Math.PI / 180))).sort((a, b) => distance(p, a) - distance(p, b));
    if (spell.targeting === 'radial') return nearby;
    if (!hostileTargetValid(session, anchor, at) || combatTargetLife(anchor) !== cast.targetLife) return [];
    if (!nearby.includes(anchor)) return [];
    if (cast.ability === 'powerful-throw') {
      const chain = [anchor];
      while (chain.length < spell.maxTargets) {
        const last = chain.at(-1), next = nearby.filter(enemy => !chain.includes(enemy) && canTraverse(last, enemy, colliders, bounds))
          .sort((a,b) => distance(last,a)-distance(last,b))[0];
        if (!next) break;
        chain.push(next);
      }
      return chain;
    }
    return spell.targeting === 'single' ? [anchor]
      : spell.targeting === 'splash' ? [anchor, ...visible.filter(e => e !== anchor && distance(anchor, e) <= spell.radius && canTraverse(anchor, e, colliders, bounds)).sort((a,b) => distance(anchor,a)-distance(anchor,b))].slice(0, spell.maxTargets)
      : [anchor, ...nearby.filter(e => e !== anchor)].slice(0, spell.maxTargets);
  }
  const talentEffectRank = (player, effect) => talentRank(player, TALENT_EFFECT_IDS[effect]);
  function knightEnemies(session, center, radius, at) {
    return hostileTargets(session, at).filter(enemy => hostileTargetValid(session, enemy, at) && distance(center, enemy) <= radius
      && canTraverse(center, enemy, session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS));
  }
  function knightAllies(session, radius, at) {
    const party = partyOf(session.player.id);
    return activeSessions().filter(other => (other === session || party?.members.includes(other.player.id) || raids.allies(session,other) || instantCombat.allies(session,other)) && friendlyTarget(session, other, at)
      && other.player.hp > 0 && !gmObserver(other) && !other.zeppelin && other.instanceId === session.instanceId && distance(session.player, other.player) <= radius
      && canTraverse(session.player, other.player, session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS));
  }
  function queueKnightHit(session, enemy, damage, at, extra = {}) {
    if (damage <= 0 || !hostileTargetValid(session, enemy, at)) return;
    pendingHits.push({ session, enemy, damage, dueAt: at, life: combatTargetLife(enemy), playerLife: session.lifeStartedAt,
      instanceId: session.instanceId, zone: session.player.zone, attackerLevel: session.player.level, stats: combatStats(session.player),
      duelId: enemy.ownerId || sessions.get(enemy.id)?.player === enemy ? session.duel?.id : undefined, talentSecondary: true, ...extra });
    pendingHits.sort((a,b) => a.dueAt-b.dueAt);
  }
  const edictHost = target => sessions.get(target.id)?.player === target ? sessions.get(target.id) : target;
  function edictValid(mark, target, at) {
    return talentEffectRank(mark.source.player, { light: 'edictLight', protection: 'edictProtection', harm: 'edictHarm', dawn: 'edictDawn', titan: 'titansEdict' }[mark.kind]) > 0
      && mark.until >= at && mark.life === combatTargetLife(target) && mark.sourceLife === mark.source.lifeStartedAt
      && liveSession(mark.source, at) && mark.source.player.hp > 0 && mark.source.instanceId === mark.instanceId
      && (mark.kind === 'harm' ? hostileTargetValid(mark.source, target, at)
        : target.hp > 0 && liveSession(sessions.get(target.id), at) && sessions.get(target.id).instanceId === mark.instanceId
          && friendlyTarget(mark.source, sessions.get(target.id), at));
  }
  function edictPower(source, effect, scale) {
    return spellDamage({ ...SPELLS.smite, effect, damageScale: scale }, combatStats(source.player));
  }
  function applyEdict(source, target, kind, power, at, extra = {}) {
    const host = edictHost(target), key = `${source.player.id}:${kind}`, previous = host.edicts?.get(key);
    const mark = { source, sourceLife: source.lifeStartedAt, life: combatTargetLife(target), instanceId: source.instanceId,
      kind, power: Math.max(1, Math.round(power)), until: at + CLERIC_EDICTS.durationMs, ...extra };
    if (previous?.repeatUntil > at) { mark.repeatUntil = previous.repeatUntil; mark.until = previous.repeatUntil; }
    if (kind === 'dawn') { mark.nextAt = at + CLERIC_EDICTS.dawnTickMs; mark.pulsePower = Math.round(mark.power * CLERIC_EDICTS.dawnPulseScale / CLERIC_EDICTS.dawnTickScale); }
    if (!edictValid(mark, target, at)) return;
    if (kind === 'titan' && !mark.shield) {
      const previousShield = host.shield?.endsAt > at ? host.shield.amount : 0;
      host.shield = mark.shield = { amount: Math.max(previousShield, mark.power), endsAt: mark.until };
      clericSupportTalents(source, host, mark.power, at, false);
    }
    (host.edicts ||= new Map()).set(key, mark);
    return mark;
  }
  function edictNearby(mark, center, at) {
    const source = mark.source, colliders = source.instanceId ? instanceColliders(source.instanceId) : WORLD_COLLIDERS;
    const bounds = source.instanceId ? instanceBounds(source.instanceId) : WORLD_BOUNDS;
    const candidates = mark.kind === 'harm' ? hostileTargets(source, at).filter(target => hostileTargetValid(source, target, at))
      : activeSessions().filter(other => other.player.hp > 0 && other.instanceId === source.instanceId && !gmObserver(other) && !other.zeppelin
        && friendlyTarget(source, other, at)).map(other => other.player);
    return candidates.filter(target => distance(center, target) <= CLERIC_EDICTS.radius && canTraverse(center, target, colliders, bounds))
      .sort((a, b) => distance(center, a) - distance(center, b));
  }
  function fireEdict(mark, target, at, attacker, context = {}, depth = 0) {
    const source = mark.source, recipient = sessions.get(target.id);
    if (mark.kind === 'harm') queueKnightHit(source, target, mark.power, at, { edictProc: true });
    else if (mark.kind === 'light') restoreHealth(recipient, mark.power, at, true, source);
    else if (mark.kind === 'protection') {
      const previous = recipient.shield?.endsAt > at ? recipient.shield : null;
      recipient.shield = Object.assign(previous || {}, { amount: (previous?.amount || 0) + mark.power, endsAt: Math.max(previous?.endsAt || 0, at + CLERIC_EDICTS.durationMs) });
      clericSupportTalents(source, recipient, mark.power, at, false);
      if (attacker) queueKnightHit(source, attacker, mark.power, at, { edictProc: true, reflected: true });
    } else if (mark.kind === 'dawn') {
      for (const ally of edictNearby(mark, target, at)) restoreHealth(sessions.get(ally.id), mark.pulsePower, at, true, source);
    } else if (mark.kind === 'titan' && attacker) {
      queueKnightHit(source, attacker, Math.round((context.absorbed || 0) * CLERIC_EDICTS.titanReflectScale), at, { edictProc: true, reflected: true });
    }
    const bounce = talentEffectRank(source.player, 'bouncingEdicts');
    if (depth < 2 && bounce && Math.random() < (bounce === 2 ? .15 : .07)) {
      const next = edictNearby(mark, target, at).find(candidate => candidate !== target);
      if (next) {
        const chained = mark.kind === 'titan' ? applyEdict(source, next, 'titan', mark.power, at) : mark;
        if (chained) fireEdict(chained, next, at, attacker, mark.kind === 'titan' ? {} : context, depth + 1);
      }
    }
    const blanket = talentEffectRank(source.player, 'blanketEdicts');
    if (!depth && blanket) for (const next of edictNearby(mark, target, at).filter(candidate => candidate !== target).slice(0, blanket === 2 ? 3 : 1)) {
      const key = `${source.player.id}:${mark.kind}`, existing = edictHost(next).edicts?.get(key), power = Math.floor(mark.power * blanket * .1);
      if (power > 0 && (!existing || !edictValid(existing, next, at) || existing.power < power))
        applyEdict(source, next, mark.kind, power, at);
    }
    dirty();
  }
  function triggerEdicts(target, trigger, at, attacker, context = {}) {
    const host = edictHost(target);
    for (const [key, mark] of [...(host.edicts || [])]) {
      if (!edictValid(mark, target, at) || mark.until <= at) { host.edicts.delete(key); continue; }
      const fires = trigger === 'beforeDamage' ? mark.kind === 'protection'
        : trigger === 'heal' ? mark.kind === 'light'
        : mark.kind === 'light' || mark.kind === 'harm' || mark.kind === 'dawn'
          || mark.kind === 'titan' && context.shield === mark.shield && context.absorbed > 0;
      if (!fires) continue;
      if (!['dawn', 'titan'].includes(mark.kind) && !(mark.repeatUntil > at)) {
        host.edicts.delete(key);
        if (Math.random() < talentEffectRank(mark.source.player, 'renewableEdict') * .05)
          applyEdict(mark.source, target, mark.kind, mark.power, at);
      }
      fireEdict(mark, target, at, attacker, context);
    }
  }
  function resolveEdictTimer(until, before, matchId) {
    let next;
    for (const session of sessions.values()) {
      if (matchId && session.duel?.id !== matchId) continue;
      for (const [key, mark] of session.edicts || []) if (mark.kind === 'dawn' && mark.nextAt <= mark.until && mark.nextAt <= until && mark.nextAt < before
          && (!next || mark.nextAt < next.at)) next = { session, key, mark, at: mark.nextAt };
    }
    if (!next) return false;
    const { session, key, mark, at } = next;
    if (resolveKnightTimer(at, before, matchId)) return true;
    for (const other of sessions.values()) advanceKnightCharge(other, at);
    if (!edictValid(mark, session.player, at)) session.edicts.delete(key);
    else { mark.nextAt += CLERIC_EDICTS.dawnTickMs; restoreHealth(session, mark.power, at, true, mark.source); dirty(); }
    return true;
  }
  function tauntEnemy(session, enemy, at, duration = 3000) {
    if (!enemy.threat || enemy.instantCombat && enemy.instantCombatRole !== 'boss' || enemy.kind === 'training-dummy' || !hostileTargetValid(session, enemy, at)) return;
    enemy.threat.set(session, Math.max(0, ...enemy.threat.values()) + 1);
    enemy.tauntedBy = session; enemy.tauntedUntil = at + duration; enemy.tauntedLife = session.lifeStartedAt; enemy.tauntedTargetLife = combatTargetLife(enemy);
    if (!enemy.instantCombatRole && (!enemy.raidId || enemy.raidKind === 'guardian') && (enemy.target !== session || enemy.attackCompanion)) { enemy.attack = null; enemy.dungeonCastUntil = 0; }
    enemy.target = session;
  }
  function knightDamageTaken(session, attacker, incoming, absorbed, at, reflected) {
    const state = session.combatTalents;
    if (!state) return;
    if (state.guardian?.until > at && !reflected && attacker && hostileTargetValid(session, attacker, at)
        && at >= (state.guardian.counterReadyAt || 0)) {
      state.guardian.counterReadyAt = at + 1000;
      queueKnightHit(session, attacker, autoAttackDamage(session.player.appearance.className, combatStats(session.player)), at, { reflected: true });
      broadcast({ type: 'combat', ability: 'adamant-guardian', effectPhase: 'impact', playerId: session.player.id,
        zone: session.player.zone, instanceId: session.instanceId, startedAt: at, from: { x: session.player.x, z: session.player.z },
        rotation: session.player.rotation, targets: [{ id: attacker.id, x: attacker.x, z: attacker.z }] }, session.player.zone, session.instanceId);
    }
    if (state.guard?.until > at) {
      state.guard.absorbed += absorbed;
      if (!reflected && attacker && hostileTargetValid(session, attacker, at)) {
        const rank = talentEffectRank(session.player, 'holdTheLine');
        const damage = Math.max(1, Math.round(incoming * SPELLS.guard.reflectScale + absorbed * rank * .05));
        queueKnightHit(session, attacker, damage, at, { reflected: true, threatMultiplier: 2 });
        if (rank) for (const enemy of knightEnemies(session, attacker, 3, at).filter(enemy => enemy !== attacker))
          queueKnightHit(session, enemy, Math.max(1, Math.round(damage * rank * .25)), at, { reflected: true, threatMultiplier: 2 });
      }
    }
    const mark = state.battleMark;
    if (mark?.until > at && mark.life === session.lifeStartedAt && liveSession(mark.source, at) && mark.sourceLife === mark.source.lifeStartedAt
        && mark.source.instanceId === session.instanceId && friendlyTarget(mark.source, session, at)) {
      state.battleMark = null;
      state.battleHealing = { ...mark, nextAt: at + SPELLS['lord-of-battle'].markHealDurationMs / SPELLS['lord-of-battle'].markHealTicks, ticks: SPELLS['lord-of-battle'].markHealTicks };
    }
  }
  function mobilityDestination(session, range) {
    const p = session.player, colliders = session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS;
    const bounds = session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS;
    let destination = { x: p.x, z: p.z };
    for (let step = .25; step <= range; step += .25) {
      const next = { x: p.x + Math.sin(p.rotation) * step, z: p.z + Math.cos(p.rotation) * step };
      if (!playerRouteAllowed(session, p, next) || !moveSessionJump(session, { ...session.jump }, p, next)
          || !session.instanceId && (movementCost(p, next) > step + 1e-8 || waterAt(next.x, next.z) || isInColosseum(p) !== isInColosseum(next)
            || DUNGEONS.some(definition => crossedDungeonPortal(p, next, definition.entrance)))
          || arenaMode(session) && !isInArena(next)) break;
      destination = next;
    }
    return destination;
  }
  function advanceKnightCharge(session, at) {
    const cast = session.casting;
    if (!cast?.chargeEnd) return;
    const fraction = Math.max(0, Math.min(1, (at-cast.startedAt)/(cast.endsAt-cast.startedAt)));
    const next = { x: cast.from.x+(cast.chargeEnd.x-cast.from.x)*fraction, z: cast.from.z+(cast.chargeEnd.z-cast.from.z)*fraction };
    if (session.duelStatus?.stunUntil > at || instantCombat.actionError(session, 'move', at) || cast.ability === 'charge' && (!hostileTargetValid(session, cast.anchor, at) || combatTargetLife(cast.anchor) !== cast.targetLife)
        || !playerRouteAllowed(session, session.player, next)
        || !session.instanceId && (waterAt(next.x,next.z) || movementCost(session.player,next) > distance(session.player,next)+1e-8)
        || !moveSessionJump(session, session.jump, session.player, next)) { cancelCast(session); return; }
    Object.assign(session.player, next);
    if (!session.instanceId) session.player.zone = regionAt(next.x,next.z);
    session.moveBudget = 0; session.lastMove = at;
    correction(session, '');
  }
  function updateKnightCombat(at) {
    for (const session of sessions.values()) {
      const state = session.combatTalents;
      if (!state || session.player.hp <= 0 || !liveSession(session, at)) continue;
      const shield = state.thrownShield;
      if (shield) {
        if (shield.expiresAt <= at) state.thrownShield = null;
        else if (shield.availableAt <= at && distance(session.player, shield) <= 1.5 && canTraverse(session.player, shield,
          session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS)) {
          state.thrownShield = null; state.powerfulThrowReady = true;
          event(session, 'combat', 'Shield recovered: your next Powerful Throw charges in one second.');
        }
      }
    }
  }
  function resolveKnightTimer(until, before, matchId) {
    let next;
    for (const session of sessions.values()) {
      if (session.player.hp <= 0 || !liveSession(session, until) || matchId && session.duel?.id !== matchId) continue;
      const state = session.combatTalents;
      for (const [kind, at] of [['guardian', state?.guardian?.until], ['heal', state?.battleHealing?.ticks > 0 ? state.battleHealing.nextAt : undefined]]) {
        if (at <= until && at < before && (!next || at < next.at)) next = { session, kind, at };
      }
    }
    if (!next) return false;
    const { session, kind, at } = next, state = session.combatTalents;
    for (const other of sessions.values()) advanceKnightCharge(other, at);
    if (kind === 'guardian') state.guardian = null;
    else {
      const heal = state.battleHealing;
      if (heal.life !== session.lifeStartedAt || !liveSession(heal.source, at) || heal.sourceLife !== heal.source.lifeStartedAt
          || heal.source.instanceId !== session.instanceId || !friendlyTarget(heal.source, session, at)) state.battleHealing = null;
      else {
        const ticks = SPELLS['lord-of-battle'].markHealTicks, index = ticks - heal.ticks;
        restoreHealth(session, Math.round(heal.damage * (index+1) / ticks) - Math.round(heal.damage * index / ticks), at);
        heal.ticks--; heal.nextAt += SPELLS['lord-of-battle'].markHealDurationMs / ticks;
        dirty();
      }
    }
    return true;
  }
  function activeCompanion(session, at = Date.now()) {
    const p = session.player, saved = p.tamedCompanion;
    if (!saved || saved.dismissed || p.appearance.className !== 'Ranger' || !talentEffectRank(p, 'beastmaster') || saved.level > p.level
        || p.hp <= 0 || !liveSession(session, at) || session.travel.mount || session.zeppelin || gmObserver(session) || swimming(session)
        || arenaMode(session) && !arenaFighter(session, at)) { session.companion = null; return null; }
    if (!session.companion || session.companion.saved !== saved || session.companion.instanceId !== session.instanceId || session.companion.playerLife !== session.lifeStartedAt) {
      session.companion = { saved, id: `companion:${p.id}`, ownerId: p.id, name: `${p.name}'s companion`, kind: saved.kind, level: saved.level,
        get hp() { return saved.hp; }, maxHp: combatCompanionStats(saved.level).maxHp,
        x: p.x, z: p.z, rotation: p.rotation, instanceId: session.instanceId, playerLife: session.lifeStartedAt,
        attackUntil: 0, nextAttackAt: at + 1000, target: null, targetLife: 0, bondReady: false };
    }
    return session.companion;
  }
  function publicCompanion(session) {
    const pet = activeCompanion(session);
    return pet ? { ...pet.saved, maxHp: combatCompanionStats(pet.saved.level).maxHp, x: pet.x, z: pet.z, rotation: pet.rotation,
      attackUntil: pet.attackUntil, targetId: pet.target?.id || null, bondReady: pet.bondReady } : null;
  }
  function healCompanion(session, amount, at) {
    const pet = activeCompanion(session, at);
    if (!pet || pet.saved.hp <= 0) return;
    const healed = Math.max(0, Math.min(Math.round(amount), combatCompanionStats(pet.saved.level).maxHp - pet.saved.hp));
    if (!healed) return;
    pet.saved.hp += healed;
    broadcast({ type: 'damage', targetId: `companion:${session.player.id}`, targetKind: 'enemy', amount: healed, x: pet.x, z: pet.z, effect: 'heal' }, session.player.zone, session.instanceId);
    dirty();
  }
  function damageCompanion(session, amount, at, edictProc = false) {
    const pet = activeCompanion(session, at);
    if (!pet || pet.saved.hp <= 0) return;
    const damage = Math.min(pet.saved.hp, Math.max(0, Math.round(amount)));
    if (!damage) return;
    pet.saved.hp -= damage; session.companionCombatUntil = at + 5000;
    if (pet.saved.hp > 0 && !edictProc) triggerEdicts(pet, 'damage', at);
    broadcast({ type: 'damage', targetId: `companion:${session.player.id}`, targetKind: 'enemy', amount: damage, x: pet.x, z: pet.z }, session.player.zone, session.instanceId);
    if (!pet.saved.hp) { pet.target = null; pet.assault = null; pet.bondReady = false; pet.attackUntil = 0; }
    dirty();
  }
  function combatStunDuration(session, target, duration, at) {
    if (!arenaMode(session)) return duration;
    const count = target.arenaStunChain?.resetAt > at ? target.arenaStunChain.count : 0;
    duration = Math.round(duration * .8 * Math.max(0, 1 - count * .25));
    if (!duration) {
      const entity = target.player || target;
      broadcast({ type: 'damage', targetId: entity.id, targetKind: target.player ? 'player' : 'enemy', amount: 0,
        x: entity.x, z: entity.z, effect: 'immune' }, session.player.zone, session.instanceId);
      return 0;
    }
    target.arenaStunChain = { count: count + 1, resetAt: Math.max(target.duelStatus?.stunUntil || target.stunUntil || 0, at + duration) + 15000 };
    return duration;
  }
  function companionInRange(session, pet, enemy) {
    return distance(pet, enemy) <= combatCompanionStats(pet.saved.level).range && distance(session.player, enemy) <= 24
      && canTraverse(pet, enemy, session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS);
  }
  function canTame(session, enemy, at) {
    return session.player.appearance.className === 'Ranger' && talentEffectRank(session.player, 'beastmaster') > 0
      && enemies.includes(enemy) && !enemy.instantCombat && enemy.id !== ROOTVAULT_GUARDIAN.id && tameableCreature(enemy, session.player.level) && hostileTargetValid(session, enemy, at);
  }
  function updateCombatCompanions(now, dt) {
    for (const session of sessions.values()) {
      const pet = activeCompanion(session, now), p = session.player;
      if (!pet || pet.saved.hp <= 0) continue;
      if (session.casting?.ability === 'tame-beast' || session.gathering || session.seated || session.duelStatus?.stunUntil > now || combatSaveBlocked(session.recordKey)) { pet.target = null; pet.assault = null; continue; }
      if (pet.target && (!hostileTargetValid(session, pet.target, now) || pet.targetLife !== combatTargetLife(pet.target) || distance(p, pet.target) > 24)) pet.target = null;
      if (pet.assault && (pet.assault.enemy !== pet.target || pet.assault.life !== pet.targetLife)) pet.assault = null;
      if (pet.stunUntil > now) continue;
      if (!pet.target) {
        const target = session.autoAttack?.enemy || enemies.find(enemy => enemy.alive && enemy.target === session);
        if (target && hostileTargetValid(session, target, now) && distance(p, target) <= 24) { pet.target = target; pet.targetLife = combatTargetLife(target); }
      }
      const goal = pet.target || p;
      const colliders = session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, bounds = session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS;
      if (!pet.target && distance(pet, p) > 20) { pet.x = p.x; pet.z = p.z; pet.path = []; }
      else {
        if (groundCanTraverse(pet, goal, colliders, bounds)) pet.path = [];
        else {
          if (now >= (pet.nextPathAt || 0)) {
            // ponytail: local cover detours; widen this bound if companions need to navigate whole buildings.
            pet.path = findPath(pet, goal, colliders, {
              minX: Math.max(bounds.minX, Math.min(pet.x, goal.x) - 8), maxX: Math.min(bounds.maxX, Math.max(pet.x, goal.x) + 8),
              minZ: Math.max(bounds.minZ, Math.min(pet.z, goal.z) - 8), maxZ: Math.min(bounds.maxZ, Math.max(pet.z, goal.z) + 8),
            });
            pet.nextPathAt = now + 750;
          }
          while (pet.path?.length && (distance(pet, pet.path[0]) < .05 || pet.path[1] && groundCanTraverse(pet, pet.path[1], colliders, bounds))) pet.path.shift();
        }
        const destination = pet.path?.[0] || goal, gap = distance(pet, destination), stop = destination === goal ? pet.target ? 1.4 : 1.5 : 0;
        const step = Math.min(Math.max(0, gap - stop), dt * 6 * (pet.slowUntil > now ? pet.slowMultiplier : 1));
        if (step > 0) {
          const next = { x: pet.x + (destination.x - pet.x) / gap * step, z: pet.z + (destination.z - pet.z) / gap * step };
          if (groundCanTraverse(pet, next, colliders, bounds) && (session.instanceId || !waterAt(next.x, next.z))) {
            pet.rotation = Math.atan2(next.x - pet.x, next.z - pet.z); pet.x = next.x; pet.z = next.z;
          }
        }
      }
      if (!pet.target || !pet.assault && now < pet.nextAttackAt || !companionInRange(session, pet, pet.target)) continue;
      const enemy = pet.target, stats = combatCompanionStats(pet.saved.level);
      pet.nextAttackAt = now + stats.cooldownMs; pet.attackUntil = now + 600;
      pet.rotation = Math.atan2(enemy.x - pet.x, enemy.z - pet.z);
      if (pet.assault) { pendingHits.push({ ...pet.assault, dueAt: now + 300 }); pet.assault = null; continue; }
      pendingHits.push({ session, enemy, companion: pet, companionBasic: true, life: combatTargetLife(enemy), playerLife: session.lifeStartedAt,
        duelId: enemy.ownerId || sessions.get(enemy.id)?.player === enemy ? session.duel?.id : undefined, zone: p.zone, instanceId: session.instanceId,
        damage: stats.damage, attackerLevel: pet.saved.level, special: false, dueAt: now + 300 });
    }
    pendingHits.sort((a, b) => a.dueAt - b.dueAt);
  }
  function combatTalentState(session, at) {
    const state = session.combatTalents || {};
    return { heat: state.heatUntil > at ? state.heat || 0 : 0, heatUntil: state.heatUntil || 0,
      twinshotReadyUntil: state.twinshotReadyUntil || 0, arrowstormStacks: state.arrowstormUntil > at ? state.arrowstormStacks || 0 : 0,
      arrowstormUntil: state.arrowstormUntil || 0, bondReady: !!activeCompanion(session, at)?.bondReady,
      powerfulThrowReady: state.powerfulThrowReady || false,
      thrownShield: state.thrownShield?.availableAt <= at && state.thrownShield.expiresAt > at ? { x: state.thrownShield.x, z: state.thrownShield.z, expiresAt: state.thrownShield.expiresAt } : undefined,
      guardUntil: state.guard?.until || 0, guardianUntil: state.guardian?.until || 0,
      blessedArmorUntil: state.blessedArmor?.until || 0, blessedArmorDefense: state.blessedArmor?.until > at ? state.blessedArmor.defense : 0,
      courageousCallUntil: state.courage?.until || 0, lordOfBattleUntil: state.battleMark?.until || 0,
      movementSpeedUntil: state.movementSpeedUntil || 0, movementSpeedMultiplier: state.movementSpeedUntil > at ? state.movementSpeedMultiplier : 1,
      edicts: [...(session.edicts?.values() || [])].filter(mark => edictValid(mark, session.player, at) && mark.until > at)
        .map(({ kind, source, until, power, repeatUntil }) => ({ kind, sourceId: source.player.id, until, power, repeatUntil: repeatUntil || 0 })) };
  }
  function chilledTarget(enemy, at) {
    const chill = sessions.get(enemy.id)?.player === enemy ? sessions.get(enemy.id).talentChill : enemy.talentChill;
    return !!chill && chill.until > at && chill.life === combatTargetLife(enemy);
  }
  function changeDotRate(session, at, rate) {
    for (const hit of pendingHits) if (hit.dot && hit.session === session && hit.dueAt > at) {
      hit.dueAt = at + (hit.dueAt - at) * (hit.dotRate || 1) / rate;
      hit.expiresAt = at + (hit.expiresAt - at) * (hit.dotRate || 1) / rate;
      hit.dotRate = rate;
    }
    pendingHits.sort((a, b) => a.dueAt - b.dueAt);
  }
  function expireBurning(at) {
    let changed = false;
    for (const session of sessions.values()) {
      const state = session.combatTalents;
      if (state?.heat > 0 && state.heatUntil <= at) {
        changeDotRate(session, state.heatUntil, 1); state.heat = 0; changed = true;
      }
    }
    return changed;
  }
  function scheduleDot(hit, damage, ticks, duration, at) {
    const dotRate = 1 + combatTalentState(hit.session, at).heat * .03;
    for (let tick = 1; tick <= ticks; tick++) pendingHits.push({ ...hit, basic: false, weapon: false, status: undefined, dot: true, dotRate,
      damage: Math.round(damage * tick) - Math.round(damage * (tick - 1)), dueAt: at + tick * duration / ticks / dotRate, expiresAt: at + duration / dotRate });
    pendingHits.sort((a, b) => a.dueAt - b.dueAt);
  }
  function queueTalentHit(hit, ability, at, damage, extra = {}) {
    const { session, enemy } = hit, p = session.player, timing = combatTiming(ability, distance(p, enemy));
    broadcast({ type: 'combat', playerId: p.id, zone: p.zone, instanceId: session.instanceId, ability, startedAt: at,
      castTimeMs: 0, from: { x: p.x, z: p.z }, rotation: Math.atan2(enemy.x-p.x, enemy.z-p.z), targets: [{ id: enemy.id, x: enemy.x, z: enemy.z }] }, p.zone, session.instanceId);
    pendingHits.push({ ...hit, basic: false, status: undefined, dot: false, ability, damage,
      dueAt: at + (timing.delay + timing.flight) * 1000, ...extra });
    pendingHits.sort((a, b) => a.dueAt - b.dueAt);
  }
  function applyTalentHit(hit, baseDamage) {
    if (hit.companion || hit.talentSecondary) return baseDamage;
    const { session, enemy, dueAt: at } = hit, p = session.player, spell = SPELLS[hit.ability];
    const state = session.combatTalents ||= { heat: 0, heatUntil: 0, twinshotReadyUntil: 0, twinshotMisses: 0 };
    const chilled = hit.shatterChilled || chilledTarget(enemy, at);
    if (!hit.dot && !hit.basic && spell?.school === 'frost') {
      if (chilled) baseDamage = Math.round(baseDamage * (1 + talentEffectRank(p, 'deepChill') * .05));
      if (hit.ability === 'ice-lance' && chilled && talentEffectRank(p, 'chilled')) session.abilityCooldowns['ice-lance'] = at;
      if (hit.ability !== 'shatter' && talentEffectRank(p, 'chilled')) {
        const target = sessions.get(enemy.id)?.player === enemy ? sessions.get(enemy.id) : enemy;
        target.talentChill = { until: at + 4000, life: hit.life };
        if (target !== enemy) {
          target.duelStatus ||= { slowUntil: 0, slowMultiplier: 1, stunUntil: 0 };
          if (target.duelStatus.slowUntil <= at || target.duelStatus.slowMultiplier > .8) target.duelStatus.slowMultiplier = .8;
          target.duelStatus.slowUntil = Math.max(target.duelStatus.slowUntil, at + 4000);
          target.moveBudget = 0; target.lastMove = at;
        } else {
          if (!(enemy.slowUntil > at) || enemy.slowMultiplier > .8) enemy.slowMultiplier = .8;
          enemy.slowUntil = Math.max(enemy.slowUntil || 0, at + 4000);
        }
      }
    }
    if (!hit.basic && talentEffectRank(p, 'burning') && (hit.dot ? talentEffectRank(p, 'periodicBurning') : spell?.school === 'fire')) {
      state.heat = Math.min(10, (state.heatUntil > at ? state.heat : 0) + (hit.dot ? talentEffectRank(p, 'periodicBurning') : 1));
      state.heatUntil = at + 6000;
      changeDotRate(session, at, 1 + state.heat * .03);
    }
    if (!hit.dot && (hit.basic || hit.ability === 'twinshot' && !hit.twinshotProc) && talentEffectRank(p, 'twinshot')) {
      const chance = Math.min(1, .2 + (hit.basic ? (state.twinshotMisses || 0) * .05 * talentEffectRank(p, 'twinshotMomentum') : 0));
      if (Math.random() < chance) {
        if (hit.basic) state.twinshotMisses = 0;
        if (talentEffectRank(p, 'arrowstorm')) {
          state.arrowstormStacks = Math.min(5, (state.arrowstormUntil > at ? state.arrowstormStacks || 0 : 0) + 1);
          state.arrowstormUntil = at + 10000;
        }
        queueTalentHit(hit, hit.basic ? 'arrow' : 'twinshot', at, hit.damage, { twinshotProc: true, weapon: !!hit.basic });
      } else if (hit.basic) state.twinshotMisses = Math.min(20, (state.twinshotMisses || 0) + 1);
    }
    if (hit.twinshotProc && !hit.dot && p.talents.includes(SPELLS.twinshot.requiredTalent) && Math.random() < .2) {
      session.abilityCooldowns.twinshot = at; state.twinshotReadyUntil = at + 10000;
      event(session, 'combat', 'Double Tap ready: your next Double Tap is instant.');
    }
    if (!hit.dot && (hit.basic || hit.weapon) && talentEffectRank(p, 'venom')) {
      const carried = pendingHits.filter(previous => previous.dot && previous.venomBasic && previous.session === session && previous.enemy === enemy && previous.life === hit.life && previous.playerLife === hit.playerLife && previous.instanceId === hit.instanceId);
      pendingHits = pendingHits.filter(previous => !carried.includes(previous));
      const poison = Math.round(baseDamage * .6), ticks = 4 + talentEffectRank(p, 'lingeringVenom');
      // Keep the exact remaining pool; extending venom spreads damage rather than multiplying it.
      scheduleDot({ ...hit, ability: 'arrow', venomBasic: true }, (Math.round(poison * (1 + ((hit.stats.spellBonuses?.poison || 0) + (hit.stats.spellBonuses?.periodic || 0)) / 100)) + carried.reduce((sum, previous) => sum + previous.damage, 0)) / ticks, ticks, ticks * 1000, at);
      baseDamage -= poison;
    }
    if (!hit.dot && !hit.basic && spell?.school === 'arcane' && talentEffectRank(p, 'arcaneEcho')) {
      // ponytail: cap a lucky chain at 16 repeats so one cast cannot monopolize combat processing.
      if ((hit.arcaneRepeats || 0) < 16 && (hit.forceRepeat || Math.random() < .15 + .05 * talentEffectRank(p, 'arcaneEchoChance')))
        queueTalentHit(hit, 'arcane-missile', at, spellDamage(SPELLS['arcane-missile'], hit.stats), { forceRepeat: false, arcaneRepeats: (hit.arcaneRepeats || 0) + 1 });
    }
    if (hit.ability === 'venom-detonation' && !hit.dot) {
      const effects = pendingHits.filter(previous => previous.dot && previous.session === session && previous.enemy === enemy && previous.life === hit.life && previous.playerLife === hit.playerLife && previous.instanceId === hit.instanceId);
      const poison = effects.filter(previous => previous.venomBasic || SPELLS[previous.ability]?.school === 'poison');
      pendingHits = pendingHits.filter(previous => !poison.includes(previous));
      const pvp = enemy.ownerId || sessions.get(enemy.id)?.player === enemy;
      // Consuming poison must preserve the source spell's extra PvP reduction.
      baseDamage = poison.reduce((sum, previous) => sum + previous.damage * (pvp && ['poison-shot', 'viper-strike'].includes(previous.ability) ? .5 : 1), 0) * (1 + new Set(effects.map(previous => previous.ability)).size * .05);
    }
    return baseDamage;
  }
  function applyHarmEdict(hit) {
    if (hit.ability && !hit.basic && !hit.dot && !hit.talentSecondary && hit.enemy.hp > 0 && talentEffectRank(hit.session.player, 'edictHarm'))
      applyEdict(hit.session, hit.enemy, 'harm', edictPower(hit.session, 'damage', CLERIC_EDICTS.harmScale), hit.dueAt);
  }
  function releaseCast(session, cast, releasedAt) {
    const spell = SPELLS[cast.ability];
    let impacted = castTargets(session, cast, releasedAt);
    if (!impacted || !impacted.length && !(spell.targetRelation === 'hostile' && spell.targeting === 'radial')) { event(session, 'info', 'Cast interrupted: the target is out of reach.'); return false; }
    instantCombat.recordAction(session, 'cast', releasedAt);
    if (session.player.hp <= 0 || instantCombat.actionError(session, 'cast', releasedAt)) return false;
    const p = session.player, { ability, stats } = cast, shatterChilled = new Set();
    if (ability === 'charge' && distance(p, impacted[0]) > AUTO_ATTACKS.Knight.range) { event(session, 'info', 'Charge ended outside melee reach.'); return false; }
    if (ability === 'tame-beast') {
      if (!canTame(session, impacted[0], releasedAt)) { event(session, 'info', 'Tame failed: choose a living non-boss creature at or below your level outside Instant Combat. Event creatures cannot be tamed.'); return false; }
      const target = impacted[0];
      p.tamedCompanion = { kind: target.kind, level: target.level, hp: combatCompanionStats(target.level).maxHp };
      session.companion = null;
      session.abilityCooldowns[ability] = releasedAt + spell.cooldownMs;
      broadcast({ type: 'combat', playerId: p.id, zone: p.zone, instanceId: session.instanceId, ability, startedAt: releasedAt,
        castTimeMs: cast.endsAt - cast.startedAt, from: { x: p.x, z: p.z }, rotation: cast.rotation, targets: [{ id: target.id, x: target.x, z: target.z }] }, p.zone, session.instanceId);
      event(session, 'reward', `${target.name} is now your companion. Manage it in Pets (V).`);
      dirty(); return true;
    }
    const companion = ability === 'combined-assault' ? activeCompanion(session, releasedAt) : null;
    if (ability === 'combined-assault' && (!abilityUnlocked(ability, p.appearance.className, p.level, p.learnedSpells, p.talents)
        || !companion || companion.saved.hp <= 0 || !companionInRange(session, companion, impacted[0]))) {
      event(session, 'info', 'Your living companion must be in melee range for Combined Assault.'); return false;
    }
    if (ability === 'shatter') {
      const chilled = impacted.filter(enemy => chilledTarget(enemy, releasedAt));
      const splash = hostileTargets(session, releasedAt).filter(enemy => hostileTargetValid(session, enemy, releasedAt) && distance(p, enemy) <= spell.range + 3);
      for (const enemy of splash) if (chilledTarget(enemy, releasedAt)) shatterChilled.add(enemy);
      impacted = chilled.flatMap(center => splash.filter(enemy => distance(center, enemy) <= 3 && canTraverse(center, enemy,
        session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS)));
      for (const enemy of chilled) (sessions.get(enemy.id)?.player === enemy ? sessions.get(enemy.id) : enemy).talentChill = null;
    }
    const ricochets = ability === 'ricochet-shot' ? ricochetHits(impacted) : null;
    if (ricochets) impacted = ricochets.map(hit => hit.target);
    if (ability === 'arcane-volley' && impacted.length) impacted = Array.from({ length: 7 }, (_, index) => impacted[index % impacted.length]);
    session.nextAutoAttackAt = Math.max(session.nextAutoAttackAt || 0, releasedAt + AUTO_ATTACKS[p.appearance.className].cooldownMs);
    const damage = spellDamage(spell, stats), special = spell.damageStat === 'specialDamage';
    if (!spell.channel) session.abilityCooldowns[ability] = releasedAt + spell.cooldownMs;
    broadcast({ type: 'combat', playerId: p.id, zone: p.zone, instanceId: session.instanceId, ability, startedAt: releasedAt,
      castTimeMs: spell.channel ? 0 : cast.endsAt - cast.startedAt, from: { x:p.x, z:p.z }, rotation: cast.rotation, targets: impacted.map(({ id, x, z }) => ({ id, x, z })) }, p.zone, session.instanceId);
    const state = session.combatTalents ||= {};
    if (spell.movementDistance || spell.movementSpeedMultiplier) {
      if (spell.clearMovementImpairments) {
        if (session.duelStatus) { session.duelStatus.slowUntil = 0; session.duelStatus.slowMultiplier = 1; }
        session.talentChill = null;
        instantCombat.clearMovementImpairments(session);
      }
      if (spell.movementDistance) {
        if (!cast.chargeEnd) { Object.assign(p, mobilityDestination(session, spell.movementDistance)); resetJump(session); }
        if (!session.instanceId) p.zone = regionAt(p.x, p.z);
        session.moveBudget = 0; session.lastMove = releasedAt; session.mobilityGraceUntil = releasedAt + 250;
        correction(session, '');
      }
      if (spell.movementSpeedMultiplier) {
        state.movementSpeedUntil = releasedAt + spell.buffDurationMs;
        state.movementSpeedMultiplier = spell.movementSpeedMultiplier;
        session.moveBudget = 0; session.lastMove = releasedAt;
      }
      dirty(); return true;
    }
    if (spell.effect === 'revive') {
      for (const target of impacted) {
        const recipient = sessions.get(target.id);
        cancelHits(recipient); cancelGathering(recipient);
        target.hp = Math.max(1, Math.round(target.maxHp * spell.reviveHealthFraction)); target.diedAt = 0;
        recipient.shield = null; resetJump(recipient);
        recipient.lifeStartedAt = Math.max(releasedAt, (recipient.lifeStartedAt || 0) + 1);
        recipient.lastMove = releasedAt; recipient.moveBudget = .8 / WALK_SPEED;
        correction(recipient, `${p.name} revived you.`);
        broadcast({ type: 'damage', targetId: target.id, targetKind: 'player', amount: target.hp,
          x: target.x, z: target.z, effect: 'heal' }, target.zone, recipient.instanceId);
      }
      dirty(); return true;
    }
    if (ability === 'edict-of-the-dawn') {
      for (const target of impacted) applyEdict(session, target, 'dawn', edictPower(session, 'heal', CLERIC_EDICTS.dawnTickScale), releasedAt);
      return true;
    }
    if (ability === 'eternal-edict') {
      for (const host of [...sessions.values(), ...enemies].flatMap(host => host.player && host.companion ? [host, host.companion] : [host])) {
        const target = host.player || host;
        for (const mark of host.edicts?.values() || []) if (mark.source === session && mark.until > releasedAt && edictValid(mark, target, releasedAt)) {
          mark.until = mark.repeatUntil = releasedAt + spell.buffDurationMs;
          if (mark.kind === 'titan' && host.shield === mark.shield) mark.shield.endsAt = mark.until;
        }
      }
      return true;
    }
    if (ability === 'courageous-call') {
      const rank = talentEffectRank(p, 'intoTheFray');
      for (const target of impacted) {
        const recipient = sessions.get(target.id);
        (recipient.combatTalents ||= {}).courage = { until: releasedAt + spell.buffDurationMs, damageBonus: spell.damageBonusPercent / 100, critChance: rank === 2 ? .15 : rank === 1 ? .07 : 0 };
      }
      return true;
    }
    if (ability === 'lord-of-battle') {
      const mark = { source: session, sourceLife: session.lifeStartedAt, until: releasedAt + spell.markDurationMs, damage };
      for (const enemy of impacted) (sessions.get(enemy.id)?.player === enemy ? sessions.get(enemy.id) : enemy).battleMark = { ...mark, life: combatTargetLife(enemy) };
      for (const ally of knightAllies(session, spell.range, releasedAt)) (ally.combatTalents ||= {}).battleMark = { ...mark, life: ally.lifeStartedAt };
      return true;
    }
    if (ability === 'guard') state.guard = { until: releasedAt + spell.buffDurationMs, absorbed: 0 };
    if (ability === 'adamant-guardian') {
      state.guardian = { until: releasedAt + spell.buffDurationMs, counterReadyAt: 0 };
      for (const enemy of knightEnemies(session, p, 9, releasedAt)) tauntEnemy(session, enemy, releasedAt, spell.tauntDurationMs);
      return true;
    }
    if (spell.effect !== 'damage') {
      for (const target of impacted) {
        const recipient = sessions.get(target.id);
        if (spell.effect === 'shield') {
          const previous = recipient.shield?.endsAt > releasedAt ? recipient.shield.amount : 0;
          recipient.shield = { amount: Math.max(previous,damage), endsAt: releasedAt + (spell.shieldDurationMs || 15000) };
          event(recipient, 'reward', `${spell.label} absorbs up to ${recipient.shield.amount} damage.`);
          clericSupportTalents(session, recipient, damage, releasedAt, false);
          if (ability === 'titans-edict') applyEdict(session, target, 'titan', damage, releasedAt, { shield: recipient.shield });
          if (talentEffectRank(p, 'edictProtection')) applyEdict(session, target, 'protection', edictPower(session, 'shield', CLERIC_EDICTS.protectionScale), releasedAt);
        } else {
          const healed = restoreHealth(recipient, damage, releasedAt, false, session);
          if (talentEffectRank(p, 'edictLight')) applyEdict(session, target, 'light', edictPower(session, 'heal', CLERIC_EDICTS.lightScale), releasedAt);
          if (healed > 0) {
            // Healing an engaged ally generates half of its effective healing as threat.
            for (const enemy of enemies) if (enemy.alive && enemy.instanceId === session.instanceId && distance(p,enemy) <= CHASE_DISTANCE && worldBossCombatAllowed(enemy,p)
                && (enemy.target === recipient || enemy.threat.has(recipient))) {
              enemy.threat.set(session,(enemy.threat.get(session)||0)+healed*.5);
              if (enemy.worldBoss) { enemy.participants.add(p.id); enemy.lastEngagedAt = releasedAt; }
            }
            dirty();
          }
        }
      }
      return true;
    }
    const shieldHops = ability === 'powerful-throw' || ability === 'ricochet-shot' ? shieldThrowHops(p, impacted) : null;
    impacted.forEach((enemy, index) => {
      const timing = shieldHops?.[index] || combatTiming(ability, distance(p, enemy), index), dueAt = releasedAt + (timing.delay + timing.flight) * 1000;
      const hit = { session, enemy, life: combatTargetLife(enemy), playerLife: session.lifeStartedAt, duelId: enemy.ownerId || sessions.get(enemy.id)?.player === enemy ? session.duel?.id : undefined, zone: p.zone, instanceId: session.instanceId, ability, stats, damage: Math.round(damage * (ricochets?.[index].damageMultiplier ?? 1)), shatterChilled: shatterChilled.has(enemy), arcaneVolley: ability === 'arcane-volley', forceRepeat: ability === 'arcane-volley' && index === 0, attackerLevel: cast.attackerLevel, special, dueAt, status: spell.status ? { ...spell.status, durationMs: spell.status.durationMs * (1 + (spell.status.kind === 'slow' ? stats.spellBonuses?.control || 0 : 0) / 100) } : undefined };
      if (companion) {
        hit.damage = Math.round(autoAttackDamage(p.appearance.className, stats) * 1.5);
        companion.target = enemy; companion.targetLife = hit.life;
        companion.assault = { ...hit, ability: undefined, companion, damage: Math.round(combatCompanionStats(companion.saved.level).damage * 1.5), attackerLevel: companion.saved.level };
      }
      pendingHits.push(hit);
      if (ability === 'powerful-throw' && index === impacted.length - 1) state.thrownShield = { x: enemy.x, z: enemy.z, availableAt: dueAt, expiresAt: dueAt + 15000 };
    });
    pendingHits.sort((a, b) => a.dueAt - b.dueAt);
    return true;
  }
  function finishCasts(now, before = Infinity, duelId) {
    // Always process the earliest completion/tick first so a delayed frame cannot reorder deaths and healing.
    for (;;) {
      const session = [...sessions.values()].filter(s => s.casting && (!duelId || s.casting.duelId === duelId) && (s.casting.nextTickAt ?? s.casting.endsAt) <= now && (s.casting.nextTickAt ?? s.casting.endsAt) < before)
        .sort((a,b) => (a.casting.nextTickAt ?? a.casting.endsAt) - (b.casting.nextTickAt ?? b.casting.endsAt))[0];
      if (!session) return;
      const cast = session.casting, at = cast.nextTickAt ?? cast.endsAt;
      resolveHits(at, before, duelId);
      if (session.casting !== cast) continue;
      if (cast.ability === 'mount') {
        const p = session.player;
        if (liveSession(session, at) && p.hp > 0 && session.lifeStartedAt === cast.playerLife && session.instanceId === cast.instanceId
            && !session.instanceId && session.jump.grounded && distance(p, cast.from) <= .01 && !waterAt(p.x, p.z) && !buildingAt(p.x, p.z)
            && p.level >= MOUNT_UNLOCK_LEVEL && p.ridingRank && hasMount(session, cast.mount)) {
          session.travel.mount = cast.mount;
          // Casting time cannot accumulate movement credit at riding speed.
          session.moveBudget = Math.min(session.moveBudget, .1); session.lastMove = at;
        }
        cancelCast(session);
        continue;
      }
      advanceKnightCharge(session, at);
      if (session.casting !== cast) continue;
      const released = releaseCast(session,cast,at);
      if (!released || !cast.channel || at >= cast.endsAt) cancelCast(session);
      else cast.nextTickAt = Math.min(cast.endsAt,at + SPELLS[cast.ability].channel.tickMs);
    }
  }
  function resolveHits(now, before = Infinity, matchId) {
    for (;;) {
      const index = matchId ? pendingHits.findIndex(hit => hit.duelId === matchId) : 0, next = pendingHits[index];
      if (expireBurning(Math.min(now, next?.dueAt ?? now))) continue;
      if (resolveEdictTimer(Math.min(now, next?.dueAt ?? now), before, matchId)) continue;
      if (resolveKnightTimer(Math.min(now, next?.dueAt ?? now), before, matchId)) continue;
      if (!next || next.dueAt > now || next.dueAt >= before) return;
      const [hit] = pendingHits.splice(index, 1);
      const { session, enemy, life, zone, instanceId, attackerLevel, special, status, dueAt, basic, range, playerLife, duelId } = hit;
      for (const other of sessions.values()) advanceKnightCharge(other, dueAt);
      let baseDamage = hit.damage;
      const p = session.player;
      if (sessions.get(p.id) !== session || session.socket.readyState !== WebSocket.OPEN || session.expiresAt && session.expiresAt <= now
          || p.hp <= 0 || session.instanceId !== instanceId || !hostileTargetValid(session, enemy, dueAt) || combatTargetLife(enemy) !== life
          || session.lifeStartedAt !== playerLife || duelId && session.duel?.id !== duelId) continue;
      if (basic && !hit.projectile && (session.autoAttack?.enemy !== enemy || session.autoAttack.targetLife !== life
          || autoAttackPaused(session, dueAt) || AUTO_ATTACKS[p.appearance.className].visual === 'melee' && !autoAttackInRange(session, enemy, range))) continue;
      const pet = activeCompanion(session, dueAt);
      if (hit.companion && (pet !== hit.companion || pet.saved.hp <= 0 || session.casting?.ability === 'tame-beast'
          || session.duelStatus?.stunUntil > dueAt || pet.stunUntil > dueAt || !companionInRange(session, pet, enemy))) continue;
      if (basic && pet?.saved.hp > 0 && talentEffectRank(p, 'everlastingBond')) {
        const rank = talentEffectRank(p, 'everlastingBond');
        if (pet.bondReady) {
          baseDamage = Math.round(baseDamage * (1 + rank * .1)); pet.bondReady = false;
          healCompanion(session, combatCompanionStats(pet.saved.level).maxHp * rank * .05, dueAt);
        }
      }
      if (hit.ability && !hit.dot) {
        const spell = SPELLS[hit.ability], slowed = chilledTarget(enemy, dueAt) || (sessions.get(enemy.id)?.duelStatus?.slowUntil || enemy.slowUntil || 0) > dueAt;
        baseDamage = Math.round(baseDamage * spellTargetMultiplier(spell, hit.stats, slowed, enemy.hp / enemy.maxHp));
        if (status?.ticks) {
          // One application per caster and ability: recasting refreshes instead of stacking hidden ticks.
          pendingHits = pendingHits.filter(previous => !(previous.dot && previous.session === session && previous.enemy === enemy && previous.ability === hit.ability));
          scheduleDot(hit, spellPeriodicDamage(spell, hit.stats), status.ticks, status.durationMs, dueAt);
        }
      }
      baseDamage = applyTalentHit(hit, baseDamage);
      if (baseDamage <= 0) continue;
      if (basic && talentEffectRank(p, 'wideSwing')) {
        const rank = talentEffectRank(p, 'fineCuts');
        const cleaved = knightEnemies(session, enemy, 3, dueAt).filter(other => other !== enemy && autoAttackInRange(session, other, AUTO_ATTACKS.Knight.range))
          .sort((a,b) => distance(enemy,a)-distance(enemy,b)).slice(0, rank === 2 ? 2 : 1);
        for (const other of cleaved) queueKnightHit(session, other, Math.round(baseDamage * (1 + rank * .15)), dueAt);
      }
      const courage = session.combatTalents?.courage;
      if (!hit.reflected) {
        if (courage?.until > dueAt) baseDamage = Math.round(baseDamage * (1 + courage.damageBonus));
        const critChance = (hit.stats?.critChance || 0) + (courage?.until > dueAt ? courage.critChance : 0);
        if (!hit.dot && !hit.talentSecondary && !hit.companion && critChance > 0 && Math.random() < critChance) baseDamage *= 2;
      }
      if (hit.ability === 'taunt') tauntEnemy(session, enemy, dueAt, SPELLS.taunt.tauntDurationMs);
      const marked = sessions.get(enemy.id)?.player === enemy ? sessions.get(enemy.id) : enemy, mark = marked.battleMark;
      if (!hit.talentSecondary && mark?.until > dueAt && mark.life === life && mark.sourceLife === mark.source.lifeStartedAt
          && liveSession(mark.source, dueAt) && mark.source.instanceId === instanceId && friendlyTarget(mark.source, session, dueAt)) {
        marked.battleMark = null;
        queueKnightHit(mark.source, enemy, mark.damage, dueAt);
      }
      session.companionCombatUntil = dueAt + 5000;
      const damageScale = ['eagles-eye', 'power-shot', 'poison-shot', 'viper-strike'].includes(hit.ability) ? .1 : .2;
      if (pet?.saved.hp > 0) {
        if (hit.companionBasic && talentEffectRank(p, 'everlastingBond')) pet.bondReady = true;
        if (!hit.dot && !pet.assault) { pet.target = enemy; pet.targetLife = life; }
      }
      if (enemy.ownerId) {
        const recipient = sessions.get(enemy.ownerId), damage = Math.max(1, Math.round((Math.round(baseDamage * (hit.arcaneVolley ? .4 : 1) * storeBoostMultiplier(p, 'damage', dueAt)) - combatCompanionStats(enemy.level).defense) * damageScale));
        damageCompanion(recipient, damage, dueAt, hit.edictProc);
        applyHarmEdict(hit);
        if (enemy.hp > 0) {
          if (!enemy.target) { enemy.target = hit.companion || p; enemy.targetLife = combatTargetLife(enemy.target); }
          if (status?.kind === 'slow') { enemy.slowUntil = Math.max(enemy.slowUntil || 0, dueAt + status.durationMs); enemy.slowMultiplier = status.multiplier; }
          if (status?.kind === 'stun') {
            const duration = combatStunDuration(recipient, enemy, status.durationMs, dueAt);
            if (duration) { enemy.stunUntil = Math.max(enemy.stunUntil || 0, dueAt + duration); enemy.attackUntil = 0; }
          }
        }
        event(session, 'combat', `${p.name} hit ${enemy.name} for ${damage}${special ? ' with a special attack' : ''}.`);
        continue;
      }
      if (sessions.get(enemy.id)?.player === enemy) {
        const recipient = sessions.get(enemy.id), damage = Math.max(1, Math.round((Math.round(baseDamage * (hit.arcaneVolley ? .4 : 1) * storeBoostMultiplier(p, 'damage', dueAt)) - combatDefense(recipient, dueAt)) * damageScale));
        applyDamage(enemy, 'player', damage, instanceId, dueAt, session, hit.reflected, hit.edictProc, false, hit.ability && SPELLS[hit.ability]?.school);
        applyHarmEdict(hit);
        stand(recipient);
        if (!enemy.hp) { playerDied(recipient, dueAt); event(recipient, 'damage', `${p.name} defeated you in the colosseum. Return to the refuge to recover.`); }
        if (enemy.hp > 0 && !duelMember(recipient)?.eliminated && (!duelId || recipient.duel?.id === duelId) && status && ['slow', 'stun'].includes(status.kind)) {
          recipient.duelStatus ||= { slowUntil: 0, slowMultiplier: 1, stunUntil: 0 };
          if (status.kind === 'slow') {
            recipient.duelStatus.slowUntil = Math.max(recipient.duelStatus.slowUntil, dueAt + status.durationMs);
            recipient.duelStatus.slowMultiplier = status.multiplier;
          }
          if (status.kind === 'stun') {
            const duration = combatStunDuration(recipient, recipient, status.durationMs, dueAt);
            if (duration) {
              recipient.duelStatus.stunUntil = Math.max(recipient.duelStatus.stunUntil, dueAt + duration);
              cancelCast(recipient); cancelBasicHits(recipient);
            }
          }
          if (status.kind === 'slow' || recipient.duelStatus.stunUntil > dueAt) { recipient.moveBudget = 0; recipient.lastMove = now; }
        }
        event(session, 'combat', `${p.name} hit ${enemy.name} for ${damage}${special ? ' with a special attack' : ''}.`);
        dirty(); continue;
      }
      const damage = Math.max(1, Math.round(baseDamage * storeBoostMultiplier(p, 'damage', dueAt) / monsterLevelScale(enemy.level, attackerLevel)));
      if (enemy.kind === 'training-dummy') {
        applyDamage(enemy, 'enemy', damage, instanceId, dueAt, session, hit.reflected, hit.edictProc);
        applyHarmEdict(hit);
        event(session, 'combat', `${p.name} hit ${enemy.name} for ${damage}${special ? ' with a special attack' : ''}.`);
        continue;
      }
      if (enemy.treasure) engageTreasureGoblin(enemy.treasure, dueAt);
      // Only damage that actually lands creates threat, including poison ticks.
      if (distance(p, enemy) <= CHASE_DISTANCE) enemy.threat.set(session, (enemy.threat.get(session) || 0) + Math.min(damage, enemy.hp) * (hit.threatMultiplier || 1));
      applyDamage(enemy, 'enemy', damage, instanceId, dueAt, session, hit.reflected, hit.edictProc);
      applyHarmEdict(hit);
      if (enemy.worldBoss) { enemy.participants.add(p.id); enemy.lastEngagedAt = now; enemy.encounterStartedAt ??= dueAt; }
      if (status?.kind === 'slow') { enemy.slowUntil = Math.max(enemy.slowUntil || 0, dueAt + status.durationMs); enemy.slowMultiplier = status.multiplier; }
      if (status?.kind === 'stun' && !enemy.worldBoss && !enemy.raidId && !enemy.instantCombatRole) {
        enemy.stunUntil = Math.max(enemy.stunUntil || 0, dueAt + status.durationMs); enemy.attack = null; enemy.dungeonCastUntil = 0;
        const dungeon = dungeons.get(enemy.instanceId);
        if (dungeon) dungeon.hazards = dungeon.hazards.filter(hazard => hazard.sourceId !== enemy.id || hazard.corpse);
      }
      event(session, 'combat', `${p.name} hit ${enemy.name} for ${damage}${special ? ' with a special attack' : ''}.`);
      if (enemy.hp === 0) {
        enemy.alive = false;
        enemy.encounterStartedAt = undefined; enemy.berserk = false;
        enemy.diedAt = dueAt;
        enemy.attack = null;
        enemy.threat.clear(); enemy.target = null;
        if (raids.enemyKilled(enemy, dueAt) || instantCombat.enemyKilled(enemy)) { dirty(); continue; }
        if (enemy.storyEncounterId) { enemy.respawnAt = Infinity; dirty(); continue; }
        const dungeon = dungeons.get(enemy.instanceId);
        if (dungeon && !dungeon.dream && !dungeon.completed) dungeon.kills++;
        // A delayed projectile tick still gives nearby players the full corpse warning.
        if (dungeon) queueDungeonHazards(dungeon, enemy, dungeonDeathHazardPattern(dungeon.kind, enemy), Date.now(), true);
        if (dungeon && getDungeon(dungeon.kind).storyQuestId) { enemy.respawnAt = Infinity; dirty(); continue; }
        enemy.respawnAt = enemy.treasure || enemy.mapExpeditionId ? Infinity : now + (enemy.worldBoss ? enemy.boss.respawnMs : enemy.kind === 'root-warden' ? 60000 : 14000);
        const party = partyOf(p.id);
        // The voucher is rolled once per kill, before the party's ordinary personal loot.
        const voucher = enemy.treasure && treasureRandomInt(100) < TREASURE_GOBLIN.voucherChancePercent;
        const treasureMapEligible = !enemy.instanceId && !enemy.worldBoss && !enemy.treasure && !enemy.mapExpeditionId && enemy.id !== ROOTVAULT_GUARDIAN.id;
        const treasureMapRoll = treasureMapEligible ? treasureMapRandomInt(100) : null;
        const treasureMapDrop = treasureMapEligible && treasureMapRoll < TREASURE_MAP.dropChancePercent;
        const credited = activeSessions().filter(s => !arenaMode(s) && s.instanceId === instanceId && s.player.hp > 0 && (enemy.worldBoss ? worldBossCombatAllowed(enemy,s.player) : s === session || distance(s.player, enemy) <= 14)
          && mapGuardianAllowed(enemy, s)
          && (enemy.worldBoss ? enemy.participants.has(s.player.id) : s === session || enemy.kind === 'root-warden' || party?.members.includes(s.player.id)));
        for (const recipient of credited) {
          recipient.player.achievements.kills = Math.min(Number.MAX_SAFE_INTEGER, recipient.player.achievements.kills + 1);
          if (enemy.worldBoss) recipient.player.achievements.worldBosses = Math.min(Number.MAX_SAFE_INTEGER, recipient.player.achievements.worldBosses + 1);
          if (enemy.id === ROOTVAULT_GUARDIAN.id && (recipient === session || party?.members.includes(recipient.player.id)) && !recipient.player.rootvaultUnlocked) {
            recipient.player.rootvaultUnlocked = true; event(recipient, 'reward', 'Rootvault unlocked. You may now enter the dungeon.');
          }
          const baseReward = monsterStatsAtLevel(enemy.kind,enemy.level);
          const reward = { xp: Math.round(baseReward.xp * (enemy.rewardScale || 1)), gold: goldSource(Math.round(baseReward.gold * (enemy.rewardScale || 1)), enemy.worldBoss ? 'boss' : 'monster', economyVersion >= 1) };
          const id = randomUUID();
          const rolls = lootTrace.active(recipient.player.id) ? [] : null;
          const items = rolledLoot(enemy.kind, enemy.level, recipient.player, enemy, rolls ? detail => rolls.push(detail) : undefined);
          const mount = rollDungeonMount(dungeon?.kind, enemy, recipient.player.ownedMounts, mountRandomInt);
          if (mount) items.push({ id: `item:${mount}`, kind: 'item', itemId: mount, quantity: 1, quality: LOOT_ITEMS[mount].quality });
          if (treasureMapDrop && recipient === session) items.push({ id: 'item:treasure-map', kind: 'item', itemId: 'treasure-map', quantity: 1, quality: LOOT_ITEMS['treasure-map'].quality });
          if (voucher && recipient === session) items.push({ id: 'item:moss-voucher', kind: 'item', itemId: 'moss-voucher', quantity: 1, quality: LOOT_ITEMS['moss-voucher'].quality });
          lootDrops.set(id, { id, enemyId: enemy.id, ownerId: recipient.player.id, zone: enemy.zone, instanceId, kind: enemy.kind, ...(enemy.model ? { model: enemy.model } : {}), name: enemy.name, x: enemy.x, z: enemy.z, diedAt: enemy.diedAt, rotation: enemy.rotation, gold: reward.gold, goldReason: enemy.worldBoss ? 'reward:world_boss' : 'reward:monster', relic: enemy.worldBoss ? enemy.boss.relic : 0, items, expiresAt: now + 5 * 60 * 1000 });
          if (rolls) lootTrace.write(recipient.player.id, 'generated', { dropId: id,
            enemy: { id: enemy.id, kind: enemy.kind, level: enemy.level, instanceId }, killer: recipient === session,
            map: { eligible: treasureMapEligible, roll: treasureMapRoll, chancePercent: TREASURE_MAP.dropChancePercent,
              awarded: !!treasureMapDrop && recipient === session, reason: !treasureMapEligible ? 'ineligible_source' : recipient !== session ? 'not_killer' : treasureMapDrop ? 'awarded' : 'roll_missed' },
            rolls, items: lootRows(lootDrops.get(id)), bags: lootTraceBag(recipient.player) });
          reward.xp = addXp(recipient, reward.xp);
          creditObjective(recipient, 'kill', enemy.kind);
          contractProgress(recipient.player.contracts, 'kill', enemy.kind, 1, {zone:enemy.zone,regionId:surfaceAt(enemy.homeX,enemy.homeZ).regionId,level:enemy.level});
          // Private dreams, raids, arenas and Instant Combat cannot satisfy public-world story objectives.
          if (!instanceId || dungeon && !dungeon.dream) storyQuestProgress(recipient.player.storyQuests, { kind: 'kill', target: enemy.kind,
            scope: dungeon ? 'dungeon' : 'overworld', zone: enemy.zone, regionId: surfaceAt(enemy.homeX, enemy.homeZ).regionId, dungeonId: dungeon?.kind, targetLevel: enemy.level, spawnId: enemy.id });
          event(recipient, 'reward', `+${reward.xp} XP · ${enemy.name} defeated · Loot the remains for ${reward.gold} gold.`, true);

        }
        if (enemy.mapExpeditionId) finishMapGuardian(enemy);
      }
      dirty();
    }
  }
  function finishGathering(session, now) {
    const gathering = session.gathering;
    if (!gathering) return;
    const p = session.player;
    const node = nodes.find(n => n.id === gathering.nodeId && n.instanceId === session.instanceId);
    const resource = node && RESOURCE_TYPES[node.kind];
    if (p.hp <= 0 || !node?.available || swimming(session) || !physicalReach(session, node, 3, `resource:${node.id}`) || gatheringClaims.get(node.id) !== session) { cancelGathering(session); return; }
    if (!canGather(node.kind, p.skills[resource.skill])) {
      cancelGathering(session); event(session, 'info', `${resource.label} requires ${SKILLS[resource.skill].label} level ${resource.requiredLevel}.`); return;
    }
    if (now < gathering.endsAt || committingAccounts.has(session.recordKey)) return;
    cancelGathering(session);
    const inventory = resource.item ? p.inventory : { ...p.inventory, [resource.reward]: p.inventory[resource.reward] + resource.yield };
    const carriedItems = resource.item ? { ...p.carriedItems, [resource.item]: (p.carriedItems?.[resource.item] || 0) + resource.yield } : p.carriedItems;
    if (!bagCanFit(p, { inventory, carriedItems })) { event(session, 'info', 'Your bags are full. Make room before gathering.'); return; }
    node.available = false;
    depletedResources[`depleted:${node.id}`] = true;
    updateCollisionSceneState(overworldCollisionKey, depletedResources);
    node.respawnAt = now + (node.respawnMs || 22000);
    const oldXp = p.skills[resource.skill], oldLevel = skillProgress(oldXp).level;
    p.inventory = inventory; p.carriedItems = carriedItems;
    p.skills[resource.skill] = Math.min(MAX_SKILL_XP, oldXp + Math.floor(gatheringXpGain(node.kind, oldXp) * storeBoostMultiplier(p, 'profession-xp', now)));
    p.achievements.gathered = Math.min(Number.MAX_SAFE_INTEGER, p.achievements.gathered + 1);
    const adventureXp = addXp(session, resource.adventureXp);
    creditObjective(session, 'gather', node.kind);
    contractProgress(p.contracts, 'gather', node.kind, 1, {zone:node.zone,regionId:surfaceAt(node.x,node.z).regionId});
    if (!session.instanceId) storyQuestProgress(p.storyQuests, { kind: 'gather', target: node.kind, scope: 'overworld', zone: node.zone, regionId: surfaceAt(node.x, node.z).regionId, siteId: node.siteId, spawnId: node.id, amount: resource.yield });
    event(session, 'reward', `+${resource.yield} ${resource.item ? LOOT_ITEMS[resource.item].label : resource.reward} · +${p.skills[resource.skill] - oldXp} ${SKILLS[resource.skill].label} XP · +${adventureXp} adventure XP`, true);
    const level = skillProgress(p.skills[resource.skill]).level;
    if (level > oldLevel) {
      const unlocked = gatheringUnlocks(resource.skill, oldLevel, level).map(kind => RESOURCE_TYPES[kind].label);
      event(session, 'reward', `${SKILLS[resource.skill].label} level ${level}!${unlocked.length ? ` Unlocked: ${unlocked.join(', ')}.` : ' You gather a little faster.'}`);
    }
    dirty();
  }
  function creditObjective(session, kind, target) {
    const q = session.player.quest;
    const chapter = CHAPTERS[q.chapter];
    if (q.completed || q.stage !== 1 || session.player.zone !== chapter.zone) return;
    const objective = chapter.objectives.find(o => o.kind === kind && o.target === target);
    if (!objective) return;
    q.progress[objective.id] = Math.min(objective.count, q.progress[objective.id] + 1);
    q.kills = chapter.objectives.filter(o => o.kind === 'kill').reduce((n, o) => n + q.progress[o.id], 0);
    q.crystals = chapter.objectives.filter(o => o.kind === 'gather').reduce((n, o) => n + q.progress[o.id], 0);
    if (objectivesDone(q)) {
      q.stage = 2;
      if (kind !== 'interact') event(session, 'reward', `Objectives complete. Return to ${NPCS.find(n => n.id === chapter.npcId)?.name || 'the beacon'}.`);
    }
  }
  function grantChapterReward(session, chapter) {
    const p = session.player, inventory = { ...p.inventory, potion: p.inventory.potion + (chapter.reward.potions || 0) };
    if (!bagCanFit(p, { inventory }) || !Number.isSafeInteger(p.gold + chapter.reward.gold)) {
      event(session, 'info', 'Make room in your bags before collecting the quest reward.'); return false;
    }
    changeGold(session.player, chapter.reward.gold, 'reward:campaign');
    session.player.inventory = inventory;
    const earnedXp = addXp(session, chapter.reward.xp);
    event(session, 'reward', `Chapter complete · +${earnedXp} XP · +${chapter.reward.gold} gold${chapter.reward.potions ? ` · +${chapter.reward.potions} potions` : ''}`, true);
    return true;
  }
  function addXp(session, amount, boosted = true) {
    if (boosted) amount = Math.floor(amount * storeBoostMultiplier(session.player, 'combat-xp'));
    // Accepted NFT reservations freeze specialist progression throughout the async save.
    if (!committingAccounts.get(session.recordKey)?.specialistNft) awardSpecialistXp(session.player, amount);
    const p = session.player, previousHp = p.hp, previousMaxHp = p.maxHp;
    const remainingXp = (MAX_LEVEL - p.level) * (p.level + MAX_LEVEL - 1) * 50 - p.xp;
    amount = Math.max(0, Math.min(amount, remainingXp));
    p.xp += amount;
    while (p.level < MAX_LEVEL && p.xp >= p.level * 100) {
      p.xp -= p.level * 100;
      p.level++;
      p.maxHp = maxHealth(p);
      event(session, 'reward', `Level ${p.level}!`);
      for (const spell of spellsForClass(p.appearance.className)) if (spell.requiredLevel === p.level) {
        event(session, 'reward', `Training available: ${spell.label}. Visit your class trainer to learn it.`);
      }
      if (p.level === MOUNT_UNLOCK_LEVEL) event(session, 'reward', 'Riding training available! Visit a riding trainer, then buy a mount from a mount seller.');
      if (p.level === MOUNT_UPGRADE_LEVEL) event(session, 'reward', 'Expert riding training available! Visit a riding trainer to improve your mount speed.');
    }
    if (p.level === MAX_LEVEL) p.xp = 0;
    if (p.maxHp > previousMaxHp && previousHp > 0) restoreHealth(session, p.maxHp);
    if (amount > 0) send(session.socket, { type: 'damage', targetId: p.id, targetKind: 'player', amount, x: p.x, z: p.z, effect: 'xp' });
    if (amount > 0) recordReferralGameplay(session);
    checkAchievements(session);
    return amount;
  }

  const gmAuthorized = connection => !!connection && hasGmRole(connection)
    && accountConnections.get(connection.recordKey) === connection && !connection.account?.ban && liveSession(connection.session);
  function moderationDisconnect(connection, action, reason) {
    send(connection.socket, { type: 'gmNotice', action, text: reason || (action === 'ban' ? 'Your account has been banned.' : 'You were disconnected by a game master.') });
    leaveSession(connection);
    connection.socket.close(action === 'ban' ? 4409 : 4408, action === 'ban' ? 'Account banned' : 'Kicked by a game master');
  }
  function gmResult(connection, message, success, text) {
    // Keep moderation auditable without storing provider subjects or bearer tokens.
    console.info('GM action:', JSON.stringify({ actorId: connection.session?.player.id ?? null,
      targetId: typeof message.targetId === 'string' ? cleanText(message.targetId, 36) : null,
      action: cleanText(message.action, 24), success, text,
      ...(gmActionValid(message) ? { amount: message.amount, item: message.item, reason: message.reason, enabled: message.enabled } : {}) }));
    send(connection.socket, { type: 'gmResult', success, text });
  }
  async function performGmAction(connection, message) {
    const result = (success, text) => gmResult(connection, message, success, text);
    if (!gmAuthorized(connection)) { result(false, 'Game master access is required.'); return; }
    if (!gmActionValid(message)) { result(false, 'Invalid game master action or value.'); return; }
    const target = sessions.get(message.targetId);
    if (['startLootTrace', 'stopLootTrace', 'getLootTrace'].includes(message.action)) {
      if (message.action === 'startLootTrace') {
        if (!liveSession(target)) { result(false, 'Choose an online character in this realm.'); return; }
        if (committingAccounts.has(target.recordKey) || releasingAccounts.has(target.recordKey)) { result(false, 'Wait for this character’s pending save before starting a trace.'); return; }
        const alreadyActive = lootTrace.active(target.player.id);
        try { lootTrace.start(target.player, connection.session.player.id); }
        catch (error) { result(false, error.message); return; }
        if (!alreadyActive) {
          target.lootTraceVersion = (target.lootTraceVersion || 0) + 1;
          target.lootTracePetReason = undefined;
          lootTrace.write(target.player.id, 'player_state', { bags: lootTraceBag(target.player), level: target.player.level,
            summonedPet: publicNftOwnership(target).summonedPet, maps: target.player.carriedItems['treasure-map'] || 0 });
          for (const drop of lootDrops.values()) if (drop.ownerId === target.player.id)
            lootTrace.write(target.player.id, 'existing_loot', { dropId: drop.id, enemyId: drop.enemyId, expiresAt: drop.expiresAt, items: lootRows(drop) });
        }
        result(true, `Loot trace ${alreadyActive ? 'already running' : 'started'} for ${target.player.name}: up to 30 minutes or 1,000 events.`);
      } else {
        const report = message.action === 'stopLootTrace' ? lootTrace.stop(message.targetId) : lootTrace.report(message.targetId);
        if (!report) { result(false, 'No loot trace is retained for this character in this realm.'); return; }
        if (message.action === 'getLootTrace') send(connection.socket, { type: 'gmLootTrace', report });
        result(true, `Loot trace ${message.action === 'stopLootTrace' ? 'stopped' : 'ready to download'} for ${report.player.name}: ${report.events.length} events.`);
      }
      send(connection.socket, snapshot(connection.session)); return;
    }
    if (!liveSession(target)) { result(false, 'Choose an online character.'); return; }
    if (committingAccounts.has(connection.recordKey) || committingAccounts.has(target.recordKey)) {
      result(false, 'That account is finishing another action. Please try again.'); return;
    }
    const actor = connection.session;
    if (message.action === 'startInstantCombat') {
      if (target !== actor) { result(false, 'Start Instant Combat from your own game master controls.'); return; }
      const error = instantCombat.startRegistration(Date.now());
      if (!error) for (const viewer of sessions.values()) send(viewer.socket, snapshot(viewer));
      result(!error, error || 'Instant Combat registration opened for five minutes. Players choose whether to join; registered players then receive 90 seconds to prepare.'); return;
    }
    const assistedRun = dungeons.get(target.instanceId);
    if (assistedRun && !assistedRun.completed) assistedRun.unrankedReason = 'A game master assisted this run.';
    if (actor.zeppelin || target.zeppelin && !['kick', 'ban'].includes(message.action)) { result(false, 'Wait until the zeppelin lands.'); return; }
    if (message.action === 'spawnTreasureGoblin') {
      if (target !== actor) { result(false, 'Spawn a treasure goblin near your own character.'); return; }
      if (actor.player.hp <= 0 || actor.instanceId || !overworldSpawnAllowed(actor.player, actor.player.zone)) {
        result(false, 'Enter the overworld wilderness alive to spawn a treasure goblin.'); return;
      }
      const spawned = spawnTreasureGoblin(actor.player, Date.now(), activeSessions().filter(s => s.player.hp > 0 && !s.zeppelin), true);
      if (spawned) send(actor.socket, snapshot(actor));
      result(spawned, spawned ? 'Treasure goblin spawned nearby.' : 'No safe wilderness spot nearby. Move and try again.'); return;
    }
    if (['setInvisible', 'setTagHidden', 'setFlying'].includes(message.action)) {
      if (target !== actor) { result(false, 'Game master modes can only change your own character.'); return; }
      if (message.action === 'setFlying' && message.enabled && actor.player.hp <= 0) { result(false, 'Return to life before flying.'); return; }
      const field = { setInvisible: 'invisible', setTagHidden: 'tagHidden', setFlying: 'flying' }[message.action];
      if (actor.gm[field] !== message.enabled) {
        const flightJump = gmFlying(actor) ? { ...actor.jump } : null;
        if (field !== 'tagHidden') {
          cancelTradeFor(actor.player.id, 'Trade cancelled because a game master changed modes.');
          cancelGathering(actor); cancelHits(actor);
        }
        actor.gm[field] = message.enabled;
        if (flightJump && field === 'invisible') actor.jump = flightJump;
        if (field === 'flying') {
          if (!message.enabled) landGm(actor);
          else { resetJump(actor); actor.jump.sequence++; actor.lastMove = Date.now(); actor.moveBudget = 0; }
        }
        if (field === 'invisible' && message.enabled) {
          for (const [id, invite] of invitations) if (invite.inviterId === actor.player.id || invite.targetId === actor.player.id) invitations.delete(id);
          for (const other of sessions.values()) if (other.casting?.anchor === actor.player) cancelCast(other);
        }
      }
      for (const viewer of sessions.values()) send(viewer.socket, snapshot(viewer));
      if (field === 'flying') correction(actor, message.enabled ? 'GM flight enabled.' : 'GM flight disabled.');
      result(true, `${field === 'invisible' ? 'Invisibility' : field === 'tagHidden' ? 'Hidden GM tag' : 'Flight'} ${message.enabled ? 'enabled' : 'disabled'}.`); return;
    }
    if (['teleportTo', 'bring', 'return'].includes(message.action)) {
      const moved = message.action === 'teleportTo' ? actor : target;
      if (message.action !== 'return' && actor === target) { result(false, 'Choose another character to teleport to or bring.'); return; }
      if (actor.player.hp <= 0 || moved.player.hp <= 0 || message.action !== 'return' && target.player.hp <= 0) { result(false, 'Relocate living characters only.'); return; }
      const previous = gmLocation(moved), anchor = message.action === 'teleportTo' ? target : actor;
      const destination = message.action === 'return' ? moved.gmReturnPosition : { ...gmLocation(anchor),
        returnPosition: anchor.instanceId ? moved.returnPosition || { x: moved.player.x, z: moved.player.z, rotation: moved.player.rotation, zone: moved.player.zone } : null };
      if (!destination) { result(false, 'That character has no saved GM return position.'); return; }
      if (isArenaInstance(destination.instanceId)) { result(false, 'Arena instances are reserved for their accepted fighters.'); return; }
      if (isInstantCombatInstance(destination.instanceId) && instantCombat.bySession(moved)?.id !== destination.instanceId) { result(false, 'Instant Combat instances are reserved for their registered participants.'); return; }
      if (moved.duel?.order) await endDuel(moved, 'Arena match forfeited because a game master relocated a fighter.');
      const priorReturn = moved.gmReturnPosition;
      moved.gmReturnPosition = message.action === 'return' ? null : previous;
      if (!relocateGmPlayer(moved, destination, message.action === 'return' ? 'Returned to your previous position.' : 'Relocated by a game master.')) {
        moved.gmReturnPosition = priorReturn;
        result(false, 'That destination is no longer available.'); return;
      }
      send(actor.socket, snapshot(actor));
      result(true, `${moved.player.name} ${message.action === 'return' ? 'returned' : message.action === 'bring' ? 'brought to you' : 'teleported'}.`); return;
    }
    if (message.action === 'ban' && (connection.recordKey === target.recordKey || publicRole(target) === 'gm')) {
      result(false, 'You cannot ban yourself or another game master.'); return;
    }
    if (message.action === 'kick') {
      result(true, `${target.player.name} was disconnected.`);
      const targetConnection = accountConnections.get(target.recordKey);
      moderationDisconnect(targetConnection, 'kick', message.reason); return;
    }
    if (arenaMode(target) && ['kill', 'levelUp'].includes(message.action)) {
      const settlement = endDuel(target, 'Arena match forfeited because a game master changed a fighter.');
      if (settlement) await settlement;
      removeDuelInvitations(target.player.id);
    }
    const transaction = {}, account = records[target.recordKey];
    committingAccounts.set(target.recordKey, transaction);
    cancelTradeFor(target.player.id, 'Trade cancelled by a game master action.');
    let staged, ban, prepared = false;
    function prepare() {
      if (prepared) return;
      if (closing || !gmAuthorized(connection) || !liveSession(target) || account.ban) throw new Error('The game master or target is no longer available.');
      const p = target.player, amount = message.amount ?? 1;
      if (message.action === 'ban') {
        if (connection.recordKey === target.recordKey || publicRole(target) === 'gm') throw new Error('You cannot ban yourself or another game master.');
        ban = { at: Date.now(), by: connection.session.player.id, reason: message.reason || 'Account banned by a game master.' }; staged = {};
      } else if (message.action === 'kill') {
        if (p.hp <= 0) throw new Error('That character has already fallen.');
        staged = { hp: 0, diedAt: Date.now() };
      } else if (message.action === 'levelUp') {
        if (p.level >= GM_MAX_LEVEL) throw new Error('That character is already level 60 or higher.');
        const level = Math.min(GM_MAX_LEVEL, p.level + amount), maxHp = maxHealth({ ...p, level });
        staged = { level, xp: level === MAX_LEVEL ? 0 : p.xp, maxHp, hp: p.hp > 0 ? maxHp : 0 };
      } else if (message.action === 'giveGold') {
        if (!Number.isSafeInteger(p.gold + amount)) throw new Error('That gold amount exceeds the character limit.');
        staged = { gold: p.gold + amount, goldReason: 'admin:grant' };
      } else {
        const item = message.item;
        if (item.kind === 'mount') {
          if (p.ownedMounts.includes(item.id)) throw new Error('That character already owns this mount.');
          staged = { ownedMounts: [...p.ownedMounts, item.id] };
        } else if (item.kind === 'bag') {
          if (p.level < BAG_ITEMS[item.id].requiredLevel) throw new Error('That character cannot use this bag yet.');
          staged = { ownedBags: [...p.ownedBags, { id: randomUUID(), kind: item.id }] };
          if (!bagCanFit(p, staged)) throw new Error('Make room in that character’s bags first.');
        } else {
          if (!auctionReceive(p, item)) throw new Error('That item does not fit the character’s level, class, ownership or bag space.');
          staged = auctionItemChanges(p, item, 1);
        }
      }
      if (!savedPlayerValid({ ...p, ...staged, ...(target.returnPosition || {}) })) throw new Error('That change would create invalid character progress.');
      prepared = true;
    }
    transaction.completion = save(new Map([[target.player.id, () => { prepare(); return staged; }]]), () => {
      if (ban) {
        account.ban = ban;
        for (const other of connections.values()) if (other.recordKey === target.recordKey) moderationDisconnect(other, 'ban', ban.reason);
      } else if (message.action === 'kill') {
        if (target.player.hp <= 0) return; // A combat death during the save keeps its original animation time.
        endDuel(target, 'Duel ended by a game master.');
        target.shield = null;
        applyDamage(target.player, 'player', target.player.hp, target.instanceId, Date.now(), undefined, false, true, true);
        playerDied(target, Date.now()); dirty();
      } else if (message.action === 'levelUp') {
        // Combat can advance while a database reply is pending. Apply the level
        // grant to current XP, using normal level-up healing without resurrecting a death.
        addXp(target, gmLevelAward(target.player, message.amount ?? 1), false);
        dirty();
      } else Object.assign(target.player, staged);
    }, new Map([[target.recordKey, () => { prepare(); return ban ? { ban } : {}; }]]))
      .then(() => result(true, `${message.action === 'ban' ? 'Account banned' : message.action === 'kill' ? 'Character defeated' : message.action === 'levelUp' ? 'Levels granted' : message.action === 'giveGold' ? 'Gold granted' : message.item?.kind === 'mount' ? 'Mount unlocked' : 'Item granted'}: ${target.player.name}.`))
      .catch(error => {
        console.error('GM action save failed:', error.message);
        result(false, 'Action was not applied. Saving failed or the character is no longer eligible.'); dirty();
      })
      .finally(() => {
        if (committingAccounts.get(target.recordKey) === transaction) committingAccounts.delete(target.recordKey);
        if (liveSession(target)) send(target.socket, snapshot(target));
      });
    await transaction.completion;
  }

  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  let accountStoreReady = false, deletionTask, lastDeletionPoll = 0;
  function disconnectDeletingAccount(connection) {
    if (connection.deleting) return;
    connection.deleting = true;
    leaveSession(connection);
    connection.socket.close(4410, 'Account deletion requested');
    void releaseAccount(connection).catch(() => {});
  }
  function clearDeletedAccount(key) {
    const ids = records[key]?.characters.map(player => player.id) || [];
    for (const id of ids) {
      lootTrace.clear(id);
      activity.delete(id); cancelTradeFor(id, 'This account was deleted.'); leaveParty(id); removeDuelInvitations(id);
      for (const [targetId, summon] of dungeonSummons) if (summon.from.player.id === id || summon.target.player.id === id) dungeonSummons.delete(targetId);
      for (const [inviteId, invite] of invitations) if (invite.inviterId === id || invite.targetId === id) invitations.delete(inviteId);
      for (const [dropId, drop] of lootDrops) if (drop.ownerId === id) removeLootDrop(dropId, 'character_deleted');
      for (const enemy of enemies) { enemy.participants?.delete(id); for (const session of enemy.threat.keys()) if (session.player.id === id) enemy.threat.delete(session); if (enemy.target?.player.id === id) enemy.target = null; }
    }
    for (const session of activity.values()) {
      if (session.duelResult?.result.members?.some(member => ids.includes(member.id))) session.duelResult = null;
      for (const [messageId, receipt] of session.recentChat || []) if (ids.includes(receipt.targetId)) session.recentChat.delete(messageId);
    }
    delete records[key]; lastSaved.delete(key);
    if (ids.length) for (const connection of connections.values()) if (connection.joined) send(connection.socket, { type: 'communityErase', playerIds: ids });
  }
  function runAccountDeletions() {
    if (!database || !accountStoreReady || closing) return Promise.resolve();
    if (deletionTask) return deletionTask;
    deletionTask = (async () => {
      const requests = await database.deletionRequests();
      for (const row of requests) { const active = accountConnections.get(row.account_key); if (active) disconnectDeletingAccount(active); }
      if (!deletionProvider.enabled) return;
      // One provider operation per pass; unrelated accounts keep running during
      // provider outages. Each attempt has a timeout and a durable retry state.
      for (const row of requests) {
        if (closing || Number(row.retry_at) > Date.now()) continue;
        const key = row.account_key;
        if (committingAccounts.has(key) || releasingAccounts.has(key)) continue;
        const operation = await database.acquireDeletion(key);
        if (!operation) continue;
        try {
          await deletionProvider.deleteUser(operation.subject);
          if (closing) return;
          await database.finishDeletion(key);
          clearDeletedAccount(key);
          await refreshRecords();
        } catch { if (!closing) await database.deferDeletion(key); }
        finally { await database.releaseDeletion(key); }
        break;
      }
    })().catch(() => {}).finally(() => { deletionTask = undefined; });
    return deletionTask;
  }
  const serveAccountDeletion = accountDeletionHandler({ database, provider: deletionProvider, verify: verifyAccessToken, closing: () => closing,
    requested: key => { const active = accountConnections.get(key); if (active) disconnectDeletingAccount(active); void runAccountDeletions(); } });
  const dist = resolve(ROOT, 'dist');
  async function serveRoster(req, res) {
    const reply = (status, body) => res.writeHead(status).end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
    if (closing) { reply(503, { error: 'The realm is restarting.' }); return; }
    let identity = { role: 'player' }, recordKey;
    try {
      if (keycloak) {
        const authorization = req.headers.authorization;
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw Error();
        identity = await verifyAccessToken(authorization.slice(7));
        recordKey = identity.recordKey;
      } else if (req.headers['x-guest-token'] !== undefined) {
        const token = req.headers['x-guest-token'];
        if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error();
        recordKey = hash(token);
        identity = { recordKey, role: localGmKeys.has(recordKey) ? 'gm' : 'player' };
      }
    } catch { reply(401, { error: 'Sign in to view your characters.' }); return; }
    try {
      await waitForAccountAction(recordKey); await refreshRecords();
      if (database && (await database.deletionStatus(recordKey)).status !== 'none') { reply(403, { error: 'This account is being deleted or has been deleted.', code: 'ACCOUNT_DELETING' }); return; }
    } catch { reply(503, { error: 'Your characters could not be loaded. Try again.' }); return; }
    if (closing) { reply(503, { error: 'The realm is restarting.' }); return; }
    if (identity.expiresAt && identity.expiresAt <= Date.now()) { reply(401, { error: 'Sign in to view your characters.' }); return; }
    const account = records[recordKey] || { characters: [] };
    if (account.ban) { reply(403, { error: 'This account is banned in this realm.' }); return; }
    reply(200, characterRoster({ ...identity, account }));
  }
  const mobileRequests = new Map();
  async function applyMobileReceipt(owner, receipt, authorize = () => {}, revoked) {
    const ledger = { ...receipt, accountKey: owner.recordKey, characterId: owner.player.id,
      ...(revoked ? { action: 'refund', eventId: revoked.eventId, at: revoked.at } : {}) };
    let delivered = false;
    const committed = await commitStore(owner, async current => {
      authorize();
      const order = current.mobileStoreOrders.find(item => item.id === receipt.intentId);
      if (!order || order.sku !== receipt.productId || order.platform !== receipt.platform || receipt.purchasedAt < order.createdAt - 30000
          || order.paymentId && order.paymentId !== receipt.paymentId) throw mobileError(409, 'This payment does not match the saved purchase.');
      const paid = { ...order, paymentId: receipt.paymentId, purchasedAt: receipt.purchasedAt, sandbox: receipt.sandbox };
      if (revoked) {
        let changes;
        try { changes = mobileRefundChanges(current, paid, { at: revoked.at, eventId: revoked.eventId }); }
        catch (error) { if (error?.code === 'PURCHASE_RECOVERY_REQUIRED') throw mobileError(409, 'This purchase needs support review before its benefit can be revoked. Contact Mossvale support.', 'PURCHASE_RECOVERY_REQUIRED'); throw error; }
        return { ...changes, mobileStoreOrders: changes.mobileStoreOrders || current.mobileStoreOrders };
      }
      if (order.status === 'refunded') throw mobileError(409, 'This purchase was refunded or revoked.', 'PURCHASE_REFUNDED');
      if (order.status === 'delivered') { delivered = true; return { mobileStoreOrders: current.mobileStoreOrders }; }
      const reason = mobilePurchaseConflict(current, storeProduct(order.productId), Date.now(), order.id);
      if (reason) return { mobileStoreOrders: current.mobileStoreOrders.map(item => item.id === order.id ? { ...paid, status: 'payment-confirmed', reason } : item) };
      const grant = mobileRewardChanges(current, order, Date.now(), () => randomInt(0x100000000) / 0x100000000);
      const { reason: oldReason, ...resolved } = paid;
      delivered = true;
      return { ...grant.changes, mobileStoreOrders: current.mobileStoreOrders.map(item => item.id === order.id ? { ...resolved, status: 'delivered', reward: grant.reward } : item) };
    }, true, ledger);
    if (!committed) throw mobileError(409, 'This account is busy or active on another realm. Retry on your active realm.');
    return delivered;
  }
  async function pollMobileEvents() {
    if (!database || !mobileReady || closing) return;
    // This read-only provider poll never grants credit. Its cursor advances only
    // in the same transaction that records every refund from the page.
    if (mobileVerifier.voidedPage && mobileVerifier.status().google && Date.now() - lastVoidedPoll >= 60000) {
      lastVoidedPoll = Date.now();
      const before = await database.mobileSyncState(), now = Date.now(), lookback = now - 30 * 86400000 + 60000;
      if (!before?.completedAt || now - before.completedAt >= 15 * 60000 || before.token) {
        const start = before?.token ? before.start : Math.max(lookback, (before?.cursor || lookback) - 3600000);
        const end = before?.token ? before.end : now;
        if (before?.cursor && before.cursor < lookback) console.error('Mobile refund reconciliation exceeded the provider 30-day history window; manual audit required.');
        const page = await mobileVerifier.voidedPage({ start, end, token: before?.token });
        if (closing) return;
        const historyGap = before?.historyGap || (before?.cursor && before.cursor < lookback ? { from: before.cursor, through: lookback } : undefined);
        await database.commitMobileSync(before, page.nextToken ? { ...before, start, end, token: page.nextToken, ...(historyGap ? { historyGap } : {}) }
          : { cursor: end, completedAt: now, ...(historyGap ? { historyGap } : {}) }, page.events);
      }
    }
    const pending = await database.pendingMobileEvents();
    if (!pending.length || closing) return;
    await refreshRecords();
    for (const row of pending) {
      if (closing) return;
      const event = row.data, intent = row.order_data;
      if (event.kind === 'ignored' || event.kind === 'review') { await database.completeMobileEvent(event.eventId, event.kind === 'review' ? 'support-review-required' : 'ignored'); continue; }
      if (!intent) { await database.completeMobileEvent(event.eventId, 'unmatched-receipt-retained'); continue; }
      const receipt = { platform: event.platform, paymentId: event.paymentId, productId: event.productId || intent.sku,
        intentId: intent.id, purchasedAt: event.purchasedAt ?? intent.purchasedAt, sandbox: event.sandbox ?? intent.sandbox };
      if (intent.sku !== receipt.productId || intent.platform !== receipt.platform || intent.paymentId && intent.paymentId !== receipt.paymentId
          || !Number.isSafeInteger(receipt.purchasedAt) || receipt.purchasedAt < intent.createdAt - 30000
          || typeof receipt.sandbox !== 'boolean' || receipt.sandbox && !mobileVerifier.sandboxAllowed?.(row.account_key)) {
        await database.completeMobileEvent(event.eventId, 'unmatched-receipt-retained'); continue;
      }
      const revoked = await database.mobileRevocation(receipt.platform, receipt.paymentId);
      const saved = (await database.read([row.account_key]))[0];
      const player = records[row.account_key]?.characters.find(player => player.id === row.character_id);
      if (!saved?.state.characters.some(player => player.id === row.character_id)) {
        await database.archiveMobileReceipt({ ...receipt, accountKey: row.account_key, characterId: row.character_id,
          ...(revoked ? { action: 'refund', eventId: revoked.eventId, at: revoked.at } : {}) });
        await database.completeMobileEvent(event.eventId, revoked ? 'retired-refund-recorded' : 'retired-payment-support-required'); continue;
      }
      if (!player) continue;
      try {
        await applyMobileReceipt({ recordKey: row.account_key, player }, receipt, () => {}, revoked);
        await database.completeMobileEvent(event.eventId, revoked ? 'refund-applied' : 'payment-recorded');
      } catch (error) {
        if (error?.code === 'PURCHASE_RECOVERY_REQUIRED') await database.completeMobileEvent(event.eventId, 'support-review-required');
        else if (error?.status !== 409 && error?.code !== 'PLAYER_STORE_CONFLICT' && error?.code !== 'ACCOUNT_DELETING') throw error;
      }
    }
  }
  let mobileNotifications = 0;
  async function serveMobileNotification(req, res, platform) {
    if (closing || !database || !mobileReady || !mobileVerifier.notification || mobileNotifications >= 16) { res.writeHead(503).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') { res.writeHead(415).end(); return; }
    mobileNotifications++;
    try {
      req.setTimeout(10000, () => req.destroy());
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 65536) { res.writeHead(413).end(); return; } chunks.push(chunk); }
      req.setTimeout(0);
      const event = await mobileVerifier.notification(platform, JSON.parse(Buffer.concat(chunks).toString('utf8')), req.headers.authorization);
      if (closing) { res.writeHead(503).end(); return; }
      await database.addMobileEvent(event);
      // Acknowledge only the durable inbox. The realm owning the account applies
      // it; provider retries and restarts cannot lose or repeat the reversal.
      res.writeHead(204).end();
    } catch (error) { res.writeHead([400, 401, 404].includes(error?.status) ? error.status : error instanceof SyntaxError ? 400 : 503).end(); }
    finally { mobileNotifications--; }
  }
  const mobileError = (status, message, code) => Object.assign(Error(message), { status, publicMobile: true, code });
  let pushRequests = 0, pushRevokes = 0, pushRevokeWindow = 0;
  async function serveMobilePush(req, res, unregister) {
    const reply = (status, body) => { if (!res.destroyed) res.writeHead(status).end(JSON.stringify(body)); };
    if (pushRequests >= 64) { reply(429, { error: 'Try again shortly.' }); return; }
    if (unregister) {
      if (Date.now() - pushRevokeWindow >= 60000) { pushRevokeWindow = Date.now(); pushRevokes = 0; }
      if (++pushRevokes > 64) { reply(429, { error: 'Try again shortly.' }); return; }
    }
    pushRequests++;
    try {
      if (closing || !accountStoreReady || !database || !unregister && (!keycloak || !mobilePush.enabled)) throw mobileError(503, 'Mobile notifications are not available yet.');
      let identity;
      if (!unregister) {
        try {
          const authorization = req.headers.authorization;
          if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw Error();
          identity = await verifyAccessToken(authorization.slice(7));
        } catch { throw mobileError(401, 'Sign in to manage notifications.'); }
      }
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw mobileError(415, 'Send a JSON notification request.');
      req.setTimeout(10000, () => req.destroy());
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) throw mobileError(413, 'Notification request is too large.');
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw mobileError(400, 'Invalid notification request.'); }
      const result = unregister ? await mobilePush.unregister(input) : await mobilePush.register(identity.recordKey, input,
        () => !res.destroyed && !closing && identity.expiresAt > Date.now());
      reply(200, result);
    } catch (error) {
      reply([400, 401, 403, 404, 409, 413, 415, 429].includes(error.status) ? error.status : 503,
        { error: error.publicMobile || [400, 403, 404, 409, 429].includes(error.status) ? error.message : 'Notification choices could not be saved. Please try again.' });
    } finally { req.socket?.setTimeout(0); pushRequests--; }
  }
  async function serveMobilePurchase(req, res, pathname) {
    const reply = (status, body) => { if (!res.destroyed) res.writeHead(status).end(JSON.stringify(body)); };
    let requestKey;
    try {
      if (closing || !database || !keycloak) throw mobileError(503, 'Mobile purchases are unavailable. Please try again later.');
      let identity;
      try {
        const authorization = req.headers.authorization;
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw Error();
        identity = await verifyAccessToken(authorization.slice(7));
      } catch { throw mobileError(401, 'Sign in again to complete this purchase.'); }
      if (mobileRequests.has(identity.recordKey) || mobileRequests.size >= 128) throw mobileError(429, 'A purchase request is already in progress. Please retry shortly.');
      requestKey = identity.recordKey; mobileRequests.set(requestKey, true);
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw mobileError(415, 'Send a JSON purchase request.');
      req.setTimeout(10000, () => req.destroy());
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) throw mobileError(413, 'Purchase request is too large.');
        chunks.push(chunk);
      }
      req.setTimeout(0);
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw mobileError(400, 'Invalid purchase request.'); }
      const intentRequest = pathname.endsWith('/intents'), abandonRequest = pathname.endsWith('/abandon');
      const fields = abandonRequest ? ['intentId'] : intentRequest ? ['productId', 'characterId', 'platform'] : ['platform', 'intentId', 'productId', 'transactionId', 'purchaseToken'];
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))
          || abandonRequest && !mobileIntentIdValid(input.intentId)
          || !abandonRequest && (!['apple', 'google'].includes(input.platform) || typeof input.productId !== 'string')
          || (!intentRequest && !abandonRequest && (!mobileIntentIdValid(input.intentId) || input.platform === 'apple' && (typeof input.transactionId !== 'string' || input.purchaseToken !== undefined)
            || input.platform === 'google' && (typeof input.purchaseToken !== 'string' || input.transactionId !== undefined)))) throw mobileError(400, 'Invalid purchase request.');
      if (!abandonRequest && !mobilePurchaseStatus()[input.platform]) throw mobileError(503, 'This mobile store is not available yet.');
      await waitForAccountAction(identity.recordKey);
      await database.deletionStatus(identity.recordKey);
      await refreshRecords();
      const account = records[identity.recordKey];
      const player = account?.characters.find(player => intentRequest ? player.id === input.characterId : player.mobileStoreOrders.some(order => order.id === input.intentId));
      // A deleted character may still have a genuine payment. Only the financial
      // archive path can accept it; neither a profile nor a reward is recreated.
      const archiveOnly = !player && !intentRequest && !abandonRequest;
      const authorize = () => {
        if (closing) throw mobileError(503, 'The realm is restarting. Retry your purchase afterward.');
        if (identity.expiresAt <= Date.now()) throw mobileError(401, 'Sign in again to complete this purchase.');
        if (records[identity.recordKey]?.ban || database.isDeleting(identity.recordKey) && !archiveOnly) throw mobileError(403, 'This account cannot make purchases.');
      };
      authorize();
      if (!player && !intentRequest && !abandonRequest) {
        const archived = await database.mobileIntent(input.intentId, identity.recordKey);
        if (!archived) throw mobileError(404, 'This purchase does not belong to your account.');
        const old = archived.order_data;
        if (old.platform !== input.platform || old.sku !== input.productId) throw mobileError(400, 'This purchase does not match its checkout.');
        const submitted = input.platform === 'apple' ? input.transactionId : createHash('sha256').update(input.purchaseToken).digest('hex');
        const priorRefund = old.paymentId === submitted && await database.mobileRevocation(input.platform, submitted);
        const receipt = priorRefund ? { platform: old.platform, paymentId: old.paymentId, intentId: old.id, productId: old.sku, purchasedAt: old.purchasedAt, sandbox: old.sandbox }
          : await mobileVerifier.verify(input, old, identity.recordKey);
        authorize();
        if (receipt.refunded) await database.addMobileEvent({ ...receipt, eventId: `verify:${receipt.platform}:${receipt.paymentId}:refund`, kind: 'refund', at: receipt.revokedAt });
        const revoked = await database.mobileRevocation(receipt.platform, receipt.paymentId);
        await database.archiveMobileReceipt({ ...receipt, accountKey: identity.recordKey, characterId: archived.character_id,
          ...(revoked ? { action: 'refund', eventId: revoked.eventId, at: revoked.at } : {}) });
        if (revoked) throw mobileError(409, 'This purchase was refunded or revoked.', 'PURCHASE_REFUNDED');
        throw mobileError(409, 'Your payment is recorded for a retired character and needs delivery assistance. Contact Mossvale support.', 'PURCHASE_RECOVERY_REQUIRED');
      }
      if (!player) throw mobileError(404, 'This character or purchase does not belong to your account.');
      const owner = { recordKey: identity.recordKey, player };
      if (abandonRequest) {
        let status;
        const committed = await commitStore(owner, async current => {
          authorize();
          const order = current.mobileStoreOrders.find(item => item.id === input.intentId);
          status = order.status;
          if (status !== 'pending') return { mobileStoreOrders: current.mobileStoreOrders };
          status = 'abandoned';
          return { mobileStoreOrders: current.mobileStoreOrders.map(item => item.id === order.id ? { ...item, status, abandonedAt: Date.now() } : item) };
        }, true);
        if (!committed) throw mobileError(409, 'This account is busy or active on another realm. Retry on your active realm.');
        reply(200, { intentId: input.intentId, status }); return;
      }
      if (intentRequest) {
        const product = storeProductForSale(input.productId);
        if (product && goldStorePrice(product.id, economyVersion >= 1)) throw mobileError(400, 'This service is now purchased with gold in the game.');
        if (!product || !MOBILE_STORE_SKUS[product.id]) throw mobileError(400, 'Choose an item from the store.');
        let intent;
        const committed = await commitStore(owner, async current => {
          authorize();
          if (current.mobileStoreOrders.some(order => order.status === 'payment-confirmed')) throw mobileError(409, 'Your payment is recorded and needs delivery assistance. Contact Mossvale support.', 'PURCHASE_RECOVERY_REQUIRED');
          intent = current.mobileStoreOrders.find(order => order.productId === product.id && order.platform === input.platform && order.status === 'pending' && order.expiresAt > Date.now());
          if (mobilePurchaseConflict(current, product, Date.now(), intent?.id)) throw mobileError(409, 'This reward is owned or reserved by a pending cosmetic purchase. Resolve it before buying again.');
          if (intent) return { mobileStoreOrders: current.mobileStoreOrders };
          if (current.mobileStoreOrders.length >= STORE_MAX_ORDERS) throw mobileError(409, 'The purchase history is full. Contact support before buying more.');
          const createdAt = Date.now();
          intent = { id: randomUUID(), characterId: current.id, productId: product.id, sku: MOBILE_STORE_SKUS[product.id], platform: input.platform,
            createdAt, expiresAt: createdAt + 15 * 60 * 1000, status: 'pending' };
          return { mobileStoreOrders: [...current.mobileStoreOrders, intent] };
        }, true);
        if (!committed) throw mobileError(409, 'This account is busy or active on another realm. Retry on your active realm.');
        reply(200, { intentId: intent.id, productId: intent.sku }); return;
      }
      const intent = player.mobileStoreOrders.find(order => order.id === input.intentId);
      if (intent.sku !== input.productId || intent.platform !== input.platform) throw mobileError(400, 'This purchase does not match its checkout.');
      const submittedPaymentId = input.platform === 'apple' ? input.transactionId : createHash('sha256').update(input.purchaseToken).digest('hex');
      if (intent.paymentId === submittedPaymentId) {
        const terminal = await database.mobileRevocation(input.platform, submittedPaymentId);
        if (terminal) {
          await applyMobileReceipt(owner, { platform: intent.platform, paymentId: intent.paymentId, intentId: intent.id, productId: intent.sku, purchasedAt: intent.purchasedAt, sandbox: intent.sandbox }, authorize, terminal);
          throw mobileError(409, 'This purchase was refunded or revoked.', 'PURCHASE_REFUNDED');
        }
      }
      let receipt;
      try { receipt = await mobileVerifier.verify(input, intent, identity.recordKey); }
      catch (error) { throw mobileError(error?.status === 400 || error?.status === 409 ? error.status : 503, 'The store has not confirmed a valid payment. Reconnect or restore purchases to retry.'); }
      if (receipt.refunded) await database.addMobileEvent({ ...receipt, eventId: `verify:${receipt.platform}:${receipt.paymentId}:refund`, kind: 'refund', at: receipt.revokedAt });
      const revoked = await database.mobileRevocation(receipt.platform, receipt.paymentId);
      if (revoked) {
        await applyMobileReceipt(owner, receipt, authorize, revoked);
        throw mobileError(409, 'This purchase was refunded or revoked.', 'PURCHASE_REFUNDED');
      }
      const delivered = await applyMobileReceipt(owner, receipt, authorize);
      if (!delivered) throw mobileError(409, 'Your payment is recorded and needs delivery assistance. Contact Mossvale support.', 'PURCHASE_RECOVERY_REQUIRED');
      reply(200, { delivered: true });
    } catch (error) {
      reply(error?.publicMobile ? error.status : 503, { error: error?.publicMobile ? error.message : 'Your purchase could not be saved. Reconnect or restore purchases to retry.',
        ...(error?.publicMobile && ['PURCHASE_RECOVERY_REQUIRED', 'PURCHASE_REFUNDED'].includes(error.code) ? { code: error.code, ...(error.code === 'PURCHASE_REFUNDED' ? { delivered: false, refunded: true } : {}) } : {}) });
    } finally { if (requestKey) mobileRequests.delete(requestKey); }
  }
  const walletOrigins = new Set([realmEuOrigin || 'https://mossvale.world', realmUsOrigin || 'https://us.mossvale.world',
    realmAsiaOrigin || 'https://asia.mossvale.world'].map(hostingOrigin));
  const serveTurnkeyWallet = createTurnkeySponsorshipHandler({ sponsor: gasSponsor, authenticate: verifyAccessToken,
    originAllowed: req => {
      try {
        const origin = new URL(req.headers.origin);
        // Realm switching keeps the browser's origin; trust only configured game realms.
        return origin.origin === req.headers.origin && (walletOrigins.has(origin.origin)
          || process.env.NODE_ENV !== 'production' && origin.host === req.headers.host && origin.protocol === 'http:'
            && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname));
      } catch { return false; }
    },
    authorize: async (identity, transaction) => {
      const connection = accountConnections.get(identity.recordKey), session = connection?.session;
      const guard = () => {
        if (!keycloak || !database || !accountStoreReady || closing || identity.expiresAt <= Date.now() || connection?.releasing
            || accountConnections.get(identity.recordKey) !== connection || !liveSession(session) || !database.owns(identity.recordKey)
            || records[identity.recordKey]?.ban || committingAccounts.has(identity.recordKey) || releasingAccounts.has(identity.recordKey))
          throw sponsorshipError(409, 'Enter the game on this realm with your linked wallet before requesting sponsorship.');
      };
      guard(); await refreshRecords();
      await Promise.all([refreshAuctionStatus(), refreshStoreStatus(), refreshTreasureStatus(), refreshNftStatus()]); guard();
      const arena = connection.nativePlatform !== 'ios' && session.player.arenaWagers.length ? await wagerChain.status() : undefined;
      guard();
      try {
        return matchTurnkeyGasIntent(transaction, { player: session.player, listings: auctionOwners().flatMap(owner => owner.player.auctions),
          markets: [cryptoStatus, cryptoStatus.moss].filter(Boolean), store: storeStatus, treasure: treasureStatus, nft: nftStatus, arena });
      } catch { throw sponsorshipError(422, 'Sponsorship requires the exact current game purchase, saved payout, NFT mint or sale withdrawal. Review it again.'); }
    },
  });
  const server = createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
    if (pathname === '/api/deployment') { void deployment.handle(req, res); return; }
    if (pathname === '/api/turnkey/wallet') { void serveTurnkeyWallet(req, res); return; }
    if (pathname === '/api/turnkey/gas') { res.writeHead(410, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ error: 'ETH top-ups are no longer supported. Reload the game.' })); return; }
    if (['/api/notifications/register', '/api/notifications/unregister'].includes(pathname)) {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Origin');
      if (!allowedRequestOrigin(req)) { res.writeHead(403).end(); return; }
      if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      if (req.method === 'OPTIONS') {
        const headers = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (!req.headers.origin || req.headers['access-control-request-method'] !== 'POST' || headers.some(value => !['authorization', 'content-type'].includes(value))) { res.writeHead(403).end(); return; }
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }).end(); return;
      }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      void serveMobilePush(req, res, pathname.endsWith('/unregister')); return;
    }
    if (pathname === '/api/mobile-purchases/apple-notifications' || pathname === '/api/mobile-purchases/google-notifications') { void serveMobileNotification(req, res, pathname.includes('apple-') ? 'apple' : 'google'); return; }
    if (pathname === '/wallet-oidc' || pathname.startsWith('/wallet-oidc/')) { void walletBroker.handle(req, res); return; }
    if (pathname.startsWith('/api/native-wallet/')) {
      let destination;
      try { destination = new URL(`https://${req.headers.host}`); } catch { res.writeHead(400).end(); return; }
      const configuredOrigin = { eu: realmEuOrigin, us: realmUsOrigin, asia: realmAsiaOrigin }[realmId];
      if (!configuredOrigin && process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost', '[::1]'].includes(destination.hostname)) destination.protocol = 'http:';
      else destination = new URL(configuredOrigin || { eu: 'https://mossvale.world', us: 'https://us.mossvale.world', asia: 'https://asia.mossvale.world' }[realmId]);
      void nativeWallet.handle(req, res, destination.origin); return;
    }
    if (pathname === '/api/account/deletion') {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Origin');
      if (!allowedRequestOrigin(req)) { res.writeHead(403).end(); return; }
      if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      if (req.method === 'OPTIONS') {
        const headers = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (!req.headers.origin || !['GET', 'POST'].includes(req.headers['access-control-request-method']) || headers.some(value => !['authorization', 'content-type'].includes(value))) { res.writeHead(403).end(); return; }
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }).end(); return;
      }
      if (!['GET', 'POST'].includes(req.method)) { res.writeHead(405).end(); return; }
      void serveAccountDeletion(req, res); return;
    }
    if (['/api/mobile-purchases/intents', '/api/mobile-purchases/verify', '/api/mobile-purchases/abandon'].includes(pathname)) {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Origin');
      if (!allowedRequestOrigin(req)) { res.writeHead(403).end(); return; }
      if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      if (req.method === 'OPTIONS') {
        const headers = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (!req.headers.origin || req.headers['access-control-request-method'] !== 'POST' || headers.some(value => !['authorization', 'content-type'].includes(value))) { res.writeHead(403).end(); return; }
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }).end(); return;
      }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      void serveMobilePurchase(req, res, pathname); return;
    }
    if (['/api/health', '/api/config', '/api/roster'].includes(pathname)) {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Origin');
      if (!allowedRequestOrigin(req)) { res.writeHead(403).end(); return; }
      if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      if (req.method === 'OPTIONS') {
        const headers = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (!req.headers.origin || !['GET', 'HEAD'].includes(req.headers['access-control-request-method']) || headers.some(value => !['authorization', 'x-guest-token'].includes(value))) { res.writeHead(403).end(); return; }
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Authorization, X-Guest-Token' }).end(); return;
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (pathname === '/api/stats') {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'public, max-age=10');
      res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('X-Content-Type-Options', 'nosniff');
      const range = new URL(req.url, 'http://localhost').searchParams.get('range') || '24h';
      void statistics.read(range).then(body => { res.writeHead(200).end(req.method === 'HEAD' ? undefined : JSON.stringify(body)); })
        .catch(error => { res.writeHead(error.status === 400 ? 400 : 503, { 'Cache-Control': 'no-store' }).end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: error.status === 400 ? 'Invalid statistics range.' : 'Statistics are temporarily unavailable.' })); });
      return;
    }
    if (pathname === '/api/roster') { void serveRoster(req, res); return; }
    if (pathname === '/api/health' || pathname === '/api/config') {
      const health = pathname === '/api/health';
      const healthy = !closing || deployment.state === 'drained';
      const body = health ? { ok: healthy, available: !closing, realmId, players: activeSessions().length, world: 'Mossvale', mossAuction: cryptoStatus.moss, referrals: { programEnabled: referralsEnabled }, economy: { supportedVersion: 1, version: economyVersion, exchangeEnabled: goldExchangeEnabled }, deploymentWarning: deploymentWarning() } : { keycloak, ...hosting, mobilePurchases: mobilePurchaseStatus(), mobilePush: { enabled: mobilePush.enabled }, mobileAppUpdate: appUpdate, ...(socialProviders ? { socialProviders } : {}), ...(walletBroker.enabled ? { walletBroker: walletBroker.hint } : {}), ...(turnkey ? { turnkey: { ...turnkey, gasFunding: gasSponsor.enabled, arenaContract: wagerChain.contract, collections: { petsContract: nftStatus.petsContract, legacyPetsContract: nftStatus.legacyPetsContract, housesContract: nftStatus.housesContract } } } : {}) };
      res.writeHead(health && !healthy ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
      return;
    }
    let path = resolve(dist, pathname === '/mobile-auth/callback' ? 'mobile-auth/callback.html' : `.${pathname}`);
    if (path !== dist && !path.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
    if (!existsSync(path) || !statSync(path).isFile()) {
      // Missing standalone pages must never masquerade as the game's sign-in screen.
      if (extname(path) === '.html' || pathname.startsWith('/.well-known/')) { res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Page not found.'); return; }
      path = resolve(dist, 'index.html');
    }
    if (!existsSync(path)) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Run npm run dev for the game, or npm run build before starting production.'); return; }
    serveStaticAsset(req, res, path, { 'Content-Type': pathname === '/.well-known/apple-app-site-association' ? 'application/json' : mime[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
      ...([resolve(dist, 'account.html'), resolve(dist, 'auth-callback.html'), resolve(dist, 'silent-check-sso.html'), resolve(dist, 'wallet-action.html'), resolve(dist, 'mobile-auth/callback.html')].includes(path) ? { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
        : extname(path) === '.html' || path === resolve(dist, 'sw.js') ? { 'Cache-Control': 'no-cache' } : {}) });
  });
  const wss = new WebSocketServer({ server, path: '/socket', maxPayload: 16384,
    // Reuse each client's snapshot dictionary; send() keeps credentials and chat uncompressed.
    perMessageDeflate: { clientNoContextTakeover: true,
      zlibDeflateOptions: { level: 6 }, concurrencyLimit: 4, threshold: 1024 } });

  function retireConnection(connection, close = false) {
    if (connection.socket.readyState !== WebSocket.OPEN) return;
    if (!connection.retiring) {
      connection.retiring = true;
      send(connection.socket, { type: 'realmStatus', available: false });
      if (connection.joined && accountConnections.get(connection.recordKey) === connection) {
        leaveSession(connection);
        sendRoster(connection);
      }
    }
    if (close) connection.socket.close(1012, 'Service Restart');
  }

  wss.on('connection', (socket, request) => {
    let origin;
    if (!allowedRequestOrigin(request)) { socket.close(4403, 'Origin is not allowed'); return; }
    try { origin = new URL(request.headers.origin || `http://${request.headers.host}`).origin; } catch { socket.close(4400, 'Invalid origin'); return; }
    const connection = { socket, origin, joined: false, role: 'player', lastError: 0, guardClosing: false,
      connectedAt: Date.now(), lastMessageAt: Date.now(),
      clientChecks: createClientChecks(request.headers['user-agent'] || '') };
    connections.set(socket, connection);
    void countryForRequest(request).then(country => {
      connection.country = country;
      if (liveSession(connection.session)) { connection.session.country = country; statistics.observe(); }
    });
    const joinTimeout = setTimeout(() => { if (!connection.joined) socket.close(4000, 'Join timed out'); }, 10000);
    const trainingBusyErrors = { learnSpell: 0, learnRiding: 0, buyMount: 0 };
    const lootRequests = new Map();
    function rejectAction(text, requestType, logOnly = false) {
      if (requestType === 'selectTitle') { send(socket, { type: 'titleSelected', titleId: connection.session?.player.title ?? null, error: text }); return; }
      const now = Date.now(), trainingReply = typeof requestType === 'string' && Object.hasOwn(trainingBusyErrors, requestType);
      if (merchantSaleTypes.has(requestType) || requestType === 'deleteCharacter' || now - (trainingReply ? trainingBusyErrors[requestType] : connection.lastError) > 600) {
        if (trainingReply) trainingBusyErrors[requestType] = now; else connection.lastError = now;
        send(socket, { type: 'event', kind: 'info', text, ...(typeof requestType === 'string' ? { requestType } : {}), ...(logOnly ? { logOnly: true } : {}) });
      }
    }
    function cheat(reason, requestType) {
      const now = Date.now();
      if (connection.session) correction(connection.session, reason);
      rejectAction(reason, requestType);
      const strike = actionGuard.strike(connection.recordKey || connection, now, reason);
      if (strike.newlyBlocked) {
        connection.guardClosing = true;
        const saved = reportGuard(connection, 'Repeated invalid game actions',
          `Server guard: ${strike.count} invalid actions within 30 seconds. Last rejection: ${reason} A one-minute safety cooldown was applied; no account ban. Counted evidence: ${JSON.stringify(actionGuard.strikeSummary(connection.recordKey || connection, now))}.`, strike.blockedUntil);
        leaveSession(connection);
        void saved.catch(error => console.error('Security report save failed:', error.message))
          .finally(() => socket.close(4403, 'Repeated invalid actions. Wait one minute before reconnecting.'));
      }
    }
    socket.on('error', () => {});
    socket.on('message', async raw => {
      const movementReceipt = movementCredit.observe();
      connection.lastMessageAt = Date.now();
      if (closing) { retireConnection(connection, !connection.joined); return; }
      let now = Date.now();
      if (connection.guardClosing || actionGuard.blockedUntil(connection.recordKey || connection, now) > now) return;
      const messageAllowed = actionGuard.message(connection.recordKey || connection, now);
      let message;
      try { message = JSON.parse(raw.toString()); } catch { cheat('Invalid message.'); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') { cheat('Invalid message.'); return; }
      const reject = (text, requestType = merchantSaleTypes.has(message.type) ? message.type : undefined) => rejectAction(text, requestType, message.type === 'loot');
      const requestId = message.type === 'loot' && typeof message.requestId === 'string' && message.requestId.length > 0 && message.requestId.length <= 128 ? message.requestId : undefined;
      const previousLootRequest = requestId && lootRequests.get(requestId);
      if (previousLootRequest) {
        if (!messageAllowed) { cheat('Too many actions. Slow down a little.'); return; }
        if (!isDeepStrictEqual(previousLootRequest.message, message)) cheat('A loot request cannot be changed while retrying.');
        else if (previousLootRequest.result) {
          if (liveSession(connection.session)) send(socket, snapshot(connection.session));
          send(socket, previousLootRequest.result);
        }
        return;
      }
      const lootRequest = message.type === 'loot' ? { message, result: null } : null;
      if (requestId) lootRequests.set(requestId, lootRequest);
      let lootSuccess = false;
      try {
      if (!messageAllowed) { cheat('Too many actions. Slow down a little.', merchantSaleTypes.has(message.type) ? message.type : undefined); return; }
      if (Object.hasOwn(message, 'arenaRatings')) { cheat('Arena rating is controlled by the realm.'); return; }
      if (['join', 'selectCharacter', 'createCharacter'].includes(message.type) && !realmMatches(message)) {
        if (message.type === 'join') socket.close(4400, 'Choose the correct realm server.');
        else reject('This request was sent to a different realm.', message.type);
        return;
      }
      if (message.type === 'join') {
        if (connection.joined || connection.joining) return;
        if (message.nativePlatform !== undefined && !['ios','android'].includes(message.nativePlatform)) { socket.close(4400, 'Invalid native platform.'); return; }
        connection.nativePlatform = /Mossvale.*(?:iOS|apple)|(?:iPhone|iPad|iPod).*AppleWebKit(?!.*Safari)/i.test(request.headers['user-agent'] || '') ? 'ios' : message.nativePlatform;
        let token, recordKey, expiresAt, role = 'player';
        if (keycloak) {
          connection.joining = true;
          try {
            ({ recordKey, expiresAt, role } = await verifyAccessToken(message.accessToken));
          } catch {
            if (closing) { retireConnection(connection, true); return; }
            socket.close(4401, 'Sign in to enter Mossvale');
            return;
          } finally {
            connection.joining = false;
          }
          if (closing) { retireConnection(connection, true); return; }
          if (socket.readyState !== WebSocket.OPEN || expiresAt <= Date.now()) { socket.close(4401, 'Sign in to enter Mossvale'); return; }
        } else {
          token = typeof message.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(message.token) ? message.token : '';
          if (!token) token = randomBytes(32).toString('base64url');
          recordKey = hash(token);
          if (localGmKeys.has(recordKey)) role = 'gm';
        }
        connection.joining = true;
        try {
          if (actionGuard.blockedUntil(recordKey, Date.now()) > Date.now()) {
            socket.close(4403, 'Safety cooldown active. Wait one minute before reconnecting.'); return;
          }
          await waitForAccountAction(recordKey);
          await releasingAccounts.get(recordKey);
          const previous = accountConnections.get(recordKey);
          if (previous) {
            previous.socket.close(4001, 'Account opened in another tab');
            await releaseAccount(previous);
          }
          if (closing || socket.readyState !== WebSocket.OPEN) return;
          if (expiresAt && expiresAt <= Date.now()) { socket.close(4401, 'Session expired'); return; }
          while (committingAccounts.has(recordKey)) await waitForAccountAction(recordKey);
          flush = flush.catch(() => {}).then(async () => {
            if (closing || socket.readyState !== WebSocket.OPEN) return;
            if (expiresAt && expiresAt <= Date.now()) { socket.close(4401, 'Session expired'); return; }
            if (accountConnections.has(recordKey)) { socket.close(4407, 'Account is active in another realm'); return; }
            let blockedUntil = 0;
            const state = database ? await database.claim(recordKey, metadata => { blockedUntil = metadata.guardBlockedUntil; }) : records[recordKey] || { characters: [] };
            if (!state) { socket.close(4407, 'Account is active in another realm'); return; }
            if (!database) blockedUntil = reports.guardBlockedUntil(recordKey);
            if (blockedUntil > Date.now()) {
              actionGuard.block(recordKey, blockedUntil);
              await database?.release(recordKey);
              socket.close(4403, 'Safety cooldown active. Wait one minute before reconnecting.'); return;
            }
            if (closing || socket.readyState !== WebSocket.OPEN) { await database?.release(recordKey); return; }
            migrateRecords({ [recordKey]: state });
            validateRecords({ [recordKey]: state }, true);
            records[recordKey] = state;
            lastSaved.delete(recordKey);
            connection.recordKey = recordKey;
            connection.account = state;
            if (keycloak && role === 'gm') state.gmProtected = true;
            connection.guestToken = token;
            connection.expiresAt = expiresAt;
            connection.role = role;
            accountConnections.set(recordKey, connection);
          });
          await flush;
          if (accountConnections.get(recordKey) !== connection) return;
          // Incoming processed items are protected by their seller's shared reservation, even after a realm switch.
          await refreshRecords();
          await save();
          if (message.referralCode !== undefined) {
            try { await bindReferral(connection, message.referralCode); sendReferral(connection); } catch (error) { sendReferral(connection, error.message); }
          }
          if (closing || socket.readyState !== WebSocket.OPEN) { await releaseAccount(connection); return; }
          if (connection.account.ban) { moderationDisconnect(connection, 'ban', connection.account.ban.reason); return; }
          connection.joined = true;
          send(connection.socket, { type: 'community', version: COMMUNITY_VERSION, accepted: connection.account.communityRulesVersion === COMMUNITY_VERSION });
        } catch (error) {
          if (error.code === 'ACCOUNT_DELETING') { socket.close(4410, 'Account deletion requested'); return; }
          console.error('Account could not be opened:', error.message);
          if (database?.owns(recordKey) && accountConnections.get(recordKey) !== connection) failPersistence(error);
          socket.close(1011, 'Your progress could not be loaded. Reconnect shortly.');
          return;
        } finally { connection.joining = false; }
        clearTimeout(joinTimeout);
        dirty();
        if (shutdownNotice) sendShutdownWarning(connection);
        if (message.characterId === undefined || !selectCharacter(connection, message.characterId)) sendRoster(connection);
        return;
      }
      if (!connection.joined || accountConnections.get(connection.recordKey) !== connection) { reject('Sign in to your account first.', ['deleteCharacter', 'selectTitle'].includes(message.type) ? message.type : undefined); return; }
      if (connection.expiresAt && connection.expiresAt <= now) { leaveSession(connection); socket.close(4401, 'Session expired'); return; }
      if (database?.isDeleting(connection.recordKey)) { disconnectDeletingAccount(connection); return; }
      if (connection.account.ban) { moderationDisconnect(connection, 'ban', connection.account.ban.reason); return; }
      if (message.type === 'refreshSession') {
        if (connection.refreshing) return;
        const recordKey = connection.recordKey;
        connection.refreshing = true;
        try {
          if (Object.keys(message).length !== 2 || !Object.hasOwn(message, 'accessToken')) throw new Error('Invalid session renewal');
          const refreshed = await verifyAccessToken(message.accessToken);
          if (closing) { retireConnection(connection, true); return; }
          if (socket.readyState !== WebSocket.OPEN || connection.retiring || accountConnections.get(recordKey) !== connection) return;
          if (connection.expiresAt <= Date.now() || refreshed.expiresAt <= Date.now() || connection.account.ban
              || refreshed.recordKey !== recordKey || refreshed.role !== connection.role) throw new Error('Sign in again');
          // A replayed older token cannot shorten a newer, already verified session.
          connection.expiresAt = Math.max(connection.expiresAt, refreshed.expiresAt);
          if (connection.session) connection.session.expiresAt = connection.expiresAt;
        } catch {
          if (closing) retireConnection(connection, true);
          else if (socket.readyState === WebSocket.OPEN && accountConnections.get(recordKey) === connection) {
            leaveSession(connection); socket.close(4401, 'Sign in to continue Mossvale');
          }
        } finally { connection.refreshing = false; }
        return;
      }
      if (connection.releasing) return;
      if (message.type === 'ping') {
        if (Object.keys(message).length !== 2 || !nonnegativeInteger(message.id)) { reject('Invalid ping request.', message.type); return; }
        send(socket, { type: 'pong', id: message.id }); return;
      }
      if (message.type === 'leaveRealm') {
        if (Object.keys(message).length !== 1) { reject('Invalid realm change.'); return; }
        await releaseAccount(connection, true).catch(() => {}); return;
      }
      if (message.type === 'clientCheck') {
        if (connection.session) connection.clientChecks.reply(message, now);
        return; // Optional runtime context never authorizes gameplay or applies a strike.
      }
      if (message.type === 'inputActivity') {
        if (connection.session && Object.keys(message).length === 2) actionGuard.activity(connection.recordKey, message.sample, now);
        return; // Optional, untrusted context: malformed or missing telemetry is never a strike.
      }
      if (['acceptCommunityRules','playerReport','reportsList','reviewReport'].includes(message.type)) { await communityAction(connection, message); return; }
      if (message.type === 'gmAction') { await performGmAction(connection, message); return; }
      if (message.type === 'translateChat') {
        if (!liveSession(connection.session)) { send(socket, { type: 'chatTranslation', messageId: message.messageId, targetLanguage: message.targetLanguage, error: 'Enter the world before translating chat.' }); return; }
        await translateChat(connection.session, message); return;
      }
      if (merchantSaleTypes.has(message.type)) {
        const session = connection.session;
        // A clicked sale waits for admitted pickups, then validates the current inventory and merchant distance.
        while (committingAccounts.get(connection.recordKey)?.backgroundLoot) await committingAccounts.get(connection.recordKey).completion;
        if (closing || connection.releasing || !liveSession(session) || connection.session !== session) return;
        now = Date.now();
      }
      const committing = committingAccounts.get(connection.recordKey);
      // Loot rewards are already authorized. Combat and dungeon travel cannot spend staged items.
      const lootGameplay = !combatSaveBlocked(connection.recordKey) && ['loot', 'move', 'jump', 'attack', 'autoAttack', 'cancelCast', 'cancelGather', 'dungeonEnter', 'dungeonInteract', 'dungeonExit'].includes(message.type);
      if (committing && !(message.type === 'emote' && message.emoteId === null) && !lootGameplay) {
        if (message.type === 'referralOpen' || message.type === 'referralBind') { sendReferral(connection, 'Saving your last action. Please try again in a moment.'); return; }
        if (message.type === 'move') {
          const session = connection.session;
          // Stationary heartbeats need no correction while an inventory save holds movement.
          if (session && (!session.jump.grounded || message.x !== session.player.x || message.z !== session.player.z
              || message.rotation !== session.player.rotation || message.y !== undefined && message.y !== session.jump.y)) correction(session, '');
          return;
        }
        if (message.type === 'cancelCast' || message.type === 'cancelGather') return;
        if (connection.session && Object.hasOwn(socialRequests, message.type)) sendFriends(connection.session, { request: socialRequest(message), error: 'Saving your last action. Please try again in a moment.' });
        else if (message.type === 'selectTitle') reject('Saving your changes…', message.type);
        else {
          send(socket, { type: 'event', kind: 'info', text: 'Saving your changes…', requestType: message.type, ...(message.type==='raidSpUpgrade'&&typeof message.upgradeEffectId==='string'&&message.upgradeEffectId.length>0&&message.upgradeEffectId.length<=128?{upgradeEffectId:message.upgradeEffectId}:{}), ...(committing.busyNotified || message.type === 'loot' ? { logOnly: true } : {}) });
          committing.busyNotified = true;
        }
        return;
      }
      if (message.type === 'referralOpen' || message.type === 'referralBind') {
        const bind = message.type === 'referralBind';
        if (Object.keys(message).length !== (bind ? 2 : 1) || bind && !Object.hasOwn(message, 'code')) { sendReferral(connection, 'Invalid referral request.'); return; }
        if (connection.referralBusy || now - (connection.lastReferralRequest || 0) < 500) { sendReferral(connection, 'Wait a moment before refreshing referrals.'); return; }
        connection.referralBusy = true; connection.lastReferralRequest = now;
        try { if (bind) await bindReferral(connection, message.code); else { await refreshRecords(true); await save(); } await refreshAuctionStatus(); sendReferral(connection); }
        catch (error) { sendReferral(connection, bind ? error.message : 'Referrals are temporarily unavailable.'); }
        finally { connection.referralBusy = false; }
        return;
      }
      if (message.type === 'leaveWorld') { leaveSession(connection, false); sendRoster(connection); return; }
      if (message.type === 'selectCharacter') {
        if (!selectCharacter(connection, message.characterId)) reject('That character does not belong to your account.');
        return;
      }
      if (message.type === 'deleteCharacter') {
        await refreshRecords();
        if (closing || connection.releasing || committingAccounts.has(connection.recordKey) || accountConnections.get(connection.recordKey) !== connection) return;
        const fail = text => reject(text, 'deleteCharacter');
        if (Object.keys(message).length !== 3 || typeof message.characterId !== 'string'
            || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(message.characterId)
            || message.confirmation !== 'I confirm') { fail('Type I confirm exactly to delete this character.'); return; }
        const account = connection.account, id = message.characterId;
        function deletionError() {
          if (connection.session || account.characters.some(p => sessions.has(p.id))) return 'Return to character selection before deleting a character.';
          const character = account.characters.find(p => p.id === id);
          if (!character) return 'That character does not belong to your account or has already been deleted.';
          if (character.mobileStoreOrders.some(order => order.status === 'payment-confirmed' || order.status === 'pending' && order.expiresAt > Date.now())) return 'Resolve this character’s mobile purchases before deleting it.';
          if (character.treasureClaims.some(claim => claim.status !== 'paid') || !database && character.treasureClaims.length) return 'Resolve treasury claims before deleting this character; local treasury history must be retained.';
          if (character.storeOrders.some(order => !['delivered', 'expired'].includes(order.status))) return 'Resolve this character’s pending store purchases before deleting it.';
          if (specialistNftLocked(character)) return 'Seal active specialist NFTs and finish pending specialist transactions before deleting this character.';
          if (character.nftOrders.some(order => order.status === 'quoted')) return 'Resolve this character’s pending NFT claims before deleting it.';
          if (character.arenaWagers.length) return 'Settle or refund arena MOSS wagers before deleting this character.';
          if (character.auctions.length) return 'Cancel or complete this character’s auction listings before deleting it.';
          if (auctionOwners().some(owner => owner.player.auctions.some(listing => listing.reservation?.buyerId === id))) return 'Resolve this character’s pending auction payment before deleting it.';
          return null;
        }
        const error = deletionError(); if (error) { fail(error); return; }
        const deletion = {};
        committingAccounts.set(connection.recordKey, deletion);
        deletion.completion = save(new Map(), () => {
          account.characters = account.characters.filter(p => p.id !== id);
          const previous = activity.get(id);
          if (previous) { cancelGathering(previous); cancelHits(previous); }
          activity.delete(id); cancelTradeFor(id, 'Trade cancelled because the character was deleted.'); leaveParty(id);
          for (const [inviteId, invite] of invitations) if (invite.inviterId === id || invite.targetId === id) invitations.delete(inviteId);
          for (const [dropId, drop] of lootDrops) if (drop.ownerId === id) removeLootDrop(dropId, 'character_deleted');
          lootTrace.clear(id);
        }, new Map([[connection.recordKey, () => {
          // Recheck at the writer boundary. A disconnected owner may finish an
          // already accepted deletion; a reconnect waits on this account lock.
          const error = deletionError(); if (error) throw new Error(error);
          return { characters: account.characters.filter(p => p.id !== id) };
        }]]))
          .then(() => { if (accountConnections.get(connection.recordKey) === connection) sendRoster(connection); })
          .catch(error => { console.error('Character deletion save failed:', error.message); fail('Your character could not be deleted because saving failed. It has not been removed. Please try again.'); dirty(); })
          .finally(() => { if (committingAccounts.get(connection.recordKey) === deletion) committingAccounts.delete(connection.recordKey); });
        await deletion.completion;
        return;
      }
      if (['createCharacter','chat','partyChat','whisper'].includes(message.type) && connection.account.communityRulesVersion !== COMMUNITY_VERSION) {
        send(socket, { type: 'community', version: COMMUNITY_VERSION, accepted: false });
        reject('Accept the community rules before creating a name or sending chat.', message.type); return;
      }
      if (message.type === 'createCharacter') {
        if (connection.session) { reject('Return to character selection before creating another character.'); return; }
        if (connection.account.characters.length >= 6) { reject('Your account already has six characters.'); return; }
        const nameError = characterNameError(message.name);
        if (nameError) { reject(nameError, 'createCharacter'); return; }
        const name = message.name.trim();
        if (!appearanceValid(message.appearance)) { reject('Choose valid character options and colors.', 'createCharacter'); return; }
        if (objectionableText(name)) { reject('Choose a name that follows the community rules.', 'createCharacter'); return; }
        if (connection.account.characters.some(p => p.name.toLowerCase() === name.toLowerCase())) { reject('You already have a character with that name.'); return; }
        const learnedSpells = spellsForClass(message.appearance.className).filter(spell => spell.requiredLevel === 1).map(spell => spell.id);
        const p = { id: randomUUID(), name, arenaRatings: normalizeArenaRatings(), arenaWagers: [], friendIds: [], friendRequestIds: [], ignoreIds: [], appearance: copyAppearance(message.appearance), characterCreated: true, title: connection.account.betaTester === true ? 'beta-tester' : null, achievements: newAchievements({ characterCreated: true, zone: 'greenwood' }), onboarding: newOnboarding(), rootvaultUnlocked: false, zeppelinPorts: [], talents: [], talentVersion: TALENT_VERSION, learnedSpells, ridingRank: 0, ownedMounts: [], ownedPets: [], tamedCompanion: null, treasureMap: null, treasureClaims: [], storeOrders: [], nftOrders: [], mobileStoreOrders: [], storeGrants: [], storePurchases: [], storeConsumables: {}, storeBoosts: {}, summonedPet: null, petLootMinQuality: 'uncommon', hotbar: defaultHotbar(message.appearance.className, 1, learnedSpells).slice(0, LEGACY_HOTBAR_PAGE_SIZE), hotbar2: Array(LEGACY_HOTBAR_PAGE_SIZE).fill(null), hotbarExtra: [null, null], hotbar2Extra: [null, null], ...starterGear(message.appearance.className), ...newBags(), coordinateVersion: 2, zone: 'greenwood', x: 0, z: 8, rotation: 0, hp: 100, maxHp: 100, level: 1, xp: 0, gold: 0, auctions: [], auctionSales: [], bank: newBank(), inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 }, carriedItems: {}, itemUseReadyAt: 0, skills: newSkills(), craftingXp: 0, contracts: newContracts(), storyQuests: newStoryQuests(), meadGodPaid: false, quest: newQuest() };
        const creation = {};
        committingAccounts.set(connection.recordKey, creation);
        creation.completion = save(new Map(), () => { connection.account.characters.push(p); },
          new Map([[connection.recordKey, { characters: [...connection.account.characters, p] }]]))
          .then(() => { if (accountConnections.get(connection.recordKey) === connection) sendRoster(connection); })
          .catch(error => { console.error('Character creation save failed:', error.message); reject('Your character could not be saved. Please try again.', 'createCharacter'); })
          .finally(() => { if (committingAccounts.get(connection.recordKey) === creation) committingAccounts.delete(connection.recordKey); });
        await creation.completion;
        return;
      }
      const session = connection.session;
      if (!session || sessions.get(session.player.id) !== session) { reject('Choose a character and enter the world first.', ['selectTitle', 'pollOpen', 'pollVote'].includes(message.type) ? message.type : undefined); return; }
      const p = session.player;
      if (session.jump.climb && ['attack', 'autoAttack', 'gather', 'mount', 'sit', 'interact', 'emote'].includes(message.type)) {
        reject('Finish climbing or let go before doing that.', message.type); return;
      }
      if (['mountInvite', 'mountAccept', 'mountDecline', 'mountLeave'].includes(message.type)) {
        const leave = message.type === 'mountLeave';
        if (Object.keys(message).length !== (leave ? 1 : 2) || !leave && (typeof message.playerId !== 'string' || message.playerId.length > 64)) { reject('Invalid ride request.', message.type); return; }
        let error;
        if (leave) passengers.leave(session);
        else if (message.type === 'mountDecline') passengers.decline(session, message.playerId);
        else if (ignores(session, message.playerId) || ignores(sessions.get(message.playerId), p.id)) error = 'This adventurer is unavailable.';
        else error = message.type === 'mountInvite' ? passengers.invite(session, message.playerId) : passengers.accept(session, message.playerId);
        if (error) reject(error, message.type);
        send(socket, snapshot(session)); return;
      }
      if (session.travel.driverId && ['move', 'jump', 'climb'].includes(message.type)) { correction(session, 'Your driver controls the mount. Leave the ride to move.'); return; }
      if (session.travel.driverId && ['attack', 'autoAttack', 'gather', 'mount', 'interact', 'sit', 'zeppelinBoard', 'dungeonEnter', 'dungeonSummonRespond', 'duelAccept', 'arenaAccept'].includes(message.type)) passengers.leave(session);
      if (Object.hasOwn(socialRequests, message.type)) { await manageFriends(session, message); return; }
      if (Object.hasOwn(arenaWagerFields, message.type)) { await handleArenaWager(session, connection, message); return; }
      if (['referral', 'arenaWagers', 'raidProgress', 'storyQuests', 'specialistNftOrders', 'economyVersion', 'goldReason', 'goldEvent', 'gold', 'xp', 'damage', 'inventory', 'lockedItems', 'pendingAuctionPurchases', 'skills', 'craftingXp', 'rewards', 'ownerId', 'playerId', 'instanceId', 'ownedBags', 'equippedBags', 'carriedItems', 'itemUseReadyAt', 'heatproofUntil', 'shield', 'globalCooldownUntil', 'onboarding', 'autoAttack', 'rootvaultUnlocked', 'bank', 'role', 'gm', 'flying', 'invisible', 'tagHidden', 'duel', 'duelOpponentId', 'duelStatus', 'instantCombat', 'arena', 'arenaInvites', 'arenaQueue', 'arenaMatchId', 'arenaTeam', 'arenaPhase', 'arenaEliminated', 'zeppelin', 'zeppelinPorts', 'pvp', 'achievements', 'achievementPoints', 'title', 'betaTester', 'tamedCompanion', 'combatCompanion', 'combatCompanionRecallAt', 'ownedPets', 'summonedPet', 'petPosition', 'petLootMinQuality', 'treasureMap', 'treasureClaims', 'storeOrders', 'nftOrders', 'ownedMounts', 'nftMounts', 'nftMintableMounts', 'nftMountsConfigured', 'nftPets', 'nftHouses', 'nftConfigured', 'nftMintablePets', 'mobileStoreOrders', 'storeGrants', 'storePurchases', 'storeConsumables', 'storeBoosts'].some(key => Object.hasOwn(message, key) && !(message.type === 'goldMerchantOffer' && key === 'gold' || message.type === 'raidReady' && key === 'role'))) { cheat('Game progress is controlled by the realm.'); if (['selectTitle', 'pollOpen', 'pollVote'].includes(message.type)) reject('Game progress is controlled by the realm.', message.type); return; }
      if (message.type === 'setItemLock') {
        if (Object.keys(message).length !== 3 || !itemLockIdValid(message.itemId) || typeof message.locked !== 'boolean'
          || !ownsLockItem(p, message.itemId) && !(itemLocked(p, message.itemId) && !message.locked)) { reject('Choose an item you own to change its protection.', message.type); return; }
        const lockedItems = [...new Set([...(p.lockedItems || []).filter(id => id !== message.itemId), ...(message.locked ? [message.itemId] : [])])];
        if (!itemLocksValid({ lockedItems })) { reject('Unlock another item before protecting more items.', message.type); return; }
        cancelTradeFor(p.id, 'Trade cancelled while changing item protection.');
        await completeTraining(session, { lockedItems }, message.locked ? 'Item locked. Unlock it before selling, dropping or transferring it.' : 'Item unlocked.', undefined, false, true, false, false, message.type);
        return;
      }
      const disposalId = message.type === 'dropItem' || message.type === 'sellGear' ? message.itemId
        : message.type === 'sellBag' ? `bag:${message.bagId}` : message.type === 'sellItem' ? `item:${message.itemId}`
        : message.type === 'sellResource' ? message.resource : message.type === 'auctionList' && message.item ? itemLockKey(message.item) : undefined;
      if (typeof disposalId === 'string' && itemLocked(p, disposalId)) { reject('This item is locked. Unlock it in your bags or bank first.', message.type); return; }
      if (message.type === 'petLootQuality') {
        if (Object.keys(message).length !== 2 || !PET_LOOT_QUALITIES.includes(message.quality)) { reject('Choose a minimum item rarity from Common to Mythic.', message.type); return; }
        if (p.petLootMinQuality === message.quality) { send(socket, snapshot(session)); return; }
        await completeTraining(session, { petLootMinQuality: message.quality }, `Pet pickup: ${message.quality} or better. Gold is always collected.`, undefined, false, true);
        return;
      }
      if (message.type === 'cancelContract') {
        if (Object.keys(message).length !== 2 || !Object.hasOwn(message, 'contractId') || !cancelContract(p.contracts, message.contractId)) { reject('Choose an accepted contract to cancel.', message.type); return; }
        event(session, 'info', 'Contract cancelled. Its progress has been discarded.');
        dirty(); send(socket, snapshot(session)); return;
      }
      if (message.type === 'emote') {
        if (Object.keys(message).length !== 2 || !Object.hasOwn(message, 'emoteId') || message.emoteId !== null && !emoteValid(message.emoteId)) { reject('Choose an emote from /emotes.', message.type); return; }
        if (message.emoteId === null) { session.emote = null; send(socket, snapshot(session)); return; }
        advanceJump(session, now);
        if (!canEmote(session)) { reject('Finish your activity and stand on dry ground to emote.', message.type); return; }
        if (now - session.lastChat < 750) return;
        session.lastChat = now;
        const emote = EMOTES[message.emoteId];
        session.emote = { id: message.emoteId, startedAt: now, endsAt: emote.duration === null ? null : now + emote.duration };
        for (const viewer of sessions.values()) if (seesEmote(viewer, session)) {
          send(viewer.socket, { type: 'event', kind: 'emote', text: `${p.name} ${emote.text}`, playerId: p.id });
          send(viewer.socket, snapshot(viewer));
        }
        return;
      }
      if (await handleRaidProgression(session,message)) return;
      if (raids.handle(session,message,now) || instantCombat.handle(session,message,now)) { send(socket,snapshot(session)); return; }
      updateArena(now);
      // Completed casts and earlier impacts settle before a new input can interrupt them.
      if (session.casting && (session.casting.nextTickAt ?? session.casting.endsAt) <= now) settleCombat(now);
      if (arenaMode(session)) {
        if (!['chat', 'partyChat', 'whisper', 'move', 'jump', 'attack', 'autoAttack', 'cancelCast', 'arenaForfeit', 'partyLeave', 'partyKick', 'partyPromote'].includes(message.type)) {
          reject('Finish or forfeit the arena match before doing that.', message.type); return;
        }
        if (!arenaFighter(session, now) && ['move', 'jump', 'attack', 'autoAttack'].includes(message.type)) {
          session.moveBudget = 0; session.lastMove = now;
          const reason = duelMember(session)?.eliminated ? 'You are knocked out until this match ends.' : 'Wait for the arena countdown.';
          if (message.type === 'move') correction(session, reason); else reject(reason, message.type);
          return;
        }
      }
      if (message.type === 'pollOpen' || message.type === 'pollVote') { await handlePoll(connection, message); return; }
      if (message.type === 'interact') {
        const booth = POLL_BOOTHS.find(booth => message.targetId === booth.id || message.targetId === undefined && pollNearby(session, booth) && distance(p, booth) < 2);
        if (booth) {
          if (Object.keys(message).some(field => !['type', 'targetId'].includes(field))) { reject('Invalid polling booth request.', 'pollOpen'); return; }
          await handlePoll(connection, { type: 'pollOpen', boothId: booth.id }); return;
        }
      }
      if (Object.hasOwn(treasureMapFields, message.type)) { await handleTreasureMap(session, message); return; }
      if (Object.hasOwn(treasureFields, message.type)) { await handleTreasure(session, message); return; }
      if (message.type.startsWith('specialistNft')) { await handleSpecialistNft(session, message); return; }
      if (Object.hasOwn(nftFields, message.type)) { await handleNft(session, message); return; }
      if (Object.hasOwn(storeFields, message.type)) { await handleStore(session, connection, message); return; }
      if (message.type === 'meadGodQuest') {
        if (Object.keys(message).length !== 1) { reject('Invalid MEADGod quest request.', message.type); return; }
        const nearby = () => liveSession(session) && !closing && p.hp > 0 && !session.zeppelin && session.jump.grounded
          && !inCombat(session) && villageNpcNearby(session, HEARTHLING_NPC);
        if (!nearby()) { reject('Speak to MEADGod in Willowbrook while out of combat.', message.type); return; }
        if (p.meadGodPaid) { reject('You have already earned the Pons Lover title.', message.type); return; }
        if (p.gold < MEADGOD_QUEST_COST) { reject('You need 100,000 gold to pay MEADGod.', message.type); return; }
        const saved = await completeTraining(session, () => {
          if (!nearby() || p.meadGodPaid || p.gold < MEADGOD_QUEST_COST) throw Error('MEADGod payment is no longer available.');
          return { meadGodPaid: true, gold: p.gold - MEADGOD_QUEST_COST, goldReason: 'service:meadgod' };
        }, 'Paid MEADGod 100,000 gold · Pons Lover title unlocked.', undefined, true, true, false, false, message.type);
        if (saved && nearby()) hearthlingDialogue(session);
        return;
      }
      if (message.type.startsWith('goldMerchant')) { await handleGoldMerchant(session, message); return; }
      if (message.type === 'selectTitle') {
        const title = getTitle(message.titleId);
        if (Object.keys(message).length !== 2 || !Object.hasOwn(message, 'titleId') || message.titleId !== null && !title) { reject('Choose a known title.', message.type); return; }
        if (title && !titleUnlocked({ ...p, betaTester: connection.account.betaTester === true }, title)) { reject('Unlock this title before selecting it.', message.type); return; }
        if (p.title === message.titleId) { send(socket, snapshot(session)); send(socket, { type: 'titleSelected', titleId: p.title }); return; }
        const saved = await completeTraining(session, { title: message.titleId }, title ? `Title selected: ${title.name}.` : 'Title cleared.', undefined, false, true);
        send(socket, { type: 'titleSelected', titleId: p.title, ...(!saved ? { error: 'Your title could not be saved. Please try again.' } : {}) }); return;
      }
      if (session.zeppelin && !['chat', 'partyChat', 'whisper', 'arenaQueueJoin', 'arenaQueueLeave', 'arenaAccept', 'arenaDecline'].includes(message.type)) {
        if (message.type === 'move') correction(session, 'You are aboard the zeppelin.');
        reject('Wait until the zeppelin lands.', message.type); return;
      }
      if (message.type === 'zeppelinDiscover') {
        const port = zeppelinPort(message.port);
        if (Object.keys(message).length !== 2 || !['type', 'port'].every(key => Object.hasOwn(message, key)) || !port) { reject('Choose a known zeppelin dock.', message.type); return; }
        advanceJump(session, now);
        if (!liveSession(session, now) || p.hp <= 0 || session.instanceId || !session.jump.grounded || gmFlying(session)
          || distance(p, port) > 8 || !canTraverse(p, port, WORLD_COLLIDERS, WORLD_BOUNDS)) { reject('Visit the zeppelin dock on the ground to discover it.', message.type); return; }
        if (p.zeppelinPorts.includes(port.id)) { send(socket, snapshot(session)); return; }
        await completeTraining(session, { zeppelinPorts: [...p.zeppelinPorts, port.id] }, `Discovered ${port.name} sky dock.`, undefined, false); return;
      }
      if (message.type === 'zeppelinBoard') {
        const from = zeppelinPort(message.from), flight = createZeppelinFlight(message.from, message.to, now);
        if (Object.keys(message).length !== 3 || !['type', 'from', 'to'].every(key => Object.hasOwn(message, key)) || !flight) { reject('Choose a different town from the flight board.', message.type); return; }
        if (!p.zeppelinPorts.includes(flight.from) || !p.zeppelinPorts.includes(flight.to)) { reject('Visit and discover both sky docks before flying this route.', message.type); return; }
        advanceJump(session, now);
        if (!liveSession(session, now) || p.hp <= 0 || session.instanceId || !session.jump.grounded || gmFlying(session)
          || session.casting || session.gathering || inCombat(session) || distance(p, from) > 8
          || !canTraverse(p, from, WORLD_COLLIDERS, WORLD_BOUNDS)) { reject('Reach the zeppelin dock and finish your current activity before boarding.', message.type); return; }
        const cost = economyVersion >= 1 ? GOLD_ZEPPELIN_COST : 0;
        if (p.gold < cost) { reject(`Zeppelin passage costs ${cost} gold.`, message.type); return; }
        const board = () => {
          dismount(session);
          delete p.zeppelin; // Persisted above; the session owns the flight until landing.
          cancelHits(session, true); session.shield = null; session.zeppelin = flight; session.lifeStartedAt = now;
          session.lastMove = now; session.moveBudget = 0; session.jump.sequence++;
          advanceJump(session, now);
          correction(session, `Departing for ${zeppelinPort(flight.to).name}.`);
        };
        if (!cost) {
          cancelTradeFor(p.id, 'Trade cancelled because an adventurer boarded a zeppelin.');
          board(); send(socket, snapshot(session)); dirty(); return;
        }
        await completeTraining(session, { gold: p.gold - cost, goldReason: 'service:flight', zeppelin: flight }, `Departing for ${zeppelinPort(flight.to).name} · −${cost} gold.`, board); return;
      }
      if (session.duelStatus?.stunUntil > now && (['attack', 'gather', 'jump', 'mount'].includes(message.type) || message.type === 'autoAttack' && message.targetId !== null)) { reject('You are stunned.'); return; }
      if (gmObserver(session) && ['attack', 'autoAttack', 'gather', 'mount'].includes(message.type)) { reject('Disable GM flight and invisibility before fighting, gathering or mounting.'); return; }
      if (message.type === 'attack' || message.type === 'autoAttack') {
        const guardian = enemies.find(enemy => enemy.mapExpeditionId && enemy.id === message.targetId);
        if (guardian && !mapGuardianAllowed(guardian, session)) { reject('Only the map owner and their nearby party can fight this treasure guardian.', message.type); return; }
      }
      const onboardingFeature = Object.hasOwn(auctionFields, message.type) ? 'auction'
        : message.type === 'tradeRespond' && message.accept === true ? 'gear'
        : message.type === 'npcService' && message.service === 'trade' ? 'gear'
        : message.type === 'npcService' && message.service === 'contracts' ? 'contracts'
        : Object.hasOwn(onboardingActions, message.type) ? onboardingActions[message.type] : undefined;
      if (onboardingFeature && !onboardingFeatureUnlocked(p, onboardingFeature)) { reject(onboardingLockReason(p, onboardingFeature), message.type); return; }
      if (Object.hasOwn(socialFields, message.type) && (Object.keys(message).some(key => !socialFields[message.type].includes(key))
          || !socialFields[message.type].every(key => key === 'size' || key === 'wagerMoss' || Object.hasOwn(message, key)))) { reject('Invalid social action.'); return; }
      if (message.type === 'whisper') {
        const target = typeof message.targetId === 'string' && message.targetId.length <= 128 && sessions.get(message.targetId);
        if (!liveSession(target, now) || target === session || !canSee(session, target) || ignores(target, p.id)) { reject('Choose another online adventurer to whisper to.'); return; }
        if (typeof message.text !== 'string' || message.text.length > 500) { reject('Keep whispers under 160 characters.'); return; }
        const text = cleanText(message.text, 160);
        if (objectionableText(text)) { reject('This message does not follow the community rules.'); return; }
        if (!text || now - session.lastChat < 750) return;
        session.lastChat = now;
        const whisper = { type: 'whisper', messageId: randomUUID(), from: { id: p.id, name: p.name, role: displayedRole(session) }, to: { id: target.player.id, name: target.player.name, role: displayedRole(target) }, text };
        sendCommunityChat(session, whisper, p, text, 'whisper'); sendCommunityChat(target, whisper, p, text, 'whisper'); return;
      }
      if (message.type === 'tradeRequest') {
        if (now - (session.lastTradeRequest || 0) < 1000) return;
        session.lastTradeRequest = now;
        const target = typeof message.targetId === 'string' && message.targetId.length <= 128 && sessions.get(message.targetId);
        if (!nearbyTraders(session, target, now) || ignores(target, p.id)) { reject(`Stand within ${TRADE_RANGE} metres of another living adventurer to trade.`); return; }
        if (!onboardingFeatureUnlocked(target.player, 'gear')) { reject(`${target.player.name} must loot a defeated monster before trading.`); return; }
        for (const s of [session, target]) checkTrade(playerTrades.get(s.player.id), now);
        if (playerTrades.has(p.id) || playerTrades.has(target.player.id)) { reject('An adventurer already has a trade invitation or trade open.'); return; }
        const trade = { id: randomUUID(), status: 'invited', members: [session, target], expiresAt: now + 30000, revision: 0,
          offers: [emptyOffer(), emptyOffer()], accepted: [false, false], lastOfferAt: [0, 0], committing: false };
        trades.set(trade.id, trade); for (const s of trade.members) playerTrades.set(s.player.id, trade);
        sendTrade(trade); return;
      }
      if (['tradeRespond', 'tradeOffer', 'tradeAccept', 'tradeCancel'].includes(message.type)) {
        const trade = typeof message.tradeId === 'string' && message.tradeId.length <= 128 && trades.get(message.tradeId);
        if (!trade || playerTrades.get(p.id) !== trade || !trade.members.includes(session)) { reject('That trade is not yours or is no longer available.'); return; }
        if (!checkTrade(trade, now)) return;
        if (message.type === 'tradeCancel') { closeTrade(trade, 'Trade cancelled.'); return; }
        const index = trade.members.indexOf(session);
        if (message.type === 'tradeRespond') {
          if (trade.status !== 'invited' || index !== 1 || typeof message.accept !== 'boolean') { reject('Only the invited adventurer can answer this invitation.'); return; }
          if (!message.accept) { closeTrade(trade, 'Trade declined.'); return; }
          trade.status = 'open'; trade.expiresAt = now + 120000; trade.revision++;
          sendTrade(trade); return;
        }
        if (trade.status !== 'open') { reject('Wait for the other adventurer to accept your invitation.'); return; }
        if (message.type === 'tradeOffer') {
          if (now - trade.lastOfferAt[index] < 250) { send(socket, { type: 'trade', trade: publicTrade(trade), reason: 'Wait a moment before changing your offer again.' }); return; }
          if (!validOffer(message.offer, p, trade.members[1 - index].player)) {
            send(socket, { type: 'trade', trade: publicTrade(trade), reason: 'Offer available gold and supplies, or unequipped nonstarter gear the other adventurer can use and does not own.' }); return;
          }
          trade.lastOfferAt[index] = now;
          trade.offers[index] = { gold: message.offer.gold, items: { ...message.offer.items }, gear: [...message.offer.gear] };
          trade.accepted = [false, false]; trade.revision++;
          sendTrade(trade); return;
        }
        if (!nonnegativeInteger(message.revision) || message.revision !== trade.revision) {
          send(socket, { type: 'trade', trade: publicTrade(trade), reason: 'The offer changed. Review it before accepting.' }); return;
        }
        const balances = tradeBalances(trade);
        if (!balances) { trade.accepted = [false, false]; trade.revision++; sendTrade(trade, 'Check both players’ bag space, balances and equipment before accepting.'); return; }
        if (!trade.offers.some(offer => offer.gold || offer.gear.length || Object.values(offer.items).some(Boolean))) { sendTrade(trade, 'Add gold, supplies or equipment before accepting.'); return; }
        trade.accepted[index] = true; sendTrade(trade);
        if (trade.accepted.every(Boolean)) trade.completion = completeTrade(trade, balances);
        return;
      }
      if (message.type === 'setHotbar') {
        const bank = Object.hasOwn(message, 'page') ? message.page : 0;
        const ownKey = bank === 0 ? 'hotbar' : 'hotbar2', otherKey = bank === 0 ? 'hotbar2' : 'hotbar';
        const slots = extendedHotbar(message.slots, Array.isArray(message.slots) && message.slots.length === LEGACY_HOTBAR_PAGE_SIZE ? p[`${ownKey}Extra`] : undefined);
        const otherSlots = extendedHotbar(message.otherSlots, Array.isArray(message.otherSlots) && message.otherSlots.length === LEGACY_HOTBAR_PAGE_SIZE ? p[`${otherKey}Extra`] : undefined);
        if ((bank !== 0 && bank !== 1) || !hotbarValid(slots, p.appearance.className, p.level, p.learnedSpells, p.talents)
            || Object.hasOwn(message, 'otherSlots') && !hotbarValid(otherSlots, p.appearance.className, p.level, p.learnedSpells, p.talents)) {
          event(session, 'info', 'Hotbar: choose ten slots per bank using learned abilities from your class.'); return;
        }
        p[ownKey] = slots.slice(0, LEGACY_HOTBAR_PAGE_SIZE); p[`${ownKey}Extra`] = slots.slice(LEGACY_HOTBAR_PAGE_SIZE);
        if (Object.hasOwn(message, 'otherSlots')) { p[otherKey] = otherSlots.slice(0, LEGACY_HOTBAR_PAGE_SIZE); p[`${otherKey}Extra`] = otherSlots.slice(LEGACY_HOTBAR_PAGE_SIZE); }
        dirty(); send(socket, snapshot(session)); return;
      }
      if (message.type === 'cancelGather') { cancelGathering(session); return; }
      if (message.type === 'chat' || message.type === 'partyChat') {
        const text = cleanText(message.text, 160);
        if (objectionableText(text)) { reject('This message does not follow the community rules.'); return; }
        if (!text || now - session.lastChat < 750) return;
        session.lastChat = now;
        if (message.type === 'partyChat') {
          const party = partyOf(p.id); if (!party) { reject('Join a party to use party chat.'); return; }
          const messageId = randomUUID();
          for (const id of party.members) { const member = sessions.get(id); if (member && !ignores(member, p.id)) sendCommunityChat(member, { type: 'event', kind: 'chat', channel: 'party', text: `[Party] ${p.name}: ${text}`, playerId: p.id, messageId, role: displayedRole(session) }, p, text, 'party'); }
        } else broadcast({ type: 'event', kind: 'chat', channel: 'world', messageId: randomUUID(), content: text, text: `${p.name}: ${text}`, playerId: p.id, role: displayedRole(session) }, p.zone, session.instanceId);
        return;
      }
      if (message.type === 'appearance') {
        reject('Your character name, class and appearance are permanent.');
        return;
      }
      if (message.type === 'respawn') {
        if (instantCombat.bySession(session)) { if (p.hp <= 0) instantCombat.leave(session, 'You fell in Instant Combat and returned safely.'); return; }
        if (raids.fighting(session)) { reject('Wait for this raid attempt to end. Fallen raiders return together after a wipe.'); return; }
        if (p.hp > 0 || now - (p.diedAt || 0) < DEATH_ANIMATION_MS) return;
        cancelGathering(session);
        cancelHits(session);
        const dungeon = dungeons.get(session.instanceId);
        Object.assign(p, session.instanceId ? dungeon?.checkpoint ? dungeonCheckpoint(dungeon.kind) : DUNGEON_START : toWorld(p.zone, { x: 0, z: 22 })); p.hp = p.maxHp; p.diedAt = 0;
        resetJump(session); session.moveBudget = .8 / WALK_SPEED; session.lastMove = now; session.lifeStartedAt = now;
        event(session, 'info', `You awaken at the ${getZone(p.zone).name} refuge. Your belongings are safe.`);
        correction(session, 'Returned to the refuge.');
        dirty();
        return;
      }
      if (p.hp <= 0 && !['partyDecline', 'duelDecline', 'duelForfeit', 'arenaDecline', 'arenaForfeit'].includes(message.type)) { reject('Return to the village to continue your journey.'); return; }
      if (message.type === 'combatCompanion') {
        if (Object.keys(message).length !== 2 || !['dismiss', 'recall'].includes(message.action)) { reject('Choose dismiss or recall.', message.type); return; }
        const saved = p.tamedCompanion;
        if (!saved || !talentEffectRank(p, 'beastmaster') || p.appearance.className !== 'Ranger') { reject('Learn Beastmaster and tame a creature first.', message.type); return; }
        if (inCombat(session) || now < (session.companionCombatUntil || 0)) { reject('Leave combat before managing your companion.', message.type); return; }
        if (message.action === 'recall' && (session.travel.mount || session.zeppelin || gmObserver(session) || saved.level > p.level)) { reject('Stand on foot to recall your companion.', message.type); return; }
        saved.dismissed = message.action === 'dismiss';
        if (!saved.dismissed) saved.hp = combatCompanionStats(saved.level).maxHp;
        session.companion = null;
        pendingHits = pendingHits.filter(hit => hit.session !== session || !hit.companion);
        event(session, 'info', saved.dismissed ? 'Companion dismissed.' : 'Companion recalled at full health.');
        dirty(); send(socket, snapshot(session)); return;
      }
      if (message.type === 'learnMount') {
        const mount = MOUNTS.find(mount => mount.id === message.mount);
        if (Object.keys(message).length !== 2 || !mount || mount.storeOnly || !nftAsset('mount', mount.id)) { reject('Choose a collectible mount from your bags.', message.type); return; }
        if (p.nftOrders.some(order => order.kind === 'mount' && order.assetId === mount.id && order.status === 'quoted' && order.claimSource === 'learned')) { reject('This learned mount is reserved for an NFT claim. Finish that claim before learning another copy.', message.type); return; }
        if (p.ownedMounts.includes(mount.id)) { reject('You already know this mount. You can auction extra copies.', message.type); return; }
        if (!(p.carriedItems[mount.id] > 0)) { reject('This unlearned mount must be in your bags. Withdraw it from the bank or cancel its auction first.', message.type); return; }
        const carriedItems = { ...p.carriedItems };
        if (!--carriedItems[mount.id]) delete carriedItems[mount.id];
        await completeTraining(session, { carriedItems, ownedMounts: [...p.ownedMounts, mount.id] }, `${mount.name} learned. Summon it from your mount collection.`, undefined, true, true);
        return;
      }
      if (message.type === 'learnPet' || message.type === 'summonPet') {
        const pet = petById(message.pet);
        if (Object.keys(message).length !== 2 || !Object.hasOwn(message, 'pet') || !pet && !(message.type === 'summonPet' && message.pet === null)) { reject('Choose a known pet.', message.type); return; }
        if (message.type === 'learnPet') {
          if (nftAsset('pet', pet.id) && !nftLearnedPetConvertible(pet.id) && (collectiblesChain.configured || nftStatus.configured)) { reject('Claim this pet NFT from your collection. Its current wallet owner can summon it.', message.type); return; }
          if (p.nftOrders.some(order => order.assetId === pet.id && order.status === 'quoted' && order.claimSource === 'learned')) { reject('This learned pet is reserved for an NFT claim. Finish that claim before learning another copy.', message.type); return; }
          if (p.ownedPets.includes(pet.id)) { reject('You already know this pet. You can auction extra copies.', message.type); return; }
          if (!(p.carriedItems[pet.id] > 0)) { reject('This unlearned pet must be in your bags. Withdraw it from the bank or cancel its auction first.', message.type); return; }
          const carriedItems = { ...p.carriedItems };
          if (!--carriedItems[pet.id]) delete carriedItems[pet.id];
          await completeTraining(session, { carriedItems, ownedPets: [...p.ownedPets, pet.id] }, `${pet.name} learned. Summon it from your pet collection.`, undefined, true, true);
        } else {
          const nft = pet && !p.ownedPets.includes(pet.id);
          if (nft) {
            await refreshNftOwnership(session, true);
            if (!liveSession(session) || closing || committingAccounts.has(session.recordKey)) return;
            if (!publicNftOwnership(session).nftPets.includes(pet.id)) { reject('Your verified wallet must currently own this pet NFT before summoning it.', message.type); return; }
          }
          if (!nft && !session.nftSummonedPet && p.summonedPet === message.pet) { send(socket, snapshot(session)); return; }
          await completeTraining(session, { summonedPet: nft ? null : message.pet }, pet ? `${pet.name} summoned.` : 'Pet dismissed.', () => {
            session.nftSummonedPet = nft && publicNftOwnership(session).nftPets.includes(pet.id) ? pet.id : null;
          }, false, true);
        }
        return;
      }
      if (message.type === 'onboardingViewed') {
        if (Object.keys(message).length !== 2 || !['bag', 'gear'].includes(message.panel)) { reject('Invalid beginner journey acknowledgement.'); return; }
        if (!p.onboarding || p.onboarding.completed) return;
        if (!onboardingFeatureUnlocked(p, message.panel) || message.panel === 'gear' && !p.onboarding.bagViewed) { reject('Follow the current beginner lesson before continuing.'); return; }
        const field = message.panel === 'bag' ? 'bagViewed' : 'gearViewed';
        if (p.onboarding[field]) return;
        await completeTraining(session, { onboarding: { ...p.onboarding, [field]: true } }, message.panel === 'bag' ? 'Backpack explored.' : 'Character equipment explored.', undefined, false); return;
      }
      if (Object.hasOwn(bankFields, message.type)) {
        const fields = bankFields[message.type];
        if (Object.keys(message).length !== fields.length || !fields.every(field => Object.hasOwn(message, field))
          || message.type !== 'bankOpen' && !bankItemValid(message.item)) { reject('Choose an item and quantity from your bags or bank.', message.type); return; }
        if (!bankNearby(session, message.npcId)) { reject('Speak to the banker inside your city bank.', message.type); return; }
        if (message.type === 'bankOpen') { stand(session); storyVisit(session, bankNearby(session)); sendBank(session, undefined, true); return; }
        const withdrawing = message.type === 'bankWithdraw';
        if (withdrawing && message.item.kind === 'gear' && auctionIncomingGear(p.id, message.item.id)) { reject('That gear is reserved for an auction payment.', message.type); return; }
        const projected = (withdrawing ? bankWithdraw : bankDeposit)(p, message.item);
        if (!projected) { reject(withdrawing ? 'That item is unavailable, already owned, or your bags are full.' : 'Deposit items you own and have unequipped. Your bank must have space.', message.type); sendBank(session); return; }
        // Only inventory fields are staged; combat and movement continue independently while the save is written.
        const changes = Object.fromEntries(['bank', 'inventory', 'carriedItems', 'ownedGear', 'ownedBags'].map(field => [field, projected[field]]));
        const description = withdrawing ? 'Item withdrawn to your bags.' : 'Item deposited in your bank.';
        const saved = await completeTraining(session, changes, description);
        sendBank(session, saved ? description : 'Your bank transfer could not be saved. Please try again.');
        return;
      }
      if (Object.hasOwn(auctionFields, message.type)) {
        const rejectAuction = text => reject(text, message.type);
        const fields = auctionFields[message.type];
        const optionalHash = message.type === 'auctionPaymentCheck' && Object.hasOwn(message, 'transactionHash');
        if (Object.keys(message).length !== fields.length + Number(optionalHash) || !fields.every(field => Object.hasOwn(message, field))
            || optionalHash && (typeof message.transactionHash !== 'string' || !/^0x[\da-f]{64}$/i.test(message.transactionHash))) { rejectAuction('Invalid auction request.'); return; }
        if (!auctionNearby(session, message.npcId)) { rejectAuction('Speak to the auctioneer at your city auction house.'); return; }
        await refreshRecords();
        if (!liveSession(session) || connection.releasing || committingAccounts.has(session.recordKey)) return;
        if (message.type === 'auctionOpen') { storyVisit(session, auctionNearby(session, message.npcId)); await refreshAuctionStatus(); sendAuction(session, undefined, true); return; }
        if (message.type === 'auctionWalletChallenge') {
          if (typeof message.wallet !== 'string' || message.wallet.length !== 42) { rejectAuction('Choose a valid wallet address.'); return; }
          if (now - (session.lastWalletChallenge || 0) < 1000) { rejectAuction('Wait a moment before requesting another wallet confirmation.'); return; }
          session.lastWalletChallenge = now;
          try { send(socket, { type: 'auctionWalletChallenge', ...chain.challenge(p.id, message.wallet, connection.origin) }); }
          catch { rejectAuction('Choose a valid wallet address.'); }
          return;
        }
        if (message.type === 'auctionWalletBind') {
          if (typeof message.signature !== 'string' || !/^0x[\da-f]{130}$/i.test(message.signature)) { rejectAuction('Confirm the wallet ownership message.'); return; }
          let wallet;
          try { wallet = chain.verifyWallet(p.id, message.signature, connection.origin); }
          catch { rejectAuction('Wallet confirmation is invalid or expired. Request a new confirmation.'); return; }
          const busy = auctionWalletLocked(p.id);
          if ((busy || p.arenaWagers.length || specialistNftLocked(p) || p.storeOrders.some(order => !['delivered', 'expired'].includes(order.status)) || p.nftOrders.some(order => order.status === 'quoted')) && p.auctionWallet?.toLowerCase() !== wallet.toLowerCase()) { rejectAuction('Finish pending wallet payments before changing wallets.'); return; }
          if (await completeAuction(session, [{ recordKey: session.recordKey, player: p, changes: auctionWalletChanges(p, wallet) }], 'Auction wallet connected.')) {
            invalidateNftOwnership(session); await refreshNftOwnership(session);
          }
          return;
        }
        if (message.type === 'auctionList') {
          if (!auctionAssetValid(message.item) || !auctionCanList(p, message.item)) { rejectAuction(`List items or supplies you own, or unequipped nonstarter gear. You can have ${AUCTION_MAX_LISTINGS} listings.`); return; }
          if (message.item.kind === 'gold' && (economyVersion < 1 || !goldExchangeEnabled || message.currency !== 'moss')) { rejectAuction('Gold Exchange listings require MOSS and an enabled exchange.'); return; }
          if (message.item.kind !== 'gold' && economyVersion >= 1 && !['gold', 'moss'].includes(message.currency)) { rejectAuction('Choose gold or MOSS for gameplay item listings.'); return; }
          if (!auctionItemsRetained(p, auctionItemChanges(p, message.item, -1))) { rejectAuction(auctionFinalityMessage); return; }
          if (message.currency === 'eth' || message.currency === 'moss') {
            const status = paymentStatus(message.currency);
            if (!status?.enabled) { rejectAuction(status?.reason || 'Robinhood Chain trading is not available. Your items have not moved.'); return; }
            if (!p.auctionWallet) { rejectAuction(`Connect and confirm your wallet before listing an item for ${message.currency.toUpperCase()}.`); return; }
            try { auctionPriceWei(message.price, message.currency); } catch { rejectAuction(`Enter a positive ${message.currency.toUpperCase()} price with up to 18 decimal places.`); return; }
          } else if (message.currency !== 'gold' || auctionGoldPrice(message.price) === null) { rejectAuction('Choose a price from 1 to 1,000,000,000 gold.'); return; }
          const listing = { id: randomUUID(), sellerId: p.id, sellerName: p.name, item: { ...message.item }, currency: message.currency, price: message.price, createdAt: now,
            ...(message.currency !== 'gold' ? { sellerWallet: p.auctionWallet } : {}),
            ...(message.item.kind === 'gold' ? { goldFee: auctionGoldFee(message.item.quantity) } : economyVersion >= 1 && message.currency === 'gold' ? { goldFee: auctionItemFee(Number(message.price)) } : {}) };
          await completeAuction(session, [{ recordKey: session.recordKey, player: p, changes: { ...auctionItemChanges(p, listing.item, -1), ...(listing.item.kind === 'gold' ? { goldReason: 'escrow:auction' } : {}), auctions: [...p.auctions, listing] } }], `Listed ${auctionItemLabel(listing.item)} for ${listing.price} ${listing.currency === 'gold' ? 'gold' : listing.currency.toUpperCase()}.`);
          return;
        }
        const listingId = typeof message.listingId === 'string' && message.listingId.length === 36 ? message.listingId : '';
        const owner = auctionOwner(listingId);
        const listing = owner?.player.auctions.find(listing => listing.id === listingId);
        if (!owner || !listing) { rejectAuction('That listing has already been bought or cancelled.'); sendAuction(session); return; }
        if (committingAccounts.has(owner.recordKey)) { rejectAuction('That seller is finishing another transaction. Please try again.'); return; }
        if (message.type === 'auctionPaymentCheck') {
          if (listing.reservation?.buyerId !== p.id) { rejectAuction('That payment is not yours.'); return; }
          const outcome = await settleAuction(listing.id, message.transactionHash);
          const remaining = auctionOwner(listing.id)?.player.auctions.find(item => item.id === listing.id);
          sendAuction(session, outcome === 'bags-full' ? 'Payment confirmed. Make room in your bags to receive your item.' : remaining?.reservation?.processed ? 'Payment found. Checking gold delivery.' : remaining?.reservation?.delivered ? 'Your item is in your bags while payment is checked.' : remaining?.reservation ? 'Waiting for payment to be processed. Your item stays reserved.' : remaining ? 'The unpaid reservation expired. The item is available again.' : listing.item.kind === 'gold' ? 'Payment processed. Gold was delivered after the exchange fee.' : 'Payment processed. Your item is in your bags.'); return;
        }
        if (listing.reservation) {
          if (message.type === 'auctionBuy' && listing.reservation.buyerId === p.id) { sendAuctionPayment(session, listing); return; }
          rejectAuction('That item is reserved for a wallet payment. It stays locked until payment is verified or unpaid expiry is finalized.'); return;
        }
        const auctions = owner.player.auctions.filter(item => item.id !== listing.id);
        if (message.type === 'auctionCancel') {
          if (owner.player.id !== p.id) { rejectAuction('You can only cancel your own listings.'); return; }
          if (!auctionReceive({ ...p, auctions }, listing.item, undefined, true)) { rejectAuction('Make room in your bags before cancelling this listing.'); return; }
          await completeAuction(session, [{ ...owner, changes: { ...auctionItemChanges(p, listing.item, 1), ...(listing.item.kind === 'gold' ? { goldReason: 'escrow:auction' } : {}), auctions } }], listing.item.kind === 'gold' ? 'Listing cancelled. All reserved gold was returned.' : 'Listing cancelled. The items are back in your bags.');
          return;
        }
        if (owner.recordKey === session.recordKey) { rejectAuction('You cannot buy your own account’s listings.'); return; }
        if (!auctionReceive(p, listing.item)) { rejectAuction(listing.item.kind === 'gear' ? 'That gear is already owned, reserved in another listing, or unavailable for your class and level. Your bags must have space.' : 'Your bags must have space for these items.'); return; }
        if (listing.currency === 'eth' || listing.currency === 'moss') {
          const status = paymentStatus(listing.currency);
          if (!status?.enabled) { rejectAuction(status?.reason || 'Robinhood Chain trading is unavailable.'); return; }
          if (!p.auctionWallet) { rejectAuction(`Connect and confirm your wallet before paying with ${listing.currency.toUpperCase()}.`); return; }
          if (p.auctionWallet.toLowerCase() === listing.sellerWallet.toLowerCase()) { rejectAuction('Choose another wallet’s listing.'); return; }
          const buyer = { recordKey: session.recordKey, player: p };
          const committed = await completeAuction(session, [owner, buyer], 'Item reserved. Confirm the payment in your wallet.', async () => {
            const terms = await referralTerms(session, listing);
            const order = await paymentChain(listing.currency).prepareOrder({ listingId: listing.id, buyer: p.auctionWallet, seller: listing.sellerWallet, priceWei: auctionPriceWei(listing.price, listing.currency), ...terms });
            if (terms.referralQuoteExpiresAt && Date.now() > terms.referralQuoteExpiresAt) throw Error('The referral price expired. Please try again.');
            const reserved = { ...listing, reservation: { buyerId: p.id, expiresAt: order.deadline * 1000, order, ...(terms.referralUsdCents !== undefined ? { referralBoundAt: connection.account.referral.boundAt } : {}) } };
            return [{ ...owner, changes: { auctions: owner.player.auctions.map(item => item.id === listing.id ? reserved : item) } }, { ...buyer, changes: {} }];
          });
          if (committed) sendAuctionPayment(session, owner.player.auctions.find(item => item.id === listing.id));
          return;
        }
        const price = auctionGoldPrice(listing.price);
        if (price === null) { rejectAuction('That currency is not available for trading.'); return; }
        const proceeds = price - (listing.goldFee || 0);
        if (p.gold < price || !Number.isSafeInteger(owner.player.gold + proceeds)) { rejectAuction('You need enough gold, and the seller must be able to receive it.'); return; }
        await completeAuction(session, [
          { ...owner, changes: { gold: owner.player.gold + proceeds, goldReason: 'transfer:auction', goldEvent: { reason: 'auction:fee', created: 0, burned: listing.goldFee || 0, transferred: proceeds }, auctions, auctionSales: auctionRecordSale(owner.player, listing, p.name) } },
          { recordKey: session.recordKey, player: p, changes: { gold: p.gold - price, goldReason: 'transfer:auction', ...auctionItemChanges(p, listing.item, 1) } },
        ], `Bought ${auctionItemLabel(listing.item)} for ${price} gold.`);
        return;
      }
      if (message.type === 'dropItem') {
        if (Object.keys(message).length !== 3 || !['type', 'itemId', 'quantity'].every(key => Object.hasOwn(message, key))
            || typeof message.itemId !== 'string' || !message.itemId.length || message.itemId.length > 128
            || !Number.isSafeInteger(message.quantity) || message.quantity < 1) { reject('Choose an item and quantity from your bags.', message.type); return; }
        const { itemId, quantity } = message;
        let changes, label;
        if (itemId.startsWith('bag:')) {
          const bag = p.ownedBags.find(bag => bag.id === itemId.slice(4));
          if (!bag || quantity !== 1 || p.equippedBags.includes(bag.id)) { reject('Only an unequipped bag you own can be dropped.', message.type); return; }
          changes = { ownedBags: p.ownedBags.filter(owned => owned.id !== bag.id) };
          label = BAG_ITEMS[bag.kind].label;
        } else {
          const item = { kind: gearIdValid(itemId) ? 'gear' : inventoryKeys.includes(itemId) ? 'resource' : 'item',
            id: itemId.startsWith('item:') ? itemId.slice(5) : itemId, quantity };
          if (item.kind === 'gear') {
            if (quantity !== 1 || !p.ownedGear.includes(item.id)) { reject('Choose equipment you own.', message.type); return; }
            if (Object.values(p.equipment).includes(item.id)) { reject('Equipped gear cannot be dropped. Unequip it first.', message.type); return; }
          } else if (item.kind === 'resource' ? p.inventory[item.id] < quantity
            : !itemId.startsWith('item:') || !lootItemValid(item.id) || (p.carriedItems[item.id] || 0) < quantity) {
            reject('Choose an item and quantity you still own.', message.type); return;
          }
          changes = auctionItemChanges(p, item, -1);
          label = auctionItemLabel(item);
        }
        cancelTradeFor(p.id, 'Trade cancelled while dropping an item.');
        await completeTraining(session, changes, `Destroyed ${quantity} ${label}.`, undefined, true, true);
        return;
      }
      if (message.type === 'sellItem' || message.type === 'useItem') {
        const fields = message.type === 'sellItem' ? ['type', 'npcId', 'itemId', 'quantity'] : ['type', 'itemId'];
        if (Object.keys(message).length !== fields.length || !fields.every(field => Object.hasOwn(message, field)) || !lootItemValid(message.itemId)) { reject('Choose a known item from your bags.'); return; }
        const item = LOOT_ITEMS[message.itemId], owned = p.carriedItems[item.id] || 0;
        if (!owned) { reject('That item is no longer in your bags.'); return; }
        if (item.id === 'treasure-map') { reject('Use the treasure map to begin an expedition.', message.type); return; }
        if (item.id === 'moss-voucher') { reject('Bring this voucher to Veyl, the shady merchant in Willowbrook.', message.type); return; }
        if (item.category === 'pet' || item.category === 'mount') { reject('Learn this collectible from your collection or list it on the auction house.', message.type); return; }
        const carriedItems = { ...p.carriedItems };
        if (message.type === 'sellItem') {
          const npc = typeof message.npcId === 'string' && VILLAGE_NPCS.find(npc => npc.id === message.npcId);
          if (!villageNpcNearby(session, npc) || npc.role !== 'merchant') { reject('Visit a nearby merchant to sell your items.'); return; }
          if (!Number.isSafeInteger(message.quantity) || message.quantity < 1 || message.quantity > owned) { reject('Choose a quantity you own.'); return; }
          const gold = goldSource(item.sellPrice, 'resale', economyVersion >= 1) * message.quantity;
          if (!gold) { reject('This item cannot be sold for gold.'); return; }
          if (!Number.isSafeInteger(gold) || !Number.isSafeInteger(p.gold + gold)) { reject('You cannot carry more gold.'); return; }
          carriedItems[item.id] -= message.quantity; if (!carriedItems[item.id]) delete carriedItems[item.id];
          await completeTraining(session, { carriedItems, gold: p.gold + gold, goldReason: 'vendor:loot' }, `Sold ${message.quantity} ${item.label} · +${gold} gold`, undefined, true, false, false, false, message.type);
        } else {
          const heatproof = item.id === 'heatproof-tonic';
          if (!heatproof && (!item.heal || !['food', 'potion'].includes(item.category))) { reject('That item can be sold to a merchant.'); return; }
          if (!heatproof && p.hp >= p.maxHp) { reject('You are already at full health.'); return; }
          if (swimming(session)) { reject('Reach dry land before using that item.'); return; }
          if (now < p.itemUseReadyAt) { reject('Wait for your consumable cooldown to finish.'); return; }
          if (item.category === 'food' && inCombat(session)) { reject('Finish combat before eating food.'); return; }
          carriedItems[item.id]--; if (!carriedItems[item.id]) delete carriedItems[item.id];
          if (heatproof) {
            await completeTraining(session, { carriedItems, itemUseReadyAt: now + 10000, heatproofUntil: now + HEATPROOF_DURATION_MS }, `Used ${item.label} · 20% less fire damage for 5 minutes.`, undefined, true, true);
            return;
          }
          await completeTraining(session, () => ({ carriedItems, itemUseReadyAt: now + 10000, hp: p.hp > 0 ? Math.min(p.maxHp, p.hp + item.heal) : 0 }), `Used ${item.label}.`, currentHp => {
            // Persist the heal with consumption. Later damage follows normal combat autosaving;
            // applying the result must preserve that damage and never resurrect a defeated player.
            p.hp = currentHp; restoreHealth(session, item.heal);
            dirty();
          }, true, true);
        }
        return;
      }
      if (Object.hasOwn(bagFields, message.type)) {
        const fields = bagFields[message.type];
        if (Object.keys(message).length !== fields.length || !fields.every(field => Object.hasOwn(message, field))) { reject('Invalid bag request.'); return; }
        let changes, description;
        if (message.type === 'buyBag' || message.type === 'sellBag') {
          const npc = typeof message.npcId === 'string' && VILLAGE_NPCS.find(npc => npc.id === message.npcId);
          const stock = npc && bagMerchantStock(npc.id);
          if (!villageNpcNearby(session, npc) || !stock?.length) { reject('Visit a nearby bag merchant.'); return; }
          if (message.type === 'buyBag') {
            const item = bagKindValid(message.itemId) && BAG_ITEMS[message.itemId];
            if (!item || !stock.some(offered => offered.id === item.id) || p.level < item.requiredLevel || p.gold < item.price) { reject('Choose a bag available for your level and gold.'); return; }
            const bag = { id: randomUUID(), kind: item.id }, equippedBags = [...p.equippedBags];
            const empty = equippedBags.indexOf(null); if (empty >= 0) equippedBags[empty] = bag.id;
            changes = { ownedBags: [...p.ownedBags, bag], equippedBags, gold: p.gold - item.price, goldReason: 'service:bag' };
            description = `Bought ${item.label}${empty >= 0 ? ' and equipped it' : ''} · ${item.price} gold`;
          } else {
            const bag = typeof message.bagId === 'string' && p.ownedBags.find(bag => bag.id === message.bagId);
            if (!bag || p.equippedBags.includes(bag.id)) { reject('Only an unequipped bag you own can be sold.'); return; }
            const item = BAG_ITEMS[bag.kind], refund = goldSource(Math.floor(item.price / 4), 'resale', economyVersion >= 1);
            if (!Number.isSafeInteger(p.gold + refund)) { reject('You cannot carry more gold.'); return; }
            changes = { ownedBags: p.ownedBags.filter(owned => owned.id !== bag.id), gold: p.gold + refund, goldReason: 'vendor:bag' };
            description = `Sold ${item.label} · +${refund} gold`;
          }
        } else {
          if (!Number.isInteger(message.slot) || message.slot < 0 || message.slot >= BAG_SLOT_COUNT) { reject('Choose one of your four bag slots.'); return; }
          const equippedBags = [...p.equippedBags];
          if (message.type === 'equipBag') {
            const bag = typeof message.bagId === 'string' && p.ownedBags.find(bag => bag.id === message.bagId);
            if (!bag || p.level < BAG_ITEMS[bag.kind].requiredLevel) { reject('Equip a bag you own and meet the level requirement.'); return; }
            const previous = equippedBags.indexOf(bag.id); if (previous >= 0) equippedBags[previous] = null;
            equippedBags[message.slot] = bag.id; description = `Equipped ${BAG_ITEMS[bag.kind].label}.`;
          } else {
            if (equippedBags[message.slot] === null) return;
            equippedBags[message.slot] = null; description = 'Bag returned to your backpack.';
          }
          changes = { equippedBags };
        }
        if (!bagCanFit(p, changes)) { reject('Your bags are full. Make room before changing bags.'); return; }
        await completeTraining(session, changes, description, undefined, true, false, false, false, message.type === 'sellBag' ? message.type : undefined); return;
      }
      if (Object.hasOwn(trainingFields, message.type)) {
        const fields = trainingFields[message.type];
        if (Object.keys(message).length !== fields.length || !fields.every(field => Object.hasOwn(message, field))) { reject('Invalid training request.'); return; }
        const npc = typeof message.npcId === 'string' && TRAINER_NPCS.find(npc => npc.id === message.npcId);
        if (!villageNpcNearby(session, npc)) { reject('Visit the appropriate trainer or mount seller nearby.'); return; }
        let cost, changes, description;
        if (message.type === 'learnSpell') {
          if (!abilityValid(message.ability, p.appearance.className) || npc.className !== p.appearance.className || npc.role !== `${p.appearance.className.toLowerCase()}-trainer`) { reject('Visit the trainer for your calling.'); return; }
          const spell = SPELLS[message.ability];
          if (spell.requiredTalent || p.level < spell.requiredLevel || p.learnedSpells.includes(spell.id)) { reject('Meet the spell level requirement and choose a spell you have not learned.'); return; }
          cost = spellTrainingCost(spell.id); changes = { learnedSpells: [...p.learnedSpells, spell.id] }; description = `Learned ${spell.label}`;
        } else if (message.type === 'learnRiding') {
          const lesson = RIDING_LESSONS.find(lesson => lesson.rank === message.rank);
          if (npc.role !== 'riding-trainer' || !lesson || p.ridingRank !== lesson.rank - 1 || p.level < lesson.level) { reject('Visit a riding trainer with the required level and previous riding rank.'); return; }
          cost = lesson.cost; changes = { ridingRank: lesson.rank }; description = `Learned ${lesson.label}`;
        } else {
          if (npc.role !== 'mount-seller' || typeof message.mount !== 'string' || !Object.hasOwn(MOUNT_PRICES, message.mount) || !p.ridingRank || p.level < MOUNT_UNLOCK_LEVEL || p.ownedMounts.includes(message.mount)) { reject('Learn riding and choose a mount you do not own at a mount seller.'); return; }
          cost = MOUNT_PRICES[message.mount]; changes = { ownedMounts: [...p.ownedMounts, message.mount] }; description = `Bought ${MOUNTS.find(mount => mount.id === message.mount).name}`;
        }
        if (!nonnegativeInteger(cost) || p.gold < cost) { reject(`You need ${cost} gold for this purchase.`); return; }
        await completeTraining(session, { ...changes, gold: p.gold - cost, goldReason: 'service:training' }, `${description} · ${cost} gold`); return;
      }
      if (message.type === 'buyGear' || message.type === 'sellGear' || message.type === 'sellResource') {
        const npc = typeof message.npcId === 'string' && message.npcId.length <= 128 && VILLAGE_NPCS.find(npc => npc.id === message.npcId);
        if (!villageNpcNearby(session, npc) || npc.role !== 'merchant') { reject('Visit a nearby merchant to trade.'); return; }
        if (message.type === 'buyGear' && !merchantStock(npc.id).some(item => item.id === message.itemId)) { reject('This merchant does not stock that item.'); return; }
      }
      if (message.type === 'sellGear') {
        if (Object.keys(message).length !== 3 || !['type', 'npcId', 'itemId'].every(key => Object.hasOwn(message, key))
            || typeof message.itemId !== 'string' || !gearIdValid(message.itemId)) { reject('Choose a known item of equipment to sell.'); return; }
        const item = gearById(message.itemId), gold = goldSource(gearSellPrice(item.id), 'resale', economyVersion >= 1);
        if (gold <= 0 || !p.ownedGear.includes(item.id) || Object.values(p.equipment).includes(item.id)) { reject('Sell unequipped gear from your bags. Starter gear cannot be sold.'); return; }
        if (!Number.isSafeInteger(p.gold + gold)) { reject('You cannot carry more gold.'); return; }
        await completeTraining(session, { ownedGear: p.ownedGear.filter(id => id !== item.id), gold: p.gold + gold, goldReason: 'vendor:gear' }, `Sold ${item.label} · +${gold} gold`, undefined, true, false, false, false, message.type);
        return;
      }
      if (message.type === 'npcService') {
        const npc = typeof message.npcId === 'string' && message.npcId.length <= 128 && VILLAGE_NPCS.find(npc => npc.id === message.npcId);
        const service = message.service;
        if (!villageNpcNearby(session, npc) || !['trade', 'contracts', 'heal', 'potion'].includes(service)
            || (service === 'trade' || service === 'potion' ? npc.role !== 'merchant' : service === 'contracts' ? npc.role !== 'warden' : npc.role !== 'healer')) { reject('Speak to the appropriate villager nearby.'); return; }
        if (service === 'trade' || service === 'contracts') {
          if (now - (session.lastNpcMenu || 0) < 300) return;
          session.lastNpcMenu = now; stand(session); cancelGathering(session);
          send(socket, { type: 'villageService', npcId: npc.id, service }); return;
        }
        if (now - (session.lastNpcService || 0) < 700) return;
        if (service === 'heal' && p.hp >= p.maxHp) { event(session, 'info', 'You are already fully rested.'); return; }
        const price = NPC_SERVICE_COSTS[service];
        if (p.gold < price) { event(session, 'info', `You need ${price} gold for ${service === 'heal' ? 'a restorative rest' : 'a healing potion'}.`); return; }
        if (service === 'potion' && !bagCanFit(p, { inventory: { ...p.inventory, potion: p.inventory.potion + 1 } })) { event(session, 'info', 'Your bags are full. Make room for another potion.'); return; }
        session.lastNpcService = now; stand(session); cancelGathering(session); changeGold(p, -price, `service:${message.service}`);
        if (service === 'heal') restoreHealth(session, p.maxHp); else p.inventory.potion++;
        event(session, 'reward', service === 'heal' ? `Restored to full health · −${price} gold` : `Bought a healing potion · −${price} gold`, service === 'heal');
        dirty();
      } else if (message.type === 'duelRequest') {
        const target = typeof message.targetId === 'string' && message.targetId.length <= 128 && sessions.get(message.targetId);
        if (now - (session.lastDuelRequest || 0) < 1000) return;
        session.lastDuelRequest = now;
        if (!canStartDuel(session, target, now) || ignores(target, p.id)) { reject('Stand within 8 metres of an available adventurer with more than 1 HP to duel.'); return; }
        for (const [id, invite] of duelInvitations) if (invite.expiresAt <= now) duelInvitations.delete(id);
        if ([...duelInvitations.values()].some(invite => [p.id, target.player.id].some(id => invite.inviterId === id || invite.targetId === id))
            || [...arenaInvitations.values()].some(invite => invite.members.some(member => [session, target].includes(member.session)))) { reject('An adventurer already has a pending challenge.'); return; }
        removeArenaQueue(session); removeArenaQueue(target);
        const id = randomUUID();
        duelInvitations.set(id, { id, inviterId: p.id, inviterName: p.name, targetId: target.player.id, expiresAt: now + 30000 });
        event(session, 'info', `Challenged ${target.player.name} to a duel.`);
        send(target.socket, snapshot(target));
      } else if (message.type === 'duelAccept' || message.type === 'duelDecline') {
        const invite = typeof message.invitationId === 'string' && message.invitationId.length <= 128 && duelInvitations.get(message.invitationId);
        if (!invite || invite.targetId !== p.id || invite.expiresAt <= now) { reject('That duel invitation has expired.'); return; }
        const challenger = sessions.get(invite.inviterId);
        duelInvitations.delete(invite.id);
        if (message.type === 'duelDecline') {
          if (liveSession(challenger, now)) event(challenger, 'info', `${p.name} declined the duel.`);
          send(socket, snapshot(session)); return;
        }
        if (!canStartDuel(challenger, session, now) || ignores(session, invite.inviterId)) { reject('That adventurer is no longer available nearby to duel.'); send(socket, snapshot(session)); return; }
        removeArenaQueue(challenger); removeArenaQueue(session);
        const duel = { id: randomUUID(), mode: 'duel', members: [challenger, session].map((session, team) => ({ session, team, eliminated: false })) };
        for (const { session: member } of duel.members) {
          cancelHits(member); cancelGathering(member);
          member.shield = null; member.duelStatus = null;
        }
        for (const { session: member } of duel.members) member.duel = duel;
        for (const { session: member } of duel.members) {
          event(member, 'info', `Duel started with ${duelOpponent(member).player.name}. First to 1 HP loses.`);
          send(member.socket, snapshot(member));
        }
      } else if (message.type === 'duelForfeit') {
        if (session.duel?.mode !== 'duel') { reject('You are not in a duel.'); return; }
        endDuel(session, `${p.name} forfeited. ${duelOpponent(session).player.name} won the duel.`);
      } else if (message.type === 'arenaQueueJoin') {
        const size = message.size ?? 1, party = partyOf(p.id);
        if (![1, 2, 3].includes(size) || message.size === null) { reject('Choose Solo, 2v2 or 3v3.'); return; }
        if (size > 1 && (!party || party.members.length !== size || party.leaderId !== p.id)) {
          reject(`For ${size}v${size}, the leader must queue a party of exactly ${size}.`); return;
        }
        const members = size === 1 ? [session] : party.members.map(id => sessions.get(id));
        if (members.some(member => !canQueueArena(member, now, size) || hasPendingChallenge(member, now))) {
          reject('Every fighter must be alive and available. Solo requires leaving your party.'); return;
        }
        if (arenaQueue.has(session)) {
          if (arenaQueue.get(session).size !== size) reject('Leave your current queue before choosing another bracket.');
          send(socket, snapshot(session)); return;
        }
        if (members.some(member => arenaQueue.has(member))) { reject('A teammate is already in an arena queue.'); return; }
        const entry = { joinedAt: now, size, members, rating: Math.round(members.reduce((sum, member) => sum + member.player.arenaRatings[size].rating, 0) / size),
          parties: size > 1 ? [{ id: party.id, leaderId: party.leaderId, members: [...party.members] }] : [] };
        for (const member of members) arenaQueue.set(member, entry);
        for (const member of members) {
          event(member, 'info', `Finding a rated ${size}v${size} match. Keep adventuring; leave combat to accept.`); send(member.socket, snapshot(member));
        }
        updateArenaQueue(now); send(socket, snapshot(session));
      } else if (message.type === 'arenaQueueLeave') {
        removeArenaQueue(session, `${p.name} left the arena queue.`);
        for (const invite of arenaInvitations.values()) if (invite.queued && invite.members.some(member => member.session === session))
          cancelArenaInvitation(invite, `${p.name} left the arena ready check.`);
        send(socket, snapshot(session));
      } else if (message.type === 'arenaRequest') {
        const target = typeof message.targetId === 'string' && message.targetId.length <= 128 && sessions.get(message.targetId), size = message.size ?? 1;
        if (![1, 2, 3].includes(size) || message.size === null) { reject('Choose a 1v1, 2v2 or 3v3 arena challenge.'); return; }
        const stake = message.wagerMoss === undefined ? 0n : arenaWagerAmount(message.wagerMoss);
        if (stake === null || stake > 0n && size !== 1) { reject('Choose a MOSS amount for a direct 1v1 challenge only.'); return; }
        if (stake > 0n && (arenaWagerNative(session) || target && arenaWagerNative(target))) { reject('MOSS arena wagers are unavailable in the iOS app.'); return; }
        if (now - (session.lastArenaRequest || 0) < 1000) return;
        session.lastArenaRequest = now;
        if (target === session || !canStartArena(session, now) || !canStartArena(target, now)) { reject('All fighters must be available outside combat with more than 1 HP.'); return; }
        const teams = [partyOf(p.id), partyOf(target.player.id)];
        if (size > 1 && (!teams.every((party, team) => party && party.members.length === size && party.leaderId === [p.id, target.player.id][team]) || teams[0] === teams[1])) {
          reject(`For ${size}v${size}, each leader needs a separate party of exactly ${size}. Challenge the opposing leader.`); return;
        }
        const members = (size > 1 ? teams.map(party => party.members.map(id => sessions.get(id))) : [[session], [target]])
          .flatMap((team, index) => team.map(member => ({ session: member, team: index, accepted: member === session })));
        if (members.some(member => !member.session) || new Set(members.map(member => member.session)).size !== size * 2) { reject('Choose two separate arena teams.'); return; }
        if ([...arenaInvitations.values()].some(invite => invite.members.some(other => members.some(member => member.session === other.session)))
            || [...duelInvitations.values()].some(invite => members.some(member => [invite.inviterId, invite.targetId].includes(member.session.player.id)))) { reject('A fighter already has a pending challenge.'); return; }
        const invite = { id: randomUUID(), inviterId: p.id, inviterName: p.name, size, expiresAt: now + 30000, members,
          ...(stake > 0n ? { wagerMoss: message.wagerMoss } : {}),
          parties: size > 1 ? teams.map(party => ({ id: party.id, leaderId: party.leaderId, members: [...party.members] })) : [] };
        if (stake > 0n && (!arenaWagerReady(invite) || members.some(({ session }) => session.player.arenaWagers.length >= ARENA_MAX_PENDING_WAGERS))) {
          reject('Link different wallets on separate accounts and settle existing MOSS wagers before challenging.'); return;
        }
        if (stake > 0n) {
          const status = await wagerChain.status();
          if (!status.enabled) { reject(status.reason || 'MOSS arena wagers are unavailable.'); return; }
          if (closing || !arenaInvitationValid(invite, Date.now()) || members.some(({ session }) => hasPendingChallenge(session, Date.now()))) return;
        }
        if (!arenaInvitationValid(invite, now)) { reject('Every fighter must stay available. Check both teams and ignore lists.'); return; }
        for (const { session: member } of members) removeArenaQueue(member);
        arenaInvitations.set(invite.id, invite);
        for (const { session: member } of members) {
          event(member, 'info', `${p.name} proposed a ${size}v${size} arena match. Every fighter must accept.`); send(member.socket, snapshot(member));
        }
      } else if (message.type === 'arenaAccept' || message.type === 'arenaDecline') {
        const invite = typeof message.invitationId === 'string' && message.invitationId.length <= 128 && arenaInvitations.get(message.invitationId);
        const member = invite?.members.find(member => member.session === session);
        if (!member) { reject('That arena challenge is no longer available.'); return; }
        if (invite.preparing) { reject('Saving the agreed MOSS wager.'); return; }
        if (message.type === 'arenaDecline') { cancelArenaInvitation(invite, `${p.name} cancelled the arena challenge.`); return; }
        if (invite.funding) { await checkArenaFunding(invite); return; }
        if (!arenaInvitationValid(invite, now)) {
          cancelArenaInvitation(invite, invite.queued ? 'Arena ready check cancelled because a fighter is no longer available.' : 'Arena challenge cancelled. All fighters must stay available with their teams unchanged.'); return;
        }
        const reason = invite.queued && arenaQueueAcceptReason(session);
        if (reason) { reject(reason); send(socket, snapshot(session)); return; }
        if (invite.wagerMoss && !arenaWagerReady(invite)) { cancelArenaInvitation(invite, 'The agreed MOSS wallets are no longer available.'); return; }
        member.accepted = true;
        if (invite.members.every(member => member.accepted && (!invite.queued || !arenaQueueAcceptReason(member.session)))) {
          if (invite.wagerMoss) await prepareArenaFunding(invite); else startArena(invite, now);
        }
        else for (const { session: other } of invite.members) send(other.socket, snapshot(other));
      } else if (message.type === 'arenaForfeit') {
        if (!arenaMode(session)) { reject('You are not in an arena match.'); return; }
        endDuel(session, `${p.name} forfeited. The opposing team wins.`);
      } else if (message.type === 'partyInvite') {
        const target = typeof message.targetId === 'string' && sessions.get(message.targetId);
        let party = partyOf(p.id);
        if (now - (session.lastInvite || 0) < 1000) return;
        session.lastInvite = now;
        if (!target || !canSee(session, target) || ignores(target, p.id) || target === session || target.player.hp <= 0 || session.instanceId || target.instanceId || partyOf(target.player.id) || party && (party.leaderId !== p.id || party.members.length >= 4)) { reject('Invite an available adventurer while your party has room.'); return; }
        if (!party) { party = { id: randomUUID(), leaderId: p.id, members: [p.id] }; parties.set(party.id, party); }
        for (const [id, invite] of invitations) if (invite.inviterId === p.id && invite.targetId === target.player.id) invitations.delete(id);
        const id = randomUUID(); invitations.set(id, { id, inviterId: p.id, inviterName: p.name, targetId: target.player.id, partyId: party.id, expiresAt: now + 60000 });
        void mobilePush.invite(target.recordKey, { id, title: 'Party invitation', body: `${p.name} invited you to a party.`, expiresAt: now + 60000 }).catch(pushError);
        event(session, 'info', `Invited ${target.player.name}.`);
      } else if (message.type === 'partyAccept' || message.type === 'partyDecline') {
        const invite = typeof message.invitationId === 'string' && invitations.get(message.invitationId);
        if (!invite || invite.targetId !== p.id || invite.expiresAt <= now) { reject('That party invitation has expired.'); return; }
        const party = parties.get(invite.partyId);
        invitations.delete(invite.id);
        if (message.type === 'partyDecline') return;
        if (session.instanceId || partyOf(p.id) || !party || ignores(session, invite.inviterId) || party.leaderId !== invite.inviterId || party.members.length >= 4 || party.members.some(id => !sessions.has(id) || sessions.get(id).instanceId)) { reject('That party is no longer available.'); return; }
        arenaPartyChanged(party); party.members.push(p.id); event(session, 'info', `Joined ${invite.inviterName}’s party.`);
      } else if (message.type === 'partyLeave' || message.type === 'partyKick' || message.type === 'partyPromote') {
        const party = partyOf(p.id), targetId = message.type === 'partyLeave' ? p.id : message.targetId;
        if (!party || typeof targetId !== 'string' || !party.members.includes(targetId) || message.type !== 'partyLeave' && (party.leaderId !== p.id || targetId === p.id)) { reject('Only your party leader can manage other members.'); return; }
        if (message.type === 'partyPromote') { arenaPartyChanged(party); party.leaderId = targetId; }
        else {
          const target = sessions.get(targetId), run = dungeons.get(target?.instanceId);
          const room = run && dungeonLayout(run.kind).rooms.find(room => Math.abs(target.player.x - room.x) <= room.width / 2 && Math.abs(target.player.z - room.z) <= room.depth / 2);
          if (run && !run.dream && target.player.hp > 0 && room?.id !== 'preparation' && !run.cleared.has(room?.id)) { reject('Defeat every monster in that chamber before leaving or removing its adventurer from the party.'); return; }
          for (const dungeon of dungeons.values()) if ((dungeon.partyId === party.id || dungeon === run) && dungeon.roster?.some(member => member.id === targetId)) (dungeon.abandoned ||= new Set()).add(targetId);
          if (target?.instanceId && !instantCombat.bySession(target)) { const arena = arenaMode(target); leaveDungeon(target); if (!arena) correction(target, 'Returned to the dungeon entrance.'); }
          leaveParty(targetId);
        }
      } else if (message.type === 'dungeonLeaderboard') {
        if (Object.keys(message).some(key => !['type', 'dungeonId', 'partySize', 'requestId'].includes(key))
            || typeof message.dungeonId !== 'string' || !getDungeon(message.dungeonId) || ![1, 2, 3, 4].includes(message.partySize)
            || message.requestId !== undefined && (!Number.isSafeInteger(message.requestId) || message.requestId < 0)) { reject('Choose a dungeon and party size.'); return; }
        const reply = { type: 'dungeonLeaderboard', dungeonId: message.dungeonId, partySize: message.partySize, requestId: message.requestId, entries: [] };
        if (now - (session.lastDungeonLeaderboard || 0) < 500) { send(socket, { ...reply, error: 'Please wait a moment before refreshing.' }); return; }
        session.lastDungeonLeaderboard = now;
        try { reply.entries = await dungeonRecords.list(message.dungeonId, message.partySize); }
        catch (error) { console.error('Dungeon leaderboard read failed:', error.message); reply.error = 'The leaderboard is unavailable. Please try again.'; }
        if (connection.session === session && liveSession(session)) send(socket, reply);
      } else if (message.type === 'dungeonEnter') {
        if (Object.keys(message).some(key => !['type', 'dungeonId'].includes(key))) { reject('Choose an available dungeon.'); return; }
        enterDungeon(session, message.dungeonId);
      } else if (message.type === 'dungeonSummon') {
        summonPartyMember(session, message.dungeonId, message.targetId);
      } else if (message.type === 'dungeonSummonRespond') {
        respondDungeonSummon(session, message.summonId, message.accept);
      } else if (message.type === 'dungeonInteract') {
        if (Object.keys(message).length !== 2 || typeof message.targetId !== 'string') { reject('Choose a dungeon object or room portal.'); return; }
        dungeonInteract(session, message.targetId);
      } else if (message.type === 'dungeonExit') {
        const run = dungeons.get(session.instanceId);
        const returnPortal = dungeonReturn(run?.kind);
        const exit = distance(p, DUNGEON_EXIT) <= 3 ? DUNGEON_EXIT : run?.completed && distance(p, returnPortal) <= 3 ? returnPortal : null;
        if (!run || !exit || !canTraverse(p, exit, instanceColliders(run.id), dungeonBounds(run.kind))) { reject('Use the entrance exit, or the final return portal after clearing the dungeon.'); return; }
        leaveDungeon(session); correction(session, 'Returned to the dungeon entrance.'); send(socket, snapshot(session));
      } else if (message.type === 'storyQuest') {
        const quest = typeof message.questId === 'string' && storyQuestById(message.questId);
        if (!['type', 'action', 'questId'].every(key => Object.hasOwn(message, key)) || Object.keys(message).some(key => !['type', 'action', 'questId', 'rewardSlot'].includes(key))
          || !quest || !['talk', 'accept', 'claim', 'abandon'].includes(message.action)
          || Object.hasOwn(message, 'rewardSlot') && (message.action !== 'claim' || typeof message.rewardSlot !== 'string'
            || !quest.reward.gear?.choice || !quest.reward.gear.slots.includes(message.rewardSlot))) { reject('Choose a known story quest and its offered reward.'); return; }
        const active = Object.hasOwn(p.storyQuests.active, quest.id);
        const npcId = active && message.action !== 'accept' ? quest.turnInNpcId ?? quest.npcId : quest.npcId;
        const npc = [...NPCS, ...TRAINER_NPCS, ...VILLAGE_NPCS].find(item => item.id === npcId);
        if (!liveSession(session) || p.hp <= 0 || session.zeppelin || !villageNpcNearby(session, npc)) { reject('Speak with the quest giver nearby.'); return; }
        if (message.action === 'abandon') {
          if (!abandonStoryQuest(p.storyQuests, quest.id)) { reject('That quest is not active.'); return; }
          storyEncounters.clear(session, undefined, quest.id);
          event(session, 'info', `${quest.title} abandoned.`); dirty(); send(socket, snapshot(session)); return;
        }
        if (message.action === 'accept') {
          if (!acceptStoryQuest(p.storyQuests, quest.id, p.level)) { reject('That quest is unavailable, requires a higher level, or your journal is full.'); return; }
          storyVisit(session, npc); event(session, 'info', `Quest accepted: ${quest.title}`); dirty();
          send(socket, snapshot(session)); sendStoryDialogue(session, quest, npc.id, storyQuestReady(p.storyQuests, quest.id) ? 'complete' : 'progress'); return;
        }
        if (!active && !storyQuestAvailable(p, quest)) { reject('That quest is not available.'); return; }
        storyVisit(session, npc);
        if (message.action === 'talk') {
          send(socket, snapshot(session)); sendStoryDialogue(session, quest, npc.id, active ? storyQuestReady(p.storyQuests, quest.id) ? 'complete' : 'progress' : 'offer'); return;
        }
        const gold = goldSource(quest.reward.gold, 'contract', economyVersion >= 1);
        if (!storyQuestReady(p.storyQuests, quest.id) || !Number.isSafeInteger(p.gold + gold)) { reject('Finish the objectives before claiming this reward.'); return; }
        const changes = storyQuestRewardChanges(p, quest, message.rewardSlot);
        if (!changes) { reject('Choose an offered reward and make room for the quest items.'); return; }
        if (!claimStoryQuest(p.storyQuests, quest.id)) { reject('That quest reward has already been claimed.'); return; }
        const professionXp = quest.reward.professionXp && Object.fromEntries(Object.keys(quest.reward.professionXp).map(skill => [skill, changes.skills[skill] - p.skills[skill]]));
        Object.assign(p, changes); changeGold(p, gold, 'reward:campaign'); const xp = addXp(session, quest.reward.xp);
        event(session, 'reward', `${quest.title} complete · +${xp} XP · +${gold} gold`, true);
        const gear = quest.reward.gear && { ...quest.reward.gear, choice: false, slots: [gearById(changes.ownedGear.at(-1)).slot] };
        dirty(); send(socket, snapshot(session)); sendStoryDialogue(session, quest, npc.id, 'reward', { ...quest.reward, xp, gold, ...(professionXp ? { professionXp } : {}), ...(gear ? { gear } : {}) });
      } else if (message.type === 'acceptContract' || message.type === 'claimContract') {
        if (session.instanceId || typeof message.contractId !== 'string' || !physicalReach(session, toWorld(p.zone, BOARD_POSITION), 3) && !VILLAGE_NPCS.some(npc => npc.role === 'warden' && villageNpcNearby(session, npc))) { reject('Visit the regional notice board or a village warden.'); return; }
        if (message.type === 'acceptContract') {
          if (!acceptContract(p.contracts, message.contractId, p.zone, now, p.level)) { reject('That contract is unavailable, requires a higher level, or your journal is full.'); return; }
          if (onboardingCanComplete(p)) p.onboarding = { ...p.onboarding, completed: true };
          event(session, 'info', 'Contract accepted.');
        } else {
          const offered = CONTRACTS.find(c => c.id === message.contractId);
          if (!offered || !Number.isSafeInteger(p.gold + goldSource(offered.reward.gold, 'contract', economyVersion >= 1))) { reject('That contract cannot be claimed.'); return; }
          const contract = claimContract(p.contracts, message.contractId, p.zone, now, economyVersion >= 1);
          if (!contract) { reject('Finish this contract before claiming its reward.'); return; }
          p.achievements.contracts = Math.min(Number.MAX_SAFE_INTEGER, p.achievements.contracts + 1);
          const gold = goldSource(contract.reward.gold, 'contract', economyVersion >= 1);
          changeGold(p, gold, 'reward:contract'); const earnedXp = addXp(session, contract.reward.xp);
          event(session, 'reward', `${contract.label} complete · +${gold} gold · +${earnedXp} XP`, true);
        }
        dirty();
      } else if (message.type === 'craft') {
        const recipe = typeof message.recipeId === 'string' && RECIPES.find(r => r.id === message.recipeId);
        if (now - (session.lastCraft || 0) < 700) return;
        if (recipe && craftingProgress(p.craftingXp).level < recipe.requiredCraftingLevel) { reject(`${recipe.label} requires Crafting level ${recipe.requiredCraftingLevel}.`); return; }
        if (session.instanceId || !physicalReach(session, toWorld(p.zone, WORKSHOP_POSITION), 3) || !recipe || !recipeAllowed(p, recipe) || recipe.output.gear && (auctionEscrowHas(p, recipe.output.gear) || bankEscrowHas(p, recipe.output.gear) || auctionIncomingGear(p.id, recipe.output.gear)) || !Number.isSafeInteger(p.craftingXp + recipe.craftingXp)) { reject('Use a workshop with the required materials and level.'); return; }
        const cost = craftingGoldCost(recipe, economyVersion >= 1);
        if (p.gold < cost) { reject(`Crafting ${recipe.label} costs ${cost} gold.`); return; }
        const { inventory, ownedGear, carriedItems } = recipeOutput(p, recipe);
        if (!auctionItemsRetained(p, { inventory, ownedGear, carriedItems })) { reject(auctionFinalityMessage, message.type); return; }
        if (!bagCanFit(p, { inventory, ownedGear, carriedItems })) { reject('Your bags are full. Make room for the crafted item.'); return; }
        session.lastCraft = now; stand(session); cancelGathering(session);
        const oldCraftingLevel = craftingProgress(p.craftingXp).level, earnedXp = Math.min(Math.max(0, MAX_SKILL_XP - p.craftingXp), Math.floor(craftingXpGain(recipe, p.craftingXp) * storeBoostMultiplier(p, 'profession-xp', now)));
        const liveContracts = p.contracts;
        if (!await completeTraining(session, () => {
          const contracts = structuredClone(liveContracts);
          contractProgress(contracts, 'craft', recipe.id);
          return { inventory, ownedGear, carriedItems, gold: p.gold - cost, goldReason: 'service:craft', craftingXp: p.craftingXp + earnedXp, contracts,
            achievements: { ...p.achievements, crafted: Math.min(Number.MAX_SAFE_INTEGER, p.achievements.crafted + 1) } };
        }, `Crafted ${recipe.label}${cost ? ` · −${cost} gold` : ''} · +${earnedXp} crafting XP`, () => {
          // Party kills can advance other contracts while the crafting save is pending.
          contractProgress(liveContracts, 'craft', recipe.id); p.contracts = liveContracts;
          p.achievements.crafted = Math.min(Number.MAX_SAFE_INTEGER, p.achievements.crafted + 1);
        })) return;
        const craftingLevel = craftingProgress(p.craftingXp).level;
        if (craftingLevel > oldCraftingLevel) {
          const unlocked = RECIPES.filter(r => (!r.className || r.className === p.appearance.className) && r.requiredCraftingLevel > oldCraftingLevel && r.requiredCraftingLevel <= craftingLevel);
          event(session, 'reward', `Crafting level ${craftingLevel} · ${professionRank(p.craftingXp).label}!${unlocked.length ? ` Unlocked: ${unlocked.map(r => r.label).join(', ')}.` : ''}`);
        }
        dirty();
      } else if (message.type === 'loot') {
        if (Object.keys(message).some(key => !['type', 'targetId', 'itemId', 'itemIds', 'requestId'].includes(key)) || typeof message.targetId !== 'string' || !message.targetId.length || message.targetId.length > 128
            || message.requestId !== undefined && !requestId
            || message.itemIds !== undefined && (message.itemId !== undefined || !Array.isArray(message.itemIds) || !message.itemIds.length || message.itemIds.length > 128
              || new Set(message.itemIds).size !== message.itemIds.length || message.itemIds.some(id => typeof id !== 'string' || !id.length || id.length > 128))
            || message.itemId !== undefined && (typeof message.itemId !== 'string' || !message.itemId.length || message.itemId.length > 128)) { reject('Unknown loot.'); return; }
        lootSuccess = await collectLoot(session, lootDrops.get(message.targetId), message.itemIds ?? message.itemId);
        if (lootSuccess) observeClientAction(connection, session, 'loot', now);
      } else if (message.type === 'upgradeGear') {
        if (Object.keys(message).length !== 2 || typeof message.gearId !== 'string' || !gearIdValid(message.gearId)) { reject('Choose equipment from your bags or equipped slots.', message.type); return; }
        if (session.travel.mount || session.casting || session.autoAttack || inCombat(session)) { reject('Dismount and finish combat actions before upgrading.', message.type); return; }
        const quote = gearUpgradeQuote(message.gearId), next = upgradeGear(p, message.gearId);
        if (!quote || !next || bankEscrowHas(p, quote.nextId) || auctionEscrowHas(p, quote.nextId) || auctionIncomingGear(p.id, quote.nextId)) { reject('You need upgradable equipment, its materials in your bags, and enough gold. Maximum upgrade is +5.', message.type); return; }
        await completeTraining(session, { inventory: next.inventory, gold: next.gold, goldReason: 'service:upgrade', ownedGear: next.ownedGear, equipment: next.equipment, ...(next.lockedItems ? { lockedItems: next.lockedItems } : {}) }, `${quote.next.label} upgraded · −${quote.gold} gold`);
      } else if (message.type === 'buyGear' || message.type === 'equipGear') {
        const item = typeof message.itemId === 'string' && gearIdValid(message.itemId) ? gearById(message.itemId) : null;
        if (!item || item.className && item.className !== p.appearance.className || p.level < item.requiredLevel) { reject('That item is not available for your class and level.'); return; }
        if (message.type === 'buyGear') {
          if (item.price <= 0 || p.ownedGear.includes(item.id) || auctionEscrowHas(p, item.id) || bankEscrowHas(p, item.id) || auctionIncomingGear(p.id, item.id) || p.gold < item.price) { reject('You already own or have reserved that item, or need more gold.'); return; }
          if (!bagCanFit(p, { ownedGear: [...p.ownedGear, item.id] })) { reject('Your bags are full. Make room for that equipment.'); return; }
          changeGold(p, -item.price, 'service:gear');
          p.ownedGear.push(item.id);
          event(session, 'reward', `Bought ${item.label} for ${item.price} gold.`);
          dirty();
        } else {
          if (!p.ownedGear.includes(item.id)) { reject('You must own that item before equipping it.'); return; }
          const slot = message.slot === undefined ? equipmentSlotFor(p.equipment, item.id) : message.slot;
          if (!EQUIPMENT_SLOTS.includes(slot) || !gearFitsSlot(item.id, slot)) { reject('That item does not fit the selected equipment slot.'); return; }
          if (item.slot === 'ring' && p.equipment[slot === 'ring1' ? 'ring2' : 'ring1'] === item.id) { reject('Unequip that ring before moving it to the other hand.'); return; }
          if (!bagCanFit(p, { equipment: { ...p.equipment, [slot]: item.id } })) { reject('Your bags are full. Make room for the replaced equipment.'); return; }
          await completeTraining(session, { equipment: { ...p.equipment, [slot]: item.id } }, `Equipped ${item.label}.`);
        }
      } else if (message.type === 'unequipGear') {
        const slot = message.slot;
        if (!EQUIPMENT_SLOTS.includes(slot) || slot === 'weapon' || slot === 'armor') { reject('Keep a weapon and body armor equipped.'); return; }
        if (p.equipment[slot] === null) return;
        if (!bagCanFit(p, { equipment: { ...p.equipment, [slot]: null } })) { reject('Your bags are full. Make room before removing that equipment.'); return; }
        await completeTraining(session, { equipment: { ...p.equipment, [slot]: null } }, 'Item returned to your backpack.');
      } else if (message.type === 'sellResource') {
        if (typeof message.resource !== 'string' || !Object.hasOwn(RESOURCE_PRICES, message.resource) || !Number.isSafeInteger(message.quantity)
            || message.quantity < 1 || message.quantity > 1000000 || p.inventory[message.resource] < message.quantity) { reject('Choose a valid quantity of a resource you own.'); return; }
        const gold = message.quantity * goldSource(RESOURCE_PRICES[message.resource], 'resale', economyVersion >= 1);
        if (!Number.isSafeInteger(p.gold + gold)) { reject('You cannot carry more gold.'); return; }
        if (!auctionItemsRetained(p, { inventory: { ...p.inventory, [message.resource]: p.inventory[message.resource] - message.quantity } })) { reject(auctionFinalityMessage, message.type); return; }
        p.inventory[message.resource] -= message.quantity;
        changeGold(p, gold, 'vendor:resource');
        event(session, 'reward', `Sold ${message.quantity} ${message.resource} for ${gold} gold.`, false, message.type);
        dirty();
      } else if (message.type === 'resetTalents') {
        if (Object.keys(message).length !== 1 || inCombat(session) || session.autoAttack || session.gathering) { reject('Finish combat and gathering before resetting talents.'); return; }
        if (!p.talents.length) return;
        const cost = talentResetGoldCost(p, economyVersion >= 1);
        if (p.gold < cost) { reject(`You need ${cost} gold to reset talents.`); return; }
        const hotbar = availableHotbar(extendedHotbar(p.hotbar, p.hotbarExtra), p.appearance.className, p.level, p.learnedSpells, []), hotbar2 = availableHotbar(extendedHotbar(p.hotbar2, p.hotbar2Extra), p.appearance.className, p.level, p.learnedSpells, []);
        await completeTraining(session, { talents: [], hotbar: hotbar.slice(0, LEGACY_HOTBAR_PAGE_SIZE), hotbarExtra: hotbar.slice(LEGACY_HOTBAR_PAGE_SIZE), hotbar2: hotbar2.slice(0, LEGACY_HOTBAR_PAGE_SIZE), hotbar2Extra: hotbar2.slice(LEGACY_HOTBAR_PAGE_SIZE), gold: p.gold - cost, goldReason: 'service:respec' }, `Talents reset${cost ? ` · −${cost} gold` : ''}. All earned points are available to spend again.`, () => { session.combatTalents = null; });
      } else if (message.type === 'learnTalent') {
        if (typeof message.talentId !== 'string' || !canLearnTalent(p, message.talentId)) { reject('You need an unspent talent point, the required level, branch points and prerequisite ranks.'); return; }
        p.talents.push(message.talentId);
        p.maxHp = maxHealth(p); p.hp = Math.min(p.hp, p.maxHp);
        event(session, 'reward', `Learned ${TALENTS[message.talentId].label}.`);
        dirty();
      } else if (message.type === 'travel') {
        event(session, 'info', 'The roads are open. Walk into the neighboring region.');
      } else if (message.type === 'chooseEnding') {
        const q = p.quest;
        const rowan = NPCS.find(n => n.id === 'rowan');
        if (session.instanceId || typeof message.ending !== 'string' || !Object.hasOwn(ENDINGS, message.ending) || q.chapter !== 8 || q.stage !== 2 || q.completed || p.zone !== rowan.zone || distance(p, rowan) > 3) { event(session, 'info', 'Bring the lantern to Rowan before choosing its future.'); return; }
        if (!grantChapterReward(session, CHAPTERS[8])) return;
        q.ending = message.ending; q.completed = true; q.stage = 3;
        checkAchievements(session);
        dialogue(session, 'rowan', ENDINGS[q.ending].title, [...CHAPTERS[8].dialogue.complete, ...ENDINGS[q.ending].epilogue]);
        dirty();
      } else if (message.type === 'sit') {
        if (Object.keys(message).some(key => !['type', 'chairId'].includes(key)) || typeof message.chairId !== 'string' || message.chairId.length > 128) { reject('Choose a chair nearby.'); return; }
        const chair = BUILDING_CHAIRS.find(chair => chair.id === message.chairId);
        advanceJump(session, now);
        if (!chair || session.instanceId || !session.jump.grounded || waterAt(p.x, p.z) || distance(p, chair) > 3 || buildingAt(p.x, p.z)?.id !== chair.buildingId) { reject('Stand inside the house beside a chair to sit.'); return; }
        const approach = chairApproach(chair);
        if (!canTraverse(p, approach, WORLD_COLLIDERS, WORLD_BOUNDS)) { reject('Walk around to the front of the chair.'); return; }
        if ([...sessions.values()].some(other => other !== session && liveSession(other, now) && other.seated?.chairId === chair.id)) { reject('Someone is already sitting there.'); return; }
        cancelGathering(session); cancelCast(session); dismount(session);
        Object.assign(p, approach, { rotation: chair.rotation }); resetJump(session);
        session.seated = { chairId: chair.id, x: chair.x, z: chair.z, y: chair.y, rotation: chair.rotation };
        // Sitting moves only to a validated chair approach and never grants movement credit.
        session.moveBudget = Math.min(session.moveBudget, .1); session.lastMove = now;
        correction(session, 'Seated.'); send(socket, snapshot(session)); dirty();
      } else if (message.type === 'stand') {
        if (Object.keys(message).some(key => key !== 'type')) { reject('Invalid stand request.'); return; }
        stand(session); send(socket, snapshot(session));
      } else if (message.type === 'climb' || message.type === 'climbStop') {
        const cancel = message.type === 'climbStop';
        if (Object.keys(message).length !== (cancel ? 1 : 3) || !cancel && ![message.x, message.z].every(Number.isFinite)) { cheat('The realm determines your climbing height and energy.'); return; }
        if (!cancel && !CLIMB_ENABLED) { correction(session, 'Climbing is temporarily disabled. You can still walk and jump.'); return; }
        advanceJump(session, now);
        if (cancel) {
          if (session.jump.climb) { stopClimb(session.jump); session.lastMove = now; session.moveBudget = 0; }
          send(socket, snapshot(session)); return;
        }
        if (session.jump.climb) { send(socket, snapshot(session)); return; }
        recoverTravel(session, now);
        if (session.seated || session.zeppelin || gmFlying(session) || session.duelStatus?.stunUntil > now
            || session.casting || session.gathering || !playerRouteAllowed(session, p, message) || !startClimb(session.jump, p, message, session.travel, !!session.instanceId, collisionScene(session))) {
          correction(session, 'Climb a nearby solid surface on foot with enough energy and room above.'); return;
        }
        if (!playerRouteAllowed(session, p, session.jump.climb)) { stopClimb(session.jump); correction(session, 'Stay inside this chamber. Use its portals to travel.'); return; }
        p.rotation = session.jump.climb.rotation;
        stand(session); session.autoAttack = null; cancelBasicHits(session);
        session.lastMove = now; session.moveBudget = 0; session.lastSprintAt = now;
        recordReferralGameplay(session, now); send(socket, snapshot(session));
      } else if (message.type === 'jump') {
        if (Object.keys(message).some(key => key !== 'type')) { cheat('The realm determines your jump height.'); return; }
        const blocked = instantCombat.actionError(session, 'jump', now);
        if (blocked) { correction(session, blocked); return; }
        advanceJump(session, now);
        if (!startJump(session.jump, p.x, p.z, !!session.instanceId, collisionScene(session))) { correction(session, 'Jump from dry ground after landing.'); return; }
        stand(session); cancelGathering(session); cancelCast(session); recordReferralGameplay(session, now);
        instantCombat.recordAction(session, 'jump', now);
        send(socket, snapshot(session));
      } else if (message.type === 'mount') {
        if (Object.keys(message).some(key => !['type', 'mount'].includes(key)) || message.mount !== null && !MOUNTS.some(mount => mount.id === message.mount)) { reject('Choose a known mount.'); return; }
        if (message.mount !== null && !p.ownedMounts.includes(message.mount)) {
          await refreshNftOwnership(session, true);
          if (!liveSession(session) || closing || p.hp <= 0 || session.zeppelin || committingAccounts.has(session.recordKey)) return;
        }
        const mountAt = Date.now();
        advanceJump(session, mountAt);
        if (message.mount !== null && session.duel) { reject('Finish or forfeit your duel before mounting.'); return; }
        if (message.mount !== null && !session.jump.grounded) { reject('Land before summoning a mount.'); return; }
        if (message.mount !== null && (p.level < MOUNT_UNLOCK_LEVEL || !p.ridingRank || !hasMount(session, message.mount))) { reject('Learn riding and collect this mount before summoning it.'); return; }
        if (message.mount !== null && (session.instanceId || swimming(session) || insideBuilding(session))) { reject('Summon your mount outdoors on dry land.'); return; }
        if (message.mount !== null && session.casting?.ability === 'mount' && session.casting.mount === message.mount) { send(socket, snapshot(session)); return; }
        recoverTravel(session, mountAt);
        stand(session); cancelGathering(session); cancelCast(session);
        dismount(session);
        if (message.mount !== null) {
          cancelBasicHits(session);
          session.casting = { ability: 'mount', mount: message.mount, startedAt: mountAt, endsAt: mountAt + MOUNT_CAST_MS, rotation: p.rotation, targetId: '',
            instanceId: session.instanceId, playerLife: session.lifeStartedAt, from: { x: p.x, z: p.z } };
        }
        // Changing mounts never refreshes movement credit or fatigue.
        session.moveBudget = Math.min(session.moveBudget, .1);
        session.lastMove = mountAt;
        send(socket, snapshot(session));
      } else if (message.type === 'move') {
        if (![message.x, message.z, message.rotation].every(Number.isFinite) || message.zone !== undefined && !zoneIds.has(message.zone)
            || message.sprint !== undefined && typeof message.sprint !== 'boolean') { cheat('Invalid movement coordinates or sprint input.'); return; }
        const gm = isGmSession(session), flying = gm && session.gm.flying;
        if (Object.keys(message).some(key => !['type', 'zone', 'x', 'z', 'rotation', 'sprint', ...(gm ? ['y'] : [])].includes(key))
            || message.y !== undefined && !Number.isFinite(message.y)) { cheat('The realm determines your movement state.'); return; }
        if (!flying && Object.hasOwn(message, 'y')) { correction(session, 'GM flight is disabled.'); return; }
        // Inputs already in flight still contain coordinates from the room we just left.
        if (session.dungeonPortalUntil > now && distance(p, message) > 6) { correction(session, ''); return; }
        const climbing = !!session.jump.climb;
        recoverTravel(session, now); advanceJump(session, now);
        if (climbing) { session.lastMove = now; session.moveBudget = 0; send(socket, snapshot(session)); return; }
        movementCredit.refill(session, now, movementReceipt);
        const moved = distance(p, message);
        const combatBlocked = instantCombat.actionError(session, 'move', now);
        if (combatBlocked && moved > 1e-8) { session.moveBudget = 0; correction(session, combatBlocked); return; }
        if (session.duelStatus?.stunUntil > now && moved > .01) { session.moveBudget = 0; correction(session, 'You are stunned.'); return; }
        if (flying) {
          const bounds = session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS;
          const y = message.y ?? session.jump.y, floor = sessionFloor(session)(message.x, message.z);
          if (message.x < bounds.minX || message.x > bounds.maxX || message.z < bounds.minZ || message.z > bounds.maxZ
              || y < floor || y > floor + GM_FLY_MAX_HEIGHT) { correction(session, 'Stay within the GM flight bounds.'); return; }
          const travel = Math.hypot(moved, y - session.jump.y), cost = travel / GM_FLY_SPEED;
          if (cost > session.moveBudget + .1 / GM_FLY_SPEED) { correction(session, 'GM flight movement was too fast.'); return; }
          session.moveBudget -= cost;
          Object.assign(p, { x: message.x, z: message.z, rotation: message.rotation % (Math.PI * 2) });
          Object.assign(session.jump, { y, velocity: 0, grounded: false });
          session.travel.sprinting = false;
          if (!session.instanceId) p.zone = regionAt(p.x, p.z);
          dirty(); return;
        }
        if (session.casting?.chargeEnd || session.mobilityGraceUntil > now) { correction(session, ''); return; }
        const spellSpeed = session.combatTalents?.movementSpeedUntil > now ? session.combatTalents.movementSpeedMultiplier : 1;
        const slow = (session.duelStatus?.slowUntil > now ? session.duelStatus.slowMultiplier : 1) * (session.travel.mount ? 1 : gearSpeedMultiplier(p))
          * (SPELLS[session.casting?.ability]?.castMoveMultiplier || 1) * spellSpeed;
        const fastest = (session.travel.mount ? mountSpeed(p.level, p.ridingRank) : SPRINT_SPEED) * slow;
        // Queued positions can predate a correction, teleport or dismount. Keep
        // the same speed limit, but network arrival timing is not proof of cheating.
        if (moved > session.moveBudget * fastest + .1) { correction(session, 'Movement adjusted to the realm.'); return; }
        // The existing terrain sampler supplies wet distance; movement credit is
        // seconds so water always costs the same, irrespective of riding rank.
        const wet = session.instanceId || !session.jump.grounded || session.jump.y > jumpFloor(p.x, p.z) + .1 ? 0 : Math.min(moved, Math.max(0, (movementCost(p, message) - moved) / 1.3));
        const dry = moved - wet;
        const sprint = message.sprint === true && canSprint(session.travel);
        // Water and land use the same sprint multiplier. Charge actual boosted
        // seconds, including a partly exhausted segment across either shoreline.
        const normalTime = (dry / WALK_SPEED + wet / SWIM_SPEED) / slow, sprintRatio = SPRINT_SPEED / WALK_SPEED;
        const sprintSeconds = sprint ? Math.min(normalTime / sprintRatio, session.travel.stamina / STAMINA_DRAIN) : 0;
        const cost = session.travel.mount ? (dry / mountSpeed(p.level, p.ridingRank) + wet / SWIM_SPEED) / spellSpeed
          : normalTime - sprintSeconds * (sprintRatio - 1);
        if (cost > session.moveBudget + .1 / fastest) { correction(session, wet > 0 ? 'Water slows your movement.' : 'Movement adjusted to the realm.'); return; }
        if (!playerRouteAllowed(session, p, message)) { correction(session, 'That route is blocked.'); return; }
        if (!moveSessionJump(session, session.jump, p, message)) { correction(session, 'That slope is too steep from here.'); return; }
        session.moveBudget -= cost;
        if ((!session.instanceId && buildingAt(message.x, message.z) && session.jump.y <= jumpFloor(message.x,message.z)+3) || session.jump.grounded && wet > 1e-8) dismount(session);
        if (sprintSeconds > 0) {
          session.travel.stamina = Math.max(0, session.travel.stamina - sprintSeconds * STAMINA_DRAIN);
          session.lastSprintAt = now;
          if (session.travel.stamina < .001) { session.travel.stamina = 0; session.travel.exhausted = true; }
        }
        session.travel.sprinting = sprintSeconds > 0 && !session.travel.exhausted;
        if (moved > 0) { cancelGathering(session); session.emote = null; }
        if (moved > .01) { stand(session); if (!SPELLS[session.casting?.ability]?.castMoveMultiplier) cancelCast(session); }
        const wasPvp = worldPvp(session);
        const previousPosition = { x: p.x, z: p.z };
        p.x = message.x; p.z = message.z; p.rotation = message.rotation % (Math.PI * 2);
        movementCredit.accepted(session, movementReceipt, moved);
        rememberStanding(session);
        if (moved > 1e-8) instantCombat.recordAction(session, 'move', now);
        if (p.hp <= 0) { dirty(); return; }
        if (moved > .01) recordReferralGameplay(session, now);
        if (worldPvp(session) !== wasPvp) {
          endDuel(session, 'Duel ended at the colosseum boundary.');
          removeDuelInvitations(p.id, true); cancelPlayerCombat(session); session.shield = null;
          event(session, 'info', worldPvp(session) ? 'World PvP active. Everyone on the arena floor can fight to the death.' : 'You left the arena. World PvP ended.');
        }
        if (arenaMode(session) && !isInArena(p)) { endDuel(session, `${p.name} left the arena floor. The opposing team wins.`); return; }
        checkTrade(playerTrades.get(p.id), now);
        if (!session.instanceId) p.zone = regionAt(p.x, p.z);
        const run = dungeons.get(session.instanceId);
        if (run?.completed && crossedDungeonPortal(previousPosition, p, dungeonReturn(run.kind))) {
          leaveDungeon(session); correction(session, 'Returned to the dungeon entrance.'); send(socket, snapshot(session)); return;
        }
        if (!session.instanceId) {
          const blocked = getDungeon(session.blockedDungeonPortal);
          if (session.blockedDungeonPortal && (!blocked || p.z > blocked.entrance.z + 2 || Math.abs(p.x - blocked.entrance.x) > 3)) session.blockedDungeonPortal = null;
          const portal = DUNGEONS.find(definition => crossedDungeonPortal(previousPosition, p, definition.entrance));
          if (portal) {
            if (session.blockedDungeonPortal !== portal.id && enterDungeon(session, portal.id, true)) { session.blockedDungeonPortal = null; return; }
            session.blockedDungeonPortal = portal.id;
            Object.assign(p, previousPosition); resetJump(session); correction(session, ''); send(socket, snapshot(session)); dirty(); return;
          }
        }
        updateArena(now);
        visitAchievementZone(session);
        dirty();
      } else if (message.type === 'autoAttack') {
        if (Object.keys(message).length !== 2 || !Object.hasOwn(message, 'targetId')
            || message.targetId !== null && (typeof message.targetId !== 'string' || !message.targetId.length || message.targetId.length > 128)) { reject('Choose an enemy to auto attack, or stop attacking.'); return; }
        if (message.targetId === null) {
          session.autoAttack = null; cancelBasicHits(session);
          if (session.companion) { session.companion.target = null; session.companion.assault = null; }
          pendingHits = pendingHits.filter(hit => hit.session !== session || !hit.companionBasic);
          send(socket, snapshot(session)); return;
        }
        if (session.instanceId && dungeonPreparing(session)) { reject('Leave the Arrival Sanctuary before attacking.'); return; }
        const enemy = hostileTargets(session, now).find(enemy => enemy.id === message.targetId && hostileTargetValid(session, enemy, now));
        if (!enemy) { reject('Choose a living enemy in this world to auto attack.'); return; }
        const targetChanged = session.autoAttack?.enemy !== enemy || session.autoAttack.targetLife !== combatTargetLife(enemy);
        if (targetChanged) cancelBasicHits(session);
        if (session.casting?.ability === 'mount') cancelCast(session);
        stand(session); dismount(session); cancelGathering(session);
        session.autoAttack = { enemy, targetLife: combatTargetLife(enemy), duelId: enemy.ownerId || sessions.get(enemy.id)?.player === enemy ? session.duel?.id : undefined, playerLife: session.lifeStartedAt, instanceId: session.instanceId };
        if (targetChanged) observeClientAction(connection, session, 'targetSelection', now, enemy.id);
        session.nextAutoAttackAt = Math.max(session.nextAutoAttackAt || 0, now);
        send(socket, snapshot(session));
      } else if (message.type === 'attack') {
        const blocked = instantCombat.actionError(session, 'attack', now);
        if (blocked) { reject(blocked); return; }
        if (message.skill !== undefined && message.skill !== 'primary' && message.skill !== 'special'
            || message.ability !== undefined && !abilityValid(message.ability, p.appearance.className)) { reject('Unknown ability for your class.'); return; }
        if (message.targetId !== undefined && (typeof message.targetId !== 'string' || !message.targetId.length || message.targetId.length > 128)) { reject('Unknown target.'); return; }
        const ability = message.ability ?? legacyAbility(p.appearance.className, message.skill === 'special');
        const spell = SPELLS[ability];
        const movementBlocked = (ability === 'charge' || spell.movementDistance) && !spell.clearMovementImpairments && instantCombat.actionError(session, 'move', now);
        if (movementBlocked) { reject(movementBlocked); return; }
        if (spell.targetRelation === 'hostile' && !instantCombat.combatActive(session.instanceId)) { reject('Wait for the next Instant Combat round before attacking.'); return; }
        if (spell.targetRelation === 'hostile' && session.instanceId && dungeonPreparing(session)) { reject('Leave the Arrival Sanctuary before attacking.'); return; }
        if (!abilityUnlocked(ability, p.appearance.className, p.level, p.learnedSpells, p.talents)) { event(session, 'info', spell.requiredTalent ? `Allocate ${TALENTS[spell.requiredTalent].label} in your talent tree to use ${spell.label}.` : p.level < spell.requiredLevel ? `${spell.label} unlocks at level ${spell.requiredLevel}.` : `Visit your class trainer to learn ${spell.label}.`); return; }
        if (session.casting) return;
        advanceJump(session, now);
        if ((spellCastTimeMs(spell, combatStats(p), combatTalentState(session, now), now) > 0 || spell.channel) && !session.jump.grounded) { event(session, 'info', 'Land before casting.'); return; }
        if (swimming(session)) { event(session, 'info', 'Reach dry land before drawing your weapon.'); return; }
        if (now - session.lastAttack < GLOBAL_ATTACK_MS || now < (session.abilityCooldowns[ability] || 0)) return;
        const colliders = session.instanceId ? instanceColliders(session.instanceId) : WORLD_COLLIDERS, bounds = session.instanceId ? instanceBounds(session.instanceId) : WORLD_BOUNDS;
        let anchor, targetLife;
        if (spell.targeting === 'radial') {
          anchor = p; targetLife = session.lifeStartedAt;
        } else if (spell.targetRelation !== 'hostile') {
          const target = spell.targetRelation === 'self' || message.targetId === undefined ? session : sessions.get(message.targetId);
          const party = partyOf(p.id);
          if (!liveSession(target,now) || !friendlyTarget(session, target) || gmObserver(target) || target.zeppelin || !canSee(session, target) || target.player.hp <= 0 || target.instanceId !== session.instanceId || target.player.zone !== p.zone
              || distance(p,target.player) > spell.range || !canTraverse(p,target.player,colliders,bounds)
              || spell.targeting !== 'single' && target !== session && !party?.members.includes(target.player.id) && !raids.allies(session,target) && !instantCombat.allies(session,target)) {
            event(session,'info','Choose a living friendly target within reach.'); return;
          }
          anchor = target.player; targetLife = target.lifeStartedAt;
        } else {
          const visible = hostileTargets(session, now).filter(e => hostileTargetValid(session, e, now) && distance(p, e) <= spell.range + (spell.radius || 0) && canTraverse(p, e, colliders, bounds));
          const nearby = visible.filter(e => distance(p, e) <= spell.range && (ability !== 'cleave' || ((e.x - p.x) * Math.sin(p.rotation) + (e.z - p.z) * Math.cos(p.rotation)) / Math.max(.001, distance(p, e)) >= Math.cos(70 * Math.PI / 180))).sort((a, b) => distance(p, a) - distance(p, b));
          anchor = message.targetId !== undefined ? nearby.find(e => e.id === message.targetId) : nearby[0];
          if (ability === 'taunt' && (message.targetId === undefined || anchor?.target === session)) {
            anchor = nearby.find(enemy => enemy.threat && enemy.target && enemy.target !== session && friendlyTarget(session, enemy.target, now)) || anchor;
          }
          if (!anchor) { event(session, 'info', 'Move closer to an enemy.'); return; }
          targetLife = combatTargetLife(anchor);
        }
        if (ability === 'tame-beast' && !canTame(session, anchor, now)) { event(session, 'info', 'You cannot tame Instant Combat creatures, world bosses, dungeon bosses, training dummies, or creatures above your level.'); return; }
        if (ability === 'combined-assault') {
          const pet = activeCompanion(session, now);
          if (!pet || pet.saved.hp <= 0 || !companionInRange(session, pet, anchor)) { event(session, 'info', 'Your living companion must be in melee range for Combined Assault.'); return; }
        }
        if (ability === 'tame-beast') {
          session.autoAttack = null;
          if (session.companion) { session.companion.target = null; session.companion.assault = null; }
          pendingHits = pendingHits.filter(hit => hit.session !== session || !hit.companion);
        }
        stand(session); dismount(session); cancelGathering(session);
        if (ability !== 'cleave' && anchor !== p) p.rotation = Math.atan2(anchor.x - p.x, anchor.z - p.z);
        const stats = combatStats(p);
        let duration = spell.channel?.durationMs ?? spellCastTimeMs(spell, stats, combatTalentState(session, now), now), chargeEnd;
        if (ability === 'charge') {
          const gap = distance(p, anchor), travel = Math.max(0, gap - 1.8);
          chargeEnd = { x: p.x + (anchor.x-p.x) * travel / Math.max(.001,gap), z: p.z + (anchor.z-p.z) * travel / Math.max(.001,gap) };
          if (!session.jump.grounded || !session.instanceId && (movementCost(p,chargeEnd) > travel + 1e-8 || isInColosseum(p) !== isInColosseum(chargeEnd))
              || arenaMode(session) && !isInArena(chargeEnd)) { event(session, 'info', 'Charge needs a clear, dry path within the combat area.'); return; }
          duration = Math.max(1, Math.ceil(travel / spell.chargeSpeed * 1000));
          session.abilityCooldowns[ability] = now + spell.cooldownMs;
        }
        if (spell.movementDistance) {
          if (!session.jump.grounded) { event(session, 'info', 'Land before moving with this ability.'); return; }
          if (spell.movementDurationMs) {
            chargeEnd = mobilityDestination(session, spell.movementDistance);
            duration = Math.max(1, Math.round(spell.movementDurationMs * distance(p, chargeEnd) / spell.movementDistance));
            session.abilityCooldowns[ability] = now + spell.cooldownMs;
          }
        }
        const cast = { ability, startedAt: now, endsAt: now + duration, rotation: p.rotation, targetId: anchor.id,
          anchor, targetLife, duelId: session.duel?.id, instanceId: session.instanceId, playerLife: session.lifeStartedAt, from: { x: p.x, z: p.z }, stats, attackerLevel: p.level,
          ...(chargeEnd ? { chargeEnd } : {}),
          ...(spell.channel ? { channel:true, nextTickAt:now + spell.channel.tickMs } : {}) };
        if (ability === 'twinshot' && session.combatTalents) session.combatTalents.twinshotReadyUntil = 0;
        if (ability === 'powerful-throw' && session.combatTalents) session.combatTalents.powerfulThrowReady = false;
        cancelBasicHits(session);
        // The global cooldown starts with the accepted action and survives cancellation.
        instantCombat.recordAction(session, 'attack', now);
        if (p.hp <= 0 || instantCombat.actionError(session, 'attack', now)) { send(socket, snapshot(session)); return; }
        session.lastAttack = now; recordReferralGameplay(session, now);
        if (spell.channel) session.abilityCooldowns[ability] = now + spell.cooldownMs;
        if (duration > 0) session.casting = cast;
        else releaseCast(session,cast,now);
        send(socket, snapshot(session));
        observeClientAction(connection, session, 'attack', now);
      } else if (message.type === 'cancelCast') {
        if (Object.keys(message).some(key => !['type','ability'].includes(key)) || message.ability !== undefined && !abilityValid(message.ability, p.appearance.className)) { reject('Unknown cast.'); return; }
        if (message.ability === undefined || session.casting?.ability === message.ability) cancelCast(session);
        send(socket, snapshot(session));
      } else if (message.type === 'gather') {
        if (Object.keys(message).some(key => !['type', 'targetId'].includes(key)) || message.targetId !== undefined && (typeof message.targetId !== 'string' || !message.targetId.length || message.targetId.length > 128)) { reject('Unknown resource.'); return; }
        if (session.gathering) return;
        if (swimming(session)) { event(session, 'info', 'Reach dry land before gathering.'); return; }
        const node = nodes.filter(n => n.instanceId === session.instanceId && n.available && (message.targetId === undefined || n.id === message.targetId) && physicalReach(session, n, 3, `resource:${n.id}`)).sort((a, b) => distance(p, a) - distance(p, b))[0];
        if (!node) { event(session, 'info', 'Stand beside an available resource to gather it.'); return; }
        if (gatheringClaims.has(node.id)) { event(session, 'info', 'Another traveler is gathering that resource.'); return; }
        const resource = RESOURCE_TYPES[node.kind], { skill } = resource;
        if (!canGather(node.kind, p.skills[skill])) { event(session, 'info', `${resource.label} requires ${SKILLS[skill].label} level ${resource.requiredLevel}.`); return; }
        stand(session); cancelCast(session); dismount(session);
        if(node.waterX!==undefined&&node.waterZ!==undefined)p.rotation=Math.atan2(node.waterX-p.x,node.waterZ-p.z);
        session.gathering = { nodeId: node.id, skill, startedAt: now, endsAt: now + gatheringDuration(node.kind, p.skills[skill]) };
        gatheringClaims.set(node.id, session); recordReferralGameplay(session, now);
        observeClientAction(connection, session, 'gather', now, node.id);
      } else if (message.type === 'interact') {
        const storyObject = STORY_OBJECTS.find(object => object.id === message.targetId);
        if (storyObject) {
          const rescue = STORY_ENCOUNTERS.find(entry => entry.objectId === storyObject.id), attempt = storyEncounters.publicState(session);
          const point = attempt?.objectId === storyObject.id ? attempt : storyObject;
          if (session.instanceId || session.zeppelin || p.hp <= 0 || p.zone !== storyObject.zone || distance(p, point) > 3
            || !canTraverse(p, point, WORLD_COLLIDERS, WORLD_BOUNDS) || !Object.hasOwn(p.storyQuests.active, storyObject.questId)
            || !storyInteractAvailable(p.storyQuests, storyObject.id) && !(rescue && storyInteractAvailable(p.storyQuests, rescue.id))) {
            reject('Follow your active quest and approach its objective.'); return;
          }
          if (now - session.lastInteract < 500) return;
          session.lastInteract = now; stand(session); cancelGathering(session);
          if (attempt?.objectId === storyObject.id) { event(session, 'info', `${storyObject.name}: ${attempt.hp}% health. Stay nearby and defeat the attackers.`); return; }
          if (storyQuestProgress(p.storyQuests, { kind: 'interact', target: storyObject.id, scope: 'overworld', zone: storyObject.zone })) dirty();
          if (rescue) storyEncounters.start(session, storyObject, now);
          event(session, 'info', `${storyObject.name} · Quest journal updated.`); send(socket, snapshot(session)); return;
        }
        const bed=BUILDING_BEDS.find(bed=>bed.id===message.targetId);
        if(bed){restInBed(session,bed);return;}
        const curio=WORLD_CURIOS.find(point=>point.id===message.targetId), site=RESOURCE_SITES.find(point=>point.id===message.targetId);
        if(curio||site){const point=curio||{...site,z:site.z+15};if(session.instanceId||distance(p,point)>3||!canTraverse(p,point)){reject('Approach the landmark to read it.');return;}event(session,'info',curio?`${curio.name}: ${curio.text}`:`${site.name}: Rich deposits replenish every 10 seconds. Resources are shared with other travelers.`);return;}
        if (session.instanceId) { reject('Use the Rootvault exit to return to the world.'); return; }
        const banker = bankNearby(session, message.targetId);
        if (BANKERS.some(npc => npc.id === message.targetId) || message.targetId === undefined && banker && distance(p, banker) < 2) {
          if (banker) storyVisit(session, banker);
          if (!onboardingFeatureUnlocked(p, 'gear')) { reject(onboardingLockReason(p, 'gear')); return; }
          if (!banker) { reject("You're to far away"); return; }
          stand(session); sendBank(session, undefined, true); return;
        }
        if ((message.targetId === DEED_AUCTIONEER.id || message.targetId === undefined && distance(p, DEED_AUCTIONEER) < 2) && deedAuctionNearby(session)) { stand(session); await Promise.all([refreshNftStatus(), refreshNftAuction(session)]); if (deedAuctionNearby(session)) sendNft(session, undefined, true); return; }
        const auctioneer = auctionNearby(session, message.targetId);
        if (auctioneer && (message.targetId !== undefined || distance(p, auctioneer) < 2)) { storyVisit(session, auctioneer); if (!onboardingFeatureUnlocked(p, 'auction')) { reject(onboardingLockReason(p, 'auction')); return; } stand(session); sendAuction(session, undefined, true); return; }
        const interactables = [...NPCS, ...BEACONS, ...VILLAGE_NPCS, ...TRAINER_NPCS, GOLD_MERCHANT, HEARTHLING_NPC].filter(n => n.zone === p.zone && physicalReach(session, n, 3) && (!n.villageId && !TRAINER_NPCS.includes(n) && n.id !== GOLD_MERCHANT.id && n.id !== HEARTHLING_NPC.id || villageNpcNearby(session, n)));
        const target = message.targetId === undefined ? interactables.sort((a, b) => distance(p, a) - distance(p, b))[0] : interactables.find(n => n.id === message.targetId);
        if (!target) { event(session, 'info', "You're to far away"); return; }
        if (now - session.lastInteract < 500) return;
        stand(session);
        session.lastInteract = now;
        storyVisit(session, target);
        if (target.id === HEARTHLING_NPC.id) { hearthlingDialogue(session); return; }
        if (target.id === GOLD_MERCHANT.id) { dialogue(session, target.id, target.name, target.dialogue); return; }
        if (TRAINER_NPCS.includes(target)) { dialogue(session, target.id, target.title, [`Speak with ${target.name} to ${target.role === 'mount-seller' ? 'buy a mount' : 'learn new skills'}.`]); return; }
        if (target.villageId) {
          const service = target.role === 'merchant' ? 'trade' : target.role === 'warden' ? 'contracts' : 'heal';
          const label = service === 'trade' ? 'Browse supplies' : service === 'contracts' ? 'View regional contracts' : `Rest and recover · ${NPC_SERVICE_COSTS.heal} gold`;
          dialogue(session, target.id, target.name, target.lines, undefined, [{ id: service, label }]); return;
        }
        const q = p.quest;
        const chapter = CHAPTERS[q.chapter];
        if (q.completed && target.id === 'rowan') dialogue(session, target.id, ENDINGS[q.ending].title, ENDINGS[q.ending].epilogue);
        else if (q.completed || p.zone !== chapter.zone || target.id !== chapter.npcId) {
          const lines = 'dialogue' in target ? target.dialogue : [q.chapter >= target.litChapter ? 'The beacon answers the other lanterns, its old light steady at last.' : 'The beacon is quiet. Somewhere along the lantern roads, its story is waiting to be heard.'];
          dialogue(session, target.id, target.name, lines);
        } else if (q.stage === 0) {
          q.stage = 1;
          dialogue(session, target.id, chapter.title, chapter.dialogue.intro);
          event(session, 'info', `Quest accepted: ${chapter.title}`);
        } else {
          creditObjective(session, 'interact', target.id);
          if (q.stage !== 2) dialogue(session, target.id, chapter.title, [...chapter.dialogue.intro, ...chapter.dialogue.progress]);
          else if (q.chapter === 8) dialogue(session, target.id, chapter.title, chapter.dialogue.intro, Object.entries(ENDINGS).map(([id, ending]) => ({ id, label: ending.label })));
          else {
            if (!grantChapterReward(session, chapter)) return;
            p.quest = newQuest(q.chapter + 1, 1);
            checkAchievements(session);
            dialogue(session, target.id, chapter.title, chapter.dialogue.complete);
          }
        }
        dirty();
      } else if (message.type === 'heal') {
        if (now - session.lastHeal < 1200 || p.hp >= p.maxHp || p.inventory.potion <= 0) return;
        if (!auctionItemsRetained(p, { inventory: { ...p.inventory, potion: p.inventory.potion - 1 } })) { reject(auctionFinalityMessage, message.type); return; }
        session.lastHeal = now;
        p.inventory.potion--;
        const healed = restoreHealth(session, 55);
        event(session, 'reward', `Restored ${healed} health.`, true);
        dirty();
      } else {
        reject('Unknown action.');
      }
      } finally {
        if (lootRequest) {
          lootRequest.result = { type: 'lootResult', requestId, success: lootSuccess };
          if (requestId) send(socket, lootRequest.result);
          // Retain recent replies, but never evict a pickup whose save is still pending.
          for (const [id, request] of lootRequests) {
            if (lootRequests.size <= lootQueueLimit * 2) break;
            if (request.result) lootRequests.delete(id);
          }
        }
      }
    });
    socket.on('close', code => {
      clearTimeout(joinTimeout);
      if (connection.joined) {
        const now = Date.now(), session = connection.session;
        // Never log peer-supplied close text, tokens, account keys, or message contents.
        console.info('Game connection closed:', JSON.stringify({ at: new Date(now).toISOString(), realmId, code,
          inWorld: !!session, world: session ? { characterId: session.player.id, zone: session.player.zone,
            instanceId: session.instanceId, dungeon: dungeons.get(session.instanceId)?.kind ?? null } : connection.lastWorld ?? null,
          connectedMs: now - connection.connectedAt, lastMessageAgoMs: now - connection.lastMessageAt,
          expiresInMs: connection.expiresAt ? connection.expiresAt - now : null,
          renewalPending: !!connection.refreshing, restarting: closing || !!connection.retiring, queuedBytes: socket.bufferedAmount }));
      }
      actionGuard.forget(connection);
      connections.delete(socket);
      if (!closing) void releaseAccount(connection).catch(() => {});
      else leaveSession(connection);
    });
    if (closing) retireConnection(connection, true);
  });

  let previousTick = Date.now(), movementFrameStart = previousTick, lastSharedRefresh = 0, sharedRefresh;
  function spawnTreasureGoblin(anchor, now, alivePlayers, gmSpawned = false) {
    const regionId = surfaceAt(anchor.x, anchor.z).regionId;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = treasureRandomInt(360) * Math.PI / 180, radius = 25 + treasureRandomInt(31);
      const point = { x: anchor.x + Math.sin(angle) * radius, z: anchor.z + Math.cos(angle) * radius };
      if (surfaceAt(point.x, point.z).regionId !== regionId || !overworldSpawnAllowed(point, anchor.zone)
          || alivePlayers.some(session => !session.instanceId && distance(session.player, point) < 18)
          || enemies.some(enemy => enemy.alive && !enemy.instanceId && distance(enemy, point) < 4)
          || WORLD_BOSSES.some(boss => distance(boss, point) <= boss.arenaRadius + 5)) continue;
      const spawn = { id: `treasure-${randomUUID()}`, kind: 'treasure-goblin', zone: anchor.zone, ...point, roaming: true };
      const level = monsterSpawnLevel(spawn, regionId), stats = monsterStatsAtLevel(spawn.kind, level);
      enemies.push({ ...spawn, level, instanceId: null, name: stats.name, homeX: point.x, homeZ: point.z, hp: stats.hp, maxHp: stats.hp,
        alive: true, diedAt: 0, respawnAt: 0, lastAttack: 0, rotation: angle, attack: null, participants: new Set(), threat: new Map(), target: null,
        gmSpawned, treasure: { spawnedAt: now, portalAt: now + TREASURE_GOBLIN.idleLifetimeMs - TREASURE_GOBLIN.portalMs } });
      return true;
    }
    return false;
  }
  function updateTreasureSpawns(now, alivePlayers) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      if (!enemy.treasure || (enemy.alive ? now < treasureGoblinDeadline(enemy.treasure) : now < enemy.diedAt + 5 * 60_000)) continue;
      enemy.alive = false; enemy.attack = null;
      pendingHits = pendingHits.filter(hit => hit.enemy !== enemy);
      enemies.splice(i, 1);
    }
    if (now < nextTreasureSpawnAt) return;
    nextTreasureSpawnAt = now + TREASURE_GOBLIN.spawnIntervalMs;
    if (enemies.some(enemy => enemy.treasure && enemy.alive && !enemy.gmSpawned)) return;
    const occupied = new Map();
    for (const session of alivePlayers) if (!session.instanceId && !insideCity(session.player.x, session.player.z) && !villageSafe(session.player) && !swimming(session)) {
      const id = surfaceAt(session.player.x, session.player.z).regionId;
      if (!occupied.has(id)) occupied.set(id, []);
      occupied.get(id).push(session.player);
    }
    for (const players of occupied.values()) {
      if (treasureRandomInt(100) >= TREASURE_GOBLIN.spawnChancePercent) continue;
      const anchor = players[treasureRandomInt(players.length)];
      if (spawnTreasureGoblin(anchor, now, alivePlayers)) return;
    }
  }
  function updateTreasureGoblin(enemy, alivePlayers, now) {
    const target = alivePlayers.filter(session => !session.instanceId && !insideCity(session.player.x, session.player.z) && !villageSafe(session.player) && !swimming(session)
      && distance(session.player, enemy) < (enemy.treasure.escapeAt === undefined ? TREASURE_GOBLIN.noticeRange : CHASE_DISTANCE))
      .sort((a, b) => distance(a.player, enemy) - distance(b.player, enemy))[0];
    enemy.target = target || null;
    if (target) engageTreasureGoblin(enemy.treasure, now);
    if (enemy.treasure.escapeAt === undefined || now >= enemy.treasure.portalAt || enemy.stunUntil > now) return;
    const goal = treasureGoblinFleeGoal(enemy, target?.player, point => !villageSafe(point) && !insideCity(point.x, point.z) && !waterAt(point.x, point.z)
      && movementCost(enemy, point) <= distance(enemy, point) + 1e-8 && groundCanTraverse(enemy, point));
    if (goal) moveEnemyToward(enemy, goal, now, TREASURE_GOBLIN.fleeSpeed * (enemy.slowUntil > now ? enemy.slowMultiplier : 1), 0, false);
  }
  function moveEnemyToward(enemy, goal, at, speed, stoppingRange, chasing = true, notBefore = movementFrameStart) {
    if (enemy.instantCombat) speed *= INSTANT_COMBAT.movementSpeedMultiplier;
    const elapsed = Math.max(0, at - Math.max(enemy.movedAt ?? movementFrameStart, movementFrameStart, notBefore)) / 1000;
    enemy.movedAt = Math.max(enemy.movedAt ?? at, at);
    if (!elapsed || !speed) return true;
    const colliders = enemy.instanceId ? instanceColliders(enemy.instanceId) : WORLD_COLLIDERS, bounds = enemy.instanceId ? instanceBounds(enemy.instanceId) : WORLD_BOUNDS;
    let destination = goal;
    {
      if (groundCanTraverse(enemy, goal, colliders, bounds)) enemy.path = [];
      else {
        if (at >= (enemy.nextPathAt || 0)) {
          // ponytail: local cover detours; widen this bound if enemies need to navigate whole buildings.
          enemy.path = findPath(enemy, goal, colliders, enemy.instantCombat ? bounds : {
            minX: Math.max(bounds.minX, Math.min(enemy.x, goal.x) - 8), maxX: Math.min(bounds.maxX, Math.max(enemy.x, goal.x) + 8),
            minZ: Math.max(bounds.minZ, Math.min(enemy.z, goal.z) - 8), maxZ: Math.min(bounds.maxZ, Math.max(enemy.z, goal.z) + 8),
          });
          enemy.nextPathAt = at + 750;
        }
        while (enemy.path?.length && (distance(enemy, enemy.path[0]) < .05 || enemy.path[1] && groundCanTraverse(enemy, enemy.path[1], colliders, bounds))) enemy.path.shift();
        destination = enemy.path?.[0] || goal;
      }
    }
    const gap = distance(enemy, destination), step = Math.min(Math.max(0, gap-(destination === goal ? stoppingRange : 0)), elapsed*speed);
    if (!step) return true;
    const next = {x:enemy.x+(destination.x-enemy.x)/gap*step,z:enemy.z+(destination.z-enemy.z)/gap*step};
    if ((!enemy.instanceId && (insideCity(next.x,next.z) || !worldBossCombatAllowed(enemy,next) || waterAt(next.x,next.z) || movementCost(enemy,next)>step+1e-8))
        || dungeons.has(enemy.instanceId) && inDungeonPreparation(next, dungeons.get(enemy.instanceId).kind)
        || !chasing && (enemy.roaming||enemy.worldBoss) && villageSafe(next) && !villageSafe(enemy)
        || !groundCanTraverse(enemy,next,colliders,bounds)) return false;
    enemy.rotation=Math.atan2(next.x-enemy.x,next.z-enemy.z);enemy.x=next.x;enemy.z=next.z;return true;
  }
  function startEnemyCharge(enemy,target,stats,now,enraged,companion = null) {
    const spec=enemy.boss?.attacks.find(attack=>attack.style==='charge');
    if ((!spec&&!CHARGING_MONSTERS.includes(enemy.kind)) || !stats.speed || enemy.instanceId || enemy.slowUntil>now || now-(enemy.lastCharge??-Infinity)<CHARGE_ATTACK.cooldownMs) return false;
    const goal=companion||target.player,gap=distance(enemy,goal);
    if(gap<CHARGE_ATTACK.minRange||gap>CHARGE_ATTACK.maxRange)return false;
    const length=Math.min(CHARGE_ATTACK.maxDistance,gap+CHARGE_ATTACK.overshoot),from={x:enemy.x,z:enemy.z};
    const end={x:from.x+(goal.x-from.x)/gap*length,z:from.z+(goal.z-from.z)/gap*length};
    const radius=spec?.radius??CHARGE_ATTACK.radius;
    if(!chargeLaneAllowed(enemy,from,end,radius))return false;
    const chargeAt=now+Math.round((spec?.windupMs??CHARGE_ATTACK.windupMs)*(enraged?.7:1)),impactAt=chargeAt+Math.ceil(length/CHARGE_ATTACK.speed*1000);
    enemy.rotation=Math.atan2(end.x-from.x,end.z-from.z);
    enemy.attack={id:randomUUID(),style:'charge',name:spec?.name??`${stats.name} rush`,description:spec?.description??'Sidestep the marked lane. It is struck when the charge ends.',basic:false,
      startedAt:now,chargeAt,impactAt,endsAt:impactAt+CHARGE_ATTACK.recoveryMs,fromX:from.x,fromZ:from.z,...end,radius,rotation:enemy.rotation,targetId:target.player.id};
    enemy.attackApplied=false;enemy.attackTarget=target;enemy.attackTargetLife=target.lifeStartedAt;enemy.attackCompanion=companion;enemy.lastAttack=now;enemy.lastCharge=now;
    enemy.attackDamage=Math.round(stats.damage*(enemy.damageScale||1)*(enraged?1.25:1)*(enemy.berserk?4:1)*(spec?.damageScale??CHARGE_ATTACK.damageScale));return true;
  }
  function chargeLaneAllowed(enemy,from,end,radius) {
    if(!groundCanTraverse(from,end,WORLD_COLLIDERS,WORLD_BOUNDS,radius)||!groundCanTraverse(from,end,chargeSafeAreas,WORLD_BOUNDS,radius)
        || enemy.worldBoss&&[from,end].some(point=>Math.hypot(point.x-enemy.homeX,point.z-enemy.homeZ)+radius>enemy.boss.leashRadius))return false;
    // Check every terrain tile touched by the capsule, including its sides and rounded ends.
    for(let x=Math.floor((Math.min(from.x,end.x)-radius)/TERRAIN_STEP)*TERRAIN_STEP;x<=Math.max(from.x,end.x)+radius;x+=TERRAIN_STEP)
      for(let z=Math.floor((Math.min(from.z,end.z)-radius)/TERRAIN_STEP)*TERRAIN_STEP;z<=Math.max(from.z,end.z)+radius;z+=TERRAIN_STEP){
        const tile={x:x+TERRAIN_STEP/2,z:z+TERRAIN_STEP/2,r:TERRAIN_STEP,halfWidth:TERRAIN_STEP/2,halfDepth:TERRAIN_STEP/2};
        if(waterAt(tile.x,tile.z)&&!groundCanTraverse(from,end,[tile],WORLD_BOUNDS,radius))return false;
      }
    return true;
  }
  function resetWorldBoss(enemy, now) {
    const home=relocateOverworldSpawn({...enemy,x:enemy.homeX,z:enemy.homeZ});enemy.homeX=home.x;enemy.homeZ=home.z;
    enemy.x = enemy.homeX; enemy.z = enemy.homeZ; enemy.hp = enemy.maxHp; enemy.diedAt = 0;
    enemy.attack = null; enemy.attackApplied = false; enemy.participants.clear();
    enemy.encounterStartedAt = undefined; enemy.berserk = false;
    enemy.lastAttack = now; enemy.lastSpecialAttack = undefined; enemy.lastCharge = now; enemy.movedAt = now; enemy.lastEngagedAt = now; enemy.attackCount = 0; enemy.slowUntil = 0; enemy.stunUntil = 0;
    pendingHits = pendingHits.filter(hit => hit.enemy !== enemy);
    enemy.threat.clear(); enemy.target = null;
  }
  function enemyCombatCompanion(enemy, session, now) {
    if (enemy.instantCombat) return null;
    if (enemy.tauntedBy === session && enemy.tauntedUntil > now && enemy.tauntedLife === session.lifeStartedAt && enemy.tauntedTargetLife === combatTargetLife(enemy)) return null;
    const pet = activeCompanion(session, now);
    return pet?.saved.hp > 0 && pet.target === enemy && pet.targetLife === combatTargetLife(enemy)
      && pet.instanceId === enemy.instanceId && pet.playerLife === session.lifeStartedAt ? pet : null;
  }
  function selectEnemyTarget(enemy, alivePlayers, now) {
    if (enemy.dungeonCleared) { enemy.attack = null; enemy.target = null; enemy.threat.clear(); return null; }
    if (enemy.instantCombat) {
      const candidates = alivePlayers.filter(session => liveSession(session, now) && session.player.hp > 0
        && session.instanceId === enemy.instanceId && instantCombat.bySession(session)?.id === enemy.instanceId
        && !arenaMode(session) && !gmObserver(session) && !session.zeppelin && instantCombat.combatActive(enemy.instanceId));
      const taunted = enemy.instantCombatRole === 'boss' && enemy.tauntedUntil > now && candidates.includes(enemy.tauntedBy) && enemy.tauntedLife === enemy.tauntedBy.lifeStartedAt && enemy.tauntedTargetLife === combatTargetLife(enemy);
      const target = taunted ? enemy.tauntedBy : candidates.sort((a, b) => distance(a.player, enemy) - distance(b.player, enemy))[0] || null;
      if (target !== enemy.target) { enemy.path = []; enemy.nextPathAt = 0; }
      enemy.threat.clear(); enemy.target = target;
      return target;
    }
    const raidControlled = enemy.raidId && enemy.raidKind !== 'guardian';
    for (const [session] of enemy.threat) {
      const pet = enemyCombatCompanion(enemy, session, now);
      if (sessions.get(session.player.id) !== session || session.player.hp <= 0 || arenaMode(session) || gmObserver(session) || session.zeppelin || session.instanceId !== enemy.instanceId || session.instanceId && dungeonPreparing(session)
          || !raidControlled && distance(pet || session.player, enemy) > CHASE_DISTANCE + 1e-8 || !worldBossCombatAllowed(enemy,session.player) || !mapGuardianAllowed(enemy,session) || !enemy.instanceId && insideCity(session.player.x, session.player.z)) enemy.threat.delete(session);
    }
    let target = enemy.threat.has(enemy.target) ? enemy.target : null;
    for (const [session, threat] of enemy.threat) {
      if (!target || threat > enemy.threat.get(target)) target = session;
    }
    if (enemy.tauntedUntil > now && enemy.threat.has(enemy.tauntedBy) && enemy.tauntedLife === enemy.tauntedBy.lifeStartedAt && enemy.tauntedTargetLife === combatTargetLife(enemy)) target = enemy.tauntedBy;
    if (!target && !enemy.storyEncounterId) {
      // Rescue attackers pursue their traveler until players damage or taunt them.
      // Detection starts a fight; proximity never overrides an existing target.
      target = alivePlayers.filter(s => s.instanceId === enemy.instanceId && (raidControlled || distance(s.player, enemy) < enemyStats[enemy.kind].aggroRange)
        && !(s.instanceId && dungeonPreparing(s)) && (enemy.instanceId || !insideCity(s.player.x, s.player.z))
        && (!(enemy.roaming || enemy.worldBoss) || !villageSafe(s.player))
        && worldBossCombatAllowed(enemy,s.player) && mapGuardianAllowed(enemy,s)
        && (enemy.instanceId || !waterAt(s.player.x, s.player.z)))
        .sort((a, b) => distance(a.player, enemy) - distance(b.player, enemy))[0] || null;
      if (target) enemy.threat.set(target, 0);
    }
    if (!raidControlled && !target && enemy.target) {
      enemy.attack = null; enemy.lastSpecialAttack = undefined; enemy.slowUntil = 0; enemy.stunUntil = 0;
      pendingHits = pendingHits.filter(hit => hit.enemy !== enemy);
      if (enemy.worldBoss) resetWorldBoss(enemy, now);
    }
    enemy.target = target;
    if (target && enemy.worldBoss) enemy.encounterStartedAt ??= now;
    enemy.berserk = !!(enemy.worldBoss && enemy.encounterStartedAt !== undefined && now-enemy.encounterStartedAt >= WORLD_BOSS_BERSERK_MS);
    return target;
  }
  function resolveEnemyAttack(enemy, now) {
    const attack = enemy.attack;
    if (!attack || enemy.dungeonCleared) { enemy.attack = null; return; }
    if (!combatInstanceActive(enemy.instanceId, now)) { enemy.attack = null; return; }
    if (enemy.instantCombat && attack.basic && !attack.rangedAuto && selectEnemyTarget(enemy, activeSessions(), now) !== enemy.attackTarget) { enemy.attack = null; return; }
    const target = enemy.attackTarget, companion = enemy.attackCompanion, position = companion || target?.player;
    if (!enemy.attackApplied && (!target || sessions.get(attack.targetId) !== target || target.player.hp <= 0
        || arenaMode(target) || target.instanceId && dungeonPreparing(target) || target.instanceId !== enemy.instanceId || target.lifeStartedAt !== enemy.attackTargetLife
        || companion && enemyCombatCompanion(enemy, target, now) !== companion
        || !enemy.instantCombat && distance(position, enemy) > CHASE_DISTANCE || !mapGuardianAllowed(enemy,target) || !worldBossCombatAllowed(enemy,target.player) || !enemy.instanceId && insideCity(target.player.x, target.player.z))) { enemy.attack = null; return; }
    if (attack.basic && !attack.rangedAuto && target && target.player.hp>0 && sessions.get(attack.targetId)===target && (!companion || enemyCombatCompanion(enemy, target, now) === companion)) {
      moveEnemyToward(enemy,position,Math.min(now,attack.endsAt),monsterPursuitSpeed(enemy.kind)*(enemy.slowUntil>now?enemy.slowMultiplier:1),basicAttackRange(enemy.kind)-.35);
    } else if (attack.style==='charge' && !enemy.attackApplied && now>=attack.chargeAt) {
      if(!chargeLaneAllowed(enemy,{x:attack.fromX,z:attack.fromZ},attack,attack.radius)||!moveEnemyToward(enemy,attack,Math.min(now,attack.impactAt),CHARGE_ATTACK.speed,0,true,attack.chargeAt)
          || now>=attack.impactAt&&distance(enemy,attack)>.05){enemy.attack=null;return;}
    }
    if (!enemy.attackApplied && now >= attack.impactAt) {
      enemy.attackApplied = true;
      const area = !attack.basic && (enemy.worldBoss || attack.style === 'slam' || attack.style === 'pulse' || attack.style==='charge');
      for (const victim of area ? activeSessions() : [target]) {
        const p = victim.player;
        if (sessions.get(p.id) !== victim || victim.socket.readyState !== WebSocket.OPEN || victim.expiresAt && victim.expiresAt <= now
            || p.hp <= 0 || arenaMode(victim) || victim.instanceId && dungeonPreparing(victim) || gmObserver(victim) || victim.zeppelin || victim.instanceId !== enemy.instanceId || victim.lifeStartedAt > attack.startedAt) continue;
        const pet = activeCompanion(victim, attack.impactAt);
        for (const body of attack.basic ? [companion || p] : pet?.saved.hp > 0 ? [p, pet] : [p]) {
          const petHit = body !== p;
          const dx=attack.x-(attack.fromX??attack.x),dz=attack.z-(attack.fromZ??attack.z),along=Math.max(0,Math.min(1,((body.x-(attack.fromX??attack.x))*dx+(body.z-(attack.fromZ??attack.z))*dz)/(dx*dx+dz*dz||1)));
          const inChargeLane=Math.hypot(body.x-(attack.fromX??attack.x)-dx*along,body.z-(attack.fromZ??attack.z)-dz*along)<=attack.radius;
          if (p.hp <= 0 || petHit && (pet !== body || pet.saved.hp <= 0 || dungeons.has(victim.instanceId) && inDungeonPreparation(body, dungeons.get(victim.instanceId).kind))
              || (attack.basic ? attack.rangedAuto ? distance(body, attack) > attack.radius : distance(body, enemy) > basicAttackRange(enemy.kind) : attack.style==='charge' ? !inChargeLane
                : distance(body, attack) > attack.radius || distance(body, enemy) > enemyStats[enemy.kind].range + attack.radius)
              || !worldBossCombatAllowed(enemy,body) || !enemy.instanceId && (waterAt(body.x, body.z) || insideCity(body.x, body.z) || attack.style==='charge'&&villageSafe(body))
              || !petHit && !(attack.rangedAuto
                ? physicalReach(victim, attack, attack.radius) && physicalReach(victim, enemy, INSTANT_COMBAT_RANGED_AUTO[enemy.model].rangeM + attack.radius)
                : attack.style === 'charge'
                ? physicalReach(victim, { x:(attack.fromX??attack.x)+dx*along, z:(attack.fromZ??attack.z)+dz*along }, attack.radius)
                : physicalReach(victim, enemy, attack.basic ? basicAttackRange(enemy.kind) : enemyStats[enemy.kind].range + attack.radius))
              || !canTraverse(enemy, body, enemy.instanceId ? instanceColliders(enemy.instanceId) : WORLD_COLLIDERS, enemy.instanceId ? instanceBounds(enemy.instanceId) : WORLD_BOUNDS)) continue;
          const level = petHit ? pet.saved.level : p.level;
          const defense = petHit ? combatCompanionStats(level).defense : combatDefense(victim, attack.impactAt);
          const effectiveDefense = enemy.instantCombat ? Math.round(defense * (1 - (enemy.defenseBypass ?? 0))) : defense;
          const damage = Math.max(1, Math.round(enemy.attackDamage * monsterLevelScale(enemy.level, level)) - effectiveDefense);
          if (petHit) { damageCompanion(victim, damage, attack.impactAt); continue; }
          applyDamage(p, 'player', damage, victim.instanceId, attack.impactAt, enemy, false, false, false, attack.rangedAuto ? INSTANT_COMBAT_RANGED_AUTO[enemy.model]?.damageSchool : !attack.basic ? MONSTERS[enemy.kind].attackSchool : undefined);
          stand(victim);
          if (!p.hp) playerDied(victim, attack.impactAt);
          event(victim, 'damage', p.hp ? `${enemy.name} hit you for ${damage}.` : 'You have fallen. Return to the refuge to recover.'); dirty();
        }
      }
    }
    if (now >= attack.endsAt) enemy.attack = null;
  }
  function settleCombat(now) {
    // Resolve opposing attacks in timestamp order, including when a delayed tick
    // contains both an enemy impact and a later lethal player hit.
    const dueAttacks = [
      ...enemies.filter(enemy => (!enemy.instantCombatRole || enemy.attack?.rangedAuto) && (!enemy.raidId || enemy.raidKind === 'guardian') && enemy.alive && enemy.attack && !enemy.attackApplied && enemy.attack.impactAt <= now)
        .map(enemy => ({ at: enemy.attack.impactAt, enemy, attack: enemy.attack })),
      ...raids.impacts(now).map(at=>({at,raid:true})),
      ...instantCombat.impacts(now).map(at => ({ at, instant: true })),
      ...[...dungeons.values()].flatMap(dungeon => dungeon.hazards.filter(hazard => hazard.endsAt <= now).map(hazard => ({ at: hazard.endsAt }))),
    ].sort((a, b) => a.at - b.at);
    while (dueAttacks.length) {
      const { at, enemy, attack, raid, instant } = dueAttacks.shift();
      finishCasts(at);
      resolveHits(at);
      for (const session of sessions.values()) advanceKnightCharge(session, at);
      if (raid) raids.resolve(at);
      else if (instant) {
        instantCombat.resolve(at);
        // A resolved cast may schedule bleed, puddle or rescue checks. Include
        // those deadlines before later player hits in this same delayed tick.
        for (const nextAt of instantCombat.impacts(now)) if (nextAt > at && !dueAttacks.some(entry => entry.instant && entry.at === nextAt)) dueAttacks.push({ at: nextAt, instant: true });
        dueAttacks.sort((a, b) => a.at - b.at);
      }
      else if (!enemy) updateDungeonHazards(at, true);
      else if (enemy.alive && enemy.attack === attack && !(enemy.stunUntil > at)) resolveEnemyAttack(enemy, at);
    }
    finishCasts(now);
    resolveHits(now);
    updateDungeonHazards(now);
    raids.resolve(now);
    instantCombat.resolve(now);
    updateDungeonSpikeTraps(now);
    for (const session of sessions.values()) advanceKnightCharge(session, now);
    updateKnightCombat(now);
  }
  const interval = setInterval(() => {
    movementCredit.observe();
    const now = Date.now();
    // Notifications and write-time fences handle live changes; fallback polls must leave room for player writes.
    if (accountStoreReady && !closing && now - lastDeletionPoll >= 5000) { lastDeletionPoll = now; void runAccountDeletions(); }
    if (accountStoreReady && !closing && database && !goldRoundSettlement && now - goldRoundCheckedAt >= 5000)
      void settleMerchantRounds().catch(() => { if (!closing) console.error('Gold round settlement deferred; escrow and awards remain saved.'); });
    if (!closing && mobileReady && database && !mobileWork && now - lastMobilePoll >= 5000) {
      lastMobilePoll = now; mobileWork = pollMobileEvents().catch(() => { if (!closing) console.error('Mobile purchase reconciliation deferred; durable events will retry.'); }).finally(() => { mobileWork = null; });
    }
    const dt = Math.min(0.2, (now - previousTick) / 1000);
    movementFrameStart = now - dt * 1000;
    previousTick = now;
    if (database && !closing && !sharedRefresh && now - lastSharedRefresh >= 1000) {
      lastSharedRefresh = now;
      sharedRefresh = refreshRecords(true).then(async () => {
        if ([...sharedChanges.keys()].some(key => database.owns(key))) await save();
        for (const session of sessions.values()) if (auctionNearby(session)) sendAuction(session);
      }).catch(error => { if (!closing) console.error('Shared progress refresh failed:', error.message); })
        .finally(() => { sharedRefresh = null; });
    }
    if (database && accountStoreReady && !closing && !economyPoll && now - lastEconomyPoll >= 5000) {
      lastEconomyPoll = now;
      economyPoll = database.refreshEconomyState().then(policy => {
        if (policy.version !== economyVersion) throw Error('Gold economy version changed; restart required.');
        goldExchangeEnabled = policy.exchangeEnabled;
      }).catch(error => { goldExchangeEnabled = false; if (!closing) console.error('Gold economy refresh unavailable:', error.message); })
        .finally(() => { economyPoll = undefined; });
    }
    if (!closing && now - lastAuctionPoll >= 5000) {
      lastAuctionPoll = now;
      if (sessions.size && (collectiblesChain.configured || nftStatus.configured)) void refreshNftStatus();
      if (collectiblesChain.configured || nftStatus.configured) for (const session of sessions.values()) { void refreshNftOwnership(session); if (deedAuctionNearby(session)) void refreshNftAuction(session); }
      for (const owner of auctionOwners()) {
        for (const listing of owner.player.auctions) if (listing.reservation) void settleAuction(listing.id);
        for (const order of owner.player.storeOrders) if (!['delivered', 'expired'].includes(order.status)) void settleStore(owner, order.id).catch(() => {});
        for (const order of owner.player.nftOrders) if (order.status === 'quoted') void settleNft(owner, order.id).catch(() => {});
        for (const order of owner.player.specialistNftOrders || []) if (order.status === 'quoted') void specialists.settle(owner, order.id).catch(() => {});
      }
    }
    for (const connection of accountConnections.values()) {
      if (database?.isDeleting(connection.recordKey)) { disconnectDeletingAccount(connection); continue; }
      if (connection.account?.ban && connection.socket.readyState === WebSocket.OPEN) { moderationDisconnect(connection, 'ban', connection.account.ban.reason); continue; }
      if (connection.expiresAt && connection.expiresAt <= now) {
        leaveSession(connection);
        connection.socket.close(4401, 'Session expired');
      } else if (!closing && !connection.retiring && !connection.refreshing && connection.socket.readyState === WebSocket.OPEN
          && connection.expiresAt && connection.expiresAt - now <= 60000 && now - (connection.lastRefreshRequest ?? 0) >= 15000) {
        // Background tabs throttle browser timers; request renewal through the live socket.
        connection.lastRefreshRequest = now;
        send(connection.socket, { type: 'sessionRefresh' });
      }
    }
    updateArena(now);
    for (const session of sessions.values()) if (session.duel?.mode === 'duel' && !duelValid(session, now)) endDuel(session, 'Duel ended because an adventurer left the fight.');
    settleCombat(now);
    updateCombatCompanions(now, dt);
    startAutoAttacks(now);
    const alivePlayers = activeSessions().filter(s => s.player.hp > 0 && !arenaMode(s) && !gmObserver(s) && !s.zeppelin && !(s.instanceId && dungeonPreparing(s)));
    updateTreasureSpawns(now, alivePlayers);
    updateMapGuardians(now);
    for (const enemy of enemies) {
      if (enemy.kind === 'training-dummy') {
        if (now - (enemy.lastHitAt ?? -Infinity) >= TRAINING_DUMMY_RESET_MS) enemy.hp = enemy.maxHp;
        continue;
      }
      if (!enemy.alive) {
        if (!enemy.instanceId && now >= enemy.respawnAt) {
          if (!STORY_ENEMIES.some(spawn => spawn.id === enemy.id)) { const home=relocateOverworldSpawn({...enemy,x:enemy.homeX,z:enemy.homeZ});enemy.homeX=home.x;enemy.homeZ=home.z; }
          enemy.alive = true; enemy.diedAt = 0; enemy.hp = enemy.maxHp; enemy.x = enemy.homeX; enemy.z = enemy.homeZ; enemy.slowUntil = 0; enemy.stunUntil = 0; enemy.attack = null;
          enemy.participants?.clear(); enemy.attackCount = 0; enemy.lastAttack = now; enemy.lastSpecialAttack = undefined; enemy.lastCharge = now; enemy.movedAt = now;
          enemy.encounterStartedAt = undefined; enemy.berserk = false;
          enemy.threat.clear(); enemy.target = null;
          if (enemy.worldBoss) void mobilePush.worldEvent({ id: `world-boss:${enemy.id}:${enemy.respawnAt}`, title: `${enemy.name} has returned`, body: 'A world boss is back in Mossvale. Gather your allies.', expiresAt: now + 5 * 60_000 }).catch(pushError);
        }
        continue;
      }
      const rangedAuto = enemy.instantCombat && INSTANT_COMBAT_RANGED_AUTO[enemy.model];
      if (enemy.instantCombatRole && !(rangedAuto && enemy.instantCombatRole === 'boss') || enemy.raidId && enemy.raidKind !== 'guardian') continue;
      if (enemy.treasure) { updateTreasureGoblin(enemy, alivePlayers, now); continue; }
      const target = selectEnemyTarget(enemy, alivePlayers, now);
      if (enemy.storyEncounterId && !target) { enemy.attack = null; continue; }
      if (rangedAuto && (enemy.instantCombatRole === 'boss' && instantCombat.byInstance(enemy.instanceId)?.mechanicEndsAt || enemy.attack && !enemy.attack.rangedAuto)) continue;
      if (enemy.stunUntil > now) { enemy.attack = null; continue; }
      resolveEnemyAttack(enemy, now);
      if (enemy.attack || enemy.dungeonCastUntil > now) continue;
      const stats = monsterStatsAtLevel(enemy.kind,enemy.level);
      if (rangedAuto) {
        if (!target) continue;
        // The source auto clip launches at 500ms; the fixed destination lets the
        // target dodge sideways during the 40m/s flight.
        moveEnemyToward(enemy, target.player, now, monsterPursuitSpeed(enemy.kind), rangedAuto.rangeM - .35, true);
        if (distance(enemy, target.player) <= rangedAuto.rangeM && now - enemy.lastAttack >= basicAttackCooldown(enemy.kind) / INSTANT_COMBAT.attackRateMultiplier
            && canTraverse(enemy, target.player, instanceColliders(enemy.instanceId), instanceBounds(enemy.instanceId))) {
          const launchAt = now + rangedAuto.launchMs, impactAt = launchAt + distance(enemy, target.player) / rangedAuto.projectileSpeedMps * 1000;
          enemy.rotation = Math.atan2(target.player.x - enemy.x, target.player.z - enemy.z); enemy.lastAttack = now;
          enemy.attack = { id: randomUUID(), name: rangedAuto.name, style: 'spit', basic: true, rangedAuto: true, launchAt,
            startedAt: now, impactAt, endsAt: Math.max(now + 1000, impactAt + 140), x: target.player.x, z: target.player.z, radius: .65, rotation: enemy.rotation, targetId: target.player.id };
          enemy.attackApplied = false; enemy.attackTarget = target; enemy.attackTargetLife = target.lifeStartedAt; enemy.attackCompanion = null;
          enemy.attackDamage = Math.round(stats.damage * (enemy.damageScale || 1) * BASIC_ATTACK.damageScale);
        }
        continue;
      }
      if (enemy.worldBoss) {
        if (target) enemy.lastEngagedAt = now;
        if (!target && enemy.hp < enemy.maxHp && now - (enemy.lastEngagedAt || 0) > 8000) { resetWorldBoss(enemy, now); continue; }
      }
      let patrol = { x: enemy.homeX, z: enemy.homeZ };
      if (enemy.roaming) {
        const turn = Math.floor(now / 8000);
        if (enemy.patrolTurn !== turn) {
          enemy.patrolTurn = turn;
          const seed = [...enemy.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 0);
          const angle = ((turn + seed) % 8) * Math.PI / 4, radius = 3 + seed % 5;
          const candidate = { x: enemy.homeX + Math.cos(angle) * radius, z: enemy.homeZ + Math.sin(angle) * radius };
          enemy.patrolGoal = !waterAt(candidate.x, candidate.z) && !villageSafe(candidate) && groundCanTraverse(patrol, candidate, WORLD_COLLIDERS, WORLD_BOUNDS) ? candidate : patrol;
        }
        patrol = enemy.patrolGoal;
      }
      const companion = target && enemyCombatCompanion(enemy, target, now), goal = companion || target?.player || patrol;
      const enraged = enemy.worldBoss && enemy.hp <= enemy.maxHp / 2;
      const attackRate = enemy.instantCombat ? INSTANT_COMBAT.attackRateMultiplier : 1;
      const specialReady = enemy.lastSpecialAttack === undefined ? target && distance(enemy,goal)>basicAttackRange(enemy.kind)
        : enemy.lastAttack>Math.max(enemy.lastSpecialAttack,enemy.lastCharge??-Infinity) && now - enemy.lastSpecialAttack >= stats.cooldownMs * 3 * (enraged ? .8 : 1) / attackRate;
      const stoppingRange = specialReady ? stats.range : basicAttackRange(enemy.kind);
      moveEnemyToward(enemy,goal,now,(target?monsterPursuitSpeed(enemy.kind):1.8)*(enemy.slowUntil>now?enemy.slowMultiplier:1),target?stoppingRange-.35:.1,!!target);
      if(target&&now-enemy.lastAttack>=basicAttackCooldown(enemy.kind)/attackRate&&startEnemyCharge(enemy,target,stats,now,enraged,companion))continue;
      const inMelee = target && distance(enemy, goal) <= basicAttackRange(enemy.kind);
      const basic = inMelee && !specialReady;
      if (target && (basic || specialReady && distance(enemy, goal) <= stats.range)
          && now - enemy.lastAttack >= basicAttackCooldown(enemy.kind) / attackRate
          && canTraverse(enemy, goal, enemy.instanceId ? instanceColliders(enemy.instanceId) : WORLD_COLLIDERS, enemy.instanceId ? instanceBounds(enemy.instanceId) : WORLD_BOUNDS)) {
        enemy.lastAttack = now;
        if (!basic || enemy.lastSpecialAttack === undefined) enemy.lastSpecialAttack = now;
        const specials = enemy.boss?.attacks.filter(attack=>attack.style!=='charge');
        const special = !basic && specials?.[(enemy.attackCount || 0) % specials.length];
        const style = special ? special.style : stats.attackStyle;
        if (!basic) enemy.attackCount = (enemy.attackCount || 0) + 1;
        enemy.rotation = Math.atan2(goal.x - enemy.x, goal.z - enemy.z);
        const impactAt = now + (basic ? BASIC_ATTACK.impactMs : Math.round((special ? special.windupMs : stats.windupMs) * (enraged ? .7 : 1)));
        const center = special && special.center === 'self' ? enemy : goal;
        enemy.attack = { id: randomUUID(), style, ...(special ? {name:special.name,description:special.description} : {}), basic: !!basic, startedAt: now, impactAt, endsAt: impactAt + (basic ? BASIC_ATTACK.recoveryMs : stats.recoveryMs), x: center.x, z: center.z,
          rotation: enemy.rotation, radius: basic ? basicAttackRange(enemy.kind) : special ? special.radius : stats.attackRadius, targetId: target.player.id };
        enemy.attackApplied = false; enemy.attackTarget = target; enemy.attackTargetLife = target.lifeStartedAt; enemy.attackCompanion = companion;
        enemy.attackDamage = Math.round(stats.damage * (enemy.damageScale || 1) * (enraged ? 1.25 : 1) * (enemy.berserk ? 4 : 1) * (basic ? BASIC_ATTACK.damageScale : special ? special.damageScale : 1));
      }
    }
    instantCombat.tick(now);
    raids.tick(now);
    storyEncounters.tick(now);
    advanceDungeons(now);
    if (pendingDungeonRecords.size && now - lastDungeonRecordAttempt >= 5000)
      void flushDungeonRecords().catch(error => console.error('Dungeon leaderboard save failed; will retry:', error.message));
    for (const session of sessions.values()) {
      advanceJump(session, now); recoverTravel(session, now); finishGathering(session, now); recoverSpirit(session, now);
      autoLootWithPet(session, now);
      if (session.emote && (session.emote.endsAt !== null && session.emote.endsAt <= now || !canEmote(session))) session.emote = null;
    }
    let resourcesChanged = false;
    for (const node of nodes) if (!node.available && now >= node.respawnAt) { node.available = true; delete depletedResources[`depleted:${node.id}`]; resourcesChanged = true; }
    if (resourcesChanged) updateCollisionSceneState(overworldCollisionKey, depletedResources);
    for (const key of runtimeCollisionScenes) if (key !== overworldCollisionKey && !dungeons.has(key.slice(key.indexOf(':') + 1))) { disposeCollisionScene(key); runtimeCollisionScenes.delete(key); }
    for (const [id, drop] of lootDrops) if (drop.expiresAt <= now) removeLootDrop(id, 'expired');
    for (const [id, invite] of duelInvitations) if (invite.expiresAt <= now || !sessions.has(invite.targetId) || !sessions.has(invite.inviterId)) duelInvitations.delete(id);
    for (const session of sessions.values()) if (session.duelResult?.expiresAt <= now) session.duelResult = null;
    for (const [id, invite] of invitations) if (invite.expiresAt <= now || !sessions.has(invite.targetId) || !sessions.has(invite.inviterId)) invitations.delete(id);
    for (const [id, summon] of dungeonSummons) if (summon.expiresAt <= now || !liveSession(summon.from, now) || !liveSession(summon.target, now)) dungeonSummons.delete(id);
    for (const trade of trades.values()) checkTrade(trade, now);
    passengers.sync();
    const pendingPurchases = sessions.size ? pendingAuctionPurchases() : null;
    for (const session of sessions.values()) send(session.socket, snapshot(session, pendingPurchases));
    if (sessions.size && now - lastFriendsRefresh >= 1000) {
      lastFriendsRefresh = now;
      const characters = savedCharacters();
      for (const session of sessions.values()) sendFriends(session, {}, characters, true);
    }
  }, 100);

  function closeHttp() {
    if (!closeHttpTask) closeHttpTask = new Promise(resolveClose => {
      const deadline = setTimeout(() => server.closeAllConnections(), 2000);
      server.close(() => { clearTimeout(deadline); resolveClose(); });
    });
    return closeHttpTask;
  }

  const game = {
    server,
    async start() {
      try { await loadCollisionAssets(); } catch (error) { clearInterval(interval); closing = true; throw error; }
      cloneCollisionScene('overworld', overworldCollisionKey);
      await Promise.all([refreshAuctionStatus(), refreshNftStatus()]);
      if (database) {
        try {
          const rows = await database.start();
          const policy = database.economyState();
          if (policy.maintenance) throw Error('Gold economy maintenance is in progress.');
          economyVersion = policy.version; goldExchangeEnabled = policy.exchangeEnabled;
          const loaded = migrateRecords(Object.fromEntries(rows.map(row => [row.account_key, row.state])));
          validateRecords(loaded);
          records = loaded; mobileReady = true;
          await gasSponsor.start();
        } catch (error) {
          clearInterval(interval);
          closing = true;
          await gasSponsor.close(); await database.close();
          throw error;
        }
      }
      await mobilePush.start().catch(pushError);
      await new Promise((resolveStart, rejectStart) => { server.once('error', rejectStart); server.listen(port, host, () => { server.off('error', rejectStart); resolveStart(); }); });
      accountStoreReady = true;
      await statistics.start();
      return server.address().port;
    },
    warnForShutdown() {
      if (closing || shutdownTask) return deploymentWarning();
      shutdownNotice = { id: randomUUID(), startedAt: Date.now(), held: true };
      shutdownAt = performance.now() + 300000;
      watchShutdownWarning();
      return deploymentWarning();
    },
    cancelShutdownWarning() {
      if (closing || shutdownTask || !shutdownNotice?.held) return false;
      shutdownAbort?.abort();
      shutdownNotice = null; shutdownAt = 0;
      for (const connection of accountConnections.values()) sendShutdownWarning(connection);
      return true;
    },
    scheduleShutdown({ keepHttpOpen = false } = {}) {
      if (closing) return this.stop({ keepHttpOpen });
      if (shutdownTask) return shutdownTask;
      if (!shutdownNotice) {
        shutdownNotice = { id: randomUUID(), startedAt: Date.now(), held: false };
        shutdownAt = performance.now() + 300000;
      } else shutdownNotice.held = false;
      const countdown = watchShutdownWarning();
      shutdownTask = (async () => {
        await countdown;
        if (keepHttpOpen) deployment.draining();
        await this.stop({ keepHttpOpen });
      })();
      return shutdownTask;
    },
    stop({ keepHttpOpen = false } = {}) {
      if (stopping) {
        if (!keepHttpOpen && httpKeptOpen) { httpKeptOpen = false; stopping = stopping.finally(closeHttp); }
        return stopping;
      }
      if (closing) {
        const stopped = persistenceFailed ? Promise.reject(Error('Progress storage failed.')) : Promise.resolve();
        return keepHttpOpen ? stopped : stopped.finally(closeHttp);
      }
      closing = true;
      httpKeptOpen = keepHttpOpen;
      shutdownAbort?.abort();
      walletBroker.close(); nativeWallet.close();
      clearInterval(interval);
      clearTimeout(saveTimer);
      pendingHits.length = 0;
      instantCombat.stop();
      for (const connection of connections.values()) {
        if (connection.expiresAt && connection.expiresAt <= Date.now()) { leaveSession(connection); connection.socket.close(4401, 'Session expired'); }
        else if (connection.account?.ban) moderationDisconnect(connection, 'ban', connection.account.ban.reason);
        else retireConnection(connection, !connection.joined);
      }
      stopping = (async () => {
        try {
          // All admitted writes are already in this queue. Unexposed async
          // auction signing and pending JWT joins have their own closing guard.
          await deletionTask;
          await mobileWork;
          await goldRoundSettlement?.catch(() => {});
          await Promise.allSettled([...releasingAccounts.values()]);
          await Promise.all([...arenaWagerWork.values()]);
          await raids.flush();
          await save();
          await flushDungeonRecords();
          if (persistenceFailed) throw Error('Progress storage failed.');
        } finally {
          for (const connection of connections.values()) {
            if (connection.socket.readyState !== WebSocket.OPEN) continue;
            if (connection.expiresAt && connection.expiresAt <= Date.now()) { connection.socket.close(4401, 'Session expired'); continue; }
            if (connection.account?.ban) { moderationDisconnect(connection, 'ban', connection.account.ban.reason); continue; }
            if (connection.joined && accountConnections.get(connection.recordKey) === connection) sendRoster(connection);
            retireConnection(connection, true);
          }
          // Bound only the socket handshake, never the durable save. A peer
          // that ignores the close frame cannot keep the old process alive.
          const deadline = setTimeout(() => {
            for (const socket of connections.keys()) socket.terminate();
            if (!keepHttpOpen) server.closeAllConnections();
          }, 2000);
          try {
            await Promise.all([new Promise(resolveClose => wss.close(resolveClose)), ...(keepHttpOpen ? [] : [closeHttp()])]);
          } finally { clearTimeout(deadline); for (const key of runtimeCollisionScenes) disposeCollisionScene(key); await gasSponsor.close(); await mobilePush.close().catch(pushError); await Promise.all([statistics.stop().catch(() => {}), database?.close()]); }
        }
      })();
      return stopping;
    },
  };
  return game;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const game = createGameServer();
  const port = await game.start();
  console.log(`Mossvale world listening on http://localhost:${port}`);
  // Start this before the host begins terminating the container: its grace
  // period may be shorter than the five-minute player warning.
  process.on('SIGUSR1', () => { game.warnForShutdown(); });
  process.on('SIGHUP', () => { game.cancelShutdownWarning(); });
  process.on('SIGUSR2', async () => { await game.scheduleShutdown(); process.exit(0); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await game.stop(); process.exit(0); });
}
