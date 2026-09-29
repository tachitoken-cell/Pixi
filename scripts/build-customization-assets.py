"""Author Mossvale's original voxel hair, race and face add-ons in Blender.

blender --background --python scripts/build-customization-assets.py -- --render --optimize
Library roots are identity, metres, Y-up and +Z-front. All are head-local except
the body-local foxfolk tail. Head center is Y1.90; meshes have extras.tint.
"""
import bpy
import math
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/customization-kit.glb'
SOURCE=ROOT/'assets/source/customization-kit.blend'
PREVIEW=ROOT/'assets/source/customization-kit-preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(x,y,z):return (x,-z,y)
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def color(value):return tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,)
WHITE=(1,1,1,1);INK=color('433435');BONE=color('EFE1BF');ROSE=color('9C655B');FRECKLE=color('936341');SCAR=color('BF8D78')
parts={};active='';counts={}
def item(name):
 global active
 active=name;parts[name]={};counts[name]=0
def data(tint):return parts[active].setdefault(tint,{'v':[],'f':[],'c':[]})
def mesh_shape(tint,vertices,faces,rgb=WHITE):
 d=data(tint);base=len(d['v']);d['v'].extend(xyz(*point) for point in vertices)
 for face in faces:d['f'].append(tuple(base+i for i in face));d['c'].append(rgb)
def box(tint,x,y,z,w,h,d,angle=0,rgb=WHITE):
 c,s=math.cos(angle),math.sin(angle)
 vertices=[]
 for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
  xx,yy=a*w/2,b*h/2;vertices.append((x+xx*c-yy*s,y+xx*s+yy*c,z+f*d/2))
 mesh_shape(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],rgb);counts[active]+=1
def prism(tint,polygon,z,depth,rgb=WHITE):
 n=len(polygon);vertices=[(x,y,z+side*depth/2) for side in [-1,1] for x,y in polygon]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh_shape(tint,vertices,faces,rgb)
def cap(back=.18):
 box('hair',0,.365,-.005,.79,.13,.67)
 box('hair',0,.245,-.302,.77,back,.14)
def fringe(side=1):
 for n in range(3):box('hair',side*(-.23+n*.18),.28+n*.025,.318,.23,.16,.10,-side*.22)
def tuft(x,y,z,w,h,d,lean=0):
 for n in range(3):
  t=(n+.5)/3;box('hair',x+lean*t,y+h*t,z,w*(1-.6*t),h/3+.018,d*(1-.5*t))

item('hair-swept');cap();fringe()
box('hair',-.31,.20,.16,.17,.27,.37,-.10);box('hair',.33,.27,-.08,.13,.16,.52)
for n in range(3):box('hair',-.10+n*.14,.475-n*.022,-.06,.27,.15,.57,-.14)

item('hair-long');cap(.72);fringe(-1)
box('hair',0,-.25,-.335,.76,.83,.16)
for side in [-1,1]:
 box('hair',side*.385,-.10,-.10,.16,.81,.45)
 box('hair',side*.40,-.48,-.075,.14,.25,.36,side*.05)
 box('hair',side*.27,-.68,-.34,.18,.14,.12,side*.10)

item('hair-mohawk')
box('hair',0,.35,-.025,.27,.10,.70)
for n in range(5):tuft(0,.38,-.26+n*.135,.24,.33+(.08 if n in [1,2] else 0),.16)
box('hair',0,.10,-.335,.20,.50,.075)

item('hair-bob');cap(.65)
box('hair',0,-.12,-.33,.82,.57,.17)
for side in [-1,1]:
 box('hair',side*.397,-.03,.005,.18,.66,.62)
 box('hair',side*.397,-.35,.04,.17,.10,.59)
 box('hair',side*.31,.18,.32,.19,.21,.11,side*.10)
for n in range(4):box('hair',-.24+n*.16,.242+(n%2)*.014,.337,.17,.14,.09)

item('hair-braids');cap(.30);fringe()
for side in [-1,1]:
 box('hair',side*.37,.13,-.12,.14,.37,.46)
 for n in range(7):box('hair',side*(.405+(n%2)*.035),-.06-n*.105,.04,.16,.145,.20,side*(.17 if n%2 else -.17))
 box('accent',side*.422,-.62,.04,.19,.055,.215)
 box('hair',side*.42,-.73,.04,.12,.14,.16,side*.12)

