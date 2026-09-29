"""Mossvale's authored four-tier gathering and artisan workshop library.
Blender --background --python scripts/build-gathering-assets.py -- --render
Runtime contract: metres, Y0 ground, +Z front. Resources have two merged parts;
workstations have one merged part. Preview presentation scales are never exported.
"""
import bpy, math, json, struct, subprocess, tempfile, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/gathering-kit.glb'
SOURCE=ROOT/'assets/source/gathering-kit.blend'
PREVIEW=ROOT/'assets/source/gathering-kit-preview.png'
WORKSHOP=ROOT/'assets/source/crafting-workshop-preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
library=bpy.context.scene;library.name='Mossvale gathering and crafting library';library.unit_settings.system='METRIC'
def xyz(x,y,z):return x,-z,y
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
HEX={'stone':'7F877B','stoneDark':'505E59','stoneLight':'ADB1A0','dirt':'6E533B','dirtLight':'98734A',
 'bark':'73503A','barkLight':'956649','barkDark':'4C382D','birch':'DEDCC4','birchShade':'ACAFA0',
 'redwood':'633D35','redwoodLight':'875845','redwoodDark':'3C302C','moss':'637F40','mossLight':'93A95B',
 'copper':'BD7847','copperLight':'E0A05D','copperDark':'845339','cobalt':'386D9D','cobaltLight':'68A4CB','cobaltDark':'344D75',
 'gold':'D7AB48','goldLight':'F5D479','goldDark':'AA7335','cream':'EFE2B0','crack':'463C37',
 'leaf':'477637','leafLight':'86AD4C','leafDark':'355B35','stem':'4F743E','root':'947247',
 'violet':'8A579F','violetLight':'BF88CB','violetDark':'573C79','ice':'8ABCCB','iceLight':'D3E8E0','iceDark':'4E869B',
 'sun':'E2B635','sunLight':'F9DC73','sunDark':'BA842D','jade':'71BCAC','jadeLight':'C0EEE0','jadeDark':'3D8E84',
 'iron':'384B4A','ironLight':'768D87','ironDark':'202E30','fire':'EA743B','ember':'F5CB67','leather':'AD7851',
 'plank':'A37950','plankLight':'BC9765','plankDark':'795336','paper':'DDD0A5','ink':'577867','berry':'9D525E',
 **{f'birch{i}':c for i,c in enumerate(['8B8B35','AAA743','C0BA48','D4C456','E1D078'])},
 **{f'iron{i}':c for i,c in enumerate(['244E45','30675A','428674','669B7D','8AB08A'])},
 **{f'elder{i}':c for i,c in enumerate(['386337','4D803A','659842','84B64D','A3C858'])},
 **{f'oak{i}':c for i,c in enumerate(['3E632F','527B39','68913F','83A84D','A2BB62'])}}
PAL={k:tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,) for k,h in HEX.items()}
mat=bpy.data.materials.new('Mossvale artisan vertex palette');mat.use_nodes=True
bsdf=mat.node_tree.nodes['Principled BSDF'];bsdf.inputs['Roughness'].default_value=.78
vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='GatheringTint';mat.node_tree.links.new(vc.outputs['Color'],bsdf.inputs['Base Color'])
roots={};stats={}
def noise(x,y,z):return ((x*73856093)^(y*19349663)^(z*83492791))&0xffffffff

