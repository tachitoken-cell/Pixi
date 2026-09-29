"""Build Mossvale's original voxel riding horse and direwolf in Blender.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-mount-assets.py -- --render
Rigid-part rigs, metres, +Z forward and Y up in GLB; feet at Y=0.
Each root includes seatY/seatZ metadata; one vertex-colour material, no textures.
"""
import bpy
import json
import math
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/mounts.glb'
SOURCE = ROOT / 'assets/source/mounts.blend'
PREVIEW = ROOT / 'assets/source/mounts-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
HEX = {
    'chestnut':'995735', 'copper':'BC7446', 'copperlight':'CF935F', 'chestnutdark':'754229',
    'mane':'3F2E2B', 'hoof':'342E30', 'cream':'F3DCAC', 'creamshade':'C9B98C',
    'leather':'603A2A', 'leatherlight':'945B38', 'gold':'D6AC51', 'goldlight':'F6D587',
    'teal':'26888B', 'teallight':'50B7AA', 'tealdark':'1E5C65',
    'fur':'687E8B', 'furshade':'415564', 'furlight':'9BB1B7', 'snow':'D3DFD9',
    'ink':'24303A', 'eye':'93DAA9', 'eyewarm':'E5C773', 'red':'9B3D44', 'redlight':'C56260',
}
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
COLORS = {key:tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,) for key,value in HEX.items()}
def xyz(x,y,z): return (x,-z,y)
parts = {}; current_mount = ''; current_part = ''

def mount(name,seat):
    global current_mount
    current_mount=name; parts[name]={'seatY':seat,'parts':{}}

def part(name,pivot,parent=None):
    global current_part
    current_part=name
    parts[current_mount]['parts'][name]={'pivot':pivot,'parent':parent,'vertices':[],'faces':[],'colors':[],'boxes':0}

def box(tint,x,y,z,w,h,d,rx=0,ry=0,rz=0):
    data=parts[current_mount]['parts'][current_part]
    base=len(data['vertices']); pivot=data['pivot']; rotation=Euler((rx,ry,rz),'XYZ').to_matrix()
    for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        p=rotation@Vector((a*w/2,b*h/2,c*d/2))
        data['vertices'].append(xyz(p.x+x-pivot[0],p.y+y-pivot[1],p.z+z-pivot[2]))
    for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
        data['faces'].append(tuple(base+i for i in face));data['colors'].append(COLORS[tint])
    data['boxes']+=1

def rod(tint,a,b,width):
    a,b=Vector(a),Vector(b); p=(a+b)/2; delta=b-a
    rotation=Vector((0,1,0)).rotation_difference(delta.normalized()).to_euler('XYZ')
    box(tint,*p,width,delta.length,width,*rotation)

def saddle(y,cloth,highlight,trim):
    # Broad blanket drapes around the ribs; the recessed seat stays clear for the rider.
    box(cloth,0,y-.09,-.13,1.04,.11,1.10)
    for side in [-1,1]:
        box(cloth,side*.54,y-.30,-.13,.08,.49,1.08)
        box(highlight,side*.586,y-.51,-.13,.035,.08,1.07)
        box(trim,side*.591,y-.28,-.31,.04,.15,.15,rx=math.pi/4)
        box('leather',side*.43,y-.12,-.12,.15,.26,.70)
        box('leatherlight',side*.50,y-.05,-.34,.12,.11,.18)
        # Stirrup straps and open stirrup frames.
        box('leather',side*.60,y-.47,.10,.055,.62,.065)
        for dz in [-.09,.09]: box('gold',side*.60,y-.79,.10+dz,.065,.19,.035)
        box('gold',side*.60,y-.885,.10,.07,.035,.22)
        # Small travel panniers leave the rider's knees free.
        box('leather',side*.60,y-.30,-.65,.28,.39,.33)
        box('leatherlight',side*.60,y-.10,-.65,.31,.08,.35)
        box('gold',side*.754,y-.23,-.65,.024,.095,.09)
    box('leather',0,y-.018,-.12,.78,.095,.70)
    box('leatherlight',0,y+.035,-.46,.77,.17,.14)
    box('leatherlight',0,y+.02,.24,.72,.15,.14)
    box('gold',0,y+.10,.26,.14,.13,.11)
    # Runtime reins connect the bridle to each rider's animated hands.

