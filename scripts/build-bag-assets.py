"""Author the four Mossvale inventory bags in Blender.

Blender --background --python scripts/build-bag-assets.py -- --render --optimize
Contract: bag-{item-id} roots, metres, Y up, +Z front, centred X/Z, bottom Y=0.
The library contains only bag geometry. The separate gallery is never exported.
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
EXPORT = ROOT / 'public/models/bag-kit.glb'
SOURCE = ROOT / 'assets/source/bag-kit.blend'
PREVIEW = ROOT / 'assets/source/bag-kit-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library = bpy.context.scene
library.name = 'Mossvale bag library'
library.unit_settings.system = 'METRIC'

HEX = {
    'linen':'D7C9A5','linenlight':'F0E5C9','linenfold':'B6A780','seam':'998664',
    'leather':'795136','leatherlight':'A67445','leatherdark':'453327','ochre':'AD804D',
    'ochrelight':'C5975D','ochreshade':'89623F','moss':'567650','mosslight':'83A56B',
    'mossdark':'355443','gold':'D8B16B','goldlight':'F7D894','bronze':'A17944',
    'teal':'254E58','teallight':'3E6D73','midnight':'172F3D','navy':'223C50',
    'cyan':'78DBD2','cyanlight':'CEFFF1','inside':'26312D','thread':'CBB791',
}
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
COLORS = {key:tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,)
          for key,value in HEX.items()}
def xyz(x,y,z): return x,-z,y

material = bpy.data.materials.new('Mossvale bag vertex palette')
material.use_nodes = True
principled = material.node_tree.nodes.get('Principled BSDF')
principled.inputs['Roughness'].default_value = .82
color = material.node_tree.nodes.new('ShaderNodeVertexColor')
color.layer_name = 'BagTint'
material.node_tree.links.new(color.outputs['Color'],principled.inputs['Base Color'])
roots,stats = [],{}

class Bag:
    def __init__(self,item_id):
        self.id=item_id
        self.vertices,self.faces,self.colors=[],[],[]

    def box(self,tint,x,y,z,w,h,d,angle=0):
        start=len(self.vertices);c,s=math.cos(angle),math.sin(angle)
        for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            xx,yy=a*w/2,b*h/2
            self.vertices.append(xyz(x+xx*c-yy*s,y+xx*s+yy*c,z+f*d/2))
        for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
            self.faces.append(tuple(start+n for n in face));self.colors.append(COLORS[tint])

    def strap(self,tint,x1,y1,x2,y2,z,width=.04,depth=.025):
        self.box(tint,(x1+x2)/2,(y1+y2)/2,z,width,math.hypot(x2-x1,y2-y1),depth,-math.atan2(x2-x1,y2-y1))

    def buckle(self,x,y,z,size=.10):
        b=self.box
        for dx in [-size/2,size/2]:b('gold',x+dx,y,z,.020,size+.02,.032)
        for dy in [-size/2,size/2]:b('goldlight',x,y+dy,z,size+.02,.020,.035)
        b('bronze',x,y,z+.016,.015,size,.018)

    def stitch(self,x1,y1,x2,y2,z,n=12):
        for i in range(n):
            t=(i+.5)/n
            self.box('thread',x1+(x2-x1)*t,y1+(y2-y1)*t,z,.018,.026,.012,angle=-.28)

    def finish(self):
        # Bake origin normalization into vertices, leaving every exported transform identity.
        low=[min(v[a] for v in self.vertices) for a in range(3)]
        high=[max(v[a] for v in self.vertices) for a in range(3)]
        offset=[(low[0]+high[0])/2,(low[1]+high[1])/2,low[2]]
        vertices=[tuple(v[a]-offset[a] for a in range(3)) for v in self.vertices]
        mesh=bpy.data.meshes.new('bag-'+self.id+'-mesh')
        mesh.from_pydata(vertices,[],self.faces);mesh.materials.append(material)
        tint=mesh.color_attributes.new(name='BagTint',type='BYTE_COLOR',domain='CORNER')
        for face,colour in zip(mesh.polygons,self.colors):
            for loop in face.loop_indices:tint.data[loop].color=colour
        mesh.update()
        root=bpy.data.objects.new('bag-'+self.id,None)
        root['itemId']=self.id
        root['contract']='Metres; Y up; +Z front; centred X/Z; bottom Y=0; one shared vertex palette.'
        root['previewOnly']=True
        library.collection.objects.link(root)
        obj=bpy.data.objects.new('bag-'+self.id+'-mesh',mesh)
        library.collection.objects.link(obj);obj.parent=root
        roots.append(root)
        stats[self.id]={'triangles':len(self.faces)*2,'drawCalls':1,
                       'size':[high[0]-low[0],high[2]-low[2],high[1]-low[1]]}

# A small gathered pouch: layered fabric walls leave a real hollow neck.
m=Bag('linen-pouch');b=m.box
b('linenfold',0,.04,0,.40,.08,.29)
for i,(width,depth) in enumerate([(.49,.34),(.56,.40),(.60,.43),(.62,.44),(.60,.43),(.54,.39),(.44,.32)]):
    y=.105+i*.065
    for side in [-1,1]:
        b('linenlight' if side>0 else 'linen',0,y,side*(depth/2-.032),width,.065,.064)
        b('linenfold' if side>0 else 'linen',side*(width/2-.029),y,0,.058,.065,depth-.128)
for i,(width,depth) in enumerate([(.32,.26),(.29,.24),(.35,.28),(.38,.30)]):
    y=.55+i*.045
    for side in [-1,1]:
        b('linenlight',0,y,side*(depth/2-.024),width,.045,.048)
        b('linen',side*(width/2-.024),y,0,.048,.045,depth-.096)
for x in [-.18,-.065,.065,.18]:
    m.strap('linenfold',x*1.1,.17,x*.74,.47,.221,.024,.013)
    m.strap('linenlight',x*1.1+.02,.17,x*.74+.018,.47,.229,.018,.009)
for side in [-1,1]:
    b('leatherlight',0,.566,side*.139,.35,.031,.027)
    b('leatherlight',side*.179,.566,0,.027,.031,.29)
m.strap('leatherlight',-.045,.575,-.14,.48,.174,.030)
m.strap('leatherlight',-.14,.48,-.23,.43,.218,.029)
m.strap('leather',.055,.575,.13,.46,.172,.031)
m.strap('leather',.13,.46,.22,.405,.219,.028)
b('linenlight',-.018,.566,.164,.09,.07,.064,angle=.15)
for x,y in [(-.23,.402),(.22,.377)]:
    b('gold',x,y+.02,.227,.052,.055,.050)
    for dx in [-.020,0,.020]:b('seam',x+dx,y-.018,.229,.014,.065,.026)
m.stitch(-.20,.10,.20,.10,.185,12)
m.finish()

# Ranger satchel: broad flap, stitched hide, brass leaf clasp and an open shoulder loop.
m=Bag('trail-satchel');b=m.box
for i,(w,d) in enumerate([(.66,.27),(.76,.34),(.80,.38),(.80,.38),(.77,.36),(.69,.32)]):
    b('mossdark' if i==0 else 'moss',0,.06+i*.092,0,w,.092,d)
b('leather',0,.11,.176,.68,.16,.055)
for side in [-1,1]:
    b('leather',side*.36,.30,.021,.073,.40,.335)
    b('leatherlight',side*.347,.26,.206,.045,.25,.031)
    b('bronze',side*.35,.52,.019,.10,.073,.12)
# The thick curved flap settles onto the bag, with a dark lip beneath it.
for i,w in enumerate([.71,.74,.73,.69,.61]):
    b('leatherdark',0,.64-i*.060,.211,w,.060,.046)
    b('mosslight' if i==0 else 'moss',0,.65-i*.060,.239,w-.02,.060,.041)
b('leatherlight',0,.437,.277,.13,.285,.038)
m.buckle(0,.359,.308,.11)
for i,width in enumerate([.045,.084,.13,.102,.062]):
    b('goldlight' if i%2==0 else 'gold',.031-i*.012,.52-i*.025,.296+i*.002,width,.032,.027,angle=-.20)
m.strap('bronze',-.021,.388,.038,.53,.316,.014,.014)
m.stitch(-.30,.415,.30,.415,.270,18)
m.stitch(-.319,.44,-.345,.62,.268,6)
m.stitch(.319,.44,.345,.62,.268,6)
# Full back strap with daylight through the loop, useful when rotated in the preview.
for side in [-1,1]:
    m.strap('leather',side*.355,.52,side*.25,.87,-.11,.055,.038)
    m.strap('leatherlight',side*.25,.87,side*.15,.98,-.11,.049,.031)
b('leather',0,.99,-.11,.32,.054,.040)
b('leatherlight',-.10,.997,-.083,.10,.064,.017)
b('leatherdark',0,.305,-.197,.67,.39,.036)
for x in [-.19,.19]:b('leatherlight',x,.37,-.225,.074,.28,.040)
m.finish()

# Tall traveling pack: ochre canvas, fitted side pockets, bedroll, straps and buckles.
m=Bag('wayfarer-pack');b=m.box
for i,w in enumerate([.48,.58,.63,.65,.65,.63,.58,.51]):
    b('ochreshade' if i in [0,7] else 'ochre',0,.07+i*.091,0,w,.091,.35+(min(i,7-i))*.014)
b('leather',0,.071,.012,.55,.142,.382)
for i,w in enumerate([.58,.62,.63,.59]):b('ochrelight',0,.80-i*.067,.235,w,.067,.087)
b('leatherdark',0,.265,.239,.46,.28,.105)
b('ochrelight',0,.293,.306,.41,.263,.043)
b('leather',0,.45,.305,.49,.091,.082)
m.stitch(-.17,.176,.17,.176,.337,11)
for side in [-1,1]:
    x=side*.406
    b('leatherdark',x,.23,0,.206,.35,.296)
    b('ochre',x,.269,.027,.212,.333,.275)
    b('leatherlight',x,.471,.031,.231,.083,.306)
    b('leather',x,.332,.186,.079,.187,.034)
    m.buckle(x,.31,.212,.072)
    b('leather',side*.21,.48,.292,.075,.59,.04)
    m.buckle(side*.21,.505,.320,.105)
    for y in [.22,.32,.66]:b('bronze',side*.21,y,.318,.018,.028,.012)
    m.stitch(side*.26,.19,side*.26,.65,.316,13)
    # Back straps are raised away from the pack shell in the middle.
    m.strap('leatherdark',side*.18,.14,side*.22,.35,-.285,.079,.052)
    m.strap('leatherlight',side*.22,.35,side*.18,.68,-.285,.064,.043)
    m.strap('leather',side*.18,.68,side*.16,.78,-.22,.08,.055)
    m.buckle(side*.205,.285,-.321,.071)
b('leatherdark',0,.77,-.14,.24,.055,.060)
# The rolled blanket is a stepped eight-sided cylinder across the backpack.
for dy,width in [(-.138,.20),(-.092,.29),(-.046,.35),(0,.37),(.046,.35),(.092,.29),(.138,.20)]:
    b('mosslight' if dy>.05 else 'moss',0,1.00+dy,-.004,.79,.046,width)
for side in [-1,1]:
    b('mossdark',side*.407,1.00,0,.036,.25,.28)
    for dy,d in [(-.09,.14),(-.047,.20),(.012,.22),(.075,.15)]:b('mosslight',side*.429,1.0+dy,.008,.017,.037,d)
    b('moss',side*.442,1.0,.018,.012,.058,.072)
    for z,y in [(-.18,1),(.18,1),(0,1.175),(0,.825)]:
        b('leather',side*.25,y,z,.065,.052 if z==0 else .22,.35 if z==0 else .032)
    m.buckle(side*.25,1.008,.211,.075)
m.finish()

# Enchanted holdall: a structured valise with hard corners and a luminous knot-rune.
m=Bag('runewoven-holdall');b=m.box
for i,(w,d) in enumerate([(.78,.34),(.88,.40),(.93,.43),(.93,.43),(.89,.40),(.79,.34)]):
    b('midnight' if i<2 else 'teal',0,.065+i*.103,0,w,.103,d)
b('navy',0,.375,.229,.69,.40,.037)
for x in [-.34,.34]:b('teallight',x,.381,.252,.033,.42,.028)
for y in [.17,.595]:b('teallight',0,y,.252,.70,.034,.028)
for side in [-1,1]:
    b('leatherdark',side*.345,.366,.015,.098,.59,.442)
    for y in [.07,.627]:
        b('gold',side*.348,y,.005,.119,.061,.452)
        b('goldlight',side*.437,y,.005,.072,.086,.31)
    b('gold',side*.348,.56,.265,.126,.16,.048)
    b('goldlight',side*.348,.568,.296,.071,.068,.018)
    b('midnight',side*.348,.543,.310,.025,.034,.012)
    m.stitch(side*.28,.225,side*.28,.51,.277,9)
    b('gold',side*.171,.68,-.005,.084,.083,.09)
    m.strap('teallight',side*.17,.714,side*.118,.875,-.005,.061,.055)
b('teal',0,.893,-.005,.247,.063,.060)
b('goldlight',0,.909,.030,.179,.024,.020)
# A braided diamond/knot has space around its strokes rather than a flat sticker.
for i,(x1,y1,x2,y2) in enumerate([(0,.544,.126,.41),(.126,.41,0,.267),(0,.267,-.126,.41),(-.126,.41,0,.544),
                                (-.14,.48,.14,.337),(-.14,.337,.14,.48)]):
    m.strap('cyan',x1,y1,x2,y2,.282+i*.0015,.026,.025)
b('cyanlight',0,.408,.301,.052,.052,.024,angle=math.pi/4)
for side in [-1,1]:
    b('gold',side*.212,.407,.277,.031,.031,.022,angle=math.pi/4)
    b('teallight',side*.463,.366,0,.019,.23,.22)
    for z in [-.08,.08]:b('gold',side*.478,.366,z,.019,.17,.026)
b('teallight',0,.37,-.239,.55,.38,.035)
for x in [-.24,.24]:b('gold',x,.369,-.265,.034,.30,.028)
m.finish()

for path in [EXPORT.parent,SOURCE.parent]:path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
                         export_yup=True,export_apply=True,export_animations=False,
                         export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
    cli=['npx','--yes','@gltf-transform/cli@4.5.0']
    with tempfile.TemporaryDirectory(prefix='mossvale-bags-') as temporary:
        paths=[str(EXPORT)]+[str(Path(temporary)/f'{i}.glb') for i in range(3)]
        for command in [['weld',paths[0],paths[1]],
                        ['quantize',paths[1],paths[2],'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],
                        ['dedup',paths[2],paths[3]],['prune',paths[3],paths[0]]]:
            subprocess.run(cli+command,check=True)
    # Attribute-only normal quantization still needs the explicit standard extension.
    raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    document=json.loads(raw[20:20+length])
    for field in ['extensionsUsed','extensionsRequired']:
        document[field]=sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
    encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
    tail=raw[20+length:]
    EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+
                       struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)

gallery=bpy.data.scenes.new('Mossvale bag study')
bpy.context.window.scene=gallery
for i,root in enumerate(roots):
    parent=root.copy();gallery.collection.objects.link(parent)
    parent.location=xyz((i-1.5)*1.5,0,0)
    for child in root.children:
        obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.016))
ground=bpy.context.object;ground.name='Gallery floor - not exported'
ground_material=bpy.data.materials.new('Gallery forest charcoal')
ground_material.diffuse_color=(.07,.10,.095,1);ground.data.materials.append(ground_material)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(2.5,2.4,6.8))
camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=6.6
aim(camera,(0,.58,0));gallery.camera=camera
for at,power,size in [((-3,5,5),500,4),((4,3,-1),350,3),((1,4,3),120,2)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at))
    light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,.5,0))
gallery.world=bpy.data.worlds.new('Bags soft studio');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.17,.22,.24,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
gallery.render.engine='CYCLES';gallery.cycles.samples=48;gallery.cycles.use_denoising=True
gallery.render.resolution_x=2000;gallery.render.resolution_y=1000;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW)
gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('BAG_ASSETS '+json.dumps({'models':stats,'glb_bytes':EXPORT.stat().st_size}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
