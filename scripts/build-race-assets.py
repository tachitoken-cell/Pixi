"""Author eighteen original, assembled voxel anatomies, with no scaled common body.

blender --background --python scripts/build-race-assets.py -- --render --optimize
The shared fit sidecar defines joint locations and clothing envelopes. Every
mesh is authored in those coordinates; all root and joint scales remain one.
"""
import bpy
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
PROFILES=json.loads((ROOT/'assets/source/race-fit.json').read_text())
EXPORT=ROOT/'public/models/race-kit.glb'
SOURCE=ROOT/'assets/source/race-kit.blend'
PREVIEW=ROOT/'assets/source/race-kit-preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
library=bpy.context.scene;library.name='Mossvale authored race anatomy library'
library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
def xyz(x,y,z):return(x,-z,y)
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def color(hexcode):return tuple(linear(int(hexcode[i:i+2],16)/255) for i in (0,2,4))+(1,)
WHITE=(1,1,1,1);BONE=color('EDE2C5');INK=color('423633');GOLD=color('D5B16B')
materials=bpy.data.materials.new('Race neutral vertex palette');materials.use_nodes=True
shader=materials.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.88
attribute=materials.node_tree.nodes.new('ShaderNodeVertexColor');attribute.layer_name='RaceTint'
materials.node_tree.links.new(attribute.outputs['Color'],shader.inputs['Base Color'])

class Anatomy:
 def __init__(self,profile):
  self.fit=profile;self.race=profile['race'];self.female=profile['gender']=='female';self.name=profile['root'];self.meshes={};self.pivots={}
  self.root=bpy.data.objects.new(self.name,None);library.collection.objects.link(self.root);self.root['fit']=profile;self.root['authoredAnatomy']=True
  self.part('torso',(0,0,0));self.part('head',tuple(profile['head'][axis] for axis in ['x','y','z']))
  for side,label in [(1,'left'),(-1,'right')]:
   self.part(label+'-arm',(side*profile['shoulder']['x'],profile['shoulder']['y'],profile['shoulder']['z']))
   self.part(label+'-leg',(side*profile['hip']['x'],profile['hip']['y'],profile['hip']['z']))
  if self.race in ['foxfolk','catfolk','dogfolk','lizardfolk']:self.part('tail',(0,profile['hip']['y']+.13,-profile['torso']['depth']/2))
 def part(self,name,at):
  obj=bpy.data.objects.new(self.name+'-'+name,None);library.collection.objects.link(obj);obj.parent=self.root;obj.location=xyz(*at);obj['part']=name;self.pivots[name]=obj
 def shape(self,part,tint,vertices,faces,slot=None,detail=None,rgb=WHITE):
  key=(part,tint,slot,detail);d=self.meshes.setdefault(key,{'v':[],'f':[],'c':[]});base=len(d['v']);d['v'].extend(xyz(*v) for v in vertices)
  for face in faces:d['f'].append(tuple(base+i for i in face));d['c'].append(rgb)
 def box(self,part,tint,x,y,z,w,h,d,slot=None,detail=None,rgb=WHITE,angle=0):
  c,s=math.cos(angle),math.sin(angle);vertices=[]
  for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
   xx,yy=a*w/2,b*h/2;vertices.append((x+xx*c-yy*s,y+xx*s+yy*c,z+f*d/2))
  self.shape(part,tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],slot,detail,rgb)
 def prism(self,part,tint,polygon,z,depth,slot=None,detail=None,rgb=WHITE):
  # Keep outward face winding on both mirrored ears and cut hems.
  area=sum(polygon[i][0]*polygon[(i+1)%len(polygon)][1]-polygon[(i+1)%len(polygon)][0]*polygon[i][1] for i in range(len(polygon)))
  if area<0:polygon=list(reversed(polygon))
  n=len(polygon);vertices=[(x,y,z+side*depth/2) for side in [-1,1] for x,y in polygon]
  faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  self.shape(part,tint,vertices,faces,slot,detail,rgb)
 def finish(self):
  for (part,tint,slot,detail),d in self.meshes.items():
   name=self.name+'-'+part+'-'+(detail or tint)+(('-'+slot) if slot and not detail else '')
   mesh=bpy.data.meshes.new(name);mesh.from_pydata(d['v'],[],d['f']);mesh.update();mesh.materials.append(materials)
   colors=mesh.color_attributes.new(name='RaceTint',type='BYTE_COLOR',domain='CORNER')
   for face,rgb in zip(mesh.polygons,d['c']):
    face.use_smooth=False
    for index in face.loop_indices:colors.data[index].color=rgb
   obj=bpy.data.objects.new(name,mesh);library.collection.objects.link(obj);obj.parent=self.pivots[part];obj['tint']=tint
   if slot:obj['slot']=slot
   if detail=='cranium':obj['anatomy']='cranium'
   if detail=='hand':obj['anatomy']='hand'
   if detail=='chest':obj['anatomy']='clothed-chest' if self.female else 'chest'
  return self.root

