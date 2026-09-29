"""Original tiny voxel landmarks for Mossvale's live terrain minimap.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-minimap-assets.py -- --render
Four independent meshes; metres, ground-centred origin, Y-up/+Z front after export.
One vertex-colour material, no textures. The separate gallery is never exported.
"""
import bpy
import json
import math
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/minimap-kit.glb'
SOURCE = ROOT / 'assets/source/minimap-kit.blend'
PREVIEW = ROOT / 'assets/source/minimap-kit-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
COLORS = {
    'earth': '796243', 'sand': 'DBCD8F', 'grass': '74B342', 'leaf': 'B1E443',
    'cream': 'FFE1A0', 'oak': '784529', 'roof': 'BD4C2D', 'rooflight': 'EF8843',
    'window': 'FFE863', 'dark': '273035', 'moss': '5C8F3F', 'stone': '999F82',
    'brightstone': 'CBD0AA', 'shade': '657669', 'gold': 'FFD05C', 'teal': '41A7AB',
    'canvas': 'F3CE85', 'canvaslight': 'FFE5A0', 'red': 'C14447',
    'ember': 'F54D21', 'flame': 'FFBB26', 'charcoal': '363642',
    'skull': '575368', 'skulllight': '81748A', 'horn': 'DDD1A9', 'eye': 'FF5447',
}
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
PALETTE = {key: tuple(linear(int(value[i:i+2], 16) / 255) for i in (0,2,4)) + (1,) for key,value in COLORS.items()}
def xyz(x,y,z): return (x,-z,y)
parts = {}
active = None

def prop(name):
    global active
    active = {'vertices': [], 'faces': [], 'colors': [], 'boxes': 0}
    parts[name] = active

def box(tint,x,y,z,w,h,d,turn=0):
    base = len(active['vertices']); c,s = math.cos(turn),math.sin(turn)
    for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        xx,yy,zz = a*w/2,b*h/2,f*d/2
        active['vertices'].append(xyz(x+xx*c+zz*s,y+yy,z-xx*s+zz*c))
    for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
        active['faces'].append(tuple(base+n for n in face))
        active['colors'].append(PALETTE[tint])
    active['boxes'] += 1

def cottage(x,z):
    box('cream',x,1.30,z,1.9,1.8,1.65)
    box('oak',x,0.48,z,2,.18,1.75)
    for i in range(4):
        box('rooflight' if i%2 else 'roof',x,2.2+i*.22,z,2.2-i*.5,.26,1.95)
    box('oak',x,1.02,z+.84,.45,1.02,.08)
    for dx in [-.61,.61]: box('window',x+dx,1.53,z+.86,.37,.42,.08)
    box('brightstone',x+.60,2.8,z-.31,.32,.86,.32)

prop('map-village')
box('earth',0,.14,0,5,.28,4.9)
box('grass',0,.32,0,4.8,.12,4.7)
box('sand',0,.40,1.55,4.65,.08,.72)
cottage(-1.28,.50)
cottage(1.25,.50)
box('shade',0,.63,-1.33,1.40,.50,1.50)
box('cream',0,2.3,-1.33,1.12,3.30,1.12)
for side in [-1,1]:
    box('oak',side*.49,4.12,-1.33,.14,1.18,1.02)
box('gold',0,4.0,-1.33,.50,.59,.51)
for i in range(3): box('rooflight' if i%2 else 'roof',0,4.63+i*.27,-1.33,1.7-i*.50,.3,1.7-i*.50)
box('gold',0,5.47,-1.33,.15,.45,.15)
for x,z in [(-2, -1.75),(2,-1.75)]:
    box('moss',x,.67,z,.57,.6,.62)
    box('leaf',x,.97,z,.43,.27,.47)

prop('map-ruin')
for w,d,y,h,col in [(5,4.7,.2,.4,'shade'),(4.3,4.0,.62,.44,'stone'),(3.5,3.3,1.04,.4,'brightstone')]:
    box(col,0,y,0,w,h,d)
for x in [-1.12,1.12]:
    for row in range(3): box('stone' if row%2 else 'brightstone',x,1.74+row*.82,-.43,.90,.79,.94)
    box('shade',x,4.02,-.43,1.17,.28,1.21)
