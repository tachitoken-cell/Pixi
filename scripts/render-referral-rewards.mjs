import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { setMountAssets, makeMount } from '../src/mounts.ts';
import { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear } from '../src/characters.ts';
import { mountRiderOffset } from '../src/mounts.ts';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';

globalThis.FileReader = class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); } };
const temporary = mkdtempSync(join(tmpdir(), 'mossvale-referral-art-'));
try {
  const load = async name => { const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url)); return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene; };
  const sprite = (await load('wayfinder-sprite')).getObjectByName('wayfinder-sprite');
  setMountAssets(await load('wayfarer-stag'), ['wayfarer-stag']);
  let models = [['sprite', sprite.clone(true), '/tmp/mossvale-wayfinder-runtime.png'], ['stag', makeMount('wayfarer-stag'), '/tmp/mossvale-wayfarer-runtime.png']];
  if (process.argv.includes('--riders')) {
    for (const [name, setter] of [['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear]]) {
      const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
      setter((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene);
    }
    const scene = new THREE.Group(); scene.add(makeMount('wayfarer-stag'));
    for (const [race, passenger] of [['orc', false], ['goblin', true]]) {
      const rider = makeCharacter({ ...DEFAULT_APPEARANCE, race, outfit: passenger ? '#376f8b' : '#943e37' });
      rider.position.y = mountRiderOffset(rider, 'wayfarer-stag', passenger);
      animateCharacter(rider, 0, false, false, undefined, false, { mount: 'wayfarer-stag', driverId: passenger ? 'driver' : undefined }); scene.add(rider);
    }
    models = [['riders', scene, '/tmp/mossvale-referral-riders.png']];
  }
  for (const [name, model, output] of models) {
    const input = join(temporary, `${name}.glb`);
    // Bake instanced clothing into the exported verification pose; the game keeps its instances.
    const baked = new THREE.Group(), matrix = new THREE.Matrix4(), tint = new THREE.Color(); model.updateMatrixWorld(true);
    model.traverseVisible(node => {
      if (!node.isMesh) return;
      for (let i = 0; i < (node.isInstancedMesh ? node.count : 1); i++) {
        const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(material => material.clone());
        if (node.isInstancedMesh && node.instanceColor) { node.getColorAt(i, tint); for (const material of materials) material.color?.multiply(tint); }
        const mesh = new THREE.Mesh(node.geometry, Array.isArray(node.material) ? materials : materials[0]);
        matrix.identity(); if (node.isInstancedMesh) node.getMatrixAt(i, matrix);
        matrix.premultiply(node.matrixWorld);
        if (Math.abs(matrix.determinant()) < 1e-12) continue;
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix); baked.add(mesh);
      }
    });
    writeFileSync(input, Buffer.from(await new GLTFExporter().parseAsync(baked, { binary: true })));
    const python = `import bpy, math
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=${JSON.stringify(input)})
points=[o.matrix_world @ Vector(v) for o in bpy.context.scene.objects if o.type=='MESH' for v in o.bound_box]
low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
center=(low+high)/2
size=max(high-low)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=scene.render.resolution_y=512
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.world.color=(.35,.35,.35)
scene.view_settings.view_transform='Standard'
bpy.ops.object.camera_add(location=center+Vector(${name === 'riders' ? '(9,-4,4)' : '(6,-8,4)'})*size)
camera=bpy.context.object
camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=size*1.22
scene.camera=camera
for offset,energy,color in [((4,-5,7),900,(1,.89,.72)),((-4,-2,3),600,(.73,.89,1)),((0,5,5),1000,(.82,1,.88))]:
 bpy.ops.object.light_add(type='AREA',location=center+Vector(offset)*size*.7)
 light=bpy.context.object
 light.data.energy=energy*size*size
 light.data.shape='DISK'
 light.data.size=size*4
 light.data.color=color
 light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=${JSON.stringify(resolve(output))}
bpy.ops.render.render(write_still=True)
`;
    const result = spawnSync(process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender', ['--background', '--factory-startup', '--python-expr', python], { encoding: 'utf8' });
    if (result.status !== 0 || !existsSync(output) || /Traceback|Error:/.test(result.stderr + result.stdout)) throw new Error(result.stderr + result.stdout);
    console.log(`Rendered ${output}`);
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