def torso(a):
 p=a.fit;t=p['torso'];race=a.race;w=t['width'];d=t['depth'];hip=p['hip']['y'];sy=p['shoulder']['y'];wy=t['waistY'];hy=t['hemY'];cy=t['chestY']
 # Each race has a separately authored silhouette/cut, beyond its joint lengths.
 if race in ['human','catfolk','dogfolk','lizardfolk']:
  a.box('torso','outfit',0,(sy+wy)/2,0,w,sy-wy+.16,d,'armor')
  a.box('torso','outfit',0,(wy+hy)/2,0,t['waistWidth'],wy-hy+.05,d*.93,'armor')
  a.box('torso','outfit',0,hy-.045,0,t['hemWidth'],.16,d+.025,'armor')
 elif race=='elf':
  a.prism('torso','outfit',[(-w/2,sy+.1),(w/2,sy+.1),(t['waistWidth']/2,wy),(.19,hy-.08),(-.19,hy-.08),(-t['waistWidth']/2,wy)],0,d,'armor')
  for side in [-1,1]:
   a.prism('torso','outfit',[(side*.05,hy+.06),(side*.30,hy+.06),(side*.24,hy-.20),(side*.10,hy-.13)],.035,d*.90,'armor')
   a.box('torso','accent',side*.245,hy-.105,d/2+.017,.042,.17,.035,'armor',angle=side*-.23)
 elif race=='dwarf':
  a.box('torso','outfit',0,(sy+hy)/2,-.015,w,sy-hy+.17,d,'armor')
  a.box('torso','outfit',0,wy-.01,.025,t['hemWidth'],.23,d*.94,'armor')
  a.box('torso','outfit',0,hy-.035,.015,t['hemWidth'],.18,d+.025,'armor')
  for side in [-1,1]:a.box('torso','accent',side*(w/2-.075),(sy+wy)/2,d/2+.012,.105,sy-wy+.1,.035,'armor')
 elif race=='orc':
  a.prism('torso','outfit',[(-w/2,sy+.11),(w/2,sy+.11),(w*.44,sy-.22),(t['waistWidth']/2,wy),(.36,hy-.07),(-.36,hy-.07),(-t['waistWidth']/2,wy),(-w*.44,sy-.22)],-.015,d,'armor')
  a.box('torso','outfit',0,sy-.04,-d/2+.025,w*.77,.31,.15,'armor')
  for side in [-1,1]:a.prism('torso','outfit',[(side*.05,hy+.07),(side*.45,hy+.03),(side*.35,hy-.13),(side*.09,hy-.08)],.035,d*.92,'armor')
 elif race=='goblin':
  a.prism('torso','outfit',[(-w*.43,sy+.11),(w*.43,sy+.11),(w/2,sy-.12),(t['waistWidth']/2,wy),(.23,hy-.04),(-.23,hy-.04),(-t['waistWidth']/2,wy),(-w/2,sy-.12)],-.02,d,'armor')
  a.box('torso','outfit',0,sy-.035,-d/2+.01,w*.68,.28,.13,'armor')
  for index in range(3):a.prism('torso','outfit',[(index*.17-.26,hy+.05),(index*.17-.10,hy+.05),(index*.17-.13,hy-.14-(index%2)*.035),(index*.17-.245,hy-.10)],.02,d*.98,'armor')
 elif race=='foxfolk':
  a.prism('torso','outfit',[(-w/2,sy+.1),(w/2,sy+.1),(t['waistWidth']/2,wy),(.29,hy+.01),(.31,hy-.08),(-.31,hy-.08),(-.29,hy+.01),(-t['waistWidth']/2,wy)],0,d,'armor')
  for side in [-1,1]:a.prism('torso','accent',[(side*.03,sy+.09),(side*.23,sy+.09),(side*.12,sy-.10),(side*.035,sy-.19)],d/2+.022,.035,'armor')
 # High-neck, fully clothed chest contours are baked into the torso geometry.
 if a.female:
  for side in [-1,1]:
   cx=side*w*.215;rx=w*.21;ry=.125 if race in ['elf','goblin'] else .145
   polygon=[(cx-rx*.65,cy+ry),(cx+rx*.65,cy+ry),(cx+rx,cy+ry*.45),(cx+rx,cy-ry*.55),(cx+rx*.55,cy-ry),(cx-rx*.55,cy-ry),(cx-rx,cy-ry*.55),(cx-rx,cy+ry*.45)]
   a.prism('torso','outfit',polygon,(d/2+t['chestFront'])/2,t['chestFront']-d/2,'armor','chest')
 else:
  for side in [-1,1]:a.box('torso','outfit',side*w*.22,cy,d/2+.01,w*.42,.25 if race in ['dwarf','orc'] else .21,.03,'armor','chest')
 # Belt, collar and neck follow the authored torso, with no backpack/cape baked in.
 a.box('torso','leather',0,wy-.105,.008,t['waistWidth']+.035,.10,d+.035,'armor')
 a.box('torso','fixed',0,wy-.105,d/2+.04,.115,.105,.045,'armor',rgb=GOLD)
 a.box('torso','accent',0,sy+.083,.012,w*.58,.085,d+.025,'armor')
 ny=p['head']['y']-.35
 a.box('torso','skin',0,(sy+.06+ny)/2,p['head']['z']*.5,.255 if race not in ['dwarf','orc'] else .32,ny-sy+.18,.245)

