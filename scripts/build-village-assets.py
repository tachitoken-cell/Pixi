"""Build Mossvale's original village/NPC kit, plus an editable Blender gallery.

blender --background --python scripts/build-village-assets.py -- --render --optimize
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
EXPORT = ROOT / 'public/models/village-kit.glb'
SOURCE = ROOT / 'assets/source/village-kit.blend'
PREVIEW = ROOT / 'assets/source/village-kit-preview.png'
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

def window(x,y,z,w=.82,h=.92,turn=0,flowers=False):
    # Local front is +Z: make side windows with the same authored frame.
    def b(col,dx,dy,dz,bw,bh,bd):
        c,s=math.cos(turn),math.sin(turn)
        box(col,x+dx*c+dz*s,y+dy,z-dx*s+dz*c,bw,bh,bd,turn)
    b('wooddark',0,0,0,w+.22,h+.22,.09)
    b('window',0,0,.065,w,h,.045)
    for dx in [-w/2-.075,w/2+.075]:b('woodlight',dx,0,.06,.095,h+.15,.11)
    for dy in [-h/2-.06,h/2+.06]:b('woodlight',0,dy,.065,w+.2,.085,.11)
    b('wood',0,0,.104,.065,h,.06);b('wood',0,0,.104,w,.065,.06)
    for side in [-1,1]:
        b('teal',side*(w/2+.22),0,.02,.20,h+.10,.08)
        for dy in [-.26,.02,.28]:b('rooflight',side*(w/2+.22),dy,.072,.15,.025,.025)
    b('stonebright',0,-h/2-.15,.08,w+.36,.12,.22)
    if flowers:
        b('wood',0,-h/2-.23,.18,w+.1,.18,.27)
        for n in range(5):
            dx=(n-2)*w/5;b('leaf',dx,-h/2-.11,.20,.14,.14,.16)
            b('flower' if n%2 else 'gold',dx,-h/2+.015,.215,.09,.10,.08)

def door(x,z,height=1.9,width=.95,y=.28):
    box('wooddark',x,y+height/2,z,width+.24,height+.18,.13)
    for n in range(5):box('teal' if n%2 else 'roofdark',x+(n-2)*width/5,y+height/2,z+.084,width/5-.015,height,.065)
    for side in [-1,1]:box('woodlight',x+side*(width/2+.09),y+height/2,z+.06,.13,height+.26,.16)
    box('woodlight',x,y+height+.08,z+.06,width+.30,.14,.18)
    for yy in [.35,1.3]:box('iron',x-width*.34,y+yy,z+.13,.18,.065,.035)
    box('gold',x+width*.29,y+.92,z+.146,.065,.09,.06)
    box('stonebright',x,.14,min(z+.14,2.33),width+.30,.28,.30)

def roof(width,depth,base,top,tiers=9):
    for i in range(tiers):
        t=i/(tiers-1);w=width*(1-t)+.42*t;y=base+(top-base)*t
        box('roofdark',0,y,0,w,.22,depth)
        # Individual alternating shingles retain the chunky silhouette and visible seams.
        for side in [-1,1]:
            for n in range(6):
                z=(n-2.5)*depth/6+.025*(i%2)
                box('rooflight' if (i+n)%4==0 else 'teal',side*(w/2-.12),y+.065,z,.30,.16,depth/6-.04)
        if i%2==0:
            box('woodlight',0,y-.035,depth/2+.018,w,.11,.11)
            box('wood',0,y-.035,-depth/2-.018,w,.11,.11)
    box('rooflight',0,top+.125,0,.49,.12,depth+.09)

def foundation(w,d):
    box('stoneshade',0,.12,0,w-.045,.24,d-.045)
    for side in [-1,1]:
        for n in range(8):
            box('stonebright' if n%3==0 else 'stone',(n-3.5)*w/8,.19,side*(d/2-.085),w/8-.035,.25,.17)
        for n in range(5):box('stone',side*(w/2-.085),.185,(n-2)*d/5,.17,.24,d/5-.04)

prop('cottage')
foundation(5,5)
box('cream',0,1.66,0,4.58,2.85,4.28)
for x in [-2.19,0,2.19]:
    for z in [-2.15,2.15]:box('wood',x,1.67,z,.16,2.91,.16)
for y in [.43,2.94]:
    for z in [-2.18,2.18]:box('woodlight',0,y,z,4.65,.13,.13)
    for x in [-2.28,2.28]:box('wood',x,y,0,.14,.13,4.40)
for side in [-1,1]:
    for i in range(7):box('plaster',0,2.90+i*.20,side*2.05,4.15-i*.52,.20,.12)
    window(side*1.32,1.83,2.18,.60,.75,flowers=True)
    window(side*2.30,1.86,-.15,.80,.91,turn=side*math.pi/2)
window(0,1.78,-2.18,.78,.86,turn=math.pi)
door(0,2.19)
roof(5.30,4.80,3.05,4.65)
# Worn chimney and stepped rain cap; silhouette ends exactly five metres above ground.
for row in range(5):
    box('stone' if row%2 else 'stonebright',1.43,3.75+row*.20,-.79,.55,.20,.57)
    box('stoneshade',1.59,3.81+row*.20,-.496,.14,.045,.015)
box('stoneshade',1.43,4.82,-.79,.69,.15,.71)
box('stonebright',1.43,4.935,-.79,.78,.13,.78)
# Small stacked logs beside the rear wall remain within the solid footprint.
for n in range(5):box('woodlight',-1.77+n*.20,.44,-2.27,.16,.19,.34)

prop('inn')
foundation(6.4,5)
box('plaster',0,2.23,0,6.02,4.00,4.42)
box('cream',0,3.19,0,6.04,1.91,4.44)
for x in [-2.92,-1.55,0,1.55,2.92]:
    for z in [-2.23,2.23]:box('wood',x,2.24,z,.17,4.07,.15)
for y in [.44,2.52,4.19]:
    for z in [-2.24,2.24]:box('woodlight',0,y,z,6.13,.15,.15)
    for x in [-3.01,3.01]:box('wood',x,y,0,.15,.15,4.48)
for side in [-1,1]:
    for i in range(8):box('cream',0,4.13+i*(1.7/9),side*2.12,5.80-i*.71,.20,.13)
    for x in [-1.98,1.98]:window(x,1.65,side*2.26,.65,.79,turn=0 if side==1 else math.pi)
    for x in [-1.95,0,1.95]:window(x,3.31,side*2.26,.66,.86,turn=0 if side==1 else math.pi)
    for z in [-1.20,1.20]:window(side*3.035,3.27,z,.66,.85,turn=side*math.pi/2)
door(0,2.24,1.91,1.06)
roof(6.73,4.84,4.28,5.98,10)
# A brass lantern emblem on a sheltered oak sign marks the inn without baked text.
box('wooddark',2.58,2.45,2.40,.66,.73,.12)
box('woodlight',2.58,2.45,2.474,.54,.59,.028)
box('gold',2.58,2.46,2.495,.21,.27,.025)
for dx in [-.12,.12]:box('iron',2.58+dx,2.46,2.511,.035,.34,.023)
for dy in [-.18,.18]:box('iron',2.58,2.46+dy,2.51,.28,.04,.027)
box('iron',2.58,2.75,2.48,.04,.18,.05)
box('stone',-2.1,4.91,-.95,.55,1.55,.55)
box('stonebright',-2.1,5.74,-.95,.70,.17,.70)

prop('stall')
for x in [-1.37,1.37]:
    for z in [-.85,.85]:
        box('stoneshade',x,.08,z,.24,.16,.24)
        box('wood',x,1.33,z,.13,2.51,.13)
        box('brass',x,2.59,z,.20,.11,.20)
box('wooddark',0,.52,.16,2.90,.91,1.38)
for x in [-1.20,-.90,-.60,-.30,0,.30,.60,.90,1.20]:box('plank' if round(x*10)%2 else 'woodlight',x,.55,.877,.27,.76,.045)
box('woodlight',0,1.03,.16,3,.13,1.53)
box('wood',0,.12,.89,2.97,.13,.10)
for i in range(9):
    x=(i-4)*.33
    box('teal' if i%2 else 'cream',x,2.65,0,.33,.15,2)
    box('rooflight' if i%2 else 'white',x,2.81,-.37,.33,.18,1.25)
    box('teal' if i%2 else 'cream',x,2.50,.93,.32,.24,.14)
for x in [-.94,0,.94]:
    box('wood',x,1.14,.18,.81,.16,.81)
    for side in [-1,1]:box('woodlight',x+side*.40,1.24,.18,.045,.26,.83)
    for side in [-1,1]:box('plank',x,1.24,.18+side*.39,.82,.26,.045)
    for a in [-1,0,1]:
        for b in [-1,0,1]:
            tint='apple' if x<0 else 'red' if x==0 else 'pumpkin'
            box(tint,x+a*.22,1.33,.18+b*.22,.17,.17 if x<.5 else .24,.18,turn=.15*(a+b))
            if (a+b)%2==0:box('leaf',x+a*.22,1.44,.18+b*.22,.04,.06,.04)
box('wood',-1.08,.21,-.68,.48,.42,.47)
for side in [-1,1]:box('woodlight',-1.08+side*.16,.22,-.925,.06,.36,.035)
box('brass',1.15,1.21,.77,.17,.25,.13)
box('gold',1.15,1.34,.77,.26,.045,.17)

prop('well')
for row in range(3):
    for side in [-1,1]:
        for n in range(4):
            x=(n-1.5)*.40
            box('stonebright' if (n+row)%3==0 else 'stone',x,.115+row*.24,side*.74,.37,.23,.30)
            box('stone',side*.75,.115+row*.24,x,.30,.23,.36)
box('water',0,.40,0,1.14,.06,1.14)
for x,z,w,d in [(-.26,-.17,.28,.045),(.20,.28,.38,.042)]:box('waterlight',x,.434,z,w,.008,d)
for side in [-1,1]:
    box('stonebright',0,.85,side*.75,1.93,.16,.43)
    box('stonebright',side*.75,.85,0,.43,.16,1.07)
    box('wood',side*.81,1.47,0,.14,1.78,.15)
    box('woodlight',side*.81,2.37,0,.23,.06,.28)
box('wood',0,2.23,0,1.86,.13,.16)
box('iron',.99,2.17,0,.02,.28,.045)
box('woodlight',.97,2.02,.07,.04,.09,.19)
for i in range(8):box('cream',0,2.11-i*.13,0,.034,.13,.034)
for side in [-1,1]:box('woodlight',side*.15,1.00,0,.045,.31,.34)
for side in [-1,1]:box('wood',0,1.00,side*.15,.30,.31,.045)
box('wood',0,.85,0,.34,.06,.34)
box('iron',0,1.08,.18,.35,.05,.035)
box('iron',0,.91,.18,.35,.045,.035)

prop('lantern')
box('stoneshade',0,.07,0,.4,.14,.4)
box('stonebright',0,.18,0,.30,.11,.30)
box('wooddark',0,1.43,0,.12,2.50,.12)
for y in [.38,1.03,2.39]:box('brass',0,y,0,.17,.075,.17)
box('iron',0,2.79,0,.33,.08,.33)
box('window',0,2.76,0,.23,.36,.23)
for x in [-.145,.145]:
    for z in [-.145,.145]:box('iron',x,2.76,z,.04,.46,.04)
for y in [2.52,3.00]:box('brass',0,y,0,.37,.055,.37)
box('teal',0,3.055,0,.34,.045,.34)
box('rooflight',0,3.09,0,.20,.02,.20)

# Four independent, ground-normalised parts give each villager a restrained idle.
def villager(role):
    prop(role)
    skin='deepSkin' if role=='merchant' else 'skinlight' if role=='healer' else 'skin'
    cloth='cream' if role=='merchant' else 'cloak' if role=='warden' else 'robe'
    trim='teal' if role=='merchant' else 'cloakLight' if role=='warden' else 'robeLight'
    for side in [-1,1]:
        box('wooddark',side*.19,.11,.065,.29,.22,.48)
        box('leather' if role!='healer' else cloth,side*.19,.44,0,.25,.50,.31)
        box('brass',side*.19,.24,.235,.12,.04,.04)
    box(cloth,0,1.07,0,.70,.89,.43)
    box(trim,0,.64,.015,.80,.20,.49)
    box('leather',0,.92,.034,.73,.11,.47)
    box('gold',0,.92,.282,.13,.13,.055)
    for side in [-1,1]:box(trim,side*.36,1.48,0,.19,.20,.49)
    box('white' if role=='healer' else trim,0,1.50,.08,.44,.12,.37)
    if role=='merchant':
        box('teal',0,1.17,.258,.48,.43,.045)
        box('teal',0,.77,.276,.59,.37,.05)
        for side in [-1,1]:box('woodlight',side*.25,1.18,-.262,.065,.70,.055)
        box('wood',0,1.22,-.43,.61,.77,.41)
        box('plank',0,1.64,-.43,.66,.15,.43)
        for side in [-1,1]:box('cream',side*.22,1.23,-.655,.055,.73,.04)
        box('brass',0,1.51,-.666,.13,.12,.045)
        for i in range(3):box('purple' if i%2 else 'rooflight',(i-1)*.19,1.77,-.41,.17,.18,.31)
    elif role=='warden':
        for i in range(5):box('cloakLight' if i%2 else 'cloak',0,1.42-i*.20,-.265-i*.025,.73+i*.025,.24,.09)
        for i in range(5):box('leather',-.26+i*.12,1.40-i*.13,.263,.12,.18,.045)
        box('brass',.13,1.00,.30,.10,.10,.035)
        box('wood',-.46,1.18,-.24,.18,.62,.20)
        for i in range(3):box('cream',-.52+i*.06,1.61,-.24,.04,.31,.04)
    else:
        for i in range(4):box(trim if i%2 else cloth,0,.66-i*.12,.015,.77+i*.04,.15,.50+i*.025)
        for y in [.45,.69,1.16,1.37]:box('gold',0,y,.30,.055,.11,.025)
        box('teal',-.34,.88,.16,.22,.31,.22)
        box('brass',-.34,1.045,.16,.18,.045,.18)
    part('head',(0,1.64,0))
    box(skin,0,1.86,.025,.62,.56,.55)
    for side in [-1,1]:box(skin,side*.337,1.86,.025,.10,.17,.19)
    box('grayhair' if role=='healer' else 'hair',0,2.16,-.025,.67,.17,.59)
    box('grayhair' if role=='healer' else 'hair',0,1.99,-.26,.66,.30,.11)
    for side in [-1,1]:
        box('hair' if role!='healer' else 'grayhair',side*.284,2.00,.09,.10,.19,.25)
        box('shadow',side*.15,1.92,.308,.073,.076,.034)
        box('white',side*.162,1.945,.331,.025,.022,.015)
    box(skin,0,1.83,.338,.11,.11,.10)
    box('hair',0,1.727,.317,.15,.036,.027)
    if role=='merchant':
        box('hair',0,1.76,.312,.39,.095,.055)
        box('hair',0,1.69,.256,.28,.15,.17)
        box('roofdark',0,2.26,-.015,.72,.14,.64)
        box('teal',-.06,2.39,-.015,.55,.13,.51)
        box('gold',.19,2.31,.32,.09,.10,.035)
    elif role=='warden':
        box('cloak',0,2.29,-.035,.76,.15,.64)
        box('cloakLight',0,2.42,-.065,.60,.11,.50)
        box('cloak',0,2.50,-.09,.39,.05,.30)
        box('cream',-.30,2.40,-.035,.065,.28,.09,turn=-.22)
    else:
        box('gold',0,2.087,.302,.67,.055,.042)
        for side in [-1,1]:box('gold',side*.324,2.087,.07,.045,.055,.45)
        box('glass',0,2.105,.34,.095,.11,.055)
        box('grayhair',0,2.20,-.29,.42,.34,.19)
    for side,label in [(-1,'left-arm'),(1,'right-arm')]:
        part(label,(side*.47,1.48,0))
        box(cloth,side*.48,1.24,.01,.23,.47,.35)
        box(trim,side*.49,1.01,.035,.24,.12,.36)
        box(skin,side*.49,.87,.06,.20,.21,.24)
        if role=='merchant' and side==1:
            box('leather',.56,.88,.22,.23,.31,.16)
            box('brass',.56,1.015,.22,.13,.07,.14)
        if role=='warden' and side==1:
            box('wood',.65,1.24,.13,.055,2.10,.055)
            box('iron',.65,2.30,.13,.11,.21,.08)
            box('stonebright',.65,2.43,.13,.075,.18,.055)
            box('brass',.65,2.175,.13,.105,.08,.08)
        if role=='healer' and side==1:
            box('glass',.51,.96,.23,.24,.25,.24)
            box('potion',.51,.91,.23,.21,.15,.21)
            box('glass',.51,1.14,.23,.105,.14,.105)
            box('woodlight',.51,1.225,.23,.12,.06,.12)
            box('white',.45,1.00,.356,.033,.10,.015)
for role in ['merchant','warden','healer']:villager(role)

library=bpy.context.scene;library.name='Village kit library'
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
library['contract']='Ground-normalized village-cottage/inn/stall/well/lantern/merchant/warden/healer. Four independent NPC parts. One vertex-colour material; no textures.'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
if '--optimize' in sys.argv:
    # Keep POSITION floats and node transforms exact: quantized positions would move idle pivots.
    cli=['npx','--yes','@gltf-transform/cli@4.5.0']
    with tempfile.TemporaryDirectory(prefix='mossvale-village-') as temporary:
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

# Preserve the complete authoring library and a separately arranged, lit review scene.
gallery=bpy.data.scenes.new('Village kit gallery');bpy.context.window.scene=gallery
positions=[(-4.3,0,-2.8),(3.7,0,-3.6),(-5.8,0,3.5),(-1.7,0,3.5),(1.0,0,3.5),(3.1,0,3.4),(5.0,0,3.4),(6.9,0,3.4)]
for source,at in zip(roots,positions):
    parent=source.copy();gallery.collection.objects.link(parent);parent.location=xyz(*at)
    for child in source.children:
        obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));floor=bpy.context.object;floor.name='Gallery ground - not exported'
floor_mat=bpy.data.materials.new('Gallery ground');floor_mat.diffuse_color=(.095,.135,.12,1);floor.data.materials.append(floor_mat)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(17,13,24));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=23.5;aim(camera,(.1,1.7,0));gallery.camera=camera
for at,power,size in [((-8,13,8),2300,9),((7,10,3),1700,8)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(0,1.5,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-7,13,10));sun=bpy.context.object;sun.data.energy=1.4;sun.data.angle=.18;aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('Village gallery world');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.14,.18,.20,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
gallery.render.resolution_x=1800;gallery.render.resolution_y=1100;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW);gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('VILLAGE_KIT '+json.dumps({'cubes':counts,'triangles':sum(counts.values())*12,'glb_bytes':EXPORT.stat().st_size,'blend_bytes':SOURCE.stat().st_size}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
