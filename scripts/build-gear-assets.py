"""Author Mossvale's wearable voxel sets with real Blender meshes and item renders.

blender --background --python scripts/build-gear-assets.py -- --render --optimize
Add --drop-only to render only the common/uncommon gallery and its 64 icons.
All exported roots/transforms are identity, metres, Y-up, +Z front. Mesh positions
are LOCAL to the runtime anchor. Bodies contain torso plus arm-local shoulder
meshes; legs/shoes contain one piece to duplicate onto both leg pivots.
"""
import bpy
import copy
import json
import math
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/gear-kit.glb'
SOURCE=ROOT/'assets/source/gear-kit.blend'
PREVIEW=ROOT/'assets/source/gear-kit-preview.png'
THUMBS=ROOT/'public/ui/gear'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):bpy.data.materials.remove(material)
HEX={
 'leaf':'548D60','leaflight':'7FA96A','leafdark':'2D5947','leather':'79533B','hide':'AD7B4C','dark':'453A33',
 'steel':'B5C9CF','silver':'E2EBDF','iron':'536873','gold':'D4AD5D','goldlight':'F1D995',
 'blue':'4B739A','bluelight':'7896B7','bluedark':'33465D','purple':'786294','violet':'AD87BA',
 'gem':'78CEBB','gemlight':'C8F2D6','paper':'DFD0A9','skin':'DCA985','ink':'293B43','cream':'DDD3B7',
 'briar':'66864A','sand':'BD8E53','frost':'7FAEC7','storm':'476987','elder':'526B37',
 'ironplate':'7D8B91','bronze':'BF884D','iceplate':'9FCED6','thunder':'566E9B','sunplate':'D6B76A',
 'embercloth':'A34E43','oracle':'C49B6A','icecloth':'8FBADA','stormcloth':'655CA8','astral':'8C75C2','fire':'FFD074','starlight':'E6CFFD',
 'elfskin':'DCC3A8','orcskin':'8BA572','goblinskin':'91AA78','foxskin':'C7905D',
}
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
COLORS={name:tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,) for name,value in HEX.items()}
def xyz(x,y,z):return x,-z,y
parts={};boxes={};active='';current='';counts={}
def item(name,part='mesh'):
 global active,current
 active=name;current=part;parts[name]={part:{'vertices':[],'faces':[],'colors':[]}};boxes[name]={part:[]};counts[name]=0
def part(name):
 global current
 current=name;parts[active][name]={'vertices':[],'faces':[],'colors':[]};boxes[active][name]=[]
def box(color,x,y,z,w,h,d,angle=0):
 boxes[active][current].append((color,x,y,z,w,h,d,angle))
 data=parts[active][current];base=len(data['vertices']);c,s=math.cos(angle),math.sin(angle)
 for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
  xx,yy=a*w/2,b*h/2;data['vertices'].append(xyz(x+xx*c-yy*s,y+xx*s+yy*c,z+f*d/2))
 for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
  data['faces'].append(tuple(base+i for i in face));data['colors'].append(COLORS[color])
 counts[active]+=1
def strap(color,x1,y1,x2,y2,z,width=.035,depth=.03):
 box(color,(x1+x2)/2,(y1+y2)/2,z,width,math.hypot(x2-x1,y2-y1),depth,-math.atan2(x2-x1,y2-y1))
def gem(x,y,z,size=.16):
 box('gold',x,y,z,size,size,.055,math.pi/4)
 box('gem',x,y,z+.037,size*.69,size*.69,.037,math.pi/4)
 box('gemlight',x-size*.15,y+size*.16,z+.060,size*.20,size*.24,.015,math.pi/4)

# Head roots attach at (0,1.9,0), with hair hidden by the runtime.
item('ranger-head')
box('leafdark',0,.04,-.36,.84,.68,.14)
for side in [-1,1]:
 box('leaf',side*.405,.035,.015,.14,.63,.78)
 box('leaflight',side*.393,-.02,.405,.075,.51,.075)
 box('leather',side*.40,-.29,.385,.12,.16,.10)
box('leaf',0,.35,0,.88,.16,.83)
box('leaflight',0,.455,-.025,.70,.14,.71)
box('leaf',0,.555,-.065,.48,.13,.58)
box('leafdark',0,.655,-.10,.27,.10,.39)
box('leaflight',0,.265,.394,.72,.09,.09)
box('leafdark',0,-.39,0,.82,.14,.65)
for i in range(5):box('paper' if i%2 else 'goldlight',.47+i*.023,.42+i*.095,-.11,.13-i*.013,.09,.05,angle=-.19)
strap('hide',.43,.33,.57,.94,-.072,.025,.035)
gem(.407,-.265,.442,.085)

item('knight-head')
box('iron',0,.03,-.37,.86,.70,.13)
for side in [-1,1]:
 box('steel',side*.426,.03,0,.13,.63,.79)
 box('steel',side*.326,-.23,.37,.16,.28,.16)
 box('gold',side*.418,.13,.37,.08,.34,.06)
 box('silver',side*.435,.02,.07,.075,.20,.28)
 box('goldlight',side*.438,.08,.225,.045,.055,.035)
box('steel',0,.36,0,.91,.17,.81)
box('silver',0,.49,-.025,.73,.14,.65)
box('steel',0,.59,-.06,.48,.10,.47)
box('gold',0,.27,.397,.76,.095,.10)
box('steel',0,-.01,.427,.085,.38,.08)
box('goldlight',0,.125,.479,.065,.12,.027)
box('gold',0,.55,-.045,.13,.29,.67)
for i in range(4):box('goldlight' if i%2 else 'gold',0,.715+i*.014,-.27+i*.14,.15,.075,.125)

item('mage-head')
box('bluedark',0,.35,0,1.13,.10,.98)
box('blue',0,.416,-.02,1.01,.065,.86)
for i in range(6):
 w=.85-i*.113;box('blue' if i%2 else 'bluelight',i*.017,.505+i*.125,-i*.007,w,.15,w*.88)
box('purple',0,.55,-.005,.82,.13,.72)
box('gold',0,.625,.008,.77,.035,.68)
box('blue',.135,1.222,-.04,.20,.10,.19)
box('bluelight',.232,1.245,-.02,.16,.065,.16)
gem(0,.56,.382,.16)
for x,y in [(-.16,.82),(.055,1.04)]:
 box('goldlight',x,y,.25 if y<.9 else .15,.055,.11,.025)
 box('goldlight',x,y,.253 if y<.9 else .153,.10,.036,.03)

