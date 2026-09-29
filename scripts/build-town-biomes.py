"""Five original Mossvale town decoration sets, made in Blender.
Blender --background --python scripts/build-town-biomes.py -- --render
Metres, Y up, +Z front, ground origin. Two shared vertex palettes, no textures.
"""
import bpy, json, math, struct, sys
from pathlib import Path
from mathutils import Vector, Euler
ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/town-biomes.glb'
SOURCE=ROOT/'assets/source/town-biomes.blend'
PREVIEW=ROOT/'assets/source/town-biomes-preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
library=bpy.context.scene;library.name='Mossvale five town biome library';library.unit_settings.system='METRIC'
library.render.fps=30;library.frame_start=0;library.frame_end=240

def xyz(x,y,z):return (x,-z,y)
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
HEX={'oak':'78503A','wood':'AD794A','bark':'433831','stone':'6F787C','dark':'273E45','cream':'F4DDAD',
 'copper':'BA653C','bronze':'804B32','gold':'E6AF43','honey':'FFD673','rust':'C94C2C','amber':'F3A43C',
 'ice':'80C6D8','icebright':'D8F9FA','blue':'4086AE','slate':'466278','snow':'EEF9F5','silver':'B9D7D9',
 'root':'544159','rootlight':'84627C','violet':'9D79BC','purple':'533669','lilac':'D7ADE7','moss':'667E5D',
 'sand':'D3AD6F','sandlight':'F3D697','sanddark':'947049','teal':'247F87','turquoise':'51C4B3',
 'bamboo':'A2AF5B','bamboolight':'D8CA80','jade':'247963','leaf':'438845','leaflight':'8ABB56','leafdark':'234E3F',
 'flower':'D775A5','petal':'F5B1C8','water':'368AA5','waterlight':'8CE2DE','soil':'44392F'}
PAL={k:tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,) for k,h in HEX.items()}
mats=[]
for glow in [False,True]:
 mat=bpy.data.materials.new('Town shared '+('lantern glow' if glow else 'voxel palette'));mat.use_nodes=True
 shader=mat.node_tree.nodes['Principled BSDF'];shader.inputs['Roughness'].default_value=.68 if glow else .82
 tint=mat.node_tree.nodes.new('ShaderNodeVertexColor');tint.layer_name='TownTint';mat.node_tree.links.new(tint.outputs['Color'],shader.inputs['Base Color'])
 if glow:
  shader.inputs['Emission Color'].default_value=(.45,.9,.8,1);shader.inputs['Emission Strength'].default_value=1.25
 mats.append(mat)
roots={};metrics={};animated={}

