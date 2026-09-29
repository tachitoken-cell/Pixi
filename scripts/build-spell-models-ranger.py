"""Blender-authored solid Ranger spell centerpieces; Y up, +Z flight direction."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from spell_model_tools import *

reset()
WOOD=(.30,.13,.045,1); BARK=(.16,.07,.025,1); COPPER=(.72,.34,.09,1)
FERN=(.07,.34,.11,1); TOXIC=(.62,1,.045,1); SAP=(.94,.85,.26,1)
report=[]


def petal(start,end,width,color=GREEN,curl=.12):
    """Curved, closed diamond-section leaf or feather: a surface, not a line icon."""
    a,b=Vector(start),Vector(end);d=(b-a).normalized()
    side=d.cross(Vector((0,0,1)))
    if side.length<.1:side=d.cross(Vector((0,1,0)))
    side.normalize();normal=d.cross(side).normalized();vs=[]
    for i in range(6):
        u=i/5;w=max(.006,math.sin(math.pi*u)*width);mid=a.lerp(b,u)+normal*math.sin(math.pi*u)*curl
        for j in range(6):
            q=j*TAU/6;vs.append(mid+side*math.cos(q)*w+normal*math.sin(q)*w*.23)
    add(vs,[(i*6+j,i*6+(j+1)%6,(i+1)*6+(j+1)%6,(i+1)*6+j) for i in range(5) for j in range(6)],color)
    tube([a,a.lerp(b,.5)+normal*curl+normal*.015,b],[.012,.017,.001],tint(color,1.25),4)


def arrow(center=(0,0,0),scale=1,color=GOLD,feathers=3):
    x,y,z=center
    tube([(x,y,z-.65*scale),(x,y,z+.2*scale),(x,y,z+.38*scale)],[.032*scale,.037*scale,.075*scale],WOOD,8)
    plate([(x,y,z+.78*scale),(x-.16*scale,y,z+.24*scale),(x,y+.07*scale,z+.36*scale),(x+.16*scale,y,z+.24*scale)],.055*scale,color)
    crystal((x,y,z+.21*scale),(x,y,z+.8*scale),.075*scale,PEARL,5)
    for j in range(feathers):
        q=j*TAU/feathers;cx,cy=math.cos(q),math.sin(q)
        petal((x+cx*.025*scale,y+cy*.025*scale,z-.55*scale),(x+cx*.19*scale,y+cy*.19*scale,z-.27*scale),.14*scale,mix(PEARL,color,.35),.025*scale)
    ring((x,y,z+.18*scale),.065*scale,.025*scale,COPPER,'z',12)
    pts=[(x+math.cos(i*.8)*.045*scale,y+math.sin(i*.8)*.045*scale,z-.17*scale+i*.028*scale) for i in range(12)]
    tube(pts,.012*scale,SAP,4)


def snake_head(center,size=1,hood=False):
    x,y,z=center
    ellipsoid((x,y,z),(.22*size,.14*size,.29*size),TOXIC,12,6)
    ellipsoid((x,y+.06*size,z+.06*size),(.18*size,.085*size,.23*size),FERN,10,5)
    for side in [-1,1]:
        ellipsoid((x+side*.15*size,y+.06*size,z+.13*size),(.052*size,.043*size,.065*size),GOLD,8,4)
        ellipsoid((x+side*.16*size,y+.07*size,z+.155*size),(.018*size,.032*size,.02*size),DARK,6,3)
        crystal((x+side*.11*size,y-.03*size,z+.15*size),(x+side*.10*size,y-.20*size,z+.33*size),.045*size,PEARL,5)
        if hood:petal((x,y,z-.20*size),(x+side*.51*size,y+.20*size,z-.06*size),.30*size,GREEN,.08*size)


def done(id):
    obj=finish_forest(id) if id=='poison-cloud' else finish(id)
    if id in {'trail-mending','barkskin','hunters-reprieve','thornburst','silken-guard','wild-renewal','forest-ward','survival-instinct','heart-of-the-wild','venom-detonation','poison-cloud'}:
        base=min(v.co.z for v in obj.data.vertices)
        for vertex in obj.data.vertices:vertex.co.z-=base
    coords=[(v.co.x,v.co.z,-v.co.y) for v in obj.data.vertices]
    report.append({'id':id,'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'min':[round(min(v[i] for v in coords),3) for i in range(3)],'max':[round(max(v[i] for v in coords),3) for i in range(3)]})

# Quick Shot: hand-carved broadhead, warm shaft, three sculpted ivory fletchings.
arrow()
for side in [-1,1]:petal((0,0,.35),(side*.20,.035,.59),.075,SILVER,.025)
done('arrow')

# Hamstring Shot: a thick hinged trap jaw, three inward hooks, steel teeth and leaf springs.
arrow(scale=.68,feathers=2)
for side in [-1,1]:
    tube([(side*.08,-.15,-.28),(side*.35,-.14,-.16),(side*.46,-.12,.22),(side*.27,-.10,.50),(side*.10,-.08,.34)],[.075,.10,.11,.085,.025],SILVER,9)
    ellipsoid((side*.12,-.12,-.29),(.13,.11,.11),COPPER,10,5)
    for j in range(3):crystal((side*(.40-j*.03),-.12,-.04+j*.15),(side*.20,-.09,.02+j*.15),.055,PEARL,5)
    petal((side*.12,-.12,-.25),(side*.32,-.08,-.58),.10,WOOD,.07)
done('hamstring-shot')

# Power Shot: broad recurved wooden limbs, bronze cam housings and a gold central quarrel.
arrow(scale=.95,feathers=2)
for side in [-1,1]:
    tube([(side*.07,0,-.25),(side*.38,.08,-.45),(side*.66,.12,-.28),(side*.77,.09,.02)],[.13,.16,.11,.04],WOOD,10)
    petal((side*.10,.08,-.25),(side*.72,.16,-.18),.12,GOLD,.10)
    ellipsoid((side*.64,.10,-.20),(.15,.15,.09),COPPER,10,6)
    ring((side*.64,.10,-.2),.1,.027,PEARL,'z',12)
    tube([(side*.77,.09,.02),(0,-.02,-.65)],[.025,.025],SAP,6)
done('power-shot')

# Trail Mending: a grounded herbal bundle, layered crossed linen, salve leaves and amber center.
ellipsoid((0,.9,0),(.40,.58,.28),WOOD,12,7)
for side in [-1,1]:
    ribbon([(side*.38,.42,.23),(side*.17,.8,.34),(-side*.10,1.2,.31),(-side*.34,1.45,.15)],[.20,.27,.27,.16],PEARL,(0,0,1))
    petal((0,.55,0),(side*.63,1.31,.02),.22,GREEN,.15)
    petal((0,.75,.03),(side*.42,1.57,.08),.18,MINT,.12)
ellipsoid((0,1.02,.35),(.18,.22,.14),SAP,12,7)
for j in range(5):petal((0,.2,0),(math.sin(j*TAU/5)*.65,.08,math.cos(j*TAU/5)*.65),.18,FERN,.12)
done('trail-mending')

# Venom Arrow: swollen segmented seedpod enclosing a luminous toxic core and barbed needle.
arrow(scale=.72,feathers=2)
ellipsoid((0,0,-.08),(.24,.24,.32),TOXIC,16,8)
for j in range(5):
    q=j*TAU/5
    petal((math.cos(q)*.05,math.sin(q)*.05,-.43),(math.cos(q)*.22,math.sin(q)*.22,.15),.12,FERN,.10)
    ellipsoid((math.cos(q)*.24,math.sin(q)*.24,-.18),(.08,.08,.12),GREEN,8,4)
done('poison-shot')

# Concussive Shot: rounded brass impact hammer with layered square bevels and inset core.
arrow(center=(0,0,-.25),scale=.65,feathers=2)
box((0,0,.2),(.66,.55,.30),COPPER)
box((0,0,.375),(.53,.42,.10),GOLD)
box((0,0,.445),(.37,.28,.06),PEARL)
for x in [-.28,.28]:
    for y in [-.23,.23]:ellipsoid((x,y,.24),(.10,.10,.20),SILVER,10,5)
ring((0,0,.48),.14,.045,GOLD,'z',16)
done('concussive-shot')

# Multishot: a three-pronged, fletched broadhead joined by a swept fork rather than loose copies.
for j in [-1,0,1]:
    x=j*.35
    tube([(0,0,-.42),(x*.6,0,-.12),(x,0,.35)],[.07,.075,.035],WOOD,7)
    crystal((x,0,.16),(x*1.22,.02,.68-abs(j)*.14),.13,GOLD,6)
    petal((x*.4,0,-.40),(x*.9,0,-.05),.18,PEARL,.035)
    petal((x*.65,.03,-.16),(x*1.10,.04,.15),.10,GREEN,.05)
ellipsoid((0,0,-.45),(.13,.13,.16),COPPER,12,6)
ring((0,0,-.4),.13,.035,GOLD,'z',16)
done('multishot')

# Barkskin: substantial overlapping bark armor, green seams, knots and root toes.
for j in range(7):
    q=j*TAU/7;x,z=math.sin(q),math.cos(q)
    tube([(x*.49,.12,z*.49),(x*.63,.60,z*.63),(x*.58,1.23,z*.58),(x*.42,1.73,z*.42)],[.12,.25,.22,.10],mix(BARK,WOOD,j%3*.25),8)
    petal((x*.48,.45,z*.48),(x*.63,1.18,z*.63),.15,FERN,.06)
    crystal((x*.48,.12,z*.48),(x*.90,.04,z*.90),.11,WOOD,5)
for side in [-1,1]:petal((side*.40,1.3,0),(side*.86,1.7,0),.27,GREEN,.12)
done('barkskin')

# Volley: feathered rain-lance, with five swept vanes and cascading sharpened tips.
for j in range(5):
    q=-1.2+j*.6;x=math.sin(q)*.55;y=math.cos(q)*.22
    petal((0,0,-.65),(x,y,.12),.20,mix(PEARL,GOLD,.3+j*.1),.08)
    crystal((x*.7,y*.7,-.05),(x,y,.53-abs(j-2)*.11),.08,SILVER,5)
tube([(0,0,-.7),(0,0,-.2),(0,0,.67)],[.07,.10,0],GOLD,9)
for j in range(3):petal((0,0,-.56),(math.sin(j*TAU/3)*.32,math.cos(j*TAU/3)*.32,-.3),.15,MINT,.08)
done('volley')

# Frost Arrow: a solid six-petalled ice lotus enclosing the silver arrow tip.
arrow(scale=.70,feathers=2)
ellipsoid((0,0,.08),(.17,.17,.23),PEARL,12,7)
for j in range(6):
    q=j*TAU/6;cx,cy=math.cos(q),math.sin(q)
    petal((cx*.05,cy*.05,-.1),(cx*.43,cy*.43,.29),.14,ICE,.08)
    crystal((cx*.16,cy*.16,.02),(cx*.40,cy*.40,.48),.08,MINT,5)
done('frost-arrow')

# Ricochet Shot: a thick carved boomerang with crescent-shaped metal leading edges.
for side in [-1,1]:
    tube([(0,0,-.25),(side*.3,.015,-.08),(side*.65,.03,.28),(side*.78,.02,.42)],[.16,.20,.15,.035],WOOD,10)
    petal((side*.05,.06,-.25),(side*.77,.05,.44),.20,GOLD,.08)
    petal((side*.08,.12,-.10),(side*.56,.10,.24),.075,PEARL,.025)
    ellipsoid((side*.25,0,-.06),(.075,.09,.15),COPPER,10,5)
ellipsoid((0,0,-.22),(.15,.12,.15),GREEN,12,7)
done('ricochet-shot')

# Hunter's Reprieve: antler cradle with warm glowing seed and layered feathered nest.
ellipsoid((0,.94,0),(.28,.42,.28),SAP,16,8)
for side in [-1,1]:
    tube([(side*.18,.12,0),(side*.57,.6,-.06),(side*.63,1.25,-.05),(side*.4,1.70,0)],[.12,.11,.085,.015],WOOD,9)
    for j in range(3):tube([(side*.57,.6+j*.27,-.06),(side*(.8+j*.035),.95+j*.25,-.1),(side*.78,1.12+j*.25,-.08)],[.055,.035,0],PEARL,6)
for j in range(7):
    q=j*TAU/7;petal((0,.35,0),(math.sin(q)*.62,.95,math.cos(q)*.62),.20,GREEN,.14)
done('hunters-reprieve')

# Piercing Shot: a three-fluted brass drill wrapped around a long ivory needle.
tube([(0,0,-.60),(0,0,.22),(0,0,.85)],[.11,.12,0],PEARL,10)
for j in range(3):
    pts=[]
    for i in range(16):
        z=-.57+i*.074;q=j*TAU/3+i*.50;radius=.19*(1-i*.035)
        pts.append((math.cos(q)*radius,math.sin(q)*radius,z))
    tube(pts,[.07*(1-i*.04) for i in range(16)],GOLD,7)
ring((0,0,-.55),.16,.06,SILVER,'z',16)
done('piercing-shot')

# Thornburst: eight dense arching brambles, fleshy leaf bases and large hooked thorn surfaces.
for j in range(8):
    q=j*TAU/8;x,z=math.sin(q),math.cos(q)
    tube([(x*.20,.08,z*.20),(x*.55,.25,z*.55),(x*.82,.60,z*.82),(x,.35,z)],[.16,.14,.10,0],FERN,8)
    crystal((x*.55,.24,z*.55),(x*.50,.82,z*.50),.10,PEARL,5)
    petal((x*.2,.08,z*.2),(x*.72,.3,z*.72),.23,GREEN,.1)
    crystal((x*.82,.55,z*.82),(x*1.07,.74,z*1.07),.08,WOOD,5)
done('thornburst')

# Serpent Fan: three slim snakes, independent heads, winding bodies, bright scale ridges.
for j in [-1,0,1]:
    x=j*.40
    tube([(x*.4,-.08,-.65),(x-.09,.04,-.35),(x+.10,.09,-.05),(x,.04,.25)],[.055,.09,.11,.10],GREEN,8)
    snake_head((x,.04,.36),.7)
    petal((x,-.07,-.18),(x,-.06,.22),.10,TOXIC,.02)
done('serpent-fan')

# Rapid Fire: a compact carved repeating launcher, polished rails and a stacked bolt cartridge.
box((0,-.09,-.12),(.42,.29,1.00),WOOD)
for side in [-1,1]:
    tube([(side*.22,.06,-.58),(side*.22,.10,-.16),(side*.22,.10,.53)],[.055,.055,.04],SILVER,8)
    petal((side*.08,-.12,-.58),(side*.34,-.12,.16),.12,COPPER,.025)
for j in range(3):
    tube([((j-1)*.11,.13,-.44),((j-1)*.11,.13,.35)],[.027,.035],PEARL,6)
    crystal(((j-1)*.11,.13,.25),((j-1)*.11,.13,.63-j*.12),.055,GOLD,5)
ring((0,-.10,-.15),.25,.045,COPPER,'z',16)
for side in [-1,1]:ellipsoid((side*.20,-.14,-.4),(.10,.10,.12),GOLD,12,6)
done('rapid-fire')

# Explosive Arrow: a rounded powder keg, metal hoops, orange fuse tongues and projecting arrow tip.
arrow(center=(0,0,.03),scale=.7,feathers=2)
ellipsoid((0,0,-.15),(.26,.26,.40),BARK,16,8)
for z in [-.4,-.15,.10]:ring((0,0,z),.255 if z==-.15 else .21,.035,COPPER,'z',16)
for j in range(6):
    q=j*TAU/6;tube([(math.cos(q)*.20,math.sin(q)*.20,-.40),(math.cos(q)*.265,math.sin(q)*.265,-.15),(math.cos(q)*.20,math.sin(q)*.20,.1)],.018,GOLD,4)
tube([(0,.18,-.3),(.14,.38,-.42),(.09,.5,-.48)],[.04,.025,.01],SAP,6)
flame((.09,.55,-.48),(.25,.4,.3),FIRE)
done('explosive-arrow')

# Silken Guard: broad woven silk ribbons form a cocoon around an open luminous interior.
for j in range(8):
    q=j*TAU/8;pts=[]
    for i in range(8):
        u=i/7;d=math.sin(math.pi*u)*.86;v=q+u*.6
        pts.append((math.sin(v)*d,.12+u*2.15,math.cos(v)*d))
    tube(pts,[.024,.038,.048,.055,.055,.048,.035,.015],MINT,6)
for height,d in [(.45,.55),(.85,.78),(1.3,.83),(1.75,.66)]:ring((0,height,0),d,.035,PEARL,'y',20)
ellipsoid((0,2.24,0),(.13,.18,.13),SAP,12,6)
done('silken-guard')

# Tranquilizing Shot: a sculpted drooping poppy head, soft cupped petals, seed stamens and needle.
tube([(0,-.08,-.62),(0,0,-.12),(0,0,.53)],[.04,.05,.01],WOOD,7)
for j in range(5):
    q=j*TAU/5
    petal((0,0,-.04),(math.cos(q)*.4,math.sin(q)*.4,.18),.23,mix(GREEN,MINT,j%2*.5),.12)
ellipsoid((0,0,.16),(.15,.15,.18),GOLD,12,6)
for j in range(5):
    q=j*TAU/5;ellipsoid((math.cos(q)*.13,math.sin(q)*.13,.3),(.038,.038,.055),PEARL,8,4)
crystal((0,0,.22),(0,0,.70),.05,SILVER,5)
done('tranquilizing-shot')

# Wild Renewal: two unfurling fern fronds with solid curled leaflets and a living central bud.
ellipsoid((0,.24,0),(.22,.24,.22),FERN,12,6)
for side in [-1,1]:
    points=[(0,.14,0),(side*.13,.65,0),(side*.40,1.24,.02),(side*.54,1.75,.02),(side*.36,2.05,.01),(side*.20,1.89,.02)]
    tube(points,[.10,.08,.065,.05,.035,.015],GREEN,8)
    for j in range(5):
        y=.5+j*.25;x=side*(.06+j*.095)
        petal((x,y,0),(x+side*.36,y+.15,.07),.14,MINT,.08)
        petal((x,y+.08,0),(x-side*.22,y+.2,-.06),.10,GREEN,.06)
ellipsoid((0,.40,.04),(.11,.23,.11),SAP,10,6)
done('wild-renewal')

# Razor Flurry: seven broad, serrated steel fan blades mounted on a bronze hinge.
ellipsoid((0,0,-.38),(.18,.15,.18),COPPER,12,7)
for j in range(7):
    q=-1.05+j*.35;start=(math.sin(q)*.07,0,-.38);end=(math.sin(q)*.75,.03,math.cos(q)*.65)
    petal(start,end,.16,SILVER,.035)
    for k in [0,1]:
        u=.48+k*.23;cx=math.sin(q)*(.07+u*.68);cz=-.38+u*(math.cos(q)*.65+.38)
        crystal((cx,0,cz),(cx+math.cos(q)*.1,.025,cz-math.sin(q)*.1),.045,PEARL,4)
ring((0,0,-.38),.15,.04,GOLD,'z',16)
done('razor-flurry')

# Viper Strike: one broad hooded cobra with a sculpted head, luminous eyes and long ivory fangs.
tube([(0,-.12,-.66),(-.25,-.05,-.44),(.17,.08,-.13),(0,.13,.19)],[.055,.12,.14,.13],GREEN,10)
snake_head((0,.17,.34),1,True)
for side in [-1,1]:
    petal((0,.13,-.14),(side*.40,.29,.13),.17,TOXIC,.07)
    tube([(side*.33,.25,.09),(side*.24,.35,.05),(side*.18,.32,-.12)],[.035,.045,.018],FERN,5)
done('viper-strike')

# Forest Ward: thick rooted arch columns join a verdant canopy; every arch has a carved wood surface.
for j in range(4):
    q=j*TAU/4;x,z=math.sin(q),math.cos(q)
    tube([(x*1.0,.03,z*1.0),(x*.77,.55,z*.77),(x*.75,1.32,z*.75),(x*.48,1.95,z*.48),(0,2.24,0)],[.18,.15,.14,.10,.055],WOOD,9)
    for k in range(2):petal((x*.7,1.2+k*.34,z*.7),(x*.85,1.68+k*.30,z*.85),.30,mix(GREEN,MINT,k*.3),.15)
    crystal((x*.70,.1,z*.70),(x*1.13,.04,z*1.13),.14,BARK,6)
ellipsoid((0,2.23,0),(.23,.18,.23),SAP,12,7)
done('forest-ward')

# Hail of Arrows: a hanging storm canopy with three staggered curtains of broad ivory arrowheads.
for row in range(3):
    for j in [-1,0,1]:
        x=j*.32;y=(row-1)*.24;z=-.48+row*.32
        tube([(x,y,z-.25),(x,y,z+.16)],[.025,.04],SILVER,6)
        crystal((x,y,z+.08),(x,y,z+.53),.095,PEARL,5)
        petal((x,y,z-.25),(x+.08,y+.09,z-.01),.09,GOLD,.025)
for side in [-1,1]:petal((side*.12,0,-.72),(side*.58,.17,-.10),.25,MINT,.08)
done('hail-of-arrows')

# Binding Arrow: a thick four-lobed binding knot, gripping roots and a luminous central arrow.
arrow(scale=.62,feathers=2)
for j in range(4):
    q=j*TAU/4;pts=[]
    for i in range(10):
        u=i/9;d=.13+math.sin(math.pi*u)*.39;v=q+math.sin(math.pi*u)*.28
        pts.append((math.sin(v)*d,math.cos(v)*d,-.37+u*.68))
    tube(pts,.06,WOOD,7)
    petal((math.sin(q)*.10,math.cos(q)*.10,-.10),(math.sin(q)*.40,math.cos(q)*.40,.24),.11,GREEN,.06)
ring((0,0,-.33),.13,.045,GOLD,'z',14)
done('binding-arrow')

# Eagle's Eye: sculpted eagle torso, hooked beak, alert eyes and deeply layered flight feathers.
ellipsoid((0,0,-.06),(.19,.17,.38),WOOD,12,7)
ellipsoid((0,.09,.35),(.16,.17,.19),PEARL,12,7)
crystal((0,.08,.44),(0,.005,.65),.09,GOLD,5)
for side in [-1,1]:
    ellipsoid((side*.12,.15,.39),(.045,.043,.05),GOLD,8,4)
    ellipsoid((side*.14,.15,.407),(.022,.025,.025),DARK,6,3)
    for j in range(5):
        x=side*(.30+j*.13)
        petal((side*.11,0,-.05),(x,.07-j*.025,-.06-j*.12),.13,mix(PEARL,WOOD,j*.13),.04)
    petal((side*.1,-.07,-.34),(side*.25,-.06,-.69),.12,PEARL,.025)
done('eagles-eye')

# Frostfall Volley: a floating three-spired ice cage with wide crystalline panes and split tips.
for j in range(3):
    q=j*TAU/3;x,y=math.sin(q)*.42,math.cos(q)*.42
    crystal((x,y,-.55),(x*.88,y*.88,.61),.18,ICE,7)
    crystal((x*1.13,y*1.13,-.2),(x*1.26,y*1.26,.40),.08,PEARL,5)
    petal((x*.3,y*.3,-.25),(x,y,.30),.17,MINT,.05)
ellipsoid((0,0,-.05),(.16,.16,.23),PEARL,12,7)
ring((0,0,-.35),.40,.045,SILVER,'z',18)
done('frostfall-volley')

# Survival Instinct: a substantial wolf guardian mask with broad cheek ruffs and a warm inner core.
ellipsoid((0,1.37,0),(.50,.52,.34),FERN,14,8)
ellipsoid((0,1.20,.35),(.20,.16,.38),MINT,12,6)
ellipsoid((0,1.27,.69),(.105,.08,.075),BARK,10,5)
for side in [-1,1]:
    plate([(side*.12,1.68,0),(side*.53,2.27,.02),(side*.63,1.63,0)],.16,GREEN)
    plate([(side*.25,1.72,.11),(side*.50,2.10,.12),(side*.54,1.72,.11)],.04,PEARL)
    ellipsoid((side*.24,1.53,.27),(.12,.055,.10),GOLD,10,5)
    ellipsoid((side*.24,1.53,.33),(.042,.04,.03),DARK,8,4)
    crystal((side*.08,1.51,.35),(side*.43,1.65,.28),.065,FERN,5)
    for j in range(3):petal((side*.31,1.39-j*.12,.10),(side*(.76-j*.1),1.08-j*.11,.12),.17,mix(GREEN,PEARL,j*.25),.09)
    crystal((side*.10,1.13,.43),(side*.12,.97,.43),.055,PEARL,5)
for j in range(4):petal((0,.68,0),(math.sin(j*TAU/4)*.72,.08,math.cos(j*TAU/4)*.54),.24,FERN,.13)
done('survival-instinct')

# Starfall Arrow: a solid five-point faceted comet star, layered hot center and wide trailing ribbons.
for j in range(5):
    q=j*TAU/5
    crystal((0,0,.08),(math.sin(q)*.66,math.cos(q)*.66,.12),.17,GOLD,5)
    petal((math.sin(q)*.05,math.cos(q)*.05,-.1),(math.sin(q)*.30,math.cos(q)*.30,-.63),.14,ARCANE,.09)
ellipsoid((0,0,.12),(.24,.24,.22),PEARL,16,8)
crystal((0,0,.18),(0,0,.63),.13,SAP,6)
done('starfall-arrow')

# Relentless Volley: a six-vane fletching magazine with bronze sockets and a central shooting channel.
tube([(0,0,-.50),(0,0,.14),(0,0,.54)],[.16,.14,.04],WOOD,10)
for j in range(6):
    q=j*TAU/6;x,y=math.cos(q),math.sin(q)
    petal((x*.11,y*.11,-.45),(x*.52,y*.52,-.05),.14,mix(PEARL,GOLD,j%2*.5),.08)
    ellipsoid((x*.29,y*.29,-.2),(.09,.09,.16),COPPER,8,5)
    crystal((x*.20,y*.20,.1),(x*.23,y*.23,.42),.05,SILVER,5)
ring((0,0,.06),.25,.06,GOLD,'z',18)
done('relentless-volley')

# Heart of the Wild: a living heart-shaped tree crown, luminous fruit and splayed roots.
tube([(0,.03,0),(0,.52,0),(0,1.15,0)],[.20,.16,.12],WOOD,10)
for side in [-1,1]:
    tube([(0,.72,0),(side*.55,1.38,0),(side*.60,1.87,0),(side*.35,2.14,0),(0,1.9,0)],[.12,.11,.085,.07,.04],GREEN,8)
    for j in range(4):petal((side*(.15+j*.10),1.24+j*.18,0),(side*(.47+j*.07),1.57+j*.14,.03),.21,mix(GREEN,MINT,j*.18),.12)
for j in range(5):
    q=j*TAU/5;tube([(0,.19,0),(math.sin(q)*.49,.10,math.cos(q)*.49),(math.sin(q)*.86,.025,math.cos(q)*.86)],[.13,.09,.01],BARK,7)
ellipsoid((0,1.50,.10),(.21,.30,.18),SAP,14,8)
done('heart-of-the-wild')

# Twinshot: two complete arrows, bound by broad interlaced ribbon fins rather than duplicate glints.
arrow(center=(-.21,0,0),scale=.8,color=GOLD,feathers=2)
arrow(center=(.21,0,0),scale=.8,color=SILVER,feathers=2)
for side in [-1,1]:
    pts=[(side*math.cos(i*.38)*.27,math.sin(i*.38)*.17,-.52+i*.08) for i in range(12)]
    ribbon(pts,[.035+.09*math.sin(math.pi*i/11) for i in range(12)],PEARL if side>0 else GOLD,(0,0,1))
ellipsoid((0,0,-.45),(.10,.13,.10),GREEN,10,5)
done('twinshot')

# Venom Detonation: ruptured toxic seed, three heavy shell lobes and jets curling from its heart.
ellipsoid((0,.40,0),(.30,.33,.30),TOXIC,16,8)
for j in range(5):
    q=j*TAU/5;x,z=math.sin(q),math.cos(q)
    petal((x*.05,.12,z*.05),(x*.76,.67,z*.76),.28,FERN,.20)
    tube([(x*.16,.45,z*.16),(x*.35,.94,z*.35),(x*.68,1.16,z*.68),(x*.87,.93,z*.87)],[.12,.10,.065,.015],GREEN,8)
    ellipsoid((x*.82,1.01,z*.82),(.09,.15,.09),TOXIC,10,5)
    crystal((x*.45,.18,z*.45),(x*1.02,.08,z*1.02),.10,WOOD,5)
done('venom-detonation')

# Poison Cloud: a rooted fungal thicket built with the pets' stepped caps, leaf layers and inset gills.
# Palette and linear conversion match Fern Lynx / Lantern Sprite, with venom only in the pore seams.
F_BARK=forest_color('554235');F_DARK=forest_color('322D2A');F_MOSS=forest_color('528364')
F_DEEP=forest_color('244C40');F_FERN=forest_color('83B670');F_BONE=forest_color('D9D5A0')
F_VENOM=forest_color('B5EF62');F_JADE=forest_color('4C958A')
for j,(x,z,h,s) in enumerate([(-.43,.13,.73,1),(.43,.32,.48,.76),(.10,-.41,.97,.85)]):
    tube([(x*.45,.04,z*.45),(x*.71,h*.32,z*.78),(x*.95,h*.68,z),(x,h,z)],[.15*s,.11*s,.085*s,.16*s],F_BARK,4)
    for side in [-1,1]:
        tube([(x+side*.035,.12,z+.04),(x+side*.055,h*.47,z+.065),(x+side*.021,h*.86,z+.06)],[.012,.018,.003],F_DARK,4)
    stepped_solid((x,h+.035*s,z),(.45*s,.095*s,.39*s),F_DEEP,9)
    stepped_solid((x-.015*s,h+.13*s,z-.018*s),(.38*s,.075*s,.34*s),F_MOSS,9)
    stepped_solid((x-.026*s,h+.225*s,z-.030*s),(.265*s,.075*s,.22*s),F_FERN,8)
    box((x-.026*s,h+.305*s,z-.030*s),(.19*s,.023*s,.13*s),F_DARK)
    box((x-.035*s,h+.320*s,z-.031*s),(.065*s,.016*s,.08*s),F_VENOM)
    for k in range(10):
        q=k*TAU/10;dx,dz=math.sin(q),math.cos(q)
        tube([(x+dx*.15*s,h-.071*s,z+dz*.15*s),(x+dx*.39*s,h-.045*s,z+dz*.33*s)],[.014*s,.024*s],F_BONE if k%3 else F_VENOM,4)
        if k%2:
            box((x+dx*.27*s,h+.213*s,z+dz*.21*s),(.06*s,.021*s,.045*s),F_DEEP)
            box((x+dx*.27*s,h+.226*s,z+dz*.21*s),(.022*s,.010*s,.017*s),F_VENOM)
    for k in range(3):
        a=k*TAU/3+j
        tube([(x,.13,z),(x+math.sin(a)*.25,.065,z+math.cos(a)*.25),(x+math.sin(a)*.52,.025,z+math.cos(a)*.44)],[.065,.044,.003],F_DARK,4)
for side in [-1,1]:
    a=Vector((side*.36,.06,-.05));b=Vector((side*.88,.44,.14));d=b-a
    tube([a,a+d*.52,b],[.033,.024,.001],F_DEEP,4)
    for i in range(1,5):
        p=a+d*i/5
        for direction in [-1,1]:
            carved_leaf(p,p+d*.17+Vector((direction*.03,.02,direction*.22*(1-i*.1))),.13,F_FERN if i%3==0 else F_MOSS,.020,normal=(0,1,0))
for i in range(7):
    q=i*TAU/7;r=.49+(i%3)*.14
    carved_leaf((math.sin(q)*.18,.025,math.cos(q)*.18),(math.sin(q)*r,.10,math.cos(q)*r),.22,F_DEEP,.027,normal=(0,1,0))
for i in range(6):
    q=i*TAU/6;r=.64+(i%2)*.14
    stepped_solid((math.sin(q)*r,.57+(i%3)*.23,math.cos(q)*r),(.055,.071,.055),F_JADE if i%2 else F_VENOM,4)
done('poison-cloud')
assert 500 <= report[-1]['triangles'] <= 6500

assert len(report)==34
assert len({entry['id'] for entry in report})==34
bpy.context.preferences.filepaths.save_version=0
export('ranger')
print('RANGER_MODEL_REPORT '+json.dumps(report))
