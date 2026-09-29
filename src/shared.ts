import type { StoryQuestState, StoryQuestDialogue } from './story-quests';
export interface StoryEncounterState { id: string; objectId: string; x: number; z: number; hp: number; phase: 'moving' | 'fighting'; wave: number; waves: number }
import type { InputActivitySample } from './input-activity';
import type { ReferralState } from './referrals';
import type { TreasureClaim, TreasureState } from './treasure-rewards';
import type { GoldMerchantState } from './gold-merchant';
import type { TreasureMapProgress } from './treasure-maps';
import type { PlayerReport } from './community';
import type { StoreOrder, MobileStoreOrder, StoreState, StoreBoostId, StoreGrant } from './ingame-store';
import type { NftOrder, NftState, NftAuctionTransaction, NftMigration } from './nfts';
import type { DungeonId } from './dungeon';
import type { DungeonBossModel } from './dungeon-boss-models';
import type { RAID_APPROACH_MODEL_KINDS } from './raid-approach-models';
import type { ZoneId, EnemyKind, NodeKind, QuestState, Ending } from './content';
import type { SkillId } from './skills';
import type { Equipment, EquipmentSlot } from './progression';
import type { ContractState } from './adventure';
import type { AbilityId, HotbarSlot, CombatTalents } from './spells';
import type { OwnedBag, EquippedBags, BagKind } from './bags';
import type { EnemyAttackStyle } from './bestiary';
import type { Race, Gender, Face, HairStyle } from './appearance';
import type { MountId, TravelState } from './travel';
import type { JumpState } from './jumping';
import type { ZeppelinFlight } from './zeppelin';
import type { AuctionAsset, AuctionItem, AuctionCurrency, AuctionListing, AuctionSale, AuctionState, AuctionOrder, AuctionPendingPurchase } from './auction';
import type { ArenaWager, ArenaWagersState } from './arena-wager';
import type { LootEntry } from './loot-items';
import type { OnboardingState } from './onboarding';
import type { BankState, BankItem, BankView } from './bank';
import type { PollAnswer, PollBoothView } from './polls';
import type { AchievementState } from './achievements';
import type { PetId, PetLootQuality } from './pets';
import type { EmoteId, EmoteState } from './emotes';
import type { RealmId, HostingRealm } from './hosting-realms';
export type { RealmId, HostingRealm } from './hosting-realms';
export type { Race, Gender, Face, HairStyle } from './appearance';
export type { AbilityId, HotbarSlot } from './spells';
export type { ZoneId, EnemyKind, NodeKind, QuestState, Ending } from './content';
export type { SkillId } from './skills';
export type { Equipment, EquipmentSlot } from './progression';

export const CHARACTER_CLASSES = ['Ranger', 'Knight', 'Mage', 'Cleric'] as const;
export type CharacterClass = typeof CHARACTER_CLASSES[number];
export type PlayerRole = 'player' | 'gm';
export type GMItem = AuctionItem | { kind: 'bag'; id: BagKind; quantity: 1 } | { kind: 'mount'; id: MountId; quantity: 1 };
export type GMAction = 'ban' | 'kick' | 'kill' | 'levelUp' | 'giveGold' | 'spawnItem' | 'spawnTreasureGoblin' | 'startInstantCombat' | 'teleportTo' | 'bring' | 'return' | 'setInvisible' | 'setTagHidden' | 'setFlying' | 'startLootTrace' | 'stopLootTrace' | 'getLootTrace';
export interface GMPlayer { id: string; name: string; level: number; className: CharacterClass; role?: PlayerRole; canReturn?: boolean; online?: boolean; lootTrace?: { active: boolean; startedAt: number; expiresAt: number; eventCount: number; stoppedReason: string | null } }
export interface LootTraceReport {
  version: 1;
  realmId: string;
  player: { id: string; name: string; level: number; className: string };
  startedAt: number;
  expiresAt: number;
  stoppedAt: number | null;
  stoppedReason: string | null;
  events: Array<{ at: number; type: string; [key: string]: unknown }>;
}
export type NpcService = 'trade' | 'contracts' | 'heal' | 'potion';
export const NPC_SERVICE_COSTS = { heal: 5, potion: 8 } as const;
export const WORLD_INTEREST_RADIUS = 200;
export const TRADE_RANGE = 8;
export const DEATH_ANIMATION_MS = 1400;

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  hairHighlight?: string;
  armorColors?: Partial<Record<import('./appearance').ArmorColorSlot, string>>;
  outfit: string;
  accent: string;
  className: CharacterClass;
  race?: Race;
  gender?: Gender;
  face?: Face;
}