item('hair-ponytail');cap(.31);fringe(-1)
box('hair',0,.28,-.405,.29,.22,.22)
box('accent',0,.19,-.438,.31,.065,.19)
for n in range(5):box('hair',.025*n,.08-n*.13,-.49-n*.015,.30-n*.022,.19,.23,-.08)
box('hair',.13,-.61,-.55,.16,.17,.18,-.16)

item('hair-spiky');cap(.25)
for x in [-.26,0,.26]:
 for z in [-.23,.02,.26]:tuft(x,.34,z,.27,.22+(.13 if abs(x)<.1 else .04),.22,x*.22)
for side in [-1,1]:box('hair',side*.37,.14,-.01,.12,.28,.51,side*.08)

item('hair-curly');cap(.28)
for x in [-.28,0,.28]:
 for z in [-.24,0,.24]:
  y=.42+(.045 if abs(x)<.1 else 0);box('hair',x,y,z,.28,.22,.27)
  box('hair',x-.035,y+.13,z-.025,.19,.095,.17)
for side in [-1,1]:
 for z in [-.19,.14]:box('hair',side*.39,.22,z,.18,.26,.26,side*.15)
for x in [-.27,-.08,.12,.29]:box('hair',x,.23,.345,.17,.15,.10)

item('hair-topknot');cap(.22);fringe(-1)
box('hair',0,.50,-.04,.39,.22,.37)
box('accent',0,.44,-.04,.31,.052,.30)
box('hair',.01,.65,-.07,.29,.16,.26)
box('hair',.10,.72,-.08,.16,.09,.17,-.23)

item('hair-sidecut')
box('hair',-.10,.36,-.015,.58,.15,.67)
box('hair',-.32,.14,-.05,.16,.50,.55)
box('hair',0,.19,-.322,.67,.39,.11)
for n in range(4):box('hair',-.26+n*.12,.28+n*.027,.328,.18,.18,.12,-.28)
for n in range(2):box('hair',.367,.17-n*.09,-.06,.025,.032,.34)
tuft(-.12,.40,-.05,.39,.20,.50,-.035)

item('hair-pixie');cap(.20)
for x,y in [(-.24,.27),(-.07,.22),(.10,.25),(.26,.30)]:box('hair',x,y,.32,.18,.14,.10,-.18)
for side in [-1,1]:box('hair',side*.361,.16,.07,.095,.24,.43,side*.05)
box('hair',-.10,.455,-.07,.48,.10,.48,-.12)

# Four additional silhouettes, using the same neutral voxel mesh pipeline.
item('hair-twin-buns');cap(.23);fringe()
for side in [-1,1]:
 box('hair',side*.39,.46,-.09,.32,.30,.32)
 box('hair',side*.39,.64,-.09,.23,.10,.23)
 box('accent',side*.36,.34,-.10,.27,.05,.27)
 box('hair',side*.39,-.08,.08,.12,.40,.13)
 for n in range(3):
  box('hairHighlight',side*(.31+n*.075),.45+(.035 if n==1 else 0),.079,.025,.19,.023,side*(n-1)*.14)
  box('hair',side*.39,-.27-n*.055,.08,.11-n*.025,.095,.12-n*.015,side*.12)
 box('accent',side*.38,.355,.072,.075,.065,.029)
item('hair-dreadlocks');cap(.24)
for side in [-1,1]:
 for n in range(4):
  for j in range(5):
   box('hair',side*(.35+(j%2)*.02),.26-j*.17,-.25+n*.17,.145,.19,.145,side*(.065 if j%2 else -.065))
   if n==3 and j%2==0:box('hairHighlight',side*.39,.24-j*.17,.343,.033,.12,.022,side*.12)
  if n%2:box('accent',side*.36,-.48,-.25+n*.17,.155,.045,.155)
