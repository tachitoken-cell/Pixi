import { WILD_BIOMES, RESOURCE_SITES, RESOURCE_SITE_WALLS, WORLD_CURIOS, wildBiomeAt } from './world-features.ts';
import { loadTreasureAssets } from './treasure-visuals.ts';
import * as THREE from 'three';
import { VILLAGES, VILLAGE_PROPS, VILLAGE_NPCS, SHADY_MERCHANT, villageFootprint, villagePropHeight } from './settlements.ts';
import { DEED_AUCTIONEER, insideAnyCity, CITY_RADIUS, CITY_LAYOUTS } from './city.ts';
import { POLL_BOOTHS } from './poll-booths.ts';
import { AUCTIONEERS, BANKERS } from './city-services.ts';
import { createCityModels } from './city-models.ts';
import { createCityLife } from './city-life.ts';
import { GOLD_CARAVAN, GOLD_MERCHANT } from './gold-merchant.ts';
import { HEARTHLING_NPC } from './hearthling.ts';
import { createTrainingGrounds } from './training-grounds.ts';
import { COLOSSEUM } from './colosseum.ts';
import { loadCharacterAssets } from './characters.ts';
import { BUILDINGS, buildingPoint, BUILDING_RAMP_LENGTH, buildingFloorHeight } from './buildings.ts';
import { TRAINER_NPCS } from './training.ts';
import { createVillageProps, createVillager } from './village-models.ts';
import { createBuildingModels } from './building-models.ts';
import { createSwimEffects } from './water-effects.ts';
import { createEnvironmentLights, discoverEnvironmentEmitters, updateEffectTexture, type EnvironmentEmitter } from './environment-lights.ts';
import { graphics } from './graphics-settings.ts';
import { setResourceTreeAssets, loadGatheringAssets, loadWorldFeatureAssets, makeWorkshop } from './resources.ts';
import { createWorld, disposeWorldGroup, type WorldCollider, type WorldInstance } from './world.ts';
import { ZONES } from './content.ts';
import { findPath } from './navigation.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { REGION_ORIGINS, WORLD_SCENERY, WORLD_COLLIDERS } from './realm.ts';
import { ROOTVAULT_ENTRANCE, getDungeon, dungeonThemeId, dungeonLayout, dungeonStages, dungeonPreparation, dungeonReturn, type DungeonId, dungeonBounds, dungeonGateOpen, dungeonColliders, type DungeonRoom } from './dungeon.ts';
import { createDungeonApproaches, createDungeonPortalEffect, createDungeonThemeDecor } from './dungeon-portals.ts';
import type { DungeonHazard } from './shared.ts';
import { themedDungeonArt, createThemedDungeonAmbience, createDungeonSpikes, createDungeonRoomPortals } from './themed-dungeon-art.ts';
import { createDungeonRoomVisibility } from './dungeon-room-visibility.ts';
import { WORLD_BOUNDS as LANDSCAPE_BOUNDS, TERRAIN_STEP, WATER_LEVEL, EXPEDITIONS, inCore, surfaceAt, waterAt, groundHeight } from './landscape.ts';

type Voxel = [number, number, number, number, number, number, number, number];

function staticBatch(parent: THREE.Group, voxels: Voxel[], geometry: THREE.BufferGeometry, material: THREE.Material, name: string, shadow = true, source?: THREE.Matrix4) {
  const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);
  const transform = new THREE.Object3D(), color = new THREE.Color();
  mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = shadow;
  for (let i = 0; i < voxels.length; i++) {
    const [x, y, z, w, h, d, tint, turn] = voxels[i];
    transform.position.set(x, y, z); transform.scale.set(w, h, d); transform.rotation.set(0, turn, 0); transform.updateMatrix();
    if (source) transform.matrix.multiply(source);
    mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, color.setHex(tint));
  }
  mesh.computeBoundingBox(); mesh.computeBoundingSphere(); parent.add(mesh);
  return mesh;
}

interface LandscapeChunk {
  group: THREE.Group; x: number; z: number; voxels: Voxel[]; terrain: Voxel[]; lights: Voxel[]; water: Voxel[]; trees: Map<string, Voxel[]>;
}

