"""Veilhaven's twelve creatures: carved, folded and fastened surface construction.

Executed in the Blender builder namespace before height normalization. Every
detail is merged into an existing articulated part, retaining the authored rigs.
The low-resolution relief is deliberately visible from the gameplay camera.
"""

def vd_select(name, label):
 global active, current
 active=name; current=label
 assert label in parts[name], (name,label)

def vd_clear(name, label):
 vd_select(name,label)
 for field in ('vertices','faces','colors','materials'): parts[name][label][field]=[]

def vd_panel(tint, trim, x,y,z,w,h,d=.075, bevel=.035, ry=0, rz=0):
 """An eight-corner stone/cloth plate, with real stepped edge and inset face."""
 c=min(w,h)*.055
 outline=[(-w/2+c,-h/2),(w/2-c,-h/2),(w/2,-h/2+c),(w/2,h/2-c),
          (w/2-c,h/2),(-w/2+c,h/2),(-w/2,h/2-c),(-w/2,-h/2+c)]
 rotation=Euler((0,ry,rz),'XYZ').to_matrix()
 def transformed(points):return [rotation@Vector(p)+Vector((x,y,z)) for p in points]
 rear=transformed([(a,b,-d*.5) for a,b in outline])
 rim=transformed([(a,b,d*.22) for a,b in outline])
 inset=transformed([(a*(1-bevel*2),b*(1-bevel*2),d*.5) for a,b in outline])
 polygon(trim,rear+rim+inset,[tuple(range(7,-1,-1))]+[(i,(i+1)%8,8+(i+1)%8,8+i) for i in range(8)]+[(8+i,8+(i+1)%8,16+(i+1)%8,16+i) for i in range(8)])
 polygon(tint,inset,[tuple(range(8))])

def vd_fold(tint,trim,x,y,z,w,h,depth=.09,rz=0):
 """A folded textile/paper panel: two broad planes and a raised central seam."""
 rotation=Euler((0,0,rz),'XYZ').to_matrix()
 v=[(-w/2,-h/2,0),(0,-h/2,depth),(w/2,-h/2,0),(-w/2,h/2,0),(0,h/2,depth),(w/2,h/2,0)]
 front=[rotation@Vector(p)+Vector((x,y,z)) for p in v]
 back=[p-Vector((0,0,.028)) for p in front]
 polygon(tint,front+back,[(0,1,4,3),(1,2,5,4),(6,9,10,7),(7,10,11,8),(0,3,9,6),(2,8,11,5),(3,4,5,11,10,9),(0,6,7,8,2,1)])
 a=rotation@Vector((-w*.43,-h*.44,.015))+Vector((x,y,z))
 b=rotation@Vector((-w*.43,h*.44,.015))+Vector((x,y,z))
 rod(trim,a,b,.018,n=4)

def vd_fastener(x,y,z,size=.065,tint='gold'):
 vd_panel(tint,'jadedark',x,y,z,size*1.4,size, .035)
 box('ink',x,y,z+.025,size*.60,.018,.012)

def vd_lamella(x,y,z,cols=4,rows=3,w=.18,h=.13,tint='jade',ry=0):
 for row in range(rows):
  for col in range(cols):
   xx=x+(col-(cols-1)/2)*w*.94; yy=y-row*h*.85; zz=z+row*.022
   vd_panel('jadelight' if (row+col)%5==0 else tint,'jadedark',xx,yy,zz,w,h,.07,ry=ry)
   for side in [-1,1]: box('gold',xx+side*w*.24,yy+h*.30,zz+.048,.018,.024,.012)

def vd_talisman(x,y,z,w=.15,h=.38,tint='cream',rz=0):
 vd_fold(tint,'gold',x,y,z,w,h,.018,rz)
 box('red',x,y+h*.19,z+.036,w*.65,h*.20,.016,rz=rz)
 rune(x,y-h*.12,z+.036,'red',w*.70)

