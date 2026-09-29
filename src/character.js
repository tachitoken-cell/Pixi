// Procedural voxel chibi character: built from boxes and 4-sided pyramids,
// rigged with simple pivots and animated procedurally (no model files needed).
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- materials
const matCache = new Map();
// anime cel shading: three flat light bands instead of smooth lighting
const TOON = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]), 3, 1);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const glowMats = [];
// hand-painted feel: a warm rim of light on the edges and slightly cooler, darker undersides
function paintedShader(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
    {
      vec3 vN = normalize(normal);
      float rim = pow(1.0 - max(dot(normalize(vViewPosition), vN), 0.0), 3.0);
      outgoingLight += vec3(1.0, 0.86, 0.62) * rim * 0.22 * diffuseColor.rgb;
      outgoingLight *= mix(0.9, 1.04, clamp(vN.y * 0.5 + 0.5, 0.0, 1.0));
    }
    #include <opaque_fragment>`);
}
// thin dark outline (inverted hull pushed out along the normal in view space)
const OUTLINE_MAT = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { color: { value: new THREE.Color(0x2a1a12) }, width: { value: 0.016 } },
  vertexShader: `uniform float width;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      mv.xyz += normalize(normalMatrix * normal) * width;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }',
});
export function addOutlines(root) {
  const list = [];
  root.traverse((o) => {
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!o.isMesh || !m0?.isMeshToonMaterial || o.userData.outline) return;
    list.push(o);
  });
  for (const o of list) {
    const ol = new THREE.Mesh(o.geometry, OUTLINE_MAT);
    ol.userData.outline = true;
    ol.castShadow = false;
    ol.raycast = () => {};
    o.add(ol);
  }
}
export function mat(color) {
  let m = matCache.get(color);
  if (!m) {
    // low-poly look: flat facets, soft light
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}
export function setWireframe(on) {
  for (const m of matCache.values()) m.wireframe = on;
  for (const m of glowMats) m.wireframe = on;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
// soft round contact shadow (NosTale style); drawn as a radial gradient
const BLOB_GEO = new THREE.CircleGeometry(0.75, 20);
const BLOB_MAT = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(40,30,20,0.55)');
  grad.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
})();
export { BLOB_GEO, BLOB_MAT };
const SPIKE = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
// rounded boxes (cached per size) so bodies look soft instead of blocky; very thin parts stay sharp
const roundCache = new Map();
export function roundBox(w, h, d, soft = 0.3) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${soft}`;
  let g = roundCache.get(key);
  if (!g) {
    // one bevel segment = a clean chamfer, which reads as hand-made low-poly
    g = new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * soft * 0.5);
    roundCache.set(key, g);
  }
  return g;
}
const UP = new THREE.Vector3(0, 1, 0);

function addMesh(parent, geo, color, x, y, z) {
  const m = new THREE.Mesh(geo, typeof color === 'number' ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function box(parent, w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  let m;
  if (Math.min(w, h, d) >= 0.09) m = addMesh(parent, roundBox(w, h, d), color, x, y, z);
  else { m = addMesh(parent, BOX, color, x, y, z); m.scale.set(w, h, d); }
  m.rotation.set(rx, ry, rz);
  return m;
}
// Box whose bottom face is scaled (for flared robes and sleeves).
function taper(parent, wTop, dTop, wBot, dBot, h, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(wTop, h, dTop);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0) {
      p.setX(i, p.getX(i) * (wBot / wTop));
      p.setZ(i, p.getZ(i) * (dBot / dTop));
    }
  }
  g.computeVertexNormals();
  return addMesh(parent, g, color, x, y, z);
}
// Chamfered box whose bottom is scaled: shaped torsos, flared shorts, chunky forearms.
const taperCache = new Map();
function taperGeo(w, h, d, bx, bz) {
  const key = `${w}|${h}|${d}|${bx}|${bz}`;
  if (!taperCache.has(key)) {
    const g = roundBox(w, h, d, 0.35).clone();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = 0.5 - p.getY(i) / h; // 0 top .. 1 bottom
      p.setX(i, p.getX(i) * (1 + (bx - 1) * t));
      p.setZ(i, p.getZ(i) * (1 + (bz - 1) * t));
    }
    g.computeVertexNormals();
    taperCache.set(key, g);
  }
  return taperCache.get(key);
}
function tbox(parent, w, h, d, bx, bz, color, x = 0, y = 0, z = 0) {
  return addMesh(parent, taperGeo(w, h, d, bx, bz), color, x, y, z);
}
// 4-sided pyramid from `base` pointing along `dir`.
function spike(parent, base, dir, len, r, color, twist = 0) {
  const m = addMesh(parent, SPIKE, color, base[0], base[1], base[2]);
  m.scale.set(r, len, r);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  m.quaternion.setFromUnitVectors(UP, d);
  if (twist) m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, twist));
  return m;
}
function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s & 0xffff) / 0xffff;
  };
}
function shade(color, f) {
  const c = new THREE.Color(color);
  c.multiplyScalar(f);
  return c.getHex();
}

// ---------------------------------------------------------------- dimensions
const LEG = 0.96;          // leg length stretch (taller, less stubby chibi)
const HIP = 0.86 * LEG;    // hip height (feet at 0)
const HW = 1.24, HH = 1.12, HD = 1.08; // head size

// head: a rounded box narrowed towards the chin, like an anime face
let headGeo = null;
function HEAD_GEO() {
  if (headGeo) return headGeo;
  const g = roundBox(HW, HH, HD, 0.5).clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / (HH / 2); // -1 bottom .. 1 top
    if (y < 0.1) {
      const k = Math.min(1, (0.1 - y) / 1.1);
      p.setX(i, p.getX(i) * (1 - 0.14 * k));
      if (p.getZ(i) > 0) p.setZ(i, p.getZ(i) * (1 - 0.12 * k));
    }
  }
  g.computeVertexNormals();
  headGeo = g;
  return g;
}

// ---------------------------------------------------------------- hair
const HAIR_STYLES = {
  messy:  { topN: 9,  up: 0.8, spread: 1.1, back: 0.45, len: [0.38, 0.62], ahoge: { at: [0.08, 0.1], dir: [0.15, 1, -0.35], len: 0.72, r: 0.24 } },
  swept:  { topN: 8,  up: 1.0, spread: 0.7, back: 0.85, len: [0.4, 0.66],  ahoge: { at: [0.04, 0.34], dir: [0.06, 1, -0.12], len: 0.95, r: 0.3 } },
  shaggy: { topN: 10, up: 0.55, spread: 1.35, back: 0.35, len: [0.34, 0.56], ahoge: { at: [-0.1, 0.05], dir: [-0.1, 1, -0.45], len: 0.6, r: 0.22 } },
  tall:   { topN: 9,  up: 1.7, spread: 0.55, back: 0.3, len: [0.42, 0.7],  ahoge: { at: [0.06, 0.12], dir: [0.12, 1, 0.02], len: 1.12, r: 0.27 } },
};

