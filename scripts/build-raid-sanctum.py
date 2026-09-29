"""Author Mossvale's void raid sanctum in an isolated background Blender process.
Blender --background --disable-autoexec --python scripts/build-raid-sanctum.py -- --render
Static cosmetics only: the complete +/-34m gameplay square stays flat and clear.
"""
import bpy, math, random, subprocess, tempfile, sys, json, struct
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/raid-sanctum.glb'
SOURCE=ROOT/'assets/source/raid-sanctum.blend'
PREVIEW=ROOT/'assets/source/raid-sanctum-preview.png'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.name='Mossvale - fractured void sanctum'
random.seed(4305302)
C={
 'obsidian':(.045,.052,.088,1),'plate':(.075,.083,.13,1),'plateLight':(.10,.112,.17,1),
 'basalt':(.025,.032,.055,1),'basaltLight':(.054,.065,.096,1),'basaltDark':(.012,.016,.03,1),
 'edge':(.16,.165,.24,1),'edgeDark':(.065,.067,.12,1),'silver':(.28,.33,.41,1),
 'violet':(.27,.07,.56,1),'cyan':(.045,.39,.48,1),'faintViolet':(.12,.078,.22,1),
 'rune':(.16,.13,.32,1),'runeDark':(.037,.029,.074,1),'light':(.37,.17,.78,1),
 'ice':(.15,.67,.73,1),'black':(.009,.008,.022,1),
}
class Batch:
 def __init__(self,name,material):self.name=name;self.material=material;self.vertices=[];self.faces=[];self.colors=[]
 def add(self,vertices,faces,color):
  offset=len(self.vertices);self.vertices.extend(vertices);self.faces.extend(tuple(offset+i for i in face)for face in faces)
  self.colors.extend([C[color]if isinstance(color,str)else color]*len(faces))
 def mesh(self,parent):
  data=bpy.data.meshes.new(self.name);data.from_pydata(self.vertices,[],self.faces);data.update()
  obj=bpy.data.objects.new(self.name,data);scene.collection.objects.link(obj);obj.parent=parent;data.materials.append(self.material)
  tint=data.color_attributes.new(name='MossvalePalette',type='BYTE_COLOR',domain='CORNER')
  for face,color in zip(data.polygons,self.colors):
   for loop in face.loop_indices:tint.data[loop].color=color
  return obj

def material(name,rough=.83,metal=.12,emission=0):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF')
 shader.inputs['Roughness'].default_value=rough;shader.inputs['Metallic'].default_value=metal
 tint=mat.node_tree.nodes.new('ShaderNodeVertexColor');tint.layer_name='MossvalePalette';mat.node_tree.links.new(tint.outputs['Color'],shader.inputs['Base Color'])
 if emission:mat.node_tree.links.new(tint.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=emission
 return mat
stone=material('Void obsidian palette');rock=material('Void fractured basalt',.95,0);metal=material('Void engraved facets',.55,.28)
light=material('Void violet and cyan energy',.64,.10,1.8)
platform=Batch('raid-sanctum-platform',stone);shelf=Batch('raid-sanctum-basalt-shelf',rock)
monoliths=Batch('raid-sanctum-monoliths',stone);shards=Batch('raid-sanctum-shards',rock)
inscriptions=Batch('raid-sanctum-inscriptions',metal);energy=Batch('raid-sanctum-void-energy',light)

def box(batch,center,size,color,angle=0):
 x,y,z=center;w,d,h=(v/2 for v in size);c,s=math.cos(angle),math.sin(angle)
 points=[(x+a*c-b*s,y+a*s+b*c,z+k)for a,b,k in[(-w,-d,-h),(w,-d,-h),(w,d,-h),(-w,d,-h),(-w,-d,h),(w,-d,h),(w,d,h),(-w,d,h)]]
 batch.add(points,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],color)
def prism(batch,polygon,bottom,top,color,bevel=0):
 if len(polygon)<3:return
 center=Vector((sum(p[0]for p in polygon)/len(polygon),sum(p[1]for p in polygon)/len(polygon)))
 upper=[tuple(center+(Vector(p)-center)*(1-bevel))for p in polygon];n=len(polygon)
 batch.add([(x,y,bottom)for x,y in polygon]+[(x,y,top)for x,y in upper],[tuple(reversed(range(n)))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]+[tuple(range(n,n*2))],color)
