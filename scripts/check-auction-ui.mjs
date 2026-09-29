import { AUCTIONEERS } from '../src/city-services.ts';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { Wallet, Interface, TypedDataEncoder, id, getBytes, toQuantity, Transaction, parseEther, MaxUint256 } from 'ethers';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);},load(url,context,next){return url.endsWith('/src/wallet-provider.ts')?{format:'module',shortCircuit:true,source:'export const chooseWallet = () => { throw Error("Auction must open Mossvale Wallet directly."); }; export const openMossvaleWallet = signal => globalThis.__openMossvaleWallet(signal);'}:next(url,context);}});
const {mountAuctionUI,validateAuctionPayment}=await import('../src/auction-ui.ts');
const {starterGear,rollGear,MAX_LEVEL,GEAR_QUALITIES}=await import('../src/progression.ts');
const {CHARACTER_CLASSES}=await import('../src/shared.ts');
const {MOSS_TOKEN}=await import('../src/auction.ts');
hook.deregister();
// Native DOM/provider boundaries are simulated; the shipped controller, validation and ethers code run unchanged.
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39);/g, value => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[value]);
const voidTags = new Set(['input','img','br','hr']);
class Element {
  constructor(tag = 'div') { this.tagName=tag.toUpperCase(); this.children=[]; this.parentElement=null; this.events=new Map(); this.attributes={}; this.dataset={}; this.hidden=false; this.disabled=false; this.checked=false; this.value=''; }
  setAttribute(name,value) { this.attributes[name]=String(value); if(name==='id')this.id=value; if(name==='name')this.name=value; if(name==='value')this.value=decode(value); if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=decode(value); if(['disabled','hidden','checked'].includes(name))this[name]=true; }
  append(node) { node.remove(); node.parentElement=this; this.children.push(node); }
  get childNodes() { return this.children; }
  replaceChildren(...nodes) { for(const child of this.children)child.parentElement=null; this.children=[]; this.html=''; this.text=undefined; for(const node of nodes)this.append(node); }
  replaceWith(node) { const parent=this.parentElement; if(!parent)return; node.remove(); const index=parent.children.indexOf(this); parent.children[index]=node; node.parentElement=parent; this.parentElement=null; }
  remove() { if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this); this.parentElement=null; }
  get isConnected() { return this===document.body || !!this.parentElement?.isConnected; }
  contains(node) { return node===this || this.children.some(child=>child.contains(node)); }
  focus() { document.activeElement=this; }
  set textContent(value) { this.text=String(value); this.children=[]; }
  get textContent() { return this.text ?? this.children.map(child=>child.textContent).join(''); }
  set innerHTML(html) {
    this.html=html; this.text=undefined; this.children=[]; const stack=[this];
    for(const match of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)) {
      const [,closing,tag,attrs]=match;
      if(closing) { if(stack.length>1)stack.pop(); continue; }
      const node=new Element(tag);
      for(const attr of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(attr[1],decode(attr[2]??''));
      stack.at(-1).append(node); if(!voidTags.has(tag))stack.push(node);
    }
  }
  get innerHTML() { return this.html||''; }
  matches(selector) { if(selector.startsWith('.'))return (this.attributes.class||'').split(' ').includes(selector.slice(1)); if(selector.startsWith('#'))return this.id===selector.slice(1); const attr=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/); if(attr)return Object.hasOwn(this.attributes,attr[1])&&(attr[2]===undefined||this.attributes[attr[1]]===attr[2]); return this.tagName===selector.toUpperCase(); }
  querySelectorAll(selector) { if(selector.includes(' ')){const [parent,...rest]=selector.split(' ');return this.querySelectorAll(parent).flatMap(node=>node.querySelectorAll(rest.join(' ')));} return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
  closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector)||null; }
  addEventListener(type,callback) { if(!this.events.has(type))this.events.set(type,new Set()); this.events.get(type).add(callback); }
  removeEventListener(type,callback) { this.events.get(type)?.delete(callback); }
  fire(type,extra={}) { const event={type,target:this,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra}; let node=this; while(node){for(const callback of node.events.get(type)||[])callback(event);if(event.stopped)break;node=node.parentElement;}return event; }
}
globalThis.document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:null};
const buyer=Wallet.createRandom(),seller=Wallet.createRandom(),authority=Wallet.createRandom(),contract=Wallet.createRandom().address;
const abi=new Interface(['function buy((bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline) order,bytes signature) payable','function proceeds(address) view returns(uint256)','function withdraw(address recipient)']);
const types={Order:[{name:'listingId',type:'bytes32'},{name:'buyer',type:'address'},{name:'seller',type:'address'},{name:'priceWei',type:'uint256'},{name:'deadline',type:'uint64'}]};
const row={id:'10000000-0000-4000-8000-000000000001',sellerId:'seller',sellerName:'<seller>',item:{kind:'resource',id:'wood',quantity:5},currency:'eth',price:'0.01',createdAt:Date.now()};
const terms={...row,buyer:buyer.address,chainId:4663,contract};
const order={listingId:id(row.id),buyer:buyer.address,seller:seller.address,priceWei:'10000000000000000',deadline:Math.floor(Date.now()/1000)+300,chainId:4663,contract};
const domain={name:'MossvaleAuction',version:'1',chainId:4663,verifyingContract:contract};
order.signature=await authority.signTypedData(domain,types,order);order.orderHash=TypedDataEncoder.hash(domain,types,order);
order.transaction={to:contract,data:abi.encodeFunctionData('buy',[order,order.signature]),value:toQuantity(BigInt(order.priceWei)),chainId:'0x1237'};
const payment={type:'auctionPayment',listingId:row.id,order};
const clean=await validateAuctionPayment(payment,terms);assert.equal(clean.to,contract);assert.equal(clean.value,BigInt(order.priceWei));
for(const change of [{listingId:id('wrong')},{priceWei:'1'},{buyer:seller.address},{seller:buyer.address},{chainId:1},{contract:seller.address},{deadline:1},{orderHash:id('wrong')},
  {transaction:{...order.transaction,to:seller.address}},{transaction:{...order.transaction,value:'0x1'}},{transaction:{...order.transaction,data:'0x1234'}},{transaction:{...order.transaction,chainId:'0x1'}}])await assert.rejects(validateAuctionPayment({...payment,order:{...order,...change}},terms));
assert.deepEqual(Object.keys(await validateAuctionPayment({...payment,order:{...order,transaction:{...order.transaction,gasPrice:'0xffff',from:seller.address}}},terms)).sort(),['chainId','data','to','value'],'only reviewed transaction fields reach wallet');
const mossContract=Wallet.createRandom().address,tokenABI=new Interface(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)']);
const mossStatus={enabled:true,chainId:4663,contract:mossContract,token:MOSS_TOKEN.address,symbol:'MOSS',decimals:18,testnet:false};
const mossRow={...row,id:'20000000-0000-4000-8000-000000000002',currency:'moss',price:'12.5',sellerWallet:seller.address};
const mossTerms={...mossRow,buyer:buyer.address,chainId:4663,contract:mossContract,token:MOSS_TOKEN.address};
const mossOrder={...order,listingId:id(mossRow.id),currency:'moss',token:MOSS_TOKEN.address,priceWei:parseEther(mossRow.price).toString(),contract:mossContract};
const mossDomain={...domain,name:'MossvaleTokenAuction',verifyingContract:mossContract};
mossOrder.signature=await authority.signTypedData(mossDomain,types,mossOrder);mossOrder.orderHash=TypedDataEncoder.hash(mossDomain,types,mossOrder);
mossOrder.transaction={to:mossContract,data:abi.encodeFunctionData('buy',[mossOrder,mossOrder.signature]),value:'0x0',chainId:'0x1237'};
mossOrder.approval={to:MOSS_TOKEN.address,data:tokenABI.encodeFunctionData('approve',[mossContract,mossOrder.priceWei]),value:'0x0',chainId:'0x1237'};
const mossPayment={type:'auctionPayment',listingId:mossRow.id,order:mossOrder};
const mossClean=await validateAuctionPayment(mossPayment,mossTerms);assert.equal(mossClean.value,0n);assert.equal(mossClean.to,mossContract);
assert.equal(mossClean.approval.to,MOSS_TOKEN.address);assert.equal(mossClean.approval.value,0n);assert.equal(tokenABI.decodeFunctionData('approve',mossClean.approval.data)[1],parseEther(mossRow.price));
for(const change of [{currency:'eth'},{currency:undefined},{token:seller.address},{token:undefined},{seller:authority.address},{priceWei:'1'},{chainId:46630},
  {orderHash:TypedDataEncoder.hash({...mossDomain,name:'MossvaleAuction'},types,mossOrder)},
  {transaction:{...mossOrder.transaction,value:toQuantity(parseEther(mossRow.price))}},
  {transaction:{...mossOrder.transaction,to:contract}},{transaction:{...mossOrder.transaction,data:'0x1234'}},
  {approval:undefined},{approval:{...mossOrder.approval,to:seller.address}},{approval:{...mossOrder.approval,value:'0x1'}},
  {approval:{...mossOrder.approval,chainId:'0x1'}},{approval:{...mossOrder.approval,data:tokenABI.encodeFunctionData('approve',[seller.address,mossOrder.priceWei])}},
  {approval:{...mossOrder.approval,data:tokenABI.encodeFunctionData('approve',[mossContract,MaxUint256])}}])await assert.rejects(validateAuctionPayment({...mossPayment,order:{...mossOrder,...change}},mossTerms));
