"""Plagueworks anatomy and crafted material details, on the existing rigid parts."""
def pl_head(name):
 global active,current
 active=name;current='head'
 for key in ('vertices','faces','colors','materials'):parts[active][current][key]=[]
def pl_stitch(a,b,spacing=.14):
 a=Vector(a);b=Vector(b);n=max(2,int((b-a).length/spacing))
 rod('suture',a,b,.018,n=4)
 for i in range(n+1):
  p=a.lerp(b,i/n);rod('bone',p+Vector((-.034,-.045,.014)),p+Vector((.034,.045,.014)),.011,n=4)
def pl_joint(x,y,z,r=.12):
 box('iron',x,y,z,r*2.5,r*1.7,r*2.3);plate('bone','suture',x,y,z+r*1.22,r*1.8,r*1.3,.04,.025)
 for s in [-1,1]:stud('copper',x+s*r*.62,y,z+r*1.52,r*.17)
def pl_vertebra(x,y,z,w=.22):
 chamfer('bone',x,y,z,w,.09,.14,.035);box('suture',x,y-.055,z,w*.36,.035,.07)
 for s in [-1,1]:box('ivory',x+s*w*.43,y+.012,z,.055,.045,.12,rz=s*.2)
def pl_suture_panel(x,y,z,w,h):
 plate('leather','suture',x,y,z,w,h,.05,.065)
 for xx in [x-w*.38,x+w*.38]:pl_stitch((xx,y-h*.38,z+.048),(xx,y+h*.38,z+.048),.13)
def pl_claw(side,x,y,z,rows=3):
 for j in range(rows):
  xx=x+(j-(rows-1)/2)*.085
  box('ivory',xx,y,z,.066,.071,.115,rx=.20)
  box('bone',xx,y-.024,z+.083,.049,.038,.084,rx=.32)

# Bone rat: a long wedge skull, giant angular ears, real incisors and a segmented backbone.
pl_head('bone-rat')
chamfer('bone',0,.57,.66,.43,.35,.39,.07);chamfer('ivory',0,.50,.90,.25,.20,.39,.035)
box('ink',0,.53,1.105,.16,.095,.065);box('blood',0,.48,1.01,.22,.042,.14)
for s in [-1,1]:
 eye(s*.157,.645,.862,.043,'venom');box('bone',s*.185,.711,.793,.19,.062,.16,rz=-s*.19)
 chamfer('bone',s*.215,.848,.55,.26,.34,.067,.085);chamfer('blood',s*.215,.849,.588,.18,.25,.022,.06)
 box('ivory',s*.057,.406,1.053,.081,.15,.05);box('bone',s*.083,.379,1.022,.074,.061,.045)
 for j in range(3):rod('silver',(s*.12,.514,.983),(s*(.36+j*.07),.515+(j-1)*.035,1.0-j*.035),.008,n=4)
current='body';plate('bone','suture',0,.50,.30,.32,.25,.042,.06)
for j in range(7):pl_vertebra(0,.737,-.52+j*.16,.18)
for s in [-1,1]:
 for j in range(5):
  zz=-.39+j*.16;rod('bone',(s*.10,.695,zz),(s*.31,.57,zz),.032,n=4);rod('ivory',(s*.31,.57,zz),(s*.27,.38,zz),.023,n=4)
for i in range(4):current='leg-'+str(i);s=-1 if i%2==0 else 1;zz=.38 if i<2 else -.38;pl_joint(s*.25,.28,zz-.06,.07);pl_claw(s,s*.271,.114,zz+.25)
for i in range(3):
 current='tail-'+str(i);a=Vector(parts[active][current]['pivot'])
 for j in range(4):pl_vertebra(a.x+.04*j,a.y-.025*j,a.z-.07*j,.07-j*.009)

# Corpse scarab: split coffin carapace, inset wing margins and toothed shovel mandibles.
pl_head('corpse-scarab');plate('bone','iron',0,.52,.66,.65,.32,.23,.10)
for s in [-1,1]:
 eye(s*.19,.59,.805,.044,'venom');plate('copper','suture',s*.37,.47,.78,.18,.24,.19,.045)
 polygon('ivory',[(s*.23,.39,.73),(s*.48,.34,.93),(s*.37,.32,1.15),(s*.16,.33,1.1),(s*.27,.35,1.00)],[(0,1,2,3,4)])
 for j in range(3):box('bone',s*(.18+j*.045),.35,1.05-j*.04,.07,.04,.075,ry=s*.4)
