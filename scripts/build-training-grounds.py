"""Original Mossvale class practice props. Rebuild with installed Blender:
Blender --background --python scripts/build-training-grounds.py -- --render
Metres; ground Y0; +Z front. Runtime owns layout, hit reactions and collision.
One shared vertex palette, 11 roots / 13 meshes; no external textures or models.
"""
import bpy, json, math, subprocess, sys, tempfile, struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/training-grounds.glb'
SOURCE = ROOT / 'assets/source/training-grounds.blend'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
library = bpy.context.scene; library.name = 'Mossvale training prop library'
library.unit_settings.system = 'METRIC'
def xyz(x, y, z): return (x, -z, y)
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
HEX = {'oak':'795338','oaklight':'AD8151','oakdark':'493729','plank':'946B45',
       'cream':'E4DBC0','ivory':'F1E9CC','stone':'858B7C','stonebright':'B5B69C','stoneshade':'5C6B65',
       'iron':'354746','steel':'8DA6AD','silver':'C3D5D1','gold':'D5A84E','amber':'F8D98C',
       'red':'B35444','navy':'3C596C','teal':'337769','leaf':'648647','leaflight':'95B563','leafdark':'385B37',
       'straw':'C8AB59','strawlight':'E0CA82','strawdark':'937439','leather':'845A3B',
       'violet':'66549D','purple':'9F7CBF','crystal':'B4A0E0','cyan':'74C6C5','cyanglow':'C0EAE1',
       'water':'4B8F98','waterlight':'7BBEB5','ink':'354445'}
PAL = {k:tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,) for k,h in HEX.items()}
material = bpy.data.materials.new('Training oak stone brass vertex palette'); material.use_nodes=True
shader=material.node_tree.nodes['Principled BSDF']; shader.inputs['Roughness'].default_value=.79
tint=material.node_tree.nodes.new('ShaderNodeVertexColor'); tint.layer_name='TrainingTint'
material.node_tree.links.new(tint.outputs['Color'],shader.inputs['Base Color'])
roots={}; metrics={}

