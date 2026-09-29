import { readFileSync } from 'node:fs';
import { Interface, Wallet, TypedDataEncoder, id, keccak256, ZeroHash } from 'ethers';
import { MOSS_TOKEN } from './auction.ts';
import { MOSS_TOKEN_RUNTIME_HASH } from './auction-chain.mjs';
import { getChainRpc, createNftRpc } from './nft-rpc.mjs';
import { SP_CLASSES, SP_NFT_TYPES, spSame, spAddress, spUint, spProgress, spCharacterHash, specialistNftOrderValid, specialistNftTransaction } from './specialist-nft.ts';
const artifact = name => JSON.parse(readFileSync(new URL(`../public/contracts/${name}.json`,import.meta.url),'utf8'));
const hash=value=>typeof value==='string'&&/^0x[\da-f]{64}$/i.test(value);
const quantity=value=>typeof value==='string'&&/^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value);
const validBlock=block=>hash(block?.hash)&&quantity(block.number)&&quantity(block.timestamp);
const tag=block=>({blockHash:block.hash,requireCanonical:true});

/** Sign and verify only. Wallets explicitly submit every chain transaction. */
export function createSpecialistNftChain({contract=process.env.SP_NFT_CONTRACT||'',authorityKey=process.env.SP_NFT_AUTHORITY_KEY||process.env.NFT_AUTHORITY_KEY||'',
  feeReceiver=process.env.NFT_FEE_RECEIVER||'',rpcUrl=process.env.NFT_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public',rpc:customRpc}={}) {
  const configured=!!contract, rpc=customRpc?createNftRpc(customRpc,{spacingMs:0}):getChainRpc(rpcUrl);
  let signer,abi,compiled,fees,configError,lastFinalized;
  try {if(!configured)throw Error('Specialist NFTs are not deployed and configured yet.');if(!spAddress(contract)||!spAddress(feeReceiver)||spSame(contract,feeReceiver))throw Error('Invalid specialist deployment.');signer=new Wallet(authorityKey);compiled=artifact('MossvaleSpecialists');abi=new Interface(compiled.abi);fees=artifact('MossvaleBuyBurn');}
  catch(error){configError=error.message;}
  const call=async(name,args,block)=>abi.decodeFunctionResult(name,await rpc('eth_call',[{to:contract,data:abi.encodeFunctionData(name,args)},tag(block)]));
  async function canonical(block){const current=await rpc('eth_getBlockByNumber',[block.number,false]);if(!validBlock(current)||current.number!==block.number||!spSame(current.hash,block.hash))throw Error('Specialist chain changed during verification. Retry shortly.');}
  async function blocks(){
    if(configError)throw Error(configError);
    if(BigInt(await rpc('eth_chainId',[]))!==4663n)throw Error('Specialist RPC is on the wrong chain.');
    const final=await rpc('eth_getBlockByNumber',['finalized',false]),latest=await rpc('eth_getBlockByNumber',['latest',false]),now=Math.floor(Date.now()/1000);
    if(!validBlock(final)||!validBlock(latest)||Math.abs(Number(BigInt(final.timestamp))-now)>1800||Math.abs(Number(BigInt(latest.timestamp))-now)>120
      ||BigInt(latest.number)<BigInt(final.number)||BigInt(latest.timestamp)<BigInt(final.timestamp)||latest.number===final.number&&!spSame(latest.hash,final.hash)
      ||lastFinalized&&(BigInt(final.number)<BigInt(lastFinalized.number)||final.number===lastFinalized.number&&!spSame(final.hash,lastFinalized.hash)))throw Error('Specialist chain finality is stale or inconsistent.');
    const deployments=[[contract,compiled.runtimeCodeHash],[feeReceiver,fees.runtimeCodeHash],[MOSS_TOKEN.address,MOSS_TOKEN_RUNTIME_HASH]];
    const codes=await Promise.all(deployments.map(([address])=>rpc('eth_getCode',[address,tag(final)])));
    if(codes.some((code,index)=>keccak256(code)!==deployments[index][1]))throw Error('Specialist deployment does not match the reviewed contracts.');
    const [authority,receiver,royalty,token]=await Promise.all([call('authority',[],final),call('feeReceiver',[],final),call('royaltyInfo',[1,10000],final),call('paymentToken',[],final)]);
    if(!spSame(authority[0],signer.address)||!spSame(receiver[0],feeReceiver)||!spSame(royalty[0],feeReceiver)||royalty[1]!==500n||!spSame(token[0],MOSS_TOKEN.address))throw Error('Specialist collection configuration does not match this realm.');
    const feeAbi=new Interface(fees.abi),[feeToken]=feeAbi.decodeFunctionResult('paymentToken',await rpc('eth_call',[{to:feeReceiver,data:feeAbi.encodeFunctionData('paymentToken')},tag(final)]));
    if(!spSame(feeToken,MOSS_TOKEN.address))throw Error('Specialist royalties must use the MOSS fee receiver.');
    await canonical(final);await canonical(latest);lastFinalized=final;return {final,latest};
  }
  function decode(tokenId,owner,data,price){
    const progress=data[0],revision=Number(data[1]);
    if(!SP_CLASSES[Number(progress[0])]||!Number.isSafeInteger(revision)||revision<1||!Number.isSafeInteger(Number(progress[4])))throw Error('Invalid specialist progress.');
    return {tokenId:String(tokenId),owner,revision,character:data[2],active:data[3],amountWei:String(price),card:{id:`sp-${tokenId}`,className:SP_CLASSES[Number(progress[0])],jobXp:Number(progress[1]),upgrade:Number(progress[2]),broken:progress[3],attempts:Number(progress[4]),source:'nft',sealed:!data[3],nft:{tokenId:String(tokenId),contract,wallet:owner,version:revision}}};
  }
  async function readToken(tokenId,block){if(!spUint(tokenId)||tokenId==='0')throw Error('Enter a valid specialist token ID.');const [owner,data,price]=await Promise.all([call('ownerOf',[tokenId],block),call('cards',[tokenId],block),call('prices',[tokenId],block)]);return decode(tokenId,owner[0],data,price[0]);}
  async function tokenAtBoth(tokenId,observed){const [final,current]=await Promise.all([readToken(tokenId,observed.final),readToken(tokenId,observed.latest)]);if(JSON.stringify(final)!==JSON.stringify(current))throw Error('Specialist ownership or progress is awaiting finality.');return final;}
  return {
    configured, contract,
    async status(){try{await blocks();return {configured,enabled:true,contract};}catch(error){return {configured,enabled:false,contract:configured?contract:undefined,reason:error.message};}},
    async page(offset=0){if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid collection page.');const observed=await blocks();const [page,total]=await Promise.all([call('page',[offset],observed.final),call('totalSupply',[],observed.final)]);await canonical(observed.final);return {offset,total:Number(total[0]),tokens:page[0].map(row=>decode(row[0],row[1],row[2],row[3]))};},
    async inspect(tokenId){const observed=await blocks(),token=await tokenAtBoth(tokenId,observed);await canonical(observed.final);await canonical(observed.latest);return token;},
    async prepare({id:orderId,characterId,wallet,card,action}){
      if(!spAddress(wallet))throw Error('Link your wallet first.');
      const observed=await blocks(),tokenId=card.nft?.tokenId||BigInt(id(`mossvale-specialist:${characterId}:${card.id}`)).toString();
      if(action!=='mint'){
        const token=await tokenAtBoth(tokenId,observed);
        if(!spSame(token.owner,wallet)||token.revision!==card.nft?.version||!spSame(card.nft?.contract,contract))throw Error('Specialist ownership or revision changed.');
        if(action==='activate'?token.active||JSON.stringify(spProgress(token.card))!==JSON.stringify(spProgress(card)):!token.active||token.character!==spCharacterHash(characterId))throw Error('Specialist activation changed.');
      }else if(card.nft||card.sealed)throw Error('This specialist is already reserved.');
      const deadline=Number(BigInt(observed.latest.timestamp))+300;
      const contractOrder={orderId:id(`mossvale-specialist-order:${characterId}:${orderId}`),action:['mint','activate','seal'].indexOf(action),tokenId,revision:card.nft?.version||0,wallet,character:spCharacterHash(characterId),progress:spProgress(card),deadline};
      const domain={name:'MossvaleSpecialists',version:'1',chainId:4663,verifyingContract:contract};
      const order={id:orderId,characterId,specialistId:card.id,wallet,contract,chainId:4663,action,tokenId,status:'quoted',expiresAt:deadline*1000,orderHash:TypedDataEncoder.hash(domain,SP_NFT_TYPES,contractOrder),signature:await signer.signTypedData(domain,SP_NFT_TYPES,contractOrder),card:structuredClone(card),contractOrder};
      if(!specialistNftOrderValid(order))throw Error('Invalid specialist authorization.');await canonical(observed.final);await canonical(observed.latest);return order;
    },
    async settlement(order){
      if(!specialistNftOrderValid(order)||!spSame(order.contract,contract))throw Error('Specialist order belongs to another deployment.');
      const observed=await blocks(),[claimed]=await call('claimedOrders',[order.contractOrder.orderId],observed.final);
      if(claimed!==ZeroHash&&!spSame(claimed,order.orderHash))throw Error('Specialist order has a conflicting settlement.');
      if(spSame(claimed,order.orderHash)){
        // Activation imports only after the token is locked to this exact character, at finality and now.
        if(order.action==='activate'){
          const token=await tokenAtBoth(order.tokenId,observed);
          if(!token.active||token.character!==spCharacterHash(order.characterId)||!spSame(token.owner,order.wallet)||token.revision!==order.contractOrder.revision+1||JSON.stringify(spProgress(token.card))!==JSON.stringify(spProgress(order.card)))throw Error('Specialist activation no longer matches.');
        }
        await canonical(observed.final);await canonical(observed.latest);return {state:'confirmed'};
      }
      await canonical(observed.final);return {state:BigInt(observed.final.timestamp)>BigInt(order.contractOrder.deadline)?'expired':'pending'};
    },
    async transaction({wallet,action,tokenId,amountWei,revision,seller,recipient}){
      if(!spAddress(wallet))throw Error('Link your wallet first.');
      const observed=await blocks(),token=await tokenAtBoth(tokenId,observed);
      if(token.active)throw Error('Seal the specialist before trading.');
      if(action==='buy'?spSame(token.owner,wallet)||!spSame(token.owner,seller)||token.amountWei!==amountWei||token.revision!==revision:!spSame(token.owner,wallet))throw Error('The specialist owner or listing changed.');
      const terms={wallet,contract,action,tokenId,...(amountWei!==undefined?{amountWei}:{}),...(revision!==undefined?{revision}:{}),...(seller!==undefined?{seller}:{}),...(recipient!==undefined?{recipient}:{})};
      specialistNftTransaction(terms);await canonical(observed.final);await canonical(observed.latest);return terms;
    },
  };
}
