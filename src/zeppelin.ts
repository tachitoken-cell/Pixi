import type { ZoneId } from './content.ts';
import { CITY_LAYOUTS } from './city.ts';
import { TOWN_HEIGHTS } from './landscape.ts';

export const ZEPPELIN_PORTS = CITY_LAYOUTS.map(({zone:id,name,x,z})=>({id,name,x,z:z+90,y:TOWN_HEIGHTS[id]}));
export const zeppelinPort = (id: unknown) => ZEPPELIN_PORTS.find(port=>port.id===id);
export interface ZeppelinFlight { from:ZoneId; to:ZoneId; startedAt:number; arrivesAt:number }
export function createZeppelinFlight(from:ZoneId,to:ZoneId,now:number):ZeppelinFlight|null {
  const a=zeppelinPort(from),b=zeppelinPort(to);
  if(!a||!b||a===b||!Number.isFinite(now))return null;
  return {from,to,startedAt:now,arrivesAt:now+12_000+Math.hypot(b.x-a.x,b.z-a.z)/55*1000};
}
/** Vertical departure/arrival keep the ship clear of city roofs; terrain tops out at 145m. */
export function zeppelinPose(flight:ZeppelinFlight,now:number) {
  const a=zeppelinPort(flight.from)!,b=zeppelinPort(flight.to)!;
  const elapsed=Math.max(0,now-flight.startedAt),remaining=Math.max(0,flight.arrivesAt-now);
  const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
  const progress=Math.max(0,Math.min(1,(elapsed-6000)/(flight.arrivesAt-flight.startedAt-12000)));
  const heading=Math.atan2(b.x-a.x,b.z-a.z),turn=smooth(elapsed/4000)*smooth(remaining/4000);
  return {x:a.x+(b.x-a.x)*progress,z:a.z+12+(b.z-a.z)*progress,
    y:elapsed<6000?a.y+1.3+(185-a.y-1.3)*smooth(elapsed/6000):remaining<6000?b.y+1.3+(185-b.y-1.3)*smooth(remaining/6000):185,
    rotation:heading*turn,landed:now>=flight.arrivesAt};
}
