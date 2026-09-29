import type { Player } from './shared';
import { icon } from './icons';
import { abilityUnlocked, spellsForClass, spellDamage, spellTotalPower, spellUtilityLabel } from './spells';
import { combatStats } from './progression';
import { spellTimingLabel } from './casting';
import { MOUNTS, MOUNT_UNLOCK_LEVEL, MOUNT_UPGRADE_LEVEL, mountSpeed } from './travel';
import { RIDING_LESSONS, MOUNT_PRICES, spellTrainingCost, type TrainerNPC } from './training';

export type TrainingFilter = 'all' | 'available' | 'unavailable' | 'learned';
export interface TrainingOptions { selected?:string; filter?:TrainingFilter; pending?:boolean }
type TrainingEntry = { id:string; label:string; art:string; level:number; cost:number; learned:boolean; reason:string; description:string; details:string; requirements:string; action:string };
const filters: readonly TrainingFilter[] = ['all','available','unavailable','learned'];
const status = (entry:TrainingEntry) => entry.learned ? 'learned' : entry.reason ? 'unavailable' : 'available';

export function renderTraining(player:Player,trainer:TrainerNPC,options:TrainingOptions={}):string {
  const wallet=`<div class="training-wallet">${icon('gold')}<strong>${player.gold} gold</strong></div>`;
  if(trainer.className&&trainer.className!==player.appearance.className){
    return `<div class="training-shell"><p class="training-guidance">I teach ${trainer.className} abilities. Your calling needs a ${player.appearance.className} trainer.</p><div class="training-footer">${wallet}</div><div class="training-links"><button type="button" data-find-trainer="class">${icon('route')} Find your class trainer</button></div></div>`;
  }
  const entries:TrainingEntry[]=[],buying=trainer.role==='mount-seller';
  let links='';
  if(trainer.className){
    const stats=combatStats(player);
    for(const spell of spellsForClass(trainer.className).filter(spell=>!spell.requiredTalent).sort((a,b)=>a.requiredLevel-b.requiredLevel)){
      const learned=abilityUnlocked(spell.id,trainer.className,player.level,player.learnedSpells),cost=spellTrainingCost(spell.id);
      const power=spellDamage(spell,stats),total=spellTotalPower(spell,stats),poison=spell.status?.ticks?total-power:0;
      const utility=spellUtilityLabel(spell);
      const effect=spell.effect==='heal'?'Healing':spell.effect==='shield'?'Absorption':'Damage';
      const reason=learned?'Learned':player.level<spell.requiredLevel?`Requires level ${spell.requiredLevel}`:player.gold<cost?`Requires ${cost} gold`:'';
      entries.push({id:spell.id,label:spell.label,art:icon(spell.icon),level:spell.requiredLevel,cost,learned,reason,
        description:spell.description,action:`data-learn-spell="${spell.id}"`,requirements:`Requires level ${spell.requiredLevel} · ${trainer.className}`,
        details:`${utility?`<dt>Effect</dt><dd>${utility}</dd>`:`<dt>${effect}</dt><dd>${power} per target${spell.channel?` per tick · ${total} total`:""}</dd>`}${poison?`<dt>${spell.status?.kind==='burn'?'Burn':'Poison'} damage</dt><dd>${poison} over ${spell.status!.durationMs/1000}s</dd>`:''}<dt>Cast time</dt><dd>${spellTimingLabel(spell,player.combatTalents,Date.now(),stats)}</dd><dt>Range</dt><dd>${spell.targetRelation==='self'?'Self':`${spell.range}m`}</dd>${spell.shieldDurationMs?`<dt>Duration</dt><dd>${spell.shieldDurationMs/1000}s</dd>`:''}<dt>Cooldown</dt><dd>${Number((spell.cooldownMs/1000).toFixed(3))}s</dd>`});
    }
    links=`<button type="button" data-open-spellbook>${icon('book')} Open spellbook</button>`;
  }else if(trainer.role==='riding-trainer'){
    for(const lesson of RIDING_LESSONS){
      const rank=player.ridingRank??0,learned=rank>=lesson.rank;
      const reason=learned?'Learned':player.level<lesson.level?`Requires level ${lesson.level}`:rank<lesson.rank-1?'Learn apprentice riding first':player.gold<lesson.cost?`Requires ${lesson.cost} gold`:'';
      const speed=mountSpeed(lesson.level,lesson.rank);
      entries.push({id:`riding-${lesson.rank}`,label:lesson.label,art:'<img src="/ui/mount-horse.png" alt=""/>',level:lesson.level,cost:lesson.cost,learned,reason,
        description:lesson.rank===1?'Learn to ride mounts from your collection.':'Increase the speed of every mount in your collection.',
        details:`<dt>Mounted speed</dt><dd>${speed} m/s</dd>`,requirements:`Requires level ${lesson.level}${lesson.rank===2?' · Apprentice riding':''}`,
        action:`data-learn-riding="${lesson.rank}"`});
    }
    links=`<button type="button" data-find-trainer="mount-seller">${icon('route')} Find a mount seller</button>`;
  }else{
    for(const mount of MOUNTS){
      if(mount.storeOnly||mount.dropOnly||'referralOnly' in mount)continue;
      const cost=MOUNT_PRICES[mount.id],learned=player.ownedMounts?.includes(mount.id)??false;
      const reason=learned?'Owned':player.level<MOUNT_UNLOCK_LEVEL?`Requires level ${MOUNT_UNLOCK_LEVEL}`:!player.ridingRank?'Learn riding first':player.gold<cost?`Requires ${cost} gold`:'';
      entries.push({id:`mount-${mount.id}`,label:mount.name,art:`<img src="/ui/mount-${mount.id}.png" alt=""/>`,level:MOUNT_UNLOCK_LEVEL,cost,learned,reason,
        description:`Adds ${mount.name} to this character’s mount collection. Your riding rank sets its speed.`,
        details:`<dt>Apprentice speed</dt><dd>${mountSpeed(MOUNT_UNLOCK_LEVEL,1)} m/s</dd><dt>Expert speed</dt><dd>${mountSpeed(MOUNT_UPGRADE_LEVEL,2)} m/s</dd>`,
        requirements:`Requires level ${MOUNT_UNLOCK_LEVEL} · Apprentice riding`,action:`data-buy-mount="${mount.id}"`});
    }
    links=`<button type="button" data-find-trainer="riding-trainer">${icon('route')} Find riding trainer</button><button type="button" data-open-mounts><img src="/ui/mount-horse.png" alt=""/> Your mounts</button>`;
  }
  const filter=filters.includes(options.filter??'all')?options.filter??'all':'all';
  const visible=entries.filter(entry=>filter==='all'||status(entry)===filter);
  const selected=visible.find(entry=>entry.id===options.selected)||visible.find(entry=>!entry.reason)||visible[0];
  const actionLabel=buying?'Buy mount':'Train';
  const message=options.pending?'Saving…':selected?.reason??'Choose another filter to see training options.';
  const action=`<button type="button" class="primary-button training-primary" ${selected?.action??''}${!selected||selected.reason||options.pending?' disabled':''} aria-busy="${!!options.pending}">${options.pending?'Saving…':selected?.learned?(buying?'Owned':'Learned'):actionLabel}</button>`;
  const detail=selected?`<aside class="training-detail" aria-label="Selected training details"><div class="training-detail-heading">${selected.art}<h3>${selected.label}</h3></div><p>${selected.description}</p><dl class="training-stats">${selected.details}</dl><p class="training-requirements">${selected.requirements}</p><p class="training-detail-cost">Cost: ${selected.cost===0?'Free':`${selected.cost} gold`}</p>${action}<p class="training-status" role="status">${message}</p></aside>`:'';
  // One detail/action node follows its row in reading order; the desktop grid places it beside the list.
  const rows=visible.map((entry,index)=>{
    const state=status(entry),active=entry===selected;
    const stateLabel=entry.learned?(buying?'Owned':'Learned'):entry.reason||`Requires level ${entry.level}`;
    return `<button type="button" class="training-entry ${state}${active?' selected':''}" style="--training-row:${index+1}" data-training-select="${entry.id}" data-training-state="${state}" aria-pressed="${active}" aria-label="${entry.label}. Requires level ${entry.level}. ${entry.cost} gold. ${entry.reason||'Available'}">${entry.art}<span class="training-entry-copy"><strong>${entry.label}</strong><small>${stateLabel}</small></span><span class="training-cost" title="${entry.cost} gold">${entry.learned?icon('check'):entry.cost===0?'Free':`${entry.cost} ${icon('gold')}`}</span></button>${active?detail:''}`;
  }).join('');
  const filterLabels:Record<TrainingFilter,string>={all:'All',available:buying?'Can buy':'Can learn',unavailable:'Unavailable',learned:buying?'Owned':'Learned'};
  return `<div class="training-shell training-catalog"><div class="training-toolbar"><div class="training-filters" id="training-filter" role="group" aria-label="Training filter">${filters.map(value=>`<button type="button" data-training-filter="${value}" aria-pressed="${value===filter}">${filterLabels[value]}<span>${entries.filter(entry=>value==='all'||status(entry)===value).length}</span></button>`).join('')}</div></div><div class="training-list" style="--training-rows:${Math.max(1,visible.length)}" aria-label="${buying?'Mounts for sale':'Training options'}">${rows||`<div class="training-empty"><p>No options match this filter.</p>${action}</div>`}</div><div class="training-footer">${wallet}<span class="training-student">Level ${player.level} ${player.appearance.className}</span><div class="training-links">${links}</div></div></div>`;
}
