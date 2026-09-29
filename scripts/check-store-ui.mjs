import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Wallet, Interface, TypedDataEncoder, id, parseEther, MaxUint256 } from 'ethers';
globalThis.__storeAccessToken = async () => { throw Error('Desktop browsing must not request native checkout authentication'); };
const hook=registerHooks({
  resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);},
  load(url,context,next){return url.endsWith('/src/wallet-provider.ts')?{format:'module',shortCircuit:true,source:'export const chooseWallet = () => globalThis.__chooseWallet();'}:url.endsWith('/src/auth.ts')?{format:'module',shortCircuit:true,source:'export const getAccessToken = () => globalThis.__storeAccessToken();'}:next(url,context);},
});
const {mountStoreUI,validateStorePayment,renderStoreBoosts}=await import('../src/store-ui.ts');
const {MOSS_TOKEN}=await import('../src/auction.ts');
const {STORE_PRODUCTS, MOBILE_STORE_SKUS, BOOST_PRODUCTS, STORE_BOOST_DURATION_MS, storePlayerValid, storeRewardChanges, storeActivationChanges, storeBoostMultiplier, storeCosmeticPool}=await import('../src/ingame-store.ts');
hook.deregister();
const buyer=Wallet.createRandom(),authority=Wallet.createRandom(),contract=Wallet.createRandom().address;
const storeABI=new Interface(['function buy((bytes32 orderId,bytes32 productId,bytes32 characterId,address buyer,uint256 amountWei,uint256 usdCents,uint64 deadline) order,bytes signature)']);
const tokenABI=new Interface(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)']);
const terms={productId:'store-embermane',characterId:'character-a',wallet:buyer.address,contract};
const order={id:'10000000-0000-4000-8000-000000000001',...terms,chainId:4663,token:MOSS_TOKEN.address,mossAmount:'123.456789012345678901',amountWei:parseEther('123.456789012345678901').toString(),usdPrice:40,quotedAt:Date.now(),expiresAt:(Math.floor(Date.now()/1000)+300)*1000,status:'quoted'};
const contractOrder={orderId:id('mossvale-store:'+order.id),productId:id(order.productId),characterId:id(order.characterId),buyer:order.wallet,amountWei:order.amountWei,usdCents:4000,deadline:order.expiresAt/1000};
const types={Order:[{name:'orderId',type:'bytes32'},{name:'productId',type:'bytes32'},{name:'characterId',type:'bytes32'},{name:'buyer',type:'address'},{name:'amountWei',type:'uint256'},{name:'usdCents',type:'uint256'},{name:'deadline',type:'uint64'}]};
const domain={name:'MossvaleStore',version:'1',chainId:4663,verifyingContract:contract};
order.signature=await authority.signTypedData(domain,types,contractOrder);order.orderHash=TypedDataEncoder.hash(domain,types,contractOrder);order.contractOrder=contractOrder;
order.transaction={to:contract,data:storeABI.encodeFunctionData('buy',[contractOrder,order.signature]),value:'0x0',chainId:'0x1237'};
order.approval={to:MOSS_TOKEN.address,data:tokenABI.encodeFunctionData('approve',[contract,order.amountWei]),value:'0x0',chainId:'0x1237'};
const clean=await validateStorePayment(order,terms);assert.equal(clean.to,contract);assert.equal(tokenABI.decodeFunctionData('approve',clean.approval.data)[1],BigInt(order.amountWei));
for(const change of [{id:'not-an-order'},{productId:'burned'},{characterId:'other'},{wallet:authority.address},{contract:authority.address},{token:authority.address},{chainId:1},{usdPrice:1},{amountWei:'1'},{mossAmount:'123.4'},{expiresAt:1},{quotedAt:Date.now()+60_000},{orderHash:id('wrong')},{signature:'0x00'},{status:'processed'},{status:'delivered'},{transactionHash:id('already')},{reward:{kind:'boost',boostId:'damage',grantedAt:order.quotedAt}},
{transaction:{...order.transaction,to:authority.address}},{transaction:{...order.transaction,data:'0x1234'}},{transaction:{...order.transaction,value:'0x1'}},{transaction:{...order.transaction,chainId:'0x1'}},
{approval:{...order.approval,to:authority.address}},{approval:{...order.approval,data:tokenABI.encodeFunctionData('approve',[contract,MaxUint256])}},{approval:{...order.approval,value:'0x1'}},{approval:{...order.approval,chainId:'0x1'}}])await assert.rejects(validateStorePayment({...order,...change},terms));
assert.deepEqual(Object.keys((await validateStorePayment({...order,transaction:{...order.transaction,gasPrice:'0xffff',from:authority.address}},terms))).sort(),['approval','chainId','data','to','value']);
const paymentBlock={hash:id('processed-block'),number:'0x1234'};
await assert.rejects(validateStorePayment({...order,paymentBlock},terms),'a quote with a recorded payment block cannot be burned again');
const savedPlayer=(status,granted,block)=>({id:order.characterId,storeOrders:[{...order,status,...(block===undefined?{}:{paymentBlock:block})}],storePurchases:granted?[order.productId]:[],ownedMounts:granted?[order.productId]:[],ownedPets:[]});
assert(storePlayerValid(savedPlayer('quoted',false)));
assert(storePlayerValid(savedPlayer('processed',true,paymentBlock)),'processed payment grants an entitlement');
assert(storePlayerValid(savedPlayer('delivered',true)),'legacy delivered orders need no block migration');
assert(storePlayerValid(savedPlayer('delivered',true,paymentBlock)));
for(const status of ['quoted','submitted','expired'])assert(!storePlayerValid(savedPlayer(status,true,paymentBlock)),`${status} cannot own store rewards`);
assert(!storePlayerValid(savedPlayer('processed',false,paymentBlock)),'processed order must have its entitlement');
assert(!storePlayerValid(savedPlayer('delivered',false)),'delivered order must have its entitlement');
assert(!storePlayerValid(savedPlayer('processed',true)),'processed rewards require a payment block');
for(const block of [null,[],{}, {...paymentBlock,extra:true},{hash:'0x00',number:'0x1'},{hash:'0x'+'0'.repeat(64),number:'0x1'},
  ...['0x','0x00','0x01','0X1','1','0x-1','0x1g',1].map(number=>({...paymentBlock,number}))]) {
  assert(!storePlayerValid(savedPlayer('processed',true,block)),'malformed provisional payment block');
  assert(!storePlayerValid(savedPlayer('delivered',true,block)),'malformed finalized payment block');
}
const repeatOrder = (productId, number = 2) => {
  const product = STORE_PRODUCTS.find(item => item.id === productId);
  return {...structuredClone(order), id:`10000000-0000-4000-8000-${String(number).padStart(12,'0')}`, productId, usdPrice:product.usdPrice,
    contractOrder:{...order.contractOrder,productId:id(productId),usdCents:String(product.usdPrice*100)},paymentBlock,status:'delivered'};
};
const boostHero = {...savedPlayer('delivered',true,paymentBlock),storeConsumables:{},storeBoosts:{}};
for(const product of BOOST_PRODUCTS) {
  const receipt=repeatOrder(product.id,boostHero.storeOrders.length+1), first=storeRewardChanges(boostHero,receipt,order.quotedAt);
  assert.throws(()=>storeRewardChanges(boostHero,{...receipt,status:'processed'},order.quotedAt),'provisional boosts cannot be consumed');
  Object.assign(boostHero,first.changes); receipt.reward=first.reward; boostHero.storeOrders.push(receipt);
  assert(storePlayerValid(boostHero)); assert.equal(storeBoostMultiplier(boostHero,product.boostId,order.quotedAt),1,'delivery waits for activation');
  const secondReceipt=repeatOrder(product.id,boostHero.storeOrders.length+1), second=storeRewardChanges(boostHero,secondReceipt,order.quotedAt);
  Object.assign(boostHero,second.changes); secondReceipt.reward=second.reward; boostHero.storeOrders.push(secondReceipt);
  Object.assign(boostHero,storeActivationChanges(boostHero,product.boostId,order.quotedAt));
  assert.equal(boostHero.storeBoosts[product.boostId],order.quotedAt+STORE_BOOST_DURATION_MS);
  assert.equal(boostHero.storeConsumables[product.boostId],1); assert(storePlayerValid(boostHero));
  Object.assign(boostHero,storeActivationChanges(boostHero,product.boostId,order.quotedAt+1000));
  assert.equal(boostHero.storeBoosts[product.boostId],order.quotedAt+STORE_BOOST_DURATION_MS*2,'same boost extends time');
  assert.equal(storeBoostMultiplier(boostHero,product.boostId,order.quotedAt),product.boostId.includes('xp')?1.5:1.2);
  assert.equal(storeBoostMultiplier(boostHero,product.boostId,order.quotedAt+STORE_BOOST_DURATION_MS*2),1,'expires at exact boundary');
  assert.equal(storeActivationChanges(boostHero,product.boostId),null,'spent charges cannot activate'); assert(storePlayerValid(boostHero));
  assert.throws(()=>storeRewardChanges(boostHero,receipt),'receipt cannot deliver twice');
}
assert.equal(storeActivationChanges(boostHero,'__proto__'),null);
assert.equal(renderStoreBoosts(boostHero,order.quotedAt+STORE_BOOST_DURATION_MS*2),'','expired boosts leave the HUD');
assert.equal((renderStoreBoosts(boostHero,order.quotedAt).match(/class="store-hud-boost"/g)||[]).length,4,'all active boost timers render');
assert(storePlayerValid({...boostHero,storeConsumables:{'damage':3}}),'gold-purchasable boost charges are not bounded by paid receipts');
assert(!storePlayerValid({...boostHero,storeConsumables:{'unknown-boost':3}}),'unknown boosts remain invalid');
assert(!storePlayerValid({...boostHero,storeConsumables:{'damage':-1}}),'negative charges remain invalid');
assert(!storePlayerValid({...boostHero,storeBoosts:{'damage':-1}}));
assert(!storePlayerValid({...boostHero,storeBoosts:[]}));
assert(!storePlayerValid({...boostHero,storeOrders:boostHero.storeOrders.map(receipt=>receipt.reward?{...receipt,status:'processed'}:receipt)}),'provisional receipt cannot retain reward');
assert(!storePlayerValid({...boostHero,storeOrders:boostHero.storeOrders.map(receipt=>receipt.reward?{...receipt,reward:undefined}:receipt)}),'delivered repeatable requires reward receipt');
const boxHero={id:order.characterId,ownedMounts:[],ownedPets:[],storePurchases:[],storeOrders:[]};
assert.equal(storeCosmeticPool(boxHero).length,4);
for(let remaining=4;remaining>0;remaining--) {
  const receipt=repeatOrder('store-cosmetic-box',10+remaining), result=storeRewardChanges(boxHero,receipt,order.quotedAt,()=>1-Number.EPSILON);
  assert(!boxHero.storePurchases.includes(result.reward.productId)); Object.assign(boxHero,result.changes); receipt.reward=result.reward; boxHero.storeOrders.push(receipt);
  assert.equal(storeCosmeticPool(boxHero).length,remaining-1); assert(storePlayerValid(boxHero),'box cosmetics and order receipts survive save validation');
}
assert.equal(new Set(boxHero.storePurchases).size,4);
assert.throws(()=>storeRewardChanges(boxHero,repeatOrder('store-cosmetic-box',20)),'complete collection rejects another box');
assert.throws(()=>storeRewardChanges({...boxHero,ownedMounts:[],ownedPets:[],storePurchases:[]},repeatOrder('store-cosmetic-box',20),order.quotedAt,()=>1),'invalid RNG cannot create reward');
assert(!storePlayerValid({...boxHero,storeOrders:[...boxHero.storeOrders,{...boxHero.storeOrders[0],id:'10000000-0000-4000-8000-000000000099'}]}),'duplicate cosmetic receipts rejected');
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39);/g, value => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[value]);
const voidTags = new Set(['input','img','br','hr']);
class Element {
  constructor(tag = 'div') { this.tagName=tag.toUpperCase(); this.children=[]; this.parentElement=null; this.events=new Map(); this.attributes={}; this.dataset={}; this.hidden=false; this.disabled=false; this.checked=false; this.value=''; }
  setAttribute(name,value) { this.attributes[name]=String(value); if(name==='id')this.id=value; if(name==='name')this.name=value; if(name==='value')this.value=decode(value); if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=decode(value); if(['disabled','hidden','checked'].includes(name))this[name]=true; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(node) { node.parentElement=this; this.children.push(node); }
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
globalThis.HTMLElement=Element;
globalThis.document={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:null};
const calls=[],sent=[],storage=new Map();let accountsAuthorized=false,account=buyer.address,chain='0x1237',allowance=0n,holdBurn=null,burnFailure=null,afterApproval=null,allowed=true;
const approvalHash=id('approval'),burnHash=id('burn');
const rpc=async({method,params=[]})=>{
  calls.push({method,params:structuredClone(params)});
  if(method==='eth_accounts'||method==='eth_requestAccounts'){if(method==='eth_requestAccounts')accountsAuthorized=true;return accountsAuthorized?[account]:[];}
  if(method==='eth_chainId')return chain;
  if(method==='personal_sign')return '0x'+'1'.repeat(130);
  if(method==='wallet_switchEthereumChain'){chain=params[0].chainId;return null;}
  if(method==='eth_call')return params[0].data.startsWith(tokenABI.getFunction('balanceOf').selector)?tokenABI.encodeFunctionResult('balanceOf',[parseEther('1000')]):tokenABI.encodeFunctionResult('allowance',[allowance]);
  if(method==='eth_getTransactionReceipt'){allowance=BigInt(order.amountWei);if(afterApproval){const action=afterApproval;afterApproval=null;action();}return{status:'0x1'};}
  if(method==='eth_sendTransaction'){
    if(params[0].to===MOSS_TOKEN.address)return approvalHash;
    if(burnFailure)throw burnFailure;
    if(holdBurn){const hold=holdBurn;holdBurn=null;await hold();}return burnHash;
  }
  throw Error('Unexpected RPC '+method);
};
let pickerCalls=0,pickerHold,pickerFailure;
let chosenProvider={request:rpc};
globalThis.__chooseWallet=async()=>{pickerCalls++;if(pickerHold)await pickerHold;if(pickerFailure)throw pickerFailure;return chosenProvider;};
globalThis.window={ethereum:{request:()=>assert.fail('the browser default wallet must not be used')},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
let player={id:'character-a',name:'Test adventurer',characterCreated:true,appearance:{className:'Ranger'}};
const trigger=new Element('button');document.body.append(trigger);
const ui=mountStoreUI({send:msg=>sent.push(structuredClone(msg)),getPlayer:()=>player,allowed:()=>allowed,onOpen(){},trigger});
const panel=document.body.querySelector('#store-window'),find=selector=>panel.querySelector(selector);
const click=selector=>{const node=find(selector);assert(node,selector);if(!node.disabled){node.onclick?.({preventDefault(){}});node.fire('click');}};
const state=(extra={})=>({wallet:buyer.address,enabled:true,contract,token:MOSS_TOKEN.address,chainId:4663,owned:[],orders:[],...extra});
async function until(predicate,label){const end=Date.now()+3000;while(Date.now()<end){if(predicate())return;await delay(5);}throw Error(`Timed out ${label}: ${find('#store-status')?.textContent}`);}
const sends=()=>calls.filter(call=>call.method==='eth_sendTransaction');
ui.update(state());assert(panel.hidden,'unsolicited server state cannot open the store');
ui.open();assert.equal(sent.at(-1).type,'storeOpen');ui.update(state());
assert(!find('[data-store-product="burned"]') && !find('[data-store-category="title"]'), 'retired title and empty category are absent from store');
assert.equal(find('[data-store-category="featured"]').getAttribute('aria-pressed'),'true');
click('[data-store-category="pet"]');assert.equal(panel.querySelectorAll('[data-store-product]').length,2);assert.equal(calls.length,0,'browsing cannot open wallet');
click('[data-store-category="featured"]');click('[data-store-product="store-embermane"]');
const staleQuoteButton=find('[data-store-quote]');click('[data-store-quote]');assert.equal(sent.at(-1).type,'storeQuote');await ui.quote(order);assert(find('[data-store-burn]'));const staleBurnButton=find('[data-store-burn]');assert.equal(calls.length,0,'receiving a quote cannot open wallet');
assert.match(panel.innerHTML,/123.456789012345678901 MOSS/,'show the precise amount without floating-point rounding');
const before=sends().length;afterApproval=()=>{account=authority.address;};click('[data-store-burn]');await until(()=>panel.innerHTML.includes('account changed'),'wallet change');assert.equal(sends().length,before+1,'account change after approval must prevent burn');assert.equal(pickerCalls,1,'first burn chooses the linked provider');assert(calls.some(call=>call.method==='eth_requestAccounts'),'a newly chosen wallet without permission requests accounts');
account=buyer.address;allowance=BigInt(order.amountWei);await ui.quote(order);click('[data-store-burn]');await until(()=>sent.at(-1).type==='storePaymentCheck','receipt delivery');assert.equal(sends().length,before+2);assert.equal(sent.at(-1).transactionHash,burnHash);assert.equal(storage.get(`mossvale-store:${player.id}:${order.id}`),burnHash);
assert(find('[data-store-check]'));const sentBefore=sends().length;click('[data-store-check]');assert.equal(sends().length,sentBefore,'checking pending delivery cannot start a transaction');
ui.update(state({orders:[{...order,status:'submitted',transactionHash:burnHash}]}));assert(find('[data-store-check]'));
const processed={...order,status:'processed',transactionHash:burnHash,paymentBlock};
ui.update(state({owned:[order.productId],orders:[processed]}));
assert.match(panel.innerHTML,/Temporary reward/);assert.match(panel.innerHTML,/Checking this saved payment before completing delivery/);assert.match(panel.innerHTML,/Check delivery/);
assert(!find('[data-store-burn]'));assert(!find('[data-store-quote]'));assert.equal(storage.get(`mossvale-store:${player.id}:${order.id}`),burnHash,'provisional delivery retains recovery hash');
const processedRequests=sent.length,processedSends=sends().length;staleQuoteButton.fire('click');staleBurnButton.fire('click');await delay(5);
assert.equal(sent.length,processedRequests,'stale quote button cannot request a second processed burn');assert.equal(sends().length,processedSends,'processed status cannot trigger another wallet transaction');
click('[data-store-check]');assert.equal(sent.at(-1).type,'storePaymentCheck');assert.equal(sent.at(-1).orderId,order.id);assert.equal(sends().length,processedSends,'checking finality is read-only');
ui.close();ui.open();ui.update(state({owned:[order.productId],orders:[processed]}));assert(find('[data-store-check]'),'processed delivery remains checkable after reopening');assert(!find('[data-store-quote]'));
ui.update(state({orders:[{...order,status:'submitted',transactionHash:burnHash}]}));
assert(!find('.store-owned'),'revocation removes the temporary ownership badge');assert(find('[data-store-check]'));assert(!find('[data-store-quote]'));assert.match(panel.innerHTML,/temporary reward was removed/);assert.equal(sends().length,processedSends,'revocation cannot submit a transaction');
ui.update(state({owned:[order.productId],orders:[processed]}),'Temporary reward restored.');assert.match(panel.innerHTML,/Temporary reward restored\./);
ui.update(state({owned:[order.productId],orders:[{...order,status:'delivered',transactionHash:burnHash}]}));assert(!find('[data-store-burn]'));assert(!find('[data-store-quote]'));assert(!storage.has(`mossvale-store:${player.id}:${order.id}`));
assert(!find('[data-store-check]'),'finalized ownership no longer needs a check');assert.match(panel.innerHTML,/Burn processed/);assert(!panel.innerHTML.includes('Temporary reward'));
ui.close();ui.open();ui.update(state());click('[data-store-quote]');await ui.quote(order);
let release;holdBurn=()=>new Promise(resolve=>{release=resolve;});click('[data-store-burn]');await until(()=>!!release,'held wallet');assert.equal(storage.get(`mossvale-store:${player.id}:${order.id}`),'wallet-pending');ui.close();release();await until(()=>storage.get(`mossvale-store:${player.id}:${order.id}`)===burnHash,'closed-window hash recovery');assert(panel.hidden);assert.equal(sent.at(-1).transactionHash,burnHash);
ui.open();ui.update(state({orders:[order]}));assert(find('[data-store-check]'),'reopening recovers pending receipt');assert(!find('[data-store-burn]'));
ui.update(state({orders:[{...order,status:'expired'}]}));assert(find('[data-store-quote]'),'server-confirmed unpaid expiry permits a fresh review');
click('[data-store-quote]');ui.update(state({owned:[order.productId],orders:[{...processed,transactionHash:undefined}]}));
assert(find('[data-store-check]')&&!find('[data-store-check]').disabled,'processed state cancels a stale quote request and keeps manual checking available without a hash');
await ui.quote(order);assert.match(panel.innerHTML,/Temporary reward/);assert(!find('[data-store-quote]'));assert(!find('[data-store-burn]'),'late quote response cannot replace a processed order');
ui.update(state({orders:[{...order,status:'expired'}]}));assert(!find('.store-owned'));assert(find('[data-store-quote]'),'finalized unpaid revocation permits a fresh review');
// Definite wallet rejection permits the same reviewed order to retry; uncertain sends stay locked.
for(const rejection of [{code:4001},{code:'ACTION_REJECTED'},{code:'UNKNOWN_ERROR',error:{code:4001}},{info:{error:{code:4001}}}]){
  ui.update(state({orders:[{...order,status:'expired'}]}));ui.update(state());click('[data-store-quote]');await ui.quote(order);
  burnFailure=Object.assign(Error('Explicit wallet cancellation'),rejection);click('[data-store-burn]');
  await until(()=>panel.innerHTML.includes('Explicit wallet cancellation'),'explicit burn rejection');
  assert(!storage.has(`mossvale-store:${player.id}:${order.id}`),'rejected sends leave no pending attempt');
  assert(find('[data-store-burn]')&&!find('[data-store-burn]').disabled,'cancelled burn can retry without waiting for expiry');
  burnFailure=null;const start=sends().length;click('[data-store-burn]');click('[data-store-burn]');
  await until(()=>storage.get(`mossvale-store:${player.id}:${order.id}`)===burnHash,'retry receipt');
  assert.equal(sends().length,start+1,'retry submits once despite repeated clicks');
  assert.equal(sent.at(-1).transactionHash,burnHash);
}
ui.update(state({orders:[{...order,status:'expired'}]}));ui.update(state());click('[data-store-quote]');await ui.quote(order);
const uncertainBurn=find('[data-store-burn]');burnFailure=Object.assign(Error('Wallet response lost'),{code:'UNKNOWN_ERROR'});click('[data-store-burn]');
await until(()=>panel.innerHTML.includes('Wallet response lost'),'uncertain burn');
assert.equal(storage.get(`mossvale-store:${player.id}:${order.id}`),'wallet-pending');
assert(find('[data-store-check]')&&!find('[data-store-burn]'),'uncertain submission stays recoverable without a second burn');
burnFailure=null;const uncertainSends=sends().length;uncertainBurn.fire('click');click('[data-store-check]');
assert.equal(sends().length,uncertainSends,'stale buttons and checking cannot retry an uncertain send');
ui.update(state({orders:[{...order,status:'expired'}]}));
ui.update(state()); click('[data-store-category="boost"]');
assert.equal(panel.querySelectorAll('[data-store-product]').length,4);
assert(find('[data-store-activate]').disabled,'buying does not imply an active charge');
const boostReceipt=boostHero.storeOrders.find(item=>item.productId==='store-profession-xp');
ui.update(state({orders:[{...boostReceipt,status:'processed',reward:undefined}],consumables:{},boosts:{}}));
assert.match(panel.innerHTML,/Checking payment/); assert(!find('[data-store-quote]')); assert(find('[data-store-activate]').disabled);
ui.update(state({orders:[boostReceipt],consumables:{'profession-xp':1},boosts:{}}));
assert(find('[data-store-quote]'),'delivered repeatable can be purchased again');
const activationWalletCalls=calls.length;click('[data-store-activate]');assert.deepEqual(sent.at(-1),{type:'storeActivateBoost',boostId:'profession-xp'});assert.equal(calls.length,activationWalletCalls,'activation needs no wallet action');
const activeUntil=Date.now()+STORE_BOOST_DURATION_MS;
ui.update(state({orders:[boostReceipt],consumables:{'profession-xp':0},boosts:{'profession-xp':activeUntil}})); ui.refresh();
assert(find('[data-store-activate]').disabled); assert.match(panel.innerHTML,/Add 1 hour/);assert(find('[data-store-boost-timer]').textContent.includes('m'),'active time is visible');
click('[data-store-category="gacha"]');
assert.match(panel.innerHTML,/1 in 4 each/);assert.match(panel.innerHTML,/No duplicate rewards/);
ui.update(state({owned:['store-embermane'],orders:[{...order,status:'delivered'}]}));assert.match(panel.innerHTML,/1 in 3 each/);
ui.update(state({owned:boxHero.storePurchases,orders:boxHero.storeOrders}));assert.match(panel.innerHTML,/Collection complete/);assert(!find('[data-store-quote]'));assert.match(panel.innerHTML,/Last box:/);
ui.update(state({orders:[{...order,status:'submitted'}]}));assert(!find('[data-store-quote]'),'unfinished direct cosmetic purchase freezes box pool');
// Force a fresh app choice on every Link and retain it for ownership proof.
ui.update(state());const choiceStart=pickerCalls,chosenCalls=[];
chosenProvider={request:request=>{chosenCalls.push(request.method);return rpc(request);}};
click('[data-store-wallet]');await until(()=>sent.at(-1)?.type==='storeWalletChallenge','link wallet choice');
await ui.walletChallenge({type:'storeWalletChallenge',address:buyer.address,message:'link selected wallet',expiresAt:Date.now()+60000});
assert.equal(pickerCalls,choiceStart+1);assert(chosenCalls.includes('personal_sign'),'signing retains the selected provider');
ui.update(state());const beforePickerRpc=calls.length;let releasePicker;pickerHold=new Promise(resolve=>releasePicker=resolve);
click('[data-store-wallet]');assert.equal(pickerCalls,choiceStart+2,'every Link opens the chooser');ui.update(state());click('[data-store-wallet]');assert.equal(pickerCalls,choiceStart+2,'passive update cannot duplicate selection');
assert.equal(calls.length,beforePickerRpc,'no RPC before choosing');ui.close();releasePicker();pickerHold=null;await delay(30);assert.equal(calls.length,beforePickerRpc,'closed picker operation cannot open a wallet');
ui.open();ui.update(state());pickerFailure=Error('Wallet selection cancelled.');click('[data-store-wallet]');await until(()=>panel.innerHTML.includes('cancelled'),'picker cancellation');pickerFailure=null;assert.equal(calls.length,beforePickerRpc);
// Class change pays through the existing exact MOSS quote, then spends one verified receipt without wallet RPC.
ui.update(state());click('[data-store-category="class-change"]');assert.equal(panel.querySelectorAll('[data-store-product]').length,1);
assert.match(panel.innerHTML,/\$50/);assert.match(panel.innerHTML,/All trained abilities and talent choices reset/);
click('[data-store-quote]');assert.deepEqual(sent.at(-1),{type:'storeQuote',productId:'store-class-change'});
const classOrder={...order,id:'10000000-0000-4000-8000-000000000050',productId:'store-class-change',usdPrice:50};
const classTerms={...terms,productId:classOrder.productId},classContractOrder={...contractOrder,orderId:id('mossvale-store:'+classOrder.id),productId:id(classOrder.productId),usdCents:5000};
classOrder.contractOrder=classContractOrder;classOrder.signature=await authority.signTypedData(domain,types,classContractOrder);classOrder.orderHash=TypedDataEncoder.hash(domain,types,classContractOrder);
classOrder.transaction={...order.transaction,data:storeABI.encodeFunctionData('buy',[classContractOrder,classOrder.signature])};
await validateStorePayment(classOrder,classTerms);await assert.rejects(validateStorePayment({...classOrder,usdPrice:40},classTerms));
await ui.quote(classOrder);assert(find('[data-store-burn]'));assert.match(panel.innerHTML,/\$50 USD/);
const credit={...classOrder,status:'processed',paymentBlock,transactionHash:id('class-paid'),reward:{kind:'class-change',grantedAt:classOrder.quotedAt}};
ui.update(state({enabled:false,wallet:null,orders:[credit],reason:'Payment service unavailable.'}));
assert(!find('[data-store-quote]')&&!find('[data-store-burn]'),'ready credit cannot cause an unnecessary second purchase');
assert(find('[data-store-class="Ranger"]').disabled);assert(!find('[data-store-class="Mage"]').disabled,'paid credit remains usable with payment service disabled');
const beforeClassRpc=calls.length,beforeClassPlayer=JSON.stringify(player);click('[data-store-class="Mage"]');click('[data-store-class-review]');
assert.match(panel.innerHTML,/from <strong>Ranger<\/strong> to <strong>Mage/);const cancelledApply=find('[data-store-class-apply]');
click('[data-store-class-cancel]');cancelledApply.fire('click');assert.notEqual(sent.at(-1).type,'storeChangeClass','cancelled review cannot apply');
click('[data-store-class-review]');const applyButton=find('[data-store-class-apply]');click('[data-store-class-apply]');
assert.deepEqual(sent.at(-1),{type:'storeChangeClass',orderId:credit.id,className:'Mage'});const classSends=sent.length;
ui.update(state({enabled:false,wallet:null,orders:[credit]}));applyButton.fire('click');assert.equal(sent.length,classSends,'passive receipt refresh cannot unlock a pending apply');
assert.match(panel.innerHTML,/Changing your class/);assert.doesNotMatch(panel.innerHTML,/reward arrives after finality/);
assert.equal(calls.length,beforeClassRpc);assert.equal(JSON.stringify(player),beforeClassPlayer,'UI sends intent without changing character or spending credit optimistically');
ui.reject('Finish combat first.','storeChangeClass');assert(!find('[data-store-class="Mage"]').disabled,'server rejection releases retry while keeping the credit');
click('[data-store-class-review]');const staleApply=find('[data-store-class-apply]');
ui.update(state({orders:[{...credit,reward:{...credit.reward,className:'Mage',redeemedAt:Date.now()}}]}));staleApply.fire('click');assert.equal(sent.length,classSends,'used receipt cannot apply again');
assert(find('[data-store-quote]'),'another class change can be bought after credit use');
assert.match(panel.innerHTML,/Class change complete/);assert.doesNotMatch(panel.innerHTML,/reward arrives after finality/);
ui.update(state({orders:[credit]}));click('[data-store-class="Mage"]');click('[data-store-class-review]');const reorgApply=find('[data-store-class-apply]');
ui.update(state({orders:[{...credit,status:'submitted',reward:undefined}]}));reorgApply.fire('click');assert.equal(sent.length,classSends,'revoked unspent receipt invalidates confirmation');
assert.match(panel.innerHTML,/credit is not available yet/);
assert(!find('[data-store-class-review]'));assert.equal(calls.length,beforeClassRpc);
ui.update(state({orders:[credit]}));click('[data-store-class="Mage"]');click('[data-store-class-review]');click('[data-store-class-apply]');
ui.close();ui.reject('Finish combat first.','storeChangeClass');ui.open();ui.update(state({orders:[credit]}));
assert(!find('[data-store-class="Mage"]').disabled,'rejection while closed must release the pending apply lock');
// Active gold services remain usable without a wallet or payment provider.
player.economyVersion=1;player.gold=3000;ui.update(state({enabled:false,wallet:null}));click('[data-store-category="boost"]');
assert.match(panel.innerHTML,/250 gold/);assert(!find('[data-store-native-buy]')&&!find('[data-store-quote]'));
const goldRpc=calls.length,goldButton=find('[data-store-gold-buy]');click('[data-store-gold-buy]');const goldSends=sent.length;goldButton.fire('click');
assert.equal(sent.length,goldSends,'stale gold button cannot repeat a pending purchase');assert.deepEqual(sent.at(-1),{type:'storeBuyBoost',boostId:'profession-xp'});
ui.update(state({enabled:false,wallet:null}));click('[data-store-category="class-change"]');click('[data-store-class="Mage"]');click('[data-store-class-review]');
assert.match(panel.innerHTML,/spends 2,500 gold/);click('[data-store-class-apply]');assert.deepEqual(sent.at(-1),{type:'storeBuyClass',className:'Mage'});assert.equal(calls.length,goldRpc);
ui.reject('Finish combat first.','storeBuyClass');player.gold=0;ui.refresh();assert(find('[data-store-class-review]').disabled);
player.economyVersion=0;delete player.gold;ui.update(state());
allowed=false;ui.refresh();assert(panel.hidden);
let serverNow=Date.now()+24*STORE_BOOST_DURATION_MS;
const skewTrigger=new Element('button');document.body.append(skewTrigger);
const skewUI=mountStoreUI({send:msg=>sent.push(msg),getPlayer:()=>player,allowed:()=>true,onOpen(){},trigger:skewTrigger,now:()=>serverNow});
const skewPanel=document.body.querySelectorAll('#store-window').at(-1);
skewUI.open();skewUI.update(state({boosts:{damage:serverNow+60_000}}));
assert.match(skewPanel.innerHTML,/1m 0s/,'store countdown uses realm time even when device clock is a day behind');
serverNow+=61_000;skewUI.refresh();assert.equal(skewPanel.querySelector('[data-store-boost-timer]').textContent,'Expired','refresh uses the supplied realm clock');
skewPanel.querySelector('[data-store-quote]').fire('click');await skewUI.quote(order);
assert(!skewPanel.querySelector('[data-store-burn]'),'quote expired by realm time never reaches wallet review');
assert.match(skewPanel.innerHTML,/quote changed or expired/);skewUI.close();

// Exercise the actual native store branches with the same DOM; all auth/store responses are synthetic.
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const settle=async()=>{await delay(0);for(let index=0;index<12;index++)await Promise.resolve();};
function nativeHarness({ready=true,platform='apple'}={}) {
  const h={player:{id:'20000000-0000-4000-8000-000000000001',name:'Original hero',ownedMounts:[],ownedPets:[]},calls:[],fetches:[],abandoned:[],sent:[],clock:Date.now(),
    auth:async()=> 'synthetic.access.token',purchase:async()=>({pending:true}),restore:async()=>({checked:true}),
    intent:async(body,id)=>({intentId:id,productId:MOBILE_STORE_SKUS[body.productId]})};
  const listeners=new Set(),events=new Map();
  const client={version:1,platform,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},request:async(method,params)=>{
    h.calls.push({method,params:structuredClone(params)});
    if(method==='billing.products')return{products:params.productIds.map(productId=>({productId,displayPrice:'€7,99',title:'Native item',description:'Native item'}))};
    if(method==='billing.purchase')return h.purchase(params);
    if(method==='billing.restore')return h.restore();
    assert.fail('Unexpected native method '+method);
  }};
  globalThis.window={__MOSSVALE_NATIVE__:true,ethereum:{request:()=>assert.fail('native store cannot use a wallet')},
    addEventListener:(name,callback)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(callback);},...(ready?{mossvaleNative:client}:{})};
  globalThis.__storeAccessToken=()=>h.auth();
  globalThis.fetch=async(url,options)=>{
    assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer synthetic.access.token');
    if(url==='/api/mobile-purchases/abandon') {
      assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body),['intentId']);
      assert(h.fetches.some(intent=>intent.id===body.intentId));h.abandoned.push(body.intentId);return{ok:true};
    }
    assert.equal(url,'/api/mobile-purchases/intents');
    const body=JSON.parse(options.body),id=`30000000-0000-4000-8000-${String(h.fetches.length+1).padStart(12,'0')}`;
    h.fetches.push({body,id});const result=await h.intent(body,id);return{ok:true,json:async()=>result};
  };
  const trigger=new Element('button');document.body.append(trigger);
  h.ui=mountStoreUI({send:message=>h.sent.push(structuredClone(message)),getPlayer:()=>h.player,allowed:()=>true,onOpen(){},trigger,now:()=>h.clock});
  h.panel=document.body.querySelectorAll('#store-window').at(-1);
  h.find=selector=>h.panel.querySelector(selector);h.status=()=>h.find('#store-status')?.textContent||decode(h.panel.innerHTML.match(/<p id="store-status"[^>]*>([^<]*)<\/p>/)?.[1]||'');
  h.click=selector=>{const node=h.find(selector);assert(node,selector);if(!node.disabled){node.onclick?.({preventDefault(){}});node.fire('click');}};
  h.update=(extra={})=>h.ui.update(state({wallet:null,enabled:false,mobile:{apple:true,google:true},mobileOrders:[],...extra}));
  h.open=(extra={})=>{h.ui.open();h.update(extra);};
  h.emit=event=>{for(const listener of listeners)listener({type:'billing',...event});};
  h.ready=()=>{window.mossvaleNative=client;for(const listener of events.get('mossvale-native-ready')||[])listener();};
  h.switchCharacter=()=>{h.ui.reset();h.player={...h.player,id:'20000000-0000-4000-8000-000000000002',name:'Other hero'};h.open();};
  h.purchases=()=>h.calls.filter(call=>call.method==='billing.purchase');
  h.saved=(id,extra={})=>({id,productId:'store-embermane',status:'pending',createdAt:h.clock,expiresAt:h.clock+900000,...extra});
  return h;
}
let native=nativeHarness({ready:false});native.open();assert(native.find('[data-store-native-buy]').disabled);native.ready();await settle();
assert(!native.find('[data-store-native-buy]').disabled,'late native-ready enables the app store without reloading');
assert(!native.find('[data-store-category="class-change"]') && !native.find('[data-store-product="store-class-change"]'), 'native apps exclude class change');
assert(native.calls.filter(call=>call.method==='billing.products').every(call=>call.params.productIds.every(sku=>typeof sku==='string' && sku!==MOBILE_STORE_SKUS['store-class-change'] && sku!==MOBILE_STORE_SKUS.burned)), 'native product queries contain only active SKUs');
assert.match(native.panel.innerHTML,/€7,99/);assert(!native.find('[data-store-wallet]'));assert(!native.find('[data-store-burn]'));assert(!native.find('[data-store-quote]'));
native.update({mobile:{apple:false,google:true}});assert(native.find('[data-store-native-buy]').disabled,'realm must explicitly enable the current billing platform');

