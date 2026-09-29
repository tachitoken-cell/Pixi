"""Author Rootvault, Cindercrypt, Frosthollow and Nightroot prop libraries in Blender.
Select --theme=rootvault|cindercrypt|frosthollow|nightroot (default rootvault).

Blender --background --python scripts/build-dungeon-assets.py -- --render --optimize
Add --interior after running node scripts/export-dungeon-interior.mjs for the playable composition.
The library exports in metres, Y up and +Z forward. Runtime owns collisions and lights.
All repeated blocks are joined by prop/material, with baked vertex colours; no textures.
"""
import bpy
import json
import math
import random
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
THEME = next((arg.split('=', 1)[1] for arg in sys.argv if arg.startswith('--theme=')), 'rootvault')
assert THEME in ['rootvault', 'cindercrypt', 'frosthollow', 'nightroot']
TITLE = THEME.capitalize()
EXPORT = ROOT / f'public/models/{THEME}-kit.glb'
SOURCE = ROOT / f'assets/source/{THEME}-kit.blend'
PREVIEW = ROOT / f'assets/source/{THEME}-kit-preview.png'
random.seed(83019)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for old in list(bpy.data.materials):
    bpy.data.materials.remove(old)

COLORS = {
    'stone': '819487', 'light': 'B3BBA0', 'shadow': '4A625B', 'joint': '354F49',
    'moss': '718A4E', 'leaf': '98A961', 'root': '70543B', 'rootlight': '97764E',
    'gold': 'BD9651', 'goldlight': 'E0BE78', 'iron': '3A4441', 'wood': '624B37',
    'woodlight': '9B7446', 'water': '386E76', 'waterlight': '71B6B1',
    'cap': 'B298C2', 'caplight': 'D7B3D0', 'glow': 'D8FFC0', 'warmglow': 'FFE19C',
}
# Each old dungeon now owns its palette and relief geometry, with the same metric prop pivots.
COLORS.update({
    'cindercrypt': {'stone':'494039','light':'817363','shadow':'282526','joint':'171A1E','moss':'674234','leaf':'A2673B','root':'2D2524','rootlight':'604438','gold':'9D7140','goldlight':'E0A65A','iron':'343536','wood':'382B28','woodlight':'735341','water':'AA391C','waterlight':'FF8735','cap':'6D4A36','caplight':'B18049','glow':'FF7134','warmglow':'FFC36B'},
    'frosthollow': {'stone':'799CAD','light':'CADDE1','shadow':'3C657D','joint':'254556','moss':'D5E5E7','leaf':'EFF5EF','root':'507D97','rootlight':'91C7D5','gold':'AFC5CE','goldlight':'E0EDF1','iron':'44677C','wood':'4C6E80','woodlight':'92AFBC','water':'3B899F','waterlight':'ADFAFF','cap':'66A7CB','caplight':'D0F6FF','glow':'79E9FF','warmglow':'C5F9FF'},
    'nightroot': {'stone':'51475E','light':'8D829A','shadow':'2B2439','joint':'171724','moss':'485847','leaf':'83917A','root':'362B3D','rootlight':'74617D','gold':'9C8399','goldlight':'CEC0CD','iron':'3D374A','wood':'433444','woodlight':'756073','water':'534178','waterlight':'AB84DB','cap':'846EAD','caplight':'C6ACDB','glow':'C68BFF','warmglow':'D8B6FF'},
}.get(THEME, {}))
PALETTE = {k: tuple((int(v[i:i+2], 16)/255/12.92 if int(v[i:i+2], 16)/255 < .04045 else ((int(v[i:i+2], 16)/255+.055)/1.055)**2.4) for i in (0, 2, 4))+(1,) for k,v in COLORS.items()}
parts = {}
active = None
part_override = None
box_count = 0


def xyz(x, y, z): return (x, -z, y)


def prop(name):
    global active
    active = name
    parts[name] = {'stone': {'vertices': [], 'faces': [], 'colors': []}, 'glow': {'vertices': [], 'faces': [], 'colors': []}}


