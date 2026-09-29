"""Author Mossvale's woodland training dummy and its springy hit reaction.

blender --background --python scripts/build-training-dummy.py -- --render
Metres; Y-up, +Z front, ground origin. Five rigid meshes, one vertex palette.
The exported GLB is reimported and checked before the editable source is saved.
"""
import bpy
import json
import math
import random
import struct
import sys
from pathlib import Path
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/training-dummy.glb'
SOURCE = ROOT / 'assets/source/training-dummy.blend'
PREVIEW = ROOT / 'assets/source/training-dummy-preview.png'
HIT_PREVIEW = ROOT / 'assets/source/training-dummy-hit-preview.png'
CLIP = 'training-dummy-hit'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(37)
HEX = {
    'oak': '79543A', 'oaklight': 'B08353', 'oakdark': '4B3C30', 'cut': 'C5A06D',
    'burlap': 'B69768', 'clothlight': 'D0B58A', 'clothdark': '8C7050',
    'straw': 'D6BD6B', 'strawlight': 'E6CF8D', 'strawdark': 'A58C4C',
    'rope': 'D6C295', 'leather': '695445', 'cream': 'E7DFC0',
    'teal': '397B79', 'teallight': '5A9690', 'tealdark': '2E5C62',
    'iron': '384A4A', 'steel': '879FA8', 'brass': 'C59D51',
    'stone': '818878', 'stonebright': 'A4AB94', 'stoneshade': '586C65',
    'moss': '65894B', 'leaf': '5F9750', 'leaflight': '91B05A',
}
def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
COLORS = {key: tuple(linear(int(value[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
          for key, value in HEX.items()}
def xyz(x, y, z):
    return (x, -z, y)

parts = {}
current = ''
def part(name, pivot, parent=None):
    global current
    current = name
    parts[name] = {'pivot': Vector(pivot), 'parent': parent, 'vertices': [], 'faces': [], 'colors': []}

def geometry(tint, vertices, faces):
    data = parts[current]
    offset = len(data['vertices'])
    data['vertices'].extend(xyz(*(Vector(v) - data['pivot'])) for v in vertices)
    for face in faces:
        data['faces'].append(tuple(offset + i for i in face))
        data['colors'].append(COLORS[tint])

def box(tint, x, y, z, w, h, d, rx=0, ry=0, rz=0):
    rotation = Euler((rx, ry, rz), 'XYZ').to_matrix()
    vertices = [Vector((x, y, z)) + rotation @ Vector((a*w/2, b*h/2, c*d/2))
                for a, b, c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    geometry(tint, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])

def slab(tint, x, y, z, w, h, d, bevel):
    # Eight-sided bags and stones preserve the game's chunky handcrafted silhouette.
    outline = [(-w/2+bevel,-h/2),(w/2-bevel,-h/2),(w/2,-h/2+bevel),
               (w/2,h/2-bevel),(w/2-bevel,h/2),(-w/2+bevel,h/2),
               (-w/2,h/2-bevel),(-w/2,-h/2+bevel)]
    vertices = [(x+a,y+b,z+c*d/2) for c in [-1,1] for a,b in outline]
    faces = [tuple(range(7,-1,-1)), tuple(range(8,16))]
    faces.extend((i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8))
    geometry(tint, vertices, faces)

def ring(tint, x, y, z, radius, inner, depth, steps=16):
    vertices = [(x+math.sin(a*math.tau/steps)*r, y+math.cos(a*math.tau/steps)*r, z+side*depth/2)
                for side in [-1,1] for r in [radius,inner] for a in range(steps)]
    faces = []
    for i in range(steps):
        j = (i+1) % steps
        faces.extend([(i,j,steps+j,steps+i),(2*steps+i,3*steps+i,3*steps+j,2*steps+j),
                      (i,2*steps+i,2*steps+j,j),(steps+i,steps+j,3*steps+j,3*steps+i)])
    geometry(tint, vertices, faces)

def leaf(x, y, z, turn=0, size=.12):
    box('leaf', x, y, z, size, size*.4, size*.65, rz=turn, ry=.3)
    box('leaflight', x+.012, y+.018, z+.015, size*.65, size*.20, size*.43, rz=turn, ry=.3)

part('base', (0, 0, 0))
# Broad, low stone footing, inset timber feet and visible iron mounting hardware.
box('stoneshade', 0, .055, 0, 1.48, .11, 1.16)
for row in [-1,1]:
    for column in [-1,0,1]:
        box('stonebright' if column == row else 'stone', column*.48, .13, row*.29,
            .455, .15+(column == 0)*.018, .55, ry=(column+row)*.018)
box('oakdark', 0, .24, 0, 1.17, .20, .29)
box('oak', 0, .29, 0, .31, .22, .98)
box('oak', 0, .82, -.035, .30, 1.05, .29)
box('oaklight', -.109, .82, .119, .046, .98, .014)
for x, y, length in [(.04,.64,.52),(-.05,.78,.71),(.10,1.03,.36)]:
    box('oakdark', x, y, .117, .017, length, .014)
for side in [-1,1]:
    box('oaklight', side*.23, .56, -.02, .16, .68, .18, rz=side*.58)
    box('iron', side*.43, .345, 0, .12, .035, .30)
    box('brass', side*.43, .367, .095, .053, .033, .052)
    box('iron', 0, .406, side*.38, .315, .035, .12)
    box('brass', .092, .427, side*.38, .051, .033, .051)
    box('iron', side*.09, 1.25, .122, .064, .13, .043)
    for i in range(3):
        leaf(side*(.44+i*.12), .217+(i%2)*.017, -.40+i*.025, side*.22)
# Rope-bound wooden spring collar: the torso recoils above this anchored support.
for y in [1.12,1.165,1.21,1.255]:
    box('rope', 0, y, -.035, .335, .031, .323)
box('iron', 0, 1.305, -.035, .37, .075, .35)
for x,z in [(-.56,.43),(.56,-.43),(.43,-.43),(-.60,.26)]:
    box('moss', x, .214, z, .19, .045, .14)
    leaf(x, .257, z, .25)

part('body', (0,1.30,0))
box('oakdark', 0, 1.73, -.07, .28, .88, .28)
box('oak', 0, 2.12, -.045, 1.68, .20, .24)
box('oaklight', 0, 2.225, -.04, 1.60, .035, .205)
for side in [-1,1]:
    box('cut', side*.851, 2.12, -.045, .027, .18, .21)
    for d in [.12,.055]:
        box('oakdark', side*.868, 2.12, -.045, .008, d, .016)
        box('oakdark', side*.868, 2.12, -.045, .008, .016, d)
slab('clothdark', 0, 1.80, .015, .92, 1.03, .59, .14)
slab('burlap', 0, 1.84, .075, .87, .93, .55, .13)
slab('clothlight', 0, 2.215, .09, .73, .12, .49, .045)
# Chunky seams, protruding stuffing, hand repairs and the woven sack side panels.
for side in [-1,1]:
    for n in range(13):
        y = 1.42+n*.059
        box('rope', side*.418, y, .191, .039, .019, .31, rz=side*.07)
    for n in range(7):
        box('clothdark', side*.451, 1.48+n*.107, .02, .015, .014, .40)
    for n in range(6):
        z=-.17+n*.072
        box('clothlight', side*.452, 1.79, z, .013, .61, .011)
    for n in range(9):
        x=side*(.24+n*.023)
        box('strawlight' if n%3 else 'strawdark', x, 1.307-random.random()*.09, .05+random.uniform(-.18,.18),
            .024, .17+random.random()*.10, .025, rz=side*random.uniform(.1,.65))
    for n in range(6):
        box('straw', side*(.51+n*.018), 2.14+random.uniform(-.08,.08), .035,
            .25, .025, .025, rz=side*random.uniform(-.4,.4))
box('leather', 0, 1.45, -.001, .95, .11, .64)
box('brass', .27, 1.45, .338, .13, .14, .035)
box('leather', .27, 1.45, .361, .063, .080, .018)
box('clothdark', -.265, 1.64, .361, .23, .25, .026, rz=-.08)
for i in range(4):
    box('rope', -.354+i*.053, 1.523, .38, .018, .051, .012, rz=.2)
    box('rope', -.354+i*.053, 1.750, .38, .018, .051, .012, rz=.2)
# Raised sixteen-sided target: the broad teal/ivory rings remain legible at game distance.
ring('oakdark', 0, 1.90, .363, .475, .01, .082)
ring('oaklight', 0, 1.90, .411, .458, .410, .025)
ring('tealdark', 0, 1.90, .429, .410, .360, .032)
ring('cream', 0, 1.90, .447, .360, .271, .027)
ring('teal', 0, 1.90, .463, .271, .184, .026)
ring('cream', 0, 1.90, .478, .184, .095, .022)
ring('teal', 0, 1.90, .489, .095, .001, .026)
for a in [math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4]:
    box('brass', math.sin(a)*.432, 1.90+math.cos(a)*.432, .437, .038, .038, .025)
box('teallight', -.022, 1.916, .505, .058, .052, .006)
for x,y,w,angle in [(-.31,1.98,.084,.35),(.21,1.64,.071,-.55),(.29,2.03,.075,.2)]:
    box('oakdark', x, y, .485 if x>0 else .466, w, .012, .014, rz=angle)
# A small ivy sprig grows around the rear frame without obscuring the target.
for n in range(6):
    x=.29+math.sin(n*1.3)*.052
    box('moss', x, 1.52+n*.11, -.302, .022, .13, .028, rz=math.cos(n)*.26)
    leaf(x+(-1 if n%2 else 1)*.06, 1.58+n*.11, -.32, (-1 if n%2 else 1)*.48)

part('head', (0,2.34,0), 'body')
box('oak', 0, 2.385, -.045, .20, .21, .20)
for y in [2.34,2.38,2.42]:
    box('rope', 0, y, -.045, .253, .026, .254)
slab('clothdark', 0, 2.68, .015, .63, .58, .49, .085)
slab('burlap', 0, 2.69, .034, .60, .54, .49, .083)
slab('clothlight', 0, 2.925, .02, .48, .065, .43, .026)
for side in [-1,1]:
    # Clearly sewn X eyes, rather than a living NPC's face.
    for angle in [-.72,.72]:
        box('oakdark', side*.146, 2.736, .289, .119, .029, .024, rz=angle)
    for n in range(6):
        box('rope', side*.302, 2.49+n*.067, .103, .023, .020, .22)
    for n in range(5):
        box('straw' if n%2 else 'strawlight', side*(.28+n*.018), 2.54+n*.022, -.035,
            .20, .023, .025, rz=side*(.1+n*.17))
box('clothdark', 0, 2.62, .292, .06, .10, .035)
box('oakdark', 0, 2.55, .287, .23, .023, .015)
for x in [-.09,-.03,.03,.09]:
    box('rope', x, 2.55, .304, .016, .064, .013, rz=.1)
# Teal tied kerchief and a little oak/ivy crown make the dummy unmistakably Mossvale.
box('tealdark', 0, 2.43, .007, .46, .096, .42)
box('teal', 0, 2.456, .212, .47, .059, .043)
box('teallight', -.22, 2.42, .235, .105, .105, .10, rz=.38)
box('teal', -.24, 2.34, .225, .09, .19, .049, rz=-.24)
box('tealdark', -.32, 2.36, .215, .08, .16, .043, rz=.25)
for n in range(5):
    box('strawlight', -.14+n*.061, 2.984+(n%2)*.021, -.045, .026, .095, .032, rz=(n-2)*.20)
leaf(.18, 2.991, -.02, -.25, .16)
leaf(.26, 2.968, .06, -.42, .14)

for side,label in [(-1,'left-arm'),(1,'right-arm')]:
    part(label, (side*.57,2.13,0), 'body')
    slab('clothdark', side*.75, 2.09, .03, .40, .33, .39, .064)
    slab('burlap', side*.77, 2.11, .047, .35, .30, .37, .049)
    for n in range(4):
        box('rope', side*(.635+n*.04), 2.11, .047, .026, .329, .405)
    box('leather', side*.89, 2.10, .048, .059, .34, .415)
    box('brass', side*.89, 2.11, .270, .063, .064, .031)
    for n in range(6):
        box('strawlight' if n%2 else 'straw', side*.941, 2.05+(n%3)*.046, -.055+(n//3)*.13,
            .105, .024, .027, rz=side*(n-2)*.13)

library = bpy.context.scene
library.name = 'Training dummy library'
library.unit_settings.system = 'METRIC'
library.render.fps = 30
library.frame_start = 0
library.frame_end = 27
material = bpy.data.materials.new('Mossvale dummy vertex palette')
material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .85
colour = material.node_tree.nodes.new('ShaderNodeVertexColor')
colour.layer_name = 'DummyTint'
material.node_tree.links.new(colour.outputs['Color'], shader.inputs['Base Color'])
root = bpy.data.objects.new('training-dummy', None)
library.collection.objects.link(root)
root['runtime_axes'] = 'metres, Y up, +Z front, ground centre'
root['hit_clip'] = CLIP
root['hit_duration'] = .90
objects = {}
for name,data in parts.items():
    mesh = bpy.data.meshes.new('training-dummy-'+name)
    mesh.from_pydata(data['vertices'], [], data['faces'])
    mesh.update()
    mesh.materials.append(material)
    tint = mesh.color_attributes.new(name='DummyTint', type='BYTE_COLOR', domain='CORNER')
    for face,color in zip(mesh.polygons,data['colors']):
        for index in face.loop_indices:
            tint.data[index].color = color
    obj = bpy.data.objects.new('training-dummy-'+name, mesh)
    library.collection.objects.link(obj)
    obj.parent = objects[data['parent']] if data['parent'] else root
    parent_pivot = parts[data['parent']]['pivot'] if data['parent'] else Vector((0,0,0))
    obj.location = xyz(*(data['pivot']-parent_pivot))
    obj['part'] = name
    objects[name] = obj

# Fast impact, overshoot, two smaller rebounds, then an exact rest pose.
poses = [(0,0),(2,1),(5,.65),(9,-.44),(13,.25),(17,-.13),(22,.05),(27,0)]
rotations = {'body':(-.22,.09,-.045), 'head':(-.24,-.11,.105),
             'left-arm':(.12,.20,-.21), 'right-arm':(-.11,-.23,.25)}
basis = Euler((math.pi/2,0,0)).to_matrix()
for label,rotation in rotations.items():
    obj = objects[label]
    base = obj.location.copy()
    for frame,weight in poses:
        game_rotation = Euler(tuple(v*weight for v in rotation),'XYZ').to_matrix()
        obj.rotation_euler = (basis@game_rotation@basis.transposed()).to_euler('XYZ',obj.rotation_euler)
        obj.location = base + Vector(xyz(0,-.026*abs(weight),-.025*weight)) if label=='body' else base
        obj.keyframe_insert(data_path='rotation_euler',frame=frame)
        obj.keyframe_insert(data_path='location',frame=frame)
    action = obj.animation_data.action
    action.name = CLIP+'-'+label
    for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
        for key in curve.keyframe_points:
            key.interpolation = 'BEZIER'
            key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'
    track = obj.animation_data.nla_tracks.new()
    track.name = CLIP
    strip = track.strips.new(CLIP,0,action)
    strip.extrapolation = 'NOTHING'
    obj.animation_data.action = None
    obj.location = base
    obj.rotation_euler = (0,0,0)

library.frame_set(0)
bpy.context.view_layer.update()
rest = {name:obj.matrix_world.copy() for name,obj in objects.items()}
library.frame_set(2)
bpy.context.view_layer.update()
assert (objects['head'].matrix_world.translation-rest['head'].translation).length > .15
library.frame_set(27)
bpy.context.view_layer.update()
assert all(max(abs(a-b) for ra,rb in zip(obj.matrix_world,rest[name]) for a,b in zip(ra,rb)) < 1e-6
           for name,obj in objects.items()), 'Hit must return exactly to rest'
library.frame_set(0)
bpy.context.view_layer.update()
vertices = [obj.matrix_world@v.co for obj in objects.values() for v in obj.data.vertices]
bounds = [[round(min(v[i] for v in vertices),4),round(max(v[i] for v in vertices),4)] for i in range(3)]
assert bounds[2][0] >= -1e-6 and bounds[2][1] < 3.1
assert bounds[0][1]-bounds[0][0] < 2.0
for path in [EXPORT.parent,SOURCE.parent]:
    path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
    export_yup=True,export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',
    export_merge_animation='NLA_TRACK',export_force_sampling=True,export_cameras=False,export_lights=False)
raw = EXPORT.read_bytes()
length = struct.unpack_from('<I',raw,12)[0]
document = json.loads(raw[20:20+length])
assert [animation['name'] for animation in document['animations']] == [CLIP]
assert len(document['meshes']) == 5 and len(document['materials']) == 1

# Verify the delivered file, including its animation, through Blender's importer.
verify = bpy.data.scenes.new('GLB reimport verification')
bpy.context.window.scene = verify
bpy.ops.import_scene.gltf(filepath=str(EXPORT))
assert len([obj for obj in verify.objects if obj.type=='MESH']) == 5
assert any(obj.animation_data for obj in verify.objects), 'Exported hit clip was lost'
bpy.context.window.scene = library
bpy.data.scenes.remove(verify)

# An isolated review scene keeps all lights, floor and camera out of the export.
gallery = bpy.data.scenes.new('Training dummy - rendered review')
bpy.context.window.scene = gallery
for obj in [root,*objects.values()]:
    gallery.collection.objects.link(obj)
gallery.render.fps = 30
gallery.frame_start = 0
gallery.frame_end = 27
gallery.frame_set(0)
def aim(obj, at):
    obj.rotation_euler = (Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
floor = bpy.context.object
floor.name = 'Review ground - not exported'
floor_mat = bpy.data.materials.new('Review forest slate')
floor_mat.diffuse_color = (.09,.125,.115,1)
floor.data.materials.append(floor_mat)
bpy.ops.object.camera_add(location=xyz(4.2,3.6,7.8))
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4.3
aim(camera,(0,1.49,0))
gallery.camera = camera
for at,power,size in [((-4,7,5),950,5),((4,4,3),600,4),((2,6,-4),1100,3)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at))
    light = bpy.context.object
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = size
    aim(light,(0,1.5,0))
gallery.world = bpy.data.worlds.new('Training dummy review world')
gallery.world.use_nodes = True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.19,.23,.22,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .65
gallery.render.engine = 'CYCLES'
gallery.cycles.samples = 48
gallery.cycles.use_denoising = True
gallery.render.resolution_x = 1200
gallery.render.resolution_y = 1400
gallery.render.resolution_percentage = 100
gallery.render.image_settings.file_format = 'PNG'
gallery.view_settings.view_transform = 'AgX'
gallery.render.filepath = str(PREVIEW)
gallery['evidence'] = 'Actual exported mesh hierarchy and authored NLA animation; rest and impact frames.'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
triangles = sum(len(face)-2 for data in parts.values() for face in data['faces'])
print('TRAINING_DUMMY '+json.dumps({'triangles':triangles,'draws':5,'materials':1,
    'glb_bytes':EXPORT.stat().st_size,'blender_bounds_xyz':bounds,'animation':CLIP,'duration':.9}))
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
    gallery.frame_set(2)
    gallery.render.filepath = str(HIT_PREVIEW)
    bpy.ops.render.render(write_still=True)
    gallery.frame_set(0)
    gallery.render.filepath = str(PREVIEW)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
