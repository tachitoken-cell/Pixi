import { WILD_BIOMES, RESOURCE_SITES, wildBiomeAt } from './world-features';
import * as THREE from 'three';
import { ARENA_BOUNDS, ARENA_COLLIDERS, ARENA_ENTRANCE, ARENA_RADIUS, isArenaInstance } from './arena';
import { isInstantCombatInstance, type InstantCombatState } from './instant-combat';
import { instantCombatMap, type InstantCombatMapId } from './instant-combat-maps';
import { RAID_BOUNDS, RAID_SUIT_ZONES, RAID_SUIT_GLYPHS } from './raid';
import { COLOSSEUM } from './colosseum';
import { MONSTERS } from './bestiary';
import { VILLAGES, VILLAGE_PROPS, villageFootprint, villagePropHeight } from './settlements';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ZONES, getZone, type ZoneId } from './content';
import { REGION_ORIGINS, WORLD_SCENERY, OVERWORLD_SPAWNS, toWorld, type RealmPoint, type RealmBounds } from './realm';
import { WORLD_BOUNDS, TERRAIN_STEP, WATER_LEVEL, EXPEDITIONS, surfaceAt, inCore } from './landscape';
import { regionLevelLabel } from './region-levels';
import { CITY, CITY_CLOCKTOWER, ALL_CITY_PROPS, ALL_CITY_ROADS, CITY_VENDORS, DEED_AUCTIONEER, ALL_CITY_FURNISHINGS, CITY_LAYOUTS, insideCity } from './city';
import { AUCTIONEERS, BANKERS } from './city-services';
import { POLL_BOOTHS } from './poll-booths';
import { ZEPPELIN_PORTS } from './zeppelin';
import { TRAINER_NPCS } from './training';
import { DUNGEONS, getDungeon, dungeonLayout, dungeonStages, type DungeonId, dungeonBounds, dungeonPreparation, DUNGEON_EXIT, dungeonReturn, dungeonRoomPortalOpen } from './dungeon';
import type { Player, PartyState, DungeonState } from './shared';

export interface WorldMapPoint extends RealmPoint { zone?: ZoneId; regionId?: string; id?: string; label?: string }
export interface WorldMapLabel { id: string; label: string; kind: string; x: number; y: number; visible: boolean; state?: string }
export interface WorldMapData {
  player: Pick<Player, 'id' | 'x' | 'z' | 'rotation' | 'zone' | 'instanceId'>;
  players?: readonly Player[]; party?: PartyState | null; dungeon?: DungeonState | null; instantCombat?: InstantCombatState | null;
  selected?: WorldMapPoint | null; route?: readonly RealmPoint[]; searchArea?: MapSearchArea;
}
export interface MapSearchArea extends RealmPoint { radius:number }
export function makeMapSearchArea(){
  const ring=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffd166,depthTest:false}));
  ring.name='treasure-search-area';ring.renderOrder=17;ring.visible=false;return ring;
}
export function updateMapSearchArea(ring:THREE.LineLoop,area:MapSearchArea|undefined,heightAt:(x:number,z:number)=>number){
  ring.visible=!!area;if(!area)return;
  const key=JSON.stringify(area);if(ring.userData.area===key)return;ring.userData.area=key;
  const points=Array.from({length:64},(_,i)=>{const angle=i/64*Math.PI*2,x=area.x+Math.cos(angle)*area.radius,z=area.z+Math.sin(angle)*area.radius;return new THREE.Vector3(x,heightAt(x,z)+2,z);});
  ring.geometry.dispose();ring.geometry=new THREE.BufferGeometry().setFromPoints(points);
}
interface AtlasLandmark extends WorldMapPoint { id: string; label: string }
interface AtlasLabel { point: AtlasLandmark; text: string; position: THREE.Vector3; kind: string }
type Cube = { x: number; y: number; z: number; w: number; h: number; d: number; color: string | THREE.Color };
const themes = {
  greenwood: { land: '#52994f', leaf: '#16754d', stone: '#b7b47b' },
  amberwild: { land: '#c38b36', leaf: '#c95823', stone: '#a88252' },
  frostmarch: { land: '#a2d1d1', leaf: '#428f9a', stone: '#76a5bb' },
  hollow: { land: '#756095', leaf: '#443f78', stone: '#ac86be' },
  sunveil: { land: '#d5ab64', leaf: '#54864b', stone: '#bf8754' },
  mistwood: { land: '#39784d', leaf: '#125e45', stone: '#738966' },
};
const inBounds = (p: RealmPoint, bounds: typeof WORLD_BOUNDS) => Number.isFinite(p.x) && Number.isFinite(p.z)
  && p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ;