export interface Player {
  /** Realm economic rules; authoritative snapshot metadata, never client input. */
  economyVersion?: number;
  dreamRestReadyAt?: number;
  emote?: EmoteState | null;
  id: string;
  name: string;
  /** Selected catalog ID; cosmetic and separate from the character name. */
  title?: string | null;
  /** Account entitlement projected by the realm; never accepted from character input. */
  betaTester?: boolean;
  /** Supplied by the authenticated realm session; never grants permission by itself. */
  role?: PlayerRole;
  /** Session state supplied only to the owning game master. */
  gm?: { invisible: boolean; tagHidden: boolean; flying: boolean; canReturn: boolean };
  appearance: Appearance;
  zone: ZoneId;
  coordinateVersion: 2;
  /** Trusted last supported position; transient climbing and jump velocity are never persisted. */
  standingPosition?: { x: number; y: number; z: number };
  instanceId: string | null;
  x: number;
  z: number;
  rotation: number;
  hp: number;
  diedAt?: number;
  maxHp: number;
  level: number;
  xp: number;
  gold: number;
  auctions?: AuctionListing[];
  pendingAuctionPurchases?: AuctionPendingPurchase[];
  /** Private character item protection; keys match bag item IDs. */
  lockedItems?: string[];
  auctionSales?: AuctionSale[];
  auctionWallet?: string | null;
  treasureClaims?: TreasureClaim[];
  treasureMap?: TreasureMapProgress | null;
  storeOrders?: StoreOrder[];
  nftOrders?: NftOrder[];
  mobileStoreOrders?: MobileStoreOrder[];
  storeGrants?: StoreGrant[];
  storePurchases?: string[];
  storeConsumables?: Partial<Record<StoreBoostId, number>>;
  storeBoosts?: Partial<Record<StoreBoostId, number>>;
  bank?: BankState;
  characterCreated: boolean;
  achievements?: AchievementState;
  onboarding?: OnboardingState;
  raidProgress?: import('./raid-progression').RaidProgress;
  specialistNftOrders?: import('./specialist-nft').SpecialistNftOrder[];
  rootvaultUnlocked?: boolean;
  talents: string[];
  talentVersion?: number;
  combatTalents?: CombatTalents;
  chilledUntil?: number;
  damageOverTime?: { ability: AbilityId; sourceId: string; expiresAt: number }[];
  ownedGear: string[];
  equipment: Equipment;
  ownedBags?: OwnedBag[];
  equippedBags?: EquippedBags;
  hotbar: HotbarSlot[];
  hotbar2?: HotbarSlot[];
  hotbarExtra?: HotbarSlot[];
  hotbar2Extra?: HotbarSlot[];
  learnedSpells: AbilityId[];
  ridingRank: 0 | 1 | 2;
  ownedMounts: MountId[];
  ownedPets: PetId[];
  /** Tamed gameplay companion; separate from cosmetic pets and NFT ownership. */
  tamedCompanion?: import('./combat-companions.ts').TamedCompanion | null;
  combatCompanion?: import('./combat-companions.ts').CombatCompanion | null;
  combatCompanionRecallAt?: number;
  /** Current wallet ownership verified by the realm; never persisted as a character unlock. */
  nftPets?: PetId[];
  nftMounts?: MountId[];
  nftMountsConfigured?: boolean;
  nftMintableMounts?: MountId[];
  nftHouses?: string[];
  nftConfigured?: boolean;
  nftMintablePets?: PetId[];
  summonedPet: PetId | null;
  /** Current collection-pet position supplied by the realm; never saved as ownership. */
  petPosition?: { x: number; z: number } | null;
  petLootMinQuality: PetLootQuality;
  abilityCooldowns: Partial<Record<AbilityId, number>>;
  globalCooldownUntil?: number;
  shield?: { amount: number; endsAt: number } | null;
  inventory: { wood: number; crystal: number; potion: number; herb: number; relic: number };
  carriedItems?: Partial<Record<string, number>>;
  itemUseReadyAt?: number;
  heatproofUntil?: number;
  craftingXp: number;
  contracts: ContractState;
  storyQuests?: StoryQuestState;
  meadGodPaid?: boolean;
  skills: Record<SkillId, number>;
  gathering: { nodeId: string; skill: SkillId; startedAt: number; endsAt: number } | null;
  casting?: ({ startedAt: number; endsAt: number; rotation: number; targetId: string; channel?: boolean } & ({ ability: AbilityId } | { ability: 'mount'; mount: MountId })) | null;
  autoAttack?: { targetId: string; nextAttackAt: number } | null;
  /** Open world PvP flag, independent of ordinary duels and instanced arena matches. */
  pvp?: boolean;
  /** Persisted per-bracket progress, awarded only by the realm. */
  arenaRatings?: ArenaRatings;
  arenaWagers?: ArenaWager[];
  arenaMatchId?: string | null;
  arenaPhase?: 'countdown' | 'active' | null;
  arenaTeam?: 0 | 1 | null;
  arenaEliminated?: boolean;
  duelOpponentId?: string | null;
  duelStatus?: { slowUntil: number; slowMultiplier: number; stunUntil: number } | null;
  seated?: { chairId: string; x: number; z: number; y: number; rotation: number } | null;
  travel?: TravelState;
  jump?: JumpState;
  zeppelin?: ZeppelinFlight | null;
  zeppelinPorts?: ZoneId[];
  quest: QuestState;
}

