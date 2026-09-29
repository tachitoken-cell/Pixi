"""Adapt Benji's creatures into detailed articulated Void Sanctum combatants.

Blender --background --disable-autoexec --threads 4 --python scripts/build-raid-approach-monsters.py -- --render
Source files are treated as mesh data; embedded scripts are never executed.
"""
import bpy, math, json, sys, subprocess, tempfile, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'public/models/raid-approach-monsters.glb'
SOURCE_DIR = ROOT/'assets/source/raid-approach/original'
NAMES = ['moss-golem','thorn-knight','shroom-shaman','vine-stalker','grumble-root','puffling','acorn-seedle','cinder-seedle','pudgy-piglet','thornback-boar','dusk-vampie','hammer-stump','rotwood-treant','gloom-gargoyle','crimson-weaver','stinger-wasp','hollow-scarecrow','grave-knight','magma-brute','tunnel-mole','spring-boing','gnoll-scout','crested-basilisk','tidelord-crab','morgrath']
COLORS = {
 'obsidian':(.020,.013,.037,1), 'edge':(.17,.12,.26,1), 'stone':(.060,.039,.094,1),
 'bark':(.085,.037,.13,1), 'bark-light':(.23,.14,.31,1), 'bone':(.43,.36,.58,1),
 'bone-light':(.65,.57,.76,1), 'hide':(.10,.066,.17,1), 'cloth':(.045,.021,.085,1),
 'metal':(.13,.16,.27,1), 'silver':(.39,.48,.61,1), 'violet':(.49,.07,.96,1),
 'cyan':(.18,.68,.94,1), 'eye':(.58,.79,1,1), 'dark':(.004,.002,.012,1),
 'muzzle':(.29,.20,.35,1), 'fur-edge':(.21,.16,.29,1), 'chitin':(.10,.095,.22,1),
}
EMISSIVE = {'violet','cyan','eye'}
scene = bpy.context.scene
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene.render.fps=30; scene.frame_start=0; scene.frame_end=60
parts={}; configs={}; current=''; active=''

def component(vertices, faces, tint):
 return {'v':[Vector(v) for v in vertices], 'f':faces, 'color':tint}
def add(vertices, faces, tint='stone', label=None):
 parts[active].setdefault(label or current,[]).append(component(vertices,faces,tint))
def box(center,size,tint='stone',label=None,cut=.12):
 x,y,z=center;w,d,h=size;c=min(w,d,h)*cut
 profile=[(-w/2+c,-h/2),(w/2-c,-h/2),(w/2,-h/2+c),(w/2,h/2-c),(w/2-c,h/2),(-w/2+c,h/2),(-w/2,h/2-c),(-w/2,-h/2+c)]
 verts=[(x+a,y+b,z+c) for b in [-d/2,d/2] for a,c in profile]
 add(verts,[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)],tint,label)
def tube(points,radius,tint='bone',label=None,sides=6):
 points=[Vector(v) for v in points];verts=[];faces=[]
 for i,p in enumerate(points):
  axis=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized();u=axis.cross(Vector((0,1,0)))
  if u.length<.01:u=axis.cross(Vector((1,0,0)))
  u.normalize();v=axis.cross(u);r=radius[i] if isinstance(radius,list) else radius
  verts += [p+r*(math.cos(n*math.tau/sides)*u+math.sin(n*math.tau/sides)*v) for n in range(sides)]
 for i in range(len(points)-1):
  for n in range(sides):faces.append((i*sides+n,i*sides+(n+1)%sides,(i+1)*sides+(n+1)%sides,(i+1)*sides+n))
 faces += [tuple(reversed(range(sides))),tuple((len(points)-1)*sides+n for n in range(sides))]
 add(verts,faces,tint,label)
def crystal(center,size,tint='violet',label=None):
 x,y,z=center;w,d,h=size
 add([(x-w,y,z-h*.2),(x,y-d,z-h*.2),(x+w,y,z-h*.2),(x,y+d,z-h*.2),(x,y,z-h),(x+w*.2,y,z+h)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)],tint,label)
def ring(center,rx,rz,tint='metal',thick=.018,label=None,n=18):
 x,y,z=center;tube([(x+rx*math.cos(i*math.tau/n),y,z+rz*math.sin(i*math.tau/n)) for i in range(n+1)],thick,tint,label,5)
def rune(center,size=.15,tint='cyan',label=None):
 x,y,z=center
 for points in [[(x,y,z-size),(x,y,z+size)],[(x-size*.65,y,z+size*.6),(x+size*.6,y,z),(x-size*.55,y,z-size*.6)]]:tube(points,size*.075,tint,label,4)
def bounds(components):
 vertices=[v for c in components for v in c['v']]
 return Vector(tuple(min(v[i] for v in vertices) for i in range(3))),Vector(tuple(max(v[i] for v in vertices) for i in range(3)))

# Pack inventory/group selection and per-creature detailing follow below.
def make_palette(name,emissive=False):
 material=bpy.data.materials.new(name);material.use_nodes=True
 shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.69;shader.inputs['Metallic'].default_value=.14
 attribute=material.node_tree.nodes.new('ShaderNodeVertexColor');attribute.layer_name='VoidTint';material.node_tree.links.new(attribute.outputs['Color'],shader.inputs['Base Color'])
 if emissive:
  material.node_tree.links.new(attribute.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=1.25
 return material
palette=make_palette('Raid approach obsidian palette');glow=make_palette('Raid approach emissive palette',True)

def mesh_part(key,label,components,pivot):
 verts=[];faces=[];colors=[];materials=[]
 for c in components:
  offset=len(verts);verts.extend(v-pivot for v in c['v'])
  for face in c['f']:faces.append(tuple(offset+i for i in face));colors.append(COLORS[c['color']]);materials.append(int(c['color'] in EMISSIVE))
 mesh=bpy.data.meshes.new(key+'-'+label);mesh.from_pydata(verts,[],faces);mesh.materials.append(palette);mesh.materials.append(glow);mesh.update()
 color=mesh.color_attributes.new(name='VoidTint',type='BYTE_COLOR',domain='CORNER')
 for face,tint,material in zip(mesh.polygons,colors,materials):
  face.material_index=material
  for i in face.loop_indices:color.data[i].color=tint
 obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj)
 obj['source_islands']=[c['source_island'] for c in components if 'source_island' in c]
 return obj

