"""Author 1.4s collapses in Blender against the actual game geometry.

blender --background --python scripts/build-death-animations.py -- --render
The blend retains editable rigid hierarchies and a pose gallery. The shipping
GLB contains only motion pivots: each race keeps its own anatomy and equipment.
"""
import bpy
import json
import math
import subprocess
import sys
from pathlib import Path
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/death-animations.glb'
SOURCE = ROOT / 'assets/source/death-animations.blend'
PREVIEW = ROOT / 'assets/source/death-animations-preview.png'

# Bring the real runtime's rigid parts into the authoring scene, including the
# character's held gear. Expand instancing here; no extra runtime meshes ship.
extract = r"""
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {makeCharacter,makeEnemy,setCharacterRaces,setCharacterGear,setCharacterCustomization} from './src/characters.ts';
import {DEFAULT_APPEARANCE} from './src/appearance.ts';
for(const [name,set] of [['race-kit',setCharacterRaces],['gear-kit',setCharacterGear],['customization-kit',setCharacterCustomization]]){
 const b=readFileSync(`public/models/${name}.glb`);set((await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene);
}
const result={};
for(const kind of ['player','moss-slime','briar-sentinel','ice-wisp','root-warden']){
 const root=kind==='player'?makeCharacter({...DEFAULT_APPEARANCE,className:'Knight'}):makeEnemy(kind),rig=root.userData.rig||root.userData.enemyRig;
 const parts=kind==='player'?{body:rig.body,head:rig.head,'left-arm':rig.leftArm,'right-arm':rig.rightArm,'left-leg':rig.leftLeg,'right-leg':rig.rightLeg,cape:rig.cape,...Object.fromEntries(rig.classGear.map(gear=>[gear.name,gear]))}:
 {body:rig.body,head:rig.head,core:rig.core,'left-arm':rig.arms?.[0],'right-arm':rig.arms?.[1],'left-leg':rig.legs?.[0],'right-leg':rig.legs?.[1],'left-wing':rig.wings?.[0],'right-wing':rig.wings?.[1]};
 root.updateMatrixWorld(true);const joints=new Set(Object.values(parts).filter(Boolean)),data={};
 for(const [label,part] of Object.entries(parts)){
  if(!part)continue;
  const vertices=[],faces=[],colors=[],inverse=part.matrixWorld.clone().invert(),tint=new THREE.Color(),point=new THREE.Vector3(),instance=new THREE.Matrix4();
  function collect(node){
   if(!node.visible||(node!==part&&joints.has(node)))return;
   if(node.isMesh){
    const g=node.geometry,p=g.attributes.position,idx=g.index,c=g.attributes.color;
    for(let n=0;n<(node.isInstancedMesh?node.count:1);n++){
     const matrix=inverse.clone().multiply(node.matrixWorld);
     if(node.isInstancedMesh){node.getMatrixAt(n,instance);matrix.multiply(instance);}
     if(Math.abs(matrix.determinant())<1e-12)continue;
     const base=vertices.length; tint.copy(node.material.color||new THREE.Color(1,1,1));
     if(node.instanceColor){const color=new THREE.Color();node.getColorAt(n,color);tint.multiply(color);}
     for(let v=0;v<p.count;v++)vertices.push(point.fromBufferAttribute(p,v).applyMatrix4(matrix).toArray());
     const count=idx?idx.count:p.count;
     for(let v=0;v<count;v+=3){const ids=[0,1,2].map(k=>idx?idx.getX(v+k):v+k);faces.push(ids.map(i=>base+i));colors.push(ids.map(i=>{const color=tint.clone();if(c)color.multiply(new THREE.Color().fromBufferAttribute(c,i));return [...color.toArray(),1];}));}
    }
   }
   for(const child of node.children)collect(child);
  }
  collect(part);data[label]={parent:Object.entries(parts).find(([,node])=>node===part.parent)?.[0],position:part.position.toArray(),scale:part.scale.toArray(),vertices,faces,colors};
 }
 result[kind]=data;
}
process.stdout.write(JSON.stringify(result));
"""
models = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', extract], cwd=ROOT, text=True))
for label, parent in [('bow', 'left-arm'), ('staff', 'right-arm')]:
 models['player'][label] = {'parent': parent, 'position': [0, -.625, .04], 'scale': [1, 1, 1], 'vertices': [], 'faces': [], 'colors': []}
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
library = bpy.context.scene; library.name = 'Death motion library - editable game rigs'
library.unit_settings.system = 'METRIC'; library.render.fps = 30
library.frame_start = 0; library.frame_end = 42
material = bpy.data.materials.new('Runtime voxel palette'); material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF'); shader.inputs['Roughness'].default_value = .8
color = material.node_tree.nodes.new('ShaderNodeVertexColor'); color.layer_name = 'VoxelTint'
material.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
def xyz(x, y, z): return (x, -z, y)
basis = Euler((math.pi / 2, 0, 0)).to_matrix()
def rotation(euler): return (basis @ Euler(euler, 'XYZ').to_matrix() @ basis.transposed()).to_quaternion()

