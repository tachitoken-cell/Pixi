import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Only browser I/O is adapted: the real loader parses the authored GLBs, and all
// world geometry, materials, transforms and lifecycle code run unchanged.
const originalFetch = globalThis.fetch, originalDocument = globalThis.document, originalProgressEvent = globalThis.ProgressEvent;
const requested = [];
THREE.DefaultLoadingManager.setURLModifier(path => new URL(path, 'http://raid-check.local').href);
globalThis.fetch = async request => {
  const url = new URL(typeof request === 'string' ? request : request.url);
  assert.equal(url.origin, 'http://raid-check.local');
  assert(['/models/apostle-spells.glb', '/models/raid-props.glb', '/models/raid-sanctum.glb', '/models/raid-approach-rooms.glb'].includes(url.pathname), 'load only the real local raid assets');
  requested.push(url.pathname);
  return new Response(readFileSync(new URL(`../public${url.pathname}`, import.meta.url)), { headers: { 'content-type': 'model/gltf-binary' } });
};
globalThis.ProgressEvent = class extends Event { constructor(type, values) { super(type); Object.assign(this, values); } };
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  // Text rasterization is checked in the browser suite, not this scene-graph check.
  return { width: 0, height: 0, getContext: () => ({ fillText() {} }) };
} };
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { createRaidWorld, raidSafeGap, raidHazardGeometry, makeRaidMechanicModel } = await import('../src/raid-world.ts');
const { RAID_COLLIDERS, raidHazardContains } = await import('../src/raid.ts');
const { graphics, GRAPHICS_PRESETS } = await import('../src/graphics-settings.ts');
const {setRaidAssets,animateMonsterModel}=await import('../src/monster-models.ts');
hook.deregister();
const bossBytes=readFileSync(new URL('../public/models/horned-apostle.glb',import.meta.url));
const bossAsset=await new GLTFLoader().parseAsync(bossBytes.buffer.slice(bossBytes.byteOffset,bossBytes.byteOffset+bossBytes.byteLength),'');
setRaidAssets(bossAsset.scene,bossAsset.animations);
const guardian=makeRaidMechanicModel({raidVisual:'guardian'});
assert.equal(guardian.userData.enemyRig.kind,'apostle-clone');assert.equal(guardian.getObjectByName('apostle-clone-halo').visible,false);
assert(animateMonsterModel(guardian,1,true),'Void Guardian retains authored movement animation');
const savedGraphics = { ...graphics }, savedColliders = structuredClone(RAID_COLLIDERS);
const base = { id: 'raid-world-check', leaderId: 'a', phase: 'wings', members: ['a', 'b'].map(id => ({ id, plane: 'arena' })), plane: 'arena', lockedSize: 10,
  startedAt: 1000, phaseEndsAt: 0, enrageEndsAt: 0, wipes: 0, bossId: 'boss', bossHp: 100, bossMaxHp: 100,
  objective: '', hazards: [], chains: [], guardiansKilled: 0, crystalsRemaining: 0, seals: [] };
const hazard = (id, kind = 'Death Palm', fields = {}) => ({ id, kind, label: kind, plane: 'arena', shape: 'circle', x: 0, z: 0, r: 6,
  startedAt: 1000, impactAt: 4500, endsAt: 5100, ...fields });
const find = (root, predicate) => { const all = []; root.traverse(node => { if (predicate(node)) all.push(node); }); return all; };
const tells = root => find(root, node => !!node.userData.hazard);
const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };
const snapshots = root => find(root, node => node.isInstancedMesh).map(mesh => {
  assert(mesh.count >= 0 && mesh.count <= mesh.instanceMatrix.count, 'instance counts fit their fixed allocation');
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); assert(matrix.elements.every(Number.isFinite), 'instance transforms stay finite'); }
  return [mesh, mesh.geometry, mesh.instanceMatrix.count];
});
const radiance = tell => {
  const group = tell.getObjectByName('Void radiance'); assert(group?.userData.raidVfx, 'damage tells own cosmetic radiance');
  const sparks = group.getObjectByName('Void sparks'), streaks = group.getObjectByName('Void streaks');
  const glow = group.getObjectByName('Void glow'), waves = group.getObjectByName('Void shockwaves');
  assert(sparks?.isPoints && streaks?.isLineSegments && glow?.isSprite && waves?.isInstancedMesh);
  return { group, sparks, streaks, glow, waves };
};
const vfxAllocation = effect => [effect.group, ...[effect.sparks, effect.streaks, effect.glow, effect.waves].flatMap(node =>
  [node, node.geometry, node.material, ...Object.values(node.geometry.attributes).flatMap(attribute => [attribute, attribute.array]),
    ...(node.isInstancedMesh ? [node.instanceMatrix, node.instanceMatrix.array] : [])])];