for n in range(4):box('hair',-.27+n*.18,.22,.33,.14,.25,.12)
item('hair-fishtail');cap(.33);fringe(-1)
for n in range(8):
 box('hair',(-1 if n%2 else 1)*.055,.14-n*.115,-.40,.28-n*.017,.16,.19,(-1 if n%2 else 1)*.25)
 box('hairHighlight',(-1 if n%2 else 1)*.055,.14-n*.115,-.504,.14-n*.009,.031,.023,(-1 if n%2 else 1)*.25)
box('accent',0,-.70,-.40,.16,.06,.20)
item('hair-undercut')
box('hair',0,.36,-.04,.54,.12,.65)
for n in range(5):box('hair',-.11+n*.045,.46+n*.025,-.19+n*.08,.38,.15,.19,-.17)
for side in [-1,1]:
 box('hair',side*.354,.20,-.08,.035,.14,.39)
 for n in range(3):box('hairHighlight',side*.375,.25-n*.045,-.12,.014,.015,.19+n*.04)
for n in range(4):box('hairHighlight',-.14+n*.06,.475+n*.026,.229,.024,.10,.025,-.17)
# Neutral streak meshes make optional highlights visible on every haircut.
for name in list(parts):
 if not name.startswith('hair-'):continue
 active=name
 if name=='hair-mohawk':box('hairHighlight',0,.56,.22,.13,.16,.075)
 elif name=='hair-sidecut':box('hairHighlight',-.16,.40,.367,.10,.20,.026,-.28)
 else:box('hairHighlight',-.14,.365,.344,.075,.14,.025,-.12)

# Race details leave the eye rectangles clear; beards remain a separate future choice.
item('race-elf')
for side in [-1,1]:
 prism('skin',[(side*.345,-.09),(side*.48,-.08),(side*.80,.16),(side*.47,.15),(side*.35,.055)],-.015,.11)
 prism('accent',[(side*.42,-.045),(side*.49,-.01),(side*.67,.105),(side*.48,.075)],.047,.015)

item('race-dwarf')
for side in [-1,1]:
 box('skin',side*.395,-.045,-.03,.16,.22,.19)
 box('skin',side*.449,-.035,-.015,.06,.13,.13)
box('skin',0,-.14,.355,.155,.12,.15)
box('skin',0,-.177,.402,.19,.06,.10)

item('race-orc')
for side in [-1,1]:
 prism('skin',[(side*.35,-.075),(side*.58,-.015),(side*.65,.135),(side*.41,.105)],-.035,.14)
 box('fixed',side*.226,-.223,.435,.068,.18,.075,side*-.10,rgb=BONE)
 prism('fixed',[(side*.193,-.153),(side*.235,-.078),(side*.263,-.164)],.447,.063,BONE)
box('skin',0,-.277,.32,.53,.15,.17)
box('skin',0,-.12,.36,.135,.13,.13)

item('race-goblin')
for side in [-1,1]:
 prism('skin',[(side*.34,-.09),(side*.58,-.05),(side*.87,.095),(side*.63,.21),(side*.39,.13)],-.025,.12)
 prism('accent',[(side*.43,-.035),(side*.61,.0),(side*.75,.085),(side*.59,.125)],.043,.013)
box('skin',0,-.108,.396,.125,.19,.20)
box('skin',0,-.183,.505,.135,.075,.12)

item('race-foxfolk')
for side in [-1,1]:
 prism('skin',[(side*.14,.285),(side*.40,.28),(side*.365,.77),(side*.21,.58)],-.04,.21)
 prism('fixed',[(side*.205,.35),(side*.336,.36),(side*.321,.66)],.075,.025,color('DFBA98'))
 box('skin',side*.09,-.217,.371,.205,.18,.19)
box('fixed',0,-.145,.489,.14,.067,.065,rgb=INK)
box('skin',0,-.265,.398,.24,.065,.20)

item('race-foxfolk-tail')
box('skin',0,.91,-.335,.18,.21,.20)
for n in range(4):box('skin',0,.94+n*.065,-.43-n*.115,.23+(.035 if n in [1,2] else 0),.24,.255)
box('fixed',0,1.205,-.90,.20,.19,.20,rgb=BONE)
box('fixed',0,1.275,-.925,.15,.09,.15,rgb=BONE)

