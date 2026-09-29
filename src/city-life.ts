import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY_LAYOUTS, type CityLayout } from './city.ts';
import { CITY_SERVICE_NPCS } from './city-services.ts';
import { buildingFloorHeight, buildingPoint } from './buildings.ts';
import { canTraverse, toWorld } from './realm.ts';
import { waterAt } from './landscape.ts';
import { NPCS } from './content.ts';
import { VILLAGE_NPCS } from './settlements.ts';
import { TRAINER_NPCS } from './training.ts';
import { TRAINING_PRACTICE } from './training-grounds-data.ts';
import { createVillager, animateVillager } from './village-models.ts';
import { setMountAssets, makeMount, animateMount, disposeMount } from './mounts.ts';
import type { WorldCitizen } from './world.ts';

type Point = { x: number; z: number };
type Route = { start: Point; end: Point; length: number };
type Role = 'merchant' | 'warden' | 'healer';
const CITIZEN_NAMES = [
  'Alden Mossbrook', 'Nella Thistledown', 'Tobin Reedfoot', 'Elsa Fernwell',
  'Cora Ashbloom', 'Hester Oakmere', 'Wilbur Greenbough', 'Pippa Hazelwick',
  'Seren Oakshield', 'Garrick Pinewatch', 'Brina Stoneleaf', 'Ronan Copperguard',
  'Elowen Ward', 'Hale Briarwatch', 'Vera Mossguard', 'Dain Thornwall',
  'Iris Dewvale', 'Orren Willowstep', 'Liora Springbrook', 'Ansel Greenlight',
  'Maeve Dawnsong', 'Noren Mistvale', 'Elara Brookmend', 'Sylven Fernsong',
];
// Reuse the same three authored outfits; regional dyes and occupations change the street crowd.
const CITY_PERSONALITIES = {
  greenwood: { counts: [8, 8, 8], colors: [0xd7c397, 0x85a484, 0xc9dfb5], pace: 1, pause: 1.5,
    titles: ['Townsperson', 'Town guard', 'Pilgrim'], surnames: ['Mossbrook', 'Fernwell', 'Oakmere', 'Hazelwick'] },
  amberwild: { counts: [10, 8, 6], colors: [0xe9b775, 0xb98558, 0xead3a0], pace: 1.05, pause: 2,
    titles: ['Harvest trader', 'Orchard watch', 'Field herbalist'], surnames: ['Ambergrain', 'Ciderbrook', 'Russetleaf', 'Honeywell'] },
  frostmarch: { counts: [6, 12, 6], colors: [0xaabacb, 0x809dbb, 0xd0e4df], pace: 1.14, pause: 1.2,
    titles: ['Fur trader', 'Frost sentinel', 'Hearth keeper'], surnames: ['Rimefell', 'Snowmantle', 'Frostward', 'Wintermere'] },
  hollow: { counts: [7, 7, 10], colors: [0xae94b6, 0x7f819d, 0xc1aed7], pace: .86, pause: 3.2,
    titles: ['Relic broker', 'Lantern watch', 'Shrine tender'], surnames: ['Duskveil', 'Ashwhisper', 'Gravecandle', 'Hollowmere'] },
  sunveil: { counts: [12, 6, 6], colors: [0xe8bd85, 0xbb9169, 0xe5d7b0], pace: 1.1, pause: 2.4,
    titles: ['Caravan trader', 'Dune outrider', 'Oasis healer'], surnames: ['Saffron', 'Dunewell', 'Sunweaver', 'Copperdawn'] },
  mistwood: { counts: [6, 7, 11], colors: [0xa4bfad, 0x6f998c, 0xc0d8c7], pace: .92, pause: 2.8,
    titles: ['Reed artisan', 'Marsh ranger', 'Grove tender'], surnames: ['Reedwhisper', 'Mistwillow', 'Bogfern', 'Mosswater'] },
};
let mountAssets: Promise<void> | undefined;
/** World previews and player mounts share one decoded Blender library. */
export function loadCityMountAssets(): Promise<void> {
  return mountAssets ??= Promise.all(['/models/mounts.glb', '/models/store-collection.glb', '/models/verdant-revenant.glb', '/models/wayfarer-stag.glb'].map(path => new GLTFLoader().loadAsync(path))).then(([base, store, revenant, referral]) => {
    setMountAssets(base.scene); setMountAssets(store.scene, ['store-embermane', 'store-cinderfang']);
    setMountAssets(revenant.scene, ['verdant-revenant']); setMountAssets(referral.scene, ['wayfarer-stag']);
  }).catch(error => {
    mountAssets = undefined; throw error;
  });
}