def bar(batch,a,b,radius,color,end=None,sides=6):
 a,b=Vector(a),Vector(b);direction=(b-a).normalized();axis=direction.cross(Vector((0,0,1)))
 if axis.length<.01:axis=direction.cross(Vector((0,1,0)))
 axis.normalize();other=direction.cross(axis).normalized();end=radius if end is None else end
 points=[tuple(p+(axis*math.cos(i/sides*math.tau)+other*math.sin(i/sides*math.tau))*r)for p,r in[(a,radius),(b,end)]for i in range(sides)]
 batch.add(points,[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides)for i in range(sides)],color)
def line(batch,a,b,width,color):
 a,b=Vector(a),Vector(b);side=(b-a).cross(Vector((0,0,1))).normalized()*width/2
 batch.add([tuple(a+side),tuple(b+side),tuple(b-side),tuple(a-side)],[(0,1,2,3)],color)
def path(batch,points,width,color):
 for a,b in zip(points,points[1:]):bar(batch,a,b,width,color,sides=4)
def block(center,size,color='plate',angle=0):
 x,y,z=center;w,d,h=size;cut=min(w,d)*.19;c,s=math.cos(angle),math.sin(angle)
 poly=[(-w/2+cut,-d/2),(w/2-cut,-d/2),(w/2,-d/2+cut),(w/2,d/2-cut),(w/2-cut,d/2),(-w/2+cut,d/2),(-w/2,d/2-cut),(-w/2,-d/2+cut)]
 prism(monoliths,[(x+a*c-b*s,y+a*s+b*c)for a,b in poly],z-h/2,z+h/2,color,.045)
def crystal(batch,base,height,radius,color='obsidian',lean=(0,0),sides=5):
 x,y,z=base;vertices=[]
 for t,r in[(0,.38),(.2,.8),(.7,1)]:
  for i in range(sides):
   a=i/sides*math.tau+.24;vertices.append((x+math.cos(a)*radius*r+lean[0]*t,y+math.sin(a)*radius*r+lean[1]*t,z+height*t))
 vertices.append((x+lean[0],y+lean[1],z+height));n=len(vertices)-1
 faces=[tuple(reversed(range(sides)))]+[(i+j*sides,(i+1)%sides+j*sides,(i+1)%sides+(j+1)*sides,i+(j+1)*sides)for j in range(2)for i in range(sides)]+[(2*sides+i,2*sides+(i+1)%sides,n)for i in range(sides)]
 if height<0:faces=[tuple(reversed(face))for face in faces]
 batch.add(vertices,faces,color)
 # Alternating facets read as hewn crystal instead of smooth mineral cylinders.
 start=len(batch.colors)-len(faces)
 for j in range(1,len(faces)):
  if j%3==0:batch.colors[start+j]=C['basaltLight']if color in['basalt','obsidian']else C[color]

# The entire square arena is supported by one flat, irregular obsidian island.
# Only the outside silhouette fractures; there are no gameplay holes or raised obstacles.
outline=[]
for i in range(64):
 a=i/64*math.tau;r=51.7+1.4*math.sin(a*7)+.6*math.sin(a*13)
 outline.append((math.cos(a)*r,math.sin(a)*r))
prism(shelf,outline,-1.5,-.032,'basalt');shelf.colors[-1]=C['basaltDark']
# Faceted floating underside descends to an asymmetric shard keel.
n=len(outline);rings=[[(x,y,-1.5)for x,y in outline]]
for scale,height in[(.93,-4.0),(.65,-8.5),(.24,-12.8)]:
 rings.append([(x*scale+1.5*(1-scale),y*scale-2*(1-scale),height+random.uniform(-1,1))for x,y in outline])
for j in range(len(rings)-1):
 for i in range(n):
  vertices=[rings[j][i],rings[j][(i+1)%n],rings[j+1][(i+1)%n],rings[j+1][i]]
  shelf.add(vertices,[(0,1,2),(0,2,3)],random.choice(['basalt','basaltDark','basaltLight']))
shelf.add(rings[-1],[tuple(reversed(range(n)))],'basaltDark')
for i in range(30):
 a=i/30*math.tau;radius=random.uniform(39,48)
 crystal(shards,(math.cos(a)*radius,math.sin(a)*radius,-2),-random.uniform(5,11),random.uniform(1.0,2.8),'basalt',(math.cos(a)*1.5,math.sin(a)*1.5))
# Irregular plates replace the former woodland cobbles. Their beveled tops stay at exactly zero.
seeds=[]
for row in range(-10,11):
 for col in range(-10,11):
  x=(col+(row%2)*.5)*5.25+random.uniform(-1.4,1.4);y=row*4.6+random.uniform(-1.2,1.2)
  if math.hypot(x,y)<51:seeds.append((x,y))
