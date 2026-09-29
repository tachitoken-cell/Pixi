"""Original Blender city furnishings; metre-scale, Y-up, +Z-front ground origins.
Blender --background --python scripts/build-city-furnishings.py -- --render
No world placements are baked; runtime owns approved footprints and collision.
"""
import bpy, json, math, subprocess, sys, tempfile
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/city-furnishings.glb'
SOURCE=ROOT/'assets/source/city-furnishings.blend'
PREVIEW=ROOT/'assets/source/city-furnishings-preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
library=bpy.context.scene;library.name='Lanternreach furnishings library';library.unit_settings.system='METRIC'
def xyz(x,y,z):return x,-z,y
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
HEX={'oak':'795338','oaklight':'B08252','oakdark':'493729','plank':'9C7249','cream':'E1CCA0','linen':'E4DBC0',
     'stone':'8B8D7C','stonebright':'B0AA92','stoneshade':'5C6962','iron':'354746','teal':'36746A','gold':'DFB35F',
     'amber':'F4D38B','wine':'9C4F54','leaf':'648647','leaflight':'93B562','leafdark':'385B37','blue':'6DA9AD',
     'crystal':'AD9AD9','violet':'665D9B','shadow':'302F2B','silver':'B4C5C3','moss':'556B39','mosslight':'81954C'}
