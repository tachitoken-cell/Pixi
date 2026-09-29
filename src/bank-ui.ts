import type { Player, ClientMessage } from './shared';
import { BANKERS } from './city-services';
import { BANK_CAPACITY, bankItems, bankDeposit, bankWithdraw, type BankItem, type BankView } from './bank';
import { AUCTION_MAX_QUANTITY, AUCTION_RESOURCES, auctionItemLabel } from './auction';
import { BAG_ITEMS, bagItems, bagUsage, bagCapacity } from './bags';
import { itemLocked, itemLockKey } from './item-locks';
import { gearArt, gearBonuses, lootItemArt, renderItemLock } from './character-ui';
import { gearById } from './progression';
import { renderGearRollDetails, preserveItemRollDetails } from './item-tooltip';
import { gearLootQuality, LOOT_ITEMS } from './loot-items';
import { icon } from './icons';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const key=(item:BankItem)=>`${item.kind}:${item.id}`;
const resourceIcons:Record<string,string>={wood:'wood',crystal:'crystal',herb:'resource-herb',potion:'potion',relic:'resource-relic'};
export function bankInventoryItems(player:Player):BankItem[]{
  return bagItems(player).map(id=>id.startsWith('bag:')?{kind:'bag',id:id.slice(4),quantity:1}:id.startsWith('item:')?{kind:'item',id:id.slice(5),quantity:player.carriedItems?.[id.slice(5)]??0}:AUCTION_RESOURCES.includes(id as typeof AUCTION_RESOURCES[number])?{kind:'resource',id,quantity:player.inventory[id as keyof Player['inventory']]}:{kind:'gear',id,quantity:1});
}
export interface BankUIOptions { tab:'storage'|'inventory'; selected:string; page:number; quantity:number; busy?:boolean; notice?:string; search?:string; sort?:boolean }
function details(item:BankItem,player:Player,view:BankView){
  if(item.kind==='bag'){
    const bag=[...view.bank.bags,...(player.ownedBags??[])].find(bag=>bag.id===item.id),definition=bag&&BAG_ITEMS[bag.kind];
    return {tooltip:definition?`bag-kind:${definition.id}`:'',name:definition?.label??'Bag',art:definition?`<img class="bag-art" src="/ui/bags/${definition.id}.png" alt="" draggable="false">`:icon('bag'),quality:definition?.quality??'common',description:definition?`${definition.slots} bag slots · ${definition.description}`:'An unequipped bag'};
  }
  const gear=item.kind==='gear'?gearById(item.id):undefined;
  return {tooltip:item.kind==='item'?`item:${item.id}`:item.id,name:auctionItemLabel(item),art:gear?gearArt(gear):item.kind==='item'?lootItemArt(item.id):icon(resourceIcons[item.id]),quality:gear?gearLootQuality(gear):item.kind==='item'?LOOT_ITEMS[item.id].quality:'common',description:gear?`${gearLootQuality(gear)} · Level ${gear.requiredLevel} · ${gearBonuses(gear.stats)}. ${gear.description}`:item.kind==='item'?LOOT_ITEMS[item.id].description:'A stack of supplies for your next journey.'};
}
export function renderBankContents(player:Player,view:BankView,options:BankUIOptions):string{
  const storage=bankItems(view.bank),inventory=bankInventoryItems(player),items=options.tab==='storage'?storage:inventory,selected=items.find(item=>key(item)===options.selected);
  const detail=selected&&details(selected,player,view),maximum=selected?Math.min(AUCTION_MAX_QUANTITY,selected.quantity):1,amount=Math.max(1,Math.min(maximum,Math.floor(options.quantity)||1));
  const action=options.tab==='storage'?'Withdraw':'Deposit',projected=selected&&(options.tab==='storage'?bankWithdraw:bankDeposit)({...player,bank:view.bank},{...selected,quantity:amount}),blocked=!!options.busy||!projected;
  const search=(options.search||'').slice(0,100),query=search.trim().toLocaleLowerCase();
  const grid=(side:'storage'|'inventory')=>{
    const list=[...(side==='storage'?storage:inventory)],capacity=side==='storage'?view.capacity:bagCapacity(player);
    if(options.sort)list.sort((a,b)=>details(a,player,view).name.localeCompare(details(b,player,view).name));
    return `<section class="bank-container" data-bank-side-panel="${side}" data-active="${side===options.tab}" aria-label="${side==='storage'?'Bank contents':'Items available to deposit'}"><h3>${side==='storage'?'Bank':'Your items'}<span>${list.length} / ${capacity}</span></h3><div class="bank-slots" data-bank-scroll="${side}">${Array.from({length:Math.max(capacity,list.length)},(_,i)=>{
      const item=list[i];if(!item)return '<span class="bank-slot empty" aria-hidden="true"></span>';
      const info=details(item,player,view),dim=!!query&&!info.name.toLocaleLowerCase().includes(query);
      return `<button type="button" class="bank-slot quality-${info.quality}${dim?' is-dim':''}" data-bank-side="${side}" data-bank-item="${escape(key(item))}" ${itemLocked(player,itemLockKey(item))?'data-item-locked="true"':''} aria-pressed="${options.tab===side&&options.selected===key(item)}" aria-label="${escape(info.name)}, ${item.quantity.toLocaleString('en-US')}${itemLocked(player,itemLockKey(item))?', locked':''}" data-item-tooltip="${escape(info.tooltip)}">${info.art}${item.quantity>1?`<b>${item.quantity>=10000?`${Math.floor(item.quantity/1000)}k`:item.quantity}</b>`:''}</button>`;
    }).join('')}</div></section>`;
  };
  return `<header class="bank-heading">${icon('bag')}<div><h2 id="bank-title">${escape(BANKERS.find(npc=>npc.id===view.npcId)?.name||'City Bank')}</h2><p>Personal storage</p></div><button type="button" data-bank-bags title="Open your bags">${icon('bag')}Bags</button><button type="button" data-bank-close aria-label="Close bank">${icon('close')}</button></header><nav class="bank-tabs" aria-label="Bank view"><button type="button" data-bank-tab="storage" aria-pressed="${options.tab==='storage'}">Bank <span>${storage.length} / ${view.capacity}</span></button><button type="button" data-bank-tab="inventory" aria-pressed="${options.tab==='inventory'}">Your items <span>${bagUsage(player)} / ${bagCapacity(player)}</span></button></nav><div class="bank-tools"><label><span>Search your items</span><input id="bank-search" type="search" maxlength="100" autocomplete="off" placeholder="Search your items" value="${escape(search)}"></label><button type="button" data-bank-sort aria-pressed="${!!options.sort}">${options.sort?'Name order':'Sort by name'}</button></div><div class="bank-body">${grid('storage')}${grid('inventory')}</div><footer class="bank-details">${selected&&detail?`<div class="bank-selection quality-${detail.quality}">${detail.art}<div><strong>${escape(detail.name)}</strong><p>${selected.quantity.toLocaleString('en-US')} in ${options.tab==='storage'?'the bank':'your bags'}</p></div></div><div class="bank-transfer"><label>Quantity <input id="bank-quantity" type="number" min="1" max="${maximum}" step="1" value="${amount}" ${options.busy?'disabled':''}></label><button type="button" data-bank-all ${options.busy?'disabled':''}>All</button><button type="button" data-bank-transfer ${blocked?'disabled':''}>${options.busy?'Moving…':action}</button></div>${!projected&&!options.busy?`<small class="bank-warning">${options.tab==='storage'?'Make room in your bags before withdrawing this item.':'There is no room for this item in the bank.'}</small>`:''}<details class="bank-item-more"><summary>Item details and protection</summary><p>${escape(detail.description)}</p>${renderItemLock({...player,bank:view.bank},itemLockKey(selected))}${selected.kind==='gear'?`<div class="item-sheet item-roll-inline">${renderGearRollDetails(gearById(selected.id)!,player)}</div>`:''}</details>`:`<p class="bank-hint">${items.length?`Select an item to ${action.toLowerCase()} it.`:options.tab==='storage'?'Your bank is empty. Choose Your items to deposit something.':'Your bags contain no items available to deposit.'}</p>`}<div class="bank-status" role="status">${escape(options.notice||'Items stay here safely between adventures.')}</div></footer>`;
}