/** The surface grid is shared by rendering, swimming and authoritative movement. */
function expandedLandscape(scene: THREE.Scene, root: THREE.Group, geometry: THREE.BoxGeometry, stone: THREE.Material, glow: THREE.Material) {
  const chunks = new Map<string, LandscapeChunk>(), chunkSize = 96;
  const canopies: {mesh:THREE.InstancedMesh;bounds:THREE.Box3}[] = [], nearCanopies: THREE.InstancedMesh[] = [];
  const canopyRay = new THREE.Raycaster(), canopyDirection = new THREE.Vector3();
  const chunkAt = (x: number, z: number) => {
    const col = Math.floor((x - LANDSCAPE_BOUNDS.minX) / chunkSize), row = Math.floor((z - LANDSCAPE_BOUNDS.minZ) / chunkSize), key = `${col},${row}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      const group = new THREE.Group(), originX = LANDSCAPE_BOUNDS.minX + col * chunkSize, originZ = LANDSCAPE_BOUNDS.minZ + row * chunkSize;
      group.name = `Landscape: ${col},${row}`; group.position.set(originX, 0, originZ); root.add(group);
      group.userData.landscapeChunk = { x: originX, z: originZ, size: chunkSize };
      chunk = { group, x: originX, z: originZ, voxels: [], terrain: [], lights: [], water: [], trees: new Map() }; chunks.set(key, chunk);
    }
    return chunk;
  };
  const waterGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const waterMaterial = new THREE.MeshStandardMaterial({ roughness: .25, metalness: .04, transparent: true, opacity: .94, depthWrite: true });
  // A shared distance field keeps shallow colour and foam continuous across instance/chunk seams.
  const shoreColumns = (LANDSCAPE_BOUNDS.maxX - LANDSCAPE_BOUNDS.minX) / TERRAIN_STEP;
  const shoreRows = (LANDSCAPE_BOUNDS.maxZ - LANDSCAPE_BOUNDS.minZ) / TERRAIN_STEP;
  const shoreDistance = new Float32Array(shoreColumns * shoreRows);
  for (let row = 0; row < shoreRows; row++) for (let col = 0; col < shoreColumns; col++)
    shoreDistance[row * shoreColumns + col] = waterAt(LANDSCAPE_BOUNDS.minX + (col + .5) * TERRAIN_STEP, LANDSCAPE_BOUNDS.minZ + (row + .5) * TERRAIN_STEP) ? 32 : 0;
  for (const step of [1, -1]) for (let row = step > 0 ? 0 : shoreRows - 1; row >= 0 && row < shoreRows; row += step) for (let col = step > 0 ? 0 : shoreColumns - 1; col >= 0 && col < shoreColumns; col += step) {
    const index = row * shoreColumns + col;
    for (const [dx, dz] of [[-step, 0], [0, -step], [-step, -step], [step, -step]]) {
      const x = col + dx, z = row + dz;
      if (x >= 0 && x < shoreColumns && z >= 0 && z < shoreRows)
        shoreDistance[index] = Math.min(shoreDistance[index], shoreDistance[z * shoreColumns + x] + TERRAIN_STEP * (dx && dz ? Math.SQRT2 : 1));
    }
  }
  const shorePixels = Uint8Array.from(shoreDistance, distance => Math.round(distance / 32 * 255));
  const shoreTexture = new THREE.DataTexture(shorePixels, shoreColumns, shoreRows, THREE.RedFormat);
  shoreTexture.name = 'Mossvale shoreline distance'; shoreTexture.minFilter = shoreTexture.magFilter = THREE.LinearFilter;
  shoreTexture.generateMipmaps = false; shoreTexture.needsUpdate = true;
  waterMaterial.addEventListener('dispose', () => shoreTexture.dispose());
  const waterClock = { value: 0 };
  const waterDaylight = { value: 1 }, waterSky = { value: new THREE.Color('#cce4dd') };
  waterMaterial.onBeforeCompile = shader => {
    shader.uniforms.mossvaleWaterTime = waterClock;
    shader.uniforms.mossvaleWaterDaylight = waterDaylight;
    shader.uniforms.mossvaleWaterSky = waterSky;
    shader.uniforms.mossvaleWaterShore = { value: shoreTexture };
    shader.uniforms.mossvaleWaterBounds = { value: new THREE.Vector4(LANDSCAPE_BOUNDS.minX, LANDSCAPE_BOUNDS.minZ, 1 / (shoreColumns * TERRAIN_STEP), 1 / (shoreRows * TERRAIN_STEP)) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 mossvaleWaterPosition;');
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 mossvaleWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mossvaleWorld = instanceMatrix * mossvaleWorld;
      #endif
      mossvaleWaterPosition = (modelMatrix * mossvaleWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform float mossvaleWaterTime;
      uniform float mossvaleWaterDaylight;
      uniform vec3 mossvaleWaterSky;
      uniform sampler2D mossvaleWaterShore;
      uniform vec4 mossvaleWaterBounds;
      varying vec3 mossvaleWaterPosition;
      float mossvaleWaterNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        vec4 h = fract(sin(vec4(dot(cell, vec2(127.1, 311.7)), dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7)), dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7)), dot(cell + 1.0, vec2(127.1, 311.7)))) * 43758.5453);
        return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 waterXZ = mossvaleWaterPosition.xz;
      float waterTime = mossvaleWaterTime;
      float shore = max(0.0, texture2D(mossvaleWaterShore, (waterXZ - mossvaleWaterBounds.xy) * mossvaleWaterBounds.zw).r * 32.0 - 2.0);
      float depthBlend = smoothstep(0.0, 22.0, shore);
      float swell = dot(waterXZ, vec2(.72, .38)) + waterTime * .88;
      float crossWave = dot(waterXZ, vec2(-.42, 1.14)) - waterTime * 1.1;
      float ripple = dot(waterXZ, vec2(2.3, 1.8)) + waterTime * 1.46;
      vec2 slope = vec2(.72, .38) * cos(swell) * .11 + vec2(-.42, 1.14) * cos(crossWave) * .07 + vec2(2.3, 1.8) * cos(ripple) * .023;
      vec3 waterNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
      vec3 waterView = normalize(cameraPosition - mossvaleWaterPosition);
      float waterFresnel = .025 + .975 * pow(1.0 - max(dot(waterNormal, waterView), 0.0), 4.0);
      float foamGrain = mossvaleWaterNoise(waterXZ * 2.1 + vec2(waterTime * .20, -waterTime * .12));
      float foamLine = abs(shore - (.32 + .28 * sin(waterTime * .9 + foamGrain * 3.2)));
      float waterFoam = (1.0 - smoothstep(.08, .40, foamLine)) * smoothstep(.28, .67, foamGrain);
      waterFoam += (1.0 - smoothstep(.10, 1.25, shore)) * smoothstep(.40, .75, foamGrain) * .25;
      waterFoam = clamp(waterFoam, 0.0, 1.0);
      float caustic = pow(max(0.0, sin(swell * 2.0 + sin(crossWave)) * cos(crossWave * 1.6)), 6.0) * (1.0 - depthBlend);
      diffuseColor.rgb = mix(vec3(.045, .34, .30), diffuseColor.rgb * .76, depthBlend);
      diffuseColor.rgb *= .93 + .045 * sin(swell) + .025 * sin(crossWave);
      diffuseColor.rgb += vec3(.06, .12, .10) * caustic;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.65, .82, .75), waterFoam * .78);
      diffuseColor.a = mix(.80, .96, depthBlend) + waterFoam * .04;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize((viewMatrix * vec4(waterNormal, 0.0)).xyz);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(.23, .70, waterFoam);`);
    if (graphics.reflections) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 waterReflection = reflect(-waterView, waterNormal);
      vec3 waterSky = mix(mossvaleWaterSky * vec3(.075, .155, .25), mossvaleWaterSky * vec3(.40, .62, .80), smoothstep(-.05, .85, waterReflection.y));
      waterSky = max(waterSky * mix(.30, 1.0, mossvaleWaterDaylight), vec3(.002, .004, .009) * (1.0 - mossvaleWaterDaylight));
      vec3 waterGlint = vec3(0.0);
      #if NUM_DIR_LIGHTS > 0
        vec3 waterLightDirection = inverseTransformDirection(directionalLights[0].direction, viewMatrix);
        float waterLightStrength = max(max(directionalLights[0].color.r, directionalLights[0].color.g), directionalLights[0].color.b);
        vec3 waterLightTint = directionalLights[0].color / max(waterLightStrength, .00001);
        float skyGlint = pow(max(dot(waterReflection, waterLightDirection), 0.0), 80.0);
        waterGlint = waterLightTint * skyGlint * min(waterLightStrength * .14, .50);
      #endif
      totalEmissiveRadiance += (waterSky * (.05 + waterFresnel * .48) + waterGlint) * (1.0 - waterFoam);`);
  };
  let reflections = graphics.reflections;
  waterMaterial.customProgramCacheKey = () => `mossvale-water-shore-waves-v4-${graphics.reflections}`;
  const floorPalette = {
    greenwood: [0x73a14f, 0x79a957, 0x6c9a49], amberwild: [0x999649, 0xa39e51, 0x8f8e45],
    frostmarch: [0xd1e0e4, 0xdde9ea, 0xc3d7dd], hollow: [0x564562, 0x604d6b, 0x4c3e58],
    sunveil: [0xcfa667,0xd9b16f,0xc49a5e], mistwood: [0x416f42,0x497c49,0x38653e],
  };
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let x = LANDSCAPE_BOUNDS.minX + TERRAIN_STEP / 2; x < LANDSCAPE_BOUNDS.maxX; x += TERRAIN_STEP) for (let z = LANDSCAPE_BOUNDS.minZ + TERRAIN_STEP / 2; z < LANDSCAPE_BOUNDS.maxZ; z += TERRAIN_STEP) {
    if (inCore(x, z)) continue;
    const surface = surfaceAt(x, z), chunk = chunkAt(x, z), lx = x - chunk.x, lz = z - chunk.z;
    const index = Math.abs(Math.round(x / TERRAIN_STEP) * 13 + Math.round(z / TERRAIN_STEP) * 7) % 3;
    const beach = surface.zone === 'frostmarch' ? 0xb3c2bd : surface.zone === 'hollow' ? 0xa3929f : 0xd0bd88;
    if (!surface.water) {
      const mountain = surface.height > 56, snow = surface.height > 69 && surface.zone !== 'sunveil' && surface.zone !== 'mistwood';
      const biome = wildBiomeAt(x, z);
      const tint = biome ? biome.floor[index] : surface.beach ? beach : snow ? [0xd5e2de, 0xe4ece6, 0xc8d8d4][index] : mountain ? (surface.zone === 'sunveil' ? [0xb68354,0xc89662,0xa9794f] : surface.zone === 'mistwood' ? [0x617454,0x6e8160,0x536949] : [0x84908a, 0x939e94, 0x76867e])[index] : floorPalette[surface.zone][index];
      chunk.terrain.push([lx, (surface.height - 3) / 2, lz, TERRAIN_STEP, surface.height + 3, TERRAIN_STEP, tint, 0]);
      if (surface.beach) for (const [dx, dz] of directions) if (waterAt(x + dx * TERRAIN_STEP, z + dz * TERRAIN_STEP)) {
        // Layered voxel banks stay inside the land cell, retaining the exact shared coastline.
        for (const [y, height, shade] of [[-.23, .18, 0x9b9376], [-.62, .14, 0x7f8371]])
          chunk.terrain.push([lx + dx * 1.95, y, lz + dz * 1.95, dx ? .09 : TERRAIN_STEP, height, dz ? .09 : TERRAIN_STEP, shade, 0]);
      }
    } else {
      chunk.terrain.push([lx, -3.15, lz, TERRAIN_STEP, .30, TERRAIN_STEP, index ? 0x375f6e : 0x416c78, 0]);
      const tint = surface.zone === 'frostmarch' ? 0x237796 : surface.zone === 'hollow' ? 0x265881 : 0x15688d;
      chunk.water.push([lx, WATER_LEVEL, lz, TERRAIN_STEP, 1, TERRAIN_STEP, tint, 0]);
    }
  }
  // Blender models share the same chunk batching, culling and wall envelopes as terrain.
  const feature = (name: string, x: number, z: number, scale: [number,number,number] = [1,1,1], turn = 0, y = 0) => {
    const chunk=chunkAt(x,z), key=`feedback-${name}`, list=chunk.trees.get(key) || [];
    list.push([x-chunk.x,groundHeight(x,z)+y,z-chunk.z,...scale,0xffffff,turn]);chunk.trees.set(key,list);
  };
  for(const wall of RESOURCE_SITE_WALLS) {
    const alongX=wall.halfWidth>wall.halfDepth, length=Math.max(wall.halfWidth,wall.halfDepth)*2, count=Math.ceil(length/4), span=length/count;
    for(let i=0;i<count;i++) {
      const offset=-length/2+(i+.5)*span;
      feature('site-wall',wall.x+(alongX?offset:0),wall.z+(alongX?0:offset),[span/4,wall.height/4,1],alongX?0:Math.PI/2);
    }
  }
  for(const site of RESOURCE_SITES) {
    feature('site-sign',site.x,site.z+15);
    if(site.kind==='mine'||site.kind==='cave') {
      for(const dz of [-8,0,8])feature('mine-frame',site.x,site.z+dz);
      if(site.kind==='cave')feature('cave-roof',site.x,site.z-9,[1,1,1],0,7);
      else for(let dz=-10;dz<=10;dz+=4)feature('mine-track',site.x,site.z+dz);
    }
    if(site.kind==='garden'||site.kind==='farm')for(const dx of [-4,4])for(let dz=-9;dz<=9;dz+=3) {
      const x=site.x+dx,z=site.z+dz,chunk=chunkAt(x,z);
      chunk.voxels.push([x-chunk.x,groundHeight(x,z)+.025,z-chunk.z,3,.05,2.8,0x69503c,0]);
    }
  }
  for(const biome of WILD_BIOMES)for(let i=0;i<40;i++) {
    const angle=i*2.4,r=i<8?7+(i%2)*6:20+(i%6)*10,x=biome.x+Math.cos(angle)*r,z=biome.z+Math.sin(angle)*r;
    if(!waterAt(x,z))feature(biome.id==='slimefen'?'slime-pool':'sugar-cane',x,z,biome.id==='slimefen'?[1.6,1,1.6]:[1,1,1],angle);
  }
  for(const curio of WORLD_CURIOS)feature(curio.id==='curio-last-campfire'?'campfire':'companion-crate',curio.x,curio.z);
  // Every new landmass has a small worn camp circle between its landmark pillars.
  for (const camp of EXPEDITIONS) for (let dx = -6; dx <= 6; dx += 1.5) for (let dz = -6; dz <= 6; dz += 1.5) {
    const radius = Math.hypot(dx, dz); if (radius > 6.1) continue;
    const x = camp.x + dx, z = camp.z + dz, chunk = chunkAt(x, z);
    if (waterAt(x, z)) continue;
    chunk.voxels.push([x - chunk.x, groundHeight(x, z) + .016, z - chunk.z, 1.42, .032, 1.42, camp.zone === 'frostmarch' ? 0xabc6cf : camp.zone === 'hollow' ? 0x927b9c : 0xc0ae80, 0]);
    if (radius > 4.5 && radius < 5.5) chunk.lights.push([x - chunk.x, groundHeight(x, z) + .044, z - chunk.z, .12, .05, .12, 0xe6d2a1, 0]);
  }
  return {
    chunkAt,
    async buildTrees(frontier: THREE.Group) {
      const [{scene:asset}, feedback] = await Promise.all([new GLTFLoader().loadAsync('/models/giant-trees.glb'),loadWorldFeatureAssets()]);
      setResourceTreeAssets(asset); frontier.updateMatrixWorld(true); feedback.updateMatrixWorld(true);
      const names = new Set([...chunks.values()].flatMap(chunk=>[...chunk.trees.keys()]));
      for (const name of names) {
        const imported = name.startsWith('frontier-') || name.startsWith('feedback-'), model = (name.startsWith('feedback-') ? feedback : imported ? frontier : asset).getObjectByName(name);
        if (!model) throw new Error(`Missing forest model: ${name}`);
        const parts: {geometry:THREE.BufferGeometry;material:THREE.Material;matrix?:THREE.Matrix4;collision?:string}[] = [];
        const inverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
        model.traverse(object=>{
          if (!(object instanceof THREE.Mesh)) return;
          // Keep quantized positions in their native [-1,1] range; apply metre scaling in each instance matrix.
          parts.push({geometry:name.startsWith('feedback-')?object.geometry.clone():object.geometry,material:name.startsWith('feedback-')?(object.material as THREE.Material).clone():object.material as THREE.Material,matrix:imported?new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld):undefined,collision:object.userData.collision});
        });
        for (const chunk of chunks.values()) {
          const cells = new Map<string, Voxel[]>();
          for (const placement of chunk.trees.get(name) || []) {
            const key = `${Math.floor(placement[0] / 96)},${Math.floor(placement[2] / 96)}`;
            const cell = cells.get(key) || []; cell.push(placement); cells.set(key, cell);
          }
          for (const cell of cells.values()) for (const part of parts) {
            const mesh=staticBatch(chunk.group,cell,part.geometry,part.material,`Landscape: ${name}`,true,part.matrix);
            if(part.collision)mesh.userData.collision=part.collision;
            if(name==='feedback-slime-pool')mesh.userData.collision='water';
            if(name==='feedback-slime-mushroom'||name==='feedback-candy-tree') {mesh.updateWorldMatrix(true,false);canopies.push({mesh,bounds:mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)});}
          }
        }
      }
    },
    constrainCamera(target: THREE.Vector3, desired: THREE.Vector3) {
      if(!WILD_BIOMES.some(biome=>Math.hypot(target.x-biome.x,target.z-biome.z)<biome.radius+40))return;
      const distance=canopyDirection.subVectors(desired,target).length();if(distance<.001)return;
      canopyRay.set(target,canopyDirection.divideScalar(distance));canopyRay.near=.1;canopyRay.far=distance;
      nearCanopies.length=0;
      for(const canopy of canopies)if(canopyRay.ray.intersectsBox(canopy.bounds))nearCanopies.push(canopy.mesh);
      const hit=canopyRay.intersectObjects(nearCanopies,false)[0];
      if(hit)desired.copy(target).addScaledVector(canopyDirection,Math.max(.1,hit.distance-.45));
    },
    build() {
      for (const chunk of chunks.values()) {
        staticBatch(chunk.group, chunk.terrain, geometry, stone, 'Landscape: terrain').userData.collision = 'terrain';
        staticBatch(chunk.group, chunk.voxels, geometry, stone, 'Landscape: terrain and scenery');
        if (chunk.lights.length) staticBatch(chunk.group, chunk.lights, geometry, glow, 'Landscape: camp and woodland glow', false).userData.collision = 'effect';
        if (chunk.water.length) {
          const mesh = staticBatch(chunk.group, chunk.water, waterGeometry, waterMaterial, 'Landscape: ocean surface', false); mesh.receiveShadow = true; mesh.userData.water = true; mesh.userData.collision = 'water';
        }
      }
    },
    update(time: number, daylight = 1, observer?: THREE.Vector3) {
      if (reflections !== graphics.reflections) { reflections = graphics.reflections; waterMaterial.needsUpdate = true; }
      updateEffectTexture(shoreTexture, shorePixels, shoreColumns, shoreRows);
      for (const chunk of chunks.values()) {
        const dx = observer ? Math.max(chunk.x - observer.x, 0, observer.x - chunk.x - chunkSize) : 0;
        const dz = observer ? Math.max(chunk.z - observer.z, 0, observer.z - chunk.z - chunkSize) : 0;
        chunk.group.visible = dx * dx + dz * dz <= (graphics.renderDistance + 32) ** 2;
      }
      if (Number.isFinite(time)) waterClock.value = time;
      waterDaylight.value = Number.isFinite(daylight) ? THREE.MathUtils.clamp(daylight, 0, 1) : 1;
      const sky = scene.background;
      if (sky instanceof THREE.Color && Number.isFinite(sky.r) && Number.isFinite(sky.g) && Number.isFinite(sky.b)) waterSky.value.copy(sky);
    },
  };
}

/** Towns and wilderness use the same deterministic solids the server validates. */
export async function createOverworld(scene: THREE.Scene): Promise<WorldInstance> {
  await loadGatheringAssets();
  const [frontierAsset, beaconAsset, townBiomes] = await Promise.all(['/models/frontier-biomes.glb', '/models/beacon-kit.glb', '/models/town-biomes.glb'].map(url => new GLTFLoader().loadAsync(url)));
  const root = new THREE.Group(); root.name = 'Mossvale open world'; root.userData.collision = 'solid';
  const frontier = frontierAsset.scene;
  const emitters: EnvironmentEmitter[] = [];
  const geometry = new THREE.BoxGeometry(1, 1, 1), stoneMaterial = new THREE.MeshStandardMaterial({ roughness: .91 });
  const glowMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  const beacons = new Map<string, THREE.Mesh>();
  const boards = new Map<string, THREE.Object3D>();
  const pollBooths = new Map<string, THREE.Object3D>();
  const beaconGlowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const landscape = expandedLandscape(scene, root, geometry, stoneMaterial, glowMaterial);
  const campPillars: TemplePlacement[] = [];
  for (const zone of ZONES) {
    const origin = REGION_ORIGINS[zone.id], group = new THREE.Group();
    group.name = `Region: ${zone.id}`; group.position.set(origin.x, groundHeight(origin.x, origin.z), origin.z); root.add(group);
    const green = zone.id === 'greenwood', amber = zone.id === 'amberwild', frost = zone.id === 'frostmarch', desert = zone.id === 'sunveil', jungle = zone.id === 'mistwood';
    const floor = green ? [0x77a651, 0x70a04d, 0x7cab57] : amber ? [0x929b50, 0x89924a, 0x9ca257] : frost ? [0xd7e5e5, 0xcddfe3, 0xdeebe9] : desert ? [0xcfa667,0xd9b16f,0xc49a5e] : jungle ? [0x416f42,0x497c49,0x38653e] : [0x50445f, 0x594a66, 0x493d57];
    const path = green ? 0xcdbc94 : amber ? 0xbcaa80 : frost ? 0xb8ccd3 : desert ? 0xe3c48e : jungle ? 0x9c9670 : 0x94809a;
    const rock = green ? 0x999f82 : amber ? 0xa49d81 : frost ? 0x91a9b7 : desert ? 0xb98554 : jungle ? 0x697c56 : 0x6c597b;
    const light = green ? 0xffd790 : amber ? 0xffcd68 : frost ? 0xa9eafa : desert ? 0xffd085 : jungle ? 0xb4e9ac : 0xd1a5f0;
    const voxels: Voxel[] = [], glows: Voxel[] = [];
    let currentVoxels = voxels, currentGlows = glows, offsetX = 0, offsetY = 0, offsetZ = 0;
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, turn = 0) => currentVoxels.push([x + offsetX, y + offsetY, z + offsetZ, w, h, d, color, turn]);
    const glow = (x: number, y: number, z: number, w: number, h: number, d: number, color = light, fire = false) => {
      currentGlows.push([x + offsetX, y + offsetY, z + offsetZ, w, h, d, color, 0]);
      if ((h >= .2 || fire) && w <= 1.2 && d <= 1.2) emitters.push({position:new THREE.Vector3(origin.x+x,(currentVoxels===voxels?group.position.y:offsetY)+y,origin.z+z),color,fire,size:fire?undefined:new THREE.Vector3(w,h,d),scale:fire?.55:.65});
    };
    // Every full-size town meets the generated landscape at ±84 m.
    const floorRadius = CITY_RADIUS + 3, floorTiles = floorRadius / 2;
    for (let i = 0; i < floorTiles; i++) for (let j = 0; j < floorTiles; j++) box(-floorRadius + 2 + i * 4, -.18, -floorRadius + 2 + j * 4, 4, .36, 4, floor[(i * 13 + j * 7) % floor.length]);
    staticBatch(group, voxels.splice(0), geometry, stoneMaterial, `${zone.id}: terrain`).userData.collision = 'terrain';
    for (const solid of WORLD_SCENERY) {
      if (solid.zone !== zone.id) continue;
      if (inCore(solid.x, solid.z)) { currentVoxels = voxels; currentGlows = glows; offsetX = offsetY = offsetZ = 0; }
      else { const chunk = landscape.chunkAt(solid.x, solid.z); currentVoxels = chunk.voxels; currentGlows = chunk.lights; offsetX = origin.x - chunk.x; offsetY = groundHeight(solid.x, solid.z); offsetZ = origin.z - chunk.z; }
      const x = solid.x - origin.x, z = solid.z - origin.z, s = solid.scale, h = solid.height;
      if (solid.kind === 'tree') {
        const biome = wildBiomeAt(solid.x, solid.z);
        const name = biome ? (biome.id==='slimefen'?'feedback-slime-mushroom':'feedback-candy-tree') : solid.treeModel || (frost ? 'WoodlandPine' : 'WoodlandOak');
        const chunk = landscape.chunkAt(solid.x, solid.z), trees = chunk.trees.get(name) || [];
        const tint = frost ? 0xa1c7cb : amber ? 0xf2bd68 : green || desert || jungle ? 0xffffff : 0xaa92c9;
        trees.push([solid.x - chunk.x, groundHeight(solid.x, solid.z), solid.z - chunk.z, s, s, s, tint, (solid.x * .7 + solid.z * .3) % (Math.PI * 2)]);
        chunk.trees.set(name, trees);
      } else if (solid.kind === 'rock') {
        box(x, .32 * s, z, 1.1 * s, .64 * s, 1.0 * s, rock);
        box(x - .09 * s, .73 * s, z, .76 * s, .18 * s, .73 * s, frost ? 0xe0eded : desert ? 0xd6b57c : jungle ? 0x89a06e : green || amber ? 0x9d9f68 : 0x8e74a0);
      } else if (solid.kind === 'house') {
        // The Blender shell and shared wall colliders replace the old solid house.
        continue;
      } else if (solid.kind === 'pillar') {
        if (zone.id === 'hollow' && Math.abs(solid.z-ROOTVAULT_ENTRANCE.z)<.01 && Math.abs(Math.abs(solid.x-ROOTVAULT_ENTRANCE.x)-4)<.01) continue;
        if (!inCore(solid.x, solid.z)) {
          campPillars.push({ x: solid.x, y: groundHeight(solid.x, solid.z), z: solid.z, scale: [(solid.halfWidth ?? solid.r / Math.SQRT2) / .8, h / 4.535, (solid.halfDepth ?? solid.r / Math.SQRT2) / .9], tint: frost ? 0xc5edff : amber || desert ? 0xffdfae : green || jungle ? 0xffffff : 0xe2c4ff });
          continue;
        }
        if (zone.id === 'hollow' && Math.abs(solid.z-ROOTVAULT_ENTRANCE.z)<.01 && Math.abs(Math.abs(solid.x-ROOTVAULT_ENTRANCE.x)-4)<.01) continue;
        const w = solid.halfWidth ? solid.halfWidth * 2 : solid.r * 1.30, d = solid.halfDepth ? solid.halfDepth * 2 : solid.r * 1.30;
        for (let tier = 0; tier < Math.ceil(h / .6); tier++) box(x, .30 + tier * .6, z, w, .57, d, tier % 2 ? rock : new THREE.Color(rock).multiplyScalar(1.10).getHex());
        box(x, h + .15, z, w + .25, .30, d + .25, frost ? 0xc3d6d7 : rock);
        if (!green && !amber) glow(x, h * .60, z + d / 2 + .025, .15, .90, .045);
      } else if (solid.kind === 'board') {
        const first = currentVoxels.length;
        for (const dx of [-.61, .61]) box(x + dx, 1.02, z, .15, 2.04, .18, 0x795d3f);
        box(x, 1.48, z, 1.72, 1.12, .16, 0x735238);
        box(x, 2.16, z, 2.0, .19, .48, 0x9f7c47);
        for (let i = 0; i < 3; i++) {
          box(x - .54 + i * .54, 1.48 + (i % 2) * .08, z + .10, .42, .65, .045, 0xe1c98c);
          box(x - .54 + i * .54, 1.70 + (i % 2) * .08, z + .13, .065, .065, .045, 0xb48046);
        }
        glow(x, 2.36, z, .17, .24, .17);
        boards.set(`board-${zone.id}`, staticBatch(group, currentVoxels.splice(first), geometry, stoneMaterial, `${zone.id}: quest board`));
      } else if (solid.kind === 'workshop') {
        const workshop = makeWorkshop(zone.id);
        workshop.position.set(x, 0, z); group.add(workshop);
      }
    }
    currentVoxels = voxels; currentGlows = glows; offsetX = offsetY = offsetZ = 0;
    let seed = (ZONES.indexOf(zone) + 1) * 7391;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const foliageStart = voxels.length;
    for (let i = 0; i < 330; i++) {
      const x = random() * 90 - 45, z = random() * 90 - 45;
      if (insideAnyCity(origin.x+x,origin.z+z)) continue;
      if (Math.abs(x) < 3.3 || Math.abs(z) < 3.3 || Math.hypot(x, z) < 6) continue;
      const h = .11 + random() * .22;
      box(x, h / 2, z, frost ? .23 : .065, h, frost ? .23 : .065, frost ? 0xe7f2ef : desert ? 0xb39e59 : jungle ? 0x66a44f : green || amber ? 0x9cac61 : 0x9b83a9);
      if (i % 4 === 0) box(x, h + .05, z, .16, .10, .16, green ? 0xe3c795 : amber ? 0xe8bf54 : frost ? 0xb4d6dc : desert ? 0xe9c276 : jungle ? 0xe7a5ae : 0xc899d4);
    }
    staticBatch(group, voxels.splice(foliageStart), geometry, stoneMaterial, `${zone.id}: grass and flowers`).userData.collision = 'foliage';
    staticBatch(group, voxels, geometry, stoneMaterial, `${zone.id}: connected terrain and solids`);
    staticBatch(group, glows, geometry, glowMaterial, `${zone.id}: luminous details`, false).userData.collision = 'effect';
    if (zone.beacon) {
      const b = zone.beacon, source = beaconAsset.scene.getObjectByName(`beacon-${zone.id}`);
      if (!source) throw new Error(`Missing authored beacon: ${zone.id}`);
      const model = source.clone(true), energy = model.children.find(part => part.userData.part === 'light');
      if (!(energy instanceof THREE.Mesh)) throw new Error(`Missing authored beacon light: ${zone.id}`);
      model.position.set(b.x, 0, b.z); group.add(model);
      model.traverse(part => { if (part instanceof THREE.Mesh) part.castShadow = part.receiveShadow = part !== energy; });
      energy.material = beaconGlowMaterial;
      energy.name = `${zone.id}: beacon light`; energy.visible = false; beacons.set(zone.id, energy);
      energy.userData.collision = 'effect';
      emitters.push({position:new THREE.Vector3(origin.x+b.x,group.position.y+2.8,origin.z+b.z),color:light,scale:1.6,source:energy});
    }
  }
  scene.add(root);
  landscape.build();
  try { await landscape.buildTrees(frontier); }
  catch (error) { disposeWorldGroup(root); throw error; }
  try {
    await templeProps(root, new Map([['pillar', campPillars]]));
  } catch (error) {
    console.warn('The authored Rootvault gate could not load', error);
    const fallback: Voxel[] = [];
    for (const pillar of campPillars) {
      const [sx, sy, sz] = pillar.scale!;
      fallback.push([pillar.x, (pillar.y || 0) + 4.535 * sy / 2, pillar.z, 1.6 * sx, 4.535 * sy, 1.8 * sz, 0x8d9d89, 0]);
    }
    staticBatch(root, fallback, geometry, stoneMaterial, 'Rootvault entrance and camp pillar fallback');
  }
  let dungeonApproaches: Awaited<ReturnType<typeof createDungeonApproaches>>;
  try { dungeonApproaches = await createDungeonApproaches(root); }
  catch (error) { disposeWorldGroup(root); throw error; }
  const villagers = new Map<string, THREE.Group>();
  const cityLives: Awaited<ReturnType<typeof createCityLife>>[] = [];
  let trainingGrounds: ReturnType<typeof createTrainingGrounds> | undefined;
  const [houseAsset, cityAsset, civicAsset, deedAsset] = await Promise.all(['/models/house-interiors.glb','/models/city-kit.glb','/models/city-furnishings.glb','/models/deed-cottages-merchants.glb'].map(url=>new GLTFLoader().loadAsync(url)));
  const cities = CITY_LAYOUTS.map(city=>createCityModels(cityAsset.scene,civicAsset.scene,city,townBiomes));
  const buildingAssets = new THREE.Group(); buildingAssets.add(houseAsset.scene,cityAsset.scene,deedAsset.scene);
  const homes = createBuildingModels(buildingAssets, frontier, civicAsset.scene);
  root.add(homes.root,...cities.map(city=>city.root));
  const pollAsset = (await new GLTFLoader().loadAsync('/models/poll-booth.glb')).scene;
  for (const booth of POLL_BOOTHS) {
    const model = pollAsset.clone(true); model.name = booth.id;
    model.position.set(booth.modelX, groundHeight(booth.modelX, booth.modelZ), booth.modelZ);
    model.rotation.y = booth.rotation;
    model.traverse(part => { if (part instanceof THREE.Mesh) part.castShadow = part.receiveShadow = true; });
    root.add(model); pollBooths.set(booth.id, model);
  }
  const caravan = (await new GLTFLoader().loadAsync('/models/gold-merchant-caravan.glb')).scene;
  const goldMerchant = createVillager(caravan, 'merchant', 'merchant');
  caravan.getObjectByName('merchant')!.removeFromParent();
  caravan.position.set(GOLD_CARAVAN.x, groundHeight(GOLD_CARAVAN.x, GOLD_CARAVAN.z), GOLD_CARAVAN.z);
  caravan.rotation.y = GOLD_CARAVAN.rotation;
  caravan.traverse(part => { if (part instanceof THREE.Mesh) part.castShadow = part.receiveShadow = true; });
  goldMerchant.name = GOLD_MERCHANT.id;
  goldMerchant.position.set(GOLD_MERCHANT.x, groundHeight(GOLD_MERCHANT.x, GOLD_MERCHANT.z), GOLD_MERCHANT.z);
  goldMerchant.rotation.y = GOLD_MERCHANT.rotation;
  root.add(caravan, goldMerchant); villagers.set(GOLD_MERCHANT.id, goldMerchant);
  const arena = (await new GLTFLoader().loadAsync('/models/colosseum.glb')).scene;
  arena.name = COLOSSEUM.id; arena.position.set(COLOSSEUM.x, groundHeight(COLOSSEUM.x, COLOSSEUM.z), COLOSSEUM.z);
  arena.traverse(part => { if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; } });
  root.add(arena);
  const arenaRay = new THREE.Raycaster(), arenaDirection = new THREE.Vector3();
  const arenaPath: Voxel[] = [];
  for (let x = 84; x < COLOSSEUM.x - COLOSSEUM.outerRadius; x += 2)
    arenaPath.push([x + 1, groundHeight(x + 1, 0) + .025, 0, 2, .05, 5, 0xb4a47d, 0]);
  staticBatch(root, arenaPath, geometry, stoneMaterial, 'Colosseum approach');
  for(const npc of [...AUCTIONEERS,DEED_AUCTIONEER,...BANKERS]){
    const model=npc.role==='banker'?createVillager(cityAsset.scene,'auctioneer'):createVillager(deedAsset.scene,'auctioneer',npc.id===DEED_AUCTIONEER.id?'merchant-deed-auctioneer':'merchant-auctioneer');
    model.name=npc.id;model.position.set(npc.x,buildingFloorHeight(npc.x,npc.z),npc.z);model.rotation.y=npc.rotation;
    root.add(model);villagers.set(npc.id,model);
  }
  try {
    const asset = (await new GLTFLoader().loadAsync('/models/village-kit.glb')).scene;
    const frontierStall = (prop: typeof VILLAGE_PROPS[number]) => prop.kind === 'stall';
    root.add(createVillageProps(asset,VILLAGE_PROPS.filter(prop=>prop.kind!=='cottage'&&prop.kind!=='inn'&&!frontierStall(prop)).map(prop=>({...prop,y:villagePropHeight(prop)}))));
    root.add(createVillageProps(frontier,VILLAGE_PROPS.filter(frontierStall).map(prop=>({...prop,kind:`${VILLAGES.find(v=>v.id===prop.villageId)!.zone}-market`,y:villagePropHeight(prop)})),'frontier-'));
    const foundations:Voxel[]=[], paths:Voxel[]=[];
    for(const prop of VILLAGE_PROPS){
      if(prop.kind==='cottage'||prop.kind==='inn')continue;
      const {width,depth}=villageFootprint(prop),top=villagePropHeight(prop);
      let low=top;
      for(let x=prop.x-width/2;x<=prop.x+width/2+.001;x+=width/4)for(let z=prop.z-depth/2;z<=prop.z+depth/2+.001;z+=depth/4)low=Math.min(low,groundHeight(x,z));
      const height=top-low+.12;
      foundations.push([prop.x,top-height/2,prop.z,width,height,depth,0x9eaa8d,0]);
    }
    for (const village of VILLAGES) {
      const destinations = VILLAGE_PROPS.filter(p=>p.villageId===village.id&&p.kind!=='lantern').map(prop=>{
        const building=BUILDINGS.find(b=>b.id===prop.id);
        return building ? buildingPoint(building,0,building.depth/2+BUILDING_RAMP_LENGTH) : {x:prop.x+Math.sin(prop.rotation)*2.6,z:prop.z+Math.cos(prop.rotation)*2.6};
      });
      const shade=village.zone==='sunveil'?0xe0bf82:village.zone==='mistwood'?0xa1936d:0xc8b990;
      for (const destination of destinations) {
        let from={x:village.x,z:village.z};
        for (const to of findPath(from,destination,WORLD_COLLIDERS,LANDSCAPE_BOUNDS)) {
          const length=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.max(1,Math.ceil(length/1.3));
          for(let i=0;i<=steps;i++){const t=i/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;paths.push([x,groundHeight(x,z)+.012,z,1.45,.024,1.45,shade,0]);}
          from=to;
        }
      }
    }
    staticBatch(root,foundations,geometry,stoneMaterial,'Village foundations');
    staticBatch(root,paths,geometry,stoneMaterial,'Village footpaths',false);
    const treasureAsset = await loadTreasureAssets();
    for(const resident of VILLAGE_NPCS){
      const mesh=resident.id===SHADY_MERCHANT.id?createVillager(treasureAsset.scene,'merchant','shadyMerchant'):createVillager(asset,resident.role);mesh.name=resident.id;mesh.position.set(resident.x,buildingFloorHeight(resident.x,resident.z),resident.z);mesh.rotation.y=resident.rotation;
      root.add(mesh);villagers.set(resident.id,mesh);
    }
    // This world owns its GLB resources; world disposal must not touch the pet cache.
    const hearthlingAsset = (await new GLTFLoader().loadAsync('/models/hearthling.glb')).scene;
    for (const side of ['left', 'right']) {
      const arm = hearthlingAsset.getObjectByName(`hearthling-arm-${side}`);
      if (!arm) throw new Error(`Missing Hearthling ${side} arm`);
      arm.name = `hearthling-${side}-arm`;
    }
    const hearthling = createVillager(hearthlingAsset, 'warden', 'hearthling');
    hearthling.name = HEARTHLING_NPC.id; hearthling.userData.targetId = HEARTHLING_NPC.id;
    hearthling.scale.setScalar(HEARTHLING_NPC.scale);
    hearthling.position.set(HEARTHLING_NPC.x, buildingFloorHeight(HEARTHLING_NPC.x, HEARTHLING_NPC.z), HEARTHLING_NPC.z);
    hearthling.rotation.y = HEARTHLING_NPC.rotation;
    root.add(hearthling); villagers.set(HEARTHLING_NPC.id, hearthling);
    const trainers = (await new GLTFLoader().loadAsync('/models/trainer-kit.glb')).scene;
    for(const resident of TRAINER_NPCS){
      const mesh=createVillager(resident.role==='cleric-trainer'?asset:trainers,resident.role==='cleric-trainer'?'healer':resident.role);mesh.name=resident.id;mesh.position.set(resident.x,buildingFloorHeight(resident.x,resident.z),resident.z);mesh.rotation.y=resident.rotation;
      root.add(mesh);villagers.set(resident.id,mesh);
    }
    for(const city of CITY_LAYOUTS){const life=await createCityLife(asset,city);cityLives.push(life);root.add(life.root);}
    const [practiceKit] = await Promise.all([new GLTFLoader().loadAsync('/models/training-grounds.glb'), loadCharacterAssets(), loadGatheringAssets()]);
    trainingGrounds = createTrainingGrounds(practiceKit.scene); root.add(trainingGrounds.root);
  } catch(error) { trainingGrounds?.dispose(); cityLives.forEach(life=>life.dispose()); disposeWorldGroup(root);throw error; }
  let waterAsset: THREE.Group | undefined;
  try { waterAsset = (await new GLTFLoader().loadAsync('/models/water-effects.glb')).scene; }
  catch (error) { console.warn('Swim details could not load; using simple surface effects', error); }
  const swimEffects = createSwimEffects(root, waterAsset);
  const swimRoot = root.getObjectByName('Landscape: swimming effects')!;
  const environment = createEnvironmentLights(root, [...emitters, ...discoverEnvironmentEmitters(root)]);
  const citizens = new Map([...cityLives.flatMap(life=>[...life.citizens]), ...(trainingGrounds?.citizens ?? [])]);
  for (const villager of villagers.values()) villager.userData.collision = 'actor';
  let disposed = false;
  return {
    colliders: WORLD_COLLIDERS, villagers, citizens, boards, pollBooths, chairs: homes.chairs, setInteriorView(player,camera) { homes.update(player,camera);cities.forEach(city=>city.update(player)); },
    constrainCamera(target,desired) {
      if (disposed) return;
      landscape.constrainCamera(target,desired);
      dungeonApproaches.constrainCamera(target,desired);
      cities.forEach(city=>city.constrainCamera(target,desired));
      if (Math.hypot(target.x-COLOSSEUM.x,target.z-COLOSSEUM.z)>COLOSSEUM.outerRadius+5) return;
      const distance=arenaDirection.subVectors(desired,target).length(); if (distance<.001) return;
      arenaRay.set(target,arenaDirection.divideScalar(distance));arenaRay.near=.1;arenaRay.far=distance;
      const hit=arenaRay.intersectObject(arena,true)[0];
      if(hit)desired.copy(target).addScaledVector(arenaDirection,Math.max(.1,hit.distance-.35));
    },
    setRegionBeaconLit(zone, lit) { if (!disposed) { const beacon = beacons.get(zone); if (beacon) beacon.visible = lit; } },
    setSwimmers(points) { if (!disposed) swimEffects.setSwimmers(graphics.effects==='off'?[]:graphics.effects==='low'?points.slice(0,8):points); },
    update(time,observer,camera,daylight) { if (!disposed) {
      landscape.update(time,daylight,observer); dungeonApproaches.update(time,observer);
      swimRoot.visible=graphics.effects!=='off';if(swimRoot.visible)swimEffects.update(time);
      environment.update(time,observer,camera); cityLives.forEach(life=>life.update(time,observer)); trainingGrounds?.update(time,observer); cities.forEach(city=>city.animate(time,observer)); homes.animate(time); beaconGlowMaterial.color.setScalar(.92 + Math.sin(time * 2.3) * .08);
    } },
    dispose() { if (!disposed) { disposed = true; boards.clear(); pollBooths.clear(); citizens.clear(); trainingGrounds?.dispose(); cityLives.forEach(life=>life.dispose()); cities.forEach(city=>city.dispose()); environment.dispose(); swimEffects.dispose(); disposeWorldGroup(root); } },
  };
}

type TemplePlacement = { x: number; z: number; y?: number; turn?: number; scale?: [number, number, number]; tint?: number; id?: string };
type TempleBinding = { mesh: THREE.InstancedMesh; index: number; base: THREE.Matrix4; source: THREE.Matrix4; glow: boolean; lid: boolean; tint: number };

/** Shared authored parts; large dungeons keep masonry in independently culled cells. */
async function templeProps(parent: THREE.Group, placements: Map<string, TemplePlacement[]>, waterTime = { value: 0 }, kit = 'rootvault'): Promise<Map<string, TempleBinding[]>> {
  const asset = await new GLTFLoader().loadAsync(`/models/${kit}-kit.glb`);
  asset.scene.updateMatrixWorld(true);
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .84, metalness: .12 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const water = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .18, metalness: .12, transparent: true, opacity: .76, depthWrite: false, side: THREE.DoubleSide });
  water.name = 'Rootvault: flowing water'; water.userData.time = waterTime;
  water.onBeforeCompile = shader => {
    shader.uniforms.vaultWaterTime = waterTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vaultWaterPosition;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 waterPoint = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          waterPoint = instanceMatrix * waterPoint;
        #endif
        vaultWaterPosition = (modelMatrix * waterPoint).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float vaultWaterTime; varying vec3 vaultWaterPosition;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vaultWaterPosition.xz;
        float wave = sin(p.x * 3.6 + p.y * 1.7 + sin(p.y * 2.0 - vaultWaterTime * .3) + vaultWaterTime * 1.3);
        float crossWave = sin(p.y * 4.8 - p.x * 1.2 + sin(p.x * 2.4 + vaultWaterTime * .7) - vaultWaterTime * 1.7);
        float caustic = pow(max(0.0, sin(wave * 2.0 + crossWave) * cos(crossWave * 1.6)), 6.0);
        diffuseColor.rgb += vec3(.13, .28, .25) * caustic;
        diffuseColor.a = .73 + wave * .045;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(normal + vec3(wave * .18, crossWave * .12, 0.0));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(.012, .04, .035) + caustic * vec3(.06, .12, .10);');
  };
  water.customProgramCacheKey = () => 'rootvault-water-v1';
  const bindings = new Map<string, TempleBinding[]>(), used = new Set<THREE.BufferGeometry>();
  const transform = new THREE.Object3D(), color = new THREE.Color();
  for (const [name, points] of placements) {
    if (!points.length) continue;
    const template = asset.scene.getObjectByName(`${kit}-${name}`);
    if (!template) throw new Error(`Missing ${kit} asset: ${name}`);
    const cells = new Map<string, TemplePlacement[]>();
    for (const point of points) {
      const key = kit !== 'rootvault' && (name === 'wall' || name === 'alcove') ? `${Math.floor(point.x / 32)},${Math.floor(point.z / 32)}` : 'all';
      const cell = cells.get(key) ?? []; cell.push(point); cells.set(key, cell);
    }
    for (const list of cells.values()) template.traverse(source => {
      if (!(source instanceof THREE.Mesh)) return;
      const emissive = source.name.endsWith('-glow'), lid = source.name.endsWith('-lid'), surface = source.name.endsWith('-water');
      const mesh = new THREE.InstancedMesh(source.geometry, surface ? water : emissive ? glow : stone, list.length);
      mesh.name = `Blender ${kit === 'rootvault' ? 'Rootvault' : kit}: ${source.name}`; mesh.castShadow = !emissive && !surface; mesh.receiveShadow = !emissive;
      mesh.userData.asset = name; mesh.userData.authoredDungeon = kit; mesh.userData.objectIds = list.map(p => p.id ?? null);
      // The checkpoint is a magical arrival marker: its floating glyph and rings must not trap respawns.
      mesh.userData.collision = surface ? 'water' : name === 'checkpoint' || source.name === 'brazier-glow' ? 'effect' : 'solid';
      if (lid || name === 'gate' && !source.name.endsWith('-stone')) mesh.userData.collisionStates = list.map(p => ({ key: `${lid ? 'object' : 'gate'}:${p.id}`, value: false }));
      used.add(source.geometry);
      for (let index = 0; index < list.length; index++) {
        const point = list[index];
        transform.position.set(point.x, point.y ?? 0, point.z); transform.rotation.set(0, point.turn ?? 0, 0);
        transform.scale.set(...(point.scale ?? [1, 1, 1])); transform.updateMatrix();
        const base = transform.matrix.clone();
        mesh.setMatrixAt(index, base.clone().multiply(source.matrixWorld));
        mesh.setColorAt(index, color.setHex(point.tint ?? 0xffffff));
        if (point.id) {
          if (!bindings.has(point.id)) bindings.set(point.id, []);
          bindings.get(point.id)!.push({ mesh, index, base, source: source.matrixWorld.clone(), glow: emissive, lid, tint: point.tint ?? 0xffffff });
        }
      }
      mesh.computeBoundingBox(); mesh.computeBoundingSphere(); parent.add(mesh);
    });
  }
  // Authored vertex colours share stone, glow, and animated water materials.
  const oldMaterials = new Set<THREE.Material>(), unused = new Set<THREE.BufferGeometry>();
  asset.scene.traverse(object => { if (object instanceof THREE.Mesh) {
    if (!used.has(object.geometry)) unused.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) oldMaterials.add(material);
  } });
  oldMaterials.forEach(material => material.dispose()); unused.forEach(geometry => geometry.dispose());
  if (!placements.has('pool')) water.dispose();
  return bindings;
}

const templePalettes: Record<DungeonRoom['theme'], { floor: number[]; path: number; stone: number; tint: number; light: number }> = {
  moss: { floor: [0x405b50, 0x476257, 0x4e6959], path: 0x9ba98b, stone: 0x829789, tint: 0xffffff, light: 0xcceca0 },
  amber: { floor: [0x665f4b, 0x72654f, 0x7a6a53], path: 0xbda57c, stone: 0xa99a76, tint: 0xffdfae, light: 0xffd28a },
  frost: { floor: [0x597582, 0x607d8a, 0x66858e], path: 0xadc4c7, stone: 0x9cbcc4, tint: 0xc5edff, light: 0xb1edff },
  root: { floor: [0x504355, 0x5a4b60, 0x634f65], path: 0xa58b9e, stone: 0x96809b, tint: 0xe2c4ff, light: 0xe0adf9 },
};
/** Shared Blender masonry follows each dungeon's authored floorplan and collision. */
export async function createDungeonWorld(scene: THREE.Scene, dungeonId: DungeonId = 'rootvault', dream?: 'pleasant' | 'nightmare'): Promise<WorldInstance> {
  const dungeon = getDungeon(dungeonId); if (!dungeon) throw new Error(`Unknown dungeon: ${dungeonId}`);
  const themeId = dungeonThemeId(dungeonId), layout = dungeonLayout(dungeonId), authoredArt = themedDungeonArt(themeId), encounterRooms = new Set(dungeonStages(dungeonId).map(stage => stage.id));
  const roomView = createDungeonRoomVisibility(layout.rooms);
  const templeRoomAt = (x: number, z: number) => layout.rooms.find(room => Math.abs(x-room.x)<=room.width/2 && Math.abs(z-room.z)<=room.depth/2);
  const group = new THREE.Group(); group.name = dungeonId === 'rootvault' ? 'The Rootbound Vault' : dungeon.name; group.userData.dungeonId = dungeonId; group.userData.collision = 'solid'; scene.add(group);
  const geometry = new THREE.BoxGeometry(1, 1, 1), solids: Voxel[] = [], lights: Voxel[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, turn = 0) => solids.push([x, y, z, w, h, d, color, turn]);
  const glow = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, turn = 0) => lights.push([x, y, z, w, h, d, color, turn]);
  const placements = new Map<string, TemplePlacement[]>();
  const place = (name: string, point: TemplePlacement) => { if (!placements.has(name)) placements.set(name, []); placements.get(name)!.push(point); };
  const themedPalette = authoredArt ?? (dream === 'pleasant' ? { floor:[0x92b7a2,0xb2cba7,0xabc5bc],path:0xe9d4ae,stone:0xc6c2db,tint:0xffdbe7,light:0xc2ffe7 } : themeId === 'cindercrypt' ? { floor: [0x35251e, 0x493128, 0x553b2a], path: 0x967254, stone: 0x846653, tint: 0xffad72, light: 0xff7d24 }
    : themeId === 'frosthollow' ? { floor: [0x526b80, 0x607d90, 0x6b8e9f], path: 0xc0e0eb, stone: 0x9fc4dd, tint: 0xa3dcff, light: 0x94e9ff }
    : themeId === 'nightroot' ? { floor: [0x292038, 0x342844, 0x3e2c4b], path: 0x89739f, stone: 0x726184, tint: 0xc09be8, light: 0xc88aff } : undefined);
  const paletteAt = (x: number, z: number) => themedPalette ?? templePalettes[templeRoomAt(x, z)?.theme ?? 'root'];
  const heroProps: { x: number; y: number; z: number; turn: number; scale: [number, number, number] }[] = [];
  const caveRocks: TemplePlacement[] = [];
  const { minX, maxX, minZ, maxZ } = dungeonBounds(dungeonId);
  for (const room of layout.rooms) box(room.x, -.69, room.z, room.width, .30, room.depth, 0x293c36);
  if(dream)for(const room of layout.rooms)for(let i=0;i<5;i++){const angle=i*Math.PI*2/5;glow(room.x+Math.cos(angle)*5,3+i*.6,room.z+Math.sin(angle)*5,.28,.28,.28,dream==='pleasant'?0xc2ffe7:0xea97eb,angle);}
  const pools = layout.pools.map(pool => ({ ...pool, innerWidth: pool.width * 3.3 / 3.8, innerDepth: pool.depth * 2.4 / 2.9 }));
  for (let x = minX + 1; x < maxX; x += 2) for (let z = minZ + 1; z < maxZ; z += 2) {
    const room = templeRoomAt(x, z), palette = paletteAt(x, z), row = (x - minX - 1) / 2, col = (z - minZ - 1) / 2;
    if (!room) continue;
    const passage = !encounterRooms.has(room.id);
    const border = Math.min(room.width / 2 - Math.abs(x - room.x), room.depth / 2 - Math.abs(z - room.z)) < 1.8;
    const tint = passage || border ? palette.floor[2] : palette.floor[(row + col) % 2];
    let tiles = [{ left: Math.max(x - .9875, room.x - room.width / 2), right: Math.min(x + .9875, room.x + room.width / 2),
      front: Math.max(z - .9875, room.z - room.depth / 2), back: Math.min(z + .9875, room.z + room.depth / 2) }];
    for (const pool of pools) tiles = tiles.flatMap(tile => {
      const left = Math.max(tile.left, pool.x - pool.innerWidth / 2), right = Math.min(tile.right, pool.x + pool.innerWidth / 2);
      const front = Math.max(tile.front, pool.z - pool.innerDepth / 2), back = Math.min(tile.back, pool.z + pool.innerDepth / 2);
      if (left >= right || front >= back) return [tile];
      return [{ ...tile, right: left }, { ...tile, left: right }, { left, right, front: tile.front, back: front }, { left, right, front: back, back: tile.back }]
        .filter(part => part.right > part.left && part.back > part.front);
    });
    for (const tile of tiles) box((tile.left + tile.right) / 2, -.075, (tile.front + tile.back) / 2, tile.right - tile.left, .15, tile.back - tile.front, tint);
  }
  let pillarIndex = 0;
  for (const wall of layout.walls) {
    const width = wall.halfWidth * 2, depth = wall.halfDepth * 2, palette = paletteAt(wall.x, wall.z);
    if (wall.height > 5 && width <= 1.9 && depth <= 1.9) {
      const guardian = pillarIndex++ % 3 === 0;
      box(wall.x, .11, wall.z, width, .22, depth, palette.stone);
      const landmark = themeId === 'cindercrypt' ? wall.x > 0 : themeId === 'frosthollow' ? wall.x < 0 : themeId === 'nightroot' && guardian;
      if (landmark) heroProps.push({ x: wall.x, y: .22, z: wall.z, turn: wall.x > 0 ? -Math.PI / 2 : Math.PI / 2, scale: [.46, (wall.height - .22) / 3.62, .46] });
      else place(guardian ? 'guardian' : 'pillar', { x: wall.x, y: .22, z: wall.z, tint: palette.tint, turn: wall.x > 0 ? -Math.PI / 2 : Math.PI / 2, scale: [.88, (wall.height - .22) / (guardian ? 3.935 : 4.535), .88] });
      continue;
    }
    const length = Math.max(width, depth), alongX = width > depth;
    const count = Math.ceil(length / 4), span = length / count;
    for (let i = 0; i < count; i++) {
      const offset = -length / 2 + (i + .5) * span;
      const x = wall.x + (alongX ? offset : 0), z = wall.z + (alongX ? 0 : offset), turn = alongX ? 0 : Math.PI / 2;
      const weathering = (i + Math.abs(Math.round(wall.x + wall.z))) % 4;
      // Continuous masonry encloses the chamber inside its existing collision footprint.
      place(authoredArt && i % 3 === 1 ? 'alcove' : 'wall', { x, z, turn, scale: [span / 4, wall.height / 4.4, Math.min(width, depth) / 1.2], tint: palette.tint });
      if (i % 3 === 1) for (const side of [-1, 1]) {
        const face = side * (Math.min(width, depth) / 2 + .06), bx = x + (alongX ? 0 : face), bz = z + (alongX ? face : 0);
        if (templeRoomAt(x + (alongX ? 0 : side * 1.5), z + (alongX ? side * 1.5 : 0)))
          place('brazier', { x: bx, z: bz, y: 2.3, turn, scale: [.65, .75, .65], tint: palette.tint });
      }
      if (!authoredArt) caveRocks.push({ x, z, turn: turn + (i % 2) * Math.PI,
        scale: [span * .98, wall.height * (.24 + weathering * .04), Math.min(width, depth) * .98],
        tint: new THREE.Color(palette.stone).multiplyScalar(.70 + weathering * .065).getHex() });
    }
  }
  for (const gate of layout.gates) place('gate', { ...gate, turn: gate.axis === 'z' ? Math.PI / 2 : 0, scale: [gate.width / 8, 1, 1] });
  for (const pool of pools) {
    place('pool', { ...pool, tint: themedPalette?.tint, scale: [pool.width / 3.8, 1, pool.depth / 2.9] });
    if (authoredArt) place('landmark', { ...pool, scale: [pool.width / 3.8, 1, pool.depth / 2.9] });
  }
  for (const door of layout.doors) {
    // Passage sidewalls and chamber endwalls need different pier spacing; both follow the actual solids.
    const archScale = authoredArt ? [door.width / 7.2, door.width / 6].find(scale => [-1, 1].every(side => [-1, 1].every(edge => [-1, 1].every(depth => {
      const along = (side * 3.6 + edge * .535) * scale, across = depth * .38;
      const x = door.x + (door.axis === 'x' ? along : across), z = door.z + (door.axis === 'x' ? across : along);
      return layout.walls.some(wall => Math.abs(x - wall.x) <= wall.halfWidth && Math.abs(z - wall.z) <= wall.halfDepth);
    })))) ?? door.width / 6 : door.width / 6;
    place('arch', { x: door.x, z: door.z, turn: door.axis === 'z' ? Math.PI / 2 : 0, scale: [archScale, 1, .64], tint: paletteAt(door.x, door.z).tint });
  }
  for (const { x, z } of layout.lanterns) place('brazier', { x, z, turn: x > 0 ? Math.PI / 2 : -Math.PI / 2, tint: paletteAt(x, z).tint });
  for (const room of layout.rooms) {
    if (room.optional && !encounterRooms.has(room.id)) continue;
    const palette = paletteAt(room.x, room.z);
    // Brass corner inlays frame the fighting floor without obscuring trap warnings.
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const x = room.x + side * room.width * .28, z = room.z + end * room.depth * .28;
      box(x - side * .7, .018, z, 1.5, .035, .1, palette.path);
      box(x, .018, z - end * .7, .1, .035, 1.5, palette.path);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      // Small clusters sit in the room's outer margin, clear of enemy spawns and doorways.
      const x = room.x + side * (room.width / 2 - 2.5), z = room.z + (i - 1.5) * room.depth / 5;
      if (themeId === 'rootvault' || themeId === 'nightroot' || themeId === 'plagueworks') place('mushrooms', { x, z, tint: palette.tint, scale: [.8, themeId === 'nightroot' ? 1.4 : .8, .8] });
      else if (themeId === 'cindercrypt' || themeId === 'emberfall') {
        glow(x, .026, z, .11, .03, 2.4, palette.light, side * .6);
        glow(x + side * .55, .027, z + .8, 1.3, .03, .09, 0xffb544, side * .4);
      }
    }
  }
  const protectionLights: { roomId: string; ring: THREE.Mesh }[] = [];
  for (const stage of dungeonStages(dungeonId)) if (stage.storyObjective?.kind === 'protection') {
    const radius = stage.storyObjective.protectRadius ?? 6;
    place('brazier', { x: stage.x, z: stage.z, tint: 0xffe0a1 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .1, radius, 64), new THREE.MeshBasicMaterial({ color: 0xffd794, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.name = 'Chamber: warding lantern boundary'; ring.rotation.x = -Math.PI / 2; ring.position.set(stage.x, .04, stage.z); group.add(ring);
    protectionLights.push({roomId:stage.id,ring});
  }
  for (const shrine of layout.shrines) place('bell-shrine', { ...shrine });
  for (const object of layout.objects) place(object.kind, { ...object, tint: paletteAt(object.x, object.z).tint });
  for (const portal of layout.portals) {
    box(portal.x, .008, portal.z, 6.2, .016, 6.2, 0x262b30);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      box(portal.x + side * 2.6, .022, portal.z + end * 2.9, .7, .028, .12, 0xb19155);
      box(portal.x + side * 2.9, .022, portal.z + end * 2.6, .12, .028, .7, 0xb19155);
    }
  }
  staticBatch(group, solids, geometry, new THREE.MeshStandardMaterial({ roughness: .92 }), 'Vault: fitted temple floors and shared walls');
  staticBatch(group, lights, geometry, new THREE.MeshBasicMaterial({ toneMapped: false }), 'Vault: chamber floor mosaics', false);
  const floorGlow = group.getObjectByName('Vault: chamber floor mosaics'); if (floorGlow) floorGlow.userData.collision = 'effect';
  let bindings: Map<string, TempleBinding[]>;
  const waterTime = { value: 0 };
  try {
    bindings = await templeProps(group, placements, waterTime, themeId);
    await templeProps(group, new Map([['portal-plinth', layout.portals]]), waterTime, 'dungeon-room');
    if (!authoredArt) await createDungeonThemeDecor(group, themeId, heroProps, caveRocks);
  }

  catch (error) { disposeWorldGroup(group); throw error; }
  // Cinder basins burn as magma; frost and twilight retain their own luminous liquid.
  const water = group.getObjectByName(`Blender ${themeId === 'rootvault' ? 'Rootvault' : themeId}: pool-water`) as THREE.InstancedMesh;
  if (themedPalette && water) {
    const material = water.material as THREE.MeshStandardMaterial;
    material.color.setHex(authoredArt ? authoredArt.liquid : themeId === 'cindercrypt' ? 0xff5730 : themeId === 'frosthollow' ? 0x8dd9ff : 0xaa70e7);
    material.emissive.copy(material.color); material.emissiveIntensity = authoredArt ? authoredArt.fluidGlow : themeId === 'cindercrypt' ? .85 : .17;
    if (themeId === 'cindercrypt' || themeId === 'emberfall') { material.opacity = .97; material.roughness = .52; }
  }
  const themedAmbience = createThemedDungeonAmbience(group, themeId, layout);
  const roomPortals = createDungeonRoomPortals(group, layout);
  const spikes = dream ? undefined : createDungeonSpikes(group, dungeonId);
  let spikesEnabled = false;
  spikes?.update(Date.now(), false);
  const preparation = dungeonPreparation(dungeonId);
  if (preparation) {
    const ward: Voxel[] = [], colour = 0xa6f4dc, width = preparation.maxX-preparation.minX, depth = preparation.maxZ-preparation.minZ;
    const x=(preparation.minX+preparation.maxX)/2, z=(preparation.minZ+preparation.maxZ)/2;
    for (const edge of [preparation.minZ+.12,preparation.maxZ-.12]) ward.push([x,.034,edge,width,.048,.16,colour,0]);
    for (const edge of [preparation.minX+.12,preparation.maxX-.12]) ward.push([edge,.034,z,.16,.048,depth,colour,0]);
    for (const side of [-1,1]) for (const row of [-1,1]) for (let i=0;i<16;i++) {
      const angle=i*Math.PI/8;
      ward.push([x+side*3+Math.sin(angle)*1.3,.035,z+row*2.3+Math.cos(angle)*1.3,.13,.05,.28,colour,-angle]);
    }
    staticBatch(group,ward,geometry,new THREE.MeshBasicMaterial({toneMapped:false}),'Dungeon: arrival sanctuary ward',false);
    group.getObjectByName('Dungeon: arrival sanctuary ward')!.userData.collision = 'effect';
  }
  const returnPoint = dungeonReturn(dungeonId);
  const returnPortal = createDungeonPortalEffect(group, '#ff3028', returnPoint.x, 0, returnPoint.z, 'return'); returnPortal.group.name = 'Dungeon: completion return'; returnPortal.group.visible = false;
  // Emitter sources are per-room visibility switches; the authored geometry remains shared.
  const roomLights = new Map(layout.rooms.map(room => [room.id, new THREE.Group()]));
  const environment = createEnvironmentLights(group, discoverEnvironmentEmitters(group).map(emitter => ({ ...emitter,
    source: roomLights.get(layout.rooms.find(room => Math.abs(emitter.position.x-room.x)<=room.width/2+2 && Math.abs(emitter.position.z-room.z)<=room.depth/2+2)?.id ?? '') ?? emitter.source })));

  // Activation beams are capped to the canonical interaction objects and never own a light.
  const beams = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .23, depthWrite: false, toneMapped: false }), layout.objects.length);
  beams.name = 'Vault: active seals and available treasure'; beams.userData.collision = 'effect'; beams.count = 0; beams.frustumCulled = false; group.add(beams);
  const hazardLimit = 24, hazards = new Map<string, DungeonHazard>();
  const rings = new THREE.InstancedMesh(new THREE.RingGeometry(.92, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: .92, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), hazardLimit * 2);
  const disks = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: .19, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), hazardLimit);
  // Keep the safe centre transparent; the same inner radius is used by server damage checks.
  const safeRadii = new THREE.InstancedBufferAttribute(new Float32Array(hazardLimit), 1);
  disks.geometry.setAttribute('safeRadius', safeRadii);
  disks.material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float safeRadius; varying vec2 hazardLocal; varying float hazardSafe;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nhazardLocal = position.xy; hazardSafe = safeRadius;');
    shader.fragmentShader = 'varying vec2 hazardLocal; varying float hazardSafe;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (length(hazardLocal) < hazardSafe) discard;');
  };
  rings.name = 'Vault: boss danger outlines'; disks.name = 'Vault: boss danger fill';
  rings.userData.collision = disks.userData.collision = 'effect';
  rings.count = disks.count = 0; rings.frustumCulled = disks.frustumCulled = false; rings.renderOrder = 3; disks.renderOrder = 2; group.add(disks, rings);
  const transform = new THREE.Object3D(), tint = new THREE.Color(), pose = new THREE.Matrix4();
  const hinge = new THREE.Matrix4().makeTranslation(0, .54, -.45).multiply(new THREE.Matrix4().makeRotationX(-1.25)).multiply(new THREE.Matrix4().makeTranslation(0, -.54, .45));
  let collisionState = dungeonColliders([], [], dungeonId);
  const colliders = [...collisionState];
  const cameraBlocks = layout.walls.map(wall => new THREE.Box3(new THREE.Vector3(wall.x - wall.halfWidth, 0, wall.z - wall.halfDepth), new THREE.Vector3(wall.x + wall.halfWidth, wall.height + .2, wall.z + wall.halfDepth)));
  for (const shrine of layout.shrines) cameraBlocks.push(new THREE.Box3(new THREE.Vector3(shrine.x - shrine.width / 2, 0, shrine.z - shrine.depth / 2), new THREE.Vector3(shrine.x + shrine.width / 2, shrine.height, shrine.z + shrine.depth / 2)));
  if (authoredArt) for (const pool of pools) cameraBlocks.push(new THREE.Box3(new THREE.Vector3(pool.x - pool.width / 2, 0, pool.z - pool.depth / 2), new THREE.Vector3(pool.x + pool.width / 2, 4.5, pool.z + pool.depth / 2)));
  for (const door of layout.doors) {
    const x = door.axis === 'x' ? door.width / 2 : .55, z = door.axis === 'z' ? door.width / 2 : .55;
    cameraBlocks.push(new THREE.Box3(new THREE.Vector3(door.x - x, 4.6, door.z - z), new THREE.Vector3(door.x + x, 6.6, door.z + z)));
  }
  const gateCameraBlocks = layout.gates.map(gate => {
    const x = gate.axis === 'x' ? gate.width / 2 : .4, z = gate.axis === 'z' ? gate.width / 2 : .4;
    return new THREE.Box3(new THREE.Vector3(gate.x - x, 0, gate.z - z), new THREE.Vector3(gate.x + x, 4.6, gate.z + z));
  });
  const closedGates = layout.gates.map(() => true);
  const cameraRay = new THREE.Ray(), cameraDirection = new THREE.Vector3(), cameraHit = new THREE.Vector3();
  let disposed = false, serverClockOffset = 0, completed = false;
  // Global renderer clipping also covers independent actors/effects. Local planes keep shadows contained.
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.clippingPlanes = roomView.planes; material.clipShadows = true;
    }
  });
  function setDungeonRoom(id: string | null) {
    if (disposed) return;
    roomView.select(id); group.userData.currentRoomId = roomView.roomId; roomPortals.setRoom(id);
    for (const marker of protectionLights) marker.ring.visible = id === null || id === marker.roomId;
    for (const [roomId, source] of roomLights) source.visible = id === null || id === roomId;
    returnPortal.group.visible = completed && roomView.contains(returnPoint);
  }
  setDungeonRoom(roomView.roomId);
  const activeMarkers: { x: number; z: number; activated: boolean; kind: string }[] = [];
  function refreshHazards(now: number) {
    let outlineCount = 0, fillCount = 0;
    for (const [id, hazard] of hazards) {
      if (now > hazard.endsAt + 350) { hazards.delete(id); continue; }
      if (!roomView.contains(hazard)) continue;
      const progress = Math.max(0, Math.min(1, (now - hazard.startedAt) / Math.max(1, hazard.endsAt - hazard.startedAt)));
      const impact = now >= hazard.endsAt, radius = impact ? hazard.r * Math.max(.02, 1 - (now - hazard.endsAt) / 350) : hazard.r;
      transform.position.set(hazard.x, .055, hazard.z); transform.rotation.set(-Math.PI / 2, 0, 0);
      tint.setHex(impact ? 0xffe0a1 : hazard.kind === 'frost' ? 0x64dcff : hazard.kind === 'shadow' ? 0xcd82ff : hazard.kind === 'roots' ? 0xb6ef63 : progress > .72 ? 0xff6045 : 0xffb95e);
      transform.scale.set(radius, radius, 1); transform.updateMatrix();
      rings.setMatrixAt(outlineCount, transform.matrix); rings.setColorAt(outlineCount++, tint);
      const safeRadius = hazard.innerR ?? 0;
      const innerRadius = Math.max(.03, safeRadius + Math.max(0, radius-safeRadius) * (impact ? .8 : Math.sqrt(progress)));
      transform.scale.set(innerRadius, innerRadius, 1); transform.updateMatrix();
      rings.setMatrixAt(outlineCount, transform.matrix); rings.setColorAt(outlineCount++, tint);
      const fillRadius = safeRadius ? radius : innerRadius;
      transform.scale.set(fillRadius, fillRadius, 1); transform.updateMatrix();
      safeRadii.setX(fillCount, safeRadius / Math.max(.001, fillRadius));
      disks.setMatrixAt(fillCount, transform.matrix); disks.setColorAt(fillCount++, tint);
    }
    rings.count = outlineCount; disks.count = fillCount; safeRadii.needsUpdate = true;
    rings.instanceMatrix.needsUpdate = disks.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    if (disks.instanceColor) disks.instanceColor.needsUpdate = true;
  }
  return {
    colliders,
    setDungeonRoom,
    dungeonRoomClipping: roomView.planes,
    constrainCamera(target, desired) {
      const distance = cameraDirection.subVectors(desired, target).length();
      if (disposed || !Number.isFinite(distance) || distance < .001) return;
      cameraRay.set(target, cameraDirection.multiplyScalar(1 / distance));
      let nearest = distance;
      for (const block of cameraBlocks) if (cameraRay.intersectBox(block, cameraHit)) nearest = Math.min(nearest, target.distanceTo(cameraHit));
      for (let i = 0; i < gateCameraBlocks.length; i++) if (closedGates[i] && cameraRay.intersectBox(gateCameraBlocks[i], cameraHit)) nearest = Math.min(nearest, target.distanceTo(cameraHit));
      if (nearest < distance) desired.copy(target).addScaledVector(cameraDirection, Math.max(.05, nearest - .4));
    },
    setDungeonState(state, serverNow = Date.now()) {
      if (disposed) return;
      serverClockOffset = serverNow - Date.now(); activeMarkers.length = 0; completed = state?.completed === true;
      returnPortal.group.visible = completed && roomView.contains(returnPoint);
      spikesEnabled = !!state && !state.completed && !state.dream;
      spikes?.update(serverNow, spikesEnabled);
      const cleared = state?.clearedStages ?? [], activatedIds = state?.objects.filter(object => object.activated || object.opened).map(object => object.id) ?? [];
      roomPortals.setState(cleared, activatedIds, !!state?.dream);
      const nextCollisionState = dungeonColliders(cleared, activatedIds, dungeonId);
      if (nextCollisionState !== collisionState) { colliders.splice(0, colliders.length, ...nextCollisionState); collisionState = nextCollisionState; }
      for (const [index, gate] of layout.gates.entries()) {
        const open = dungeonGateOpen(gate, cleared, activatedIds);
        closedGates[index] = !open;
        for (const binding of bindings.get(gate.id) ?? []) {
          if (binding.mesh.name.endsWith('-stone')) continue;
          pose.copy(binding.base); if (open) pose.elements[13] -= 4.8; pose.multiply(binding.source);
          binding.mesh.userData.collisionStates[binding.index].value = open;
          binding.mesh.setMatrixAt(binding.index, pose); binding.mesh.instanceMatrix.needsUpdate = true;
          if (binding.glow) { binding.mesh.setColorAt(binding.index, tint.setHex(open ? 0xa4ffc0 : 0xff8055)); binding.mesh.instanceColor!.needsUpdate = true; }
          binding.mesh.computeBoundingBox(); binding.mesh.computeBoundingSphere();
        }
      }
      for (const object of layout.objects) {
        const status = state?.objects.find(candidate => candidate.id === object.id);
        const activated = status?.activated ?? false, available = status?.available ?? false;
        for (const binding of bindings.get(object.id) ?? []) {
          tint.setHex(binding.tint).multiplyScalar(binding.glow ? activated ? 1.35 : available ? 1.0 : .10 : activated && object.kind === 'chest' ? .60 : available || activated ? 1.0 : .65);
          binding.mesh.setColorAt(binding.index, tint); binding.mesh.instanceColor!.needsUpdate = true;
          if (binding.lid) {
            binding.mesh.userData.collisionStates[binding.index].value = activated;
            pose.copy(binding.base); if (activated) pose.multiply(hinge); pose.multiply(binding.source);
            binding.mesh.setMatrixAt(binding.index, pose); binding.mesh.instanceMatrix.needsUpdate = true;
            binding.mesh.computeBoundingBox(); binding.mesh.computeBoundingSphere();
          }
        }
        if (activated && object.kind !== 'chest' || available && !activated) activeMarkers.push({ ...object, activated });
      }
      if (!state) hazards.clear();
      else {
        for (const [id, previous] of hazards) if (previous.endsAt > serverNow && !state.hazards.some(hazard => hazard.id === id)) hazards.delete(id);
        for (const hazard of state.hazards.slice(0, hazardLimit)) {
        if (![hazard.x, hazard.z, hazard.r, hazard.startedAt, hazard.endsAt, hazard.innerR ?? 0].every(Number.isFinite) || (hazard.innerR ?? 0) < 0 || (hazard.innerR ?? 0) >= hazard.r || hazard.r <= 0 || hazard.r > 30 || hazard.endsAt < hazard.startedAt || hazard.endsAt + 350 < serverNow) continue;
        if (!hazards.has(hazard.id) && hazards.size >= hazardLimit) hazards.delete(hazards.keys().next().value!);
        hazards.set(hazard.id, { ...hazard });
        }
      }
      refreshHazards(serverNow);
    },
    update(time,observer,camera) {
      if (disposed) return;
      waterTime.value = time; returnPortal.update(time, observer); themedAmbience?.update(time); roomPortals.update(time);
      spikes?.update(Date.now() + serverClockOffset, spikesEnabled);
      environment.update(time,observer,camera);
      beams.count = 0;
      for (let i = 0; i < activeMarkers.length; i++) {
        const marker = activeMarkers[i]; if (!roomView.contains(marker)) continue;
        const height = marker.kind === 'chest' ? 1.5 : 2.6;
        transform.position.set(marker.x, height / 2 + .15, marker.z); transform.rotation.set(0, Math.PI / 4, 0);
        transform.scale.set(.26 + Math.sin(time * 2.2 + i) * .045, height, .26); transform.updateMatrix();
        beams.setMatrixAt(beams.count, transform.matrix); beams.setColorAt(beams.count++, tint.setHex(marker.activated ? 0xaeffd2 : 0xffd794));
      }
      beams.instanceMatrix.needsUpdate = true; if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
      if (hazards.size || rings.count) refreshHazards(Date.now() + serverClockOffset);
    },
    dispose() { if (!disposed) { disposed = true; environment.dispose(); hazards.clear(); activeMarkers.length = 0; bindings.clear(); disposeWorldGroup(group); } },
  };
}

export async function createZone(scene: THREE.Scene, zoneId: string): Promise<WorldInstance> {
  const zone = ZONES.find(candidate => candidate.id === zoneId);
  if (!zone) throw new Error(`Unknown zone: ${zoneId}`);
  if (zoneId === 'greenwood') return createWorld(scene);
  const amber = zoneId === 'amberwild', frost = zoneId === 'frostmarch';
  const group = new THREE.Group();
  group.name = `Scenery: ${zoneId}`;
  const colliders: WorldCollider[] = [];
  const solids: Voxel[] = [], glowing: Voxel[] = [], beaconVoxels: Voxel[] = [];
  const emitters: EnvironmentEmitter[] = [];
  let seed = amber ? 716381 : frost ? 987273 : 461982;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (colors: number[]) => colors[Math.floor(random() * colors.length)];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, rotation = 0) => solids.push([x, y, z, w, h, d, color, rotation]);
  const glow = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, rotation = 0) => {
    glowing.push([x, y, z, w, h, d, color, rotation]);
    if(h>=.2&&w<=1.2&&d<=1.2)emitters.push({position:new THREE.Vector3(x,y,z),size:new THREE.Vector3(w,h,d),color,scale:.75});
  };
  const beacon = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, rotation = 0) => beaconVoxels.push([x, y, z, w, h, d, color, rotation]);
  const reserved = [[0, 22], [0, 28], [0, -28], ...[zone.npc, ...zone.nodes, ...zone.enemies, ...zone.gateways, ...(zone.beacon ? [zone.beacon] : [])].map(point => [point.x, point.z])];
  const clear = (x: number, z: number, r: number) =>
    reserved.every(([px, pz]) => Math.hypot(x - px, z - pz) >= r + 3) &&
    colliders.every(c => Math.hypot(x - c.x, z - c.z) >= r + c.r + .5);
  const obstacle = (x: number, z: number, r: number) => {
    if (!clear(x, z, r)) return false;
    colliders.push({ x, z, r }); return true;
  };
  const onPath = (x: number, z: number) => Math.abs(x - Math.sin(z * .12) * .8) < 2.4 || (Math.abs(z - 6) < 1.65 && Math.abs(x) < 29);
  const groundColors = amber ? [0x8b9550, 0x8f994f, 0x959d55, 0x86914b] : frost ? [0xd7e5e5, 0xd4e2e4, 0xdce9e8, 0xcddde1] : [0x4b435f, 0x51475f, 0x534860, 0x49435d];
  const stoneColors = amber ? [0x9d9980, 0xaaa48a, 0xb5ac8f] : frost ? [0x8da6b3, 0x9eb6be, 0xaac0c7] : [0x5f526c, 0x685873, 0x73617e];
  box(0, -1.2, 0, 180, 2, 180, groundColors[0]);
  for (let x = -48; x < 48; x += 3) for (let z = -48; z < 48; z += 3) {
    box(x + 1.5, -.12, z + 1.5, 3.015, .24, 3.015, pick(groundColors));
  }

  if (amber || frost) {
    for (let x = -30; x <= 30; x += .8) for (let z = -33; z <= 33; z += .8) {
      if (onPath(x, z)) box(x, .017, z, .77, .035, .77, pick(amber ? [0xb3a078, 0xbca982, 0xc1ad82] : [0xb0c5cc, 0xb5c9cf, 0xc2d3d6]));
    }
  }

  function rock(x: number, z: number, size: number, collide = true) {
    if (collide && !obstacle(x, z, size * .66)) return;
    box(x, size * .29, z, size * 1.05, size * .6, size * .95, pick(stoneColors));
    box(x - size * .1, size * .66, z - size * .08, size * .7, size * .2, size * .69, pick(stoneColors));
    if (frost) box(x - size * .1, size * .8, z - size * .08, size * .77, .16, size * .77, 0xe4f0eb);
    else if (amber) box(x - size * .18, size * .78, z, size * .48, .07, size * .46, 0x8f9c49);
  }

  function tree(x: number, z: number, scale: number) {
    if (!obstacle(x, z, .65 * scale)) return;
    const wood = frost ? 0x667b80 : 0x76533a;
    box(x, 1.8 * scale, z, .6 * scale, 3.6 * scale, .6 * scale, wood);
    if (frost) {
      for (let tier = 0; tier < 6; tier++) {
        const width = (4.6 - tier * .65) * scale, y = (2.2 + tier * .79) * scale;
        box(x, y, z, width, .8 * scale, width, tier % 2 ? 0x467778 : 0x537f83);
        box(x, y + .4 * scale, z, width + .09, .22 * scale, width + .09, tier % 2 ? 0xd7e6e6 : 0xe3efeb);
      }
    } else {
      const palette = pick([0xd09a3d, 0xc78538, 0xcb6d38, 0xbca344, 0xd7b44d]);
      box(x + .45 * scale, 2.5 * scale, z, 1.45 * scale, .32 * scale, .33 * scale, wood);
      box(x, 4.2 * scale, z, 4.1 * scale, 1.5 * scale, 3.9 * scale, palette);
      box(x - .3 * scale, 5.2 * scale, z + .1 * scale, 3.3 * scale, .85 * scale, 3.2 * scale, 0xdfb94b);
      box(x + .25 * scale, 5.84 * scale, z, 2.1 * scale, .49 * scale, 2.4 * scale, 0xe8c765);
      box(x - 1.98 * scale, 3.95 * scale, z + .5 * scale, 1.15 * scale, 1.05 * scale, 1.9 * scale, 0xb98935);
      box(x + 1.85 * scale, 4.17 * scale, z - .3 * scale, 1.17 * scale, .95 * scale, 2.2 * scale, 0xd19b3e);
    }
  }

  function mushroom(x: number, z: number, scale: number) {
    if (!obstacle(x, z, .6 * scale)) return;
    box(x, 1.5 * scale, z, .5 * scale, 3 * scale, .5 * scale, 0x9280a0);
    box(x + .13 * scale, 2.48 * scale, z, .68 * scale, .9 * scale, .62 * scale, 0xad93b6);
    glow(x, 2.93 * scale, z, 2.9 * scale, .11, 2.9 * scale, 0x749fd7);
    box(x, 3.15 * scale, z, 3.3 * scale, .4 * scale, 3.3 * scale, pick([0x8264a4, 0xa26b9e, 0x6a75ad]));
    box(x, 3.55 * scale, z, 2.55 * scale, .41 * scale, 2.6 * scale, 0xab82ba);
    box(x - .1 * scale, 3.89 * scale, z, 1.3 * scale, .27 * scale, 1.5 * scale, 0xc196c7);
    for (const [dx, dz] of [[-.75, -.8], [.6, .45], [.68, -.62]]) glow(x + dx * scale, 3.78 * scale, z + dz * scale, .27 * scale, .08, .27 * scale, 0xd6c1e1);
  }

  function campTent(x: number, z: number, color: number) {
    if (!obstacle(x, z, 2.3)) return;
    for (const side of [-1, 1]) box(x, 1.4, z + side * 1.65, .15, 2.8, .15, 0x785941);
    for (let tier = 0; tier < 7; tier++) {
      const width = 4.15 - tier * .56;
      for (const side of [-1, 1]) box(x + side * width / 2, .48 + tier * .35, z, .58, .39, 3.5, color);
    }
    box(x, .065, z + .2, 3.8, .13, 3.6, 0x8a7250);
    box(x - .8, .22, z + .3, .83, .24, 2.3, 0xa49e68);
    box(x - .8, .4, z -.52, .84, .22, .54, 0xd4c5a1);
    box(x + 1.85, .37, z + 2.08, .65, .74, .8, 0x9b7c4a);
  }

  function arch(x: number, z: number, width: number, height: number, color: number) {
    for (const side of [-1, 1]) {
      const px = x + side * width / 2;
      if (clear(px, z, .7)) colliders.push({ x: px, z, r: .7 });
      box(px, height * .38, z, 1.1, height * .76, 1.35, color);
      box(px - side * .48, height * .79, z, 1.2, .9, 1.35, color);
      box(px - side * 1.03, height * .92, z, 1.15, .78, 1.35, color);
    }
    box(x, height + .13, z, Math.max(1, width - 2.4), .82, 1.35, color);
  }

  // Gates remain walk-through, with their supports outside the three-unit interaction ring.
  for (const { z } of zone.gateways) {
    const color = amber ? 0x89745a : frost ? 0x809caa : 0x746178;
    arch(0, z, 7.9, 5.3, color);
    for (const side of [-1, 1]) {
      glow(side * 3.95, 3.35, z + .71, .18, 1.05, .07, amber ? 0xf0c45f : frost ? 0x90dce5 : 0xbc94de);
      box(side * 3.95, .22, z, 1.5, .44, 1.7, color);
    }
    for (let x = -2.7; x < 3; x += .9) box(x, .04, z, .86, .08, 2.2, color);
  }

  if (amber) {
    // A ruined aqueduct runs along the western forest, with missing spans and fern-covered piers.
    for (const z of [-20, -11, -2, 7, 16]) {
      obstacle(-26, z, 1.2);
      box(-26, 3.15, z, 2.3, 6.3, 2.5, 0x9c9680);
      box(-26, 6.5, z, 2.85, .7, 3.1, 0xb5ac8d);
      box(-26, 6.89, z, 2.96, .12, 3.15, 0x9da34f);
    }
    for (const z of [-15.5, -6.5, 11.5]) {
      for (let step = 0; step < 4; step++) for (const side of [-1, 1]) {
        box(-26, 4.3 + step * .56, z + side * (3.4 - step * .83), 2.4, .82, 1.18, step % 2 ? 0xb0a68a : 0xa39a82);
      }
      box(-26, 6.84, z, 2.7, .8, 7.4, 0xb4a98b);
      for (const side of [-1, 1]) box(-26 + side * 1.08, 7.42, z, .28, .52, 7.5, 0xa89c7e);
    }
    for (let i = 0; i < 11; i++) rock(-25 + (random() - .5) * 5, 2.2 + random() * 5, .7 + random() * .9, false);
    campTent(-6.7, 3.5, 0xb77346);
    campTent(6.6, 10.2, 0xc4a05d);
    // Sable's map table and expedition crates flank the central clearing.
    box(-3.6, 1.04, -.6, 2.15, .19, 1.45, 0x856040);
    box(-3.6, 1.15, -.6, 1.8, .035, 1.22, 0xe4ce9b);
    for (const [dx, dz] of [[-.8, -.5], [.8, -.5], [-.8, .5], [.8, .5]]) box(-3.6 + dx, .54, -.6 + dz, .14, 1.05, .14, 0x745239);
    for (let i = 0; i < 6; i++) box(-4.28 + i * .22, 1.18, -.6 + Math.sin(i) * .25, .15, .027, .12, 0x719066);
    for (const [x, z] of [[20, 17], [21.1, 17.2], [20.6, 18.3]]) box(x, .45, z, .94, .9, .94, 0xa77d44);
    // A collapsed wagon and sunflowers make a second discovery on the eastern trail.
    box(25, .82, -18, 3.5, .34, 2.1, 0x815a38);
    for (const dx of [-1.3, 1.3]) for (const dz of [-1.2, 1.2]) box(25 + dx, .61, -18 + dz, .92, .94, .18, 0x5f4b36);
    for (let i = 0; i < 4; i++) box(23.7 + i * .85, 1.33, -18.9, .15, 1.3, .15, 0x9a713d);
    obstacle(25, -18, 2.2);
    for (let i = 0; i < 18; i++) {
      const x = 20 + random() * 8, z = -23 + random() * 4;
      box(x, .51, z, .08, 1.03, .07, 0x7e8b43);
      box(x, 1.12, z, .5, .37, .13, 0xe7bd48);
      box(x, 1.12, z + .08, .24, .22, .07, 0x7d5934);
    }
    // The Amber Beacon stands directly on its canonical interaction position.
    for (let tier = 0; tier < 3; tier++) box(0, .12 + tier * .2, -12, 3.2 - tier * .5, .25, 3.2 - tier * .5, 0xa69a7e);
    for (const [dx, dz] of [[-.72, -.72], [.72, -.72], [-.72, .72], [.72, .72]]) box(dx, 1.95, -12 + dz, .3, 2.9, .3, 0x9a8356);
    box(0, 3.45, -12, 2.05, .35, 2.05, 0xc1a165);
    beacon(0, 2.2, -12, .73, 1.65, .73, 0xf0bd4f, Math.PI / 4);
    beacon(0, 3.92, -12, .52, .57, .52, 0xf6d985, Math.PI / 4);
    beacon(.18, 4.53, -12, .27, .49, .28, 0xffe8a2, Math.PI / 4);
  } else if (frost) {
    // The lake is frozen and walkable: a blue mosaic, cracks, and a low stone crossing.
    for (let x = -33; x < -4; x += 2) for (let z = -13; z < 23; z += 2) {
      if (Math.hypot((x + 19) / 15, (z - 4) / 19) > 1) continue;
      box(x, .021, z, 2.02, .04, 2.02, pick([0x79aebf, 0x84b9c8, 0x91c1cd, 0x9ec9d2]));
      if (random() > .8) glow(x, .045, z, 1.9, .013, .048, 0xb7e0e6, random() * 1.4);
    }
    for (let x = -32; x <= -5; x += 1.45) box(x, .09, 6, 1.38, .18, 2.55, pick([0xb1c1c6, 0xbfcfd1, 0xccdbdb]));
    for (let x = -31; x < -5; x += 4.5) for (const side of [-1, 1]) {
      box(x, .5, 6 + side * 1.37, .4, 1, .4, 0x8ba2ad);
      box(x, 1.04, 6 + side * 1.37, .55, .16, .55, 0xe4ece8);
    }
    // Observatory remains: an open court, partial columns and a broken armillary dome.
    const ox = -16, oz = -21;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, x = ox + Math.sin(a) * 6.2, z = oz + Math.cos(a) * 6.2;
      box(x, .13, z, 2.5, .26, 2.5, 0xa7bac0);
      const h = [5.5, 7.4, 2.6, 0, 0, 3.2, 7.1, 6.5, 0, 4.4, 7.2, 5.2][i];
      if (!h || !obstacle(x, z, .78)) continue;
      box(x, h / 2, z, 1.08, h, 1.1, 0x91a9b5);
      box(x, h + .17, z, 1.5, .34, 1.5, 0xdeebe9);
    }
    for (let i = 0; i < 17; i++) {
      const a = i / 18 * Math.PI, x = ox + Math.cos(a) * 5.4, y = 5.8 + Math.sin(a) * 4;
      if (i > 7 && i < 11) continue;
      box(x, y, oz - 1.8, .8, .8, .7, 0x7698a9);
      box(ox - 1.2, y - .6, oz + Math.cos(a) * 5.1, .7, .72, .82, 0xaac2cb);
    }
    box(ox, 1.5, oz, .7, 3, .7, 0x8aa4b0);
    for (let i = 0; i < 5; i++) box(ox, 2.8 + i * .25, oz - 1.8 + i * .73, .85 + i * .1, .88 + i * .1, .94, i % 2 ? 0xb1cbd0 : 0x8cabb7);
    glow(ox, 3.83, oz + 1.43, 1.05, 1.06, .055, 0x7ba7cf);
    // Iona's expedition instruments and a small weather shelter.
    campTent(6.4, 13.2, 0x7095ad);
    box(-4.2, 1.02, -.7, 1.7, .2, 1.45, 0x81989f);
    box(-4.2, .53, -.7, .23, 1.05, .23, 0x627b89);
    glow(-4.2, 1.26, -.7, .58, .31, .58, 0x9bcbdc, Math.PI / 4);
    // Eastern ice spires form an exploration landmark beyond the main battlefield.
    for (let i = 0; i < 9; i++) {
      const x = 24 + Math.sin(i * 1.8) * 5, z = -21 + Math.cos(i * 1.7) * 5, h = 2.8 + random() * 4;
      if (!obstacle(x, z, 1.0)) continue;
      box(x, h / 2, z, 1.3, h, 1.4, pick([0x90becf, 0xa0cede, 0xb2d8e1]), Math.PI / 4);
      box(x, h + .35, z, .82, .7, .85, 0xc4e3e8, Math.PI / 4);
    }
    for (let tier = 0; tier < 3; tier++) box(0, .12 + tier * .23, -12, 3.4 - tier * .55, .28, 3.4 - tier * .55, 0xb9cbd0);
    box(0, 1.46, -12, 1.3, 1.6, 1.3, 0x789ba9);
    for (const side of [-1, 1]) box(side * 1.07, 2.25, -12, .38, 3, .48, 0x96bcc8);
    beacon(0, 2.78, -12, .88, 1.65, .88, 0x9addf0, Math.PI / 4);
    beacon(0, 4.3, -12, .44, .6, .44, 0xc8f1f6, Math.PI / 4);
    box(0, 3.83, -12, 1.65, .2, 1.65, 0xd3e8e9);
  } else {
    // The Worldheart arena is level and spacious; the broken shrine sits behind the boss.
    for (let x = -12; x <= 12; x += 1.2) for (let z = -24; z <= 0; z += 1.2) {
      const r = Math.hypot(x, z + 12);
      if (r < 11.8) box(x, .025, z, 1.16, .05, 1.16, r > 9.8 ? 0x82728c : pick([0x62536f, 0x675773, 0x6d5d79]));
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, x = Math.sin(a) * 11, z = -12 + Math.cos(a) * 11;
      if (Math.abs(x) < 3.2 || !obstacle(x, z, .72)) continue;
      const h = 1.5 + random() * 2.3;
      box(x, h / 2, z, .9, h, .95, 0x746382);
      glow(x, h + .16, z, .55, .32, .55, 0xc4a3dd, Math.PI / 4);
    }
    // Fractured Worldheart: the arch has an obvious missing keystone.
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 6; tier++) box(side * (3.8 - tier * .35), .6 + tier * .83, -23, 1.2, 1.1, 1.7, tier % 2 ? 0x80718d : 0x6d5e7f);
      box(side * 1.4, 5.3, -23, .75, .85, 1.1, 0x9983a3, side * .19);
      glow(side * 2.08, 3.9, -22.11, .13, 1.3, .1, 0xc492df);
    }
    glow(0, .055, -12, 1.05, .08, 5.5, 0x956bb7, .36);
    glow(0, .056, -12, 6.4, .08, .46, 0x9872bd, -.28);
    for (const a of [.52, 1.8, 3.15, 4.5]) for (let step = 0; step < 13; step++) {
      const r = 4 + step * 1.12;
      glow(Math.sin(a + Math.sin(step) * .045) * r, .047, -12 + Math.cos(a) * r, .2, .055, 1.2, 0x776aa5, -a);
    }
    // Eris's refuge and the side grotto contain a small library and glowing fungi.
    box(-5.1, 1.2, 3.1, 2.25, 2.4, .63, 0x6b5069);
    for (const y of [.25, 1.1, 1.95]) {
      box(-5.1, y, 3.5, 2.5, .12, .9, 0x987384);
      for (let i = 0; i < 7; i++) box(-6.02 + i * .29, y + .31, 3.4, .2, .48 + random() * .15, .52, pick([0x99757a, 0x687b8d, 0xb18d77]));
    }
    for (const [x, z, s] of [[-23, 10, 1.6], [-28, 2, 2], [-22, -19, 1.8], [27, -10, 1.9], [24, 17, 1.8], [31, 5, 1.3]]) mushroom(x, z, s);
    // Vast stepped roots cling to the walls and curve over the rear shrine, above traversal.
    for (const side of [-1, 1]) for (const z of [-27, -6, 16]) {
      for (let step = 0; step < 12; step++) {
        const x = side * (39 - step * .94), y = .7 + Math.sin(step / 11 * Math.PI * .68) * 10;
        box(x, y, z + Math.sin(step * .32) * 2, 2.3 - step * .055, 2.1, 2.3, step % 2 ? 0x64506e : 0x715976);
      }
    }
    for (let step = 0; step < 24; step++) {
      const x = -34 + step * 2.9, y = 13.8 + Math.sin(step / 23 * Math.PI) * 3.2;
      box(x, y, -32.5 + Math.sin(step * .6), 3.25, 1.3, 1.8, 0x695271);
    }
  }

  // The perimeter changes form as well as palette: autumn woods, snowy pines, enclosed root caves.
  for (let i = 0; i < 350; i++) {
    const x = (random() - .5) * 87, z = (random() - .5) * 86;
    if (onPath(x, z) || (x > -9 && x < 22 && z > 15 && z < 44)) continue;
    if (amber && ((x > -31 && x < -21 && z > -25 && z < 21) || Math.hypot(x + 3, z - 4) < 9)) continue;
    if (!amber && !frost && Math.hypot(x, z + 12) < 16) continue;
    if (frost && Math.hypot((x + 19) / 17, (z - 4) / 21) < 1) continue;
    if (frost && (Math.hypot(x + 16, z + 21) < 9 || Math.hypot(x - 24, z + 21) < 9)) continue;
    if (amber || frost) tree(x, z, .85 + random() * .43);
    else if (i % 3 === 0) mushroom(x, z, .7 + random() * .7);
    if (colliders.length > 112) break;
  }
  for (let i = 0; i < 32; i++) {
    const x = (random() - .5) * 73, z = (random() - .5) * 74;
    if (!onPath(x, z) && (amber || frost || Math.hypot(x, z + 12) > 15)) rock(x, z, .8 + random() * 1.2);
  }
  for (let i = 0; i < 780; i++) {
    const x = (random() - .5) * 78, z = (random() - .5) * 78;
    if (onPath(x, z) || !clear(x, z, 0)) continue;
    if (amber) {
      box(x, .035, z, .22 + random() * .3, .035, .18 + random() * .2, pick([0xcd973d, 0xdeaa47, 0xb57036, 0xdbc16a]), random());
      if (i % 6 === 0) { box(x, .24, z, .055, .48, .055, 0x777d3b); box(x, .52, z, .18, .1, .18, 0xe6c762); }
    } else if (frost) {
      if (i % 3 === 0) box(x, .2, z, .1, .4, .1, 0x91b4c1);
      else box(x, .05, z, .4 + random() * .4, .1, .42, 0xe3eeeb);
    } else {
      const h = .15 + random() * .38;
      box(x, h / 2, z, .09, h, .1, 0x827494);
      glow(x, h + .05, z, .25, .12, .26, pick([0x86a6cb, 0xaf8bd0, 0xb993bd]));
    }
  }

  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * Math.PI * 2;
    if (amber || frost) {
      const radius = 72 + random() * 12, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      for (let tier = 0; tier < 7; tier++) {
        const width = 21 - tier * 2.4, h = frost ? 2.1 : 1.2;
        box(x + Math.sin(tier * 1.1) * 1.4, (tier + .5) * h -.6, z, width, h, width, frost ? 0x8faab8 : 0x969b69);
        box(x + Math.sin(tier * 1.1) * 1.4, (tier + 1) * h -.54, z, width + .08, .23, width + .08, frost ? 0xd6e6e7 : 0xafaa5c);
      }
    } else {
      const radius = 49 / Math.max(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle)));
      const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      const h = 12 + random() * 8;
      for (let tier = 0; tier < 4; tier++) box(x, h * .12 + tier * h * .24, z, 15 - tier * 1.65, h * .27, 15 - tier * 1.65, pick([0x54495f, 0x5c4c67, 0x624f6b]));
      if (i % 2 === 0) glow(x * .83, 3.2, z * .83, .7, 3.3, .7, 0x8d80ba, Math.PI / 4);
    }
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1), temp = new THREE.Object3D(), color = new THREE.Color();
  function batch(voxels: Voxel[], material: THREE.Material, name: string, shadow: boolean) {
    const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);
    mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = shadow;
    voxels.forEach(([x, y, z, w, h, d, hex, rotation], i) => {
      temp.position.set(x, y, z); temp.scale.set(w, h, d); temp.rotation.set(0, rotation, 0); temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix); mesh.setColorAt(i, color.setHex(hex));
    });
    mesh.computeBoundingSphere(); group.add(mesh);
    return mesh;
  }
  batch(solids, new THREE.MeshStandardMaterial({ roughness: .93 }), `${zoneId}: terrain and landmarks`, true);
  const emissiveMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  batch(glowing, emissiveMaterial, `${zoneId}: luminous details`, false);
  const beaconMesh = beaconVoxels.length ? batch(beaconVoxels, emissiveMaterial, `${zoneId}: beacon light`, false) : undefined;
  if (beaconMesh) beaconMesh.visible = false;
  if(beaconMesh&&zone.beacon)emitters.push({position:new THREE.Vector3(zone.beacon.x,2.8,zone.beacon.z),color:frost?0xa9eafa:amber?0xffcd68:0xd1a5f0,scale:1.6,source:beaconMesh});
  const particles = Array.from({ length: frost ? 110 : 56 }, () => ({ x: (random() - .5) * 68, y: random() * 18, z: (random() - .5) * 68, phase: random() * Math.PI * 2 }));
  const particleMesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: amber ? 0xf2ca67 : frost ? 0xe7f5f1 : 0xc5a9e2, transparent: true, opacity: frost ? .7 : .8 }), particles.length);
  particleMesh.name = `${zoneId}: drifting ${amber ? 'leaves' : frost ? 'snow' : 'spores'}`;
  particleMesh.frustumCulled = false;
  group.add(particleMesh);
  scene.add(group);
  const environment = createEnvironmentLights(group,emitters);
  let disposed = false;
  return {
    colliders,
    setBeaconLit: beaconMesh ? (lit: boolean) => { if (!disposed) beaconMesh.visible = lit; } : undefined,
    dispose() { if (!disposed) { disposed = true; environment.dispose(); disposeWorldGroup(group); } },
    update(time: number,observer?:THREE.Vector3,camera?:THREE.Camera) {
      if (disposed) return;
      environment.update(time,observer,camera);
      if (beaconMesh?.visible) beaconMesh.scale.y = 1 + Math.sin(time * 2.3) * .025;
      particles.forEach((p, i) => {
        const y = amber || frost ? 1 + ((p.y - time * (frost ? .85 : .45)) % 18 + 18) % 18 : .7 + p.y * .32 + Math.sin(time * .5 + p.phase) * .5;
        temp.position.set(p.x + Math.sin(time * .3 + p.phase) * .65, y, p.z + Math.cos(time * .27 + p.phase) * .6);
        temp.scale.set(amber ? .16 : .075, amber ? .045 : .075, amber ? .1 : .075);
        temp.rotation.set(amber ? time + p.phase : 0, time * .24 + p.phase, 0); temp.updateMatrix();
        particleMesh.setMatrixAt(i, temp.matrix);
      });
      particleMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
