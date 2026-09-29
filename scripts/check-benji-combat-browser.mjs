import assert from 'node:assert/strict';
import {execFile}from'node:child_process';import{promisify}from'node:util';import{mkdirSync,writeFileSync}from'node:fs';import{resolve}from'node:path';
const run=promisify(execFile),session=`benji-combat-${process.pid}`,out=resolve('artifacts/benji-combat-2026-09-28'),url=process.argv[2]||'http://127.0.0.1:5195/benji-combat-review.html';mkdirSync(out,{recursive:true});
const browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{timeout:60000,maxBuffer:200000})).stdout;
try{
 await browser('set','viewport','1600','1050');await browser('open',url);await browser('wait','--fn',"document.body.dataset.ready==='true'");await browser('snapshot','-i');const coverage=[];
 for(const value of ['base','0','1','2','apostle','fx']){
  const entries=JSON.parse(await browser('eval',`window.benjiReview.show('${value}',.5)`));assert.equal(entries.length,value==='base'?15:value==='apostle'?3:value==='fx'?12:8);coverage.push({value,entries});
  await browser('wait','--fn',`document.querySelector('#view').value==='${value}'&&document.querySelectorAll('.label').length===${entries.length}`);
  await browser('screenshot',`${out}/${value==='base'?'instant-combat-base':value==='apostle'?'apostle-forms':value==='fx'?'apostle-spell-effects':`instant-combat-skills-${Number(value)+1}`}.png`);
  assert.equal(JSON.parse(await browser('eval',"document.querySelector('#view').value")),value,'capture did not race a development reload');
 }
 assert.deepEqual(JSON.parse(await browser('eval','window.benjiReview.errors')),[]);const errors=await browser('errors');assert(!errors.trim(),errors);writeFileSync(`${out}/coverage.json`,JSON.stringify(coverage,null,2)+'\n');
 console.log('PASS browser WebGL:15 IC models,24 native boss casts,3 Apostle forms,12 animated FX; zero browser errors. '+out);
}finally{await browser('close').catch(()=>{});}