# The frontier builder's merged vertex-color boxes, square beams and faceted leaves.
class Model:
 def __init__(self,zone,kind,footprint):
  self.name=f'town-{zone}-{kind}';self.zone=zone;self.kind=kind;self.footprint=footprint;self.parts={};self.part('body')
 def part(self,name,pivot=(0,0,0)):
  self.current=self.parts.setdefault(name,{'vertices':[],'faces':[],'colors':[],'materials':[],'pivot':pivot})
 def poly(self,tint,vertices,faces,glow=False):
  p=self.current;n=len(p['vertices']);px,py,pz=p['pivot'];p['vertices'] += [xyz(x-px,y-py,z-pz) for x,y,z in vertices]
  p['faces'] += [tuple(n+i for i in f) for f in faces];p['colors'] += [PAL[tint]]*len(faces);p['materials'] += [int(glow)]*len(faces)
 def box(self,t,x,y,z,w,h,d,turn=0,glow=False):
  c,s=math.cos(turn),math.sin(turn)
  self.poly(t,[(x+a*w/2*c+k*d/2*s,y+b*h/2,z-a*w/2*s+k*d/2*c) for a,b,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],glow)
 def beam(self,t,start,end,width,depth=None):
  a,b=Vector(start),Vector(end);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
  if u.length<.01:u=axis.cross(Vector((1,0,0)))
  u.normalize();v=axis.cross(u).normalized();depth=depth or width
  self.poly(t,[tuple(p+u*i*width/2+v*j*depth/2) for p in (a,b) for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
 def column(self,t,x,y,z,r,h,sides=8):
  vertices=[(x+math.cos(i*math.tau/sides+math.pi/8)*r,y+dy,z+math.sin(i*math.tau/sides+math.pi/8)*r) for dy in [-h/2,h/2] for i in range(sides)]
  self.poly(t,vertices,[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)])
 def gem(self,t,x,y,z,w,h,d,glow=False):
  self.poly(t,[(x,y-h/2,z),(x,y+h/2,z),(x-w/2,y-h*.18,z),(x,y-h*.18,z-d/2),(x+w/2,y-h*.18,z),(x,y-h*.18,z+d/2)],[(0,3,2),(0,4,3),(0,5,4),(0,2,5),(1,2,3),(1,3,4),(1,4,5),(1,5,2)],glow)
 def leaf(self,t,start,end,width):
  a,b=Vector(start),Vector(end);along=b-a;side=Vector((-along.z,0,along.x))
  if side.length<.01:side=Vector((1,0,0))
  side.normalize();side*=width/2;centre=a+along*.48;lift=Vector((0,width*.16,0))
  self.poly(t,[tuple(a),tuple(centre+side),tuple(b),tuple(centre-side),tuple(centre+lift),tuple(centre-lift*.4)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)])
 def ring(self,t,centre,r,width,plane='xz',steps=20):
  x,y,z=centre
  def p(a):return (x+r*math.cos(a),y+r*math.sin(a),z) if plane=='xy' else (x,y+r*math.cos(a),z+r*math.sin(a)) if plane=='yz' else (x+r*math.cos(a),y,z+r*math.sin(a))
  for i in range(steps):self.beam(t,p(i*math.tau/steps),p((i+1)*math.tau/steps),width)
 def finish(self):
  parent=bpy.data.objects.new(self.name,None);library.collection.objects.link(parent);parent['width'],parent['depth']=self.footprint
  parent['contract']='Metres; Y up; +Z front; ground origin. Preserve child transforms and zone-prefixed clips.';parent['biome']=self.zone;parent['assetKind']=self.kind
  if self.kind=='landmark':parent['animationClip']=f'town-{self.zone}-ambient';parent['loopSeconds']=8
  count=0;objects={}
  for name,p in self.parts.items():
   if not p['faces']:continue
   mesh=bpy.data.meshes.new(self.name+'-'+name);mesh.from_pydata(p['vertices'],[],p['faces']);mesh.update()
   for mat in mats:mesh.materials.append(mat)
   tint=mesh.color_attributes.new(name='TownTint',type='BYTE_COLOR',domain='CORNER')
   for face,col,index in zip(mesh.polygons,p['colors'],p['materials']):
    face.material_index=index
    for loop in face.loop_indices:tint.data[loop].color=col
   obj=bpy.data.objects.new(mesh.name,mesh);library.collection.objects.link(obj);obj.parent=parent;obj.location=xyz(*p['pivot']);obj['part']=name;objects[name]=obj
   if name=='water':obj['collision']='water'
   count+=sum(len(f)-2 for f in p['faces'])
  parent['triangles']=count;roots[self.name]=parent;metrics[self.name]={'triangles':count,'meshes':len(objects),'footprint':self.footprint};return objects

