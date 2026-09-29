import assert from 'node:assert/strict';
import { ZEPPELIN_PORTS, createZeppelinFlight, zeppelinPose } from '../src/zeppelin.ts';
import { WORLD_BOUNDS, groundHeight, waterAt } from '../src/landscape.ts';
import { canTraverse, WORLD_COLLIDERS } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { REGION_ORIGINS } from '../src/landscape.ts';

assert.equal(ZEPPELIN_PORTS.length,6);
for(const invalid of [['greenwood','greenwood',0],['missing','hollow',0],['hollow','greenwood',NaN]])assert.equal(createZeppelinFlight(...invalid),null);
let routes=0;
for(const a of ZEPPELIN_PORTS){
  assert(!waterAt(a.x,a.z));assert.equal(groundHeight(a.x,a.z),a.y);assert(canTraverse(a,a));
  const start={x:REGION_ORIGINS[a.id].x,z:REGION_ORIGINS[a.id].z+70};
  const path=findPath(start,a,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length,`${a.name} dock has an approach`);
  assert(Math.hypot(path.at(-1).x-a.x,path.at(-1).z-a.z)<.1);
  for(const b of ZEPPELIN_PORTS){
    if(a===b)continue;
    const flight=createZeppelinFlight(a.id,b.id,1000);assert(flight);
    const start=zeppelinPose(flight,flight.startedAt),end=zeppelinPose(flight,flight.arrivesAt);
    assert(Math.abs(start.rotation)<1e-8);assert.deepEqual({...start,rotation:0},{x:a.x,z:a.z+12,y:a.y+1.3,rotation:0,landed:false});
    assert(Math.abs(end.rotation)<1e-8);assert.deepEqual({...end,rotation:0},{x:b.x,z:b.z+12,y:b.y+1.3,rotation:0,landed:true});
    assert.deepEqual(zeppelinPose(flight,flight.arrivesAt+60_000),end);
    let previous=start;
    for(let now=flight.startedAt;now<flight.arrivesAt;now+=100){
      const pose=zeppelinPose(flight,now);
      assert(Object.values(pose).every(v=>typeof v==='boolean'||Number.isFinite(v)));
      assert(pose.x>=WORLD_BOUNDS.minX&&pose.x<=WORLD_BOUNDS.maxX&&pose.z>=WORLD_BOUNDS.minZ&&pose.z<=WORLD_BOUNDS.maxZ);
      assert(pose.y>=groundHeight(pose.x,pose.z)+1.29,`${a.id}->${b.id} clears ground`);
      assert(Math.hypot(pose.x-previous.x,pose.z-previous.z)<=5.501,'horizontal motion stays at55m/s');
      assert(Math.abs(pose.y-previous.y)<5,'vertical flight remains continuous');
      previous=pose;
    }
    routes++;
  }
}
console.log(`PASS ${routes} direct zeppelin routes: six accessible dry docks, clearance, continuous flight, precise arrival and invalid route rejection.`);