native=nativeHarness();native.open();await settle();let gate=deferred();native.intent=()=>gate.promise;
const staleNativeBuy=native.find('[data-store-native-buy]');native.click('[data-store-native-buy]');await settle();assert.equal(native.fetches.length,1);
native.click('[data-store-product="store-cinderfang"]');native.update();staleNativeBuy.fire('click');await settle();assert.equal(native.fetches.length,1,'selection and passive updates cannot unlock concurrent intent requests');
native.ui.close();native.open();await settle();assert(native.find('[data-store-native-buy]').disabled,'closing and reopening retains the native request lock');
gate.resolve({intentId:native.fetches[0].id,productId:MOBILE_STORE_SKUS['store-embermane']});await settle();
assert.equal(native.purchases().length,0,'a response for a closed store never launches checkout');assert(!native.find('[data-store-native-buy]').disabled,'stale completion releases the lock on the current panel');

for(const phase of ['auth','intent']){
  native=nativeHarness();native.open();await settle();gate=deferred();
  if(phase==='auth')native.auth=()=>gate.promise;else native.intent=()=>gate.promise;
  native.click('[data-store-native-buy]');await settle();native.switchCharacter();await settle();
  gate.resolve(phase==='auth'?'synthetic.access.token':{intentId:native.fetches[0].id,productId:MOBILE_STORE_SKUS['store-embermane']});await settle();
  assert.equal(native.purchases().length,0,`character change during ${phase} prevents SDK dispatch`);assert.equal(native.fetches.length,phase==='auth'?0:1);
  assert(!native.find('[data-store-native-buy]').disabled);assert(!native.status().includes('Sign in again'),'stale callbacks do not replace the current character message');
}
for(const change of ['selection','ownership']){
  native=nativeHarness();native.open();await settle();gate=deferred();native.intent=()=>gate.promise;
  native.click('[data-store-native-buy]');await settle();
  if(change==='selection')native.click('[data-store-product="store-cinderfang"]');else native.update({owned:['store-embermane']});
  gate.resolve({intentId:native.fetches[0].id,productId:MOBILE_STORE_SKUS['store-embermane']});await settle();
  assert.equal(native.purchases().length,0,`${change} change while preparing checkout is rechecked before native payment`);
}

