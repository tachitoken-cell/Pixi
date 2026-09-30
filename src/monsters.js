// Voxel monsters with simple MMORPG-style AI: wander around a home point, chase when
// provoked (or on sight for aggressive types), attack in melee, leash back home, respawn.
import * as THREE from 'three';
import { mat, BLOB_GEO, BLOB_MAT, roundBox } from './character.js';

export const MONSTER_TYPES = {
  dummy:  { name: 'Training Dummy', lv: 1, hp: 1e9, atk: 0, def: 0, speed: 0, xp: 0, jobXp: 3, model: 'dummy', static: true },
  // ---- Training Grounds in Mossvale: weak, never leave their pen, come back fast
  tjelly:  { name: 'Training Jelly', lv: 1, hp: 40, atk: 3, def: 0, speed: 1.5, xp: 12, jobXp: 8, model: 'slime', color: 0xa8e07a, dark: 0x6aa84a, training: true, leash: 7, respawn: 6 },
  thopper: { name: 'Training Hopper', lv: 1, hp: 55, atk: 4, def: 0, speed: 2.2, xp: 16, jobXp: 10, model: 'bunny', color: 0xf4ecd8, dark: 0xd8b898, training: true, leash: 7, respawn: 6 },
  // ---- Time-Space bosses
  kingjelly: { name: 'Jelly King', lv: 4, hp: 900, atk: 15, def: 3, speed: 1.6, xp: 260, jobXp: 80, model: 'slime', aggro: 9, color: 0xf2c84a, dark: 0xb8862a, size: 2.2, boss: true },
  shroomlord: { name: 'Shroom Lord', lv: 7, hp: 2000, atk: 26, def: 6, speed: 1.9, xp: 600, jobXp: 150, model: 'mushroom', aggro: 9, color: 0x9a3ac8, dark: 0x5a1e7a, size: 2.3, boss: true },
  crabking: { name: 'Crab King', lv: 8, hp: 2400, atk: 29, def: 10, speed: 1.8, xp: 720, jobXp: 170, model: 'crab', aggro: 9, color: 0x3a8ae8, dark: 0x1e4a9a, size: 2.3, boss: true },
  jelly:  { name: 'Jelly', lv: 1, hp: 70, atk: 7, def: 0, speed: 1.7, xp: 14, jobXp: 9, model: 'slime', color: 0x7ccf5a, dark: 0x4f9a3a },
  hopper: { name: 'Hopper', lv: 2, hp: 95, atk: 9, def: 1, speed: 2.6, xp: 20, jobXp: 12, model: 'bunny', color: 0xe8dcc8, dark: 0xc8a888 },
  shroom: { name: 'Shroomling', lv: 4, hp: 170, atk: 15, def: 3, speed: 2.0, xp: 38, jobXp: 20, model: 'mushroom', aggro: 6, color: 0xc8483a, dark: 0x8a2a20 },
  wolf:   { name: 'Grey Wolf', lv: 6, hp: 260, atk: 22, def: 5, speed: 3.8, xp: 60, jobXp: 30, model: 'wolf', aggro: 8, color: 0x8a8a94, dark: 0x5a5a64 },
  crab:   { name: 'Rock Crab', lv: 5, hp: 220, atk: 18, def: 7, speed: 1.8, xp: 48, jobXp: 24, model: 'crab', aggro: 4.5, color: 0xd8683a, dark: 0x9a4020 },
  bluejelly: { name: 'Tide Jelly', lv: 4, hp: 150, atk: 13, def: 2, speed: 1.9, xp: 34, jobXp: 18, model: 'slime', color: 0x5ab4e8, dark: 0x2a78b0 },

  // ---- dungeon monsters (size: model scale; boss: dungeon boss, respawn: seconds until it returns)
  caveslime: { name: 'Cave Slime', lv: 6, hp: 240, atk: 20, def: 4, speed: 1.9, xp: 58, jobXp: 28, model: 'slime', aggro: 6, color: 0x9a6ad8, dark: 0x5e3a9a },
  stonecrab: { name: 'Stone Crab', lv: 7, hp: 320, atk: 24, def: 9, speed: 1.7, xp: 70, jobXp: 32, model: 'crab', aggro: 5, color: 0x8a8a90, dark: 0x5a5a62 },
  cavernking: { name: 'Cavern King Slime', lv: 9, hp: 2600, atk: 34, def: 8, speed: 1.6, xp: 600, jobXp: 180, model: 'slime', aggro: 9, color: 0x7a3ac8, dark: 0x4a1e88, size: 2.6, boss: true, respawn: 90 },
  deepjelly: { name: 'Deep Jelly', lv: 7, hp: 280, atk: 22, def: 4, speed: 2.0, xp: 66, jobXp: 30, model: 'slime', aggro: 6, color: 0x2ac8b8, dark: 0x0e7a70 },
  tidecrab: { name: 'Tide Crab', lv: 8, hp: 360, atk: 27, def: 10, speed: 1.9, xp: 80, jobXp: 36, model: 'crab', aggro: 5, color: 0x3a8ad8, dark: 0x1e4e8a },
  crabqueen: { name: 'Grotto Crab Queen', lv: 10, hp: 3200, atk: 38, def: 14, speed: 1.7, xp: 760, jobXp: 210, model: 'crab', aggro: 9, color: 0xe85a8a, dark: 0x9a2a50, size: 2.4, boss: true, respawn: 90 },
  cryptshroom: { name: 'Crypt Shroom', lv: 9, hp: 380, atk: 29, def: 8, speed: 2.1, xp: 92, jobXp: 40, model: 'mushroom', aggro: 7, color: 0x6a4a8a, dark: 0x3a2850 },
  ghostwolf: { name: 'Ghost Wolf', lv: 10, hp: 440, atk: 33, def: 8, speed: 3.9, xp: 110, jobXp: 46, model: 'wolf', aggro: 9, color: 0xb8c8d8, dark: 0x7a8aa0 },
  lichshroom: { name: 'Lich Shroom', lv: 12, hp: 4200, atk: 46, def: 16, speed: 1.8, xp: 980, jobXp: 260, model: 'mushroom', aggro: 10, color: 0x3a1e5a, dark: 0x1e0e30, size: 2.5, boss: true, respawn: 90 },
  frostjelly: { name: 'Frost Jelly', lv: 11, hp: 460, atk: 36, def: 9, speed: 2.0, xp: 120, jobXp: 50, model: 'slime', aggro: 7, color: 0xbfe8ff, dark: 0x6ab0e0 },
  snowwolf: { name: 'Snow Wolf', lv: 12, hp: 540, atk: 40, def: 11, speed: 4.1, xp: 140, jobXp: 56, model: 'wolf', aggro: 10, color: 0xeef4fa, dark: 0xa8bccc },
  frostalpha: { name: 'Alpha Frost Wolf', lv: 14, hp: 5400, atk: 55, def: 18, speed: 3.4, xp: 1300, jobXp: 320, model: 'wolf', aggro: 12, color: 0xd8ecff, dark: 0x5a86b8, size: 2.2, boss: true, respawn: 90 },
};

