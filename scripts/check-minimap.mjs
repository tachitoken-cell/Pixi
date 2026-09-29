import { isRaidInstance } from '../src/raid.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import {COLOSSEUM,inColosseumClearing} from '../src/colosseum.ts';
import {ARENA_ENTRANCE,ARENA_ENTRY_RADIUS,ARENA_BOUNDS,isArenaInstance} from '../src/arena.ts';
import {ZEPPELIN_PORTS} from '../src/zeppelin.ts';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import postcss from 'postcss';

const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { minimapBounds } = await import('../src/minimap.ts');
const { buildWorldMapScene, worldMapHeight } = await import('../src/world-map.ts');
const { WORLD_BOUNDS, REGION_ORIGINS, EXPEDITIONS, TERRAIN_STEP, surfaceAt } = await import('../src/landscape.ts');
const { getDungeon, dungeonBounds, dungeonReturn, dungeonStages, inDungeonPreparation, DUNGEON_BOUNDS, DUNGEON_STAGES } = await import('../src/dungeon.ts');
const { getZone } = await import('../src/content.ts');
const { VILLAGES } = await import('../src/settlements.ts');
const { wildBiomeAt } = await import('../src/world-features.ts');
const { regionLevelLabel } = await import('../src/region-levels.ts');
const { mountUI } = await import('../src/ui.ts');
hook.deregister();

const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
const approx = (actual, expected) => assert(Math.abs(actual - expected) < .0001, `${actual} ≈ ${expected}`);
const inside = (point, bounds) => point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
const samples = [...Object.values(REGION_ORIGINS), ...EXPEDITIONS, { x: -670, z: 240 },
  ...[WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX].flatMap(x => [WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ].map(z => ({ x, z })))];
let largestCrop = 0;
for (const dungeon of [false, true]) for (const point of dungeon ? [{ x: 0, z: 22 }, { x: 0, z: DUNGEON_BOUNDS.minZ }] : samples) {
  const playable = dungeon ? DUNGEON_BOUNDS : WORLD_BOUNDS, bounds = minimapBounds(point.x, point.z, dungeon);
  assert(inside(point, bounds), 'the crop always includes the player, including every playable edge');
  assert(bounds.minX >= playable.minX && bounds.maxX <= playable.maxX && bounds.minZ >= playable.minZ && bounds.maxZ <= playable.maxZ);
  assert(bounds.maxX - bounds.minX <= 128 && bounds.maxZ - bounds.minZ <= 128, 'the HUD builds only nearby terrain');
  const atlas = buildWorldMapScene(dungeon, bounds), resources = new Set();
  assert.deepEqual(atlas.bounds, bounds); assert(atlas.ground.count > 0 && atlas.ground.count <= (dungeon ? 4096 : 1024));
  if (!dungeon) {
    largestCrop = Math.max(largestCrop, atlas.ground.count);
    assert.equal(atlas.ground.count, (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ) / TERRAIN_STEP ** 2);
  }
  atlas.group.updateMatrixWorld(true);
  atlas.group.traverse(object => {
    assert(object.matrixWorld.elements.every(Number.isFinite));
    if (!object.isMesh) return;
    assert([...object.geometry.getAttribute('position').array].every(Number.isFinite));
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    if (!object.isInstancedMesh) return;
    resources.add(object);
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
      assert(matrix.elements.every(Number.isFinite)); assert(scale.x > 0 && scale.y > 0 && scale.z > 0);
      if (object === atlas.ground) {
        assert(inside(position, bounds));
        approx(position.y + scale.y / 2, dungeon ? 3 : worldMapHeight(position.x, position.z));
      }
    }
  });
  const land = new THREE.Box3().setFromObject(atlas.ground);
  assert(land.min.x >= bounds.minX && land.max.x <= bounds.maxX && land.min.z >= bounds.minZ && land.max.z <= bounds.maxZ);
  for (const outline of atlas.roomOutlines.values()) {
    const vertices = outline.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) assert(inside(position.fromBufferAttribute(vertices, i).applyMatrix4(outline.matrixWorld), bounds), 'cropped dungeon room outlines cannot spill outside the minimap');
  }
  assert(atlas.markers.every(marker => inside(marker.position, bounds)), 'distant points never allocate local landmark pins');
  let disposed = 0; for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
  atlas.dispose(); assert.equal(disposed, resources.size, 'replacing a local crop releases every geometry, material and instance buffer');
}
for (const id of ['plagueworks', 'emberfall', 'veilhaven']) {
  const stages=dungeonStages(id), bounds=dungeonBounds(id), full=buildWorldMapScene(true,undefined,id);
  assert.deepEqual(full.bounds,bounds); assert.equal(full.roomOutlines.size,stages.length+1,'every optional/main encounter and the arrival sanctuary appear on the atlas');assert(full.roomOutlines.has('preparation'),'the safe arrival sanctuary stays on the atlas');
  const portal=full.markers.find(marker=>marker.name==='dungeon-return');
  assert.equal(portal.position.x,dungeonReturn(id).x);assert.equal(portal.position.z,dungeonReturn(id).z);
  for(const stage of stages)assert(full.labels.some(label=>label.point.id===stage.id&&label.text.includes(stage.optional?'(optional)':'')));
  full.dispose();
  const extremes=[...new Set(['x','z'].flatMap(axis=>[stages.reduce((a,b)=>a[axis]<b[axis]?a:b),stages.reduce((a,b)=>a[axis]>b[axis]?a:b)]))];
  for(const point of [...extremes,dungeonReturn(id)]){
    const crop=minimapBounds(point.x,point.z,true,false,id), atlas=buildWorldMapScene(true,crop,id);
    assert(inside(point,crop),'expanded minimap follows players beyond the old rectangle');
    assert(crop.maxX-crop.minX<=128&&crop.maxZ-crop.minZ<=128,'larger maps retain bounded local crops');
    assert(atlas.ground.count>0,'distant exploration wings render actual floor');
    const floor=new THREE.Box3().setFromObject(atlas.ground);
    assert(floor.min.x>=crop.minX&&floor.max.x<=crop.maxX&&floor.min.z>=crop.minZ&&floor.max.z<=crop.maxZ);
    atlas.dispose();
  }
}
const arenaCrop=minimapBounds(28,3,false,true), arenaMap=buildWorldMapScene(false,arenaCrop,undefined,true);
assert.deepEqual(arenaCrop,ARENA_BOUNDS);assert.equal(arenaMap.roomOutlines.size,0,'private arena has no dungeon rooms');assert(arenaMap.markers.every(marker=>marker.userData.kind==='arena'),'private arena has only match landmarks');arenaMap.dispose();
assert.deepEqual(minimapBounds(1, 1), minimapBounds(2, 2), 'ordinary movement reuses the same terrain chunk');

