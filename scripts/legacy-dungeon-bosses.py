"""Eight original chamber bosses, executed by build-themed-monsters.py --legacy-bosses.

Literal block anatomy, layered crafted surfaces and rigid articulated weapons.
All authoring coordinates are metres, Y-up and +Z-front before export.
"""
for key,value in {'bark':'554633','barklight':'897052','leaf':'73965C','leaflight':'B6C984','bronze':'A58A53','heartlight':'DDF59B','ice':'99BCCD','icewhite':'D8EDF0','iceblue':'4E7995','iceglow':'8FEAFF','nightbark':'322E43','nightedge':'635275','thorn':'897E96','voidlight':'D391EF','ritual':'494965','deepred':'622C3D'}.items():
 COLORS[key]=tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,)
GLOW_TINTS.update(['heartlight','iceglow','voidlight'])
grips={}
LEGACY_IDS=['twinlight-sentinel','heartkeeper','cinder-castellan','cinder-colossus','rimebound-guardian','rime-sovereign','eclipse-keeper','dreadheart']
VOXEL_ANATOMY.update(LEGACY_IDS)

def block_beam(tint,a,b,width,depth=None,end=None):
 """Square-section taper for roots, horns and load-bearing anatomy."""
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
 if u.length<.01:u=axis.cross(Vector((1,0,0)))
 u.normalize();v=axis.cross(u);depth=width if depth is None else depth;end=1 if end is None else end
 vertices=[p+u*width*s*x/2+v*depth*s*y/2 for p,s in [(a,1),(b,end)] for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 polygon(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])

def crest(tint,trim,x,y,z,w=.64,h=.66):
 plate(tint,trim,x,y,z,w,h,.10)
 rune(x,y,z+.082,trim,h*.62)
 for side in [-1,1]:stud(trim,x+side*w*.34,y-h*.34,z+.084,.04)

def block_legs(tint,trim,x=.30,hip=1.08,foot=.44):
 for side,label in [(-1,'left-leg'),(1,'right-leg')]:
  part(label,(side*x,hip,0))
  box(tint,side*x,hip*.72,0,foot*.82,hip*.51,foot*.92)
  plate(tint,trim,side*x,hip*.53,foot*.48,foot*.86,.22,.08)
  part(label+'-shin',(side*x,hip*.46,0),label)
  box(tint,side*x,hip*.27,.01,foot*.82,hip*.36,foot*.91)
  box(trim,side*x,.12,.13,foot,.24,foot*1.48)
  for j in range(3):box(tint,side*x+(j-1)*foot*.26,.16,.13+foot*.69,foot*.21,.13,.12)

def block_arms(tint,trim,shoulder=.66,y=1.96,hand_y=1.15,hand_x=.78,width=.36):
 for side,label in [(-1,'left-arm'),(1,'right-arm')]:
  part(label,(side*shoulder,y,0))
  box(tint,side*(shoulder+.04),y,0,width*1.5,.37,width*1.5)
  box(trim,side*(shoulder+.04),y+.20,.015,width*1.6,.07,width*1.6)
  block_beam(tint,(side*(shoulder+.03),y-.06,0),(side*hand_x,hand_y+.2,.08),width*.72)
  part('left-hand' if side<0 else 'right-hand',(side*hand_x,hand_y+.28,.08),label)
  box(tint,side*hand_x,hand_y,.10,width,.48,width*.95)
  box(trim,side*hand_x,hand_y+.04,.10+width*.49,width*1.04,.12,.07)
  for j in range(3):box(trim,side*hand_x+(j-1)*width*.27,hand_y-.25,.17,width*.22,.18,.15)

