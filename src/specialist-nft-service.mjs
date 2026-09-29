import { randomUUID } from 'node:crypto';
import { bagCanFit } from './bags.ts';
import { newRaidProgress, raidProgressValid } from './raid-progression.ts';
import { spSame, specialistNftPlayerValid, specialistNftOrderValid } from './specialist-nft.ts';
import { createSpecialistNftChain } from './specialist-nft-chain.mjs';

const fields={specialistNftOpen:['offset'],specialistNftInspect:['tokenId'],specialistNftSeal:['specialistId'],specialistNftActivate:['tokenId'],specialistNftCheck:['orderId'],
  specialistNftList:['tokenId','amountWei'],specialistNftBuy:['tokenId','amountWei','revision','seller'],specialistNftTransfer:['tokenId','recipient']};
export const specialistNftBusy=player=>(player.specialistNftOrders||[]).some(order=>order.status==='quoted');
export const specialistNftLocked=player=>specialistNftBusy(player)||(player.raidProgress?.specialists||[]).some(card=>card.nft&&!card.sealed);

/** commit(owner, changesCallback, allowOffline) must use the existing account lock + atomic durable save. */
export function createSpecialistNftService({chain=createSpecialistNftChain(),commit}={}) {
  const settling=new Map();
  async function state(player,offset=0){const status=await chain.status();return {...status,wallet:player.auctionWallet||null,orders:player.specialistNftOrders||[],...(status.enabled?await chain.page(offset):{tokens:[],offset:0,total:0})};}
  async function settle(owner,orderId){
    const key=`${owner.player.id}:${orderId}`;if(settling.has(key))return settling.get(key);
    const run=(async()=>{
      const order=owner.player.specialistNftOrders?.find(order=>order.id===orderId);
      if(!order||order.status!=='quoted')return;
      const serialized=JSON.stringify(order),result=await chain.settlement(order);
      if(result.state==='pending')return;
      if(!['confirmed','expired'].includes(result.state))throw Error('Invalid specialist settlement.');
      await commit(owner,async player=>{
        const current=player.specialistNftOrders?.find(entry=>entry.id===orderId);
        if(JSON.stringify(current)!==serialized)return;
        const progress=structuredClone(player.raidProgress),index=progress?.specialists.findIndex(card=>card.id===order.specialistId);
        if(index===undefined||index<0||!progress.specialists[index].sealed)throw Error('Reserved specialist is unavailable.');
        const changes={raidProgress:progress,specialistNftOrders:player.specialistNftOrders.map(entry=>entry.id===orderId?{...entry,status:result.state}:entry)};
        if(result.state==='confirmed'){
          progress.specialists[index]={...order.card,sealed:order.action!=='activate',nft:{tokenId:order.tokenId,contract:order.contract,wallet:order.wallet,version:order.contractOrder.revision+1}};
        }else{
          if(order.action==='activate'){
            if(order.previousCard)progress.specialists[index]=order.previousCard;else progress.specialists.splice(index,1);
          }else{
            progress.specialists[index]=order.card;
            changes.carriedItems={...player.carriedItems,'sp-specialist-case':(player.carriedItems?.['sp-specialist-case']||0)+1};
            // Keep the reservation pending until a refund fits; never drop a paid case.
            if(!bagCanFit(player,changes))return;
          }
        }
        if(!raidProgressValid(progress)||!specialistNftPlayerValid({...player,...changes}))throw Error('Invalid specialist settlement data.');
        return changes;
      },true);
    })().finally(()=>settling.delete(key));settling.set(key,run);return run;
  }
  return {state,settle,
    async handle(owner,message,{nativePlatform,canAct=()=>true}={}){
      // The platform guard precedes any RPC, authorization or state read.
      if(nativePlatform==='ios'||nativePlatform==='apple')throw Error('Specialist NFT trading is unavailable in the iOS app.');
      const required=fields[message?.type];if(!required||Object.keys(message).length!==required.length+1||!required.every(key=>Object.hasOwn(message,key)))throw Error('Invalid specialist NFT request.');
      const player=owner.player;if(!specialistNftPlayerValid(player)||!raidProgressValid(player.raidProgress))throw Error('Invalid specialist save.');
      if(message.type==='specialistNftOpen')return {state:await state(player,message.offset)};
      if(message.type==='specialistNftInspect'){const status=await state(player),token=await chain.inspect(message.tokenId);return {state:{...status,tokens:[token],offset:0,total:1}};}
      if(message.type==='specialistNftCheck'){if(!player.specialistNftOrders?.some(order=>order.id===message.orderId))throw Error('That specialist order belongs to another character.');await settle(owner,message.orderId);return {state:await state(player),message:'Specialist transaction checked. Unconfirmed reservations remain safe until chain finality.'};}
      const wallet=player.auctionWallet;
      if(!wallet||player.level<60||!canAct())throw Error('Reach level 60, link your wallet and finish combat before trading specialists.');
      if(['specialistNftList','specialistNftBuy','specialistNftTransfer'].includes(message.type)){
        const {type,...terms}=message,action=type==='specialistNftList'?'list':type==='specialistNftBuy'?'buy':'transfer';
        const transaction=await chain.transaction({...terms,wallet,action});
        if(!canAct()||player.auctionWallet!==wallet)throw Error('Your character or wallet changed.');return {transaction};
      }
      const pending=player.specialistNftOrders?.find(order=>order.status==='quoted'&&(message.type==='specialistNftSeal'?order.specialistId===message.specialistId:order.tokenId===message.tokenId));
      if(pending){await settle(owner,pending.id);const current=player.specialistNftOrders.find(order=>order.id===pending.id);return {state:await state(player),...(current.status==='quoted'?{order:current}:{})};}
      let prepared;
      const committed=await commit(owner,async current=>{
        if(!canAct()||current.auctionWallet!==wallet)return;
        let progress=structuredClone(current.raidProgress||newRaidProgress());const orders=current.specialistNftOrders||[];
        if(orders.length>=10000)throw Error('Specialist transaction history is full. Contact support.');
        let card,previousCard,action;
        if(message.type==='specialistNftActivate'){
          const token=await chain.inspect(message.tokenId);
          if(!spSame(token.owner,wallet)||token.active||token.card.className!==current.appearance.className)throw Error('Choose a sealed specialist owned by your wallet for your class.');
          previousCard=progress.specialists.find(card=>card.nft?.tokenId===token.tokenId&&spSame(card.nft.contract,token.card.nft.contract));
          if(previousCard&&!previousCard.sealed)throw Error('This specialist is already active.');
          if(!previousCard&&progress.specialists.length>=100)throw Error('Your specialist collection is full.');
          card={...token.card,...(previousCard?{id:previousCard.id,source:previousCard.source}:{})};action='activate';
        }else{
          card=progress.specialists.find(card=>card.id===message.specialistId);
          if(!card||card.sealed)throw Error('Choose an available specialist.');
          if(!(current.carriedItems?.['sp-specialist-case']>0))throw Error('A Specialist Case is required every time you seal a card.');
          if(card.nft&&!spSame(card.nft.wallet,wallet))throw Error('Link the wallet that owns this specialist.');
          action=card.nft?'seal':'mint';
        }
        if(orders.some(order=>order.status==='quoted'&&(order.specialistId===card.id||order.tokenId===card.nft?.tokenId)))throw Error('Check the pending specialist transaction first.');
        prepared=await chain.prepare({id:randomUUID(),characterId:current.id,wallet,card,action});
        if(previousCard)prepared.previousCard=structuredClone(previousCard);
        if(!canAct()||current.auctionWallet!==wallet)return;
        if(!specialistNftOrderValid(prepared)||prepared.characterId!==current.id||!spSame(prepared.wallet,wallet)||prepared.specialistId!==card.id||JSON.stringify(prepared.card)!==JSON.stringify(card)||prepared.action!==action)throw Error('Specialist authorization changed.');
        // Party XP may arrive during RPC even while the account writer is locked.
        // Never freeze an older card or overwrite unrelated progression from that wait.
        progress=structuredClone(current.raidProgress||newRaidProgress());
        if(action!=='activate'&&(JSON.stringify(progress.specialists.find(entry=>entry.id===card.id))!==JSON.stringify(card)||!(current.carriedItems?.['sp-specialist-case']>0)))return;
        if(action==='activate'&&(previousCard?JSON.stringify(progress.specialists.find(entry=>entry.id===card.id))!==JSON.stringify(previousCard):progress.specialists.length>=100))return;
        const index=progress.specialists.findIndex(entry=>entry.id===card.id),frozen={...card,sealed:true};
        if(index<0)progress.specialists.push(frozen);else progress.specialists[index]=frozen;
        if(progress.activeSpecialistId===card.id)progress.activeSpecialistId=null;
        const changes={raidProgress:progress,specialistNftOrders:[...orders,prepared]};
        if(action!=='activate'){changes.carriedItems={...current.carriedItems};if(!--changes.carriedItems['sp-specialist-case'])delete changes.carriedItems['sp-specialist-case'];}
        if(!raidProgressValid(progress)||!specialistNftPlayerValid({...current,...changes}))throw Error('Invalid specialist reservation.');
        return changes;
      });
      if(!committed)throw Error('The specialist reservation was not saved. No wallet authorization was released.');
      return {state:await state(player),order:player.specialistNftOrders.find(order=>order.id===prepared.id)};
    },
  };
}