box('stone',0,4.36,-.43,3.43,.4,1.35)
box('brightstone',0,4.77,-.43,2.65,.42,1.14)
box('moss',0,5.08,-.43,1.55,.2,1.13)
box('gold',0,4.77,.16,.39,.41,.12)
for x,y,z,w,d in [(-1.3,1.27,.98,.72,.55),(-1.15,2.23,.10,.70,.11),(1.12,3.52,.11,.69,.11),(1.12,2.87,.1,.3,.1),(.75,4.6,-.44,.69,1.05)]:
    box('moss',x,y,z,w,.24,d)
box('teal',0,1.54,.35,.78,.60,.72)
for x,z in [(-2.1,1.66),(1.99,1.7)]: box('moss',x,.64,z,.53,.47,.50)

prop('map-camp')
box('earth',0,.13,0,5,.26,4.6)
box('sand',0,.30,0,4.7,.08,4.3)
# Solid stepped canvas keeps the tent legible even at minimap scale.
for i in range(7):
    box('canvaslight' if i%2 else 'canvas',-.70,.6+i*.40,-.60,2.9-i*.39,.42,2.6)
box('dark',-.70,1.12,.72,1.17,1.53,.05)
box('oak',-.70,2.17,.77,.15,2.08,.13)
box('oak',-.70,3.27,-.6,.15,.28,3.0)
box('oak',1.80,2.81,-1.32,.16,4.94,.16)
box('red',1.32,4.7,-1.30,.91,.79,.10)
box('gold',1.8,5.33,-1.32,.23,.22,.23)
for turn in [-.55,.55]: box('oak',1.23,.54,1.09,1.06,.31,.23,turn)
box('ember',1.23,.77,1.09,.66,.58,.60)
box('flame',1.20,1.1,1.1,.37,.75,.37)
box('gold',1.31,1.51,1.06,.19,.36,.21)
for x,z in [(.51,1.08),(1.21,1.81),(1.94,1.09),(1.23,.36)]: box('stone',x,.48,z,.4,.27,.40)
box('grass',-1.90,.48,1.60,.62,.30,.49)

prop('map-boss')
for w,d,y,h,col in [(5,4.6,.25,.5,'shade'),(4.2,3.8,.69,.38,'charcoal'),(3.30,3,1.10,.46,'skull')]: box(col,0,y,0,w,h,d)
box('charcoal',0,1.79,-.30,2.76,.99,1.60)
box('skull',0,3.05,-.24,2.98,2.05,1.88)
box('skulllight',0,4.12,-.24,2.46,.30,1.64)
for side in [-1,1]:
    box('charcoal',side*.77,3.19,.75,.91,.70,.14)
    box('eye',side*.77,3.17,.84,.46,.29,.12)
    box('skulllight',side*.82,3.74,.78,1.07,.25,.18)
    box('skulllight',side*1.46,2.72,.36,.38,.83,.87)
    for x,y,w,h in [(1.51,4.07,.74,.66),(1.86,4.67,.64,.58),(2.02,5.25,.47,.61),(1.92,5.80,.30,.56)]:
        box('horn' if y>4.1 else 'skulllight',side*x,y,-.26,w,h,.63 if y<5 else .42)
box('charcoal',0,2.78,.77,.43,.55,.11)
box('skulllight',0,2.10,.21,2.14,.48,1.30)
for x in [-.67,0,.67]: box('horn',x,2.25,.90,.36,.42,.25)

library = bpy.context.scene
library.name = 'Minimap landmark library'
library.unit_settings.system = 'METRIC'
library.unit_settings.scale_length = 1
material = bpy.data.materials.new('Mossvale minimap vertex palette')
material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .9
colour = material.node_tree.nodes.new('ShaderNodeVertexColor')
colour.layer_name = 'MapTint'
material.node_tree.links.new(colour.outputs['Color'],shader.inputs['Base Color'])
objects = []
for name,data in parts.items():
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(data['vertices'],[],data['faces'])
    mesh.materials.append(material)
    tint = mesh.color_attributes.new(name='MapTint',type='BYTE_COLOR',domain='CORNER')
    for face,color in zip(mesh.polygons,data['colors']):
        for index in face.loop_indices: tint.data[index].color = color
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    library.collection.objects.link(obj)
    objects.append(obj)