for race in ['catfolk','dogfolk','lizardfolk']:
 item('race-'+race)
 if race=='catfolk':
  for side in [-1,1]:
   prism('skin',[(side*.17,.28),(side*.43,.27),(side*.38,.66)],-.04,.20)
   prism('accent',[(side*.23,.34),(side*.36,.33),(side*.345,.54)],.07,.022)
   for n in range(2):box('fixed',side*.28,-.19-n*.06,.35,.20,.012,.018,rgb=BONE,angle=side*(.12-n*.22))
 elif race=='dogfolk':
  for side in [-1,1]:
   box('skin',side*.42,.02,-.065,.19,.63,.23,side*.14)
   box('accent',side*.445,-.08,.069,.10,.30,.026,side*.14)
  box('skin',0,-.24,.405,.39,.20,.25)
  box('fixed',0,-.175,.555,.21,.065,.06,rgb=INK)
 else:
  box('skin',0,-.22,.39,.39,.18,.24)
  for side in [-1,1]:
   for n in range(3):prism('accent',[(side*.34,.19-n*.12),(side*(.52-n*.025),.28-n*.15),(side*.365,-.02-n*.12)],-.14,.16)
   prism('fixed',[(side*.25,.29),(side*.335,.29),(side*.32,.58),(side*.265,.49)],-.14,.09,BONE)

def brows(angle=0,y=.092,width=.17):
 for side in [-1,1]:box('hair',side*.155,y,.330,width,.028,.022,side*angle)
def mouth(width=.12,y=-.242):box('fixed',0,y,.332,width,.025,.025,rgb=INK)
item('face-bright');brows(.08,.115);mouth(.12)
for side in [-1,1]:box('fixed',side*.074,-.225,.333,.028,.035,.024,side*-.17,rgb=INK)
item('face-calm');brows(0,.092,.155);mouth(.11)
item('face-stern');brows(.20,.078,.18);mouth(.14,-.252)
item('face-smile');brows(-.08,.105)
box('fixed',0,-.239,.333,.18,.067,.028,rgb=INK)
box('fixed',0,-.216,.353,.125,.021,.018,rgb=BONE)
item('face-freckles');brows(.025,.097);mouth(.11)
for side in [-1,1]:
 for n in range(3):box('fixed',side*(.216+n*.036),-.148-(n%2)*.038,.325,.018,.018,.016,rgb=FRECKLE)
item('face-scarred');brows(.14,.089);mouth(.12,-.247)
for n in range(3):box('fixed',.262-n*.018,-.136-n*.031,.326,.033,.04,.018,-.38,rgb=SCAR)
item('face-painted');brows(.04,.099);mouth(.12)
for side in [-1,1]:
 for n in range(2):box('accent',side*(.246+n*.04),-.151,.326,.027,.086,.018,side*-.24)
item('face-weathered');brows(.065,.092,.184);mouth(.14,-.251)
for side in [-1,1]:
 box('fixed',side*.25,-.145,.325,.09,.014,.018,side*-.11,rgb=SCAR)
 box('fixed',side*.205,-.255,.328,.032,.08,.017,side*.20,rgb=SCAR)

# Held fishing tool: tapered bamboo, wrapped grip, brass reel, guides and float.
item('tool-fishing-rod')
def beam(a,b,width,hexcode):
 start,end=Vector(a),Vector(b);axis=(end-start).normalized();u=Vector((1,0,0))*width/2;v=axis.cross(u).normalized()*width/2
 vertices=[tuple(point+u*side+v*edge) for point in [start,end] for side,edge in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 mesh_shape('fixed',vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],color(hexcode))
for i in range(4):
 t=i/4;n=(i+1)/4
 beam((0,t*.80,t*.95),(0,n*.80,n*.95),.042-i*.008,'A57B42' if i%2 else 'BA9254')
for i in range(7):
 t=.02+i*.022;beam((0,t*.80,t*.95),(0,(t+.011)*.80,(t+.011)*.95),.055,'594739')