mount('horse',1.79)
part('body',(0,1.33,0))
box('chestnut',0,1.29,-.08,1.0,.69,1.92)
box('copper',0,1.57,-.09,.89,.23,1.68)
box('chestnutdark',0,1.02,.12,.80,.23,1.44)
box('copper',0,1.28,.77,1.04,.74,.55)
box('chestnut',0,1.29,-.83,1.01,.73,.59)
for side in [-1,1]:
    box('copperlight',side*.507,1.36,.80,.042,.27,.31)
    box('chestnutdark',side*.505,1.14,-.80,.04,.30,.28)
    box('creamshade',side*.481,1.40,-.49,.027,.17,.17)
    box('cream',side*.483,1.49,-.30,.032,.09,.10)
saddle(1.79,'teal','teallight','gold')
# High stepped neck is part of the head joint so the horse can nod and look around.
part('head',(0,1.60,.76),'body')
box('copper',0,1.87,.89,.65,.79,.55,rx=.24)
box('copperlight',0,2.04,1.04,.54,.47,.40,rx=.18)
box('chestnut',0,2.30,1.15,.57,.51,.64,rx=.17)
box('copper',0,2.13,1.46,.49,.40,.60,rx=.24)
box('chestnutdark',0,2.03,1.69,.50,.29,.20)
box('cream',0,2.36,1.48,.14,.36,.05,rx=.18)
box('creamshade',0,2.16,1.66,.15,.26,.047,rx=.24)
for side in [-1,1]:
    box('ink',side*.19,2.08,1.798,.07,.047,.023)
    box('mane',side*.291,2.39,1.30,.034,.13,.13)
    box('eyewarm',side*.31,2.40,1.32,.018,.082,.075)
    box('cream',side*.324,2.421,1.335,.011,.026,.026)
    box('copper',side*.21,2.64,1.0,.18,.37,.23,rx=-.15,rz=-side*.1)
    box('chestnutdark',side*.21,2.68,1.124,.095,.22,.024,rx=-.15)
    box('leather',side*.31,2.30,1.37,.04,.085,.55,rx=.27)
    box('gold',side*.337,2.24,1.56,.03,.105,.105)
    rod('leather',(side*.26,2.23,1.66),(side*.30,1.86,1.43),.042)
box('leather',0,2.175,1.704,.54,.075,.095,rx=.24)
# Seven stepped blocks form a mane crest rather than a flat stripe.
for i in range(7):
    box('mane',0,1.65+i*.13,.64+i*.06,.26,.20,.22)
box('mane',0,2.48,1.27,.34,.17,.18)
for side,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.75),(False,-.78)]:
        name=('front-' if fore else 'rear-')+label; x=side*.40
        part(name,(x,1.27,z),'body')
        box('chestnut',x,1.01,z,.31,.57,.35)
        box('copper',x,.82,z+.01,.26,.28,.27)
        knee_z=z+(.0 if fore else -.08)
        part(name+'-knee',(x,.67,knee_z),name)
        box('chestnutdark',x,.45,knee_z,.19,.51,.20)
        box('cream',x,.23,knee_z+.005,.205,.18,.22)
        box('hoof',x,.095,knee_z+.07,.285,.19,.36)
        box('creamshade',x,.177,knee_z+.12,.29,.035,.28)
part('tail',(0,1.49,-1.05),'body')
box('mane',0,1.34,-1.26,.27,.66,.28,rx=-.24)
box('mane',0,.98,-1.43,.31,.47,.28,rx=-.16)
box('chestnutdark',0,.79,-1.49,.25,.24,.23)

mount('wolf',1.72)
part('body',(0,1.30,0))
box('fur',0,1.31,-.16,1.02,.67,1.93)
box('furshade',0,1.11,.29,1.08,.48,1.06)
box('furlight',0,1.48,-.62,.93,.33,.81)
box('snow',0,1.09,.79,.79,.42,.46)
for side in [-1,1]:
    # Angular shoulder ruff fans outward, making the wolf distinct from the horse.
    for i in range(4):
        box('furlight' if i%2 else 'furshade',side*(.44+i*.027),1.55-i*.11,.62-i*.17,.24,.33,.38,rx=-.22,rz=side*.26)
    box('snow',side*.40,1.54,.71,.21,.29,.30,rz=-side*.24)
    box('furshade',side*.51,1.17,-.76,.13,.29,.47)
