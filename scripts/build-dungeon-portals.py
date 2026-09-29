"""Original Mossvale dungeon portals and tier props, authored in Blender.

Blender --background --python scripts/build-dungeon-portals.py -- --render
The GLB is texture-free, Y up, +Z forward, with grounded named prop roots.
The gallery's magic surface is a preview; the game supplies animated energy.
"""
import bpy
import json
import math
import random
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/dungeon-portals.blend'
EXPORT = ROOT / 'public/models/dungeon-portals.glb'
PREVIEW = ROOT / 'assets/source/dungeon-portals-preview.png'
random.seed(102030)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for old in list(bpy.data.materials):
    bpy.data.materials.remove(old)

COLORS = {
    'stone':'748075', 'light':'A7AB92', 'pale':'C4C3A5', 'shadow':'404F47',
    'joint':'28372F', 'moss':'657D3D', 'leaf':'92A75A', 'root':'604636',
    'rootlight':'896749', 'gold':'AF8B44', 'goldlight':'D8B96A', 'iron':'303C39',
    'green':'B3FF42', 'warm':'FFD78B', 'orange':'FF7A26', 'darkred':'704336',
    'obsidian':'39393F', 'ash':'786D64', 'ice':'75B9CF', 'icepale':'CBF0EC',
    'cyan':'7FEBFF', 'night':'454458', 'violet':'B595FF', 'purple':'70638D',
    'temple-root':'776E80', 'temple-rootlight':'B5B0AA', 'temple-joint':'423D48',
    'temple-amber':'927D5C', 'temple-amberlight':'D1B890', 'drygrass':'97984F',
    'temple-frost':'8A9DA9', 'temple-frostlight':'D1DEE0',
    'temple-night':'5E526A', 'temple-nightlight':'9B8BA9', 'fern':'607953', 'darkfern':'496C59',
    'rock':'666C65', 'bark':'433D38', 'lichen':'778066', 'sand':'AF8964',
    'sandlight':'D0AE7F', 'snow':'DDE8E6', 'white':'FFFFFF',
}
def linear(v):
    v = v / 255
    return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4
PALETTE = {key: tuple(linear(int(value[i:i+2],16)) for i in (0,2,4))+(1,) for key,value in COLORS.items()}
parts = {}
active = None
section = 'stone'
def xyz(x,y,z): return (x,-z,y)
def prop(name):
    global active
    active=name
    parts[name] = {}
def mesh(tint,vertices,faces,glow=False):
    data=parts[active].setdefault('glow' if glow else section,{'vertices':[],'faces':[],'colors':[]})
    offset=len(data['vertices'])
    data['vertices'].extend(xyz(*v) for v in vertices)
    data['faces'].extend(tuple(offset+i for i in face) for face in faces)
    data['colors'].extend([PALETTE[tint]]*len(faces))
def box(tint,x,y,z,w,h,d,turn=0,glow=False):
    c,s=math.cos(turn),math.sin(turn)
    vertices=[(x+a*w/2*c+e*d/2*s,y+b*h/2,z-a*w/2*s+e*d/2*c) for a,b,e in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    mesh(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],glow)