const wave = (x: number, z: number) => (Math.sin(x * .071 + z * .041) + Math.cos(z * .083 - x * .027) + 2) / 4;
const cellNoise = (x: number, z: number) => {
  const value = Math.sin(Math.floor(x / 2) * 127.1 + Math.floor(z / 2) * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** The atlas uses the playable terrain, including its real stepped elevations. */
export function worldMapHeight(x: number, z: number): number {
  if (!inBounds({ x, z }, WORLD_BOUNDS)) return 0;
  const surface = surfaceAt(x, z); return surface.water ? WATER_LEVEL : surface.height;
}

/** Bound the whole atlas to 384 terrain samples per side; the local minimap retains 4m detail. */
export function worldMapTerrainStep(bounds: RealmBounds): number {
  return Math.max(TERRAIN_STEP, Math.ceil(Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)/384/TERRAIN_STEP)*TERRAIN_STEP);
}
// Shared cubes and instanced batches keep the atlas geometry bounded as the world grows.
function cubeBatch(cubes: Cube[], name: string, previous?: THREE.InstancedMesh): THREE.InstancedMesh {
  const geometry = previous?.geometry || new THREE.BoxGeometry(1, 1, 1), normals = geometry.getAttribute('normal');
  if (!previous) {
    const colors = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      const shade = normals.getY(i) > .5 ? 1 : normals.getZ(i) > .5 ? .78 : .67;
      colors.set([shade, shade, shade], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const mesh = previous || new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }), cubes.length);
  if (cubes.length > mesh.instanceMatrix.count) {
    // Release uploaded instance buffers before replacing them; retain the cube and material.
    mesh.dispose();
    const capacity = Math.max(cubes.length, mesh.instanceMatrix.count * 2);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  }
  mesh.count = cubes.length;
  mesh.name = name;
  const transform = new THREE.Object3D(), color = new THREE.Color();
  cubes.forEach((cube, i) => {
    transform.position.set(cube.x, cube.y, cube.z); transform.scale.set(cube.w, cube.h, cube.d); transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, color.set(cube.color));
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return mesh;
}
export function disposeGroup(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  group.removeFromParent();
}

/** Also used by the native geometry check; building the atlas needs no DOM or WebGL context. */
export function buildWorldMapScene(dungeon = false, localBounds?: RealmBounds, dungeonId: DungeonId = 'rootvault', arena = false, previous?: THREE.Group, raid = false, instantCombat: InstantCombatMapId | false = false) {
  const definition = getDungeon(dungeonId)!, stages = dungeonStages(dungeonId), layout = dungeonLayout(dungeonId);
  // Only overworld crops share resources; instance transitions own a separate atlas.
  const group = !raid && !dungeon && !arena && localBounds && previous || new THREE.Group(); group.name = raid ? 'raid-atlas' : arena ? 'arena-atlas' : dungeon ? `${dungeonId}-atlas` : 'realm-atlas';
  const oldMarkers = new Map(group.children.filter(child => child.userData.mapPoint).map(child => [child.name, child as THREE.Group]));
  const combatMap = instantCombat ? instantCombatMap(instantCombat) : undefined;
  const bounds = localBounds || (combatMap ? combatMap.bounds : raid ? RAID_BOUNDS : arena ? ARENA_BOUNDS : dungeon ? dungeonBounds(dungeonId) : WORLD_BOUNDS), labels: AtlasLabel[] = [], markers: THREE.Group[] = [];
  const roomOutlines = new Map<string, THREE.LineLoop>();
  const heightAt = arena || raid ? (_x: number, _z: number) => 0 : dungeon ? (_x: number, _z: number) => 3 : worldMapHeight;
  const cubes: Cube[] = [], props: Cube[] = [], cityCubes: Cube[] = [];
  const add = (out: Cube[], x: number, y: number, z: number, w: number, h: number, d: number, color: Cube['color']) => out.push({ x, y, z, w, h, d, color });
  const margin = localBounds ? 0 : 220;
  const backdrop = group.getObjectByName('atlas-surround') as THREE.Mesh || new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhongMaterial({ color: dungeon ? '#182b40' : '#187da4', specular: dungeon ? '#25334b' : '#73c6d9', shininess: 55 }));
  backdrop.scale.set(bounds.maxX - bounds.minX + margin, 1, bounds.maxZ - bounds.minZ + margin);
  backdrop.name = 'atlas-surround'; backdrop.position.set((bounds.minX + bounds.maxX) / 2, WATER_LEVEL - .55, (bounds.minZ + bounds.maxZ) / 2); group.add(backdrop);

  function marker(point: AtlasLandmark, kind: string, color: string, level = '') {
    if (localBounds && !inBounds(point, bounds)) return;
    const y = heightAt(point.x, point.z), existing = oldMarkers.get(point.id), pin = existing || new THREE.Group(); pin.name = point.id || kind;
    oldMarkers.delete(pin.name);
    pin.position.set(point.x, y, point.z); pin.userData.mapPoint = point; pin.userData.kind = kind;
    if (!existing) {
      const head = new THREE.Mesh(kind === 'portal' ? new THREE.TorusGeometry(2.1, .5, 4, 12) : new THREE.BoxGeometry(2.3, 2.3, 2.3), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: .16 }));
      head.position.y = 5; head.rotation.y = Math.PI / 4;
      if (kind === 'portal') head.rotation.x = Math.PI / 2;
      if (['trainer','vendor','auction','portal'].includes(kind)) pin.add(head);
      else {
        const stem = new THREE.Mesh(new THREE.BoxGeometry(.42, 4, .42), new THREE.MeshLambertMaterial({ color: '#f1e4bd' })); stem.position.y = 2;
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, .3, 8), new THREE.MeshLambertMaterial({ color })); foot.position.y = .3;
        pin.add(stem, head, foot);
      }
    }
    group.add(pin); markers.push(pin);
    const surface = !dungeon && !arena && surfaceAt(point.x, point.z);
    level ||= surface && ['village', 'expedition'].includes(kind) ? regionLevelLabel(surface.regionId, surface.zone) : '';
    labels.push({ point, text: point.label + (level ? ` · ${level}` : ''), kind, position: new THREE.Vector3(point.x, y + 8, point.z) });
  }

  if (raid) {
    add(cubes,0,-.5,0,68,1,68,'#3b4350');
    for(const zone of RAID_SUIT_ZONES){add(props,zone.x,.12,zone.z,zone.r*2,.24,zone.r*2,'#968169');marker({...zone,id:'raid-'+zone.suit,label:RAID_SUIT_GLYPHS[zone.suit]+' '+zone.suit},'raid','#f8d59a');}
  } else if (arena) {
    for(let x=bounds.minX+1;x<bounds.maxX;x+=2)for(let z=bounds.minZ+1;z<bounds.maxZ;z+=2){
      if(Math.hypot(x,z)<=(combatMap?.radius ?? ARENA_RADIUS))add(cubes,x,-.5,z,2,1,2,combatMap ? instantCombat === 'void-rift' ? '#43355a' : '#bb8c65' : '#cdb782');
    }
    for(const pillar of combatMap?.colliders ?? ARENA_COLLIDERS)if(!localBounds||inBounds(pillar,bounds))add(props,pillar.x,3,pillar.z,(pillar.halfWidth??pillar.r)*2,6,(pillar.halfDepth??pillar.r)*2,'#9eaa86');
    if (!instantCombat) {
      marker({id:'arena-team-0',x:-28,z:0,label:'Blue starting area'},'arena','#81d3ff');
      marker({id:'arena-team-1',x:28,z:0,label:'Red starting area'},'arena','#ff947a');
    }
  } else if (!dungeon) {
    const borders: number[] = [], borderColors: number[] = [], borderPalette = { greenwood: '#b8df7d', amberwild: '#ffd07a', frostmarch: '#c3f0ff', hollow: '#dba6e2', sunveil:'#f3ce7c', mistwood:'#92e3b4' };
    const step = worldMapTerrainStep(bounds);
    for (let x = bounds.minX + step / 2; x < bounds.maxX; x += step) for (let z = bounds.minZ + step / 2; z < bounds.maxZ; z += step) {
      const surface = surfaceAt(x, z), origin = REGION_ORIGINS[surface.zone], theme = themes[surface.zone], top = heightAt(x, z), h = top + 4;
      const road = !surface.water && surface.zone!=='greenwood' && inCore(x, z) && (Math.abs(x - origin.x) < 3 || Math.abs(z - origin.z) < 3);
      const grain = cellNoise(x, z);
      const shallow = surface.water && [[step, 0], [-step, 0], [0, step], [0, -step]].some(([dx, dz]) => !surfaceAt(x + dx, z + dz).water);
      const color = new THREE.Color(surface.water ? shallow ? '#39a5b2' : '#1877a8' : road ? '#ddc184' : surface.beach ? '#d4b977' : top > 69 && surface.zone !== 'sunveil' && surface.zone !== 'mistwood' ? '#d5e2de' : top > 56 ? theme.stone : theme.land).multiplyScalar(.70 + grain * .42 + wave(x, z) * .12);
      const biome=wildBiomeAt(x,z);if(biome&&!surface.water)color.setHex(biome.floor[0]);
      if (!surface.water && !road && !surface.beach) color.offsetHSL((grain - .5) * .035, .015, (grain - .5) * .045);
      add(cubes, x, top - h / 2, z, step, h, step, color);
      if (!surface.water) for (const [dx, dz] of [[step, 0], [0, step]]) {
        const next = surfaceAt(x + dx, z + dz); if (next.water || next.regionId === surface.regionId || !inBounds({ x: x + dx, z: z + dz }, bounds)) continue;
        const bx = x + dx / 2, bz = z + dz / 2, y = Math.max(top, heightAt(x + dx, z + dz)) + .3;
        borders.push(bx - dz / 2, y, bz - dx / 2, bx + dz / 2, y, bz + dx / 2);
        const tint = new THREE.Color(borderPalette[surface.zone]); borderColors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      }
    }
    for(const road of ALL_CITY_ROADS){
      const x=(road.x1+road.x2)/2,z=(road.z1+road.z2)/2;
      if(localBounds&&(Math.max(road.x1,road.x2)<bounds.minX||Math.min(road.x1,road.x2)>bounds.maxX||Math.max(road.z1,road.z2)<bounds.minZ||Math.min(road.z1,road.z2)>bounds.maxZ))continue;
      add(cityCubes,x,heightAt(x,z)+.07,z,Math.max(road.width,Math.abs(road.x2-road.x1)),.14,Math.max(road.width,Math.abs(road.z2-road.z1)),'#b9ae91');
    }
    for (const solid of WORLD_SCENERY) {
      if (localBounds && !inBounds(solid, bounds)) continue;
      const { x, z } = solid, y = heightAt(x, z), theme = themes[solid.zone];
      if (solid.kind === 'tree') {
        const height = solid.height, width = solid.treeModel ? (solid.treeModel === 'ElderOak' ? 17 : 11) * solid.scale : 3.6 * solid.scale;
        add(props, x, y + height * .28, z, solid.r, height * .56, solid.r, '#8b7054');
        for (let tier = 0; tier < 3; tier++) {
          const size = width * (1 - tier * .22);
          add(props, x, y + height * (.52 + tier * .18), z, size, height * .24, size, new THREE.Color(theme.leaf).multiplyScalar(1 + tier * .1));
        }
      } else if (solid.kind === 'house') {
        const w = (solid.halfWidth || 2) * 2, d = (solid.halfDepth || 2) * 2;
        if(insideCity(x,z)){
          const base=solid.height>7?7.5:5.2;
          add(props,x,y+base/2,z,w,base,d,'#ebd6aa');
          for(let tier=0;tier<3;tier++)add(props,x,y+base+.65+tier,z,(w+.6)*(1-tier*.28),1.3,d+.6,'#457c70');
        }else{
          add(props,x,y+1.7,z,w,3.4,d,'#ebd6aa');
          add(props,x,y+4,z,w+.6,1.2,d+.6,solid.zone==='greenwood'?'#b7674c':'#847889');
          add(props,x,y+5,z,w*.58,1,d,'#be8458');
        }
      } else {
        const height = Math.min(8, solid.height), width = (solid.halfWidth || solid.r) * 2;
        add(props, x, y + height / 2, z, width, height, (solid.halfDepth || solid.r) * 2, solid.kind === 'board' || solid.kind === 'workshop' ? '#a17e52' : theme.stone);
      }
    }
    for(const prop of VILLAGE_PROPS){
      if (localBounds && !inBounds(prop, bounds)) continue;
      const y=villagePropHeight(prop),{width,depth}=villageFootprint(prop);
      if(prop.kind==='cottage'||prop.kind==='inn'){
        const biome=VILLAGES.find(v=>v.id===prop.villageId)!.zone;
        add(props,prop.x,y+1.6,prop.z,width,3.2,depth,biome==='sunveil'?'#dab576':biome==='mistwood'?'#97714d':'#dbbd83');
        for(let tier=0;tier<3;tier++)add(props,prop.x,y+3.4+tier*.55,prop.z,width*(1-tier*.24),.6,depth,biome==='sunveil'?'#bb7546':biome==='mistwood'?'#30764d':'#457c70');
      }else add(props,prop.x,y+(prop.kind==='lantern'?1.5:1),prop.z,width,prop.kind==='lantern'?3:2,depth,prop.kind==='stall'?'#62a193':'#d2c194');
    }
    for(const village of VILLAGES)marker({...village,label:village.name},'village','#fff0c4');
    for (const prop of ALL_CITY_FURNISHINGS.filter(p=>!p.buildingId)) {
      if(localBounds&&!inBounds(prop,bounds))continue;
      const y=heightAt(prop.x,prop.z),tree=prop.kind==='courtyard-tree',height=tree?8:prop.kind==='lantern-statue'?5:1.4;
      add(cityCubes,prop.x,y+height/2,prop.z,prop.width,height,prop.depth,tree?'#337849':prop.kind==='lantern-statue'?'#b5b69c':'#609255');
      if(tree)add(cityCubes,prop.x,y+6,prop.z,6,3,6,'#457e42');
    }
    for (const prop of ALL_CITY_PROPS) {
      if (localBounds && !inBounds(prop,bounds)) continue;
      const y=heightAt(prop.x,prop.z)+.08,c=Math.cos(prop.rotation),s=Math.sin(prop.rotation),turned=Math.abs(s)>.5;
      const cityBox=(x:number,yy:number,z:number,w:number,h:number,d:number,color:string)=>
        add(cityCubes,prop.x+x*c+z*s,y+yy,prop.z-x*s+z*c,turned?d:w,h,turned?w:d,color);
      if(prop.kind==='city-wall'){
        cityBox(0,4.3,0,8,8.6,2.4,'#8b8d7c');cityBox(0,8.55,0,8,.35,2.4,'#b0aa92');
        for(const x of [-3,-1,1,3])cityBox(x,9.1,0,1.15,1,2.4,'#a8ad94');
      }
      else if(prop.kind==='city-lantern'){cityBox(0,1.6,0,.22,3.2,.22,'#795338');cityBox(0,3.6,0,.55,.70,.55,'#f4d38b');}
      else if(prop.kind==='city-gate') {
        for(const side of [-1,1]){cityBox(side*4.5,6.8,0,3,13.6,5,'#b1b19c');cityBox(side*4.5,15.2,0,3.4,3.6,5.5,'#457c70');}
        cityBox(0,7.5,0,6,1,1,'#b58c58');
      } else if(prop.kind==='city-clocktower'){
        cityBox(0,4,0,prop.width,8,prop.depth,'#b0aa92');cityBox(0,8.7,0,prop.width+.5,1.4,prop.depth+.5,'#457c70');
        cityBox(0,16,0,7.5,14,7.5,'#b0aa92');
        for(const side of [-1,1]){cityBox(side*3.83,20,0,.15,3,3,'#dfb35f');cityBox(0,20,side*3.83,3,3,.15,'#dfb35f');}
        cityBox(0,24,0,7.8,3.5,7.8,'#795338');
        for(let tier=0;tier<4;tier++)cityBox(0,26+tier*1.35,0,9-tier*2,1.4,9-tier*2,'#457c70');
      } else if(prop.kind==='city-fountain') {
        cityBox(0,.5,0,6,1,6,'#b4b69f');cityBox(0,1.05,0,5,.15,5,'#7ed2d4');cityBox(0,2.3,0,1.3,3,1.3,'#dfc77f');
      } else {
        const hall=prop.kind==='city-auction-hall',stall=prop.kind==='city-market-stall',stable=prop.kind==='city-stable';
        const base=hall?7:stall?3.7:stable?4.9:4.4,roof=prop.kind==='city-mage-pavilion'?'#8373ac':prop.kind==='city-knight-pavilion'?'#b06160':'#457c70';
        cityBox(0,base/2,-prop.depth/2+.2,prop.width,base,.4,'#e1cca0');
        for(const side of [-1,1])cityBox(side*(prop.width/2-.2),base/2,0,.4,base,prop.depth,'#b58c58');
        if(hall)for(const side of [-1,1])cityBox(side*7.5,3.5,8.7,9,7,.6,'#e1cca0');
        for(let tier=0;tier<(stall?1:3);tier++)cityBox(0,base+.5+tier*(hall?1.65:.6),0,(prop.width+.7)*(1-tier*.27),hall?1.7:.65,prop.depth+.6,roof);
      }
    }
    marker({...CITY_CLOCKTOWER,z:CITY_CLOCKTOWER.z+CITY_CLOCKTOWER.depth/2+3,label:'Town hall · Rowan'},'village','#ffe0a2');
    for(const port of ZEPPELIN_PORTS)marker({...port,id:`zeppelin-${port.id}`,zone:port.id,label:`${port.name} · Zeppelin dock`},'village','#e7c58a');
    for(const city of CITY_LAYOUTS.slice(1)){const hall=city.props.find(prop=>prop.kind==='city-clocktower')!;marker({...hall,z:hall.z+hall.depth/2+3,label:`${city.name} town hall`,zone:city.zone},'village','#ffe0a2');}
    for(const npc of TRAINER_NPCS)marker({...npc,label:npc.title},'trainer','#a9d4ff');
    for(const npc of CITY_VENDORS)marker({...npc,label:npc.title},'vendor','#ffe18c');
    for(const npc of AUCTIONEERS)marker({...npc,label:`${npc.cityName} Auction House`},'auction','#e4b9ff');
    marker({...DEED_AUCTIONEER,label:'House deed auctions'},'auction','#e4b9ff');
    for(const booth of POLL_BOOTHS)marker({...booth,label:`${booth.cityName} Polling booth`},'poll','#d6c08c');
    for(const npc of BANKERS)marker({...npc,label:`${npc.cityName} Bank`},'vendor','#f3d581');
    marker({ ...COLOSSEUM, z: COLOSSEUM.z + COLOSSEUM.radius + 1, label: `${COLOSSEUM.name} · Lethal world PvP` }, 'pvp', '#ff7957');
    marker({ ...ARENA_ENTRANCE, id:'arena-entrance', label:'Arena matches · Private 1v1 & 2v2' }, 'arena', '#81d3ff');
    for (let i = 0; i < 40; i++) {
      const angle = i / 40 * Math.PI * 2, x = COLOSSEUM.x + Math.sin(angle) * 60, z = COLOSSEUM.z + Math.cos(angle) * 60;
      if (localBounds && !inBounds({x,z},bounds) || Math.abs(x-COLOSSEUM.x)<8 || Math.abs(z-COLOSSEUM.z)<8) continue;
      add(props, x, heightAt(x,z)+6, z, 9, 12, 9, '#9eaa86');
    }
    for (const zone of ZONES) {
      const title = { ...toWorld(zone.id, { x: 0, z: -33 }), id: `region-${zone.id}`, label: zone.name, zone: zone.id };
      labels.push({ point: title, text: `${title.label} · ${regionLevelLabel(zone.id, zone.id)}`, kind: 'region', position: new THREE.Vector3(title.x, heightAt(title.x, title.z) + 2, title.z) });
      marker({ ...toWorld(zone.id, zone.npc), id: zone.npc.id, label: CITY_LAYOUTS.find(city=>city.zone===zone.id)!.name }, 'village', '#fff0c4');
      marker({ ...toWorld(zone.id, { x: 3, z: 2 }), zone: zone.id, id: `board-${zone.id}`, label: 'Quest board' }, 'board', '#f6cc6d');
      marker({ ...toWorld(zone.id, { x: -4, z: 3 }), zone: zone.id, id: `workshop-${zone.id}`, label: 'Workshop' }, 'workshop', '#df9b65');
      if (zone.beacon) marker({ ...toWorld(zone.id, zone.beacon), id: zone.beacon.id, zone: zone.id, label: zone.beacon.name }, 'beacon', '#a8eff4');
    }
    const borderLines = group.getObjectByName('atlas-region-borders') as THREE.LineSegments || new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .9 }));
    const borderGeometry = borderLines.geometry;
    let positions = borderGeometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!positions || positions.array.length < borders.length) {
      const capacity = Math.max(borders.length, positions?.array.length ? positions.array.length * 2 : 0);
      borderGeometry.dispose();
      positions = new THREE.Float32BufferAttribute(new Float32Array(capacity), 3);
      borderGeometry.setAttribute('position', positions);
      borderGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(capacity), 3));
    }
    positions.array.set(borders); positions.needsUpdate = true;
    const colors = borderGeometry.getAttribute('color') as THREE.BufferAttribute; colors.array.set(borderColors); colors.needsUpdate = true;
    borderGeometry.setDrawRange(0, borders.length / 3); borderLines.frustumCulled = false;
    borderLines.name = 'atlas-region-borders'; group.add(borderLines);
    for (const site of RESOURCE_SITES) marker({...site,label:site.name}, 'expedition', '#c6b482');
    for (const biome of WILD_BIOMES) marker({...biome,label:biome.name}, 'expedition', '#d5acbc');
    for (const region of EXPEDITIONS) marker({ id: region.id, regionId: region.id, label: region.name, zone: region.zone, x: region.x, z: region.z }, 'expedition', borderPalette[region.zone]);
    for(const boss of OVERWORLD_SPAWNS.filter(spawn=>spawn.worldBoss))marker({...boss,label:MONSTERS[boss.kind].name},'world-boss','#ff7957',`Lv ${MONSTERS[boss.kind].level}`);
    for (const entry of DUNGEONS) {
      marker({ ...entry.entrance, id: entry.id === 'rootvault' ? 'dungeon-entrance' : `dungeon-entrance-${entry.id}`, label: entry.name }, 'dungeon', entry.color, `Lv ${entry.minLevel}–${entry.maxLevel}`);
      marker({ ...entry.summonStone, zone: entry.entrance.zone, id: `dungeon-summon-${entry.id}`, label: `${entry.name} summon stone` }, 'summon', entry.color);
    }
  } else {
    const roomColors = { moss: '#70a58a', amber: '#b7a05f', frost: '#a0cbd6', root: '#977aaa' };
    const extent = dungeonBounds(dungeonId), startX = extent.minX + Math.floor((bounds.minX - extent.minX) / 2) * 2 + 1, startZ = extent.minZ + Math.floor((bounds.minZ - extent.minZ) / 2) * 2 + 1;
    for (let x = startX; x < bounds.maxX; x += 2) for (let z = startZ; z < bounds.maxZ; z += 2) {
      const room = layout.rooms.find(room => Math.abs(x - room.x) <= room.width / 2 && Math.abs(z - room.z) <= room.depth / 2);
      if (!room) continue;
      const x1 = Math.max(x - 1, bounds.minX), x2 = Math.min(x + 1, bounds.maxX), z1 = Math.max(z - 1, bounds.minZ), z2 = Math.min(z + 1, bounds.maxZ);
      if (x2 > x1 && z2 > z1) add(cubes, (x1 + x2) / 2, 1.5, (z1 + z2) / 2, x2 - x1, 3, z2 - z1, new THREE.Color(roomColors[room.theme]).multiplyScalar(.85 + wave(x * 3, z * 3) * .22));
    }
    for (const wall of layout.walls) {
      if (!localBounds) { add(props, wall.x, 3 + Math.min(wall.height, 4) / 2, wall.z, wall.halfWidth * 2, Math.min(wall.height, 4), wall.halfDepth * 2, '#b0a2ac'); continue; }
      const x1 = Math.max(bounds.minX, wall.x - wall.halfWidth), x2 = Math.min(bounds.maxX, wall.x + wall.halfWidth);
      const z1 = Math.max(bounds.minZ, wall.z - wall.halfDepth), z2 = Math.min(bounds.maxZ, wall.z + wall.halfDepth);
      if (x2 > x1 && z2 > z1) add(props, (x1 + x2) / 2, 3 + Math.min(wall.height, 4) / 2, (z1 + z2) / 2, x2 - x1, Math.min(wall.height, 4), z2 - z1, '#b0a2ac');
    }
    for (const room of layout.rooms) {
      const stage = stages.find(stage => stage.id === room.id);
      if (room.optional && !stage && room.id !== 'preparation') continue;
      if (localBounds && !inBounds(room, bounds)) continue;
      const hw = room.width / 2 - .6, hd = room.depth / 2 - .6;
      const x1 = localBounds ? Math.max(-hw, bounds.minX - room.x) : -hw, x2 = localBounds ? Math.min(hw, bounds.maxX - room.x) : hw;
      const z1 = localBounds ? Math.max(-hd, bounds.minZ - room.z) : -hd, z2 = localBounds ? Math.min(hd, bounds.maxZ - room.z) : hd;
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, 3.15, z1), new THREE.Vector3(x2, 3.15, z1), new THREE.Vector3(x2, 3.15, z2), new THREE.Vector3(x1, 3.15, z2)]), new THREE.LineBasicMaterial({ color: '#76959b', transparent: true, opacity: .6 }));
      outline.position.set(room.x, 0, room.z); group.add(outline); roomOutlines.set(room.id, outline);
      const name = (stage?.name || room.name) + (stage?.optional ? ' (optional)' : '');
      labels.push({ point: { id: room.id, label: name, x: room.x, z: room.z }, text: name, kind: 'room', position: new THREE.Vector3(room.x, 4, room.z) });
    }
    for (const object of layout.objects) marker({ id: object.id, label: object.label, x: object.x, z: object.z }, object.kind, object.kind === 'seal' ? '#a9edee' : object.kind === 'chest' ? '#eacc7b' : '#c0ef99');
    for (const portal of layout.portals) marker({ id: portal.id, label: `Portal to ${portal.label}`, x: portal.x, z: portal.z }, 'portal', '#9290aa');
    if (!localBounds && layout.portals.length) {
      const links = layout.portals.filter(portal => portal.roomId < portal.targetRoomId).flatMap(portal => [new THREE.Vector3(portal.x, 3.3, portal.z), new THREE.Vector3(portal.destination.x, 3.3, portal.destination.z)]);
      const connections = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(links), new THREE.LineDashedMaterial({ color: '#73a3db', dashSize: 2, gapSize: 2, transparent: true, opacity: .65 }));
      connections.name = 'atlas-room-portal-connections'; connections.computeLineDistances(); group.add(connections);
    }
    const preparation = dungeonPreparation(dungeonId);
    if (preparation) marker({ x: (preparation.minX+preparation.maxX)/2, z: (preparation.minZ+preparation.maxZ)/2, id: 'dungeon-preparation', label: 'Arrival sanctuary' }, 'sanctuary', '#a6f4dc');
    marker({ ...DUNGEON_EXIT, id: 'dungeon-exit', label: 'Return to the entrance' }, 'dungeon', '#ecdfb5');
    marker({ ...dungeonReturn(dungeonId), id: 'dungeon-return', label: 'Return portal' }, 'dungeon', definition.color);
    const returnMarker = markers.find(marker => marker.name === 'dungeon-return'); if (returnMarker) returnMarker.visible = false;
  }
  for (const marker of oldMarkers.values()) disposeGroup(marker);
  const ground = cubeBatch(cubes, 'atlas-land', group.getObjectByName('atlas-land') as THREE.InstancedMesh | undefined);
  const scenery = cubeBatch([...props,...cityCubes], 'atlas-scenery', group.getObjectByName('atlas-scenery') as THREE.InstancedMesh | undefined); group.add(ground, scenery);
  return { group, ground, scenery, markers, labels, roomOutlines, bounds, heightAt, dungeonName: combatMap ? combatMap.name : raid ? 'Apostle sanctum' : arena ? 'Thornring Arena' : definition.name, dispose: () => disposeGroup(group) };
}