def vd_feather(tint,a,b,width=.11):
 """A three-step feather, with squared ends and a single broad ridge."""
 a=Vector(a);b=Vector(b);axis=(b-a).normalized();side=axis.cross(Vector((0,1,0)))
 if side.length<.05:side=Vector((1,0,0))
 side.normalize()
 for start,end,span in [(0,.48,1),(.48,.78,.77),(.78,1,.48)]:
  p=a.lerp(b,start);q=a.lerp(b,end);normal=Vector((0,.028,0))
  vertices=[p-side*width*span,p+side*width*span,q+side*width*span,q-side*width*span,
            p-side*width*span+normal,p+side*width*span+normal,q+side*width*span+normal,q-side*width*span+normal,
            p+normal*1.7,q+normal*1.7]
  polygon(tint,vertices,[(0,3,2,1),(0,1,5,8,4),(3,7,9,6,2),(0,4,7,3),(1,2,6,5),(4,8,9,7),(8,5,6,9)])

def vd_recolor(name,label,old,new):
 data=parts[name][label]
 for i,color in enumerate(data['colors']):
  if color==COLORS[old]:data['colors'][i]=COLORS[new];data['materials'][i]=0


# Lantern Wraith: hood clasp, wrapped funeral coat, folded shoulder cape and
# weighted sutra strips. The rear veil has structural hems instead of a slab.
vd_select('lantern-wraith','body')
for s in [-1,1]:
 vd_fold('cream','gold',s*.19,1.66,.365,.24,.77,.07,rz=s*-.27)
 vd_panel('silk','robe',s*.35,1.16,.31,.26,.30,.08,rz=s*.12)
 for j in range(3):vd_fastener(s*.23,1.75-j*.18,.444,.062)
 for j in range(3):vd_talisman(s*(.23+j*.095),.69+j*.08,.32,.12,.38,rz=s*.07)
vd_panel('jade','gold',0,1.05,.40,.31,.20,.08)
vd_clear('lantern-wraith','head')
box('robe',0,2.36,-.03,.70,.56,.54)
vd_panel('ink','silk',0,2.30,.27,.47,.42,.10)
for s in [-1,1]:
 eye(s*.12,2.33,.335,.047,'cyan')
 vd_fold('silk','cream',s*.28,2.25,.22,.18,.49,.10,rz=s*.13)
vd_panel('gold','jadedark',0,2.09,.33,.15,.14,.07)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 vd_select('lantern-wraith',label)
 for row in range(3):vd_fold('robe','silk',s*.68,1.99-row*.12,.16,.42,.19,.09)
vd_select('lantern-wraith','veil')
for s in [-1,1]:
 for row in range(5):vd_panel('silk','robe',s*.23,2.23-row*.19,-.36,.15,.23,.045,ry=math.pi)
vd_talisman(0,1.65,-.39,.21,.70)


# Jade Sentinel: rear cuirass and side hip plates make the lamellar armor wrap
# around the body; the helmet has separate cheek guards and a carved brow.
vd_select('jade-sentinel','body')
vd_lamella(0,1.88,-.37,5,5,.17,.14,'jade',math.pi)
for s in [-1,1]:
 for row in range(4):vd_panel('jade','gold',s*.47,1.06-row*.12,.01,.25,.18,.11,ry=s*math.pi/2)
 vd_panel('jadedark','gold',s*.31,1.17,.36,.24,.30,.10,rz=s*.09)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 vd_select('jade-sentinel',label)
 for row in range(4):
  vd_panel('jade','gold',s*(.66+row*.025),2.03-row*.105,.27,.46+row*.015,.17,.11)
  vd_panel('jade','jadedark',s*(.66+row*.025),2.03-row*.105,-.27,.46,.17,.08,ry=math.pi)
vd_clear('jade-sentinel','head')
vd_panel('jade','jadedark',0,2.29,.02,.62,.59,.54)
box('jadedark',0,2.51,.015,.84,.12,.68)
vd_panel('gold','jadedark',0,2.44,.335,.66,.10,.09)
for s in [-1,1]:
 eye(s*.14,2.34,.317,.05,'cyan')
 vd_panel('jade','gold',s*.25,2.21,.32,.18,.34,.11,rz=-s*.14)
 vd_panel('jadelight','jadedark',s*.33,2.28,-.02,.26,.37,.09,ry=s*math.pi/2)
