"""Build Hearthling, a cottage companion inspired by the supplied references.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-hearthling-pet.py -- --render
Standalone art asset; no pet catalogue, drop tables or NFT IDs are changed.
"""
import ast
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/hearthling.blend'
EXPORT = ROOT / 'public/models/hearthling.glb'
PREVIEW = ROOT / 'assets/source/hearthling-preview.png'
ICONS = ROOT / 'public/ui/pets'
TAU = math.tau
PETS = {}
active_pet = active_part = ''

# Reuse the original pet geometry and lighting without executing its asset builds.
helpers = {'linear', 'xyz', 'pet', 'part', 'shape', 'ball', 'tube', 'leaf',
           'plain_material', 'aim', 'fit_portrait', 'render_setup', 'clone_tree'}
tree = ast.parse((ROOT / 'scripts/build-pet-assets.py').read_text())
definitions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in helpers]
assert {node.name for node in definitions} == helpers
exec(compile(ast.Module(body=definitions, type_ignores=[]), 'build-pet-assets.py', 'exec'))
PALETTE = {
    'ink': '182724', 'rim': '23352F', 'cream': 'F3E6C7', 'shade': 'D7CAA9',
    'white': 'FFF8E5', 'moss': '507849', 'fern': '739553', 'leaf': '98B56C',
    'pine': '294E3C', 'teal': '477465', 'check': '92A689', 'darkcheck': '345848',
    'bark': '654B33', 'wood': '927348', 'sole': '3C3C2A', 'boot': '86734B',
    'gold': 'D4AF63', 'amber': 'F2CB79', 'rose': 'DCA797', 'clay': 'ADA489',
}
COLORS = {key: tuple(linear(int(value[i:i+2], 16)/255) for i in (0, 2, 4))+(1,)
          for key, value in PALETTE.items()}
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def box(tint, center, size, angle=0, metal=False):
    vertices = []
    for x, y, z in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                    (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)):
        x, y, z = x*size[0]/2, y*size[1]/2, z*size[2]/2
        vertices.append((center[0]+x*math.cos(angle)-y*math.sin(angle),
                         center[1]+x*math.sin(angle)+y*math.cos(angle), center[2]+z))
    shape(tint, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)], metal)