# Torso meshes use body coordinates. Shoulder meshes below use only arm-local coordinates.
for calling in ['ranger','knight','mage']:
 item(calling+'-body','torso')
 primary={'ranger':'leaf','knight':'steel','mage':'blue'}[calling]
 trim={'ranger':'leather','knight':'gold','mage':'purple'}[calling]
 box(primary,0,1.25,.282,.78,.64,.09)
 box(primary,0,1.25,-.262,.77,.61,.085)
 for side in [-1,1]:box(trim,side*.367,1.25,0,.095,.65,.53)
 box(trim,0,1.005,.02,.83,.11,.58)
 if calling=='ranger':
  for side in [-1,1]:
   box('leather',side*.305,1.27,.344,.13,.54,.055)
   box('hide',side*.29,1.49,.383,.055,.055,.023)
   box('leather',side*.242,.98,.37,.17,.20,.13)
   box('gold',side*.242,1.04,.449,.06,.05,.024)
  strap('hide',-.255,1.54,.255,1.035,.383,.105,.037)
  box('gold',.115,1.20,.41,.14,.15,.04,angle=-.74)
  box('dark',.115,1.20,.436,.074,.086,.025,angle=-.74)
  box('leafdark',0,.90,.015,.82,.18,.54)
 elif calling=='knight':
  box('iron',0,.91,.015,.82,.18,.52)
  for side in [-1,1]:
   box('silver',side*.178,1.29,.352,.315,.51,.07)
   box('gold',side*.333,1.27,.397,.047,.54,.027)
   box('steel',side*.278,.88,.242,.23,.22,.11)
   box('gold',side*.278,.788,.307,.23,.036,.033)
  for y in [1.02,1.56]:box('gold',0,y,.363,.75,.05,.06)
  box('iron',0,1.32,.41,.12,.32,.03)
  gem(0,1.38,.445,.13)
 else:
  for side in [-1,1]:
   box('purple',side*.246,1.30,.342,.19,.59,.06)
   box('gold',side*.148,1.32,.381,.03,.50,.025)
  for y in [1.41,1.22]:gem(0,y,.374,.07)
  box('purple',0,.858,.01,.83,.24,.53)
  for side in [-1,1]:box('gold',side*.378,.858,.292,.035,.22,.03)
  box('gold',0,1.004,.329,.85,.045,.035)
 for side,label in [(1,'left-arm'),(-1,'right-arm')]:
  part(label)
  width=.48 if calling=='knight' else .39
  box(primary,0,-.035,0,width,.235,.46)
  box(trim,0,.095,0,width-.04,.055,.41)
  box(primary,0,-.24,.008,.335,.23,.38)
  box(trim,0,-.363,.018,.35,.07,.40)
  box(trim if calling=='ranger' else primary,0,-.47,.022,.273,.13,.31)
  if calling=='knight':
   box('silver',side*.10,-.005,.24,.24,.13,.05)
   for x in [-.16,.16]:box('goldlight',x,-.04,.252,.05,.055,.035)
  elif calling=='ranger':
   for x in [-.12,.12]:box('gold',x,-.075,.245,.04,.045,.026)
   box('hide',0,-.47,.192,.15,.075,.03)
  else:
   box('gold',0,-.404,.226,.35,.04,.03)
   gem(0,-.065,.25,.085)

# One leg / one boot per root. Duplicate them under each leg pivot (x±.2,y.86,0).
for calling in ['ranger','knight','mage']:
 item(calling+'-legs')
 primary={'ranger':'leather','knight':'steel','mage':'blue'}[calling]
 box(primary,0,-.21,0,.30 if calling!='mage' else .35,.48,.35)
 if calling=='ranger':
  box('leafdark',0,-.22,.197,.23,.36,.075)
  for y in [-.08,-.37]:box('hide',0,y,.242,.27,.05,.028)
  for side in [-1,1]:box('dark',side*.138,-.23,.02,.045,.40,.34)
 elif calling=='knight':
  box('silver',0,-.19,.21,.25,.38,.075)
  box('steel',0,-.38,.245,.32,.17,.10)
  for side in [-1,1]:box('gold',side*.129,-.18,.258,.033,.37,.027)
  box('goldlight',0,-.36,.301,.12,.055,.018)
 else:
  for side in [-1,1]:box('purple',side*.145,-.22,.207,.075,.46,.065)
  box('gold',0,-.435,.231,.36,.037,.035)
  box('bluelight',0,-.22,.197,.16,.42,.03)
 item(calling+'-shoes')
 primary={'ranger':'leather','knight':'steel','mage':'blue'}[calling]
 box('dark',0,-.83,.11,.35,.06,.52)
 box(primary,0,-.727,.10,.335,.17,.49)
 box(primary,0,-.54,.005,.31,.40,.365)
 if calling=='ranger':
  for y in [-.41,-.55,-.67]:
   box('hide',0,y,.207,.32,.065,.055)
   box('gold',.077,y,.245,.073,.072,.031)
  box('dark',0,-.754,.371,.34,.10,.045)
 elif calling=='knight':
  box('silver',0,-.51,.219,.26,.33,.085)
  box('gold',0,-.35,.216,.325,.045,.095)
  box('silver',0,-.689,.244,.34,.072,.23)
  for x in [-.14,.14]:box('gold',x,-.71,.18,.035,.09,.32)
 else:
  box('purple',0,-.374,.01,.36,.10,.41)
  box('gold',0,-.429,.225,.34,.035,.037)
  box('purple',0,-.707,.393,.24,.135,.19)
  box('bluelight',0,-.653,.476,.16,.066,.10)
  gem(0,-.542,.235,.11)

# Back pieces use cape-local origin (0,1.49,-.23); -Z points out from the character's back.
for calling in ['ranger','knight','mage']:
 item(calling+'-back')
 color={'ranger':'leaf','knight':'blue','mage':'purple'}[calling]
 dark={'ranger':'leafdark','knight':'bluedark','mage':'blue'}[calling]
 box(dark,0,-.47,-.20,.94,.99,.11)
 for i in [-1,0,1]:
  box(color,i*.285,-.53,-.273,.26,1.02 if i else 1.15,.075)
  box('hide' if calling=='ranger' else 'gold',i*.285,-1.047 if i else -1.11,-.323,.26,.046,.028)
 for side in [-1,1]:box('leather' if calling=='ranger' else 'gold',side*.42,-.45,-.28,.055,1.03,.07)
 if calling=='ranger':
  box('leather',0,-.25,-.40,.50,.63,.24)
  box('hide',0,.063,-.42,.56,.13,.27)
  box('paper',0,.208,-.405,.65,.16,.21)
  for side in [-1,1]:
   box('dark',side*.175,-.19,-.545,.055,.73,.03)
   box('gold',side*.175,-.15,-.57,.09,.10,.03)
   box('dark',side*.185,.21,-.405,.05,.18,.23)
  box('hide',0,-.44,-.56,.29,.21,.075)
 elif calling=='knight':
  for y in [-.17,-.43]:box('gold',0,y,-.326,.07,.22,.025)
  box('gold',0,-.29,-.333,.40,.07,.03)
  box('goldlight',0,-.52,-.33,.19,.14,.035)
  for side in [-1,1]:strap('gold',side*.04,-.68,side*.24,-.86,-.335,.04,.025)
 else:
  for angle in [0,math.pi/4]:
   box('goldlight',-.12,-.35,-.33,.055,.36,.027,angle)
   box('goldlight',-.12,-.35,-.332,.31,.055,.03,angle)
  box('bluedark',.295,-.32,-.405,.31,.49,.19)
  box('paper',.295,-.32,-.516,.26,.43,.038)
  box('blue',.295,-.32,-.548,.32,.50,.037)
  for y in [-.53,-.11]:box('gold',.295,y,-.574,.29,.034,.022)
  gem(.295,-.29,-.595,.11)

item('necklace')
for side in [-1,1]:
 strap('gold',side*.17,1.60,side*.075,1.39,.39,.026,.035)
 strap('goldlight',side*.075,1.39,0,1.32,.445,.03,.04)
box('gold',0,1.335,.507,.067,.09,.053)
gem(0,1.245,.53,.205)
box('goldlight',0,1.098,.551,.055,.06,.033)
item('ring')
for side in [-1,1]:
 box('gold',side*.114,-.60,.04,.032,.05,.27)
 box('goldlight',0,-.60,.04+side*.12,.23,.05,.034)
box('gold',0,-.60,.207,.13,.115,.075)
gem(0,-.60,.258,.105)

# Five separately ornamented sets for each calling. Shared foundations retain the
# measured fitting contract; crowns, shoulders, packs and weapons change silhouette.
SET_FAMILIES={
 'ranger':['briarwatch','sandstrider','froststalker','stormfeather','elderwild'],
 'knight':['ironbastion','duneguard','frostguard','stormbreaker','dawnwarden'],
 'mage':['emberweave','duneoracle','frostweave','stormcaller','astralweave'],
}
NEW_SETS=[(name,calling,tier) for calling,names in SET_FAMILIES.items() for tier,name in enumerate(names)]
SET_PALETTES={
 'briarwatch':('briar','hide','leaflight'),'sandstrider':('sand','dark','cream'),'froststalker':('frost','iron','silver'),'stormfeather':('storm','silver','gem'),'elderwild':('elder','gold','gemlight'),
 'ironbastion':('ironplate','silver','gold'),'duneguard':('bronze','dark','goldlight'),'frostguard':('iceplate','silver','gemlight'),'stormbreaker':('thunder','iron','violet'),'dawnwarden':('sunplate','goldlight','silver'),
 'emberweave':('embercloth','dark','fire'),'duneoracle':('oracle','purple','goldlight'),'frostweave':('icecloth','silver','gemlight'),'stormcaller':('stormcloth','iron','violet'),'astralweave':('astral','gold','starlight'),
}
def copy_piece(source,name,palette):
 records=copy.deepcopy(boxes[source]);item(name,next(iter(records)))
 for index,(label,blocks) in enumerate(records.items()):
  if index:part(label)
  for color,*values in blocks:box(palette.get(color,color),*values)
