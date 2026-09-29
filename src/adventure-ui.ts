import { goldSource, craftingGoldCost } from './gold-economy';
import { CONTRACTS, MAX_ACTIVE_CONTRACTS, RECIPES, recipeAllowed, craftingProgress, craftingXpGain, nextCraftingUnlock, recipeMaterialRows, recipeOutput, type Contract } from './adventure';
import { PROFESSION_RANKS, professionRank, professionDifficulty } from './skills';
import { gearArt, lootItemArt, gearSlotLabels } from './character-ui';
import { LOOT_ITEMS, LOOT_TABLES } from './loot-items';
import { MONSTERS, type EnemyKind } from './bestiary';
import { bagCanFit } from './bags';
import { getZone, type ZoneId } from './content';
import { GEAR } from './progression';
import { icon } from './icons';
import { renderHearthlingJournal } from './hearthling-ui';
import { renderTreasureMap, treasureMapSite } from './treasure-map-ui';
import type { Player, PartyState, PartyInvite } from './shared';

const escape = (value:string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderAdventureJournal(player:Player,pending=false,message='',selected='treasure',activeOnly=false){
 const treasure=renderTreasureMap(player,pending,message),site=treasureMapSite(player);
 const titleQuest=!activeOnly||!player.meadGodPaid;
 if(!treasure&&!titleQuest)return '<p class="quest-board-empty">No active adventures. Find a treasure map or choose a contract from the Noticeboard.</p>';
 const current=treasure&&(selected==='treasure'||!titleQuest)?'treasure':'hearthling';
 const stage=player.treasureMap?.stage,step=stage==='guardian'?2:stage==='chest'?3:1;
 return `<section class="adventure-journal" aria-label="Your adventures"><nav class="adventure-journal-list" aria-label="Choose an adventure">
 ${treasure?`<button type="button" data-adventure-quest="treasure" aria-pressed="${current==='treasure'}" aria-controls="adventure-detail"><img src="/ui/loot/treasure-map.png" width="64" height="64" alt=""><span><strong>Treasure-map expedition</strong><small>${site?`${escape(site.label)} · ${escape(getZone(site.zone).name)}`:'A map waiting to be opened'}</small><span class="adventure-journal-state">${stage?`Step ${step} / 3 · In progress`:pending?'Opening map…':'Ready to begin'}</span></span></button>`:''}
 ${titleQuest?`<button type="button" data-adventure-quest="hearthling" aria-pressed="${current==='hearthling'}" aria-controls="adventure-detail"><img src="/ui/pets/hearthling.png" width="64" height="64" alt=""><span><strong>Pons Lover</strong><small>MEADGod · Willowbrook</small><span class="adventure-journal-state${player.meadGodPaid?' is-complete':''}">${player.meadGodPaid?'Complete · Title unlocked':'Available · Title quest'}</span></span></button>`:''}
 <p class="adventure-journal-tip">${icon('route')} Track an adventure to follow its waypoint.</p></nav>
 <div class="adventure-journal-detail" id="adventure-detail" tabindex="-1">${current==='treasure'?treasure:renderHearthlingJournal(player)}</div></section>`;
}
export type AdventureBoardTab='active'|'noticeboard'|'completed';
export function renderAdventureTabs(selected:AdventureBoardTab){
 return `<nav class="adventure-board-tabs" aria-label="Adventure board sections">${(['active','noticeboard','completed'] as const).map(tab=>`<button type="button" data-adventure-tab="${tab}" aria-pressed="${tab===selected}">${{active:'Active',noticeboard:'Noticeboard',completed:'Completed'}[tab]}</button>`).join('')}</nav>`;
}
export function renderCompletedAdventures(player:Player,now:number){
 const completed=CONTRACTS.filter(c=>Object.hasOwn(player.contracts.completed,c.id));
 return `<section class="adventure-completed" aria-label="Completed adventures"><h3>Adventures remembered</h3>${player.quest?.completed?`<article><strong>The Lanterns Between</strong><span>Story complete</span><button type="button" class="adventure-link" data-quest-section="story">Read your story</button></article>`:''}${player.meadGodPaid?`<article><strong>Pons Lover</strong><span>Complete · Title unlocked</span><button type="button" class="adventure-link" data-open-hearthling>View title quest</button></article>`:''}${completed.map(c=>`<article><strong>${escape(c.label)}</strong><span>${escape(getZone(c.zone).name)} · ${player.contracts.completed[c.id]>now?`Returns in ${Math.ceil((player.contracts.completed[c.id]-now)/60000)}m`:'Available again at its noticeboard'}</span><button type="button" class="adventure-link" data-open-contract="${c.id}">View contract</button></article>`).join('')}${!completed.length&&!player.quest?.completed&&!player.meadGodPaid?'<p>Complete an adventure to see it here.</p>':''}</section>`;
}
function contractView(player:Player,c:Contract,zone:ZoneId,nearBoard:boolean,now:number){
 const progress=player.contracts.active[c.id],active=progress!==undefined,ready=active&&progress>=c.count;
 const remaining=Math.max(0,(player.contracts.completed[c.id]||0)-now),here=zone===c.zone&&nearBoard;
 const full=!active&&Object.keys(player.contracts.active).length>=MAX_ACTIVE_CONTRACTS,locked=!active&&player.level<(c.requiredLevel??1),disabled=!here||remaining>0||full||locked||active&&!ready;
 const status=ready?'Reward waiting':active?'Under way':remaining>0?'Posted again soon':locked?`Requires level ${c.requiredLevel}`:full?'Your journal is full':'Open contract';
 const reason=!here?'Visit a quest board or village warden in '+getZone(c.zone).name+'.':locked?`Reach level ${c.requiredLevel} before accepting this expedition.`:full?'Finish or cancel one of your active contracts to make room.':remaining>0?`This contract returns in ${Math.ceil(remaining/60000)}m.`:active&&!ready?'Complete the objective to collect your reward.':'';
 return {progress,active,ready,remaining,here,full,locked,disabled,status,reason};
}
function contractAction(c:Contract,view:ReturnType<typeof contractView>){
 const {active,ready,remaining,locked,disabled,reason}=view;
 return `<button type="button" class="primary-button quest-notice-action" ${active?(ready?`data-claim-contract="${c.id}"`:''):`data-accept-contract="${c.id}"`} ${disabled?'disabled':''}${reason?` title="${escape(reason)}"`:''}>${ready?'Claim reward':active?'In progress':remaining>0?`Returns in ${Math.ceil(remaining/60000)}m`:locked?`Level ${c.requiredLevel}`:'Accept quest'}</button>`;
}
export function renderContractDetail(player:Player,id:string,zone:ZoneId,nearBoard:boolean,now:number){
 const c=CONTRACTS.find(c=>c.id===id);if(!c)return '';
 const view=contractView(player,c,zone,nearBoard,now),progress=Math.min(c.count,view.progress??0);
 return `<article class="contract-detail" data-contract-detail="${c.id}" aria-labelledby="contract-detail-title">
 <button type="button" class="contract-back" data-contract-back>${icon('left')} Adventure board</button>
 <header class="contract-detail-heading"><img src="/ui/redesign/quest-emblem.svg" alt="" width="104" height="104"><div><span>Adventure contract</span><h3 id="contract-detail-title" tabindex="-1">${escape(c.label)}</h3></div></header>
 <div class="contract-description"><p>${escape(c.description)}</p><p>Return to a ${escape(getZone(c.zone).name)} board or warden after completing the objective.</p></div>
 <section class="contract-objectives" aria-labelledby="contract-objectives-title"><h4 id="contract-objectives-title">${icon('route')} Objectives</h4><div class="contract-objective"><span>${icon(view.ready?'check':'compass')}</span><strong>${escape(c.description)}</strong><span class="contract-count">${progress} / ${c.count}</span><progress value="${progress}" max="${c.count}" aria-label="${escape(c.label)} progress"></progress></div></section>
 <section class="contract-rewards" aria-labelledby="contract-rewards-title"><h4 id="contract-rewards-title">${icon('bag')} Rewards</h4><div class="contract-reward-cells"><div><span class="contract-xp" aria-hidden="true">XP</span><strong>${c.reward.xp} XP</strong></div><div>${icon('gold')}<strong>${goldSource(c.reward.gold,'contract',player.economyVersion===1)} Gold</strong></div></div></section>
 <p class="contract-detail-status" role="status">${view.status}${view.reason?` · ${escape(view.reason)}`:''}</p>
 <div class="contract-actions">${!view.active||view.ready?contractAction(c,view):''}<button type="button" class="primary-button contract-track" data-track-contract="${c.id}" ${view.active?'':'disabled title="Accept this contract before tracking it."'}>${icon('route')} Track quest</button><button type="button" class="primary-button contract-close" data-contract-close>${icon('close')} Close</button></div>
 ${view.active?`<button type="button" class="contract-cancel" data-cancel-contract="${c.id}" title="Discard this contract's progress without claiming a reward.">Cancel contract</button>`:''}
 </article>`;
}
export function renderContracts(player:Player,zone:ZoneId,nearBoard:boolean,now:number,page=0,activeOnly=false){
 const activeCount=Object.keys(player.contracts.active).length;
 const contracts=CONTRACTS.filter(c=>activeOnly?Object.hasOwn(player.contracts.active,c.id):c.zone===zone||Object.hasOwn(player.contracts.active,c.id));
 const pageCount=Math.max(1,Math.ceil(contracts.length/3));
 page=Math.max(0,Math.min(pageCount-1,Number.isFinite(page)?Math.floor(page):0));
 return `<section class="quest-board" data-contract-page-current="${page}" data-contract-page-count="${pageCount}" aria-label="Quest notices">
 <div class="quest-board-invitation">${icon('menu-journal')}<span>The lanternkeepers need you.</span> Choose your next adventure.</div>
 <div class="quest-board-meta"><span>${escape(getZone(zone).name)} noticeboard</span><span>${activeCount} / ${MAX_ACTIVE_CONTRACTS} active contracts</span></div>
 <div class="quest-notices">${contracts.slice(page*3,page*3+3).map(c=>{
  const view=contractView(player,c,zone,nearBoard,now),{progress,active,ready,remaining,here,full,locked,status}=view;
  const scene=c.kind==='kill'?'hunt':c.kind;
  const category={kill:'Patrol request',gather:'Gathering request',craft:'Workshop request',dungeon:'Dungeon expedition'}[c.kind];
  return `<article class="quest-notice${ready?' quest-notice--ready':''}" data-contract-id="${c.id}" data-contract-state="${ready?'ready':active?'active':remaining>0||locked||full?'unavailable':'available'}" aria-labelledby="notice-${c.id}">
   <header class="quest-notice-heading"><img class="quest-notice-art" src="/ui/quest-board/${scene}.png" alt="" width="72" height="72"><div><small>${category}</small><h3 id="notice-${c.id}" tabindex="-1"><button type="button" class="quest-notice-open" data-open-contract="${c.id}" aria-label="View ${escape(c.label)}">${escape(c.label)}</button></h3></div></header>
   <div class="quest-notice-copy"><span class="quest-notice-status">${ready?'✓ ':''}${status}</span><p>${escape(c.description)}</p>
   ${active?`<div class="quest-notice-progress"><span>Objective</span><strong>${progress} / ${c.count}</strong><progress value="${Math.min(progress,c.count)}" max="${c.count}" aria-label="${escape(c.label)} progress"></progress></div>`:''}</div>
   <footer class="quest-notice-footer"><div class="quest-notice-reward"><small>REWARD</small><span>${c.reward.xp} XP · ${goldSource(c.reward.gold, 'contract', player.economyVersion === 1)} gold</span></div>
   ${contractAction(c,view)}
   ${active?`<button type="button" class="quest-notice-cancel" data-cancel-contract="${c.id}" aria-label="Cancel ${escape(c.label)}" title="Discard this contract's progress without claiming a reward.">Cancel contract</button>`:''}
   ${active&&!here?`<button class="quest-notice-route" data-find-board="${c.zone}">${icon('route')} Find a board or village warden</button>`:`<small class="quest-notice-hint">${full?'Finish or cancel a contract to make room.':!here?'Visit the local board to accept.':ready?'Thank you, adventurer.':active?'Return here when you are ready.':'An adventure awaits.'}</small>`}</footer>
  </article>`;
 }).join('')}</div>${!contracts.length?'<p class="quest-board-empty">No active contracts. Choose a quest from the Noticeboard to begin.</p>':''}
 <div class="quest-board-footer"><nav class="quest-board-tabs" aria-label="Quest sections"><button data-quest-section="story">${icon('beacon')} The lantern story</button></nav>
 <nav class="quest-board-pages" aria-label="Notice pages"><button class="primary-button" data-contract-page="${page-1}" aria-label="Previous notices" ${page===0?'disabled':''}>‹</button><span aria-live="polite">${page+1} / ${pageCount}</span><button class="primary-button" data-contract-page="${page+1}" aria-label="Next notices" ${page===pageCount-1?'disabled':''}>›</button></nav></div>
 ${!nearBoard?`<button class="quest-board-find" data-find-board="${zone}">${icon('route')} Find ${escape(getZone(zone).name)} quests</button>`:''}
 </section>`;
}
export function renderCrafting(player:Player,nearWorkshop:boolean){
 const progress=craftingProgress(player.craftingXp),rank=professionRank(player.craftingXp),next=nextCraftingUnlock(player.appearance.className,player.craftingXp);
 const recipes=RECIPES.filter(r=>!r.className||r.className===player.appearance.className);
 const practice=recipes.filter(r=>!r.output.gear&&r.requiredCraftingLevel===rank.level&&r.requiredLevel<=player.level).sort((a,b)=>craftingXpGain(b,player.craftingXp)-craftingXpGain(a,player.craftingXp))[0];
 const experience=progress.nextLevelXp?`${progress.xp.toLocaleString('en-US')} / ${progress.nextLevelXp.toLocaleString('en-US')} XP to level ${progress.level+1}`:'Level 99 · maximum level';
 const materialLabels={wood:'Wood',crystal:'Lantern fragments',herb:'Wild herbs',relic:'Rootvault relics'};
 const materialIcons={wood:'wood',crystal:'crystal',herb:'leaf',relic:'heartroot'};
 const disciplines={alchemy:'Alchemy',smithing:'Smithing',woodworking:'Woodworking'};
 const difficulties={locked:'Locked',challenging:'Challenging',practiced:'Practiced',familiar:'Familiar',mastered:'Mastered'};
 return `<div class="crafting-book"><header class="crafting-heading">${icon("crafting")}<div><span>GATHER · CRAFT · ADVENTURE</span><h3>The workshop</h3><p>${recipes.length} recipes for your ${player.appearance.className.toLowerCase()} · one batch per craft</p></div></header><section class="crafting-progress" aria-label="Crafting progression"><div class="profession-heading"><h3>Your workshop craft</h3><span class="profession-level">${rank.label} · Level ${progress.level}</span></div><p>Practice alchemy, smithing and woodworking. Recipes unlock as your crafting level grows.</p><div class="profession-progress-label"><span>${experience}</span><span>Crafting experience: ${player.craftingXp.toLocaleString('en-US')}</span></div><progress class="profession-progress" max="100" value="${progress.percent}" aria-label="Crafting experience" aria-valuetext="${experience}">${experience}</progress><ol class="crafting-ranks" aria-label="Crafting ranks">${PROFESSION_RANKS.map(tier=>`<li ${tier.id===rank.id?'aria-current="step"':''} class="${progress.level>=tier.level?'unlocked':'locked'}"><strong>${tier.label}</strong><span>Level ${tier.level}</span></li>`).join('')}</ol><p class="crafting-practice">${practice&&craftingXpGain(practice,player.craftingXp)>0?`<strong>Practice ${escape(practice.label.toLowerCase())}</strong> for ${craftingXpGain(practice,player.craftingXp).toLocaleString('en-US')} crafting XP per batch.`:'Your crafting journey is complete. Every recipe remains available.'}</p><p class="crafting-next">${next?`<strong>Next at crafting ${next.level}:</strong> ${escape(next.recipes.map(r=>r.label).join(', '))}.`:progress.level===99?'Every recipe unlocked. Maximum crafting level reached.':'Every recipe unlocked. Craft artisan recipes to keep growing toward level 99.'}</p></section><div class="crafting-workshop"><span>${icon('crafting')}${nearWorkshop?'At the workshop · ready to craft':'Craft at a village workshop'}</span>${!nearWorkshop?`<button type="button" class="adventure-link" data-find-workshop>${icon('route')} Find a workshop</button>`:''}</div><div class="craft-materials" aria-label="Materials in your bag">${(Object.keys(materialLabels) as (keyof typeof materialLabels)[]).map(name=>`<span>${icon(materialIcons[name])}<strong>${(player.inventory[name]??0).toLocaleString('en-US')}</strong> ${materialLabels[name]}</span>`).join('')}</div><div class="crafting-gather-link"><button type="button" class="adventure-link" data-open-professions>${icon('route')} Find gathering resources</button><span>Each recipe shows what you have / need.</span></div><div class="crafting-recipes">${PROFESSION_RANKS.map(tier=>{
 const tierRecipes=recipes.filter(r=>r.requiredCraftingLevel>=tier.level&&r.requiredCraftingLevel<=tier.maxLevel).sort((a,b)=>Number(b.id===practice?.id)-Number(a.id===practice?.id));
 if(!tierRecipes.length)return '';
 const unlocked=progress.level>=tier.level;
 return `<details class="crafting-rank-section" data-crafting-rank="${tier.id}" ${tier.id===rank.id||next?.level===tier.level?'open':''}><summary><span><strong>${tier.label} recipes</strong><small>Crafting ${tier.level}${tier.id===rank.id?' · Your current rank':''}</small></span><span>${tierRecipes.length} recipes${unlocked?'':' · Locked'}</span></summary><div class="adventure-list">${tierRecipes.map(r=>{
 const gear=r.output.gear?GEAR[r.output.gear]:undefined,item=r.output.item?LOOT_ITEMS[r.output.item]:undefined,owned=!!gear&&player.ownedGear.includes(gear.id);
 const materials=recipeMaterialRows(player,r).map(material=>({...material,label:materialLabels[material.id as keyof typeof materialLabels]??material.label})),missing=materials.filter(material=>material.owned<material.quantity);
 const cost=craftingGoldCost(r,player.economyVersion===1),allowed=(!cost||player.gold>=cost)&&recipeAllowed(player,r)&&bagCanFit(player,recipeOutput(player,r)),difficulty=professionDifficulty(r.requiredCraftingLevel,player.craftingXp),xp=craftingXpGain(r,player.craftingXp);
 const reasons=[player.gold<cost?`Need ${cost} gold`:'',owned?'Already in your equipment collection':'',progress.level<r.requiredCraftingLevel?`Reach crafting level ${r.requiredCraftingLevel}`:'',player.level<r.requiredLevel?`Reach adventure level ${r.requiredLevel}`:'',missing.length?`Missing: ${missing.map(material=>`${material.quantity-material.owned} ${material.label.toLowerCase()}`).join(', ')}`:'',!nearWorkshop?'Visit a village workshop':''].filter(Boolean);
 if(!allowed&&!reasons.length)reasons.push('Make room in your inventory for this output');
 const stats=gear?[gear.stats.primaryDamage?`+${gear.stats.primaryDamage} attack damage`:'',gear.stats.specialDamage?`+${gear.stats.specialDamage} skill damage`:'',gear.stats.defense?`+${gear.stats.defense} armor`:''].filter(Boolean).join(' · '):item?`${r.output.quantity??1} ${item.label.toLowerCase()}${(r.output.quantity??1)>1?'s':''}${item.heal?` · Restores ${item.heal} health each`:''}`:r.output.resource==='potion'?`${r.output.quantity??1} healing ${(r.output.quantity??1)===1?'potion':'potions'} · Restores 55 health each`:`${r.output.quantity??1} ${materialLabels[r.output.resource as keyof typeof materialLabels]??r.output.resource}`;
 const outputArt=gear?gearArt(gear):r.output.item?lootItemArt(r.output.item):icon(r.output.resource==='herb'?'leaf':r.output.resource??'crafting');
 return `<article class="adventure-entry crafting-recipe" data-recipe-id="${r.id}"><div class="adventure-entry-heading">${outputArt}<div><h3>${escape(r.label)}</h3><small>${disciplines[r.discipline]} · Crafting ${r.requiredCraftingLevel}${gear?` · ${gearSlotLabels[gear.slot]} · Adventure ${r.requiredLevel}`:''}</small></div></div><p class="recipe-description">${escape(r.description)}</p><p class="recipe-output">${escape(stats)}</p>${cost?`<p class="recipe-gold-cost">Crafting fee: ${cost} gold · You have ${player.gold}</p>`:''}<ul class="recipe-cost" aria-label="Ingredients, have / need">${materials.map(material=>{
 const short=material.owned<material.quantity,gatherable=material.id==='wood'||material.id==='crystal'||material.id==='herb';
 const source=material.id==='relic'?'Recovered from the Rootvault':!gatherable?`Loot: ${Object.entries(LOOT_TABLES).filter(([,drops])=>drops.some(drop=>drop.kind==='item'&&drop.itemId===material.id)).map(([kind])=>MONSTERS[kind as EnemyKind].name).join(', ')}`:'';
 return `<li class="${short?'missing':'supplied'}"><span>${escape(material.label)}</span><strong>${material.owned.toLocaleString('en-US')} / ${material.quantity.toLocaleString('en-US')}</strong>${short&&gatherable?`<button type="button" class="adventure-link" data-find-material="${material.id}" aria-label="Find ${escape(material.label.toLowerCase())}">${icon('route')} Find</button>`:''}${source?`<small class="recipe-material-source">${escape(source)}</small>`:''}</li>`;
 }).join('')}</ul><div class="adventure-entry-footer"><span class="recipe-experience"><span class="profession-difficulty" data-difficulty="${difficulty}">${difficulties[difficulty]}</span>${difficulty==='locked'?'XP available when unlocked':xp?`+${xp} crafting XP`:'No crafting XP · mastered recipe'}</span><button type="button" class="primary-button" data-craft="${r.id}" aria-describedby="recipe-reason-${r.id}" ${!nearWorkshop||!allowed?'disabled':''}>${owned?'Already owned':progress.level<r.requiredCraftingLevel?`Crafting ${r.requiredCraftingLevel} required`:player.level<r.requiredLevel?`Adventure ${r.requiredLevel} required`:missing.length?'Need materials':!nearWorkshop?'Workshop required':allowed?`Craft${cost?` · ${cost} gold`:''}`:player.gold<cost?'Need gold':'Inventory full'}</button></div><p class="recipe-reason" id="recipe-reason-${r.id}">${reasons.length?escape(reasons.join(' · ')):`${r.output.gear?'Creates one piece of equipment.':'Repeatable recipe.'} Materials are consumed when crafted.`}</p></article>`;
 }).join('')}</div></details>`;
 }).join('')}</div></div>`;
}
const healthWidth = (hp:number,maxHp:number) => Number.isFinite(hp)&&maxHp>0?Math.min(100,Math.max(0,hp/maxHp*100)):0;
export function partyHUD(party:PartyState|null,invites:PartyInvite[]){
 if(!party)return invites.length?`<span class="party-hud-title">${icon('user')}<span>${invites.length} party invitation${invites.length===1?'':'s'}</span></span><span class="party-hud-hint">Open to join or decline</span>`:'';
 return `<span class="party-hud-title">${icon('user')}<span>PARTY · ${party.members.length} / 4</span></span>${party.members.map(p=>`<span class="party-hud-member"><span class="party-hud-name">${escape(p.name)}</span><span class="party-health"><span style="width:${healthWidth(p.hp,p.maxHp)}%"></span></span></span>`).join('')}${invites.length?`<span class="party-hud-hint">${invites.length} invitation${invites.length===1?'':'s'} waiting</span>`:''}`;
}
