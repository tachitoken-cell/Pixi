// Voxel engine: a dense colour grid and a mesher that emits only exposed faces, with
// per-vertex ambient occlusion and vertex colours (MagicaVoxel-style shading).
import * as THREE from 'three';

export class VoxelGrid {
  constructor(nx, ny, nz) {
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.data = new Uint32Array(nx * ny * nz); // 0 = empty, otherwise colour + 1
  }
  idx(x, y, z) { return (y * this.nz + z) * this.nx + x; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz; }
  get(x, y, z) { return this.inside(x, y, z) ? this.data[this.idx(x, y, z)] : 0; }
  set(x, y, z, color) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (this.inside(x, y, z)) this.data[this.idx(x, y, z)] = color + 1;
  }
  clear(x, y, z) { if (this.inside(x, y, z)) this.data[this.idx(x, y, z)] = 0; }
  filled(x, y, z) { return this.get(x, y, z) !== 0; }

  // helpers for procedural models; `col` may be a colour or a function (x, y, z) => colour
  box(x0, y0, z0, x1, y1, z1, col) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
      this.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
  }
  sphere(cx, cy, cz, rx, ry, rz, col, noise = 0, rnd = Math.random) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let z = Math.floor(cz - rz - 1); z <= cz + rz + 1; z++)
        for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d <= 1 + (rnd() - 0.5) * noise) this.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
        }
  }
  cylinder(cx, cz, y0, y1, r, col) {
    for (let y = y0; y <= y1; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r + 0.5) this.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
  }
}

// colour helpers
export function jitter(hex, amount, rnd = Math.random) {
  const f = 1 + (rnd() - 0.5) * amount;
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}
export function mix(a, b, t) {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], shade: 0.93 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.93 },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], shade: 1.0 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.6 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.97 },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0], shade: 0.9 },
];
const AO = [0.64, 0.77, 0.89, 1]; // soft, painterly corner shading

// Build a geometry from a grid (or part of one). `size` is the world size of one voxel;
// `origin` is the voxel coordinate that ends up at the geometry's (0,0,0).
export function meshGrid(grid, { size = 0.25, origin = [grid.nx / 2, 0, grid.nz / 2], range = null, skipBottom = false } = {}) {
  const [x0, y0, z0, x1, y1, z1] = range || [0, 0, 0, grid.nx - 1, grid.ny - 1, grid.nz - 1];
  const pos = [], nor = [], col = [], ind = [];
  const c = new THREE.Color();
  let vi = 0;
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const v = grid.get(x, y, z);
    if (!v) continue;
    const hex = v - 1;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      if (skipBottom && f === 3) continue;
      const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
      if (grid.get(nx, ny, nz)) continue;
      // the 4 corners of this face and their occlusion
      const ao = [];
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [su, sv] of corners) {
        const s1 = grid.filled(nx + F.u[0] * su, ny + F.u[1] * su, nz + F.u[2] * su) ? 1 : 0;
        const s2 = grid.filled(nx + F.v[0] * sv, ny + F.v[1] * sv, nz + F.v[2] * sv) ? 1 : 0;
        const cc = grid.filled(nx + F.u[0] * su + F.v[0] * sv, ny + F.u[1] * su + F.v[1] * sv, nz + F.u[2] * su + F.v[2] * sv) ? 1 : 0;
        ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + cc));
      }
      c.setHex(hex);
      for (let k = 0; k < 4; k++) {
        const [su, sv] = corners[k];
        const px = x + 0.5 + F.n[0] * 0.5 + F.u[0] * su * 0.5 + F.v[0] * sv * 0.5;
        const py = y + 0.5 + F.n[1] * 0.5 + F.u[1] * su * 0.5 + F.v[1] * sv * 0.5;
        const pz = z + 0.5 + F.n[2] * 0.5 + F.u[2] * su * 0.5 + F.v[2] * sv * 0.5;
        pos.push((px - origin[0]) * size, (py - origin[1]) * size, (pz - origin[2]) * size);
        nor.push(F.n[0], F.n[1], F.n[2]);
        const b = AO[ao[k]] * F.shade;
        col.push(c.r * b, c.g * b, c.b * b);
      }
      // flip the quad diagonal so occlusion interpolates smoothly
      if (ao[0] + ao[2] > ao[1] + ao[3]) ind.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      else ind.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
      vi += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(vi > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
  g.computeBoundingSphere();
  return g;
}

export const VOXEL_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

// Props (trees, houses...) use a material that dithers away wherever it stands between the
// camera and the hero, so the hero is never hidden (the classic MMO see-through effect).
export const SEE_THROUGH = {
  uHero: { value: new THREE.Vector3() },
  uCam: { value: new THREE.Vector3() },
  uRadius: { value: 3.4 },
};
export const PROP_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
PROP_MAT.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, SEE_THROUGH);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform vec3 uHero;\nuniform vec3 uCam;\nuniform float uRadius;')
    .replace('void main() {', `void main() {
      vec3 ax = uHero - uCam;
      float len = length(ax);
      vec3 dir = ax / len;
      float t = dot(vWPos - uCam, dir);
      if (t > 0.0 && t < len - 0.8) {
        float d = length(vWPos - (uCam + dir * t));
        float fade = 1.0 - smoothstep(uRadius * 0.55, uRadius, d);
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (fade * 0.85 > n) discard;
      }`);
};
