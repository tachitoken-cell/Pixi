"""Original giant and woodland voxel forest models, one instanced mesh per tree.
Blender --background --python scripts/build-giant-tree-assets.py -- --render
Metres, Y-up in GLB, base Y=0; walking-height geometry fits each trunk radius.
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

ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/giant-trees.glb'
SOURCE=ROOT/'assets/source/giant-trees.blend'
PREVIEW=ROOT/'assets/source/giant-trees-preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def rgb(value):return tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,)
PALETTE={name:rgb(value) for name,value in {
    'bark':'73503A','barklight':'956649','barkdark':'4C382D','moss':'47613B',
    'oak0':'386337','oak1':'4D803A','oak2':'659842','oak3':'84B64D','oak4':'A3C858',
    'pine0':'244E3D','pine1':'306546','pine2':'408451','pine3':'61994E','pine4':'80AE60',
}.items()}
material=bpy.data.materials.new('Forest vertex palette');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.92
colour=material.node_tree.nodes.new('ShaderNodeVertexColor');colour.layer_name='ForestTint'
material.node_tree.links.new(colour.outputs['Color'],shader.inputs['Base Color'])
library=bpy.context.scene;library.name='Giant forest library';library.unit_settings.system='METRIC'

def xyz(x,y,z):return (x,-z,y)
def noise(x,y,z):return ((x*73856093)^(y*19349663)^(z*83492791))&0xffffffff

class Tree:
    def __init__(self,name):self.name=name;self.vertices=[];self.faces=[];self.colours=[]
    def face(self,points,tint):
        index=len(self.vertices);self.vertices.extend(xyz(*point) for point in points)
        self.faces.append(tuple(range(index,index+len(points))));self.colours.append(PALETTE[tint])
    def box(self,tint,x,y,z,w,h,d):
        pts=[(x+a*w/2,y+b*h/2,z+c*d/2) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for indices in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:self.face([pts[i] for i in indices],tint)
    def branch(self,a,b,width):
        # Deliberate stepped branches preserve the block silhouette at all camera angles.
        a,b=Vector(a),Vector(b);steps=math.ceil((b-a).length/(width*.7))
        for i in range(steps+1):
            p=a.lerp(b,i/steps);w=width*(1-.48*i/steps)
            self.box('barklight' if i%4==0 else 'bark',*p,w,w,w)
    def canopy(self,cells,step,palette,offset=(0,0,0)):
        # Only exposed voxel faces ship; hidden interior blocks add no geometry.
        sides=[((-1,0,0),[(0,0,0),(0,0,1),(0,1,1),(0,1,0)]),((1,0,0),[(1,0,1),(1,0,0),(1,1,0),(1,1,1)]),
               ((0,-1,0),[(0,0,1),(0,0,0),(1,0,0),(1,0,1)]),((0,1,0),[(0,1,0),(0,1,1),(1,1,1),(1,1,0)]),
               ((0,0,-1),[(1,0,0),(0,0,0),(0,1,0),(1,1,0)]),((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)])]
        for x,y,z in sorted(cells):
            shade=noise(x,y,z)%5
            for (dx,dy,dz),corners in sides:
                if (x+dx,y+dy,z+dz) in cells:continue
                tint=min(4,max(0,shade+(1 if dy>0 else -1 if dy<0 else 0)))
                self.face([((x+a)*step+offset[0],(y+b)*step+offset[1],(z+c)*step+offset[2]) for a,b,c in corners],palette+str(tint))
    def finish(self,height,trunk_radius=1.5):
        mesh=bpy.data.meshes.new(self.name+' geometry');mesh.from_pydata(self.vertices,[],self.faces);mesh.materials.append(material)
        tint=mesh.color_attributes.new(name='ForestTint',type='BYTE_COLOR',domain='CORNER')
        for face,c in zip(mesh.polygons,self.colours):
            for index in face.loop_indices:tint.data[index].color=c
        mesh.update();obj=bpy.data.objects.new(self.name,mesh);library.collection.objects.link(obj)
        obj['height']=height;obj['trunkRadius']=trunk_radius;obj['contract']=f'One merged, vertex-coloured mesh. Metres, Y up after export. Base Y=0; collider radius{trunk_radius}m.'
        return obj

def trunk(tree,height,pine=False):
    for i in range(math.ceil(height/1.2)):
        y=i*1.2;w=(1.55 if not pine else 1.35)*(1-.64*y/height)
        offset=math.sin(y*.28)*.10
        tree.box('bark',offset,y+.6,0,w,1.2,w*.89)
        tree.box('barklight',offset+w*.49,y+.6,-w*.12,.08,.92,w*.28)
        tree.box('barkdark',offset-w*.17,y+.59,w*.451,w*.18,1.08,.055)
    for sign in [-1,1]:
        tree.box('barkdark',sign*.75,.32,0,.55,.64,1.12)
        tree.box('bark',0,.25,sign*.76,1.08,.50,.56)
        tree.box('moss',sign*.70,.64,-.33,.39,.10,.37)

oak=Tree('ElderOak');trunk(oak,15.6)
clusters=[(-5.8,16.7,-.8,5.5,3.6,5.1),(5.5,17.6,1.8,5.6,4.3,5.0),(-.5,18.3,5.3,5.3,3.8,5.3),
          (1.6,20.5,-4.6,5.7,3.5,5.3),(-3.1,21.1,-3.1,5.3,2.9,4.6),(0,21.6,.4,5.1,2.4,4.8)]
for i,(x,y,z,*_) in enumerate(clusters):
    oak.branch((0,7.2+i*.9,0),(x*.8,y-2,z*.8),1.15-i*.055)
    oak.branch((x*.65,y-3.6,z*.65),(x+1.1,y-.7,z-1.1),.70)
cells=set();step=1.0
for cx,cy,cz,rx,ry,rz in clusters:
    for x in range(math.floor(cx-rx),math.ceil(cx+rx)):
        for y in range(math.floor(cy-ry),math.ceil(cy+ry)):
            for z in range(math.floor(cz-rz),math.ceil(cz+rz)):
                shape=((x+.5-cx)/rx)**2+((y+.5-cy)/ry)**2+((z+.5-cz)/rz)**2
                if shape<1 and (shape<.89 or noise(x,y,z)%7):cells.add((x,y,z))
oak.canopy(cells,step,'oak');oak_obj=oak.finish(24)

pine=Tree('GiantPine');trunk(pine,27.6,True);cells=set();step=.9
for tier in range(9):
    cy=8.6+tier*2.25;radius=6.5-tier*.56;height=2.9
    for x in range(math.floor(-radius/step),math.ceil(radius/step)):
        for y in range(math.floor((cy-height/2)/step),math.ceil((cy+height/2)/step)):
            for z in range(math.floor(-radius/step),math.ceil(radius/step)):
                px=(x+.5)*step;pz=(z+.5)*step;py=(y+.5)*step
                a=math.atan2(pz,px);star=.81+.19*abs(math.cos(a*3+tier*.6))
                falloff=1-.62*((py-(cy-height/2))/height)
                if math.hypot(px,pz)<radius*star*falloff and noise(x,y,z)%23!=0:cells.add((x,y,z))
    for side in range(4):
        a=side*math.pi/2+tier*.49;r=radius*.67
        pine.branch((0,cy-.8,0),(math.cos(a)*r,cy-.75,math.sin(a)*r),.40)
# A stepped needle tip completes the thirty metre silhouette.
for y,width in [(27.9,2.4),(28.8,1.8),(29.7,.9)]:
    for x in range(math.floor(-width/step/2),math.ceil(width/step/2)):
        for z in range(math.floor(-width/step/2),math.ceil(width/step/2)):cells.add((x,round(y/step)-1,z))
pine.canopy(cells,step,'pine');pine_obj=pine.finish(29.7)

# Woodland trees are authored around a narrow gameplay trunk rather than scaling
# the giant's massive roots and crown. Branches begin above character head height.
def woodland_trunk(tree,height,pine=False):
    for i in range(math.ceil(height/.6)):
        y=i*.6;h=min(.6,height-y);width=(.49 if pine else .55)*(1-.48*y/height)
        offset=math.sin(i*.9)*.035
        tree.box('bark',offset,y+h/2,0,width,h,width*.88)
        tree.box('barklight',offset+width*.47,y+h*.53,-width*.1,.035,h*.76,width*.26)
        tree.box('barkdark',offset-width*.16,y+h*.50,width*.46,width*.17,h*.88,.025)
    for side in [-1,1]:
        tree.box('barkdark',side*.32,.16,0,.23,.32,.40)
        tree.box('bark',0,.12,side*.32,.38,.24,.23)
        tree.box('moss',side*.31,.33,-.12,.18,.045,.17)

woodland_oak=Tree('WoodlandOak');woodland_trunk(woodland_oak,3.9)
small_clusters=[(-1.25,3.85,-.25,1.15,.75,1.2),(1.03,4.10,.55,1.20,.82,1.15),
                (-.38,4.55,1.23,1.20,.80,1.25),(.40,4.88,-1.02,1.32,.88,1.37)]
for i,(x,y,z,*_) in enumerate(small_clusters):
    woodland_oak.branch((0,2.24+i*.22,0),(x*.8,y-.3,z*.8),.27-i*.017)
# A fork and bark knots give the shorter silhouette its own growth pattern.
woodland_oak.branch((.02,2.55,0),(-.52,3.52,-.45),.20)
woodland_oak.box('barkdark',-.035,1.41,.267,.16,.21,.035)
woodland_oak.box('barklight',-.035,1.41,.287,.08,.12,.018)
cells=set();step=.4
for cx,cy,cz,rx,ry,rz in small_clusters:
    for x in range(-6,6):
        for y in range(7,14):
            for z in range(-6,6):
                shape=(((x+.5)*step-cx)/rx)**2+(((y+.5)*step+.2-cy)/ry)**2+(((z+.5)*step-cz)/rz)**2
                if shape<1 and (shape<.8 or noise(x,y,z)%6):cells.add((x,y,z))
cells.add((0,13,-2))
woodland_oak.canopy(cells,step,'oak',(0,.2,0));woodland_oak_obj=woodland_oak.finish(5.8,.59)

woodland_pine=Tree('WoodlandPine');woodland_trunk(woodland_pine,5.2,True)
cells=set();step=.4
for tier,(cy,radius,height) in enumerate([(2.78,2.18,.95),(3.60,1.75,.95),(4.35,1.30,.85),(4.95,.84,.8)]):
    for x in range(-6,6):
        for y in range(5,14):
            for z in range(-6,6):
                px=(x+.5)*step;pz=(z+.5)*step;py=(y+.5)*step+.2
                if not cy-height/2<=py<=cy+height/2:continue
                angle=math.atan2(pz,px);lobes=.88+.12*abs(math.cos(angle*3+tier*.53))
                taper=1-.54*((py-cy+height/2)/height)
                if math.hypot(px,pz)<radius*lobes*taper:cells.add((x,y,z))
    for side in range(3):
        angle=side*math.pi*2/3+tier*.55;reach=radius*.70
        woodland_pine.branch((0,cy-.23,0),(math.cos(angle)*reach,cy-.18,math.sin(angle)*reach),.26)
# A dense tapered tip completes the exact 5.8m canopy height.
for x,z in [(-1,-1),(-1,0),(0,-1),(0,0)]:cells.add((x,12,z))
cells.add((0,13,0))
woodland_pine.canopy(cells,step,'pine',(0,.2,0));woodland_pine_obj=woodland_pine.finish(5.8,.59)

for path in [EXPORT.parent,SOURCE.parent]:path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
cli=['npx','--yes','@gltf-transform/cli@4.5.0']
with tempfile.TemporaryDirectory(prefix='mossvale-forest-') as tmp:
    welded=str(Path(tmp)/'weld.glb');compact=str(Path(tmp)/'compact.glb')
    for command in [['weld',str(EXPORT),welded],['quantize',welded,compact,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['prune',compact,str(EXPORT)]]:subprocess.run(cli+command,check=True)
raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+length])
for field in ['extensionsUsed','extensionsRequired']:document[field]=sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=raw[20+length:]
EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)

# Review scene is isolated from the exported library.
gallery=bpy.data.scenes.new('Giant forest review');bpy.context.window.scene=gallery
for obj,x,z in [(oak_obj,-13,0),(pine_obj,13,0),(woodland_oak_obj,-5,13),(woodland_pine_obj,5,13)]:
    copy=obj.copy();gallery.collection.objects.link(copy);copy.location=xyz(x,0,z)
gallery.world=bpy.data.worlds.new('Forest review sky');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.33,.42,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
gallery.render.engine='CYCLES';gallery.cycles.samples=12;gallery.cycles.use_denoising=True
gallery.render.resolution_x=2100;gallery.render.resolution_y=1400;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.view_settings.view_transform='Standard'
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA',location=xyz(-24,45,20));lamp=bpy.context.object;lamp.data.energy=22000;lamp.data.size=25;aim(lamp,(0,12,0))
bpy.ops.object.light_add(type='SUN',location=xyz(15,40,-10));lamp=bpy.context.object;lamp.data.energy=2;lamp.data.angle=.1;aim(lamp,(0,0,0))
bpy.ops.mesh.primitive_plane_add(size=200,location=xyz(0,-.025,0));floor=bpy.context.object
floor_mat=bpy.data.materials.new('Review slate');floor_mat.use_nodes=True;floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.08,.12,.14,1);floor.data.materials.append(floor_mat)
# An adult-sized traveller makes the substantial change of scale easy to read.
traveller=Tree('Review traveller');traveller.box('barkdark',0,.62,0,.58,1.20,.4);traveller.box('barklight',0,1.53,0,.55,.55,.5)
traveller_obj=traveller.finish(1.8);library.collection.objects.unlink(traveller_obj);gallery.collection.objects.link(traveller_obj);traveller_obj.location=xyz(0,0,14)
for x,z,label in [(-13,8,'ELDER OAK  /  24m'),(13,8,'GIANT PINE  /  30m'),(-5,17,'WOODLAND OAK  /  5.8m'),(5,17,'WOODLAND PINE  /  5.8m')]:
    bpy.ops.object.text_add(location=xyz(x,.02,z));text=bpy.context.object;text.data.body=label;text.data.align_x='CENTER';text.data.size=.7;text.data.extrude=.005
    textmat=bpy.data.materials.get('Review lettering') or bpy.data.materials.new('Review lettering');textmat.diffuse_color=(.75,.85,.86,1);text.data.materials.append(textmat)
bpy.ops.object.camera_add(location=xyz(40,29,61));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=56;aim(camera,(0,13,0));gallery.camera=camera
gallery.render.filepath=str(PREVIEW);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
print('FOREST '+json.dumps({'bytes':EXPORT.stat().st_size,'meshes':len(document['meshes']),'triangles':{tree.name:len(tree.faces)*2 for tree in [oak,pine,woodland_oak,woodland_pine]}}))