// Both generations remain payable; new orders bind the exact referral recipient and rate into the hash and calldata.
const referralABI=new Interface(['function buy((bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline,address referrer,uint16 referralBps) order,bytes signature)']);
const referralTypes={Order:[...types.Order,{name:'referrer',type:'address'},{name:'referralBps',type:'uint16'}]},referralOrders=new Map();
for(const referralBps of [0,10,25,50,75,100,500,1000]){
  const referred={...mossOrder,referrer:referralBps?authority.address:'0x'+'0'.repeat(40),referralBps};
  referred.signature=await authority.signTypedData(mossDomain,referralTypes,referred);referred.orderHash=TypedDataEncoder.hash(mossDomain,referralTypes,referred);
  referred.transaction={...mossOrder.transaction,data:referralABI.encodeFunctionData('buy',[referred,referred.signature])};referralOrders.set(referralBps,referred);
  const clean=await validateAuctionPayment({...mossPayment,order:referred},mossTerms);
  assert.equal(clean.data,referred.transaction.data);assert.equal(clean.value,0n);assert.equal(clean.approval.data,mossOrder.approval.data,'referral rewards never change the exact price approval');
  for(const change of [{referrer:undefined},{referralBps:undefined},{referralBps:501},{referrer:buyer.address},{referrer:seller.address},{referrer:mossContract},
    {referrer:referralBps?'0x'+'0'.repeat(40):authority.address},{referralBps:referralBps===500?1000:500},
    {orderHash:mossOrder.orderHash},{transaction:mossOrder.transaction},{transaction:{...referred.transaction,data:referred.transaction.data+'00'}}]){
    await assert.rejects(validateAuctionPayment({...mossPayment,order:{...referred,...change}},mossTerms));
  }
}
await assert.rejects(validateAuctionPayment({...payment,order:{...order,referrer:authority.address,referralBps:500}},terms),'ETH orders cannot carry MOSS referral rewards');
await assert.rejects(validateAuctionPayment(mossPayment,{...mossTerms,token:seller.address}));
await assert.rejects(validateAuctionPayment({...payment,order:{...order,approval:mossOrder.approval}},terms));
assert.deepEqual(Object.keys((await validateAuctionPayment({...mossPayment,order:{...mossOrder,approval:{...mossOrder.approval,gasPrice:'0xffff',from:seller.address}}},mossTerms)).approval).sort(),['chainId','data','to','value']);
const calls=[],sent=[];let selectedWallet=buyer.address,accountsAuthorized=true,chainId='0x1237',missingChain=true,heldAccounts=null,heldCall=null,tx,tokenBalance=parseEther('100'),tokenAllowance=0n,approvalReceiptStatus=1,onApprovalReceipt=null,heldReceipt=null,heldSend=null;
const rpc=async(request)=>{
  const {method,params=[]}=request;
  calls.push(structuredClone({...request,params}));
  if(method==='eth_chainId')return chainId;
  if(method==='eth_accounts'||method==='eth_requestAccounts'){if(heldAccounts){const hold=heldAccounts;heldAccounts=null;await hold();}if(method==='eth_requestAccounts')accountsAuthorized=true;return accountsAuthorized?[selectedWallet]:[];}
  if(method==='wallet_switchEthereumChain'){if(missingChain){missingChain=false;throw Object.assign(Error('Unknown chain'),{code:4902});}chainId=params[0].chainId;return null;}
  if(method==='wallet_addEthereumChain')return null;
  if(method==='personal_sign')return buyer.signMessage(getBytes(params[0]));
  if(method==='eth_call'){if(heldCall){const hold=heldCall;heldCall=null;await hold();}const data=params[0].data;if(data.startsWith(tokenABI.getFunction('balanceOf').selector))return tokenABI.encodeFunctionResult('balanceOf',[tokenBalance]);if(data.startsWith(tokenABI.getFunction('allowance').selector))return tokenABI.encodeFunctionResult('allowance',[tokenAllowance]);return abi.encodeFunctionResult('proceeds',[1000n]);}
  if(method==='eth_estimateGas')return '0x30d40';
  if(method==='eth_blockNumber')return '0x64';
  if(method==='eth_sendTransaction'){
    if(heldSend){const hold=heldSend;heldSend=null;await hold();}
    const request=params[0],signed=Transaction.from(await buyer.signTransaction({to:request.to,data:request.data,value:BigInt(request.value||'0x0'),chainId:4663,type:0,gasLimit:200000,gasPrice:1,nonce:0}));
    tx={hash:signed.hash,from:buyer.address,to:request.to,value:request.value||'0x0',input:request.data,gas:'0x30d40',gasPrice:'0x1',nonce:'0x0',type:'0x0',chainId:'0x1237',blockHash:null,blockNumber:null,transactionIndex:null,v:toQuantity(signed.signature.networkV),r:signed.signature.r,s:signed.signature.s};return tx.hash;
  }
  if(method==='eth_getTransactionByHash')return tx;
  if(method==='eth_getTransactionReceipt'){
    const approval=tx.to.toLowerCase()===MOSS_TOKEN.address.toLowerCase();
    if(heldReceipt){const hold=heldReceipt;heldReceipt=null;await hold();}
    if(approval&&approvalReceiptStatus===1)tokenAllowance=tokenABI.decodeFunctionData('approve',tx.input)[1];
    if(approval&&onApprovalReceipt){const after=onApprovalReceipt;onApprovalReceipt=null;after();}
    return{transactionHash:tx.hash,transactionIndex:'0x0',blockHash:id('block'),blockNumber:'0x64',from:tx.from,to:tx.to,cumulativeGasUsed:'0x100',gasUsed:'0x100',effectiveGasPrice:'0x1',logs:[],logsBloom:'0x'+'0'.repeat(512),status:approval?toQuantity(approvalReceiptStatus):'0x1',type:'0x0'};
  }
  throw Error(`Unexpected wallet RPC ${method}`);
};
const preferences=new Map();
let walletOpens=0,walletHold,walletFailure;const walletSignals=[];
let chosenProvider={mossvaleWallet:true,request:rpc};
globalThis.__openMossvaleWallet=async signal=>{walletOpens++;walletSignals.push(signal);if(walletHold)await walletHold;if(walletFailure)throw walletFailure;return chosenProvider;};
globalThis.window={addEventListener(){},clearTimeout,setTimeout,ethereum:{request:()=>assert.fail('the browser default wallet must not be used')},localStorage:{getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,value)}};
let player={id:'buyer',name:'Buyer',level:75,gold:1000,appearance:{className:'Ranger'},inventory:{wood:10,crystal:5,herb:2,potion:3,relic:1},...starterGear('Ranger')},nearby=true;
player.ownedGear.push('warden-longbow');
let bagsOpened=0;
const ui=mountAuctionUI({send:message=>sent.push(structuredClone(message)),getPlayer:()=>player,onOpen:()=>{},nearby:()=>nearby,onBags:()=>{bagsOpened++;}});
const panel=document.body.querySelector('#auction-window'),find=selector=>panel.querySelector(selector),click=selector=>{const node=find(selector);assert(node,selector);if(!node.disabled)return node.onclick?.({preventDefault(){}});};
const infoDispatch=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8').split('\n').find(line=>line.includes("if(msg.kind==='info'){auctionUI.reject"));assert(infoDispatch);
const info=(text,requestType)=>runInNewContext(infoDispatch,{msg:{kind:'info',text,requestType},auctionUI:ui,bankUI:{reject(){}}});
const state=(extra={})=>({open:true,listings:[{...structuredClone(row),reservation:{buyerId:'buyer',expiresAt:order.deadline*1000}}],mine:[],crypto:{enabled:true,chainId:4663,contract,symbol:'ETH',testnet:false},wallet:buyer.address,...extra});
const select=async()=>{ui.update(state({listings:[]}));ui.update(state({listings:[structuredClone(mossRow)],crypto:{...state().crypto,moss:mossStatus}}));await readyWallet();click('[data-auction-tab="browse"]');click(`[data-listing="${mossRow.id}"]`);await click('[data-auction-purchase]');};
async function until(predicate,label){const end=Date.now()+4000;while(Date.now()<end){if(predicate())return;await delay(10);}throw Error(`Timed out: ${label}: ${find('#auction-status')?.textContent}; ${calls.map(call=>call.method).join(',')}; ${sent.at(-1)?.type}`);}
async function readyWallet(){await until(()=>find('[data-auction-withdraw-moss]')||find('[data-auction-withdraw-previous-moss]'),'prepared embedded wallet matches linked address');await until(()=>find('#auction-wallet-note')?.attributes['aria-busy']!=='true','MOSS balance read completed');}
assert.equal(panel.hidden,true);ui.update(state({open:false}));assert(panel.hidden,'unsolicited nearby broadcast does not open menu');
const paymentWaitState=state({listings:[{...mossRow,reservation:{buyerId:'buyer',expiresAt:order.deadline*1000}}],crypto:{...state().crypto,moss:mossStatus}});
ui.update(paymentWaitState);await readyWallet();assert(!find(`[data-listing="${mossRow.id}"]`),'reserved listings are absent from Browse');click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);
assert(!find('[data-auction-check]'),'reservations have no manual status control');
assert(!find('[data-auction-purchase]'),'a restored reservation cannot assume the wallet never submitted it');
assert.match(find('#auction-detail').innerHTML,/Checking payment status\. A reservation does not confirm payment/);
assert.match(find('#auction-detail').innerHTML,/Settings → Wallet → Activity/);
assert.doesNotMatch(find('#auction-detail').innerHTML,/Payment submitted|Payment found/,'restored reservations do not invent submission or confirmation evidence');
assert.doesNotMatch(find('#auction-detail').innerHTML,/Continue unpaid purchase|Check payment status|If you have sent payment|delivered automatically/);
assert.equal(sent.at(-1).type,'auctionPaymentCheck','opening automatically checks the restored reservation');
assert.equal(sent.at(-1).listingId,mossRow.id);
let requestsBefore=calls.length,checksBefore=sent.filter(message=>message.type==='auctionPaymentCheck').length;
const pollingClock=Date.now,pollingNow=pollingClock();
try{
  Date.now=()=>pollingNow+1000;ui.refresh();assert.equal(sent.filter(message=>message.type==='auctionPaymentCheck').length,checksBefore,'passive checks are throttled');
  Date.now=()=>pollingNow+6000;ui.refresh();assert.equal(sent.filter(message=>message.type==='auctionPaymentCheck').length,checksBefore+1,'refresh automatically resumes status checks');
  assert.equal(calls.length,requestsBefore,'automatic checks never open a wallet approval or send a transaction');
}finally{Date.now=pollingClock;}
const finalityReason='Waiting for payment to be processed. Your item stays reserved.';
ui.update({...paymentWaitState,open:false,reason:finalityReason});assert.equal(find('#auction-status').textContent,finalityReason);assert(!find('[data-auction-purchase]'),'an unpaid-looking status response does not prove a transaction was never submitted');assert.equal(calls.length,requestsBefore);
ui.update({...paymentWaitState,listings:[{...mossRow,reservation:{buyerId:'buyer',expiresAt:Date.now()-1,delivered:true}}]});
assert(!find('[data-auction-purchase]'),'processed delivery never offers a second payment, even after its payment window expires');
assert(find('[data-auction-pending]'));assert(!find('[data-auction-check]'));
assert.match(find('#auction-detail').innerHTML,/Payment found\. Your item is in your bags while verification finishes/);
assert.doesNotMatch(find('#auction-detail').innerHTML,/Payment window ended|unpaid reservation/,'observed payment outranks the wall-clock deadline');
const expiryClock=Date.now,expiresAt=expiryClock()+1000;
ui.update({...paymentWaitState,listings:[{...mossRow,reservation:{buyerId:'buyer',expiresAt}}]});
try{Date.now=()=>expiresAt+1;ui.refresh();assert(!find('[data-auction-purchase]'),'wall time cannot authorize a second wallet transaction');assert(find('[data-auction-pending]'));assert.match(find('#auction-detail').innerHTML,/Checking the chain before any unpaid reservation can be released/);}finally{Date.now=expiryClock;}
ui.update({...paymentWaitState,listings:[structuredClone(mossRow)],reason:'The unpaid reservation expired. The item is available again.'});assert(!find(`[data-listing="${mossRow.id}"]`),'server-released reservations leave Purchases');click('[data-auction-tab="browse"]');click(`[data-listing="${mossRow.id}"]`);assert(!find('[data-auction-purchase]').disabled,'only the server removing the unpaid reservation restores Buy');
ui.close();checksBefore=sent.length;ui.refresh();assert.equal(sent.length,checksBefore,'closed auction never polls');
ui.update(paymentWaitState);await readyWallet();assert.equal(sent.at(-1).type,'auctionPaymentCheck','reopening resumes read-only recovery');
assert(!calls.some(call=>call.method==='eth_sendTransaction'),'recovery has no financial action');



