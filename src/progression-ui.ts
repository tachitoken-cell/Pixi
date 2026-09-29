import { goldSource, talentResetGoldCost } from './gold-economy';
import { SPELLS, SPELL_BONUS_LABELS, type SpellBonuses } from './spells';
import { NPC_SERVICE_COSTS, type Player } from './shared';
import { gearById, gearSetBonuses, GEAR_SETS, TALENTS, RESOURCE_PRICES, availableTalentPoints, canLearnTalent, equipmentSlotFor } from './progression';
import { icon } from './icons';
import { gearArt, gearStatLabels, lootItemArt, gearSlotLabels as slotLabels } from './character-ui';
import { talentRank, branchTalentPoints, type Talent } from './progression';
import { gearSellPrice, merchantStock } from './merchants';
import { BAG_ITEMS, bagMerchantStock, bagUsage, bagCapacity, bagCanFit, type EquippedBags } from './bags';
import { LOOT_ITEMS, lootItemValid, gearLootQuality, type LootQuality } from './loot-items';
import { VILLAGE_NPCS } from './settlements';

const weaponIcons = { Ranger: 'bow', Knight: 'sword', Mage: 'spark', Cleric: 'cleric-smite' };
const resourceLabels = { wood: 'Wood', crystal: 'Lantern fragments', herb: 'Wild herbs' };
const resourceIcons = { wood: 'wood', crystal: 'crystal', herb: 'leaf' };
const number = (value: number) => value.toLocaleString('en-US');
const equipped = (player: Player, id: string) => Object.values(player.equipment).includes(id);

const talentEscape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const talentThemes: Record<string, { art: string; tone: string; note: string }> = {
  Marksmanship: { art: 'bow', tone: 'gold', note: 'Precision & powerful shots' }, Beastmaster: { art: 'compass', tone: 'green', note: 'Faithful companion' }, Venom: { art: 'leaf', tone: 'green', note: 'Poison & lingering damage' },
  Vanguard: { art: 'sword', tone: 'gold', note: 'Steel & sweeping attacks' }, Sentinel: { art: 'shield', tone: 'green', note: 'Stand against the darkness' }, Warlord: { art: 'crown', tone: 'red', note: 'Command the battlefield' },
  Radiance: { art: 'cleric-heal', tone: 'gold', note: 'Healing & renewal' }, Devotion: { art: 'cleric-shield', tone: 'green', note: 'Protective prayers' }, Judgment: { art: 'cleric-smite', tone: 'gold', note: 'Righteous holy damage' },
  Fire: { art: 'ember', tone: 'red', note: 'Flame & sustained burning' }, Arcane: { art: 'beacon', tone: 'violet', note: 'Concentration & arcane power' }, Frost: { art: 'frost', tone: 'blue', note: 'Chill & shatter combinations' },
};
const talentEffect = (talent: Talent, rank: number) => talent.rankDescriptions?.[rank - 1] || (talent.ability ? talent.description : [talent.stats.primaryDamage && `+${talent.stats.primaryDamage * rank} attack damage`, talent.stats.specialDamage && `+${talent.stats.specialDamage * rank} skill damage`, talent.stats.defense && `+${talent.stats.defense * rank} armor`, ...Object.entries(talent.spellBonuses || {}).map(([key, value]) => `+${value * rank}% ${SPELL_BONUS_LABELS[key as keyof SpellBonuses]}`)].filter(Boolean).join(' · ')) || talent.description;
const talentArt = (talent: Talent, branchArt: string) => talent.icon || (talent.ability ? SPELLS[talent.ability].icon : talent.spellBonuses || talent.row === 4 ? branchArt : talent.stats.defense ? (talent.row % 2 ? 'heartroot' : 'shield') : talent.stats.specialDamage ? (talent.className === 'Cleric' ? 'cleric-burst' : talent.className === 'Mage' ? 'nova' : talent.className === 'Ranger' ? 'volley' : 'whirlwind') : weaponIcons[talent.className]);