const HAIR_MATS = new Map();
function hairMat() {
  if (!HAIR_MATS.has('v')) HAIR_MATS.set('v', new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  return HAIR_MATS.get('v');
}
function buildHair(head, h) {
  const st = HAIR_STYLES[h.style];
  const R = rng(h.seed);
  const cA = new THREE.Color(h.color), cB = new THREE.Color(h.dark), cC = new THREE.Color(h.color).lerp(new THREE.Color(0xffffff), 0.12);
  // 1. the mass: a low-poly sphere around the skull, pushed out into clumps, open over the face
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;
  const push = new Map();
  const cx = 0, cy = HH * 0.6, cz = -0.06;
  const rx = HW / 2 + 0.1, ry = HH * 0.5 + 0.08, rz = HD / 2 + 0.12;
  const spread = 1 + (st.spread - 1) * 0.25;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    if (!push.has(key)) {
      let k = 1 + R() * 0.05;
      if (R() < 0.3) k += 0.16 + R() * 0.3;            // pointed clump tips
      if (y > 0.3) k += st.up * 0.06 * y;               // volume on top
      if (z < -0.2) k += st.back * 0.1 * -z;            // volume at the back
      if (y < -0.2) k *= 0.92;
      push.set(key, k);
    }
    const k = push.get(key);
    pos.setXYZ(v, cx + x * rx * k * spread, cy + y * ry * k, cz + z * rz * k);
  }
  // cut the face opening (front, below the forehead) and the underside
  const keep = [];
  const col = [];
  for (let f = 0; f < pos.count; f += 3) {
    let mx = 0, my = 0, mz = 0;
    for (let q = 0; q < 3; q++) { mx += pos.getX(f + q); my += pos.getY(f + q); mz += pos.getZ(f + q); }
    mx /= 3; my /= 3; mz /= 3;
    const front = mz > 0.05 && my < HH * 0.84 && Math.abs(mx) < HW * 0.44;
    const under = my < HH * 0.2;
    if (front || under) continue;
    const c = R() < 0.3 ? cB : R() < 0.2 ? cC : cA;
    for (let q = 0; q < 3; q++) { keep.push(pos.getX(f + q), pos.getY(f + q), pos.getZ(f + q)); col.push(c.r, c.g, c.b); }
  }
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  g2.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g2.computeVertexNormals();
  const mass = new THREE.Mesh(g2, hairMat());
  mass.castShadow = true;
  head.add(mass);
  // 2. bangs: big flat triangular locks over the forehead, down to the top of the eyes
  const n = 7;
  for (let b = 0; b < n; b++) {
    const t = b / (n - 1);
    const x = (t - 0.5) * HW * 0.95;
    const len = 0.34 + (1 - Math.abs(t - 0.5) * 2) * 0.1 + R() * 0.1;
    const m = spike(head, [x, HH * 0.9, HD / 2 + 0.03], [x * 0.25 + (R() - 0.5) * 0.3, -1, 0.12], len, 0.2, R() < 0.35 ? h.dark : h.color, Math.PI / 4);
    m.scale.z *= 0.45;
  }
  // side locks over the ears down to the jaw
  for (const sd of [-1, 1]) for (let b = 0; b < 2; b++) {
    const m = spike(head, [sd * (HW / 2 + 0.05), HH * (0.7 - b * 0.06), 0.28 - b * 0.3], [sd * 0.2, -1, 0.1], 0.55, 0.22, b ? h.dark : h.color, Math.PI / 4);
    m.scale.x *= 0.5;
  }
  // 3. a few big spikes on top (style) and the signature lock
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + R();
    spike(head, [Math.cos(a) * 0.25, HH * 1.02, Math.sin(a) * 0.25 - 0.1], [Math.cos(a) * 0.8, 1.2 * st.up + 0.3, Math.sin(a) * 0.8 - st.back], 0.4 + R() * 0.2, 0.26, R() < 0.3 ? h.dark : h.color, R());
  }
  const ah = st.ahoge;
  spike(head, [ah.at[0], HH * 1.05, ah.at[1]], ah.dir, ah.len * 0.9, ah.r * 1.2, h.color);
}