# Keyed recoil, loss of balance, contact and settling. Each species has its own
# direction and articulation. Only the jelly slime deflates; anatomy stays rigid.
frames = [0, 5, 12, 21, 29, 35, 42]
def keys(*values): return list(values)
motion = {
 'player': {
  'body': keys((0,0,0),(-.16,0,-.07),(.45,0,-.1),(1.20,.08,-.22),(1.61,.08,-.2),(1.48,.08,-.2),(1.5,.08,-.2)),
  'head': keys((0,0,0),(.2,0,0),(.35,-.08,0),(-.12,-.3,.1),(-.22,-.38,.14),(-.18,-.38,.14),(-.2,-.38,.14)),
  'left-arm': keys((0,0,0),(-.3,0,-.18),(-.65,.05,-.4),(-.3,.05,-.65),(.02,.05,-.7),(-.02,.05,-.68),(0,.05,-.68)),
  'right-arm': keys((0,0,0),(-.5,0,.2),(-.65,-.05,.5),(-.25,-.05,.65),(.08,-.05,.68),(.03,-.05,.68),(.05,-.05,.68)),
  'left-leg': keys((0,0,0),(.12,0,0),(.42,0,-.12),(.05,.12,-.14),(-.12,.12,-.14),(-.08,.12,-.14),(-.1,.12,-.14)),
  'right-leg': keys((0,0,0),(-.08,0,0),(.18,0,.12),(-.2,-.12,.14),(-.06,-.12,.14),(-.11,-.12,.14),(-.1,-.12,.14)),
  'cape': keys((0,0,0),(.15,0,0),(.35,0,0),(.45,0,0),(.12,0,0),(.18,0,0),(.15,0,0)),
  'sword': keys((2.2,0,0),(2.2,0,0),(1.7,0,0),(.8,0,0),(-.1,0,0),(.03,0,0),(0,0,0)),
  'staff': keys((0,0,.3),(0,0,.3),(0,0,.25),(0,0,.12),(0,0,-.04),(0,0,.01),(0,0,0)),
  'bow': keys((0,0,-.65),(0,0,-.65),(0,0,-.5),(0,0,-.3),(0,0,-.1),(0,0,-.17),(0,0,-.15)),
  'shield': keys((0,0,0),(0,0,0),(0,0,.08),(0,0,.12),(0,0,0),(0,0,.03),(0,0,.02)),
  'move': keys((0,0,0),(0,-.03,-.06),(0,-.22,-.10),(0,-.65,-.3),(0,-.9,-.42),(0,-.88,-.45),(0,-.89,-.45)),
 },
 'moss-slime': {
  'body': keys((0,0,0),(0,-.1,-.15),(.08,.12,.35),(.14,.2,.55),(.10,.25,.12),(.07,.25,.16),(.08,.25,.14)),
  'scale': keys((1,1,1),(1,1,1),(1.02,.96,1.02),(1.1,.68,1.08),(1.2,.33,1.22),(1.16,.39,1.18),(1.18,.36,1.2)),
  'move': keys((0,0,0),(-.05,0,0),(.05,0,.03),(.23,0,.08),(.43,0,.12),(.41,0,.12),(.42,0,.12)),
 },
 'briar-sentinel': {
  'body': keys((0,0,0),(-.14,0,0),(.26,0,.08),(1.0,0,.15),(1.68,.04,.18),(1.49,.04,.18),(1.53,.04,.18)),
  'head': keys((0,0,0),(-.16,0,0),(.32,.1,0),(.12,.28,0),(-.15,.4,-.12),(-.22,.4,-.12),(-.18,.4,-.12)),
  'core': keys((0,0,0),(0,0,0),(0,0,.12),(0,0,.21),(0,0,.12),(0,0,.16),(0,0,.15)),
  'left-arm': keys((0,0,0),(-.15,0,-.08),(-.6,0,-.25),(-1.2,0,-.6),(-.98,.1,-.78),(-1.1,.1,-.78),(-1.08,.1,-.78)),
  'right-arm': keys((0,0,0),(-.25,0,.12),(-.4,0,.4),(-.8,0,.85),(-.48,0,1.1),(-.55,0,1.08),(-.53,0,1.08)),
  'left-leg': keys((0,0,0),(.08,0,0),(.15,0,-.05),(.28,0,-.15),(.1,0,-.18),(.14,0,-.18),(.13,0,-.18)),
  'right-leg': keys((0,0,0),(-.08,0,0),(-.15,0,.04),(-.24,0,.15),(-.1,0,.2),(-.14,0,.2),(-.13,0,.2)),
  'move': keys((0,0,0),(0,0,-.04),(0,-.08,.05),(0,-.5,.28),(0,-.7,.52),(0,-.68,.55),(0,-.7,.56)),
 },
 'root-warden': {
  'body': keys((0,0,0),(-.10,0,.08),(.38,0,-.15),(.7,.08,-.58),(1.15,.12,-1.02),(1.03,.12,-.95),(1.06,.12,-.97)),
  'head': keys((0,0,0),(.18,0,0),(.35,-.1,0),(.08,-.3,.18),(-.14,-.38,.24),(-.08,-.38,.24),(-.1,-.38,.24)),
  'core': keys((0,0,0),(0,0,0),(0,0,-.08),(0,0,-.15),(0,0,-.23),(0,0,-.2),(0,0,-.21)),
  'left-arm': keys((0,0,0),(-.15,0,-.18),(-.55,0,-.4),(-.9,0,-.72),(-1.02,.1,-.58),(-.93,.1,-.63),(-.95,.1,-.62)),
  'right-arm': keys((0,0,0),(-.08,0,.1),(-.72,0,.34),(-1.35,0,.35),(-1.2,-.1,.42),(-1.27,-.1,.4),(-1.25,-.1,.4)),
  'left-leg': keys((0,0,0),(.1,0,0),(.4,.1,-.2),(.18,.12,-.32),(-.16,.12,-.28),(-.1,.12,-.28),(-.12,.12,-.28)),
  'right-leg': keys((0,0,0),(-.08,0,0),(.2,-.08,.2),(-.35,-.1,.3),(-.2,-.1,.3),(-.24,-.1,.3),(-.23,-.1,.3)),
  'move': keys((0,0,0),(0,-.04,-.06),(0,-.42,.03),(.13,-1,.14),(.45,-1.35,.34),(.47,-1.3,.37),(.48,-1.33,.38)),
 },
 'ice-wisp': {
  'body': keys((0,0,0),(-.1,-.18,.12),(.2,.35,-.18),(.7,.8,.24),(1.45,1.15,.45),(1.3,1.2,.49),(1.34,1.2,.5)),
  'core': keys((0,0,0),(0,.15,0),(.1,.4,.15),(.3,.7,.35),(.42,.94,.52),(.38,.9,.5),(.4,.92,.5)),
  'left-wing': keys((0,0,0),(.08,0,-.18),(-.18,0,.35),(-.4,.2,1),(-.5,.25,1.32),(-.5,.25,1.23),(-.5,.25,1.25)),
  'right-wing': keys((0,0,0),(.08,0,.18),(-.18,0,-.35),(-.4,-.2,-1),(-.5,-.25,-1.32),(-.5,-.25,-1.23),(-.5,-.25,-1.25)),
  'move': keys((0,0,0),(0,.06,0),(-.04,-.06,0),(.05,-.44,.08),(.1,-.82,.14),(.12,-.84,.15),(.12,-.84,.15)),
 },
}
rigs = {}; surfaces = {}
for kind, parts in models.items():
 root = bpy.data.objects.new(kind, None); library.collection.objects.link(root)
 rig = {}; surfaces[kind] = []
 for label, data in parts.items():
  node = bpy.data.objects.new(kind + '-' + label, None); library.collection.objects.link(node)
  node.empty_display_type = 'PLAIN_AXES'; node.empty_display_size = .15
  node.parent = root if label == 'body' else rig[data.get('parent') or 'body']; node.location = xyz(*data['position']); node.scale = (data['scale'][0], data['scale'][2], data['scale'][1]); rig[label] = node
  mesh = bpy.data.meshes.new(kind + '-' + label + ' geometry'); mesh.from_pydata([xyz(*v) for v in data['vertices']], [], data['faces']); mesh.update()
  tint = mesh.color_attributes.new(name='VoxelTint', type='FLOAT_COLOR', domain='CORNER')
  for face, colors in zip(mesh.polygons, data['colors']):
   for loop, color in zip(face.loop_indices, colors): tint.data[loop].color = color
  surface = bpy.data.objects.new(kind + '-' + label + '-reference', mesh); library.collection.objects.link(surface); surface.parent = node; mesh.materials.append(material); surfaces[kind].append(surface)
  node.rotation_mode = 'QUATERNION'; base = node.location.copy()
  for index, frame in enumerate(frames):
   node.rotation_quaternion = rotation(motion[kind][label][index]); node.keyframe_insert(data_path='rotation_quaternion', frame=frame)
   if label == 'body':
    node.location = base + Vector(xyz(*motion[kind]['move'][index])); node.keyframe_insert(data_path='location', frame=frame)
    if 'scale' in motion[kind]:
     sx, sy, sz = motion[kind]['scale'][index]; node.scale = (sx, sz, sy); node.keyframe_insert(data_path='scale', frame=frame)
  action = node.animation_data.action; action.name = kind + '-death-' + label
  for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
   for point in curve.keyframe_points: point.interpolation = 'BEZIER'; point.handle_left_type = point.handle_right_type = 'AUTO_CLAMPED'
  track = node.animation_data.nla_tracks.new(); track.name = kind + '-death'
  strip = track.strips.new(track.name, 0, action); strip.extrapolation = 'HOLD_FORWARD'; node.animation_data.action = None
 rigs[kind] = (root, rig)

