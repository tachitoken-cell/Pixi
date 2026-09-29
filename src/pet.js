// Dachshund companion in the same low-poly chamfered style as the characters.
// Long body, short legs, floppy ears, wagging tail; trots after the hero in the world.
import * as THREE from 'three';
import { mat, roundBox, BLOB_GEO, BLOB_MAT } from './character.js';

const FUR = 0x9a5428, FUR_DARK = 0x74391a, FUR_LIGHT = 0xc07a44, NOSE = 0x1e1614, COLLAR = 0xc0342a, GOLD = 0xd1a646;

function part(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(roundBox(w, h, d, 0.4), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export class Dachshund {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'dachshund';
    const body = (this.body = pivot(this.root, 0, 0.3, 0));
    // long sausage body with a lighter chest
    part(body, 0.42, 0.36, 1.55, FUR, 0, 0, 0);
    part(body, 0.34, 0.12, 1.2, FUR_LIGHT, 0, -0.15, 0.05);
    part(body, 0.4, 0.34, 0.3, FUR, 0, 0.02, 0.72);   // chest
    // head
    const head = (this.head = pivot(body, 0, 0.26, 0.86));
    part(head, 0.38, 0.34, 0.4, FUR, 0, 0.04, 0);
    part(head, 0.24, 0.2, 0.36, FUR_LIGHT, 0, -0.04, 0.3); // long snout
    part(head, 0.12, 0.1, 0.08, NOSE, 0, 0.02, 0.5);
    for (const s of [-1, 1]) {
      part(head, 0.07, 0.1, 0.03, NOSE, s * 0.11, 0.1, 0.2);            // eyes
      part(head, 0.03, 0.03, 0.02, 0xffffff, s * 0.1 + 0.015, 0.125, 0.216); // eye shine
      part(head, 0.07, 0.04, 0.1, FUR_DARK, s * 0.11, 0.17, 0.18);      // brow
    }
    // floppy ears on pivots so they swing
    this.ears = [-1, 1].map((s) => {
      const e = pivot(head, s * 0.2, 0.14, -0.02);
      part(e, 0.08, 0.3, 0.24, FUR_DARK, s * 0.03, -0.14, 0);
      e.rotation.z = s * 0.15;
      return e;
    });
    // collar with a gold tag
    part(body, 0.46, 0.08, 0.1, COLLAR, 0, 0.12, 0.8).rotation.x = 0.5;
    part(body, 0.08, 0.1, 0.03, GOLD, 0, 0.02, 0.9);
    // short legs
    this.legs = [[-1, 0.56], [1, 0.56], [-1, -0.56], [1, -0.56]].map(([s, z]) => {
      const l = pivot(body, s * 0.14, -0.14, z);
      part(l, 0.13, 0.16, 0.14, FUR, 0, -0.06, 0);
      part(l, 0.15, 0.05, 0.19, FUR_DARK, 0, -0.14, 0.03); // paw
      return l;
    });
    // tail
    this.tail = pivot(body, 0, 0.12, -0.76);
    part(this.tail, 0.08, 0.08, 0.42, FUR, 0, 0.06, -0.18).rotation.x = -0.6;
    // soft shadow
    this.blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.03;
    this.blob.scale.set(0.8, 1.3, 1);
    this.blob.visible = false;
    this.root.add(this.blob);
    this.root.scale.setScalar(0.95);
    this.t = Math.random() * 10;
    this.speed = 0;
    this.sitting = false;
  }

  // speed: current movement speed (0 = standing); drives the trot and tail wag
  update(dt, speed = 0) {
    this.t += dt;
    this.speed += (speed - this.speed) * Math.min(1, dt * 8);
    const moving = this.speed > 0.3, t = this.t;
    const step = t * (8 + this.speed * 2.2);
    this.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(step + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 : 0));
    this.body.position.y = 0.3 + (moving ? Math.abs(Math.sin(step)) * 0.05 : Math.sin(t * 2.4) * 0.008);
    this.body.rotation.x = moving ? Math.sin(step * 2) * 0.03 : 0;
    this.tail.rotation.y = Math.sin(t * (moving ? 14 : 9)) * 0.55;
    this.tail.rotation.x = moving ? -0.1 : 0.15;
    this.ears.forEach((e, i) => (e.rotation.x = moving ? Math.sin(step + i) * 0.35 : Math.sin(t * 1.5 + i) * 0.05));
    // looks around a little while idle
    this.head.rotation.y = moving ? 0 : Math.sin(t * 0.6) * 0.35;
    this.head.rotation.x = moving ? 0.05 : Math.sin(t * 0.9) * 0.06;
  }
}
