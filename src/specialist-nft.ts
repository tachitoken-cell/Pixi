import { Interface, TypedDataEncoder, getAddress, id } from 'ethers';
import type { SpecialistCard } from './raid-progression.ts';
import { specialistValid } from './raid-progression.ts';

export const SP_CLASSES = ['Knight','Ranger','Mage','Cleric'] as const;
export const SP_NFT_TYPES = { Progress: [{name:'classId',type:'uint8'},{name:'jobXp',type:'uint32'},{name:'upgrade',type:'uint8'},{name:'broken',type:'bool'},{name:'attempts',type:'uint64'}],
  Order: [{name:'orderId',type:'bytes32'},{name:'action',type:'uint8'},{name:'tokenId',type:'uint256'},{name:'revision',type:'uint64'},{name:'wallet',type:'address'},{name:'character',type:'bytes32'},{name:'progress',type:'Progress'},{name:'deadline',type:'uint64'}] };
export const SP_NFT_ABI = ['function transition((bytes32 orderId,uint8 action,uint256 tokenId,uint64 revision,address wallet,bytes32 character,(uint8 classId,uint32 jobXp,uint8 upgrade,bool broken,uint64 attempts) progress,uint64 deadline),bytes)',
  'function list(uint256 tokenId,uint256 amountWei)','function buy(uint256 tokenId,address seller,uint64 revision,uint256 amountWei)','function safeTransferFrom(address from,address to,uint256 tokenId)'];
export const spNftInterface = new Interface(SP_NFT_ABI);
export const spCharacterHash = (characterId:string) => id(`mossvale-specialist-character:${characterId}`);
export const spProgress = (card:SpecialistCard) => ({classId:SP_CLASSES.indexOf(card.className),jobXp:card.jobXp,upgrade:card.upgrade,broken:card.broken,attempts:card.attempts});
export type SpecialistNftAction = 'mint'|'activate'|'seal';
export interface SpecialistNftOrder {
  id:string; characterId:string; specialistId:string; wallet:string; contract:string; chainId:4663; action:SpecialistNftAction;
  tokenId:string; status:'quoted'|'confirmed'|'expired'; expiresAt:number; orderHash:string; signature:string; card:SpecialistCard;
  contractOrder:{orderId:string;action:number;tokenId:string;revision:number;wallet:string;character:string;progress:ReturnType<typeof spProgress>;deadline:number};
  previousCard?:SpecialistCard;
}
export interface SpecialistNftToken { tokenId:string; owner:string; card:SpecialistCard; active:boolean; character:string; revision:number; amountWei:string; }
export interface SpecialistNftState { configured:boolean; enabled:boolean; reason?:string; contract?:string; wallet:string|null; orders:SpecialistNftOrder[]; tokens:SpecialistNftToken[]; offset:number; total:number; }
export type SpecialistNftMessage = {type:'specialistNftOpen';offset:number}|{type:'specialistNftInspect';tokenId:string}|{type:'specialistNftSeal';specialistId:string}
  |{type:'specialistNftActivate';tokenId:string}|{type:'specialistNftCheck';orderId:string}|{type:'specialistNftList';tokenId:string;amountWei:string}
  |{type:'specialistNftBuy';tokenId:string;amountWei:string;revision:number;seller:string}|{type:'specialistNftTransfer';tokenId:string;recipient:string};
export interface SpecialistNftTransaction { action:'list'|'buy'|'transfer'; wallet:string; contract:string; tokenId:string; amountWei?:string; revision?:number; seller?:string; recipient?:string; }
export type SpecialistNftServerMessage = {type:'specialistNftState';state:SpecialistNftState;message?:string}
  |{type:'specialistNftQuote';order:SpecialistNftOrder}|{type:'specialistNftTransaction';transaction:SpecialistNftTransaction};