// every monster notices the hero inside its awareness range (aggressive types have a larger one)
export const AWARENESS = 4.5;
const NOTICE_PAUSE = 0.45;   // seconds a monster stops and stares before it gives chase
const ALERT_TIME = 1.4;      // seconds the "!" stays over its head

const BOX = new THREE.BoxGeometry(1, 1, 1);
function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const soft = Math.min(w, h, d) >= 0.09;
  const m = new THREE.Mesh(soft ? roundBox(w, h, d, 0.35) : BOX, mat(color));
  if (!soft) m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function g(parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function eyes(parent, y, z, spread = 0.16, size = 0.1) {
  for (const s of [-1, 1]) {
    box(parent, size, size * 1.5, 0.04, 0x1a1414, s * spread, y, z);
    box(parent, size * 0.4, size * 0.4, 0.03, 0xffffff, s * spread + 0.02, y + size * 0.35, z + 0.02);
  }
}

// Each builder returns { root, parts } where parts are animated by `animate`.
const BUILD = {
  dummy(t) {
    const root = new THREE.Group();
    box(root, 0.24, 1.8, 0.24, 0x6a4a2e, 0, 0.9, 0);
    box(root, 1.7, 0.2, 0.2, 0x6a4a2e, 0, 1.6, 0);
    const body = g(root);
    box(body, 0.9, 1.0, 0.65, 0xd8c070, 0, 1.55, 0);
    box(body, 0.72, 0.72, 0.65, 0xe0cc80, 0, 2.45, 0);
    box(body, 0.8, 0.16, 0.72, 0xb8342b, 0, 2.15, 0);
    return { root, body };
  },
  slime(t) {
    const root = new THREE.Group();
    const body = g(root);
    box(body, 0.9, 0.7, 0.9, t.color, 0, 0.35, 0);
    box(body, 0.7, 0.2, 0.7, t.color, 0, 0.78, 0);
    box(body, 0.2, 0.2, 0.2, 0xffffff, -0.22, 0.6, 0.35).material = mat(0xdff8d0);
    eyes(body, 0.42, 0.46, 0.18, 0.11);
    return { root, body };
  },
  bunny(t) {
    const root = new THREE.Group();
    const body = g(root);
    box(body, 0.6, 0.5, 0.75, t.color, 0, 0.35, 0);
    const head = g(body, 0, 0.7, 0.3);
    box(head, 0.5, 0.45, 0.45, t.color);
    for (const s of [-1, 1]) {
      box(head, 0.12, 0.45, 0.08, t.color, s * 0.13, 0.42, -0.05);
      box(head, 0.06, 0.32, 0.03, 0xf0a8b8, s * 0.13, 0.42, -0.005);
    }
    eyes(head, 0.02, 0.23, 0.13, 0.08);
    box(head, 0.08, 0.06, 0.03, 0xf08898, 0, -0.1, 0.24);
    box(body, 0.2, 0.2, 0.2, 0xffffff, 0, 0.4, -0.42);
    return { root, body, head };
  },
  mushroom(t) {
    const root = new THREE.Group();
    const body = g(root);
    box(body, 0.5, 0.6, 0.5, 0xf0e2c4, 0, 0.42, 0);
    const cap = g(body, 0, 0.85, 0);
    box(cap, 1.1, 0.35, 1.1, t.color);
    box(cap, 0.8, 0.2, 0.8, t.color, 0, 0.25, 0);
    for (const [x, z] of [[0.3, 0.2], [-0.25, -0.3], [-0.2, 0.35], [0.35, -0.25]]) box(cap, 0.18, 0.06, 0.18, 0xffffff, x, 0.19, z);
    eyes(body, 0.5, 0.26, 0.12, 0.09);
    const feet = [];
    for (const s of [-1, 1]) feet.push(box(body, 0.2, 0.14, 0.26, 0xd8c8a4, s * 0.14, 0.07, 0.05));
    return { root, body, cap, feet };
  },
  wolf(t) {
    const root = new THREE.Group();
    const body = g(root, 0, 0.1, 0);
    box(body, 0.6, 0.55, 1.2, t.color, 0, 0.75, 0);
    box(body, 0.5, 0.2, 0.9, 0xd8d8de, 0, 0.5, 0.05);
    const head = g(body, 0, 1.0, 0.7);
    box(head, 0.5, 0.45, 0.45, t.color);
    box(head, 0.3, 0.22, 0.35, 0xd8d8de, 0, -0.1, 0.3);
    box(head, 0.1, 0.08, 0.06, 0x1a1414, 0, -0.02, 0.48);
    for (const s of [-1, 1]) box(head, 0.12, 0.2, 0.08, t.dark, s * 0.16, 0.3, -0.08);
    eyes(head, 0.06, 0.23, 0.13, 0.07);
    const tail = g(body, 0, 0.95, -0.6);
    box(tail, 0.16, 0.16, 0.5, t.color, 0, 0, -0.22);
    const legs = [];
    for (const [x, z] of [[-0.2, 0.4], [0.2, 0.4], [-0.2, -0.4], [0.2, -0.4]]) {
      const l = g(body, x, 0.5, z);
      box(l, 0.16, 0.5, 0.18, t.dark, 0, -0.25, 0);
      legs.push(l);
    }
    return { root, body, head, tail, legs };
  },
  crab(t) {
    const root = new THREE.Group();
    const body = g(root);
    box(body, 1.0, 0.4, 0.7, t.color, 0, 0.45, 0);
    box(body, 0.8, 0.15, 0.55, t.dark, 0, 0.7, 0);
    for (const s of [-1, 1]) {
      box(body, 0.06, 0.2, 0.06, t.dark, s * 0.18, 0.75, 0.3);
      box(body, 0.12, 0.12, 0.12, 0x1a1414, s * 0.18, 0.88, 0.3);
    }
    const claws = [];
    for (const s of [-1, 1]) {
      const c = g(body, s * 0.6, 0.5, 0.35);
      box(c, 0.3, 0.25, 0.35, t.color, 0, 0, 0.15);
      box(c, 0.12, 0.12, 0.2, t.dark, s * -0.06, 0.12, 0.3);
      claws.push(c);
    }
    const legs = [];
    for (const s of [-1, 1]) for (const z of [-0.2, 0.05]) {
      const l = g(body, s * 0.5, 0.35, z);
      box(l, 0.35, 0.08, 0.08, t.dark, s * 0.15, -0.12, 0).rotation.z = s * -0.6;
      legs.push(l);
    }
    return { root, body, claws, legs };
  },
};

let nextId = 1;
export class Monster {
  constructor(typeId, home) {
    this.id = nextId++;
    this.typeId = typeId;
    this.t = MONSTER_TYPES[typeId];
    const built = BUILD[this.t.model](this.t);
    Object.assign(this, built);
    const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    blob.scale.setScalar(this.t.model === 'dummy' ? 1.3 : this.t.model === 'wolf' ? 1.4 : 1.1);
    this.root.add(blob);
    this.root.userData.monster = this;
    this.root.traverse((o) => { o.userData.monster = this; });
    this.size = this.t.size ?? 1;
    this.root.scale.setScalar(this.size);
    this.spawn = home.clone();                     // bosses always come back at their lair
    this.home = home.clone();
    this.root.position.copy(home);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.maxHp = this.t.hp;
    this.hp = this.maxHp;
    this.state = 'idle';
    this.wait = Math.random() * 3;
    this.goal = null;
    this.clock = Math.random() * 10;
    this.atkCd = 0;
    this.flash = 0;
    this.lunge = 0;
    this.deadFor = 0;
    this.provoked = false;
    this.walking = false;
    this.alert = 0;          // > 0 while the "!" is shown
    this.noticeFor = 0;
  }

  get awareness() { return this.t.aggro ?? AWARENESS; }

  get alive() { return this.state !== 'dead'; }
  get pos() { return this.root.position; }
  get height() { return { dummy: 3.1, slime: 1.2, bunny: 1.6, mushroom: 1.5, wolf: 1.7, crab: 1.2 }[this.t.model] * this.size; }

  damage(n) {
    if (!this.alive) return false;
    this.flash = 0.18;
    if (this.t.static) { this.hp = this.maxHp; return false; }
    this.hp -= n;
    if (!this.provoked) this.alert = ALERT_TIME;
    this.provoked = true;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.deadFor = 0;
      return true;
    }
    return false;
  }

  // ctx: { dt, player: Vector3, playerAlive, safe, walkable(x, z), attack(monster), respawnPoint() }
  update(ctx) {
    const { dt } = ctx;
    this.clock += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.lunge = Math.max(0, this.lunge - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.alert = Math.max(0, this.alert - dt);
    this.noticeFor = Math.max(0, this.noticeFor - dt);
    const p = this.root.position;

    if (this.state === 'dead') {
      this.deadFor += dt;
      const k = Math.min(1, this.deadFor / 0.5);
      this.root.scale.setScalar(this.size * (1 - k * 0.9));
      this.root.rotation.z = k * 1.2;
      if (k >= 1) this.root.visible = false;
      if (!this.noRespawn && this.deadFor > (this.t.respawn ?? 14)) this.respawn(this.t.boss ? this.spawn : this.area ? this.randomInArea(ctx) : ctx.respawnPoint());
      this.animate(dt, false);
      return;
    }
    if (this.t.static) { this.animate(dt, false); return; }

    const toPlayer = ctx.player.clone().sub(p).setY(0);
    const dPlayer = toPlayer.length();
    // pen monsters (Training Grounds) may chase anywhere inside their pen, others stay near home
    const leash = this.area ? !this.inArea(p, 0.5) : p.distanceTo(this.home) > (this.t.leash ?? 16);
    if (leash || !ctx.playerAlive || (ctx.safe && !this.t.training)) {
      if (this.state === 'chase' || this.state === 'attack') {
        this.state = 'return';
        this.provoked = false;
      }
    } else if (this.provoked || dPlayer < this.awareness) {
      if (!this.provoked) {                          // just noticed the hero: "!" and a short stare
        this.alert = ALERT_TIME;
        this.noticeFor = NOTICE_PAUSE;
        ctx.onNotice?.(this);
      }
      this.state = dPlayer < 1.5 + (this.size - 1) * 0.7 ? 'attack' : 'chase';
      this.provoked = true;
    }

    let speed = 0;
    let goal = null;
    if (this.state === 'idle') {
      this.wait -= dt;
      if (this.wait <= 0) {
        const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 4.5;
        const gx = this.home.x + Math.cos(a) * r, gz = this.home.z + Math.sin(a) * r;
        if (ctx.walkable(gx, gz)) { this.goal = new THREE.Vector3(gx, p.y, gz); this.state = 'wander'; }
        this.wait = 1.5 + Math.random() * 3;
      }
    } else if (this.state === 'wander') {
      goal = this.goal; speed = this.t.speed * 0.45;
      if (!goal || p.distanceTo(goal) < 0.3) { this.state = 'idle'; goal = null; }
    } else if (this.state === 'return') {
      goal = this.home; speed = this.t.speed * 1.3;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * dt * 0.5);
      if (p.distanceTo(this.home) < 0.5) { this.state = 'idle'; this.hp = this.maxHp; }
    } else if (this.state === 'chase') {
      goal = ctx.player; speed = this.t.speed;
      if (this.noticeFor > 0) { this.face(toPlayer, dt, 10); goal = null; }
      if (dPlayer < 1.4 + (this.size - 1) * 0.7) { goal = null; this.state = 'attack'; }
    } else if (this.state === 'attack') {
      this.face(toPlayer, dt, 10);
      if (this.atkCd <= 0) {
        this.atkCd = 1.6;
        this.lunge = 0.35;
        setTimeout(() => { if (this.alive && ctx.player.distanceTo(p) < 2.2 + (this.size - 1) * 0.8) ctx.attack(this); }, 180);
      }
    }

    this.walking = false;
    if (goal && speed > 0) {
      const d = goal.clone().sub(p).setY(0);
      const len = d.length();
      if (len > 0.05) {
        d.normalize();
        this.face(d, dt, 8);
        const step = Math.min(len, speed * dt);
        const nx = p.x + d.x * step, nz = p.z + d.z * step;
        if (ctx.walkable(nx, nz, p.x, p.z)) { p.x = nx; p.z = nz; }
        else if (ctx.walkable(nx, p.z, p.x, p.z)) p.x = nx;
        else if (ctx.walkable(p.x, nz, p.x, p.z)) p.z = nz;
        else if (this.state === 'wander') this.state = 'idle';
        this.walking = true;
      }
    }
    if (ctx.heightAt) p.y += (ctx.heightAt(p.x, p.z) - p.y) * Math.min(1, dt * 12);
    this.animate(dt, this.walking);
  }

  face(dir, dt, k) {
    const want = Math.atan2(dir.x, dir.z);
    let dy = want - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * Math.min(1, dt * k);
  }

  inArea(p, pad = 0) {
    const [x0, z0, x1, z1] = this.area;
    return p.x > x0 - pad && p.x < x1 + pad && p.z > z0 - pad && p.z < z1 + pad;
  }

  // a free spot inside this monster's spawn area [x0, z0, x1, z1] (Training Grounds)
  randomInArea(ctx) {
    const [x0, z0, x1, z1] = this.area;
    for (let i = 0; i < 20; i++) {
      const x = x0 + 1.5 + Math.random() * (x1 - x0 - 3), z = z0 + 1.5 + Math.random() * (z1 - z0 - 3);
      if (ctx.walkable(x, z)) return new THREE.Vector3(x, ctx.heightAt ? ctx.heightAt(x, z) : this.spawn.y, z);
    }
    return this.spawn.clone();
  }

  respawn(at) {
    this.home.copy(at);
    this.root.position.copy(at);
    this.root.scale.setScalar(this.size);
    this.root.rotation.z = 0;
    this.root.visible = true;
    this.hp = this.maxHp;
    this.state = 'idle';
    this.provoked = false;
    this.wait = 1;
  }

  animate(dt, moving) {
    const t = this.clock, b = this.body;
    const lunge = Math.sin((this.lunge / 0.35) * Math.PI) * (this.lunge > 0 ? 1 : 0);
    const flash = this.flash > 0 ? 1 + Math.sin(this.flash * 60) * 0.08 : 1;
    switch (this.t.model) {
      case 'dummy':
        b.rotation.z = Math.sin(this.flash * 30) * this.flash * 2;
        break;
      case 'slime': {
        const hop = moving ? Math.abs(Math.sin(t * 7)) : Math.abs(Math.sin(t * 2.5)) * 0.15;
        b.position.y = hop * 0.45 + lunge * 0.3;
        b.position.z = lunge * 0.5;
        b.scale.set(flash * (1 + (1 - hop) * 0.12), flash * (1 - (1 - hop) * 0.15 + hop * 0.1), flash * (1 + (1 - hop) * 0.12));
        break;
      }
      case 'bunny': {
        const hop = moving ? Math.max(0, Math.sin(t * 9)) : 0;
        b.position.y = hop * 0.35 + lunge * 0.25;
        b.position.z = lunge * 0.5;
        b.rotation.x = -hop * 0.2;
        this.head.rotation.x = Math.sin(t * 3) * 0.05;
        b.scale.setScalar(flash);
        break;
      }
      case 'mushroom': {
        const w = moving ? Math.sin(t * 9) : 0;
        b.rotation.z = w * 0.12;
        b.position.y = Math.abs(w) * 0.08;
        b.position.z = lunge * 0.5;
        this.cap.rotation.x = -lunge * 0.5;
        this.feet[0].position.z = 0.05 + w * 0.12;
        this.feet[1].position.z = 0.05 - w * 0.12;
        b.scale.setScalar(flash);
        break;
      }
      case 'wolf': {
        const w = moving ? Math.sin(t * 12) : 0;
        this.legs.forEach((l, i) => (l.rotation.x = w * 0.7 * (i === 0 || i === 3 ? 1 : -1)));
        this.tail.rotation.y = Math.sin(t * (moving ? 10 : 3)) * 0.4;
        this.tail.rotation.x = 0.4;
        this.head.rotation.x = -lunge * 0.5 + Math.sin(t * 2) * 0.04;
        b.position.z = lunge * 0.6;
        b.position.y = 0.1 + Math.abs(w) * 0.06;
        b.scale.setScalar(flash);
        break;
      }
      case 'crab': {
        const w = moving ? Math.sin(t * 14) : 0;
        this.legs.forEach((l, i) => (l.rotation.x = w * 0.5 * (i % 2 ? 1 : -1)));
        this.claws.forEach((c, i) => (c.rotation.x = -lunge * 0.9 + Math.sin(t * 3 + i) * 0.1));
        b.position.z = lunge * 0.4;
        b.rotation.z = w * 0.06;
        b.scale.setScalar(flash);
        break;
      }
    }
  }
}
