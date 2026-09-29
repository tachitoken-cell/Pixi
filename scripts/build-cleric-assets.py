"""Blender-authored Cleric clothes, hand weapons and transparent spell icons.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-cleric-assets.py -- --optimize
Meshes use metres, Y up, +Z forward. Wearables are local to existing avatar
anchors; shoulders are arm-local and weapon-grip is exactly at the hand origin.
Race fits are baked vertices using the existing race-fit envelope.
"""
import bpy, copy, json, math, struct, subprocess, sys, tempfile
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
EXPORT=ROOT/'public/models/cleric-kit.glb'
SOURCE=ROOT/'assets/source/cleric-kit.blend'
ICONS=ROOT/'public/ui/cleric'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
library=bpy.context.scene;library.name='Cleric wearable library'
library.unit_settings.system='METRIC'
HEX={'ivory':'E8DDBF','light':'FFF1CE','shade':'B9AA8A','teal':'327C78','deep':'224B50','cyan':'93E4D1','gold':'D8B46A','goldlight':'FFE1A0','bronze':'9C713B','leather':'72513D','paper':'DDCDA0','sun':'FFE9AC'}
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
COLORS={k:tuple(linear(int(v[i:i+2],16)/255) for i in (0,2,4))+(1,) for k,v in HEX.items()}
def xyz(x,y,z):return x,-z,y
mat=bpy.data.materials.new('Cleric ivory teal and gold vertex palette');mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.65
color=mat.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='ClericTint';mat.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
parts={};active='';current='';roots={};fit_roots={}
def item(name,label='mesh'):
 global active,current
 active=name;current=label;parts[name]={label:[]}
def part(name):
 global current
 current=name;parts[active][name]=[]
def box(c,x,y,z,w,h,d,angle=0):parts[active][current].append((c,x,y,z,w,h,d,angle))
def rod(c,x1,y1,x2,y2,z,w=.035,d=.03):box(c,(x1+x2)/2,(y1+y2)/2,z,w,math.hypot(x2-x1,y2-y1),d,-math.atan2(x2-x1,y2-y1))
def sun(x,y,z,r=.14):
 box('bronze',x,y,z,r*1.55,r*1.55,.07,math.pi/4)
 box('gold',x,y,z+.045,r*1.35,r*1.35,.055)
 box('sun',x,y,z+.078,r*.72,r*.72,.035,math.pi/4)
 for i in range(8):
  a=i*math.tau/8;box('goldlight' if i%2 else 'gold',x+math.sin(a)*r*1.13,y+math.cos(a)*r*1.13,z+.015,r*.20,r*.43,.05,-a)

item('cleric-head')
box('ivory',0,.37,-.04,.88,.13,.79)
box('light',0,.455,-.08,.71,.09,.67)
box('ivory',0,.05,-.375,.85,.63,.13)
for side in [-1,1]:
 box('ivory',side*.405,.12,-.02,.11,.43,.70)
 box('teal',side*.41,-.13,-.25,.12,.30,.25)
 box('gold',side*.405,.30,.34,.085,.15,.065)
box('gold',0,.285,.367,.76,.075,.075)
sun(0,.39,.40,.11)
item('cleric-body','torso')
# Segmented full cloth envelope, fitted separately to each authored torso.
box('ivory',0,1.27,0,.76,.62,.47)
box('ivory',0,.93,0,.82,.15,.49)
box('shade',0,1.11,-.255,.71,.31,.045)
for side in [-1,1]:
 box('teal',side*.23,1.225,.257,.14,.59,.045)
 box('gold',side*.23,.951,.288,.16,.045,.022)
 box('gold',side*.31,1.237,.28,.025,.53,.023)
 box('teal',side*.225,.825,.27,.18,.19,.042)
box('gold',0,1.037,.267,.77,.055,.047)
sun(0,1.365,.28,.082)
for side,label in [(-1,'right-arm'),(1,'left-arm')]:
 part(label)
 box('ivory',0,-.15,0,.31,.35,.34)
 box('teal',0,-.30,0,.315,.10,.345)
 box('gold',0,-.345,.005,.33,.034,.36)
 box('gold',0,.025,0,.40,.075,.43)
 box('ivory',0,.092,-.01,.32,.09,.35)
 box('goldlight',0,.145,-.01,.23,.025,.29)
 box('gold',0,-.475,.015,.245,.07,.275)