// ---------------------------------------------------------------- face
// painted anime features (drawn once per colour into small canvas textures)
const faceTex = new Map();
function paint(key, w, h, draw) {
  if (!faceTex.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    faceTex.set(key, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  }
  return faceTex.get(key);
}
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
function eyeMat(iris, side) {
  return paint(`eye${iris}${side}`, 64, 96, (g, w, h) => {
    const col = new THREE.Color(iris), light = col.clone().lerp(new THREE.Color(0xffffff), 0.45);
    // white of the eye
    g.fillStyle = '#fbf6ee';
    g.beginPath(); g.ellipse(32, 54, 24, 36, 0, 0, Math.PI * 2); g.fill();
    // iris with a gradient, dark at the top like anime eyes
    const gr = g.createLinearGradient(0, 22, 0, 90);
    gr.addColorStop(0, '#15100e'); gr.addColorStop(0.45, hex(col.getHex())); gr.addColorStop(1, `#${light.getHexString()}`);
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(32 - side * 2, 58, 19, 30, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d0907';
    g.beginPath(); g.ellipse(32 - side * 2, 58, 8, 13, 0, 0, Math.PI * 2); g.fill();
    // highlights
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(24 - side * 2, 44, 7, 9, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(39 - side * 2, 74, 3.5, 3.5, 0, 0, Math.PI * 2); g.fill();
    // thick upper lash line with a flick at the outer corner
    g.strokeStyle = '#1a120e'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.ellipse(32, 54, 26, 36, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    g.beginPath(); g.moveTo(32 + side * 25, 38); g.lineTo(32 + side * 31, 30); g.stroke();
  });
}
// The whole face is painted into one texture on the front of the head, so the features
// sit on the rounded surface (no floating stickers). Two versions: eyes open / closed.
const faceCache = new Map();
function faceMats(c) {
  const key = `${c.skin}|${c.eyes}|${c.hair.dark}`;
  if (faceCache.has(key)) return faceCache.get(key);
  const make = (closed) => {
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = hex(c.skin);
    g.fillRect(0, 0, S, S);
    // eyes: tall dark rounded blocks with a hint of the eye colour at the bottom
    const iris = new THREE.Color(c.eyes).lerp(new THREE.Color(0x14100e), 0.55);
    for (const s of [-1, 1]) {
      const ex = S / 2 + s * 46, ey = 146, w = 34, h = closed ? 6 : 78;
      const x = ex - w / 2, y = closed ? ey + 18 : ey - h / 2;
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, '#15110f'); gr.addColorStop(0.6, '#1c1614'); gr.addColorStop(1, `#${iris.getHexString()}`);
      g.fillStyle = closed ? '#2a1e18' : gr;
      g.beginPath(); g.roundRect(x, y, w, h, closed ? 3 : 7); g.fill();
    }
    // small mouth
    g.strokeStyle = '#6e3a2c'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(S / 2 - 11, 212); g.quadraticCurveTo(S / 2, 217, S / 2 + 11, 211); g.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.magFilter = THREE.LinearFilter;
    return new THREE.MeshLambertMaterial({ map: t, flatShading: true });
  };
  const mats = { open: make(false), closed: make(true) };
  faceCache.set(key, mats);
  return mats;
}
function buildFace(head, c) {
  const skin = mat(c.skin), face = faceMats(c);
  // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z
  const m = addMesh(head, HEAD_GEO(), [skin, skin, skin, skin, face.open, skin], 0, HH / 2, 0);
  for (const s of [-1, 1]) box(head, 0.09, 0.2, 0.16, c.skin, s * (HW / 2 + 0.03), 0.42, 0.02); // ears
  return { mesh: m, face };
}

// ---------------------------------------------------------------- weapons
function sword(parent, big, wooden) {
  const g = group(parent);
  const blade = wooden ? 0xa77b4d : 0xcdd3dc;
  const edge = wooden ? 0x86603a : 0x9aa3b0;
  const L = big ? 1.2 : wooden ? 0.7 : 0.9;
  const W = big ? 0.17 : 0.12;
  box(g, 0.08, 0.28, 0.08, 0x4a2e1c, 0, 0.0, 0);
  box(g, 0.12, 0.08, 0.12, 0xd1a646, 0, -0.17, 0);
  if (!wooden) {
    box(g, big ? 0.46 : 0.38, 0.09, 0.11, 0xd1a646, 0, 0.17, 0);
    for (const s of [-1, 1]) box(g, 0.08, 0.14, 0.11, 0xd1a646, s * (big ? 0.24 : 0.2), 0.2, 0);
    const gem = box(g, 0.09, 0.09, 0.12, 0x3a7ae0, 0, 0.17, 0);
    gem.rotation.z = Math.PI / 4;
  }
  else box(g, 0.26, 0.06, 0.08, 0x6b4a2e, 0, 0.17, 0);
  box(g, W, L, 0.05, blade, 0, 0.21 + L / 2, 0);
  box(g, W * 0.3, L * 0.85, 0.06, edge, 0, 0.21 + L * 0.44, 0);
  spike(g, [0, 0.21 + L, 0], [0, 1, 0], W * 1.1, W * 0.72, blade).scale.z = 0.04;
  return g;
}
function shield(parent, c) {
  const g = group(parent);
  const col = c.tabard.color, trim = c.tabard.trim;
  box(g, 0.06, 0.62, 0.56, 0xb8bcc4, 0.005, 0, 0); // silver rim
  box(g, 0.07, 0.56, 0.5, col, 0, 0, 0);
  const tip = spike(g, [0, -0.28, 0], [0, -1, 0], 0.26, 0.35, col, Math.PI / 4);
  tip.scale.set(0.05, 0.26, 0.35);
  box(g, 0.08, 0.06, 0.54, trim, 0, 0.29, 0);
  for (const s of [-1, 1]) box(g, 0.08, 0.56, 0.05, trim, 0, 0, s * 0.26);
  box(g, 0.09, 0.34, 0.07, trim, 0, 0.0, 0);
  box(g, 0.09, 0.07, 0.24, trim, 0, 0.06, 0);
  return g;
}
function bow(parent) {
  const g = group(parent);
  const wood = 0x7a4c2a;
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = -1 + (i / 8) * 2;
    pts.push(new THREE.Vector3(0, t * 0.62, 0.1 - 0.26 * t * t));
  }
  for (let i = 0; i < 8; i++) {
    const a = pts[i], b = pts[i + 1];
    const m = box(g, 0.07, a.distanceTo(b) + 0.03, 0.08, i === 3 || i === 4 ? 0x3e2616 : wood);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.rotation.x = Math.atan2(b.z - a.z, b.y - a.y) * -1;
  }
  const tipA = pts[0], tipB = pts[8];
  const s1 = box(g, 0.018, 1, 0.018, 0xf2ead8);
  const s2 = box(g, 0.018, 1, 0.018, 0xf2ead8);
  const nock = group(g);
  const arrow = group(nock);
  box(arrow, 0.03, 0.03, 0.8, 0xb58a5a, 0, 0, 0.4);
  spike(arrow, [0, 0, 0.8], [0, 0, 1], 0.14, 0.06, 0xcdd3dc);
  box(arrow, 0.01, 0.08, 0.14, 0xe0e0e0, 0, 0, 0.08);
  arrow.visible = false;
  const tmp = new THREE.Vector3();
  const setDraw = (d) => {
    nock.position.set(0, 0, tipA.z - 0.02 - d * 0.5);
    for (const [s, tp] of [[s1, tipA], [s2, tipB]]) {
      tmp.copy(nock.position).sub(tp);
      s.position.copy(tp).add(nock.position).multiplyScalar(0.5);
      s.scale.y = tmp.length();
      s.quaternion.setFromUnitVectors(UP, tmp.normalize());
    }
    arrow.visible = d > 0.05;
  };
  setDraw(0);
  return { g, setDraw };
}
function slingshot(parent) {
  const g = group(parent);
  const wood = 0x8a5a32;
  box(g, 0.07, 0.3, 0.07, wood, 0, 0.08, 0);
  for (const s of [-1, 1]) box(g, 0.06, 0.2, 0.06, wood, s * 0.07, 0.3, 0, 0, 0, s * -0.45);
  const tips = [new THREE.Vector3(-0.12, 0.38, 0), new THREE.Vector3(0.12, 0.38, 0)];
  const bands = tips.map(() => box(g, 0.025, 1, 0.025, 0x9a3a2a));
  const pouch = group(g);
  box(pouch, 0.1, 0.06, 0.06, 0x5a3520);
  const stone = box(pouch, 0.08, 0.08, 0.08, 0x8a8a92, 0, 0.04, 0);
  const tmp = new THREE.Vector3();
  const setDraw = (d) => {
    pouch.position.set(0, 0.36, -0.03 - d * 0.5);
    tips.forEach((tp, i) => {
      tmp.copy(pouch.position).sub(tp);
      bands[i].position.copy(tp).add(pouch.position).multiplyScalar(0.5);
      bands[i].scale.y = tmp.length();
      bands[i].quaternion.setFromUnitVectors(UP, tmp.normalize());
    });
    stone.visible = d > 0.05;
  };
  setDraw(0);
  return { g, setDraw };
}
function staff(parent) {
  const g = group(parent);
  box(g, 0.08, 1.95, 0.08, 0x6b4a2e, 0, 0.3, 0);
  box(g, 0.11, 0.2, 0.11, 0x4a2e5c, 0, 0.05, 0);
  box(g, 0.14, 0.08, 0.14, 0xd1a646, 0, 1.27, 0);
  for (const s of [-1, 1]) {
    spike(g, [s * 0.05, 1.3, 0], [s * 0.9, 1, 0], 0.3, 0.06, 0xd1a646);
    spike(g, [0, 1.3, s * 0.05], [0, 1, s * 0.9], 0.26, 0.05, 0xd1a646);
  }
  const gm = new THREE.MeshBasicMaterial({ color: 0x8ad0ff });
  glowMats.push(gm);
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), gm);
  orb.scale.y = 1.3;
  orb.position.set(0, 1.47, 0);
  g.add(orb);
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0),
    new THREE.MeshBasicMaterial({ color: 0x3a90ff, transparent: true, opacity: 0.25, depthWrite: false }));
  orb.add(halo);
  const light = new THREE.PointLight(0x6ab0ff, 1.2, 3, 2);
  orb.add(light);
  return { g, orb, halo, light };
}

