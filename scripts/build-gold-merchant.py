"""Build the Mossvale gold merchant caravan (asset only; no gameplay changes).

Blender --background --python scripts/build-gold-merchant.py -- --render
Editable parts, metres, Blender Z up / -Y forward; GLB Y up / +Z forward.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
SOURCE = ROOT / 'assets/source/gold-merchant-caravan.blend'
EXPORT = ROOT / 'public/models/gold-merchant-caravan.glb'
PREVIEW = ROOT / 'assets/gold-merchant'
PREVIEW.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = 'Goldroad Company - caravan'
scene.unit_settings.system = 'METRIC'

def xyz(x, y, z): return (x, -z, y)
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
def color(s): return tuple(linear(int(s[i:i+2], 16)/255) for i in (0, 2, 4)) + (1,)

HEX = dict(oak='754830', plank='96603C', light='B5804D', dark='3A2924',
           forest='234E44', moss='427260', teal='477969', iron='283C3C',
           steel='708482', gold='D6AB57', bright='F6D894', leather='503727',
           cream='E6D9B7', glass='F3BA5D', black='172B2B', red='8B4445')
PAL = {k: color(v) for k, v in HEX.items()}
materials = []
for name, metallic, roughness in [('Caravan painted oak', 0, .79), ('Caravan forged metal', .62, .32)]:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    tint = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    tint.layer_name = 'CaravanTint'
    mat.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
    materials.append(mat)

def root(name, parent=None, at=(0,0,0)):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = xyz(*at)
    obj.empty_display_size = .2
    return obj

class Mesh:
    # Same vertex-palette construction as the existing Mossvale zeppelin kit.
    def __init__(self): self.v, self.f, self.c, self.mi = [], [], [], []
    def shape(self, tint, vertices, faces):
        n = len(self.v)
        self.v.extend(xyz(*p) for p in vertices)
        self.f.extend(tuple(n+i for i in face) for face in faces)
        self.c.extend([PAL[tint]] * len(faces))
        self.mi.extend([int(tint in ('iron','steel','gold','bright'))] * len(faces))
    def box(self, tint, x,y,z,w,h,d):
        self.shape(tint, [(x+a*w/2,y+b*h/2,z+c*d/2) for a,b,c in
            [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
            [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
    def beam(self, tint, start, end, radius, sides=6):
        a,b = Vector(start),Vector(end)
        axis=(b-a).normalized()
        t=axis.cross(Vector((0,1,0)))
        if t.length<.01: t=axis.cross(Vector((1,0,0)))
        t.normalize(); u=axis.cross(t)
        self.shape(tint, [tuple(p+radius*(math.cos(i*math.tau/sides)*t+math.sin(i*math.tau/sides)*u))
            for p in (a,b) for i in range(sides)],
            [tuple(reversed(range(sides))),tuple(sides+i for i in range(sides))]+
            [(i,(i+1)%sides,sides+(i+1)%sides,sides+i) for i in range(sides)])
    def ring(self, tint, center, outer, inner, depth, axis='x', sides=16):
        x,y,z=center
        vertices=[]
        for offset,r in [(-depth/2,outer),(depth/2,outer),(-depth/2,inner),(depth/2,inner)]:
            for i in range(sides):
                a=math.tau*i/sides
                vertices.append((x+offset,y+r*math.cos(a),z+r*math.sin(a)) if axis=='x'
                                else (x+r*math.sin(a),y+r*math.cos(a),z+offset))
        faces=[]
        for i in range(sides):
            j=(i+1)%sides
            faces.extend([(i,j,sides+j,sides+i),(2*sides+i,3*sides+i,3*sides+j,2*sides+j),
                          (i,2*sides+i,2*sides+j,j),(sides+i,sides+j,3*sides+j,3*sides+i)])
        self.shape(tint,vertices,faces)
    def finish(self,name,parent,at=(0,0,0)):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.v,[],self.f)
        for mat in materials: mesh.materials.append(mat)
        attr=mesh.color_attributes.new(name='CaravanTint',type='BYTE_COLOR',domain='CORNER')
        for face,c,mi in zip(mesh.polygons,self.c,self.mi):
            face.material_index=mi
            for i in face.loop_indices: attr.data[i].color=c
        mesh.update()
        obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
        obj.parent=parent;obj.location=xyz(*at)
        return obj

caravan=root('gold-merchant-caravan')
caravan['description']='Goldroad Company: merchant, three armed escorts, locked carriage, two horses.'
caravan['axes']='Metres; GLB Y up and +Z forward. Parked presentation, no animation clips.'
coach=root('secured-carriage',caravan,(0,0,-2.6))
coach['wheel_radius']=.78
coach['door']='Separate rear door and latch geometry; shown locked.'

# Raised oak chassis, four real spoked wheels and layered leaf springs.
m=Mesh(); b=m.box
b('dark',0,.91,.1,2.68,.27,4.9)
b('oak',0,1.10,.10,2.90,.16,4.85)
for i in range(13): b('plank' if i%3 else 'light',0,1.20,-2.04+i*.36,2.71,.08,.34)
for x in [-.89,.89]: b('iron',x,.70,0,.16,.24,4.35)
for z in [-1.43,1.53]:
    m.beam('iron',(-1.83,.78,z),(1.83,.78,z),.105,8)
    for x in [-1.12,1.12]:
        for i in range(3): b('steel',x,.88+i*.055,z,.13,.045,1.17-i*.19)
for side in [-1,1]:
    b('iron',side*1.39,1.17,0,.10,.17,4.15)
    # Running boards with open steps.
    b('dark',side*1.69,.94,.30,.43,.12,1.40)
    b('gold',side*1.89,.99,.30,.05,.05,1.38)
    for z in [-.14,.65]:
        b('iron',side*1.61,.65,z,.08,.50,.08)
    b('oak',side*1.63,.46,.26,.43,.10,1.02)
m.finish('carriage-chassis-and-suspension',coach)
for side in [-1,1]:
    for z,label in [(-1.43,'rear'),(1.53,'front')]:
        wheel=root('wheel-'+label+('-left' if side<0 else '-right'),coach,(side*1.60,.78,z))
        m=Mesh()
        m.ring('iron',(0,0,0),.78,.66,.23)
        m.ring('oak',(0,0,0),.68,.56,.22)
        m.ring('gold',(side*.125,0,0),.725,.695,.026)
        for i in range(10):
            a=i*math.tau/10
            m.beam('light',(0,0,0),(0,.61*math.cos(a),.61*math.sin(a)),.06,4)
            m.beam('steel',(side*.13,.715*math.cos(a),.715*math.sin(a)),
                   (side*.16,.715*math.cos(a),.715*math.sin(a)),.027,6)
        m.beam('iron',(-.20,0,0),(.20,0,0),.18,10)
        m.beam('gold',(side*.20,0,0),(side*.26,0,0),.125,8)
        m.finish('spoked-rim-hub',wheel)

# Timber vault cabin. Every panel is modeled; no image textures.
m=Mesh();b=m.box
for side in [-1,1]:
    for i in range(12):
        b('oak' if i%3 else 'plank',side*1.27,2.18,-1.77+i*.315,.16,1.88,.295)
    for y in [1.30,1.58,3.04]: b('iron',side*1.38,y,0,.12,.14,3.96)
    for z in [-1.86,-.71,.59,1.86]:
        b('iron',side*1.38,2.17,z,.12,1.88,.13)
        for y in [1.37,1.73,2.26,2.91]:
            m.beam('gold',(side*1.43,y,z),(side*1.49,y,z),.034,6)
    # Recessed black opening, heavy brass border and forged window bars.
    b('black',side*1.375,2.61,.72,.07,.67,.95)
    for y in [2.24,2.98]: b('gold',side*1.44,y,.72,.09,.07,1.07)
    for z in [.22,1.22]: b('gold',side*1.44,2.61,z,.09,.80,.07)
    for z in [.36,.60,.84,1.08]: b('iron',side*1.47,2.61,z,.065,.68,.05)
    b('iron',side*1.47,2.59,.72,.06,.055,.98)
    # Guild coin crest: sun rays and three raised ingots.
    m.beam('forest',(side*1.37,2.36,-.87),(side*1.45,2.36,-.87),.49,12)
    m.ring('gold',(side*1.50,2.36,-.87),.44,.38,.05, sides=12)
    for j in range(8):
        a=j*math.tau/8
        m.beam('gold',(side*1.51,2.36+.25*math.cos(a),-.87+.25*math.sin(a)),
               (side*1.51,2.36+.32*math.cos(a),-.87+.32*math.sin(a)),.023,4)
    for y,z in [(2.30,-.97),(2.30,-.74),(2.46,-.85)]: b('bright',side*1.54,y,z,.055,.11,.19)
for z in [-1.90,1.9]:
    b('oak',0,2.20,z,2.56,1.88,.14)
    for x in [-1.22,1.22]: b('iron',x,2.19,z*1.045,.13,1.90,.12)
    b('gold',0,3.08,z,2.76,.09,.18)
# The roof gables are fully enclosed above the vault walls.
for i in range(9):
    x=(i-4)*.30;top=3.25+.43*(1-abs(i-4)/4)
    for z in [-1.93,1.93]:
        b('forest',x,(3.07+top)/2,z,.31,top-3.07,.13)
# Planked front bulkhead and a narrow barred inspection hatch above the seat.
for i in range(9): b('oak' if i%2 else 'plank',(i-4)*.26,2.25,1.987,.25,1.49,.04)
for x in [-1.13,1.13]: b('iron',x,2.30,2.02,.09,1.58,.075)
b('iron',0,2.96,2.02,2.34,.10,.075)
b('black',0,2.64,2.04,.91,.30,.06)
for y in [2.46,2.82]: b('gold',0,y,2.09,1.04,.055,.055)
for x in [-.5,.5]: b('gold',x,2.64,2.09,.055,.41,.055)
for x in [-.3,0,.3]: b('iron',x,2.64,2.10,.055,.30,.055)
m.finish('armored-oak-vault-cabin',coach)

# Rear double vault door with hinges, crossbars, central hasp and paired locks.
door=root('rear-vault-door',coach,(0,1.25,-2.02))
m=Mesh();b=m.box
b('black',0,.85,0,1.86,1.78,.08)
for side in [-1,1]:
    for i in range(4): b('forest' if i%2 else 'moss',side*(.11+i*.205),.84,-.065,.195,1.64,.09)
    for y in [.19,1.41]:
        b('iron',side*.46,y,-.135,.85,.12,.07)
        for x in [side*.13,side*.77]: b('gold',x,y,-.184,.055,.055,.035)
    for y in [.31,1.24]: b('steel',side*.91,y,-.13,.17,.28,.10)
b('iron',0,.72,-.17,1.96,.17,.13)
for x in [-.24,.24]:
    m.ring('steel',(x,.81,-.275),.115,.063,.07,axis='z',sides=10)
    b('gold',x,.64,-.29,.24,.25,.12)
    m.beam('black',(x,.66,-.37),(x,.66,-.38),.032,8)
    b('black',x,.615,-.38,.027,.065,.016)
m.finish('locked-double-door',door)

# Stepped woodland-green roof, brass ridge and tied travel trunk.
m=Mesh();b=m.box
for i in range(9):
    x=(i-4)*.34; y=3.28+.43*(1-abs(i-4)/4)
    b('forest' if i%2 else 'teal',x,y,0,.355,.17,4.28)
    for z in [-1.97,1.97]: b('gold',x,y+.099,z,.355,.035,.09)
b('gold',0,3.81,0,.11,.10,4.42)
for side in [-1,1]:
    b('iron',side*1.53,3.25,0,.12,.17,4.40)
    for z in [-1.7,1.7]: m.beam('gold',(side*1.52,3.27,z),(side*1.69,3.42,z),.05,6)
m.finish('stepped-green-roof',coach)
m=Mesh();b=m.box
b('oak',0,3.98,-.52,1.47,.48,.76)
b('plank',0,4.245,-.52,1.53,.09,.80)
for x in [-.5,.5]:
    b('iron',x,4.28,-.52,.11,.04,.86)
    for z in [-.925,-.115]: b('iron',x,4.0,z,.11,.52,.045)
b('gold',0,4.09,-.10,.18,.21,.07)
m.finish('locked-roof-strongbox',coach)

# Driving bench and two warm, guarded carriage lanterns.
m=Mesh();b=m.box
b('dark',0,1.53,2.04,2.13,.12,.64)
b('forest',0,1.64,2.04,2.05,.13,.58)
b('oak',0,1.99,1.73,2.15,.64,.14)
b('moss',0,2.01,1.815,1.86,.39,.05)
for side in [-1,1]:
    b('gold',side*1.05,1.91,2.07,.09,.11,.74)
    b('iron',side*1.05,1.74,2.32,.07,.35,.07)
    x=side*1.49;z=1.90
    m.beam('iron',(side*1.24,3.01,z),(x,3.01,z),.055)
    m.ring('gold',(x,2.88,z),.12,.075,.045,axis='z',sides=8)
    b('gold',x,2.69,z,.35,.08,.35)
    b('glass',x,2.43,z,.24,.43,.24)
    for dx in [-.155,.155]:
        for dz in [-.155,.155]: b('iron',x+dx,2.43,z+dz,.035,.48,.035)
    b('gold',x,2.17,z,.35,.07,.35)
m.finish('drivers-bench-and-lanterns',coach)

# Append the original authored horse hierarchy without running its build script.
with bpy.data.libraries.load(str(ROOT/'assets/source/mounts.blend'),link=False) as (src,dst):
    dst.objects=[n for n in src.objects if n=='mount-horse' or (n.startswith('horse-') and '.' not in n)]
for obj in dst.objects:
    if obj: scene.collection.objects.link(obj)
horse=next(obj for obj in dst.objects if obj.name=='mount-horse')
def duplicate_tree(obj,parent=None):
    clone=obj.copy()
    if obj.type=='MESH': clone.data=obj.data.copy()
    scene.collection.objects.link(clone)
    clone.parent=parent
    for child in obj.children: duplicate_tree(child,clone)
    return clone
horse2=duplicate_tree(horse)
for obj,x,name in [(horse,-.86,'draft-horse-chestnut'),(horse2,.86,'draft-horse-dapple')]:
    obj.name=name;obj.parent=caravan;obj.location=xyz(x,0,3.05)
    obj['source']='Mossvale Hearthland Courser, adapted with carriage harness.'
recolors={'995735':'919991','BC7446':'AFB4A6','CF935F':'D0D0B8','754229':'666F6A',
          '3F2E2B':'4B5150','F3DCAC':'EBE7CF','C9B98C':'C5C8B7',
          '26888B':'315A49','50B7AA':'659171','1E5C65':'254336'}
def descendants(obj):
    yield obj
    for child in obj.children: yield from descendants(child)
for obj in descendants(horse2):
    if obj.type!='MESH':continue
    for attr in obj.data.color_attributes:
        for item in attr.data:
            for old,new in recolors.items():
                if max(abs(a-b) for a,b in zip(item.color,color(old)))<.01:
                    item.color=color(new);break
for h in [horse,horse2]:
    m=Mesh();b=m.box
    for side in [-1,1]:
        b('leather',side*.52,1.42,.69,.12,.78,.20)
        b('gold',side*.59,1.39,.79,.05,.16,.11)
        b('leather',side*.56,1.24,-.18,.08,.12,1.70)
        m.ring('gold',(side*.60,1.18,.58),.105,.066,.04,sides=10)
    b('leather',0,1.84,.68,1.1,.12,.23)
    b('gold',0,1.86,.81,.22,.13,.05)
    b('leather',0,1.06,.83,1.08,.15,.13)
    m.finish('padded-collar-and-harness',h)
m=Mesh()
for x in [-1.52,1.52]:
    m.beam('oak',(x,1.08,-.56),(x,1.17,3.64),.067,8)
    m.beam('gold',(x,1.17,3.43),(x,1.17,3.68),.079,8)
    m.beam('leather',(x,1.2,1.07),(x,1.37,3.70),.025,6)
m.beam('oak',(-1.53,1.07,1.45),(1.53,1.07,1.45),.075,8)
for x in [-.86,.86]:
    for s in [-1,1]:
        points=[(s*.4,1.95,-.25),(x+s*.29,1.55,1.3),(x+s*.30,1.89,3.75),(x+s*.33,2.24,4.61)]
        for a,bp in zip(points,points[1:]):m.beam('leather',a,bp,.018,5)
m.finish('drawbars-traces-and-reins',caravan)

from gold_merchant_characters import build_characters
actors=build_characters()
placements={'merchant':(3.05,0,.0,-.18),'guard-captain':(2.95,0,3.15,.10),
            'guard-spear':(-2.90,0,1.30,-.10),'guard-crossbow':(2.85,0,-3.8,.30)}
for name,obj in actors.items():
    x,y,z,turn=placements[name]
    obj.parent=caravan;obj.location=xyz(x,y,z);obj.rotation_euler.z=turn

# Export only the caravan. The studio is deliberately created afterwards.
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in descendants(caravan):obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
    export_yup=True,export_apply=True,export_animations=False,export_cameras=False,
    export_lights=False,export_extras=True)

def solid(name,hexcode):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color(hexcode)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.92
    return mat
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.055))
floor=bpy.context.object;floor.name='Studio floor - excluded from GLB'
floor.data.materials.append(solid('Studio warm stone','9A9D89'))
world=bpy.data.worlds.new('Soft woodland studio');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.28,.26,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
for at,power,size in [((-6,12,7),2100,8),((8,7,3),1400,7),((0,10,-8),2500,7)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at));lamp=bpy.context.object
    lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;aim(lamp,(0,1.4,0))
bpy.ops.object.camera_add(location=xyz(13,10,17));camera=bpy.context.object
camera.name='Caravan hero camera';camera.data.type='ORTHO';camera.data.ortho_scale=15.4
aim(camera,(.25,1.40,-.10));scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1900;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(PREVIEW/'caravan.png')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
    camera.location=xyz(12,8,-15);camera.data.ortho_scale=13.5;aim(camera,(.0,1.5,-.5))
    scene.render.filepath=str(PREVIEW/'rear-security.png');bpy.ops.render.render(write_still=True)
    camera.location=xyz(7.8,4.2,7.0);camera.data.ortho_scale=4.8;aim(camera,(3.05,1.30,0))
    scene.render.resolution_x=1100;scene.render.resolution_y=1200
    scene.render.filepath=str(PREVIEW/'merchant-detail.png');bpy.ops.render.render(write_still=True)
print('CARAVAN '+json.dumps({'blend':str(SOURCE),'glb':str(EXPORT),'bytes':EXPORT.stat().st_size}))