tokenAllowance=parseEther(mossRow.price);
await select();assert.equal(sent.at(-1).type,'auctionBuy');info('Not available','auctionBuy');assert(!find('[data-auction-purchase]').disabled,'rejected request can be retried');
await click('[data-auction-purchase]');assert.equal(sent.at(-1).type,'auctionBuy');await ui.payment({...mossPayment,order:{...mossOrder,transaction:{...mossOrder.transaction,value:'0x1'}}});
assert.equal(calls.filter(call=>call.method==='eth_sendTransaction').length,0,'mismatched terms never prompt payment');assert.match(find('#auction-status').textContent,/does not match/);
await select();let release,paused=false;heldAccounts=()=>new Promise(resolve=>{release=resolve;paused=true;});const closing=ui.payment(mossPayment);await until(()=>paused,'wallet read pending');ui.close();release();await closing;
assert.equal(calls.filter(call=>call.method==='eth_sendTransaction').length,0,'closing during wallet reads prevents payment');
ui.update(state({open:false}));assert(panel.hidden,'settlement broadcast cannot reopen a closed menu');
await select();chainId='0x1';info('Payment check temporarily unavailable.','auctionPaymentCheck');info('Saving your changes…','move');info('Item returned to your backpack.');
await ui.payment(mossPayment);assert.equal(calls.filter(call=>call.method==='wallet_addEthereumChain').length,1,'missing Robinhood network added');
assert.equal(calls.filter(call=>call.method==='eth_sendTransaction').length,1,'late automatic-check errors, movement-save notices and unrelated info must not discard the awaited signed order');assert.equal(sent.at(-1).type,'auctionPaymentCheck',find('#auction-status').textContent);assert.equal(sent.at(-1).listingId,mossRow.id);
const sentTx=calls.find(call=>call.method==='eth_sendTransaction').params[0];assert.equal(sentTx.to.toLowerCase(),mossContract.toLowerCase());assert.equal(BigInt(sentTx.value),0n);
const delivery='Payment confirmed. Wood was delivered. The seller can withdraw ETH from the auction contract.';
ui.update(state({open:false,listings:[],reason:delivery}));assert.equal(find('#auction-status').textContent,delivery,'settlement uses the real server delivery confirmation');
await select();selectedWallet=seller.address;await ui.payment(mossPayment);assert.equal(calls.filter(call=>call.method==='eth_sendTransaction').length,1,'changed wallet cannot send purchase');selectedWallet=buyer.address;
ui.update(state({crypto:{...state().crypto,moss:mossStatus}}));paused=false;heldCall=()=>new Promise(resolve=>{release=resolve;paused=true;});click('[data-auction-withdraw-moss]');await until(()=>paused,'withdrawal balance pending');ui.close();release();await delay(50);
assert.equal(calls.filter(call=>call.method==='eth_sendTransaction').length,1,'closing before withdrawal confirmation prevents its transaction');
ui.update(state());await ui.walletChallenge({type:'auctionWalletChallenge',address:buyer.address,message:'unsolicited',expiresAt:Date.now()+60000});assert(!calls.some(call=>call.method==='personal_sign'),'unsolicited wallet challenges never prompt signatures');
click('[data-auction-tab="sell"]');
assert(find('[name="item"]').querySelectorAll('option').some(option=>option.value==='gear:warden-longbow'));
find('[name="item"]').value='resource:wood';find('[name="quantity"]').value='5';find('[name="currency"]').value='gold';find('[name="price"]').value='123';
player={...player,inventory:{...player.inventory,wood:3}};ui.refresh();assert.equal(find('[name="item"]').value,'resource:wood');assert.equal(find('[name="price"]').value,'123');assert.equal(find('[name="quantity"]').value,'3','bag update preserves draft and clamps quantity');
const mine={...row,id:'own-listing',sellerId:player.id,item:{kind:'gear',id:'warden-longbow',quantity:1},currency:'gold',price:'25'};
ui.update(state({listings:[mine],mine:[mine],open:false}));assert(!find('[name="item"]').querySelectorAll('option').some(option=>option.value==='gear:warden-longbow'),'newly escrowed gear disappears before the bag snapshot arrives');
ui.update(state({listings:[],mine:[],open:false}));player={...player,ownedGear:player.ownedGear.filter(id=>id!=='warden-longbow')};ui.refresh();player={...player,ownedGear:[...player.ownedGear,'warden-longbow']};ui.refresh();assert(find('[name="item"]').querySelectorAll('option').some(option=>option.value==='gear:warden-longbow'),'cancelled gear reappears when its bag snapshot arrives');
ui.close();nearby=false;ui.update(state());assert(panel.hidden);
// Auctionator-style shopping, exact stack pricing, preserved drafts and server-confirmed outcomes.
nearby=true;player={...player,inventory:{...player.inventory,wood:20},carriedItems:{'trail-bread':4,'slime-residue':3}};
const cheap={...row,id:'gold-cheap',sellerName:'Oaktrader',currency:'gold',price:'7',item:{kind:'resource',id:'wood',quantity:6}};
const own={...cheap,id:'gold-own',sellerId:player.id,sellerName:player.name,price:'12'};
const bread={...cheap,id:'bread',sellerName:'Baker',item:{kind:'item',id:'trail-bread',quantity:4},price:'20'};
const market=[cheap,own,bread,row];
const marketState=(extra={})=>state({listings:structuredClone(market),mine:[structuredClone(own)],crypto:{...state().crypto,moss:mossStatus},...extra});
const sales=[
  {id:'sale-gold',item:bread.item,currency:'gold',price:'1250',buyerName:'Baker <Guild>',soldAt:Date.UTC(2026,8,18,9,5)},
  {id:'sale-moss',item:cheap.item,currency:'moss',price:'12.500000000000000001',buyerName:'Moss Buyer',soldAt:Date.UTC(2026,8,18,11,5)},
  {id:'sale-eth',item:{kind:'gear',id:'warden-longbow',quantity:1},currency:'eth',price:'0.000000000000000007',buyerName:'Legacy Buyer',soldAt:Date.UTC(2026,8,18,10,5)},
];
ui.update(marketState());await readyWallet();
click(`[data-listing="${cheap.id}"]`);
find('.auction-review-item').scrollTop=124;
ui.update(marketState({open:false}));
assert.equal(find('.auction-review-item').scrollTop,124,'live market refresh preserves the selected item scroll position');
click('[data-auction-sort="unit"]');
assert.equal(find('.auction-review-item').scrollTop,124,'sorting preserves the selected item scroll position');
click(`[data-listing="${bread.id}"]`);
assert.equal(find('.auction-review-item').scrollTop??0,0,'a different listing starts at the top of its own details');
click('[data-auction-sort="unit"]');
assert.equal(find('.auction-table').querySelectorAll('th').length,5,'dense table exposes item, quantity, unit, total and seller');
assert.equal(find(`[data-listing="${cheap.id}"]`).dataset.itemTooltip,'wood');assert.equal(find(`[data-listing="${bread.id}"]`).dataset.itemTooltip,'item:trail-bread');assert(!find(`[data-listing="${cheap.id}"]`).attributes.title,'auction item inspection has no duplicate native tooltip');
assert.equal(find('[data-market-row]').dataset.marketRow,cheap.id,'shopping defaults to exact ascending unit price');
const searchInput=find('#auction-search');searchInput.value='Baker';searchInput.oninput();
assert.deepEqual(find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing),[bread.id]);
find('#auction-search-form').onsubmit({preventDefault(){}});assert.equal(JSON.parse(preferences.get('mossvale.auction.buyer')).history[0],'Baker');
click('[data-search-reset]');click(`[data-listing="${bread.id}"]`);click('[data-auction-save-item]');
assert.deepEqual(JSON.parse(preferences.get('mossvale.auction.buyer')).saved,['item:trail-bread']);
click('[data-shopping-item="item:trail-bread"]');assert.deepEqual(find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing),[bread.id]);
ui.close();ui.update(marketState());await readyWallet();assert(find('[data-shopping-item="item:trail-bread"]'),'saved shopping item survives reopening');
find('#auction-category').value='consumables';find('#auction-category').onchange();assert.deepEqual(find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing),[bread.id]);
const pig={...bread,id:'pet-golden',item:{kind:'item',id:'golden-pig',quantity:1}};
ui.update(marketState({listings:[...market,pig],open:false}));
assert(find('#auction-category').querySelectorAll('option').some(option=>option.value==='pets'));
find('#auction-category').value='pets';find('#auction-category').onchange();
assert.deepEqual(find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing),[pig.id],'pets have their own auction category');
assert(find('#auction-results').innerHTML.includes('/ui/pets/golden-pig.png'),'auction pets use their actual model icons');
// Equipment filters use the listed item's class and actual rolled level, independently of the buyer's class.
const level31=rollGear('froststalker-weapon','rare',()=>.5,31),level60=rollGear('elderwild-weapon','rare',()=>.5,MAX_LEVEL);
const equipmentRows=[['ranger-2','warden-longbow'],['knight-2','sunsteel-sword'],['universal-1','lantern-charm'],['universal-3','rootforged-charm'],['ranger-25','froststalker-weapon'],['ranger-31',level31.id],['ranger-60',level60.id]].map(([id,gearId])=>({...cheap,id,item:{kind:'gear',id:gearId,quantity:1}}));
const equipmentState=()=>marketState({listings:[...equipmentRows,bread],mine:[],open:false});
const visibleListings=()=>find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing).sort();
const chooseClass=value=>{find('#auction-class').value=value;find('#auction-class').onchange();};
const levelRange=(min,max)=>{for(const [side,value] of [['min',min],['max',max]]){const input=find(`#auction-level-${side}`);input.value=value;input.oninput();}};
ui.update(equipmentState());click('[data-search-reset]');
assert(find('#auction-equipment-filters').hidden,'equipment controls stay hidden for all-item browsing');
click('[data-auction-category="equipment"]');assert(!find('#auction-equipment-filters').hidden);
assert.deepEqual(find('#auction-class').querySelectorAll('option').map(option=>option.value),['all',...CHARACTER_CLASSES]);
for(const side of ['min','max']){assert.equal(find(`#auction-level-${side}`).attributes.min,'1');assert.equal(find(`#auction-level-${side}`).attributes.max,String(MAX_LEVEL));}
assert.deepEqual(visibleListings(),equipmentRows.map(row=>row.id).sort(),'Equipment excludes consumables');
assert.match(find('#auction-results').innerHTML,/Level 31 · Ranger/,'rows show the persisted rolled requirement rather than its level-25 base');
assert.match(find('#auction-results').innerHTML,/Level 3 · All classes/,'universal equipment shows its actual requirement');
chooseClass('Ranger');assert.deepEqual(visibleListings(),['ranger-2','ranger-25','ranger-31','ranger-60','universal-1','universal-3']);
levelRange('2','3');assert.deepEqual(visibleListings(),['ranger-2','universal-3'],'both level boundaries are inclusive and universal gear remains usable');
chooseClass('Knight');assert.deepEqual(visibleListings(),['knight-2','universal-3'],'class selection is independent of the Ranger player');
chooseClass('Ranger');levelRange('31','31');assert.deepEqual(visibleListings(),['ranger-31'],'an exact level matches rolled gear, excluding its base level');
levelRange(String(MAX_LEVEL),String(MAX_LEVEL));assert.deepEqual(visibleListings(),['ranger-60'],'the maximum player level remains selectable');
levelRange('3','2');assert.deepEqual(visibleListings(),[],'an inverted range never broadens the results');
levelRange('2','3');
find('#auction-category').value='consumables';find('#auction-category').onchange();
assert(find('#auction-equipment-filters').hidden);assert.deepEqual(visibleListings(),[bread.id],'equipment restrictions do not hide other item categories');
assert.equal(find('#auction-class').value,'Ranger');assert.equal(find('#auction-level-min').value,'2');assert.equal(find('#auction-level-max').value,'3');
click('[data-auction-category="equipment"]');assert.deepEqual(visibleListings(),['ranger-2','universal-3'],'returning to Equipment restores the selected constraints');
click('[data-search-reset]');assert.equal(find('#auction-category').value,'all');assert.equal(find('#auction-class').value,'all');assert.equal(find('#auction-level-min').value,'');assert.equal(find('#auction-level-max').value,'');assert(find('#auction-equipment-filters').hidden);
assert.deepEqual(visibleListings(),[...equipmentRows,bread].map(row=>row.id).sort(),'Clear filters restores the full item market');
click('[data-auction-category="equipment"]');chooseClass('Knight');levelRange('2','2');
ui.close();ui.update({...equipmentState(),open:true});await readyWallet();
assert.equal(find('#auction-category').value,'all');assert.equal(find('#auction-class').value,'all');assert.equal(find('#auction-level-min').value,'');assert.equal(find('#auction-level-max').value,'');assert(find('#auction-equipment-filters').hidden,'reopening clears equipment constraints');
const rarityRows=GEAR_QUALITIES.map(quality=>({...cheap,id:`rarity-${quality}`,item:{kind:'gear',id:rollGear('warden-longbow',quality,()=>.5).id,quantity:1}}));
const rarityState=()=>marketState({listings:[...rarityRows,bread],mine:[],open:false});
const chooseRarity=value=>{find('#auction-rarity').value=value;find('#auction-rarity').onchange();};
const rarityOrder=()=>find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing);
ui.update(rarityState());click('[data-auction-category="equipment"]');chooseClass('Ranger');levelRange('2','2');
assert.deepEqual(find('#auction-rarity').querySelectorAll('option').map(option=>option.value),['all',...GEAR_QUALITIES]);
assert.deepEqual(visibleListings(),rarityRows.map(row=>row.id).sort(),'all rarities include each roll of the same item, class and required level');
chooseRarity('epic');assert.deepEqual(visibleListings(),['rarity-epic'],'the rarity filter matches the actual roll');
assert.match(find('#auction-results').innerHTML,/Epic · Level 2 · Ranger/,'the equipment row states its rarity beside its requirements');
click('[data-auction-category="consumables"]');assert.deepEqual(visibleListings(),[bread.id],'rarity does not filter non-equipment categories');assert.equal(find('#auction-rarity').value,'epic');
click('[data-auction-category="equipment"]');assert.deepEqual(visibleListings(),['rarity-epic'],'returning to Equipment restores rarity along with class and level');
chooseRarity('all');click('[data-auction-sort="rarity"]');
assert.deepEqual(rarityOrder(),['rarity-mythic','rarity-legendary','rarity-epic','rarity-rare','rarity-uncommon','rarity-common'],'first rarity sort shows the highest rarity first');
click('[data-auction-sort="rarity"]');assert.deepEqual(rarityOrder(),['rarity-common','rarity-uncommon','rarity-rare','rarity-epic','rarity-legendary','rarity-mythic'],'second rarity sort shows the lowest rarity first');
chooseRarity('epic');click('[data-search-reset]');assert.equal(find('#auction-rarity').value,'all');assert.deepEqual(visibleListings(),[...rarityRows,bread].map(row=>row.id).sort(),'Clear filters also removes the rarity constraint');
click('[data-auction-category="equipment"]');chooseRarity('epic');ui.close();ui.update({...rarityState(),open:true});await readyWallet();
assert.equal(find('#auction-rarity').value,'all','reopening resets rarity');assert.deepEqual(visibleListings(),[...rarityRows,bread].map(row=>row.id).sort());
click('[data-auction-sort="unit"]');
ui.update(marketState({open:false}));
click('[data-search-reset]');assert.deepEqual(find('#auction-currency').querySelectorAll('option').map(option=>option.value),['all','gold','moss'],'only gold and MOSS are offered as currency filters');assert(!find(`[data-listing="${row.id}"]`),'unreserved ETH listings are not offered for new purchases');
click('[data-search-reset]');click(`[data-listing="${cheap.id}"]`);await click('[data-auction-purchase]');
const pendingCount=sent.length;ui.update(marketState({open:false}));assert(find('[data-auction-purchase]').disabled,'unrelated market broadcast does not release a pending purchase');await click('[data-auction-purchase]');assert.equal(sent.length,pendingCount,'a pending listing cannot be bought twice');
ui.update(marketState({open:false,listings:market.filter(entry=>entry.id!==cheap.id)}));assert.match(find('#auction-status').textContent,/no longer available/);assert.doesNotMatch(find('#auction-status').textContent,/completed|Bought|delivered/i,'a competing buyer winning is never presented as success');
info('Another buyer bought that listing.','auctionBuy');assert.equal(find('#auction-status').textContent,'Another buyer bought that listing.','delayed authoritative rejection is still displayed');
ui.update(marketState());await readyWallet();click(`[data-listing="${cheap.id}"]`);await click('[data-auction-purchase]');ui.update(marketState({open:false,listings:market.filter(entry=>entry.id!==cheap.id),reason:'Bought Timber for 7 gold.'}));assert.equal(find('#auction-status').textContent,'Bought Timber for 7 gold.');
ui.update(marketState());await readyWallet();click('[data-auction-tab="mine"]');find('#auction-mine-filter').value='undercut';find('#auction-mine-filter').onchange();assert.deepEqual(find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing),[own.id]);
click(`[data-listing="${own.id}"]`);click('[data-auction-cancel]');assert.deepEqual(sent.at(-1),{type:'auctionCancel',npcId:sent.at(-1).npcId,listingId:own.id},'cancellation names one exact listing');ui.update(marketState({open:false,listings:[cheap,bread,row],mine:[],reason:'Listing cancelled. The items are back in your bags.'}));assert.equal(find('#auction-status').textContent,'Listing cancelled. The items are back in your bags.');
ui.update(marketState());await readyWallet();click('[data-auction-tab="sold"]');
assert.match(find('#auction-body').innerHTML,/No completed sales recorded yet/,'legacy snapshots without sold history show an empty state');
assert.match(find('#auction-body').innerHTML,/History starts with this update; earlier sales are unavailable/,'empty history does not imply older sales were recovered');
const soldState=()=>marketState({open:false,sold:structuredClone(sales),crypto:{...state().crypto,moss:mossStatus}});
const soldSnapshot=soldState();ui.update(soldSnapshot);
assert.equal(find('.auction-sales-table').querySelectorAll('th').length,7,'sold history shows item, quantity, total, currency, gold fee/net, buyer and date');
assert.deepEqual(find('.auction-sales-table').querySelectorAll('[data-auction-sale]').map(node=>node.dataset.auctionSale),['sale-moss','sale-eth','sale-gold'],'completed sales are newest first');
assert.deepEqual(soldSnapshot.sold.map(sale=>sale.id),['sale-gold','sale-moss','sale-eth'],'rendering does not mutate the incoming history');
assert.match(find('#auction-body').innerHTML,/1,250/);assert.match(find('#auction-body').innerHTML,/12\.500000000000000001/);assert.match(find('#auction-body').innerHTML,/0\.000000000000000007/);
assert.match(find('#auction-body').innerHTML,/Baker &lt;Guild&gt;/,'buyer names are escaped');
assert.equal(find('[data-auction-sale="sale-moss"]').querySelector('time').attributes.datetime,new Date(sales[1].soldAt).toISOString());
assert.equal(find('[data-auction-sale="sale-gold"]').querySelector('[data-item-tooltip]').dataset.itemTooltip,'item:trail-bread','sold items retain inspection');
assert(!find('[data-listing]')&&!find('[data-auction-purchase]')&&!find('[data-auction-cancel]'),'receipts never offer buy or cancellation actions');
assert(find('[data-auction-withdraw-moss]'),'MOSS withdrawal remains available from Sold');
find('[data-auction-scroll="sales"]').scrollTop=51;find('[data-auction-scroll="sales"]').scrollLeft=87;
ui.update(soldState());assert.equal(find('[data-auction-tab="sold"]').attributes['aria-pressed'],'true');assert.equal(find('[data-auction-scroll="sales"]').scrollTop,51);assert.equal(find('[data-auction-scroll="sales"]').scrollLeft,87,'live updates preserve horizontal receipt scroll');
ui.update(marketState());await readyWallet();click('[data-auction-tab="sell"]');assert(find('[data-sell-choice="item:trail-bread"]'),'new carried items can be listed');
click('[data-sell-choice="resource:wood"]');find('[name="quantity"]').value='5';find('[name="quantity"]').oninput();
assert.equal(find('[name="price"]').value,'','no synthetic listing price is filled in');click('[data-match-lowest]');assert.equal(find('[name="price"]').value,'6','Match lowest rounds the TOTAL price up from 5 × 7/6 gold');
find('[name="price"]').value='123';find('[name="price"]').oninput();find('[name="price"]').focus();find('[data-auction-scroll="bag"]').scrollTop=44;
ui.update(marketState({open:false}));assert.equal(find('[name="price"]').value,'123','live market refresh never silently changes a chosen price');assert.equal(find('[name="quantity"]').value,'5');assert.equal(document.activeElement,find('[name="price"]'),'live refresh restores focused native input');assert.equal(find('[data-auction-scroll="bag"]').scrollTop,44);
assert.deepEqual(find('[name="currency"]').querySelectorAll('option').map(option=>option.value),['gold','moss'],'ETH cannot be selected for new listings');
find('[name="currency"]').value='gold';find('[name="currency"]').onchange();find('[name="price"]').value='1';find('[name="price"]').oninput();assert(!find('#auction-low-price').hidden);assert(find('[data-auction-submit]').disabled,'less than half the market requires explicit price acknowledgement');
let before=sent.length;find('#auction-sell').onsubmit({preventDefault(){}});assert.equal(sent.length,before,'native submit also enforces acknowledgement');
find('[data-price-ack]').checked=true;find('[data-price-ack]').onchange();assert(!find('[data-auction-submit]').disabled);find('#auction-sell').onsubmit({preventDefault(){}});assert.equal(sent.at(-1).price,'1');assert.equal(sent.at(-1).item.quantity,5,'submission retains explicit stack quantity and total');
ui.update(marketState({open:false}));assert(find('[data-auction-submit]').disabled,'unrelated broadcast cannot release a pending listing');
const newListing={...own,id:'new-sale',item:{kind:'resource',id:'wood',quantity:5},price:'1'};ui.update(marketState({open:false,listings:[...market,newListing],mine:[own,newListing],reason:'Listed Timber for 1 gold.'}));assert.equal(find('[name="price"]').value,'','server-confirmed sale clears price without rereading the stale form');assert.equal(find('[name="quantity"]').value,'1');
click('[data-sell-choice="resource:herb"]');assert(find('[data-match-lowest]').disabled,'an item without competitors has no invented market price');assert.equal(find('[name="price"]').value,'');
const movement=find('[data-auction-close]').fire('keydown',{key:'w'});assert(!movement.stopped,'movement reaches the game from market button focus');assert(find('[data-auction-close]').fire('keydown',{key:'Tab'}).stopped,'Tab stays in native market navigation');
assert(find('[data-auction-close]').fire('keydown',{key:'Escape'}).stopped);assert(panel.hidden);
// MOSS approves its exact price and buys atomically in one reviewed wallet operation.
const mossState=(extra={})=>state({listings:[structuredClone(mossRow)],crypto:{...state().crypto,moss:mossStatus},...extra});
const selectMoss=async()=>{ui.close();ui.update(mossState({open:false,listings:[]}));ui.update(mossState());await readyWallet();click(`[data-listing="${mossRow.id}"]`);await click('[data-auction-purchase]');};
const sends=()=>calls.filter(call=>call.method==='eth_sendTransaction');
const openMoss=async()=>{ui.close();ui.update(mossState());await readyWallet();click(`[data-listing="${mossRow.id}"]`);};
const buys=()=>sent.filter(message=>message.type==='auctionBuy').length;
// Affordability is checked in exact token units before reserving, including stale balances.
tokenBalance=parseEther(mossRow.price)-1n;await openMoss();before=buys();
assert(find('[data-auction-purchase]').disabled,'one token unit short disables Buy');assert.match(find('#auction-detail').innerHTML,/Not enough MOSS/);
await find('[data-auction-purchase]').onclick();assert.equal(buys(),before,'an unaffordable listing is never reserved');
tokenBalance=parseEther(mossRow.price);click('[data-auction-refresh]');ui.update(mossState({open:false}));await readyWallet();
assert(!find('[data-auction-purchase]').disabled,'Refresh market notices a top-up to the exact price');
tokenBalance=0n;await click('[data-auction-purchase]');assert.equal(buys(),before,'fresh preflight catches funds spent after the displayed balance');assert(find('[data-auction-purchase]').disabled);
tokenBalance=parseEther('100');const balanceClock=Date.now,balanceNow=Date.now();
try{Date.now=()=>balanceNow+16000;ui.refresh();}finally{Date.now=balanceClock;}await readyWallet();
assert(!find('[data-auction-purchase]').disabled,'open-market refresh notices a later top-up');
heldCall=async()=>{throw Error('RPC unavailable');};await click('[data-auction-purchase]');
assert.equal(buys(),before,'failed balance preflight never reserves');assert(find('[data-auction-purchase]').disabled);assert.match(find('#auction-detail').innerHTML,/MOSS balance unavailable.*Refresh the market/);
click('[data-auction-refresh]');ui.update(mossState({open:false}));await readyWallet();assert(!find('[data-auction-purchase]').disabled,'market refresh retries a failed read');
// Reads neither freeze browsing/gold purchases nor permit stale session responses to buy.
ui.close();paused=false;heldCall=()=>new Promise(resolve=>{release=resolve;paused=true;});ui.update(mossState({listings:[mossRow,cheap]}));await until(()=>paused,'initial MOSS balance');
click(`[data-listing="${mossRow.id}"]`);assert(find('[data-auction-purchase]').disabled);assert.match(find('#auction-detail').innerHTML,/Checking MOSS balance/);
click(`[data-listing="${cheap.id}"]`);await click('[data-auction-purchase]');assert.equal(buys(),before+1,'gold can be bought during a MOSS balance read');ui.reject('Gold test complete','auctionBuy');
click('[data-auction-tab="sell"]');assert.equal(find('[data-auction-tab="sell"]').attributes['aria-pressed'],'true');release();await readyWallet();
await openMoss();before=buys();paused=false;heldCall=()=>new Promise(resolve=>{release=resolve;paused=true;});const oldBuy=find('[data-auction-purchase]'),firstBuy=oldBuy.onclick();await until(()=>paused,'double-click preflight');
assert(find('[data-auction-purchase]').disabled);await oldBuy.onclick();assert.equal(buys(),before,'a stale second click cannot bypass the balance read');release();await firstBuy;assert.equal(buys(),before+1,'double click reserves only once');
for(const [label,change] of [
  ['close',()=>ui.close()],
  ['character change',()=>{player={...player,id:'different-buyer'};}],
  ['wallet change',()=>{selectedWallet=seller.address;}],
  ['listing change',()=>ui.update(mossState({open:false,listings:[{...mossRow,price:'13'}]}))],
  ['browse away',()=>click('[data-auction-tab="sell"]')],
  ['filter listing away',()=>{find('#auction-search').value='absent listing';find('#auction-search').oninput();}],
]){
  await openMoss();before=buys();paused=false;heldCall=()=>new Promise(resolve=>{release=resolve;paused=true;});const checking=click('[data-auction-purchase]');await until(()=>paused,`${label} during preflight`);
  change();release();await checking;assert.equal(buys(),before,`${label} during preflight cannot reserve a listing`);player={...player,id:'buyer'};selectedWallet=buyer.address;
}
await openMoss();before=buys();paused=false;heldCall=()=>new Promise(resolve=>{release=resolve;paused=true;});const staleBalance=click('[data-auction-purchase]');await until(()=>paused,'old session balance');
ui.close();tokenBalance=0n;ui.update(mossState());await readyWallet();click(`[data-listing="${mossRow.id}"]`);tokenBalance=parseEther('100');release();await staleBalance;
assert.equal(buys(),before);assert(find('[data-auction-purchase]').disabled,'an old session cannot overwrite the reopened wallet balance');
await selectMoss();assert.equal(sent.at(-1).type,'auctionBuy');tokenBalance=0n;before=sends().length;await ui.payment(mossPayment);assert.equal(sends().length,before,'insufficient MOSS never approves or buys');assert.match(find('#auction-status').textContent,/Not enough MOSS/);
tokenBalance=parseEther('100');tokenAllowance=0n;await selectMoss();paused=false;heldSend=()=>new Promise(resolve=>{release=resolve;paused=true;});
const purchasing=ui.payment(mossPayment);await until(()=>paused,'atomic MOSS purchase review');assert.equal(sends().length,before+1,'approval and purchase have one wallet review');
// A pending wallet receipt locks mutations, not navigation or read-only refresh.
const pendingMine={...mossRow,reservation:{buyerId:'buyer',expiresAt:Date.now()+60000}};
const pendingOther={...mossRow,id:'other-reservation',reservation:{buyerId:'other',expiresAt:Date.now()+60000}};
const pendingGold={...pendingMine,id:'pending-gold',item:{kind:'gold',id:'gold',quantity:200},goldFee:1};
const pendingMarket=mossState({open:false,economyVersion:1,goldExchangeEnabled:true,listings:[pendingMine,pendingOther,pendingGold,cheap,own],mine:[own]});
ui.update(pendingMarket);assert(!find(`[data-listing="${mossRow.id}"]`));assert(!find(`[data-listing="${pendingOther.id}"]`));
const mutationsBefore=sent.filter(message=>['auctionBuy','auctionList','auctionCancel'].includes(message.type)).length;
click(`[data-listing="${cheap.id}"]`);assert(find('[data-auction-purchase]').disabled,'gold Buy is visibly disabled while a wallet payment waits');await find('[data-auction-purchase]').onclick();
assert(find('[data-auction-withdraw-moss]').disabled);find('[data-auction-withdraw-moss]').onclick();
const bagsBefore=bagsOpened;click('[data-auction-bags]');assert.equal(bagsOpened,bagsBefore+1,'Bags stays available');
click('[data-auction-refresh]');assert.equal(sent.at(-1).type,'auctionOpen');info('Refresh temporarily unavailable','auctionOpen');
ui.update(pendingMarket);click('[data-auction-tab="purchases"]');
assert.deepEqual(new Set(find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing)),new Set([pendingMine.id,pendingGold.id]),'Purchases shows only this buyer, including gold lots');
assert.match(find('#auction-results').innerHTML,/Payment pending/);click(`[data-listing="${mossRow.id}"]`);assert(find('[data-auction-pending]'));assert(!find('[data-auction-purchase]'),'pending purchase has no duplicate payment button');assert.match(find('#auction-detail').innerHTML,/Waiting for your wallet/,'an open request is not claimed as submitted');
click('[data-auction-tab="mine"]');click(`[data-listing="${own.id}"]`);assert(find('[data-auction-cancel]').disabled);find('[data-auction-cancel]').onclick();
click('[data-auction-tab="sell"]');click('[data-sell-choice="resource:wood"]');find('[name="price"]').value='100';find('[name="price"]').oninput();assert(find('[data-auction-submit]').disabled);find('#auction-sell').onsubmit({preventDefault(){}});
click('[data-auction-tab="exchange"]');assert(!find(`[data-listing="${pendingGold.id}"]`));find('[name="goldQuantity"]').value='200';find('[name="mossPrice"]').value='10';find('[name="mossPrice"]').oninput();assert(find('[data-exchange-submit]').disabled);find('#auction-exchange').onsubmit({preventDefault(){}});
click('[data-auction-tab="sold"]');assert.equal(find('[data-auction-tab="sold"]').attributes['aria-pressed'],'true');
assert.equal(sent.filter(message=>['auctionBuy','auctionList','auctionCancel'].includes(message.type)).length,mutationsBefore,'navigation and direct handler calls cannot start another mutation');
assert.equal(sends().length,before+1,'navigation cannot open another wallet transaction');
click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);