// ---------------------------------------------------------------- body parts
function buildLeg(body, c, side) {
  const leg = group(body, side * 0.19, 0, 0);
  const long = !!c.robe;
  tbox(leg, 0.34, 0.36, 0.38, 1.18, 1.12, c.pants, 0, -0.14, 0);          // shorts flare out
  tbox(leg, 0.22, 0.24, 0.24, 0.9, 0.9, long ? c.pants : c.skin, 0, -0.4, 0); // knee / shin
  tbox(leg, 0.4, 0.16, 0.44, 0.9, 0.9, c.bootCuff, 0, -0.5, 0.01);         // folded cuff
  box(leg, 0.34, 0.24, 0.4, c.boot, 0, -0.66, 0.02);
  box(leg, 0.32, 0.14, 0.2, c.boot, 0, -0.74, 0.2);                        // toe
  box(leg, 0.36, 0.06, 0.58, c.sole, 0, -0.81, 0.08);
  if (c.tabard) {
    box(leg, 0.3, 0.4, 0.05, c.tabard.color, side * 0.02, -0.15, 0.23);
    box(leg, 0.05, 0.4, 0.06, c.tabard.trim, side * 0.15, -0.15, 0.235);
    box(leg, 0.3, 0.05, 0.06, c.tabard.trim, side * 0.02, -0.36, 0.235);
  }
  return leg;
}

function buildArm(torso, c, side) {
  const sh = group(torso, side * 0.47, 0.52, 0);
  if (c.robe) {
    const r = c.robe;
    taper(sh, 0.3, 0.32, 0.44, 0.46, 0.46, r.color, 0, -0.2, 0);
    box(sh, 0.48, 0.14, 0.5, r.cuff, 0, -0.47, 0);
    box(sh, 0.5, 0.04, 0.52, r.trim, 0, -0.41, 0);
  } else {
    tbox(sh, 0.3, 0.26, 0.32, 1.12, 1.1, c.shirt, 0, -0.08, 0);               // puffy sleeve
    tbox(sh, 0.18, 0.16, 0.2, 0.95, 0.95, c.skin, 0, -0.27, 0);
    tbox(sh, 0.26, 0.24, 0.28, 1.18, 1.15, c.glove === c.skin ? c.bracer : c.glove, 0, -0.44, 0); // bracer widens to the wrist
    box(sh, 0.3, 0.06, 0.32, c.cuff, 0, -0.34, 0);
  }
  box(sh, 0.3, 0.26, 0.3, c.glove, 0, -0.66, 0.01);
  if (c.glove !== c.skin) {
    box(sh, 0.1, 0.12, 0.12, c.glove, side * -0.12, -0.61, 0.1); // thumb
    box(sh, 0.3, 0.07, 0.3, shade(c.glove, 0.75), 0, -0.53, 0.01); // glove cuff
  }
  const hand = group(sh, 0, -0.64, 0.02);
  return { sh, hand };
}

function buildTorso(torso, c) {
  // base shirt/torso
  const baseCol = c.robe ? c.robe.color : c.tunic ? c.tunic.color : c.shirt;
  tbox(torso, 0.8, 0.62, 0.48, 0.86, 0.9, baseCol, 0, 0.31, 0);  // chest wider than the waist
  if (!c.robe) for (const s of [-1, 1]) box(torso, 0.16, 0.12, 0.05, shade(c.shirt, 1.04), s * 0.08, 0.6, 0.25, 0, 0, s * 0.5); // collar
  box(torso, 0.8, 0.12, 0.52, c.belt, 0, 0.04, 0);
  box(torso, 0.19, 0.14, 0.06, 0xd1a646, 0, 0.04, 0.27);
  box(torso, 0.09, 0.06, 0.07, 0x3a2616, 0, 0.04, 0.275);
  // pouches on the belt
  box(torso, 0.16, 0.16, 0.12, shade(c.belt, 1.15), 0.3, -0.02, 0.22);
  box(torso, 0.17, 0.05, 0.13, shade(c.belt, 0.8), 0.3, 0.06, 0.22);
  box(torso, 0.2, 0.1, 0.2, c.skin, 0, 0.66, 0); // neck

  if (c.vest) {
    const v = c.vest;
    // open vest shows the shirt in the middle
    box(torso, 0.2, 0.18, 0.02, c.skin, 0, 0.52, 0.232);
    for (const s of [-1, 1]) {
      box(torso, 0.27, 0.6, 0.06, v.color, s * 0.235, 0.33, 0.24);
      box(torso, 0.06, 0.6, 0.48, v.color, s * 0.385, 0.33, 0);
      box(torso, 0.3, 0.08, 0.5, v.color, s * 0.24, 0.6, 0);
      if (v.trim) box(torso, 0.05, 0.6, 0.07, v.trim, s * 0.12, 0.33, 0.245);
      if (c.straps && !c.xStraps) {
        box(torso, 0.08, 0.6, 0.07, c.straps, s * 0.2, 0.34, 0.27);
        box(torso, 0.1, 0.07, 0.08, 0xd1a646, s * 0.2, 0.3, 0.28);
      }
      if (c.xStraps) box(torso, 0.08, 0.78, 0.05, c.straps, 0, 0.33, 0.275, 0, 0, s * 0.62);
    }
    box(torso, 0.76, 0.6, 0.06, v.color, 0, 0.33, -0.24);
    if (c.straps) box(torso, 0.62, 0.08, 0.07, c.straps, 0, 0.44, -0.27);
  }
  if (c.tunic) {
    const t = c.tunic;
    box(torso, 0.2, 0.2, 0.02, c.shirt, 0, 0.52, 0.232);
    box(torso, 0.1, 0.1, 0.02, c.skin, 0, 0.56, 0.24);
    for (const s of [-1, 1]) box(torso, 0.12, 0.26, 0.03, t.dark, s * 0.12, 0.48, 0.235, 0, 0, s * 0.35);
    // diagonal strap with buckle
    box(torso, 0.09, 0.9, 0.05, c.sash, -0.02, 0.33, 0.25, 0, 0, -0.78);
    box(torso, 0.09, 0.9, 0.05, c.sash, -0.02, 0.33, -0.25, 0, 0, 0.78);
    box(torso, 0.1, 0.1, 0.07, 0xd1a646, -0.06, 0.3, 0.27);
    // tunic skirt
    taper(torso, 0.78, 0.5, 0.86, 0.56, 0.24, t.color, 0, -0.12, 0);
    box(torso, 0.04, 0.24, 0.02, t.dark, 0, -0.12, 0.27);
  }
  if (c.robe) {
    const r = c.robe;
    box(torso, 0.22, 0.6, 0.02, r.panel, 0, 0.33, 0.232);
    for (const s of [-1, 1]) {
      box(torso, 0.05, 0.62, 0.03, r.trim, s * 0.13, 0.32, 0.24);
      box(torso, 0.12, 0.34, 0.14, r.panel, s * 0.36, 0.78, -0.08, 0, 0, s * -0.25); // stand collar
      box(torso, 0.16, 0.36, 0.04, r.trim, s * 0.18, 0.5, 0.25, 0, 0, s * 0.35); // lapels
    }
    box(torso, 0.74, 0.34, 0.12, r.panel, 0, 0.78, -0.24);
    box(torso, 0.78, 0.05, 0.14, r.trim, 0, 0.96, -0.24);
  }
  if (c.scarf) {
    box(torso, 0.5, 0.14, 0.52, c.scarf, 0, 0.64, 0);
    spike(torso, [0.06, 0.62, 0.26], [0.25, -1, 0.35], 0.34, 0.14, c.scarf, 0.4);
    spike(torso, [-0.06, 0.6, 0.26], [-0.2, -1, 0.3], 0.28, 0.1, shade(c.scarf, 0.8), -0.3);
  }
}