def animate(obj,zone,rotation=None,bob=0,breath=0):
 # Moving clockwork, floating crystals and petals decorate fixed solid supports.
 obj['collision']='effect';obj['collisionReason']='Animated visual ornament; fixed landmark supports remain solid.'
 base=obj.location.copy();previous=None
 for frame in range(0,241,15):
  t=frame/240;a=t*math.tau
  e=[v*a for v in rotation] if rotation else [0,0,0]
  basis=Euler((math.pi/2,0,0)).to_matrix();obj.rotation_euler=(basis@Euler(e).to_matrix()@basis.transposed()).to_euler()
  obj.location=base+Vector(xyz(0,bob*math.sin(a),0));obj.scale=(1+breath*math.sin(a),)*3
  # Quaternions retain continuous full turns across the Euler wrap during export.
  quaternion=(basis@Euler(e).to_matrix()@basis.transposed()).to_quaternion()
  if previous is not None:quaternion.make_compatible(previous)
  previous=quaternion.copy();obj.rotation_mode='QUATERNION';obj.rotation_quaternion=quaternion
  for path in ['rotation_quaternion','location','scale']:obj.keyframe_insert(data_path=path,frame=frame)
 action=obj.animation_data.action;clip=f'town-{zone}-ambient';action.name=clip+'-'+obj.name
 for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
 track=obj.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,0,action).extrapolation='NOTHING';obj.animation_data.action=None
 animated[obj.name]=clip

def base(m,stone,accent,water=None):
 m.column(stone,0,.15,0,2.8,.30);m.column(accent,0,.36,0,2.54,.12);m.column(stone,0,.53,0,2.37,.22)
 if water:
  m.part('water' if water=='water' else 'body');m.column(water,0,.66,0,2.06,.06,16);m.part('body')
 for i in range(12):
  a=i*math.tau/12;m.box(accent,2.49*math.cos(a),.34,2.49*math.sin(a),.28,.18,.24,a)

def blossom(m,x,y,z,size=1,t='flower'):
 for i in range(5):
  a=i*math.tau/5;m.leaf(t,(x,y,z),(x+math.cos(a)*.42*size,y+.10*size,z+math.sin(a)*.42*size),.40*size)
 m.gem('honey',x,y+.10*size,z,.24*size,.22*size,.24*size)

# Amberwild: a copper harvest windmill, its six gilt leaf sails turning above grain bundles.
m=Model('amberwild','landmark',(6,6));base(m,'bronze','copper');b=m.box
b('oak',0,2.30,-.25,1.35,3.30,1.2)
for y in [1.1,1.65,2.2,2.75,3.3]:b('copper',0,y,.37,1.5,.14,.15)
for side in [-1,1]:
 m.beam('wood',(side*1.6,.64,0),(side*.35,3.85,0),.27)
 for y in [1,1.4,1.8]:b('honey',side*1.3,y,-.2,.50,.35,.62)
 for i in range(5):m.beam('gold',(side*1.3+(i-2)*.1,.64,-.2),(side*1.3+(i-2)*.17,2.05,-.2),.07)
 b('oak',side*1.3,1.3,-.2,.69,.12,.69)
for i in range(5):b('rust' if i%2 else 'copper',0,3.65+i*.18,-.25,2.1-i*.36,.19,1.65)
m.column('gold',0,.81,1.45,.57,.28)
for i in range(6):m.gem('amber',math.cos(i)*.30,1.12,1.45+math.sin(i)*.3,.36,.46,.36)
pivot=(0,4.2,.8);m.part('rotor',pivot)
m.ring('bronze',pivot,.50,.13,'xy',12);m.gem('gold',0,4.2,.8,.85,.95,.35)
for i in range(6):
 a=i*math.tau/6;end=(math.cos(a)*2.35,4.2+math.sin(a)*2.35,.8);m.beam('gold',pivot,end,.13)
 # Stepped copper leaves make wide, unmistakable voxel sails.
 for j,width in enumerate([.38,.67,.89,.91,.7,.38]):
  r=.8+j*.25;cx,cy=math.cos(a)*r,4.2+math.sin(a)*r
  m.beam('amber' if (i+j)%3==0 else 'copper',(cx-math.sin(a)*width/2,cy+math.cos(a)*width/2,.8),(cx+math.sin(a)*width/2,cy-math.cos(a)*width/2,.8),.24,.105)
objects=m.finish();animate(objects['rotor'],'amberwild',(0,0,1))

# Frostmarch: a brass-banded crystal orrery with counter-rotating frost satellites.
m=Model('frostmarch','landmark',(6,6));base(m,'slate','silver','ice');b=m.box
for side in [-1,1]:
 m.gem('blue',side*1.9,1.5,0,.9,2.0,.9);m.gem('icebright',side*1.9,1.65,0,.65,2.45,.65)
 m.beam('silver',(side*1.9,2.6,0),(side*.95,3.3,0),.16)
