// Small voxel effects: particle cubes, slash arcs, arrows, magic bolts, rings.
import * as THREE from 'three';

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const basic = new Map();
function glow(color) {
  let m = basic.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color }); basic.set(color, m); }
  return m;
}
const fwd = (ch) => new THREE.Vector3(Math.sin(ch.root.rotation.y), 0, Math.cos(ch.root.rotation.y));

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  add(obj, life, update) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, update });
  }

  burst(pos, color, n = 14, speed = 3, size = 0.12, up = 2) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(CUBE, glow(color));
      m.position.copy(pos);
      const s = size * (0.6 + Math.random() * 0.8);
      m.scale.setScalar(s);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      v.y += up * Math.random();
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(8);
      this.add(m, 0.5 + Math.random() * 0.5, (it, dt) => {
        v.y -= 7 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt;
        m.scale.setScalar(s * (it.life / it.max));
      });
    }
  }

  // particles that swirl into a point (charging up)
  gather(target, color, n = 12) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(CUBE, glow(color));
      const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.9 + Math.random() * 0.4);
      m.scale.setScalar(0.08);
      this.add(m, 0.4 + Math.random() * 0.2, (it) => {
        const k = it.life / it.max;
        m.position.copy(target()).addScaledVector(off, k);
        m.rotation.y += 0.2;
      });
    }
  }

  arc(ch, color, vertical = true, radius = 1.3, y = 1.6) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.6, radius, 12, 1, -Math.PI * 0.35, Math.PI * 1.1), mat);
    const f = fwd(ch);
    m.position.copy(ch.root.position).addScaledVector(f, 0.55);
    m.position.y += y;
    if (vertical) { m.rotation.y = ch.root.rotation.y - Math.PI / 2; }
    else { m.rotation.x = -Math.PI / 2; m.rotation.z = ch.root.rotation.y; }
    this.add(m, 0.3, (it) => {
      const k = it.life / it.max;
      mat.opacity = 0.85 * k;
      m.scale.setScalar(1 + (1 - k) * 0.35);
    });
  }

  arrow(ch, from, dir = fwd(ch), speed = 16, onEnd) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(CUBE, glow(0xb58a5a)); shaft.scale.set(0.04, 0.04, 0.8); shaft.position.z = -0.2;
    const tip = new THREE.Mesh(CUBE, glow(0xe8eef6)); tip.scale.set(0.09, 0.09, 0.16); tip.position.z = 0.25;
    const fl = new THREE.Mesh(CUBE, glow(0xb8342b)); fl.scale.set(0.02, 0.12, 0.18); fl.position.z = -0.55;
    g.add(shaft, tip, fl);
    g.position.copy(from);
    const v = dir.clone().normalize().multiplyScalar(speed);
    g.lookAt(from.clone().add(v));
    this.add(g, 1.0, (it, dt) => {
      if (dir.y !== 0) v.y -= 6 * dt;
      g.position.addScaledVector(v, dt);
      g.lookAt(g.position.clone().add(v));
      if (g.position.y < 0.05) it.life = Math.min(it.life, dt * 0.5);
      if (!it.done && it.life < dt) { it.done = true; this.burst(g.position, 0xd8c8a0, 6, 1.5, 0.08, 1); onEnd?.(g.position); }
    });
  }

  stone(ch, from, gold) {
    const g = new THREE.Mesh(CUBE, glow(gold ? 0xf2d66a : 0x9a9aa2));
    g.scale.setScalar(gold ? 0.14 : 0.12);
    g.position.copy(from);
    const v = fwd(ch).multiplyScalar(gold ? 20 : 15);
    let trail = 0;
    this.add(g, 0.9, (it, dt) => {
      g.position.addScaledVector(v, dt);
      g.rotation.x += dt * 12; g.rotation.z += dt * 9;
      if (gold && (trail -= dt) < 0) {
        trail = 0.025;
        const p = new THREE.Mesh(CUBE, glow(0xffeaa0));
        p.position.copy(g.position);
        this.add(p, 0.25, (pt) => p.scale.setScalar(0.07 * pt.life / pt.max));
      }
      if (!it.done && it.life < dt) { it.done = true; this.burst(g.position, 0xb8b8c0, 8, 2, 0.08, 1); }
    });
  }

  // colored cubes drifting up around a character (buff auras)
  aura(ch, color, n = 3) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(CUBE, glow(color));
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 0.4;
      m.position.copy(ch.root.position).add(new THREE.Vector3(Math.cos(a) * r, 0.1 + Math.random() * 0.5, Math.sin(a) * r));
      const s = 0.06 + Math.random() * 0.05;
      this.add(m, 0.9, (it, dt) => { m.position.y += dt * 1.8; m.rotation.y += dt * 4; m.scale.setScalar(s * it.life / it.max); });
    }
  }

  bolt(ch, from, pal = [0xe0b8ff, 0x9a50ff, 0xb070ff, 0xe6ccff, 0xc28cff]) {
    const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), glow(pal[0]));
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0),
      new THREE.MeshBasicMaterial({ color: pal[1], transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(halo);
    g.position.copy(from);
    const v = fwd(ch).multiplyScalar(9);
    let trail = 0;
    this.add(g, 0.9, (it, dt) => {
      g.position.addScaledVector(v, dt);
      g.rotation.x += dt * 6; g.rotation.y += dt * 9;
      trail -= dt;
      if (trail < 0) {
        trail = 0.03;
        const p = new THREE.Mesh(CUBE, glow(Math.random() < 0.5 ? pal[2] : pal[3]));
        p.position.copy(g.position).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25));
        const s = 0.07 + Math.random() * 0.06;
        this.add(p, 0.4, (pt) => { p.scale.setScalar(s * pt.life / pt.max); p.position.y += 0.01; });
      }
      if (!it.done && it.life < dt) { it.done = true; this.burst(g.position, pal[4], 22, 4, 0.13, 1.5); }
    });
  }

  ring(center, color, maxR = 3, y = 0.08, life = 0.6, vertical = false) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 16), mat);
    m.position.copy(center); m.position.y += y;
    if (!vertical) m.rotation.x = -Math.PI / 2;
    this.add(m, life, (it) => {
      const k = 1 - it.life / it.max;
      m.scale.setScalar(0.2 + k * maxR);
      mat.opacity = 0.9 * (1 - k);
    });
  }

  dome(ch, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, wireframe: true, depthWrite: false });
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), mat);
    const fill = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.add(fill);
    m.position.copy(ch.root.position); m.position.y += 1.3;
    this.add(m, 0.9, (it) => {
      const k = it.life / it.max;
      m.scale.setScalar(0.6 + Math.min(1, (1 - k) * 4) * 0.4);
      mat.opacity = 0.45 * k; fill.material.opacity = 0.14 * k;
      m.rotation.y += 0.02;
    });
  }

  // character event hook
  handle(name, ch) {
    const c = ch.c;
    const col = parseInt(c.accent.slice(1), 16);
    const chest = ch.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    switch (name) {
      case 'slash':
        this.arc(ch, c.weapon === 'greatsword' ? 0xffe6b0 : 0xdfe9ff, c.weapon === 'greatsword', c.weapon === 'greatsword' ? 1.7 : 1.3);
        this.burst(chest.addScaledVector(fwd(ch), 1.2), 0xfff0c8, 8, 2.5, 0.08);
        break;
      case 'spin':
        this.ring(ch.root.position, 0xffe6b0, 2.6, 1.2, 0.45);
        this.burst(ch.root.position.clone().setY(1.2), col, 10, 4, 0.1, 0.5);
        break;
      case 'guard':
        this.dome(ch, 0xffd66b);
        this.ring(ch.root.position, 0xffd66b, 2.5);
        break;
      case 'charge':
        this.gather(() => (ch.staff && ch.armed ? ch.orbWorld : ch.worldPos(ch.handR)), ch.staff ? 0xd0a0ff : 0xfff2c0);
        break;
      case 'arrow': {
        const from = ch.worldPos(ch.handL);
        from.y = ch.root.position.y + 1.75;
        this.arrow(ch, from);
        break;
      }
      case 'volley': {
        const from = ch.worldPos(ch.handL);
        this.arrow(ch, from, new THREE.Vector3(0, 1, 0), 18);
        const target = ch.root.position.clone().addScaledVector(fwd(ch), 4.5);
        for (let i = 0; i < 9; i++) {
          setTimeout(() => {
            const p = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 9, (Math.random() - 0.5) * 3));
            this.arrow(ch, p, new THREE.Vector3((Math.random() - 0.5) * 0.1, -1, (Math.random() - 0.5) * 0.1), 14);
          }, 350 + i * 70);
        }
        break;
      }
      case 'bolt':
        this.bolt(ch, ch.orbWorld);
        break;
      case 'stone':
      case 'aim':
        if (name === 'aim') { this.gather(() => ch.worldPos(ch.handL, 0, 0.3, 0), 0xffeaa0, 8); break; }
        this.stone(ch, ch.worldPos(ch.handL, 0, 0.36, 0), ch.state === 'targetShot');
        break;
      case 'ebolt':
        this.bolt(ch, ch.worldPos(ch.handR).lerp(ch.worldPos(ch.handL), 0.5), [0xd8f2ff, 0x3a8aff, 0x6ec8ff, 0xffffff, 0x8ad8ff]);
        break;
      case 'punch':
        this.burst(chest.addScaledVector(fwd(ch), 1.1), 0xfff0c8, 8, 2.5, 0.08);
        break;
      case 'slam':
        this.arc(ch, 0xffe6b0, true, 1.4);
        this.ring(ch.root.position.clone().addScaledVector(fwd(ch), 1.3), 0xffe6b0, 2, 0.08, 0.4);
        this.burst(ch.root.position.clone().addScaledVector(fwd(ch), 1.3).setY(0.2), 0xb89868, 14, 3, 0.12);
        break;
      case 'dash':
        this.burst(ch.root.position.clone().setY(0.15), 0xd8c8a0, 12, 2.5, 0.12, 0.5);
        break;
      case 'buffAtk':
        this.ring(ch.root.position, 0xff5a3a, 2.6, 0.08, 0.7);
        this.burst(ch.root.position.clone().setY(1.6), 0xff7a4a, 20, 3.5, 0.12, 1.5);
        break;
      case 'buffDef':
        this.ring(ch.root.position, 0x5aa0ff, 2.6, 0.08, 0.7);
        this.dome(ch, 0x7ab8ff);
        break;
      case 'nova':
        this.ring(ch.root.position, 0xb070ff, 4.5, 0.08, 0.8);
        this.ring(ch.root.position, 0xe6ccff, 3.2, 0.1, 0.6);
        this.burst(ch.root.position.clone().setY(0.3), 0xc28cff, 30, 5, 0.14, 1);
        break;
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.update?.(it, dt);
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        this.items.splice(i, 1);
      }
    }
  }
}