saddle(1.72,'red','redlight','cream')
part('head',(0,1.55,.75),'body')
box('fur',0,1.79,1.03,.85,.61,.69)
box('furlight',0,1.96,1.04,.72,.31,.57)
box('snow',0,1.57,1.28,.72,.27,.51)
box('furlight',0,1.73,1.53,.56,.31,.55)
box('snow',0,1.55,1.54,.51,.10,.53)
box('ink',0,1.754,1.82,.37,.18,.14)
box('furshade',0,1.617,1.76,.49,.042,.23)
for side in [-1,1]:
    box('furshade',side*.426,1.89,1.25,.032,.19,.21)
    box('eye',side*.445,1.901,1.277,.021,.085,.12)
    box('ink',side*.46,1.91,1.30,.014,.085,.035)
    box('snow',side*.473,1.933,1.32,.014,.025,.028)
    box('snow',side*.355,1.62,1.37,.16,.18,.30,rz=side*.23)
    box('cream',side*.22,1.51,1.70,.07,.15,.055)
    # Stepped pointed ears, with inset blush ears and dark outside tips.
    for i in range(4):
        box('furshade',side*(.31+i*.02),2.11+i*.095,.90,.25-i*.046,.13,.28-i*.03)
    box('furlight',side*.325,2.18,1.05,.11,.20,.028,rz=-side*.14)
    box('leather',side*.45,1.72,1.19,.055,.10,.37,rx=.16)
    box('gold',side*.482,1.73,1.30,.032,.105,.12)
    rod('leather',(side*.29,1.75,1.54),(side*.30,1.79,1.43),.04)
box('leather',0,1.844,1.48,.61,.055,.11)
# Wolf paws are broad with three individual ivory claws; the rear hocks bend back.
for side,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.72),(False,-.74)]:
        name=('front-' if fore else 'rear-')+label; x=side*.43
        part(name,(x,1.26,z),'body')
        box('fur',x,.99,z,.35,.56,.40)
        if not fore: box('furlight',x,1.15,z,.40,.43,.49)
        knee_z=z+(0 if fore else -.12)
        part(name+'-knee',(x,.65,knee_z),name)
        box('furshade',x,.42,knee_z,.245,.49,.25)
        box('furlight',x,.24,knee_z+.07,.27,.20,.32)
        box('snow',x,.12,knee_z+.13,.36,.24,.48)
        for dx in [-.11,0,.11]: box('creamshade',x+dx,.065,knee_z+.383,.065,.085,.08)
part('tail',(0,1.46,-1.10),'body')
box('furshade',0,1.35,-1.38,.39,.40,.70,rx=-.30)
box('fur',0,1.11,-1.70,.37,.41,.47,rx=-.44)
box('snow',0,.97,-1.88,.30,.33,.29,rx=-.35)

library=bpy.context.scene
library.name='Mount library'
library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
material=bpy.data.materials.new('Mount vertex palette');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.85
colour=material.node_tree.nodes.new('ShaderNodeVertexColor');colour.layer_name='MountTint'
material.node_tree.links.new(colour.outputs['Color'],shader.inputs['Base Color'])
roots=[]; objects={}
for name,mount_data in parts.items():
    root=bpy.data.objects.new('mount-'+name,None);library.collection.objects.link(root)
    root['seatY']=mount_data['seatY'];root['seatZ']=-.12
    root['contract']='Metres, Y-up/+Z forward after export. Rider hip rests at seatY. Shared rigid-part meshes; x-axis leg swing.'
    roots.append(root);joints={}
    for label,data in mount_data['parts'].items():
        joint=bpy.data.objects.new(name+'-'+label,None);library.collection.objects.link(joint)
        parent=joints[data['parent']] if data['parent'] else root
        parent_pivot=mount_data['parts'][data['parent']]['pivot'] if data['parent'] else (0,0,0)
        joint.parent=parent
        if label=='head': joint['reinAnchor']=[.337,.64,.80] if name=='horse' else [.482,.18,.55]
        joint.location=xyz(*(a-b for a,b in zip(data['pivot'],parent_pivot)))
        mesh=bpy.data.meshes.new(name+'-'+label+'-geometry')
        mesh.from_pydata(data['vertices'],[],data['faces']);mesh.materials.append(material)
        tint=mesh.color_attributes.new(name='MountTint',type='BYTE_COLOR',domain='CORNER')
        for face,color in zip(mesh.polygons,data['colors']):
            for index in face.loop_indices:tint.data[index].color=color
        mesh.update();obj=bpy.data.objects.new(name+'-'+label+'-mesh',mesh)
        library.collection.objects.link(obj);obj.parent=joint
        joints[label]=joint
    objects[name]=root