export const spUint = (value:unknown):value is string => typeof value==='string'&&/^(?:0|[1-9]\d{0,77})$/.test(value)&&BigInt(value)<2n**256n;
export const spSame = (a:unknown,b:unknown) => typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export const spAddress = (value:unknown):value is string => {try{return typeof value==='string'&&BigInt(getAddress(value))!==0n;}catch{return false;}};
export function specialistNftOrderValid(value:unknown):value is SpecialistNftOrder {
  try {
    const order=value as SpecialistNftOrder, actions=['mint','activate','seal'];
    if(!order||!actions.includes(order.action)||!['quoted','confirmed','expired'].includes(order.status)||!specialistValid(order.card)
      ||typeof order.id!=='string'||!/^[\da-f-]{36}$/i.test(order.id)||typeof order.characterId!=='string'||!/^[\da-f-]{36}$/i.test(order.characterId)
      ||order.previousCard!==undefined&&(!specialistValid(order.previousCard)||order.previousCard.id!==order.card.id)
      ||order.specialistId!==order.card.id||!spAddress(order.wallet)||!spAddress(order.contract)||order.chainId!==4663||!spUint(order.tokenId)||order.tokenId==='0'
      ||!Number.isSafeInteger(order.expiresAt)||order.expiresAt<=0||order.expiresAt%1000!==0||!/^0x[\da-f]{130}$/i.test(order.signature))return false;
    const revision=order.card.nft?.version||0;
    if(order.action==='mint' ? order.card.nft!==undefined||order.tokenId!==BigInt(id(`mossvale-specialist:${order.characterId}:${order.card.id}`)).toString()
      : !order.card.nft||!spSame(order.card.nft.contract,order.contract)||order.card.nft.tokenId!==order.tokenId||!spSame(order.card.nft.wallet,order.wallet))return false;
    const expected={orderId:id(`mossvale-specialist-order:${order.characterId}:${order.id}`),action:actions.indexOf(order.action),tokenId:order.tokenId,revision,wallet:order.wallet,
      character:spCharacterHash(order.characterId),progress:spProgress(order.card),deadline:order.expiresAt/1000};
    const domain={name:'MossvaleSpecialists',version:'1',chainId:4663,verifyingContract:order.contract};
    const digest=TypedDataEncoder.hash(domain,SP_NFT_TYPES,expected);
    return spSame(order.orderHash,digest)&&TypedDataEncoder.hash(domain,SP_NFT_TYPES,order.contractOrder)===digest;
  } catch{return false;}
}
export function specialistNftPlayerValid(player:{id:string;specialistNftOrders?:SpecialistNftOrder[]}) {
  const orders=player.specialistNftOrders??[];
  return Array.isArray(orders)&&orders.length<=10000&&orders.every(order=>specialistNftOrderValid(order)&&order.characterId===player.id)
    &&new Set(orders.map(order=>order.id)).size===orders.length&&new Set(orders.filter(order=>order.status==='quoted').map(order=>order.tokenId)).size===orders.filter(order=>order.status==='quoted').length;
}
export function specialistNftTransaction(value:SpecialistNftTransaction) {
  if(!value||!spAddress(value.wallet)||!spAddress(value.contract)||!spUint(value.tokenId)||value.tokenId==='0')throw Error('Invalid specialist transaction.');
  let data:string;
  if(value.action==='list'&&spUint(value.amountWei))data=spNftInterface.encodeFunctionData('list',[value.tokenId,value.amountWei]);
  else if(value.action==='buy'&&spUint(value.amountWei)&&value.amountWei!=='0'&&Number.isSafeInteger(value.revision)&&value.revision!>0&&spAddress(value.seller))data=spNftInterface.encodeFunctionData('buy',[value.tokenId,value.seller,value.revision,value.amountWei]);
  else if(value.action==='transfer'&&spAddress(value.recipient)&&!spSame(value.recipient,value.wallet))data=spNftInterface.encodeFunctionData('safeTransferFrom',[value.wallet,value.recipient,value.tokenId]);
  else throw Error('Invalid specialist transaction.');
  return {to:value.contract,data,value:'0x0',chainId:'0x1237'};
}