native=nativeHarness();native.open();await settle();native.click('[data-store-native-buy]');await settle();
let intentId=native.fetches[0].id,sku=MOBILE_STORE_SKUS['store-embermane'];
assert.deepEqual(native.fetches[0].body,{productId:'store-embermane',characterId:native.player.id,platform:'apple'});
assert.deepEqual(native.purchases()[0].params,{intentId,productId:sku,accessToken:'synthetic.access.token'});
native.update({mobileOrders:[native.saved(intentId)]});
for(const code of ['PURCHASE_FAILED','INVALID_RECEIPT']){native.emit({status:'error',intentId,productId:sku,code,message:'Delivery uncertain.'});assert(native.find('[data-store-native-buy]').disabled,'uncertain errors cannot authorize a second charge');}
native.ui.close();native.open({mobileOrders:[native.saved(intentId)]});await settle();assert(native.find('[data-store-native-buy]').disabled);
native.emit({status:'cancelled',intentId,productId:sku,code:'USER_CANCELLED',message:'Purchase cancelled.'});assert(!native.find('[data-store-native-buy]').disabled,'definite cancellation permits retry despite a stale pending intent snapshot');
native.click('[data-store-native-buy]');await settle();assert.equal(native.purchases().length,2);
intentId=native.fetches.at(-1).id;native.emit({status:'delivered',intentId,productId:sku});assert.equal(native.sent.at(-1).type,'storeOpen');assert(native.find('[data-store-native-buy]').disabled,'delivery refresh precedes another purchase');
native.update({owned:['store-embermane'],mobileOrders:[native.saved(intentId,{status:'delivered',reward:{kind:'cosmetic',productId:'store-embermane',grantedAt:native.clock}})]});assert(!native.find('[data-store-native-buy]'));

