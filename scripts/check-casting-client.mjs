import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { SPELLS, spellDamage, spellCastTimeMs } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { makeCharacter, animateCharacter } from '../src/characters.ts';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';

for (const spell of Object.values(SPELLS)) {
  for (const primaryDamage of [16,24,100,500]) {
    const stats={primaryDamage,specialDamage:primaryDamage+16};
    assert.equal(spellCastTimeMs(spell,stats),spell.castTimeMs,'gear never changes authored timing');
    assert(spellCastTimeMs(spell,stats)>=0);
  }
}
assert.equal(spellCastTimeMs(SPELLS.arrow),0,'normal weapon attacks are instant');
assert.equal(spellCastTimeMs(SPELLS.fireball),2000);
assert.equal(spellCastTimeMs(SPELLS.meteor),3000);
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
let serverNow = 1000;
const sent = [], player = { id:'local', hp:100 }, remotePlayer = { id:'remote', hp:100 };
const runtime = { worldDungeonKind:null, THREE, SPELLS, charging:false, position:{x:0,z:0}, updateAudioScene(){}, combatTiming, player, playerId:'local', players:[remotePlayer], connected:true, worldReady:true, cancelledCast:0, serverOffset:0,
  Date:{now:()=>serverNow}, performance:{now:()=>serverNow}, combatAnimations:new Map(), send:m=>sent.push(m), rotation:0, lastPrimary:0,
  combatEffects:{play(){}}, gameAudio:{play(){},spell(){}}, };