const batch=sends().at(-1).params[0];assert.equal(batch.to.toLowerCase(),mossContract.toLowerCase());assert.equal(BigInt(batch.value),0n);
assert.equal(batch.approval.to.toLowerCase(),MOSS_TOKEN.address.toLowerCase());assert.equal(tokenABI.decodeFunctionData('approve',batch.approval.data)[1],parseEther(mossRow.price),'approval is exact, never unlimited');assert.equal(batch.approval.value,'0');
release();await purchasing;assert.equal(sends().length,before+1,find('#auction-status').textContent);assert.equal(sent.at(-1).type,'auctionPaymentCheck');assert.equal(sent.at(-1).listingId,mossRow.id);assert.match(find('#auction-detail').innerHTML,/Payment submitted\. Checking delivery/,'only a returned wallet transaction establishes submission');
tokenAllowance=parseEther('100');await selectMoss();before=sends().length;await ui.payment(mossPayment);assert.equal(sends().length,before+1);assert(sends().at(-1).params[0].approval,'existing allowance still uses one exact atomic approval and buy');
assert(!calls.some(call=>call.method==='eth_call'&&call.params[0].data.startsWith(tokenABI.getFunction('allowance').selector)),'no separate allowance-dependent payment path');
for(const [referralBps,referred] of referralOrders){
  await selectMoss();before=sends().length;await ui.payment({...mossPayment,order:referred});
  assert.equal(sends().length,before+1,'referral purchase stays a single exact approval and buy');
  const request=sends().at(-1),batch=request.params[0],decoded=referralABI.decodeFunctionData('buy',batch.data)[0];
  assert.equal(decoded.referralBps,BigInt(referralBps));assert.equal(decoded.referrer,referred.referrer);
  assert.equal(batch.approval.data,mossOrder.approval.data);assert.equal(batch.approval.value,'0');
  assert.equal(request.auctionPurchase.price,mossRow.price);assert.equal(request.auctionPurchase.contract,mossContract);assert.equal(request.auctionPurchase.listingId,mossRow.id);
  assert.equal(sent.at(-1).type,'auctionPaymentCheck');
}
// Buy is the only purchase action. Its exact wallet review stays explicit; automatic recovery is read-only.
const reservedMoss=()=>mossState({open:false,listings:[{...mossRow,reservation:{buyerId:'buyer',expiresAt:mossOrder.deadline*1000}}]});
await selectMoss();ui.update(reservedMoss());click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);before=sends().length;
assert.match(find('#auction-detail').innerHTML,/Reserved\. Preparing your wallet payment/);
heldSend=async()=>{throw Object.assign(Error('Purchase cancelled.'),{code:4001,transactionNotSubmitted:true});};
await ui.payment(mossPayment);assert.equal(sends().length,before+1);
assert(!find('[data-auction-purchase]').disabled,'explicit approval cancellation restores the single Buy action');
assert.match(find('#auction-detail').innerHTML,/This attempt did not complete a payment\. You can review Buy again/);
assert.match(find('#auction-detail').innerHTML,/>Buy<\/button>/);assert(!find('[data-auction-check]'));
assert.doesNotMatch(find('#auction-detail').innerHTML,/Continue unpaid purchase|Check payment status|If you have sent payment/);
await click('[data-auction-purchase]');heldSend=async()=>{throw Object.assign(Error('Expired unused operation.'),{confirmedSponsoredFailure:true});};
await ui.payment(mossPayment);assert(!find('[data-auction-purchase]').disabled,'proven failure can be reviewed again explicitly');
ui.close();ui.update({...reservedMoss(),open:true});await readyWallet();click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);
assert(!find('[data-auction-purchase]'),'closing discards unpaid knowledge; restored reservations await verified expiry instead of risking another payment');
assert.equal(sent.at(-1).type,'auctionPaymentCheck');
ui.update(mossState({open:false,reason:'The unpaid reservation expired. The item is available again.'}));
click('[data-auction-tab="browse"]');click(`[data-listing="${mossRow.id}"]`);assert(!find('[data-auction-purchase]').disabled,'authoritative unpaid expiry restores a new Buy');
await click('[data-auction-purchase]');ui.update(reservedMoss());click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);before=sends().length;
heldSend=async()=>{throw Error('Connection lost after submission.');};
await ui.payment(mossPayment);assert.equal(sends().length,before+1);assert(!find('[data-auction-purchase]'));
assert(find('[data-auction-pending]'));assert.match(find('#auction-status').textContent,/Payment result is unknown\..*Wallet → Activity.*Do not pay again/,'unknown result preserves the reservation and explains safe wallet recovery');
assert.doesNotMatch(find('#auction-detail').innerHTML,/Payment submitted|Payment found/,'RPC loss is not payment evidence');
await ui.payment(mossPayment);assert.equal(sends().length,before+1,'duplicate payment messages never resend an uncertain purchase');
const recoveryClock=Date.now,recoveryNow=recoveryClock();
try{Date.now=()=>recoveryNow+10000;ui.refresh();assert.equal(sent.at(-1).type,'auctionPaymentCheck');assert.equal(sends().length,before+1,'automatic status recovery never signs again');}finally{Date.now=recoveryClock;}
ui.close();ui.update({...reservedMoss(),open:true});await readyWallet();click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);
assert(!find('[data-auction-purchase]'),'reopening an uncertain purchase cannot offer another payment');
const beforeLogout=sent.length,savedPlayer=player;player=undefined;ui.refresh();assert(panel.hidden);ui.refresh();assert.equal(sent.length,beforeLogout,'logout stops automatic checks');player=savedPlayer;
ui.update({...reservedMoss(),open:true});await readyWallet();click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);assert(!find('[data-auction-purchase]'),'reconnecting preserves conservative pending recovery');
ui.update(mossState({open:false}));click('[data-auction-tab="browse"]');click(`[data-listing="${mossRow.id}"]`);assert(!find('[data-auction-purchase]').disabled,'server-confirmed reservation removal permits a fresh purchase');