def box(tint, x, y, z, width, height, depth, turn=0, glow=False):
    global box_count
    role = part_override or ('glow' if glow else 'stone')
    data = parts[active].setdefault(role, {'vertices': [], 'faces': [], 'colors': []})
    first = len(data['vertices'])
    c,s = math.cos(turn), math.sin(turn)
    for a,b,d in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        xx,yy,zz = a*width/2,b*height/2,d*depth/2
        data['vertices'].append(xyz(x+xx*c+zz*s, y+yy, z-xx*s+zz*c))
    for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
        data['faces'].append(tuple(first+i for i in face))
        data['colors'].append(PALETTE[tint])
    box_count += 1


def rune(x,y,z,size=.12,turn=0):
    # Original branching lantern/tree seal, designed as a legible seven-pixel relief.
    rows = ['0001000','0101010','0011100','1001001','0111110','0001000','0011100']
    for row,line in enumerate(rows):
        for col,pixel in enumerate(line):
            if pixel == '1':
                dx=(col-3)*size
                box('glow',x+dx*math.cos(turn),y+(3-row)*size,z-dx*math.sin(turn),size*.70,size*.70,.055,turn,True)


def root_strand(x,z,y,steps,side=1):
    for i in range(steps):
        box('rootlight' if i%3==0 else 'root',x+side*math.sin(i*.57)*.10,y+i*.24,z+math.cos(i*.42)*.06,.16,.32,.18)
        if i%4 == 2: box('moss',x+side*.075,y+i*.24,z+.06,.19,.12,.20)


def pillar(x=0,z=0):
    # Exact base footprint 1.6 x 1.8; roots remain inside it below shoulder height.
    for y,w,h,d,c in [(.10,1.6,.20,1.8,'shadow'),(.26,1.46,.14,1.64,'light'),(.43,1.2,.20,1.36,'stone')]:
        box(c,x,y,z,w,h,d)
    for row in range(6):
        y=.87+row*.58
        box('stone' if row%2 else 'light',x,y,z,1.10,.54,1.20)
        box('shadow',x-.34,y,z+.606,.08,.37,.035)
        box('shadow',x+.34,y,z+.606,.08,.37,.035)
        if row%2: box('gold',x,y-.19,z+.633,.54,.055,.035)
    box('shadow',x,4.13,z,1.24,.18,1.32)
    box('light',x,4.33,z,1.58,.23,1.68)
    box('moss',x-.17,4.49,z,1.05,.09,1.35)
    rune(x,2.25,z+.638,.11)
    for xx,zz,length in [(-.62,.44,15),(.60,-.31,12),(.38,.66,7)]:
        root_strand(x+xx,z+zz,.17,length,-1 if xx<0 else 1)
    for dx,dz in [(-.52,.53),(.51,-.46),(.31,.66)]: box('root',x+dx,.08,z+dz,.34,.16,.42)


prop('arch')
for side in [-1,1]:
    pillar(side*3.8,0)
    for i in range(4):
        box('light' if i%2 else 'stone',side*(3.2-i*.71),4.69+i*.35,0,1.23,.46,1.37)
    box('gold',side*3.8,3.98,.72,.70,.11,.055)
    for n in range(6): box('moss' if n%2 else 'leaf',side*(3.66+n*.035),4.58-n*.18,.79,.18,.24,.12)
box('light',0,5.93,0,1.15,.90,1.64)
box('shadow',0,5.93,.836,.77,.63,.07)
rune(0,5.94,.90,.075)
box('gold',0,6.48,0,.52,.17,.84)

prop('pillar')
pillar()

prop('brazier')
# A tall slim hook suspends the lamp: all geometry fits within radius .35 at ground level.
box('shadow',0,.075,0,.42,.15,.42)
box('gold',0,.19,0,.30,.08,.30)
box('iron',0,1.49,0,.15,2.56,.15)
box('gold',0,2.82,0,.25,.13,.25)
for i in range(3): box('iron',0,2.91+i*.12,.09+i*.12,.14,.16,.30)
for i in range(6): box('gold' if i%2 else 'iron',0,2.77-i*.10,.39,.08,.15,.065)
box('iron',0,2.10,.39,.53,.15,.53)
box('gold',0,2.21,.39,.67,.10,.67)
for sx in [-1,1]:
    for sz in [-1,1]: box('iron',sx*.23,2.51,.39+sz*.23,.055,.62,.055)
