import { BrowserProvider, Contract, Interface, TypedDataEncoder, ZeroAddress, ZeroHash, formatUnits, getAddress, verifyTypedData, type TransactionRequest } from 'ethers';
import { MOSS_TOKEN } from './auction';
import arenaArtifact from '../public/contracts/MossvaleArena.json' with { type: 'json' };
import { ARENA_MATCH_TYPES, ARENA_RESULT_TYPES, arenaWagerSummary, type ArenaWagerOrder, type ArenaWagerView, type ArenaWagersState } from './arena-wager';
import type { ClientMessage, Player, ServerMessage } from './shared';
import { connectMossvaleWallet, type WalletProvider } from './wallet-provider';
import { isNativeApp } from './native-client';
import './arena-wager-ui.css';

const arenaPaymentABI=arenaArtifact.abi;
const arenaCalls=new Interface(arenaPaymentABI),tokenABI=['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'],tokenCalls=new Interface(tokenABI);
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const same=(a:string,b:string)=>getAddress(a)===getAddress(b),moss=(wei:bigint|string)=>formatUnits(wei,18).replace(/\.0$/,'');
const domain=(order:ArenaWagerOrder)=>({name:'MossvaleArena',version:'1',chainId:MOSS_TOKEN.chainId,verifyingContract:order.contract});
export function validateArenaWagerTransaction(view:ArenaWagerView,status:ArenaWagersState['status'],wallet:string,action:'fund'|'settle'|'refund',now=Date.now()){
  const o=view.order,amount=BigInt(o.stakeWei);
  if(!status.enabled||status.chainId!==4663||!status.contract||!same(status.contract,o.contract)||!status.token||!same(status.token,MOSS_TOKEN.address)||status.decimals!==18
    ||o.chainId!==4663||!same(o.token,MOSS_TOKEN.address)||!same(o.to,o.contract)||amount<=0n||amount>=(1n<<255n)||!/^0x[\da-f]{64}$/i.test(o.matchId)||/^0x0{64}$/i.test(o.matchId)
    ||!Number.isSafeInteger(o.fundingDeadline)||!Number.isSafeInteger(o.refundAfter)||o.fundingDeadline<=0||o.fundingDeadline>=o.refundAfter
    ||same(o.playerA,o.playerB)||[o.playerA,o.playerB].some(address=>same(address,ZeroAddress)||same(address,o.contract))||![o.playerA,o.playerB].some(address=>same(address,wallet))
    ||!/^0x[\da-f]{130}$/i.test(o.signature)||TypedDataEncoder.hash(domain(o),ARENA_MATCH_TYPES,o)!==o.termsHash||!status.authority||!same(verifyTypedData(domain(o),ARENA_MATCH_TYPES,o,o.signature),status.authority))throw Error('The wager terms or wallet changed. Check the wager before continuing.');
  const funding=arenaCalls.encodeFunctionData('fund',[o,o.signature]),approval=tokenCalls.encodeFunctionData('approve',[o.contract,amount]);
  if(o.data.toLowerCase()!==funding.toLowerCase()||!same(o.approval.to,MOSS_TOKEN.address)||o.approval.data.toLowerCase()!==approval.toLowerCase())throw Error('The wager payment does not match the reviewed stake.');
  if(view.closed!==false||view.funded===null||!Number.isInteger(view.funded)||view.funded<0||view.funded>3)throw Error('Check the on-chain wager status before continuing.');
  let data=funding;
  if(action==='fund'){
    const bit=same(wallet,o.playerA)?1:2;
    if(view.result||view.funded&bit||now>o.fundingDeadline*1000)throw Error('This stake is already funded or its funding window has ended.');
  }else if(action==='settle'){
    const r=view.result;
    if(!r||r.matchId!==o.matchId||r.chainId!==4663||!same(r.contract,o.contract)||!same(r.to,o.contract)||![ZeroAddress,o.playerA,o.playerB].some(address=>same(address,r.winner))||!/^0x[\da-f]{130}$/i.test(r.signature)||now>=o.refundAfter*1000)throw Error('The wager result is missing, changed or expired.');
    if(!same(r.winner,ZeroAddress)&&view.funded!==3)throw Error('Both stakes must be funded before paying a winner.');
    data=arenaCalls.encodeFunctionData('settle',[o,r.winner,r.signature]);
    if(r.data.toLowerCase()!==data.toLowerCase()||!same(verifyTypedData(domain(o),ARENA_RESULT_TYPES,{matchId:o.matchId,termsHash:o.termsHash,winner:r.winner},r.signature),status.authority))throw Error('The payout does not match the saved match result.');
  }else{
    if(!view.funded||!(now>=o.refundAfter*1000||view.funded!==3&&now>o.fundingDeadline*1000))throw Error('The refund deadline has not arrived.');
    data=arenaCalls.encodeFunctionData('refund',[o]);
  }
  return {to:getAddress(o.contract),data,value:0n,chainId:4663,approval:{to:getAddress(MOSS_TOKEN.address),data:approval,value:0n,chainId:4663}};
}

