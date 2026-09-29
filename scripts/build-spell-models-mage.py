"""Author 34 separate, solid Mage effect models in Blender."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from spell_model_tools import *
reset()
CINDER=(.22,.035,.009,1); LILAC=(.78,.55,1,1)
def icicle(a,b,r=.12,c=ICE):crystal(a,b,r,c)
def swirl(y,r,turns,c,width=.08):
    pts=[(math.cos(i*.15)*r*(1-i/100),y+i*.017,math.sin(i*.15)*r*(1-i/100)) for i in range(int(turns*TAU/.15)+1)];tube(pts,[width*(1-i/len(pts)) for i in range(len(pts))],c,6)
def gem(c=(0,0,0),size=.5,col=ARCANE):
    x,y,z=c;crystal((x,y-size,z),(x,y+size,z),size*.6,col,8)
def petals(center,r,n,c):
    x,y,z=center
    for i in range(n):
        a=i*TAU/n;leaf((x,y,z),(x+math.cos(a)*r,y+.18,z+math.sin(a)*r),r*.22,c)
# Fireball: blackened molten shell, visible bright fissures and swept licking tongues.
ellipsoid((0,0,0),(.48,.48,.56),CINDER,16,9)
for i in range(9):
    q=i*TAU/9;pts=[(math.cos(q+j*.2)*(.4-j*.04),math.sin(q+j*.2)*(.4-j*.04),.35-j*.24) for j in range(7)];tube(pts,[.06,.1,.12,.1,.07,.035,0],FIRE,6)
    tube(pts[:4],[.022,.035,.026,0],PEARL,5)
finish('fireball')
# Arcane missile: interlocking swept prism shells around a brilliant suspended spear.
for i in range(3):
    q=i*TAU/3;crystal((math.cos(q)*.28,math.sin(q)*.28,-.65),(0,0,.9),.2,ARCANE,5)
    tube([(math.cos(q)*.52,math.sin(q)*.52,-.5),(math.cos(q+.6)*.35,math.sin(q+.6)*.35,.1),(0,0,.75)],[.04,.045,0],LILAC,5)
crystal((0,0,-.5),(0,0,1),.13,PEARL)
for j in range(3):
    q=j*TAU/3
    for k in range(4):
        z=-.5+k*.21;tube([(math.cos(q)*.3,math.sin(q)*.3,z),(math.cos(q+.18)*.38,math.sin(q+.18)*.38,z+.06),(math.cos(q+.3)*.29,math.sin(q+.3)*.29,z+.12)],.018,PEARL,5)
finish('arcane-missile')
# Frostbolt: broad blue crystal spine with six saw-tooth fins and white etched seams.
crystal((0,0,-.65),(0,0,.95),.25,ICE,8)
for j in range(3):
    for side in [-1,1]:icicle((side*.07,0,-j*.28),(side*(.5-j*.08),.08,-j*.28-.3),.12,LILAC if j==2 else ICE)
tube([(0,.13,-.52),(0,.18,.1),(0,0,.9)],[.04,.025,0],PEARL,5);finish('frostbolt')
# Flame barrier: curved wall of opaque fire tongues; gaps expose the protected player.
for i in range(7):
    q=i*TAU/7;flame((math.cos(q),1.05,math.sin(q)),(.7,2.1,.45),FIRE,math.sin(q)*.5)
finish('flame-barrier')
# Nova: thick six-branched crystalline snowflake with jagged upward ice along each spoke.
for i in range(6):
    q=i*TAU/6;x,z=math.cos(q),math.sin(q);crystal((0,.1,0),(x,.12,z),.085,ICE)
    for f in [.42,.7]:
        for side in [-1,1]:crystal((x*f,.12,z*f),(x*f+math.cos(q+side*.7)*.28,.2,z*f+math.sin(q+side*.7)*.28),.045,PEARL)
    icicle((x*.88,.07,z*.88),(x,.55,z),.1)
finish('nova')
# Lance: needle core inside folded translucent-looking planar fins.
crystal((0,0,-.85),(0,0,1.25),.13,PEARL,8)
for i in range(3):
    q=i*TAU/3;crystal((math.cos(q)*.28,math.sin(q)*.28,-.6),(0,0,.65),.12,ICE,4)
ring((0,0,-.6),.3,.035,ICE,'z',24);finish('ice-lance')
# Arcane burst: a broken octahedron flowering into six solid engraved facets.
for i in range(6):
    q=i*TAU/6;x,z=math.cos(q)*.7,math.sin(q)*.7;crystal((x,.08,z),(x*.8,.65,z*.8),.23,ARCANE,4);tube([(x,.15,z),(x*.6,.8,z*.6),(0,1.05,0)],[.025,.035,0],LILAC,5)
gem((0,.5,0),.35,PEARL);finish('arcane-burst')
# Cinderbolt: cracked coal cluster, ember seams, broad smoky charcoal fins.
for i in range(6):
    q=i*2.4;ellipsoid((math.cos(q)*.28,math.sin(q)*.28,-i*.09),(.26,.23,.32),CINDER,8,5);tube([(math.cos(q)*.34,math.sin(q)*.34,.1),(math.cos(q+.3)*.34,math.sin(q+.3)*.34,-.3)],[.035,.013],FIRE,4)
for side in [-1,1]:ribbon([(0,0,-.2),(side*.25,.18,-.55),(side*.15,.25,-1.3)],[.35,.35,0],(.12,.05,.04,1))
finish('cinderbolt')
# Meteor: pitted stone mass, fissures, three asymmetric sheets of blazing wake.
ellipsoid((0,0,0),(.7,.62,.7),CINDER,16,10)
for i in range(7):
    q=i*2.4;ellipsoid((math.cos(q)*.55,math.sin(q)*.5,.1),(.24,.2,.22),(.09,.025,.016,1),8,5)
for i in range(3):
    q=i*TAU/3;tube([(math.cos(q)*.45,math.sin(q)*.45,.1),(math.cos(q+.5)*.55,math.sin(q+.5)*.55,-.6),(math.cos(q+.7)*.35,math.sin(q+.7)*.35,-1.3),(0,0,-2)],[.14,.23,.14,0],FIRE,7)
    tube([(math.cos(q)*.45,math.sin(q)*.45,.1),(math.cos(q+.3)*.5,math.sin(q+.3)*.5,-.6),(0,0,-1.2)],[.055,.09,0],GOLD,6)
finish('meteor')
# Hourglass: solid cupped volumes, ornate gold feet, flowing arcane sand.
lathe((0,0,0),[(.52,.15),(.58,.22),(.4,.28),(.05,1.14),(.42,2.03),(.56,2.1),(.52,2.18)],ARCANE,24)
for y in [.21,2.1]:ring((0,y,0),.55,.06,GOLD)
for i in range(4):
    q=i*TAU/4;tube([(math.cos(q)*.5,.25,math.sin(q)*.5),(math.cos(q)*.65,1.15,math.sin(q)*.65),(math.cos(q)*.5,2.06,math.sin(q)*.5)],.04,LILAC,6)
tube([(0,.45,0),(0,1.15,0),(0,1.95,0)],[.17,.025,.2],PEARL,8);finish('arcane-restoration')
# Frozen orb: nested broad curved icy ribs with an opaque blue-white core.
ellipsoid((0,0,0),(.37,.37,.37),PEARL)
for j in range(4):
    q=j*TAU/4;pts=[(math.cos(i*.22)*.62,math.sin(i*.22)*.62*math.cos(q),math.sin(i*.22)*.62*math.sin(q)) for i in range(26)];tube(pts,[.04+.06*math.sin(i*math.pi/25) for i in range(26)],ICE,6)
finish('frozen-orb')
# Spellward: four solid inscribed tablets turn about a central crystal seal.
for i in range(4):
    q=i*TAU/4;x,z=math.cos(q)*.86,math.sin(q)*.86;box((x,1.1,z),(.42,.8,.11),ARCANE);gem((x,1.2,z+.08),.15,PEARL)
    for y in [.84,.98,1.42]:tube([(x-.15,y,z+.065),(x+.15,y,z+.065)],.018,LILAC,4)
finish('spellward')
# Pyroblast: broad overlapping scythe petals around a hot aperture, not an orange orb.
for i in range(8):
    q=i*TAU/8;pts=[(math.cos(q)*.34,math.sin(q)*.34,.15),(math.cos(q+.45)*.66,math.sin(q+.45)*.66,.02),(math.cos(q+.8)*.78,math.sin(q+.8)*.78,-.4),(math.cos(q+1)*.5,math.sin(q+1)*.5,-.7)];tube(pts,[.11,.19,.11,0],FIRE,6);tube(pts[:3],[.035,.055,0],GOLD,5)
ellipsoid((0,0,.05),(.32,.32,.25),PEARL);finish('pyroblast')
# Barrage: a cluster of three polished spear prisms, with forked trailing vanes.
for i in range(3):
    x=(i-1)*.48;crystal((x,0,-.55-i*.12),(x,0,.65),.19,ARCANE,4)
    for side in [-1,1]:crystal((x,0,-.45),(x+side*.2,.22,-.85),.1,LILAC,4)
for j in range(3):
    x=(j-1)*.48
    for k in range(4):ring((x,0,-.4+k*.19),.12,.018,LILAC,'z',12)
finish('arcane-barrage')
# Deep freeze: hollow four-walled blue ice coffin, ridged edges and faceted lid.
for side in [-1,1]:box((side*.4,0,0),(.19,1,.68),ICE);crystal((side*.45,-.55,-.3),(side*.4,.65,.32),.14,PEARL)
box((0,-.4,0),(.78,.18,.68),ICE);box((0,.4,0),(.78,.18,.68),ICE)
for side in [-1,1]:
    for i in range(4):
        y=-.35+i*.22;tube([(side*.45,y,-.32),(side*.5,y+.05,-.08),(side*.45,y-.06,.18),(side*.45,y+.06,.34)],.022,PEARL,5)
    for z in [-.3,.3]:icicle((side*.4,-.4,z),(side*.43,.65,z),.075,PEARL)
finish('deep-freeze')
# Beam emitter: a gilded segmented accelerator with nested arcane lenses.
for j in range(3):
    z=.2-j*.4;ring((0,0,z),.34+j*.06,.065,ARCANE,'z',20)
    for side in [-1,1]:crystal((side*.43,0,z-.3),(side*.3,0,z+.3),.1,LILAC)
crystal((0,0,-.9),(0,0,.6),.085,PEARL);finish('arcane-beam')
# Ice barrier: layered inward-leaning glacier slabs, substantial protected shell.
for i in range(7):
    q=i*TAU/7;crystal((math.cos(q),.02,math.sin(q)),(math.cos(q)*.65,2.15,math.sin(q)*.65),.31,ICE,5)
    crystal((math.cos(q)*1.1,.05,math.sin(q)*1.1),(math.cos(q)*.86,1.3,math.sin(q)*.86),.14,PEARL,5)
finish('ice-barrier')
# Flame wave: rolling curled sheets rising from each sector of a broad front.
for i in range(8):
    q=i*TAU/8;x,z=math.cos(q),math.sin(q);flame((x,.45,z),(.48,1.1,.4),FIRE,.9)
finish('flamewave')
# Blizzard: heavy sculpted cloud canopy and a hanging curtain of dense icy sleet.
for i in range(6):
    q=i*2.4;ellipsoid((math.cos(q)*.42,.32,math.sin(q)*.26),(.4,.26,.34),(.23,.36,.56,1),10,6)
for i in range(13):
    x=math.sin(i*2.4)*.68;z=math.cos(i*2.4)*.38;crystal((x,.05,z),(x-.1,-.65-(i%3)*.13,z),.045,PEARL,4)
finish('blizzard')
# Renewal: rooted ley geode with luminous arcane liquid flowering upward.
for i in range(5):
    q=i*TAU/5;crystal((math.cos(q)*.65,.05,math.sin(q)*.65),(math.cos(q)*.28,1.1,math.sin(q)*.28),.22,ARCANE,5)
    tube([(math.cos(q)*.8,.1,math.sin(q)*.8),(math.cos(q)*.2,1,math.sin(q)*.2),(0,1.9,0)],[.05,.09,0],LILAC,6)
gem((0,1.55,0),.27,PEARL);finish('ley-renewal')
# Glacial spike: a huge asymmetrical split crystal with chipped subsidiary facets.
crystal((0,0,-.9),(0,0,1.5),.42,ICE,5)
for i in range(5):
    q=i*TAU/5;crystal((math.cos(q)*.28,math.sin(q)*.28,-.65),(math.cos(q)*.6,math.sin(q)*.6,.25),.2,PEARL if i%2 else ICE,4)
for j in range(5):
    q=j*TAU/5;tube([(math.cos(q)*.31,math.sin(q)*.31,-.55),(math.cos(q+.15)*.35,math.sin(q+.15)*.35,-.1),(math.cos(q)*.22,math.sin(q)*.22,.55),(0,0,1.4)],[.03,.025,.018,0],PEARL,5)
    for k in range(2):crystal((math.cos(q)*.32,math.sin(q)*.32,-.3+k*.3),(math.cos(q+.3)*.58,math.sin(q+.3)*.58,-.45+k*.3),.07,ICE,4)
finish('glacial-spike')
# Comets: three separate dense icy nuclei and long swept luminous tails.
for j in range(3):
    x=(j-1)*.48;y=(j%2)*.35;ellipsoid((x,y,-j*.25),(.22,.22,.27),PEARL,10,6)
    for s in [-1,1]:tube([(x+s*.12,y,-j*.25),(x+s*.2,y+.12,-.6-j*.25),(x+s*.12,y+.16,-1.4-j*.25)],[.1,.09,0],ICE,6)
finish('comet-shower')
# Prismatic guard: three broad jewel-colored refractive sails around the recipient.
for i,c in enumerate([(1,.24,.24,1),(.2,.86,1,1),(1,.74,.15,1)]):
    q=i*TAU/3;x,z=math.cos(q),math.sin(q);crystal((x,.1,z),(x*.65,2.5,z*.65),.36,c,4)
    tube([(x,.15,z),(x*1.1,1.2,z*1.1),(x*.65,2.5,z*.65)],[.025,.05,0],PEARL,5)
for i in range(3):
    q=i*TAU/3;x,z=math.cos(q),math.sin(q)
    for h in [.45,.8,1.15,1.5]:
        ring((x,h,z+.08),.12,.018,PEARL,'z',12)
        gem((x,h+.14,z+.1),.045,PEARL)
finish('prismatic-guard')
# Lightning: thick, fully branched fork with tiny tertiary discharges.
for i in range(5):
    q=i*TAU/5;pts=[(0,0,.3),(math.cos(q)*.25,math.sin(q)*.25,.1),(math.cos(q+.4)*.35,math.sin(q+.4)*.35,-.3),(math.cos(q)*.8,math.sin(q)*.8,-.6)];tube(pts,[.07,.065,.035,0],PEARL,5);tube([pts[1],(pts[2][0]*1.5,pts[2][1]*1.5,.2),(pts[3][0],pts[3][1],.3)],[.035,.02,0],(.52,.57,1,1),4)
for i in range(8):
    q=i*TAU/8;tube([(math.cos(q)*.35,math.sin(q)*.35,-.2),(math.cos(q+.2)*.58,math.sin(q+.2)*.58,.05),(math.cos(q+.1)*.76,math.sin(q+.1)*.76,-.03)],[.025,.015,0],GOLD,4)
finish('chain-lightning')
# Flash freeze: a ground flower of overlapping wide crystalline plates.
for i in range(8):
    q=i*TAU/8;crystal((math.cos(q)*.2,.1,math.sin(q)*.2),(math.cos(q),.28,math.sin(q)),.16,PEARL if i%2 else ICE,4)
for i in range(8):
    q=i*TAU/8;crystal((math.cos(q)*.65,.16,math.sin(q)*.65),(math.cos(q)*.8,.55,math.sin(q)*.8),.055,PEARL,5)
    tube([(math.cos(q)*.3,.14,math.sin(q)*.3),(math.cos(q+.1)*.62,.22,math.sin(q+.1)*.62),(math.cos(q),.28,math.sin(q))],[.018,.022,0],PEARL,4)
finish('flash-freeze')
# Inferno: a twisting three-strand molten jet, with scalloped orange outer flame.
for j in range(3):
    pts=[(math.cos(i*.55+j*TAU/3)*(.14+i*.015),math.sin(i*.55+j*TAU/3)*(.14+i*.015),.6-i*.18) for i in range(13)];tube(pts,[.12*(1-i/14) for i in range(13)],FIRE if j else GOLD,7)
crystal((0,0,-.8),(0,0,.8),.11,PEARL);finish('inferno-beam')
# Blinkward: thick swirling portals, fractured mirror surfaces and a diamond threshold.
for side in [-1,1]:
    x=side*.75;ring((x,1.05,0),.72,.075,ARCANE,'z',32)
    for j in range(6):
        q=j*TAU/6;crystal((x+math.cos(q)*.66,1.05+math.sin(q)*.66,0),(x+math.cos(q+.4)*.8,1.05+math.sin(q+.4)*.8,0),.07,LILAC,4)
finish('blinkward')
# Starfire: six sculpted solar blades around a faceted white star heart.
ellipsoid((0,0,0),(.25,.25,.2),PEARL,12,8)
for i in range(6):
    q=i*TAU/6;crystal((math.cos(q)*.15,math.sin(q)*.15,0),(math.cos(q)*.87,math.sin(q)*.87,0),.16,GOLD,4);tube([(math.cos(q)*.2,math.sin(q)*.2,.05),(math.cos(q+.2)*.6,math.sin(q+.2)*.6,.05)],[.06,0],FIRE,5)
finish('starfire')
# Winterstorm: three wide hooked ice scythes revolving around an empty centre.
for j in range(3):
    q=j*TAU/3;pts=[(math.cos(q+i*.22)*(.35+i*.018),-.7+i*.13,math.sin(q+i*.22)*(.35+i*.018)) for i in range(12)];tube(pts,[.01]+[.14]*8+[.09,.04,0],ICE,5)
finish('winterstorm')
# Tempest: torn spiralling magic sheets, thick at the foot and thinning above.
for j in range(3):
    pts=[(math.cos(i*.28+j*TAU/3)*(1-i*.035),i*.13,math.sin(i*.28+j*TAU/3)*(1-i*.035)) for i in range(16)];ribbon(pts,[.32*(1-i/16) for i in range(16)],ARCANE);tube(pts,[.04*(1-i/16) for i in range(16)],LILAC,5)
finish('arcane-tempest')
# Archmage aegis: five tall broad engraved crystal bastions, crowned by an archstone.
for i in range(5):
    q=i*TAU/5;crystal((math.cos(q),.1,math.sin(q)),(math.cos(q)*.75,2.2,math.sin(q)*.75),.26,ARCANE,5);gem((math.cos(q)*.95,1.25,math.sin(q)*.95),.18,PEARL)
gem((0,2.5,0),.5,LILAC);finish('aegis-of-the-archmage')
# Volley: seven narrow polished prism vanes form a pointed sevenfold kite.
for i in range(7):
    q=i*TAU/7;crystal((math.cos(q)*.4,math.sin(q)*.4,-.5),(0,0,.75),.1,ARCANE if i%2 else LILAC,4)
crystal((0,0,-.4),(0,0,.85),.11,PEARL)
for i in range(7):
    q=i*TAU/7;tube([(math.cos(q)*.43,math.sin(q)*.43,-.52),(math.cos(q+.1)*.28,math.sin(q+.1)*.28,.06),(0,0,.75)],[.023,.018,0],PEARL,5)
finish('arcane-volley')
# Combustion: unstable pyre wrapped in charred crust, white-hot jets splitting it.
ellipsoid((0,0,0),(.48,.48,.45),CINDER,14,8)
for i in range(6):
    q=i*TAU/6;pts=[(math.cos(q)*.2,math.sin(q)*.2,.45),(math.cos(q+.4)*.58,math.sin(q+.4)*.58,.15),(math.cos(q+.65)*.62,math.sin(q+.65)*.62,-.4),(math.cos(q+.9)*.4,math.sin(q+.9)*.4,-.9)];tube(pts,[.1,.18,.12,0],FIRE,7);tube(pts[:3],[.045,.05,0],PEARL,5)
finish('combustion')
# Shatter: three layers of broad fractured shell plates bursting away from an empty body.
for j in range(3):
    for i in range(7):
        q=i*TAU/7+j*.35;rr=.48+j*.08;crystal((math.cos(q)*rr,.2+j*.45,math.sin(q)*rr),(math.cos(q)*(rr+.5),.5+j*.52,math.sin(q)*(rr+.5)),.15,ICE if j%2 else PEARL,4)
finish('shatter')
export('mage')
