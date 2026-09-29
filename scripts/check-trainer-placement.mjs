import assert from 'node:assert/strict';
import { TRAINER_NPCS, RIDING_LESSONS, MOUNT_PRICES, spellTrainingCost } from '../src/training.ts';
import { SPELLS } from '../src/spells.ts';
import { ZONES } from '../src/content.ts';
import { VILLAGES, VILLAGE_PROPS, VILLAGE_NPCS } from '../src/settlements.ts';
import { REGION_ORIGINS, waterAt } from '../src/landscape.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, OVERWORLD_SPAWNS, toWorld, canTraverse } from '../src/realm.ts';
import { insideCity, CITY_LAYOUTS, CITY_TRAINER_POSITIONS } from '../src/city.ts';
import { findPath } from '../src/navigation.ts';

const route=(from,to,label)=>{
  const path=findPath(from,to,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length,`${label} is reachable from the local town square`);let previous=from;
  for(const step of path){assert(canTraverse(previous,step),`${label} route respects collision`);previous=step;}
  assert(Math.hypot(previous.x-to.x,previous.z-to.z)<.01,`${label} route reaches its destination`);
};
const roles=['riding-trainer','mount-seller','ranger-trainer','knight-trainer','mage-trainer','cleric-trainer'];
assert.equal(TRAINER_NPCS.length,ZONES.length*6);
assert.equal(new Set([...TRAINER_NPCS,...VILLAGE_NPCS,...ZONES.map(zone=>zone.npc)].map(npc=>npc.id)).size,TRAINER_NPCS.length+VILLAGE_NPCS.length+ZONES.length,'trainer identities cannot collide with existing villagers or story NPCs');
assert.equal(new Set(TRAINER_NPCS.map(npc=>npc.name)).size,TRAINER_NPCS.length,'each city has distinctly named trainers');
for(const zone of ZONES){
  const trainers=TRAINER_NPCS.filter(npc=>npc.zone===zone.id);
  assert.deepEqual(trainers.map(npc=>npc.role).sort(),[...roles].sort(),'every city provides riding, mounts and all four classes');
  const city=CITY_LAYOUTS.find(city=>city.zone===zone.id);
  for(const npc of trainers){
    const kind=npc.role==='riding-trainer'||npc.role==='mount-seller'?'city-stable':`city-${npc.role.replace('-trainer','')}-pavilion`;
    const station=city.props.find(prop=>prop.kind===kind);
    const expected=npc.role==='cleric-trainer'?toWorld(zone.id,CITY_TRAINER_POSITIONS[npc.role])
      :kind==='city-stable'?{x:station.x+(npc.role==='riding-trainer'?-4:4),z:station.z+station.depth/2+2}
      :{x:station.x,z:station.z+1};
    assert.deepEqual({x:npc.x,z:npc.z},expected,`${npc.id} serves its actual town station`);
    assert.equal(npc.rotation,0,`${npc.id} faces the station's open approach`);
    assert([npc.x,npc.z,npc.rotation].every(Number.isFinite));assert(npc.name&&npc.title);
    assert.equal(npc.className,{ 'ranger-trainer':'Ranger','knight-trainer':'Knight','mage-trainer':'Mage','cleric-trainer':'Cleric' }[npc.role]);
    assert(Math.abs(npc.x-REGION_ORIGINS[zone.id].x)<40&&Math.abs(npc.z-REGION_ORIGINS[zone.id].z)<40,'services remain inside their town');
    assert(!waterAt(npc.x,npc.z)&&canTraverse(npc,npc),'a trainer cannot stand in water or a collider');
    for(let turn=0;turn<Math.PI*2;turn+=Math.PI/4){
      const edge={x:npc.x+Math.sin(turn)*.8,z:npc.z+Math.cos(turn)*.8};
      assert(!waterAt(edge.x,edge.z)&&canTraverse(edge,edge),'the body has clearance from surrounding geometry');
    }
    const approach={x:npc.x+Math.sin(npc.rotation)*2,z:npc.z+Math.cos(npc.rotation)*2};
    assert(Math.hypot(approach.x-npc.x,approach.z-npc.z)<=3&&canTraverse(approach,npc),'the NPC has an unobstructed interaction point within3m');
    route(toWorld(zone.id,zone.spawn),approach,npc.id);
    for(const at of OVERWORLD_SPAWNS.filter(enemy=>enemy.zone===zone.id&&enemy.kind!=='training-dummy')){assert(insideCity(npc.x,npc.z)||Math.hypot(at.x-npc.x,at.z-npc.z)>20,'trainers are inside the protected capital or away from hostile spawns');}
    for(const landmark of [zone.npc,zone.spawn,...zone.nodes,...(zone.beacon?[zone.beacon]:[]),{x:3,z:2},{x:-4,z:3},{x:0,z:-24}]){
      const at=toWorld(zone.id,landmark),distance=Math.hypot(at.x-npc.x,at.z-npc.z);assert(landmark===zone.spawn?distance>=4:distance>4,'services do not overlap existing interactions or dungeon entry');
    }
    assert(trainers.every(other=>other===npc||Math.hypot(other.x-npc.x,other.z-npc.z)>=6),'neighboring trainers retain independent interaction space');
  }
}
const regionalResidents=VILLAGE_NPCS.filter(npc=>npc.zone!=='greenwood');
const regionalStory=ZONES.filter(zone=>zone.id!=='greenwood').map(zone=>toWorld(zone.id,zone.npc));
for(const npc of [...regionalResidents,...regionalStory]){
  assert(!waterAt(npc.x,npc.z)&&canTraverse(npc,npc),`${npc.id} stands on clear dry land`);
  const village=VILLAGES.find(village=>village.id===npc.villageId),zone=ZONES.find(zone=>zone.id===npc.zone);
  route(village??toWorld(zone.id,zone.spawn),npc,npc.id);
  if(!village||npc.role==='warden')continue;
  const landmark=VILLAGE_PROPS.find(prop=>prop.villageId===village.id&&prop.kind===(npc.role==='merchant'?'stall':'well'));
  assert(landmark,`${npc.id} has its service landmark`);
  assert(Math.hypot(npc.x-landmark.x,npc.z-landmark.z)<=(npc.role==='healer'?3:4),`${npc.id} stays beside its ${landmark.kind}`);
  if(npc.role==='merchant'){
    const forward=(npc.x-landmark.x)*Math.sin(landmark.rotation)+(npc.z-landmark.z)*Math.cos(landmark.rotation);
    assert(forward>1.5,`${npc.id} stands at the stall's open front`);
    assert.equal(npc.rotation,landmark.rotation,`${npc.id} faces customers outside the stall`);
  }
}
const residents=[...TRAINER_NPCS,...regionalResidents,...regionalStory];
for(const npc of [...regionalResidents,...regionalStory])assert(residents.every(other=>other===npc||Math.hypot(npc.x-other.x,npc.z-other.z)>=2.4),`${npc.id} has independent interaction space`);
assert.deepEqual(RIDING_LESSONS.map(({rank,level,cost})=>[rank,level,cost]),[[1,25,100],[2,50,500]]);
assert.deepEqual(MOUNT_PRICES,{horse:75,wolf:125});
for(const spell of Object.values(SPELLS))assert.equal(spellTrainingCost(spell.id),spell.requiredLevel===1?0:spell.requiredLevel*5);
console.log(`PASS: ${TRAINER_NPCS.length} unique trainers at their actual guild/stable stations, ${regionalResidents.length+regionalStory.length} locally reachable regional residents, merchant/well proximity, dry clearance, encounter spacing and training prices.`);