function buildRobeSkirt(body, c) {
  const r = c.robe;
  const skirt = group(body, 0, 0, 0);
  taper(skirt, 0.8, 0.52, 1.04, 0.74, 0.7, r.color, 0, -0.35, 0);
  box(skirt, 1.06, 0.06, 0.76, r.trim, 0, -0.68, 0);
  // open front showing the lighter under-robe
  const p = taper(skirt, 0.2, 0.04, 0.34, 0.04, 0.66, r.panel, 0, -0.35, 0.3);
  p.rotation.x = -0.12;
  for (const s of [-1, 1]) {
    const t = taper(skirt, 0.05, 0.05, 0.05, 0.05, 0.7, r.trim, s * 0.14, -0.35, 0.31, 0);
    t.rotation.set(-0.12, 0, s * 0.1);
  }
  return skirt;
}

// ---------------------------------------------------------------- poses
const KEYS = ['bodyY', 'bodyX', 'bodyZ', 'bodyRY', 'torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'headZ',
  'armLX', 'armLY', 'armLZ', 'armRX', 'armRY', 'armRZ', 'legLX', 'legLZ', 'legRX', 'legRZ',
  'wRX', 'wRZ', 'wLX', 'wLZ', 'draw'];

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg = (p, a, b) => ease((p - a) / (b - a));
const mix = (a, b, k) => a + (b - a) * k;

// Default hands/weapon posture per class, layered under every animation.
function hold(c, armed) {
  const p = { armLZ: 0.16, armRZ: -0.16 };
  if (!armed) return p;
  switch (c.weapon) {
    case 'greatsword': Object.assign(p, { armRX: -0.25, wRX: 1.9 }); break;
    case 'woodSword': Object.assign(p, { armRX: -0.15, wRX: 1.9 }); break;
    case 'swordShield': Object.assign(p, { armRX: -0.2, wRX: 1.9, armLX: -0.35, armLZ: 0.1 }); break;
    case 'staff': Object.assign(p, { armRX: -0.35, wRX: 0.35, wRZ: 0.16 }); break;
    case 'bow': Object.assign(p, { armLX: -0.1, wLX: 0.1, wLZ: -0.16 }); break;
  }
  return p;
}