def held_weapon(side,kind,tint,glow,x=None,y=1.06,z=.47):
 """A square palm wraps the actual handle; weapon is a child of that hand."""
 global current
 sign=1 if side=='right' else -1;x=sign*.98 if x is None else x;hand=side+'-hand';weapon=side+'-weapon'
 data=parts[active][hand]
 for field in ('vertices','faces','colors','materials'):data[field]=[]
 current=hand;pivot=data['pivot'];radius=.055
 block_beam(tint,pivot,(x,y+.19,z-.17),.24)
 box(tint,x,y,z-.16,.28,.34,.18)
 # Three open square fingers and opposed thumb enclose, rather than cross, the shaft.
 for dy in [-.105,0,.105]:
  for dx in [-.088,.088]:box('silver' if tint=='iceblue' else tint,x+dx,y+dy,z,.056,.076,.23)
  box('silver' if tint=='iceblue' else tint,x,y+dy,z+.087,.12,.076,.056)
 box(tint,x-sign*.13,y+.19,z+.03,.09,.12,.19)
 part(weapon,(x,y,z),hand)
 low=.27;high=2.84 if kind in ('glaive','staff') else 2.32
 rod('leather' if tint!='iceblue' else 'iceblue',(x,low,z),(x,high,z),radius,n=8)
 for yy in [y-.27,y+.27]:ring(tint,x,yy,z,.080,.020,8)
 if kind=='glaive':
  box('bronze',x,2.36,z,.52,.12,.24)
  polygon('silver',[(x+dx,yy,z+zz) for zz in [-.055,.055] for dx,yy in [(-.09,2.37),(.18,2.48),(.32,2.90),(.04,3.31),(-.13,2.89)]],[(4,3,2,1,0),(5,6,7,8,9)]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)])
  box(glow,x+.015,2.82,z+.062,.052,.62,.025)
 elif kind=='greatsword':
  box(tint,x,1.56,z,.77,.15,.28)
  polygon('steel',[(x+dx,yy,z+zz) for zz in [-.075,.075] for dx,yy in [(-.19,1.62),(.19,1.62),(.19,2.54),(0,2.91),(-.19,2.54)]],[(4,3,2,1,0),(5,6,7,8,9)]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)])
  box('coal',x,2.12,z+.085,.12,.90,.025);box(glow,x,2.14,z+.108,.042,.80,.022)
  for yy in [1.48,1.85,2.25]:rune(x,yy,z+.128,'gold',.15)
 elif kind=='hammer':
  box(tint,x,2.33,z,1.16,.58,.61);box('ice',x,2.68,z,1.34,.13,.70)
  for dx in [-.40,0,.40]:crest('iceblue','icewhite',x+dx,2.34,z+.34,.29,.35)
  for dx in [-.63,.63]:block_beam('ice',(x+dx,2.32,z),(x+dx*1.20,2.71,z),.18,end=.08)
  box(glow,x,2.32,z-.34,.75,.24,.04)
 else:
  box('nightbark',x,2.70,z,.17,.65,.18)
  for side_tip in [-1,1]:
   block_beam(tint,(x,2.51,z),(x+side_tip*.38,2.91,z),.12,end=.55)
   block_beam(tint,(x+side_tip*.38,2.91,z),(x+side_tip*.25,3.18,z),.09,end=.05)
  box(glow,x,2.91,z,.23,.37,.19,rz=.30)
  for j in range(3):box('gold',x,1.67+j*.29,z+.077,.09,.13,.035)
 grips.setdefault(active,[]).append({'side':side,'pivot':(x,y,z),'shaft':[(x,low,z),(x,high,z)],'radius':radius,'kind':kind})

# ROOTVAULT midpoint: two-faced bronze guardian with a leaf fan, tower shield and glaive.
monster('twinlight-sentinel','rootvault','melee',1.28)
part('body',(0,1.41,0));box('jadedark',0,1.53,0,.90,.93,.59);box('bronze',0,1.96,0,1.20,.22,.68)
for row in range(4):
 for col in range(3):plate('bark' if col==1 else 'jadedark','bronze',(col-1)*.29,1.30+row*.18,.33,.26,.16,.05)
box('bronze',0,1.06,0,.98,.16,.67);crest('heartlight','gold',0,1.72,.43,.30,.41)
block_legs('jadedark','bronze',.29,1.04,.46);block_arms('bronze','gold',.67,2.02,1.16,.81,.36)
part('head',(0,2.15,0));box('bronze',0,2.45,0,.79,.61,.56)
for side in [-1,1]:
 plate('jadedark','gold',side*.20,2.46,.30,.33,.49,.08)
 eye(side*.22,2.52,.384,.067,'heartlight');box('bronze',side*.20,2.30,.382,.19,.10,.075)
 block_beam('bark',(side*.29,2.65,-.08),(side*.49,2.91,-.12),.14,end=.7)
 for j in range(3):box('leaflight' if j%2 else 'leaf',side*(.47+j*.13),2.88-j*.13,-.15,.30,.17,.12,rz=side*.55)