class Model:
 def __init__(self,name,profession,tier,w,h,d,station=False):
  self.name=('crafting-'if station else'gathering-')+name;self.profession=profession;self.tier=tier;self.envelope=(w,h,d)
  self.parts={k:{'v':[],'f':[],'c':[]}for k in(['solid']if station else['base','yield'])};self.active=next(iter(self.parts))
 def mesh(self,t,vertices,faces):
  p=self.parts[self.active];n=len(p['v']);p['v'].extend(xyz(*v)for v in vertices)
  p['f'].extend(tuple(n+i for i in f)for f in faces);p['c'].extend([PAL[t]]*len(faces))
 def face(self,t,vertices):self.mesh(t,vertices,[tuple(range(len(vertices)))])
 def box(self,t,x,y,z,w,h,d,turn=0):
  c,s=math.cos(turn),math.sin(turn)
  self.mesh(t,[(x+a*w/2*c+k*d/2*s,y+b*h/2,z-a*w/2*s+k*d/2*c)for a,b,k in
   [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
   [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
 def beam(self,t,a,b,r,r2=None,sides=7):
  a,b=Vector(a),Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
  if u.length<.1:u=direction.cross(Vector((0,1,0)))
  u.normalize();v=direction.cross(u);r2=r if r2 is None else r2
  vertices=[tuple(p+(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))*rad)for p,rad in[(a,r),(b,r2)]for i in range(sides)]
  faces=[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides)for i in range(sides)]
  self.mesh(t,vertices,faces)
 def ring(self,t,x,y,z,r,width,sides=16):
  vs=[(x+math.cos(i*math.tau/sides)*rad,y,z+math.sin(i*math.tau/sides)*rad)for rad in[r,r-width]for i in range(sides)]
  self.mesh(t,vs,[(i+sides,(i+1)%sides+sides,(i+1)%sides,i)for i in range(sides)])
 def rock(self,t,x,y,z,w,h,d,seed=0):
  sides=7;vs=[]
  for j,(height,spread)in enumerate([(0,.73),(.25,1),(.72,.9),(1,.40)]):
   for i in range(sides):
    a=i*math.tau/sides;rad=spread*(.86+noise(i,j,seed)%17/100)
    vs.append((x+math.cos(a)*w*.5*rad,y+height*h,z+math.sin(a)*d*.5*rad))
  faces=[tuple(reversed(range(sides))),tuple(range(sides*3,sides*4))]
  for j in range(3):
   for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
  self.mesh(t,vs,[tuple(reversed(face))for face in faces])
 def crystal(self,t,x,y,z,w,h,d,lean=0):
  sides=6;vs=[]
  for yy,s in[(-.5,.7),(.17,1),(.5,.06)]:
   for i in range(sides):
    a=i*math.tau/sides;vs.append((x+math.cos(a)*w*.5*s+yy*lean,y+yy*h,z+math.sin(a)*d*.5*s))
  self.mesh(t,vs,[tuple(reversed(f))for f in [tuple(reversed(range(sides))),tuple(range(sides*2,sides*3))]+[(j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i)for j in range(2)for i in range(sides)]])
 def leaf(self,x,y,z,size,turn=0,t='leaf',rise=.12,width=.32):
  c,s=math.cos(turn),math.sin(turn)
  def point(a,b,k):return(x+a*c+k*s,y+b,z-a*s+k*c)
  self.mesh(t,[point(-size*.5,0,0),point(-size*.05,rise*.5,size*width),point(size*.5,rise,0),point(-size*.05,rise*.5,-size*width),point(0,rise*.7,0)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)])
  self.beam('leafLight',point(-size*.38,.008,0),point(size*.39,rise*.95,0),.009,.003,4)
 def crown(self,clusters,step,palette):
  w,h,d=self.envelope;cells=set()
  for x in range(-math.ceil(w/step/2),math.ceil(w/step/2)):
   for y in range(math.ceil(h/step)):
    for z in range(-math.ceil(d/step/2),math.ceil(d/step/2)):
     px,py,pz=(x+.5)*step,(y+.5)*step,(z+.5)*step
     if abs(px)+step/2>w/2+.001 or abs(pz)+step/2>d/2+.001 or py+step/2>h+.001:continue
     for cx,cy,cz,rx,ry,rz in clusters:
      shape=((px-cx)/rx)**2+((py-cy)/ry)**2+((pz-cz)/rz)**2
      if shape<1 and(shape<.79 or noise(x,y,z)%5):cells.add((x,y,z));break
  sides=[((-1,0,0),[(0,0,0),(0,0,1),(0,1,1),(0,1,0)]),((1,0,0),[(1,0,1),(1,0,0),(1,1,0),(1,1,1)]),
   ((0,-1,0),[(0,0,1),(0,0,0),(1,0,0),(1,0,1)]),((0,1,0),[(0,1,0),(0,1,1),(1,1,1),(1,1,0)]),
   ((0,0,-1),[(1,0,0),(0,0,0),(0,1,0),(1,1,0)]),((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)])]
  for x,y,z in sorted(cells):
   for (dx,dy,dz),corners in sides:
    if(x+dx,y+dy,z+dz)in cells:continue
    shade=min(4,max(0,noise(x,y,z)%5+(1 if dy>0 else -1 if dy<0 else 0)))
    self.face(palette+str(shade),[((x+a)*step,(y+b)*step,(z+c)*step)for a,b,c in corners])
 def finish(self):
  parent=bpy.data.objects.new(self.name,None);library.collection.objects.link(parent)
  parent['width'],parent['height'],parent['depth']=self.envelope
  parent['profession']=self.profession;parent['tier']=self.tier
  parent['contract']='Metres; Y0 ground; +Z front. Resources retain base on depletion.'
  bounds=[];tri=0
  for role,p in self.parts.items():
   assert p['v'],(self.name,role)
   mesh=bpy.data.meshes.new(self.name+'-'+role);mesh.from_pydata(p['v'],[],p['f']);mesh.update();mesh.materials.append(mat)
   tint=mesh.color_attributes.new(name='GatheringTint',type='BYTE_COLOR',domain='CORNER')
   for face,color in zip(mesh.polygons,p['c']):
    for i in face.loop_indices:tint.data[i].color=color
   obj=bpy.data.objects.new(mesh.name,mesh);library.collection.objects.link(obj);obj.parent=parent
   obj['harvestable']=role=='yield';obj['part']=role
   bounds.extend((v[0],v[2],-v[1])for v in p['v']);tri+=sum(len(f)-2 for f in p['f'])
  low=[min(v[i]for v in bounds)for i in range(3)];high=[max(v[i]for v in bounds)for i in range(3)]
  assert low[1]>=-.001,(self.name,low)
  assert high[1]<=self.envelope[1]+.002,(self.name,high)
  assert all(abs(v[i])<=self.envelope[i]/2+.002 for v in bounds for i in[0,2]),(self.name,low,high)
  roots[self.name]=parent;stats[self.name]={'triangles':tri,'min':low,'max':high}