/** Atlas and minimap share the same server-owned portal availability. */
export function updateDungeonPortalMap(atlas: Pick<ReturnType<typeof buildWorldMapScene>, 'markers' | 'labels'>, state?: DungeonState | null) {
  if (!state?.kind) return;
  const activated = state.objects.filter(object => object.activated).map(object => object.id);
  for (const portal of dungeonLayout(state.kind).portals) {
    const open = !!state.dream || dungeonRoomPortalOpen(portal, state.clearedStages, activated), marker = atlas.markers.find(marker => marker.name === portal.id);
    if (marker) {
      const material = (marker.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>).material;
      material.color.set(open ? '#70c8ff' : '#9290aa'); material.emissive.copy(material.color);
    }
    const label = atlas.labels.find(label => label.point.id === portal.id);
    if (label) label.text = `${open ? 'Portal' : 'Sealed'} · ${portal.label}`;
  }
}

export function createWorldMap(canvas: HTMLCanvasElement, options: { onSelect: (point: WorldMapPoint) => void }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5)); renderer.setClearColor('#183346');
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#419abb');
  scene.add(new THREE.HemisphereLight('#fff8de', '#345b70', 1.5));
  const sun = new THREE.DirectionalLight('#fff0cf', 1.9); sun.position.set(-80, 170, 70); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(42, 1, .5, 10000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .09; controls.enablePan = true; controls.screenSpacePanning = false;
  controls.minPolarAngle = .25; controls.maxPolarAngle = 1.25; controls.minDistance = 22; controls.maxDistance = 4800;
  controls.rotateSpeed = .55; controls.zoomSpeed = .75; controls.panSpeed = .8;
  let atlas = buildWorldMapScene(), instanceId: string | null = null, dungeonId: DungeonId = 'rootvault', latest: WorldMapData | undefined, disposed = false, contextLost = false;
  let previous = performance.now(), width = 0, height = 0, lastRoute = '', down: { x: number; y: number; moved: boolean } | undefined;
  const pointers = new Set<number>();
  scene.add(atlas.group);
  const searchArea=makeMapSearchArea();scene.add(searchArea);
  const playerMarker = new THREE.Group(); playerMarker.name = 'atlas-player';
  const playerArrow = new THREE.Mesh(new THREE.ConeGeometry(1.55, 3.8, 3), new THREE.MeshBasicMaterial({ color: '#fffde6', depthTest: false }));
  playerArrow.rotation.x = Math.PI / 2; playerArrow.renderOrder = 5; playerMarker.add(playerArrow); scene.add(playerMarker);
  const dots = new THREE.InstancedMesh(new THREE.BoxGeometry(1.65, 1.65, 1.65), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }), 128);
  dots.count = 0; dots.renderOrder = 4; dots.frustumCulled = false; scene.add(dots);
  const selected = new THREE.Mesh(new THREE.TorusGeometry(2.6, .25, 4, 24), new THREE.MeshBasicMaterial({ color: '#ffe4a2', depthTest: false }));
  selected.rotation.x = Math.PI / 2; selected.renderOrder = 4; selected.visible = false; scene.add(selected);
  const route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#fff0b3', depthTest: false, transparent: true, opacity: .9 }));
  route.renderOrder = 3; route.visible = false; scene.add(route);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), projection = new THREE.Vector3(), transform = new THREE.Object3D(), color = new THREE.Color();
  function fitView() {
    if (disposed) return;
    const bounds = atlas.bounds;
    controls.target.set((bounds.minX + bounds.maxX) / 2, 4, (bounds.minZ + bounds.maxZ) / 2);
    const direction = new THREE.Vector3(125, 205, 215).normalize(), right = new THREE.Vector3().crossVectors(camera.up, direction).normalize(), up = new THREE.Vector3().crossVectors(direction, right);
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
    let distance = controls.minDistance;
    for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) for (const y of [0, 44]) {
      const corner = new THREE.Vector3(x, y, z).sub(controls.target), depth = corner.dot(direction);
      distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / tanX, depth + Math.abs(corner.dot(up)) / tanY);
    }
        controls.maxDistance = Math.max(4800,distance*1.6);
    camera.far = controls.maxDistance + Math.hypot(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ) + 200;
    camera.updateProjectionMatrix();
    camera.position.copy(controls.target).add(direction.multiplyScalar(distance * 1.12)); controls.update();
  }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
    width = rect.width; height = rect.height; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  function focusPlayer() {
    if (disposed || !latest) return;
    const offset = camera.position.clone().sub(controls.target).setLength(95);
    controls.target.set(latest.player.x, atlas.heightAt(latest.player.x, latest.player.z), latest.player.z);
    camera.position.copy(controls.target).add(offset); controls.update();
  }
  function zoomBy(factor: number) {
    if (disposed || !Number.isFinite(factor) || factor <= 0) return;
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() / factor, controls.minDistance, controls.maxDistance));
    camera.position.copy(controls.target).add(offset); controls.update();
  }
  function pointerDown(event: PointerEvent) {
    pointers.add(event.pointerId);
    down = event.button === 0 && pointers.size === 1 ? { x: event.clientX, y: event.clientY, moved: false } : undefined;
  }
  function pointerMove(event: PointerEvent) { if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) down.moved = true; }
  function pointerUp(event: PointerEvent) {
    const press = down; down = undefined; pointers.delete(event.pointerId); if (!press || press.moved || disposed || contextLost) return;
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(atlas.markers, true)) {
      let node: THREE.Object3D | null = hit.object;
      while (node && !node.userData.mapPoint) node = node.parent;
      if (node?.userData.mapPoint && node.visible) { options.onSelect({ ...node.userData.mapPoint }); return; }
    }
    const hit = raycaster.intersectObject(atlas.ground)[0]; if (!hit || !inBounds(hit.point, atlas.bounds)) return;
    const surface = instanceId ? undefined : surfaceAt(hit.point.x, hit.point.z);
    const name = surface ? wildBiomeAt(hit.point.x,hit.point.z)?.name || EXPEDITIONS.find(region => region.id === surface.regionId)?.name || getZone(surface.zone).name : atlas.dungeonName;
    options.onSelect({ x: hit.point.x, z: hit.point.z, ...(surface ? { zone: surface.zone, regionId: surface.regionId } : {}), label: surface?.water ? `Waters near ${name}` : name });
  }
  function pointerCancel(event: PointerEvent) { pointers.delete(event.pointerId); down = undefined; }
  function lost(event: Event) { event.preventDefault(); contextLost = true; }
  function restored() { contextLost = false; resize(); }
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
  resize(); fitView();

  return {
    resize, focusPlayer, fitView, zoomBy,
    update(data: WorldMapData): WorldMapLabel[] {
      if (disposed || contextLost) return []; latest = data;
      const nextDungeonId = data.dungeon?.kind || 'rootvault';
      if (instanceId !== data.player.instanceId || dungeonId !== nextDungeonId) {
        instanceId = data.player.instanceId; dungeonId = nextDungeonId;
        const instantCombat=isInstantCombatInstance(instanceId), arena=isArenaInstance(instanceId)||instantCombat;
        atlas.dispose(); atlas = buildWorldMapScene(!!instanceId&&!arena, undefined, dungeonId, arena, undefined, false, instantCombat ? instantCombatMap(data.instantCombat?.run?.mapId).id : false); scene.add(atlas.group);
        scene.background = new THREE.Color(instanceId&&!arena ? '#203047' : '#419abb'); lastRoute = ''; fitView();
      }
      updateMapSearchArea(searchArea,data.player.instanceId?undefined:data.searchArea,atlas.heightAt);
      const rect = canvas.getBoundingClientRect(); if (rect.width !== width || rect.height !== height) resize();
      const now = performance.now(), delta = Math.min(.1, (now - previous) / 1000); previous = now;
      controls.update(delta);
      const shiftX = THREE.MathUtils.clamp(controls.target.x, atlas.bounds.minX - 25, atlas.bounds.maxX + 25) - controls.target.x;
      const shiftZ = THREE.MathUtils.clamp(controls.target.z, atlas.bounds.minZ - 25, atlas.bounds.maxZ + 25) - controls.target.z;
      controls.target.x += shiftX; controls.target.z += shiftZ; camera.position.x += shiftX; camera.position.z += shiftZ;
      const distance = camera.position.distanceTo(controls.target), markerScale = Math.max(1, Math.min(6, distance / 330));
      for (const marker of atlas.markers) marker.scale.setScalar(markerScale);
      playerMarker.position.set(data.player.x, atlas.heightAt(data.player.x, data.player.z) + 8 * markerScale, data.player.z); playerMarker.rotation.y = data.player.rotation; playerMarker.scale.setScalar(markerScale);
      const partyIds = new Set(data.party?.members.map(member => member.id)),self=data.players?.find(player=>player.id===data.player.id); let count = 0;
      for (const p of data.players || []) {
        if (p.id === data.player.id || p.instanceId !== instanceId || !inBounds(p, atlas.bounds) || count >= 128) continue;
        transform.position.set(p.x, atlas.heightAt(p.x, p.z) + 7 * markerScale, p.z); transform.scale.setScalar(markerScale * (partyIds.has(p.id) ? 1.55 : 1)); transform.updateMatrix();
        dots.setMatrixAt(count, transform.matrix); dots.setColorAt(count++, color.set(isArenaInstance(instanceId)&&self?.arenaMatchId?(p.arenaTeam===self.arenaTeam?'#81e3ff':'#ff947a'):partyIds.has(p.id) ? '#81e3ff' : '#d4e3dd'));
      }
      dots.count = count; dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      selected.visible = !!data.selected && inBounds(data.selected, atlas.bounds);
      if (data.selected) { selected.position.set(data.selected.x, atlas.heightAt(data.selected.x, data.selected.z) + 1, data.selected.z); selected.scale.setScalar(1 + Math.sin(now * .003) * .08); }
      const key = JSON.stringify(data.route || []);
      if (key !== lastRoute) {
        lastRoute = key; route.geometry.dispose();
        route.geometry = new THREE.BufferGeometry().setFromPoints((data.route || []).filter(point => inBounds(point, atlas.bounds)).map(point => new THREE.Vector3(point.x, atlas.heightAt(point.x, point.z) + 1, point.z)));
        route.visible = (data.route?.length || 0) > 1;
      }
      const cleared = new Set(data.dungeon?.clearedStages || []), current = data.dungeon?.encounterName;
      for (const room of isArenaInstance(instanceId)||isInstantCombatInstance(instanceId)?[]:dungeonLayout(dungeonId).rooms) {
        const outline = atlas.roomOutlines.get(room.id); if (!outline) continue;
        (outline.material as THREE.LineBasicMaterial).color.set(cleared.has(room.id) ? '#b5eeaa' : current === atlas.labels.find(label => label.point.id === room.id)?.point.label ? '#ffe5a4' : '#76959b');
      }
      for (const marker of atlas.markers) {
        if (marker.name === 'dungeon-return') marker.visible = !!data.dungeon?.completed;
        const state = data.dungeon?.objects.find(object => object.id === marker.name); if (!state) continue;
        const head = marker.children[1] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
        head.material.color.set(state.activated ? '#b5d5a6' : state.available ? '#ffe3a0' : '#7b859c');
      }
      if (data.dungeon?.kind) updateDungeonPortalMap(atlas, data.dungeon);
      camera.updateMatrixWorld(); scene.updateMatrixWorld(); renderer.render(scene, camera);
      const labels = atlas.labels.map(label => {
        projection.copy(label.position); if (!['region', 'room'].includes(label.kind)) projection.y = atlas.heightAt(label.point.x, label.point.z) + 8 * markerScale; projection.project(camera);
        const detailed = ['board', 'workshop', 'beacon', 'chest', 'checkpoint','trainer','vendor','auction','poll','summon','portal'].includes(label.kind);
        const scaleVisible = label.kind !== 'village' || distance <= 650;
        return { id: label.point.id, label: label.text, kind: label.kind, x: (projection.x * .5 + .5) * width, y: (-projection.y * .5 + .5) * height,
          visible: (label.point.id !== 'dungeon-return' || !!data.dungeon?.completed) && projection.z > -1 && projection.z < 1 && Math.abs(projection.x) < .98 && Math.abs(projection.y) < .98 && (scaleVisible || data.selected?.id === label.point.id) && (!detailed || distance < 150 || data.selected?.id === label.point.id),
          state: cleared.has(label.point.id) ? 'cleared' : current === label.point.label ? 'current' : undefined };
      });
      // Reserve screen space in a stable order, then reveal more names as zoom separates them.
      const mobile = width <= 800, occupied: { x: number; y: number; width: number; height: number }[] = [];
      const priority = (label: WorldMapLabel) => label.id === data.selected?.id ? 0 : label.kind === 'region' || label.kind === 'world-boss' ? 1 : label.state === 'current' ? 2 : ['region', 'village', 'expedition', 'room'].includes(label.kind) ? 3 : 4;
      for (const label of labels.filter(label => label.visible).sort((a, b) => priority(a) - priority(b))) {
        const region = label.kind === 'region', maxWidth = mobile ? 115 : 180;
        const textWidth = label.label.length * (region ? (mobile ? 7.5 : 11) : (mobile ? 4.8 : 6.2));
        const box = { x: label.x, y: label.y, width: Math.min(maxWidth, textWidth) + 8,
          height: Math.ceil(textWidth / maxWidth) * (region ? (mobile ? 14 : 20) : (mobile ? 11 : 13)) + 6 };
        if (occupied.some(other => Math.abs(box.x - other.x) < (box.width + other.width) / 2 && Math.abs(box.y - other.y) < (box.height + other.height) / 2)) label.visible = false;
        else occupied.push(box);
      }
      return labels;
    },
    dispose() {
      if (disposed) return; disposed = true; controls.dispose();
      latest = undefined; down = undefined; pointers.clear();
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerCancel);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      disposeGroup(scene); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