// Exercise the shipped route sampler with a waypoint far beyond the local crop.
const minimapSource = readFileSync(new URL('../src/minimap.ts', import.meta.url), 'utf8'), routeBounds = minimapBounds(0, 0);
const route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
runInNewContext(stripTypeScriptTypes(minimapSource.slice(minimapSource.indexOf('      const points = data.route'), minimapSource.indexOf('      const maxHeight'))), {
  THREE, data: { route: [{ x: 0, z: 0 }, { x: 512, z: 0 }] }, route, lastRoute: '', windowKey: 'local', heightAt: worldMapHeight,
  inside: point => inside(point, routeBounds),
});
const trail = route.geometry.getAttribute('position');
assert(route.visible && trail.count > 2, 'a destination beyond the crop still shows the route toward it');
for (let i = 0; i < trail.count; i++) {
  position.fromBufferAttribute(trail, i); assert(inside(position, routeBounds), 'sampled route geometry stays inside the crop');
  approx(position.y, worldMapHeight(position.x, position.z) + 1);
}
assert(trail.getX(trail.count - 1) >= routeBounds.maxX - 4, 'the visible route reaches the edge toward the off-map destination');
route.geometry.dispose(); route.material.dispose();

const app = { innerHTML: '' }; globalThis.document = { querySelectorAll: () => [], getElementById: id => { if(id==='character-list')return {insertAdjacentHTML(where,html){assert.equal(where,'beforebegin');assert.match(html,/id="roster-language"/);}};if(id==='roster-create')return {insertAdjacentHTML(){}};if(id==='instance-loading')return {addEventListener(){}};assert.equal(id, 'app'); return app; } };
mountUI(); delete globalThis.document;
const button = app.innerHTML.match(/<button id="minimap-button"[^>]*>/)?.[0];
assert(button?.includes('aria-label="Open world map"') && button.includes('aria-describedby="zone-location"') && button.includes('data-binding-title="m"') && button.includes('data-binding-name="Open world map"'));
for (const direction of ['north', 'east', 'south', 'west']) assert(app.innerHTML.includes(`class="compass-${direction}"`));
assert(app.innerHTML.includes('id="zone-name"') && app.innerHTML.includes('id="zone-location" title='));
const root = new URL('../', import.meta.url), main = readFileSync(new URL('src/main.ts', root), 'utf8');
const renderedGuidance=[],miniRuntime={treasureMapSearchArea:()=>undefined,player:{id:'local',x:-1,z:-1},position:{x:4,z:8},rotation:.5,worldInstance:null,
  rosterActive:false,entryActive:false,customizer:{open:false},atlas:null,minimapFailed:false,minimap:{update:data=>renderedGuidance.push(data)},
  players:[],party:null,dungeon:null,instantCombat:null,enemies:[],nodes:[],loot:[],waypoint:null,guideRoute:[]};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function renderMinimap(){'),main.indexOf("window.addEventListener('pagehide',disposeMinimap)"))),miniRuntime);
miniRuntime.renderMinimap();assert.equal(renderedGuidance.at(-1).route.length,0,'no waypoint means no minimap guidance line');
miniRuntime.waypoint={x:150,z:200,instanceId:null};miniRuntime.renderMinimap();
assert.deepEqual(Array.from(renderedGuidance.at(-1).route,point=>({...point})),[{x:4,z:8},{x:150,z:200,instanceId:null}],'the minimap receives only current position and the chosen waypoint');
assert.equal(renderedGuidance.at(-1).player.x,4,'guidance starts at current predicted position rather than the previous server snapshot');
miniRuntime.guideRoute=[{x:20,z:12}];miniRuntime.renderMinimap();assert.deepEqual(Array.from(renderedGuidance.at(-1).route,point=>({...point})),[{x:4,z:8},{x:20,z:12},{x:150,z:200,instanceId:null}],'beginner guidance includes its actual safe route corners');miniRuntime.guideRoute=[];
miniRuntime.worldInstance='vault-a';miniRuntime.renderMinimap();assert.equal(renderedGuidance.at(-1).route.length,0,'overworld guidance is hidden inside a dungeon');
miniRuntime.waypoint={x:0,z:22,instanceId:'vault-a'};miniRuntime.renderMinimap();assert.equal(renderedGuidance.at(-1).route.length,2);
miniRuntime.worldInstance='vault-b';miniRuntime.renderMinimap();assert.equal(renderedGuidance.at(-1).route.length,0,'different dungeon instances cannot reuse guidance');
// The live HUD follows actual region boundaries, including changes within one biome.
const fields=new Map(),hud={isRaidInstance,isInstantCombatInstance,instantCombat:null,document:{body:{classList:{contains:()=>false}}},wildBiomeAt,getDungeon,COLOSSEUM,inColosseumClearing,ZEPPELIN_PORTS,ARENA_ENTRANCE,ARENA_ENTRY_RADIUS,isArenaInstance,arena:null,player:undefined,surfaceAt,getZone,EXPEDITIONS,VILLAGES,DUNGEON_STAGES,regionLevelLabel,
  position:{x:0,z:0},worldInstance:null,dungeon:null,lastLocationRegion:'',
  $:id=>{if(!fields.has(id))fields.set(id,{textContent:'',title:'',style:{},dataset:{}});return fields.get(id);}};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function updateLocation('),main.indexOf('function updateHUD('))),hud);
for(const point of [...Object.values(REGION_ORIGINS),...EXPEDITIONS]){
  hud.position={x:point.x,z:point.z};hud.updateLocation();
  const surface=surfaceAt(point.x,point.z),level=regionLevelLabel(surface.regionId,surface.zone);
  assert.equal(fields.get('zone-location').textContent.split('\n')[0],level,'level range stays first and visible before a long place name');
  assert(fields.get('zone-name').textContent.includes(level));assert(fields.get('zone-footer').textContent.includes(level));
  assert(fields.get('zone-intro-subtitle').textContent.startsWith(`${level} · `),'arrival uses the same regional levels');
  assert.equal(hud.lastLocationRegion,surface.regionId);
}
hud.inDungeonPreparation=inDungeonPreparation;hud.worldInstance='rootvault-test';hud.dungeon={encounterName:'Lantern Crossing'};hud.updateLocation();
assert.equal(fields.get('zone-location').textContent,'Lv 10–14\nLantern Crossing');
assert.equal(fields.get('zone-intro-title').textContent,'The Rootvault');
for(const id of ['plagueworks','emberfall','veilhaven']){hud.worldInstance='expanded-'+id;hud.dungeon={kind:id,encounterName:'Beyond the ward'};hud.position={x:0,z:22};hud.updateLocation();assert.match(fields.get('zone-location').textContent,/Arrival sanctuary.*Safe/);hud.position=dungeonStages(id)[0];hud.updateLocation();assert(!fields.get('zone-location').textContent.includes('Arrival sanctuary'));}
hud.worldInstance='arena-test';hud.arena={size:2};hud.updateLocation();assert.equal(fields.get('zone-location').textContent,'2v2 · Private match\nThornring Arena');assert.equal(fields.get('zone-intro-title').textContent,'Thornring Arena');
assert(main.slice(main.indexOf('if(now-mapTime>100)'),main.indexOf('if(now-contractRefresh')).includes('updateLocation();'),'the 100ms live location writer uses the shared range-aware HUD function');
// A released WebGL canvas cannot be reused when switching characters.
let released=0,replaced=0;const fresh={id:'minimap'};
const lifecycle={minimap:{dispose(){released++;}},minimapFailed:true,mapCanvas:{cloneNode(){return fresh;},replaceWith(node){assert.equal(node,fresh);replaced++;}}};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function disposeMinimap(){'),main.indexOf('function renderMinimap(){')))+';disposeMinimap();disposeMinimap();',lifecycle);
assert.equal(released,1);assert.equal(replaced,1);assert.equal(lifecycle.mapCanvas,fresh);assert.equal(lifecycle.minimap,null);assert.equal(lifecycle.minimapFailed,false);
const styleFiles = [...main.matchAll(/import '\.\/([^']+\.css)'/g)].map(([, file]) => file);
assert(styleFiles.indexOf('minimap.css') > styleFiles.indexOf('art.css'), 'HUD overrides load after the old painted frame');
const css = postcss.parse(styleFiles.map(file => readFileSync(new URL(`src/${file}`, root), 'utf8')).join('\n'));
function declarations(selector, viewport) {
  const result = {};
  css.walkRules(rule => {
    if (!rule.selector.split(',').some(value => value.trim() === selector)) return;
    for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name === 'media') {
      const limits = [...parent.params.matchAll(/(min|max)-width:\s*(\d+)px/g)];
      if (limits.some(([, kind, width]) => kind === 'max' ? viewport > +width : viewport < +width)) return;
    }
    rule.walkDecls(declaration => result[declaration.prop] = declaration.value);
  });
  return result;
}
function pixels(value, viewport) {
  const call = value.match(/^(min|max|clamp)\((.*)\)$/);
  if (call) { const args = call[2].split(',').map(argument => pixels(argument.trim(), viewport)); return call[1] === 'min' ? Math.min(...args) : call[1] === 'max' ? Math.max(...args) : Math.max(args[0], Math.min(args[1], args[2])); }
  return parseFloat(value) * (value.endsWith('vw') ? viewport / 100 : 1);
}
for (const viewport of [320, 390, 800, 801, 1000, 1280, 1920]) {
  const location = declarations('.location', viewport), map = declarations('#minimap-button', viewport), quest = declarations('.quest-tracker', viewport), title = declarations('#minimap-button .map-location', viewport);
  const width = pixels(location.width, viewport), height = pixels(map.height, viewport);
  assert(width >= 114 && width <= (viewport <= 800 ? 132 : viewport * .25));
  assert(pixels(location.top, viewport) + height + 18 < pixels(quest.top, viewport), 'minimap and movement hint stay above the quest tracker');
  assert.equal(map.background, 'transparent'); assert.equal(map['border-image'], 'none'); assert.equal(map.overflow, 'hidden');
  assert.equal(declarations('#minimap-button::after', viewport).content, 'none', 'the old wood frame is gone');
  assert.equal(title['-webkit-line-clamp'], '3'); assert.equal(title['white-space'],'pre-line'); assert.equal(title.overflow, 'hidden');
  assert(pixels(title.left, viewport) + pixels(title.right, viewport) < width - 40, 'place names retain readable space next to the compass');
}
const kit = readFileSync(new URL('public/models/minimap-kit.glb', root));
assert.equal(kit.toString('utf8', 0, 4), 'glTF'); assert.equal(kit.readUInt32LE(4), 2); assert.equal(kit.readUInt32LE(8), kit.length);
assert(kit.length < 100_000, 'the four minimap landmarks stay cheap to download');
const gltf = JSON.parse(kit.subarray(20, 20 + kit.readUInt32LE(12)).toString('utf8'));
assert.equal(gltf.materials.length, 1); assert.equal(gltf.textures?.length || 0, 0);
assert.deepEqual(gltf.nodes.map(node => node.name).sort(), ['map-boss', 'map-camp', 'map-ruin', 'map-village']);
let triangles = 0;
for (const node of gltf.nodes) {
  assert.equal(gltf.meshes[node.mesh].primitives.length, 1, 'each landmark adds one draw');
  const primitive = gltf.meshes[node.mesh].primitives[0], positions = gltf.accessors[primitive.attributes.POSITION];
  assert(primitive.attributes.COLOR_0 !== undefined, 'Blender landmark colors are embedded, with no external texture');
  assert(positions.min.every(Number.isFinite) && positions.max.every(Number.isFinite));
  approx(positions.min[1], 0); assert(positions.max[1] > 4 && positions.max[1] < 8, 'landmarks stand upright on the map surface');
  triangles += gltf.accessors[primitive.indices].count / 3;
}
assert(triangles < 2000);
console.log(`PASS: ${samples.length + 2} real terrain/dungeon crops, <=${largestCrop} overworld cells, actual elevations, finite geometry, crop reuse and complete disposal; frameless HUD and label budgets at seven viewport widths; four Blender landmarks, ${triangles} triangles, ${kit.length} bytes.`);