for(const code of [4201,4000]){
  native=nativeHarness();native.purchase=async()=>{throw Object.assign(Error('Synthetic checkout failure'),{code});};native.open();await settle();native.click('[data-store-native-buy]');await settle();
  native.update({mobileOrders:[native.saved(native.fetches[0].id)]});assert.equal(native.find('[data-store-native-buy]').disabled,code!==4201,'only definitely-not-started permits retry after dispatch error');
  assert.equal(native.abandoned.length,code===4201?1:0,'only a known undispatched purchase releases its server reservation');
}
native=nativeHarness();native.open();await settle();native.click('[data-store-native-buy]');await settle();intentId=native.fetches[0].id;
native.emit({status:'refunded',intentId,productId:sku,code:'PURCHASE_REFUNDED',message:'This purchase was refunded or revoked.'});
assert.equal(native.sent.at(-1).type,'storeOpen','refund refreshes authoritative entitlements');
assert.match(native.status(),/refunded or revoked/);
assert(!native.find('[data-store-native-buy]').disabled,'a completed refund clears the local pending checkout');
native=nativeHarness();native.open();await settle();native.click('[data-store-native-buy]');await settle();intentId=native.fetches[0].id;
native.restore=async()=>{native.emit({status:'error',intentId,productId:sku,code:'PURCHASE_RECOVERY_REQUIRED',message:'Recorded payment requires support.'});return{checked:true};};
native.click('[data-store-native-restore]');await settle();assert.match(native.status(),/payment is recorded/);assert(native.find('[href="mailto:support@mossvale.world"]'));assert(native.find('[data-store-native-buy]').disabled);
native.emit({status:'pending',intentId,productId:sku,message:'Checking…'});assert.match(native.status(),/Do not buy it again/,'later pending events cannot erase paid recovery');
for(const status of ['refunded','abandoned']){
  native=nativeHarness();native.open();await settle();native.click('[data-store-native-buy]');await settle();intentId=native.fetches[0].id;
  native.emit({status:'error',intentId,productId:sku,code:'PURCHASE_RECOVERY_REQUIRED',message:'Recorded payment requires support.'});
  native.update({mobileOrders:[native.saved(intentId,{status})]});
  assert(!native.find('[data-store-native-buy]').disabled,`${status} from the server clears stale local recovery`);
  assert(!native.find('[href="mailto:support@mossvale.world"]'));
  assert.match(native.status(), status === 'refunded' ? /refunded or revoked/ : /Checkout closed/);
}

