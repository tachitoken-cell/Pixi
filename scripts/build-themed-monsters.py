"""Build the three dungeon bestiaries in Blender, preserving editable rigid rigs.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-themed-monsters.py -- --render --optimize
Metres, Y-up/+Z-front on export. Attack contact is exactly halfway; separate
idle/walk/auto/special/death clips retain anticipation, follow-through and settle.
"""
import bpy, json, math, struct, subprocess, sys, tempfile
from pathlib import Path
from mathutils import Vector, Euler
ROOT=Path(__file__).resolve().parents[1]
LEGACY='--legacy-bosses' in sys.argv
PACK='legacy-dungeon-bosses' if LEGACY else 'themed-monsters'
EXPORT=ROOT/f'public/models/{PACK}.glb'
SOURCE=ROOT/f'assets/source/{PACK}.blend'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
HEX={'ink':'20282F','iron':'3C424A','steel':'6E7A80','silver':'AFB4AC','bone':'DDD0A2','ivory':'F3E6BF','gold':'B9954C','goldlight':'E8C56E','copper':'956543','leather':'61483B','plague':'596744','moss':'7D8A46','venom':'B5EF62','flesh':'97906F','suture':'514557','blood':'744C57','purple':'625174','basalt':'373B44','coal':'22232A','slag':'784F46','ember':'EA703D','fire':'FFBB5F','hot':'FFE0A0','jade':'4C958A','jadelight':'8CC8AD','jadedark':'315857','robe':'304F62','silk':'577B8C','ghost':'B3EEE4','cyan':'70DCCD','red':'954C4E','cream':'D3C9AD'}
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
COLORS={k:tuple(linear(int(v[i:i+2],16)/255) for i in (0,2,4))+(1,) for k,v in HEX.items()}
def xyz(x,y,z):return(x,-z,y)
parts={};configs={};counts={};active='';current=''
GLOW_TINTS={'venom','fire','hot','ghost','cyan'}
def monster(name,theme,style,scale=1):
 global active
 active=name;parts[name]={};configs[name]={'theme':theme,'style':style,'scale':scale};counts[name]=0

def part(name,pivot,parent='body'):
 global current
 current=name;parts[active][name]={'pivot':pivot,'parent':None if name=='body' else parent,'vertices':[],'faces':[],'colors':[],'materials':[]}
def polygon(tint,vertices,faces):
 data=parts[active][current];pivot=data['pivot'];base=len(data['vertices'])
 data['vertices'] += [xyz(*(v[i]-pivot[i] for i in range(3))) for v in vertices]
 for face in faces:
  data['faces'].append(tuple(base+i for i in face));data['colors'].append(COLORS[tint]);data['materials'].append(1 if tint in GLOW_TINTS else 0)
 counts[active]+=1

