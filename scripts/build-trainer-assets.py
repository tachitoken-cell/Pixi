"""Build five original Mossvale trainer and stable NPCs, with an editable Blender gallery.

blender --background --python scripts/build-trainer-assets.py -- --render --optimize
Metres, Y-up export, +Z front, ground-centred pivots. One vertex-colour material;
opaque voxel geometry only. Runtime owns NPC interaction, terrain and collision.
"""
import bpy
import json
import math
import sys
import subprocess
import struct
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/trainer-kit.glb'
SOURCE = ROOT / 'assets/source/trainer-kit.blend'
PREVIEW = ROOT / 'assets/source/trainer-kit-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)
COLORS = {
    'wood':'79543A', 'woodlight':'B08353', 'wooddark':'4B3C30', 'plank':'986E47',
    'cream':'DDCAA0', 'plaster':'C5B68E', 'stone':'818878', 'stonebright':'A4AB94', 'stoneshade':'586C65',
    'teal':'397B79', 'rooflight':'5A9690', 'roofdark':'2E5C62', 'brass':'C59D51', 'gold':'EDC874',
    'iron':'384A4A', 'window':'F3D490', 'shadow':'273F45', 'white':'E7E1C5',
    'leaf':'5F9750', 'leaflight':'91B05A', 'flower':'D98779', 'berry':'9A4B53',
    'red':'C0634D', 'apple':'A4BB61', 'pumpkin':'DF9C48', 'purple':'84658D',
    'skin':'D29B73', 'skinlight':'E8B890', 'deepSkin':'A46E54', 'hair':'583C31', 'grayhair':'C5C6B8',
    'robe':'738EA0', 'robeLight':'A0B7B6', 'leather':'695445', 'cloak':'427B58', 'cloakLight':'71A16E',
    'glass':'7BC5B4', 'potion':'AF779D', 'water':'437D91', 'waterlight':'72B3B4',
}
COLORS.update({'steel':'879FA8','steelLight':'B6CDD0','steelDark':'4A6472','navy':'354861','riding':'5B4E60','ridingLight':'8E6970','sand':'BC9F73','straw':'D6BD6B','mage':'59509A','mageLight':'8982C2','rune':'71DAD4','ginger':'9D5E3F','moss':'65894B'})
def linear(v): return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4
PALETTE = {key: tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,) for key,value in COLORS.items()}
def xyz(x,y,z): return (x,-z,y)
parts, pivots, counts = {}, {}, {}
active, current = '', 'body'

def prop(name, role='body', pivot=(0,0,0)):
    global active,current
    active,current=name,role
    parts[name]={};pivots[name]={};counts[name]=0
    part(role,pivot)

def part(name,pivot=(0,0,0)):
    global current
    current=name
    parts[active].setdefault(name,{'vertices':[],'faces':[],'colors':[]})
    pivots[active][name]=pivot

def box(tint,x,y,z,w,h,d,turn=0):
    data=parts[active][current];base=len(data['vertices']);c,s=math.cos(turn),math.sin(turn)
    px,py,pz=pivots[active][current]
    for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        xx,yy,zz=a*w/2,b*h/2,f*d/2
        data['vertices'].append(xyz(x+xx*c+zz*s-px,y+yy-py,z-xx*s+zz*c-pz))
    for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
        data['faces'].append(tuple(base+n for n in face));data['colors'].append(PALETTE[tint])
    counts[active]+=1

def boots(tint='leather', height=.40):
    for side in [-1,1]:
        box('wooddark',side*.20,.065,.08,.30,.13,.49)
        box(tint,side*.20,.16,.045,.29,.19,.43)
        box(tint,side*.20,.23+height/2,-.035,.26,height,.31)
        box('brass',side*.20,.29,.205,.10,.05,.04)

