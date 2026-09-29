"""Blender-author the autumn companion collection; old collectible assets stay intact.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-autumn-pet-assets.py -- --render
One mesh per articulated part, three shared vertex-color materials, metres/Y-up/+Z forward.
"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/autumn-pets.glb'
SOURCE=ROOT/'assets/source/autumn-pets.blend'
PREVIEW=ROOT/'assets/source/autumn-pets-preview.png'
ICONS=ROOT/'public/ui/pets'
TAU=math.tau
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
PALETTE={'ink':'18212A','white':'FFF8E5','cream':'EADAB9','sand':'CBB087','bark':'554235','darkbark':'322D2A',
'moss':'528364','deepmoss':'244C40','fern':'83B670','lime':'B8D483','rust':'BE6538','honey':'DD9850','copper':'7A3A2D',
'pink':'DE929C','rose':'B74C76','petal':'EAAEC3','purple':'665782','violet':'8777AE','lilac':'C2A7E4',
'moon':'526B88','midnight':'273C58','silver':'95B8CA','ice':'BFDFE4','snow':'E7F2EC','teal':'448F91','deepteal':'244E62',
'gold':'CBA154','lightgold':'F4D394','bronze':'79613C','ember':'E77C32','red':'A94732','coal':'402F35','flame':'FFD782',
'crystal':'956EC8','crystaldark':'534570','amethyst':'C4A4F2','ruby':'B42F55','emerald':'45B890'}
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
COLORS={k:tuple(linear(int(v[i:i+2],16)/255) for i in (0,2,4))+(1,) for k,v in PALETTE.items()}
def xyz(p):return (p[0],-p[2],p[1])
PETS={};active_pet='';active_part=''
def pet(name,title,locomotion='walk'):
    global active_pet
    active_pet=name;PETS[name]={'title':title,'locomotion':locomotion,'parts':{}}
def part(name,pivot=(0,0,0),parent=None):
    global active_part
    active_part=name;PETS[active_pet]['parts'][name]={'pivot':Vector(pivot),'parent':parent,'vertices':[],'faces':[],'colors':[],'materials':[],'smooth':[]}
def shape(tint,vertices,faces,metal=False,glow=False,smooth=False):
    data=PETS[active_pet]['parts'][active_part];offset=len(data['vertices'])
    data['vertices'].extend(tuple(Vector(v)-data['pivot']) for v in vertices)
    for face in faces:
        data['faces'].append(tuple(offset+i for i in face));data['colors'].append(COLORS[tint]);data['materials'].append(2 if glow else 1 if metal else 0);data['smooth'].append(smooth)
def ball(tint, c, scale, segments=16, rings=10, metal=False, glow=False, smooth=False):
    """A true stepped solid. Greedy exterior faces avoid one draw/mesh per voxel."""
    detail=max(4,min(9,round(segments/2.5)))
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

def tube(tint,points,radii,sides=8,metal=False,glow=False,smooth=True):
    sides=4
    points=[Vector(p) for p in points]
    if isinstance(radii,(int,float)):radii=[radii]*len(points)
    verts=[];previous=None
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        if previous is None:
            ref=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0));a=tangent.cross(ref).normalized()
        else:a=(previous-tangent*previous.dot(tangent)).normalized()
        previous=a;b=tangent.cross(a).normalized()
        verts.extend(tuple(p+radii[i]*(a*math.cos(TAU*j/sides)+b*math.sin(TAU*j/sides))) for j in range(sides))
    faces=[tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]
    for i in range(len(points)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    shape(tint,verts,faces,metal,glow,False)
def leaf(tint,a,b,width,thick=.014,metal=False,normal=(0,0,1)):
    """Six stepped blocks make a carved leaf/feather silhouette in the game's voxel style."""
    a=Vector(a);b=Vector(b);d=b-a;side=d.cross(Vector(normal)).normalized()*width/2
    if side.length<.0001:side=d.cross(Vector((0,1,0))).normalized()*width/2
    normal=side.cross(d).normalized()*thick
    for i,profile in enumerate((.42,.72,1,.88,.58,.25)):
        center=a+d*(i+.5)/6
        vertices=[center+side*x*profile+d*y/12+normal*z for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        shape(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],metal)
def feather(tint,a,b,width,shaft='silver'):
    leaf(tint,a,b,width,.014)
    a=Vector(a);b=Vector(b);d=b-a;front=Vector((0,0,.015));side=d.cross(Vector((0,0,1))).normalized()
    tube(shaft,[a+front,a+d*.45+front*1.15,b+front*.3],[.004,.003,.0006],5)
    for j in range(1,5):
        t=j/6;c=a+d*t+front
        for s in (-1,1):tube(shaft,[c,c+d*.085+side*s*width*.40*math.sin(math.pi*t)],[.0015,.0004],4)