def head(a):
 race=a.race;female=a.female
 def core(x,y,z,w,h,d):a.box('head','skin',x,y,z,w,h,d,detail='cranium')
 if race=='human':
  core(0,.035,0,.70,.60,.62);core(0,-.267,-.008,.58 if not female else .545,.14,.57);core(0,-.346,-.022,.44 if not female else .40,.035,.49)
  for side in [-1,1]:a.box('head','skin',side*.382,-.055,-.005,.12,.20,.17)
  a.box('head','skin',0,-.128,.34,.09,.095,.105)
 elif race=='elf':
  core(0,.043,-.005,.69,.584,.63)
  a.prism('head','skin',[(-.32,-.18),(.32,-.18),(.23,-.31),(.135,-.39),(-.135,-.39),(-.23,-.31)],-.01,.60,detail='cranium')
  for side in [-1,1]:
   a.prism('head','skin',[(side*.33,-.10),(side*.48,-.075),(side*.80,.18),(side*.48,.145),(side*.33,.07)],-.035,.12)
   a.prism('head','accent',[(side*.405,-.05),(side*.49,.005),(side*.67,.125),(side*.455,.075)],.032,.02)
  a.prism('head','skin',[(-.046,-.07),(.046,-.07),(.055,-.185),(-.045,-.17)],.343,.095)
 elif race=='dwarf':
  core(0,.035,-.005,.745,.60,.63);core(0,-.26,-.02,.86 if not female else .81,.21,.64);core(0,-.365,-.028,.71 if not female else .65,.07,.56)
  for side in [-1,1]:
   a.box('head','skin',side*.423,-.045,-.035,.17,.23,.20);a.box('head','skin',side*.485,-.04,-.025,.055,.13,.14)
  a.box('head','skin',0,-.137,.363,.18 if not female else .155,.13,.17)
  if not female:
   for side in [-1,1]:
    a.box('head','hair',side*.23,-.287,.329,.20,.19,.12)
    for n in range(3):a.box('head','hair',side*(.18-n*.035),-.395-n*.095,.322,.18-n*.025,.13,.14)
    a.box('head','accent',side*.115,-.555,.33,.14,.045,.16)
   a.box('head','hair',0,-.371,.332,.30,.14,.16);a.box('head','hair',0,-.482,.334,.24,.105,.15)
 elif race=='orc':
  core(0,.025,-.03,.775,.62,.68);core(0,-.245,-.015,.84,.17,.64)
  a.box('head','skin',0,-.332,.03,.88 if not female else .83,.13,.72)
  for side in [-1,1]:
   a.prism('head','skin',[(side*.365,-.075),(side*.605,-.01),(side*.66,.17),(side*.405,.115)],-.065,.15)
   a.box('head','fixed',side*.276,-.257,.415,.084,.20,.088,rgb=BONE,angle=-side*.12)
   a.prism('head','fixed',[(side*.231,-.174),(side*.275,-.067),(side*.317,-.186)],.43,.075,rgb=BONE)
  a.box('head','skin',0,-.137,.365,.15,.14,.15)
 elif race=='goblin':
  core(0,.055,-.045,.785,.56,.71)
  a.prism('head','skin',[(-.34,-.165),(.34,-.165),(.22,-.295),(.13,-.355),(-.13,-.355),(-.22,-.295)],-.005,.60,detail='cranium')
  for side in [-1,1]:
   a.prism('head','skin',[(side*.355,-.12),(side*.625,-.045),(side*.925,.13),(side*.645,.225),(side*.38,.13)],-.045,.125)
   a.prism('head','accent',[(side*.45,-.046),(side*.63,.025),(side*.775,.125),(side*.57,.115)],.023,.015)
  a.box('head','skin',0,-.08,.371,.105,.15,.18)
  a.box('head','skin',0,-.155,.478,.135,.14,.18)
  a.box('head','skin',0,-.217,.53,.105,.065,.11)
 elif race in ['catfolk','dogfolk','lizardfolk']:
  core(0,.04,-.025,.70,.59,.63)
  core(0,-.28,-.015,.59 if not female else .55,.14,.58)
  if race=='catfolk':
   for side in [-1,1]:
    a.prism('head','skin',[(side*.17,.28),(side*.43,.27),(side*.38,.66)],-.04,.20)
    a.prism('head','accent',[(side*.23,.34),(side*.36,.33),(side*.345,.54)],.07,.022)
    a.box('head','skin',side*.10,-.21,.36,.19,.13,.14)
    # Layered cheek fur and an inner-ear fold keep the feline silhouette readable.
    for n in range(3):a.prism('head','skin',[(side*.28,-.13-n*.055),(side*(.40-n*.015),-.18-n*.055),(side*.29,-.225-n*.055)],.18,.28)
    a.prism('head','accent',[(side*.27,.35),(side*.36,.37),(side*.35,.47)],.09,.025)
    for n in range(3):a.box('head','fixed',side*(.075+n*.045),-.207-(n%2)*.025,.436,.015,.012,.014,rgb=INK)
    for n in range(2):a.box('head','fixed',side*.29,-.19-n*.06,.373,.24,.012,.018,rgb=BONE,angle=side*(.12-n*.22))
   a.prism('head','fixed',[(-.06,-.143),(.06,-.143),(0,-.193)],.447,.045,rgb=color('A57469'))
   a.box('head','fixed',0,-.219,.437,.013,.045,.014,rgb=INK)
  elif race=='dogfolk':
   for side in [-1,1]:
    a.box('head','skin',side*.42,.02,-.065,.19,.63,.23,angle=side*.14)
    a.box('head','skin',side*.455,-.30,-.015,.19,.16,.22)
    a.box('head','accent',side*.445,-.08,.069,.10,.30,.026,angle=side*.14)
    for n in range(3):a.prism('head','skin',[(side*.31,-.13-n*.055),(side*.405,-.19-n*.055),(side*.315,-.215-n*.055)],.14,.27)
   a.box('head','skin',0,-.24,.405,.39,.20,.25)
   a.box('head','fixed',0,-.175,.555,.21,.065,.06,rgb=INK)
   a.box('head','fixed',-.045,-.157,.587,.055,.018,.012,rgb=color('786A65'))
   for side in [-1,1]:
    a.box('head','skin',side*.12,-.303,.47,.19,.075,.14)
    for n in range(3):a.box('head','fixed',side*(.085+n*.043),-.245-(n%2)*.027,.537,.017,.015,.014,rgb=INK)
   a.box('head','fixed',0,-.301,.548,.17,.015,.013,rgb=INK)
  else:
   a.box('head','skin',0,-.22,.39,.39,.18,.24)
   for side in [-1,1]:
    a.box('head','fixed',side*.17,-.165,.52,.023,.021,.02,rgb=INK)
    # Three overlapping fin rays, scaled cheek plates and swept ivory horns.
    for n in range(3):a.prism('head','accent',[(side*.34,.19-n*.12),(side*(.52-n*.025),.28-n*.15),(side*.365,-.02-n*.12)],-.14,.16)
    for n in range(3):a.prism('head','skin',[(side*.25,-.13-n*.065),(side*.33,-.105-n*.065),(side*.37,-.16-n*.065),(side*.30,-.205-n*.065)],.315,.035)
    a.prism('head','fixed',[(side*.25,.29),(side*.335,.29),(side*.32,.58),(side*.265,.49)],-.14,.09,rgb=BONE)
    a.prism('head','accent',[(side*.26,.12),(side*.30,.17),(side*.35,.11),(side*.30,.045)],.296,.035)
    a.box('head','fixed',side*.175,-.291,.511,.20,.012,.016,rgb=INK)
   for n in range(4):a.prism('head','accent',[(-.08,.30+n*.005),(.08,.30+n*.005),(0,.53 if n<2 else .44)],-.23+n*.12,.08)
   for n in range(4):a.box('head','accent',0,-.275+n*.029,.517,.075,.017,.015)
 elif race=='foxfolk':
  core(0,.05,-.02,.68,.57,.66)
  a.prism('head','skin',[(-.31,-.15),(.31,-.15),(.27,-.30),(.16,-.355),(-.16,-.355),(-.27,-.30)],-.025,.59,detail='cranium')
  for side in [-1,1]:
   a.prism('head','skin',[(side*.15,.275),(side*.41,.28),(side*.36,.83),(side*.225,.63)],-.06,.21)
   a.prism('head','fixed',[(side*.22,.375),(side*.343,.39),(side*.319,.705)],.055,.025,rgb=color('E6C3A0'))
   a.prism('head','skin',[(side*.24,-.11),(side*.41,-.18),(side*.355,-.25),(side*.42,-.30),(side*.24,-.29)],-.01,.55)
   a.box('head','skin',side*.085,-.227,.36,.205,.17,.20)
  a.box('head','skin',0,-.286,.382,.245,.065,.22)
  a.box('head','fixed',0,-.15,.493,.135,.042,.065,rgb=INK)

