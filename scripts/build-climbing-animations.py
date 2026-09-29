"""Blender climbing motion with all 72 real playable builds retained for editing.

blender --background --python scripts/build-climbing-animations.py -- --render
Only reusable rotation channels ship; race geometry and proportions stay intact.
"""
import bpy
import json
import math
import subprocess
import sys
from pathlib import Path
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/climbing-animations.glb'
SOURCE = ROOT / 'assets/source/climbing-animations.blend'
PREVIEW = ROOT / 'assets/source/climbing-animations-preview.png'
FRAMES = 48

# Expand the existing runtime's visible rigid meshes for editable references only.
# This follows build-idle-animations.py and includes every race, body and class.
extract = r"""
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {makeCharacter,setCharacterRaces,setCharacterGear,setCharacterClericAssets,setCharacterCustomization}=await import('./src/characters.ts');
import {DEFAULT_APPEARANCE,RACES,GENDERS} from './src/appearance.ts';
for(const [name,install] of [['race-kit',setCharacterRaces],['gear-kit',setCharacterGear],['cleric-kit',setCharacterClericAssets],['customization-kit',setCharacterCustomization]]){
 const b=readFileSync(`public/models/${name}.glb`);install((await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene);
}
const result={};
for(const race of RACES)for(const gender of GENDERS)for(const className of ['Ranger','Knight','Mage','Cleric']){
 const root=makeCharacter({...DEFAULT_APPEARANCE,race:race.id,gender:gender.id,className}),rig=root.userData.rig,parts=rig.idleParts;
 for(const gear of [...rig.classGear,rig.pickaxe,rig.axe,rig.fishingRod])gear.visible=false;
 for(const joint of Object.values(parts))joint?.rotation.set(0,0,0);
 root.updateMatrixWorld(true);const joints=new Set(Object.values(parts).filter(Boolean)),data={};
 for(const [label,part] of Object.entries(parts)){
  if(!part)continue;
  const vertices=[],faces=[],colors=[],inverse=part.matrixWorld.clone().invert(),point=new THREE.Vector3(),instance=new THREE.Matrix4();
  function collect(node){
   if(!node.visible||(node!==part&&joints.has(node)))return;
   if(node.isMesh){
    const g=node.geometry,p=g.attributes.position,idx=g.index,c=g.attributes.color;
    for(let n=0;n<(node.isInstancedMesh?node.count:1);n++){
     const matrix=inverse.clone().multiply(node.matrixWorld);if(node.isInstancedMesh){node.getMatrixAt(n,instance);matrix.multiply(instance);}
     if(Math.abs(matrix.determinant())<1e-12)continue;
     const base=vertices.length,tint=node.material.color?.clone()||new THREE.Color(1,1,1);
     if(node.instanceColor){const color=new THREE.Color();node.getColorAt(n,color);tint.multiply(color);}
     for(let v=0;v<p.count;v++)vertices.push(point.fromBufferAttribute(p,v).applyMatrix4(matrix).toArray());
     for(let v=0;v<(idx?idx.count:p.count);v+=3){const ids=[0,1,2].map(k=>idx?idx.getX(v+k):v+k);faces.push(ids.map(i=>base+i));colors.push(ids.map(i=>{const color=tint.clone();if(c)color.multiply(new THREE.Color().fromBufferAttribute(c,i));return [...color.toArray(),1];}));}
    }
   }
   for(const child of node.children)collect(child);
  }
  collect(part);data[label]={parent:Object.entries(parts).find(([,node])=>node===part.parent)?.[0]||null,position:part.position.toArray(),vertices,faces,colors};
 }
 result[`${race.id}-${gender.id}-${className}`]=data;
}
process.stdout.write(JSON.stringify(result));
"""
models = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', extract], cwd=ROOT, text=True))
assert len(models) == 72
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
motion = bpy.context.scene
motion.name = 'Reusable climbing motion - 1.6 second loop'
motion.render.fps = 30
motion.frame_start = 0
motion.frame_end = FRAMES
basis = Euler((math.pi / 2, 0, 0)).to_matrix()

def xyz(x, y, z): return (x, -z, y)
def rotation(value): return (basis @ Euler(value, 'XYZ').to_matrix() @ basis.transposed()).to_quaternion()
def pose(t):
    stroke = math.sin(math.tau * t)
    sway = math.cos(math.tau * t)
    return {
        'body': (.10, .025 * sway, .025 * stroke),
        'head': (-.14, -.03 * sway, -.02 * stroke),
        'left-arm': (-2.25 - .43 * stroke, -.06 * sway, -.16),
        'right-arm': (-2.25 + .43 * stroke, .06 * sway, .16),
        'left-leg': (-.52 + .37 * stroke, .04, .065),
        'right-leg': (-.52 - .37 * stroke, -.04, -.065),
        'cape': (-.10 + .035 * sway, .015 * stroke, 0),
        'tail': (-.20, .09 * sway, .04 * stroke),
    }