item('cleric-legs')
box('ivory',0,-.245,0,.285,.47,.31)
box('teal',0,-.19,.173,.12,.35,.042)
box('gold',0,-.365,.18,.17,.034,.05)
item('cleric-shoes')
box('deep',0,-.56,.015,.31,.42,.36)
box('ivory',0,-.58,.215,.30,.29,.06)
box('gold',0,-.415,.02,.33,.06,.38)
box('teal',0,-.76,.09,.335,.20,.45)
box('gold',0,-.775,.282,.33,.065,.035)
box('shade',0,-.839,.09,.34,.042,.46)
item('cleric-back')
box('teal',0,-.32,-.09,.74,.64,.10)
box('deep',0,-.68,-.13,.66,.12,.105)
for side in [-1,1]:
 box('gold',side*.33,-.34,-.15,.038,.59,.035)
 box('ivory',side*.22,-.74,-.13,.19,.13,.105)
box('gold',0,-.655,-.185,.64,.035,.025)
# Small rear sunrise is attached to the outward-facing back surface.
box('gold',0,-.26,-.154,.21,.21,.02,math.pi/4)
box('ivory',0,-.26,-.172,.10,.10,.025,math.pi/4)
item('cleric-weapon')
box('leather',0,.175,0,.078,.61,.078)
box('gold',0,-.172,0,.13,.095,.13)
box('goldlight',0,-.212,0,.08,.032,.08)
box('gold',0,.325,0,.15,.08,.15)
box('bronze',0,.465,0,.235,.22,.235)
box('ivory',0,.475,0,.265,.145,.265)
for side in [-1,1]:
 box('gold',side*.162,.485,0,.085,.25,.26)
 box('gold',0,.485,side*.162,.26,.25,.085)
box('goldlight',0,.63,0,.15,.08,.15)
box('sun',0,.486,.214,.135,.135,.025,math.pi/4)
part('weapon-grip');box('leather',0,0,0,.105,.21,.105)
item('cleric-offhand')
# Clear grip at the local origin; the book stands forward of the closed palm.
box('teal',0,.045,.175,.40,.53,.072)
box('paper',0,.045,.238,.35,.46,.075)
box('deep',0,.045,.291,.40,.53,.042)
box('gold',-.175,.045,.322,.045,.53,.025)
for side in [-1,1]:
 box('gold',side*.16,.26,.328,.072,.062,.03)
 box('gold',side*.16,-.17,.328,.072,.062,.03)
box('gold',.185,.045,.323,.08,.09,.034)
sun(0,.06,.323,.086)
for y in [-.145,.15]:box('leather',0,y,.068,.14,.052,.19)
part('weapon-grip');box('leather',0,0,0,.095,.205,.095)

profiles=json.loads((ROOT/'assets/source/race-fit.json').read_text())
def interp(y,knots):
 for a,b in zip(knots,knots[1:]):
  if y<=b[0]:break
 return a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0])
def fitted(x,y,z,base,label,p):
 t=p['torso']
 if label.endswith('arm'):
  f=1+(p['shoulder']['upperWidth']/.25-1)*max(0,min(1,(y+.54)/.50));return x*f,y,z*f
 if base.endswith('head'):
  h=p['head'];return x*h['upperWidth']/.73,y+h['top']-.335,z*h['upperDepth']/.66
 if base.endswith('body'):
  w=interp(y,[(.89,t['hemWidth']),(1.11,t['waistWidth']),(1.31,t['chestWidth']),(1.555,t['width'])])
  ny=interp(y,[(.86,p['hip']['y']),(.89,t['hemY']),(1.11,t['waistY']),(1.31,t['chestY']),(1.555,t['topY'])])
  front=(t['chestFront']-t['depth']/2)*max(0,min(1,(.22-abs(ny-t['chestY']))/.12)) if z>.20 else 0
  return x*w/.70,ny,z*t['depth']/.4+front
 if base.endswith('legs'):
  f=p['hip']['thighWidth']/.26;return x*f,y*p['hip']['y']/.86,z*f
 if base.endswith('shoes'):
  f=p['foot'];d=f['depth']/.46;return x*f['width']/.31,y*p['hip']['y']/.86,z*d+f['front']-.31*d
 if base.endswith('back'):return x*t['width']/.7,y*(p['cape']['y']-.3)/(1.49-.3),z
 return x,y,z
base_names=list(parts)
for fit,p in profiles.items():
 for base in base_names:
  if base.endswith(('weapon','offhand')):continue
  name=f'{base}-{fit}';parts[name]=copy.deepcopy(parts[base]);fit_roots[name]={'baseModel':base,'fit':fit}