def face(skin='skin',hair='hair',beard=False):
    part('head',(0,1.64,0))
    box(skin,0,1.87,.035,.61,.55,.54)
    for side in [-1,1]:
        box(skin,side*.33,1.86,.015,.10,.16,.18)
        box(hair,side*.275,2.035,.07,.09,.18,.27)
        box('shadow',side*.15,1.945,.316,.075,.073,.027)
        box('white',side*.166,1.965,.332,.026,.022,.014)
        box(hair,side*.145,2.015,.312,.11,.031,.027)
    box(skin,0,1.84,.35,.105,.115,.10)
    box(hair,0,1.755,.319,.14,.028,.026)
    box(hair,0,2.16,-.005,.65,.16,.57)
    box(hair,0,1.97,-.26,.63,.32,.10)
    if beard:
        box(hair,0,1.70,.245,.39,.14,.20)
        box(hair,0,1.65,.28,.24,.09,.14)

def arms(cloth,trim,skin='skin',wide=.24):
    for side,label in [(-1,'left-arm'),(1,'right-arm')]:
        part(label,(side*.47,1.48,0))
        box(cloth,side*.50,1.25,.005,wide,.47,.35)
        box(trim,side*.51,1.01,.035,wide+.025,.12,.37)
        box(skin,side*.52,.88,.10,.21,.22,.25)

# Riding master: fitted plum coat, tall riding boots, split tails, crop and peaked cap.
prop('riding-trainer')
boots('wooddark',.46)
for side in [-1,1]:
    box('sand',side*.20,.68,0,.28,.28,.34)
    box('riding',side*.21,.81,-.18,.35,.53,.24)
box('riding',0,1.16,0,.70,.76,.44)
box('ridingLight',0,1.48,.035,.77,.16,.46)
box('cream',0,1.34,.252,.24,.39,.035)
for side in [-1,1]:
    for step in range(3):box('ridingLight',side*(.13+step*.05),1.47-step*.1,.274,.13,.10,.045)
    box('brass',side*.28,1.46,.27,.07,.045,.04)
box('leather',0,.94,.035,.74,.11,.47)
box('gold',0,.94,.298,.13,.12,.047)
for y in [1.15,1.29,1.43]:box('gold',0,y,.288,.04,.04,.027)
box('leather',-.38,.82,.02,.17,.26,.27)
face('skinlight','ginger')
box('riding',0,2.29,-.015,.69,.18,.59)
box('ridingLight',0,2.40,-.045,.53,.10,.45)
box('wooddark',0,2.23,.235,.76,.07,.45)
box('gold',0,2.30,.315,.10,.095,.035)
box('leather',0,1.68,-.08,.41,.10,.36)
arms('riding','ridingLight','skinlight')
part('right-arm',(.47,1.48,0))
box('wooddark',.535,1.17,.16,.045,.96,.045)
for y in [.86,.90,.94]:box('cream',.535,y,.16,.07,.022,.07)
box('leather',.535,1.65,.16,.065,.10,.06)
box('leather',.59,1.72,.16,.15,.055,.035)

# Stablehand: rolled cream sleeves, a stitched teal apron and a feed pouch held in the left hand.
prop('mount-seller')
boots('leather',.25)
for side in [-1,1]:box('sand',side*.20,.66,0,.30,.52,.34)
box('cream',0,1.20,0,.78,.67,.47)
box('teal',0,1.21,.265,.55,.57,.055)
box('roofdark',0,.75,.285,.70,.43,.06)
for side in [-1,1]:
    box('teal',side*.235,1.50,.16,.075,.18,.31)
    box('leather',side*.36,.90,.04,.10,.15,.47)
