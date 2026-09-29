import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { Wallet, Interface, TypedDataEncoder, ZeroAddress, id, parseUnits } from 'ethers';
import { MOSS_TOKEN } from '../src/auction.ts';
import { ARENA_MATCH_TYPES, ARENA_RESULT_TYPES, arenaWagerAmount, arenaWagerSummary } from '../src/arena-wager.ts';
const hook=registerHooks({
 resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);},
 load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};return next(url,context);}
});
const {validateArenaWagerTransaction}=await import('../src/arena-wager-ui.ts');hook.deregister();
const authority=Wallet.createRandom(),other=Wallet.createRandom(),a=Wallet.createRandom().address,b=Wallet.createRandom().address,contract=Wallet.createRandom().address;
const artifact=JSON.parse(readFileSync(new URL('../public/contracts/MossvaleArena.json',import.meta.url),'utf8')),abi=new Interface(artifact.abi),token=new Interface(['function approve(address,uint256)']);
const now=1800000000000,domain={name:'MossvaleArena',version:'1',chainId:4663,verifyingContract:contract};
const terms={matchId:id('ui-wager'),playerA:a,playerB:b,stakeWei:parseUnits('100',18).toString(),fundingDeadline:now/1000+300,refundAfter:now/1000+1800};
const signature=await authority.signTypedData(domain,ARENA_MATCH_TYPES,terms),termsHash=TypedDataEncoder.hash(domain,ARENA_MATCH_TYPES,terms);
const order={...terms,termsHash,signature,chainId:4663,contract,token:MOSS_TOKEN.address,to:contract,data:abi.encodeFunctionData('fund',[terms,signature]),approval:{to:MOSS_TOKEN.address,data:token.encodeFunctionData('approve',[contract,terms.stakeWei])}};
const status={enabled:true,chainId:4663,contract,token:MOSS_TOKEN.address,decimals:18,authority:authority.address},view={order,opponentId:'opponent',opponentName:'Opponent',funded:0,closed:false};
const valid=validateArenaWagerTransaction(view,status,a,'fund',now);assert.equal(valid.to,contract);assert.equal(valid.value,0n);assert.equal(valid.data,order.data);assert.equal(valid.approval.data,order.approval.data);
for(const change of [{chainId:1},{token:other.address},{to:other.address},{stakeWei:'1'},{signature:await other.signTypedData(domain,ARENA_MATCH_TYPES,terms)},{data:'0x'},{approval:{to:MOSS_TOKEN.address,data:token.encodeFunctionData('approve',[contract,2n**256n-1n])}},{fundingDeadline:0},{playerB:a}])assert.throws(()=>validateArenaWagerTransaction({...view,order:{...order,...change}},status,a,'fund',now));
for(const change of [{enabled:false},{chainId:1},{token:other.address},{contract:other.address},{authority:other.address},{authority:undefined}])assert.throws(()=>validateArenaWagerTransaction(view,{...status,...change},a,'fund',now));
for(const change of [{closed:true},{closed:null},{funded:null},{funded:1},{funded:4}])assert.throws(()=>validateArenaWagerTransaction({...view,...change},status,a,'fund',now));
assert.throws(()=>validateArenaWagerTransaction(view,status,other.address,'fund',now));assert.throws(()=>validateArenaWagerTransaction(view,status,a,'fund',(terms.fundingDeadline+1)*1000));
assert.doesNotThrow(()=>validateArenaWagerTransaction({...view,funded:1},status,b,'fund',now));
for(const winner of [a,b,ZeroAddress]){
 const signed={matchId:terms.matchId,termsHash,winner},signature=await authority.signTypedData(domain,ARENA_RESULT_TYPES,signed);
 const result={winner,signature,to:contract,data:abi.encodeFunctionData('settle',[order,winner,signature]),chainId:4663,contract,matchId:terms.matchId},done={...view,funded:3,result};
 assert.equal(validateArenaWagerTransaction(done,status,a,'settle',now).data,result.data);
 for(const change of [{winner:other.address},{signature:await other.signTypedData(domain,ARENA_RESULT_TYPES,signed)},{data:'0x'},{to:other.address},{matchId:id('wrong')}])assert.throws(()=>validateArenaWagerTransaction({...done,result:{...result,...change}},status,a,'settle',now));
 assert.throws(()=>validateArenaWagerTransaction(done,status,a,'settle',terms.refundAfter*1000));
 if(winner!==ZeroAddress)assert.throws(()=>validateArenaWagerTransaction({...done,funded:1},status,a,'settle',now));
 else assert.doesNotThrow(()=>validateArenaWagerTransaction({...done,funded:1},status,a,'settle',now));
}
assert.throws(()=>validateArenaWagerTransaction({...view,funded:1},status,a,'refund',terms.fundingDeadline*1000));
assert.equal(validateArenaWagerTransaction({...view,funded:1},status,a,'refund',(terms.fundingDeadline+1)*1000).data,abi.encodeFunctionData('refund',[order]));
assert.throws(()=>validateArenaWagerTransaction({...view,funded:3},status,a,'refund',(terms.fundingDeadline+1)*1000));
assert.doesNotThrow(()=>validateArenaWagerTransaction({...view,funded:3},status,a,'refund',terms.refundAfter*1000));
assert.throws(()=>validateArenaWagerTransaction(view,status,a,'refund',terms.refundAfter*1000));
assert.equal(arenaWagerAmount('100'),parseUnits('100',18));assert.equal(arenaWagerAmount(''),0n);assert.equal(arenaWagerAmount('1e3'),null);
assert.deepEqual(arenaWagerSummary(parseUnits('100',18)),{stake:'100.0',pot:'200.0',tax:'10.0',payout:'190.0',burn:'8.0',treasury:'1.0',devTeam:'1.0'});
console.log('PASS arena wager UI: exact signed funding, approval amount, token/chain/authority/account, result tampering, draw settlement, funded bits, deadline refunds and MOSS tax split.');