def finish(name,groups,target_scene=library,profile=None,base=None):
 parent=bpy.data.objects.new(name,None);target_scene.collection.objects.link(parent)
 parent['runtime_axes']='metres, Y up, +Z front; joint-local identity transform'
 for k,v in fit_roots.get(name,{}).items():parent[k]=v
 for label,records in groups.items():
  vertices=[];faces=[];colors=[]
  for c,x,y,z,w,h,d,angle in records:
   segments=max(1,math.ceil(h/.11)) if profile and label=='torso' else 1
   for segment in range(segments):
    off=h*((segment+.5)/segments-.5);xx=x-math.sin(angle)*off;yy=y+math.cos(angle)*off
    start=len(vertices);ca,sa=math.cos(angle),math.sin(angle)
    for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
     dx,dy=a*w/2,b*h/segments/2;v=(xx+dx*ca-dy*sa,yy+dx*sa+dy*ca,z+f*d/2)
     if profile:v=fitted(*v,base,label,profile)
     vertices.append(xyz(*v))
    for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:faces.append(tuple(start+i for i in face));colors.append(COLORS[c])
  mesh=bpy.data.meshes.new(name+'-'+label);mesh.from_pydata(vertices,[],faces);mesh.materials.append(mat)
  tint=mesh.color_attributes.new(name='ClericTint',type='BYTE_COLOR',domain='CORNER')
  for polygon,c in zip(mesh.polygons,colors):
   for index in polygon.loop_indices:tint.data[index].color=c
  obj=bpy.data.objects.new(name+'-'+label,mesh);target_scene.collection.objects.link(obj);obj.parent=parent
  if label=='weapon-grip':obj['role']='weapon-grip'
 return parent
for name,groups in parts.items():
 info=fit_roots.get(name);roots[name]=finish(name,groups,profile=profiles[info['fit']] if info else None,base=info['baseModel'] if info else name)
for path in [EXPORT.parent,SOURCE.parent,ICONS]:path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
 cli=['npx','--yes','@gltf-transform/cli@4.5.0']
 with tempfile.TemporaryDirectory(prefix='mossvale-cleric-') as tmp:
  a,b,c=[str(Path(tmp)/f'{i}.glb') for i in range(3)]
  for cmd in [['weld',str(EXPORT),a],['quantize',a,b,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['dedup',b,c],['prune',c,str(EXPORT)]]:subprocess.run(cli+cmd,check=True)
 raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
 for f in ['extensionsUsed','extensionsRequired']:doc[f]=sorted(set(doc.get(f,[])+['KHR_mesh_quantization']))
 enc=json.dumps(doc,separators=(',',':')).encode();enc+=b' '*(-len(enc)%4);tail=raw[20+length:]
 EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(enc)+len(tail))+struct.pack('<II',len(enc),0x4E4F534A)+enc+tail)