box('gold',0,2.76,.05,.86,.09,.61);rune(0,2.77,.382,'heartlight',.23)
held_weapon('right','glaive','bronze','heartlight')
current='left-hand';plate('jadedark','bronze',-.81,1.19,.37,.71,1.22,.20)
for y in [.71,1.23,1.74]:box('gold',-.81,y,.50,.60,.09,.05)
crest('leaf','gold',-.81,1.23,.55,.38,.48)
part('tabard',(0,1.07,.32))
for i in range(4):box('leaf',0,.91-i*.15,.34,.38,.18,.085);rune(0,.90-i*.15,.39,'gold',.16)

# ROOTVAULT finale: living cedar giant; a split trunk exposes a warm faceted heart.
monster('heartkeeper','rootvault','heavy',1)
part('body',(0,2.08,0));box('bark',0,2.11,0,1.42,1.72,.90)
for side in [-1,1]:
 for row in range(5):box('barklight' if row%2 else 'bark',side*(.50+row*.025),1.38+row*.32,.24,.39,.42,.68,rz=-side*.08)
block_legs('bark','barklight',.49,1.42,.67)
current='body';box('ink',0,2.11,.50,.73,.97,.14);box('heartlight',0,2.15,.61,.48,.67,.18,rz=.15)
for side in [-1,1]:
 block_beam('bronze',(side*.38,1.62,.64),(side*.45,2.51,.64),.14)
 for row in range(3):block_beam('barklight',(side*.61,1.75+row*.28,.55),(side*.28,1.89+row*.28,.66),.16,end=.65)
block_arms('bark','leaf',.95,2.78,1.65,1.19,.58)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
 current=label
 for i in range(3):box('leaflight' if i==0 else 'leaf',side*(.93+i*.23),2.96-i*.13,-.07,.45,.20,.63,rz=-side*.14)
 current='left-hand' if side<0 else 'right-hand'
 for i in range(3):block_beam('barklight',(side*1.2+(i-1)*.18,1.41,.20),(side*1.23+(i-1)*.22,1.00,.48),.14,end=.20)
part('head',(0,3.02,0));box('barklight',0,3.36,.04,.90,.75,.75)
box('bark',0,3.35,.43,.74,.29,.11)
for side in [-1,1]:eye(side*.23,3.50,.49,.09,'heartlight');box('bark',side*.26,3.07,.44,.20,.35,.17)
box('bronze',0,3.69,0,1.10,.13,.81)
for side in [-1,1]:
 block_beam('bark',(side*.34,3.65,-.07),(side*.67,4.12,-.11),.24,end=.68)
 block_beam('bark',(side*.67,4.12,-.11),(side*.44,4.66,-.17),.16,end=.08)
 block_beam('barklight',(side*.58,4.01,-.12),(side*1.07,4.23,-.17),.15,end=.05)
 for j in range(3):box('leaflight' if j==1 else 'leaf',side*(.54+j*.24),4.12+(j%2)*.23,-.19,.49,.22,.49,rz=side*.15)
box('heartlight',0,3.87,.01,.23,.37,.21,rz=.3)
part('cape',(0,2.83,-.49))
for col in range(5):box('leaf',-.68+col*.34,2.54-(col%2)*.22,-.52,.40,.85,.15)

# CINDERCRYPT midpoint: a funerary castellated helm above blackened plate and a greatsword.
monster('cinder-castellan','cindercrypt','melee',1.35)
part('body',(0,1.37,0));box('coal',0,1.54,0,1.02,1.05,.65)
for row in range(4):plate('iron','copper',0,1.25+row*.20,.38,.97-row*.13,.19,.07)
box('gold',0,1.03,.03,1.0,.16,.74);crest('fire','gold',0,1.76,.50,.26,.33)
block_legs('iron','copper',.32,1.05,.49);block_arms('iron','copper',.71,2.01,1.13,.85,.44)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
 current=label;box('coal',side*.78,2.05,0,.72,.39,.73)
 for i in range(3):box('copper',side*(.51+i*.26),2.31,.02,.16,.25,.69)
 for z in [-.24,.24]:stud('gold',side*.79,2.08,z+.20,.051)