box('jadedark',0,2.145,.31,.27,.065,.05)
vd_panel('gold','jadedark',0,2.62,.02,.17,.29,.13)


# Bellkeeper Shen: a five-part ceremonial costume, bell-shaped shoulder caps,
# lacquered hat, knotted sash, and an embroidered processional back banner.
vd_select('bellkeeper-shen','body')
for s in [-1,1]:
 vd_fold('cream','gold',s*.20,1.66,.39,.26,.87,.075,rz=-s*.26)
 for row in range(5):vd_fold('robe','gold',s*(.20+row*.035),.98-row*.13,.355,.23,.25,.09,rz=s*.07)
 vd_panel('silk','gold',s*.50,1.39,-.015,.36,.71,.12,ry=s*math.pi/2)
 for row in range(3):vd_fastener(s*.19,1.82-row*.15,.485,.075)
 vd_talisman(s*.40,.93,.36,.15,.43,rz=s*.12)
vd_panel('red','gold',0,1.05,.43,.36,.20,.10)
box('gold',0,1.05,.50,.12,.13,.07)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 vd_select('bellkeeper-shen',label)
 for row in range(4):
  vd_panel('silk','gold',s*.67,2.06-row*.12,.23,.51+row*.02,.20,.10)
  vd_panel('robe','gold',s*.67,2.06-row*.12,-.23,.51+row*.02,.20,.075,ry=math.pi)
vd_clear('bellkeeper-shen','head')
vd_panel('cream','silk',0,2.29,.06,.54,.52,.44)
for s in [-1,1]:
 eye(s*.135,2.35,.30,.045,'cyan')
 vd_panel('gold','jadedark',s*.25,2.24,.23,.15,.34,.06,rz=s*.10)
box('gold',0,2.24,.31,.07,.19,.065)
box('ink',0,2.12,.30,.19,.034,.017)
for row in range(3):
 vd_panel('robe','gold',0,2.57+row*.095,0,.91-row*.16,.13,.72-row*.14)
for s in [-1,1]:
 vd_panel('gold','robe',s*.42,2.49,0,.14,.30,.23,rz=s*-.16)
vd_select('bellkeeper-shen','banner')
for row in range(7):
 for s in [-1,1]:vd_panel('red','gold',s*.20,1.81-row*.18,-.38,.11,.22,.045,ry=math.pi)
vd_panel('jade','gold',0,1.64,-.405,.39,.43,.06,ry=math.pi)
for s in [-1,1]:
 vd_fastener(s*.15,1.91,-.415,.09)
 for row in range(3):vd_talisman(s*.19,.80-row*.10,-.405,.13,.24)


# Veiled Abbess: structured high collar, ivory stoles, sculpted sleeve layers,
# pierced halo vanes, temple crown and heavy bordered brocade on the rear veil.
vd_select('veiled-abbess','body')
for s in [-1,1]:
 vd_fold('cream','gold',s*.23,1.61,.40,.27,.91,.085,rz=-s*.16)
 vd_panel('robe','gold',s*.42,1.91,.03,.27,.43,.11,ry=s*.55,rz=-s*.22)
 for row in range(6):
  xx=s*(.21+row*.04);yy=1.03-row*.12
  vd_fold('cream','gold',xx,yy,.39,.20,.24,.06,rz=s*.08)
  vd_panel('jade','gold',xx,yy,.47,.10,.12,.032)
 for row in range(4):vd_fastener(s*.24,1.90-row*.16,.49,.07)
vd_panel('jadedark','gold',0,1.10,.47,.36,.23,.07)
vd_panel('jadelight','jade',0,1.10,.515,.16,.14,.026)
vd_clear('veiled-abbess','head')
vd_panel('ivory','cream',0,2.31,.055,.49,.56,.38)
for s in [-1,1]:
 eye(s*.11,2.36,.27,.037,'cyan')
 vd_fold('cream','gold',s*.20,2.22,.255,.14,.51,.045,rz=-s*.09)