def eye(x,y,z,size=.038,iris='gold'):
    z+=.024  # Keep inset square eyes in front of the stepped facial planes.
    # Octagonal clipped squares keep the eyes readable at the game's camera distance.
    def tile(tint,c,w,h,depth,cut=.22):
        outline=[(-1+cut,-1),(1-cut,-1),(1,-1+cut),(1,1-cut),(1-cut,1),(-1+cut,1),(-1,1-cut),(-1,-1+cut)]
        vertices=[(c[0]+u*w,c[1]+v*h,c[2]+d*depth) for d in (-1,1) for u,v in outline]
        shape(tint,vertices,[tuple(reversed(range(8))),tuple(range(8,16))]+[(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)])
    tile('ink',(x,y,z),size*1.13,size*1.13,size*.15)
    tile(iris,(x,y,z+size*.22),size*.87,size*.9,size*.12)
    tile('ink',(x,y,z+size*.43),size*.40,size*.64,size*.09,.08)
    tile('white',(x-size*.23,y+size*.28,z+size*.57),size*.18,size*.19,size*.04,.02)
def gem(tint,c,scale,metal=False,glow=False):ball(tint,c,scale,8,4,metal,glow,False)
def ring(tint,c,rx,ry,r=.009,metal=False):
    tube(tint,[(c[0]+rx*math.cos(TAU*i/32),c[1]+ry*math.sin(TAU*i/32),c[2]) for i in range(33)],r,6,metal)
def paws(tint,claw,x,z,y=.22,width=.068):
    tube(tint,[(x,y+.10,z-.018),(x,y,z-.010),(x,.105,z+.018),(x,.059,z+.053)],[width*.98,width*.85,width*.72,width*.8],10)
    ball(tint,(x,.052,z+.054),(width,.052,width*1.32),16,10)
    for i in range(3):
        tx=x+(i-1)*width*.57
        ball(tint,(tx,.038,z+width*1.4),(width*.33,.030,width*.56),12,8)
        tube(claw,[(tx,.035,z+width*1.63),(tx,.027,z+width*2.03),(tx,.016,z+width*2.11)],[width*.15,width*.10,.001],6)
def flower(c,size,tint='petal'):
    c=Vector(c)
    for j in range(7):
        a=TAU*j/7;d=Vector((math.cos(a),math.sin(a),.06))
        leaf(tint,c-d*size*.10,c+d*size,size*.78,.01)
    gem('gold',c+Vector((0,0,.014)),(size*.26,size*.26,.014))
def fern(a,b,width):
    a=Vector(a);b=Vector(b);d=b-a;side=d.cross(Vector((0,0,1))).normalized()
    tube('deepmoss',[a,b],[.005,.001],6)
    for j in range(1,7):
        t=j/8;c=a+d*t
        for s in (-1,1):leaf('fern' if j%2 else 'lime',c,c+d*.13+side*s*width*(1-t*.75),width*.29,.006)
def ruff(tint,c,radius,length,rows=2):
    for row in range(rows):
        for j in range(15):
            a=TAU*j/15;x=c[0]+math.cos(a)*radius;y=c[1]+math.sin(a)*radius*.80-row*.028
            leaf(tint,(x*.78,y,c[2]-row*.027),(x*1.15,y-length*.65,c[2]+length*.28-row*.027),.052,.013)

# Bramble Badger: broad low shoulders, a striped shovel face, and a living bramble mantle.
pet('bramble-badger','BRAMBLE BADGER')
part('body');ball('moon',(0,.285,-.10),(.235,.188,.315),22,14)
ball('silver',(0,.36,.07),(.214,.155,.20),20,14)
ball('cream',(0,.201,.105),(.173,.083,.168))
# Short coarse guard hairs follow the back instead of smoothing its stepped outline.
for row in range(5):
    for j in range(8):
        z=.08-j*.054;x=(row-2)*.065;y=.40+.055*(1-abs(row-2)/2)
        leaf('silver' if (j+row)%3 else 'moon',(x,y,z+.025),(x,y+.018,z-.08),.062,.018,normal=(0,1,0))
for s in (-1,1):
    vine=[(s*.19,.34,.14),(s*.218,.37,.04),(s*.20,.40,-.09),(s*.16,.43,-.22)]
    tube('darkbark',vine,.010)
    for j in range(5):
        z=.11-j*.078;x=s*(.212-j*.007);y=.365+j*.014
        leaf('deepmoss',(x,y,z),(x+s*.06,y+.026,z-.062),.061,.009,normal=(s,1,0))
        leaf('fern',(x,y,z),(x+s*.032,y+.062,z+.03),.046,.007,normal=(s,1,0))
        tube('bark',[(x,y,z),(x+s*.018,y+.031,z-.009)],[.009,.0005])
        if j%2==0:
            for dx,dy in ((0,0),(.018,.013),(-.017,.013)):
                gem('ruby',(x+dx,y+dy+.02,z+.022),(.016,.017,.014))