def rocks(m,w,d):
 m.rock('stoneDark',0,0,0,w*.76,.36,d*.74)
 for i in range(12):
  a=i*math.tau/12;r=.30 if i%2 else .37
  m.rock(['stone','stoneLight','stoneDark'][i%3],math.cos(a)*w*r,.02,math.sin(a)*d*r,w*.19,.12+(i%3)*.045,d*.18,i)
 for i in range(9):
  a=i*2.4;m.rock('moss'if i%2 else'mossLight',math.sin(a)*w*.32,.09,math.cos(a)*d*.30,.24,.08,.20,i)

def ore(name,tier,w,h,d,tint,light,dark):
 m=Model(name,'mining',tier,w,h,d);rocks(m,w,d);m.active='yield'
 if name=='copper-vein':
  m.rock('stone',0,.23,0,w*.8,h*.57,d*.75,3)
  for i,(x,z,s,hh)in enumerate([(-.48,-.15,.5,.37),(.40,-.12,.58,.4),(-.15,.29,.56,.36),(.30,.30,.36,.25),(-.15,-.23,.48,.39)]):
   m.rock(dark,x,.50,z,s+.09,hh+.035,.46,i);m.rock(tint,x,.55,z+.015,s,hh,.43,i)
   m.rock(light,x-.03,.55+hh-.015,z,.22,.06,.19,i)
  for i in range(14):
   x=-.56+i*.083;y=.46+math.sin(i*.8)*.085;m.box(tint,x,y,.46,.12,.058,.12,turn=i*.13)
   if i%2==0:m.box(light,x,y+.019,.508,.055,.018,.07)
 else:
  positions=[(-.25,-.1,.9,.47),(.33,-.09,.7,.35),(-.53,.22,.46,.29),(.18,.39,.52,.3),(.50,.30,.35,.23)]
  if tier==3:positions=[(-.24,-.02,.99,.53),(.22,-.04,.88,.44),(-.55,.22,.25,.22),(.58,.15,.30,.22),(.12,.51,.16,.20)]
  for i,(xx,zz,hh,ww)in enumerate(positions):
   x=xx*w*.64;z=zz*d*.74;ch=(h-.25)*hh;cw=w*ww*.58
   m.crystal(dark,x,.24+ch/2,z,cw+.06,ch,cw*.9,lean=(-.13+i*.06))
   m.crystal(tint,x-.035,.25+ch/2,z+.038,cw*.77,ch*.98,cw*.77,lean=(-.13+i*.06))
   m.crystal(light,x-.055,.25+ch*.55,z+cw*.3,cw*.15,ch*.70,.025,lean=(-.10+i*.045))
   for j in range(2+tier):
    m.box(dark,x,.34+j*ch/(3+tier),z+cw*.33,cw*.72,.025,.026,turn=.16)
  for i in range(18):
   a=i*2.4;r=.36+(i%3)*.02;x=math.sin(a)*w*r;z=math.cos(a)*d*r
   m.crystal(tint if i%2 else light,x,.23+(i%4)*.03,z,.09,.15+(i%4)*.05,.085,lean=.04)
  if tier==3:m.crystal('cream',.014,1.32,.06,.025,1.72,.032,lean=.007)
 m.finish()
ore('crystal',0,1.6,1.5,1.5,'jade','jadeLight','jadeDark')
ore('copper-vein',1,2,1.25,1.7,'copper','copperLight','copperDark')
ore('cobalt-vein',2,2.2,2,2,'cobalt','cobaltLight','cobaltDark')
ore('sunstone-vein',3,2.4,2.7,2.1,'gold','goldLight','goldDark')

def stump(m,width,bark):
 m.beam(bark,(0,.025,0),(0,.46,0),width*.58,width*.50,10)
 m.beam('root',(0,.457,0),(0,.474,0),width*.47,width*.47,12)
 for r in[.15,.27,.39]:m.ring('barkDark',0,.476,0,width*r,.012,14)
 for i in range(7):
  a=i*math.tau/7;x=math.cos(a);z=math.sin(a)
  m.beam(bark,(x*width*.28,.27,z*width*.28),(x*width*.95,.055,z*width*.95),width*.18,.025,6)
  if i%2==0:m.rock('moss',x*width*.76,.02,z*width*.76,.28,.09,.22,i)
 for i in range(4):
  a=i*1.8;x=math.sin(a)*width*.58;z=math.cos(a)*width*.58
  m.beam('cream',(x,.06,z),(x,.16+i*.025,z),.024,.018,5)
  m.rock('copperLight',x,.15+i*.025,z,.13,.055,.12,i)

