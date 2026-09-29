import { GOLD_MERCHANT } from './gold-merchant';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildWorldMapScene, disposeGroup, makeMapSearchArea, updateMapSearchArea, updateDungeonPortalMap, type MapSearchArea } from './world-map';
import { WORLD_BOUNDS, type RealmBounds, type RealmPoint } from './realm';
import { dungeonBounds, type DungeonId } from './dungeon';
import { RAID_BOUNDS, isRaidInstance } from './raid';
import { ARENA_BOUNDS, isArenaInstance } from './arena';
import { isInstantCombatInstance, type InstantCombatState } from './instant-combat';
import { instantCombatMap, type InstantCombatMapId } from './instant-combat-maps';
import { VILLAGE_NPCS } from './settlements';
import type { Player, PartyState, DungeonState, Enemy, ResourceNode, LootDrop } from './shared';

interface MinimapData {
  player: Pick<Player, 'id' | 'x' | 'z' | 'rotation' | 'zone' | 'instanceId'>;
  players?: readonly Player[]; party?: PartyState | null; dungeon?: DungeonState | null; instantCombat?: InstantCombatState | null;
  enemies?: readonly Enemy[]; nodes?: readonly ResourceNode[]; loot?: readonly LootDrop[]; route?: readonly RealmPoint[]; searchArea?:MapSearchArea;
}

/** A small, tile-aligned window of the same terrain shown by the full atlas. */
export function minimapBounds(x: number, z: number, dungeon = false, arena = false, dungeonId: DungeonId = 'rootvault'): RealmBounds {
  const world = arena ? ARENA_BOUNDS : dungeon ? dungeonBounds(dungeonId) : WORLD_BOUNDS;
  const minX = THREE.MathUtils.clamp(Math.round(x / 16) * 16 - 64, world.minX, Math.max(world.minX, world.maxX - 128));
  const minZ = THREE.MathUtils.clamp(Math.round(z / 16) * 16 - 64, world.minZ, Math.max(world.minZ, world.maxZ - 128));
  return { minX, minZ, maxX: Math.min(world.maxX, minX + 128), maxZ: Math.min(world.maxZ, minZ + 128) };
}

