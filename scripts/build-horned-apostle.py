"""Author void armor on BlocBoyBenji's supplied silhouette and rigid animation.
Blender --background --disable-autoexec --python scripts/build-horned-apostle.py -- --render
"""
import bpy, json, math, hashlib, subprocess, sys, tempfile
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets/source/horned-apostle/horned_apostle.blend'
OUT=ROOT/'public/models/horned-apostle.glb'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False,use_scripts=False)
scene=bpy.context.scene
# Connected source islands are assigned to existing anatomical pivots, never remeshed.
def islands(obj):
 mesh=obj.data; adjacency=[set() for _ in mesh.vertices]
 for edge in mesh.edges:
  a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
 todo=set(range(len(mesh.vertices)))
 while todo:
  found={todo.pop()}; stack=list(found)
  while stack:
   for n in adjacency[stack.pop()]&todo:todo.remove(n);found.add(n);stack.append(n)
  ids=sorted(found);remap={v:i for i,v in enumerate(ids)}
  coords=[obj.matrix_world@mesh.vertices[v].co for v in ids]
  polys=[p for p in mesh.polygons if p.vertices[0] in found]
  yield {'vertices':coords,'faces':[tuple(remap[v] for v in p.vertices) for p in polys], 'materials':[mesh.materials[p.material_index].name for p in polys],'first':ids[0]}
original=list(islands(bpy.data.objects['Horned_Apostle']))
effects=list(islands(bpy.data.objects['Death_Stars_and_Black_Sun']))
assert len(original)==319 and len(effects)==42, 'Unexpected supplied source; review semantic grouping before exporting.'
colors={}
for mat in bpy.data.materials:
 node=mat.node_tree.nodes.get('Principled BSDF') if mat.node_tree else None
 if node:colors[mat.name]=tuple(node.inputs['Base Color'].default_value)
ground=min(v.z for component in original for v in component['vertices'])
parts={}
def add(label,component):parts.setdefault(label,[]).append(component)
for component in original:
 mat=component['materials'][0]; center=sum(component['vertices'],Vector())/len(component['vertices'])
 if mat.startswith('Wing_'):label=('right' if center.x>0 else 'left')+'-wing'
 elif component['first']>=2151:label='halo'
 elif mat in ['Horn','Horn_Ridge','Hair','Eyes_Red'] or abs(center.x)<.5 and center.z>4.46:label='head'
 elif abs(center.x)>.58 and center.y<.2:label=('right' if center.x>0 else 'left')+('-arm' if center.z>4 else '-lower-arm')
 else:label='body'
 add(label,component)
for component in effects:add('left-arm' if component['first']<170 else 'stars',component)
# Authored surface detail shares each existing rigid pivot and the same two palettes.
# This adds actual geometry visible in silhouettes/lighting, without texture requests.
# Original material names remain semantic selection tags; every rendered color is
# remapped to the void palette. The separate true-copy gem is the sole gold cue.
colors.update({
 'Claws':(.012,.008,.025,1),'Hair':(.37,.31,.52,1),'Horn':(.019,.011,.038,1),
 'Horn_Ridge':(.15,.11,.25,1),'Moss':(.095,.035,.18,1),'Moss_Death_Glow':(.39,.09,.86,1),
 'Glow_Soft':(.19,.61,.87,1),'Pale_Skin':(.31,.27,.43,1),'Skin_Shadow':(.11,.075,.18,1),
 'Shadow_Crystal':(.12,.025,.23,1),'Shadow_Robe':(.012,.008,.027,1),
 'Stone':(.025,.018,.052,1),'Stone_Light':(.095,.07,.16,1),'Veins':(.32,.055,.66,1),
 'Void':(.003,.002,.012,1),'Wing_Bone':(.12,.085,.21,1),'Wing_Membrane':(.008,.005,.021,1),
 'Carved_Bone':(.12,.09,.21,1),'Bone_Light':(.29,.23,.43,1),
 'Antique_Gold':(.17,.20,.34,1),'Robe_Panel':(.025,.013,.059,1),
 'Wing_Panel':(.032,.013,.069,1),'Wing_Stitch':(.33,.065,.67,1),
 'Void_Armor':(.055,.031,.105,1),'Void_Edge':(.26,.17,.40,1),
 'Void_Rune':(.18,.65,.94,1),'Void_Fissure':(.50,.07,.92,1)})