def arms(a):
 race=a.race;sw=a.fit['shoulder']['upperWidth']
 for side,label in [(1,'left'),(-1,'right')]:
  p=label+'-arm'
  if race in ['human','catfolk','dogfolk','lizardfolk']:
   a.box(p,'outfit',0,-.125,0,sw+.025,.32,.30,'armor');a.box(p,'skin',0,-.382,.005,.205,.22,.22)
  elif race=='elf':
   a.prism(p,'outfit',[(-sw/2,.05),(sw/2,.05),(sw*.46,-.25),(sw*.23,-.34),(-sw*.23,-.34),(-sw*.46,-.25)],-.012,.27,'armor')
   a.box(p,'skin',0,-.415,.012,.17,.22,.19)
  elif race=='dwarf':
   a.box(p,'outfit',0,-.10,-.01,sw+.035,.31,.37,'armor');a.box(p,'outfit',side*.018,-.24,-.005,sw,.13,.335,'armor')
   a.box(p,'skin',0,-.386,.01,.26,.24,.255)
  elif race=='orc':
   a.box(p,'skin',0,-.095,0,sw,.31,.36);a.box(p,'skin',side*.025,-.27,.015,sw*.88,.17,.30)
   a.box(p,'skin',0,-.412,.015,.255 if not a.female else .235,.21,.25)
   a.box(p,'outfit',0,.03,-.018,sw+.04,.15,.36,'armor')
  elif race=='goblin':
   a.box(p,'outfit',0,-.115,-.025,sw,.29,.23,'armor')
   a.box(p,'skin',side*.025,-.31,.008,.145,.16,.165);a.box(p,'skin',side*.012,-.445,.026,.135,.19,.155)
  elif race=='foxfolk':
   a.box(p,'outfit',0,-.12,-.01,sw+.015,.32,.27,'armor');a.box(p,'skin',0,-.395,.015,.195,.255,.21)
   for n in range(2):a.prism(p,'skin',[(side*.065,-.35-n*.075),(side*.145,-.39-n*.075),(side*.095,-.45-n*.075)],-.022,.18)
  a.box(p,'accent',0,-.277,0,sw+.035,.065,.305 if race in ['human','dwarf','orc'] else .25,'armor')
  a.box(p,'leather',0,-.505,.014,.23,.075,.255,'armor')
  # Palm center is deliberately omitted; runtime supplies the common grip fist.
  # Separate knuckles/claws follow the runtime wrist without rotating the forearm.
  if race in ['orc','goblin','foxfolk']:
   for finger in [-1,0,1]:
    width=.049 if race!='goblin' else .041
    a.box(p,'skin',finger*.067,-.67 if race!='goblin' else -.686,.145,width,.058 if race!='goblin' else .087,.06,detail='hand')
    if race in ['orc','foxfolk']:a.box(p,'fixed',finger*.067,-.702,.151,.027,.023,.042,detail='hand',rgb=BONE)
  elif race=='dwarf':
   a.box(p,'skin',0,-.674,.147,.23,.049,.065,detail='hand');a.box(p,'skin',-side*.112,-.602,.11,.065,.11,.075,detail='hand')
  elif race=='elf':a.box(p,'skin',-side*.098,-.615,.126,.045,.092,.06,detail='hand')
  else:a.box(p,'skin',-side*.108,-.608,.12,.055,.095,.072,detail='hand')

