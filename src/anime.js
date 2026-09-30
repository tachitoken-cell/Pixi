// Anime look: cel shading (hard light/shadow bands instead of smooth Lambert), ink outlines drawn around every
// silhouette by a screen pass (edges where the depth jumps), a little extra colour, and cherry petals in the air.
import * as THREE from 'three';

// three light bands: shadow, mid, lit
function gradient(steps) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
export const TOON_GRADIENT = gradient([118, 178, 228]);

// drop-in replacement for MeshLambertMaterial
export class ToonMat extends THREE.MeshToonMaterial {
  constructor(params = {}) {
    const { flatShading, ...rest } = params;       // toon shading looks best smooth; flat voxels keep their faces
    super({ gradientMap: TOON_GRADIENT, ...rest });
    if (flatShading) this.flatShading = true;
  }
}

// ---------------------------------------------------------------- outline + colour pass
export function createAnimePass(renderer, { samples = 4 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depth = new THREE.DepthTexture(size.x, size.y);
  depth.type = THREE.UnsignedIntType;
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthTexture: depth, samples });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture }, tDepth: { value: depth }, texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
      near: { value: 0.1 }, far: { value: 900 }, ink: { value: 1 }, width: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far; uniform float ink; uniform float width;
      varying vec2 vUv;
      float lin(vec2 uv) { float z = texture2D(tDepth, uv).r * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
      void main() {
        vec4 c = texture2D(tColor, vUv);
        float d = lin(vUv);
        vec2 o = texel * width;
        // a line on the near side of every depth jump (relative, so distant hills get thin lines too)
        float e = 0.0;
        e = max(e, lin(vUv + vec2(o.x, 0.0)) - d);
        e = max(e, lin(vUv - vec2(o.x, 0.0)) - d);
        e = max(e, lin(vUv + vec2(0.0, o.y)) - d);
        e = max(e, lin(vUv - vec2(0.0, o.y)) - d);
        e = max(e, 0.7 * (lin(vUv + o) - d));
        e = max(e, 0.7 * (lin(vUv - o) - d));
        float edge = max(smoothstep(0.012, 0.04, e / d), smoothstep(0.3, 0.7, e)) * (1.0 - smoothstep(120.0, 320.0, d)) * ink;
        // anime colour: a bit more saturated and brighter mid-tones
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = mix(vec3(l), c.rgb, 1.2);
        vec3 inkCol = c.rgb * 0.12 + vec3(0.03, 0.02, 0.04);
        c.rgb = mix(c.rgb, inkCol, edge * 0.9);
        gl_FragColor = vec4(c.rgb, max(c.a, edge * 0.9));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false, transparent: true,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    enabled: true, material: mat,
    setSize() {
      renderer.getDrawingBufferSize(size);
      target.setSize(size.x, size.y);
      mat.uniforms.texel.value.set(1 / size.x, 1 / size.y);
      mat.uniforms.width.value = Math.max(1.5, size.y / 500);   // lines keep their look on big screens
    },
    render(sc, camera) {
      if (!this.enabled) return renderer.render(sc, camera);
      mat.uniforms.near.value = camera.near; mat.uniforms.far.value = camera.far;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(sc, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(scene, cam);
    },
  };
}

// ---------------------------------------------------------------- cherry petals drifting around the hero
export function createPetals(count = 160) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 13, 8, 0.6, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: tex, color: 0xffc2dc, size: 0.34, transparent: true, opacity: 0.9, depthWrite: false, alphaTest: 0.1 });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const R = 22, H = 14;
  for (let i = 0; i < count; i++) { pos.set([(Math.random() - 0.5) * 2 * R, Math.random() * H, (Math.random() - 0.5) * 2 * R], i * 3); seed[i] = Math.random() * 10; }
  let t = 0;
  return {
    points: pts,
    update(dt, center, on) {
      pts.visible = on;
      if (!on) return;
      t += dt;
      for (let i = 0; i < count; i++) {
        let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        y -= dt * (0.6 + (seed[i] % 1) * 0.5);
        x += dt * (0.9 + Math.sin(t * 1.3 + seed[i]) * 0.8);
        z += dt * Math.cos(t * 0.9 + seed[i] * 2) * 0.6;
        // stay in a box around the hero (world space, so they don't follow him)
        if (y < center.y - 2) y += H;
        if (x > center.x + R) x -= 2 * R; if (x < center.x - R) x += 2 * R;
        if (z > center.z + R) z -= 2 * R; if (z < center.z - R) z += 2 * R;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