const ANIMS = {
  idle: {
    loop: true,
    pose(t) {
      const b = Math.sin(t * 2.2);
      return { bodyY: b * 0.018, torsoX: b * 0.02, headX: -b * 0.025, headZ: Math.sin(t * 0.7) * 0.03,
        armLZ: 0.16 + b * 0.03, armRZ: -0.16 - b * 0.03 };
    },
  },
  walk: {
    loop: true,
    pose(t, c) {
      const w = t * 8.5, s = Math.sin(w), k = c.stride;
      return { bodyY: Math.abs(Math.cos(w)) * 0.06 - 0.02, torsoY: s * 0.1, headY: -s * 0.06, torsoX: 0.05,
        legLX: -s * 0.6 * k, legRX: s * 0.6 * k, armLX: s * 0.55, armRX: -s * 0.55, armLZ: 0.14, armRZ: -0.14 };
    },
  },
  run: {
    loop: true,
    pose(t, c) {
      const w = t * 12.5, s = Math.sin(w), k = c.stride;
      return { bodyY: Math.abs(Math.cos(w)) * 0.12 - 0.02, bodyX: 0.18, torsoY: s * 0.16, headX: -0.12,
        legLX: -s * 0.95 * k, legRX: s * 0.95 * k, armLX: s * 1.0, armRX: -s * 1.0, armLZ: 0.22, armRZ: -0.22 };
    },
  },
  sprint: {
    loop: true,
    pose(t, c) {
      const w = t * 16, s = Math.sin(w), k = c.stride;
      return { bodyY: Math.abs(Math.cos(w)) * 0.16 - 0.04, bodyX: 0.32, torsoY: s * 0.2, headX: -0.22,
        legLX: -s * 1.15 * k, legRX: s * 1.15 * k, armLX: s * 1.3, armRX: -s * 1.3, armLZ: 0.28, armRZ: -0.28 };
    },
  },
  attack: {
    dur: { greatsword: 0.85, swordShield: 0.6, bow: 1.05, staff: 1.0, woodSword: 0.55, none: 0.5 },
    pose(t, c, D, armed) {
      const p = t / D;
      const w = armed ? c.weapon : 'none';
      if (w === 'greatsword') {
        const up = seg(p, 0, 0.4), dn = seg(p, 0.42, 0.55), back = seg(p, 0.75, 1);
        const ax = mix(mix(-0.25, -2.9, up), -0.45, dn);
        return { armRX: mix(ax, -0.25, back), armLX: mix(ax, 0, back), armLZ: mix(-0.3, 0.16, back), armRZ: mix(0.3, -0.16, back),
          torsoX: mix(mix(0, -0.22, up), 0.35, dn) * (1 - back), bodyY: -0.13 * dn * (1 - back), wRX: 2.1,
          headX: 0.1 * dn * (1 - back), legLX: -0.35 * dn * (1 - back), legRX: 0.3 * dn * (1 - back) };
      }
      if (w === 'swordShield' || w === 'woodSword' || w === 'none') {
        const up = seg(p, 0, 0.35), hit = seg(p, 0.38, 0.5), back = seg(p, 0.7, 1);
        const k = (1 - back);
        return { armRX: mix(mix(-0.2, 0.35, up), -1.6, hit) * k + -0.2 * back, armRZ: mix(-0.5 * up, 0.12, hit) * k - 0.16 * back,
          torsoY: mix(0.4 * up, -0.4, hit) * k, bodyY: -0.06 * hit * k, wRX: w === 'none' ? 0 : mix(2.3, 2.95, hit),
          armLX: (w === 'swordShield' ? -1.2 : 0.3) * k - (w === 'swordShield' ? 0.35 : 0) * back, armLZ: 0.2,
          legLX: -0.3 * hit * k, legRX: 0.25 * hit * k };
      }
      if (w === 'bow') {
        const raise = seg(p, 0, 0.18), draw = seg(p, 0.18, 0.58), rel = seg(p, 0.6, 0.66), back = seg(p, 0.82, 1);
        const k = 1 - back;
        return { torsoY: -0.55 * raise * k, headY: 0.5 * raise * k,
          armLX: -1.5 * raise * k, armLZ: mix(0.16, -0.02, raise), wLX: 1.5 * raise * k + 0.1 * back, wLZ: -0.16 * back,
          armRX: mix(-1.35 * raise, -0.7, rel) * k, armRZ: mix(-0.16 + 0.55 * raise + 0.35 * draw, -0.7, rel) * k - 0.16 * back,
          draw: draw * (1 - rel), bodyY: -0.04 * raise * k };
      }
      if (w === 'staff') {
        const up = seg(p, 0, 0.38), cast = seg(p, 0.42, 0.52), back = seg(p, 0.78, 1);
        const k = 1 - back;
        return { armRX: mix(mix(-0.35, -2.7, up), -1.45, cast) * k - 0.35 * back, wRX: mix(mix(0.35, 2.7, up), 3.0, cast) * k + 0.35 * back,
          wRZ: 0.16 * back, armLX: mix(-0.6 * up, -1.3, cast) * k, armLZ: mix(0.16 + 0.5 * up, 0.35, cast) * k + 0.16 * back,
          headX: mix(-0.25 * up, 0.08, cast) * k, torsoX: mix(-0.12 * up, 0.2, cast) * k, bodyY: -0.08 * cast * k };
      }
      return {};
    },
    events: {
      greatsword: [[0.46, 'slash']], swordShield: [[0.42, 'slash']], woodSword: [[0.42, 'slash']], none: [[0.42, 'slash']],
      bow: [[0.18, 'charge'], [0.6, 'arrow']], staff: [[0.12, 'charge'], [0.46, 'bolt']],
    },
  },
  skill: {
    dur: { greatsword: 1.1, swordShield: 1.1, bow: 1.2, staff: 1.3, woodSword: 0.9, none: 0.9 },
    pose(t, c, D, armed) {
      const p = t / D;
      const w = armed ? c.weapon : 'none';
      if (w === 'greatsword' || w === 'woodSword' || w === 'none') { // whirlwind / spin slash
        const k = seg(p, 0, 0.12) * (1 - seg(p, 0.85, 1));
        const spin = seg(p, 0.1, 0.85) * Math.PI * 4;
        return { bodyRY: spin, armRX: -1.5 * k, armRZ: -0.9 * k - 0.16, armLX: -1.5 * k * (w === 'greatsword' ? 1 : 0.2),
          armLZ: (w === 'greatsword' ? -0.2 : 1.0) * k + 0.16, wRX: mix(1.9, 2.9, k), bodyY: -0.1 * k + Math.sin(p * Math.PI) * 0.15, bodyX: 0.15 * k };
      }
      if (w === 'swordShield') { // guard: shield up, gold dome
        const k = seg(p, 0, 0.15) * (1 - seg(p, 0.8, 1));
        return { armLX: -1.45 * k - 0.35, armLY: -0.6 * k, armLZ: 0.1, torsoY: 0.2 * k, bodyY: -0.12 * k,
          armRX: 0.3 * k - 0.2, legLX: -0.35 * k, legRX: 0.25 * k, headX: 0.1 * k, wRX: 1.9 };
      }
      if (w === 'bow') { // shoot a volley into the sky
        const raise = seg(p, 0, 0.2), draw = seg(p, 0.2, 0.5), rel = seg(p, 0.52, 0.58), back = seg(p, 0.85, 1);
        const k = 1 - back;
        return { torsoY: -0.4 * raise * k, torsoX: -0.2 * raise * k, headX: -0.4 * raise * k,
          armLX: -2.4 * raise * k, wLX: 1.5 * raise * k, wLZ: -0.16 * back,
          armRX: mix(-2.2 * raise, -1.8, rel) * k, armRZ: mix(-0.16 + 0.4 * raise, -0.8, rel) * k - 0.16 * back,
          draw: draw * (1 - rel), bodyY: -0.08 * raise * k };
      }
      if (w === 'staff') { // nova: both arms up, then slam
        const up = seg(p, 0, 0.45), slam = seg(p, 0.5, 0.6), back = seg(p, 0.85, 1);
        const k = 1 - back;
        return { armRX: mix(-3.0 * up, -0.4, slam) * k - 0.35 * back, armLX: mix(-3.0 * up, -0.4, slam) * k,
          armLZ: mix(0.16 + 0.3 * up, 0.9, slam) * k + 0.16 * back, armRZ: mix(-0.16 - 0.3 * up, -0.9, slam) * k,
          wRX: mix(mix(0.35, 3.0, up), 0.35, slam), wRZ: 0.16, headX: mix(-0.35 * up, 0.2, slam) * k,
          bodyY: mix(0.18 * up, -0.2, slam) * k };
      }
      return {};
    },
    events: {
      greatsword: [[0.2, 'spin'], [0.5, 'spin']], woodSword: [[0.2, 'spin']], none: [[0.2, 'spin']],
      swordShield: [[0.16, 'guard']], bow: [[0.55, 'volley']], staff: [[0.1, 'charge'], [0.56, 'nova']],
    },
  },
  wave: {
    dur: 1.6,
    pose(t, c, D) {
      const k = seg(t, 0, 0.2) * (1 - seg(t, D - 0.25, D));
      return { armRZ: -0.16 - 2.5 * k, armRX: -0.2 * k, armRY: Math.sin(t * 14) * 0.35 * k, headZ: 0.12 * k, headY: -0.1 * k, torsoZ: 0.05 * k };
    },
  },
  victory: {
    dur: 1.8,
    pose(t, c, D) {
      const k = seg(t, 0, 0.15) * (1 - seg(t, D - 0.3, D));
      const j = Math.max(0, Math.sin(Math.min(t, D - 0.3) * 7));
      return { bodyY: j * 0.4 * k, armLZ: 0.16 + 2.4 * k, armRZ: -0.16 - 2.4 * k, armLX: -0.3 * k, armRX: -0.3 * k,
        headX: -0.2 * k, legLX: -0.3 * j * k, legRX: -0.3 * j * k, legLZ: 0.1 * k, legRZ: -0.1 * k };
    },
  },
  hit: {
    dur: 0.45,
    pose(t, c, D) {
      const k = Math.sin(Math.min(1, t / D) * Math.PI);
      return { torsoX: -0.35 * k, headX: -0.3 * k, bodyY: -0.05 * k, bodyZ: 0.05 * k, armLX: 0.4 * k, armRX: 0.4 * k, legLX: 0.2 * k };
    },
  },
  sit: {
    loop: true,
    pose(t) {
      const b = Math.sin(t * 1.6);
      return { bodyY: -0.6 * LEG, legLX: -1.45, legRX: -1.45, legLZ: 0.12, legRZ: -0.12, torsoX: 0.12 + b * 0.015,
        armLX: -0.75, armRX: -0.75, armLZ: 0.05, armRZ: -0.05, headX: 0.1 + b * 0.02, headZ: 0.08, wRX: 1.57, wLX: 0.4 };
    },
  },
};
// ---- Adventurer skills (Job Lv. 1-19). Names match src/skills.js.
const pulse = (p, a, b, c) => seg(p, a, b) * (1 - seg(p, b, c));
function slingPose(p, drawStart, drawEnd, rel) {
  const raise = seg(p, 0, drawStart), draw = seg(p, drawStart, drawEnd), r = seg(p, rel, rel + 0.06), back = seg(p, 0.85, 1);
  const k = 1 - back;
  return { torsoY: -0.45 * raise * k, headY: 0.4 * raise * k,
    armLX: -1.5 * raise * k, armLZ: mix(0.16, 0, raise), wLX: 1.5 * raise * k, wLZ: -0.16 * back,
    armRX: mix(-1.35 * raise, -0.8, r) * k - 0.15 * back, armRZ: mix(-0.16 + 0.5 * raise + 0.3 * draw, -0.7, r) * k - 0.16 * back,
    draw: draw * (1 - r), bodyY: -0.04 * raise * k };
}
Object.assign(ANIMS, {
  slingshot: {
    dur: 0.8, prop: 'sling',
    pose: (t, c, D) => slingPose(t / D, 0.15, 0.5, 0.55),
    events: [[0.56, 'stone']],
  },
  targetShot: {
    dur: 1.25, prop: 'sling',
    pose(t, c, D) {
      const p = t / D, aim = seg(p, 0.35, 0.7);
      return { ...slingPose(p, 0.12, 0.35, 0.72), bodyY: -0.1 * aim * (1 - seg(p, 0.85, 1)), headX: 0.08 * aim };
    },
    events: [[0.3, 'aim'], [0.73, 'stone']],
  },
  strongHit: {
    dur: 0.85,
    pose(t, c, D) {
      const p = t / D, up = seg(p, 0, 0.42), dn = seg(p, 0.44, 0.56), back = seg(p, 0.75, 1), k = 1 - back;
      return { armRX: mix(mix(-0.15, -2.9, up), -0.35, dn) * k - 0.15 * back, armRZ: -0.16 + 0.2 * up * k,
        armLX: 0.4 * up * k, armLZ: 0.5 * up * k + 0.16, wRX: 2.1,
        torsoX: mix(-0.25 * up, 0.4, dn) * k, torsoY: 0.2 * up * k, bodyY: mix(0.05 * up, -0.18, dn) * k,
        legLX: -0.45 * dn * k, legRX: 0.35 * dn * k, headX: 0.12 * dn * k };
    },
    events: [[0.5, 'slash']],
  },
  energyBolt: {
    dur: 0.95, hideWeapon: true,
    pose(t, c, D) {
      const p = t / D, gather = seg(p, 0, 0.3), push = seg(p, 0.46, 0.54), back = seg(p, 0.8, 1), k = 1 - back;
      return { armLX: mix(-1.0 * gather, -1.55, push) * k, armRX: mix(-1.0 * gather, -1.55, push) * k,
        armLZ: mix(0.16 - 0.6 * gather, 0.12, push) * k + 0.16 * back, armRZ: mix(-0.16 + 0.6 * gather, -0.12, push) * k - 0.16 * back,
        torsoX: mix(-0.1 * gather, 0.2, push) * k, torsoY: 0.25 * gather * (1 - push) * k,
        bodyY: -0.08 * gather * k, legLX: -0.3 * push * k, legRX: 0.25 * push * k };
    },
    events: [[0.05, 'charge'], [0.5, 'ebolt']],
  },
  shoutCombat: {
    dur: 1.2,
    pose(t, c, D) {
      const p = t / D, k = seg(p, 0, 0.2) * (1 - seg(p, 0.8, 1)), shake = Math.sin(t * 60) * 0.03 * pulse(p, 0.25, 0.35, 0.7);
      return { armLZ: 0.16 + 1.25 * k, armRZ: -0.16 - 1.25 * k, armLX: -0.5 * k, armRX: -0.5 * k,
        bodyY: -0.12 * k, legLZ: 0.15 * k, legRZ: -0.15 * k, headX: -0.25 * k + shake, torsoX: -0.1 * k, torsoZ: shake, wRX: 1.9 };
    },
    events: [[0.3, 'buffAtk']],
  },
  shoutMorale: {
    dur: 1.2,
    pose(t, c, D) {
      const p = t / D, k = seg(p, 0, 0.2) * (1 - seg(p, 0.8, 1));
      return { armLZ: 0.16 + 2.5 * k, armRZ: -0.16 - 2.5 * k, armLX: -0.2 * k, armRX: -0.2 * k,
        bodyY: 0.08 * k, headX: -0.3 * k, torsoX: -0.12 * k, wRX: mix(1.9, 0.2, k) };
    },
    events: [[0.3, 'buffDef']],
  },
  beatUp: {
    dur: 1.35,
    pose(t, c, D) {
      const p = t / D;
      const h1 = pulse(p, 0.04, 0.16, 0.3), h2 = pulse(p, 0.28, 0.4, 0.54);
      const up = seg(p, 0.5, 0.62), dn = seg(p, 0.64, 0.72), back = seg(p, 0.84, 1), k = 1 - back;
      const armRX = up > 0 ? mix(-1.6 * h1, mix(-2.9, -0.4, dn), up) : -1.6 * h1;
      return { armRX: armRX * k - 0.15 * back, armRZ: -0.16 + 0.15 * h1, armLX: -1.6 * h2, armLZ: 0.16 - 0.2 * h2,
        wRX: up > 0 ? 2.1 : mix(2.3, 2.95, h1),
        torsoY: 0.35 * h2 - 0.35 * h1, torsoX: mix(-0.2 * up, 0.4, dn) * k, bodyY: -0.16 * dn * k,
        legLX: -0.35 * Math.max(h1, dn * k), legRX: 0.3 * Math.max(h1, dn * k), headX: 0.1 * dn * k };
    },
    events: [[0.16, 'slash'], [0.4, 'punch'], [0.7, 'slam']],
  },
  chargeAttack: {
    dur: 1.0,
    pose(t, c, D) {
      const p = t / D, crouch = seg(p, 0, 0.14), run = seg(p, 0.14, 0.2), hit = seg(p, 0.52, 0.6), back = seg(p, 0.78, 1), k = 1 - back;
      const legs = Math.sin(t * 30) * 0.8 * run * (1 - hit);
      return { bodyX: (0.15 * crouch + 0.3 * run) * k, bodyY: -0.15 * crouch * (1 - run) * k,
        legLX: (-legs - 0.5 * hit) * k, legRX: (legs + 0.4 * hit) * k,
        armRX: mix(0.5 * run, -1.6, hit) * k - 0.15 * back, armRZ: -0.16, wRX: mix(1.6, 2.95, hit),
        armLX: mix(0.6 * run, 0.5, hit) * k, torsoX: 0.1 * hit * k };
    },
    events: [[0.14, 'dash'], [0.56, 'slash']],
  },
});