export interface EnemyAttack {
  rangedAuto?: boolean; launchAt?: number;
  dungeonHazard?: boolean;
  fromX?: number; fromZ?: number; chargeAt?: number;
  id: string; style: EnemyAttackStyle; name?: string; description?: string; basic?: boolean; startedAt: number; impactAt: number; endsAt: number;
  x: number; z: number; rotation: number; radius: number; targetId: string;
}
export interface Enemy {
  instantCombatRole?: 'boss' | 'anchor';
  instantCombatShielded?: boolean;
  raidVisual?: 'apostle'|'apostle-real'|'clone'|'crystal'|'shield'|'guardian'|'approach'|'morgrath';
  raidShielded?: boolean;
  model?: typeof import('./instant-combat').INSTANT_COMBAT_MODEL_KINDS[number] | DungeonBossModel | 'horned-apostle' | 'apostle-clone' | 'apostle-incarnate' | typeof RAID_APPROACH_MODEL_KINDS[number];
  chilledUntil?: number;
  damageOverTime?: { ability: AbilityId; sourceId: string; expiresAt: number }[];
  treasure?: { spawnedAt: number; escapeAt?: number; portalAt?: number };
  id: string;
  level: number;
  targetId?: string | null;
  zone: ZoneId;
  instanceId: string | null;
  kind: EnemyKind;
  name: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  diedAt?: number;
  rotation: number;
  attack: EnemyAttack | null;
  worldBoss: boolean;
  dungeonBoss?: boolean;
  berserk?: boolean;
}

export interface ResourceNode {
  waterX?: number; waterZ?: number;
  id: string;
  zone: ZoneId;
  instanceId: string | null;
  kind: NodeKind;
  x: number;
  z: number;
  available: boolean;
  respawnAt: number;
}

export interface LootDrop {
  instantCombatRound?: number;
  model?: typeof import('./instant-combat').INSTANT_COMBAT_MODEL_KINDS[number] | DungeonBossModel | 'horned-apostle' | 'apostle-clone' | 'apostle-incarnate';
  id: string;
  enemyId: string;
  sourceObjectId?: string;
  ownerId: string;
  zone: ZoneId;
  instanceId: string | null;
  kind: EnemyKind;
  name: string;
  x: number;
  z: number;
  diedAt?: number;
  rotation?: number;
  gold: number;
  relic: number;
  items?: LootEntry[];
  expiresAt: number;
}

