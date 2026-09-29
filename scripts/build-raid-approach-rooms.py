"""Seven void chambers, adapted from Benji's supplied dungeon architectural motifs.
Blender --background --threads 4 --disable-autoexec --python scripts/build-raid-approach-rooms.py -- --render
All runtime roots remain at origin; room decorations do not become gameplay collisions.
"""
import bpy, math, random, subprocess, tempfile, sys, hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
ORIGINAL=ROOT/'assets/source/raid-approach/original/dungeon_room.blend'
OUT=ROOT/'public/models/raid-approach-rooms.glb'
SOURCE=ROOT/'assets/source/raid-approach-rooms.blend'
PREVIEW=ROOT/'assets/source/raid-approach-rooms-preview.png'
bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL),load_ui=False,use_scripts=False)
motifs={}
for name in ['Altar','Crystal']:
 obj=bpy.data.objects[name];vertices=[obj.matrix_world@v.co for v in obj.data.vertices]
 anchor=Vector(((min(v.x for v in vertices)+max(v.x for v in vertices))/2,(min(v.y for v in vertices)+max(v.y for v in vertices))/2,min(v.z for v in vertices)))
 motifs[name]=([v-anchor for v in vertices],[(tuple(p.vertices),obj.data.materials[p.material_index].name) for p in obj.data.polygons])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.name='Mossvale - seven void approach chambers'
random.seed(431007)
C={'stone':(.052,.039,.095,1),'slate':(.087,.070,.14,1),'edge':(.17,.14,.25,1),
 'dark':(.018,.011,.038,1),'steel':(.17,.20,.31,1),'bone':(.24,.21,.32,1),
 'cloth':(.052,.020,.12,1),'lilac':(.30,.16,.53,1),'violet':(.31,.055,.68,1),
 'cyan':(.10,.52,.68,1),'crystal':(.20,.055,.41,1),'inlay':(.093,.059,.16,1)}
materials=[]
for name,rough,metal,emission in [('Void chamber stone',.88,.08,0),('Void chamber facets',.65,.24,0),('Void chamber cold steel',.48,.6,0),('Void chamber inscriptions',.7,.05,0),('Void chamber energy',.6,.1,1.4)]:
 mat=bpy.data.materials.new(name);mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=rough;shader.inputs['Metallic'].default_value=metal
 attr=mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='ChamberTint';mat.node_tree.links.new(attr.outputs['Color'],shader.inputs['Base Color'])
 if emission:mat.node_tree.links.new(attr.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=emission
 materials.append(mat)

class Batch:
 def __init__(self,name,material):self.name=name;self.material=material;self.vertices=[];self.faces=[];self.colors=[]
 def add(self,vertices,faces,color):
  offset=len(self.vertices);self.vertices.extend(vertices);self.faces.extend(tuple(offset+i for i in face)for face in faces);self.colors.extend([C[color]]*len(faces))
 def mesh(self,parent):
  data=bpy.data.meshes.new(self.name);data.from_pydata(self.vertices,[],self.faces);data.update();data.materials.append(self.material)
  color=data.color_attributes.new(name='ChamberTint',type='BYTE_COLOR',domain='CORNER')
  for face,tint in zip(data.polygons,self.colors):
   for loop in face.loop_indices:color.data[loop].color=tint
  obj=bpy.data.objects.new(self.name,data);scene.collection.objects.link(obj);obj.parent=parent;return obj

def box(batch,center,size,color='stone',angle=0):
 x,y,z=center;w,d,h=(v/2 for v in size);c,s=math.cos(angle),math.sin(angle)
 batch.add([(x+a*c-b*s,y+a*s+b*c,z+k)for a,b,k in[(-w,-d,-h),(w,-d,-h),(w,d,-h),(-w,d,-h),(-w,-d,h),(w,-d,h),(w,d,h),(-w,d,h)]],[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],color)
def block(batch,center,size,color='stone',angle=0):
 x,y,z=center;w,d,h=size;cut=min(w,d)*.15;c,s=math.cos(angle),math.sin(angle)
 polygon=[(-w/2+cut,-d/2),(w/2-cut,-d/2),(w/2,-d/2+cut),(w/2,d/2-cut),(w/2-cut,d/2),(-w/2+cut,d/2),(-w/2,d/2-cut),(-w/2,-d/2+cut)];n=len(polygon)
 batch.add([(x+a*c-b*s,y+a*s+b*c,z+height)for height in[-h/2,h/2]for a,b in polygon],[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)],color)
