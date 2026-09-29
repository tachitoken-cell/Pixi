"""Blender-author the new wild companion collection; old collectible assets stay intact.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-wild-pet-assets.py -- --render
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
EXPORT=ROOT/'public/models/wild-pets.glb'
SOURCE=ROOT/'assets/source/wild-pets.blend'
PREVIEW=ROOT/'assets/source/wild-pets-preview.png'
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
    if active_pet=='fern-lynx':tint={'honey':'moss','copper':'deepmoss','sand':'fern'}.get(tint,tint)
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

# Fern Lynx: high haunches, broad feline mask, cheek ruff, long tufted ears, short bobtail.
pet('fern-lynx','FERN LYNX')
part('body');ball('honey',(0,.345,-.065),(.184,.206,.30),24,14)
ball('sand',(0,.425,.117),(.149,.201,.148),24,14)
ball('cream',(0,.370,.202),(.117,.177,.065))
ruff('cream',(0,.52,.168),.18,.10)
for s in (-1,1):
    for j in range(9):
        z=.11-j*.042;y=.46-.055*(j%3)
        leaf('copper',(s*.158,y,z),(s*.191,y-.062,z-.025),.033,.006,normal=(s,0,.3))
    fern((s*.065,.48,.22),(s*.175,.59,.18),.067)
ring('deepmoss',(0,.471,.196),.128,.102,.018)
gem('bronze',(0,.361,.266),(.027,.036,.016),True);leaf('emerald',(0,.38,.286),(0,.329,.281),.035,.009,True)
part('head',(0,.50,.20),'body');ball('honey',(0,.584,.245),(.18,.155,.155),24,14)
ball('cream',(0,.527,.352),(.128,.077,.086))
for s in (-1,1):
    ball('cream',(s*.054,.553,.401),(.066,.048,.038),18,10)
    eye(s*.089,.621,.361,.040,'emerald')
    leaf('copper',(s*.048,.672,.338),(s*.135,.672,.331),.021,.006)
    for j in range(6):leaf('cream' if j%2 else 'sand',(s*.112,.611-j*.024,.302),(s*(.211-j*.006),.572-j*.029,.278),.065,.021)
    leaf('copper',(s*.108,.690,.211),(s*.166,.929,.174),.146,.039)
    leaf('honey',(s*.111,.704,.235),(s*.164,.905,.202),.119,.027)
    leaf('pink',(s*.115,.723,.256),(s*.16,.876,.221),.071,.012)
    for j in range(4):tube('ink',[(s*(.158+j*.005),.885+j*.007,.185),(s*(.175+j*.006),.988-j*.011,.158)],[.004,.0005],5)
    fern((s*.104,.696,.247),(s*.205,.790,.249),.057)
    for j in range(3):tube('sand',[(s*.067,.546+j*.015,.424),(s*.146,.54+j*.023,.458),(s*.227,.536+j*.033,.432)],[.0018,.0013,.0004],5)
gem('copper',(0,.576,.441),(.028,.02,.014));tube('copper',[(0,.558,.437),(0,.538,.439),(-.027,.531,.430)],.003,5)
tube('copper',[(0,.538,.439),(.027,.531,.430)],.003,5)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.17),(False,-.236)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.125,.31,z),'body');paws('sand' if fore else 'honey','bark',s*.13,z)
        for j in range(3):leaf('copper',(s*.143,.25-j*.046,z+.04),(s*.159,.21-j*.046,z+.054),.033,.006)
part('tail',(0,.34,-.31),'body');tube('honey',[(0,.34,-.31),(.065,.39,-.44),(.088,.47,-.465)],[.073,.061,.028],12)
for j in range(12):
    a=TAU*j/12;leaf('ink',(.061+.027*math.cos(a),.43,-.447+.023*math.sin(a)),(.082+.028*math.cos(a),.52,-.457+.032*math.sin(a)),.037,.012)

# Moonveil Gryphlet: hooked eagle mask, a lion's haunches and tail, individually carved flight feathers.
pet('moonveil-gryphlet','MOONVEIL GRYPHLET','hover')
part('body');ball('midnight',(0,.32,-.076),(.174,.204,.26),24,14)
ball('silver',(0,.438,.135),(.156,.184,.142));ruff('ice',(0,.50,.18),.157,.135,3)
for row in range(4):
    for j in range(6):
        x=(j-2.5)*.041
        feather('ice' if (j+row)%2 else 'silver',(x,.48-row*.058,.256),(x,.39-row*.055,.253),.055)
part('head',(0,.53,.17),'body');ball('ice',(0,.634,.209),(.157,.157,.148),24,14)
for s in (-1,1):
    ball('white',(s*.071,.634,.305),(.086,.084,.047))
    eye(s*.081,.654,.35,.042,'gold')
    leaf('midnight',(s*.027,.713,.338),(s*.150,.722,.306),.033,.012)
    for j in range(5):feather('silver',(s*.110,.634-j*.029,.254),(s*.192,.596-j*.032,.183),.054)
    feather('midnight',(s*.091,.728,.135),(s*.155,.936,.065),.11)
    feather('silver',(s*.10,.750,.164),(s*.149,.903,.10),.060)
tube('bronze',[(0,.660,.348),(0,.604,.42),(0,.542,.441),(0,.526,.407)],[.055,.052,.025,.001],10)
leaf('lightgold',(0,.667,.364),(0,.548,.447),.063,.02,True)
for j in range(12):
    a=.28*math.pi+1.44*math.pi*j/11
    tube('lightgold',[(.028*math.cos(a),.774+.030*math.sin(a),.293),(.028*math.cos(a+.12),.774+.030*math.sin(a+.12),.293)],.005,5,True)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.143),(False,-.20)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.124,.28,z),'body');paws('bronze' if fore else 'midnight','lightgold',s*.126,z,y=.17,width=.057)
    part('wing-'+label,(s*.13,.48,-.05),'body')
    tube('moon',[(s*.13,.48,-.05),(s*.26,.50,-.086),(s*.41,.51,-.135)],[.045,.04,.02],10)
    for row in range(3):
        for j in range(7):
            a=(s*(.16+j*.046),.565-row*.05,-.094+row*.035)
            b=(s*(.25+j*.055),.31-row*.046+j*.021,-.19+row*.023)
            feather(['midnight','moon','silver'][row],a,b,.09-row*.010,'ice')
    for j in range(5):feather('ice',(s*(.16+j*.035),.606,-.024),(s*(.22+j*.038),.481,-.025),.069)
part('tail',(0,.32,-.30),'body');tube('midnight',[(0,.32,-.285),(.07,.27,-.43),(.17,.31,-.52),(.21,.44,-.49)],[.037,.028,.024,.013],10)
for j in range(9):
    a=TAU*j/9;feather('silver',(.21,.425,-.49),(.21+.045*math.cos(a),.57,-.49+.037*math.sin(a)),.040)

# Cinder Salamander: broad amphibian head, splayed webbed paws, ember freckles and swept dorsal fins.
pet('cinder-salamander','CINDER SALAMANDER')
part('body');ball('red',(0,.231,-.05),(.171,.143,.293),24,14)
ball('honey',(0,.173,.095),(.148,.070,.195))
for row in range(3):
    for j in range(9):
        z=.155-j*.048;x=(row-1)*.075;y=.318+(.052 if row==1 else .015)
        leaf('ember' if j%2 else 'red',(x,y,z),(x,y-.02,z-.083),.055,.018,normal=(0,1,0))
for s in (-1,1):
    for j in range(13):
        z=.18-j*.037;y=.22+.042*math.sin(j*1.7)
        ball('flame',(s*.167,y,z),(.009,.012,.013),10,6,glow=True)
# Dense overlapping flank armor sits on the actual ellipsoid surface, outside the core blocks.
for s in (-1,1):
    for row in range(4):
        for j in range(8):
            y=.20+row*.036;z=.13-j*.052;q=((z+.05)/.293)**2+((y-.231)/.143)**2
            if q>.94:continue
            x=s*(.171*math.sqrt(1-q)+.010)
            leaf('coal' if (j+row)%4==0 else 'ember',(x,y+.015,z+.018),(x+s*.004,y-.020,z-.035),.040,.008,normal=(s,0,.15))
for j in range(7):leaf('coal',(0,.34,.13-j*.067),(0,.49-j*.012,.08-j*.067),.063,.025,normal=(1,0,0))
for j in range(6):leaf('ember',(0,.376,.117-j*.067),(0,.47-j*.012,.08-j*.067),.040,.013,normal=(1,0,0))
part('head',(0,.265,.211),'body');ball('red',(0,.292,.285),(.204,.132,.170),24,14)
ball('ember',(0,.272,.385),(.170,.079,.101),24,12)
ball('honey',(0,.220,.363),(.167,.025,.095))
for s in (-1,1):
    ball('red',(s*.124,.364,.337),(.069,.066,.069));eye(s*.117,.37,.389,.038,'emerald')
    ball('coal',(s*.05,.305,.474),(.01,.006,.004),10,6)
    for j in range(5):
        a=(s*.167,.301-j*.018,.261-j*.022);b=(s*(.256+j*.003),.358-j*.037,.221-j*.026)
        tube('coal',[a,b],[.022,.001],7);leaf('ember',a,b,.038,.008)
    for j in range(7):ball('flame',(s*(.165-j*.016),.282,.417+j*.006),(.006,.007,.004),8,5,glow=True)
tube('coal',[(-.137,.235,.430),(-.075,.225,.468),(0,.223,.481),(.075,.225,.468),(.137,.235,.430)],.003,6)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.17),(False,-.226)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.129,.19,z),'body')
        tube('red',[(s*.13,.20,z),(s*.223,.137,z-.025),(s*.243,.065,z+.012)],[.047,.039,.024],10)
        ball('ember',(s*.25,.038,z+.034),(.051,.038,.065),16,10)
        for j in range(4):
            x=s*(.224+j*.021);endz=z+.088+.018*math.sin(j)
            tube('ember',[(s*.246,.044,z+.046),(x,.023,endz),(x+s*.017,.014,endz+.023)],[.016,.012,.002],7)
part('tail',(0,.223,-.314),'body')
tube('red',[(0,.223,-.29),(.054,.19,-.43),(.15,.17,-.56),(.239,.23,-.65),(.27,.31,-.61)],[.101,.079,.048,.025,.001],14)
for j in range(7):leaf('ember',(.03+j*.035,.26-j*.006,-.35-j*.039),(.03+j*.035,.345-j*.009,-.393-j*.039),.046,.016,normal=(1,0,0))

# Amethyst Terrapin: arched hexagonal shell mosaic, gemstone geode ridge and individually sculpted scales.
pet('amethyst-terrapin','AMETHYST TERRAPIN')
part('body');ball('deepteal',(0,.197,-.035),(.239,.104,.294),24,14)
ball('sand',(0,.141,-.035),(.239,.047,.282),24,10)
ball('crystaldark',(0,.307,-.05),(.261,.220,.302),28,16)
for row in range(5):
    z=-.265+row*.105
    for j in range(5):
        x=(j-2)*.105+(row%2)*.03
        q=(x/.27)**2+((z+.05)/.31)**2
        if q>.83:continue
        y=.307+.224*math.sqrt(1-q)
        gem('violet' if (j+row)%3 else 'amethyst',(x,y,z),(.067,.025,.074))
        leaf('lilac',(x-.022,y+.023,z+.021),(x+.025,y+.022,z-.018),.010,.003,normal=(0,1,0))
for j in range(24):
    a=TAU*j/24;x=.250*math.cos(a);z=-.05+.29*math.sin(a)
    gem('violet' if j%2 else 'crystal',(x,.273,z),(.041,.043,.039))
    gem('silver',(x*1.015,.282,-.05+(z+.05)*1.015),(.020,.012,.019),True)
for x,z,h in [(-.07,-.08,.24),(.02,-.12,.30),(.094,-.04,.17),(-.105,.03,.15),(.025,.05,.16),(.015,-.23,.10)]:
    tube('crystal',[(x,.47,z),(x*.85,.47+h*.78,z-.03),(x*.85,.47+h,z-.03)],[.036,.029,.0003],6,smooth=False)
    tube('amethyst',[(x+.014,.49,z+.016),(x*.85+.01,.47+h*.78,z-.007),(x*.85,.47+h,z-.03)],[.013,.011,.0002],5,smooth=False)
part('head',(0,.215,.233),'body');tube('teal',[(0,.215,.22),(0,.235,.306),(0,.25,.371)],[.083,.09,.073],14)
ball('teal',(0,.267,.357),(.115,.091,.116),22,12);ball('ice',(0,.244,.418),(.087,.035,.060))
for s in (-1,1):
    eye(s*.071,.302,.421,.032,'amethyst')
    for j in range(4):gem('silver',(s*.102,.270-j*.015,.335+j*.023),(.011,.011,.016))
    ball('deepteal',(s*.033,.28,.467),(.007,.005,.003),8,5)
for j in range(3):gem('violet',((j-1)*.038,.352,.37),(.024,.01,.026))
tube('deepteal',[(-.061,.244,.461),(0,.230,.478),(.061,.244,.461)],.0025,5)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.155),(False,-.219)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.185,.18,z),'body');paws('teal','sand',s*.232,z,y=.12,width=.071)
        for row in range(3):
            for j in range(3):gem('silver' if j%2 else 'teal',(s*.232+(j-1)*.030,.164-row*.031,z+.009+row*.014),(.020,.015,.021))
part('tail',(0,.18,-.32),'body');tube('teal',[(0,.18,-.30),(0,.14,-.39),(.022,.16,-.455)],[.038,.025,.001],10)
for j in range(4):gem('violet',(0,.188-j*.008,-.326-j*.024),(.025-j*.004,.018,.017))

# Blossom Jackalope: rabbit stance, soft face, enormous inset ears, branching antlers and tiny flowers.
pet('blossom-jackalope','BLOSSOM JACKALOPE','hop')
part('body');ball('sand',(0,.312,-.085),(.165,.203,.221),24,14)
ball('cream',(0,.371,.078),(.12,.172,.107));ruff('white',(0,.44,.12),.128,.085,2)
for s in (-1,1):
    ball('sand',(s*.106,.233,-.159),(.105,.14,.12))
    for j in range(8):leaf('cream',(s*.117,.40-j*.024,-.056-j*.02),(s*.18,.32-j*.021,-.099-j*.019),.048,.014)
ring('deepmoss',(0,.481,.12),.11,.087,.012)
flower((0,.392,.214),.034)
part('head',(0,.48,.13),'body');ball('cream',(0,.587,.17),(.151,.153,.142),24,14)
for s in (-1,1):
    ball('white',(s*.050,.540,.292),(.061,.052,.046));eye(s*.088,.613,.284,.039,'rose')
    for j in range(5):leaf('white',(s*.105,.585-j*.022,.249),(s*.186,.55-j*.024,.230),.048,.015)
    leaf('sand',(s*.065,.699,.126),(s*.143,1.09,.074),.127,.042)
    leaf('cream',(s*.068,.716,.155),(s*.141,1.075,.098),.108,.028)
    leaf('pink',(s*.072,.742,.181),(s*.137,1.04,.121),.071,.015)
    leaf('petal',(s*.077,.765,.194),(s*.135,1.02,.143),.027,.006)
    antler=[(s*.129,.698,.08),(s*.183,.786,.03),(s*.218,.855,-.029),(s*.208,.926,-.079)]
    tube('bark',antler,[.022,.019,.012,.001],9)
    tube('sand',[(s*.183,.786,.03),(s*.259,.839,.037),(s*.282,.894,.018)],[.013,.010,.001],8)
    tube('sand',[(s*.215,.849,-.025),(s*.282,.89,-.037),(s*.30,.94,-.058)],[.010,.007,.001],8)
    fern((s*.133,.706,.118),(s*.248,.78,.079),.042)
    flower((s*.13,.722,.174),.033,'petal')
    for j in range(3):tube('sand',[(s*.065,.548+j*.012,.319),(s*.15,.544+j*.025,.354),(s*.222,.536+j*.036,.325)],[.0015,.001,.0003],5)
gem('pink',(0,.561,.337),(.023,.017,.012));tube('sand',[(0,.548,.339),(0,.533,.335),(-.022,.522,.322)],.0025,5);tube('sand',[(0,.533,.335),(.022,.522,.322)],.0025,5)
flower((0,.733,.266),.041);fern((-.023,.713,.255),(-.110,.747,.222),.035)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.118),(False,-.153)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.10,.235,z),'body')
        tube('cream',[(s*.104,.26,z),(s*.104,.13,z+.014),(s*.104,.055,z+.037)],[.041,.034,.026],10)
        ball('white',(s*.112,.044,z+.061),(.056,.044,.12 if not fore else .075),18,10)
        for j in range(3):tube('sand',[(s*.112+(j-1)*.026,.04,z+.133 if not fore else z+.112),(s*.112+(j-1)*.026,.066,z+.102 if not fore else z+.087)],.002,5)
part('tail',(0,.275,-.277),'body');ball('white',(0,.28,-.29),(.076,.072,.072),18,12)
for j in range(12):
    a=TAU*j/12;leaf('cream',(.02*math.cos(a),.28+.02*math.sin(a),-.327),(.07*math.cos(a),.28+.064*math.sin(a),-.335),.043,.012)

# Lantern Sprite: acorn wood face, leaf cowl, glowing lantern abdomen and veined moth wings.
pet('lantern-sprite','LANTERN SPRITE','hover')
part('body');ball('bark',(0,.385,0),(.103,.153,.088),22,14)
ball('flame',(0,.364,.072),(.071,.101,.050),20,12,glow=True)
for j in range(8):
    a=TAU*j/8;x=.082*math.cos(a);z=.025+.079*math.sin(a)
    tube('bronze',[(x*.65,.476,z*.65),(x,.429,z),(x,.32,z),(x*.58,.253,z*.65)],[.007]*4,6,True)
for y,rx,rz in [(.462,.071,.064),(.273,.062,.055)]:
    tube('gold',[(rx*math.cos(TAU*i/24),y,.024+rz*math.sin(TAU*i/24)) for i in range(25)],.011,6,True)
for s in (-1,1):
    tube('bark',[(s*.081,.462,0),(s*.145,.361,.036),(s*.161,.31,.092)],[.023,.016,.010],8)
    for j in range(3):tube('sand',[(s*.16,.318,.09),(s*(.146+j*.013),.283,.114)],[.008,.001],6)
    for row in range(2):
        for j in range(5):leaf('fern' if j%2 else 'moss',(s*.043,.51-row*.029,-.034),(s*(.1+j*.014),.32+j*.026-row*.018,-.111),.066,.012)
part('head',(0,.51,.009),'body');ball('sand',(0,.582,.043),(.108,.109,.098),24,14)
for s in (-1,1):
    eye(s*.047,.603,.124,.032,'emerald')
    leaf('bark',(s*.078,.6,.048),(s*.161,.653,.028),.059,.014)
    leaf('fern',(s*.08,.587,.118),(s*.13,.534,.115),.044,.012)
tube('bark',[(-.025,.553,.137),(0,.544,.147),(.025,.553,.137)],.0025,5)
ball('deepmoss',(0,.661,.005),(.128,.067,.112),24,12)
for row in range(3):
    for j in range(12):
        a=TAU*(j+(row%2)*.5)/12;r=.106-row*.022
        leaf('moss' if j%3 else 'fern',(r*.7*math.cos(a),.721-row*.021,.006+r*.7*math.sin(a)),(r*1.17*math.cos(a),.632-row*.017,.006+r*1.17*math.sin(a)),.049,.015,normal=(math.cos(a),.5,math.sin(a)))
tube('bark',[(0,.706,0),(.016,.762,-.013),(.068,.786,-.024)],[.017,.012,.001],8)
fern((.02,.74,.01),(.12,.844,.018),.048)
for s,label in [(-1,'left'),(1,'right')]:
    part('wing-'+label,(s*.085,.482,-.058),'body')
    for top in (True,False):
        origin=Vector((s*.075,.478,-.059))
        end=Vector((s*(.55 if top else .39),.775 if top else .175,-.11))
        width=.252 if top else .205
        leaf('deepteal',origin,end,width,.016)
        leaf('teal' if top else 'moss',origin+Vector((s*.017,0,.009)),end+Vector((-s*.025,0,.009)),width*.83,.015)
        d=end-origin;side=d.cross(Vector((0,0,1))).normalized()
        tube('lightgold',[origin+Vector((0,0,.030)),end+Vector((0,0,.019))],[.005,.001],6,True)
        for j in range(1,7):
            t=j/8;c=origin+d*t+Vector((0,0,.029))
            for v in (-1,1):
                tip=c+d*.09+side*v*width*.40*math.sin(math.pi*t)
                tube('gold',[c,tip],[.003,.0008],5,True)
                gem('lightgold',tip,(.008,.009,.005),True)
        c=origin+d*.67+Vector((0,0,.041))
        ball('cream',c,(.056,.060,.012),16,10);ball('bronze',c+Vector((0,0,.010)),(.041,.045,.01),16,10,True)
        ball('emerald',c+Vector((0,0,.023)),(.026,.031,.009),16,10,glow=True)
        ball('white',c+Vector((-.007,.009,.032)),(.008,.009,.004),8,6)
part('tail',(0,.253,.026),'body');tube('gold',[(0,.263,.026),(0,.195,.031),(0,.133,.035)],.005,6,True)
leaf('gold',(-.023,.171,.03),(0,.077,.043),.052,.014,True);gem('flame',(0,.146,.046),(.019,.03,.012),glow=True)

# Rime Red Panda: round masked face, small triangular ears, dark socks, large ringed tail and frost ruff.
pet('rime-red-panda','RIME RED PANDA')
part('body');ball('rust',(0,.31,-.065),(.189,.192,.278),24,14)
ball('copper',(0,.214,.023),(.17,.09,.2));ball('cream',(0,.389,.131),(.153,.165,.129))
ruff('snow',(0,.47,.161),.165,.09,3)
for s in (-1,1):
    for j in range(10):leaf('honey',(s*.137,.435-j*.020,.05-j*.023),(s*.208,.37-j*.022,.013-j*.022),.048,.017)
    for j in range(4):leaf('ice',(s*.121,.462-j*.023,.142),(s*(.213+j*.006),.491-j*.03,.08),.039,.014)
ring('moon',(0,.431,.191),.127,.106,.014)
gem('bronze',(0,.326,.265),(.027,.034,.013),True);gem('ice',(0,.33,.282),(.018,.024,.01),glow=True)
part('head',(0,.471,.171),'body');ball('rust',(0,.569,.218),(.183,.153,.159),24,14)
for s in (-1,1):
    ball('cream',(s*.093,.581,.315),(.094,.1,.057))
    ball('copper',(s*.092,.591,.35),(.052,.07,.023))
    eye(s*.084,.609,.366,.034,'ice')
    leaf('cream',(s*.133,.669,.177),(s*.184,.828,.122),.140,.041)
    leaf('rust',(s*.137,.69,.199),(s*.18,.803,.148),.093,.026)
    leaf('copper',(s*.141,.705,.218),(s*.177,.779,.174),.056,.011)
    for j in range(6):leaf('cream' if j%2 else 'honey',(s*.122,.584-j*.022,.291),(s*.217,.55-j*.024,.265),.057,.018)
    for j in range(3):tube('sand',[(s*.061,.537+j*.014,.394),(s*.15,.523+j*.027,.427),(s*.22,.518+j*.039,.394)],[.0014,.001,.0003],5)
ball('cream',(0,.518,.359),(.094,.058,.069));ball('ink',(0,.553,.419),(.028,.018,.016),16,10)
tube('copper',[(0,.539,.427),(0,.521,.425),(-.024,.512,.416)],.0025,5);tube('copper',[(0,.521,.425),(.024,.512,.416)],.0025,5)
for j in range(3):
    a=math.pi*j/3;d=Vector((math.cos(a),math.sin(a),0))*.024;c=Vector((0,.692,.319));tube('ice',[c-d,c+d],.002,5)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.146),(False,-.221)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.133,.26,z),'body');paws('darkbark','sand',s*.135,z,y=.17,width=.063)
        for j in range(3):leaf('copper',(s*.136,.24-j*.02,z+.015),(s*.146,.19-j*.02,z+.049),.041,.012)
part('tail',(0,.31,-.30),'body')
points=[(0,.31,-.29),(.056,.28,-.382),(.122,.28,-.468),(.186,.314,-.548),(.247,.37,-.603),(.288,.44,-.607),(.30,.50,-.57),(.283,.55,-.52)]
radii=[.095,.099,.094,.088,.079,.066,.047,.001]
for j in range(len(points)-1):tube('honey' if j%2 else 'rust',points[j:j+2],radii[j:j+2],16)
for j in range(6):
    c=Vector(points[j+1]);a=Vector(points[j]);d=(c-a).normalized()
    for i in range(8):
        angle=TAU*i/8;offset=Vector((math.cos(angle)*radii[j+1]*.82,math.sin(angle)*radii[j+1]*.82,0))
        leaf('honey' if j%2==0 else 'rust',c+offset-d*.025,c+offset*1.15+d*.047,.035,.01)

# Crown Pangolin: overlapping shield scales, long armored tail, tapered snout and seven-prong crown.
pet('crown-pangolin','CROWN PANGOLIN')
part('body');ball('bark',(0,.324,-.076),(.191,.211,.293),24,14)
ball('sand',(0,.294,.096),(.132,.177,.146))
for row in range(10):
    z=.147-row*.05;long=(z+.076)/.303
    radius=math.sqrt(max(.12,1-long*long))
    for j in range(9):
        a=.02+math.pi*(j+.5*(row%2))/9
        x=.2*radius*math.cos(a);y=.324+.22*radius*math.sin(a)
        normal=(math.cos(a),math.sin(a),0)
        leaf('gold' if (j+row)%4 else 'bronze',(x,y,z+.04),(x*1.03,y+.005,z-.068),.082,.025,True,normal)
        if (row+j)%4==0:leaf('lightgold',(x,y+.012,z+.021),(x*1.03,y+.017,z-.044),.015,.006,True,normal)
# Deep purple neck band edged in brass and set with an emerald.
ring('purple',(0,.477,.14),.113,.079,.022)
ring('lightgold',(0,.477,.152),.114,.08,.005,True)
gem('bronze',(0,.382,.22),(.035,.038,.019),True);gem('emerald',(0,.384,.24),(.024,.027,.011),True)
part('head',(0,.472,.154),'body');ball('sand',(0,.557,.20),(.123,.128,.136),24,14)
tube('sand',[(0,.543,.246),(0,.49,.338),(0,.475,.408)],[.096,.070,.025],16)
ball('darkbark',(0,.485,.424),(.028,.019,.019),14,10)
for s in (-1,1):
    eye(s*.073,.591,.294,.029,'emerald')
    ball('bark',(s*.102,.626,.155),(.035,.052,.019),16,10)
    ball('sand',(s*.105,.631,.171),(.019,.031,.009),12,8)
    for j in range(4):leaf('gold',(s*.06,.656-j*.018,.198-j*.032),(s*.12,.603-j*.02,.147-j*.028),.059,.020,True)
    tube('bark',[(s*.027,.472,.416),(s*.064,.477,.382),(s*.079,.493,.343)],[.0025,.003,.001],5)
# Crown circles lie on the head; each prong has a separate inlaid jewel.
for y,r in [(.673,.081),(.692,.086)]:tube('lightgold',[(r*math.cos(TAU*j/28),y,.166+r*.73*math.sin(TAU*j/28)) for j in range(29)],.007,6,True)
for j in range(7):
    a=TAU*j/7;x=.083*math.cos(a);z=.166+.062*math.sin(a);height=.775+(.018 if j%2 else 0)
    leaf('gold',(x,.689,z),(x*1.14,height,.166+(z-.166)*1.14),.043,.012,True,normal=(math.cos(a),0,math.sin(a)))
    gem('ruby' if j%2 else 'emerald',(x*1.14,height,.166+(z-.166)*1.14),(.011,.016,.012),True)
gem('emerald',(0,.715,.244),(.021,.024,.012),True)
for s,label in [(-1,'left'),(1,'right')]:
    for fore,z in [(True,.118),(False,-.229)]:
        part('leg-'+('front-' if fore else 'rear-')+label,(s*.13,.25,z),'body');paws('sand','darkbark',s*.139,z,y=.16,width=.061)
        for j in range(3):leaf('gold',(s*.151,.262-j*.044,z-.027),(s*.178,.201-j*.044,z+.025),.075,.019,True,normal=(s,0,.35))
part('tail',(0,.29,-.331),'body');tube('bark',[(0,.29,-.30),(.043,.245,-.42),(.10,.201,-.53),(.173,.205,-.637),(.236,.251,-.692)],[.104,.083,.065,.037,.001],14)
for row in range(9):
    t=row/9;x=.018+t*.22;y=.28-.092*math.sin(t*math.pi);z=-.346-t*.337;radius=.093*(1-t)
    for j in range(5):
        a=math.pi*(j+.4)/5;dx=radius*math.cos(a);dy=radius*math.sin(a)
        leaf('gold' if (row+j)%3 else 'bronze',(x+dx,y+dy,z+.024),(x+dx+.038,y+dy-.006,z-.066),.061*(1-t*.75),.019*(1-t*.6),True,normal=(math.cos(a),math.sin(a),.15))


library=bpy.context.scene; library.name='Wild companion asset library'
library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
materials=[]
for name,metal,glow in [('Wild painted palette',False,False),('Wild gilded palette',True,False),('Wild lantern palette',False,True)]:
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
gallery=bpy.data.scenes.new('Wild Companions - Detailed Collection');bpy.context.window.scene=gallery
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
    small.data.body='EPIC  /  WORLD BOSS' if name=='crown-pangolin' else 'WILD COLLECTION  /  COMPANION'
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
        if name in ('moonveil-gryphlet','lantern-sprite'):
            scene.camera.location=xyz((.9,1.05,3.6));aim(scene.camera,(0,height*.5,0))
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
print('WILD_PETS '+json.dumps({'bytes':EXPORT.stat().st_size,'materials':len(document['materials']),'pets':{name:{'height':root['height'],'width':root['width'],'triangles':root['triangles'],'locomotion':root['locomotion'],'parts':list(PETS[name]['parts'])} for name,root in roots.items()}}))