def animate_rig(key,root,rig,bases,height,style):
 import numpy as np
 vertices={obj:np.array([tuple(v.co) for v in obj.data.vertices],dtype=np.float64) for obj in rig.values()}
 # Anticipation is held, contact lands at .5, and recovery takes the remaining
 # half. Runtime maps that contact to the server's actual damage timestamp.
 def ramp(t,start,end):
  value=max(0,min(1,(t-start)/(end-start)));return value*value*(3-2*value)
 family=next((kind for kind,names in {
  'ring':{'moss-golem','cinder-seedle','rotwood-treant','tidelord-crab'},
  'burst':{'grumble-root','puffling','hammer-stump'},
  'line':{'vine-stalker','crimson-weaver','stinger-wasp','thornback-boar','crested-basilisk'},
  'volley':{'shroom-shaman','acorn-seedle','hollow-scarecrow','gnoll-scout'},
  'leap':{'pudgy-piglet','spring-boing','gloom-gargoyle','tunnel-mole'},
 }.items() if style in names),'cleave')
 quadruped=style in QUADRUPEDS or style=='crimson-weaver'
 clips=[('idle',60),('walk',36),('auto',30),('attack',48),('cast',60),('death',60)]
 if style=='morgrath':clips += [('rift',60),('rupture',60)]
 for suffix,frames in clips:
  clip=key+'-'+suffix
  for label,obj in rig.items():
   for frame in sorted(set(range(0,frames+1,3))|{round(frames*p) for p in [.32,.4,.5,.57,.8]}):
    t=frame/frames;wave=math.sin(t*math.tau);side=-1 if label.startswith('left') else 1;pos=Vector();rotation=[0,0,0];scale=[1,1,1]
    is_leg='leg' in label;is_arm='arm' in label;is_wing='wing' in label
    if suffix in ['idle','walk']:
     stride=wave*(.43 if suffix=='walk' else .018)
     if label=='body':pos.z=(1-math.cos(t*math.tau))*(height*.018 if suffix=='walk' else height*.009);rotation[1]=wave*.018
     if is_leg:rotation[0]=stride*side*(1 if 'back' not in label else -1)
     if is_arm:rotation[0]=-stride*side*.65;rotation[1]=side*wave*.035
     if is_wing:rotation[1]=side*wave*(.37 if suffix=='walk' else .13)
     if label=='head':rotation[2]=wave*.045
     if label=='tail':rotation[2]=wave*.24
    elif suffix in ['auto','attack']:
     wind=ramp(t,0,.32)*(1-ramp(t,.4,.5));hit=ramp(t,.4,.5)*(1-ramp(t,.57,1));power=1 if suffix=='attack' else .72
     if label=='body':
      pos.y=height*(.035*wind-.12*hit)*power;rotation[0]=(-.10*wind+.21*hit)*power
      rotation[2]=(-.22*wind+.17*hit)*power if not quadruped else 0
     if label=='head':rotation[0]=(-.16*wind+.25*hit)*power
     if is_arm:
      rotation[0]=(.48*wind-1.18*hit)*power;rotation[1]=side*(-.13*wind-.18*hit)*power
      rotation[2]=side*(.12*wind-.11*hit)*power
     if is_wing:rotation[1]=side*(-.75*wind+.46*hit)*power;rotation[0]=-.25*hit
     if is_leg:rotation[0]=(-.10*wind+.16*hit)*power*(1 if 'back' not in label else -1)
     if label=='tail':rotation[0]=.28*wind-.35*hit;rotation[2]=-.35*wind+.45*hit
    elif suffix in ['cast','rift','rupture']:
     wind=ramp(t,0,.32)*(1-ramp(t,.4,.5));hit=ramp(t,.4,.5)*(1-ramp(t,.57,1))
     motion=family if suffix=='cast' else suffix
     if motion in ['ring','burst','rupture','cleave']:
      # Lift both hands to announce a ground shock, then drive them down.
      if label=='body':pos.y=height*(.018*wind-.045*hit);rotation[0]=-.12*wind+.32*hit
      if label=='head':rotation[0]=-.22*wind+.16*hit
      if is_arm:rotation[0]=-1.95*wind-.18*hit;rotation[1]=-side*(.25*wind+.32*hit)
      if is_wing:rotation[1]=-side*(.85*wind-.32*hit)
      if is_leg:rotation[0]=side*(.10*wind-.06*hit)
      if label=='tail':rotation[0]=.28*wind-.22*hit
     elif motion in ['line','rift']:
      # Rear back, sight the lane, then commit the head and casting hand forward.
      if label=='body':pos.y=height*(.045*wind-.13*hit);rotation[0]=-.13*wind+.25*hit
      if label=='head':rotation[0]=-.25*wind+.20*hit
      if is_arm:
       casting=label.startswith('left') or style!='morgrath'
       rotation[0]=(-.48*wind-1.32*hit) if casting else .16*wind-.20*hit
       rotation[1]=-side*(.32*wind+.08*hit)
      if is_wing:rotation[1]=-side*(.7*wind-.3*hit)
      if is_leg:rotation[0]=-.12*wind+.15*hit
      if label=='tail':rotation[0]=.36*wind-.4*hit
     elif motion=='volley':
      # Gather above the face, then visibly throw/release toward the targets.
      if label=='body':pos.y=height*(.025*wind-.075*hit);rotation[0]=-.15*wind+.19*hit
      if label=='head':rotation[0]=-.23*wind+.13*hit
      if is_arm:rotation[0]=-1.85*wind-1.10*hit;rotation[1]=-side*(.12*wind+.55*hit)
      if is_leg:rotation[0]=side*.07*wind
      if label=='tail':rotation[2]=-.35*wind+.4*hit
     elif motion=='leap':
      # Compress, spring just before contact, land, and recover. Gameplay owns X/Z.
      launch=ramp(t,.32,.42)*(1-ramp(t,.42,.5))
      if label=='body':
       pos.z=height*(-.035*wind+.18*launch);scale[2]=1-.08*wind
       rotation[0]=-.10*wind+.22*hit
      if label=='head':rotation[0]=-.13*wind+.17*hit
      if is_arm:rotation[0]=.35*wind-.85*hit
      if is_leg:rotation[0]=(-.28*wind+.22*hit)*(1 if 'back' not in label else -1)
      if is_wing:rotation[1]=-side*(.95*wind-.38*hit)
      if label=='tail':rotation[0]=.35*wind-.4*hit
    else:
     p=min(1,t/.8);p=p*p*(3-2*p)
     if label=='body':rotation[0]=.36*p;rotation[1]=.18*p;scale[2]=1-.82*p;pos.z=-height*.40*p
     if is_arm or is_wing:rotation[1]=side*.40*p
     if is_leg:rotation[0]=side*.18*p
     if label=='head':rotation[0]=.4*p
    if style=='hammer-stump' and label=='right-arm' and suffix in ['auto','attack','cast']:
     # This hammer points up from the hand; its overhead arc is opposite to a
     # hanging blade. Raise it behind the shoulder, then drive its head down.
     rotation[0]=(-.5*wind+2.1*hit)*(.72 if suffix=='auto' else 1)
    obj.location=bases[label]+pos;obj.rotation_euler=rotation;obj.scale=scale
    for field in ['location','rotation_euler','scale']:obj.keyframe_insert(data_path=field,frame=frame)
   action=obj.animation_data.action;action.name=clip+'-'+label
   for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
    for point in curve.keyframe_points:point.interpolation='LINEAR'
   track=obj.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,0,action).extrapolation='NOTHING';obj.animation_data.action=None
   obj.location=bases[label];obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)
  for obj in rig.values():
   for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
  body_action=bpy.data.actions[clip+'-body'];curves=body_action.layers[0].strips[0].channelbag(body_action.slots[0]).fcurves;vertical=next(c for c in curves if c.data_path=='location' and c.array_index==2)
  corrected=[]
  for frame in range(frames+1):
   scene.frame_set(frame);bpy.context.view_layer.update()
   bottom=min(float((coords@np.array(obj.matrix_world[2][:3])+obj.matrix_world[2][3]).min()) for obj,coords in vertices.items())
   corrected.append(vertical.evaluate(frame)+(-bottom if suffix=='death' and frame>=frames*.8 else max(0,-bottom)))
  vertical.keyframe_points.clear()
  for frame,value in enumerate(corrected):vertical.keyframe_points.insert(frame,value,options={'FAST'}).interpolation='LINEAR'
  vertical.update()
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=False
 scene.frame_set(0)