def bar(batch,a,b,radius,color='bone',end=None,sides=6):
 a,b=Vector(a),Vector(b);direction=(b-a).normalized();axis=direction.cross(Vector((0,0,1)))
 if axis.length<.01:axis=direction.cross(Vector((0,1,0)))
 axis.normalize();other=direction.cross(axis).normalized();end=radius if end is None else end
 batch.add([tuple(p+(axis*math.cos(i/sides*math.tau)+other*math.sin(i/sides*math.tau))*r)for p,r in[(a,radius),(b,end)]for i in range(sides)],[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides)for i in range(sides)],color)
def line(batch,a,b,width,color='inlay'):
 a,b=Vector(a),Vector(b);side=(b-a).cross(Vector((0,0,1))).normalized()*width/2
 batch.add([tuple(a+side),tuple(b+side),tuple(b-side),tuple(a-side)],[(0,1,2,3)],color)
def paving_tile(polygon,color):
 center=Vector((sum(p[0]for p in polygon)/len(polygon),sum(p[1]for p in polygon)/len(polygon)))
 lower=[tuple(center+(Vector(p)-center)*.99)for p in polygon]
 upper=[tuple(center+(Vector(p)-center)*.975)for p in polygon];n=len(polygon)
 floor.add([(x,y,-.13)for x,y in lower]+[(x,y,0)for x,y in upper],[tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)],color)
def clip_tile(polygon,nx,ny,limit):
 out=[]
 for a,b in zip(polygon,polygon[1:]+polygon[:1]):
  da=a[0]*nx+a[1]*ny-limit;db=b[0]*nx+b[1]*ny-limit
  if da<=0:out.append(a)
  if (da<=0)!=(db<=0):
   t=da/(da-db);out.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
 return out
def path(batch,points,radius,color='bone'):
 for a,b in zip(points,points[1:]):bar(batch,a,b,radius,color,sides=5)
def ring(batch,center,radius,tube,color='steel',vertical=False,segments=24):
 x,y,z=center
 points=[(x+math.sin(i/segments*math.tau)*radius,y if vertical else y+math.cos(i/segments*math.tau)*radius,z+math.cos(i/segments*math.tau)*radius if vertical else z)for i in range(segments+1)]
 for a,b in zip(points,points[1:]):bar(batch,a,b,tube,color,sides=4)
def gem(batch,center,size,color='crystal'):
 x,y,z=center;a,b,c=size;batch.add([(x-a,y,z),(x+a,y,z),(x,y-b,z),(x,y+b,z),(x,y,z-c),(x,y,z+c)],[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)],color)
def rune(batch,x,y,z,size=.5,color='cyan'):
 path(batch,[(x-size,y,z-size),(x,y,z+size),(x+size*.7,y,z),(x,y,z-size*.3)],.035,color)
def motif(name,x,y,z,scale=1):
 vertices,polys=motifs[name];points=[tuple(Vector((x,y,z))+v*scale)for v in vertices]
 for face,mat in polys:
  luminous=mat in ['Rune','Crystal'];batch=energy if luminous else masonry
  color='violet'if mat=='Crystal'else'cyan'if mat=='Rune'else'steel'if mat in['Iron','Banner_Trim']else'dark'if mat=='Void'else'slate'
  batch.add([points[i]for i in face],[tuple(range(len(face)))],color)
def banner(x,y,z,width=3,height=5):
 bar(metal,(x-width*.7,y,z+.3),(x+width*.7,y,z+.3),.12,'steel')
 cloth.add([(x-width/2,y,z),(x+width/2,y,z),(x+width/2,y,z-height*.78),(x+width*.22,y-.1,z-height),(x,y-.15,z-height*.82),(x-width/2,y,z-height*.95)],[(0,1,2,3,4,5)],'cloth')
 for side in[-1,1]:path(metal,[(x+side*width*.43,y-.025,z-.1),(x+side*width*.43,y-.025,z-height*.72)],.025,'steel')
 rune(energy,x,y-.08,z-height*.4,width*.2,'violet')