box('gold',0,2.84,.39,.67,.10,.67)
box('warmglow',0,2.45,.39,.34,.45,.34,glow=True)
for dx,dz,y in [(-.11,.02,2.79),(.12,-.04,2.90),(0,.05,3.04)]: box('warmglow',dx,y,.39+dz,.13,.18,.13,glow=True)

prop('guardian')
# A carved, rooted guardian relief fits inside a solid pillar: 1.6 x 1.8 footprint.
box('shadow',0,.12,0,1.6,.24,1.8)
for x in [-.36,.36]:
    box('light',x,.39,.24,.52,.31,.76)
    box('stone',x,1.00,.02,.46,1.15,.48)
box('gold',0,1.47,.10,1.12,.19,.72)
box('stone',0,2.12,0,1.06,1.16,.80)
box('light',0,2.48,.25,.73,.46,.67)
for x in [-.64,.64]:
    box('light',x,2.45,0,.30,.55,.89)
    box('stone',x,1.94,.10,.25,.68,.45)
    box('shadow',x,1.64,.23,.30,.23,.43)
box('shadow',0,2.92,0,.49,.40,.52)
box('light',0,3.30,0,.85,.68,.75)
box('stone',0,3.51,-.04,1.04,.32,.94)
box('shadow',0,3.23,.395,.69,.15,.075)
for x in [-.21,.21]: box('glow',x,3.25,.444,.14,.075,.055,glow=True)
box('gold',0,3.49,.48,.11,.50,.08)
box('light',0,3.80,0,.62,.27,.69)
for x in [-.54,.54]: root_strand(x,.56,.17,12,-1 if x<0 else 1)
rune(0,2.08,.433,.075)

prop('chest')
box('iron',0,.07,0,1.32,.14,1.02)
box('wood',0,.33,0,1.24,.45,.95)
for x in [-.49,-.25,0,.25,.49]: box('woodlight',x,.33,.49,.19,.34,.035)
for z in [-.35,0,.35]:
    box('woodlight',-.636,.33,z,.035,.34,.24)
    box('woodlight',.636,.33,z,.035,.34,.24)
part_override='lid'
for layer in range(3): box('woodlight' if layer%2 else 'wood',0,.59+layer*.12,0,1.26,.14,.94-layer*.16)
part_override=None
for x in [-.47,.47]:
    box('gold',x,.34,.519,.115,.55,.06)
    part_override='lid'
    box('gold',x,.81,0,.115,.08,.68)
    box('gold',x,.70,.39,.115,.22,.08)
    box('gold',x,.70,-.39,.115,.22,.08)
    part_override=None
box('iron',0,.53,.54,.31,.35,.065)
box('goldlight',0,.55,.586,.18,.25,.04)
box('warmglow',0,.56,.613,.065,.12,.03,glow=True)
for x in [-.47,.47]:
    for y in [.16,.43]: box('goldlight',x,y,.56,.04,.045,.035)

prop('seal')
# Flat walking surface; the floating glyph is magic rather than a collision obstacle.
for i in range(24):
    a=i*math.tau/24
    box('gold' if i%3==0 else 'light',math.sin(a)*1.20,.025,math.cos(a)*1.20,.24,.05,.21,-a)
    if i%2 == 0: box('glow',math.sin(a)*.92,.064,math.cos(a)*.92,.10,.045,.10,glow=True)
for x,z,w,d in [(0,0,.12,1.25),(-.28,-.13,.65,.12),(.28,.17,.65,.12),(-.43,-.36,.12,.43),(.43,.38,.12,.43)]: box('glow',x,.069,z,w,.04,d,glow=True)

prop('checkpoint')
for i in range(16):
    a=i*math.tau/16
    box('light',math.sin(a)*1.22,.028,math.cos(a)*1.22,.28,.056,.22,-a)
    box('glow',math.sin(a)*1.00,.072,math.cos(a)*1.00,.11,.04,.11,glow=True)
for y,s in [(1.00,.23),(1.20,.42),(1.46,.55),(1.72,.30),(1.91,.13)]: box('glow',0,y,0,s,.24,s,math.pi/4,True)
for side in [-1,1]:
    for i in range(5): box('gold',side*(.24+i*.13),.52+i*.19,0,.17,.27,.18,side*.10)