def detail(label,vertices,faces,material):
 c={'vertices':[Vector(v) for v in vertices],'faces':faces,'materials':[material]*len(faces),'first':-1}
 add(label,c);return c
def tube(label,points,radius,material,sides=5):
 pts=[Vector(v) for v in points];vertices=[];faces=[]
 for i,p in enumerate(pts):
  tangent=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized()
  cross=tangent.cross(Vector((0,1,0)))
  if cross.length<.001:cross=tangent.cross(Vector((1,0,0)))
  u=cross.normalized();v=tangent.cross(u).normalized();r=radius[i] if isinstance(radius,list) else radius
  for n in range(sides):vertices.append(p+r*(math.cos(n*math.tau/sides)*u+math.sin(n*math.tau/sides)*v))
 for i in range(len(pts)-1):
  for n in range(sides):faces.append((i*sides+n,i*sides+(n+1)%sides,(i+1)*sides+(n+1)%sides,(i+1)*sides+n))
 faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+n for n in range(sides))])
 return detail(label,vertices,faces,material)
def ring(label,center,rx,rz,material,radius=.018,segments=16):
 x,y,z=center
 return tube(label,[(x+rx*math.cos(i*math.tau/segments),y,z+rz*math.sin(i*math.tau/segments)) for i in range(segments+1)],radius,material,4)
def jewel(label,center,size,material):
 x,y,z=center;sx,sy,sz=size
 return detail(label,[(x-sx,y,z),(x+sx,y,z),(x,y-sy,z),(x,y+sy,z),(x,y,z-sz),(x,y,z+sz)],[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)],material)
def rune(label,x,y,z,size=.06,material='Carved_Bone'):
 tube(label,[(x,y,z-size),(x,y,z+size)],.009,material,4)
 tube(label,[(x-size*.55,y,z+size*.6),(x+size*.5,y,z),(x-size*.55,y,z-size*.45)],.009,material,4)

# Layered ribs, collar plates, an inset soul reliquary and a carved hanging belt.
for side in [-1,1]:
 for i in range(5):
  z=3.63+i*.12
  tube('body',[(side*.08,-.39,z),(side*.31,-.43,z+.035),(side*(.48-i*.025),-.29,z+.14)], [.027,.044,.018],'Bone_Light',6)
 tube('body',[(side*.10,-.32,4.35),(side*.38,-.36,4.37),(side*.61,-.15,4.27)],[.045,.09,.035],'Carved_Bone',6)
 for i in range(4):
  jewel('body',(side*(.16+i*.13),-.42,3.10),(.065,.045,.10),'Antique_Gold')
 ring('body',(side*.43,-.42,3.01),.10,.09,'Carved_Bone')
 tube('body',[(side*.43,-.42,2.95),(side*.57,-.43,2.76),(side*.50,-.45,2.53)],.018,'Antique_Gold',5)
 jewel('body',(side*.50,-.45,2.45),(.10,.035,.16),'Carved_Bone')
 rune('body',side*.50,-.492,2.45,.06,'Moss_Death_Glow')
ring('body',(0,-.43,3.97),.20,.23,'Antique_Gold',.03,20)
ring('body',(0,-.46,3.97),.13,.16,'Bone_Light',.014,16)
for i in range(8):
 a=i*math.tau/8;jewel('body',(.235*math.sin(a),-.44,3.97+.27*math.cos(a)),(.035,.04,.05),'Carved_Bone')
# Seven separate embroidered panels follow the robe rather than covering the feet.
for i in range(7):
 x=(i-3)*.18;top=2.90;bottom=.63+.07*(i%3);y=-.39+abs(x)*.08
 detail('body',[(x-.077,y,top),(x+.077,y,top),(x+.095,y-.035,bottom+.15),(x,y-.05,bottom),(x-.095,y-.035,bottom+.15)],[(0,1,2,3,4)],'Robe_Panel')
 for side in [-1,1]:tube('body',[(x+side*.061,y-.01,top-.06),(x+side*.071,y-.045,bottom+.18)],.009,'Antique_Gold',4)
 for n in range(4):rune('body',x,y-.06,top-.25-n*.43,.062,'Void_Rune' if (i+n)%3==0 else 'Void_Fissure')