PAL={name:tuple(linear(int(hex[i:i+2],16)/255) for i in (0,2,4))+(1,) for name,hex in HEX.items()}
material=bpy.data.materials.new('City furnishings vertex palette');material.use_nodes=True
shader=material.node_tree.nodes['Principled BSDF'];shader.inputs['Roughness'].default_value=.81
tint=material.node_tree.nodes.new('ShaderNodeVertexColor');tint.layer_name='FurnishingTint'
material.node_tree.links.new(tint.outputs['Color'],shader.inputs['Base Color'])
roots=[];stats={}
class Model:
    def __init__(self,name,w,d):self.name=name;self.w=w;self.d=d;self.v=[];self.f=[];self.c=[]
    def box(self,t,x,y,z,w,h,d,turn=0):
        n=len(self.v);c,s=math.cos(turn),math.sin(turn)
        self.v.extend(xyz(x+a*w/2*c+k*d/2*s,y+b*h/2,z-a*w/2*s+k*d/2*c) for a,b,k in
            [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)])
        self.f.extend(tuple(n+i for i in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
        self.c.extend([PAL[t]]*6)
    def disc(self,t,x,y,z,r,depth,sides=12):
        n=len(self.v)
        for zz in [-depth/2,depth/2]:
            self.v.extend(xyz(x+math.cos(i*math.tau/sides)*r,y+math.sin(i*math.tau/sides)*r,z+zz) for i in range(sides))
        faces=[tuple(reversed(range(sides))),tuple(sides+i for i in range(sides))]
        faces += [(i,(i+1)%sides,sides+(i+1)%sides,sides+i) for i in range(sides)]
        self.f.extend(tuple(n+i for i in f) for f in faces);self.c.extend([PAL[t]]*len(faces))
    def book(self,x,y,z,w,h,d,t='teal'):
        b=self.box;b(t,x,y,z,w,h,d);b('linen',x,y,z+.02,w*.84,h*.90,d+.01)
        for yy in [y-h/2,y+h/2]:b(t,x,yy,z,w+.03,.035,d+.05)
        b(t,x-w/2+.025,y,z,.05,h,d+.04);b('gold',x-w/2+.020,y+h*.25,z+d/2+.03,.035,.055,.012)
    def coins(self,x,y,z,count=4):
        for i in range(count):self.box('gold' if i%2 else 'amber',x+(i%2)*.025,y+i*.045,z,.18,.043,.18,math.pi/4)
    def finish(self):
        if self.name=='bank-vault':
            # The raised lock and hinge relief is included inside the approved .6m depth.
            low=min(v[1] for v in self.v);high=max(v[1] for v in self.v);middle=(low+high)/2
            self.v=[(x,(y-middle)*self.d/(high-low),z) for x,y,z in self.v]
        parent=bpy.data.objects.new('furnishing-'+self.name,None);library.collection.objects.link(parent)
        parent['width']=self.w;parent['depth']=self.d
        parent['contract']='Metres; Y up; +Z front; ground origin; runtime supplies world placement.'
        parent['solidFootprints']=json.dumps([] if self.name=='bank-crest' else [[0,0,self.w,self.d]],separators=(',',':'))
        mesh=bpy.data.meshes.new(parent.name);mesh.from_pydata(self.v,[],self.f);mesh.materials.append(material)
        tint=mesh.color_attributes.new(name='FurnishingTint',type='BYTE_COLOR',domain='CORNER')
        for face,col in zip(mesh.polygons,self.c):
            for index in face.loop_indices:tint.data[index].color=col
        mesh.update();obj=bpy.data.objects.new(parent.name+'-detail',mesh);library.collection.objects.link(obj);obj.parent=parent;obj['part']='interior-furniture'
        roots.append(parent);stats[self.name]={'triangles':sum(len(f)-2 for f in self.f),'footprint':[self.w,self.d]}

m=Model('auction-reading-desk',4,1.2);b=m.box
for x in [-1.68,1.68]:
    for z in [-.42,.42]:b('oakdark',x,.51,z,.22,1.02,.22);b('gold',x,.16,z,.23,.08,.23)
b('oak',0,.78,0,3.88,.30,1.08);b('oaklight',0,1,0,4,.16,1.2);b('teal',0,1.094,0,2.50,.028,.89)
for side in [-1,1]:
    b('linen',side*.27,1.145,.07,.52,.065,.70,side*.045)
    for i in range(5):b('oaklight',side*.27,1.182,-.18+i*.1,.33,.006,.012)
m.book(-1.32,1.30,-.12,.40,.40,.43,'wine');m.book(-.92,1.22,-.1,.31,.22,.41,'teal')
b('iron',1.22,1.16,.01,.18,.16,.18);b('linen',1.24,1.35,.01,.035,.33,.10)
b('gold',1.70,1.16,-.28,.26,.13,.25);b('linen',1.70,1.38,-.28,.13,.35,.13);b('amber',1.70,1.61,-.28,.075,.13,.075)
m.finish()

m=Model('auction-bookcase',1.2,4);b=m.box
# The narrow long shelf faces both +/-X, so either hall wall placement is valid.
b('oakdark',0,1.75,0,.12,3.5,3.92)
for z in [-1.88,1.88]:b('oak',0,1.78,z,1.15,3.56,.18)
for y in [.14,1.05,1.97,2.89,3.58]:b('oaklight',0,y,0,1.2,.16,4)
for side in [-1,1]:
    for row in range(3):
        for i in range(10):
            z=-1.58+i*.34;h=.58+(i%3)*.08;col=['teal','wine','oaklight','violet'][((row+i)%4)]
            b(col,side*.32,.27+row*.92+h/2,z,.47,h,.25)
            b('gold',side*.565,.45+row*.92,z,.02,.055,.22)
            if i%3==0:b('linen',side*.573,.27+row*.92+h*.67,z,.019,.17,.12)
for z in [-1.88,1.88]:b('gold',.587,3.24,z,.025,.14,.12)
m.finish()

m=Model('auction-display-case',3,1.4);b=m.box
for x in [-1.26,1.26]:
    for z in [-.50,.50]:b('oakdark',x,.38,z,.18,.76,.18)
b('oak',0,.74,0,2.94,.25,1.33);b('gold',0,.90,0,3,.10,1.4);b('teal',0,.965,0,2.80,.03,1.22)
for x in [-.92,0,.92]:
    b('stonebright',x,1.03,0,.55,.13,.59)
    if x<0:m.coins(x,1.12,0,5);m.coins(x+.2,1.12,.18,3)
    elif x==0:
        for i,w in enumerate([.15,.27,.34,.27,.16]):b('crystal' if i%2 else 'violet',x,1.16+i*.1,0,w,.11,w)
    else:b('silver',x,1.18,0,.42,.13,.32);b('gold',x,1.28,0,.14,.11,.14)
for x in [-1.39,1.39]:
    for z in [-.59,.59]:b('gold',x,1.29,z,.065,.67,.065)
for z in [-.59,.59]:b('blue',0,1.60,z,2.83,.055,.05)
for x in [-1.39,1.39]:b('blue',x,1.60,0,.05,.055,1.23)
m.finish()

m=Model('auction-bench',3.2,.8);b=m.box
for x in [-1.32,1.32]:b('oakdark',x,.39,0,.23,.78,.62)
for z in [-.24,0,.24]:b('oaklight',0,.76,z,3.2,.17,.21)
for x in [-1.39,0,1.39]:b('oakdark',x,1.03,-.31,.13,1.0,.14)
b('oak',0,1.40,-.31,3.2,.36,.16);b('gold',0,1.43,-.21,.28,.10,.04)
m.finish()

m=Model('bank-counter',4.4,.9);b=m.box
b('oakdark',0,.56,0,4.30,1.12,.83)
for i in range(11):b('oaklight' if i%3==0 else 'oak',-2+(i+.5)*4/11,.56,.427,4/11-.025,1.02,.04)
for x in [-2,0,2]:b('gold',x,.65,.427,.12,.78,.045)
b('oaklight',0,1.15,0,4.4,.18,.9);b('teal',0,1.25,0,2.7,.024,.70)
m.book(-.15,1.34,.02,.76,.12,.50,'teal')
for x,z,n in [(-1.30,.04,6),(-1.57,.14,4),(-1.08,.15,3),(1.35,.10,5)]:m.coins(x,1.29,z,n)
b('iron',.67,1.36,0,.23,.20,.21);b('linen',.68,1.53,0,.045,.29,.10)
b('gold',1.76,1.37,-.10,.48,.23,.40);b('iron',1.76,1.38,.12,.09,.14,.025)
m.finish()

m=Model('bank-vault',4,.6);b=m.box
b('stoneshade',0,2.2,0,4,4.4,.6);b('stonebright',0,2.2,.19,3.78,4.18,.15)
b('iron',0,2.20,.265,3.25,3.76,.07)
for yy in [.49,3.91]:b('gold',0,yy,.31,3.33,.15,.03)
for x in [-1.59,1.59]:b('gold',x,2.20,.31,.15,3.45,.03)
m.disc('stoneshade',0,2.20,.33,1.36,.035);m.disc('gold',0,2.20,.36,1.08,.04);m.disc('iron',0,2.20,.39,.87,.025)
for i in range(8):
    a=i*math.tau/8;x=math.cos(a)*.62;y=2.20+math.sin(a)*.62
    b('silver',x,y,.425,.20,.20,.025)
m.disc('gold',0,2.20,.445,.33,.04);b('shadow',0,2.20,.47,.08,.19,.014)
for side in [-1,1]:
    for yy in [1.05,3.36]:b('silver',side*1.53,yy,.35,.38,.22,.06)
m.finish()

m=Model('bank-crest',1.5,.25);b=m.box
m.disc('oakdark',0,.75,0,.75,.16);m.disc('gold',0,.75,.09,.65,.08);m.disc('teal',0,.75,.14,.53,.04)
for yy,w in [(.46,.71),(.67,.63),(.88,.49)]:b('amber',0,yy,.18,w,.14,.07)
b('gold',0,1.08,.18,.70,.12,.07);b('linen',0,1.21,.18,.17,.17,.07)
m.finish()

m=Model('bush-planter',2.4,1.2);b=m.box
b('stoneshade',0,.25,0,2.3,.5,1.1)
for side in [-1,1]:b('stonebright',0,.47,side*.53,2.4,.14,.14)
for side in [-1,1]:b('stonebright',side*1.13,.47,0,.14,.14,1.2)
b('oakdark',0,.48,0,2.15,.10,.95)
for x in [-.80,-.4,0,.4,.8]:
    for z in [-.23,.23]:
        y=.86+(.13 if x==0 else .03);b('leaf' if x!=0 else 'leaflight',x,y,z,.50,.62,.48)
        b('leaflight',x-.07,y+.34,z-.03,.34,.14,.32)
        if x in [-.8,.8]:b('wine',x+.12,y+.28,z+.2,.14,.14,.14)
m.finish()

m=Model('lantern-statue',2.8,2.8);b=m.box
b('stoneshade',0,.16,0,2.8,.32,2.8);b('stonebright',0,.43,0,2.47,.22,2.47);b('stone',0,.83,0,1.83,.58,1.83)
for side in [-1,1]:
    b('stonebright',side*.36,1.38,.18,.53,.52,.86)
    b('stone',side*.35,1.9,0,.51,.76,.53)
b('stone',0,2.73,0,1.33,1.35,.74);b('stonebright',0,3.29,.09,1.52,.36,.85)
b('stonebright',0,3.87,0,.87,.97,.76);b('stoneshade',0,4.06,-.13,1.04,.70,.85)
b('stonebright',0,3.97,.34,.54,.55,.14);b('stoneshade',0,3.96,.42,.43,.085,.035)
for side in [-1,1]:
    b('stone',side*.84,3.11,.15,.40,.78,.44)
    b('stonebright',side*.85,2.84,.52,.38,.32,.69)
# Raised lantern rests in both hands; the bowl/figure remain one bounded draw.
b('gold',0,2.77,.89,.93,.16,.66);b('amber',0,3.18,.89,.64,.69,.48)
for side in [-1,1]:b('gold',side*.39,3.18,.89,.10,.87,.63)
b('gold',0,3.64,.89,1.03,.16,.72);b('gold',0,3.85,.89,.17,.32,.16)
for i in range(7):b('moss' if i%2 else 'mosslight',-.75+i*.24,1.14,.78,.28,.17,.17)
m.finish()

m=Model('courtyard-tree',3,3);b=m.box
b('stoneshade',0,.22,0,3,.44,3);b('stonebright',0,.49,0,3,.14,3);b('oakdark',0,.58,0,2.73,.08,2.73)
for i in range(10):b('oak' if i%3 else 'oaklight',math.sin(i*.4)*.10,.91+i*.49,0,.66-i*.015,.50,.65-i*.014)
for side in [-1,1]:
    for i in range(4):b('oak',side*(.27+i*.3),4.15+i*.34,side*.16,.40,.48,.41)
for x,y,z,size in [(-1.22,5.9,0,2.5),(1.14,6.15,.20,2.5),(0,6.9,-.66,2.65),(0,7.50,.32,1.85)]:
    for row,scale in [(-1,.75),(0,1),(1,.74)]:
        for ix in range(3):
            for iz in range(3):
                if abs(ix-1)+abs(iz-1)>1 and row!=0:continue
                b('leaflight' if (ix+iz+row)%3==0 else 'leaf',x+(ix-1)*size/3*scale,y+row*.33,z+(iz-1)*size/3*scale,size/3*scale,.36,size/3*scale)
for x,z in [(-1,-1),(1,.85),(-.85,1)]:b('mosslight',x,.73,z,.59,.23,.51)
m.finish()

EXPORT.parent.mkdir(parents=True,exist_ok=True);SOURCE.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
    export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
cli=['npx','--yes','@gltf-transform/cli@4.5.0']
with tempfile.TemporaryDirectory(prefix='mossvale-furnishings-') as tmp:
    a,b,c=[str(Path(tmp)/f'{i}.glb') for i in range(3)]
    for args in [['weld',str(EXPORT),a],['quantize',a,b,'--pattern','{POSITION,NORMAL,COLOR_*}','--quantize-position','16','--quantize-normal','8','--quantize-color','8'],['dedup',b,c],['prune',c,str(EXPORT)]]:subprocess.run(cli+args,check=True)
gallery=bpy.data.scenes.new('Lanternreach furnishing study');bpy.context.window.scene=gallery
places={'auction-reading-desk':(-7,0,3),'auction-bookcase':(-11,0,-2),'auction-display-case':(-3,0,4),'auction-bench':(-7,0,7),
 'bank-counter':(3,0,3),'bank-vault':(3,0,-1),'bank-crest':(3,5,-1),'bush-planter':(7,0,7),'lantern-statue':(11,0,2),'courtyard-tree':(10,0,-6)}
for root in roots:
    parent=root.copy();gallery.collection.objects.link(parent);parent.location=xyz(*places[root.name.removeprefix('furnishing-')])
    for child in root.children:
        obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.name='Gallery ground - not exported'
mat=bpy.data.materials.new('Gallery paving');mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.13,.16,.12,1);ground.data.materials.append(mat)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(29,24,35));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=37;aim(camera,(0,2,0));gallery.camera=camera
for at,power,size in [((-18,25,20),5500,18),((20,18,-8),3000,12)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,2,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-15,25,15));sun=bpy.context.object;sun.data.energy=1.8;sun.data.angle=.18;aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('City furnishing daylight');gallery.world.use_nodes=True;gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
gallery.render.resolution_x=1800;gallery.render.resolution_y=1200;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW);gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('CITY_FURNISHINGS '+json.dumps({'models':stats,'bytes':EXPORT.stat().st_size}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
