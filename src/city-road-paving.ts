import { ALL_CITY_COLLIDERS, ALL_CITY_GARDEN_COLLIDERS, CITY_RADIUS, type CityLayout } from './city.ts';
import { BUILDINGS, BUILDING_COLLIDERS, CIVIC_FURNITURE_COLLIDERS, BUILDING_RAMP_LENGTH, buildingFloorHeight, buildingPoint } from './buildings.ts';
import { groundHeight } from './landscape.ts';

// Joined rims fill the mortar; shallow skirts close the ledges beside raised entry ramps.
export const CITY_PAVER_VERTICES = [
  [-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5],
  [-.475,.022,-.475],[.475,.022,-.475],[.475,.022,.475],[-.475,.022,.475],
  [-.5,-.08,-.5],[.5,-.08,-.5],[.5,-.08,.5],[-.5,-.08,.5],
];
export const CITY_PAVER_INDICES = [4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,0,1,9,0,9,8,1,2,10,1,10,9,2,3,11,2,11,10,3,0,8,3,8,11];
const STREETS = {
  greenwood: { course:3, colors:[0xb4ad91,0xa39a7f,0xbdb598,0xaaa58f,0xc5b995] },
  amberwild: { course:2, colors:[0xb7a17e,0xab906c,0xc4ad83,0xb39a78,0xd3b38a] },
  frostmarch: { course:3, colors:[0x899baf,0x9aabbb,0x7f91a5,0xa4b3bd,0xbdc8c8] },
  hollow: { course:2, colors:[0x827a92,0x777184,0x968a9e,0x898296,0xaea0b0] },
  sunveil: { course:4, colors:[0xcbb586,0xd7c294,0xc3aa79,0xd0b889,0xb18f61] },
  mistwood: { course:2, colors:[0x83998b,0x91a092,0x778d83,0xa1ac96,0xb1b89c] },
};
export interface CityPaver { x:number; z:number; y:number; width:number; depth:number; slopeX:number; slopeZ:number; color:number }

/** One coverage map for joined streets, doorway ramps, runtime meshes and Blender scenes. */
export function cityRoadPavers(city:CityLayout):CityPaver[] {
  const solids=[...ALL_CITY_COLLIDERS,...BUILDING_COLLIDERS,...ALL_CITY_GARDEN_COLLIDERS,...CIVIC_FURNITURE_COLLIDERS]
    .filter(p=>Math.abs(p.x-city.x)<CITY_RADIUS+8&&Math.abs(p.z-city.z)<CITY_RADIUS+8);
  const cells=new Set<string>(),key=(x:number,z:number)=>`${x},${z}`;
  for(const road of city.roads){
    const vertical=road.x1===road.x2,half=road.width/2;
    const left=Math.round((Math.min(road.x1,road.x2)-(vertical?half:0))*4),right=Math.round((Math.max(road.x1,road.x2)+(vertical?half:0))*4);
    const back=Math.round((Math.min(road.z1,road.z2)-(vertical?0:half))*4),front=Math.round((Math.max(road.z1,road.z2)+(vertical?0:half))*4);
    for(let ix=left;ix<right;ix++)for(let iz=back;iz<front;iz++){
      const x=(ix+.5)/4,z=(iz+.5)/4;
      if(!solids.some(p=>Math.abs(x-p.x)<p.halfWidth+.125-1e-7&&Math.abs(z-p.z)<p.halfDepth+.125-1e-7))cells.add(key(ix,iz));
    }
  }
  const {course,colors}=STREETS[city.zone],pavers:CityPaver[]=[],remaining=new Set(cells),heights=new Map<string,number>();
  const raised=BUILDINGS.filter(b=>city.homes.some(h=>h.id===b.id)||city.props.some(p=>p.id===b.id)).map(b=>{
    const turned=Math.abs(Math.sin(b.rotation))>.5;
    return {...buildingPoint(b,0,BUILDING_RAMP_LENGTH/2),halfWidth:(turned?b.depth+BUILDING_RAMP_LENGTH:b.width)/2,halfDepth:(turned?b.width:b.depth+BUILDING_RAMP_LENGTH)/2};
  });
  raised.push(...city.props.filter(p=>/pavilion|stable|market-stall/.test(p.kind)).map(p=>({x:p.x,z:p.z,halfWidth:p.width/2,halfDepth:p.depth/2})));
  const height=(x:number,z:number)=>{
    const id=key(x,z);
    if(!heights.has(id))heights.set(id,raised.some(p=>Math.abs(x-p.x)<=p.halfWidth+1e-7&&Math.abs(z-p.z)<=p.halfDepth+1e-7)?buildingFloorHeight(x,z):groundHeight(x,z));
    return heights.get(id)!;
  };
  // Bonded courses merge quarter-metre coverage without opening holes at narrow lanes or T-junctions.
  const ordered=[...cells].map(id=>id.split(',').map(Number)).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
  for(const [ix,iz] of ordered){
    if(!remaining.has(key(ix,iz)))continue;
    const row=Math.floor(iz/2),offset=(row%2+2)%2*Math.floor(course/2),end=(Math.floor((ix-offset)/course)+1)*course+offset;
    let w=1,d=1;
    while(ix+w<end&&remaining.has(key(ix+w,iz)))w++;
    if(iz%2===0&&Array.from({length:w},(_,i)=>remaining.has(key(ix+i,iz+1))).every(Boolean))d=2;
    let border=false;
    for(let dx=0;dx<w;dx++)for(let dz=0;dz<d;dz++){
      const x=ix+dx,z=iz+dz;remaining.delete(key(x,z));
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>!cells.has(key(x+a,z+b))))border=true;
    }
    const x=(ix+w/2)/4,z=(iz+d/2)/4,width=w/4,depth=d/4;
    const y=height(x,z),slopeX=(height(x+width/2,z)-height(x-width/2,z))/width;
    const slopeZ=(height(x,z+depth/2)-height(x,z-depth/2))/depth;
    // Keep the underside above the existing shallow entry steps, including a ramp's foot.
    const lift=Math.max(0,...[-1,1].flatMap(a=>[-1,1].map(b=>height(x+a*width/2,z+b*depth/2)-y-a*width/2*slopeX-b*depth/2*slopeZ)));
    pavers.push({x,z,y:y+.022+lift,width,depth,slopeX,slopeZ,color:colors[border?4:((ix*17+iz*31)%4+4)%4]});
  }
  return pavers;
}
