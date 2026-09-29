import { deferTouchRender } from './scroll-refresh';
import { normalizeReferralCode } from './referrals';
import { createInputActivity, createClientCheck } from './input-activity';
import { mountRideInvitation } from './mount-invitation';
import { mountReferralUI } from './referral-ui';
import './referrals.css';
import { mountChatTranslation } from './chat-translation-ui';
import { GOLD_MERCHANT } from './gold-merchant';
import { mountGoldMerchantUI } from './gold-merchant-ui';
import { GOLD_ZEPPELIN_COST } from './gold-economy';
import { WILD_BIOMES, RESOURCE_SITES, WORLD_CURIOS, wildBiomeAt } from './world-features';
import { treasureMapTarget, treasureMapWaypoint, treasureMapSearchArea } from './treasure-map-ui';
import { createTreasureMapMarker } from './treasure-map-visuals';
import './treasure-map-ui.css';
import { mountTreasureUI } from './treasure-ui';
import { loadTreasureAssets, createTreasureEffects } from './treasure-visuals';
import { SHADY_MERCHANT } from './settlements';
import './treasure.css';
import './wallet-provider.css';
import { mountCommunityUI } from './community-ui';
import { dungeonHazardAttack, dungeonDeathHazardPattern } from './dungeon-mechanics';
import type { DungeonHazard, ArenaState, ArenaQueueState } from './shared';
import * as THREE from 'three';
import { graphics, renderGraphicsSettings, mountGraphicsSettings, updateAutoGraphics, autoGraphicsStatus } from './graphics-settings';
import { createPerformanceHud } from './performance-hud';
import { createRemoteMotion } from './remote-motion';
import { KEY_ACTIONS, gameKey, bindingLabel, renderKeybindings, mountKeybindings } from './keybindings';
import './graphics-settings.css';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOverworld, createDungeonWorld } from './zones';
import { installCollisionScene, hasCollisionScene, updateCollisionSceneState } from './collision3d';
import { collisionSceneKey, collisionRouteAllowed, dungeonCollisionFlags } from './collision-context';
import { toWorld, WORLD_BOUNDS, canTraverse, OVERWORLD_SPAWNS } from './realm';
import { MOUNTS, MOUNT_UNLOCK_LEVEL, STAMINA_MAX, WALK_SPEED, SPRINT_SPEED, SWIM_SPRINT_SPEED, mountSpeed, canSprint, type MountId } from './travel';
import { newJump, startJump, stepJump, moveJump, jumpFloor, type JumpState } from './jumping';
import { CLIMB_ENABLED, CLIMB_SPEED, startClimb } from './climbing';
import { createZeppelins } from './zeppelin-models';
import { ZEPPELIN_PORTS, createZeppelinFlight, zeppelinPort, zeppelinPose } from './zeppelin';
import './zeppelin.css';
import { loadCityMountAssets } from './city-life';
import { makeMount, animateMount, mountRiderOffset, mountBob, disposeMount } from './mounts';
import { EXPEDITIONS, surfaceAt, groundHeight, waterAt, SWIM_SPEED, WATER_LEVEL } from './landscape';
import { regionLevelRange, regionLevelLabel } from './region-levels';
import { VILLAGES, VILLAGE_NPCS } from './settlements';
import { HEARTHLING_NPC, MEADGOD_QUEST_COST } from './hearthling';
import { renderHearthlingQuest, renderHearthlingJournal } from './hearthling-ui';
import { animateVillager } from './village-models';
import { BUILDING_CHAIRS, BUILDING_BEDS, buildingAt, buildingFloorHeight } from './buildings';
import { setIdleAnimations } from './idle-animation';
import { surfaceHeight, pickTerrain } from './terrain-view';
import { CONTRACTS } from './adventure';
import { renderAdventureJournal, renderAdventureTabs, renderCompletedAdventures, renderContracts, renderContractDetail, renderCrafting, partyHUD, type AdventureBoardTab } from './adventure-ui';
import './adventure.css';
import { createWorldMap, type WorldMapPoint } from './world-map';
import { ROOTVAULT_GUARDIAN, DUNGEONS, getDungeon, dungeonLayout, dungeonStages, type DungeonId, dungeonBounds, dungeonReturn, dungeonPreparation, inDungeonPreparation, DUNGEON_EXIT, dungeonGateOpen, dungeonRoomPortalOpen } from './dungeon';
import { dungeonRoomAt } from './dungeon-room-visibility';
import './world-map.css';
import { dungeonTime, dungeonElapsed, renderDungeonResult, revealDungeonRewards, renderDungeonLeaderboard, type DungeonBoard } from './dungeon-results-ui';
import './dungeon-results.css';
import { APOSTLE_RAID, RAID_BOUNDS, RAID_PHASE_NAMES, RAID_SUIT_GLYPHS, isRaidInstance, type RaidState, type RaidInvitation } from './raid';
import { createRaidWorld, loadRaidWorldAssets, makeRaidMechanicModel } from './raid-world';
import { renderRaidPanel, revealRaidRewards, mountRaidHUD, raidAction } from './raid-ui';
import { startUpgradeEffect, finishUpgradeEffect, cancelUpgradeEffect, animateUpgradeEffect } from './upgrade-effects';
import { renderRaidProgression, raidProgressionAction } from './raid-progression-ui';
import { activeSpecialist, SPECIALISTS_ENABLED, specialistJobLevel } from './raid-progression';
import { showChatBubble, clearChatBubbles } from './chat-bubbles';
import { mountSpecialistNftUI } from './specialist-nft-ui';
import { loadRaidAssets } from './raid-model';
import { raidCastCue } from './raid-visuals';
import { instantCombatCastCue } from './instant-combat-visuals';
import './raid.css';
import { CITY, CITY_VENDORS, DEED_AUCTIONEER, insideCity, insideAnyCity } from './city';
import { AUCTIONEERS, BANKERS, CITY_SERVICE_NPCS } from './city-services';
import { POLL_BOOTHS } from './poll-booths';
import { mountPollUI } from './poll-ui';
import './poll.css';
import { TRAINER_NPCS } from './training';
import { renderTraining, type TrainingFilter } from './training-ui';
import './training.css';
import { createMinimap } from './minimap';
import { ZONES, NPCS, BEACONS, CHAPTERS, ENDINGS, getZone, getChapter } from './content';
import type { ZoneId, Ending, Objective, NodeKind } from './content';
import { createWaypointIndicator } from './waypoint';
import { createGroundWaypoint, advanceWaypointRoute } from './ground-waypoint';
import { damageOverTimeLabels } from './combat-feedback';
import './waypoint.css';
import { findPath } from './navigation';
import { getOnboardingStep, onboardingFeatureUnlocked, onboardingLockReason, type OnboardingFeature } from './onboarding';
import './onboarding.css';
import { makeResource, showResource } from './resources';
import { makeLootRemains } from './loot';
import { lootRows, lootItemValid, LOOT_ITEMS } from './loot-items';
import { mountLootUI, lootAllBlockReason, lootEntryBlockReason } from './loot-ui';
import './loot-ui.css';
import { chooseTarget, isHostilePlayer, isHostileTarget, combatCompanionOwner, canSupportPlayer, type TargetInfo } from './targeting';
import { ARENA_BOUNDS, ARENA_ENTRANCE, ARENA_ENTRY_RADIUS, isArenaInstance } from './arena';
import { createArenaWorld } from './arena-world';
import { isInstantCombatInstance, type InstantCombatState } from './instant-combat';
import { createInstantCombatWorld } from './instant-combat-world';
import { instantCombatMap } from './instant-combat-maps';
import { instantCombatStatus, renderInstantCombatPanel, mountInstantCombatHUD } from './instant-combat-ui';
import './instant-combat.css';
const usesArenaWorld = (id: string | null | undefined) => isArenaInstance(id) || isInstantCombatInstance(id);
import { renderArenaMenu } from './arena-menu';
import { arenaWagerAmount } from './arena-wager';
import { mountArenaWagerUI } from './arena-wager-ui';
import './arena-menu.css';
import { COLOSSEUM, inColosseumClearing, isInColosseum } from './colosseum';
import { SKILLS, RESOURCE_TYPES, skillProgress, canGather, gatheringXpGain, type SkillId } from './skills';
import { WORLD_GATHERING_NODES } from './gathering-nodes';
import { renderSkills, renderProfessionGuide, skillTabs } from './skills-ui';
import { AUTO_ATTACKS, AUTO_ATTACK_ANIMATION_MS } from './auto-attacks';
import { SPELLS, HOTBAR_PAGE_SIZE, abilityValid, abilityUnlocked, legacyAbility, spellCastTimeMs, GLOBAL_ATTACK_MS, type AbilityId } from './spells';
import { createHotbar, renderSpellbook } from './hotbar';
import { renderCharacterList } from './roster-ui';
import { bindPreviewDrag, bindPreviewRotation } from './preview-rotation';
import { hostingConfig, guestSessionKey, realmAddress, leaveHostingRealm, setActiveHostingRealm } from './hosting-client';
import { realmIdValid, type RealmId } from './hosting-realms';
import './roster.css';
import { MAX_LEVEL, gearById, gearUpgradeQuote, gearSpeedMultiplier, combatStats, gearFitsSlot, type EquipmentSlot } from './progression';
import { renderBackpack, renderItemDetails, bagItems, reconcileBagSlots, type BagViewOptions } from './character-ui';
import { mountItemHover } from './item-hover';
import { preserveItemRollDetails } from './item-tooltip';
import { mountTalentHover } from './talent-hover';
import { itemLocked } from './item-locks';
import { mountItemMenu } from './item-menu';
import './item-tooltip.css';
import { bagKindValid } from './bags';
import { mountBagPreview } from './bag-preview';
import { mountCharacterView, type CharacterView } from './character-view';
import { renderTalents, renderGear, renderShop, mountTalentBranches } from './progression-ui';
import './progression.css';
import './skills.css';
import './targets.css';
import { makeCharacter, animateCharacter, makeEnemy, animateEnemy, loadCharacterAssets, setMonsterAssets, setDeathAnimations } from './characters';
import { MONSTERS, WORLD_BOSSES, WORLD_BOSS_GROUP_SIZE, monsterSpawnLevel } from './bestiary';
import { setInstantCombatAssets, setTrainingDummyAssets, setThemedMonsterAssets, setDungeonBossAssets, playMonsterHit } from './monster-models';
import { createMonsterEffects } from './monster-effects';
import { loadSpellEffectAssets } from './spell-effect-details';
import { createCombatEffects } from './combat-effects';
import { createAmbientEffects } from './ambient-effects';
import { createDayNightCycle } from './day-night';
import { createDamageNumbers } from './damage-numbers';
import { mountUnitFrames, type UnitFrameData } from './unit-frames';
import { createUnitPortraits, drawNpcPortrait, type UnitPortraitSubject } from './unit-portraits';
import { combatTiming } from './combat-timing';
import { castLabel, updateCastingBar } from './casting';
import { mountUI, $, icon, refreshBindingHints } from './ui';
import { mountLocalization, languagePicker } from './localization';
import './localization.css';
import { DEATH_ANIMATION_MS } from './shared';
import { DEFAULT_APPEARANCE, RACES, GENDERS, FACES, HAIRSTYLES, ARMOR_COLOR_SLOTS, type ArmorColorSlot, appearanceValid, normalizeAppearance, migrateLegacyAppearance } from './appearance';
import { characterNameError } from './character-name';
import { emoteCommand, EMOTE_HELP } from './emotes';
import type { Appearance, Player, Enemy, ResourceNode, LootDrop, PartyState, PartyInvite, DungeonState, ClientMessage, ServerMessage, CombatEvent, GMPlayer, PlayerRole } from './shared';
import './style.css';
import './art.css';
import './chat.css';
import './minimap.css';
import './character-bags.css';
import './talents.css';
import './campaign.css';
import './login.css';
import './creator.css';
import './hotbar.css';
import { mountFriendsUI } from './friends-ui';
import { mountAchievementsUI } from './achievements-ui';
import { playerTitle } from './titles';
import { mountPlayerMenu, type PlayerAction } from './player-menu';
import { mountDuelUI, mountArenaUI } from './duel-ui';
import './duel-ui.css';
import { mountGmUI } from './gm-ui';
import { GM_FLY_SPEED, GM_FLY_MAX_HEIGHT } from './gm';
import { gmBadge, updateGmNameplate } from './gm-badge';
import './gm-ui.css';
import { mountTradeUI } from './trade-ui';
import { mountAuctionUI } from './auction-ui';
import { mountStoreUI, renderStoreBoosts } from './store-ui';
import { mountNftUI } from './nft-ui';
import './nft-ui.css';
import { isNativeApp, nativeClient, nativeUpdateLinks, renderUpdateGuidance, promptNativeNotifications } from './native-client';
import { mountNotificationSettings } from './notification-settings';
import './store.css';
import { mountBankUI } from './bank-ui';
import './auction.css';
import './bank.css';
import './player-menu.css';
import './trade.css';
import './travel.css';
import { isPetId, PET_LOOT_QUALITIES, type PetId } from './pets';
import { createPetFollowers, loadPetAssets, type PetFollowerOwner } from './pet-models';
import { renderPetCollection, renderMountCollection } from './pet-ui';
import { createCollectionPreview } from './collection-preview';
import { createCombatCompanions, type CombatCompanionOwner } from './combat-companion-models';
import { tameableKind, combatCompanionStats } from './combat-companions';
import './pet-ui.css';
import './cursors.css';
import './unit-frames.css';
import './quest-board.css';
import { initAuth, getAccessToken, refreshSessionAccessToken, signInInsideGame, signInWithProviderInsideGame, supportsEmbeddedSignIn, signIn, signInWithWallet, signInWithSocial, createAccount, signOut, clearSession, authEnabled, walletSignInEnabled, socialSignInEnabled, socialSignInRequiresUpdate } from './auth';
import { startUpdates, checkForUpdates, showShutdownWarning, shutdownWarningActive } from './updates';
import { mountWebsiteTag } from './website-tag';

import { createLoginScene } from './login-scene';
import { createGameAudio } from './audio';
import { initControlMode, bindJoystick, bindTouchCamera, bindTouchActions } from './mobile-controls';
import './mobile-controls.css';
import { createMobileLayout } from './mobile-layout';
import './mobile-layout.css';
import { createStoryQuestUI, renderStoryJournal, renderStoryNpcChoices, storyQuestTracker } from './story-quest-ui';
import { listStoryQuests, storyQuestReady, storyQuestById } from './story-quests';
import { STORY_OBJECTS, STORY_ENEMIES, STORY_ENCOUNTERS } from './story-world-data';
import { createStoryWorld } from './story-world';
import './benji-ui.css';
import './hud-layout.css';
import './mobile-hud.css';
import './dungeon-layout.css';
import './entry-layout.css';

mountUI();
const localization = mountLocalization();
const performanceHud=createPerformanceHud($('performance-hud'),id=>send({type:'ping',id}));
initControlMode();
const mobileLayout=createMobileLayout({begin:()=>{closePanel();setMobileMenus(false);setAutoAttack(null);cancelCasting();cancelGathering();clearMovementKeys();editingMobileLayout=true;},end:()=>{editingMobileLayout=false;clearMovementKeys();},announce:toast});
const gameAudio=createGameAudio();
let audioCombatUntil=0;
function unlockAudio(event:Event){if(event.isTrusted)gameAudio.unlock();}
document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
document.addEventListener('keydown',unlockAudio,{capture:true});
document.addEventListener('click',event=>{if(!event.isTrusted||!(event.target instanceof Element))return;const control=event.target.closest('button:not(:disabled),summary');if(control)gameAudio.ui(control.id==='close-panel'||control.getAttribute('aria-label')?.startsWith('Close')?'close':control.closest('#game-menus')?'open':'tap');});
const loginScene=createLoginScene($<HTMLCanvasElement>('login-scene'));
window.addEventListener('pagehide',event=>{if(!event.persisted)loginScene.dispose();else loginScene.stop();});
window.addEventListener('pageshow',()=>{if(!$('login').hidden)loginScene.start();});
const defaultAppearance: Appearance = { ...DEFAULT_APPEARANCE };
function readLocal(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
const incomingReferral = normalizeReferralCode(new URLSearchParams(location.search).get('ref'));
if(incomingReferral){try{localStorage.setItem('mossvale-referral-code',incomingReferral);}catch{}}
function saveLocal(key: string, value: string) { try { localStorage.setItem(key, value); } catch { toast('Browser storage is unavailable. Your session will last until you close this page.'); } }
function normalizeHudScale(value:unknown):number{
 const number=typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):NaN;
 return Number.isFinite(number)?Math.max(30,Math.min(100,Math.round(number/5)*5)):40;
}
let hudScale=40;
function applyHudScale(value:unknown,save=false){
 hudScale=normalizeHudScale(value);document.body.style.setProperty('--hud-scale',String(hudScale/100));
 if(save)saveLocal('mossvale-desktop-hud-scale',String(hudScale));
}
function renderHudScaleSettings(){
 return `<section class="desktop-hud-settings"><label class="settings-row hud-scale-row" for="hud-scale-setting"><span>Hotbar size</span><input id="hud-scale-setting" type="range" min="30" max="100" step="5" value="${hudScale}" aria-describedby="hud-scale-hint"><output id="hud-scale-value" for="hud-scale-setting">${hudScale}%</output></label><button id="hud-scale-reset" type="button">Reset</button><p id="hud-scale-hint">Includes XP bars and the desktop menu. Changes apply immediately and are saved on this device.</p></section>`;
}
function mountHudScaleSettings(root:HTMLElement){
 const input=root.querySelector<HTMLInputElement>('#hud-scale-setting')!,output=root.querySelector<HTMLOutputElement>('#hud-scale-value')!;
 const sync=()=>{input.value=String(hudScale);output.textContent=`${hudScale}%`;};
 input.oninput=()=>{applyHudScale(input.value,true);sync();};
 root.querySelector<HTMLButtonElement>('#hud-scale-reset')!.onclick=()=>{applyHudScale(40,true);sync();};
 sync();
}
applyHudScale(readLocal('mossvale-desktop-hud-scale'));
function normalizeChatScale(value:unknown):number{
 const number=typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):NaN;
 return Number.isFinite(number)?Math.max(60,Math.min(125,Math.round(number/5)*5)):80;
}
let chatScale=80;
function applyChatScale(value:unknown,save=false){
 chatScale=normalizeChatScale(value);document.body.style.setProperty('--chat-scale',String(chatScale/100));
 if(save)saveLocal('mossvale-desktop-chat-scale',String(chatScale));
}
function renderChatScaleSettings(){
 return `<section class="desktop-chat-settings"><label class="settings-row hud-scale-row" for="chat-scale-setting"><span>Chat size</span><input id="chat-scale-setting" type="range" min="60" max="125" step="5" value="${chatScale}" aria-describedby="chat-scale-hint"><output id="chat-scale-value" for="chat-scale-setting">${chatScale}%</output></label><button id="chat-scale-reset" type="button">Reset</button><p id="chat-scale-hint">Scales chat and its preview independently from the hotbar. Drag the chat corner to change its shape. Saved on this device.</p></section>`;
}
function mountChatScaleSettings(root:HTMLElement){
 const input=root.querySelector<HTMLInputElement>('#chat-scale-setting')!,output=root.querySelector<HTMLOutputElement>('#chat-scale-value')!;
 const sync=()=>{input.value=String(chatScale);output.textContent=`${chatScale}%`;};
 const update=(value:unknown)=>{rememberChatScroll(true);applyChatScale(value,true);if(!$('chat').classList.contains('collapsed'))restoreChatScroll();sync();};
 input.oninput=()=>update(input.value);
 root.querySelector<HTMLButtonElement>('#chat-scale-reset')!.onclick=()=>update(80);
 sync();
}
applyChatScale(readLocal('mossvale-desktop-chat-scale'));

let appearance = { ...defaultAppearance };
let playerName = 'Wanderer';
try { const saved = JSON.parse(readLocal('mossvale-profile') || '{}'); const look=migrateLegacyAppearance(saved.appearance); if (appearanceValid(look)) appearance = normalizeAppearance(look); if (typeof saved.name === 'string') playerName = saved.name.slice(0,20); } catch { /* A damaged local preference must not stop the world loading. */ }
let player: Player | undefined;
mountItemHover(() => player);
let playerId = '';
let enemies: Enemy[] = [];
let nodes: ResourceNode[] = [];
let loot: LootDrop[] = [];
let players: Player[] = [];
let gmPlayers: GMPlayer[] = [];
let moderationNotice: {action:'kick'|'ban';text:string}|null=null;
let party: PartyState | null = null;
let partyInvites: PartyInvite[] = [];
let pendingPartyInvite: string | null = null;
let dungeon: DungeonState | null = null;
let instantCombat:InstantCombatState|null=null,lastInstantCombatPanel='';
const instantCombatHUD=mountInstantCombatHUD($('play-ui'),()=>openInstantCombat(),()=>{if(connected&&instantCombat?.registrationOpen&&!instantCombat.registered&&!instantCombat.run)send({type:'instantCombatRegister'});});
const instantCombatButton=document.createElement('button');instantCombatButton.id='instant-combat-button';instantCombatButton.type='button';instantCombatButton.title='Instant Combat';instantCombatButton.setAttribute('aria-label','Instant Combat');instantCombatButton.dataset.mobileLabel='Instant Combat';instantCombatButton.innerHTML=icon('menu-instant-combat')+'<span>Instant Combat</span>';instantCombatButton.onclick=()=>openInstantCombat();$('game-menus').insertBefore(instantCombatButton,$('arena-button'));
function openInstantCombat(){if(!player||entryActive||rosterActive)return;lastInstantCombatPanel='';openPanel('Instant Combat','COOPERATIVE ARENA · EVERY TWO HOURS','instant-combat');renderInstantCombatMenu();}
function renderInstantCombatMenu(){if(!player||!panel.open||panel.dataset.mode!=='instant-combat')return;const html=renderInstantCombatPanel(instantCombat,player,Date.now()+serverOffset,connected);if(html!==lastInstantCombatPanel){lastInstantCombatPanel=html;replacePanelContent(html);}}
function resetInstantCombat(){instantCombat=null;lastInstantCombatPanel='';instantCombatHUD.update(null,0,false);renderInstantCombatMenu();}
let raid:RaidState|null=null,raidInvites:RaidInvitation[]=[],lastRaidPanel='',presentedRaidResult='';
let raidTab:'encounter'|'collection'='encounter';
let specialistNftUI:ReturnType<typeof mountSpecialistNftUI>|undefined;
const raidHUD=mountRaidHUD($('play-ui'),()=>openRaid(),id=>{if(players.some(player=>player.id===id)){selectedId=id;closePanel();}},message=>send(message));
const raidButton=document.createElement('button');raidButton.id='raid-button';raidButton.type='button';raidButton.title='Horned Apostle raid';raidButton.setAttribute('aria-label','Raid');raidButton.dataset.mobileLabel='Raid';raidButton.innerHTML=icon('menu-raid')+'<span>Raid</span>';raidButton.onclick=()=>openRaid();$('game-menus').insertBefore(raidButton,$('arena-button'));
function openRaid(){if(!player||!connected)return;raidTab='encounter';lastRaidPanel='';openPanel(APOSTLE_RAID.name,'LEVEL 60 · 10–20 ADVENTURERS','raid');renderRaidMenu();}
function renderRaidMenu(){if(!player||!panel.open||panel.dataset.mode!=='raid')return;const html=`<nav class="raid-tabs" aria-label="Raid sections"><button class="primary-button" data-raid-tab="encounter" aria-pressed="${raidTab==='encounter'}">Encounter</button><button class="primary-button" data-raid-tab="collection" aria-pressed="${raidTab==='collection'}">Raid collection</button></nav>`+(raidTab==='collection'?renderRaidProgression(player)+'<div class="raid-actions"><button class="primary-button" data-raid-store>Open store</button>'+(!isNativeApp()?`<button class="primary-button" data-specialist-nft-open ${worldInstance?'disabled':''}>${worldInstance?'Specialist NFTs · Return to the world':'Specialist NFTs'}</button>`:'')+'</div>':renderRaidPanel(raid,raidInvites,player,players,Date.now()+serverOffset));if(html===lastRaidPanel)return;lastRaidPanel=html;replacePanelContent(html);if(raidTab==='encounter'&&raid?.result)revealRaidRewards($('panel-content'),raid.result,player.id);}
function updateRaidNameplate(label:HTMLElement,id:string){let status=label.querySelector<HTMLElement>('.raid-nameplate-status');const member=raid?.members.find(member=>member.id===id),text=member&&isRaidInstance(worldInstance)?`${member.suit?RAID_SUIT_GLYPHS[member.suit]+' '+member.suit.toUpperCase()+' · ':''}${member.marks?'Marks '+member.marks+' / 5':''}`:'';if(!status&&text){status=document.createElement('span');status.className='raid-nameplate-status';label.append(status);}if(status&&status.textContent!==text)status.textContent=text;}
let dungeonBoard:DungeonBoard|null=null,dungeonBoardRequest=0,presentedDungeonResult='',lastDungeonPanel='';
let dungeonBoardTimer:ReturnType<typeof setTimeout>|undefined;
const dungeonTimer=document.createElement('button');dungeonTimer.id='dungeon-timer';dungeonTimer.type='button';dungeonTimer.hidden=true;
dungeonTimer.innerHTML='<strong></strong><span></span>';dungeonTimer.onclick=()=>openDungeon();$('play-ui').append(dungeonTimer);
function updateDungeonTimer(){
 const visible=!!dungeon&&!dungeon.dream&&connected&&!entryActive&&!rosterActive;
 dungeonTimer.hidden=!visible;if(!visible||!dungeon)return;
 const time=dungeonTime(dungeonElapsed(dungeon,Date.now()+serverOffset));
 const detail=dungeon.completed?'Dungeon cleared':dungeon.startedAt?`${dungeon.kills??0} defeated`:'Ready to begin';
 if(dungeonTimer.firstElementChild!.textContent!==time)dungeonTimer.firstElementChild!.textContent=time;
 if(dungeonTimer.lastElementChild!.textContent!==detail)dungeonTimer.lastElementChild!.textContent=detail;
 const label=`${detail}. Time ${time}. Open dungeon details.`;if(dungeonTimer.getAttribute('aria-label')!==label)dungeonTimer.setAttribute('aria-label',label);
}
function loadDungeonLeaderboard(partySize=dungeonBoard?.partySize??dungeon?.result?.partySize??party?.members.length??1){
 const dungeonId=dungeon?.kind??dungeonChoice,requestId=++dungeonBoardRequest;
 clearTimeout(dungeonBoardTimer);
 dungeonBoard={dungeonId,partySize,requestId,loading:connected,entries:[],...(!connected?{error:'Reconnect to load dungeon records.'}:{})};
 if(connected){
  send({type:'dungeonLeaderboard',dungeonId,partySize,requestId});
  dungeonBoardTimer=setTimeout(()=>{if(dungeonBoard?.requestId!==requestId||!dungeonBoard.loading)return;dungeonBoard.loading=false;dungeonBoard.error='Dungeon records did not respond.';if(panel.open&&panel.dataset.mode==='dungeon')renderDungeonPanel();},10000);
 }
 if(panel.open&&panel.dataset.mode==='dungeon')renderDungeonPanel();
}
function receiveDungeonLeaderboard(message:Extract<ServerMessage,{type:'dungeonLeaderboard'}>){
 if(!dungeonBoard||message.requestId!==dungeonBoard.requestId||message.dungeonId!==dungeonBoard.dungeonId||message.partySize!==dungeonBoard.partySize)return;
 clearTimeout(dungeonBoardTimer);dungeonBoard={...dungeonBoard,loading:false,entries:message.entries,error:message.error};
 if(panel.open&&panel.dataset.mode==='dungeon')renderDungeonPanel();
}
let dungeonChoice: DungeonId = 'rootvault';
let worldDungeonKind: DungeonId | null = null;
const dungeonAttackCues = new Map<string,DungeonHazard>();
let dungeonSummon: Extract<ServerMessage,{type:'snapshot'}>['dungeonSummon'] = null;
let atlas: ReturnType<typeof createWorldMap> | null = null;
let mapSelection: WorldMapPoint | null = null;
let waypoint: (WorldMapPoint & { label:string; instanceId:string|null }) | null = null;
let guideRoute: {x:number;z:number}[] = [];
let guideTargetId: string | undefined, guideKey = '', guideOwner = '', guideRetryAt = 0;
let guideWasAlive = true;
let objectiveGuidance = readLocal('mossvale-objective-guidance') !== 'off';
let mapRoute: {x:number;z:number}[] = [];
const atlasLabels = new Map<string,HTMLElement>();
let worldInstance: string | null = null;
function currentWorldBounds(){return isRaidInstance(worldInstance)?RAID_BOUNDS:isInstantCombatInstance(worldInstance)?instantCombatMap(instantCombat?.run?.mapId).bounds:isArenaInstance(worldInstance)?ARENA_BOUNDS:worldInstance?dungeonBounds(dungeon?.kind):WORLD_BOUNDS;}

let arena: ArenaState | null = null;
let arenaQueue: ArenaQueueState | null = null;
let lastArenaMenu='',arenaWagerMoss='0';
let renderedInstance: string | null | undefined;
let socket: WebSocket;
let connected = false;
let realmAvailable = false;
let realmOutageMessage = '';
let entryActive = true;
let rosterActive = false;
let rosterCharacters: Player[] = [];
let selectedCharacterId: string | null = null;
let enteredCharacterId: string | undefined;
let maxCharacters = 6;
let activeRealmId: RealmId = 'eu';
let changingRealm = false;
let creatingCharacter = false;
let characterDeletion: {id:string;pending:boolean}|null=null;
let connectionRevision = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let stopSessionRenewal: (()=>void) | undefined;
let sessionDisplaced = false, accountFlowPending = false;
let embeddedLogin: ReturnType<typeof signInInsideGame> | undefined;
let providerFallback: (() => Promise<void>) | undefined;
let activeProvider: 'wallet' | 'google' | 'apple' | undefined;
type UpdateSelection = {resume:boolean;selectedId:string|null;realmId?:RealmId;draft?:{name:string;appearance:Appearance}};
let updateSelection: UpdateSelection | null = null;
let worldReady = false, worldLoading = false;
let snapshotInstance:string|null|undefined;
let selectedId: string | null = null;
let hoveredId: string | null = null;
let serverOffset = 0;
let deathPresented = false;
let cancelledGather = 0;
let gatherRequested = false; // Allow cancellation before the first gathering snapshot arrives.
let cancelledCast = 0;
const hoverPointer = new THREE.Vector2();
let pointerInWorld = false;
let worldZone: ZoneId = 'greenwood';
let zoneHandle: Awaited<ReturnType<typeof createOverworld>> | undefined;
let currentDungeonRoom: ReturnType<typeof dungeonRoomAt>;
let zoneRevision = 0;
const position = new THREE.Vector3(0,0,8);
let rotation = Math.PI;
const keys = new Set<string>();
const heldKeyCodes = new Map<string,string>();
function clearMovementKeys(){keys.clear();heldKeyCodes.clear();}
const combatAnimations = new Map<string,{ability:CombatEvent['ability'];started:number;rotation:number;prepared:boolean;basic:boolean}>();
let lastMove = 0;
let lastSentMove: {x:number,z:number,y?:number} | null = null;
let lastPrimary = 0;
let yaw = .34, pitch = .35, distance = 21, airshipFraming = 0;
const waypointIndicator=createWaypointIndicator($('waypoint-hud'),clearWaypoint);
let isMoving = false;
let sprintSinceMove = false;
let jump = newJump(position.x,position.z);
let jumpRequestedAt = -Infinity;
let climbStopRequested = false;
let previewCharacter: THREE.Group | undefined;
let previewRenderer: THREE.WebGLRenderer | undefined;
let previewScene: THREE.Scene, previewCamera: THREE.PerspectiveCamera;
const previewLanterns:THREE.PointLight[]=[];
let draft: Required<Appearance>;
let previewRotation = 0;
let previewHalfHeight=1.45,previewRadius=1.12,previewCenter=1.22;
const panel = $<HTMLDialogElement>('panel');
const refreshTalentHover = mountTalentHover($('panel-content'));
mountTalentBranches($('panel-content'));
let lastTalentHTML = '';
const customizer = $<HTMLDialogElement>('customizer');
const floatingPanel = (mode = panel.dataset.mode) => mode === 'gear' || mode === 'inventory' || mode === 'talents' || mode === 'inspect' || mode === 'mounts' || mode === 'pets' || mode === 'training' || mode === 'shop' || mode === 'treasure' || mode === 'npc-talk' || mode === 'gold-merchant' || mode === 'arena' || mode === 'instant-combat' || mode === 'referrals';
const mobileOverlayOpen = () => document.body.classList.contains('mobile-controls') && (panel.open || customizer.open || document.body.matches('.mobile-panel-open, .mobile-menu-open'));
let communityUI: ReturnType<typeof mountCommunityUI> | undefined;
let inputActivity: ReturnType<typeof createInputActivity> | undefined;
let editingMobileLayout = false;
const modalOpen = () => worldLoading || editingMobileLayout || specialistNftUI?.isOpen() || (typeof communityUI !== 'undefined' && communityUI?.isOpen()) || mobileOverlayOpen() || entryActive || rosterActive || !player?.characterCreated || panel.open && !floatingPanel() || customizer.open || !!document.querySelector('.wallet-picker[open], .x-advertising-dialog[open]');
const canvas = $<HTMLCanvasElement>('world');
const hotbar = createHotbar({ hud:$('hotbar'), book:$('panel-content'),
 canEdit:()=>!!player?.characterCreated&&onboardingFeatureUnlocked(player,'spells')&&connected&&!entryActive&&!rosterActive&&!customizer.open&&(!panel.open||floatingPanel()||panel.dataset.mode==='spells'),
 rangeTarget:()=>{
  const points=targetPoints(), selected=points.find(p=>p.id===(selectedId||hoveredId));
  const ally=players.find(p=>p.id===selectedId&&p.hp>0&&(p.instanceId??null)===worldInstance&&!isHostilePlayer(player,p));
  if(ally)return {distance:Math.hypot(ally.x-position.x,ally.z-position.z),hostile:false};
  if(selectedId&&(selected?.kind==='npc'||(selected?.kind==='player'||selected?.kind==='companion')&&!isHostileTarget(player,selected,players)))return null;
  const point=chooseTarget(points.filter(p=>isHostileTarget(player,p,players)),isHostileTarget(player,selected,players)?selected?.id??null:null,position);
  return point?{distance:Math.hypot(point.x-position.x,point.z-position.z),hostile:true}:null;
 },
 cast:ability=>act(ability), releaseCast:ability=>cancelCasting(ability), save:slots=>{
  if(!connected)return false;
  if(slots.some((slot,index)=>index%HOTBAR_PAGE_SIZE>=serverHotbarPageSize&&slot!==hotbar.slots[index])){toast('This realm is still updating. Slots 9–10 can be edited after it restarts.');return false;}
  send({type:'setHotbar',page:0,slots:slots.slice(0,serverHotbarPageSize),otherSlots:slots.slice(HOTBAR_PAGE_SIZE,HOTBAR_PAGE_SIZE+serverHotbarPageSize)});return true;
 }, notify:message=>toast(message),
});
const scene = new THREE.Scene();
const groundWaypoint = createGroundWaypoint(scene, (x,z)=>surfaceHeight(x,z,!!worldInstance));
const combatCompanions = createCombatCompanions(scene, (x,z)=>surfaceHeight(x,z,!!worldInstance));
const petFollowers = createPetFollowers(scene, (x,z)=>surfaceHeight(x,z,!!worldInstance), (from,to)=>canTraverse(from,to,colliders,currentWorldBounds()));
scene.background = new THREE.Color('#a7cfd1');
scene.fog = new THREE.Fog('#b1d2c5', 52, 150);
const camera = new THREE.PerspectiveCamera(52, innerWidth/innerHeight, .1, graphics.renderDistance + 80);
let renderer: THREE.WebGLRenderer;
try { renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'}); }
catch { $('loading').innerHTML = '<h2>Your world needs WebGL</h2><p>Enable hardware acceleration or open Mossvale in a WebGL-capable browser.</p>'; throw new Error('WebGL is unavailable'); }
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6)*graphics.resolution);
renderer.shadowMap.enabled = graphics.shadows !== 'off';
renderer.localClippingEnabled = true;
renderer.shadowMap.type = graphics.shadows === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.17;
const hemisphere = new THREE.HemisphereLight('#ecf0d0','#6d8264',1.8);scene.add(hemisphere);
const sun = new THREE.DirectionalLight('#fff0d2',2.5);
sun.position.set(-20,34,18);
sun.castShadow = true;
sun.shadow.mapSize.set(graphics.shadows === 'high' ? 2048 : 1024, graphics.shadows === 'high' ? 2048 : 1024);
Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:100});
sun.shadow.bias = -.0003;
sun.shadow.normalBias = .035;
scene.add(sun);
const dayNight=createDayNightCycle(scene,hemisphere,sun);
const avatar = makeCharacter(appearance); scene.add(avatar); avatar.position.copy(position); avatar.rotation.y=rotation;
let localAvatar = avatar;
let npc = makeCharacter({...defaultAppearance,hair:'#d7d4b8',hairStyle:'long',outfit:'#607078',accent:'#e5ba71',className:'Mage'});
npc.position.set(0,0,0); npc.rotation.y=.15; scene.add(npc);
let npcLabel:HTMLElement = label('npc','Rowan','Village keeper');
npcLabel.insertAdjacentHTML('afterbegin','<span class="npc-quest">!</span>');
const npcViews = new Map<string,{mesh:THREE.Group,label:HTMLElement}>();
npcViews.set('rowan',{mesh:npc,label:npcLabel});
const ownLabel = label('you',playerName,'');
const mountViews = new Map<string,{id:MountId,mesh:THREE.Group}>();
const remote = new Map<string,{mesh:THREE.Group,label:HTMLElement,appearance:string,motion:ReturnType<typeof createRemoteMotion>}>();
const enemyMeshes = new Map<string,{mesh:THREE.Group,label:HTMLElement,height:number,model:string}>();
const nodeMeshes = new Map<string,THREE.Group>();
const lootMeshes = new Map<string,{mesh:THREE.Group,label:HTMLElement,height:number}>();
function projectileOrigin(id:string,ability:CombatEvent['ability'],out:THREE.Vector3):boolean {
 const mesh=id===playerId?localAvatar:remote.get(id)?.mesh,rig=mesh?.userData.rig;
 if(!rig||rig.className!==SPELLS[ability].className)return false;
 if(rig.bow){
  // Shaft center at full draw. The string can already be springing back on this frame.
  out.set(0,0,-.31-.38+.42);rig.bow.pivot.localToWorld(out);return true;
 }
 if(SPELLS[ability].className==='Mage'||SPELLS[ability].className==='Cleric'){
  rig.leftHand.getWorldPosition(out);return true;
 }
 return false;
}
const combatEffects = createCombatEffects(scene,id=>{
 const companion=id.startsWith('companion:')?combatCompanions.get(id.slice(10)):undefined;if(companion&&visibleInDungeonRoom(companion.position))return {x:companion.position.x,z:companion.position.z,y:companion.position.y+.8};
 const friendly=id===playerId?localAvatar:remote.get(id)?.mesh;if(friendly&&visibleInDungeonRoom(friendly.position))return {x:friendly.position.x,z:friendly.position.z,y:friendly.position.y+1.2};
 const mesh=enemyMeshes.get(id)?.mesh,enemy=enemies.find(e=>e.id===id);if(!mesh||!enemy||!visibleInDungeonRoom(enemy))return;
 return {x:mesh.position.x,z:mesh.position.z,y:mesh.position.y+((enemyMeshes.get(id)?.height??MONSTERS[enemy.kind].height)*.55)};
},(x,z)=>surfaceHeight(x,z,!!worldInstance),projectileOrigin);
const monsterEffects=createMonsterEffects(scene,(x,z,instance)=>surfaceHeight(x,z,instance),enemy=>enemyMeshes.get(enemy.id)?.height);
const damageNumbers=createDamageNumbers($('labels'),camera,event=>{
 const enemy=event.targetKind==='enemy'?enemies.find(e=>e.id===event.targetId):undefined;
 const companion=event.targetId.startsWith('companion:')?combatCompanions.get(event.targetId.slice(10)):undefined;
 const mesh=companion??(event.targetKind==='enemy'?enemyMeshes.get(event.targetId)?.mesh:event.targetId===playerId?localAvatar:remote.get(event.targetId)?.mesh);
 if(!mesh)return;
 return {x:mesh.position.x,y:mesh.position.y+(enemy?(enemyMeshes.get(enemy.id)?.height??MONSTERS[enemy.kind].height)+.55:companion?2:3.6),z:mesh.position.z};
});
const unitFrames=mountUnitFrames($('unit-frames'),{
 onPlayer:()=>toggleCharacter(),
 onTargetContext:event=>{
  const other=players.find(p=>p.id===selectedId);
  if(other&&isHostilePlayer(player,other))setAutoAttack(autoAttackTarget===other.id?null:other.id);
  else if(isHostileTarget(player,{id:selectedId??'',kind:'companion'},players))setAutoAttack(autoAttackTarget===selectedId?null:selectedId);
  else if(other&&other.id!==playerId)openPlayerMenu(other,event.clientX,event.clientY);
  else if(other)toggleCharacter();else if(enemies.some(enemy=>enemy.id===selectedId&&enemy.alive))setAutoAttack(autoAttackTarget===selectedId?null:selectedId);else interactNearby();
 },
 onTargetOfTarget:()=>{const enemy=enemies.find(e=>e.id===selectedId);if(enemy?.targetId){selectedId=enemy.targetId;hoveredId=null;canvas.focus();}},
});
let unitPortraits:ReturnType<typeof createUnitPortraits>|undefined,unitPortraitsFailed=false,lastUnitFrame=0;
function clearUnitFrames(){unitFrames.clear();unitPortraits?.dispose();unitPortraits=undefined;unitPortraitsFailed=false;lastUnitFrame=0;}
function updateUnitFrames(now:number){
 if(!player||!connected||!worldReady||rosterActive||entryActive){if(unitPortraits||!$('unit-frames').hidden)clearUnitFrames();return;}
 if(now-lastUnitFrame<80)return;lastUnitFrame=now;
 const serverNow=Date.now()+serverOffset;
 const playerData=(p:Player,disposition:UnitFrameData['disposition']):UnitFrameData=>({id:p.id,name:p.name,playerName:true,className:p.appearance.className,role:p.gm?.tagHidden?undefined:p.role,level:p.level,hp:p.hp,maxHp:p.maxHp,subtitle:p.hp<=0?'Defeated':p.id===playerId&&(p.combatTalents?.twinshotReadyUntil??0)>serverNow?'Double Tap ready · Instant':p.id===playerId&&(p.combatTalents?.heatUntil??0)>serverNow?`Heat ${p.combatTalents!.heat}/10 · +${p.combatTalents!.heat*3}% speed`:playerTitle(p)?`<${playerTitle(p)}>`:p.appearance.className,disposition,
  effects:p.hp<=0?undefined:p.id!==playerId?damageOverTimeLabels(p.damageOverTime,playerId,serverNow,p.chilledUntil):[(p.heatproofUntil??0)>serverNow?`Heatproof · −20% fire damage · ${Math.ceil((p.heatproofUntil!-serverNow)/1000)}s`:null,p.shield&&p.shield.amount>0&&p.shield.endsAt>serverNow?`Shield · ${Math.ceil(p.shield.amount).toLocaleString()} absorption · ${Math.ceil((p.shield.endsAt-serverNow)/1000)}s`:null,(p.combatTalents?.arrowstormUntil??0)>serverNow&&p.combatTalents?.arrowstormStacks?`Arrowstorm ${p.combatTalents.arrowstormStacks}/5`:null,p.combatTalents?.bondReady?'Everlasting Bond · next basic empowered':null,p.combatTalents?.powerfulThrowReady?'Shield recovered · Powerful Throw charges in 1s':null,(p.combatTalents?.guardUntil??0)>serverNow?'Guard · Reflecting':null,(p.combatTalents?.guardianUntil??0)>serverNow?'Adamant Guardian · −40% damage taken':null,(p.combatTalents?.blessedArmorUntil??0)>serverNow?`Blessed Armor · +${p.combatTalents?.blessedArmorDefense} defense · ${Math.ceil((p.combatTalents!.blessedArmorUntil!-serverNow)/1000)}s`:null,(p.combatTalents?.courageousCallUntil??0)>serverNow?'Courageous Call · +20% damage':null,(p.combatTalents?.lordOfBattleUntil??0)>serverNow?'Lord of Battle':null,(p.combatTalents?.movementSpeedUntil??0)>serverNow?'Lighspeed · +50% movement speed':null,...(p.combatTalents?.edicts??[]).filter(edict=>edict.until>serverNow).map(edict=>({light:'Edict of Light',protection:'Edict of Protection',harm:'Edict of Harm',dawn:'Edict of the Dawn',titan:"Titan’s Edict"}[edict.kind]))].filter(Boolean).join(' · ')||undefined,
  casting:p.casting&&p.hp>0&&(p.id!==playerId||p.casting.startedAt!==cancelledCast)&&p.casting.endsAt>serverNow?{label:castLabel(p.casting),progress:p.casting.channel?1-(serverNow-p.casting.startedAt)/(p.casting.endsAt-p.casting.startedAt):(serverNow-p.casting.startedAt)/(p.casting.endsAt-p.casting.startedAt)}:undefined});
 const portrait=(p:Player):UnitPortraitSubject=>({id:p.id,kind:'player',appearance:p.appearance,equipment:p.equipment});
 const selectedLoot=loot.find(drop=>drop.id===selectedId);
 const enemy=selectedLoot?undefined:enemies.find(e=>e.id===selectedId);
 const other=players.find(p=>p.id===selectedId);
 const companionOwner=combatCompanionOwner(players,selectedId),companion=companionOwner?.combatCompanion;
 const resident=!worldInstance?[...NPCS,...VILLAGE_NPCS,...TRAINER_NPCS,GOLD_MERCHANT,HEARTHLING_NPC,...CITY_SERVICE_NPCS].find(n=>n.id===selectedId):undefined;
 const citizen=!worldInstance?zoneHandle?.citizens?.get(selectedId||''):undefined;
 let target:UnitFrameData|null=null,targetPortrait:UnitPortraitSubject|undefined;
 if(selectedLoot&&!selectedLoot.sourceObjectId&&!selectedLoot.instantCombatRound){
  const source=enemies.find(e=>e.id===selectedLoot.enemyId);
  target={id:selectedLoot.id,name:selectedLoot.name,level:source?.level,hp:0,maxHp:source?.maxHp??MONSTERS[selectedLoot.kind].hp,subtitle:'Defeated',disposition:'hostile',boss:source?.worldBoss};
  targetPortrait={id:selectedLoot.id,kind:'enemy',enemyKind:selectedLoot.kind,model:selectedLoot.model};
 }else if(enemy){
  const attack=enemy.alive&&enemy.attack&&!enemy.attack.basic&&serverNow<enemy.attack.impactAt?enemy.attack:null;
  target={id:enemy.id,name:enemy.name,level:enemy.level,hp:enemy.hp,maxHp:enemy.maxHp,disposition:'hostile',boss:enemy.worldBoss,
   effects:enemy.alive?damageOverTimeLabels(enemy.damageOverTime,playerId,serverNow,enemy.chilledUntil):undefined,
   subtitle:!enemy.alive?'Defeated':player.autoAttack?.targetId===enemy.id?(Math.hypot(enemy.x-position.x,enemy.z-position.z)>AUTO_ATTACKS[player.appearance.className].range?(keys.has('attack-approach')?'Auto attack · approaching':'Auto attack · move closer'):player.casting?'Auto attack · after spell':`Auto attacking · ${bindingLabel('t')} to stop`):enemy.kind==='training-dummy'?'Practice spells and attacks · Cannot die':enemy.worldBoss?(enemy.berserk?'World boss · Berserk':'World boss'):monsterDanger(enemy.level,player.level)==='dangerous'?'Dangerous foe':'Right-click to auto attack',
   casting:attack?{label:attack.name||monsterAttackNames[attack.style]||'Attack',progress:(serverNow-attack.startedAt)/(attack.impactAt-attack.startedAt)}:undefined};
  targetPortrait={id:enemy.id,kind:'enemy',enemyKind:enemy.kind,model:enemy.model};
 }else if(companion&&companionOwner){
  const hostile=isHostileTarget(player,{id:selectedId!,kind:'companion'},players);
  target={id:selectedId!,name:MONSTERS[companion.kind].name,level:companion.level,hp:companion.hp,maxHp:companion.maxHp,subtitle:`${companionOwner.name}’s companion${hostile?` · ${bindingLabel('t')} to attack`:''}`,disposition:hostile?'hostile':'friendly'};
  targetPortrait={id:selectedId!,kind:'enemy',enemyKind:companion.kind};
 }else if(other){const hostile=isHostilePlayer(player,other);target=playerData(other,hostile?'hostile':'friendly');if(other.arenaMatchId||hostile)target.subtitle=`${arenaPlayerLabel(other)}${hostile?` · ${bindingLabel('t')} to attack`:''}`;targetPortrait=portrait(other);}
 else if(resident){
  const view=npcViews.get(resident.id);target={id:resident.id,name:resident.name,subtitle:'title' in resident?resident.title:resident.role==='warden'?'Local quests':resident.role==='merchant'?'Vendor':'Healer',disposition:'friendly'};
  if(view)targetPortrait={id:resident.id,kind:'npc',source:view.mesh};
 }else if(citizen?.mesh.visible){
  target={id:selectedId!,name:citizen.name,subtitle:citizen.title,disposition:'friendly'};
  targetPortrait={id:selectedId!,kind:'npc',source:citizen.mesh};
 }
 const focus=enemy?.alive&&enemy.targetId?players.find(p=>p.id===enemy.targetId):undefined;
 unitFrames.update(playerData(player,'self'),target,focus?playerData(focus,'friendly'):null);
 if(!unitPortraitsFailed){try{unitPortraits??=createUnitPortraits(unitFrames.canvases);unitPortraits.update({player:portrait(player),target:targetPortrait,focus:focus?portrait(focus):undefined});}catch{unitPortraits?.dispose();unitPortraits=undefined;unitPortraitsFailed=true;console.warn('Unit portraits could not load.');}}
}
const raycaster = new THREE.Raycaster();
const targetRing = new THREE.Mesh(new THREE.RingGeometry(1.32, 1.48, 4), new THREE.MeshBasicMaterial({color:'#ffe7a0',side:THREE.DoubleSide,transparent:true,opacity:.95,depthWrite:false}));
targetRing.rotation.set(-Math.PI/2,0,Math.PI/4); targetRing.position.y=.1; targetRing.visible=false; scene.add(targetRing);
let thrownShieldMarker:THREE.Object3D|undefined;
const thrownShieldLabel=label('thrown-shield','Your shield','Walk over it · Next throw charges in 1s');thrownShieldLabel.hidden=true;
function updateThrownShield(now:number){
 const shield=connected&&worldReady&&!entryActive&&!rosterActive&&player&&player.hp>0&&(player.instanceId??null)===worldInstance?player.combatTalents?.thrownShield:undefined;
 const visible=!!shield&&shield.expiresAt>now;
 if(visible&&!thrownShieldMarker){
  thrownShieldMarker=localAvatar.getObjectByName('shield')?.clone(true);
  if(thrownShieldMarker){thrownShieldMarker.scale.setScalar(1.5);scene.add(thrownShieldMarker);}
 }
 thrownShieldLabel.hidden=!visible;
 if(thrownShieldMarker){thrownShieldMarker.visible=visible;if(visible){thrownShieldMarker.position.set(shield.x,surfaceHeight(shield.x,shield.z,!!worldInstance)+.8+Math.sin(now/300)*.1,shield.z);thrownShieldMarker.rotation.set(0,now/700,0);}}
 if(visible)placeLabel(thrownShieldLabel,shield.x,1.6,shield.z,42);
}
const ambientEffects=createAmbientEffects(scene);
window.addEventListener('pagehide',event=>{if(!event.persisted){ambientEffects.dispose();dayNight.dispose();zoneHandle?.dispose();}});
let colliders: {x:number,z:number,r:number,halfWidth?:number,halfDepth?:number}[]=[];
let updateWorld:(time:number,observer?:THREE.Vector3,camera?:THREE.Camera,daylight?:number)=>void=()=>{};
let zoneMarkers: {el:HTMLElement,x:number,z:number,id:string}[] = [];
let storyWorld: Awaited<ReturnType<typeof createStoryWorld>> | undefined;
let storyEncounter: import('./shared').StoryEncounterState | null = null;

function label(id:string,name:string,subtitle:string) {
 const el=document.createElement('div');el.id=`label-${id}`;el.className='world-label';el.ariaHidden='true';
 const strong=document.createElement('strong');strong.textContent=name;el.append(strong);
 if(subtitle){const small=document.createElement('small');small.textContent=subtitle;el.append(small);}
 $('labels').append(el);return el;
}
function monsterDanger(level:number,playerLevel:number){
 const gap=level-playerLevel;return gap<=-3?'easy':gap<=2?'equal':gap<=4?'tough':'dangerous';
}
function updatePlayerTitle(el:HTMLElement,p?:Player){
 const title=p&&playerTitle(p);let badge=el.querySelector<HTMLElement>('.player-title');
 if(!title){badge?.remove();return;}
 if(!badge){badge=document.createElement('span');badge.className='player-title';const subtitle=el.querySelector('small');if(subtitle)subtitle.before(badge);else el.append(badge);}
 badge.textContent=`<${title}>`;
}
function playerNameplate(p:Player){
 const el=label(p.id,p.name,`Level ${p.level}`);el.classList.add('player-nameplate');el.dataset.playerId=p.id;el.ariaHidden='false';el.tabIndex=0;el.role='button';el.ariaHasPopup='menu';
 const health=document.createElement('span'),fill=document.createElement('i');health.className='player-nameplate-health';health.append(fill);el.append(health);
 updatePlayerNameplate(el,p);return el;
}
function updatePlayerNameplate(el:HTMLElement,p:Player){
 const member=!!party?.members.some(member=>member.id===p.id),leader=member&&party?.leaderId===p.id,hostile=isHostilePlayer(player,p);
 el.ariaHasPopup=hostile?'false':'menu';el.classList.toggle('is-party',member);el.classList.toggle('is-duel',hostile);el.classList.toggle('is-defeated',p.hp<=0||!!p.arenaEliminated);el.dataset.calling=p.appearance.className;
 el.dataset.playerName=p.name;el.querySelector('strong')!.textContent=p.name;updatePlayerTitle(el,p);
 if(p.role==='gm'||el.dataset.gm==='true')updateGmNameplate(el,p.gm?.tagHidden?undefined:p.role);
 el.querySelector('small')!.textContent=`${leader?'♛ ':''}Level ${p.level} ${p.appearance.className}${p.arenaMatchId||hostile?` · ${arenaPlayerLabel(p)}`:member?leader?' · Leader':' · Party':''}${p.hp<=0?' · Defeated':''}`;
 el.querySelector<HTMLElement>('.player-nameplate-health i')!.style.width=`${Math.max(0,Math.min(100,p.maxHp>0?p.hp/p.maxHp*100:0))}%`;
 el.title=`${p.name}${playerTitle(p)?` <${playerTitle(p)}>`:''} · Level ${p.level} ${p.appearance.className} · ${Math.max(0,p.hp)} / ${p.maxHp} health${p.arenaMatchId||hostile?` · ${arenaPlayerLabel(p)}`:''}${member?' · Your party':''}`;
}
function toast(text:string,kind='info') { const el=document.createElement('div');el.className=`toast ${kind}`;el.textContent=text;$('toasts').append(el);setTimeout(()=>el.remove(),document.body.classList.contains('mobile-controls')?2800:4200);while($('toasts').children.length>(document.body.classList.contains('mobile-controls')?1:3))$('toasts').firstElementChild?.remove(); }
function chatMessage(text:string,name?:string,whisper?:{id:string;name:string;incoming:boolean;role?:PlayerRole},role?:PlayerRole,channel:ChatChannel=whisper?'whisper':name?'world':'system',report?:{targetId:string;name:string;messageId?:string},sourcePlayerId=report?.targetId??whisper?.id,quiet=false) {
 const p=document.createElement('p'),messageId=report?.messageId;
 if(name||whisper||sourcePlayerId)p.setAttribute('translate','no');
 if(sourcePlayerId)p.dataset.chatPlayerId=sourcePlayerId;
 const badge=gmBadge(whisper?.role??role);if(badge)p.append(badge);
 if(whisper){p.className='whisper-message';const reply=document.createElement('button');reply.type='button';reply.className='whisper-reply';reply.textContent=`${whisper.incoming?'From':'To'} ${whisper.name}: `;reply.title=`Whisper to ${whisper.name}`;reply.onclick=()=>openWhisper(whisper);p.append(reply);}
 else if(name){const strong=document.createElement('strong');strong.textContent=name+': ';p.append(strong);}else p.className='system-message';
 const content=document.createElement('bdi'),body=document.createTextNode(text);content.append(body);p.append(content);const previewText=p.textContent||text;
 if(report&&report.targetId!==playerId){const button=document.createElement('button');button.type='button';button.className='chat-report';button.textContent='Report';button.setAttribute('aria-label',`Report message from ${report.name}`);button.onclick=()=>communityUI?.report(report.targetId,report.name,report.messageId);p.append(button);}
 const log=$(`chat-log-${channel}`),visible=channel===chatChannel&&!$('chat').classList.contains('collapsed'),atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<24;
 if(visible)rememberChatScroll(true);
 log.append(p);while(log.children.length>40)log.firstElementChild?.remove();
 if(visible)restoreChatScroll();else if(!mobileChat()&&atBottom)log.scrollTop=log.scrollHeight;
 if(quiet)return;
 chatPreviewMessages.push({channel,text:name?text:previewText,name,playerId:sourcePlayerId,messageId});if(chatPreviewMessages.length>6)chatPreviewMessages.shift();updateChatPreview();
 if(messageId&&sourcePlayerId!==playerId&&(!whisper||whisper.incoming))chatTranslation.add(messageId,p,body,value=>{const preview=chatPreviewMessages.find(message=>message.messageId===messageId);if(preview)preview.text=name?value:previewText.slice(0,previewText.length-text.length)+value;updateChatPreview();});
 if(channel!==chatChannel||$('chat').classList.contains('collapsed')||mobileChat()&&!atBottom){const tab=$(`chat-tab-${channel}`);tab.dataset.unread=String(Math.min(99,Number(tab.dataset.unread||0)+1));updateChatUnread();}
}
function eraseCommunityMessages(playerIds:string[]){
 clearChatBubbles(playerIds);
 const erased=new Set(playerIds);
 for(const channel of Object.keys(chatDrafts) as ChatChannel[]){
  const log=$(`chat-log-${channel}`);
  for(const child of [...log.children])if(erased.has((child as HTMLElement).dataset.chatPlayerId||''))child.remove();
  if(!log.children.length)$(`chat-tab-${channel}`).dataset.unread='0';
  const saved=chatScroll.get(channel);if(saved?.anchor&&!log.contains(saved.anchor))chatScroll.delete(channel);
 }
 chatPreviewMessages.splice(0,chatPreviewMessages.length,...chatPreviewMessages.filter(message=>!erased.has(message.playerId||'')));
 if(whisperTarget&&erased.has(whisperTarget.id)){whisperTarget=null;chatDrafts.whisper='';if(chatChannel==='whisper')$<HTMLInputElement>('chat-input').value='';updateChatRecipient();}
 updateChatPreview();updateChatUnread();
}
let lootResults=false,lootQueueLimit=1,merchantSales=false,serverHotbarPageSize=8;
function send(message:ClientMessage){
 if(player?.travel?.driverId&&['move','jump','attack','gather','sit','stand','cast'].includes(message.type)){if(message.type!=='move')toast('Leave the mount before doing that.');return;}
 if(socket?.readyState===WebSocket.OPEN&&connected){socket.send(JSON.stringify(message.type==='move'?{...message,sprint:!gmFlying()&&sprintSinceMove,...(gmFlying()?{y:jump.y}:{})}:message));if(message.type==='move'){sprintSinceMove=false;lastSentMove={x:message.x,z:message.z,y:jump.y};}
  if(message.type==='gather')gatherRequested=true;
  if(player?.travel&&(message.type==='attack'||message.type==='gather'||message.type==='mount'&&message.mount===null))player.travel.mount=null;
  return true;
 }
 else if(message.type!=='move')toast('Reconnecting to the realm. Please wait a moment.');
 return false;
}
function saveUpdateSelection():boolean {
 if(shutdownWarningActive||accountFlowPending||changingRealm||creatingCharacter||characterDeletion?.pending)return false;
 const state:UpdateSelection={resume:!entryActive&&!sessionDisplaced,selectedId:player?.id||selectedCharacterId||updateSelection?.selectedId||null,realmId:activeRealmId};
 if(customizer.open&&rosterActive)state.draft={name:$<HTMLInputElement>('character-name').value,appearance:draft};
 else if(updateSelection?.draft)state.draft=updateSelection.draft;
 try{sessionStorage.setItem('mossvale-update-selection',JSON.stringify(state));}catch{return false;}
 return true;
}
function takeUpdateSelection():UpdateSelection|null {
 try{
  const raw=sessionStorage.getItem('mossvale-update-selection');sessionStorage.removeItem('mossvale-update-selection');
  const state=JSON.parse(raw||'null');
  if(!state||typeof state.resume!=='boolean'||!(state.selectedId===null||typeof state.selectedId==='string'&&state.selectedId.length<=128))return null;
  return {resume:state.resume,selectedId:state.selectedId,...(realmIdValid(state.realmId)?{realmId:state.realmId}:{}),...(state.draft&&typeof state.draft.name==='string'&&state.draft.name.length<=100&&appearanceValid(state.draft.appearance)?{draft:{name:state.draft.name,appearance:normalizeAppearance(state.draft.appearance)}}:{})};
 }catch{return null;}
}
function snapWorldPosition(x:number,z:number,instanceId:string|null,state?:JumpState,preserveView=false){
 sprintSinceMove=false;
 climbStopRequested=false;
 lastSentMove={x,z};
 jump=state?{...state}:newJump(x,z,!!instanceId);jumpRequestedAt=-Infinity;
 const offset=position.clone().set(x,jump.y,z).sub(position);
 position.set(x,jump.y,z);
 if(preserveView){
  // Corrections move the rider and camera together without dropping saddle height.
  localAvatar.position.add(offset);cameraTarget.add(offset);
 }else{
  const swimming=jump.grounded&&!player?.zeppelin&&!instanceId&&waterAt(x,z);
  localAvatar.position.copy(position);cameraTarget.set(x,swimming?.6:position.y+1.2,z);
 }
 if(worldReady&&instanceId===renderedInstance)updateDungeonRoomView();
}
const storyNpc = (id:string) => [...NPCS,...VILLAGE_NPCS,...TRAINER_NPCS].find(npc=>npc.id===id);
const storyNpcName = (id:string) => storyNpc(id)?.name || 'Town keeper';
const storyQuestUI=createStoryQuestUI({getPlayer:()=>player??null,send,openPanel,closePanel,content:()=>$('panel-content'),npcName:storyNpcName,showNpcPortrait,findNpc:(id)=>{
 const quest=storyQuestById(id),progress=quest&&player?.storyQuests?.active[quest.id];
 if(quest&&progress){trackedStoryQuestId=quest.id;trackedContractId='';lastHUD='';updateHUD();}
 const objective=quest&&progress?quest.objectives.find((entry,index)=>progress[index]<entry.count&&(entry.requires??[]).every(required=>{const before=quest.objectives.findIndex(step=>step.id===required);return before>=0&&progress[before]>=quest.objectives[before].count;})):undefined;
 if(objective){
  if(objective.scope==='dungeon'){
   const entry=getDungeon(objective.dungeonId??objective.targets[0]);
   if(worldInstance&&dungeon&&dungeon.kind===entry?.id){
    const object=objective.targets.includes('story-foundry-ledger')?dungeon.objects.find(object=>object.id==='crossing-east-branch-cache'):undefined;
    if(object){closePanel();setWaypoint({...object,label:objective.label});}else toast('Follow the chamber objectives and room portals.');return;
   }
   if(!worldInstance&&entry){closePanel();setWaypoint({...entry.entrance,label:entry.name});return;}
  }
  if(worldInstance){toast('Return to the open world to track this destination.');return;}
  const matches=(point:{id:string;kind:string;zone:ZoneId;x:number;z:number;siteId?:string})=>(objective.targets.includes('*')||objective.targets.includes(point.kind))
   &&(!objective.zone||point.zone===objective.zone)&&(!objective.regionId||surfaceAt(point.x,point.z).regionId===objective.regionId)
   &&(!objective.siteId||point.siteId===objective.siteId)&&(!objective.spawnIds||objective.spawnIds.includes(point.id));
  if(objective.kind==='kill'||objective.kind==='gather'){
   const spawns=objective.kind==='kill'?[...STORY_ENEMIES,...OVERWORLD_SPAWNS].filter(point=>matches(point)&&(!objective.minTargetLevel||('level' in point&&point.level?point.level:monsterSpawnLevel(point,surfaceAt(point.x,point.z).regionId))>=objective.minTargetLevel)):[];
   const ids=new Set(spawns.map(point=>point.id));
   const available=objective.kind==='kill'?enemies.filter(enemy=>!enemy.instanceId&&enemy.alive&&ids.has(enemy.id)):nodes.filter(node=>!node.instanceId&&node.available&&matches(node));
   const fallback=objective.kind==='kill'?spawns:WORLD_GATHERING_NODES.filter(matches);
   const point=(available.length?available:fallback).sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
   if(point){closePanel();setWaypoint({...point,label:objective.label});}else toast('No objective is available yet. Try tracking again shortly.');return;
  }
  id=objective.targets[0];
  const role=id==='banker'||id==='auctioneer'?CITY_SERVICE_NPCS.find(npc=>npc.role===id&&npc.zone===(objective.zone??worldZone))
   :id==='class-trainer'?TRAINER_NPCS.find(npc=>npc.className===player?.appearance.className&&npc.zone===(objective.zone??worldZone)):undefined;
  if(role)id=role.id;
 }
 if(quest&&progress&&!objective)id=quest.turnInNpcId??quest.npcId;
 if(worldInstance){toast('Return to the open world to track this destination.');return;}
 const encounter=STORY_ENCOUNTERS.find(entry=>entry.id===id);if(encounter)id=encounter.objectId;
 const destination=STORY_OBJECTS.find(object=>object.id===id)||STORY_ENEMIES.find(enemy=>enemy.id===id),entry=getDungeon(id);
 const point=targetPoints().find(point=>point.id===id);
 if(storyEncounter?.objectId===id){closePanel();setWaypoint({...storyEncounter,label:destination?.name||'Quest traveler'});}
 else if(point){closePanel();setWaypoint(point);}
 else if(destination){closePanel();setWaypoint({x:destination.x,z:destination.z,id:destination.id,name:destination.name||'Quest objective',label:'Quest objective'});}
 else if(entry){closePanel();setWaypoint({...entry.entrance,id:`dungeon-entrance-${entry.id}`,name:entry.name,label:entry.name});}
 else toast('Follow the location named in your journal.');
}});
async function connect(forceRefresh = false){
 if(entryActive)return;
 stopSessionRenewal?.();stopSessionRenewal=undefined;
 performanceHud.reset();
 if(typeof inputActivity!=='undefined')inputActivity?.reset();
 const revision=++connectionRevision;
 socket?.close();connected=false;clearMovementKeys();
 moderationNotice=null;realmAvailable=false;updateRosterAvailability();clearTimeout(reconnectTimer);
 const connectionRealm=activeRealmId;
 const report=(phase:string,code:number,reason:string)=>console.info('Mossvale connection',{
  realm:connectionRealm,build:document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src')?.split('?')[0]||'development',phase,code,reason:reason.slice(0,160),
 });
 $('connection').textContent='Connecting…';$('roster-retry').hidden=true;
 let accessToken:string|undefined;
 let tokenTimer:ReturnType<typeof setTimeout>|undefined;
 try { accessToken=await Promise.race([getAccessToken(forceRefresh),new Promise<never>((_,reject)=>{
  tokenTimer=setTimeout(()=>reject(new Error('Sign-in timed out. Check your connection, then sign in again.')),20000);
 })]); } catch(error) { if(revision===connectionRevision){report('token',0,'Token request failed or timed out');showEntry(error instanceof Error?error.message:'Please sign in again.');}return; }
 finally{clearTimeout(tokenTimer);}
 if(entryActive||revision!==connectionRevision)return;
 let welcomed=false,retiring=false;
 const connection=new WebSocket(realmAddress(connectionRealm,'/socket'));
 socket=connection;
 let renewing=false,renewalStopped=false,closed=false,phase='open',phaseStarted=performance.now(),lastMessage=phaseStarted;
 let silenceTimer:ReturnType<typeof setTimeout>|undefined;
 const current=()=>!renewalStopped&&!entryActive&&socket===connection&&revision===connectionRevision&&connection.readyState===WebSocket.OPEN;
 const clientCheck=createClientCheck({active:()=>current()&&!rosterActive&&!worldLoading&&!!player?.characterCreated,
  send:response=>{if(current())connection.send(JSON.stringify({type:'clientCheck',...response}));}});
 async function renewSession(forceRefresh=false){
  if(renewing||!accessToken||!welcomed||!current())return;
  renewing=true;
  try{
   const token=await refreshSessionAccessToken(forceRefresh);
   if(token&&token!==accessToken&&current()){connection.send(JSON.stringify({type:'refreshSession',accessToken:token}));accessToken=token;}
  }finally{renewing=false;}
 }
 function closeForTimeout(reason:string){onClose({code:4002,reason});connection.close(4002,'Connection watchdog timeout');}
 function checkConnection(resumed=false){
  if(renewalStopped||entryActive||socket!==connection||revision!==connectionRevision||document.visibilityState==='hidden')return;
  // Give a resumed WebView time to deliver its queued messages before replacing its socket.
  if(resumed&&welcomed)lastMessage=performance.now();
  if(performance.now()-(welcomed?lastMessage:phaseStarted)>=20000){
   if(!welcomed){closeForTimeout(`${phase} timed out`);return;}
   // A stalled visible tab can run this timer before its queued socket messages.
   if(silenceTimer===undefined)silenceTimer=setTimeout(()=>{
    silenceTimer=undefined;
    if(current()&&document.visibilityState!=='hidden'&&performance.now()-lastMessage>=20000)closeForTimeout(`${phase} timed out`);
   },1000);
  }
  if(welcomed&&current())try{connection.send(JSON.stringify({type:'ping',id:0}));}catch{closeForTimeout('Connection check failed');}
 }
 const onVisible=()=>{if(document.visibilityState==='visible'){checkConnection(true);void renewSession();}};
 const renewalTimer=accessToken?setInterval(()=>void renewSession(),15000):undefined;
 const connectionTimer=setInterval(checkConnection,5000);
 document.addEventListener('visibilitychange',onVisible);
 const stopRenewal=()=>{renewalStopped=true;clientCheck.dispose();clearInterval(renewalTimer);clearInterval(connectionTimer);clearTimeout(silenceTimer);document.removeEventListener('visibilitychange',onVisible);};
 stopSessionRenewal=stopRenewal;
 connection.addEventListener('open',()=>{if(!current()){connection.close();return;}phase='welcome';phaseStarted=performance.now();connection.send(JSON.stringify({type:'join',realmId:connectionRealm,...(readLocal('mossvale-referral-code')?{referralCode:readLocal('mossvale-referral-code')}:{}),...(isNativeApp()?{nativePlatform:nativeClient()?.platform==='google'?'android':'ios'}:{}),...(accessToken?{accessToken}:{token:readLocal(guestSessionKey)||undefined}),...(enteredCharacterId?{characterId:enteredCharacterId}:{})}));});
 connection.addEventListener('message',event=>{
  if(!current())return;
  let msg:ServerMessage;try{msg=JSON.parse(event.data);}catch{return;}
  // Another realm can still serve the retired world during a staggered release.
  const destinationInstance=msg.type==='welcome'?msg.player.instanceId:msg.type==='snapshot'||msg.type==='correction'?msg.instanceId:null;
  if(typeof destinationInstance==='string'&&destinationInstance.startsWith('atlas:')){
   showEntry('This realm is still updating. Reconnect in a few minutes to resume at your saved position.',true);return;
  }
  lastMessage=performance.now();
  specialistNftUI?.handle(msg);if(msg.type==='storeWalletChallenge'&&specialistNftUI?.isOpen())return;
  if(msg.type==='referrals'){referralUI.update(msg);if(msg.programEnabled&&(msg.referredBy||!msg.canBind)){try{localStorage.removeItem('mossvale-referral-code');}catch{}}if(msg.error)toast(msg.error);
  } else if(msg.type==='mountInvitation'){receiveMountInvitation(msg.invitation);
  } else if(msg.type==='pong'){performanceHud.pong(msg.id,performance.now());
  } else if(msg.type==='dungeonLeaderboard'){receiveDungeonLeaderboard(msg);
  } else if(msg.type==='chatTranslation'){chatTranslation.receive(msg);
  } else if(msg.type==='community'){communityUI?.updateRules(msg.accepted);
  } else if(msg.type==='communityErase'){
   eraseCommunityMessages(msg.playerIds);communityUI?.close();playerMenu.close();
   if(inspectedPlayerId&&msg.playerIds.includes(inspectedPlayerId)&&panel.open&&panel.dataset.mode==='inspect')closePanel();
  } else if(msg.type==='reportResult'){communityUI?.result(msg.success,msg.text);
  } else if(msg.type==='reports'){communityUI?.updateReports(msg.reports);
  } else if(msg.type==='clientCheck'){
   clientCheck.challenge(msg.nonce);
  } else if(msg.type==='sessionRefresh'){
   void renewSession(true);
  } else if(msg.type==='realmStatus'){
   if(!msg.available){showShutdownWarning(null);retiring=true;showRealmUnavailable('The realm is updating. Waiting to reconnect…');void checkForUpdates();}
  } else if(msg.type==='shutdownWarning'){
   if(!retiring)showShutdownWarning(msg.secondsRemaining,msg.held);
  } else if(msg.type==='roster'){
   if((msg.realmId??'eu')!==connectionRealm){showEntry('The selected realm returned different realm data. Please contact support.');return;}
   phase='roster';welcomed=true;connected=true;realmAvailable=!retiring;if(realmAvailable)realmOutageMessage='';if(msg.token)saveLocal(guestSessionKey,msg.token);showCharacterRoster(msg);if(realmAvailable)void checkForUpdates();
  } else if(msg.type==='welcome'){
   if(typeof inputActivity!=='undefined')inputActivity?.reset();
   if(retiring)return;realmAvailable=true;realmOutageMessage='';
   phase='world';serverHotbarPageSize=msg.hotbarPageSize===HOTBAR_PAGE_SIZE?HOTBAR_PAGE_SIZE:8;lootResults=msg.lootResults===true;lootQueueLimit=msg.lootQueueLimit??1;merchantSales=msg.merchantSales===true;trainingPending=null;welcomed=true;connected=true;chatTranslation.configure(msg.chatTranslation===true);playerId=msg.id;enteredCharacterId=msg.id;selectedCharacterId=msg.id;player=msg.player;
   rosterActive=false;creatingCharacter=false;customizer.close();$('roster').hidden=true;$('play-ui').inert=false;
   document.body.classList.remove('at-roster','menu-open');canvas.focus();
   snapWorldPosition(player.x,player.z,player.instanceId??null,player.jump);rotation=player.rotation;appearance=player.appearance;playerName=player.name;
   void switchZone(player.zone,player.instanceId??null).then(()=>{if(current()&&!entryActive&&!rosterActive&&worldReady&&playerId===msg.id)promptNativeNotifications();}).catch(zoneError);replaceAvatar();if(msg.token)saveLocal(guestSessionKey,msg.token);
   achievementsUI.update(player);
   $('connection').textContent=`${activeRealmId.toUpperCase()} realm connected`;$('live-dot').classList.remove('offline');lastHUD='';deathPresented=false;updateHUD();refreshGmAccess();
  } else if(msg.type==='lootResult'){
   lootUI.result(msg.requestId,msg.success);
  } else if(msg.type==='snapshot'){
   if(rosterActive||!player)return;
   if(Number.isFinite(msg.serverTime))serverOffset=msg.serverTime-Date.now();
   const oldRaidId=raid?.id,oldRaidPhase=raid?.phase,oldRaidInvites=raidInvites.map(invite=>invite.id);raid=msg.raid??null;raidInvites=msg.raidInvites??[];
   if(raidInvites.some(invite=>!oldRaidInvites.includes(invite.id)))toast('Raid invitation received. Open Raid to join.');
   instantCombat=msg.instantCombat??null;
   storyEncounter=msg.storyEncounter??null;
   party=msg.party??null;partyInvites=msg.partyInvites??[];pendingPartyInvite=null;dungeon=msg.dungeon??null;arena=msg.arena??null;arenaQueue=msg.arenaQueue??null;dungeonSummon=msg.dungeonSummon??null;
   zoneHandle?.setDungeonState?.(dungeon,Date.now()+serverOffset);
   if(msg.zone!==worldZone||(msg.instanceId??null)!==worldInstance||(msg.dungeon?.kind??null)!==worldDungeonKind)void switchZone(msg.zone,msg.instanceId??null).catch(zoneError);
   updatePartyHUD();
   players=msg.players;enemies=msg.enemies;nodes=msg.nodes;lootUI.update((msg.loot||[]).filter(drop=>drop.ownerId===playerId));loot=lootUI.visibleDrops();
   const authoritative=players.find(p=>p.id===playerId);
   if(authoritative){
    const oldFlight=player.zeppelin,oldTreasureMap=player.treasureMap,oldDriver=player.travel?.driverId;
    const oldLevel=player.level,oldGather=player.gathering?.startedAt,oldCast=player.casting?.startedAt;
    const oldHp=player?.hp??100,oldPvp=!!player?.pvp,oldArenaMatch=player?.arenaMatchId,oldEquipment=JSON.stringify(player?.equipment);
    const oldRaidAppearance=JSON.stringify(raidAppearance(player.raidProgress)),oldAppearance=JSON.stringify(player.appearance),oldClass=player.appearance.className;player=authoritative;appearance=player.appearance;
    updateShopSales();
    if(oldClass!==appearance.className){autoAttackTarget=null;if(guideTargetId)guideKey='';}
    if(selectedBagItem&&!player.ownedGear.includes(selectedBagItem)){const next=gearUpgradeQuote(selectedBagItem)?.nextId;if(next&&player.ownedGear.includes(next))selectedBagItem=next;}
    if(oldTreasureMap?.id!==player.treasureMap?.id||oldTreasureMap?.stage!==player.treasureMap?.stage)treasureMapMessage='';
    if(treasureMapStarting&&player.treasureMap){treasureMapStarting=false;treasureMapMessage='';}
    if(oldTreasureMap?.id===player.treasureMap?.id&&oldTreasureMap?.stage!==player.treasureMap?.stage&&waypoint?.id===`treasure-map-route-${player.treasureMap?.id}`){const next=treasureMapWaypoint(player);if(next)setWaypoint(next);}
    if(oldTreasureMap&&!player.treasureMap&&waypoint?.id===`treasure-map-route-${oldTreasureMap.id}`)clearWaypoint();
    if(player.level>oldLevel)gameAudio.play('level-up');
    if(player.gathering&&player.gathering.startedAt!==oldGather)gameAudio.play('gather');
    if(player.casting&&player.casting.startedAt!==oldCast&&player.casting.ability!=='mount')gameAudio.spell(player.casting.ability,'cast',.65);
    if(oldPvp!==!!player.pvp&&!oldArenaMatch&&!player.arenaMatchId&&!isArenaInstance(worldInstance))toast(player.pvp?'Entered the sand ring. World PvP is active; combat is lethal.':'Left the sand ring. World PvP is off.');
    if(oldEquipment!==JSON.stringify(player.equipment)||oldAppearance!==JSON.stringify(appearance)||oldRaidAppearance!==JSON.stringify(raidAppearance(player.raidProgress)))replaceAvatar();
    // Living movement is ahead of delayed snapshots; only explicit corrections should rewind it.
    if(player.hp<=0){snapWorldPosition(player.x,player.z,player.instanceId??null,player.jump);}
    if(oldFlight&&!player.zeppelin){snapWorldPosition(player.x,player.z,player.instanceId??null,player.jump);if(waypoint)guideRoute=findPath(position,waypoint,colliders,WORLD_BOUNDS);clearMovementKeys();toast(`Arrived in ${zeppelinPort(oldFlight.to)!.name}.`);}
    if(!oldFlight&&player.zeppelin){clearMovementKeys();if(panel.open)closePanel();}
    if(oldDriver!==player.travel?.driverId){clearMovementKeys();setAutoAttack(null);snapWorldPosition(player.x,player.z,player.instanceId??null,player.jump);}
    reconcileJump(player);
    if(oldHp>0&&player.hp<=0){audioCombatUntil=0;gameAudio.reset();gameAudio.play('death');clearWaypoint();clearMovementKeys();combatAnimations.delete(playerId);deathPresented=false;if(panel.open)closePanel();}
    if(oldHp<=0&&player.hp>0){deathPresented=false;if(panel.open&&panel.dataset.mode==='death')closePanel();}
    achievementsUI.update(player);updateHUD();updateAudioScene();
   }
   gmPlayers=player?.role==='gm'?(msg.gmPlayers??[]):[];refreshGmAccess();
   updatePartyInvitation();updateWho();
   duelUI.update(msg.duel??null,msg.duelInvites??[],Date.now()+serverOffset);
   arenaUI.update(msg.duel||(msg.duelInvites?.length??0)>0?null:msg.arena??null,msg.arenaInvites??[],Date.now()+serverOffset);
   if(arena&&arena.phase!=='finished')arenaWagerUI.close();
   if(panel.open&&panel.dataset.mode==='arena'){
    if(duelUI.busy()||arenaUI.busy())closePanel();else renderArenaPanel();
   }
   $('population').textContent=`${players.length} here · ${msg.population} online`;
   snapshotInstance=msg.instanceId??null;
   syncEntities(msg.serverTime);playerMenu.update(players);renderInspectPanel();tradeUI.refresh();auctionUI.refresh();lootUI.update((msg.loot||[]).filter(drop=>drop.ownerId===playerId));
   if(raid&&(raid.id!==oldRaidId&&raid.phase==='forming'||raid.phase==='wiped'&&oldRaidPhase!=='wiped'))openRaid();
   else if(raid?.phase==='sermon'&&(oldRaidPhase==='forming'||oldRaidPhase==='wiped')&&panel.open&&panel.dataset.mode==='raid')closePanel();
   if(raid?.result&&raid.result.runId!==presentedRaidResult){presentedRaidResult=raid.result.runId;openRaid();}
   if(dungeon?.result&&dungeon.id!==presentedDungeonResult&&player.hp>0){presentedDungeonResult=dungeon.id;openDungeon();}
  } else if(msg.type==='correction'){
   if(rosterActive||!player)return;
   if(!player.zeppelin&&Math.hypot(msg.x-position.x,msg.z-position.z)>3||msg.instanceId!==worldInstance)clearWaypoint();
   snapWorldPosition(msg.x,msg.z,msg.instanceId??null,msg.jump,true);rotation=msg.rotation;clearMovementKeys();
   if(msg.zone!==worldZone||msg.instanceId!==worldInstance)void switchZone(msg.zone,msg.instanceId).catch(zoneError);
  } else if(msg.type==='combat'){
   if(!rosterActive&&player&&worldReady&&(msg.instanceId??null)===worldInstance&&visibleInDungeonRoom(msg.from)){const caster=msg.playerId===playerId?player:players.find(p=>p.id===msg.playerId);if(caster?.travel)caster.travel.mount=null;playCombat(msg);}
  } else if(msg.type==='damage'){
   if(!rosterActive&&!entryActive&&player&&worldReady&&visibleInDungeonRoom(msg)){
    damageNumbers.play(msg);
    if(msg.amount>0&&msg.effect!=='xp'){
     if(msg.targetKind==='enemy'&&!msg.effect)playMonsterHit(enemyMeshes.get(msg.targetId)?.mesh,elapsed);
     if(msg.targetId===playerId){gameAudio.play(msg.effect==='heal'?'heal':msg.effect==='absorb'?'magic':'hurt');if(!msg.effect||msg.effect==='absorb'){audioCombatUntil=performance.now()+6000;updateAudioScene();}}
     else if(!msg.effect&&Math.hypot(msg.x-position.x,msg.z-position.z)<18)gameAudio.play('hit',.45);
    }
   }
  } else if(msg.type==='gmResult'){
   gmUI.result(msg);
   if(gmFlying()){clearMovementKeys();canvas.focus();}
  } else if(msg.type==='gmLootTrace'){
   gmUI.lootTrace(msg.report);
  } else if(msg.type==='gmNotice'){
   moderationNotice={action:msg.action,text:msg.text};gmUI.close();
  } else if(msg.type==='titleSelected'){
   if(!rosterActive&&player)achievementsUI.titleSelected(msg.titleId,msg.error);
  } else if(msg.type==='achievement'){
   if(!rosterActive&&player)achievementsUI.unlock(msg.achievementId);
  } else if(msg.type==='friends'){
   if(!rosterActive&&player)friendsUI.update(msg);
  } else if(msg.type==='whisper'){
   const incoming=msg.to.id===playerId,other=incoming?msg.from:msg.to;chatMessage(msg.text,undefined,{...other,incoming},undefined,'whisper',incoming?{targetId:other.id,name:other.name,messageId:msg.messageId}:undefined);
  } else if(msg.type==='trade'){
   tradeUI.update(msg.trade,msg.reason);
  } else if(msg.type==='goldMerchantState'){
   goldMerchantUI.update(msg.state);
  } else if(msg.type==='treasureState'){
   treasureUI.update(msg.state,msg.message);
  } else if(msg.type==='storeState'){
   storeUI.update(msg.state,msg.message);nftUI.walletLinked();treasureUI.walletLinked();goldMerchantUI.walletLinked(msg.state.wallet);
  } else if(msg.type==='storeWalletChallenge'){
   if(goldMerchantUI.isLinking())void goldMerchantUI.walletChallenge(msg);else if(treasureUI.isLinking())void treasureUI.walletChallenge(msg);else if(nftUI.isLinking())void nftUI.walletChallenge(msg);else void storeUI.walletChallenge(msg);
  } else if(msg.type==='storeQuote'){
   void storeUI.quote(msg.order);
  } else if(msg.type==='nftState'){
   if(msg.openAuction){storeUI.close();auctionUI.close();nftUI.openAuction(false);}nftUI.update(msg.state,msg.message);
  } else if(msg.type==='nftQuote'){
   void nftUI.quote(msg.order);
  } else if(msg.type==='nftMigrationQuote'){
   nftUI.migrationQuote(msg.migration);
  } else if(msg.type==='nftAuctionTransaction'){
   void nftUI.auctionTransaction(msg);
  } else if(msg.type==='nftAuctionChecked'){
   nftUI.auctionChecked(msg);
  } else if(msg.type==='arenaWagers'){
   arenaWagerUI.update(msg);
  } else if(msg.type==='arenaWalletChallenge'){
   void arenaWagerUI.walletChallenge(msg);
  } else if(msg.type==='auction'){
   auctionUI.update(msg);
  } else if(msg.type==='bank'){
   bankUI.update(msg);
  } else if(msg.type==='polls'){
   pollUI.update(msg);
  } else if(msg.type==='auctionWalletChallenge'){
   void auctionUI.walletChallenge(msg);
  } else if(msg.type==='auctionPayment'){
   void auctionUI.payment(msg);
  } else if(msg.type==='storyQuestDialogue'){
   storyQuestUI.open(msg);
  } else if(msg.type==='dialogue'){
   openDialogue(msg);
  } else if(msg.type==='villageService'){
   const resident=VILLAGE_NPCS.find(n=>n.id===msg.npcId);
   if(resident&&!worldInstance){if(msg.service==='trade')openShop(resident.id);else openContracts(resident.zone);}
  } else if(msg.type==='event'){
   shopSaleEvent(msg);
   if(msg.requestType?.startsWith('arenaWager')||msg.requestType?.startsWith('arenaWallet'))arenaWagerUI.reject(msg.text);
   if(msg.requestType?.startsWith('treasureMap')){if(msg.kind==='info')treasureMapStarting=false;treasureMapMessage=msg.kind==='info'?msg.text:'';if(panel.open&&panel.dataset.mode==='contracts')renderContractPanel();}
   if(msg.requestType==='meadGodQuest'&&msg.kind==='info'){hearthlingPending=false;hearthlingNotice=msg.text;renderHearthlingPanel();}
   if(msg.requestType==='deleteCharacter')characterDeletionError(msg.text);
   if(msg.upgradeEffectId){if(msg.specialistUpgrade)finishUpgradeEffect(msg.specialistUpgrade,msg.upgradeEffectId);else if(msg.kind==='info'&&msg.requestType==='raidSpUpgrade')cancelUpgradeEffect(msg.upgradeEffectId);}
   if(msg.requestType?.startsWith('raid')){lastRaidPanel='';renderRaidMenu();}
   if(msg.requestType?.startsWith('instantCombat')){lastInstantCombatPanel='';renderInstantCombatMenu();}
   if(trainingPending&&msg.kind==='info'&&(/^(Invalid training request|Visit the appropriate trainer|Visit the trainer for your calling|Meet the spell level requirement|Visit a riding trainer with|Learn riding and choose|You need \d+ gold for this purchase|Your action could not be saved)/.test(msg.text)
     ||msg.text.startsWith('Saving your changes')&&msg.requestType===(trainingPending.startsWith('riding-')?'learnRiding':trainingPending.startsWith('mount-')?'buyMount':'learnSpell')))trainingPending=null;
   if(msg.kind==='info'&&msg.requestType?.startsWith('store')){storeUI.reject(msg.text,msg.requestType);if(treasureUI.isLinking())treasureUI.reject(msg.text);}if(msg.kind==='info'&&msg.requestType?.startsWith('treasure'))treasureUI.reject(msg.text);
   if(msg.kind==='info'&&(msg.requestType?.startsWith('goldMerchant')||goldMerchantUI.isLinking()&&(msg.requestType==='storeWalletChallenge'||msg.requestType==='storeWalletBind')))goldMerchantUI.reject(msg.text);
   if(msg.kind==='info')nftUI.reject(msg.text,msg.requestType);
   if(msg.kind==='info'){auctionUI.reject(msg.text,msg.requestType);if(msg.requestType?.startsWith('bank'))bankUI.reject(msg.text);if(msg.requestType?.startsWith('poll'))pollUI.reject(msg.text);}
   if(msg.text.startsWith('Hotbar:'))hotbar.reject();
   if(msg.kind==='info'&&msg.requestType==='autoAttack'&&msg.text.startsWith('Saving your changes'))rejectAutoAttack();
   if(msg.kind==='chat'){const channel=msg.channel??(msg.text.startsWith('[Party] ')?'party':'world'),text=channel==='party'?msg.text.replace(/^\[Party\] /,''):msg.text,colon=text.indexOf(':');chatMessage(colon>=0?text.slice(colon+1).trim():text,colon>=0?text.slice(0,colon):'Nearby',undefined,msg.role,channel,msg.playerId?{targetId:msg.playerId,name:colon>=0?text.slice(0,colon):'Player',messageId:msg.messageId}:undefined);if(msg.playerId)showChatBubble(msg.playerId,colon>=0?text.slice(colon+1).trim():text,channel,playerId);}
   else if(msg.kind==='emote')chatMessage(msg.text,undefined,undefined,undefined,'world',undefined,msg.playerId);
   else if(!(msg.kind==='info'&&msg.text.startsWith('Saving your changes'))){if(!msg.logOnly&&msg.kind!=='combat'&&msg.kind!=='damage')toast(msg.text,msg.kind);if(msg.kind==='reward'||msg.kind==='info')chatMessage(msg.text,undefined,undefined,undefined,'system',undefined,undefined,!!msg.logOnly);if(msg.kind==='reward'&&!msg.logOnly&&!rosterActive)gameAudio.play('reward');}
   if(rosterActive){creatingCharacter=false;if(realmAvailable){$('roster-error').textContent=msg.text;$('creation-error').textContent=msg.text;}updateRosterAvailability();}
   if(panel.open&&panel.dataset.mode==='training')renderTrainingPanel();
   if(panel.open&&panel.dataset.mode==='journal')renderJournal();
  }
 });
 function onClose(event:Pick<CloseEvent,'code'|'reason'>){
  if(closed)return;closed=true;
  stopRenewal();
  if(socket!==connection||revision!==connectionRevision)return;
  report(phase,event.code,event.reason||'Socket closed');
  showShutdownWarning(null);
  connected=false;resetInstantCombat();realmAvailable=false;trainingPending=null;clearSocialUI();clearCombat();creatingCharacter=false;clearMovementKeys();selectedId=hoveredId=null;$('live-dot').classList.add('offline');
  if(typeof communityUI!=='undefined')communityUI?.close();
  updateRosterAvailability();
  if(entryActive)return;
  if(event.code===4001){sessionDisplaced=true;if(rosterActive)$('roster-error').textContent='This account is open in another tab. Continue there or reload this page.';if(customizer.open)$('creation-error').textContent=$('roster-error').textContent;$('connection').textContent='Session open elsewhere';toast('This adventurer is active in another tab. Use a separate browser profile to play together.');return;}
  if(event.code===4407){showRealmUnavailable('This account is active in another realm. Leave that realm, then reconnect.');$('roster-retry').hidden=false;return;}
  if(event.code===4408||event.code===4409){const text=moderationNotice?.text||(event.code===4409?'Your account has been banned.':'You were kicked from the realm.');clearTimeout(reconnectTimer);showEntry(text,event.code===4408);moderationNotice=null;return;}
  if(event.code===4403){showEntry('The server stopped this connection for a safety check. After repeated invalid actions, wait one minute before reconnecting.');return;}
  if(event.code===4410){clearSession();showEntry('Account deletion has started. Visit account.mossvale.world to check its status.');return;}
  if(event.code===4401&&forceRefresh&&!welcomed){clearSession();showEntry('Your session could not join the realm. Sign in again to continue.');return;}
  if(event.code!==4401){
   const resumeCharacter=!retiring&&event.code!==1012?enteredCharacterId:undefined;
   showRealmUnavailable(event.code===1012?'The realm is updating. Waiting to reconnect…':undefined);
   enteredCharacterId=resumeCharacter;
  }
  else if(rosterActive){$('roster-error').textContent='Refreshing your session…';if(customizer.open)$('creation-error').textContent='Refreshing your session…';}
  $('connection').textContent=realmOutageMessage?'Realm unavailable':'Reconnecting…';
  if(event.code===1012)void checkForUpdates();
  $('roster-retry').hidden=false;
  clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>void connect(event.code===4401),event.code===4401?100:2500);
 }
 connection.addEventListener('close',onClose);
 connection.addEventListener('error',()=>{});
}
function pauseConnection(){
 if(typeof communityUI!=='undefined')communityUI?.close();
 changingRealm=false;
 showShutdownWarning(null);
 updateSelection=null;
 stopSessionRenewal?.();stopSessionRenewal=undefined;
 closeCharacterDeletion();
 for(const view of mountViews.values())disposeMount(view.mesh);mountViews.clear();sprintSinceMove=false;
 disposeMinimap();clearSocialUI();
 clearCombat();party=null;partyInvites=[];dungeon=null;resetInstantCombat();updatePartyHUD();
 realmAvailable=false;realmOutageMessage='';
 guideKey='';clearWaypoint();enteredCharacterId=undefined;rosterActive=false;creatingCharacter=false;rosterCharacters=[];selectedCharacterId=null;player=undefined;selectedId=hoveredId=null;entryActive=true;zoneRevision++;setWorldLoading(false);connectionRevision++;clearTimeout(reconnectTimer);connected=false;clearMovementKeys();socket?.close();
}
function showEntry(error='',retry=false){
 stopEmbeddedLogin();
 pauseConnection();panel.close();customizer.close();$('roster').hidden=true;document.body.classList.remove('menu-open','at-roster');document.body.classList.add('at-entry');$('play-ui').inert=true;
 $('connection').textContent='Sign-in required';$('login').hidden=false;
 $('login-sign-in').hidden=!authEnabled||retry;$('login-wallet').hidden=!authEnabled||!walletSignInEnabled||retry;$('login-register').hidden=!authEnabled||retry;$('login-guest').hidden=authEnabled||retry;$('login-retry').hidden=!retry;
 for(const provider of ['google','apple'] as const)$(`login-${provider}`).hidden=!authEnabled||!socialSignInEnabled[provider]||retry;
 $('login-social').hidden=!authEnabled||retry||(!socialSignInEnabled.google&&!socialSignInEnabled.apple);
 $('login-social-note').hidden=$('login-social').hidden;
 $('login-description').textContent=retry?'Your adventure is waiting. Reconnect to get back on the road.':authEnabled?'Sign in and pick up your adventure.':'Build a local character roster. Your adventurers stay with this browser.';
 $('login-footnote').textContent=socialSignInRequiresUpdate?'Update the Mossvale app to use Google or Apple sign-in.':authEnabled?'One account. A world of little adventures.':'Local realm · Account sign-in is not configured.';
 if(socialSignInRequiresUpdate)$('login-footnote').insertAdjacentHTML('beforeend',nativeUpdateLinks()+'<span>Using TestFlight? Update Mossvale there.</span>');
 $('login-error').textContent=error;$('login-error').hidden=!error;
 document.querySelectorAll<HTMLButtonElement>('.login-actions button').forEach(button=>button.disabled=false);
 loginScene.start();$('login').focus();
 if(!retry&&supportsEmbeddedSignIn())startEmbeddedLogin();
}
function stopEmbeddedLogin(){
 const pending=embeddedLogin;embeddedLogin=undefined;pending?.cancel();
 providerFallback=undefined;activeProvider=undefined;$('login-provider-cancel').hidden=true;$('login-provider-redirect').hidden=true;
 $('login-embedded').hidden=true;$('login-frame').hidden=true;
 $('login').classList.remove('has-embedded-login');
 $('login-sign-in').classList.remove('login-fallback');$('login-sign-in').textContent='Sign in with email';
}
function startEmbeddedLogin(){
 const frame=$<HTMLIFrameElement>('login-frame');
 $('login-embedded').hidden=false;$('login-form-status').hidden=false;
 $('login-form-status').textContent='Opening secure sign-in…';$('login-register').hidden=true;
 $('login').classList.add('has-embedded-login');
 $('login-sign-in').textContent='Open sign-in page';$('login-sign-in').classList.add('login-fallback');
 const flow=signInInsideGame(frame,()=>{if(embeddedLogin!==flow)return;frame.hidden=false;$('login-form-status').hidden=true;});
 embeddedLogin=flow;
 void flow.result.then(signedIn=>{if(embeddedLogin===flow&&signedIn&&entryActive)openCharacterSelection();}).catch(error=>{
  if(embeddedLogin!==flow)return;
  embeddedLogin=undefined;frame.hidden=true;$('login-register').hidden=false;
  $('login-form-status').hidden=false;$('login-form-status').textContent=error instanceof Error?error.message:'Use Open sign-in page to continue.';
 });
}
function startProviderLogin(provider:'wallet'|'google'|'apple'){
 if(accountFlowPending||activeProvider===provider&&embeddedLogin)return;
 const fallback=provider==='wallet'?signInWithWallet:()=>signInWithSocial(provider);
 if(!supportsEmbeddedSignIn()){void openAccountFlow(fallback);return;}
 stopEmbeddedLogin();providerFallback=fallback;activeProvider=provider;
 $('login').classList.add('has-embedded-login');$('login-sign-in').hidden=true;$('login-register').hidden=true;
 $('login-embedded').hidden=false;$('login-form-status').hidden=false;$('login-provider-cancel').hidden=false;
 const label=provider==='wallet'?'your wallet':provider==='google'?'Google':'Apple';
 $('login-form-status').textContent=`Finish signing in with ${label} in the opened tab. You’ll return here automatically.`;
 const failed=(error:unknown)=>{$('login-form-status').textContent=error instanceof Error?error.message:'Sign-in could not finish. Please try again.';$('login-provider-redirect').hidden=false;};
 try{
  const flow=signInWithProviderInsideGame(provider);embeddedLogin=flow;
  void flow.result.then(signedIn=>{if(embeddedLogin===flow&&signedIn&&entryActive)openCharacterSelection();}).catch(error=>{if(embeddedLogin===flow){embeddedLogin=undefined;failed(error);}});
 }catch(error){failed(error);}
}
function realmHasSpace(){return rosterCharacters.length<maxCharacters;}
function renderRealmOptions(){
 const select=$<HTMLSelectElement>('roster-realm');
 for(const realm of hostingConfig.realms){
  const option=select.querySelector<HTMLOptionElement>(`option[value="${realm.id}"]`);
  if(!option)continue;
  option.disabled=realm.origin===null;
  option.textContent=`${realm.name}${realm.id==='asia'?'':` (${realm.id.toUpperCase()})`}${realm.origin===null?' — Not open yet':''}`;
 }
 select.value=activeRealmId;
}
async function switchHostingRealm(realmId:RealmId){
 if(!rosterActive||customizer.open||changingRealm||creatingCharacter||characterDeletion?.pending||realmId===activeRealmId||!hostingConfig.realms.some(realm=>realm.id===realmId&&realm.origin!==null))return;
 const previous=socket,wasConnected=connected,revision=++connectionRevision;
 setActiveHostingRealm(undefined);
 changingRealm=true;connected=false;realmAvailable=false;clearTimeout(reconnectTimer);stopSessionRenewal?.();stopSessionRenewal=undefined;
 closeCharacterDeletion();$('roster-retry').hidden=true;$('roster-error').textContent='Saving your progress before changing realm…';updateRosterAvailability();
 try{if(wasConnected&&previous?.readyState===WebSocket.OPEN)await leaveHostingRealm(previous);}
 catch(error){
  if(revision!==connectionRevision||entryActive)return;
  previous?.close();changingRealm=false;setActiveHostingRealm(activeRealmId);realmOutageMessage=error instanceof Error?error.message:'Could not leave the realm. Reconnect and try again.';
  $('roster-error').textContent=realmOutageMessage;$('roster-retry').hidden=false;updateRosterAvailability();
  reconnectTimer=setTimeout(()=>void connect(),2500);return;
 }
 if(revision!==connectionRevision||entryActive)return;
 previous?.close();activeRealmId=realmId;setActiveHostingRealm(realmId);changingRealm=false;saveLocal('mossvale-last-realm',realmId);
 enteredCharacterId=undefined;realmOutageMessage='';
 clearSocialUI();clearCombat();clearEntityViews();player=undefined;clearMovementKeys();
 for(const channel of ['world','system','party','whisper'] as const){$(`chat-log-${channel}`).replaceChildren();chatDrafts[channel]='';$(`chat-tab-${channel}`).dataset.unread='0';}
 chatPreviewMessages.length=0;chatScroll.clear();updateChatPreview();updateChatUnread();if(mobileChat())setChatExpanded(false);
 $<HTMLInputElement>('chat-input').value='';
 $('roster-error').textContent=`Connecting to ${realmId.toUpperCase()}…`;
 renderRoster();void connect();
}
$<HTMLSelectElement>('roster-realm').onchange=event=>{
 const realmId=(event.target as HTMLSelectElement).value;
 if(realmIdValid(realmId))void switchHostingRealm(realmId);
};
$('roster-retry').onclick=()=>{if(!rosterActive||changingRealm)return;$('roster-retry').hidden=true;void connect();};
function openCharacterSelection(){
 loginScene.stop();stopEmbeddedLogin();sessionDisplaced=false;
 const preferred=updateSelection?.realmId??readLocal('mossvale-last-realm');
 activeRealmId=realmIdValid(preferred)&&hostingConfig.realms.some(realm=>realm.id===preferred&&realm.origin!==null)?preferred:hostingConfig.realmId;
 setActiveHostingRealm(activeRealmId);
 entryActive=false;rosterActive=true;realmAvailable=false;realmOutageMessage='';enteredCharacterId=undefined;$('login').hidden=true;$('play-ui').inert=true;
 document.body.classList.remove('at-entry');document.body.classList.add('at-roster');$('roster').hidden=false;
 renderRoster();$('roster-error').textContent='Connecting to your account…';void connect();
}
function showCharacterRoster(message:Extract<ServerMessage,{type:'roster'}>){
 if(!changingRealm)setActiveHostingRealm(activeRealmId);
 if(typeof inputActivity!=='undefined')inputActivity?.reset();
 const restoring=realmAvailable?updateSelection:null;if(realmAvailable)updateSelection=null;
 if(characterDeletion&&(!characterDeletion.pending||!message.characters.some(character=>character.id===characterDeletion!.id)))closeCharacterDeletion();
 disposeMinimap();clearSocialUI();
 const added=message.characters.find(character=>!rosterCharacters.some(old=>old.id===character.id));
 const preserveDraft=customizer.open&&!added;
 rosterCharacters=message.characters;maxCharacters=message.maxCharacters;creatingCharacter=false;enteredCharacterId=undefined;
 selectedCharacterId=(restoring&&rosterCharacters.some(c=>c.id===restoring.selectedId)?restoring.selectedId:null)||added?.id|| (rosterCharacters.some(c=>c.id===selectedCharacterId)?selectedCharacterId:rosterCharacters[0]?.id||null);
 guideKey='';clearWaypoint();player=undefined;party=null;partyInvites=[];dungeon=null;resetInstantCombat();updatePartyHUD();rosterActive=true;zoneRevision++;setWorldLoading(false);clearMovementKeys();clearEntityViews();
 if(customizer.open&&added)saveLocal('mossvale-profile',JSON.stringify({name:added.name,appearance:added.appearance}));
 if(!preserveDraft)customizer.close();
 panel.close();document.body.classList.remove('menu-open');document.body.classList.add('at-roster');$('play-ui').inert=true;$('roster').hidden=false;
 $('roster-error').textContent=realmAvailable?'':realmOutageMessage||'Connecting to your account…';$('creation-error').textContent=realmAvailable?'':realmOutageMessage;
 $('connection').textContent=realmAvailable?'Realm connected':'Realm unavailable';
 renderRoster();if(realmAvailable&&!preserveDraft)$(selectedCharacterId?'roster-enter':'roster-create').focus();
 if(restoring?.draft){openCustomizer();if(customizer.open){draft=normalizeAppearance(restoring.draft.appearance);$<HTMLInputElement>('character-name').value=restoring.draft.name;drawChoices();}}
}
function updateRosterAvailability(){
 if(!connected||!realmAvailable)closeCharacterDeletion();
 const ready=connected&&realmAvailable&&!changingRealm&&!characterDeletion?.pending;
 $<HTMLButtonElement>('roster-delete').disabled=!ready||!selectedCharacterId;
 $<HTMLButtonElement>('roster-create').disabled=!ready||creatingCharacter||!realmHasSpace();
 $<HTMLButtonElement>('roster-enter').disabled=!ready||!selectedCharacterId;
 $<HTMLButtonElement>('create-character').disabled=!ready||creatingCharacter||!realmHasSpace();
 $<HTMLSelectElement>('roster-realm').disabled=changingRealm||creatingCharacter||!!characterDeletion?.pending;
 renderRealmOptions();
}
function showRealmUnavailable(message=realmOutageMessage||'The realm is unavailable. Reconnecting…'){
 realmAvailable=false;realmOutageMessage=message;enteredCharacterId=undefined;
 if(player){
  selectedCharacterId=player.id;
  rosterCharacters=rosterCharacters.some(character=>character.id===player!.id)?rosterCharacters.map(character=>character.id===player!.id?player!:character):[...rosterCharacters,player];
 }
 if(player||!rosterActive)showCharacterRoster({type:'roster',realmId:activeRealmId,characters:rosterCharacters,maxCharacters});
 $('roster-error').textContent=message;if(customizer.open)$('creation-error').textContent=message;
 $('connection').textContent='Realm unavailable';updateRosterAvailability();
}
function renderRoster(){
 if(characterDeletion&&!characterDeletion.pending&&characterDeletion.id!==selectedCharacterId)closeCharacterDeletion();
 const waiting=!realmAvailable&&!rosterCharacters.length;
 $('character-list').innerHTML=waiting?'<div class="roster-empty" role="status"><p>Loading characters…</p></div>':renderCharacterList(rosterCharacters,selectedCharacterId);
 $('roster-count').textContent=waiting?'Loading…':`${rosterCharacters.length} / ${maxCharacters}`;
 updateRosterAvailability();
 $('roster-account-label').textContent=authEnabled?'Sign out':'Return to title';
 const chosen=rosterCharacters.find(c=>c.id===selectedCharacterId);
 $('roster-character-name').setAttribute('translate',chosen?'no':'yes');$('roster-character-name').textContent=chosen?.name||(waiting?'Waiting for the realm':'Your story begins here');
 $('roster-character-detail').textContent=chosen?`Level ${chosen.level} ${chosen.appearance.className} · ${getZone(chosen.zone).name}`:waiting?'Your characters will appear when the realm reconnects.':'Create your first adventurer, then enter the world.';
 if(!customizer.open)showRosterPreview(chosen);
 document.querySelectorAll<HTMLButtonElement>('[data-character-id]').forEach(button=>button.onclick=()=>{if(changingRealm||creatingCharacter||characterDeletion?.pending)return;selectedCharacterId=button.dataset.characterId!;$('roster-error').textContent=realmAvailable?'':realmOutageMessage||'Connecting to your account…';renderRoster();document.querySelector<HTMLButtonElement>(`[data-character-id="${selectedCharacterId}"]`)?.focus();});
}
function showRosterPreview(chosen=rosterCharacters.find(c=>c.id===selectedCharacterId)){
 const preview=$<HTMLCanvasElement>('character-preview');$('roster-preview-mount').append(preview);preview.hidden=false;previewRotation=0;
 for(const id of ['roster-turn-left','roster-turn-right'])$<HTMLButtonElement>(id).disabled=!chosen;
 requestAnimationFrame(()=>{if(rosterActive&&!customizer.open)updatePreview(chosen||null);});
}
function returnToCharacters(){
 if(!connected){toast('Reconnect before changing characters.');return;}
 guideKey='';clearWaypoint();selectedCharacterId=player?.id||selectedCharacterId;enteredCharacterId=undefined;cancelGathering();clearMovementKeys();send({type:'leaveWorld'});
}
function closeCharacterDeletion(){
 characterDeletion=null;
 const dialog=$<HTMLDialogElement>('character-delete-dialog');if(dialog.open)dialog.close();
 const input=$<HTMLInputElement>('character-delete-confirmation');input.value='';input.disabled=false;
 $('character-delete-name').textContent='';$('character-delete-error').textContent='';
 $<HTMLButtonElement>('character-delete-cancel').disabled=false;
 $<HTMLButtonElement>('character-delete-submit').disabled=true;$('character-delete-submit').textContent='Delete character';
}
function updateCharacterDeletion(){
 const ready=connected&&realmAvailable&&rosterActive&&!!characterDeletion&&!characterDeletion.pending&&characterDeletion.id===selectedCharacterId&&rosterCharacters.some(character=>character.id===characterDeletion!.id);
 $<HTMLButtonElement>('character-delete-submit').disabled=!ready||$<HTMLInputElement>('character-delete-confirmation').value!=='I confirm';
}
function openCharacterDeletion(){
 if(!connected||!realmAvailable||!rosterActive||customizer.open||characterDeletion?.pending)return;
 const target=rosterCharacters.find(character=>character.id===selectedCharacterId);if(!target)return;
 closeCharacterDeletion();characterDeletion={id:target.id,pending:false};$('character-delete-name').textContent=target.name;
 $<HTMLDialogElement>('character-delete-dialog').showModal();$<HTMLInputElement>('character-delete-confirmation').focus();updateCharacterDeletion();
}
function characterDeletionError(text:string){
 if(!characterDeletion?.pending)return;
 characterDeletion.pending=false;
 if(!connected||!realmAvailable||!rosterActive||characterDeletion.id!==selectedCharacterId||!rosterCharacters.some(character=>character.id===characterDeletion!.id)){closeCharacterDeletion();updateRosterAvailability();return;}
 const input=$<HTMLInputElement>('character-delete-confirmation');input.value='';input.disabled=false;
 $('character-delete-error').textContent=text;$('character-delete-submit').textContent='Delete character';$<HTMLButtonElement>('character-delete-cancel').disabled=false;
 updateCharacterDeletion();updateRosterAvailability();input.focus();
}
$('roster-delete').onclick=openCharacterDeletion;
$('character-delete-cancel').onclick=()=>{if(!characterDeletion?.pending){closeCharacterDeletion();updateRosterAvailability();$('roster-delete').focus();}};
$('character-delete-dialog').addEventListener('cancel',event=>{event.preventDefault();if(!characterDeletion?.pending){closeCharacterDeletion();updateRosterAvailability();$('roster-delete').focus();}});
$('character-delete-confirmation').addEventListener('input',updateCharacterDeletion);
$<HTMLFormElement>('character-delete-form').onsubmit=event=>{
 event.preventDefault();updateCharacterDeletion();
 if(!characterDeletion||$<HTMLButtonElement>('character-delete-submit').disabled)return;
 const confirmation=$<HTMLInputElement>('character-delete-confirmation').value,characterId=characterDeletion.id;
 characterDeletion.pending=true;$<HTMLInputElement>('character-delete-confirmation').disabled=true;$<HTMLButtonElement>('character-delete-cancel').disabled=true;$('character-delete-submit').textContent='Deleting…';$('character-delete-error').textContent='';
 updateCharacterDeletion();updateRosterAvailability();send({type:'deleteCharacter',characterId,confirmation});
};
$('roster-create').onclick=openCustomizer;
$('roster-enter').onclick=()=>{if(!selectedCharacterId||!connected||!realmAvailable||changingRealm||characterDeletion?.pending)return;$('roster-error').textContent='Entering the world…';$<HTMLButtonElement>('roster-enter').disabled=true;send({type:'selectCharacter',realmId:activeRealmId,characterId:selectedCharacterId});};
$('roster-account').onclick=()=>void leaveAccount();
$('roster-turn-left').onclick=()=>{previewRotation-=Math.PI/4;};
$('roster-turn-right').onclick=()=>{previewRotation+=Math.PI/4;};

let accountFlowRevision=0;
async function openAccountFlow(action:()=>Promise<void>){
 if(accountFlowPending)return;
 stopEmbeddedLogin();
 const revision=++accountFlowRevision;
 accountFlowPending=true;
 document.querySelectorAll<HTMLButtonElement>('.login-actions button').forEach(button=>button.disabled=true);$('login-error').hidden=true;
 try{await action();}catch(error){if(revision===accountFlowRevision)showEntry(error instanceof Error?error.message:'Please try again.');}finally{if(revision===accountFlowRevision){accountFlowPending=false;document.querySelectorAll<HTMLButtonElement>('.login-actions button').forEach(button=>button.disabled=false);}}
}
window.addEventListener('mossvale:auth-result',event=>{
 const result=(event as CustomEvent).detail?.status;
 if((globalThis as typeof globalThis & {__MOSSVALE_NATIVE_AUTH__?:boolean}).__MOSSVALE_NATIVE_AUTH__!==true||!entryActive||!accountFlowPending||!['cancelled','error'].includes(result))return;
 accountFlowRevision++;accountFlowPending=false;
 showEntry(result==='cancelled'?'Sign-in was cancelled. Choose a sign-in method to try again.':'Sign-in could not finish. Please try again.');
});
async function leaveAccount(){
 accountFlowPending=true;
 pauseConnection();
 try{await signOut();showEntry();}catch(error){showEntry(error instanceof Error?error.message:'Sign-out could not be completed. Please try again.');}finally{accountFlowPending=false;}
}
function openAccount(){
 openPanel('Your adventure, saved','YOUR ACCOUNT','account');
 $('panel-content').innerHTML=`<div class="account-detail">${icon('user')}<strong id="account-name"></strong><p>${authEnabled?'You are signed in. All your characters and their progress are saved to your account.':'You are playing as a guest. Your adventure stays with this browser.'}</p></div><button id="account-characters" class="primary-button">${icon('user')} Character selection</button><div class="account-service-links"><a href="/account.html">Manage account &amp; deletion</a><a href="/support.html">Support</a><a href="/privacy.html">Privacy</a></div><button id="account-leave" class="primary-button">${icon(authEnabled?'logout':'left')} ${authEnabled?'Sign out':'Return to title'}</button>`;
 $('account-name').textContent=player?.name||playerName;$('account-characters').onclick=returnToCharacters;$('account-leave').onclick=()=>void leaveAccount();
}
$('login-sign-in').onclick=()=>void openAccountFlow(signIn);
$('login-wallet').onclick=()=>startProviderLogin('wallet');
for(const provider of ['google','apple'] as const)$(`login-${provider}`).onclick=()=>startProviderLogin(provider);
$('login-provider-cancel').onclick=()=>showEntry();
$('login-provider-redirect').onclick=()=>{if(providerFallback)void openAccountFlow(providerFallback);};
$('login-register').onclick=()=>void openAccountFlow(createAccount);
$('login-guest').onclick=openCharacterSelection;
$('login-retry').onclick=()=>location.reload();
$('account-button').onclick=openAccount;
// Character rigs share geometry/materials; dispose only their instance buffers.
function removeRig(mesh:THREE.Group){mesh.removeFromParent();mesh.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});}
function removeNode(mesh:THREE.Group){
 mesh.removeFromParent();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 mesh.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
function raidAppearance(progress:Player['raidProgress']){const active=SPECIALISTS_ENABLED?progress?.specialists.find(card=>card.id===progress.activeSpecialistId):undefined;return [progress?.equippedCosmetics,active?.upgrade,active?.broken,active?.sealed,active?.className];}
function replaceAvatar(){removeRig(localAvatar);localAvatar=makeCharacter(appearance,player?.equipment,player?.raidProgress);scene.add(localAvatar);localAvatar.position.copy(position);localAvatar.rotation.y=rotation;ownLabel.querySelector('strong')!.textContent=playerName;}
const classSpells = {
 Ranger: { primary: 'Quick shot', special: 'Volley', primaryIcon: 'shot', specialIcon: 'volley', range: SPELLS.arrow.range, damage: 16, detail: 'Fire a precise arrow at one foe, or rain arrows on enemies around you.' },
 Cleric: { primary: 'Smite', special: 'Holy Nova', primaryIcon: 'cleric-smite', specialIcon: 'cleric-burst', range: SPELLS.smite.range, damage: 18, detail: 'Mend allies, ward against harm and strike foes with holy light.' },
 Knight: { primary: 'Strike', special: 'Whirlwind', primaryIcon: 'sword', specialIcon: 'whirlwind', range: SPELLS.strike.range, damage: 24, detail: 'Strike a nearby foe with your blade, or sweep every enemy around you.' },
 Mage: { primary: 'Fireball', special: 'Nova', primaryIcon: 'fireball', specialIcon: 'nova', range: SPELLS.fireball.range, damage: 20, detail: 'Hurl a blazing fireball at one foe, or release an expanding burst of magic.' },
};
const zoneIcons: Record<ZoneId,string> = {greenwood:'leaf',amberwild:'ember',frostmarch:'frost',hollow:'heartroot',sunveil:'ember',mistwood:'leaf'};
const nodeIcons: Record<string,string> = {crystal:'crystal','ember-shard':'ember','star-fragment':'frost',heartroot:'heartroot',timber:'wood',herb:'leaf'};
const nodeNames: Record<string,string> = Object.fromEntries(Object.entries(RESOURCE_TYPES).map(([kind,info])=>[kind,info.label]));
const enemyNames: Record<string,string> = Object.fromEntries(Object.entries(MONSTERS).map(([kind,monster])=>[kind,monster.name]));
const monsterAttackNames:Record<string,string>={bite:'Bite',swipe:'Claw swipe',slam:'Ground slam',spit:'Venom spit',pulse:'Crystal pulse',sting:'Tail sting',charge:'Charge'};
const objectiveIcon = (o:Objective) => o.kind==='gather'?(nodeIcons[o.target]||'gather'):o.kind==='kill'?(o.target==='root-warden'?'boss':'sword'):o.target.includes('beacon')?'beacon':'interact';
let lastHUD='';
let lastLocationRegion='';
function arenaPlayerLabel(other:Player){
 if(!other.arenaMatchId)return player?.duelOpponentId===other.id?'Duel opponent · Ends at 1 HP':other.pvp?'World PvP · Lethal':'Player';
 if(other.arenaEliminated)return 'Arena · Knocked out';
 if(!player?.arenaMatchId||player.arenaMatchId!==other.arenaMatchId)return 'Arena participant';
 return other.arenaTeam===player.arenaTeam?'Arena teammate':isHostilePlayer(player,other)?'Arena opponent · Knockout at 1 HP':'Arena opponent';
}
function updateLocation(forceArrival=false){
 const surface=surfaceAt(position.x,position.z),zone=getZone(surface.zone);
 const region=wildBiomeAt(position.x,position.z)||EXPEDITIONS.find(region=>region.id===surface.regionId);
 const village=VILLAGES.find(v=>Math.hypot(v.x-position.x,v.z-position.z)<28);
 const skyDock=ZEPPELIN_PORTS.find(port=>Math.hypot(port.x-position.x,port.z-position.z)<16);
 const privateInstantCombat=isInstantCombatInstance(worldInstance),privateArena=isArenaInstance(worldInstance),privateRaid=isRaidInstance(worldInstance),pvp=!!player?.pvp,nearColosseum=!player?.zeppelin&&!worldInstance&&inColosseumClearing(position.x,position.z),nearArena=!worldInstance&&Math.hypot(position.x-ARENA_ENTRANCE.x,position.z-ARENA_ENTRANCE.z)<=ARENA_ENTRY_RADIUS;
 $('pvp-state').hidden=!pvp&&!nearColosseum&&!privateArena&&!nearArena;$('pvp-state').dataset.active=String(pvp);
 $('pvp-title').textContent=privateArena?(player?.arenaEliminated?'ARENA · KNOCKED OUT':player?.arenaPhase==='active'?'ARENA MATCH · FIGHT':'ARENA · GET READY'):pvp?'WORLD PVP · LETHAL':nearArena?'ARENA MATCHES · ENTRANCE':'SPECTATOR AREA · SAFE';
 $('pvp-detail').textContent=privateArena?(player?.arenaEliminated?'Watch your team. Forfeit ends your team’s match.':player?.arenaPhase==='active'?'Opponents only. Knockout at 1 HP.':'Combat starts after the countdown.'):pvp?'Everyone is hostile. Death & respawn apply.':nearArena?'Open Arena (U) for rated Solo, 2v2 or 3v3 matches from anywhere.':'The sand ring has lethal PvP. Queue anywhere with Arena (U); everyone accepts out of combat.';
 const place=privateInstantCombat?instantCombatMap(instantCombat?.run?.mapId).name:privateRaid?(raid?.plane==='shadow'?'Shadow Realm':'Apostle sanctum'):privateArena?'Thornring Arena':worldInstance?(inDungeonPreparation(position,dungeon?.kind)?'Arrival sanctuary · Safe':dungeon?.encounterName||getDungeon(dungeon?.kind)!.name):skyDock?`${skyDock.name} sky dock`:nearColosseum?COLOSSEUM.name:village?.name||region?.name||zone.name;
 const levels=privateInstantCombat?`Lv ${instantCombat?.run?.minLevel??16}–${instantCombat?.run?.maxLevel??60} · Cooperative arena`:privateRaid?'Lv 60 · 10–20 raid':privateArena?`${arena?.size??1}v${arena?.size??1} · Private match`:dungeon?.dream?`Wake in ${Math.max(0,Math.ceil((dungeon.dream.endsAt-Date.now()-serverOffset)/1000))}s`:worldInstance?`Lv ${getDungeon(dungeon?.kind)!.minLevel}–${getDungeon(dungeon?.kind)!.maxLevel}`:regionLevelLabel(surface.regionId,surface.zone);
 $('zone-location').textContent=`${levels}\n${place}`;$('zone-location').title=`${place} · ${levels}`;
 $('zone-name').textContent=`${place.toUpperCase()} · ${levels}`;$('zone-footer').textContent=privateInstantCombat?`INSTANT COMBAT · ${levels}`:privateRaid?`HORNED APOSTLE · ${raid?.plane==='shadow'?'SHADOW REALM':'SANCTUM'}`:privateArena?`THORNRING ARENA · ${levels}`:worldInstance?`${getDungeon(dungeon?.kind)!.name.toUpperCase()} · ${levels}`:`${(region?.name||zone.name).toUpperCase()} · ${levels}`;
 const key=worldInstance||surface.regionId;
 if(forceArrival||key!==lastLocationRegion){
  lastLocationRegion=key;
  $('zone-intro-title').textContent=privateInstantCombat?'Instant Combat':privateRaid?(raid?.plane==='shadow'?'Shadow Realm':APOSTLE_RAID.name):privateArena?'Thornring Arena':worldInstance?dungeon?.name||getDungeon(dungeon?.kind)!.name:region?.name||zone.name;
  $('zone-intro-subtitle').textContent=`${levels} · ${privateInstantCombat?'Survive five rounds together.':privateRaid?(raid?.objective||'Face the Apostle together.'):privateArena?'Defeat the opposing team. Knockout at 1 HP.':dungeon?.dream?'Explore for keepsakes before waking. Use the return portal to wake early.':worldInstance?(inDungeonPreparation(position,dungeon?.kind)?'Prepare with your party here. Use the room portal when ready.':getDungeon(dungeon?.kind)!.description):zone.subtitle}`;
  const intro=$('region-intro');intro.style.animation='none';void intro.offsetWidth;intro.style.animation=document.body.classList.contains('mobile-controls')?'arrival 3s forwards':'arrival 8s forwards';
 }
}
function updateHUD(){
 itemMenu.update();
 if(!player)return;
 if(trackedContractId&&!Object.hasOwn(player.contracts.active,trackedContractId))trackedContractId='';
 if(trackedStoryQuestId&&!Object.hasOwn(player.storyQuests?.active??{},trackedStoryQuestId))trackedStoryQuestId='';
 hotbar.sync(player);
 const hud=JSON.stringify([trackedStoryQuestId,trackedContractId,player.id,player.pvp,player.arenaMatchId,player.arenaTeam,player.arenaEliminated,player.arenaPhase,player.duelOpponentId,player.onboarding,player.name,player.title,player.betaTester,player.appearance.className,player.zone,player.hp,player.maxHp,player.level,player.xp,player.inventory,player.carriedItems,player.pendingAuctionPurchases,player.itemUseReadyAt,player.treasureMap,player.quest,player.storyQuests,player.meadGodPaid,raidAppearance(player.raidProgress),player.raidProgress?.specialists.map(card=>[card.id,card.jobXp]),player.raidProgress?.petEvolution,player.skills,player.gold,player.talents,player.equipment,player.ownedGear,player.lockedItems,player.ownedBags,player.equippedBags,player.learnedSpells,player.ridingRank,player.ownedMounts,player.nftMounts,player.nftMountsConfigured,player.nftMintableMounts,player.ownedPets,player.summonedPet,player.petLootMinQuality,player.zeppelin,connected,player.characterCreated,player.contracts,player.craftingXp,player.storeBoosts,player.travel?.mount,player.casting,player.autoAttack,party,partyInvites,dungeon,raid,arena,instantCombat,players.map(p=>[p.id,p.name,p.zone,p.hp,p.instanceId,p.pvp,p.arenaMatchId,p.arenaTeam,p.arenaEliminated,p.arenaPhase,p.duelOpponentId])]);
 if(hud===lastHUD)return;lastHUD=hud;
 const q=player.quest,c=getChapter(q),zone=getZone(player.zone);
 for(const region of ZONES)if(region.beacon)zoneHandle?.setRegionBeaconLit?.(region.id,q.chapter>=region.beacon.litChapter&&q.ending!=='release');
 const xpPercent=player.level>=MAX_LEVEL?100:Math.min(100,player.xp/(player.level*100)*100);
 $('xp-fill').style.width=`${xpPercent}%`;$('xp-label').textContent=player.level>=MAX_LEVEL?'MAX':`${xpPercent.toFixed(1)}%`;$('xp-label').title=`${player.xp} / ${player.level*100} XP`;$('level-label').textContent=`Lv. ${player.level}`;
 document.querySelector<HTMLElement>('.hud-job-xp-row')!.hidden=!SPECIALISTS_ENABLED;
 const specialist=activeSpecialist(player.raidProgress,player.appearance.className),jobLevel=specialist?specialistJobLevel(specialist.jobXp):0;
 const jobPercent=!specialist?0:jobLevel>=20?100:Math.max(0,Math.min(100,(specialist.jobXp-500*(jobLevel-1)**2)/(500*(jobLevel**2-(jobLevel-1)**2))*100));
 $('job-xp-fill').style.width=`${jobPercent}%`;$('job-level-label').textContent=jobLevel?`Job Lv. ${jobLevel}`:'Job Lv. —';$('job-xp-label').textContent=specialist?jobLevel>=20?'MAX':`${jobPercent.toFixed(1)}%`:SPECIALISTS_ENABLED?'No specialist':'SP disabled';$('job-xp-label').title=specialist?`${specialist.jobXp} specialist XP`:SPECIALISTS_ENABLED?'Equip a specialist card to gain Job XP':'Specialist classes are paused. Your cards and Job XP are preserved.';
 $('chapter-label').textContent=q.completed?'A STORY TO REMEMBER':`CHAPTER ${q.chapter+1} OF ${CHAPTERS.length}`;
 $('quest-title').textContent=q.completed?'A new morning':c.title;
 const next=c.objectives.find(o=>(q.progress[o.id]||0)<o.count);
 $('quest-summary').textContent=q.completed?'The lantern roads are yours to explore.':q.stage===0?'Speak with Rowan to begin.':player.zone!==c.zone?`Continue to ${getZone(c.zone).name}`:q.stage===2?`Speak with ${NPCS.find(n=>n.id===c.npcId)?.name||'the beacon'}`:next?.label||c.summary;
 $('quest-progress').textContent=q.completed&&q.ending?ENDINGS[q.ending].title:c.objectives.map(o=>`${o.label}: ${Math.min(q.progress[o.id]||0,o.count)}/${o.count}`).join(' · ');
 const story=trackedContractId?null:storyQuestTracker(player,trackedStoryQuestId);
 const meter=$<HTMLProgressElement>('quest-meter');meter.hidden=true;
 $('quest-state').textContent='';$('quest-reward').textContent='';$('quest-button').classList.remove('quest-ready');
 $('quest-open').textContent='Open details ›';
 const activeContract=CONTRACTS.find(contract=>contract.id===trackedContractId&&Object.hasOwn(player!.contracts.active,contract.id))||CONTRACTS.find(contract=>Object.hasOwn(player!.contracts.active,contract.id));
 if(isInstantCombatInstance(worldInstance)){ $('chapter-label').textContent='INSTANT COMBAT';$('quest-title').textContent=instantCombat?instantCombatStatus(instantCombat,Date.now()+serverOffset):'Cooperative arena';$('quest-summary').textContent=player.hp<=0?'Fallen · Returning to the world':instantCombat?.run?.objective||'Survive five rounds together.';$('quest-progress').textContent=`${instantCombat?.run?.members??0} adventurers · Open event details`; }
 else if(isRaidInstance(worldInstance)){ $('chapter-label').textContent='HORNED APOSTLE RAID';$('quest-title').textContent=RAID_PHASE_NAMES[raid?.phase??'forming'];$('quest-summary').textContent=raid?.objective??'Prepare your raid.';$('quest-progress').textContent=`${raid?.members.filter(member=>member.hp>0).length??0} standing · ${raid?.plane==='shadow'?'Shadow Realm':'Sanctum'}`; }
 else if(isArenaInstance(worldInstance)){ $('chapter-label').textContent='PRIVATE ARENA';$('quest-title').textContent=arena?`${arena.size}v${arena.size} match`:'Arena match';$('quest-summary').textContent=player.arenaEliminated?'Knocked out · Watch your team':player.arenaPhase==='active'?'Defeat the opposing team.':'Get ready for the countdown.';$('quest-progress').textContent='Knockout at 1 HP · Return after the match'; }
 else if(dungeon?.dream){$('chapter-label').textContent=dungeon.dream.kind==='nightmare'?'NIGHTMARE':'PLEASANT DREAM';$('quest-title').textContent=dungeon.name;$('quest-summary').textContent=dungeon.objectives[0];$('quest-progress').textContent=`${dungeon.room} / ${dungeon.rooms} dream caches opened · Collected keepsakes remain`;}
 else if(dungeon){$('chapter-label').textContent=dungeon.completed?'DUNGEON CLEARED':`${dungeon.name.toUpperCase()} · ${dungeon.room} / ${dungeon.rooms}`;$('quest-title').textContent=dungeon.completed?'The vault is quiet':dungeon.encounterName;$('quest-summary').textContent=dungeon.completed?'Collect your completion rewards, then use the final return portal.':dungeon.objectives[0]||'Explore the vault with your party.';$('quest-progress').textContent=`${dungeon.checkpoint.active?'Sanctuary secured':'No checkpoint'} · ${party?.members.length||1} adventurers`;}
 else if(story){
  $('chapter-label').textContent=`STORY QUEST · LEVEL ${story.quest.requiredLevel}`;
  $('quest-title').textContent=story.quest.title;
  $('quest-summary').textContent=story.ready?`Return to ${storyNpcName(story.quest.turnInNpcId??story.quest.npcId)}`:story.objective?.label??'Follow your journal objectives';
  $('quest-progress').textContent=story.ready?'All objectives complete':`${story.objectiveProgress} / ${story.objectiveTotal} · ${story.completed} of ${story.total} objectives complete`;
  meter.hidden=false;meter.max=story.ready?story.total:story.objectiveTotal;meter.value=story.ready?story.total:story.objectiveProgress;
  $('quest-state').textContent=story.ready?'Ready to return':'In progress';$('quest-reward').textContent=story.rewardText;
  $('quest-button').classList.toggle('quest-ready',story.ready);$('quest-open').textContent='Open journal ›';
 }
 else if(activeContract){const count=player.contracts.active[activeContract.id];$('chapter-label').textContent='ADVENTURE CONTRACT';$('quest-title').textContent=activeContract.label;$('quest-summary').textContent=count>=activeContract.count?`Return to a ${getZone(activeContract.zone).name} board or warden`:activeContract.description;$('quest-progress').textContent=`${count} / ${activeContract.count} · ${activeContract.reward.xp} XP · ${activeContract.reward.gold} gold`;}
 else{$('chapter-label').textContent='THE OPEN ROAD';$('quest-title').textContent='Choose your next adventure';$('quest-summary').textContent='Pick up a quest, gather supplies, or explore with a party.';$('quest-progress').textContent='Quest board · Workshop · Dungeons';}
 if(!isRaidInstance(worldInstance)&&!usesArenaWorld(worldInstance)&&!dungeon?.dream)updateOnboardingHUD();
 const hearthlingMarker=npcViews.get(HEARTHLING_NPC.id)?.label.querySelector('.npc-quest');
 if(hearthlingMarker)hearthlingMarker.textContent=player.meadGodPaid?'✦':'!';
 updatePartyHUD();
 updateLocation();
 npcLabel.querySelector('.npc-quest')!.textContent=q.completed?'✦':c.npcId===zone.npc.id?(q.stage===2||q.stage===0?'!':'…'):'';
 for(const [id,view] of npcViews){
  const stories=listStoryQuests(player,id);view.label.classList.toggle('has-story-quest',stories.length>0);let marker=view.label.querySelector<HTMLElement>('.story-npc-marker');
  if(!stories.length){marker?.remove();continue;}
  if(!marker){marker=document.createElement('span');marker.className='npc-quest story-npc-marker';view.label.prepend(marker);}
  const ready=stories.some(quest=>storyQuestReady(player!.storyQuests,quest.id)),available=stories.some(quest=>!Object.hasOwn(player!.storyQuests?.active??{},quest.id));
  marker.textContent=ready?'?':available?'!':'…';marker.setAttribute('aria-label',ready?'Quest ready to complete':available?'Quest available':'Quest in progress');
 }

 if(panel.open&&panel.dataset.mode==='training')renderTrainingPanel();
 if(panel.open&&panel.dataset.mode==='journal')renderJournal();
 renderHearthlingPanel();
 if(panel.open&&panel.dataset.mode==='professions')renderProfessions();
 if(panel.open&&panel.dataset.mode==='talents')renderTalentPanel();
 if(panel.open&&panel.dataset.mode==='gear')renderGearPanel();
 if(panel.open&&panel.dataset.mode==='inventory')renderInventory();
 if(panel.open&&panel.dataset.mode==='pets')renderPets();
 if(panel.open&&panel.dataset.mode==='shop')renderShopPanel();
 if(panel.open&&panel.dataset.mode==='spells')renderSpells();
 if(panel.open&&panel.dataset.mode==='map'&&mapSelection)renderMapDetails(mapSelection);
 if(panel.open&&panel.dataset.mode==='contracts')renderContractPanel();
 if(panel.open&&panel.dataset.mode==='crafting')renderCraftPanel();
 if(panel.open&&panel.dataset.mode==='dungeon')renderDungeonPanel();
}
function clearEntityViews(){
 clearChatBubbles();
 petFollowers.clear();combatCompanions.clear();
 clearUnitFrames();
 playerMenu.close();if(panel.open&&panel.dataset.mode==='inspect')closePanel();
 clearCombat();
 selectedId=hoveredId=null;targetRing.visible=false;
 for(const entry of mountViews.values())disposeMount(entry.mesh);mountViews.clear();
 for(const entry of remote.values()){removeRig(entry.mesh);entry.label.remove();}remote.clear();
 for(const entry of enemyMeshes.values()){removeRig(entry.mesh);entry.label.remove();}enemyMeshes.clear();
 for(const mesh of nodeMeshes.values())removeNode(mesh);nodeMeshes.clear();
 for(const entry of lootMeshes.values()){removeRig(entry.mesh);entry.label.remove();}lootMeshes.clear();
 players=[];enemies=[];nodes=[];loot=[];snapshotInstance=undefined;
}
const worldPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
function setWorldLoading(active:boolean,name=''){
 worldLoading=active;
 if(typeof inputActivity!=='undefined')inputActivity?.reset();
 const screen=$<HTMLDialogElement>('instance-loading'),visible=active&&!entryActive&&!rosterActive;
 if(name)$('instance-loading-title').textContent=`Entering ${name}`;
 $('play-ui').inert=active||entryActive||rosterActive;
 clearMovementKeys();
 screen.hidden=!visible;
 if(visible&&!screen.open)screen.showModal();else if(!visible&&screen.open)screen.close();
}
function zoneError(){
 setWorldLoading(false);worldReady=false;openPanel('The road is resting','WORLD CONNECTION','zone-error');
 $('panel-content').innerHTML='<p>This area could not load. Reload to resume at your saved position.</p><button id="zone-retry" class="primary-button">'+icon('respawn')+' Reload world</button>';
 $('zone-retry').onclick=()=>location.reload();
}
function visibleInDungeonRoom(point:{x:number;z:number}){
 return !worldDungeonKind||!!currentDungeonRoom&&Math.abs(point.x-currentDungeonRoom.x)<=currentDungeonRoom.width/2&&Math.abs(point.z-currentDungeonRoom.z)<=currentDungeonRoom.depth/2;
}
function updateDungeonRoomView(){
 if(!worldDungeonKind||!zoneHandle?.setDungeonRoom)return;
 const room=dungeonRoomAt(dungeonLayout(worldDungeonKind).rooms,position);
 if(!room||room===currentDungeonRoom)return;
 currentDungeonRoom=room;zoneHandle.setDungeonRoom(room.id);
 // A portal/checkpoint correction changes the room immediately; effects never trail across the void.
 clearCombat();treasureEffects.clear();dungeonAttackCues.clear();
 selectedId=hoveredId=null;targetRing.visible=false;
 $('game').dataset.dungeonRoom=room.id;
}
const collisionLoads = new Map<string, Promise<void>>();
const depletedResources: Record<string, boolean> = {};
function currentCollisionScene() { return collisionSceneKey(worldInstance, dungeon?.kind, raid?.approach?.roomIndex, instantCombat?.run?.mapId); }
function loadCollisionScene(key: string) {
 if(!collisionLoads.has(key)) collisionLoads.set(key, (async()=>{
  const json=await fetch(`/collision/${key}.json`,{cache:'no-cache'});
  if(!json.ok)throw Error(`Could not load solid scenery: ${key}`);
  const data=await json.json(),binary=await fetch(`/collision/${key}.bin?v=${data.binarySha256}`);
  if(!binary.ok)throw Error(`Could not load solid scenery: ${key}`);
  const bytes=await binary.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==data.binarySha256)throw Error('The solid scenery update is incomplete. Reload to try again.');
  await installCollisionScene(key,data,bytes);
 })().catch(error=>{collisionLoads.delete(key);throw error;}));
 return collisionLoads.get(key)!;
}
function syncCollisionState(){
 const key=currentCollisionScene();if(!key||!hasCollisionScene(key))return;
 if(dungeon)updateCollisionSceneState(key,dungeonCollisionFlags(dungeon.kind,dungeon.objects.filter(o=>o.activated||o.opened).map(o=>o.id),dungeon.clearedStages,dungeon.completed,!!dungeon.dream,Date.now()+serverOffset));
 else if(!worldInstance){for(const node of nodes){if(node.available)delete depletedResources[`depleted:${node.id}`];else depletedResources[`depleted:${node.id}`]=true;}updateCollisionSceneState(key,depletedResources);}
}
function playerRouteAllowed(from:{x:number;z:number},to:{x:number;z:number}){return collisionRouteAllowed(from,to,worldInstance,dungeon?.kind,instantCombat?.run?.mapId);}
function localSwimming(){return jump.grounded&&!worldInstance&&waterAt(position.x,position.z)&&jump.y<=jumpFloor(position.x,position.z)+.1;}
async function switchZone(id:ZoneId,instanceId:string|null=worldInstance){
 // Travel corrections can arrive before the event snapshot identifies the assigned arena.
 if(isInstantCombatInstance(instanceId)&&instantCombat?.run?.id!==instanceId){worldReady=false;return;}
 let revision:number|undefined;
 try{
 const instanceChanged=worldInstance!==instanceId;
 if(instanceChanged){deathPresented=false;clearWaypoint();if(panel.open)closePanel();}
 const nextKind=instanceId&&!usesArenaWorld(instanceId)&&!isRaidInstance(instanceId)?dungeon?.kind??'rootvault':null,dungeonChanged=nextKind!==worldDungeonKind;worldDungeonKind=nextKind;if(dungeonChanged)dungeonAttackCues.clear();
 const regionChanged=worldZone!==id;worldZone=id;worldInstance=instanceId;
 if(instanceChanged||dungeonChanged||renderedInstance!==instanceId||!zoneHandle||!worldReady&&!worldLoading){
  revision=++zoneRevision;worldReady=false;clearEntityViews();
  const dreamKind=dungeon?.dream?.kind;
  const collisionKeys=isRaidInstance(instanceId)?Array.from({length:8},(_,i)=>`raid-${i}`):[currentCollisionScene()!];
  setWorldLoading(true,isInstantCombatInstance(instanceId)?instantCombatMap(instantCombat?.run?.mapId).name:isRaidInstance(instanceId)?APOSTLE_RAID.name:isArenaInstance(instanceId)?'Thornring Arena':instanceId?getDungeon(nextKind!)!.name:getZone(id).name);
  // Paint the cover before scene construction can occupy the main thread.
  await worldPaint();if(revision!==zoneRevision)return;
  await Promise.all(collisionKeys.map(loadCollisionScene));if(revision!==zoneRevision)return;
  const destination=new THREE.Scene();destination.background=scene.background;
  const next=await (isRaidInstance(instanceId)?createRaidWorld(destination):isInstantCombatInstance(instanceId)?createInstantCombatWorld(destination,instantCombatMap(instantCombat?.run?.mapId).id):isArenaInstance(instanceId)?createArenaWorld(destination):instanceId?createDungeonWorld(destination,nextKind!,dreamKind):createOverworld(destination));
  let nextStory: Awaited<ReturnType<typeof createStoryWorld>> | undefined;
  try { if(!instanceId)nextStory=await createStoryWorld(destination); } catch(error) { next.dispose(); throw error; }
  if(revision!==zoneRevision){nextStory?.dispose();next.dispose();return;}
  storyWorld?.dispose();storyWorld=nextStory;
  // Build off-screen so an interrupted load cannot reveal partial or stale geometry.
  scene.add(destination);
  const dispose=next.dispose,update=next.update;
  next.dispose=()=>{dispose();destination.removeFromParent();};
  next.update=(...args)=>{destination.background=scene.background;update(...args);};
  for(const resident of [...VILLAGE_NPCS,...TRAINER_NPCS,GOLD_MERCHANT,HEARTHLING_NPC,...CITY_SERVICE_NPCS]){npcViews.get(resident.id)?.label.remove();npcViews.delete(resident.id);}
  zoneHandle?.dispose();zoneHandle=next;renderedInstance=instanceId;colliders=next.colliders;updateWorld=next.update;
  currentDungeonRoom=undefined;renderer.clippingPlanes=next.dungeonRoomClipping??[];updateDungeonRoomView();
  if(!next.setDungeonRoom)delete $('game').dataset.dungeonRoom;
  zoneMarkers.forEach(m=>m.el.remove());zoneMarkers=[];
  for(const view of npcViews.values()){view.mesh.visible=!instanceId;view.label.hidden=!!instanceId;}
  if(!instanceId){
   for(const resident of [...VILLAGE_NPCS,...TRAINER_NPCS,GOLD_MERCHANT,HEARTHLING_NPC,...CITY_SERVICE_NPCS]){
    const mesh=next.villagers?.get(resident.id);if(!mesh)continue;
    const trainer=TRAINER_NPCS.find(n=>n.id===resident.id)||CITY_VENDORS.find(n=>n.id===resident.id)||CITY_SERVICE_NPCS.find(npc=>npc.id===resident.id);
    const el=label(resident.id,resident.name,resident.id===HEARTHLING_NPC.id?HEARTHLING_NPC.title:resident.id===GOLD_MERCHANT.id?GOLD_MERCHANT.title:resident.id===SHADY_MERCHANT.id?'Shady merchant · MOSS vouchers':trainer?trainer.title:`${resident.role==='warden'?'Local quests':resident.role==='merchant'?'Supplies & trade':'Rest & healing'} · ${VILLAGES.find(v=>v.id===('villageId' in resident?resident.villageId:''))?.name||'Village'}`);
    if(resident.role==='warden'||resident.id===HEARTHLING_NPC.id)el.insertAdjacentHTML('afterbegin','<span class="npc-quest">!</span>');
    npcViews.set(resident.id,{mesh,label:el});
   }
   const colors:Record<ZoneId,Partial<Appearance>>={greenwood:{hair:'#d7d4b8',outfit:'#607078'},amberwild:{hair:'#a65d37',outfit:'#ac714a',className:'Ranger'},frostmarch:{hair:'#dae8ee',outfit:'#64869e',className:'Mage'},hollow:{hair:'#d9bbeb',outfit:'#756083',accent:'#bb99e0',className:'Mage'},sunveil:{hair:'#4e3025',outfit:'#b57942',accent:'#e9c778',className:'Ranger'},mistwood:{hair:'#293a2d',outfit:'#397965',accent:'#bbd985',className:'Cleric'}};
   for(const zone of ZONES){
    let view=npcViews.get(zone.npc.id);if(!view){const mesh=makeCharacter({...defaultAppearance,hairStyle:'long',accent:'#e5ba71',className:'Mage',...colors[zone.id]});scene.add(mesh);const el=label(zone.npc.id,zone.npc.name,zone.npc.title);el.insertAdjacentHTML('afterbegin','<span class="npc-quest">!</span>');view={mesh,label:el};npcViews.set(zone.npc.id,view);}
    const at=toWorld(zone.id,zone.npc);view.mesh.position.set(at.x,buildingFloorHeight(at.x,at.z),at.z);view.mesh.visible=true;view.label.hidden=false;
    for(const [kind,name,point] of [['board','Quest board',{x:3,z:2}],['workshop','Workshop',{x:-4,z:3}]] as const){const at=toWorld(zone.id,point),markerId=`${kind}-${zone.id}`,el=label(markerId,name,zone.name);zoneMarkers.push({el,x:at.x,z:at.z,id:markerId});}
    if(zone.beacon){const b=toWorld(zone.id,zone.beacon),el=label(b.id,b.name,'Lantern of the old roads');zoneMarkers.push({el,x:b.x,z:b.z,id:b.id});}
   }
   for(const booth of POLL_BOOTHS)zoneMarkers.push({el:label(booth.id,'Polling booth','Community proposals'),x:booth.modelX,z:booth.modelZ,id:booth.id});
   for(const object of STORY_OBJECTS)zoneMarkers.push({el:label(object.id,object.name,'Quest objective'),x:object.x,z:object.z,id:object.id});
   for(const port of ZEPPELIN_PORTS)zoneMarkers.push({el:zeppelinMarker(port.id),x:port.x,z:port.z,id:`zeppelin-${port.id}`});
   zoneMarkers.push({el:label('arena-entrance','Arena matches','Solo · 2v2 · 3v3 · Queue anywhere'),...ARENA_ENTRANCE,id:'arena-entrance'});
   for(const entry of DUNGEONS){
    const id=entry.id==='rootvault'?'dungeon-entrance':`dungeon-entrance-${entry.id}`,stoneId=`dungeon-summon-${entry.id}`;
    zoneMarkers.push({el:label(id,entry.name,`Moss Gate · Levels ${entry.minLevel}–${entry.maxLevel}`),...entry.entrance,id});
    zoneMarkers.push({el:label(stoneId,'Summon stone','Bring your party here'),...entry.summonStone,id:stoneId});
   }
  }else if(!usesArenaWorld(instanceId)&&!isRaidInstance(instanceId)){
   zoneMarkers.push({el:label('dungeon-exit',dungeon?.dream?'Wake up':'Leave dungeon',dungeon?.dream?'Return to your bed':'Return to the entrance'),...DUNGEON_EXIT,id:'dungeon-exit'});
   zoneMarkers.push({el:label('dungeon-return',dungeon?.dream?'Wake up':'Return portal',dungeon?.dream?'Return to your bed':'Dungeon cleared'),...dungeonReturn(dungeon?.kind),id:'dungeon-return'});
   for(const object of dungeon?.dream?dungeon.objects:dungeonLayout(worldDungeonKind??'rootvault').objects)zoneMarkers.push({el:label(object.id,object.label,object.kind==='seal'?'Rune seal':object.kind==='chest'?(dungeon?.dream?'Dream keepsakes':'Hidden treasure'):'Rest and revive'),x:object.x,z:object.z,id:object.id});
   for(const gate of dungeonLayout(worldDungeonKind??'rootvault').gates)zoneMarkers.push({el:label(gate.id,'Gate closed',gate.seals?.length?'Clear both wings and activate their seals':'Clear the monsters to open'),...gate});
   for(const portal of dungeonLayout(worldDungeonKind??'rootvault').portals)zoneMarkers.push({el:label(portal.id,'Sealed','Defeat enemies to unlock'),...portal});
   zoneHandle?.setDungeonState?.(dungeon,Date.now()+serverOffset);
  }
 }
 const zone=getZone(id);dayNight.update(Date.now()+serverOffset,id,!!instanceId&&!usesArenaWorld(instanceId),position,camera,isRaidInstance(instanceId),isInstantCombatInstance(instanceId)?instantCombat?.run?.mapId:undefined);applyGraphicsFog();
 const view=npcViews.get(zone.npc.id);if(view){npc=view.mesh;npcLabel=view.label;}
 if(regionChanged||!lastHUD)updateLocation(true);
 lastHUD='';updateHUD();syncEntities();
 if(revision!==undefined){
  // A correction may arrive before the destination's players and enemies.
  while(!entryActive&&!rosterActive&&snapshotInstance!==instanceId){
   await worldPaint();if(revision!==zoneRevision)return;
  }
  syncEntities();syncCollisionState();worldReady=true;
  // A covered frame prepares the arrival camera, companions and world effects.
  await worldPaint();if(revision!==zoneRevision)return;
  renderer.compile(scene,camera);renderer.render(scene,camera);
  await worldPaint();if(revision!==zoneRevision)return;
  setWorldLoading(false);
 }
 }catch(error){
  if(revision!==undefined&&revision!==zoneRevision)return;
  setWorldLoading(false);throw error;
 }
}
const guideMenus: {id:string;feature:OnboardingFeature;label:string;key:string}[] = [
 {id:'inventory-button',feature:'bag',label:'Backpack',key:'b'}, {id:'customize-button',feature:'gear',label:'Character & gear',key:'c'},
 {id:'journal-button',feature:'contracts',label:'Quest board',key:'j'}, {id:'spells-button',feature:'professions',label:'Combat & professions',key:'k'},
 {id:'talents-button',feature:'talents',label:'Skill Tree',key:'n'}, {id:'crafting-button',feature:'crafting',label:'Crafting',key:'f'},
];
const guideUnlocks: [OnboardingFeature,string][]=[...guideMenus.map(menu=>[menu.feature,menu.label] as [OnboardingFeature,string]),['party','Who · party invitations'],['spells','Spellbook & class training'],['dungeon','Dungeons'],['auction','Auction house · visit Merrick'],['mounts','Riding lessons & mounts · visit the stable']];
let menuOwner='',unlockedMenus=new Set<string>(),guideViewAt=-Infinity;
function allowFeature(feature:OnboardingFeature){
 if(!player||onboardingFeatureUnlocked(player,feature))return true;
 toast(onboardingLockReason(player,feature));return false;
}
function acknowledgeGuide(panel:'bag'|'gear'){
 const state=player?.onboarding,now=performance.now();
 if(!state||state.completed||state[panel==='bag'?'bagViewed':'gearViewed']||panel==='gear'&&!state.bagViewed||now-guideViewAt<1500)return;
 guideViewAt=now;send({type:'onboardingViewed',panel});
}
function updateOnboardingHUD(){
 if(!player)return;
 const step=getOnboardingStep(player),fresh=menuOwner!==player.id;
 if(fresh){menuOwner=player.id;unlockedMenus.clear();}
 const card=$('quest-button');card.classList.toggle('guided-quest',!!step);
 document.body.classList.toggle('onboarding-active',!!step);
 card.querySelector('.quest-line')?.setAttribute('aria-live','polite');
 if(step){
  $('quest-meter').hidden=true;$('quest-reward').textContent='';$('quest-state').textContent='Starter guide';card.classList.remove('quest-ready');$('quest-open').textContent='Follow guide ›';
  $('chapter-label').textContent=`ROWAN'S GUIDE · ${step.index} / ${step.total}`;
  $('quest-title').textContent=step.title;$('quest-summary').textContent=step.description;$('quest-progress').textContent=step.hint.replace(/\b(WASD|E|1|B|C|K|J)\b/g,key=>key==='WASD'?['w','a','s','d'].map(bindingLabel).join(' / '):bindingLabel(key.toLowerCase()));
  card.title=step.action?`Open your ${step.action}`:'Show the route to your next lesson';
 }else card.title='Open your quest journal';
 for(const menu of guideMenus){
  const button=$(menu.id),unlocked=onboardingFeatureUnlocked(player,menu.feature)||menu.feature==='contracts'&&!!(player.treasureMap||player.carriedItems?.['treasure-map']),menuLabel=`${menu.label} · ${bindingLabel(menu.key)}`;
  button.classList.toggle('onboarding-locked',!unlocked);button.setAttribute('aria-disabled',String(!unlocked));
  button.title=unlocked?menuLabel:onboardingLockReason(player,menu.feature);
  button.setAttribute('aria-label',unlocked?menuLabel:`${menuLabel} · ${button.title}`);
  button.classList.toggle('onboarding-next',step?.action===menu.feature);
 }
 for(const [feature,label] of guideUnlocks)if(onboardingFeatureUnlocked(player,feature)){
  if(!fresh&&!unlockedMenus.has(feature))toast(`Unlocked: ${label}`,'reward');unlockedMenus.add(feature);
 }
}
function guideDestination(stepId:string): (WorldMapPoint & {id:string})|undefined {
 let candidates:(WorldMapPoint & {id:string})[]=[];
 if(stepId==='meet-rowan'||stepId==='return-rowan')return {...NPCS[0],label:'Rowan'};
 if(stepId==='train-spell'){const trainer=TRAINER_NPCS.find(n=>n.zone==='greenwood'&&n.className===player?.appearance.className);return trainer?{...trainer,label:trainer.name}:undefined;}
 if(stepId==='accept-contract')return {id:'board-greenwood',x:3,z:2,label:'Quest board'};
 if(stepId==='loot')candidates=loot.filter(drop=>drop.ownerId===playerId&&!drop.instanceId&&drop.expiresAt>Date.now()+serverOffset).map(drop=>({...drop,label:'Your fallen foe · right-click to loot'}));
 if(stepId==='first-kill'||stepId==='finish-hunt'||stepId==='loot'&&!candidates.length){
  candidates=enemies.filter(e=>e.zone==='greenwood'&&e.kind==='moss-slime'&&e.alive).map(e=>({...e,label:'Woodland slime'}));
  if(!candidates.length)candidates=OVERWORLD_SPAWNS.filter(e=>e.zone==='greenwood'&&e.kind==='moss-slime').map(e=>({...e,label:'Woodland slimes'}));
 }
 if(stepId==='gather-crystals'){
  candidates=nodes.filter(n=>n.zone==='greenwood'&&n.kind==='crystal'&&n.available).map(n=>({...n,label:'Grove crystal · right-click to mine'}));
  if(!candidates.length)candidates=getZone('greenwood').nodes.filter(n=>n.kind==='crystal').map(n=>({...n,label:'Grove crystals'}));
 }
 return candidates.sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
}
function followStarterGuide(openLesson=true){
 if(!player||!worldReady||player.hp<=0||worldInstance)return;
 const step=getOnboardingStep(player);if(!step)return;
 if(openLesson&&step.action){step.action==='bag'?openInventory():openCharacter();return;}
 const point=guideDestination(step.id);if(!point){clearWaypoint();return;}
 if(openLesson&&panel.open)closePanel();
 if(setWaypoint(point)){
  guideTargetId=point.id;
  // The existing collision-aware route only steers the arrow; movement remains manual.
  guideRoute=findPath(position,point,colliders,WORLD_BOUNDS);
 }
}
function updateGuideWaypoint(now:number){
 if(!player||!worldReady||!connected||entryActive||rosterActive||player.zeppelin)return;
 if(player.hp<=0){guideWasAlive=false;return;}
 if(panel.open&&(panel.dataset.mode==='inventory'||panel.dataset.mode==='gear'))acknowledgeGuide(panel.dataset.mode==='gear'&&player.onboarding?.bagViewed&&onboardingFeatureUnlocked(player,'gear')?'gear':'bag');
 if(worldInstance)return;
 const step=getOnboardingStep(player),key=`${player.id}:${step?.id||'done'}`;
 if(key!==guideKey||!guideWasAlive){
  const changedOwner=guideOwner!==player.id;guideOwner=player.id;guideKey=key;guideWasAlive=true;
  if(step){clearWaypoint();followStarterGuide(false);}
  else if(guideTargetId||changedOwner)clearWaypoint();
 }
 if(step&&guideTargetId&&now>=guideRetryAt){
  guideRetryAt=now+1500;
  const target=targetPoints().find(p=>p.id===guideTargetId);
  if(!target||waypoint&&Math.hypot(target.x-waypoint.x,target.z-waypoint.z)>1)followStarterGuide(false);
 }
}
function clearWaypoint(){waypoint=null;guideRoute=[];guideTargetId=undefined;waypointIndicator.update(null,position,yaw);groundWaypoint.update(null,undefined,position,elapsed);}
function setWaypoint(point:WorldMapPoint & {name?:string}){
 if(!player||!connected||!worldReady||player.hp<=0)return false;
 const bounds=currentWorldBounds();
 if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||point.x<bounds.minX||point.x>bounds.maxX||point.z<bounds.minZ||point.z>bounds.maxZ)return false;
 if(worldInstance&&!usesArenaWorld(worldInstance)&&dungeon?.kind){
  const layout=dungeonLayout(dungeon.kind),roomAt=(at:{x:number;z:number})=>layout.rooms.find(room=>Math.abs(at.x-room.x)<=room.width/2&&Math.abs(at.z-room.z)<=room.depth/2);
  const from=roomAt(position),to=roomAt(point);
  if(from&&to&&from.id!==to.id&&layout.portals.length){
   // ponytail: scan this bounded 25-room graph; index outgoing links if dungeons grow larger.
   const visited=new Set([from.id]),queue=layout.portals.filter(portal=>portal.roomId===from.id).map(portal=>({room:portal.targetRoomId,first:portal}));
   let next:typeof layout.portals[number]|undefined;
   for(let i=0;i<queue.length;i++){
    const step=queue[i];if(step.room===to.id){next=step.first;break;}if(visited.has(step.room))continue;visited.add(step.room);
    for(const portal of layout.portals.filter(portal=>portal.roomId===step.room))queue.push({room:portal.targetRoomId,first:step.first});
   }
   if(!next){toast('No room portal leads to that chamber.');return false;}
   point={id:next.id,x:next.x,z:next.z,label:`Portal to ${next.label}`};
  }
 }
 guideTargetId=undefined;waypoint={...point,label:point.name||point.label||'Waypoint',instanceId:worldInstance};
 guideRoute=findPath(position,point,colliders,bounds);
 updateWaypoint();return true;
}
function updateWaypoint(){
 updateGuideWaypoint(performance.now());
 if(waypoint&&waypoint.instanceId!==worldInstance)clearWaypoint();
 const visible=!!player&&connected&&worldReady&&!rosterActive&&!entryActive&&player.hp>0&&!player.zeppelin;
 const objective=waypoint?.id?targetPoints().find(point=>point.id===waypoint!.id):undefined;
 if(visible&&waypoint&&!objective&&!guideTargetId&&Math.hypot(waypoint.x-position.x,waypoint.z-position.z)<=3){clearWaypoint();toast('Waypoint reached.');}
 if(!player?.zeppelin)advanceWaypointRoute(guideRoute,position,next=>canTraverse(position,next,colliders,currentWorldBounds()));
 const destination=waypoint&&objective?{...waypoint,x:objective.x,z:objective.z,height:objective.height}:waypoint;
 const next=objective&&Math.hypot(objective.x-position.x,objective.z-position.z)<=22&&canTraverse(position,objective,colliders,currentWorldBounds())?objective:guideRoute[0];
 const direction=destination&&next?{...destination,...next}:destination;
 const show=visible&&!modalOpen()&&objectiveGuidance;
 waypointIndicator.update(show?direction:null,position,yaw);
 groundWaypoint.update(show?destination:null,next,position,elapsed);
}
function targetPoints(): TargetInfo[]{
 if(player?.zeppelin)return [];
 const interactables:TargetInfo[]=usesArenaWorld(worldInstance)||isRaidInstance(worldInstance)?[]:worldInstance?[{id:'dungeon-exit',...DUNGEON_EXIT,kind:'dungeon',name:dungeon?.dream?'Wake up':'Leave dungeon',label:dungeon?.dream?'Return to your bed':'Return to the entrance',height:3.6},...(dungeon?.completed?[{id:'dungeon-return',...dungeonReturn(dungeon?.kind),kind:'dungeon' as const,name:dungeon?.dream?'Wake up':'Return portal',label:dungeon?.dream?'Return to your bed':'Return to the entrance',height:4}]:[]),...(dungeon?.objects||[]).filter(object=>object.kind!=='chest'||!object.activated).map(object=>({id:object.id,x:object.x,z:object.z,kind:'dungeon' as const,name:object.label,label:object.kind==='seal'?'Activate rune seal':object.kind==='chest'?(dungeon?.dream?'Open dream cache':'Open treasure cache'):'Attune checkpoint',height:2.5}))]:ZONES.flatMap(zone=>[
  {...toWorld(zone.id,zone.npc),kind:'npc' as const,label:`Talk to ${zone.npc.name}`,height:3.1},
  {...toWorld(zone.id,{x:3,z:2}),id:`board-${zone.id}`,kind:'board' as const,name:`${zone.name} quest board`,label:'Read quests',height:3.1},
  {...toWorld(zone.id,{x:-4,z:3}),id:`workshop-${zone.id}`,kind:'workshop' as const,name:`${zone.name} workshop`,label:'Open workshop',height:2.5},
  ...(zone.beacon?[{...toWorld(zone.id,zone.beacon),kind:'beacon' as const,label:`Ignite ${zone.beacon.name}`,height:3.6}]:[]),
 ]);
 if(worldInstance&&!usesArenaWorld(worldInstance)&&dungeon?.kind)for(const portal of dungeonLayout(dungeon.kind).portals){
  const open=!!dungeon.dream||dungeonRoomPortalOpen(portal,dungeon.clearedStages,dungeon.objects.filter(object=>object.activated||object.opened).map(object=>object.id));
  interactables.push({id:portal.id,x:portal.x,z:portal.z,kind:'dungeon',name:portal.label,label:open?`Next room · ${portal.label}`:portal.seals?.length?'Sealed · Clear enemies and activate the seals':'Sealed · Defeat enemies to unlock',height:2.5});
 }
 if(!worldInstance)interactables.push(...POLL_BOOTHS.map(booth=>({...booth,kind:'poll' as const,label:'Read polls and vote',height:3.1})));
 if(!worldInstance)interactables.push(...storyWorld?.targets()??[]);
 const mapTarget=!worldInstance?treasureMapTarget(player,position):undefined;if(mapTarget)interactables.push(mapTarget);
 if(!worldInstance)interactables.push(...[...VILLAGE_NPCS,...TRAINER_NPCS,GOLD_MERCHANT,HEARTHLING_NPC,...CITY_SERVICE_NPCS].map(resident=>({...resident,kind:'npc' as const,label:`Talk to ${resident.name}`,height:resident.id===HEARTHLING_NPC.id?4.95:3})));
 if(!worldInstance)for(const [id,citizen] of zoneHandle?.citizens||[])if(citizen.mesh.visible)interactables.push({id,kind:'npc',x:citizen.mesh.position.x,z:citizen.mesh.position.z,name:citizen.name,label:`Select ${citizen.name}`,height:3});
 if(!worldInstance){
  const buildingId=buildingAt(position.x,position.z)?.id;
  interactables.push(...BUILDING_BEDS.filter(bed=>bed.buildingId===buildingId).map(bed=>({...bed,kind:'bed' as const,name:'Restful bed',label:'Rest and dream',height:1.4})));
  interactables.push(...BUILDING_CHAIRS.filter(chair=>chair.buildingId===buildingId).map(chair=>({...chair,kind:'chair' as const,name:'Wooden chair',label:player?.seated?.chairId===chair.id?'Stand up':'Sit down',height:1.5})));
 }
 if(!worldInstance)interactables.push(...WORLD_CURIOS.map(point=>({...point,kind:'landmark' as const,label:'Examine',height:1.7})),...RESOURCE_SITES.map(site=>({...site,z:site.z+15,kind:'landmark' as const,label:'Read gathering site sign',height:2.2})));
 if(!worldInstance)interactables.push({...ARENA_ENTRANCE,id:'arena-entrance',kind:'arena',name:'Arena matches',label:'Solo · 2v2 · 3v3 matches',height:4});
 if(!worldInstance)interactables.push(...ZEPPELIN_PORTS.map(port=>({...port,id:`zeppelin-${port.id}`,kind:'zeppelin' as const,name:`${port.name} sky dock`,label:player?.zeppelinPorts?.includes(port.id)?'Choose a zeppelin destination':'Discover this sky dock',height:4})));
 if(!worldInstance)for(const entry of DUNGEONS)interactables.push(
  {...entry.entrance,id:entry.id==='rootvault'?'dungeon-entrance':`dungeon-entrance-${entry.id}`,kind:'dungeon',name:entry.name,label:`Enter Moss Gate · Level ${entry.minLevel}`,height:4},
  {...entry.summonStone,id:`dungeon-summon-${entry.id}`,kind:'dungeon',name:`${entry.name} summon stone`,label:'Summon party members',height:3});
 return [...interactables,
  ...players.filter(p=>p.hp>0&&!p.gm?.invisible&&(p.instanceId??null)===worldInstance).map(p=>({id:p.id,x:p.x,z:p.z,kind:'player' as const,name:p.name,label:isHostilePlayer(player,p)?`Attack ${p.name}`:`Player options for ${p.name}`,height:3.6})),
  ...players.filter(p=>combatCompanionOwner([p],`companion:${p.id}`)&&(p.instanceId??null)===worldInstance).map(p=>({id:`companion:${p.id}`,x:p.combatCompanion!.x,z:p.combatCompanion!.z,kind:'companion' as const,name:`${p.name}’s ${MONSTERS[p.combatCompanion!.kind].name}`,label:isHostileTarget(player,{id:`companion:${p.id}`,kind:'companion'},players)?`Attack ${p.name}’s companion`:`Select ${p.name}’s companion`,height:2})),
  ...nodes.filter(n=>n.available).map(n=>({id:n.id,x:n.x,z:n.z,kind:'node' as const,name:RESOURCE_TYPES[n.kind].label,label:`${RESOURCE_TYPES[n.kind].verb} ${RESOURCE_TYPES[n.kind].label}`,height:(RESOURCE_TYPES[n.kind].height??(n.kind==='timber'?3.1:1.2))+.3})),
  ...enemies.filter(e=>e.alive&&e.hp>0&&(e.instanceId??null)===worldInstance).map(e=>({id:e.id,x:e.x,z:e.z,kind:'enemy' as const,name:e.name,label:`Attack ${e.name}`,height:(enemyMeshes.get(e.id)?.height??MONSTERS[e.kind].height)+.35})),
  ...loot.filter(drop=>!drop.diedAt||deathProgress(drop.diedAt)===1).map(drop=>({id:drop.id,x:drop.x,z:drop.z,kind:'loot' as const,name:drop.sourceObjectId||drop.instantCombatRound?drop.name:`${drop.name} remains`,label:`Loot ${drop.name}`,height:lootMeshes.get(drop.id)?.height||1.5})),
 ].filter(visibleInDungeonRoom).filter(point=>!['enemy','player','companion'].includes(point.kind)||Math.hypot(point.x-position.x,point.z-position.z)<=42);
}
function cancelGathering(){
 if(!gatherRequested&&(!player?.gathering||player.gathering.startedAt===cancelledGather))return;
 gatherRequested=false;
 if(player?.gathering)cancelledGather=player.gathering.startedAt;
 if(connected)send({type:'cancelGather'});
}
function cancelCasting(ability?:AbilityId){
 if(ability&&player?.casting?.ability!==ability){if(connected)send({type:'cancelCast',ability});return;}
 if (!player?.casting || player.casting.startedAt === cancelledCast) return;
 cancelledCast = player.casting.startedAt;
 lastPrimary = 0;
 if (connected) send({type:'cancelCast',...(ability?{ability}:{})});
}
function clearInteraction(from:{x:number;z:number},point:{x:number;z:number}){
 const bounds=currentWorldBounds(),openCenter=canTraverse(point,point,colliders,bounds);
 return canTraverse(from,openCenter?point:from,colliders,bounds);
}
let standingChairId:string|null=null;
function standUp(){
 if(!player?.seated||standingChairId===player.seated.chairId)return;
 standingChairId=player.seated.chairId;send({type:'stand'});
}
function nearbyInteraction(points=targetPoints()){
 return selectedId?points.find(point=>point.id===selectedId):chooseTarget(points.filter(point=>point.kind!=='enemy'&&point.kind!=='player'&&point.kind!=='companion'&&!zoneHandle?.citizens?.has(point.id)&&(point.kind==='zeppelin'||Math.hypot(point.x-position.x,point.z-position.z)<=3)),null,position,8);
}
function interactNearby(){
 const point=nearbyInteraction();
 if(!point){toast("You're to far away");return;}
 if(point.kind==='player'){const other=players.find(p=>p.id===point.id);if(other?.id===playerId)toggleCharacter();else if(other&&isHostilePlayer(player,other))setAutoAttack(other.id);else if(other){const rect=$('unit-target').getBoundingClientRect();openPlayerMenu(other,rect.left,rect.bottom);}return;}
 if(point.kind==='companion'){if(isHostileTarget(player,point,players))setAutoAttack(point.id);return;}
 if(point.kind==='enemy'){toast(`Right-click this foe or press ${bindingLabel('t')} to auto attack.`);return;}
 // Ambient townsfolk are selectable, but have no server-owned service or dialogue.
 if(zoneHandle?.citizens?.has(point.id))return;
 if(point.kind==='arena'){openArena();return;}
 if(point.kind==='zeppelin'){openZeppelin(point.id.slice(9) as ZoneId);return;}
 if(Math.hypot(point.x-position.x,point.z-position.z)>3){toast("You're to far away");return;}
 if(point.kind==='bed'){
  const bed=BUILDING_BEDS.find(bed=>bed.id===point.id)!;
  if(!clearInteraction(position,bed.approach)){toast('Walk to the aisle beside the bed.');return;}
  clearMovementKeys();cancelCasting();cancelGathering();
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  send({type:'interact',targetId:bed.id});return;
 }
 if(point.kind==='chair'){
  if(player?.seated?.chairId===point.id){standUp();return;}
  const chair=BUILDING_CHAIRS.find(chair=>chair.id===point.id)!;
  const approach={x:chair.x+Math.sin(chair.rotation)*.85,z:chair.z+Math.cos(chair.rotation)*.85};
  if(buildingAt(position.x,position.z)?.id!==chair.buildingId||!clearInteraction(position,approach)){toast('Walk inside and approach the chair.');return;}
  clearMovementKeys();cancelCasting();cancelGathering();standingChairId=null;
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  send({type:'sit',chairId:chair.id});return;
 }
 standUp();
 if(!point.id.startsWith('dungeon-summon-')&&!clearInteraction(position,point)){toast('That target is blocked. Move around the obstacle.');return;}
 if(point.kind==='treasure-map'){
  const expedition=player?.treasureMap;if(!expedition)return;
  if(expedition.stage==='guardian'){toast('Defeat the treasure guardian to unlock the chest.');return;}
  clearMovementKeys();cancelCasting();cancelGathering();
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  send({type:expedition.stage==='search'?'treasureMapSearch':'treasureMapOpen',expeditionId:expedition.id});
 }
 else if(point.kind==='poll'){
  stopForSocialUI();send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  send({type:'pollOpen',boothId:point.id});
 }
 else if(point.kind==='board'){openContracts(point.id.slice(6) as ZoneId);}
 else if(point.kind==='workshop'){openCrafting();}
 else if(point.kind==='dungeon'){
  const portal=dungeon?.kind?dungeonLayout(dungeon.kind).portals.find(portal=>portal.id===point.id):undefined;
  if(portal){
   if(!dungeon?.dream&&!dungeonRoomPortalOpen(portal,dungeon?.clearedStages??[],dungeon?.objects.filter(object=>object.activated||object.opened).map(object=>object.id)??[])){toast(portal.seals?.length?'Defeat the guardians and activate the seals to unlock this portal.':'Defeat enemies in this chamber to unlock the portal.');return;}
   clearMovementKeys();clearWaypoint();setAutoAttack(null);cancelCasting();cancelGathering();selectedId=hoveredId=null;
   send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
   send({type:'dungeonInteract',targetId:portal.id});return;
  }
  const object=dungeon?.objects.find(object=>object.id===point.id);
  if(!object){const entry=DUNGEONS.find(entry=>point.id===`dungeon-summon-${entry.id}`||point.id===`dungeon-entrance-${entry.id}`||entry.id==='rootvault'&&point.id==='dungeon-entrance');openDungeon(entry?.id);return;}
  if(!object.available||object.activated){toast(object.activated?'Already claimed.':'Defeat the nearby guardians first.');return;}
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  send({type:'dungeonInteract',targetId:object.id});
 }
 else if(point.kind==='node'||point.kind==='loot'){
  if(point.kind==='node'&&player?.gathering&&player.gathering.startedAt!==cancelledGather)return;
  if(point.kind==='loot')cancelGathering();
  clearMovementKeys();
  const fishing=point.kind==='node'?nodes.find(node=>node.id===point.id&&node.waterX!==undefined):undefined;
  rotation=Math.atan2((fishing?.waterX??point.x)-position.x,(fishing?.waterZ??point.z)-position.z);
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  if(point.kind==='loot'){const drop=loot.find(drop=>drop.id===point.id);if(drop)lootUI.open(drop);}
  else send({type:'gather',targetId:point.id});
 }else {send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();send({type:'interact',targetId:point.id});}
}
function pickTarget(x:number,y:number): TargetInfo|undefined {
 const bounds=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((x-bounds.left)/bounds.width*2-1,-(y-bounds.top)/bounds.height*2+1),camera);
 const terrain=pickTerrain(raycaster.ray,!!worldInstance);
 const terrainDistance=terrain?raycaster.ray.origin.distanceTo(terrain):Infinity;
 const points=targetPoints(), objects:THREE.Object3D[]=[];
 for(const point of points){
  const mesh=storyWorld?.models.get(point.id)??(point.kind==='treasure-map'?treasureMapMarker.mesh:point.kind==='zeppelin'?zeppelins?.docks.get(point.id.slice(9)):point.kind==='poll'?zoneHandle?.pollBooths?.get(point.id):point.kind==='board'?zoneHandle?.boards?.get(point.id):point.kind==='chair'?zoneHandle?.chairs?.get(point.id):point.kind==='node'?nodeMeshes.get(point.id):point.kind==='enemy'?enemyMeshes.get(point.id)?.mesh:point.kind==='companion'?combatCompanions.get(point.id.slice(10)):point.kind==='loot'?lootMeshes.get(point.id)?.mesh:point.kind==='npc'?(npcViews.get(point.id)?.mesh||zoneHandle?.citizens?.get(point.id)?.mesh):undefined);
  const roots=point.kind==='player'?(remote.has(point.id)?[remote.get(point.id)!.mesh,mountViews.get(point.id)?.mesh]:[]):[mesh];
  for(const root of roots)if(root){root.userData.targetId=point.id;objects.push(root);}
 }
 let nearest:TargetInfo|undefined;
 for(const hit of raycaster.intersectObjects(objects,true)){
  if(hit.distance>terrainDistance+.12)break;
  let object:THREE.Object3D|null=hit.object,id:string|undefined,visible=true;
  while(object){if(!object.visible)visible=false;id=object.userData.targetId||id;object=object.parent;}
  const found=visible?points.find(p=>p.id===id):undefined;if(!found)continue;
  nearest??=found;
  // ponytail: two-meter overlap preference; use explicit target cycling for crowded groups beyond one body width.
  if(isHostileTarget(player,found,players)&&(found.id===nearest.id||!isHostileTarget(player,nearest,players)&&Math.hypot(found.x-nearest.x,found.z-nearest.z)<=2))return found;
 }
 if(nearest)return nearest;
 if(terrain)return chooseTarget(points.filter(p=>['gate','beacon','board','poll','workshop','dungeon','zeppelin','bed','landmark'].includes(p.kind)),null,terrain,2);
}
let lastTargetText='',lastHover=0;
function updateWorldCursor(now:number){
 if(!connected||!worldReady||modalOpen()||(player?.hp??0)<=0||!pointerInWorld){hoveredId=null;lastHover=0;canvas.style.cursor='var(--cursor-default)';return;}
 if(dragging){hoveredId=null;lastHover=0;canvas.style.cursor='var(--cursor-grab)';return;}
 if(now-lastHover<=80)return;lastHover=now;
 let cursor='default';
 const other=pickPlayer(hoverPointer.x,hoverPointer.y);
 if(other){const hostile=isHostilePlayer(player,other);hoveredId=hostile?other.id:null;cursor=hostile?'attack':'point';}
 else {
  const point=pickTarget(hoverPointer.x,hoverPointer.y);hoveredId=point?.id||null;
  if(isHostileTarget(player,point,players))cursor='attack';
  else if(point?.kind==='companion')cursor='point';
  else if(point?.kind==='loot')cursor='loot';
  else if(point?.kind==='node'){
   const node=nodes.find(node=>node.id===point.id);
   if(node)cursor={mining:'mine',woodcutting:'chop',herbalism:'harvest',fishing:'point'}[RESOURCE_TYPES[node.kind].skill];
  }else if(point?.kind==='npc'){
   const resident=VILLAGE_NPCS.find(npc=>npc.id===point.id)||TRAINER_NPCS.find(npc=>npc.id===point.id)||(point.id===GOLD_MERCHANT.id?GOLD_MERCHANT:point.id===HEARTHLING_NPC.id?HEARTHLING_NPC:undefined)||CITY_SERVICE_NPCS.find(npc=>npc.id===point.id);
   cursor=zoneHandle?.citizens?.has(point.id)?'point':resident?.role==='merchant'||resident?.role==='mount-seller'||resident?.role==='auctioneer'||resident?.role==='banker'?'trade':'talk';
  }else if(point?.kind==='treasure-map')cursor=player?.treasureMap?.stage==='chest'?'loot':'point';
  else if(point?.kind==='board'||point?.kind==='poll')cursor='talk';
  else if(point?.kind==='workshop')cursor='craft';
  else if(point?.kind==='chair'||point?.kind==='bed'||point?.kind==='landmark')cursor='point';
  else if(point?.kind==='arena'||point?.kind==='gate'||point?.kind==='beacon'||point?.kind==='zeppelin')cursor='travel';
  else if(point?.kind==='dungeon'){
   const object=dungeon?.objects.find(object=>object.id===point.id);
   cursor=!object?'travel':!object.available||object.activated?'default':object.kind==='chest'?'loot':'point';
  }
 }
 const value=`var(--cursor-${cursor})`;if(canvas.style.cursor!==value)canvas.style.cursor=value;
}
function updateTarget(now:number){
 const gathering=connected&&worldReady&&!modalOpen()&&player?.gathering&&player.gathering.startedAt!==cancelledGather?player.gathering:null;
 const points=selectedId||gathering?targetPoints():[];
 if(selectedId&&((player?.hp??0)<=0||!points.some(point=>point.id===selectedId)&&!loot.some(drop=>drop.id===selectedId)))selectedId=null;
 const id=gathering?.nodeId||selectedId,chosen=id?chooseTarget(points,id,position):undefined;
 const visible=!!chosen&&connected&&worldReady&&!modalOpen()&&(player?.hp??0)>0;
 targetRing.visible=visible;$('target-hud').hidden=!visible;
 if(!visible||!chosen)return;
 const other=chosen.kind==='player'?players.find(p=>p.id===chosen.id):undefined,hostile=isHostileTarget(player,chosen,players),node=nodes.find(n=>n.id===chosen.id),info=node?RESOURCE_TYPES[node.kind]:undefined;
 targetRing.position.set(chosen.x,(chosen.kind==='chair'?buildingFloorHeight(chosen.x,chosen.z):surfaceHeight(chosen.x,chosen.z,!!worldInstance))+.10,chosen.z);targetRing.scale.setScalar(chosen.kind==='enemy'&&chosen.height>4?2:chosen.kind==='node'&&info?.skill==='woodcutting'?1.3:1);
 (targetRing.material as THREE.MeshBasicMaterial).color.set(hostile?'#ff9a72':chosen.kind==='loot'?'#f6ce67':chosen.kind==='node'?'#ffe2a0':'#bfe8aa');
 const companionOwner=combatCompanionOwner(players,chosen.id),companion=companionOwner?.combatCompanion;
 const enemy=enemies.find(e=>e.id===chosen.id),object=dungeon?.objects.find(object=>object.id===chosen.id),gap=Math.hypot(chosen.x-position.x,chosen.z-position.z);
 const danger=enemy?monsterDanger(enemy.level,player?.level??1):undefined;
 const resourceLocked=!!info&&skillProgress(player?.skills?.[info.skill]||0).level<info.requiredLevel;
 const text=JSON.stringify([chosen.id,hostile,companion?.hp,companion?.maxHp,companion?.level,other?.pvp,other?.arenaMatchId,other?.arenaTeam,other?.arenaEliminated,other?.arenaPhase,other?.duelOpponentId,other?.hp,enemy?.hp,enemy?.maxHp,enemy?.level,enemy?.worldBoss,enemy?.berserk,enemy?.attack?.id,player?.level,player?.skills,gathering?.startedAt,Math.ceil(gap),player?.seated?.chairId,player?.treasureMap?.stage,object?.available,object?.activated]);
 if(lastTargetText!==text){
  lastTargetText=text;$('target-name').textContent=chosen.name;$('target-name').setAttribute('translate',chosen.kind==='player'?'no':'yes');
  if(danger)$('target-hud').dataset.danger=danger;else delete $('target-hud').dataset.danger;
  $('target-detail').textContent=chosen.kind==='loot'?lootSummary(loot.find(drop=>drop.id===chosen.id)!):enemy?`Level ${enemy.level} · ${enemy.worldBoss?'World boss · ':''}${enemy.hp} / ${enemy.maxHp} health${danger==='dangerous'?' · Dangerous':''}${enemy.berserk?' · Berserk':enemy.worldBoss&&enemy.hp<=enemy.maxHp/2?' · Enraged':''}${enemy.attack&&!enemy.attack.basic?' · '+(enemy.attack.name||monsterAttackNames[enemy.attack.style]):''}`:info?`${SKILLS[info.skill].label} ${info.requiredLevel} required · Yours: ${skillProgress(player?.skills?.[info.skill]||0).level}${resourceLocked?' · Locked':` · ${info.yield} ${info.reward} · ${gatheringXpGain(node!.kind,player?.skills?.[info.skill]||0)} XP`}`:chosen.kind==='npc'?(chosen.id===HEARTHLING_NPC.id?HEARTHLING_NPC.title:chosen.id===GOLD_MERCHANT.id?GOLD_MERCHANT.title:VILLAGE_NPCS.find(n=>n.id===chosen.id)?.role==='merchant'?'Supplies & trade':VILLAGE_NPCS.find(n=>n.id===chosen.id)?.role==='warden'?'Local quests':VILLAGE_NPCS.find(n=>n.id===chosen.id)?.role==='healer'?'Rest & healing':'Village keeper'):chosen.kind==='poll'?'Community polls · One ballot per account':chosen.kind==='board'?'Quests and rewards':chosen.kind==='workshop'?'Craft gear and supplies':chosen.kind==='arena'?'Rated arena · Solo, 2v2 & 3v3':chosen.kind==='dungeon'?'Dungeon · 1–4 adventurers':'Lantern of the old roads';
  $('target-action').textContent=gathering?'Gathering…':resourceLocked?'Skill level too low':hostile?'Use an ability':gap>3?'Move closer':`${bindingLabel('e')} · ${chosen.kind==='loot'?'Loot':info?.verb||'Interact'}`;
  if(chosen.kind==='treasure-map'){$('target-detail').textContent=player?.treasureMap?.stage==='search'?'Your map points to the disturbed earth':player?.treasureMap?.stage==='guardian'?'Defeat the treasure guardian first':'Gold, supplies and a 1% voucher chance';$('target-action').textContent=gap>3?'Move closer':player?.treasureMap?.stage==='guardian'?'Guarded':`${bindingLabel('e')} · ${player?.treasureMap?.stage==='search'?'Dig':'Open chest'}`;}
  if(companion&&companionOwner){$('target-detail').textContent=`${companionOwner.name}’s companion · Level ${companion.level} · ${companion.hp} / ${companion.maxHp} health`;$('target-action').textContent=hostile?`${bindingLabel('t')} · Auto attack`:'Selected';}
  if(chosen.kind==='player'){$('target-detail').textContent=other&&other.hp<=0?'Defeated':other?arenaPlayerLabel(other):'Player';$('target-action').textContent=hostile?`${bindingLabel('t')} · Auto attack`:'Right-click · Player options';}
  const citizen=zoneHandle?.citizens?.get(chosen.id);if(citizen){$('target-detail').textContent=citizen.title;$('target-action').textContent='Selected';}
  if(chosen.kind==='zeppelin'){const discovered=player?.zeppelinPorts?.includes(chosen.id.slice(9) as ZoneId);$('target-detail').textContent=discovered?(player?.economyVersion===1?`${GOLD_ZEPPELIN_COST} gold per flight`:'Free flights to discovered cities'):'Discover this dock to unlock its flights';$('target-action').textContent=gap>8?'Walk to the sky dock':discovered?`${bindingLabel('e')} · Choose destination`:`${bindingLabel('e')} · Discover dock`;}
  if(chosen.kind==='bed'){$('target-detail').textContent='Restore health · Chance of a 3-minute dream · 10-minute rest interval';$('target-action').textContent=gap>3?'Move closer':`${bindingLabel('e')} · Rest and dream`;}
  if(chosen.kind==='landmark'){$('target-detail').textContent=chosen.label;$('target-action').textContent=gap>3?'Move closer':`${bindingLabel('e')} · Read`;}
  if(chosen.kind==='chair'){$('target-detail').textContent=player?.seated?.chairId===chosen.id?'Move or press Escape to stand':'Take a seat';$('target-action').textContent=gap>3?'Move closer':player?.seated?.chairId===chosen.id?`${bindingLabel('e')} · Stand up`:`${bindingLabel('e')} · Sit`;}
  if(object){$('target-detail').textContent=object.activated?'Already activated':object.available?object.kind==='chest'?'Open, then collect your personal loot':object.kind==='checkpoint'?'Party healing and a nearer revival point':'Restore this seal to open the sanctuary':'Defeat this chamber’s guardians';$('target-action').textContent=gap>3?'Move closer':object.activated?'Activated':!object.available?'Guarded':`${bindingLabel('e')} · ${object.kind==='chest'?'Open':object.kind==='seal'?'Activate':'Attune'}`;}
  $('target-action').setAttribute('aria-label',gathering?'Gathering in progress':chosen.label);
 }
 $('target-action').toggleAttribute('disabled',!!gathering||resourceLocked||!!object&&gap<=3&&(!object.available||object.activated));
 const progress=$('gather-progress');progress.hidden=!gathering;
 if(gathering){
  const remaining=Math.max(0,gathering.endsAt-(Date.now()+serverOffset));
  const percent=Math.max(0,Math.min(100,100*(1-remaining/(gathering.endsAt-gathering.startedAt))));
  $('gather-fill').style.width=`${percent}%`;progress.setAttribute('aria-valuenow',String(Math.round(percent)));
  $('gather-time').textContent=`${(remaining/1000).toFixed(1)}s · Move to cancel`;
 }
}
$('target-action').onclick=interactNearby;
function deathProgress(diedAt?:number,now=Date.now()+serverOffset):number {
 return THREE.MathUtils.clamp((now-(diedAt??0))/DEATH_ANIMATION_MS,0,1);
}
function emotePlayback(p:Player|undefined,now=Date.now()+serverOffset){
 const emote=p?.emote;
 return emote&&!p?.casting&&!p?.zeppelin&&(emote.endsAt===null||now<emote.endsAt)?{id:emote.id,elapsed:Math.max(0,(now-emote.startedAt)/1000)}:undefined;
}
function syncEntities(serverTime?:number){
 const receivedAt=performance.now();
 for(const [id,view] of mountViews)if(id!==playerId&&!players.some(p=>p.id===id)){disposeMount(view.mesh);mountViews.delete(id);}
 const remains=loot.find(drop=>drop.sourceObjectId===selectedId&&!lootMeshes.has(drop.id));if(remains)selectedId=remains.id;
 for(const p of players){if(p.id===playerId)continue;let entry=remote.get(p.id);const fresh=!entry,style=JSON.stringify([p.appearance,p.equipment,raidAppearance(p.raidProgress)]);if(!entry||entry.appearance!==style){if(entry){removeRig(entry.mesh);entry.label.remove();}const mesh=makeCharacter(p.appearance,p.equipment,p.raidProgress);mesh.position.set(p.x,surfaceHeight(p.x,p.z,!!p.instanceId),p.z);scene.add(mesh);entry={mesh,label:playerNameplate(p),appearance:style,motion:entry?.motion??createRemoteMotion()};remote.set(p.id,entry);}
  const swimming=!p.instanceId&&(p.jump?.grounded??true)&&waterAt(p.x,p.z);
  const terrainGrounded=!p.instanceId&&!p.seated&&!p.zeppelin&&p.jump?.grounded===true&&!waterAt(p.x,p.z)&&Math.abs(p.jump.y-groundHeight(p.x,p.z))<.001;
  if(Number.isFinite(serverTime)||fresh)entry.motion.push({x:p.seated?.x??p.x,y:p.seated?p.seated.y-.8:p.jump?.y??(swimming?-.65:surfaceHeight(p.x,p.z,!!p.instanceId)),z:p.seated?.z??p.z,rotation:p.seated?.rotation??p.rotation,terrainGrounded,instanceId:p.instanceId,mode:p.hp<=0?'dead':p.zeppelin?'zeppelin':p.seated?`seated:${p.seated.chairId}`:'active'},serverTime??0,receivedAt);
  updatePlayerNameplate(entry.label,p);updateRaidNameplate(entry.label,p.id);
 }
 for(const [id,e] of remote){if(!players.some(p=>p.id===id)){removeRig(e.mesh);e.label.remove();remote.delete(id);}}
 for(const [id,entry] of enemyMeshes)if(!enemies.some(e=>e.id===id)){removeRig(entry.mesh);entry.label.remove();enemyMeshes.delete(id);}
 for(const e of enemies){const model=`${e.model??e.kind}:${e.raidVisual??''}`;const previous=enemyMeshes.get(e.id);if(previous&&previous.model!==model){removeRig(previous.mesh);previous.label.remove();enemyMeshes.delete(e.id);}if(!enemyMeshes.has(e.id)){const mesh=makeRaidMechanicModel(e)??makeEnemy(e.model??e.kind);mesh.position.set(e.x,surfaceHeight(e.x,e.z,!!e.instanceId),e.z);scene.add(mesh);const el=label(e.id,e.name||enemyNames[e.kind]||'Guardian',`Lv ${e.level}`);el.classList.add('enemy');el.insertAdjacentHTML('beforeend','<span class="enemy-health"><i></i></span><span class="enemy-cast" hidden><i></i><b></b></span><span class="enemy-dots" hidden></span>');enemyMeshes.set(e.id,{mesh,label:el,model,height:e.model||e.raidVisual?new THREE.Box3().setFromObject(mesh).max.y-mesh.position.y:MONSTERS[e.kind].height});}const view=enemyMeshes.get(e.id)!;view.mesh.visible=e.alive||deathProgress(e.diedAt)<1;view.label.style.display=e.alive?'':'none';view.label.classList.toggle('world-boss',!!e.worldBoss);view.label.dataset.danger=monsterDanger(e.level,player?.level??1);view.label.querySelector('small')!.textContent=instantCombat?.run?.boss?.id===e.id?`Lv ${e.level} · ${instantCombat.run.boss.shielded?'Shielded · Clear the objective':'Instant Combat boss'}`:e.raidVisual?`Lv ${e.level} · ${e.raidShielded?'Shielded · Break its Soul Shield':e.raidVisual==='apostle-real'?'Red eyes · Gold halo gem':e.raidVisual==='clone'?'Violet eyes':e.raidVisual==='shield'?'Break to free its Guardian':e.raidVisual==='crystal'?'Destroy before Black Sun':e.raidVisual==='guardian'?'Soul Guardian':e.raidVisual==='approach'?'Void creature':e.raidVisual==='morgrath'?'Morgrath · Gatekeeper':'Raid boss'}`:e.kind==='training-dummy'?`${e.hp.toLocaleString()} / ${e.maxHp.toLocaleString()} HP`:`Lv ${e.level}${e.worldBoss?` · WORLD BOSS · ${e.hp} / ${e.maxHp}${e.berserk?' · BERSERK':e.hp<=e.maxHp/2?' · ENRAGED':''}`:''}`;(view.label.querySelector('i') as HTMLElement).style.width=`${e.hp/e.maxHp*100}%`;}
 for(const [id,mesh] of nodeMeshes)if(!nodes.some(node=>node.id===id)){removeNode(mesh);nodeMeshes.delete(id);}
 for(const node of nodes){
  if(!nodeMeshes.has(node.id)){const mesh=makeResource(node.kind);mesh.position.set(node.x,surfaceHeight(node.x,node.z,!!node.instanceId),node.z);if(node.waterX!==undefined&&node.waterZ!==undefined){mesh.rotation.y=Math.atan2(node.waterX-node.x,node.waterZ-node.z);for(const child of mesh.children)if(child.name==='Fishing ripple')child.position.y=WATER_LEVEL+.025-mesh.position.y;}scene.add(mesh);nodeMeshes.set(node.id,mesh);}
  showResource(nodeMeshes.get(node.id)!,node.available);
 }
 for(const drop of loot){
  if(lootMeshes.has(drop.id))continue;
  const mesh=makeLootRemains(drop.kind,!!drop.sourceObjectId||!!drop.instantCombatRound,drop.model);mesh.position.set(drop.x,surfaceHeight(drop.x,drop.z,!!drop.instanceId)+(drop.sourceObjectId ? .9 : 0),drop.z);mesh.rotation.y=drop.rotation??0;mesh.visible=deathProgress(drop.diedAt)===1;scene.add(mesh);
  const el=label(drop.id,drop.sourceObjectId||drop.instantCombatRound?drop.name:`${drop.name} remains`,`${drop.gold} gold${drop.relic?` · ${drop.relic} relics`:''} · ${bindingLabel('e')} to loot`);el.classList.add('loot-label');
  lootMeshes.set(drop.id,{mesh,label:el,height:new THREE.Box3().setFromObject(mesh).max.y-surfaceHeight(drop.x,drop.z,!!drop.instanceId)+.3});
 }
 for(const [id,entry] of lootMeshes)if(!loot.some(drop=>drop.id===id)){removeRig(entry.mesh);entry.label.remove();lootMeshes.delete(id);}
 const points=targetPoints();
 if(selectedId&&!points.some(p=>p.id===selectedId)&&!loot.some(drop=>drop.id===selectedId))selectedId=null;
 if(hoveredId&&!points.some(p=>p.id===hoveredId))hoveredId=null;

}
let autoAttackTarget:string|null=null,lastAutoAttackRequest=-Infinity;
let meleeApproach:{targetId:string;instanceId:string|null;route:{x:number;z:number}[];goal:{x:number;z:number};plannedAt:number;progressAt:number;last:{x:number;z:number}}|undefined;
function beginMeleeApproach(enemy:Enemy){
 // Ground paths cannot steer from roofs or props. Elevated attacks wait for manual movement into server-validated reach.
 if(jump.y>jumpFloor(position.x,position.z,!!worldInstance)+.5){keys.delete('attack-approach');return true;}
 if(keys.has('attack-approach')&&meleeApproach?.targetId===enemy.id)return true;
 const bounds=currentWorldBounds();
 const route=findPath(position,enemy,colliders,bounds),end=route.at(-1);
 if(!end||!canTraverse(end,enemy,colliders,bounds)){toast('No clear route to that enemy. Move closer and try again.');return false;}
 const now=performance.now();
 meleeApproach={targetId:enemy.id,instanceId:worldInstance,route,goal:{x:enemy.x,z:enemy.z},plannedAt:now,progressAt:now,last:{x:position.x,z:position.z}};
 // Keep this intent with movement input so existing blur, menus, travel and correction resets cancel it too.
 keys.add('attack-approach');cancelGathering();standUp();
 return true;
}
function meleeApproachInput(now:number):{x:number;z:number}|undefined{
 if(!keys.has('attack-approach'))return;
 const approach=meleeApproach,enemy=approach&&enemies.find(enemy=>enemy.id===approach.targetId&&enemy.alive&&enemy.hp>0&&(enemy.instanceId??null)===worldInstance);
 if(!approach||!enemy||!player||player.hp<=0||!connected||!worldReady||modalOpen()||document.hidden||player.zeppelin||gmFlying()
  ||jump.y>jumpFloor(position.x,position.z,!!worldInstance)+.5
  ||approach.instanceId!==worldInstance||selectedId!==approach.targetId||autoAttackTarget!==approach.targetId||AUTO_ATTACKS[player.appearance.className].visual!=='melee'){
  keys.delete('attack-approach');return;
 }
 const bounds=currentWorldBounds();
 const clear=canTraverse(position,enemy,colliders,bounds),range=AUTO_ATTACKS[player.appearance.className].range-.25;
 if(player.travel?.mount||player.casting&&player.casting.startedAt!==cancelledCast||clear&&Math.hypot(enemy.x-position.x,enemy.z-position.z)<=range&&(worldInstance||!waterAt(position.x,position.z))){
  approach.progressAt=now;approach.last={x:position.x,z:position.z};return;
 }
 if(Math.hypot(position.x-approach.last.x,position.z-approach.last.z)>.25){approach.last={x:position.x,z:position.z};approach.progressAt=now;}
 if(now-approach.progressAt>1500){setAutoAttack(null);toast('The route is blocked. Move closer and attack again.');return;}
 if(!clear&&now-approach.plannedAt>=750&&(!approach.route.length||Math.hypot(enemy.x-approach.goal.x,enemy.z-approach.goal.z)>1||!canTraverse(position,approach.route[0],colliders,bounds))){
  approach.route=findPath(position,enemy,colliders,bounds);approach.goal={x:enemy.x,z:enemy.z};approach.plannedAt=now;
  const end=approach.route.at(-1);
  if(!end||!canTraverse(end,enemy,colliders,bounds)){setAutoAttack(null);toast('No clear route to that enemy. Move closer and try again.');return;}
 }
 while(approach.route.length>1&&Math.hypot(approach.route[0].x-position.x,approach.route[0].z-position.z)<.4)approach.route.shift();
 const next=clear?enemy:approach.route[0];
 if(!next)return;
 return {x:next.x-position.x,z:next.z-position.z};
}
function setAutoAttack(targetId:string|null){
 if(targetId===null)keys.delete('attack-approach');
 if(player?.zeppelin)return;
 const now=performance.now();
 if(targetId!==null){
  if(!player||player.hp<=0||!connected||!worldReady||modalOpen())return;
  const companionOwner=combatCompanionOwner(players,targetId);
  const enemy=enemies.find(enemy=>enemy.id===targetId&&enemy.alive&&enemy.hp>0&&(enemy.instanceId??null)===worldInstance)
   ||players.find(other=>other.id===targetId&&isHostilePlayer(player,other)&&(other.instanceId??null)===worldInstance)
   ||(companionOwner&&isHostileTarget(player,{id:targetId,kind:'companion'},players)?{...companionOwner.combatCompanion!,id:targetId}:undefined);
  if(!enemy){toast('Select a living enemy to auto attack.');return;}
  selectedId=enemy.id;hoveredId=null;
  if(enemies.includes(enemy as Enemy)&&AUTO_ATTACKS[player.appearance.className].visual==='melee'){
   if(!beginMeleeApproach(enemy as Enemy)){setAutoAttack(null);return;}
  }else keys.delete('attack-approach');
 }
 if(targetId===autoAttackTarget&&(targetId===null||player?.autoAttack?.targetId===targetId||now-lastAutoAttackRequest<1000))return;
 autoAttackTarget=targetId;lastAutoAttackRequest=now;
 if(connected)send({type:'autoAttack',targetId});
}
function autoAttackSelectionValid(targetId:string|null){
 return !!targetId&&!!player&&player.hp>0&&connected&&worldReady&&selectedId===targetId&&(enemies.some(enemy=>enemy.id===targetId&&enemy.alive&&enemy.hp>0&&(enemy.instanceId??null)===worldInstance)
  ||players.some(other=>other.id===targetId&&isHostilePlayer(player,other)&&(other.instanceId??null)===worldInstance)
  ||isHostileTarget(player,{id:targetId,kind:'companion'},players));
}
function reconcileAutoAttack(){
 if(autoAttackTarget&&!autoAttackSelectionValid(autoAttackTarget))setAutoAttack(null);
}
function rejectAutoAttack(){
 const targetId=player?.autoAttack?.targetId??null;
 autoAttackTarget=autoAttackSelectionValid(targetId)?targetId:null;lastAutoAttackRequest=-Infinity;
 keys.delete('attack-approach');meleeApproach=undefined;
}
function updateAudioScene(now=performance.now()){
 const active=connected&&worldReady&&!rosterActive&&!entryActive&&player&&player.hp>0;
 const zone=active?(worldInstance&&!usesArenaWorld(worldInstance)?'dungeon':player!.zone):'greenwood';
 if(active&&enemies.some(enemy=>enemy.alive&&(enemy.instanceId??null)===worldInstance&&(enemy.targetId===playerId||enemy.attack?.targetId===playerId)))audioCombatUntil=now+6000;
 const combat=!!active&&now<audioCombatUntil;
 gameAudio.setScene(zone,combat);
}
function clearCombat(){audioCombatUntil=0;gameAudio.reset();gameAudio.setScene('greenwood');autoAttackTarget=null;lastAutoAttackRequest=-Infinity;combatEffects.clear();monsterEffects.clear();damageNumbers.clear();combatAnimations.clear();cancelledCast=0;}
function playCombat(event:CombatEvent){
 if(worldDungeonKind)event={...event,targets:event.targets.filter(visibleInDungeonRoom)};
 const now=performance.now(),target=event.targets[0];
 const started=now-(Number.isFinite(event.startedAt)?Math.max(0,Date.now()+serverOffset-event.startedAt):0);
 const facing=target&&event.ability!=='cleave'?Math.atan2(target.x-event.from.x,target.z-event.from.z):event.rotation;
 if(event.effectPhase==='impact'){
  combatEffects.play({...event,rotation:facing},started/1000);
  const volume=event.playerId===playerId?1:Math.max(0,1-Math.hypot(event.from.x-position.x,event.from.z-position.z)/24)*.45;
  if(volume>0&&(now-started)<700)gameAudio.spell(event.ability,'impact',volume);
  return;
 }
 if(SPELLS[event.ability].movementDurationMs)combatAnimations.delete(event.playerId);
 else combatAnimations.set(event.playerId,{ability:event.ability,started,rotation:facing,prepared:!!event.castTimeMs,basic:!!event.basic});
 const caster=event.playerId===playerId?player:players.find(p=>p.id===event.playerId);
 if(!event.basic&&caster?.casting&&caster.casting.endsAt<=event.startedAt)caster.casting=null;
 combatEffects.play({...event,rotation:facing},started/1000);
 const spell=SPELLS[event.ability],local=event.playerId===playerId;
 if(local){rotation=facing;if(event.ability==='taunt'&&target)selectedId=target.id;}
 if(spell.effect==='damage'&&(local||event.targets.some(target=>target.id===playerId))){audioCombatUntil=now+6000;updateAudioScene(now);}
 const gap=Math.hypot(event.from.x-position.x,event.from.z-position.z),volume=local?1:Math.max(0,1-gap/24)*.45;
 const impactGap=event.targets.length?Math.min(...event.targets.map(target=>Math.hypot(target.x-position.x,target.z-position.z))):gap;
 const impactVolume=local||event.targets.some(target=>target.id===playerId)?1:Math.max(0,1-impactGap/24)*.45;
 const age=(now-started)/1000;
 if((volume>0||impactVolume>0)&&age<1.6){
  if(event.basic)gameAudio.play(spell.className==='Ranger'?'bow':spell.className==='Knight'?'melee':'magic',volume*.65);
  else {
   const distance=target?Math.hypot(target.x-event.from.x,target.z-event.from.z):0,timing=combatTiming(event.ability,distance);
   if(age<=timing.delay+.15)gameAudio.spell(event.ability,'release',volume,Math.max(0,timing.delay-age));
   const impact=timing.delay+timing.flight-age;
   if(impact>=-.15)gameAudio.spell(event.ability,'impact',impactVolume*.8,Math.max(0,impact));
  }
 }
}
function combatPose(id:string,now:number){
 const caster=id===playerId?player:players.find(p=>p.id===id),cast=caster?.casting;
 if(connected&&worldReady&&caster&&caster.hp>0&&cast&&(id!==playerId||cast.startedAt!==cancelledCast)){
  if(cast.ability==='mount')return false;
  const progress=THREE.MathUtils.clamp((Date.now()+serverOffset-cast.startedAt)/(cast.endsAt-cast.startedAt),0,1);
  return {ability:cast.ability,progress:SPELLS[cast.ability].movementDurationMs?progress:cast.channel?.45+Math.sin(now*.008)*.12:Math.max(.001,progress)*(SPELLS[cast.ability].className==='Ranger'?.26:.30),rotation:cast.rotation};
 }
 const attack=combatAnimations.get(id);if(!attack)return false;
 if(attack.basic){const progress=(now-attack.started)/AUTO_ATTACK_ANIMATION_MS;if(progress>=1){combatAnimations.delete(id);return false;}return {ability:attack.ability,progress:Math.max(0,progress),rotation:attack.rotation,basic:true};}
 const windup=combatTiming(attack.ability,0).delay*1000;
 const duration=Math.max(attack.ability==='volley'?900:700,windup/(attack.ability==='power-shot'?.26:.30));
 const elapsed=now-attack.started,spell=SPELLS[attack.ability];
 if(elapsed>=duration){combatAnimations.delete(id);return false;}
 // Match the rig's draw/cast release to the shared launch time, retaining full recovery.
 const release=spell.className==='Ranger'?.26:.30;
 const progress=attack.prepared ? (elapsed<=windup ? release : release+(elapsed-windup)/(duration-windup)*(1-release)) : spell.visual==='radial'||spell.effect!=='damage'?elapsed/duration:windup>0&&elapsed<=windup
  ? elapsed/windup*release : release+(elapsed-windup)/(duration-windup)*(1-release);
 return {ability:attack.ability,progress,rotation:attack.rotation};
}
function act(type:string){if(player?.zeppelin)return;if(modalOpen()||!connected||!worldReady)return;if(!player||player.hp<=0)return;
 const ability=type==='attack'?legacyAbility(appearance.className):type==='special'?legacyAbility(appearance.className,true):abilityValid(type,appearance.className)?type:null;
 if(ability){
  if(player.arenaEliminated){toast('You are knocked out for this match.');return;}
  if(player.arenaMatchId&&(player.arenaPhase!=='active'||player.arenaEliminated)){toast('Wait for the arena countdown.');return;}
  if((player.duelStatus?.stunUntil||0)>Date.now()+serverOffset){toast('Stunned.');return;}
  if(player.casting&&player.casting.startedAt!==cancelledCast){toast(`Already casting ${castLabel(player.casting)}.`);return;}
  const spell=SPELLS[ability];
  if(!abilityUnlocked(ability,appearance.className,player.level,player.learnedSpells,player.talents)){toast(spell.requiredTalent?`Learn ${spell.label} in your talent tree.`:player.level<spell.requiredLevel?`${spell.label} requires level ${spell.requiredLevel}.`:`Learn ${spell.label} from a ${appearance.className} trainer.`);return;}
  if(localSwimming()){toast('Reach the shore before attacking.');return;}
  const now=performance.now(),serverNow=Date.now()+serverOffset;
  if(now-lastPrimary<GLOBAL_ATTACK_MS||(player.globalCooldownUntil||0)>serverNow||(player.abilityCooldowns?.[ability]||0)>serverNow)return;
  if(ability==='tame-beast'){
   const target=enemies.find(enemy=>enemy.id===(selectedId||hoveredId)&&enemy.alive);
   if(!target){toast('Select a living creature to tame.');return;}
   if(target.worldBoss||target.dungeonBoss||target.id===ROOTVAULT_GUARDIAN.id||!tameableKind(target.kind)){toast('World bosses, dungeon bosses and training dummies cannot be tamed.');return;}
   if(target.level>player.level){toast('You can only tame creatures at or below your level.');return;}
   setAutoAttack(null);
  }
  if(ability==='combined-assault'&&!(player.combatCompanion&&player.combatCompanion.hp>0)){toast('Recall a living combat companion first.');return;}
  if((spellCastTimeMs(spell,combatStats(player),player.combatTalents,serverNow)>0||spell.channel)&&(!jump.grounded||isMoving&&!spell.castMoveMultiplier)){toast('Stand still to cast this spell.');return;}
  if(spell.targeting==='radial'||spell.targetRelation!=='hostile'){
   const ally=spell.targeting==='radial'||spell.targetRelation==='self'?undefined:players.find(p=>p.id===selectedId&&!isHostilePlayer(player,p));
   if(!canSupportPlayer(player,ally??player)){toast(player.arenaMatchId?'Arena support is limited to your active teammates.':'During PvP or a duel, you can only support yourself.');return;}
   if(ally&&(ally.hp<=0||(ally.instanceId??null)!==worldInstance||Math.hypot(ally.x-position.x,ally.z-position.z)>spell.range)){toast('Choose a living ally within spell range.');return;}
   standUp();cancelGathering();lastPrimary=now;
   send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=now;
   send({type:'attack',ability,...(ally?{targetId:ally.id}:{})});hotbar.predictCast(ability,serverNow);return;
  }
  const points=targetPoints(),selected=points.find(p=>p.id===(selectedId||hoveredId));
  if(ability!=='taunt'&&selectedId&&((selected?.kind==='player'||selected?.kind==='companion')&&!isHostileTarget(player,selected,players)||selected?.kind==='npc')){toast('Select a hostile target to attack.');return;}
  const bounds=currentWorldBounds();
  const reachable=points.filter(p=>isHostileTarget(player,p,players)&&Math.hypot(p.x-position.x,p.z-position.z)<=spell.range&&canTraverse(position,p,colliders,bounds));
  const nearest=chooseTarget(reachable,isHostileTarget(player,selected,players)?selected?.id??null:null,position)
   ??(selected?.kind==='enemy'&&ability!=='tame-beast'?chooseTarget(reachable.filter(p=>p.kind==='enemy'),null,position):undefined);
  if(!nearest){toast('Move closer to a foe.');return;}
  if(ability==='combined-assault'&&Math.hypot(player.combatCompanion!.x-nearest.x,player.combatCompanion!.z-nearest.z)>combatCompanionStats(player.combatCompanion!.level).range){toast('Your companion must be in melee range for Combined Assault.');return;}
  const autoTaunt=ability==='taunt'&&(!selectedId||!isHostileTarget(player,selected,players));
  standUp();cancelGathering();selectedId=nearest.id;lastPrimary=now;
  rotation=Math.atan2(nearest.x-position.x,nearest.z-position.z);
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=now;
  send({type:'attack',ability,...(autoTaunt?{}:{targetId:nearest.id})});hotbar.predictCast(ability,serverNow);return true;
 }else if(type==='gather'||type==='interact'){
  interactNearby();
 }else if(type==='heal'||type==='mend'){if(player.inventory.potion<=0){toast('You need a healing potion.');return;}if(player.hp>=player.maxHp){toast('Your health is already full.');return;}send({type:'heal'});}
}
let characterView:CharacterView|undefined;
let selectedBagItem='';
let upgradingBagItem=false;
let bagLayoutPlayer='', bagLayout:(string|null)[]=[],lastGearHTML='';
let inventoryLayout:'grid'|'list'='grid';
const bagView:BagViewOptions={activeBag:'all',filter:'all',sort:'slots'};
// ponytail: layout is per character in this browser; move it server-side if cross-device sync is needed.
function currentBagSlots(){
 if(!player)return [];
 const key=`mossvale:bag-slots:${player.id}`;
 if(bagLayoutPlayer!==player.id){
  bagLayoutPlayer=player.id;bagLayout=[];
  try{const saved=JSON.parse(readLocal(key)||'[]');if(Array.isArray(saved))bagLayout=saved;}catch{}
 }
 const next=reconcileBagSlots(player,bagLayout);
 if(JSON.stringify(next)!==JSON.stringify(bagLayout)){bagLayout=next;saveLocal(key,JSON.stringify(next));}
 return next;
}
const closedBagIds=new Set<string>();
let bagPreview:ReturnType<typeof mountBagPreview>;
function disposeBagPreview(){bagPreview?.dispose();bagPreview=undefined;}
function showBagPreview(){const stage=document.querySelector<HTMLElement>('.bag-model-preview');if(stage&&!bagPreview){try{bagPreview=mountBagPreview(stage,stage.dataset.bagModel||'');}catch{stage.textContent='3D preview unavailable.';}}}
function disposeCharacterView(){characterView?.dispose();characterView=undefined;}
let walletSettingsDispose:(()=>void)|undefined,walletSettingsEpoch=0;
function disposeWalletSettings(){walletSettingsEpoch++;const dispose=walletSettingsDispose;walletSettingsDispose=undefined;dispose?.();}
let bagBalanceController:AbortController|undefined;
function disposeBagBalance(){bagBalanceController?.abort();bagBalanceController=undefined;bagView.mossBalance=null;}
function watchBagBalance(){
 disposeBagBalance();
 const controller=new AbortController(),characterId=player?.id;bagBalanceController=controller;
 const active=()=>!controller.signal.aborted&&player?.id===characterId&&panel.open&&(panel.dataset.mode==='gear'||panel.dataset.mode==='inventory');
 void import('./turnkey-ui.ts').then(wallet=>{
  if(!active())return;
  wallet.watchTurnkeyMossBalance(amount=>{if(active()&&bagView.mossBalance!==amount){bagView.mossBalance=amount;renderGearPanel();}},controller.signal);
 }).catch(()=>{/* The unknown balance stays distinct from zero. */});
}
function closePanel(){
 if(panel.dataset.mode==='death'&&(player?.hp??1)<=0)return;
 if(panel.dataset.mode==='shop')cancelQueuedShopSales();
 itemMenu.close();hotbar.cancel();clearGearDrag();disposeAtlas();disposeCharacterView();disposeBagPreview();disposeCollectionPreview();disposeWalletSettings();disposeBagBalance();panel.close();document.body.classList.remove('menu-open');
 if(!floatingPanel())clearMovementKeys();canvas.focus();
}
function openPanel(title:string,eyebrow:string,mode:string){
 specialistNftUI?.close();
 delete panel.dataset.npcId;
 if(panel.dataset.mode==='shop'&&mode!=='shop')cancelQueuedShopSales();
 upgradingBagItem=false;
 if(document.body.classList.contains('mobile-controls')){setChatExpanded(false);setMobileMenus(false);window.dispatchEvent(new CustomEvent('mobile-ui-open'));}
 const floating=floatingPanel(mode);
 itemMenu.close();hotbar.cancel();clearGearDrag();disposeAtlas();disposeCharacterView();disposeBagPreview();disposeCollectionPreview();disposeWalletSettings();disposeBagBalance();customizer.close();
 if(panel.open&&floating!==floatingPanel())panel.close();
 panel.dataset.mode=mode;$('panel-title').textContent=title;$('panel-eyebrow').textContent=eyebrow;
 if(!floating){cancelGathering();clearMovementKeys();}
 if(!floating)lootUI.close();
 document.body.classList.toggle('menu-open',!floating);
 if(!panel.open){if(floating)panel.show();else panel.showModal();}panel.scrollTop=0;
}
function openJournal(){lastJournalHTML='';openPanel('The Lanterns Between','YOUR STORY','journal');renderJournal();}
function followStory(){
 if(!player)return;if(worldInstance){toast('Return to the open world to continue the lantern story.');return;}
 const q=player.quest,c=getChapter(q);if(q.completed){openMap();return;}
 const objective=c.objectives.find(o=>(q.progress[o.id]||0)<o.count);
 if(q.stage===0||q.stage===2||objective?.kind==='interact'){
  const id=q.stage===0||q.stage===2?c.npcId:objective!.target;
  const marker=NPCS.find(n=>n.id===id)||BEACONS.find(b=>b.id===id);if(!marker)return;
  closePanel();const point=targetPoints().find(p=>p.id===marker.id);if(point)setWaypoint(point);return;
 }
 let candidates:{id:string;x:number;z:number}[]=objective?.kind==='gather'?nodes.filter(n=>n.zone===c.zone&&n.kind===objective.target&&n.available):enemies.filter(e=>e.zone===c.zone&&e.kind===objective?.target&&e.alive);
 if(!candidates.length&&objective){const region=getZone(c.zone);candidates=(objective.kind==='gather'?region.nodes.map(point=>toWorld(c.zone,point)):OVERWORLD_SPAWNS.filter(point=>point.zone===c.zone)).filter(point=>point.kind===objective.target);}
 const next=candidates.sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
 closePanel();if(next)setWaypoint({...next,label:objective?.label||'Quest objective'});else toast('The grove is renewing. Explore for a moment, then try again.');
}
let lastJournalHTML='';
function renderJournal(){
 if(!player)return;const q=player.quest,c=getChapter(q),ending=q.ending?ENDINGS[q.ending]:null;
 $('panel-title').textContent='Quest journal';$('panel-eyebrow').textContent='MOSSVALE';
 const html=`<button class="adventure-link" data-quest-section="contracts">${icon('left')} Adventure contracts</button>${renderStoryJournal(player,storyNpcName)}<details class="campaign-journal"><summary>${icon('book')} The Lanterns Between <small>${q.completed?'Complete':`Chapter ${q.chapter+1} / ${CHAPTERS.length}`}</small></summary>${q.completed&&ending?`<div class="ending-mark">${icon('crown')}</div><h3>${ending.title}</h3><div class="dialogue-lines">${ending.epilogue.map(line=>`<p>${line}</p>`).join('')}</div>`:`<p class="story-synopsis">${c.summary}</p><div class="campaign-kicker">${icon(zoneIcons[c.zone])}${getZone(c.zone).name} · ${q.stage===0?'Speak with Rowan to begin':q.stage===2?'Ready to continue':'Chapter in progress'}</div><div class="objective-list">${c.objectives.map(o=>`<div class="journal-objective">${icon((q.progress[o.id]||0)>=o.count?'check':objectiveIcon(o))}<span class="objective-name">${o.label}</span><span>${Math.min(q.progress[o.id]||0,o.count)} / ${o.count}</span></div>`).join('')}</div><div class="quest-reward">${icon('gold')} ${c.reward.xp} experience · ${c.reward.gold} gold${c.reward.potions?` · ${c.reward.potions} potions`:''}</div>`}<details class="chapter-history"><summary>${icon('book')} The journey so far</summary><ol class="chapter-list">${CHAPTERS.map(ch=>`<li class="${q.completed||ch.id<q.chapter?'complete':ch.id===q.chapter?'current':'future'}">${icon(q.completed||ch.id<q.chapter?'check':zoneIcons[ch.zone])}<div><strong>${ch.id+1}. ${ch.id<=q.chapter||q.completed?ch.title:'An unwritten chapter'}</strong><small>${getZone(ch.zone).name}</small></div></li>`).join('')}</ol></details><div class="journal-actions"><button id="quest-follow" class="primary-button">${icon(q.completed?'map':'route')}${q.completed?'Explore the lantern roads':q.stage===0?'Mark Rowan':q.stage===2?'Mark story destination':'Mark next objective'}</button></div>`;
 const full=html+'</details>'+renderHearthlingJournal(player);
 if(lastJournalHTML!==full){lastJournalHTML=full;replacePanelContent(full);}
 $('quest-follow').onclick=followStory;
}
let trainerNpcId:string|null=null;
let trainingSelected='',trainingFilter:TrainingFilter='all',trainingPending:string|null=null,lastTrainingHTML='';
function nearbyTrainer(id=trainerNpcId){return !worldInstance&&player&&player.hp>0&&TRAINER_NPCS.find(n=>n.id===id&&Math.hypot(n.x-position.x,n.z-position.z)<=3&&canTraverse(position,n,colliders));}
function openTraining(id:string){
 const trainer=nearbyTrainer(id);if(!trainer||!allowFeature(trainer.className?'spells':'mounts'))return;
 if(trainerNpcId!==id||panel.dataset.mode!=='training'||!panel.open){trainingSelected='';trainingFilter='all';}
 trainerNpcId=id;lastTrainingHTML='';openPanel(trainer.name,trainer.title.toUpperCase(),'training');renderTrainingPanel();showNpcPortrait(id);
}
function showNpcPortrait(id:string){
 let portrait=panel.querySelector<HTMLElement>('.trainer-portrait');
 if(!portrait){portrait=document.createElement('span');portrait.className='trainer-portrait';portrait.setAttribute('aria-hidden','true');portrait.innerHTML=icon('book')+'<canvas hidden aria-hidden="true"></canvas><span class="trainer-portrait-ring"></span>';panel.querySelector('.panel-heading')!.prepend(portrait);}
 const source=npcViews.get(id)?.mesh,canvas=portrait.querySelector('canvas')!;
 if(portrait.dataset.npc!==id){
  canvas.hidden=true;canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);portrait.dataset.npc='';
  if(source)try{drawNpcPortrait(canvas,source);portrait.dataset.npc=id;canvas.hidden=false;}catch{/* Keep the framed icon if this NPC model is unavailable. */}
 }
}
function renderTrainingPanel(){
 const trainer=nearbyTrainer();if(!trainer||!player){closePanel();return;}
 if(trainingPending&&(player.learnedSpells?.includes(trainingPending as AbilityId)
   ||trainingPending.startsWith('riding-')&&(player.ridingRank??0)>=Number(trainingPending.slice(7))
   ||trainingPending.startsWith('mount-')&&player.ownedMounts?.includes(trainingPending.slice(6) as MountId)))trainingPending=null;
 const html=renderTraining(player,trainer,{selected:trainingSelected,filter:trainingFilter,pending:!!trainingPending})+renderStoryNpcChoices(player,trainer.id);
 if(html===lastTrainingHTML)return;lastTrainingHTML=html;
 const content=$('panel-content'),scroll=content.querySelector('.training-list')?.scrollTop??0,filterFocused=document.activeElement?.id==='training-filter';
 replacePanelContent(html);const list=content.querySelector('.training-list');if(list)list.scrollTop=scroll;
 trainingSelected=content.querySelector<HTMLElement>('[data-training-select][aria-pressed="true"]')?.dataset.trainingSelect||'';
 if(filterFocused)$('training-filter').focus({preventScroll:true});
}
function findTrainer(role:string){
 if(!player)return;if(worldInstance){toast('Return to the open world to visit a trainer.');return;}
 const trainer=TRAINER_NPCS.filter(n=>role==='class'?n.className===player!.appearance.className:n.role===role).sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
 if(trainer){closePanel();setWaypoint({id:trainer.id,x:trainer.x,z:trainer.z,label:`${trainer.name} · ${trainer.title}`});}
}
function requestVillageService(npcId:string,service:Extract<ClientMessage,{type:'npcService'}>['service']){
 send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();send({type:'npcService',npcId,service});
}
let hearthlingPending=false,hearthlingLines:string[]=[],hearthlingNotice='',lastHearthlingHTML='';
function nearHearthling(){return !!player&&connected&&player.hp>0&&!player.zeppelin&&!worldInstance&&!waterAt(position.x,position.z)&&Math.hypot(position.x-HEARTHLING_NPC.x,position.z-HEARTHLING_NPC.z)<=3&&canTraverse(position,HEARTHLING_NPC,colliders);}
function openHearthling(lines:string[]=[]){
 if(!player)return;
 hearthlingLines=lines;hearthlingNotice='';lastHearthlingHTML='';
 openPanel(HEARTHLING_NPC.name,HEARTHLING_NPC.title.toUpperCase(),'npc-talk');panel.dataset.npcId=HEARTHLING_NPC.id;
 renderHearthlingPanel();showNpcPortrait(HEARTHLING_NPC.id);
}
function renderHearthlingPanel(){
 if(!player)return;
 if(hearthlingPending&&player.meadGodPaid){hearthlingPending=false;hearthlingLines=[];hearthlingNotice='';}
 if(!panel.open||panel.dataset.npcId!==HEARTHLING_NPC.id)return;
 const html=renderHearthlingQuest(player,{available:nearHearthling(),pending:!!hearthlingPending,lines:hearthlingLines,notice:hearthlingNotice||(!connected?'Reconnect to continue this quest.':player.hp<=0?'Revive to continue this quest.':'')});
 if(html!==lastHearthlingHTML){lastHearthlingHTML=html;replacePanelContent(html);}
}
function findHearthling(){
 if(worldInstance){toast('Return to the open world to find MEADGod in Willowbrook.');return;}
 closePanel();setWaypoint({...HEARTHLING_NPC,label:'MEADGod · Willowbrook'});
}
function openDialogue(message:Extract<ServerMessage,{type:'dialogue'}>){
 if(message.npcId===HEARTHLING_NPC.id){openHearthling(message.lines);return;}
 if(message.npcId===GOLD_MERCHANT.id){goldMerchantUI.open();return;}
 if(message.npcId===SHADY_MERCHANT.id){treasureUI.open();return;}
 if(TRAINER_NPCS.some(n=>n.id===message.npcId)){openTraining(message.npcId);return;}
 const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const resident=VILLAGE_NPCS.find(n=>n.id===message.npcId);
 if(resident){
  const role=CITY_VENDORS.find(n=>n.id===resident.id)?.title||(resident.role==='merchant'?'Village merchant':resident.role==='warden'?'Village warden':'Village healer');
  openPanel(resident.name,role.toUpperCase(),'npc-talk');
  $('panel-content').innerHTML=`<section class="training-shell npc-talk-shell" aria-label="Conversation with ${escape(resident.name)}"><div class="dialogue-lines npc-talk-copy">${message.lines.map(line=>`<p>${escape(line)}</p>`).join('')}</div><div class="npc-talk-actions">${(message.services||[]).map(service=>`<button type="button" class="primary-button" data-npc-service="${escape(service.id)}" data-npc-id="${escape(resident.id)}">${icon(service.id==='trade'?'bag':service.id==='contracts'?'book':'potion')}<span>${escape(service.id==='trade'?'Browse supplies':service.label)}</span></button>`).join('')}<button type="button" id="dialogue-continue" class="primary-button npc-talk-close">Close</button></div></section>`;
  $('panel-content').insertAdjacentHTML('beforeend',renderStoryNpcChoices(player??null,resident.id));
  $('dialogue-continue').onclick=closePanel;showNpcPortrait(resident.id);return;
 }
 const speaker=NPCS.find(n=>n.id===message.npcId);
 if(speaker&&!message.choices){
  openPanel(speaker.name,speaker.title.toUpperCase(),'npc-talk');
  $('panel-content').innerHTML=`<section class="training-shell npc-talk-shell" aria-label="Conversation with ${escape(speaker.name)}"><div class="dialogue-lines npc-talk-copy">${message.title!==speaker.name?`<h3 class="npc-talk-topic">${escape(message.title)}</h3>`:''}${message.lines.map(line=>`<p>${escape(line)}</p>`).join('')}</div><div class="npc-talk-actions"><button type="button" id="dialogue-continue" class="primary-button npc-talk-close">Close</button></div></section>`;
  $('panel-content').insertAdjacentHTML('beforeend',renderStoryNpcChoices(player??null,speaker.id));
  $('dialogue-continue').onclick=()=>{closePanel();if(player?.quest.completed)openJournal();};showNpcPortrait(speaker.id);return;
 }
 openPanel(message.title,'THE LANTERNS BETWEEN','dialogue');
 $('panel-content').innerHTML=`<div class="dialogue-speaker">${icon(message.choices?'beacon':message.npcId.includes('beacon')?'beacon':'interact')}<span>${speaker?.title||'A memory carried by the lanterns'}</span></div><div class="dialogue-lines">${message.lines.map(line=>`<p>${line}</p>`).join('')}</div>${message.choices?`<div class="story-choices">${message.choices.map(choice=>`<button class="primary-button" data-ending="${choice.id}">${icon(choice.id==='rekindle'?'beacon':'sun')}${choice.label}</button>`).join('')}</div><p class="journey-note">This choice concludes your story. You can keep exploring every zone afterward.</p>`:`<button id="dialogue-continue" class="primary-button">Continue your journey ${icon('arrow')}</button>`}`;
 if(message.choices)document.querySelectorAll<HTMLButtonElement>('[data-ending]').forEach(button=>button.onclick=()=>{send({type:'chooseEnding',ending:button.dataset.ending as Ending});closePanel();});
 else $('dialogue-continue').onclick=()=>{closePanel();if(player?.quest.completed)openJournal();};
}
let contractZone:ZoneId='greenwood';
let contractPage=0,lastContractHTML='',treasureMapStarting=false,treasureMapMessage='',selectedAdventure='treasure';
let selectedContractId='',trackedContractId='',trackedStoryQuestId='',adventureBoardTab:AdventureBoardTab='noticeboard';
function openTreasureMap(){
 if(!player)return;contractZone=worldZone;contractPage=0;lastContractHTML='';selectedAdventure='treasure';selectedContractId='';adventureBoardTab='active';
 openPanel('The adventure board',`${getZone(worldZone).name.toUpperCase()} · MOSSVALE`,'contracts');renderContractPanel();
 document.getElementById('treasure-map-heading')?.focus({preventScroll:true});
}
function startTreasureMap(){
 if(!player||!connected||treasureMapStarting||player.hp<=0||worldInstance||player.zeppelin)return;
 if(player.treasureMap){openTreasureMap();return;}
 if(!player.carriedItems?.['treasure-map'])return;
 treasureMapStarting=true;treasureMapMessage='';send({type:'treasureMapStart'});openTreasureMap();
}
function trackTreasureMap(){
 if(worldInstance){toast('Return to the open world to continue your treasure map.');return;}
 const point=treasureMapWaypoint(player);if(!point)return;closePanel();
 if(setWaypoint(point))toast(player?.treasureMap?.stage==='search'?'Follow the waypoint, then search nearby for disturbed earth.':'Follow the waypoint back to your treasure.');
}
function nearStation(kind:'board'|'workshop',zone=worldZone){const point=toWorld(zone,kind==='board'?{x:3,z:2}:{x:-4,z:3});return !worldInstance&&(Math.hypot(point.x-position.x,point.z-position.z)<=3||kind==='board'&&VILLAGE_NPCS.some(n=>n.role==='warden'&&n.zone===zone&&Math.hypot(n.x-position.x,n.z-position.z)<=3&&canTraverse(position,n,colliders)));}
function findStation(kind:'board'|'workshop',zone=worldZone){if(worldInstance){toast('Return to the open world first.');return;}closePanel();const points=targetPoints(),ids=new Set([`${kind}-${zone}`,...(kind==='board'?VILLAGE_NPCS.filter(n=>n.role==='warden'&&n.zone===zone).map(n=>n.id):[])]);const point=points.filter(p=>ids.has(p.id)).sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];if(point)setWaypoint(point);}
function openContracts(zone=worldZone){if(player&&!onboardingFeatureUnlocked(player,'contracts')){if(player.treasureMap||player.carriedItems?.['treasure-map'])openTreasureMap();else allowFeature('contracts');return;}contractZone=zone;contractPage=0;lastContractHTML='';selectedContractId='';adventureBoardTab='noticeboard';openPanel('The adventure board',`${getZone(zone).name.toUpperCase()} · MOSSVALE`,'contracts');renderContractPanel();}
function trackContract(id:string){
 const contract=CONTRACTS.find(c=>c.id===id);if(!player||!contract||!Object.hasOwn(player.contracts.active,id)||!connected||player.hp<=0)return;
 if(worldInstance){toast('Return to the open world to track this contract.');return;}
 trackedContractId=id;trackedStoryQuestId='';lastHUD='';updateHUD();
 if(player.contracts.active[id]>=contract.count){findStation('board',contract.zone);return;}
 if(contract.kind==='craft'){findStation('workshop',contract.zone);return;}
 if(contract.kind==='dungeon'){const entry=getDungeon('rootvault');if(entry){closePanel();setWaypoint({...entry.entrance,label:entry.name});}return;}
 const matches=(point:{zone:ZoneId;kind:string;x:number;z:number})=>point.zone===contract.zone&&point.kind===contract.target&&(!contract.targetRegion||surfaceAt(point.x,point.z).regionId===contract.targetRegion);
 // Match the server's authored spawn region and level, even when a live enemy has wandered.
 const spawns=OVERWORLD_SPAWNS.filter(spawn=>matches(spawn)&&(!contract.targetLevel||monsterSpawnLevel(spawn,surfaceAt(spawn.x,spawn.z).regionId)>=contract.targetLevel));
 const spawnIds=new Set(spawns.map(spawn=>spawn.id));
 let candidates:{id:string;x:number;z:number}[]=contract.kind==='gather'?nodes.filter(node=>!node.instanceId&&node.available&&matches(node)):enemies.filter(enemy=>!enemy.instanceId&&enemy.alive&&enemy.hp>0&&spawnIds.has(enemy.id));
 if(!candidates.length)candidates=contract.kind==='gather'?WORLD_GATHERING_NODES.filter(matches):spawns;
 const next=candidates.sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
 closePanel();if(next)setWaypoint({...next,label:contract.label});else toast('No objective is available yet. Explore for a moment, then track this contract again.');
}
function renderContractPanel(){
 if(!player)return;
 const now=Date.now()+serverOffset,nearBoard=nearStation('board',contractZone),unlocked=onboardingFeatureUnlocked(player,'contracts');
 const detail=unlocked&&selectedContractId?renderContractDetail(player,selectedContractId,contractZone,nearBoard,now):'';
 if(!detail)selectedContractId='';panel.dataset.contractView=detail?'detail':'board';
 const html=detail||renderAdventureTabs(adventureBoardTab)+(adventureBoardTab==='completed'?renderCompletedAdventures(player,now):
  (adventureBoardTab==='active'?renderAdventureJournal(player,treasureMapStarting,treasureMapMessage,selectedAdventure,true)+renderStoryJournal(player,storyNpcName):'')+
  (unlocked?renderContracts(player,contractZone,nearBoard,now,contractPage,adventureBoardTab==='active'):'<p>Complete Rowan’s first quest to unlock adventure contracts.</p>'));
 if(lastContractHTML!==html){const focusedId=document.activeElement?.id;replacePanelContent(html);lastContractHTML=html;if(focusedId==='treasure-map-heading'||focusedId==='contract-detail-title')document.getElementById(focusedId)?.focus({preventScroll:true});}
 const page=$('panel-content').querySelector<HTMLElement>('[data-contract-page-current]');if(page)contractPage=Number(page.dataset.contractPageCurrent);
}
function openCrafting(){if(!allowFeature('crafting'))return;openPanel('The workshop','GATHER. CRAFT. ADVENTURE.','crafting');renderCraftPanel();}
function renderCraftPanel(){
 if(!player)return;
 const sections=[...document.querySelectorAll<HTMLDetailsElement>('[data-crafting-rank]')].map(section=>({rank:section.dataset.craftingRank,open:section.open,focused:section.querySelector('summary')===document.activeElement}));
 replacePanelContent(renderCrafting(player,nearStation('workshop')));
 for(const saved of sections){const section=document.querySelector<HTMLDetailsElement>(`[data-crafting-rank="${saved.rank}"]`);if(section){section.open=saved.open;if(saved.focused)section.querySelector('summary')?.focus({preventScroll:true});}}
}
function updateWho(){if(player)friendsUI.updateWho({player,party,invites:partyInvites.filter(invite=>invite.expiresAt>Date.now()+serverOffset),players,lockReason:onboardingLockReason(player,'party'),pendingInvite:pendingPartyInvite});}
function openParty(){if(!allowFeature('party'))return;closePanel();updateWho();friendsUI.open('who');}
function updatePartyInvitation(){
 const popup=$('party-invitation'),invite=partyInvites.find(invite=>invite.expiresAt>Date.now()+serverOffset);
 if(dungeonSummon&&dungeonSummon.expiresAt>Date.now()+serverOffset&&connected&&!entryActive&&!rosterActive&&player){
  const host=panel.matches(':modal')?panel:$('play-ui');if(popup.parentElement!==host)host.append(popup);
  popup.dataset.summonId=dungeonSummon.id;
  $('party-invitation-title').textContent='Party summon';
  $('party-invitation-message').textContent=`${dungeonSummon.fromName} invites you to the summon stone at ${dungeonSummon.dungeonName}.`;
  $('party-invitation-note').hidden=true;
  $<HTMLButtonElement>('party-invitation-accept').disabled=player.hp<=0||!!worldInstance;
  $<HTMLButtonElement>('party-invitation-decline').disabled=false;
  $('party-invitation-accept').textContent='Travel there';
  if(!popup.matches(':popover-open'))popup.showPopover();return;
 }
 delete popup.dataset.summonId;$('party-invitation-title').textContent='Party invitation';$('party-invitation-accept').textContent='Accept';
 if(!connected||entryActive||rosterActive||!player||party||!invite){if(popup.matches(':popover-open'))popup.hidePopover();return;}
 const host=panel.matches(':modal')?panel:$('play-ui');if(popup.parentElement!==host)host.append(popup);
 popup.dataset.invitationId=invite.id;
 const message=`${invite.inviterName} has invited you to a party.`;
 if($('party-invitation-message').textContent!==message)$('party-invitation-message').textContent=message;
 const note=player.hp<=0?'Revive before joining a party.':player.instanceId?'Return to the open world to join.':onboardingLockReason(player,'party');
 $('party-invitation-note').textContent=note;$('party-invitation-note').hidden=!note;
 $<HTMLButtonElement>('party-invitation-accept').disabled=!!pendingPartyInvite||!!note;
 $<HTMLButtonElement>('party-invitation-decline').disabled=!!pendingPartyInvite;
 if(!popup.matches(':popover-open'))popup.showPopover();
}
function respondToPartyInvite(type:'partyAccept'|'partyDecline',invitationId:string,fromPopup=false){
 const summonId=$('party-invitation').dataset.summonId;
 if(fromPopup&&summonId&&dungeonSummon?.id===summonId){send({type:'dungeonSummonRespond',summonId,accept:type==='partyAccept'});dungeonSummon=null;updatePartyInvitation();return;}
 if(!connected||pendingPartyInvite||!player?.characterCreated||!partyInvites.some(invite=>invite.id===invitationId&&invite.expiresAt>Date.now()+serverOffset))return;
 if(type==='partyAccept'&&(party||player.instanceId||player.hp<=0||!allowFeature('party')))return;
 pendingPartyInvite=invitationId;send({type,invitationId});updatePartyInvitation();updateWho();
}
$('party-invitation-accept').onclick=()=>respondToPartyInvite('partyAccept',$('party-invitation').dataset.invitationId!,true);
$('party-invitation-decline').onclick=()=>respondToPartyInvite('partyDecline',$('party-invitation').dataset.invitationId!,true);
$('party-invitation').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();respondToPartyInvite('partyDecline',$('party-invitation').dataset.invitationId!,true);}event.stopPropagation();});
$('party-invitation').addEventListener('pointerdown',()=>keys.clear());
let lastPartyHUD='';
function updatePartyHUD(){const html=partyHUD(party,partyInvites);if(html===lastPartyHUD)return;lastPartyHUD=html;$('party-hud').hidden=!html;$('party-hud').innerHTML=html;}
function openDungeon(id: DungeonId = dungeon?.kind??dungeonChoice){
 if(isInstantCombatInstance(worldInstance)){openInstantCombat();return;}
 if(worldInstance?.startsWith('raid-')){openRaid();return;}
 if(isArenaInstance(worldInstance))return;
 if(!allowFeature('dungeon'))return;dungeonChoice=id;lastDungeonPanel='';
 const entry=getDungeon(id)!;openPanel(entry.name,`${entry.storyQuestId?'STORY CHAMBER':'MOSS GATE'} · LEVELS ${entry.minLevel}–${entry.maxLevel} · 1–4 ADVENTURERS`,'dungeon');
 if(!dungeon?.dream&&!entry.storyQuestId)loadDungeonLeaderboard(dungeon?.result?.partySize??party?.members.length??1);else renderDungeonPanel();
}
function openArena(){
 if(!player?.characterCreated||!connected||entryActive||rosterActive)return;
 if(duelUI.busy()||arenaUI.busy()){if(panel.open)closePanel();toast('Finish the current challenge or match first.');return;}
 stopForSocialUI();playerMenu.close();
 openPanel('Arena matches','','arena');
 lastArenaMenu='';
 renderArenaPanel();
}
function renderArenaPanel(){
 if(!player)return;
 const html=renderArenaMenu({player,players:players.filter(other=>Math.hypot(other.x-player!.x,other.z-player!.z)<=80),party,queue:arenaQueue,wagerMoss:arenaWagerMoss,native:isNativeApp(),
  queueReason:arenaQueueReason,challengeReason:arenaChallengeReason,duelReason:duelChallengeReason});
 if(html!==lastArenaMenu){
  const content=$('panel-content'),input=content.querySelector<HTMLInputElement>('#arena-wager-moss'),focused=document.activeElement===input;
  const finderScroll=content.querySelector('.arena-finder')?.scrollTop,rosterScroll=content.querySelector('.arena-finder-players')?.scrollTop;
  replacePanelContent(html);lastArenaMenu=html;
  const next=$('panel-content').querySelector<HTMLInputElement>('#arena-wager-moss');
  if(input&&next){next.replaceWith(input);if(focused)input.focus({preventScroll:true});}
  const finder=content.querySelector('.arena-finder'),roster=content.querySelector('.arena-finder-players');
  if(finder&&finderScroll!==undefined)finder.scrollTop=finderScroll;if(roster&&rosterScroll!==undefined)roster.scrollTop=rosterScroll;
 }
}
function renderDungeonPanel(){
 if(!player||usesArenaWorld(worldInstance)||worldInstance?.startsWith('raid-'))return;
 const entry=getDungeon(dungeon?.kind??dungeonChoice)!,at=worldInstance?dungeonExitPoint():entry.entrance;
 const stages=dungeonStages(entry.id),optional=stages.filter(stage=>stage.optional).length;
 const storyUnlocked=(item:typeof entry)=>!item.storyQuestId||Object.hasOwn(player!.storyQuests?.active??{},item.storyQuestId);
 const questLocked=!storyUnlocked(entry),storyCompleted=!!entry.storyQuestId&&!!player.storyQuests?.completed.includes(entry.storyQuestId);
 const near=Math.hypot(at.x-position.x,at.z-position.z)<=3,leader=!party||party.leaderId===player.id;
 const locked=entry.id==='rootvault'&&!player.rootvaultUnlocked,underLevel=player.level<entry.minLevel;
 const nearStone=!worldInstance&&Math.hypot(entry.summonStone.x-position.x,entry.summonStone.z-position.z)<=3;
 const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const preparation=worldInstance&&inDungeonPreparation(position,entry.id);
 const content=dungeon?`${dungeon.result?renderDungeonResult(dungeon.result,player):''}${preparation?'<p class="journey-note">Arrival sanctuary · Safe to prepare. Use the room portal to begin combat.</p>':''}<p class="dungeon-chapter">${dungeon.dream?escape(dungeon.name):dungeon.completed?'Dungeon cleared':escape(dungeon.encounterName)}</p><ul class="dungeon-objectives">${dungeon.objectives.map(objective=>`<li>${escape(objective)}</li>`).join('')}</ul><p class="journey-note">${dungeon.dream?'Collected keepsakes stay with you. Wake safely when time runs out.':`${dungeon.checkpoint.active?'Sanctuary checkpoint active':'Find the sanctuary to secure a checkpoint'} · ${dungeon.wipes} wipes`}</p><div class="adventure-actions"><button class="primary-button" data-open-map>${icon('map')} Explore the dungeon map</button><button class="primary-button" data-dungeon-exit>${icon('route')} ${near?'Return to the entrance':dungeon.completed?'Find the return portal':'Find the exit'}</button></div>`:`
 <div class="dungeon-browser"><nav class="dungeon-catalog" aria-label="Choose dungeon">${DUNGEONS.filter(storyUnlocked).map(item=>`<button class="primary-button" data-choose-dungeon="${item.id}" aria-pressed="${item.id===entry.id}">${icon('boss')}<span><strong>${item.name}</strong><small>${player!.level<item.minLevel?`Unlocks at level ${item.minLevel}`:item.storyQuestId?'Story chamber':player!.level<=item.maxLevel?'For your level':'Open for exploration'}</small></span><em>Lv. ${item.minLevel}–${item.maxLevel}</em></button>`).join('')}</nav><section class="dungeon-detail" aria-label="${escape(entry.name)}"><header class="dungeon-overview"><div><span class="eyebrow">LEVEL ${entry.minLevel}–${entry.maxLevel} · ${entry.storyQuestId?'STORY CHAMBER':'DUNGEON'}</span><h3>${entry.name}</h3><p>${entry.description}</p></div>${icon('beacon')}</header><dl class="dungeon-facts"><div><dt>Main encounters</dt><dd>${stages.length-optional}</dd></div><div><dt>Side encounters</dt><dd>${optional}</dd></div><div><dt>Your party</dt><dd>${party?.members.length??1} / 4</dd></div></dl><h4>Before you enter</h4>${dungeonPreparation(entry.id)?'<p class="journey-note">Arrive in a protected sanctuary. Prepare with your party, then use the room portal to begin combat.</p>':''}<p class="journey-note">${underLevel?`Reach level ${entry.minLevel} to enter. `:''}${questLocked?storyCompleted?'You have already completed this chamber’s story quest.':'Accept this chamber’s story quest before entering.':locked?'Defeat the Rootvault Gatekeeper to unlock this entrance. Nearby living party members share the victory.':'Gather at the glowing Moss Gate to enter the dungeon.'}</p>
 ${entry.storyQuestId?'<p>Follow the chamber objectives, activate its seals and keys in order, and defeat its guardian. Timed rooms require all waves and the full countdown. Return to the quest giver for your one-time reward.</p>':`<p>Follow ${stages.length-optional} main encounters, awaken both rune seals, and secure the sanctuary checkpoint. Defeat the final boss to earn the completion reward and final time${optional?`; ${optional} side encounters offer optional treasure`:''}. Ordinary combat rooms lock until their monsters are defeated.</p>`}
 <h4>Completion rewards</h4><p class="quest-reward">${entry.storyQuestId?'One-time quest rewards · No completion loot roll or leaderboard':`Personal treasure · +${entry.completionXp} XP on completion · One equipment roll, lantern fragments and relics`}</p>
 <div class="adventure-actions"><button class="primary-button" data-dungeon-enter ${underLevel||questLocked||!leader&&near?'disabled':''}>${icon('boss')} ${underLevel?`Requires level ${entry.minLevel}`:questLocked?storyCompleted?'Story completed':'Story quest required':locked?'Find the Gatekeeper':!near?'Find the Moss Gate':leader?`Enter ${entry.name}`:'Waiting for party leader'}</button><button class="primary-button" data-find-summon="${entry.id}">${icon('route')} Find summon stone</button><button class="primary-button" data-open-party>${icon('invite')} Manage party</button></div>
 <h3>Summon stone</h3><p class="journey-note">${nearStone?'Choose a party member. They can accept to travel to this stone.':'Approach the summon stone beside the portal to bring your party here.'}</p>
 ${party?party.members.filter(member=>member.id!==player!.id).map(member=>`<article class="party-member"><div><strong>${escape(member.name)}</strong><small>Level ${member.level}${member.instanceId?' · In a dungeon':member.hp<=0?' · Fallen':''}</small></div><button class="primary-button" data-dungeon-summon="${escape(member.id)}" ${!nearStone||member.hp<=0||member.instanceId||member.level<entry.minLevel?'disabled':''}>Summon</button></article>`).join(''):'<p class="journey-note">Form a party to summon friends.</p>'}</section></div>`;
 const html=content+(!entry.storyQuestId&&!dungeon?.dream&&dungeonBoard?.dungeonId===entry.id?renderDungeonLeaderboard(dungeonBoard):'');
 if(html!==lastDungeonPanel){replacePanelContent(html);lastDungeonPanel=html;if(dungeon?.result)revealDungeonRewards($('panel-content'),dungeon.result,player.id);}
}
function dungeonExitPoint(){
 const portal=dungeonReturn(dungeon?.kind);
 return dungeon?.completed&&Math.hypot(position.x-portal.x,position.z-portal.z)<Math.hypot(position.x-DUNGEON_EXIT.x,position.z-DUNGEON_EXIT.z)?portal:DUNGEON_EXIT;
}
function lootSummary(drop:LootDrop){return `${lootRows(drop).length} drops · Yours to loot`;}
let skillTab:'combat'|'professions'='combat';
function openSkills(){if(player&&!onboardingFeatureUnlocked(player,'spells')&&onboardingFeatureUnlocked(player,'professions'))openProfessions();else skillTab==='professions'?openProfessions():openSpells();}
function wireSkillTabs(){document.querySelectorAll<HTMLButtonElement>('[data-skill-tab]').forEach(button=>button.onclick=()=>button.dataset.skillTab==='professions'?openProfessions():openSpells());}
function findGatheringResource(skill:SkillId,kind?:NodeKind){
 if(!player)return;
 const known=worldInstance?[]:WORLD_GATHERING_NODES;
 const candidates=new Map<string,{id:string;kind:NodeKind;x:number;z:number;available?:boolean}>(known.map(node=>[node.id,node]));
 for(const node of nodes)candidates.set(node.id,node);
 const next=[...candidates.values()].filter(node=>node.available!==false&&RESOURCE_TYPES[node.kind].skill===skill&&(!kind||node.kind===kind)&&canGather(node.kind,player!.skills[skill]))
  .sort((a,b)=>RESOURCE_TYPES[b.kind].requiredLevel-RESOURCE_TYPES[a.kind].requiredLevel||Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
 if(!next){toast('No available resources for your skill here. Try again shortly.');return;}
 closePanel();const info=RESOURCE_TYPES[next.kind];
 const point:TargetInfo=targetPoints().find(point=>point.id===next.id)||{...next,kind:'node',name:info.label,label:`${info.verb} ${info.label}`,height:(info.height??1.2)+.3};
 setWaypoint(point);
}
let professionGuide:SkillId|null=null,lastProfessions='',professionReturnScroll=0,professionReturnPanelScroll=0;
function showProfessionGuide(id:SkillId|null){
 const previous=professionGuide;
 if(id){professionReturnScroll=$('panel-content').scrollTop;professionReturnPanelScroll=panel.scrollTop;}
 professionGuide=id;renderProfessions();
 $('panel-content').scrollTop=id?0:professionReturnScroll;panel.scrollTop=id?0:professionReturnPanelScroll;
 const focus=id?document.getElementById('profession-guide-title'):document.querySelector<HTMLElement>(`[data-profession-guide="${previous}"]`);
 focus?.focus({preventScroll:true});
}
function renderProfessions(){
 if(!player)return;
 const fingerprint=JSON.stringify([player.id,player.skills,player.appearance.className,professionGuide]);
 if(fingerprint===lastProfessions&&$('panel-content').querySelector('.profession-list, .profession-guide'))return;
 lastProfessions=fingerprint;
 replacePanelContent(skillTabs('professions')+(professionGuide?renderProfessionGuide(player,professionGuide):renderSkills(player)));wireSkillTabs();
 document.querySelectorAll<HTMLButtonElement>('[data-profession-guide]').forEach(button=>button.onclick=()=>{const id=button.dataset.professionGuide as SkillId;if(Object.hasOwn(SKILLS,id))showProfessionGuide(id);});
 document.querySelector<HTMLButtonElement>('[data-profession-back]')?.addEventListener('click',()=>showProfessionGuide(null));
 document.querySelectorAll<HTMLButtonElement>('[data-train-skill]').forEach(button=>button.onclick=()=>findGatheringResource(button.dataset.trainSkill as SkillId));
 document.querySelectorAll<HTMLButtonElement>('[data-resource-kind]').forEach(button=>button.onclick=()=>{const kind=button.dataset.resourceKind as NodeKind;if(Object.hasOwn(RESOURCE_TYPES,kind))findGatheringResource(RESOURCE_TYPES[kind].skill,kind);});
}
function openProfessions(){if(!allowFeature('professions'))return;skillTab='professions';professionGuide=null;openPanel('Your professions','GATHER. PRACTICE. GROW.','professions');renderProfessions();}
function openSpells(){if(!allowFeature('spells'))return;skillTab='combat';
 openPanel('Your spellbook',`${appearance.className.toUpperCase()} · ABILITIES`,'spells');renderSpells();
}
let lastSpellBook='';
function renderSpells(){if(!player)return;
 const fingerprint=JSON.stringify([player.id,player.level,player.learnedSpells,player.talents,player.appearance.className,combatStats(player),player.inventory.potion]);
 if(fingerprint===lastSpellBook&&$('panel-content').querySelector('.spell-list'))return;lastSpellBook=fingerprint;
 replacePanelContent(skillTabs('combat')+renderSpellbook(player,hotbar.slots));wireSkillTabs();hotbar.refresh();
}
function toggleBackpack(){
 if(!allowFeature('bag'))return;
 if(panel.open&&(panel.dataset.mode==='gear'||panel.dataset.mode==='inventory')){closePanel();return;}openInventory();
}
function toggleCharacter(){if(panel.open&&panel.dataset.mode==='gear')closePanel();else openCharacter();}
function openInventory(layout:'grid'|'list'='list'){
 if(!player?.characterCreated||!allowFeature('bag'))return;
 inventoryLayout=layout;lastGearHTML='';closedBagIds.clear();openPanel(layout==='list'?'Backpack':player.name,`LEVEL ${player.level} · ${player.appearance.className.toUpperCase()}`,layout==='list'?'inventory':'gear');renderGearPanel();watchBagBalance();acknowledgeGuide('bag');
}
function reconcileBagSelection(includeEquipment=false){
 if(!player||!selectedBagItem)return;
 if(bagItems(lootUI.displayPlayer(player)).includes(selectedBagItem)||player.ownedBags?.some(bag=>`bag:${bag.id}`===selectedBagItem)||includeEquipment&&Object.values(player.equipment).includes(selectedBagItem))return;
 selectedBagItem='';upgradingBagItem=false;
}
function renderInventory(){renderGearPanel();}
function toggleTalents(){if(panel.open&&panel.dataset.mode==='talents')closePanel();else openTalents();}
function openTalents(){if(!player?.characterCreated||!allowFeature('talents'))return;lastTalentHTML='';openPanel('Skill Tree',`${appearance.className.toUpperCase()} · CHOOSE YOUR PATH`,'talents');renderTalentPanel();}
function renderTalentPanel(){if(!player)return;const html=renderTalents(player);if(html===lastTalentHTML)return;lastTalentHTML=html;replacePanelContent(html);refreshTalentHover();}
function openCharacter(){if(!player?.characterCreated||!allowFeature('gear'))return;openInventory('grid');acknowledgeGuide('gear');}
function renderGearPanel(){
 if(!player||draggedGear||draggedBag||draggedItem)return;
 if(deferTouchRender(panel,()=>{if(panel.open&&(panel.dataset.mode==='gear'||panel.dataset.mode==='inventory'))renderGearPanel();}))return;
 reconcileBagSelection(true);
 panel.dataset.mode=inventoryLayout==='list'?'inventory':'gear';
 $('panel-title').textContent=inventoryLayout==='list'?'Backpack':player.name;
 $('panel-eyebrow').textContent=`LEVEL ${player.level} · ${player.appearance.className.toUpperCase()}`;
 if(inventoryLayout==='list')disposeCharacterView();
 const display=lootUI.displayPlayer(player);
 const html=inventoryLayout==='list'
  ? renderBackpack(display,selectedBagItem,true,[...closedBagIds],reconcileBagSlots(display,currentBagSlots()),bagView,upgradingBagItem)
  : renderGear(display,selectedBagItem,false,[...closedBagIds],reconcileBagSlots(display,currentBagSlots()),upgradingBagItem,bagView);
 if(html!==lastGearHTML){lastGearHTML=html;replacePanelContent(html);}
 const stage=document.querySelector<HTMLElement>('.paper-doll-stage');
 if(stage){try {if(characterView)characterView.update(player);else characterView=mountCharacterView(stage,player);}catch {stage.textContent='Character preview unavailable. Your equipment is still usable.';}}
}
let inspectedPlayerId:string|null=null,inspectionKey='';
type ChatChannel='world'|'system'|'whisper'|'party';
let chatChannel:ChatChannel='world';
const chatDrafts:Record<ChatChannel,string>={world:'',system:'',whisper:'',party:''};
const chatPreviewMessages:{channel:ChatChannel;text:string;name?:string;playerId?:string;messageId?:string}[]=[];
const chatScroll=new Map<ChatChannel,{follow:boolean;top:number;anchor:HTMLElement|null;offset:number}>();
let whisperTarget:{id:string;name:string}|null=null;
const chatTranslation=mountChatTranslation({select:$<HTMLSelectElement>('chat-language'),status:$('chat-translation-status'),attribution:$('chat-translation-attribution'),send,readLocal,saveLocal,beforeUpdate:()=>rememberChatScroll(true),afterUpdate:()=>{if(!$('chat').classList.contains('collapsed'))restoreChatScroll();}});
const friendsUI=mountFriendsUI({send,allowed:()=>connected&&!entryActive&&!rosterActive&&!!player?.characterCreated,trigger:$<HTMLButtonElement>('friends-button'),onOpen:()=>{stopForSocialUI();playerMenu.close();},onWhisper:openWhisper,onInvite:id=>{if(allowFeature('party'))send({type:'partyInvite',targetId:id});},onPartyRespond:respondToPartyInvite,onPartyChat:()=>{selectChatChannel('party');$<HTMLInputElement>('chat-input').focus();},onDungeon:()=>openDungeon()});
const achievementsUI=mountAchievementsUI({onSelectTitle:titleId=>send({type:'selectTitle',titleId}),trigger:$<HTMLButtonElement>('achievements-button'),allowed:()=>connected&&!entryActive&&!rosterActive&&!!player?.characterCreated,onOpen:()=>{stopForSocialUI();playerMenu.close();}});
const itemMenu=mountItemMenu(panel,()=>player,(action,id)=>{
 if(action==='inspect')selectBagItem(id);
 else if(connected)send({type:'dropItem',itemId:id,quantity:1});
});
const playerMenu=mountPlayerMenu(playerAction,()=>connected&&!entryActive&&!rosterActive&&player?.role==='gm',(other,size)=>arenaChallengeReason(other,size)||true,other=>duelChallengeReason(other)||true,other=>!player||player.travel?.mount!=='wayfarer-stag'||player.travel.driverId?false:player.travel.passengerId?'Your second seat is occupied.':other.travel?.mount?'That player is already mounted.':player.hp<=0||other.hp<=0||worldInstance||other.instanceId||player.zeppelin||other.zeppelin||player.zone!==other.zone||Math.hypot(player.x-other.x,player.z-other.z)>6?'Stand together outdoors to invite a passenger.':true);
const duelUI=mountDuelUI(message=>{stopForSocialUI();send(message);},id=>{clearWaypoint();clearMovementKeys();playerMenu.close();autoAttackTarget=null;selectedId=id;hoveredId=null;canvas.focus();});
const arenaUI=mountArenaUI(message=>{stopForSocialUI();send(message);},id=>{clearWaypoint();clearMovementKeys();playerMenu.close();autoAttackTarget=null;selectedId=id;hoveredId=null;canvas.focus();},()=>playerId,matchId=>arenaWagerUI.open(matchId),()=>{if(arenaWagerUI.walletReady())return true;arenaWagerUI.connect();return false;});
const arenaWagerUI=mountArenaWagerUI({send,getPlayer:()=>player,allowed:()=>connected&&!entryActive&&!rosterActive&&!!player?.characterCreated&&!player.arenaMatchId&&(!arena||arena.phase==='finished'),onOpen:()=>{stopForSocialUI();playerMenu.close();if(panel.open)closePanel();},now:()=>Date.now()+serverOffset});
$('duel-card').addEventListener('pointerdown',()=>keys.clear());
const gmUI=mountGmUI({send,getPlayer:()=>connected&&!entryActive&&!rosterActive?player:undefined,getPlayers:()=>gmPlayers,onOpen:()=>{stopForSocialUI();playerMenu.close();if(panel.open&&!floatingPanel())closePanel();}});
inputActivity=createInputActivity({active:()=>connected&&!entryActive&&!rosterActive&&!worldLoading&&!!player?.characterCreated,send:sample=>{send({type:'inputActivity',sample});}});
window.addEventListener('pagehide',()=>inputActivity?.reset());
communityUI=mountCommunityUI(message=>{if(!connected||socket?.readyState!==WebSocket.OPEN){communityUI?.result(false,'Reconnect to the realm, then try again.');return;}send(message);},()=>{stopForSocialUI();playerMenu.close();});
const reportsButton=document.createElement('button');reportsButton.type='button';reportsButton.textContent='Reports';reportsButton.onclick=()=>communityUI?.inbox();$('gm-window').querySelector('header')!.append(reportsButton);
const gmButton=document.createElement('button');gmButton.id='gm-button';gmButton.type='button';gmButton.hidden=true;gmButton.innerHTML=icon('crown');gmButton.title='Game master controls';gmButton.setAttribute('aria-label','Open game master controls');$('settings-button').before(gmButton);gmButton.onclick=()=>gmUI.open();
function refreshGmAccess(){updatePlayerTitle(ownLabel,player);const allowed=connected&&!entryActive&&!rosterActive&&player?.role==='gm';gmButton.hidden=!allowed;if(!allowed)gmPlayers=[];updateGmNameplate(ownLabel,allowed&&!player?.gm?.tagHidden?'gm':undefined);gmUI.refresh();}
const auctionUI=mountAuctionUI({send,getPlayer:()=>player,onBags:openInventory,nearby:npcId=>!!player&&connected&&!rosterActive&&!entryActive&&!worldInstance&&!player.zeppelin&&player.hp>0&&AUCTIONEERS.some(npc=>(!npcId||npc.id===npcId)&&npc.zone===player!.zone&&Math.hypot(position.x-npc.x,position.z-npc.z)<=4&&canTraverse(position,npc,colliders)),onOpen:()=>{stopForSocialUI();playerMenu.close();if(panel.open&&!floatingPanel())closePanel();}});
const receiveMountInvitation=mountRideInvitation(send,()=>Date.now()+serverOffset);
const referralUI=mountReferralUI({send,content:()=>$('panel-content'),active:()=>panel.open&&panel.dataset.mode==='referrals',show:()=>{stopForSocialUI();openPanel('Invite friends','','referrals');}});
const referralButton=document.createElement('button');referralButton.id='referrals-button';referralButton.type='button';referralButton.title='Invite friends';referralButton.setAttribute('aria-label','Invite friends');referralButton.innerHTML=icon('menu-referral')+'<small>Referrals</small>';$('friends-button').after(referralButton);referralButton.onclick=()=>{if(connected&&!rosterActive&&!entryActive)referralUI.open();};
const storeButton=document.createElement('button');storeButton.id='store-button';storeButton.type='button';storeButton.innerHTML=icon('menu-store')+'<small>Store</small>';storeButton.title='Ingame store';storeButton.setAttribute('aria-label','Open ingame store');$('settings-button').before(storeButton);
const treasureUI=mountTreasureUI({send,getPlayer:()=>player,now:()=>Date.now()+serverOffset,content:()=>$('panel-content'),active:()=>panel.open&&panel.dataset.mode==='treasure',nearby:()=>!worldInstance&&Math.hypot(position.x-SHADY_MERCHANT.x,position.z-SHADY_MERCHANT.z)<=3&&canTraverse(position,SHADY_MERCHANT,colliders),show:()=>{stopForSocialUI();openPanel('Veyl, the shady merchant','', 'treasure');showNpcPortrait(SHADY_MERCHANT.id);}});
const goldMerchantUI=mountGoldMerchantUI({send,getPlayer:()=>player,now:()=>Date.now()+serverOffset,content:()=>$('panel-content'),active:()=>panel.open&&panel.dataset.mode==='gold-merchant',nearby:()=>connected&&!entryActive&&!rosterActive&&!!player&&player.hp>0&&!worldInstance&&Math.hypot(position.x-GOLD_MERCHANT.x,position.z-GOLD_MERCHANT.z)<=3&&canTraverse(position,GOLD_MERCHANT,colliders),show:()=>{stopForSocialUI();openPanel(GOLD_MERCHANT.name,GOLD_MERCHANT.title.toUpperCase(),'gold-merchant');showNpcPortrait(GOLD_MERCHANT.id);},close:closePanel});
const treasureEffects=createTreasureEffects(scene);
const treasureMapMarker=createTreasureMapMarker(scene);
const treasureMapLabel=label('treasure-map-site','Disturbed earth','');treasureMapLabel.hidden=true;
let treasureMapLabelText='';
const storeUI=mountStoreUI({send,now:()=>Date.now()+serverOffset,getPlayer:()=>player,trigger:storeButton,allowed:()=>connected&&!entryActive&&!rosterActive&&!!player?.characterCreated,onOpen:()=>{nftUI.close();stopForSocialUI();playerMenu.close();if(panel.open&&!floatingPanel())closePanel();}});storeButton.onclick=()=>storeUI.open();
const nftButton=document.createElement('button');nftButton.id='nft-button';nftButton.type='button';nftButton.innerHTML=icon('menu-nfts')+'<small>NFTs</small>';nftButton.title='Houses and pet NFTs';nftButton.setAttribute('aria-label','Open houses and pet NFT collections');$('settings-button').before(nftButton);
const deedAuctionNearby=()=>!!player&&connected&&!rosterActive&&!entryActive&&!worldInstance&&player.hp>0&&player.zone===DEED_AUCTIONEER.zone&&Math.hypot(position.x-DEED_AUCTIONEER.x,position.z-DEED_AUCTIONEER.z)<=4&&canTraverse(position,DEED_AUCTIONEER,colliders);
const nftUI=mountNftUI({auctionNearby:deedAuctionNearby,send,now:()=>Date.now()+serverOffset,getPlayer:()=>player,trigger:nftButton,allowed:()=>connected&&!entryActive&&!rosterActive&&!!player?.characterCreated,onOpen:()=>{stopForSocialUI();playerMenu.close();if(panel.open&&!floatingPanel())closePanel();}});nftButton.onclick=()=>{storeUI.close();nftUI.open();};
specialistNftUI=mountSpecialistNftUI({send,getPlayer:()=>player,allowed:()=>connected&&!entryActive&&!rosterActive&&!!player?.characterCreated,onOpen:()=>{stopForSocialUI();storeUI.close();nftUI.close();playerMenu.close();if(panel.open)closePanel();}});
const storeBoostHud=document.createElement('button');storeBoostHud.id='store-boost-hud';storeBoostHud.type='button';storeBoostHud.hidden=true;storeBoostHud.title='Active boosts · open store';storeBoostHud.setAttribute('aria-label','Active boosts · open store');$('play-ui').append(storeBoostHud);storeBoostHud.onclick=()=>storeUI.open();let boostHudKey='';
function updateStoreBoostHud(){const html=connected&&!entryActive&&!rosterActive&&player?renderStoreBoosts(player,Date.now()+serverOffset):'';if(html===boostHudKey)return;boostHudKey=html;storeBoostHud.innerHTML=html;storeBoostHud.hidden=!html;}
const pollUI=mountPollUI({send,getPlayer:()=>player,nearby:boothId=>!!player&&connected&&!rosterActive&&!entryActive&&!worldInstance&&!player.zeppelin&&player.hp>0&&POLL_BOOTHS.some(booth=>(!boothId||booth.id===boothId)&&booth.zone===player!.zone&&Math.hypot(position.x-booth.x,position.z-booth.z)<=4&&canTraverse(position,booth,colliders)),onOpen:()=>{stopForSocialUI();cancelCasting();setAutoAttack(null);playerMenu.close();bankUI.close();auctionUI.close();if(panel.open&&!floatingPanel())closePanel();}});
const bankUI=mountBankUI({send,getPlayer:()=>player,onBags:openInventory,nearby:npcId=>!!player&&connected&&!rosterActive&&!entryActive&&!worldInstance&&!player.zeppelin&&player.hp>0&&BANKERS.some(npc=>(!npcId||npc.id===npcId)&&npc.zone===player!.zone&&Math.hypot(position.x-npc.x,position.z-npc.z)<=4&&canTraverse(position,npc,colliders)),onOpen:()=>{stopForSocialUI();playerMenu.close();if(panel.open&&!floatingPanel())closePanel();}});
const tradeUI=mountTradeUI({send,getPlayer:()=>player,onOpen:()=>{stopForSocialUI();playerMenu.close();if(panel.open&&!floatingPanel())closePanel();}});
const lootUI=mountLootUI({send,getPlayer:()=>player,optimistic:()=>lootResults,maxPending:()=>lootQueueLimit,
 onChange:()=>{loot=lootUI.visibleDrops();lastHUD='';if(player){updateHUD();syncEntities();}},
 canLoot:drop=>!!player&&connected&&!entryActive&&!rosterActive&&player.hp>0&&drop.ownerId===player.id&&(drop.instanceId??null)===worldInstance
  &&drop.expiresAt>Date.now()+serverOffset&&Math.hypot(position.x-drop.x,position.z-drop.z)<=3&&canTraverse(position,drop,colliders)&&!(!worldInstance&&waterAt(position.x,position.z)),
 onOpen:()=>{gameAudio.play('click');playerMenu.close();if(panel.open&&!floatingPanel())closePanel();}});
function stopForSocialUI(){specialistNftUI?.close();clearMovementKeys();cancelGathering();if(document.body.classList.contains('mobile-controls')){setChatExpanded(false);setMobileMenus(false);window.dispatchEvent(new CustomEvent('mobile-ui-open'));}}
function clearSocialUI(){chatTranslation.reset();clearChatBubbles();bagView.search='';bagView.activeBag='all';bagView.filter='all';selectedContractId='';trackedContractId='';trackedStoryQuestId='';adventureBoardTab='noticeboard';contractPage=0;lastContractHTML='';referralUI.reset();receiveMountInvitation(null);if(panel.open&&panel.dataset.mode==='referrals')closePanel();resetShopSales();arenaWagerMoss='0';arenaWagerUI.reset();specialistNftUI?.close();raid=null;raidInvites=[];raidHUD.reset();hearthlingPending=false;hearthlingNotice='';hearthlingLines=[];if(panel.dataset.npcId===HEARTHLING_NPC.id)closePanel();treasureMapStarting=false;treasureMapMessage='';treasureMapMarker.clear();treasureMapLabel.hidden=true;treasureEffects.clear();petFollowers.clear();combatCompanions.clear();if(panel.open&&(panel.dataset.mode==='pets'||panel.dataset.mode==='mounts'))closePanel();selectedPet=undefined;selectedCollectionMount=undefined;collectionFilters.search='';collectionFilters.collectedOnly=false;updatePlayerTitle(ownLabel);achievementsUI.reset();friendsUI.reset();duelUI.reset();arenaUI.reset();arena=null;arenaQueue=null;gmUI.reset();gmButton.hidden=true;gmPlayers=[];updateGmNameplate(ownLabel,undefined);playerMenu.close();tradeUI.update(null);auctionUI.close();storeUI.reset();nftUI.reset();treasureUI.reset();goldMerchantUI.reset();bankUI.close();pollUI.close();lootUI.reset();partyInvites=[];pendingPartyInvite=null;dungeonSummon=null;updatePartyInvitation();whisperTarget=null;if(mobileChat())setChatExpanded(false);chatPreviewMessages.splice(0,chatPreviewMessages.length,...chatPreviewMessages.filter(message=>message.channel!=='whisper'&&message.channel!=='party'));chatScroll.delete('whisper');chatScroll.delete('party');updateChatPreview();for(const channel of ['whisper','party'] as const){$(`chat-log-${channel}`).replaceChildren();chatDrafts[channel]='';$(`chat-tab-${channel}`).dataset.unread='0';}if(chatChannel==='whisper'||chatChannel==='party')$<HTMLInputElement>('chat-input').value='';selectChatChannel('world',false);if(panel.open&&panel.dataset.mode==='inspect')closePanel();}
function mobileChat(){return document.body.classList.contains('mobile-controls');}
function currentChatScale(){return mobileChat()?1:chatScale/100;}
function rememberChatScroll(desktop=false){
 if(!mobileChat()&&!desktop||$('chat').classList.contains('collapsed'))return;
 const log=$(`chat-log-${chatChannel}`),top=log.getBoundingClientRect().top;
 const anchor=[...log.children].find(child=>child.getBoundingClientRect().bottom>top) as HTMLElement|undefined;
 chatScroll.set(chatChannel,{follow:log.scrollHeight-log.scrollTop-log.clientHeight<24,top:log.scrollTop,anchor:anchor??null,offset:anchor?(anchor.getBoundingClientRect().top-top)/currentChatScale():0});
}
function restoreChatScroll(){
 const log=$(`chat-log-${chatChannel}`),saved=chatScroll.get(chatChannel);
 if(!saved||saved.follow)log.scrollTop=log.scrollHeight;
 else if(saved.anchor&&log.contains(saved.anchor))log.scrollTop+=(saved.anchor.getBoundingClientRect().top-log.getBoundingClientRect().top)/currentChatScale()-saved.offset;
 else log.scrollTop=saved.anchor?0:saved.top;
}
function updateChatPreview(){
 if(deferTouchRender($('chat-preview'),updateChatPreview))return;
 const lines=chatPreviewMessages.map(message=>{
  const line=document.createElement('span');line.className='chat-preview-line';line.dataset.previewChannel=message.channel;if(message.channel!=='system'||message.playerId)line.setAttribute('translate','no');
  const channel=document.createElement('strong');channel.textContent=({world:'World',system:'System',whisper:'Whispers',party:'Party'} as const)[message.channel];
  channel.textContent=`[${channel.textContent}] ${message.name?message.name+': ':''}`;
  line.append(channel,document.createTextNode(message.text));return line;
 });
 if(!lines.length){const empty=document.createElement('span');empty.className='chat-preview-line';empty.textContent='Say hello to the realm.';lines.push(empty);}
 $('chat-preview-messages').replaceChildren(...lines);
}
function updateChatUnread(){
 for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-chat-channel]')){const count=Number(tab.dataset.unread||0),badge=tab.querySelector<HTMLElement>('.chat-unread')!;badge.hidden=!count;badge.textContent=String(count);tab.setAttribute('aria-label',`${tab.firstChild!.textContent}${count?`, ${count} unread`:''}`);}
 $('chat-toggle').classList.toggle('has-unread',[...document.querySelectorAll<HTMLElement>('[data-chat-channel]')].some(tab=>Number(tab.dataset.unread)>0));
 const unread=[...document.querySelectorAll<HTMLElement>('[data-chat-channel]')].reduce((sum,tab)=>sum+Number(tab.dataset.unread||0),0);
 $('chat-preview-unread').hidden=!unread;$('chat-preview-unread').textContent=`${unread} new`;$('chat-preview-messages').setAttribute('aria-label',`Open chat${unread?`, ${unread} unread messages`:''}`);
}
function setChatExpanded(expanded:boolean){
 const mobile=mobileChat(),wasOpen=!$('chat').classList.contains('collapsed');if(!expanded&&wasOpen)rememberChatScroll();
 $('chat').classList.toggle('collapsed',!expanded);$('chat').classList.toggle('active',expanded);$('chat-toggle').setAttribute('aria-expanded',String(expanded));$('chat-toggle').setAttribute('aria-label',expanded?'Collapse chat':'Expand chat');$('chat-toggle').title=expanded?'Collapse chat':'Expand chat';$('chat-toggle-label').textContent=expanded?'Hide':'Show';
 document.body.classList.toggle('chat-expanded',expanded);$('chat-preview-messages').setAttribute('aria-expanded',String(expanded));
 if(expanded&&!wasOpen)clearMovementKeys();
 if(expanded){$(`chat-tab-${chatChannel}`).dataset.unread='0';updateChatUnread();if(mobile)restoreChatScroll();else if(!wasOpen)$(`chat-log-${chatChannel}`).scrollTop=$(`chat-log-${chatChannel}`).scrollHeight;}
 else if(mobile&&wasOpen){chatDrafts[chatChannel]=$<HTMLInputElement>('chat-input').value;$<HTMLInputElement>('chat-input').blur();canvas.focus({preventScroll:true});}
}
function selectChatChannel(channel:ChatChannel,expand=true){
 rememberChatScroll();
 const input=$<HTMLInputElement>('chat-input');chatDrafts[chatChannel]=input.value;chatChannel=channel;input.value=chatDrafts[channel];
 for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-chat-channel]')){const selected=tab.dataset.chatChannel===channel;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$(`chat-panel-${tab.dataset.chatChannel}`).hidden=!selected;}
 $(`chat-tab-${channel}`).dataset.unread='0';updateChatUnread();updateChatRecipient();if(expand)setChatExpanded(true);if(mobileChat())restoreChatScroll();else $(`chat-log-${channel}`).scrollTop=$(`chat-log-${channel}`).scrollHeight;
}
function updateChatRecipient(){
 const input=$<HTMLInputElement>('chat-input');$('chat-form').hidden=chatChannel==='system';input.disabled=chatChannel==='system'||chatChannel==='whisper'&&!whisperTarget;$<HTMLButtonElement>('chat-send').disabled=input.disabled;
 input.placeholder=chatChannel==='whisper'?whisperTarget?`Whisper to ${whisperTarget.name}…`:'Choose a player to whisper to…':chatChannel==='party'?'Message your party…':'Say hello, or /emotes for commands…';
 input.setAttribute('aria-label',chatChannel==='whisper'&&whisperTarget?`Whisper to ${whisperTarget.name}`:`${chatChannel} message`);
}
function openWhisper(other:{id:string;name:string}){stopForSocialUI();if(mobileChat()){friendsUI.close(false);playerMenu.close();}if(whisperTarget?.id!==other.id){chatDrafts.whisper='';if(chatChannel==='whisper')$<HTMLInputElement>('chat-input').value='';}whisperTarget={id:other.id,name:other.name};selectChatChannel('whisper');$<HTMLInputElement>('chat-input').focus();}
function fighterUnavailable(p:Player){
 if(p.hp<=1)return 'Both fighters need more than 1 HP.';
 if(p.instanceId||p.zeppelin)return 'Both fighters must be in the open world.';
 if(p.arenaMatchId||p.duelOpponentId)return 'Finish the current match first.';
 if(p.gm?.invisible||p.gm?.flying)return 'Turn off GM flight and invisibility to fight.';
 if(p.pvp||isInColosseum(p))return 'Leave the lethal sand ring to challenge.';
 if(waterAt(p.x,p.z))return 'Both fighters must be on dry land.';
 return '';
}
function challengeUnavailable(){
 return !connected||entryActive||rosterActive||!player?'Enter the world to challenge.':duelUI.busy()||arenaUI.busy()?'Finish or cancel the current challenge first.':'';
}
function duelChallengeReason(other:Player){
 const unavailable=challengeUnavailable()||fighterUnavailable(player!)||fighterUnavailable(other);if(unavailable)return unavailable;
 if(player!.id===other.id)return 'Choose another player.';
 if(Math.hypot(player!.x-other.x,player!.z-other.z)>8)return 'Move within 8 metres to duel.';
 return canTraverse(player!,other,colliders,WORLD_BOUNDS)?'':'Move where you can see each other.';
}
function arenaEntryReason(p:Player){
 return fighterUnavailable(p)||(p.casting||p.jump?.grounded===false?'Stand still and finish casting.':'');
}
function arenaChallengeReason(other:Player,size:1|2|3){
 const unavailable=challengeUnavailable()||arenaEntryReason(player!)||arenaEntryReason(other);if(unavailable)return unavailable;
 if(player!.id===other.id)return 'Choose another player.';
 if(size>1&&(!party||party.leaderId!==player!.id||party.members.length!==size))return `Lead a party of ${size} to challenge ${size}v${size}.`;
 if(size>1&&party!.members.some(member=>member.id===other.id))return 'Challenge the other party leader.';
 if(size>1&&party!.members.some(member=>member.hp<=1||member.instanceId||players.some(p=>p.id===member.id&&arenaEntryReason(p))))return 'Every teammate must be ready in the open world.';
 return '';
}
function arenaQueueReason(size:1|2|3=1){
 const unavailable=challengeUnavailable();if(unavailable)return unavailable;
 if(player!.hp<=1)return 'You need more than 1 HP to queue.';
 if(player!.arenaMatchId||player!.duelOpponentId)return 'Finish the current match first.';
 if(player!.gm?.invisible||player!.gm?.flying)return 'Turn off GM flight and invisibility to queue.';
 if(size===1)return party?'Leave your party to find a solo 1v1 match.':'';
 if(!party||party.members.length!==size)return `Form a party of exactly ${size} for ${size}v${size}.`;
 if(party.leaderId!==player!.id)return 'Your party leader starts the team search.';
 return party.members.some(member=>member.hp<=1)?'Every teammate needs more than 1 HP.':'';
}
function openPlayerMenu(other:Player,x:number,y:number){if(modalOpen()||!connected||other.id===playerId)return;selectedId=other.id;hoveredId=null;stopForSocialUI();playerMenu.open(other,x,y);}
function playerAction(action:PlayerAction,id:string,wagerMoss='0'){
 const other=players.find(other=>other.id===id);if(!other||!connected){toast('That player is no longer nearby.');return;}
 if(action==='inspect'){inspectedPlayerId=id;inspectionKey='';openPanel(other.name,'INSPECT PLAYER','inspect');renderInspectPanel();}
 else if(action==='ride'){send({type:'mountInvite',playerId:id});}
 else if(action==='report'){communityUI?.report(id,other.name);}
 else if(action==='invite'){if(allowFeature('party'))send({type:'partyInvite',targetId:id});}
 else if(action==='friend'||action==='ignore')friendsUI.addPlayer(id,action==='ignore');
 else if(action==='duel'){const reason=duelChallengeReason(other);if(reason)toast(reason);else send({type:'duelRequest',targetId:id});}
 else if(action==='arena1'||action==='arena2'||action==='arena3'){
  const size=action==='arena3'?3:action==='arena2'?2:1,stake=size===1&&!isNativeApp()?arenaWagerAmount(wagerMoss):0n;
  const reason=arenaChallengeReason(other,size)||(stake===null?'Enter a valid MOSS stake with up to 18 decimal places.':'');
  if(reason)toast(reason);else if(stake&&!arenaWagerUI.walletReady())arenaWagerUI.connect();else send({type:'arenaRequest',targetId:id,size,...(stake?{wagerMoss}:{})});
 }
 else if(action==='trade'){if(allowFeature('gear'))send({type:'tradeRequest',targetId:id});}
 else if(action==='gm'){if(player?.role==='gm')gmUI.open(id);}
 else openWhisper(other);
}
function renderInspectPanel(){
 if(!panel.open||panel.dataset.mode!=='inspect')return;
 const other=players.find(other=>other.id===inspectedPlayerId);if(!other){closePanel();toast('That player is no longer nearby.');return;}
 const next=JSON.stringify([other.id,other.name,other.title,other.betaTester,other.level,other.hp,other.maxHp,other.appearance,other.equipment,other.talents]);if(next===inspectionKey)return;inspectionKey=next;
 $('panel-title').textContent=other.name;$('panel-eyebrow').textContent=`INSPECT · LEVEL ${other.level} ${other.appearance.className.toUpperCase()}`;
 replacePanelContent(renderGear(other,'',true));const stage=document.querySelector<HTMLElement>('.paper-doll-stage');
 if(stage){try{if(characterView)characterView.update(other);else characterView=mountCharacterView(stage,other);}catch{stage.textContent='Character preview unavailable.';}}
}
function pickPlayer(x:number,y:number){
 const point=pickTarget(x,y);return point?.kind==='player'?players.find(player=>player.id===point.id):undefined;
}
$('labels').addEventListener('contextmenu',event=>{const plate=(event.target as HTMLElement).closest<HTMLElement>('[data-player-id]');if(!plate)return;event.preventDefault();const other=players.find(p=>p.id===plate.dataset.playerId);if(other){if(isHostilePlayer(player,other))setAutoAttack(other.id);else openPlayerMenu(other,event.clientX,event.clientY);}});
$('labels').addEventListener('click',event=>{const plate=(event.target as HTMLElement).closest<HTMLElement>('[data-player-id]');if(!plate)return;const other=players.find(p=>p.id===plate.dataset.playerId);if(other){selectedId=other.id;hoveredId=null;playerMenu.close();canvas.focus();}});
$('labels').addEventListener('keydown',event=>{const plate=(event.target as HTMLElement).closest<HTMLElement>('[data-player-id]');if(!plate||!['Enter',' ','ContextMenu','F10'].includes(event.key)||event.key==='F10'&&!event.shiftKey)return;event.preventDefault();event.stopPropagation();const other=players.find(p=>p.id===plate.dataset.playerId),bounds=plate.getBoundingClientRect();if(other){if(isHostilePlayer(player,other))setAutoAttack(other.id);else openPlayerMenu(other,bounds.left,bounds.bottom);}});
let shopNpcId:string|undefined;
function nearbyMerchant(npcId:string|undefined){
 const resident=VILLAGE_NPCS.find(n=>n.id===npcId);
 return player&&player.hp>0&&resident?.role==='merchant'&&!worldInstance&&worldZone===resident.zone&&!waterAt(position.x,position.z)&&Math.hypot(resident.x-position.x,resident.z-position.z)<=3&&canTraverse(position,resident,colliders)?resident:undefined;
}
let shopSelected='',shopTab:'buy'|'sell'='buy',shopFilter='all',shopPage=0,shopQuantity:'1'|'all'='1',lastShopHTML='';
type ShopSale=Extract<ClientMessage,{type:'sellGear'|'sellBag'|'sellItem'|'sellResource'}>;
const shopSales:{message:ShopSale;id:string;sent:boolean;confirmed:boolean}[]=[];
function shopSaleId(message:ShopSale){
 return message.type==='sellGear'?`gear:${message.itemId}`:message.type==='sellBag'?`bag:${message.bagId}`:message.type==='sellItem'?`item:${message.itemId}`:`resource:${message.resource}`;
}
function refreshShopSales(){lastShopHTML='';if(player&&panel.open&&panel.dataset.mode==='shop')renderShopPanel();}
function resetShopSales(){shopSales.length=0;refreshShopSales();}
function cancelQueuedShopSales(){shopSales.splice(shopSales[0]?.sent?1:0);}
function sendNextShopSale(){
 const sale=shopSales[0];if(!sale||sale.sent)return;
 const message=sale.message;
 const owned=player&&(message.type==='sellGear'?player.ownedGear.includes(message.itemId)&&!Object.values(player.equipment).includes(message.itemId)
  :message.type==='sellBag'?player.ownedBags?.some(bag=>bag.id===message.bagId)&&!player.equippedBags?.includes(message.bagId)
  :Number.isSafeInteger(message.quantity)&&message.quantity>0&&(message.type==='sellItem'?(player.carriedItems?.[message.itemId]||0):player.inventory[message.resource])>=message.quantity);
 if(!connected||!panel.open||panel.dataset.mode!=='shop'||!nearbyMerchant(message.npcId)||!owned){resetShopSales();toast('Remaining sales cancelled. Check your items and return to the merchant.');return;}
 sale.sent=true;
 send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
 if(send(message)===false)resetShopSales();
}
function queueShopSale(message:ShopSale){
 const protectedId=message.type==='sellBag'?`bag:${message.bagId}`:message.type==='sellItem'?`item:${message.itemId}`:message.type==='sellResource'?message.resource:message.itemId;
 if(player&&itemLocked(player,protectedId)){toast('This item is locked. Unlock it in your bags first.');return;}
 if(!merchantSales){send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();send(message);return;}
 const id=shopSaleId(message);
 if(shopSales.length>=16||shopSales.some(sale=>sale.id===id))return;
 shopSales.push({message,id,sent:false,confirmed:false});sendNextShopSale();refreshShopSales();
}
function shopSaleEvent(message:Extract<ServerMessage,{type:'event'}>){
 const sale=shopSales[0];if(!sale?.sent)return;
 // The sale reward precedes its authoritative snapshot; inventory counts alone can include concurrent loot.
 if(message.requestType!==sale.message.type)return;
 if(message.kind==='reward')sale.confirmed=true;
 else if(message.kind==='info'){
  resetShopSales();if(message.text.startsWith('Saving your changes'))toast('Sale cancelled while earlier changes are saving. Please try again.');
 }
}
function updateShopSales(){
 if(!shopSales[0]?.confirmed)return;
 shopSales.shift();sendNextShopSale();refreshShopSales();
}
function openShop(npcId:string){
 if(!allowFeature('gear'))return;
 const resident=nearbyMerchant(npcId);if(!resident)return;
 if(shopNpcId!==npcId||panel.dataset.mode!=='shop'||!panel.open){shopSelected='';shopTab='buy';shopFilter='all';shopPage=0;shopQuantity='1';}
 shopNpcId=resident.id;lastShopHTML='';openPanel(resident.name,(CITY_VENDORS.find(n=>n.id===npcId)?.title||'Merchant').toUpperCase(),'shop');renderShopPanel();showNpcPortrait(npcId);
}
function renderShopPanel(){
 if(!player)return;const resident=nearbyMerchant(shopNpcId);if(!resident){closePanel();return;}
 const html=renderShop(player,resident.id,{selected:shopSelected,tab:shopTab,filter:shopFilter,page:shopPage,quantity:shopQuantity,pendingSales:shopSales.map(sale=>sale.id)});
 if(html===lastShopHTML)return;lastShopHTML=html;
 const focused=document.activeElement?.id;
 replacePanelContent(html);
 const content=$('panel-content');
 shopSelected=content.querySelector<HTMLElement>('[data-shop-select][aria-pressed="true"]')?.dataset.shopSelect||'';
 shopPage=Number(content.querySelector<HTMLElement>('[data-shop-page-current]')?.dataset.shopPageCurrent||0);
 if(focused==='shop-filter'||focused==='shop-quantity'||focused==='shop-sale-ack')document.getElementById(focused)?.focus({preventScroll:true});
}
function replacePanelContent(html:string){
 const content=$('panel-content'),active=document.activeElement,buttons=[...content.querySelectorAll('button')],index=buttons.indexOf(active as HTMLButtonElement),scroll=panel.scrollTop,contentScroll=content.scrollTop;
 const restoreRollDetails=preserveItemRollDetails(content);
 const raidDetails=[...content.querySelectorAll<HTMLDetailsElement>('.raid-guide,.raid-invite-list,.campaign-journal,.chapter-history')];
 const more=content.querySelector<HTMLDetailsElement>('[data-item-more]'),bagScroll=content.querySelector('.bag-windows')?.scrollTop;
 const bagTabsScroll=content.querySelector('.bag-tabs')?.scrollLeft;
 const journalScroll=content.querySelector('.story-journal-list')?.scrollTop;
 const focusedStoryDetail=active instanceof HTMLElement&&active.hasAttribute('data-story-detail');
 const focusedBagSearch=active instanceof HTMLInputElement&&active.hasAttribute('data-bag-search')?{start:active.selectionStart,end:active.selectionEnd}:null;
 const focusedNpcRow=active instanceof HTMLElement?['data-training-select','data-shop-select'].find(attribute=>active.hasAttribute(attribute)):undefined;
 const focusedNpcId=focusedNpcRow?(active as HTMLElement).getAttribute(focusedNpcRow):null;
 const focusedBagSort=active instanceof HTMLSelectElement&&active.hasAttribute('data-bag-sort');
 const lockFocus=active instanceof HTMLElement?active.dataset.itemLock:undefined;
 const itemClose=content.querySelector<HTMLButtonElement>('[data-close-item]'),detailScroll=content.querySelector('#bag-item-details')?.scrollTop;
 const retainedAttributes=['data-storage-slot','data-gear-slot','data-select-bag','data-bag-layout','data-bag-filter','data-bag-sort','data-bag-contents','data-training-filter','data-toggle-bag','data-close-container','data-close-bag','data-open-character','data-raid-invite','data-raid-select','data-raid-action','data-raid-kick','data-raid-co-leader','data-raid-tab'];
 const cells=[...content.querySelectorAll<HTMLElement>(retainedAttributes.map(attribute=>`[${attribute}]`).join(','))];
 const stage=characterView?content.querySelector('.paper-doll-stage'):null;
 const bagStage=bagPreview?content.querySelector<HTMLElement>('.bag-model-preview'):null;
 const focusedCanvas=active instanceof HTMLCanvasElement&&(stage?.contains(active)||bagStage?.contains(active))?active:null;
 const focusedItem=active instanceof HTMLButtonElement?active.dataset.inspectItem||active.dataset.equipGear||active.dataset.buyGear||active.dataset.sellGear||active.dataset.buyBag||active.dataset.sellBag||('usePotion' in active.dataset?'potion':undefined):undefined;
 const focusedBagAction=active instanceof HTMLButtonElement&&('equipBag' in active.dataset||'unequipBag' in active.dataset);
 clearGearDrag();
 const focusedTalent=active instanceof HTMLElement?active.closest('.talent-node')?.querySelector<HTMLButtonElement>('[data-learn-talent]')?.dataset.learnTalent:undefined;
 content.innerHTML=html;
 localization.translate(content);
 const nextClose=content.querySelector('[data-close-item]');if(itemClose&&nextClose)nextClose.replaceWith(itemClose);
 // Preserve item and bag controls through HUD updates, including a touch held across a refresh.
 for(const cell of cells){
  const attribute=retainedAttributes.find(attribute=>cell.hasAttribute(attribute))!;
  const next=content.querySelector(`[${attribute}="${CSS.escape(cell.getAttribute(attribute)!)}"]`);
  // Hover accessibility is transient; it must not break stable double-click targets.
  let comparison=cell;
  if(cell.getAttribute('aria-describedby')?.split(/\s+/).includes('item-hover-tooltip')){
   comparison=cell.cloneNode(true) as HTMLElement;
   const ids=comparison.getAttribute('aria-describedby')!.split(/\s+/).filter(id=>id!=='item-hover-tooltip').join(' ');
   if(ids)comparison.setAttribute('aria-describedby',ids);else comparison.removeAttribute('aria-describedby');
  }
  if(next&&comparison.isEqualNode(next))next.replaceWith(cell);
 }
 for(const detail of raidDetails){
  const next=content.querySelector<HTMLDetailsElement>('.'+['raid-guide','raid-invite-list','campaign-journal','chapter-history'].find(name=>detail.classList.contains(name)));
  if(!next)continue;next.open=detail.open;
  const summary=detail.querySelector('summary'),nextSummary=next.querySelector('summary');
  if(summary&&nextSummary&&summary.isEqualNode(nextSummary))nextSummary.replaceWith(summary);
 }
 const nextMore=content.querySelector<HTMLDetailsElement>('[data-item-more]');
 if(more&&nextMore&&nextMore.dataset.itemMore===more.dataset.itemMore){
  const summary=more.querySelector('summary')!;
  if(more.innerHTML!==nextMore.innerHTML){more.replaceChildren(...nextMore.childNodes);more.querySelector('summary')!.replaceWith(summary);}
  nextMore.replaceWith(more);if(active===summary)summary.focus({preventScroll:true});
 }
 const nextBagStage=content.querySelector<HTMLElement>('.bag-model-preview');
 if(bagStage&&nextBagStage&&nextBagStage.dataset.bagModel===bagStage.dataset.bagModel)nextBagStage.replaceWith(bagStage);else disposeBagPreview();
 showBagPreview();
 if(stage)content.querySelector('.paper-doll-stage')?.replaceWith(stage);
 if(lockFocus)content.querySelector<HTMLElement>('[data-item-lock]')?.focus({preventScroll:true});
 else if(active===itemClose&&itemClose?.isConnected)itemClose.focus({preventScroll:true});
 else if(focusedBagSearch){const search=content.querySelector<HTMLInputElement>('[data-bag-search]');search?.focus({preventScroll:true});search?.setSelectionRange(focusedBagSearch.start,focusedBagSearch.end);}
 else if(focusedStoryDetail)content.querySelector<HTMLElement>('[data-story-detail]')?.focus({preventScroll:true});
 else if(focusedNpcRow&&focusedNpcId)content.querySelector<HTMLElement>(`[${focusedNpcRow}="${CSS.escape(focusedNpcId)}"]`)?.focus({preventScroll:true});
 else if(focusedBagSort)content.querySelector<HTMLSelectElement>('[data-bag-sort]')?.focus({preventScroll:true});
 else if(focusedCanvas?.isConnected)focusedCanvas.focus({preventScroll:true});
 else if(focusedBagAction){const heading=content.querySelector<HTMLElement>('#bag-item-details h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
 else if(focusedItem){
  const next=content.querySelector<HTMLButtonElement>(`[data-inspect-item="${focusedItem}"], [data-equip-gear="${focusedItem}"], [data-buy-gear="${focusedItem}"], [data-sell-gear="${focusedItem}"], [data-buy-bag="${focusedItem}"], [data-sell-bag="${focusedItem}"]`);
  if(next&&!next.disabled)next.focus({preventScroll:true});
  else {const heading=$('panel-title');heading.tabIndex=0;heading.focus({preventScroll:true});}
 }
 else if(focusedTalent){const next=content.querySelector<HTMLButtonElement>(`[data-learn-talent="${focusedTalent}"]`);(next?.disabled?next.closest<HTMLElement>('.talent-node'):next)?.focus({preventScroll:true});}
 else if(active instanceof HTMLElement&&content.contains(active))active.focus({preventScroll:true});
 else if(index>=0){const next=content.querySelectorAll('button')[index];if(next&&!next.disabled)next.focus({preventScroll:true});else {$('panel-title').tabIndex=-1;$('panel-title').focus({preventScroll:true});}}
 restoreRollDetails();
 panel.scrollTop=scroll;content.scrollTop=contentScroll;
 const details=content.querySelector('#bag-item-details');if(details&&detailScroll!==undefined)details.scrollTop=detailScroll;
 const bags=content.querySelector('.bag-windows');if(bags&&bagScroll!==undefined)bags.scrollTop=bagScroll;
 const journalList=content.querySelector('.story-journal-list');if(journalList&&journalScroll!==undefined)journalList.scrollTop=journalScroll;
 const bagTabs=content.querySelector('.bag-tabs');if(bagTabs&&bagTabsScroll!==undefined)bagTabs.scrollLeft=bagTabsScroll;
 itemMenu.update();
}
$('panel-content').addEventListener('input',event=>{
 const input=event.target;
 if(input instanceof HTMLInputElement&&input.hasAttribute('data-collection-search')&&['pets','mounts'].includes(panel.dataset.mode??'')){collectionFilters.search=input.value.slice(0,100);panel.dataset.mode==='pets'?renderPets():renderMounts();return;}
 if(input instanceof HTMLInputElement&&input.hasAttribute('data-bag-search')){bagView.search=input.value.slice(0,100);renderGearPanel();return;}
 if(panel.dataset.mode==='arena'&&input instanceof HTMLInputElement&&input.id==='arena-wager-moss'){arenaWagerMoss=input.value;renderArenaPanel();}
});
$('panel-content').addEventListener('change',event=>{
 const select=event.target;
 if(select instanceof HTMLInputElement&&select.hasAttribute('data-collection-collected')&&['pets','mounts'].includes(panel.dataset.mode??'')){collectionFilters.collectedOnly=select.checked;panel.dataset.mode==='pets'?renderPets():renderMounts();return;}
 if(select instanceof HTMLSelectElement&&select.hasAttribute('data-bag-sort')&&['slots','type','name','quantity'].includes(select.value)){
  bagView.sort=select.value as BagViewOptions['sort'];renderGearPanel();
  $('panel-content').querySelector<HTMLSelectElement>('[data-bag-sort]')?.focus({preventScroll:true});return;
 }
 if(panel.dataset.mode==='pets'&&select instanceof HTMLSelectElement&&select.id==='pet-loot-quality'){
  const quality=PET_LOOT_QUALITIES.find(quality=>quality===select.value);
  select.value=player?.petLootMinQuality??'uncommon';
  if(connected&&player?.characterCreated&&quality)send({type:'petLootQuality',quality});
  return;
 }
 if(panel.dataset.mode==='shop'&&select instanceof HTMLSelectElement){
  if(select.id==='shop-filter'){shopFilter=select.value;shopPage=0;shopSelected='';}
  else if(select.id==='shop-quantity'&&(select.value==='1'||select.value==='all'))shopQuantity=select.value;
  else return;
  renderShopPanel();return;
 }

});
$('panel-content').addEventListener('click',event=>{
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled||!player?.characterCreated)return;
 const data=button.dataset;
 if(panel.dataset.mode==='instant-combat'&&data.instantCombat){
  if(!connected||!instantCombat)return;
  if(data.instantCombat==='register'&&instantCombat.registrationOpen&&!instantCombat.registered&&!instantCombat.run)send({type:'instantCombatRegister'});
  else if(data.instantCombat==='unregister'&&instantCombat.registered)send({type:'instantCombatUnregister'});
  else if(data.instantCombat==='leave'&&instantCombat.run)send({type:'instantCombatLeave'});
  else return;
  lastInstantCombatPanel='';button.disabled=true;return;
 }
 if(data.raidSelect){if(players.some(other=>other.id===data.raidSelect)){selectedId=data.raidSelect;closePanel();}return;}
 if(data.raidTab==='encounter'||data.raidTab==='collection'){raidTab=data.raidTab;lastRaidPanel='';renderRaidMenu();return;}
 if('specialistNftOpen' in data){if(!isNativeApp())specialistNftUI?.open();return;}
 if('raidStore' in data){closePanel();storeUI.open();return;}
 const raidMessage=raidAction(data,raid,player.id)||raidProgressionAction(data);if(raidMessage){if(raidMessage.type==='raidSpUpgrade'){const id=crypto.randomUUID();if(!startUpgradeEffect(player.appearance.className,id))return;raidMessage.upgradeEffectId=id;}send(raidMessage);button.disabled=true;return;}
 if('openHearthling' in data){openHearthling();return;}
 if('findHearthling' in data){findHearthling();return;}
 if('closeHearthling' in data){closePanel();return;}
 if('openTitles' in data){closePanel();achievementsUI.open();document.getElementById('achievement-title')?.focus();return;}
 if(data.hearthlingAction==='pay'){
  if(hearthlingPending||!nearHearthling()||player.meadGodPaid||player.gold<MEADGOD_QUEST_COST)return;
  hearthlingPending=true;hearthlingNotice='';
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  send({type:'meadGodQuest'});renderHearthlingPanel();return;
 }
 if(data.collectionTab==='pets'||data.collectionTab==='mounts'){openCollection(data.collectionTab);return;}
 if(data.collectionSelect){
  if(panel.dataset.mode==='pets'&&isPetId(data.collectionSelect)){selectedPet=data.collectionSelect;renderPets();}
  else if(panel.dataset.mode==='mounts'&&MOUNTS.some(m=>m.id===data.collectionSelect)){selectedCollectionMount=data.collectionSelect as MountId;renderMounts();}
  return;
 }
 if(data.collectionRotate){collectionPreview?.rotate(Number(data.collectionRotate)*Math.PI/8);return;}
 if(data.preferMount&&MOUNTS.some(m=>m.id===data.preferMount)&&availableMounts(player).includes(data.preferMount as MountId)){
  preferredMount=data.preferMount as MountId;saveLocal('mossvale-mount',preferredMount);renderMounts();return;
 }
 if(data.rideMount!==undefined){
  if(data.rideMount&&!MOUNTS.some(m=>m.id===data.rideMount))return;
  const mount=data.rideMount as MountId;
  if(!connected||player.hp<=0||player.zeppelin)return;
  if(!player.travel?.mount){
   if(!availableMounts(player).includes(mount)||!mountSpeed(player.level,player.ridingRank)||worldInstance)return;
   preferredMount=mount;saveLocal('mossvale-mount',preferredMount);
  }
  toggleMount(mount||preferredMount);renderMounts();return;
 }
 if('startTreasureMap' in data){startTreasureMap();return;}
 if('openTreasureMap' in data){openTreasureMap();return;}
 if('trackTreasureMap' in data){trackTreasureMap();return;}
 if(data.itemLock){if(connected)send({type:'setItemLock',itemId:data.itemLock,locked:data.lockValue==='true'});return;}
 if('closeItem' in data){
  const selected=selectedBagItem;selectBagItem('');
  const item=[...$('panel-content').querySelectorAll<HTMLButtonElement>('[data-inspect-item]')].find(item=>item.dataset.inspectItem===selected);
  if(item)item.focus({preventScroll:true});
  else {const heading=$('panel-title');heading.tabIndex=-1;heading.focus({preventScroll:true});}
  return;
 }
 if(panel.dataset.mode==='arena'){
  if('arenaWagers' in data){arenaWagerUI.open();return;}
  if(data.arenaQueue){
   const size=data.arenaSize==='3'?3:data.arenaSize==='2'?2:1,reason=data.arenaQueue==='join'?arenaQueueReason(size):'';
   if(reason)toast(reason);else {send(data.arenaQueue==='join'?{type:'arenaQueueJoin',size}:{type:'arenaQueueLeave'});lastArenaMenu='';button.disabled=true;}return;
  }
  if(data.arenaChallenge||data.arenaDuel){playerAction(data.arenaDuel?'duel':data.arenaSize==='3'?'arena3':data.arenaSize==='2'?'arena2':'arena1',data.arenaDuel||data.arenaChallenge!,data.arenaChallenge&&data.arenaSize==='1'?arenaWagerMoss:'0');return;}
 }
 if(panel.dataset.mode==='shop'){
  if(data.shopSelect){shopSelected=data.shopSelect;shopQuantity='1';renderShopPanel();return;}
  if(data.shopTab==='buy'||data.shopTab==='sell'){shopTab=data.shopTab;shopFilter='all';shopSelected='';shopPage=0;shopQuantity='1';renderShopPanel();return;}
  if(data.shopPage!==undefined){const page=Number(data.shopPage);if(Number.isSafeInteger(page)&&page>=0){shopPage=page;shopSelected='';renderShopPanel();}return;}
  if(data.buyGear||data.equipGear||data.sellGear||data.buyBag||data.sellBag||data.sellItem||data.sellResource||data.npcService){
   if(!connected||!nearbyMerchant(shopNpcId))return;
   const sale=!!(data.sellGear||data.sellBag||data.sellItem||data.sellResource);
   if(shopSales.length&&(!sale||shopSales.length>=16))return;
   if('sellWarning' in data){
    const acknowledgement=$('panel-content').querySelector<HTMLInputElement>('#shop-sale-ack');
    if(!acknowledgement?.checked){acknowledgement?.focus();toast('Confirm the sale warning before selling this item.');return;}
    acknowledgement.checked=false;
   }
   if(!sale&&!data.npcService){send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();}
  }
 }
 if(panel.dataset.mode==='training'&&data.trainingFilter&&['all','available','unavailable','learned'].includes(data.trainingFilter)){trainingFilter=data.trainingFilter as TrainingFilter;trainingSelected='';renderTrainingPanel();$('panel-content').querySelector<HTMLButtonElement>(`[data-training-filter="${trainingFilter}"]`)?.focus({preventScroll:true});return;}
 if(data.trainingSelect&&panel.dataset.mode==='training'){trainingSelected=data.trainingSelect;renderTrainingPanel();return;}
 if(data.itemUpgradeMode){selectBagItem(selectedBagItem,data.itemUpgradeMode==='upgrade');const heading=$('bag-item-details').querySelector('h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}return;}
 if(data.inspectItem){selectBagItem(data.inspectItem);return;}
 if(data.bagLayout==='grid'||data.bagLayout==='list'){inventoryLayout=data.bagLayout;renderGearPanel();const bags=$('panel-content').querySelector('.bag-windows');if(bags)bags.scrollTop=0;return;}
 if(data.bagContents==='grid'||data.bagContents==='list'){bagView.contents=data.bagContents;renderGearPanel();return;}
 if(data.selectBag){bagView.activeBag=data.selectBag;closedBagIds.delete(data.selectBag);renderGearPanel();const bags=$('panel-content').querySelector('.bag-windows');if(bags)bags.scrollTop=0;return;}
 if(data.bagFilter&&['all','equipment','materials','consumables','quest','misc'].includes(data.bagFilter)){bagView.filter=data.bagFilter as BagViewOptions['filter'];renderGearPanel();const bags=$('panel-content').querySelector('.bag-windows');if(bags)bags.scrollTop=0;return;}
 if(data.toggleBag||data.closeContainer){const id=data.toggleBag||data.closeContainer!;if(data.closeContainer||!closedBagIds.has(id))closedBagIds.add(id);else closedBagIds.delete(id);if(panel.dataset.mode==='gear')renderGearPanel();else renderInventory();return;}
 if(data.equipBag){send({type:'equipBag',bagId:data.equipBag,slot:Number(data.equipBagSlot)});return;}
 if(data.unequipBag!==undefined){send({type:'unequipBag',slot:Number(data.unequipBag)});return;}
 if('findShadyMerchant' in data){closePanel();setWaypoint({...SHADY_MERCHANT,label:'Veyl · Shady merchant'});return;}
 if('openNfts' in data||data.claimNftPet||data.claimNftMount){if(connected){closePanel();storeUI.close();if(data.claimNftPet&&isPetId(data.claimNftPet))nftUI.open(data.claimNftPet);else if(data.claimNftMount&&MOUNTS.some(mount=>mount.id===data.claimNftMount))nftUI.openMount(data.claimNftMount as MountId);else if(!nftUI.isOpen())nftUI.open();}return;}
 if(data.combatCompanion==='dismiss'||data.combatCompanion==='recall'){if(connected)send({type:'combatCompanion',action:data.combatCompanion});return;}
 if(data.learnMount&&MOUNTS.some(mount=>mount.id===data.learnMount)){if(connected)send({type:'learnMount',mount:data.learnMount as MountId});return;}
 if(data.learnPet&&isPetId(data.learnPet)){if(connected)send({type:'learnPet',pet:data.learnPet});return;}
 if(data.summonPet!==undefined&&(data.summonPet===''||isPetId(data.summonPet))){if(connected)send({type:'summonPet',pet:data.summonPet||null});return;}
 if(data.useItem&&lootItemValid(data.useItem)){send({type:'useItem',itemId:data.useItem});return;}
 if(data.sellItem&&lootItemValid(data.sellItem)){
  const merchant=panel.dataset.mode==='shop'&&nearbyMerchant(shopNpcId);if(!merchant)return;
  const quantity=data.sellItemQuantity==='all'?player.carriedItems?.[data.sellItem]||0:Number(data.sellItemQuantity||1);
  queueShopSale({type:'sellItem',npcId:merchant.id,itemId:data.sellItem,quantity});return;
 }
 if(data.buyBag||data.sellBag){const merchant=panel.dataset.mode==='shop'&&nearbyMerchant(shopNpcId);if(!merchant)return;if(data.buyBag&&bagKindValid(data.buyBag))send({type:'buyBag',npcId:merchant.id,itemId:data.buyBag});else if(data.sellBag)queueShopSale({type:'sellBag',npcId:merchant.id,bagId:data.sellBag});return;}
 if('openCharacter' in data){openCharacter();return;}
 if('closeBag' in data){closePanel();return;}
 if('usePotion' in data){send({type:'heal'});return;}
 if(data.findTrainer){findTrainer(data.findTrainer);return;}
 if('openSpellbook' in data){openSpells();return;}
 if('openMounts' in data){openMounts();return;}
 if(data.learnSpell||data.learnRiding||data.buyMount){
  const trainer=panel.dataset.mode==='training'&&nearbyTrainer();if(!trainer||trainingPending||!connected)return;
  trainingPending=data.learnSpell||(data.learnRiding?`riding-${data.learnRiding}`:`mount-${data.buyMount}`);
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  if(data.learnSpell)send({type:'learnSpell',npcId:trainer.id,ability:data.learnSpell as AbilityId});
  else if(data.learnRiding)send({type:'learnRiding',npcId:trainer.id,rank:Number(data.learnRiding) as 1|2});
  else send({type:'buyMount',npcId:trainer.id,mount:data.buyMount as MountId});
  renderTrainingPanel();return;
 }
 if(data.npcService&&data.npcId){requestVillageService(data.npcId,data.npcService as Extract<ClientMessage,{type:'npcService'}>['service']);if(data.npcService==='heal')closePanel();return;}
 if(data.acceptContract||data.claimContract||data.craft||'dungeonEnter' in data||'dungeonExit' in data){send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();}
 if(data.adventureQuest){if(data.adventureQuest==='treasure'||data.adventureQuest==='hearthling'){selectedAdventure=data.adventureQuest;renderContractPanel();document.getElementById('adventure-detail')?.focus({preventScroll:true});}return;}
 if(data.adventureTab){if(data.adventureTab==='active'||data.adventureTab==='noticeboard'||data.adventureTab==='completed'){adventureBoardTab=data.adventureTab;selectedContractId='';contractPage=0;renderContractPanel();}return;}
 if(data.openContract){if(CONTRACTS.some(contract=>contract.id===data.openContract)){selectedContractId=data.openContract;renderContractPanel();panel.scrollTop=0;document.getElementById('contract-detail-title')?.focus({preventScroll:true});}return;}
 if('contractBack' in data){const id=selectedContractId;selectedContractId='';renderContractPanel();document.getElementById(`notice-${id}`)?.focus({preventScroll:true});return;}
 if('contractClose' in data){closePanel();return;}
 if(data.trackContract){trackContract(data.trackContract);return;}
 if('contractPage' in data){const page=Number(data.contractPage);if(Number.isInteger(page)&&page>=0){contractPage=page;renderContractPanel();$('panel-content').querySelector<HTMLElement>('.quest-notice h3')?.focus({preventScroll:true});}return;}
 if(data.questSection){data.questSection==='story'?openJournal():openContracts();return;}
 if(data.acceptContract){send({type:'acceptContract',contractId:data.acceptContract});return;}
 if(data.claimContract){send({type:'claimContract',contractId:data.claimContract});return;}
 if(data.cancelContract){if(connected)send({type:'cancelContract',contractId:data.cancelContract});return;}
 if(data.findBoard){findStation('board',data.findBoard as ZoneId);return;}
 if('findWorkshop' in data){findStation('workshop');return;}
 if('openCrafting' in data){openCrafting();return;}
 if('openProfessions' in data){openProfessions();return;}
 if(data.findMaterial){const skill=({wood:'woodcutting',crystal:'mining',herb:'herbalism'} as Record<string,SkillId>)[data.findMaterial];if(skill)findGatheringResource(skill);return;}
 if(data.craft){send({type:'craft',recipeId:data.craft});return;}
 if('openParty' in data){openParty();return;}
 if('openDungeon' in data){openDungeon();return;}
 if('openMap' in data){openMap();return;}
 if(data.dungeonBoardSize){const size=Number(data.dungeonBoardSize);if(Number.isInteger(size)&&size>=1&&size<=4&&size!==dungeonBoard?.partySize)loadDungeonLeaderboard(size);return;}
 if('dungeonBoardRefresh' in data){if(!dungeonBoard?.loading)loadDungeonLeaderboard();return;}
 if('dungeonClaim' in data||data.dungeonReward){
  const result=dungeon?.result;if(!result||result.claimed||!connected)return;
  const remaining=result.items.filter(item=>!result.remainingItemIds||result.remainingItemIds.includes(item.id));
  const item=data.dungeonReward?remaining.find(item=>item.id===data.dungeonReward):undefined;
  if(data.dungeonReward?!item||lootEntryBlockReason(player,item):lootAllBlockReason(player,remaining))return;
  send({type:'loot',targetId:result.lootId,...(item?{itemId:item.id}:{})});return;
 }
 if(data.chooseDungeon){const entry=DUNGEONS.find(entry=>entry.id===data.chooseDungeon);if(entry)openDungeon(entry.id);return;}
 if(data.findSummon){const entry=getDungeon(dungeonChoice)!;closePanel();setWaypoint({...entry.summonStone,label:`${entry.name} summon stone`});return;}
 if(data.dungeonSummon){send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();send({type:'dungeonSummon',dungeonId:dungeonChoice,targetId:data.dungeonSummon});button.disabled=true;return;}
 if('dungeonEnter' in data||'dungeonExit' in data){
  const entry=getDungeon(dungeonChoice)!;
  if(!worldInstance&&entry.id==='rootvault'&&!player.rootvaultUnlocked){closePanel();setWaypoint({...ROOTVAULT_GUARDIAN,label:'Rootvault Gatekeeper · defeat to enter'});return;}
  const at=worldInstance?dungeonExitPoint():entry.entrance;closePanel();
  if(Math.hypot(at.x-position.x,at.z-position.z)>3){setWaypoint({...at,label:worldInstance?'Return to the entrance':entry.name});return;}
  send(worldInstance?{type:'dungeonExit'}:{type:'dungeonEnter',dungeonId:entry.id});return;
 }
 if(data.learnTalent)send({type:'learnTalent',talentId:data.learnTalent});
 if('resetTalents' in data)send({type:'resetTalents'});
 else if(data.upgradeGear)send({type:'upgradeGear',gearId:data.upgradeGear});
 else if(data.equipGear)send({type:'equipGear',itemId:data.equipGear,...(data.equipSlot?{slot:data.equipSlot as EquipmentSlot}:{})});
 else if(data.unequipGear)send({type:'unequipGear',slot:data.unequipGear as EquipmentSlot});
 else if(data.buyGear){const merchant=panel.dataset.mode==='shop'&&nearbyMerchant(shopNpcId);if(merchant)send({type:'buyGear',npcId:merchant.id,itemId:data.buyGear});}
 else if(data.sellGear){const merchant=panel.dataset.mode==='shop'&&nearbyMerchant(shopNpcId);if(merchant)queueShopSale({type:'sellGear',npcId:merchant.id,itemId:data.sellGear});}
 else if(data.sellResource){const merchant=panel.dataset.mode==='shop'&&nearbyMerchant(shopNpcId);if(!merchant)return;const resource=data.sellResource as 'wood'|'crystal'|'herb';queueShopSale({type:'sellResource',npcId:merchant.id,resource,quantity:data.sellQuantity==='all'?player.inventory[resource]:Number(data.sellQuantity||1)});}
});
function selectBagItem(id:string, upgrading=false){
 if(!player)return;lastGearHTML='';selectedBagItem=id;upgradingBagItem=upgrading;
 const details=$('bag-item-details');if(details){disposeBagPreview();details.innerHTML=id?renderItemDetails(lootUI.displayPlayer(player),id,upgrading,panel.dataset.mode==='inventory'):'';details.classList.toggle('is-empty',!id);details.hidden=!id;details.scrollTop=0;showBagPreview();}
 document.querySelectorAll<HTMLButtonElement>('[data-inspect-item]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inspectItem===id)));
}
let draggedGear='';let draggedBag='';let draggedItem='';let draggedItemPlayer='';let gearDragFinish=0;
function equipBagFromItem(id:string){if(!player)return;const slot=(player.equippedBags||[null,null,null,null]).indexOf(null);if(slot>=0)send({type:'equipBag',bagId:id,slot});else{selectBagItem(`bag:${id}`);toast('Choose a bag slot to replace.');}}
$('panel-content').addEventListener('dragstart',event=>{
 clearGearDrag();
 const storageItem=(event.target as HTMLElement).closest<HTMLElement>('[data-drag-item]');
 if(storageItem?.dataset.dragItem&&event.dataTransfer){
  draggedItem=storageItem.dataset.dragItem;draggedItemPlayer=player?.id||'';event.dataTransfer.setData('text/plain',draggedItem);event.dataTransfer.effectAllowed='move';
  document.querySelectorAll('[data-storage-slot]').forEach(slot=>slot.classList.add('drop-ready'));
 }
 const bag=(event.target as HTMLElement).closest<HTMLElement>('[data-drag-bag]');
 if(bag?.dataset.dragBag&&event.dataTransfer){draggedBag=bag.dataset.dragBag!;event.dataTransfer.setData('text/plain',draggedBag);event.dataTransfer.effectAllowed='move';document.querySelectorAll('[data-bag-slot]').forEach(slot=>slot.classList.add('drop-ready'));return;}
 const item=(event.target as HTMLElement).closest<HTMLElement>('[data-drag-gear]');
 if(!item||!event.dataTransfer)return;draggedGear=item.dataset.dragGear!;event.dataTransfer.setData('text/plain',draggedGear);event.dataTransfer.effectAllowed='move';
 document.querySelectorAll<HTMLElement>('[data-gear-slot]').forEach(slot=>{if(gearFitsSlot(draggedGear,slot.dataset.gearSlot as EquipmentSlot))slot.classList.add('drop-ready');});
});
$('panel-content').addEventListener('dragover',event=>{
 const storageSlot=(event.target as HTMLElement).closest<HTMLElement>('[data-storage-slot]');
 if(draggedItem&&storageSlot&&!storageSlot.dataset.storageLocked){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';return;}
 if(draggedBag&&(event.target as HTMLElement).closest('[data-bag-slot]')){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';return;}
 const slot=(event.target as HTMLElement).closest<HTMLElement>('[data-gear-slot]');
 if(slot&&gearFitsSlot(draggedGear,slot.dataset.gearSlot as EquipmentSlot)){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';}
});
function clearGearDrag(){cancelAnimationFrame(gearDragFinish);gearDragFinish=0;draggedGear='';draggedBag='';draggedItem='';draggedItemPlayer='';document.querySelectorAll('.drop-ready').forEach(slot=>slot.classList.remove('drop-ready'));}
function finishGearDrag(){
 if(!draggedGear&&!draggedBag&&!draggedItem)return;
 clearGearDrag();
 // Let native drop/dragend finish before replacing their source.
 gearDragFinish=requestAnimationFrame(()=>{gearDragFinish=0;if(panel.open&&(panel.dataset.mode==='gear'||panel.dataset.mode==='inventory'))renderGearPanel();});
}
document.addEventListener('dragend',finishGearDrag,true);
document.addEventListener('drop',()=>{if(draggedGear||draggedBag||draggedItem)gearDragFinish=requestAnimationFrame(finishGearDrag);},true);
// Dragend can be lost outside the window or when another UI removes the source.
document.addEventListener('pointerdown',clearGearDrag,true);
window.addEventListener('pagehide',clearGearDrag);
$('panel-content').addEventListener('drop',event=>{
 const storageSlot=(event.target as HTMLElement).closest<HTMLElement>('[data-storage-slot]');
 if(storageSlot&&!storageSlot.dataset.storageLocked&&draggedItem&&player&&draggedItemPlayer===player.id){
  event.preventDefault();const slots=currentBagSlots(),from=slots.indexOf(draggedItem),to=Number(storageSlot.dataset.storageSlot);
  if(from>=0&&Number.isSafeInteger(to)&&to>=0&&to<slots.length){
   [slots[from],slots[to]]=[slots[to],slots[from]];bagLayout=slots;saveLocal(`mossvale:bag-slots:${player.id}`,JSON.stringify(slots));
  }
  return;
 }
 const bagSlot=(event.target as HTMLElement).closest<HTMLElement>('[data-bag-slot]');
 if(bagSlot&&draggedBag&&player?.ownedBags?.some(bag=>bag.id===draggedBag)){event.preventDefault();send({type:'equipBag',bagId:draggedBag,slot:Number(bagSlot.dataset.bagSlot)});return;}
 const slot=(event.target as HTMLElement).closest<HTMLElement>('[data-gear-slot]');
 if(slot&&player&&player.ownedGear.includes(draggedGear)&&gearFitsSlot(draggedGear,slot.dataset.gearSlot as EquipmentSlot)){event.preventDefault();send({type:'equipGear',itemId:draggedGear,slot:slot.dataset.gearSlot as EquipmentSlot});}
});
$('panel-content').addEventListener('dblclick',event=>{
 const item=(event.target as HTMLElement).closest<HTMLElement>('[data-inspect-item]')?.dataset.inspectItem?.replace(/^item:/,'');
 if(item&&lootItemValid(item)){if(LOOT_ITEMS[item].heal)send({type:'useItem',itemId:item});return;}
 const bag=(event.target as HTMLElement).closest<HTMLElement>('[data-drag-bag]')?.dataset.dragBag;if(bag){equipBagFromItem(bag);return;}
 const id=(event.target as HTMLElement).closest<HTMLElement>('[data-drag-gear]')?.dataset.dragGear;
 if(id&&player?.ownedGear.includes(id)&&player.level>=gearById(id)!.requiredLevel)send({type:'equipGear',itemId:id});
});
function openDeath(){if(isInstantCombatInstance(worldInstance)){openInstantCombat();return;}if(isRaidInstance(worldInstance)){openRaid();return;}playerMenu.close();tradeUI.update(null);openPanel('A moment to catch your breath','THE LANTERNS STILL CALL','death');$('panel-content').innerHTML=`<div class="ending-mark">${icon('respawn')}</div><p>You were overcome. Return to the safe road in ${isArenaInstance(worldInstance)?'the arena entrance':worldInstance?(dungeon?.checkpoint.active?'the sanctuary checkpoint':'the dungeon entrance'):getZone(worldZone).name} with your belongings and try again.</p><button id="respawn" class="primary-button">${icon('respawn')} Return to the safe road</button>`;$('respawn').onclick=()=>send({type:'respawn'});}
function applyGraphics(){
 const shadowType=graphics.shadows==='low'?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
 for(const [target,world] of [[renderer,scene],[previewRenderer,previewScene]] as const){
  if(!target||!world)continue;
  const changed=target.shadowMap.enabled!==(graphics.shadows!=='off')||target.shadowMap.type!==shadowType;
  target.setPixelRatio(Math.min(devicePixelRatio,1.6)*graphics.resolution);
  target.shadowMap.enabled=graphics.shadows!=='off';target.shadowMap.type=shadowType;
  if(changed)world.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])material.needsUpdate=true;});
 }
 const shadowSize=graphics.shadows==='high'?2048:1024;
 if(sun.shadow.mapSize.x!==shadowSize||graphics.shadows==='off'&&sun.shadow.map){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(shadowSize,shadowSize);}
 camera.far=graphics.renderDistance+80;camera.updateProjectionMatrix();
}
function applyGraphicsFog(){
 if(scene.fog instanceof THREE.Fog){
  scene.fog.near=Math.min(scene.fog.near,graphics.renderDistance*.35);scene.fog.far=Math.min(scene.fog.far,graphics.renderDistance);
  // Avoid drawing distant dungeon rooms beyond the fog.
  const far=renderedInstance&&!isArenaInstance(renderedInstance)?Math.min(graphics.renderDistance+80,scene.fog.far+32):graphics.renderDistance+80;
  if(camera.far!==far){camera.far=far;camera.updateProjectionMatrix();}
 }
}

function openSettings(){openPanel('Options','MOSSVALE','settings');$('panel-content').innerHTML=`<div class="settings-layout"><nav class="settings-nav" aria-label="Options categories"><span>System</span><button type="button" data-settings-tab="language">Language</button><button type="button" data-settings-tab="graphics" aria-current="page">Graphics</button><button type="button" data-settings-tab="wallet">${icon('menu-wallet')}Wallet</button><button type="button" data-settings-tab="audio">Audio</button><button type="button" data-settings-tab="notifications">Notifications</button><button type="button" data-settings-tab="updates">Updates</button><span>Gameplay</span><button type="button" data-settings-tab="keybindings">Keybindings</button><button type="button" data-settings-tab="controls">Controls</button></nav><div class="settings-pages"><section data-settings-page="language" hidden><h3>Language</h3>${languagePicker('settings-language')}<p>Language is saved on this device. Player names and chat stay as written.</p></section><section data-settings-page="graphics">${renderGraphicsSettings()}${renderHudScaleSettings()}${renderChatScaleSettings()}${performanceHud.renderSettings()}</section><section data-settings-page="wallet" hidden><div id="settings-wallet-content"></div></section><section data-settings-page="audio" hidden><h3>Audio</h3><label class="settings-row audio-setting">${icon('sound')} Sound effects <input id="sound-setting" type="range" min="0" max="100" step="5" value="${Math.round(gameAudio.volume('effects')*100)}" aria-label="Sound effects volume"><output id="sound-volume" for="sound-setting">${Math.round(gameAudio.volume('effects')*100)}%</output></label><label class="settings-row audio-setting">${icon('sound')} Adaptive music <input id="music-setting" type="range" min="0" max="100" step="5" value="${Math.round(gameAudio.volume('music')*100)}" aria-label="Music volume"><output id="music-volume" for="music-setting">${Math.round(gameAudio.volume('music')*100)}%</output></label><p>Music follows the region and combat. Set a volume to 0 to mute. Audio pauses when this tab is hidden.</p></section><section data-settings-page="notifications" hidden><div id="settings-notifications-content"></div></section><section data-settings-page="updates" hidden>${renderUpdateGuidance()}</section><section data-settings-page="keybindings" hidden>${renderKeybindings()}</section><section data-settings-page="controls" hidden><h3>Controls</h3><label class="settings-row"><span>Objective guidance <small>Show ground arrows and markers over your current objective.</small></span><input id="objective-guidance" type="checkbox" ${objectiveGuidance?'checked':''}></label><button id="settings-touch-layout" type="button" class="primary-button">Arrange touch controls</button><p class="mobile-controls-help">Drag the left joystick to move. Tap Attack to fight the closest nearby enemy; tap again to stop. Tap Target to cycle nearby foes. Melee fighters approach the selected enemy; moving the joystick cancels approach. Tap an ability to cast it. Use interacts with your selected target or a nearby object, and opens friendly player options. Tap Sprint to toggle running. Double-tap the world or tap Jump to jump, including while holding the joystick. Find Mount in Menu. Clear stops attacks and cancels casting. Drag the world to rotate the camera; pinch to zoom. Menu opens your bags, quests and other game features.</p><div class="controls-list">${KEY_ACTIONS.filter(action=>!/^slot[2-8]$/.test(action.id)&&action.id!=='descend').map(action=>`<span><kbd data-binding-key="${action.key}">${bindingLabel(action.key)}</kbd>${action.label}</span>`).join('')}</div><p>Left-click to select. Right-click a hostile player or monster to auto attack. Melee fighters approach the selected monster; moving manually cancels approach. Press ${bindingLabel('t')} to attack the closest nearby enemy. Press it again or Escape to stop. Spells take priority. Right-click other objects to interact within 3m. Right-click a chair or press ${bindingLabel('e')} to sit; move or press Escape to stand. The colosseum sand ring has lethal world PvP. Outside it, right-click a nearby player and choose Duel for a fight ending at 1 HP. Open Arena (${bindingLabel('u')}) to queue for rated Solo, 2v2 or 3v3 anywhere, even in combat. Form a party of exactly two or three before the leader searches for a team match. Each bracket has its own MMR and rank. Accept once you are out of combat. Direct arena challenges are unrated and need no arena entrance; team leaders challenge the opposing leader. Everyone accepts before entering a separate arena. Knockout is at 1 HP; matches last up to 5 minutes. Both teams return to where they entered afterward. Right-click a friendly player for Inspect, Invite, Trade, Whisper, Add friend or Ignore. ${bindingLabel('e')} interacts with your selected target or the closest object within 3m. Use your configured movement keys to walk. Set a waypoint on the map and follow its arrow. Drag to orbit; scroll to zoom. Your adventure is saved automatically.</p><button id="community-rules" class="primary-button">Community rules</button><button id="settings-guide" class="primary-button">${icon('route')} Continue Rowan’s guide</button><button id="settings-mounts" class="primary-button">Your mounts ${icon('arrow')}</button><button id="settings-pets" class="primary-button">Your pets ${icon('arrow')}</button><button id="reset-camera" class="primary-button">Reset camera ${icon('camera')}</button>${isNativeApp()?'':`<p>Contract address (CA)<br><a class="adventure-link" href="https://www.ponsfamily.com/launchpad/0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5" target="_blank" rel="noopener noreferrer" title="View on Pons (opens in a new tab)">0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5</a></p>`}${authEnabled?`<button id="sign-out" class="account-signout">${icon('logout')} Sign out</button>`:''}</section></div></div>`;
 $<HTMLInputElement>('objective-guidance').onchange=event=>{objectiveGuidance=(event.target as HTMLInputElement).checked;saveLocal('mossvale-objective-guidance',objectiveGuidance?'on':'off');updateWaypoint();};
 $('settings-guide').hidden=!player||!getOnboardingStep(player);$('settings-guide').onclick=()=>{closePanel();followStarterGuide();};
 $('settings-touch-layout').onclick=()=>mobileLayout.open();
 $('settings-mounts').onclick=openMounts;
 $('settings-pets').onclick=openPets;
 $('community-rules').onclick=()=>communityUI?.rules();
 if(authEnabled)$('sign-out').onclick=()=>void leaveAccount();
 for(const [id,channel] of [['sound','effects'],['music','music']] as const){
  $<HTMLInputElement>(`${id}-setting`).oninput=e=>{const value=Number((e.target as HTMLInputElement).value);gameAudio.setVolume(channel,value/100);$(`${id}-volume`).textContent=`${value}%`;};
 }
 $<HTMLInputElement>('sound-setting').onchange=()=>gameAudio.play('click');
 mountGraphicsSettings($('panel-content'),applyGraphics);mountHudScaleSettings($('panel-content'));mountChatScaleSettings($('panel-content'));
 for(const tab of $('panel-content').querySelectorAll<HTMLButtonElement>('[data-settings-tab]'))tab.addEventListener('click',()=>{
  if(tab.dataset.settingsTab==='notifications')mountNotificationSettings($('settings-notifications-content'));
  disposeWalletSettings();if(tab.dataset.settingsTab!=='wallet')return;
  const host=$('settings-wallet-content'),epoch=walletSettingsEpoch;
  if(isNativeApp()){host.innerHTML='<h3>Wallet</h3><p>Open Mossvale in your browser to manage your wallet. Wallet transfers are not available in the native app.</p>';return;}
  host.textContent='Loading wallet…';
  const active=()=>epoch===walletSettingsEpoch&&panel.open&&panel.dataset.mode==='settings'&&host.isConnected&&!host.parentElement!.hidden;
  void import('./turnkey-ui.ts').then(wallet=>{if(active())walletSettingsDispose=wallet.mountTurnkeyManagement(host);})
   .catch(error=>{if(active())host.textContent=error instanceof Error?error.message:'Wallet unavailable. Try again.';});
 });
performanceHud.mountSettings($('panel-content'));mountKeybindings($('panel-content'),()=>{clearMovementKeys();hotbar.refresh();refreshBindingHints();travelHUDKey='';mountPanelKey='';lastHUD='';lastTargetText='';updateHUD();updateTravelHUD();});$('reset-camera').onclick=()=>{yaw=.34;pitch=.35;distance=21;closePanel();};
}

const spectrumColors = '#430e0e #43200e #43320e #3f430e #20430e #0e4324 #0e433f #0e2d43 #0e1343 #240e43 #3f0e43 #292929 #761919 #763819 #765719 #6e7619 #387619 #197640 #19766e #194f76 #192176 #401976 #6e1976 #474747 #a82424 #a85024 #a87c24 #9da824 #50a824 #24a85b #24a89d #2471a8 #242fa8 #5b24a8 #9d24a8 #666666 #d43535 #d46a35 #d49f35 #c7d435 #6ad435 #35d477 #35d4c7 #3592d4 #3542d4 #7735d4 #c735d4 #858585 #e17070 #e19670 #e1bb70 #d7e170 #96e170 #70e19f #70e1d7 #70b2e1 #7079e1 #9f70e1 #d770e1 #a8a8a8 #edabab #edc1ab #edd7ab #e8edab #c1edab #abedc6 #abede8 #abd2ed #abb0ed #c6abed #e8abed #cccccc'.split(' ');
const palettes = {
 skin:['#f1c9a2','#dca67f','#bb835c','#956343','#70462f','#49332b','#f4dbc2','#dfbfa6','#bd9981','#9a7763','#745542','#543b35',...spectrumColors],
 hair:['#49362b','#242b30','#b67741','#dac48d','#a6aa9c','#8c5662','#644939','#8f6747','#bc995f','#e8d2a1','#d9d8c6','#eee8d4',...spectrumColors],
 outfit:['#577956','#517c8b','#865f81','#a25f50','#a68a50','#45495f','#335744','#374f6b','#65465e','#873f38','#867047','#c0b494',...spectrumColors],
 accent:['#d8b36a','#a0bd86','#8fbfc5','#ce908b','#c9b6da','#e6dfc3','#ad793f','#668768','#527e9a','#a8646f','#8d71a6','#f6e8ba',...spectrumColors],
};
const paletteLabels={skin:'Skin tone',hair:'Hair color',outfit:'Outfit color',accent:'Accent color',hairHighlight:'Hair highlights',head:'Head armor',armor:'Chest armor',legs:'Leg armor',shoes:'Boots',back:'Cloak'};
type CreatorColor = keyof typeof paletteLabels;
const creatorColors = () => palettes[creatorColor === 'hairHighlight' ? 'hair' : Object.hasOwn(palettes, creatorColor) ? creatorColor as keyof typeof palettes : 'outfit'];
const creatorColorValue = () => ARMOR_COLOR_SLOTS.includes(creatorColor as ArmorColorSlot) ? draft.armorColors[creatorColor as ArmorColorSlot] ?? (creatorColor === 'back' ? draft.accent : draft.outfit) : draft[creatorColor as keyof typeof palettes | 'hairHighlight'];
let creatorColor:CreatorColor='hair';
const creatorChoices={race:RACES,gender:GENDERS,className:[{id:'Ranger',label:'Ranger'},{id:'Knight',label:'Knight'},{id:'Mage',label:'Mage'},{id:'Cleric',label:'Cleric'}],face:FACES,hairStyle:HAIRSTYLES};
const classDescriptions={Ranger:'A steady bow and a keen eye. Strike from a distance and control the fight.',Knight:'Sword and shield, strong armor, and sweeping attacks in the heart of the fight.',Mage:'Shape old magic into fire, frost and arcane spells.',Cleric:'Heal allies, shield companions and wield the holy light of Mossvale.'};
let creatorStep=0;
function showCreatorStep(step:number,focus=true){
 if(creatingCharacter||!Number.isInteger(step)||step<0||step>3)return;
 creatorStep=step;
 for(let index=0;index<4;index++){
  $(`creator-page-${index}`).hidden=index!==step;
  if(index===step)$(`creator-step-${index}`).setAttribute('aria-current','step');else $(`creator-step-${index}`).removeAttribute('aria-current');
 }
 $('creator-step-title').textContent=['Choose your class','Make it your own','Add your colors','Name your adventurer'][step];
 $<HTMLInputElement>('character-name').disabled=step!==3;
 $<HTMLButtonElement>('creator-previous').disabled=step===0;
 $('creator-next').hidden=step===3;$('create-character').hidden=step!==3;
 $('creator-next').innerHTML=`Next: ${['Look','Colors','Name'][step]||'Name'} ${icon('arrow')}`;
 customizer.scrollTop=0;
 if(focus)$('creator-step-title').focus({preventScroll:true});
 requestAnimationFrame(resizePreview);
}
function openCustomizer(){
 if(!rosterActive||characterDeletion?.pending||$<HTMLButtonElement>('roster-create').disabled)return;
 if(customizer.open)return;
 previewRotation=0;draft=normalizeAppearance(appearance);creatorColor='hair';$<HTMLInputElement>('character-name').value='';
 $('creation-error').textContent='';
 updateRosterAvailability();
 const preview=$<HTMLCanvasElement>('character-preview');document.querySelector('.customizer-art')!.append(preview);preview.hidden=false;
 document.body.classList.add('menu-open');customizer.showModal();showCreatorStep(0);drawChoices();requestAnimationFrame(()=>updatePreview());
}
function drawChoices(){
 for(const property of Object.keys(creatorChoices) as (keyof typeof creatorChoices)[]){
  const value=creatorChoices[property].find(option=>option.id===draft[property])!;
  const output=$(property==='hairStyle'?'hair-style':`creator-value-${property}`);
  if(output.textContent!==value.label)output.textContent=value.label;
 }
 $('class-description').textContent=classDescriptions[draft.className];
 $('creator-class-name').textContent=draft.className;
 $('creator-summary').textContent=`${creatorChoices.race.find(race=>race.id===draft.race)!.label} · ${draft.className}`;
 $<HTMLSelectElement>('creator-color-part').value=creatorColor;
 $('creator-class-role').textContent={Ranger:'RANGED · BOW & LEATHER',Knight:'MELEE · SWORD & SHIELD',Mage:'RANGED · FIRE & ARCANE',Cleric:'HEALER · HOLY LIGHT & WARDS'}[draft.className];
 const spells=classSpells[draft.className];
 $('creator-abilities').innerHTML=`<div class="creator-ability">${icon(spells.primaryIcon)}<div><strong>${spells.primary}</strong><p>One target · ${spells.range}m range</p></div></div><div class="creator-ability">${icon(spells.specialIcon)}<div><strong>${spells.special}</strong><p>Area attack</p></div></div>`;
 for(const button of $('creator-color-tabs').querySelectorAll<HTMLButtonElement>('[data-color-tab]')){
  const selected=button.dataset.colorTab===creatorColor;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
 }
 const focused=document.activeElement instanceof HTMLElement&&$('color-options').contains(document.activeElement);
 const selectedColor=creatorColorValue(),palette=creatorColors();
 const colors=palette.includes(selectedColor)?palette:[...palette,selectedColor];
 $<HTMLInputElement>('creator-custom-color').value=selectedColor;
 $<HTMLInputElement>('creator-custom-color').setAttribute('aria-label',`Choose any ${paletteLabels[creatorColor].toLowerCase()}`);
 $('creator-reset-dye').hidden=!ARMOR_COLOR_SLOTS.includes(creatorColor as ArmorColorSlot);
 $<HTMLButtonElement>('creator-reset-dye').disabled=!Object.hasOwn(draft.armorColors,creatorColor);
 $('color-options').setAttribute('aria-labelledby',`creator-tab-${creatorColor}`);
 $('creator-color-label').textContent=paletteLabels[creatorColor];
 const colorLabel=selectedColor.toUpperCase();if($('creator-color-value').textContent!==colorLabel)$('creator-color-value').textContent=colorLabel;
 $('color-options').innerHTML=`<div class="swatches" role="group" aria-label="${paletteLabels[creatorColor]}. Use arrow keys to choose a color.">${colors.map((color,index)=>`<button type="button" class="swatch ${selectedColor===color?'selected':''}" style="--swatch:${color}" data-color="${color}" data-color-index="${index}" tabindex="${selectedColor===color?'0':'-1'}" aria-label="${paletteLabels[creatorColor]} ${color.toUpperCase()}" aria-pressed="${selectedColor===color}"></button>`).join('')}</div>`;
 if(focused)$('color-options').querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
}
function cycleCreatorChoice(property:keyof typeof creatorChoices,step:number){
 const choices=creatorChoices[property],index=choices.findIndex(option=>option.id===draft[property]);
 Object.assign(draft,{[property]:choices[(index+step+choices.length)%choices.length].id});drawChoices();updatePreview();
}
function chooseCreatorColor(color:string){
 if(!/^#[\da-f]{6}$/i.test(color))return;
 if(ARMOR_COLOR_SLOTS.includes(creatorColor as ArmorColorSlot))draft.armorColors[creatorColor as ArmorColorSlot]=color;
 else draft[creatorColor as keyof typeof palettes | 'hairHighlight']=color;
 drawChoices();updatePreview();
}
function randomizeAppearance(){
 for(const property of Object.keys(palettes) as (keyof typeof palettes)[])draft[property]=palettes[property][Math.floor(Math.random()*palettes[property].length)];
 draft.hairHighlight=draft.hair;draft.armorColors={};
 for(const property of ['race','gender','face','hairStyle'] as const){const choices=creatorChoices[property];Object.assign(draft,{[property]:choices[Math.floor(Math.random()*choices.length)].id});}
 drawChoices();updatePreview();
}
function updatePreview(chosen?:Player|null){
 const previewCanvas=$<HTMLCanvasElement>('character-preview');
 if(!previewRenderer){
  previewRenderer=new THREE.WebGLRenderer({canvas:previewCanvas,alpha:true,antialias:true});previewRenderer.setPixelRatio(Math.min(devicePixelRatio,1.6)*graphics.resolution);
  previewRenderer.outputColorSpace=THREE.SRGBColorSpace;previewRenderer.toneMapping=THREE.ACESFilmicToneMapping;previewRenderer.toneMappingExposure=1.2;
  previewRenderer.shadowMap.enabled=graphics.shadows!=='off';previewRenderer.shadowMap.type=graphics.shadows==='low'?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
  previewScene=new THREE.Scene();previewScene.background=new THREE.Color('#8da9a5');previewScene.fog=new THREE.Fog('#8da9a5',16,48);
  previewScene.add(new THREE.HemisphereLight('#fff0cf','#395848',2.1));
  const light=new THREE.DirectionalLight('#ffdfaa',3);light.position.set(-5,10,6);light.castShadow=true;light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:45});light.shadow.normalBias=.03;light.shadow.bias=-.0003;previewScene.add(light);
  for(const x of [-3,3]){const lantern=new THREE.PointLight('#ffc16c',4,7,2);lantern.position.set(x,1.9,-2);previewLanterns.push(lantern);previewScene.add(lantern);}
  previewCamera=new THREE.PerspectiveCamera(34,1,.1,80);
  // A real ground plane remains visible while the Blender scene streams in.
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#526948',roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.23;ground.receiveShadow=true;previewScene.add(ground);
  void new GLTFLoader().loadAsync('/models/creator-scene.glb').then(({scene:scenery})=>{
   scenery.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}});previewScene.add(scenery);
  }).catch(()=>{if(customizer.open)$('creation-error').textContent='The woodland scene could not load. You can still create your character.';else if(rosterActive)$('roster-error').textContent='The woodland scene could not load. You can still select your character.';});
 }

 if(previewCharacter)removeRig(previewCharacter);
 previewCharacter=chosen===null?undefined:makeCharacter(chosen?.appearance||draft,chosen?.equipment,chosen?.raidProgress);
 previewHalfHeight=1.45;previewRadius=1.12;previewCenter=1.22;
 if(previewCharacter){
  previewScene.add(previewCharacter);previewCharacter.updateMatrixWorld(true);
  const bounds=new THREE.Box3();previewCharacter.traverseVisible(node=>{if(node instanceof THREE.Mesh)bounds.expandByObject(node);});
  previewCenter=(bounds.min.y+bounds.max.y)/2;
  previewRadius=Math.max(1.12,...[bounds.min.x,bounds.max.x].flatMap(x=>[bounds.min.z,bounds.max.z].map(z=>Math.hypot(x,z))))+.08;
  previewHalfHeight=Math.max(1.45,(bounds.max.y-bounds.min.y)/2+.15+previewRadius*.15);
 }
 resizePreview();
}
function resizePreview(){
 if(!previewRenderer)return;const rect=$('character-preview').getBoundingClientRect();if(!rect.width||!rect.height)return;
 previewRenderer.setSize(rect.width,rect.height,false);previewCamera.aspect=rect.width/rect.height;previewCamera.clearViewOffset();
 let safeWidth=rect.width,safeHeight=rect.height;
 if(getComputedStyle($('character-preview')).position==='fixed'){
  const stage=(customizer.open?document.querySelector('.customizer-art')!:$('roster-preview-mount')).getBoundingClientRect();safeWidth=stage.width;safeHeight=stage.height-(customizer.open?54:0);
  previewCamera.setViewOffset(rect.width,rect.height,rect.width/2-(stage.left-rect.left+stage.width/2),rect.height/2-(stage.top-rect.top+safeHeight/2),rect.width,rect.height);
 }
 const fit=Math.max(previewHalfHeight*rect.height/Math.max(1,safeHeight),previewRadius*rect.height/Math.max(1,safeWidth))/Math.tan(THREE.MathUtils.degToRad(previewCamera.fov/2));
 previewCamera.position.set(fit*.27,previewCenter+fit*.15,fit);previewCamera.lookAt(0,previewCenter,0);previewCamera.updateProjectionMatrix();
}
$('preview-turn-left').onclick=()=>{previewRotation-=Math.PI/4;};
$('preview-turn-right').onclick=()=>{previewRotation+=Math.PI/4;};
function closeCustomizer(){if(creatingCharacter)return;customizer.close();document.body.classList.remove('menu-open');clearMovementKeys();showRosterPreview();$('roster-create').focus();}
$<HTMLFormElement>('character-form').onsubmit=e=>{
 e.preventDefault();if(!rosterActive||creatingCharacter||characterDeletion?.pending||!realmHasSpace())return;
 if(creatorStep!==3){showCreatorStep(creatorStep+1);return;}
 if(!connected||!realmAvailable||socket.readyState!==WebSocket.OPEN){$('creation-error').textContent=realmOutageMessage||'Reconnect to the realm before creating your character.';return;}
 const input=$<HTMLInputElement>('character-name'),name=input.value.trim();
 const nameError=characterNameError(name);
 if(nameError){input.setCustomValidity(nameError);$('creation-error').textContent=nameError;input.reportValidity();return;}
 input.setCustomValidity('');creatingCharacter=true;updateRosterAvailability();$('creation-error').textContent='Creating your adventurer…';$<HTMLButtonElement>('create-character').disabled=true;
 send({type:'createCharacter',realmId:activeRealmId,appearance:{...draft},name});
};
$<HTMLInputElement>('character-name').oninput=e=>{(e.target as HTMLInputElement).setCustomValidity('');if(!creatingCharacter)$('creation-error').textContent='';};
$('creator-previous').onclick=()=>showCreatorStep(creatorStep-1);
$('creator-next').onclick=()=>showCreatorStep(creatorStep+1);
$('creator-steps').onclick=event=>{
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-creator-step]');
 if(button)showCreatorStep(Number(button.dataset.creatorStep));
};
$('creator-color-part').onchange=event=>{
 const value=(event.target as HTMLSelectElement).value;
 if(Object.hasOwn(paletteLabels,value)){creatorColor=value as CreatorColor;drawChoices();}
};
$('creator-selectors').onclick=event=>{
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-cycle]');
 if(button&&Object.hasOwn(creatorChoices,button.dataset.cycle!))cycleCreatorChoice(button.dataset.cycle as keyof typeof creatorChoices,Number(button.dataset.step));
};
$('creator-color-tabs').onclick=event=>{
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-color-tab]');
 if(button&&Object.hasOwn(paletteLabels,button.dataset.colorTab!)){creatorColor=button.dataset.colorTab as CreatorColor;drawChoices();}
};
$('creator-color-tabs').onkeydown=event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=[...$('creator-color-tabs').querySelectorAll<HTMLButtonElement>('[data-color-tab]')],index=tabs.findIndex(tab=>tab.dataset.colorTab===creatorColor);
 const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;
 event.preventDefault();creatorColor=tabs[next].dataset.colorTab as CreatorColor;drawChoices();tabs[next].focus();
};
$('creator-custom-color').oninput=event=>chooseCreatorColor((event.target as HTMLInputElement).value);
$('creator-reset-dye').onclick=()=>{delete draft.armorColors[creatorColor as ArmorColorSlot];drawChoices();updatePreview();};
$('color-options').onclick=event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-color]');if(button)chooseCreatorColor(button.dataset.color!);};
$('color-options').onkeydown=event=>{
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-color]');
 if(!button||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
 const buttons=[...$('color-options').querySelectorAll<HTMLButtonElement>('[data-color]')],index=Number(button.dataset.colorIndex);
 const columns=getComputedStyle($('color-options').querySelector('.swatches')!).gridTemplateColumns.split(' ').length;
 const step=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-columns:columns;
 const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+step));
 event.preventDefault();chooseCreatorColor(buttons[next].dataset.color!);$('color-options').querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
};
$('randomize').onclick=randomizeAppearance;
$('customize-button').onclick=toggleCharacter;$('close-customizer').onclick=closeCustomizer;
$('inventory-button').onclick=toggleBackpack;$('journal-button').onclick=()=>openContracts();$('quest-button').onclick=()=>isInstantCombatInstance(worldInstance)?openInstantCombat():player&&getOnboardingStep(player)?followStarterGuide():isRaidInstance(worldInstance)?openRaid():isArenaInstance(worldInstance)?openMap():dungeon?openDungeon():!trackedContractId&&storyQuestTracker(player,trackedStoryQuestId)?openJournal():openContracts();$('settings-button').onclick=openSettings;$('spells-button').onclick=openSkills;$('talents-button').onclick=toggleTalents;$('close-panel').onclick=()=>panel.dataset.mode==='gear'&&!document.body.classList.contains('mobile-controls')?toggleCharacter():closePanel();
for(const dialog of [panel,customizer]){
 let backdropPressed=false;
 const outside=(e:MouseEvent)=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
 // The touch opener runs on pointerup; its later click may land on the new backdrop.
 dialog.addEventListener('pointerdown',e=>{backdropPressed=e.button===0&&outside(e);},true);
 dialog.addEventListener('pointercancel',()=>{backdropPressed=false;},true);
 dialog.addEventListener('cancel',e=>{if(dialog===customizer){e.preventDefault();closeCustomizer();}else if(panel.dataset.mode==='death')e.preventDefault();});
 dialog.addEventListener('close',()=>{backdropPressed=false;if(dialog.open)return;if(dialog===panel){cancelQueuedShopSales();clearGearDrag();disposeAtlas();disposeCharacterView();disposeBagPreview();disposeCollectionPreview();disposeWalletSettings();disposeBagBalance();}document.body.classList.remove('menu-open');if(dialog!==panel||!floatingPanel())clearMovementKeys();if(!rosterActive)canvas.focus();});
 dialog.addEventListener('click',e=>{const dismiss=backdropPressed&&outside(e);backdropPressed=false;if(dismiss&&dialog!==customizer&&panel.dataset.mode!=='death')dialog.close();});
}
$('hotbar-customize').onclick=openSpells;
$('chat-toggle').onclick=()=>setChatExpanded($('chat').classList.contains('collapsed'));
$('chat-close').onclick=()=>setChatExpanded(false);
$('chat-preview-messages').onclick=event=>{
 const channel=(event.target as HTMLElement).closest<HTMLElement>('[data-preview-channel]')?.dataset.previewChannel as ChatChannel|undefined;
 if(channel)selectChatChannel(channel);else setChatExpanded(true);
 $(`chat-tab-${chatChannel}`).focus({preventScroll:true});
};
$<HTMLFormElement>('chat-form').onsubmit=e=>{
 e.preventDefault();const input=$<HTMLInputElement>('chat-input'),text=input.value.trim(),channel=chatChannel;
 if(channel==='system')return;
 if(text){
  const command=emoteCommand(text);
  if(command==='help'||command===''){chatMessage(command===''?`Unknown emote. ${EMOTE_HELP}`:EMOTE_HELP,undefined,undefined,undefined,channel);}
  else if(command!==undefined)send({type:'emote',emoteId:command==='stop'?null:command});
  else if(channel==='whisper'){if(!whisperTarget){toast('Choose a player to whisper to.');return;}send({type:'whisper',targetId:whisperTarget.id,text});}
  else send({type:channel==='party'?'partyChat':'chat',text});
  input.value='';chatDrafts[channel]='';
 }
 if(!mobileChat()){input.blur();canvas.focus();}
};
for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-chat-channel]')){
 tab.onclick=()=>selectChatChannel(tab.dataset.chatChannel as ChatChannel);
 tab.onkeydown=e=>{const tabs=[...document.querySelectorAll<HTMLButtonElement>('[data-chat-channel]')],index=tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:-1;if(next<0)return;e.preventDefault();tabs[next].click();tabs[next].focus();};
}
$('chat').addEventListener('pointerdown',()=>keys.clear());
$('chat').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();if(mobileChat())setChatExpanded(false);else{$<HTMLInputElement>('chat-input').blur();canvas.focus();}}});
for(const channel of ['world','system','whisper','party'] as const)$(`chat-log-${channel}`).addEventListener('scroll',()=>{
 if(!mobileChat()||channel!==chatChannel||$('chat').classList.contains('collapsed'))return;
 rememberChatScroll();if(chatScroll.get(channel)?.follow){$(`chat-tab-${channel}`).dataset.unread='0';updateChatUnread();}
});
function resizeChat(width:number,height:number){
 if(mobileChat())return;
 const chat=$('chat'),style=getComputedStyle(chat),scale=currentChatScale(),maxWidth=Math.min(Math.max(0,innerWidth-parseFloat(style.left)-16)/scale,parseFloat(style.maxWidth)||Infinity),maxHeight=Math.max(0,innerHeight-parseFloat(style.bottom)-16)/scale;
 rememberChatScroll(true);
 chat.style.width=`${Math.min(maxWidth,Math.max(280,280/scale,width))}px`;chat.style.height=`${Math.min(maxHeight,Math.max(180,140/scale,height))}px`;
 if(!chat.classList.contains('collapsed'))restoreChatScroll();
}
function saveChatSize(){saveLocal('mossvale-chat-size',JSON.stringify([parseFloat($('chat').style.width),parseFloat($('chat').style.height)]));}
let chatResize:{id:number;x:number;y:number;width:number;height:number}|null=null;
$('chat-resize').onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();setChatExpanded(true);const {width,height}=$('chat').getBoundingClientRect();chatResize={id:e.pointerId,x:e.clientX,y:e.clientY,width:width/currentChatScale(),height:height/currentChatScale()};$('chat-resize').setPointerCapture(e.pointerId);};
$('chat-resize').onpointermove=e=>{if(chatResize?.id===e.pointerId)resizeChat(chatResize.width+(e.clientX-chatResize.x)/currentChatScale(),chatResize.height+(chatResize.y-e.clientY)/currentChatScale());};
$('chat-resize').onpointerup=$('chat-resize').onpointercancel=()=>{if(chatResize)saveChatSize();chatResize=null;};
$('chat-resize').onlostpointercapture=()=>{chatResize=null;};
$('chat-resize').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();setChatExpanded(true);const {width,height}=$('chat').getBoundingClientRect();resizeChat(e.key==='Home'?340:(width+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0))/currentChatScale(),e.key==='Home'?250:(height+(e.key==='ArrowUp'?20:e.key==='ArrowDown'?-20:0))/currentChatScale());saveChatSize();};
try{const size=JSON.parse(readLocal('mossvale-chat-size')||'null');if(Array.isArray(size)&&size.length===2&&size.every(n=>typeof n==='number'&&Number.isFinite(n)))resizeChat(size[0],size[1]);}catch{/* Ignore a damaged window-size preference. */}
window.addEventListener('resize',()=>{const chat=$('chat');if(chat.style.width||chat.style.height)resizeChat(parseFloat(chat.style.width)||660,parseFloat(chat.style.height)||260);if(mobileChat()&&!chat.classList.contains('collapsed'))restoreChatScroll();});
window.visualViewport?.addEventListener('resize',()=>{if(mobileChat()&&!$('chat').classList.contains('collapsed'))requestAnimationFrame(restoreChatScroll);});
setChatExpanded(false);updateChatPreview();updateChatUnread();
$<HTMLInputElement>('chat-input').onfocus=()=>{clearMovementKeys();};
let mapCanvas=$<HTMLCanvasElement>('minimap');
let minimap: ReturnType<typeof createMinimap> | null = null;
let minimapFailed=false;
function disposeMinimap(){
 if(minimap){minimap.dispose();const fresh=mapCanvas.cloneNode(false) as HTMLCanvasElement;mapCanvas.replaceWith(fresh);mapCanvas=fresh;}
 minimap=null;minimapFailed=false;
}
function renderMinimap(){
 if(!player||rosterActive||entryActive||customizer.open||atlas||minimapFailed)return;
 if(!minimap){try{minimap=createMinimap(mapCanvas);}catch{minimapFailed=true;$('minimap-button').dataset.unavailable='true';return;}}
 minimap.update({player:{...player,x:position.x,z:position.z,rotation,instanceId:worldInstance},players,party,dungeon,instantCombat,enemies,nodes,loot,searchArea:treasureMapSearchArea(player),route:waypoint?.instanceId===worldInstance?[position,...guideRoute,waypoint]:[]});
}
window.addEventListener('pagehide',disposeMinimap);
function disposeAtlas(){atlas?.dispose();atlas=null;atlasLabels.clear();mapSelection=null;mapRoute=[];}
function selectMapPoint(point:WorldMapPoint,placeWaypoint=true){
 if(!player||placeWaypoint&&!setWaypoint(point))return;
 mapSelection=point;
 mapRoute=waypoint?[{x:waypoint.x,z:waypoint.z}]:[];
 renderMapDetails(point);
 $('atlas-distance').textContent=`${waypoint?'Waypoint set · ':''}${Math.round(Math.hypot(point.x-position.x,point.z-position.z))}m away · Straight-line direction`;
 $<HTMLButtonElement>('atlas-travel').disabled=!waypoint;
}
function renderMapDetails(point:WorldMapPoint){
 if(!player)return;
 $('atlas-selection').textContent=point.label||'A place to explore';
 if(isInstantCombatInstance(worldInstance)){ $('atlas-region').textContent=instantCombatMap(instantCombat?.run?.mapId).name.toUpperCase();$('atlas-suitability').textContent='Cooperative arena · Up to 20 adventurers';$('atlas-description').textContent='All adventurers here are allies. Clear four waves, then resolve the selected boss’s unique mechanics at 70% and 35% health. Open Instant Combat for its instructions.';return; }
 if(isArenaInstance(worldInstance)){ $('atlas-region').textContent='THORNRING ARENA';$('atlas-suitability').textContent='Solo · 2v2 · 3v3';$('atlas-description').textContent='Use the pillars for cover. Defeat the opposing team to 1 HP; both teams return to where they entered after the match.';return; }
 const surface=surfaceAt(point.x,point.z),entry=worldInstance?getDungeon(dungeon?.kind)!:DUNGEONS.find(entry=>point.id===(entry.id==='rootvault'?'dungeon-entrance':`dungeon-entrance-${entry.id}`)||point.id===`dungeon-summon-${entry.id}`),isDungeon=!!entry;
 const expedition=wildBiomeAt(point.x,point.z)||EXPEDITIONS.find(region=>region.id===surface.regionId);
 const range=entry?{min:entry.minLevel,max:entry.maxLevel}:regionLevelRange(surface.regionId,surface.zone);
 const levels=isDungeon?`Lv ${range.min}–${range.max}`:regionLevelLabel(surface.regionId,surface.zone);
 $('atlas-region').textContent=`${entry?entry.name.toUpperCase():(expedition?.name||getZone(surface.zone).name).toUpperCase()} · ${levels}`;
 const boss=WORLD_BOSSES.find(boss=>boss.id===point.id),minimum=boss?MONSTERS[boss.kind].level:range.min;
 $('atlas-suitability').textContent=boss?`World boss · Lv ${minimum} · ~${WORLD_BOSS_GROUP_SIZE} players${player.level<minimum?` · Reach level ${minimum} first`:''}`:player.level<minimum?`Reach level ${minimum} first`:player.level>range.max?'Lower-level area':'Recommended for your level';
 const site=RESOURCE_SITES.find(site=>site.id===point.id),biome=wildBiomeAt(point.x,point.z);
 const village=VILLAGES.find(v=>v.id===point.id||Math.hypot(v.x-point.x,v.z-point.z)<24);
 $('atlas-description').textContent=site?`${site.name}: ${site.resources.map(kind=>RESOURCE_TYPES[kind].label).join(', ')}. Shared rich deposits replenish every 10 seconds.`:biome?biome.description:point.id==='arena-entrance'?'Open Arena (U) to queue for Solo, 2v2 or 3v3 from anywhere. The sand ring beyond is lethal world PvP.':point.id?.startsWith('zeppelin-')?`Visit the sky dock and click its blue exclamation mark to discover it. ${player?.economyVersion===1?`Flights cost ${GOLD_ZEPPELIN_COST} gold and connect`:'Free flights connect'} docks this character has discovered.`:boss?`${boss.name} · ${boss.description}`:entry?entry.description:insideCity(point.x,point.z)?CITY.description:waterAt(point.x,point.z)?'Open water. Swim to nearby islands and coastlines; movement is slower here.':village?`${village.description} Talk to the warden for local quests, trade with the merchant, or rest with the healer.`:expedition?`${expedition.name} · Explore its wilderness, gather supplies, and challenge the guardians near its camp.`:getZone(surface.zone).description;
 if(worldInstance&&dungeon?.kind){
  const portal=dungeonLayout(dungeon.kind).portals.find(portal=>portal.id===point.id);
  $('atlas-description').textContent=portal?`${portal.label}. ${dungeon.dream||dungeonRoomPortalOpen(portal,dungeon.clearedStages,dungeon.objects.filter(object=>object.activated||object.opened).map(object=>object.id))?'Walk to this portal and interact to teleport.':portal.seals?.length?'Clear the required chambers and activate their seals to unlock this portal.':'Defeat the chamber enemies to unlock this portal.'}`:'Each chamber is enclosed. Dashed lines connect room portals; selecting another chamber guides you to the next portal.';
 }
}
function renderAtlas(){
 if(!atlas||!player||!panel.open||panel.dataset.mode!=='map')return;
 const labels=atlas.update({player:{...player,x:position.x,z:position.z,rotation},players,party,dungeon,instantCombat,searchArea:treasureMapSearchArea(player),selected:mapSelection,route:mapRoute.length?[position,...mapRoute]:[]});
 const present=new Set<string>();
 for(const item of labels){present.add(item.id);let el=atlasLabels.get(item.id);if(!el){el=document.createElement('span');el.className=`atlas-label atlas-label-${item.kind}`;$('atlas-labels').append(el);atlasLabels.set(item.id,el);}el.textContent=item.label;el.hidden=!item.visible;el.style.transform=`translate(${item.x}px,${item.y}px) translate(-50%,-50%)`;}
 for(const [id,el] of atlasLabels)if(!present.has(id)){el.remove();atlasLabels.delete(id);}
}
function openMap(){
 if(isRaidInstance(worldInstance)){openRaid();return;}
 if(!player)return;
 openPanel(isInstantCombatInstance(worldInstance)?'Instant Combat':isArenaInstance(worldInstance)?'Thornring Arena':worldInstance?getDungeon(dungeon?.kind)!.name:'The lantern lands',isInstantCombatInstance(worldInstance)?'COOPERATIVE ARENA':isArenaInstance(worldInstance)?'PRIVATE ARENA':worldInstance?`DUNGEON MAP · Lv ${getDungeon(dungeon?.kind)!.minLevel}–${getDungeon(dungeon?.kind)!.maxLevel}`:'WORLD MAP','map');
 const cityDestinations=[{...ARENA_ENTRANCE,id:'arena-entrance',label:'Arena matches · Solo · 2v2 · 3v3',icon:'sword'},...ZEPPELIN_PORTS.map(port=>({...port,id:`zeppelin-${port.id}`,zone:port.id,label:`${port.name} · Zeppelin dock`,icon:'travel'})),{...CITY,label:'Lanternreach · Main city',icon:'crown'},...AUCTIONEERS.map(npc=>({...npc,label:`${npc.cityName} Auction House`,icon:'trade'})),{...DEED_AUCTIONEER,label:'House deed auctions',icon:'trade'},...BANKERS.map(npc=>({...npc,label:`${npc.cityName} Bank`,icon:'bag'})),...POLL_BOOTHS.map(booth=>({...booth,label:`${booth.cityName} Polling booth`,icon:'book'})),...TRAINER_NPCS.filter(npc=>npc.zone==='greenwood').map(npc=>({...npc,label:npc.title,icon:npc.className==='Ranger'?'bow':npc.className==='Knight'?'sword':npc.className==='Mage'?'spark':npc.className==='Cleric'?'cleric':'travel'})),...CITY_VENDORS.map(npc=>({...npc,label:npc.title,icon:npc.id==='city-armorer'?'shield':'sword'}))];
 const places=usesArenaWorld(worldInstance)?[]:worldInstance?dungeonStages(dungeon?.kind).map(room=>({id:room.id,label:room.name,icon:'map'})):[
  ...cityDestinations,
  ...DUNGEONS.map(entry=>({id:`dungeon-${entry.id}`,label:`${entry.name} · Lv ${entry.minLevel}–${entry.maxLevel}`,icon:'boss'})),
  ...WORLD_BOSSES.map(boss=>({id:boss.id,label:`${boss.name} · World boss · Lv ${MONSTERS[boss.kind].level}`,icon:'boss'})),
  ...ZONES.map(zone=>({id:zone.id,label:`${zone.name} · ${regionLevelLabel(zone.id,zone.id)}`,icon:zoneIcons[zone.id]})),
  ...VILLAGES.map(v=>{const surface=surfaceAt(v.x,v.z);return{id:v.id,label:`${v.name} · ${regionLevelLabel(surface.regionId,surface.zone)}`,icon:'user'};}),
  ...[...WILD_BIOMES,...RESOURCE_SITES].map(site=>({id:site.id,label:site.name,icon:'gather'})),
  ...EXPEDITIONS.map(region=>({id:region.id,label:`${region.name} · ${regionLevelLabel(region.id,region.zone)}`,icon:zoneIcons[region.zone]}))];
 $('panel-content').innerHTML=`<div class="atlas-stage"><canvas id="world-map" tabindex="0" aria-label="Interactive 3D voxel ${usesArenaWorld(worldInstance)?'arena':worldInstance?'dungeon':'world'} map. Click or tap to set a waypoint. Drag to rotate, right drag to pan, scroll to zoom."></canvas><div id="atlas-labels" aria-hidden="true"></div><div class="atlas-toolbar"><button class="primary-button" id="atlas-center" aria-label="Center map on your character">${icon('user')} Find me</button><button class="primary-button" id="atlas-zoom-in" aria-label="Zoom map in">+</button><button class="primary-button" id="atlas-zoom-out" aria-label="Zoom map out">−</button></div><div class="atlas-instructions">Click or tap to set waypoint · Drag to rotate · Scroll to zoom</div></div><aside class="atlas-details"><span class="eyebrow" id="atlas-region"></span><h3 id="atlas-selection"></h3><span id="atlas-suitability"></span><p id="atlas-description"></p><span id="atlas-distance" role="status"></span><button class="primary-button" id="atlas-travel">${icon('route')} Clear waypoint</button></aside><nav class="atlas-places" aria-label="Map destinations">${places.map(place=>`<button class="primary-button" data-map-place="${place.id}">${icon(place.icon)}<span>${place.label}</span></button>`).join('')}</nav><div class="atlas-legend"><span>${icon('user')} You & party</span><span>${icon('user')} Villages</span><span>${icon('book')} Quest boards</span><span>${icon('beacon')} Landmarks</span><span>${icon('boss')} Dungeons & world bosses</span>${treasureMapSearchArea(player)?`<span>${icon('map')} Gold circle · Treasure search area</span>`:''}</div>`;
 try{atlas=createWorldMap($<HTMLCanvasElement>('world-map'),{onSelect:selectMapPoint});}catch(error){console.error('Map renderer could not start',error);$('atlas-selection').textContent='The map could not open';$('atlas-description').textContent='Close it and try again.';return;}
 $('atlas-center').onclick=()=>atlas?.focusPlayer();$('atlas-zoom-in').onclick=()=>atlas?.zoomBy(1.25);$('atlas-zoom-out').onclick=()=>atlas?.zoomBy(.8);
 $('atlas-travel').onclick=()=>{clearWaypoint();if(mapSelection)selectMapPoint(mapSelection,false);};
 document.querySelectorAll<HTMLButtonElement>('[data-map-place]').forEach(button=>button.onclick=()=>{const id=button.dataset.mapPlace!;if(worldInstance){const room=dungeonStages(dungeon?.kind).find(room=>room.id===id)!;selectMapPoint({x:room.x,z:room.z,label:room.name});}else{const entry=DUNGEONS.find(entry=>id===`dungeon-${entry.id}`);if(entry){selectMapPoint({...entry.entrance,id:entry.id==='rootvault'?'dungeon-entrance':`dungeon-entrance-${entry.id}`,label:entry.name});return;}const cityPlace=cityDestinations.find(place=>place.id===id);if(cityPlace){selectMapPoint(cityPlace);return;}const boss=WORLD_BOSSES.find(boss=>boss.id===id);if(boss){selectMapPoint({...OVERWORLD_SPAWNS.find(spawn=>spawn.id===boss.id)!,label:boss.name});return;}const village=VILLAGES.find(v=>v.id===id);if(village){selectMapPoint({...village,label:village.name});return;}const expedition=[...WILD_BIOMES,...RESOURCE_SITES,...EXPEDITIONS].find(region=>region.id===id);if(expedition){selectMapPoint({...expedition,label:expedition.name});return;}const zone=id as ZoneId;selectMapPoint({...toWorld(zone,{x:3,z:2}),id:`board-${zone}`,zone,label:`${getZone(zone).name} quest board`});}});
 selectMapPoint(waypoint?.instanceId===worldInstance?waypoint:{x:position.x,z:position.z,zone:worldZone,label:isInstantCombatInstance(worldInstance)?'Your Instant Combat arena':isArenaInstance(worldInstance)?'Your arena match':worldInstance?'Your expedition':'Your adventurer'},false);atlas.resize();renderAtlas();
}
let selectedPet:PetId|undefined,selectedCollectionMount:MountId|undefined;
const collectionFilters={search:'',collectedOnly:false};
let collectionPreview:ReturnType<typeof createCollectionPreview>|undefined;
function disposeCollectionPreview(){collectionPreview?.dispose();collectionPreview=undefined;}
function openCollection(mode:'pets'|'mounts'){
 if(!player?.characterCreated||entryActive||rosterActive||mode==='mounts'&&!allowFeature('mounts'))return;
 openPanel('Mounts & pets','YOUR COMPANIONS',mode);
 petPanelKey='';mountPanelKey='';
 if(mode==='pets')renderPets();else renderMounts();
}
function openPets(){if(panel.open&&panel.dataset.mode==='pets'){closePanel();return;}openCollection('pets');}
function renderCollectionContent(html:string){
 const content=$('panel-content'),stage=content.querySelector<HTMLElement>('#collection-stage');
 const listScroll=content.querySelector('.collection-list')?.scrollTop??0,contentScroll=content.scrollTop;
 const search=content.querySelector<HTMLInputElement>('[data-collection-search]'),searchFocused=document.activeElement===search,selection=search?[search.selectionStart,search.selectionEnd] as const:null;
 const filterFocused=document.activeElement===content.querySelector('[data-collection-collected]');
 const identity=['data-pet-action','data-pet-loot-quality','data-collection-select','data-collection-tab','data-prefer-mount','data-ride-mount','data-claim-nft-pet','data-claim-nft-mount','data-learn-mount'];
 const controls=identity.map(attribute=>`[${attribute}]`).join(',');
 const retained=[...content.querySelectorAll<HTMLButtonElement|HTMLSelectElement>(controls)];
 const focused=document.activeElement,focusedSummary=focused?.tagName==='SUMMARY'?focused.parentElement?.id:undefined;
 const details=[...content.querySelectorAll<HTMLDetailsElement>('details[id]')].map(detail=>[detail.id,detail.open] as const);
 const template=document.createElement('template');template.innerHTML=html;
 const nextStage=template.content.querySelector<HTMLElement>('#collection-stage');
 if(stage&&nextStage&&collectionPreview){
  const nextCanvas=nextStage.querySelector('canvas')!,canvas=stage.querySelector('canvas')!;
  canvas.dataset.kind=nextCanvas.dataset.kind;canvas.dataset.id=nextCanvas.dataset.id;canvas.setAttribute('aria-label',nextCanvas.getAttribute('aria-label')!);
  const image=stage.querySelector('img'),nextImage=nextStage.querySelector('img');
  if(image&&nextImage){image.src=nextImage.src;image.alt=nextImage.alt;}
  nextStage.replaceWith(stage);
 }
 localization.translate(template.content);
 for(const old of retained){
  const attribute=identity.find(attribute=>old.hasAttribute(attribute))!;
  const next=[...template.content.querySelectorAll<HTMLButtonElement|HTMLSelectElement>(controls)].find(button=>attribute==='data-ride-mount'?button.hasAttribute(attribute):button.getAttribute(attribute)===old.getAttribute(attribute));
  if(next?.isEqualNode(old))next.replaceWith(old);
  else if(old===focused&&next)next.dataset.restoreFocus='';
 }
 if(!nextStage&&collectionPreview)disposeCollectionPreview();
 content.replaceChildren(template.content);content.scrollTop=contentScroll;
 if(searchFocused){const next=content.querySelector<HTMLInputElement>('[data-collection-search]');next?.focus({preventScroll:true});if(selection)next?.setSelectionRange(...selection);}
 else if(filterFocused)content.querySelector<HTMLInputElement>('[data-collection-collected]')?.focus({preventScroll:true});
 const list=content.querySelector('.collection-list');if(list)list.scrollTop=listScroll;
 for(const [id,open] of details){const detail=document.getElementById(id);if(detail instanceof HTMLDetailsElement)detail.open=open;}
 if(focused instanceof HTMLElement&&content.contains(focused))focused.focus({preventScroll:true});
 else if(focusedSummary)document.getElementById(focusedSummary)?.querySelector('summary')?.focus({preventScroll:true});
 else {const next=content.querySelector<HTMLElement>('[data-restore-focus]');next?.focus({preventScroll:true});next?.removeAttribute('data-restore-focus');}
 const canvas=content.querySelector<HTMLCanvasElement>('#collection-preview');
 if(canvas){try{collectionPreview??=createCollectionPreview(canvas);collectionPreview.show(canvas.dataset.kind==='mounts'?'mounts':'pets',canvas.dataset.id!,canvas.dataset.id==='death-apostle'?player?.raidProgress?.petEvolution:0);}catch(error){canvas.parentElement?.classList.remove('is-ready');console.warn('Collection preview unavailable; showing portrait.',error);}}
}
let petPanelKey='';
function renderPets(){
 if(!player)return;
 selectedPet??=player.summonedPet??player.ownedPets?.[0]??player.nftPets?.[0];
 const serverNow=Date.now()+serverOffset,companion=player.combatCompanion;
 const key=JSON.stringify([player.id,collectionFilters,selectedPet,player.raidProgress?.petEvolution,player.ownedPets,player.nftPets,player.ownedMounts,player.nftMounts,player.nftConfigured,player.nftMintablePets,player.summonedPet,player.petLootMinQuality,player.carriedItems,player.hp,player.zeppelin,connected,player.appearance.className,player.talents,player.tamedCompanion,companion&&[companion.kind,companion.level,companion.hp,companion.maxHp,!!companion.targetId,companion.bondReady],Math.max(0,Math.ceil(((player.combatCompanionRecallAt??0)-serverNow)/1000)),player.travel?.mount,player.gm?.invisible]);if(key===petPanelKey)return;petPanelKey=key;
 renderCollectionContent(renderPetCollection(player,connected,serverNow,selectedPet,collectionFilters));
}
const petsButton=document.createElement('button');petsButton.id='pets-button';petsButton.type='button';petsButton.innerHTML=icon('menu-pets')+'<kbd data-binding-key="v"></kbd>';petsButton.dataset.bindingTitle='v';petsButton.dataset.bindingName='Pets';$('achievements-button').before(petsButton);refreshBindingHints();petsButton.onclick=openPets;
let preferredMount:MountId=MOUNTS.find(mount=>mount.id===readLocal('mossvale-mount'))?.id??'horse';
function availableMounts(p:Player){return [...new Set([...(p.ownedMounts||[]),...(p.nftMounts||[])])];}
function activeMount(p:Player|undefined,swimming:boolean):MountId|null {return p&&p.hp>0&&!p.instanceId&&!p.zeppelin&&!swimming?p.travel?.mount??null:null;}
function gmFlying(){return connected&&player?.role==='gm'&&player.gm?.flying===true;}
function travelSpeed(){
 if(player?.travel?.driverId)return 0;
 if(gmFlying())return GM_FLY_SPEED;
 const now=Date.now()+serverOffset,status=player?.duelStatus;
 if(status&&status.stunUntil>now)return 0;
 const cast=player?.casting,castSpeed=cast&&cast.ability!=='mount'&&cast.startedAt!==cancelledCast&&cast.endsAt>now?SPELLS[cast.ability].castMoveMultiplier??1:1;
 const spellSpeed=(player?.combatTalents?.movementSpeedUntil??0)>now?player?.combatTalents?.movementSpeedMultiplier??1:1;
 const multiplier=(status&&status.slowUntil>now?status.slowMultiplier:1)*(player&&!player.travel?.mount?gearSpeedMultiplier(player):1)*castSpeed*spellSpeed;
 if(localSwimming())return (keys.has('shift')&&canSprint(player?.travel)?SWIM_SPRINT_SPEED:SWIM_SPEED)*multiplier;
 if(player?.travel?.mount&&!worldInstance)return mountSpeed(player.level,player.ridingRank)*multiplier;
 return (keys.has('shift')&&canSprint(player?.travel)?SPRINT_SPEED:WALK_SPEED)*multiplier;
}
function updateMountView(id:string,mount:MountId|null,rider:THREE.Group,moving:boolean,time:number,upgraded:boolean,air?:JumpState){
 let view=mountViews.get(id);
 if(view?.id!==mount){if(view)disposeMount(view.mesh);mountViews.delete(id);view=undefined;}
 if(!mount)return;
 if(!view){view={id:mount,mesh:makeMount(mount)};mountViews.set(id,view);scene.add(view.mesh);rider.position.y=(air?.y??surfaceHeight(rider.position.x,rider.position.z,false))+mountRiderOffset(rider,mount);}
 view.mesh.position.set(rider.position.x,rider.position.y-mountRiderOffset(rider,mount),rider.position.z);view.mesh.rotation.y=rider.rotation.y;
 view.mesh.userData.moving=moving;view.mesh.userData.upgraded=upgraded;view.mesh.userData.jump=air;
 animateMount(view.mesh,time,moving,upgraded,rider,air,graphics.effects,graphics.bloom);
}
function toggleMount(mount=preferredMount){
 if(player?.zeppelin)return;
 if(!player||!connected||player.hp<=0)return;
 if(player.travel?.driverId){send({type:'mountLeave'});return;}
 if(!jump.grounded){toast('Land before changing mounts.');return;}
 if(!player.travel?.mount&&!availableMounts(player).includes(mount))mount=availableMounts(player)[0]||mount;
 if(!player.travel?.mount&&(!player.ridingRank||!availableMounts(player).includes(mount))){openMounts();return;}
 send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
 send({type:'mount',mount:player.travel?.mount?null:mount});
}
let zeppelins:Awaited<ReturnType<typeof createZeppelins>>|undefined;
const flightStatus=document.createElement('div');flightStatus.id='zeppelin-status';flightStatus.hidden=true;flightStatus.setAttribute('role','status');document.body.append(flightStatus);
let flightStatusText='';
function canUseZeppelinDock(port:{x:number;z:number}){
 return !!player&&connected&&worldReady&&player.hp>0&&!player.zeppelin&&!worldInstance&&jump.grounded&&!gmFlying()&&Math.hypot(position.x-port.x,position.z-port.z)<=8;
}
function zeppelinMarker(from:ZoneId){
 const port=zeppelinPort(from)!,el=label(`zeppelin-${from}`,'Zeppelin passage','Visit and claim this dock');el.ariaHidden='false';
 const button=document.createElement('button');button.type='button';button.className='npc-quest zeppelin-discover';button.dataset.zeppelinDiscover=from;
 button.textContent='!';button.ariaLabel=`Discover ${port.name} sky dock`;button.title=`Discover ${port.name} sky dock`;
 button.hidden=!player||player.zeppelinPorts?.includes(from)===true;button.disabled=!canUseZeppelinDock(port);
 button.onpointerdown=event=>event.stopPropagation();button.onclick=event=>{event.stopPropagation();openZeppelin(from);};el.prepend(button);return el;
}
function updateZeppelinDiscovery(){
 for(const marker of zoneMarkers){
  const button=marker.el.querySelector<HTMLButtonElement>('[data-zeppelin-discover]');if(!button)continue;
  const port=zeppelinPort(button.dataset.zeppelinDiscover)!;const discovered=player?.zeppelinPorts?.includes(port.id)===true;
  button.hidden=!player||discovered;button.disabled=!canUseZeppelinDock(port);
  const subtitle=marker.el.querySelector('small'),text=discovered?`${player?.economyVersion===1?`${GOLD_ZEPPELIN_COST} gold per flight`:'Free flights'} · ${bindingLabel('e')} to choose destination`:'Visit and claim this dock';if(subtitle&&subtitle.textContent!==text)subtitle.textContent=text;
 }
 if(panel.open&&panel.dataset.mode==='zeppelin'){
  const from=panel.dataset.zeppelinFrom as ZoneId,port=zeppelinPort(from);
  if(!port||!canUseZeppelinDock(port)){closePanel();return;}
  if(panel.dataset.zeppelinPorts!==JSON.stringify([player?.id,player?.zeppelinPorts??[]]))openZeppelin(from,false);
 }
}
function openZeppelin(from:ZoneId,discover=true){
 const port=zeppelinPort(from);
 if(!port||!player)return;
 if(!canUseZeppelinDock(port)){toast('Stand on the ground near the sky dock to use it.');return;}
 const discovered=player.zeppelinPorts??[],known=discovered.includes(from);
 if(!known&&discover){send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();send({type:'zeppelinDiscover',port:from});}
 clearMovementKeys();openPanel('Zeppelin passage',port.name.toUpperCase(),'zeppelin');
 panel.dataset.zeppelinFrom=from;panel.dataset.zeppelinPorts=JSON.stringify([player.id,discovered]);
 $('panel-content').innerHTML=`<p role="status">${known?(player.economyVersion===1?`Choose a discovered city. Passage costs ${GOLD_ZEPPELIN_COST} gold. You have ${player.gold} gold.`:'Choose a discovered city. Passage is free.'):'Discovering this dock…'}</p><div class="zeppelin-destinations">${ZEPPELIN_PORTS.filter(p=>p.id!==from).map(p=>`<button class="primary-button" data-zeppelin-to="${p.id}" ${known&&discovered.includes(p.id)&&(player!.economyVersion!==1||player!.gold>=GOLD_ZEPPELIN_COST)?'':'disabled'}><span>${p.name}</span><small>${discovered.includes(p.id)?`${Math.ceil((createZeppelinFlight(from,p.id,0)!.arrivesAt)/1000)} seconds`:'Visit to unlock'}</small></button>`).join('')}</div>`;
 document.querySelectorAll<HTMLButtonElement>('[data-zeppelin-to]').forEach(button=>button.onclick=()=>{
  const to=button.dataset.zeppelinTo as ZoneId;
  if(!player||!canUseZeppelinDock(port)){closePanel();return;}
  if(button.disabled||!player.zeppelinPorts?.includes(from)||!player.zeppelinPorts.includes(to))return;
  send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
  send({type:'zeppelinBoard',from,to});closePanel();clearMovementKeys();canvas.focus();
 });
}
function updateZeppelinTravel(now:number){
 const flight=player?.zeppelin;
 flightStatus.hidden=!flight||!connected||rosterActive||entryActive;
 if(flight){
  const pose=zeppelinPose(flight,now);position.set(pose.x,pose.y,pose.z);rotation=pose.rotation;
  jump.y=pose.y;jump.velocity=0;jump.grounded=false;clearMovementKeys();
  const text=`${zeppelinPort(flight.to)!.name} · ${Math.max(0,Math.ceil((flight.arrivesAt-now)/1000))}s`;
  if(text!==flightStatusText){flightStatusText=text;flightStatus.replaceChildren(document.createTextNode(text));const note=document.createElement('small');note.textContent='Zeppelin passage · Arriving automatically';flightStatus.append(note);}
 }
 zeppelins?.update(now,position,player?[...players.filter(p=>p.id!==playerId),player]:[],!worldInstance&&!entryActive&&!rosterActive);
}
let travelHUDKey='',mountPanelKey='';
function updateTravelHUD(){
 if(!player)return;
 $('mobile-sprint').setAttribute('aria-pressed',String(keys.has('shift')));
 $('mobile-mount').dataset.mobileLabel=player.travel?.mount?'Dismount':'Mount';
 $('mobile-clear').hidden=!selectedId&&!autoAttackTarget&&!player.casting&&!player.gathering;
 const interaction=nearbyInteraction();
 const usable=!!interaction&&interaction.kind!=='enemy'&&!zoneHandle?.citizens?.has(interaction.id)&&(interaction.kind==='player'||(interaction.kind==='zeppelin'?canUseZeppelinDock(interaction):Math.hypot(interaction.x-position.x,interaction.z-position.z)<=3));
 $('mobile-interact').hidden=!usable;
 $('mobile-interact').querySelector('span:last-child')!.textContent=interaction?.kind==='loot'?'Loot':interaction?.kind==='node'?'Gather':interaction?.kind==='npc'?'Talk':interaction?.kind==='player'?'Player':'Use';
 $('mobile-interact').setAttribute('aria-label',usable?interaction!.label:'Use nearby object');
 $('mobile-attack').setAttribute('aria-pressed',String(!!autoAttackTarget));
 $('mobile-attack').querySelector('span:last-child')!.textContent=autoAttackTarget?'Stop':'Attack';
 $('mobile-mount').querySelector('span:last-child')!.textContent=player.travel?.mount?'Dismount':'Mount';
 const staminaValue=player.travel?.stamina??STAMINA_MAX,stamina=Math.round(staminaValue),showStamina=!!jump.climb||staminaValue<=99||document.body.classList.contains('mobile-controls'),mount=activeMount(player,localSwimming());
 const climbing=!!jump.climb,swimming=localSwimming(),sprinting=isMoving&&!climbing&&!mount&&keys.has('shift')&&canSprint(player.travel);
 const key=JSON.stringify([stamina,showStamina,mount,sprinting,swimming,climbing,player.travel?.exhausted,player.level,player.ridingRank,player.ownedMounts,player.nftMounts,player.nftMountsConfigured,player.nftMintableMounts,player.hp,connected,preferredMount,worldInstance]);
 if(key!==travelHUDKey){travelHUDKey=key;
  $('travel-hud').hidden=!showStamina;
  $('stamina-fill').style.width=`${stamina}%`;$('stamina-track').setAttribute('aria-valuenow',String(stamina));$('stamina-value').textContent=String(stamina);
  $('stamina-label').textContent=climbing?'Climbing':player.travel?.exhausted?(stamina===0?'Exhausted':'Recovering'):sprinting?swimming?'Swimming':'Sprinting':stamina<STAMINA_MAX?'Recovering':'Ready';
  $('travel-hud').classList.toggle('is-exhausted',!!player.travel?.exhausted);$('travel-hud').classList.toggle('is-sprinting',sprinting);
  $('stamina-track').title=player.travel?.exhausted?'Recover to 25 stamina to sprint again':`Hold ${bindingLabel('shift')} to sprint or swim faster. Stamina recovers after resting.`;
  $('mount-label').textContent=mount?'Dismount':player.level<MOUNT_UNLOCK_LEVEL?'Level 25':'Mount';
  $('mount-button').setAttribute('aria-pressed',String(!!mount));$('sprint-button').setAttribute('aria-pressed',String(sprinting));
  $<HTMLImageElement>('mount-icon').src=`/ui/mount-${mount||preferredMount}.png`;
  $('mount-button').title=mount?`Dismount · ${bindingLabel('h')} · ${mountSpeed(player.level,player.ridingRank)} m/s`:player.level<MOUNT_UNLOCK_LEVEL?'Mounts unlock at level 25':`Ride ${MOUNTS.find(m=>m.id===preferredMount)!.name} · 2s cast · ${bindingLabel('h')}`;
  $<HTMLButtonElement>('sprint-button').disabled=climbing||!!mount||!connected||player.hp<=0;
  $<HTMLButtonElement>('mount-button').disabled=climbing||!connected||player.hp<=0;
 }
 if(panel.open&&panel.dataset.mode==='mounts')renderMounts();
}
function openMounts(){openCollection('mounts');}
function renderMounts(){
 if(!player)return;
 const owned=availableMounts(player);
 if(owned.length&&!owned.includes(preferredMount))preferredMount=owned[0];
 const selected=selectedCollectionMount??preferredMount;
 const key=JSON.stringify([player.id,player.level,player.ridingRank,owned,player.ownedPets,player.nftPets,player.nftMountsConfigured,player.nftMintableMounts,player.carriedItems,player.travel?.mount,preferredMount,selected,collectionFilters,worldInstance,player.hp,player.zeppelin,connected]);if(mountPanelKey===key)return;mountPanelKey=key;
 renderCollectionContent(renderMountCollection(player,connected,selected,preferredMount,!worldInstance,collectionFilters));
}
$('mount-button').onclick=()=>toggleMount();$('mounts-button').onclick=openMounts;
$('minimap-button').onclick=openMap;
$('friends-button').onclick=()=>friendsUI.toggle();
$('achievements-button').onclick=()=>achievementsUI.toggle();
$('crafting-button').onclick=openCrafting;$('party-hud').onclick=openParty;
$('arena-button').onclick=openArena;
window.addEventListener('keydown',e=>{
 if(e.isComposing||e.metaKey)return;
 if(worldLoading){if(e.key==='Escape')e.preventDefault();return;}
 if(e.key==='Escape'&&specialistNftUI?.isOpen()){e.preventDefault();specialistNftUI.close();return;}
 if(e.key==='Escape'&&nftUI.isOpen()){e.preventDefault();nftUI.close();return;}
 if(e.key==='Escape'&&storeUI.isOpen()){e.preventDefault();storeUI.close();return;}
 if(e.key==='Escape'&&achievementsUI.isOpen()){e.preventDefault();achievementsUI.close();return;}
 if(e.key==='Escape'&&friendsUI.isOpen()){e.preventDefault();friendsUI.close();return;}
 if(e.key==='Escape'&&pollUI.isOpen()){e.preventDefault();pollUI.close();return;}
 if(e.key==='Escape'&&panel.open&&(panel.dataset.mode==='training'||panel.dataset.mode==='shop')){e.preventDefault();setAutoAttack(null);closePanel();return;}
 if(e.target instanceof HTMLElement&&e.target.closest('#player-menu, #trade-window, #friends-window, #achievements-window, #store-window, #specialist-nft-window, #poll-window'))return;
 if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement||(e.target instanceof HTMLElement&&e.target.isContentEditable))return;
 if(e.key==='Escape')setAutoAttack(null);
 if((e.target instanceof HTMLButtonElement||e.target instanceof HTMLElement&&e.target.closest('summary'))&&(e.key==='Enter'||e.key===' '))return;
 if(modalOpen())return;
 if(e.key==='Tab'&&(panel.contains(e.target as Node)||e.target instanceof HTMLElement&&e.target.closest('[data-player-id], #loot-window, #chat-preview')))return;
 if(e.ctrlKey&&e.key!=='Control'&&![...heldKeyCodes.keys()].some(code=>code.startsWith('Control')||code==='control')||e.altKey&&e.key!=='Alt'&&![...heldKeyCodes.keys()].some(code=>code.startsWith('Alt')||code==='alt'))return;
 const key=gameKey(e);if(!key)return;e.preventDefault();
 if(key==='escape'&&player?.seated&&standingChairId!==player.seated.chairId){e.preventDefault();standUp();return;}
 if(key==='escape'&&player?.casting&&player.casting.startedAt!==cancelledCast){e.preventDefault();cancelCasting();return;}
 if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright','shift'].includes(key)){e.preventDefault();keys.delete('attack-approach');cancelGathering();hoveredId=null;keys.add(key);heldKeyCodes.set(e.code||e.key.toLowerCase(),key);}
 if(gmFlying()&&(key===' '||key==='control')){e.preventDefault();keys.add(key);heldKeyCodes.set(e.code||e.key.toLowerCase(),key);return;}
 if(e.repeat)return;
 if(key==='escape'&&gmUI.isOpen()){e.preventDefault();gmUI.close();return;}
 if(key==='escape'&&lootUI.isOpen()){e.preventDefault();lootUI.close();return;}
 if(key==='escape'&&bankUI.isOpen()){e.preventDefault();bankUI.close();return;}
 if(key==='escape'&&panel.open&&floatingPanel()){e.preventDefault();closePanel();return;}
 if(key==='escape'){cancelGathering();selectedId=hoveredId=null;return;}
 if(key==='tab'){e.preventDefault();selectNextFoe();return;}
 if(key==='hotbar-page'){hotbar.switchPage();return;}
 if(/^[0-9]$/.test(key)){e.preventDefault();hotbar.activateSlot(key==='0'?9:Number(key)-1,e.code||e.key.toLowerCase());}if(key===' '){e.preventDefault();tryJump();}if(key==='e')act('gather');
 if(key==='t'){e.preventDefault();toggleAutoAttack();}
 if(key==='options'){e.preventDefault();openSettings();return;}
 if(key==='h')toggleMount();
 if(key==='v'){e.preventDefault();openPets();}
 if(key==='u'){e.preventDefault();openArena();}
 if(key==='o'){e.preventDefault();friendsUI.toggle();}
 if(key==='y'){e.preventDefault();achievementsUI.toggle();}
 if(key==='n'){e.preventDefault();toggleTalents();}
 if(key==='c')toggleCharacter();if(key==='b')toggleBackpack();if(key==='j')openContracts();if(key==='p')openParty();if(key==='f')openCrafting();if(key==='m')openMap();if(key==='k')openSkills();
 if(key==='enter'){e.preventDefault();if(chatChannel==='system')selectChatChannel('world');setChatExpanded(true);$<HTMLInputElement>('chat-input').focus();}
});
function selectNextFoe(){
 const foes=targetPoints().filter(p=>isHostileTarget(player,p,players)&&Math.hypot(p.x-position.x,p.z-position.z)<22).sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z));
 selectedId=foes.length?foes[(foes.findIndex(p=>p.id===selectedId)+1)%foes.length].id:null;hoveredId=null;pointerInWorld=false;
}
function toggleAutoAttack(){
 if(autoAttackTarget){setAutoAttack(null);return;}
 const foes=targetPoints().filter(point=>isHostileTarget(player,point,players));
 const target=chooseTarget(foes,null,position,22);
 if(target){pointerInWorld=false;setAutoAttack(target.id);}else toast('No nearby foe.');
}
const canUseMobile=()=>connected&&worldReady&&!modalOpen()&&!!player&&player.hp>0&&!player.zeppelin;
const touchMove=bindJoystick($('mobile-joystick'),keys,canUseMobile,()=>{keys.delete('attack-approach');cancelGathering();hoveredId=null;});
bindTouchActions($('play-ui'));
$('mobile-target').onclick=()=>{if(canUseMobile())selectNextFoe();};
$('mobile-attack').onclick=()=>{if(canUseMobile())toggleAutoAttack();};
$('mobile-interact').onclick=()=>act('interact');
$('mobile-mount').onclick=()=>{setMobileMenus(false);if(canUseMobile())toggleMount();};
$('mobile-clear').onclick=()=>{if(!canUseMobile())return;setAutoAttack(null);cancelCasting();cancelGathering();selectedId=hoveredId=null;};
function setDesktopMenus(open:boolean){
 document.body.classList.toggle('desktop-menus-collapsed',!open);
 const button=$('desktop-menu-toggle');
 button.setAttribute('aria-expanded',String(open));
 button.setAttribute('aria-label',open?'Hide menus':'Show menus');
 button.title=open?'Hide menus':'Show menus';
 button.querySelector('span')!.textContent=open?'Hide':'Menu';
}
setDesktopMenus(readLocal('mossvale-desktop-menus')!=='closed');
$('desktop-menu-toggle').onclick=()=>{
 const open=$('desktop-menu-toggle').getAttribute('aria-expanded')!=='true';
 setDesktopMenus(open);saveLocal('mossvale-desktop-menus',open?'open':'closed');
};
function setMobileMenus(open:boolean){
 if(open){setChatExpanded(false);window.dispatchEvent(new CustomEvent('mobile-ui-open'));}
 document.body.classList.toggle('mobile-menu-open',open);$('mobile-menu-button').setAttribute('aria-expanded',String(open));
 $('mobile-menu-button').querySelector('span:last-child')!.textContent=open?'Back':'Menu';
 const menu=$('game-menus');if(open){menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','true');menu.setAttribute('aria-labelledby','mobile-menu-title');$('mobile-menu-close').focus({preventScroll:true});}else{menu.removeAttribute('role');menu.removeAttribute('aria-modal');menu.removeAttribute('aria-labelledby');if(menu.contains(document.activeElement))$('mobile-menu-button').focus({preventScroll:true});}
}
// Existing windows retain their own state; only the mobile input and HUD visibility are shared.
const mobileWindows=[panel,...document.querySelectorAll<HTMLElement>('#friends-window,#achievements-window,#store-window,#nft-window,#specialist-nft-window,#auction-window,#bank-window,#poll-window,#trade-window,#loot-window,#gm-window,#player-menu')];
function syncMobilePanels(){
 const open=document.body.classList.contains('mobile-controls')&&(customizer.open||mobileWindows.some(el=>el===panel?panel.open:!el.hidden));
 if(open&&!document.body.classList.contains('mobile-panel-open')){setChatExpanded(false);setMobileMenus(false);window.dispatchEvent(new CustomEvent('mobile-ui-open'));}
 document.body.classList.toggle('mobile-panel-open',open);
}
const mobilePanelObserver=new MutationObserver(syncMobilePanels);
for(const element of [...mobileWindows,$('customizer')])mobilePanelObserver.observe(element,{attributes:true,attributeFilter:['hidden','open']});
$('game-menus').append($('mobile-mount'));
$('mobile-mount').dataset.mobileLabel='Mount';
$('mobile-sprint').onclick=()=>{if(!canUseMobile())return;if(keys.has('shift'))keys.delete('shift');else keys.add('shift');};
window.addEventListener('mobile-ui-open',()=>{clearMovementKeys();setAutoAttack(null);cancelCasting();cancelGathering();hotbar.cancel();dragging=false;pointerInWorld=false;hoveredId=null;});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('mobile-menu-open')){event.preventDefault();setMobileMenus(false);event.stopImmediatePropagation();}},true);
$('mobile-menu-close').onclick=()=>setMobileMenus(false);
$('game-menus').addEventListener('keydown',event=>{if(event.key!=='Tab'||!document.body.classList.contains('mobile-menu-open'))return;const buttons=[...$('game-menus').querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button=>button.getClientRects().length);const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
$('mobile-menu-button').onclick=()=>setMobileMenus($('mobile-menu-button').getAttribute('aria-expanded')!=='true');
$('game-menus').addEventListener('click',event=>{if((event.target as HTMLElement).closest('button'))setMobileMenus(false);});
for(const button of document.querySelectorAll<HTMLButtonElement>('#game-menus > button'))button.dataset.mobileLabel=({ 'inventory-button':'Bags','journal-button':'Quests','customize-button':'Character','spells-button':'Skills','talents-button':'Talents','crafting-button':'Craft','raid-button':'Raid','instant-combat-button':'Instant Combat','arena-button':'Arena','pets-button':'Pets','achievements-button':'Achievements','friends-button':'Friends','referrals-button':'Referrals','account-button':'Account','settings-button':'Settings','store-button':'Store','nft-button':'NFTs','mobile-mount':'Mount' } as Record<string,string>)[button.id]||button.title.split(' · ')[0];
if(document.body.classList.contains('mobile-controls'))setChatExpanded(false);
bindTouchCamera(canvas,{
 jump:tryJump,
 enabled:()=>!modalOpen()&&connected&&worldReady,
 orbit:(dx,dy)=>{yaw-=dx*.006;pitch=THREE.MathUtils.clamp(pitch+dy*.004,.18,1.12);pointerInWorld=false;hoveredId=null;},
 zoom:ratio=>{distance=THREE.MathUtils.clamp(distance*ratio,8,37);},
 select:(x,y)=>{const other=pickPlayer(x,y),picked=other?undefined:pickTarget(x,y);selectedId=other?.id||picked?.id||null;hoveredId=null;pointerInWorld=false;},
});
$('jump-button').onclick=()=>{tryJump();canvas.focus();};
window.addEventListener('keyup',e=>{const code=e.code||e.key.toLowerCase(),key=heldKeyCodes.get(code);heldKeyCodes.delete(code);if(key&&![...heldKeyCodes.values()].includes(key))keys.delete(key);});
window.addEventListener('blur',()=>{clearMovementKeys();hotbar.cancel();pointerInWorld=false;hoveredId=null;canvas.style.cursor='var(--cursor-default)';});
document.addEventListener('visibilitychange',()=>{performanceHud.reset();clearMovementKeys();hotbar.cancel();pointerInWorld=false;hoveredId=null;canvas.style.cursor='var(--cursor-default)';});
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button=>{button.onpointerdown=e=>{if(e.button!==0||button.disabled||modalOpen()||!connected||!worldReady)return;e.preventDefault();cancelGathering();keys.add(button.dataset.key!);button.setPointerCapture(e.pointerId);};button.onpointerup=button.onpointercancel=()=>keys.delete(button.dataset.key!);button.onlostpointercapture=()=>keys.delete(button.dataset.key!);});
let dragging=false,dragDistance=0,lastPointerX=0,lastPointerY=0;
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||modalOpen())return;dragging=true;pointerInWorld=true;dragDistance=0;lastPointerX=e.clientX;lastPointerY=e.clientY;canvas.setPointerCapture(e.pointerId);canvas.focus();});
canvas.addEventListener('pointerleave',()=>{pointerInWorld=false;hoveredId=null;lastHover=0;canvas.style.cursor='var(--cursor-default)';});
canvas.addEventListener('pointermove',e=>{hoverPointer.set(e.clientX,e.clientY);pointerInWorld=true;if(!dragging||modalOpen())return;const dx=e.clientX-lastPointerX,dy=e.clientY-lastPointerY;dragDistance+=Math.abs(dx)+Math.abs(dy);yaw-=dx*.006;pitch=THREE.MathUtils.clamp(pitch+dy*.004,.18,1.12);lastPointerX=e.clientX;lastPointerY=e.clientY;});
canvas.addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;if(dragDistance<6&&!modalOpen()&&connected){const other=pickPlayer(e.clientX,e.clientY),picked=other?undefined:pickTarget(e.clientX,e.clientY);selectedId=other?.id||picked?.id||null;hoveredId=null;}});
canvas.addEventListener('pointercancel',()=>{dragging=false;pointerInWorld=false;hoveredId=null;lastHover=0;canvas.style.cursor='var(--cursor-default)';});
canvas.addEventListener('contextmenu',e=>{
 e.preventDefault();if(modalOpen()||!connected||!worldReady)return;
 const other=pickPlayer(e.clientX,e.clientY);if(other){if(isHostilePlayer(player,other))setAutoAttack(other.id);else openPlayerMenu(other,e.clientX,e.clientY);return;}
 playerMenu.close();const point=pickTarget(e.clientX,e.clientY);if(!point)return;
 selectedId=point.id;hoveredId=null;pointerInWorld=false;if(isHostileTarget(player,point,players))setAutoAttack(point.id);else {setAutoAttack(null);act('interact');}
});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(!modalOpen())distance=THREE.MathUtils.clamp(distance+e.deltaY*.014,8,37);},{passive:false});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();clearMovementKeys();toast('Graphics paused. Restoring the world…');});
canvas.addEventListener('webglcontextrestored',()=>location.reload());
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);applyGraphics();resizePreview();atlas?.resize();});
function freeAt(x:number,z:number){
 const to={x,z};
 if(jump.climb||!playerRouteAllowed(position,to))return false;
 if(!(moveJump(jump,position,to,!!worldInstance,currentCollisionScene())))return false;
 // Send the bend before a later straight segment could cut through solid scenery.
 if(lastSentMove&&!(moveJump({...jump,y:lastSentMove.y??jump.y},lastSentMove,to,!!worldInstance,currentCollisionScene()))){send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();}
 return true;
}
function tryClimb(to:{x:number;z:number}){
 if(!CLIMB_ENABLED||!player?.travel||keys.has('attack-approach')||climbStopRequested||!playerRouteAllowed(position,to))return;
 const next={...jump};
 if(!startClimb(next,position,to,player.travel,!!worldInstance,currentCollisionScene()))return;
 send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
 cancelCasting();cancelGathering();setAutoAttack(null);
 jump=next;rotation=jump.climb!.rotation;sprintSinceMove=false;
 send({type:'climb',x:to.x,z:to.z});jumpRequestedAt=performance.now();
}
function releaseClimb(){
 if(!jump.climb||climbStopRequested)return;
 climbStopRequested=true;send({type:'climbStop'});
}
function tryJump(){
 if(!player||!connected||!worldReady||modalOpen()||player.hp<=0||player.arenaMatchId&&(player.arenaPhase!=='active'||player.arenaEliminated))return;
 if(gmFlying()||player?.zeppelin||player?.travel?.driverId)return;
 if(jump.climb){releaseClimb();return;}
 standUp();
 if(!(startJump(jump,position.x,position.z,!!worldInstance,currentCollisionScene())))return;
 cancelCasting();
 cancelGathering();send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=performance.now();
 send({type:'jump'});jumpRequestedAt=performance.now();gameAudio.play('jump');
}
function reconcileJump(authoritative:Player){
 if(authoritative.zeppelin)return;
 const next=authoritative.jump;if(!next)return;
 // Ignore snapshots still in flight at takeoff; a rejected request is restored after the round trip.
 if(next.sequence<jump.sequence&&performance.now()-jumpRequestedAt<1000)return;
 if(jump.climb||next.climb){
  const y=jump.climb&&next.climb&&jump.sequence===next.sequence?Math.max(next.y,Math.min(jump.y,next.y+CLIMB_SPEED*.2)):next.y;
  position.x=authoritative.x;position.z=authoritative.z;lastSentMove={x:authoritative.x,z:authoritative.z,y:next.y};
  jump={...next,y};rotation=next.climb?.rotation??authoritative.rotation;jumpRequestedAt=-Infinity;
  if(!next.climb)climbStopRequested=false;
  return;
 }
 if(next.sequence!==jump.sequence||Math.abs(next.y-jump.y)>3||authoritative.hp<=0){jump={...next};jumpRequestedAt=-Infinity;}
}
function moveGmFlight(dx:number,dz:number,dt:number){
 if(!gmFlying())return false;
 const dy=Number(keys.has(' '))-Number(keys.has('control')),length=Math.hypot(dx,dy,dz);
 if(!length)return false;
 const step=GM_FLY_SPEED*Math.max(0,Math.min(dt,.05))/length,bounds=currentWorldBounds();
 const x=Math.max(bounds.minX,Math.min(bounds.maxX,position.x+dx*step)),z=Math.max(bounds.minZ,Math.min(bounds.maxZ,position.z+dz*step));
 const floor=jumpFloor(x,z,!!worldInstance),currentFloor=jumpFloor(position.x,position.z,!!worldInstance);
 const y=Math.max(currentFloor,Math.min(currentFloor+GM_FLY_MAX_HEIGHT,jump.y+dy*step));
 // Terrain still needs clearance; rise before flying over a higher ridge.
 if(y<floor||y>floor+GM_FLY_MAX_HEIGHT)return false;
 const moved=Math.hypot(x-position.x,y-jump.y,z-position.z)>.001;
 position.x=x;position.z=z;jump.y=y;jump.velocity=0;jump.grounded=false;
 if(dx||dz)rotation=Math.atan2(dx,dz);
 return moved;
}
const labelPosition=new THREE.Vector3();
function placeLabel(el:HTMLElement,x:number,y:number,z:number,range=42){
 if(!visibleInDungeonRoom({x,z})||Math.hypot(x-position.x,z-position.z)>=range){el.style.visibility='hidden';return;}
 labelPosition.set(x,y+surfaceHeight(x,z,!!worldInstance),z).project(camera);
 const visible=labelPosition.z<1&&labelPosition.z>0&&Math.abs(labelPosition.x)<1.1&&Math.abs(labelPosition.y)<1.1;
 el.style.visibility=visible?'visible':'hidden';
 if(visible){el.style.left=`${(labelPosition.x*.5+.5)*innerWidth}px`;el.style.top=`${(-labelPosition.y*.5+.5)*innerHeight}px`;}
}
let previous=performance.now(),elapsed=0,mapTime=0,contractRefresh=0;
let lastGraphicsStatus=autoGraphicsStatus();
const cameraTarget=new THREE.Vector3(0,1.2,8),cameraPosition=new THREE.Vector3();
function frame(now:number){requestAnimationFrame(frame);updateDungeonTimer();instantCombatHUD.update(instantCombat,Date.now()+serverOffset,connected&&!entryActive&&!rosterActive,player);renderInstantCombatMenu();performanceHud.frame(now,worldReady&&!entryActive&&!rosterActive&&!customizer.open&&!atlas&&!document.hidden,connected&&socket?.readyState===WebSocket.OPEN);hotbar.updateCooldowns(Date.now()+serverOffset);updateCastingBar(player,Date.now()+serverOffset,connected&&worldReady&&!rosterActive&&!entryActive&&player?.casting?.startedAt!==cancelledCast);const frameSeconds=Math.max(0,(now-previous)/1000),dt=Math.min(frameSeconds,.05);previous=now;elapsed+=dt;
 const graphicsActive=connected&&worldReady&&!document.hidden&&!atlas&&!modalOpen()&&!mobileWindows.some(el=>el===panel?panel.open:!el.hidden);
 if(updateAutoGraphics(now,graphicsActive))applyGraphics();
 const graphicsStatus=autoGraphicsStatus();
 if(graphicsStatus!==lastGraphicsStatus){lastGraphicsStatus=graphicsStatus;if(graphicsActive&&graphicsStatus)toast(graphicsStatus);}
 if(entryActive)return;
 auctionUI.refresh();
 storeUI.refresh();nftUI.refresh();treasureUI.refresh();goldMerchantUI.refresh();updateStoreBoostHud();
 bankUI.refresh();pollUI.refresh();
 if(panel.open&&panel.dataset.mode==='shop'&&!nearbyMerchant(shopNpcId))closePanel();
 if(panel.open&&panel.dataset.mode==='training'&&!nearbyTrainer())closePanel();
 const flightNow=Date.now()+serverOffset;updateZeppelinTravel(flightNow);
 const charging=!!player?.casting&&player.casting.ability!=='mount'&&(player.casting.ability==='charge'||!!SPELLS[player.casting.ability].movementDurationMs)&&player.casting.endsAt>flightNow&&player.casting.startedAt!==cancelledCast;
 const able=connected&&worldReady&&!modalOpen()&&(player?.hp??0)>0&&!player?.zeppelin&&!player?.travel?.driverId&&!charging&&!(player?.arenaMatchId&&(player.arenaPhase!=='active'||player.arenaEliminated));
 let dx=0,dz=0;
 if(able){
  const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'))-(keys.has('touch-move')?touchMove.y:0);
  const right=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))+(keys.has('touch-move')?touchMove.x:0);
  if(forward||right){standUp();dx=-Math.sin(yaw)*forward+Math.cos(yaw)*right;dz=-Math.cos(yaw)*forward-Math.sin(yaw)*right;}
  if(forward||right||keys.has('touch-move'))keys.delete('attack-approach');
  if(keys.has('attack-approach')){const approach=meleeApproachInput(now);if(approach){dx=approach.x;dz=approach.z;}}
  const length=Math.hypot(dx,dz);if(jump.climb){if(length<.001||(dx*Math.sin(jump.climb.rotation)+dz*Math.cos(jump.climb.rotation))/length<.35)releaseClimb();isMoving=!climbStopRequested;rotation=jump.climb.rotation;}else if(gmFlying())isMoving=moveGmFlight(dx,dz,dt);else if(length>.001){const speed=travelSpeed();const step=speed*dt*Math.min(1,length);dx=dx/length*step;dz=dz/length*step;const oldX=position.x,oldZ=position.z;
   if(freeAt(position.x+dx,position.z+dz)){position.x+=dx;position.z+=dz;}
   else if(Math.abs(dx)>.001&&freeAt(position.x+dx,position.z))position.x+=dx;
   else if(Math.abs(dz)>.001&&freeAt(position.x,position.z+dz))position.z+=dz;
   else tryClimb({x:position.x+dx,z:position.z+dz});
   isMoving=Math.hypot(position.x-oldX,position.z-oldZ)>.001;if(isMoving&&keys.has('shift')&&canSprint(player?.travel)&&!player?.travel?.mount)sprintSinceMove=true;if(isMoving)rotation=Math.atan2(dx,dz);
  }else isMoving=false;
 }else {isMoving=false;releaseClimb();}
 if(jump.climb){isMoving=!climbStopRequested;rotation=jump.climb.rotation;}
 if(worldReady){syncCollisionState();updateDungeonRoomView();}
 if(charging)isMoving=true;
 if(isMoving&&!charging&&(!player?.casting||player.casting.ability==='mount'||!SPELLS[player.casting.ability].castMoveMultiplier))cancelCasting();
 localAvatar.visible=!!player?.characterCreated&&!player.gm?.invisible;
 if(player?.travel?.driverId){position.x=player.x;position.z=player.z;rotation=player.rotation;if(player.jump)jump={...player.jump};}
 // Predict the vertical pull only; the realm alone moves us across the ledge and charges stamina.
 if(jump.climb){if(!climbStopRequested)jump.y=Math.min(jump.climb.topY,jump.y+CLIMB_SPEED*dt);}
 else if(worldReady&&!gmFlying()&&!player?.zeppelin&&!player?.travel?.driverId)stepJump(jump,frameSeconds,jumpFloor(position.x,position.z,!!worldInstance),position,currentCollisionScene());
 const swimming=localSwimming();
 position.y=jump.y;
 if(!player?.seated)standingChairId=null;
 const seated=player?.seated&&standingChairId!==player.seated.chairId&&player.hp>0?player.seated:null;
 const mounted=seated||player?.zeppelin?null:activeMount(player,swimming);
 const mountDriver=player?.travel?.driverId?players.find(p=>p.id===player?.travel?.driverId):player;
 const riderLift=mounted?mountRiderOffset(localAvatar,mounted,!!player?.travel?.driverId):0;
 const hoverLift=mounted==='verdant-revenant'?mountBob(elapsed,isMoving,player?.ridingRank===2,mounted):0;
 if(player?.zeppelin){localAvatar.position.copy(position);localAvatar.rotation.y=rotation;}
 else {localAvatar.position.set(seated?.x??position.x,THREE.MathUtils.lerp(localAvatar.position.y,seated?seated.y-.8:position.y+riderLift,1-Math.exp(-dt*22)),seated?.z??position.z);localAvatar.rotation.y=THREE.MathUtils.lerp(localAvatar.rotation.y,rotation,.25);}
 if(Math.abs(localAvatar.rotation.y-rotation)>Math.PI)localAvatar.rotation.y=rotation;
 if(seated)localAvatar.rotation.y=seated.rotation;
 const gathering=connected&&worldReady&&!modalOpen()&&player?.gathering&&player.gathering.startedAt!==cancelledGather?player.gathering:null;
 if(gathering){const node=nodes.find(n=>n.id===gathering.nodeId);if(node){rotation=Math.atan2((node.waterX??node.x)-position.x,(node.waterZ??node.z)-position.z);localAvatar.rotation.y=rotation;}}
 const localDeath=player&&player.hp<=0?deathProgress(player.diedAt):undefined;
 const attack=mounted||jump.climb||localDeath!==undefined?false:combatPose(playerId,now);if(attack&&!isMoving)localAvatar.rotation.y=attack.rotation;
 if(!player?.travel?.driverId)animateCharacter(localAvatar,elapsed,isMoving,attack,gathering?.skill,swimming,{climbing:!!jump.climb,seated:!!seated,mount:mounted,driverId:player?.travel?.driverId,sprinting:!jump.climb&&!mounted&&keys.has('shift')&&canSprint(player?.travel),exhausted:player?.travel?.exhausted,upgraded:mountDriver?.ridingRank===2,jump:player?.zeppelin?{...jump,grounded:true}:jump},localDeath,emotePlayback(player));
 animateUpgradeEffect(localAvatar,connected&&!!player&&player.hp>0&&!isMoving&&!attack&&!gathering&&!swimming&&!mounted&&!player.travel?.driverId);
 if(localDeath===1&&!deathPresented&&connected&&worldReady&&!rosterActive&&!entryActive){deathPresented=true;openDeath();}
 updateMountView(playerId,player?.travel?.driverId?null:mounted,localAvatar,isMoving,elapsed,player?.ridingRank===2,jump);
 updateTravelHUD();
 const mobileLabels=document.body.classList.contains('mobile-controls')?new Set([...npcViews].sort((a,b)=>a[1].mesh.position.distanceToSquared(position)-b[1].mesh.position.distanceToSquared(position)).slice(0,2).map(([id])=>id)):null;
 for(const [id,view] of npcViews){
  const gap=Math.hypot(view.mesh.position.x-position.x,view.mesh.position.z-position.z);view.mesh.visible=!worldInstance&&gap<Math.min(170,graphics.renderDistance);view.label.hidden=!view.mesh.visible||!!mobileLabels&&id!==selectedId&&!mobileLabels.has(id);
  if(!view.mesh.visible)continue;
  const resident=VILLAGE_NPCS.find(n=>n.id===id)||TRAINER_NPCS.find(n=>n.id===id)||(id===GOLD_MERCHANT.id?GOLD_MERCHANT:id===HEARTHLING_NPC.id?HEARTHLING_NPC:undefined)||CITY_SERVICE_NPCS.find(npc=>npc.id===id);
  if(resident)animateVillager(view.mesh,elapsed,gap<7?Math.atan2(position.x-resident.x,position.z-resident.z):resident.rotation);else animateCharacter(view.mesh,elapsed,false);
  placeLabel(view.label,view.mesh.position.x,id===HEARTHLING_NPC.id?4.95:3.1,view.mesh.position.z,mobileLabels&&id!==selectedId?12:42);
 }
 if(able&&!jump.climb&&now-lastMove>=50){send({type:'move',zone:worldZone,x:position.x,z:position.z,rotation});lastMove=now-(now-lastMove)%50;}
 updateWaypoint();
 const indoors=!player?.zeppelin&&!gmFlying()&&!worldInstance?buildingAt(position.x,position.z):undefined;
 const atAirship=!!player?.zeppelin||!worldInstance&&ZEPPELIN_PORTS.some(port=>Math.hypot(port.x-position.x,port.z-position.z)<12);
 airshipFraming=THREE.MathUtils.damp(airshipFraming,atAirship?1:0,8,dt);
 const viewDistance=(indoors?Math.min(distance,Math.max(indoors.width,indoors.depth)*.65):distance)+25*airshipFraming,viewPitch=THREE.MathUtils.lerp(indoors?Math.max(pitch,.35):pitch,Math.min(pitch,.3),airshipFraming);
 cameraTarget.lerp(new THREE.Vector3(seated?.x??position.x,(swimming?0:position.y)+(swimming?.6:atAirship?6:1.2+riderLift+hoverLift),seated?.z??position.z),1-Math.exp(-dt*8));
 cameraPosition.set(cameraTarget.x+Math.sin(yaw)*Math.cos(viewPitch)*viewDistance,cameraTarget.y+Math.sin(viewPitch)*viewDistance,cameraTarget.z+Math.cos(yaw)*Math.cos(viewPitch)*viewDistance);
 cameraPosition.y=Math.max(cameraPosition.y,surfaceHeight(cameraPosition.x,cameraPosition.z,!!worldInstance)+1.6);
 if(!player?.zeppelin)zoneHandle?.constrainCamera?.(cameraTarget,cameraPosition);
 camera.position.copy(cameraPosition);camera.lookAt(cameraTarget);
 zoneHandle?.setInteriorView?.(position,camera.position);
 const worldTime=dayNight.update(Date.now()+serverOffset,worldZone,!!renderedInstance&&!usesArenaWorld(renderedInstance),position,camera,isRaidInstance(renderedInstance),isInstantCombatInstance(renderedInstance)?instantCombat?.run?.mapId:undefined);applyGraphicsFog();
 const swimmers = swimming && connected && (player?.hp??0)>0 ? [{id:playerId,x:position.x,z:position.z,rotation:localAvatar.rotation.y,moving:isMoving}] : [];
 for(const p of players){
  const entry=remote.get(p.id);if(!entry)continue;
  const passengerPose=p.zeppelin?zeppelinPose(p.zeppelin,flightNow):null;
  const visible=!p.gm?.invisible&&(p.instanceId??null)===worldInstance&&visibleInDungeonRoom(p)&&Math.hypot((passengerPose?.x??p.x)-position.x,(passengerPose?.z??p.z)-position.z)<graphics.renderDistance+32;
  entry.mesh.visible=visible;entry.label.hidden=!visible;
  const mountView=mountViews.get(p.id);if(mountView)mountView.mesh.visible=visible;
  if(!visible)continue;
  const pose=entry.motion.sample(now);
  const moving=!passengerPose&&!p.seated&&p.hp>0&&(!!p.jump?.climb||pose.moving),remoteSwimming=!passengerPose&&(p.jump?.grounded??true)&&!p.instanceId&&waterAt(p.x,p.z)&&(p.jump?.y??jumpFloor(p.x,p.z))<=jumpFloor(p.x,p.z)+.1,mount=activeMount(p,remoteSwimming);
  const lift=mount?mountRiderOffset(entry.mesh,mount,!!p.travel?.driverId):0;
  // Terrain steps have flat tops; only confirmed terrain-supported endpoints follow those tops.
  entry.mesh.position.set(pose.x,(pose.terrainGrounded&&!waterAt(pose.x,pose.z)?groundHeight(pose.x,pose.z):pose.y)+lift,pose.z);
  if(passengerPose){entry.mesh.position.set(passengerPose.x,passengerPose.y,passengerPose.z);}
  const remoteDeath=p.hp<=0?deathProgress(p.diedAt):undefined;
  const attack=mount||p.jump?.climb||remoteDeath!==undefined?false:combatPose(p.id,now);entry.mesh.rotation.y=passengerPose?passengerPose.rotation:p.seated?p.seated.rotation:attack&&!moving?attack.rotation:pose.rotation;
  if(!p.travel?.driverId)animateCharacter(entry.mesh,elapsed,moving,attack,attack?undefined:p.gathering?.skill,remoteSwimming,{...p.travel,climbing:!!p.jump?.climb,seated:!!p.seated,mount,upgraded:p.ridingRank===2,jump:passengerPose?{...p.jump!,grounded:true,velocity:0}:p.jump},remoteDeath,emotePlayback(p));
  updateMountView(p.id,p.travel?.driverId?null:mount,entry.mesh,moving,elapsed,p.ridingRank===2,p.jump);
  placeLabel(entry.label,entry.mesh.position.x,(remoteSwimming?2.5:3.3)+lift+(mount==='verdant-revenant'?mountBob(elapsed,moving,p.ridingRank===2,mount):0)+Math.max(0,entry.mesh.position.y-lift-surfaceHeight(entry.mesh.position.x,entry.mesh.position.z,!!p.instanceId)),entry.mesh.position.z,!worldInstance&&inColosseumClearing(position.x,position.z)?COLOSSEUM.outerRadius*2:64);
  if(remoteSwimming&&p.hp>0&&Math.hypot(p.x-position.x,p.z-position.z)<64)swimmers.push({id:p.id,x:entry.mesh.position.x,z:entry.mesh.position.z,rotation:entry.mesh.rotation.y,moving});
 }
 // Share the rendered mount transform so network interpolation cannot separate its two riders.
 for(const passenger of players){
  const driverId=passenger.travel?.driverId;if(!driverId)continue;
  const mount=mountViews.get(driverId),rider=passenger.id===playerId?localAvatar:remote.get(passenger.id)?.mesh;
  if(!mount||!rider)continue;
  rider.position.copy(mount.mesh.position);rider.position.y+=mountRiderOffset(rider,mount.id,true);rider.rotation.y=mount.mesh.rotation.y;
  animateCharacter(rider,elapsed,mount.mesh.userData.moving,false,undefined,false,{...passenger.travel,mount:mount.id,upgraded:mount.mesh.userData.upgraded,jump:mount.mesh.userData.jump},undefined,emotePlayback(passenger));
 }
 const petOwners:PetFollowerOwner[]=[],companionOwners:CombatCompanionOwner[]=[];
 if(connected&&worldReady&&!entryActive&&!rosterActive){
  if(player?.combatCompanion&&player.hp>0&&!player.zeppelin&&!player.gm?.invisible)companionOwners.push(player);
  for(const p of players)if(p.id!==playerId&&p.combatCompanion&&p.hp>0&&!p.zeppelin&&!p.gm?.invisible&&(p.instanceId??null)===worldInstance&&remote.get(p.id)?.mesh.visible)companionOwners.push(p);
  if(player?.summonedPet&&player.hp>0&&!player.zeppelin&&!player.gm?.invisible)petOwners.push({id:playerId,pet:player.summonedPet,evolution:player.raidProgress?.petEvolution,x:position.x,z:position.z,rotation,petPosition:player.petPosition});
  for(const p of players){const entry=remote.get(p.id);if(p.id!==playerId&&p.summonedPet&&p.hp>0&&!p.zeppelin&&!p.gm?.invisible&&(p.instanceId??null)===worldInstance&&entry?.mesh.visible)petOwners.push({id:p.id,pet:p.summonedPet,evolution:p.raidProgress?.petEvolution,x:entry.mesh.position.x,z:entry.mesh.position.z,rotation:entry.mesh.rotation.y,petPosition:p.petPosition});}
 }
 petFollowers.update(petOwners,dt,elapsed);
 combatCompanions.update(companionOwners,dt,elapsed,Date.now()+serverOffset);
 updateThrownShield(Date.now()+serverOffset);
 zoneHandle?.setInstantCombatState?.(instantCombat,Date.now()+serverOffset);
 zoneHandle?.setRaidState?.(raid,Date.now()+serverOffset,players);raidHUD.update(raid,playerId,Date.now()+serverOffset,connected&&!entryActive&&!rosterActive);renderRaidMenu();
 zoneHandle?.setSwimmers?.(swimmers);updateWorld(elapsed,position,camera,worldTime.daylight);storyWorld?.update(connected&&!rosterActive?player:undefined,storyEncounter,elapsed,position);
 ambientEffects.update(elapsed,{position,zone:worldZone,dungeon:!!worldInstance,daylight:worldTime.daylight,moving:isMoving,sprinting:!jump.climb&&!mounted&&keys.has('shift')&&canSprint(player?.travel),mounted:!!mounted,grounded:jump.grounded,swimming,indoors:!!indoors,active:connected&&worldReady&&!entryActive&&!rosterActive&&!customizer.open&&!atlas&&!document.hidden});
 const monsterNow=Date.now()+serverOffset;
 for(const hazard of dungeon?.hazards??[])if(hazard.sourceId)dungeonAttackCues.set(hazard.id,hazard);
 for(const [id,cue] of dungeonAttackCues){
  const source=enemies.find(enemy=>enemy.id===cue.sourceId);
  const cancelledByDeath=source&&!source.alive&&!(dungeon?.kind&&dungeonDeathHazardPattern(dungeon.kind,source));
  if(!worldInstance||!source||cancelledByDeath||monsterNow>cue.endsAt+450||cue.endsAt>monsterNow&&!dungeon?.hazards.some(h=>h.id===id))dungeonAttackCues.delete(id);
 }
 const dungeonEffects=[...dungeonAttackCues.values()].flatMap(cue=>{const source=enemies.find(enemy=>enemy.id===cue.sourceId);return source?[{...source,alive:true,attack:dungeonHazardAttack(cue,source)}]:[];});
 const mapTarget=connected&&worldReady&&!rosterActive&&!entryActive&&!worldInstance?treasureMapTarget(player,position):undefined;
 treasureMapMarker.update(mapTarget,player?.treasureMap?.stage,(x,z)=>surfaceHeight(x,z,false));
 treasureMapLabel.hidden=!mapTarget;
 if(mapTarget){if(treasureMapLabelText!==mapTarget.name){treasureMapLabel.querySelector('strong')!.textContent=mapTarget.name;treasureMapLabelText=mapTarget.name;}placeLabel(treasureMapLabel,mapTarget.x,mapTarget.height,mapTarget.z,42);}
 treasureEffects.update(connected&&worldReady&&!rosterActive?enemies.filter(visibleInDungeonRoom):[],monsterNow,(x,z)=>surfaceHeight(x,z,!!worldInstance));
 monsterEffects.update(connected&&worldReady&&!rosterActive?[...enemies,...dungeonEffects].filter(enemy=>visibleInDungeonRoom(enemy)&&enemy.raidVisual!=='approach'&&enemy.raidVisual!=='morgrath'):[],monsterNow);
 for(const e of enemies){
  const view=enemyMeshes.get(e.id);if(!view)continue;
  if(!visibleInDungeonRoom(e)){view.mesh.visible=false;view.label.hidden=true;continue;}
  view.label.hidden=false;
  const death=e.alive?undefined:deathProgress(e.diedAt,monsterNow);view.mesh.visible=e.alive||(death!==undefined&&death<1);
  if(!view.mesh.visible)continue;
  const moving=Math.hypot(view.mesh.position.x-e.x,view.mesh.position.z-e.z)>.03;
  view.mesh.position.lerp(new THREE.Vector3(e.x,surfaceHeight(e.x,e.z,!!e.instanceId),e.z),Math.min(1,dt*12));
  const cue=e.alive?[...dungeonAttackCues.values()].find(cue=>cue.sourceId===e.id):undefined;
  const raidCue=raidCastCue(raid,e,monsterNow);
  const attack:Enemy['attack']=raidCue?{id:raidCue.id,style:raidCue.style,basic:raidCue.basic,startedAt:raidCue.startedAt,impactAt:raidCue.impactAt,endsAt:raidCue.endsAt,x:e.x,z:e.z,rotation:raidCue.rotation,radius:0,targetId:'',name:raidCue.kind}:cue?dungeonHazardAttack(cue,e):e.alive&&e.attack&&monsterNow<e.attack.endsAt?e.attack:null;
  view.mesh.rotation.y=attack&&!attack.basic?attack.rotation:(e.rotation??view.mesh.rotation.y);
  const duration=attack?Math.max(1,attack.endsAt-attack.startedAt):1;
  animateEnemy(view.mesh,elapsed,moving,raidCue??instantCombatCastCue(instantCombat,e,monsterNow)??(attack?{style:cue?.leap?'leap':attack.style,progress:Math.max(0,(monsterNow-attack.startedAt)/duration),impactProgress:(attack.impactAt-attack.startedAt)/duration,chargeProgress:attack.chargeAt===undefined?undefined:(attack.chargeAt-attack.startedAt)/duration,basic:attack.basic}:undefined),death);
  const dots=view.label.querySelector<HTMLElement>('.enemy-dots')!,dotText=e.alive?damageOverTimeLabels(e.damageOverTime,playerId,monsterNow,e.chilledUntil):'';
  if(dots.textContent!==dotText)dots.textContent=dotText;dots.hidden=!dotText;
  const cast=view.label.querySelector<HTMLElement>('.enemy-cast')!;cast.hidden=!attack||!!attack.basic||monsterNow>=attack.impactAt;
  if(attack&&!attack.basic){cast.title=attack.description||'';cast.querySelector('i')!.style.width=`${Math.min(100,Math.max(0,(monsterNow-attack.startedAt)/(attack.impactAt-attack.startedAt)*100))}%`;cast.querySelector('b')!.textContent=attack.name||monsterAttackNames[attack.style]||'Attack';}
  if(e.treasure&&e.alive){const end=e.treasure.escapeAt??e.treasure.portalAt!+3000;const seconds=Math.max(0,Math.ceil((end-monsterNow)/1000));view.label.classList.add('treasure-goblin');view.label.querySelector('small')!.textContent=`Lv ${e.level} · ${e.treasure.escapeAt?`Escapes in ${seconds}s`:'Loot goblin'}`;if(e.treasure.escapeAt||monsterNow>=e.treasure.portalAt!){cast.hidden=false;cast.querySelector('i')!.style.width=`${Math.max(0,Math.min(100,(end-monsterNow)/30000*100))}%`;cast.querySelector('b')!.textContent=monsterNow>=e.treasure.portalAt!?'Opening escape portal':`Escapes in ${seconds}s`;}}
  placeLabel(view.label,view.mesh.position.x,view.height+.35,view.mesh.position.z,e.worldBoss?90:42);
 }
 for(const drop of loot){const entry=lootMeshes.get(drop.id);if(!entry)continue;entry.mesh.visible=visibleInDungeonRoom(drop)&&deathProgress(drop.diedAt,monsterNow)===1;entry.label.hidden=!entry.mesh.visible;if(entry.mesh.visible)placeLabel(entry.label,entry.mesh.position.x,entry.height,entry.mesh.position.z);}
 combatEffects.update(now/1000);
 damageNumbers.update(now,position,innerWidth,innerHeight);
 for(const [id,attack] of combatAnimations)if(now-attack.started>2500)combatAnimations.delete(id);
 placeLabel(ownLabel,seated?.x??position.x,(swimming?2:player?.equipment.head?3.4:2.8)+riderLift+hoverLift+Math.max(0,jump.y-surfaceHeight(position.x,position.z,!!worldInstance)),seated?.z??position.z);updateRaidNameplate(ownLabel,playerId);ownLabel.hidden=!player?.characterCreated||!!player.gm?.invisible;
 for(const marker of zoneMarkers){
  const storyModel=storyWorld?.models.get(marker.id);
  if(storyModel){marker.el.hidden=!storyModel.visible;const subtitle=marker.el.querySelector('small');if(subtitle)subtitle.textContent=storyModel.userData.storyStatus;placeLabel(marker.el,storyModel.position.x,3,storyModel.position.z,32);continue;}
  const gate=worldInstance&&!usesArenaWorld(worldInstance)&&!isRaidInstance(worldInstance)?dungeonLayout(worldDungeonKind??'rootvault').gates.find(gate=>gate.id===marker.id):undefined;
  const portal=worldInstance&&!usesArenaWorld(worldInstance)&&!isRaidInstance(worldInstance)?dungeonLayout(worldDungeonKind??'rootvault').portals.find(portal=>portal.id===marker.id):undefined;
  if(portal){
   const open=!!dungeon?.dream||dungeonRoomPortalOpen(portal,dungeon?.clearedStages??[],dungeon?.objects.filter(object=>object.activated||object.opened).map(object=>object.id)??[]);
   const title=open?`${bindingLabel('e')} · Next room`:'Sealed',subtitle=open?portal.label:portal.seals?.length?'Clear enemies and activate the seals':'Defeat enemies to unlock';
   const strong=marker.el.querySelector('strong')!,small=marker.el.querySelector('small')!;
   if(strong.textContent!==title)strong.textContent=title;if(small.textContent!==subtitle)small.textContent=subtitle;
  }
  marker.el.hidden=marker.id==='dungeon-return'&&!dungeon?.completed||!!gate&&dungeonGateOpen(gate,dungeon?.clearedStages??[],dungeon?.objects.filter(object=>object.activated||object.opened).map(object=>object.id)??[]);
  placeLabel(marker.el,marker.x,gate?4.8:portal?2.5:3.6,marker.z,gate?18:42);
 }
 updateZeppelinDiscovery();
 if(now-mapTime>100){updateAudioScene(now);const clockText=`${worldTime.label} · ${worldTime.phase}`;if($('world-time').textContent!==clockText)$('world-time').textContent=clockText;renderMinimap();mapTime=now;$('game').dataset.position=`${position.x.toFixed(2)},${position.z.toFixed(2)}`;$('game').dataset.connected=String(connected);$('game').dataset.summonedPet=player?.summonedPet||'';$('game').dataset.petCount=String(petFollowers.size);$('game').dataset.combatCompanionCount=String(combatCompanions.size);$('game').dataset.zone=worldZone;$('game').dataset.swimming=String(swimming);$('game').dataset.airborne=String(!jump.grounded);$('game').dataset.climbing=String(!!jump.climb);$('game').dataset.height=jump.y.toFixed(2);$('game').dataset.jumpHeight=Math.max(0,jump.y-jumpFloor(position.x,position.z,!!worldInstance)).toFixed(2);$('game').dataset.mounted=mounted||'';$('game').dataset.sprinting=String(isMoving&&!jump.climb&&!mounted&&keys.has('shift')&&canSprint(player?.travel));$('movement-state').textContent=player?.zeppelin?'Zeppelin passage':gmFlying()?`GM flight · ${bindingLabel(' ')} up · ${bindingLabel('control')} down`:jump.climb?'Climbing · Release movement or jump to let go':swimming?'Swimming · Reach the shore to fight':!jump.grounded?'Jumping':surfaceHeight(position.x,position.z,!!worldInstance)>60?'The high mountain trails':'The lantern roads';updateLocation();}
 if(now-contractRefresh>1000&&panel.open){if(panel.dataset.mode==='contracts')renderContractPanel();renderHearthlingPanel();contractRefresh=now;}
 reconcileAutoAttack();updateWorldCursor(now);updateTarget(now);renderAtlas();if(panel.open&&(panel.dataset.mode==='gear'||panel.dataset.mode==='inspect'))characterView?.render(elapsed);if(!customizer.open&&!rosterActive&&!atlas)renderer.render(scene,camera);
 updateUnitFrames(now);if(!document.hidden&&!customizer.open&&!rosterActive&&!atlas)unitPortraits?.render(elapsed);
 if((customizer.open||rosterActive)&&previewRenderer){if(previewCharacter){previewCharacter.rotation.y=previewRotation+Math.sin(elapsed*.5)*.07;animateCharacter(previewCharacter,elapsed,false);}for(let i=0;i<previewLanterns.length;i++)previewLanterns[i].intensity=4+Math.sin(elapsed*3+i)*.3;previewRenderer.render(previewScene,previewCamera);}
}
for(const prefix of ['roster','preview'])for(const [side,direction] of [['left',-1],['right',1]] as const){
 const button=$<HTMLButtonElement>(`${prefix}-turn-${side}`);
 bindPreviewRotation(button,delta=>{previewRotation+=delta*direction;},()=>prefix==='preview'?customizer.open:rosterActive&&!customizer.open);
}
bindPreviewDrag($<HTMLCanvasElement>('character-preview'),delta=>{previewRotation+=delta;},()=>!!previewCharacter&&(customizer.open||rosterActive));
requestAnimationFrame(frame);
const authStartup=initAuth().then(async state=>{await mountWebsiteTag();return state;});
const startupTasks=[switchZone('greenwood'),authStartup,loadSpellEffectAssets().catch(error=>console.warn('Detailed spell effects unavailable; using simple combat cues.',error)),loadTreasureAssets(),loadPetAssets().catch(error=>{throw new Error('The pet models could not load. Please try again.',{cause:error});}),createZeppelins(scene).then(value=>{zeppelins=value;}),loadCityMountAssets().catch(error=>{throw new Error('The mount models could not load. Please try again.',{cause:error});}),loadCharacterAssets().catch(error=>{throw new Error('The character models could not load. Please try again.',{cause:error});}),new GLTFLoader().loadAsync('/models/training-dummy.glb').then(({scene,animations})=>setTrainingDummyAssets(scene,animations)).catch(error=>{throw new Error('The training dummy model could not load. Please try again.',{cause:error});}),new GLTFLoader().loadAsync('/models/monster-kit.glb').then(({scene,animations})=>setMonsterAssets(scene,animations)).catch(error=>{throw new Error('The monster models could not load. Please try again.',{cause:error});}),new GLTFLoader().loadAsync('/models/instant-combat-monsters.glb').then(({scene,animations})=>setInstantCombatAssets(scene,animations)).catch(error=>{throw new Error('The Instant Combat monster models could not load. Please try again.',{cause:error});}),new GLTFLoader().loadAsync('/models/themed-monsters.glb').then(({scene,animations})=>setThemedMonsterAssets(scene,animations)).catch(error=>{throw new Error('The dungeon monsters could not load. Please try again.',{cause:error});}),loadRaidAssets().catch(error=>{throw new Error('The raid models could not load. Please try again.',{cause:error});}),loadRaidWorldAssets().catch(error=>{throw new Error('The raid scenery could not load. Please try again.',{cause:error});}),new GLTFLoader().loadAsync('/models/legacy-dungeon-bosses.glb').then(({scene,animations})=>setDungeonBossAssets(scene,animations)).catch(error=>{throw new Error('The dungeon boss models could not load. Please try again.',{cause:error});}),new GLTFLoader().loadAsync('/models/idle-animations.glb').then(({scene,animations})=>setIdleAnimations(scene,animations)).catch(error=>{throw new Error('The idle animations could not load. Please try again.',{cause:error});}),new GLTFLoader().loadAsync('/models/death-animations.glb').then(({scene,animations})=>setDeathAnimations(scene,animations)).catch(error=>{throw new Error('The death animations could not load. Please try again.',{cause:error});})] as const;
const startupStatus=$('startup-loading-status'),startupProgress=$<HTMLProgressElement>('startup-loading-progress');startupProgress.max=startupTasks.length;startupProgress.value=0;
for(const task of startupTasks)void task.then(()=>{startupProgress.value++;startupStatus.textContent=`Preparing realm components · ${startupProgress.value} / ${startupTasks.length}`;},()=>{});
Promise.all(startupTasks).then(([,authState])=>{
 $('loading').classList.add('done');setTimeout(()=>$('loading').remove(),800);
 updateSelection=takeUpdateSelection();
 if(authState==='account'&&updateSelection?.resume!==false||authState==='guest'&&updateSelection?.resume)openCharacterSelection();else showEntry('',authState==='account');
 startUpdates(saveUpdateSelection);
}).catch(error=>{
 console.error('World startup failed',error);$('loading').remove();
 showEntry(error instanceof Error?error.message:'The world could not load. Please try again.',true);
 void authStartup.catch(()=>{}).then(()=>startUpdates(saveUpdateSelection));
});