box('cream',0,2.20,.275,.27,.20,.055)
for s in [-1,1]:vd_panel('gold','jadedark',s*.30,2.43,.07,.17,.44,.21,rz=-s*.12)
vd_panel('gold','jadedark',0,2.65,.04,.35,.42,.22)
vd_panel('jade','gold',0,2.65,.18,.15,.23,.04)
ring('gold',0,2.39,-.24,.61,.038,16,True)
for j in range(12):
 a=j*math.tau/12;xx=math.cos(a);yy=math.sin(a)
 vd_panel('gold','jadedark',xx*.63,2.39+yy*.63,-.24,.095,.21,.06,rz=a-math.pi/2)
 if j%3==0:vd_panel('jadelight','jade',xx*.63,2.39+yy*.63,-.19,.055,.085,.025,rz=a-math.pi/2)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 vd_select('veiled-abbess',label)
 for row in range(4):
  vd_fold('cream','gold',s*(.65+row*.035),1.97-row*.16,.20,.53+row*.04,.26,.11)
  vd_fold('robe','gold',s*(.65+row*.035),1.97-row*.16,-.30,.53+row*.04,.26,.07)
vd_select('veiled-abbess','veil')
for row in range(8):
 yy=2.38-row*.22
 for s in [-1,1]:vd_panel('cream','gold',s*(.26+row*.014),yy,-.39,.21,.27,.055,ry=math.pi)
 vd_panel('silk','cream',0,yy,-.39,.18,.19,.06,ry=math.pi,rz=math.pi/4)
 if row in [1,4,7]:vd_panel('jade','gold',0,yy,-.44,.095,.10,.022,ry=math.pi)


# Paper Shikigami: an actual folded paper doll, front envelope folds, wax seal,
# pleated limbs and a peaked paper mask. Back folds remain visible in movement.
vd_select('paper-shikigami','body')
for s in [-1,1]:
 vd_fold('ivory','cream',s*.14,1.44,.070,.30,.61,.045,rz=-s*.22)
 vd_fold('cream','ivory',s*.14,1.42,-.090,.25,.69,-.055,rz=s*.15)
vd_panel('red','leather',0,1.30,.145,.23,.22,.044)
rune(0,1.30,.176,'cream',.16)
vd_clear('paper-shikigami','head')
polygon('cream',[(-.27,1.94,-.05),(.27,1.94,-.05),(.27,2.29,-.05),(0,2.49,-.05),(-.27,2.29,-.05),(-.27,1.94,.06),(.27,1.94,.06),(.27,2.29,.06),(0,2.49,.06),(-.27,2.29,.06),(0,2.21,.11)],[(0,4,3,2,1),(0,1,6,5),(1,2,7,6),(2,3,8,7),(3,4,9,8),(4,0,5,9),(5,6,10),(6,7,10),(7,8,10),(8,9,10),(9,5,10)])
for s in [-1,1]:
 eye(s*.13,2.23,.09,.035,'cyan')
 box('red',s*.15,2.09,.091,.13,.031,.018,rz=s*.25)
vd_panel('red','cream',0,2.42,.06,.09,.10,.025)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 vd_select('paper-shikigami',label)
 for row in range(3):vd_fold('ivory','cream',s*(.48+row*.14),1.66-row*.06,.05,.20,.25,.035,rz=-s*.25)
 vd_talisman(s*.89,1.37,.07,.14,.30,rz=s*.06)
for s,label in [(-1,'left-leg'),(1,'right-leg')]:
 vd_select('paper-shikigami',label)
 for row in range(4):vd_fold('cream','ivory',s*.19,.88-row*.13,.055,.20,.16,.036)


# Grave Fox: long fox muzzle and planar cheek ruffs, large inset triangular
# ears, wrapped collar and three individually banded plumes, without shared jaws.
vd_clear('grave-fox','head')
vd_panel('cream','ivory',0,1.08,.62,.43,.43,.35)
polygon('ivory',[(-.20,1.11,.76),(.20,1.11,.76),(-.095,1.00,1.13),(.095,1.00,1.13),(-.16,.91,.78),(.16,.91,.78),(-.07,.94,1.12),(.07,.94,1.12)],[(0,1,3,2),(4,6,7,5),(0,2,6,4),(1,5,7,3),(2,3,7,6),(0,4,5,1)])
vd_panel('ink','red',0,1.015,1.145,.14,.075,.055)
for s in [-1,1]:
 eye(s*.15,1.15,.83,.044,'cyan')
 polygon('ivory',[(s*.12,1.21,.58),(s*.34,1.20,.53),(s*.30,1.59,.48),(s*.22,1.27,.47)],[(0,1,2),(0,2,3),(3,2,1),(0,3,1)])
 polygon('red',[(s*.17,1.28,.586),(s*.29,1.29,.551),(s*.282,1.49,.51)],[(0,1,2)])
 for row in range(3):vd_panel('ivory','cream',s*(.23+row*.055),1.04-row*.065,.67-row*.035,.20,.16,.16,rz=-s*.35)
 box('red',s*.18,1.095,.84,.055,.115,.025,rz=-s*.5)