def prism(tint, outline, back, front):
    n = len(outline)
    vertices = [(x,y,z) for z in (back,front) for x,y in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    shape(tint, vertices, faces)

def octagon(cx, cy, w, h, cut):
    return [(cx+x,cy+y) for x,y in [(-w/2+cut,-h/2),(w/2-cut,-h/2),
            (w/2,-h/2+cut),(w/2,h/2-cut),(w/2-cut,h/2),(-w/2+cut,h/2),
            (-w/2,h/2-cut),(-w/2,-h/2+cut)]]

def frame(cx):
    outer = octagon(cx,.697,.283,.220,.034)
    inner = octagon(cx,.697,.225,.160,.021)
    vertices = [(x,y,z) for z in (.250,.279) for loop in (outer,inner) for x,y in loop]
    faces = []
    for i in range(8):
        j = (i+1)%8
        faces += [(i,j,j+16,i+16),(i+8,i+24,j+24,j+8),
                  (i+16,j+16,j+24,i+24),(i,i+8,j+8,j)]
    shape('ink',vertices,faces)
    # A small brass hinge makes the silhouette feel hand crafted.
    box('gold',(cx+(-.112 if cx<0 else .112),.754,.282),(.018,.010,.006),metal=True)

pet('hearthling', 'HEARTHLING')
part('body', (0,.32,0))
ball('pine',(0,.332,0),(.177,.183,.130))
# Tailored flat front keeps the checked cloth readable at pet scale.
box('teal',(0,.339,.116),(.267,.230,.032))
for x in (-.100,-.050,0,.050,.100):
    box('check',(x,.342,.135),(.011,.216,.004))
for y in (.251,.296,.341,.386,.431):
    box('darkcheck',(0,y,.138),(.263,.012,.004))
    box('check',(0,y+.007,.141),(.263,.003,.004))
box('pine',(0,.222,.109),(.276,.027,.051))
box('teal',(0,.337,-.122),(.267,.227,.032))
for x in (-.100,-.050,0,.050,.100):
    box('check',(x,.337,-.140),(.009,.214,.004))
for y in (.251,.296,.341,.386,.431):
    box('darkcheck',(0,y,-.143),(.263,.012,.004))
for x in (-.023,.023):
    leaf('cream',(x,.462,.111),(x*2.5,.407,.152),.075,.012)
box('bark',(0,.324,.147),(.020,.170,.008))
for y in (.273,.327,.380):
    box('gold',(0,y,.154),(.013,.013,.007),metal=True)
# A little leaf clasp and a simple satchel at the back.
leaf('gold',(.083,.416,.147),(.105,.446,.146),.025,.006,True)
box('bark',(.120,.342,-.139),(.140,.148,.052))
box('wood',(.120,.397,-.167),(.151,.055,.016))
box('gold',(.120,.373,-.179),(.024,.030,.008),metal=True)
box('wood',(.120,.433,-.140),(.070,.012,.041))

for side,label in ((-1,'left'),(1,'right')):
    part('arm-'+label,(side*.153,.428,0),'body')
    ball('teal',(side*.190,.344,.010),(.064,.105,.074))
    for y in (.294,.334,.374):
        box('check',(side*.201,y,.072),(.063,.009,.008))
    box('darkcheck',(side*.204,.337,.078),(.012,.119,.006))
    ball('pine',(side*.213,.278,.037),(.057,.025,.061))
    ball('cream',(side*.213,.249,.056),(.052,.044,.052))
    box('shade',(side*.230,.235,.094),(.029,.024,.012))
    part('leg-front-'+label,(side*.087,.235,0),'body')
    box('pine',(side*.087,.161,.004),(.114,.135,.133))
    box('check',(side*.087,.111,.006),(.128,.037,.142))
    ball('boot',(side*.087,.063,.041),(.074,.063,.114))
    box('sole',(side*.087,.011,.040),(.143,.022,.205))
    box('wood',(side*.087,.063,.136),(.120,.019,.014))
    box('gold',(side*.087,.099,.110),(.035,.023,.009),metal=True)
    box('bark',(side*.087,.099,.116),(.019,.010,.006))

part('head',(0,.484,0),'body')
# Broad stepped cheeks; the top continues into an actual cottage gable.
prism('cream',[(-.237,.492),(.237,.492),(.288,.540),(.302,.604),
               (.302,.803),(0,1.016),(-.302,.803),(-.302,.604),(-.288,.540)],-.203,.216)
box('shade',(0,.491,-.005),(.410,.018,.349))
for side in (-1,1):
    box('shade',(side*.290,.571,-.010),(.018,.066,.331))
    prism('white',octagon(side*.150,.696,.170,.166,.036),.216,.228)
    prism('ink',octagon(side*.142,.694,.074,.133,.021),.229,.247)
    box('white',(side*.142-.014,.733,.250),(.018,.023,.005))
    box('rose',(side*.225,.570,.219),(.050,.020,.005))
    frame(side*.151)
    # Temples run around the sides of the house, as in both references.
    box('ink',(side*.307,.732,.021),(.026,.030,.471))
    box('gold',(side*.322,.733,.172),(.006,.020,.028),metal=True)
box('ink',(0,.733,.267),(.052,.025,.028))
prism('moss',octagon(0,.570,.051,.034,.009),.216,.248)
box('bark',(0,.534,.222),(.042,.006,.005))

# Timber underside, overlapping moss-green shingles, and a stout open chimney.
slope = math.atan2(.227,.348)
for side in (-1,1):
    box('bark',(side*.173,.913,.001),(.444,.047,.525),-side*slope)
    box('pine',(side*.182,.936,.001),(.455,.046,.554),-side*slope)
    for row in range(5):
        x = .036+row*.071
        y = 1.108-x*math.tan(slope)
        for column in range(6):
            z = -.229+column*.092
            tint = ['moss','moss','fern','moss','pine'][(row*3+column*2+(side>0))%5]
            box(tint,(side*x,y,z),(.097,.027,.087),-side*slope)
    # Thick fascia reads clearly from the face and rear.
    for z in (-.286,.286):
        box('pine',(side*.180,.948,z),(.452,.105,.025),-side*slope)
        box('fern',(side*.180,.994,z+.002),(.447,.008,.026),-side*slope)
for z in (-.23,-.14,-.05,.04,.13,.22):
    box('fern',(0,1.112,z),(.081,.037,.086))
for z in (-.288,.288):
    prism('pine',[(-.052,1.012),(.052,1.012),(.052,1.094),(0,1.133),(-.052,1.094)],z-.014,z+.014)
box('clay',(.183,1.048,-.120),(.095,.196,.087))
for y in (.998,1.051,1.104):
    box('shade',(.183,y,-.074),(.098,.006,.006))
box('shade',(.183,1.145,-.120),(.123,.030,.112))
box('ink',(.183,1.161,-.120),(.078,.004,.067))
# A tiny roof sprig gives it a Mossvale woodland accent.
tube('bark',[(-.247,.919,-.093),(-.257,.982,-.093),(-.247,1.025,-.093)],.008)
leaf('leaf',(-.255,.988,-.093),(-.312,1.023,-.097),.042,.006)
leaf('fern',(-.251,1.003,-.093),(-.215,1.046,-.097),.037,.006)

library = bpy.context.scene
library.name = 'Hearthling · game asset'
library.unit_settings.system = 'METRIC'
materials = []
for name, metal in [('Hearthling painted palette',False),('Hearthling brass palette',True)]:
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .33 if metal else .78
    shader.inputs['Metallic'].default_value = .82 if metal else 0
    vertex = mat.node_tree.nodes.new('ShaderNodeVertexColor'); vertex.layer_name = 'PetTint'
    mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Base Color'])
    materials.append(mat)
root = bpy.data.objects.new('hearthling',None); library.collection.objects.link(root)
root['title'] = 'Hearthling'; root['locomotion'] = 'walk'; root['groundY'] = 0
root['contract'] = 'Metres, Y-up/+Z forward in GLB. Rigid head, arm and leg pivots.'
joints = {}; all_vertices = []
for label,p in PETS['hearthling']['parts'].items():
    joint = bpy.data.objects.new('hearthling-'+label,None); library.collection.objects.link(joint)
    joint.parent = joints[p['parent']] if p['parent'] else root
    parent_pivot = PETS['hearthling']['parts'][p['parent']]['pivot'] if p['parent'] else Vector()
    joint.location = xyz(p['pivot']-parent_pivot); joints[label] = joint
    mesh = bpy.data.meshes.new(joint.name+'-geometry')
    mesh.from_pydata([xyz(v) for v in p['vertices']],[],p['faces'])
    for material in materials: mesh.materials.append(material)
    colors = mesh.color_attributes.new(name='PetTint',type='BYTE_COLOR',domain='CORNER')
    for poly,tint,material in zip(mesh.polygons,p['colors'],p['materials']):
        poly.material_index = material
        for loop in poly.loop_indices: colors.data[loop].color = tint
    mesh.update()
    obj = bpy.data.objects.new(joint.name+'-mesh',mesh); library.collection.objects.link(obj); obj.parent = joint
    all_vertices.extend(Vector(v)+p['pivot'] for v in p['vertices'])
root['height'] = max(v.y for v in all_vertices)
root['width'] = max(v.x for v in all_vertices)-min(v.x for v in all_vertices)
root['triangles'] = sum(len(face)-2 for part_data in PETS['hearthling']['parts'].values() for face in part_data['faces'])
for directory in (SOURCE.parent,EXPORT.parent,ICONS): directory.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
                          export_yup=True,export_animations=False,export_extras=True)