def legs(a):
 race=a.race;fit=a.fit;hip=fit['hip']['y'];tw=fit['hip']['thighWidth'];foot=fit['foot'];depth=foot['depth'];fz=foot['front']-depth/2
 for side,label in [(1,'left'),(-1,'right')]:
  p=label+'-leg';knee=-hip*.43
  if race=='elf':
   a.box(p,'outfit',0,-hip*.215,-.005,tw,hip*.48,.235,'legs')
   a.box(p,'outfit',side*.014,knee-.085,-.025,tw*.80,.22,.205,'legs')
   a.box(p,'leather',side*.014,-hip*.72,.01,tw+.015,hip*.41,.25,'shoes')
  elif race=='dwarf':
   a.box(p,'outfit',0,-.155,0,tw,.35,.33,'legs')
   a.box(p,'outfit',side*.022,-hip*.47,.018,tw*.94,.20,.31,'legs')
   a.box(p,'leather',side*.012,-hip+.235,.025,tw+.03,.34,.36,'shoes')
  elif race=='orc':
   a.box(p,'outfit',side*.015,-hip*.23,-.015,tw+.015,hip*.53,.35,'legs')
   a.box(p,'outfit',side*.035,knee-.04,.025,tw*.90,.20,.32,'legs')
   a.box(p,'leather',side*.025,-hip*.74,.025,tw+.025,hip*.38,.36,'shoes')
  elif race=='goblin':
   a.box(p,'outfit',-side*.016,-hip*.23,-.045,tw,hip*.48,.24,'legs',angle=-side*.09)
   a.box(p,'skin',side*.018,-hip*.53,-.005,tw*.72,.18,.19)
   a.box(p,'leather',side*.028,-hip+.21,.035,.225,.25,.29,'shoes')
  elif race=='foxfolk':
   a.box(p,'outfit',-side*.014,-hip*.21,-.035,tw+.025,hip*.45,.31,'legs')
   a.box(p,'skin',side*.015,-hip*.47,-.085,tw*.81,.25,.205)
   a.box(p,'skin',side*.025,-hip*.68,.01,tw*.72,.28,.185)
   a.box(p,'skin',side*.02,-hip+.11,fz,foot['width'],.22,depth)
   for toe in [-1,0,1]:a.box(p,'fixed',side*.02+toe*.09,-hip+.07,foot['front']-.02,.045,.05,.06,rgb=BONE)
  else:
   a.box(p,'outfit',0,-hip*.24,0,tw,hip*.50,.28,'legs')
   a.box(p,'leather',0,-hip*.70,.03,tw+.035,hip*.45,.34,'shoes')
  if race!='foxfolk':
   a.box(p,'leather',0,-hip+.10,fz,foot['width'],.20,depth,'shoes')
   a.box(p,'fixed',0,-hip+.025,fz,foot['width']+.01,.05,depth+.012,'shoes',rgb=color('493B32'))
   a.box(p,'accent',0,-hip+.31,.015,tw+.04,.065,.34 if race in ['human','orc','dwarf'] else .28,'shoes')

