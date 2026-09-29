import type { DungeonRecord, DungeonResult, DungeonState, Player } from './shared';
import type { DungeonId } from './dungeon';
import { gearById } from './progression';
import { gearArt } from './character-ui';
import { lootAllBlockReason, lootEntryBlockReason } from './loot-ui';
import { icon } from './icons';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function dungeonTime(milliseconds:number,precise=false){
  const ms=Math.max(0,Math.floor(Number.isFinite(milliseconds)?milliseconds:0)),seconds=Math.floor(ms/1000);
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}${precise?`.${(ms%1000).toString().padStart(3,'0')}`:''}`;
}
export function dungeonElapsed(state:DungeonState,now:number){
  return state.result?.durationMs??(state.startedAt?Math.max(state.elapsedMs??0,now-state.startedAt):0);
}
export function renderDungeonResult(result:DungeonResult,player:Player){
  const equipment=result.items.find(item=>item.kind==='gear'),gear=equipment&&gearById(equipment.itemId);
  const crystal=result.items.find(item=>item.kind==='resource'&&item.itemId==='crystal');
  const relic=result.items.find(item=>item.kind==='resource'&&item.itemId==='relic');
  const slots=[
    {name:'Completion XP',art:icon('book'),amount:`+${result.xp.toLocaleString('en-US')} XP`,note:'Awarded to you',entry:undefined},
    {name:'Equipment roll',art:gear?gearArt(gear):icon('bag'),amount:gear?.label??'No equipment',note:equipment?`${equipment.quality} · Level ${gear?.requiredLevel??player.level}`:'No eligible item this run',entry:equipment},
    {name:'Lantern fragments',art:icon('crystal'),amount:crystal?`×${crystal.quantity}`:'—',note:'Upgrade material',entry:crystal},
    {name:'Rootvault relics',art:icon('heartroot'),amount:relic?`×${relic.quantity}`:'—',note:'Includes completion bonus',entry:relic},
  ];
  const remaining=result.items.filter(item=>!result.remainingItemIds||result.remainingItemIds.includes(item.id));
  const blocked=result.claimed?undefined:lootAllBlockReason(player,remaining);
  return `<section class="dungeon-result" aria-label="Dungeon results"><header class="dungeon-result-heading"><span class="eyebrow">FINAL BOSS DEFEATED</span><h3>${icon('crown')} Dungeon complete</h3><p>Your final time <strong>${dungeonTime(result.durationMs,true)}</strong></p></header><dl class="dungeon-result-stats"><div><dt>Monsters defeated</dt><dd>${result.kills}</dd></div><div><dt>Party size</dt><dd>${result.partySize}</dd></div><div><dt>Wipes</dt><dd>${result.wipes}</dd></div></dl><p class="dungeon-ranking-note">${result.ranked?'Time recorded. Refresh to see the latest records.':result.unrankedReason==='Leaderboard save pending.'?'Saving leaderboard record…':`Unranked · ${escape(result.unrankedReason||'This run does not qualify for the leaderboard.')}`}</p><div class="dungeon-reward-slots">${slots.map(slot=>{
    const collected=result.claimed||!!slot.entry&&!remaining.includes(slot.entry);
    const reason=slot.entry&&!collected?lootEntryBlockReason(player,slot.entry):undefined;
    return `<article class="dungeon-reward-slot${slot.entry?` quality-${slot.entry.quality}`:''}"><small>${slot.name}</small><span class="dungeon-reward-art bag-slot${slot.entry?` quality-${slot.entry.quality}`:''}">${slot.art}</span><strong>${escape(slot.amount)}</strong><span>${escape(slot.note)}</span>${slot.entry?`<button type="button" class="primary-button" data-dungeon-reward="${escape(slot.entry.id)}" ${collected||reason?'disabled':''}>${collected?'Collected':reason?escape(reason):'Collect'}</button>`:'<span class="dungeon-reward-status">'+(slot.name==='Completion XP'?'Awarded':'Roll complete')+'</span>'}</article>`;
  }).join('')}</div><div class="dungeon-reward-footer"><p role="status">${result.claimed?'All rewards collected.':blocked?escape(blocked)+'. Collect available slots separately.':'Your reward roll is fixed. Collect it before leaving this run.'}</p><button type="button" class="primary-button" data-dungeon-claim ${result.claimed||blocked?'disabled':''}>${result.claimed?'Rewards collected':'Collect all rewards'}</button></div></section>`;
}
let rewardReveal={key:'',startedAt:0};
/** Shared cosmetic reel: the server outcome and reward claims never change. */
export function revealRewardSlots(section:HTMLElement,key:string,skip=false){
  const slots=[...section.querySelectorAll<HTMLElement>('.dungeon-reward-slot')];if(!slots.length)return;
  const now=performance.now();
  if(rewardReveal.key!==key)rewardReveal={key,startedAt:now};
  if(skip||matchMedia('(prefers-reduced-motion: reduce)').matches||!section.animate){rewardReveal.startedAt=-Infinity;return;}
  const elapsed=now-rewardReveal.startedAt;
  if(elapsed>=1700+(slots.length-1)*450)return;
  const collect=section.querySelector<HTMLButtonElement>('[data-dungeon-claim]'),collectDisabled=collect?.disabled;
  const message=section.querySelector<HTMLElement>('.dungeon-reward-footer [role="status"]'),finalMessage=message?.textContent;
  const symbols=['book','sword','crystal','shield','heartroot','bow'].map(name=>icon(name));
  section.setAttribute('aria-busy','true');if(collect)collect.disabled=true;if(message)message.textContent='Revealing your rewards…';
  let pending=0;
  slots.forEach((slot,index)=>{
    const duration=1700+index*450;if(elapsed>=duration)return;
    const art=slot.querySelector<HTMLElement>('.dungeon-reward-art')!,finalArt=art.innerHTML;
    const status=slot.querySelector<HTMLElement>('button,.dungeon-reward-status'),finalStatus=status?.textContent;
    const button=slot.querySelector<HTMLButtonElement>('button'),disabled=button?.disabled;
    pending++;slot.classList.add('is-rolling');art.setAttribute('aria-hidden','true');if(status)status.textContent='Rolling…';if(button)button.disabled=true;
    // These symbols are cosmetic; the last cell is always the server's saved reward.
    art.innerHTML=`<span class="dungeon-reel-track">${Array.from({length:18},(_,step)=>`<span class="dungeon-reel-symbol">${symbols[(step+index*2)%symbols.length]}</span>`).join('')}<span class="dungeon-reel-symbol">${finalArt}</span></span>`;
    const animation=art.firstElementChild!.animate([{transform:'translateY(0)'},{transform:`translateY(-${18/19*100}%)`}],{duration,easing:'cubic-bezier(.12,.65,.18,1)',fill:'forwards'});
    animation.currentTime=elapsed;
    animation.onfinish=()=>{
      art.innerHTML=finalArt;art.removeAttribute('aria-hidden');slot.classList.remove('is-rolling');if(status)status.textContent=finalStatus??'';if(button)button.disabled=!!disabled;
      if(--pending===0){section.removeAttribute('aria-busy');if(collect)collect.disabled=!!collectDisabled;if(message)message.textContent=finalMessage??'';}
    };
  });
}
export function revealDungeonRewards(root:HTMLElement,result:DungeonResult,playerId:string){
  const section=root.querySelector<HTMLElement>('.dungeon-result');if(!section)return;
  revealRewardSlots(section,`dungeon:${playerId}:${result.lootId}`,result.claimed||!!result.remainingItemIds&&result.remainingItemIds.length<result.items.length);
}

export interface DungeonBoard { dungeonId:DungeonId; partySize:number; requestId:number; loading:boolean; entries:DungeonRecord[]; error?:string }
export function renderDungeonLeaderboard(board:DungeonBoard){
  return `<section class="dungeon-leaderboard" aria-labelledby="dungeon-board-title"><header><div><span class="eyebrow">ALL REALMS · TOP 20</span><h3 id="dungeon-board-title">Fastest clears</h3></div><button type="button" class="primary-button" data-dungeon-board-refresh ${board.loading?'disabled':''}>${board.loading?'Loading…':'Refresh'}</button></header><div class="dungeon-board-sizes" role="group" aria-label="Leaderboard party size">${[1,2,3,4].map(size=>`<button type="button" data-dungeon-board-size="${size}" aria-pressed="${board.partySize===size}">${size===1?'Solo':`${size} players`}</button>`).join('')}</div><p class="journey-note">Full clears, including side chambers. The clock starts in the first combat room and keeps running through wipes and rejoining an active run. Keep the same party for a ranked time.</p>${board.loading?'<p class="dungeon-board-message" role="status">Loading dungeon records…</p>':board.error?`<p class="dungeon-board-message" role="alert">${escape(board.error)} Use Refresh to try again.</p>`:!board.entries.length?'<p class="dungeon-board-message">No ranked clears yet. Set the first time.</p>':`<ol class="dungeon-records">${board.entries.map((record,index)=>`<li><span class="dungeon-record-rank" aria-label="Rank ${index+1}">${index+1}</span><div class="dungeon-record-party"><strong>${record.members.map(member=>escape(member.name)).join(' · ')}</strong><small>${record.members.map(member=>`${escape(member.className)} ${member.level}`).join(' / ')} · ${record.wipes} wipes · ${escape(record.realmId.toUpperCase())}</small></div><time>${dungeonTime(record.durationMs,true)}</time></li>`).join('')}</ol>`}</section>`;
}