for i in range(8):
 a=i*math.tau/8;m.gem('ice' if i%2 else 'snow',math.cos(a)*1.55,1.02,math.sin(a)*1.55,.48,.85,.45)
m.column('slate',0,1.28,0,.65,1.18);m.ring('silver',(0,1.85,0),.76,.14)
m.gem('blue',0,3.45,0,1.2,3.1,1.15);m.gem('icebright',-.18,3.6,.15,.58,3.65,.50,True)
m.part('orbit',(0,4,0));m.ring('silver',(0,4,0),2.15,.12,'xz',24)
for i in range(4):
 a=i*math.tau/4;m.gem('ice',2.15*math.cos(a),4.35,2.15*math.sin(a),.5,1.1,.5);m.box('gold',2.15*math.cos(a),3.99,2.15*math.sin(a),.32,.12,.32)
m.part('inner-orbit',(0,4,0));m.ring('blue',(0,4,0),1.76,.15,'xy',24)
for side in [-1,1]:m.gem('icebright',side*1.76,4,0,.42,.8,.42,True)
objects=m.finish();animate(objects['orbit'],'frostmarch',(0,1,0));animate(objects['inner-orbit'],'frostmarch',(0,-1,0))

# Hollow: entwined old roots cradle a living lantern; fungi and violet leaves catch its light.
m=Model('hollow','landmark',(6,6));base(m,'root','violet');b=m.box
for side in [-1,1]:
 points=[(side*2.05,.6,.1),(side*1.9,1.6,-.15),(side*1.7,2.9,-.30),(side*1.5,4.2,-.22),(side*1.0,5.55,0),(side*.25,6.35,.08)]
 for i,(a,c) in enumerate(zip(points,points[1:])):m.beam('rootlight' if i%3==1 else 'root',a,c,.65-i*.065,.6-i*.055)
 for i in range(4):m.beam('root',(side*(1.3+i*.28),.65,.1),(side*(1.2+i*.28),.64,1.2-i*.25),.30)
 m.beam('rootlight',(side*1.4,4.4,-.2),(side*2.2,5.4,-.55),.19)
 for i in range(3):m.leaf('violet' if i%2 else 'lilac',(side*1.15,5.5,-.1),(side*(1.9+i*.18),5.65-i*.3,.20+i*.3),.8)
for i in range(4):m.box('gold',0,5.55+i*.18,.08,.12,.14,.13)
for i,(x,z) in enumerate([(-1.6,1.1),(1.5,1.0),(-.9,-1.4)]):
 b('cream',x,.93,z,.15,.6,.15);m.column('violet',x,1.23,z,.39,.17);m.gem('lilac',x,1.35,z,.18,.17,.18,True)
m.part('lantern',(0,4,.08));m.gem('lilac',0,4,.08,1.18,1.65,1.18,True)
for y in [3.18,4.80]:m.column('gold',0,y,.08,.56,.15)
for i in range(6):
 a=i*math.tau/6;m.beam('rootlight',(.54*math.cos(a),3.24,.08+.54*math.sin(a)),(.54*math.cos(a),4.74,.08+.54*math.sin(a)),.075)
m.gem('honey',0,3.03,.08,.32,.35,.32,True)
objects=m.finish();animate(objects['lantern'],'hollow',None,.16,.055)

# Sunveil: carved sandstone and turquoise tiles support nested copper sun windcatchers.
m=Model('sunveil','landmark',(6,6));base(m,'sand','teal');b=m.box
for y,w in [(.9,1.6),(1.3,1.25),(1.8,1.0),(2.3,.8)]:b('sandlight',0,y,0,w,.48,w)
for side in [-1,1]:
 m.column('sanddark',side*1.45,1.4,0,.25,1.5);m.column('gold',side*1.45,2.2,0,.36,.12)
 m.beam('copper',(side*1.45,2.3,0),(side*.50,3.1,0),.21)
 for z in [-1.25,1.25]:b('teal',side*1.4,.65,z,.55,.10,.55)