def tail(a):
 if a.race in ['catfolk','dogfolk','lizardfolk']:
  for n in range(8):
   width=(.18 if a.race=='catfolk' else .27 if a.race=='dogfolk' else .31)*(1-n/11)
   a.box('tail','skin',math.sin(n*.40)*(.14 if a.race=='catfolk' else .07),n*(.055 if a.race=='catfolk' else .025),-.10-n*.12,width,width,.20)
   if a.race=='lizardfolk':
    a.prism('tail','accent',[(-width*.22,width*.5+n*.025),(width*.22,width*.5+n*.025),(0,width*.5+n*.025+.13*(1-n/10))],-.10-n*.12,.09)
    for side in [-1,1]:a.box('tail','accent',side*width*.48,n*.025,-.10-n*.12,.025,width*.45,.075)
   elif a.race=='catfolk' and n in [2,4,6]:a.box('tail','accent',math.sin(n*.40)*.14,n*.055,-.10-n*.12,width+.01,width+.01,.045)
   elif a.race=='dogfolk':a.prism('tail','skin',[(-width*.4,n*.025),(width*.4,n*.025),(0,n*.025+width*.85)],-.10-n*.12,.12)
  return
 if a.race!='foxfolk':return
 a.box('tail','skin',0,.015,-.085,.19,.21,.20)
 for index in range(5):a.box('tail','skin',0,.04+index*.046,-.17-index*.123,.265 if index in [1,2,3] else .23,.25,.24)
 a.box('tail','fixed',0,.275,-.79,.21,.205,.21,rgb=BONE)
 a.box('tail','fixed',0,.34,-.85,.145,.11,.15,rgb=BONE)

