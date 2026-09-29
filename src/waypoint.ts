export function createWaypointIndicator(root: HTMLElement, onClear: () => void) {
  const arrow = root.querySelector<HTMLElement>('#waypoint-arrow')!;
  const name = root.querySelector<HTMLElement>('#waypoint-name')!;
  const distance = root.querySelector<HTMLElement>('#waypoint-distance')!;
  const clear = root.querySelector<HTMLButtonElement>('#waypoint-clear')!;
  root.hidden = true;
  clear.onclick = () => { root.hidden = true; onClear(); };
  return {
    update(destination: { x: number; z: number; label?: string } | null, player: { x: number; z: number }, cameraYaw: number) {
      root.hidden = !destination;
      if (!destination) return;
      const dx = destination.x - player.x, dz = destination.z - player.z;
      const meters = Math.hypot(dx, dz), label = destination.label?.trim() || 'Waypoint';
      const text = `${Math.round(meters)} m`;
      // Camera forward is (-sin(yaw), -cos(yaw)); zero rotation points up the screen.
      const rotation = `rotate(${meters ? Math.atan2(dx, -dz) + cameraYaw : 0}rad)`;
      if (name.textContent !== label) { name.textContent = label; name.title = label; }
      if (distance.textContent !== text) distance.textContent = text;
      if (arrow.style.transform !== rotation) arrow.style.transform = rotation;
    },
  };
}
