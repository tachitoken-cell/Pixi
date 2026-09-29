import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { dungeonRoomPortalOpen, type DungeonId, type DungeonLayout } from './dungeon.ts';
import { dungeonSpikeTraps, dungeonSpikePhase } from './dungeon-traps.ts';

/** Three original Blender libraries, with the same metric collision and interaction pivots. */
export const THEMED_DUNGEON_ART = {
  plagueworks: { floor: [0x343f35, 0x424d3e, 0x4b5544], path: 0x797e60, stone: 0x647365, tint: 0xffffff, light: 0xa2fb56, liquid: 0x68bc48, fluidGlow: .34, title: 'Plagueworks' },
  emberfall: { floor: [0x30343a, 0x373c40, 0x414447], path: 0x887459, stone: 0x666864, tint: 0xffffff, light: 0xff7629, liquid: 0xff6324, fluidGlow: 1.2, title: 'Emberfall' },
  veilhaven: { floor: [0x242b2c, 0x614234, 0x42332d], path: 0x98724b, stone: 0x3b655d, tint: 0xffffff, light: 0xffb64e, liquid: 0x3a8997, fluidGlow: .32, title: 'Veilhaven' },
} as const;
export type ThemedDungeonId = keyof typeof THEMED_DUNGEON_ART;
export function themedDungeonArt(id: DungeonId) { return id in THEMED_DUNGEON_ART ? THEMED_DUNGEON_ART[id as ThemedDungeonId] : undefined; }

/** Three shared draws for every trap; gameplay and animation use the same clock and footprint. */
export function createDungeonSpikes(parent: THREE.Group, id: DungeonId) {
  const traps = dungeonSpikeTraps(id), columns = 4, rows = 6, perBed = columns * rows;
  const pose = new THREE.Object3D(), color = new THREE.Color(), box = new THREE.BoxGeometry(1, 1, 1);
  const bases = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: .74, metalness: .42 }), traps.length * (9 + perBed));
  const outlines = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ toneMapped: false }), traps.length * 4);
  const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(.19, 1.25, 4).translate(0, .625, 0), new THREE.MeshStandardMaterial({ color: 0xc1c8c0, metalness: .55, roughness: .33 }), traps.length * perBed);
  bases.name = 'Dungeon: spike bed frames'; outlines.name = 'Dungeon: spike warnings'; spikes.name = 'Dungeon: timed spikes';
  bases.userData.collision = spikes.userData.collision = 'solid'; outlines.userData.collision = 'effect';
  bases.userData.collisionState = { key: 'dungeon:traps', value: true };
  spikes.userData.collisionStates = traps.flatMap(trap => Array.from({ length: perBed }, () => ({ key: `spike:${trap.id}:lowered`, value: true })));
  bases.receiveShadow = spikes.castShadow = spikes.receiveShadow = true;
  // Animated matrices remain inside each bed's fixed, raised bounds.
  spikes.frustumCulled = false;
  spikes.userData.traps = traps;
  let baseIndex = 0, outlineIndex = 0;
  function block(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, w: number, h: number, d: number, tint: number) {
    pose.position.set(x, y, z); pose.rotation.set(0, 0, 0); pose.scale.set(w, h, d); pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix); mesh.setColorAt(index, color.setHex(tint));
  }
  for (const trap of traps) {
    block(bases, baseIndex++, trap.x, .026, trap.z, trap.width, .05, trap.depth, 0x25282b);
    for (const side of [-1, 1]) {
      block(bases, baseIndex++, trap.x + side * (trap.width / 2 - .1), .075, trap.z, .2, .15, trap.depth, 0x8a7150);
      block(bases, baseIndex++, trap.x, .075, trap.z + side * (trap.depth / 2 - .1), trap.width, .15, .2, 0x8a7150);
      block(outlines, outlineIndex++, trap.x + side * (trap.width / 2 - .23), .085, trap.z, .045, .025, trap.depth - .5, 0x59432a);
      block(outlines, outlineIndex++, trap.x, .085, trap.z + side * (trap.depth / 2 - .23), trap.width - .5, .025, .045, 0x59432a);
      for (const end of [-1, 1]) block(bases, baseIndex++, trap.x + side * (trap.width / 2 - .22), .10, trap.z + end * (trap.depth / 2 - .22), .3, .2, .3, 0xb39558);
    }
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const x = trap.x + (column / (columns - 1) - .5) * (trap.width - 1), z = trap.z + (row / (rows - 1) - .5) * (trap.depth - 1);
      block(bases, baseIndex++, x, .061, z, .39, .025, .39, 0x0c1115);
    }
  }
  bases.computeBoundingSphere(); outlines.computeBoundingSphere(); parent.add(bases, outlines, spikes);
  return { update(now: number, enabled: boolean) {
    for (let index = 0; index < traps.length; index++) {
      const trap = traps[index], { phase, progress } = dungeonSpikePhase(trap, now);
      const lift = enabled && phase === 'active' ? 1 : 0;
      color.setHex(!enabled || phase === 'safe' ? 0x59432a : phase === 'warning' ? 0xffbc50 : 0xff5335);
      if (enabled && phase === 'warning') color.multiplyScalar(.65 + .35 * Math.sin(progress * Math.PI * 3) ** 2);
      for (let edge = 0; edge < 4; edge++) outlines.setColorAt(index * 4 + edge, color);
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        pose.position.set(trap.x + (column / (columns - 1) - .5) * (trap.width - 1), .06, trap.z + (row / (rows - 1) - .5) * (trap.depth - 1));
        pose.rotation.set(0, Math.PI / 4, 0); pose.scale.set(1, .025 + lift * .975, 1); pose.updateMatrix();
        spikes.setMatrixAt(index * perBed + row * columns + column, pose.matrix);
        spikes.userData.collisionStates[index * perBed + row * columns + column].key = `spike:${trap.id}:${lift ? 'raised' : 'lowered'}`;
      }
    }
    spikes.instanceMatrix.needsUpdate = true;
    if (outlines.instanceColor) outlines.instanceColor.needsUpdate = true;
  } };
}