roots={}
for key,profile in PROFILES.items():
 a=Anatomy(profile);torso(a);head(a);arms(a);legs(a);tail(a);roots[key]=a.finish()
for path in [EXPORT.parent,SOURCE.parent]:path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
 with tempfile.TemporaryDirectory(prefix='mossvale-race-') as temporary:
  dedup=str(Path(temporary)/'dedup.glb')
  for command in [['dedup',str(EXPORT),dedup],['prune',dedup,str(EXPORT)]]:subprocess.run(['npx','--yes','@gltf-transform/cli@4.5.0']+command,check=True)

# Preview uses the assembled exported anatomy plus the same live hair/face library.
reference=bpy.data.scenes.new('Existing hair and expressions - gallery references');bpy.context.window.scene=reference
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/customization-kit.glb'))
references={obj.name:obj for obj in reference.objects if not obj.parent}
gallery=bpy.data.scenes.new('Nine races - authored male and female bodies');bpy.context.window.scene=gallery
def preview_material(hexcode):
 name='Preview '+hexcode;mat=bpy.data.materials.get(name)
 if not mat:
  mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color(hexcode);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.88
 return mat
def clone_tree(source,parent,palette):
 obj=source.copy();obj.data=source.data;gallery.collection.objects.link(obj);obj.parent=parent
 if obj.type=='MESH' and obj.get('tint') not in [None,'fixed']:
  obj.material_slots[0].link='OBJECT';obj.material_slots[0].material=preview_material(palette.get(obj['tint'],palette['hair']))
 for child in source.children:clone_tree(child,obj,palette)
 return obj
def preview_box(parent,at,size,hexcode):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*at));obj=bpy.context.object;obj.parent=parent;obj.scale=(size[0],size[2],size[1]);obj.data.materials.append(preview_material(hexcode));return obj
def label(text,at,size=.14):
 curve=bpy.data.curves.new(text,'FONT');curve.body=text;curve.align_x='CENTER';curve.size=size
 obj=bpy.data.objects.new(text,curve);gallery.collection.objects.link(obj);obj.location=xyz(*at);obj.rotation_euler=(math.pi/2,0,0);curve.materials.append(preview_material('E2D9BC'))