box('rooflight',0,1.18,.302,.37,.20,.045)
for x in [-.15,-.05,.05,.15]:box('cream',x,1.09,.331,.023,.045,.018)
box('brass',.34,.94,.29,.11,.10,.06)
face('deepSkin','hair',True)
box('sand',0,2.24,.02,.77,.08,.69)
box('sand',0,2.34,-.02,.56,.14,.50)
box('straw',0,2.435,-.04,.42,.05,.36)
box('teal',0,2.30,.24,.57,.075,.04)
arms('cream','white','deepSkin',.29)
part('left-arm',(-.47,1.48,0))
box('woodlight',-.57,.62,.18,.40,.39,.36)
box('sand',-.57,.83,.18,.34,.12,.30)
for side in [-1,1]:box('leather',-.57+side*.145,.78,.37,.047,.43,.04)
box('brass',-.57,.70,.38,.12,.10,.025)
for i in range(5):box('straw' if i%2 else 'cream',-.70+i*.062,.905+(i%2)*.045,.20,.035,.20,.035,turn=.2*i)

# Ranger: deep hood, pointed forest cape, layered leather and a full held bow/quiver.
prop('ranger-trainer')
boots('leather',.32)
for side in [-1,1]:box('wooddark',side*.20,.63,0,.27,.34,.32)
box('cloak',0,1.12,0,.69,.82,.43)
box('leather',0,1.26,.25,.60,.42,.075)
for i in range(4):box('moss',0,.80-i*.075,.245,.72-i*.11,.075,.06)
for i in range(6):box('cloakLight' if i%3==0 else 'cloak',0,1.50-i*.18,-.28-i*.017,.82-i*.055,.20,.11)
for i in range(6):box('leather',-.28+i*.10,1.48-i*.11,.304,.115,.11,.04)
box('gold',.11,1.04,.338,.11,.10,.028)
box('wooddark',.28,1.21,-.43,.28,.65,.26)
for y in [.96,1.44]:box('brass',.28,y,-.44,.30,.055,.28)
for i in range(3):
    box('woodlight',.19+i*.083,1.62,-.44,.035,.43,.035)
    box('cream',.19+i*.083,1.82,-.44,.07,.17,.055)
face('skin','hair')
box('cloak',0,2.26,-.07,.77,.22,.74)
box('moss',0,2.43,-.12,.57,.14,.51)
box('cloak',0,2.525,-.17,.28,.05,.29)
for side in [-1,1]:box('cloak',side*.345,1.94,-.04,.14,.47,.55)
box('cloakLight',0,1.625,.05,.75,.115,.47)
arms('cloak','leather')
part('left-arm',(-.47,1.48,0))
box('leather',-.53,.91,.17,.10,.26,.11)
for side in [-1,1]:
    for step in range(5):
        y=.91+side*(.15+step*.115);z=.21-.019*step*step
        box('woodlight' if step%2==0 else 'wood',-.53,y,z,.095,.115,.105)
box('cream',-.53,.91,-.10,.022,1.34,.022)
box('brass',-.53,.91,.17,.11,.055,.12)

# Knight: an open-face steel helm, articulated pauldrons, tabard, sword and heraldic shield.
prop('knight-trainer')
boots('steelDark',.34)
for side in [-1,1]:
    box('steel',side*.20,.65,0,.28,.34,.33)
    box('steelLight',side*.20,.52,.205,.25,.15,.09)
    for i in range(3):box('steelDark' if i%2 else 'steel',side*.23,.78-i*.05,.05,.40,.05,.51)
box('steelDark',0,1.19,0,.78,.69,.49)
box('steel',0,1.30,.115,.72,.46,.38)
box('steelLight',0,1.48,.20,.67,.12,.31)
box('navy',0,1.25,.333,.27,.48,.025)
box('navy',0,.74,.325,.29,.44,.03)
box('gold',0,1.28,.355,.06,.21,.022)
box('gold',0,1.31,.358,.19,.055,.024)
box('leather',0,.98,.025,.80,.10,.50)
box('gold',0,.98,.296,.15,.12,.05)
for side in [-1,1]:
    box('steelDark',side*.40,1.47,0,.26,.21,.52)
    box('steel',side*.46,1.55,0,.31,.16,.53)
    box('steelLight',side*.46,1.635,.03,.30,.06,.40)