for i in range(8):m.box('gold',0,2.75+i*.25,0,.32,.28,.32)
m.part('vane',(0,4.6,0));m.ring('copper',(0,4.6,0),2.04,.20,'xy',24)
for i in range(12):
 a=i*math.tau/12;x,y=math.cos(a)*2.2,4.6+math.sin(a)*2.2;m.gem('gold',x,y,0,.24,.40,.21)
for side in [-1,1]:m.beam('teal',(side*1.3,3.3,0),(side*1.3,5.9,0),.10)
m.part('inner-vane',(0,4.6,0));m.ring('gold',(0,4.6,0),1.26,.13,'xy',16)
m.gem('honey',0,4.6,0,1.28,1.65,.6,True)
for i in range(8):
 a=i*math.tau/8;m.beam('copper',(math.cos(a)*.65,4.6+math.sin(a)*.65,0),(math.cos(a)*1.3,4.6+math.sin(a)*1.3,0),.12)
objects=m.finish();animate(objects['vane'],'sunveil',(0,1,0));animate(objects['inner-vane'],'sunveil',(0,-2,0))

# Mistwood: a bamboo waterwheel beneath an orchid canopy, above a jade pool.
m=Model('mistwood','landmark',(6,6));base(m,'jade','bamboo','water');b=m.box
for side in [-1,1]:
 for i in range(10):
  y=.9+i*.52;b('bamboo',side*2.04,y,-.28,.28,.52,.28);b('bamboolight',side*2.04,y+.19,-.28,.35,.075,.35)
 m.beam('leafdark',(side*2.1,5.6,-.2),(side*.3,6.45,0),.25)
 m.leaf('leaflight',(side*.2,6.5,0),(side*2.55,5.95,0),1.15)
 for j in range(3):m.leaf('leaf',(side*.1,6.15,-.1),(side*(1.0+j*.56),5.72,-1.30+j*.35),.90)
m.part('water')
for i in range(6):b('waterlight',1.78,5.20-i*.27,.35,.13,.18,.12)
m.part('body')
b('bamboo',1.6,5.45,-.15,1.0,.15,.32)
for x,z in [(-1.3,1.0),(1.35,1.15)]:blossom(m,x,.91,z,.85)
m.part('waterwheel',(0,3.25,.28));m.ring('oak',(0,3.25,.28),1.78,.17,'xy',20);m.ring('bamboolight',(0,3.25,.49),1.66,.10,'xy',20)
for i in range(12):
 a=i*math.tau/12;m.beam('bamboo',(0,3.25,.28),(1.88*math.cos(a),3.25+1.88*math.sin(a),.28),.10)
 x,y=1.84*math.cos(a),3.25+1.84*math.sin(a);m.beam('wood',(x-math.sin(a)*.29,y+math.cos(a)*.29,.28),(x+math.sin(a)*.29,y-math.cos(a)*.29,.28),.22,.65)
m.gem('jade',0,3.25,.56,.58,.65,.28)
m.part('flower',(0,6.62,0));blossom(m,0,6.62,0,1.9,'petal');m.gem('honey',0,6.91,0,.4,.46,.4,True)
objects=m.finish();animate(objects['waterwheel'],'mistwood',(0,0,-1));animate(objects['flower'],'mistwood',(0,1,0),.045)