def switch_part(label):
 global current
 current=label

def jewel(color,x,y,z,size=.12):
 box('gold',x,y,z,size,size,.05,math.pi/4)
 box(color,x,y,z+.035,size*.72,size*.72,.034,math.pi/4)
 box('cream',x-size*.15,y+size*.15,z+.057,size*.19,size*.20,.012)

def crest(tier,primary,trim,bright,x,y,z,side=1,size=1):
 # Forest leaves, desert layered fans, ice shards, swept feathers, radiant prongs.
 if tier==0:
  for i in range(3):box(primary if i%2 else bright,x+side*i*.055*size,y+i*.09*size,z,.10*size,.20*size,.075*size,-side*.38)
 elif tier==1:
  for i in range(3):box(trim if i%2 else bright,x+side*i*.035*size,y+i*.065*size,z,.18*size,.09*size,.09*size,-side*.16)
 elif tier==2:
  for i in range(3):box(bright if i==2 else primary,x+side*i*.025*size,y+i*.095*size,z,(.15-i*.035)*size,.12*size,.12*size,-side*.18)
 elif tier==3:
  for i in range(4):box(primary if i%2 else bright,x+side*i*.07*size,y+i*.055*size,z-i*.018*size,.11*size,.24*size,.065*size,-side*.66)
 else:
  for i in range(3):box(bright if i==2 else trim,x+side*i*.045*size,y+i*.09*size,z,(.14-i*.025)*size,.15*size,.10*size,-side*.30)