def taper(tint,x,y,z,w,h,d,top=.5,dx=0,dz=0,glow=False):
    vertices=[(x+a*w/2,y-h/2,z+b*d/2) for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    vertices += [(x+dx+a*w*top/2,y+h/2,z+dz+b*d*top/2) for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    mesh(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],glow)
def rod(tint,start,end,width,glow=False):
    a,b=Vector(start),Vector(end)
    along=(b-a).normalized()
    cross=along.cross(Vector((0,0,1)))
    if cross.length<.01: cross=along.cross(Vector((0,1,0)))
    cross.normalize();up=along.cross(cross).normalized()
    vertices=[tuple(p+cross*u*width/2+up*v*width/2) for p in [a,b] for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    mesh(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],glow)
def rune(x,y,z,size=.10,tint='green'):
    rows=['0001000','0101010','0011100','1001001','0111110','0001000','0011100']
    for row,line in enumerate(rows):
        for col,pixel in enumerate(line):
            if pixel=='1': box(tint,x+(col-3)*size,y+(3-row)*size,z,size*.66,size*.66,.04,glow=True)
def crystal(tint,x,y,z,w,h,dx=0,dz=0,glow=False):
    taper(tint,x,y+h*.25,z,w,h*.5,w,.86,dx*.45,dz*.45,glow)
    taper(tint,x+dx*.45,y+h*.75,z+dz*.45,w*.86,h*.5,w*.86,0,dx*.55,dz*.55,glow)

prop('portal')
for side in [-1,1]:
    x=side*3.85
    # Recessed joints, dressed blocks, carved hooded wardens, exposed rootwork.
    box('joint',x,4.35,0,1.63,8.4,1.5)
    for row in range(11):
        y=.6+row*.71
        box(['stone','light','stone','shadow'][row%4],x,y,0,1.67,.665,1.64)
        if row%3==0: box('gold',x,y-.22,.835,1.29,.065,.045)
        for seam in [-.47,.40]: box('shadow',x+seam,y,.835,.055,.40,.025)
    box('shadow',x,.12,.33,1.7,.24,2.46)
    box('light',x,.29,.33,1.69,.10,2.42)
    for y,w,h in [(7.94,1.82,.20),(8.16,2.10,.24),(8.39,2.25,.20)]: box('light' if y!=7.94 else 'shadow',x,y,0,w,h,1.84)
    # Long tapered robes use crisp facets and deep separate folds.
    taper('stone',x,2.14,1.15,1.46,3.50,1.16,.63)
    for offset in [-.54,-.25,.05,.35,.56]:
        taper('light' if offset<0 else 'shadow',x+offset,1.99,1.76,.15,3.18,.20,.48,dx=-offset*.42,dz=-.12)
    taper('light',x,4.09,1.18,1.44,.57,1.06,.53)
    box('shadow',x,4.40,1.19,1.16,.38,.92)
    # Hollow cowl: black face inset surrounded by faceted stone hood.
    box('joint',x,4.85,1.69,.64,.72,.16)
    for dx in [-.43,.43]: taper('stone',x+dx,4.90,1.40,.30,1.02,.85,.58,dx=-dx*.30)
    taper('light',x,5.39,1.35,.94,.42,.90,.40,dz=-.13)
    box('shadow',x,5.48,1.27,.57,.21,.67)
    for dx in [-.17,.17]: box('green',x+dx,4.94,1.793,.105,.083,.035,glow=True)
    # Hands hold a long gilded stone sword; vertical blade reinforces silhouette.
    for dx in [-.66,.66]:
        rod('stone',(x+dx,4.1,1.22),(x+dx*.59,3.08,1.84),.35)
        box('light',x+dx*.55,3.08,1.86,.30,.22,.32)
    box('gold',x,3.34,1.93,.14,.64,.16)
    box('goldlight',x,2.95,1.95,.93,.16,.20)
    taper('pale',x,1.98,1.94,.29,1.80,.13,.76)
    taper('light',x,1.00,1.94,.29,.24,.13,0)
    rune(x,3.76,1.755,.071)
    # Roots climb the external masonry only, leaving the actual doorway clear.
    for strand in range(2):
        base=x+side*(.62+strand*.12)
        previous=(base,.18,.73-strand*.34)
        for i in range(19):
            p=(base+math.sin(i*.54+strand)*.15,.40+i*.34,.77-strand*.34+math.cos(i*.4)*.055)
            rod('rootlight' if i%4==0 else 'root',previous,p,.13);previous=p
            if i%4==0:box('moss',p[0],p[1]+.04,p[2]+.07,.27,.13,.19)
    # Two low ritual braziers bracket the shared approach.
    bx=side*5.20;bz=1.55
    for y,w,h,t in [(.11,1.1,.22,'shadow'),(.28,.91,.12,'light'),(.64,.56,.64,'stone'),(1.04,.82,.15,'gold')]: box(t,bx,y,bz,w,h,w)
    taper('iron',bx,1.20,bz,.61,.24,.61,1.65)
    box('goldlight',bx,1.35,bz,1.10,.12,1.10)
    for i in range(5):
        a=i*math.tau/5
        crystal('warm' if i%2 else 'orange',bx+math.cos(a)*.23,1.42,bz+math.sin(a)*.23,.26,.55+(i%3)*.20,dx=side*.10,glow=True)
    for dx,dz in [(-.45,-.35),(.32,.31)]:box('moss',bx+dx,.065,bz+dz,.25,.13,.24)

# The inner opening remains exactly six metres wide and eight metres high.
box('shadow',0,.055,0,6,.11,1.58)
box('gold',0,.135,.37,6,.05,.18)
box('shadow',0,8.46,0,7.63,.31,1.61)
box('light',0,8.74,0,10.58,.24,1.91)
for i in range(9):box('stone' if i%3 else 'light',(i-4)*1.18,9.28,0,1.145,.83,1.79)
box('shadow',0,9.80,0,10.95,.17,1.95)
box('light',0,9.97,0,11.26,.18,2.06)
box('gold',0,8.89,1.00,9.62,.075,.04)
for side in [-1,1]:
    for i in range(8):
        y=.72+i*.94
        box('gold',side*3.055,y,.86,.09,.31,.06)
        box('green',side*3.055,y+.24,.865,.065,.09,.04,glow=True)
    # An original antlered lantern crest, in place of the reference's serpent.
    points=[(side*.35,9.50,1.05),(side*.91,9.73,1.06),(side*1.55,9.90,1.02),(side*2.23,9.81,1.0),(side*2.50,9.42,1.0)]
    for a,b in zip(points,points[1:]):rod('gold',a,b,.21)
    for i in [1,2]:rod('goldlight',points[i],(points[i][0]+side*.28,10.34+i*.10,1.0),.17)
    for j in range(6):box('moss' if j%2 else 'leaf',side*(4.44-j*.13),10.09-j*.06,.38,.50,.12,.80)
box('shadow',0,9.58,1.04,.78,1.03,.20)
taper('gold',0,9.79,1.12,.62,.82,.23,.48)
rune(0,9.77,1.265,.094)
box('goldlight',0,10.31,1.10,.45,.13,.37)

prop('summon-stone')
# A cracked, floating runestone held in a split brass cradle.
for y,w,h in [(.09,1.60,.18),(.23,1.36,.10),(.40,.98,.24)]:box('shadow' if y<.2 else 'light',0,y,0,w,h,w,math.pi/4)
for i in range(12):
    a=i*math.tau/12
    box('violet',math.sin(a)*.87,.195,math.cos(a)*.87,.12,.045,.12,glow=True)
for side in [-1,1]:
    for i in range(4):
        taper('gold',side*(.53+i*.11),.64+i*.22,0,.16,.26,.32,.77,dx=-side*.05)
taper('night',0,1.29,0,1.04,1.38,.67,.88,dx=-.13)
taper('purple',-.075,2.30,0,.84,.64,.61,.64,dx=.12)
box('shadow',-.01,1.58,.358,.65,1.18,.07)
rune(-.01,1.67,.408,.090,'violet')
for x,y,w in [(-.07,.80,.10),(.01,.99,.10),(.07,1.17,.12),(.10,2.14,.08),(.03,2.31,.09)]:box('cyan',x,y,.357,w,.22,.035,glow=True)
crystal('violet',0,2.64,0,.22,.26,glow=True)
for side in [-1,1]:box('goldlight',side*.46,1.80,.23,.07,.60,.075)

prop('cinder')
# An open ember reliquary, with an angular chimney and exposed molten core.
for y,w,h,t in [(.12,2.46,.24,'obsidian'),(.31,2.23,.15,'ash'),(.50,1.87,.22,'darkred')]:box(t,0,y,0,w,h,w,math.pi/4)
box('orange',0,.65,0,1.18,.07,1.18,math.pi/4,True)
for i in range(8):
    a=i*math.tau/8
    x,z=math.sin(a),math.cos(a)
    taper('obsidian',x*.98,1.10,z*.98,.42,1.12,.42,.62,dx=-x*.12,dz=-z*.12)
    taper('ash',x*.86,1.79,z*.86,.33,.29,.33,.65)
    crystal('orange',x*.46,.80,z*.46,.32,.78+(i%3)*.27,dx=-x*.16,dz=-z*.16,glow=True)
for side in [-1,1]:
    taper('obsidian',side*.87,2.24,0,.40,1.39,.47,.73,dx=-side*.19)
    box('gold',side*.68,2.92,0,.58,.12,.61)
box('ash',0,3.07,0,1.69,.21,.64)
box('obsidian',0,3.32,0,1.18,.27,.77)
crystal('warm',0,1.06,0,.58,1.57,dx=.10,glow=True)
rune(0,.37,1.16,.061,'orange')

prop('frost')
# A broken ice crown around a suspended blue heart, not a recoloured fire prop.
for i in range(7):
    a=i*math.tau/7
    x,z=math.sin(a),math.cos(a)
    box('icepale' if i%2 else 'ice',x*.55,.12,z*.55,1.03,.24,1.03,a)
    crystal('ice',x*.83,.23,z*.83,.63,1.23+(i%3)*.55,dx=x*.43,dz=z*.43)
    crystal('icepale',x*.80,.25,z*.80,.20,1.14+(i%3)*.50,dx=x*.40,dz=z*.40)
crystal('cyan',0,1.17,0,.87,2.44,dx=-.22,dz=.07,glow=True)
for side in [-1,1]:
    rod('icepale',(side*.65,1.69,.12),(side*1.15,2.49,.12),.17)
    rod('icepale',(side*.90,2.08,.12),(side*1.35,2.08,.12),.14)

prop('nightroot')
# A small twisted root shrine, crowned with violet buds and a hanging star.
for x,z,w in [(-.70,-.10,1.0),(.70,.04,1.0),(0,0,1.2)]:box('night',x,.12,z,w,.24,1.14)
for side in [-1,1]:
    points=[(side*1.02,.10,.22),(side*.89,.90,.09),(side*1.03,1.77,0),(side*.73,2.51,-.05),(side*.34,3.11,0),(side*.13,3.57,.04)]
    for i,(a,b) in enumerate(zip(points,points[1:])):
        rod('rootlight' if i%2 else 'root',a,b,.37-i*.045)
        rod('purple',(a[0],a[1],a[2]+.20),(b[0],b[1],b[2]+.13),.06)
    for i in [1,2,3]:
        at=points[i];end=(at[0]+side*(.50-i*.05),at[1]+.60,at[2])
        rod('root',at,end,.16)
        crystal('violet',end[0],end[1],end[2],.22,.32,dx=-side*.09,glow=True)
    for i in range(3):rod('root',(side*.94,.17,.12),(side*(1.34+i*.04),.14,-.45+i*.34),.17)
rod('gold',(0,3.48,.04),(0,2.75,.04),.055)
crystal('violet',0,2.08,.04,.45,.68,glow=True)
box('night',0,.51,.18,1.17,.60,.72)
rune(0,.55,.56,.083,'violet')

# Faceted rock stays inside its authored footprint, including the chipped upper rings.
def rock(tint,x,y,z,w,h,d):
    vertices=[]
    for level,spread in [(0,.90),(.22,1),(.69,.87),(1,.56)]:
        for i in range(8):
            a=i*math.tau/8
            radius=spread*(1 if level==0 else random.uniform(.85,1))
            vertices.append((x+math.cos(a)*w*.5*radius,y+h*level,z+math.sin(a)*d*.5*radius))
    faces=[tuple(reversed(range(8))),tuple(range(24,32))]
    for row in range(3):
        for i in range(8):
            a=row*8+i;b=row*8+(i+1)%8
            faces.extend([(a,b,b+8),(a,b+8,a+8)])
    mesh(tint,vertices,faces)

# Shared interior stone: normalized so encounter-wall collision drives its dimensions.
prop('cave-rock')
rock('white',0,0,0,1,1,1)

# One ground plan drives these Blender meshes, game collision and the worn route.
plan=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import * as p from './src/dungeon-approach-layout.ts';console.log(JSON.stringify(p))"],cwd=ROOT,text=True))
walls=plan['DUNGEON_TEMPLE_WALLS'];columns=plan['DUNGEON_TEMPLE_PILLARS'];routes=plan['DUNGEON_TEMPLE_ROUTES']

for theme,stone,edge,growth in [('rootvault','temple-root','temple-rootlight','fern'),('cindercrypt','temple-amber','temple-amberlight','drygrass'),('frosthollow','temple-frost','temple-frostlight','snow'),('nightroot','temple-night','temple-nightlight','darkfern')]:
    random.seed({'rootvault':117,'cindercrypt':248,'frosthollow':369,'nightroot':471}[theme])
    prop('approach-'+theme)
    for wi,wall in enumerate(walls):
        x,z,w,d,h=[wall[key] for key in ['x','z','width','depth','height']]
        along=w>d;length=max(w,d);thickness=min(w,d);count=math.ceil(length/2.1);span=length/count
        def block(tint,u,y,v,bw,bh,bd):
            box(tint,x+(u if along else v),y,z+(v if along else u),bw if along else bd,bh,bd if along else bw)
        block(stone,0,.15,0,length,.3,thickness)
        for i in range(count):
            u=-length/2+(i+.5)*span
            # Courses collapse toward the open breaches, leaving jagged, sloping ends.
            crest=h*(.72+.28*math.sin(i*1.4+wi)**2)
            if wi not in (0,5):crest*=min(1,.25+min(i,count-1-i)*.40)
            rows=max(1,round(crest/.8));course=max(.2,(crest-.30)/rows)
            for row in range(rows):
                tint=edge if (i*7+row*3+wi)%13==0 else stone
                block(tint,u,.30+(row+.5)*course,0,span-.045,course-.032,thickness-.08)
                # Fine recessed joints and chipped face insets give the ruin human scale.
                if (row+i)%8==0:
                    for side in [-1,1]:block('temple-joint',u+span*.19,.30+(row+.53)*course,side*(thickness*.5-.035),.07,course*.49,.025)
            if i%5==2:
                block(edge,u,crest+.085,0,span-.02,.17,thickness)
            else:
                taper(stone,x+(u if along else 0),crest+.13,z+(0 if along else u),span-.10 if along else thickness,.26,thickness if along else span-.10,.46,dx=.12 if along else 0,dz=0 if along else .12)
            if i%5==0:
                block(edge,u,crest+.27,0,span*.54,.22,thickness*.84)
            # Relief strips survive selectively on the cloister walls.
            if wi in (0,5,9,13) and i%3==1 and crest>3.3:
                for side in [-1,1]:
                    block(edge,u,1.7,side*(thickness*.5-.09),.24,2.7,.18)
                    block(edge,u,3.14,side*(thickness*.5-.09),.68,.18,.18)
                    block('temple-joint',u,2.1,side*(thickness*.5-.025),.095,.67,.025)
            section='foliage'
            if theme=='frosthollow':
                block('snow',u,crest+.22,0,span*.96,.17,thickness*.99)
            elif (i+wi)%3!=0:
                block(growth,u+span*.14,crest+(.195 if i%5==2 else .035),0,span*.47,.055,thickness*.76)
                if theme!='cindercrypt' and crest>1.2:
                    for j in range(3):block(growth,u+span*.14+j*.11,crest-.15-j*.24,thickness*.5,.18,.33,.065)
            section='stone'

    for index,p in enumerate(columns):
        x,z,w,d,h=[p[key] for key in ['x','z','width','depth','height']]
        box(stone,x,.14,z,w,.28,d)
        box(edge,x,.35,z,w*.9,.14,d*.9)
        if h<1.8:
            # A toppled capital in a small side alcove, away from the crossing route.
            box(stone,x,h*.58,z,w*.88,h*.55,d*.68,.08)
            box(edge,x,h-.06,z,w*.92,.12,d*.74,.08)
        else:
            shaft_w=w*.66;shaft_d=d*.66
            for row in range(max(2,round((h-.9)/.57))):
                y=.64+row*.57
                box(edge if row%7==0 else stone,x,y,z,shaft_w,.53,shaft_d)
                for side in ([-1,1] if row%2==0 else []):
                    box('temple-joint',x+side*shaft_w*.22,y,z+shaft_d*.5,.065,.39,.025)
                    box(edge,x+side*shaft_w*.39,y,z+shaft_d*.5,.095,.46,.045)
            box(edge,x,h-.25,z,w*.78,.17,d*.78)
            box(stone,x,h-.065,z,w*.91,.20,d*.91)
            box(edge,x,h+.12,z,w,.17,d)
            # Carved, unlit diamond medallions do not imitate the portal's magic.
            for sign in [-1,1]:
                a=(x,h*.61,z+sign*(shaft_d*.5+.06))
                pts=[(a[0]-.23,a[1],a[2]),(a[0],a[1]+.36,a[2]),(a[0]+.23,a[1],a[2]),(a[0],a[1]-.36,a[2])]
                for v,b in zip(pts,pts[1:]+pts[:1]):rod(edge,v,b,.075)
        section='foliage'
        if theme=='frosthollow':box('snow',x,h+.26 if h>=1.8 else h+.1,z,w*.93,.16,d*.93)
        else:
            for j in range(5):
                bx=x+random.uniform(-w*.35,w*.35);bz=z+random.uniform(-d*.35,d*.35)
                rod(growth,(bx,.32,bz),(bx+random.uniform(-.2,.2),.80+random.random()*.55,bz+.08),.08)
        section='stone'

    # Broken entrance entablature; the absent centre admits sky and surrounding woodland.
    for gate_z,gate_h in [(62,7.86),(42,7.35)]:
        for side in [-1,1]:
            for i in range(3 if side<0 else 2):
                x=side*(6.9-i*.94)
                box(stone,x,gate_h,gate_z,.90,.57,1.36)
                box(edge,x,gate_h+.37,gate_z,.95,.15,1.53)
    # Two offset arches reveal the next courtyard one turn at a time.
    for center,z,height in [(8,24,8.1),(-8,14,7.5)]:
        for i in range(7):
            x=center+(i-3)*1.1;y=height+.35+(.85*(1-abs(i-3)/3))
            box(stone if i%3 else edge,x,y,z,1.06,.63,1.34)
        box(edge,center,height+1.42,z,1.42,.22,1.5)
        box('temple-joint',center,height+1.12,z+.69,.37,.34,.025)
    # Small hanging roots and frost nibble at the surviving lintels.
    section='foliage'
    for center,z,height in [(8,24,8.1),(-8,14,7.5)]:
        for j in range(5):
            x=center+(j-2)*.71
            if theme=='frosthollow':
                taper('icepale',x,height-.18,z+.57,.14,.76,.14,1)
            elif theme in ('rootvault','nightroot'):
                rod('root' if theme=='rootvault' else 'bark',(x,height+.15,z+.68),(x+.08,height-.60-j*.08,z+.70),.10)
                box(growth,x+.08,height-.60-j*.08,z+.70,.29,.12,.22)
    # Ferns, leaf litter and snow occupy the wall edges; soil remains visible between flagstones.
    for wi,wall in enumerate(walls):
        x,z,w,d,h=[wall[key] for key in ['x','z','width','depth','height']]
        along=w>d;length=max(w,d)
        for i in range(max(2,int(length/4.5))):
            u=-length/2+.9+i*4.4
            if u>length/2-.4:continue
            face=(min(w,d)/2+.20)*(1 if along or x<0 else -1)
            bx=x+(u if along else face);bz=z+(face if along else u)
            if theme=='frosthollow':
                rock('snow',bx,0,bz,.85,.23,1.1)
            elif theme=='cindercrypt':
                for j in range(4):
                    rod('drygrass',(bx,.03,bz),(bx+random.uniform(-.3,.3),random.uniform(.35,.65),bz+random.uniform(-.3,.3)),.055)
            else:
                for a in [0,1.25,2.5,3.75,5]:
                    end=(bx+math.cos(a)*.48,.57,bz+math.sin(a)*.48)
                    rod(growth,(bx,.05,bz),end,.07)
                    for j in range(3):
                        t=(j+1)/4;lx=bx+(end[0]-bx)*t;lz=bz+(end[2]-bz)*t
                        half=(.36-j*.06)*.5;ly=.08+t*.5
                        mesh(growth,[(lx-half*math.cos(a),ly,lz-half*math.sin(a)),(lx-.075*math.sin(a),ly,lz+.075*math.cos(a)),(lx+half*math.cos(a),ly+.025,lz+half*math.sin(a)),(lx+.075*math.sin(a),ly,lz-.075*math.cos(a))],[(0,1,2,3)])
                if wi%2==0:
                    rod('bark' if theme=='nightroot' else 'root',(bx,.15,bz),(bx+.2,min(2.8,h),bz+.25),.17)
    section='stone'


materials={}
for role in ['stone','glow','foliage']:
    material=bpy.data.materials.new('dungeon-'+role);material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    color=material.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Color'
    material.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value=.35 if role=='glow' else .94
    shader.inputs['Metallic'].default_value=.06
    if role=='glow':
        material.node_tree.links.new(color.outputs['Color'],shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value=3
    materials[role]=material
library=bpy.context.scene;library.name='Dungeon portal asset library'
library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
roots=[];triangles=0;bounds={}
for name,roles in parts.items():
    parent=bpy.data.objects.new('dungeon-'+name,None);library.collection.objects.link(parent)
    parent['asset']=name;parent['runtime_axes']='Y up, +Z forward, ground origin'
    roots.append(parent)
    for role,data in roles.items():
        geometry=bpy.data.meshes.new(name+'-'+role);geometry.from_pydata(data['vertices'],[],data['faces']);geometry.update()
        color=geometry.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for face,rgba in zip(geometry.polygons,data['colors']):
            for index in face.loop_indices:color.data[index].color=rgba
        geometry.materials.append(materials[role])
        obj=bpy.data.objects.new(name+'-'+role,geometry);library.collection.objects.link(obj);obj.parent=parent
        geometry.calc_loop_triangles();triangles+=len(geometry.loop_triangles)
    vertices=[v for child in parent.children for v in child.data.vertices]
    lo=[min(v.co[i] for v in vertices) for i in range(3)];hi=[max(v.co[i] for v in vertices) for i in range(3)]
    bounds[name]={'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]]}
    assert lo[2]>=-.035, name+' is grounded'
print('AUTHORED_TRIANGLES',triangles)
assert triangles < 150000
assert max(abs(v.co[0]) for child in roots[0].children for v in child.data.vertices)<6
assert bounds['summon-stone']['max'][1]<=3
assert max(math.hypot(v.co[0],v.co[1]) for child in roots[1].children for v in child.data.vertices)<=1.2
for folder in [SOURCE.parent,EXPORT.parent]:folder.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
# Use the same decoder-free packing as the existing frontier biome library.
with tempfile.TemporaryDirectory(prefix='mossvale-dungeon-') as tmp:
    a,b,c=[str(Path(tmp)/f'{i}.glb') for i in range(3)]
    for args in [['weld',str(EXPORT),a],['quantize',a,b,'--pattern','{POSITION,NORMAL,COLOR_*}','--quantize-position','16','--quantize-normal','8','--quantize-color','8'],['dedup',b,c],['prune',c,str(EXPORT)]]:
        subprocess.run(['npx','--yes','@gltf-transform/cli@4.5.0']+args,check=True)
assert EXPORT.stat().st_size < 4_000_000

# A separate presentation scene keeps all gallery-only geometry out of gameplay.
gallery=bpy.data.scenes.new('Portal and summon stone preview');bpy.context.window.scene=gallery
placements={'portal':(0,0,0),'summon-stone':(7.4,0,2.5),'cinder':(-7.8,0,-1.0),'frost':(7.2,0,-3.0),'nightroot':(-9.0,0,3.0)}
for source in roots:
    if source['asset'] not in placements: continue
    parent=source.copy();gallery.collection.objects.link(parent);parent.location=xyz(*placements[source['asset']])
    for child in source.children:
        obj=child.copy();gallery.collection.objects.link(obj);obj.parent=parent
def plain_material(name,color,roughness=.8,emission=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;s=mat.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value=color;s.inputs['Roughness'].default_value=roughness
    if emission:s.inputs['Emission Color'].default_value=color;s.inputs['Emission Strength'].default_value=emission
    return mat
floor_mat=plain_material('Preview floor',(.035,.048,.034,1))
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='Preview floor - not exported';floor.data.materials.append(floor_mat)
# Turbulent inset rim and star field approximate the in-game shader in one plane.
bpy.ops.mesh.primitive_plane_add(size=2,location=xyz(0,4.21,.13),rotation=(math.pi/2,0,0))
energy=bpy.context.object;energy.name='Preview energy - runtime supplies animation';energy.scale=(3.00,4.055,1)
mat=bpy.data.materials.new('Preview animated portal surface');mat.use_nodes=True
n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
out=n.new('ShaderNodeOutputMaterial');emit=n.new('ShaderNodeEmission');l.new(emit.outputs[0],out.inputs['Surface'])
uv=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');l.new(uv.outputs['UV'],sep.inputs[0])
def mathnode(operation,a,b=None):
    node=n.new('ShaderNodeMath');node.operation=operation
    for slot,value in enumerate([a,b]):
        if value is None:continue
        if isinstance(value,(int,float)):node.inputs[slot].default_value=value
        else:l.new(value,node.inputs[slot])
    return node.outputs[0]
edge=mathnode('MAXIMUM',mathnode('ABSOLUTE',mathnode('SUBTRACT',sep.outputs['X'],.5)),mathnode('ABSOLUTE',mathnode('SUBTRACT',sep.outputs['Y'],.5)))
noise=n.new('ShaderNodeTexNoise');l.new(uv.outputs['UV'],noise.inputs['Vector']);noise.inputs['Scale'].default_value=17;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.75
edge=mathnode('ADD',edge,mathnode('MULTIPLY',noise.outputs['Fac'],.095))
ramp=n.new('ShaderNodeValToRGB');l.new(edge,ramp.inputs[0]);ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
for i,(at,color) in enumerate([(.33,(.003,.007,.001,1)),(.445,(.018,.054,.003,1)),(.492,(.25,.74,.004,1)),(.535,(.66,1,.09,1)),(.59,(.03,.19,.002,1))]):
    e=ramp.color_ramp.elements[0] if i==0 else ramp.color_ramp.elements.new(at);e.position=at;e.color=color
l.new(ramp.outputs['Color'],emit.inputs['Color']);emit.inputs['Strength'].default_value=3.5
energy.data.materials.append(mat)
star_mat=plain_material('Preview little stars',PALETTE['green'],emission=3)
for i in range(45):
    x=random.uniform(-2.75,2.75);y=random.uniform(.4,8.10)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.012,.036),location=xyz(x,y,.20))
    star=bpy.context.object;star.name='Preview star';star.data.materials.append(star_mat)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(18,12,31));camera=bpy.context.object;camera.name='Portal beauty camera';camera.data.type='ORTHO';camera.data.ortho_scale=24;aim(camera,(.15,4.50,.35));gallery.camera=camera
for pos,power,size,tint in [((-6,13,10),2300,9,(.88,1,.68)),((8,10,4),1700,7,(.59,.73,1)),((0,4,2.7),360,5,(.48,1,.10))]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*pos));light=bpy.context.object;light.data.energy=power;light.data.color=tint;light.data.shape='DISK';light.data.size=size;aim(light,(0,4,0))
for x,z,color in [(-5.2,1.55,(1,.31,.055)),(5.2,1.55,(1,.31,.055)),(7.4,2.5,(.59,.26,1)),(-9.0,3.0,(.59,.26,1))]:
    bpy.ops.object.light_add(type='POINT',location=xyz(x,2.1,z));light=bpy.context.object;light.data.energy=65;light.data.color=color;light.data.shadow_soft_size=.70