part('head',(0,.32,.15),'body');ball('cream',(0,.359,.241),(.185,.141,.175),22,14)
ball('white',(0,.30,.36),(.136,.087,.143),20,12)
# The paired dark facial stripes run from each ear through the eyes to the muzzle.
for s in (-1,1):
    ball('ink',(s*.103,.383,.329),(.061,.089,.053),20,12)
    leaf('ink',(s*.118,.469,.258),(s*.054,.328,.473),.072,.019)
    ball('moon',(s*.152,.478,.165),(.072,.07,.044))
    ball('cream',(s*.154,.485,.2),(.047,.041,.018))
    ball('pink',(s*.154,.481,.214),(.025,.027,.009))
    eye(s*.107,.394,.383,.031,'honey')
    for j in range(4):leaf('white',(s*.11,.338-j*.020,.339),(s*.22,.313-j*.024,.306),.045,.016)
    for j in range(3):tube('cream',[(s*.072,.295+j*.012,.449),(s*.175,.286+j*.024,.492)],[.0022,.0005])
ball('ink',(0,.318,.499),(.055,.032,.032))
tube('bark',[(-.055,.265,.45),(0,.256,.474),(.055,.265,.45)],.003)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.10),(False,-.275)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.165,.205,z),'body')
        paws('ink','cream',s*.178,z,y=.14,width=.073)
        leaf('silver',(s*.16,.21,z-.03),(s*.18,.12,z+.016),.105,.021)
part('tail',(0,.24,-.355),'body')
tube('moon',[(0,.24,-.35),(.018,.235,-.47),(.065,.29,-.545)],[.08,.063,.012])
for j in range(5):leaf('silver',((j-2)*.016,.276,-.443),((j-2)*.018+.053,.319,-.55),.032,.01,normal=(0,1,0))

# Duskwind Raven: hooked beak, chest bib, long flight feathers, and a silver crescent collar.
pet('duskwind-raven','DUSKWIND RAVEN','hover')
part('body');ball('midnight',(0,.31,-.035),(.172,.23,.17),22,14)
ball('purple',(0,.413,.065),(.144,.177,.13))
for row in range(5):
    for j in range(5):
        x=(j-2)*.047
        feather('moon' if (j+row)%3 else 'violet',(x,.48-row*.05,.151),(x*.8,.385-row*.042,.162),.061,'midnight')
ring('silver',(0,.53,.111),.123,.054,.008,True)
# A carved crescent hangs at the breast.
for j in range(11):
    a=.35+math.pi*1.60*j/10
    tube('ice',[(.035*math.sin(a),.439+.041*math.cos(a),.195),(.035*math.sin(a+.15),.439+.041*math.cos(a+.15),.195)],.007,metal=True)
part('head',(0,.51,.048),'body');ball('midnight',(0,.606,.092),(.141,.136,.145),22,14)
for s in (-1,1):
    ball('moon',(s*.075,.608,.204),(.067,.066,.042))
    eye(s*.078,.625,.239,.033,'amethyst')
    leaf('ink',(s*.025,.686,.23),(s*.128,.69,.182),.034,.013)
    for j in range(3):feather('purple',(s*.079,.708-j*.018,.012),(s*(.10+j*.014),.83-j*.015,-.055),.049,'violet')
    for j in range(4):feather('midnight',(s*.11,.625-j*.025,.143),(s*.167,.579-j*.03,.063),.054,'moon')
tube('ink',[(0,.626,.22),(0,.607,.32),(0,.574,.365),(0,.552,.342)],[.046,.04,.018,.001])
leaf('moon',(0,.646,.235),(0,.599,.351),.042,.010)
for s,label in [(-1,'left'),(1,'right')]:
    part('leg-front-'+label,(s*.084,.169,.00),'body')
    tube('ink',[(s*.082,.194,0),(s*.079,.105,.028),(s*.089,.041,.05)],[.035,.021,.018])
    for j in range(3):tube('silver',[(s*.09,.046,.049),(s*.09+(j-1)*.037,.027,.119),(s*.09+(j-1)*.042,.014,.139)],[.012,.009,.001])
    part('wing-'+label,(s*.116,.454,-.018),'body')
    tube('midnight',[(s*.115,.452,-.017),(s*.237,.472,-.048),(s*.347,.413,-.13)],[.055,.049,.026])
    for row in range(3):
        for j in range(7):
            a=(s*(.16+j*.034),.475-row*.038,-.04-row*.026)
            b=(s*(.23+j*.048),.267-row*.045-j*.015,-.16-j*.018)
            feather(['midnight','purple','moon'][row],a,b,.072,'violet' if row==1 else 'silver')
    for j in range(5):feather('violet',(s*(.15+j*.032),.505,-.033),(s*(.21+j*.036),.405,-.06),.058,'moon')
