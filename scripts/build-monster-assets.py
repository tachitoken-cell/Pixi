"""Author Mossvale's articulated voxel bestiary and real Blender attack clips.

blender --background --python scripts/build-monster-assets.py -- --render --optimize
Metres; GLB is Y-up, +Z-front, ground-origin. Each <kind>-attack is one second,
contacts at .5s and returns exactly to rest. Each <kind>-auto is a direct
0.4s strike with contact at its midpoint. Each <kind>-death collapses over
1.4s and holds its grounded final pose. Rigid parts need no skin/decoder.
"""
import bpy
import json
import math
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT/'public/models/monster-kit.glb'
SOURCE = ROOT/'assets/source/monster-kit.blend'
PREVIEW = ROOT/'assets/source/monster-kit-preview.png'
WORLD_BOSSES = {'briarhorn-elder':10,'rimefang-matriarch':20,'stormhorn-behemoth':30,'ashen-crown-titan':40}
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials): bpy.data.materials.remove(material)
HEX = {
 'bark':'665443','barklight':'947D55','barkdark':'3B4338','leaf':'527D50','leaflight':'9CAB62','leafdark':'2C5244',
 'fur':'77866E','furbright':'B4B797','furshade':'4E675E','bone':'E4D7B4','ink':'26343D','eye':'F0CC72',
 'clay':'AE7050','sand':'D5AA69','sandlight':'EAD39B','scorch':'4A4042','ember':'DE7745','fire':'F6C26D',
 'stone':'7F8C88','stoneshade':'566E72','stonelight':'AFC0AD','crystal':'76D3C5','glow':'C6F1DB',
 'snow':'DCE5DA','snowshade':'A9C4C6','ice':'6D9FAE','blue':'536F97','deepblue':'344B6E',
 'purple':'7D638E','violet':'B787BA','void':'34374E','voidlight':'555672','rose':'D789AD',
 'moss':'61845C','mosslight':'ACC276','toad':'849965','toadshade':'486C58','mouth':'673B48',
 'gold':'D5B56B','cream':'E8DFBF','plinth':'42576A','floor':'233542',
}
def linear(v): return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4
COLORS = {key:tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,) for key,value in HEX.items()}
def xyz(x,y,z): return (x,-z,y)
parts={}; active=''; current=''; counts={}; motions={}
def monster(name):
 global active
 active=name; parts[name]={}; counts[name]=0; motions[name]={}
def part(name,pivot,parent=None):
 global current
 current=name; parts[active][name]={'pivot':pivot,'parent':parent,'vertices':[],'faces':[],'colors':[]}
def box(tint,x,y,z,w,h,d,rx=0,ry=0,rz=0):
 data=parts[active][current]; base=len(data['vertices']); pivot=data['pivot']
 # Rotate authored blocks in game axes before converting to Blender's Z-up.
 rotation=Euler((rx,ry,rz),'XYZ').to_matrix()
 for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
  point=rotation@Vector((a*w/2,b*h/2,c*d/2))
  data['vertices'].append(xyz(point.x+x-pivot[0],point.y+y-pivot[1],point.z+z-pivot[2]))
 for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
  data['faces'].append(tuple(base+i for i in face)); data['colors'].append(COLORS[tint])
 counts[active]+=1
def spike(tint,x,y,z,w,h,d,lean_x=0,lean_z=0,steps=4):
 for n in range(steps):
  t=(n+.5)/steps; scale=1-.78*t
  box(tint,x+lean_x*t,y+h*t,z+lean_z*t,w*scale,h/steps+.018,d*scale)
def eyes(x,y,z,gap,color='eye',size=.10):
 for side in [-1,1]:
  box('ink',x+side*gap,y,z,size*1.7,size*1.45,.045)
  box(color,x+side*gap,y+.008,z+.027,size,size,.035)
  box('cream',x+side*gap-size*.19,y+size*.21,z+.048,size*.26,size*.27,.014)
def motion(name,wind=(0,0,0),hit=(0,0,0),wind_move=(0,0,0),hit_move=(0,0,0)):
 motions[active][name]=(wind,hit,wind_move,hit_move)
def four_legs(tint,x,y,zfront,zback,width=.27,foot='barkdark'):
 for n,(side,z) in enumerate([(1,zfront),(-1,zfront),(1,zback),(-1,zback)]):
  part('leg-'+str(n),(side*x,y,z),'body')
  box(tint,side*x,y/2+.035,z,width,y-.03,width*1.15)
  box(foot,side*x,.105,z+.06,width*1.16,.21,width*1.48)
  motion(current,(-.18 if n<2 else .12,0,0),(.25 if n<2 else -.12,0,0))

# Bramble wolf: lean long muzzle, bristling leaf mane, separate biting jaw.
monster('bramble-wolf'); part('body',(0,.88,0))
box('fur',0,.91,-.09,.62,.62,1.23); box('furshade',0,.75,.26,.71,.45,.64)
for side in [-1,1]:
 for n in range(3):spike('leaf' if n%2 else 'leaflight',side*.27,1.09,.32-n*.23,.22,.24,.24,side*.12,-.10,3)
part('head',(0,1.12,.51),'body')
box('fur',0,1.22,.70,.62,.49,.53); box('furbright',0,1.08,1.00,.43,.24,.49)
box('ink',0,1.105,1.253,.27,.13,.10); eyes(0,1.31,.976,.22,size=.08)
for side in [-1,1]:
 spike('furshade',side*.23,1.42,.57,.20,.38,.24,side*.02,-.07)
 box('bone',side*.16,1.007,1.12,.07,.13,.065)
part('jaw',(0,1.06,.66),'head');box('furshade',0,.929,1.00,.40,.14,.49);box('mouth',0,1.007,1.015,.33,.04,.37)
four_legs('fur',.245,.68,.39,-.54,.21)
part('tail',(0,1.00,-.68),'body');box('furshade',0,1.01,-.96,.27,.29,.61,rx=-.36);box('furbright',0,1.12,-1.23,.23,.23,.25)
motion('body',(-.14,0,0),(.12,0,0),(0,-.04,-.11),(0,0,.24));motion('head',(-.24,0,0),(.28,0,0));motion('jaw',(.48,0,0),(-.05,0,0));motion('tail',(-.3,0,0),(.2,0,0))

# Briar boar: heavy ochre barrel, snout, paired curling tusks and ridge quills.
monster('briar-boar');part('body',(0,.78,0))
box('bark',0,.79,-.13,1.01,.80,1.29);box('barklight',0,1.105,-.10,.82,.27,1.02)
for n in range(5):spike('leafdark',0,1.20,-.48+n*.20,.24,.22+(n%2)*.11,.20,0,-.10,3)
part('head',(0,.86,.56),'body');box('clay',0,.88,.72,.85,.61,.68);box('barklight',0,.78,1.08,.62,.34,.31)
box('sand',0,.79,1.254,.56,.27,.055)
for side in [-1,1]:
 box('barkdark',side*.16,.81,1.29,.10,.075,.03)
 spike('bone',side*.38,.55,1.04,.15,.43,.13,side*.07,.17)
 box('barkdark',side*.46,1.10,.70,.25,.19,.28,rz=side*.42)
eyes(0,1.01,1.071,.30,size=.09)
four_legs('barkdark',.39,.51,.38,-.56,.28)
part('tail',(0,.97,-.80),'body');box('barklight',0,1.01,-.96,.12,.13,.36,rx=.32);box('barkdark',.08,1.08,-1.10,.23,.11,.10)
motion('body',(-.17,0,0),(.13,0,0),(0,-.05,-.18),(0,-.03,.33));motion('head',(-.40,0,0),(.34,0,0));motion('tail',(0,-.4,0),(0,.4,0))

# Grove spider: eight rootlike angular legs, mossy rear abdomen and six eyes.
monster('grove-spider');part('body',(0,.55,-.12))
box('leafdark',0,.57,-.38,.88,.58,.87);box('moss',0,.77,-.41,.71,.28,.72)
for x,z in [(-.22,-.49),(.21,-.54),(0,-.25)]:spike('mosslight',x,.85,z,.19,.18,.20,0,-.03,3)
part('head',(0,.50,.30),'body');box('barkdark',0,.51,.40,.64,.37,.51)
eyes(0,.58,.681,.20,'rose',.075);eyes(0,.69,.664,.075,'eye',.045)
for side in [-1,1]:
 box('rose',side*.266,.47,.69,.065,.065,.027)
 box('bone',side*.155,.332,.70,.10,.21,.09,rz=side*.25)