export function createMinimap(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.setClearColor('#000000', 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  // Clip every map layer to the same tile, including roads and edge-marker outlines.
  const cropPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0)), new THREE.Plane(new THREE.Vector3(-1, 0, 0)),
    new THREE.Plane(new THREE.Vector3(0, 0, 1)), new THREE.Plane(new THREE.Vector3(0, 0, -1))];
  renderer.clippingPlanes = cropPlanes;
  const scene = new THREE.Scene(), relief = new THREE.Group(); relief.scale.y = 1.45; scene.add(relief);
  scene.add(new THREE.HemisphereLight('#fffde5', '#355779', 2));
  const sun = new THREE.DirectionalLight('#fff3d1', 2.4); sun.position.set(-60, 160, 90); scene.add(sun);
  const camera = new THREE.OrthographicCamera(-100, 100, 75, -75, .1, 1000);
  const direction = new THREE.Vector3(.65, 1.2, 1).normalize();
  const transform = new THREE.Object3D(), color = new THREE.Color();
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6.4, 3), new THREE.MeshBasicMaterial({ color: '#fff9c4', depthTest: false }));
  const arrowOutline = new THREE.Mesh(arrow.geometry.clone(), new THREE.MeshBasicMaterial({ color: '#172322', depthTest: false }));
  const playerMarker = new THREE.Group(); playerMarker.name = 'minimap-player';
  arrow.rotation.x = arrowOutline.rotation.x = Math.PI / 2;
  arrow.renderOrder = 22; arrowOutline.renderOrder = 21; arrowOutline.scale.setScalar(1.45);
  playerMarker.add(arrowOutline, arrow); relief.add(playerMarker);
  const dots = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ depthTest: false }), 256);
  const outlines = new THREE.InstancedMesh(dots.geometry.clone(), new THREE.MeshBasicMaterial({ color: '#172322', depthTest: false }), 256);
  dots.name = 'minimap-entities'; dots.renderOrder = 20; outlines.renderOrder = 19;
  dots.frustumCulled = outlines.frustumCulled = false; relief.add(outlines, dots);
  const route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffe49a', depthTest: false }));
  route.renderOrder = 18; route.frustumCulled = false; relief.add(route);
  const searchArea=makeMapSearchArea();relief.add(searchArea);
  let atlas: ReturnType<typeof buildWorldMapScene> | undefined, kit: THREE.Group | undefined;
  let instanceKey = '', windowKey = '', disposed = false, contextLost = false, lastWidth = 0, lastHeight = 0, lastRoute = '';

  function decorate() {
    if (!atlas || !kit) return;
    const names: Record<string, string> = { village: 'map-village', dungeon: 'map-ruin', expedition: 'map-camp', 'world-boss': 'map-boss' };
    for (const marker of atlas.markers) {
      const original = kit.getObjectByName(names[marker.userData.kind]);
      if (!original || marker.userData.decorated) continue;
      for (const child of [...marker.children]) disposeGroup(child);
      const model = original.clone(true);
      // Each crop owns its small landmark copies, so recycling it never disposes the source kit.
      model.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry = mesh.geometry.clone();
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material => material.clone()) : mesh.material.clone();
      });
      model.scale.setScalar(1.8); marker.add(model); marker.userData.decorated = true;
    }
  }
  new GLTFLoader().load('/models/minimap-kit.glb', gltf => {
    if (disposed) { disposeGroup(gltf.scene); return; }
    kit = gltf.scene; decorate(); canvas.dataset.landmarks = 'ready';
  }, undefined, () => { canvas.dataset.landmarks = 'fallback'; });
  function lost(event: Event) { event.preventDefault(); contextLost = true; }
  function restored() { contextLost = false; }
  canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);

  return {
    update(data: MinimapData) {
      if (disposed || contextLost || document.hidden) return;
      const rect = canvas.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
      if (rect.width !== lastWidth || rect.height !== lastHeight) {
        lastWidth = rect.width; lastHeight = rect.height; renderer.setSize(lastWidth, lastHeight, false);
      }
      const raid=isRaidInstance(data.player.instanceId), instantCombat=isInstantCombatInstance(data.player.instanceId), arena = isArenaInstance(data.player.instanceId)||instantCombat, dungeon = !!data.player.instanceId && !arena && !raid, bounds = instantCombat?instantCombatMap(data.instantCombat?.run?.mapId).bounds:raid?RAID_BOUNDS:minimapBounds(data.player.x, data.player.z, dungeon, arena, data.dungeon?.kind);
      cropPlanes[0].constant = -bounds.minX; cropPlanes[1].constant = bounds.maxX;
      cropPlanes[2].constant = -bounds.minZ; cropPlanes[3].constant = bounds.maxZ;
      const nextInstance = `${data.player.instanceId || 'world'}:${data.dungeon?.kind || 'rootvault'}`;
      const key = `${nextInstance}:${bounds.minX}:${bounds.minZ}`;
      if (!atlas || windowKey !== key) {
        const reuse = !raid && !dungeon && !arena && instanceKey === nextInstance ? atlas?.group : undefined;
        if (!reuse) atlas?.dispose();
        atlas = buildWorldMapScene(dungeon, bounds, data.dungeon?.kind, arena, reuse, raid, instantCombat ? instantCombatMap(data.instantCombat?.run?.mapId).id : false); relief.add(atlas.group);
        instanceKey = nextInstance; windowKey = key; decorate(); canvas.dataset.view = instantCombat ? 'instant-combat' : raid ? 'raid' : arena ? 'arena' : dungeon ? 'dungeon' : 'world';
      }
      if(raid)for(const marker of atlas.markers)marker.visible=!data.player.instanceId?.endsWith('-shadow');
      const returnMarker = atlas.markers.find(marker => marker.name === 'dungeon-return');
      if (returnMarker) returnMarker.visible = !!data.dungeon?.completed;
      if (data.dungeon?.kind) updateDungeonPortalMap(atlas, data.dungeon);
      const { heightAt } = atlas;
      updateMapSearchArea(searchArea,data.player.instanceId?undefined:data.searchArea,heightAt);
      const inside = (point: RealmPoint) => point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
      playerMarker.position.set(data.player.x, heightAt(data.player.x, data.player.z) + 5, data.player.z);
      playerMarker.rotation.y = data.player.rotation;
      let count = 0;
      const dot = (point: RealmPoint, tint: string, size = 2.2) => {
        if (!inside(point) || count >= dots.instanceMatrix.count) return;
        transform.position.set(point.x, heightAt(point.x, point.z) + 2, point.z);
        transform.rotation.set(0, Math.PI / 4, 0); transform.scale.set(size, 1.2, size); transform.updateMatrix();
        dots.setMatrixAt(count, transform.matrix); dots.setColorAt(count, color.set(tint));
        transform.scale.multiplyScalar(1.5); transform.updateMatrix(); outlines.setMatrixAt(count, transform.matrix); count++;
      };
      // Player and danger markers keep priority when a crowded area reaches the fixed dot budget.
      for (const other of data.players || []) if (other.id !== data.player.id && other.instanceId === data.player.instanceId) dot(other, data.party?.members.some(member => member.id === other.id) ? '#74d6ff' : '#f1f6d9', 3.1);
      for (const enemy of data.enemies || []) if (enemy.alive && enemy.instanceId === data.player.instanceId) dot(enemy, enemy.worldBoss ? '#ff453d' : '#ff8c72', enemy.worldBoss ? 4 : 2.3);
      for (const rune of data.instantCombat?.run?.runes || []) dot(rune, rune.charge >= 1 ? '#85e5bb' : rune.active === false ? '#787486' : rune.kind === 'soak' || rune.kind === 'bait' ? '#ffd57d' : '#77cfff', 3.5);
      for (const drop of data.loot || []) if (drop.instanceId === data.player.instanceId) dot(drop, '#ffe47b', 2.6);
      if (!data.player.instanceId) dot(GOLD_MERCHANT, '#ffe788', 2.8);
      if (!data.player.instanceId) for (const npc of VILLAGE_NPCS) dot(npc, npc.role === 'healer' ? '#85ffd2' : npc.role === 'merchant' ? '#ffe788' : '#b7e1ff', 2.8);
      for (const node of data.nodes || []) if (node.available && node.instanceId === data.player.instanceId) dot(node, '#96f8c0', 1.7);
      for (const object of data.dungeon?.objects || []) dot(object, object.activated ? '#85e5bb' : object.available ? '#ffe185' : '#9290aa', 3);
      dots.count = outlines.count = count; dots.instanceMatrix.needsUpdate = outlines.instanceMatrix.needsUpdate = true;
      if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      for (const [id, outline] of atlas.roomOutlines) (outline.material as THREE.LineBasicMaterial).color.set(data.dungeon?.clearedStages.includes(id) ? '#c9f7a8' : '#8e80b4');
      const points = data.route || [], routeKey = JSON.stringify(points);
      if (routeKey !== lastRoute || route.userData.window !== windowKey) {
        const trail: THREE.Vector3[] = [];
        // Sample long waypoints so a destination outside the crop still shows the way out.
        for (let i = 1; i < points.length; i++) {
          const from = points[i - 1], to = points[i], steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 4));
          let exited = false;
          for (let step = 0; step <= steps; step++) {
            const point = { x: from.x + (to.x - from.x) * step / steps, z: from.z + (to.z - from.z) * step / steps };
            if (!inside(point)) { exited = true; break; }
            trail.push(new THREE.Vector3(point.x, heightAt(point.x, point.z) + 1, point.z));
          }
          if (exited) break;
        }
        let positions = route.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!positions || positions.count < trail.length) {
          const capacity = Math.max(trail.length, (positions?.count || 0) * 2);
          route.geometry.dispose();
          positions = new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3);
          route.geometry.setAttribute('position', positions);
        }
        trail.forEach((point, i) => positions!.setXYZ(i, point.x, point.y, point.z));
        positions.needsUpdate = true; route.geometry.setDrawRange(0, trail.length);
        lastRoute = routeKey; route.userData.window = windowKey;
      }
      route.visible = route.geometry.drawRange.count > 1;
      const maxHeight = Math.max(atlas.ground.boundingBox?.max.y || 0, atlas.scenery.boundingBox?.max.y || 0);
      const center = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, Math.max(0, maxHeight) * relief.scale.y / 2, (bounds.minZ + bounds.maxZ) / 2);
      camera.position.copy(center).addScaledVector(direction, 280); camera.lookAt(center); camera.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      let horizontal = 0, vertical = 0;
      for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) for (const y of [-4, maxHeight * relief.scale.y + 20]) {
        const corner = new THREE.Vector3(x, y, z).sub(center);
        horizontal = Math.max(horizontal, Math.abs(corner.dot(right))); vertical = Math.max(vertical, Math.abs(corner.dot(up)));
      }
      const aspect = lastWidth / lastHeight, halfHeight = Math.max(vertical, horizontal / aspect) * 1.08;
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.updateProjectionMatrix(); renderer.render(scene, camera);
      canvas.dataset.scene = 'ready';
    },
    dispose() {
      if (disposed) return; disposed = true;
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      disposeGroup(scene); if (kit) disposeGroup(kit);
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