for(const [label,after] of [
  ['wallet changed',()=>{selectedWallet=seller.address;}],
  ['network changed',()=>{chainId='0x1';}],
  ['listing changed',()=>ui.update(mossState({listings:[{...mossRow,price:'13'}],open:false}))],
  ['already processed',()=>ui.update(mossState({listings:[{...mossRow,reservation:{buyerId:'buyer',expiresAt:order.deadline*1000,delivered:true}}],open:false}))],
  ['settlement changed',()=>ui.update(mossState({crypto:{...state().crypto,moss:{...mossStatus,contract}},open:false}))],
  ['panel closed',()=>ui.close()],
  ['order expired',()=>{mossOrder.deadline=1;}],
  ['balance spent',()=>{tokenBalance=0n;}],
]){
  tokenAllowance=0n;await selectMoss();before=sends().length;heldCall=async()=>after();await ui.payment(mossPayment);assert.equal(sends().length,before,`${label} during the balance read prevents the entire operation`);selectedWallet=buyer.address;chainId='0x1237';mossOrder.deadline=order.deadline;tokenBalance=parseEther('100');
}
await selectMoss();before=sends().length;heldSend=async()=>{throw Object.assign(Error('Check the pending transaction in Settings → Wallet → Activity before starting another payment.'),{code:'WALLET_PENDING_TRANSACTION'});};await ui.payment(mossPayment);assert.equal(sends().length,before+1);assert.match(find('#auction-status').textContent,/Settings → Wallet → Activity/);assert(!find('[data-auction-purchase]').disabled,'an older journal conflict exposes recovery and leaves the unsubmitted Buy retryable');
await selectMoss();ui.update(reservedMoss());click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);before=sends().length;
heldSend=async()=>{throw Object.assign(Error('The daily sponsorship limit has been reached.'),{transactionNotSubmitted:true});};
await ui.payment(mossPayment);assert.equal(sends().length,before+1);
assert.equal(find('#auction-status').textContent,'The daily sponsorship limit has been reached.','a definite preparation rejection shows its actual error');
assert(!find('[data-auction-purchase]').disabled,'definitely unsubmitted preparation restores the existing reserved Buy');
await click('[data-auction-purchase]');await ui.payment(mossPayment);
assert.equal(sends().length,before+2);assert.equal(sent.at(-1).type,'auctionPaymentCheck','an explicit retry still completes the usual payment-check path');
await selectMoss();ui.update(reservedMoss());click('[data-auction-tab="purchases"]');click(`[data-listing="${mossRow.id}"]`);before=sends().length;
heldSend=async()=>{throw Object.assign(Error('Wallet lifetime ended after submission.'),{code:4001});};
await ui.payment(mossPayment);assert.equal(sends().length,before+1);assert(!find('[data-auction-purchase]'),'cancellation code alone cannot prove a handed-off transaction was not submitted');
assert.match(find('#auction-status').textContent,/Payment result is unknown/);
await ui.payment(mossPayment);assert.equal(sends().length,before+1,'an uncertain cancellation cannot resend the payment');
// A broadcast during a wallet prompt must not strand the menu after cancelling the withdrawal.
ui.close();ui.update(mossState());await readyWallet();paused=false;let declineWithdrawal;
heldSend=()=>new Promise((_resolve,reject)=>{declineWithdrawal=reject;paused=true;});
before=sends().length;click('[data-auction-withdraw-moss]');await until(()=>paused,'withdrawal wallet prompt');
ui.update(mossState({open:false}));click('[data-auction-withdraw-moss]');
assert.equal(sends().length,before+1,'market refresh cannot open a second pending withdrawal');
declineWithdrawal(Object.assign(Error('User rejected the request.'),{code:4001}));
await until(()=>/rejected/i.test(find('#auction-status').textContent),'withdrawal cancellation');
click('[data-auction-tab="sold"]');assert.equal(find('[data-auction-tab="sold"]').attributes['aria-pressed'],'true','cancelling a refreshed withdrawal releases Sold immediately');
let sentBeforeRefresh=sent.length;click('[data-auction-refresh]');assert.equal(sent.length,sentBeforeRefresh+1,'cancelling a refreshed withdrawal releases Refresh immediately');
assert.equal(sent.at(-1).type,'auctionOpen');ui.update(mossState({open:false}));
before=sends().length;click('[data-auction-withdraw-moss]');await until(()=>/MOSS withdrawn/.test(find('#auction-status').textContent),'immediate retry after cancelled withdrawal');
assert.equal(sends().length,before+1,'cancelled withdrawal can be retried without closing the auction house');
// The pending wallet operation also owns its guard across closing and reopening the panel.
ui.close();ui.update(mossState());await readyWallet();paused=false;
heldSend=()=>new Promise((_resolve,reject)=>{declineWithdrawal=reject;paused=true;});
before=sends().length;click('[data-auction-withdraw-moss]');await until(()=>paused,'withdrawal before reopening');
ui.close();ui.update(mossState());await readyWallet();click('[data-auction-withdraw-moss]');
assert.equal(sends().length,before+1,'reopening cannot bypass a pending wallet transaction');
declineWithdrawal(Object.assign(Error('User rejected the request.'),{code:4001}));await delay(50);
click('[data-auction-tab="sold"]');assert.equal(find('[data-auction-tab="sold"]').attributes['aria-pressed'],'true','old wallet cancellation releases the reopened panel');
before=sends().length;click('[data-auction-withdraw-moss]');await until(()=>/MOSS withdrawn/.test(find('#auction-status').textContent),'withdrawal retry after reopen and cancellation');
assert.equal(sends().length,before+1);
ui.close();ui.update(mossState({reason:'Ready for next withdrawal.'}));await readyWallet();assert(!find('[data-auction-withdraw]'),'ETH withdrawal is no longer offered');assert(find('[data-auction-withdraw-moss]'));before=sends().length;click('[data-auction-withdraw-moss]');await until(()=>/MOSS withdrawn/.test(find('#auction-status')?.textContent),'MOSS withdrawal receipt');assert.equal(sends().length,before+1);assert.equal(sends().at(-1).params[0].to.toLowerCase(),mossContract.toLowerCase(),'MOSS proceeds withdraw from token settlement, never ETH settlement');assert.equal(abi.decodeFunctionData('withdraw',sends().at(-1).params[0].data)[0],buyer.address);
// Original seller balances remain withdrawable through the independently verified previous contract.
const previousMoss=Wallet.createRandom().address;
const previousStatus={...mossStatus,enabled:false,previousContract:previousMoss,reason:'New MOSS settlement unavailable.'};
const previousState=(extra={})=>mossState({crypto:{...state().crypto,moss:previousStatus},reason:'Ready to review previous MOSS proceeds.',...extra});
ui.close();ui.update(previousState());if(!window.__MOSSVALE_NATIVE__)await readyWallet();assert(!find('[data-auction-withdraw-moss]'));assert(find('[data-auction-withdraw-previous-moss]'));
before=sends().length;click('[data-auction-withdraw-previous-moss]');await until(()=>/MOSS withdrawn/.test(find('#auction-status')?.textContent),'previous MOSS withdrawal receipt');
assert.equal(sends().length,before+1);assert.equal(sends().at(-1).params[0].to.toLowerCase(),previousMoss.toLowerCase(),'previous balances use the old verified contract while new settlement is disabled');
assert.equal(BigInt(sends().at(-1).params[0].value),0n);assert.equal(abi.decodeFunctionData('withdraw',sends().at(-1).params[0].data)[0],buyer.address,'previous proceeds still go only to the linked wallet');
// Multiple verified generations remain independently collectible, with a singular alias for older servers.
const olderMoss=Wallet.createRandom().address;
const pluralStatus={...previousStatus,previousContracts:[previousMoss,olderMoss,previousMoss.toLowerCase(),mossContract,'0x1234','0x'+'0'.repeat(40)]};
const pluralState=(extra={})=>previousState({crypto:{...state().crypto,moss:pluralStatus},...extra});
ui.close();ui.update(pluralState());await readyWallet();
assert.equal(panel.querySelectorAll('[data-auction-withdraw-previous-moss]').length,2,'only unique verified prior targets are offered');
for(const target of [previousMoss,olderMoss]){
  ui.close();ui.update(pluralState());await readyWallet();before=sends().length;
  assert(panel.innerHTML.includes(target.slice(0,6)+'…'+target.slice(-4)),'multiple prior withdrawals identify their distinct contracts');
  click(`[data-auction-withdraw-previous-moss="${target}"]`);await until(()=>/MOSS withdrawn/.test(find('#auction-status')?.textContent),'selected prior-generation proceeds');
  assert.equal(sends().length,before+1);assert.equal(sends().at(-1).params[0].to.toLowerCase(),target.toLowerCase());
  assert.equal(abi.decodeFunctionData('withdraw',sends().at(-1).params[0].data)[0],buyer.address);
}
ui.close();ui.update(pluralState());await readyWallet();paused=false;heldCall=()=>new Promise(resolve=>{release=resolve;paused=true;});before=sends().length;
click(`[data-auction-withdraw-previous-moss="${olderMoss}"]`);await until(()=>paused,'second previous contract review pending');ui.update(previousState({open:false}));release();
await until(()=>/changed/.test(find('#auction-status')?.textContent),'selected prior contract verification removed');assert.equal(sends().length,before,'removed prior target cannot be signed after its balance read');
ui.close();ui.update(previousState({wallet:null}));await until(()=>sent.at(-1)?.type==='auctionWalletChallenge','previous proceeds automatically request wallet linking during new-settlement outage');assert(!find('[data-auction-withdraw-previous-moss]'),'withdrawal requires a linked wallet');
for(const change of [{previousContract:undefined},{previousContract:'0x1234'},{previousContract:'0x'+'0'.repeat(40)},{previousContract:mossContract},{chainId:1},{token:seller.address},{decimals:6}]){
  ui.close();ui.update(previousState({crypto:{...state().crypto,moss:{...previousStatus,...change}}}));
  assert(!find('[data-auction-withdraw-previous-moss]'),'unverified or mismatched previous targets have no withdrawal action');
}
for(const [label,change] of [
  ['previous target changed',{crypto:{...state().crypto,moss:{...previousStatus,previousContract:authority.address}}}],
  ['previous verification removed',{crypto:{...state().crypto,moss:{...previousStatus,previousContract:undefined}}}],
  ['token changed',{crypto:{...state().crypto,moss:{...previousStatus,token:seller.address}}}],
  ['wallet changed',{wallet:seller.address}],
]){
  ui.close();ui.update(previousState());if(!window.__MOSSVALE_NATIVE__)await readyWallet();paused=false;heldCall=()=>new Promise(resolve=>{release=resolve;paused=true;});before=sends().length;
  click('[data-auction-withdraw-previous-moss]');await until(()=>paused,'previous proceeds read pending');ui.update(previousState({...change,open:false}));release();
  await until(()=>/changed/.test(find('#auction-status')?.textContent),label);assert.equal(sends().length,before,`${label} before signing blocks the transaction`);
}
ui.close();ui.update(previousState());if(!window.__MOSSVALE_NATIVE__)await readyWallet();paused=false;heldCall=()=>new Promise(resolve=>{release=resolve;paused=true;});before=sends().length;
click('[data-auction-withdraw-previous-moss]');await until(()=>paused,'previous proceeds before close');ui.close();release();await delay(50);assert.equal(sends().length,before,'closing before previous balance review prevents signing');
window.__MOSSVALE_NATIVE__=true;ui.update(previousState());if(!window.__MOSSVALE_NATIVE__)await readyWallet();assert(!find('[data-auction-withdraw-previous-moss]'),'native never offers previous-contract wallet actions');ui.close();delete window.__MOSSVALE_NATIVE__;
ui.update(mossState({listings:[...market,mossRow]}));await readyWallet();find('#auction-currency').value='moss';find('#auction-currency').onchange();assert.deepEqual(find('#auction-results').querySelectorAll('[data-listing]').map(node=>node.dataset.listing),[mossRow.id]);
click('[data-auction-tab="sell"]');click('[data-sell-choice="resource:wood"]');find('[name="currency"]').value='moss';find('[name="currency"]').onchange();find('[name="quantity"]').value='5';find('[name="quantity"]').oninput();click('[data-match-lowest]');assert.equal(find('[name="price"]').value,'12.5','MOSS matching uses MOSS competition only');ui.update(mossState({crypto:{enabled:false,moss:{enabled:false,reason:'MOSS temporarily unavailable.'}},open:false}));assert.equal(find('[name="currency"]').value,'moss','a disabled MOSS market never converts a token price into gold');assert.equal(find('[name="price"]').value,'12.5');assert(find('[data-auction-submit]').disabled);ui.update(mossState({open:false}));find('#auction-sell').onsubmit({preventDefault(){}});assert.equal(sent.at(-1).currency,'moss');assert.equal(sent.at(-1).price,'12.5');
ui.close();ui.update(mossState({crypto:{enabled:false,moss:mossStatus},wallet:null}));assert(!find('[data-auction-wallet]'),'wallet setup has no manual button');
click('[data-auction-tab="sell"]');assert.match(find('#auction-sell-wallet-note').textContent,/Refresh the market to retry/,'sell form explains how to enable MOSS');
const unavailable='MOSS trading is unavailable while the settlement service reconnects.';
ui.close();ui.update(mossState({crypto:{enabled:false,reason:'ETH trading is unavailable.',moss:{enabled:false,reason:unavailable}},wallet:null}));
assert.equal(find('#auction-wallet-note').attributes.title,unavailable,'wallet header displays the MOSS failure, not the ETH failure');
assert(!find('[data-auction-wallet]'),'unavailable markets have no manual wallet setup button');
click('[data-auction-tab="sell"]');assert(find('#auction-sell-wallet-note').textContent.includes(unavailable),'disabled MOSS option has an actionable market-specific reason');
ui.close();ui.update(mossState({crypto:{...state().crypto,moss:{enabled:false,reason:unavailable}},wallet:null}));assert.equal(find('#auction-wallet-note').attributes.title,unavailable,'an enabled legacy ETH market does not mask disabled MOSS');assert(!find('[data-auction-wallet]'));
const legacyMine={...row,id:'legacy-eth-own',sellerId:player.id,reservation:undefined};
ui.close();ui.update(mossState({listings:[legacyMine,row],mine:[legacyMine]}));click('[data-auction-tab="mine"]');assert(find('[data-auction-payout-note]'),'own wallet listings explain automatic migration and pending payment protection');click(`[data-listing="${legacyMine.id}"]`);assert(!find('[data-auction-cancel]').disabled,'legacy ETH escrow remains available for cancellation');click('[data-auction-cancel]');assert.equal(sent.at(-1).type,'auctionCancel');assert.equal(sent.at(-1).listingId,legacyMine.id);
tokenAllowance=parseEther(mossRow.price);await selectMoss();accountsAuthorized=false;before=sends().length;requestsBefore=calls.filter(call=>call.method==='eth_requestAccounts').length;await ui.payment(mossPayment);
assert.equal(calls.filter(call=>call.method==='eth_requestAccounts').length,requestsBefore+1,'a linked wallet with lost browser permission opens a connection request');assert.equal(sends().length,before+1,'purchase continues after permission for the exact linked wallet is restored');
// Native option menus belong to their select node; replacing it interrupts one-click selection.
ui.close();ui.update(mossState({listings:[...market,mossRow]}));await readyWallet();
for(const selector of ['#auction-category','#auction-currency']){
  const control=find(selector);control.focus();
  for(let tick=0;tick<3;tick++){ui.update(mossState({open:false,listings:[...market,mossRow]}));assert(find(selector)===control,`${selector} survives repeated market broadcasts`);}
  const latest={...cheap,id:`new-${selector.slice(1)}`};
  ui.update(mossState({open:false,listings:[...market,mossRow,latest]}));assert(find(selector)===control,`${selector} survives changed listings`);
  find('#auction-title').focus();ui.update(mossState({open:false,listings:[...market,mossRow,latest]}));
  assert(find(`[data-listing="${latest.id}"]`),'the next broadcast after leaving a selector renders the latest snapshot');
}
click('[data-auction-tab="sell"]');click('[data-sell-choice="resource:wood"]');
const sellCurrency=find('[name="currency"]');sellCurrency.value='gold';sellCurrency.onchange();
find('[name="quantity"]').value='5';find('[name="quantity"]').oninput();find('[name="price"]').value='123';find('[name="price"]').oninput();sellCurrency.focus();
for(let tick=0;tick<3;tick++){ui.update(mossState({open:false,listings:[...market,mossRow]}));assert(find('[name="currency"]')===sellCurrency,'Selling Currency survives repeated broadcasts');}
ui.update(mossState({open:false,listings:[...market,{...mossRow,price:'15'}]}));
assert(find('[name="currency"]')===sellCurrency,'Selling Currency survives changed competition');
player={...player,inventory:{...player.inventory,wood:3}};ui.refresh();
assert(find('[name="currency"]')===sellCurrency,'bag refresh preserves an open currency selector');
sellCurrency.value='moss';sellCurrency.onchange();
assert.equal(find('[name="currency"]').value,'moss','one change selects MOSS');assert.equal(find('[name="price"]').value,'123');
find('[name="price"]').focus();ui.refresh();
assert.equal(find('[name="currency"]').value,'moss');assert.equal(find('[name="price"]').value,'123','deferred refresh retains the stack price');
assert.equal(find('[name="quantity"]').value,'5','typing never silently rewrites the stack quantity');assert(find('[data-auction-submit]').disabled,'inventory changes revalidate a focused draft');
find('#auction-title').focus();ui.refresh();
assert.equal(find('[name="quantity"]').value,'3','deferred refresh applies the latest available quantity');
const focusedCurrency=find('[name="currency"]');focusedCurrency.focus();assert(!find('[data-auction-submit]').disabled);
ui.update(mossState({open:false,crypto:{...state().crypto,moss:{enabled:false,reason:unavailable}}}));
assert(find('[name="currency"]')===focusedCurrency);assert(find('[data-auction-submit]').disabled,'disabled MOSS market still blocks submission while a selector is focused');
before=sent.length;find('#auction-sell').onsubmit({preventDefault(){}});assert.equal(sent.length,before);assert.equal(find('#auction-status').textContent,unavailable);
ui.update(mossState({open:false}));assert(!find('[data-auction-submit]').disabled);find('#auction-sell').onsubmit({preventDefault(){}});
assert.equal(sent.at(-1).currency,'moss');assert.equal(sent.at(-1).price,'123');assert.equal(sent.at(-1).item.quantity,3);
const dropdownSale={...mossRow,id:'dropdown-sale',sellerId:player.id,item:{...mossRow.item,quantity:3},price:'123'};
ui.update(mossState({open:false,listings:[mossRow,dropdownSale],mine:[dropdownSale],reason:'Listed Timber for 123 MOSS.'}));
assert.equal(find('[name="price"]').value,'','confirmed listing clears a draft even while Currency is focused');assert.equal(find('[name="quantity"]').value,'1');
ui.update(mossState({open:false,listings:[mossRow,dropdownSale],mine:[dropdownSale]}));assert.equal(find('[name="price"]').value,'','later broadcasts cannot restore the cleared price');
ui.close();
// Native gameplay keeps earned-gold trading and never offers a crypto checkout.
window.__MOSSVALE_NATIVE__=true;
const nativeWalletCalls=calls.length;
ui.update(mossState({listings:[...market,mossRow],mine:[own,dropdownSale],sold:sales}));
assert(!find('[data-auction-wallet]'));
assert(!find('#auction-currency').innerHTML.includes('value="moss"'));
assert(!find(`[data-listing="${mossRow.id}"]`));
assert(find(`[data-listing="${cheap.id}"]`),'earned-gold listings remain usable');
click('[data-auction-tab="sold"]');assert.equal(find('.auction-sales-table').querySelectorAll('[data-auction-sale]').length,3,'native retains read-only receipts in all currencies');assert(!find('[data-auction-withdraw-moss]'),'native sale history does not expose wallet actions');
click('[data-auction-tab="sell"]');
assert(!find('[name="currency"]').innerHTML.includes('value="moss"'));
assert.equal(find('[name="currency"]').value,'gold','native switches away from saved crypto drafts');
assert.match(find('#auction-sell-wallet-note').textContent,/Mobile auctions use earned gold/);
assert.equal(calls.length,nativeWalletCalls,'native browsing never calls the wallet');
ui.close();delete window.__MOSSVALE_NATIVE__;
// Opening automatically starts the ownership link, but still waits for the wallet approval.
let linkFailure,linkHold;const chosenCalls=[];chosenProvider={mossvaleWallet:true,request:async request=>{
  chosenCalls.push(request.method);if(request.method==='personal_sign'){if(linkHold)await linkHold;if(linkFailure)throw linkFailure;}return rpc(request);
}};
const opensBefore=walletOpens,linkMessages=sent.length;
ui.update(mossState({wallet:null}));
await until(()=>sent.at(-1)?.type==='auctionWalletChallenge','automatic ownership link');
assert(!find('[data-auction-wallet]'),'automatic setup removes the separate enable button');
assert.equal(walletOpens,opensBefore+1);assert.equal(sent.length,linkMessages+1,'opening requests only the ownership challenge');
ui.update(mossState({wallet:null,open:false}));ui.refresh();
assert.equal(sent.length,linkMessages+1,'passive updates do not duplicate a pending link');
assert(!chosenCalls.some(method=>['personal_sign','eth_sendTransaction'].includes(method)),'preparation has no financial or ownership signature');
await ui.walletChallenge({type:'auctionWalletChallenge',address:buyer.address,message:'link game-account wallet',expiresAt:Date.now()+60000});
assert.equal(walletOpens,opensBefore+1,'linking reuses the prepared game-account provider');assert(chosenCalls.includes('personal_sign'),'automatic linking still asks for ownership approval');
assert.equal(sent.at(-1).type,'auctionWalletBind');ui.update(mossState({open:false}));await readyWallet();
const linkedMessages=sent.length;ui.update(mossState());await delay(30);assert.equal(sent.length,linkedMessages,'matching linked wallet needs no new ownership challenge');
ui.close();linkFailure=Object.assign(Error('Wallet link declined.'),{code:4001});
ui.update(mossState({wallet:null}));await until(()=>sent.at(-1)?.type==='auctionWalletChallenge','link before declining approval');
await ui.walletChallenge({type:'auctionWalletChallenge',address:buyer.address,message:'declined link',expiresAt:Date.now()+60000});
assert.match(find('#auction-status').textContent,/declined/);const declinedMessages=sent.length;
ui.update(mossState({wallet:null,open:false}));ui.refresh();await delay(30);
assert.equal(sent.length,declinedMessages,'passive refresh does not repeat a declined ownership prompt');
click('[data-auction-refresh]');assert.equal(sent.at(-1).type,'auctionOpen');
linkFailure=undefined;ui.update(mossState({wallet:null}));await until(()=>sent.at(-1)?.type==='auctionWalletChallenge','explicit market refresh retries the link');
assert.equal(sent.length,declinedMessages+2,'one refresh requests one new challenge');
await ui.walletChallenge({type:'auctionWalletChallenge',address:buyer.address,message:'retry link',expiresAt:Date.now()+60000});
assert.equal(sent.at(-1).type,'auctionWalletBind');ui.update(mossState({open:false}));await readyWallet();
for(const cancel of ['close','character change']){
  ui.close();let finishSignature;linkHold=new Promise(resolve=>finishSignature=resolve);
  const beforeLink=sent.length;ui.update(mossState({wallet:null}));await until(()=>sent.length>beforeLink&&sent.at(-1)?.type==='auctionWalletChallenge','link before leaving');
  const signingBefore=chosenCalls.filter(method=>method==='personal_sign').length;
  const signing=ui.walletChallenge({type:'auctionWalletChallenge',address:buyer.address,message:'interrupted link',expiresAt:Date.now()+60000});
  await until(()=>chosenCalls.filter(method=>method==='personal_sign').length>signingBefore,'ownership approval pending');
  const beforeCancel=sent.length,originalPlayer=player;
  if(cancel==='close')ui.close();else player={...player,id:'another-character'};
  finishSignature();await signing;linkHold=undefined;
  assert.equal(sent.length,beforeCancel,`${cancel} during ownership approval prevents a stale wallet bind`);player=originalPlayer;
}
assert(!chosenCalls.includes('eth_sendTransaction'),'automatic setup never purchases, withdraws or pays gas');
ui.close();walletFailure=Error('Wallet connection cancelled.');const failedRpc=calls.length;
ui.update(mossState());await until(()=>find('#auction-status').textContent.includes('cancelled'),'cancelled embedded connection');walletFailure=null;
assert.equal(calls.length,failedRpc,'cancelled connection never opens wallet RPC');
const failedOpens=walletOpens;ui.update(mossState({open:false}));ui.refresh();assert.equal(walletOpens,failedOpens,'passive updates never loop a failed wallet connection');
click('[data-auction-refresh]');ui.update(mossState());await readyWallet();assert.equal(walletOpens,failedOpens+1,'explicit refresh retries a failed connection');ui.close();

