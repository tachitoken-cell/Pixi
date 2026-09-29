import * as THREE from 'three';

export const WAYPOINT_CHECKPOINT_RADIUS = 5;
type Point = { x: number; z: number };

/** Accept nearby or passed checkpoints, but never direct the player through a wall. */
export function advanceWaypointRoute(route: Point[], player: Point, clear: (next: Point) => boolean) {
  while (route.length > 1) {
    const [current, next] = route, dx = player.x - current.x, dz = player.z - current.z;
    const passed = dx * (next.x - current.x) + dz * (next.z - current.z) > 0;
    if ((!passed && Math.hypot(dx, dz) > WAYPOINT_CHECKPOINT_RADIUS) || !clear(next)) break;
    route.shift();
  }
  return route[0];
}

export function createGroundWaypoint(scene: THREE.Scene, height: (x: number, z: number) => number) {
  const group = new THREE.Group(); group.name = 'Objective guidance'; group.visible = false; scene.add(group);
  const material = new THREE.MeshBasicMaterial({ color: '#ffe3a0', side: THREE.DoubleSide, transparent: true, opacity: .9, depthWrite: false });
  const outline = new THREE.Shape();
  outline.moveTo(-.65, -.45); outline.lineTo(0, .4); outline.lineTo(.65, -.45); outline.lineTo(.65, -.08); outline.lineTo(0, .77); outline.lineTo(-.65, -.08); outline.closePath();
  const template = new THREE.ShapeGeometry(outline), vertices = Array.from(template.getAttribute('position').array);
  const arrows = Array.from({ length: 3 }, () => { const mesh = new THREE.Mesh(template.clone(), material); mesh.frustumCulled = false; group.add(mesh); return mesh; });
  template.dispose();
  const marker = new THREE.Group(), tip = new THREE.Mesh(new THREE.ConeGeometry(.35, .7, 4), material), stem = new THREE.Mesh(new THREE.BoxGeometry(.22, .65, .22), material);
  tip.rotation.z = Math.PI; stem.position.y = .58; marker.add(tip, stem); group.add(marker);
  return {
    group,
    update(destination: (Point & { height?: number }) | null, next: Point | undefined, player: Point, time: number) {
      group.visible = !!destination;
      if (!destination) return;
      const goal = next ?? destination, dx = goal.x - player.x, dz = goal.z - player.z, distance = Math.hypot(dx, dz);
      const forwardX = distance ? dx / distance : 0, forwardZ = distance ? dz / distance : 1;
      for (let i = 0; i < arrows.length; i++) {
        const arrow = arrows[i], offset = 2.5 + i * 2.5;
        arrow.visible = distance > offset + 1;
        if (!arrow.visible) continue;
        const attribute = arrow.geometry.getAttribute('position');
        for (let v = 0; v < attribute.count; v++) {
          const across = vertices[v * 3], along = vertices[v * 3 + 1] + offset;
          const x = player.x + forwardX * along + forwardZ * across, z = player.z + forwardZ * along - forwardX * across;
          attribute.setXYZ(v, x, height(x, z) + .14, z);
        }
        attribute.needsUpdate = true;
      }
      marker.visible = Math.hypot(destination.x - player.x, destination.z - player.z) <= 22;
      marker.position.set(destination.x, height(destination.x, destination.z) + (destination.height ?? 1.2) + .9 + Math.sin(time * 2.5) * .12, destination.z);
    },
    dispose() { scene.remove(group); for (const arrow of arrows) arrow.geometry.dispose(); tip.geometry.dispose(); stem.geometry.dispose(); material.dispose(); },
  };
}