part('head',(0,2.13,0));box('coal',0,2.39,0,.70,.61,.67)
plate('iron','copper',0,2.37,.35,.65,.52,.09)
for x in [-.22,-.11,0,.11,.22]:box('fire',x,2.43,.419,.052,.15,.025)
for i in range(3):box('copper',(i-1)*.25,2.79,.04,.16,.31,.61)
box('gold',0,2.62,.02,.81,.09,.75);box('iron',0,2.23,.437,.45,.05,.055)
held_weapon('right','greatsword','copper','fire',x=1.07)
current='left-hand';plate('coal','copper',-.85,1.16,.44,.57,.73,.18);rune(-.85,1.15,.56,'fire',.40)
part('cape',(0,1.96,-.37))
for row in range(7):box('deepred',0,1.83-row*.22,-.45,.99,.29,.12)
for x in [-.4,.4]:box('gold',x,1.08,-.526,.055,1.56,.022)
part('tabard',(0,1.08,.39))
for row in range(4):box('deepred',0,.89-row*.17,.39,.43,.22,.09)
rune(0,.65,.46,'gold',.45)

# CINDERCRYPT finale: squat furnace creature, with a chimney mantle and piston fists.
monster('cinder-colossus','cindercrypt','heavy',1.12)
part('body',(0,1.79,0));box('basalt',0,1.98,0,1.98,1.70,1.12)
box('coal',0,1.98,.62,1.48,1.24,.17);box('fire',0,1.96,.73,1.19,.97,.09)
for x in [-.50,-.25,0,.25,.50]:box('iron',x,1.97,.812,.11,1.08,.12)
for y in [1.33,2.61]:box('copper',0,y,.73,1.73,.15,.24)
for side in [-1,1]:
 for row in range(4):box('iron',side*.88,1.43+row*.39,.58,.32,.30,.34);stud('gold',side*.88,1.43+row*.39,.78,.071)
 box('iron',side*.62,2.96,-.40,.50,.89,.49);box('coal',side*.62,3.38,-.40,.58,.11,.56)
 box('fire',side*.62,3.45,-.4,.32,.12,.32)
block_legs('basalt','iron',.60,1.16,.75)
block_arms('basalt','copper',1.21,2.45,1.18,1.47,.70)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
 current=label
 box('iron',side*1.29,2.50,0,.89,.59,.91)
 for z in [-.32,.32]:block_beam('copper',(side*1.35,2.4,z),(side*1.52,1.55,z),.11)
 current='left-hand' if side<0 else 'right-hand';box('iron',side*1.49,1.19,.10,.91,.77,.91)
 for j in range(3):box('copper',side*1.49+(j-1)*.27,1.23,.605,.20,.52,.14)
 box('fire',side*1.49,.98,.53,.62,.09,.15)
part('head',(0,2.88,.23));box('coal',0,3.10,.24,1.04,.52,.72)
for side in [-1,1]:eye(side*.26,3.20,.631,.10,'hot')
box('iron',0,3.00,.64,.89,.13,.20)
for x in [-.3,0,.3]:box('copper',x,3.40,.22,.17,.27,.62)
part('flywheel',(0,2.08,-.63));ring('copper',0,2.08,-.69,.66,.09,12,True)
for i in range(4):
 a=i*math.pi/2;block_beam('iron',(0,2.08,-.72),(.60*math.cos(a),2.08+.60*math.sin(a),-.72),.12)

# FROSTHOLLOW midpoint: an asymmetric crystalline armor guardian carrying a glacier hammer.
monster('rimebound-guardian','frosthollow','hammer',1.29)
part('body',(0,1.40,0));box('iceblue',0,1.55,0,1.0,1.06,.63)
for row in range(4):plate('ice','silver',0,1.23+row*.20,.37,.91-row*.12,.19,.07)
crest('iceglow','icewhite',0,1.78,.49,.32,.41)
block_legs('iceblue','icewhite',.30,1.06,.50);block_arms('iceblue','silver',.70,2.02,1.18,.83,.43)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
 current=label;box('ice',side*.72,2.06,0,.76,.37,.71)
 for i in range(3):block_beam('icewhite' if i==1 else 'ice',(side*(.48+i*.25),2.21,0),(side*(.56+i*.29),2.63+(i%2)*.19,-.10),.24,end=.05)