face('skinlight','grayhair',True)
box('steel',0,2.26,-.035,.73,.23,.64)
box('steelLight',0,2.42,-.07,.51,.10,.47)
box('steelDark',0,2.20,.29,.76,.09,.10)
for side in [-1,1]:
    box('steel',side*.34,1.95,-.07,.11,.41,.53)
    box('steelLight',side*.34,1.80,.14,.12,.18,.16)
box('navy',0,2.48,-.02,.10,.13,.41)
arms('steelDark','steel','leather',.27)
part('right-arm',(.47,1.48,0))
box('leather',.56,.91,.18,.10,.28,.10)
box('gold',.56,.735,.18,.15,.085,.15)
box('steelLight',.56,1.08,.18,.41,.09,.13)
box('steel',.56,1.55,.18,.145,.85,.09)
box('steelLight',.523,1.55,.231,.035,.82,.013)
box('steelLight',.56,2.015,.18,.09,.12,.075)
box('steel',.56,2.09,.18,.045,.04,.05)
part('left-arm',(-.47,1.48,0))
for i in range(4):
    y=1.46-i*.19;width=.63 if i<2 else .50 if i==2 else .29
    box('steelLight',-.61,y,.38,width,.19,.16)
    box('navy',-.61,y,.471,width-.09,.15,.035)
box('gold',-.61,1.19,.506,.085,.48,.03)
box('gold',-.61,1.27,.508,.37,.075,.034)

# Mage: flared violet robes, stepped pointed hat, silver braid, spellbook and rune staff.
prop('mage-trainer')
boots('wooddark',.14)
for i in range(6):
    y=.29+i*.145;width=.87-i*.035
    box('mage' if i%2 else 'mageLight',0,y,.015,width,.16,.59-i*.017)
    box('gold',0,y,.324-i*.0085,.055,.10,.026)
box('mage',0,1.28,0,.69,.63,.44)
for side in [-1,1]:
    box('mageLight',side*.32,1.40,.15,.17,.31,.24)
    box('gold',side*.32,1.51,.281,.07,.07,.025)
box('gold',0,1.055,.025,.74,.08,.48)
box('rune',0,1.05,.297,.135,.13,.06)
box('mageLight',0,1.60,.025,.74,.12,.47)
face('deepSkin','grayhair')
for i in range(5):box('grayhair',-.30,1.84-i*.11,.25,.12,.105,.14)
box('gold',-.30,1.33,.25,.13,.07,.15)
box('mage',0,2.22,-.035,.97,.10,.80)
for i in range(4):box('mageLight' if i==1 else 'mage',-.035*i,2.33+i*.095,-.04,.63-i*.135,.115,.54-i*.11)
box('gold',0,2.30,.244,.64,.065,.06)
box('rune',0,2.30,.287,.11,.12,.055)
arms('mage','mageLight','deepSkin',.27)
part('left-arm',(-.47,1.48,0))
box('gold',-.55,.96,.31,.37,.45,.15)
box('white',-.55,.96,.365,.32,.37,.115)
box('navy',-.55,.96,.433,.39,.47,.045)
box('rune',-.55,.98,.463,.11,.18,.025)
box('gold',-.55,.98,.48,.19,.045,.02)
for y in [.78,1.14]:box('gold',-.55,y,.464,.23,.035,.02)
part('right-arm',(.47,1.48,0))
box('wooddark',.54,1.17,.18,.075,1.98,.075)
for y in [.87,.93,2.10]:box('gold',.54,y,.18,.105,.045,.105)
box('steel',.54,2.185,.18,.25,.14,.23)
box('rune',.54,2.36,.18,.24,.24,.23)
box('glass',.54,2.505,.18,.13,.075,.12)
for side in [-1,1]:box('gold',.54+side*.155,2.31,.18,.065,.30,.10)

