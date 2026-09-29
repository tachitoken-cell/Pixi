"""Additional original rigid-mesh creatures; executed by build-themed-monsters.py.
All coordinates are metres, Y up and +Z front before the shared export transform.
"""
grips={}
def hold_weapon(side='right',kind='staff',metal='gold',glow='cyan'):
 global current
 sign=1 if side=='right' else -1;hand=side+'-hand';weapon=side+'-weapon';x=sign*.98;y=1.02;z=.42
 data=parts[active][hand]
 for field in ('vertices','faces','colors','materials'):data[field]=[]
 current=hand
 rod('leather',(sign*.72,1.40,.03),(x,1.10,.27),.115,.13)
 box(metal,x,1.19,.19,.28,.16,.19,rx=.35)
 box('leather',x,y,.285,.24,.30,.17)
 # Three fingers curl around the shaft, in its local cross-section; thumb opposes them.
 for offset in [-.088,0,.088]:
  for j in range(11):
   a=-math.pi*.92+j*math.pi*.17;b=a+math.pi*.17
   rod('bone',(x+.095*math.cos(a),y+offset,z+.095*math.sin(a)),(x+.095*math.cos(b),y+offset,z+.095*math.sin(b)),.036,n=6)
 rod('bone',(x-sign*.17,y+.17,z-.075),(x-sign*.09,y+.16,z+.11),.047,n=7)
 part(weapon,(x,y,z),hand)
 shaft_low=.36 if kind in ('sword','axe','hammer','cleaver','mallet') else .13
 shaft_high=1.62 if kind=='sword' else 2.40 if kind in ('staff','spear') else 2.37 if kind=='hammer' else 1.9
 if kind in ('bell','lantern','censer','chain'):shaft_low=.84;shaft_high=1.24
 rod('leather',(x,shaft_low,z),(x,shaft_high,z),.053,.053,10)
 for yy in [.82,1.20]:ring(metal,x,yy,z,.072,.016,10)
 if kind=='staff':
  ring(metal,x,2.46,z,.24,.04,16,True);orb(glow,x,2.46,z,.13,.19,.10,10,6)
  for s in [-1,1]:spike(metal,(x+s*.19,2.44,z),(x+s*.25,2.76,z),.04)
 elif kind=='spear':
  rod(metal,(x,2.32,z),(x,2.91,z),.17,.006,8);box(metal,x,2.32,z,.40,.07,.14)
 elif kind=='sword':
  box(metal,x,1.46,z,.60,.08,.18)
  profile=[(-.115,1.51),(.115,1.51),(.095,2.36),(0,2.63),(-.095,2.36)]
  polygon('steel',[(x+xx,yy,z+zz) for zz in [-.033,.033] for xx,yy in profile],[(4,3,2,1,0),(5,6,7,8,9)]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)])
  box('iron',x,1.94,z+.038,.048,.69,.013);box(glow,x,1.94,z+.047,.021,.51,.012)
  for side_edge in [-1,1]:rod('silver',(x+side_edge*.104,1.55,z+.036),(x+side_edge*.086,2.34,z+.036),.013,n=4)
 elif kind in ('axe','cleaver'):
  box(metal,x+sign*.20,1.83,z,.64,.45,.16);box('silver',x+sign*.48,1.79,z,.09,.58,.17,rz=sign*-.1);rune(x+sign*.18,1.85,z+.10,glow,.28)
 elif kind in ('hammer','mallet'):
  w=1.16 if kind=='hammer' else .52;head_y=2.37 if kind=='hammer' else 2.0;box(metal,x,head_y,z,w,.51,.50);box('steel',x,head_y+.29,z,w+.12,.10,.58)
  for dx in [-w*.32,0,w*.32]:rune(x+dx,head_y,z+.27,glow,.30)
 elif kind in ('bell','lantern','censer'):
  rod(metal,(x,.91,z),(x,.62,z),.022)
  if kind=='bell':
   for j in range(5):rod(metal,(x,.60-j*.075,z),(x,.52-j*.075,z),.16+j*.048,.19+j*.048,12)
   ring('goldlight',x,.22,z,.4,.036,16);orb('iron',x,.23,z,.075,.1,.075)
  else:
   orb(glow,x,.40,z,.18,.19,.18,10,6)
   for j in range(8):
    a=j*math.tau/8;rod(metal,(x+.19*math.cos(a),.22,z+.19*math.sin(a)),(x+.19*math.cos(a),.58,z+.19*math.sin(a)),.022)
   for yy in [.20,.6]:ring(metal,x,yy,z,.20,.025,12)
 elif kind=='chain':
  # A hanging flail, attached to the gripped handle; each link has visible open centre.
  for j in range(7):ring(metal,x+sign*.10*j,.81-j*.06,z,.065,.018,8,j%2==0)
  orb('iron',x+sign*.75,.36,z,.25,.24,.25,10,6)
  for j in range(8):
   a=j*math.tau/8;spike(metal,(x+sign*.75+.19*math.cos(a),.36+.19*math.sin(a),z),(x+sign*.75+.37*math.cos(a),.36+.37*math.sin(a),z),.065)
 grips.setdefault(active,[]).append({'side':side,'pivot':(x,y,z),'shaft':[(x,shaft_low,z),(x,shaft_high,z)],'radius':.053,'kind':kind})

