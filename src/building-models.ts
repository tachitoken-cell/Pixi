import * as THREE from 'three';
import { BUILDINGS, BUILDING_CHAIRS, buildingAt, buildingPoint, buildingFloorHeight, buildingDoorWidth } from './buildings.ts';
import { insideAnyCity, CITY_LAYOUTS, BANK_HOME_IDS, ALL_CITY_FURNISHINGS } from './city.ts';
import { createVillageProps } from './village-models.ts';
import { groundHeight } from './landscape.ts';

/** Shared Blender geometry, with per-house walls for a camera-facing interior cutaway. */
export function createBuildingModels(asset: THREE.Group, frontier?: THREE.Group, furnishings?: THREE.Group) {
  const root = new THREE.Group(); root.name = 'Walkable homes';
  const chairs = new Map<string, THREE.Object3D>();
  const pendulums: { node: THREE.Object3D; rest: THREE.Quaternion }[] = [];
  const foundationMaterial = new THREE.MeshStandardMaterial({ color: 0x879184, roughness: .95 });
  const cube = new THREE.BoxGeometry(1, 1, 1), pose = new THREE.Object3D();
  const biomeMaterials=new Map<string,THREE.Material>();
  const homes = BUILDINGS.map(building => {
    const source = asset.getObjectByName(`deed-${building.id}`) || asset.getObjectByName(['auction-hall','clocktower'].includes(building.kind) ? `city-${building.kind}` : `house-${insideAnyCity(building.x,building.z)?'city-':''}${building.kind}`);
    if (!source) throw new Error(`Missing Blender house: ${building.kind}`);
    const model = source.clone(true); model.name = building.id;
    let biomeExterior:THREE.Object3D|undefined;
    if (frontier && (building.zone!=='greenwood'||!insideAnyCity(building.x,building.z)) && (building.kind==='cottage'||building.kind==='inn')) {
      const replacement = frontier?.getObjectByName(`frontier-${building.zone}-${building.kind}`);
      if (!replacement) throw new Error(`Missing frontier exterior: ${building.zone}/${building.kind}`);
      const oldShell: THREE.Object3D[] = [];
      model.traverse(part => { if (/^(roof|shell)-/.test(String(part.userData.part || part.name))) oldShell.push(part); });
      oldShell.forEach(part => part.removeFromParent());
      biomeExterior=replacement.clone(true);
    }
    if (building.id === BANK_HOME_IDS[building.zone]) {
      const furniture: THREE.Object3D[] = [];
      model.traverse(part=>{const name=String(part.userData.part||part.name);if(name.startsWith('interior-')&&name!=='interior-floor')furniture.push(part);});
      furniture.forEach(part=>part.removeFromParent());
    }
    if (furnishings) model.add(createVillageProps(furnishings,ALL_CITY_FURNISHINGS.filter(p=>p.buildingId===building.id).map(p=>({...p,y:p.kind==='bank-crest'?4.35:0})),'furnishing-'));
    model.position.set(building.x, building.y, building.z); model.rotation.set(0, building.rotation, 0);
    const town=CITY_LAYOUTS.find(city=>city.zone===building.zone);
    if(town&&town.tint!==0xffffff&&insideAnyCity(building.x,building.z))model.traverse(node=>{
      if(!(node instanceof THREE.Mesh))return;
      const tinted=(source:THREE.Material)=>{
        const key=`${town.zone}:${source.uuid}`;let material=biomeMaterials.get(key);
        if(!material){material=source.clone();if('color' in material)(material.color as THREE.Color).multiply(new THREE.Color(town.tint));biomeMaterials.set(key,material);}
        return material;
      };
      node.material=Array.isArray(node.material)?node.material.map(tinted):tinted(node.material);
    });
    // Preserve the biome kit's authored colors while the existing interior keeps its city tint.
    if(biomeExterior)model.add(biomeExterior);
    const exterior: THREE.Object3D[] = [];
    const moving: THREE.Mesh[] = [];
    const seats = BUILDING_CHAIRS.filter(chair => chair.buildingId === building.id);
    model.traverse(object => {
      if (object.userData.villageProp === 'bank-crest') object.userData.part = 'shell-front-bank-crest';
      // Blender exports a multi-material part as a group of primitive meshes.
      const part = String(object.userData.part || object.name);
      if (/^(roof|shell)-/.test(part)) exterior.push(object);
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      if (part.endsWith('-glass')) { object.castShadow = false; (object.material as THREE.Material).depthWrite = false; }
      if (part === 'interior-pendulum') {
        moving.push(object);
        object.userData.collision = 'effect';
        object.userData.collisionReason = 'Swinging clock ornament; fixed clock housing remains solid.';
      }
      const index = part.match(/^interior-chair-(\d+)/)?.[1];
      if (index !== undefined && seats[Number(index)]) {
        const chair = seats[Number(index)]; object.userData.targetId = chair.id; chairs.set(chair.id, object);
      }
    });
    root.add(model);
    // Quantized GLB meshes are recentered during export; swing around the authored fulcrum.
    for (const mesh of moving) {
      const pivot = new THREE.Group(); pivot.name='Clock pendulum fulcrum';
      pivot.position.fromArray(mesh.userData.animationPivot || [0,5.5,-5.28]);
      model.add(pivot); model.updateMatrixWorld(true); pivot.attach(mesh);
      pendulums.push({node:pivot,rest:pivot.quaternion.clone()});
    }
    // Level the whole footprint. Small entry steps join the raised floor to the terrain.
    let low = building.y;
    for (const x of [-building.width / 2, 0, building.width / 2]) for (const z of [-building.depth / 2, 0, building.depth / 2]) {
      const p = buildingPoint(building, x, z); low = Math.min(low, groundHeight(p.x, p.z));
    }
    const foundation = new THREE.InstancedMesh(cube, foundationMaterial, 7);
    foundation.name = 'Foundation and entry steps'; foundation.receiveShadow = true; model.add(foundation);
    pose.position.set(0, -(building.y - low + .25) / 2 - .015, 0); pose.scale.set(building.width, building.y-low+.25, building.depth); pose.updateMatrix();
    foundation.setMatrixAt(0, pose.matrix);
    for (let step = 0; step < 6; step++) {
      const z = building.depth / 2 + (step + .5) * .5, point = buildingPoint(building, 0, z);
      const terrain = groundHeight(point.x, point.z), top = buildingFloorHeight(point.x, point.z);
      const height = Math.max(.04, top - terrain + .10);
      pose.position.set(0, top-building.y-height/2, z); pose.scale.set(buildingDoorWidth(building), height, .5); pose.updateMatrix(); foundation.setMatrixAt(step+1, pose.matrix);
    }
    foundation.computeBoundingBox(); foundation.computeBoundingSphere();
    return { building, model, exterior };
  });
  // Authored home transforms stay fixed; world matrices still follow parents and pendulums.
  for (const { model } of homes) model.traverse(node => { node.updateMatrix(); node.matrixAutoUpdate = false; });
  for (const { node } of pendulums) node.matrixAutoUpdate = true;
  return { root, chairs, animate(time: number) {
    if (!Number.isFinite(time)) return;
    for (const {node,rest} of pendulums) {
      node.quaternion.copy(rest);
      node.rotateZ(Math.sin(time*2.1)*.15);
    }
  }, update(player: {x:number;z:number;y?:number}, camera: {x:number;z:number}) {
    const inside = player.y===undefined||player.y<=buildingFloorHeight(player.x,player.z)+3?buildingAt(player.x, player.z):undefined;
    for (const { building, model, exterior } of homes) {
      model.visible = Math.hypot(player.x - building.x, player.z - building.z) < 210;
      if (!model.visible) continue;
      const dx = camera.x - building.x, dz = camera.z - building.z, c = Math.cos(building.rotation), s = Math.sin(building.rotation);
      const x = dx * c - dz * s, z = dx * s + dz * c;
      for (const part of exterior) {
        const name = String(part.userData.part || part.name);
        part.visible = inside?.id !== building.id || !(
          name.startsWith('roof-') || name.startsWith('shell-front') && z > 0 || name.startsWith('shell-back') && z <= 0 ||
          name.startsWith('shell-right') && x > 0 || name.startsWith('shell-left') && x <= 0
        );
      }
    }
  } };
}
