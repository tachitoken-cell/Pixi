import assert from 'node:assert/strict';
import { createRaidPreview } from './raid-preview-server.mjs';
import { raidCastCue } from '../src/raid-visuals.ts';
import { enemyAttackPhase } from '../src/monster-models.ts';

const preview=createRaidPreview();
for(const [mechanic,clip] of Object.entries({'black-claw':'black-claw','death-marks':'black-claw',stars:'death-stars',palms:'death-palm','four-hands':'four-hands',chains:'soul-chains',wings:'shadow-wings','black-sun':'black-sun',harvest:'soul-harvest',clones:'death-clones',suits:'suits-judgment','death-realm':'realm-transition',incarnate:'incarnate-transition'})){
 await preview.select(mechanic);const state=preview.snapshot();state.raid.bossSpawnedAt=state.raid.wingsAt=0;const enemy=state.enemies.find(e=>e.id===state.raid.bossId),before=structuredClone(state);
 const cue=raidCastCue(state.raid,enemy,state.now);assert.equal(cue?.clip,clip,mechanic);assert.equal(cue.progress,0);
 assert.equal(raidCastCue(state.raid,enemy,cue.startedAt-1),undefined,'future casts do not start early');
 const impact=raidCastCue(state.raid,enemy,cue.impactAt);
 if(!impact.authoredTime)assert.equal(enemyAttackPhase(impact),.5,'authored contact is aligned to authoritative impact');
 else assert.equal(enemyAttackPhase(impact),impact.progress,'staged source clips use their authored timeline');
 assert.equal(raidCastCue(state.raid,enemy,cue.endsAt),undefined,'finished cast does not linger');
 const paused=raidCastCue(state.raid,enemy,state.now);assert.deepEqual(paused,cue,'same paused snapshot yields the same pose');
 assert.deepEqual(state,before,'visual cue never mutates simulation state');
 if(mechanic==='clones')for(const fake of state.enemies.filter(e=>e.model==='apostle-clone'))assert.equal(raidCastCue(state.raid,fake,state.now)?.clip,'death-clones');
 if(mechanic==='suits'){
  const middle=raidCastCue(state.raid,enemy,state.now+1500);assert.equal(middle.clip,'suits-hold');assert.equal(middle.impactAt,cue.impactAt);
  assert.deepEqual(raidCastCue(state.raid,enemy,state.now+1500),middle,'holds are deterministic');
  assert.equal(raidCastCue(state.raid,enemy,cue.impactAt-500).clip,'suits-judgment');
 }
 if(mechanic==='death-realm')assert.equal(raidCastCue(state.raid,enemy,state.now+3000).clip,'black-sun-channel');
 if(mechanic==='clones')assert.equal(raidCastCue(state.raid,enemy,state.now+3000).clip,'death-clones-charge');
 if(mechanic==='black-sun'){
  assert.equal(raidCastCue(state.raid,enemy,state.now+3000).clip,'black-sun-channel');
  assert.equal(raidCastCue(state.raid,enemy,cue.impactAt-500).clip,'black-sun');

  const overlapping={...state.raid,hazards:[...state.raid.hazards,{id:'later-claw',kind:'Black Claw',shape:'cone',startedAt:state.now+500,impactAt:state.now+2000,endsAt:state.now+2600,rotation:1}]};
  assert.equal(raidCastCue(overlapping,enemy,state.now+700).clip,'black-sun','a minor attack cannot replace the continuing channel');
  assert.equal(raidCastCue({...state.raid,hazards:[]},enemy,state.now+700),undefined,'cleansed crystals stop the channel immediately');
 }
}
for(const [mechanic,clip]of [['morgrath-cleave','attack'],['morgrath-rift','rift'],['morgrath-rupture','rupture']]){
 await preview.select(mechanic);const state=preview.snapshot(),enemy=state.enemies.find(e=>e.id===state.raid.bossId);
 const cue=raidCastCue(state.raid,enemy,state.now);assert.equal(cue?.clip,clip);assert.equal(enemyAttackPhase(raidCastCue(state.raid,enemy,cue.impactAt)),.5);
 assert.equal(raidCastCue(state.raid,{...enemy,id:'other-creature'},state.now),undefined,'only the source creature casts its spell');
 assert.equal(raidCastCue({...state.raid,hazards:[]},enemy,state.now),undefined,'source interruption stops the pose');
 assert.equal(raidCastCue(state.raid,enemy,cue.startedAt-1),undefined);assert.equal(raidCastCue(state.raid,enemy,cue.endsAt),undefined);
 assert.deepEqual(raidCastCue(state.raid,enemy,state.now),cue,'paused creature pose is deterministic');
 const recovery=raidCastCue(state.raid,enemy,(cue.impactAt+cue.endsAt)/2);
 assert.equal(recovery.clip,clip);assert(Math.abs(enemyAttackPhase(recovery)-.75)<1e-8,'halfway through recovery samples authored phase .75');
 const warning=state.raid.hazards.find(h=>h.sourceId===enemy.id);
 assert.equal(cue.rotation,warning.rotation??enemy.rotation,'model faces the authoritative hazard');
}
await preview.select('death-realm-shadow');const shadow=preview.snapshot();assert(shadow.enemies.every(e=>!raidCastCue(shadow.raid,e,shadow.now)),'guardians do not borrow the Apostle rig');
await preview.select('sermon');const start=preview.snapshot();assert.equal(raidCastCue({...start.raid,bossSpawnedAt:0},start.enemies[0],start.now),undefined);
const boss=start.enemies.find(e=>e.id===start.raid.bossId);
const spawn={...start.raid,bossSpawnedAt:start.now};
assert.equal(raidCastCue(spawn,boss,start.now+100).clip,'spawn');
assert.equal(raidCastCue(spawn,boss,start.now+3000),undefined,'spawn ends before the first existing claw');
const wings={...start.raid,bossSpawnedAt:0,wingsAt:start.now};
assert.equal(raidCastCue(wings,boss,start.now+100).clip,'wings-unfold');
assert.equal(raidCastCue(wings,boss,start.now+2667),undefined);
const enrage={...start.raid,phase:'incarnate',enrageEndsAt:start.now+90000};
assert.equal(raidCastCue(enrage,boss,enrage.enrageEndsAt-1000).clip,'death-descends');

assert.equal(raidCastCue(null,start.enemies[0],start.now),undefined);assert.equal(raidCastCue(start.raid,{...start.enemies[0],alive:false},start.now),undefined);
console.log('PASS raid cast cues: every real mechanic, phase clocks, contact timestamps, channel precedence/interruption, clones, pause/replay determinism and no simulation mutation.');