# Shared construction helpers vary anatomy, rather than scale/recolor one mesh.
def paws(armor='plague',trim='bone',height=.72,length=.65,width=.35):
 for i in range(4):
  side=-1 if i%2==0 else 1;zz=(1 if i<2 else -1)*length;xx=side*width
  part('leg-'+str(i),(xx,height,zz));rod(armor,(xx,height,zz),(xx*1.18,.22,zz-.10),.13,.09)
  box(trim,xx*1.18,.11,zz+.04,.22,.20,.36)
  for j in range(3):spike(trim,(xx*1.18+(j-1)*.07,.13,zz+.19),(xx*1.18+(j-1)*.07,.08,zz+.31),.032)
def jaw(x,y,z,size=1,tint='bone',glow='venom'):
 orb(tint,x,y,z,.30*size,.22*size,.32*size,10,5)
 box('ink',x,y-.06*size,z+.26*size,.43*size,.09*size,.10*size)
 for s in [-1,1]:
  eye(x+s*.17*size,y+.085*size,z+.24*size,.045*size,glow)
  for j in range(3):spike('ivory',(x+s*(.06+j*.065)*size,y-.005*size,z+.29*size),(x+s*(.06+j*.065)*size,y-.12*size,z+.30*size),.025*size)
def tail_chain(tint,points,r=.12):
 for i in range(len(points)-1):
  part('tail-'+str(i),points[i],'body' if i==0 else 'tail-'+str(i-1));rod(tint,points[i],points[i+1],r*(1-i/len(points)),r*(1-(i+1)/len(points)))
def plated_shell(tint,trim,y=.6,length=.8,width=.5):
 for i in range(5):
  zz=-length+i*length*.5;orb(tint,0,y,zz,width,.24,length*.31,10,5)
  for s in [-1,1]:rod(trim,(s*.03,y+.25,zz),(s*width*.87,y+.08,zz),.034)
def web_wing(side,label,pivot,span=1.35,tint='suture',bones='bone',parent='body'):
 part(label,pivot,parent);s=side;x,y,z=pivot
 tips=[(x+s*span,y+.1,z-.1),(x+s*span*.89,y-.20,z-.7),(x+s*span*.62,y-.10,z-1.1),(x+s*.12,y-.10,z-.75)]
 polygon(tint,[pivot]+tips,[(0,1,2),(0,2,3),(0,3,4)])
 for t in tips:rod(bones,pivot,t,.035,.015)
 for a,b in zip(tips,tips[1:]):rod(bones,a,b,.022)

# THE PLAGUEWORKS — skeletal vermin, fungal hosts and sewer predators.
monster('bone-rat','plagueworks','quadruped',.66)
part('body',(0,.43,0));orb('suture',0,.45,-.04,.32,.29,.61,10,5)
for zz in [-.38,-.20,0,.20]:
 for s in [-1,1]:rod('bone',(s*.04,.73,zz),(s*.29,.41,zz),.032)
part('head',(0,.50,.51));jaw(0,.56,.66,.72)
for s in [-1,1]:orb('bone',s*.20,.83,.54,.15,.20,.035,8,4);orb('blood',s*.20,.83,.57,.10,.14,.022,8,4)
paws('bone','ivory',.37,.38,.23)
tail_chain('bone',[(0,.40,-.50),(.18,.28,-.95),(.39,.21,-1.26),(.56,.31,-1.44)],.055)

monster('corpse-scarab','plagueworks','spider',.76)
part('body',(0,.44,0));orb('iron',0,.46,-.02,.56,.28,.71)
part('abdomen',(0,.58,-.17));plated_shell('bone','copper',.65,.45,.52);rod('suture',(0,.93,-.62),(0,.93,.38),.055)
for s in [-1,1]:
 for j in range(3):vial(s*.34,.73,-.48+j*.28,scale=.7)
