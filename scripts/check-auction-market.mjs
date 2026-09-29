import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { auctionListingsValid, auctionRecordSale, auctionItemValid, auctionAssetValid, auctionCanList, auctionCanReceive, auctionItemChanges, auctionGoldFee, auctionItemFee, auctionMossTax } from '../src/auction.ts';
import {auctionCategory,auctionQuality,compareAuctionPrice,formatAuctionUnitPrice,auctionMarketListings,auctionSuggestedPrice,auctionIsUndercut,auctionBelowMarket} from '../src/auction-market.ts';
import { copyGear, gearUpgradeQuote, rollGear } from '../src/progression.ts';
const row=(id,quantity,price,currency='gold',extra={})=>({id,sellerId:id,sellerName:id,item:{kind:'resource',id:'wood',quantity},price,currency,createdAt:1,...extra});
const market=[row('large',10,'25'),row('small',2,'6'),row('eth',1,'0.000000000000000001','eth'),row('own',1,'1','gold',{sellerId:'me'}),row('reserved',100,'1','gold',{reservation:{buyerId:'x'}})];
assert.deepEqual(auctionMarketListings({kind:'resource',id:'wood',quantity:3},'gold',market,'me').map(r=>r.id),['large','small']);
assert(compareAuctionPrice(market[0],market[1])<0);assert(compareAuctionPrice(market[0],market[1],false)>0);
assert.equal(formatAuctionUnitPrice(market[0]),'2.5 gold');assert.equal(formatAuctionUnitPrice(row('fraction',3,'1')),'≈ 0.33 gold');
assert.equal(formatAuctionUnitPrice(market[2]),'0.000000000000000001 ETH');
assert.equal(formatAuctionUnitPrice(row('tiny',2,'0.000000000000000001','eth')),'<0.000000000000000001 ETH');
assert.equal(formatAuctionUnitPrice(row('tinygold',1000000,'1')),'<0.01 gold');
assert.equal(formatAuctionUnitPrice(row('large',1,'1000000000')),'1000000000 gold');
const item={kind:'resource',id:'wood',quantity:3};
assert.equal(auctionSuggestedPrice(item,'gold',market,'me'),'8');assert.equal(auctionSuggestedPrice(item,'gold',[], 'me'),null);
assert.equal(auctionSuggestedPrice(item,'eth',market,'me'),'0.000000000000000003');
const weiRows=[row('a',1000000,'999999.999999999999999999','eth'),row('b',1000000,'999999.999999999999999998','eth')];
assert(compareAuctionPrice(weiRows[1],weiRows[0])<0,'one wei differences survive near max price');
assert(auctionIsUndercut(market[1],market));assert(!auctionIsUndercut(row('me',2,'5'),[market[0]]),'equal unit price is not undercut');
assert(!auctionIsUndercut(row('me',1,'1'),[market[2]]),'currencies never compare');
assert(auctionBelowMarket(item,'gold','3',market,'me'));assert(!auctionBelowMarket(item,'gold','4',market,'me'));
assert(!auctionBelowMarket(item,'gold','-2',market,'me'));assert(!auctionBelowMarket(item,'gold','1',[], 'me'));
assert.equal(auctionSuggestedPrice({kind:'resource',id:'wood',quantity:1000000},'gold',[row('cap',1,'1000000000')]),null,'suggestions respect maximum stack price');
for(const [id,category,quality] of [['slime-residue','junk','uncommon'],['trail-bread','consumables','common'],['greater-tonic','consumables','uncommon'],['stormhorn-core','treasures','epic'],['verdant-revenant','mounts','epic']]){
 assert.equal(auctionCategory({kind:'item',id,quantity:1}),category);assert.equal(auctionQuality({kind:'item',id,quantity:1}),quality);
}
assert.equal(auctionCategory({kind:'gear',id:'ranger-head',quantity:1}),'equipment');assert.equal(auctionQuality({kind:'gear',id:'ranger-head',quantity:1}),'common');
assert.equal(auctionCategory({kind:'item',id:'golden-pig',quantity:1}),'pets');
assert.equal(auctionQuality({kind:'item',id:'golden-pig',quantity:1}),'epic');
assert.deepEqual(auctionMarketListings(item,'gold',[row('bad',0,'1'),row('wrong',1,'NaN')]),[]);
const fixedCopies=[copyGear('warden-longbow',()=>.1),copyGear('warden-longbow',()=>.2)];
const randomCopies=[rollGear('warden-longbow','uncommon',()=>.1),rollGear('warden-longbow','uncommon',()=>.2)];
const gearItem=id=>({kind:'gear',id,quantity:1});
const gearMarket=[['catalog','warden-longbow'],['copy-a',fixedCopies[0].id],['copy-b',fixedCopies[1].id],
 ['upgraded',gearUpgradeQuote(fixedCopies[0].id).nextId],['random-a',randomCopies[0].id],['random-b',randomCopies[1].id]]
 .map(([name,id],index)=>row(name,1,String(10+index),'gold',{item:gearItem(id)}));
