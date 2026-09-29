import * as THREE from 'three';
import { makeEnemy, animateEnemy } from './characters.ts';
import { MONSTERS } from './bestiary.ts';
import type { Player } from './shared.ts';

export type CombatCompanionOwner = Pick<Player, 'id' | 'combatCompanion'>;

/** Use the creature's existing rig; snapshots own movement, attacks and health. */
export function createCombatCompanions(scene: THREE.Scene, groundAt: (x: number, z: number) => number) {
  const views = new Map<string, { kind: string; mesh: THREE.Group; model: THREE.Group; hp: number; hitAt: number }>();
  const remove = (id: string) => {
    const view = views.get(id);
    view?.mesh.removeFromParent();
    // Imported rigs share geometry/materials; legacy rigs can own instance buffers.
    view?.mesh.traverse(node => { if (node instanceof THREE.InstancedMesh) node.dispose(); });
    views.delete(id);
  };
  return {
    get size() { return views.size; },
    get(ownerId: string) { return views.get(ownerId)?.mesh; },
    clear() { for (const id of views.keys()) remove(id); },
    update(owners: readonly CombatCompanionOwner[], dt: number, time: number, serverNow: number) {
      const active = owners.filter(owner => owner.combatCompanion && owner.combatCompanion.hp > 0);
      const present = new Set(active.map(owner => owner.id));
      for (const id of views.keys()) if (!present.has(id)) remove(id);
      for (const owner of active) {
        const pet = owner.combatCompanion!;
        if (![pet.x, pet.z, pet.rotation, dt, time, serverNow].every(Number.isFinite)) continue;
        let view = views.get(owner.id);
        if (view?.kind !== pet.kind) { remove(owner.id); view = undefined; }
        if (!view) {
          // makeEnemy/animateEnemy reuse the imported monster rig and cover legacy creatures too.
          const mesh = new THREE.Group(), model = makeEnemy(pet.kind);
          const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
          const scale = Math.min(1, 1.6 / Math.max(.01, size.y), 2.4 / Math.max(.01, size.x, size.z));
          model.scale.setScalar(scale); model.position.y = -bounds.min.y * scale;
          mesh.add(model); mesh.name = `companion:${owner.id}`; mesh.userData.ownerId = owner.id;
          mesh.position.set(pet.x, groundAt(pet.x, pet.z), pet.z); mesh.rotation.y = pet.rotation;
          view = { kind: pet.kind, mesh, model, hp: pet.hp, hitAt: -Infinity };
          views.set(owner.id, view); scene.add(mesh);
        }
        const { mesh, model } = view, gap = Math.hypot(pet.x - mesh.position.x, pet.z - mesh.position.z);
        const blend = gap > 18 ? 1 : Math.min(1, Math.max(0, dt) * 12);
        mesh.position.x += (pet.x - mesh.position.x) * blend;
        mesh.position.z += (pet.z - mesh.position.z) * blend;
        mesh.position.y = groundAt(mesh.position.x, mesh.position.z);
        const turn = pet.rotation - mesh.rotation.y;
        mesh.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * blend;
        if (pet.hp < view.hp) view.hitAt = time;
        view.hp = pet.hp;
        const hitAge = time - view.hitAt;
        mesh.rotation.z = hitAge >= 0 && hitAge < .3 ? Math.sin(hitAge / .3 * Math.PI * 2) * .1 * (1 - hitAge / .3) : 0;
        const attack = pet.attackUntil > serverNow ? { style: MONSTERS[pet.kind].attackStyle, basic: true, progress: Math.max(0, 1 - (pet.attackUntil - serverNow) / 600), impactProgress: .5 } : undefined;
        animateEnemy(model, time, gap > .03, attack);
      }
    },
  };
}