function talentStatus(player: Player, talent: Talent): string {
  if (talentRank(player, talent.id) >= talent.maxRank) return 'Maximum rank learned';
  if (player.level < talent.requiredLevel) return `Requires level ${talent.requiredLevel}`;
  if (talent.prerequisite && talentRank(player, talent.prerequisite) < talent.prerequisiteRank) return `Requires ${TALENTS[talent.prerequisite].label} rank ${talent.prerequisiteRank}`;
  if (branchTalentPoints(player, talent.branch) < talent.requiredBranchPoints) return `Spend ${talent.requiredBranchPoints} points in ${talent.branch} first`;
  return availableTalentPoints(player) > 0 ? 'Learn next rank · 1 point' : 'No talent points available';
}

function talentConnections(player: Player, talents: Talent[], markerId: string): string {
  const sameTier: string[] = [];
  const tiers = `<svg class="talent-connections" viewBox="0 0 300 290" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><marker id="${markerId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 Z" fill="context-stroke"/></marker></defs>${talents.filter(talent => talent.prerequisite).map(talent => {
    const previous = talents.find(item => item.id === talent.prerequisite);
    if (!previous) return '';
    const x1 = previous.column * 100 + 50, y1 = previous.row * 58 + 47, x2 = talent.column * 100 + 50, y2 = talent.row * 58 - 4, middle = (y1 + y2) / 2;
    const edge = `class="talent-connection${talentRank(player, previous.id) >= talent.prerequisiteRank ? ' satisfied' : ''}" data-talent-from="${talentEscape(previous.id)}" data-talent-to="${talentEscape(talent.id)}" marker-end="url(#${markerId})"`;
    if (previous.row === talent.row) {
      // Column centers resize, but the 44px buttons and their edge clearance do not.
      sameTier.push(`<svg class="talent-side-connection" style="left:calc(${Math.min(x1, x2) / 3}% + 26px);width:calc(${Math.abs(x2 - x1) / 3}% - 52px);top:${talent.row * 58 + 22}px" aria-hidden="true" focusable="false"><line ${edge} x1="${x2 > x1 ? '0' : '100%'}" x2="${x2 > x1 ? '100%' : '0'}" y1="0" y2="0"/></svg>`);
      return '';
    }
    return `<path ${edge} d="M${x1} ${y1} V${middle} H${x2} V${y2}"/>`;
  }).join('')}</svg>`;
  return tiers + sameTier.join('');
}