HEIGHTS=[3.8,3.0,2.6,2.2,2.5,1.7,1.7,1.9,1.65,2.2,2.4,3.1,4.0,3.2,1.9,2.0,3.0,3.1,3.6,1.9,2.0,2.8,2.5,2.8,7.8]
QUADRUPEDS={'vine-stalker','pudgy-piglet','thornback-boar','crested-basilisk','tunnel-mole'}
FLYERS={'dusk-vampie','stinger-wasp','gloom-gargoyle'}
WOOD={'moss-golem','thorn-knight','shroom-shaman','vine-stalker','grumble-root','acorn-seedle','cinder-seedle','hammer-stump','rotwood-treant','hollow-scarecrow'}
ARMORED={'moss-golem','thorn-knight','gloom-gargoyle','grave-knight','magma-brute','morgrath'}

def source_color(name):
 name=name.lower()
 if 'eye' in name or 'core' in name or 'highlight' in name:return 'eye'
 if any(tag in name for tag in ['glow','lava','fire','orb','crystal']):return 'cyan' if any(tag in name for tag in ['blue','hot','crystal']) else 'violet'
 if any(tag in name for tag in ['bone','tooth','white','cream','straw']):return 'bone-light' if 'light' in name or 'white' in name else 'bone'
 if any(tag in name for tag in ['wood','root','bark','ring']):return 'bark-light' if 'light' in name or 'ring' in name else 'bark'
 if any(tag in name for tag in ['iron','bronze','gold','chain','rust']):return 'silver' if 'light' in name or 'edge' in name else 'metal'
 if any(tag in name for tag in ['cloth','moss','leaf','wing','cap','gill']):return 'edge' if 'light' in name else 'cloth'
 if any(tag in name for tag in ['dark','black','obsidian','basalt']):return 'obsidian'
 return 'bone' if 'puff' in name else 'hide' if any(tag in name for tag in ['pink','fur','tan','bat','lizard','crab','slime']) else 'stone'

def islands(obj):
 mesh=obj.data;adjacency=[set() for v in mesh.vertices]
 for edge in mesh.edges:
  a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
 todo=set(range(len(mesh.vertices)));faces={i:[] for i in todo}
 for polygon in mesh.polygons:faces[polygon.vertices[0]].append(polygon)
 while todo:
  found={todo.pop()};stack=list(found)
  while stack:
   for index in adjacency[stack.pop()]&todo:todo.remove(index);found.add(index);stack.append(index)
  ids=sorted(found);remap={old:i for i,old in enumerate(ids)};vertices=[obj.matrix_world.to_3x3()@mesh.vertices[i].co for i in ids]
  polygons=[polygon for i in ids for polygon in faces[i]]
  yield vertices,polygons,remap

raw={};inventory={}
for filename in ['moss_monsters_1.blend','monsters_20.blend','boss_morgrath.blend']:
 path=SOURCE_DIR/filename
 with bpy.data.libraries.load(str(path),link=False) as (source,target):target.objects=[name for name in source.objects if name.lower().replace('_','-') in NAMES]
 for obj in target.objects:
  if not obj or obj.type!='MESH':continue
  name=obj.name.lower().replace('_','-');components=[]
  for vertices,polygons,remap in islands(obj):
   by_material={}
   for polygon in polygons:by_material.setdefault(polygon.material_index,[]).append(tuple(remap[i] for i in polygon.vertices))
   for material,faces in by_material.items():
    tag=obj.data.materials[material].name
    c=component(vertices,faces,source_color(tag));c['tag']=tag;c['source_island']=len(components);components.append(c)
  raw[name]=components;inventory[name]={'file':filename,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'vertices':len(obj.data.vertices),'islands':len(components),'rigs':0,'animations':0}
  bpy.data.objects.remove(obj,do_unlink=True)
assert set(raw)==set(NAMES),'All supplied named creature meshes must be present'

def classify(name,c,w,d,h):
 i=c['source_island']
 if name=='morgrath':
  # Benji's joined source has semantic islands, not a skinned mesh. Spatial
  # thresholds split its downward sword, curved horns and long cape across limbs.
  if i<=12 or 37<=i<=40:return 'left-leg'
  if 13<=i<=25 or 41<=i<=44:return 'right-leg'
  if 72<=i<=119:return 'head'
  if 120<=i<=138 or 158<=i<=166 or 190<=i<=211:return 'left-arm'
  if 139<=i<=157 or 181<=i<=189 or 212<=i<=234:return 'right-arm'
  return 'body'
 if name=='thorn-knight':
  if 53<=i<=67:return 'head'
  if i==36:return 'left-arm'
  if i==52 or 68<=i<=80:return 'right-arm'
 if name=='shroom-shaman':
  if i==0:return 'right-leg'
  if i==1:return 'left-leg'
  if i==39:return 'left-arm'
  if i>=40:return 'right-arm'
  return 'body' # The mushroom cap and spots belong to its continuous stem.
 if name=='moss-golem':
  if i in [0,2]:return 'right-leg'
  if i in [1,3]:return 'left-leg'
  if 11<=i<=16:return 'head'
  if 17<=i<=29 or i>=47:return 'left-arm'
  if 30<=i<=42:return 'right-arm'
  return 'body'
 if name=='magma-brute':
  if i==0:return 'right-leg'
  if i==1:return 'left-leg'
  if 7<=i<=10:return 'head'
  if 11<=i<=19:return 'left-arm'
  if i>=20:return 'right-arm'
  return 'body'
 if name=='hammer-stump':
  if 22<=i<=23:return 'left-arm'
  if 24<=i<=27:return 'right-arm'
  if i<=15 or i>=28:return 'body'
 if name=='gnoll-scout' and 12<=i<=22:return 'head'
 center=sum(c['v'],Vector())/len(c['v']);x,y,z=center;side='left' if x<0 else 'right';tag=c.get('tag','').lower()
 if name in FLYERS and ('wing' in tag or abs(x)>w*.30 and z>h*.42):return side+'-wing'
 if name in QUADRUPEDS or name in {'crimson-weaver','tidelord-crab','stinger-wasp'}:
  if name=='tidelord-crab' and abs(x)>w*.27 and y<0:return side+'-arm'
  if abs(x)>w*.22 and z<h*.61:return side+('-front-leg' if y<0 else '-back-leg')
  if y>d*.28 and abs(x)<w*.25:return 'tail'
  if y<-d*.22 and z>h*.31:return 'head'
 else:
  if z>h*.76:
   # Long held weapons and high shoulder plates follow their arm, not the face.
   armed=name in ARMORED or name in {'shroom-shaman','hammer-stump','gnoll-scout'}
   return side+'-arm' if armed and abs(x)>w*.24 and not any(word in tag for word in ['horn','eye']) else 'head'
  if z<h*.29 and abs(x)>w*.07:return side+'-leg'
  if abs(x)>w*.24 and z>h*.30:return side+'-arm'
 return 'body'