# Small transparent symbols are genuine Blender geometry in individual scenes.
def studio(name):
 s=bpy.data.scenes.new('Cleric icon '+name);bpy.context.window.scene=s
 s.render.engine='CYCLES';s.cycles.samples=48;s.cycles.use_denoising=True
 s.render.resolution_x=s.render.resolution_y=128;s.render.resolution_percentage=100
 s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.film_transparent=True
 s.view_settings.view_transform='AgX';s.world=bpy.data.worlds.new(name+' soft studio');s.world.use_nodes=True
 s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.32,.35,.3,1);s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
 for pos,energy,size in [((-3,-4,6),620,4),((4,-3,2),250,5)]:
  bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=energy;o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(0,-8,1.3));s.camera=bpy.context.object;s.camera.rotation_euler=(-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.type='ORTHO';s.camera.data.ortho_scale=2.2
 return s

def shield():
 box('gold',0,.02,0,.90,1.05,.14);box('gold',0,-.53,0,.58,.16,.14)
 box('teal',0,.045,.09,.73,.85,.055);box('deep',0,-.42,.09,.49,.15,.055)
 sun(0,.08,.145,.23)
def wings():
 for side in [-1,1]:
  for i in range(3):box('ivory' if i%2 else 'light',side*(.43+i*.18),.18+i*.12,-.06,.17,.64-i*.12,.08,-side*.48)
def halo():
 for i in range(12):
  a=i*math.tau/12;box('goldlight',math.sin(a)*.69,math.cos(a)*.69,-.03,.14,.12,.06,-a)
def heart():
 box('cyan',-.20,.05,.02,.46,.48,.14);box('cyan',.20,.05,.02,.46,.48,.14)
 box('teal',0,-.20,0,.54,.45,.12,math.pi/4)
 box('light',0,.01,.12,.12,.58,.055);box('light',0,.055,.12,.44,.12,.055)

icon_names=['class','smite','heal','renew','shield','holyburst','beam','blessing','guardian']
for name in icon_names:
 s=studio(name);item('icon-'+name)
 if name=='class':shield();wings();sun(0,.67,.01,.15)
 elif name=='smite':
  rod('gold',-.55,-.65,.36,.5,0,.14,.14);sun(.42,.56,.04,.31)
  for dx in [-.2,.02,.24]:rod('light',dx-.30,-.55,dx+.02,.03,.12,.045,.04)
 elif name=='heal':heart();sun(0,.59,.02,.21)
 elif name=='renew':
  halo();rod('teal',0,-.5,0,.40,.06,.09,.075)
  for side in [-1,1]:
   box('cyan',side*.22,.06,.08,.25,.43,.075,-side*.70)
  box('goldlight',0,.43,.10,.22,.30,.09,math.pi/4)
 elif name=='shield':shield()
 elif name=='holyburst':sun(0,0,.02,.41);halo()
 elif name=='beam':
  for x in [-.32,0,.32]:rod('goldlight' if x else 'light',x-.32,-.67,x+.23,.59,.03,.13,.09)
  sun(.28,.62,.08,.21)
 elif name=='blessing':
  sun(0,.42,.04,.29)
  for side in [-1,1]:
   box('ivory',side*.36,-.37,.03,.27,.38,.17,-side*.40)
   rod('light',side*.24,-.31,side*.16,-.04,.13,.12,.08)
 elif name=='guardian':shield();wings();halo()
 finish('Cleric '+name+' icon',parts[active],s)
 s.render.filepath=str(ICONS/f'{name}.png');bpy.ops.render.render(write_still=True)
 image=bpy.data.images.load(s.render.filepath,check_existing=False);alpha=list(image.pixels)[3::4]
 assert tuple(image.size)==(128,128) and min(alpha)==0 and max(alpha)>.99,name+' RGBA'
 occupied=[i for i,a in enumerate(alpha) if a>.02];margin=min(min(i%128 for i in occupied),min(i//128 for i in occupied),127-max(i%128 for i in occupied),127-max(i//128 for i in occupied))
 assert margin>=4,f'{name} icon needs padding: {margin}'
 bpy.data.images.remove(image)

gear_icons=ROOT/'public/ui/gear';gear_icons.mkdir(parents=True,exist_ok=True)
for slot in ['head','body','legs','shoes','back','weapon']:
 s=studio('gear-'+slot)
 assembly=bpy.data.objects.new('Wearable thumbnail '+slot,None);s.collection.objects.link(assembly)
 source=roots['cleric-'+slot]
 for side in ([-1,1] if slot in ['legs','shoes'] else [0]):
  for child in source.children:
   obj=child.copy();obj.data=child.data;s.collection.objects.link(obj);obj.parent=assembly
   if side:obj.location=xyz(side*.19,0,0)
   if slot=='body' and child.name.endswith('arm'):obj.location=xyz(.47 if child.name.endswith('left-arm') else -.47,1.44,0)
 bpy.context.view_layer.update()
 points=[obj.matrix_world@Vector(corner) for obj in assembly.children for corner in obj.bound_box]
 lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)))
 assembly.location=-(lo+hi)/2
 s.camera.location=(2,8 if slot=='back' else -8,2.3)
 s.camera.rotation_euler=(-s.camera.location).to_track_quat('-Z','Y').to_euler()
 bpy.context.view_layer.update()
 inverse=s.camera.matrix_world.inverted()
 projected=[inverse@(obj.matrix_world@Vector(corner)) for obj in assembly.children for corner in obj.bound_box]
 s.camera.data.ortho_scale=max(max(v[i] for v in projected)-min(v[i] for v in projected) for i in [0,1])*1.25
 s.render.filepath=str(gear_icons/f'cleric-{slot}.png');bpy.ops.render.render(write_still=True)
 image=bpy.data.images.load(s.render.filepath,check_existing=False);alpha=list(image.pixels)[3::4]
 assert tuple(image.size)==(128,128) and min(alpha)==0 and max(alpha)>.99,slot+' gear RGBA'
 occupied=[i for i,a in enumerate(alpha) if a>.02]
 assert min(min(i%128 for i in occupied),min(i//128 for i in occupied),127-max(i%128 for i in occupied),127-max(i//128 for i in occupied))>=4,slot+' gear padding'
 bpy.data.images.remove(image)
bpy.context.window.scene=library
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('PASS: Cleric wearable kit, 12 race fits, centered mace/tome grips, 9 spell/class icons and 6 gear thumbnails. GLB bytes:',EXPORT.stat().st_size)