box('fixed',.07,.085,.095,.12,.04,.13,rgb=color('C8A655'))
for x in [.04,.12]:box('fixed',x,.08,.10,.024,.115,.115,rgb=color('B59655'))
box('fixed',.08,.08,.10,.09,.072,.072,rgb=color('453D38'))
box('fixed',.14,.08,.10,.07,.022,.022,rgb=color('D5B567'))
box('fixed',.17,.115,.10,.019,.085,.020,rgb=color('C8A655'))
box('fixed',.17,.15,.10,.032,.032,.075,rgb=color('594739'))
for t in [.28,.52,.76,1]:
 y,z=t*.80,t*.95
 for a,b in [((-.032,y,z+.033),(.032,y,z+.033)),((-.032,y,z+.033),(-.032,y+.06,z+.033)),((.032,y,z+.033),(.032,y+.06,z+.033)),((-.032,y+.06,z+.033),(.032,y+.06,z+.033))]:beam(a,b,.010,'BFA46A')
beam((0,.80,.995),(0,-.30,1.1),.008,'DDD3B4')
box('fixed',0,-.29,1.1,.065,.08,.065,rgb=color('BD5E48'))
box('fixed',0,-.345,1.1,.051,.04,.051,rgb=color('EEE6CE'))
beam((0,-.37,1.1),(0,-.48,1.1),.008,'BFA46A')

library=bpy.context.scene;library.name='Head-local customization library';library.unit_settings.system='METRIC';library.unit_settings.scale_length=1
material=bpy.data.materials.new('Customization neutral vertex palette');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.85
attribute=material.node_tree.nodes.new('ShaderNodeVertexColor');attribute.layer_name='CustomizationTint';material.node_tree.links.new(attribute.outputs['Color'],shader.inputs['Base Color'])
roots={}
for name,groups in parts.items():
 root=bpy.data.objects.new(name,None);library.collection.objects.link(root);roots[name]=root;root['anchor']='hand' if name.startswith('tool-') else 'body' if name.endswith('-tail') else 'head';root['axes']='metres, Y-up, +Z front'
 for tint,d in groups.items():
  mesh=bpy.data.meshes.new(name+'-'+tint);mesh.from_pydata(d['v'],[],d['f']);mesh.update();mesh.materials.append(material)
  colors=mesh.color_attributes.new(name='CustomizationTint',type='BYTE_COLOR',domain='CORNER')
  for face,rgb in zip(mesh.polygons,d['c']):
   face.use_smooth=False
   for i in face.loop_indices:colors.data[i].color=rgb
  obj=bpy.data.objects.new(name+'-'+tint,mesh);library.collection.objects.link(obj);obj.parent=root;obj['tint']=tint
for path in [EXPORT.parent,SOURCE.parent]:path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
 with tempfile.TemporaryDirectory(prefix='mossvale-customization-') as temporary:
  dedup=str(Path(temporary)/'dedup.glb')
  for command in [['dedup',str(EXPORT),dedup],['prune',dedup,str(EXPORT)]]:subprocess.run(['npx','--yes','@gltf-transform/cli@4.5.0']+command,check=True)

def preview_material(hexcode):
 name='Gallery '+hexcode;mat=bpy.data.materials.get(name)
 if not mat:
  mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color(hexcode);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
 return mat
def preview_box(parent,at,size,hexcode):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*at));obj=bpy.context.object;obj.parent=parent;obj.scale=(size[0],size[2],size[1]);obj.data.materials.append(preview_material(hexcode));return obj
def copy_item(name,parent,palette):
 for child in roots[name].children:
  obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
  if child['tint']!='fixed':obj.material_slots[0].link='OBJECT';obj.material_slots[0].material=preview_material(palette[child['tint']])
def label(text,at,size=.13):
 curve=bpy.data.curves.new(text,'FONT');curve.body=text;curve.align_x='CENTER';curve.size=size;curve.extrude=0
 obj=bpy.data.objects.new(text,curve);gallery.collection.objects.link(obj);obj.location=xyz(*at);obj.rotation_euler=(math.pi/2,0,0);curve.materials.append(preview_material('DCD4B5'))
