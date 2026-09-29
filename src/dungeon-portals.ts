import { createThemedEntranceDecor } from './themed-dungeon-art.ts';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { DUNGEONS, dungeonThemeId, type DungeonId } from './dungeon.ts';
import { groundHeight } from './landscape.ts';
import { DUNGEON_TEMPLE_WALLS, DUNGEON_TEMPLE_PILLARS, DUNGEON_TEMPLE_ROUTES, DUNGEON_TEMPLE_BOUNDS } from './dungeon-approach-layout.ts';

/** Themed entrance energy or a fiery oval for the completed dungeon's return. */
export function createDungeonPortalEffect(parent: THREE.Group, color: string, x = 0, y = 0, z = 0, style: 'entrance' | 'return' = 'entrance') {
  const group = new THREE.Group(); group.name = 'Dungeon: living portal'; group.position.set(x, y, z); parent.add(group);
  group.userData.collision = 'effect';
  const clock = { value: 0 }, tint = new THREE.Color(color), returning = style === 'return', centerY = returning ? 3.55 : 4.25;
  const material = new THREE.ShaderMaterial({
    uniforms: { portalTime: clock, portalColor: { value: tint }, returnPortal: { value: returning } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: 'varying vec2 portalUv; void main(){portalUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `
      uniform float portalTime; uniform vec3 portalColor; uniform bool returnPortal; varying vec2 portalUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float mist(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.1)*.15;}
      void main(){
        vec2 p=portalUv*2.0-1.0;
        float t=portalTime;
        if(returnPortal){
          // Leave transparent space around the entire flame, including its rising tips.
          vec2 oval=p*vec2(1.20,1.0);
          float radius=length(oval);
          vec2 flow=vec2(oval.x*5.0,oval.y*4.0-t*.85);
          float smoke=mist(flow+mist(flow*1.7+t*.2)*1.4);
          float detail=mist(flow*3.2-vec2(t*.35,t*.7));
          float rim=.72+(smoke-.5)*.23+(detail-.5)*.07;
          float distanceToRim=abs(radius-rim);
          float core=1.0-smoothstep(.025,.105,distanceToRim);
          float fire=exp(-distanceToRim*(14.0+detail*8.0));
          float halo=exp(-distanceToRim*8.0)*(.25+smoke*.3);
          float inside=1.0-smoothstep(rim-.065,rim+.02,radius);
          float wisps=pow(mist(vec2(oval.x*6.0+sin(oval.y*5.0-t)*.7,oval.y*3.5-t*.6)),3.0);
          vec3 voidColor=vec3(.035,.001,.004)+portalColor*wisps*.65;
          vec3 flameColor=portalColor*(fire*1.3+halo*.55)+vec3(1.0,.73,.67)*core*1.2;
          float fade=1.0-smoothstep(.84,.98,radius);
          float alpha=max(inside*.97,fire+halo)*fade;
          gl_FragColor=vec4(voidColor*inside+flameColor,clamp(alpha,0.0,1.0));
          return;
        }
        float swirl=mist(p*5.0+vec2(sin(t*.3),-t*.65));
        float edge=max(abs(p.x),abs(p.y));
        float ripple=sin(atan(p.y,p.x)*25.0+t*2.7+swirl*8.0)*.02;
        float flame=exp(-abs(edge-(.82+swirl*.10+ripple))*25.0);
        float haze=pow(edge,3.0)*(.22+swirl*.65);
        vec2 stars=portalUv*vec2(85.0,112.0)+vec2(t*.4,t*.65);
        float star=step(.987,hash(floor(stars)))*pow(max(0.0,1.0-length(fract(stars)-.5)*2.0),6.0);
        float twinkle=.45+.55*sin(t*2.0+hash(floor(stars))*40.0);
        vec3 dark=vec3(.009,.016,.008)+portalColor*mist(p*3.0+t*.07)*.024;
        vec3 light=portalColor*(flame*2.5+haze)+vec3(1.0,.98,.72)*pow(flame,4.0)*.65;
        float alpha=1.0-smoothstep(.97,1.0,edge);
        gl_FragColor=vec4(dark+light+star*twinkle*(vec3(.6)+portalColor),alpha);
      }`,
  });
  material.name = 'Dungeon: turbulent portal shader'; material.userData.time = clock;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(6, 8), material); plane.name = 'Dungeon: portal energy'; plane.position.set(0, centerY, .16); group.add(plane);
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .82, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 80);
  sparks.name = 'Dungeon: portal sparks'; sparks.frustumCulled = false; group.add(sparks);
  const light = new THREE.PointLight(color, 28, 15, 2); light.position.set(0, 4, 2); group.add(light);
  const pose = new THREE.Object3D();
  return { group, update(time: number, observer?: THREE.Vector3) {
    if (!Number.isFinite(time)) return;
    clock.value = time;
    light.intensity = group.visible && (!observer || observer.distanceToSquared(group.position) < 80 * 80) ? 26 + Math.sin(time * 3.1) * 3 : 0;
    for (let i = 0; i < sparks.count; i++) {
      const phase = i * 2.399963, rise = (time * (.3 + i % 5 * .06) + i * .127) % 1;
      const side = i % 2 ? 1 : -1, edge = i % 4 < 2;
      if (returning) pose.position.set(Math.cos(phase) * (1.8 + rise * .3), centerY + Math.sin(phase) * 2.9 + rise * .7, .28 + Math.sin(phase + time * .7) * .35);
      else pose.position.set(edge ? side * (2.7 + Math.sin(phase + time) * .18) : Math.sin(phase) * 2.8, edge ? .4 + rise * 7.7 : 7.7 + rise * .8, .28 + Math.sin(phase + time * .7) * .65);
      pose.rotation.set(phase + time, phase, time); pose.scale.setScalar((returning ? Math.sin(rise * Math.PI) : 1) * (.025 + Math.sin(rise * Math.PI) * .045)); pose.updateMatrix(); sparks.setMatrixAt(i, pose.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
  } };
}

async function loadDungeonModels() {
  const asset = (await new GLTFLoader().loadAsync('/models/dungeon-portals.glb')).scene;
  const replaced = new Map<THREE.Material, THREE.Material>();
  asset.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !node.name.endsWith('-glow')) return;
    const original = node.material as THREE.Material;
    if (!replaced.has(original)) replaced.set(original, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    node.material = replaced.get(original)!;
  });
  for (const material of replaced.keys()) material.dispose();
  return asset;
}

type Placement = { x: number; y?: number; z: number; scale?: number | [number, number, number]; turn?: number; tint?: number };
function addModels(parent: THREE.Group, asset: THREE.Group, name: string, points: readonly Placement[]) {
  const template = asset.getObjectByName(name);
  if (!template) throw new Error(`Missing authored dungeon model: ${name}`);
  asset.updateMatrixWorld(true);
  const inverse = template.matrixWorld.clone().invert(), pose = new THREE.Object3D(), color = new THREE.Color();
  template.traverse(source => {
    if (!(source instanceof THREE.Mesh)) return;
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, points.length), local = new THREE.Matrix4().multiplyMatrices(inverse, source.matrixWorld);
    mesh.name = `Blender Dungeon: ${source.name}`; mesh.userData.asset = name;
    mesh.castShadow = !source.name.endsWith('-glow'); mesh.receiveShadow = mesh.castShadow;
    points.forEach((p, i) => { pose.position.set(p.x, p.y ?? 0, p.z); Array.isArray(p.scale) ? pose.scale.set(...p.scale) : pose.scale.setScalar(p.scale ?? 1); pose.rotation.set(0, p.turn ?? 0, 0); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix.clone().multiply(local)); mesh.setColorAt(i, color.setHex(p.tint ?? 0xffffff)); });
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); parent.add(mesh);
  });
}
function disposeUnused(asset: THREE.Group, parent: THREE.Group) {
  const used = new Set<THREE.BufferGeometry | THREE.Material>(), unused = new Set<THREE.BufferGeometry | THREE.Material>();
  parent.traverse(node => { if (node instanceof THREE.Mesh) { used.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) used.add(material); } });
  asset.traverse(node => { if (node instanceof THREE.Mesh) { unused.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) unused.add(material); } });
  for (const resource of unused) if (!used.has(resource)) resource.dispose();
}

/** The authored landmarks replace selected existing pillars, within those pillars' solid footprints. */
export async function createDungeonThemeDecor(parent: THREE.Group, dungeonId: DungeonId, points: readonly Placement[], cavePoints: readonly Placement[] = []) {
  dungeonId = dungeonThemeId(dungeonId);
  if (dungeonId === 'rootvault' && !cavePoints.length) return;
  const asset = await loadDungeonModels();
  if (dungeonId !== 'rootvault') {
    const name = dungeonId === 'cindercrypt' ? 'dungeon-cinder' : dungeonId === 'frosthollow' ? 'dungeon-frost' : 'dungeon-nightroot';
    addModels(parent, asset, name, points);
  }
  if (cavePoints.length) addModels(parent, asset, 'dungeon-cave-rock', cavePoints);
  disposeUnused(asset, parent);
}

export const dungeonApproachModel = (id: DungeonId) => { const theme = dungeonThemeId(id); return `dungeon-approach-${theme === 'plagueworks' ? 'rootvault' : theme === 'emberfall' ? 'cindercrypt' : theme === 'veilhaven' ? 'nightroot' : theme}`; };

/** The worn procession turns through an open temple before revealing its inner portal. */
export async function createDungeonApproaches(parent: THREE.Group) {
  const root = new THREE.Group(); root.name = 'Dungeon approach chambers'; parent.add(root);
  const asset = await loadDungeonModels();
  const portals = new Map<string, THREE.Group>(), effects: ReturnType<typeof createDungeonPortalEffect>[] = [];
  const temples: { x: number; z: number; meshes: THREE.Object3D[] }[] = [];
  const cameraRay = new THREE.Ray(), cameraDirection = new THREE.Vector3(), localRay = new THREE.Ray(), cameraHit = new THREE.Vector3();
  const cameraTriangles: THREE.Triangle[] = [];
  const cells: { x: number; y: number; z: number; w: number; d: number; turn: number; color: number }[] = [];
  for (const dungeon of DUNGEONS) {
    const { x, z } = dungeon.entrance, y = groundHeight(x, z), chamber = new THREE.Group(); chamber.name = `Dungeon approach: ${dungeon.id}`; root.add(chamber);
    addModels(chamber, asset, dungeonApproachModel(dungeon.id), [{ x, y, z, tint: dungeon.id === 'plagueworks' ? 0xabc896 : dungeon.id === 'emberfall' ? 0xdbb59e : dungeon.id === 'veilhaven' ? 0xafd6cf : 0xffffff }]);
    temples.push({x,z,meshes:chamber.children.filter(mesh=>mesh.name.endsWith('-stone'))});
    addModels(chamber, asset, 'dungeon-portal', [{ x, y, z }]);
    await createThemedEntranceDecor(chamber, dungeon.id, x, y, z + .75);
    addModels(chamber, asset, 'dungeon-summon-stone', [{ ...dungeon.summonStone, y: groundHeight(dungeon.summonStone.x, dungeon.summonStone.z) }]);
    const effect = createDungeonPortalEffect(chamber, '#a9ef48', x, y, z); effects.push(effect); portals.set(dungeon.id, chamber);
    const stone = dungeon.id === 'frosthollow' ? 0x91abb6 : dungeon.id === 'cindercrypt' ? 0x8c755b : dungeon.id === 'nightroot' ? 0x7c6788 : 0x7b8769;
    const paving: { x: number; z: number }[] = [];
    for (const route of DUNGEON_TEMPLE_ROUTES) for (let segment = 1; segment < route.length; segment++) {
      const from = route[segment-1], to = route[segment], dx = to.x-from.x, dz = to.z-from.z, length = Math.hypot(dx,dz), steps = Math.ceil(length/1.9);
      for (let step = 0; step < steps; step++) for (const side of [-.8,.8]) {
        if ((step+segment*3+(side>0?1:0))%13===0) continue;
        const along = (step+.5)/steps;
        const point={x:from.x+dx*along+dz/length*side,z:from.z+dz*along-dx/length*side};
        if (!paving.some(existing=>Math.hypot(existing.x-point.x,existing.z-point.z)<1.4)) paving.push(point);
      }
    }
    // Isolated surviving flags break up the courtyards without filling them in.
    for (let dx=DUNGEON_TEMPLE_BOUNDS.minX+4; dx<DUNGEON_TEMPLE_BOUNDS.maxX-4; dx+=3.5) for (let dz=3; dz<DUNGEON_TEMPLE_BOUNDS.maxZ-3; dz+=3.5) {
      if (Math.round((dx+10)*2+dz*4)%9>1 || paving.some(point=>Math.hypot(point.x-dx,point.z-dz)<1.8)) continue;
      paving.push({x:dx,z:dz});
    }
    for (const [index, point] of paving.entries()) {
      if ([...DUNGEON_TEMPLE_WALLS,...DUNGEON_TEMPLE_PILLARS].some(wall=>Math.abs(point.x-wall.x)<wall.width/2+.75&&Math.abs(point.z-wall.z)<wall.depth/2+.75)) continue;
      const px=x+point.x,pz=z+point.z;
      cells.push({x:px,y:groundHeight(px,pz)+.026,z:pz,w:1.25+index%3*.10,d:1.28+index%4*.09,turn:Math.sin(index*3.7)*.055,
        color:new THREE.Color(stone).multiplyScalar(.86+index%5*.055).getHex()});
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .94 }), cells.length), pose = new THREE.Object3D(), color = new THREE.Color();
  mesh.name = 'Dungeon: worn approach paving'; mesh.receiveShadow = true;
  cells.forEach((cell, i) => { pose.position.set(cell.x, cell.y, cell.z); pose.scale.set(cell.w, .052, cell.d); pose.rotation.y = cell.turn; pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix); mesh.setColorAt(i, color.setHex(cell.color)); });
  mesh.computeBoundingBox(); mesh.computeBoundingSphere(); root.add(mesh); disposeUnused(asset, root);
  root.updateMatrixWorld(true);
  // The stone shell is one detailed mesh. Index its exact triangles once so a
  // camera inside the temple does not test the entire precinct every frame.
  const cameraTrees = new Map<THREE.BufferGeometry, Octree>();
  const cameraTemples = temples.map(temple => ({ ...temple, solids: temple.meshes.flatMap(object => {
    const mesh = object as THREE.InstancedMesh;
    const tree = cameraTrees.get(mesh.geometry) ?? new Octree().fromGraphNode(new THREE.Mesh(mesh.geometry, mesh.material));
    cameraTrees.set(mesh.geometry, tree);
    return Array.from({ length: mesh.count }, (_, index) => {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld);
      return { tree, matrix, inverse: matrix.clone().invert() };
    });
  }) }));
  return { portals, constrainCamera(target: THREE.Vector3, desired: THREE.Vector3) {
    const distance=cameraDirection.subVectors(desired,target).length();if(!Number.isFinite(distance)||distance<.001)return;
    cameraRay.set(target,cameraDirection.multiplyScalar(1/distance));
    let nearest=distance;
    for(const temple of cameraTemples){
      if(target.x<temple.x+DUNGEON_TEMPLE_BOUNDS.minX-8||target.x>temple.x+DUNGEON_TEMPLE_BOUNDS.maxX+8||target.z<temple.z+DUNGEON_TEMPLE_BOUNDS.minZ-8||target.z>temple.z+DUNGEON_TEMPLE_BOUNDS.maxZ+8)continue;
      for (const solid of temple.solids) {
        localRay.copy(cameraRay).applyMatrix4(solid.inverse); cameraTriangles.length = 0;
        solid.tree.getRayTriangles(localRay, cameraTriangles);
        // Authored stone is double-sided; retain all hits beyond the original near plane.
        for (const triangle of cameraTriangles) if (localRay.intersectTriangle(triangle.a, triangle.b, triangle.c, false, cameraHit)) {
          const hitDistance = target.distanceTo(cameraHit.applyMatrix4(solid.matrix));
          if (hitDistance >= .001 && hitDistance < nearest) nearest = hitDistance;
        }
      }
    }
    if(nearest<distance)desired.copy(target).addScaledVector(cameraDirection,Math.max(.05,nearest-.35));
  }, update(time: number, observer?: THREE.Vector3) {
    for (const effect of effects) effect.update(time, observer);

  } };
}