def embellish_morgrath(h):
 """Fit relief to the actual armor; preserve the face, horns and joint gaps."""
 global current
 source={c['source_island']:(label,c) for label,cs in parts[active].items() for c in cs}
 def anchor(index):
  label,c=source[index];lo,hi=bounds([c]);return label,lo,hi,(lo+hi)/2
 # Narrow chamfered borders, rivets and shallow engraving keep the original
 # stepped armor readable rather than putting another full plate in front of it.
 for index in [0,2,9,10,13,15,22,23,26,37,39,41,43,50,51,56,120,122,124,139,141,143,181,183,185,190,192,194]:
  current,lo,hi,c=anchor(index);size=hi-lo;y=lo.y-h*.004
  rw=size.x*.43;rh=size.z*.38;bevel=min(rw,rh)*.22
  profile=[(-rw+bevel,-rh),(rw-bevel,-rh),(rw,-rh+bevel),(rw,rh-bevel),(rw-bevel,rh),(-rw+bevel,rh),(-rw,rh-bevel),(-rw,-rh+bevel)]
  tube([(c.x+x,y,c.z+z) for x,z in profile+[profile[0]]],h*.005,'edge',sides=5)
  for side in [-1,1]:
   for z in [-1,1]:crystal((c.x+side*rw*.81,y-h*.005,c.z+z*rh*.74),(h*.009,h*.007,h*.011),'silver')
  # Parallel bevels read as carved metal even where the emissive rune is absent.
  for side in [-1,1]:tube([(c.x+side*rw*.57,y,c.z-rh*.5),(c.x+side*rw*.73,y,c.z),(c.x+side*rw*.57,y,c.z+rh*.5)],h*.003,'metal',sides=4)
 # Breastplate inset follows the supplied core instead of hiding it in a cage.
 current,lo,hi,c=anchor(64);y=lo.y-h*.007
 ring((c.x,y,c.z),h*.044,h*.047,'silver',h*.005,n=16)
 for side in [-1,1]:
  tube([(c.x+side*h*.044,y,c.z),(c.x+side*h*.074,y+h*.003,c.z+h*.018),(c.x+side*h*.099,y+h*.012,c.z+h*.014)],h*.005,'silver',sides=5)
  for j in range(3):
   z=c.z-h*(.061+j*.026);x=c.x+side*h*.048
   box((x,y+h*.020,z),(h*.071,h*.012,h*.018),'edge',cut=.26)
 # The original helmet is below the horn arch. Only its actual two eye islands
 # receive sockets; chest cores and the crown gem must never become extra eyes.
 for index in [74,75]:
  current,lo,hi,c=anchor(index);size=hi-lo;y=lo.y-h*.006
  box((c.x,y,c.z),(size.x*1.20,h*.014,size.z*1.18),'dark',cut=.24)
  box((c.x,y-h*.009,c.z),(size.x*.74,h*.007,size.z*.57),'cyan',cut=.25)
  tube([(c.x-size.x*.64,y-h*.004,c.z+size.z*.71),(c.x,y-h*.015,c.z+size.z*.55),(c.x+size.x*.64,y-h*.004,c.z+size.z*.71)],h*.009,'bone',sides=5)
 current,lo,hi,c=anchor(72);front=lo.y-h*.018
 for side in [-1,1]:
  # Sloped cheek frames meet the jaw; no crown or floating goggle rings.
  tube([(c.x+side*h*.048,front,c.z+h*.006),(c.x+side*h*.054,front-h*.008,c.z-h*.031),(c.x+side*h*.033,front-h*.016,c.z-h*.049)],[h*.010,h*.014,h*.008],'edge',sides=5)
  for j in range(3):box((c.x+side*h*(.048+j*.004),front+h*.016,c.z-h*(.011+j*.018)),(h*.016,h*.015,h*.010),'silver',cut=.25)
 # Follow the original horn segments, leaving the large negative space open.
 for index in [85,87,89,91,93,95,99,101,103,105]:
  current,lo,hi,c=anchor(index);size=hi-lo
  for fraction in [-.20,.18]:
   tube([(c.x-size.x*.33,lo.y+h*.003,c.z+size.z*fraction),(c.x,lo.y-h*.010,c.z+size.z*fraction+h*.004),(c.x+size.x*.33,lo.y+h*.003,c.z+size.z*fraction)],h*.005,'metal',sides=5)
 # Embroidered cape hems remain one body attachment, independent of both arms.
 for index in [235,237,239,241,242,243,245,247,249,250,251]:
  current,lo,hi,c=anchor(index);y=hi.y+h*.003
  for side in [-1,1]:tube([(c.x+side*(hi.x-lo.x)*.35,y,lo.z+h*.028),(c.x+side*(hi.x-lo.x)*.32,y,hi.z-h*.020)],h*.004,'edge',sides=4)
 # Sword relief is inset into its blade plane, not an extra large rectangular
 # plaque. The full cleaver, hilt, skull and runes belong to the right shoulder.
 current,lo,hi,c=anchor(212)
 for side in [-1,1]:
  tube([(c.x+side*(hi.x-lo.x)*.23,lo.y+h*.10,lo.z+h*.06),(c.x+side*(hi.x-lo.x)*.22,lo.y+h*.13,c.z),(c.x+side*(hi.x-lo.x)*.18,lo.y+h*.18,hi.z-h*.07)],h*.009,'edge',sides=5)
 # Small connected links on the shoulder edges and belt add fine structure
 # without introducing another silhouette above the horn tips.
 for index in [120,139]:
  current,lo,hi,c=anchor(index)
  for j in range(5):ring((c.x+(j-2)*h*.028,lo.y-h*.012,lo.z+h*.016),h*.012,h*.018,'silver',h*.0035,n=10)
 current,lo,hi,c=anchor(27)
 for j in range(7):box((c.x+(j-3)*h*.028,lo.y-h*.005,c.z),(h*.018,h*.008,h*.013),'metal',cut=.24)