def tree(name,tier,w,h,d,trunk,palette):
 m=Model(name,'woodcutting',tier,w,h,d);width=[.48,.50,.83,1.15][tier];stump(m,width,trunk);m.active='yield'
 segments=6+tier*2;top=h*.70
 for i in range(segments):
  y=.46+i*(top-.46)/segments;y2=.46+(i+1)*(top-.46)/segments
  r=width*.45*(1-i/segments*.67);r2=width*.45*(1-(i+1)/segments*.67)
  x=math.sin(i*.6)*width*.11;x2=math.sin((i+1)*.6)*width*.11
  m.beam(trunk,(x,y,0),(x2,y2,0),r,r2,8)
  for j in range(5):
   a=j*math.tau/5;cx=math.cos(a)*r;cz=math.sin(a)*r
   if tier==1:m.box('barkDark',x+cx,y+.06,cz,.08,.032,.08,turn=a)
   else:m.beam('barkLight'if j%2 else'redwoodDark',(x+cx,y+.04,cz),(x2+cx*.89,y2-.02,cz*.89),.014,.008,4)
 for i in range(5+tier):
  a=i*2.4;y=h*(.43+i*.035);spread=w*(.23+(i%2)*.06)
  end=(math.cos(a)*spread,h*(.65+i*.024),math.sin(a)*spread)
  m.beam(trunk,(0,y,0),end,width*.17,width*.04,7)
  m.beam(trunk,(end[0]*.65,end[1]-.3,end[2]*.65),(end[0]*1.12,end[1]+.25,end[2]*1.12),width*.07,.02,6)
 if tier==0:clusters=[(-.5,2.35,.1,.75,.55,.72),(.40,2.40,.03,.78,.65,.83),(0,2.80,-.26,.69,.32,.73)]
 elif tier==1:clusters=[(-.60,3.49,-.24,.80,.67,.81),(.52,3.77,.23,.90,.67,.88),(-.10,4.0,-.45,.83,.48,.90)]
 elif tier==2:clusters=[(0,3.8,0,1.9,.66,1.9),(-.17,4.6,.08,1.6,.68,1.58),(.05,5.30,-.10,1.10,.69,1.20)]
 else:clusters=[(-1.15,5.6,.35,1.27,.9,1.39),(1.2,6.02,.14,1.22,.90,1.27),(-.45,6.6,1.15,1.37,.9,1.20),(.5,7.1,-.86,1.58,.9,1.49),(-.97,7.05,-.57,1.32,.89,1.18)]
 m.crown(clusters,[.20,.23,.30,.36][tier],palette)
 # Low branches, fungus shelves, trunk knots and draping moss remain readable under the canopy.
 for i in range(3+tier*2):
  y=.72+i*.29;a=i*1.2;x=math.sin(a)*width*.44;z=math.cos(a)*width*.44
  if tier!=1:
   m.rock('barkDark',x,y,z,.16,.12,.14,i);m.rock('root',x*1.10,y+.025,z*1.1,.095,.055,.08,i)
  if i%2==0:
   m.rock('cream'if tier<2 else'copperLight',x*1.13,y-.05,z*1.13,.24,.06,.20,i)
 for i in range(tier*4):
  a=i*2.4;x=math.sin(a)*w*.24;z=math.cos(a)*d*.24;y=h*(.60+(i%3)*.055)
  m.beam('moss',(x,y,z),(x+.06,y-.45-(i%2)*.22,z),.028,.009,5)
  for j in range(3):m.leaf(x,y-.14-j*.13,z,.13,a,'moss',.04)
 m.finish()
tree('timber',0,2.5,3.1,2.5,'bark','oak')
tree('silver-birch',1,3,4.5,3,'birch','birch')
tree('ironwood',2,4,6,4,'redwood','iron')
tree('elderwood',3,5,8,5,'bark','elder')

def root_patch(m,size):
 m.rock('dirt',0,0,0,size*.86,.115,size*.81)
 for i in range(9):
  a=i*math.tau/9;m.beam('root',(0,.08,0),(math.cos(a)*size*.33,.045,math.sin(a)*size*.31),.025,.008,5)
  m.rock('moss',math.sin(a)*size*.30,.035,math.cos(a)*size*.28,.20,.065,.14,i)
 for i in range(7):m.rock('stoneLight',math.sin(i*2.4)*size*.36,.01,math.cos(i*2.4)*size*.34,.075,.06,.08,i)
def flower(m,x,y,z,size,t,light,centre,petals=6):
 m.beam('stem',(x-.06,.10,z),(x,y,z),.024,.012,6)
 for side in[-1,1]:m.leaf(x+side*size*.19,y*.55,z,size*.48,side*.32,'leaf',size*.13)
 for i in range(petals):
  a=i*math.tau/petals;m.leaf(x+math.cos(a)*size*.21,y,z-math.sin(a)*size*.21,size*.50,a,t,size*.15,.37)
  m.leaf(x+math.cos(a)*size*.12,y+.018,z-math.sin(a)*size*.12,size*.28,a,light,size*.16,.39)
 m.rock(centre,x,y+.025,z,size*.22,size*.15,size*.22)
 for i in range(5):
  a=i*2.4;m.beam(centre,(x,y+.04,z),(x+math.sin(a)*size*.07,y+size*.20,z+math.cos(a)*size*.07),.009,.006,4)