# Three matching decorations per biome. All low geometry fits the existing collision footprint.
for zone in ['amberwild','frostmarch','hollow','sunveil','mistwood']:
 m=Model(zone,'tree',(3,3));b=m.box
 if zone=='amberwild':
  b('bark',0,.10,0,.66,.20,.66);m.beam('bark',(0,.10,0),(.18,3.9,0),.64)
  for i,(x,z) in enumerate([(-1.1,-.5),(.9,-.7),(0,1.0)]):
   m.beam('oak',(.1,2.5,0),(x,4.0,z),.26)
   for j in range(3):b(['rust','amber','honey'][(i+j)%3],x+(j-1)*.27,4.25+j*.33,z,1.7-j*.3,.73,1.65-j*.2)
  for i in range(5):b('amber',-.8+i*.4,.07,((i%2)*2-1)*.45,.25,.1,.28)
 elif zone=='frostmarch':
  b('slate',0,1.65,0,.52,3.3,.52)
  for i in range(6):
   w=3.7-i*.5;y=2.85+i*.55;b('blue',0,y,0,w,.52,w*.72);b('ice',0,y,0,w*.72,.52,w);b('snow',0,y+.29,0,w*.92,.12,w*.70)
  m.gem('icebright',0,6.10,0,.65,1.10,.65)
 elif zone=='hollow':
  for side in [-1,1]:
   b('root',side*.45,.075,0,.38,.15,.38)
   points=[(side*.45,.15,0),(side*.10,1.2,.15),(side*.46,2.4,-.15),(side*1.05,3.55,.1),(side*1.55,4.6,-.15)]
   for a,c in zip(points,points[1:]):m.beam('rootlight' if side==1 else 'root',a,c,.35)
   for j in range(3):m.leaf('purple' if j==0 else 'violet',(side*.9,3.6,.1),(side*(1.6-j*.3),4.2+j*.3,(j-1)*.75),1.15)
   m.gem('lilac',side*.9,3.3,.1,.22,.40,.22,True)
  for x in [-.6,.6]:m.beam('root',(x,.15,.8),(0,.4,0),.20)
 elif zone=='sunveil':
  for i in range(10):
   x=.2*math.sin(i*.2);b('sanddark' if i%2 else 'wood',x,.25+i*.5,0,.47,.5,.47);b('bamboolight',x,.40+i*.5,0,.51,.10,.51)
  for i in range(9):
   a=i*math.tau/9;start=(.2,5.05,0);middle=(math.cos(a)*1.05,5.6,math.sin(a)*1.05);end=(math.cos(a)*2.15,4.6,math.sin(a)*2.15)
   m.beam('gold',start,middle,.07);m.leaf('teal' if i%3 else 'leaflight',middle,end,.80)
  for x,z in [(-.35,0),(.30,.27),(.15,-.3)]:m.gem('copper',x,4.75,z,.35,.60,.35)
 else:
  for i,(x,z) in enumerate([(-.42,0),(.4,.15),(0,-.35)]):
   for j in range(8+i):b('bamboo',x,.23+j*.48,z,.22,.46,.22);b('bamboolight',x,.44+j*.48,z,.27,.05,.27)
  for i in range(8):
   a=i*math.tau/8;m.leaf('leaflight' if i%3==0 else 'jade',(.2,4.2,0),(math.cos(a)*2.1,3.3+(i%3)*.4,math.sin(a)*2.1),1.25)
  for x,z in [(-.8,.6),(.6,.5)]:blossom(m,x,3.62,z,.8)
 m.finish()

 m=Model(zone,'planter',(2.4,1.2));b=m.box
 tone,trim={'amberwild':('oak','copper'),'frostmarch':('slate','silver'),'hollow':('root','violet'),'sunveil':('sand','teal'),'mistwood':('jade','bamboo')}[zone]
 b(tone,0,.32,0,2.22,.64,1.04);b(trim,0,.10,0,2.36,.13,1.17);b(trim,0,.66,0,2.36,.16,1.17);b('soil',0,.755,0,1.99,.04,.80)
 for x in [-.75,0,.75]:
  if zone=='amberwild':
   for j in range(3):m.beam('gold',(x+(j-1)*.12,.74,0),(x+(j-1)*.15,1.35+(j%2)*.15,0),.055);m.gem('honey',x+(j-1)*.15,1.4+(j%2)*.15,0,.16,.3,.13)
  elif zone=='frostmarch':m.gem('ice',x,1.02,0,.36,.66,.34);m.gem('icebright',x+.11,1.23,.05,.19,.65,.20)
  elif zone=='hollow':
   b('cream',x,.96,0,.09,.40,.09);m.column('violet',x,1.19,0,.23,.11);m.gem('lilac',x,1.26,0,.13,.12,.13,True)
  elif zone=='sunveil':
   b('teal',x,1.03,0,.25,.57,.25)
   for side in [-1,1]:m.beam('turquoise',(x,1.0,0),(x+side*.21,1.20,0),.12)
   m.gem('gold',x,1.36,0,.20,.18,.20)
  else:
   for j in range(4):a=j*math.tau/4;m.leaf('leaflight', (x,.76,0),(x+math.cos(a)*.25,1.06,math.sin(a)*.25),.22)
   blossom(m,x,1.1,0,.55)
 m.finish()

 m=Model(zone,'statue',(2.8,2.8));b=m.box
 m.column(tone,0,.17,0,1.30,.34);m.column(trim,0,.40,0,1.12,.14);m.column(tone,0,.61,0,.90,.28)
 if zone=='amberwild':
  # Copper orchard owl, leaf-shaped wings and luminous amber eyes.
  b('copper',0,1.75,0,1.0,1.55,.74);b('gold',0,2.72,.02,1.15,.65,.8)
  for side in [-1,1]:
   m.gem('bronze',side*.42,3.17,0,.25,.5,.35);m.gem('honey',side*.28,2.78,.43,.27,.29,.09,True)
   m.beam('amber',(side*.45,2.38,0),(side*.95,1.35,.05),.34,.16)
   for j in range(3):m.beam('gold',(side*.50,2.1-j*.23,.12),(side*.8,1.7-j*.18,.12),.11)
  m.gem('cream',0,2.5,.46,.24,.30,.25);b('bronze',0,1.00,.25,.7,.17,.65)
 elif zone=='frostmarch':
  m.gem('blue',0,1.75,0,.95,2.4,.85);m.gem('icebright',-.11,2.2,.15,.53,2.8,.5,True)
  m.ring('silver',(0,2.0,0),.90,.10,'xy',16)
  for side in [-1,1]:m.gem('ice',side*.77,1.0,.2,.44,.85,.38)
 elif zone=='hollow':
  b('root',0,1.45,0,.78,1.5,.73);m.gem('purple',0,2.70,0,1.1,1.5,.8);b('dark',0,2.75,.41,.51,.52,.05)
  for side in [-1,1]:m.beam('rootlight',(side*.3,2.3,0),(side*.58,1.6,.5),.23)
  m.gem('lilac',0,1.85,.66,.49,.77,.39,True)
  for i in range(4):m.beam('root',(0,.78,0),(math.cos(i*math.pi/2)*.95,.60,math.sin(i*math.pi/2)*.95),.20)
 elif zone=='sunveil':
  b('sandlight',0,1.48,0,.60,1.58,.62)
  for y in [1.0,1.35,1.70,2.05]:b('teal',0,y,.321,.30,.16,.05)
  m.ring('copper',(0,2.78,0),.79,.18,'xy',16);m.gem('honey',0,2.78,0,.56,.76,.38,True)
  for i in range(8):a=i*math.tau/8;m.beam('gold',(.87*math.cos(a),2.78+.87*math.sin(a),0),(1.05*math.cos(a),2.78+1.05*math.sin(a),0),.14)
 else:
  # Jade heron with a long curved neck, folded wing relief and reed legs.
  for x in [-.22,.20]:m.beam('bamboolight',(x,.75,0),(x,1.7,.03),.11)
  m.gem('jade',0,2.10,0,1.22,1.1,.77);m.beam('jade',(.22,2.25,0),(.57,2.75,0),.25);m.beam('jade',(.57,2.75,0),(.38,3.30,0),.22)
  b('leaflight',.38,3.38,0,.52,.32,.35);m.beam('gold',(.59,3.38,0),(1.07,3.22,0),.13)
  for i in range(4):m.beam('turquoise',(-.45+i*.15,2.26,.33),(-.12+i*.15,1.78,.33),.085)
  m.gem('gold',.48,3.44,.19,.075,.075,.035);blossom(m,-.65,.80,.3,.65)
 m.finish()