let talentBranchOwner = '', selectedTalentBranch = 0;
const mountedTalentRoots = new WeakSet<HTMLElement>();
/** Native radio tabs preserve the selected mobile branch across authoritative snapshots. */
export function mountTalentBranches(root: HTMLElement) {
  if (mountedTalentRoots.has(root)) return;
  mountedTalentRoots.add(root);
  root.addEventListener('change', event => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches('[data-talent-branch]') && input.checked) selectedTalentBranch = Number(input.dataset.talentBranch);
  });
}
export function renderTalents(player: Player): string {
  const points = availableTalentPoints(player), talents = Object.values(TALENTS).filter(talent => talent.className === player.appearance.className);
  const branches = [...new Set(talents.map(talent => talent.branch))];
  const owner = `${player.id}:${player.appearance.className}`; if (talentBranchOwner !== owner) { talentBranchOwner = owner; selectedTalentBranch = 0; }
  return `<div class="talent-layout"><div class="talent-summary">${icon('spark')}<strong>${points} talent ${points === 1 ? 'point' : 'points'} available</strong><span>${player.talents.length} spent</span><button type="button" data-reset-talents ${player.talents.length && player.gold >= talentResetGoldCost(player, player.economyVersion === 1) ? '' : 'disabled'}>Reset talents · ${talentResetGoldCost(player, player.economyVersion === 1) || 'Free'}${player.economyVersion === 1 && player.talents.length ? ' gold' : ''}</button></div><p class="talent-intro">One point at level 1, then every three levels: 20 at level 60. Specialize in one path or mix branches. Reset outside combat to choose again.</p><fieldset class="talent-branch-tabs"><legend>Choose a talent path</legend>${branches.map((branch, index) => `<label><input type="radio" name="talent-branch" data-talent-branch="${index}" ${selectedTalentBranch === index ? 'checked' : ''}><span>${talentEscape(branch)}<small>${branchTalentPoints(player, branch)} points</small></span></label>`).join('')}</fieldset><div class="talent-branches">${branches.map((branch, branchIndex) => {
    const theme = talentThemes[branch] || { art: 'spark', tone: 'gold', note: 'Choose your path' }, branchTalents = talents.filter(talent => talent.branch === branch), spent = branchTalentPoints(player, branch), branchId = `talent-branch-${branchIndex}`;
    return `<section class="talent-branch talent-tone-${theme.tone}" aria-labelledby="${branchId}" data-branch-index="${branchIndex}"><header class="talent-branch-heading">${icon(theme.art)}<div><h3 id="${branchId}">${talentEscape(branch)}</h3><span>${theme.note}</span></div></header><div class="talent-tree">${talentConnections(player, branchTalents, `${branchId}-arrow`)}<ol class="talent-grid" aria-label="${talentEscape(branch)} talents">${branchTalents.map(talent => {
      const rank = talentRank(player, talent.id), canLearn = canLearnTalent(player, talent.id), capped = rank >= talent.maxRank, state = capped ? 'learned' : canLearn ? 'available' : 'locked', detailId = `talent-detail-${talent.id}`;
      const requirements = [`Level ${talent.requiredLevel}`, talent.requiredBranchPoints ? `${talent.requiredBranchPoints} points in ${branch}` : '', talent.prerequisite ? `${TALENTS[talent.prerequisite].label} rank ${talent.prerequisiteRank}` : ''].filter(Boolean).join(' · ');
      return `<li class="talent-node ${state}${rank ? ' invested' : ''}" style="grid-column:${talent.column + 1};grid-row:${talent.row + 1}" ${canLearn ? '' : `tabindex="0" aria-label="${talentEscape(talent.label)}, rank ${rank} of ${talent.maxRank}" aria-describedby="${talentEscape(detailId)}"`}><button type="button" class="talent-node-button" data-learn-talent="${talentEscape(talent.id)}" aria-label="Learn ${talentEscape(talent.label)}, rank ${rank} of ${talent.maxRank}" aria-describedby="${talentEscape(detailId)}" ${canLearn ? '' : 'disabled'}>${icon(talentArt(talent, theme.art))}<span class="talent-rank" aria-hidden="true">${rank}/${talent.maxRank}</span></button><div class="talent-node-detail" id="${talentEscape(detailId)}" role="tooltip"><div class="talent-detail-heading"><strong>${talentEscape(talent.label)}</strong><span>Rank ${rank} / ${talent.maxRank}</span></div><p>${talentEscape(talent.description)}</p>${rank ? `<p class="talent-current">Current: ${talentEffect(talent, rank)}</p>` : ''}${!capped ? `<p class="talent-next">Next rank: ${talentEffect(talent, rank + 1)}</p>` : ''}<small>Requires ${talentEscape(requirements)}</small><span class="talent-status">${talentEscape(talentStatus(player, talent))}</span></div></li>`;
    }).join('')}</ol></div><footer class="talent-branch-points"><div><span><strong>${spent}</strong> ${spent === 1 ? 'point' : 'points'} spent in ${talentEscape(branch)}</span><small>${branchTalents.filter(talent => talentRank(player, talent.id) >= talent.maxRank).length} / ${branchTalents.length} maxed</small></div><progress value="${spent}" max="${branchTalents.reduce((sum, talent) => sum + talent.maxRank, 0)}" aria-label="${talentEscape(branch)} points spent">${spent}</progress></footer></section>`;
  }).join('')}</div></div>`;
}

export { renderGear } from './character-ui';

export type ShopTab = 'buy' | 'sell';
export interface ShopOptions { selected?: string; tab?: ShopTab; filter?: string; page?: number; quantity?: '1' | 'all'; pendingSales?: readonly string[] }
type ShopEntry = { id:string; tooltip:string; label:string; art:string; quality:LootQuality; category:string; description:string; summary:string;
  price:number; action:string; allAction?:string; actionLabel:'Buy'|'Equip'|'Sell'; reason:string; details:string; count?:number; quantity?:number };