def skull(x,y,z,size=1):
 block(detail,(x,y,z),(size*1.35,size*.8,size*1.4),'bone');block(detail,(x,y-.07,z-size*.7),(size*.95,size*.7,size*.38),'slate')
 for side in[-1,1]:gem(cloth,(x+side*size*.31,y-size*.405,z+size*.12),(size*.22,.025,size*.19),'dark')
 for i in range(5):box(metal,(x+(i-2)*size*.17,y-size*.42,z-size*.61),(size*.10,.05,size*.28),'steel')
def arch(x,y,height=10,width=17):
 for side in[-1,1]:
  for tier in range(5):
   block(masonry,(x+side*width/2,y,.85+tier*height*.12),(2.0,2.5,1.6),'slate'if tier%2 else'stone')
   block(detail,(x+side*width/2,y-1.3,.85+tier*height*.12),(1.55,.12,1.15),'edge')
   gem(metal,(x+side*width/2,y-1.39,.85+tier*height*.12),(.28,.04,.40),'steel')
  rune(energy,x+side*width/2,y-1.26,height*.4,.45,'cyan')
  block(masonry,(x+side*width/2,y,.30),(3.2,3.6,.6),'edge')
  block(metal,(x+side*width/2,y,height*.56),(2.7,3.0,.25),'steel')
 for i in range(13):
  a=(i+.04)/13*math.pi;b=(i+.96)/13*math.pi
  quad=[(x+math.cos(t)*rx,height*.58+math.sin(t)*rz)for t,rx,rz in[(a,width/2-1,height*.4-.65),(b,width/2-1,height*.4-.65),(b,width/2+1,height*.4+.65),(a,width/2+1,height*.4+.65)]]
  masonry.add([(xx,yy,zz)for yy in[y-1.25,y+1.25]for xx,zz in quad],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'edge'if i%3==0 else'stone')
  t=(a+b)/2
  gem(metal,(x+math.cos(t)*width/2,y-1.29,height*.58+math.sin(t)*height*.4),(.24,.05,.32),'steel')
  if i%2==0:gem(energy,(x+math.cos(t)*width/2,y-1.36,height*.58+math.sin(t)*height*.4),(.10,.035,.18),'violet')