# Only animated empties enter the download; geometry remains editable in .blend.
library.frame_set(0); bpy.ops.object.select_all(action='DESELECT')
for root, rig in rigs.values():
 root.select_set(True)
 for node in rig.values(): node.select_set(True)
for folder in [EXPORT.parent, SOURCE.parent]: folder.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format='GLB', use_selection=True, export_yup=True,
 export_animations=True, export_animation_mode='NLA_TRACKS', export_merge_animation='NLA_TRACK', export_force_sampling=True,
 export_cameras=False, export_lights=False)

# Four snapshots per rig provide a readable contact/settling authoring sheet.
gallery = bpy.data.scenes.new('Death poses - 0s 0.4s 0.7s 1.4s'); bpy.context.window.scene = gallery
gallery.render.engine = 'CYCLES'; gallery.cycles.samples = 24; gallery.cycles.use_denoising = True
gallery.render.resolution_x = 1920; gallery.render.resolution_y = 1600; gallery.render.resolution_percentage = 100
gallery.world = bpy.data.worlds.new('Death gallery world'); gallery.world.use_nodes = True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.21, .25, .3, 1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
gallery.view_settings.view_transform = 'AgX'
def flat(name, rgb):
 mat = bpy.data.materials.new(name); mat.diffuse_color = (*rgb, 1); mat.use_nodes = True
 mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1); return mat
