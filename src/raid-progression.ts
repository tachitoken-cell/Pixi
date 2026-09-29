import type { CharacterClass, Player } from './shared';
import { activeSpecialist, SPECIALISTS_ENABLED } from './specialist-classes.ts';
export { activeSpecialist, SPECIALISTS_ENABLED } from './specialist-classes.ts';
import type { RaidReward } from './raid';
import { bagCanFit } from './bags.ts';

export const RAID_COSMETICS = ['apostle-wings','black-aura','apostle-weapon'] as const;
export type RaidCosmetic = typeof RAID_COSMETICS[number];
export interface SpecialistCard {
  id:string; className:CharacterClass; jobXp:number; upgrade:number; broken:boolean; attempts:number;
  source:'quest'|'raid'|'nft'; sealed:boolean;
  nft?:{tokenId:string;contract:string;wallet:string;version:number};
}
export interface RaidProgress {
  clears:number; sigils:number; souls:number; evolutionCores:number; petEvolution:number;
  cosmetics:RaidCosmetic[]; equippedCosmetics:RaidCosmetic[]; pendingHorns:boolean;
  specialists:SpecialistCard[]; activeSpecialistId:string|null;
  completedRuns:string[]; claimedSpecialistClasses?:CharacterClass[]; lastCompletion?:{runId:string;rewards:RaidReward[]};
}
export type RaidProgressionMessage = {type:'raidSpUnlock'|'raidPetEvolve'|'raidClaimHorns'}
  | {type:'raidSpUpgrade';specialistId:string;protect:boolean;expectedUpgrade:number;expectedAttempts:number;upgradeEffectId?:string}
  | {type:'raidSpRepair';specialistId:string}
  | {type:'raidSpEquip';specialistId:string|null}
  | {type:'raidCosmeticEquip';cosmetic:RaidCosmetic;equipped:boolean};