prop('mushrooms')
for x,z,s in [(-.28,0,.68),(.26,.17,.46),(.10,-.30,.34)]:
    box('light',x,.48*s,z,.14*s,.96*s,.14*s)
    box('cap',x,.91*s,z,.84*s,.23*s,.74*s)
    box('caplight',x-.04*s,1.08*s,z,.57*s,.13*s,.55*s)
    for dx,dz in [(-.19,.10),(.17,-.13),(0,.20)]: box('warmglow',x+dx*s,1.01*s,z+dz*s,.09*s,.035*s,.08*s,glow=True)
for x,z in [(-.49,.08),(.25,.40),(.40,-.23)]: box('moss',x,.055,z,.27,.11,.25)

prop('pool')
# A real recessed basin: runtime cuts the floor here and animates the separate surface.
box('shadow',0,-.49,0,3.8,.08,2.9)
for side in [-1,1]:
    box('stone',0,-.23,side*1.325,3.8,.46,.25)
    box('stone',side*1.775,-.23,0,.25,.46,2.4)
for i in range(-3,4):
    for side in [-1,1]: box('light' if i%2 else 'stone',i*.52,.035,side*1.325,.50,.07,.25)
for i in range(-2,3):
    for side in [-1,1]: box('stone',side*1.775,.035,i*.52,.25,.07,.50)
parts[active]['water']={'vertices':[xyz(x,-.06,z) for x,z in [(-1.65,-1.2),(-1.65,1.2),(1.65,1.2),(1.65,-1.2)]], 'faces':[(0,1,2,3)], 'colors':[PALETTE['water']]}
for x,z in [(-1.44,1.32),(1.76,-.72)]:
    box('moss',x,.078,z,.19,.026,.20)

prop('wall')
# A 4m repeat module. Recessed mortar, staggered ashlar, footing and coping all
# stay inside the authoritative 4 x 1.2 x 4.4m envelope, including the moss.
box('joint',0,2.12,0,3.96,3.88,.94)
box('shadow',0,.12,0,4,.24,1.2)
box('light',0,.30,0,4,.12,1.14)
for row in range(6):
    edges=[-2,-1,0,1,2] if row%2==0 else [-2,-1.5,-.5,.5,1.5,2]
    for left,right in zip(edges,edges[1:]):
        shade=['stone','light','stone','shadow'][(row*3+int((left+2)*2))%4]
        box(shade,(left+right)/2,.67+row*.565,0,right-left-.035,.525,1.035+random.uniform(-.035,.035))
box('shadow',0,3.96,0,4,.14,1.10)
box('light',0,4.13,0,4,.20,1.18)
box('stone',0,4.29,0,4,.12,1.2)
for x,width in [(-1.64,.55),(-.61,.72),(.70,.39),(1.52,.66)]:
    box('moss',x,4.375,.025,width,.05,.93)
for side in [-1,1]:
    for x,y in [(-1.55,.44),(.58,1.48),(1.57,3.59)]:
        box('moss',x,y,side*.542,.23,.09,.023)
    box('gold',0,3.965,side*.562,3.82,.035,.02)

prop('gate')
# Fixed guide rails/housing plus a separate vertically sliding portcullis.
# gate-leaf and gate-glow move together; gate-stone remains in the doorway.
for side in [-1,1]:
    box('iron',side*4.12,2.18,0,.24,4.36,.46)
    for y in [.18,2.15,4.24]:
        box('gold',side*4.12,y,.255,.24,.15,.09)
box('iron',0,4.43,0,8.48,.34,.56)
box('gold',0,4.53,.285,7.76,.065,.03)
part_override='leaf'
for i in range(19):
    x=(i-9)*.41
    box('iron',x,2.20,0,.12,4.18,.15)
    box('gold',x,.13,0,.17,.21,.19)
for y in [.39,1.55,3.31,4.19]:
    box('iron',0,y,0,7.70,.16,.23)
    for x in [-3.28,-2.05,-.82,.82,2.05,3.28]:
        box('gold',x,y,.132,.095,.095,.04)
box('iron',0,2.43,.16,1.06,1.23,.17)
box('gold',0,2.43,.265,.88,1.04,.065)
box('shadow',0,2.43,.307,.64,.82,.045)
part_override=None
rune(0,2.43,.355,.081)