gallery.world=bpy.data.worlds.new('Dungeon twilight');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.045,.065,.075,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
gallery.render.resolution_x=1600;gallery.render.resolution_y=1100;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW);gallery.view_settings.view_transform='AgX'
# Four editable site scenes show the temple route at the same game scale.
ruin_scenes=[]
for theme,ground_tint in [('rootvault','night'),('cindercrypt','drygrass'),('frosthollow','snow'),('nightroot','night')]:
    site=bpy.data.scenes.new('Ruins - '+theme);bpy.context.window.scene=site
    for name,at in [('approach-'+theme,(0,0,0)),('portal',(0,0,0)),('summon-stone',(5,0,6))]:
        source=next(root for root in roots if root['asset']==name)
        parent=source.copy();site.collection.objects.link(parent);parent.location=xyz(*at)
        for child in source.children:
            obj=child.copy();site.collection.objects.link(obj);obj.parent=parent
    # These context blocks and flora are presentation only; gameplay uses its actual heightfield.
    bpy.ops.mesh.primitive_plane_add(size=300)
    floor=bpy.context.object;floor.name='Biome context - not exported';floor.data.materials.append(plain_material(theme+' terrain',PALETTE[ground_tint]))
    paving=plain_material(theme+' old path',PALETTE['light' if theme=='rootvault' else 'sandlight' if theme=='cindercrypt' else 'ice' if theme=='frosthollow' else 'purple'])
    placed_flags=[]
    for start,end in [(a,b) for route in routes for a,b in zip(route,route[1:])]:
        length=math.hypot(end['x']-start['x'],end['z']-start['z']);count=max(1,round(length/1.6))
        dx=(end['x']-start['x'])/length;dz=(end['z']-start['z'])/length
        for i in range(count):
            for side in [-1,0,1]:
                if (i+side)%5==0:continue
                x=start['x']+dx*(i+.5)*length/count-dz*side*1.45
                z=start['z']+dz*(i+.5)*length/count+dx*side*1.45
                if any(math.hypot(x-px,z-pz)<1.39 for px,pz in placed_flags):continue
                placed_flags.append((x,z))
                bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(x,.025,z))
                tile=bpy.context.object;tile.name='Context worn temple route';tile.scale=(1.28,1.38,.05);tile.data.materials.append(paving)
    for source in list(gallery.objects):
        if source.name.startswith('Preview energy'):
            obj=source.copy();obj.data=source.data.copy();site.collection.objects.link(obj)
            energy_mat=source.data.materials[0].copy();obj.data.materials.clear();obj.data.materials.append(energy_mat)
            tint={'rootvault':(.66,1,.09),'cindercrypt':(1,.35,.05),'frosthollow':(.25,.8,1),'nightroot':(.62,.3,1)}[theme]
            for node in energy_mat.node_tree.nodes:
                if node.type=='VALTORGB':
                    for element in node.color_ramp.elements:
                        strength=max(element.color[:3]);element.color=tuple(c*strength for c in tint)+(1,)
    bpy.ops.object.camera_add(location=xyz(80,76,112));cam=bpy.context.object
    cam.name=theme+' approach camera';cam.data.type='ORTHO';cam.data.ortho_scale=108;aim(cam,(0,2.7,30));site.camera=cam
    for pos,power,size in [((-20,38,28),6500,22),((24,24,0),3800,18)]:
        bpy.ops.object.light_add(type='AREA',location=xyz(*pos));light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,3,9))
    bpy.ops.object.light_add(type='SUN',location=xyz(-10,25,20));sun=bpy.context.object;sun.rotation_euler=(.45,-.5,-.5);sun.data.energy=1.6;sun.data.angle=.18
    site.world=gallery.world.copy();site.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
    site.render.engine='CYCLES';site.cycles.samples=24;site.cycles.use_denoising=True
    site.render.resolution_x=1400;site.render.resolution_y=1050;site.render.resolution_percentage=100
    site.render.image_settings.file_format='PNG';site.render.filepath=str(SOURCE.parent/('dungeon-ruins-'+theme+'.png'));site.view_settings.view_transform='AgX'
    ruin_scenes.append(site)
bpy.context.window.scene=ruin_scenes[0]
# Saved camera framing also applies on first opening the source in Blender.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False

bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('DUNGEON_PORTALS '+json.dumps({'props':len(roots),'triangles':triangles,'glb_bytes':EXPORT.stat().st_size,'bounds':bounds}))
if '--render' in sys.argv:
    bpy.context.window.scene=gallery;bpy.ops.render.render(write_still=True)
if '--render' in sys.argv or '--render-ruins' in sys.argv:
    for site in ruin_scenes:
        bpy.context.window.scene=site;bpy.ops.render.render(write_still=True)