def head(at,title,hair='swept',race='human',face='calm',skin='DBAE8D',haircolor='665044'):
 parent=bpy.data.objects.new(title+' preview head',None);gallery.collection.objects.link(parent);parent.location=xyz(*at);parent.rotation_euler[2]=math.radians(-12)
 palette={'skin':skin,'hair':haircolor,'hairHighlight':'C9AC76','accent':'D3AD61'}
 preview_box(parent,(0,0,0),(.73,.67,.62),skin)
 preview_box(parent,(0,-.43,0),(.25,.20,.25),skin)
 if race=='human':
  for side in [-1,1]:preview_box(parent,(side*.394,-.04,0),(.12,.19,.16),skin)
 else:copy_item('race-'+race,parent,palette)
 for side in [-1,1]:
  preview_box(parent,(side*.155,-.045,.322),(.105,.12,.025),'2B3836')
  preview_box(parent,(side*.155-.018,-.01,.341),(.027,.032,.013),'FFF0CB')
 if race in ['human','elf']:preview_box(parent,(0,-.125,.346),(.08,.08,.08),skin)
 if hair!='none':copy_item('hair-'+hair,parent,palette)
 copy_item('face-'+face,parent,palette)
 label(title,(at[0],at[1]-.95,.39))

gallery=bpy.data.scenes.new('Customization gallery - nine races, fifteen cuts, eight faces');bpy.context.window.scene=gallery
gallery.render.engine='CYCLES';gallery.cycles.samples=24;gallery.cycles.use_denoising=True;gallery.render.resolution_x=2200;gallery.render.resolution_y=1900;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.view_settings.view_transform='AgX';gallery.world=bpy.data.worlds.new('Gallery world');gallery.world.use_nodes=True;gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.17,.14,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
race_colors={'human':'DBAE8D','elf':'DDB999','dwarf':'C49B80','orc':'88A078','goblin':'A0B481','foxfolk':'CB986C','catfolk':'AAA79C','dogfolk':'BA8659','lizardfolk':'83A677'}
for i,race in enumerate(race_colors):head(((i%6-(2.5 if i<6 else 1))*1.7,6.15-(i//6)*2.15,0),race.upper(),race=race,skin=race_colors[race],hair='pixie' if race=='foxfolk' else 'swept',face='stern' if race=='orc' else 'calm')
hairs=['swept','long','mohawk','bob','braids','ponytail','spiky','curly','topknot','sidecut','pixie','twin-buns','dreadlocks','fishtail','undercut']
for i,hair in enumerate(hairs):head(((i%6-2.5)*1.7,1.85-(i//6)*2.15,0),hair.upper(),hair=hair,haircolor=['674A39','A06C43','C7B78D'][i%3])
for i,face in enumerate(['bright','calm','stern','smile','freckles','scarred','painted','weathered']):head(((i%6-2.5)*1.7,-4.60-(i//6)*2.15,0),face.upper(),hair='pixie',face=face)
tail_preview=bpy.data.objects.new('Foxfolk tail - body-local preview',None);gallery.collection.objects.link(tail_preview);tail_preview.location=xyz(-.85,-7.6,0);tail_preview.rotation_euler[2]=math.pi/2
preview_box(tail_preview,(0,.90,0),(.42,.57,.36),'65856F');copy_item('race-foxfolk-tail',tail_preview,{'skin':'CB986C','hair':'9F704D','accent':'D3AD61'});label('FOX TAIL',(-.85,-7.75,.39))
rod_preview=bpy.data.objects.new('Fishing rod - held preview',None);gallery.collection.objects.link(rod_preview);rod_preview.location=xyz(.85,-7.45,0);rod_preview.rotation_euler[2]=-.7
copy_item('tool-fishing-rod',rod_preview,{});label('FISHING ROD',(.85,-7.75,.39))
preview_box(None,(0,-.28,-.80),(200,200,.08),'253A32')
for at,power,size in [((-4,7,8),1700,6),((5,1,5),950,5)]:
 bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.size=size;light.rotation_euler=(Vector(xyz(0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(0,-.10,20));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=19.8;camera.rotation_euler=(Vector(xyz(0,-.50,0))-camera.location).to_track_quat('-Z','Y').to_euler();gallery.camera=camera
gallery.render.filepath=str(PREVIEW);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('CUSTOMIZATION_KIT',{'roots':len(roots),'meshes':sum(len(group) for group in parts.values()),'cubes':sum(counts.values()),'bytes':EXPORT.stat().st_size})
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