const SHOP_PAGE_SIZE = 6;
const bagArt = (kind:string) => `<img class="gear-art" src="/ui/bags/${talentEscape(kind)}.png" alt="" draggable="false">`;
const shopStat = (label:string,value:string|number) => `<dt>${label}</dt><dd>${talentEscape(String(value))}</dd>`;
const gearShopStats = (stats: Parameters<typeof gearArt>[0]['stats']) => Object.entries(stats).filter(([, value]) => value).map(([stat, value]) => shopStat(stat === 'primaryDamage' ? 'Attack damage' : stat === 'specialDamage' ? 'Skill damage (magic)' : gearStatLabels[stat as keyof typeof gearStatLabels], `+${value}${stat === 'speed' ? '%' : ''}`)).join('');
const qualityLabel = (quality:string) => quality[0].toUpperCase()+quality.slice(1);

function shopBuyEntries(player:Player,npcId:string):ShopEntry[] {
  const entries:ShopEntry[]=[];
  for(const gear of merchantStock(npcId).filter(gear=>!gear.className||gear.className===player.appearance.className).sort((a,b)=>a.requiredLevel-b.requiredLevel||a.price-b.price||a.label.localeCompare(b.label))){
    const owned=player.ownedGear.includes(gear.id),worn=equipped(player,gear.id),slot=equipmentSlotFor(player.equipment,gear.id);
    const reserved=player.auctions?.some(listing=>listing.item.kind==='gear'&&listing.item.id===gear.id);
    const fits=owned?!!slot&&bagCanFit(player,{equipment:{...player.equipment,[slot]:gear.id}}):bagCanFit(player,{ownedGear:[...player.ownedGear,gear.id]});
    const reason=worn?'Equipped':player.level<gear.requiredLevel?`Requires level ${gear.requiredLevel}`:!owned&&reserved?'Listed at auction':!owned&&player.gold<gear.price?`Requires ${number(gear.price)} gold`:!fits?'Your bags are full':'';
    const set=GEAR_SETS.find(set=>set.id===gear.setId);
    entries.push({id:`gear:${gear.id}`,tooltip:gear.id,label:gear.label,art:gearArt(gear),quality:gearLootQuality(gear),category:'equipment',price:gear.price,
      description:gear.description,summary:`${worn?'Equipped':owned?'Owned':`Level ${gear.requiredLevel}`} · ${slotLabels[gear.slot]}`,
      action:`data-${owned?'equip':'buy'}-gear="${gear.id}"`,actionLabel:owned?'Equip':'Buy',reason,
      details:shopStat('Slot',slotLabels[gear.slot])+shopStat('Required level',gear.requiredLevel)+shopStat('Calling',gear.className||'Any')
        +gearShopStats(gear.stats)+(set?shopStat('Set',set.label)+gearSetBonuses(set.id).map(bonus=>shopStat(`${bonus.pieces} pieces`,bonus.description)).join(''):'')});
  }
  for(const bag of bagMerchantStock(npcId)){
    const candidate={id:'shop-preview-bag',kind:bag.id},slots=[...(player.equippedBags||[null,null,null,null])] as EquippedBags,empty=slots.indexOf(null);
    if(empty>=0)slots[empty]=candidate.id;
    const fits=bagCanFit(player,{ownedBags:[...(player.ownedBags||[]),candidate],equippedBags:slots});
    entries.push({id:`bag:${bag.id}`,tooltip:`bag-kind:${bag.id}`,label:bag.label,art:bagArt(bag.id),quality:bag.quality,category:'bags',price:bag.price,
      description:bag.description,summary:`${bag.slots} slots · Level ${bag.requiredLevel}`,action:`data-buy-bag="${bag.id}"`,actionLabel:'Buy',
      reason:player.level<bag.requiredLevel?`Requires level ${bag.requiredLevel}`:player.gold<bag.price?`Requires ${number(bag.price)} gold`:!fits?'Your bags are full':'',
      details:shopStat('Storage',`${bag.slots} slots`)+shopStat('Required level',bag.requiredLevel)+shopStat('Owned',(player.ownedBags||[]).filter(owned=>owned.kind===bag.id).length)
        +shopStat('On purchase',empty>=0?'Automatically equips':'Placed in your bags')});
  }
  entries.push({id:'potion',tooltip:'potion',label:'Healing potion',art:icon('potion'),quality:'common',category:'supplies',price:NPC_SERVICE_COSTS.potion,
    description:'Restores 55 health. Use it from your bag or hotbar.',summary:`${number(player.inventory.potion)} in your bags · Consumable`,
    action:`data-npc-service="potion" data-npc-id="${talentEscape(npcId)}"`,actionLabel:'Buy',
    reason:player.gold<NPC_SERVICE_COSTS.potion?`Requires ${NPC_SERVICE_COSTS.potion} gold`:!bagCanFit(player,{inventory:{...player.inventory,potion:player.inventory.potion+1}})?'Your bags are full':'',
    details:shopStat('Restores','55 health')+shopStat('In your bags',number(player.inventory.potion))+shopStat('Purchase quantity',1)});
  return entries;
}