gallery = bpy.data.scenes.new('Hearthling · studio'); bpy.context.window.scene = gallery
render_setup(gallery,1024,1024)
gallery.cycles.samples = 48
portrait = clone_tree(root,gallery)
stone = plain_material('Deep woodland stone',(.032,.060,.049,1))
brass = plain_material('Muted brass',(.27,.19,.067,1),.55)
for radius,depth,y,mat in [(.49,.022,-.050,brass),(.49,.046,-.023,stone)]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=radius,depth=depth,location=xyz((0,y,0)))
    bpy.context.object.data.materials.append(mat)
    bevel = bpy.context.object.modifiers.new('Soft plinth edge','BEVEL'); bevel.width=.009; bevel.segments=2
bpy.ops.mesh.primitive_plane_add(size=200,location=xyz((0,-.063,0)))
bpy.context.object.data.materials.append(plain_material('Forest studio',(.020,.035,.029,1)))
gallery.camera.location = xyz((1.70,1.36,3.2)); aim(gallery.camera,(0,.56,0))
gallery.camera.data.ortho_scale = 1.54
gallery.render.filepath = str(PREVIEW)
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
    # True front/rear views keep the model reviewable, beyond the hero render.
    gallery.render.resolution_x = gallery.render.resolution_y = 768
    for view,location in [('front',(0,1.03,4)),('back',(-1.8,1.5,-3.3))]:
        gallery.camera.location=xyz(location); aim(gallery.camera,(0,.56,0))
        gallery.render.filepath=str(SOURCE.parent/('hearthling-'+view+'.png'))
        bpy.ops.render.render(write_still=True)
    icon = bpy.data.scenes.new('Hearthling · transparent portrait'); bpy.context.window.scene=icon
    render_setup(icon,256,256); icon.render.film_transparent=True
    icon_root=clone_tree(root,icon)
    icon.camera.location=xyz((1.7,1.36,3.2)); aim(icon.camera,(0,.56,0)); fit_portrait(icon.camera,icon_root)
    icon.render.filepath=str(ICONS/'hearthling.png'); bpy.ops.render.render(write_still=True)
    bpy.context.window.scene=gallery
gallery.render.resolution_x=gallery.render.resolution_y=1024
gallery.camera.location=xyz((1.70,1.36,3.2)); aim(gallery.camera,(0,.56,0))
gallery.render.filepath=str(PREVIEW)
bpy.ops.object.select_all(action='DESELECT')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.shading.use_scene_lights=True
            area.spaces.active.shading.use_scene_world=True
            area.spaces.active.overlay.show_overlays=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('HEARTHLING '+json.dumps({'bytes':EXPORT.stat().st_size,'triangles':root['triangles'],'height':root['height']}))