// Gold Exchange reuses the live market and reviews the exact fee and net before any message.
const goldRow={...mossRow,id:'30000000-0000-4000-8000-000000000003',item:{kind:'gold',id:'gold',quantity:201},goldFee:2};
const exchangeState=(extra={})=>mossState({economyVersion:1,goldExchangeEnabled:true,listings:[goldRow,cheap],...extra});
ui.update(exchangeState());if(!window.__MOSSVALE_NATIVE__)await readyWallet();assert(!find(`[data-listing="${goldRow.id}"]`),'gold lots stay in their dedicated exchange');
click('[data-auction-tab="exchange"]');assert(find(`[data-listing="${goldRow.id}"]`));assert(!find(`[data-listing="${cheap.id}"]`));
find('[name="goldQuantity"]').value='201';find('[name="goldQuantity"]').oninput();find('[name="mossPrice"]').value='2.5';find('[name="mossPrice"]').oninput();
assert.match(find('#exchange-preview').textContent,/Fee: 2 gold/);assert.match(find('#exchange-preview').textContent,/Buyer receives: 199 gold/);assert.match(find('#exchange-preview').textContent,/Effective rate/);
find('#auction-exchange').onsubmit({preventDefault(){}});assert.deepEqual(sent.at(-1),{type:'auctionList',npcId:sent.at(-1).npcId,item:{kind:'gold',id:'gold',quantity:201},currency:'moss',price:'2.5'});
ui.reject('test complete','auctionList');click(`[data-listing="${goldRow.id}"]`);assert.match(find('#auction-detail').innerHTML,/Buyer receives: <strong>199 gold/);assert.match(find('#auction-detail').innerHTML,/Gross: 201 gold/);assert.match(find('#auction-detail').innerHTML,/Gold is delivered after payment is processed/);
await click('[data-auction-purchase]');assert.equal(sent.at(-1).listingId,goldRow.id);
ui.update(exchangeState({open:false,listings:[{...goldRow,reservation:{buyerId:'buyer',expiresAt:Date.now()-1,processed:true}}]}));assert(!find(`[data-listing="${goldRow.id}"]`),'reserved gold leaves Gold Exchange');click('[data-auction-tab="purchases"]');click(`[data-listing="${goldRow.id}"]`);
assert(!find('[data-auction-purchase]'),'processed gold never offers a duplicate wallet payment');assert(!find('[data-auction-check]'));assert(find('[data-auction-pending]'),'processed state is passive while the server completes delivery');
assert.match(find('#auction-detail').innerHTML,/Payment found\. Checking Gold delivery/);assert.doesNotMatch(find('#auction-detail').innerHTML,/Payment window ended|unpaid reservation/,'Gold confirmation also outranks expiry');
ui.update(exchangeState({open:false,goldExchangeEnabled:false}));click('[data-auction-tab="exchange"]');assert(find('[data-exchange-submit]').disabled,'maintenance gate prevents new listings');
click('[data-auction-tab="sell"]');assert.deepEqual(find('[name="currency"]').querySelectorAll('option').map(node=>node.value),['gold','moss'],'updated economy supports both item currencies');
find('[name="price"]').value='21';find('[name="price"]').oninput();assert.match(find('#auction-unit-preview').textContent,/Fee: 2 gold · You receive: 19 gold/);
player={...player,inventory:{...player.inventory,wood:20}};
click('[data-sell-choice="resource:wood"]');
const typedQuantity=find('[name="quantity"]'),typedPrice=find('[name="price"]'),typedCurrency=find('[name="currency"]');
typedCurrency.value='moss';typedCurrency.onchange();typedQuantity.value='';typedQuantity.oninput();typedQuantity.focus();
ui.update(exchangeState({open:false}));assert.equal(find('[name="quantity"]'),typedQuantity,'refresh preserves the actual number input while clearing it to type');assert.equal(typedQuantity.value,'');
typedQuantity.value='7';typedQuantity.oninput();typedPrice.value='12.500000000000000001';typedPrice.oninput();typedPrice.focus();
for(let i=0;i<5;i++){player.gold++;ui.refresh();ui.update(exchangeState({open:false}));}
assert.equal(find('[name="price"]'),typedPrice,'background updates preserve typed price DOM and caret');assert.equal(find('[name="quantity"]'),typedQuantity);assert.equal(typedPrice.value,'12.500000000000000001');assert.equal(typedCurrency.value,'moss');
ui.update(exchangeState({open:false,crypto:{moss:{enabled:false,reason:'Temporarily offline'}}}));assert(find('[data-auction-submit]').disabled);assert(typedCurrency.querySelector('[value="moss"]').disabled);assert.equal(typedPrice.value,'12.500000000000000001');
ui.update(exchangeState({open:false}));assert(!typedCurrency.querySelector('[value="moss"]').disabled,'MOSS recovers without replacing the focused controls');
find('#auction-sell').onsubmit({preventDefault(){}});assert.equal(sent.at(-1).currency,'moss');assert.equal(sent.at(-1).item.quantity,7);assert.equal(sent.at(-1).price,'12.500000000000000001');ui.reject('test complete','auctionList');
click('[data-auction-tab="exchange"]');
const typedGold=find('[name="goldQuantity"]');typedGold.value='350';typedGold.oninput();typedGold.focus();find('[name="mossPrice"]').value='7.25';find('[name="mossPrice"]').oninput();
ui.update(exchangeState({open:false,goldExchangeEnabled:false}));assert.equal(find('[name="goldQuantity"]'),typedGold);assert(find('[data-exchange-submit]').disabled);
const blockedCount=sent.length;find('#auction-exchange').onsubmit({preventDefault(){}});assert.equal(sent.length,blockedCount,'a live maintenance change blocks submission while typing');
ui.update(exchangeState({open:false}));find('#auction-exchange').onsubmit({preventDefault(){}});assert.equal(sent.at(-1).item.quantity,350);assert.equal(sent.at(-1).price,'7.25');
ui.update(exchangeState({open:false,mine:[{...goldRow,id:'new-gold-lot',sellerId:player.id,item:{kind:'gold',id:'gold',quantity:350},price:'7.25'}],reason:'Listed gold.'}));assert.equal(find('[name="mossPrice"]').value,'','confirmed exchange listing clears its price');assert.equal(find('[name="goldQuantity"]').value,'200');
ui.close();window.__MOSSVALE_NATIVE__=true;ui.update(exchangeState());if(!window.__MOSSVALE_NATIVE__)await readyWallet();assert(!find('[data-auction-tab="exchange"]'),'native never offers crypto exchange');assert(!find('[data-auction-wallet]'));ui.close();delete window.__MOSSVALE_NATIVE__;