function walkingRoutes(city: CityLayout): Route[] {
  const routes: Route[] = [];
  const residents = [...VILLAGE_NPCS, ...TRAINER_NPCS, ...TRAINING_PRACTICE, ...CITY_SERVICE_NPCS, ...NPCS.map(npc => toWorld(npc.zone, npc))];
  const clear = (point: Point) => !waterAt(point.x, point.z) && canTraverse(point, point)
    && residents.every(npc => Math.hypot(point.x - npc.x, point.z - npc.z) >= 1.6);
  for (const road of city.roads) {
    const dx = road.x2 - road.x1, dz = road.z2 - road.z1, length = Math.hypot(dx, dz);
    if (length < 6) continue;
    const steps = Math.max(2, Math.ceil(length / 1.25));
    for (const side of [-1, 1]) {
      const offset = Math.min(1.15, road.width * .22) * side;
      let start: Point | undefined, previous: Point | undefined;
      const finish = () => {
        if (start && previous) {
          const distance = Math.hypot(previous.x - start.x, previous.z - start.z);
          if (distance >= 5) routes.push({ start, end: previous, length: distance });
        }
        start = previous = undefined;
      };
      for (let step = 1; step < steps; step++) {
        const point = { x: road.x1 + dx * step / steps - dz / length * offset, z: road.z1 + dz * step / steps + dx / length * offset };
        if (!clear(point) || previous && !canTraverse(previous, point)) { finish(); continue; }
        // Short patrols leave room for all residents when an NPC moves off a long street.
        if (start && Math.hypot(point.x-start.x,point.z-start.z)>20) { finish(); continue; }
        start ??= point; previous = point;
      }
      finish();
    }
  }
  return routes;
}

/** One disjoint patrol per citizen prevents shared endpoints and crossing body meshes.
 * Roads are straight; separated X/Z extents conservatively keep the whole paths clear. */
export function cityPatrolRoutes(city: CityLayout = CITY_LAYOUTS[0]): readonly Route[] {
  const selected: Route[] = [];
  for (const route of walkingRoutes(city)) {
    const separate = selected.every(other => Math.hypot(...(['x', 'z'] as const).map(axis => Math.max(0,
      Math.min(route.start[axis], route.end[axis]) - Math.max(other.start[axis], other.end[axis]),
      Math.min(other.start[axis], other.end[axis]) - Math.max(route.start[axis], route.end[axis]),
    ))) >= 1.6);
    if (separate) selected.push(route);
    if (selected.length === 24) return selected;
  }
  throw new Error(`${city.name} needs 24 separated citizen patrols`);
}

/** The authored villager body includes its boots. Separate their existing triangles once
 * per role so walking can bend real legs, without replacing any Blender geometry. */
function walkingTemplate(asset: THREE.Group, role: Role, owned: THREE.BufferGeometry[]) {
  const template = createVillager(asset, role);
  const body = template.getObjectByName(`village-${role}-body`) as THREE.Mesh;
  const input = body.geometry.index ? body.geometry.toNonIndexed() : body.geometry;
  const position = input.getAttribute('position');
  const pieces: number[][] = [[], [], []];
  for (let index = 0; index < position.count; index += 3) {
    const vertices = [index, index + 1, index + 2];
    const low = vertices.every(vertex => position.getY(vertex) <= .701);
    const side = low && vertices.every(vertex => position.getX(vertex) > .025) ? 1
      : low && vertices.every(vertex => position.getX(vertex) < -.025) ? 2 : 0;
    pieces[side].push(...vertices);
  }
  if (!pieces[1].length || !pieces[2].length) throw new Error(`Missing authored ${role} legs`);
  const geometries = pieces.map(indices => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(input.attributes)) {
      const values = new Float32Array(indices.length * attribute.itemSize);
      for (let vertex = 0; vertex < indices.length; vertex++) for (let component = 0; component < attribute.itemSize; component++)
        values[vertex * attribute.itemSize + component] = attribute.getComponent(indices[vertex], component);
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); owned.push(geometry); return geometry;
  });
  if (input !== body.geometry) input.dispose();
  body.geometry = geometries[0];
  for (let index = 0; index < 2; index++) {
    const x = index === 0 ? .19 : -.19, geometry = geometries[index + 1];
    geometry.translate(-x, -.69, 0);
    const leg = new THREE.Mesh(geometry, body.material); leg.name = `city-leg-${index}`; leg.position.set(x, .69, 0);
    leg.castShadow = leg.receiveShadow = true; template.add(leg);
  }
  return template;
}