def herb(name,tier,w,h,d):
 m=Model(name,'herbalism',tier,w,h,d);root_patch(m,min(w,d));m.active='yield'
 for i in range(11+tier*3):
  a=i*2.4;r=w*(.13+(i%3)*.075);y=.12+(i%3)*.06
  m.leaf(math.sin(a)*r,y,math.cos(a)*r,.32+tier*.045,a,'leafDark'if i%3==0 else'leaf',.15+tier*.035)
 if tier==0:positions=[(-.23,-.20,.51,.31),(.24,-.12,.62,.30),(.12,.22,.47,.29),(-.28,.24,.42,.26)]
 elif tier==1:positions=[(-.30,-.15,.49,.44),(.25,.10,.62,.48),(-.19,.36,.42,.36),(0,-.34,.55,.38)]
 elif tier==2:positions=[(-.36,-.16,.65,.48),(.30,-.23,.84,.52),(.15,.37,.59,.49),(-.37,.36,.40,.30)]
 else:positions=[(-.45,-.24,.86,.57),(.34,-.34,1.25,.65),(.37,.31,.97,.60),(-.21,.41,1.04,.54),(0,-.05,.73,.48)]
 for x,z,y,s in positions:
  if tier==2:
   m.beam('iceDark',(x,.10,z),(x,y,z),.030,.014,6)
   for i in range(6):
    a=i*math.tau/6;xx=x+math.cos(a)*s*.28;zz=z+math.sin(a)*s*.28
    m.crystal('ice',xx,y,zz,.135,.27,.13,lean=math.cos(a)*.09)
    m.crystal('iceLight',xx,y+.055,zz+.025,.050,.21,.07)
   m.crystal('iceLight',x,y+.04,z,.20,.26,.19)
  else:flower(m,x,y,z,s,*[('cream','sunLight','goldDark'),('violet','violetLight','cream'),None,('sun','sunLight','goldDark')][tier],petals=7 if tier==3 else 6)
 if tier==2:
  for i in range(10):
   a=i*2.4;m.crystal('iceLight',math.sin(a)*w*.36,.19,math.cos(a)*d*.36,.10,.24,.09,lean=.06)
 if tier==3:
  for i in range(8):
   a=i*2.4;m.rock('gold',math.sin(a)*.62,.22,math.cos(a)*.57,.075,.08,.07,i)
 m.finish()
herb('herb',0,1.4,.85,1.3)
herb('moonpetal',1,1.5,.8,1.5)
herb('frostbloom',2,1.8,1.1,1.8)
herb('sunblossom',3,2,1.5,2)

# Artisan stations: hand-built silhouettes with functional tools and visible stock.
def rivets(m,x,y,z,w,d):
 for xx in[-1,1]:
  for zz in[-1,1]:m.rock('ironLight',x+xx*w*.38,y,z+zz*d*.36,.055,.03,.055)
def tabletop(m,x,y,z,w,d):
 for i in range(6):
  zz=z+(i-2.5)*d/6;m.box('plank'if i%2 else'plankLight',x,y,zz,w,.15,d/6-.014)
  for j in range(3):m.box('plankDark',x-w*.35+j*w*.29,y+.076,zz+.03,w*.16,.003,.009,turn=.035*j)
 for xx in[-1,1]:
  for zz in[-1,1]:
   px=x+xx*(w*.5-.16);pz=z+zz*(d*.5-.16)
   m.box('bark',px,y*.5,pz,.18,y,.18);m.box('iron',px,.17,pz,.19,.14,.19)
   m.rock('ironLight',px,y+.078,pz,.055,.02,.055)
 for zz in[-1,1]:m.box('barkDark',x,y*.35,z+zz*(d*.5-.16),w-.20,.12,.13)
def bottle(m,x,y,z,r,h,t):
 m.beam(t,(x,y+.035,z),(x,y+h*.60,z),r*.70,r,8)
 m.beam(t,(x,y+h*.60,z),(x,y+h*.78,z),r,r*.38,8)
 m.beam(t,(x,y+h*.78,z),(x,y+h*.97,z),r*.38,r*.38,8)
 m.beam('leather',(x,y+h*.93,z),(x,y+h*1.05,z),r*.43,r*.39,8)
 m.box('paper',x,y+h*.37,z+r*.91,r*1.02,h*.24,.018)
 m.box('ink',x,y+h*.37,z+r*.926,r*.12,h*.10,.006)
 m.box('cream',x-r*.36,y+h*.58,z+r*.82,.025,h*.24,.014)
def tool(m,x,y,z,length,head='iron'):
 m.box('barkLight',x,y,z,.058,.055,length,turn=-.2)
 m.box(head,x+.03,y+.035,z-length*.37,.34,.14,.14,turn=-.2)
 m.box('ironLight',x+.03,y+.108,z-length*.37,.32,.012,.12,turn=-.2)

m=Model('forge','smithing',0,4.4,3.6,3.2,station=True)
# Flagstone apron, open hot hearth, masonry chimney and iron hood.
for i in range(6):
 for j in range(4):m.box('stone'if(i+j)%2 else'stoneDark',(i-2.5)*.69,.07,(j-1.5)*.75,.665,.14,.72)
for row in range(4):
 for col in range(3):m.box('stone'if(row+col)%2 else'stoneDark',-.85+(col-1)*.48,.23+row*.21,-.64,.46,.195,1.12)