function shopSellEntries(player:Player,npcId:string,all:boolean):ShopEntry[] {
  const entries:ShopEntry[]=[],goldRoom=(price:number,quantity:number)=>Number.isSafeInteger(price*quantity)&&Number.isSafeInteger(player.gold+price*quantity)?'':'You cannot carry more gold';
  for(const id of player.ownedGear){
    const price=goldSource(gearSellPrice(id), 'resale', player.economyVersion === 1);if(!price||equipped(player,id))continue;
    const gear=gearById(id);if(!gear)continue;const set=GEAR_SETS.find(set=>set.id===gear.setId);
    entries.push({id:`gear:${id}`,tooltip:id,label:gear.label,art:gearArt(gear),quality:gearLootQuality(gear),category:'equipment',price,count:1,quantity:1,
      description:gear.description,summary:`Unequipped · ${slotLabels[gear.slot]}`,action:`data-sell-gear="${talentEscape(id)}"`,actionLabel:'Sell',reason:goldRoom(price,1),
      details:shopStat('Slot',slotLabels[gear.slot])+shopStat('Required level',gear.requiredLevel)+shopStat('Calling',gear.className||'Any')
        +gearShopStats(gear.stats)+(set?shopStat('Set',set.label)+gearSetBonuses(set.id).map(bonus=>shopStat(`${bonus.pieces} pieces`,bonus.description)).join(''):'')+shopStat('Sale value',`${number(price)} gold`)});
  }
  for(const resource of Object.keys(RESOURCE_PRICES) as (keyof typeof RESOURCE_PRICES)[]){
    const count=player.inventory[resource];if(!Number.isSafeInteger(count)||count<=0)continue;
    const price=goldSource(RESOURCE_PRICES[resource], 'resale', player.economyVersion === 1),quantity=all?Math.min(count,1_000_000):1;
    entries.push({id:`resource:${resource}`,tooltip:resource,label:resourceLabels[resource],art:icon(resourceIcons[resource]),quality:'common',category:'resources',price,count,quantity,
      description:`A gathered crafting material. Sell a quantity to this merchant for gold.`,summary:`${number(count)} in your bags · Material`,
      action:`data-sell-resource="${resource}" data-sell-quantity="${quantity}"`,allAction:`data-sell-resource="${resource}" data-sell-quantity="${Math.min(count,1_000_000)}"`,actionLabel:'Sell',reason:goldRoom(price,quantity),
      details:shopStat('In your bags',number(count))+shopStat('Gold each',price)+shopStat('Selling',number(quantity))+(count>1_000_000?shopStat('Sale limit','1,000,000 at a time'):'')});
  }
  for(const [id,count] of Object.entries(player.carriedItems||{})){
    if(!lootItemValid(id)||!Number.isSafeInteger(count)||!count||count<=0)continue;
    const item=LOOT_ITEMS[id],quantity=all?count:1;
    if(!item.sellPrice||item.category==='pet'||id==='moss-voucher')continue;
    const category=item.category==='junk'?'Vendor junk':item.category==='treasure'?'Treasure':item.category==='food'?'Food':'Potion';
    entries.push({id:`item:${id}`,tooltip:`item:${id}`,label:item.label,art:lootItemArt(id),quality:item.quality,category:'loot',price:goldSource(item.sellPrice, 'resale', player.economyVersion === 1),count,quantity,
      description:item.description,summary:`${number(count)} in your bags · ${category}`,action:`data-sell-item="${talentEscape(id)}" data-sell-item-quantity="${all?'all':'1'}"`,allAction:`data-sell-item="${talentEscape(id)}" data-sell-item-quantity="${count}"`,actionLabel:'Sell',reason:goldRoom(goldSource(item.sellPrice, 'resale', player.economyVersion === 1),quantity),
      details:shopStat('Type',category)+shopStat('In your bags',number(count))+shopStat('Gold each',goldSource(item.sellPrice, 'resale', player.economyVersion === 1))+shopStat('Selling',number(quantity))+(item.heal?shopStat('Restores',`${item.heal} health`):'')});
  }
  if(bagMerchantStock(npcId).length)for(const bag of player.ownedBags||[]){
    if(player.equippedBags?.includes(bag.id))continue;
    const item=BAG_ITEMS[bag.kind];if(!item)continue;
    const price=goldSource(Math.floor(item.price/4), 'resale', player.economyVersion === 1);
    entries.push({id:`bag:${bag.id}`,tooltip:`bag-kind:${bag.kind}`,label:item.label,art:bagArt(bag.kind),quality:item.quality,category:'bags',price,count:1,quantity:1,
      description:item.description,summary:`${item.slots} slots · Unequipped`,action:`data-sell-bag="${talentEscape(bag.id)}"`,actionLabel:'Sell',reason:goldRoom(price,1),
      details:shopStat('Storage',`${item.slots} slots`)+shopStat('Status','Unequipped')+shopStat('Sale value',`${price} gold`)});
  }
  return entries;
}