part('tail',(0,.218,-.144),'body')
for j in range(7):
    feather('ink' if j%2 else 'purple',((j-3)*.021,.249,-.116),((j-3)*.049,.11,-.463+abs(j-3)*.029),.08,'moon')

# Ember Axolotl: smiling broad head, six branched external gills, translucent-looking tail sail.
pet('ember-axolotl','EMBER AXOLOTL')
part('body');ball('rose',(0,.172,-.086),(.158,.111,.287),22,14)
ball('petal',(0,.156,-.02),(.139,.068,.246),20,12)
for row in range(3):
    for j in range(9):
        x=(row-1)*.075;z=.126-j*.05;y=.258 if row==1 else .237
        ball('honey' if j%3 else 'flame',(x,y,z),(.014,.008,.017),8,5,glow=j%3==0)
part('head',(0,.211,.158),'body');ball('pink',(0,.264,.25),(.227,.137,.153),22,14)
ball('petal',(0,.228,.347),(.193,.077,.087),20,12)
ball('cream',(0,.206,.361),(.13,.033,.074))
for s in (-1,1):
    eye(s*.127,.292,.379,.040,'flame')
    ball('rose',(s*.173,.233,.389),(.035,.018,.008),10,6)
    # Each external gill has its own branching, lit filaments.
    for j in range(3):
        a=Vector((s*.18,.27+(j-1)*.060,.192))
        b=Vector((s*(.39-abs(j-1)*.055),.30+(j-1)*.156,.166))
        tube('ember',[a,a+(b-a)*.57,b],[.028,.023,.006])
        d=b-a
        for k in range(1,6):
            c=a+d*k/6
            for q in (-1,1):
                end=c+Vector((s*.021,q*(.026+.01*(1-k/6)),.024))
                tube('rose',[c,end],[.012,.004])
                gem('flame',end,(.009,.012,.009),glow=True)
    for j in range(3):gem('flame',(s*(.063+j*.029),.348-j*.008,.353),(.008,.006,.009),glow=True)
tube('rose',[(-.095,.213,.422),(-.05,.196,.437),(0,.192,.44),(.05,.196,.437),(.095,.213,.422)],.0035)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.076),(False,-.229)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.112,.16,z),'body')
        tube('pink',[(s*.11,.17,z),(s*.212,.091,z+.014),(s*.207,.039,z+.062)],[.035,.029,.024])
        ball('petal',(s*.21,.034,z+.065),(.044,.025,.051),12,8)
        for j in range(3):tube('petal',[(s*.21,.035,z+.064),(s*.21+(j-1)*.035,.022,z+.129)],[.013,.007])
part('tail',(0,.172,-.299),'body')
tube('rose',[(0,.17,-.29),(.02,.151,-.425),(.08,.173,-.54),(.147,.234,-.631),(.163,.292,-.669)],[.095,.074,.046,.023,.001])
for j in range(7):
    t=j/7;z=-.29-t*.36;x=.17*t*t;y=.18+.11*t*t
    leaf('pink',(x,y,z),(x,y+.142*(1-t*.7),z-.079),.102,.010,normal=(1,0,0))
    leaf('ember',(x+.012,y+.071,z-.034),(x+.012,y+.126*(1-t*.55),z-.060),.057,.005,normal=(1,0,0))

# Geode Hedgehog: a round earthy face under a dome of individual mineral spines.
pet('geode-hedgehog','GEODE HEDGEHOG')
part('body');ball('deepteal',(0,.245,-.063),(.257,.234,.267),24,14)
ball('sand',(0,.177,.118),(.186,.131,.144),20,12)
# Crystals grow radially from the dome, with small pale seams through their bases.
for row in range(7):
    z=.108-row*.058
    radius=math.sqrt(max(.12,1-((z+.063)/.275)**2))
    for j in range(10):
        a=.08+math.pi*(j+.5*(row%2))/10
        n=Vector((math.cos(a),math.sin(a),-.15));n.normalize()
        c=Vector((.245*radius*math.cos(a),.245+.222*radius*math.sin(a),z))
        length=.070+.036*((row+j)%3)
        tint=['teal','emerald','ice','silver'][(row+2*j)%4]
        tube('bark',[c-n*.019,c+n*.033],[.025,.022])
        tube(tint,[c,c+n*length*.72,c+n*length],[.030,.023,.0004],glow=(row+j)%9==0)
        if (j+row)%3==0:gem('lightgold',c+n*.018,(.018,.016,.019),True)