vd_select('grave-fox','body')
for s in [-1,1]:
 vd_panel('cream','ivory',s*.20,.89,.16,.24,.44,.09,ry=s*.8,rz=s*.12)
 vd_panel('red','gold',s*.24,.77,.37,.13,.18,.08,ry=s*.5)
vd_panel('gold','red',0,.64,.45,.16,.18,.07)
vd_talisman(0,.47,.46,.13,.20)
for j in range(3):
 label='tail-'+str(j);vd_recolor('grave-fox',label,'ghost','ivory');vd_select('grave-fox',label);s=j-1
 for row in range(4):
  a=Vector((s*.19,.85,-.85)).lerp(Vector((s*.55,1.38,-1.16)),row/4)
  vd_panel('cream','ivory',a.x,a.y,a.z,.24,.25,.20,rz=-s*.27)
 vd_panel('red','cream',s*.39,1.04,-.99,.29,.11,.22,rz=-s*.20)


# Mist Crane: stacked coverts and flight feathers, broad carved shoulder fans,
# a long ivory beak with separate lower plane and a lacquered crown patch.
for s,label in [(-1,'left-wing'),(1,'right-wing')]:
 vd_select('mist-crane',label)
 for layer in range(3):
  for j in range(7):
   vd_feather('cream' if layer==0 else 'ivory' if layer==1 else 'silk',(s*(.29+layer*.11),1.65-layer*.06,-.09-j*.035),(s*(1.08-layer*.08-j*.035),1.34-layer*.065,-.29-j*.13),.075+layer*.01)
 for j in range(5):vd_panel('cream','ivory',s*(.28+j*.095),1.62-j*.035,-.09,.17,.18,.10,rz=s*.2)
vd_select('mist-crane','body')
for s in [-1,1]:
 for row in range(4):vd_panel('ivory','cream',s*.18,1.56-row*.13,.18-row*.04,.17,.22,.075,ry=s*.45)
vd_select('mist-crane','head')
polygon('ivory',[(-.035,2.29,.41),(.115,2.29,.41),(.04,2.25,1.12),(-.025,2.21,.41),(.105,2.21,.41),(.04,2.235,1.12)],[(0,1,2),(3,5,4),(0,2,5,3),(1,4,5,2),(0,3,4,1)])
box('ink',.04,2.255,.73,.018,.016,.49,rx=-.03)
vd_panel('red','cream',.04,2.42,.32,.23,.12,.07)
for s in [-1,1]:vd_panel('silk','ivory',.04+s*.125,2.25,.23,.15,.25,.05,ry=s*math.pi/2)
vd_select('mist-crane','tail')
for j in range(9):vd_feather('silk' if j%3==0 else 'cream',((j-4)*.034,1.37,-.50),((j-4)*.069,1.02,-1.19),.07)


# Temple Ronin: wrapped undercoat, hanging hip lamellae, shoulder guards, a
# layered travel hat and stitched back standard. Existing sword grip is untouched.
vd_select('temple-ronin','body')
for s in [-1,1]:
 vd_fold('cream','silk',s*.18,1.95,.33,.22,.40,.07,rz=-s*.31)
 vd_lamella(s*.31,1.12,.30,3,4,.15,.15,'jadedark')
 for row in range(4):vd_panel('red','gold',s*.48,1.02-row*.13,-.01,.30,.19,.09,ry=s*math.pi/2)
 vd_fastener(s*.29,1.89,.41,.09)
