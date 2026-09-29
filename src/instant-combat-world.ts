import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { InstantCombatState } from './instant-combat';
import { instantCombatMap, type InstantCombatMapId } from './instant-combat-maps';
import { raidHazardGeometry } from './raid-world';
import type { RaidHazard } from './raid';
import { createEnvironmentLights } from './environment-lights';
import { disposeWorldGroup, type WorldInstance } from './world';

const material = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const ring = (radius: number, color: number, width = .12) => new THREE.Mesh(new THREE.RingGeometry(Math.max(0, radius - width), radius, 64).rotateX(-Math.PI / 2), material(color, .95));
const arrowGeometry = () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
  -.18, 0, -.75, .18, 0, -.75, .18, 0, .2, -.18, 0, .2, -.65, 0, .15, .65, 0, .15, 0, 0, 1,
], 3)).setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6]);

/** The renderer and collision bake share the same authored static map. */
export async function loadInstantCombatScenery(mapId: InstantCombatMapId): Promise<THREE.Group> {
  const map = instantCombatMap(mapId), root = (await new GLTFLoader().loadAsync(`/models/instant-combat-${map.id}.glb`)).scene;
  root.name = map.name; root.userData.collision = 'solid';
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.every(material => ['Fire', 'Fire_Core', 'Void_Flame', 'Void_Flame_Core', 'Star'].includes(material.name))) node.userData.collision = 'effect';
    node.castShadow = node.receiveShadow = true;
  });
  return root;
}

