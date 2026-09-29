"""Detailed original Mossvale wild-biome and resource-site assets, built in Blender.
Rebuild: Blender --background --threads 2 --python scripts/build-world-feedback-assets.py -- --render
Shared palette meshes; metres, Y up, +Z front; grounded origin. No external textures.
"""
import bpy, json, math, random, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/world-feedback-kit.glb'
SOURCE=ROOT/'assets/source/world-feedback-kit.blend'
PREVIEW=ROOT/'assets/source/world-feedback-kit-preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
library=bpy.context.scene;library.name='Mossvale wild-biome asset library'
library.unit_settings.system='METRIC'
def xyz(x,y,z): return x,-z,y
def linear(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
HEX = {
    'sand':'D5AE73','sandlight':'E9CB8F','sanddark':'AE804E','chalk':'F1DCAA','mortar':'96704B',
    'terracotta':'BA704B','copper':'B97D4B','copperlight':'D49F61','gold':'E5BD68','linen':'E6D5AC',
    'teal':'277F83','teallight':'51A5A2','tealdark':'1C555C','blue':'519EA6',
    'oak':'684534','oaklight':'9B6C43','oakdark':'3E3028','plank':'80573A','bamboo':'B4A35E',
    'jungleplaster':'A6926E','leaf':'3D7941','leaflight':'75A94D','leafdark':'23573D','lime':'98BE57',
    'jade':'388669','moss':'638448','fern':'60A14D','ferntip':'91BE61','flower':'CF7551',
    'cactus':'648F59','cactuslight':'9AB76A','cactusdark':'47754D','spine':'E1D6A3',
    'rock':'AE7954','rocklight':'C29468','rockdark':'875D49','fruit':'CD9151','black':'233D35',
    'autumn':'B67737','autumnlight':'D19A4B','autumndark':'80502E','snow':'DCE8E5','snowshade':'AFCBD2',
    'slate':'547789','slatedark':'354E5E','frostwood':'635447','frostlight':'A1957A',
    'rootstone':'626164','rootdark':'3D3E47','rootlight':'858079','violet':'685378','violetlight':'9B80B2',
}
HEX.update({'cream':'EEE0BD','pink':'D98AAE','pinklight':'F2BCD0','pinkdark':'A76491','sugar':'FBECD9','slime':'8DAF43','slimelight':'C4DC7D','slimedark':'56783C','gill':'AA9A76','water':'65AFA6','iron':'5D6D6B','ironlight':'A4B6AD','coal':'393B3A','ember':'D88B41'})
PALETTE = {key:tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,) for key,value in HEX.items()}
material=bpy.data.materials.new('Wild shared vertex palette');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.88
colour=material.node_tree.nodes.new('ShaderNodeVertexColor');colour.layer_name='WildTint'
material.node_tree.links.new(colour.outputs['Color'],shader.inputs['Base Color'])
roots=[];stats={}