export const newRaidProgress = ():RaidProgress => ({clears:0,sigils:0,souls:0,evolutionCores:0,petEvolution:0,cosmetics:[],equippedCosmetics:[],pendingHorns:false,specialists:[],activeSpecialistId:null,completedRuns:[]});
export const SPECIALIST_NAMES:Record<CharacterClass,string> = {Knight:'Iron Vanguard',Ranger:'Windstrider',Mage:'Ember Sage',Cleric:'Dawn Hierophant'};
// Source proposal's +1–15 odds. Broken cards retain every level and can be repaired.
export const SP_UPGRADE_ODDS = [
  [80,0],[75,0],[70,5],[60,10],[50,15],[40,20],[35,25],[30,30],[25,35],[20,40],
  [10,45],[7,50],[5,55],[3,60],[1.5,70],
] as const;
export const specialistJobLevel = (xp:number) => Math.min(20,1+Math.floor(Math.sqrt(Math.max(0,xp)/500)));
export const specialistWingStage = (upgrade:number) => upgrade>=15?3:upgrade>=10?2:upgrade>=5?1:0;
export function specialistUpgradeCost(upgrade:number){
  return {crystal:20+(upgrade+1)*5,relic:upgrade<5?0:5+(upgrade-4)*2,sigils:upgrade<10?0:(upgrade-9)*3};
}
const integer=(value:unknown,max=Number.MAX_SAFE_INTEGER):value is number=>Number.isSafeInteger(value)&&(value as number)>=0&&(value as number)<=max;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(value);
const classes=['Knight','Ranger','Mage','Cleric'];
export function specialistValid(card:unknown):card is SpecialistCard {
  return object(card)&&id(card.id)&&classes.includes(card.className as string)&&integer(card.jobXp,180500)&&integer(card.upgrade,15)
    &&typeof card.broken==='boolean'&&integer(card.attempts)&&['quest','raid','nft'].includes(card.source as string)&&typeof card.sealed==='boolean'
    &&(card.nft===undefined||object(card.nft)&&typeof card.nft.tokenId==='string'&&/^[1-9]\d{0,77}$/.test(card.nft.tokenId)
      &&[card.nft.contract,card.nft.wallet].every(value=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value))&&integer(card.nft.version));
}
export function raidProgressValid(value:unknown):value is RaidProgress {
  if(value===undefined)return true;
  return object(value)&&['clears','sigils','souls','evolutionCores'].every(key=>integer(value[key]))&&integer(value.petEvolution,3)
    &&typeof value.pendingHorns==='boolean'
    &&(value.claimedSpecialistClasses===undefined||Array.isArray(value.claimedSpecialistClasses)&&value.claimedSpecialistClasses.every(item=>classes.includes(item))&&new Set(value.claimedSpecialistClasses).size===value.claimedSpecialistClasses.length)
    &&['cosmetics','equippedCosmetics'].every(key=>Array.isArray(value[key])&&new Set(value[key] as unknown[]).size===(value[key] as unknown[]).length&&(value[key] as unknown[]).every(item=>RAID_COSMETICS.includes(item as RaidCosmetic)))
    &&(value.equippedCosmetics as RaidCosmetic[]).every(item=>(value.cosmetics as RaidCosmetic[]).includes(item))
    &&Array.isArray(value.specialists)&&value.specialists.length<=100&&value.specialists.every(specialistValid)&&new Set(value.specialists.map(card=>card.id)).size===value.specialists.length
    &&(value.activeSpecialistId===null||value.specialists.some(card=>card.id===value.activeSpecialistId&&!card.sealed))
    &&Array.isArray(value.completedRuns)&&value.completedRuns.length<=10000&&value.completedRuns.every(id)&&new Set(value.completedRuns).size===value.completedRuns.length
    &&value.clears===value.completedRuns.length
    &&(value.lastCompletion===undefined||object(value.lastCompletion)&&id(value.lastCompletion.runId)&&value.completedRuns.includes(value.lastCompletion.runId)&&Array.isArray(value.lastCompletion.rewards)
      &&value.lastCompletion.rewards.length<=12&&value.lastCompletion.rewards.every(reward=>object(reward)&&id(reward.id)&&typeof reward.label==='string'&&reward.label.length<=100&&integer(reward.quantity,100)&&['material','cosmetic','pet','gear','title'].includes(reward.kind as string)));
}
export const RAID_REWARD_TABLE = [
  {id:'apostle-soul',label:'Apostle’s Soul',kind:'material',chance:.0025},
  {id:'apostle-wings',label:'Horned Apostle Wings',kind:'cosmetic',chance:.02},
  {id:'death-apostle',label:'Death Apostle Pet',kind:'pet',chance:.02},
  {id:'death-horns',label:'Death Horns',kind:'gear',chance:.05},
  {id:'black-aura',label:'Black Aura',kind:'cosmetic',chance:.02},
  {id:'apostle-weapon',label:'Raid Weapon Skin',kind:'cosmetic',chance:.04},
  {id:'raid-sigil',label:'Raid Sigils',kind:'material',chance:1},
  {id:'pet-evolution-core',label:'Pet Evolution Core',kind:'material',chance:.25},
  {id:'death-defier',label:'Death Defier',kind:'title',chance:1},
] as const;
function roll(random:()=>number){const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw Error('Invalid reward roll.');return value;}
export function rollRaidRewards(random=Math.random):RaidReward[]{
  return RAID_REWARD_TABLE.filter(reward=>roll(random)<reward.chance).map(({id,label,kind})=>({id,label,kind,quantity:id==='raid-sigil'?3+Math.floor(roll(random)*3):1}));
}
/** Apply a cached roll inside the account's existing atomic save. Retries never roll again. */
export function raidRewardChanges(player:Player,runId:string,rewards:readonly RaidReward[]):Partial<Player>{
  if(!id(runId)||!raidProgressValid(player.raidProgress))throw Error('Invalid raid completion.');
  const progress=structuredClone(player.raidProgress||newRaidProgress());
  if(progress.completedRuns.includes(runId))return {};
  // ponytail: retain 10,000 immutable run receipts; archive atomically if characters approach this ceiling.
  if(progress.completedRuns.length>=10000)throw Error('Raid receipt storage is full. Contact support.');
  const ownedPets=[...player.ownedPets];
  const credited=rewards.map(reward=>{
    const definition=RAID_REWARD_TABLE.find(entry=>entry.id===reward.id);
    if(!definition||definition.kind!==reward.kind||!integer(reward.quantity,5)||reward.quantity<1)throw Error('Invalid raid reward.');
    let duplicate=false;
    if(reward.id==='raid-sigil')progress.sigils+=reward.quantity;
    else if(reward.id==='apostle-soul')progress.souls+=reward.quantity;
    else if(reward.id==='pet-evolution-core')progress.evolutionCores+=reward.quantity;
    else if(reward.kind==='cosmetic') {duplicate=progress.cosmetics.includes(reward.id as RaidCosmetic);if(!duplicate)progress.cosmetics.push(reward.id as RaidCosmetic);}
    else if(reward.kind==='pet'){duplicate=ownedPets.includes('death-apostle');if(!duplicate)ownedPets.push('death-apostle');}
    else if(reward.kind==='gear'){
      duplicate=progress.pendingHorns||player.ownedGear.includes('death-horns')||(player.bank?.gear||[]).includes('death-horns');
      if(!duplicate)progress.pendingHorns=true;
    }else duplicate=progress.clears>0;
    if(duplicate&&reward.kind!=='title')progress.sigils+=2;
    return {...reward,...(duplicate?{duplicate:true}:{})};
  });
  progress.clears++;progress.completedRuns.push(runId);progress.lastCompletion={runId,rewards:credited};
  if(!raidProgressValid(progress))throw Error('Raid reward storage limit reached.');
  return {raidProgress:progress,ownedPets};
}
export function raidProgressionChanges(player:Player,message:RaidProgressionMessage,random=Math.random,newId=()=>crypto.randomUUID()):{changes:Partial<Player>;text:string}{
  if(player.level<60||!raidProgressValid(player.raidProgress))throw Error('Reach level 60 to use raid progression.');
  const progress=structuredClone(player.raidProgress||newRaidProgress()),changes:Partial<Player>={raidProgress:progress};
  const takeItem=(itemId:string)=>{const count=player.carriedItems?.[itemId]||0;if(count<1)throw Error(`You need a ${itemId==='sp-protection-roll'?'Protection Roll':'Soul Revival Core'}.`);changes.carriedItems={...player.carriedItems,[itemId]:count-1};};
  let text='Raid collection updated.';
  if(message.type==='raidSpUnlock'){
    if(!progress.clears&&!(player.achievements?.dungeons.veilhaven))throw Error('Clear Veilhaven or defeat the Horned Apostle to earn your specialist.');
    if(progress.claimedSpecialistClasses?.includes(player.appearance.className)||progress.specialists.some(card=>card.className===player.appearance.className&&card.source==='quest'))throw Error('Your class specialist has already been claimed.');
    if(progress.specialists.length>=100)throw Error('Your specialist collection is full.');
    const card:SpecialistCard={id:newId(),className:player.appearance.className,jobXp:0,upgrade:0,broken:false,attempts:0,source:'quest',sealed:false};
    progress.claimedSpecialistClasses=[...new Set([...(progress.claimedSpecialistClasses||[]),player.appearance.className])];
    progress.specialists.push(card);if(SPECIALISTS_ENABLED)progress.activeSpecialistId=card.id;text=`${SPECIALIST_NAMES[card.className]} unlocked at +0.`;
  }else if(message.type==='raidSpEquip'){
    if(!SPECIALISTS_ENABLED&&message.specialistId!==null)throw Error('Specialist classes are temporarily disabled. Your cards and progression are preserved.');
    const card=progress.specialists.find(card=>card.id===message.specialistId);
    if(message.specialistId!==null&&(!card||card.className!==player.appearance.className||card.sealed||card.broken))throw Error('Choose an available specialist for your class.');
    progress.activeSpecialistId=message.specialistId;text=card?`${SPECIALIST_NAMES[card.className]} equipped.`:'Specialist unequipped.';
  }else if(message.type==='raidSpUpgrade'||message.type==='raidSpRepair'){
    const card=progress.specialists.find(card=>card.id===message.specialistId);
    if(!card||card.sealed||card.className!==player.appearance.className)throw Error('Choose an unsealed specialist for your class.');
    if(message.type==='raidSpRepair'){
      if(!card.broken)throw Error('This specialist does not need repair.');takeItem('sp-revival-core');card.broken=false;text='Specialist repaired. All progression retained.';
    }else{
      if(card.broken||card.upgrade>=15||typeof message.protect!=='boolean'||message.expectedUpgrade!==card.upgrade||message.expectedAttempts!==card.attempts)throw Error('The upgrade changed. Refresh before trying again.');
      const cost=specialistUpgradeCost(card.upgrade),[success,broken]=SP_UPGRADE_ODDS[card.upgrade];
      if(player.inventory.crystal<cost.crystal||player.inventory.relic<cost.relic||progress.sigils<cost.sigils)throw Error('You need more upgrade materials.');
      if(message.protect){if(!broken)throw Error('This upgrade has no break risk.');takeItem('sp-protection-roll');}
      changes.inventory={...player.inventory,crystal:player.inventory.crystal-cost.crystal,relic:player.inventory.relic-cost.relic};progress.sigils-=cost.sigils;
      const outcome=roll(random)*100;card.attempts++;
      if(outcome<success){card.upgrade++;text=`Specialist upgraded to +${card.upgrade}.`;}
      else if(outcome>=100-broken&&!message.protect){card.broken=true;progress.activeSpecialistId=progress.activeSpecialistId===card.id?null:progress.activeSpecialistId;text='The specialist is sealed by a fracture. Use a Soul Revival Core to repair it; all levels are retained.';}
      else text=outcome>=100-broken?'Protection absorbed the fracture. Upgrade unchanged.':'Upgrade failed. The specialist and its level are retained.';
    }
  }else if(message.type==='raidPetEvolve'){
    if(!player.ownedPets.includes('death-apostle')||progress.petEvolution>=3)throw Error('Choose a Death Apostle pet below evolution III.');
    const cost=[1,3,6][progress.petEvolution],soul=progress.petEvolution===2?1:0;
    if(progress.evolutionCores<cost||progress.souls<soul)throw Error('You need more Evolution Cores'+(soul?' and an Apostle’s Soul.':'.'));
    progress.evolutionCores-=cost;progress.souls-=soul;progress.petEvolution++;text=`Death Apostle evolved to stage ${progress.petEvolution}.`;
  }else if(message.type==='raidCosmeticEquip'){
    if(!RAID_COSMETICS.includes(message.cosmetic)||!progress.cosmetics.includes(message.cosmetic)||typeof message.equipped!=='boolean')throw Error('Unlock this raid cosmetic first.');
    progress.equippedCosmetics=progress.equippedCosmetics.filter(id=>id!==message.cosmetic);if(message.equipped)progress.equippedCosmetics.push(message.cosmetic);
  }else if(message.type==='raidClaimHorns'){
    if(!progress.pendingHorns)throw Error('No Death Horns are waiting.');
    if(player.ownedGear.includes('death-horns'))throw Error('You already carry Death Horns.');
    changes.ownedGear=[...player.ownedGear,'death-horns'];if(!bagCanFit(player,changes))throw Error('Make room in your bags to collect Death Horns.');
    progress.pendingHorns=false;text='Death Horns collected.';
  }else throw Error('Unknown raid progression action.');
  if(!raidProgressValid(progress))throw Error('Invalid raid progression.');
  return {changes,text};
}

/** Only enabled, active specialist jobs earn XP, including at the character cap. */
export function awardSpecialistXp(player:Player,amount:number):void {
  const card=activeSpecialist(player.raidProgress,player.appearance.className);
  if(card&&Number.isFinite(amount)&&amount>0)
    card.jobXp=Math.min(180500,card.jobXp+Math.floor(amount));
}