export interface PartyState {
  id: string;
  leaderId: string;
  members: { id: string; name: string; className: CharacterClass; level: number; hp: number; maxHp: number; zone: ZoneId; instanceId: string | null }[];
}
export interface PartyInvite { id: string; inviterId: string; inviterName: string; expiresAt: number }
export interface DuelState { id: string; opponentId: string; opponentName: string }
export type ArenaSize = 1 | 2 | 3;
export interface ArenaRating { rating: number; wins: number; losses: number; draws: number }
export type ArenaRatings = Record<ArenaSize, ArenaRating>;
export interface ArenaQueueState { joinedAt: number; size: ArenaSize; rating: number }
export interface ArenaInvite extends PartyInvite {
  size: ArenaSize;
  wagerMoss?: string; wagerMatchId?: string; funding?: boolean;
  rated?: boolean;
  queued?: boolean;
  acceptReason?: string;
  members: { id: string; name: string; team: 0 | 1; accepted: boolean }[];
}
export interface ArenaState {
  id: string; instanceId: string; opponentId: string; opponentName: string;
  size: ArenaSize; phase: 'countdown' | 'active' | 'finished'; startsAt: number; endsAt: number;
  rated?: boolean; ratingChange?: number;
  wagerMoss?: string; wagerMatchId?: string; settling?: boolean;
  members: { id: string; name: string; team: 0 | 1; hp: number; maxHp: number; eliminated: boolean }[];
  winnerTeam?: 0 | 1 | null; reason?: string;
}
export interface TradeOffer { gold: number; items: Partial<Player['inventory']>; gear: string[] }
export interface TradeState {
  id: string; status: 'invited' | 'open'; inviterId: string; expiresAt: number; revision: number;
  participants: { id: string; name: string; offer: TradeOffer; accepted: boolean }[];
}
export interface DungeonObjectState { id: string; kind: 'seal' | 'chest' | 'checkpoint'; label: string; x: number; z: number; r: number; available: boolean; activated: boolean; opened?: boolean }
export interface DungeonHazard { id: string; sourceId?: string; leap?: boolean; x: number; z: number; r: number; innerR?: number; kind?: import('./dungeon-mechanics.ts').DungeonHazardKind; label?: string; startedAt: number; endsAt: number; damage: number }
export interface DungeonSummon { id: string; fromName: string; dungeonId: DungeonId; dungeonName: string; expiresAt: number }
export interface DungeonRecord {
  id: string; dungeonId: DungeonId; partySize: number; durationMs: number; kills: number; wipes: number; completedAt: number; realmId: RealmId;
  members: { id: string; name: string; className: string; level: number }[];
}
export interface DungeonResult {
  durationMs: number; kills: number; wipes: number; partySize: number; ranked: boolean; unrankedReason?: string;
  xp: number; lootId: string; items: import('./loot-items').LootEntry[]; remainingItemIds?: string[]; claimed: boolean;
}
export interface DungeonState {
  dream?: { kind: 'pleasant' | 'nightmare'; endsAt: number };
  startedAt?: number; elapsedMs?: number; kills?: number; totalKills?: number; result?: DungeonResult;
  id: string; kind: DungeonId; name: string; room: number; rooms: number; completed: boolean; wipes: number;
  encounterName: string; objectives: string[]; clearedStages: string[]; objects: DungeonObjectState[];
  hazards: DungeonHazard[]; checkpoint: { x: number; z: number; active: boolean };
}

export interface FriendEntry { id: string; name: string; className: string; level: number; online: boolean; zone: ZoneId | null }
export interface IgnoreEntry { id: string; name: string }