# Relief sits on existing solids; decorative faces never create new walking obstacles.
def shard(tint,x,y,z,width,height,depth,up=True,glow=False):
    role='glow' if glow else 'stone';data=parts[active][role];start=len(data['vertices'])
    foot=y if up else y+height;tip=y+height if up else y
    vertices=[(x-width/2,foot,z-depth/2),(x+width/2,foot,z-depth/2),(x+width/2,foot,z+depth/2),(x-width/2,foot,z+depth/2),(x,tip,z)]
    data['vertices'] += [xyz(*v) for v in vertices]
    faces=[(0,3,2,1),(0,1,4),(1,2,4),(2,3,4),(3,0,4)]
    data['faces'] += [tuple(start+i for i in face) for face in faces];data['colors'] += [PALETTE[tint]]*len(faces)

active='wall'
for side in [-1,1]:
    face=side*.57
    if THEME=='rootvault':
        # Broad root-carved pilasters and leaf clasps read across a large chamber.
        for x in [-1.47,1.47]:
            box('root',x,2.15,face,.17,3.26,.045)
            for y in [.65,1.65,2.65,3.65]:
                box('gold',x,y,face+side*.015,.34,.12,.025)
                box('leaf',x+.12, y+.13,face+side*.008,.25,.15,.02)
        box('shadow',0,2.34,face,.77,1.43,.032)
        for y in [1.66,3.02]: box('gold',0,y,face+side*.017,.82,.09,.02)
    elif THEME=='cindercrypt':
        for x in [-1.23,1.23]:
            box('iron',x,2.2,face,.79,2.65,.035)
            for y in [.93,3.47]: box('gold',x,y,face+side*.014,.88,.13,.025)
            for dx in [-.28,0,.28]: box('gold',x+dx,2.2,face+side*.014,.055,2.37,.02)
            box('glow',x,2.30,face+side*.016,.40,.10,.026,glow=True)
            shard('goldlight',x,2.70,face+side*.007,.44,.39,.04)
        for x in [-.48,.48]: box('shadow',x,.89,face,.15,.58,.03,side*.2)
    elif THEME=='frosthollow':
        box('waterlight',0,2.15,face,2.71,2.52,.025)
        for x in [-1.45,1.45]: box('light',x,2.16,face,.14,2.8,.04)
        for i in range(9):
            shard('light' if i%2 else 'waterlight',-1.6+i*.4,3.25+(i%3)*.15,face,.19,.66-(i%3)*.15,.05,False)
        for x in [-.7,.7]:
            for y in [1.20,2.05,2.90]: shard('glow',x,y,face+side*.012,.21,.29,.03,glow=True)
    else:
        for i in range(12):
            y=.5+i*.30
            for sideX in [-1,1]:
                x=sideX*(1.15+.25*math.sin(i*.6))
                box('rootlight' if i%3==0 else 'root',x,y,face-side*.017,.16,.36,.045,sideX*.25)
                if i%3==0: shard('gold',x-sideX*.14,y+.1,face,.25,.27,.045)
        box('shadow',0,2.2,face,1.06,1.75,.035)
        for i in range(7):
            a=math.pi*.55+i*math.pi*.9/6
            box('glow',math.cos(a)*.36,2.2+math.sin(a)*.55,face+side*.018,.10,.15,.023,glow=True)

for active in ['pillar','guardian']:
    top=3.4 if active=='guardian' else 3.85
    for angle in [0,math.pi/2,math.pi,math.pi*1.5]:
        radius=.54 if abs(math.sin(angle))>.5 else .61
        x,z=math.sin(angle)*radius,math.cos(angle)*radius
        if THEME=='rootvault':
            for y in [.70,1.20,2.90,top]: box('gold',x,y,z,.52,.085,.025,angle)
        elif THEME=='cindercrypt':
            box('iron',x,2.08,z,.56,1.26,.038,angle)
            for y in [1.49,2.68]: box('gold',x,y,z,.65,.12,.06,angle)
            for y in [1.78,2.12,2.46]: box('warmglow',x,y,z,.29,.08,.045,angle,True)
        elif THEME=='frosthollow':
            box('waterlight',x,2.10,z,.56,1.69,.033,angle)
            for y in [1.30,2.90]: box('light',x,y,z,.63,.11,.045,angle)
            for y in [1.63,2.1,2.57]: box('glow',x,y,z,.13,.25,.042,angle,True)
        else:
            box('shadow',x,2.11,z,.62,1.47,.03,angle)
            for y in [1.43,2.79]: box('gold',x,y,z,.68,.09,.035,angle)
            for y in [1.75,2.1,2.45]: box('glow',x,y,z,.17,.10,.039,angle,True)
    if THEME=='frosthollow':
        for x,z in [(-.44,.44),(.44,-.44),(.44,.44),(-.44,-.44)]: shard('waterlight',x,top-.12,z,.16,.50,.16)
    elif THEME=='nightroot':
        for x in [-.48,.48]: shard('rootlight',x,top-.2,.46,.30,.51,.22)

