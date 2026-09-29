import type { Enemy } from './shared';
import type { EnemyAttackPose } from './monster-models';
import { APOSTLE_RAID, type RaidState } from './raid.ts';

export const RAID_CAST_CLIPS=['black-claw','death-stars','death-palm','four-hands','soul-chains','shadow-wings','black-sun','soul-harvest','death-clones','suits-judgment','realm-transition','incarnate-transition'] as const;
export const RAID_EXTRA_CLIPS=['spawn','wings-unfold','black-sun-channel','death-clones-charge','suits-hold','death-descends','run','hit'] as const;
export type RaidCastClip=typeof RAID_CAST_CLIPS[number]|typeof RAID_EXTRA_CLIPS[number];
type RaidCastStyle=NonNullable<Enemy['attack']>['style'];
export interface RaidCastCue extends EnemyAttackPose {
 clip:RaidCastClip|'attack'|'cast'|'rift'|'rupture'; style:RaidCastStyle; id:string; kind:string; rotation:number; startedAt:number; impactAt:number; endsAt:number;
}
const casts:Record<string,{clip:RaidCastClip;style:RaidCastStyle;priority:number}>={
 'Black Claw':{clip:'black-claw',style:'swipe',priority:1},
 'Death Star':{clip:'death-stars',style:'pulse',priority:2},
 'Death Palm':{clip:'death-palm',style:'slam',priority:3},
 'Four Hands of Judgment':{clip:'four-hands',style:'pulse',priority:4},
 'Soul Chains':{clip:'soul-chains',style:'pulse',priority:5},
 'Shadow Wings':{clip:'shadow-wings',style:'swipe',priority:4},
 'Black Sun':{clip:'black-sun',style:'pulse',priority:8},
 'Soul Harvest':{clip:'soul-harvest',style:'pulse',priority:8},
 'Death Clone':{clip:'death-clones',style:'pulse',priority:9},
};