def embellish(name,w,d,h):
 """Raised carving follows the supplied anatomy, with distinct ornament by species."""
 global current
 if name=='morgrath':
  embellish_morgrath(h)
  return
 # Microstructure stays on the same rigid island as its underlying source surface.
 for label,components in list(parts[active].items()):
  current=label
  for index,c in enumerate(list(components)):
   low,high=bounds([c]);size=high-low;center=(low+high)/2;tag=c.get('tag','').lower()
   if size.z<h*.075 or size.x<w*.045 or size.y<.015:continue
   if c['color'] in EMISSIVE or len(c['v'])>180:continue
   if name=='puffling' and size.x<w*.16:continue
   front=low.y-.009*h
   organic=name in QUADRUPEDS or name in {'puffling','gnoll-scout'}
   if c['color'] in {'bark','bark-light','cloth','hide'} or organic and any(word in tag for word in ['fur','pink','tan','lizard','puff']):
    # Forked etched ridges and grain on each exposed large surface.
    for j in range(3):
     x=center.x+(j-1)*size.x*.24
     tube([(x,front,low.z+size.z*.15),(x+size.x*.09,front-.008,center.z),(x-size.x*.04,front,high.z-size.z*.10)],h*.004,'bark-light' if name in WOOD else 'edge',sides=4)
    if index%2==0:rune((center.x,front-.012,center.z),min(size.x,size.z)*.18,'violet' if name in WOOD else 'cyan')
    # Raised, staggered surface pieces break up broad source cuboids. Organic
    # creatures use bark chips, coat tufts or scales instead of metal plaques.
    if size.x>w*.14 and size.z>h*.12 and label!='head':
     tint='bark-light' if name in WOOD else 'chitin' if name=='crested-basilisk' else 'fur-edge'
     for row in range(4):
      for col in range(3):
       x=center.x+(col-1+(row%2)*.15)*size.x*.23;z=low.z+size.z*(.17+row*.20)
       box((x,front-h*.006,z),(size.x*.19,h*.014,size.z*.13),tint,cut=.26)
   elif c['color'] in {'stone','obsidian','metal','bone'}:
    box((center.x,front,center.z),(size.x*.80,h*.013,size.z*.72),'edge')
    box((center.x,front-h*.010,center.z),(size.x*.68,h*.012,size.z*.59),'obsidian')
    for sx in [-1,1]:
     for sz in [-1,1]:crystal((center.x+sx*size.x*.28,front-h*.021,center.z+sz*size.z*.24),(h*.013,h*.011,h*.017),'silver')
    if index%2==0:rune((center.x,front-h*.025,center.z),min(size.x,size.z)*.18,'cyan')
 # A different chest ornament and back silhouette are built for each family.
 current='body';bodylow,bodyhigh=bounds(parts[active]['body']);front=bodylow.y-h*.018;chest=h*.52
 if name=='grave-knight':
  ring((0,front,chest),h*.12,h*.15,'silver',h*.012,n=20)
  ring((0,front-h*.01,chest),h*.085,h*.11,'bone',h*.007,n=16)
  crystal((0,front-h*.02,chest),(h*.063,h*.040,h*.086),'cyan')
  for side in [-1,1]:
   for j in range(5):tube([(side*h*.025,front,chest+(j-2)*h*.053),(side*h*.10,front-h*.016,chest+(j-2)*h*.053),(side*h*.19,front+h*.025,chest+(j-2)*h*.047+h*.025)],[h*.012,h*.017,h*.008],'bone',sides=5)
 elif name in {'rotwood-treant','hammer-stump','grumble-root'}:
  for side in [-1,1]:
   for j in range(4):tube([(side*w*.03,front,chest+(j-1.5)*h*.065),(side*w*.12,front-h*.025,chest+(j-1.5)*h*.065),(side*w*.22,front+h*.035,chest+(j-1.5)*h*.055+h*.055)],[h*.011,h*.019,h*.005],'bark-light',sides=5)
  for j in range(3):ring((0,front-h*.02-j*h*.006,chest),h*(.095-j*.026),h*(.12-j*.032),'bark-light' if j%2 else 'bark',h*.009)
  if name=='rotwood-treant':crystal((0,front-h*.035,chest),(h*.025,h*.022,h*.065),'violet')
 elif name in {'moss-golem','magma-brute','gloom-gargoyle','thorn-knight'}:
  for row in range(5):
   for side in [-1,1]:
    x=side*w*(.07+.012*(row%2));z=h*(.38+row*.063)
    box((x,front,z),(w*.14,h*.028,h*.045),'stone' if name in {'moss-golem','gloom-gargoyle'} else 'obsidian',cut=.26)
  if name=='thorn-knight':
   for side in [-1,1]:tube([(side*w*.06,front-h*.03,h*.34),(side*w*.16,front-h*.045,h*.51),(side*w*.12,front-h*.03,h*.69)],[h*.012,h*.024,h*.005],'bark-light',sides=5)
  else:
   for side in [-1,1]:tube([(side*w*.03,front-h*.035,h*.36),(side*w*.09,front-h*.04,h*.47),(side*w*.045,front-h*.045,h*.57),(side*w*.12,front-h*.04,h*.67)],h*.008,'violet' if name=='magma-brute' else 'cyan',sides=4)
 elif name in QUADRUPEDS or name in {'crimson-weaver','tidelord-crab','stinger-wasp'}:
  # Carapace seams, overlapping lamellae and rune-studded back ridges.
  for j in range(7):
   y=bodylow.y+(bodyhigh.y-bodylow.y)*(j+.5)/7;z=min(h*.85,bodyhigh.z)+h*.005
   tube([(-w*.22,y,z-h*.09),(0,y,z),(w*.22,y,z-h*.09)],h*.020,'edge',sides=5)
   if j%2==0:crystal((0,y,z+h*.045),(h*.045,h*.035,h*.085),'cyan')
 elif name=='hollow-scarecrow':
  for j in range(7):tube([(-w*.13,front,h*(.39+j*.04)),(w*.12,front-h*.005,h*(.41+j*.04))],h*.005,'bone',sides=4)

 # Species-specific signatures keep the adapted creatures visually distinct.
 current='head' if 'head' in parts[active] else 'body'
 headlow,headhigh=bounds(parts[active][current]);headfront=headlow.y-h*.016;headcenter=(headlow+headhigh)/2
 if name in {'moss-golem','magma-brute'}:
  for side in [-1,1]:
   current=side<0 and 'left-arm' or 'right-arm'
   if current not in parts[active]:current='body'
   for j in range(5):crystal((side*w*(.25+j*.026),0,h*(.75+j*.025)),(h*.05,h*.08,h*(.10+.015*(j%2))),'violet' if j%2 else 'stone')
 elif name in {'thorn-knight','grave-knight'}:
  # A segmented crown, engraved gorget, riveted visor and hanging reliquary chains.
  for side in [-1,1]:
   for j in range(4):tube([(side*h*(.06+j*.035),headcenter.y,headhigh.z-h*.06),(side*h*(.07+j*.045),headcenter.y+h*.035,headhigh.z+h*(.03+j*.035))],[h*.022,h*.001],'bone',sides=6)
   ring((side*h*.09,headfront,headcenter.z),h*.05,h*.038,'silver',h*.009,n=14)
  for j in range(7):box(((j-3)*h*.025,headfront,headcenter.z-h*.045),(h*.013,h*.023,h*.075),'metal')
  for side in [-1,1]:
   current='body'
   for j in range(7):ring((side*w*.14,front,h*.34-j*h*.023),h*.016,h*.023,'silver',h*.004,n=10)
   crystal((side*w*.14,front,h*.15),(h*.045,h*.023,h*.058),'bone')
 elif name=='shroom-shaman':
  # Radial gills and a ring of carved cap runes around the original umbrella.
  radius=w*.31;capz=headhigh.z-h*.10
  for j in range(24):
   a=j*math.tau/24;tube([(math.sin(a)*radius*.4,headcenter.y+math.cos(a)*radius*.4,capz-h*.055),(math.sin(a)*radius,headcenter.y+math.cos(a)*radius,capz)],[h*.007,h*.010],'bone',sides=4)
   if j%3==0:crystal((math.sin(a)*radius*.72,headcenter.y+math.cos(a)*radius*.72,capz+h*.12),(h*.022,h*.025,h*.05),'violet')
 elif name in {'grumble-root','rotwood-treant','hammer-stump'}:
  for side in [-1,1]:
   for j in range(3):
    x=side*h*(.07+j*.05);tube([(x,headcenter.y,headhigh.z-h*.04),(x*1.6,headcenter.y+h*.04,headhigh.z+h*(.09+j*.025)),(x*2,headcenter.y+h*.03,headhigh.z+h*(.18+j*.015))],[h*.028,h*.016,h*.002],'bark-light')
  for j in range(6):tube([((j-2.5)*h*.027,headfront,headcenter.z-h*.03),((j-2.5)*h*.034,headfront-h*.04,headlow.z-h*.05),((j-2.5)*h*.04,headfront,headlow.z-h*.11)],[h*.012,h*.009,h*.001],'bone',sides=5)
 elif name in {'acorn-seedle','cinder-seedle'}:
  for row in range(3):
   for j in range(12):
    a=(j+row*.5)*math.tau/12;radius=w*(.30-row*.045);z=headhigh.z-h*(.15-row*.04)
    crystal((math.sin(a)*radius,headcenter.y+math.cos(a)*radius,z),(h*.042,h*.035,h*.045),'bark-light' if name=='acorn-seedle' else 'edge')
  for j in range(5):crystal(((j-2)*h*.035,headcenter.y,headhigh.z+h*.035),(h*.023,h*.03,h*(.06+.02*(j%2))),'violet' if name=='cinder-seedle' else 'cyan')
 elif name=='puffling':
  for j in range(18):
   a=j*math.tau/18;radius=w*.39
   crystal((math.sin(a)*radius,headcenter.y+math.cos(a)*radius*.46,h*.57),(h*.035,h*.028,h*.082),'bone' if j%3 else 'cyan')
  for side in [-1,1]:ring((side*w*.16,headfront,h*.63),h*.055,h*.073,'silver',h*.009,n=16)
 elif name in {'pudgy-piglet','thornback-boar','tunnel-mole'}:
  for side in [-1,1]:
   tube([(side*w*.16,headfront+h*.05,headcenter.z-h*.07),(side*w*.23,headfront-h*.08,headcenter.z-h*.02),(side*w*.24,headfront-h*.06,headcenter.z+h*.10)],[h*.055,h*.034,h*.002],'bone-light',sides=7)
  if name=='tunnel-mole':
   for side in [-1,1]:ring((side*w*.115,headfront,headcenter.z+h*.05),h*.065,h*.060,'metal',h*.015,n=16)
   crystal((0,headfront,h*.85),(h*.08,h*.03,h*.07),'cyan')
  else:
   current='body'
   for j in range(7):crystal((0,bodylow.y+(bodyhigh.y-bodylow.y)*j/6,bodyhigh.z+h*.05),(h*.040,h*.06,h*(.08+.025*(j%3))),'bone' if name=='pudgy-piglet' else 'obsidian')
 elif name in FLYERS:
  for side in [-1,1]:
   label=('left' if side<0 else 'right')+'-wing'
   if label not in parts[active]:continue
   current=label;lo,hi=bounds(parts[active][label]);mid=(lo+hi)/2
   for j in range(5):
    z=lo.z+(hi.z-lo.z)*(j+.5)/5;tube([(side*w*.09,mid.y-.025,z),(side*w*.27,lo.y-h*.01,z+h*.04),(side*w*.44,mid.y,z-h*.015)],[h*.006,h*.012,h*.004],'bone',sides=5)
   for j in range(7):crystal((side*w*(.15+j*.04),mid.y,hi.z-h*.025*j),(h*.012,h*.014,h*.034),'cyan')
 elif name=='crimson-weaver':
  for j in range(8):
   a=j*math.tau/8;ring((math.sin(a)*w*.085,headfront,headcenter.z+math.cos(a)*h*.11),h*.022,h*.028,'bone',h*.007,n=12)
  for side in [-1,1]:tube([(side*w*.10,headfront,headcenter.z),(side*w*.15,headfront-h*.14,headcenter.z-h*.06),(side*w*.065,headfront-h*.23,headcenter.z-h*.18)],[h*.043,h*.031,h*.001],'bone-light')
 elif name=='hollow-scarecrow':
  for j in range(7):
   x=(j-3)*h*.026;tube([(x-h*.015,headfront,headcenter.z-h*.07),(x+h*.016,headfront-h*.01,headcenter.z-h*.012)],h*.007,'bone',sides=4)
  for side in [-1,1]:
   current=('left' if side<0 else 'right')+'-arm'
   if current not in parts[active]:current='body'
   lo,hi=bounds(parts[active][current]);center=(lo+hi)/2
   for j in range(7):tube([(center.x,center.y,lo.z+h*.04),(center.x+side*h*(.04+j*.012),center.y+h*(j-3)*.008,lo.z-h*(.04+j*.013))],[h*.009,h*.001],'bone',sides=4)
 elif name=='spring-boing':
  current='body'
  points=[]
  for j in range(145):
   a=j/144*math.tau*6;points.append((math.sin(a)*w*.28,math.cos(a)*w*.28,h*.16+j/144*h*.38))
  tube(points,h*.013,'silver',sides=5)
  for j in range(8):a=j*math.tau/8;crystal((math.sin(a)*w*.22,math.cos(a)*w*.22,h*.60),(h*.03,h*.028,h*.08),'violet')
 elif name=='gnoll-scout':
  current='body'
  for j in range(10):
   x=w*.20-j*w*.045;z=h*.67-j*h*.030;box((x,front,z),(h*.068,h*.02,h*.08),'metal');rune((x,front-h*.025,z),h*.026,'cyan')
  for side in [-1,1]:
   current='head';tube([(side*w*.13,headfront,headcenter.z+h*.03),(side*w*.18,headfront-h*.055,headcenter.z-h*.06)],[h*.025,h*.002],'bone-light')
 elif name=='crested-basilisk':
  current='body'
  for j in range(11):
   y=bodylow.y+(bodyhigh.y-bodylow.y)*j/10;z=bodyhigh.z+h*.012
   tube([(0,y,z),(0,y+h*.04,z+h*(.08+.12*math.sin(j/10*math.pi)))],[h*.06,h*.001],'bone',sides=6)
   crystal((0,y-h*.014,z+h*.035),(h*.018,h*.020,h*.034),'violet')
 elif name=='tidelord-crab':
  for side in [-1,1]:
   current=('left' if side<0 else 'right')+'-arm'
   if current not in parts[active]:current='body'
   lo,hi=bounds(parts[active][current]);center=(lo+hi)/2
   for j in range(6):crystal((center.x+side*h*.025*j,lo.y-h*.006,center.z-h*.13+j*h*.05),(h*.034,h*.026,h*.055),'bone-light')
   rune((center.x,lo.y-h*.040,center.z),h*.095,'cyan')
 # Source eye locations remain the facial anchor: sockets, light catches and a
 # strong brow sit in front of ornament so the small silhouettes stay expressive.
 eye_anchors=[]
 for label,components in parts[active].items():
  current=label
  for c in list(components):
   tag=c.get('tag','').lower()
   if not tag:continue
   lo,hi=bounds([c]);center=(lo+hi)/2;size=hi-lo
   if 'eye' not in tag and not ('glow' in tag and h*.60<center.z<h*.90 and abs(center.x)<w*.18 and center.y<-d*.12 and size.x<w*.15 and size.z<h*.12):continue
   eye_anchors.append((label,center.copy(),lo.y))
   sx=max(h*.021,min(h*.062,size.x*.65));sz=max(h*.020,min(h*.055,size.z*.65));y=lo.y-h*.045
   box((center.x,y,center.z),(sx*2.7,h*.014,sz*2.4),'dark')
   box((center.x,y-h*.012,center.z),(sx*1.7,h*.013,sz*1.65),'eye')
   box((center.x-sx*.45,y-h*.023,center.z+sz*.42),(sx*.52,h*.008,sz*.46),'bone-light')
   box((center.x,y-h*.008,center.z+sz*1.4),(sx*2.95,h*.03,sz*.3),'bone')
 if eye_anchors and name in {'pudgy-piglet','thornback-boar','tunnel-mole','crested-basilisk','tidelord-crab','gnoll-scout','vine-stalker'}:
  current=eye_anchors[0][0];center=sum((p for _,p,_ in eye_anchors),Vector())/len(eye_anchors);front=min(y for _,_,y in eye_anchors)-h*.065
  spread=max(p.x for _,p,_ in eye_anchors)-min(p.x for _,p,_ in eye_anchors);muzzle_width=max(h*.19,spread*.9)
  nose_z=center.z-h*.12;is_reptile=name in {'crested-basilisk','vine-stalker'};is_crab=name=='tidelord-crab'
  if not is_crab:
   box((center.x,front,nose_z),(muzzle_width,h*.12,h*.15),'muzzle' if not is_reptile else 'chitin',cut=.28)
   box((center.x,front+h*.005,nose_z-h*.092),(muzzle_width*.83,h*.11,h*.042),'bone' if is_reptile else 'fur-edge',cut=.26)
   for side in [-1,1]:
    box((center.x+side*muzzle_width*.23,front-h*.066,nose_z+h*.014),(h*.025,h*.012,h*.025),'dark',cut=.2)
    # Three cheek planes step down and inward instead of a single square face.
    for j in range(3):box((center.x+side*(muzzle_width*.63-j*h*.016),front+h*.04,nose_z+h*(.09-j*.055)),(h*.070,h*.055,h*.055),'fur-edge' if not is_reptile else 'edge',cut=.25)
   if name=='tunnel-mole':crystal((center.x,front-h*.077,nose_z+h*.027),(h*.040,h*.020,h*.027),'muzzle')
   if name in {'gnoll-scout','crested-basilisk','vine-stalker'}:
    for j in range(6):crystal((center.x+(j-2.5)*muzzle_width*.12,front-h*.065,nose_z-h*.065),(h*.012,h*.011,h*.024),'bone-light')
  else:
   for side in [-1,1]:
    tube([(center.x+side*h*.08,front,center.z-h*.09),(center.x+side*h*.11,front-h*.08,center.z-h*.15),(center.x+side*h*.025,front-h*.12,center.z-h*.17)],[h*.035,h*.027,h*.008],'bone',sides=6)
  if is_reptile or is_crab:
   current='body'
   for row in range(5):
    for col in range(5):
     x=(col-2+(row%2)*.25)*w*.065;y=bodylow.y+(bodyhigh.y-bodylow.y)*(.2+row*.14)
     box((x,y,bodyhigh.z+h*.012),(w*.054,h*.045,h*.032),'edge' if (row+col)%3 else 'chitin',cut=.3)