part('head',(0,.43,.56));jaw(0,.46,.66,.85,'bone');spike('copper',(0,.61,.8),(0,1.07,1.02),.09)
for i in range(6):
 s=-1 if i%2==0 else 1;zz=.4-(i//2)*.38;part('leg-'+str(i),(s*.43,.43,zz));rod('bone',(s*.43,.43,zz),(s*.84,.30,zz-.10),.062);rod('iron',(s*.84,.30,zz-.10),(s*.97,.05,zz+.11),.05,.018)

monster('mire-leech','plagueworks','serpent',1)
part('body',(0,.34,-.2));orb('plague',0,.35,-.35,.32,.28,.66)
for i in range(6):
 part('segment-'+str(i),(0,.35,-.71+i*.21));ring('moss',0,.35,-.71+i*.21,.28,.048,12,True)
part('head',(0,.40,.35));orb('blood',0,.43,.46,.35,.30,.30);ring('bone',0,.44,.67,.26,.055,14,True)
for j in range(12):
 a=j*math.tau/12;spike('ivory',(.23*math.cos(a),.44+.23*math.sin(a),.70),(.13*math.cos(a),.44+.13*math.sin(a),.77),.035)
orb('venom',0,.43,.73,.09,.09,.04,8,4)
tail_chain('plague',[(0,.33,-.78),(.15,.20,-1.10),(.38,.16,-1.37)],.17)

monster('crypt-bat','plagueworks','wing',1)
part('body',(0,1.03,0));orb('suture',0,1.02,0,.24,.35,.24);ribbed('bone',0,.79,.22,.31,.43,.04,5)
part('head',(0,1.33,.03));jaw(0,1.39,.16,.75,'bone')
for s in [-1,1]:spike('bone',(s*.13,1.55,.03),(s*.25,1.84,.02),.105)
for s,label in [(-1,'left-wing'),(1,'right-wing')]:web_wing(s,label,(s*.19,1.25,-.03),1.22)
for s,label in [(-1,'left-leg'),(1,'right-leg')]:
 part(label,(s*.13,.82,0));rod('bone',(s*.13,.82,0),(s*.19,.56,.06),.046);spike('ivory',(s*.19,.56,.06),(s*.26,.53,.24),.045)

monster('fungal-thrall','plagueworks','caster',.90)
humanoid_body('plague','moss');limbs('plague','bone',True);current='body'
for s in [-1,1]:
 for j in range(5):rod('suture',(s*.12,1.17+j*.13,.34),(s*.40,1.25+j*.13,.39),.025)
part('head',(0,2.06,.02));orb('flesh',0,2.14,.06,.30,.29,.27);eye(-.12,2.19,.30,.055);eye(.12,2.19,.30,.055)
orb('blood',0,2.43,.02,.66,.16,.58,12,6)
for i in range(12):
 a=i*2.4;r=.41*(.5+.5*math.sin(i));orb('venom',r*math.cos(a),2.54,r*math.sin(a),.06,.026,.06,8,4)
for s in [-1,1]:
 current='left-arm' if s<0 else 'right-arm';rod('bone',(s*.68,2.00,-.02),(s*.82,2.27,-.06),.055);orb('moss',s*.82,2.27,-.06,.26,.085,.24,10,4)
part('spore-frill',(0,1.60,-.30))
for j in range(7):orb('moss',.35*math.sin(j*2),1.1+j*.11,-.40,.18,.09,.18,8,4)

monster('plague-knight','plagueworks','melee',1.04)
humanoid_body('iron','bone');limbs('iron','copper',True);current='body'
for j in range(6):box('plague',0,1.28+j*.10,.34,.80-j*.04,.08,.08)
for s in [-1,1]:
 current='left-arm' if s<0 else 'right-arm';orb('bone',s*.70,2.03,0,.31,.22,.31)
 for j in range(3):spike('bone',(s*.72,2.14,-.17+j*.17),(s*.93,2.35,-.17+j*.17),.06)
current='head';box('bone',0,2.34,.3,.50,.24,.06);box('ink',0,2.39,.35,.41,.06,.025);eye(-.12,2.39,.37,.035);eye(.12,2.39,.37,.035)
for s in [-1,1]:spike('bone',(s*.25,2.50,0),(s*.39,2.70,-.14),.10)
hold_weapon('right','cleaver','iron','venom');hold_weapon('left','censer','copper','venom')
part('tabard',(0,1.08,.29))
for j in range(5):box('plague',0,.97-j*.13,.33,.43,.17,.065);rune(0,.93-j*.13,.37,'bone',.18)

monster('carrion-hound','plagueworks','quadruped',1)
part('body',(0,.82,-.12));orb('flesh',0,.88,-.10,.39,.42,.85);ribbed('bone',0,.62,.50,.45,.47,.05)
for j in range(6):spike('bone',(0,1.22,-.76+j*.23),(0,1.43,-.81+j*.23),.06)
part('head',(0,1.02,.70));jaw(0,1.08,.87,1.2,'flesh')
for s in [-1,1]:spike('bone',(s*.20,1.23,.7),(s*.31,1.54,.55),.10)
paws('flesh','bone',.74,.63,.31)
tail_chain('suture',[(0,1.02,-.87),(.17,1.09,-1.22),(.37,.85,-1.53)],.11)

monster('sewer-horror','plagueworks','heavy',1.22)
part('body',(0,1.10,-.02));orb('plague',0,1.12,0,.72,.79,.56);orb('venom',0,1.19,.44,.44,.45,.10)
for s in [-1,1]:
 for j in range(5):rod('bone',(s*.08,1.56-j*.15,.48),(s*.58,1.44-j*.14,.53),.045)
part('head',(0,1.84,.08));jaw(0,2.00,.21,1.5,'blood');eye(0,2.35,.40,.105)
for i in range(6):
 s=-1 if i%2==0 else 1;yy=1.57-(i//2)*.38;part('tentacle-'+str(i),(s*.58,yy,-.12));points=[(s*.58,yy,-.12),(s*(.94+(i//2)*.15),yy+.07,.14),(s*(1.24+(i//2)*.06),.43,.42),(s*1.01,.17,.68)]
 for j in range(3):rod('suture',points[j],points[j+1],.17-j*.04,.12-j*.04)
 for j in range(3):orb('venom',s*(.78+j*.13),yy-.03-j*.16,.27,.055,.055,.04,8,4)
for s,label in [(-1,'left-leg'),(1,'right-leg')]:part(label,(s*.37,.70,0));rod('flesh',(s*.37,.70,0),(s*.47,.12,.17),.23,.18);box('bone',s*.47,.11,.33,.43,.20,.51)

# EMBERFALL — furnace imps, forged automata, molten predators and temple industry.
monster('ember-imp','emberfall','caster',.49)
humanoid_body('slag','copper');limbs('slag','copper',True);current='body';orb('fire',0,1.61,.28,.26,.34,.17)
current='head';jaw(0,2.23,.19,1.15,'slag','fire')
for s in [-1,1]:rod('coal',(s*.21,2.47,0),(s*.5,2.63,-.07),.10,.07);spike('hot',(s*.50,2.63,-.07),(s*.38,2.91,.02),.07)
for s,label in [(-1,'left-wing'),(1,'right-wing')]:web_wing(s,label,(s*.39,1.9,-.18),.75,'ember','coal')
tail_chain('slag',[(0,1.13,-.25),(.40,.94,-.70),(.70,1.25,-.9),(.84,1.60,-.85)],.07)
current='tail-2';orb('fire',.84,1.60,-.85,.13,.20,.11,8,4)

monster('cinder-hound','emberfall','quadruped',1)
part('body',(0,.80,-.10));orb('coal',0,.86,-.10,.43,.44,.82)
for i in range(6):
 zz=-.72+i*.24;orb('basalt',0,1.12,zz,.45,.21,.18,8,4);rod('fire',(-.37,1.08,zz+.09),(.37,1.08,zz+.09),.03)
part('head',(0,1.02,.63));jaw(0,1.08,.83,1.13,'basalt','hot')
for s in [-1,1]:rod('ember',(s*.22,1.2,.63),(s*.35,1.47,.36),.08,.02);rod('copper',(s*.30,.93,.62),(s*.45,1.30,.29),.04)
paws('basalt','ember',.76,.59,.34)
tail_chain('coal',[(0,.92,-.84),(0,1.08,-1.28),(.27,1.25,-1.58)],.14)
current='tail-1';orb('fire',.27,1.25,-1.58,.14,.23,.14,8,5)

monster('forge-spider','emberfall','spider',.9)
part('body',(0,.51,0));box('iron',0,.53,0,.74,.40,.87);box('fire',0,.75,0,.51,.035,.54)
part('abdomen',(0,.67,-.50));orb('copper',0,.73,-.53,.55,.40,.50)
for s in [-1,1]:ring('gold',s*.30,.78,-.53,.30,.04,14,True)
for j in range(5):box('iron',-.36+j*.18,1.09,-.53,.07,.04,.60)
part('head',(0,.58,.49));box('iron',0,.64,.56,.64,.31,.28)
for s in [-1,1]:eye(s*.18,.66,.71,.065,'hot');rod('copper',(s*.24,.53,.64),(s*.31,.36,.96),.085,.04)
for i in range(8):
 s=-1 if i%2==0 else 1;zz=.39-(i//2)*.28;knee=(s*(.88+.08*(i//2)),.70,zz)
 part('leg-'+str(i),(s*.31,.59,zz));rod('steel',(s*.31,.59,zz),knee,.067);orb('copper',*knee,.12,.12,.12,8,4)
 part('leg-tip-'+str(i),knee,'leg-'+str(i));rod('iron',knee,(s*1.24,.07,zz+.13),.075,.018);rod('fire',(s*.55,.63,zz),(s*.84,.69,zz),.022)

monster('brass-sentinel','emberfall','melee',1.06)
humanoid_body('copper','gold');limbs('copper','iron',True);current='body'
box('coal',0,1.66,.35,.58,.58,.06);ring('gold',0,1.66,.40,.26,.045,14,True);orb('fire',0,1.66,.44,.18,.18,.05,10,5)
for s in [-1,1]:
 for yy in [1.32,1.52,1.82]:orb('goldlight',s*.41,yy,.35,.046,.046,.025,8,4)
current='head';box('iron',0,2.38,.10,.65,.43,.50);box('fire',0,2.41,.37,.42,.07,.035)
for j in range(4):box('gold',-.24+j*.16,2.23,.38,.08,.14,.08)
for s in [-1,1]:spike('gold',(s*.22,2.56,0),(s*.30,2.93,-.09),.08)
hold_weapon('right','spear','copper','fire');hold_weapon('left','hammer','iron','fire')
part('flywheel',(0,1.69,-.42));ring('copper',0,1.70,-.46,.49,.095,18,True)
for j in range(8):
 a=j*math.tau/8;rod('steel',(0,1.70,-.46),(.45*math.cos(a),1.70+.45*math.sin(a),-.46),.035)

monster('slag-elemental','emberfall','heavy',1)
part('body',(0,1.11,0));orb('fire',0,1.16,0,.52,.74,.43)
for row in range(4):
 for col in range(6):
  a=col*math.tau/6+row*.35;box('basalt',.47*math.cos(a),.69+row*.30,.36*math.sin(a),.40,.26,.27,ry=a,rz=.09*math.sin(a))
part('head',(0,1.97,.03));orb('coal',0,2.09,.03,.38,.40,.30,8,5);eye(-.13,2.15,.31,.07,'hot');eye(.13,2.15,.31,.07,'hot')
for j in [-1,0,1]:spike('slag',(j*.19,2.35,0),(j*.29,2.68-j*.08,-.09),.13)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 part(label,(s*.55,1.70,0));rod('fire',(s*.55,1.70,0),(s*.85,.88,.06),.14)
 for j in range(3):orb('basalt',s*(.63+j*.09),1.57-j*.24,.04,.27,.20,.28,8,4)
 part(('left-hand' if s<0 else 'right-hand'),(s*.88,.82,.10),label);orb('coal',s*.90,.69,.16,.29,.28,.33,8,5)
 for j in range(3):spike('hot',(s*.9+(j-1)*.14,.60,.40),(s*.9+(j-1)*.14,.41,.51),.07)
for s,label in [(-1,'left-leg'),(1,'right-leg')]:part(label,(s*.28,.69,0));orb('basalt',s*.31,.35,.04,.28,.34,.32,8,5);box('slag',s*.33,.11,.2,.53,.20,.62)

monster('ash-drake','emberfall','wing',1)
part('body',(0,.97,-.1));orb('slag',0,1.02,-.13,.38,.39,.79);ribbed('gold',0,.85,.51,.36,.47,.055)
part('head',(0,1.28,.61));jaw(0,1.38,.87,1.10,'basalt','fire')
for s in [-1,1]:spike('gold',(s*.18,1.62,.70),(s*.34,1.98,.33),.09)
for s,label in [(-1,'left-wing'),(1,'right-wing')]:
 web_wing(s,label,(s*.30,1.21,-.15),1.65,'ember','coal');current=label
 for j in range(3):rod('fire',(s*.33,1.23,-.19),(s*(1.50-j*.25),1.12,-.36-j*.30),.018)
paws('coal','gold',.79,.52,.31)
tail_chain('slag',[(0,1.02,-.82),(0,.76,-1.39),(.35,.65,-1.88),(.63,.81,-2.15)],.16)
for i in range(3):current='tail-'+str(i);spike('gold',parts[active][current]['pivot'],(parts[active][current]['pivot'][0],parts[active][current]['pivot'][1]+.21,parts[active][current]['pivot'][2]-.11),.08)

monster('furnace-priest','emberfall','caster',1)
humanoid_body('coal','copper');limbs('coal','gold',True,True);current='body'
for row in range(5):box('red',0,1.77-row*.22,.35,.58,.18,.06);rune(0,1.78-row*.22,.395,'fire',.23)
for s in [-1,1]:
 rod('copper',(s*.33,1.49,-.37),(s*.33,2.39,-.37),.14)
 ring('gold',s*.33,2.38,-.37,.16,.032,10);orb('fire',s*.33,2.43,-.37,.09,.16,.09,8,5)
current='head';box('coal',0,2.50,0,.72,.42,.59);box('gold',0,2.67,.29,.63,.08,.04)
for j in range(5):box('gold',-.22+j*.11,2.35,.335,.055,.21,.03)
spike('gold',(0,2.72,0),(0,3.12,-.06),.16)
hold_weapon('right','staff','copper','fire');hold_weapon('left','censer','gold','hot')
part('cape',(0,1.90,-.30))
for j in range(7):box('red',0,1.77-j*.23,-.36,.85,.29,.10)

monster('chain-jailer','emberfall','heavy',1.15)
humanoid_body('iron','copper');limbs('iron','copper',True);current='body'
for j in range(5):ring('copper',-.20+j*.10,1.65-j*.08,.38,.10,.025,10,True)
for s in [-1,1]:
 current='left-arm' if s<0 else 'right-arm';box('coal',s*.68,2.02,.01,.62,.32,.62)
 for j in range(3):spike('steel',(s*.72,2.20,-.20+j*.20),(s*.79,2.44,-.20+j*.20),.065)
current='head';box('iron',0,2.39,.05,.69,.49,.65)
for j in range(5):box('steel',-.25+j*.125,2.35,.395,.054,.44,.052)
eye(-.12,2.43,.40,.05,'fire');eye(.12,2.43,.40,.05,'fire')
for s in [-1,1]:rod('copper',(s*.30,2.56,-.09),(s*.4,2.81,-.09),.10,.05)
hold_weapon('right','chain','steel','fire');hold_weapon('left','axe','iron','fire')
part('keys',(0,1.04,.37))
ring('gold',0,1.08,.40,.16,.025,12,True)
for j in range(4):rod('gold',(-.14+j*.10,1.0,.42),(-.14+j*.10,.67-j*.025,.42),.026);box('gold',-.10+j*.10,.70-j*.025,.42,.13,.05,.05)

# VEILHAVEN — paper spirits, animal guardians, ancestral weapons and sacred incense.
monster('paper-shikigami','veilhaven','float',.63)
part('body',(0,1.3,0));box('cream',0,1.38,0,.57,.79,.08);box('silk',0,1.18,.06,.61,.12,.08);rune(0,1.52,.06,'red',.50)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 part(label,(s*.31,1.70,0));box('cream',s*.58,1.60,0,.55,.24,.07,rz=-s*.35);box('ivory',s*.89,1.50,0,.19,.43,.05)
 for j in range(5):box('red',s*.90,1.40+j*.05,.035,.13,.014,.01)
part('head',(0,1.90,0));box('cream',0,2.15,0,.48,.47,.09,rz=.12)
for s in [-1,1]:eye(s*.13,2.18,.06,.037,'cyan');box('red',s*.13,2.03,.06,.15,.021,.016,rz=s*.27)
for s,label in [(-1,'left-leg'),(1,'right-leg')]:
 part(label,(s*.15,1.02,0));box('cream',s*.19,.69,0,.21,.67,.06,rz=s*.12)
 for j in range(9):rune(s*.19,.46+j*.05,.04,'red',.065)
part('halo',(0,2.23,-.07),'head');ring('gold',0,2.24,-.07,.40,.019,24,True)

monster('grave-fox','veilhaven','quadruped',1)
part('body',(0,.66,-.04));orb('cream',0,.71,-.12,.28,.34,.65);rod('red',(-.24,.76,.36),(.24,.76,.36),.07)
part('head',(0,.96,.56));jaw(0,1.04,.73,.82,'ivory','cyan')
for s in [-1,1]:
 spike('ivory',(s*.17,1.20,.54),(s*.25,1.57,.48),.12);spike('red',(s*.17,1.25,.57),(s*.23,1.49,.52),.06);box('red',s*.22,1.06,.89,.04,.14,.035,rz=s*.5)
paws('ivory','red',.61,.44,.23)
for j in range(3):
 part('tail-'+str(j),(0,.76,-.67));s=j-1;rod('cream',(0,.76,-.67),(s*.44,1.05,-1.05),.16,.24);rod('ghost',(s*.44,1.05,-1.05),(s*.63,1.51,-1.21),.24,.015)

monster('mist-crane','veilhaven','wing',1)
part('body',(0,1.32,-.17));orb('ivory',0,1.39,-.13,.28,.44,.53)
part('head',(0,1.59,.27));rod('ivory',(0,1.59,.27),(.04,2.21,.20),.13,.09);orb('cream',.04,2.27,.27,.17,.20,.20,10,6);orb('red',.04,2.44,.25,.12,.06,.13,8,4)
rod('gold',(.04,2.28,.40),(.04,2.21,1.08),.09,.008);eye(-.09,2.31,.38,.034,'cyan');eye(.16,2.31,.38,.034,'cyan')
for s,label in [(-1,'left-wing'),(1,'right-wing')]:
 part(label,(s*.22,1.62,-.08))
 for j in range(7):rod('silk' if j%2 else 'ivory',(s*(.26+j*.04),1.60,-.05),(s*(1.0-j*.06),1.27-j*.035,-.28-j*.13),.08,.012)
for s,label in [(-1,'left-leg'),(1,'right-leg')]:
 part(label,(s*.13,1.06,-.1));rod('red',(s*.13,1.06,-.1),(s*.14,.10,.01),.039)
 for j in [-1,0,1]:rod('gold',(s*.14,.10,.01),(s*.14+j*.09,.055,.29),.025,.012)
part('tail',(0,1.38,-.51))
for j in range(7):rod('silk',((j-3)*.04,1.35,-.49),((j-3)*.075,1.05,-1.17),.062,.007)

monster('temple-ronin','veilhaven','melee',1)
humanoid_body('robe','gold');limbs('robe','gold',True);current='body'
for row in range(5):
 for col in range(4):box('red' if row%2 else 'jadedark',-.29+col*.19,1.26+row*.135,.34,.16,.105,.07)
part('head',(0,2.07,0));orb('cream',0,2.27,.02,.26,.27,.24);box('red',0,2.22,.27,.45,.12,.05)
for s in [-1,1]:eye(s*.12,2.35,.263,.045,'cyan')
rod('leather',(0,2.51,0),(0,2.65,0),.60,.04,12)
for s in [-1,1]:rod('gold',(s*.11,2.45,.3),(s*.40,2.72,.22),.043,.02)
hold_weapon('right','sword','steel','cyan')
part('scabbard',(-.34,1.10,-.27));rod('jadedark',(-.35,.52,-.33),(-.52,1.64,-.18),.077)
for y in [.73,.97,1.2]:ring('gold',-.42,y,-.25,.077,.019,8)
part('banner',(0,1.89,-.28))
for j in range(6):box('cream',0,1.71-j*.22,-.38,.41,.28,.06);rune(0,1.73-j*.22,-.42,'red',.18)

monster('incense-acolyte','veilhaven','caster',.88)
humanoid_body('silk','gold');limbs('silk','gold',True,True);current='body'
for s in [-1,1]:
 for j in range(7):orb('gold',s*(.12+j*.026),1.96-j*.087,.37,.039,.039,.039,8,4)
for j in range(5):rune(0,1.74-j*.19,.38,'cyan',.23)
current='head';box('cream',0,2.31,.27,.40,.37,.08);eye(-.12,2.37,.32,.04,'cyan');eye(.12,2.37,.32,.04,'cyan')
box('jade',0,2.55,0,.57,.20,.48)
for j in range(3):box('gold',0,2.69+j*.06,0,.48-j*.12,.07,.39-j*.08)
hold_weapon('right','staff','gold','cyan');hold_weapon('left','censer','gold','ghost')
part('incense-rack',(0,1.50,-.34))
for j in range(7):rod('copper',(-.24+j*.08,1.41,-.36),(-.24+j*.08,2.32+(j%2)*.18,-.36),.018);orb('fire',-.24+j*.08,2.33+(j%2)*.18,-.36,.032,.039,.032,6,4)

monster('jade-lion','veilhaven','quadruped',1.26)
part('body',(0,.84,-.05));orb('jade',0,.88,-.1,.43,.48,.79)
for j in range(5):ring('gold',0,.90,-.66+j*.27,.43,.031,12,True)
part('head',(0,1.09,.62));orb('jadedark',0,1.13,.60,.58,.58,.35)
for j in range(12):
 a=j*math.tau/12;orb('jadelight',.43*math.cos(a),1.15+.43*math.sin(a),.79,.14,.14,.13,8,4);ring('gold',.43*math.cos(a),1.15+.43*math.sin(a),.90,.09,.017,10,True)
jaw(0,1.14,.90,1.15,'jade','cyan');box('gold',0,1.37,1.03,.30,.09,.06)
paws('jade','gold',.80,.58,.36)
tail_chain('jadedark',[(0,1.02,-.84),(.28,1.18,-1.18),(.41,1.49,-1.19),(.21,1.65,-1.06)],.10)

monster('mourning-mask','veilhaven','float',1)
part('body',(0,1.21,0));orb('ghost',0,1.25,-.04,.31,.44,.13,12,6)
part('head',(0,1.31,.04));orb('ivory',0,1.40,.10,.47,.57,.18,14,8)
for s in [-1,1]:
 orb('ink',s*.20,1.53,.27,.11,.06,.035,8,4);rod('cyan',(s*.20,1.48,.28),(s*.14,1.12,.28),.025,.009)
orb('ink',0,1.13,.28,.12,.10,.018,8,4);rod('gold',(0,1.50,.29),(0,1.30,.32),.065,.045)
ring('gold',0,1.42,-.10,.66,.038,24,True)
for i in range(8):
 a=i*math.tau/8;part('ribbon-'+str(i),(.45*math.cos(a),1.4+.45*math.sin(a),-.08))
 for j in range(4):box('silk',(.53+j*.13)*math.cos(a),1.4+(.53+j*.13)*math.sin(a),-.10-j*.045,.18,.12,.035,rz=a)
part('veil',(0,1.10,-.04),'head')
for s in [-1,1]:
 for j in range(5):box('robe',s*(.20+.045*j),1.00-j*.15,-.08,.17,.19,.055)

monster('spirit-koi','veilhaven','fish',1)
part('body',(0,.79,0));orb('ivory',0,.84,0,.33,.32,.84,12,8)
for row in range(6):
 zz=-.57+row*.21
 for j in range(7):
  a=j*math.tau/7;orb('gold' if (row+j)%4==0 else 'jade',.29*math.cos(a),.84+.28*math.sin(a),zz,.06,.055,.11,6,4)
part('head',(0,.84,.64));orb('ivory',0,.84,.68,.30,.27,.31,12,6)
for s in [-1,1]:
 eye(s*.21,.93,.91,.045,'cyan');rod('gold',(s*.16,.78,.90),(s*.43,.74,1.16),.02,.01)
part('tail',(0,.84,-.73))
for s in [-1,1]:
 polygon('ghost',[(0,.84,-.72),(s*.60,1.10,-1.38),(s*.50,.57,-1.35),(0,.84,-1.06)],[(0,1,3),(0,3,2)])
 for j in range(6):rod('gold',(0,.84,-.73),(s*(.20+j*.065),.59+j*.09,-1.32),.012)
for s,label in [(-1,'left-fin'),(1,'right-fin')]:
 part(label,(s*.24,.85,.33));polygon('ghost',[(s*.24,.85,.33),(s*.75,.76,-.06),(s*.50,.70,-.37)],[(0,1,2)])
 for j in range(6):rod('gold',(s*.24,.85,.33),(s*(.45+j*.05),.71+j*.01,-.30+j*.05),.012)
part('dorsal',(0,1.08,-.06));polygon('jade',[(0,1.09,.50),(0,1.53,-.1),(0,1.08,-.69)],[(0,1,2)])
for j in range(7):rod('gold',(0,1.09,.41-j*.15),(0,1.48-j*.055,-.12-j*.065),.014)

# Replace the original armed creatures' complete hand+weapon source geometry too.
for name,loadout in {
 'plague-alchemist':[('right','staff','copper','venom')],
 'plague-abomination':[('right','cleaver','iron','venom')],
 'furnace-revenant':[('right','axe','steel','fire')],
 'anvil-warden':[('right','hammer','iron','fire')],
 'pyrelord-ignivar':[('right','sword','gold','fire')],
 'lantern-wraith':[('right','lantern','gold','cyan')],
 'jade-sentinel':[('right','spear','gold','cyan')],
 'bellkeeper-shen':[('left','mallet','gold','cyan'),('right','bell','gold','cyan')],
 'veiled-abbess':[('right','staff','gold','cyan'),('left','censer','gold','cyan')],
}.items():
 active=name
 for legacy in {'lantern-wraith':['lantern'],'bellkeeper-shen':['bell'],'veiled-abbess':['censer']}.get(name,[]):parts[name].pop(legacy,None)
 for side,kind,metal,glow in loadout:hold_weapon(side,kind,metal,glow)

# Crafted weapon construction, always kept inside the same rigid grip frame.
for weapon_owner,weapon_entries in grips.items():
 active=weapon_owner
 for entry in weapon_entries:
  current=entry['side']+'-weapon';x,y,z=entry['pivot'];kind=entry['kind'];theme=configs[active]['theme'];metal='copper' if theme=='plagueworks' else 'iron' if theme=='emberfall' else 'gold';accent='venom' if theme=='plagueworks' else 'fire' if theme=='emberfall' else 'cyan'
  for yy in [.71,.77,1.26,1.33]:
   ring(metal,x,yy,z,.067,.012,8)
   box('leather',x,yy+.018,z+.055,.075,.025,.020)
  if kind in ('hammer','mallet'):
   head_y=2.37 if kind=='hammer' else 2.0;w=1.16 if kind=='hammer' else .52
   plate('iron',metal,x,head_y,z+.281,w-.13,.34,.045,.025)
   for side in [-1,1]:
    box('steel',x+side*(w/2+.025),head_y,z,.08,.43,.53)
    for yy in [head_y-.13,head_y+.13]:stud('gold',x+side*w*.36,yy,z+.322,.026)
   for dx in [-w*.25,0,w*.25]:box(accent,x+dx,head_y+.33,z,.045,.017,.39)
  elif kind in ('axe','cleaver'):
   plate('iron',metal,x+(1 if entry['side']=='right' else -1)*.17,1.83,z+.095,.47,.32,.031,.025)
   for dx in [-.02,.19]:stud('gold',x+dx,1.93,z+.125,.032)
  elif kind=='sword':
   for side in [-1,1]:chamfer(metal,x+side*.26,1.49,z,.11,.13,.19,.025)
   plate(accent,metal,x,1.47,z+.111,.10,.13,.025,.02)
  elif kind=='staff':
   if theme=='plagueworks':
    for zz in [z-.12,z+.12]:rod('copper',(x-.19,2.31,zz),(x-.19,2.63,zz),.028);rod('copper',(x+.19,2.31,zz),(x+.19,2.63,zz),.028)
    for yy in [2.29,2.64]:box('iron',x,yy,z,.42,.065,.28)
    for dx in [-.10,0,.10]:box('venom',x+dx,2.47,z+.122,.045,.17,.025)
   elif theme=='emberfall':
    for side in [-1,1]:box('coal',x+side*.20,2.48,z,.09,.45,.18);box('copper',x+side*.20,2.68,z,.13,.07,.23)
    for yy in [2.32,2.61]:box('gold',x,yy,z,.44,.04,.16)
   else:
    for side in [-1,1]:
     rod('gold',(x+side*.20,2.44,z),(x+side*.28,2.44,z),.024,n=4)
     box('red',x+side*.29,2.28,z,.115,.32,.025)
     for j in range(3):box('gold',x+side*.29,2.20+j*.07,z+.022,.059,.021,.012)
  elif kind in ('censer','lantern','bell'):
   for side in [-1,1]:box(metal,x+side*.13,.60,z,.055,.09,.28)
   if theme=='veilhaven':
    for side in [-1,1]:box('red',x+side*.22,.43,z,.055,.22,.018)

# Purposeful theme detail is authored in the same rigid parts, before normalization.
for detail_file in ['themed-plague-details.py','themed-ember-details.py','themed-veil-details.py']:
 exec(compile((ROOT/'scripts'/detail_file).read_text(), detail_file, 'exec'), globals())

# Catalog heights refer to complete silhouettes; author the new shapes to these targets.
TARGET_HEIGHTS={'bone-rat':.72,'corpse-scarab':.90,'mire-leech':.75,'crypt-bat':1.8,'fungal-thrall':2.3,'plague-knight':2.8,'carrion-hound':1.35,'sewer-horror':3.2,'ember-imp':1.25,'cinder-hound':1.45,'forge-spider':1.1,'brass-sentinel':3.1,'slag-elemental':2.5,'ash-drake':2.4,'furnace-priest':2.8,'chain-jailer':3.1,'paper-shikigami':1.6,'grave-fox':1.4,'mist-crane':2.7,'temple-ronin':2.7,'incense-acolyte':2.55,'jade-lion':2.1,'mourning-mask':2.1,'spirit-koi':1.4}
for name,height in TARGET_HEIGHTS.items():
 highest=max(point[2]+data['pivot'][1] for data in parts[name].values() for point in data['vertices'])
 configs[name]['scale']=height/highest