# Overlapping obsidian shoulder plates and cyan cuts add a hard silhouette above
# the old ribs. Each low-poly plate shares the existing arm/body rigid pivot.
for side in [-1,1]:
 for i in range(3):
  x=side*(.38+i*.105);z=4.38-i*.055
  jewel('body',(x,-.285,z),(.12,.095,.16),'Void_Armor')
  tube('body',[(x-side*.05,-.38,z+.08),(x+side*.06,-.39,z),(x+side*.075,-.35,z-.08)],.010,'Void_Rune',4)
 # Broken luminous fissures remain fine inlay rather than a glowing full plate.
 tube('body',[(side*.10,-.448,3.62),(side*.23,-.455,3.53),(side*.17,-.45,3.40)],.011,'Void_Fissure',4)

# Bone bracers, raised tendons, joint rivets and tiny segmented knuckle plates.
for label in ['left-arm','right-arm','left-lower-arm','right-lower-arm']:
 for c in list(parts[label]):
  if c['materials'][0]!='Pale_Skin':continue
  low=Vector(tuple(min(v[i] for v in c['vertices']) for i in range(3)));high=Vector(tuple(max(v[i] for v in c['vertices']) for i in range(3)));center=(low+high)/2;extent=high-low
  if extent.length<.18:continue
  axis=max(range(3),key=lambda i:extent[i]);length=extent[axis]
  if length>.3:
   p=center.copy();q=center.copy();p[axis]-=length*.32;q[axis]+=length*.32;p.y=q.y=low.y-.018
   tube(label,[p,(p+q)/2+Vector((0,-.035,0)),q],[.018,.028,.012],'Carved_Bone',5)
   for fraction in [-.28,.24]:
    at=center.copy();at[axis]+=length*fraction;at.y=low.y-.035
    jewel(label,at,(.065,.025,.055),'Antique_Gold')
  else:jewel(label,(center.x,low.y-.012,center.z),(.024,.018,.028),'Carved_Bone')

# Skull sockets, sculpted brow/cheek ridges, teeth and a forehead crest.
for side in [-1,1]:
 tube('head',[(side*.025,-.327,4.85),(side*.11,-.345,4.90),(side*.22,-.30,4.86)],[.023,.043,.025],'Carved_Bone',6)
 tube('head',[(side*.20,-.32,4.75),(side*.16,-.35,4.65),(side*.07,-.33,4.61)],[.04,.027,.014],'Bone_Light',5)
 tube('head',[(side*.03,-.32,4.66),(side*.035,-.345,4.55)],[.025,.002],'Bone_Light',5)
 tube('head',[(side*.07,-.26,5.04),(side*.25,-.18,5.08),(side*.36,.00,5.07)],.027,'Antique_Gold',5)
 jewel('head',(side*.28,-.02,4.69),(.052,.045,.10),'Antique_Gold')
 ring('head',(side*.28,-.02,4.53),.075,.11,'Carved_Bone',.012,12)
jewel('head',(0,-.29,5.02),(.075,.055,.13),'Carved_Bone')
rune('head',0,-.351,5.025,.075,'Moss_Death_Glow')
# Thin metal tracery on selected horn ridges is also included in the wearable crown.
for c in list(parts['head']):
 if c['materials'][0]!='Horn_Ridge':continue
 center=sum(c['vertices'],Vector())/len(c['vertices'])
 if int(center.z*10)%3:continue
 vertices=[center+(v-center)*1.055 for v in c['vertices']]
 detail('head',vertices,c['faces'],'Antique_Gold')

# Inset membrane panels, branching veins and hand stitches on every wing sail.
for label in ['left-wing','right-wing']:
 for c in list(parts[label]):
  if c['materials'][0]!='Wing_Membrane':continue
  unique=[]
  for v in c['vertices']:
   if not any(abs(v.x-p.x)<.02 and abs(v.z-p.z)<.02 for p in unique):unique.append(v.copy())
  if len(unique)!=3:continue
  center=sum(unique,Vector())/3
  inset=[center+(v-center)*.88+Vector((0,-.025,0)) for v in unique]
  panel=detail(label,inset,[(0,1,2)],'Wing_Panel')
  if (inset[1]-inset[0]).cross(inset[2]-inset[0]).y>0:panel['faces']=[(2,1,0)]
  for v in inset:tube(label,[center+Vector((0,-.04,0)),(center+v)/2+Vector((0,-.04,0)),v], [.012,.017,.008],'Wing_Stitch',4)
  a,b=inset[1:];edge=b-a
  for i in range(1,5):
   p=a+edge*i/5;offset=(center-p).normalized()*.045
   tube(label,[p-offset+Vector((0,-.016,0)),p+offset+Vector((0,-.016,0))],.009,'Carved_Bone',4)
 for c in list(parts[label]):
  if c['materials'][0]!='Wing_Bone':continue
  center=sum(c['vertices'],Vector())/len(c['vertices'])
  if center.z>4.7:jewel(label,center+Vector((0,-.07,0)),(.05,.025,.075),'Carved_Bone')
