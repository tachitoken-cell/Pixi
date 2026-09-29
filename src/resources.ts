import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { NodeKind, ZoneId } from './content';
import { RESOURCE_TYPES } from './skills.ts';

let resourceTree: { geometry: THREE.BufferGeometry; material: THREE.Material } | undefined;
let gatheringKit: THREE.Group | undefined;
let gatheringAssets: Promise<void> | undefined;
let worldFeatureKit: THREE.Group | undefined;
let worldFeatureAssets: Promise<THREE.Group> | undefined;
export function loadWorldFeatureAssets(): Promise<THREE.Group> {
  return worldFeatureAssets ??= new GLTFLoader().loadAsync('/models/world-feedback-kit.glb').then(({scene}) => {
    worldFeatureKit = scene; return scene;
  }).catch(error => { worldFeatureAssets = undefined; throw error; });
}

export const WORKSHOP_MODELS = {
  greenwood: 'crafting-woodworking', amberwild: 'crafting-forge', frostmarch: 'crafting-forge',
  hollow: 'crafting-alchemy', sunveil: 'crafting-forge', mistwood: 'crafting-alchemy',
} as const satisfies Record<ZoneId, string>;

export function loadGatheringAssets(): Promise<void> {
  return gatheringAssets ??= Promise.all([new GLTFLoader().loadAsync('/models/gathering-kit.glb'), loadWorldFeatureAssets()]).then(([{ scene }]) => {
    for (const resource of Object.values(RESOURCE_TYPES)) if (resource.model) {
      const source = scene.getObjectByName(resource.model);
      if (!source?.getObjectByName(`${resource.model}-base`) || !source.getObjectByName(`${resource.model}-yield`))
        throw new Error(`Missing gathering model: ${resource.model}`);
    }
    for (const name of new Set(Object.values(WORKSHOP_MODELS)))
      if (!scene.getObjectByName(name)) throw new Error(`Missing workshop model: ${name}`);
    gatheringKit = scene;
  }).catch(error => { gatheringAssets = undefined; throw error; });
}

export function setResourceTreeAssets(asset: THREE.Object3D) {
  const source = asset.getObjectByName('WoodlandOak');
  if (!(source instanceof THREE.Mesh) || Array.isArray(source.material)) throw new Error('Missing single-mesh resource tree: WoodlandOak');
  source.updateWorldMatrix(true, false);
  const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld), material = source.material.clone();
  resourceTree?.geometry.dispose(); resourceTree?.material.dispose();
  resourceTree = { geometry, material };
}

/** Node-owned assets are released by removeNode when changing zones. */
function cloneGatheringModel(model: string): THREE.Group {
    const source = (model.startsWith('feedback-') ? worldFeatureKit : gatheringKit)?.getObjectByName(model);
    if (!source) throw new Error(`Load the gathering kit before creating ${model}`);
    const group = source instanceof THREE.Mesh ? new THREE.Group() : source.clone(true) as THREE.Group;
    if (source instanceof THREE.Mesh) { group.name = model; group.add(source.clone(true)); }
    const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    const materials = new Map<THREE.Material, THREE.Material>();
    group.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
      node.geometry = geometries.get(node.geometry)!;
      const ownMaterial = (source: THREE.Material) => {
        if (!materials.has(source)) materials.set(source, source.clone());
        return materials.get(source)!;
      };
      node.material = Array.isArray(node.material) ? node.material.map(ownMaterial) : ownMaterial(node.material);
      node.castShadow = node.receiveShadow = true;
    });
    return group;
}

export function makeWorkshop(zone: ZoneId): THREE.Group {
  return cloneGatheringModel(WORKSHOP_MODELS[zone]);
}

export function makeResource(kind: NodeKind): THREE.Group {
  if (RESOURCE_TYPES[kind].skill === 'fishing') {
    const group = cloneGatheringModel('feedback-fishing');
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.RingGeometry(.45+i*.32,.48+i*.32,20),new THREE.MeshBasicMaterial({color:'#c6e9df',transparent:true,opacity:.7-i*.15,side:THREE.DoubleSide}));ring.name='Fishing ripple';ring.rotation.x=-Math.PI/2;ring.position.set(0,-.16,4);group.add(ring);}
    return group;
  }
  const model = RESOURCE_TYPES[kind].model;
  if (model) return cloneGatheringModel(model);
  if (kind === 'timber' && !resourceTree) throw new Error('Load WoodlandOak before creating timber resources');
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const box = (color: string, x: number, y: number, z: number, w: number, h: number, d: number, harvestable = true, glow = false) => {
    const key = color + glow;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .85, emissive: glow ? color : '#000000', emissiveIntensity: .25 }));
    const mesh = new THREE.Mesh(geometry, materials.get(key));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.harvestable = harvestable; group.add(mesh); return mesh;
  };
  if (kind === 'timber') {
    box('#755139', 0, .22, 0, .7, .44, .7, false);
    const tree = new THREE.Mesh(resourceTree!.geometry.clone(), resourceTree!.material.clone());
    tree.name = 'WoodlandOak'; tree.scale.setScalar(3.1 / 5.8);
    tree.castShadow = true; tree.receiveShadow = true; tree.userData.harvestable = true; group.add(tree);
  } else if (kind === 'herb') {
    box('#668052', 0, .055, 0, 1.15, .11, .9, false);
    for (let i = 0; i < 5; i++) {
      const x = Math.sin(i * 2) * .4, z = Math.cos(i * 2) * .28;
      box('#52935a', x, .32, z, .08, .58, .08);
      box('#9dc961', x + .12, .35, z, .3, .1, .16).rotation.z = .4;
      box('#75b36c', x - .12, .22, z, .3, .1, .16).rotation.z = -.4;
      box('#e8c677', x, .65 + (i % 2) * .1, z, .22, .16, .22, true, true);
    }
  } else {
    const tint = ({ crystal: '#8ce4d5', 'ember-shard': '#edaa43', 'star-fragment': '#b6e9ff', heartroot: '#ca8be6' } as Partial<Record<NodeKind, string>>)[kind];
    if (!tint) throw new Error(`Missing resource model: ${kind}`);
    box('#647a71', 0, .15, 0, 1.45, .38, 1.2, false);
    for (let i = 0; i < 5; i++) {
      const crystal = box(tint, Math.sin(i * 2) * .4, .52 + .12 * (i % 3), Math.cos(i * 2) * .3, .22, .65 + (i % 3) * .18, .25, true, true);
      crystal.rotation.set(i * .12, Math.PI / 4, i * .12 - .2);
    }
  }
  return group;
}
export function showResource(group: THREE.Group, available: boolean) {
  for (const child of group.children) child.visible = available;
}