for name,calling,tier in NEW_SETS:
 primary,trim,bright=SET_PALETTES[name]
 palette={'leaf':primary,'leafdark':trim,'leaflight':bright,'blue':primary,'bluedark':trim,'bluelight':bright,'steel':primary,'iron':trim,'silver':bright,'purple':trim,'leather':trim,'hide':bright,'gem':bright,'gemlight':'cream'}
 # Open-faced headwear: all decorations remain above or beside the eyes.
 item(name+'-head')
 if calling=='ranger':
  if tier in [0,1]:
   box(trim,0,.05,-.36,.85,.69,.14)
   for side in [-1,1]:box(primary,side*.41,.05,0,.13,.65,.77)
   box(primary,0,.37,0,.90,.17,.82)
   box(bright,0,.49,-.04,.73,.12,.71)
   if tier==1:
    for i in range(3):box(trim if i%2 else primary,0,.59+i*.09,-.055,.68-i*.11,.105,.65-i*.09)
    for i in range(3):box(primary,.40,-.28-i*.15,-.12,.15,.18,.31)
   else:
    box(primary,0,.60,-.07,.45,.14,.56)
    crest(tier,primary,trim,bright,.44,.40,-.10,size=1.1)
  elif tier==2:
   box(primary,0,.38,0,.87,.18,.81);box(bright,0,.285,.0,.96,.11,.88)
   for side in [-1,1]:
    box(trim,side*.42,-.02,-.06,.14,.58,.58)
    for i in range(3):box(bright,side*.435,.18-i*.15,.22,.12,.13,.10)
    crest(tier,primary,trim,bright,side*.29,.53,-.14,side,.6)
  else:
   box(trim,0,.35,0,.84,.13,.74);box(primary,0,.45,-.05,.69,.14,.62)
   for side in [-1,1]:
    box(primary,side*.405,.12,-.12,.13,.47,.50)
    crest(tier,primary,trim,bright,side*.37,.43,-.05,side,1.4)
    if tier==4:
     strap(trim,side*.32,.45,side*.55,.91,-.17,.075,.10)
     strap(trim,side*.49,.76,side*.76,.87,-.17,.065,.09)
   jewel(bright,0,.35,.395,.15)
 elif calling=='knight':
  box(trim,0,.03,-.37,.86,.70,.13)
  for side in [-1,1]:
   box(primary,side*.426,.04,-.015,.14,.66,.78)
   box(primary,side*.32,-.22,.37,.16,.28,.15)
   box(trim,side*.414,.14,.375,.075,.33,.06)
  box(primary,0,.38,-.015,.91,.19,.81);box(bright,0,.52,-.04,.74,.12,.65)
  box(trim,0,.27,.395,.75,.095,.095)
  if tier==0:
   for x in [-.27,0,.27]:box(primary,x,.68,-.08,.17,.24,.42)
   box(trim,0,.50,.32,.12,.49,.08)
  elif tier==1:
   for i in range(5):box(bright if i%2 else trim,0,.65+i*.045,-.31+i*.125,.12,.15,.12)
   box(primary,0,-.02,.422,.07,.40,.065)
  elif tier==2:
   for x in [-.28,0,.28]:crest(tier,primary,trim,bright,x,.63,-.13,1 if x>=0 else -1,.95)
  elif tier==3:
   for side in [-1,1]:
    strap(primary,side*.40,.48,side*.65,.79,-.10,.16,.19)
    strap(bright,side*.65,.79,side*.68,1.00,-.10,.10,.13)
   jewel(bright,0,.36,.415,.13)
  else:
   for x in [-.32,-.16,0,.16,.32]:box(bright,x,.65+(.14 if x==0 else .07 if abs(x)<.2 else 0),-.07,.095,.27,.12)
   for side in [-1,1]:crest(3,primary,trim,bright,side*.40,.46,-.02,side,1.1)
   jewel('starlight',0,.38,.421,.15)
 else:
  if tier in [0,3]:
   box(trim,0,.03,-.36,.87,.70,.13)
   for side in [-1,1]:box(primary,side*.41,.05,-.015,.15,.65,.76)
   for i in range(4):box(primary if i%2 else trim,0,.40+i*.14,-i*.035,.91-i*.15,.17,.80-i*.13)
   for side in [-1,1]:crest(tier,primary,trim,bright,side*.40,.37,-.04,side,1.1)
  elif tier==1:
   for i in range(4):box(primary if i%2 else trim,0,.34+i*.10,-.015,.99-i*.10,.12,.88-i*.08)
   box(trim,0,.265,.0,1.06,.065,.92)
   for i in range(4):box(primary,-.43,-.22-i*.14,-.06,.17,.17,.30)
   jewel(bright,0,.40,.47,.19)
  elif tier==2:
   box(trim,0,.34,0,1.05,.10,.96)
   for i in range(5):box(primary,0,.46+i*.13,-i*.02,.76-i*.11,.15,.70-i*.10)
   for side in [-1,1]:crest(2,primary,trim,bright,side*.38,.45,-.06,side,1.15)
  else:
   box(trim,0,.32,0,1.03,.10,.93)
   for i in range(5):box(primary,0,.46+i*.13,-i*.015,.79-i*.105,.15,.73-i*.10)
   for x in [-.24,0,.24]:jewel(bright,x,.48,.37-abs(x)*.1,.13)
   for side in [-1,1]:
    strap(trim,side*.43,.59,side*.43,1.01,-.10,.065,.10)
    strap(bright,side*.43,1.01,side*.20,1.21,-.10,.055,.075)
   jewel('starlight',0,1.21,-.015,.19)
 # Fitted torso and articulated sleeves.
 copy_piece(calling+'-body',name+'-body',palette)
 switch_part('torso')
 if calling=='ranger':
  for side in [-1,1]:box(trim,side*.24,1.13,.42,.19,.21,.12)
  strap(bright,-.27,1.50,.25,1.06,.42,.045,.04)
 elif calling=='knight':
  box(trim,0,1.28,.425,.23,.35,.055)
  jewel(bright,0,1.41,.47,.16)
  for side in [-1,1]:box(primary,side*.25,.86,.28,.26,.26,.15,-side*.08)
 else:
  for side in [-1,1]:
   box(primary,side*.28,.86,.05,.27,.36,.50)
   strap(bright,side*.17,1.48,side*.11,1.02,.415,.025,.035)
  jewel(bright,0,1.36,.43,.15)
 for side,label in [(1,'left-arm'),(-1,'right-arm')]:
  switch_part(label)
  if calling=='knight':box(primary,side*.11,.02,-.01,.53,.24,.51)
  elif calling=='mage':box(trim,0,-.31,.01,.39,.18,.44)
  crest(tier,primary,trim,bright,side*.11,.12,-.02,side,.72 if calling=='ranger' else .95)
  box(bright,0,-.43,.205,.19,.07,.06)
 for slot in ['legs','shoes','back']:
  copy_piece(calling+'-'+slot,name+'-'+slot,palette)
  if slot=='legs':
   box(trim,0,-.33,.225,.29,.12,.08)
   jewel(bright,0,-.30,.279,.075)
   if tier in [2,4]:box(primary,0,-.08,.24,.23,.11,.08)
  elif slot=='shoes':
   box(trim,0,-.39,.23,.31,.08,.08)
   if tier==1:box(primary,0,-.73,.40,.29,.14,.15)
   elif tier==2:
    for side in [-1,1]:box(bright,side*.135,-.52,.19,.055,.25,.06)
   elif tier==3:crest(tier,primary,trim,bright,.12,-.45,-.02,1,.45)
   elif tier==4:jewel(bright,0,-.56,.29,.10)
  else:
   # Class packs and hanging trophies are visible from behind while travelling.
   if calling=='ranger':
    for side in [-1,1]:
     box(trim,side*.34,-.17,-.39,.21,.59,.24)
     for i in range(3):box(bright,side*.34+(i-1)*.05,.20+i*.035,-.38,.035,.24,.06)
   elif calling=='knight':
    box(primary,0,-.36,-.39,.55,.62,.10)
    box(trim,0,-.37,-.46,.40,.47,.055)
    jewel(bright,0,-.32,-.50,.18)
   else:
    for side in [-1,1]:box(trim,side*.36,-.18,-.40,.20,.43,.21)
    box(bright,-.34,.085,-.43,.15,.12,.13)
   for side in [-1,1]:crest(tier,primary,trim,bright,side*.31,-.81,-.36,side,.65)
 # Necklace roots need the same fitted torso treatment as chest armor.
 copy_piece('necklace',name+'-necklace',{'gold':trim,'goldlight':bright,'gem':bright,'gemlight':'cream'})
 if tier in [0,3]:
  for side in [-1,1]:box(bright,side*.10,1.18,.58,.055,.18,.045,-side*.30)
 elif tier==1:box(trim,0,1.16,.58,.18,.075,.05)
 elif tier==2:box(bright,0,1.08,.56,.09,.19,.065,math.pi/4)
 else:
  for side in [-1,1]:jewel(bright,side*.13,1.29,.55,.085)
 copy_piece('ring',name+'-ring',{'gold':trim,'goldlight':bright,'gem':bright,'gemlight':'cream'})
 if tier in [0,2,4]:box(bright,0,-.60,.34,.065,.14,.055,math.pi/4)
 else:
  for side in [-1,1]:box(trim,side*.09,-.60,.29,.055,.14,.05,-side*.2)
 # Weapons share the existing palm coordinates, blade axes and bow string tips.
 item(name+'-weapon')
 if calling=='ranger':
  # Stepped limbs lie in the YZ plane; ornaments leave the gripping area clear.
  for side in [-1,1]:
   for i in range(5):
    t=(i+.5)/5;y=side*(.09+.37*t);z=.26-.31*t
    box(primary,0,y,z,.070,.085,.070)
   box(trim,0,side*.48,-.05,.075,.065,.08)
   crest(tier,primary,trim,bright,0,side*.32,.19,side,.48)
   box(bright,0,side*.29,.242,.10,.09,.055)
  part('bow-string');box('cream',0,0,-.05,.014,.96,.014)
  part('weapon-grip');box(trim,0,0,.26,.082,.16,.082)
 elif calling=='knight':
  box(trim,0,-.145,0,.11,.07,.11)
  box(primary,0,.14,0,.34 if tier<3 else .43,.07,.12)
  width=[.14,.17,.15,.19,.16][tier]
  box(primary,0,.48,0,width,.62,.065)
  box(bright,-width*.28,.48,.037,.032,.59,.012)
  for i in range(3):box(primary,0,.82+i*.045,0,width*(.70-i*.20),.065,.055)
  if tier==0:
   for side in [-1,1]:box(trim,side*.085,.25,0,.08,.17,.085,-side*.25)
  elif tier==1:
   for side in [-1,1]:box(trim,side*.16,.19,0,.075,.18,.10,-side*.25)
  elif tier==2:
   for side in [-1,1]:crest(2,primary,trim,bright,side*.12,.20,0,side,.65)
  elif tier==3:
   for side in [-1,1]:strap(bright,side*.10,.28,side*.18,.47,.01,.055,.08)
  else:
   for side in [-1,1]:crest(3,primary,trim,bright,side*.13,.20,0,side,.7)
  jewel(bright,0,.16,.085,.11)
  part('weapon-grip');box(trim,0,0,0,.065,.22,.065)
 else:
  box(trim,0,.24,0,.075,1.62,.075)
  for y in [-.43,.53,.88]:box(primary,0,y,0,.12,.07,.12)
  part('staff-head')
  if tier==0:
   for side in [-1,1]:strap(trim,side*.02,.95,side*.17,1.19,0,.075,.10)
   for i in range(3):box(bright,0,1.10+i*.09,0,.19-i*.045,.12,.17-i*.035,(-1)**i*.18)
  elif tier==1:
   box(primary,0,1.17,0,.39,.39,.08,math.pi/4)
   box(trim,0,1.17,.046,.25,.25,.025,math.pi/4)
   jewel(bright,0,1.17,.075,.17)
  elif tier==2:
   for side in [-1,1]:crest(2,primary,trim,bright,side*.13,1.0,0,side,.95)
   box(bright,0,1.22,0,.15,.30,.15,math.pi/4)
  elif tier==3:
   for side in [-1,1]:
    strap(primary,side*.07,.94,side*.23,1.13,0,.075,.10)
    strap(bright,side*.23,1.13,side*.10,1.36,0,.055,.08)
   jewel(bright,0,1.18,.015,.23)
  else:
   for side in [-1,1]:
    box(trim,side*.19,1.17,0,.065,.39,.095)
    strap(trim,side*.18,1.35,0,1.47,0,.065,.09)
   box(bright,0,1.24,0,.21,.25,.21,math.pi/4)
   jewel('starlight',0,1.24,.15,.15)
  part('weapon-grip');box(trim,0,0,0,.10,.20,.10)

