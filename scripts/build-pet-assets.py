"""Author Mossvale's eight rare companions, their source scene, and review renders.

Blender --background --python scripts/build-pet-assets.py -- --render
Metres, Y-up / +Z forward in GLB; root scale one, feet at zero. Articulated
rigid parts share three vertex-colour materials; no external textures.
"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/pets.glb'
SOURCE = ROOT / 'assets/source/pets.blend'
PREVIEW = ROOT / 'assets/source/pets-preview.png'
ICONS = ROOT / 'public/ui/pets'
TAU = math.tau
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

PALETTE = {
    'ink':'162536', 'white':'FFF7DE', 'cream':'EBD9B3', 'creamshade':'BCA889',
    'moss':'5E8753', 'mossdark':'345943', 'mosslight':'A2BF68', 'leaf':'75AB56',
    'rust':'CA713F', 'rustlight':'EDA15C', 'rustdark':'803F2C', 'pink':'E895A1',
    'rose':'CB5587', 'rosebright':'F4AEC8', 'violet':'79668F', 'lavender':'B5A0C2',
    'purple':'5A345F', 'purplelight':'986790', 'moon':'5D729E', 'moondark':'354366',
    'moonlight':'A5B7D5', 'moonice':'D7E7EB', 'amber':'F3B64B',
    'red':'B94130', 'ember':'E57232', 'flame':'FFD976', 'emberdark':'782C30',
    'teal':'469B97', 'tealdark':'255A68', 'teallight':'91DAC6',
    'crystal':'8C71D4', 'crystallight':'C4B3FC', 'crystaldark':'554194',
    'ice':'ACD8EA', 'iceblue':'6FA8C4', 'iceshade':'5A7D9F', 'snow':'E5F0EF',
    'gold':'DBAC40', 'goldlight':'FFE18C', 'golddark':'987022',
    'ruby':'C73356', 'emerald':'21A486', 'pearl':'E5E9D9', 'brown':'4A332E',
}
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
COLORS = {k:tuple(linear(int(v[i:i+2],16)/255) for i in (0,2,4))+(1,) for k,v in PALETTE.items()}
def xyz(p): return (p[0],-p[2],p[1])
PETS = {}; active_pet = ''; active_part = ''

def pet(name, title, locomotion='walk'):
    global active_pet
    active_pet=name; PETS[name]={'title':title,'locomotion':locomotion,'parts':{}}

def part(name, pivot=(0,0,0), parent=None):
    global active_part
    active_part=name
    PETS[active_pet]['parts'][name]={'pivot':Vector(pivot),'parent':parent,'vertices':[], 'faces':[], 'colors':[], 'materials':[], 'smooth':[]}

def shape(tint, vertices, faces, metal=False, glow=False, smooth=False):
    data=PETS[active_pet]['parts'][active_part]; offset=len(data['vertices'])
    data['vertices'].extend(tuple(Vector(v)-data['pivot']) for v in vertices)
    for face in faces:
        data['faces'].append(tuple(offset+i for i in face)); data['colors'].append(COLORS[tint])
        data['materials'].append(2 if glow else 1 if metal else 0);data['smooth'].append(smooth)

def ball(tint, c, scale, segments=16, rings=10, metal=False, glow=False, smooth=False):
    """A true stepped solid. Greedy exterior faces avoid one draw/mesh per voxel."""
    detail=max(4,min(8,round(segments/2.5)))
    unit=max(.009,min(.055,max(scale)*2/detail))
    dims=[max(1,math.ceil(radius*2/unit)) for radius in scale]
    cells={(x,y,z) for x in range(dims[0]) for y in range(dims[1]) for z in range(dims[2])
           if sum(((value+.5)*2/size-1)**2 for value,size in zip((x,y,z),dims))<=1}
    vertices=[];faces=[]
    for axis in range(3):
        u=(axis+1)%3;v=(axis+2)%3
        for direction in (-1,1):
            for layer in range(dims[axis]):
                mask=set()
                for cell in cells:
                    if cell[axis]!=layer:continue
                    neighbor=list(cell);neighbor[axis]+=direction
                    if tuple(neighbor) not in cells:mask.add((cell[u],cell[v]))
                while mask:
                    x,y=min(mask,key=lambda p:(p[1],p[0]));width=1;height=1
                    while (x+width,y) in mask:width+=1
                    while all((x+i,y+height) in mask for i in range(width)):height+=1
                    mask.difference_update((x+i,y+j) for i in range(width) for j in range(height))
                    offset=len(vertices)
                    for a,b in ((x,y),(x+width,y),(x+width,y+height),(x,y+height)):
                        p=[0,0,0];p[axis]=layer+(direction>0);p[u]=a;p[v]=b
                        vertices.append(tuple(c[j]+(p[j]*2/dims[j]-1)*scale[j] for j in range(3)))
                    faces.append(tuple(offset+i for i in ((0,1,2,3) if direction>0 else (3,2,1,0))))
    shape(tint,vertices,faces,metal,glow,False)

def tube(tint, points, radii, sides=7, metal=False, glow=False, smooth=False):
    sides=4
    points=[Vector(p) for p in points]
    if isinstance(radii,(int,float)):radii=[radii]*len(points)
    vertices=[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        ref=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))
        a=tangent.cross(ref).normalized();b=tangent.cross(a).normalized()
        vertices.extend(tuple(p+radii[i]*(a*math.cos(TAU*j/sides)+b*math.sin(TAU*j/sides))) for j in range(sides))
    faces=[tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]
    for i in range(len(points)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    shape(tint,vertices,faces,metal,glow,False)

def leaf(tint, a, b, width, thick=.014, metal=False):
    a=Vector(a);b=Vector(b);d=b-a
    ref=Vector((0,0,1)) if abs(d.normalized().z)<.88 else Vector((0,1,0))
    side=d.cross(ref).normalized()*width/2;normal=side.cross(d).normalized()*thick
    for i,profile in enumerate((.58,1,.72,.32)):
        center=a+d*(i+.5)/4
        vertices=[center+side*x*profile+d*y/8+normal*z for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        shape(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],metal)

def feather(tint, a, b, width, shaft='creamshade'):
    leaf(tint,a,b,width,.014)
    d=Vector(b)-Vector(a)
    tube(shaft,[a,tuple(Vector(a)+d*.85)],[.0038,.0012],5)

def gem(tint, c, scale, metal=False, glow=False):ball(tint,c,scale,8,4,metal,glow,False)

def eye(x,y,z,size=.046,iris='amber'):
    ball('ink',(x,y,z),(size*1.13,size*1.2,size*.50),12,8)
    ball(iris,(x,y,z+size*.29),(size*.86,size*.90,size*.34),12,8)
    ball('ink',(x,y,z+size*.53),(size*.37,size*.62,size*.2),12,8)
    ball('white',(x-size*.24,y+size*.31,z+size*.70),(size*.17,)*3,8,5)

def paws(tint, claw, x, z, y=.20, width=.075, height=.14, toes=3):
    ball(tint,(x,y,z),(width,height,width*.94))
    ball(tint,(x,.070,z+.031),(width*1.12,.067,width*1.40))
    for i in range(toes):
        tx=x+(i-(toes-1)/2)*width*.53
        ball(tint,(tx,.052,z+width*.88),(width*.34,.043,width*.60),10,6)
        leaf(claw,(tx,.040,z+width*1.18),(tx,.027,z+width*1.69),width*.23,.013)

def collar(c,radius,tint='mossdark',metal=False):
    points=[(c[0]+radius*math.cos(TAU*i/32),c[1]+radius*.7*math.sin(TAU*i/32),c[2]) for i in range(33)]
    tube(tint,points,.023,6,metal)

def flower(c,size,tint='rosebright'):
    c=Vector(c)
    for i in range(7):
        angle=TAU*i/7;d=Vector((math.cos(angle),math.sin(angle),.05))
        leaf(tint,tuple(c-d*size*.10),tuple(c+d*size),size*.65,.009)
    gem('amber',tuple(c+Vector((0,0,.015))),(size*.24,size*.24,.013))

# Moss Fox: triangular face, layered woodland ruff, tipped plume, tiny toadstools.
pet('moss-fox','MOSS FOX')
part('body')
ball('moss',(0,.335,-.065),(.19,.21,.31))
ball('mosslight',(0,.449,-.055),(.16,.10,.27))
ball('cream',(0,.35,.17),(.136,.20,.105))
for side in (-1,1):
    for i in range(7):leaf('leaf' if i%2 else 'mosslight',(side*.10,.47-i*.020,.14-i*.041),(side*(.19+i*.004),.37-i*.029,.10-i*.048),.11)
    for i in range(4):leaf('cream',(side*.06,.38-i*.047,.255),(side*.075,.30-i*.043,.264),.08)
collar((0,.49,.185),.128,'mossdark')
gem('gold',(0,.385,.283),(.033,.044,.011),True)
leaf('emerald',(0,.388,.297),(0,.345,.309),.041,.012,True)
part('head',(0,.49,.22),'body')
ball('moss',(0,.575,.255),(.18,.17,.155))
ball('cream',(0,.521,.368),(.132,.092,.097))
ball('creamshade',(0,.505,.426),(.085,.036,.046))
ball('ink',(0,.563,.464),(.043,.028,.022),12,7)
tube('rustdark',[(-.050,.505,.457),(0,.492,.464),(.050,.505,.457)],.005,5)
for side in (-1,1):
    eye(side*.089,.610,.390,.039,'amber')
    for j in range(4):leaf('cream',(side*.1,.585-j*.021,.34),(side*(.219-j*.01),.543-j*.032,.291),.072)
    leaf('mossdark',(side*.110,.668,.234),(side*.162,.882,.189),.174,.051)
    leaf('mosslight',(side*.115,.683,.259),(side*.155,.852,.218),.124,.020)
    leaf('pink',(side*.117,.708,.280),(side*.154,.822,.241),.068,.010)
    for j in range(3):tube('creamshade',[(side*.065,.532+j*.018,.427),(side*.19,.516+j*.031,.454)],.0018,4)
leaf('mosslight',(-.025,.728,.267),(0,.772,.271),.067)
for side,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.17),(False,-.235)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(side*.13,.32,z),'body')
        paws('mossdark','creamshade',side*.13,z,y=.18,width=.062,height=.127)
        leaf('moss',(side*.13,.29,z+.04),(side*.13,.16,z+.055),.09)
part('tail',(0,.35,-.34),'body')
tube('moss',[(0,.35,-.33),(.11,.42,-.47),(.20,.56,-.54),(.24,.66,-.51)],[.085,.117,.105,.03],10, smooth=True)
for j in range(14):
    t=j/13;side=-1 if j%2 else 1
    leaf('cream' if j>8 else 'mosslight' if j%3 else 'mossdark',(.09+t*.16,.40+t*.24,-.43-t*.08),(.09+t*.16+side*.12*(1-t*.45),.38+t*.23,-.55-t*.05),.115,.022)
leaf('cream',(.22,.61,-.52),(.25,.738,-.495),.13,.028)

# Moon Owl: concentric facial discs, individual mantle feathers and hooked talons.
pet('moon-owl','MOON OWL','hover')
part('body')
ball('moon',(0,.38,-.025),(.205,.26,.155))
ball('moonice',(0,.36,.105),(.145,.22,.087))
for row in range(5):
    for col in range(5-row//2):
        x=(col-(4-row//2)/2)*.052
        feather('moonlight' if (row+col)%3 else 'moonice',(x,.49-row*.052,.172),(x,.41-row*.052,.175),.065)
for side in (-1,1):
    for j in range(3):
        x=side*(.059+j*.032)
        tube('golddark',[(x,.15,.022),(x,.062,.050),(x,.047,.115),(x,.072,.140)],[.013,.013,.010,.002],6)
part('head',(0,.58,0),'body')
ball('moondark',(0,.665,.009),(.22,.18,.147))
for side in (-1,1):
    ball('creamshade',(side*.096,.670,.116+side*.001),(.119,.129,.052))
    ball('cream',(side*.095,.675,.142+side*.001),(.104,.112,.044))
    ball('white',(side*.095,.679,.160+side*.001),(.089,.098,.033))
    for j in range(9):
        a=TAU*j/9
        feather('moonice',(side*.095+.067*math.cos(a),.676+.078*math.sin(a),.174),(side*.095+.111*math.cos(a),.676+.124*math.sin(a),.151),.040,'creamshade')
    eye(side*.094,.682,.193,.060,'amber')
    feather('moondark',(side*.138,.766,.030),(side*.202,.940,-.013),.127,'moonlight')
    feather('moonlight',(side*.145,.777,.050),(side*.191,.898,.021),.074)
    leaf('moondark',(side*.033,.765,.194),(side*.178,.795,.172),.045)
leaf('golddark',(0,.685,.201),(0,.572,.235),.066,.027,True)
leaf('gold',(0,.686,.225),(0,.603,.243),.044,.021,True)
# Crescent moon ornament, open on one side, on the brow.
tube('gold',[(.034*math.cos(a),.821+.040*math.sin(a),.110) for a in [math.pi*.2+i*math.pi*1.60/15 for i in range(16)]],[.009]*16,6,True)
gem('pearl',(0,.801,.125),(.017,.026,.014),True)
for side,label in [(-1,'left'),(1,'right')]:
    part('wing-'+label,(side*.15,.55,-.005),'body')
    ball('moon',(side*.209,.416,-.044),(.092,.19,.12),12,8)
    for row in range(3):
        for i in range(6-row):
            a=(side*(.17+row*.028),.56-i*.043,-.060)
            b=(side*(.30+row*.025),.39-i*.043,-.11+row*.046)
            feather(['moondark','moon','moonlight'][row],a,b,.075,'moonice')
    for i in range(7):feather('moon' if i%2 else 'moonlight',(side*.20,.37-i*.022,-.018),(side*(.27+i*.010),.145+i*.013,-.063),.049,'moonice')
part('tail',(0,.21,-.125),'body')
for i in range(5):feather('moonlight' if i%2 else 'moondark',((i-2)*.029,.25,-.13),((i-2)*.040,.06,-.24),.073)

# Ember Drake: plated belly, swept horns, membrane wings, dorsal scales and flame tail.
pet('ember-drake','EMBER DRAKE')
part('body')
ball('red',(0,.34,-.040),(.183,.21,.27))
ball('ember',(0,.375,.116),(.147,.189,.128))
for j in range(6):
    y=.19+j*.046
    ball('amber' if j%2 else 'flame',(0,y,.19+math.sin(j/5*math.pi)*.045+j*.001),(.116-j*.006,.030,.018),12,5, smooth=False)
for j in range(7):
    z=.12-j*.064
    leaf('emberdark',(0,.50,z),(0,.60-j*.007,z-.048),.070,.027)
    leaf('amber',(0,.55,z-.012),(0,.609-j*.007,z-.048),.029,.009)
for side in (-1,1):
    for j in range(5):
        for row in range(3):
            leaf('ember' if (j+row)%2 else 'red',(side*(.15+row*.013),.46-row*.066,.10-j*.063),(side*(.17+row*.010),.39-row*.065,.071-j*.065),.060)
part('head',(0,.50,.17),'body')
ball('ember',(0,.603,.247),(.17,.142,.155))
ball('red',(0,.552,.354),(.138,.071,.128))
ball('amber',(0,.514,.355),(.117,.034,.124))
ball('ember',(0,.588,.414),(.115,.048,.061))
for side in (-1,1):
    eye(side*.088,.635,.361,.042,'teallight')
    tube('emberdark',[(side*.039,.747,.195),(side*.103,.817,.125),(side*.135,.859,.025)],[.040,.028,.002],8)
    tube('cream',[(side*.041,.755,.190),(side*.106,.826,.119),(side*.135,.859,.025)],[.025,.017,.001],7)
    ball('emberdark',(side*.054,.612,.453),(.014,.010,.008),10,6)
    leaf('emberdark',(side*.072,.69,.357),(side*.145,.700,.328),.036)
    for j in range(3):leaf('red',(side*.133,.609-j*.025,.259),(side*(.222-j*.013),.588-j*.036,.205),.059)
    leaf('white',(side*.091,.523,.414),(side*.094,.496,.424),.015,.011)
tube('emberdark',[(-.102,.538,.434),(0,.533,.474),(.102,.538,.434)],.0045,5)
gem('flame',(0,.723,.272),(.036,.027,.018),glow=True)
for side,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.16),(False,-.215)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(side*.13,.31,z),'body')
        paws('red','cream',side*.151,z,y=.16,width=.063,height=.12)
        for j in range(2):gem('ember',(side*.184,.22-j*.059,z+.025),(.028,.040,.022))
    part('wing-'+label,(side*.115,.51,-.03),'body')
    origin=Vector((side*.12,.51,-.03))
    ridge=[(side*.20,.66,-.06),(side*.40,.88,-.14),(side*.64,.72,-.23)]
    rim=[ridge[-1],(side*.50,.43,-.16),(side*.31,.32,-.125),(side*.17,.33,-.052)]
    vertices=[origin,*map(Vector,ridge),*map(Vector,rim[1:])]
    faces=[(0,1,2),(0,2,3),(0,3,4),(0,4,5),(0,5,6)]
    shape('ember',vertices,faces)
    # Inset orange web panels and branching raised wing veins.
    for j in range(2,6):
        a=vertices[j];b=vertices[j+1];cent=(origin+a+b)/3+Vector((0,0,.006))
        shape('amber' if j%2 else 'rustlight',[origin*.85+cent*.15,a*.88+cent*.12,b*.88+cent*.12],[(0,1,2)])
        tube('emberdark',[origin,tuple(a)],[.015,.007],6)
    tube('emberdark',[origin,*ridge],[.030,.027,.020,.002],7)
    tube('red',rim,[.011,.012,.012,.020],6)
    leaf('cream',ridge[1],(side*.43,.943,-.15),.037,.014)
part('tail',(0,.33,-.285),'body')
tube('red',[(0,.33,-.28),(.075,.26,-.44),(.17,.25,-.57),(.24,.36,-.64),(.25,.47,-.60)],[.085,.065,.040,.025,.005],10,smooth=True)
for i in range(5):leaf('amber',(.02+i*.052,.37-i*.008,-.33-i*.056),(.02+i*.052,.43-i*.008,-.36-i*.056),.046,.016)
leaf('ember',(.24,.37,-.625),(.26,.62,-.60),.16,.036)
leaf('flame',(.245,.40,-.600),(.253,.55,-.575),.092,.025)

# Crystal Tortoise: radial shell scutes, bevelled crystal clusters, plated flippers.
pet('crystal-tortoise','CRYSTAL TORTOISE')
part('body')
ball('tealdark',(0,.211,-.025),(.245,.123,.294))
ball('creamshade',(0,.155,-.025),(.237,.056,.281),18,7,smooth=False)
ball('crystaldark',(0,.31,-.025),(.261,.221,.30),18,10,smooth=False)
# Each top scute is a raised six-sided shield, with a dark seam around it.
for row in range(3):
    z=-.20+row*.17
    for col in range(3):
        x=(col-1)*.143;y=.32+.14*math.sqrt(max(0,1-(x/.31)**2-(z/.40)**2))
        offset=(row*3+col)*.0005
        gem('crystal' if (col+row)%2 else 'crystallight',(x+offset,y+offset,z+offset),(.091,.074,.104))
for i in range(18):
    a=TAU*i/18
    gem('teal' if i%2 else 'crystal',(.247*math.cos(a),.255,.285*math.sin(a)-.025),(.047,.062,.043))
for x,z,height in [(-.05,-.07,.22),(.055,-.12,.15),(.085,.04,.12),(-.12,.02,.10)]:
    tube('crystal',[(x,.43,z),(x*.9,.43+height*.83,z-.02),(x*.9,.43+height,z-.02)],[.036,.029,0],6)
    tube('crystallight',[(x+.012,.45,z+.022),(x*.9+.012,.43+height*.82,z),(x*.9,.43+height,z-.02)],[.014,.011,0],5)
for side,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.15),(False,-.205)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(side*.19,.18,z),'body')
        paws('teal','cream',side*.225,z,y=.095,width=.083,height=.07)
        for j in range(3):gem('teallight',(side*(.232+j*.001),.156+j*.001,z-.032+j*.044),(.064,.019,.026))
part('head',(0,.21,.23),'body')
ball('teal',(0,.225,.31),(.103,.10,.128))
ball('teallight',(0,.244,.386),(.096,.075,.074))
ball('cream',(0,.199,.387),(.089,.021,.070))
for side in (-1,1):
    eye(side*.068,.278,.415,.028,'crystallight')
    ball('tealdark',(side*.032,.262,.454),(.008,.006,.004),8,5)
    gem('tealdark',(side*.09,.224,.342),(.012,.017,.028))
gem('crystal',(0,.327,.350),(.037,.023,.039))
tube('tealdark',[(-.062,.214,.442),(0,.208,.457),(.062,.214,.442)],.003,5)
part('tail',(0,.19,-.30),'body')
tube('teal',[(0,.19,-.28),(0,.16,-.37),(0,.17,-.43)],[.037,.020,.001],8)

# Bloom Hare: long inset ears, layered cheek fluff, petal crown and oversized feet.
pet('bloom-hare','BLOOM HARE','hop')
part('body')
ball('lavender',(0,.32,-.06),(.178,.22,.22))
ball('cream',(0,.365,.087),(.118,.18,.093))
for side in (-1,1):
    ball('violet',(side*.125,.235,-.12),(.11,.14,.136))
    for j in range(4):leaf('white',(side*.054,.46-j*.05,.145),(side*.081,.395-j*.047,.16),.075)
collar((0,.49,.10),.11,'mossdark')
for side in (-1,1):leaf('leaf',(0,.411,.177),(side*.061,.387,.191),.051)
gem('rose',(0,.40,.19),(.025,.034,.015))
part('head',(0,.51,.13),'body')
ball('lavender',(0,.603,.171),(.163,.153,.145))
ball('white',(-.055,.552,.289),(.064,.060,.049))
ball('white',(.055,.552,.289),(.064,.060,.049))
gem('pink',(0,.583,.335),(.026,.019,.013))
tube('violet',[(0,.571,.340),(0,.551,.339),(-.022,.541,.333)],.003,5)
tube('violet',[(0,.551,.339),(.022,.541,.333)],.003,5)
for side in (-1,1):
    eye(side*.093,.633,.282,.040,'rose')
    for j in range(4):leaf('white',(side*.102,.590-j*.019,.256),(side*(.191-j*.011),.559-j*.028,.228),.058)
    for j in range(3):tube('creamshade',[(side*.060,.562-j*.011,.322),(side*.23,.584-j*.040,.332)],.0015,4)
    leaf('violet',(side*.078,.715,.135),(side*.152,1.094,.086),.151,.048)
    leaf('lavender',(side*.079,.720,.160),(side*.150,1.079,.105),.129,.034)
    leaf('pink',(side*.084,.75,.185),(side*.147,1.041,.133),.075,.012)
    leaf('rosebright',(side*.085,.790,.193),(side*.14,1.013,.151),.031,.006)
    leaf('leaf',(side*.03,.752,.179),(side*.183,.766,.171),.068)
for x,y,z,size in [(-.108,.752,.225,.043),(0,.775,.240,.053),(.111,.756,.220,.039)]:flower((x,y,z),size)
for side,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.13),(False,-.115)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(side*.115,.25,z),'body')
        ball('lavender',(side*.11,.18,z),(.051,.13,.065))
        ball('cream',(side*.11,.052,z+.052),(.067,.052,.121 if not fore else .09))
        for j in range(3):tube('creamshade',[(side*.11+(j-1)*.025,.045,z+.14),(side*.11+(j-1)*.025,.062,z+.112)],.002,4)
part('tail',(0,.28,-.257),'body')
ball('white',(0,.285,-.278),(.083,.079,.080))
for j in range(9):
    a=TAU*j/9
    leaf('cream',(.020*math.cos(a),.29+.025*math.sin(a),-.30),(.075*math.cos(a),.29+.073*math.sin(a),-.31),.045)

# Lantern Moth: four scalloped wing lobes with raised veins and jewel eyespots.
pet('lantern-moth','LANTERN MOTH','hover')
part('body')
ball('cream',(0,.416,0),(.064,.14,.066))
for j in range(5):
    y=.405-j*.046
    ball('amber',(0,y,.009),(.058-j*.005,.030,.051-j*.004),12,7,glow=True)
    tube('gold',[(.060*math.cos(a)*(1-j*.10),y,.009+.052*math.sin(a)*(1-j*.10)) for a in [TAU*i/18 for i in range(19)]],.005,5,True)
for j in range(14):
    a=TAU*j/14
    leaf('white' if j%2 else 'cream',(0,.52,0),(.085*math.cos(a),.53+.09*math.sin(a),.012),.037)
for side in (-1,1):
    for j in range(3):
        tube('golddark',[(side*.040,.40+j*.045,.04),(side*(.09+j*.017),.35+j*.04,.08),(side*.11,.32+j*.04,.12)],[.006,.004,.001],5)
part('head',(0,.565,.015),'body')
ball('cream',(0,.582,.022),(.070,.065,.067))
for side in (-1,1):
    eye(side*.045,.591,.073,.024,'teallight')
    points=[(side*.035,.623,.008),(side*.063,.70,.016),(side*.13,.76,.009)]
    tube('golddark',points,[.007,.005,.001],5)
    for j in range(7):
        t=j/6;x=side*(.050+t*.067);y=.67+t*.075
        feather('cream',(x,y,.014),(x+side*(.028+t*.012),y+.02,.015),.014,'gold')
gem('teallight',(0,.607,.088),(.017,.016,.009),glow=True)
for side,label in [(-1,'left'),(1,'right')]:
    part('wing-'+label,(side*.037,.48,-.025),'body')
    origin=Vector((side*.04,.49,-.026))
    # Separate fan-shaped upper and swallowtail lower wings with stepped margins.
    lobes=[[(.08,.55),(.26,.83),(.44,.87),(.61,.74),(.59,.60),(.50,.54),(.38,.48),(.21,.46)],
           [(.10,.46),(.27,.46),(.43,.43),(.49,.31),(.37,.20),(.33,.07),(.26,.13),(.19,.29),(.08,.34)]]
    for index,outline in enumerate(lobes):
        verts=[origin]+[Vector((side*x,y,-.04)) for x,y in outline]
        shape('tealdark',verts,[(0,j,1+j%len(outline)) for j in range(1,len(outline)+1)])
        center=sum(verts[1:],Vector())/len(outline)
        inset=[center+(v-center)*.88+Vector((0,0,.005)) for v in verts[1:]]
        shape('teal' if index==0 else 'moss', [center,*inset],[(0,j,1+j%len(outline)) for j in range(1,len(outline)+1)])
        for i in range(1,len(verts)-1):
            a=verts[i]*.75+center*.25;b=verts[i+1]*.75+center*.25
            shape('teallight' if i%2 else 'mosslight',[origin+Vector((0,0,.009)),a+Vector((0,0,.009)),b+Vector((0,0,.009))],[(0,1,2)])
            tube('gold',[origin+Vector((0,0,.013)),(a+center)/2+Vector((0,0,.012)),a+Vector((0,0,.012))],[.004,.003,.001],5,True)
        rim=verts[1:]+[verts[1]]
        tube('gold',rim,.008,5,True)
        for j in range(1,len(verts)):
            p=verts[j]*.88+center*.12
            gem('cream',tuple(p+Vector((0,0,.014))),(.012,.012,.009))
        x,y=(side*.385,.685) if index==0 else (side*.29,.325)
        ball('cream',(x,y,-.017),(.084 if index==0 else .059,.071 if index==0 else .047,.013),16,8)
        ball('gold',(x,y,-.004),(.061 if index==0 else .042,.057 if index==0 else .034,.009),16,7,metal=True)
        ball('tealdark',(x,y,.005),(.041 if index==0 else .029,.043 if index==0 else .025,.012),16,7)
        gem('emerald',(x,y,.017),(.027,.031,.016),glow=True)
        ball('white',(x-side*.009,y+.011,.030),(.008,.010,.003),8,5)
part('tail',(0,.20,.01),'body')
tube('gold',[(0,.23,.01),(0,.175,.01),(0,.156,.01)],.005,5,True)
gem('gold',(0,.152,.01),(.032,.014,.026),True)
gem('amber',(0,.105,.01),(.038,.060,.031),glow=True)
gem('flame',(0,.115,.032),(.020,.040,.008),glow=True)
gem('gold',(0,.049,.01),(.020,.012,.017),True)

# Frost Cub: bear anatomy, toe pads, crystal shoulder ruff and snowflake forehead.
pet('frost-cub','FROST CUB')
part('body')
ball('ice',(0,.30,-.063),(.205,.206,.254))
ball('snow',(0,.391,.06),(.185,.19,.195))
for side in (-1,1):
    for j in range(8):
        leaf('snow' if j%3 else 'iceblue',(side*.125,.465-j*.021,.14-j*.043),(side*(.218+j*.003),.38-j*.022,.12-j*.041),.092,.021)
    for j in range(4):
        leaf('iceblue',(side*.12,.46-j*.013,-.12-j*.027),(side*(.19+j*.009),.56-j*.023,-.16-j*.035),.068,.024)
collar((0,.45,.152),.15,'iceshade')
gem('gold',(0,.327,.279),(.037,.038,.023),True)
gem('ice',(0,.332,.301),(.024,.030,.016),glow=True)
part('head',(0,.49,.18),'body')
ball('snow',(0,.571,.215),(.187,.157,.161))
for side in (-1,1):
    ball('iceblue',(side*.141,.704,.17),(.073,.079,.047),14,9)
    ball('snow',(side*.141,.709,.195),(.057,.060,.030),14,8)
    ball('pink',(side*.141,.712,.216),(.034,.039,.013),12,7)
    eye(side*.083,.609,.352,.031,'iceblue')
    for j in range(3):leaf('ice',(side*.126,.552+j*.024,.27),(side*(.207-j*.011),.529+j*.023,.255),.064)
ball('cream',(0,.530,.351),(.111,.068,.082))
ball('ink',(0,.567,.423),(.042,.027,.020),12,7)
ball('white',(-.012,.578,.437),(.010,.006,.003),8,5)
tube('iceshade',[(0,.543,.425),(0,.523,.425),(-.027,.513,.414)],.003,5)
tube('iceshade',[(0,.523,.425),(.027,.513,.414)],.003,5)
for j in range(3):
    a=math.pi*j/3;d=Vector((math.cos(a),math.sin(a),0))*.031;c=Vector((0,.689,.322))
    tube('iceblue',[c-d,c+d],.003,5)
    for side in (-1,1):
        p=c+d*side*.62
        tube('iceblue',[p+Vector((-.008,.007,0)),p,p+Vector((.008,.007,0))],.002,4)
for side,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.16),(False,-.19)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(side*.14,.28,z),'body')
        paws('snow','iceshade',side*.145,z,y=.16,width=.076,height=.125,toes=4)
        for j in range(3):leaf('ice',(side*.14,.22,z+.047),(side*.14+(j-1)*.036,.14,z+.07),.047)
part('tail',(0,.31,-.30),'body')
ball('snow',(0,.33,-.32),(.068,.068,.061))

# Golden Pig: split hooves, fleshy snout, curled tail, engraved royal harness and crown.
pet('golden-pig','GOLDEN PIG')
part('body')
ball('gold',(0,.325,-.065),(.227,.218,.326),24,14,metal=True)
ball('goldlight',(0,.472,-.066),(.175,.072,.26),20,10,metal=True)
# A velvet saddlecloth and two beaded filigree belts hug the gilded ribs.
for z in (-.19,.035):
    points=[(.233*math.cos(a),.329+.22*math.sin(a),z) for a in [TAU*i/48 for i in range(49)]]
    tube('purple',points,.021,8)
    for dz in (-.019,.019):tube('goldlight',[(x,y,z+dz) for x,y,_ in points],.006,5,True)
    for side in (-1,1):
        for j in range(7):
            y=.21+j*.041;x=side*.232*math.sqrt(max(.1,1-((y-.329)/.223)**2))
            gem('goldlight',(x,y,z),(.011,.009,.008),True)
for side in (-1,1):
    # Repeating raised scrolls on a broad ceremonial side panel.
    shape('purple',[(side*.235,.40,-.22),(side*.244,.28,-.22),(side*.244,.26,.078),(side*.235,.40,.078)],[(0,1,2,3)])
    for z in (-.17,-.06,.05):
        points=[(side*.249,.333+.028*math.sin(a),z+.028*math.cos(a)) for a in [i*math.pi*1.7/17 for i in range(18)]]
        tube('goldlight',points,.004,5,True)
    gem('golddark',(side*.251,.329,-.061),(.016,.048,.048),True)
    gem('ruby',(side*.265,.329,-.061),(.018,.033,.033),True)
    for dy,dz in [(0,-.04),(0,.04),(-.04,0),(.04,0)]:gem('goldlight',(side*.267,.329+dy,-.061+dz),(.010,.007,.007),True)
# Stitched saddle top, quatrefoil emblem and back bristles.
ball('purple',(0,.531,-.079),(.159,.019,.143),16,7)
for side in (-1,1):tube('goldlight',[(side*.13,.54,-.19),(side*.146,.546,-.08),(side*.13,.54,.04)],.006,5,True)
for j in range(4):
    a=TAU*j/4
    leaf('goldlight',(0,.554,-.08),(.06*math.cos(a),.558,-.08+.06*math.sin(a)),.027,.006,True)
gem('emerald',(0,.565,-.08),(.025,.009,.025),True)
for j in range(7):leaf('goldlight',(0,.48,-.22-j*.016),(0,.525,-.23-j*.017),.014,.006,True)
part('head',(0,.445,.20),'body')
ball('gold',(0,.534,.273),(.194,.167,.17),24,14,metal=True)
ball('goldlight',(0,.495,.383),(.14,.103,.093),20,12,metal=True)
# Forward-facing rim and two deep dark nostrils distinguish the pig at game scale.
ball('golddark',(0,.513,.444),(.112,.079,.026),20,10,metal=True)
ball('goldlight',(0,.513,.459),(.10,.065,.019),20,10,metal=True)
for side in (-1,1):
    ball('golddark',(side*.041,.516,.477),(.023,.032,.008),14,8,metal=True)
    ball('ink',(side*.041,.517,.487),(.014,.024,.003),12,8)
    eye(side*.113,.590,.389,.035,'emerald')
    tube('golddark',[(side*.073,.636,.368),(side*.114,.643,.368),(side*.143,.620,.352)],[.008,.009,.004],6,True)
    # Thick folded ears show an inner bowl and turned-down point.
    leaf('gold',(side*.12,.653,.255),(side*.245,.794,.244),.167,.030,True)
    leaf('goldlight',(side*.132,.666,.286),(side*.238,.774,.274),.125,.017,True)
    leaf('rust',(side*.143,.685,.30),(side*.215,.756,.291),.075,.009,True)
    leaf('gold',(side*.217,.762,.270),(side*.256,.716,.319),.079,.016,True)
    # Small engraved cheek rosettes and ornamental pearl studs.
    for j in range(5):
        a=TAU*j/5
        gem('goldlight',(side*(.16+.019*math.cos(a)),.52+.019*math.sin(a),.35),(.006,.007,.005),True)
    gem('ruby',(side*.16,.52,.361),(.010,.011,.008),True)
tube('golddark',[(-.081,.456,.431),(-.043,.444,.451),(0,.440,.455),(.043,.444,.451),(.081,.456,.431)],.0035,5,True)
# Open filigree crown with five prongs, alternating jewels, scallops and inset rim.
for y,r in [(.697,.094),(.716,.100)]:
    tube('goldlight',[(r*math.cos(a),y,.243+r*.72*math.sin(a)) for a in [TAU*i/32 for i in range(33)]],.009,6,True)
for j in range(7):
    a=TAU*j/7;x=.096*math.cos(a);z=.243+.069*math.sin(a)
    leaf('gold',(x,.709,z),(x*1.10,.79+(.02 if j%2==0 else 0),.243+(z-.243)*1.1),.047,.011,True)
    gem('ruby' if j%2 else 'emerald',(x*1.10,.79+(.02 if j%2==0 else 0),.243+(z-.243)*1.1),(.015,.018,.015),True)
    gem('goldlight',(x,.722,z),(.012,.010,.009),True)
gem('ruby',(0,.739,.326),(.026,.026,.015),True)
for side,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.17),(False,-.24)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(side*.151,.29,z),'body')
        ball('gold',(side*.15,.184,z),(.071,.127,.073),16,10,metal=True)
        for dx in (-.032,.032):
            ball('golddark',(side*.15+dx,.041,z+.018),(.030,.041,.065),12,7,metal=True)
            ball('goldlight',(side*.15+dx,.062,z+.044),(.030,.015,.041),12,6,metal=True)
        tube('goldlight',[(side*.21,.099,z+.024),(side*.15,.107,z+.065),(side*.09,.099,z+.024)],.008,6,True)
part('tail',(0,.35,-.37),'body')
points=[(0,.35,-.36),(0,.38,-.418)]
for i in range(29):
    a=i*math.pi*2.55/28;r=.056*(1-i/38)
    points.append((r*math.sin(a),.405+r*math.cos(a),-.442-i*.0007))
tube('goldlight',points,[.014*(1-i/(len(points)*1.5)) for i in range(len(points))],8,True,smooth=True)


library=bpy.context.scene; library.name='Pet asset library'
library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
materials=[]
for name,metal,glow in [('Pet painted palette',False,False),('Pet gilded palette',True,False),('Pet lantern palette',False,True)]:
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.28 if metal else .75
    shader.inputs['Metallic'].default_value=.82 if metal else 0
    vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='PetTint'
    mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Base Color'])
    if glow:
        mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value=.42
    mat.use_backface_culling=False
    materials.append(mat)

roots={}
for name,data in PETS.items():
    root=bpy.data.objects.new(name,None);library.collection.objects.link(root);roots[name]=root
    root['locomotion']=data['locomotion'];root['groundY']=0
    root['contract']='Metres, +Z forward / Y up in GLB. Rigid joints: legs X; wings Z; head X/Y; tail Y.'
    root['title']=data['title'];joints={};all_vertices=[]
    for label,p in data['parts'].items():
        joint=bpy.data.objects.new(name+'-'+label,None);library.collection.objects.link(joint)
        joint.parent=joints[p['parent']] if p['parent'] else root
        parent_pivot=data['parts'][p['parent']]['pivot'] if p['parent'] else Vector()
        joint.location=xyz(p['pivot']-parent_pivot)
        mesh=bpy.data.meshes.new(name+'-'+label+'-geometry')
        mesh.from_pydata([xyz(v) for v in p['vertices']],[],p['faces'])
        for material in materials:mesh.materials.append(material)
        color=mesh.color_attributes.new(name='PetTint',type='BYTE_COLOR',domain='CORNER')
        for poly,tint,material,smooth in zip(mesh.polygons,p['colors'],p['materials'],p['smooth']):
            poly.material_index=material;poly.use_smooth=smooth
            for loop in poly.loop_indices:color.data[loop].color=tint
        mesh.update()
        obj=bpy.data.objects.new(name+'-'+label+'-mesh',mesh);library.collection.objects.link(obj);obj.parent=joint;joints[label]=joint
        all_vertices.extend(Vector(v)+p['pivot'] for v in p['vertices'])
    root['height']=max(v.y for v in all_vertices)
    root['width']=max(v.x for v in all_vertices)-min(v.x for v in all_vertices)
    root['triangles']=sum(sum(len(f)-2 for f in p['faces']) for p in data['parts'].values())

for directory in (EXPORT.parent,SOURCE.parent,ICONS):directory.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+length])
assert len(document['scenes'][0]['nodes'])==8
assert not document.get('images')
assert set(document['nodes'][i]['name'] for i in document['scenes'][0]['nodes'])==set(PETS)
assert EXPORT.stat().st_size<8_000_000
assert sum(root['triangles'] for root in roots.values())<125_000
for root in roots.values():
    assert .5<root['height']<1.2 and all(abs(v-1)<1e-6 for v in root.scale)

def clone_tree(source,scene):
    obj=source.copy();scene.collection.objects.link(obj)
    for child in source.children:
        copied=clone_tree(child,scene);copied.parent=obj
    return obj

def aim(obj,at):obj.rotation_euler=(Vector(xyz(at))-obj.location).to_track_quat('-Z','Y').to_euler()

def fit_portrait(camera,root):
    bpy.context.view_layer.update()
    inverse=camera.matrix_world.inverted();points=[]
    for obj in [root,*root.children_recursive]:
        if obj.type=='MESH':points.extend(inverse@(obj.matrix_world@Vector(corner)) for corner in obj.bound_box)
    low=[min(p[i] for p in points) for i in (0,1)];high=[max(p[i] for p in points) for i in (0,1)]
    camera.location+=camera.matrix_world.to_3x3()@Vector(((low[0]+high[0])/2,(low[1]+high[1])/2,0))
    camera.data.ortho_scale=max(high[i]-low[i] for i in (0,1))*1.15

def render_setup(scene,width,height):
    scene.world=bpy.data.worlds.new(scene.name+' world');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.26,.33,.43,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
    scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='AgX'
    for location,power,size,color in [((-3,5,4),420,3.0,(1,.84,.65)),((3,3,1),200,2.5,(.70,.86,1)),((0,4,-3),500,2.0,(.72,.90,1))]:
        bpy.ops.object.light_add(type='AREA',location=xyz(location));lamp=bpy.context.object
        lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;lamp.data.color=color;aim(lamp,(0,.4,0))
    bpy.ops.object.camera_add(location=xyz((1.8,1.25,2.8)));camera=bpy.context.object
    camera.data.type='ORTHO';camera.data.ortho_scale=1.55;aim(camera,(0,.48,0));scene.camera=camera

def plain_material(name,color,metal=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=color
    shader.inputs['Roughness'].default_value=.7;shader.inputs['Metallic'].default_value=metal
    return mat

# Save a full gallery scene for immediate inspection in Blender, plus large per-pet renders.
gallery=bpy.data.scenes.new('Eight rare companions');bpy.context.window.scene=gallery
render_setup(gallery,2400,1420)
gallery_mat=plain_material('Gallery stone',(.048,.075,.077,1))
rim_mat=plain_material('Gallery brass',(.31,.22,.075,1),.45)
label_mat=plain_material('Gallery text',(.76,.84,.75,1))
for i,(name,root) in enumerate(roots.items()):
    x=(i%4-1.5)*1.75;z=(i//4-.5)*2.85
    obj=clone_tree(root,gallery);obj.location=xyz((x,.07,z));obj.rotation_euler.z=-.23
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.68,depth=.080,location=xyz((x,.03,z)))
    plinth=bpy.context.object;plinth.data.materials.append(gallery_mat)
    bevel=plinth.modifiers.new('Soft stone edges','BEVEL');bevel.width=.018;bevel.segments=2
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.681,depth=.012,location=xyz((x,.007,z)))
    bpy.context.object.data.materials.append(rim_mat)
    bpy.ops.object.text_add(location=xyz((x,.014,z+.80)));label=bpy.context.object
    label.data.body=PETS[name]['title'];label.data.align_x='CENTER';label.data.size=.095;label.data.extrude=.0005
    label.data.materials.append(label_mat)
    bpy.ops.object.text_add(location=xyz((x,.012,z+.98)));small=bpy.context.object
    small.data.body='MYTHIC  /  WORLD BOSS' if name=='golden-pig' else 'SUPER RARE  /  COMPANION'
    small.data.align_x='CENTER';small.data.size=.043;small.data.materials.append(label_mat)
bpy.ops.mesh.primitive_plane_add(size=200,location=xyz((0,-.02,0)));bpy.context.object.data.materials.append(plain_material('Gallery floor',(.018,.030,.032,1)))
gallery.camera.location=xyz((0,7.0,9.5));gallery.camera.data.ortho_scale=8.0;aim(gallery.camera,(0,.32,.25))
for obj in gallery.objects:
    if obj.type=='LIGHT':obj.data.energy*=4;obj.data.size*=2
gallery.render.filepath=str(PREVIEW)
bpy.context.preferences.filepaths.save_version=0
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
    for name,root in roots.items():
        scene=bpy.data.scenes.new(name+' portrait');bpy.context.window.scene=scene
        render_setup(scene,768,768);portrait=clone_tree(root,scene);scene.render.film_transparent=True
        height=root['height'];scene.camera.data.ortho_scale=max(height*1.30,root['width']*1.25,1.12)
        scene.camera.location=xyz((1.8,1.35,3.0));aim(scene.camera,(0,height*.48,.015))
        if name in ('moon-owl','lantern-moth'):
            scene.camera.location=xyz((.9,1.05,3.6));aim(scene.camera,(0,height*.5,0))
        fit_portrait(scene.camera,portrait)
        scene.render.filepath=str(SOURCE.parent/(name+'-preview.png'));bpy.ops.render.render(write_still=True)
        scene.render.resolution_x=256;scene.render.resolution_y=256;scene.cycles.samples=32
        scene.render.filepath=str(ICONS/(name+'.png'));bpy.ops.render.render(write_still=True)
    bpy.context.window.scene=gallery
# The source opens on the lit gallery; linked library roots stay untouched for export.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('PETS '+json.dumps({'bytes':EXPORT.stat().st_size,'materials':len(document['materials']),'pets':{name:{'height':root['height'],'width':root['width'],'triangles':root['triangles'],'locomotion':root['locomotion'],'parts':list(PETS[name]['parts'])} for name,root in roots.items()}}))