for s in (-1,1):
    for j in range(5):
        z=.13-j*.067
        leaf('bark',(s*.229,.255,z),(s*.261,.188,z-.025),.051,.014,normal=(s,0,0))
part('head',(0,.24,.139),'body');ball('honey',(0,.294,.208),(.155,.125,.134),22,14)
ball('cream',(0,.246,.317),(.106,.065,.092))
for s in (-1,1):
    ball('sand',(s*.13,.366,.142),(.063,.065,.032))
    ball('pink',(s*.132,.374,.166),(.036,.036,.01))
    eye(s*.084,.317,.319,.034,'emerald')
    for j in range(3):leaf('sand',(s*.117,.31-j*.023,.248),(s*.179,.278-j*.025,.232),.041,.013)
    for j in range(3):gem('bark',(s*(.063+j*.018),.257,.359-j*.007),(.004,.004,.005))
ball('darkbark',(0,.275,.401),(.03,.021,.021))
tube('bark',[(-.035,.231,.368),(0,.225,.385),(.035,.231,.368)],.0025)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.115),(False,-.209)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.15,.14,z),'body')
        paws('sand','bark',s*.161,z,y=.10,width=.053)
part('tail',(0,.172,-.273),'body');tube('sand',[(0,.17,-.265),(.021,.132,-.353),(.032,.14,-.389)],[.034,.026,.001])

# Clover Mouse: enormous round ears, a clover cap and pocket acorn, with a looping bare tail.
pet('clover-mouse','CLOVER MOUSE','hop')
part('body');ball('bark',(0,.266,-.03),(.168,.192,.154),22,14)
ball('cream',(0,.264,.088),(.118,.148,.067))
for s in (-1,1):
    ball('sand',(s*.125,.151,-.079),(.084,.13,.108))
    fern((s*.029,.352,.142),(s*.112,.283,.142),.04)
# Acorn charm sits against the chest.
ball('honey',(0,.25,.177),(.036,.048,.028),12,8)
ball('darkbark',(0,.287,.177),(.045,.021,.034),12,8)
for j in range(5):tube('sand',[((j-2)*.012,.231,.199),((j-2)*.015,.272,.201)],.0018)
tube('bark',[(0,.304,.177),(.003,.323,.165)],[.006,.003])
part('head',(0,.40,.024),'body');ball('sand',(0,.51,.079),(.171,.148,.151),22,14)
ball('cream',(0,.456,.198),(.129,.077,.098))
for s in (-1,1):
    ball('bark',(s*.161,.664,.015),(.121,.137,.047),24,14)
    ball('honey',(s*.166,.67,.052),(.092,.108,.024),22,12)
    ball('pink',(s*.169,.67,.070),(.071,.085,.012),20,10)
    eye(s*.09,.535,.218,.042,'honey')
    ball('pink',(s*.109,.457,.248),(.027,.018,.009))
    for j in range(3):tube('cream',[(s*.055,.451+j*.012,.275),(s*.15,.439+j*.023,.300),(s*.232,.42+j*.038,.279)],[.002,.0015,.0004])
ball('rose',(0,.479,.29),(.023,.016,.018))
tube('bark',[(0,.464,.298),(0,.445,.297),(-.023,.438,.287)],.0023)
tube('bark',[(0,.445,.297),(.023,.438,.287)],.0023)
# Three broad heart-shaped leaves form the little clover cap.
tube('deepmoss',[(0,.646,.093),(.015,.736,.076),(.039,.773,.074)],[.007,.006,.002])
for j in range(3):
    a=TAU*j/3;c=Vector((.01,.718,.119));d=Vector((math.cos(a),math.sin(a),0))
    leaf('moss',c,c+d*.104,.107,.012)
    for s in (-1,1):ball('fern',c+d*.078+Vector((-d.y,d.x,0))*s*.023,(.032,.029,.014),12,8)
    tube('lime',[c+Vector((0,0,.016)),c+d*.086+Vector((0,0,.016))],[.002,.0005])
for s,label in [(-1,'left'),(1,'right')]:
    part('leg-front-'+label,(s*.117,.346,.04),'body')
    tube('bark',[(s*.12,.35,.07),(s*.153,.248,.105),(s*.075,.219,.172)],[.038,.028,.015])
    ball('pink',(s*.072,.225,.171),(.033,.034,.025),14,9)
    for j in range(3):tube('cream',[(s*.065+(j-1)*.012,.226,.19),(s*.063+(j-1)*.011,.198,.191)],.003)
    part('leg-rear-'+label,(s*.12,.155,-.07),'body')
    ball('sand',(s*.126,.11,-.066),(.073,.104,.078))
    ball('pink',(s*.123,.040,.022),(.060,.039,.100))
    for j in range(3):tube('cream',[(s*.123+(j-1)*.025,.038,.088),(s*.123+(j-1)*.025,.023,.127)],[.005,.001])