for(const id of ['warden-longbow',...fixedCopies.map(gear=>gear.id)]){
 assert.deepEqual(auctionMarketListings(gearItem(id),'gold',gearMarket).map(row=>row.id),['catalog','copy-a','copy-b'],'fixed copies share catalog market prices');
 assert.equal(auctionSuggestedPrice(gearItem(id),'gold',gearMarket),'10');
}
assert.deepEqual(auctionMarketListings(gearMarket[3].item,'gold',gearMarket).map(row=>row.id),['upgraded'],'upgrade levels stay separate');
for(const index of [4,5])assert.deepEqual(auctionMarketListings(gearMarket[index].item,'gold',gearMarket).map(row=>row.id),[gearMarket[index].id],'random rolls only match their exact identity');
const mossRows=[row('moss-large',10,'25','moss'),row('moss-small',2,'6','moss')];
assert.deepEqual(auctionMossTax('100',500), {tax:'5',proceeds:'95',burn:'3.8',treasury:'0.5',devTeam:'0.5',referral:'0.2'});
assert.deepEqual(auctionMossTax('100',1000), {tax:'5',proceeds:'95',burn:'3.6',treasury:'0.5',devTeam:'0.5',referral:'0.4'});
assert.equal(auctionMossTax('0.000000000000000020',500).referral,'0');
assert.equal(auctionMossTax('100',501),null);
for (const [rate,reward,burn] of [[10,'0.1','2.4'],[25,'0.25','2.25'],[50,'0.5','2'],[75,'0.75','1.75'],[100,'1','1.5']]) {
  assert.deepEqual(auctionMossTax('100',rate), {tax:'5',proceeds:'95',burn,treasury:'1.25',devTeam:'1.25',referral:reward});
  assert.equal(auctionMossTax('100',rate,1),null,'New rates cannot be disclosed as legacy fees.');
}
assert.deepEqual(auctionMossTax('100',0,2), {tax:'5',proceeds:'95',burn:'2.5',treasury:'1.25',devTeam:'1.25'});
assert.equal(auctionMossTax('100',500,2),null,'Old burn-share rates cannot be applied to the new settlement.');
assert.equal(auctionMossTax('0.000000000000013333',75).referral,'0.000000000000000099','75 bps rounds down exactly, without truncating its divisor.');