# Export only the authored library; retain one small looping clip per town.
for p in [EXPORT.parent,SOURCE.parent]:p.mkdir(parents=True,exist_ok=True)
library.frame_set(0);bpy.context.view_layer.update();bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,
 export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_force_sampling=True,
 export_cameras=False,export_lights=False,export_extras=True)
raw=EXPORT.read_bytes();size,kind=struct.unpack_from('<II',raw,12);gltf=json.loads(raw[20:20+size])
clips=[{'name':a['name'],'channels':len(a['channels'])} for a in gltf.get('animations',[])]
assert len(roots)==20 and len(clips)==5,clips
assert all(name.startswith('town-') for name in animated)
assert sum(v['triangles'] for v in metrics.values())<50000
assert all(v['triangles']<6000 for name,v in metrics.items() if name.endswith('-landmark'))
assert EXPORT.stat().st_size<=2_000_000,EXPORT.stat().st_size

# Reimport the actual deliverable into a separate Blender scene for the review render.
gallery=bpy.data.scenes.new('Five towns exported GLB overview');bpy.context.window.scene=gallery
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(EXPORT));imported=set(bpy.data.objects)-before
models={name:next(obj for obj in imported if obj.name.split('.')[0]==name) for name in roots}
for obj in imported:
 if obj.animation_data:obj.animation_data_clear()