m.box('ironDark',-.85,.99,-.64,1.46,.10,1.20)
for i in range(20):
 x=-1.40+(i%5)*.27;z=-1.02+(i//5)*.24;m.rock('ironDark'if i%3 else'fire',x,1.02,z,.25,.10,.22,i)
for i in range(8):
 x=-1.31+(i%4)*.29;z=-.88+(i//4)*.37;m.crystal('ember'if i%2 else'fire',x,1.20,z,.12,.28+(i%3)*.045,.12,lean=.04)
for x in[-1.57,-.13]:m.box('iron',x,1.65,-.69,.10,1.4,.12)
m.box('iron',-.85,2.26,-.70,1.72,.20,1.40)
for i in range(5):
 for j in range(2):m.box('stoneDark'if(i+j)%2 else'stone',-.85+(j-.5)*.42,2.46+i*.21,-1.05,.40,.20,.65)
m.box('stoneLight',-.85,3.47,-1.05,1.0,.13,.80)
# Anvil: broad steel face, tapered horn, waist, splayed foot, stump and fixing straps.
m.beam('bark',(1.03,.14,.40),(1.03,.78,.40),.43,.37,10)
for y in[.29,.64]:m.beam('iron',(1.03,y,.40),(1.03,y+.055,.40),.42,.42,10)
m.box('ironDark',1.03,.82,.40,.81,.15,.60);m.box('iron',1.03,1.02,.40,.39,.33,.39)
m.box('iron',1.03,1.25,.40,.92,.19,.52);m.box('ironLight',1.03,1.355,.40,1.00,.045,.55)
m.beam('iron',(1.45,1.27,.40),(1.98,1.31,.40),.17,.017,6)
m.box('ironDark',.69,1.38,.48,.083,.016,.084)
for i in range(6):m.box('barkLight',1.03+math.cos(i*math.tau/6)*.38,.47,.40+math.sin(i*math.tau/6)*.38,.04,.35,.04)
tool(m,1.02,1.42,.47,.49)
# Water bucket and riveted bellows, rack of tongs and ingots.
m.beam('bark',(-.42,.16,1.08),(-.42,.53,1.08),.27,.31,10)
m.beam('jadeDark',(-.42,.534,1.08),(-.42,.54,1.08),.267,.267,12)
for y in[.22,.47]:m.beam('iron',(-.42,y,1.08),(-.42,y+.035,1.08),.29,.30,10)
for side in[-1,1]:m.beam('iron',(-.42+side*.26,.47,1.08),(-.42+side*.26,.80,1.08),.018,.018,5)
m.beam('iron',(-.68,.80,1.08),(-.16,.80,1.08),.019,.019,5)
m.rock('leather',-.02,.47,-.95,.60,.22,.64);m.box('plankDark',-.02,.71,-.95,.61,.055,.63)
for i in range(4):m.box('goldDark',-.25+i*.15,.72,-.71,.055,.03,.05)
for i in range(3):
 m.box('iron',-1.63+i*.15,1.53,-.02,.03,.54,.035);m.box('ironLight',-1.63+i*.15,1.28,-.02,.10,.08,.075)
for i in range(4):m.box('copper'if i<2 else'ironLight',.63+(i%2)*.30,.23+(i//2)*.12,-.75,.25,.11,.45)
m.finish()

m=Model('alchemy','alchemy',0,3.6,2.7,2.4,station=True)
tabletop(m,0,1.10,0,3.15,1.5)
for side in[-1,1]:m.box('barkDark',side*1.38,1.75,-.57,.13,1.76,.15)
for y in[1.60,2.10,2.59]:m.box('plank',0,y,-.65,3.05,.12,.50)
for y in[1.63,2.13]:
 for i in range(7):bottle(m,-1.22+i*.40,y+.04,-.64,.09,.27+(.05 if i%2 else 0),['violet','jade','sun','berry'][i%4])
# Copper still, coiled condenser and tripod burner.
m.beam('iron',(-.65,1.17,.06),(-.65,1.33,.06),.25,.25,8)
m.crystal('fire',-.65,1.40,.06,.19,.21,.19)
m.beam('copperDark',(-.65,1.45,.06),(-.65,1.67,.06),.28,.31,10)
m.beam('copper',(-.65,1.67,.06),(-.65,1.87,.06),.31,.12,10)
m.beam('copperLight',(-.65,1.85,.06),(-.65,2.10,.06),.06,.06,8)
m.beam('copper',(-.65,2.10,.06),(.02,2.10,.06),.045,.045,7)
for i in range(24):
 a=i*math.tau/8;b=(i+1)*math.tau/8
 m.beam('copper',(.15+math.cos(a)*.14,2.08-i*.023,.06+math.sin(a)*.14),(.15+math.cos(b)*.14,2.08-(i+1)*.023,.06+math.sin(b)*.14),.022,.022,6)
bottle(m,.17,1.18,.08,.15,.31,'jade')
# Mortar, pestle, parchment recipe and ingredient tray.
m.beam('stoneDark',(.85,1.18,.32),(.85,1.37,.32),.20,.25,10)
m.beam('stoneLight',(.85,1.365,.32),(.85,1.40,.32),.25,.25,10)
m.beam('leafDark',(.85,1.401,.32),(.85,1.405,.32),.19,.19,10)
m.beam('stoneLight',(.81,1.38,.31),(1.03,1.70,.32),.045,.068,7)
m.box('paper',-.08,1.183,.51,.54,.025,.40,turn=.12)
for i in range(4):m.box('ink',-.09,1.198,.39+i*.065,.32-(i%2)*.07,.003,.013,turn=.12)
for x in[-.37,.23]:m.beam('paper',(x,1.21,.28),(x,1.21,.74),.034,.034,8)
for i in range(4):bottle(m,-1.25+i*.25,1.18,.45,.075,.21,['violet','jade','sun','berry'][i])
for i in range(6):
 a=i*1.9;m.leaf(1.25+math.sin(a)*.12,1.18,-.17+math.cos(a)*.12,.25,a,'leaf',.08)
# Hanging dried herbs under the high shelf.
for i in range(3):
 x=-.93+i*.86;m.beam('root',(x,2.55,-.41),(x,2.28,-.40),.008,.008,4)
 for j in range(4):m.leaf(x+(j-1.5)*.035,2.22,-.39,.22,j*.7,'mossLight',.10)
m.finish()

m=Model('woodworking','woodcraft',0,4.2,2.8,2.8,station=True)
tabletop(m,-.16,1.12,.22,3.30,1.46)
# Pegboard, hand tool silhouettes, bow saw, and carved progress sample.
for side in[-1,1]:m.box('barkDark',side*1.45,1.75,-.68,.15,1.84,.16)
for i in range(5):m.box('plank'if i%2 else'plankLight',0,1.64+i*.22,-.74,3.20,.21,.09)
for i in range(8):m.beam('iron',(-1.25+i*.35,2.41,-.66),(-1.25+i*.35,2.41,-.55),.018,.018,5)
for i in range(4):
 x=-1.20+i*.28;m.box('barkLight',x,2.19,-.53,.07,.40,.065)
 m.box('ironLight',x,1.91,-.53,.075,.20,.035)
# Bow saw uses a thin toothed blade suspended in a wooden frame.
for x in[.38,1.28]:m.box('bark',x,2.13,-.54,.075,.52,.07)
m.box('barkLight',.83,2.35,-.54,.97,.065,.07)
m.box('ironLight',.83,1.89,-.54,.90,.055,.025)
for i in range(14):m.face('iron',[(.40+i*.06,1.86,-.52),(.46+i*.06,1.86,-.52),(.43+i*.06,1.83,-.52)])
# Bench vice, brass screw, handles, planer and wood shavings.
m.box('barkDark',-.97,1.15,1.08,.75,.26,.17);m.box('plankLight',-.97,1.24,.87,.78,.19,.12)
m.beam('iron',(-.97,1.10,.86),(-.97,1.10,1.28),.055,.055,8)
m.beam('bark',(-1.17,1.10,1.27),(-.77,1.10,1.27),.032,.032,7)
m.box('plankLight',-.18,1.23,.24,1.20,.095,.35,turn=-.12)
for i in range(4):m.box('plankDark',-.35+i*.23,1.28,.24,.12,.005,.015,turn=-.12)
m.box('barkDark',.19,1.38,.25,.48,.17,.22,turn=-.12);m.box('ironLight',.12,1.47,.25,.12,.04,.21,turn=-.12)
m.beam('bark',(.26,1.44,.25),(.36,1.63,.25),.040,.038,7)
tool(m,.78,1.23,.35,.52)
for i in range(14):
 a=i*2.4;x=-.40+math.sin(a)*.62;z=.28+math.cos(a)*.42
 m.beam('cream',(x,1.205,z),(x+.09,1.23,z+.04),.012,.008,4)
# Timber stock has exposed end grain and fastening bands.
for i in range(6):
 x=-1.12+(i%3)*.43;y=.17+(i//3)*.25
 m.beam('bark',(x,y,-.13),(x,y,.81),.14,.14,9)
 m.beam('root',(x,y,.814),(x,y,.826),.12,.12,9)
 # End grain in vertical wood faces.
 for r in[.045,.083]:
  for j in range(10):
   a=j*math.tau/10;b=(j+1)*math.tau/10;m.beam('barkDark',(x+math.cos(a)*r,y+math.sin(a)*r,.83),(x+math.cos(b)*r,y+math.sin(b)*r,.83),.005,.005,4)
for i in range(4):m.box('plankLight'if i%2 else'plank',1.76,.14+i*.105,-.11,.38,.095,1.46)
# Small apprentice-to-master sample: carved leaf crest, framed in copper.
m.box('copperDark',1.13,1.26,.40,.40,.12,.48)
m.leaf(1.13,1.335,.40,.38,-.4,'jade',.025,.34)
m.finish()

for directory in[EXPORT.parent,SOURCE.parent]:directory.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
with tempfile.TemporaryDirectory(prefix='mossvale-gathering-')as tmp:
 p=[str(Path(tmp)/f'{i}.glb')for i in range(3)]
 for cmd in[['weld',str(EXPORT),p[0]],['quantize',p[0],p[1],'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['dedup',p[1],p[2]],['prune',p[2],str(EXPORT)]]:
  subprocess.run(['npx','--yes','@gltf-transform/cli@4.5.0']+cmd,check=True)
raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
for key in['extensionsUsed','extensionsRequired']:doc[key]=sorted(set(doc.get(key,[])+['KHR_mesh_quantization']))
enc=json.dumps(doc,separators=(',',':')).encode();enc+=b' '*(-len(enc)%4);tail=raw[20+length:]
EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(enc)+len(tail))+struct.pack('<II',len(enc),0x4E4F534A)+enc+tail)

def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
def flat_material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=tuple(linear(int(color[i:i+2],16)/255)for i in(0,2,4))+(1,);m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color;m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;return m
floor_mat=flat_material('Deep moss gallery','263C34');plinth_mat=flat_material('Gallery limestone','6C7B67');text_mat=flat_material('Gallery warm ivory','EBDDB8')
def text_obj(body,x,y,z,size=.20):
 curve=bpy.data.curves.new('Editorial label','FONT');curve.body=body;curve.align_x='CENTER';curve.size=size;curve.extrude=.0005
 obj=bpy.data.objects.new(body,curve);bpy.context.scene.collection.objects.link(obj);obj.location=xyz(x,y,z);obj.rotation_euler=(math.pi/2,0,0);obj.data.materials.append(text_mat)
def preview_scene(name,path,at,look,scale,res):
 scene=bpy.data.scenes.new(name);bpy.context.window.scene=scene
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.08));bpy.context.object.data.materials.append(floor_mat)
 bpy.ops.object.camera_add(location=xyz(*at));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=scale;aim(cam,look);scene.camera=cam
 for pos,power,size in[((-8,16,10),2800,10),((10,10,-6),2200,8)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(*pos));light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,1,0))
 bpy.ops.object.light_add(type='SUN',location=xyz(-5,12,8));sun=bpy.context.object;sun.data.energy=1.8;sun.data.angle=.12;aim(sun,(0,0,0))
 scene.world=bpy.data.worlds.new(name+' world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.17,.23,.22,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
 scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
 scene.render.resolution_x,scene.render.resolution_y=res;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.filepath=str(path);scene.view_settings.view_transform='AgX'
 return scene

def display(name,x,z,scale=1,plinth=2):
 source=roots[name];parent=source.copy();bpy.context.scene.collection.objects.link(parent);parent.location=xyz(x,.16,z);parent.scale=(scale,)*3
 for child in source.children:
  obj=child.copy();obj.data=child.data;bpy.context.scene.collection.objects.link(obj);obj.parent=parent
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=plinth,depth=.18,location=xyz(x,.045,z));bpy.context.object.data.materials.append(plinth_mat)

gallery=preview_scene('Four gathering tiers | model review',PREVIEW,(0,18,25),(0,1.1,0),25,(2400,1550))
rows=[(['timber','silver-birch','ironwood','elderwood'],.56,-5.5),(['crystal','copper-vein','cobalt-vein','sunstone-vein'],1.20,0),(['herb','moonpetal','frostbloom','sunblossom'],1.70,5.5)]
for names,scale,z in rows:
 for i,name in enumerate(names):
  x=(i-1.5)*5.2;display('gathering-'+name,x,z,scale,2.05)
  text_obj(name.replace('-',' ').upper(),x-(1.8 if name=='elderwood' else .9) if z<5 else x,.17,z+1.91,.18)
for i,title in enumerate(['I  APPRENTICE','II  JOURNEYMAN','III  EXPERT','IV  ARTISAN']):text_obj(title,(i-1.5)*5.2,6.3,-5.5,.24)
text_obj('M O S S V A L E   /   THE GATHERER\'S PATH',0,.10,8.65,.35)
text_obj('Distinct silhouettes. Richer materials. Permanent depleted bases.',0,.10,9.24,.19)
workshop=preview_scene('Artisan workshops | model review',WORKSHOP,(7,10,19),(0,1,0),17,(2400,1350))
for i,(name,label)in enumerate([('forge','SMITHING / HEARTHFORGE'),('alchemy','ALCHEMY / MOONPETAL STILL'),('woodworking','WOODCRAFT / ROOTWRIGHT BENCH')]):
 x=(i-1)*5.2;display('crafting-'+name,x,0,1,2.35);text_obj(label,x,.17,2.07,.19)
text_obj('M O S S V A L E   /   THE ARTISAN\'S WORKSHOP',0,.10,4.05,.31)
text_obj('Forged steel, copper stills, hand tools and carved woodland craft.',0,.10,4.60,.17)
bpy.context.window.scene=gallery
# Open the source directly in the rendered gallery camera, with the full editable library available as a scene.
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('GATHERING_KIT '+json.dumps({'models':stats,'triangles':sum(v['triangles']for v in stats.values()),'meshes':27,'bytes':EXPORT.stat().st_size}),flush=True)
if'--render'in sys.argv:
 for scene in[gallery,workshop]:bpy.context.window.scene=scene;bpy.ops.render.render(write_still=True)
 # Inventory icons use each authored silhouette, with transparent background.
 icon_dir=ROOT/'public/ui/gathering';icon_dir.mkdir(parents=True,exist_ok=True)
 icon_scene=preview_scene('Gathering icon camera',icon_dir/'crystal.png',(4,3,7),(0,.5,0),3,(256,256))
 icon_scene.render.film_transparent=True;icon_scene.render.image_settings.color_mode='RGBA';icon_scene.cycles.samples=20
 for obj in list(icon_scene.objects):
  if obj.type=='MESH':icon_scene.collection.objects.unlink(obj)
 for name,source in roots.items():
  if not name.startswith('gathering-'):continue
  for obj in list(icon_scene.objects):
   if obj.type in['MESH','EMPTY']:icon_scene.collection.objects.unlink(obj)
  parent=source.copy();icon_scene.collection.objects.link(parent)
  for child in source.children:
   obj=child.copy();obj.data=child.data;icon_scene.collection.objects.link(obj);obj.parent=parent
  w,h,d=source['width'],source['height'],source['depth']
  icon_scene.camera.location=xyz(w*1.5,h*.8+d,h*.4+d*2.8);aim(icon_scene.camera,(0,h*.46,0))
  icon_scene.camera.data.ortho_scale=max(h*1.15,w*1.20,d*1.2)
  icon_scene.render.filepath=str(icon_dir/(name.removeprefix('gathering-')+'.png'))
  bpy.ops.render.render(write_still=True)