names=['Void Garden','Umbral Kennels','Hollow Hive','Silent Ossuary','Black Forge','Fallen Citadel','Morgrath Court']
roots=[]
for room,name in enumerate(names):
 # Tinted stone remains in one shared material while each chamber gets its own value rhythm.
 C['stone']=[(.064,.039,.091,1),(.053,.052,.084,1),(.045,.027,.075,1),(.072,.075,.115,1),(.038,.034,.066,1),(.068,.061,.115,1),(.035,.04,.083,1)][room]
 C['slate']=tuple(v*1.22 if i<3 else 1 for i,v in enumerate(C['stone']))
 root=bpy.data.objects.new(f'raid-chamber-{room}',None);scene.collection.objects.link(root);roots.append(root)
 root['room_name']=name;root['source_sha256']=hashlib.sha256(ORIGINAL.read_bytes()).hexdigest();root['source']='Benji dungeon_room.blend altar/crystal motifs; new void chamber geometry';root['contract']='Flat Y=0 floor; playable +/-34m square; north gate at (0,-27), posts outside central +/-6m path.'
 floor_group=bpy.data.objects.new(root.name+'-floor',None);decor_group=bpy.data.objects.new(root.name+'-decor',None)
 for group in[floor_group,decor_group]:scene.collection.objects.link(group);group.parent=root
 floor=Batch(root.name+'-tiles',materials[0]);masonry=Batch(root.name+'-masonry',materials[0]);detail=Batch(root.name+'-facets',materials[1]);metal=Batch(root.name+'-metal',materials[2]);cloth=Batch(root.name+'-inscriptions',materials[3]);energy=Batch(root.name+'-energy',materials[4])
 # A fractured foundation supports the whole perimeter; every combat tile is flat.
 box(floor,(0,0,-.45),(94,94,.8),'dark')
 for side in range(4):
  for k in range(17):
   t=(k-8)*5.4;x,y=(t,47)if side==0 else(-47,t)if side==1 else(t,-47)if side==2 else(47,t)
   block(masonry,(x,y,-1.8),(5.5,5.5,3.4),'slate'if k%3==0 else'stone')
   gem(detail,(x,y,-4.0-random.random()),(2.6,2.5,4.5+random.random()*2),'dark')
   if k%4==0:bar(energy,(x,y,-.4),(x*.98,y*.98,-4.5),.045,'violet')
 seeds=[]
 sx,sy=[(5.5,5),(6,3),(5.8,5),(4.5,4.5),(5,4),(5.3,4.6),(6,6)][room]
 for row in range(-13,14):
  for col in range(-13,14):
   x=(col+(row%2)*(.5 if room in[0,1,2,4,5]else 0))*sx;y=row*sy
   if room in[0,5]:x+=random.uniform(-1.4,1.4);y+=random.uniform(-1.2,1.2)
   if room==3:x,y=(x-y)*.7071,(x+y)*.7071
   if abs(x)<41 and abs(y)<41:seeds.append((x,y))
 for x,y in seeds:
   polygon=[(-36,-36),(36,-36),(36,36),(-36,36)]
   for ox,oy in seeds:
    if (x,y)==(ox,oy)or(x-ox)**2+(y-oy)**2>160:continue
    polygon=clip_tile(polygon,ox-x,oy-y,(ox*ox+oy*oy-x*x-y*y)/2)
    if not polygon:break
   if len(polygon)<3:continue
   paving_tile(polygon,'slate'if random.random()<.32 else'stone')
   if abs(x)>34 or abs(y)>34:continue
   if random.random()<.48:
    line(floor,(x-1.5,y-1.4,.007),(x-.9,y-.95,.007),.035,'inlay');line(floor,(x-.9,y-.95,.007),(x-.65,y-1.35,.007),.035,'inlay')
   if random.random()<.13:
    for dx in[-.35,.35]:line(floor,(x+dx,y-.45,.009),(x+dx,y+.45,.009),.07,'inlay')
    line(floor,(x-.35,y,.009),(x+.35,y,.009),.07,'inlay')
 # Dressed coping and exterior stair bands make the room footprint read as a ruin.
 for side in range(4):
  for k in range(18):
   t=(k-8.5)*4.1;x,y=(t,36.6)if side==0 else(-36.6,t)if side==1 else(t,-36.6)if side==2 else(36.6,t)
   block(floor,(x,y,-.03),(3.95,1.05,.06)if side%2==0 else(1.05,3.95,.06),'edge')
   for step in range(2):
    xx=x if side%2==0 else x+(step+.8)*(1 if x>0 else-1)
    yy=y if side%2 else y+(step+.8)*(1 if y>0 else-1)
    block(masonry,(xx,yy,-.1-step*.17),(3.9,1,.18)if side%2==0 else(1,3.9,.18),'slate')
 # Seven subdued inlay plans are visually distinct without resembling attack tells.
 for i in range(11):
  t=(i-5)*5.4
  if room==0:
   for side in[-1,1]:line(floor,(t,side*28,.012),(t*.18,side*4,.012),.10)
  elif room==1:
   for side in[-1,1]:line(floor,(side*27,t,.012),(side*12,t,.012),.15)
  elif room==2:
   for side in[-1,1]:line(floor,(t,side*27,.012),(t+side*4,side*21,.012),.14)
  elif room==3:
   line(floor,(t,-28,.012),(t,28,.012),.065)
  elif room==4:
   for side in[-1,1]:line(floor,(side*24,t,.012),(side*16,t+3,.012),.12)
  elif room==5:
   for side in[-1,1]:line(floor,(t,side*25,.012),(t+2,side*22,.012),.13)
  else:
   line(floor,(-12,t,.012),(12,t,.012),.08)
 for side in[-1,1]:line(floor,(side*(10+room),-31,.014),(side*(10+room),31,.014),.09)
 # Carved heraldic medallions stay unlit and hairline-thin, separate from spell tells.
 sectors=[6,4,6,8,12,4,7][room]
 for i in range(sectors):
  a=i/sectors*math.tau;b=(i+.82)/sectors*math.tau
  for radius in[5.6,6.1]:line(floor,(math.cos(a)*radius,math.sin(a)*radius,.018),(math.cos(b)*radius,math.sin(b)*radius,.018),.08,'inlay')
  line(floor,(math.cos(a)*3.4,math.sin(a)*3.4,.018),(math.cos(a)*5.25,math.sin(a)*5.25,.018),.07,'edge')
 # Fragmented masonry north and sides; southern fragments stay low for the game camera.
 for wall in range(4):
  for column in range(10):
   t=(column-4.5)*7.7
   if wall in[0,2]and abs(t)<10:continue
   if room in[0,2]and wall!=2 and column%3!=0:continue
   if room==1 and wall!=2 and column%2!=0:continue
   x,y=(t,44)if wall==0 else(-44,t)if wall==1 else(t,-44)if wall==2 else(44,t)
   angle=math.pi/2 if wall in[1,3]else 0
   tiers=1 if wall==2 else [1+column%2,2,1+column%3,3,2+column%2,3+column%3,3][room]
   for tier in range(tiers):block(masonry,(x,y,.65+tier*1.34),(7.2,2.8,1.25),'slate'if(tier+column)%3==0 else'stone',angle)
   block(detail,(x,y,tiers*1.34),(7.6,3.2,.25),'edge',angle)
   # Recessed fascia and chunky stone buttresses face into the courtyard.
   inward=Vector((-x,-y,0)).normalized();fx,fy=x+inward.x*1.47,y+inward.y*1.47
   block(detail,(fx,fy,1.8),(5.4,.15,1.65),'dark',angle)
   for offset in[-2.3,0,2.3]:
    xx,yy=fx+offset*math.cos(angle),fy+offset*math.sin(angle)
    block(metal,(xx,yy,1.8),(.26,.22,1.3),'steel',angle)
   for offset in[-3.3,3.3]:
    xx,yy=x+offset*math.cos(angle)+inward.x*.6,y+offset*math.sin(angle)+inward.y*.6
    block(masonry,(xx,yy,1.6),(1.15,3.0,3.2),'edge',angle)
   for k in range(2):gem(detail,(x+random.uniform(-1,1),y+random.uniform(-1,1),tiers*1.34+.15),(.7,.7,.65),'slate')
 arch(0,27,10+room*.35,18)
 # South entry is flat and open, with paired low crystal sockets outside the square.
 for side in[-1,1]:
  block(masonry,(side*11,-39,.5),(3.2,3.5,1),'dark');gem(energy,(side*11,-39,1.7),(.35,.4,1.1),'violet')

 if room==0: # Calcified root canopies and obsidian blossoms.
  for side in[-1,1]:
   for j in range(6):
    x=side*(38+j%2);y=-27+j*11;h=16+(j%3)*3
    points=[(x,y,0),(x+side*.8,y+.7,h*.36),(x+side*.3,y+1,h*.75),(x-side*.5,y+1.2,h)]
    path(detail,points,.90,'bone');path(energy,[(a,b-.8,c)for a,b,c in points],.10,'violet')
    for k in[-1,1]:
     path(detail,[points[2],(x+side*1.3,y+k*3,h*.85),(x+side*.6,y+k*5,h+1)],.48,'slate')
     path(detail,[(x+side*.3,y+1,h*.58),(x+side*1.2,y+k*3,h*.48),(x+side*.9,y+k*4.5,h*.62)],.36,'slate')
    for petal in range(6):
     a=petal/6*math.tau;gem(detail,(x+math.sin(a)*1.6,y+math.cos(a)*1.6,3),(.8,1.1,2.2),'crystal')
    gem(energy,(x,y,3.8),(.45,.45,1.4),'cyan')
  for side in[-1,1]:motif('Altar',side*24,39,0,1.0);motif('Crystal',side*24,39,1.6,1.2)
 elif room==1: # Broken barred kennels and bone cages.
  for side in[-1,1]:
   for j in range(4):
    x,y=side*40,-24+j*16;block(masonry,(x,y,.45),(7.5,11,.9),'dark')
    for k in range(7):
     yy=y+(k-3)*1.45;path(detail,[(x-side*3.3,yy,.3),(x-side*3.0,yy,8),(x,yy,12),(x+side*3.0,yy,8.5),(x+side*3.3,yy,.3)],.28,'bone')
    for h in[2.4,6.2]:bar(metal,(x-side*3.2,y-4.6,h),(x-side*3.2,y+4.6,h),.20,'steel')
    for j2 in range(3):gem(detail,(x+side*2.4,y+(j2-1)*3.1,11.2),(.6,.7,2.2),'slate')
    skull(x-side*3.2,y,9.3,1.0)
  for side in[-1,1]:arch(side*25,39,14,12)
 elif room==2: # Chitin ribs, clutching eggs and sparse web filaments.
  for side in[-1,1]:
   for j in range(7):
    x,y=side*40,-30+j*10;points=[(x,y,0),(x+side*2,y,6),(x+side*3,y,13),(x+side*.6,y,18),(x-side*2,y,20)]
    for k in range(len(points)-1):bar(detail,points[k],points[k+1],1.1 if k<2 else .8,'slate',end=.8 if k<2 else .28)
    for n in range(4):gem(detail,(x+side*(n%2),y+(n//2-.5)*3,2.4+n%2),(.95,1.3,2.8),'crystal')
    for n in range(4):path(energy,[(x+side*.3,y-4,8+n*1.4),(x+side*.4,y,13+n*.6),(x+side*.3,y+4,8+n*1.4)],.045,'lilac')
  for x in[-27,-17,17,27]:gem(detail,(x,39,8),(3,2.4,8),'dark');rune(energy,x,36.55,8,1.5,'violet')
 elif room==3: # Sarcophagi, inscribed banners and skull reliquary walls.
  for side in[-1,1]:
   for j in range(5):
    x,y=side*40,-27+j*13;block(masonry,(x,y,1.25),(5,9,2.5),'dark');block(detail,(x,y,3),(4.7,8.6,1),'edge')
    box(cloth,(x,y,3.52),(1.6,4,.05),'cloth')
    for n in range(4):gem(metal,(x,y+(n-1.5)*.7,3.6),(.35,.25,.08),'steel')
    skull(x,y+2.3,4.2,1.1)
   for j in range(5):
    x=side*(14+j*5);block(masonry,(x,40,5),(4.5,4,10),'dark');skull(x,37.9,9.5,1.6)
   banner(side*23,37.3,17,4,8)
 elif room==4: # Anvil, chains and cold crucibles beyond the battle floor.
  for side in[-1,1]:
   for j in range(4):
    x,y=side*40,-25+j*17
    for tier in range(4):block(masonry,(x,y,.9+tier*1.55),(7-tier*.45,7-tier*.45,1.8),'dark')
    ring(metal,(x,y,7.1),3.15,.45,'steel');ring(energy,(x,y,7.05),2.6,.24,'violet')
    for i in range(5):gem(energy,(x+math.sin(i*2.4)*1.5,y+math.cos(i*2.4)*1.5,7.8+i*.25),(.35,.35,1.1),'violet')
    for dy in[-3,3]:bar(metal,(x,y+dy,1),(x,y+dy,10),.20,'steel')
  block(masonry,(0,40,1.5),(20,7,3),'dark');block(metal,(0,40,5),(11,5,5),'steel');block(metal,(0,40,9),(20,6,2),'steel');gem(metal,(-12,40,9),(5,2.5,1.4),'steel')
  for x in[-20,20]:
   bar(detail,(x,39,0),(x,39,21),1.2,'slate')
   for j in range(14):ring(metal,(x,37.5,2+j*1.3),.80,.15,'steel',j%2==0,12)
   rune(energy,x,37.7,18,1.2,'cyan')
 elif room==5: # Crumbled battlements, ragged standards and weapon trophies.
  for side in[-1,1]:
   for j in range(5):
    x,y=side*40,-28+j*14;height=12+(j%3)*2
    block(masonry,(x,y,height/2),(5,5,height),'slate')
    for ox,oy in[(-1.7,-1.7),(1.7,-1.7),(-1.7,1.7),(1.7,1.7)]:block(masonry,(x+ox,y+oy,height+.6),(1.2,1.2,1.4),'edge')
    if j%2==0:banner(x-side*2.6,y-1,height,3,7)
   for j in range(3):
    x,y=side*(18+j*8),39
    for tilt in[-1,1]:bar(metal,(x-tilt*2.2,y,1),(x+tilt*2.2,y,11),.24,'steel');gem(detail,(x+tilt*2.3,y,12),(.8,.35,2),'edge')
    ring(metal,(x,y-.2,6.5),2,.22,'steel',True,16)
 elif room==6: # Morgrath's throne, blade plinths and crowned bone crest.
  for tier in range(4):block(masonry,(0,40,tier*.45+.25),(17-tier*1.5,8-tier*.65,.5),'slate')
  block(detail,(0,41,9),(12,4,17),'dark');block(metal,(0,39.5,5),(12.5,5,1.8),'steel')
  for side in[-1,1]:block(detail,(side*6.4,39.7,6.2),(1.8,5.5,6.0),'edge');bar(detail,(side*6.4,41,8),(side*8,41,22),.9,'bone',end=.06)
  skull(0,38.8,16.4,3.0);rune(energy,0,38.85,10.4,2,'violet')
  for side in[-1,1]:
   for j in range(5):
    x,y=side*40,-25+j*14;block(masonry,(x,y,.5),(4,4,1),'dark')
    bar(metal,(x,y,.8),(x,y,3.1),.16,'steel');bar(metal,(x-1.5,y,2.9),(x+1.5,y,2.9),.14,'steel')
    gem(detail,(x,y,10),(1.6,.6,7.4),'edge');bar(energy,(x,y-.62,3.5),(x,y-.62,16.6),.085,'cyan')
   banner(side*19,37.3,19,5,11);motif('Altar',side*29,39,0,.8)
 # Loose perimeter rubble is broken into faceted clusters, never spread across combat paths.
 for j in range(70):
  side=j%4;t=random.uniform(-35,35);x,y=(t,43)if side==0 else(-43,t)if side==1 else(t,-42)if side==2 else(43,t)
  gem(detail,(x+random.uniform(-1,1),y+random.uniform(-1,1),.4),(.3+random.random(),.4+random.random(),.35+random.random()),'slate')
 batches=[floor,masonry,detail,metal,cloth,energy]
 for i,batch in enumerate(batches):
  if batch.faces:batch.mesh(floor_group if i==0 else decor_group)
 triangles=sum(sum(len(face)-2 for face in batch.faces)for batch in batches)
 assert triangles<50000,(name,triangles)
 print('CHAMBER_GEOMETRY',room,name,triangles,'triangles',sum(bool(batch.faces)for batch in batches),'draws',flush=True)

OUT.parent.mkdir(parents=True,exist_ok=True);SOURCE.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
with tempfile.TemporaryDirectory(prefix='raid-approach-rooms-')as tmp:
 cli=['npx','--yes','@gltf-transform/cli@4.5.0'];dedup=str(Path(tmp)/'dedup.glb');pruned=str(Path(tmp)/'pruned.glb')
 subprocess.run(cli+['dedup',str(OUT),dedup],check=True);subprocess.run(cli+['prune',dedup,pruned,'--keep-leaves','true'],check=True);subprocess.run(cli+['quantize',pruned,str(OUT)],check=True)
# Editable inspection layout only. The exported runtime groups above all stay at origin.
for i,root in enumerate(roots):root.location=((i%4-1.5)*94,(i//4-.5)*105,0)
world=bpy.data.worlds.new('Chamber inspection');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.018,.012,.04,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
bpy.ops.object.camera_add(location=(100,-270,330));camera=bpy.context.object;camera.name='Seven chamber overview';camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=435;scene.camera=camera
for name,loc,power,size in [('Void sky',(-80,-40,150),450000,220),('Cold rim',(80,110,100),320000,180)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.render.threads_mode='FIXED';scene.render.threads=4;scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=2400;scene.render.resolution_y=1500;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
print('RAID_APPROACH_ROOMS_EXPORT',OUT.stat().st_size,'bytes, seven origin-root chambers, five shared palettes',flush=True)
if '--render'in sys.argv:scene.render.filepath=str(PREVIEW);bpy.ops.render.render(write_still=True)