for index,zone in enumerate(['amberwild','frostmarch','hollow','sunveil','mistwood']):
 x=(index-2)*8.3
 for kind,at,scale in [('landmark',(x,0,-1.3),1),('tree',(x+1.9,0,4.7),.63),('statue',(x-.5,0,4.6),.76),('planter',(x-2.5,0,4.75),1)]:
  obj=models[f'town-{zone}-{kind}'];obj.location=xyz(*at);obj.scale=(scale,)*3
 # Subtle separate plinths keep each collection visually grouped.
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(x,-.22,1.0));plinth=bpy.context.object;plinth.name='Review plinth '+zone;plinth.scale=(7.6,10,.4)
 mat=bpy.data.materials.new('Review stone '+zone);mat.diffuse_color=tuple(v*.25 for v in PAL[{'amberwild':'copper','frostmarch':'blue','hollow':'violet','sunveil':'sand','mistwood':'jade'}[zone]][:3])+(1,);plinth.data.materials.append(mat)
 text=bpy.data.curves.new('Review caption '+zone,'FONT');text.body={'amberwild':'AMBERWILD','frostmarch':'FROSTMARCH','hollow':'HOLLOW','sunveil':'SUNVEIL','mistwood':'MISTWOOD'}[zone];text.align_x='CENTER';text.size=.46;text.extrude=.005
 obj=bpy.data.objects.new(text.name,text);gallery.collection.objects.link(obj);obj.location=xyz(x,.04,7.0);obj.rotation_euler=(0,0,0)
 labelmat=bpy.data.materials.get('Review captions')
 if not labelmat:labelmat=bpy.data.materials.new('Review captions');labelmat.diffuse_color=(.85,.85,.74,1)
 obj.data.materials.append(labelmat)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(13,25,38));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=46;aim(camera,(0,2,1));gallery.camera=camera
for name,at,power,size,color in [('Warm key',(-10,18,10),6000,20,(1,.83,.65)),('Cool rim',(5,13,-8),5000,18,(.58,.82,1))]:
 bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.name=name;light.data.energy=power;light.data.size=size;light.data.color=color;aim(light,(0,2,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-15,18,10));sun=bpy.context.object;sun.data.energy=1.8;sun.data.angle=.25;aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('Midnight museum');gallery.world.use_nodes=True;gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.055,.075,.085,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
gallery.render.resolution_x=2600;gallery.render.resolution_y=1300;gallery.render.resolution_percentage=100;gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW);gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('TOWN_BIOMES '+json.dumps({'bytes':EXPORT.stat().st_size,'models':metrics,'clips':clips,'animatedNodes':animated}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