native=nativeHarness();intentId='30000000-0000-4000-8000-000000000099';native.open({mobileOrders:[native.saved(intentId)]});await settle();
assert(native.find('[data-store-native-buy]').disabled,'saved original-character intents survive a fresh UI instance');assert.match(native.status(),/original character/);
native.update({mobileOrders:[native.saved(intentId,{expiresAt:native.clock-1})]});assert(!native.find('[data-store-native-buy]').disabled,'an expired unpaid reservation is not a recorded payment');
native.update({mobileOrders:[native.saved(intentId,{status:'payment-confirmed',expiresAt:native.clock-1,reason:'duplicate-cosmetic'})]});
assert(native.find('[href="mailto:support@mossvale.world"]'));assert(native.find('[data-store-native-buy]').disabled,'recorded payments do not expire into permission to charge again');
native.switchCharacter();await settle();assert(!native.find('[data-store-native-buy]').disabled,'another character does not inherit a saved recovery state');

native=nativeHarness();native.open();await settle();native.click('[data-store-native-buy]');await settle();intentId=native.fetches[0].id;
native.switchCharacter();await settle();assert(native.find('[data-store-native-buy]').disabled,'an in-flight native payment stays bound to its original character');
native.emit({status:'delivered',intentId,productId:sku});assert(!native.find('[data-store-native-buy]').disabled);assert.equal(native.status(),'Purchase delivered to its original character.','completion identifies the original character and clears the old pending message');