boundary=[(math.cos(i/96*math.tau)*49.3,math.sin(i/96*math.tau)*49.3)for i in range(96)]
def clip(poly,nx,ny,limit):
 out=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  da=a[0]*nx+a[1]*ny-limit;db=b[0]*nx+b[1]*ny-limit
  if da<=0:out.append(a)
  if (da<=0)!=(db<=0):
   t=da/(da-db);out.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
 return out
for sx,sy in seeds:
 poly=boundary[:]
 for ox,oy in seeds:
  if(sx,sy)==(ox,oy)or(sx-ox)**2+(sy-oy)**2>170:continue
  poly=clip(poly,ox-sx,oy-sy,(ox*ox+oy*oy-sx*sx-sy*sy)/2)
  if not poly:break
 if len(poly)<3:continue
 center=Vector((sum(p[0]for p in poly)/len(poly),sum(p[1]for p in poly)/len(poly)))
 poly=[tuple(center+(Vector(p)-center)*.985)for p in poly]
 shade=random.uniform(.93,1.08);color=tuple(v*shade if i<3 else 1 for i,v in enumerate(C['plate']))
 prism(platform,poly,-.13,0,color,.018)
 # Small etched chevrons break up broad stone faces without imitating danger tells.
 if random.random()<.48 and math.hypot(sx,sy)>8:
  a=random.randrange(4)*math.pi/2;c,s=math.cos(a),math.sin(a)
  def p(x,y):return(sx+x*c-y*s,sy+x*s+y*c,.004)
  line(platform,p(-.6,.1),p(0,.6),.055,'edgeDark');line(platform,p(0,.6),p(.6,.1),.055,'edgeDark')
# A subdued broken eclipse sigil and hairline geometric fault channels remain below players' feet.
for radius,width,color in[(5.9,.045,'faintViolet'),(6.6,.065,'rune'),(31.8,.035,'rune')]:
 for i in range(80):
  if i%10==0:continue
  a=i/80*math.tau;b=(i+.78)/80*math.tau
  line(platform,(math.cos(a)*radius,math.sin(a)*radius,.011),(math.cos(b)*radius,math.sin(b)*radius,.011),width,color)
for i in range(8):
 angle=(i+.5)/8*math.tau;points=[]
 for j in range(7):
  r=8+j*3.8;a=angle+(.018 if j%2 else-.018)
  points.append((math.cos(a)*r,math.sin(a)*r,.008))
 for a,b in zip(points,points[1:]):line(platform,a,b,.052,'faintViolet')
for i in range(16):
 a=(i+.5)/16*math.tau;c,s=math.cos(a),math.sin(a);r=30.4
 def p(x,y):return(c*r+x*c-y*s,s*r+x*s+y*c,.012)
 for start,end in[((-.55,-.4),(0,.55)),((0,.55),(.55,-.4)),((0,.55),(0,-.55)),((-.30,.05),(.30,.05))]:line(platform,p(*start),p(*end),.085,'rune')
# Exterior fault lines leak vivid energy down the island's broken sides, outside combat space.
for i in range(28):
 a=(i+.27)/28*math.tau;r=50+random.uniform(0,1.5);points=[]
 for t in[0,.25,.55,.8,1]:points.append((math.cos(a+.015*math.sin(t*17))*(r-t*6),math.sin(a+.015*math.sin(t*17))*(r-t*6),-.1-t*7.5))
 path(energy,points,.055,'cyan'if i%4==0 else'violet')