class Model:
    def __init__(self,name,footprint):
        self.name=name;self.footprint=footprint;self.parts={};self.solids=[];self.part('decoration')
    def part(self,name):
        self.current=self.parts.setdefault(name,{'vertices':[],'faces':[],'colors':[]})
    def poly(self,tint,vertices,faces):
        p=self.current;n=len(p['vertices']);p['vertices'] += [xyz(*v) for v in vertices]
        p['faces'] += [tuple(n+i for i in f) for f in faces];p['colors'] += [PALETTE[tint]]*len(faces)
    def box(self,tint,x,y,z,w,h,d,turn=0):
        c,s=math.cos(turn),math.sin(turn)
        self.poly(tint,[(x+a*w/2*c+f*d/2*s,y+b*h/2,z-a*w/2*s+f*d/2*c)
            for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
            [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
    def beam(self,tint,start,end,width,depth=None):
        a,b=Vector(start),Vector(end);direction=(b-a).normalized()
        side=direction.cross(Vector((0,0,1)))
        if side.length<.01:side=direction.cross(Vector((1,0,0)))
        side.normalize();up=direction.cross(side).normalized();depth=depth or width
        verts=[tuple(p+side*u*width/2+up*v*depth/2) for p in (a,b) for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        self.poly(tint,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
    def leaf(self,tint,start,end,width):
        a,b=Vector(start),Vector(end);along=b-a;side=Vector((-along.z,0,along.x)).normalized()*width/2
        centre=a+along*.47;lift=Vector((0,width*.13,0))
        verts=[tuple(a),tuple(centre+side),tuple(b),tuple(centre-side),tuple(centre+lift),tuple(centre-lift*.35)]
        self.poly(tint,verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)])
    def finish(self,kind='prop'):
        parent=bpy.data.objects.new('feedback-'+self.name,None);library.collection.objects.link(parent)
        parent['contract']='Metres; Y up; +Z front; ground origin. Instance palette meshes; physical site walls follow shared colliders.'
        parent['assetKind']=kind;parent['width'],parent['depth']=self.footprint
        parent['solidFootprints']=json.dumps(self.solids,separators=(',',':'))
        if kind=='exterior':parent['doorWidth']=2.8;parent['doorHeight']=3.6
        triangles=0
        for name,p in self.parts.items():
            if not p['faces']:continue
            mesh=bpy.data.meshes.new(self.name+'-'+name);mesh.from_pydata(p['vertices'],[],p['faces']);mesh.materials.append(material)
            tint=mesh.color_attributes.new(name='WildTint',type='BYTE_COLOR',domain='CORNER')
            for face,col in zip(mesh.polygons,p['colors']):
                for index in face.loop_indices:tint.data[index].color=col
            mesh.update();obj=bpy.data.objects.new('feedback-'+self.name+'-'+name,mesh)
            library.collection.objects.link(obj);obj.parent=parent;obj['part']=name
            if name in ['water','flame']:obj['collision']='water' if name=='water' else 'effect'
            triangles+=sum(len(f)-2 for f in p['faces'])
        roots.append(parent)
        stats[self.name]={'triangles':triangles,'draws':len(parent.children),'footprint':self.footprint,'solids':self.solids}
        return parent

# Low-poly ring profiles keep organic silhouettes and hand-cut facets instead of boxes.
def profile(m,tints,x,z,rings,n=12,turn=0):
    vertices=[(x+math.cos(i*math.tau/n+turn)*r,y,z+math.sin(i*math.tau/n+turn)*r) for y,r in rings for i in range(n)]
    for level in range(len(rings)-1):
        for i in range(n):
            ids=[level*n+i,level*n+(i+1)%n,(level+1)*n+(i+1)%n,(level+1)*n+i]
            m.poly(tints[(i+level)%len(tints)],[vertices[j] for j in ids],[(0,3,2,1)])
    m.poly(tints[0],[vertices[i] for i in range(n)], [tuple(range(n))])
    m.poly(tints[0],[vertices[(len(rings)-1)*n+i] for i in range(n)], [tuple(reversed(range(n)))])

def mushroom(m,x,z,s=1):
    profile(m,['cream','gill','cream'],x,z,[(0,.40*s),(.24*s,.33*s),(1.7*s,.24*s),(2.1*s,.42*s)],10)
    profile(m,['gill','cream'],x,z,[(1.95*s,1.58*s),(2.12*s,1.84*s)],16)
    profile(m,['slime','slime','slimelight'],x,z,[(2.12*s,1.88*s),(2.4*s,1.68*s),(2.80*s,.98*s),(2.90*s,.25*s)],16)
    for i in range(16):
        a=i*math.tau/16;m.beam('gill',(x+math.cos(a)*.35*s,1.95*s,z+math.sin(a)*.35*s),(x+math.cos(a)*1.67*s,2.08*s,z+math.sin(a)*1.67*s),.055*s)
    for i in range(11):
        a=i*2.4;r=(.45+(i%3)*.35)*s
        m.box('cream',x+math.cos(a)*r,(2.84-r/s*.30)*s,z+math.sin(a)*r,.20*s,.06*s,.16*s,a)
    for i in range(6):
        a=i*math.tau/6;m.beam('gill',(x, .20*s,z),(x+math.cos(a)*.65*s,.055*s,z+math.sin(a)*.65*s),.14*s)

m=Model('slime-mushroom',[6.2,6.2]);mushroom(m,0,0,1.6)
for x,z,s in [(-1.25,.8,.35),(1.4,.7,.24),(-.7,-1.1,.20)]:mushroom(m,x,z,s)
for i in range(9):
    a=i*2.4;m.leaf('slimedark',(math.cos(a)*.7,.05,math.sin(a)*.7),(math.cos(a)*1.3,.4,math.sin(a)*1.3),.35)
m.finish('tree')

m=Model('candy-tree',[6.6,6.6]);b=m.box
for i in range(12):
    a=i*.30;x=math.sin(a)*.12;z=math.cos(a)*.12
    profile(m,['oak','oaklight','oak'],x,z,[(i*.28,.36-i*.014),((i+1)*.28,.35-i*.014)],8,a)
    b('cream',x+.23, i*.28+.10,z,.075,.14,.12,a)
for a,ht,r in [(0,3.7,1.55),(2.0,4.1,1.5),(4.1,4.0,1.6),(1.2,5.1,.40)]:
    x,z=math.cos(a)*r,math.sin(a)*r
    m.beam('oaklight',(0,2.3,0),(x,ht-.15,z),.22)
    profile(m,['pink','pinklight','pink','pinkdark'],x,z,[(ht-.7,.7),(ht-.35,1.30),(ht+.25,1.28),(ht+.75,.65),(ht+.85,.15)],10,a)
    for i in range(13):
        ang=i*2.4;rr=.5+(i%3)*.18
        b('sugar',x+math.cos(ang)*rr,ht+.67-(rr-.5)*.6,z+math.sin(ang)*rr,.13,.10,.09,ang)
    for i in range(4):
        ang=i*math.tau/4+a;px,pz=x+math.cos(ang),z+math.sin(ang)
        m.beam('cream',(px,ht-.35,pz),(px,ht-.65,pz),.04)
        profile(m,['pinklight','cream'],px,pz,[(ht-.81,.08),(ht-.68,.15),(ht-.58,.07)],6)
for i in range(7):
    a=i*math.tau/7;m.beam('oak',(0,.15,0),(math.cos(a)*1.1,.05,math.sin(a)*1.1),.25)
m.finish('tree')

m=Model('slime-pool',[3.6,2.9]);profile(m,['slimedark','slime'],0,0,[(0,1.25),(.04,1.45),(.08,1.15)],14)
for x,z,r in [(-.65,-.45,.30),(.55,.5,.20),(.35,-.40,.12)]:
    profile(m,['slime','slimelight'],x,z,[(.06,r*.85),(.18+r*.5,r),(.18+r,.02)],10)
for i in range(10):
    a=i*2.4;m.box('slimelight',math.cos(a)*.9,.085,math.sin(a)*.9,.16,.018,.10,a)
m.finish()

m=Model('sugar-cane',[1.4,1.4])
for x,z,h,a in [(-.3,0,1.4,0),(.4,.25,1.0,1.4)]:
    for i in range(10):m.box('pink' if i%2 else 'cream',x,(i+.5)*h/10,z,.17,h/10,.17,a)
    for i in range(8):
        t=i/7*math.pi;m.box('cream' if i%2 else 'pink',x+.22*(1-math.cos(t)),h+math.sin(t)*.24,z,.17,.13,.17,a)
    for i in range(4):
        t=i*math.tau/4;m.leaf('slimedark',(x,.10,z),(x+math.cos(t)*.43,.28,z+math.sin(t)*.43),.18)
m.finish()

# A four-metre wall module scales to the authoritative wall envelopes.
m=Model('site-wall',[4,3]);b=m.box;b('rootdark',0,1.95,0,4,3.9,2.94)
for row in range(7):
    for col in range(5):
        x=-1.6+col*.8+(row%2)*.16;x=max(-1.59,min(1.59,x))
        for side in [-1,1]:
            tint=['rootstone','rootlight','slate','rootstone'][(row*3+col)%4]
            b(tint,x,.30+row*.56,side*1.485,.77,.53,.03)
            if (row+col)%4==0:b('copper',x-.12,.34+row*.56,side*1.507,.20,.05,.015,.15)
for i in range(8):
    x=-1.75+i*.5;b('rootlight',x,3.98,0,.47,.16,2.98)
m.finish()

m=Model('mine-frame',[20,1.2]);b=m.box
for x in [-9,9]:
    b('oakdark',x,3.15,0,.80,6.30,.80)
    for y in [.5,1.5,2.5,3.5,4.5,5.5]:
        b('oaklight',x-.22,y,.42,.075,.73,.025)
    for y in [.35,4.6,5.75]:
        b('iron',x,y,0,.86,.20,.86)
        for dx in [-.23,.23]:b('ironlight',x+dx,y,.444,.075,.075,.028)
    m.beam('oaklight',(x,4.7,0),(x-math.copysign(1.4,x),6.0,0),.36)
b('oak',0,6.20,0,19.6,.75,.88)
for i in range(20):b('oaklight',-9.3+i*.98,6.43,.46,.45,.05,.025)
for x in [-8.75,8.75]:
    b('iron',x,4.8,.68,.28,.09,.70)
    b('iron',x,4.4,.95,.37,.61,.37);b('gold',x,4.4,.95,.28,.44,.28)
    for dx in [-.16,.16]:b('iron',x+dx,4.4,1.145,.03,.5,.03)
m.finish()

m=Model('cave-roof',[20,7]);b=m.box
for row in range(3):
    for i in range(10):b(['rootstone','rootdark','rootlight'][(i+row)%3],-9+i*2, .4+row*.4,-2.5+row*2.2,1.98,.8,2.3)
for i in range(11):
    x=-8.5+i*1.7;profile(m,['slate','slatedark'],x,(-1 if i%2 else 1.2),[(-.7-i%3*.18,.03),(.10,.28)],5)
m.finish()

m=Model('mine-track',[3,4]);b=m.box
for z in [-1.5,-.5,.5,1.5]:
    b('oakdark',0,.06,z,3,.12,.25)
    for x in [-1.2,1.2]:b('ironlight',x,.16,z,.20,.09,.18)
for x in [-1.2,1.2]:b('iron',x,.16,0,.12,.18,4)
m.finish()

m=Model('site-sign',[3,1]);b=m.box
for x in [-.9,.9]:
    b('oakdark',x,.85,0,.18,1.7,.22)
    for y in [.7,1.4]:b('oaklight',x+.08,y,.13,.025,.25,.015)
for i in range(3):b('oak',0,1.38+i*.25,0,2.7,.23,.19)
b('oaklight',0,2.03,0,3,.15,.38)
for x in [-1.13,1.13]:
    for y in [1.35,1.82]:b('ironlight',x,y,.11,.055,.055,.035)
b('cream',0,1.62,.115,1.65,.56,.025)
for i in range(3):b('oakdark',-.36+i*.34,1.63,.133,.22,.038,.009)
b('gold',.64,1.77,.139,.13,.13,.012)
m.finish()

m=Model('campfire',[2.7,2.6]);b=m.box
profile(m,['coal','rootdark'],0,0,[(0,1.04),(.04,.96)],14)
for i in range(12):
    a=i*math.tau/12;profile(m,['rootstone','rootlight'],math.cos(a),math.sin(a),[(.01,.17),(.16,.23),(.30,.12)],7,a)
for i in range(5):
    a=i*2.4;m.beam('coal',(math.cos(a)*.65,.18,math.sin(a)*.65),(-math.cos(a)*.6,.30,-math.sin(a)*.6),.21)
    b('ember',math.cos(a)*.38,.33,math.sin(a)*.38,.12,.05,.08,a)
# Original weathered sword, fine fuller, riveted hilt, ember wisps.
b('ironlight',.23,1.14,.13,.15,1.65,.065);b('iron',.23,1.13,.168,.032,1.52,.016)
b('gold',.23,1.63,.13,.62,.095,.13);b('oakdark',.23,1.86,.13,.105,.36,.11)
for i in range(5):b('oaklight',.23,1.72+i*.06,.191,.12,.02,.013)
b('gold',.23,2.09,.13,.16,.14,.16)
m.part('flame')
for x,z,h in [(-.18,0,.45),(.43,-.21,.28),(-.31,.21,.24)]:profile(m,['ember','gold'],x,z,[(.25,.15),(.4,.10),(.25+h,.01)],5)
m.finish()

m=Model('companion-crate',[1.6,1.6]);b=m.box
b('oakdark',0,.7,0,1.4,1.4,1.4)
for side in [-1,1]:
    for i in range(6):
        b('plank',-.56+i*.225,.7,side*.716,.215,1.20,.036)
        b('oaklight',side*.716,.7,-.56+i*.225,.036,1.20,.215)
    for y in [.15,1.25]:b('iron',0,y,side*.75,1.53,.17,.065)
    for x in [-.57,.57]:
        for y in [.15,1.25]:b('ironlight',x,y,side*.795,.065,.065,.026)
for i in range(6):b('plank',-.56+i*.225,1.42,0,.215,.04,1.40)
# Inset heart badge made of hand-cut stepped copper tiles.
for x,y,w in [(-.18,.93,.28),(.18,.93,.28),(0,.79,.62),(0,.63,.38),(0,.48,.17)]:b('pinklight',x,y,.82,w,.16,.06)
b('cream',-.19,.96,.855,.08,.05,.016)
m.finish()

m=Model('fishing',[2,2]);m.part('base');b=m.box
for i in range(5):
    b('plank',-.72+i*.36,.055,-.25,.34,.11,1.45)
    for z in [-.83,.30]:b('iron',-.72+i*.36,.115,z,.035,.025,.035)
# Slatted pail with water, metal bands and handle; wicker creel with woven strips.
profile(m,['oak','oaklight','plank'],-.52,.35,[(.1,.23),(.62,.30)],12)
profile(m,['iron'],-.52,.35,[(.14,.242),(.20,.25)],12)
profile(m,['iron'],-.52,.35,[(.55,.292),(.62,.308)],12)
m.part('water');profile(m,['water'],-.52,.35,[(.54,.272),(.55,.272)],12);m.part('base')
for side in [-1,1]:m.beam('iron',(-.52+side*.28,.52,.35),(-.52+side*.16,.84,.35),.035)
m.beam('oak',(-.68,.84,.35),(-.36,.84,.35),.07)
b('oakdark',.45,.29,.40,.62,.40,.54)
for i in range(9):
    for side in [-1,1]:b('cream',.45-.28+i*.07,.30,.40+side*.28,.034,.37,.025)
for i in range(6):
    for side in [-1,1]:b('oaklight',.45,.13+i*.065,.40+side*.30,.62,.031,.025)
b('oaklight',.45,.51,.40,.67,.06,.58)
b('iron',.45,.38,.73,.085,.13,.035)
m.part('yield')
for x,z,a in [(-.42,-.36,-.12),(.08,-.45,.08),(.52,-.25,-.30)]:
    b('water',x,.185,z,.23,.13,.57,a);b('cream',x,.247,z,.12,.025,.42,a)
    b('tealdark',x,.18,z-.32,.30,.075,.15,a);b('black',x+.118,.205,z+.17,.017,.032,.03)
    for i in range(4):b('teallight',x+.12,.195,z-.12+i*.07,.018,.045,.025,a)
root=m.finish('gathering')
for child in root.children:child['harvestable']=child.name.endswith('-yield')

EXPORT.parent.mkdir(parents=True,exist_ok=True);SOURCE.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)

# The editable gallery is separate from the shipped origin-aligned library.
gallery=bpy.data.scenes.new('Slimefen and Sugarbloom field study');bpy.context.window.scene=gallery
places={'slime-mushroom':(-8,0,0),'candy-tree':(0,0,0),'slime-pool':(-7,0,5),'sugar-cane':(0,0,5),'site-wall':(-9,0,-7),'mine-frame':(6,0,-9),'cave-roof':(5,7.0,-12),'mine-track':(5,0,-5),'site-sign':(10,0,4),'campfire':(-5,0,7),'companion-crate':(0,0,8),'fishing':(5,0,6)}
for root in roots:
    parent=root.copy();gallery.collection.objects.link(parent);parent.location=xyz(*places[root.name.removeprefix('feedback-')])
    for child in root.children:
        obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(0,-.2,-1));ground=bpy.context.object;ground.scale=(29,31,.35)
mat=bpy.data.materials.new('Gallery moss');mat.diffuse_color=PALETTE['leafdark'];ground.data.materials.append(mat)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(28,26,37));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=40;aim(camera,(0,2,-1));gallery.camera=camera
for at,power,size in [((-12,20,14),2400,12),((14,14,-10),1400,10)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,2,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-10,20,12));sun=bpy.context.object;sun.data.energy=2;sun.data.angle=.20;aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('Wild biome daylight');gallery.world.use_nodes=True;gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.28,.31,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
gallery.render.engine='CYCLES';gallery.cycles.samples=24;gallery.cycles.use_denoising=True
gallery.render.resolution_x=1800;gallery.render.resolution_y=1300;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW);gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('WORLD_FEEDBACK_ASSETS '+json.dumps({'models':stats,'bytes':EXPORT.stat().st_size}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