part('head',(0,2.14,0));box('iceblue',0,2.42,.02,.64,.59,.61)
plate('ice','silver',0,2.43,.35,.57,.48,.065)
for side in [-1,1]:eye(side*.15,2.47,.403,.06,'iceglow')
box('icewhite',0,2.68,.04,.76,.08,.64)
for side in [-1,1]:block_beam('ice',(side*.25,2.63,-.1),(side*.40,3.15,-.18),.19,end=.05)
held_weapon('right','hammer','iceblue','iceglow',x=1.06)
current='left-hand';plate('iceblue','icewhite',-.83,1.29,.44,.58,.77,.20)
for y in [1.04,1.30,1.56]:box('iceglow',-.83,y,.564,.31,.07,.031)
part('tabard',(0,1.07,.36))
for row in range(4):box('robe',0,.90-row*.17,.37,.39,.23,.085);rune(0,.9-row*.17,.43,'icewhite',.17)

# FROSTHOLLOW finale: shaggy ancient yeti with broad forearms, tusks and an ice crown.
monster('rime-sovereign','frosthollow','heavy',1.05)
part('body',(0,2.00,0));box('icewhite',0,2.06,0,1.69,1.87,1.05)
for side in [-1,1]:
 for row in range(5):box('silver' if row%2 else 'icewhite',side*.63,1.43+row*.35,.34,.51,.42,.52,rz=side*.12)
box('iceblue',0,2.27,.55,.92,1.05,.11)
for row in range(5):box('ice',0,1.87+row*.17,.67,.83-row*.09,.13,.11)
crest('iceglow','silver',0,2.59,.79,.40,.39)
block_legs('icewhite','iceblue',.49,1.24,.73);block_arms('icewhite','ice',1.02,2.77,1.57,1.29,.76)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
 current=label
 for row in range(3):box('silver',side*(1.10+row*.045),2.76-row*.29,-.1,.94-row*.07,.22,.86)
 current='left-hand' if side<0 else 'right-hand';box('iceblue',side*1.30,1.48,.10,.81,.66,.76)
 for j in range(3):block_beam('icewhite',(side*1.30+(j-1)*.23,1.26,.38),(side*1.30+(j-1)*.27,.98,.63),.14,end=.08)
part('head',(0,3.05,.18));box('icewhite',0,3.47,.17,1.10,.89,.89)
box('iceblue',0,3.35,.643,.81,.44,.14);box('ink',0,3.25,.743,.54,.16,.055)
for side in [-1,1]:
 eye(side*.27,3.58,.65,.085,'iceglow')
 block_beam('ivory',(side*.26,3.20,.75),(side*.33,3.53,.85),.15,end=.08)
 box('silver',side*.45,3.25,.53,.29,.67,.38)
box('silver',0,3.90,.12,1.21,.12,.98)
for i in range(5):
 x=(i-2)*.25;block_beam('ice',(x,3.94,.02),(x*1.30,4.52-abs(i-2)*.11,-.05),.23,end=.07)
box('iceglow',0,4.15,.34,.18,.29,.09)
part('cape',(0,2.93,-.58))
for x in [-.62,-.31,0,.31,.62]:box('iceblue',x,2.28,-.64,.36,1.37,.18);box('ice',x,1.58,-.64,.25,.24,.22)

# NIGHTROOT midpoint: tall ritual keeper in segmented robes; crescent mask and living thorn staff.
monster('eclipse-keeper','nightroot','caster',1.23)
part('body',(0,1.49,0));box('ritual',0,1.67,0,.91,1.21,.61)
for row in range(5):plate('nightbark','thorn',0,1.23+row*.19,.37,.72-row*.065,.18,.065)
crest('voidlight','gold',0,1.83,.48,.26,.38)
block_legs('nightbark','thorn',.26,1.10,.42);block_arms('ritual','thorn',.65,2.14,1.27,.81,.35)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
 current=label
 for i in range(3):block_beam('nightbark',(side*(.49+i*.20),2.23,-.06),(side*(.60+i*.30),2.70-i*.15,-.19),.15,end=.04)
part('head',(0,2.25,0));box('nightbark',0,2.62,0,.56,.78,.55)
plate('bone','thorn',0,2.61,.31,.47,.64,.075)
for side in [-1,1]:eye(side*.12,2.67,.374,.052,'voidlight');box('nightedge',side*.13,2.48,.383,.045,.20,.022)
box('ink',0,2.47,.376,.08,.13,.03)
for side in [-1,1]:
 block_beam('thorn',(side*.20,2.93,-.02),(side*.49,3.15,-.14),.12,end=.70)
 block_beam('thorn',(side*.49,3.15,-.14),(side*.38,3.53,-.20),.084,end=.03)