palettes={
 'human':{'skin':'DCA67F','hair':'49362B','outfit':'607E65','accent':'D5B16B','leather':'76533E'},
 'elf':{'skin':'D6B794','hair':'AE9567','outfit':'527C70','accent':'D4BC82','leather':'695844'},
 'dwarf':{'skin':'BA876A','hair':'76503C','outfit':'7C6452','accent':'D4AC63','leather':'664A36'},
 'orc':{'skin':'73966A','hair':'493D34','outfit':'866654','accent':'C6A769','leather':'624A3D'},
 'goblin':{'skin':'99AE71','hair':'575241','outfit':'697A62','accent':'CBB67D','leather':'746043'},
 'foxfolk':{'skin':'BE895E','hair':'815437','outfit':'698074','accent':'D3B57A','leather':'6D513F'},
}
for race,skin in [('catfolk','B0AAA0'),('dogfolk','BA8659'),('lizardfolk','83A677')]:
 palettes[race]={**palettes['human'],'skin':skin}
hairs={'human':['swept','bob'],'elf':['sidecut','long'],'dwarf':['sidecut','braids'],'orc':['mohawk','ponytail'],'goblin':['pixie','sidecut'],'foxfolk':['spiky','ponytail']}
for race in ['catfolk','dogfolk','lizardfolk']:hairs[race]=['undercut','twin-buns']
for index,(key,root) in enumerate(roots.items()):
 profile=PROFILES[key];race=profile['race'];gender=profile['gender'];palette=palettes[race]
 column=(index//2)%5;row=(index//10)*2+index%2;at=((column-(2 if index<10 else 1.5))*2.02,(3-row)*3.3,0)
 preview=clone_tree(root,None,palette);preview.location=xyz(*at);preview.rotation_mode='XYZ';preview.rotation_euler[2]=math.radians(-16)
 head_part=next(child for child in preview.children if child.get('part')=='head')
 for side in [-1,1]:
  preview_box(head_part,(side*.155,-.045,.322),(.105,.13,.028),'26333E');preview_box(head_part,(side*.155-.018,-.01,.341),(.036,.04,.014),'FFF4D9')
 clone_tree(references['hair-'+hairs[race][row%2]],head_part,palette);clone_tree(references['face-calm'],head_part,palette)
 for arm in [child for child in preview.children if child.get('part') in ['left-arm','right-arm']]:preview_box(arm,(0,-.625,.04),(.22,.15,.23),palette['skin'])
 label(race.upper()+'  /  '+gender.upper(),(at[0],at[1]-.33,.4),.13)
 preview_box(None,(at[0],at[1]-.035,-.015),(1.75,.06,1.25),'354E46')
label('MOSSVALE  /  EIGHTEEN AUTHORED RACE ANATOMIES',(0,13.35,.4),.24)
label('Distinct heads, torsos, limbs and paws. Every exported joint has unit scale.',(0,-.91,.4),.14)
preview_box(None,(0,2.75,-1.15),(200,200,.08),'24372F')
gallery.render.engine='CYCLES';gallery.cycles.samples=28;gallery.cycles.use_denoising=True
gallery.render.resolution_x=3000;gallery.render.resolution_y=2100;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.view_settings.view_transform='AgX'
gallery.world=bpy.data.worlds.new('Race gallery world');gallery.world.use_nodes=True;gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.15,.20,.17,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
for at,power,size in [((-5,9,8),1850,7),((7,5,6),1500,6),((0,0,5),500,5)]:
 bpy.ops.object.light_add(type='AREA',location=xyz(*at));lamp=bpy.context.object;lamp.data.energy=power;lamp.data.size=size;lamp.rotation_euler=(Vector(xyz(0,6.3,0))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(0,7.4,26));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=22;camera.rotation_euler=(Vector(xyz(0,6.3,0))-camera.location).to_track_quat('-Z','Y').to_euler();gallery.camera=camera
gallery.render.filepath=str(PREVIEW);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('RACE_KIT',json.dumps({'roots':len(roots),'meshes':sum(obj.type=='MESH' for obj in library.objects),'bytes':EXPORT.stat().st_size,'source':str(SOURCE)}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
