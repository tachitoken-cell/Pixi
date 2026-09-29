import * as THREE from 'three';
import { STORY_OBJECTS, STORY_ENCOUNTERS } from './story-world-data';
import { storyInteractAvailable } from './story-quests';
import { animateCharacter, makeCharacter } from './characters';
import type { Player, StoryEncounterState } from './shared';
import { DEFAULT_APPEARANCE } from './appearance';
import { groundHeight } from './landscape';
import { loadWorldFeatureAssets } from './resources';
import type { TargetInfo } from './targeting';

/** Reuse Mossvale's props and avatars; quest markers never replace terrain. */
export async function createStoryWorld(scene: THREE.Scene) {
  const kit = await loadWorldFeatureAssets(), root = new THREE.Group(); root.name = 'Stories along the road'; scene.add(root);
  const models = new Map<string, THREE.Group>(), ownedGeometry = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
  const geometry = new THREE.BoxGeometry(1, 1, 1); ownedGeometry.add(geometry);
  const oak = new THREE.MeshStandardMaterial({ color: '#705034', roughness: .92 }), stone = new THREE.MeshStandardMaterial({ color: '#92937a', roughness: .94 });
  const light = new THREE.MeshStandardMaterial({ color: '#dfc177', emissive: '#d1ad4c', emissiveIntensity: .7 });
  [oak, stone, light].forEach(material => ownedMaterials.add(material));
  const box = (group: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; group.add(mesh); return mesh;
  };
  for (const object of STORY_OBJECTS) {
    const group = new THREE.Group(); group.name = object.name; group.userData.targetId = object.id;
    group.position.set(object.x, groundHeight(object.x, object.z), object.z); group.visible = false; root.add(group); models.set(object.id, group);
    if (object.kind === 'npc') {
      const avatar = makeCharacter({ ...DEFAULT_APPEARANCE, className: 'Ranger', outfit: '#64754b', accent: '#bfa365' });
      avatar.userData.storyTraveler = true; group.add(avatar);
    } else if (object.kind === 'pack' || object.kind === 'crate') {
      const source = kit.getObjectByName('feedback-companion-crate');
      if (source) { const prop = source.clone(true); prop.scale.setScalar(object.kind === 'pack' ? .45 : .65); group.add(prop); }
      if (object.id === 'story-abandoned-pack') {
        const campfire = kit.getObjectByName('feedback-campfire')?.clone(true);
        if (campfire) { campfire.position.set(-2.2, groundHeight(object.x - 2.2, object.z) - groundHeight(object.x, object.z), 0); group.add(campfire); }
      }
    } else if (object.kind === 'tree') {
      box(group, 0, 1.2, 0, .6, 2.4, .6, oak); box(group, 0, 2.3, 0, 1.8, .3, 1.4, stone); box(group, 0, 1.35, .33, .16, .35, .04, light);
    } else if (object.kind === 'lantern' || object.kind === 'bell') {
      box(group, 0, 1.1, 0, .18, 2.2, .18, oak); box(group, .25, 2.1, 0, .7, .16, .2, oak);
      box(group, .5, 1.65, 0, .38, .5, .38, object.kind === 'bell' ? light : stone);
      if (object.kind === 'lantern') box(group, .5, 1.65, .21, .24, .28, .03, light);
    } else {
      box(group, 0, .16, 0, 1.1, .32, .9, stone); box(group, 0, .7, 0, .65, .9, .35, stone); box(group, 0, .78, .19, .13, .45, .04, light);
    }
  }
  return { models, update(player: Player | undefined, encounter: StoryEncounterState | null, time: number, observer: THREE.Vector3) {
    root.visible = !!player && !player.instanceId;
    if (!root.visible) { for (const model of models.values()) model.visible = false; return; }
    for (const object of STORY_OBJECTS) {
      const group = models.get(object.id)!, active = player?.storyQuests?.active[object.questId];
      const rescue = STORY_ENCOUNTERS.find(entry => entry.objectId === object.id);
      const progress = player?.storyQuests;
      group.visible = !!active && !!progress && (storyInteractAvailable(progress, object.id) || !!rescue && storyInteractAvailable(progress, rescue.id));
      const current = encounter?.objectId === object.id ? encounter : null;
      const point = current ?? object, dx = point.x - group.position.x, dz = point.z - group.position.z;
      const changed = Math.hypot(dx, dz) > .001;
      group.position.set(point.x, groundHeight(point.x, point.z), point.z);
      group.visible &&= group.position.distanceToSquared(observer) < 120 * 120;
      const avatar = group.children.find(child => child.userData.storyTraveler) as THREE.Group | undefined;
      if (avatar && group.visible) {
        if (current?.phase === 'moving' && changed) {
          avatar.rotation.y = Math.atan2(dx, dz); group.userData.storyMovedAt = time;
        } else if (current?.phase !== 'moving') avatar.rotation.y = Math.atan2(observer.x - point.x, observer.z - point.z);
        // Snapshots arrive less often than frames. Retain the walking pose briefly, then stop if the escort waits.
        animateCharacter(avatar, time, current?.phase === 'moving' && time - (group.userData.storyMovedAt ?? -Infinity) < .3);
      }
      group.userData.storyStatus = current ? `${current.hp}% health · ${current.phase === 'moving' ? 'Follow closely' : `Defend · wave ${current.wave}/${current.waves}`}` : 'Quest objective';
    }
  }, targets(): TargetInfo[] {
    if (!root.visible) return [];
    return STORY_OBJECTS.flatMap(object => { const model = models.get(object.id)!; return model.visible ? [{ id: object.id, kind: 'landmark' as const,
      x: model.position.x, z: model.position.z, name: object.name, label: object.kind === 'npc' ? 'Help the traveler' : 'Examine quest objective', height: object.kind === 'npc' ? 3 : 2.4 }] : []; });
  }, dispose() {
    root.removeFromParent(); root.traverse(node => { if (node instanceof THREE.InstancedMesh) node.dispose(); });
    // Imported prop/avatar geometry and materials are shared asset caches. Only our own buffers are released here.
    ownedGeometry.forEach(value => value.dispose()); ownedMaterials.forEach(value => value.dispose());
    root.clear(); models.clear(); ownedGeometry.clear(); ownedMaterials.clear();
  } };
}