def obelisk(x,y,height=9,width=2.0,angle=0,broken=False):
 c,s=math.cos(angle),math.sin(angle)
 def p(a,b,z):return(x+a*c-b*s,y+a*s+b*c,z)
 block((x,y,.28),(width*2.0,width*1.5,.56),'obsidian',angle)
 block((x,y,.70),(width*1.6,width*1.28,.40),'edgeDark',angle)
 # Stacked, chamfered shaft sections, cut collars and front recesses.
 for tier in range(5):
  z=1.1+tier*(height-1.8)/5;w=width*(1-tier*.055)
  block(p(.05*tier,.01*tier,z),(w,width*.75,(height-1.8)/5-.075),'plate'if tier%2 else'obsidian',angle)
  block(p(.05*tier,0,z+(height-1.8)/10-.055),(w*1.065,width*.80,.10),'edgeDark',angle)
  box(inscriptions,p(.05*tier,-width*.386,z),(.70*width,.035,(height-1.8)/5*.64),'runeDark',angle)
  for side in[-1,1]:
   bar(inscriptions,p(.05*tier+side*w*.31,-width*.398,z-.30),p(.05*tier+side*w*.31,-width*.398,z+.30),.028,'edge',sides=4)
  # Angular glyph with a crystalline center, repeated at an intentional readable scale.
  for a,b in[((-.22,-.33),(0,.25)),((0,.25),(.22,-.33)),((0,.25),(0,-.23))]:
   bar(energy,p(.05*tier+a[0],-width*.41,z+a[1]),p(.05*tier+b[0],-width*.41,z+b[1]),.025,'cyan'if tier%3==0 else'violet',sides=4)
 if not broken:
  crystal(monoliths,p(.25,0,height-1.4),2.3,width*.50,'obsidian',(.20*c,.20*s))
  crystal(energy,p(.25,-width*.12,height-.8),1.0,width*.16,'violet')
 else:block(p(.25,0,height-.55),(width*.85,width*.70,.35),'edge',angle+.13)
 # Pierced geometric wing brackets replace natural roots and foliage.
 for side in[-1,1]:
  points=[p(side*width*.5,0,1.0),p(side*width*.90,0,2.0),p(side*width*.85,0,3.2)]
  path(inscriptions,points,.12,'edgeDark')
  path(energy,[p(side*width*.56,-.08,1.1),p(side*width*.82,-.08,2.0),p(side*width*.77,-.08,2.75)],.035,'violet')

def gate(cx,cy,angle,width,height):
 c,s=math.cos(angle),math.sin(angle)
 def p(x,y,z):return(cx+x*c-y*s,cy+x*s+y*c,z)
 for side in[-1,1]:
  x,y,z=p(side*width/2,0,0);obelisk(x,y,height*.66,2.25,angle,True)
 # Broken arch segments hover above the old sockets, with an open central fracture.
 for i in range(11):
  if i in[4,6]:continue
  a=i/10*math.pi;center=p(math.cos(a)*width/2,0,height*.60+math.sin(a)*height*.36)
  block(center,(2.0,2.30,1.45),'plateLight'if i%3==0 else'obsidian',angle+(i%3-1)*.06)
  q=p(math.cos(a)*width/2,-1.18,height*.60+math.sin(a)*height*.36)
  box(inscriptions,q,(.92,.035,.75),'runeDark',angle)
  for j in range(3):bar(energy,(q[0]+(j-1)*.22*c,q[1]+(j-1)*.22*s,q[2]-.24),(q[0]+(j-1)*.22*c,q[1]+(j-1)*.22*s,q[2]+.24),.025,'cyan'if i%4==0 else'violet',sides=4)
 crystal(shards,p(.1,.15,height+.1),2.9,1.15,'obsidian',(.35,0))
 crystal(energy,p(.1,-.10,height+.3),1.25,.36,'violet')

# Tall northern silhouettes, side obelisks, and low southeast fragments preserve the camera view.
gate(0,40.5,0,12,12.8)
gate(-40.8,5,math.pi/2,10,10.5)
for x,y,h,w,a in[(-25,40,10,2.0,.1),(24,40.5,9,1.8,-.1),(-41.3,27,8,1.8,math.pi/2),(-41.5,-22,6.8,1.7,math.pi/2),(41,27,8,1.8,-math.pi/2),(41,-11,4.6,1.7,-math.pi/2),(-25,-40,4.5,1.9,0),(14,-41,3.8,1.8,0)]:obelisk(x,y,h,w,a,h<7)
# Displaced architecture and cut monolithic teeth mark an alien, ruined perimeter.
for side in range(4):
 for i in range(8):
  t=-31+i*9+random.uniform(-.8,.8);x,y=(t,43)if side==0 else(-44,t)if side==1 else(t,-43)if side==2 else(44,t)
  if math.hypot(x,y)>53 or(side==0 and abs(t)<14)or(side==1 and abs(t-5)<12):continue
  h=random.uniform(1,2.5)if side in[2,3]else random.uniform(2,4)
  crystal(shards,(x,y,0),h,random.uniform(1,1.9),'obsidian',(random.uniform(-.6,.6),random.uniform(-.6,.6)))
  for j in range(3):
   ox=x+random.uniform(-1.5,1.5);oy=y+random.uniform(-1.5,1.5)
   crystal(shards,(ox,oy,.1),random.uniform(.5,1.4),random.uniform(.3,.6),'basalt',(0,.2))