part('tail',(0,.147,-.132),'body')
tube('pink',[(0,.15,-.13),(.097,.107,-.242),(.229,.084,-.307),(.326,.116,-.281),(.373,.188,-.223),(.359,.252,-.169),(.306,.284,-.183)],[.025,.022,.019,.017,.014,.01,.001])
for j in range(5):
    c=Vector((.095+j*.028,.109-j*.004,-.243-j*.014))
    tube('rose',[c+Vector((0,.014,0)),c+Vector((.009,.009,.01))],.002)

# Dewbell Dragonfly: four etched leaf wings, faceted eyes, six thin legs and a long segmented abdomen.
pet('dewbell-dragonfly','DEWBELL DRAGONFLY','hover')
part('body');ball('deepteal',(0,.291,-.038),(.10,.095,.162),20,12)
ball('emerald',(0,.319,.039),(.088,.088,.092))
for j in range(4):
    ring('lightgold',(0,.328-j*.015,.06-j*.063),.076-j*.009,.07-j*.006,.005,True)
# The legs remain below the body at rest; root animation lifts the whole insect in game.
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.069),(False,-.083)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.055,.266,z),'body')
        tube('deepteal',[(s*.048,.263,z),(s*.115,.169,z+.015),(s*.077,.052,z+.095)],[.011,.008,.003])
        tube('gold',[(s*.077,.052,z+.095),(s*.066,.035,z+.124)],[.005,.001],metal=True)
        if not fore:
            tube('deepteal',[(s*.059,.264,-.024),(s*.162,.197,-.043),(s*.16,.065,.025)],[.011,.008,.003])
            tube('gold',[(s*.16,.065,.025),(s*.142,.048,.054)],[.005,.001],metal=True)
    part('wing-'+label,(s*.049,.341,-.017),'body')
    # Two broad wing lobes share each shoulder joint, preserving the existing animation rig.
    for fore in (True,False):
        a=Vector((s*.045,.34,.025 if fore else -.064))
        b=Vector((s*(.57 if fore else .49),.373,-.01 if fore else -.338))
        width=.153 if fore else .169
        leaf('silver' if fore else 'ice',a,b,width,.008,normal=(0,1,0))
        d=b-a;side=d.cross(Vector((0,1,0))).normalized()
        tube('teal',[a,a+d*.45,b],[.008,.005,.001])
        for j in range(1,6):
            c=a+d*j/7
            for q in (-1,1):
                end=c+side*q*width*.43*math.sin(math.pi*j/7)+d*.035
                tube('teal',[c,end],[.003,.001])
                if j%2==0:gem('ice',end+Vector((0,.01,0)),(.010,.013,.010),glow=True)
        # Amber eyespots make the four leaves legible from overhead.
        c=a+d*.78+Vector((0,.017,0))
        ball('gold',c,(.034,.006,.025),12,7,metal=True)
        ball('deepteal',c+Vector((0,.006,0)),(.019,.004,.013),10,6)
part('head',(0,.319,.091),'body');ball('teal',(0,.356,.143),(.117,.106,.107),20,12)
for s in (-1,1):
    ball('lightgold',(s*.071,.385,.215),(.064,.066,.04),14,9,metal=True)
    eye(s*.073,.39,.255,.042,'emerald')
    tube('deepteal',[(s*.051,.439,.142),(s*.094,.527,.167),(s*.116,.564,.143)],[.006,.004,.001])
    gem('ice',(s*.116,.564,.143),(.015,.019,.013),glow=True)
    flower((s*.115,.335,.173),.032,'ice')
ball('lightgold',(0,.315,.234),(.042,.035,.021),metal=True)
tube('deepteal',[(-.033,.316,.254),(0,.305,.259),(.033,.316,.254)],.0025)
part('tail',(0,.27,-.137),'body')
for j in range(7):
    t=j/7;c=(.032*math.sin(t*math.pi),.28+.074*t,-.149-j*.054)
    ball('teal' if j%2 else 'emerald',c,(.06*(1-t*.7),.058*(1-t*.6),.047),14,9)
    ring('gold',(c[0],c[1],c[2]-.014),.046*(1-t*.7),.047*(1-t*.6),.004,True)
# A hanging dew bell glows at the end of the abdomen.
tube('gold',[(.014,.35,-.488),(.012,.347,-.527),(.015,.316,-.552)],.007,metal=True)
ball('ice',(.015,.281,-.552),(.038,.044,.035),14,9,glow=True)
for j in range(5):
    a=TAU*j/5
    leaf('teal',(.015,.316,-.552),(.015+.034*math.cos(a),.274,-.552+.034*math.sin(a)),.028,.006,normal=(math.cos(a),0,math.sin(a)))