// The shipped submit handler protects pet copies and rolled Legendary/Mythic items.
const beforeWarnings=player,warningGear=['epic','legendary','mythic'].map(quality=>rollGear('warden-longbow',quality,()=>.5));
player={...player,ownedGear:[...player.ownedGear,...warningGear.map(gear=>gear.id)],carriedItems:{...player.carriedItems,'fern-lynx':3,'verdant-revenant':2},ownedPets:[]};
const warningState=(extra={})=>state({listings:[],mine:[],crypto:{...state().crypto,moss:mossStatus},...extra});
const editSale=(name,value)=>{const input=find(`[name="${name}"]`);input.value=value;(input.oninput||input.onchange)();};
const acknowledgeSale=()=>{const input=find('[data-sale-ack]');input.checked=true;input.onchange();};
const submitSale=()=>find('#auction-sell').onsubmit({preventDefault(){}});
ui.update(warningState());await readyWallet();click('[data-auction-tab="sell"]');
for(const [key,warning] of [['item:fern-lynx',/unlearned pet.*learn or claim/i],['item:verdant-revenant',/unlearned mount.*learn or mint/i],...warningGear.slice(1).map(gear=>[`gear:${gear.id}`,new RegExp(gear.quality==='legendary'?'Legendary':'Mythic')])]){
  click(`[data-sell-choice="${key}"]`);editSale('price','25');
  assert(!find('#auction-sale-warning').hidden);assert.match(find('#auction-body').innerHTML,warning);
  assert(find('[data-auction-submit]').disabled);const count=sent.length;submitSale();assert.equal(sent.length,count,'unacknowledged protected item cannot submit');
  acknowledgeSale();assert(!find('[data-auction-submit]').disabled);submitSale();assert.equal(sent.length,count+1);assert.equal(sent.at(-1).item.id,key.slice(key.indexOf(':')+1));ui.reject('test complete','auctionList');
}
player.ownedPets=['fern-lynx'];click('[data-sell-choice="item:fern-lynx"]');editSale('currency','gold');editSale('price','25');
assert(find('[data-auction-submit]').disabled,'a learned collection entry does not make a bag copy safe to sell without review');
acknowledgeSale();find('[data-sale-ack]').focus();ui.update(warningState({open:false}));assert(find('[data-sale-ack]').checked,'passive refresh preserves acknowledgement');
find('#auction-title').focus();ui.update(warningState({open:false}));assert(find('[data-sale-ack]').checked,'a full repaint preserves unchanged sale terms');
for(const [name,value] of [['quantity','2'],['price','30'],['currency','moss'],['currency','gold']]){
  editSale(name,value);assert(!find('[data-sale-ack]').checked,`${name} change requires renewed acknowledgement`);const count=sent.length;submitSale();assert.equal(sent.length,count);acknowledgeSale();
}
player.carriedItems['fern-lynx']=1;find('#auction-title').focus();ui.refresh();assert.equal(find('[name="quantity"]').value,'1');assert(!find('[data-sale-ack]').checked,'bag-driven quantity clamp resets acknowledgement');player.carriedItems['fern-lynx']=3;
acknowledgeSale();find('[name="price"]').value='31';const beforeDirectSubmit=sent.length;submitSale();submitSale();assert.equal(sent.length,beforeDirectSubmit,'changed native form values cannot reuse acknowledgement even without an input event');
editSale('price','32');acknowledgeSale();
const petCompetitor={...row,id:'pet-competition',item:{kind:'item',id:'fern-lynx',quantity:1},currency:'gold',price:'20'};
ui.update(warningState({open:false,listings:[petCompetitor]}));click('[data-match-lowest]');assert(!find('[data-sale-ack]').checked,'matching market price requires renewed item review');
editSale('price','1');acknowledgeSale();assert(find('[data-auction-submit]').disabled,'item acknowledgement does not bypass the separate low-price warning');find('[data-price-ack]').checked=true;find('[data-price-ack]').onchange();assert(!find('[data-auction-submit]').disabled);
submitSale();const petListing={...petCompetitor,id:'confirmed-pet-sale',sellerId:player.id,price:'1'};ui.update(warningState({open:false,listings:[petCompetitor,petListing],mine:[petListing]}));assert(!find('[data-sale-ack]').checked,'confirmed listing clears item acknowledgement');
for(const key of [`gear:${warningGear[0].id}`,'item:trail-bread','resource:wood']){
  click(`[data-sell-choice="${key}"]`);editSale('price','25');assert(find('#auction-sale-warning').hidden,'ordinary items do not require protected-item review');assert(!find('[data-auction-submit]').disabled);
}
click('[data-sell-choice="item:fern-lynx"]');assert(!find('[data-sale-ack]').checked,'switching items cannot reuse an old acknowledgement');
ui.close();player=beforeWarnings;
const inspectGear={...row,id:'inspect-roll',item:{kind:'gear',id:warningGear[0].id,quantity:1},currency:'gold',price:'25'};
ui.update(state({listings:[inspectGear]}));click('[data-auction-tab="browse"]');click('[data-search-reset]');click('[data-listing="inspect-roll"]');
const rollDetails=find('[data-item-roll]'),rollSummary=rollDetails.querySelector('summary'),rollBody=rollDetails.querySelector('.item-roll-body');
rollDetails.open=true;rollBody.scrollTop=37;rollSummary.focus();
// Parsed child nodes do not retain serialized innerHTML in this small fixture; force the changed-content path.
rollDetails.html='previous displayed roll details';
ui.update(state({open:false,listings:[inspectGear]}));
assert.equal(find('[data-item-roll]'),rollDetails,'a refreshed gear inspection retains its native disclosure');
assert.equal(rollDetails.querySelector('summary'),rollSummary);assert.equal(document.activeElement,rollSummary);assert(rollDetails.open);
assert.notEqual(rollDetails.querySelector('.item-roll-body'),rollBody,'changed roll content transfers replacement nodes');
assert.equal(rollDetails.querySelector('.item-roll-body').scrollTop,37,'changed roll content keeps the reader scroll');
for(const auctioneer of AUCTIONEERS){
 ui.close();ui.update(marketState({npcId:auctioneer.id,open:true}));assert(ui.isOpen());assert(panel.innerHTML.includes(auctioneer.cityName+' Auction House'));assert(panel.innerHTML.includes(auctioneer.name));
 click('[data-auction-refresh]');assert.equal(sent.at(-1).npcId,auctioneer.id,'all city market requests use the displayed local NPC');
}
ui.close();ui.update(marketState({npcId:'forged-auctioneer',open:true}));assert(!ui.isOpen(),'unknown auction identities cannot open the window');
// Tax quotes follow the verified split settlement, never legacy or historical prices.
const taxedStatus={...mossStatus,taxBps:500,treasury:authority.address,devTeam:'0x6D96b833C760774175Cc6E2c4F7424122EA3798f'};
const taxedRow={...mossRow,price:'100'};
const taxedState=(extra={})=>mossState({economyVersion:1,goldExchangeEnabled:true,listings:[taxedRow,goldRow],crypto:{...state().crypto,moss:taxedStatus},...extra});
const hundredSplit='Auction tax (5%): 5 MOSS · Seller receives: 95 MOSS · Burn: 4 MOSS · Treasury: 0.5 MOSS · Dev team: 0.5 MOSS';
ui.close();ui.update(taxedState());await readyWallet();click(`[data-listing="${taxedRow.id}"]`);
assert(find('#auction-detail').innerHTML.includes(hundredSplit));
assert.match(find('#auction-detail').innerHTML,/auction-buyout">100 MOSS/,'buyer pays the listed total without an added surcharge');
for(const legacyStatus of [mossStatus,{...mossStatus,taxBps:500,treasury:authority.address}]){
  ui.update(taxedState({open:false,crypto:{...state().crypto,moss:legacyStatus}}));
  assert.doesNotMatch(find('#auction-detail').innerHTML,/Auction tax/,'legacy and treasury-only settlements never claim the new split');
}
for(const reservation of [{buyerId:'buyer',expiresAt:Date.now()+60000},{buyerId:'buyer',expiresAt:Date.now()+60000,order:{...mossOrder,contract}}]){
  ui.update(taxedState({open:false,listings:[{...taxedRow,reservation}]}));click('[data-auction-tab="purchases"]');click(`[data-listing="${taxedRow.id}"]`);
  assert.doesNotMatch(find('#auction-detail').innerHTML,/Auction tax/,'unknown or legacy reserved payments retain their original terms');
}
const oldReferralContract='0xb13AB13Df2d0Ab0F740cf11D882680501150c652';
const migratedMarket={...taxedStatus,contract:'0x930f178ca4818a2ae2e97b96f3574f22e509a520',referralsEnabled:true,feeVersion:2,previousContracts:[oldReferralContract]};
// Public summaries omit orders; even a retained old order must never use the new market's split.
for(const oldOrder of [undefined,...[0,500,1000].map(rate=>({...referralOrders.get(rate),contract:oldReferralContract}))]){
  const reservation={buyerId:'buyer',expiresAt:Date.now()+60000,...(oldOrder?{order:oldOrder}:{})};
  ui.update(taxedState({open:false,listings:[{...taxedRow,reservation}],crypto:{...state().crypto,moss:migratedMarket}}));
  assert(find('[data-auction-pending]')&&!find('[data-auction-purchase]'),'old referral reservations remain passive after volume-market activation');
  assert.doesNotMatch(find('#auction-detail').innerHTML,/Auction tax|Seller receives|Burn:|Referral:/,'V2 market settings never rewrite an unknown or old b13 reservation split');
}
ui.update(taxedState({open:false,listings:[{...taxedRow,reservation:{buyerId:'buyer',expiresAt:Date.now()+60000,order:mossOrder}}]}));
assert(find('#auction-detail').innerHTML.includes(hundredSplit),'known current-contract reservation keeps its quote');
for(const [referralBps,burn,reward] of [[500,'3.8','0.2'],[1000,'3.6','0.4']]){
  const order={...referralOrders.get(referralBps),priceWei:parseEther(taxedRow.price).toString()};
  ui.update(taxedState({open:false,listings:[{...taxedRow,reservation:{buyerId:'buyer',expiresAt:Date.now()+60000,order}}],crypto:{...state().crypto,moss:{...taxedStatus,referralsEnabled:true}}}));
  assert(find('#auction-detail').innerHTML.includes(`Seller receives: 95 MOSS · Burn: ${burn} MOSS · Treasury: 0.5 MOSS · Dev team: 0.5 MOSS · Referral: ${reward} MOSS (${referralBps/100}% of burn share)`),'signed referral reward comes only from the burn share');
}
for(const [referralBps,burn,reward] of [[10,'2.4','0.1'],[25,'2.25','0.25'],[50,'2','0.5'],[75,'1.75','0.75'],[100,'1.5','1']]){
  const order={...referralOrders.get(referralBps),priceWei:parseEther(taxedRow.price).toString()};
  ui.update(taxedState({open:false,listings:[{...taxedRow,reservation:{buyerId:'buyer',expiresAt:Date.now()+60000,order}}],crypto:{...state().crypto,moss:{...taxedStatus,referralsEnabled:true,feeVersion:2}}}));
  assert(find('#auction-detail').innerHTML.includes(`Seller receives: 95 MOSS · Burn: ${burn} MOSS · Treasury: 1.25 MOSS · Dev team: 1.25 MOSS · Referral: ${reward} MOSS (${referralBps/100}% of purchase price)`),'new runtime discloses exact volume rewards');
}
ui.update(taxedState({open:false,crypto:{...state().crypto,moss:{...taxedStatus,referralsEnabled:true}}}));click('[data-auction-tab="browse"]');click(`[data-listing="${taxedRow.id}"]`);
assert(find('#auction-detail').innerHTML.includes('Eligible referral rewards come from the burn share.'),'unreserved price explains potential referral allocation');
click('[data-auction-tab="sell"]');click('[data-sell-choice="resource:wood"]');find('[name="currency"]').value='moss';find('[name="currency"]').onchange();
assert.match(find('#auction-sell-wallet-note').textContent,/80% for burning and eligible referrals, 10% treasury, 10% dev team/);
ui.update(taxedState({open:false,sold:sales}));click('[data-auction-tab="sold"]');
assert.doesNotMatch(find('#auction-body').innerHTML,/Auction tax|11\.875000000000000001/,'current configuration never rewrites historical receipts');
click('[data-auction-tab="sell"]');click('[data-sell-choice="resource:wood"]');
find('[name="currency"]').value='moss';find('[name="currency"]').onchange();
find('[name="price"]').value='12.500000000000000001';find('[name="price"]').oninput();
assert.equal(find('#auction-tax-preview').textContent,'Auction tax (5%): 0.625 MOSS · Seller receives: 11.875000000000000001 MOSS · Burn: 0.5 MOSS · Treasury: 0.0625 MOSS · Dev team: 0.0625 MOSS','seller preview retains token precision');
assert(!find('#auction-tax-preview').hidden);
assert.match(find('#auction-sell-wallet-note').textContent,/5% tax is split: 80% burned, 10% treasury, 10% dev team/);
for(const [amount,tax,proceeds,burn,share] of [
  ['0.000000000000000019','0','0.000000000000000019','0','0'],
  ['0.000000000000000020','0.000000000000000001','0.000000000000000019','0.000000000000000001','0'],
  ['0.000000000000000200','0.00000000000000001','0.00000000000000019','0.000000000000000008','0.000000000000000001'],
]){
  find('[name="price"]').value=amount;find('[name="price"]').oninput();
  assert.equal(find('#auction-tax-preview').textContent,`Auction tax (5%): ${tax} MOSS · Seller receives: ${proceeds} MOSS · Burn: ${burn} MOSS · Treasury: ${share} MOSS · Dev team: ${share} MOSS`,'dust split displays exact base units');
  assert.equal(parseEther(proceeds)+parseEther(burn)+2n*parseEther(share),parseEther(amount),'displayed split conserves every token unit');
}
find('[name="price"]').value='invalid';find('[name="price"]').oninput();
assert(find('#auction-tax-preview').hidden,'invalid drafts have no fabricated fee');
find('[name="price"]').value='100';find('[name="price"]').oninput();
ui.update(taxedState({open:false,crypto:{...state().crypto,moss:mossStatus}}));
assert(find('#auction-tax-preview').hidden,'legacy seller drafts have no tax quote');
assert.doesNotMatch(find('#auction-sell-wallet-note').textContent,/5% tax is split/);
ui.update(taxedState({open:false}));click('[data-auction-tab="exchange"]');
find('[name="goldQuantity"]').value='201';find('[name="goldQuantity"]').oninput();find('[name="mossPrice"]').value='100';find('[name="mossPrice"]').oninput();
assert.match(find('#exchange-preview').textContent,/Fee: 2 gold · Buyer receives: 199 gold/);
assert(find('#exchange-preview').textContent.includes(hundredSplit),'gold lot sellers also review the MOSS tax split');
click(`[data-listing="${goldRow.id}"]`);assert(find('#auction-detail').innerHTML.includes('Auction tax (5%): 0.625 MOSS · Seller receives: 11.875 MOSS · Burn: 0.5 MOSS · Treasury: 0.0625 MOSS · Dev team: 0.0625 MOSS'));
ui.close();
// A linked external address cannot authorize the embedded wallet to list, buy or sell gold.
selectedWallet=seller.address;const mismatchStart=calls.length,mismatchMessages=sent.length;
ui.update(exchangeState({listings:[mossRow,goldRow]}));await until(()=>sent.at(-1)?.type==='auctionWalletChallenge','different embedded address requests a guarded link');
assert.equal(sent.at(-1).wallet,seller.address);
await ui.walletChallenge({type:'auctionWalletChallenge',address:seller.address,message:'review wallet change',expiresAt:Date.now()+60000});
assert.equal(sent.at(-1).type,'auctionWalletBind');ui.reject('Finish your wallet listings and payments before changing wallets.','auctionWalletBind');
assert.match(find('#auction-wallet-note').attributes.title,/Verifying this wallet moves your unsold listings/,'wallet mismatch explains automatic listing migration');
assert.doesNotMatch(find('#auction-wallet-note').attributes.title,/cancel old auctions/,'migration never instructs players to cancel available listings');
click(`[data-listing="${mossRow.id}"]`);assert(find('[data-auction-purchase]').disabled);
find('[data-auction-purchase]').onclick?.();assert.equal(sent.length,mismatchMessages+2,'a forced buy click cannot bypass wallet ownership mismatch');
click('[data-auction-tab="sell"]');click('[data-sell-choice="resource:wood"]');
find('[name="currency"]').value='moss';find('[name="currency"]').onchange();find('[name="price"]').value='50';find('[name="price"]').oninput();
assert(find('[data-auction-submit]').disabled);find('#auction-sell').onsubmit({preventDefault(){}});
click('[data-auction-tab="exchange"]');find('[name="goldQuantity"]').value='201';find('[name="goldQuantity"]').oninput();find('[name="mossPrice"]').value='5';find('[name="mossPrice"]').oninput();
assert(find('[data-exchange-submit]').disabled);find('#auction-exchange').onsubmit({preventDefault(){}});
assert.equal(sent.length,mismatchMessages+2,'wrong embedded address cannot create item or gold listings');
assert(!calls.slice(mismatchStart).some(call=>call.method==='eth_sendTransaction'),'rejected wallet change never pays');ui.close();selectedWallet=buyer.address;
// The direct-entry boundary still rejects an accidentally returned external provider.
chosenProvider={request:rpc};const externalRpc=calls.length;
ui.update(mossState());await until(()=>find('#auction-status').textContent.includes('requires Mossvale Wallet'),'external provider rejected');
click(`[data-listing="${mossRow.id}"]`);assert(find('[data-auction-purchase]').disabled);assert.equal(calls.length,externalRpc,'external providers never receive auction RPC');ui.close();
chosenProvider={mossvaleWallet:true,request:rpc};
for(const cancellation of ['close','logout']){
  let resumeWallet;walletHold=new Promise(resolve=>resumeWallet=resolve);const count=walletOpens,rpcCount=calls.length,messageCount=sent.length,previousPlayer=player;
  ui.update(mossState());assert.equal(walletOpens,count+1,'opening starts one embedded connection');const signal=walletSignals.at(-1);assert(!signal.aborted);
  ui.update(mossState({open:false}));assert.equal(walletOpens,count+1,'broadcasts cannot duplicate wallet preparation');
  if(cancellation==='logout'){player=undefined;ui.refresh();}else ui.close();
  assert(signal.aborted,`${cancellation} cancels the pending direct wallet opening`);resumeWallet();walletHold=null;await delay(30);
  assert(panel.hidden);assert.equal(calls.length,rpcCount,`${cancellation} before provider resolution prevents RPC`);assert.equal(sent.length,messageCount,`${cancellation} prevents late ownership or trade messages`);player=previousPlayer;
}
// Empty embedded wallets must reach their funding callback before ethers tries to estimate gas.
assert(!calls.some(call=>call.method==='eth_estimateGas'),'every auction payment uses the embedded provider before fee estimation');
const embeddedCalls=[];
chosenProvider={mossvaleWallet:true,request:request=>{
  embeddedCalls.push(structuredClone(request));
  assert.notEqual(request.method,'eth_estimateGas','embedded payments must not estimate before the wallet funds gas');
  return rpc(request);
}};
ui.update(mossState());await readyWallet();
tokenAllowance=0n;await selectMoss();await ui.payment(mossPayment);
assert.equal(sent.at(-1).type,'auctionPaymentCheck',find('#auction-status').textContent);
const embeddedSends=()=>embeddedCalls.filter(call=>call.method==='eth_sendTransaction');
assert.equal(embeddedSends().length,1,'embedded wallet submits one atomic approval and purchase without fee estimation');
const request=embeddedSends()[0],actual=request.params[0],expected=mossOrder.transaction;
assert.equal(actual.from.toLowerCase(),buyer.address.toLowerCase());
assert.equal(actual.to.toLowerCase(),expected.to.toLowerCase());assert.equal(actual.data,expected.data);
assert.equal(BigInt(actual.value),0n);assert.equal(BigInt(actual.chainId),4663n);
assert.deepEqual(actual.approval,{to:mossOrder.approval.to,data:mossOrder.approval.data,value:'0'});
assert.deepEqual(request.auctionPurchase,{item:mossRow.item,listingId:mossRow.id,contract:mossContract,price:mossRow.price},'one Buy review receives the exact item and MOSS price');
assert(!Object.hasOwn(actual,'auctionPurchase'),'display context stays outside RPC transaction fields');
ui.update(mossState());await readyWallet();click('[data-auction-withdraw-moss]');
await until(()=>/MOSS withdrawn/.test(find('#auction-status').textContent),'embedded withdrawal receipt');
assert.equal(embeddedSends().length,2,'embedded proceeds withdrawal also reaches the funding-capable provider directly');
assert.equal(abi.decodeFunctionData('withdraw',embeddedSends().at(-1).params[0].data)[0],buyer.address);
assert(!Object.hasOwn(embeddedSends().at(-1).params[0],'approval'),'withdrawals are never batched');
assert(!Object.hasOwn(embeddedSends().at(-1),'auctionPurchase'),'proceeds withdrawal is not presented as an auction purchase');
assert(embeddedCalls.filter(call=>call.method!=='eth_sendTransaction').every(call=>!Object.hasOwn(call,'auctionPurchase')),'read and ownership requests carry no purchase context');
assert(!embeddedCalls.some(call=>call.method==='eth_estimateGas'),'no embedded action estimates gas ahead of funding');
ui.close();
// Compact layouts relocate the same inspected listing and Buy action; responsive changes never transact.
let compactChange;
const compactMedia={matches:true,addEventListener(type,callback){if(type==='change')compactChange=callback;}};
window.matchMedia=()=>compactMedia;
const compactMessages=[],compactRpc=calls.length;
const compactUI=mountAuctionUI({send:message=>compactMessages.push(structuredClone(message)),getPlayer:()=>player,onOpen(){},nearby:()=>true});
const compactPanel=document.body.querySelectorAll('#auction-window').at(-1),compactFind=selector=>compactPanel.querySelector(selector);
const compactRow={...row,currency:'gold',price:'5'};
const compactState=state({listings:[compactRow],crypto:{enabled:false,moss:{enabled:false}},wallet:null});
compactUI.update(compactState);
compactFind(`[data-listing="${row.id}"]`).onclick({preventDefault(){}});
let compactDetail=compactFind('#auction-detail');
assert(compactDetail.parentElement.matches('[data-auction-inline-host]'),'mobile inspection is directly beneath the selected listing');
assert.equal(compactPanel.querySelectorAll('[data-auction-purchase]').length,1,'responsive layout never duplicates the purchase action');
compactUI.update({...compactState,open:false});
compactDetail=compactFind('#auction-detail');
assert(compactDetail.parentElement.matches('[data-auction-inline-host]'),'snapshots retain inline inspection');
compactMedia.matches=false;compactChange();
assert.equal(compactFind('#auction-detail'),compactDetail,'desktop resize retains the same detail node');
assert.equal(compactDetail.parentElement,compactFind('#auction-results').parentElement,'desktop inspection returns to the right column');
compactMedia.matches=true;compactChange();
assert(compactDetail.parentElement.matches('[data-auction-inline-host]'),'mobile resize restores inline inspection');
compactFind(`[data-listing="${row.id}"]`).onclick({preventDefault(){}});
assert.equal(compactPanel.querySelectorAll('[data-auction-purchase]').length,0,'a second mobile row click collapses its detail');
assert.equal(compactMessages.length,0,'selection, snapshots and responsive changes do not submit requests');
assert.equal(calls.length,compactRpc,'Gold-only inspection never touches a wallet provider');
compactUI.close();
console.log('Auction compact layout: one inline detail/action, snapshot retention, desktop/mobile relocation and tap-to-collapse passed without requests or wallet RPC.');

console.log('Gold Exchange UI: dedicated market, whole-lot listing, fee/net/effective-rate review, processed delivery state, duplicate-payment guard, maintenance flag, gold/MOSS item listings, uninterrupted typed amounts and native restrictions passed.');

console.log('Auction UI passed: shopping filters/history/saved items; exact unit/total matching; carried items; undercut filtering; focus/scroll/drafts; price acknowledgement; pet and Legendary/Mythic sale acknowledgement with term-change resets; competing-buyer race and server-confirmed outcomes; nonmodal keys; all payment, wallet, network and withdrawal guards; one atomic exact MOSS approval and purchase, insufficient balance, pre-submit state changes, legacy journal recovery and MOSS-only offerings/status with legacy escrow cancellation. Wallet RPC was simulated; no funds sent.');