export async function createCityLife(asset: THREE.Group, city: CityLayout = CITY_LAYOUTS[0]) {
  await loadCityMountAssets();
  const root = new THREE.Group(); root.name = `${city.name} townsfolk and stable animals`;
  root.userData.collision = 'actor';
  const citizens = new Map<string, WorldCitizen>();
  root.userData.cosmetic = true;
  const owned: THREE.BufferGeometry[] = [], batches: THREE.InstancedMesh[] = [];
  const routes = cityPatrolRoutes(city);
  const personality = CITY_PERSONALITIES[city.zone];
  const roles: Role[] = ['merchant', 'warden', 'healer'];
  const actors: { rig: THREE.Group; parts: THREE.Mesh[]; route: Route; speed: number; offset: number; pause: number; held: number; hidden: boolean; index: number; role: Role }[] = [];
  const actorPositions: Point[] = [];
  const roleBatches = new Map<Role, THREE.InstancedMesh[]>();
  const palette = [0xffffff, 0xe5d5ba, 0xcbdcce, 0xe7d5df, 0xd3dfed, 0xe9e4bd, 0xcdd7bc, 0xf0dfcc];
  for (const [roleIndex, role] of roles.entries()) {
    const count = personality.counts[roleIndex], first = actors.length;
    const template = walkingTemplate(asset, role, owned);
    const meshes: THREE.Mesh[] = []; template.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
    const group = meshes.map(source => {
      const batch = new THREE.InstancedMesh(source.geometry, source.material, count);
      batch.name = `City citizens ${role} ${source.name}`; batch.castShadow = batch.receiveShadow = true;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Each batch spans the city, while per-instance culling below removes distant citizens.
      batch.frustumCulled = false;
      for (let index = 0; index < count; index++) batch.setColorAt(index, source.name.endsWith('-head') ? new THREE.Color(0xffffff)
        : new THREE.Color(palette[(index + roleIndex * 2) % palette.length]).multiply(new THREE.Color(personality.colors[roleIndex])));
      root.add(batch); batches.push(batch); return batch;
    });
    roleBatches.set(role, group);
    for (let index = 0; index < count; index++) {
      const sequence = first + index, rig = createVillager(asset, role);
      const id = city.zone==='greenwood'?`city-citizen-${sequence}`:`town-${city.zone}-citizen-${sequence}`; rig.name = id; rig.userData.cosmetic = true;
      // Picking and portraits reuse the posed rig, never a second rendered character.
      citizens.set(id, { name: city.zone==='greenwood'?CITIZEN_NAMES[sequence]:`${CITIZEN_NAMES[sequence].split(' ')[0]} ${personality.surnames[sequence % personality.surnames.length]}`, title: personality.titles[roleIndex], mesh: rig });
      const body = rig.getObjectByName(`village-${role}-body`) as THREE.Mesh; body.geometry = (template.getObjectByName(`village-${role}-body`) as THREE.Mesh).geometry;
      for (let leg = 0; leg < 2; leg++) rig.add(template.getObjectByName(`city-leg-${leg}`)!.clone());
      const parts = meshes.map(source => rig.getObjectByName(source.name) as THREE.Mesh);
      actors.push({ rig, parts, route: routes[sequence], speed: (1.15 + (sequence % 5) * .085) * personality.pace * (role === 'healer' ? .9 : 1),
        offset: sequence * 4.73, pause: personality.pause + sequence % 3 * .45, held: 0, hidden: false, index, role });
      actorPositions.push({ x: 0, z: 0 });
    }
  }
  const stable = city.props.find(prop => prop.kind === 'city-stable');
  const mounts: THREE.Group[] = [];
  if (stable) for (let index = 0; index < 3; index++) {
    const mount = makeMount(index === 2 ? 'wolf' : 'horse'), point = buildingPoint(stable, [-5.15, 0, 5.15][index], -1.5);
    mount.name = `Stable ${index === 2 ? 'wolf' : 'horse'} ${index + 1}`; mount.userData.cosmetic = true;
    mount.position.set(point.x, buildingFloorHeight(point.x, point.z), point.z); mount.rotation.y = stable.rotation;
    root.add(mount); mounts.push(mount);
  }
  root.userData.population = actors.length; root.userData.stableAnimals = mounts.length; root.userData.actorPositions = actorPositions;
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  let disposed = false, lastTime = -Infinity;
  function update(time: number, observer?: Point) {
    if (disposed || !Number.isFinite(time) || time - lastTime >= 0 && time - lastTime < 1 / 30) return;
    const dt = Number.isFinite(lastTime) ? Math.max(0, Math.min(.15, time - lastTime)) : 0; lastTime = time;
    const nearCity = !observer || Math.hypot(observer.x - city.x, observer.z - city.z) < 190;
    root.visible = nearCity;
    if (!nearCity) { actors.forEach(actor => { actor.rig.visible = false; }); return; }
    let visibleCitizens = 0;
    for (let number = 0; number < actors.length; number++) {
      const actor = actors[number], { route, speed, pause } = actor, travel = route.length / speed, period = 2 * (travel + pause);
      const phase = ((time + actor.offset - actor.held) % period + period) % period;
      const forward = phase < travel + pause;
      const fraction = forward ? Math.min(1, phase / travel) : Math.max(0, 1 - (phase - travel - pause) / travel);
      const x = route.start.x + (route.end.x - route.start.x) * fraction, z = route.start.z + (route.end.z - route.start.z) * fraction;
      const moving = forward ? phase < travel : phase < 2 * travel + pause;
      const blocked = observer && Math.hypot(x - observer.x, z - observer.z) < 1.5;
      if (blocked) actor.held += dt;
      else { actor.rig.position.set(x, buildingFloorHeight(x, z), z); actorPositions[number].x = x; actorPositions[number].z = z; }
      const visible = !observer || Math.hypot(actor.rig.position.x - observer.x, actor.rig.position.z - observer.z) < 85;
      actor.rig.visible = visible;
      const group = roleBatches.get(actor.role)!;
      if (!visible) {
        if (!actor.hidden) group.forEach(batch => batch.setMatrixAt(actor.index, hiddenMatrix));
        actor.hidden = true; continue;
      }
      actor.hidden = false; visibleCitizens++;
      const walking = moving && !blocked;
      const facing = Math.atan2(route.end.x - route.start.x, route.end.z - route.start.z) + (forward ? 0 : Math.PI);
      animateVillager(actor.rig, time + actor.offset, facing);
      const stride = walking ? Math.sin((time + actor.offset) * speed * 5) : 0;
      actor.rig.getObjectByName('city-leg-0')!.rotation.x = stride * .43;
      actor.rig.getObjectByName('city-leg-1')!.rotation.x = -stride * .43;
      actor.rig.getObjectByName(`village-${actor.role}-left-arm`)!.rotation.x += -stride * .27;
      actor.rig.getObjectByName(`village-${actor.role}-right-arm`)!.rotation.x += stride * .27;
      if (!moving) {
        const resting = forward ? phase - travel : phase - 2 * travel - pause;
        const gesture = Math.sin(Math.PI * resting / pause);
        actor.rig.getObjectByName(`village-${actor.role}-head`)!.rotation.y += Math.sin(resting * 1.7) * gesture * .3;
        if (actor.role === 'merchant') actor.rig.getObjectByName('village-merchant-right-arm')!.rotation.x -= gesture * .85;
        if (actor.role === 'healer') actor.rig.getObjectByName('village-healer-left-arm')!.rotation.x -= gesture * .4;
        if (actor.role === 'warden') actor.rig.rotation.y += Math.sin(resting * 1.3) * gesture * .3;
      }
      actor.rig.position.y = buildingFloorHeight(actor.rig.position.x, actor.rig.position.z) + (walking ? .055 + Math.abs(stride) * .035 : 0);
      actor.rig.updateMatrixWorld(true);
      actor.parts.forEach((part, index) => group[index].setMatrixAt(actor.index, part.matrixWorld));
    }
    batches.forEach(batch => { batch.instanceMatrix.needsUpdate = true; batch.visible = visibleCitizens > 0; });
    mounts.forEach((mount, index) => {
      mount.visible = !observer || Math.hypot(mount.position.x - observer.x, mount.position.z - observer.z) < 85;
      if (mount.visible) animateMount(mount, time + index * 3.7, false);
    });
    root.userData.visibleCitizens = visibleCitizens;
  }
  function dispose() {
    if (disposed) return; disposed = true;
    mounts.forEach(disposeMount); batches.forEach(batch => batch.dispose()); owned.forEach(geometry => geometry.dispose());
    actors.forEach(actor => { actor.rig.visible = false; actor.rig.clear(); }); citizens.clear();
    root.removeFromParent(); root.clear();
  }
  update(0);
  return { root, citizens, update, dispose };
}