# Snowcap Stoat: long white body, a black tail tip, and a small snow-dusted mushroom cap.
pet('snowcap-stoat','SNOWCAP STOAT')
part('body');ball('snow',(0,.28,-.11),(.13,.157,.32),22,14)
ball('white',(0,.396,.098),(.112,.208,.121),22,14)
ball('cream',(0,.353,.177),(.092,.15,.05))
for s in (-1,1):
    for j in range(6):
        z=.034-j*.066
        leaf('ice',(s*.112,.33,z),(s*.137,.268,z-.038),.043,.009,normal=(s,0,0))
ring('teal',(0,.496,.138),.104,.085,.017)
ring('silver',(0,.492,.157),.105,.082,.005,True)
# Four sharp points surround a frosted crystal at the collar.
gem('ice',(0,.405,.229),(.024,.035,.014),glow=True)
for j in range(4):
    a=TAU*j/4;c=Vector((0,.405,.23));d=Vector((math.cos(a),math.sin(a),0))
    leaf('silver',c+d*.022,c+d*.047,.021,.008,True)
part('head',(0,.495,.148),'body');ball('white',(0,.601,.208),(.134,.129,.141),22,14)
ball('cream',(0,.555,.319),(.094,.060,.079))
for s in (-1,1):
    ball('snow',(s*.11,.693,.131),(.059,.073,.032))
    ball('pink',(s*.112,.7,.156),(.035,.044,.012))
    eye(s*.07,.619,.324,.034,'ice')
    for j in range(3):tube('silver',[(s*.037,.549+j*.014,.375),(s*.139,.535+j*.025,.401),(s*.199,.529+j*.036,.377)],[.0018,.0012,.0003])
ball('pink',(0,.58,.395),(.026,.017,.019))
tube('bark',[(0,.563,.396),(0,.547,.39),(-.024,.540,.379)],.002)
tube('bark',[(0,.547,.39),(.024,.540,.379)],.002)
# A stalk and a low, tiered cap keep this unmistakably a mushroom, not antlers or a crown.
tube('cream',[(0,.704,.12),(-.02,.781,.09)],[.055,.042])
ball('teal',(-.021,.792,.085),(.145,.061,.116),22,14)
ball('moon',(-.025,.834,.081),(.115,.061,.089),20,12)
ball('snow',(-.03,.864,.078),(.085,.037,.066),18,10)
for x,y,z in [(-.107,.81,.141),(.044,.837,.136),(-.04,.854,.166),(.087,.797,.094),(-.094,.837,.039)]:
    gem('white',(x,y,z),(.020,.015,.014))
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.138),(False,-.297)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.08,.221,z),'body')
        paws('snow','silver',s*.093,z,y=.15,width=.049)
part('tail',(0,.26,-.366),'body')
points=[(0,.26,-.357),(.036,.247,-.463),(.104,.286,-.554),(.155,.372,-.61),(.15,.458,-.609),(.106,.521,-.569)]
for j in range(len(points)-1):tube('ink' if j>=3 else 'snow',points[j:j+2],[.047-j*.007,.042-j*.007])
for j in range(5):leaf('ink',(.128+(j-2)*.006,.48,-.593),(.092+(j-2)*.009,.55,-.549),.023,.008)

# Suncrest Peacock: upright neck and a broad fan with fifteen individually layered eyespot plumes.
pet('suncrest-peacock','SUNCREST PEACOCK')
part('body');ball('deepteal',(0,.245,-.035),(.155,.155,.197),22,14)
ball('teal',(0,.341,.099),(.11,.16,.096))
tube('teal',[(0,.317,.098),(0,.482,.102),(0,.595,.112)],[.086,.065,.063])
for row in range(5):
    for j in range(4):
        x=(j-1.5)*.033
        leaf('emerald' if (j+row)%2 else 'teal',(x,.455-row*.038,.174),(x,.391-row*.037,.182),.044,.009)
for s,label in [(-1,'left'),(1,'right')]:
    part('wing-'+label,(s*.105,.303,-.018),'body')
    for row in range(3):
        for j in range(5):
            feather('gold' if row==0 else 'moss' if row==1 else 'deepteal',(s*(.109+row*.008),.32-j*.019,-.016),(s*(.179+row*.012),.202-j*.014,-.112-j*.024),.052,'lightgold' if row==0 else 'teal')
    part('leg-front-'+label,(s*.082,.15,-.01),'body')
    tube('bronze',[(s*.08,.171,-.01),(s*.074,.083,.013),(s*.088,.04,.044)],[.024,.016,.014])
    for j in range(3):tube('gold',[(s*.088,.044,.044),(s*.088+(j-1)*.034,.024,.102),(s*.088+(j-1)*.039,.013,.121)],[.010,.007,.001],metal=True)
