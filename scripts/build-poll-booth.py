"""Build Mossvale's original oak-and-leaf polling booth and validate its GLB.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-poll-booth.py -- --render
Metres; Y-up export; +Z front; floor origin. Two opaque draws, no textures.
"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from blender_mesh_utils import remove_hidden_box_faces

EXPORT = ROOT / 'public/models/poll-booth.glb'
SOURCE = ROOT / 'assets/source/poll-booth.blend'
PREVIEW = ROOT / 'assets/source/poll-booth-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library = bpy.context.scene
library.name = 'Mossvale polling booth library'
library.unit_settings.system = 'METRIC'
HEX = {
    'oak': '79543A', 'oaklight': 'B08353', 'oakdark': '493729', 'cut': 'CAA774',
    'plank': '956C46', 'forest': '31584B', 'roof': '3E715C', 'rooflight': '598369',
    'roofdark': '29493C', 'brass': 'B39451', 'gold': 'E3BE6D', 'iron': '35433C',
    'parchment': 'E7D9B7', 'paperedge': 'C9B98F', 'ink': '5A6A50',
    'stone': '818878', 'stonebright': 'A4AB94', 'stoneshade': '586C65',
    'moss': '65894B', 'leaf': '5F9750', 'leaflight': '91B05A', 'light': 'FFD597',
}
def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
COLORS = {name: tuple(linear(int(value[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
          for name, value in HEX.items()}
def xyz(x, y, z):
    return x, -z, y

parts = {name: {'vertices': [], 'faces': [], 'colors': [], 'boxes': []}
         for name in ['body', 'lantern-glow']}
current = 'body'
def geometry(tint, vertices, faces):
    data = parts[current]
    start = len(data['vertices'])
    data['vertices'].extend(xyz(*v) for v in vertices)
    data['faces'].extend(tuple(start + i for i in face) for face in faces)
    data['colors'].extend([COLORS[tint]] * len(faces))

def box(tint, x, y, z, w, h, d, rx=0, ry=0, rz=0):
    data = parts[current]
    first = len(data['faces'])
    rotation = Euler((rx, ry, rz), 'XYZ').to_matrix()
    vertices = [Vector((x, y, z)) + rotation @ Vector((a*w/2, b*h/2, c*d/2))
                for a, b, c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    geometry(tint, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
    if not (rx or ry or rz):
        points = [xyz(*v) for v in vertices]
        data['boxes'].append(([min(v[a] for v in points) for a in range(3)],
                              [max(v[a] for v in points) for a in range(3)], first))

def leaf(tint, x, y, z, size, turn=0):
    # A raised angular leaf with a central ridge, readable from the overhead game camera.
    outline = [(-.31,-.20),(-.30,.17),(0,.55),(.30,.17),(.31,-.20),(0,-.50)]
    c, s = math.cos(turn), math.sin(turn)
    vertices = [(x+(a*c-b*s)*size, y+(a*s+b*c)*size, z) for a,b in outline]
    vertices.append((x,y,z+size*.12))
    geometry(tint, vertices, [(i,(i+1)%6,6) for i in range(6)])

# Low paving and substantial square footings anchor the open-front civic kiosk.
box('stoneshade', 0, .055, 0, 2.16, .11, 1.76)
for ix in range(4):
    for iz in range(3):
        box('stonebright' if (ix+iz)%4==0 else 'stone', -.807+ix*.538, .125,
            -.577+iz*.577, .516, .14, .552)
for x in [-.83,.83]:
    for z in [-.56,.48]:
        box('stoneshade', x, .23, z, .31, .19, .32)
        box('stonebright', x, .32, z, .285, .10, .30)
        box('oakdark', x, 1.385, z, .18, 2.09, .18)
        box('oak', x-.014, 1.40, z+.018, .15, 2.10, .15)
        box('oaklight', x-.055, 1.42, z+.095, .036, 1.92, .014)
        for y in [.47,2.27]:
            box('brass', x, y, z, .192, .063, .192)
            box('gold', x, y, z+.103, .047, .040, .025)
        box('oakdark', x+.027, .99, z+.095, .014, .44, .014)
        box('oakdark', x-.018, 1.88, z+.095, .011, .31, .014)
for z in [-.56,.48]:
    box('oakdark', 0, 2.38, z, 1.88, .18, .21)
    box('oaklight', 0, 2.455, z+.01, 1.92, .044, .235)
    for side in [-1,1]:
        box('oak', side*.66, 2.205, z, .11, .49, .13, rz=-side*.66)
for side in [-1,1]:
    box('oak', side*.83, 2.39, -.04, .19, .15, 1.26)
    box('oak', side*.83, .71, -.04, .15, .12, 1.08)
    for z in [-.38,.10,.34]:
        box('forest', side*.83, .915, z, .075, .38, .15)

# Slender rear wall; the notice and all ballot props face the approach at +Z.
for i in range(8):
    box('plank' if i%3 else 'oak', -.665+i*.19, 1.24, -.565, .176, 1.88, .10)
for y in [.39,2.11]:
    box('oakdark', 0, y, -.57, 1.62, .105, .17)
box('oakdark', -.20, 1.79, -.468, 1.14, .91, .09)
box('oaklight', -.20, 1.79, -.408, 1.04, .81, .045)
box('paperedge', -.20, 1.79, -.377, .91, .69, .026)
box('parchment', -.20, 1.81, -.356, .87, .65, .016)
for x in [-.61,.21]:
    box('brass', x, 2.101, -.338, .037, .037, .022)
# A simple geometric ballot diagram, deliberately without baked-in poll text.
for row, width in [(0,.48),(1,.38),(2,.44)]:
    y=1.95-row*.155
    box('ink', -.51, y, -.340, .062, .062, .009)
    box('parchment', -.51, y, -.332, .038, .038, .010)
    box('ink', -.15, y+.011, -.341, width, .019, .008)
    box('paperedge', -.20, y-.025, -.340, width-.10, .010, .009)
box('forest', .62, 1.78, -.437, .21, .66, .055)
leaf('gold', .62, 1.85, -.397, .20, -.2)
box('brass', .62, 1.64, -.391, .11, .018, .018)

# Counter with inset forest-green writing pad, spare paper, and a sealed ballot box.
box('oakdark', 0, 1.085, .13, 1.72, .16, 1.08)
for i in range(6):
    box('oaklight' if i%3==0 else 'plank', -.712+i*.285, 1.19, .13, .271, .075, 1.12)
box('oaklight', 0, 1.135, .704, 1.79, .16, .065)
box('forest', -.45, 1.239, .22, .60, .024, .69)
for i in range(3):
    box('paperedge', -.49+i*.012, 1.259+i*.015, .26, .32, .014, .40, ry=-.12)
box('parchment', -.466, 1.308, .26, .32, .013, .40, ry=-.12)
box('ink', -.68, 1.28, .015, .105, .07, .105)
box('cut', -.68, 1.395, .015, .024, .22, .024, rz=-.18)
leaf('parchment', -.69, 1.48, .04, .18, -.3)
box('oakdark', .40, 1.433, .31, .67, .40, .59)
for i in range(4):
    box('oak' if i%2 else 'plank', .154+i*.164, 1.447, .614, .15, .363, .034)
for x in [.105,.695]:
    box('brass', x, 1.45, .633, .052, .399, .038)
    for y in [1.29,1.59]:
        box('gold', x, y, .659, .025, .025, .014)
# The slot is a real gap between lid planks, with a dark inset and a visible ballot.
for z in [.125,.495]:
    box('oaklight', .40, 1.658, z, .73, .09, .27)
for x in [.098,.702]:
    box('oaklight', x, 1.658, .31, .126, .09, .10)
box('iron', .40, 1.642, .31, .42, .018, .108)
for z in [.241,.379]:
    box('brass', .40, 1.722, z, .47, .031, .042)
for x in [.176,.624]:
    box('brass', x, 1.722, .31, .031, .031, .10)
box('parchment', .40, 1.83, .31, .22, .24, .014, rz=-.13)
box('ink', .40, 1.879, .327, .108, .019, .008, rz=-.13)
box('brass', .40, 1.477, .657, .14, .19, .042)
box('gold', .40, 1.514, .683, .067, .05, .018)
box('iron', .40, 1.449, .685, .021, .050, .016)
for side in [-1,1]:
    box('brass', .40+side*.336, 1.48, .31, .030, .11, .18)

# Layered forest-green shingles retain the stepped roof silhouette of Mossvale's villages.
for row in range(6):
    width=2.2-row*.345
    y=2.50+row*.098
    box('roofdark', 0, y, 0, width-.008, .14, 1.8)
    for side in [-1,1]:
        for i in range(7):
            z=-.764+i*.255
            box('rooflight' if (i+row)%5==0 else 'roof', side*(width/2-.087), y+.044,
                z, .174, .089, .237)
    for z in [-.908,.908]:
        box('oaklight' if z>0 else 'oak', 0, y-.025, z, width, .064, .02)
box('rooflight', 0, 3.047, 0, .31, .086, 1.812)
box('brass', 0, 3.101-.022, 0, .090, .042, 1.79)
# Hanging civic shield: an oak leaf over a sealed vote, distinct from a shop or quest notice.
box('oakdark', 0, 2.526, .92-.055, .69, .43, .05)
box('brass', 0, 2.534, .898, .61, .37, .025)
box('forest', 0, 2.542, .916, .55, .305, .016)
leaf('gold', -.11, 2.57, .937, .28, -.40)
box('parchment', .125, 2.535, .935, .13, .17, .011, rz=-.10)
box('roofdark', .137, 2.505, .946, .072, .012, .012)

# Brass-framed warm lantern; the tiny glow is the only second draw call.
box('iron', -.87, 2.165, .50, .075, .065, .42)
box('iron', -.87, 2.082, .684, .031, .18, .03)
for y in [1.70,1.97]:
    box('brass', -.87, y, .683, .26, .061, .235)
box('gold', -.87, 2.012, .683, .15, .048, .13)
for dx in [-.098,.098]:
    for dz in [-.083,.083]:
        box('brass', -.87+dx, 1.831, .683+dz, .029, .243, .027)
current='lantern-glow'
box('light', -.87, 1.831, .683, .174, .213, .145)
current='body'
for x,z,turn in [(-.93,-.65,-.3),(.92,-.63,.3),(-.94,.51,-.6),(.81,.70,.7)]:
    box('moss', x, .215, z, .21, .071, .15)
    leaf('leaf', x, .26, z+.025, .15, turn)
    leaf('leaflight', x+.075, .245, z+.04, .10, turn+.7)

root=bpy.data.objects.new('poll-booth',None)
library.collection.objects.link(root)
root['contract']='Metres; Y up; +Z front; ground origin; runtime supplies placement and interaction.'
root['solidFootprints']='[[0,0,1.96,1.5]]'
root['interactionPoint']='[0,0,1.5]'
objects=[]
for name,data in parts.items():
    remove_hidden_box_faces(data)
    mesh=bpy.data.meshes.new('poll-booth-'+name)
    mesh.from_pydata(data['vertices'],[],data['faces'])
    mesh.update()
    material=bpy.data.materials.new('Polling booth palette' if name=='body' else 'Polling lantern glow')
    material.use_nodes=True
    shader=material.node_tree.nodes['Principled BSDF']
    shader.inputs['Roughness'].default_value=.82
    tint=material.node_tree.nodes.new('ShaderNodeVertexColor')
    tint.layer_name='BoothTint'
    material.node_tree.links.new(tint.outputs['Color'],shader.inputs['Base Color'])
    if name=='lantern-glow':
        shader.inputs['Emission Color'].default_value=COLORS['light']
        shader.inputs['Emission Strength'].default_value=1.25
    mesh.materials.append(material)
    color=mesh.color_attributes.new(name='BoothTint',type='BYTE_COLOR',domain='CORNER')
    for face,value in zip(mesh.polygons,data['colors']):
        for index in face.loop_indices:
            color.data[index].color=value
    obj=bpy.data.objects.new('poll-booth-'+name,mesh)
    library.collection.objects.link(obj)
    obj.parent=root
    objects.append(obj)

# Validate geometry and the actual delivered file, including an independent GLB reimport.
vertices=[v for data in parts.values() for v in data['vertices']]
game_vertices=[(x,z,-y) for x,y,z in vertices]
bounds=[[round(min(v[a] for v in game_vertices),4),round(max(v[a] for v in game_vertices),4)] for a in range(3)]
triangles=sum(len(f)-2 for data in parts.values() for f in data['faces'])
assert bounds==[[-1.1,1.1],[0.0,3.1],[-.918,.9706]], bounds
assert triangles<6000, triangles
for path in [EXPORT.parent,SOURCE.parent]:
    path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
    export_yup=True,export_apply=True,export_animations=False,export_cameras=False,
    export_lights=False,export_extras=True)
raw=EXPORT.read_bytes()
assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,8)[0]==len(raw)
document=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
assert len(document['meshes'])==2 and len(document['materials'])==2
glow=next(material for material in document['materials'] if material['name']=='Polling lantern glow')
assert glow['emissiveFactor'][0]>glow['emissiveFactor'][2], 'Export must retain the warm lantern glow'
assert not any(document.get(key) for key in ['images','textures','animations','cameras'])
assert {node['name'] for node in document['nodes']}=={'poll-booth','poll-booth-body','poll-booth-lantern-glow'}
assert all('COLOR_0' in primitive['attributes'] for mesh in document['meshes'] for primitive in mesh['primitives'])
assert len(raw)<500_000, len(raw)
verify=bpy.data.scenes.new('Delivered GLB verification')
bpy.context.window.scene=verify
bpy.ops.import_scene.gltf(filepath=str(EXPORT))
imported=[obj for obj in verify.objects if obj.type=='MESH']
assert len(imported)==2
bpy.context.view_layer.update()
points=[obj.matrix_world@v.co for obj in imported for v in obj.data.vertices]
for axis,source_axis,sign in [(0,0,1),(1,2,1),(2,1,-1)]:
    assert abs(min(sign*v[source_axis] for v in points)-bounds[axis][0])<.0001
    assert abs(max(sign*v[source_axis] for v in points)-bounds[axis][1])<.0001
bpy.context.window.scene=library
bpy.data.scenes.remove(verify)

# Review-only staging never enters the game asset.
gallery=bpy.data.scenes.new('Polling booth - rendered review')
bpy.context.window.scene=gallery
for obj in [root,*objects]:
    gallery.collection.objects.link(obj)
def aim(obj,at):
    obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
ground=bpy.context.object
ground.name='Review ground - not exported'
mat=bpy.data.materials.new('Review forest slate')
mat.diffuse_color=(.065,.090,.076,1)
ground.data.materials.append(mat)
bpy.ops.object.camera_add(location=xyz(4.6,3.9,7.6))
camera=bpy.context.object
camera.data.type='ORTHO'
camera.data.ortho_scale=4.30
aim(camera,(0,1.48,0))
gallery.camera=camera
for at,power,size,color in [((-4,6,6),850,5,(1,.84,.64)),((4,4,3),475,4,(.80,.91,1)),((1,5,-4),1000,3,(1,.88,.68))]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at))
    light=bpy.context.object
    light.data.energy=power
    light.data.size=size
    light.data.color=color
    aim(light,(0,1.5,0))
gallery.world=bpy.data.worlds.new('Polling booth review world')
gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.19,.23,.20,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
gallery.render.engine='CYCLES'
gallery.cycles.samples=48
gallery.cycles.use_denoising=True
gallery.render.resolution_x=1200
gallery.render.resolution_y=1200
gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG'
gallery.view_settings.view_transform='AgX'
gallery.render.filepath=str(PREVIEW)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('POLL_BOOTH '+json.dumps({'bounds_xyz':bounds,'triangles':triangles,'draws':2,
    'materials':2,'glb_bytes':len(raw),'nodes':[root.name,*[obj.name for obj in objects]]}))
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