active='brazier'
# Pierced lower lantern apron and forged suspension hardware retain the original flame anchor.
for x in [-.24,0,.24]: box('iron',x,2.10,.65,.045,.23,.03)
for side in [-1,1]:
    box('gold',side*.29,2.52,.39,.04,.54,.49)
    box('goldlight',side*.28,2.82,.65,.085,.085,.025)

active='chest'
for side in [-1,1]:
    for x in [-.50,.50]: box('iron',x,.24,side*.505,.18,.25,.035)

# Material batches per prop. Vertex colours retain the palette after instancing.
materials = {}
for role in ['stone','glow','water']:
    material=bpy.data.materials.new(THEME+'-'+role)
    material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    color=material.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name='Color'
    material.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value=.84 if role=='stone' else .50
    shader.inputs['Metallic'].default_value=.12 if role=='stone' else 0
    if role=='glow':
        material.node_tree.links.new(color.outputs['Color'],shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value=1.8
    if role=='water':
        shader.inputs['Roughness'].default_value=.14
        shader.inputs['Metallic'].default_value=.05
        shader.inputs['Transmission Weight'].default_value=.70
        shader.inputs['IOR'].default_value=1.333
        shader.inputs['Alpha'].default_value=.82
        material.surface_render_method='DITHERED'
        noise=material.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=11
        noise.inputs['Detail'].default_value=2
        bump=material.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.21;bump.inputs['Distance'].default_value=.055
        material.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
        material.node_tree.links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    materials[role]=material
library=bpy.context.scene
library.name=TITLE+' asset library'
library.unit_settings.system='METRIC'
library.unit_settings.scale_length=1
roots=[]
for name,roles in parts.items():
    parent=bpy.data.objects.new(THEME+'-'+name,None)
    library.collection.objects.link(parent)
    parent['asset']=name
    parent['runtime_axes']='Y up, +Z forward; origin is ground centre'
    roots.append(parent)
    for role,data in roles.items():
        if not data['faces']: continue
        mesh=bpy.data.meshes.new(f'{name}-{role}')
        mesh.from_pydata(data['vertices'],[],data['faces'])
        mesh.update()
        color=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for face,rgba in zip(mesh.polygons,data['colors']):
            for index in face.loop_indices: color.data[index].color=rgba
        mesh.materials.append(materials['stone' if role in ['lid','leaf'] else role])
        obj=bpy.data.objects.new(f'{name}-{role}',mesh)
        library.collection.objects.link(obj)
        obj.parent=parent
        if name in ['wall','gate'] and role!='glow':
            bevel=obj.modifiers.new('Dressed masonry edges' if name=='wall' else 'Forged edges','BEVEL')
            bevel.width=.025 if name=='wall' else .012;bevel.segments=1
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.modifier_apply(modifier=bevel.name)
library['authoring']=TITLE+' temple details. Seed 83019. Flat shaded, joined vertex-colour meshes. No textures.'
library['collision']='Runtime src/dungeon.ts owns collision; wall 4x1.2x4.4m, gate width8m, pool opening3.3x2.4m at Y-.06 with basin bottom-.45. Gate leaf/glow slide upward; stone rails stay fixed.'
for folder in [SOURCE.parent,EXPORT.parent]: folder.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
    with tempfile.TemporaryDirectory(prefix='rootvault-gltf-') as temporary:
        paths=[str(Path(temporary)/f'{i}.glb') for i in range(3)]
        for command in [['weld',str(EXPORT),paths[0]],['quantize',paths[0],paths[1],'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['dedup',paths[1],paths[2]],['prune',paths[2],str(EXPORT)]]:
            subprocess.run(['npx','--yes','--prefer-offline','@gltf-transform/cli@4.5.0']+command,check=True)

# A second, fully lit gallery scene retains a reviewable arrangement in the Blender source.
gallery=bpy.data.scenes.new(TITLE+' gallery preview')
bpy.context.window.scene=gallery
placements={'arch':(-5.0,0,-1),'pillar':(2,0,0),'brazier':(4.8,0,2),'guardian':(7.2,0,2),'chest':(-.8,0,5),'seal':(2.5,0,5),'checkpoint':(6.2,0,6),'mushrooms':(-3.6,0,5.3),'pool':(-7.8,0,5.3),'wall':(5.6,0,-3),'gate':(-5,0,-1)}
for source in roots:
    at=placements[source['asset']]
    parent=source.copy();gallery.collection.objects.link(parent);parent.location=xyz(*at)
    for child in source.children:
        obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
floor_mesh=bpy.data.meshes.new('Gallery floor opening')
floor_mesh.from_pydata([xyz(x,-.015,z) for x,z in [(-100,-100),(-100,100),(100,100),(100,-100),(-9.45,4.1),(-9.45,6.5),(-6.15,6.5),(-6.15,4.1)]],[],[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
floor=bpy.data.objects.new('Gallery floor - not exported',floor_mesh);gallery.collection.objects.link(floor)
mat=bpy.data.materials.new('gallery-floor');mat.diffuse_color=(.075,.095,.086,1);floor.data.materials.append(mat)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(11,12,24))
camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=25;aim(camera,(-.5,1.5,1.6));gallery.camera=camera
for pos,power,size in [((-7,11,8),1900,9),((7,9,1),1350,8)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*pos));light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(0,1,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-5,10,6));sun=bpy.context.object;sun.data.energy=1.5;sun.data.angle=.22;aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new(TITLE+' gallery world');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.11,.15,.13,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
gallery.render.engine='CYCLES';gallery.cycles.samples=16;gallery.cycles.use_denoising=True
gallery.render.resolution_x=1600;gallery.render.resolution_y=1000;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW)
gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
for name,extent in [('wall',(4,4.4,1.2)),('gate',(8.48,4.6,.765)),('pool',(3.8,.1,2.9))]:
    vertices=[Vector(v) for child in next(root for root in roots if root['asset']==name).children for v in (child.matrix_local@vertex.co for vertex in child.data.vertices)]
    lower=[min(v[i] for v in vertices) for i in range(3)];upper=[max(v[i] for v in vertices) for i in range(3)]
    assert abs((upper[0]-lower[0])-extent[0])<.001 and lower[2]>=(-.531 if name=='pool' else -.001) and upper[2]<=extent[1]+.001, f'{name} has grounded authored bounds'
    assert upper[1]-lower[1]<=extent[2]+.001, f'{name} fits its depth envelope'
triangles=0
for parent in roots:
    for child in parent.children:
        child.data.calc_loop_triangles();triangles+=len(child.data.loop_triangles)
assert len(parts['pool']['water']['faces'])==1 and len(parts['pool']['water']['vertices'])==4
print('DUNGEON_KIT '+json.dumps({'theme':THEME,'props':len(parts),'boxes':box_count,'triangles':triangles,'glb_bytes':EXPORT.stat().st_size,'blend_bytes':SOURCE.stat().st_size}))
if '--render' in sys.argv and '--interior' not in sys.argv:bpy.ops.render.render(write_still=True)

if '--interior' in sys.argv:
    # Retain the actual runtime composition, with shared meshes and instance tints.
    # The JSON is exported from createDungeonWorld so this source cannot drift to a
    # different layout just for the beauty render.
    manifest=json.loads(Path('/tmp/rootvault-interior.json').read_text())
    interior=bpy.data.scenes.new('Rootvault playable interior')
    bpy.context.window.scene=interior
    interior.unit_settings.system='METRIC'
    axes=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    meshes={}
    for data in manifest['geometries']:
        mesh=bpy.data.meshes.new('interior-'+str(data['id']))
        vertices=list(zip(*[iter(data['positions'])]*3))
        indices=data.get('indices') or list(range(len(vertices)))
        mesh.from_pydata(vertices,[],list(zip(*[iter(indices)]*3)))
        colors=data.get('colors')
        color=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for loop in mesh.loops:
            i=loop.vertex_index*3
            color.data[loop.index].color=tuple(colors[i:i+3])+(1,) if colors else (1,1,1,1)
        mesh.update();meshes[data['id']]=mesh
    for batch in manifest['batches']:
        settings=batch.get('material',{})
        material=bpy.data.materials.new('interior-'+batch['name']);material.use_nodes=True
        nodes=material.node_tree.nodes;links=material.node_tree.links
        shader=nodes.get('Principled BSDF')
        vertex=nodes.new('ShaderNodeVertexColor');vertex.layer_name='Color'
        info=nodes.new('ShaderNodeObjectInfo')
        multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        links.new(vertex.outputs['Color'],multiply.inputs[1]);links.new(info.outputs['Color'],multiply.inputs[2])
        links.new(multiply.outputs[0],shader.inputs['Base Color'])
        shader.inputs['Roughness'].default_value=settings.get('roughness',.84)
        shader.inputs['Metallic'].default_value=settings.get('metalness',.12)
        emissive=settings.get('emissive',[0,0,0])
        if max(emissive)>0:
            links.new(multiply.outputs[0],shader.inputs['Emission Color'])
            shader.inputs['Emission Strength'].default_value=1.4
        if settings.get('water'):
            shader.inputs['Base Color'].default_value=(.025,.19,.21,1)
            shader.inputs['Roughness'].default_value=.13
            shader.inputs['Transmission Weight'].default_value=.65
            shader.inputs['IOR'].default_value=1.333
            noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=8
            bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.25;bump.inputs['Distance'].default_value=.065
            links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
        mesh=meshes[batch['geometry']]
        for index,instance in enumerate(batch['instances']):
            obj=bpy.data.objects.new(f"{batch['name']} {index+1}",mesh);interior.collection.objects.link(obj)
            values=instance['matrix'];obj.matrix_world=axes@Matrix([values[i::4] for i in range(4)])
            if not mesh.materials:mesh.materials.append(material)
            obj.material_slots[0].link='OBJECT';obj.material_slots[0].material=material
            tint=instance.get('color',[1,1,1]);base=settings.get('color',[1,1,1])
            obj.color=tuple(a*b for a,b in zip(tint,base))+(1,)
    view=manifest['camera']
    bpy.ops.object.camera_add(location=xyz(*view['position']))
    camera=bpy.context.object;aim(camera,view['target']);interior.camera=camera
    if view.get('orthoScale'):
        camera.data.type='ORTHO';camera.data.ortho_scale=view['orthoScale']
    else:camera.data.lens=35
    bounds=manifest.get('bounds',{'minX':-50,'maxX':50,'minZ':-100,'maxZ':20})
    centre=((bounds['minX']+bounds['maxX'])/2,0,(bounds['minZ']+bounds['maxZ'])/2)
    for offset,power,size in [((-18,35,18),5000,24),((25,28,-12),2800,20)]:
        pos=tuple(a+b for a,b in zip(centre,offset))
        bpy.ops.object.light_add(type='AREA',location=xyz(*pos));light=bpy.context.object
        light.data.energy=power;light.data.size=size;aim(light,centre)
    bpy.ops.object.light_add(type='SUN',location=xyz(-5,20,6));sun=bpy.context.object
    sun.data.energy=1.1;sun.data.angle=.25;aim(sun,(0,0,0))
    interior.world=bpy.data.worlds.new('Rootvault interior world');interior.world.use_nodes=True
    interior.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.11,.16,.14,1)
    interior.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
    interior.render.engine='CYCLES';interior.cycles.samples=12;interior.cycles.use_denoising=True
    interior.render.threads_mode='FIXED';interior.render.threads=2
    interior.render.resolution_x=1400;interior.render.resolution_y=933;interior.render.resolution_percentage=100
    interior.render.image_settings.file_format='PNG';interior.render.filepath=str(ROOT/'assets/source/rootvault-interior-preview.png')
    interior.view_settings.view_transform='AgX'
    interior['composition']='Exact runtime geometry and instance transforms from scripts/export-dungeon-interior.mjs. Camera and lighting are source-review presentation.'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/rootvault-interior.blend'),compress=True)
    print('ROOTVAULT_INTERIOR '+json.dumps({'objects':len(interior.objects),'shared_meshes':len(meshes)}))
    if '--render' in sys.argv:
        bpy.ops.render.render(write_still=True)