assert.deepEqual(auctionMossTax('100'), { tax: '5', proceeds: '95', burn: '4', treasury: '0.5', devTeam: '0.5' });
assert.deepEqual(auctionMossTax('0.000000000000000019'), { tax: '0', proceeds: '0.000000000000000019', burn: '0', treasury: '0', devTeam: '0' });
assert.deepEqual(auctionMossTax('0.000000000000000020'), { tax: '0.000000000000000001', proceeds: '0.000000000000000019', burn: '0.000000000000000001', treasury: '0', devTeam: '0' });
assert.deepEqual(auctionMossTax('0.000000000000000200'), { tax: '0.00000000000000001', proceeds: '0.00000000000000019', burn: '0.000000000000000008', treasury: '0.000000000000000001', devTeam: '0.000000000000000001' });
assert.deepEqual(auctionMossTax('999999.999999999999999999'), { tax: '49999.999999999999999999', proceeds: '950000', burn: '40000.000000000000000001', treasury: '4999.999999999999999999', devTeam: '4999.999999999999999999' });
for (const invalid of ['', '0', '-1', 'NaN', '1e2', '1000000', '1.0000000000000000001']) assert.equal(auctionMossTax(invalid), null);
assert.equal(formatAuctionUnitPrice(mossRows[0]),'2.5 MOSS');
assert.equal(formatAuctionUnitPrice(row('moss-tiny',2,'0.000000000000000001','moss')),'<0.000000000000000001 MOSS');
assert.equal(auctionSuggestedPrice(item,'moss',[...market,...mossRows]),'7.5');
assert(auctionIsUndercut(mossRows[1],mossRows));assert(!auctionIsUndercut(mossRows[1],market),'ETH and gold never undercut MOSS');
assert(auctionBelowMarket(item,'moss','3',[...market,...mossRows]));
for(const a of ['gold','eth','moss'])for(const b of ['gold','eth','moss']){
  const left=row('a',1,'1',a),right=row('b',1,'1',b);
  assert.equal(Math.sign(compareAuctionPrice(left,right))+Math.sign(compareAuctionPrice(right,left)),0,'mixed-currency comparator is symmetric');
}
assert.deepEqual([mossRows[0],market[2],market[0]].sort(compareAuctionPrice).map(row=>row.currency),['gold','eth','moss']);
const seller = { id: randomUUID(), name: 'Seller', auctions: [], ownedGear: [] };
const saleListing = { ...row(randomUUID(), 3, '0.000000000000000001', 'moss'), sellerId: seller.id, sellerName: seller.name };
const sales = auctionRecordSale(seller, saleListing, 'Buyer');
assert(auctionListingsValid({ ...seller, auctionSales: sales }));
assert.equal(auctionRecordSale({ ...seller, auctionSales: sales }, saleListing, 'Buyer').length, 1, 'retry retains one sale per listing');
for (const auctionSales of [null, {}, [...sales, ...sales], [{ ...sales[0], soldAt: 0 }], [{ ...sales[0], soldAt: Number.MAX_SAFE_INTEGER }], [{ ...sales[0], currency: 'usd' }], [{ ...sales[0], price: 'NaN' }], [{ ...sales[0], buyerName: '<Buyer>' }], [{ ...sales[0], item: { ...sales[0].item, quantity: -1 } }]]) {
  assert.equal(auctionListingsValid({ ...seller, auctionSales }), false, 'malformed saved history is rejected');
}
console.log('PASS: exact gold/ETH/MOSS unit sorting, currency isolation, rounding/limits, reserved/own listing exclusion, real market matching, undercut detection and item categories/quality.');

const goldLot={kind:'gold',id:'gold',quantity:201};
assert.equal(auctionItemValid(goldLot),false,'gold lots never become inventory/bank/GM items');
assert(auctionAssetValid(goldLot));assert.equal(auctionGoldFee(201),2);assert.equal(auctionGoldFee(200),1);assert.equal(auctionGoldFee(1e9),5e6);assert.equal(auctionItemFee(21),2);
for(const quantity of [0,199,200.5,1e9+1,NaN,Infinity])assert(!auctionAssetValid({...goldLot,quantity}));
assert(auctionCanList({...seller,gold:201},goldLot));assert(!auctionCanList({...seller,gold:200},goldLot));
assert.deepEqual(auctionItemChanges({...seller,gold:201},goldLot,-1),{gold:0});assert.deepEqual(auctionItemChanges({...seller,gold:0},goldLot,1),{gold:201});
assert(!auctionCanReceive({...seller,gold:Number.MAX_SAFE_INTEGER-198},goldLot),'overflow cannot receive gold');
const goldListing={...saleListing,item:goldLot,goldFee:2,sellerWallet:'0x1111111111111111111111111111111111111111'};
assert(auctionListingsValid({...seller,auctions:[goldListing]}));
for(const change of [{goldFee:undefined},{goldFee:0},{goldFee:1},{goldFee:3},{currency:'gold'},{currency:'eth'}])assert(!auctionListingsValid({...seller,auctions:[{...goldListing,...change}]}));
assert.equal(auctionRecordSale(seller,goldListing,'Buyer')[0].goldFee,2,'immutable fee copied to sales');
const itemListing={...goldListing,item:{kind:'resource',id:'wood',quantity:1},currency:'gold',price:'21',goldFee:2};delete itemListing.sellerWallet;
assert(auctionListingsValid({...seller,auctions:[itemListing]}));assert(!auctionListingsValid({...seller,auctions:[{...itemListing,goldFee:1}]}));
const legacy={...itemListing};delete legacy.goldFee;assert(auctionListingsValid({...seller,auctions:[legacy]}),'legacy item listings keep zero fee');
console.log('Gold auction assets: strict inventory separation, bounds, fees, overflow, escrow arithmetic and legacy fee compatibility passed.');

assert(auctionCanReceive({...seller,gold:Number.MAX_SAFE_INTEGER-199},goldLot),'buyer limit uses net gold');assert(!auctionCanReceive({...seller,gold:Number.MAX_SAFE_INTEGER-199},goldLot,true),'cancellation needs room for gross gold');