export const ANIM_NAMES = ['idle', 'walk', 'run', 'attack', 'skill', 'wave', 'victory', 'sit', 'hit'];

// ---------------------------------------------------------------- character
export class Character {
  constructor(cls) {
    this.c = cls;
    this.root = new THREE.Group();
    this.root.name = cls.id;
    this.body = group(this.root, 0, HIP, 0);
    this.torso = group(this.body, 0, 0.02, 0);
    buildTorso(this.torso, cls);
    this.neck = group(this.torso, 0, 0.7, 0);
    this.eyes = buildFace(this.neck, cls);
    buildHair(this.neck, cls.hair);
    const L = buildArm(this.torso, cls, 1), R = buildArm(this.torso, cls, -1);
    this.armL = L.sh; this.armR = R.sh; this.handL = L.hand; this.handR = R.hand;
    this.legL = buildLeg(this.body, cls, 1);
    this.legR = buildLeg(this.body, cls, -1);
    this.legL.scale.y = this.legR.scale.y = LEG;
    // head about a third of the height, torso a little longer
    this.torso.scale.set(1.0, 0.96, 1.0);

    this.neck.scale.setScalar(1.12);
    box(this.body, 0.8, 0.24, 0.5, cls.pants, 0, -0.06, 0); // pelvis
    if (cls.robe) this.skirt = buildRobeSkirt(this.body, cls);

    this.weaponParts = [];
    this.buildWeapon();
    this.blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.03;
    this.blob.userData.blob = true;
    this.blob.visible = false;
    this.root.add(this.blob);

    this.pose = {};
    for (const k of KEYS) this.pose[k] = 0;
    this.state = 'idle';
    this.t = 0;
    this.clock = Math.random() * 10;
    this.armed = true;
    this.onEvent = null;
    this.blinkIn = 2 + Math.random() * 2;
    this.blink = 0;
    this.base = 'idle';
    this.speed = 0;
  }