type WagerState=Extract<ServerMessage,{type:'arenaWagers'}>;
export function mountArenaWagerUI(options:{send:(message:ClientMessage)=>void;getPlayer:()=>Player|undefined;allowed:()=>boolean;onOpen:()=>void;now?:()=>number}){
  const panel=document.createElement('section');panel.id='arena-wagers';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','arena-wagers-title');document.body.append(panel);
  const pending=new Map<string,{action:'fund'|'settle'|'refund';hash:string}>();
  let walletRequest=new AbortController();
  let state:WagerState|undefined,selectedProvider:WalletProvider|undefined,epoch=0,busy=false,notice='',linking='',walletAddress='',owner='',focusMatch='';
  const now=options.now??Date.now,allowed=()=>!isNativeApp()&&options.allowed();
  const active=(operation:number)=>operation===epoch&&!panel.hidden&&owner===options.getPlayer()?.id&&allowed();
  function render(){
    if(panel.hidden)return;
    const focused=document.activeElement,focus=focused instanceof HTMLElement&&panel.contains(focused)?[focused.dataset.action,focused.dataset.match]:null,scroll=panel.scrollTop;
    const status=notice||state?.reason||(!state?'Loading…':!state.status.enabled?state.status.reason||'MOSS wagers unavailable.':'');
    panel.innerHTML=`<header><h2 id="arena-wagers-title">MOSS wagers</h2><button type="button" data-action="close" aria-label="Close wagers">×</button></header><div class="arena-wager-actions"><button type="button" data-action="link" ${busy?'disabled':''}>${selectedProvider&&state?.wallet?'Mossvale wallet':'Connect wallet'}</button><button type="button" data-action="refresh" ${busy?'disabled':''}>Refresh</button></div><p role="status" aria-live="polite" ${status?'':'hidden'}>${escape(status)}</p><div class="arena-wager-list">${state?.wagers.map(view=>{
      const o=view.order,preview=arenaWagerSummary(BigInt(o.stakeWei)),funded=view.funded,bit=state?.wallet&&same(state.wallet,o.playerA)?1:2,mine=!!state?.wallet&&[o.playerA,o.playerB].some(address=>same(address,state!.wallet!));
      const pendingAction=pending.get(o.matchId),ready=state!.status.enabled&&mine&&view.closed===false&&funded!==null&&!busy,paid=funded!==null&&!!(funded&bit),refund=!!funded&&(now()>=o.refundAfter*1000||funded!==3&&now()>o.fundingDeadline*1000);
      const status=pendingAction?'Payment pending…':view.closed===true?'Complete':funded===null?'Status unavailable. Refresh.':view.result?same(view.result.winner,ZeroAddress)?'Refund ready':state?.wallet&&same(view.result.winner,state.wallet)?'You won':'Opponent won':funded===3?'Waiting for match':paid?'Waiting for opponent':'';
      const deadline=view.closed?'':view.result&&!same(view.result.winner,ZeroAddress)&&now()<o.refundAfter*1000?`Claim by ${new Date(o.refundAfter*1000).toLocaleString()}`:refund?'':`${!paid&&!view.result?`Fund by ${new Date(o.fundingDeadline*1000).toLocaleString()} · `:''}Claim by ${new Date(o.refundAfter*1000).toLocaleString()}`;
      return `<article data-wager="${escape(o.matchId)}"><h3 translate="no">${escape(view.opponentName)}</h3><p><strong>${moss(o.stakeWei)} MOSS each</strong><br>Winner ${preview.payout.replace(/\.0$/,'')} MOSS · Tax ${preview.tax.replace(/\.0$/,'')} (5%)</p>${status?`<p>${escape(status)}</p>`:''}${deadline?`<p>${escape(deadline)}</p>`:''}<div class="arena-wager-actions">${!paid&&!view.result&&!view.closed?`<button type="button" data-action="fund" data-match="${escape(o.matchId)}" ${ready&&!pendingAction&&now()<=o.fundingDeadline*1000?'':'disabled'}>Fund ${moss(o.stakeWei)} MOSS</button>`:''}${view.result&&!view.closed&&!refund?`<button type="button" data-action="settle" data-match="${escape(o.matchId)}" ${ready&&!pendingAction&&now()<o.refundAfter*1000?'':'disabled'}>${same(view.result.winner,ZeroAddress)?'Refund':'Claim payout'}</button>`:''}${refund&&!view.closed?`<button type="button" data-action="refund" data-match="${escape(o.matchId)}" ${ready?'':'disabled'}>Refund</button>`:''}<button type="button" data-action="check" data-match="${escape(o.matchId)}" ${busy?'disabled':''}>Refresh</button></div></article>`;
    }).join('')||(!state?'':'<p>No wagers</p>')}</div>`;
    panel.scrollTop=scroll;
    if(focus){[...panel.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.dataset.action===focus[0]&&button.dataset.match===focus[1])?.focus({preventScroll:true});}
    if(focusMatch){panel.querySelector(`[data-wager="${CSS.escape(focusMatch)}"]`)?.scrollIntoView({block:'nearest'});focusMatch='';}
  }
  function close(){epoch++;walletRequest.abort();linking='';panel.hidden=true;}
  function reject(message:string){epoch++;walletRequest.abort();walletRequest=new AbortController();linking='';notice=message;render();}
  function open(matchId?:string,connect=false){if(!allowed())return;if(panel.hidden)walletRequest=new AbortController();options.onOpen();owner=options.getPlayer()!.id;panel.hidden=false;focusMatch=matchId??'';notice='Loading…';render();if(connect)void link();else options.send({type:'arenaWagerOpen'});}
  async function wallet(){const operation=epoch;if(!selectedProvider){const connected=await connectMossvaleWallet(walletRequest.signal);if(!active(operation))throw Error('Wallet request cancelled.');selectedProvider=connected;}if(!selectedProvider.mossvaleWallet)throw Error('Connect your Mossvale wallet.');return new BrowserProvider(selectedProvider,'any');}
  async function signer(provider:BrowserProvider,address:string){
    let accounts:string[]=await provider.send('eth_accounts',[]);if(!accounts.length)accounts=await provider.send('eth_requestAccounts',[]);
    if(!accounts[0]||!same(accounts[0],address)||BigInt(await provider.send('eth_chainId',[]))!==4663n)throw Error('Connect your Mossvale wallet before wagering.');
    return provider.getSigner(address);
  }
  async function link(){
    if(busy||!allowed())return;busy=true;const operation=epoch;notice='Opening Mossvale wallet…';render();
    try{const connected=await connectMossvaleWallet(walletRequest.signal);if(!active(operation))return;selectedProvider=connected;const provider=await wallet(),account=await provider.getSigner();if(!active(operation))return;linking=await account.getAddress();if(!active(operation))return;walletAddress=linking;if(state?.wallet&&same(state.wallet,linking)){linking='';notice='Wallet connected';options.send({type:'arenaWagerOpen'});return;}options.send({type:'arenaWalletChallenge',wallet:linking});notice='Confirm wallet.';}
    catch(error){if(active(operation))reject(error instanceof Error?error.message:'Wallet connection failed.');}
    finally{busy=false;if(!panel.hidden)render();}
  }
  async function walletChallenge(message:Extract<ServerMessage,{type:'arenaWalletChallenge'}>){
    if(busy||!linking||!same(message.address,linking)||message.expiresAt<=now()||!allowed()||panel.hidden)return;
    const operation=epoch,address=linking;busy=true;render();
    try{const provider=await wallet(),accounts:string[]=await provider.send('eth_accounts',[]);if(!active(operation))return;if(!accounts[0]||!same(accounts[0],address))throw Error('Wallet changed. Connect again.');
      const signed=await (await provider.getSigner(address)).signMessage(message.message);if(active(operation)&&linking===address&&message.expiresAt>now()){options.send({type:'arenaWalletBind',signature:signed});notice='Connecting…';}}
    catch(error){if(active(operation))reject(error instanceof Error?error.message:'Wallet link failed.');}
    finally{busy=false;if(!panel.hidden)render();}
  }
  async function transact(matchId:string,action:'fund'|'settle'|'refund'){
    if(busy||!state?.wallet||!allowed()||pending.has(matchId)&&action!=='refund')return;
    const view=state.wagers.find(row=>row.order.matchId===matchId);if(!view)return;
    const captured=structuredClone(view),address=state.wallet,terms=JSON.stringify([captured.order,captured.result]),operation=epoch;busy=true;notice='Confirm in Mossvale wallet.';render();
    function review(){
      if(!active(operation)||!state?.wallet||!same(state.wallet,address))throw Error('Wallet request cancelled.');
      const latest=state.wagers.find(row=>row.order.matchId===matchId);
      if(!latest||JSON.stringify([latest.order,latest.result])!==terms)throw Error('The wager changed. Check its status before continuing.');
      return validateArenaWagerTransaction(latest,state.status,address,action,now());
    }
    try{
      review();const provider=await wallet();if(!active(operation))return;await signer(provider,address);review();
      const o=captured.order,contract=new Contract(o.contract,arenaPaymentABI,provider),authority:string=await contract.authority();review();
      if(!state?.status.authority||!same(authority,state.status.authority)||!same(verifyTypedData(domain(o),ARENA_MATCH_TYPES,o,o.signature),authority))throw Error('The wager signature is invalid.');
      if(action==='settle'&&!same(verifyTypedData(domain(o),ARENA_RESULT_TYPES,{matchId:o.matchId,termsHash:o.termsHash,winner:captured.result!.winner},captured.result!.signature),authority))throw Error('The saved result signature is invalid.');
      async function fresh(){
        const chain=await contract.matches(matchId);review();
        if(chain.closed||chain.termsHash!==ZeroHash&&chain.termsHash.toLowerCase()!==o.termsHash.toLowerCase())throw Error('This wager is closed or its terms changed on-chain.');
        const live={...captured,funded:Number(chain.funded),closed:Boolean(chain.closed)};
        validateArenaWagerTransaction(live,state!.status,address,action,now());
      }
      async function sendTransaction(transaction:TransactionRequest){
        review();await signer(provider,address);review();await fresh();review();
        if(!selectedProvider?.mossvaleWallet)throw Error('Connect your Mossvale wallet.');
        const hash:string=await selectedProvider.request({method:'eth_sendTransaction',params:[provider.getRpcTransaction({...transaction,from:address})]});
        return {hash,wait:()=>provider.waitForTransaction(hash)};
      }
      await fresh();review();
      if(action==='fund'){
        const token=new Contract(MOSS_TOKEN.address,tokenABI,provider),amount=BigInt(o.stakeWei);
        let [balance,allowance]=await Promise.all([token.balanceOf(address),token.allowance(address,o.contract)]);review();
        if(balance<amount)throw Error('Not enough MOSS in your Mossvale wallet.');
        if(allowance<amount){notice=`Approve ${moss(amount)} MOSS.`;render();
          const approval=await sendTransaction(review().approval);review();notice='Approving…';render();const receipt=await approval.wait();review();if(receipt?.status!==1)throw Error('MOSS approval failed. Check the wager before retrying.');
          [balance,allowance]=await Promise.all([token.balanceOf(address),token.allowance(address,o.contract)]);review();if(balance<amount||allowance<amount)throw Error('Your MOSS balance or allowance changed.');}
      }
      const {approval:_approval,...transaction}=review();notice=action==='fund'?`Fund ${moss(captured.order.stakeWei)} MOSS.`:action==='settle'?'Confirm payout.':'Confirm refund.';render();
      const sent=await sendTransaction(transaction);pending.set(matchId,{action,hash:sent.hash});busy=false;if(active(operation)){notice=`Payment pending…`;options.send({type:'arenaWagerCheck',matchId});render();}
      const receipt=await sent.wait();if(receipt)pending.delete(matchId);if(!active(operation))return;if(receipt?.status!==1)throw Error('The transaction did not succeed. Check status before retrying.');notice='Confirming…';options.send({type:'arenaWagerCheck',matchId});
    }catch(error){if(active(operation))notice=error instanceof Error?error.message:'The wallet request failed. Check wager status before retrying.';}
    finally{busy=false;if(!panel.hidden)render();}
  }
  panel.addEventListener('click',event=>{event.stopPropagation();const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;const {action,match}=button.dataset;
    if(action==='close')close();else if(action==='link')void link();else if(action==='refresh')options.send({type:'arenaWagerOpen'});else if(action==='check'&&match)options.send({type:'arenaWagerCheck',matchId:match});else if(match&&(action==='fund'||action==='settle'||action==='refund'))void transact(match,action);
  });
  panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
  for(const event of ['pointerdown','pointerup','dblclick'])panel.addEventListener(event,e=>e.stopPropagation());
  window.addEventListener('mossvale-wallet-reset',()=>{selectedProvider=undefined;walletAddress='';close();});
  return {open,close,connect(){open(undefined,true);},walletReady(){const player=options.getPlayer();return !!player&&owner===player.id&&!!selectedProvider?.mossvaleWallet&&!!walletAddress&&!!state?.wallet&&same(walletAddress,state.wallet);},walletChallenge,reject,isOpen:()=>!panel.hidden,update(next:WagerState){if(!allowed())return;if(panel.hidden&&!next.open)return;if(panel.hidden){walletRequest=new AbortController();owner=options.getPlayer()!.id;panel.hidden=false;options.onOpen();}state=next;for(const view of next.wagers){const item=pending.get(view.order.matchId);if(item&&(view.closed||item.action==='fund'&&next.wallet&&view.funded!==null&&!!(view.funded&(same(next.wallet,view.order.playerA)?1:2))))pending.delete(view.order.matchId);}if(linking&&next.wallet&&same(linking,next.wallet))linking='';if(!busy)notice=next.reason??'';render();},reset(){close();state=undefined;owner='';selectedProvider=undefined;walletAddress='';notice='';}};
}