current='abdomen'
for s in [-1,1]:
 for j in range(5):
  zz=-.56+j*.22;chamfer('ivory' if j%2==0 else 'bone',s*.24,.87,zz,.38,.08,.17,.025)
  stud('copper',s*.47,.84,zz,.022)
 strap('leather','copper',(s*.41,.74,-.61),(s*.41,.78,.34),.09)
for i in range(6):current='leg-'+str(i);s=-1 if i%2==0 else 1;zz=.4-(i//2)*.38;pl_joint(s*.80,.31,zz-.10,.075)

# Leech: overlapping segmented dorsal scales and a clearly fleshy concentric sucker.
active='mire-leech';current='body'
for j in range(8):
 zz=-.91+j*.18;chamfer('moss',0,.60,zz,.40,.085,.14,.035)
 for s in [-1,1]:box('plague',s*.23,.47,zz,.09,.16,.13,rz=-s*.26);box('flesh',s*.21,.26,zz,.1,.055,.13)
current='head'
for row in range(2):
 r=.23-row*.065
 for j in range(14):
  a=j*math.tau/14+row*.15;rod('flesh',((r+.04)*math.cos(a),.44+(r+.04)*math.sin(a),.72),((r+.04)*math.cos(a+.3),.44+(r+.04)*math.sin(a+.3),.72),.027,n=5)
  spike('ivory',(r*math.cos(a),.44+r*math.sin(a),.76+row*.035),((r-.045)*math.cos(a),.44+(r-.045)*math.sin(a),.81+row*.04),.021)
for s in [-1,1]:
 for j in range(3):orb('venom',s*.26,.45+(j-1)*.10,.48,.049,.041,.06,8,4)

# Crypt bat: flat leaf-nose, tall laminated ears, short fangs and layered wing folds.
pl_head('crypt-bat');chamfer('suture',0,1.42,.13,.43,.34,.34,.065)
for s in [-1,1]:
 plate('bone','ink',s*.14,1.44,.304,.22,.16,.055,.035);eye(s*.13,1.45,.34,.042,'venom')
 box('bone',s*.14,1.55,.28,.23,.06,.13,rz=-s*.2)
 polygon('suture',[(s*.12,1.52,.03),(s*.33,1.96,.015),(s*.39,1.58,.10),(s*.26,1.49,.14)],[(0,1,2,3)])
 polygon('blood',[(s*.18,1.58,.08),(s*.32,1.86,.052),(s*.33,1.61,.126)],[(0,1,2)])
 box('ivory',s*.09,1.25,.33,.047,.16,.045)
chamfer('blood',0,1.39,.35,.15,.14,.10,.045);box('ink',0,1.29,.335,.25,.04,.07)
for s,label in [(-1,'left-wing'),(1,'right-wing')]:
 current=label;x=s*.19;y=1.25;z=-.03
 for j in range(5):
  root=(x,y-.03,z-.12);tip=(x+s*(.38+j*.19),y-.12-j*.025,z-.74+j*.12)
  rod('suture',root,tip,.033,.016,5);rod('bone',root,(tip[0],tip[1]+.021,tip[2]),.010,n=4)
 for j in range(4):
  xx=x+s*(.27+j*.21);polygon('blood',[(xx,y-.07,z-.41),(xx+s*.20,y-.10,z-.59),(xx+s*.10,y-.16,z-.74)],[(0,1,2)])
 pl_joint(x,y,z,.073)
current='body'
for j in range(5):chamfer('bone',0,.84+j*.065,.232,.31-j*.018,.047,.045,.019)
for s in [-1,1]:box('suture',s*.15,1.00,.18,.10,.28,.10,rz=-s*.21)

# Carrion hound: narrow long canine muzzle, torn jowls and a ribbed shoulder hump.
pl_head('carrion-hound');chamfer('flesh',0,1.10,.78,.55,.43,.45,.07);chamfer('bone',0,.984,1.10,.37,.23,.54,.045)
box('ink',0,1.04,1.392,.27,.10,.073);box('blood',0,.882,1.10,.34,.075,.47)
for s in [-1,1]:
 eye(s*.22,1.19,.973,.052,'venom');box('bone',s*.22,1.26,.91,.28,.075,.18,rz=-s*.17)
 for j in range(4):box('ivory',s*.14,.879,1.01+j*.09,.043,.10+(j%2)*.03,.045)
 polygon('flesh',[(s*.17,1.25,.67),(s*.32,1.62,.53),(s*.37,1.24,.81)],[(0,1,2)])
 pl_stitch((s*.26,.98,.91),(s*.25,1.19,.96),.08)
current='body'
for j in range(7):pl_vertebra(0,1.29,-.79+j*.22,.23)
for s in [-1,1]:
 for j in range(5):
  zz=-.6+j*.21;rod('bone',(s*.15,1.20,zz),(s*.43,.96,zz),.052,n=4);rod('ivory',(s*.43,.96,zz),(s*.36,.70,zz+.03),.040,n=4)
 pl_suture_panel(s*.19,.92,.64,.25,.38)
 strap('leather','copper',(s*.36,1.16,-.48),(s*.38,.78,.26),.10)
for i in range(4):current='leg-'+str(i);s=-1 if i%2==0 else 1;zz=.63 if i<2 else -.63;pl_joint(s*.35,.32,zz-.07,.09);pl_claw(s,s*.37,.14,zz+.27)

# Fungal thrall: folded shroud, layered shelf fungi and a deeply inset host face.
active='fungal-thrall';current='head'
plate('flesh','suture',0,2.14,.30,.39,.29,.06,.035);eye(-.12,2.18,.35,.045,'venom');eye(.12,2.18,.35,.045,'venom')
box('bone',0,2.08,.345,.07,.10,.05)
for s in [-1,1]:
 for j in range(5):box('moss',s*(.26+j*.064),2.425,.10-j*.065,.13,.046,.36,ry=-s*.20)
for j in range(7):box('bone',-.28+j*.092,2.326,.34,.025,.08,.16)
current='body'
for s in [-1,1]:
 strap('leather','copper',(s*.33,1.93,.34),(-s*.26,1.09,.36),.13)
 for j in range(4):plate('plague','moss',s*.21,1.70-j*.19,.345,.33,.16,.045,.025)
current='spore-frill'
for j in range(5):
 x=.34*math.sin(j*2);y=1.20+j*.15;plate('moss','bone',x,y,-.46,.48,.11,.16,.055)
 for k in range(4):box('flesh',x-.15+k*.1,y-.07,-.47,.025,.03,.22)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:current=label;plate('plague','suture',s*.68,1.65,.17,.31,.33,.07,.04);pl_stitch((s*.70,1.5,.224),(s*.68,1.81,.224),.08)

# Plague knight: layered coffin armor, riveted leather bindings and a distinct death-mask.
active='plague-knight';current='head'
plate('bone','iron',0,2.26,.342,.47,.34,.07,.055)
box('ink',0,2.23,.39,.28,.072,.019)
for j in range(5):box('bone',-.16+j*.08,2.22,.414,.039,.09,.025)
chamfer('copper',0,2.39,.414,.063,.25,.045,.015)
current='body'
for s in [-1,1]:
 for j in range(4):plate('iron','copper',s*.24,1.80-j*.155,.366,.39,.13,.055,.025)
 strap('leather','bone',(s*.35,1.91,.36),(s*.27,1.14,.40),.10)
 for j in range(3):plate('plague','iron',s*.29,1.04-j*.15,.25,.40,.17,.08,.035)
for s,label in [(-1,'left-arm'),(1,'right-arm')]:
 current=label
 for j in range(3):plate('iron','bone',s*.68,2.01-j*.095,.234,.51-j*.04,.13,.10,.035)
 for j in range(3):stud('copper',s*.68+(j-1)*.15,2.02,.30,.026)
current='tabard';pl_stitch((-.19,.85,.38),(-.19,.36,.38),.085);pl_stitch((.19,.85,.38),(.19,.36,.38),.085)

# Sewer horror: armoured rib cage, asymmetrical multi-eye skull and tendril suckers.
active='sewer-horror';current='head';chamfer('bone',0,2.03,.44,.65,.35,.13,.085)
for s in [-1,1]:
 eye(s*.24,2.14,.529,.055,'venom');box('bone',s*.23,2.25,.45,.36,.085,.20,rz=-s*.16)
 for j in range(3):box('ivory',s*(.08+j*.095),1.85,.49,.075,.15+j*.018,.08)
plate('iron','copper',-.23,2.42,.18,.39,.22,.07,.045)
current='body'
for s in [-1,1]:
 for j in range(5):plate('bone','suture',s*.45,1.48-j*.15,.458,.30,.10,.09,.025)
 pl_suture_panel(s*.42,1.08,-.48,.40,.62)
 for j in range(3):stud('copper',s*.60,1.04+j*.21,-.49,.04)
for i in range(6):
 current='tentacle-'+str(i);s=-1 if i%2==0 else 1;yy=1.57-(i//2)*.38
 pl_joint(s*.60,yy,-.07,.15)
 for j in range(5):
  x=s*(.89+j*.056);y=yy-.12-j*.16;ring('bone',x,y,.33,.059,.013,8,True);orb('blood',x,y,.323,.032,.032,.017,6,4)

# Original crypt weaver: paired shield carapace, distinct hex eyes and joint collars.
active='crypt-weaver';current='abdomen'
for s in [-1,1]:
 for j in range(5):plate('plague','bone',s*.30,1.18-j*.022,-1.01+j*.21,.34,.095,.18,.035)
current='head'
for s in [-1,1]:
 plate('iron','bone',s*.19,.92,.764,.29,.13,.085,.025)
 for j in range(3):eye(s*(.13+j*.10),.87-j*.053,.839,.041-j*.005,'venom')
current='body';plate('suture','bone',0,.82,.264,.46,.27,.045,.04)
for i in range(8):
 current='leg-'+str(i);s=1 if i%2 else -1;zz=.45-(i//2)*.34;pl_joint(s*.37,.73,zz,.10)
 current='leg-tip-'+str(i);p=parts[active][current]['pivot'];pl_joint(*p,.09)

# Original alchemist: real stitched coat construction, gauge dials and strapped pressure tanks.
active='plague-alchemist';current='body'
for s in [-1,1]:
 strap('leather','copper',(s*.35,1.97,.342),(s*.25,1.09,.41),.11)
 for yy in [1.46,1.89]:plate('iron','copper',s*.30,yy,-.584,.30,.15,.04,.035)
 ring('copper',s*.30,1.74,-.57,.10,.023,12,True);box('ivory',s*.3,1.74,-.592,.10,.10,.025);box('ink',s*.3,1.765,-.608,.011,.075,.014,rz=-.3)
current='head'
for s in [-1,1]:plate('leather','copper',s*.155,2.35,.384,.25,.24,.035,.048);eye(s*.155,2.35,.415,.065,'venom')
for j in range(5):box('copper',0,2.15-j*.011,.49+j*.06,.075-j*.005,.022,.043)
current='coat'
for s in [-1,1]:
 pl_stitch((s*.34,1.34,-.406),(s*.39,.41,-.407),.12)
 plate('leather','copper',s*.22,.94,-.416,.28,.30,.035,.035)
for j in range(4):stud('bone',0,1.18-j*.21,-.41,.025)

# Broodmother boss: layered sarcophagus shell, egg clusters, plated fangs and fettered ankles.
active='broodmother-vex';current='abdomen'
for s in [-1,1]:
 for j in range(7):
  zz=-1.57+j*.24;chamfer('bone',s*.45,1.58,zz,.48,.095,.20,.035);chamfer('plague',s*.49,1.647,zz,.32,.038,.12,.02)
 for j in range(5):orb('blood',s*.78,1.12,-1.42+j*.25,.12,.17,.14,8,5);ring('copper',s*.78,1.22,-1.42+j*.25,.13,.019,10)
current='head'
plate('bone','copper',0,1.18,1.106,.48,.34,.055,.055)
for s in [-1,1]:
 eye(s*.20,1.25,1.145,.09,'venom');box('bone',s*.21,1.38,1.02,.33,.072,.16,rz=-s*.18)
 current='fang-'+str(s)
 for j in range(3):chamfer('bone',s*(.31+j*.027),.85-j*.12,1.12+j*.065,.17-j*.021,.13,.13,.024)
for i in range(8):
 current='leg-'+str(i);s=1 if i%2 else -1;zz=.62-(i//2)*.44
 pl_joint(s*.43,.97,zz,.15)
 current='leg-tip-'+str(i);p=parts[active][current]['pivot'];pl_joint(*p,.14)
 for j in range(3):stud('copper',p[0]+s*.08,p[1]-.12*j,p[2]+.06,.027)

# Abomination boss: surgical harness, articulated belly plates and visible tank fittings.
active='plague-abomination';current='body'
for s in [-1,1]:
 strap('leather','iron',(s*.49,1.95,.45),(-s*.37,1.05,.55),.18)
 for j in range(4):plate('iron','copper',s*.51,1.19+j*.23,-.655,.35,.13,.08,.045)
 plate('bone','suture',s*.36,1.69,.568,.39,.31,.065,.055)
 for j in range(3):rod('copper',(s*.58,1.4+j*.23,-.60),(s*.73,1.38+j*.23,-.33),.035,n=6)
current='head'
plate('iron','bone',-.12,2.41,.352,.43,.34,.05,.045);eye(.15,2.35,.39,.075,'venom')
chamfer('flesh',.21,2.13,.34,.20,.14,.13,.035)
for j in range(4):box('bone',-.10+j*.08,2.13,.395,.045,.065,.04)
pl_stitch((-.26,2.22,.375),(.19,2.44,.37),.09)
current='left-arm'
for j in range(3):plate('iron','copper',-.78,1.94-j*.13,.285,.58,.14,.09,.04)
current='left-hand'
for j in range(4):chamfer('steel',-.99+j*.135,1.08,.376,.11,.35,.085,.027);stud('copper',-.99+j*.135,1.22,.43,.032)
for label in ['left-leg','right-leg']:
 current=label;s=-1 if label.startswith('left') else 1;plate('iron','leather',s*.27,.68,.23,.36,.38,.06,.05)

# Strict voxel correction: the leech is a stepped square-bodied maw, not a tube.
active='mire-leech'
for i in range(6):
 current='segment-'+str(i)
 for key in ('vertices','faces','colors','materials'):parts[active][current][key]=[]
 zz=-.71+i*.21
 for s in [-1,1]:
  box('moss',s*.29,.36,zz,.075,.48,.135);box('flesh',s*.246,.34,zz+.018,.032,.35,.16)
  box('plague',0,.36+s*.25,zz,.57,.076,.16)
  box('bone',s*.275,.59,zz,.07,.055,.09)
pl_head('mire-leech')
box('blood',0,.44,.48,.62,.54,.30);box('ink',0,.44,.652,.44,.36,.044)
for s in [-1,1]:
 box('flesh',s*.276,.44,.697,.073,.50,.13);box('flesh',0,.44+s*.228,.697,.49,.066,.13)
 box('bone',s*.223,.44,.723,.04,.37,.095);box('bone',0,.44+s*.176,.723,.42,.045,.095)
 for j in range(5):
  v=-.16+j*.08
  box('ivory',v,.44+s*.143,.785,.041,.074,.05,rx=s*.12)
  box('ivory',s*.179,.44+v,.785,.059,.042,.05,ry=-s*.12)
box('venom',0,.44,.683,.14,.10,.023)
for s in [-1,1]:
 for j in range(3):box('venom',s*.327,.29+j*.13,.49,.032,.050,.05)

# Folded voxel membranes have real thickness and stepped edges rather than flat triangles.
active='crypt-bat'
for s,label in [(-1,'left-wing'),(1,'right-wing')]:
 current=label
 for col in range(6):
  for row in range(6-col):
   xx=s*(.33+col*.185);zz=-.14-row*.118-col*.03;yy=1.23-col*.018-row*.009
   box('suture' if (row+col)%3 else 'blood',xx,yy,zz,.19,.035,.122)
   if row==0:box('bone',xx,yy+.025,zz+.042,.188,.018,.025)
 for j in range(3):box('bone',s*(.29+j*.037),1.29+j*.055,-.035,.057,.068,.045)
current='body'
for s in [-1,1]:
 for j in range(5):box('suture',s*(.15+j*.011),1.13-j*.085,.18,.11,.095,.095,rz=-s*.11)
for s,label in [(-1,'left-leg'),(1,'right-leg')]:
 current=label
 for j in range(3):box('bone',s*.19+(j-1)*.045,.56,.145,.034,.034,.16)

# The Broodmother's royal egg cradle is a unique silhouette and purpose, not a larger weaver.
active='broodmother-vex';current='abdomen'
for s in [-1,1]:
 for j in range(3):
  zz=-1.46+j*.46
  box('suture',s*.93,1.28,zz,.27,.42,.31)
  box('venom',s*.952,1.32,zz,.26,.22,.22)
  for yy in [1.12,1.48]:box('bone',s*.93,yy,zz,.33,.054,.34)
  for edge in [-1,1]:box('copper',s*(.80+edge*.012),1.28,zz+edge*.13,.043,.35,.046)
for j in range(5):
 zz=-1.55+j*.26;box('bone',0,1.84,zz,.25,.15,.17);box('gold',0,1.94,zz,.13,.06,.11)
current='head'
for j in [-1,0,1]:
 for tier in range(3):box('gold',j*.24,1.53+tier*.13,.73,.15-tier*.035,.13,.13-tier*.02)

active='fungal-thrall';current='head'
for tier in range(3):
 box('blood' if tier!=1 else 'suture',0,2.48+tier*.057,.02,1.30-tier*.18,.070,1.12-tier*.17)
for s in [-1,1]:
 for j in range(5):box('bone',s*(.12+j*.092),2.37,.17,.025,.047,.41-j*.04)

# Expose carapace construction on the outside of the final cuboid silhouettes.
# These tiers stay below existing dorsal bounds so baked floor contact is retained.
active='crypt-weaver';current='head'
for s in [-1,1]:
 plate('suture','bone',s*.215,.88,.902,.35,.22,.033,.015)
 for j in range(3):eye(s*(.12+j*.105),.94-j*.065,.930,.044-j*.006,'venom')
current='abdomen'
for s in [-1,1]:
 for j in range(5):
  zz=-1.14+j*.257
  box('bone',s*.31,1.466,zz,.56,.070,.232)
  box('plague' if j%2 else 'moss',s*.31,1.510,zz,.46,.025,.170)
  box('suture',s*.31,1.525,zz-.052,.34,.005,.015)
 for j in range(4):box('suture',s*.658,1.10,-1.07+j*.29,.018,.39,.030)

active='broodmother-vex';current='abdomen'
for s in [-1,1]:
 for j in range(6):
  zz=-1.72+j*.292
  box('bone',s*.46,1.913,zz,.70,.066,.260)
  box('plague',s*.46,1.954,zz,.59,.015,.195)
  box('suture',s*.46,1.965,zz-.061,.49,.006,.018)
  for edge in [-1,1]:box('gold',s*.46+edge*.246,1.969,zz+.064,.025,.006,.037)
 # Six elevated brood cages occupy the existing wide egg-cradle silhouette.
 for j in range(3):
  zz=-1.44+j*.46
  box('suture',s*.95,1.77,zz,.270,.310,.31)
  box('venom',s*.971,1.815,zz,.235,.190,.215)
  for yy in [1.66,1.936]:box('bone',s*.95,yy,zz,.285,.048,.32)
  for edge in [-1,1]:box('copper',s*1.086,1.80,zz+edge*.119,.024,.24,.031)

# Species faces sit outside the cuboid front plane, legible from gameplay's three-quarter view.
active='carrion-hound';current='head'
for s in [-1,1]:
 eye(s*.18,1.20,1.040,.055,'venom')
 box('bone',s*.18,1.303,1.035,.24,.070,.09,rz=-s*.16)
 box('ivory',s*.232,1.080,1.036,.09,.13,.079,rz=-s*.12)

pl_head('sewer-horror')
box('blood',0,2.00,.21,.90,.66,.96)
plate('bone','suture',0,2.06,.710,.79,.51,.065,.020)
box('ink',0,1.864,.760,.62,.274,.044)
for s in [-1,1]:
 box('bone',s*.344,1.87,.779,.087,.30,.089)
 eye(s*.223,2.125,.760,.070,'venom')
 box('suture',s*.230,2.246,.773,.31,.076,.079,rz=-s*.14)
 for j in range(5):box('ivory',-.24+j*.12,1.859+s*.097,.806,.064,.103,.063)
 box('bone',s*.366,2.10,.714,.090,.25,.19,rz=-s*.12)
box('bone',0,1.713,.778,.70,.065,.11)
plate('bone','copper',0,2.355,.679,.36,.286,.104,.020)
eye(0,2.350,.760,.093,'venom')
# Preserve the original head's high point and back-mounted surgical gauge.
plate('iron','copper',-.23,2.42,.18,.39,.22,.07,.045)