roots={};stats={}
for index,name in enumerate(NAMES):
 active='morgrath' if name=='morgrath' else 'raid-'+name;parts[active]={};components=raw[name]
 low,high=bounds(components);height=HEIGHTS[index];factor=height/(high.z-low.z);offset=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
 if name=='morgrath':
  assert len(components)==265,'Morgrath source topology changed; review semantic island attachments'
  # Feet, rather than the long blade, define the ground plane; the torso defines
  # the lateral origin so the asymmetric held weapon cannot skew joint positions.
  footlo,foothi=bounds([components[0],components[13]]);torsolo,torsohi=bounds([components[50]])
  offset=Vector(((torsolo.x+torsohi.x)/2,(footlo.y+foothi.y)/2,footlo.z));factor=height/(high.z-footlo.z)
 for c in components:c['v']=[(v-offset)*factor for v in c['v']]
 if name=='morgrath':
  # Leave clearance beneath the cleaver when the original boots are planted.
  # Compress only the blade below its guard, retaining the connected grip.
  guardlo,guardhi=bounds([components[221]]);guard=(guardlo.z+guardhi.z)/2;bladelo,_=bounds([components[212]])
  blade_factor=(guard-.12)/(guard-bladelo.z)
  for c in components[212:221]+components[226:235]:
   for v in c['v']:v.z=guard+(v.z-guard)*blade_factor
 low,high=bounds(components);w,d,h=high-low
 for c in components:parts[active].setdefault(classify(name,c,w,d,h),[]).append(c)
 assert parts[active].get('body'),name+' body grouping'
 # Ornament must never move a joint: capture source anatomy before adding it.
 anatomy_bounds={label:bounds(cs) for label,cs in parts[active].items()}
 joint_pivots={}
 if name=='morgrath':
  for label,source_index in [('head',72),('left-arm',120),('right-arm',139),('left-leg',10),('right-leg',23)]:
   lo,hi=bounds([components[source_index]]);pivot=(lo+hi)/2
   if label=='head':pivot.z=lo.z
   elif 'arm' in label:pivot.x+=(-1 if label=='right-arm' else 1)*(hi.x-lo.x)*.20
   else:pivot.z=hi.z
   joint_pivots[label]=pivot
 elif name in {'thorn-knight','hammer-stump','gnoll-scout','shroom-shaman','moss-golem','magma-brute'}:
  anchors={'thorn-knight':[('head',53),('left-arm',34),('right-arm',50)],'hammer-stump':[('left-arm',22),('right-arm',24)],'gnoll-scout':[('head',12),('left-arm',28),('right-arm',30)],'shroom-shaman':[('left-arm',39),('right-arm',40)],'moss-golem':[('head',11),('left-arm',17),('right-arm',30)],'magma-brute':[('head',7),('left-arm',11),('right-arm',20)]}[name]
  for label,source_index in anchors:
   lo,hi=bounds([components[source_index]]);pivot=(lo+hi)/2
   if label=='head':pivot.z=lo.z
   elif name in {'moss-golem','magma-brute'}:pivot.x+=(-1 if label=='right-arm' else 1)*(hi.x-lo.x)*.25
   else:pivot.x=lo.x if label=='right-arm' else hi.x;pivot.z=hi.z
   joint_pivots[label]=pivot
 embellish(name,w,d,h)
 root=bpy.data.objects.new(active,None);scene.collection.objects.link(root);roots[active]=root
 root['source']=inventory[name]['file'];root['source_sha256']=inventory[name]['sha256'];root['source_vertices']=inventory[name]['vertices'];root['axes']='metres, Y-up/+Z-front, ground origin';root['attack_contact']=.5
 rig={};pivots={};bases={};bodypivot=Vector((0,0,h*.46))
 for label,part_components in parts[active].items():
  lo,hi=anatomy_bounds.get(label) or bounds(part_components);center=(lo+hi)/2
  if label=='body':pivot=bodypivot
  elif label in joint_pivots:pivot=joint_pivots[label]
  elif label=='head':pivot=Vector((center.x,center.y,lo.z+(hi.z-lo.z)*.12))
  elif 'wing' in label:pivot=Vector(((-1 if label.startswith('left') else 1)*w*.10,center.y,h*.64))
  elif 'arm' in label:pivot=Vector(((-1 if label.startswith('left') else 1)*w*.24,center.y,hi.z-h*.09))
  elif 'leg' in label:pivot=Vector((center.x,center.y,hi.z))
  else:pivot=Vector((center.x,lo.y,center.z))
  pivots[label]=pivot;rig[label]=mesh_part(active,label,part_components,pivot)
 for label,obj in rig.items():
  obj.parent=root if label=='body' else rig['body'];obj.location=pivots[label]-(Vector() if label=='body' else bodypivot);bases[label]=obj.location.copy()
 if name=='morgrath':
  # Runtime trails may follow this non-rendering authored blade tip. glTF prune
  # retains leaves, so the marker survives without adding a mesh or draw call.
  blade=raw[name][212]['v'];bottom=min(v.z for v in blade);tip_vertices=[v for v in blade if v.z<bottom+.15]
  tip=sum(tip_vertices,Vector())/len(tip_vertices)
  marker=bpy.data.objects.new('morgrath-contact-tip',None);scene.collection.objects.link(marker);marker.parent=rig['right-arm'];marker.location=tip-pivots['right-arm'];marker['purpose']='right-hand cleaver contact'
 if name=='hammer-stump':
  lo,hi=bounds([raw[name][26]]);marker=bpy.data.objects.new('hammer-stump-contact-tip',None);scene.collection.objects.link(marker);marker.parent=rig['right-arm'];marker.location=(lo+hi)/2-pivots['right-arm']
 animate_rig(active,root,rig,bases,h,name)
 stats[active]={'source_vertices':inventory[name]['vertices'],'parts':len(rig),'polygons':sum(len(obj.data.polygons) for obj in rig.values())}
 print('AUTHORED',active,json.dumps(stats[active]),flush=True)

scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT')
for root in roots.values():
 for obj in [root,*root.children_recursive]:obj.select_set(True)
OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_force_sampling=False,export_cameras=False,export_lights=False,export_extras=True)
with tempfile.TemporaryDirectory(prefix='raid-approach-') as tmp:
 cli=['npx','--yes','@gltf-transform/cli@4.5.0'];a=str(Path(tmp)/'resampled.glb');b=str(Path(tmp)/'dedup.glb')
 subprocess.run(cli+['resample',str(OUT),a],check=True);subprocess.run(cli+['dedup',a,b],check=True);subprocess.run(cli+['prune',b,str(OUT),'--keep-leaves','true'],check=True)

# Save an editable inspection layout after exporting origin-centred runtime roots.
for i,(key,root) in enumerate(roots.items()):
 root.location=((i%5-2)*5,(i//5)*5,0)
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=42;area.spaces.active.region_3d.view_location=(0,10,2)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/raid-approach-monsters.blend'))
print('RAID_APPROACH_INVENTORY='+json.dumps(inventory),flush=True)
print('RAID_APPROACH_EXPORT='+json.dumps({'bytes':OUT.stat().st_size,'models':len(roots),'clips':len(roots)*6+2}),flush=True)

if '--render' in sys.argv:
 # One contact sheet shows every authored creature; columns are consistent to the roster.
 for i,(key,root) in enumerate(roots.items()):
  root.rotation_euler.z=-.35;root.location=(0,0,0);root.scale=(1,1,1);bpy.context.view_layer.update()
  corners=[obj.matrix_world@Vector(corner) for obj in root.children_recursive if obj.type=='MESH' for corner in obj.bound_box]
  width=max(v.x for v in corners)-min(v.x for v in corners);height=max(v.z for v in corners)-min(v.z for v in corners)
  scale=min(2.9/height,3.8/width);root.scale=(scale,)*3;root.location=((i%5-2)*4.8,0,-(i//5)*4.25)
  curve=bpy.data.curves.new(key+' label','FONT');curve.body=key.removeprefix('raid-').replace('-',' ').title();curve.align_x='CENTER';curve.size=.24;curve.extrude=0
  obj=bpy.data.objects.new(key+' label',curve);scene.collection.objects.link(obj);obj.location=(root.location.x,-.8,root.location.z-.45);obj.rotation_euler=(math.pi/2,0,0)
  textmat=bpy.data.materials.get('Sheet label') or bpy.data.materials.new('Sheet label');textmat.diffuse_color=(.7,.75,.90,1);curve.materials.append(textmat)
 world=bpy.data.worlds.new('Void inspection world');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.065,.10,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7
 def area(name,loc,energy,color,size):
  data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,-6))-obj.location).to_track_quat('-Z','Y').to_euler()
 area('Key',(-12,-17,12),3400,(.8,.85,1),14);area('Fill',(12,-11,-4),2300,(.6,.43,1),12);area('Rim',(0,6,8),3800,(.2,.7,1),10)
 camera=bpy.data.cameras.new('Contact sheet');cam=bpy.data.objects.new('Contact sheet',camera);scene.collection.objects.link(cam);cam.location=(0,-42,6);cam.rotation_euler=(Vector((0,0,-7))-cam.location).to_track_quat('-Z','Y').to_euler();camera.type='ORTHO';camera.ortho_scale=27;scene.camera=cam
 scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=2000;scene.render.resolution_y=1900;scene.render.resolution_percentage=100;scene.render.film_transparent=False
 scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'assets/source/raid-approach-monsters-preview.png');bpy.ops.render.render(write_still=True)
