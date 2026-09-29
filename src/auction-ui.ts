import { deferTouchRender } from './scroll-refresh';
import { translateText } from './localization';
import { CHARACTER_CLASSES, type ClientMessage, type Player, type ServerMessage } from './shared';
import { AUCTIONEER } from './city';
import { AUCTIONEERS } from './city-services';
import { AUCTION_RESOURCES, AUCTION_MAX_QUANTITY, AUCTION_MAX_GOLD, MOSS_TOKEN, auctionOrderTypes, auctionOrderReferralValid, auctionMossTax, auctionGoldFee, auctionItemFee, auctionAssetValid, auctionCanList, auctionCanReceive, auctionGoldPrice, auctionEthPrice, auctionItemLabel, auctionItemValid, type AuctionCurrency, type AuctionAsset, type AuctionItem, type AuctionListing, type AuctionState } from './auction';
import { gearById, MAX_LEVEL, GEAR_QUALITIES } from './progression';
import { renderGearRollDetails, preserveItemRollDetails } from './item-tooltip';
import { gearArt, gearBonuses, lootItemArt } from './character-ui';
import { LOOT_ITEMS } from './loot-items';
import { auctionCategory, auctionQuality, compareAuctionPrice, formatAuctionUnitPrice, auctionMarketListings, auctionSuggestedPrice, auctionIsUndercut, auctionBelowMarket } from './auction-market';
import { icon } from './icons';
import { isNativeApp } from './native-client';
import { openMossvaleWallet, type WalletProvider } from './wallet-provider';
import type { TransactionRequest } from 'ethers';

const escape = (text: string) => text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const resourceIcons: Record<string,string> = {wood:'wood',crystal:'crystal',herb:'resource-herb',potion:'potion',relic:'resource-relic'};
const art = (item: AuctionAsset) => item.kind === 'gold' ? icon('gold') : item.kind === 'gear' ? gearArt(gearById(item.id)!) : item.kind === 'item' ? lootItemArt(item.id) : icon(resourceIcons[item.id]);
const price = (listing: Pick<AuctionListing,'price'|'currency'>) => `${listing.currency === 'gold' ? Number(listing.price).toLocaleString('en-US') : escape(listing.price)} ${listing.currency === 'gold' ? 'gold' : listing.currency === 'moss' ? 'MOSS' : 'ETH'}`;
const marketArt = (name: string) => `<img class="auction-art" src="/ui/auction/${name}.png" alt="" draggable="false">`;
const tooltipId = (item: AuctionAsset) => escape(item.kind === 'item' ? `item:${item.id}` : item.id);
const itemKey = (item: AuctionAsset) => `${item.kind}:${item.id}`;
const parseItem = (key: string): AuctionItem | undefined => {const [kind,id]=key.split(':');const item={kind:kind as AuctionItem['kind'],id,quantity:1};return auctionItemValid(item)?item:undefined;};
const saleWarning = (item: AuctionItem | undefined) => {
  if(!item)return '';
  if(item.kind==='item'&&LOOT_ITEMS[item.id]?.category==='mount')return 'This is an unlearned mount item. You can learn or mint it from your collection instead. I want to list this mount for sale.';
  if(item.kind==='item'&&LOOT_ITEMS[item.id]?.category==='pet')return 'This is an unlearned pet item. You can learn or claim it from your collection instead. I want to list this pet for sale.';
  const quality=auctionQuality(item);
  return quality==='legendary'||quality==='mythic'?`This is a ${quality==='legendary'?'Legendary':'Mythic'} item. I want to list it for sale.`:'';
};
const shortWallet = (wallet: string) => `${wallet.slice(0,6)}…${wallet.slice(-4)}`;
const paymentABI = ['function buy((bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline) order,bytes signature) payable'];
const referralPaymentABI = ['function buy((bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline,address referrer,uint16 referralBps) order,bytes signature)'];
const tokenABI = ['function balanceOf(address) view returns(uint256)','function allowance(address owner,address spender) view returns(uint256)','function approve(address spender,uint256 amount) returns(bool)'];
type PaymentTerms = AuctionListing & { buyer: string; chainId: number; contract: string; token?: string };
const networks = {4663:{chainName:'Robinhood Chain',rpcUrls:['https://rpc.mainnet.chain.robinhood.com'],blockExplorerUrls:['https://robinhoodchain.blockscout.com']},46630:{chainName:'Robinhood Chain Testnet',rpcUrls:['https://rpc.testnet.chain.robinhood.com'],blockExplorerUrls:['https://explorer.testnet.chain.robinhood.com']}};

export async function validateAuctionPayment(message:Extract<ServerMessage,{type:'auctionPayment'}>,terms:PaymentTerms,now=Date.now()) {
  const {Interface,TypedDataEncoder,getAddress,id,parseEther,ZeroAddress}=await import('ethers'),{order}=message;
  const equal=(a:string,b:string)=>getAddress(a)===getAddress(b),amount=parseEther(terms.price),moss=terms.currency==='moss';
  if(!['eth','moss'].includes(terms.currency)||![4663,46630].includes(terms.chainId)||message.listingId!==terms.id||order.listingId!==id(terms.id)
    ||order.chainId!==terms.chainId||!equal(order.contract,terms.contract)||!equal(order.buyer,terms.buyer)||getAddress(order.seller)===ZeroAddress||equal(order.seller,order.buyer)
    ||terms.sellerWallet&&!equal(order.seller,terms.sellerWallet)
    ||!auctionOrderReferralValid(order)||amount<=0n||order.priceWei!==amount.toString()||!Number.isSafeInteger(order.deadline)||order.deadline*1000<=now||!/^0x[\da-f]{130}$/i.test(order.signature)
    ||(moss?order.currency!=='moss'||terms.chainId!==MOSS_TOKEN.chainId||!terms.token||!equal(terms.token,MOSS_TOKEN.address)||!order.token||!equal(order.token,MOSS_TOKEN.address)
      :order.currency!==undefined&&order.currency!=='eth'||order.token!==undefined||order.approval!==undefined))throw Error('Payment terms changed or expired. Refresh the listing before paying.');
  const types=auctionOrderTypes(order);
  if(order.orderHash!==TypedDataEncoder.hash({name:moss?'MossvaleTokenAuction':'MossvaleAuction',version:'1',chainId:terms.chainId,verifyingContract:terms.contract},types,order))throw Error('The signed order does not match this purchase.');
  const data=new Interface(order.referralBps===undefined?paymentABI:referralPaymentABI).encodeFunctionData('buy',[order,order.signature]),value=moss?0n:amount;
  if(!equal(order.transaction.to,terms.contract)||order.transaction.data.toLowerCase()!==data.toLowerCase()||BigInt(order.transaction.value)!==value||BigInt(order.transaction.chainId)!==BigInt(terms.chainId))throw Error('The wallet transaction does not match the reviewed listing.');
  let approval:{to:string;data:string;value:bigint;chainId:number}|undefined;
  if(moss){
    const data=new Interface(tokenABI).encodeFunctionData('approve',[terms.contract,amount]),request=order.approval;
    if(!request||!equal(request.to,MOSS_TOKEN.address)||request.data.toLowerCase()!==data.toLowerCase()||BigInt(request.value)!==0n||BigInt(request.chainId)!==BigInt(MOSS_TOKEN.chainId))throw Error('The token approval does not match the exact MOSS purchase.');
    approval={to:getAddress(MOSS_TOKEN.address),data,value:0n,chainId:MOSS_TOKEN.chainId};
  }
  // Only the reviewed recipient, call, value and network can reach the wallet.
  return {to:getAddress(terms.contract),data,value,chainId:terms.chainId,...(approval?{approval}:{})};
}