/** This window never owns inventory: only a confirmed private server response changes storage. */
export function mountBankUI(options:{send:(message:ClientMessage)=>void;getPlayer:()=>Player|undefined;nearby:(npcId?:string)=>boolean;onOpen?:()=>void;onBags:()=>void}){
  const panel=document.createElement('section');panel.id='bank-window';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','bank-title');document.body.append(panel);
  let view:BankView|undefined,tab:'storage'|'inventory'='storage',selected='',page=0,quantity=1,busy=false,notice='',rendered='',search='',sort=false;
  const close=()=>{panel.hidden=true;view=undefined;selected='';busy=false;rendered='';panel.innerHTML='';};
  const allowed=(npcId=view?.npcId)=>{const p=options.getPlayer();return !!p&&p.hp>0&&options.nearby(npcId);};
  function render(){
    if(!view||panel.hidden)return;if(!allowed()){close();return;}const player=options.getPlayer()!;
    const html=renderBankContents(player,view,{tab,selected,page,quantity,busy,notice,search,sort});if(html===rendered)return;
    const active=document.activeElement,lockFocus=active instanceof HTMLElement?active.dataset.itemLock:undefined,focus=active instanceof HTMLElement&&panel.contains(active)?active.id||active.dataset.bankItem||'':null;
    const searchCaret=active instanceof HTMLInputElement&&active.id==='bank-search'?active.selectionStart:null,scroll=[...panel.querySelectorAll<HTMLElement>('[data-bank-scroll]')].map(node=>[node.dataset.bankScroll!,node.scrollTop] as const),more=panel.querySelector<HTMLDetailsElement>('.bank-item-more')?.open;
    const slots=[...panel.querySelectorAll<HTMLButtonElement>('[data-bank-item]')];
    const restoreRollDetails=preserveItemRollDetails(panel);
    rendered=html;panel.innerHTML=html;for(const slot of slots){const next=[...panel.querySelectorAll<HTMLButtonElement>('[data-bank-item]')].find(node=>node.dataset.bankItem===slot.dataset.bankItem&&node.dataset.bankSide===slot.dataset.bankSide);if(next&&next.innerHTML===slot.innerHTML&&['class','aria-label','data-item-locked'].every(name=>next.getAttribute(name)===slot.getAttribute(name))){slot.setAttribute('aria-pressed',next.getAttribute('aria-pressed')!);next.replaceWith(slot);}}restoreRollDetails();for(const [side,top] of scroll){const node=panel.querySelector<HTMLElement>(`[data-bank-scroll="${side}"]`);if(node)node.scrollTop=top;}const nextMore=panel.querySelector<HTMLDetailsElement>('.bank-item-more');if(nextMore&&more)nextMore.open=true;if(searchCaret!==null){const input=panel.querySelector<HTMLInputElement>('#bank-search');input?.focus({preventScroll:true});input?.setSelectionRange(searchCaret,searchCaret);}if(lockFocus)panel.querySelector<HTMLElement>('[data-item-lock]')?.focus({preventScroll:true});else if(focus){const target=focus==='bank-quantity'?panel.querySelector<HTMLInputElement>('#bank-quantity'):[...panel.querySelectorAll<HTMLButtonElement>('[data-bank-item]')].find(button=>button.dataset.bankItem===focus&&button.dataset.bankSide===tab);target?.focus({preventScroll:true});}
  }
  function update(next:BankView){
    if(!allowed(next.npcId)||!BANKERS.some(npc=>npc.id===next.npcId)){close();return;}
    if(panel.hidden&&!next.open)return;
    if(panel.hidden){options.onOpen?.();panel.hidden=false;tab='storage';page=0;quantity=1;}
    view=next;if(next.reason||next.open){busy=false;notice=next.reason||'';}render();
  }
  function transfer(all=false){
    const player=options.getPlayer();if(!view||!player||busy||!allowed())return;
    const row=(tab==='storage'?bankItems(view.bank):bankInventoryItems(player)).find(item=>key(item)===selected);if(!row)return;
    const input=panel.querySelector<HTMLInputElement>('#bank-quantity');if(all)quantity=row.quantity;else if(input)quantity=Number(input.value);
    const item={...row,quantity:Math.max(1,Math.min(row.quantity,AUCTION_MAX_QUANTITY,Math.floor(quantity)||1))};
    if(!(tab==='storage'?bankWithdraw:bankDeposit)({...player,bank:view.bank},item))return;
    busy=true;notice='';options.send({type:tab==='storage'?'bankWithdraw':'bankDeposit',npcId:view.npcId,item});render();
  }
  panel.addEventListener('click',event=>{
    event.stopPropagation();const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    if('bankClose' in button.dataset){close();return;}if('bankBags' in button.dataset){options.onBags();return;}
    if(button.dataset.bankTab==='storage'||button.dataset.bankTab==='inventory'){tab=button.dataset.bankTab;selected='';page=0;quantity=1;render();return;}
    if('bankSort' in button.dataset){sort=!sort;render();return;}
    if(button.dataset.bankItem){if(button.dataset.bankSide==='storage'||button.dataset.bankSide==='inventory')tab=button.dataset.bankSide;selected=button.dataset.bankItem;quantity=1;render();return;}
    if(button.dataset.bankPage!==undefined){const target=Number(button.dataset.bankPage);if(Number.isSafeInteger(target)&&target>=0){page=target;selected='';render();}return;}
    if('bankAll' in button.dataset){const player=options.getPlayer();if(view&&player){const row=(tab==='storage'?bankItems(view.bank):bankInventoryItems(player)).find(item=>key(item)===selected);quantity=Math.min(row?.quantity??1,AUCTION_MAX_QUANTITY);render();}return;}
    if(button.dataset.itemLock){if(!busy&&allowed())options.send({type:'setItemLock',itemId:button.dataset.itemLock,locked:button.dataset.lockValue==='true'});return;}
    if('bankTransfer' in button.dataset)transfer();
  });
  panel.addEventListener('dblclick',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-bank-item]');if(!button||busy||!allowed())return;const side=button.dataset.bankSide;if(side!=='storage'&&side!=='inventory')return;tab=side;selected=button.dataset.bankItem!;transfer(true);});
  panel.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.id==='bank-quantity')quantity=Number(input.value);else if(input.id==='bank-search'){search=input.value.slice(0,100);render();}});
  panel.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input.id==='bank-quantity'){quantity=Number(input.value);render();}});
  panel.addEventListener('pointerdown',event=>event.stopPropagation());panel.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab')event.stopPropagation();});
  return {update,refresh:render,close,isOpen:()=>!panel.hidden,reject(message:string){if(!busy)return;busy=false;notice=message;render();},dispose(){close();panel.remove();}};
}
