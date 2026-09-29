import { goldSource } from './gold-economy';
import type { ClientMessage, LootDrop, Player } from './shared';
import { LOOT_ITEMS, lootItemValid, lootRows, type LootEntry } from './loot-items';
import { gearById, gearIdValid } from './progression';
import { bagCanFit } from './bags';
import { gearArt, gearBonuses, gearSlotLabels, lootItemArt } from './character-ui';
import { icon } from './icons';

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]!);
const number=(value:number)=>value.toLocaleString('en-US');
const resources:Record<string,{label:string;icon:string}>={wood:{label:'Wood',icon:'wood'},crystal:{label:'Lantern fragments',icon:'crystal'},herb:{label:'Wild herbs',icon:'leaf'},potion:{label:'Healing potion',icon:'potion'},relic:{label:'Rootvault relics',icon:'heartroot'}};
const label=(row:LootEntry)=>row.kind==='gold'?'Gold':row.kind==='item'&&lootItemValid(row.itemId)?LOOT_ITEMS[row.itemId].label:row.kind==='gear'?gearById(row.itemId)?.label||'Unknown equipment':resources[row.itemId]?.label||'Unknown item';
const art=(row:LootEntry)=>row.kind==='gold'?icon('gold'):row.kind==='item'?lootItemArt(row.itemId):row.kind==='gear'&&gearIdValid(row.itemId)?gearArt(gearById(row.itemId)!):icon(resources[row.itemId]?.icon||'bag');
const description=(row:LootEntry,player:Player)=>{
  if(row.kind==='gold')return 'Currency';
  if(row.kind==='item'&&lootItemValid(row.itemId)){const item=LOOT_ITEMS[row.itemId];return item.category==='mount'?'Unlearned mount · Learn, mint or auction':item.category==='pet'?'Unlearned pet · Learn or auction':`${item.category==='junk'?'Vendor junk':item.category==='food'?'Food':item.category==='potion'?'Potion':'Treasure'} · ${goldSource(item.sellPrice,'resale',player.economyVersion===1)} gold each`;}
  if(row.kind==='gear'&&gearIdValid(row.itemId)){const gear=gearById(row.itemId)!;return `Level ${gear.requiredLevel}${gear.className?` ${gear.className}`:''} · ${gearSlotLabels[gear.slot]} · ${gearBonuses(gear.stats)}`;}
  return row.itemId==='potion'?'Restores 55 health':'Crafting material';
};
function withEntry(player:Player,row:LootEntry):Player {
  if(row.kind==='gold')return {...player,gold:player.gold+row.quantity};
  if(row.kind==='gear')return {...player,ownedGear:[...player.ownedGear,row.itemId]};
  if(row.kind==='item')return {...player,carriedItems:{...player.carriedItems,[row.itemId]:(player.carriedItems?.[row.itemId]||0)+row.quantity}};
  const id=row.itemId as keyof Player['inventory'];return {...player,inventory:{...player.inventory,[id]:player.inventory[id]+row.quantity}};
}
/** Mirrors visible eligibility; private reservations and the final transfer remain server-authoritative. */
export function lootEntryBlockReason(player:Player,row:LootEntry):string|undefined {
  if(!Number.isSafeInteger(row.quantity)||row.quantity<=0)return 'Unavailable';
  if(row.kind==='gold')return Number.isSafeInteger(player.gold+row.quantity)?undefined:'Gold limit reached';
  if(row.kind==='gear'){
    if(!gearIdValid(row.itemId)||row.quantity!==1)return 'Unavailable';
    const gear=gearById(row.itemId)!;
    if(player.ownedGear.includes(row.itemId)||player.auctions?.some(listing=>listing.item.kind==='gear'&&listing.item.id===row.itemId))return 'Already owned';
    if(gear.className&&gear.className!==player.appearance.className)return `${gear.className} only`;
    if(gear.requiredLevel>player.level)return `Requires level ${gear.requiredLevel}`;
  }else if(row.kind==='item'?!lootItemValid(row.itemId):!Object.hasOwn(resources,row.itemId))return 'Unavailable';
  return bagCanFit(withEntry(player,row))?undefined:'Not enough bag space';
}
export function lootAllBlockReason(player:Player,rows:readonly LootEntry[]):string|undefined {
  let next=player;
  for(const row of rows){const reason=lootEntryBlockReason(next,row);if(reason)return reason;next=withEntry(next,row);}
  return rows.length?undefined:'Nothing left to loot';
}
export function renderLootContents(drop:LootDrop,player:Player,saving=false):string {
  const rows=lootRows(drop),blocked=lootAllBlockReason(player,rows);
  return `<header class="loot-heading">${icon('bag')}<div><small>LOOT</small><h2 id="loot-title" title="${escape(drop.name)}">${escape(drop.name)}</h2></div><button type="button" class="loot-close" data-loot-close aria-label="Close loot">${icon('close')}</button></header><div class="loot-rows" aria-label="Items on the corpse">${rows.map(row=>{
    const reason=lootEntryBlockReason(player,row),name=label(row);
    return `<button type="button" class="loot-row quality-${row.quality}" data-loot-entry="${escape(row.id)}" aria-label="Loot ${escape(name)}, ${number(row.quantity)}${reason?`. ${escape(reason)}`:''}" data-item-tooltip="${escape(row.kind==='item'?`item:${row.itemId}`:row.itemId)}" ${saving||reason?'disabled':''}><span class="loot-icon">${art(row)}</span><span class="loot-copy"><strong>${escape(name)}</strong><small class="${reason?'loot-blocked':''}">${escape(reason||description(row,player))}</small></span><b class="loot-quantity">${number(row.quantity)}</b></button>`;
  }).join('')}</div><footer class="loot-footer"><small>${blocked?'Loot available items separately.':`${rows.length} ${rows.length===1?'stack':'stacks'} remaining`}</small><button type="button" data-loot-all ${saving||blocked?'disabled':''} title="${escape(blocked||'Collect everything from this corpse')}">Loot all</button></footer>`;
}