/** Floor vortices, blue ward domes and chain seals share three draws for the dungeon. */
export function createDungeonRoomPortals(parent: THREE.Group, layout: DungeonLayout) {
  const clock = { value: 0 }, locked = new THREE.InstancedBufferAttribute(new Float32Array(layout.portals.length).fill(1), 1);
  const visible = new THREE.InstancedBufferAttribute(new Float32Array(layout.portals.length), 1);
  const floorGeometry = new THREE.PlaneGeometry(6.2, 6.2), sealGeometry = new THREE.PlaneGeometry(2.7, 2);
  const domeGeometry = new THREE.SphereGeometry(2.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const geometry of [floorGeometry, sealGeometry, domeGeometry]) { geometry.setAttribute('portalLocked', locked); geometry.setAttribute('roomVisible', visible); }
  const floor = new THREE.InstancedMesh(floorGeometry, new THREE.ShaderMaterial({
    uniforms: { time: clock }, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: `attribute float portalLocked; attribute float roomVisible; varying vec2 vUv; varying float sealed; varying vec3 portalView;
      void main(){
        vUv=uv;sealed=portalLocked;mat4 transform=modelMatrix*instanceMatrix;
        vec4 world=transform*vec4(position,1.);vec3 eye=cameraPosition-world.xyz;mat3 basis=mat3(transform);
        portalView=vec3(dot(eye,basis[0]),dot(eye,basis[1]),dot(eye,basis[2]));
        gl_Position=projectionMatrix*viewMatrix*world;
        if(roomVisible<.5)gl_Position=vec4(2.,2.,2.,1.);
      }`,
    fragmentShader: `uniform float time; varying vec2 vUv; varying float sealed; varying vec3 portalView;
      void main(){
        vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);
        if(r>.99)discard;
        float edge=.69+sin(a*11.-time*2.)*.006+sin(a*19.+time*3.)*.004;
        float ring=exp(-abs(r-edge)*190.);
        float outer=exp(-abs(r-.755)*240.);
        float halo=exp(-abs(r-edge)*18.)*.8+exp(-abs(r-.755)*30.)*.25;
        vec2 rune=vec2(fract(a/6.283185*32.)-.5,(r-.724)*150.);
        float links=(1.-smoothstep(.055,.16,abs(max(abs(rune.x)*1.6,abs(rune.y))-.42)))*step(abs(r-.724),.024);
        float disc=1.-smoothstep(.63,.69,r);
        vec3 blue=vec3(.015,.12,1.),cyan=vec3(.32,.8,1.);
        vec2 slope=clamp(portalView.xy/max(abs(portalView.z),.1),vec2(-1.5),vec2(1.5));
        vec3 flow=vec3(0.);
        // Receding, camera-relative layers form a deep magical well without changing the walkable floor.
        for(int i=0;i<8;i++){
          float depth=float(i)/7.,radius=.64-depth*.54;
          vec2 q=p-slope*depth*.24;float distance=length(q),angle=atan(q.y,q.x);
          float twist=angle*3.+log(distance+.06)*10.-time*2.2+depth*2.;
          float spiral=pow(sin(twist)*.5+.5,5.);
          float ribbon=exp(-abs(distance-radius)*38.);
          float filament=pow(sin(twist+.5)*.5+.5,18.);
          flow+=(blue*(.09+spiral*.85)+cyan*filament*.65)*ribbon*(1.-depth*.82);
        }
        flow*=disc*(1.-sealed*.2);
        float lip=exp(-abs(r-.65)*65.);
        vec3 light=blue*halo+cyan*(ring*2.8+outer*1.6+links*2.+lip*.35);
        gl_FragColor=vec4(vec3(.0005,.001,.008)*disc+flow+light,max(disc*.99,clamp(halo+ring+outer+links,0.,1.)));
        #include <colorspace_fragment>
      }`,
  }), layout.portals.length);
  const domes = new THREE.InstancedMesh(domeGeometry, new THREE.ShaderMaterial({
    uniforms: { time: clock }, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `attribute float portalLocked; attribute float roomVisible; varying float sealed; varying vec2 vUv; varying vec3 viewNormal; varying vec3 viewDirection;
      void main(){
        sealed=portalLocked;vUv=uv;
        vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);
        viewNormal=normalize(mat3(modelViewMatrix)*mat3(instanceMatrix)*normal);viewDirection=-p.xyz;
        gl_Position=projectionMatrix*p;
        if(roomVisible<.5)gl_Position=vec4(2.,2.,2.,1.);
      }`,
    fragmentShader: `uniform float time; varying float sealed; varying vec2 vUv; varying vec3 viewNormal; varying vec3 viewDirection;
      void main(){
        if(sealed<.5)discard;
        float rim=pow(1.-abs(dot(normalize(viewNormal),normalize(viewDirection))),2.5);
        float base=exp(-vUv.y*45.);
        float shimmer=pow(sin(vUv.y*28.+vUv.x*12.-time*1.3)*.5+.5,12.)*.08;
        float pulse=.94+.06*sin(time*2.);
        vec3 colour=mix(vec3(.015,.06,1.2),vec3(.24,.65,1.6),rim+base*.35)*pulse;
        gl_FragColor=vec4(colour,clamp(.34+rim*.5+base*.25+shimmer,0.,.88));
        #include <colorspace_fragment>
      }`,
  }), layout.portals.length);
  const seals = new THREE.InstancedMesh(sealGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: 'attribute float portalLocked; attribute float roomVisible; varying vec2 vUv; varying float sealed; void main(){vUv=uv;sealed=portalLocked;vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);p.xy+=position.xy;gl_Position=projectionMatrix*p;if(roomVisible<.5)gl_Position=vec4(2.,2.,2.,1.);}',
    fragmentShader: `varying vec2 vUv; varying float sealed;
      float chain(vec2 p){
        float u=(p.x+p.y)*.707,v=(p.y-p.x)*.707;
        vec2 q=vec2(mod(u+.1,.2)-.1,v);
        return abs(length(q*vec2(1.,1.8))-.065)+max(0.,abs(u)-1.05);
      }
      void main(){
        if(sealed<.5)discard;vec2 p=vUv*2.-1.;
        float body=max(abs(p.x)-.19,abs(p.y+.13)-.21);
        float shackle=max(abs(length(vec2(p.x,(p.y-.12)*.9))-.15)-.025,.08-p.y);
        float lock=min(body,shackle),chains=min(chain(p),chain(vec2(-p.x,p.y)));
        chains=max(chains,.33-length(p));
        float links=1.-smoothstep(.008,.026,chains);
        float glow=exp(-max(chains,0.)*40.)*.32+exp(-max(lock,0.)*24.)*.42;
        float solid=1.-smoothstep(-.008,.014,lock);
        float key=max(1.-smoothstep(.039,.051,length(vec2(p.x,p.y+.08))),step(abs(p.x),.024)*step(abs(p.y+.16),.08));
        float alpha=max(max(solid,links),glow);if(alpha<.01)discard;
        vec3 colour=vec3(.06,.22,1.)*glow+vec3(.36,.78,1.)*links+mix(vec3(.6,.89,1.),vec3(.015,.07,.3),key)*solid;
        gl_FragColor=vec4(colour,clamp(alpha,0.,1.));
        #include <colorspace_fragment>
      }`,
  }), layout.portals.length);
  floor.name = 'Dungeon: room teleport vortices'; domes.name = 'Dungeon: sealed portal domes'; seals.name = 'Dungeon: sealed portal chains';
  floor.userData.collision = domes.userData.collision = seals.userData.collision = 'effect';
  floor.renderOrder = 2; seals.renderOrder = 3; domes.renderOrder = 4; seals.frustumCulled = false;
  const pose = new THREE.Object3D();
  for (const [index, portal] of layout.portals.entries()) {
    pose.position.set(portal.x, .145, portal.z); pose.rotation.set(-Math.PI / 2, 0, 0); pose.updateMatrix(); floor.setMatrixAt(index, pose.matrix);
    pose.position.y = .16; pose.rotation.set(0, 0, 0); pose.updateMatrix(); domes.setMatrixAt(index, pose.matrix);
    pose.position.y = .95; pose.rotation.set(0, 0, 0); pose.updateMatrix(); seals.setMatrixAt(index, pose.matrix);
  }
  floor.computeBoundingSphere(); domes.computeBoundingSphere(); parent.add(floor, domes, seals);
  return { setRoom(roomId: string | null) {
    for (const [index, portal] of layout.portals.entries()) visible.setX(index, roomId === null || portal.roomId === roomId ? 1 : 0);
    visible.needsUpdate = true;
  }, setState(cleared: readonly string[], activated: readonly string[], dream = false) {
    for (const [index, portal] of layout.portals.entries()) locked.setX(index, dream || dungeonRoomPortalOpen(portal, cleared, activated) ? 0 : 1);
    locked.needsUpdate = true;
  }, update(time: number) { clock.value = time; } };
}