part('head',(0,.585,.108),'body');ball('teal',(0,.662,.14),(.096,.105,.102),20,12)
for s in (-1,1):
    ball('white',(s*.051,.666,.22),(.041,.041,.02))
    eye(s*.052,.67,.241,.025,'gold')
    leaf('white',(s*.054,.634,.217),(s*.09,.611,.182),.029,.006)
    feather('emerald',(s*.062,.725,.129),(s*.127,.795,.04),.049,'gold')
tube('gold',[(0,.664,.22),(0,.647,.294),(0,.622,.314)],[.032,.019,.001],metal=True)
for j in range(5):
    x=(j-2)*.024;y=.806+.047*(1-abs(j-2)/2)
    tube('bronze',[(0,.736,.117),(x,y,.094)],[.0035,.002])
    leaf('lightgold',(x,y-.016,.094),(x,y+.039,.094),.033,.009,True)
    gem('emerald',(x,y+.011,.106),(.009,.012,.005),True)
part('tail',(0,.25,-.193),'body')
# Fan is an articulated vertical plane behind the bird, facing the same +Z direction as its face.
for j in range(15):
    angle=-1.18+j*2.36/14
    a=Vector((0,.272,-.184));d=Vector((math.sin(angle),math.cos(angle),-.11))
    length=.635-abs(j-7)*.006;b=a+d*length
    feather('deepmoss',a,b,.134,'bronze')
    feather('emerald',a+d*.27,a+d*(length-.015)+Vector((0,0,.016)),.098,'lightgold')
    c=a+d*(length-.085)+Vector((0,0,.035))
    # Concentric stepped eyes sit proud of each fan feather and remain clear from a distance.
    ball('gold',c,(.044,.063,.010),14,10,metal=True)
    ball('teal',c+Vector((0,0,.012)),(.033,.048,.008),14,10)
    ball('midnight',c+Vector((0,.005,.022)),(.021,.031,.006),12,9)
    ball('ice',c+Vector((-.006,.015,.028)),(.007,.011,.003),8,5,glow=True)
for j in range(9):
    a=(j-4)*.23;d=Vector((math.sin(a),math.cos(a),0));start=Vector((0,.255,-.146))
    feather('gold' if j%2 else 'moss',start,start+d*.278,.080,'lightgold')


library=bpy.context.scene; library.name='Autumn companion asset library'
library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
materials=[]
for name,metal,glow in [('Autumn painted palette',False,False),('Autumn gilded palette',True,False),('Autumn lantern palette',False,True)]:
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.38 if metal else .64
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
assert EXPORT.stat().st_size<12_000_000
assert sum(root['triangles'] for root in roots.values())<320_000
for root in roots.values():
    assert .42<root['height']<1.2 and all(abs(v-1)<1e-6 for v in root.scale)

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
    scene.render.engine='CYCLES';scene.cycles.samples=12 if '--draft' in sys.argv else 24;scene.cycles.use_denoising=True
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.45
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
gallery=bpy.data.scenes.new('Autumn Companions - Detailed Collection');bpy.context.window.scene=gallery
render_setup(gallery,1600 if '--draft' in sys.argv else 3200,950 if '--draft' in sys.argv else 1900)
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
    small.data.body='AUTUMN COLLECTION  /  COMPANION'
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
        render_setup(scene,256,256);portrait=clone_tree(root,scene);scene.render.film_transparent=True
        height=root['height'];scene.camera.data.ortho_scale=max(height*1.30,root['width']*1.25,1.12)
        scene.camera.location=xyz((1.8,1.35,3.0));aim(scene.camera,(0,height*.48,.015))
        if name in ('dewbell-dragonfly','suncrest-peacock'):
            scene.camera.location=xyz((.9,1.05,3.6));aim(scene.camera,(0,height*.5,0))
        if name=='dewbell-dragonfly':
            scene.camera.location=xyz((.9,2.4,3.6));aim(scene.camera,(0,height*.5,0))
        fit_portrait(scene.camera,portrait)
        scene.render.resolution_x=256;scene.render.resolution_y=256;scene.cycles.samples=12 if '--draft' in sys.argv else 24
        scene.render.filepath=str(ICONS/(name+'.png'));bpy.ops.render.render(write_still=True)
    bpy.context.window.scene=gallery
# The source opens on the lit gallery; linked library roots stay untouched for export.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('AUTUMN_PETS '+json.dumps({'bytes':EXPORT.stat().st_size,'materials':len(document['materials']),'pets':{name:{'height':root['height'],'width':root['width'],'triangles':root['triangles'],'locomotion':root['locomotion'],'parts':list(PETS[name]['parts'])} for name,root in roots.items()}}))