library=bpy.context.scene;library.name='Trainer kit library'
library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
material=bpy.data.materials.new('Mossvale village vertex palette');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.82
colour=material.node_tree.nodes.new('ShaderNodeVertexColor');colour.layer_name='VillageTint'
material.node_tree.links.new(colour.outputs['Color'],shader.inputs['Base Color'])
roots=[]
for name,groups in parts.items():
    parent=bpy.data.objects.new('village-'+name,None);library.collection.objects.link(parent);roots.append(parent)
    parent['runtime_axes']='metres, Y up, +Z front, ground centre'
    parent['role']=name
    for role,data in groups.items():
        mesh=bpy.data.meshes.new('village-'+name+'-'+role)
        mesh.from_pydata(data['vertices'],[],data['faces']);mesh.update();mesh.materials.append(material)
        tint=mesh.color_attributes.new(name='VillageTint',type='BYTE_COLOR',domain='CORNER')
        for face,color in zip(mesh.polygons,data['colors']):
            face.use_smooth=False
            for index in face.loop_indices:tint.data[index].color=color
        child=bpy.data.objects.new('village-'+name+'-'+role,mesh);library.collection.objects.link(child);child.parent=parent
        child.location=xyz(*pivots[name][role])
        child['part']=role
for directory in [EXPORT.parent,SOURCE.parent]:directory.mkdir(parents=True,exist_ok=True)
library['contract']='Five ground-normalized riding, stable and class trainers. Four independent NPC idle parts; one village vertex-colour material; no textures. Metres, Y up, +Z front.'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
if '--optimize' in sys.argv:
    # Keep POSITION floats and node transforms exact: quantized positions would move idle pivots.
    cli=['npx','--yes','@gltf-transform/cli@4.5.0']
    with tempfile.TemporaryDirectory(prefix='mossvale-trainers-') as temporary:
        welded=str(Path(temporary)/'weld.glb');quantized=str(Path(temporary)/'quantize.glb');deduplicated=str(Path(temporary)/'dedup.glb')
        for command in [
            ['weld',str(EXPORT),welded],
            ['quantize',welded,quantized,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],
            ['dedup',quantized,deduplicated],['prune',deduplicated,str(EXPORT)],
        ]: subprocess.run(cli+command,check=True)
    # Attribute-only quantization needs the extension even though POSITION stays float.
    # The CLI omits this declaration when its position transform is skipped.
    raw=EXPORT.read_bytes();json_length=struct.unpack_from('<I',raw,12)[0]
    document=json.loads(raw[20:20+json_length])
    for field in ['extensionsUsed','extensionsRequired']:
        document[field]=sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
    encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
    tail=raw[20+json_length:]
    EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)

# Keep the authoring library at identity; a separate scene is only for visual review.
gallery=bpy.data.scenes.new('Trainer lineup');bpy.context.window.scene=gallery
for i,source in enumerate(roots):
    parent=source.copy();gallery.collection.objects.link(parent);parent.location=xyz((i-2)*2.15,0,0)
    for child in source.children:
        obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));floor=bpy.context.object;floor.name='Gallery ground - not exported'
floor_mat=bpy.data.materials.new('Gallery ground');floor_mat.diffuse_color=(.095,.135,.12,1);floor.data.materials.append(floor_mat)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(3.3,4.3,15));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=12.8;aim(camera,(0,1.30,0));gallery.camera=camera
for at,power,size in [((-5,9,8),1800,8),((6,7,3),1300,7)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(0,1.4,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-5,9,8));sun=bpy.context.object;sun.data.energy=1.25;sun.data.angle=.20;aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('Trainer gallery world');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.14,.18,.20,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
gallery.render.resolution_x=2000;gallery.render.resolution_y=950;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW);gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('TRAINER_KIT '+json.dumps({'cubes':counts,'triangles':sum(counts.values())*12,'draws':sum(len(groups) for groups in parts.values()),'glb_bytes':EXPORT.stat().st_size,'blend_bytes':SOURCE.stat().st_size}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