/** Pending loot is a display overlay; authoritative inventory is never changed. */
export function mountLootUI(options:{send:(message:ClientMessage)=>boolean|void;getPlayer:()=>Player|undefined;canLoot:(drop:LootDrop)=>boolean;onOpen?:()=>void;onChange?:()=>void;optimistic?:()=>boolean;maxPending?:()=>number}) {
  const panel=document.createElement('section');panel.id='loot-window';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','loot-title');document.body.append(panel);
  let current:LootDrop|undefined,rendered='',drops:readonly LootDrop[]=[];
  const pending=new Map<string,{targetId:string;rows:Set<string>;reopen:boolean}>();
  const limit=()=>{const value=options.maxPending?.()??1;return Number.isSafeInteger(value)&&value>0?Math.min(16,value):1;};
  const allowed=(drop:LootDrop)=>{const player=options.getPlayer();return !!player&&player.hp>0&&drop.ownerId===player.id&&options.canLoot(drop);};
  const hide=()=>{current=undefined;rendered='';panel.hidden=true;};
  const close=()=>{for(const request of pending.values())request.reopen=false;hide();};
  const visibleDrop=(drop:LootDrop):LootDrop=>{
    const rows=new Set([...pending.values()].filter(request=>request.targetId===drop.id).flatMap(request=>[...request.rows]));
    return rows.size?{...drop,gold:rows.has('gold')?0:drop.gold,relic:rows.has('resource:relic')?0:drop.relic,
      items:drop.items?.filter(row=>!rows.has(row.id))}:drop;
  };
  const visibleDrops=()=>drops.map(visibleDrop).filter(drop=>lootRows(drop).length);
  function displayPlayer(player:Player):Player {
    // A committed snapshot removes these rows before its result arrives: never add them twice.
    for(const request of pending.values()){
      const drop=drops.find(drop=>drop.id===request.targetId&&drop.ownerId===player.id);
      if(drop)player=lootRows(drop).filter(row=>request.rows.has(row.id)).reduce(withEntry,player);
    }
    return player;
  }
  function render(){
    const player=options.getPlayer(),visible=current&&visibleDrop(current);
    if(!current||!player||!allowed(current)||!visible||!lootRows(visible).length){hide();return;}
    const html=renderLootContents(visible,displayPlayer(player),pending.size>=limit());if(html===rendered)return;
    const active=document.activeElement,focused=active instanceof HTMLElement&&panel.contains(active)?active.dataset.lootEntry||('lootAll' in active.dataset?'all':'close'):undefined;
    rendered=html;panel.innerHTML=html;
    if(focused){const next=focused==='all'?panel.querySelector<HTMLButtonElement>('[data-loot-all]'):focused==='close'?panel.querySelector<HTMLButtonElement>('[data-loot-close]'):[...panel.querySelectorAll<HTMLButtonElement>('[data-loot-entry]')].find(button=>button.dataset.lootEntry===focused);(next&&!next.disabled?next:panel.querySelector<HTMLButtonElement>('[data-loot-close]'))?.focus({preventScroll:true});}
  }
  function open(drop:LootDrop){
    drop=drops.find(saved=>saved.id===drop.id)||drop;
    if(!allowed(drop)||!lootRows(visibleDrop(drop)).length)return false;
    for(const request of pending.values())if(drop.id!==request.targetId)request.reopen=false;
    if(!drops.some(saved=>saved.id===drop.id))drops=[...drops,drop];
    options.onOpen?.();current=drop;panel.hidden=false;render();return true;
  }
  function update(next:readonly LootDrop[]){drops=next;if(current)current=drops.find(drop=>drop.id===current!.id);render();}
  function result(requestId:string,success:boolean){
    const request=pending.get(requestId);if(!request)return false;
    const retry=!success&&request.reopen?drops.find(drop=>drop.id===request.targetId):undefined;
    pending.delete(requestId);render();if(retry&&!current)open(retry);options.onChange?.();return true;
  }
  function collect(itemId?:string){
    if(pending.size>=limit()||!current)return;
    const player=options.getPlayer(),rows=lootRows(visibleDrop(current)).filter(row=>itemId===undefined||row.id===itemId);
    if(!player||lootAllBlockReason(displayPlayer(player),rows))return;
    if(options.optimistic?.()===false){options.send({type:'loot',targetId:current.id,...(itemId?{itemId}:{})});return;}
    const requestId=crypto.randomUUID();pending.set(requestId,{targetId:current.id,rows:new Set(rows.map(row=>row.id)),reopen:true});
    try{if(options.send({type:'loot',targetId:current.id,...(itemId?{itemId}:limit()>1?{itemIds:rows.map(row=>row.id)}:{}),requestId})===false)pending.delete(requestId);}
    catch{pending.delete(requestId);}
    render();options.onChange?.();
  }
  panel.addEventListener('click',event=>{
    event.stopPropagation();const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled||!current)return;
    if('lootClose' in button.dataset){close();return;}
    if(!allowed(current)){close();return;}
    if('lootAll' in button.dataset)collect();else if(button.dataset.lootEntry)collect(button.dataset.lootEntry);
  });
  panel.addEventListener('pointerdown',event=>event.stopPropagation());
  panel.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  const reset=()=>{pending.clear();drops=[];hide();options.onChange?.();};
  return {open,update,close,result,reset,displayPlayer,visibleDrops,isSaving:()=>pending.size>0,isOpen:()=>!panel.hidden,dispose:()=>{reset();panel.remove();}};
}