# Everyday enemy drops: practical materials and modest silhouette upgrades.
# These share the existing palm, arm and fitted-body contracts with the rare sets.
DROP_PALETTES={
 'ranger': [('leather','leafdark','hide'),('leaf','leather','gold')],
 'knight': [('ironplate','dark','steel'),('steel','bluedark','bronze')],
 'mage': [('bluedark','leather','paper'),('blue','purple','gem')],
 'cleric': [('cream','leather','gold'),('cream','leafdark','goldlight')],
}
DROP_SETS=[(f'drop-{calling}-{rarity}',calling,tier) for tier,rarity in enumerate(['common','uncommon']) for calling in DROP_PALETTES]
for name,calling,tier in DROP_SETS:
 primary,trim,bright=DROP_PALETTES[calling][tier]
 item(name+'-head')
 if calling=='ranger':
  box(trim,0,.035,-.36,.85,.68,.14)
  for side in [-1,1]:
   box(primary,side*.41,.045,0,.13,.65,.76)
   box(trim,side*.405,-.29,.18,.14,.16,.28)
  for i in range(3+tier):box(primary,0,.38+i*.105,-i*.028,.88-i*.15,.15,.82-i*.12)
  box(bright,0,.275,.39,.76,.055,.07)
  if tier:
   for i in range(3):box('paper',.43+i*.037,.43+i*.092,-.08,.11,.14,.045,-.35)
   strap(trim,.40,.34,.54,.72,-.04,.03,.035)
 elif calling=='knight':
  box(primary,0,.36,0,.89,.17,.81)
  box(primary,0,.485,-.02,.73,.13,.65)
  box(trim,0,.28,.39,.76,.075,.075)
  for side in [-1,1]:
   box(primary,side*.42,.025,-.035,.13,.64,.68)
   box(bright,side*.29,-.21,.34,.14,.26,.12)
   if tier:box(trim,side*.42,.14,.345,.075,.25,.075)
  box(trim,0,.035,-.36,.84,.64,.12)
  if tier:
   box(bright,0,.61,-.04,.105,.15,.53)
   box(primary,0,.02,.42,.075,.36,.06)
  else:
   box(bright,0,.31,-.02,1.02,.075,.93)
   for x in [-.29,.29]:box(bright,x,.40,.42,.04,.045,.025)
 elif calling=='mage':
  box(trim,0,.345,0,1.04,.085,.93)
  for i in range(4+tier):box(primary,i*.022,.455+i*.12,-i*.012,.79-i*.125,.145,.73-i*.105)
  box(trim,0,.48,.02,.81,.12,.72)
  box(bright,0,.46,.39,.13,.105,.05)
  if tier:
   box(primary,.18,1.01,-.04,.19,.085,.19)
   jewel(bright,0,.50,.425,.115)
   for x,y in [(-.13,.68),(.025,.85)]:box('paper',x,y,.275,.045,.075,.025,math.pi/4)
 else:
  box(primary,0,.37,-.025,.88,.14,.79)
  box(primary,0,.065,-.36,.85,.62,.13)
  for side in [-1,1]:
   box(primary,side*.41,.115,-.035,.12,.44,.68)
   box(trim,side*.415,-.12,-.24,.12,.32,.24)
  box(trim,0,.295,.38,.78,.06,.065)
  if tier:
   for side in [-1,1]:
    box(primary,side*.20,.545,-.015,.36,.24,.64)
    box(primary,side*.20,.70,-.03,.19,.14,.48)
    box(bright,side*.20,.78,-.02,.19,.035,.48)
   jewel(bright,0,.43,.415,.13)
  else:box(bright,0,.40,.41,.11,.15,.045)
 item(name+'-body','torso')
 box(primary,0,1.25,.282,.78,.64,.09)
 box(primary,0,1.25,-.262,.77,.61,.085)
 for side in [-1,1]:box(primary,side*.367,1.25,0,.095,.65,.53)
 box(trim,0,1.005,.02,.83,.095,.58)
 box(primary,0,.895,.015,.82,.15,.53)
 box(bright,0,1.005,.335,.13,.09,.037)
 if calling=='ranger':
  strap(trim,-.29,1.54,.28,1.075,.372,.11,.055)
  for side in [-1,1]:
   box(trim,side*.26,.99,.37,.18,.20,.13)
   box(bright,side*.26,1.06,.45,.055,.045,.025)
  if tier:
   for side in [-1,1]:box(trim,side*.29,1.30,.35,.15,.39,.045)
 elif calling=='knight':
  for y in ([1.24] if not tier else [1.13,1.29,1.45]):
   box(bright,0,y,.36,.60,.43 if not tier else .16,.065)
   for side in [-1,1]:box(trim,side*.24,y,.404,.035,.06,.025)
  if tier:
   for side in [-1,1]:box(primary,side*.27,.88,.285,.24,.23,.13)
 elif calling=='mage':
  for side in [-1,1]:
   box(trim,side*.27,1.25,.35,.13,.61,.04)
   box(trim,side*.28,.86,.04,.24,.29,.52)
   if tier:box(bright,side*.195,1.25,.38,.025,.55,.025)
  box(bright,0,1.47,.35,.07,.08,.035,math.pi/4)
 else:
  for side in [-1,1]:
   box(trim,side*.23,1.18,.346,.15,.71,.04)
   box(trim,side*.23,.80,.28,.18,.16,.05)
   box(bright,side*.23,.725,.31,.18,.03,.025)
   if tier:box(bright,side*.32,1.20,.37,.025,.63,.025)
  box(bright,0,1.39,.35,.12,.12,.035,math.pi/4)
 for side,label in [(1,'left-arm'),(-1,'right-arm')]:
  part(label)
  box(primary,0,-.13,0,.35,.38,.39)
  box(trim,0,-.32,.01,.355,.07,.40)
  box(trim,0,-.47,.02,.265,.12,.30)
  if tier:
   box(primary,0,.025,-.01,.46 if calling=='knight' else .40,.14,.45)
   box(bright,0,.095,-.01,.33,.035,.37)
   box(bright,0,-.43,.185,.18,.05,.045)
  elif calling=='knight':box(bright,0,.005,.205,.30,.13,.065)
 item(name+'-legs')
 box(primary if calling!='ranger' else trim,0,-.235,0,.34 if calling in ['mage','cleric'] else .30,.49,.35)
 for side in [-1,1]:box(trim,side*.13,-.24,.19,.055,.45,.04)
 if calling=='knight':box(bright,0,-.33,.22,.25,.18,.085)
 elif calling in ['mage','cleric']:box(trim,0,-.44,.213,.35,.045,.035)
 else:box(primary,0,-.22,.21,.24,.33,.055)
 if tier:box(bright,0,-.31,.269,.11,.09,.025)
 item(name+'-shoes')
 box('dark',0,-.83,.10,.35,.06,.52)
 box(trim,0,-.73,.10,.335,.17,.49)
 box(trim,0,-.55,.015,.31,.39,.365)
 box(primary,0,-.40,.025,.335,.095,.385)
 if calling=='knight':box(primary,0,-.57,.22,.28,.29,.08)
 else:
  for y in [-.53,-.66]:box(bright if tier else primary,0,y,.214,.29,.035,.035)
 if tier:
  box(primary,0,-.735,.335,.33,.13,.10)
  box(bright,.085,-.40,.239,.075,.075,.026)
 item(name+'-back')
 box(trim,0,-.39,-.14,.81,.82,.11)
 for side in [-1,1]:box(primary,side*.205,-.47,-.21,.38,.87 if tier else .76,.07)
 if calling=='ranger':
  box(trim,.12,-.22,-.32,.37,.56,.20)
  box(bright,.12,.065,-.33,.42,.085,.23)
  for x in [.04,.14,.24]:
   box('leather',x,.13,-.33,.025,.26,.025)
   box('paper',x,.235,-.33,.045,.08,.035)
  if tier:box(trim,-.30,-.21,-.30,.21,.38,.17)
 elif calling=='knight':
  box(bright,0,-.28,-.26,.12,.30,.025)
  box(bright,0,-.26,-.275,.30,.07,.025)
  if tier:box(primary,0,-.53,-.265,.24,.13,.025,math.pi/4)
 else:
  box(trim,.22,-.25,-.33,.31,.43,.17)
  box('paper',.22,-.25,-.425,.265,.375,.032)
  box(primary,.22,-.25,-.453,.32,.44,.025)
  box(bright,.22,-.25,-.475,.105,.13,.025,math.pi/4 if calling=='cleric' else 0)
 if tier:
  for side in [-1,1]:box(bright,side*.39,-.47,-.255,.035,.86,.025)
  box(bright,0,-.91,-.25,.78,.04,.035)
 item(name+'-necklace')
 for side in [-1,1]:strap(bright if tier else trim,side*.17,1.60,0,1.30,.39,.024,.03)
 box(trim,0,1.265,.44,.145,.17,.045,math.pi/4 if calling in ['mage','cleric'] else 0)
 box(bright,0,1.265,.478,.08,.105,.025)
 if tier:
  jewel('gem' if calling in ['mage','ranger'] else 'goldlight',0,1.265,.48,.11)
  box(bright,0,1.14,.48,.045,.09,.03)
 item(name+'-ring')
 for side in [-1,1]:
  box(trim,side*.114,-.60,.04,.032,.05,.27)
  box(bright,0,-.60,.04+side*.12,.23,.05,.034)
 box(primary,0,-.60,.203,.115,.09,.065)
 box(bright,0,-.60,.245,.075,.055,.025,math.pi/4 if calling in ['mage','cleric'] else 0)
 if tier:
  jewel('gem' if calling in ['mage','ranger'] else 'goldlight',0,-.60,.258,.095)
  for side in [-1,1]:box(bright,side*.075,-.60,.235,.035,.09,.045)
 item(name+'-weapon')
 if calling=='ranger':
  for side in [-1,1]:
   for i in range(5):
    t=(i+.5)/5;box('leather',0,side*(.09+.37*t),.26-.31*t,.072,.09,.072)
   box(trim,0,side*.48,-.05,.075,.06,.08)
   if tier:
    box(bright,0,side*.30,.15,.085,.15,.085)
    box(primary,0,side*.435,-.012,.075,.12,.075)
  part('bow-string');box('paper',0,0,-.05,.014,.96,.014)
  part('weapon-grip');box(trim,0,0,.26,.082,.16,.082)
 elif calling=='knight':
  box('iron',0,.46,0,.145,.57,.065)
  for i in range(3):box('iron',0,.765+i*.04,0,.115-i*.035,.065,.06)
  box(bright,0,.14,0,.35+tier*.06,.07,.10)
  box(trim,0,-.14,0,.115,.07,.105)
  if tier:
   box('silver',-.046,.48,.037,.025,.57,.012)
   for side in [-1,1]:box(bright,side*.18,.18,0,.065,.13,.095,-side*.25)
  part('weapon-grip');box(trim,0,0,0,.065,.22,.065)
 elif calling=='mage':
  box('leather',0,.22,0,.075,1.54,.075)
  for y in [-.43,.73,.93]:box(trim,0,y,0,.105,.07,.105)
  part('staff-head')
  for side in [-1,1]:strap(trim,side*.025,.95,side*.14,1.17,0,.06,.075)
  box(bright,0,1.13,0,.16,.23,.16,math.pi/4)
  if tier:
   for side in [-1,1]:strap('gold',side*.14,1.15,side*.08,1.32,0,.04,.06)
   box('gemlight',0,1.30,0,.095,.12,.095,math.pi/4)
  part('weapon-grip');box(trim,0,0,0,.10,.20,.10)
 else:
  box('leather',0,.17,0,.078,.60,.078)
  box(bright,0,-.17,0,.12,.09,.12)
  box('iron' if not tier else 'bronze',0,.47,0,.22,.23,.22)
  for side in [-1,1]:
   box(bright,side*.145,.48,0,.075,.23,.27)
   box(bright,0,.48,side*.145,.27,.23,.075)
  box(primary,0,.48,.19,.13,.13,.03,math.pi/4)
  if tier:
   box(bright,0,.64,0,.16,.09,.16)
   box('goldlight',0,.48,.217,.07,.07,.02,math.pi/4)
  part('weapon-grip');box(trim,0,0,0,.105,.21,.105)