export function renderShop(player:Player,npcId:string,options:ShopOptions={}):string {
  if(!VILLAGE_NPCS.some(npc=>npc.id===npcId&&npc.role==='merchant'))return '<p class="training-guidance">Speak to a merchant to buy and sell items.</p>';
  const tab=options.tab==='sell'?'sell':'buy',quantity=options.quantity==='all'?'all':'1';
  const filters=tab==='buy'?['all','equipment','bags','supplies']:['all','equipment','resources','loot','bags'];
  const filter=filters.includes(options.filter||'')?options.filter!:'all';
  const pending=options.pendingSales||[],busy=pending.length>0&&(tab==='buy'||pending.length>=16);
  const stock=shopBuyEntries(player,npcId),sales=shopSellEntries(player,npcId,quantity==='all').filter(entry=>!pending.includes(entry.id));
  const catalog=tab==='buy'?stock:sales,entries=catalog.filter(entry=>filter==='all'||entry.category===filter);
  const pages=Math.max(1,Math.ceil(entries.length/SHOP_PAGE_SIZE)),page=Number.isSafeInteger(options.page)?Math.max(0,Math.min(pages-1,options.page!)):0;
  const visible=entries.slice(page*SHOP_PAGE_SIZE,(page+1)*SHOP_PAGE_SIZE),selected=visible.find(entry=>entry.id===options.selected)||visible.find(entry=>!entry.reason)||visible[0];
  const total=selected?selected.price*(selected.quantity||1):0;
  const allQuantity=selected?.count?selected.category==='resources'?Math.min(selected.count,1_000_000):selected.count:1;
  const saleWarning=tab==='sell'&&selected&&['legendary','mythic'].includes(selected.quality);
  const warning=saleWarning?`<label class="shop-sale-warning"><input type="checkbox" id="shop-sale-ack"><span>I want to sell this ${qualityLabel(selected.quality)} item. Merchant sales cannot be undone.</span></label>`:'';
  const allTotal=selected?selected.price*allQuantity:0;
  const allBlocked=!Number.isSafeInteger(allTotal)||!Number.isSafeInteger(player.gold+allTotal);
  const sellAll=tab==='sell'&&selected?.allAction&&allQuantity>1?`<button type="button" class="primary-button shop-sell-all" ${selected.allAction}${saleWarning?' data-sell-warning':''}${allBlocked||busy?' disabled':''}>Sell ${allQuantity===selected.count?'all · ':''}${number(allQuantity)}<small>${allBlocked?'You cannot carry more gold':`${number(allTotal)} gold`}</small></button>`:'';
  const action=`<button type="button" class="primary-button training-primary" ${selected?.action||''}${saleWarning?' data-sell-warning':''}${!selected||selected.reason||busy?' disabled':''}>${selected?.actionLabel||(tab==='sell'?'Sell':'Buy')}</button>`;
  const detail=selected?`<aside class="training-detail shop-detail quality-${selected.quality}" aria-label="Selected item details"><div class="training-detail-heading">${selected.art}<h3>${talentEscape(selected.label)}</h3></div><p class="shop-quality">${qualityLabel(selected.quality)}</p><p>${talentEscape(selected.description)}</p><dl class="training-stats">${selected.details}</dl>${tab==='sell'&&selected?`<label class="shop-quantity" for="shop-quantity">Quantity<select id="shop-quantity"${selected.count===1?' disabled':''}><option value="1"${quantity==='1'?' selected':''}>1</option><option value="all"${quantity==='all'?' selected':''}>All${selected.count&&selected.count>1?` (${number(allQuantity)})`:''}</option></select></label>`:''}<p class="training-detail-cost">${tab==='sell'?'You receive':'Price'}: ${Number.isSafeInteger(total)?`${number(total)} gold`:'Amount exceeds the gold limit'}</p>${warning}${action}${sellAll}<p class="training-status" role="status">${talentEscape(selected.reason)}</p></aside>`:'';
  // Keep confirmation, quantity and sale controls in a single selected detail block at every width.
  const rows=visible.map((entry,index)=>`<button type="button" class="training-entry shop-entry quality-${entry.quality} ${entry.reason?'unavailable':'available'}${entry===selected?' selected':''}" style="--training-row:${index+1}" data-shop-select="${talentEscape(entry.id)}" data-item-tooltip="${talentEscape(entry.tooltip)}" aria-pressed="${entry===selected}" aria-label="${talentEscape(`${entry.label}. ${entry.summary}. ${entry.price} gold. ${entry.reason||'Available'}`)}">${entry.art}<span class="training-entry-copy"><strong>${talentEscape(entry.label)}</strong><small>${talentEscape(entry.reason||entry.summary)}</small></span><span class="training-cost">${number(entry.price)} ${icon('gold')}</span></button>${entry===selected?detail:''}`).join('');
  return `<div class="training-shell training-catalog shop-shell" data-shop-page-current="${page}" data-shop-page-count="${pages}"><div class="training-toolbar shop-toolbar"><div class="shop-tabs" role="group" aria-label="Merchant action">${(['buy','sell'] as const).map(mode=>`<button type="button" data-shop-tab="${mode}" aria-pressed="${tab===mode}">${mode==='buy'?'Buy':'Sell'}<span>${mode==='buy'?stock.length:sales.length}</span></button>`).join('')}</div><label for="shop-filter">Filter</label><select id="shop-filter">${filters.map(value=>`<option value="${value}"${value===filter?' selected':''}>${value==='loot'?'Monster loot':value[0].toUpperCase()+value.slice(1)} (${catalog.filter(entry=>value==='all'||entry.category===value).length})</option>`).join('')}</select></div><div class="training-list shop-list" style="--training-rows:${Math.max(1,visible.length)}" aria-label="${tab==='buy'?'Merchant stock':'Items to sell'}">${rows||`<div class="training-empty"><p>${tab==='sell'?'No items to sell in this category.':'No stock in this category.'}</p>${action}</div>`}</div><div class="shop-pagination"><button type="button" data-shop-page="${Math.max(0,page-1)}" ${page===0?'disabled':''} aria-label="Previous page">‹</button><span>Page ${page+1} of ${pages}</span><button type="button" data-shop-page="${Math.min(pages-1,page+1)}" ${page===pages-1?'disabled':''} aria-label="Next page">›</button></div><div class="training-footer shop-footer"><div class="training-wallet shop-wallet"><img src="/ui/merchant-emblem.png" width="30" height="30" alt=""/><strong>${number(player.gold)} gold</strong></div><span class="shop-capacity">${bagUsage(player)} / ${bagCapacity(player)} bag slots</span><p class="training-status" role="status">${pending.length?`Saving ${pending.length} sale${pending.length===1?'':'s'}…`:''}</p></div></div>`;
}