# The segmented reliquary halo and its runes remain readable on all three forms.
for i in range(16):
 a=i*math.tau/16;x=.91*math.sin(a);z=5+.91*math.cos(a)
 jewel('halo',(x,.42,z),(.035,.035,.055),'Antique_Gold')
 if i%2==0:rune('halo',x,.378,z,.033,'Moss_Death_Glow')
# Separated eclipse fragments float around the existing halo, leaving visible
# negative space between the obsidian fragments and their lilac etched edges.
for i in range(8):
 a=i*math.tau/8+.13;x=1.08*math.sin(a);z=5+1.08*math.cos(a)
 jewel('halo',(x,.40,z),(.07,.045,.11),'Void_Armor')
 if i%2==0:
  tube('halo',[(1.09*math.sin(a+d),.34,5+1.09*math.cos(a+d)) for d in [-.075,0,.075]],.012,'Void_Fissure',4)
weapon_detail=[]
for label in ['left-arm','stars']:
 before=len(parts[label])
 for c in list(parts[label]):
  if c['materials'][0]!='Void' or len(c['vertices'])<12:continue
  center=sum(c['vertices'],Vector())/len(c['vertices']);radius=max((v-center).length for v in c['vertices'])
  ring(label,center+Vector((0,-radius*.45,0)),radius*.9,radius*.9,'Antique_Gold',.018,20)
  for i in range(8):
   a=i*math.tau/8;jewel(label,center+Vector((radius*.9*math.sin(a),-radius*.45,radius*.9*math.cos(a))),(.025,.025,.038),'Carved_Bone')
 if label=='left-arm':weapon_detail=parts[label][before:]
for i in range(12):
 a=i*math.tau/12;x=1.8*math.sin(a);z=3.8+1.8*math.cos(a)
 jewel('stars',(x,-.55,z),(.028,.023,.05),'Antique_Gold')
# Blender source is already Z-up/-Y-front; GLB export maps it to Y-up/+Z-front.
pivots={'body':(0,0,3.6),'head':(0,0,4.5),'halo':(0,.5,5),'right-arm':(.64,0,4.2),'left-arm':(-.64,0,4.2),'right-lower-arm':(.46,0,3.7),'left-lower-arm':(-.46,0,3.7),'right-wing':(.30,.35,4.2),'left-wing':(-.30,.35,4.2),'stars':(0,0,3.8)}
pivots={k:Vector((x,y,z-ground)) for k,(x,y,z) in pivots.items()}
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene.name='Horned Apostle - void armor and articulated variants';scene.render.fps=30;scene.frame_start=0;scene.frame_end=60
palette=bpy.data.materials.new('Apostle obsidian vertex palette');palette.use_nodes=True
sh=palette.node_tree.nodes.get('Principled BSDF');sh.inputs['Roughness'].default_value=.64;sh.inputs['Metallic'].default_value=.18
attr=palette.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='ApostleTint';palette.node_tree.links.new(attr.outputs['Color'],sh.inputs['Base Color'])
glow=palette.copy();glow.name='Apostle emissive vertex palette';sh=glow.node_tree.nodes.get('Principled BSDF');glow.node_tree.links.new(glow.node_tree.nodes.get('Color Attribute').outputs['Color'],sh.inputs['Emission Color']);sh.inputs['Emission Strength'].default_value=1.35