# Rebuild the authored pieces around the same measured profiles as race-kit.blend.
# These are baked mesh vertices, never scale transforms on a character or attachment.
base_names=list(parts)
profiles=json.loads((ROOT/'assets/source/race-fit.json').read_text())
fit_roots={}
def interpolate(value,knots):
 for index in range(len(knots)-1):
  a,b=knots[index:index+2]
  if value<=b[0]:break
 return a[1]+(b[1]-a[1])*(value-a[0])/(b[0]-a[0])
def body_y(y,profile):
 torso=profile['torso']
 return interpolate(y,[(.86,profile['hip']['y']),(.89,torso['hemY']),(1.11,torso['waistY']),(1.31,torso['chestY']),(1.555,torso['topY'])])
def fitted_point(x,y,z,base,label,profile):
 torso=profile['torso']
 if base.endswith('head'):
  head=profile['head'];return x*head['upperWidth']/.73,y+head['top']-.335,z*head['upperDepth']/.66
 if label.endswith('arm'):
  # Every race keeps the same palm; broad shoulders taper down to that common hand.
  fit=1+(profile['shoulder']['upperWidth']/.25-1)*max(0,min(1,(y+.54)/.50))
  return x*fit,y,z*fit
 if base.endswith('body') or base.endswith('necklace'):
  width=interpolate(y,[(.89,torso['hemWidth']),(1.11,torso['waistWidth']),(1.31,torso['chestWidth']),(1.555,torso['width'])])
  new_y=body_y(y,profile)
  chest=max(0,min(1,(.22-abs(new_y-torso['chestY']))/.12))
  front=(torso['chestFront']-torso['depth']/2)*chest if z>.20 else 0
  return x*width/.70,new_y,z*torso['depth']/.40+front
 if base.endswith('legs'):
  fit=profile['hip']['thighWidth']/.26
  return x*fit,y*profile['hip']['y']/.86,z*fit
 if base.endswith('shoes'):
  foot=profile['foot'];depth=foot['depth']/.46
  return x*foot['width']/.31,y*profile['hip']['y']/.86,z*depth+foot['front']-.31*depth
 if base.endswith('back'):
  return x*torso['width']/.7,y*(profile['cape']['y']-.3)/(1.49-.3),z
 return x,y,z

for fit,profile in profiles.items():
 for base in base_names:
  if not (base.endswith(('body','legs','shoes','back','necklace')) or (base.startswith('drop-') and base.endswith('head'))):continue
  name=base+'-'+fit;source=copy.deepcopy(boxes[base]);item(name,next(iter(source)))
  fit_roots[name]={'baseModel':base,'fit':fit}
  for index,(label,records) in enumerate(source.items()):
   if index:part(label)
   for color,x,y,z,w,h,d,angle in records:
    # Segment tall torso pieces so a fitted chest, waist and hem remain distinct shapes.
    # Flat fronts would hide the female body shape and intersect its clothed chest.
    segments=max(1,math.ceil(h/.11)) if label=='torso' else 1
    for segment in range(segments):
     offset=h*((segment+.5)/segments-.5)
     box(color,x-math.sin(angle)*offset,y+math.cos(angle)*offset,z,w,h/segments,d,angle)
   data=parts[name][label]
   data['vertices']=[xyz(*fitted_point(v[0],v[2],-v[1],base,label,profile)) for v in data['vertices']]

