import { bindingLabel } from './keybindings';
import type { ClientMessage, GMAction, GMItem, GMPlayer, LootTraceReport, Player } from './shared';
import { GEAR } from './progression';
import { BAG_ITEMS } from './bags';
import { AUCTION_RESOURCES, auctionItemLabel, auctionItemValid } from './auction';
import { LOOT_ITEMS } from './loot-items';
import { MOUNTS } from './travel';
import { icon } from './icons';

const escape = (value:string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const flightHelp=()=>`Flight: ${['w','a','s','d'].map(bindingLabel).join(' / ')} to move · ${bindingLabel(' ')} up · ${bindingLabel('control')} down.`;
type TargetAction=Exclude<GMAction,'setInvisible'|'setTagHidden'|'setFlying'|'spawnTreasureGoblin'|'startInstantCombat'>;
const actions:Record<TargetAction,string> = {teleportTo:'Teleport to player',bring:'Bring player here',return:'Return player',kill:'Defeat player',levelUp:'Add levels',giveGold:'Give gold',spawnItem:'Give item',kick:'Kick from realm',ban:'Ban account',startLootTrace:'Start loot trace',stopLootTrace:'Stop loot trace',getLootTrace:'Download loot trace'};
const traceHelp='Records loot rolls, collection and saves on this realm for up to 30 minutes or 1,000 events. Up to five reports are kept in memory; download before a realm restart or new traces replace stopped reports.';
const targetActionError=(selected:GMPlayer,kind:TargetAction)=>selected.online===false&&!['stopLootTrace','getLootTrace'].includes(kind)?'This player is offline. Only an existing loot trace can be stopped or downloaded.':kind==='startLootTrace'&&selected.lootTrace?.active?'A loot trace is already active for this player.':kind==='stopLootTrace'&&!selected.lootTrace?.active?'This player has no active loot trace.':kind==='getLootTrace'&&!selected.lootTrace?'This player has no loot trace on this realm.':'';
const toggles=[{action:'setInvisible',state:'invisible',label:'Invisible'},{action:'setTagHidden',state:'tagHidden',label:'Hide GM tag'},{action:'setFlying',state:'flying',label:'Fly'}] as const;
const catalog: {key:string;label:string;item:GMItem;level:number;className?:string|null}[] = [
  ...AUCTION_RESOURCES.map(id=>({key:`resource:${id}`,label:auctionItemLabel({kind:'resource',id,quantity:1}),item:{kind:'resource' as const,id,quantity:1},level:1})),
  ...Object.values(LOOT_ITEMS).map(item=>({key:`item:${item.id}`,label:item.label,item:{kind:'item' as const,id:item.id,quantity:1},level:1})),
  ...MOUNTS.filter(mount=>mount.dropOnly).map(mount=>({key:`mount:${mount.id}`,label:mount.name,item:{kind:'mount' as const,id:mount.id,quantity:1 as const},level:1})),
  ...Object.values(BAG_ITEMS).map(bag=>({key:`bag:${bag.id}`,label:`${bag.label} · ${bag.slots} slots`,item:{kind:'bag' as const,id:bag.id,quantity:1 as const},level:bag.requiredLevel})),
  ...Object.values(GEAR).filter(gear=>auctionItemValid({kind:'gear',id:gear.id,quantity:1})).map(gear=>({key:`gear:${gear.id}`,label:`${gear.label} · ${gear.className||'Any class'} · Lv ${gear.requiredLevel}`,item:{kind:'gear' as const,id:gear.id,quantity:1},level:gear.requiredLevel,className:gear.className})),
];

/** One explicit command at a time. Server responses, never local edits, determine the outcome. */
export function mountGmUI(options:{getPlayer:()=>Player|undefined;getPlayers:()=>GMPlayer[];send:(message:ClientMessage)=>void;onOpen?:()=>void}) {
  const panel=document.createElement('section');panel.id='gm-window';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','gm-title');
  panel.innerHTML=`<header class="gm-heading">${icon('crown')}<div><small>MOSSVALE · REALM STEWARD</small><h2 id="gm-title">Game master</h2></div><button type="button" id="gm-close" aria-label="Close game master controls">${icon('close')}</button></header><div id="gm-content"><fieldset id="gm-self"><legend>Your character</legend><div class="gm-self-actions">${toggles.map(toggle=>`<button type="button" id="gm-${toggle.action}" aria-pressed="false">${toggle.label}</button>`).join('')}<button type="button" id="gm-self-return">Return myself</button><button type="button" id="gm-spawnTreasureGoblin" title="Spawn an extra treasure goblin nearby in the wilderness">Spawn treasure goblin</button></div><p id="gm-flight-help" hidden>${escape(flightHelp())}</p></fieldset><fieldset id="gm-events"><legend>Realm events</legend><button type="button" id="gm-startInstantCombat" title="Open a five-minute Instant Combat signup for this realm">Start Instant Combat signup</button><p>Players choose whether to join. Signup lasts 5 minutes, followed by 90 seconds to prepare. The normal two-hour schedule stays unchanged.</p></fieldset><form id="gm-form"><label>Player<select id="gm-target" required></select></label><p id="gm-target-summary"></p><label>Action<select id="gm-action">${Object.entries(actions).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><div id="gm-item-fields" hidden><label>Item category<select id="gm-category"><option value="resource">Materials & supplies</option><option value="item">Loot & consumables</option><option value="pet">Pets</option><option value="mount">Mounts</option><option value="gear">Equipment</option><option value="bag">Bags</option></select></label><label>Item<select id="gm-item"></select></label></div><label id="gm-amount-field" hidden><span id="gm-amount-label">Amount</span><input id="gm-amount" type="number" min="1" max="59" step="1" value="1"></label><label id="gm-reason-field" hidden>Reason<input id="gm-reason" type="text" maxlength="160" placeholder="Explain this moderation action"></label><label id="gm-confirm-field" hidden><input id="gm-confirm" type="checkbox"><span>Ban this player's account. They will be disconnected and cannot return.</span></label><p id="gm-help"></p><footer><span id="gm-status" role="status" aria-live="polite">Choose a player and action.</span><button id="gm-submit" type="submit">Defeat player</button></footer></form></div>`;
  document.body.append(panel);
  const find=<T extends HTMLElement>(id:string)=>panel.querySelector<T>(`#${id}`)!;
  const target=find<HTMLSelectElement>('gm-target'),action=find<HTMLSelectElement>('gm-action'),category=find<HTMLSelectElement>('gm-category'),item=find<HTMLSelectElement>('gm-item'),amount=find<HTMLInputElement>('gm-amount'),reason=find<HTMLInputElement>('gm-reason'),confirm=find<HTMLInputElement>('gm-confirm'),submit=find<HTMLButtonElement>('gm-submit'),status=find('gm-status');
  const download=document.createElement('a');download.id='gm-trace-download';download.hidden=true;download.style.color='var(--gold)';find('gm-form').append(download);
  action.value='teleportTo';
  let rosterKey='',itemsKey='',busy=false,pendingLabel='',reportUrl='';
  let pendingFocus:HTMLElement|null=null;
  const authorized=()=>options.getPlayer()?.role==='gm';
  const close=()=>{panel.hidden=true;confirm.checked=false;};
  const clearReport=()=>{if(reportUrl)URL.revokeObjectURL(reportUrl);reportUrl='';download.hidden=true;download.removeAttribute('href');download.textContent='';};
  const roster=()=>{const me=options.getPlayer();if(!me||me.role!=='gm')return [];const rows=options.getPlayers();return rows.some(row=>row.id===me.id)?rows:[{id:me.id,name:me.name,level:me.level,className:me.appearance.className,role:me.role,canReturn:me.gm?.canReturn},...rows];};
  function refresh(){
    if(!authorized()){close();clearReport();busy=false;pendingFocus=null;rosterKey=itemsKey='';target.innerHTML='';status.textContent='';return;}
    if(panel.hidden)return;
    const me=options.getPlayer()!,rows=roster(),key=JSON.stringify(rows);
    for(const toggle of toggles){const button=find<HTMLButtonElement>(`gm-${toggle.action}`);button.setAttribute('aria-pressed',String(!!me.gm?.[toggle.state]));button.disabled=busy||!me.gm;}
    find<HTMLButtonElement>('gm-self-return').disabled=busy||!me.gm?.canReturn;find('gm-flight-help').hidden=!me.gm?.flying;
    find<HTMLButtonElement>('gm-spawnTreasureGoblin').disabled=busy||!me.gm||me.hp<=0||!!me.instanceId;
    find<HTMLButtonElement>('gm-startInstantCombat').disabled=busy||!me.gm;
    find('gm-flight-help').textContent=flightHelp();
    if(key!==rosterKey){const current=target.value;rosterKey=key;target.innerHTML=`<option value="">Choose a player</option>${rows.map(row=>`<option value="${escape(row.id)}">${escape(row.name)}${row.role==='gm'?' [GM]':''} · Lv ${row.level} ${escape(row.className)}${row.online===false?' · Offline':''}</option>`).join('')}`;target.value=rows.some(row=>row.id===current)?current:'';if(current!==target.value)confirm.checked=false;}
    const selected=rows.find(row=>row.id===target.value),kind=action.value as TargetAction,spawn=kind==='spawnItem';
    const nextItems=JSON.stringify([category.value,selected?.className,selected?.level]);
    if(nextItems!==itemsKey){const current=item.value;itemsKey=nextItems;const available=catalog.filter(row=>(row.item.kind==='item'&&LOOT_ITEMS[row.item.id]?.category==='pet'?'pet':row.item.kind)===category.value);item.innerHTML=available.map(row=>`<option value="${row.key}" ${selected&&(row.level>selected.level||row.className&&row.className!==selected.className)?'disabled':''}>${escape(row.label)}</option>`).join('');const eligible=(row:typeof catalog[number])=>!selected||row.level<=selected.level&&(!row.className||row.className===selected.className);item.value=available.find(row=>row.key===current&&eligible(row))?.key||available.find(eligible)?.key||'';}
    const chosen=catalog.find(row=>row.key===item.value),stack=spawn&&chosen&&['item','resource'].includes(chosen.item.kind),numeric=kind==='levelUp'||kind==='giveGold'||stack;
    find('gm-item-fields').hidden=!spawn;find('gm-amount-field').hidden=!numeric;find('gm-reason-field').hidden=!['ban','kick'].includes(kind);find('gm-confirm-field').hidden=kind!=='ban';
    find('gm-amount-label').textContent=kind==='levelUp'?'Levels to add':stack?'Quantity':'Gold';amount.max=kind==='levelUp'?'59':stack?'1000000':'1000000000';
    amount.required=!!numeric;reason.required=['ban','kick'].includes(kind);confirm.required=kind==='ban';
    find('gm-target-summary').textContent=selected?`${selected.name} · Level ${selected.level} ${selected.className}${selected.role==='gm'?' · Game master':''}${selected.online===false?' · Offline':''}${selected.lootTrace?` · Trace ${selected.lootTrace.active?'active':'stopped'} · ${selected.lootTrace.eventCount} events`:''}`:'Select an online character or a retained loot trace.';
    const unavailable=selected?targetActionError(selected,kind):'',trace=kind==='startLootTrace'||kind==='stopLootTrace'||kind==='getLootTrace';
    const protectedBan=kind==='ban'&&!!selected&&(selected.id===options.getPlayer()?.id||selected.role==='gm');
    const selfTravel=(kind==='teleportTo'||kind==='bring')&&selected?.id===me.id,missingReturn=kind==='return'&&!(selected?.id===me.id?me.gm?.canReturn:selected?.canReturn);
    find('gm-help').textContent=trace?`${unavailable?`${unavailable} `:''}${traceHelp}${kind==='startLootTrace'&&selected?.lootTrace?' Starting again replaces the previous report.':''}`:unavailable|| (selfTravel?'Choose another online player.':missingReturn?'This player has no saved return location.':kind==='teleportTo'?'Go to this player. Return myself takes you back.':kind==='bring'?'Bring this player here. Return player sends them back.':kind==='return'?'Send this player back to their saved location.':protectedBan?'You cannot ban yourself or another game master.':kind==='ban'?'This applies to every character on their account.':kind==='kick'?'They may reconnect after this session ends.':kind==='levelUp'?'Adds levels, up to level 60.':kind==='spawnItem'?(category.value==='mount'?'Permanently unlocks this mount in the character’s collection. Riding training is still required.':category.value==='pet'?'Adds pet items to this character’s bags. They can learn or trade them.':'Class, level, ownership and bag-space requirements still apply.'):'Changes are applied by the realm server.');
    for(const input of [target,action,category,item,amount,reason,confirm])input.disabled=busy;
    amount.disabled=busy||!numeric;reason.disabled=busy||!['ban','kick'].includes(kind);confirm.disabled=busy||kind!=='ban';category.disabled=item.disabled=busy||!spawn;
    submit.disabled=busy||!selected||!!unavailable||protectedBan||selfTravel||missingReturn||(spawn&&!chosen);submit.textContent=busy?'Applying…':actions[kind];
    if(busy)status.textContent=pendingLabel;
  }
  function run(){
    if(!authorized()){close();return;}if(busy)return;
    const selected=roster().find(row=>row.id===target.value),kind=action.value as TargetAction;
    if(!selected||!Object.hasOwn(actions,kind)){status.textContent='Choose a player and action.';return;}
    const unavailable=targetActionError(selected,kind);if(unavailable){status.textContent=unavailable;return;}
    const me=options.getPlayer()!;
    if((kind==='teleportTo'||kind==='bring')&&selected.id===me.id){status.textContent='Choose another online player.';return;}
    if(kind==='return'&&!(selected.id===me.id?me.gm?.canReturn:selected.canReturn)){status.textContent='This player has no saved return location.';return;}
    const command:Extract<ClientMessage,{type:'gmAction'}>={type:'gmAction',action:kind,targetId:selected.id};
    if(kind==='ban'||kind==='kick'){
      const text=reason.value.trim();if(!text){status.textContent='Enter a reason.';reason.focus();return;}
      if(kind==='ban'&&(selected.id===options.getPlayer()?.id||selected.role==='gm')){status.textContent='You cannot ban yourself or another game master.';return;}
      if(kind==='ban'&&!confirm.checked){status.textContent='Confirm the account ban before applying it.';return;}command.reason=text.slice(0,160);
    }
    if(kind==='levelUp'||kind==='giveGold'){
      const value=Number(amount.value),maximum=kind==='levelUp'?59:1e9;
      if(!Number.isSafeInteger(value)||value<1||value>maximum){status.textContent=`Enter a whole amount from 1 to ${maximum.toLocaleString('en-US')}.`;return;}command.amount=value;
    }
    if(kind==='spawnItem'){
      const row=catalog.find(row=>row.key===item.value);
      if(!row||row.level>selected.level||row.className&&row.className!==selected.className){status.textContent='Choose an item suitable for this character.';return;}
      const quantity=['gear','bag','mount'].includes(row.item.kind)?1:Number(amount.value);
      if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1e6){status.textContent='Enter a whole quantity from 1 to 1,000,000.';return;}
      command.item={...row.item,quantity} as GMItem;
    }
    dispatch(command,`${actions[kind]} · ${selected.name}`);
  }
  function dispatch(command:Extract<ClientMessage,{type:'gmAction'}>,label:string){clearReport();pendingFocus=panel.contains(document.activeElement)?document.activeElement as HTMLElement:null;busy=true;pendingLabel=label;delete status.dataset.success;refresh();options.send(command);}
  for(const toggle of toggles)find(`gm-${toggle.action}`).addEventListener('click',()=>{
    if(!authorized()){close();return;}const me=options.getPlayer()!;if(busy||!me.gm)return;
    dispatch({type:'gmAction',action:toggle.action,targetId:me.id,enabled:!me.gm[toggle.state]},toggle.label);
  });
  find('gm-self-return').addEventListener('click',()=>{
    if(!authorized()){close();return;}const me=options.getPlayer()!;if(busy||!me.gm?.canReturn)return;
    dispatch({type:'gmAction',action:'return',targetId:me.id},'Return myself');
  });
  find('gm-spawnTreasureGoblin').addEventListener('click',()=>{
    if(!authorized()){close();return;}const me=options.getPlayer()!;if(busy||!me.gm||me.hp<=0||me.instanceId)return;
    dispatch({type:'gmAction',action:'spawnTreasureGoblin',targetId:me.id},'Spawning treasure goblin…');
  });
  find('gm-startInstantCombat').addEventListener('click',()=>{
    if(!authorized()){close();return;}const me=options.getPlayer()!;if(busy||!me.gm)return;
    dispatch({type:'gmAction',action:'startInstantCombat',targetId:me.id},'Opening Instant Combat signup…');
  });
  find('gm-close').addEventListener('click',close);
  download.addEventListener('click',event=>{if(!authorized()){event.preventDefault();clearReport();close();}});
  find('gm-form').addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();run();});
  panel.addEventListener('change',event=>{if(event.target===target||event.target===action){confirm.checked=false;status.textContent='Choose an action, then apply it.';}if(event.target===action)amount.value='1';refresh();});
  panel.addEventListener('pointerdown',event=>event.stopPropagation());panel.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab')event.stopPropagation();});
  return {open(targetId?:string){if(!authorized())return false;options.onOpen?.();panel.hidden=false;refresh();if(!busy){target.value=roster().some(row=>row.id===(targetId||options.getPlayer()?.id))?(targetId||options.getPlayer()!.id):'';confirm.checked=false;status.textContent='Choose a player and action.';refresh();target.focus({preventScroll:true});}return true;},refresh,close,reset(){busy=false;pendingFocus=null;close();clearReport();rosterKey=itemsKey='';target.innerHTML='';action.value='teleportTo';category.value='resource';amount.value='1';reason.value='';status.textContent='Choose a player and action.';delete status.dataset.success;},isOpen:()=>!panel.hidden,result(message:{success:boolean;text:string}){if(!busy)return;busy=false;confirm.checked=false;if(!authorized()){refresh();return;}refresh();status.textContent=message.text;status.dataset.success=String(message.success);if(!panel.hidden&&document.activeElement===document.body&&pendingFocus&&panel.contains(pendingFocus))pendingFocus.focus({preventScroll:true});pendingFocus=null;},lootTrace(report:LootTraceReport){if(!authorized()){refresh();return;}clearReport();reportUrl=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));download.href=reportUrl;download.download=`loot-trace-${report.player.id}-${report.startedAt}.json`;download.textContent=`Download ${report.player.name} trace (.json)`;download.hidden=false;this.result({success:true,text:`${report.player.name} · ${report.events.length} events · ${report.stoppedAt===null?'Trace active':`Trace stopped (${report.stoppedReason||'stopped'})`}.`});},dispose(){close();clearReport();panel.remove();}};
}