class Model:
    def __init__(self,name,width,depth,height,aim=None):
        self.name='training-'+name; self.limit=(width,height,depth); self.parts={}; self.part('body')
        self.aim=aim
    def part(self,name,pivot=(0,0,0)):
        self.active=name
        self.parts.setdefault(name,{'vertices':[],'faces':[],'colors':[],'pivot':pivot})
    def mesh(self,vertices,faces,tint):
        p=self.parts[self.active]; start=len(p['vertices']); px,py,pz=p['pivot']
        p['vertices'].extend(xyz(x-px,y-py,z-pz) for x,y,z in vertices)
        p['faces'].extend(tuple(start+i for i in f) for f in faces)
        p['colors'].extend([PAL[tint]]*len(faces))
    def box(self,t,x,y,z,w,h,d,turn=0):
        c,s=math.cos(turn),math.sin(turn)
        self.mesh([(x+a*w/2*c+k*d/2*s,y+b*h/2,z-a*w/2*s+k*d/2*c) for a,b,k in
                  [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
                  [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],t)
    def beam(self,t,a,b,width,depth=None):
        # A square beam, including real diagonals rather than jagged overlapping cubes.
        a,b=Vector(a),Vector(b); axis=(b-a).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.01:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u).normalized(); depth=depth or width
        points=[tuple(end+u*i*width/2+v*j*depth/2) for end in [a,b] for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        self.mesh(points,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],t)
    def disc(self,t,x,y,z,r,depth,sides=12):
        # Front faces +Z. Ring layers have different depths, preventing coplanar seams.
        vs=[(x+math.cos(i*math.tau/sides)*r,y+math.sin(i*math.tau/sides)*r,z+dz) for dz in [-depth/2,depth/2] for i in range(sides)]
        fs=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        self.mesh(vs,fs,t)
    def column(self,t,x,y,z,r,height,sides=8):
        vs=[(x+math.cos(i*math.tau/sides+math.pi/8)*r,y+dy,z+math.sin(i*math.tau/sides+math.pi/8)*r) for dy in [-height/2,height/2] for i in range(sides)]
        fs=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        self.mesh(vs,fs,t)
    def gem(self,t,x,y,z,w,h,d):
        vs=[(x,y-h/2,z),(x,y+h/2,z),(x-w/2,y-h*.17,z-d*.12),(x,y-h*.25,z-d/2),(x+w/2,y-h*.17,z-d*.12),
            (x+w*.36,y+h*.17,z+d*.32),(x-w*.36,y+h*.17,z+d*.32)]
        self.mesh(vs,[(0,3,2),(0,4,3),(0,5,4),(0,6,5),(0,2,6),(1,2,3),(1,3,4),(1,4,5),(1,5,6),(1,6,2)],t)
    def sword(self,x,y,z,scale=1):
        self.box('steel',x,y+.37*scale,z,.13*scale,.66*scale,.07*scale)
        self.box('silver',x-.045*scale,y+.37*scale,z+.041*scale,.035*scale,.65*scale,.02*scale)
        self.gem('silver',x,y+.75*scale,z,.13*scale,.15*scale,.07*scale)
        self.box('gold',x,y+.02*scale,z,.40*scale,.075*scale,.12*scale)
        self.box('leather',x,y-.16*scale,z,.10*scale,.28*scale,.09*scale)
        for yy in [-.26,-.17,-.08]:self.box('oakdark',x,y+yy*scale,z,.105*scale,.035*scale,.10*scale)
        self.box('gold',x,y-.33*scale,z,.15*scale,.08*scale,.12*scale)
    def bow(self,x,y,z,scale=1):
        points=[(x+dx*scale,y+dy*scale,z) for dx,dy in [(0,-.6),(.18,-.47),(.29,-.23),(.31,0),(.29,.23),(.18,.47),(0,.6)]]
        for a,b in zip(points,points[1:]):self.beam('oaklight',a,b,.065*scale,.065*scale)
        self.beam('cream',points[0],points[-1],.016*scale,.016*scale)
        self.box('leather',x+.31*scale,y,z,.085*scale,.22*scale,.08*scale)
    def leaf(self,x,y,z,scale=1,t='gold'):
        for i,w in enumerate([.11,.25,.37,.43,.30,.15]):self.box(t,x+(i-2.5)*.045*scale,y+(i-2.5)*.085*scale,z,w*scale,.086*scale,.055*scale)
        self.beam('amber' if t=='gold' else 'leaflight',(x-.14*scale,y-.29*scale,z+.035*scale),(x+.14*scale,y+.29*scale,z+.035*scale),.023*scale)
    def book(self,x,y,z,w=.7,h=.10,d=.58):
        self.box('teal',x,y,z,w,h,d)
        self.box('cream',x,y+.018,z+.015,w-.04,h-.045,d-.01)
        for yy in [-h/2,h/2]:self.box('teal',x,y+yy,z,w+.025,.023,d+.025)
    def finish(self):
        parent=bpy.data.objects.new(self.name,None);library.collection.objects.link(parent)
        parent['width']=self.limit[0];parent['depth']=self.limit[2];parent['height']=self.limit[1]
        parent['contract']='Metres; ground Y0; +Z front. Preserve all authored child matrices.'
        if self.aim:parent['aimPoint']=list(self.aim)
        triangles=0; bounds=[]; draws=0
        for role,data in self.parts.items():
            if not data['vertices']:continue
            mesh=bpy.data.meshes.new(self.name+'-'+role);mesh.from_pydata(data['vertices'],[],data['faces']);mesh.materials.append(material);mesh.update()
            vc=mesh.color_attributes.new(name='TrainingTint',type='BYTE_COLOR',domain='CORNER')
            for face,color in zip(mesh.polygons,data['colors']):
                for index in face.loop_indices:vc.data[index].color=color
            child=bpy.data.objects.new(mesh.name,mesh);library.collection.objects.link(child);child.parent=parent;child.location=xyz(*data['pivot']);child['part']=role
            for co in mesh.vertices:
                v=co.co+child.location;bounds.append((v.x,v.z,-v.y))
            triangles+=sum(len(f)-2 for f in data['faces']);draws+=1
        low=[min(p[i] for p in bounds) for i in range(3)];high=[max(p[i] for p in bounds) for i in range(3)]
        size=[high[i]-low[i] for i in range(3)]
        assert low[1]>=-.001,(self.name,low)
        assert all(size[i]<=self.limit[i]+.002 for i in range(3)),(self.name,size,self.limit)
        assert all(abs(p[i])<=self.limit[i]/2+.002 for p in bounds for i in [0,2]),(self.name,'uncentered footprint')
        roots[self.name]=parent;metrics[self.name]={'triangles':triangles,'meshes':draws,'bounds':{'min':low,'max':high},'aim':self.aim}

# Knight: weighted crossed stand, burlap torso with bound straw arms and patched head.
m=Model('dummy',1.6,1,2.4,(0,1.55,.27));m.part('base');b=m.box
b('oakdark',0,.09,0,1.25,.18,.48);b('oak',0,.12,0,.42,.20,1)
b('oak',0,.69,0,.19,1.28,.20)
for side in [-1,1]:m.beam('oaklight',(side*.53,.18,0),(side*.09,.87,0),.095)
m.part('strike',(0,1.2,0));b=m.box
b('strawdark',0,1.50,0,.76,.66,.40);b('straw',0,1.55,.035,.68,.66,.43)
b('strawlight',0,1.94,0,.43,.17,.36);b('straw',0,2.13,.005,.54,.43,.45)
b('strawlight',0,2.35,.015,.47,.10,.39)
for side in [-1,1]:
    b('straw',side*.56,1.72,0,.46,.28,.32);b('oakdark',side*.64,1.72,.004,.065,.31,.345)
    for i in range(4):b('strawlight',side*(.67+i*.024),1.74-(i%2)*.06,.01,.046,.25,.28)
    b('ink',side*.12,2.18,.239,.07,.065,.017)
b('oakdark',0,1.28,.026,.74,.065,.45);b('cream',0,1.81,.036,.69,.053,.44)
b('red',0,1.57,.266,.26,.28,.032);b('gold',0,1.57,.287,.09,.10,.018)
for i in range(4):b('cream',-.115+i*.075,1.43,.286,.025,.049,.015)
b('oakdark',0,2.04,.241,.15,.025,.02)
m.finish()

# Ranger: sheltered plank backstop with an unmistakable concentric straw bullseye.
m=Model('archery-target',2.5,1,2.5,(0,1.58,.39));b=m.box
for x in [-1.06,1.06]:
    b('oakdark',x,.10,0,.36,.20,.94);b('oak',x,1.27,-.18,.18,2.34,.20)
    b('gold',x,.36,-.055,.20,.055,.065)
for i in range(9):b('plank' if i%3 else 'oaklight',-1.08+i*.27,1.61,-.255,.26,1.44,.15)
for y in [.99,2.29]:b('oakdark',0,y,-.36,2.40,.13,.14)
b('oaklight',0,2.435,-.04,2.5,.13,.80)
for i,(r,t) in enumerate([(.86,'oakdark'),(.81,'strawdark'),(.74,'straw'),(.62,'cream'),(.47,'red'),(.32,'cream'),(.18,'red'),(.077,'gold')]):
    m.disc(t,0,1.58,.125+i*.032,r,.082)
for i in range(12):
    a=i*math.tau/12;m.box('strawlight',math.cos(a)*.77,1.58+math.sin(a)*.77,.22,.06,.047,.036,turn=a)
m.finish()

# Mage: carved plinth and floating asymmetrical crystal, separated for runtime bob.
m=Model('arcane-target',2,2,2.8,(0,1.92,0));m.part('base');b=m.box
m.column('stoneshade',0,.10,0,1.05,.20);m.column('stone',0,.235,0,.91,.11)
m.column('violet',0,.34,0,.70,.10);m.column('gold',0,.425,0,.64,.07)
m.column('stonebright',0,.55,0,.59,.19);m.column('violet',0,.70,0,.65,.11)
for i in range(8):
    a=i*math.tau/8;m.box('cyan',math.cos(a)*.62,.768,math.sin(a)*.62,.11,.026,.11,turn=a)
for side in [-1,1]:
    b('stone',side*.61,.87,0,.18,.33,.23);b('gold',side*.61,1.025,0,.21,.055,.25)
    m.gem('cyan',side*.61,1.19,0,.14,.28,.15)
m.part('crystal',(0,1.92,0))
m.gem('violet',0,1.88,0,.86,1.44,.75)
m.gem('crystal',-.08,1.96,.09,.56,1.42,.50)
m.gem('cyanglow',-.16,2.08,.22,.18,.73,.12)
for side in [-1,1]:m.gem('cyan',side*.43,1.69,.08,.22,.63,.28)
m.finish()

# Cleric: a broad stone basin, ivory buttresses and radiant leaf crest.
m=Model('healing-shrine',2.4,1.4,2.6,(0,1.90,0));b=m.box
b('stoneshade',0,.10,0,2.4,.20,1.4);b('stone',0,.23,0,2.18,.16,1.2)
for side in [-1,1]:
    b('stonebright',side*.82,.65,0,.36,.76,.87);b('gold',side*.82,.69,0,.375,.07,.89)
b('stone',0,.56,-.38,1.31,.66,.28);b('stonebright',0,.94,0,2.14,.18,1.24)
# Four raised lips leave the turquoise basin visibly recessed.
for x in [-.99,.99]:b('ivory',x,1.10,0,.16,.17,1.21)
for z in [-.53,.53]:b('ivory',0,1.10,z,1.84,.17,.16)
b('water',0,1.041,0,1.78,.035,.88)
for i in range(5):b('waterlight',-.65+i*.30,1.063,-.22+(i%2)*.18,.22,.012,.04)
b('teal',0,.74,.493,.43,.39,.034);m.leaf(0,.75,.523,.48)
b('stonebright',0,1.39,-.32,.33,.67,.34);b('gold',0,1.51,-.32,.45,.10,.43)
m.disc('gold',0,1.97,-.13,.51,.075);m.disc('teal',0,1.97,-.072,.42,.052)
for i in range(8):
    a=i*math.tau/8;m.beam('gold',(math.cos(a)*.47,1.97+math.sin(a)*.47,-.10),(math.cos(a)*.61,1.97+math.sin(a)*.61,-.10),.075)
m.leaf(0,1.99,.001,1.15,'gold');m.gem('cyanglow',0,1.87,.10,.22,.41,.15)
m.finish()

# Knight equipment rack: three real practice swords and a shield on a pegged frame.
m=Model('weapon-rack',2.6,1,2.2);b=m.box
for x in [-1.10,1.10]:b('oakdark',x,.075,0,.38,.15,1);b('oak',x,1.07,-.19,.15,2.08,.17)
for y in [.53,1.83]:b('oaklight',0,y,-.19,2.49,.15,.20)
m.beam('oakdark',(-1.0,.53,-.28),(1.0,1.81,-.28),.11)
for x in [-.84,-.32,.20]:m.sword(x,1.09,.05,.96);b('gold',x,1.82,-.01,.06,.12,.31)
m.disc('oakdark',.84,1.12,.095,.37,.15,8);m.disc('navy',.84,1.12,.20,.31,.06,8)
b('gold',.84,1.12,.241,.10,.46,.035);b('gold',.84,1.15,.242,.41,.075,.035)
m.finish()

# Ranger supplies: two hooked bows, a leather arrow bin and separately visible shafts.
m=Model('arrow-rack',2.2,1,1.7);b=m.box
for x in [-.92,.92]:b('oakdark',x,.08,0,.34,.16,1);b('oak',x,.84,-.25,.13,1.55,.16)
for y in [.43,1.52]:b('oaklight',0,y,-.25,2.15,.12,.19)
for x in [-.85,-.37]:m.bow(x,.89,-.09,.97)
b('leather',.60,.51,.09,.61,.81,.51);b('oakdark',.60,.91,.09,.68,.09,.57)
for y in [.25,.75]:b('gold',.60,y,.10,.63,.057,.54)
for i in range(6):
    x=.37+(i%3)*.20;z=-.03+(i//3)*.22;h=1.27+(i%3)*.12
    b('oaklight',x,.8+(h-.8)/2,z,.031,h-.8,.031)
    b('cream',x,h+.015,z,.072,.22,.026);b('red' if i%2 else 'leaf',x,h+.10,z+.016,.076,.052,.012)
m.finish()

# Shared reading lectern: sturdy angled book board, open pages, brass corners and ink.
m=Model('lectern',1.3,1.1,1.7);b=m.box
b('oakdark',0,.095,0,1.08,.19,.91);b('oak',0,.60,-.08,.26,1.06,.27)
for side in [-1,1]:m.beam('oaklight',(side*.46,.19,.0),(side*.08,.95,-.08),.10)
b('oaklight',0,1.26,0,1.30,.13,1.10)
b('gold',0,1.17,.51,1.18,.07,.045)
for side in [-1,1]:
    b('violet',side*.245,1.354,-.02,.48,.095,.68,side*.035)
    b('cream',side*.245,1.414,-.02,.43,.036,.62,side*.035)
    for i in range(4):b('ink',side*.245,1.438,-.19+i*.105,.29,.009,.016)
b('gold',0,1.43,-.02,.034,.041,.69)
b('iron',.49,1.45,.35,.14,.22,.14);m.beam('cream',(.49,1.49,.35),(.57,1.69,.30),.025,.06)
m.finish()

# Four equally sized, distinctly colored class banners with geometric heraldry.
for cls,color in [('knight','navy'),('ranger','leafdark'),('mage','violet'),('cleric','teal')]:
    m=Model('class-banner-'+cls,1.2,.7,3.2);b=m.box
    b('stoneshade',0,.09,0,.81,.18,.67);b('stone',0,.20,0,.59,.10,.49)
    b('oak',0,1.66,-.20,.12,2.83,.12);b('gold',0,3.09,-.20,.18,.16,.17)
    b('oaklight',0,2.84,-.10,1.18,.105,.14)
    for x in [-.54,.54]:b('gold',x,2.84,-.10,.075,.145,.17)
    b(color,0,2.19,-.005,1.00,1.18,.075)
    for i in range(5):b(color,-.4+i*.20,1.53-abs(i-2)*.038,-.005,.198,.20,.075)
    for x in [-.47,.47]:b('gold',x,2.18,.041,.045,1.11,.027)
    b('gold',0,2.705,.041,.94,.045,.027)
    if cls=='knight':
        m.disc('stonebright',0,2.18,.076,.34,.032,8);m.disc('navy',0,2.18,.10,.28,.024,8)
        m.sword(0,2.09,.146,.55)
    elif cls=='ranger':
        m.bow(-.20,2.18,.09,.70);m.beam('gold',(-.32,1.91,.15),(.29,2.48,.15),.044)
        m.gem('ivory',.29,2.48,.15,.13,.18,.042);m.leaf(.18,1.93,.085,.37,'leaflight')
    elif cls=='mage':
        m.disc('gold',0,2.18,.073,.33,.022,12);m.disc('violet',0,2.18,.092,.29,.019,12)
        m.gem('crystal',0,2.20,.16,.34,.61,.11);m.gem('cyanglow',-.04,2.22,.223,.11,.35,.025)
    else:
        m.disc('gold',0,2.18,.071,.33,.025,12);m.disc('teal',0,2.18,.092,.27,.019,12)
        m.leaf(0,2.18,.123,.93);m.gem('ivory',0,1.93,.166,.12,.18,.04)
    m.finish()

for directory in [EXPORT.parent,SOURCE.parent]:directory.mkdir(parents=True,exist_ok=True)
library['contract']='Original 11-prop four-class practice kit. Stable Y0 origins and explicit moving target pivots. Ground layout and effects remain runtime-owned.'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
# Existing cached toolchain; floats preserve exact hit pivots and target points.
with tempfile.TemporaryDirectory(prefix='mossvale-training-') as temp:
    paths=[str(Path(temp)/f'{i}.glb') for i in range(3)]
    commands=[['weld',str(EXPORT),paths[0]],['quantize',paths[0],paths[1],'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['dedup',paths[1],paths[2]],['prune',paths[2],str(EXPORT)]]
    for command in commands:subprocess.run(['npx','--yes','@gltf-transform/cli@4.5.0']+command,check=True)
raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+length])
for field in ['extensionsUsed','extensionsRequired']:document[field]=sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=raw[20+length:]
EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)

def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
gallery_scenes=[]
for cls,layout in {
    'knight':[('dummy',-.25,-.10),('weapon-rack',2.0,-.85),('class-banner-knight',-1.90,-1.18)],
    'ranger':[('archery-target',-.20,-.35),('arrow-rack',2.10,-.65),('class-banner-ranger',-2.04,-1.0)],
    'mage':[('arcane-target',-.25,-.15),('lectern',1.90,.10),('class-banner-mage',-1.86,-1.0)],
    'cleric':[('healing-shrine',-.20,-.25),('lectern',1.92,.10),('class-banner-cleric',-1.92,-1.0)],
}.items():
    gallery=bpy.data.scenes.new(cls.capitalize()+' practice vignette');bpy.context.window.scene=gallery;gallery_scenes.append(gallery)
    for name,x,z in layout:
        source=roots['training-'+name];parent=source.copy();gallery.collection.objects.link(parent);parent.location=xyz(x,0,z)
        for child in source.children:
            obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));floor=bpy.context.object;floor.name='Gallery ground - not exported'
    fm=bpy.data.materials.get('Gallery moss') or bpy.data.materials.new('Gallery moss');fm.diffuse_color=(.11,.15,.105,1);floor.data.materials.append(fm)
    bpy.ops.object.camera_add(location=xyz(5.4,4.2,10.5));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=6.95;aim(camera,(.25,1.30,0));gallery.camera=camera
    for at,power,size,color in [((-5,8,7),1500,6,(1,.84,.63)),((5,5,1),800,5,(.69,.85,1))]:
        bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.size=size;light.data.color=color;aim(light,(0,1,0))
    bpy.ops.object.light_add(type='SUN',location=xyz(-5,9,8));sun=bpy.context.object;sun.data.energy=1.0;sun.data.angle=.18;aim(sun,(0,0,0))
    gallery.world=bpy.data.worlds.new(cls+' gallery world');gallery.world.use_nodes=True
    gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.24,.25,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
    gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
    gallery.render.resolution_x=1200;gallery.render.resolution_y=900;gallery.render.resolution_percentage=100
    gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(ROOT/f'assets/source/training-grounds-{cls}.png');gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('TRAINING_GROUNDS '+json.dumps({'models':metrics,'bytes':EXPORT.stat().st_size,'triangles':sum(m['triangles'] for m in metrics.values()),'draws':sum(m['meshes'] for m in metrics.values())}),flush=True)
if '--render' in sys.argv:
    for gallery in gallery_scenes:
        bpy.context.window.scene=gallery;bpy.ops.render.render(write_still=True)