  buildWeapon() {
    const c = this.c;
    const add = (o) => { this.weaponParts.push(o); return o; };
    if (c.weapon === 'greatsword') add(sword(this.handR, true));
    if (c.backpack) {
      const bp = group(this.torso, 0, 0.32, -0.34);
      box(bp, 0.56, 0.58, 0.26, 0x7a4a2c, 0, 0, 0);
      box(bp, 0.6, 0.2, 0.3, 0x6a3e24, 0, 0.26, 0.01); // flap
      box(bp, 0.14, 0.1, 0.06, 0xd1a646, 0, 0.18, 0.16); // buckle
      box(bp, 0.7, 0.18, 0.18, 0xe6d2a4, 0, 0.42, -0.02); // bedroll
      box(bp, 0.22, 0.2, 0.12, 0x6a3e24, 0.3, -0.12, 0.02); // side pocket
    }
    if (c.weapon === 'woodSword') {
      add(sword(this.handR, false, true));
      this.sling = slingshot(this.handL);
      this.sling.g.scale.setScalar(1.3);
      this.sling.g.visible = false;
    }
    if (c.weapon === 'swordShield') {
      add(sword(this.handR, false));
      const s = add(shield(this.armL, c));
      s.position.set(0.19, -0.45, 0.02);
    }
    if (c.weapon === 'bow') {
      this.bow = bow(this.handL);
      add(this.bow.g);
      const q = add(group(this.torso, 0.1, 0.36, -0.34));
      q.rotation.z = -0.5;
      box(q, 0.2, 0.62, 0.2, 0x6a4028);
      box(q, 0.22, 0.06, 0.22, 0xd2b184, 0, 0.26, 0);
      for (let i = 0; i < 4; i++) box(q, 0.05, 0.16, 0.04, i % 2 ? 0xe8e2d0 : 0xb8342b, -0.06 + (i % 2) * 0.1, 0.38, -0.05 + (i >> 1) * 0.1);
    }
    if (c.weapon === 'staff') {
      this.staff = staff(this.handR);
      add(this.staff.g);
    }
  }

  setArmed(on) {
    this.armed = on;
    for (const p of this.weaponParts) p.visible = on;
  }

  // name: any of ANIM_NAMES. Loops replace the base state; one-shots play then fall back.
  play(name) {
    const a = ANIMS[name];
    if (!a) return;
    if (a.loop) { this.base = name; if (!this.oneShot) { this.state = name; this.t = 0; } return; }
    this.state = name;
    this.oneShot = true;
    this.t = 0;
    this.firedEvents = new Set();
  }
  get busy() { return !!this.oneShot; }

  duration(name) {
    const a = ANIMS[name];
    if (typeof a.dur === 'number') return a.dur;
    return a.dur[this.armed ? this.c.weapon : 'none'] ?? a.dur.none;
  }

  worldPos(obj, x = 0, y = 0, z = 0) {
    return obj.localToWorld(new THREE.Vector3(x, y, z));
  }
  get orbWorld() { return this.staff && this.armed ? this.staff.orb.getWorldPosition(new THREE.Vector3()) : this.worldPos(this.handR); }

  update(dt) {
    this.t += dt;
    this.clock += dt;
    const c = this.c, a = ANIMS[this.state];
    let target;
    if (this.oneShot) {
      const D = this.duration(this.state);
      target = a.pose(this.t, c, D, this.armed);
      const ev = (Array.isArray(a.events) ? a.events : a.events?.[this.armed ? c.weapon : 'none']) || [];
      for (const [at, name] of ev) {
        if (this.t / D >= at && !this.firedEvents.has(at)) { this.firedEvents.add(at); this.onEvent?.(name, this); }
      }
      if (this.t >= D) { this.oneShot = false; this.state = this.base; this.t = 0; }
    } else {
      if (this.state !== this.base) { this.state = this.base; this.t = 0; }
      target = a.pose(this.clock, c);
    }
    // skill props: the slingshot shows up only while it is used; some skills put the sword away
    const cur = this.oneShot ? a : null;
    if (this.sling) this.sling.g.visible = cur?.prop === 'sling';
    const hide = !!cur?.hideWeapon || cur?.prop === 'sling';
    for (const w of this.weaponParts) w.visible = this.armed && !hide;
    const base = hold(c, this.armed);
    const k = 1 - Math.exp(-dt * (this.oneShot ? 22 : 12));
    for (const key of KEYS) {
      const tv = target[key], bv = base[key];
      let v;
      if (tv === undefined) v = bv ?? 0;
      else if (!this.oneShot && bv !== undefined && this.state !== 'sit' && (key === 'armRX' || key === 'armLX')) {
        // locomotion swing layered on top of the weapon posture; the weapon hand swings less
        const holding = this.armed && (key === 'armRX' ? c.weapon !== 'bow' : c.weapon === 'swordShield' || c.weapon === 'bow');
        v = tv * (holding ? 0.5 : 1) + bv;
      } else v = tv;
      this.pose[key] += (v - this.pose[key]) * k;
    }
    this.apply();

    // blink
    this.blinkIn -= dt;
    if (this.blinkIn < 0) { this.blink = 0.13; this.blinkIn = 2.5 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - dt);
    const sy = this.blink > 0 ? 0.12 : 1;
    this.eyes.mesh.material[4] = sy < 1 ? this.eyes.face.closed : this.eyes.face.open;

    if (this.staff) {
      const s = 1 + Math.sin(this.clock * 4) * 0.12;
      this.staff.halo.scale.setScalar(s);
      this.staff.orb.rotation.y += dt * 1.5;
    }
  }

  apply() {
    const p = this.pose;
    this.body.position.y = HIP + p.bodyY;
    this.body.rotation.set(p.bodyX, p.bodyRY, p.bodyZ);
    this.torso.rotation.set(p.torsoX, p.torsoY, p.torsoZ);
    this.neck.rotation.set(p.headX, p.headY, p.headZ);
    this.armL.rotation.set(p.armLX, p.armLY, p.armLZ);
    this.armR.rotation.set(p.armRX, p.armRY, p.armRZ);
    this.legL.rotation.set(p.legLX, 0, p.legLZ);
    this.legR.rotation.set(p.legRX, 0, p.legRZ);
    this.handR.rotation.set(p.wRX, 0, p.wRZ);
    this.handL.rotation.set(p.wLX, 0, p.wLZ);
    if (this.skirt) this.skirt.rotation.x = -Math.max(Math.abs(p.legLX), Math.abs(p.legRX)) * 0.25 + (p.bodyY < -0.4 ? -0.9 : 0);
    if (this.bow) this.bow.setDraw(Math.max(0, p.draw));
    if (this.sling) this.sling.setDraw(Math.max(0, p.draw));
  }
}