/** A visual adapter only: every start, impact, interruption and deadline comes from the raid snapshot. */
export function raidCastCue(raid:RaidState|null|undefined,enemy:Enemy,now:number):RaidCastCue|undefined {
 if(raid&&enemy.alive&&Number.isFinite(now)&&(enemy.raidVisual==='approach'||enemy.raidVisual==='morgrath')){
  const h=raid.hazards.filter(h=>h.sourceId===enemy.id&&h.startedAt<=now&&h.endsAt>now).sort((a,b)=>b.startedAt-a.startedAt)[0];
  if(!h||h.impactAt<=h.startedAt)return;
  const melee=h.shape==='cone'||h.kind.endsWith(' Strike');
  return {id:h.id,kind:h.kind,clip:enemy.raidVisual==='morgrath'&&h.kind==='Morgrath Rift'?'rift':enemy.raidVisual==='morgrath'&&h.kind==='Morgrath Rupture'?'rupture':melee?'attack':'cast',style:melee?'swipe':h.shape==='line'?'spit':'pulse',rotation:h.rotation??enemy.rotation??0,startedAt:h.startedAt,impactAt:h.impactAt,endsAt:h.endsAt,basic:h.kind.endsWith(' Strike'),progress:Math.max(0,Math.min(1,(now-h.startedAt)/(h.endsAt-h.startedAt))),impactProgress:(h.impactAt-h.startedAt)/(h.endsAt-h.startedAt)};
 }
 if(!raid||!enemy.alive||!Number.isFinite(now)||enemy.id!==raid.bossId&&enemy.model!=='apostle-clone')return;
 const cue=(id:string,kind:string,clip:RaidCastClip,style:RaidCastStyle,startedAt:number,impactAt:number,endsAt:number,rotation=enemy.rotation||0,basic=false):RaidCastCue|undefined=>{
  if(![startedAt,impactAt,endsAt,rotation].every(Number.isFinite)||startedAt>now||endsAt<=now||impactAt<=startedAt||endsAt<=startedAt)return;
  const duration=endsAt-startedAt;
  return {id,kind,clip,style,startedAt,impactAt,endsAt,rotation,basic,progress:Math.min(1,Math.max(0,(now-startedAt)/duration)),impactProgress:Math.min(1,(impactAt-startedAt)/duration)};
 };
 // Loop authored holds at their real two-second cadence while the public cast
 // clock continues to show the server's full deadline.
 const hold=(cast:RaidCastCue|undefined,clip:RaidCastClip,from:number):RaidCastCue|undefined=>cast&&({...cast,clip,authoredTime:true,progress:((now-from)%2000)/2000});
 if(enemy.id===raid.bossId){
  if(raid.phase==='suits'){
   const start=raid.phaseEndsAt-APOSTLE_RAID.suitsMs,cast=cue(`${raid.id}-suits-${raid.phaseEndsAt}`,'Judgment of the Four Suits','suits-judgment','pulse',start,raid.phaseEndsAt,raid.phaseEndsAt+600);
   return now>=start+1000&&now<raid.phaseEndsAt-2600?hold(cast,'suits-hold',start+1000):cast&&({...cast,authoredTime:true,progress:(now-(now<start+1000?start:raid.phaseEndsAt-2600))/3667});
  }
  if(raid.phase==='death-realm'){
   const start=raid.phaseEndsAt-APOSTLE_RAID.realmMs,cast=cue(`${raid.id}-realm-${raid.phaseEndsAt}`,'Death Realm','realm-transition','pulse',start,raid.phaseEndsAt,raid.phaseEndsAt+600);
   return now>=start+2333?hold(cast,'black-sun-channel',start+2333):cast&&({...cast,authoredTime:true,progress:(now-start)/2333});
  }
  if(raid.phase==='incarnate'&&now>=raid.enrageEndsAt-1867)return cue(`${raid.id}-enrage`,'DEATH DESCENDS','death-descends','pulse',raid.enrageEndsAt-1867,raid.enrageEndsAt,raid.enrageEndsAt+1466);
  const incarnateAt=raid.enrageEndsAt-APOSTLE_RAID.enrageMs;
  if(raid.phase==='incarnate'&&now<incarnateAt+1800)return cue(`${raid.id}-incarnate-${incarnateAt}`,'Death Incarnate','incarnate-transition','pulse',incarnateAt,incarnateAt+1200,incarnateAt+1800);
 }
 const hazards=raid.hazards.filter(h=>casts[h.kind]&&h.startedAt<=now&&h.endsAt>now&&(enemy.id===raid.bossId||h.kind==='Death Clone'));
 const candidates=hazards.map(h=>({id:h.id,kind:h.kind,startedAt:h.startedAt,impactAt:h.impactAt,endsAt:h.endsAt,rotation:h.rotation??enemy.rotation??0,basic:h.kind==='Black Claw'&&h.shape!=='cone',...casts[h.kind]}));
 if(enemy.id===raid.bossId)for(const chain of raid.chains)if(chain.endsAt-9000<=now&&chain.endsAt>now)candidates.push({id:chain.id,kind:'Soul Chains',startedAt:chain.endsAt-9000,impactAt:chain.endsAt-6500,endsAt:chain.endsAt,rotation:enemy.rotation||0,basic:false,...casts['Soul Chains']});
 const chosen=candidates.sort((a,b)=>b.priority-a.priority||b.startedAt-a.startedAt||a.id.localeCompare(b.id))[0];
 if(chosen){
  const cast=cue(chosen.id,chosen.kind,chosen.clip,chosen.style,chosen.startedAt,chosen.impactAt,chosen.endsAt,chosen.rotation,chosen.basic);
  if(chosen.clip==='black-sun'&&now>=chosen.startedAt+1000&&now<chosen.impactAt-2700)return hold(cast,'black-sun-channel',chosen.startedAt+1000);
  if(chosen.clip==='black-sun')return cast&&({...cast,authoredTime:true,progress:(now-(now<chosen.startedAt+1000?chosen.startedAt:chosen.impactAt-2700))/4000});
  if(chosen.clip==='death-clones'&&now>=chosen.startedAt+2000&&now<chosen.impactAt)return hold(cast,'death-clones-charge',chosen.startedAt+2000);
  if(chosen.clip==='death-clones')return cast&&({...cast,authoredTime:true,progress:Math.min(1,(now-chosen.startedAt)/2000)});
  return cast;
 }
 if(enemy.id===raid.bossId){
  if(raid.bossSpawnedAt&&now<raid.bossSpawnedAt+3000){const cast=cue(`${raid.id}-spawn`,'The Apostle emerges','spawn','pulse',raid.bossSpawnedAt,raid.bossSpawnedAt+2667,raid.bossSpawnedAt+3000);return cast&&{...cast,authoredTime:true};}
  if(raid.wingsAt&&now<raid.wingsAt+2667){const cast=cue(`${raid.id}-wings`,'Wings Unfold','wings-unfold','pulse',raid.wingsAt,raid.wingsAt+1133,raid.wingsAt+2667);return cast&&{...cast,authoredTime:true};}
 }
}