native=nativeHarness({platform:'google'});native.open();await settle();native.click('[data-store-category="gacha"]');
native.update({owned:['store-cinder-kit'],mobileOrders:[native.saved(intentId,{productId:'store-cosmetic-box',status:'delivered',reward:{kind:'cosmetic',productId:'store-cinder-kit',grantedAt:native.clock}})]});
assert.match(native.panel.innerHTML,/Last box:/);assert.match(native.panel.innerHTML,/Cinder Kit/);assert.match(native.panel.innerHTML,/1 in 3 each/);assert(!native.panel.innerHTML.includes('Opens after the burn is processed.'));
native.click('[data-store-category="boost"]');native.click('[data-store-native-buy]');await settle();assert.equal(native.fetches.at(-1).body.platform,'google');
native.ui.close();
native=nativeHarness();Object.assign(native.player,{economyVersion:1,gold:3000,appearance:{className:'Ranger'}});native.open();await settle();
native.click('[data-store-category="boost"]');assert(!native.find('[data-store-native-buy]'));native.click('[data-store-gold-buy]');assert.deepEqual(native.sent.at(-1),{type:'storeBuyBoost',boostId:'profession-xp'});
native.update();native.click('[data-store-category="class-change"]');native.click('[data-store-class="Mage"]');native.click('[data-store-class-review]');native.click('[data-store-class-apply]');assert.deepEqual(native.sent.at(-1),{type:'storeBuyClass',className:'Mage'});assert.equal(native.purchases().length,0,'gold services never open native billing');native.ui.close();
// A pre-migration native boost payment remains recoverable from its gold service page.
native=nativeHarness();Object.assign(native.player,{economyVersion:1,gold:3000,appearance:{className:'Ranger'}});
const legacyBoostPending=native.saved('30000000-0000-4000-8000-000000000099',{productId:'store-profession-xp'});
native.open({mobileOrders:[legacyBoostPending]});await settle();native.click('[data-store-category="boost"]');
assert(native.find('[data-store-gold-buy]').disabled,'existing native payment blocks a second service purchase');
assert(native.find('[data-store-native-restore]')&&!native.find('[data-store-native-restore]').disabled,'legacy boost Restore is available beside the gold service');
native.click('[data-store-native-restore]');await settle();assert.equal(native.calls.filter(call=>call.method==='billing.restore').length,1);assert.equal(native.purchases().length,0);native.ui.close();
console.log('PASS native store UI: localized prices/readiness, exact intents and platform, single checkout through live refresh/close, stale character and selection guards, cancellation vs uncertain errors, original-character persistence, recorded-payment support, restore outcomes, native box rewards and zero wallet calls.');
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');for(const expected of ['storeUI.update(msg.state,msg.message)','storeUI.quote(msg.order)','storeUI.walletChallenge(msg)','storeUI.reset()','storeButton.onclick=()=>storeUI.open()'])assert(main.includes(expected),expected);
console.log('PASS store UI: precise two-step review, signed quote and exact-approval validation, account changes after approval, receipt recovery, processed reward finality checks and revocation without another burn, strict persisted payment blocks, legacy delivered orders, repeatable finalized boost charges and expiry, duplicate-free box receipts and odds, activation controls, realm-clock countdowns and expiry, and game-menu wiring.');