floor_mat = flat('Slate pedestals', (.047, .069, .088)); text_mat = flat('Ivory captions', (.82, .77, .62))
def aim(obj, target): obj.rotation_euler = (Vector(xyz(*target)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
for row, (kind, (root, rig)) in enumerate(rigs.items()):
 for column, frame in enumerate([0, 12, 21, 42]):
  library.frame_set(frame); bpy.context.window.scene = library; bpy.context.view_layer.update()
  copies = []; location = Vector(xyz(column * 5, 0, row * -5))
  for surface in surfaces[kind]:
   obj = surface.copy(); obj.animation_data_clear(); obj.parent = None; obj.matrix_world = surface.matrix_world.copy(); gallery.collection.objects.link(obj); copies.append(obj)
  # Same ground rule used for varied runtime race heights and equipped weapons.
  bottom = min((obj.matrix_world @ vertex.co).z for obj in copies for vertex in obj.data.vertices)
  if kind != 'ice-wisp' or frame >= 29 or bottom < 0: location.z -= bottom
  for obj in copies: obj.location += location
  bpy.context.window.scene = gallery
  bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(column * 5, -.14, row * -5)); pedestal = bpy.context.object; pedestal.scale = (4.7, 4.7, .2); pedestal.data.materials.append(floor_mat)
  bpy.ops.object.text_add(location=xyz(column * 5, -.025, row * -5 + 2.16)); label = bpy.context.object
  label.data.body = kind.replace('-', ' ').title() + f'   {frame/30:.1f}s'; label.data.align_x = 'CENTER'; label.data.size = .23; label.data.materials.append(text_mat)
for at, energy, size in [((0, 19, 10), 5000, 12), ((20, 16, -7), 4200, 10), ((3, 14, -25), 4500, 12)]:
 bpy.ops.object.light_add(type='AREA', location=xyz(*at)); light = bpy.context.object; light.data.energy = energy; light.data.shape = 'DISK'; light.data.size = size; aim(light, (8, 1, -10))
bpy.ops.object.camera_add(location=xyz(22, 29, 28)); camera = bpy.context.object; camera.data.type = 'ORTHO'; camera.data.ortho_scale = 32; aim(camera, (7.5, 0, -9.8)); gallery.camera = camera
gallery.render.image_settings.file_format = 'PNG'; gallery.render.filepath = str(PREVIEW)
library.frame_set(0); bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
print('DEATH_ANIMATIONS ' + json.dumps({'clips': len(rigs), 'duration': 1.4, 'glb_bytes': EXPORT.stat().st_size, 'source': str(SOURCE)}))
if '--render' in sys.argv: bpy.ops.render.render(write_still=True)