held_weapon('right','staff','thorn','voidlight',x=1.02,y=1.17)
current='left-hand';box('voidlight',-.81,1.28,.36,.18,.25,.20,rz=.45)
for i in range(4):box('gold',-.81+(i-1.5)*.075,1.13,.36,.046,.09,.23)
for side in [-1,1]:
 part('robe-'+str(side),(side*.24,1.23,-.1))
 for row in range(6):box('ritual',side*(.29+row*.025),1.08-row*.145,-.05,.40,.21,.69)
 for row in range(4):rune(side*.34,.48+row*.18,.32,'voidlight',.19)
part('cape',(0,2.10,-.34))
for col in range(5):box('nightbark',(col-2)*.22,1.40-abs(col-2)*.05,-.47,.28,1.57,.17)

# NIGHTROOT finale: low, wide darkroot sovereign; antler crown, exposed heart and branch talons.
monster('dreadheart','nightroot','heavy',1.10)
part('body',(0,1.83,-.07));box('nightbark',0,1.98,-.12,1.78,1.67,1.13)
for side in [-1,1]:
 for row in range(4):box('nightedge',side*(.63+row*.025),1.43+row*.36,.26,.39,.41,.65,rz=side*.12)
block_legs('nightbark','thorn',.62,1.11,.72)
current='body';box('ink',0,1.91,.50,.91,1.10,.17);box('voidlight',0,1.94,.62,.54,.73,.22,rz=-.20)
for side in [-1,1]:
 for row in range(4):block_beam('thorn',(side*.75,1.43+row*.31,.52),(side*.30,1.58+row*.27,.69),.11,end=.80)
block_arms('nightbark','nightedge',1.13,2.59,1.32,1.57,.60)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
 current=label
 for i in range(3):block_beam('thorn',(side*(.91+i*.24),2.69,-.1),(side*(1.02+i*.36),3.21-i*.09,-.25),.19,end=.06)
 current='left-hand' if side<0 else 'right-hand'
 for j in range(4):
  xx=side*1.57+(j-1.5)*.16
  block_beam('thorn',(xx,1.14,.23),(xx+(j-1.5)*.045,.84,.54),.13,end=.65)
  block_beam('nightbark',(xx+(j-1.5)*.045,.84,.54),(xx+(j-1.5)*.04,1.01,.78),.08,end=.02)
part('head',(0,2.91,.03));box('nightedge',0,3.25,.04,.87,.77,.76)
plate('nightbark','thorn',0,3.28,.46,.75,.51,.08)
for side in [-1,1]:eye(side*.22,3.35,.525,.081,'voidlight');block_beam('thorn',(side*.29,3.03,.48),(side*.18,2.79,.61),.13,end=.05)
box('gold',0,3.66,0,1.05,.10,.82)
for side in [-1,1]:
 block_beam('nightbark',(side*.31,3.62,-.04),(side*.77,3.97,-.22),.21,end=.7)
 block_beam('thorn',(side*.77,3.97,-.22),(side*1.19,4.37,-.30),.15,end=.08)
 block_beam('thorn',(side*.65,3.90,-.20),(side*.61,4.59,-.23),.15,end=.07)
 block_beam('nightedge',(side*.95,4.14,-.27),(side*1.44,4.20,-.37),.12,end=.04)
box('voidlight',0,3.84,.14,.18,.31,.15,rz=.3)
part('tail',(0,1.78,-.72))
block_beam('nightbark',(0,1.78,-.72),(.32,1.00,-1.25),.29,end=.7)
block_beam('nightedge',(.32,1.00,-1.25),(.74,.53,-1.73),.21,end=.03)

