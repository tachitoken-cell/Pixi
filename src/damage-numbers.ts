import { Vector3, type Camera } from 'three';
import type { DamageEvent } from './shared';

type Anchor = { x: number; y: number; z: number };
const LIFETIME = 1250;
const MAX_NUMBERS = 64;

export function createDamageNumbers(root: HTMLElement, camera: Camera, resolve: (event: DamageEvent) => Anchor | undefined) {
 const active: { event: DamageEvent; el: HTMLElement; anchor: Anchor; started: number; lane: number }[] = [];
 const projected = new Vector3();
 const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
 return {
  play(event: DamageEvent, now = performance.now()) {
   if (!Number.isFinite(event.amount) || event.amount < 0 || event.amount === 0 && event.effect !== 'immune') return;
   const anchor = resolve(event);
   if (!anchor) return;
   if (active.length >= MAX_NUMBERS) active.shift()!.el.remove();
   const lane = [0, -1, 1, -2, 2][active.filter(item => item.event.targetId === event.targetId).length % 5];
   const el = document.createElement('span');
   el.className = `damage-number damage-number-${event.targetKind}${event.effect?` damage-number-${event.effect}`:''}`;
   el.textContent = event.effect==='immune'?'Immune':event.effect==='xp'?`+${event.amount} XP`:event.effect==='heal'?`+${event.amount}`:event.effect==='absorb'?`${event.amount} absorbed`:String(event.amount); el.ariaHidden = 'true';
   el.dataset.targetId = event.targetId; el.style.visibility = 'hidden';
   root.append(el);
   active.push({ event, el, anchor, started: now, lane });
  },
  update(now: number, viewer: Anchor, width: number, height: number) {
   if (!active.length) return;
   camera.updateMatrixWorld();
   for (let i = active.length - 1; i >= 0; i--) {
    const item = active[i], age = Math.max(0, now - item.started), progress = age / LIFETIME;
    if (progress >= 1) { item.el.remove(); active.splice(i, 1); continue; }
    // Keep the last anchor when a defeated target disappears before its number fades.
    item.anchor = resolve(item.event) ?? item.anchor;
    const { x, y, z } = item.anchor;
    projected.set(x, y, z).project(camera);
    const visible = Math.hypot(x - viewer.x, z - viewer.z) < 100 && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
    item.el.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) continue;
    const rise = reducedMotion.matches ? 0 : progress * 64;
    const scale = reducedMotion.matches ? 1 : 1 + .22 * Math.max(0, 1 - age / 140);
    item.el.style.left = `${(projected.x * .5 + .5) * width + item.lane * 27}px`;
    item.el.style.top = `${(-projected.y * .5 + .5) * height - rise}px`;
    item.el.style.transform = `translate(-50%, -100%) scale(${scale})`;
    item.el.style.opacity = String(Math.min(1, (1 - progress) / .35));
   }
  },
  clear() { for (const item of active) item.el.remove(); active.length = 0; },
 };
}