const sameAllocation = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((resource, i) => assert.equal(resource, expected[i], 'updates reuse the exact VFX objects and GPU buffers'));
};
const vfxFrame = effect => ({
  buffers: [effect.sparks, effect.streaks].map(node => Object.values(node.geometry.attributes).map(attribute => Array.from(attribute.array))),
  counts: [effect.sparks.geometry.drawRange.count, effect.streaks.geometry.drawRange.count, effect.waves.count],
  waves: Array.from(effect.waves.instanceMatrix.array.subarray(0, effect.waves.count * 16)),
  glow: [...effect.glow.position, ...effect.glow.scale, effect.glow.material.opacity],
});
const finiteVfx = effect => {
  for (const node of [effect.sparks, effect.streaks]) {
    assert(Number.isInteger(node.geometry.drawRange.count) && node.geometry.drawRange.count >= 0);
    assert(node.geometry.drawRange.count <= node.geometry.attributes.position.count);
    for (const attribute of Object.values(node.geometry.attributes)) assert(attribute.array.every(Number.isFinite), 'particle buffers stay finite');
  }
  assert(effect.sparks.geometry.attributes.position.count <= 96, 'each cast stays within its particle budget');
  assert(effect.streaks.geometry.attributes.position.count <= 192, 'trails stay within the matching segment budget');
  snapshots(effect.group);
};
let world;
try {
  const scene = new THREE.Scene(); world = await createRaidWorld(scene); const root = scene.children[0];
  assert.equal(world.colliders, RAID_COLLIDERS); assert.deepEqual(RAID_COLLIDERS, savedColliders);
  assert.deepEqual(requested.sort(), ['/models/apostle-spells.glb', '/models/raid-approach-rooms.glb', '/models/raid-props.glb', '/models/raid-sanctum.glb']);
  const shared = new Set();
  for (const name of ['raid-sanctum', 'raid-sun', ...Array.from({length:7},(_,i)=>`raid-chamber-${i}`)]) {
    const authored = root.getObjectByName(name); assert(authored, `${name} is mounted`);
    authored.traverse(node => { if (node.isMesh) shared.add(node.geometry); });
  }
  const birthPortal=root.getObjectByName('Apostle emergence portal');assert(birthPortal);
  root.updateMatrixWorld(true);
  const groundRune=root.getObjectByName('apostle-spell-rune-ring'),runeSize=new THREE.Box3().setFromObject(groundRune,true).getSize(new THREE.Vector3());
  assert(runeSize.y<Math.max(runeSize.x,runeSize.z)*.06,'upright source rune is attached flat to the arena floor');
  world.setRaidState({...base,chains:[{id:'sized-chain',firstId:'a',secondId:'b',endsAt:9000,breakDistance:14}]},2000,[{id:'a',x:-4,z:0},{id:'b',x:4,z:0}]);world.update(0);root.updateMatrixWorld(true);
  const chainLink=root.getObjectByName('Soul chain'),linkMatrix=new THREE.Matrix4();chainLink.getMatrixAt(0,linkMatrix);linkMatrix.premultiply(chainLink.matrixWorld);
  const linkBounds=chainLink.geometry.boundingBox?.clone()||new THREE.Box3().setFromBufferAttribute(chainLink.geometry.attributes.position);
  assert(linkBounds.applyMatrix4(linkMatrix).getSize(new THREE.Vector3()).length()<1,'viewer-sized chain links retain the established sub-metre attachment size');

  world.setRaidState({...base,phase:'sermon',bossSpawnedAt:1000},1500,[]);world.update(0);assert(birthPortal.visible,'new supplied black hole accompanies authoritative boss emergence');
  world.setRaidState({...base,phase:'sermon',bossSpawnedAt:1000},4000,[]);world.update(0);assert(!birthPortal.visible,'late snapshots do not replay the spawn portal');
  world.setRaidState(null,4000,[]);assert(!birthPortal.visible);
  let sharedDisposals = 0; for (const geometry of shared) geometry.addEventListener('dispose', () => sharedDisposals++);
  const step = (hazards, now = 2000, changes = {}, players = []) => {
    world.setRaidState({ ...base, hazards, ...changes }, now, players); world.update(0);
  };
  // Each checkpoint mounts only its authored chamber, with a readable locked/clear exit.
  Object.assign(graphics, GRAPHICS_PRESETS.high);
  for(let roomIndex=0;roomIndex<8;roomIndex++){
    const approach={roomIndex,roomName:'Test chamber',remaining:4,cleared:false,totalRooms:8,exit:{x:0,z:-27}};
    step([],2000,{phase:roomIndex<6?'approach':roomIndex===6?'morgrath':'sermon',approach});
    const rooms=find(root,node=>/^raid-chamber-\d$|^raid-sanctum$/.test(node.name));
    assert.equal(rooms.filter(visible).length,1,'only the current room is drawn');
    assert(visible(root.getObjectByName(roomIndex<7?`raid-chamber-${roomIndex}`:'raid-sanctum')));
    assert.equal(visible(root.getObjectByName('Sealed chamber gate')),roomIndex<7);
    assert(!visible(root.getObjectByName('Chamber exit glow')));
    step([],2000,{approach:{...approach,remaining:0,cleared:true}});
    assert(!visible(root.getObjectByName('Sealed chamber gate')));
    assert.equal(visible(root.getObjectByName('Chamber exit glow')),roomIndex<7);
    graphics.effects='off';step([],2000,{approach:{...approach,remaining:0,cleared:true}});
    assert(!visible(root.getObjectByName('Chamber exit glow')));
    assert.equal(visible(root.getObjectByName('Chamber exit')),roomIndex<7,'essential exit survives Effects Off');
    Object.assign(graphics,GRAPHICS_PRESETS.high);
  }
  const environmentMaterials=new Set(find(root.getObjectByName('raid-sanctum'),node=>node.isMesh).flatMap(node=>Array.isArray(node.material)?node.material:[node.material]));
  const authoredEmission=[...environmentMaterials].map(material=>material.emissiveIntensity);
  const palm = hazard('palm'); step([palm]);
  assert.deepEqual([...environmentMaterials].map(material=>material.emissiveIntensity),authoredEmission,'normal plane retains authored emission strengths');
  const first = tells(root)[0], geometry = first.geometry, hand = first.getObjectByName('Spectral hand');
  const effectTexture = radiance(first).glow.material.map; let textureDisposals = 0;
  effectTexture.addEventListener('dispose', () => textureDisposals++);
  assert(hand, 'Palm uses the detailed authored hand');
  assert(find(hand,node=>node.isMesh&&node.userData.raidSharedGeometry).length>=1,'Palm renders Blender geometry');
  for(const node of find(hand,node=>node.isMesh)){shared.add(node.geometry);node.geometry.addEventListener('dispose',()=>sharedDisposals++);}
  const forward = { ...palm, x: 8, z: -3 }; step([forward], 3000);
  assert.equal(tells(root)[0], first, 'moving Palm retains its ID-owned mesh'); assert.equal(first.geometry, geometry, 'movement does not allocate new hit geometry');
  assert.deepEqual([first.position.x, first.position.z], [8, -3]);
  const shifted = { ...forward, startedAt: 2800, impactAt: 4800, endsAt: 5400 }; step([shifted], 3000);
  assert.equal(tells(root)[0], first, 'timing-only updates retain geometry');
  assert.equal(first.userData.hazard, shifted, 'timing uses the current authoritative object');
  assert(Math.abs(first.getObjectByName('Spell · Death Palm').userData.progress - .1) < 1e-9);
  step([{ ...shifted, r: 9 }], 3000);
  assert.notEqual(tells(root)[0].geometry, geometry, 'same-ID dimension changes rebuild the hit footprint');
  assert.equal(tells(root)[0].userData.hazard.r, 9);
  const lane = hazard('lane', 'Shadow Wings', { shape: 'line', width: 7, length: 64, rotation: .4 }); step([lane]);
  const oldLane = tells(root)[0].geometry;
  step([{ ...lane, width: 10, length: 40, rotation: 1.2 }]); assert.notEqual(tells(root)[0].geometry, oldLane);
  step([forward], 3000); const rewound = tells(root)[0];
  step([palm], 1500); assert.equal(tells(root)[0], rewound); assert.deepEqual([rewound.position.x, rewound.position.z], [0, 0]);
  assert.equal(rewound.getObjectByName('Spell · Death Palm').userData.stage, 'windup', 'seeking backwards restores windup');
  step([palm], 900); assert.equal(tells(root).length, 0, 'future cues disappear on rewind');
  step([palm], palm.endsAt); assert.equal(tells(root).length, 0, 'expired hazards leave no cue');
  step([palm]); step([]); assert.equal(tells(root).length, 0, 'interruption removes the cue immediately');
  step([palm]); step([palm], 2000, { plane: 'shadow' }); assert.equal(tells(root).length, 0, 'other-plane hazards disappear');

  // Derive the gap from the same four cones the server emits, including angles
  // straddling zero. Check every half-degree against authoritative hit tests.
  for (const degrees of [28, 10]) for (const turn of [.17, 5.9]) {
    const gapAngle = degrees * Math.PI / 180, width = (Math.PI * 2 - gapAngle) / 4;
    const hands = Array.from({ length: 4 }, (_, i) => hazard(`hand-${i}`, 'Four Hands of Judgment', {
      shape: 'cone', r: 50, angle: width, rotation: turn + gapAngle / 2 + width * (i + .5) }));
    const safe = raidSafeGap(hands); assert(safe?.safe); assert(Math.abs(safe.angle - gapAngle) < 1e-9);
    const mesh = new THREE.Mesh(raidHazardGeometry(safe), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    for (let i = 0; i < 720; i++) {
      const angle = i * Math.PI / 360, point = { x: Math.sin(angle) * 20, z: Math.cos(angle) * 20 };
      assert.equal(raidHazardContains(safe, point), !hands.some(h => raidHazardContains(h, point)), `${degrees}° safe gap complements the damage cones`);
      ray.set(new THREE.Vector3(point.x, 5, point.z), new THREE.Vector3(0, -1, 0));
      assert.equal(ray.intersectObject(mesh).length > 0, raidHazardContains(safe, point), 'safe gap mesh matches its actual footprint');
    }
    mesh.geometry.dispose(); mesh.material.dispose();
    step(hands); assert.equal(tells(root).filter(mesh => mesh.userData.hazard.safe).length, 1, 'exactly one safe gap is drawn');
    assert(!tells(root).find(mesh => mesh.userData.hazard.safe).getObjectByName('Void radiance'), 'safe gaps never gain damage effects');
    Object.assign(graphics, GRAPHICS_PRESETS.high); step(hands, 4800); root.updateMatrixWorld(true);
    const instance = new THREE.Matrix4(), transform = new THREE.Matrix4(), vertex = new THREE.Vector3();
    for (const tell of tells(root).filter(mesh => !mesh.userData.hazard.safe)) {
      const h = tell.userData.hazard, waves = radiance(tell).waves;
      assert(waves.count > 0, 'Four Hands has impact shockwaves');
      for (let i = 0; i < waves.count; i++) {
        waves.getMatrixAt(i, instance); transform.multiplyMatrices(waves.matrixWorld, instance);
        for (let j = 0; j < waves.geometry.attributes.position.count; j++) {
          vertex.fromBufferAttribute(waves.geometry.attributes.position, j).applyMatrix4(transform);
          // Float32 boundary vertices can round just outside the exact angular edge.
          assert(raidHazardContains({ ...h, angle: h.angle + 1e-6, r: h.r + 1e-5 }, vertex), 'impact arcs stay inside the authoritative cone');
          assert(!raidHazardContains({ ...safe, angle: safe.angle - 1e-6 }, vertex), 'impact arcs do not cover the Four Hands safe gap');
        }
      }
    }
  }

  // Exercise one cast across server-clock seeks, moving targets and every graphics
  // setting. Its buffers must remain stable, and its owned resources retire once.
  Object.assign(graphics, GRAPHICS_PRESETS.high);
  const effectPalm = hazard('effect-palm'); step([effectPalm], 2500);
  const effect = radiance(tells(root)[0]), effectAllocation = vfxAllocation(effect), windup = vfxFrame(effect);
  assert.equal(effect.glow.material.map, effectTexture); assert.equal(effect.sparks.material.map, effectTexture);
  const owned = new Set([effect.sparks.geometry, effect.streaks.geometry, effect.waves.geometry,
    effect.sparks.material, effect.streaks.material, effect.glow.material, effect.waves.material, effect.waves]);
  const disposals = new Map([...owned].map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  let spriteGeometryDisposals = 0; effect.glow.geometry.addEventListener('dispose', () => spriteGeometryDisposals++);
  assert.equal(effect.waves.count, 0, 'Palm shockwaves wait for impact');
  step([effectPalm], effectPalm.impactAt + 200); assert(effect.waves.count > 0, 'impact produces shockwaves even after a coarse snapshot jump'); finiteVfx(effect);
  const impact = vfxFrame(effect);
  step([effectPalm], 2500); assert.deepEqual(vfxFrame(effect), windup, 'rewinding exactly reproduces particle and trail data');
  step([{ ...effectPalm, x: 12, z: -7 }], 2500);
  assert.deepEqual(vfxFrame(effect), windup, 'moving a target preserves local clock-driven paths');
  assert.deepEqual([effect.group.parent.parent.position.x, effect.group.parent.parent.position.z], [12, -7]);
  step([{ ...effectPalm, startedAt: 11000, impactAt: 14500, endsAt: 15100 }], 12500);
  assert.deepEqual(vfxFrame(effect), windup, 'same-ID timing corrections use the current authoritative clock');
  step([effectPalm], 4700); assert.deepEqual(vfxFrame(effect), impact, 'replaying impact exactly reproduces active shockwave transforms');
  const highParticles = effect.sparks.geometry.drawRange.count;
  graphics.bloom = false; step([effectPalm], 4700);
  assert(!visible(effect.glow)); assert(visible(effect.sparks) && effect.sparks.geometry.drawRange.count === highParticles, 'bloom preference leaves particles active');
  graphics.effects = 'low'; step([effectPalm], 4700);
  assert(effect.sparks.geometry.drawRange.count > 0 && effect.sparks.geometry.drawRange.count < highParticles, 'Low reduces cosmetic particle density');
  graphics.effects = 'off'; step([effectPalm], 4700);
  assert(!visible(effect.group)); assert.deepEqual([effect.sparks.geometry.drawRange.count, effect.streaks.geometry.drawRange.count, effect.waves.count], [0, 0, 0]);
  Object.assign(graphics, GRAPHICS_PRESETS.high); step([effectPalm], 2500);
  assert.deepEqual(vfxFrame(effect), windup, 'restoring High reproduces the same frame');
  sameAllocation(vfxAllocation(effect), effectAllocation);
  assert([...disposals.values()].every(count => count === 0));
  step([]); assert([...disposals.values()].every(count => count === 1), 'cancelling a cast disposes each owned Points, Sprite and instanced resource once');
  assert.equal(spriteGeometryDisposals, 0, 'Three.js shared Sprite geometry survives cast cleanup');
  assert.equal(textureDisposals, 0, 'cast cleanup preserves the world-shared glow texture');

  // Morgrath's annular rupture leaves its central refuge free of impact effects.
  const rupture=hazard('morgrath-ring','Morgrath Rupture',{sourceId:'morgrath',shape:'ring',r:100,innerR:7});
  step([rupture],2000);const ringEffect=radiance(tells(root)[0]),ringAllocation=vfxAllocation(ringEffect),ringFrame=vfxFrame(ringEffect);
  for(const now of [2000,4500,4550,4800,5000]){
    step([rupture],now);root.updateMatrixWorld(true);finiteVfx(ringEffect);
    assert(!visible(ringEffect.glow),'no central damage glow covers the safe refuge');
    for(const node of [ringEffect.sparks,ringEffect.streaks])for(let i=0;i<node.geometry.drawRange.count;i++){
      const p=node.geometry.attributes.position;assert(Math.hypot(p.getX(i),p.getZ(i))>=rupture.innerR,'particles and tails stay outside the safe circle');
    }
    const matrix=new THREE.Matrix4(),vertex=new THREE.Vector3();
    for(let i=0;i<ringEffect.waves.count;i++){
      ringEffect.waves.getMatrixAt(i,matrix);
      for(let j=0;j<ringEffect.waves.geometry.attributes.position.count;j++){
        vertex.fromBufferAttribute(ringEffect.waves.geometry.attributes.position,j).applyMatrix4(matrix);
        const radius=Math.hypot(vertex.x,vertex.z);assert(radius>=rupture.innerR&&radius<=rupture.r,'shockwave geometry stays inside the actual annulus');
      }
    }
    sameAllocation(vfxAllocation(ringEffect),ringAllocation);
  }
  step([rupture],2000);assert.deepEqual(vfxFrame(ringEffect),ringFrame,'approach VFX rewind is deterministic');
  for(const effects of ['low','off']){
    graphics.effects=effects;step([rupture],4600);
    assert(visible(tells(root)[0].children.find(node=>node.isLineSegments)),'annular boundary remains visible');
    assert(find(tells(root)[0],node=>node.isInstancedMesh&&node.userData.raidSharedGeometry).some(visible),'Blender spell silhouettes survive quality changes');
  }
  Object.assign(graphics,GRAPHICS_PRESETS.high);step([]);assert.equal(tells(root).length,0,'source death removes its spell immediately');

  // Harvest is a sustained inward channel rather than a short impact flash.
  const harvest = hazard('effect-harvest', 'Soul Harvest', { r: 50, impactAt: 3500, endsAt: 9500 });
  step([harvest], 2000); const harvestEffect = radiance(tells(root)[0]);
  assert(harvestEffect.waves.count > 0, 'Harvest can draw its inward channel during windup');
  const radius = new THREE.Vector3(), matrix = new THREE.Matrix4();
  const waveRadius = () => { harvestEffect.waves.getMatrixAt(0, matrix); radius.setFromMatrixScale(matrix); return radius.x; };
  step([harvest], 6000); const outerRadius = waveRadius();
  step([harvest], 6050); assert(waveRadius() < outerRadius, 'Harvest shockwaves travel inward during the channel');
  assert(harvestEffect.waves.count > 0 && visible(harvestEffect.sparks), 'Harvest remains active well beyond ordinary impact recovery'); finiteVfx(harvestEffect);
  step([harvest], harvest.endsAt); assert.equal(tells(root).length, 0);

  // The largest simultaneous Star volley keeps a fixed, finite allocation through
  // impact and all quality changes; no frame-by-frame GPU object churn is allowed.
  const stars = Array.from({ length: 12 }, (_, i) => hazard(`volley-${i}`, 'Death Star', { x: i % 4 * 8 - 12, z: Math.floor(i / 4) * 8 - 8, r: 3.4, impactAt: 3000, endsAt: 3600 }));
  step(stars, 2500); const volley = tells(root).map(radiance), volleyAllocation = volley.map(vfxAllocation);
  assert.equal(volley.length, 12); assert(volley.every(effect => effect.glow.material.map === effectTexture));
  for (const [now, effects] of [[3050, 'high'], [3300, 'low'], [3400, 'off'], [2500, 'high']]) {
    graphics.effects = effects; step(stars, now);
    volley.forEach((effect, i) => sameAllocation(vfxAllocation(effect), volleyAllocation[i]));
    volley.forEach(finiteVfx);
    assert(volley.reduce((sum, effect) => sum + effect.sparks.geometry.drawRange.count, 0) <= 12 * 96);
  }
  step(stars, 3600); assert.equal(tells(root).length, 0, 'the complete Star volley retires at its server deadline');

  const kinds = ['Black Claw', 'Death Star', 'Death Palm', 'Four Hands of Judgment', 'Shadow Wings', 'Black Sun', 'Soul Harvest', 'Death Clone'];
  const all = kinds.map((kind, i) => hazard(`all-${i}`, kind, kind === 'Shadow Wings' ? { shape: 'line', width: 7, length: 64 } : {}));
  const chain = { id: 'chain', firstId: 'a', secondId: 'b', breakDistance: 12, endsAt: 5000 };
  const players = [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 9, z: 4 }];
  Object.assign(graphics, GRAPHICS_PRESETS.high); step(all, 2000, { chains: [chain] }, players);
  for (const tell of tells(root)) {
    const effect = radiance(tell); finiteVfx(effect);
    if (tell.userData.hazard.kind !== 'Soul Harvest') assert.equal(effect.waves.count, 0, 'ordinary shockwaves never precede impact');
  }
  const allocated = snapshots(root), highCount = allocated.reduce((sum, [mesh]) => sum + mesh.count, 0);
  for (const effects of ['low', 'off', 'high', 'off']) {
    Object.assign(graphics, effects === 'off' ? GRAPHICS_PRESETS.low : GRAPHICS_PRESETS.high, { effects });
    step(all, 2500, { chains: [chain] }, players);
    assert.deepEqual(snapshots(root), allocated, 'quality changes reuse bounded instance allocations');
    assert(allocated.reduce((sum, [mesh]) => sum + mesh.count, 0) <= highCount);
    for (const tell of tells(root)) {
      const outline = tell.children.find(child => child.isLineSegments), spell = tell.children.find(child => child.userData.raidSpell);
      if (!['Black Sun', 'Death Clone'].includes(tell.userData.hazard.kind)) assert(visible(outline) && outline.material.opacity > 0, 'danger boundaries survive Low/Off');
      assert(spell && visible(spell), 'mechanic silhouettes survive Low/Off');
      if(!tell.userData.hazard.safe)assert(find(spell,node=>node.isMesh&&node.userData.raidSharedGeometry).some(visible),'authored spell silhouettes survive Low/Off');
    }
  }
  const chainMesh = root.getObjectByName('Soul chain'), chainGeometry = chainMesh.geometry;
  step(all, 2600, { chains: [chain] }, [players[0], { ...players[1], x: 11 }]);
  assert.equal(root.getObjectByName('Soul chain'), chainMesh); assert.equal(chainMesh.geometry, chainGeometry);
  // Live snapshots include only players in the viewer's instance.
  step(all, 2700, { plane: 'shadow', chains: [chain] }, []);
  assert.equal(tells(root).length, 0); assert(!root.getObjectByName('Soul chain'), 'plane transition removes unavailable chain endpoints');
  step([], 5000, { chains: [chain] }, players); assert(!root.getObjectByName('Soul chain'), 'expired chains disappear');
  step(all, 2000, { phase: 'suits', chains: [chain] }, players);
  world.setRaidState(null, 2100, players); world.update(0);
  assert.equal(tells(root).length, 0); assert(!root.getObjectByName('Soul chain')); assert(!visible(root.getObjectByName('raid-sun')));
  assert(find(root, node => / circle$/.test(node.name)).every(node => !visible(node)), 'null clears suit cues');

  assert.equal(textureDisposals, 0, 'world glow texture survives all casts and plane changes');
  world.dispose(); world.dispose(); assert.equal(scene.children.length, 0); assert.equal(sharedDisposals, 0, 'disposing a world never disposes shared authored GLB geometry');
  assert.equal(textureDisposals, 1, 'the world-owned glow texture is disposed exactly once'); assert.equal(spriteGeometryDisposals, 0);
  world = await createRaidWorld(scene);
  const reentered = find(scene, node => node.isMesh && shared.has(node.geometry)); assert(reentered.length > 0, 're-entry reuses the valid authored buffers');
  world.setRaidState({ ...base, hazards: [palm] }, 2000); world.update(0); assert.equal(tells(scene).length, 1);
  assert.notEqual(radiance(tells(scene)[0]).glow.material.map, effectTexture, 're-entry owns a fresh valid glow texture');
  world.dispose(); assert.equal(sharedDisposals, 0); assert.equal(requested.length, 4, 're-entry uses the loaded shared assets');
  assert.deepEqual(RAID_COLLIDERS, savedColliders, 'visual updates never change collision rules');
  console.log('PASS raid world: real assets, moving cues, exact VFX rewind, cone-safe shockwaves, sustained Harvest, bounded 12-Star volleys, Low/Off/bloom behavior, owned-resource cleanup and shared-buffer-safe re-entry.');
} finally {
  world?.dispose(); Object.assign(graphics, savedGraphics); THREE.DefaultLoadingManager.setURLModifier(undefined);
  globalThis.fetch = originalFetch; globalThis.document = originalDocument; globalThis.ProgressEvent = originalProgressEvent;
}