library['contract'] = 'map-village / map-ruin / map-camp / map-boss. Each one mesh, ground centre, metres, Y-up +Z front. No textures. Original voxel miniatures.'
for directory in [EXPORT.parent,SOURCE.parent]: directory.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=False)
# Match the existing village pipeline: keep POSITION floats and all pivots exact.
cli = ['npx','--yes','@gltf-transform/cli@4.5.0']
with tempfile.TemporaryDirectory(prefix='mossvale-minimap-') as temporary:
    welded = str(Path(temporary)/'weld.glb')
    quantized = str(Path(temporary)/'quantize.glb')
    for command in [['weld',str(EXPORT),welded],['quantize',welded,quantized,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['prune',quantized,str(EXPORT)]]:
        subprocess.run(cli+command,check=True)
# Attribute-only quantization requires this declaration although positions stay float.
raw = EXPORT.read_bytes(); json_length = struct.unpack_from('<I',raw,12)[0]
document = json.loads(raw[20:20+json_length])
for field in ['extensionsUsed','extensionsRequired']:
    document[field] = sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
encoded = json.dumps(document,separators=(',',':')).encode(); encoded += b' ' * (-len(encoded)%4)
tail = raw[20+json_length:]
EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
assert len(document['meshes']) == 4 and len(document['materials']) == 1
assert not document.get('images')
assert EXPORT.stat().st_size < 100_000
assert sum(data['boxes'] for data in parts.values()) * 12 < 4000

# Separate, labelled review scene; never included in the GLB.
gallery = bpy.data.scenes.new('Minimap landmark gallery')
bpy.context.window.scene = gallery
for original,x in zip(objects,[-9,-3,3,9]):
    obj = original.copy(); obj.data = original.data
    gallery.collection.objects.link(obj); obj.location = xyz(x,0,0)
    bpy.ops.object.text_add(location=xyz(x,0.015,3.16))
    label = bpy.context.object; label.name = original.name+' preview label'
    label.data.body = original.name.replace('map-','').upper()
    label.data.align_x = 'CENTER'; label.data.size = .44
    # Text lies flat on the gallery plane, facing +Z in Blender.
    label.data.extrude = .004
    text_material = bpy.data.materials.get('Preview label') or bpy.data.materials.new('Preview label')
    text_material.diffuse_color = (.70,.85,.90,1); label.data.materials.append(text_material)
bpy.ops.mesh.primitive_plane_add(size=200,location=xyz(0,-.04,0))
floor = bpy.context.object; floor.name = 'Gallery floor - not exported'
floor_mat = bpy.data.materials.new('Gallery floor'); floor_mat.diffuse_color=(.035,.075,.095,1); floor.data.materials.append(floor_mat)
def aim(obj,at): obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(15,21,34))
camera = bpy.context.object; camera.data.type='ORTHO'; camera.data.ortho_scale=29
# Align the row in the gallery while retaining a visible side and roof.
aim(camera,(0,1.65,0)); gallery.camera=camera
for at,power,size in [((-5,16,10),2900,10),((10,12,-8),2200,8)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at))
    light=bpy.context.object; light.data.energy=power; light.data.shape='DISK'; light.data.size=size; aim(light,(0,1.5,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-8,15,10))
sun=bpy.context.object; sun.data.energy=1.6; sun.data.angle=.16; aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('Minimap gallery world'); gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.13,.19,.24,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
gallery.render.engine='CYCLES'; gallery.cycles.samples=24; gallery.cycles.use_denoising=True
gallery.render.resolution_x=1600; gallery.render.resolution_y=760; gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG'; gallery.render.filepath=str(PREVIEW)
gallery.view_settings.view_transform='Standard'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
report={'glb_bytes':EXPORT.stat().st_size,'meshes':{}}
for name,data in parts.items():
    vertices=[(v[0],v[2],-v[1]) for v in data['vertices']]
    report['meshes'][name]={'triangles':data['boxes']*12,'min':[round(min(v[i] for v in vertices),3) for i in range(3)],'max':[round(max(v[i] for v in vertices),3) for i in range(3)]}
print('MINIMAP_KIT '+json.dumps(report))
if '--render' in sys.argv: bpy.ops.render.render(write_still=True)