def color(mat,variant,label):
 tint=colors[mat];emissive=mat in ['Moss_Death_Glow','Glow_Soft','Eyes_Red','Veins','Wing_Stitch','Void_Rune','Void_Fissure']
 if variant=='apostle-clone' and mat=='Eyes_Red':tint=(.58,.12,1,1)
 if variant=='apostle-incarnate':
  if mat in ['Pale_Skin','Hair']:tint=(.11,.075,.21,1)
  if mat in ['Veins','Moss_Death_Glow','Glow_Soft','Wing_Bone','Horn_Ridge']:tint=(.36,.13,.91,1);emissive=True
  if mat=='Void_Rune':tint=(.34,.79,1,1)
 return tint,emissive

def mesh_part(name,components,pivot,variant,label,scale=1):
 vertices=[];faces=[];tints=[];materials=[]
 for c in components:
  offset=len(vertices);vertices += [(v-Vector((0,0,ground))-pivot)*scale for v in c['vertices']]
  for f,mat in zip(c['faces'],c['materials']):
   faces.append(tuple(offset+i for i in f));tint,emissive=color(mat,variant,label);tints.append(tint);materials.append(int(emissive))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(palette);mesh.materials.append(glow);mesh.update()
 tint=mesh.color_attributes.new(name='ApostleTint',type='BYTE_COLOR',domain='CORNER')
 for face,c,mat in zip(mesh.polygons,tints,materials):
  face.material_index=mat
  for i in face.loop_indices:tint.data[i].color=c
 obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);return obj
roots={};rigs={};bases={}
for kind in ['horned-apostle','apostle-clone','apostle-incarnate']:
 root=bpy.data.objects.new(kind,None);scene.collection.objects.link(root);roots[kind]=root;rigs[kind]={};bases[kind]={}
 root['source']='BlocBoyBenji - Discord message 1552464777131859990';root['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest();root['axes']='metres; Y-up/+Z-front; ground origin';root['attack_contact']=.5
 for label in ['body','head','right-arm','left-arm','right-lower-arm','left-lower-arm','right-wing','left-wing','halo','stars']:
  obj=mesh_part(kind+'-'+label,parts[label],pivots[label],kind,label);obj.parent=root if label=='body' else rigs[kind]['body'];obj.location=pivots[label]-(pivots['body'] if label!='body' else Vector());rigs[kind][label]=obj;bases[kind][label]=obj.location.copy()
 # A bright center gem makes the true clone readable independently of eye pixels.
 if kind=='horned-apostle':
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.16,location=(0,.5,5.95-ground));gem=bpy.context.object;gem.name=kind+'-halo-gem';gem.parent=rigs[kind]['halo'];gem.location=(0,-.045,.95)
  mat=bpy.data.materials.new('True Apostle gold halo gem');mat.diffuse_color=(1,.65,.06,1);mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=mat.diffuse_color;shader.inputs['Emission Color'].default_value=mat.diffuse_color;shader.inputs['Emission Strength'].default_value=1.5;gem.data.materials.append(mat)
 if kind=='apostle-incarnate':
  # Reuse the original handheld Black Sun, enlarged behind the final form.
  sun=mesh_part(kind+'-black-sun', [c for c in effects if c['first']<170],Vector((-2.15,-.75,5-ground)),kind,'stars',4.8);sun.parent=rigs[kind]['body'];sun.location=(0,1.4,1.15);sun.scale.y=.16