for n in range(8):
 side=1 if n%2==0 else -1; z=.36-(n//2)*.26
 part('leg-'+str(n),(side*.29,.55,z),'body')
 box('bark',side*.64,.60,z,.76,.14,.15,rz=side*.15,ry=side*(n//2-1.5)*.16)
 box('barkdark',side*1.01,.305,z+.05,.15,.59,.16,rz=side*.24)
 box('moss',side*.75,.66,z,.24,.11,.18)
 motion(current,(0,0,side*.22),(0,0,-side*.12))
motion('body',(-.24,0,0),(.31,0,0),(0,.11,-.10),(0,-.10,.17));motion('head',(-.18,0,0),(.25,0,0))

# Ember beetle: split burnt-orange carapace, six iron feet and bright mandibles.
monster('ember-beetle');part('body',(0,.49,-.10))
box('scorch',0,.48,-.10,.93,.48,1.23)
for side in [-1,1]:
 box('clay',side*.265,.70,-.19,.47,.38,1.01)
 box('ember',side*.25,.913,-.19,.42,.09,.89)
 for n in range(3):box('fire',side*.25,.969,-.46+n*.26,.27,.028,.09)
part('head',(0,.46,.55),'body');box('scorch',0,.48,.64,.64,.37,.44);eyes(0,.59,.878,.215,'fire',.087)
for side,label in [(1,'left-arm'),(-1,'right-arm')]:
 part(label,(side*.27,.39,.77),'head');box('ember',side*.32,.36,.96,.16,.21,.46,ry=-side*.28);box('fire',side*.22,.35,1.15,.23,.17,.13)
 motion(label,(0,side*.43,0),(0,-side*.40,0))
for n in range(6):
 side=1 if n%2==0 else -1;z=.36-(n//2)*.41
 part('leg-'+str(n),(side*.41,.45,z),'body')
 box('scorch',side*.66,.28,z,.46,.13,.17,rz=side*.48);box('clay',side*.83,.10,z+.035,.19,.20,.23)
 motion(current,(0,0,side*.16),(0,0,-side*.12))
motion('body',(-.15,0,0),(.25,0,0),(0,.04,-.12),(0,-.03,.18));motion('head',(-.25,0,0),(.20,0,0))

# Dune scorpion: broad claws and an articulated high stinger, not a beetle recolor.
monster('dune-scorpion');part('body',(0,.40,0))
box('clay',0,.42,-.13,.69,.42,1.09)
for n in range(4):box('sand',0,.66,-.49+n*.26,.70-.05*n,.13,.22)
part('head',(0,.41,.47),'body');box('sand',0,.44,.51,.62,.31,.39);eyes(0,.55,.722,.18,size=.07)
for side,label in [(1,'left-arm'),(-1,'right-arm')]:
 part(label,(side*.33,.42,.42),'body')
 box('clay',side*.60,.40,.77,.28,.24,.80,ry=side*.28)
 box('sand',side*.73,.40,1.21,.45,.25,.49)
 for edge in [-1,1]:box('sandlight',side*.73+edge*.14,.42,1.50,.16,.23,.28,ry=edge*.19)
 motion(label,(-.15,side*.45,0),(.15,-side*.33,0))
for n in range(6):
 side=1 if n%2==0 else -1;z=.17-(n//2)*.32
 part('leg-'+str(n),(side*.27,.34,z),'body');box('clay',side*.60,.22,z,.65,.13,.15,rz=side*.24);box('sand',side*.88,.09,z+.045,.16,.18,.22)
 motion(current,(0,0,side*.13),(0,0,-side*.12))
part('tail',(0,.53,-.62),'body')
for n,(y,z) in enumerate([(.72,-.85),(1.02,-1.01),(1.33,-.97),(1.57,-.74)]):box('clay' if n%2 else 'sand',0,y,z,.30-n*.022,.35,.33)
part('stinger',(0,1.57,-.72),'tail');box('sand',0,1.65,-.48,.28,.28,.45);box('scorch',0,1.51,-.22,.15,.39,.14,rx=-.35)
motion('body',(0,0,0),(.10,0,0),(0,0,-.05),(0,-.04,.05));motion('tail',(-.43,0,0),(.88,0,0));motion('stinger',(-.32,0,0),(.34,0,0))

# Stone golem: asymmetric stepped boulder shoulders, luminous chest rune and fists.
monster('stone-golem');part('body',(0,1.28,0))
box('stoneshade',0,1.21,0,1.05,.93,.71);box('stone',0,1.48,.04,1.30,.71,.84)
box('stonelight',-.30,1.63,.46,.49,.48,.10);box('stone',.35,1.36,.47,.51,.64,.14)
box('ink',0,1.46,.48,.23,.43,.055)
for y,w in [(1.29,.24),(1.47,.12),(1.64,.25)]:box('crystal',0,y,.52,w,.10,.045)
for side in [-1,1]:box('moss',side*.46,1.85,.03,.30,.10,.50)
part('head',(0,1.98,.01),'body');box('stone',0,2.10,.02,.73,.68,.67);box('stonelight',-.04,2.46,-.035,.64,.13,.56)
eyes(0,2.18,.374,.20,'crystal',.105);box('stoneshade',0,1.985,.367,.42,.10,.05)
for side,label in [(1,'left-arm'),(-1,'right-arm')]:
 part(label,(side*.74,1.74,.01),'body')
 box('stone',side*.83,1.65,.01,.55,.51,.66);box('stonelight',side*.87,1.93,.00,.51,.13,.55)
 box('stoneshade',side*.88,1.15,.02,.40,.62,.45);box('stone',side*.91,.78,.12,.58,.42,.60)
 for n in range(3):box('stonelight',side*.91+(n-1)*.17,.72,.446,.13,.24,.055)
 motion(label,(-1.72,0,-side*.12),(-.40,0,side*.09))
for side,label in [(1,'left-leg'),(-1,'right-leg')]:
 part(label,(side*.32,.88,0),'body');box('stone',side*.32,.55,0,.43,.66,.51);box('stoneshade',side*.32,.17,.16,.54,.34,.73)
 motion(label,(-.09,0,0),(.07,0,0))
motion('body',(-.19,0,0),(.39,0,0),(0,.07,-.09),(0,-.17,.14));motion('head',(-.12,0,0),(.18,0,0))

# Frost yeti: broad hanging furry arms, icy blue face mask and little horns.
monster('frost-yeti');part('body',(0,1.32,0))
box('snowshade',0,1.32,0,1.13,1.04,.73);box('snow',0,1.65,.03,1.38,.68,.84)
for side in [-1,1]:
 for n in range(3):box('snow',side*(.30+n*.08),1.17-n*.17,.397,.30,.15,.20)
part('head',(0,2.05,.07),'body');box('snow',0,2.17,.12,.82,.69,.70);box('snowshade',0,2.48,.04,.69,.18,.61)
box('ice',0,2.15,.491,.61,.38,.09);eyes(0,2.235,.55,.17,'deepblue',.075);box('deepblue',0,2.05,.558,.31,.07,.03)
for side in [-1,1]:
 spike('bone',side*.32,2.42,.02,.19,.28,.20,side*.10,-.04)
 box('bone',side*.15,1.999,.57,.06,.14,.06)
for side,label in [(1,'left-arm'),(-1,'right-arm')]:
 part(label,(side*.77,1.87,.01),'body');box('snow',side*.90,1.53,.01,.52,.77,.61);box('snowshade',side*1.04,.98,.10,.42,.63,.49)
 for n in range(3):box('snow',side*(1.06+n*.012),1.03-n*.14,.34,.43,.12,.16)
 box('ice',side*1.07,.62,.13,.46,.31,.55)
 for n in range(3):box('bone',side*1.07+(n-1)*.13,.50,.434,.078,.16,.12)
 motion(label,(-1.40,side*.12,-side*.30),(-.30,-side*.14,side*.15))
for side,label in [(1,'left-leg'),(-1,'right-leg')]:
 part(label,(side*.32,.91,0),'body');box('snowshade',side*.32,.57,0,.49,.73,.52);box('ice',side*.32,.16,.18,.56,.32,.77)
 for n in range(3):box('bone',side*.32+(n-1)*.17,.13,.598,.09,.15,.13)
 motion(label,(-.15,0,0),(.12,0,0))
motion('body',(-.20,0,0),(.32,0,0),(0,.05,-.10),(0,-.14,.10));motion('head',(-.12,0,0),(.20,0,0))

# Crystal bat: tapered indigo wings, icy fingers and a small sharp-eyed body.
monster('crystal-bat');part('body',(0,.70,0))
box('purple',0,.72,0,.46,.63,.40);box('violet',0,.68,.215,.29,.37,.055)
part('head',(0,1.00,.05),'body');box('deepblue',0,1.07,.08,.54,.44,.44);eyes(0,1.10,.317,.145,'rose',.075)
for side in [-1,1]:
 spike('crystal',side*.20,1.24,.0,.18,.36,.17,side*.07,-.015)
 box('bone',side*.09,.929,.328,.055,.13,.052)
for side,label in [(1,'left-wing'),(-1,'right-wing')]:
 part(label,(side*.22,.89,-.03),'body')
 for n in range(5):
  x=side*(.40+n*.22);h=.68-n*.094
  box('purple' if n%2 else 'blue',x,.82+n*.054,-.07,.218,h,.085)
  box('crystal',x,1.14+n*.018,-.04,.255,.065,.13)
  box('violet',x,.69+n*.035,.002,.036,h*.60,.035)
 spike('glow',side*1.33,1.20,-.04,.12,.22,.13,side*.12,0,3)
 motion(label,(.20,-side*.25,-side*.70),(-.15,side*.30,side*.63))
for side,label in [(1,'left-leg'),(-1,'right-leg')]:
 part(label,(side*.14,.43,0),'body');box('deepblue',side*.14,.27,.015,.13,.31,.14);box('crystal',side*.14,.095,.08,.18,.15,.23)
part('tail',(0,.48,-.19),'body');box('deepblue',0,.31,-.23,.10,.39,.12);box('violet',0,.12,-.26,.23,.20,.085)
motion('body',(-.28,0,0),(.38,0,0),(0,.12,-.18),(0,-.10,.23));motion('head',(-.20,0,0),(.27,0,0))

# Marsh toad: wide squatting haunches, protruding eyes, throat sac and hinged mouth.
monster('marsh-toad');part('body',(0,.40,-.10))
box('toadshade',0,.40,-.18,1.07,.59,.94);box('toad',0,.66,-.22,.93,.29,.84)
for x,z in [(-.27,-.36),(.25,-.43),(.10,-.06),(-.30,-.04)]:box('mosslight',x,.829,z,.16,.10,.16)
part('head',(0,.51,.35),'body');box('toad',0,.57,.49,1.05,.35,.66)
for side in [-1,1]:
 box('toad',side*.34,.795,.51,.29,.35,.33);box('ink',side*.34,.852,.691,.19,.20,.04);box('eye',side*.34,.852,.72,.12,.14,.03);box('ink',side*.34,.855,.739,.039,.13,.013)
box('mouth',0,.46,.847,.86,.09,.04)
part('jaw',(0,.44,.28),'head');box('mosslight',0,.357,.52,1.04,.21,.65);box('sandlight',0,.24,.68,.66,.23,.35)
for side,label in [(1,'left-arm'),(-1,'right-arm')]:
 part(label,(side*.46,.40,.35),'body');box('toadshade',side*.53,.23,.52,.23,.32,.28)
 for n in range(3):box('mosslight',side*.53+(n-1)*.12,.07,.74,.085,.13,.35)
 motion(label,(-.22,0,0),(.25,0,0))
for side,label in [(1,'left-leg'),(-1,'right-leg')]:
 part(label,(side*.49,.40,-.31),'body');box('toad',side*.63,.36,-.37,.54,.47,.61)
 box('toadshade',side*.76,.11,-.15,.31,.20,.65)
 for n in range(3):box('mosslight',side*.75+(n-1)*.12,.065,.19,.075,.12,.30)
 motion(label,(.30,0,0),(-.24,0,0))
motion('body',(-.18,0,0),(.11,0,0),(0,-.045,-.09),(0,.13,.09));motion('head',(-.23,0,0),(.18,0,0));motion('jaw',(.46,0,0),(.63,0,0))

# Void stalker: very tall angular silhouette, swept horn crown and long hooked claws.
monster('void-stalker');part('body',(0,1.16,0))
box('void',0,1.22,0,.64,.94,.47);box('voidlight',0,1.61,-.03,.91,.38,.58)
box('purple',0,1.41,.261,.30,.56,.05)
for n in range(3):box('rose',0,1.27+n*.15,.298,.14-n*.015,.065,.033)
part('head',(0,1.93,.02),'body');box('voidlight',0,2.06,.045,.54,.50,.51)
box('void',0,2.125,.322,.60,.19,.045);eyes(0,2.13,.355,.157,'rose',.095)
box('ink',0,1.92,.315,.25,.06,.025)
for side in [-1,1]:spike('purple',side*.22,2.28,-.04,.20,.43,.22,side*.23,-.20)
for side,label in [(1,'left-arm'),(-1,'right-arm')]:
 part(label,(side*.56,1.73,0),'body');box('void',side*.66,1.29,.03,.26,.85,.30)
 box('purple',side*.72,.85,.10,.30,.26,.33)
 for n in range(3):box('violet',side*.72+(n-1)*.10,.625,.21,.064,.36,.065,rx=-.22)
 spike('voidlight',side*.58,1.82,-.04,.24,.27,.23,side*.15,-.08)
 motion(label,(-.93,side*.72,-side*.32),(.55,-side*.53,side*.13))
for side,label in [(1,'left-leg'),(-1,'right-leg')]:
 part(label,(side*.22,.78,0),'body');box('void',side*.22,.44,.0,.26,.64,.31);box('purple',side*.22,.13,.14,.33,.26,.53)
 motion(label,(-.12,0,0),(.13,0,0))
part('tail',(0,1.13,-.29),'body');box('voidlight',0,.92,-.58,.18,.25,.67,rx=-.50);box('purple',0,.59,-.93,.16,.21,.35)
motion('body',(-.12,-.22,0),(.23,.28,0),(0,.015,-.15),(0,-.035,.24));motion('head',(0,.20,0),(.19,-.18,0));motion('tail',(0,-.45,0),(0,.33,0))

# Stormhorn behemoth: 6.5m thunder beast; plated humped back and immense crystal horns.
monster('stormhorn-behemoth');part('body',(0,2.92,-.20))
box('deepblue',0,2.94,-.33,2.79,2.45,2.93);box('blue',0,3.64,-.49,2.60,1.45,2.63)
box('voidlight',0,2.67,.62,2.91,1.57,1.49)
for side in [-1,1]:
 for n in range(4):
  box('ice',side*1.19,3.44-n*.35,-.63+n*.13,.42,.31,1.90-.12*n)
  box('crystal',side*1.419,3.45-n*.35,-.11,.055,.14,.92)
for n in range(4):spike('crystal' if n%2 else 'ice',0,4.20,-1.26+n*.55,.73,1.11 if n<2 else .74,.52,0,-.22)
part('head',(0,3.70,1.04),'body')
box('blue',0,3.99,1.31,1.84,1.39,1.45);box('ice',0,3.70,1.97,1.58,.67,.75)
box('void',0,3.70,2.372,1.04,.29,.15);box('snowshade',0,4.60,1.46,1.61,.28,1.25)
for side in [-1,1]:
 box('deepblue',side*.72,4.23,2.011,.47,.28,.10)
 box('glow',side*.72,4.23,2.08,.28,.13,.066)
 # Wide low horn bases taper inward; final top is exactly6.50m.
 spike('ice',side*.86,4.46,1.30,.61,.64,.65,side*.45,-.20)
 spike('crystal',side*1.25,5.04,1.10,.47,.84,.46,side*.20,-.36)
 spike('glow',side*1.42,5.83,.78,.30,.652,.30,-side*.07,-.20)
 box('gold',side*.88,4.69,1.325,.63,.15,.68)
part('jaw',(0,3.57,1.37),'head');box('deepblue',0,3.316,1.90,1.44,.38,.93)
for side in [-1,1]:
 box('bone',side*.51,3.55,2.225,.23,.42,.22)
 box('bone',side*.33,3.41,2.375,.16,.29,.17)
for n,(side,z) in enumerate([(1,.71),(-1,.71),(1,-1.14),(-1,-1.14)]):
 part('leg-'+str(n),(side*.99,2.20,z),'body')
 box('blue',side*1.11,1.52,z,.89,1.51,1.01)
 box('ice',side*1.11,.63,z+.03,.76,.72,.92)
 box('voidlight',side*1.11,.23,z+.17,1.01,.46,1.27)
 for toe in range(3):box('bone',side*1.11+(toe-1)*.28,.195,z+.87,.18,.32,.24)
 motion(current,(-.36 if n<2 else .12,0,0),(.35 if n<2 else -.12,0,0))
part('tail',(0,3.02,-1.70),'body');box('deepblue',0,2.94,-2.04,.63,.68,.77,rx=.24);box('ice',0,2.88,-2.44,.47,.50,.38)
motion('body',(-.22,0,0),(.25,0,0),(0,.15,-.18),(0,-.34,.28));motion('head',(-.33,0,0),(.38,0,0));motion('jaw',(.35,0,0),(.10,0,0));motion('tail',(-.32,0,0),(.35,0,0))

# Thunder-carved plates, layered brow, horn facets and a spiked counterweight tail.
current='body'
for side in [-1,1]:
 for n in range(5):
  z=-1.32+n*.51
  box('deepblue',side*.86,4.22,z,.70,.25,.43,rz=side*.15)
  box('ice',side*.88,4.36,z,.60,.13,.34,rz=side*.15)
  box('glow',side*1.445,2.57+n*.23,-.52+n*.18,.04,.10,.27)
 for n in range(3):spike('blue',side*1.21,3.86,-.91+n*.62,.35,.53,.33,side*.24,-.15)
current='head'
for side in [-1,1]:
 for n in range(3):
  box('snowshade',side*(.66+n*.10),4.44-n*.12,2.065-n*.055,.29,.12,.16,rz=-side*.15)
  box('crystal',side*.92,3.85-n*.18,1.73,.11,.13,.38)
  box('deepblue',side*(1.16+n*.12),5.04+n*.40,.98-n*.12,.17,.11,.31)
 box('glow',side*.41,3.79,2.459,.10,.07,.04)
for n in range(3):box('crystal',0,4.35-n*.18,2.064,.16,.11,.08)
for n in range(4):
 current='leg-'+str(n);side=1 if n%2==0 else -1;z=.71 if n<2 else -1.14
 for band in range(3):box('stoneshade',side*1.11,.88+band*.25,z+.51,.78,.13,.16)
 box('crystal',side*1.11,1.36,z+.61,.15,.39,.06)
current='tail'
for side in [-1,1]:spike('crystal',side*.20,2.94,-2.44,.21,.55,.23,side*.29,-.10)

# Briarhorn Elder: a low, broad forest boar with branching antlers, leaf armour,
# curling tusks and mushrooms growing between moss-covered bark plates.
monster('briarhorn-elder');part('body',(0,1.67,-.18))
box('barkdark',0,1.64,-.21,1.95,1.52,2.54);box('bark',0,2.09,-.36,1.88,1.02,2.24)
for side in [-1,1]:
 for n in range(5):
  z=-1.26+n*.45
  box('barklight',side*.88,2.03,z,.30,.75,.35,rz=side*.13)
  box('leafdark',side*.71,2.57,z,.69,.22,.50,rz=side*.19)
  box('leaf',side*.75,2.69,z-.04,.54,.11,.35,rz=side*.19)
  box('mosslight',side*.55,2.76,z+.03,.22,.08,.16)
 for n in range(4):box('leaf',side*1.04,1.70+n*.16,-.83+n*.41,.19,.25,.34,rz=side*.19)
 for n in range(3):
  x=side*(.39+n*.13);z=-.94+n*.60;y=2.77+(n%2)*.05
  box('cream',x,y+.09,z,.075,.22,.07);box('clay',x,y+.21,z,.29,.11,.25)
  box('sandlight',x-.055,y+.273,z+.02,.06,.014,.07)
part('head',(0,2.08,1.01),'body')
box('bark',0,2.24,1.35,1.56,1.03,1.17);box('barklight',0,1.94,1.98,1.21,.54,.52)
box('sand',0,1.96,2.276,1.08,.35,.12);box('barkdark',0,2.32,1.999,1.21,.19,.13)
eyes(0,2.43,2.074,.44,'gold',.145)
for side in [-1,1]:
 box('barkdark',side*.28,1.99,2.353,.18,.13,.05)
 box('leafdark',side*.79,2.66,1.41,.36,.37,.43,rz=side*.48)
 box('leaflight',side*.86,2.77,1.42,.20,.13,.28,rz=side*.48)
 # Tusks curl outwards, then upwards and back towards the face.
 for x,y,z,w,h,d in [(side*.70,1.76,2.08,.28,.25,.36),(side*.88,1.82,2.27,.24,.30,.26),(side*.99,2.07,2.33,.20,.35,.21),(side*.98,2.35,2.29,.15,.28,.15),(side*.91,2.54,2.23,.10,.17,.11)]:box('bone',x,y,z,w,h,d)
 spike('bark',side*.51,2.64,1.23,.29,1.24,.28,side*.42,-.23,5)
 for n in range(3):
  x=side*(.67+n*.16);y=3.03+n*.26;z=1.18-n*.06
  spike('barklight',x,y,z,.16,.43,.16,side*.28,-.12,3)
  box('leaflight',x+side*.28,y+.34,z-.12,.33,.11,.23,rz=side*.35)
 for n in range(3):box('leaf',side*(.27+n*.19),2.80-n*.045,1.80,.29,.13,.30,rz=-side*.18)
part('jaw',(0,1.89,1.33),'head');box('barkdark',0,1.65,1.92,1.13,.26,.73)
for n in range(5):box('leafdark',(n-2)*.19,1.37-abs(n-2)*.04,1.71,.16,.42,.19)
four_legs('bark',.72,1.13,.76,-1.00,.50,foot='barkdark')
for n in range(4):
 current='leg-'+str(n);side=1 if n%2==0 else -1;z=.76 if n<2 else -1.00
 box('moss',side*.72,.76,z+.30,.49,.27,.11)
 for toe in [-1,1]:box('bone',side*.72+toe*.15,.12,z+.49,.20,.20,.22)
part('tail',(0,1.97,-1.50),'body');box('bark',0,1.94,-1.83,.24,.25,.57,rx=.28)
for side in [-1,1]:box('leaf',side*.13,1.98,-2.04,.35,.14,.38,ry=side*.45)
motion('body',(-.26,0,0),(.27,0,0),(0,.17,-.38),(0,-.18,.55));motion('head',(-.54,0,0),(.36,0,0));motion('jaw',(.26,0,0),(.06,0,0));motion('tail',(-.28,0,0),(.43,0,0))

# Rimefang Matriarch: a towering white pelt, broad crystal shoulder fans, a
# snarling mask, hanging icicle beard and separate heavy knuckle silhouettes.
monster('rimefang-matriarch');part('body',(0,2.64,0))
box('snowshade',0,2.57,0,1.94,1.91,1.18);box('snow',0,3.36,.03,2.34,1.29,1.40)
box('ice',0,2.91,.72,.89,1.12,.15)
for side in [-1,1]:
 for n in range(5):box('snow',side*(.33+n*.13),3.26-n*.27,.71,.36,.45,.29,rz=side*.14)
 for n in range(4):box('snowshade',side*(.59+n*.11),3.81-n*.20,-.65,.37,.39,.29,rz=side*.18)
 for n in range(3):box('glow',side*.19,2.63+n*.22,.815,.12,.12,.045)
part('head',(0,4.03,.09),'body');box('snow',0,4.35,.17,1.43,1.04,1.12)
box('ice',0,4.25,.773,1.03,.61,.16);box('deepblue',0,4.06,.89,.65,.18,.06)
eyes(0,4.42,.882,.29,'glow',.12)
for side in [-1,1]:
 box('snowshade',side*.33,4.58,.86,.58,.14,.21,rz=-side*.18)
 box('bone',side*.27,3.93,.92,.15,.42,.14)
 for n in range(3):spike('crystal',side*(.33+n*.19),4.76,.18-n*.12,.25,.71-n*.10,.26,side*.13,-.16)
 spike('glow',side*.17,4.82,.25,.18,.80,.21,side*.06,-.12)
 for n in range(3):box('snow',side*(.62+n*.05),4.30-n*.20,.47,.26,.26,.43)
part('jaw',(0,4.04,.27),'head');box('snowshade',0,3.87,.63,.80,.25,.59)
for n in range(5):box('crystal',(n-2)*.14,3.62+abs(n-2)*.075,.72,.12,.39-abs(n-2)*.055,.16)
for side,label in [(1,'left-arm'),(-1,'right-arm')]:
 part(label,(side*1.26,3.72,0),'body')
 box('snow',side*1.49,3.10,.02,.79,1.43,.89);box('snowshade',side*1.68,2.06,.09,.67,1.12,.77)
 box('ice',side*1.76,1.30,.24,.88,.66,.99)
 for n in range(4):
  spike('ice' if n%2 else 'crystal',side*(1.17+n*.23),3.65,.03,.30,.79-(n%2)*.19,.48,side*.33,-.25)
  box('snow',side*(1.60+n*.02),2.61-n*.24,.54,.63,.23,.28)
  box('bone',side*1.76+(n-1.5)*.20,1.03,.80,.13,.28,.23)
  box('snowshade',side*1.76+(n-1.5)*.20,1.56,.775,.16,.18,.16)
 motion(label,(-2.08,side*.27,-side*.28),(-.46,-side*.12,side*.09))
for side,label in [(1,'left-leg'),(-1,'right-leg')]:
 part(label,(side*.57,1.83,0),'body');box('snowshade',side*.57,1.08,0,.76,1.49,.80)
 box('ice',side*.57,.30,.24,.91,.60,1.24)
 for n in range(3):
  box('snow',side*.57,.85+n*.25,.42,.74,.19,.22)
  box('bone',side*.57+(n-1)*.27,.18,.93,.18,.28,.23)
 motion(label,(-.18,0,0),(.16,0,0))
motion('body',(-.28,0,0),(.44,0,0),(0,.20,-.18),(0,-.30,.27));motion('head',(-.18,0,0),(.22,0,0));motion('jaw',(.37,0,0),(.10,0,0))

# Ashen Crown Titan: a hollow, rune-bound basalt giant with floating crown
# battlements, exposed magma joints and asymmetrical vented hammer gauntlets.
monster('ashen-crown-titan');part('body',(0,3.12,0))
box('scorch',0,3.01,0,2.38,2.07,1.45);box('void',0,3.94,-.04,2.96,1.19,1.60)
for side in [-1,1]:
 for n in range(4):
  box('stone' if n%2 else 'scorch',side*.86,2.47+n*.47,.77,.85,.37,.30,rz=side*.09)
  box('ember',side*.86,2.69+n*.47,.84,.71,.08,.09)
 for n in range(3):
  box('scorch',side*.94,4.49,-.49+n*.47,.73,.22,.37)
  spike('scorch',side*1.09,4.47,-.27+n*.23,.25,.48,.28,side*.15,-.13)
 box('ember',side*1.24,3.09,-.20,.08,1.19,.25)
 box('fire',side*1.29,3.25,-.20,.05,.52,.12)
part('core',(0,3.50,.81),'body');box('ink',0,3.49,.83,.74,1.11,.15)
box('ember',0,3.49,.935,.49,.81,.11);box('fire',0,3.49,1.00,.23,.49,.06)
for side in [-1,1]:
 box('gold',side*.31,3.77,.99,.17,.10,.07,rz=side*.40);box('gold',side*.31,3.22,.99,.17,.10,.07,rz=-side*.40)
part('head',(0,4.73,.06),'body');box('scorch',0,5.12,.10,1.29,1.04,1.07)
box('stone',0,5.64,.05,1.45,.20,1.21);box('void',0,5.10,.69,1.08,.22,.13)
eyes(0,5.12,.783,.30,'fire',.13);box('ember',0,4.86,.71,.53,.08,.08)
for side in [-1,1]:
 box('stone',side*.58,4.94,.44,.31,.68,.55)
 for n in range(3):box('ember',side*.40,5.41+n*.10,.66,.07,.07,.05)
 for n in range(3):
  z=-.39+n*.44;h=.92 if n==1 else .68
  box('gold',side*.68,5.91,z,.29,.23,.32)
  spike('scorch',side*.70,5.98,z,.28,h,.31,side*.13,-.10,4)
  box('ember',side*.70,6.15,z+.17,.11,.39,.07)
box('gold',0,5.90,.63,1.22,.18,.19)
spike('scorch',0,6.00,.64,.28,1.10,.29,0,.08,5);spike('fire',0,6.35,.81,.12,.48,.10,0,.03,3)
for side,label in [(1,'left-arm'),(-1,'right-arm')]:
 part(label,(side*1.62,4.18,0),'body');box('scorch',side*1.83,3.97,.02,.92,.89,1.11)
 box('stone',side*1.88,4.48,-.02,1.04,.23,1.14)
 box('ember',side*1.97,3.41,.02,.47,.39,.59);box('scorch',side*2.03,2.76,.05,.76,1.04,.88)
 width=1.18 if side==1 else .99
 box('void',side*2.09,1.99,.17,width,.81,1.19)
 for n in range(4):
  box('stone',side*2.09+(n-1.5)*.24,1.93,.81,.18,.56,.22)
  box('ember',side*2.09+(n-1.5)*.24,2.27,.925,.11,.10,.07)
 for n in range(3):
  box('ink',side*2.07,2.64+n*.24,.52,.55,.15,.10)
  box('fire',side*2.07,2.64+n*.24,.58,.36,.07,.04)
  spike('scorch',side*(1.61+n*.21),4.59,-.22,.26,.48+n*.10,.29,side*.16,-.15)
 motion(label,(-2.28,side*.22,-side*.17),(-.44,-side*.09,side*.12))
for side,label in [(1,'left-leg'),(-1,'right-leg')]:
 part(label,(side*.68,2.09,0),'body');box('scorch',side*.68,1.51,0,.87,1.13,1.00)
 box('ember',side*.68,.86,.03,.69,.23,.71);box('stone',side*.68,.44,.15,.91,.68,1.14)
 box('void',side*.68,.17,.33,1.07,.34,1.57)
 for n in range(3):box('ember',side*.68+(n-1)*.27,.18,1.142,.09,.19,.04)
 box('gold',side*.68,1.56,.54,.16,.56,.06)
 motion(label,(-.11,0,-side*.05),(.11,0,side*.05))
motion('body',(-.23,0,0),(.46,0,0),(0,.19,-.18),(0,-.34,.30));motion('head',(-.16,0,0),(.27,0,0));motion('core',(-.14,0,0),(.22,0,0),(0,0,0),(0,0,.06))

# Dungeon attacks retain the same pivots and geometry, but exaggerate the silhouette
# through a readable anticipation, exact contact, weighty follow-through and recovery.
dungeon_attacks={
 'grove-spider':{'body':((-.34,0,0),(.40,0,0),(0,.16,-.16),(0,-.10,.30)),
   'head':((-.30,0,0),(.32,0,0),(0,0,0),(0,0,.04))},
 'ember-beetle':{'body':((-.23,0,0),(.31,0,0),(0,.08,-.17),(0,-.04,.34)),
   'head':((-.36,0,0),(.30,0,0),(0,0,0),(0,0,.06)),
   'left-arm':((0,.90,0),(0,-.72,0),(0,0,0),(0,0,0)),
   'right-arm':((0,-.90,0),(0,.72,0),(0,0,0),(0,0,0))},
 'dune-scorpion':{'body':((-.06,0,0),(.16,0,0),(0,.02,-.08),(0,-.05,.17)),
   'tail':((-.75,-.12,0),(1.24,.08,0),(0,0,0),(0,0,0)),
   'stinger':((-.62,0,0),(.52,0,0),(0,0,0),(0,0,.06)),
   'left-arm':((-.22,.65,-.10),(.10,-.23,.06),(0,0,0),(0,0,.10)),
   'right-arm':((-.22,-.65,.10),(.10,.23,-.06),(0,0,0),(0,0,.10))},
 'stone-golem':{'body':((-.26,0,0),(.50,0,0),(0,.12,-.14),(0,-.19,.23)),
   'head':((-.18,0,0),(.23,0,0),(0,0,0),(0,0,0)),
   'left-arm':((-2.28,.14,-.20),(-.48,-.10,.16),(0,0,0),(0,0,.05)),
   'right-arm':((-2.38,-.14,.20),(-.42,.10,-.16),(0,0,0),(0,0,.07))},
 'frost-yeti':{'body':((-.14,-.38,0),(.25,.44,0),(0,.06,-.12),(0,-.10,.23)),
   'head':((-.13,.24,0),(.12,-.27,0),(0,0,0),(0,0,0)),
   'left-arm':((-1.94,.58,-.45),(-.70,-.83,-.08),(0,0,0),(0,0,.09)),
   'right-arm':((-.43,-.32,.32),(-1.05,.54,.12),(0,0,0),(0,0,.05))},
 'crystal-bat':{'body':((-.42,0,0),(.64,0,0),(0,.31,-.25),(0,.12,.48)),
   'head':((-.31,0,0),(.31,0,0),(0,0,0),(0,0,.06)),
   'left-wing':((.22,-.35,.92),(-.20,.58,-.76),(0,0,0),(0,0,0)),
   'right-wing':((.22,.35,-.92),(-.20,-.58,.76),(0,0,0),(0,0,0))},
 'void-stalker':{'body':((-.15,-.50,0),(.27,.56,0),(0,.03,-.18),(0,-.08,.35)),
   'head':((-.06,.34,0),(.20,-.30,0),(0,0,0),(0,0,0)),
   'left-arm':((-.75,.78,-.35),(.15,-.61,.24),(0,0,0),(0,0,.02)),
   'right-arm':((-1.72,-.62,.45),(-.40,.85,-.20),(0,0,0),(0,0,.10)),
   'tail':((0,-.70,0),(0,.63,0),(0,0,0),(0,0,0))},
}
for name,poses in dungeon_attacks.items():motions[name].update(poses)
for n in range(8):
 side=1 if n%2==0 else -1
 motions['grove-spider']['leg-'+str(n)]=((-.27 if n<2 else 0,0,side*(.60 if n<4 else -.10)),(.18 if n<2 else 0,0,-side*(.20 if n<4 else .04)),(0,0,0),(0,0,0))
for n in range(6):
 side=1 if n%2==0 else -1
 motions['ember-beetle']['leg-'+str(n)]=((0,side*.08,side*.23),(.12 if n<2 else -.05,0,-side*.18),(0,0,0),(0,0,0))
extra_clips={
 'frost-yeti':{'cast':{
   'body':((-.16,0,0),(.18,0,0),(0,.05,-.06),(0,0,.15)),
   'head':((.12,0,0),(-.13,0,0),(0,0,0),(0,0,0)),
   'left-arm':((-1.10,.58,-.44),(-1.64,-.24,-.05),(0,0,0),(0,0,.10)),
   'right-arm':((-1.10,-.58,.44),(-1.64,.24,.05),(0,0,0),(0,0,.10)),
   'left-leg':((-.10,0,-.06),(.10,0,.04),(0,0,0),(0,0,0)),
   'right-leg':((-.10,0,.06),(.10,0,-.04),(0,0,0),(0,0,0))}},
 'void-stalker':{'leap':{
   'body':((-.23,0,0),(.38,0,0),(0,-.22,-.10),(0,-.12,.53)),
   'head':((-.12,0,0),(.18,0,0),(0,0,0),(0,0,0)),
   'left-arm':((.55,.28,-.35),(-.84,-.70,-.27),(0,0,0),(0,0,.09)),
   'right-arm':((.55,-.28,.35),(-.84,.70,.27),(0,0,0),(0,0,.09)),
   'left-leg':((.46,0,-.16),(.20,0,-.12),(0,0,0),(0,0,0)),
   'right-leg':((.46,0,.16),(.20,0,.12),(0,0,0),(0,0,0)),
   'tail':((-.48,0,0),(.55,0,0),(0,0,0),(0,0,0))}},
}
extra_clips.update({
 'briarhorn-elder':{
  'swipe':{'body':((-.11,-.40,0),(.14,.49,0),(0,.07,-.16),(0,-.09,.31)),
   'head':((-.26,.58,0),(.22,-.71,0),(0,0,0),(0,0,.12)),
   'jaw':((.29,0,0),(.06,0,0),(0,0,0),(0,0,0)),
   'leg-0':((-.49,-.19,-.17),(.22,.20,.13),(0,0,0),(0,0,0)),
   'tail':((0,-.65,0),(0,.73,0),(0,0,0),(0,0,0))},
  'cast':{'body':((-.18,0,0),(.14,0,0),(0,.11,-.09),(0,.14,.13)),
   'head':((-.47,0,0),(-.69,0,0),(0,0,0),(0,.06,0)),
   'jaw':((.11,0,0),(.65,0,0),(0,0,0),(0,0,0)),
   'leg-0':((-.26,0,-.08),(.31,0,.12),(0,0,0),(0,0,0)),
   'leg-1':((-.26,0,.08),(.31,0,-.12),(0,0,0),(0,0,0)),
   'tail':((-.18,0,0),(-.57,0,0),(0,0,0),(0,0,0))}},
 'rimefang-matriarch':{
  'swipe':{'body':((-.13,-.42,0),(.24,.49,0),(0,.08,-.16),(0,-.14,.32)),
   'head':((-.16,.31,0),(.19,-.29,0),(0,0,0),(0,0,0)),
   'left-arm':((-1.71,.71,-.47),(-.75,-.96,-.09),(0,0,0),(0,0,.19)),
   'right-arm':((-.31,-.26,.19),(-.98,.45,.11),(0,0,0),(0,0,.11)),
   'jaw':((.30,0,0),(.13,0,0),(0,0,0),(0,0,0))},
  'cast':{'body':((-.18,0,0),(.21,0,0),(0,.14,-.14),(0,.02,.25)),
   'head':((.17,0,0),(-.26,0,0),(0,0,0),(0,0,0)),
   'jaw':((.10,0,0),(.58,0,0),(0,0,0),(0,0,0)),
   'left-arm':((-1.11,.66,-.43),(-1.75,-.32,-.13),(0,0,0),(0,0,.14)),
   'right-arm':((-1.11,-.66,.43),(-1.75,.32,.13),(0,0,0),(0,0,.14))}},
 'stormhorn-behemoth':{
  'swipe':{'body':((-.09,-.37,0),(.16,.45,0),(0,.12,-.17),(0,-.15,.31)),
   'head':((-.24,.29,0),(.26,-.44,0),(0,0,0),(0,0,.10)),
   'leg-0':((-1.03,-.55,-.41),(.34,.72,.39),(0,0,0),(0,0,.14)),
   'leg-1':((.13,0,0),(-.16,0,0),(0,0,0),(0,0,0)),
   'jaw':((.32,0,0),(.09,0,0),(0,0,0),(0,0,0)),
   'tail':((0,-.69,0),(0,.82,0),(0,0,0),(0,0,0))},
  'cast':{'body':((-.17,0,0),(.12,0,0),(0,.18,-.12),(0,.12,.17)),
   'head':((-.25,0,0),(-.62,0,0),(0,0,0),(0,.08,0)),
   'jaw':((.14,0,0),(.71,0,0),(0,0,0),(0,0,0)),
   'leg-0':((-.25,0,-.09),(.22,0,.11),(0,0,0),(0,0,0)),
   'leg-1':((-.25,0,.09),(.22,0,-.11),(0,0,0),(0,0,0)),
   'tail':((-.24,0,0),(-.56,0,0),(0,0,0),(0,0,0))}},
 'ashen-crown-titan':{
  'swipe':{'body':((-.09,.42,0),(.19,-.54,0),(0,.11,-.16),(0,-.19,.27)),
   'head':((-.14,-.29,0),(.19,.35,0),(0,0,0),(0,0,0)),
   'right-arm':((-1.62,-.82,.43),(-.92,.87,-.19),(0,0,0),(0,0,.16)),
   'left-arm':((-.32,.29,-.22),(-.51,-.31,.15),(0,0,0),(0,0,.07)),
   'core':((0,-.15,0),(0,.18,0),(0,0,0),(0,0,.04))},
  'cast':{'body':((-.21,0,0),(.16,0,0),(0,.13,-.09),(0,.05,.19)),
   'head':((.21,0,0),(-.27,0,0),(0,0,0),(0,0,0)),
   'left-arm':((-.92,.71,-.58),(-1.51,-.38,-.26),(0,0,0),(0,0,.15)),
   'right-arm':((-.92,-.71,.58),(-1.51,.38,.26),(0,0,0),(0,0,.15)),
   'core':((-.10,0,0),(-.24,0,0),(0,0,-.03),(0,.08,.23))}},
})
# Charges crouch, brace through the rush, then absorb contact and recover.
# Local X/Z never travel: the server moves the world root along the charge lane.
charge_poses={
 'bramble-wolf':{'body':((-.11,0,0),(.24,0,0),(0,-.12,0),(0,-.045,0)),
  'head':((.22,0,0),(-.20,0,0),(0,0,0),(0,0,0)),
  'jaw':((.20,0,0),(.08,0,0),(0,0,0),(0,0,0)),
  'tail':((-.24,0,0),(.37,0,0),(0,0,0),(0,0,0))},
 'briar-boar':{'body':((-.10,0,0),(.20,0,0),(0,-.08,0),(0,-.035,0)),
  'head':((.33,0,0),(-.28,0,0),(0,0,0),(0,0,0)),
  'tail':((-.17,0,0),(.42,0,0),(0,0,0),(0,0,0))},
 'dune-scorpion':{'body':((-.12,0,0),(.14,0,0),(0,-.06,0),(0,-.02,0)),
  'head':((.10,0,0),(-.15,0,0),(0,0,0),(0,0,0)),
  'left-arm':((.10,.40,-.10),(-.19,-.18,.05),(0,0,0),(0,0,0)),
  'right-arm':((.10,-.40,.10),(-.19,.18,-.05),(0,0,0),(0,0,0)),
  'tail':((-.36,0,0),(.28,0,0),(0,0,0),(0,0,0)),
  'stinger':((-.24,0,0),(.20,0,0),(0,0,0),(0,0,0))},
 'stone-golem':{'body':((-.18,.14,0),(.31,-.11,0),(0,-.13,0),(0,-.06,0)),
  'head':((.18,-.09,0),(-.21,.08,0),(0,0,0),(0,0,0)),
  'left-arm':((.34,.10,-.23),(-.86,-.16,-.12),(0,0,0),(0,0,0)),
  'right-arm':((.44,-.10,.19),(.31,.08,.11),(0,0,0),(0,0,0))},
 'frost-yeti':{'body':((-.20,-.17,0),(.35,.16,0),(0,-.18,0),(0,-.07,0)),
  'head':((.22,.12,0),(-.26,-.11,0),(0,0,0),(0,0,0)),
  'left-arm':((.53,.13,-.19),(-.62,-.17,-.18),(0,0,0),(0,0,0)),
  'right-arm':((.44,-.13,.19),(-.84,.13,.19),(0,0,0),(0,0,0))},
 'void-stalker':{'body':((-.20,-.17,0),(.46,.18,0),(0,-.17,0),(0,-.06,0)),
  'head':((.21,.13,0),(-.31,-.12,0),(0,0,0),(0,0,0)),
  'left-arm':((.63,.19,-.21),(-1.00,-.30,-.19),(0,0,0),(0,0,0)),
  'right-arm':((.53,-.19,.21),(-.67,.29,.20),(0,0,0),(0,0,0)),
  'tail':((-.23,0,0),(.43,0,0),(0,0,0),(0,0,0))},
 'briarhorn-elder':{'body':((-.13,0,0),(.27,0,0),(0,-.19,0),(0,-.09,0)),
  'head':((.38,0,0),(-.33,0,0),(0,0,0),(0,0,0)),
  'jaw':((.26,0,0),(.09,0,0),(0,0,0),(0,0,0)),
  'tail':((-.23,0,0),(.47,0,0),(0,0,0),(0,0,0))},
 'rimefang-matriarch':{'body':((-.23,-.15,0),(.39,.18,0),(0,-.31,0),(0,-.12,0)),
  'head':((.22,.12,0),(-.29,-.11,0),(0,0,0),(0,0,0)),
  'jaw':((.23,0,0),(.08,0,0),(0,0,0),(0,0,0)),
  'left-arm':((.52,.19,-.23),(-.66,-.21,-.19),(0,0,0),(0,0,0)),
  'right-arm':((.43,-.17,.24),(-.96,.17,.22),(0,0,0),(0,0,0))},
 'stormhorn-behemoth':{'body':((-.14,0,0),(.28,0,0),(0,-.32,0),(0,-.11,0)),
  'head':((.41,0,0),(-.34,0,0),(0,0,0),(0,0,0)),
  'jaw':((.28,0,0),(.10,0,0),(0,0,0),(0,0,0)),
  'tail':((-.27,0,0),(.49,0,0),(0,0,0),(0,0,0))},
 'ashen-crown-titan':{'body':((-.19,.19,0),(.34,-.19,0),(0,-.31,0),(0,-.10,0)),
  'head':((.20,-.13,0),(-.25,.12,0),(0,0,0),(0,0,0)),
  'left-arm':((.42,.15,-.27),(-1.08,-.19,-.19),(0,0,0),(0,0,0)),
  'right-arm':((.51,-.15,.22),(.31,.12,.17),(0,0,0),(0,0,0)),
  'core':((.08,0,0),(-.12,0,0),(0,0,0),(0,0,.06))},
}
for name,poses in charge_poses.items():
 for label in parts[name]:
  if 'leg' not in label:continue
  if label.startswith('leg-'):
   index=int(label[-1]);side=1 if index%2==0 else -1
   poses[label]=((-.25 if index<2 else .29,0,-side*.08),(.46 if index%2==0 else -.37,0,side*.04),(0,0,0),(0,0,0))
  else:
   side=1 if label=='left-leg' else -1
   poses[label]=((.21,0,-side*.12),(-side*.51,0,-side*.08),(0,0,0),(0,0,0))
 extra_clips.setdefault(name,{})['charge']=poses
leap_air={
 'body':((.08,0,0),(0,.85,.22)), 'head':((-.10,0,0),(0,0,0)),
 'left-arm':((-1.68,.34,-.43),(0,0,0)), 'right-arm':((-1.68,-.34,.43),(0,0,0)),
 'left-leg':((.70,0,-.18),(0,0,0)), 'right-leg':((-.48,0,.18),(0,0,0)), 'tail':((-.61,0,0),(0,0,0)),
}

# Build the editable rigid hierarchy, with true local pivot transforms.
library=bpy.context.scene; library.name='Monster library - attack clips'
library.unit_settings.system='METRIC'; library.unit_settings.scale_length=1
library.render.fps=30; library.frame_start=0; library.frame_end=30
material=bpy.data.materials.new('Mossvale monster vertex palette');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.78
color_node=material.node_tree.nodes.new('ShaderNodeVertexColor');color_node.layer_name='MonsterTint'
material.node_tree.links.new(color_node.outputs['Color'],shader.inputs['Base Color'])
roots={};objects={}
def write_clip(obj,clip,label,values,basic=False):
 wind,hit,wind_move,hit_move=values;base=obj.location.copy()
 keys=[(0,0,hit,hit_move),(6,1,hit,hit_move),(12,0,hit,hit_move)] if basic else [(0,0,(0,0,0),(0,0,0)),(11,1,wind,wind_move),(15,1,hit,hit_move),(21,.38,hit,hit_move),(30,0,(0,0,0),(0,0,0))]
 enhanced=not basic and (clip.endswith('-charge') or any(clip.startswith(name+'-') for name in [*dungeon_attacks,*WORLD_BOSSES]))
 if enhanced:
  follow=tuple(value*1.08 for value in hit);follow_move=tuple(value*1.04 for value in hit_move)
  keys=[(0,0,wind,wind_move),(6,.52,wind,wind_move),(10,1,wind,wind_move),(12,.94,wind,wind_move),(15,1,hit,hit_move),(18,1,follow,follow_move),(23,.36,follow,follow_move),(30,0,hit,hit_move)]
 if clip=='void-stalker-leap':
  air,air_move=leap_air[label]
  keys=[(0,0,wind,wind_move),(8,1,wind,wind_move),(12,1,air,air_move),(15,1,hit,hit_move),(18,.88,hit,hit_move),(24,.27,hit,hit_move),(30,0,hit,hit_move)]
 if clip.endswith('-charge'):
  keys=[(0,0,wind,wind_move),(5,1,wind,wind_move),(7.5,.78,hit,hit_move),(11,.88,hit,hit_move),(15,1,hit,hit_move),(18,.93,hit,hit_move),(24,.28,hit,hit_move),(30,0,hit,hit_move)]
 for frame,t,r,offset in keys:
  game_rotation=Euler(tuple(v*t for v in r),'XYZ').to_matrix()
  basis=Euler((math.pi/2,0,0)).to_matrix()
  obj.rotation_euler=(basis@game_rotation@basis.transposed()).to_euler('XYZ')
  obj.location=base+Vector(xyz(*(v*t for v in offset)))
  obj.keyframe_insert(data_path='rotation_euler',frame=frame);obj.keyframe_insert(data_path='location',frame=frame)
 action=obj.animation_data.action;action.name=clip+'-'+label
 if basic or enhanced:
  for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
   for key in curve.keyframe_points:
    key.interpolation='LINEAR' if basic else 'BEZIER'
    key.handle_left_type=key.handle_right_type='AUTO_CLAMPED'
 track=obj.animation_data.nla_tracks.new();track.name=clip
 strip=track.strips.new(clip,0,action);strip.extrapolation='NOTHING'
 obj.animation_data.action=None
# Direct contact poses: quick nips, mandible snaps, jabs and a forepaw rake.
# No wind-up keys, body scaling, lifted charging posture or held anticipation.
auto_poses={
 'bramble-wolf':{'body':((.055,0,0),(0,.02,.20)),'head':((.13,0,0),(0,0,.10)),'jaw':((-.07,0,0),(0,0,0))},
 'briar-boar':{'body':((.04,0,0),(0,0,.23)),'head':((-.20,0,0),(0,.025,.10))},
 'grove-spider':{'body':((.065,0,0),(0,.02,.17)),'head':((.12,0,0),(0,0,.10)),'leg-0':((-.30,0,-.12),(0,0,0)),'leg-1':((-.18,0,.08),(0,0,0))},
 'ember-beetle':{'body':((.04,0,0),(0,0,.14)),'head':((.10,0,0),(0,0,.05)),'left-arm':((0,-.32,0),(0,0,0)),'right-arm':((0,.32,0),(0,0,0))},
 'dune-scorpion':{'body':((0,.045,0),(0,0,.10)),'left-arm':((-.12,-.34,0),(0,0,.12)),'right-arm':((-.04,.10,0),(0,0,0))},
 'stone-golem':{'body':((.04,-.11,0),(0,0,.08)),'head':((0,.08,0),(0,0,0)),'right-arm':((-1.14,.13,.08),(0,0,.08))},
 'frost-yeti':{'body':((.035,.13,0),(0,0,.10)),'head':((.035,-.08,0),(0,0,0)),'left-arm':((-1.05,-.25,-.15),(0,0,.05))},
 'crystal-bat':{'body':((.15,0,0),(0,.03,.25)),'head':((.14,0,0),(0,0,.04)),'left-wing':((0,.10,.22),(0,0,0)),'right-wing':((0,-.10,-.22),(0,0,0))},
 'marsh-toad':{'body':((.045,0,0),(0,.015,.20)),'head':((.08,0,0),(0,0,.06)),'jaw':((-.06,0,0),(0,0,0))},
 'void-stalker':{'body':((.04,-.16,0),(0,0,.12)),'head':((.04,.12,0),(0,0,0)),'right-arm':((-1.05,.38,.18),(0,0,.09))},
 'stormhorn-behemoth':{'body':((.025,-.055,0),(0,.035,.12)),'head':((.07,.06,0),(0,0,.05)),'leg-0':((-.51,-.15,-.10),(0,0,.10))},
 'briarhorn-elder':{'body':((.07,-.10,0),(0,.02,.30)),'head':((-.27,.17,0),(0,.06,.16)),'jaw':((.09,0,0),(0,0,0)),'tail':((0,-.26,0),(0,0,0))},
 'rimefang-matriarch':{'body':((.065,.21,0),(0,.02,.21)),'head':((.07,-.12,0),(0,0,0)),'left-arm':((-1.41,-.42,-.20),(0,0,.14)),'right-arm':((-.22,.16,.09),(0,0,0)),'jaw':((.12,0,0),(0,0,0))},
 'ashen-crown-titan':{'body':((.065,-.20,0),(0,.03,.18)),'head':((.055,.13,0),(0,0,0)),'right-arm':((-1.43,.26,.14),(0,0,.15)),'left-arm':((-.23,-.13,-.08),(0,0,0)),'core':((.055,0,0),(0,0,.025))},
}
# Basic hits still start immediately and finish in .4s; coordinated secondary
# limbs make their short contact silhouette readable without a charge pose.
auto_poses['grove-spider'].update({'body':((.08,0,0),(0,.02,.22)), 'head':((.20,0,0),(0,0,.12)), 'leg-0':((-.38,0,.22),(0,0,0)), 'leg-1':((-.30,0,-.18),(0,0,0))})
auto_poses['ember-beetle'].update({'body':((.06,0,0),(0,0,.20)), 'head':((.16,0,0),(0,0,.08)), 'left-arm':((0,-.60,0),(0,0,0)), 'right-arm':((0,.60,0),(0,0,0))})
auto_poses['dune-scorpion'].update({'body':((0,.08,0),(0,0,.14)), 'left-arm':((-.16,-.50,0),(0,0,.18)), 'right-arm':((-.08,.25,0),(0,0,.07)), 'tail':((0,-.18,0),(0,0,0))})
auto_poses['stone-golem'].update({'body':((.06,-.19,0),(0,0,.12)), 'head':((0,.14,0),(0,0,0)), 'right-arm':((-1.40,.23,.12),(0,0,.12)), 'left-arm':((-.26,-.12,-.06),(0,0,0))})
auto_poses['frost-yeti'].update({'body':((.055,.20,0),(0,0,.15)), 'left-arm':((-1.32,-.44,-.21),(0,0,.08)), 'right-arm':((-.24,.14,.10),(0,0,0))})
auto_poses['crystal-bat'].update({'body':((.23,0,0),(0,.04,.32)), 'left-wing':((-.10,.20,-.45),(0,0,0)), 'right-wing':((-.10,-.20,.45),(0,0,0))})
auto_poses['void-stalker'].update({'body':((.06,-.22,0),(0,0,.18)), 'right-arm':((-1.27,.56,.26),(0,0,.13)), 'left-arm':((-.30,-.22,-.08),(0,0,0))})
auto_poses['stormhorn-behemoth'].update({'body':((.04,-.11,0),(0,.04,.21)),'head':((.10,.14,0),(0,0,.11)),'leg-0':((-.72,-.23,-.17),(0,0,.16)),'jaw':((.12,0,0),(0,0,0)),'tail':((0,.28,0),(0,0,0))})
for name,groups in parts.items():
 root=bpy.data.objects.new(name,None);library.collection.objects.link(root);roots[name]=root;objects[name]={}
 root['attack_clip']=name+'-attack';root['auto_clip']=name+'-auto';root['attack_contact']=.5;root['special_clips']=','.join(extra_clips.get(name,{}));root['axes']='Y up, +Z front, ground origin, metres'
 for label,data in groups.items():
  mesh=bpy.data.meshes.new(name+'-'+label);mesh.from_pydata(data['vertices'],[],data['faces']);mesh.update();mesh.materials.append(material)
  tint=mesh.color_attributes.new(name='MonsterTint',type='BYTE_COLOR',domain='CORNER')
  for face,color in zip(mesh.polygons,data['colors']):
   face.use_smooth=False
   for i in face.loop_indices:tint.data[i].color=color
  obj=bpy.data.objects.new(name+'-'+label,mesh);library.collection.objects.link(obj);objects[name][label]=obj
  parent_label=data['parent'];obj.parent=objects[name][parent_label] if parent_label else root
  parent_pivot=groups[parent_label]['pivot'] if parent_label else (0,0,0)
  obj.location=xyz(*(data['pivot'][i]-parent_pivot[i] for i in range(3)))
  obj.rotation_mode='XYZ'
  if label in auto_poses[name]:
   hit,offset=auto_poses[name][label]
   write_clip(obj,name+'-auto',label,((0,0,0),hit,(0,0,0),offset),basic=True)
  for suffix,poses in extra_clips.get(name,{}).items():
   if label in poses:write_clip(obj,name+'-'+suffix,label,poses[label])
  if label not in motions[name]:continue
  # A shared NLA track name groups each monster's rigid channels into one GLB clip.
  write_clip(obj,name+'-attack',label,motions[name][label])
# Bake a small body-height correction into each action: planted paws and hands
# must not disappear below the floor during anticipation or heavy impact poses.
# The correction stays in Blender and GLB; the fixed gameplay root never moves.
for name,rig in objects.items():
 for suffix in ['attack','auto']+list(extra_clips.get(name,{})):
  clip=name+'-'+suffix
  for obj in rig.values():
   if obj.animation_data:
    for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
  action=bpy.data.actions[clip+'-body']
  curves=action.layers[0].strips[0].channelbag(action.slots[0]).fcurves
  height=next(curve for curve in curves if curve.data_path=='location' and curve.array_index==2)
  values=[]
  for frame in range(13 if suffix=='auto' else 31):
   library.frame_set(frame);bpy.context.view_layer.update()
   bottom=min((obj.matrix_world@Vector(corner)).z for obj in rig.values() for corner in obj.bound_box)
   values.append(height.evaluate(frame)+max(0,-bottom))
  height.keyframe_points.clear()
  for frame,value in enumerate(values):
   key=height.keyframe_points.insert(frame,value,options={'FAST'});key.interpolation='LINEAR'
  height.update()
 for obj in rig.values():
  if obj.animation_data:
   for track in obj.animation_data.nla_tracks:track.mute=False
library.frame_set(0)
# Death is authored separately so existing attack tracks and geometry stay exact.
# Bodies topple, limbs buckle and wings fold; every species keeps its own shape.
# Rotation and translation below use the same Y-up game axes as the rigid pivots.
death_poses={
 'bramble-wolf':{'body':((.12,.04,-1.52),(-.16,-.64,.04)),'head':((.26,-.12,.12),(0,0,0)),'jaw':((.08,0,0),(0,0,0)),'tail':((.30,.18,-.25),(0,0,0))},
 'briar-boar':{'body':((.08,-.04,1.55),(.20,-.62,.06)),'head':((.29,.10,-.10),(0,0,0)),'tail':((-.18,-.36,.21),(0,0,0))},
 'grove-spider':{'body':((.03,.02,-3.05),(.05,-.30,-.03)),'head':((-.12,-.05,.04),(0,.10,-.04))},
 'ember-beetle':{'body':((0,0,-3.14159265359),(-.08,-.30,.03)),'head':((.18,.10,.08),(0,0,0)),'left-arm':((.18,.30,.12),(0,0,0)),'right-arm':((.15,-.24,-.12),(0,0,0))},
 'dune-scorpion':{'body':((.025,.06,-.04),(0,-.24,.03)),'head':((.12,0,.03),(0,0,0)),'tail':((-.12,.08,1.43),(0,0,0)),'stinger':((.20,0,.06),(0,0,0)),'left-arm':((-.025,.18,.15),(0,0,0)),'right-arm':((-.025,-.20,-.15),(0,0,0))},
 'stone-golem':{'body':((1.50,.04,.04),(0,-.92,.33)),'head':((.15,-.08,0),(0,0,0)),'left-arm':((.10,-.08,-.10),(0,0,0)),'right-arm':((-.04,.08,.12),(0,0,0)),'left-leg':((.04,0,-.10),(0,0,0)),'right-leg':((.12,.05,.12),(0,0,0))},
 'frost-yeti':{'body':((.12,.04,-1.55),(-.24,-.96,.12)),'head':((.20,-.10,.06),(0,0,0)),'left-arm':((-.14,-.10,-1.10),(0,0,0)),'right-arm':((-.28,.10,1.20),(0,0,0)),'left-leg':((.32,.08,-.16),(0,0,0)),'right-leg':((.52,-.10,.18),(0,0,0))},
 'crystal-bat':{'body':((1.50,.02,.08),(.04,-.52,.06)),'head':((.16,-.06,.05),(0,0,0)),'left-wing':((.04,.08,-.96),(0,0,0)),'right-wing':((.06,-.08,1.02),(0,0,0)),'left-leg':((.56,.10,-.15),(0,0,0)),'right-leg':((.42,-.10,.12),(0,0,0)),'tail':((.36,.18,0),(0,0,0))},
 'marsh-toad':{'body':((.10,-.03,3.05),(0,-.25,.05)),'head':((.06,.04,-.02),(0,0,0)),'jaw':((-.12,0,0),(0,0,0)),'left-arm':((.15,.08,-.52),(0,0,0)),'right-arm':((.20,-.08,.58),(0,0,0)),'left-leg':((-.18,.12,-.45),(0,0,0)),'right-leg':((-.24,-.12,.50),(0,0,0))},
 'void-stalker':{'body':((-1.50,.06,.08),(.08,-.85,-.22)),'head':((.25,.08,-.05),(0,0,0)),'left-arm':((.10,-.10,-.12),(0,0,0)),'right-arm':((.18,.14,.16),(0,0,0)),'left-leg':((-.10,0,-.10),(0,0,0)),'right-leg':((-.06,.06,.10),(0,0,0)),'tail':((-.42,.28,.16),(0,0,0))},
 'stormhorn-behemoth':{'body':((.08,-.04,-1.54),(-.36,-1.95,.16)),'head':((.27,-.16,.14),(0,0,0)),'jaw':((.07,0,0),(0,0,0)),'tail':((.32,.24,-.24),(0,0,0))},
 'briarhorn-elder':{'body':((.13,.03,1.54),(.24,-1.35,.13)),'head':((.31,.17,-.11),(0,0,0)),'jaw':((.12,0,0),(0,0,0)),'tail':((-.24,-.37,.21),(0,0,0))},
 'rimefang-matriarch':{'body':((.15,.03,-1.56),(-.37,-1.93,.21)),'head':((.24,-.13,.08),(0,0,0)),'jaw':((.15,0,0),(0,0,0)),'left-arm':((-.15,-.12,-1.09),(0,0,0)),'right-arm':((-.31,.15,1.23),(0,0,0)),'left-leg':((.36,.09,-.17),(0,0,0)),'right-leg':((.55,-.12,.20),(0,0,0))},
 'ashen-crown-titan':{'body':((1.51,.08,.06),(0,-2.28,.58)),'head':((.25,-.13,.04),(0,0,0)),'core':((.12,0,.08),(0,0,0)),'left-arm':((.17,-.13,-.17),(0,0,0)),'right-arm':((-.09,.13,.19),(0,0,0)),'left-leg':((.08,0,-.13),(0,0,0)),'right-leg':((.19,.08,.16),(0,0,0))},
}
for name in ['bramble-wolf','briar-boar','stormhorn-behemoth','briarhorn-elder']:
 for n in range(4):
  side=1 if n%2==0 else -1
  death_poses[name]['leg-'+str(n)]=((.42 if n<2 else -.44,side*.06,-side*.64),(0,0,0))
for name,count in [('grove-spider',8),('ember-beetle',6),('dune-scorpion',6)]:
 for n in range(count):
  side=1 if n%2==0 else -1
  curl=-.72 if name=='grove-spider' else -.92 if name=='ember-beetle' else .28
  death_poses[name]['leg-'+str(n)]=((.13*(n//2-1),side*.10,side*curl),(0,0,0))
def write_death_clip(obj,clip,label,pose):
 rotation,offset=pose;base=obj.location.copy()
 # Accelerate into the fall, absorb impact, then hold the settled pose from
 # frame 34 through 42. No cyclic final key or return to standing is present.
 for frame,weight in [(0,0),(5,.055),(11,.32),(19,.82),(24,1.035),(29,.982),(34,1),(42,1)]:
  basis=Euler((math.pi/2,0,0)).to_matrix()
  game_rotation=Euler(tuple(v*weight for v in rotation),'XYZ').to_matrix()
  obj.rotation_euler=(basis@game_rotation@basis.transposed()).to_euler('XYZ',obj.rotation_euler)
  obj.location=base+Vector(xyz(*(v*weight for v in offset)))
  obj.keyframe_insert(data_path='rotation_euler',frame=frame);obj.keyframe_insert(data_path='location',frame=frame)
 action=obj.animation_data.action;action.name=clip+'-'+label
 for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
 track=obj.animation_data.nla_tracks.new();track.name=clip
 strip=track.strips.new(clip,0,action);strip.extrapolation='NOTHING'
 obj.animation_data.action=None
 # New actions must not leave their final pose as the underlying model rest.
 obj.location=base;obj.rotation_euler=(0,0,0)
for name,rig in objects.items():
 clip=name+'-death';roots[name]['death_clip']=clip;roots[name]['death_duration']=1.4
 for label,obj in rig.items():write_death_clip(obj,clip,label,death_poses[name].get(label,((0,0,0),(0,0,0))))
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
 action=bpy.data.actions[clip+'-body']
 curves=action.layers[0].strips[0].channelbag(action.slots[0]).fcurves
 height=next(curve for curve in curves if curve.data_path=='location' and curve.array_index==2)
 values=[]
 for frame in range(43):
  library.frame_set(frame);bpy.context.view_layer.update()
  bottom=min((obj.matrix_world@vertex.co).z for obj in rig.values() for vertex in obj.data.vertices)
  # Exact floor contact with a sub-centimetre allowance for interpolated poses.
  # Correct only local Y: never recenter or teleport the gameplay X/Z root.
  values.append(height.evaluate(frame)-bottom+.008*min(1,frame/11))
 height.keyframe_points.clear()
 for frame,value in enumerate(values):
  key=height.keyframe_points.insert(frame,value,options={'FAST'});key.interpolation='LINEAR'
 height.update()
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=False
 library.frame_set(0);bpy.context.view_layer.update()
library.frame_end=42
library.frame_set(0)
for folder in [EXPORT.parent,SOURCE.parent]:folder.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
 export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_force_sampling=True,
 export_cameras=False,export_lights=False)
if '--optimize' in sys.argv:
 cli=['npx','--yes','@gltf-transform/cli@4.5.0']
 with tempfile.TemporaryDirectory(prefix='mossvale-monsters-') as temporary:
  first=str(Path(temporary)/'quantized.glb');second=str(Path(temporary)/'dedup.glb')
  for command in [['quantize',str(EXPORT),first,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['dedup',first,second],['prune',second,str(EXPORT)]]:subprocess.run(cli+command,check=True)
 raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+length])
 for field in ['extensionsUsed','extensionsRequired']:document[field]=sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
 encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=raw[20+length:]
 EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)

def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
gallery=bpy.data.scenes.new('Bestiary gallery - metres and attack poses');bpy.context.window.scene=gallery
gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
gallery.render.resolution_x=2400;gallery.render.resolution_y=1500;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.image_settings.color_mode='RGBA'
gallery.view_settings.view_transform='AgX';gallery.world=bpy.data.worlds.new('Bestiary world');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.25,.29,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
def flat_material(color):
 name='Gallery '+color;mat=bpy.data.materials.get(name)
 if not mat:
  mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=COLORS[color]
  mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.90
 return mat
def gallery_box(color,at,size):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*at));obj=bpy.context.object;obj.scale=(size[0],size[2],size[1]);obj.data.materials.append(flat_material(color));return obj
def copy_rig(name,at):
 parent=bpy.data.objects.new(name+' gallery',None);gallery.collection.objects.link(parent);parent.location=xyz(*at)
 copies={}
 for label,source in objects[name].items():
  obj=source.copy();obj.data=source.data;obj.animation_data_clear();gallery.collection.objects.link(obj)
  obj.parent=copies[parts[name][label]['parent']] if parts[name][label]['parent'] else parent;copies[label]=obj
 return parent
names=[name for name in roots if name not in WORLD_BOSSES or name=='stormhorn-behemoth']
for index,name in enumerate(names):
 if index==10:at=(13.1,0,-2.7);platform=(5.5,.25,5.8)
 else:at=(-8+(index%5)*4.05,0,-(index//5)*5.1);platform=(3.15,.18,3.3)
 copy_rig(name,at);gallery_box('plinth',(at[0],-.15,at[2]),platform)
 bpy.ops.object.text_add(location=xyz(at[0],-.026,at[2]+platform[2]/2-.10))
 label=bpy.context.object;label.name='Label - '+name;label.data.body=name.replace('-',' ').title();label.data.align_x='CENTER';label.data.size=.205 if index<10 else .28
 label.rotation_euler=(0,0,0);label.data.extrude=0;label.data.materials.append(flat_material('cream'))
gallery_box('floor',(0,-.34,0),(200,.12,200))
for at,power,size in [((-8,14,7),3100,10),((14,11,5),2500,9),((2,12,-10),2200,8)]:
 bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(2,1,-2))
bpy.ops.object.camera_add(location=xyz(19,20,36));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=30.4;aim(camera,(2.8,1.15,-2.6));gallery.camera=camera
gallery.render.filepath=str(PREVIEW)
# Retain the standing overview and add a second gallery of final corpse poses.
# Both use the actual authored hierarchy; gallery copies share immutable meshes.
standing_gallery=gallery
gallery=standing_gallery.copy();gallery.name='Bestiary deaths - settled grounded poses'
for name in names:
 parent=next(obj for obj in standing_gallery.objects if obj.name==name+' gallery')
 for obj in [parent,*parent.children_recursive]:gallery.collection.objects.unlink(obj)
bpy.context.window.scene=library
for name,rig in objects.items():
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=track.name!=name+'-death'
library.frame_set(42);bpy.context.view_layer.update()
bpy.context.window.scene=gallery
for index,name in enumerate(names):
 at=(13.1,0,-2.7) if index==10 else (-8+(index%5)*4.05,0,-(index//5)*5.1)
 copy_rig(name,at)
gallery.render.filepath=str(PREVIEW)
bpy.context.window.scene=library;library.frame_set(0)
bpy.context.window.scene=gallery
def pose_sheet(basic=False,charge=False):
 global gallery
 gallery=bpy.data.scenes.new('Monster charges - anchored authored poses' if charge else 'Dungeon direct strikes - 0.4 seconds' if basic else 'Dungeon special attacks - authored contact poses')
 gallery.render.engine='CYCLES';gallery.cycles.samples=12;gallery.cycles.use_denoising=True
 gallery.render.threads_mode='FIXED';gallery.render.threads=3
 gallery.render.resolution_x=1800;gallery.render.resolution_y=3600 if charge else 3000 if basic else 3400;gallery.render.resolution_percentage=100
 gallery.render.image_settings.file_format='PNG';gallery.view_settings.view_transform='AgX'
 gallery.world=bpy.data.worlds.new(gallery.name+' world');gallery.world.use_nodes=True
 gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.15,.19,.23,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
 rows=[(name,'charge') for name in charge_poses] if charge else [(name,'auto' if basic else 'attack') for name in dungeon_attacks]
 if not basic and not charge:rows.extend([('frost-yeti','cast'),('void-stalker','leap')])
 frames=[5,8,15,30] if charge else [0,3,6,12] if basic else [10,15,18,30]
 bpy.context.window.scene=gallery
 bpy.ops.object.camera_add(location=xyz(0,52,62));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=28*gallery.render.resolution_y/gallery.render.resolution_x
 aim(camera,(0,1,0));gallery.camera=camera;bpy.context.view_layer.update()
 def sheet_label(text,x,y,size=.42,center=False):
  curve=bpy.data.curves.new(text,'FONT');curve.body=text;curve.size=size;curve.align_x='CENTER' if center else 'LEFT'
  obj=bpy.data.objects.new(text,curve);gallery.collection.objects.link(obj);obj.matrix_world=camera.matrix_world.copy();obj.location=camera.matrix_world@Vector((x,y,-10));obj.visible_shadow=False
  mat=bpy.data.materials.get('Attack sheet lettering')
  if not mat:
   mat=bpy.data.materials.new('Attack sheet lettering');mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=COLORS['cream'];shader.inputs['Emission Color'].default_value=COLORS['cream'];shader.inputs['Emission Strength'].default_value=.8
  curve.materials.append(mat)
 for row,(name,suffix) in enumerate(rows):
  at_z=(row-(len(rows)-1)/2)*7.6;clip=name+'-'+suffix
  bpy.context.window.scene=library
  for obj in objects[name].values():
   if obj.animation_data:
    for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
  extents=[]
  for frame in frames:
   library.frame_set(frame);bpy.context.view_layer.update()
   vertices=[obj.matrix_world@Vector(corner) for obj in objects[name].values() for corner in obj.bound_box]
   extents.append(max(max(v[i] for v in vertices)-min(v[i] for v in vertices) for i in range(3)))
  scale=3.3/max(extents)
  for column,frame in enumerate(frames):
   bpy.context.window.scene=library;library.frame_set(frame);bpy.context.view_layer.update()
   bpy.context.window.scene=gallery;at=((column-1.5)*5.6,0,at_z)
   copy=copy_rig(name,at);copy.scale=(scale,scale,scale);copy['authored_clip']=clip;copy['authored_frame']=frame
   gallery_box('plinth',(at[0],-.12,at_z),(4.75,.20,5.4))
  bpy.context.window.scene=gallery;bpy.context.view_layer.update()
  text=name.replace('-',' ').upper()+'  /  '+('CHARGE' if charge else 'DIRECT STRIKE' if basic else 'FROST CAST' if suffix=='cast' else 'SHADOW LEAP' if suffix=='leap' else 'SPECIAL ATTACK')
  projected=camera.matrix_world.inverted()@Vector(xyz(-11.5,0,at_z));sheet_label(text,-11.5,projected.y+(3.12 if charge else 2.5),.40)
 top=28*gallery.render.resolution_y/gallery.render.resolution_x/2
 sheet_label('CHARGE ATTACKS  /  BLENDER POSES' if charge else 'DIRECT ATTACKS  /  0.4 SECONDS' if basic else 'DUNGEON ATTACKS  /  BLENDER POSES',-11.5,top-1.45,.62)
 labels=['CROUCH .17','RUSH .27','CONTACT .50','RECOVER 1.00'] if charge else ['REST .00','STRIKE .10','CONTACT .20','RECOVER .40'] if basic else ['ANTICIPATE .33','CONTACT .50','FOLLOW .60','RECOVER 1.00']
 for column,text in enumerate(labels):sheet_label(text,(column-1.5)*5.6,top-2.5,.30,True)
 sheet_label('Actual authored clip poses. Individual species sized for readability.',-11.5,-top+1.0,.28)
 gallery_box('floor',(0,-.33,0),(180,.12,180))
 for at,power,size in [((-15,50,10),11000,35),((20,38,-20),8500,35)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,0,0))
 bpy.ops.object.light_add(type='SUN',location=xyz(-20,40,30));light=bpy.context.object;light.data.energy=1.25;light.data.angle=.24;aim(light,(0,0,0))
 gallery.render.filepath=str(ROOT/'assets/source'/('monster-charges-preview.png' if charge else 'monster-auto-attacks-preview.png' if basic else 'monster-attacks-preview.png'))
 gallery['evidence']='Actual evaluated Blender NLA tracks copied at their labelled frames. Shared immutable meshes; no illustrative substitute.'
 return gallery
attack_sheets=[pose_sheet(False),pose_sheet(True)]
charge_sheet=pose_sheet(charge=True)
def boss_sheet(attacks=False):
 global gallery
 gallery=bpy.data.scenes.new('World bosses - attack poses' if attacks else 'World bosses - levels 10 20 30 40')
 gallery.render.engine='CYCLES';gallery.cycles.samples=20;gallery.cycles.use_denoising=True
 gallery.render.threads_mode='FIXED';gallery.render.threads=4
 gallery.render.resolution_x=2500;gallery.render.resolution_y=1900 if attacks else 1250;gallery.render.resolution_percentage=100
 gallery.render.image_settings.file_format='PNG';gallery.view_settings.view_transform='AgX'
 gallery.world=bpy.data.worlds.new(gallery.name+' world');gallery.world.use_nodes=True
 gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.19,.23,.27,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.75
 bpy.context.window.scene=gallery
 bpy.ops.object.camera_add(location=xyz(0,38,45) if attacks else xyz(0,11,34));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=31 if attacks else 34
 aim(camera,(0,1,0) if attacks else (0,3,0));gallery.camera=camera;bpy.context.view_layer.update()
 def title(text,x,y,size=.42,center=False):
  curve=bpy.data.curves.new(text,'FONT');curve.body=text;curve.size=size;curve.align_x='CENTER' if center else 'LEFT'
  obj=bpy.data.objects.new(text,curve);gallery.collection.objects.link(obj);obj.matrix_world=camera.matrix_world.copy();obj.location=camera.matrix_world@Vector((x,y,-10));obj.visible_shadow=False
  mat=bpy.data.materials.get('Attack sheet lettering');curve.materials.append(mat)
 for index,(name,level) in enumerate(WORLD_BOSSES.items()):
  poses=[('attack',10),('attack',15),('swipe',15),('cast',15),('auto',6)] if attacks else [('attack',0)]
  for column,(suffix,frame) in enumerate(poses):
   bpy.context.window.scene=library
   for obj in objects[name].values():
    if obj.animation_data:
     for track in obj.animation_data.nla_tracks:track.mute=track.name!=name+'-'+suffix
   library.frame_set(frame);bpy.context.view_layer.update()
   bpy.context.window.scene=gallery
   at=((column-2)*5.6,0,(index-1.5)*7.7) if attacks else ((index-1.5)*8.0,0,0)
   copy=copy_rig(name,at);copy.rotation_euler.z=.24
   if attacks:
    copy.scale=(.48,.48,.48) if name=='briarhorn-elder' else (.40,.40,.40)
   copy['authored_clip']=name+'-'+suffix;copy['authored_frame']=frame
   gallery_box('plinth',(at[0],-.16,at[2]),(4.85,.26,5.4) if attacks else (6.65,.26,5.95))
  if attacks:
   projected=camera.matrix_world.inverted()@Vector(xyz(-14.1,0,(index-1.5)*7.7));title(name.replace('-',' ').upper()+'  /  LEVEL '+str(level),-14.1,projected.y+2.6,.39)
  else:
   title(name.replace('-',' ').title(),(index-1.5)*8,-4.50,.44,True);title('LEVEL '+str(level),(index-1.5)*8,-5.18,.32,True)
 top=camera.data.ortho_scale*gallery.render.resolution_y/gallery.render.resolution_x/2
 title('WORLD BOSSES  /  AUTHORED ATTACKS' if attacks else 'MOSSVALE  /  WORLD BOSSES',-14.7,top-1.1,.61)
 if attacks:
  for column,label in enumerate(['WINDUP .33','SLAM / RAM .50','SWIPE .50','PULSE .50','AUTO .20']):title(label,(column-2)*5.6,top-2,.32,True)
  title('Actual Blender clip frames. Contact at 50% of each clip; models scaled for readability.',-14.7,-top+.60,.27)
 else:title('Briar and bark    /    Glacier and fur    /    Thunder and crystal    /    Basalt and magma',0,top-2,.33,True)
 gallery_box('floor',(0,-.36,0),(140,.12,140))
 for at,power,size in [((-13,23,12),6500,15),((14,18,8),5000,12),((0,22,-14),6800,14)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,2,0))
 bpy.ops.object.light_add(type='SUN',location=xyz(-10,30,18));bpy.context.object.data.energy=1.1;bpy.context.object.data.angle=.25;aim(bpy.context.object,(0,0,0))
 gallery.render.filepath=str(ROOT/'assets/source'/('world-boss-attacks-preview.png' if attacks else 'world-bosses-preview.png'))
 gallery['evidence']='Actual authored Blender models and evaluated NLA clip poses, no illustrative substitute.'
 return gallery
boss_sheets=[boss_sheet(False),boss_sheet(True)]
# Restore all authored clips for editing, with the action contact sheet open.
bpy.context.window.scene=library
for rig in objects.values():
 for obj in rig.values():
  if obj.animation_data:
   for track in obj.animation_data.nla_tracks:track.mute=False
library.frame_set(0)
bpy.context.window.scene=boss_sheets[0]
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('MONSTER_KIT '+json.dumps({'cubes':counts,'triangles':sum(counts.values())*12,'glb_bytes':EXPORT.stat().st_size,'roots':len(roots),'clips':len(roots)*3+sum(len(clips) for clips in extra_clips.values()),'parts':{name:list(groups) for name,groups in parts.items()}}))
if '--render' in sys.argv:
 for sheet in [charge_sheet] if '--charge-only' in sys.argv else boss_sheets+[charge_sheet] if '--bosses-only' in sys.argv else attack_sheets+boss_sheets+[charge_sheet]:
  bpy.context.window.scene=sheet;bpy.ops.render.render(write_still=True)
 bpy.context.window.scene=boss_sheets[0]
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