export type ClientMessage =
  | { type: 'instantCombatRegister' | 'instantCombatUnregister' | 'instantCombatLeave' }
  | import('./raid').RaidMessage
  | import('./raid-progression').RaidProgressionMessage
  | import('./specialist-nft').SpecialistNftMessage
  | { type: 'translateChat'; messageId: string; targetLanguage: string }
  | { type: 'ping'; id: number }
  | { type: 'inputActivity'; sample: InputActivitySample }
  | { type: 'clientCheck'; nonce: string; webdriver: boolean }
  | { type: 'dungeonLeaderboard'; dungeonId: DungeonId; partySize: number; requestId?: number }
  | { type: 'treasureMapStart' }
  | { type: 'treasureMapSearch' | 'treasureMapOpen'; expeditionId: string }
  | { type: 'treasureOpen' | 'treasureRedeem' }
  | { type: 'treasureCheck' | 'treasureRefresh'; claimId: string }
  | { type: 'treasureSubmitted'; claimId: string; transactionHash: string }
  | { type: 'acceptCommunityRules'; version: number }
  | { type: 'playerReport'; targetId: string; messageId?: string; reason: string; details: string }
  | { type: 'reportsList'; reviewed?: boolean }
  | { type: 'reviewReport'; reportId: string; decision: 'ban' | 'dismiss'; reason: string }
  | { type: 'emote'; emoteId: EmoteId | null }
  | { type: 'storeActivateBoost'; boostId: StoreBoostId }
  | { type: 'storeBuyBoost'; boostId: StoreBoostId }
  | { type: 'storeBuyClass'; className: CharacterClass }
  | { type: 'upgradeGear'; gearId: string }
  | { type: 'storeOpen' }
  | { type: 'nftOpen' }
  | { type: 'nftMigrationReview'; tokenId: string }
  | { type: 'nftClaimPet'; pet: PetId; source?: 'learned' }
  | { type: 'nftClaimMount'; mount: MountId; source?: 'learned' }
  | { type: 'nftAuctionOpen'; npcId: string }
  | { type: 'nftBidHouse'; npcId: string; houseId: string; amountWei: string }
  | { type: 'nftSettleHouse'; npcId: string; houseId: string }
  | { type: 'nftWithdrawBid'; npcId: string }
  | { type: 'nftAuctionCheck'; npcId: string; transactionHash: string; action: 'bid' | 'settle' | 'withdraw'; houseId?: string; amountWei?: string; paymentWei: string }
  | { type: 'nftPaymentCheck'; orderId: string }
  | { type: 'storeWalletChallenge'; wallet: string }
  | { type: 'storeWalletBind'; signature: string }
  | { type: 'storeQuote'; productId: string }
  | { type: 'storePaymentCheck'; orderId: string; transactionHash?: string }
  | { type: 'storeChangeClass'; orderId: string; className: CharacterClass }
  | { type: 'selectTitle'; titleId: string | null }
  | { type: 'summonPet'; pet: PetId | null }
  | { type: 'petLootQuality'; quality: PetLootQuality }
  | { type: 'learnPet'; pet: PetId }
  | { type: 'learnMount'; mount: MountId }
  | { type: 'combatCompanion'; action: 'dismiss' | 'recall' }
  | { type: 'friendsList' }
  | { type: 'friendAdd' | 'ignoreAdd'; targetId: string; name?: never }
  | { type: 'friendAdd' | 'ignoreAdd'; name: string; targetId?: never }
  | { type: 'friendRemove' | 'ignoreRemove' | 'friendCancel'; targetId: string }
  | { type: 'friendRespond'; targetId: string; accept: boolean }
  | { type: 'refreshSession'; accessToken: string }
  | { type: 'join'; referralCode?: string; nativePlatform?:'ios'|'android'; realmId?: RealmId; token?: string; accessToken?: string; characterId?: string }
  | { type: 'gmAction'; action: GMAction; targetId: string; amount?: number; item?: GMItem; reason?: string; enabled?: boolean }
  | { type: 'selectCharacter'; realmId?: RealmId; characterId: string }
  | { type: 'leaveWorld' }
  | { type: 'leaveRealm' }
  | { type: 'onboardingViewed'; panel: 'bag' | 'gear' }
  | { type: 'move'; zone: ZoneId; x: number; z: number; rotation: number; sprint?: boolean; y?: number }
  | { type: 'mount'; mount: MountId | null }
  | { type: 'mountInvite' | 'mountAccept' | 'mountDecline'; playerId: string }
  | { type: 'mountLeave' }
  | { type: 'referralOpen' }
  | { type: 'referralBind'; code: string }
  | { type: 'zeppelinBoard'; from: ZoneId; to: ZoneId }
  | { type: 'zeppelinDiscover'; port: ZoneId }
  | { type: 'learnSpell'; npcId: string; ability: AbilityId }
  | { type: 'learnRiding'; npcId: string; rank: 1 | 2 }
  | { type: 'buyMount'; npcId: string; mount: MountId }
  | { type: 'jump' }
  | { type: 'climb'; x: number; z: number }
  | { type: 'climbStop' }
  | { type: 'sit'; chairId: string }
  | { type: 'stand' }
  | { type: 'chat'; text: string }
  | { type: 'whisper'; targetId: string; text: string }
  | { type: 'tradeRequest'; targetId: string }
  | { type: 'tradeRespond'; tradeId: string; accept: boolean }
  | { type: 'tradeOffer'; tradeId: string; offer: TradeOffer }
  | { type: 'tradeAccept'; tradeId: string; revision: number }
  | { type: 'tradeCancel'; tradeId: string }
  | { type: 'auctionOpen'; npcId: string }
  | { type: 'bankOpen'; npcId: string }
  | { type: 'pollOpen'; boothId: string }
  | { type: 'pollVote'; boothId: string; pollId: string; answers: Record<string, PollAnswer> }
  | { type: 'bankDeposit' | 'bankWithdraw'; npcId: string; item: BankItem }
  | { type: 'auctionWalletChallenge'; npcId: string; wallet: string }
  | { type: 'auctionWalletBind'; npcId: string; signature: string }
  | { type: 'auctionPaymentCheck'; npcId: string; listingId: string; transactionHash?: string }
  | { type: 'auctionList'; npcId: string; item: AuctionAsset; currency: AuctionCurrency; price: string }
  | { type: 'auctionBuy' | 'auctionCancel'; npcId: string; listingId: string }
  | { type: 'attack'; skill?: 'primary' | 'special'; ability?: AbilityId; targetId?: string }
  | { type: 'autoAttack'; targetId: string | null }
  | { type: 'cancelCast'; ability?: AbilityId }
  | { type: 'setHotbar'; slots: HotbarSlot[]; page?: 0 | 1; otherSlots?: HotbarSlot[] }
  | { type: 'gather'; targetId?: string }
  | { type: 'loot'; targetId: string; itemId?: string; itemIds?: string[]; requestId?: string }
  | { type: 'setItemLock'; itemId: string; locked: boolean }
  | { type: 'dropItem'; itemId: string; quantity: number }
  | { type: 'sellItem'; npcId: string; itemId: string; quantity: number }
  | { type: 'useItem'; itemId: string }
  | { type: 'respawn' | 'heal' | 'cancelGather' }
  | { type: 'interact'; targetId?: string }
  | { type: 'storyQuest'; action: 'talk' | 'accept' | 'claim' | 'abandon'; questId: string; rewardSlot?: import('./progression').GearSlot }
  | { type: 'goldMerchantCheck' }
  | { type: 'goldMerchantOffer'; roundId: string; gold: number; priceCentsPer1000: number }
  | { type: 'goldMerchantCancel' | 'goldMerchantClaim'; roundId: string }
  | { type: 'goldMerchantPayoutCheck'; claimId: string }
  | { type: 'goldMerchantSubmitted'; claimId: string; transactionHash: string }
  | { type: 'meadGodQuest' }
  | { type: 'npcService'; npcId: string; service: NpcService }
  | { type: 'travel'; zone: ZoneId }
  | { type: 'chooseEnding'; ending: Ending }
  | { type: 'createCharacter'; realmId?: RealmId; appearance: Appearance; name: string }
  | { type: 'deleteCharacter'; characterId: string; confirmation: string }
  | { type: 'buyGear'; itemId: string; npcId: string }
  | { type: 'sellGear'; itemId: string; npcId: string }
  | { type: 'buyBag'; itemId: BagKind; npcId: string }
  | { type: 'sellBag'; bagId: string; npcId: string }
  | { type: 'equipBag'; bagId: string; slot: number }
  | { type: 'unequipBag'; slot: number }
  | { type: 'equipGear'; itemId: string; slot?: EquipmentSlot }
  | { type: 'unequipGear'; slot: EquipmentSlot }
  | { type: 'sellResource'; npcId: string; resource: 'wood' | 'crystal' | 'herb'; quantity: number }
  | { type: 'learnTalent'; talentId: string }
  | { type: 'resetTalents' }
  | { type: 'acceptContract' | 'claimContract' | 'cancelContract'; contractId: string }
  | { type: 'craft'; recipeId: string }
  | { type: 'partyInvite' | 'partyKick' | 'partyPromote'; targetId: string }
  | { type: 'partyAccept' | 'partyDecline'; invitationId: string }
  | { type: 'duelRequest'; targetId: string }
  | { type: 'arenaRequest'; targetId: string; size: ArenaSize; wagerMoss?: string }
  | { type: 'arenaWagerOpen' }
  | { type: 'arenaWagerCheck'; matchId: string }
  | { type: 'arenaWalletChallenge'; wallet: string }
  | { type: 'arenaWalletBind'; signature: string }
  | { type: 'arenaAccept' | 'arenaDecline'; invitationId: string }
  | { type: 'arenaForfeit' }
  | { type: 'arenaQueueJoin'; size?: ArenaSize }
  | { type: 'arenaQueueLeave' }
  | { type: 'duelAccept' | 'duelDecline'; invitationId: string }
  | { type: 'duelForfeit' }
  | { type: 'partyLeave' | 'dungeonExit' }
  | { type: 'dungeonEnter'; dungeonId?: DungeonId }
  | { type: 'dungeonSummon'; dungeonId: DungeonId; targetId: string }
  | { type: 'dungeonSummonRespond'; summonId: string; accept: boolean }
  | { type: 'dungeonInteract'; targetId: string }
  | { type: 'partyChat'; text: string };