for directory in [EXPORT.parent,SOURCE.parent,ROOT/'public/ui']:directory.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
# Weld matching corners, quantize only shading/color, preserve positions and joint pivots.
cli=['npx','--yes','@gltf-transform/cli@4.5.0']
with tempfile.TemporaryDirectory(prefix='mossvale-mounts-') as tmp:
    welded=str(Path(tmp)/'weld.glb');quantized=str(Path(tmp)/'quantize.glb')
    for command in [['weld',str(EXPORT),welded],['quantize',welded,quantized,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['prune',quantized,str(EXPORT),'--keep-leaves']]:
        subprocess.run(cli+command,check=True)
raw=EXPORT.read_bytes();json_length=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+json_length])
for field in ['extensionsUsed','extensionsRequired']:document[field]=sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=raw[20+json_length:]
EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
assert len(document['materials'])==1 and not document.get('images')
assert EXPORT.stat().st_size<300_000
assert len(document['meshes'])==22
assert sum(p['boxes']*12 for data in parts.values() for p in data['parts'].values())<3500
for name in parts:
    for label in parts[name]['parts']:
        assert any(n.get('name')==name+'-'+label for n in document['nodes']),name+'-'+label

# Separate review scene, with linked geometry only. Never export gallery lights/cameras.
def clone_tree(source,scene):
    obj=source.copy();scene.collection.objects.link(obj)
    for child in source.children:
        copied=clone_tree(child,scene);copied.parent=obj
    return obj

def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
def setup_render(scene,width,height):
    scene.world=bpy.data.worlds.new(scene.name+' world');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.22,.28,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='Standard'
    for at,power,size in [((-4,8,6),750,5),((5,6,-4),950,4)]:
        bpy.ops.object.light_add(type='AREA',location=xyz(*at));lamp=bpy.context.object
        lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;aim(lamp,(0,1.1,0))
    bpy.ops.object.camera_add(location=xyz(5.5,3.9,7.5));camera=bpy.context.object
    camera.data.type='ORTHO';camera.data.ortho_scale=5;aim(camera,(0,1.3,0));scene.camera=camera

gallery=bpy.data.scenes.new('Mount gallery');bpy.context.window.scene=gallery
setup_render(gallery,1500,880)
for root,x in zip(roots,[-2.4,2.4]):
    obj=clone_tree(root,gallery);obj.location=xyz(x,0,0)
    bpy.ops.object.text_add(location=xyz(x,.012,2.40));text=bpy.context.object
    text.data.body='HEARTHLAND COURSER' if x<0 else 'FROSTPAW DIREWOLF'
    text.data.align_x='CENTER';text.data.size=.22;text.data.extrude=.002
    label=bpy.data.materials.get('Gallery labels') or bpy.data.materials.new('Gallery labels')
    label.use_nodes=True;label.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.7,.82,.85,1);text.data.materials.append(label)
bpy.ops.mesh.primitive_plane_add(size=200,location=xyz(0,-.03,0));floor=bpy.context.object
floor_material=bpy.data.materials.new('Gallery floor');floor_material.use_nodes=True
floor_material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.035,.065,.08,1)
floor_material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.95;floor.data.materials.append(floor_material)
gallery.camera.location=xyz(6,6.8,12);gallery.camera.data.ortho_scale=11.8;aim(gallery.camera,(0,1.1,.15))
gallery.render.filepath=str(PREVIEW)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
    for name,root in objects.items():
        scene=bpy.data.scenes.new(name+' thumbnail');bpy.context.window.scene=scene
        setup_render(scene,512,512);clone_tree(root,scene);scene.render.film_transparent=True
        scene.camera.data.ortho_scale=4.7;aim(scene.camera,(0,1.26,-.05))
        scene.render.filepath=str(ROOT/'public/ui'/('mount-'+name+'.png'))
        bpy.ops.render.render(write_still=True)
    bpy.context.window.scene=gallery
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('MOUNTS '+json.dumps({'bytes':EXPORT.stat().st_size,'materials':len(document['materials']),'mounts':{name:{'seatY':data['seatY'],'seatZ':-.12,'triangles':sum(p['boxes']*12 for p in data['parts'].values()),'joints':list(data['parts'])} for name,data in parts.items()}}))