/** Authored maps and server-owned tells share exactly the same coordinates. */
export async function createInstantCombatWorld(scene: THREE.Scene, mapId: InstantCombatMapId): Promise<WorldInstance> {
  const map = instantCombatMap(mapId), root = await loadInstantCombatScenery(mapId);
  const lighting = createEnvironmentLights(root, Array.from({ length: 8 }, (_, i) => ({
    position: new THREE.Vector3(Math.cos(Math.PI / 8 + i * Math.PI / 4) * 16, 2.7, -Math.sin(Math.PI / 8 + i * Math.PI / 4) * 16),
    color: mapId === 'bone-pit' ? 0xffab54 : 0xb184ff, fire: mapId === 'bone-pit', scale: .7,
  })));
  const boundary = ring(map.radius, mapId === 'bone-pit' ? 0xe8bd7c : 0xb6a0f0, .09);
  boundary.name = 'Combat boundary'; boundary.position.y = .05; boundary.material.opacity = .45; boundary.raycast = () => {}; root.add(boundary);
  boundary.userData.collision = 'effect';
  const tells = new THREE.Group(); tells.name = 'Instant Combat mechanics'; root.add(tells);
  tells.userData.collision = 'effect';
  const shield = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), material(0xb5a0ff, .15));
  shield.name = 'Boss immune while objectives remain'; shield.position.set(map.boss.x, 3, map.boss.z); shield.scale.y = 1.3; shield.visible = false; shield.raycast = () => {}; tells.add(shield);
  const shieldBase = ring(4, 0xd6baff, .16); shieldBase.position.set(map.boss.x, .1, map.boss.z); shieldBase.visible = false; shieldBase.raycast = () => {}; tells.add(shieldBase);
  const eyeCanvas = document.createElement('canvas'); eyeCanvas.width = 256; eyeCanvas.height = 128;
  const eyeContext = eyeCanvas.getContext('2d')!;
  eyeContext.fillStyle = '#0e1020'; eyeContext.beginPath(); eyeContext.ellipse(128, 48, 87, 39, 0, 0, Math.PI * 2); eyeContext.fill();
  eyeContext.strokeStyle = '#ffcf7d'; eyeContext.lineWidth = 6; eyeContext.stroke();
  eyeContext.fillStyle = '#c489ff'; eyeContext.beginPath(); eyeContext.ellipse(128, 48, 25, 29, 0, 0, Math.PI * 2); eyeContext.fill();
  eyeContext.fillStyle = '#080712'; eyeContext.fillRect(124, 23, 8, 50);
  eyeContext.font = 'bold 23px sans-serif'; eyeContext.textAlign = 'center'; eyeContext.fillStyle = '#fff0c2'; eyeContext.fillText('LOOK AWAY', 128, 114);
  const eyeTexture = new THREE.CanvasTexture(eyeCanvas); eyeTexture.colorSpace = THREE.SRGBColorSpace;
  const gazeEye = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: eyeTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  gazeEye.name = 'Eclipse gaze warning'; gazeEye.visible = false; gazeEye.raycast = () => {}; tells.add(gazeEye);
  const hazards = new Map<string, { signature: string; hazard: RaidHazard; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; edge: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial> }>();
  const runes = new Map<string, { signature: string; group: THREE.Group; ring: ReturnType<typeof ring>; base: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; fill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; label: string; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; tether?: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>; arrow?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; active: boolean; charge: number }>();
  let serverNow = 0, disposed = false;
  const retireHazard = (id: string) => {
    const view = hazards.get(id)!; view.edge.geometry.dispose(); view.edge.material.dispose(); view.mesh.geometry.dispose(); view.mesh.material.dispose(); view.mesh.removeFromParent(); hazards.delete(id);
  };
  const retireRune = (id: string) => { disposeWorldGroup(runes.get(id)!.group); runes.delete(id); };
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  scene.add(root);
  return {
    colliders: map.colliders,
    setInstantCombatState(state: InstantCombatState | null, now = Date.now()) {
      serverNow = now;
      const run = state?.run?.mapId === map.id ? state.run : null, active = run?.hazards?.filter(h => h.startedAt <= now && h.endsAt > now) ?? [], ids = new Set(active.map(h => h.id));
      const bossX = run?.boss?.x ?? map.boss.x, bossZ = run?.boss?.z ?? map.boss.z;
      shield.visible = shieldBase.visible = !!run?.boss?.shielded;
      shield.position.set(bossX, 3, bossZ); shieldBase.position.set(bossX, .1, bossZ);
      gazeEye.visible = run?.mechanic?.kind === 'gaze'; gazeEye.position.set(bossX, 7.5, bossZ);
      for (const id of hazards.keys()) if (!ids.has(id)) retireHazard(id);
      for (const hazard of active) {
        const signature = JSON.stringify([hazard.shape, hazard.r, hazard.innerR, hazard.rotation, hazard.angle, hazard.width, hazard.length, hazard.safe]);
        let view = hazards.get(hazard.id);
        if (view && view.signature !== signature) { retireHazard(hazard.id); view = undefined; }
        if (!view) {
          const mesh = new THREE.Mesh(raidHazardGeometry(hazard), material(hazard.safe ? 0x62ead6 : 0xf24b42, .2));
          const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: hazard.safe ? 0xc3fff1 : 0xffb4a9, transparent: true, opacity: .95, depthWrite: false, toneMapped: false }));
          mesh.name = hazard.label; mesh.raycast = edge.raycast = () => {}; mesh.add(edge); tells.add(mesh);
          hazards.set(hazard.id, view = { signature, hazard, mesh, edge });
        }
        view.hazard = hazard; view.mesh.position.set(hazard.x, .16, hazard.z);
      }
      const runeIds = new Set(run?.runes?.map(r => r.id) ?? []);
      for (const id of runes.keys()) if (!runeIds.has(id)) retireRune(id);
      run?.runes?.forEach((rune, index) => {
        const kind = rune.kind ?? 'charge', signature = `${kind}:${rune.r}`;
        let view = runes.get(rune.id);
        if (view && view.signature !== signature) { retireRune(rune.id); view = undefined; }
        if (!view) {
          const group = new THREE.Group(), edge = ring(rune.r, 0x9ddbff, .18);
          const base = new THREE.Mesh(new THREE.CircleGeometry(rune.r - .2, 64).rotateX(-Math.PI / 2), material(0x67b8ff, .08));
          const fill = new THREE.Mesh(base.geometry.clone(), material(0x67b8ff, .27)); fill.position.y = .012;
          const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
          const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
          const label = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(4.5, rune.r * 2), Math.min(2.25, rune.r)).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
          label.position.y = .025; group.name = `Mechanic marker · ${kind}`; group.add(base, fill, edge, label);
          const tether = kind === 'web' ? new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, 1, 6), material(0xc69aff, .92)) : undefined;
          if (tether) { tether.name = 'Stretch this web to sever it'; group.add(tether); }
          const arrow = kind === 'bait' || kind === 'gaze' ? new THREE.Mesh(arrowGeometry(), material(0xffd26d, .95)) : undefined;
          if (arrow) { arrow.name = kind === 'gaze' ? 'Face away from the boss' : 'Marked target stands here'; arrow.position.set(0, .05, kind === 'gaze' ? rune.r + .7 : 0); label.position.z = -rune.r * .5; group.add(arrow); }
          group.traverse(node => { node.raycast = () => {}; }); tells.add(group);
          runes.set(rune.id, view = { signature, group, ring: edge, base, fill, label: '', canvas, texture, tether, arrow, active: true, charge: 0 });
        }
        const charge = THREE.MathUtils.clamp(rune.charge, 0, 1), enabled = rune.active !== false;
        const color = charge >= 1 ? 0x72ffa6 : !enabled ? 0x73758c : kind === 'soak' || kind === 'bait' || kind === 'ordered' ? 0xffce63 : kind === 'web' ? 0xc598ff : kind === 'gaze' ? 0xff9378 : 0x78c5ff;
        view.active = enabled; view.charge = charge; view.group.position.set(rune.x, .19, rune.z);
        for (const shape of [view.ring, view.fill, view.base, ...(view.arrow ? [view.arrow] : [])]) shape.material.color.setHex(color);
        view.base.material.opacity = kind === 'web' ? .025 : enabled ? .09 : .025;
        view.fill.material.opacity = kind === 'web' ? .07 : .27;
        view.fill.geometry.setDrawRange(0, Math.floor(64 * charge) * 3);
        const label = rune.label ?? String(index + 1);
        if (view.label !== label) {
          view.label = label;
          const context = view.canvas.getContext('2d')!; context.clearRect(0, 0, 256, 128); context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = `bold ${label.length > 12 ? 19 : label.length > 3 ? 27 : 68}px sans-serif`; context.fillStyle = '#f1faff'; context.shadowColor = '#101426'; context.shadowBlur = 8; context.fillText(label, 128, 64, 246); view.texture.needsUpdate = true;
        }
        if (view.tether) {
          view.tether.visible = rune.targetX !== undefined && rune.targetZ !== undefined && charge < 1;
          if (view.tether.visible) {
            direction.set(rune.targetX! - rune.x, .6, rune.targetZ! - rune.z);
            view.tether.position.copy(direction).multiplyScalar(.5); view.tether.position.y += .6;
            const length = direction.length(); view.tether.scale.set(1, length, 1); view.tether.quaternion.setFromUnitVectors(up, direction.divideScalar(Math.max(.001, length)));
          }
        }
        if (view.arrow) {
          const angle = Math.atan2(rune.x - bossX, rune.z - bossZ), offset = (rune.r + .7) * (kind === 'gaze' ? 1 : -1);
          view.arrow.rotation.y = angle; view.arrow.position.set(Math.sin(angle) * offset, .05, Math.cos(angle) * offset);
        }
      });
    },
    update(time, observer, camera) {
      lighting.update(time, observer, camera);
      if (camera && gazeEye.visible) gazeEye.quaternion.copy(camera.quaternion);
      for (const { hazard, mesh, edge } of hazards.values()) {
        const progress = THREE.MathUtils.clamp((serverNow - hazard.startedAt) / Math.max(1, hazard.impactAt - hazard.startedAt), 0, 1), impact = serverNow >= hazard.impactAt;
        mesh.material.opacity = impact ? .38 * (1 - THREE.MathUtils.clamp((serverNow - hazard.impactAt) / Math.max(1, hazard.endsAt - hazard.impactAt), 0, 1)) : .14 + progress * .16;
        edge.material.opacity = .65 + progress * .35;
      }
      for (const view of runes.values()) view.ring.material.opacity = view.charge >= 1 ? .95 : view.active ? .75 + Math.sin(serverNow * .004) ** 2 * .25 : .28;
      shield.material.opacity = .1 + Math.sin(serverNow * .003) ** 2 * .06;
    },
    constrainCamera(target, desired) {
      const distance = direction.subVectors(desired, target).length(); if (disposed || distance < .001) return;
      ray.set(target, direction.divideScalar(distance)); ray.near = .1; ray.far = distance;
      const hit = ray.intersectObject(root, true)[0]; if (hit) desired.copy(target).addScaledVector(direction, Math.max(.1, hit.distance - .35));
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const id of hazards.keys()) retireHazard(id);
      runes.clear(); lighting.dispose(); disposeWorldGroup(root);
    },
  };
}
