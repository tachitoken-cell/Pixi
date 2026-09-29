import './specialist-nft-ui.css';
import { Interface, formatUnits, parseUnits, hexlify, toUtf8Bytes } from 'ethers';
import { MOSS_TOKEN } from './auction.ts';
import { SPECIALIST_NAMES, specialistJobLevel } from './raid-progression.ts';
import type { Player, ClientMessage, ServerMessage } from './shared.ts';
import { isNativeApp } from './native-client.ts';
import { chooseWallet, type WalletProvider } from './wallet-provider.ts';
import { switchRobinhoodNetwork } from './wallet-network.ts';
import { spSame, spNftInterface, specialistNftOrderValid, specialistNftTransaction, type SpecialistNftState, type SpecialistNftMessage, type SpecialistNftOrder, type SpecialistNftTransaction } from './specialist-nft.ts';
const escape=(text:unknown)=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const tokenAbi=new Interface(['function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)']);
type Review={order:SpecialistNftOrder}|{transaction:SpecialistNftTransaction};

/** Every spend or transfer gets a visible review and an explicit wallet confirmation. */
export function mountSpecialistNftUI(options:{send:(message:ClientMessage)=>void;getPlayer:()=>Player|undefined;allowed:()=>boolean;onOpen:()=>void}) {
  const panel=document.createElement('section');panel.id='specialist-nft-window';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','specialist-nft-title');
  panel.innerHTML='<header><h2 id="specialist-nft-title">Specialist exchange</h2><button data-close aria-label="Close specialist exchange">×</button></header><p>Seal a specialist with a Specialist Case to mint or update its NFT. Activation locks it to one character; seal it again before selling or transferring. Broken cards keep every level.</p><p data-status role="status" aria-live="polite"></p><div data-wallet></div><div data-review></div><div data-orders></div><div data-cards></div><h3>Wallet collection &amp; market</h3><label>Find token ID<input data-token inputmode="numeric" autocomplete="off"></label><button data-find>Find specialist</button><div data-market></div><div data-pages></div>';
  document.body.append(panel);
  const query=<T extends HTMLElement=HTMLElement>(selector:string)=>panel.querySelector<T>(selector)!;
  let state:SpecialistNftState|null=null,review:Review|null=null,awaiting:SpecialistNftMessage|null=null,busy=false,epoch=0,owner='',provider:WalletProvider|undefined,linking='',previousFocus:HTMLElement|null=null;
  const say=(text:string)=>{query('[data-status]').textContent=text;};
  const current=()=>({epoch,id:options.getPlayer()?.id,wallet:state?.wallet});
  const guardFor=(operation:ReturnType<typeof current>)=>()=>{if(epoch!==operation.epoch||operation.id!==options.getPlayer()?.id||operation.wallet!==state?.wallet||panel.hidden||!options.allowed()||isNativeApp())throw Error('The character or wallet changed. Review again.');};
  const send=(message:SpecialistNftMessage)=>{awaiting=message;options.send(message);};
  const short=(value:string)=>`${value.slice(0,8)}…${value.slice(-6)}`;
  const description=(card:SpecialistNftOrder['card'])=>`${SPECIALIST_NAMES[card.className]} +${card.upgrade} · Job ${specialistJobLevel(card.jobXp)} · ${card.jobXp} XP · ${card.attempts} attempts${card.broken?' · Broken':''}`;
  function render(){
    const player=options.getPlayer(),disabled=busy||!state?.enabled||!state.wallet||isNativeApp();
    query('[data-wallet]').innerHTML=`<p>${state?.wallet?`Wallet: ${escape(state.wallet)}`:'Link a wallet to trade specialists.'}</p><button data-connect ${busy?'disabled':''}>Link wallet</button><button data-refresh ${busy?'disabled':''}>Refresh</button>`;
    query('[data-cards]').innerHTML='<h3>Your specialists</h3>'+(player?.raidProgress?.specialists||[]).map(card=>`<article><strong>${escape(description(card))}</strong><p>${card.sealed?'Sealed or reserved; unavailable in combat.':card.nft?'Active NFT; locked to this character.':'Character specialist.'}</p>${!card.sealed?`<button data-seal="${escape(card.id)}" ${disabled?'disabled':''}>Seal · 1 Specialist Case</button>`:''}</article>`).join('');
    query('[data-orders]').innerHTML=(state?.orders||[]).filter(order=>order.status==='quoted').map(order=>`<article><strong>${escape(description(order.card))}</strong><p>${order.action==='activate'?'Activation':'Sealing'} reserved. Canceled wallet actions stay reserved until their unused permission expires on chain.${order.action!=='activate'?' Keep space in your bags for a returned case.':''}</p><button data-check="${escape(order.id)}" ${busy?'disabled':''}>Check transaction</button>${order.expiresAt>Date.now()?`<button data-review-order="${escape(order.id)}" ${disabled?'disabled':''}>Review ${order.action}</button>`:''}</article>`).join('');
    const selected=review, reviewed=selected&&('order'in selected?selected.order:selected.transaction);
    query('[data-review]').innerHTML=selected&&reviewed?`<article><h3>Review ${{mint:'sealing',seal:'sealing',activate:'activation',list:'listing',buy:'purchase',transfer:'transfer'}[reviewed.action]}</h3><p>${'order'in selected ? escape(description(selected.order.card)):''}</p><p>Token: ${escape(reviewed.tokenId)}<br>Wallet: ${escape(reviewed.wallet)}<br>Contract: ${escape(reviewed.contract)}</p><p>${'order'in selected?'0 additional MOSS. Network gas is paid in ETH.':selected.transaction.action==='buy'?`Pay exactly ${escape(formatUnits(selected.transaction.amountWei!,18))} MOSS. 5% goes to MOSS buyback and burn; 95% goes to the seller.`:selected.transaction.action==='list'?`Listing price: ${escape(formatUnits(selected.transaction.amountWei!,18))} MOSS. ${selected.transaction.amountWei==='0'?'This cancels your listing.':'A buyer pays 5% royalty from this price.'}`:`Transfer to ${escape(selected.transaction.recipient)}. Ownership and game access move to that wallet.`}</p><button data-confirm ${disabled?'disabled':''}>Confirm in wallet</button><button data-cancel ${busy?'disabled':''}>Close review</button></article>`:'';
    query('[data-market]').innerHTML=(state?.tokens||[]).map(token=>{const owned=spSame(token.owner,state?.wallet);return `<article data-market-token="${escape(token.tokenId)}"><strong>${escape(description(token.card))}</strong><p>Token ${escape(token.tokenId)}<br>Owner ${escape(short(token.owner))} · ${token.active?'Active · transfer locked':'Sealed'}${token.amountWei!=='0'?` · ${escape(formatUnits(token.amountWei,18))} MOSS`:''}</p>${!token.active&&owned?`<button data-activate="${escape(token.tokenId)}" ${disabled?'disabled':''}>Activate on this character</button><label>Price in MOSS<input data-price inputmode="decimal" autocomplete="off"></label><button data-list="${escape(token.tokenId)}" ${disabled?'disabled':''}>Review listing</button>${token.amountWei!=='0'?`<button data-unlist="${escape(token.tokenId)}" ${disabled?'disabled':''}>Cancel listing</button>`:''}<label>Recipient wallet<input data-recipient autocomplete="off"></label><button data-transfer="${escape(token.tokenId)}" ${disabled?'disabled':''}>Review transfer</button>`:!token.active&&token.amountWei!=='0'?`<button data-buy="${escape(token.tokenId)}" ${disabled?'disabled':''}>Review purchase</button>`:''}</article>`;}).join('')||(state?.enabled?'<p>No specialists on this page.</p>':'');
    query('[data-pages]').innerHTML=state&&state.total>20?`<button data-page="${Math.max(0,state.offset-20)}" ${state.offset===0||busy?'disabled':''}>Previous</button><span>${state.offset+1}–${Math.min(state.offset+20,state.total)} of ${state.total}</span><button data-page="${state.offset+20}" ${state.offset+20>=state.total||busy?'disabled':''}>Next</button>`:'';
  }
  async function checkWallet(address:string,guard:()=>void){provider ||=await chooseWallet();guard();const accounts=await provider.request({method:'eth_requestAccounts',params:[]}) as string[];guard();if(!spSame(accounts[0],address))throw Error('Select your linked wallet.');await switchRobinhoodNetwork(provider,guard);guard();if(BigInt(await provider.request({method:'eth_chainId',params:[]}) as string)!==4663n)throw Error('Select Robinhood Chain.');guard();}
  async function confirm(){
    if(busy||!review||!state?.wallet||!state.contract)return;
    const selected=review,operation=current(),guard=guardFor(operation);busy=true;render();
    try{
      const value='order'in selected?selected.order:selected.transaction;
      if(!spSame(value.wallet,state.wallet)||!spSame(value.contract,state.contract))throw Error('Specialist wallet or contract changed.');
      const transaction='order'in selected?(()=>{const order=selected.order;if(!specialistNftOrderValid(order)||order.characterId!==operation.id||order.expiresAt<=Date.now()||order.status!=='quoted'||!state!.orders.some(saved=>saved.id===order.id&&JSON.stringify(saved)===JSON.stringify(order)))throw Error('Specialist authorization changed or expired.');return {to:order.contract,data:spNftInterface.encodeFunctionData('transition',[order.contractOrder,order.signature]),value:'0x0',chainId:'0x1237'};})():specialistNftTransaction(selected.transaction);
      await checkWallet(value.wallet,guard);
      if('transaction'in selected&&selected.transaction.action==='buy'){
        const amount=selected.transaction.amountWei!,read=await provider!.request({method:'eth_call',params:[{to:MOSS_TOKEN.address,data:tokenAbi.encodeFunctionData('allowance',[value.wallet,value.contract])},'latest']});guard();
        if(tokenAbi.decodeFunctionResult('allowance',read)[0]<BigInt(amount)){
          say(`Approve exactly ${formatUnits(amount,18)} MOSS in your wallet, then confirm the purchase.`);
          const hash=await provider!.request({method:'eth_sendTransaction',params:[{to:MOSS_TOKEN.address,from:value.wallet,data:tokenAbi.encodeFunctionData('approve',[value.contract,amount]),value:'0x0',chainId:'0x1237'}]});guard();
          let receipt;const deadline=Date.now()+120000;
          while(!receipt&&Date.now()<deadline){receipt=await provider!.request({method:'eth_getTransactionReceipt',params:[hash]});guard();if(!receipt)await new Promise(resolve=>setTimeout(resolve,2000));guard();}
          if(!receipt)throw Error('Approval is still pending. Check your wallet, then review again.');
          if(BigInt(receipt.status)!==1n)throw Error('MOSS approval failed.');
        }
      }
      await checkWallet(value.wallet,guard);await provider!.request({method:'eth_call',params:[{...transaction,from:value.wallet},'latest']});guard();
      const hash=await provider!.request({method:'eth_sendTransaction',params:[{...transaction,from:value.wallet}]});
      guard();if(typeof hash!=='string'||!/^0x[\da-f]{64}$/i.test(hash))throw Error('Check wallet activity: no transaction hash was returned.');
      say(`Transaction submitted: ${hash}. Refresh after finality.`);review=null;
      options.send('order'in selected?{type:'specialistNftCheck',orderId:selected.order.id}:{type:'specialistNftOpen',offset:state!.offset});
    }catch(error){say(error instanceof Error?error.message:'Wallet action interrupted. Check wallet activity.');}
    finally{busy=false;render();}
  }
  async function connect(){if(busy)return;const guard=guardFor(current());busy=true;render();try{provider=await chooseWallet();guard();const accounts=await provider.request({method:'eth_requestAccounts',params:[]}) as string[];if(panel.hidden||!options.allowed())return;if(!accounts[0])throw Error('Choose a wallet.');linking=accounts[0];options.send({type:'storeWalletChallenge',wallet:linking});say('Sign the ownership message to link your wallet.');}catch(error){say(error instanceof Error?error.message:'Wallet connection failed.');}finally{busy=false;render();}}
  async function handleChallenge(message:Extract<ServerMessage,{type:'storeWalletChallenge'}>){
    if(!linking||!spSame(linking,message.address)||message.expiresAt<=Date.now()||!provider||panel.hidden)return;
    const address=linking,operation=current(),guard=guardFor(operation);busy=true;render();
    try{const signature=await provider.request({method:'personal_sign',params:[hexlify(toUtf8Bytes(message.message)),address]});guard();if(message.expiresAt<=Date.now()||linking!==address)throw Error('Wallet link expired.');linking='';options.send({type:'storeWalletBind',signature});}
    catch(error){linking='';say(error instanceof Error?error.message:'Wallet linking failed.');}finally{busy=false;render();}
  }
  function close(){panel.hidden=true;epoch++;review=null;awaiting=null;linking='';previousFocus?.focus();}
  panel.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;if(button.hasAttribute('data-close')){close();return;}if(busy||!options.allowed())return;
    try{
      if(button.hasAttribute('data-connect')){void connect();return;}if(button.hasAttribute('data-confirm')){void confirm();return;}if(button.hasAttribute('data-cancel')){review=null;render();return;}
      const data=button.dataset,tokenId=data.activate||data.list||data.unlist||data.buy||data.transfer,token=state?.tokens.find(token=>token.tokenId===tokenId),article=button.closest('article');
      if(data.seal)send({type:'specialistNftSeal',specialistId:data.seal});else if(data.activate)send({type:'specialistNftActivate',tokenId:data.activate});
      else if(data.check)send({type:'specialistNftCheck',orderId:data.check});else if(data.reviewOrder){const order=state?.orders.find(order=>order.id===data.reviewOrder);if(order){review={order};render();query('[data-confirm]').focus({preventScroll:true});}}
      else if(data.list)send({type:'specialistNftList',tokenId:data.list,amountWei:parseUnits(article!.querySelector<HTMLInputElement>('[data-price]')!.value.trim(),18).toString()});
      else if(data.unlist)send({type:'specialistNftList',tokenId:data.unlist,amountWei:'0'});
      else if(data.buy&&token)send({type:'specialistNftBuy',tokenId:token.tokenId,amountWei:token.amountWei,revision:token.revision,seller:token.owner});
      else if(data.transfer)send({type:'specialistNftTransfer',tokenId:data.transfer,recipient:article!.querySelector<HTMLInputElement>('[data-recipient]')!.value.trim()});
      else if(button.hasAttribute('data-find'))send({type:'specialistNftInspect',tokenId:query<HTMLInputElement>('[data-token]').value.trim()});
      else send({type:'specialistNftOpen',offset:data.page?Number(data.page):state?.offset||0});
    }catch(error){say(error instanceof Error?error.message:'Review a valid specialist action.');}
  });
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();close();}});
  return {open(){if(!options.allowed()||isNativeApp())return;options.onOpen();previousFocus=document.activeElement as HTMLElement;panel.hidden=false;owner=options.getPlayer()?.id||'';state=null;review=null;awaiting=null;epoch++;say('Checking specialist collection…');render();send({type:'specialistNftOpen',offset:0});query('button').focus();},close,isOpen:()=>!panel.hidden,
    handle(message:ServerMessage){
      if(panel.hidden)return;
      if(options.getPlayer()?.id!==owner){close();return;}
      if(message.type==='event'&&(message.requestType?.startsWith('specialistNft')||message.requestType?.startsWith('storeWallet'))){awaiting=null;say(message.text);return;}
      if(message.type==='storeWalletChallenge'){void handleChallenge(message);return;}
      if(message.type==='storeState'){if(message.message)say(message.message);if(message.state.wallet&&!spSame(message.state.wallet,state?.wallet))options.send({type:'specialistNftOpen',offset:0});return;}
      if(message.type==='specialistNftState'){if(state&&!spSame(state.wallet,message.state.wallet)){review=null;epoch++;}state=message.state;say(message.message||state.reason||'Sealed cards can be traded. Active cards stay locked to their character.');render();}
      else if(message.type==='specialistNftQuote'){
        const order=message.order;if(!specialistNftOrderValid(order)||order.characterId!==owner||!spSame(order.wallet,state?.wallet)||!spSame(order.contract,state?.contract)
          ||awaiting?.type==='specialistNftSeal'&&order.specialistId!==awaiting.specialistId||awaiting?.type==='specialistNftActivate'&&order.tokenId!==awaiting.tokenId)return;
        if(awaiting?.type!=='specialistNftSeal'&&awaiting?.type!=='specialistNftActivate')return;
        review={order};awaiting=null;render();query('[data-review]').scrollIntoView({block:'nearest'});query('[data-confirm]').focus({preventScroll:true});
      }else if(message.type==='specialistNftTransaction'){
        const value=message.transaction,request=awaiting;if(!request||!['specialistNftList','specialistNftBuy','specialistNftTransfer'].includes(request.type)||!spSame(value.wallet,state?.wallet)||!spSame(value.contract,state?.contract))return;
        const {type,...terms}=request,action=type==='specialistNftList'?'list':type==='specialistNftBuy'?'buy':'transfer';
        if(value.action!==action||Object.entries(terms).some(([key,expected])=>(value as unknown as Record<string,unknown>)[key]!==expected))return;
        try{specialistNftTransaction(value);review={transaction:value};awaiting=null;render();query('[data-review]').scrollIntoView({block:'nearest'});query('[data-confirm]').focus({preventScroll:true});}catch{say('The wallet transaction changed. Review again.');}
      }
    },
  };
}
