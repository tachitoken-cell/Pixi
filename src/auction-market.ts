import { auctionEthPrice, auctionGoldPrice, auctionAssetValid, type AuctionCurrency, type AuctionAsset, type AuctionListing } from './auction.ts';
import { gearById, gearIdValid } from './progression.ts';
import { LOOT_ITEMS, gearLootQuality, lootItemValid, type LootQuality } from './loot-items.ts';

export function auctionCategory(item: AuctionAsset): 'equipment'|'consumables'|'materials'|'treasures'|'junk'|'pets'|'mounts'|'gold' {
  if(item.kind==='gold')return 'gold';
  if(item.kind==='gear')return 'equipment';
  if(item.kind==='item'&&lootItemValid(item.id)){
    const category=LOOT_ITEMS[item.id].category;
    return category==='pet'?'pets':category==='mount'?'mounts':category==='food'||category==='potion'?'consumables':category==='treasure'?'treasures':'junk';
  }
  return item.id==='potion'?'consumables':item.id==='relic'?'treasures':'materials';
}
export function auctionQuality(item:AuctionAsset):LootQuality {
  return item.kind==='gear'&&gearIdValid(item.id)?gearLootQuality(gearById(item.id)!)
    :item.kind==='item'&&lootItemValid(item.id)?LOOT_ITEMS[item.id].quality:item.id==='relic'?'rare':'common';
}
/** Compare prices within one currency; all arithmetic stays in whole gold or token units. */
function amount(value:string,currency:AuctionCurrency):bigint|null {
  if(currency==='gold')return auctionGoldPrice(value)===null?null:BigInt(value);
  if(!auctionEthPrice(value))return null;
  const [whole,fraction='']=value.split('.');return BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));
}
function decimal(value:bigint,places:number):string {
  if(!places)return String(value);
  const digits=String(value).padStart(places+1,'0');return `${digits.slice(0,-places)}.${digits.slice(-places)}`.replace(/\.?0+$/,'');
}
export function compareAuctionPrice(a:AuctionListing,b:AuctionListing,unit=true):number {
  if(a.currency!==b.currency)return ['gold','eth','moss'].indexOf(a.currency)-['gold','eth','moss'].indexOf(b.currency);
  const av=amount(a.price,a.currency),bv=amount(b.price,b.currency);
  if(av===null||bv===null)return av===bv?0:av===null?1:-1;
  const left=av*BigInt(unit?b.item.quantity:1),right=bv*BigInt(unit?a.item.quantity:1);
  return left<right?-1:left>right?1:0;
}
export function formatAuctionUnitPrice(row:Pick<AuctionListing,'price'|'currency'|'item'>):string {
  const value=amount(row.price,row.currency);
  if(value===null||!Number.isSafeInteger(row.item.quantity)||row.item.quantity<1)return 'Unavailable';
  const quantity=BigInt(row.item.quantity),scaled=row.currency==='gold'?value*100n:value;
  const unit=scaled/quantity,remainder=scaled%quantity;
  if(!unit&&remainder)return row.currency==='gold'?'<0.01 gold':`<0.000000000000000001 ${row.currency==='moss'?'MOSS':'ETH'}`;
  return `${remainder?'≈ ':''}${decimal(unit,row.currency==='gold'?2:18)} ${row.currency==='gold'?'gold':row.currency==='moss'?'MOSS':'ETH'}`;
}
export function auctionMarketListings(item:AuctionAsset,currency:AuctionCurrency,listings:readonly AuctionListing[],excludeSellerId?:string):AuctionListing[] {
  const gear=item.kind==='gear'?gearById(item.id):undefined;
  return listings.filter(row=>{
    const other=gear&&!gear.randomized&&row.item.kind==='gear'?gearById(row.item.id):undefined;
    const sameItem=row.item.id===item.id||gear&&other&&!other.randomized
      &&(gear.baseId??gear.id)===(other.baseId??other.id)&&(gear.upgradeLevel??0)===(other.upgradeLevel??0);
    return row.item.kind===item.kind&&sameItem&&row.currency===currency&&!row.reservation&&row.sellerId!==excludeSellerId
      &&auctionAssetValid(row.item)&&amount(row.price,row.currency)!==null;
  }).sort((a,b)=>compareAuctionPrice(a,b)||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
}
/** Matching a unit price rounds the stack total UP to the smallest supported currency unit. */
export function auctionSuggestedPrice(item:AuctionAsset,currency:AuctionCurrency,listings:readonly AuctionListing[],sellerId?:string):string|null {
  if(!auctionAssetValid(item))return null;
  const lowest=auctionMarketListings(item,currency,listings,sellerId)[0];if(!lowest)return null;
  const numerator=amount(lowest.price,currency)!*BigInt(item.quantity),denominator=BigInt(lowest.item.quantity);
  const total=(numerator+denominator-1n)/denominator,value=decimal(total,currency==='gold'?0:18);
  return amount(value,currency)===null?null:value;
}
export function auctionIsUndercut(row:AuctionListing,listings:readonly AuctionListing[]):boolean {
  const lowest=auctionMarketListings(row.item,row.currency,listings,row.sellerId)[0];
  return !!lowest&&compareAuctionPrice(lowest,row)<0;
}
export function auctionBelowMarket(item:AuctionAsset,currency:AuctionCurrency,price:string,listings:readonly AuctionListing[],sellerId?:string):boolean {
  if(!auctionAssetValid(item))return false;
  const proposed=amount(price,currency),lowest=auctionMarketListings(item,currency,listings,sellerId)[0];
  return proposed!==null&&!!lowest&&proposed*2n*BigInt(lowest.item.quantity)<amount(lowest.price,currency)!*BigInt(item.quantity);
}
