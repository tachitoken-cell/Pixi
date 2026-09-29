"""Forge individual solid Knight VFX centerpieces in Blender, in game Y-up metres."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from spell_model_tools import *
import spell_model_tools as m
from mathutils import Euler, Vector

reset()
STEEL=(.35,.48,.59,1); EDGE=(.81,.91,.94,1); BRONZE=(.46,.22,.065,1)
LEATHER=(.10,.065,.038,1); STONE=(.20,.22,.21,1); CLOTH=(.52,.10,.065,1)
made=[]

def place(first, offset=(0,0,0), angles=(0,0,0), scale=(1,1,1)):
    rotation=Euler(angles,'YXZ').to_matrix();offset=Vector(offset)
    for i in range(first,len(m.vertices)):
        p=m.vertices[i];m.vertices[i]=tuple(rotation@Vector(tuple(p[j]*scale[j] for j in range(3)))+offset)

def studs(points,r=.037,color=GOLD):
    for point in points:ellipsoid(point,(r,r,r*.6),color,6,4)

def shield(width=.75,height=1.3,kind='kite',compact=False):
    outline=[(-.5,.42),(-.37,.5),(.37,.5),(.5,.42),(.43,-.15),(0,-.55),(-.43,-.15)] if kind=='kite' else [(-.5,-.42),(-.5,.42),(-.32,.53),(.32,.53),(.5,.42),(.5,-.42),(.32,-.53),(-.32,-.53)]
    plate([(x*width,y*height,0) for x,y in outline],.14,GOLD)
    plate([(x*width*.84,y*height*.88,.08) for x,y in outline],.08,STEEL)
    # Raised convex centre, solid boss, cross inlay and inset edge rivets.
    ellipsoid((0,0,.12),(width*.31,height*.25,.11),SILVER,8 if compact else 10,4 if compact else 5)
    ellipsoid((0,0,.22),(width*.11,width*.11,.065),PEARL,6 if compact else 8,3 if compact else 4)
    box((0,0,.205),(width*.065,height*.63,.025),GOLD)
    box((0,height*.07,.207),(width*.55,height*.045,.025),GOLD)
    studs([(x*width*.78,y*height*.82,.09) for x,y in (outline[::2] if compact else outline)],.026)

def sword(height=2.1,width=.27):
    grip=height*.25;tip=height
    tube([(0,.1,0),(0,grip,0)],[width*.25,width*.20],LEATHER,10)
    for i in range(4):tube([(0,.12+i*grip*.15,0),(0,.15+i*grip*.15,0)],width*.27,GOLD,8)
    ellipsoid((0,.1,0),(width*.39,width*.4,width*.31),GOLD,10,5)
    tube([(-width*1.8,grip-.1,0),(-width*1.3,grip+.02,0),(0,grip+.07,.025),(width*1.3,grip+.02,0),(width*1.8,grip-.1,0)],[.025,.07,.09,.07,.025],GOLD,8)
    crystal((0,grip+.07,0),(0,tip,0),width,SILVER,6)
    crystal((0,grip+.19,width*.75),(0,tip-.12,.015),width*.14,PEARL,5)
    for side in [-1,1]:
        for i in range(4):tube([(side*width*.2,grip+.3+i*.23,width*.69),(side*width*.57,grip+.37+i*.23,width*.48)],.012,GOLD,4)
    ellipsoid((0,grip+.08,width*.4),(.07,.1,.05),FIRE,8,5)

def hammer(height=1.75,width=1.1):
    tube([(0,.12,0),(0,height,0)],[.075,.085],LEATHER,10)
    for y in [.2,.35,.5,height-.32]:tube([(0,y,0),(0,y+.045,0)],.093,GOLD,8)
    box((0,height-.2,0),(width,.42,.48),STEEL)
    for side in [-1,1]:
        box((side*width*.46,height-.2,0),(.16,.5,.55),SILVER)
        box((side*width*.54,height-.2,0),(.08,.35,.4),GOLD)
    box((0,height-.2,.27),(.33,.33,.05),GOLD)
    crystal((0,height-.34,.31),(0,height-.06,.31),.11,PEARL,5)
    studs([(x,height+y,z) for x in [-width*.32,width*.32] for y in [-.34,-.06] for z in [-.27,.27]],.035)

def gauntlet():
    box((0,.12,0),(.43,.35,.46),STEEL)
    for i in range(4):
        x=(i-1.5)*.11
        ellipsoid((x,.35,.06),(.075,.14,.12),SILVER,8,4)
        box((x,.24,.14),(.09,.22,.14),EDGE)
    ellipsoid((-.26,.22,0),(.10,.19,.12),SILVER,8,5)
    box((0,-.02,0),(.51,.09,.5),GOLD)
    crystal((0,.05,.25),(0,.24,.25),.09,PEARL,5)

def rock(center,size,color=STONE):
    ellipsoid(center,size,color,8,4)

FOREST_SPELLS={'charge','taunt','powerful-throw','guard','adamant-guardian','courageous-call','lord-of-battle'}

def complete(id):
    tris=sum(len(face)-2 for face in m.faces)
    print('KNIGHT',id,tris)
    if not 500<=tris<=(6500 if id in FOREST_SPELLS else 2200):raise ValueError(f'{id}: geometry budget {tris}')
    if id not in ['shield-toss','shattering-throw','siegebreaker','powerful-throw']:
        floor=min(p[1] for p in m.vertices)
        if floor<0:place(0,(0,-floor,0))
    obj=finish_forest(id) if id in FOREST_SPELLS else finish(id);obj['calling']='Knight';obj['authored']='solid weapon and fortification sculpture';made.append(id)

# Sword Strike: a complete inlaid longsword and its broad, solid trailing edge.
sword();ribbon([(-.2,.65,-.08),(-.55,.95,-.1),(-.72,1.4,-.1),(-.52,1.9,-.1)],[.04,.28,.32,0],GOLD,axis=(0,0,1));complete('strike')

# Crippling Strike: a toothed steel ankle trap, with thick hinged jaws and a short chain.
for side in [-1,1]:
    points=[(side*(.42+.23*math.sin(i*math.pi/8)),.28,-.62+i*.155) for i in range(9)]
    tube(points,.10,STEEL,8)
    for i in range(5):crystal((side*.53,.29,-.45+i*.22),(side*.28,.55,-.45+i*.22),.075,EDGE,5)
    ellipsoid((side*.4,.2,-.7),(.17,.17,.17),GOLD,8,5)
for i in range(3):ring((0,.18,-.65-i*.17),.12,.032,BRONZE,normal='x' if i%2 else 'y',segments=12)
box((0,.12,0),(.8,.14,.9),BRONZE);complete('crippling-strike')

# Cleave: three polished crescent blades fold out from an armoured central hinge.
for i in range(3):
    first=len(m.vertices)
    plate([(-.12,.35,0),(.13,.35,0),(.38,.8,0),(.55,1.35,0),(.33,1.9,0),(.12,1.15,0)],.11,SILVER)
    plate([(.18,.65,.065),(.31,1.06,.065),(.4,1.52,.065),(.3,1.74,.065),(.24,1.07,.065)],.024,PEARL)
    tube([(0,.1,0),(0,.6,0)],.085,LEATHER,10);ring((0,.37,0),.14,.028,GOLD,normal='z',segments=12)
    place(first,angles=(0,0,(i-1)*.48))
ellipsoid((0,.38,.13),(.22,.2,.12),GOLD,12,5);complete('cleave')

# Second Wind: an open breastplate exhales broad, folded silver-and-gold plumes.
first=len(m.vertices);shield(.9,1,'square');place(first,(0,1.02,-.22))
for side in [-1,1]:
    for i in range(4):leaf((side*.16,.8+i*.1,0),(side*(.5+i*.08),1.55+i*.16,-.1),.16,MINT if i%2 else PEARL)
    ribbon([(side*.3,.45,-.2),(side*.75,.9,-.1),(side*.68,1.4,0),(side*.32,1.9,.08)],[.02,.25,.23,0],GOLD,axis=(0,0,1))
complete('second-wind')

# Shield Bash: a solid tower shield with a protruding ram boss, pins and reinforced corners.
first=len(m.vertices);shield(1.3,1.8);place(first,(0,1.0,0))
crystal((0,1,.21),(0,1,.75),.19,EDGE,8)
for x in [-.48,.48]:box((x,1.3,.14),(.17,.55,.16),BRONZE)
studs([(x,y,.24) for x in [-.48,.48] for y in [.9,1.15,1.4]],.045);complete('shield-bash')

# Iron Guard: two crossed shield halves clasp behind a central gilded sword lock.
for side in [-1,1]:
    first=len(m.vertices);shield(.72,1.55);place(first,(side*.32,1.0,0),angles=(0,side*.5,side*-.22))
crystal((0,.3,.22),(0,1.8,.22),.10,PEARL,6);complete('iron-guard')

# Whirlwind: three broad falchions orbit a solid bronze spindle.
lathe((0,0,0),[(.05,.1),(.24,.18),(.22,.35),(.08,.55)],GOLD,16)
for i in range(3):
    first=len(m.vertices)
    plate([(.12,.35,0),(.34,.28,0),(.93,.36,0),(1.05,.66,0),(.75,.62,0),(.35,.48,0)],.14,SILVER)
    plate([(.33,.45,.08),(.73,.57,.08),(1.02,.6,.08),(.85,.68,.08)],.028,PEARL)
    tube([(.15,.38,0),(.45,.42,0)],.07,LEATHER,10);studs([(.3,.38,.1),(.46,.39,.1)],.035)
    place(first,angles=(0,i*TAU/3,0))
complete('whirlwind')

# Heavy Slash: a thick rectangular executioner's falchion with weighted spine and brass pommel.
plate([(-.24,.6,0),(.28,.6,0),(.4,1.85,0),(.12,2.25,0),(-.3,2.13,0)],.18,STEEL)
plate([(.18,.65,.11),(.32,1.83,.11),(.1,2.2,.11),(.04,.75,.11)],.03,EDGE)
tube([(0,.1,0),(0,.64,0)],.11,LEATHER,12);tube([(-.5,.55,0),(0,.63,0),(.5,.55,0)],[.05,.10,.05],GOLD,10)
ellipsoid((0,.1,0),(.18,.18,.14),GOLD,12,6)
for i in range(6):box((-.26,.8+i*.2,0),(.16,.12,.23),GOLD)
studs([(.02,.85+i*.22,.13) for i in range(5)],.045);complete('heavy-slash')

# Shockwave: a low, rolling wall of solid earth plates and molten stone undersides.
for i in range(10):
    q=i*TAU/10;rock((math.sin(q)*.86,.26,math.cos(q)*.86),(.30,.25+(i%3)*.07,.30),STONE)
    first=len(m.vertices);plate([(-.17,0,0),(.17,0,0),(.13,.38,0),(-.07,.5,0)],.08,GOLD);place(first,(math.sin(q)*.72,.08,math.cos(q)*.72),angles=(0,q,0))
complete('shockwave')

# Shield Toss: domed buckler, scalloped rim, eight engraved spokes, warm central gem.
ellipsoid((0,0,0),(.7,.7,.16),STEEL,20,8)
ring((0,0,.02),.69,.052,GOLD,normal='z',segments=24)
ellipsoid((0,0,.18),(.22,.22,.16),PEARL,12,6)
for i in range(8):
    q=i*TAU/8;crystal((math.cos(q)*.24,math.sin(q)*.24,.15),(math.cos(q)*.58,math.sin(q)*.58,.05),.04,EDGE,5)
studs([(math.cos(i*TAU/8)*.58,math.sin(i*TAU/8)*.58,.12) for i in range(8)],.04);complete('shield-toss')

# Rallying Cry: a real folded crimson standard with a gold embroidered crest.
tube([(-.55,.02,0),(-.55,2.08,0)],.055,BRONZE,10);crystal((-.55,2.02,0),(-.55,2.35,0),.12,GOLD,6)
tube([(-.6,2,0),(.72,2,0)],.05,GOLD,10)
for i in range(7):
    x=-.47+i*.17;z=math.sin(i*.9)*.11;plate([(x,1.92,z),(x+.18,1.92,z+.025),(x+.18,1.12+(.12 if i%2 else 0),z),(x,1.08,z)],.035,CLOTH if i%2 else tint(CLOTH,1.5))
    tube([(x,1.14,z+.04),(x+.17,1.14,z+.06)],.02,GOLD,5)
first=len(m.vertices);shield(.43,.62);place(first,(.04,1.58,.13))
lathe((-.55,0,0),[(.22,0),(.22,.08),(.14,.13),(.06,.23)],BRONZE,16);complete('rallying-cry')

hammer();ellipsoid((0,1.55,-.3),(.26,.22,.10),BRONZE,10,5);complete('concussive-blow')

# Steel Bulwark: three independent convex shields, backed by solid angled braces.
for i in [-1,0,1]:
    first=len(m.vertices);shield(.72,1.55,'square');place(first,(i*.66,.9,.48-abs(i)*.16),angles=(0,-i*.32,0))
    tube([(i*.66,.1,-.6),(i*.66,1.35,.38)],.065,BRONZE,6)
complete('steel-bulwark')

# Groundbreaker: split slabs and rising wedge teeth arranged along six deep faults.
for i in range(6):
    q=i*TAU/6;x,z=math.sin(q),math.cos(q)
    rock((x*.75,.18,z*.75),(.29,.22,.28),STONE)
    crystal((x*.84,.02,z*.84),(x*.90,.9+(i%2)*.18,z*.90),.20,SILVER,5)
    ribbon([(x*.15,.06,z*.15),(x*.5,.06,z*.5),(x*.85,.07,z*.85)],[.025,.08,.02],GOLD)
complete('groundbreaker')

# Crushing Sweep: a huge hooked scythe with thick bevels and a riveted long haft.
tube([(-.72,.1,0),(-.5,.6,0),(-.28,1.18,0),(0,1.72,0)],.065,LEATHER,10)
plate([(-.05,1.65,0),(.24,1.86,0),(.67,1.8,0),(1.0,1.51,0),(1.05,.94,0),(.7,1.34,0),(.28,1.5,0)],.16,STEEL)
plate([(.2,1.77,.09),(.65,1.7,.09),(.91,1.43,.09),(1.04,.98,.09),(.79,1.32,.09),(.3,1.58,.09)],.03,EDGE)
for i in range(4):ellipsoid((-.59+i*.16,.36+i*.32,0),(.09,.07,.09),GOLD,10,4)
studs([(.16,1.65,.12),(.39,1.63,.12),(.6,1.56,.12),(.77,1.43,.12)],.045);complete('crushing-sweep')

# Bladestorm: eight fully solid curved blades form a hollow ascending steel funnel.
for i in range(8):
    q=i*TAU/4;first=len(m.vertices)
    plate([(-.3,0,0),(.05,-.1,0),(.4,.04,0),(.63,.34,0),(.24,.21,0),(-.12,.18,0)],.10,SILVER)
    tube([(-.22,.09,.06),(.1,.03,.06),(.42,.18,.06)],[.024,.035,.01],GOLD,5)
    ellipsoid((-.2,.08,0),(.09,.08,.09),BRONZE,8,4)
    place(first,(math.sin(q)*(.55+i*.045),.18+i*.22,math.cos(q)*(.55+i*.045)),angles=(0,q,0))
complete('bladestorm')

# Quick Recovery: a heavy gauntlet bound in broad bandages with a clasped healing stone.
first=len(m.vertices);gauntlet();place(first,(0,.65,0),scale=(1.3,1.3,1.3))
for i in range(3):
    first=len(m.vertices);ring((0,0,0),.37,.055,PEARL,segments=14);place(first,(0,.35+i*.17,0),scale=(1,.7,.9))
ellipsoid((0,.75,.3),(.14,.20,.07),MINT,10,5);complete('quick-recovery')

# Shattering Throw: a complete double-bitted throwing axe, centered for +Z travel.
tube([(0,0,-.78),(0,0,.4)],.075,LEATHER,10)
for z in [-.65,-.48,-.3]:tube([(0,0,z),(0,0,z+.045)],.092,GOLD,8)
for side in [-1,1]:
    first=len(m.vertices)
    plate([(.06,-.2,.28),(.35,-.36,.28),(.67,-.30,.28),(.78,.12,.28),(.52,.4,.28),(.33,.17,.28),(.06,.14,.28)],.17,SILVER)
    plate([(.5,-.28,.38),(.66,-.24,.38),(.72,.1,.38),(.5,.32,.38),(.58,.07,.38)],.025,PEARL)
    studs([(.2,-.12,.4),(.39,-.15,.4),(.46,.1,.4)],.04)
    if side<0:place(first,scale=(-1,1,1))
ellipsoid((0,0,.4),(.14,.2,.1),GOLD,10,5);complete('shattering-throw')

# Earthshaker: a sculpted armoured boot crushes a seven-stone crater.
box((0,.28,.23),(.65,.44,.95),STEEL);ellipsoid((0,.35,.58),(.37,.26,.30),SILVER,12,6)
box((0,.89,-.04),(.46,1.05,.48),SILVER);box((0,.89,.22),(.35,.7,.055),GOLD)
for y in [.55,.76,1.03]:box((0,y,.27),(.49,.08,.08),EDGE)
for i in range(7):q=i*TAU/7;rock((math.sin(q)*.8,.13,math.cos(q)*.8),(.28,.18,.27))
studs([(x,y,.3) for x in [-.16,.16] for y in [.63,.9,1.16]],.038);complete('earthshaker')

# Guardian's Oath: clasped knightly gauntlets underneath an armoured protective arch.
for side in [-1,1]:
    first=len(m.vertices);gauntlet();place(first,(side*.18,1.2,.38),angles=(0,0,side*math.pi/2))
    tube([(side*.85,.12,-.08),(side*.79,1.1,-.08),(side*.45,1.92,-.08),(0,2.15,-.08)],[.12,.10,.08,.04],GOLD,8)
first=len(m.vertices);shield(.48,.7);place(first,(0,1.86,.03));complete('guardian-oath')

# Relentless Strike: two fine rapiers cross through a metal parry guard.
for side in [-1,1]:
    first=len(m.vertices);sword(1.95,.13);place(first,(side*.15,.04,0),angles=(0,0,side*.36))
ellipsoid((0,.87,.1),(.25,.22,.08),GOLD,10,5);complete('relentless-strike')

# Defiant Stand: an immovable planted sword, rough plinth and laurel of solid metal leaves.
sword(2.05,.23);rock((0,.12,0),(.56,.18,.42))
for side in [-1,1]:
    for i in range(5):leaf((side*(.45-i*.03),.18+i*.15,0),(side*(.65-i*.03),.36+i*.15,.03),.115,GOLD if i%2 else PEARL)
complete('defiant-stand')

# Chainbreaker: thick forged chain links peel apart around a shattered central padlock.
for side in [-1,1]:
    for i in range(4):ring((side*(.25+i*.23),.9+math.sin(i*.7)*.15,0),.17,.047,SILVER,normal='z' if i%2 else 'y',segments=12)
    box((side*.16,.62,0),(.27,.39,.2),BRONZE);crystal((side*.06,.77,.11),(side*.24,.92,.1),.06,GOLD,5)
studs([(-.19,.61,.13),(.19,.61,.13)],.055);complete('chainbreaker')

# Fortress: four solid battlement walls with corner towers and warm inset window panels.
for side in range(4):
    first=len(m.vertices);box((0,.68,.92),(1.8,1.2,.20),STEEL);box((0,.22,.92),(1.85,.18,.26),GOLD)
    for tooth in [-1,0,1]:box((tooth*.58,1.39,.92),(.3,.31,.27),SILVER)
    for x in [-.47,.47]:plate([(x-.11,.56,1.04),(x+.11,.56,1.04),(x+.11,.98,1.04),(x,1.13,1.04),(x-.11,.98,1.04)],.03,PEARL)
    studs([(x,1.16,1.05) for x in [-.65,0,.65]],.04);place(first,angles=(0,side*math.pi/2,0))
for x in [-.91,.91]:
    for z in [-.91,.91]:lathe((x,0,z),[(.16,.08),(.16,1.5),(.22,1.53),(.22,1.67)],GOLD,8)
complete('fortress')

# Thunderclap: two enormous meeting palms and chunky jagged thunder spurs.
for side in [-1,1]:
    first=len(m.vertices);gauntlet();place(first,(side*.32,1.0,0),angles=(0,side*.4,side*-.7),scale=(1.4,1.4,1.4))
for i in range(5):
    q=i*TAU/5;points=[(0,.15,0),(math.sin(q)*.42,.19,math.cos(q)*.42),(math.sin(q+.22)*.67,.12,math.cos(q+.22)*.67),(math.sin(q)*1.04,.06,math.cos(q)*1.04)];tube(points,[.065,.08,.055,0],PEARL,5)
complete('thunderclap')

# Colossus Strike: enormous ceremonial blade with stepped guard, gem and feather-like metal quillons.
sword(2.3,.42)
for side in [-1,1]:
    plate([(side*.18,.59,0),(side*.58,.78,0),(side*.92,.72,0),(side*.66,.45,0),(side*.31,.5,0)],.16,GOLD)
    for i in range(3):leaf((side*(.42+i*.1),.56,0),(side*(.57+i*.12),.91+i*.04,.01),.10,EDGE)
complete('colossus-strike')

# Stalwart Company: five compact shields face outward in a complete armoured phalanx.
for i in range(5):
    q=i*TAU/5;first=len(m.vertices);shield(.53,1.03,compact=True);place(first,(math.sin(q)*.82,.82,math.cos(q)*.82),angles=(0,q,0))
complete('stalwart-company')

# Siegebreaker: solid horned battering ram, ironwood rails and a chiseled central ram head.
for side in [-1,1]:
    tube([(side*.24,-.14,-.8),(side*.24,-.14,.31)],.13,BRONZE,10)
    for z in [-.65,-.25,.2]:tube([(side*.24,-.14,z),(side*.24,-.14,z+.07)],.155,GOLD,8)
    tube([(side*.24,.05,.2),(side*.5,.35,.27),(side*.55,.52,.53),(side*.37,.4,.67)],[.12,.11,.075,0],SILVER,8)
ellipsoid((0,.0,.38),(.4,.3,.3),STEEL,14,7);ellipsoid((0,-.08,.63),(.23,.18,.18),SILVER,12,5)
for side in [-1,1]:ellipsoid((side*.19,.11,.61),(.07,.045,.035),PEARL,8,4)
plate([(-.18,.19,.58),(0,.31,.60),(.18,.19,.58),(0,.1,.69)],.025,GOLD);complete('siegebreaker')

# Unyielding Blows: a staggered triple-hammer battery, each with a different contact level.
for i in range(3):
    first=len(m.vertices);hammer(1.4+i*.18,.6);place(first,((i-1)*.56,.05,0),scale=(.76,.9,.76))
complete('unyielding-blows')

# Battle Renewal: a complete radiant cuirass with layered pauldrons and armoured waist tassets.
first=len(m.vertices);shield(.95,1.23,'square');place(first,(0,1.22,0))
for side in [-1,1]:
    for i in range(3):ellipsoid((side*(.47+i*.07),1.62-i*.11,0),(.29,.13,.26),SILVER if i%2 else GOLD,8,4)
    plate([(side*.11,.6,.05),(side*.46,.58,.04),(side*.57,.17,.03),(side*.23,.12,.05)],.13,STEEL)
    tube([(side*.27,.25,.13),(side*.18,.62,.13)],.025,MINT,5)
box((0,.68,.08),(.94,.12,.26),GOLD);ellipsoid((0,.69,.24),(.12,.11,.055),MINT,8,5);complete('battle-renewal')

# Last Bastion: a filled peaked canopy rests on four ornate buttresses and a hanging crest.
for x in [-.88,.88]:
    for z in [-.88,.88]:
        lathe((x,0,z),[(.15,.02),(.12,.2),(.09,1.54),(.15,1.68)],GOLD,8)
        crystal((x,.24,z),(x,1.45,z),.12,SILVER,5)
for i in range(4):
    q=i*math.pi/2;first=len(m.vertices)
    plate([(-.98,1.65,.98),(.98,1.65,.98),(0,2.3,0)],.09,SILVER)
    tube([(-.98,1.66,.98),(0,2.32,0),(.98,1.66,.98)],[.065,.08,.065],GOLD,8)
    place(first,angles=(0,q,0))
first=len(m.vertices);shield(.55,.68);place(first,(0,1.55,1.0));complete('last-bastion')

# The new callings use the stepped carved surfaces of the wild pets and Verdant Revenant.
# Their material palette is sampled from those authored assets, with light reserved for inset jade.
BARK=forest_color('554235'); BARK_DARK=forest_color('322D2A'); BARK_LIGHT=forest_color('947D55')
MOSS=forest_color('528364'); DEEP_MOSS=forest_color('244C40'); FERN=forest_color('83B670')
IRON=forest_color('3C424A'); WEATHERED=forest_color('6E7A80'); JADE=forest_color('4C958A')
SPIRIT=forest_color('96F381'); BONE=forest_color('D9D5A0'); AGED_BRASS=forest_color('A88949')


def fern_sprig(start,end,width=.22):
    a,b=Vector(start),Vector(end);d=b-a;side=d.cross(Vector((0,0,1))).normalized()
    tube([a,b],[.018,.003],DEEP_MOSS,4)
    for i in range(1,5):
        p=a+d*i/5
        for s in [-1,1]:carved_leaf(p,p+d*.22+side*s*width*(1-i*.12),width*.37,FERN if i%2 else MOSS,.013)


def inset_eye(x,y,z,width=.095,height=.06):
    box((x,y,z),(width*2.5,height*2.5,.055),BARK_DARK)
    box((x,y,z+.033),(width*1.8,height*1.65,.024),JADE)
    box((x,y,z+.053),(width*.65,height*1.50,.02),DEEP_MOSS)
    box((x-width*.25,y+height*.26,z+.067),(width*.38,height*.43,.014),SPIRIT)


def twig(points,radii,color=BARK_LIGHT):
    tube(points,radii,color,4)
    for i in range(1,len(points)-1):
        p=Vector(points[i]);q=Vector(points[i+1]);side=1 if p.x>=0 else -1
        tube([p,p+(q-p)*.38+Vector((side*.15,.14,-.03)),p+(q-p)*.54+Vector((side*.23,.26,-.06))],[radii[i]*.65,radii[i]*.34,.002],color,4)


# Charge: Briarhorn Elder's broad boar muzzle, branching horns and the Revenant's lamellar brow.
stepped_solid((0,.88,-.02),(.51,.49,.41),DEEP_MOSS,8)
stepped_solid((0,.73,.40),(.36,.22,.38),BARK,8)
box((0,.75,.765),(.58,.25,.055),BARK_DARK)
box((0,.59,.43),(.55,.12,.45),BARK_LIGHT)
for side in [-1,1]:
    box((side*.18,.77,.802),(.09,.065,.026),IRON)
    inset_eye(side*.35,1.03,.34,.07,.044)
    tube([(side*.29,.58,.55),(side*.46,.69,.69),(side*.49,.94,.72),(side*.37,1.11,.68)],[.105,.088,.055,.004],BONE,4)
    twig([(side*.33,1.14,-.18),(side*.54,1.40,-.27),(side*.65,1.67,-.43),(side*.87,1.90,-.49)],[.11,.092,.059,.005],BARK_LIGHT)
    for row in range(3):
        for col in range(4):
            x=side*(.24+col*.077);y=1.20-row*.17;z=.25-col*.10
            carved_leaf((x,y,z),(x+side*.055,y-.24,z+.065),.20,MOSS if (row+col)%2 else DEEP_MOSS,.032)
            if col%2==0:box((x,y-.06,z+.04),(.022,.024,.027),AGED_BRASS)
    fern_sprig((side*.40,.91,-.30),(side*.72,1.20,-.40),.18)
for i in range(3):
    carved_leaf((0,1.36-i*.15,.08+i*.14),(0,1.12-i*.16,.17+i*.14),.27,BARK_LIGHT,.035)
    box((0,1.27-i*.15,.11+i*.14),(.06,.04,.04),AGED_BRASS)
complete('charge')

# Taunt: a carved Fern Lynx guardian mask, square jade eyes and three deep courses of cheek leaves.
stepped_solid((0,1.00,0),(.43,.42,.29),DEEP_MOSS,8)
stepped_solid((0,.78,.25),(.28,.18,.22),BARK_LIGHT,7)
box((0,.88,.483),(.13,.09,.044),BARK_DARK)
box((0,.665,.34),(.29,.115,.11),BARK_DARK)
for side in [-1,1]:
    inset_eye(side*.22,1.09,.28,.11,.080)
    carved_leaf((side*.08,1.25,.32),(side*.35,1.29,.27),.075,BARK,.028)
    carved_leaf((side*.23,1.27,-.035),(side*.39,1.91,-.10),.31,BARK,.052)
    carved_leaf((side*.24,1.40,.038),(side*.36,1.78,-.015),.17,MOSS,.024)
    tube([(side*.36,1.76,-.02),(side*.46,2.02,-.07),(side*.43,2.16,-.13)],[.032,.021,.002],BARK_DARK,4)
    for row in range(3):
        for i in range(5):
            x=side*(.28+row*.085);y=1.20-i*.13;z=.16-row*.08
            carved_leaf((x,y,z),(x+side*(.25-i*.025),y-.13,z+.06),.18,FERN if (row+i)%4==0 else MOSS if row%2 else DEEP_MOSS,.032)
    for i in range(3):
        tube([(side*.15,.82-i*.032,.44),(side*.35,.79-i*.043,.50),(side*.58,.84-i*.044,.49)],[.006,.004,.001],BONE,4)
    tube([(side*.11,.72,.43),(side*.10,.60,.44),(side*.085,.55,.41)],[.035,.023,.001],BONE,4)
fern_sprig((-.16,1.44,-.20),(.03,1.73,-.23),.18)
complete('taunt')

# Powerful Throw: joined ironwood boards, recessed grain, six iron lugs and a root-bound jade seed.
for i in range(9):
    x=(i-4)*.17;h=math.sqrt(max(.01,.82**2-x*x))*2
    box((x,0,0),(.164,h,.21),BARK if i%2 else BARK_DARK)
    box((x,0,.119),(.122,h-.06,.024),BARK_LIGHT if i%3==0 else BARK)
    for j in range(3):
        y=(j-1)*h*.24
        tube([(x-.036,y-h*.09,.138),(x-.014,y,.141),(x-.027,y+h*.13,.140)],[.007,.011,.003],BARK_DARK,4)
for side in [-1,1]:box((0,side*.34,-.15),(1.41,.115,.09),IRON)
for i in range(12):
    q=i*TAU/12;nx,ny=math.cos(q),math.sin(q)
    first=len(m.vertices)
    box((0,.79,.04),(.26,.19,.29),IRON if i%2 else DEEP_MOSS)
    box((0,.81,.199),(.16,.09,.032),WEATHERED)
    box((0,.80,.224),(.05,.04,.018),AGED_BRASS)
    place(first,angles=(0,0,-q))
    if i%2==0:
        carved_leaf((nx*.56,ny*.56,.15),(nx*.77,ny*.77,.22),.20,MOSS,.026)
    tube([(nx*.24,ny*.24,.20),(nx*.45-ny*.07,ny*.45+nx*.07,.25),(nx*.64,ny*.64,.17)],[.05,.035,.012],BARK_DARK,4)
stepped_solid((0,0,.19),(.26,.25,.13),IRON,7)
stepped_solid((0,0,.29),(.17,.18,.10),JADE,6)
box((-.025,.033,.397),(.05,.085,.018),SPIRIT)
for i in range(8):
    q=i*TAU/8;x,y=math.cos(q),math.sin(q)
    carved_leaf((x*.21,y*.21,.28),(x*.42,y*.42,.20),.16,FERN if i%3==0 else MOSS,.026)
complete('powerful-throw')

# Guard: thick living-bark pavise, crooked grain, deep knot eye, iron bindings and lichen shelves.
for i in range(5):
    x=(i-2)*.26;top=2.08-abs(i-2)*.15;bottom=.09+abs(i-2)*.06
    box((x,(top+bottom)/2,0),(.25,top-bottom,.26),BARK_DARK)
    plate([(x-.112,bottom,.15),(x-.12,top-.12,.14),(x-.05,top,.14),(x+.095,top-.04,.16),(x+.12,bottom+.14,.16)],.07,BARK if i%2 else BARK_LIGHT)
    for j in range(5):
        y=.30+j*.28;dx=.035*math.sin(j+i)
        tube([(x+dx,y,.205),(x-dx*.5,y+.16,.21),(x+dx*.7,y+.26,.204)],[.009,.014,.004],BARK_DARK,4)
for side in [-1,1]:
    for y in [.43,1.52]:
        box((side*.48,y,.23),(.46,.16,.095),IRON)
        for dx in [-.15,.15]:box((side*.48+dx,y,.291),(.045,.048,.024),AGED_BRASS)
    tube([(side*.57,.25,-.06),(side*.76,.55,.06),(side*.68,1.23,.21),(side*.49,1.72,.19),(side*.37,2.06,.11)],[.11,.13,.10,.07,.015],DEEP_MOSS,4)
    fern_sprig((side*.46,1.55,.18),(side*.75,1.95,.18),.22)
    for j in range(5):carved_leaf((side*.51,.80+j*.14,.24),(side*(.64+(j%2)*.05),.59+j*.13,.29),.22,MOSS if j%2 else DEEP_MOSS,.026)
    tube([(side*.50,.54,.17),(side*.67,.22,.13),(side*.75,.02,.19)],[.075,.042,.004],BARK,4)
stepped_solid((0,1.16,.18),(.255,.31,.12),BARK_DARK,7)
stepped_solid((0,1.17,.26),(.15,.20,.095),JADE,6)
box((-.035,1.22,.361),(.035,.09,.019),SPIRIT)
for i in range(3):
    box((-.37+i*.35,.75+(i%2)*.68,.29),(.22,.055,.18),DEEP_MOSS)
    for j in range(3):box((-.42+i*.35+j*.05,.79+(i%2)*.68,.30),(.055,.022,.09),FERN)
complete('guard')

# Adamant Guardian: an ancient mossy stone sentinel; recessed heart and squared face keep body depth readable.
stepped_solid((0,1.20,0),(.53,.61,.34),IRON,7)
stepped_solid((0,2.08,.015),(.30,.32,.27),WEATHERED,7)
box((0,2.05,.287),(.49,.15,.028),DEEP_MOSS)
for side in [-1,1]:
    inset_eye(side*.135,2.07,.31,.067,.042)
    box((side*.34,.38,0),(.31,.51,.44),IRON)
    box((side*.34,.13,.15),(.38,.20,.55),WEATHERED)
    stepped_solid((side*.68,1.65,-.015),(.40,.29,.39),WEATHERED,7)
    box((side*.83,1.09,.025),(.31,.66,.35),IRON)
    stepped_solid((side*.83,.71,.11),(.20,.20,.22),WEATHERED,6)
    tube([(side*.26,.25,.24),(side*.43,.70,.28),(side*.27,1.06,.37),(side*.41,1.50,.27),(side*.80,1.83,.22),(side*.94,1.92,-.07)],[.09,.08,.065,.09,.075,.005],BARK,4)
    for row in range(3):
        for col in range(3):
            x=side*(.49+col*.17);y=1.90-row*.12;z=.16-row*.03
            carved_leaf((x,y,z),(x+side*.11,y-.26,z+.06),.22,MOSS if (row+col)%2 else DEEP_MOSS,.035)
    fern_sprig((side*.59,1.80,-.06),(side*.85,2.24,-.13),.22)
    twig([(side*.22,2.28,-.12),(side*.33,2.55,-.24),(side*.50,2.76,-.24)],[.065,.044,.004],BARK_LIGHT)
    for i in range(3):box((side*.40,1.48-i*.25,.353),(.08,.12,.024),BARK_DARK)
stepped_solid((0,1.25,.30),(.235,.31,.09),DEEP_MOSS,7)
stepped_solid((0,1.27,.375),(.135,.205,.075),JADE,6)
box((-.029,1.33,.455),(.028,.085,.018),SPIRIT)
box((0,2.20,.31),(.51,.09,.105),MOSS)
for x in [-.13,0,.13]:carved_leaf((x,2.40,-.03),(x+.025,2.31,.26),.14,MOSS,.025)
complete('adamant-guardian')

# Courageous Call: curved carved horn, square binding rings and a woven forest-green standard.
tube([(-.62,.43,0),(-.61,.66,-.02),(-.38,.82,0),(-.11,.91,0),(.18,1.12,0)],[.05,.08,.12,.18,.25],BONE,4)
first=len(m.vertices)
lathe((0,0,0),[(.22,0),(.27,.19),(.40,.43),(.46,.63),(.39,.65),(.33,.46),(.19,.16)],BONE,8)
for y,r in [(.03,.23),(.39,.37),(.60,.45)]:ring((0,y,0),r,.024,AGED_BRASS,segments=8)
place(first,(.14,1.09,0),angles=(0,0,-.72))
for i in range(4):
    first=len(m.vertices);ring((0,0,0),.09+i*.036,.022,IRON,segments=6);place(first,(-.48+i*.16,.77+i*.08,0),angles=(0,0,-.87))
for row in range(5):
    for col in range(5):
        x=(col-2)*.125;y=.84-row*.14;z=.04+math.sin(col*.75)*.04
        box((x,y,z),(.125,.146,.035),DEEP_MOSS if (row+col)%3 else MOSS)
        tube([(x-.045,y+.045,z+.027),(x+.042,y-.04,z+.033)],[.004,.004],FERN,4)
        if col in [0,4]:box((x,y,.079),(.022,.08,.018),BARK_LIGHT)
for i in range(5):carved_leaf(((i-2)*.125,.23,.07),((i-2)*.13,.01+(i%2)*.045,.09),.14,MOSS,.018)
carved_leaf((0,.80,.12),(0,.34,.12),.23,AGED_BRASS,.018)
carved_leaf((0,.73,.145),(0,.41,.145),.12,JADE,.012)
for side in [-1,1]:fern_sprig((side*.34,.77,0),(side*.45,.37,.06),.15)
complete('courageous-call')

# Lord of Battle: an open root-and-antler command circlet, hanging leaves and a suspended jade heart.
for i in range(12):
    a=i*TAU/12;b=(i+1)*TAU/12
    p=(math.sin(a)*.60,1.46+math.sin(a*3)*.055,math.cos(a)*.60)
    q=(math.sin(b)*.60,1.46+math.sin(b*3)*.055,math.cos(b)*.60)
    tube([p,q],[.085,.073],BARK,4)
    if i%2==0:
        first=len(m.vertices)
        tube([(0,1.46,.60),(.07,1.74,.65),(-.015,2.03,.73),(.12,2.39,.79)],[.10,.075,.055,.004],BARK_LIGHT,4)
        tube([(.02,1.83,.69),(-.20,2.06,.76),(-.28,2.24,.74)],[.058,.037,.003],BONE,4)
        box((0,1.52,.60),(.22,.075,.22),IRON)
        box((0,1.52,.722),(.075,.04,.018),AGED_BRASS)
        for j in range(3):carved_leaf((-.12+j*.09,1.43,.64),(-.12+j*.09,1.02-(j%2)*.13,.69),.15,MOSS if j%2 else DEEP_MOSS,.025)
        place(first,angles=(0,a,0))
    else:
        carved_leaf(p,(p[0]*1.13,p[1]+.28,p[2]*1.13),.18,FERN,.025,normal=(math.sin(a),0,math.cos(a)))
stepped_solid((0,1.70,0),(.18,.30,.18),DEEP_MOSS,7)
stepped_solid((0,1.75,.045),(.13,.23,.145),JADE,6)
box((-.024,1.84,.194),(.034,.09,.014),SPIRIT)
for side in [-1,1]:
    tube([(side*.48,1.42,0),(side*.27,1.56,.10),(side*.09,1.78,.12)],[.04,.027,.004],AGED_BRASS,4)
    twig([(side*.42,1.36,-.20),(side*.50,.96,-.16),(side*.43,.66,-.11)],[.052,.034,.003],BARK)
complete('lord-of-battle')

assert len(made)==38 and len(set(made))==38
export('knight')