library=bpy.context.scene;library.name='Wearable library - runtime pivots'
library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
material=bpy.data.materials.new('Mossvale gear vertex palette');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.68
color_node=material.node_tree.nodes.new('ShaderNodeVertexColor');color_node.layer_name='GearTint'
material.node_tree.links.new(color_node.outputs['Color'],shader.inputs['Base Color'])
roots={}
for name,groups in parts.items():
 parent=bpy.data.objects.new(name,None);library.collection.objects.link(parent);roots[name]=parent
 parent['runtime_axes']='metres, Y up, +Z front; identity transform'
 base=fit_roots.get(name,{}).get('baseModel',name)
 parent['anchor']='head' if base.endswith('head') else 'cape' if base.endswith('back') else 'leg' if base.endswith(('legs','shoes')) else 'arm' if base.endswith('ring') else 'weapon' if base.endswith('weapon') else 'body'
 for key,value in fit_roots.get(name,{}).items():parent[key]=value
 for label,data in groups.items():
  # Fitted torso subdivisions share hidden interior faces. Remove both sides of
  # each exact shared quad without simplifying silhouettes or fit coordinates.
  shared={}
  for index,face in enumerate(data['faces']):
   key=tuple(sorted(tuple(round(value,6) for value in data['vertices'][vertex]) for vertex in face))
   shared.setdefault(key,[]).append(index)
  hidden=set()
  for adjacent in shared.values():
   if len(adjacent)!=2:continue
   normals=[]
   for index in adjacent:
    points=[Vector(data['vertices'][vertex]) for vertex in data['faces'][index]]
    normals.append((points[1]-points[0]).cross(points[2]-points[0]))
   if normals[0].dot(normals[1])<0:hidden.update(adjacent)
  data['colors']=[color for index,color in enumerate(data['colors']) if index not in hidden]
  data['faces']=[face for index,face in enumerate(data['faces']) if index not in hidden]
  mesh=bpy.data.meshes.new(name+'-'+label);mesh.from_pydata(data['vertices'],[],data['faces']);mesh.update();mesh.materials.append(material)
  tint=mesh.color_attributes.new(name='GearTint',type='BYTE_COLOR',domain='CORNER')
  for face,color in zip(mesh.polygons,data['colors']):
   face.use_smooth=False
   for index in face.loop_indices:tint.data[index].color=color
  child=bpy.data.objects.new(name+'-'+label,mesh);library.collection.objects.link(child);child.parent=parent;child['anchor']=label if label.endswith('arm') else parent['anchor']
  if base.endswith('weapon') and label in ['weapon-grip','bow-string','staff-head']:
   child['role']=label
   if label=='weapon-grip':
    grip=Vector(xyz(0,0,.26 if base[:-7] in SET_FAMILIES['ranger'] or base.startswith('drop-ranger-') else 0));child.location=grip
    for vertex in mesh.vertices:vertex.co-=grip
for path in [EXPORT.parent,SOURCE.parent,THUMBS]:path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
 cli=['npx','--yes','@gltf-transform/cli@4.5.0']
 with tempfile.TemporaryDirectory(prefix='mossvale-gear-') as temporary:
  first=str(Path(temporary)/'quantized.glb');second=str(Path(temporary)/'dedup.glb')
  for command in [['quantize',str(EXPORT),first,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['dedup',first,second],['prune',second,str(EXPORT)]]:subprocess.run(cli+command,check=True)
 raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+length])
 for field in ['extensionsUsed','extensionsRequired']:document[field]=sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
 encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=raw[20+length:]
 EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)

def scene_setup(name,transparent=False):
 scene=bpy.data.scenes.new(name);bpy.context.window.scene=scene
 scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
 scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=transparent
 scene.view_settings.view_transform='AgX';scene.world=bpy.data.worlds.new(name+' world');scene.world.use_nodes=True
 scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.17,.20,.22,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
 for at,power,size in [((-3,5,6),550,5),((4,3,1),350,4)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(0,1,0))
 bpy.ops.object.camera_add(location=xyz(4,3,8));camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
 return scene,camera
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
def copy_item(scene,name,at=(0,0,0),root_parent=None):
 source=roots[name];parent=bpy.data.objects.new(name+' display',None);scene.collection.objects.link(parent);parent.location=xyz(*at);parent.parent=root_parent
 shoulder=profiles[fit_roots[name]['fit']]['shoulder'] if name in fit_roots else {'x':.47,'y':1.44,'z':0}
 for child in source.children:
  obj=child.copy();obj.data=child.data;scene.collection.objects.link(obj);obj.parent=parent
  if child.name.endswith('left-arm'):obj.location=xyz(shoulder['x'],shoulder['y'],shoulder['z'])
  elif child.name.endswith('right-arm'):obj.location=xyz(-shoulder['x'],shoulder['y'],shoulder['z'])
 return parent
def preview_box(scene,color,at,size,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*at));obj=bpy.context.object;obj.name='Gallery mannequin - not exported';obj.scale=xyz(size[0],size[1],-size[2]);obj.parent=parent
 mat=bpy.data.materials.get('Preview '+color)
 if not mat:
  mat=bpy.data.materials.new('Preview '+color);mat.diffuse_color=COLORS[color];mat.use_nodes=True
  mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=COLORS[color]
  mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.82
 obj.data.materials.append(mat);return obj

gallery,camera=scene_setup('Wearable set gallery')
gallery.render.resolution_x=2400;gallery.render.resolution_y=2000
race_sources={}
race_asset=ROOT/'public/models/race-kit.glb'
if race_asset.exists():
 before=set(gallery.objects);bpy.ops.import_scene.gltf(filepath=str(race_asset))
 imported=set(gallery.objects)-before
 race_sources={obj.name:obj for obj in imported if obj.name in {p['root'] for p in profiles.values()}}
 for obj in imported:obj.hide_render=True
def copy_body(source,parent,skin,scene=None):
 scene=scene or gallery
 if source.type=='MESH' and source.get('slot') in ['armor','legs','shoes']:return
 obj=source.copy();obj.data=source.data;scene.collection.objects.link(obj);obj.parent=parent;obj.hide_render=False
 if obj.type=='MESH' and source.get('tint') not in [None,'fixed']:
  mat=source.active_material.copy();tint=COLORS.get({'skin':skin,'hair':'dark','outfit':'cream','accent':'gold','leather':'leather'}[source['tint']],COLORS['skin'])
  mat.diffuse_color=tint;socket=mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color']
  if socket.links:
   source_socket=socket.links[0].from_socket;mat.node_tree.links.remove(socket.links[0])
   multiply=mat.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=tint
   mat.node_tree.links.new(source_socket,multiply.inputs[1]);mat.node_tree.links.new(multiply.outputs[0],socket)
  else:socket.default_value=tint
  obj.data=obj.data.copy();obj.data.materials.clear();obj.data.materials.append(mat)
 for child in source.children:copy_body(child,obj,skin,scene)
 return obj
for index,(calling,archetype,tier) in enumerate(NEW_SETS):
 fit,profile=list(profiles.items())[index%len(profiles)];column=tier;row=index//5
 figure=bpy.data.objects.new(fit+' fitted '+calling,None);gallery.collection.objects.link(figure);figure.location=xyz((column-2)*2.5,-row*4.3,0)
 head,hip,shoulder=profile['head'],profile['hip'],profile['shoulder']
 skin={'elf':'elfskin','orc':'orcskin','goblin':'goblinskin','foxfolk':'foxskin'}.get(profile['race'],'skin')
 if profile['root'] in race_sources:copy_body(race_sources[profile['root']],figure,skin)
 else:
  preview_box(gallery,skin,(head['x'],head['y'],head['z']),(.73,.67,.62),figure)
 for side in [-1,1]:
  preview_box(gallery,skin,(side*shoulder['x'],shoulder['y']-.625,.04),(.22,.15,.23),figure)
  preview_box(gallery,'ink',(side*.155,head['y']-.045,head['z']+.322),(.105,.14,.029),figure)
  preview_box(gallery,'paper',(side*.155-.018,head['y']-.008,head['z']+.341),(.035,.045,.015),figure)
 copy_item(gallery,calling+'-head',(head['x'],head['y'],head['z']),figure)
 copy_item(gallery,calling+'-body-'+fit,root_parent=figure)
 cape=profile['cape'];copy_item(gallery,calling+'-back-'+fit,(cape['x'],cape['y'],cape['z']),figure)
 for side in [-1,1]:
  for slot in ['legs','shoes']:copy_item(gallery,calling+'-'+slot+'-'+fit,(side*hip['x'],hip['y'],hip['z']),figure)
 copy_item(gallery,calling+'-necklace-'+fit,root_parent=figure)
 copy_item(gallery,calling+'-weapon',(.95,.85,0),figure)
 preview_box(gallery,'iron',((column-2)*2.5,-row*4.3-.10,0),(1.55,.18,1.25))
 text=bpy.data.curves.new(fit+' label','FONT');text.body=calling.title()+' / '+fit.title();text.align_x='CENTER';text.size=.13;text.extrude=0
 label=bpy.data.objects.new(fit+' label',text);gallery.collection.objects.link(label);label.location=xyz((column-2)*2.5,-row*4.3-.39,.35);label.rotation_euler=(math.pi/2,0,0);text.materials.append(bpy.data.materials['Preview paper'])
