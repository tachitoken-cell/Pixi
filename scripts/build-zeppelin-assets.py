"""Original Mossvale airship and accessible town landing.

Blender --background --python scripts/build-zeppelin-assets.py -- --render
Runtime coordinates: metres, Y up, +Z bow. Ship origin is its passenger deck.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/zeppelin-kit.glb'
SOURCE = ROOT / 'assets/source/zeppelin-kit.blend'
PREVIEW = ROOT / 'assets/source/zeppelin-kit-preview.png'

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library = bpy.context.scene
library.name = 'Mossvale Airways - editable asset library'
library.unit_settings.system = 'METRIC'

def xyz(x, y, z):
    return x, -z, y

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

HEX = dict(oak='795338', oaklight='B08252', oakdark='493729', plank='9C7249',
           cream='E1CCA0', linen='EFE3C5', fabricshade='CBB88F', teal='36746A',
           teallight='529489', tealdark='224E49', gold='DFB35F', goldshade='AA7C3E',
           amber='F4D38B', iron='354746', stone='8B8D7C', stoneshade='5C6962',
           stonebright='B0AA92', blue='80B8BF', blueshade='436F79', wine='9C4F54')
PAL = {key: tuple(linear(int(value[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
       for key, value in HEX.items()}
material = bpy.data.materials.new('Mossvale Airways vertex palette')
material.use_nodes = True
shader = material.node_tree.nodes['Principled BSDF']
shader.inputs['Roughness'].default_value = .79
tint = material.node_tree.nodes.new('ShaderNodeVertexColor')
tint.layer_name = 'AirwaysTint'
material.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])

class Mesh:
    def __init__(self):
        self.v, self.f, self.colors = [], [], []

    def shape(self, color, vertices, faces):
        start = len(self.v)
        self.v.extend(xyz(*p) for p in vertices)
        self.f.extend(tuple(start + i for i in face) for face in faces)
        self.colors.extend([PAL[color]] * len(faces))

    def box(self, color, x, y, z, w, h, d, turn=0):
        c, s = math.cos(turn), math.sin(turn)
        self.shape(color, [(x+a*w/2*c+k*d/2*s, y+b*h/2, z-a*w/2*s+k*d/2*c)
                          for a, b, k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                          (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
                   [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])

    def beam(self, color, start, end, radius, sides=6):
        a, b = Vector(start), Vector(end)
        axis = (b-a).normalized()
        tangent = axis.cross(Vector((0,1,0)))
        if tangent.length < .01:
            tangent = axis.cross(Vector((1,0,0)))
        tangent.normalize()
        other = axis.cross(tangent)
        vertices = [tuple(p + radius*(math.cos(i*math.tau/sides)*tangent +
                                     math.sin(i*math.tau/sides)*other))
                    for p in (a,b) for i in range(sides)]
        self.shape(color, vertices,
                   [tuple(reversed(range(sides))), tuple(sides+i for i in range(sides))] +
                   [(i,(i+1)%sides,sides+(i+1)%sides,sides+i) for i in range(sides)])

    def envelope(self, z0, z1, r0, r1, band=False):
        # Flat gores and explicit seams preserve the faceted voxel world silhouette.
        for i in range(20):
            a, b = i*math.tau/20, (i+1)*math.tau/20
            color = ('teal' if i%3 else 'teallight') if band else ['cream','linen','cream','fabricshade'][i%4]
            self.shape(color, [(math.cos(a)*5.5*r0,8.5+math.sin(a)*4.7*r0,z0),
                               (math.cos(b)*5.5*r0,8.5+math.sin(b)*4.7*r0,z0),
                               (math.cos(b)*5.5*r1,8.5+math.sin(b)*4.7*r1,z1),
                               (math.cos(a)*5.5*r1,8.5+math.sin(a)*4.7*r1,z1)], [(0,1,2,3)])

    def lantern(self, x, y, z, size=.35):
        b = self.box
        b('goldshade',x,y-size*.53,z,size*1.05,.08,size*1.05)
        b('amber',x,y,z,size*.69,size*.90,size*.69)
        for xx in [-1,1]:
            for zz in [-1,1]:
                b('iron',x+xx*size*.42,y,z+zz*size*.42,.045,size*1.15,.045)
        b('gold',x,y+size*.58,z,size*1.15,.09,size*1.15)
        b('teal',x,y+size*.73,z,size*.7,.09,size*.7)
        self.beam('iron',(x,y+size*.8,z),(x,y+size*1.25,z),.04)

    def finish(self, name, parent, position=(0,0,0)):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.v, [], self.f)
        mesh.materials.append(material)
        attr = mesh.color_attributes.new(name='AirwaysTint', type='BYTE_COLOR', domain='CORNER')
        for face, col in zip(mesh.polygons, self.colors):
            for index in face.loop_indices:
                attr.data[index].color = col
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        library.collection.objects.link(obj)
        obj.parent = parent
        obj.location = xyz(*position)
        return obj

def root(name):
    obj = bpy.data.objects.new(name, None)
    library.collection.objects.link(obj)
    obj['contract'] = 'Metres; glTF Y up; +Z forward; runtime owns placement.'
    return obj

ship = root('zeppelin')
ship['deckY'] = 0.0
ship['deckWidth'] = 4.8
ship['deckLength'] = 12.0
ship['boardingPoint'] = [0,0,-5.7]
ship['passengerPoint'] = [0,0,-1.0]
ship['minimumDeckHeight'] = 1.3
m = Mesh()
b = m.box

# Segmented cream envelope, contrasting woven bands and brass hoops.
stations = [(-16,0),(-15.5,.16),(-15,.29),(-14,.47),(-13,.62),(-12,.72),
            (-10,.85),(-9,.9),(-8.65,.915),(-8,.94),(-7.85,.945),(-6,.98),
            (-3,1),(0,1),(3,1),(6,.98),(7.85,.945),(8,.94),(8.65,.915),
            (9,.9),(10,.85),(12,.72),(13,.62),(14,.47),(15,.29),(15.5,.16),(16,0)]
for (z0,r0),(z1,r1) in zip(stations, stations[1:]):
    m.envelope(z0,z1,r0,r1,7.84 < abs((z0+z1)/2) < 8.66)
for z, radius in [(-12,.72),(-8.66,.915),(-7.84,.945),(-3,1),(3,1),(7.84,.945),(8.66,.915),(12,.72)]:
    for i in range(20):
        a, c = i*math.tau/20, (i+1)*math.tau/20
        m.beam('goldshade' if abs(z)==3 else 'gold',
               (math.cos(a)*5.52*radius,8.5+math.sin(a)*4.72*radius,z),
               (math.cos(c)*5.52*radius,8.5+math.sin(c)*4.72*radius,z),.045)
for i in [1,3,5,7,9,11,13,15,17,19]:
    a = i*math.tau/20
    for (z0,r0),(z1,r1) in zip(stations[2:-2],stations[3:-1]):
        m.beam('fabricshade',(math.cos(a)*5.51*r0,8.5+math.sin(a)*4.71*r0,z0),
               (math.cos(a)*5.51*r1,8.5+math.sin(a)*4.71*r1,z1),.022,4)

# Winged airways crest is built from discrete coloured blocks, visible on either flank.
for side in [-1,1]:
    for zz, height in [(-2.1,.32),(-1.7,.65),(-1.3,.95),(-.9,1.3),(-.45,1.75),(0,2.2),
                       (.45,1.75),(.9,1.3),(1.3,.95),(1.7,.65),(2.1,.32)]:
        b('tealdark',side*5.515,8.5,zz,.055,height,.46)
    for zz in [-1.6,-1.15,-.7,.7,1.15,1.6]:
        b('gold',side*5.554,8.47+abs(zz)*.16,zz,.04,.19,.40)
    b('gold',side*5.554,8.53,0,.04,1.35,.20)
    b('gold',side*5.554,8.08,0,.04,.18,.75)
    b('linen',side*5.58,9.09,0,.04,.20,.20)

# Rounded gondola rendered with stepped timber courses and separate deck boards.
for y,w,d in [(-1.01,2.6,8.4),(-.80,3.5,9.6),(-.55,4.1,10.8),(-.29,4.55,11.6)]:
    b('oakdark' if y == -1.01 else 'oak',0,y,0,w,.24,d)
for z in [-5.6,-4.2,-2.8,-1.4,0,1.4,2.8,4.2,5.6]:
    b('goldshade',0,-.17,z,4.65,.15,.11)
b('oakdark',0,-.10,0,4.7,.18,12)
for i in range(16):
    b('oaklight' if i%4==0 else 'plank',-2.25+i*.3,-.07,0,.285,.14,12)
for x in [-2.42,2.42]:
    b('oakdark',x,.04,0,.16,.18,12.1)
    b('gold',x,.15,0,.19,.09,12.15)
    for z in [-5.75,-4.0,-2.2,0,2.2,4.0,5.75]:
        b('oakdark',x,.64,z,.17,1.20,.17)
        b('gold',x,1.27,z,.23,.13,.23)
    for yy in [.58,1.22]:
        b('oaklight' if yy>.6 else 'oak',x,yy,0,.13,.12,11.7)
    # Hull's teal relief panels and brass portholes remain visible at cruise height.
    for z in [-3.6,-1.8,0,1.8,3.6]:
        b('tealdark',x*.91,-.36,z,.09,.31,1.27)
        b('gold',x*.938,-.33,z,.07,.18,.36)
        b('blue',x*.956,-.33,z,.018,.12,.25)
for z in [-6,6]:
    for x in [-1.92,1.92]:
        b('oaklight',x,1.22,z,1.03,.13,.14)
        b('oak',x,.6,z,1.03,.09,.1)
# Twin benches leave a clear central passenger aisle.
for side in [-1,1]:
    for z in [-3.25,-.4]:
        for zz in [-.75,.75]:
            b('oakdark',side*1.7,.28,z+zz,.22,.56,.22)
        b('oaklight',side*1.7,.56,z,.78,.16,2.05)
        b('teal',side*1.95,.92,z,.12,.64,2.05)
        b('gold',side*2.025,1.13,z,.04,.11,1.83)

# Glass-front navigation cabin, roof, wheel and navigation charts.
b('oakdark',0,.27,3.9,3.30,.54,3.2)
b('teal',0,.51,3.9,3.38,.16,3.3)
for x in [-1.56,0,1.56]:
    b('oaklight',x,1.52,5.48,.16,2.04,.16)
for x in [-1.56,1.56]:
    for z in [2.42,3.9]:
        b('oaklight',x,1.52,z,.16,2.04,.16)
    for z in [3.13,4.65]:
        b('blue',x,1.59,z,.04,1.4,1.32)
        b('gold',x,1.55,z,.10,.07,1.35)
for x in [-.78,.78]:
    b('blue',x,1.59,5.48,1.39,1.40,.04)
    b('gold',x,1.54,5.51,1.42,.07,.07)
for z in [2.36,5.54]:
    b('oaklight',0,2.51,z,3.47,.20,.18)
b('tealdark',0,2.68,3.94,3.82,.18,3.72)
b('teal',0,2.86,3.94,3.4,.18,3.72)
b('teallight',0,3.02,3.94,2.7,.16,3.72)
b('gold',0,3.12,3.94,.15,.08,3.83)
for x in [-1.95,1.95]:
    b('gold',x,2.66,3.94,.11,.12,3.90)
b('oakdark',0,.98,4.6,2.85,.14,.55)
b('linen',-.78,1.075,4.59,.85,.025,.43)
for x in [-1,-.78,-.56]:
    b('teal',x,1.092,4.59,.028,.006,.30)
m.beam('gold',(0,.45,4.22),(0,1.28,4.22),.09)
for i in range(8):
    a,c=i*math.tau/8,(i+1)*math.tau/8
    m.beam('oaklight',(math.cos(a)*.38,1.39+math.sin(a)*.38,4.19),
           (math.cos(c)*.38,1.39+math.sin(c)*.38,4.19),.055)
    m.beam('gold',(0,1.39,4.19),(math.cos(a)*.47,1.39+math.sin(a)*.47,4.19),.025)
for x in [-.96,.96]:
    m.lantern(x,2.19,2.30,.25)
for x in [-2.36,2.36]:
    for z in [-5.65,.7]:
        m.lantern(x,1.68,z,.30)

# Rigging supports the gondola visibly without crossing the passenger aisle.
for side in [-1,1]:
    for z in [-4.6,-.9,3.0]:
        m.beam('iron',(side*2.43,1.13,z),(side*3.8,5.4,z*1.5),.040)
        m.beam('goldshade',(side*2.43,.18,z),(side*3.8,5.4,z*1.5),.026)
        b('gold',side*2.43,1.12,z,.22,.25,.25)
    m.beam('oakdark',(side*2.3,.65,-2.0),(side*3.63,1.45,-2.0),.14)
    b('teal',side*3.63,1.45,-2.20,.80,.69,1.25)
    b('gold',side*3.63,1.45,-1.55,.89,.78,.16)
    for z in [-2.58,-2.37,-2.16]:
        b('iron',side*3.63,1.79,z,.49,.05,.10)

# Stepped tail surfaces: cream inset, teal fabric, timber spars and brass edging.
for z,half,height in [(-11.4,.32,1.30),(-12.2,.29,2.6),(-13.0,.26,3.55),
                      (-13.8,.23,3.35),(-14.6,.20,2.75),(-15.4,.17,1.8),(-16.2,.14,.95)]:
    base=9.0
    b('teal',0,base+height/2,z,half*2,height,.81)
    b('gold',0,base+height,z,half*2+.04,.09,.81)
    if height>1.7:
        for side in [-1,1]:
            b('cream',side*(half+.012),base+height*.55,z,.025,height*.39,.57)
for side in [-1,1]:
    for z,span in [(-11.0,3.1),(-11.8,4.4),(-12.6,5.6),(-13.4,5.4),(-14.2,4.5),(-15,3.3),(-15.8,1.9)]:
        b('teal',side*(2.25+span)/2,8.12,z,max(.05,span-2.25),.18,.81)
        b('gold',side*span,8.12,z,.11,.22,.81)
        if span>3.4:
            b('cream',side*(span+2.4)/2,8.225,z,span-3.0,.035,.55)
m.beam('gold',(0,8.5,-15.7),(0,8.5,-16.8),.1)
b('tealdark',0,8.5,-16.75,.32,.32,.32)
m.finish('zeppelin-hull-envelope-rigging', ship)

# Runtime rotates these named pivots around local glTF Z; meshes are local to pivot.
for label, x in [('port',-3.63),('starboard',3.63)]:
    pivot=root('zeppelin-propeller-'+label)
    pivot.parent=ship
    pivot.location=xyz(x,1.45,-1.32)
    pivot['rotationAxis']='Z'
    prop=Mesh()
    prop.beam('gold',(0,0,-.13),(0,0,.13),.23,12)
    for i in range(4):
        a=i*math.pi/2+.3
        ca,sa=math.cos(a),math.sin(a)
        vertices=[]
        for zz in [-.05,.05]:
            for r,t in [(.15,-.10),(.95,-.15),(1.18,.025),(1.1,.23),(.32,.16)]:
                vertices.append((r*ca-t*sa,r*sa+t*ca,zz))
        prop.shape('oaklight',vertices,[(4,3,2,1,0),(5,6,7,8,9)]+[(j,(j+1)%5,(j+1)%5+5,j+5) for j in range(5)])
        prop.beam('gold',(ca*.84,sa*.84,0),(ca*1.04,sa*1.04,0),.095,4)
    prop.finish('zeppelin-propeller-'+label+'-blades',pivot)

# Accessible low landing with side furniture and a completely open central route.
dock=root('zeppelin-dock')
dock['deckY']=.18
dock['boardingPoint']=[0,.18,5.3]
dock['interactionPoint']=[-3.75,.18,3.4]
dock['approachPoint']=[0,0,-8]
dock['solidFootprints']=json.dumps([[-4.8,0,.46,10.5],[4.8,0,.46,10.5],
                                    [-3.85,3.7,1.3,1.3],[3.95,-3.0,1.1,3.0],
                                    [-3.8,-2.5,1.0,2.2],[-3.7,5.45,.47,.30],
                                    [3.7,5.45,.47,.30]],separators=(',',':'))
m=Mesh()
b=m.box
b('stoneshade',0,.025,0,9.6,.05,12)
for i in range(24):
    b('oaklight' if i%5==0 else 'plank',0,.115,-5.75+i*.5,9.5,.13,.475)
for x in [-4.8,4.8]:
    b('oakdark',x,.1,0,.22,.20,12.2)
    for z in [-5,-2.5,0,2.5,5]:
        b('oakdark',x,.72,z,.22,1.18,.22)
        b('gold',x,1.32,z,.28,.11,.28)
    for z in [-3.75,-1.25,1.25,3.75]:
        m.beam('cream',(x,1.02,z-1.18),(x,.84,z),.04)
        m.beam('cream',(x,.84,z),(x,1.02,z+1.18),.04)
    m.lantern(x,1.74,5,.4)
    m.lantern(x,1.74,-5,.4)
# One shallow ramp reaches the platform without stairs or a front lip.
m.shape('oaklight',[(-3,0,-8),(3,0,-8),(3,.18,-5.97),(-3,.18,-5.97),
                    (-3,0,-5.97),(3,0,-5.97)],[(0,1,2,3),(0,4,5,1),(0,3,4),(1,5,2),(4,3,2,5)])
for x in [-3,3]:
    m.beam('goldshade',(x,.018,-8),(x,.198,-5.97),.027,4)
for z in [-4.7,-3.7,-2.7,-1.7,-.7,.3,1.3,2.3,3.3,4.3]:
    b('teal',0,.186,z,.44,.012,.53)
    b('gold',0,.197,z+.30,.12,.010,.10)
for side in [-1,1]:
    b('iron',side*3.7,.42,5.45,.27,.48,.27)
    b('gold',side*3.7,.65,5.45,.47,.09,.30)
    m.beam('cream',(side*3.7,.54,5.45),(side*4.75,.64,5),.06)

# Airways booking post: clear wing crest, amber signal and readable arrival plaque.
b('stone',-3.85,.36,3.7,1.15,.36,1.15)
b('oakdark',-3.85,1.45,3.7,.25,2.00,.25)
b('gold',-3.85,2.42,3.7,.37,.16,.37)
b('tealdark',-3.85,1.73,3.51,1.22,.82,.16)
b('gold',-3.85,1.73,3.415,1.10,.68,.035)
b('teal',-3.85,1.73,3.390,.98,.57,.025)
for side in [-1,1]:
    for i in range(3):
        b('linen',-3.85+side*(.12+i*.095),1.76+i*.06,3.370,.10,.055,.014)
b('linen',-3.85,1.72,3.367,.06,.30,.014)
m.lantern(-3.85,2.85,3.7,.52)
b('teal',-3.85,3.37,3.7,1.20,.13,1.20)
b('gold',-3.85,3.46,3.7,.74,.06,.74)
for z in [-3.9,-2.1]:
    b('oakdark',3.85,.41,z,.20,.46,.20)
b('oaklight',3.85,.63,-3,1,.15,2.55)
b('teal',4.26,1.05,-3,.12,.70,2.55)
for x,z in [(-3.8,-3.1),(-3.8,-1.9)]:
    b('oak',x,.5,z,.95,.65,.95)
    for yy in [.22,.73]:
        b('goldshade',x,yy,z,.98,.09,.98)
    b('teal',x,.53,z-.49,.53,.23,.025)
m.finish('zeppelin-dock-platform-post-details',dock)

EXPORT.parent.mkdir(parents=True,exist_ok=True)
SOURCE.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
                          export_yup=True,export_apply=True,export_animations=False,
                          export_cameras=False,export_lights=False,export_extras=True)

# Separate presentation scene; asset library and GLB remain at their contract origins.
gallery=bpy.data.scenes.new('Mossvale Airways - docking study')
bpy.context.window.scene=gallery
def duplicate_tree(source,parent=None):
    obj=source.copy()
    if source.data:
        obj.data=source.data
    gallery.collection.objects.link(obj)
    obj.parent=parent
    for child in source.children:
        duplicate_tree(child,obj)
    return obj
ship_view=duplicate_tree(ship)
ship_view.location=xyz(0,2.8,6)
dock_view=duplicate_tree(dock)
dock_view.location=xyz(0,0,-12)
bpy.ops.mesh.primitive_plane_add(size=200)
ground=bpy.context.object
ground.name='Preview meadow - excluded from export'
floor=bpy.data.materials.new('Preview muted green')
floor.diffuse_color=(.105,.145,.111,1)
ground.data.materials.append(floor)
def aim(obj,point):
    obj.rotation_euler=(Vector(xyz(*point))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(37,26,-45))
camera=bpy.context.object
camera.name='Airways three quarter presentation'
camera.data.type='ORTHO'
camera.data.ortho_scale=49
aim(camera,(0,6,-1))
gallery.camera=camera
for position,power,size in [((-15,31,-20),8500,18),((22,20,16),5300,14)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*position))
    light=bpy.context.object
    light.data.energy=power
    light.data.size=size
    aim(light,(0,5,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-15,25,-15))
sun=bpy.context.object
sun.data.energy=2.0
sun.data.angle=.2
aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('Mossvale Airways daylight')
gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.40
gallery.render.engine='CYCLES'
gallery.cycles.samples=40
gallery.cycles.use_denoising=True
gallery.render.resolution_x=1920
gallery.render.resolution_y=1440
gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG'
gallery.render.filepath=str(PREVIEW)
gallery.view_settings.view_transform='AgX'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('ZEPPELIN_ASSETS '+json.dumps({'bytes':EXPORT.stat().st_size,'ship':'zeppelin',
      'dock':'zeppelin-dock','propellers':['zeppelin-propeller-port','zeppelin-propeller-starboard']}))
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