vd_lamella(0,1.78,-.34,4,4,.18,.15,'robe',math.pi)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 vd_select('temple-ronin',label)
 for row in range(4):vd_panel('jadedark','gold',s*.67,2.07-row*.105,.21,.53,.18,.10)
 for row in range(3):vd_panel('robe','red',s*.67,2.04-row*.12,-.22,.48,.19,.07,ry=math.pi)
vd_select('temple-ronin','head')
for row in range(3):rod('leather' if row!=1 else 'gold',(0,2.495+row*.045,0),(0,2.515+row*.045,0),.61-row*.13,.50-row*.13,8)
for s in [-1,1]:
 vd_panel('red','jadedark',s*.23,2.24,.24,.14,.31,.10,rz=-s*.18)
 vd_fastener(s*.14,2.21,.32,.052)
vd_select('temple-ronin','banner')
for row in range(6):
 for s in [-1,1]:vd_panel('cream','gold',s*.18,1.71-row*.22,-.435,.08,.26,.035,ry=math.pi)
vd_panel('red','gold',0,1.72,-.455,.23,.25,.04,ry=math.pi)


# Incense Acolyte: layered stole and hip folds, side ventilation on the ceramic
# mask, porcelain fasteners and a real wooden lattice supporting the incense.
vd_select('incense-acolyte','body')
for s in [-1,1]:
 vd_fold('cream','gold',s*.25,1.62,.42,.22,.79,.055,rz=-s*.11)
 for row in range(4):vd_fold('robe','silk',s*(.25+row*.035),1.03-row*.16,.30,.27,.27,.065)
 for row in range(4):vd_fastener(s*.24,1.87-row*.17,.493,.066,tint='ivory')
 vd_panel('silk','gold',s*.45,1.43,-.01,.28,.63,.08,ry=s*math.pi/2)
vd_select('incense-acolyte','head')
vd_panel('ivory','cream',0,2.285,.32,.42,.38,.08)
for s in [-1,1]:
 eye(s*.11,2.36,.374,.038,'cyan')
 for row in range(3):box('jadedark',s*.17,2.26-row*.048,.372,.07,.019,.013)
vd_panel('jade','gold',0,2.59,.27,.30,.15,.075)
vd_select('incense-acolyte','incense-rack')
for yy in [1.43,1.79,2.13]:box('leather',0,yy,-.42,.58,.10,.14)
for s in [-1,1]:
 box('leather',s*.26,1.78,-.415,.10,.80,.14)
 for yy in [1.45,2.12]:vd_fastener(s*.26,yy,-.505,.076)
vd_talisman(0,1.76,-.515,.25,.46)


# Jade Lion: replace the repeated jaw/mane circles with a square guardian face,
# spiral-cut cheek blocks, broad stone nose and stepped curls around the neck.
vd_clear('jade-lion','head')
vd_panel('jadedark','jade',0,1.13,.60,1.03,1.03,.41)
for j in range(10):
 a=j*math.tau/10;xx=.44*math.cos(a);yy=1.14+.44*math.sin(a)
 vd_panel('jade','jadedark',xx,yy,.78,.29,.31,.17,rz=a-math.pi/2)
 vd_panel('jadelight','jade',xx,yy,.895,.18,.19,.08,rz=a-math.pi/2)
vd_panel('jade','jadedark',0,1.16,.93,.63,.62,.32)
for s in [-1,1]:
 eye(s*.18,1.30,1.12,.06,'cyan')
 vd_panel('jadelight','jade',s*.26,1.40,1.09,.31,.13,.12,rz=s*.13)
 vd_panel('jade','jadedark',s*.23,1.05,1.17,.29,.26,.20)
 box('gold',s*.075,1.00,1.24,.045,.12,.055)
vd_panel('jadedark','gold',0,1.16,1.30,.26,.15,.09)
vd_panel('ink','jade',0,.955,1.16,.35,.07,.045)
vd_select('jade-lion','body')
vd_panel('jadedark','gold',0,1.31,-.10,.58,.72,.12,ry=0)
for s in [-1,1]:
 for row in range(4):
  vd_panel('jade','jadedark',s*.42,.96-row*.10,-.24,.26,.23,.11,ry=s*math.pi/2)
 for j in range(4):vd_panel('jadelight','jade',s*.38,1.08,-.57+j*.28,.18,.29,.09,ry=s*math.pi/2)