def box(tint,x,y,z,w,h,d,rx=0,ry=0,rz=0):
 rotation=Euler((rx,ry,rz),'XYZ').to_matrix()
 vertices=[rotation@Vector((a*w/2,b*h/2,c*d/2))+Vector((x,y,z)) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 polygon(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
def orb(tint,x,y,z,rx,ry,rz,n=10,rings=6):
 vertices=[]
 for row in range(rings+1):
  a=math.pi*row/rings
  for col in range(n):
   b=math.tau*col/n;vertices.append((x+rx*math.sin(a)*math.cos(b),y+ry*math.cos(a),z+rz*math.sin(a)*math.sin(b)))
 faces=[(r*n+c,r*n+(c+1)%n,(r+1)*n+(c+1)%n,(r+1)*n+c) for r in range(rings) for c in range(n)]
 polygon(tint,vertices,faces)
def rod(tint,a,b,r1,r2=None,n=8):
 r2=r1 if r2 is None else r2;a=Vector(a);b=Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
 if u.length<.01:u=axis.cross(Vector((1,0,0)))
 u.normalize();v=axis.cross(u);vertices=[]
 for p,r in [(a,r1),(b,r2)]:
  vertices += [p+r*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v) for i in range(n)]
 polygon(tint,vertices,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
def ring(tint,x,y,z,r,thick,n=16,vertical=False):
 for i in range(n):
  a=i*math.tau/n;b=(i+1)*math.tau/n
  p=(x+r*math.cos(a),y+r*math.sin(a),z) if vertical else (x+r*math.cos(a),y,z+r*math.sin(a))
  q=(x+r*math.cos(b),y+r*math.sin(b),z) if vertical else (x+r*math.cos(b),y,z+r*math.sin(b))
  rod(tint,p,q,thick,n=6)
def spike(tint,a,b,r=.12):rod(tint,a,b,r,.015)
def eye(x,y,z,r=.06,color='venom'):
 orb('ink',x,y,z,r*1.7,r*1.6,r*.65,8,4);orb(color,x,y+.004,z+r*.4,r,r,r*.45,8,4)
def rune(x,y,z,color='gold',size=.20):
 for dx,dy,w,h in [(0,0,.13,.8),(-.23,.22,.38,.12),(.23,-.15,.38,.12),(-.16,-.32,.12,.32)]:box(color,x+dx*size,y+dy*size,z,w*size,h*size,.025)
def vial(x,y,z,color='venom',scale=1):
 orb(color,x,y,z,.075*scale,.125*scale,.075*scale,8,4);rod('iron',(x,y+.075*scale,z),(x,y+.17*scale,z),.05*scale);box('copper',x,y+.19*scale,z,.12*scale,.05*scale,.12*scale)
def ribbed(tint,x,y,z,w,h,d,rows=5):
 for n in range(rows):box(tint,x,y+n*h/rows,z,w*(1-.08*(n%2)),h/rows*.72,d)
def limbs(armor='iron',trim='gold',legs=True,robe=False):
 for side,label in [(-1,'left-arm'),(1,'right-arm')]:
  part(label,(side*.59,1.93,0));orb(armor,side*.66,1.91,0,.29,.24,.28)
  box(trim,side*.67,2.065,.015,.47,.08,.50)
  rod(armor,(side*.68,1.89,0),(side*.72,1.34,.03),.15,.13)
  part('left-hand' if side<0 else 'right-hand',(side*.72,1.42,.03),label)
  box(armor,side*.74,1.16,.08,.29,.43,.29);box(trim,side*.74,1.22,.245,.30,.095,.04)
  for j in range(3):box('bone' if armor=='plague' else trim,side*.74+(j-1)*.085,.91,.18,.065,.18,.10)
 if legs:
  for side,label in [(-1,'left-leg'),(1,'right-leg')]:
   part(label,(side*.25,.95,0));box(armor,side*.26,.67,0,.32,.54,.35)
   box(trim,side*.26,.64,.195,.25,.16,.07)
   part(label+'-shin',(side*.26,.44,0),label);box(armor,side*.26,.28,.025,.31,.36,.35);box(trim,side*.26,.105,.18,.38,.21,.55)
 if robe:
  for side in [-1,1]:
   part('robe-'+str(side),(side*.24,1.1,-.13))
   for j in range(5):box('robe',side*(.22+j*.035),.96-j*.16,-.09,.29+j*.03,.21,.44)
   rod('gold',(side*.38,.18,.15),(side*.26,1.06,.16),.025)
def humanoid_body(armor='iron',trim='gold'):
 part('body',(0,1.32,0));orb(armor,0,1.55,0,.53,.59,.32)
 box(armor,0,1.85,.02,1.02,.35,.58);box(trim,0,1.06,.02,.83,.12,.55)
 for x in [-.30,0,.30]:box(trim,x,1.10,.32,.13,.11,.045)
 part('head',(0,2.08,.01));orb(armor,0,2.28,.01,.32,.35,.29)
 eye(-.12,2.33,.284,.055,'fire' if armor in ('basalt','coal') else 'cyan');eye(.12,2.33,.284,.055,'fire' if armor in ('basalt','coal') else 'cyan')

exec(compile((ROOT/'scripts/themed-monster-style.py').read_text(), 'themed-monster-style.py', 'exec'), globals())

if LEGACY:
 exec(compile((ROOT/'scripts/legacy-dungeon-bosses.py').read_text(), 'legacy-dungeon-bosses.py', 'exec'), globals())
else:
 # Plagueworks: bone arachnids, an apothecary and a stitched siege creature.
 monster('crypt-weaver','plagueworks','spider',1)
 part('body',(0,.72,-.1));orb('suture',0,.75,-.30,.53,.39,.63)
 part('abdomen',(0,.8,-.52));orb('plague',0,.90,-.59,.65,.53,.73)
 for row in range(5):
  z=-1.03+row*.23
  for side in [-1,1]:rod('bone',(side*.12,1.38,z),(side*.52,1.11,z),.04)
 for x,y,z in [(-.33,1.27,-.5),(.34,1.16,-.8),(0,1.45,-.63)]:orb('venom',x,y,z,.10,.08,.10,8,4)
 part('head',(0,.75,.36));orb('iron',0,.8,.48,.43,.32,.4)
 for x,y,r in [(-.22,.88,.075),(.22,.88,.075),(-.09,1.02,.05),(.09,1.02,.05),(-.33,.77,.045),(.33,.77,.045)]:eye(x,y,.81,r)
 for side in [-1,1]:
  part('fang-'+str(side),(side*.22,.66,.66),'head');rod('bone',(side*.22,.66,.68),(side*.3,.48,1),.095,.055);spike('venom',(side*.3,.48,1),(side*.12,.36,1.11),.06)
 for n in range(8):
  side=1 if n%2 else -1;z=.45-(n//2)*.34;knee=(side*(1.05+.10*(n//2)),.8,z+.13*(1-n//2))
  part('leg-'+str(n),(side*.31,.72,z));rod('bone',(side*.31,.72,z),knee,.085,.055);orb('suture',*knee,.1,.1,.1,8,4)
  part('leg-tip-'+str(n),knee,'leg-'+str(n));rod('iron',knee,(side*1.38,.12,z+.3*(1-n//2)),.065,.025);box('bone',side*.93,.84,z,.20,.065,.10)

 monster('plague-alchemist','plagueworks','caster',1)
 humanoid_body('plague','copper');current='body'
 for i in range(7):box('leather',-.34+i*.113,1.47,.322,.10,.76,.045)
 for i in range(5):vial(-.30+i*.15,1.21,.41,scale=.85)
 for side in [-1,1]:
  rod('copper',(side*.30,1.42,-.39),(side*.30,2.11,-.39),.17)
  orb('venom',side*.3,1.8,-.405,.13,.25,.13)
  for y in [1.48,1.78,2.06]:ring('iron',side*.3,y,-.39,.18,.03,8)
 current='head';box('leather',0,2.43,.04,.73,.29,.62)
 for side in [-1,1]:
  eye(side*.155,2.35,.337,.08);ring('copper',side*.155,2.35,.37,.115,.024,10,True)
 rod('bone',(0,2.23,.25),(0,2.10,.82),.15,.045);box('iron',0,2.61,0,.76,.09,.68);box('leather',0,2.70,-.02,.52,.12,.44)
 limbs('plague','copper',True)
 current='right-hand';rod('leather',(.75,.75,.23),(.75,2.02,.23),.055);vial(.75,2.09,.23,scale=2.4)
 part('coat',(0,1.48,-.27))
 for j in range(6):box('leather',0,1.23-j*.15,-.32,.79+j*.018,.19,.12)
 for x in [-.30,0,.30]:box('copper',x,.42,-.405,.055,.20,.025)

 monster('broodmother-vex','plagueworks','spider',1.65)
 part('body',(0,.85,0));orb('suture',0,.89,0,.63,.58,.83)
 part('abdomen',(0,1,-.72));orb('blood',0,1.15,-.90,.86,.73,1.02)
 for n in range(7):
  z=-1.64+n*.25
  for side in [-1,1]:
   rod('bone',(side*.11,1.76,z),(side*.63,1.45,z),.055)
   spike('bone',(side*.64,1.38,z),(side*.96,1.6,z-.13),.09)
 for n in range(11):
  a=n*2.4;orb('venom',.56*math.sin(a),1.52+.11*math.cos(a),-.98+.48*math.cos(a),.12,.15,.12,8,4)
 part('head',(0,.99,.63));orb('bone',0,1.12,.76,.44,.4,.39)
 for side in [-1,1]:
  eye(side*.21,1.25,1.087,.11);eye(side*.31,1.04,1.075,.065)
  for j in range(3):spike('gold',(side*(.16+j*.12),1.4,.7),(side*(.19+j*.20),1.9-j*.11,.59),.08)
  part('fang-'+str(side),(side*.28,.91,.96),'head');rod('bone',(side*.28,.91,.96),(side*.39,.62,1.29),.115,.085);spike('venom',(side*.39,.62,1.29),(side*.16,.46,1.4),.095)
 for n in range(8):
  side=1 if n%2 else -1;z=.62-(n//2)*.44;knee=(side*(1.21+.11*(n//2)),1.17,z+.20*(1-n//2))
  part('leg-'+str(n),(side*.37,.92,z));rod('bone',(side*.37,.92,z),knee,.14,.11)
  for step in [.35,.7]:orb('gold',side*(.37+(abs(knee[0])-.37)*step),.92+.25*step,z,.09,.09,.11,8,4)
  part('leg-tip-'+str(n),knee,'leg-'+str(n));rod('suture',knee,(side*1.84,.09,z+.3*(1-n//2)),.10,.025)
  spike('bone',knee,(knee[0]+side*.12,knee[1]+.3,knee[2]),.11)

 monster('plague-abomination','plagueworks','heavy',1.35)
 humanoid_body('flesh','iron');current='body';orb('flesh',0,1.38,.06,.75,.8,.5)
 for row in range(4):
  y=1.08+row*.23;box('suture',0,y,.553,.78,.04,.035,rz=.13)
  for x in [-.29,-.10,.1,.29]:rod('bone',(x-.03,y-.065,.58),(x+.03,y+.065,.58),.018)
 for side in [-1,1]:
  rod('iron',(side*.43,1.25,-.47),(side*.43,2.48,-.47),.26)
  rod('venom',(side*.43,1.42,-.49),(side*.43,2.29,-.49),.21)
  for y in [1.32,1.83,2.42]:ring('copper',side*.43,y,-.47,.28,.045,10)
  for j in range(3):rod('copper',(side*.43,2.5,-.47),(side*(.67+j*.09),2.52+j*.12,-.26),.045)
 current='head';box('iron',-.10,2.38,.29,.42,.25,.05);eye(.15,2.35,.35,.09)
 for side in [-1,1]:rod('suture',(side*.10,2.16,.29),(side*.20,2.30,.31),.027)
 limbs('flesh','iron',True)
 current='left-arm';orb('iron',-.75,1.78,0,.4,.38,.36)
 for j in range(4):spike('bone',(-.81-j*.06,1.90,-.11+j*.12),(-1.17-j*.04,2.16,-.14+j*.12),.10)
 current='left-hand';box('iron',-.79,1.08,.10,.51,.50,.51)
 for z in [-.06,.1,.26]:rod('copper',(-1.07,.88,z),(-1.07,1.29,z),.055)
 current='right-hand';rod('iron',(.77,1.09,.20),(.77,1.05,.88),.07);box('steel',.77,.96,1.03,.43,.48,.18);box('bone',.77,.74,1.03,.46,.08,.2)

 # Emberfall: a plated lava centipede and forge guardians with distinct weapons.
 monster('slag-crawler','emberfall','crawler',1)
 part('body',(0,.47,0));orb('coal',0,.5,-.11,.5,.32,.96)
 for n in range(6):
  z=-.98+n*.35
  part('segment-'+str(n),(0,.51,z))
  orb('slag',0,.58,z,.51,.33,.24,10,4);rod('fire',(-.43,.64,z+.19),(.43,.64,z+.19),.035)
  for side in [-1,1]:spike('basalt',(side*.31,.73,z),(side*.53,1.09,z-.13),.12)
 for n in range(12):
  side=1 if n%2 else -1;z=-.88+(n//2)*.32
  part('leg-'+str(n),(side*.37,.5,z));rod('copper',(side*.37,.5,z),(side*.80,.38,z+.10),.08,.065);rod('basalt',(side*.80,.38,z+.1),(side*.93,.07,z+.20),.07,.025)
 part('head',(0,.58,.98));box('basalt',0,.63,1.02,.67,.42,.47)
 for side in [-1,1]:
  eye(side*.20,.71,1.275,.08,'fire');part('fang-'+str(side),(side*.26,.48,1.19),'head');rod('ember',(side*.26,.48,1.19),(side*.4,.44,1.51),.085,.045);spike('hot',(side*.4,.44,1.51),(side*.13,.44,1.65),.06)

 monster('furnace-revenant','emberfall','melee',1.1)
 humanoid_body('coal','copper');current='body'
 box('fire',0,1.62,.338,.42,.61,.06)
 for n in range(5):box('iron',-.24+n*.12,1.62,.384,.046,.69,.05)
 for side in [-1,1]:
  box('basalt',side*.39,1.58,.27,.19,.76,.18)
  for y in [1.28,1.55,1.82]:orb('copper',side*.41,y,.38,.036,.036,.026,6,4)
 current='head';box('iron',0,2.25,.28,.60,.44,.10)
 for x in [-.19,-.06,.06,.19]:box('fire',x,2.33,.344,.046,.18,.035)
 rod('iron',(-.23,2.53,-.05),(-.23,2.81,-.05),.12);rod('iron',(.23,2.53,-.05),(.23,2.97,-.05),.12)
 limbs('basalt','copper',True)
 current='right-hand';rod('iron',(.74,.8,.25),(.74,1.84,.25),.06);box('steel',.90,1.85,.25,.66,.46,.13);box('fire',1.21,1.85,.25,.08,.42,.16)
 current='left-hand';box('iron',-.75,1.25,.30,.51,.7,.15);rune(-.75,1.30,.40,'ember',.48)

 monster('anvil-warden','emberfall','hammer',1.3)
 humanoid_body('basalt','gold');current='body'
 for j in range(5):box('steel',0,1.27+j*.14,.35,.88-j*.09,.12,.12)
 box('gold',0,1.84,.43,.23,.28,.04);rune(0,1.84,.47,'fire',.24)
 for side in [-1,1]:
  for row in range(3):box('iron',side*.35,1.01-row*.14,.23,.31,.17,.25,rz=-side*.15)
 current='head';box('gold',0,2.44,.28,.66,.09,.1);box('iron',0,2.23,.29,.59,.36,.08)
 for side in [-1,1]:
  eye(side*.16,2.37,.353,.058,'hot');spike('gold',(side*.27,2.47,.01),(side*.43,2.87,-.11),.10)
 for y in [2.1,2.2,2.29]:box('steel',0,y,.352,.23,.035,.04)
 limbs('iron','gold',True)
 for side,label in [(-1,'left-arm'),(1,'right-arm')]:
  current=label;box('basalt',side*.67,1.99,.01,.68,.32,.64)
  for j in range(3):box('gold',side*(.44+j*.21),2.17,.02,.10,.04,.65)
  for z in [-.18,.02,.21]:orb('goldlight',side*.92,2.02,z,.04,.04,.035,6,4)
 current='right-hand';rod('leather',(.76,.59,.30),(.76,2.35,.30),.08)
 for y in [1.02,1.24,1.47,1.7]:ring('gold',.76,y,.3,.094,.026,8)
 box('iron',.76,2.37,.30,1.25,.57,.64);box('gold',.76,2.37,.65,1.27,.61,.08)
 for x in [.2,.76,1.31]:rune(x,2.38,.70,'fire',.35)
 box('steel',.76,2.70,.30,1.48,.11,.72)
 part('tabard',(0,1.08,.32))
 for j in range(5):box('red',0,.94-j*.13,.33,.36,.17,.075)
 rune(0,.66,.39,'gold',.47)

 monster('pyrelord-ignivar','emberfall','king',1.7)
 humanoid_body('basalt','gold');current='body'
 orb('fire',0,1.65,.22,.26,.34,.21)
 for side in [-1,1]:
  for j in range(4):box('coal',side*(.27+j*.035),1.32+j*.20,.37,.27,.14,.17,rz=-side*.25)
  for j in range(3):spike('basalt',(side*.56,1.98,-.12+j*.12),(side*(.94+j*.06),2.52-j*.1,-.3+j*.12),.16)
 current='head';box('coal',0,2.22,.27,.56,.21,.13);eye(-.15,2.40,.32,.08,'hot');eye(.15,2.40,.32,.08,'hot')
 for side in [-1,1]:
  rod('gold',(side*.24,2.46,0),(side*.51,2.68,-.10),.12,.09);rod('ember',(side*.51,2.68,-.1),(side*.53,2.97,.03),.09,.035);spike('hot',(side*.53,2.97,.03),(side*.35,3.11,.18),.044)
 for x in [-.17,0,.17]:spike('gold',(x,2.57,.08),(x*1.2,2.9-(.12 if x else 0),.07),.07)
 limbs('basalt','gold',True)
 current='right-hand';rod('gold',(.74,.73,.3),(.74,1.65,.3),.07);rod('fire',(.74,1.51,.3),(.74,2.57,.3),.17,.025);box('gold',.74,1.59,.3,.67,.10,.18)
 current='left-hand';orb('fire',-.79,1.14,.26,.25,.25,.25)
 for n in range(6):
  a=n*math.tau/6;spike('hot',(-.79+.2*math.cos(a),1.18+.2*math.sin(a),.28),(-.79+.38*math.cos(a),1.18+.38*math.sin(a),.28),.046)
 part('cape',(0,1.94,-.31))
 for j in range(7):
  box('red',0,1.79-j*.22,-.39-j*.033,.93+j*.054,.28,.11)
  for side in [-1,1]:box('gold',side*(.42+j*.027),1.79-j*.22,-.46-j*.033,.045,.26,.03)

 # Veilhaven: lantern robes, engraved jade, a bronze bell and an astral veil.
 monster('lantern-wraith','veilhaven','float',1.1)
 humanoid_body('robe','silver');current='body'
 for j in range(6):box('silk',0,1.25-j*.15,.06,.66+j*.045,.2,.48-j*.018)
 current='head';box('robe',0,2.39,-.02,.76,.50,.55);box('ink',0,2.26,.282,.43,.37,.05);eye(-.12,2.32,.329,.05,'ghost');eye(.12,2.32,.329,.05,'ghost')
 limbs('robe','silver',False,True)
 current='right-hand';rod('gold',(.75,1.07,.15),(.75,.68,.15),.025)
 part('lantern',(.75,.73,.15),'right-hand');orb('ghost',.75,.43,.15,.16,.22,.16,8,4)
 for x in [-1,1]:
  for z in [-1,1]:rod('gold',(.75+x*.18,.18,.15+z*.18),(.75+x*.18,.65,.15+z*.18),.027)
 box('gold',.75,.17,.15,.45,.065,.45);box('gold',.75,.68,.15,.45,.06,.45)
 part('veil',(0,2.5,-.23),'head')
 for j in range(7):box('silk',0,2.38-j*.2,-.29,.65-j*.032,.24,.07)

 monster('jade-sentinel','veilhaven','melee',1.15)
 humanoid_body('jade','gold');current='body'
 for row in range(5):
  for col in range(5):box('jadelight' if (row+col)%3==0 else 'jade',-.36+col*.18,1.26+row*.14,.343,.15,.11,.065)
 for x in [-.38,.38]:rod('gold',(x,1.20,.38),(x,1.97,.38),.025)
 rune(0,1.61,.42,'ghost',.40)
 current='head';box('jadedark',0,2.48,.03,.85,.12,.67);box('gold',0,2.56,.03,.72,.05,.58)
 for side in [-1,1]:box('jade',side*.27,2.25,.10,.15,.52,.38,rz=-side*.12)
 box('jadelight',0,2.12,.325,.32,.11,.055);box('gold',0,2.42,.326,.19,.11,.045)
 limbs('jade','gold',True)
 current='right-hand';rod('gold',(.74,.45,.32),(.74,2.77,.32),.049)
 rod('jadelight',(.74,2.60,.32),(.74,3.12,.32),.18,.01);box('gold',.74,2.56,.32,.49,.07,.12)
 current='left-hand';box('jadedark',-.77,1.28,.30,.62,.86,.12);box('gold',-.77,1.28,.382,.51,.74,.04);box('jade',-.77,1.28,.408,.43,.66,.035);rune(-.77,1.28,.44,'ghost',.50)

 monster('bellkeeper-shen','veilhaven','bell',1.45)
 humanoid_body('robe','gold');current='body'
 for j in range(6):box('silk',0,1.31-j*.14,.08,.74+j*.065,.21,.52)
 for side in [-1,1]:
  for j in range(6):orb('gold',side*(.12+.04*j),1.92-j*.09,.34,.06,.06,.06,8,4)
 current='head';orb('ghost',0,2.28,.04,.29,.31,.27);box('robe',0,2.51,.01,.88,.12,.72)
 for j in range(3):box('gold',0,2.60+j*.07,.01,.65-j*.12,.08,.47-j*.08)
 box('gold',0,2.18,.32,.08,.19,.04)
 limbs('robe','gold',False,True)
 current='left-hand';rod('leather',(-.75,.85,.21),(-.75,1.77,.21),.05);orb('gold',-.75,1.80,.21,.19,.13,.13)
 part('bell',(.75,1.02,.23),'right-hand')
 for j in range(6):
  y=.86-j*.105;r=.17+j*.045;rod('gold',(.75,y-.10,.24),(.75,y,.24),r+.035,r,12)
 ring('goldlight',.75,.24,.24,.49,.04,16);orb('iron',.75,.25,.24,.08,.12,.08)
 for n in range(8):
  a=n*math.tau/8;x=.75+.31*math.cos(a);z=.24+.31*math.sin(a)
  rod('copper',(x,.39,z),(x,.67,z),.018)
 part('banner',(0,1.96,-.26))
 for j in range(8):
  box('red',0,1.9-j*.19,-.32,.47,.22,.08)
  rune(0,1.73-j*.19,-.375,'gold',.15)

 monster('veiled-abbess','veilhaven','abbess',1.7)
 humanoid_body('robe','gold');current='body'
 for j in range(8):
  box('silk',0,1.46-j*.16,.01,.63+j*.08,.23,.46+j*.02)
  for side in [-1,1]:box('gold',side*(.26+j*.04),1.46-j*.16,.27+j*.01,.035,.20,.035)
 for y in [1.22,1.43,1.64,1.85]:rune(0,y,.36,'ghost',.20)
 current='head';box('ivory',0,2.26,.21,.43,.46,.18)
 for x in [-.19,-.10,0,.10,.19]:box('ghost',x,2.20,.325,.024,.47,.018)
 ring('gold',0,2.4,-.23,.56,.034,24,True)
 for n in range(12):
  a=n*math.tau/12;x=.58*math.cos(a);y=2.4+.58*math.sin(a)
  spike('gold',(x,y,-.23),(x*1.24,2.4+(y-2.4)*1.24,-.23),.042)
  orb('cyan',x,y,-.215,.04,.04,.03,8,4)
 box('gold',0,2.53,.26,.58,.085,.06)
 for x in [-.22,0,.22]:spike('gold',(x,2.56,.06),(x*1.2,2.90-(.1 if x else 0),.05),.065)
 limbs('silk','gold',False,True)
 for side,label in [(-1,'left-arm'),(1,'right-arm')]:
  current=label
  for j in range(5):box('robe',side*(.62+j*.03),1.71-j*.16,-.09,.49+j*.04,.22,.38)
 part('veil',(0,2.61,-.15),'head')
 for j in range(10):
  box('cream',0,2.52-j*.20,-.32,.73+j*.025,.25,.085)
  for side in [-1,1]:box('gold',side*(.34+j*.012),2.52-j*.20,-.38,.032,.24,.025)
 part('censer',(-.74,1.07,.19),'left-hand');rod('gold',(-.74,1.05,.19),(-.74,.64,.19),.021);orb('cyan',-.74,.48,.19,.19,.21,.19,10,5)
 for n in range(6):
  a=n*math.tau/6;rod('gold',(-.74+.16*math.cos(a),.30,.19+.16*math.sin(a)),(-.74+.16*math.cos(a),.65,.19+.16*math.sin(a)),.018)
 ring('gold',-.74,.28,.19,.20,.029,12);ring('gold',-.74,.66,.19,.20,.029,12)
 current='right-hand';rod('gold',(.74,.68,.2),(.74,2.36,.2),.042);ring('gold',.74,2.42,.2,.2,.035,12,True);orb('ghost',.74,2.42,.2,.10,.10,.07,8,4)

 # Additional anatomies and corrected shared hand/weapon authoring.
 exec(compile((ROOT/'scripts/themed-creature-morphology.py').read_text(), 'themed-creature-morphology.py', 'exec'), globals())

# Scale source geometry and pivots together; gameplay roots stay identity.
for name,groups in parts.items():
 scale=configs[name]['scale']
 for data in groups.values():
  data['pivot']=tuple(v*scale for v in data['pivot']);data['vertices']=[tuple(v*scale for v in point) for point in data['vertices']]
library=bpy.context.scene;library.name='Themed bestiary - editable models and NLA actions';library.render.fps=30;library.frame_start=0;library.frame_end=60
palette=bpy.data.materials.new('Dungeon monster vertex palette');palette.use_nodes=True
shader=palette.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.7
color=palette.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='MonsterTint';palette.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
glows={}
for theme,tint in ([('rootvault','heartlight'),('cindercrypt','fire'),('frosthollow','iceglow'),('nightroot','voidlight')] if LEGACY else [('plagueworks','venom'),('emberfall','fire'),('veilhaven','cyan')]):
 mat=palette.copy();mat.name=theme+' soul light';sh=mat.node_tree.nodes.get('Principled BSDF');sh.inputs['Emission Color'].default_value=COLORS[tint];sh.inputs['Emission Strength'].default_value=.7;glows[theme]=mat
objects={};roots={};bases={}
for name,groups in parts.items():
 root=bpy.data.objects.new(name,None);library.collection.objects.link(root);roots[name]=root;objects[name]={};bases[name]={}
 root['axes']='metres; exported Y-up, +Z-front; ground origin';root['authoring']='Original Blender articulated mesh; five authored clips';root['theme']=configs[name]['theme'];root['attack_contact']=.5
 for label,data in groups.items():
  mesh=bpy.data.meshes.new(name+'-'+label);mesh.from_pydata(data['vertices'],[],data['faces']);mesh.update();mesh.materials.append(palette);mesh.materials.append(glows[configs[name]['theme']])
  colors=mesh.color_attributes.new(name='MonsterTint',type='BYTE_COLOR',domain='CORNER')
  for face,tint,mat in zip(mesh.polygons,data['colors'],data['materials']):
   face.material_index=mat
   for i in face.loop_indices:colors.data[i].color=tint
  obj=bpy.data.objects.new(name+'-'+label,mesh);library.collection.objects.link(obj);objects[name][label]=obj
  parent=data['parent'];obj.parent=objects[name][parent] if parent else root;parent_pivot=groups[parent]['pivot'] if parent else (0,0,0)
  obj.location=xyz(*(data['pivot'][i]-parent_pivot[i] for i in range(3)));obj.rotation_mode='XYZ';bases[name][label]=obj.location.copy()

# Stable attachment frames survive pruning and are checked in the shipped GLB.
for name,entries in grips.items():
 size=configs[name]['scale'];roots[name]['grip_contract']=json.dumps([{**entry,'scale':size} for entry in entries])
 for entry in entries:
  side=entry['side'];pivot=entry['pivot'];hand=objects[name][side+'-hand'];weapon=objects[name][side+'-weapon']
  for suffix,parent,point in [('hand-grip',hand,pivot),('weapon-grip',weapon,pivot),('shaft-base',weapon,entry['shaft'][0]),('shaft-tip',weapon,entry['shaft'][1])]:
   marker=bpy.data.objects.new(name+'-'+side+'-'+suffix,None);library.collection.objects.link(marker);marker.parent=parent
   base=parts[name][side+('-hand' if parent==hand else '-weapon')]['pivot']
   marker.location=xyz(*(point[i]*size-base[i] for i in range(3)));marker['attachment_frame']=True

# Each style has its own attack silhouette. Secondary channels lag the main body.
BASIS=Euler((math.pi/2,0,0)).to_matrix()
DURATIONS={'idle':60,'walk':30,'auto':12,'attack':36,'death':42}
def anim_pose(name,label,suffix,t):
 style=configs[name]['style'];size=configs[name]['scale'];floating=style in ('float','abbess','bell','fish','wing');rotation=[0.,0.,0.];move=[0.,0.,0.];scale=[1.,1.,1.]
 side=-1 if ('left' in label or label.endswith('--1')) else 1
 secondary=label in ('veil','cape','coat','tabard','banner','lantern','censer','bell','abdomen') or label.startswith(('robe-','leg-tip-','segment-','tail-','tentacle-','ribbon-')) or label in ('tail','left-fin','right-fin','dorsal','spore-frill','keys','flywheel','halo')
 if suffix in ('idle','walk'):
  wave=math.sin(t*math.tau);stride=wave if suffix=='walk' else 0
  if label=='body':move[1]=(.06 if floating else .025)*math.sin(t*math.tau)+(.035*abs(stride));rotation[2]=stride*.035 if suffix=='walk' else wave*.012
  if label=='head':rotation[1]=wave*.055;rotation[0]=math.sin(t*math.tau)*.025
  if label.startswith('leg-') and not label.startswith('leg-tip'):
   n=int(label.split('-')[-1]);rotation[1]=math.sin(t*math.tau+n*1.75)*(.21 if suffix=='walk' else .02);rotation[2]=math.sin(t*math.tau+n*1.75)*.08 if suffix=='walk' else 0
  if label in ('left-leg','right-leg'):rotation[0]=stride*side*.40 if suffix=='walk' else wave*side*.035
  if label.endswith('-shin'):rotation[0]=max(0,stride*side)*.28
  if label in ('left-arm','right-arm'):rotation[0]=-stride*side*.28;rotation[2]=wave*side*.035
  if label.endswith('-hand'):rotation[0]=math.sin(t*math.tau-.6)*(.11 if suffix=='walk' else .035)
  if secondary:rotation[0]=math.sin(t*math.tau-.7)*(.09 if suffix=='walk' else .05);rotation[2]=math.sin(t*math.tau+.5)*.035
  if label.startswith('fang'):rotation[1]=side*wave*.04
  if label in ('left-wing','right-wing'):
   rotation[2]=side*(math.sin(t*math.tau*2)*(.38 if suffix=='walk' else .18));rotation[0]=math.sin(t*math.tau*2-.5)*.12
  if label in ('left-fin','right-fin'):rotation[1]=side*(.14+math.sin(t*math.tau)*.27)
  if label=='tail' or label.startswith('tail-'):rotation[1]=math.sin(t*math.tau+(int(label[-1]) if label[-1].isdigit() else 0)*.8)*(.24 if suffix=='walk' else .12)
  if label.startswith('tentacle-'):rotation[0]=math.sin(t*math.tau+int(label[-1]))*(.23 if suffix=='walk' else .10);rotation[2]=math.cos(t*math.tau+int(label[-1]))*.06
  if style=='quadruped' and label.startswith('leg-') and not label.startswith('leg-tip'):
   n=int(label.split('-')[-1]);rotation[0]=math.sin(t*math.tau+(0 if n in (0,3) else math.pi))*(.49 if suffix=='walk' else .025);rotation[1]=0;rotation[2]=0
  if style=='serpent' and label.startswith('segment-'):rotation[1]=math.sin(t*math.tau+int(label[-1])*.55)*(.16 if suffix=='walk' else .055)
  if style=='fish' and label=='body':rotation[1]=wave*.08;move[1]=wave*.045

 elif suffix in ('auto','attack'):
  special=suffix=='attack'
  def envelope(time,points):
   for (a,v),(b,w) in zip(points,points[1:]):
    if time<=b:return v+(w-v)*max(0,(time-a)/(b-a))
   return points[-1][1]
  # Hold anticipation at .32, exact contact at .5, overshoot then recover.
  hit=envelope(t,[(0,0),(.32,0 if special else .64),(.5,1),(.59,1.07 if special else .72),(.79,.28),(1,0)])
  wind=envelope(t,[(0,0),(.20,.6),(.32,1),(.43,.92),(.5,0),(1,0)]) if special else 0
  if not special:hit*=.62
  cast=style in ('caster','float','abbess','bell','king')
  if label=='body':rotation[0]=(-.13*wind+.14*hit) if not cast else (-.09*wind+.08*hit);rotation[1]=(.12*wind-.17*hit) if style in ('melee','king','heavy') else 0;move[2]=(-.12*wind if special else 0)+.19*hit;move[1]=(.11*wind+.06*hit) if floating else .025*hit
  if label=='head':rotation[0]=-.20*wind+.22*hit;rotation[1]=.05*wind-.08*hit
  if label in ('left-arm','right-arm'):
   if cast:rotation[0]=-1.0*wind-1.25*hit;rotation[2]=-side*(.38*wind+.57*hit)
   else:rotation[0]=-1.75*wind-.83*hit if side>0 or style=='heavy' else -.45*wind-.30*hit;rotation[1]=side*(.22*wind-.3*hit);rotation[2]=-side*.16*wind
  if label.endswith('-hand'):rotation[0]=-.35*wind+.44*hit;rotation[1]=side*.1*hit
  if label.startswith('fang'):rotation[1]=side*(.38*wind-.55*hit);rotation[0]=.24*hit
  if label.startswith('leg-') and not label.startswith('leg-tip'):
   n=int(label.split('-')[-1]);rotation[2]=(1 if n%2 else -1)*(.14*wind-.11*hit);rotation[0]=(-.3*wind+.16*hit) if n<2 else 0
  if secondary:rotation[0]=-.24*wind+envelope(t,[(0,0),(.46,0),(.63,.24),(.8,-.08),(1,0)]);rotation[2]=side*.10*hit
  if style=='hammer' and special:
   if label=='body':rotation[0]=-.18*wind+.42*hit;move[1]=.04*wind-.22*hit
   if label=='right-arm':rotation[0]=-1.60*wind-.70*hit
   if label=='right-hand':rotation[0]=-.45*wind+2.80*hit
   if label=='left-arm':rotation[0]=-.45*wind-.55*hit
  if label=='bell':rotation[0]=-.8*wind+.95*hit
  if label in ('left-wing','right-wing'):rotation[2]=side*(.80*wind-.34*hit);rotation[0]=-.22*wind+.42*hit
  if label in ('left-fin','right-fin'):rotation[1]=side*(.60*wind-.48*hit)
  if label=='tail' or label.startswith('tail-'):rotation[1]=side*(-.55*wind+.70*hit)
  if label.startswith('tentacle-'):rotation[0]=-.90*wind-.52*hit;rotation[2]=(-1 if int(label[-1])%2==0 else 1)*(.15*wind-.35*hit)
  if style in ('quadruped','serpent','fish','wing') and label=='head':rotation[0]=-.38*wind+.35*hit;move[2]=.14*hit
  if style in ('quadruped','serpent') and label=='body':rotation[0]=-.10*wind+.22*hit;move[2]=-.19*wind+.48*hit

  if label=='abdomen':scale=[1+.08*wind,1+.14*wind,1+.08*wind];rotation[0]=-.14*wind+.2*hit
  if label.startswith('segment-'):rotation[0]=-.06*wind+.08*hit
 elif suffix=='death':
  p=min(1,t/.80);p=p*p*(3-2*p)
  if label=='body':rotation[2]=(.94 if style in ('spider','crawler') else 1.32)*p;rotation[0]=.18*p;move[1]=-parts[name]['body']['pivot'][1]/size*.45*p;scale[1]=1-(.45*p if floating else 0)
  if label=='head':rotation[0]=.5*p;rotation[1]=-.22*p
  if label in ('left-arm','right-arm'):rotation[0]=-.3*p;rotation[2]=-side*.45*p
  if label in ('left-leg','right-leg'):rotation[0]=.43*p;rotation[2]=side*.28*p
  if label.startswith('leg-'):
   n=int(label.split('-')[-1]);rotation[2]=(1 if n%2 else -1)*.76*p
  if secondary:rotation[0]=.45*p;rotation[2]=.2*p
  if label in ('left-wing','right-wing'):rotation[2]=-side*.82*p;rotation[0]=.45*p
  if label in ('left-fin','right-fin'):rotation[1]=side*.55*p

 if LEGACY: legacy_pose(name,label,suffix,t,rotation,move,scale)
 return rotation,[v*size for v in move],scale
for name,rig in objects.items():
 for suffix,frames in DURATIONS.items():
  clip=name+'-'+suffix
  for label,obj in rig.items():
   base=bases[name][label]
   for frame in sorted(set([0,frames]+[round(frames*t,3) for t in [.1,.2,.32,.43,.5,.59,.63,.72,.79,.9]])):
    r,p,s=anim_pose(name,label,suffix,frame/frames);rot=Euler(r,'XYZ').to_matrix();obj.rotation_euler=(BASIS@rot@BASIS.transposed()).to_euler('XYZ');obj.location=base+Vector(xyz(*p));obj.scale=(s[0],s[2],s[1])
    for field in ['rotation_euler','location','scale']:obj.keyframe_insert(data_path=field,frame=frame)
   action=obj.animation_data.action;action.name=clip+'-'+label
   for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
    for key in curve.keyframe_points:key.interpolation='LINEAR'
   track=obj.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,0,action);strip.extrapolation='NOTHING';obj.animation_data.action=None
   obj.location=base;obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)
  # Ground correction is baked into the source clip, including the settled corpse.
  for obj in rig.values():
   for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
  action=bpy.data.actions[clip+'-body'];curves=action.layers[0].strips[0].channelbag(action.slots[0]).fcurves;height=next(curve for curve in curves if curve.data_path=='location' and curve.array_index==2)
  corrections=[]
  for frame in range(frames+1):
   library.frame_set(frame);bpy.context.view_layer.update();bottom=min((obj.matrix_world@Vector(corner)).z for obj in rig.values() for corner in obj.bound_box)
   correction=-bottom if suffix=='death' and frame>=frames*.8 else max(0,-bottom)
   corrections.append(height.evaluate(frame)+correction)
  height.keyframe_points.clear()
  for frame,value in enumerate(corrections):height.keyframe_points.insert(frame,value,options={'FAST'}).interpolation='LINEAR'
  height.update()
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=False
 library.frame_set(0)
EXPORT.parent.mkdir(parents=True,exist_ok=True);SOURCE.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');library.frame_set(0)
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_force_sampling=True,export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
 with tempfile.TemporaryDirectory(prefix='themed-monsters-') as temp:
  first=str(Path(temp)/'quantized.glb');second=str(Path(temp)/'dedup.glb');cli=['npx','--yes','@gltf-transform/cli@4.5.0']
  for command in [['quantize',str(EXPORT),first,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['dedup',first,second],['prune',second,str(EXPORT),'--keep-leaves','true']]:subprocess.run(cli+command,check=True)
 raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
 for key in ['extensionsUsed','extensionsRequired']:doc[key]=sorted(set(doc.get(key,[])+['KHR_mesh_quantization']))
 encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=raw[20+length:];EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)

# Genuine model contact sheets, captured from Blender's evaluated geometry.
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
def flat(name,color,emission=0):
 mat=bpy.data.materials.new(name);mat.diffuse_color=color;mat.use_nodes=True;sh=mat.node_tree.nodes.get('Principled BSDF');sh.inputs['Base Color'].default_value=color;sh.inputs['Roughness'].default_value=.85;sh.inputs['Emission Color'].default_value=color;sh.inputs['Emission Strength'].default_value=emission;return mat
floor_mat=flat('Gallery midnight',(.023,.033,.047,1));plinth_mat=flat('Gallery stone',(.045,.063,.075,1));text_mat=flat('Gallery lettering',(.7,.81,.8,1),.7)
def cube(at,size,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*at));obj=bpy.context.object;obj.scale=(size[0],size[2],size[1]);obj.data.materials.append(mat)
def copy_rig(name,scene,at,pose='idle',t=0):
 for obj in objects[name].values():
  for track in obj.animation_data.nla_tracks:track.mute=track.name!=name+'-'+pose
 library.frame_set(int(DURATIONS[pose]*t));bpy.context.window.scene=library;bpy.context.view_layer.update()
 parent=bpy.data.objects.new(name+' display',None);scene.collection.objects.link(parent);parent.location=xyz(*at);copied={}
 for label,source in objects[name].items():
  obj=source.copy();obj.data=source.data;obj.animation_data_clear();scene.collection.objects.link(obj);obj.parent=copied[parts[name][label]['parent']] if parts[name][label]['parent'] else parent;copied[label]=obj
 bpy.context.window.scene=scene
 return parent
if LEGACY:
 scenes=legacy_gallery()
else:
 scenes=[]
 for theme in ['plagueworks','emberfall','veilhaven']:
  scene=bpy.data.scenes.new(theme+' original bestiary');bpy.context.window.scene=scene;scene.render.engine='BLENDER_EEVEE';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
  scene.world=bpy.data.worlds.new(theme+' gallery world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.2,.25,.3,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65;scene.view_settings.view_transform='AgX'
  bpy.ops.object.camera_add(location=xyz(0,26,38));camera=bpy.context.object;aim(camera,(0,1.3,0));camera.data.type='ORTHO';camera.data.ortho_scale=31.5;scene.camera=camera
  def title(text,x,y,size):
   data=bpy.data.curves.new(text,'FONT');data.body=text;data.size=size;data.align_x='CENTER';data.materials.append(text_mat);obj=bpy.data.objects.new(text,data);scene.collection.objects.link(obj);obj.parent=camera;obj.location=(x,y,-20)
  title(theme.upper()+'  /  TWELVE DISTINCT CREATURES',0,12.70,.50);title('Original Blender geometry  ·  60 authored animation clips  ·  2 bosses',0,12.05,.23)
  names=[name for name,cfg in configs.items() if cfg['theme']==theme]
  for index,name in enumerate(names):
   x=(index%4-1.5)*5.6;z=(index//4-1)*12.0
   copy_rig(name,scene,(x,0,z));cube((x,-.14,z),(5.0,.24,5.3),plinth_mat)
   point=camera.matrix_world.inverted()@Vector(xyz(x,.05,z+2.6))
   title(name.replace('-',' ').title(),point.x,point.y-.35,.24)
   title('BOSS' if name in ('broodmother-vex','plague-abomination','anvil-warden','pyrelord-ignivar','bellkeeper-shen','veiled-abbess') else 'DUNGEON CREATURE',point.x,point.y-.68,.15)
  cube((0,-.32,0),(90,.1,90),floor_mat)
  for at,power,size in [((-9,14,10),4200,10),((9,10,5),3200,9),((0,13,-9),4700,10)]:
   bpy.ops.object.light_add(type='AREA',location=xyz(*at));obj=bpy.context.object;obj.data.energy=power;obj.data.size=size;aim(obj,(0,1,0))
  scene.render.filepath=str(ROOT/'assets/source'/f'{theme}-bestiary-preview.png');scene['evidence']='Actual authored models, no illustrative substitute';scenes.append(scene)
 # Additional boss contact sheet shows anticipation, impact and recovery, not only neutral models.
 scene=bpy.data.scenes.new('Boss animation contact poses');bpy.context.window.scene=scene;scene.render.engine='BLENDER_EEVEE';scene.cycles.samples=16;scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1900;scene.render.resolution_percentage=100;scene.world=scenes[0].world;scene.view_settings.view_transform='AgX'
 bpy.ops.object.camera_add(location=xyz(0,34,48));camera=bpy.context.object;aim(camera,(0,1.6,0));camera.data.type='ORTHO';camera.data.ortho_scale=39.5;scene.camera=camera
 for text,x,y,size in [('BOSS ANIMATIONS / AUTHORED CONTACT POSES',0,17.7,.65),('ANTICIPATION 32%',-8,15.8,.40),('CONTACT 50%',0,15.8,.40),('RECOVERY 79%',8,15.8,.40)]:
  data=bpy.data.curves.new(text,'FONT');data.body=text;data.size=size;data.align_x='CENTER';data.materials.append(text_mat);obj=bpy.data.objects.new(text,data);scene.collection.objects.link(obj);obj.parent=camera;obj.location=(x,y,-25)
 bosses=['broodmother-vex','plague-abomination','anvil-warden','pyrelord-ignivar','bellkeeper-shen','veiled-abbess']
 for row,name in enumerate(bosses):
  for col,t in enumerate([.32,.5,.79]):
   at=((col-1)*8,0,(row-2.5)*7);copy_rig(name,scene,at,'attack',t);cube((at[0],-.14,at[2]),(6.5,.24,6),plinth_mat)
 cube((0,-.34,0),(100,.1,100),floor_mat)
 for at,power in [((-14,27,15),11000),((15,24,0),9500),((0,24,-20),14000)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(*at));obj=bpy.context.object;obj.data.energy=power;obj.data.size=16;aim(obj,(0,1,0))
 scene.render.filepath=str(ROOT/'assets/source/themed-boss-animations-preview.png');scenes.append(scene)
 # Macro views of actual evaluated gripping hands; no replacement or illustration geometry.
 for number,(name,side,pose,t) in enumerate([('plague-alchemist','right','idle',.25),('anvil-warden','right','attack',.5),('temple-ronin','right','attack',.32),('incense-acolyte','right','idle',.6)]):
  scene=bpy.data.scenes.new(name+' grip detail');bpy.context.window.scene=scene;scene.render.engine='BLENDER_EEVEE';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.world=scenes[0].world;scene.view_settings.view_transform='AgX'
  parent=copy_rig(name,scene,(0,0,0),pose,t);bpy.context.view_layer.update()
  # Evaluate and bake only the hand assembly; the macro crop excludes far weapon tips.
  entry=next(e for e in grips[name] if e['side']==side);source_hand=objects[name][side+'-hand'];grip=Vector(xyz(*(entry['pivot'][i]*configs[name]['scale']-parts[name][side+'-hand']['pivot'][i] for i in range(3))))
  hand=next(obj for obj in scene.objects if obj.name.startswith(name+'-'+side+'-hand'));center=hand.matrix_world@grip
  for obj in scene.objects:
   if obj.type=='MESH' and not (obj.name.startswith(name+'-'+side+'-hand') or obj.name.startswith(name+'-'+side+'-weapon')):obj.hide_render=True
  bpy.ops.object.camera_add(location=center+hand.matrix_world.to_quaternion()@Vector((.70,-1.5,.62)));camera=bpy.context.object;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=.85*configs[name]['scale'];scene.camera=camera
  for offset,power in [((1,-2,3),450),((-2,-1,1),350)]:
   bpy.ops.object.light_add(type='AREA',location=center+hand.matrix_world.to_quaternion()@Vector(offset));light=bpy.context.object;light.data.energy=power;light.data.size=2;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
  scene.render.filepath=str(ROOT/'assets/source'/f'{name}-grip-preview.png');scene['evidence']='Actual evaluated hand and rigid weapon, '+pose+' '+str(t);scenes.append(scene)

bpy.context.window.scene=library
for name,rig in objects.items():
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=False
library.frame_set(0);bpy.context.window.scene=scenes[0]
if LEGACY:
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':
    area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL';area.spaces.active.shading.use_scene_lights=True;area.spaces.active.shading.use_scene_world=True
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print(('LEGACY_DUNGEON_BOSSES ' if LEGACY else 'THEMED_MONSTERS ')+json.dumps({'models':len(roots),'clips':len(roots)*len(DURATIONS),'primitives':counts,'triangles':sum(sum(len(face.vertices)-2 for face in o.data.polygons) for rig in objects.values() for o in rig.values()),'bytes':EXPORT.stat().st_size,'parts':{name:len(rig) for name,rig in objects.items()}}))
if '--render' in sys.argv:
 for scene in ([scene for scene in scenes if scene.name=='Boss animation contact poses'] if '--bosses-only' in sys.argv else scenes):bpy.context.window.scene=scene;bpy.ops.render.render(write_still=True)
 bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