/** A public buyout market at the auctioneer. Items move only after server confirmation. */
export function mountAuctionUI(options: { send: (message: ClientMessage) => void; getPlayer: () => Player | undefined; onOpen: () => void; nearby: (npcId?: string) => boolean; onBags?: () => void }) {
  const panel = document.createElement('section');panel.id='auction-window';panel.hidden=true;
  deferTouchRender(panel,()=>{});
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','auction-title');
  document.body.append(panel);
  let state: AuctionState | null=null, tab:'browse'|'sell'|'mine'|'sold'|'exchange'|'purchases'='browse', selected:string|null=null, busy=false, search='', walletAddress='',walletLinkPending=false, session=0;
  let awaitingPayment: PaymentTerms|null=null,walletBusy=false,bagKey='';
  let selectedProvider: WalletProvider | undefined, walletConnection: Promise<WalletProvider> | undefined;
  let walletLifetime = new AbortController(), walletPreparing = false;
  const walletReady = () => !!selectedProvider?.mossvaleWallet && !!walletAddress && walletAddress.toLowerCase() === state?.wallet?.toLowerCase();
  let mossBalance:{key:string;amount?:bigint;loading:boolean;checkedAt:number}|undefined;
  const mossBalanceKey=()=>{const market=state?.crypto.moss;return walletReady()&&market?.enabled&&market.chainId===MOSS_TOKEN.chainId&&market.token?.toLowerCase()===MOSS_TOKEN.address.toLowerCase()&&market.decimals===MOSS_TOKEN.decimals?`${session}:${options.getPlayer()?.id}:${walletAddress.toLowerCase()}:${market.contract}`:'';};
  let category='all',currencyFilter='all',mineFilter='all',sort:'unit'|'total'|'name'|'quantity'|'rarity'='unit',ascending=true,exactItem='',statusMessage='',preferenceOwner='';
  let equipmentClass='all',equipmentRarity='all',minLevel='',maxLevel='';
  let savedItems:string[]=[],history:string[]=[];
  let draft={item:'',quantity:'1',currency:'gold' as 'gold'|'moss',price:'',ack:false,saleAck:false};
  let exchangeDraft={quantity:'200',price:''};
  let pending:{kind:'buy'|'cancel';id:string;currency:AuctionCurrency}|{kind:'sell';item:AuctionAsset;currency:AuctionCurrency;price:string;known:string[]}|undefined;
  const purchaseAttempts=new Map<string,'unpaid'|'wallet'|'submitted'|'pending'>();
  let lastPaymentCheck=0,paymentCheckIndex=0;
  const purchaseKey=(listingId:string,playerId=options.getPlayer()?.id)=>`${playerId}:${listingId}`;
  // A restored reservation might already be paid. Only a purchase started here is
  // known unpaid; ambiguous attempts wait for the server's payment or unpaid-expiry proof.
  const purchasePending=(row:AuctionListing)=>['wallet','submitted','pending'].includes(purchaseAttempts.get(purchaseKey(row.id))??'')||!!row.reservation&&row.reservation.buyerId===options.getPlayer()?.id&&!!(row.reservation.delivered||row.reservation.processed||purchaseAttempts.get(purchaseKey(row.id))!=='unpaid');
  function purchaseStatus(row:AuctionListing){
    const reservation=row.reservation,attempt=purchaseAttempts.get(purchaseKey(row.id));
    if(reservation&&reservation.buyerId!==options.getPlayer()?.id||!reservation&&!attempt)return '';
    if(!reservation&&attempt==='unpaid')return awaitingPayment?.id===row.id?'Reserving the selected listing…':'';
    if(reservation?.delivered)return 'Payment found. Your item is in your bags while verification finishes. It cannot be sold or consumed yet.';
    if(reservation?.processed)return 'Payment found. Checking Gold delivery. Do not pay again.';
    if(reservation&&reservation.expiresAt<=Date.now())return 'Payment window ended. Checking the chain before any unpaid reservation can be released. Do not pay again.';
    if(attempt==='wallet'&&walletBusy)return 'Waiting for your wallet. Review the open request; if you already approved it, wait for the result.';
    if(attempt==='submitted')return 'Payment submitted. Checking delivery. Do not pay again.';
    if(attempt==='unpaid')return awaitingPayment?.id===row.id?'Reserved. Preparing your wallet payment…':'Reserved. This attempt did not complete a payment. You can review Buy again.';
    return 'Checking payment status. A reservation does not confirm payment. Open Settings → Wallet → Activity to check a pending wallet request. Do not pay again.';
  }
  const auctioneer=()=>AUCTIONEERS.find(npc=>npc.id===(state?.npcId??AUCTIONEER.id))!;
  const nearby=()=>options.nearby(state?.npcId);
  const settlement=(currency:AuctionCurrency)=>currency==='moss'?state?.crypto.moss:currency==='eth'?state?.crypto:undefined;
  function previousMossContracts(){
    const market=state?.crypto.moss;
    if(market?.chainId!==MOSS_TOKEN.chainId||market.token?.toLowerCase()!==MOSS_TOKEN.address.toLowerCase()||market.decimals!==MOSS_TOKEN.decimals)return [];
    const previous=[...(market.previousContracts??[]),market.previousContract].filter((address):address is string=>!!address&&/^0x[\da-f]{40}$/i.test(address)&&!/^0x0{40}$/i.test(address)&&address.toLowerCase()!==market.contract?.toLowerCase());
    return previous.filter((address,index)=>previous.findIndex(candidate=>candidate.toLowerCase()===address.toLowerCase())===index);
  }
  function mossTaxPreview(amount:string,reservation?:AuctionListing['reservation']){
    const market=state?.crypto.moss;
    if(market?.taxBps!==500||!market.devTeam||reservation&&(!reservation.order?.contract||reservation.order.contract.toLowerCase()!==market.contract?.toLowerCase()))return '';
    const order=reservation?.order,split=auctionMossTax(amount.trim(),order?.referralBps,market.feeVersion ?? 1);
    return split?`Auction tax (5%): ${split.tax} MOSS · Seller receives: ${split.proceeds} MOSS · Burn: ${split.burn} MOSS · Treasury: ${split.treasury} MOSS · Dev team: ${split.devTeam} MOSS${split.referral!==undefined?` · Referral: ${split.referral} MOSS (${order!.referralBps!/100}% of ${market.feeVersion === 2 ? 'purchase price' : 'burn share'}) to ${escape(shortWallet(order!.referrer!))}`:market.referralsEnabled&&!order?' · Eligible referral rewards come from the burn share.':''}`:'';
  }
  const query = <T extends HTMLElement=HTMLElement>(selector:string) => panel.querySelector<T>(selector)!;
  const editing=()=>!!document.activeElement&&['INPUT','SELECT'].includes(document.activeElement.tagName)&&panel.contains(document.activeElement);
  const send = (message:ClientMessage) => {busy=true;options.send(message);};
  const say = (message:string) => {statusMessage=message;const node=query('#auction-status');if(node)node.textContent=message;};
  function checkPayments(force=false){
    if(panel.hidden||isNativeApp()||!nearby()||awaitingPayment||!state||!options.getPlayer())return;
    const rows=state.listings.filter(row=>row.currency!=='gold'&&row.reservation?.buyerId===options.getPlayer()?.id);
    if(!rows.length||!force&&Date.now()-lastPaymentCheck<5000)return;
    lastPaymentCheck=Date.now();const row=rows[paymentCheckIndex++%rows.length];
    options.send({type:'auctionPaymentCheck',npcId:auctioneer().id,listingId:row.id});
  }
  function close(){for(const [key,value] of purchaseAttempts)if(value==='unpaid')purchaseAttempts.delete(key);else if(value==='wallet')purchaseAttempts.set(key,'pending');readDraft();panel.hidden=true;busy=false;awaitingPayment=null;walletLinkPending=false;pending=undefined;session++;walletLifetime.abort();walletLifetime=new AbortController();walletConnection=undefined;selectedProvider=undefined;walletAddress='';walletPreparing=false;mossBalance=undefined;}
  const current=()=>({session,playerId:options.getPlayer()?.id});
  const active=(operation:ReturnType<typeof current>)=>operation.session===session&&operation.playerId===options.getPlayer()?.id&&!panel.hidden&&nearby();
  function reject(message:string){if(panel.hidden)return;busy=false;awaitingPayment=null;walletLinkPending=false;pending=undefined;paint();say(message);}
  function mossBalanceNote(row:AuctionListing){
    if(row.currency!=='moss'||!walletReady()||!state?.crypto.moss?.enabled)return '';
    const key=mossBalanceKey();if(!key)return 'MOSS balance unavailable. Refresh the market to retry.';
    if(mossBalance?.key!==key||mossBalance.loading)return 'Checking MOSS balance…';
    if(mossBalance.amount===undefined)return 'MOSS balance unavailable. Refresh the market to retry.';
    if(!auctionEthPrice(row.price))return 'Listing price unavailable. Refresh the market.';
    const [whole,fraction='']=row.price.split('.');
    return mossBalance.amount<BigInt(whole+fraction.padEnd(MOSS_TOKEN.decimals,'0'))?'Not enough MOSS in your linked wallet. Add MOSS, then refresh the market.':'';
  }
  async function refreshMossBalance(force=false){
    const key=mossBalanceKey();if(!key||panel.hidden||isNativeApp()||!nearby()||busy||walletBusy||awaitingPayment)return;
    if(mossBalance?.key===key&&(mossBalance.loading||!force&&Date.now()-mossBalance.checkedAt<15000))return;
    const balance:{key:string;amount?:bigint;loading:boolean;checkedAt:number}={key,loading:true,checkedAt:Date.now()},operation=current(),address=walletAddress,provider=selectedProvider!;
    mossBalance=balance;query('#auction-wallet-note')?.setAttribute('aria-busy','true');renderResults();
    try{
      const {Interface}=await import('ethers'),token=new Interface(tokenABI);
      if(!active(operation)||mossBalance!==balance||mossBalanceKey()!==key)return;
      const result=await provider.request({method:'eth_call',params:[{to:MOSS_TOKEN.address,data:token.encodeFunctionData('balanceOf',[address])},'latest']});
      if(!active(operation)||mossBalance!==balance||mossBalanceKey()!==key)return;
      const [accounts,chainId]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
      if(accounts[0]?.toLowerCase()!==address.toLowerCase()||BigInt(chainId)!==BigInt(MOSS_TOKEN.chainId))throw Error('Wallet changed.');
      if(active(operation)&&mossBalance===balance&&mossBalanceKey()===key)balance.amount=token.decodeFunctionResult('balanceOf',result)[0];
    }catch{/* A failed read disables MOSS purchases without blocking the rest of the market. */}
    finally{if(active(operation)&&mossBalance===balance&&mossBalanceKey()===key){balance.loading=false;balance.checkedAt=Date.now();query('#auction-wallet-note')?.setAttribute('aria-busy','false');renderResults();}}
  }
  async function wallet() {
    if(isNativeApp())throw Error('Mobile auctions use earned gold.');
    if(!walletConnection){
      const connection=openMossvaleWallet(walletLifetime.signal).catch(error=>{if(walletConnection===connection)walletConnection=undefined;throw error;});
      walletConnection=connection;
    }
    const lifetime=walletLifetime.signal,provider=await walletConnection;
    lifetime.throwIfAborted();
    if(!provider.mossvaleWallet)throw Error('Auction trading requires Mossvale Wallet.');
    selectedProvider=provider;
    const {BrowserProvider}=await import('ethers');return new BrowserProvider(selectedProvider,'any');
  }
  async function network(provider:Awaited<ReturnType<typeof wallet>>,chainId:number) {
    if(![4663,46630].includes(chainId))throw Error('Unsupported auction network.');
    const chain=`0x${chainId.toString(16)}`;
    if(BigInt(await provider.send('eth_chainId',[]))!==BigInt(chainId)){
      try{await provider.send('wallet_switchEthereumChain',[{chainId:chain}]);}
      catch(error){const value=error as {code?:number;error?:{code?:number};info?:{error?:{code?:number}}};if(value.code!==4902&&value.error?.code!==4902&&value.info?.error?.code!==4902)throw error;
        await provider.send('wallet_addEthereumChain',[{chainId:chain,...networks[chainId as keyof typeof networks],nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}}]);
        await provider.send('wallet_switchEthereumChain',[{chainId:chain}]);
      }
    }
    if(BigInt(await provider.send('eth_chainId',[]))!==BigInt(chainId))throw Error('Select the matching Robinhood network in your wallet.');
  }
  async function checkedSigner(provider:Awaited<ReturnType<typeof wallet>>,address:string,chainId?:number) {
    let accounts:string[]=await provider.send('eth_accounts',[]);
    if(!accounts.length)accounts=await provider.send('eth_requestAccounts',[]);
    if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw Error('Your wallet account changed. Select your linked wallet again.');
    if(chainId!==undefined&&BigInt(await provider.send('eth_chainId',[]))!==BigInt(chainId))throw Error('Your wallet network changed. Try again.');
    return provider.getSigner(address);
  }
  async function sendWalletTransaction(provider:Awaited<ReturnType<typeof wallet>>,signer:Awaited<ReturnType<typeof checkedSigner>>,transaction:TransactionRequest,purchase?:PaymentTerms,approval?:{to:string;data:string;value:bigint;chainId:number}) {
    const selected=selectedProvider;
    if(!selected?.mossvaleWallet)throw Error('Auction trading requires Mossvale Wallet.');
    // Funding and fee estimation happen together in the embedded wallet, before signing.
    const auctionPurchase=purchase?.currency==='moss'?{item:structuredClone(purchase.item),listingId:purchase.id,contract:purchase.contract,price:purchase.price}:undefined;
    const request={...provider.getRpcTransaction({...transaction,from:await signer.getAddress()}),...(approval?{approval:{to:approval.to,data:approval.data,value:approval.value.toString()}}:{})};
    const hash:string=await selected.request({method:'eth_sendTransaction',params:[request],...(auctionPurchase?{auctionPurchase}:{})});
    return {hash,wait:()=>provider.waitForTransaction(hash)};
  }
  async function prepareWallet() {
    if(isNativeApp()||walletPreparing||!state||!state.crypto.moss?.enabled&&!state.crypto.enabled&&!previousMossContracts().length)return;
    walletPreparing=true;const operation=current();
    try {
      const provider=await wallet();if(!active(operation))return;
      const accounts:string[]=await provider.send('eth_accounts',[]);if(!active(operation))return;
      if(!accounts[0])throw Error('Mossvale Wallet could not be prepared. Try again.');
      walletAddress=accounts[0];
    }catch(error){if(active(operation))say(error instanceof Error?error.message:'Mossvale Wallet could not connect.');return;}
    finally{if(active(operation)){walletPreparing=false;paint();void refreshMossBalance();}}
    if(active(operation))void connectWallet();
  }
  async function connectWallet() {
    if(isNativeApp()||busy||walletBusy||walletPreparing||panel.hidden||!nearby()||!selectedProvider||!walletAddress)return;
    const operation=current();
    if(walletReady()||!state?.crypto.moss?.enabled&&!previousMossContracts().length)return;
    walletBusy=true;
    try {
      const provider=await wallet();if(!active(operation))return;
      const signer=await provider.getSigner(),address=await signer.getAddress();if(!active(operation))return;walletAddress=address;
      walletLinkPending=true;send({type:'auctionWalletChallenge',npcId:auctioneer().id,wallet:walletAddress});say('Approve the one-time auction link in Mossvale Wallet. Your unsold listings will move to this wallet.');
    }catch(error){if(active(operation))reject(error instanceof Error?error.message:'Mossvale Wallet could not connect.');}finally{walletBusy=false;}
  }
  async function walletChallenge(message:Extract<ServerMessage,{type:'auctionWalletChallenge'}>) {
    if(!walletLinkPending||walletBusy||panel.hidden||!nearby()||message.address.toLowerCase()!==walletAddress.toLowerCase()||message.expiresAt<=Date.now())return;
    walletBusy=true;const operation=current();
    try {
      const provider=await wallet();if(!active(operation))return;
      const signer=await checkedSigner(provider,message.address);if(!active(operation))return;
      const signature=await signer.signMessage(message.message);
      if(active(operation)){walletLinkPending=false;send({type:'auctionWalletBind',npcId:auctioneer().id,signature});}
    }catch(error){if(active(operation))reject(error instanceof Error?error.message:'Wallet link was declined.');}finally{walletBusy=false;}
  }
  async function payment(message:Extract<ServerMessage,{type:'auctionPayment'}>) {
    if(walletBusy||panel.hidden||!nearby()||message.listingId!==awaitingPayment?.id)return;
    const terms=awaitingPayment,operation=current();awaitingPayment=null;walletBusy=true;paint();
    const attemptKey=purchaseKey(terms.id,operation.playerId);
    let requestedPurchase=false;
    function review(){
      const row=state?.listings.find(row=>row.id===terms.id),market=settlement(terms.currency);
      if(!row||row.reservation?.delivered||row.reservation?.processed||row.price!==terms.price||row.currency!==terms.currency||row.sellerId!==terms.sellerId||row.sellerWallet!==terms.sellerWallet||row.item.id!==terms.item.id||row.item.kind!==terms.item.kind||row.item.quantity!==terms.item.quantity||row.goldFee!==terms.goldFee
        ||state?.wallet?.toLowerCase()!==terms.buyer.toLowerCase()||!market?.enabled||market.chainId!==terms.chainId||market.contract?.toLowerCase()!==terms.contract.toLowerCase()
        ||terms.currency==='moss'&&(market.token?.toLowerCase()!==MOSS_TOKEN.address.toLowerCase()||market.decimals!==MOSS_TOKEN.decimals)
        ||message.order.deadline*1000<=Date.now())throw Error('The listing, wallet or payment settings changed. Review your reserved purchase again.');
    }
    try {
      if(purchaseAttempts.get(attemptKey)!=='unpaid'){say('Purchase pending…');return;}
      review();const {approval,...transactionRequest}=await validateAuctionPayment(message,terms);if(!active(operation))return;
      const provider=await wallet();if(!active(operation))return;await network(provider,terms.chainId);if(!active(operation))return;
      let signer=await checkedSigner(provider,terms.buyer,terms.chainId);if(!active(operation))return;
      if(approval){
        const {Contract,parseEther}=await import('ethers'),token=new Contract(MOSS_TOKEN.address,tokenABI,provider),amount=parseEther(terms.price);
        const balance=await token.balanceOf(terms.buyer);if(!active(operation))return;
        if(mossBalance?.key===mossBalanceKey()){mossBalance.amount=balance;mossBalance.checkedAt=Date.now();}
        if(balance<amount)throw Error('Not enough MOSS in your linked wallet.');
      }
      review();signer=await checkedSigner(provider,terms.buyer,terms.chainId);if(!active(operation))return;review();
      say(terms.currency==='moss'?`Pay ${terms.price} MOSS. Mossvale covers eligible network fees. Confirm in your wallet.`:'Confirm the exact purchase in your wallet.');
      // Once requested, an uncertain wallet result must never offer another purchase.
      purchaseAttempts.set(attemptKey,'wallet');requestedPurchase=true;renderResults();
      const transaction=await sendWalletTransaction(provider,signer,transactionRequest,terms,approval);if(!active(operation))return;
      purchaseAttempts.set(attemptKey,'submitted');
      options.send({type:'auctionPaymentCheck',npcId:auctioneer().id,listingId:message.listingId,transactionHash:transaction.hash});
      say(terms.item.kind==='gold'?'Payment sent. Gold arrives after payment is processed.':'Payment sent. Your item arrives when payment is processed.');
    }catch(error){
      const failure=error as {code?:number|string;confirmedSponsoredFailure?:boolean;transactionNotSubmitted?:boolean};
      if(requestedPurchase&&active(operation))purchaseAttempts.set(attemptKey,failure?.code==='WALLET_PENDING_TRANSACTION'||failure?.confirmedSponsoredFailure===true||failure?.transactionNotSubmitted===true?'unpaid':'pending');
      if(active(operation))reject(requestedPurchase&&purchaseAttempts.get(attemptKey)==='pending'?'Payment result is unknown. Checking payment status. Open Settings → Wallet → Activity to check the pending request. Do not pay again.':error instanceof Error?error.message:'Purchase cancelled.');
    }
    finally{walletBusy=false;if(active(operation)){busy=false;paint();}}
  }
  async function withdraw(currency:'eth'|'moss'='eth',previous?:string) {
    const market=settlement(currency),contractAddress=previous&&currency==='moss'&&previousMossContracts().includes(previous)?previous:!previous&&market?.enabled?market.contract:undefined;
    if(busy||walletBusy||panel.hidden||!nearby()||!state?.wallet||!market||!contractAddress||!market.chainId)return;
    if(currency==='moss'&&(market.chainId!==MOSS_TOKEN.chainId||market.token?.toLowerCase()!==MOSS_TOKEN.address.toLowerCase()||market.decimals!==MOSS_TOKEN.decimals))return;
    walletBusy=true;const operation=current(),address=state.wallet,chainId=market.chainId,symbol=currency==='moss'?'MOSS':'ETH';paint();
    try {
      const {Contract,formatEther}=await import('ethers'),provider=await wallet();if(!active(operation))return;
      await network(provider,chainId);if(!active(operation))return;const signer=await checkedSigner(provider,address,chainId);
      const contract=new Contract(contractAddress,['function proceeds(address) view returns(uint256)','function withdraw(address recipient)'],provider);
      const amount:bigint=await contract.proceeds(address);if(!active(operation))return;if(!amount){say(`No ${symbol} proceeds are waiting to be withdrawn.`);return;}
      await checkedSigner(provider,address,chainId);if(!active(operation))return;
      const currentMarket=settlement(currency);
      if(state.wallet?.toLowerCase()!==address.toLowerCase()||!currentMarket||(previous?!previousMossContracts().includes(contractAddress):!currentMarket.enabled||currentMarket.contract!==contractAddress)||currentMarket.chainId!==chainId||currentMarket.token!==market.token||currentMarket.decimals!==market.decimals)throw Error('The linked wallet or settlement contract changed. Try again.');
      say(`Withdraw ${formatEther(amount)} ${symbol} to ${shortWallet(address)}. Confirm in your wallet.`);
      const transaction=await sendWalletTransaction(provider,signer,{to:contractAddress,data:contract.interface.encodeFunctionData('withdraw',[address]),value:0n,chainId});
      if(!active(operation))return;say('Withdrawal sent. Waiting for confirmation…');const receipt=await transaction.wait();if(active(operation)&&receipt?.status===1)say(`${formatEther(amount)} ${symbol} withdrawn to your wallet.`);
    }catch(error){if(active(operation))say(error instanceof Error?error.message:'Withdrawal could not complete.');}
    finally{walletBusy=false;if(!panel.hidden){busy=false;paint();}}
  }
  function inventoryCount(item:AuctionItem,player=options.getPlayer()) {
    return !player?0:item.kind==='gear'?1:item.kind==='item'?player.carriedItems?.[item.id]||0:player.inventory[item.id as keyof Player['inventory']];
  }
  function sellable() {
    const player=options.getPlayer();if(!player)return [];
    return [...player.ownedGear.map(id=>({kind:'gear' as const,id,quantity:1})),...AUCTION_RESOURCES.map(id=>({kind:'resource' as const,id,quantity:1})),...Object.keys(player.carriedItems||{}).map(id=>({kind:'item' as const,id,quantity:1}))]
      .filter(item=>auctionCanList(player,item)&&!(item.kind==='gear'&&state?.mine.some(row=>row.item.kind==='gear'&&row.item.id===item.id)))
      .sort((a,b)=>auctionItemLabel(a).localeCompare(auctionItemLabel(b)));
  }
  function readDraft(){
    const exchange=query<HTMLFormElement>('#auction-exchange');if(exchange){exchangeDraft={quantity:query<HTMLInputElement>('[name="goldQuantity"]').value,price:query<HTMLInputElement>('[name="mossPrice"]').value};}
    const form=query<HTMLFormElement>('#auction-sell');if(!form)return;
    const previous={...draft};
    for(const name of ['item','quantity','price'] as const){const input=query<HTMLInputElement>(`[name="${name}"]`);if(input)draft[name]=input.value;}
    const currency=query<HTMLSelectElement>('[name="currency"]');if(isNativeApp())draft.currency='gold';else if(currency&&(currency.value==='gold'||currency.value==='moss'))draft.currency=currency.value;
    const ack=query<HTMLInputElement>('[data-price-ack]');if(ack)draft.ack=ack.checked;
    const saleAck=query<HTMLInputElement>('[data-sale-ack]');
    draft.saleAck=(['item','quantity','currency','price'] as const).some(key=>draft[key]!==previous[key])?false:!!saleAck?.checked;
    if(isNativeApp()&&currency?.value==='moss'){draft.price='';draft.ack=false;draft.saleAck=false;}
    if(saleAck)saleAck.checked=draft.saleAck;
  }
  function preserve(work:()=>void){
    const restoreRollDetails=preserveItemRollDetails(panel);
    const active=document.activeElement as HTMLInputElement|null,focus=active&&panel.contains(active)?active.dataset.focusKey:undefined;
    const selection=focus&&typeof active?.selectionStart==='number'?[active.selectionStart,active.selectionEnd??active.selectionStart]:undefined;
    const scroll=new Map([...panel.querySelectorAll<HTMLElement>('[data-auction-scroll]')].map(node=>[node.dataset.auctionScroll,[node.scrollTop,node.scrollLeft]]));
    work();restoreRollDetails();
    for(const node of panel.querySelectorAll<HTMLElement>('[data-auction-scroll]'))if(scroll.has(node.dataset.auctionScroll)){const [top,left]=scroll.get(node.dataset.auctionScroll)!;node.scrollTop=top;node.scrollLeft=left;}
    if(focus){const node=[...panel.querySelectorAll<HTMLInputElement>('[data-focus-key]')].find(node=>node.dataset.focusKey===focus);if(node&&!node.disabled){node.focus({preventScroll:true});if(selection&&typeof node.setSelectionRange==='function'&&node.type!=='number')node.setSelectionRange(selection[0],selection[1]);}}
  }
  function loadPreferences(){
    const id=options.getPlayer()?.id||'';if(id===preferenceOwner)return;
    preferenceOwner=id;savedItems=[];history=[];draft={item:'',quantity:'1',currency:'gold',price:'',ack:false,saleAck:false};
    try{const value=JSON.parse(window.localStorage.getItem(`mossvale.auction.${id}`)||'{}');
      if(Array.isArray(value.saved))savedItems=[...new Set(value.saved.filter((key:unknown)=>typeof key==='string'&&!!parseItem(key)))] as string[];
      if(Array.isArray(value.history))history=[...new Set(value.history.filter((term:unknown)=>typeof term==='string'&&term.trim().length>0&&term.length<=80))] as string[];
    }catch{/* Browsing and trading still work when local preferences are unavailable. */}
    savedItems=savedItems.slice(0,16);history=history.slice(0,8);
  }
  function savePreferences(){try{window.localStorage.setItem(`mossvale.auction.${preferenceOwner}`,JSON.stringify({saved:savedItems,history}));}catch{/* Preferences are optional. */}}
  function rememberSearch(){const term=search.trim();if(term){history=[term,...history.filter(value=>value!==term)].slice(0,8);savePreferences();}}
  function saveItem(item:AuctionItem){const key=itemKey(item);if(!savedItems.includes(key)){savedItems=[key,...savedItems].slice(0,16);savePreferences();}say(`${auctionItemLabel(item)} added to your shopping list.`);}
  function shoppingTools(){
    return `<div class="auction-toolbar"><form id="auction-search-form" class="auction-search"><label for="auction-search">Search items or sellers</label><div class="auction-search-line"><input id="auction-search" data-focus-key="search" type="search" value="${escape(search)}" maxlength="80" placeholder="Search the market"><button type="submit" data-focus-key="search-go">Find</button></div></form><label class="auction-control">Currency<select id="auction-currency" data-focus-key="currency-filter"><option value="all">All currencies</option><option value="gold">Gold</option>${isNativeApp()?'':'<option value="moss">MOSS</option>'}</select></label></div>`;
  }
  function shoppingSidebar(){
    return `<aside class="auction-sidebar" data-auction-scroll="sidebar"><h3>Browse items</h3><nav class="auction-categories" aria-label="Item categories">${[['all','All items'],['equipment','Equipment'],['consumables','Consumables'],['materials','Materials'],['treasures','Treasures'],['pets','Pets'],['mounts','Mounts'],['junk','Junk']].map(([value,label])=>`<button data-auction-category="${value}" aria-pressed="${category===value}" data-focus-key="category-${value}">${label}</button>`).join('')}</nav><div class="auction-category-select"><label class="auction-control">Category<select id="auction-category" data-focus-key="category">${[['all','All items'],['equipment','Equipment'],['consumables','Consumables'],['materials','Materials'],['treasures','Treasures'],['pets','Pets'],['mounts','Mounts'],['junk','Junk']].map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label></div><fieldset id="auction-equipment-filters" ${category==='equipment'?'':'hidden'}><legend>Equipment</legend><label class="auction-control">Usable by class<select id="auction-class" data-focus-key="equipment-class"><option value="all">All classes</option>${CHARACTER_CLASSES.map(name=>`<option value="${name}">${name}</option>`).join('')}</select></label><label class="auction-control">Rarity<select id="auction-rarity" data-focus-key="equipment-rarity"><option value="all">All rarities</option>${GEAR_QUALITIES.map(quality=>`<option value="${quality}">${quality[0].toUpperCase()+quality.slice(1)}</option>`).join('')}</select></label><div class="auction-level-range"><label class="auction-control">Min level<input id="auction-level-min" data-focus-key="level-min" type="number" inputmode="numeric" min="1" max="${MAX_LEVEL}" step="1" placeholder="1" value="${escape(minLevel)}"></label><label class="auction-control">Max level<input id="auction-level-max" data-focus-key="level-max" type="number" inputmode="numeric" min="1" max="${MAX_LEVEL}" step="1" placeholder="${MAX_LEVEL}" value="${escape(maxLevel)}"></label></div></fieldset>${tab==='mine'?`<label class="auction-control">Show<select id="auction-mine-filter" data-focus-key="mine-filter"><option value="all">All my auctions</option><option value="undercut">Undercut</option><option value="reserved">Reserved payments</option><option value="available">Available to cancel</option></select></label><p class="auction-sidebar-note">${state!.mine.filter(row=>auctionIsUndercut(row,state!.listings)).length} undercut · ${state!.mine.filter(row=>row.reservation).length} reserved</p>`:''}<button class="auction-reset" data-search-reset>Clear filters</button><details class="auction-shortcuts"><summary>Shopping list &amp; recent searches</summary><h3>Shopping list</h3><div class="auction-saved">${savedItems.length?savedItems.map((key,index)=>{const item=parseItem(key)!;return `<div><button data-shopping-item="${escape(key)}" data-focus-key="saved-${index}" data-item-tooltip="${tooltipId(item)}">${art(item)}<span>${escape(auctionItemLabel(item))}</span></button><button data-shopping-remove="${escape(key)}" aria-label="Remove ${escape(auctionItemLabel(item))} from shopping list">×</button></div>`;}).join(''):'<p class="auction-sidebar-note">Select an item, then save it here.</p>'}</div><h3>Recent searches</h3><div class="auction-history">${history.length?history.map((term,index)=>`<button data-search-history="${index}" data-focus-key="history-${index}" title="${escape(term)}">${escape(term)}</button>`).join(''):'<p class="auction-sidebar-note">Your searches appear here.</p>'}</div></details></aside>`;
  }
  function wireShopping(){
    const input=query<HTMLInputElement>('#auction-search');input.oninput=()=>{search=input.value;exactItem='';selected=null;renderResults();};
    query<HTMLFormElement>('#auction-search-form').onsubmit=event=>{event.preventDefault();search=input.value;exactItem='';rememberSearch();renderBody();};
    panel.querySelectorAll<HTMLButtonElement>('[data-auction-category]').forEach(button=>button.onclick=()=>{category=button.dataset.auctionCategory!;selected=null;renderBody();});
    const categorySelect=query<HTMLSelectElement>('#auction-category');categorySelect.value=category;categorySelect.onchange=()=>{category=categorySelect.value;selected=null;renderBody();};
    const classSelect=query<HTMLSelectElement>('#auction-class');classSelect.value=equipmentClass;classSelect.onchange=()=>{equipmentClass=classSelect.value;selected=null;renderResults();};
    const raritySelect=query<HTMLSelectElement>('#auction-rarity');raritySelect.value=equipmentRarity;raritySelect.onchange=()=>{equipmentRarity=raritySelect.value;selected=null;renderResults();};
    for(const [id,set] of [['#auction-level-min',(value:string)=>{minLevel=value;}],['#auction-level-max',(value:string)=>{maxLevel=value;}]] as const){const input=query<HTMLInputElement>(id);input.oninput=()=>{set(input.value);selected=null;renderResults();};}
    const currencySelect=query<HTMLSelectElement>('#auction-currency');currencySelect.value=currencyFilter;currencySelect.onchange=()=>{currencyFilter=currencySelect.value;selected=null;renderResults();};
    const mineSelect=query<HTMLSelectElement>('#auction-mine-filter');if(mineSelect){mineSelect.value=mineFilter;mineSelect.onchange=()=>{mineFilter=mineSelect.value;selected=null;renderResults();};}
    query('[data-search-reset]').onclick=()=>{search='';exactItem='';category='all';currencyFilter='all';mineFilter='all';equipmentClass='all';equipmentRarity='all';minLevel='';maxLevel='';selected=null;renderBody();};
    panel.querySelectorAll<HTMLButtonElement>('[data-shopping-item]').forEach(button=>button.onclick=()=>{exactItem=button.dataset.shoppingItem!;search=auctionItemLabel(parseItem(exactItem)!);category='all';currencyFilter='all';tab='browse';selected=null;paint();});
    panel.querySelectorAll<HTMLButtonElement>('[data-shopping-remove]').forEach(button=>button.onclick=()=>{savedItems=savedItems.filter(key=>key!==button.dataset.shoppingRemove);savePreferences();renderBody();});
    panel.querySelectorAll<HTMLButtonElement>('[data-search-history]').forEach(button=>button.onclick=()=>{search=history[Number(button.dataset.searchHistory)];exactItem='';selected=null;renderBody();});
  }
  function table(rows:readonly AuctionListing[],interactive=true){
    const heading=(key:typeof sort,text:string)=>interactive?`<button data-auction-sort="${key}" data-focus-key="sort-${key}">${text}${sort===key?ascending?' ↑':' ↓':''}</button>`:text;
    return `<table class="auction-table"><thead><tr><th>${heading('name','Item')}${interactive?`<span class="auction-rarity-sort">${heading('rarity','Rarity')}</span>`:''}</th><th>${heading('quantity','Qty')}</th><th>${heading('unit','Unit price')}</th><th>${heading('total','Total price')}</th><th>Seller</th></tr></thead><tbody>${rows.map(row=>{
      const mine=row.sellerId===options.getPlayer()?.id,undercut=mine&&auctionIsUndercut(row,state!.listings),name=auctionItemLabel(row.item),gear=row.item.kind==='gear'?gearById(row.item.id):undefined;
      return `<tr ${interactive?`data-market-row="${escape(row.id)}"`:''} class="${row.id===selected&&interactive?'is-selected':''}"><td>${interactive?`<button class="auction-item-name quality-${auctionQuality(row.item)}" data-listing="${escape(row.id)}" data-focus-key="listing-${escape(row.id)}" aria-pressed="${row.id===selected}" data-item-tooltip="${tooltipId(row.item)}">`:`<span class="auction-item-name quality-${auctionQuality(row.item)}" tabindex="0" data-item-tooltip="${tooltipId(row.item)}">`}${art(row.item)}<span><strong>${escape(name)}</strong>${gear?`<small class="auction-requirement">${auctionQuality(row.item)[0].toUpperCase()+auctionQuality(row.item).slice(1)} · Level ${gear.requiredLevel} · ${gear.className||'All classes'}</small>`:''}<small class="auction-mobile-quantity">${row.item.quantity.toLocaleString('en-US')} items · ${mine?'You':escape(row.sellerName)}</small>${row.reservation?`<small class="auction-reserved">${row.reservation.buyerId===options.getPlayer()?.id?row.reservation.delivered||row.reservation.processed?'Payment found':'Payment pending':'Reserved'}</small>`:undercut?'<small class="auction-undercut">Undercut</small>':mine?'<small>Your auction</small>':''}</span>${interactive?'</button>':'</span>'}</td><td>${row.item.quantity.toLocaleString('en-US')}</td><td class="auction-price" title="${escape(formatAuctionUnitPrice(row))}">${escape(formatAuctionUnitPrice(row))}</td><td class="auction-price" title="${price(row)}">${price(row)}</td><td class="auction-seller" title="${escape(row.sellerName)}">${mine?'You':escape(row.sellerName)}</td></tr>${interactive&&row.id===selected?'<tr class="auction-inline-row"><td colspan="5" data-auction-inline-host></td></tr>':''}`;
    }).join('')}</tbody></table>`;
  }
  function filteredListings(){
    const rows=(tab==='mine'?state!.mine:state!.listings).filter(row=>tab==='purchases'?row.reservation?.buyerId===options.getPlayer()?.id:(tab==='mine'||!row.reservation)&&(tab==='mine'||(row.item.kind==='gold')===(tab==='exchange'))&&(tab==='exchange'||(exactItem?itemKey(row.item)===exactItem:`${auctionItemLabel(row.item)} ${translateText(auctionItemLabel(row.item))} ${row.sellerName}`.toLowerCase().includes(search.toLowerCase())))
      &&(row.currency!=='eth'||row.sellerId===options.getPlayer()?.id||row.reservation?.buyerId===options.getPlayer()?.id)
      &&(tab==='exchange'||(category==='all'||auctionCategory(row.item)===category)&&(currencyFilter==='all'||row.currency===currencyFilter))
      &&(tab==='exchange'||category!=='equipment'||row.item.kind==='gear'&&(()=>{const gear=gearById(row.item.id);return !!gear&&(equipmentClass==='all'||!gear.className||gear.className===equipmentClass)&&(equipmentRarity==='all'||auctionQuality(row.item)===equipmentRarity)&&gear.requiredLevel>=Number(minLevel||1)&&gear.requiredLevel<=Number(maxLevel||MAX_LEVEL);})())
      &&(tab!=='mine'||mineFilter==='all'||mineFilter==='undercut'&&auctionIsUndercut(row,state!.listings)||mineFilter==='reserved'&&!!row.reservation||mineFilter==='available'&&!row.reservation));
    return rows.sort((a,b)=>{
      if((sort==='unit'||sort==='total')&&a.currency!==b.currency)return compareAuctionPrice(a,b);
      const delta=sort==='rarity'?GEAR_QUALITIES.indexOf(auctionQuality(a.item))-GEAR_QUALITIES.indexOf(auctionQuality(b.item)):sort==='name'?auctionItemLabel(a.item).localeCompare(auctionItemLabel(b.item)):sort==='quantity'?a.item.quantity-b.item.quantity:compareAuctionPrice(a,b,sort==='unit');
      return (ascending?delta:-delta)||a.createdAt-b.createdAt||a.id.localeCompare(b.id);
    });
  }
  const compactListings=window.matchMedia?.('(max-width: 760px), (max-height: 500px)');
  function placeListingDetail(detail=query('#auction-detail')){
    if(!detail)return;const host=compactListings?.matches?query('[data-auction-inline-host]'):null;
    const home=host||query('#auction-results')?.parentElement;if(home&&detail.parentElement!==home)home.append(detail);
  }
  compactListings?.addEventListener?.('change',()=>{if(!panel.hidden&&tab!=='sell'&&tab!=='sold')placeListingDetail();});
  function renderResults(){
    if(!state||tab==='sell'||tab==='sold')return;const player=options.getPlayer();if(!player)return;
    preserve(()=>{
      const rows=filteredListings(),container=query('#auction-results'),detail=query('#auction-detail');if(!container||!detail)return;
      container.innerHTML=`<div class="auction-mobile-sort"><label>Sort <select data-auction-mobile-sort>${(['name','rarity','quantity','unit','total'] as const).map(value=>`<option value="${value}"${value===sort?' selected':''}>${value==='unit'?'Unit price':value==='total'?'Total price':value==='quantity'?'Quantity':value==='rarity'?'Rarity':'Name'}</option>`).join('')}</select></label><button type="button" data-auction-sort-direction aria-label="Reverse sort order">${ascending?'Ascending':'Descending'}</button></div><div class="auction-results-count">${rows.length} ${rows.length===1?'listing':'listings'}${tab==='mine'?' · Your auctions':tab==='purchases'?' · Pending purchases':' · Live market'}</div>${tab==='mine'&&state!.mine.some(row=>row.currency!=='gold')?'<p class="auction-note" data-auction-payout-note>Linking a verified wallet automatically moves your unsold listings to it. Pending payments and proceeds already earned stay with their original wallet.</p>':''}<div class="auction-table-scroll" data-auction-scroll="results">${rows.length?table(rows):`<p class="auction-empty">${tab==='purchases'?'No pending purchases.':search||category!=='all'||currencyFilter!=='all'||mineFilter!=='all'?'No auctions match these filters.':tab==='mine'?'You have no active auctions. List an item from the Sell tab.':'No auctions are available yet. List the first item from your bag.'}</p>`}</div>`;
      const row=rows.find(row=>row.id===selected);placeListingDetail(detail);detail.innerHTML=row?details(row,player):`<div class="auction-select-hint">${marketArt('shopping')}<h3>${tab==='purchases'?'Pending purchases':'Find your next upgrade'}</h3><p>${tab==='purchases'?'Select a purchase to check its payment status.':'Select an item to inspect its stats, stack size and total price.'}</p></div>`;
      const choose=(id:string)=>{selected=compactListings?.matches&&selected===id?null:id;renderResults();if(selected&&compactListings?.matches)query('#auction-detail').scrollIntoView?.({block:'nearest'});};
      panel.querySelectorAll<HTMLButtonElement>('[data-listing]').forEach(button=>button.onclick=event=>{event.stopPropagation?.();choose(button.dataset.listing!);});
      panel.querySelectorAll<HTMLTableRowElement>('[data-market-row]').forEach(node=>node.onclick=()=>choose(node.dataset.marketRow!));
      panel.querySelectorAll<HTMLButtonElement>('[data-auction-sort]').forEach(button=>button.onclick=()=>{const next=button.dataset.auctionSort as typeof sort;ascending=next===sort?!ascending:next!=='rarity';sort=next;renderResults();});
      const mobileSort=query<HTMLSelectElement>('[data-auction-mobile-sort]');if(mobileSort)mobileSort.onchange=()=>{sort=mobileSort.value as typeof sort;renderResults();};
      const direction=query<HTMLButtonElement>('[data-auction-sort-direction]');if(direction)direction.onclick=()=>{ascending=!ascending;renderResults();};
      if(row)wireListing(row);
    });
  }
  function details(row:AuctionListing,player:Player){
    const gear=row.item.kind==='gear'?gearById(row.item.id):undefined,loot=row.item.kind==='item'?LOOT_ITEMS[row.item.id]:undefined,mine=row.sellerId===player.id,reserved=!!row.reservation&&row.reservation.buyerId!==player.id;
    const ownReservation=row.currency!=='gold'&&row.reservation?.buyerId===player.id,expired=ownReservation&&row.reservation!.expiresAt<=Date.now();
    const balanceNote=mossBalanceNote(row),receive=auctionCanReceive(player,row.item),canBuy=!mine&&!reserved&&!expired&&!purchasePending(row)&&!balanceNote&&receive&&(row.currency!=='eth'||row.reservation?.buyerId===player.id)&&(row.currency==='gold'?player.gold>=Number(row.price):settlement(row.currency)?.enabled&&walletReady());
    const stats=gear?gearBonuses(gear.stats):loot?.description|| (row.item.kind==='gold'?'A whole gold lot funded by another player. Gold is delivered after payment is processed.':'Crafting materials and supplies');
    const note=mine?row.reservation?'Your listing is reserved.':'':reserved?'Reserved by another buyer.':!receive?'Check bag space and item requirements.':row.currency==='gold'&&player.gold<Number(row.price)?'Not enough gold.':purchasePending(row)||expired?'':balanceNote;
    return `<div class="auction-review-item quality-${auctionQuality(row.item)}" data-auction-scroll="review-${escape(row.id)}">${art(row.item)}<div><h3>${escape(auctionItemLabel(row.item))}</h3><p class="auction-detail-seller">${mine?'Your auction':`Sold by ${escape(row.sellerName)}`}</p><p>${row.item.quantity.toLocaleString('en-US')} ${row.item.kind==='gold'?'gold':'items'} · ${escape(formatAuctionUnitPrice(row))} each${gear?` · ${auctionQuality(row.item)} · Level ${gear.requiredLevel}${gear.className?` ${gear.className}`:''}`:''}</p><p title="${escape(stats)}">${escape(stats)}</p>${row.item.kind==='gold'?'':`<button class="auction-save-item" data-auction-save-item ${savedItems.includes(itemKey(row.item))?'disabled':''}>${savedItems.includes(itemKey(row.item))?'Saved to shopping list':'+ Shopping list'}</button>`}${gear?`<div class="item-sheet item-roll-inline">${renderGearRollDetails(gear,player)}</div>`:''}</div></div><div class="auction-review-action"><strong class="auction-buyout">${price(row)}</strong><small>Total for ${row.item.quantity.toLocaleString('en-US')}</small>${row.item.kind==='gold'?`<p class="auction-note">Gross: ${row.item.quantity.toLocaleString('en-US')} gold · Fee: ${row.goldFee} gold (0.5%)<br>Buyer receives: <strong>${(row.item.quantity-row.goldFee!).toLocaleString('en-US')} gold</strong><br>Effective rate: ${escape(formatAuctionUnitPrice({...row,item:{...row.item,quantity:row.item.quantity-row.goldFee!}}))} per received gold</p>`:row.currency==='gold'?`<p class="auction-note">Seller fee: ${row.goldFee||0} gold · Seller receives: ${(Number(row.price)-(row.goldFee||0)).toLocaleString('en-US')} gold</p>`:''}${row.currency==='moss'&&mossTaxPreview(row.price,row.reservation)?`<p class="auction-note">${mossTaxPreview(row.price,row.reservation)}</p>`:''}${mine?`<button class="primary-button" data-auction-cancel data-focus-key="cancel" ${row.reservation||busy||walletBusy?'disabled':''}>Cancel auction</button>`:purchasePending(row)||expired?'':`<button class="primary-button" data-auction-purchase data-focus-key="purchase" ${canBuy&&!busy&&!walletBusy?'':'disabled'}>Buy</button>`}${!mine&&purchaseStatus(row)?`<p class="auction-note" role="status" data-auction-pending>${purchaseStatus(row)}</p>`:''}${note?`<p class="auction-note">${note}</p>`:''}</div>`;
  }
  function wireListing(row:AuctionListing){
    const save=query<HTMLButtonElement>('[data-auction-save-item]');if(save)save.onclick=()=>{if(row.item.kind!=='gold')saveItem(row.item);renderBody();};
    const action=query<HTMLButtonElement>('[data-auction-purchase]');if(action)action.onclick=async()=>{
      if(busy||walletBusy||action.disabled||purchasePending(row)||!nearby())return;const player=options.getPlayer();if(!player||!auctionCanReceive(player,row.item))return;
      if(row.reservation&&row.reservation.expiresAt<=Date.now()){renderResults();say('Purchase pending…');return;}
      if(row.currency==='eth'&&row.reservation?.buyerId!==player.id)return;
      if(row.currency==='moss'){
        if(mossBalanceNote(row))return;const operation=current(),key=mossBalanceKey();
        await refreshMossBalance(true);
        if(!active(operation)||busy||walletBusy||selected!==row.id)return;
        if(key!==mossBalanceKey()||JSON.stringify(state?.listings.find(value=>value.id===row.id))!==JSON.stringify(row)){say('The listing or wallet changed. Review the listing again.');return;}
        const note=mossBalanceNote(row);if(note){say(note);return;}
        const currentAction=query<HTMLButtonElement>('[data-auction-purchase]');if(!currentAction||currentAction.disabled||row.reservation&&row.reservation.expiresAt<=Date.now())return;
        if(!auctionCanReceive(options.getPlayer()!,row.item))return;
      }
      if(row.currency!=='gold'){const market=settlement(row.currency);if(!walletReady()||!state?.wallet||!market?.enabled||!market.chainId||!market.contract)return;purchaseAttempts.set(purchaseKey(row.id),'unpaid');awaitingPayment={...structuredClone(row),buyer:state.wallet,chainId:market.chainId,contract:market.contract,token:market.token};}
      if(row.currency==='gold'&&player.gold<Number(row.price)){say('Not enough gold.');return;}
      pending={kind:'buy',id:row.id,currency:row.currency};send({type:'auctionBuy',npcId:auctioneer().id,listingId:row.id});query<HTMLButtonElement>('[data-auction-purchase]').disabled=true;say(row.currency==='gold'?'Buying the selected listing…':'Reserving the selected listing for your wallet…');
    };
    const cancel=query<HTMLButtonElement>('[data-auction-cancel]');if(cancel)cancel.onclick=()=>{if(busy||walletBusy||cancel.disabled||!nearby())return;pending={kind:'cancel',id:row.id,currency:row.currency};send({type:'auctionCancel',npcId:auctioneer().id,listingId:row.id});cancel.disabled=true;say('Returning your listed items to your bag…');};
  }
  function currentDraftItem(){const item=parseItem(draft.item);return item?{...item,quantity:Number(draft.quantity)}:undefined;}
  function renderSelling(){
    const choices=sellable(),player=options.getPlayer()!;
    if(!choices.some(item=>itemKey(item)===draft.item)){draft.item=choices[0]?itemKey(choices[0]):'';draft.quantity='1';draft.price='';draft.ack=false;draft.saleAck=false;}
    const selectedItem=choices.find(item=>itemKey(item)===draft.item),limit=selectedItem?Math.min(AUCTION_MAX_QUANTITY,inventoryCount(selectedItem)):1;
    if(Number(draft.quantity)>limit||selectedItem?.kind==='gear'&&draft.quantity!==String(limit)){draft.quantity=String(limit);draft.saleAck=false;}
    query('#auction-body').innerHTML=`<div class="auction-selling"><aside class="auction-sidebar auction-bag-list" data-auction-scroll="bag"><h3>Items in your bag</h3>${choices.length?choices.map(item=>`<button data-sell-choice="${escape(itemKey(item))}" data-item-tooltip="${tooltipId(item)}" data-focus-key="bag-${escape(itemKey(item))}" aria-pressed="${itemKey(item)===draft.item}" class="quality-${auctionQuality(item)}">${art(item)}<span><strong>${escape(auctionItemLabel(item))}</strong><small>${inventoryCount(item).toLocaleString('en-US')} available</small></span></button>`).join(''):'<p class="auction-empty">Gather items or unequip spare gear to create an auction.</p>'}</aside><form id="auction-sell"><h3>Create an auction</h3><label class="auction-control">Item from your bag<select name="item" data-focus-key="sell-item" ${choices.length?'':'disabled'}>${choices.map(item=>`<option value="${escape(itemKey(item))}">${escape(auctionItemLabel(item))}</option>`).join('')}</select></label><div class="auction-fields"><label class="auction-control">Quantity<input name="quantity" data-focus-key="sell-quantity" type="number" inputmode="numeric" min="1" max="${limit}" step="1" value="${escape(draft.quantity)}" ${selectedItem?.kind==='gear'||!selectedItem?'disabled':''} required></label><label class="auction-control">Currency<select name="currency" data-focus-key="sell-currency"><option value="gold">Gold</option>${isNativeApp()?'':`<option value="moss" ${!state!.crypto.moss?.enabled||!walletReady()?'disabled':''}>MOSS</option>`}</select></label></div><label class="auction-control">Total price for this stack<input name="price" data-focus-key="sell-price" type="text" inputmode="decimal" maxlength="25" value="${escape(draft.price)}" placeholder="Enter a total price" required></label><div class="auction-price-tools"><span id="auction-unit-preview">Enter a total price</span><button type="button" data-match-lowest data-focus-key="match-lowest">Match lowest</button></div><p id="auction-tax-preview" class="auction-note" aria-live="polite" hidden></p><label class="auction-low-price" id="auction-low-price" hidden><input type="checkbox" data-price-ack data-focus-key="price-ack">I accept this price below half the market.</label><label class="auction-low-price" id="auction-sale-warning" ${saleWarning(selectedItem)?'':'hidden'}><input type="checkbox" data-sale-ack data-focus-key="sale-ack">${escape(saleWarning(selectedItem))}</label><button class="primary-button" type="submit" data-auction-submit data-focus-key="sell-submit" ${!selectedItem||busy?'disabled':''}>Create listing</button><p class="auction-note">Listed items leave your bag until cancelled or sold.</p><p id="auction-sell-wallet-note" class="auction-note"></p></form><section class="auction-competition"><h3>Current competition</h3><p id="auction-competition-summary" class="auction-note"></p><div id="auction-competition" class="auction-table-scroll" data-auction-scroll="competition"></div></section></div>`;
    const itemSelect=query<HTMLSelectElement>('[name="item"]'),currency=query<HTMLSelectElement>('[name="currency"]');itemSelect.value=draft.item;currency.value=draft.currency;
    const choose=(key:string)=>{readDraft();draft.item=key;draft.quantity='1';draft.price='';draft.ack=false;draft.saleAck=false;renderBody(false);};
    itemSelect.onchange=()=>choose(itemSelect.value);
    panel.querySelectorAll<HTMLButtonElement>('[data-sell-choice]').forEach(button=>button.onclick=()=>choose(button.dataset.sellChoice!));
    for(const name of ['quantity','price'])query<HTMLInputElement>(`[name="${name}"]`).oninput=()=>{readDraft();draft.ack=false;updateSellingMarket();};
    currency.onchange=()=>{readDraft();draft.ack=false;updateSellingMarket();};
    const ack=query<HTMLInputElement>('[data-price-ack]');ack.checked=draft.ack;ack.onchange=()=>{draft.ack=ack.checked;updateSellingMarket();};
    const saleAck=query<HTMLInputElement>('[data-sale-ack]');saleAck.checked=draft.saleAck;saleAck.onchange=()=>{draft.saleAck=saleAck.checked;updateSellingMarket();};
    query('[data-match-lowest]').onclick=()=>{readDraft();const item=currentDraftItem(),suggested=item&&state?auctionSuggestedPrice(item,draft.currency,state.listings,player.id):null;if(suggested===null){say('No matching market price is available.');return;}draft.price=suggested;draft.ack=false;draft.saleAck=false;query<HTMLInputElement>('[name="price"]').value=suggested;updateSellingMarket();say('Matched the lowest unit price for this stack. Review the total before listing.');};
    query<HTMLFormElement>('#auction-sell').onsubmit=event=>{
      event.preventDefault();if(busy||walletBusy||!nearby())return;readDraft();const item=currentDraftItem(),player=options.getPlayer();
      if(!item||!player||!auctionCanList(player,item)){say('That item or quantity is no longer available in your bag.');return;}
      if(draft.currency!=='gold'&&(!settlement(draft.currency)?.enabled||!walletReady())){say(!state?.crypto.moss?.enabled?state?.crypto.moss?.reason||'MOSS trading is unavailable on this realm.':'MOSS trading needs a confirmed wallet link. Refresh the market to retry.');return;}
      if(draft.currency==='gold'?auctionGoldPrice(draft.price.trim())===null:!auctionEthPrice(draft.price.trim())){say(draft.currency==='gold'?'Enter a whole gold price from 1 to 1,000,000,000.':'Enter a positive MOSS price with up to 18 decimal places.');return;}
      if(auctionBelowMarket(item,draft.currency,draft.price.trim(),state!.listings,player.id)&&!draft.ack){say('Review the low-price warning before creating this listing.');return;}
      if(saleWarning(item)&&!draft.saleAck){say('Review the item sale warning before creating this listing.');return;}
      pending={kind:'sell',item:{...item},currency:draft.currency,price:draft.price.trim(),known:state!.mine.map(row=>row.id)};
      send({type:'auctionList',npcId:auctioneer().id,item,currency:draft.currency,price:draft.price.trim()});query<HTMLButtonElement>('[data-auction-submit]').disabled=true;say('Creating your listing…');
    };
    updateSellingMarket();
  }
  function updateSellingMarket(){
    if(!state)return;const item=currentDraftItem(),player=options.getPlayer();if(!player)return;
    const valid=!!item&&auctionItemValid(item),rows=valid?auctionMarketListings(item,draft.currency,state.listings,player.id):[];
    if(item)query<HTMLInputElement>('[name="quantity"]').max=String(Math.min(AUCTION_MAX_QUANTITY,inventoryCount(item,player)));
    const match=query<HTMLButtonElement>('[data-match-lowest]');match.disabled=busy||!valid||auctionSuggestedPrice(item!,draft.currency,state.listings,player.id)===null;
    const mossOption=query<HTMLSelectElement>('[name="currency"]').querySelector<HTMLOptionElement>('[value="moss"]');if(mossOption)mossOption.disabled=!state.crypto.moss?.enabled||!walletReady();
    const priceInput=query<HTMLInputElement>('[name="price"]');priceInput.inputMode=draft.currency==='gold'?'numeric':'decimal';priceInput.placeholder=draft.currency==='gold'?'e.g. 250 gold':'e.g. 12.5 MOSS';
    query('#auction-sell-wallet-note').textContent=isNativeApp()?'Mobile auctions use earned gold.':!state.crypto.moss?.enabled?state.crypto.moss?.reason||'MOSS trading is unavailable on this realm.':!walletReady()?'MOSS trading needs a confirmed wallet link. Refresh the market to retry.':draft.currency==='gold'?(state.economyVersion??0)>=1?'Gold sales burn a 5% seller fee. You can also choose MOSS.':'Choose gold or MOSS for your listing.':`${state.crypto.moss.taxBps===500&&state.crypto.moss.devTeam?`The buyer pays your listed total. ${state.crypto.moss.feeVersion===2?'The 5% tax includes 1.25% of the price each for treasury and dev team, and 2.5% for burning and eligible referrals.':`The 5% tax is split: 80% ${state.crypto.moss.referralsEnabled?'for burning and eligible referrals':'burned'}, 10% treasury, 10% dev team.`} `:''}Collect MOSS sale proceeds in your Mossvale Wallet.`;
    const preview=query('#auction-unit-preview');preview.textContent=valid&&draft.price?`${formatAuctionUnitPrice({item,price:draft.price,currency:draft.currency})} each${draft.currency==='gold'&&auctionGoldPrice(draft.price)!==null?` · Fee: ${(state.economyVersion??0)>=1?auctionItemFee(Number(draft.price)):0} gold · You receive: ${Number(draft.price)-((state.economyVersion??0)>=1?auctionItemFee(Number(draft.price)):0)} gold`:''}`:'Enter a total price';
    const taxPreview=query('#auction-tax-preview');taxPreview.textContent=draft.currency==='moss'?mossTaxPreview(draft.price):'';taxPreview.hidden=!taxPreview.textContent;
    query('#auction-competition-summary').textContent=rows.length?`${rows.length} competing ${rows.length===1?'listing':'listings'} · ${draft.currency==='gold'?'Gold':'MOSS'} only`:'No competing listings in this currency. Set your own price.';
    query('#auction-competition').innerHTML=rows.length?table(rows,false):'<p class="auction-empty">No market price yet.</p>';
    const low=valid&&auctionBelowMarket(item,draft.currency,draft.price,state.listings,player.id);query('#auction-low-price').hidden=!low;query<HTMLInputElement>('[data-price-ack]').checked=draft.ack;
    query<HTMLInputElement>('[data-sale-ack]').checked=draft.saleAck;
    query<HTMLButtonElement>('[data-auction-submit]').disabled=busy||walletBusy||!valid||!auctionCanList(player,item!)||!!low&&!draft.ack||!!saleWarning(item)&&!draft.saleAck||draft.currency==='moss'&&(!state.crypto.moss?.enabled||!walletReady());
  }
  const exchangeEnabled=()=>state?.goldExchangeEnabled===true&&!!state.crypto.moss?.enabled&&walletReady()&&!isNativeApp();
  function updateExchange(){
    readDraft();const player=options.getPlayer()!,quantity=Number(exchangeDraft.quantity),fee=auctionGoldFee(quantity),item={kind:'gold' as const,id:'gold' as const,quantity};
    query<HTMLInputElement>('[name="goldQuantity"]').max=String(Math.min(player.gold,AUCTION_MAX_GOLD));
    query('#exchange-preview').textContent=auctionAssetValid(item)?`Gross: ${quantity.toLocaleString('en-US')} gold · Fee: ${fee} gold · Buyer receives: ${(quantity-fee).toLocaleString('en-US')} gold${auctionEthPrice(exchangeDraft.price)?` · Effective rate: ${formatAuctionUnitPrice({item:{...item,quantity:quantity-fee},currency:'moss',price:exchangeDraft.price})} per received gold`:''}${mossTaxPreview(exchangeDraft.price)?` · ${mossTaxPreview(exchangeDraft.price)}`:''}`:'Enter 200 to 1,000,000,000 whole gold.';
    query<HTMLButtonElement>('[data-exchange-submit]').disabled=!exchangeEnabled()||busy||walletBusy||!auctionCanList(player,item)||!auctionEthPrice(exchangeDraft.price);
  }
  function renderExchange(){
    const player=options.getPlayer()!;
    query('#auction-body').innerHTML=`<div class="auction-shopping auction-exchange"><form id="auction-exchange" class="auction-sidebar"><h3>Sell gold for MOSS</h3><p class="auction-note">Set a price for your whole lot. Another player must choose to buy it.</p><label class="auction-control">Gold to reserve<input name="goldQuantity" data-focus-key="exchange-quantity" type="number" inputmode="numeric" min="200" max="${Math.min(player.gold,AUCTION_MAX_GOLD)}" step="1" value="${escape(exchangeDraft.quantity)}" required></label><label class="auction-control">Total MOSS price<input name="mossPrice" data-focus-key="exchange-price" type="text" inputmode="decimal" maxlength="25" value="${escape(exchangeDraft.price)}" required></label><p id="exchange-preview" class="auction-note" aria-live="polite"></p><button type="submit" class="primary-button" data-exchange-submit ${exchangeEnabled()?'':'disabled'}>Reserve gold and list</button><p class="auction-note">${!state!.goldExchangeEnabled?'New gold listings are temporarily unavailable.':!walletReady()?'MOSS trading needs a confirmed wallet link. Refresh the market to retry.':!state!.crypto.moss?.enabled?'MOSS trading is unavailable.':'Cancellation returns all reserved gold. The 0.5% gold fee is burned only on a completed sale.'}</p><p class="auction-note">Gold arrives after payment is processed. Withdraw completed MOSS proceeds using the button above.</p></form><section class="auction-market-pane"><div id="auction-results"></div><aside id="auction-detail" data-auction-scroll="detail"></aside></section></div>`;
    for(const name of ['goldQuantity','mossPrice'])query<HTMLInputElement>(`[name="${name}"]`).oninput=updateExchange;
    query<HTMLFormElement>('#auction-exchange').onsubmit=event=>{event.preventDefault();if(busy||walletBusy||!exchangeEnabled()||!nearby())return;readDraft();
      const item={kind:'gold' as const,id:'gold' as const,quantity:Number(exchangeDraft.quantity)},price=exchangeDraft.price.trim();
      if(!auctionCanList(options.getPlayer()!,item)||!auctionEthPrice(price)){say('Enter an available whole gold lot and positive MOSS price.');return;}
      pending={kind:'sell',item,currency:'moss',price,known:state!.mine.map(row=>row.id)};send({type:'auctionList',npcId:auctioneer().id,item,currency:'moss',price});updateExchange();say('Reserving gold and creating your listing…');
    };
    updateExchange();renderResults();
  }
  function paintUpdate(){
    if(panel.hidden||deferTouchRender(panel,paintUpdate))return;
    if(!editing())paint(false);
    else{if(tab==='sell')updateSellingMarket();else{if(tab==='exchange')updateExchange();renderResults();}say(statusMessage);}
  }
  function renderBody(capture=true){
    if(!state||!options.getPlayer())return;if(capture)readDraft();
    preserve(()=>{if(tab==='sell'){renderSelling();return;}if(tab==='sold'){renderSold();return;}if(tab==='exchange'){renderExchange();return;}if(tab==='purchases'){query('#auction-body').innerHTML='<section class="auction-market-pane auction-purchases"><div id="auction-results"></div><aside id="auction-detail" aria-label="Pending purchase" data-auction-scroll="detail"></aside></section>';renderResults();return;}query('#auction-body').innerHTML=`<div class="auction-shopping">${shoppingSidebar()}<section class="auction-market-pane">${shoppingTools()}<div id="auction-results"></div><aside id="auction-detail" aria-label="Selected auction" data-auction-scroll="detail"></aside></section></div>`;wireShopping();renderResults();});
  }
  function renderSold(){
    const sales=[...(state?.sold??[])].sort((a,b)=>b.soldAt-a.soldAt);
    query('#auction-body').innerHTML=`<section class="auction-sales"><div class="auction-sales-summary"><p class="auction-results-count">${sales.length} completed ${sales.length===1?'sale':'sales'} · Newest first</p><p class="auction-note">Your latest 100 completed sales. MOSS and ETH sales appear after payment finalizes. History starts with this update; earlier sales are unavailable.</p></div>${sales.length?`<div class="auction-table-scroll" data-auction-scroll="sales" tabindex="0" aria-label="Completed sales"><table class="auction-table auction-sales-table" aria-label="Completed auction sales"><thead><tr>${['Item','Qty','Total','Currency','Gold fee / net','Buyer','Date'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${sales.map(sale=>{
      const date=new Date(sale.soldAt),amount=sale.currency==='gold'?Number(sale.price).toLocaleString('en-US'):escape(sale.price),currency=sale.currency==='gold'?'gold':sale.currency==='moss'?'MOSS':'ETH';
      return `<tr data-auction-sale="${escape(sale.id)}"><td><span class="auction-item-name quality-${auctionQuality(sale.item)}" data-item-tooltip="${tooltipId(sale.item)}" tabindex="0">${art(sale.item)}<span><strong>${escape(auctionItemLabel(sale.item))}</strong></span></span></td><td>${sale.item.quantity}</td><td class="auction-price">${amount}</td><td class="auction-sale-currency">${currency}</td><td>${sale.item.kind==='gold'?`${sale.goldFee} / ${sale.item.quantity-sale.goldFee!} gold`:sale.currency==='gold'?`${sale.goldFee||0} / ${Number(sale.price)-(sale.goldFee||0)} gold`:'—'}</td><td class="auction-seller" title="${escape(sale.buyerName)}">${escape(sale.buyerName)}</td><td class="auction-sale-date"><time datetime="${date.toISOString()}" title="${escape(date.toLocaleString())}">${escape(date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}))}<small>${escape(date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</small></time></td></tr>`;
    }).join('')}</tbody></table></div>`:'<p class="auction-empty">No completed sales recorded yet. Items you sell will appear here.</p>'}</section>`;
  }
  function paint(capture=true){
    if(!state)return;if(capture)readDraft();
    preserve(()=>{
      const cryptoNote=!state!.crypto.moss?.enabled?state!.crypto.moss?.reason||'MOSS trading is unavailable on this realm.':walletPreparing?'Preparing your game-account wallet…':walletReady()?'Mossvale Wallet':walletLinkPending?'Approve the wallet link in Mossvale Wallet.':state!.wallet?'Verifying this wallet moves your unsold listings. Pending payments, existing funds and NFTs stay with their original wallet.':'One approval links your game-account wallet for trading.';
      panel.innerHTML=`<header class="auction-heading">${marketArt('crest')}<div><h2 id="auction-title" tabindex="-1">${escape(auctioneer().cityName)} Auction House</h2><p>${escape(auctioneer().name)} · All realms</p></div><span id="auction-balance"></span>${options.onBags?'<button data-auction-bags data-focus-key="bags">Bags · B</button>':''}<button data-auction-close data-focus-key="close" aria-label="Close auction house">${icon('close')}</button></header><nav class="auction-tabs" aria-label="Auction sections">${(['browse','sell',...(!isNativeApp()&&((state!.economyVersion??0)>=1||state!.listings.some(row=>row.item.kind==='gold'))?['exchange']:[]),...(!isNativeApp()?['purchases']:[]),'mine','sold'] as const).map(mode=>`<button data-auction-tab="${mode}" data-focus-key="tab-${mode}" aria-pressed="${mode===tab}">${marketArt(mode==='browse'?'shopping':mode==='sell'?'selling':'auctions')}${mode==='browse'?'Browse':mode==='sell'?'Sell':mode==='exchange'?'Gold Exchange':mode==='purchases'?`Purchases (${state!.listings.filter(row=>row.reservation?.buyerId===options.getPlayer()?.id).length})`:mode==='mine'?`My auctions (${state!.mine.length})`:`Sold (${state!.sold?.length??0})`}</button>`).join('')}<button data-auction-refresh data-focus-key="refresh">Refresh market</button></nav>${isNativeApp()?'':`<div class="auction-wallet"><span id="auction-wallet-note" aria-busy="${mossBalance?.key===mossBalanceKey()&&mossBalance.loading?'true':'false'}" title="${escape(cryptoNote)}">${escape(cryptoNote)}</span>${walletReady()&&state!.crypto.moss?.enabled?`<button data-auction-withdraw-moss data-focus-key="withdraw-moss" ${busy||walletBusy?'disabled':''}>Collect MOSS</button>`:''}${walletReady()?previousMossContracts().map(address=>`<button data-auction-withdraw-previous-moss="${escape(address)}" data-focus-key="withdraw-previous-moss-${escape(address)}" ${busy||walletBusy?'disabled':''}>Collect previous MOSS${previousMossContracts().length>1?` · ${escape(shortWallet(address))}`:''}</button>`).join(''):''}</div>`}<div id="auction-body" data-auction-scroll="body"></div><p id="auction-status" role="status" aria-live="polite"></p>`;
      query('[data-auction-close]').onclick=close;const bags=query('[data-auction-bags]');if(bags)bags.onclick=()=>options.onBags?.();
      const withdrawMoss=query('[data-auction-withdraw-moss]');if(withdrawMoss)withdrawMoss.onclick=()=>void withdraw('moss');
      for(const button of panel.querySelectorAll<HTMLElement>('[data-auction-withdraw-previous-moss]'))button.onclick=()=>void withdraw('moss',button.dataset.auctionWithdrawPreviousMoss);
      query('[data-auction-refresh]').onclick=()=>{void refreshMossBalance(true);options.send({type:'auctionOpen',npcId:auctioneer().id});say('Refreshing listings…');};
      panel.querySelectorAll<HTMLButtonElement>('[data-auction-tab]').forEach(button=>button.onclick=()=>{readDraft();tab=button.dataset.auctionTab as typeof tab;selected=null;paint();query('#auction-body').scrollTop=0;panel.scrollTop=0;});
      renderBody(false);const player=options.getPlayer();if(player)query('#auction-balance').textContent=`${player.gold.toLocaleString('en-US')} gold`;say(statusMessage);
    });
  }
  function refresh(){
    if(panel.hidden)return;const player=options.getPlayer();if(!player||!nearby()){close();return;}
    checkPayments();void refreshMossBalance();
    const balance=`${player.gold.toLocaleString('en-US')} gold`,node=query('#auction-balance');if(node&&node.textContent!==balance)node.textContent=balance;
    const next=JSON.stringify([player.id,player.gold,player.level,player.inventory,player.carriedItems,player.ownedGear,player.equipment,selected&&state?.listings.some(row=>row.id===selected&&!!row.reservation&&row.reservation.expiresAt<=Date.now())]);if(next===bagKey||busy||walletBusy)return;if(deferTouchRender(panel,paintUpdate))return;if(editing()){if(tab==='sell')updateSellingMarket();else if(tab==='exchange')updateExchange();return;}bagKey=next;renderBody();
  }
  panel.addEventListener('pointerdown',()=>options.onOpen());
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab')event.stopPropagation();});
  panel.addEventListener('contextmenu',event=>event.preventDefault());
  return {close,refresh,reject:(message:string,requestType?:string)=>{if(requestType?.startsWith('auction')&&requestType!=='auctionPaymentCheck'&&requestType!=='auctionOpen'&&(busy||awaitingPayment))reject(message);},walletChallenge,payment,isOpen:()=>!panel.hidden,
    update(next:AuctionState){
      if(isNativeApp()){next={...next,listings:next.listings.filter(row=>row.currency==='gold'),mine:next.mine.filter(row=>row.currency==='gold')};currencyFilter='all';}
      if(!options.nearby(next.npcId)||next.npcId&&!AUCTIONEERS.some(npc=>npc.id===next.npcId))return;const opening=panel.hidden;readDraft();
      for(const [key] of purchaseAttempts){
        const row=next.listings.find(row=>purchaseKey(row.id)===key),previous=state?.listings.find(row=>purchaseKey(row.id)===key);
        if(!row||previous?.reservation&&!row.reservation)purchaseAttempts.delete(key);
      }
      state=next;if(opening&&!next.open)return;
      if(awaitingPayment){const reservation=next.listings.find(row=>row.id===awaitingPayment!.id)?.reservation;if(reservation?.processed||reservation?.delivered){awaitingPayment=null;pending=undefined;}}
      let confirmed='';
      if(pending?.kind==='sell'){const operation=pending;if(next.mine.some(row=>!operation.known.includes(row.id)&&itemKey(row.item)===itemKey(operation.item)&&row.item.quantity===operation.item.quantity&&row.currency===operation.currency&&row.price===operation.price)){if(operation.item.kind==='gold')exchangeDraft={quantity:'200',price:''};else{draft.price='';draft.quantity='1';draft.ack=false;draft.saleAck=false;}confirmed=next.reason||'Your listing is now on the market.';pending=undefined;}}
      else if(pending){const operation=pending;if(!next.listings.some(row=>row.id===operation.id)){
        selected=null;
        // A competing buyer can remove this row before our rejection arrives. Only the server reports success.
        if(next.reason&&/^(Bought |Listing cancelled\.|Payment (?:finalized|processed)\.|Payment confirmed\. .+ was delivered\.)/.test(next.reason)){confirmed=next.reason;pending=undefined;}
        else confirmed='This listing is no longer available. Waiting for the market response…';
      }}
      if(selected&&![...next.listings,...next.mine].some(row=>row.id===selected))selected=null;
      busy=!!awaitingPayment||walletLinkPending||walletBusy||!!pending&&(pending.kind!=='buy'||pending.currency==='gold');panel.hidden=false;
      if(opening){options.onOpen();loadPreferences();tab='browse';selected=null;search='';category='all';currencyFilter='all';mineFilter='all';equipmentClass='all';equipmentRarity='all';minLevel='';maxLevel='';exactItem='';}
      statusMessage=confirmed||next.reason||statusMessage;
      // Keep native typing, number spinners and select popups intact during passive updates.
      if(opening||confirmed)paint(false);else paintUpdate();
      if(opening){query('#auction-title').focus();checkPayments(true);}
      if(opening||next.open&&!walletReady())void prepareWallet();
      void refreshMossBalance();
    },
  };
}