export interface GameEvent {
  messageId?: string;
  type: 'event';
  kind: 'info' | 'reward' | 'damage' | 'chat' | 'combat' | 'emote';
  channel?: 'world' | 'party';
  text: string;
  playerId?: string;
  role?: PlayerRole;
  requestType?: string;
  specialistUpgrade?: 'success' | 'fail' | 'break';
  upgradeEffectId?: string;
  logOnly?: boolean;
}

export interface CombatEvent {
  type: 'combat';
  basic?: true;
  effectPhase?: 'impact';
  startedAt: number;
  castTimeMs?: number;
  playerId: string;
  zone: ZoneId;
  instanceId: string | null;
  ability: AbilityId;
  from: { x: number; z: number };
  rotation: number;
  targets: { id: string; x: number; z: number }[];
}

export interface DamageEvent {
  type: 'damage'; targetId: string; targetKind: 'enemy' | 'player'; amount: number; x: number; z: number; effect?: 'heal' | 'absorb' | 'xp' | 'immune';
}

export type ServerMessage =
  | ({ type: 'referrals' } & ReferralState)
  | { type: 'mountInvitation'; invitation: { playerId: string; name: string; expiresAt: number } | null }
  | import('./specialist-nft').SpecialistNftServerMessage
  | { type: 'chatTranslation'; messageId: string; targetLanguage: string; text?: string; error?: string; skipped?: boolean }
  | { type: 'pong'; id: number }
  | { type: 'lootResult'; requestId: string; success: boolean }
  | { type: 'dungeonLeaderboard'; dungeonId: DungeonId; partySize: number; entries: DungeonRecord[]; error?: string; requestId?: number }
  | { type: 'treasureState'; state: TreasureState; message?: string }
  | { type: 'communityErase'; playerIds: string[] }
  | { type: 'community'; version: number; accepted: boolean }
  | { type: 'reportResult'; success: boolean; text: string }
  | { type: 'reports'; reports: PlayerReport[] }
  | { type: 'storeState'; state: StoreState; message?: string }
  | { type: 'nftState'; state: NftState; message?: string; openAuction?: boolean }
  | { type: 'nftQuote'; order: NftOrder }
  | { type: 'nftMigrationQuote'; migration: NftMigration }
  | ({ type: 'nftAuctionTransaction' } & NftAuctionTransaction)
  | { type: 'nftAuctionChecked'; transactionHash: string; state: 'pending' | 'confirmed' | 'failed' }
  | { type: 'storeWalletChallenge'; message: string; address: string; expiresAt: number }
  | { type: 'storeQuote'; order: StoreOrder }
  | { type: 'titleSelected'; titleId: string | null; error?: string }
  | { type: 'achievement'; achievementId: string; unlockedAt: number }
  | { type: 'friends'; friends: FriendEntry[]; ignored: IgnoreEntry[]; incoming: IgnoreEntry[]; outgoing: IgnoreEntry[]; request?: 'list' | 'add' | 'remove' | 'ignoreAdd' | 'ignoreRemove' | 'accept' | 'decline' | 'cancel'; notice?: string; error?: string }
  | { type: 'sessionRefresh' }
  | { type: 'clientCheck'; nonce: string }
  | { type: 'realmStatus'; available: boolean }
  | { type: 'shutdownWarning'; secondsRemaining: number | null; held?: boolean }
  | { type: 'gmResult'; success: boolean; text: string }
  | { type: 'gmLootTrace'; report: LootTraceReport }
  | { type: 'gmNotice'; action: 'kick' | 'ban'; text: string }
  | { type: 'roster'; realmId?: RealmId; characters: Player[]; maxCharacters: number; token?: string }
  | { type: 'realmLeft' }
  | { type: 'welcome'; id: string; token?: string; player: Player; chatTranslation?: boolean; lootResults?: boolean; lootQueueLimit?: number; merchantSales?: boolean; hotbarPageSize?: number }
  | { type: 'snapshot'; storyEncounter?: StoryEncounterState | null; instantCombat?: import('./instant-combat').InstantCombatState; serverTime: number; zone: ZoneId; instanceId: string | null; population: number; players: Player[]; enemies: Enemy[]; nodes: ResourceNode[]; loot: LootDrop[]; party: PartyState | null; partyInvites: PartyInvite[]; duel: DuelState | null; duelInvites: PartyInvite[]; arena: ArenaState | null; arenaInvites: ArenaInvite[]; arenaQueue: ArenaQueueState | null; dungeon: DungeonState | null; dungeonSummon: DungeonSummon | null; raid?: import('./raid').RaidState | null; raidInvites?: import('./raid').RaidInvitation[]; gmPlayers?: GMPlayer[] }
  | { type: 'correction'; x: number; z: number; rotation: number; zone: ZoneId; instanceId: string | null; jump?: JumpState; reason: string }
  | StoryQuestDialogue
  | { type: 'dialogue'; npcId: string; title: string; lines: string[]; choices?: { id: Ending; label: string }[]; services?: { id: NpcService; label: string }[] }
  | { type: 'goldMerchantState'; state: GoldMerchantState }
  | { type: 'villageService'; npcId: string; service: 'trade' | 'contracts' }
  | { type: 'whisper'; messageId?: string; from: { id: string; name: string; role?: PlayerRole }; to: { id: string; name: string; role?: PlayerRole }; text: string }
  | { type: 'trade'; trade: TradeState | null; reason?: string }
  | ({ type: 'auction' } & AuctionState)
  | ({ type: 'arenaWagers' } & ArenaWagersState)
  | { type: 'arenaWalletChallenge'; message: string; address: string; expiresAt: number }
  | ({ type: 'bank' } & BankView)
  | ({ type: 'polls' } & PollBoothView)
  | { type: 'auctionWalletChallenge'; message: string; address: string; expiresAt: number }
  | { type: 'auctionPayment'; listingId: string; order: AuctionOrder }
  | CombatEvent
  | DamageEvent
  | GameEvent;

export interface RuntimeConfig {
  keycloak: { url: string; realm: string; clientId: string } | null;
  realmId?: RealmId;
  realms?: HostingRealm[];
}