const execute = text => runInNewContext(stripTypeScriptTypes(text), runtime);
execute(source.slice(source.indexOf('function cancelCasting('), source.indexOf('function clearInteraction(')));
execute(source.slice(source.indexOf('function playCombat('), source.indexOf('function act(')));
for (const spell of Object.values(SPELLS)) {
  runtime.combatAnimations.clear(); runtime.cancelledCast=0;player.casting=null;
  const avatar=makeCharacter({...DEFAULT_APPEARANCE,className:spell.className}),worldPosition=avatar.position.clone();
  const pose=now=>{serverNow=now;const attack=runtime.combatPose('local',now);assert.equal(attack.ability,spell.id);assert.equal(attack.rotation,1.2);assert(Number.isFinite(attack.progress));animateCharacter(avatar,now/1000,false,attack);avatar.updateMatrixWorld(true);avatar.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite)));assert(avatar.position.equals(worldPosition));return attack;};
  const duration=spell.movementDurationMs||spell.channel?.durationMs||spell.castTimeMs;
  if(duration){
    const endsAt=1000+duration;
    player.casting={ability:spell.id,startedAt:1000,endsAt,rotation:1.2,targetId:'enemy',...(spell.channel?{channel:true}:{})};
    let previous=0;
    for(const now of [1000,1000+duration*.25,1000+duration*.5,1000+duration*.75]){
      const attack=pose(now);
      if(!spell.channel){assert(attack.progress>=previous);previous=attack.progress;}
      else assert(attack.progress>=.3&&attack.progress<=.6,'channel sustains a bounded casting pose');
    }
    if(spell.channel){
      serverNow=1000+spell.channel.tickMs;
      runtime.playCombat({type:'combat',playerId:'local',ability:spell.id,startedAt:serverNow,castTimeMs:0,from:{x:0,z:0},rotation:1.2,targets:[]});
      assert(player.casting,'a channel tick does not clear the ongoing channel');pose(serverNow);
    }
    const prepared=pose(endsAt);
    runtime.playCombat({type:'combat',playerId:'local',ability:spell.id,startedAt:endsAt,castTimeMs:spell.castTimeMs,from:{x:0,z:0},rotation:1.2,targets:[]});
    assert.equal(player.casting,null,'release clears the stale snapshot immediately');
    if(spell.movementDurationMs){assert.equal(runtime.combatPose('local',endsAt),false,'completed Roll never starts another tumble');continue;}
    if(!spell.channel)assert.equal(runtime.combatPose('local',endsAt).progress,prepared.progress,'release continues prepared pose without restarting');
    assert.equal(runtime.combatPose('local',endsAt+3000),false);
  }else{
    serverNow=1000;
    runtime.playCombat({type:'combat',playerId:'local',ability:spell.id,startedAt:1000,castTimeMs:0,from:{x:0,z:0},rotation:1.2,targets:[]});
    assert.equal(player.casting,null,'instant spells never need a fabricated preparation state');
    pose(1000);pose(1250);assert.equal(runtime.combatPose('local',4000),false);
  }
}
player.casting = { ability:'fireball', startedAt:7000, endsAt:9000, rotation:0,targetId:'enemy' }; serverNow = 7500;
runtime.cancelCasting(); assert.equal(sent.at(-1).type, 'cancelCast'); const requests = sent.length;
runtime.cancelCasting(); assert.equal(sent.length, requests, 'holding movement sends one cancellation, not a message every frame');
assert.equal(runtime.combatPose('local', 7500), false, 'local cancellation immediately removes casting pose');
remotePlayer.casting = {...player.casting}; assert(runtime.combatPose('remote', 7500), 'other players show their independent casting pose');
remotePlayer.hp = 0; assert.equal(runtime.combatPose('remote', 7500), false, 'dead players cannot keep casting');
player.casting = { ability:'mount', mount:'horse', startedAt:10000, endsAt:12000, rotation:0, targetId:'' }; serverNow = 10500;
assert.equal(runtime.combatPose('local', serverNow), false, 'mount preparation does not use a spell combat pose');
remotePlayer.hp = 100; remotePlayer.casting = {...player.casting}; assert.equal(runtime.combatPose('remote', serverNow), false, 'remote mount preparation does not use a spell combat pose');
const beforeMountCancel = sent.length; runtime.cancelCasting(); runtime.cancelCasting();
assert.equal(sent.length, beforeMountCancel + 1, 'local mount preparation sends exactly one cancellation'); assert.equal(sent.at(-1).type, 'cancelCast');
player.casting=null;runtime.cancelCasting('powerful-throw');assert.deepEqual({...sent.at(-1)},{type:'cancelCast',ability:'powerful-throw'},'releasing before the first snapshot still cancels the ordered cast request');
player.casting={ability:'fireball',startedAt:12000,endsAt:14000};runtime.cancelledCast=0;
runtime.cancelCasting('powerful-throw');assert.equal(runtime.cancelledCast,0,'late shield release never locally cancels a different spell');
assert.equal(sent.at(-1).ability,'powerful-throw','late release remains scoped on the authoritative server');
Object.assign(runtime,{gmFlying:()=>false,gearSpeedMultiplier:()=>1,keys:new Set(),canSprint:()=>true,jump:{grounded:true},worldInstance:null,waterAt:()=>false,WALK_SPEED:4,SPRINT_SPEED:7,SWIM_SPEED:2,SWIM_SPRINT_SPEED:3});
execute(source.slice(source.indexOf('function travelSpeed('),source.indexOf('function updateMountView(')));
serverNow=12500;assert.equal(runtime.travelSpeed(),4);
player.casting={ability:'powerful-throw',startedAt:12000,endsAt:14000};assert.equal(runtime.travelSpeed(),1.2,'Powerful Throw charges at 30 percent walking speed');
runtime.keys.add('shift');assert.equal(runtime.travelSpeed(),2.1,'sprint is slowed by the same cast multiplier');runtime.keys.clear();
execute(source.match(/^ if\(isMoving&&.*cancelCasting\(\);$/m)[0].replace('isMoving','true'));assert.equal(runtime.cancelledCast,0,'walking preserves a movable shield cast');
runtime.cancelCasting();assert.equal(runtime.travelSpeed(),4,'cancelled charge immediately restores movement speed');
player.casting={ability:'fireball',startedAt:15000,endsAt:17000};
execute(source.match(/^ if\(isMoving&&.*cancelCasting\(\);$/m)[0].replace('isMoving','true'));assert.equal(runtime.cancelledCast,15000,'walking still cancels stationary spells');
player.casting={ability:'charge',startedAt:18000,endsAt:18500};runtime.charging=true;runtime.cancelledCast=0;
execute(source.match(/^ if\(isMoving&&.*cancelCasting\(\);$/m)[0].replace('isMoving','true'));assert.equal(runtime.cancelledCast,0,'server-driven Charge is not cancelled by its own running animation or held movement');runtime.charging=false;
const pickupScene=new THREE.Scene(),pickupAvatar=makeCharacter({...DEFAULT_APPEARANCE,className:'Knight'}),pickupLabel={hidden:true};
const pickup={THREE,connected:true,worldReady:true,entryActive:false,rosterActive:false,worldInstance:null,player:{hp:100,combatTalents:{thrownShield:{x:4,z:6,expiresAt:2000}}},localAvatar:pickupAvatar,scene:pickupScene,thrownShieldMarker:undefined,thrownShieldLabel:pickupLabel,surfaceHeight:()=>3,placeLabel(){}};
runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('function updateThrownShield('),source.indexOf('const ambientEffects='))),pickup);
pickup.updateThrownShield(1000);assert(!pickupLabel.hidden);assert.equal(pickupScene.children.length,1);assert.equal(pickup.thrownShieldMarker.position.x,4);assert.equal(pickup.thrownShieldMarker.position.z,6);assert(pickup.thrownShieldMarker.position.y>3,'the recovered-shield marker is visible above the floor');
pickup.updateThrownShield(1500);assert.equal(pickupScene.children.length,1,'snapshots reuse one shield model');
pickup.updateThrownShield(2000);assert(pickupLabel.hidden&&!pickup.thrownShieldMarker.visible,'expired shield pickups disappear');
pickup.player.combatTalents.thrownShield=undefined;pickup.updateThrownShield(1000);assert(pickupLabel.hidden,'collected shield pickups disappear');
assert.match(source,/if\(isMoving&&.*castMoveMultiplier\)\)cancelCasting\(\)/);
assert.match(source,/if\(key==='escape'&&player\?\.casting/);
assert(source.slice(source.indexOf('function tryJump('), source.indexOf('function reconcileJump(')).includes('cancelCasting();'));
console.log('PASS fixed/instant/channel durations, all 124 class preparation/release/channel poses, independent remote casts, unchanged world roots, safe mount preparation, and immediate movement/jump/Escape cancellation.');