spell_clips=['black-claw','death-stars','death-palm','four-hands','soul-chains','shadow-wings','black-sun','soul-harvest','death-clones','suits-judgment','realm-transition','incarnate-transition']
frames_by_clip={'idle':60,'walk':36,'auto':30,'attack':48,'cast':60,'death':60,**{name:60 for name in spell_clips}}
def ease(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def spell_pose(suffix,label,t,side):
 # Every strike contacts at t=.5; the renderer maps this to the authoritative impact.
 # Rituals establish their silhouette early, then hold until their cast is interrupted/finishes.
 r=[0,0,0];pos=Vector();scale=[1,1,1]
 charge=ease(t/.36)*(1-ease((t-.42)/.12))
 hit=ease((t-.39)/.11)*(1-ease((t-.52)/.48))
 hold=ease(t/.10)*(1-ease((t-.52)/.48))
 swell=math.sin(t*math.pi)**2
 arm='arm' in label;lower='lower-arm' in label;wing=label.endswith('wing')
 if suffix=='black-claw':
  if label=='body':r[2]=-.19*charge+.24*hit;r[0]=.16*hit;pos.y=-.3*hit
  if arm:r[1]=-side*(.55*charge+.16*hit);r[2]=side*(.85*charge-1.02*hit)*( .7 if lower else 1);r[0]=-.25*charge+.35*hit
  if wing:r[2]=side*(.08*charge-.18*hit)
  if label=='head':r[2]=.16*charge-.14*hit
 elif suffix=='death-palm':
  if label=='body':r[0]=-.12*charge+.24*hit;pos.z=.16*charge;pos.y=-.27*hit
  if arm:r[1]=-side*(1.18*charge-.28*hit)*(.75 if lower else 1);r[0]=-.55*charge+.68*hit
  if wing:r[2]=-side*.18*charge
  if label=='head':r[0]=-.18*charge+.24*hit
 elif suffix=='shadow-wings':
  if label=='body':r[2]=.13*charge-.15*hit;pos.z=.20*swell
  if wing:r[2]=side*(.52*charge-.78*hit);r[1]=side*(.19*charge+.15*hit)
  if arm:r[1]=side*.25*charge;r[2]=-side*.25*hit
  if label=='head':r[0]=.11*hit
 elif suffix in ['death-stars','cast']:
  if arm:r[1]=-side*(.50 if lower else 1.02)*hold;r[0]=-.38*hold;r[2]=side*.18*hold
  if label=='body':pos.z=.14*swell;r[0]=-.055*hold
  if label=='head':r[0]=-.16*hold
  if label=='stars':pos.z=.70*hold;r[2]=.65*hold;scale=[1+.16*hold]*3
  if label=='halo':r[2]=-.20*hold
 elif suffix=='four-hands':
  if arm:r[1]=-side*(.85 if lower else -.35)*hold;r[0]=(.72 if lower else -.72)*hold;r[2]=side*.42*hold
  if wing:r[2]=-side*.26*hold
  if label=='body':pos.z=.12*hold;r[2]=.08*math.sin(t*math.tau)*hold
  if label=='stars':r[2]=math.pi*.5*hold;scale=[1+.26*hold]*3
  if label=='head':r[0]=-.10*hold
 elif suffix=='soul-chains':
  if arm:r[1]=-side*(.60 if lower else .25)*hold;r[2]=-side*.88*hold;r[0]=.23*hold
  if label=='body':r[0]=.12*hold;pos.y=-.20*hold
  if wing:r[2]=side*.16*hold
  if label=='stars':scale=[1-.18*hold]*3;r[2]=-.34*hold
 elif suffix=='black-sun':
  if arm:r[1]=-side*(.90 if lower else 1.40)*hold;r[0]=-.30*hold;r[2]=-side*.25*hold
  if label=='body':r[0]=-.10*hold;pos.z=.18*hold
  if label=='head':r[0]=-.28*hold
  if wing:r[2]=-side*.42*hold
  if label=='stars':pos.z=1.00*hold;scale=[1+.36*hold]*3;r[2]=.28*hold
  if label=='halo':pos.z=.18*hold;r[2]=-.3*hold
 elif suffix=='soul-harvest':
  reach=ease(t/.20)*(1-ease((t-.72)/.28));pull=ease((t-.22)/.28)*(1-ease((t-.68)/.32))
  if arm:r[2]=-side*(.90*reach-.58*pull);r[1]=-side*(.20*reach+.55*pull);r[0]=.55*reach-.70*pull
  if label=='body':r[0]=.17*reach-.28*pull;pos.y=-.14*reach+.18*pull
  if wing:r[2]=side*.28*pull
  if label=='head':r[0]=.12*reach-.22*pull
  if label=='stars':scale=[1+.25*reach-.4*pull]*3;r[2]=-.5*pull
 elif suffix=='death-clones':
  if arm:r[1]=-side*(.65 if lower else -.22)*hold;r[2]=side*.25*hold;r[0]=(.38 if lower else -.4)*hold
  if label=='body':pos.z=.26*hold;r[2]=.18*math.sin(t*math.tau)*hold
  if wing:r[2]=-side*.56*hold
  if label=='head':r[0]=-.12*hold
  if label=='stars':r[2]=math.tau*t*hold;scale=[1+.40*hold]*3
  if label=='halo':r[2]=-math.tau*t*hold
 elif suffix=='suits-judgment':
  if arm:r[1]=-side*(.80 if lower else 1.12)*hold;r[2]=-side*.95*hold;r[0]=(.3 if lower else -.25)*hold
  if label=='body':r[0]=-.10*hold;pos.z=.24*hold
  if label=='head':r[0]=-.22*hold
  if wing:r[2]=-side*.32*hold
  if label=='stars':r[2]=math.pi*.25*hold;scale=[1+.12*hold]*3
  if label=='halo':pos.z=.35*hold
 elif suffix=='realm-transition':
  if arm:r[1]=-side*(.90 if lower else -.18)*hold;r[2]=side*.60*hold;r[0]=-.25*hold
  if label=='body':pos.z=.45*hold;r[0]=-.07*hold
  if wing:r[2]=-side*.72*hold;r[1]=side*.12*hold
  if label=='head':r[0]=-.22*hold
  if label=='stars':r[2]=-.65*hold;scale=[1+.52*hold]*3
  if label=='halo':r[2]=.42*hold
 elif suffix=='incarnate-transition':
  if arm:r[1]=-side*(.25 if lower else .95)*swell;r[2]=side*.60*swell;r[0]=-.5*swell
  if label=='body':pos.z=.32*swell;r[0]=-.18*swell
  if label=='head':r[0]=-.30*swell
  if wing:r[2]=-side*.82*swell
  if label=='stars':r[2]=math.pi*.7*swell;scale=[1+.55*swell]*3
  if label=='halo':pos.z=.36*swell;scale=[1+.18*swell]*3
 return r,pos,scale
for kind,rig in rigs.items():
 for suffix,frames in frames_by_clip.items():
  clip=kind+'-'+suffix
  for label,obj in rig.items():
   for frame in range(0,frames+1,3):
    t=frame/frames;wave=math.sin(t*math.tau);side=-1 if label.startswith('left') else 1;r=[0,0,0];pos=Vector();scale=[1,1,1]
    if suffix in ['idle','walk']:
     speed=1 if suffix=='idle' else 2
     if label=='body':pos.z=.07*(1-math.cos(t*math.tau));r[1]=wave*.012
     if 'arm' in label:r[0]=wave*.035*speed;r[1]=side*wave*.035
     if label.endswith('wing'):r[2]=side*wave*.045*speed
     if label=='head':r[2]=wave*.025
     if label=='stars':r[2]=wave*.05;pos.z=wave*.05
    elif suffix in ['auto','attack']:
     strike=math.sin(t*math.pi)**2;recover=math.sin(min(t*2,1)*math.pi)
     if label=='body':r[0]=(.10 if suffix=='auto' else -.08)*strike;pos.y=-.22*strike
     if 'arm' in label:r[0]=(.36 if suffix=='auto' else -.40)*strike;r[1]=side*(.18 if suffix=='auto' else -.28)*strike
     if label.endswith('wing'):r[2]=side*(.12 if suffix=='auto' else -.25)*strike
     if label=='head':r[0]=.08*strike
     if label in ['stars','halo']:r[1]=recover*.06
    elif suffix in spell_clips or suffix=='cast':
     r,pos,scale=spell_pose(suffix,label,t,side)
    else:
     p=min(1,t/.8);p=p*p*(3-2*p)
     if label=='body':r[0]=.35*p;r[1]=.35*p;scale[2]=1-.86*p;pos.z=-2.9*p
     if 'arm' in label:r[1]=side*.4*p
     if label.endswith('wing'):r[2]=side*.7*p
     if label=='head':r[0]=.35*p
    obj.rotation_euler=r;obj.location=bases[kind][label]+pos;obj.scale=scale
    for field in ['rotation_euler','location','scale']:obj.keyframe_insert(data_path=field,frame=frame)
   action=obj.animation_data.action;action.name=clip+'-'+label
   for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
    for key in curve.keyframe_points:key.interpolation='LINEAR'
   track=obj.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,0,action);strip.extrapolation='NOTHING';obj.animation_data.action=None
   obj.location=bases[kind][label];obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)
  # Bake ground correction once; playback never needs positional compensation.
  for obj in rig.values():
   for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
  action=bpy.data.actions[clip+'-body'];curves=action.layers[0].strips[0].channelbag(action.slots[0]).fcurves;height=next(c for c in curves if c.data_path=='location' and c.array_index==2)
  values=[]
  for frame in range(frames+1):
   scene.frame_set(frame);bpy.context.view_layer.update();bottom=min((o.matrix_world@v.co).z for o in roots[kind].children_recursive if o.type=='MESH' for v in o.data.vertices)
   values.append(height.evaluate(frame)+(-bottom if suffix=='death' and frame>=frames*.8 else max(0,-bottom)))
  height.keyframe_points.clear()
  for frame,value in enumerate(values):height.keyframe_points.insert(frame,value,options={'FAST'}).interpolation='LINEAR'
  height.update()
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=False
scene.frame_set(0)
# Reward silhouettes are extracted from the same source, with explicit attachment origins.
extras={
'apostle-wings':([*parts['left-wing'],*parts['right-wing']],Vector((0,.35,4.2-ground)),.42),
'apostle-crown':([c for c in parts['head'] if c['materials'][0] in ['Horn','Horn_Ridge','Antique_Gold']],Vector((0,0,5-ground)),.32),
'apostle-aura':(parts['stars'],Vector((0,0,3.8-ground)),.38),
'apostle-weapon':([*[c for c in effects if c['first']<170],*weapon_detail],Vector((-2.15,-.75,5-ground)),.4),
}
for name,(components,pivot,scale) in extras.items():
 root=bpy.data.objects.new(name,None);scene.collection.objects.link(root);mesh=mesh_part(name+'-mesh',components,pivot,'horned-apostle','stars',scale);mesh.parent=root;roots[name]=root;root['attachment_origin']=name
OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_force_sampling=True,export_cameras=False,export_lights=False,export_extras=True)
# Core GLB, no decoder dependency: prune/deduplicate source meshes and animation buffers.
with tempfile.TemporaryDirectory(prefix='apostle-') as tmp:
 cli=['npx','--yes','@gltf-transform/cli@4.5.0'];dedup=str(Path(tmp)/'dedup.glb')
 sampled=str(Path(tmp)/'resampled.glb')
 subprocess.run(cli+['resample',str(OUT),sampled],check=True);subprocess.run(cli+['dedup',sampled,dedup],check=True);subprocess.run(cli+['prune',dedup,str(OUT),'--keep-leaves','true'],check=True)
# Save a useful Blender inspection layout after exporting ground-origin runtime roots.
for n,kind in enumerate(rigs):roots[kind].location.x=(n-1)*8
for kind,root in roots.items():
 for obj in [root,*root.children_recursive]:obj.hide_set(kind not in rigs);obj.select_set(False)
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  view=area.spaces.active;view.region_3d.view_perspective='ORTHO';view.region_3d.view_location=(0,0,3.5);view.region_3d.view_distance=25;view.region_3d.view_rotation=Vector((0,29,-6)).to_track_quat('-Z','Y');view.shading.type='MATERIAL';view.shading.use_scene_world=False;view.shading.use_scene_lights=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/horned-apostle/horned-apostle-rigged.blend'))
if '--render' in sys.argv:
 # Contact sheet from the actual exported hierarchy (no reference image substitution).
 for kind,root in roots.items():
  for obj in [root,*root.children_recursive]:obj.hide_render=kind not in rigs
 for n,(kind,root) in enumerate((k,r) for k,r in roots.items() if k in rigs):root.location=(n*8-8,0,0)
 scene.render.engine='CYCLES';scene.render.threads_mode='FIXED';scene.render.threads=4;scene.cycles.samples=24;scene.cycles.use_denoising=True
 scene.render.resolution_x=1800;scene.render.resolution_y=900;scene.render.resolution_percentage=100
 world=bpy.data.worlds.new('Apostle inspection world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.045,.03,.09,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
 bpy.ops.object.camera_add(location=(8,-29,13));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,3.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=26;scene.camera=camera
 for name,loc,power,size in [('Key',(-6,-10,15),2600,12),('Rim',(8,5,12),1800,8)]:
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=loc;light.rotation_euler=(Vector((0,0,3))-light.location).to_track_quat('-Z','Y').to_euler()
 scene.render.film_transparent=False;scene.view_settings.view_transform='AgX';scene.render.filepath=str(ROOT/'assets/source/horned-apostle/apostle-runtime-variants.png');bpy.ops.render.render(write_still=True)
print('APOSTLE_EXPORT',OUT,OUT.stat().st_size,'bytes; detailed source geometry, 3 rigs,',len(frames_by_clip)*3,'clips, 4 reward attachments')
