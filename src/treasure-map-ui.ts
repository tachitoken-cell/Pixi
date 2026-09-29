import { goldSource } from './gold-economy';
import { getZone } from './content';
import { icon } from './icons';
import { TREASURE_MAP, TREASURE_MAP_SITES, treasureMapReward } from './treasure-maps';
import type { Player } from './shared';
import type { TargetInfo } from './targeting';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const treasureMapSite=(player:Player|undefined)=>TREASURE_MAP_SITES.find(site=>site.id===player?.treasureMap?.siteId);
export function treasureMapTarget(player:Player|undefined,position:{x:number;z:number}):TargetInfo|undefined {
  const expedition=player?.treasureMap,site=treasureMapSite(player);
  if(!expedition||!site||player?.instanceId||player?.zeppelin||(player?.hp??0)<=0||expedition.stage==='search'&&Math.hypot(position.x-site.x,position.z-site.z)>16)return;
  return {id:`treasure-map-${expedition.id}`,kind:'treasure-map',x:site.x,z:site.z,height:2.2,
    name:expedition.stage==='search'?'Disturbed earth':expedition.stage==='guardian'?'Guarded treasure':'Unearthed treasure',
    label:expedition.stage==='search'?'Dig for treasure':expedition.stage==='guardian'?'Defeat the treasure guardian':'Open treasure chest'};
}
export function treasureMapWaypoint(player:Player|undefined) {
  const expedition=player?.treasureMap,site=treasureMapSite(player);if(!expedition||!site)return;
  return {id:`treasure-map-route-${expedition.id}`,zone:site.zone,x:expedition.stage==='search'?site.searchX:site.x,z:expedition.stage==='search'?site.searchZ:site.z,
    label:expedition.stage==='search'?`Treasure search · within ${site.radius}m`:expedition.stage==='guardian'?'Treasure guardian':'Treasure chest'};
}
export function treasureMapSearchArea(player:Player|undefined){
  const site=treasureMapSite(player);return site&&player?.treasureMap?.stage==='search'&&!player.instanceId?{x:site.searchX,z:site.searchZ,radius:site.radius}:undefined;
}
export function renderTreasureMap(player:Player,pending=false,message='') {
  const expedition=player.treasureMap,site=treasureMapSite(player),count=player.carriedItems?.['treasure-map']||0;
  if(!expedition&&!count&&!pending&&!message)return '';
  const reward=treasureMapReward(expedition?.level??player.level);
  const reason=player.hp<=0?'Revive before continuing your expedition.':player.instanceId?'Return to the open world to continue.':player.zeppelin?'Land before continuing your expedition.':'';
  const rewardMarkup=`<section class="treasure-map-rewards" aria-labelledby="treasure-map-rewards-heading"><h4 id="treasure-map-rewards-heading">Rewards</h4><ul><li>${icon('gold')}<span>${goldSource(reward.gold,'treasure',player.economyVersion===1)} Gold</span></li><li>${icon('potion')}<span>${reward.potions} × Healing Potion</span></li><li><img src="/ui/loot/ancient-coin.png" width="28" height="28" alt=""><span>${reward.coins} × Ancient Coin</span></li><li><img src="/ui/loot/moss-voucher.png" width="28" height="28" alt=""><span>${TREASURE_MAP.voucherChancePercent}% chance of a MOSS voucher</span></li></ul><p class="treasure-map-reward-note">Rewards are for the map owner. Redeem vouchers with Veyl.</p></section>`;
  const stages=['Find the dig site','Defeat its guardian','Open the chest'],stage=expedition?.stage==='guardian'?1:expedition?.stage==='chest'?2:0;
  return `<section class="treasure-map-journal" aria-labelledby="treasure-map-heading"><header><img src="/ui/loot/treasure-map.png" width="56" height="56" alt=""><div><h3 id="treasure-map-heading" tabindex="-1">Treasure-map expedition</h3><p>${site?`${escape(site.label)} · ${escape(getZone(site.zone).name)}`:`${count} unopened map${count===1?'':'s'} in your bags`}</p></div></header>
    ${site&&expedition?`<p class="treasure-map-clue">${escape(site.clue)}</p><ol class="treasure-map-steps" aria-label="Expedition progress">${stages.map((label,index)=>`<li${index===stage?' aria-current="step"':''}>${index<stage?`${icon('check')}<span class="sr-only">Complete: </span>`:''}${label}</li>`).join('')}</ol><p>${expedition.stage==='search'?`Follow the waypoint, then explore the ${site.radius}m search circle on your map. Disturbed earth appears as you approach the hidden spot.`:expedition.stage==='guardian'?'The guardian protects your discovery. Defeat it to unlock the chest.':'The guardian has fallen. Return to the chest and open your treasure. Make room in your bags to collect it.'}</p>${rewardMarkup}<button type="button" class="primary-button" data-track-treasure-map ${reason?'disabled':''}>${icon('route')}${expedition.stage==='search'?'Track search area':expedition.stage==='guardian'?'Track guardian':'Track treasure chest'}</button><p class="treasure-map-note">Your progress is saved. Reopen Quests to continue; no extra map is needed.</p>`
      :`<p>Follow a clue, uncover a hidden chest, and defeat the guardian protecting it. Opening a map consumes it and saves one expedition for this character.</p>${rewardMarkup}<button type="button" class="primary-button" data-start-treasure-map ${reason||pending||!count?'disabled':''}>${icon('map')}${pending?'Opening map…':'Open 1 treasure map'}</button>`}
    <p class="treasure-map-status" role="status" aria-live="polite">${escape(message||reason||(pending?'Opening your map…':''))}</p></section>`;
}