/** Bounded ambience batch; only rendered geometry moves, never collision or encounter state. */
export function createThemedDungeonAmbience(parent: THREE.Group, id: DungeonId, layout: DungeonLayout) {
  const art = themedDungeonArt(id); if (!art) return undefined;
  const anchors = [...layout.pools, ...layout.lanterns], count = anchors.length * 3;
  const material = new THREE.MeshBasicMaterial({ color: art.light, transparent: true, opacity: .56, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, count), pose = new THREE.Object3D();
  mesh.name = `${art.title}: ${id === 'plagueworks' ? 'drifting spores' : id === 'emberfall' ? 'rising embers' : 'wandering spirit lights'}`;
  mesh.userData.collision = 'effect';
  mesh.frustumCulled = false; parent.add(mesh);
  return { update(time: number) {
    for (let i = 0; i < count; i++) {
      const at = anchors[Math.floor(i / 3)], phase = i * 2.399963, lift = (time * .21 + i * .171) % 1;
      pose.position.set(at.x + Math.cos(phase + time * .3) * .42, .45 + lift * 2.8, at.z + Math.sin(phase + time * .25) * .42);
      const size = (id === 'veilhaven' ? .085 : .035) * (.5 + Math.sin(lift * Math.PI));
      pose.scale.set(size, size * (id === 'veilhaven' ? 1.6 : 1), size); pose.rotation.set(phase, time * .6, phase); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  } };
}

/** Optional entrance landmark, sharing its authored interior architecture. */
export async function createThemedEntranceDecor(parent: THREE.Group, id: DungeonId, x: number, y: number, z: number) {
  if (!themedDungeonArt(id)) return;
  const asset = await new GLTFLoader().loadAsync(`/models/${id}-kit.glb`), arch = asset.scene.getObjectByName(`${id}-arch`)!;
  arch.removeFromParent(); arch.name = `${id}: authored entrance arch`; arch.position.set(x, y, z);
  arch.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } }); parent.add(arch);
  const usedGeometry = new Set<THREE.BufferGeometry>(), usedMaterials = new Set<THREE.Material>();
  arch.traverse(node => { if (node instanceof THREE.Mesh) { usedGeometry.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) usedMaterials.add(material); } });
  const unusedGeometry = new Set<THREE.BufferGeometry>(), unusedMaterials = new Set<THREE.Material>();
  asset.scene.traverse(node => { if (node instanceof THREE.Mesh) { if (!usedGeometry.has(node.geometry)) unusedGeometry.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (!usedMaterials.has(material)) unusedMaterials.add(material); } });
  unusedGeometry.forEach(geometry => geometry.dispose()); unusedMaterials.forEach(material => material.dispose());
}