def legacy_pose(name,label,suffix,t,rotation,move,scale):
 # Preserve common exact contact/recovery timing while giving the two giants their own gestures.
 if suffix not in ('attack','auto'):return
 points=[(0,0),(.32,0),(.5,1),(.59,.93),(.79,.25),(1,0)]
 hit=next((a+(b-a)*(t-x)/(y-x) for (x,a),(y,b) in zip(points,points[1:]) if x<=t<=y),0)
 if suffix=='auto':hit*=.5
 if name=='cinder-colossus' and label=='body':move[1]-=.17*hit;rotation[0]+=.14*hit
 if name=='rime-sovereign' and label=='left-arm':rotation[0]-=.40*hit;rotation[2]-=.16*hit
 if name=='heartkeeper' and label=='head':rotation[0]-=.11*hit
 if name=='dreadheart' and label=='body':rotation[1]-=.21*hit;move[2]+=.16*hit

def legacy_gallery():
 """Neutral and evaluated contact/death views of the actual exported rigid meshes."""
 scenes=[]
 world=bpy.data.worlds.new('Legacy boss gallery world');world.use_nodes=True
 world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.17,.22,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
 def scene_camera(name,width,height,at,target,ortho):
  scene=bpy.data.scenes.new(name);bpy.context.window.scene=scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100;scene.world=world;scene.view_settings.view_transform='AgX'
  bpy.ops.object.camera_add(location=xyz(*at));camera=bpy.context.object;aim(camera,target);camera.data.type='ORTHO';camera.data.ortho_scale=ortho;scene.camera=camera
  return scene,camera
 def label(scene,camera,text,x,y,size):
  data=bpy.data.curves.new(text,'FONT');data.body=text;data.size=size;data.align_x='CENTER';data.materials.append(text_mat);obj=bpy.data.objects.new(text,data);scene.collection.objects.link(obj);obj.parent=camera;obj.location=(x,y,-1)
 def lighting(scene):
  for at,power,size in [((-12,18,12),6500,12),((13,15,5),4900,10),((0,17,-13),8000,10)]:
   bpy.ops.object.light_add(type='AREA',location=xyz(*at));lamp=bpy.context.object;lamp.data.energy=power;lamp.data.size=size;aim(lamp,(0,2,0))
  cube((0,-.33,0),(90,.10,90),floor_mat)
 scene,camera=scene_camera('Eight legacy dungeon bosses',2000,1400,(10,20,40),(0,2,0),31)
 label(scene,camera,'DUNGEON SOVEREIGNS',0,9.70,.59)
 label(scene,camera,'Eight original voxel bosses  /  articulated armor, living roots and forged relics',0,8.94,.26)
 for i,name in enumerate(LEGACY_IDS):
  at=((i%4-1.5)*7.10,0,(i//4-.5)*12.5)
  copy_rig(name,scene,at);cube((at[0],-.14,at[2]),(6.3,.24,6.4),plinth_mat)
  bpy.context.view_layer.update();screen=camera.matrix_world.inverted()@Vector(xyz(at[0],.08,at[2]+3.0))
  label(scene,camera,name.replace('-',' ').title(),screen.x,screen.y-.25,.30)
  label(scene,camera,configs[name]['theme'].upper()+' / '+('MIDPOINT' if i%2==0 else 'FINAL BOSS'),screen.x,screen.y-.62,.19)
 lighting(scene);scene.render.filepath=str(ROOT/'assets/source/legacy-dungeon-bosses-preview.png');scenes.append(scene)
 for group in range(2):
  scene,camera=scene_camera('Legacy boss contact poses '+str(group+1),2000,1900,(0,29,44),(0,1.9,0),39)
  label(scene,camera,'AUTHORED BOSS CONTACT / '+('ROOTVAULT + CINDERCRYPT' if group==0 else 'FROSTHOLLOW + NIGHTROOT'),0,15.3,.49)
  for col,text in enumerate(['ANTICIPATION 32%','CONTACT 50%','RECOVERY 79%','GROUNDED DEATH']):label(scene,camera,text,(col-1.5)*8.0,14.30,.30)
  for row,name in enumerate(LEGACY_IDS[group*4:group*4+4]):
   for col,(pose,t) in enumerate([('attack',.32),('attack',.5),('attack',.79),('death',1)]):
    at=((col-1.5)*8.0,0,(row-1.5)*8.6);copy_rig(name,scene,at,pose,t);cube((at[0],-.14,at[2]),(7.1,.24,7.0),plinth_mat)
  lighting(scene);scene.render.filepath=str(ROOT/f'assets/source/legacy-dungeon-bosses-poses-{group+1}.png');scenes.append(scene)
 return scenes
