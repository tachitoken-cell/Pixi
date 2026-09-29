import type { CharacterClass } from './shared';

export const APOSTLE_RAID = { id:'horned-apostle', name:'The Horned Apostle', level:60, minPlayers:10, maxPlayers:20,
  realmMs:60_000, suitsMs:10_000, enrageMs:90_000, markLimit:5 } as const;
export const RAID_BOUNDS = { minX:-34, maxX:34, minZ:-34, maxZ:34 };
export const RAID_COLLIDERS:import('./realm').RealmCollider[] = [];
export const RAID_START = {x:0,z:25};
export const isRaidInstance = (id:string|null|undefined):boolean => !!id?.startsWith('raid-');
export type RaidPlane = 'arena'|'shadow';
export type RaidRole = 'tank'|'healer'|'damage';
export type RaidPhase = 'forming'|'approach'|'morgrath'|'sermon'|'wings'|'suits'|'death-realm'|'incarnate'|'wiped'|'completed';
export type RaidSuit = 'spade'|'club'|'diamond'|'heart';
export const RAID_SUITS:readonly RaidSuit[] = ['spade','club','diamond','heart'];
export const RAID_SUIT_GLYPHS:Record<RaidSuit,string> = {spade:'♠',club:'♣',diamond:'♦',heart:'♥'};
export const RAID_SUIT_ZONES = RAID_SUITS.map((suit,index)=>({suit,x:Math.sin(index*Math.PI/2)*21,z:Math.cos(index*Math.PI/2)*21,r:4}));
export const RAID_PHASE_NAMES:Record<RaidPhase,string> = {forming:'Gather the raid',approach:'Clear the sanctum',morgrath:'Morgrath',sermon:'The Sermon',wings:'Wings Unfold',suits:'Judgment of the Four Suits','death-realm':'Death Realm',incarnate:'Death Incarnate',wiped:'Raid defeated',completed:'Death defied'};
export interface RaidMember { id:string; name:string; className:CharacterClass; level:number; role:RaidRole; ready:boolean; online:boolean; hp:number; maxHp:number; marks:number; plane:RaidPlane; suit?:RaidSuit }
export interface RaidHazard { id:string; kind:string; label:string; plane:RaidPlane; shape:'circle'|'cone'|'line'|'ring'; x:number; z:number; r:number; rotation?:number; angle?:number; width?:number; length?:number; innerR?:number; startedAt:number; impactAt:number; endsAt:number; safe?:boolean; targetId?:string; sourceId?:string }
export interface RaidChain { id:string; firstId:string; secondId:string; breakDistance:number; endsAt:number }
export interface RaidInvitation { id:string; raidId:string; leaderName:string; expiresAt:number }
export interface RaidReward { id:string; label:string; quantity:number; kind:'material'|'cosmetic'|'pet'|'gear'|'title'; duplicate?:boolean }
export interface RaidCompletion { runId:string; durationMs:number; partySize:number; rewards:RaidReward[]; saved:boolean }
export interface RaidState {
  approach?:{roomIndex:number;roomName:string;remaining:number;cleared:boolean;exit:{x:number;z:number};totalRooms:number};
  candidates?:{id:string;name:string;className:CharacterClass;level:number}[];
  id:string; leaderId:string; coLeaderId?:string|null; phase:RaidPhase; members:RaidMember[]; plane:RaidPlane;
  lockedSize:number; startedAt:number; phaseEndsAt:number; enrageEndsAt:number; wipes:number;
  bossSpawnedAt?:number; wingsAt?:number;
  bossId:string|null; bossHp:number; bossMaxHp:number; objective:string;
  hazards:RaidHazard[]; chains:RaidChain[]; guardiansKilled:number; crystalsRemaining:number;
  seals:{x:number;z:number;r:number;charge:number;active:boolean}[];
  result?:RaidCompletion;
}
export type RaidMessage = {type:'raidCreate'|'raidStart'|'raidLeave'|'raidAdvance'}
  | {type:'raidInvite'|'raidKick';targetId:string}
  | {type:'raidCoLeader';targetId:string|null}
  | {type:'raidRespond';invitationId:string;accept:boolean}
  | {type:'raidReady';ready:boolean;role?:RaidRole};

/** Server and telegraph geometry use the same angles: zero points along +Z. */
export function raidHazardContains(hazard:RaidHazard,point:{x:number;z:number}):boolean {
  const dx=point.x-hazard.x,dz=point.z-hazard.z,distance=Math.hypot(dx,dz),rotation=hazard.rotation||0;
  if(hazard.shape==='cone')return distance<=hazard.r&&Math.abs(Math.atan2(Math.sin(Math.atan2(dx,dz)-rotation),Math.cos(Math.atan2(dx,dz)-rotation)))<=(hazard.angle??Math.PI/2)/2;
  if(hazard.shape==='line')return Math.abs(dx*Math.cos(rotation)-dz*Math.sin(rotation))<=(hazard.width??hazard.r)/2&&Math.abs(dx*Math.sin(rotation)+dz*Math.cos(rotation))<=(hazard.length??hazard.r*2)/2;
  return distance<=hazard.r&&distance>=(hazard.shape==='ring'?hazard.innerR??0:0);
}