# Suspended diamonds and splinter clouds replace every tree, fern, mushroom and lantern.
for i in range(22):
 a=(i+.3)/22*math.tau;r=random.uniform(48,51);x,y=math.cos(a)*r,math.sin(a)*r
 if max(abs(x),abs(y))<39:continue
 front=(x*.54-y*.84)/r;z=random.uniform(6.5,11)if front<.1 else random.uniform(2.8,4.6)
 h=random.uniform(2.4,4.1);crystal(shards,(x,y,z),h,random.uniform(.75,1.25),'obsidian',(math.cos(a)*.5,math.sin(a)*.5))
 crystal(energy,(x,y-.16,z+h*.23),h*.50,.22,'cyan'if i%3==0 else'violet')
 for j in range(6):
  b=j/6*math.tau;ox=x+math.cos(b)*2.0;oy=y+math.sin(b)*2.0
  if max(abs(ox),abs(oy))<35:continue
  crystal(shards,(ox,oy,z+random.uniform(-1.2,1.1)),random.uniform(.35,.9),random.uniform(.14,.27),'basalt',(.1,.1))
 # Small orbit fragments imply a field of force without runtime lights or a billboard.
 for j in range(14):
  b=(j+.5)/14*math.tau;ox=x+math.cos(b)*1.8;oy=y+math.sin(b)*1.8
  bar(inscriptions,(ox,oy,z+h*.45),(ox+.11*math.cos(b),oy+.11*math.sin(b),z+h*.45+.18),.05,'edge',sides=4)
# Additional low fractured floor rims are outside the playable square and stay clear of corners.
for i in range(110):
 a=random.uniform(0,math.tau);r=random.uniform(47,52);x,y=math.cos(a)*r,math.sin(a)*r
 if max(abs(x),abs(y))<37.5:continue
 crystal(shards,(x,y,-.10),random.uniform(.4,1.2),random.uniform(.35,.9),'obsidian',(math.cos(a)*.3,math.sin(a)*.3))

root=bpy.data.objects.new('raid-sanctum',None);scene.collection.objects.link(root)
root['contract']='Static void environment; metres; Y-up GLB; complete +/-34m combat square clear; flat y=0 floor; no collision changes.'
root['source']='Authored in Blender for Mossvale. Fractured obsidian, void monoliths, suspended shards and runes. No woodland assets.'
groups=[]
for name in['raid-sanctum-floor','raid-sanctum-decor']:
 group=bpy.data.objects.new(name,None);scene.collection.objects.link(group);group.parent=root;groups.append(group)
objects=[batch.mesh(groups[0]if i<2 else groups[1])for i,batch in enumerate([platform,shelf,monoliths,shards,inscriptions,energy])]
scene.world=bpy.data.worlds.new('Void abyss');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.012,.016,.038,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.40
bpy.ops.object.camera_add(location=(83,-130,112));camera=bpy.context.object;camera.name='Void sanctum inspection camera';camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=135;scene.camera=camera
for name,location,power,size,color in[('Violet sky',(-35,-20,90),45000,60,(.63,.57,1)),('Clear combat light',(20,-45,65),48000,55,(.68,.82,1)),('Abyss rim',(0,50,45),50000,40,(.32,.40,1)),('Under-island void bounce',(10,-50,-20),12000,35,(.22,.18,.65))]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,-1))-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
SOURCE.parent.mkdir(parents=True,exist_ok=True);OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for group in groups:group.select_set(True)
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
with tempfile.TemporaryDirectory(prefix='mossvale-void-sanctum-')as tmp:
 cli=['npx','--yes','@gltf-transform/cli@4.5.0'];dedup=str(Path(tmp)/'dedup.glb');pruned=str(Path(tmp)/'pruned.glb')
 subprocess.run(cli+['dedup',str(OUT),dedup],check=True);subprocess.run(cli+['prune',dedup,pruned,'--keep-leaves','true'],check=True);subprocess.run(cli+['quantize',pruned,str(OUT)],check=True)
data=OUT.read_bytes();length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length]);primitives=[p for m in gltf['meshes']for p in m['primitives']];triangles=sum(gltf['accessors'][p['indices']]['count']//3 for p in primitives)
assert len(primitives)<=8,(len(primitives),'draw calls');assert triangles<70000,triangles
print('VOID_SANCTUM_EXPORT',json.dumps({'bytes':len(data),'triangles':triangles,'drawCalls':len(primitives),'materials':len(gltf['materials']),'nodes':[n.get('name')for n in gltf['nodes']]}))
if '--render'in sys.argv:scene.render.filepath=str(PREVIEW);bpy.ops.render.render(write_still=True)