def empty(scene, name, parent=None, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = xyz(*position)
    obj.rotation_mode = 'QUATERNION'
    obj.empty_display_size = .12
    return obj

reference = models['foxfolk-male-Knight']
root = empty(motion, 'player')
root['coverage'] = list(models)
root['description'] = 'Shared rotation channels preserve all 18 anatomies and all four classes'
pivots = {part: empty(motion, 'player-' + part, position=data['position']) for part, data in reference.items()}
actions = {}
for part, node in pivots.items():
    node.parent = pivots.get(reference[part]['parent'], root)
    for frame in range(0, FRAMES + 1, 2):
        node.rotation_quaternion = rotation(pose(0 if frame == FRAMES else frame / FRAMES)[part])
        node.keyframe_insert(data_path='rotation_quaternion', frame=frame)
    action = node.animation_data.action
    action.name = 'player-climb-' + part
    for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
        for point in curve.keyframe_points:
            point.interpolation = 'BEZIER'
            point.handle_left_type = point.handle_right_type = 'AUTO_CLAMPED'
    track = node.animation_data.nla_tracks.new()
    track.name = 'player-climb'
    track.strips.new(track.name, 0, action).extrapolation = 'NOTHING'
    node.animation_data.action = None
    actions[part] = action
motion.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for node in [root, *pivots.values()]: node.select_set(True)
EXPORT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS',
    export_merge_animation='NLA_TRACK', export_force_sampling=True, export_extras=True, export_cameras=False, export_lights=False)

material = bpy.data.materials.new('Actual runtime voxel colors')
material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .85
attribute = material.node_tree.nodes.new('ShaderNodeVertexColor')
attribute.layer_name = 'VoxelTint'
material.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color'])
actors = bpy.data.scenes.new('All 72 playable builds - scrub frames 0 to 48')
actors.render.fps = 30
actors.frame_start = 0
actors.frame_end = FRAMES
surfaces = {}
for index, (name, parts) in enumerate(models.items()):
    actor = empty(actors, name, position=((index % 4) * 3, 0, -(index // 4) * 4))
    actor['appearance'] = name
    joints = {part: empty(actors, name + '-' + part, position=data['position']) for part, data in parts.items()}
    surfaces[name] = []
    for part, data in parts.items():
        node = joints[part]
        node.parent = joints.get(data['parent'], actor)
        node.animation_data_create()
        track = node.animation_data.nla_tracks.new()
        track.name = 'player-climb'
        track.strips.new('player-climb', 0, actions[part]).extrapolation = 'NOTHING'
        mesh = bpy.data.meshes.new(name + '-' + part)
        mesh.from_pydata([xyz(*vertex) for vertex in data['vertices']], [], data['faces'])
        mesh.update()
        tint = mesh.color_attributes.new(name='VoxelTint', type='BYTE_COLOR', domain='CORNER')
        for face, colors in zip(mesh.polygons, data['colors']):
            for loop, color in zip(face.loop_indices, colors): tint.data[loop].color = color
        surface = bpy.data.objects.new(name + '-' + part + '-surface', mesh)
        actors.collection.objects.link(surface)
        surface.parent = node
        mesh.materials.append(material)
        surfaces[name].append(surface)

# A compact review camera shows every body, with the four classes distributed
# across the rows. The editable scene above retains all 72 class/body builds.
gallery = bpy.data.scenes.new('Climbing gallery - all 18 bodies')
gallery.render.engine = 'CYCLES'
gallery.cycles.samples = 24
gallery.cycles.use_denoising = True
gallery.render.resolution_x = 2400
gallery.render.resolution_y = 1500
gallery.render.resolution_percentage = 100
gallery.world = bpy.data.worlds.new('Climbing review light')
gallery.world.use_nodes = True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.17, .21, .25, 1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .65
gallery.view_settings.view_transform = 'AgX'

def flat(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    return mat

stone = flat('Climbing wall stone', (.13, .18, .20))
caption = flat('Gallery text', (.92, .84, .63))
for body in range(18):
    index = body * 4 + body % 4
    name = list(models)[index]
    bpy.context.window.scene = actors
    actors.frame_set(10 if body % 2 else 34)
    bpy.context.view_layer.update()
    original = Vector(xyz((index % 4) * 3, 0, -(index // 4) * 4))
    target = Vector(xyz((body % 6) * 3.2, .4, -(body // 6) * 5.2))
    for surface in surfaces[name]:
        obj = surface.copy()
        obj.parent = None
        obj.matrix_world = surface.matrix_world.copy()
        obj.location += target - original
        gallery.collection.objects.link(obj)
    bpy.context.window.scene = gallery
    cx, cz = (body % 6) * 3.2, -(body // 6) * 5.2
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(cx, 1.35, cz + .93))
    wall = bpy.context.object
    wall.name = name + '-review-wall'
    wall.scale = (2.15, .24, 3.15)
    wall.data.materials.append(stone)
    bpy.ops.object.text_add(location=xyz(cx, .20, cz - .70))
    label = bpy.context.object
    label.data.body = ' '.join(name.split('-')[:2]) + '\n' + name.split('-')[-1]
    label.data.align_x = 'CENTER'
    label.data.size = .18
    label.data.materials.append(caption)

def aim(obj, target): obj.rotation_euler = (Vector(xyz(*target)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
for at, energy, size in [((2, 18, -15), 4200, 12), ((22, 16, 0), 3800, 10), ((3, 10, 9), 3200, 9)]:
    bpy.ops.object.light_add(type='AREA', location=xyz(*at))
    light = bpy.context.object
    light.data.energy, light.data.size = energy, size
    aim(light, (8, 0, -4.4))
bpy.ops.object.camera_add(location=xyz(8, 24, -30))
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 23
aim(camera, (8, 1, -5.2))
gallery.camera = camera
for obj in gallery.objects:
    if obj.type == 'FONT': obj.rotation_euler = camera.rotation_euler
gallery.render.image_settings.file_format = 'PNG'
gallery.render.filepath = str(PREVIEW)
SOURCE.parent.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
print('CLIMBING_ANIMATIONS ' + json.dumps({'models': len(models), 'clip': 'player-climb', 'duration': FRAMES / 30, 'bytes': EXPORT.stat().st_size, 'source': str(SOURCE)}))
if '--render' in sys.argv: bpy.ops.render.render(write_still=True)
