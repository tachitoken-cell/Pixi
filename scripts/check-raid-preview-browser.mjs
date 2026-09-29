import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const url=process.argv[2]||'http://127.0.0.1:5183/raid-preview.html';
const output=resolve('artifacts/horned-apostle-2026-09-24/interactive-preview');
const run=promisify(execFile),session=`raid-preview-check-${process.pid}`;
const browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{timeout:120000,maxBuffer:2_000_000})).stdout;
const evaluate=async code=>JSON.parse(await browser('eval',code));
mkdirSync(output,{recursive:true});
try {
 await browser('set','viewport','1440','900');
 await browser('open',url+'?effects=high');
 await browser('wait','--fn',"document.body.dataset.ready==='true' && !!window.__raidPreview?.state");
 assert(await evaluate("window.__raidPreview.state.mechanicId==='full-route' && window.__raidPreview.state.raid.approach.roomIndex===0"),'preview starts at the first room of the full route');
 assert(await evaluate("document.querySelector('#raid-hud .raid-hud-heading')?.textContent.includes('Room 1 / 8')"),'route progress is visible once in the HUD heading');
 const entries=await evaluate(`(async()=>{
  const select=document.querySelector('#mechanic'),results=[];
  if(!select)throw Error('Missing mechanic selector');
  const ids=[...select.options].map(option=>option.value).filter(Boolean);
  for(const id of ids){
   select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
   const deadline=performance.now()+6000;
   while(window.__raidPreview.state?.mechanicId!==id){if(performance.now()>deadline)throw Error('Mechanic did not load: '+id);await new Promise(resolve=>setTimeout(resolve,40));}
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const state=window.__raidPreview.state;
   results.push({id,phase:state.raid?.phase,paused:state.paused,enemies:state.enemies.length,room:state.raid.approach?.roomIndex,models:state.enemies.map(e=>e.model),hazards:state.raid?.hazards.map(h=>h.kind)||[],cast:window.__raidPreview.actors.find(a=>a.id===state.raid.bossId)?.cast?.clip,sanctum:window.__raidPreview.visuals.sanctum,visibleRooms:window.__raidPreview.visuals.visibleRooms,effects:window.__raidPreview.visuals.effects});
  }
  return results;
 })()`);
 assert(entries.length>=29,'every chamber and raid mechanic is available');
 const chambers=entries.filter(entry=>entry.id.startsWith('chamber-'));assert.equal(chambers.length,6);assert.equal(new Set(chambers.flatMap(entry=>entry.models)).size,24,'all source creatures render in the six chambers');
 assert(chambers.every((entry,index)=>entry.phase==='approach'&&entry.room===index&&entry.enemies===4));
 for(const [id,kind]of [['morgrath-cleave','Morgrath Cleave'],['morgrath-rift','Morgrath Rift'],['morgrath-rupture','Morgrath Rupture']])assert(entries.find(entry=>entry.id===id)?.hazards.includes(kind),`${kind} can be inspected`);
 assert(entries.every(entry=>entry.phase&&entry.paused),'mechanics load as inspectable paused encounters');
 assert(entries.every(entry=>entry.sanctum),'authored void sanctum is loaded');
 assert(entries.every(entry=>entry.visibleRooms?.length===1&&entry.visibleRooms[0]===(entry.room<7?`raid-chamber-${entry.room}`:'raid-sanctum')),'each scenario renders only its current authored room');
 for(const [id,clip]of [['black-claw','black-claw'],['stars','death-stars'],['palms','death-palm'],['four-hands','four-hands'],['chains','soul-chains'],['wings','shadow-wings'],['black-sun','black-sun'],['harvest','soul-harvest'],['clones','death-clones'],['suits','suits-judgment'],['death-realm','realm-transition'],['incarnate','incarnate-transition']])assert.equal(entries.find(e=>e.id===id)?.cast,clip,`${id} selects its authored Blender animation`);
 assert(entries.find(e=>e.id==='four-hands').effects.some(effect=>effect.kind==='Safe path'),'Four Hands renders its derived safe opening');
 for(const kind of ['Death Star','Death Palm','Four Hands of Judgment','Shadow Wings','Black Sun','Soul Harvest','Death Clone'])
  assert(entries.some(entry=>entry.hazards.includes(kind)),`${kind} has a rendered encounter`);
 for(const phase of ['forming','approach','morgrath','suits','death-realm','incarnate','wiped','completed'])assert(entries.some(entry=>entry.phase===phase),`${phase} can be previewed`);
 await browser('wait','--fn',"document.querySelectorAll('.raid-result .dungeon-reward-slot').length===9 && !document.querySelector('.raid-result[aria-busy]')");
 await browser('screenshot',`${output}/rewards.png`);
 const first=entries.find(entry=>entry.hazards.includes('Death Star'));
 await evaluate("document.querySelector('#panel').close();document.querySelector('.preview-help').open=true;true");
 for(const id of ['chamber-1','chamber-2','chamber-3','chamber-4','chamber-5','chamber-6','morgrath']){
  await browser('select','#mechanic',id);await browser('wait','--fn',`window.__raidPreview.state.mechanicId===${JSON.stringify(id)}`);
  if(id==='morgrath')await browser('click','#camera-boss');
  await browser('screenshot',`${output}/${id}.png`);
 }
 await browser('click','#camera-reset');
 await browser('select','#mechanic',first.id);
 await browser('wait','--fn',`window.__raidPreview.state.mechanicId===${JSON.stringify(first.id)}`);
 await browser('screenshot',`${output}/desktop-mechanic.png`);
 await browser('click','#play');
 await browser('wait','--fn','window.__raidPreview.state.paused===false');
 const before=await evaluate('({now:window.__raidPreview.state.now,x:window.__raidPreview.state.self.x,z:window.__raidPreview.state.self.z})');
 await evaluate(`(async()=>{document.querySelector('canvas').focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',code:'KeyD',bubbles:true}));await new Promise(resolve=>setTimeout(resolve,600));window.dispatchEvent(new KeyboardEvent('keyup',{key:'d',code:'KeyD',bubbles:true}));return true;})()`);
 const after=await evaluate('({now:window.__raidPreview.state.now,x:window.__raidPreview.state.self.x,z:window.__raidPreview.state.self.z})');
 assert(after.now>before.now,'Play advances the real encounter clock');
 assert(Math.hypot(after.x-before.x,after.z-before.z)>.1,'keyboard movement reaches the preview server');
 await browser('click','#play');
 await browser('wait','--fn','window.__raidPreview.state.paused===true');
 await browser('set','viewport','390','844');
 assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'mobile has no horizontal overflow');
 await browser('screenshot',`${output}/mobile-mechanic.png`);
 await browser('set','viewport','1440','900');
 await browser('select','#mechanic','death-realm');
 await browser('wait','--fn',"window.__raidPreview.state.mechanicId==='death-realm'");
 await browser('click','[data-plane="shadow"]');
 await browser('wait','--fn',"window.__raidPreview.state.raid.plane==='shadow'");
 assert(await evaluate("window.__raidPreview.state.enemies.filter(e=>e.raidVisual==='guardian').length===3"),'Shadow Realm contains three guardians');
 await browser('screenshot',`${output}/shadow-realm.png`);
 await browser('click','#gallery');
 await browser('wait','--fn','window.__raidPreview.gallery && window.__raidPreview.state.paused');
 for(const stage of ['0','1','2','3'])await browser('select','#pet-stage',stage);
 await browser('screenshot',`${output}/cosmetics.png`);
 await browser('focus','#back-encounter');
 await browser('press','Enter');
 await browser('wait','--fn','!window.__raidPreview.gallery');
 if(process.argv.includes('--spells')){
  for(const [id,moment]of [['morgrath-cleave','impact'],['morgrath-rift','impact'],['morgrath-rupture','impact'],['palms','windup'],['stars','impact'],['four-hands','windup'],['wings','impact'],['harvest','impact'],['black-sun','start'],['clones','start']]){
   const capture=await evaluate(`(async()=>{
    const select=document.querySelector('#mechanic');select.value=${JSON.stringify(id)};select.dispatchEvent(new Event('change',{bubbles:true}));
    const until=async check=>{const limit=performance.now()+15000;while(!check()){if(performance.now()>limit)throw Error('Timed out during spell capture');await new Promise(resolve=>setTimeout(resolve,20));}};
    await until(()=>window.__raidPreview.state.mechanicId===${JSON.stringify(id)});
    const state=window.__raidPreview.state,hazard=state.raid.hazards[0],moment=${JSON.stringify(moment)};
    if(moment!=='start'){
     const target=moment==='impact'?hazard.impactAt+100:hazard.startedAt+(hazard.impactAt-hazard.startedAt)*.6;
     document.querySelector('#play').click();await until(()=>window.__raidPreview.state.now>=target);document.querySelector('#play').click();await until(()=>window.__raidPreview.state.paused);
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return window.__raidPreview.visuals;
   })()`);
   assert(capture.effects.some(effect=>effect.stage===(moment==='impact'?'impact':'windup')),`${id} shows ${moment} before cancellation`);
   assert(capture.effects.some(effect=>effect.particles===96&&(id==='morgrath-rupture'?!effect.glow:effect.glow)),`${id} renders its particle and glow layers`);
   await browser('screenshot',`${output}/${id}-${moment}.png`);
  }
  await browser('open',url+'?lighting=game&effects=off');
  await browser('wait','--fn',"document.body.dataset.ready==='true'");
  await evaluate("document.querySelector('#mechanic').value='four-hands';document.querySelector('#mechanic').dispatchEvent(new Event('change',{bubbles:true})); true");
  await browser('wait','--fn',"window.__raidPreview.state.mechanicId==='four-hands'");
  await evaluate("document.querySelector('.preview-help').open=true;document.querySelector('#camera-boss').click();true");
  await browser('screenshot',`${output}/game-lighting-effects-off.png`);
  assert(await evaluate("window.__raidPreview.visuals.effects.some(e=>e.kind==='Four Hands of Judgment')"),'game lighting with Effects Off retains spell silhouettes');
  assert(await evaluate("window.__raidPreview.visuals.effects.every(e=>e.particles===0&&!e.glow)"),'Effects Off removes particle and glow layers');
 }
 const errors=JSON.parse(await browser('errors','--json')).data.errors;assert.deepEqual(errors,[],'no browser runtime errors');
 console.log(`PASS interactive raid preview: ${entries.length} scenarios, all hazard families/phases, play/pause, movement, realm switch, nine reward reels, four pet forms, desktop/mobile layout. ${output}`);
} finally {await browser('close').catch(()=>{});}
