// Companions: monsters you caught with the Catch skill (NosTale pets). One travels with you: it
// follows the hero, auto-attacks the hero's target and levels up from kills. The others wait in the
// Miniland (NosMates tab of the Miniland menu). Their data lives in the Miniland save.
import * as THREE from 'three';
import { Monster, MONSTER_TYPES } from './monsters.js';

export const MAX_MATES = 10;
export const mateXpNeeded = (lv) => Math.round(50 * Math.pow(lv, 1.5));
export function mateStats(m) {
  const t = MONSTER_TYPES[m.type], k = 1 + (m.lv - 1) * 0.14;
  return { atk: Math.round(Math.max(4, t.atk) * 0.9 * k), speed: Math.max(3.2, t.speed * 1.4), range: t.model === 'wolf' ? 1.8 : 1.5 };
}

export class CompanionEntity {
  constructor(data) {
    this.data = data;                                    // { id, type, lv, xp, name }
    this.m = new Monster(data.type, new THREE.Vector3());
    this.m.root.traverse((o) => { delete o.userData.monster; o.userData.companion = this; });
    this.m.root.scale.setScalar(0.85);
    this.m.size = 0.85;
    this.atkCd = 0;
    this.goal = new THREE.Vector3();
  }
  get pos() { return this.m.root.position; }
  get root() { return this.m.root; }
  place(p) { this.pos.copy(p).add(new THREE.Vector3(-1.4, 0, -1)); }

  // ctx: { dt, player, yaw, target (monster or null), heightAt, walkable, hit(monster, dmg) }
  update(ctx) {
    const { dt } = ctx, p = this.pos, m = this.m;
    m.clock += dt; m.flash = Math.max(0, m.flash - dt); m.lunge = Math.max(0, m.lunge - dt);
    this.atkCd -= dt;
    const st = mateStats(this.data);
    const tgt = ctx.target?.alive ? ctx.target : null;
    let goal, stopAt;
    if (tgt && tgt.pos.distanceTo(ctx.player) < 14) { goal = tgt.pos; stopAt = st.range + (tgt.size - 1) * 0.7; }
    else {                                               // follow a little behind the hero, on the other side from the dog
      this.goal.set(ctx.player.x - Math.sin(ctx.yaw) * 1.8 - Math.cos(ctx.yaw) * 1.4, 0, ctx.player.z - Math.cos(ctx.yaw) * 1.8 + Math.sin(ctx.yaw) * 1.4);
      goal = this.goal; stopAt = 0.6;
    }
    const to = goal.clone().sub(p).setY(0), d = to.length();
    let moving = false;
    if (d > 30) p.copy(ctx.player);                       // teleport back after travel or a dash
    else if (d > stopAt) {
      to.normalize();
      m.face(to, dt, 10);
      const step = Math.min(d - stopAt, (tgt ? st.speed : Math.min(st.speed * 1.6, d * 2.4)) * dt);
      const nx = p.x + to.x * step, nz = p.z + to.z * step;
      if (ctx.walkable(nx, nz, p.x, p.z) || !ctx.walkable(p.x, p.z)) { p.x = nx; p.z = nz; }
      moving = step > 0.001;
    } else if (tgt) {
      m.face(tgt.pos.clone().sub(p).setY(0), dt, 10);
      if (this.atkCd <= 0) {
        this.atkCd = 1.5;
        m.lunge = 0.35;
        const dmg = Math.max(1, Math.round(st.atk * (0.85 + Math.random() * 0.3) - tgt.t.def));
        setTimeout(() => { if (tgt.alive) ctx.hit(tgt, dmg, this); }, 180);
      }
    }
    p.y += (ctx.heightAt(p.x, p.z) - p.y) * Math.min(1, dt * 12);
    m.animate(dt, moving);
  }

  // XP from a kill; returns true on level up
  gainXp(n) {
    const d = this.data;
    d.xp += n;
    let up = false;
    while (d.lv < 70 && d.xp >= mateXpNeeded(d.lv)) { d.xp -= mateXpNeeded(d.lv); d.lv++; up = true; }
    return up;
  }
}