for i in range(4):
 vd_select('jade-lion','leg-'+str(i));s=-1 if i%2==0 else 1;zz=.58 if i<2 else -.58
 vd_panel('jadelight','jade',s*.43,.36,zz+.17,.26,.31,.08)


# Mourning Mask: wood-backed funeral ceramic with asymmetric repair seams,
# square recessed eye openings, carved brows and overlapping cloth streamers.
vd_recolor('mourning-mask','body','ghost','silk')
vd_clear('mourning-mask','head')
vd_panel('leather','robe',0,1.41,-.015,.90,1.13,.18)
vd_panel('ivory','cream',0,1.42,.10,.84,1.03,.22)
for s in [-1,1]:
 eye(s*.20,1.56,.25,.070,'cyan')
 vd_panel('cream','gold',s*.20,1.69,.255,.27,.085,.055,rz=-s*.12)
 vd_panel('cream','ivory',s*.27,1.30,.23,.21,.30,.07,rz=-s*.10)
 box('silk',s*.20,1.375,.281,.029,.22,.018)
vd_panel('cream','gold',0,1.42,.30,.10,.31,.13)
vd_panel('ink','red',0,1.145,.24,.20,.09,.03)
for a,b in [((-.32,1.84,.24),(-.18,1.72,.27)),((-.18,1.72,.27),(-.29,1.57,.27)),((-.29,1.57,.27),(-.36,1.39,.25))]:rod('gold',a,b,.018,n=4)
ring('gold',0,1.42,-.13,.65,.030,16,True)
for i in range(8):
 vd_select('mourning-mask','ribbon-'+str(i));a=i*math.tau/8
 for j in range(4):
  x=(.56+j*.14)*math.cos(a);y=1.4+(.56+j*.14)*math.sin(a)
  vd_fold('silk' if i%2 else 'cream','gold',x,y,-.13-j*.045,.22,.18,.035,rz=a)
vd_select('mourning-mask','veil')
for s in [-1,1]:
 for row in range(5):vd_fold('robe','cream',s*(.20+row*.045),.98-row*.15,-.13,.19,.22,.045,rz=s*.10)


# Spirit Koi: overlapping ceramic scales on both flanks, layered gill covers,
# a proper square carp mouth, and opaque folded fins edged by small light seams.
vd_select('spirit-koi','body')
for s in [-1,1]:
 for row in range(7):
  zz=.49-row*.175
  for col in range(4):
   yy=.62+col*.145;xx=s*(.26+(.035 if col in [1,2] else -.025))
   vd_panel('jade' if (row+col)%4 else 'cream','jadedark',xx,yy,zz,.18,.17,.045,ry=s*math.pi/2,rz=s*.09)
 for row in range(5):vd_panel('gold','jade',s*.13,1.10,-.40+row*.19,.12,.16,.04,rz=s*.25)
vd_select('spirit-koi','head')
for s in [-1,1]:
 for row in range(3):vd_panel('cream','gold',s*.26,.84,.45+row*.075,.22,.42-row*.06,.05,ry=s*math.pi/2)
vd_panel('ivory','cream',0,.80,.979,.25,.19,.07)
vd_panel('ink','gold',0,.80,1.025,.15,.09,.024)
for label in ['tail','left-fin','right-fin']:vd_recolor('spirit-koi',label,'ghost','silk')
vd_select('spirit-koi','tail')
for s in [-1,1]:
 for j in range(5):vd_feather('cream' if j%2 else 'jade',(s*.08,.84,-.84),(s*(.22+j*.073),.61+j*.105,-1.33),.055)
for s,label in [(-1,'left-fin'),(1,'right-fin')]:
 vd_select('spirit-koi',label)
 for j in range(4):vd_feather('cream' if j%2 else 'jade',(s*.26,.855,.27),(s*(.45+j*.075),.72+j*.01,-.31+j*.065),.05)

# The builder checks the same part hierarchy and all five authored clips after
# this file. Do not add separate decorative objects or change existing pivots.