camera.location=xyz(4.4,1.5,24);camera.data.ortho_scale=17.5;aim(camera,(0,-2.8,0))
bpy.ops.object.light_add(type='AREA',location=xyz(0,-2,9));bpy.context.object.data.energy=2200;bpy.context.object.data.size=12;aim(bpy.context.object,(0,-2,0))
gallery.render.filepath=str(PREVIEW)

drop_gallery,drop_camera=scene_setup('Common and uncommon drop gear')
drop_gallery.render.resolution_x=2304;drop_gallery.render.resolution_y=1728
drop_gallery.cycles.samples=24
drop_gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.035,.055,.06,1)
def drop_label(text,at,size=.15,color='paper'):
 curve=bpy.data.curves.new(text,'FONT');curve.body=text;curve.align_x='CENTER';curve.size=size
 obj=bpy.data.objects.new(text,curve);drop_gallery.collection.objects.link(obj);obj.location=xyz(*at);obj.rotation_euler=(math.pi/2,0,0)
 curve.materials.append(bpy.data.materials['Preview '+color]);return obj
drop_label('M O S S V A L E',(0,4.13,0),.19)
drop_label('EVERYDAY ADVENTURE',(0,3.67,0),.37)
drop_label('Common finds and uncommon upgrades  /  64 new wearable models',(0,3.32,0),.14)
display_fits=['human-male','dwarf-female','elf-male','foxfolk-female','goblin-female','orc-male','human-female','elf-female']
for index,(name,calling,tier) in enumerate(DROP_SETS):
 fit=display_fits[index];profile=profiles[fit];column=index%4;row=index//4;x=(column-1.5)*2.85;y=-row*4.1
 figure=bpy.data.objects.new(name+' equipped '+fit,None);drop_gallery.collection.objects.link(figure);figure.location=xyz(x,y,0)
 head,hip,shoulder=profile['head'],profile['hip'],profile['shoulder']
 skin={'elf':'elfskin','orc':'orcskin','goblin':'goblinskin','foxfolk':'foxskin'}.get(profile['race'],'skin')
 if profile['root'] in race_sources:copy_body(race_sources[profile['root']],figure,skin,drop_gallery)
 else:preview_box(drop_gallery,skin,(head['x'],head['y'],head['z']),(.73,.67,.62),figure)
 for side in [-1,1]:
  preview_box(drop_gallery,skin,(side*shoulder['x'],shoulder['y']-.625,.04),(.22,.15,.23),figure)
  preview_box(drop_gallery,'ink',(side*.155,head['y']-.045,head['z']+.322),(.105,.14,.029),figure)
  preview_box(drop_gallery,'paper',(side*.155-.018,head['y']-.008,head['z']+.341),(.035,.045,.015),figure)
 copy_item(drop_gallery,name+'-head-'+fit,(head['x'],head['y'],head['z']),figure)
 copy_item(drop_gallery,name+'-body-'+fit,root_parent=figure)
 cape=profile['cape'];copy_item(drop_gallery,name+'-back-'+fit,(cape['x'],cape['y'],cape['z']),figure)
 for side in [-1,1]:
  for slot in ['legs','shoes']:copy_item(drop_gallery,name+'-'+slot+'-'+fit,(side*hip['x'],hip['y'],hip['z']),figure)
 copy_item(drop_gallery,name+'-necklace-'+fit,root_parent=figure)
 copy_item(drop_gallery,name+'-ring',(-shoulder['x'],shoulder['y'],shoulder['z']),figure)
 hand=bpy.data.objects.new(name+' display hand',None);drop_gallery.collection.objects.link(hand);hand.parent=figure
 hand.location=xyz(shoulder['x']*(1 if calling=='ranger' else -1),shoulder['y']-.625,.04)
 hand.rotation_euler=(0,0,-.95) if calling=='ranger' else (.18,-.80 if calling=='knight' else -.40,0)
 copy_item(drop_gallery,name+'-weapon',(0,0,-.26 if calling=='ranger' else 0),hand)
 preview_box(drop_gallery,'leafdark' if tier else 'iron',(x,y-.11,0),(1.80,.18,1.28))
 drop_label(calling.upper(),(x,y-.44,.28),.21)
 drop_label('UNCOMMON' if tier else 'COMMON',(x,y-.68,.28),.12)
drop_camera.location=xyz(2.2,1.8,24);drop_camera.data.ortho_scale=14.1;aim(drop_camera,(0,-.22,0))
bpy.ops.object.light_add(type='AREA',location=xyz(0,-1.6,8));bpy.context.object.data.energy=1800;bpy.context.object.data.size=10;aim(bpy.context.object,(0,-1.7,0))
drop_gallery.render.filepath=str(ROOT/'assets/source/drop-gear-preview.png')

thumbs,thumb_camera=scene_setup('Transparent item thumbnails',True)
thumbs.render.resolution_x=192;thumbs.render.resolution_y=192;thumbs.cycles.samples=8
thumb_collection=bpy.data.collections.new('Current thumbnail');thumbs.collection.children.link(thumb_collection)
bpy.context.window.scene=drop_gallery;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('GEAR_KIT '+json.dumps({'cubes':sum(counts.values()),'triangles':sum(len(group['faces'])*2 for groups in parts.values() for group in groups.values()),'glb_bytes':EXPORT.stat().st_size,'roots':len(roots),'drop_models':len(DROP_SETS)*8}))
if '--render' in sys.argv:
 if '--drop-only' not in sys.argv:
  bpy.context.window.scene=gallery;bpy.ops.render.render(write_still=True)
 bpy.context.window.scene=drop_gallery
 bpy.ops.render.render(write_still=True)
 bpy.context.window.scene=thumbs
 for name in base_names:
  if '--drop-only' in sys.argv and not name.startswith('drop-'):continue
  if '--new-only' in sys.argv and not any(name.startswith(set_name+'-') for set_name,_,_ in NEW_SETS):continue
  before=set(thumbs.objects)
  if name.endswith(('legs','shoes')):
   copy_item(thumbs,name,(-.20,0,0));copy_item(thumbs,name,(.20,0,0))
  else:copy_item(thumbs,name)
  objects=set(thumbs.objects)-before;bpy.context.view_layer.update()
  corners=[obj.matrix_world@Vector(corner) for obj in objects if obj.type=='MESH' for corner in obj.bound_box]
  lower=Vector(tuple(min(point[i] for point in corners) for i in range(3)));upper=Vector(tuple(max(point[i] for point in corners) for i in range(3)))
  center=(lower+upper)*.5;size=upper-lower
  # Back items face the thumbnail camera so clasps, embroidery and packs remain legible.
  direction=-1 if name.endswith('back') else 1
  game_center=(center.x,center.z,-center.y)
  view=(6,2.3,1.5) if name.startswith('drop-ranger-') and name.endswith('weapon') else (direction*3.0,2.3,direction*6.0)
  thumb_camera.location=center+Vector(xyz(*view));aim(thumb_camera,game_center)
  thumb_camera.data.ortho_scale=max(size.x,size.z,size.y)*1.38
  thumbs.render.filepath=str(THUMBS/(name+'.png'));bpy.ops.render.render(write_still=True)
  for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
